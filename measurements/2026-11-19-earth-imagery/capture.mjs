// Headless real-GPU screenshots of the NASA-imagery Earth (feat/earth-nasa-imagery).
// Usage: node capture.mjs <app url> <output dir>
// The served main.ts is patched (as startup.mjs does) to expose the simulation state and
// camera, so each shot sets an exact UTC time (and so the Sun's position) and frames a
// body-fixed latitude/longitude. Times are 2026-03-20 (equinox), so the Sun is overhead at
// the equator at the longitude where it is local noon.
import { mkdir, writeFile } from 'node:fs/promises';
import { launch } from '../lib/headless-gpu.mjs';

const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) throw new Error('usage: node capture.mjs <app url> <output dir>');
await mkdir(outDir, { recursive: true });

const jd = (iso) => 2440587.5 + Date.parse(iso) / 86_400_000;
const FIRST_FRAME = /updateLabels\(\);\s*\n\s*renderer\.render\(scene, camera\);/;
const MAPS = /ownDisposable\(createPlanetSurfaceMaps\(\{/;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const problems = [];
page.on('console', (message) => { if (/WebGLProgram|Shader Error|\[surface-maps\]/.test(message.text())) problems.push(message.text()); });
page.on('pageerror', (error) => problems.push(error.message));
await page.route('**/src/main.ts*', async (route) => {
  const response = await route.fetch();
  let body = await response.text();
  for (const [pattern, insert] of [
    [MAPS, (found) => `window.__maps = ${found}`],
    [FIRST_FRAME, (found) => `${found}\n  window.__cap = { simState, camera, controls, bodyMeshes, focusBody };`],
  ]) {
    const match = body.match(pattern);
    if (!match) throw new Error(`anchor missing: ${pattern}`);
    body = body.replace(match[0], insert(match[0]));
  }
  await route.fulfill({ response, body, headers: { ...response.headers(), 'content-type': 'text/javascript' } });
});
const started = Date.now();
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__cap && window.__maps, null, { timeout: 120_000 });
await page.evaluate(() => window.__maps.ready);
console.log(`maps ready ${Date.now() - started} ms after navigation`);
const frames = (n) => page.evaluate((count) => new Promise((resolve) => { let i = 0; const tick = () => (++i >= count ? resolve() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }), n);

// The switch sits in a collapsed panel, so set it the way a click would: checked + change event.
async function realistic(on) {
  await page.evaluate((value) => {
    const box = document.querySelector('#toggle-realistic-scale');
    if (box.checked !== value) { box.checked = value; box.dispatchEvent(new Event('change', { bubbles: true })); }
  }, on);
  await frames(5);
}

// Frame Earth from `distance` radii above (lat, lon) in degrees, or from the Sun's direction.
let shot = async function shot(name, { time, lat = 0, lon = 0, distance = 3, fromSun = false, relief = true }) {
  await page.evaluate(({ t, lat, lon, distance, fromSun, relief }) => {
    const c = window.__cap;
    c.simState.paused = true;
    c.simState.julianDate = t;
    c.focusBody('earth', true);
    const tree = c.bodyMeshes.get('earth').userData.quadtree;
    tree.material.uniforms.uNormalReady.value = relief ? 1 : 0;
  }, { t: jd(time), lat, lon, distance, fromSun, relief });
  await frames(4); // positions and spin follow the new time
  const placed = await page.evaluate(({ lat, lon, distance, fromSun }) => {
    const c = window.__cap;
    const mesh = c.bodyMeshes.get('earth');
    const V = c.camera.position.constructor;
    const r = mesh.userData.quadtree.baseRadius;
    const center = mesh.getWorldPosition(new V());
    const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
    const dir = fromSun
      ? center.clone().negate().normalize()
      : mesh.localToWorld(new V(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)).multiplyScalar(r)).sub(center).normalize();
    c.controls.minDistance = Math.min(c.controls.minDistance, r * distance * 0.99);
    c.controls.target.copy(center);
    c.camera.up.copy(mesh.localToWorld(new V(0, r, 0)).sub(center).normalize());
    c.camera.position.copy(center).addScaledVector(dir, r * distance);
    c.controls.update();
    return { radiusKm: r * 149_597_870.7, realistic: c.simState.useRealisticScale };
  }, { lat, lon, distance, fromSun });
  await frames(6);
  const file = `${outDir}/${name}.png`;
  await writeFile(file, await page.locator('#space-canvas').screenshot());
  console.log(`${name}: ${time} lat ${lat} lon ${lon} at ${distance} R${fromSun ? ' (from the Sun)' : ''}, relief ${relief ? 'on' : 'off'}, Earth radius drawn ${Math.round(placed.radiusKm)} km, realistic ${placed.realistic}`);
}

const only = process.env.SHOTS ? new RegExp(process.env.SHOTS) : null;
const original = shot;
shot = async (name, options) => { if (!only || only.test(name)) await original(name, options); };

await realistic(true);
await shot('01-day-side-africa', { time: '2026-03-20T11:00:00Z', lat: 10, lon: 15 });
await shot('03c-himalaya-morning-sun', { time: '2026-03-20T02:30:00Z', lat: 28.5, lon: 86.5, distance: 1.12 });
await shot('03d-himalaya-morning-sun-no-relief', { time: '2026-03-20T02:30:00Z', lat: 28.5, lon: 86.5, distance: 1.12, relief: false });
for (const distance of [20, 60]) await shot(`07-clouds-realistic-far-${distance}R`, { time: '2026-03-20T15:00:00Z', lat: 0, lon: -45, distance });
await shot('02-glint-pacific', { time: '2026-03-20T22:00:00Z', fromSun: true, distance: 2.5 });
await shot('03-himalaya-low-sun', { time: '2026-03-20T00:40:00Z', lat: 28.5, lon: 86.5, distance: 1.12 });
await shot('03b-himalaya-low-sun-no-relief', { time: '2026-03-20T00:40:00Z', lat: 28.5, lon: 86.5, distance: 1.12, relief: false });
await shot('04-greenland-ice-low-sun', { time: '2026-03-20T09:00:00Z', lat: 72, lon: -40, distance: 1.5 });
for (const distance of [3, 1.5, 1.12]) await shot(`05-clouds-realistic-${distance}R`, { time: '2026-03-20T15:00:00Z', lat: 0, lon: -45, distance });
await realistic(false);
for (const distance of [3, 1.5, 1.12]) await shot(`06-clouds-enlarged-${distance}R`, { time: '2026-03-20T15:00:00Z', lat: 0, lon: -45, distance });
console.log(`problems: ${JSON.stringify(problems)}`);
await browser.close();
