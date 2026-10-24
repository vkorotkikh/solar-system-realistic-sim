import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { Mesh, SphereGeometry, Sprite, WebGLRenderer } from 'three';

// FE-LABEL-SCALE: separate passive post-render scale-transition candidate; original FE041 retained.
// No product hook, source rewriting, matrix update, camera/object/control or RAF mutation.
type XYZ = [number, number, number];
interface Draw {
  index: number; sunName: string; candidates: number; cameraQuaternion: number[];
  bodyWorld: XYZ; labelWorld: XYZ; bodyView: XYZ; labelView: XYZ;
  bodyNdc: XYZ; labelNdc: XYZ; viewDelta: XYZ; worldMagnitude: number;
  localMagnitude: number; scale: number[]; visible: boolean; parentVisible: boolean;
  materialId: string; mapId: string; imageSize: number[];
  bodyRadiusAu: number; geometryRadius: number; meshScale: number[]; bodyMeshId: string;
  realistic: boolean; scaleSerial: number;
}
interface Probe {
  rendererCount: number; draws: number; first: Draw | null; latest: Draw | null;
  afterPointerDown: Draw[]; errors: string[];
  scaleChanges: { checked: boolean; atDraw: number }[];
  firstScaleDraws: Record<string, Draw>;
  pointerDown: number; pointerMove: number; pointerUp: number; pointerDownAtDraw: number | null;
}
interface ProbeWindow extends Window { __labelProbe: Probe; __THREE_DEVTOOLS__: EventTarget }
const BACKEND = 'http://127.0.0.1:9142';
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600&family=Oxanium:wght@500;600;700&display=swap';

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
    if (request.method() === 'GET' && url.href === new URL(FONT_CSS).href) {
      return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    }
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
      afterPointerDown: [], errors: [], pointerDown: 0, pointerMove: 0, pointerUp: 0, pointerDownAtDraw: null,
      scaleChanges: [], firstScaleDraws: {} };
    // Observe trusted user input; do not cancel, synthesize, or dispatch events.
    for (const type of ['pointerdown', 'pointermove', 'pointerup'] as const) {
      document.addEventListener(type, event => {
        if (!event.isTrusted || !(event.target instanceof HTMLCanvasElement) || event.target.id !== 'space-canvas') return;
        if (type === 'pointerdown') { probe.pointerDown++; probe.pointerDownAtDraw = probe.draws; }
        if (type === 'pointermove' && probe.pointerDown) probe.pointerMove++;
        if (type === 'pointerup') probe.pointerUp++;
      }, { capture: true, passive: true });
    }
    document.addEventListener('change', event => {
      const target = event.target;
      if (event.isTrusted && target instanceof HTMLInputElement && target.id === 'toggle-realistic-scale') {
        probe.scaleChanges.push({ checked: target.checked, atDraw: probe.draws });
      }
    }, { capture: true, passive: true });
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
          const surfaces: Mesh<SphereGeometry>[] = [];
          sun.traverse(child => {
            const mesh = child as Mesh<SphereGeometry>;
            if (mesh.isMesh && child.userData.bodyId === 'sun') surfaces.push(mesh);
          });
          if (surfaces.length !== 1) throw new Error(`expected one actual Sun body mesh, found ${surfaces.length}`);
          const surface = surfaces[0]!, geometryRadius = surface.geometry.parameters.radius;
          const toggle = document.getElementById('toggle-realistic-scale');
          if (!(toggle instanceof HTMLInputElement)) throw new Error('actual scale checkbox missing');
          const sprite = candidates[0] as Sprite, map = sprite.material.map!;
          const bodyMatrix = sun.matrixWorld.elements.slice(), labelMatrix = sprite.matrixWorld.elements.slice();
          const view = camera.matrixWorldInverse.elements.slice(), projection = camera.projectionMatrix.elements.slice();
          const bodyWorld: XYZ = [bodyMatrix[12]!, bodyMatrix[13]!, bodyMatrix[14]!];
          const labelWorld: XYZ = [labelMatrix[12]!, labelMatrix[13]!, labelMatrix[14]!];
          const bodyView = transformed(view, bodyWorld), labelView = transformed(view, labelWorld);
          const viewDelta: XYZ = [labelView[0] - bodyView[0], labelView[1] - bodyView[1], labelView[2] - bodyView[2]];
          const image = map.image as HTMLCanvasElement;
          const draw: Draw = { index: probe.draws, sunName: sun.name, candidates: candidates.length,
            bodyRadiusAu: geometryRadius * surface.scale.x, geometryRadius, meshScale: surface.scale.toArray(), bodyMeshId: surface.uuid,
            realistic: toggle.checked, scaleSerial: probe.scaleChanges.length,
            cameraQuaternion: camera.quaternion.toArray(), bodyWorld, labelWorld, bodyView, labelView,
            bodyNdc: transformed(projection, bodyView), labelNdc: transformed(projection, labelView), viewDelta,
            worldMagnitude: Math.hypot(...labelWorld.map((v, i) => v - bodyWorld[i]!)),
            localMagnitude: sprite.position.length(), scale: sprite.scale.toArray(), visible: sprite.visible,
            parentVisible: sun.visible, materialId: sprite.material.uuid, mapId: map.uuid, imageSize: [image.width, image.height] };
          probe.first ??= draw; probe.latest = draw;
          if (draw.scaleSerial > 0) probe.firstScaleDraws[String(draw.scaleSerial)] ??= draw;
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
async function snapshot(page: Page) { return page.evaluate(() => (window as unknown as ProbeWindow).__labelProbe); }
function healthy(probe: Probe, errors: Awaited<ReturnType<typeof routeAndObserve>>) {
  expect(errors.consoleErrors).toEqual([]); expect(errors.pageErrors).toEqual([]); expect(errors.unexpectedRequests).toEqual([]);
  expect(probe.errors).toEqual([]); expect(probe.rendererCount).toBe(1); expect(probe.first?.index).toBe(1);
  expect(probe.first?.sunName).toBe('Sun'); expect(probe.first?.candidates).toBe(1);
  expect(probe.first?.localMagnitude).toBeGreaterThan(0);
}
function compatible(draw: Draw, first: Draw, preserveMagnitude = true) {
  expect([...draw.bodyWorld, ...draw.labelWorld, ...draw.bodyView, ...draw.labelView, ...draw.bodyNdc, ...draw.labelNdc].every(Number.isFinite)).toBe(true);
  expect(draw.visible).toBe(true); expect(draw.parentVisible).toBe(true);
  expect(draw.scale).toEqual([0.12, 0.03, 1]); expect(draw.imageSize).toEqual([256, 64]);
  expect(draw.materialId).toBe(first.materialId); expect(draw.mapId).toBe(first.mapId);
  expect(draw.materialId.length).toBeGreaterThan(0); expect(draw.mapId.length).toBeGreaterThan(0);
  if (preserveMagnitude) {
    expect(Math.abs(draw.localMagnitude - first.localMagnitude)).toBeLessThan(1e-10);
    expect(Math.abs(draw.worldMagnitude - first.worldMagnitude)).toBeLessThan(1e-10);
  }
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
  const body = Buffer.from(JSON.stringify({ fixtureScope: 'FE-LABEL-SCALE passive actual-render radius/offset; synthetic services; no pixel/science/font claim',
    probe: await snapshot(page), ...errors }, null, 2));
  await writeFile(testInfo.outputPath('label-observations.json'), body);
  await testInfo.attach('label-observations.json', { body, contentType: 'application/json' });
}

