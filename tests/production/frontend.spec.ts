import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type Response, type TestInfo } from '@playwright/test';
import { retireWebGlPage } from '../browser/webgl-cleanup';

test.afterEach(async ({ page }) => { await retireWebGlPage(page); });

const isBackend = (url: URL) => /^\/(?:solar\/(?:physics|realtime)|health)$/.test(url.pathname)
  || /^\/(?:trajectory|mission)\//.test(url.pathname);

async function captureBrowserEvidence(page: Page, baseURL: string, browserVersion: string) {
  const origin = new URL(baseURL).origin;
  const requests: { url: string; type: string }[] = [];
  const responses: { url: string; status: number; contentType: string }[] = [];
  const failedRequests: { url: string; error: string | null }[] = [];
  const denied: { url: string; scope: 'backend' | 'external'; status: number }[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: { text: string; url: string }[] = [];
  const assetResponses: Response[] = [];
  const evidence: Record<string, unknown> = {
    previewOrigin: origin, browserVersion,
    interceptionScope: {
      backend: ['/solar/physics', '/solar/realtime', '/health', '/trajectory/*', '/mission/*'],
      external: 'All external HTTP(S) service and font requests',
      localAssets: 'Real preview responses; never replaced',
    },
    requests, responses, failedRequests, denied, pageErrors, consoleErrors,
  };
  page.on('request', request => requests.push({ url: request.url(), type: request.resourceType() }));
  page.on('response', response => {
    responses.push({ url: response.url(), status: response.status(), contentType: response.headers()['content-type'] ?? '' });
    if (new URL(response.url()).origin === origin && !isBackend(new URL(response.url()))) assetResponses.push(response);
  });
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? null }));
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push({ text: message.text(), url: message.location().url });
  });

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

  return { origin, requests, responses, failedRequests, denied, pageErrors, consoleErrors, assetResponses, evidence };
}

type BrowserEvidence = Awaited<ReturnType<typeof captureBrowserEvidence>>;

