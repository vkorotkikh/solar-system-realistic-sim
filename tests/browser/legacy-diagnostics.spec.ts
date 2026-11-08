// /qa TOOL045 — Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// TOOL045 proposed real-app replacement; NOT executed during read-only design.
// Synthetic endpoint fixtures are diagnostic plumbing, never observed solar data.
const BACKEND = 'http://127.0.0.1:9142';
function physicsFixture(encodedJd: number) {
  return {
    schema: { name: 'solar_physics_state', version: 2 }, epoch_jd_tdb: encodedJd,
    wall_epoch_jd_tdb: encodedJd, jd_time_scale: 'TDB', forcing: 'hybrid', effective_forcing: 'synthetic',
    live_data_requested: true, live_data_enabled: false, fallback_reason: 'disabled_unvalidated',
    forcing_status: { requested: 'hybrid', effective: 'synthetic', observed_input_status: 'disabled_unvalidated',
      runtime_eligible: false, fallback_reason: 'disabled_unvalidated' }, activity_index: 0.42,
  };
}

function realtimeFixture() {
  const unavailable = () => ({ ok: false, error: 'TOOL045 synthetic fixture: no observed input delivered' });
  return {
    schema: { name: 'solar_realtime_endpoint', version: 1 }, source: 'backend',
    snapshot: {
      schema: { name: 'solar_realtime_context', version: 1 }, fetched_at_utc: '2026-10-24T00:00:00Z',
      source_status: { swpc: unavailable(), silso: unavailable(), sdo_aia: unavailable(), gong_synoptic: unavailable() },
      swpc: null, silso: null, sdo_aia: null, gong_synoptic: null, combined_activity_proxy: null,
    },
  };
}

async function observeAndRoute(page: Page, baseURL: string) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const consoleMessages: string[] = [];
  const unexpectedRequests: string[] = [];
  const fixturesServed: string[] = [];
  const origin = new URL(baseURL).origin;
  page.on('console', message => {
    consoleMessages.push(`[${message.type()}] ${message.text()}`);
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    let payload: unknown;
    if (request.method() === 'GET' && url.origin === BACKEND && url.pathname === '/solar/realtime' && url.search === '') {
      payload = realtimeFixture();
      fixturesServed.push('solar realtime: no observed inputs');
    } else if (request.method() === 'GET' && url.origin === BACKEND && url.pathname === '/solar/physics'
      && url.searchParams.has('jd_tdb') && Number.isFinite(Number(url.searchParams.get('jd_tdb')))
      && url.searchParams.get('forcing') === 'hybrid' && url.searchParams.get('live_data') === 'true') {
      payload = physicsFixture(Number(url.searchParams.get('jd_tdb')));
      fixturesServed.push('solar physics: synthetic hybrid fallback at requested epoch');
    } else {
      unexpectedRequests.push(`${request.method()} ${url.href}`);
      return route.abort('blockedbyclient');
    }
    return route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': origin }, body: JSON.stringify(payload) });
  });
  return { consoleErrors, pageErrors, consoleMessages, unexpectedRequests, fixturesServed };
}

async function openRealApp(page: Page) {
  const response = await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  expect(response, 'navigation must produce an HTTP response').not.toBeNull();
  expect(response!.ok(), 'navigation must succeed, not yield a misleading screenshot').toBe(true);
  await expect(page.locator('#status-zoom')).not.toHaveText('Range · —', { timeout: 60_000 });
  await expect(page.locator('#renderer-unavailable')).toBeHidden();
  await expect(page.locator('canvas')).toBeVisible();
}

async function retainAttachment(testInfo: TestInfo, name: string, attachment: { contentType: string; body: Buffer }) {
  await writeFile(testInfo.outputPath(name), attachment.body);
  await testInfo.attach(name, attachment);
}

async function saveDiagnostics(testInfo: TestInfo, state: Awaited<ReturnType<typeof observeAndRoute>>) {
  await retainAttachment(testInfo, 'diagnostic-context.json', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
    fixtureScope: 'TOOL045 synthetic endpoint fixtures; no provider, hardware or science accuracy acceptance', ...state,
  }, null, 2)) });
}

function assertNoErrors(state: Awaited<ReturnType<typeof observeAndRoute>>) {
  expect(state.unexpectedRequests, 'unrecognized external requests are blocked, never silently mocked').toEqual([]);
  expect(state.consoleErrors, 'application console.error remains a failure channel').toEqual([]);
  expect(state.pageErrors, 'uncaught page errors remain a failure channel').toEqual([]);
}

test('legacy named H29 trigger and error window [TOOL045 warp]', async ({ page, browserName, baseURL }, testInfo) => {
  test.skip(browserName !== 'chromium', 'compatibility diagnostics deliberately target configured Chromium only');
  test.setTimeout(90_000);
  expect(baseURL).toBeTruthy();
  const state = await observeAndRoute(page, baseURL!);
  try {
    await openRealApp(page);
    await page.locator('.panel-disclosure--danger summary').click();
    await page.locator('#agn-preset').selectOption('SgrA_WarpWave_H29');
    await expect(page.locator('#agn-preset')).toHaveValue('SgrA_WarpWave_H29');
    await page.locator('#agn-hypothesis').selectOption('h29');
    await expect(page.locator('#agn-hypothesis')).toHaveValue('h29');
    await expect(page.locator('#trigger-agn-shockwave')).toHaveText('Trigger H29 slipstream');
    await page.locator('#trigger-agn-shockwave').click();
    await page.waitForTimeout(10_000); // Deliberately retain the legacy post-trigger error window.
    assertNoErrors(state);
  } finally { await saveDiagnostics(testInfo, state); }
});