test.beforeEach(({ browserName }) => { test.skip(browserName !== 'chromium', 'native actual-render camera control probe'); });
test.setTimeout(90_000);

function sameRadiusPolicy(draw: Draw) {
  expect(Number.isFinite(draw.bodyRadiusAu)).toBe(true);
  expect(draw.bodyRadiusAu).toBeGreaterThan(0);
  expect(draw.geometryRadius).toBe(1);
  expect(draw.meshScale).toEqual([draw.meshScale[0], draw.meshScale[0], draw.meshScale[0]]);
  const expected = draw.bodyRadiusAu * 2.5 + 0.03;
  expect.soft(Math.abs(draw.localMagnitude - expected), `draw ${draw.index}: current-radius local clearance`).toBeLessThan(1e-10);
  expect.soft(Math.abs(draw.worldMagnitude - expected), `draw ${draw.index}: current-radius world clearance`).toBeLessThan(1e-10);
  screenUp(draw);
}

test('supported scale toggle keeps Sun label on the same radius policy through a real roundtrip', async ({ page, baseURL }, testInfo) => {
  const errors = await routeAndObserve(page, baseURL!);
  try {
    await open(page);
    const before = await snapshot(page); healthy(before, errors);
    compatible(before.first!, before.first!); compatible(before.latest!, before.first!);
    expect(before.scaleChanges).toEqual([]);
    expect(before.first!.realistic).toBe(false); sameRadiusPolicy(before.first!); sameRadiusPolicy(before.latest!);
    await page.locator('summary[aria-controls="display-controls"]').click();
    await expect(page.locator('#display-controls')).toBeVisible();
    const toggle = page.locator('#toggle-realistic-scale');
    await expect(toggle).toHaveCount(1); await expect(toggle).not.toBeChecked();
    const label = page.locator('label.switch-control').filter({ has: toggle });
    await label.click(); await expect(toggle).toBeChecked();
    await expect.poll(async () => (await snapshot(page)).firstScaleDraws['1']?.index ?? 0, { timeout: 15_000 }).toBeGreaterThan(before.latest!.index);
    const real = await snapshot(page); healthy(real, errors);
    expect(real.scaleChanges.map(event => event.checked)).toEqual([true]);
    const realDraw = real.firstScaleDraws['1']!;
    expect(realDraw.index).toBeGreaterThan(real.scaleChanges[0]!.atDraw);
    expect(realDraw.realistic).toBe(true); expect(realDraw.bodyMeshId).toBe(before.first!.bodyMeshId);
    expect(realDraw.bodyRadiusAu).toBeLessThan(before.first!.bodyRadiusAu);
    compatible(realDraw, before.first!, false); sameRadiusPolicy(realDraw);
    await label.click(); await expect(toggle).not.toBeChecked();
    await expect.poll(async () => (await snapshot(page)).firstScaleDraws['2']?.index ?? 0, { timeout: 15_000 }).toBeGreaterThan(realDraw.index);
    const returned = await snapshot(page); healthy(returned, errors);
    expect(returned.scaleChanges.map(event => event.checked)).toEqual([true, false]);
    const back = returned.firstScaleDraws['2']!;
    expect(back.index).toBeGreaterThan(returned.scaleChanges[1]!.atDraw);
    expect(back.realistic).toBe(false); expect(back.bodyMeshId).toBe(before.first!.bodyMeshId);
    expect(Math.abs(back.bodyRadiusAu - before.first!.bodyRadiusAu)).toBeLessThan(1e-12);
    compatible(back, before.first!); sameRadiusPolicy(back);
    expect(returned.first).toEqual(before.first);
  } finally { await retain(page, testInfo, errors); }
});
