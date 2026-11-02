import { expect, test, type Page } from '@playwright/test';
import type { InstancedMesh, Object3D, WebGLRenderer } from 'three';

type Mode = 'healthy' | 'early' | 'compile-failure';
interface Capture {
  events: string[]; renderers: number; rendererDisposals: number; renders: number;
  compiles: number; workers: number; workerTerminations: number; images: number;
  beltCounts: number[]; asteroidScale: number | null; quadtreeDisposals: number;
  remainingQuadtreeFaces: number[]; unhandled: string[];
}
interface OwnedWindow extends Window {
  __startupOwnership: Capture;
  __THREE_DEVTOOLS__: EventTarget;
  __startupRemainingFaces: () => number[];
}

// These run the actual application with real catalog data and renderer. Faults
// change only allocation/compile boundaries; no production startup seam exists.
test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'chromium', 'Actual WebGL startup ownership');
});
test.setTimeout(60_000);

async function instrument(page: Page, mode: Mode = 'healthy') {
  const errors: string[] = [], catalogLogs: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.text().startsWith('[phase-1]')) catalogLogs.push(message.text()); });
  // The solar backend is not part of this startup ownership contract.
  await page.route('http://127.0.0.1:9401/solar/**', route => route.fulfill({ status: 503,
    contentType: 'application/json', body: '{"detail":"owned unavailable fixture"}',
    headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.addInitScript(mode => {
    const owned = window as unknown as OwnedWindow;
    const capture: Capture = { events: [], renderers: 0, rendererDisposals: 0, renders: 0,
      compiles: 0, workers: 0, workerTerminations: 0, images: 0, beltCounts: [],
      asteroidScale: null, quadtreeDisposals: 0, remainingQuadtreeFaces: [], unhandled: [] };
    owned.__startupOwnership = capture;
    const trees: Array<{ faces: unknown[]; material: { addEventListener(type: string, callback: () => void): void } }> = [];
    owned.__startupRemainingFaces = () => trees.map(tree => tree.faces.length);
    const hook = new EventTarget(); owned.__THREE_DEVTOOLS__ = hook;
    hook.addEventListener('observe', event => {
      const renderer = (event as CustomEvent<WebGLRenderer & { isWebGLRenderer: boolean }>).detail;
      if (!renderer?.isWebGLRenderer) return;
      capture.renderers++; capture.events.push('renderer');
      const dispose = renderer.dispose, render = renderer.render, compile = renderer.compile;
      renderer.dispose = function () { capture.rendererDisposals++; return dispose.call(this); };
      renderer.render = function (...args) { capture.renders++; return Reflect.apply(render, this, args); };
      renderer.compile = function (...args) {
        capture.compiles++;
        args[0].traverse((object: Object3D) => {
          if (object.userData.isQuadtree) {
            const tree = object.userData.quadtree;
            trees.push(tree);
            tree.material.addEventListener('dispose', () => { capture.quadtreeDisposals++; });
          }
          const mesh = object as InstancedMesh;
          if (!mesh.isInstancedMesh) return;
          capture.beltCounts.push(mesh.count);
          if (mesh.count === 50_000) {
            const matrix = mesh.instanceMatrix.array;
            capture.asteroidScale = Math.hypot(matrix[4], matrix[5], matrix[6]);
          }
        });
        if (mode === 'compile-failure') throw new Error('OWNED_FINAL_COMPILE_FAILURE');
        return Reflect.apply(compile, this, args);
      };
    });
    const image = CanvasRenderingContext2D.prototype.createImageData;
    CanvasRenderingContext2D.prototype.createImageData = function (this: CanvasRenderingContext2D, ...args: Parameters<typeof image>) {
      capture.images++; capture.events.push('image');
      if (mode === 'early') throw new Error('OWNED_TEXTURE_ALLOCATION_FAILURE');
      return Reflect.apply(image, this, args);
    } as typeof image;
    const fetch = window.fetch;
    window.fetch = function (...args) {
      const input = args[0];
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
      if (url.pathname.includes('/asteroid-phase1/')) capture.events.push('catalog-fetch');
      return Reflect.apply(fetch, this, args);
    };
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) { super(...args); capture.workers++; }
      terminate() { capture.workerTerminations++; return super.terminate(); }
    };
    window.addEventListener('unhandledrejection', event => capture.unhandled.push(event.reason?.message ?? String(event.reason)));
  }, mode);
  return { errors, catalogLogs };
}

async function capture(page: Page) {
  return page.evaluate(() => ({ ...(window as unknown as OwnedWindow).__startupOwnership,
    remainingQuadtreeFaces: (window as unknown as OwnedWindow).__startupRemainingFaces() }));
}

async function holdCatalog(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/asteroid_phase1_main_100000.meta.json', async route => {
    await gate; await route.continue();
  });
  return release;
}

async function unload(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
}

