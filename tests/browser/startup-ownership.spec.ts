// Regression: FE-STARTUP-ESCAPE — retire partial startup without losing recovery.
// Found by /qa on 2026-10-24.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { WebGLRenderer } from 'three';

// FE-STARTUP-ESCAPE: actual main, owned browser faults, no production seam.
// Existing constructor/no-WebGL and shader-warmup tests remain separate.
type Mode = 'healthy' | 'early' | 'late';
interface Capture {
  mode: Mode; rendererCreated: number; rendererDisposed: number; renders: number;
  imageDataCalls: number; pixelRatioCalls: number; resizeChecks: number; throws: number;
  workersCreated: number; initPosts: number; workerTerminates: number; workerReady: number;
  observers: Array<{ targets: string[]; disconnects: number }>;
  solarFetches: number; solarAborts: number; solarSignalPresent: boolean;
  phaseFetches: number; phaseAborts: number; keyAdds: number; keyRemoves: number;
  events: string[]; unhandled: string[];
  atThrow?: { rendererCreated: number; pixelRatioCalls: number; resizeChecks: number; workersCreated: number; initPosts: number; solarFetches: number };
}
interface OwnedWindow extends Window {
  __startupOwnership: Capture;
  __startupNotifyQueuedObservers: () => void;
  __THREE_DEVTOOLS__: EventTarget;
}
const startupUrl = '/?uiWidth=500&uiHeight=700&renderScale=0.5&maxPixelRatio=1';
const marker = 'OWNED_STARTUP_ALLOCATION_OR_FINAL_RESIZE_FAILURE';

test.beforeEach(async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'Actual WebGL startup ownership regression');
});
test.setTimeout(60_000);

