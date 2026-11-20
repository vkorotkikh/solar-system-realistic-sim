import { expect, test, type Page } from '@playwright/test';
import { retireWebGlPage } from './webgl-cleanup';

// Passive post-render observation of the actual app, as in label-direction.spec.ts:
// no product hook, source rewrite or scene mutation. Every frame records what the
// renderer was just handed: the Sun's displayed position and the H29 grid's state.
interface WarpFrame {
  ms: number;
  sun: [number, number, number];
  gridVisible: boolean;
  front: number;
  thickness: number;
  stretch: number;
  time: number;
  direction: [number, number, number];
}
interface WarpProbe { frames: WarpFrame[]; errors: string[] }
interface ProbeWindow extends Window { __warpProbe: WarpProbe; __THREE_DEVTOOLS__: EventTarget }

// Documented on-screen effect (h29-...-implementation_plan.md, h29DisplayScale.ts):
// the front reaches the Sun 8 display seconds after the Sgr A* trigger and moves each
// body along the source bearing by H29_DISPLAY_PEAK_AU * amplitude * sech^2(xi).
const ARRIVAL_DISPLAY_SEC = 8;
const PEAK_AU = 0.02;
// Hand-derived from the catalog and the strength formula, not from the engine:
// 5e54 erg, Sgr A* (spin 0.5, 4.154e6 Msun, 35 deg), UI intensity 1.4 -> 0.2062463187 * 1.4.
const PRESET_AMPLITUDE = 0.2887448461908485;
// Software GL draws about two frames a second and the warp clock advances at most 0.1 s
// a frame, so waiting for the front to reach the Sun would take minutes in CI. The
// first 1.5 display seconds already pin every frame's shift to its front (see below).
const OBSERVED_DISPLAY_SEC = 1.5;

test.use({ reducedMotion: 'no-preference' }); // SCN-038 freezes the warp clock under reduced motion
test.describe.configure({ timeout: 180_000 });
test.skip(({ browserName }) => browserName !== 'chromium', 'Real WebGL runs in Chromium');
test.afterEach(async ({ page }) => { await retireWebGlPage(page); });

