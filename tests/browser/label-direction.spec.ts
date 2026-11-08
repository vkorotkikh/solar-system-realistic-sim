import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { Sprite, WebGLRenderer } from 'three';

// FE041: passive post-render observation of actual main and real pointer controls.
// No product hook, source rewriting, matrix update, camera/object/control or RAF mutation.
type XYZ = [number, number, number];
interface Draw {
  index: number; sunName: string; candidates: number; cameraQuaternion: number[];
  pointerMove: number; pointerUp: number;
  bodyWorld: XYZ; labelWorld: XYZ; bodyView: XYZ; labelView: XYZ;
  bodyNdc: XYZ; labelNdc: XYZ; viewDelta: XYZ; worldMagnitude: number;
  localMagnitude: number; scale: number[]; visible: boolean; parentVisible: boolean;
  materialId: string; mapId: string; imageSize: number[]; pixelHeight: number;
}
interface Probe {
  rendererCount: number; draws: number; first: Draw | null; latest: Draw | null;
  afterPointerDown: Draw[]; errors: string[];
  pointerDown: number; pointerMove: number; pointerUp: number; pointerDownAtDraw: number | null;
}
interface ProbeWindow extends Window { __labelProbe: Probe; __THREE_DEVTOOLS__: EventTarget }
const BACKEND = 'http://127.0.0.1:9142';
async function routeAndObserve(page: Page, baseURL: string) {
  const consoleErrors: string[] = [], pageErrors: string[] = [], messages: string[] = [], unexpectedRequests: string[] = [];
  const origin = new URL(baseURL).origin;
  page.on('console', message => {
    messages.push(`[${message.type()}] ${message.text()}`);
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    let payload: unknown;
    if (request.method() === 'GET' && url.origin === BACKEND && url.pathname === '/solar/realtime' && url.search === '') {
      const unavailable = () => ({ ok: false, error: 'FE041 synthetic fixture: no observed input delivered' });
      payload = { schema: { name: 'solar_realtime_endpoint', version: 1 }, source: 'backend', snapshot: {
        schema: { name: 'solar_realtime_context', version: 1 }, fetched_at_utc: '2026-10-24T00:00:00Z',
        source_status: { swpc: unavailable(), silso: unavailable(), sdo_aia: unavailable(), gong_synoptic: unavailable() },
        swpc: null, silso: null, sdo_aia: null, gong_synoptic: null, combined_activity_proxy: null,
      } };
    } else if (request.method() === 'GET' && url.origin === BACKEND && url.pathname === '/solar/physics'
      && url.searchParams.has('jd_tdb') && Number.isFinite(Number(url.searchParams.get('jd_tdb')))
      && url.searchParams.get('forcing') === 'hybrid' && url.searchParams.get('live_data') === 'true') {
      const jd = Number(url.searchParams.get('jd_tdb'));
      payload = { schema: { name: 'solar_physics_state', version: 2 }, epoch_jd_tdb: jd, wall_epoch_jd_tdb: jd,
        jd_time_scale: 'TDB', forcing: 'hybrid', effective_forcing: 'synthetic', live_data_requested: true,
        live_data_enabled: false, fallback_reason: 'disabled_unvalidated', activity_index: 0.42,
        forcing_status: { requested: 'hybrid', effective: 'synthetic', observed_input_status: 'disabled_unvalidated',
          runtime_eligible: false, fallback_reason: 'disabled_unvalidated' } };
    } else {
      unexpectedRequests.push(`${request.method()} ${url.href}`);
      return route.abort('blockedbyclient');
    }
    return route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': origin }, body: JSON.stringify(payload) });
  });
  await page.addInitScript(() => {
    const owned = window as unknown as ProbeWindow;
    const probe: Probe = owned.__labelProbe = { rendererCount: 0, draws: 0, first: null, latest: null,
      afterPointerDown: [], errors: [], pointerDown: 0, pointerMove: 0, pointerUp: 0, pointerDownAtDraw: null };
    // Observe trusted user input; do not cancel, synthesize, or dispatch events.
    for (const type of ['pointerdown', 'pointermove', 'pointerup'] as const) {
      document.addEventListener(type, event => {
        if (!event.isTrusted || !(event.target instanceof HTMLCanvasElement) || event.target.id !== 'space-canvas') return;
        if (type === 'pointerdown') { probe.pointerDown++; probe.pointerDownAtDraw = probe.draws; }
        if (type === 'pointermove' && probe.pointerDown) probe.pointerMove++;
        if (type === 'pointerup') probe.pointerUp++;
      }, { capture: true, passive: true });
    }
    // Column-major scalar projection of cloned existing matrices. No scene update.
    function transformed(m: number[], p: XYZ): XYZ {
      const [x, y, z] = p;
      const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
      return [(m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w,
        (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w,
        (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) / w];
    }
    const hook = new EventTarget(); owned.__THREE_DEVTOOLS__ = hook;
    hook.addEventListener('observe', event => {
      const renderer = (event as CustomEvent<WebGLRenderer & { isWebGLRenderer: boolean }>).detail;
      if (!renderer?.isWebGLRenderer) return;
      probe.rendererCount++;
      const render = renderer.render;
      renderer.render = function (this: WebGLRenderer, ...args: Parameters<WebGLRenderer['render']>) {
        const result = Reflect.apply(render, this, args); // Original render FIRST; same this, arguments and return.
        probe.draws++;
        try {
          const [scene, camera] = args;
          const sun = scene.getObjectByName('Sun');
          if (!sun) throw new Error('actual scene has no named Sun body');
          const candidates = sun.children.filter(child => {
            const sprite = child as Sprite, image = sprite.material?.map?.image as HTMLCanvasElement | undefined;
            return sprite.isSprite && image instanceof HTMLCanvasElement && image.width === 256 && image.height === 64;
          });
          if (candidates.length !== 1) throw new Error(`expected one direct Sun label sprite, found ${candidates.length}`);
          const sprite = candidates[0] as Sprite, map = sprite.material.map!;
          const bodyMatrix = sun.matrixWorld.elements.slice(), labelMatrix = sprite.matrixWorld.elements.slice();
          const view = camera.matrixWorldInverse.elements.slice(), projection = camera.projectionMatrix.elements.slice();
          const bodyWorld: XYZ = [bodyMatrix[12]!, bodyMatrix[13]!, bodyMatrix[14]!];
          const labelWorld: XYZ = [labelMatrix[12]!, labelMatrix[13]!, labelMatrix[14]!];
          const bodyView = transformed(view, bodyWorld), labelView = transformed(view, labelWorld);
          const viewDelta: XYZ = [labelView[0] - bodyView[0], labelView[1] - bodyView[1], labelView[2] - bodyView[2]];
          // Measure the rendered billboard edges through the camera projection.
          // CSS height, not the scaled WebGL drawing buffer, is the label contract.
          const viewportHeight = renderer.domElement.clientHeight;
          const top = transformed(projection, [labelView[0], labelView[1] + sprite.scale.y / 2, labelView[2]]);
          const bottom = transformed(projection, [labelView[0], labelView[1] - sprite.scale.y / 2, labelView[2]]);
          const pixelHeight = (top[1] - bottom[1]) * viewportHeight / 2;
          const image = map.image as HTMLCanvasElement;
          const draw: Draw = { pixelHeight, index: probe.draws, sunName: sun.name, candidates: candidates.length,
            pointerMove: probe.pointerMove, pointerUp: probe.pointerUp,
            cameraQuaternion: camera.quaternion.toArray(), bodyWorld, labelWorld, bodyView, labelView,
            bodyNdc: transformed(projection, bodyView), labelNdc: transformed(projection, labelView), viewDelta,
            worldMagnitude: Math.hypot(...labelWorld.map((v, i) => v - bodyWorld[i]!)),
            localMagnitude: sprite.position.length(), scale: sprite.scale.toArray(), visible: sprite.visible,
            parentVisible: sun.visible, materialId: sprite.material.uuid, mapId: map.uuid, imageSize: [image.width, image.height] };
          probe.first ??= draw; probe.latest = draw;
          if (probe.pointerDown && probe.afterPointerDown.length < 256) probe.afterPointerDown.push(draw);
        } catch (error) { if (probe.errors.length < 8) probe.errors.push(String(error)); }
        return result;
      };
    });
  });
  return { consoleErrors, pageErrors, messages, unexpectedRequests };
}

async function open(page: Page) {
  const response = await page.goto('/?uiWidth=700&uiHeight=600&renderScale=0.5&maxPixelRatio=1', { waitUntil: 'domcontentloaded' });
  expect(response?.ok(), 'actual page navigation succeeds').toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as ProbeWindow).__labelProbe.draws), { timeout: 60_000 }).toBeGreaterThan(2);
  await expect(page.locator('#renderer-unavailable')).toBeHidden();
  await expect(page.locator('#toggle-labels')).toBeChecked();
}
const lastSnapshots = new WeakMap<Page, Probe>();
async function snapshot(page: Page) {
  const probe = await page.evaluate(() => (window as unknown as ProbeWindow).__labelProbe);
  lastSnapshots.set(page, probe);
  return probe;
}
async function dragThroughRenderedFrames(
  move: (fraction: number) => Promise<void>,
  rendered: (step: number) => Promise<Draw>,
): Promise<Draw[]> {
  const frames: Draw[] = [];
  for (let step = 1; step <= 9; step++) {
    await move(step / 9);
    frames.push(await rendered(step));
  }
  return frames;
}
function healthy(probe: Probe, errors: Awaited<ReturnType<typeof routeAndObserve>>) {
  expect(errors.consoleErrors).toEqual([]); expect(errors.pageErrors).toEqual([]); expect(errors.unexpectedRequests).toEqual([]);
  expect(probe.errors).toEqual([]); expect(probe.rendererCount).toBe(1); expect(probe.first?.index).toBe(1);
  expect(probe.first?.sunName).toBe('Sun'); expect(probe.first?.candidates).toBe(1);
  expect(probe.first?.localMagnitude).toBeGreaterThan(0);
}
function compatible(draw: Draw, first: Draw) {
  expect([...draw.bodyWorld, ...draw.labelWorld, ...draw.bodyView, ...draw.labelView, ...draw.bodyNdc, ...draw.labelNdc].every(Number.isFinite)).toBe(true);
  expect(draw.visible).toBe(true); expect(draw.parentVisible).toBe(true);
  expect(draw.pixelHeight, `draw ${draw.index}: constant CSS-pixel label height`).toBeCloseTo(40, 6);
  expect(draw.scale[0]! / draw.scale[1]!).toBeCloseTo(4, 10); expect(draw.scale[2]).toBe(1);
  expect(draw.imageSize).toEqual([256, 64]);
  expect(draw.materialId).toBe(first.materialId); expect(draw.mapId).toBe(first.mapId);
  expect(draw.materialId.length).toBeGreaterThan(0); expect(draw.mapId.length).toBeGreaterThan(0);
  expect(draw.localMagnitude).toBeGreaterThan(0);
  expect(Math.abs(draw.worldMagnitude - draw.localMagnitude)).toBeLessThan(1e-10);
  expect(Math.abs(draw.bodyNdc[0])).toBeLessThan(0.01); expect(Math.abs(draw.bodyNdc[1])).toBeLessThan(0.01);
}
function screenUp(draw: Draw) {
  const [x, y, z] = draw.viewDelta, magnitude = draw.worldMagnitude;
  expect.soft(Math.abs(x) / magnitude, `draw ${draw.index}: horizontal camera-space offset`).toBeLessThan(1e-8);
  expect.soft(Math.abs(z) / magnitude, `draw ${draw.index}: depth component is not screen-up`).toBeLessThan(1e-8);
  expect.soft(y / magnitude, `draw ${draw.index}: positive screen-up component`).toBeGreaterThan(1 - 1e-8);
  expect.soft(Math.abs(draw.labelNdc[0] - draw.bodyNdc[0]), `draw ${draw.index}: projected label centered above body`).toBeLessThan(1e-8);
  expect.soft(draw.labelNdc[1] - draw.bodyNdc[1], `draw ${draw.index}: projected label is above body`).toBeGreaterThan(1e-8);
}
async function retain(page: Page, testInfo: TestInfo, errors: Awaited<ReturnType<typeof routeAndObserve>>) {
  // A timeout can close the page before finally runs. Retain the observations
  // already used by the assertions without replacing the original failure.
  const body = Buffer.from(JSON.stringify({ fixtureScope: 'FE041 passive actual-render geometry; synthetic services; projected geometry only; no raster/science/font claim',
    snapshotScope: 'last successfully captured probe', probe: lastSnapshots.get(page) ?? null, ...errors }, null, 2));
  await writeFile(testInfo.outputPath('label-observations.json'), body);
  await testInfo.attach('label-observations.json', { body, contentType: 'application/json' });
}