async function ownStartup(page: Page, mode: Mode, baseURL: string) {
  let releaseCatalog!: () => void;
  let releaseSolar!: () => void;
  const catalogGate = new Promise<void>(resolve => { releaseCatalog = resolve; });
  const solarGate = new Promise<void>(resolve => { releaseSolar = resolve; });
  const held = { catalog: 0, solar: 0 };
  const errors: string[] = [];
  const catalogLogs: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.text().startsWith('[phase-1]')) catalogLogs.push(message.text());
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(baseURL).origin) {
      if (url.pathname === '/data/asteroid-phase1/asteroid_phase1_main_100000.meta.json') {
        held.catalog++; await catalogGate;
      }
      await route.continue(); return;
    }
    if (url.pathname === '/solar/physics') { held.solar++; await solarGate; }
    try {
      await route.fulfill({ status: 503, contentType: 'application/json',
        body: '{"detail":"owned unavailable fixture"}', headers: { 'Access-Control-Allow-Origin': '*' } });
    } catch (error) { if (!page.isClosed()) throw error; }
  });
  await page.addInitScript(({ requestedMode, marker }) => {
    const owned = window as unknown as OwnedWindow;
    const mode: Mode = sessionStorage.getItem('owned-startup-fault-consumed') ? 'healthy' : requestedMode;
    const c: Capture = { mode, rendererCreated: 0, rendererDisposed: 0, renders: 0,
      imageDataCalls: 0, pixelRatioCalls: 0, resizeChecks: 0, throws: 0, workersCreated: 0,
      initPosts: 0, workerTerminates: 0, workerReady: 0, observers: [],
      solarFetches: 0, solarAborts: 0, solarSignalPresent: false, phaseFetches: 0,
      phaseAborts: 0, keyAdds: 0, keyRemoves: 0, events: [], unhandled: [] };
    owned.__startupOwnership = c;
    function fail(kind: 'early' | 'late'): never {
      c.throws++; c.events.push(`${kind}-throw`);
      c.atThrow = { rendererCreated: c.rendererCreated, pixelRatioCalls: c.pixelRatioCalls, resizeChecks: c.resizeChecks,
        workersCreated: c.workersCreated, initPosts: c.initPosts, solarFetches: c.solarFetches };
      sessionStorage.setItem('owned-startup-fault-consumed', '1');
      throw new Error(marker);
    }
    const hook = new EventTarget(); owned.__THREE_DEVTOOLS__ = hook;
    hook.addEventListener('observe', event => {
      const renderer = (event as CustomEvent<WebGLRenderer & { isWebGLRenderer: boolean }>).detail;
      if (!renderer?.isWebGLRenderer) return;
      c.rendererCreated++; c.events.push('renderer-created');
      const render = renderer.render, dispose = renderer.dispose, pixel = renderer.setPixelRatio, ratio = renderer.getPixelRatio;
      renderer.render = function (...args) { c.renders++; return Reflect.apply(render, this, args); };
      renderer.dispose = function () { c.rendererDisposed++; c.events.push('renderer-disposed'); return dispose.call(this); };
      renderer.setPixelRatio = function (value: number) {
        c.pixelRatioCalls++;
        return pixel.call(this, value);
      };
      // Observe the resize check, not an unnecessary write of an unchanged ratio.
      renderer.getPixelRatio = function () {
        c.resizeChecks++;
        if (mode === 'late' && !c.throws && c.workersCreated && c.initPosts && c.solarFetches) fail('late');
        return ratio.call(this);
      };
    });
    const image = CanvasRenderingContext2D.prototype.createImageData;
    CanvasRenderingContext2D.prototype.createImageData = function (this: CanvasRenderingContext2D, ...args: Parameters<typeof image>) {
      c.imageDataCalls++;
      if (mode === 'early' && !c.throws) fail('early');
      return Reflect.apply(image, this, args);
    } as typeof image;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args: ConstructorParameters<typeof NativeWorker>) {
        super(...args); c.workersCreated++; c.events.push('worker-created');
        this.addEventListener('message', event => { if (event.data?.type === 'ready') c.workerReady++; });
      }
      postMessage(message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
        if ((message as { type?: string })?.type === 'init') { c.initPosts++; c.events.push('worker-init-posted'); }
        return Reflect.apply(NativeWorker.prototype.postMessage, this, [message, options]);
      }
      terminate() { c.workerTerminates++; c.events.push('worker-terminated'); return super.terminate(); }
    };
    const NativeObserver = window.ResizeObserver;
    const notify: Array<() => void> = [];
    owned.__startupNotifyQueuedObservers = () => notify.forEach(callback => callback());
    window.ResizeObserver = class extends NativeObserver {
      readonly ownedRecord = { targets: [] as string[], disconnects: 0 };
      constructor(callback: ResizeObserverCallback) {
        super(callback); c.observers.push(this.ownedRecord);
        notify.push(() => callback([], this));
      }
      observe(target: Element, options?: ResizeObserverOptions) {
        this.ownedRecord.targets.push(target.id); return super.observe(target, options);
      }
      disconnect() { this.ownedRecord.disconnects++; return super.disconnect(); }
    };
    const fetch = window.fetch;
    window.fetch = function (input, options) {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
      const signal = options?.signal ?? (input instanceof Request ? input.signal : undefined);
      if (url.pathname === '/solar/physics') {
        c.solarFetches++; c.events.push('solar-fetch-started'); c.solarSignalPresent = Boolean(signal);
        signal?.addEventListener('abort', () => { c.solarAborts++; }, { once: true });
      }
      if (url.pathname.startsWith('/data/asteroid-phase1/')) {
        c.phaseFetches++; signal?.addEventListener('abort', () => { c.phaseAborts++; }, { once: true });
      }
      return Reflect.apply(fetch, this, [input, options]);
    };
    window.addEventListener('unhandledrejection', event => c.unhandled.push(event.reason?.message ?? String(event.reason)));
    const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (...args: Parameters<typeof add>) {
      if (this instanceof HTMLCanvasElement && this.id === 'space-canvas' && args[0] === 'keydown') c.keyAdds++;
      return Reflect.apply(add, this, args);
    };
    EventTarget.prototype.removeEventListener = function (...args: Parameters<typeof remove>) {
      if (this instanceof HTMLCanvasElement && this.id === 'space-canvas' && args[0] === 'keydown') c.keyRemoves++;
      return Reflect.apply(remove, this, args);
    };
  }, { requestedMode: mode, marker });
  return { held, errors, catalogLogs, releaseCatalog, releaseSolar };
}