function assertBrowserHealth(record: BrowserEvidence, intentionalGraphicsFailure = false) {
  const { origin, requests, responses, failedRequests, denied, pageErrors, consoleErrors } = record;
  expect(requests.filter(request => /^\/(?:src|@vite|node_modules|tests|fixtures)\//.test(new URL(request.url).pathname))).toEqual([]);
  expect(responses.filter(response => new URL(response.url).origin === origin && !isBackend(new URL(response.url)) && response.status >= 400), 'unexpected local asset failures').toEqual([]);
  expect(failedRequests.filter(request => new URL(request.url).origin === origin && !isBackend(new URL(request.url))), 'local asset downloads must succeed').toEqual([]);
  expect(pageErrors, 'uncaught application exceptions, including recovery').toEqual([]);
  // Service denial is intentional; it must not hide an unrelated runtime error.
  const unexpected = consoleErrors.filter(error => {
    if (denied.some(request => request.url === error.url) && /^Failed to load resource:.*503/.test(error.text)) return false;
    if (intentionalGraphicsFailure && /^(?:THREE\.WebGLRenderer: Error creating WebGL context\.|\[visualization\] initialization failed: Error: Error creating WebGL context\.)$/.test(error.text.split('\n')[0])) return false;
    return true;
  });
  expect(unexpected, 'unexpected console errors').toEqual([]);
}

async function loadCompiledApp(page: Page) {
  const document = await page.goto('/?renderScale=0.5&maxPixelRatio=1');
  expect(document?.ok()).toBe(true);
  await expect(page.locator('#space-canvas')).toHaveAttribute('data-orbital-worker', 'ready', { timeout: 60_000 });
  await expect(page.locator('#status-catalog')).toHaveAttribute('data-catalog-state', 'verified', { timeout: 60_000 });
  await expect(page.locator('#status-zoom')).toHaveText(/^Range · (?!—).+ AU$/);
  await expect(page.locator('#renderer-unavailable')).toBeHidden();
}

async function auditDocument(page: Page, info: TestInfo, state: string) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  const results = await new AxeBuilder({ page }).withTags(tags).analyze();
  await info.attach(`axe-${state}`, {
    contentType: 'application/json',
    body: JSON.stringify({ state, tags, scope: 'full document; compiled application',
      browserVersion: page.context().browser()?.version(), viewport: page.viewportSize(), results }, null, 2),
  });
  if (results.incomplete.length > 0) info.annotations.push({
    type: 'accessibility-needs-review',
    description: `${state}: ${results.incomplete.map(rule => rule.id).join(', ')}; inspect attachment`,
  });
  expect(results.testEngine.version).toBe('4.11.1');
  expect(results.passes.length).toBeGreaterThan(0);
  const evaluated = [...results.passes, ...results.violations, ...results.incomplete].map(rule => rule.id);
  for (const rule of ['document-title', 'html-has-lang', 'button-name', 'color-contrast']) expect(evaluated).toContain(rule);
  expect(results.violations, `${state}: automatically detected WCAG violations`).toEqual([]);
  expect(results.incomplete.filter(rule => rule.id === 'aria-prohibited-attr')).toEqual([]);
}

async function expandPanelDisclosures(page: Page) {
  for (const disclosure of await page.locator('#control-panel .panel-disclosure').all()) {
    if (!(await disclosure.evaluate(node => (node as HTMLDetailsElement).open))) await disclosure.locator('summary').click();
  }
}

async function setViewportAndAwaitNativeResize(page: Page, size: { width: number; height: number }) {
  // The emulation command can finish before Chromium delivers its native
  // resize under software rendering. Start state assertions after that input.
  const pending = await page.evaluateHandle(({ width, height }) => {
    let finish!: () => void;
    const done = new Promise<void>(resolve => { finish = resolve; });
    const onResize = () => {
      if (innerWidth !== width || innerHeight !== height) return;
      window.removeEventListener('resize', onResize);
      finish();
    };
    window.addEventListener('resize', onResize);
    return { done, cleanup: () => window.removeEventListener('resize', onResize) };
  }, size);
  try {
    await page.setViewportSize(size);
    await pending.evaluate(async ({ done }) => { await done; });
  } finally {
    await pending.evaluate(({ cleanup }) => cleanup());
    await pending.dispose();
  }
}

async function expectReachableTarget(target: Locator) {
  await expect(target).toBeEnabled();
  // Scroll the real DOM immediately; Playwright's stability wait can starve
  // against the continuously rendered software-GPU canvas at this viewport.
  await target.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
  const { rect, viewport, hits } = await target.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const { x, y, width, height, right, bottom } = bounds;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    // Check inside the border at every edge, as well as the center. Bounds
    // alone miss ancestor clipping; center-only hits miss partially clipped UI.
    const points = [[centerX, centerY], [x + 1, centerY], [right - 1, centerY], [centerX, y + 1], [centerX, bottom - 1]];
    const visible = window.visualViewport;
    return {
      rect: { x, y, width, height, right, bottom },
      viewport: { x: visible?.offsetLeft ?? 0, y: visible?.offsetTop ?? 0, width: visible?.width ?? innerWidth, height: visible?.height ?? innerHeight },
      hits: points.map(([px, py]) => {
        const hit = document.elementFromPoint(px, py);
        return hit === element || (hit !== null && element.contains(hit));
      }),
    };
  });
  expect(rect.width).toBeGreaterThanOrEqual(44 - 0.001);
  expect(rect.height).toBeGreaterThanOrEqual(44 - 0.001);
  expect(rect.x).toBeGreaterThanOrEqual(viewport.x - 1);
  expect(rect.y).toBeGreaterThanOrEqual(viewport.y - 1);
  expect(rect.right).toBeLessThanOrEqual(viewport.x + viewport.width + 1);
  expect(rect.bottom).toBeLessThanOrEqual(viewport.y + viewport.height + 1);
  expect(hits, 'center and all four edge midpoints must receive pointer events').toEqual([true, true, true, true, true]);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

