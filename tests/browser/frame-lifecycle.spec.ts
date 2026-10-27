import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';

interface FrameProbe {
  offsetMs: number;
  ticks: Array<{ index: number; jd: number; stepMs: number }>;
  tickCount: number;
  corruptWorker: boolean;
  corruptions: number;
  terminated: number;
  failKuiper: boolean;
  stageFailures: number;
  visibility: Array<{ state: string; trusted: boolean }>;
}
declare global { interface Window { __frameProbe: FrameProbe } }

async function observeApp(page: Page, origin: string) {
  await page.route('**/*', route => new URL(route.request().url()).origin === origin
    ? route.continue()
    : route.fulfill({ status: 503, body: 'Offline frame lifecycle gate', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.addInitScript(() => {
    const probe: FrameProbe = window.__frameProbe = {
      offsetMs: 0, ticks: [], tickCount: 0, corruptWorker: false, corruptions: 0, terminated: 0,
      failKuiper: false, stageFailures: 0, visibility: []
    };
    document.addEventListener('visibilitychange', event => {
      probe.visibility.push({ state: document.visibilityState, trusted: event.isTrusted });
    });
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => raf(timestamp => callback(timestamp + probe.offsetMs));
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', event => {
          if (!probe.corruptWorker || event.data?.type !== 'state') return;
          const bodies = new Float64Array(event.data.bodies);
          const index = (event.data.availability as Uint8Array).findIndex(flag => flag === 1);
          if (index < 0) throw new Error('Real worker delivered no available bodies');
          bodies[index * 6] = NaN;
          event.stopImmediatePropagation();
          probe.corruptions++;
          // Corrupt an otherwise real, current, correctly shaped worker delivery.
          this.onmessage?.(new MessageEvent('message', { data: { ...event.data, bodies } }));
        });
      }
      override postMessage(message: unknown, transferOrOptions: Transferable[] | StructuredSerializeOptions = []) {
        const tick = message as { type?: string; simState?: { julianDate: number; stepMs: number } };
        if (tick.type === 'tick' && tick.simState) {
          probe.ticks.push({ index: ++probe.tickCount, jd: tick.simState.julianDate, stepMs: tick.simState.stepMs });
          if (probe.ticks.length > 256) probe.ticks.shift();
        }
        if (Array.isArray(transferOrOptions)) super.postMessage(message, transferOrOptions);
        else super.postMessage(message, transferOrOptions);
      }
      override terminate() { probe.terminated++; super.terminate(); }
    };
  });
}

async function loaded(page: Page, url: string) {
  await page.goto(`${url}/?uiWidth=500&uiHeight=500&renderScale=0.5&maxPixelRatio=1`);
  await expect(page.locator('#status-zoom')).not.toHaveText('Range · —', { timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => window.__frameProbe.tickCount), { timeout: 30_000 }).toBeGreaterThan(2);
}

