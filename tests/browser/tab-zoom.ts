import { chromium, expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Only the API surface used inside the extension worker; no ambient app globals.
declare const chrome: {
  tabs: {
    query(query: Record<string, never>): Promise<Array<{ id?: number; url?: string }>>;
    setZoomSettings(id: number, settings: { mode: 'automatic'; scope: 'per-tab' }): Promise<void>;
    setZoom(id: number, factor: number): Promise<void>;
    getZoom(id: number): Promise<number>;
    getZoomSettings(id: number): Promise<{ mode?: string; scope?: string }>;
  };
};

export function zoomMetrics(page: Page) {
  return page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    outerWidth,
    outerHeight,
    dpr: devicePixelRatio,
    visualScale: visualViewport?.scale,
    rootFontSize: getComputedStyle(document.documentElement).fontSize,
    rootZoom: getComputedStyle(document.documentElement).zoom,
    bodyZoom: getComputedStyle(document.body).zoom,
    scrollWidth: document.documentElement.scrollWidth,
  }));
}

type Metrics = Awaited<ReturnType<typeof zoomMetrics>>;

export async function captureNativeZoomScreenshot(page: Page, info: TestInfo, name: string) {
  // Playwright's viewport-derived screenshot clip can crop a genuinely zoomed
  // native window. Capture the browser surface without changing device metrics.
  const cdp = await page.context().newCDPSession(page);
  try {
    const capture = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await info.attach(name, { body: Buffer.from(capture.data, 'base64'), contentType: 'image/png' });
  } finally { await cdp.detach(); }
}

export function assertNativeTabZoom(before: Metrics, after: Metrics, factor: number, apiFactor: number) {
  expect(apiFactor, 'chrome.tabs.getZoom must independently confirm native tab zoom').toBeCloseTo(factor, 10);
  expect(after.dpr / before.dpr).toBeCloseTo(factor, 5);
  expect(Math.abs(after.width * factor - before.width)).toBeLessThanOrEqual(factor);
  expect(Math.abs(after.height * factor - before.height)).toBeLessThanOrEqual(factor);
  expect(after.outerWidth).toBe(before.outerWidth);
  expect(after.outerHeight).toBe(before.outerHeight);
  expect(after.visualScale, 'pinch/page-scale emulation is not browser tab zoom').toBe(1);
  expect(after.rootFontSize).toBe(before.rootFontSize);
  expect(after.rootZoom).toBe(before.rootZoom);
  expect(after.bodyZoom).toBe(before.bodyZoom);
}

export async function createTabZoomSession(info: TestInfo, origin: string) {
  const prefix = info.outputPath('isolated-zoom-profile-');
  await mkdir(dirname(prefix), { recursive: true });
  const profile = await mkdtemp(prefix);
  const extension = fileURLToPath(new URL('./fixtures/tab-zoom-extension', import.meta.url));
  const hardware = process.env.UI_HARDWARE_WEBGL === '1';
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: !hardware && process.env.UI_ZOOM_HEADFUL !== '1',
    viewport: null,
    args: [
      '--no-sandbox', '--window-size=1280,960',
      `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
      ...(hardware
        ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl']
        : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    ],
  }).catch(async (error: unknown) => {
    await rm(profile, { recursive: true, force: true });
    throw error;
  });
  try {
    // Keep actual application modules/assets. External services are deterministic
    // unavailable responses, not provider-delivery or scientific evidence.
    await context.route('**/*', (route) => new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.fulfill({ status: 503, body: 'Offline accessibility zoom gate' }));
    const worker = context.serviceWorkers()[0]
      ?? await context.waitForEvent('serviceworker', { timeout: 15_000 });
    const tabId = (page: Page) => worker.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
      if (typeof tab?.id !== 'number') throw new Error(`No unique local zoom tab for ${url}`);
      return tab.id;
    }, page.url());
    return {
      context,
      page: context.pages()[0] ?? await context.newPage(),
      getZoom: async (page: Page) => worker.evaluate((id) => chrome.tabs.getZoom(id), await tabId(page)),
      setZoom: async (page: Page, factor: number) => worker.evaluate(async ({ id, factor }) => {
        await chrome.tabs.setZoomSettings(id, { mode: 'automatic', scope: 'per-tab' });
        await chrome.tabs.setZoom(id, factor);
        return { factor: await chrome.tabs.getZoom(id), settings: await chrome.tabs.getZoomSettings(id) };
      }, { id: await tabId(page), factor }),
      close: async () => {
        try { await context.close(); }
        finally { await rm(profile, { recursive: true, force: true }); }
      },
    };
  } catch (error) {
    try { await context.close(); }
    finally { await rm(profile, { recursive: true, force: true }); }
    throw error;
  }
}
