import { expect, test, type Response } from '@playwright/test';
import { retireWebGlPage } from '../browser/webgl-cleanup';

// Cover software-GPU context creation as well as application initialization.
test.describe.configure({ timeout: 90_000 });
test.afterEach(async ({ page }) => { await retireWebGlPage(page); });

test('compiled artifact loads real bundles, worker, verified catalog and legal notice', async ({ page, browser, baseURL }, testInfo) => {
  const origin = new URL(baseURL!).origin;
  const isBackend = (url: URL) => /^\/(?:solar\/(?:physics|realtime)|health)$/.test(url.pathname)
    || /^\/(?:trajectory|mission)\//.test(url.pathname);
  const requests: { url: string; type: string }[] = [];
  const responses: { url: string; status: number; contentType: string }[] = [];
  const failedRequests: { url: string; error: string | null }[] = [];
  const denied: { url: string; scope: 'backend' | 'external'; status: number }[] = [];
  const pageErrors: string[] = [];
  const assetResponses: Response[] = [];
  const evidence: Record<string, unknown> = {
    previewOrigin: origin, browserVersion: browser.version(),
    interceptionScope: {
      backend: ['/solar/physics', '/solar/realtime', '/health', '/trajectory/*', '/mission/*'],
      external: 'All external HTTP(S) service and font requests',
      localAssets: 'Real preview responses; never replaced',
    },
    requests, responses, failedRequests, denied, pageErrors,
  };
  page.on('request', request => requests.push({ url: request.url(), type: request.resourceType() }));
  page.on('response', response => {
    responses.push({ url: response.url(), status: response.status(), contentType: response.headers()['content-type'] ?? '' });
    if (new URL(response.url()).origin === origin && !isBackend(new URL(response.url()))) assetResponses.push(response);
  });
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? null }));
  page.on('pageerror', error => pageErrors.push(error.message));

  // Match only backend/external traffic. Local bundles, workers, catalog and
  // textures go straight to preview, without a route handler or fixture body.
  await page.route(url => isBackend(url) || (/^https?:$/.test(url.protocol) && url.origin !== origin), async route => {
    const url = new URL(route.request().url());
    denied.push({ url: url.href, scope: isBackend(url) ? 'backend' : 'external', status: 503 });
    await route.fulfill({
      status: 503, contentType: 'application/json',
      body: '{"detail":"deterministic unavailable service"}',
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  });

  try {
    const document = await page.goto('/?renderScale=0.5&maxPixelRatio=1');
    expect(document?.ok()).toBe(true);
    await expect(page.locator('#space-canvas')).toHaveAttribute('data-orbital-worker', 'ready', { timeout: 60_000 });
    await expect(page.locator('#status-catalog')).toHaveAttribute('data-catalog-state', 'verified', { timeout: 60_000 });
    await expect(page.locator('#status-catalog')).toContainText('100,000 stored rows');
    await expect(page.locator('#status-zoom')).toHaveText(/^Range · (?!—).+ AU$/);
    await expect(page.locator('#renderer-unavailable')).toBeHidden();
    expect(await page.evaluate(() => '__uiFixture' in window)).toBe(false);

    evidence.graphics = await page.locator('#space-canvas').evaluate((canvas: HTMLCanvasElement) => {
      const gl = canvas.getContext('webgl2');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        renderer: gl && debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : null,
        vendor: gl && debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : null,
        userAgent: navigator.userAgent,
      };
    });
    expect(evidence.graphics).toMatchObject({ renderer: expect.any(String), userAgent: expect.any(String) });

    // Status-only or a request event cannot prove a bundle was delivered. Read
    // each required real response to completion and reject SPA HTML fallbacks.
    const requiredAssets = [
      { name: 'main bundle', path: /^\/assets\/index-[\w-]+\.js$/, javascript: true },
      { name: 'worker bundle', path: /^\/assets\/modelWorker-[\w-]+\.js$/, javascript: true },
      { name: 'catalog binary', path: /^\/data\/asteroid-phase1\/asteroid_phase1_main_100000\.bin$/, javascript: false },
      { name: 'catalog metadata', path: /^\/data\/asteroid-phase1\/asteroid_phase1_main_100000\.meta\.json$/, javascript: false },
    ];
    const delivered = [];
    for (const asset of requiredAssets) {
      const response = assetResponses.find(candidate => asset.path.test(new URL(candidate.url()).pathname));
      expect(response, `${asset.name} must have an actual local response`).toBeDefined();
      expect(response!.ok(), `${asset.name} response status`).toBe(true);
      expect(await response!.finished(), `${asset.name} download must finish`).toBeNull();
      const contentType = response!.headers()['content-type'] ?? '';
      expect(contentType).not.toContain('text/html');
      if (asset.javascript) expect(contentType).toMatch(/javascript/);
      const bytes = (await response!.body()).length;
      expect(bytes, `${asset.name} must be nonempty`).toBeGreaterThan(0);
      delivered.push({ name: asset.name, url: response!.url(), bytes, contentType });
    }
    evidence.deliveredAssets = delivered;

    const notice = await page.request.get('/legal/LICENSE.txt');
    const noticeText = await notice.text();
    evidence.legalNotice = { url: notice.url(), status: notice.status(), bytes: Buffer.byteLength(noticeText), contentType: notice.headers()['content-type'] };
    expect(notice.ok()).toBe(true);
    expect(notice.headers()['content-type']).not.toContain('text/html');
    expect(noticeText.trim().length).toBeGreaterThan(0);
    expect(noticeText).not.toMatch(/<!doctype html|<html[\s>]/i);

    const backendRequests = requests.filter(request => isBackend(new URL(request.url)));
    expect(backendRequests.map(request => new URL(request.url).pathname)).toEqual(expect.arrayContaining(['/solar/physics', '/solar/realtime']));
    expect(backendRequests.filter(request => new URL(request.url).origin !== origin), 'build-time backend origin must match preview').toEqual([]);
    expect(requests.filter(request => /^\/(?:src|@vite|node_modules|tests|fixtures)\//.test(new URL(request.url).pathname))).toEqual([]);
    expect(responses.filter(response => new URL(response.url).origin === origin && !isBackend(new URL(response.url)) && response.status >= 400), 'unexpected local asset failures').toEqual([]);
    expect(failedRequests.filter(request => new URL(request.url).origin === origin && !isBackend(new URL(request.url))), 'local asset downloads must succeed').toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await testInfo.attach('compiled-startup-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  }
});
