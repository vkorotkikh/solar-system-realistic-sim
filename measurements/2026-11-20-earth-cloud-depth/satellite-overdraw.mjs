// Do Earth's clouds cover satellite markers that sit in front of them?
// Usage: node satellite-overdraw.mjs <app url> <output dir>
// The clouds write no depth and are depth-tested with an offset toward the camera; in enlarged
// scale their 10/6371 lift is ~7,900 km while satellites keep their true altitude. Each view is
// magnified as in cloud-depth.mjs (narrow field of view, clip planes of the real distance) and
// drawn three ways, with every orbit line off: S satellites + clouds, N satellites without
// clouds, Z neither.
// analyze-satellites.py takes marker pixels from N vs Z and counts those that S changes.
import { mkdir, writeFile } from 'node:fs/promises';
import { assertRenderer, launch } from '../lib/headless-gpu.mjs';

const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) throw new Error('usage: node satellite-overdraw.mjs <app url> <output dir>');
await mkdir(outDir, { recursive: true });

const jd = (iso) => 2440587.5 + Date.parse(iso) / 86_400_000;
const FIRST_FRAME = /updateLabels\(\);\s*\n\s*renderer\.render\(scene, camera\);/;
const MAPS = /ownDisposable\(createPlanetSurfaceMaps\(\{/;
const FILL = 0.8;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
console.log(`renderer: ${await assertRenderer(page)}`);
const problems = [];
page.on('console', (message) => { if (/WebGLProgram|Shader Error|\[surface-maps\]/.test(message.text())) problems.push(message.text()); });
page.on('pageerror', (error) => problems.push(error.message));
await page.route('**/src/main.ts*', async (route) => {
  const response = await route.fetch();
  let body = await response.text();
  for (const [pattern, insert] of [
    [MAPS, (found) => `window.__maps = ${found}`],
    [FIRST_FRAME, (found) => `${found}\n  window.__cap = { scene, simState, camera, controls, bodyMeshes, focusBody };`],
  ]) {
    const match = body.match(pattern);
    if (!match) throw new Error(`anchor missing: ${pattern}`);
    body = body.replace(match[0], insert(match[0]));
  }
  await route.fulfill({ response, body, headers: { ...response.headers(), 'content-type': 'text/javascript' } });
});
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__cap && window.__maps, null, { timeout: 120_000 });
await page.evaluate(() => window.__maps.ready);
const frames = (n) => page.evaluate((count) => new Promise((resolve) => { let i = 0; const tick = () => (++i >= count ? resolve() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }), n);
const toggle = (id, on) => page.evaluate(({ id, on }) => {
  const box = document.querySelector(id);
  if (box.checked !== on) { box.checked = on; box.dispatchEvent(new Event('change', { bubbles: true })); }
}, { id, on });

const place = (lon, distance) => page.evaluate(({ t, lon, distance, fill }) => {
  const c = window.__cap;
  c.simState.paused = true;
  c.simState.julianDate = t;
  c.focusBody('earth', true);
  const mesh = c.bodyMeshes.get('earth');
  const V = c.camera.position.constructor;
  const r = mesh.userData.quadtree.baseRadius;
  const center = mesh.getWorldPosition(new V());
  const lo = (lon * Math.PI) / 180;
  const dir = mesh.localToWorld(new V(Math.sin(lo), 0, Math.cos(lo)).multiplyScalar(r)).sub(center).normalize();
  c.controls.minDistance = Math.min(c.controls.minDistance, r * distance * 0.99);
  c.controls.maxDistance = Math.max(c.controls.maxDistance, r * distance * 1.01);
  c.controls.target.copy(center);
  c.camera.up.copy(mesh.localToWorld(new V(0, r, 0)).sub(center).normalize());
  c.camera.position.copy(center).addScaledVector(dir, r * distance);
  c.camera.fov = (2 * Math.asin(1 / distance) / fill) * 180 / Math.PI;
  c.camera.updateProjectionMatrix();
  c.controls.update();
  return { radiusAu: r, rangeAu: r * distance, realistic: c.simState.useRealisticScale };
}, { t: jd('2026-03-20T15:00:00Z'), lon, distance, fill: FILL });
const clouds = (visible) => page.evaluate((visible) => { window.__cap.bodyMeshes.get('earth').userData.quadtree.clouds.mesh.visible = visible; }, visible);

// Orbit lines off: they are see-through, drawn after the clouds, and blend with whatever is
// behind them, so with them on the N/Z mask would count line pixels as markers.
await toggle('#toggle-orbits', false);
// Satellites on once: switching the layer rebuilds it and parks every marker at Earth's centre
// until the propagation worker answers, so the variants below only hide or show its group.
await toggle('#toggle-earth-satellites', true);
await page.waitForFunction(() => {
  const group = window.__cap.scene.getObjectByName('satellite-layer-earth');
  return group?.children.some((o) => o.isMesh && o.position.lengthSq() > 0);
}, null, { timeout: 60_000 });
const satellites = (visible) => page.evaluate((visible) => { window.__cap.scene.getObjectByName('satellite-layer-earth').visible = visible; }, visible);
const inFront = () => page.evaluate(() => {
  const c = window.__cap;
  const V = c.camera.position.constructor;
  const earth = c.bodyMeshes.get('earth');
  const r = earth.userData.quadtree.baseRadius;
  const center = earth.getWorldPosition(new V());
  const group = c.scene.getObjectByName('satellite-layer-earth');
  let count = 0;
  for (const marker of group.children) {
    if (!marker.isMesh || marker.isInstancedMesh) continue;
    const p = marker.getWorldPosition(new V());
    const toCamera = c.camera.position.clone().sub(center).normalize();
    const lateral = p.clone().sub(center).sub(toCamera.clone().multiplyScalar(p.clone().sub(center).dot(toCamera)));
    if (p.clone().sub(center).dot(toCamera) > 0 && lateral.length() < r) count += 1;
  }
  return count;
});
const views = [];
for (const [realistic, distances] of [[false, [6, 30, 90]], [true, [60, 200]]]) {
  await toggle('#toggle-realistic-scale', realistic);
  await frames(5);
  await place(-45, distances[0]); // warm-up placement after the scale switch
  await frames(20);
  for (const distance of distances) for (const lon of [-45, 45, 135, -135]) {
    const name = `${realistic ? 'realistic' : 'enlarged'}-${distance}R-lon${lon}`;
    const placed = await place(lon, distance);
    await frames(10);
    const markersInFront = await inFront();
    for (const [variant, satellitesOn, cloudsOn] of [['Z', false, false], ['N', true, false], ['S', true, true]]) {
      await satellites(satellitesOn);
      await clouds(cloudsOn);
      await frames(4);
      await writeFile(`${outDir}/${name}-${variant}.png`, await page.locator('#space-canvas').screenshot());
    }
    views.push({ name, distance, lon, ...placed, fill: FILL, markersInFront });
    console.log(`${name}: range ${placed.rangeAu.toPrecision(3)} AU, Earth radius drawn ${placed.radiusAu.toPrecision(3)} AU, ${markersInFront} markers in front of the disk`);
  }
}
await clouds(true);
await satellites(true);
await writeFile(`${outDir}/views.json`, `${JSON.stringify(views, null, 2)}\n`);
console.log(`problems: ${JSON.stringify(problems)}`);
await browser.close();