test('compiled artifact loads real bundles, worker, verified catalog and legal notice', async ({ page, browser, baseURL }, testInfo) => {
  const record = await captureBrowserEvidence(page, baseURL!, browser.version());
  const { origin, requests, responses, failedRequests, pageErrors, assetResponses, evidence } = record;

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
    assertBrowserHealth(record);
  } finally {
    await testInfo.attach('compiled-startup-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  }
});

// Catches lost camera bindings, noisy search announcements and missing engine
// resolver composition. Engine unit tests separately prove event mathematics.
test('compiled controls preserve camera, search and resolved event selection', async ({ page, browser, baseURL }, info) => {
  const record = await captureBrowserEvidence(page, baseURL!, browser.version());
  try {
    await loadCompiledApp(page);
    await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Resume simulation', exact: true })).toHaveAttribute('aria-pressed', 'true');

    const range = page.locator('#status-zoom');
    const canvas = page.getByLabel('Solar system visualization', { exact: true });
    const beforeKeyboard = await range.textContent();
    await canvas.focus();
    await page.keyboard.press('+');
    await expect(range).not.toHaveText(beforeKeyboard!);
    await page.getByText('Camera controls', { exact: true }).click();
    const beforeButton = await range.textContent();
    const zoomIn = page.getByRole('button', { name: 'Zoom in', exact: true });
    await zoomIn.click();
    await expect(range).not.toHaveText(beforeButton!);
    await expect(zoomIn).toBeFocused();

    await canvas.focus();
    const beforeShortcuts = await range.textContent();
    const prevented = await canvas.evaluate(async element => {
      const results = [];
      for (const modifier of ['ctrlKey', 'metaKey']) for (const key of ['+', '-', 'ArrowLeft']) {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, [modifier]: true });
        element.dispatchEvent(event);
        results.push(event.defaultPrevented);
      }
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      return results;
    });
    expect(prevented, 'ordinary Ctrl/Meta combinations must remain available to the browser').toEqual([false, false, false, false, false, false]);
    await expect(range).toHaveText(beforeShortcuts!);

    const search = page.getByRole('searchbox', { name: 'Find a major body', exact: true });
    const bodies = page.getByLabel('Major bodies', { exact: true });
    await bodies.selectOption('earth');
    await search.fill('not-a-body');
    await expect(bodies).toBeDisabled();
    for (const name of ['Focus', 'Follow']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Free cam', exact: true })).toBeEnabled();
    await expect(page.locator('#body-info')).toBeHidden();
    await expect(page.locator('#body-empty-state')).toBeVisible();
    await search.press('Escape');
    await expect(search).toHaveValue('');
    await expect(bodies).toBeEnabled();
    await expect(bodies).toHaveValue('earth');
    await expect(page.locator('#body-info-name')).toHaveText('Earth');
    await expect(page.locator('#control-panel')).toBeVisible();
    await search.press('Escape');
    await expect(page.locator('#control-panel')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Open simulation controls', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Open simulation controls', exact: true }).click();

    const cameraFocus = await page.locator('#status-focus').textContent();
    await search.fill('Earth');
    await expect(bodies).toHaveValue('earth');
    await expect(page.locator('#body-info-name')).toHaveText('Earth');
    await expect(page.locator('#body-match-count')).toHaveText('1 body');
    const countChanges = await page.locator('#body-match-count').evaluateHandle(element => {
      const changes: string[] = [];
      const observer = new MutationObserver(() => changes.push(element.textContent ?? ''));
      observer.observe(element, { childList: true, characterData: true, subtree: true });
      return { changes, disconnect: () => observer.disconnect() };
    });
    try {
      await search.fill('Sun');
      await expect(bodies).toHaveValue('sun');
      await expect(page.locator('#body-info-name')).toHaveText('Sun');
      await expect(page.locator('#body-match-count')).toHaveText('1 body');
      expect(await countChanges.evaluate(observation => observation.changes)).toEqual([]);
    } finally {
      await countChanges.evaluate(observation => observation.disconnect());
      await countChanges.dispose();
    }
    await expect(page.locator('#status-focus')).toHaveText(cameraFocus!);

    await page.locator('summary[aria-controls="cataclysm-controls"]').click();
    const source = page.getByLabel('SMBH source', { exact: true });
    const preset = page.getByLabel('Event preset', { exact: true });
    const model = page.getByLabel('Propagation model', { exact: true });
    const status = page.locator('#experiment-status');
    await source.selectOption('M87');
    await expect(source).toHaveValue('M87');
    await preset.selectOption('SgrA_WarpWave_H29');
    await expect(preset).toHaveValue('SgrA_WarpWave_H29');
    await expect(source).toHaveValue('SagittariusA');
    await expect(model).toHaveValue('h29');
    await expect(status).toHaveAttribute('data-model', 'speculative');
    await expect(status).toContainText('canonical orbits unchanged');
    await page.getByRole('button', { name: 'Trigger H29 slipstream', exact: true }).click();

    await source.selectOption('M87');
    await expect(preset).toHaveValue('');
    await expect(source).toHaveValue('M87');
    await expect(model).toHaveValue('h29');
    await expect(page.getByRole('button', { name: 'Trigger H29 slipstream', exact: true })).toBeEnabled();
    // Reselect before changing the model so its independent clear behavior is proved.
    await preset.selectOption('SgrA_WarpWave_H29');
    await model.selectOption('compound');
    await expect(preset).toHaveValue('');
    await expect(model).toHaveValue('compound');
    await expect(status).toHaveAttribute('data-model', 'standard');
    await expect(status).toContainText('Standard compound transport');
    await page.getByRole('button', { name: 'Trigger compound shockwave', exact: true }).click();
    await expandPanelDisclosures(page);
    await auditDocument(page, info, 'compiled-desktop-expanded');
    assertBrowserHealth(record);
  } finally {
    await info.attach('compiled-interaction-evidence', { body: JSON.stringify(record.evidence, null, 2), contentType: 'application/json' });
  }
});