test('legacy realistic scale captures and raw center diagnostics [TOOL045 scale]', async ({ page, browserName, baseURL }, testInfo) => {
  test.skip(browserName !== 'chromium', 'compatibility diagnostics deliberately target configured Chromium only');
  // CI run 41421716040: full-resolution SwiftShader screenshots took 21.2s
  // and 25.1s, UI clicks 29s, and the legacy observation windows 13s. The
  // second screenshot finished at 92.2s, before readPixels could even start.
  // This is a compatibility diagnostic, not a 90s product performance gate.
  const softwareGpuBudgetMs = 180_000;
  test.setTimeout(softwareGpuBudgetMs);
  const started = Date.now();
  const progress: Array<{ phase: string; startMs: number; elapsedMs?: number; completed: boolean }> = [];
  async function phase<T>(name: string, run: () => Promise<T>): Promise<T> {
    const entry = { phase: name, startMs: Date.now() - started, elapsedMs: 0, completed: false };
    progress.push(entry);
    try {
      const result = await test.step(name, run);
      entry.completed = true;
      return result;
    } finally { entry.elapsedMs = Date.now() - started - entry.startMs; }
  }
  async function capture(name: string) {
    const png = await page.screenshot({ path: testInfo.outputPath(name), fullPage: false });
    // Both artifacts retain the actual legacy viewport at native resolution.
    expect([png.readUInt32BE(16), png.readUInt32BE(20)], `${name} PNG dimensions`).toEqual([1280, 800]);
  }
  expect(baseURL).toBeTruthy();
  await page.setViewportSize({ width: 1280, height: 800 });
  const state = await observeAndRoute(page, baseURL!);
  try {
    await phase('load the real app', () => openRealApp(page));
    await phase('open Display controls', async () => {
      await page.locator('summary[aria-controls="display-controls"]').click();
      await expect(page.locator('#display-controls')).toBeVisible();
    });
    const toggle = page.locator('#toggle-realistic-scale');
    await expect(toggle).toHaveCount(1);
    await expect(toggle).not.toBeChecked();
    await phase('legacy default-scale observation window', () => page.waitForTimeout(8_000));
    await phase('capture default scale', () => capture('screenshot_normal_scale.png'));
    await phase('enable realistic scale', async () => {
      await page.locator('label.switch-control').filter({ has: toggle }).click();
      await expect(toggle).toBeChecked();
    });
    await phase('legacy realistic-scale observation window', () => page.waitForTimeout(5_000));
    await phase('capture realistic scale', () => capture('screenshot_realistic_scale.png'));
    const center = await phase('raw 20x20 center readPixels', () => page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { error: 'No canvas found' };
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return { error: 'No rendering context' };
      const w = canvas.width, h = canvas.height;
      const cx = Math.floor(w / 2), cy = Math.floor(h / 2), sampleSize = 20;
      const pixels = new Uint8Array(sampleSize * sampleSize * 4);
      gl.readPixels(cx - sampleSize / 2, cy - sampleSize / 2, sampleSize, sampleSize, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let totalR = 0, totalG = 0, totalB = 0, darkCount = 0;
      const numPixels = sampleSize * sampleSize;
      for (let i = 0; i < numPixels; i++) {
        const r = pixels[i * 4]!, g = pixels[i * 4 + 1]!, b = pixels[i * 4 + 2]!;
        totalR += r; totalG += g; totalB += b;
        if (r < 30 && g < 30 && b < 30) darkCount++;
      }
      return { canvasSize: `${w}x${h}`, avgR: Math.round(totalR / numPixels), avgG: Math.round(totalG / numPixels),
        avgB: Math.round(totalB / numPixels), darkPixelPercent: Math.round((darkCount / numPixels) * 100), sampleCenter: `${cx},${cy}` };
    }));
    await retainAttachment(testInfo, 'realistic-center-diagnostics.json', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
      diagnosticOnly: true, noPixelAccuracyThreshold: true, center,
    }, null, 2)) });
    expect('error' in center, 'center diagnostic requires a real available WebGL canvas').toBe(false);
    assertNoErrors(state);
  } finally {
    await retainAttachment(testInfo, 'scale-progress.json', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
      softwareGpuBudgetMs, elapsedMs: Date.now() - started, viewport: page.viewportSize(),
      renderConfiguration: 'application defaults; no resolution override', progress,
    }, null, 2)) });
    await saveDiagnostics(testInfo, state);
  }
});

test('legacy 1920x1080 debug capture [TOOL045 debug]', async ({ page, browserName, baseURL }, testInfo) => {
  test.skip(browserName !== 'chromium', 'compatibility diagnostics deliberately target configured Chromium only');
  test.setTimeout(90_000);
  expect(baseURL).toBeTruthy();
  await page.setViewportSize({ width: 1920, height: 1080 });
  const state = await observeAndRoute(page, baseURL!);
  try {
    await openRealApp(page);
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: testInfo.outputPath('debug_screenshot_full.png'), fullPage: false });
    assertNoErrors(state);
  } finally { await saveDiagnostics(testInfo, state); }
});