test.beforeEach(({ browserName }) => { test.skip(browserName !== 'chromium', 'native actual-render camera control probe'); });
test.setTimeout(90_000);

test('first actual scene draw places the Sun label in camera screen-up direction', async ({ page, baseURL }, testInfo) => {
  const errors = await routeAndObserve(page, baseURL!);
  try {
    await open(page);
    const probe = await snapshot(page); healthy(probe, errors);
    compatible(probe.first!, probe.first!); compatible(probe.latest!, probe.first!);
    await page.screenshot({ path: testInfo.outputPath('initial-direction-diagnostic.png') });
    screenUp(probe.first!);
  } finally { await retain(page, testInfo, errors); }
});

test('real OrbitControls drag keeps labels screen-up in the same rendered frames', async ({ page, baseURL }, testInfo) => {
  // CI trace 41421718506: native input acknowledgments take ~5s and a
  // post-input render can take ~10s. Budget nine completed phases at 15s each,
  // plus 30s startup and 15s for final observations/retention: 180s, bounded.
  // This is a software-GPU sampling budget, not a product performance limit.
  test.setTimeout(180_000);
  const errors = await routeAndObserve(page, baseURL!);
  try {
    await open(page);
    const before = await snapshot(page); healthy(before, errors); compatible(before.latest!, before.first!);
    // Intentionally no direction assertion before dragging: baseline must reach real input.
    // Raster captures are not this geometry oracle: on CI SwiftShader they cost
    // 19–27s before input. Keep the actual-render probe and failure trace instead.
    const box = await page.locator('#space-canvas').boundingBox(); expect(box).not.toBeNull();
    const x = box!.x + box!.width * 0.55, y = box!.y + box!.height * 0.5;
    await page.mouse.move(x, y); await page.mouse.down();
    // Input acknowledgment does not imply a render. Hold each native waypoint
    // until its FIRST observed render; never skip a bad first frame to settle.
    let previousFrame = before.latest!;
    const phases = await dragThroughRenderedFrames(
      fraction => page.mouse.move(x + box!.width * 0.22 * fraction, y + box!.height * 0.12 * fraction),
      async step => {
        let frame: Draw | undefined;
        await expect.poll(async () => {
          const probe = await snapshot(page);
          frame = probe.afterPointerDown.find(draw => draw.pointerMove === step);
          return frame?.index ?? 0;
        }, { timeout: 15_000, message: `native waypoint ${step}: first completed render` }).toBeGreaterThan(previousFrame.index);
        const observed = frame!;
        expect(observed.pointerUp, `waypoint ${step} renders while the native button is held`).toBe(0);
        expect(observed.cameraQuaternion.some((v, i) => Math.abs(v - previousFrame.cameraQuaternion[i]!) > 1e-6),
          `waypoint ${step} changes the rendered camera`).toBe(true);
        compatible(observed, before.first!); screenUp(observed);
        previousFrame = observed;
        return observed;
      },
    );
    await page.mouse.up();
    const changedDraws = (probe: Probe) => probe.afterPointerDown.filter(draw =>
      draw.cameraQuaternion.some((v, i) => Math.abs(v - before.latest!.cameraQuaternion[i]!) > 1e-6));
    const after = await snapshot(page); healthy(after, errors);
    expect(after.pointerDown).toBe(1); expect(after.pointerMove).toBeGreaterThanOrEqual(9); expect(after.pointerUp).toBe(1);
    const changed = changedDraws(after);
    expect(phases).toHaveLength(9);
    expect(new Set(phases.map(draw => draw.index)).size).toBe(9);
    expect(phases[0]!.index, 'the first camera-changed frame is retained and checked').toBe(changed[0]?.index);
    expect(changed.length, 'real pointer drag changes actual camera quaternion across rendered frames').toBeGreaterThan(8);
    // Check all selected samples for compatibility before any expected direction failures.
    for (const draw of changed) compatible(draw, before.first!);
    for (const draw of changed) screenUp(draw);
  } finally { await retain(page, testInfo, errors); }
});