async function snapshot(page: Page) {
  return page.evaluate(() => ({ ...(window as unknown as OwnedWindow).__startupOwnership,
    recoveryHidden: document.querySelector<HTMLElement>('#renderer-unavailable')!.hidden,
    alert: document.querySelector('#renderer-unavailable [role="alert"]')!.textContent,
    retryFocused: document.activeElement?.id === 'renderer-retry',
    canvasInert: document.querySelector<HTMLCanvasElement>('#space-canvas')!.inert,
    canvasAriaHidden: document.querySelector('#space-canvas')!.getAttribute('aria-hidden'),
    playDisabled: document.querySelector<HTMLButtonElement>('#toggle-play')!.disabled,
    session: document.querySelector('#session-label')!.textContent,
    range: document.querySelector('#status-zoom')!.textContent,
    catalogStatus: document.querySelector('#status-catalog')!.textContent,
  }));
}
async function milestone(page: Page, mode: Mode) {
  await page.waitForFunction(mode => {
    const c = (window as unknown as OwnedWindow).__startupOwnership;
    return mode === 'healthy' ? c.initPosts > 0 && c.solarFetches > 0 && c.resizeChecks >= 2
      : c.throws === 1 && (c.unhandled.length > 0 || !document.querySelector<HTMLElement>('#renderer-unavailable')!.hidden);
  }, mode);
}
async function sharedCatalog(page: Page) {
  return page.evaluate(async () => {
    // A variable import keeps this an actual browser module, not a Node import.
    const url = '/src/sim/phase1AsteroidCatalog.ts';
    const module = await import(/* @vite-ignore */ url);
    const result = await module.loadPhase1AsteroidCatalog({ maxRecords: 100000,
      loadLatencyBudgetMs: module.PHASE1_LOAD_LATENCY_BUDGET_MS, metaUrl: module.PHASE1_CATALOG_META_URL });
    return { accepted: result.accepted, sourceCount: result.sourceCount, loadedCount: result.loadedCount,
      checksum: result.checksumActual, loadMs: result.loadMs };
  });
}
async function attach(testInfo: TestInfo, value: unknown) {
  await testInfo.attach('startup-observation', { body: JSON.stringify(value, null, 2), contentType: 'application/json' });
}
function recovered(c: Awaited<ReturnType<typeof snapshot>>, errors: string[]) {
  expect(c.recoveryHidden).toBe(false); expect(c.alert).toBeTruthy(); expect(c.retryFocused).toBe(true);
  expect(c.canvasInert).toBe(true); expect(c.canvasAriaHidden).toBe('true'); expect(c.playDisabled).toBe(true);
  expect(c.session).toBe('Visualization unavailable'); expect(c.renders).toBe(0);
  expect(errors).toEqual([]); expect(c.unhandled).toEqual([]);
  expect(c.rendererDisposed).toBe(1); expect(c.keyAdds).toBe(c.keyRemoves);
}