test.describe('active app frame lifecycle', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium frame/worker gate');
  test.setTimeout(90_000);

  test('a foreground timestamp stall cannot create an unbounded local simulation jump', async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    await observeApp(page, origin); await loaded(page, origin);
    const before = await page.evaluate(() => {
      const count = window.__frameProbe.tickCount;
      window.__frameProbe.offsetMs += 60_000;
      return count;
    });
    await expect.poll(() => page.evaluate(() => window.__frameProbe.tickCount)).toBeGreaterThan(before + 2);
    const after = await page.evaluate(index => window.__frameProbe.ticks.filter(tick => tick.index > index), before);
    expect(after.length).toBeGreaterThan(0);
    expect(Math.max(...after.map(tick => tick.stepMs))).toBeLessThanOrEqual(100);
    expect(after.every(tick => Number.isFinite(tick.jd))).toBe(true);
    await test.info().attach('foreground-frame-gap', { body: JSON.stringify(after), contentType: 'application/json' });
  });

  test('a nonfinite available worker state is quarantined without stopping the actual scene', async ({ page, baseURL }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const origin = new URL(baseURL!).origin;
    await observeApp(page, origin); await loaded(page, origin);
    await page.locator('#toggle-play').click();
    await page.evaluate(() => { window.__frameProbe.corruptWorker = true; });
    await expect.poll(() => page.evaluate(() => window.__frameProbe.corruptions)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.__frameProbe.terminated)).toBe(1);
    await expect(page.locator('#renderer-unavailable')).toBeHidden();
    await page.locator('#body-search').fill('Earth');
    await expect(page.locator('#body-info-distance')).not.toContainText('NaN');
    const range = await page.locator('#status-zoom').textContent();
    await page.locator('#space-canvas').focus(); await page.keyboard.press('+');
    await expect(page.locator('#status-zoom')).not.toHaveText(range!);
    expect(errors).toEqual([]);
  });

  test('a persistently failing stage cannot starve camera, render, HUD, or later frames', async ({ page, baseURL }) => {
    const errors: string[] = [];
    const reports: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.text().includes('[frame:kuiper]')) reports.push(message.text());
    });
    const origin = new URL(baseURL!).origin;
    await observeApp(page, origin);
    await page.route('**/src/frontend/features/asteroids/kuiperBeltUpdater.ts*', async route => {
      const response = await route.fetch();
      const source = await response.text();
      const body = source.replace(/update\(julianDate(?:: number)?\)(?:: boolean)? \{/, `$&
        if (window.__frameProbe.failKuiper) {
          window.__frameProbe.stageFailures++;
          throw new Error('frame gate persistent Kuiper failure');
        }`);
      expect(body).not.toBe(source);
      await route.fulfill({ response, body });
    });
    await loaded(page, origin);
    const before = await page.evaluate(() => {
      window.__frameProbe.failKuiper = true;
      return window.__frameProbe.tickCount;
    });
    await expect.poll(() => page.evaluate(() => window.__frameProbe.stageFailures)).toBeGreaterThan(2);
    await expect.poll(() => page.evaluate(() => window.__frameProbe.tickCount)).toBeGreaterThan(before + 2);
    const range = await page.locator('#status-zoom').textContent();
    await page.locator('#space-canvas').focus(); await page.keyboard.press('+');
    await expect(page.locator('#status-zoom')).not.toHaveText(range!);
    await expect(page.locator('#renderer-unavailable')).toBeHidden();
    expect(reports).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test('native hidden-tab resume discards hidden elapsed time', async ({ baseURL }) => {
    test.skip(process.env.FRAME_NATIVE_VISIBILITY !== '1', 'Requires an owned native display session, not synthetic visibility');
    // Playwright's normal launch forces focus/visibility in its owning CDP
    // session. A second CDP session cannot disable that override. Connect to
    // our own native browser's default context without those overrides.
    const profile = await mkdtemp(join(tmpdir(), 'solar-frame-visibility-'));
    const chrome = spawn(chromium.executablePath(), [
      '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=0',
      `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
      '--window-size=1440,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'
    ], { stdio: 'ignore' });
    let launchError: Error | undefined;
    const exited = new Promise<void>(resolve => {
      chrome.once('exit', () => resolve());
      chrome.once('error', error => { launchError = error; resolve(); });
    });
    let browser: Browser | undefined;
    try {
      let port = '';
      await expect.poll(async () => {
        if (launchError) throw launchError;
        try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; }
        catch { return false; }
        return Boolean(port);
      }, { timeout: 10_000 }).toBe(true);
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
      const context = browser.contexts()[0];
      const page = await context.newPage(); const origin = new URL(baseURL!).origin;
      await observeApp(page, origin); await loaded(page, origin);
      await page.locator('#time-scale').evaluate((input: HTMLInputElement) => {
        input.value = '120'; input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const sibling = await context.newPage(); await sibling.goto('data:text/html,<title>Frame visibility control</title>');
      await page.bringToFront(); await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
      await sibling.bringToFront(); await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden');
      const before = await page.evaluate(() => {
        window.__frameProbe.offsetMs += 60_000;
        return window.__frameProbe.tickCount;
      });
      await sibling.waitForTimeout(1500);
      expect(await page.evaluate(() => window.__frameProbe.tickCount)).toBe(before);
      await page.bringToFront();
      await expect.poll(() => page.evaluate(() => window.__frameProbe.tickCount)).toBeGreaterThan(before);
      const evidence = await page.evaluate(index => ({
        ticks: window.__frameProbe.ticks.filter(tick => tick.index > index),
        visibility: window.__frameProbe.visibility
      }), before);
      expect(evidence.visibility.some(event => event.state === 'hidden' && event.trusted)).toBe(true);
      expect(evidence.visibility.some(event => event.state === 'visible' && event.trusted)).toBe(true);
      expect(evidence.ticks[0].stepMs).toBe(0);
      expect(evidence.ticks.every(tick => tick.stepMs <= 100)).toBe(true);
      await test.info().attach('native-hidden-tab', { body: JSON.stringify({ browser: browser.version(), ...evidence }), contentType: 'application/json' });
    } finally {
      try { await browser?.close(); }
      finally {
        if (chrome.exitCode === null) chrome.kill('SIGTERM');
        await exited;
        await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
    }
  });
});