// Catches an apparently open drawer that leaves focus outside, stale modality
// across breakpoints, and controls that exist but cannot be reached at reflow.
test('compiled mobile drawer restores focus across desktop breakpoints', async ({ page, browser, baseURL }, info) => {
  const record = await captureBrowserEvidence(page, baseURL!, browser.version());
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadCompiledApp(page);
    const toggle = page.getByRole('button', { name: 'Open simulation controls', exact: true });
    const panel = page.getByRole('dialog', { name: 'Sun Model Lab', exact: true });
    const close = page.getByRole('button', { name: 'Close simulation controls', exact: true });
    const viewport = page.locator('#viewport-shell');
    const canvas = page.getByLabel('Solar system visualization', { exact: true });
    await expect(page.locator('#control-panel')).toBeHidden();
    await toggle.click();
    await expect(panel).toBeVisible();
    await expect(close).toBeFocused();
    await expect(viewport).toHaveJSProperty('inert', true);
    await expect(viewport).toHaveAttribute('aria-hidden', 'true');
    await canvas.focus();
    await expect(close).toBeFocused();
    await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
    await close.click();
    await expect(toggle).toBeFocused();
    await expect(page.locator('#control-panel')).toBeHidden();
    await expect(viewport).toHaveJSProperty('inert', false);
    await toggle.click();
    await expect(close).toBeFocused();

    await setViewportAndAwaitNativeResize(page, { width: 1440, height: 900 });
    await expect(page.locator('#control-panel')).toBeVisible();
    await expect(page.locator('#control-panel')).not.toHaveAttribute('aria-modal', 'true');
    await expect(viewport).toHaveJSProperty('inert', false);
    await expect(viewport).not.toHaveAttribute('aria-hidden', 'true');
    await canvas.focus();
    await expect(canvas).toBeFocused();
    await setViewportAndAwaitNativeResize(page, { width: 390, height: 844 });
    await expect(panel).toBeVisible();
    await expect(close).toBeFocused();
    await expect(viewport).toHaveJSProperty('inert', true);
    await expect(viewport).toHaveAttribute('aria-hidden', 'true');
    await expandPanelDisclosures(page);
    await auditDocument(page, info, 'compiled-mobile-modal');
    await close.click();
    await expect(toggle).toBeFocused();
    assertBrowserHealth(record);
  } finally {
    await info.attach('compiled-responsive-evidence', { body: JSON.stringify(record.evidence, null, 2), contentType: 'application/json' });
  }
});