test('healthy actual startup accepts the shared catalog and unload retires acquired resources', async ({ page, baseURL }, testInfo) => {
  const owned = await ownStartup(page, 'healthy', baseURL!);
  try {
    await page.goto(startupUrl); await milestone(page, 'healthy');
    const before = await snapshot(page); owned.releaseCatalog();
    const catalog = await sharedCatalog(page);
    await page.waitForFunction(() => (window as unknown as OwnedWindow).__startupOwnership.renders > 2);
    const active = await snapshot(page);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeunload'))); await page.waitForTimeout(100);
    const closed = await snapshot(page); await attach(testInfo, { before, catalog, active, closed, errors: owned.errors, held: owned.held });
    expect(before.rendererCreated).toBe(1); expect(before.renders).toBe(0); expect(before.throws).toBe(0);
    expect(before.workersCreated).toBe(1); expect(before.initPosts).toBe(1); expect(before.solarFetches).toBe(1); expect(before.solarSignalPresent).toBe(true);
    expect(before.observers.map(o => o.targets)).toEqual([['body-list'], ['viewport-shell', 'space-canvas']]);
    expect(owned.held).toEqual({ catalog: 1, solar: 1 }); expect(catalog.accepted).toBe(true); expect(catalog.sourceCount).toBe(100000);
    expect(active.phaseFetches).toBe(2); expect(active.phaseAborts).toBe(0); expect(active.catalogStatus).toContain('100,000 stored rows');
    expect(active.recoveryHidden).toBe(true); expect(active.playDisabled).toBe(false); expect(active.range).not.toBe('Range · —');
    expect(active.renders).toBeGreaterThan(2); expect(owned.errors).toEqual([]); expect(active.unhandled).toEqual([]);
    expect(closed.rendererDisposed).toBe(1); expect(closed.workerTerminates).toBe(1); expect(closed.solarAborts).toBe(1);
    expect(closed.observers.map(o => o.disconnects)).toEqual([1, 1]); expect(closed.keyAdds).toBe(closed.keyRemoves);
  } finally { owned.releaseCatalog(); owned.releaseSolar(); }
});

test('early texture allocation failure recovers and retires the acquired renderer and viewport exactly once', async ({ page, baseURL }, testInfo) => {
  const owned = await ownStartup(page, 'early', baseURL!);
  try {
    await page.goto(startupUrl); await milestone(page, 'early'); const before = await snapshot(page);
    const keyPrevented = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#space-canvas')!; canvas.focus();
      const event = new KeyboardEvent('keydown', { key: '+', code: 'Equal', bubbles: true, cancelable: true });
      canvas.dispatchEvent(event); return event.defaultPrevented;
    });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeunload'))); await page.waitForTimeout(100);
    const closed = await snapshot(page); await attach(testInfo, { before, keyPrevented, closed, errors: owned.errors });
    expect(before.atThrow?.rendererCreated).toBe(1); expect(before.events.slice(0, 2)).toEqual(['renderer-created', 'early-throw']);
    expect(before.throws).toBe(1); recovered(before, owned.errors); expect(keyPrevented).toBe(false);
    expect(closed.rendererDisposed).toBe(1); expect(closed.renders).toBe(0); expect(closed.keyAdds).toBe(closed.keyRemoves);
  } finally { owned.releaseCatalog(); owned.releaseSolar(); }
});