test('one source-selected full scene uses the latest scale and retires its quadtree owners on unload', async ({ page }, testInfo) => {
  const observed = await instrument(page);
  const release = await holdCatalog(page);
  try {
    await page.goto('/?renderScale=0.5&maxPixelRatio=1');
    await page.waitForFunction(() => (window as unknown as OwnedWindow).__startupOwnership.images > 0);
    const pending = await capture(page);
    expect(pending.compiles).toBe(0); expect(pending.renders).toBe(0);
    expect(pending.events.indexOf('catalog-fetch')).toBeLessThan(pending.events.indexOf('image'));
    // A user can change this native checkbox while source verification is pending.
    await page.locator('summary[aria-controls="display-controls"]').click();
    await page.locator('label:has(#toggle-realistic-scale)').click();
    await expect(page.locator('#toggle-realistic-scale')).toBeChecked(); release();
    await page.waitForFunction(() => (window as unknown as OwnedWindow).__startupOwnership.renders > 0);
    const active = await capture(page);
    expect(active.renderers).toBe(1); expect(active.compiles).toBe(1);
    expect(active.beltCounts.filter(count => count === 50_000)).toHaveLength(1);
    expect(active.beltCounts).toContain(5_000);
    expect(active.asteroidScale).toBeCloseTo((939.4 / 2) / 149_597_870.7, 9);
    await expect(page.locator('#status-catalog')).toHaveAttribute('data-catalog-state', 'verified');
    await expect(page.locator('#status-catalog')).toContainText('100,000 stored rows');
    await unload(page); await unload(page);
    const closed = await capture(page);
    expect(closed.rendererDisposals).toBe(1); expect(closed.workerTerminations).toBe(1);
    expect(closed.quadtreeDisposals).toBe(2); expect(closed.remainingQuadtreeFaces).toEqual([0, 0]);
    expect(closed.unhandled).toEqual([]); expect(observed.errors).toEqual([]);
    await testInfo.attach('startup-ownership', { body: JSON.stringify({ pending, active, closed, catalogLogs: observed.catalogLogs }), contentType: 'application/json' });
  } finally { release(); }
});

test('rejected catalog builds a single visible procedural fallback scene', async ({ page }) => {
  const observed = await instrument(page);
  await page.route('**/asteroid_phase1_main_100000.meta.json', route => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/?renderScale=0.5&maxPixelRatio=1');
  await page.waitForFunction(() => (window as unknown as OwnedWindow).__startupOwnership.renders > 0);
  await expect(page.locator('#status-catalog')).toHaveAttribute('data-catalog-state', 'fallback');
  const active = await capture(page);
  expect(active.beltCounts.filter(count => count === 50_000)).toHaveLength(1);
  expect(active.beltCounts).toContain(5_000); expect(active.compiles).toBe(1);
  expect(observed.catalogLogs.some(log => log.includes('Acceptance gates failed'))).toBe(true);
  expect(observed.errors).toEqual([]); expect(active.unhandled).toEqual([]);
  await unload(page);
});

test('unload while catalog verification is pending prevents all late renderer adoption', async ({ page }) => {
  const observed = await instrument(page); const release = await holdCatalog(page);
  try {
    await page.goto('/');
    await page.waitForFunction(() => (window as unknown as OwnedWindow).__startupOwnership.images > 0);
    await unload(page);
    expect((await capture(page)).rendererDisposals).toBe(1);
    release();
    // Join the shared bounded loader to observe actual late success, not a sleep.
    await page.evaluate(async () => {
      const url = '/src/sim/phase1AsteroidCatalog.ts';
      const loader = await import(/* @vite-ignore */ url);
      const result = await loader.loadPhase1AsteroidCatalog({ maxRecords: 100_000 });
      if (!result.accepted) throw new Error('Late catalog fixture was not accepted');
    });
    const closed = await capture(page);
    expect(closed.compiles).toBe(0); expect(closed.renders).toBe(0); expect(closed.workers).toBe(0);
    expect(closed.rendererDisposals).toBe(1); expect(closed.unhandled).toEqual([]);
    expect(observed.catalogLogs.some(log => log.includes('Loaded deterministic catalog'))).toBe(false);
    expect(observed.errors).toEqual([]);
  } finally { release(); }
});

test('texture allocation failure exposes recovery and retires the acquired renderer once', async ({ page }) => {
  const observed = await instrument(page, 'early'); await page.goto('/');
  await expect(page.locator('#renderer-unavailable')).toBeVisible();
  await expect(page.locator('#renderer-retry')).toBeFocused();
  await expect(page.locator('#space-canvas')).toHaveJSProperty('inert', true);
  const stopped = await capture(page);
  expect(stopped.rendererDisposals).toBe(1); expect(stopped.renders).toBe(0);
  expect(stopped.unhandled).toEqual([]); expect(observed.errors).toEqual([]);
  await unload(page); expect((await capture(page)).rendererDisposals).toBe(1);
});

test('final compile failure retires workers and quadtrees while keeping restoration and retry messaging', async ({ page }) => {
  const observed = await instrument(page, 'compile-failure'); await page.goto('/');
  await expect(page.locator('#renderer-unavailable')).toBeVisible();
  await expect(page.locator('#renderer-unavailable [role="alert"]')).toContainText('could not finish preparing');
  const stopped = await capture(page);
  expect(stopped.rendererDisposals).toBe(1); expect(stopped.renders).toBe(0);
  expect(stopped.workerTerminations).toBe(1); expect(stopped.quadtreeDisposals).toBe(2);
  expect(stopped.remainingQuadtreeFaces).toEqual([0, 0]);
  expect(stopped.unhandled).toEqual([]); expect(observed.errors).toEqual([]);
  await page.evaluate(() => document.querySelector('#space-canvas')!.dispatchEvent(new Event('webglcontextrestored')));
  await expect(page.locator('#renderer-unavailable [role="alert"]')).toContainText('available again');
  await unload(page); expect((await capture(page)).rendererDisposals).toBe(1);
});