async function observe(page: Page, origin: string) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // The offline route below answers 503 on purpose; Chromium logs each one as a console error.
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text());
  });
  await page.route('**/*', route => new URL(route.request().url()).origin === origin
    ? route.continue()
    : route.fulfill({ status: 503, body: 'Offline warp gate', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.addInitScript(() => {
    const owned = window as unknown as ProbeWindow;
    const probe: WarpProbe = owned.__warpProbe = { frames: [], errors: [] };
    const hook = new EventTarget(); owned.__THREE_DEVTOOLS__ = hook;
    hook.addEventListener('observe', event => {
      const renderer = (event as CustomEvent).detail;
      if (!renderer?.isWebGLRenderer) return;
      const render = renderer.render;
      let grid: { visible: boolean; material: { uniforms: Record<string, { value: any }> } } | null = null;
      renderer.render = function (...args: unknown[]) {
        const result = Reflect.apply(render, this, args); // original render first, unchanged
        try {
          const scene = args[0] as { getObjectByName(name: string): { position: { toArray(): number[] } } | undefined;
            traverse(visit: (object: any) => void): void };
          const sun = scene.getObjectByName('Sun');
          if (!sun) return result;
          if (!grid) scene.traverse(object => {
            const uniforms = object.material?.uniforms;
            if (!grid && uniforms?.stretchAmplitude && uniforms?.bubbleThickness) grid = object;
          });
          if (!grid) throw new Error('actual scene has no H29 slipstream grid');
          const uniforms = grid.material.uniforms;
          probe.frames.push({ ms: performance.now(), sun: sun.position.toArray() as [number, number, number],
            gridVisible: grid.visible, front: uniforms.shockwaveDist.value, thickness: uniforms.bubbleThickness.value,
            stretch: uniforms.stretchAmplitude.value, time: uniforms.time.value,
            direction: uniforms.propagationDir.value.toArray() });
          if (probe.frames.length > 4000) probe.frames.shift();
        } catch (error) { if (probe.errors.length < 8) probe.errors.push(String(error)); }
        return result;
      };
    });
  });
  return errors;
}

const frames = (page: Page) => page.evaluate(() => (window as unknown as ProbeWindow).__warpProbe);
const length = (v: number[]) => Math.hypot(...v);
const sech2 = (xi: number) => 1 / Math.cosh(xi) ** 2;

test('the H29 grid appears on the trigger and every frame shifts the Sun for the front it draws', async ({ page, baseURL }, info) => {
  const errors = await observe(page, new URL(baseURL!).origin);
  await page.goto('/?uiWidth=700&uiHeight=600&renderScale=0.5&maxPixelRatio=1');
  await expect.poll(async () => (await frames(page)).frames.length, { timeout: 60_000 }).toBeGreaterThan(2);
  await expect(page.locator('#renderer-unavailable')).toBeHidden();
  // Hide the layers software GL spends most of each frame on; the warp does not use them.
  // A dispatched click skips the actionability waits that each cost several slow frames.
  for (const id of ['toggle-orbits', 'toggle-labels', 'toggle-moons', 'toggle-asteroids', 'toggle-kuiper']) {
    await page.locator(`#${id}`).dispatchEvent('click');
    await expect(page.locator(`#${id}`)).not.toBeChecked();
  }

  await page.locator('.panel-disclosure--danger summary').click();
  await page.locator('#agn-preset').selectOption('SgrA_WarpWave_H29');
  await page.getByRole('button', { name: 'Trigger H29 slipstream', exact: true }).click();
  await expect.poll(async () => (await frames(page)).frames.some(f => f.gridVisible && f.time >= OBSERVED_DISPLAY_SEC),
    { timeout: 120_000, intervals: [500] }).toBe(true);

  const probe = await frames(page);
  await info.attach('warp-frames', { body: JSON.stringify(probe, null, 1), contentType: 'application/json' });
  expect(probe.errors).toEqual([]);
  const start = probe.frames.findIndex(f => f.gridVisible);
  const before = probe.frames.slice(0, start), event = probe.frames.slice(start);
  expect(before.length, 'frames rendered before the trigger').toBeGreaterThan(0);
  for (const f of before) expect(f.sun, 'no shift before the event').toEqual([0, 0, 0]);

  // The grid appears on the event's first frame and stays on, deformed, while its front
  // moves toward the Sun at the constant speed that lands it there 8 display seconds in.
  expect(event[0]!.time).toBeLessThanOrEqual(0.1);
  expect(event.every(f => f.gridVisible && f.stretch > 0)).toBe(true);
  for (let i = 1; i < event.length; i++) {
    const [a, b] = [event[i - 1]!, event[i]!];
    expect(b.front).toBeLessThan(a.front);
    const arrival = a.time + (b.time - a.time) * a.front / (a.front - b.front);
    expect(arrival, 'display seconds from trigger to the front reaching the Sun').toBeCloseTo(ARRIVAL_DISPLAY_SEC, 6);
  }

  // The Sun's true position is the origin, so its displayed position is the H29 shift
  // alone. Far from the front that shift is tiny but exact, so each frame is checked
  // against the front drawn in that same frame. A stale, skipped or missing per-frame
  // application, a wrong amplitude or a wrong profile changes the ratio.
  let checked = 0;
  for (const f of event) {
    const expected = PEAK_AU * PRESET_AMPLITUDE * sech2(f.front / f.thickness);
    if (expected < 1e-300) { // sech^2 is at or below the double range this far out
      expect(length(f.sun), `no shift with the front at ${f.front} AU`).toBeLessThan(1e-290);
      continue;
    }
    checked++;
    expect(length(f.sun) / expected, `shift with the front at ${f.front} AU`).toBeCloseTo(1, 9);
    const unit = f.sun.map(v => v / length(f.sun));
    expect(unit.reduce((sum, v, i) => sum + v * f.direction[i]!, 0), 'shift along the source bearing').toBeCloseTo(1, 9);
  }
  expect(checked, 'frames whose shift is measurable').toBeGreaterThanOrEqual(8);
  expect(errors).toEqual([]);
});