test('compiled tiny reflow keeps final action and all camera controls reachable', async ({ page, browser, baseURL }, info) => {
  const record = await captureBrowserEvidence(page, baseURL!, browser.version());
  try {
    await page.setViewportSize({ width: 195, height: 422 });
    await loadCompiledApp(page);
    const toggle = page.getByRole('button', { name: 'Open simulation controls', exact: true });
    const close = page.getByRole('button', { name: 'Close simulation controls', exact: true });
    const canvas = page.getByLabel('Solar system visualization', { exact: true });
    await toggle.click();
    await expect(page.getByRole('dialog', { name: 'Sun Model Lab', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
    await page.locator('summary[aria-controls="cataclysm-controls"]').click();
    const finalAction = page.getByRole('button', { name: 'Trigger compound shockwave', exact: true });
    await expectReachableTarget(finalAction);
    await finalAction.click();
    await expect(finalAction).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await close.click();
    await expect(toggle).toBeFocused();
    await page.getByText('Camera controls', { exact: true }).click();
    await expect(page.locator('#camera-tools')).toHaveAttribute('open', '');
    record.evidence.tinyCamera = await page.locator('#camera-tools').evaluate(element => {
      const shell = document.getElementById('viewport-shell')!;
      return { tools: element.getBoundingClientRect().toJSON(), summary: element.querySelector('summary')!.getBoundingClientRect().toJSON(),
        shell: shell.getBoundingClientRect().toJSON(), shellMaxHeight: getComputedStyle(shell).maxHeight };
    });
    await info.attach('compiled-tiny-camera-expanded', { body: await page.screenshot(), contentType: 'image/png' });
    const cameraButtons = page.locator('#camera-tools button');
    await expect(cameraButtons).toHaveCount(10);
    for (const target of await page.locator('#camera-tools summary, #camera-tools button').all()) await expectReachableTarget(target);
    const beforeZoom = await page.locator('#status-zoom').textContent();
    const zoomOut = page.getByRole('button', { name: 'Zoom out', exact: true });
    // Validate the current hit target, then send real pointer input without
    // waiting for two canvas-starved animation frames in Locator.click().
    const zoomPoint = await expectReachableTarget(zoomOut);
    await page.mouse.click(zoomPoint.x, zoomPoint.y);
    await expect(zoomOut).toBeFocused();
    await expect(page.locator('#status-zoom')).not.toHaveText(beforeZoom!);
    const canvasBounds = await canvas.boundingBox();
    expect(canvasBounds!.height).toBeGreaterThanOrEqual(160);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    assertBrowserHealth(record);
  } finally {
    await info.attach('compiled-tiny-reflow-evidence', { body: JSON.stringify(record.evidence, null, 2), contentType: 'application/json' });
  }
});

// Only the native graphics API is denied; startup, recovery and the drawer are
// the real compiled app. Expected caught diagnostics are recorded separately.
test('compiled no-WebGL recovery exposes reload and an operable accessible drawer', async ({ page, browser, baseURL }, info) => {
  const record = await captureBrowserEvidence(page, baseURL!, browser.version());
  try {
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (['webgl', 'webgl2', 'experimental-webgl'].includes(type)) return null;
        return Reflect.apply(getContext, this, [type, ...args]);
      } as typeof getContext;
    });
    expect((await page.goto('/?renderScale=0.5&maxPixelRatio=1'))?.ok()).toBe(true);
    const recovery = page.getByRole('region', { name: 'Visualization unavailable', exact: true });
    const reload = page.getByRole('button', { name: 'Reload visualization', exact: true });
    await expect(recovery).toBeVisible();
    await expect(recovery.getByRole('alert')).not.toBeEmpty();
    await expect(recovery.getByRole('alert')).toContainText('WebGL');
    await expect(reload).toBeEnabled();
    await expect(reload).toBeFocused();
    await expect(page.locator('#space-canvas')).toHaveJSProperty('inert', true);
    await expect(page.locator('#space-canvas')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#camera-tools')).toBeHidden();
    await expandPanelDisclosures(page);
    for (const control of await page.locator('#control-sections button, #control-sections input, #control-sections select').all()) await expect(control).toBeDisabled();
    await auditDocument(page, info, 'compiled-desktop-recovery');

    await page.setViewportSize({ width: 390, height: 844 });
    const toggle = page.getByRole('button', { name: 'Open simulation controls', exact: true });
    await expect(page.locator('#control-panel')).toBeHidden();
    await reload.focus();
    await expect(reload).toBeFocused();
    await auditDocument(page, info, 'compiled-mobile-recovery');
    await toggle.click();
    await expect(page.getByRole('dialog', { name: 'Sun Model Lab', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close simulation controls', exact: true })).toBeFocused();
    await expect(page.locator('#viewport-shell')).toHaveJSProperty('inert', true);
    await page.keyboard.press('Escape');
    await expect(toggle).toBeFocused();
    await expect(recovery).toBeVisible();
    await reload.focus();
    await expect(reload).toBeFocused();
    // Exercise the real reload action. The init script denies graphics again.
    await Promise.all([page.waitForEvent('domcontentloaded'), reload.click()]);
    await expect(recovery).toBeVisible();
    await expect(reload).toBeFocused();
    await expect(page.locator('#toggle-play')).toBeDisabled();
    const intentional = record.consoleErrors.filter(error => /^(?:THREE\.WebGLRenderer:|\[visualization\] initialization failed:)/.test(error.text));
    record.evidence.intentionalGraphicsFailure = intentional;
    expect(intentional.map(error => error.text.split('\n')[0])).toContain('THREE.WebGLRenderer: Error creating WebGL context.');
    expect(intentional.map(error => error.text.split('\n')[0])).toContain('[visualization] initialization failed: Error: Error creating WebGL context.');
    assertBrowserHealth(record, true);
  } finally {
    await info.attach('compiled-recovery-evidence', { body: JSON.stringify(record.evidence, null, 2), contentType: 'application/json' });
  }
});