test('later worker and solar startup failure gates late catalog adoption and queued runtime callbacks', async ({ page, baseURL }, testInfo) => {
  const owned = await ownStartup(page, 'late', baseURL!);
  try {
    await page.goto(startupUrl); await milestone(page, 'late'); const before = await snapshot(page);
    owned.releaseCatalog(); const catalog = await sharedCatalog(page); await page.waitForTimeout(100);
    const afterCatalog = await snapshot(page);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('resize'));
      // Controlled delivery of already-registered callbacks, not a new production hook.
      (window as unknown as OwnedWindow).__startupNotifyQueuedObservers();
    });
    await page.waitForTimeout(100); const afterCallbacks = await snapshot(page);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeunload'))); await page.waitForTimeout(100);
    const closed = await snapshot(page);
    await attach(testInfo, { before, catalog, afterCatalog, afterCallbacks, closed, errors: owned.errors, catalogLogs: owned.catalogLogs, held: owned.held });
    expect(before.atThrow?.rendererCreated).toBe(1); expect(before.atThrow?.pixelRatioCalls).toBeGreaterThanOrEqual(1);
    expect(before.atThrow?.resizeChecks).toBeGreaterThanOrEqual(2);
    expect(before.atThrow?.workersCreated).toBe(1); expect(before.atThrow?.initPosts).toBe(1); expect(before.atThrow?.solarFetches).toBe(1);
    expect(before.events.indexOf('late-throw')).toBeGreaterThan(before.events.indexOf('worker-init-posted'));
    expect(before.events.indexOf('late-throw')).toBeGreaterThan(before.events.indexOf('solar-fetch-started'));
    expect(before.observers.map(o => o.targets)).toEqual([['body-list'], ['viewport-shell', 'space-canvas']]);
    expect(before.solarSignalPresent).toBe(true); expect(before.solarFetches).toBe(1);
    expect(owned.held.catalog).toBe(1);
    // A correctly aborted native fetch may never reach Playwright's route callback.
    // Acquisition/retirement is proved by the forwarded fetch and its native signal.
    expect(owned.held.solar).toBeGreaterThanOrEqual(0); expect(owned.held.solar).toBeLessThanOrEqual(1);
    expect(afterCatalog.solarFetches).toBe(1); expect(closed.solarFetches).toBe(1);
    expect(catalog.accepted).toBe(true); expect(catalog.sourceCount).toBe(100000); expect(afterCatalog.phaseFetches).toBe(2); expect(afterCatalog.phaseAborts).toBe(0);
    recovered(before, owned.errors); expect(before.workerTerminates).toBe(1); expect(before.solarAborts).toBe(1);
    expect(before.observers.map(o => o.disconnects)).toEqual([1, 1]);
    expect(afterCatalog.catalogStatus).toBe(before.catalogStatus); expect(owned.catalogLogs.some(text => text.includes('Loaded deterministic catalog'))).toBe(false);
    expect(afterCatalog.renders).toBe(0); expect(afterCallbacks.renders).toBe(0); expect(closed.renders).toBe(0);
    expect(afterCallbacks.pixelRatioCalls).toBe(afterCatalog.pixelRatioCalls);
    expect(afterCallbacks.resizeChecks).toBe(afterCatalog.resizeChecks);
    expect(afterCallbacks.solarFetches).toBe(afterCatalog.solarFetches);
    expect(closed.rendererDisposed).toBe(1); expect(closed.workerTerminates).toBe(1); expect(closed.solarAborts).toBe(1);
    expect(closed.observers.map(o => o.disconnects)).toEqual([1, 1]);
  } finally { owned.releaseCatalog(); owned.releaseSolar(); }
});

test('failed startup keeps restoration messaging and actual retry reload usable', async ({ page, baseURL }, testInfo) => {
  const owned = await ownStartup(page, 'late', baseURL!);
  try {
    await page.goto(startupUrl); await milestone(page, 'late'); const failed = await snapshot(page);
    await attach(testInfo, { failed, errors: owned.errors }); recovered(failed, owned.errors);
    // Listener contract only. Existing startup-warmup tests retain native GL loss/restoration coverage.
    await page.evaluate(() => document.querySelector('#space-canvas')!.dispatchEvent(new Event('webglcontextrestored')));
    await expect(page.locator('#renderer-unavailable [role="alert"]')).toContainText('available again');
    await page.waitForTimeout(60); expect((await snapshot(page)).renders).toBe(0);
    owned.releaseCatalog(); owned.releaseSolar();
    await Promise.all([page.waitForEvent('load'), page.locator('#renderer-retry').click()]);
    await page.waitForFunction(() => (window as unknown as OwnedWindow).__startupOwnership.renders > 2);
    const restarted = await snapshot(page); await attach(testInfo, { restarted, errors: owned.errors });
    expect(restarted.mode).toBe('healthy'); expect(restarted.throws).toBe(0); expect(restarted.rendererCreated).toBe(1);
    expect(restarted.recoveryHidden).toBe(true); expect(restarted.playDisabled).toBe(false); expect(restarted.canvasInert).toBe(false);
    expect(restarted.catalogStatus).toContain('100,000 stored rows'); expect(restarted.renders).toBeGreaterThan(2);
    expect(restarted.unhandled).toEqual([]); expect(owned.errors).toEqual([]);
  } finally { owned.releaseCatalog(); owned.releaseSolar(); }
});
