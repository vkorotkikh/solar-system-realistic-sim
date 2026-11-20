// Does Earth's cloud shell (10 km up, no depth writes) lose pixels to the depth buffer far out?
// Usage: node cloud-depth.mjs <app url> <output dir>
// Realistic scale. At each distance Earth is magnified to fill the frame by narrowing the field
// of view; the clip planes, and so the depth buffer's resolution, stay those of that distance.
// Each view is drawn four ways:
//   A  clouds as shipped, with whatever depth offset the served branch gives the shell
//   B  clouds with the depth test off: the reference, since no front-facing point of a sphere
//      enclosing the globe can be behind it
//   C  control: the shell lowered to 1 km with no offset, so a depth problem shows if this
//      method can see one
//   D  no clouds, to count the pixels that carry cloud at all
// OFFSETS=4,8,f1u4 adds variants drawn like A with a depth offset on the shell: N is units -N,
// fXuN is factor -X and units -N. analyze.py counts disk pixels where each differs from B.
import { mkdir, writeFile } from 'node:fs/promises';
import { assertRenderer, launch } from '../lib/headless-gpu.mjs';

const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) throw new Error('usage: node cloud-depth.mjs <app url> <output dir>');
await mkdir(outDir, { recursive: true });

const jd = (iso) => 2440587.5 + Date.parse(iso) / 86_400_000;
const FIRST_FRAME = /updateLabels\(\);\s*\n\s*renderer\.render\(scene, camera\);/;
const MAPS = /ownDisposable\(createPlanetSurfaceMaps\(\{/;
const FILL = 0.8; // Earth's disk spans this fraction of the frame height

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
    [FIRST_FRAME, (found) => `${found}\n  window.__cap = { simState, camera, controls, bodyMeshes, focusBody };`],
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
await page.evaluate(() => {
  const box = document.querySelector('#toggle-realistic-scale');
  if (!box.checked) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
});
await frames(5);

const offsets = (process.env.OFFSETS ?? '').split(',').filter(Boolean);
const variants = ['A', 'B', 'C', 'D', ...offsets.map((o) => `O${o}`)];
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
      c.controls.target.copy(center);
      c.camera.up.copy(mesh.localToWorld(new V(0, r, 0)).sub(center).normalize());
      c.camera.position.copy(center).addScaledVector(dir, r * distance);
      c.camera.fov = (2 * Math.asin(1 / distance) / fill) * 180 / Math.PI;
      c.camera.updateProjectionMatrix();
      c.controls.update();
      return { radiusKm: r * 149_597_870.7, realistic: c.simState.useRealisticScale };
    }, { t: jd('2026-03-20T15:00:00Z'), lon, distance, fill: FILL });
await place(-45, 10); // warm-up: the first placement after the scale switch draws a blank frame
await frames(20);

const views = [];
for (const distance of [10, 20, 40, 60]) {
  for (const lon of [-45, -40]) {
    const name = `${distance}R-lon${lon}`;
    const placed = await place(lon, distance);
    await frames(4);
    for (const variant of variants) {
      const state = await page.evaluate((variant) => {
        const c = window.__cap;
        const tree = c.bodyMeshes.get('earth').userData.quadtree;
        tree.clouds.setRadius(tree.baseRadius);
        if (variant === 'C') tree.clouds.mesh.scale.setScalar(tree.baseRadius * (1 + 1 / 6371.0088));
        const material = tree.clouds.mesh.material;
        material.depthTest = variant !== 'B';
        const { polygonOffset, polygonOffsetFactor, polygonOffsetUnits } = material;
        window.__shipped ??= { polygonOffset, polygonOffsetFactor, polygonOffsetUnits };
        const offset = variant.startsWith('O') ? variant.slice(1).match(/^(?:f(\d+)u)?(\d+)$/) : null;
        Object.assign(material, offset
          ? { polygonOffset: true, polygonOffsetFactor: -Number(offset[1] ?? 0), polygonOffsetUnits: -Number(offset[2]) }
          : variant === 'C' ? { polygonOffset: false, polygonOffsetFactor: 0, polygonOffsetUnits: 0 } : window.__shipped);
        tree.clouds.mesh.visible = variant !== 'D';
        return { near: c.camera.near, far: c.camera.far, fov: c.camera.fov, shipped: window.__shipped };
      }, variant);
      await frames(3);
      const kept = await page.evaluate(() => window.__cap.bodyMeshes.get('earth').userData.quadtree.clouds.mesh.scale.x);
      await writeFile(`${outDir}/${name}-${variant}.png`, await page.locator('#space-canvas').screenshot());
      if (variant === 'A') views.push({ name, distance, lon, ...placed, ...state, fill: FILL, variants });
      if (variant === 'C') views.at(-1).controlScaleHeld = kept;
    }
    console.log(`${name}: fov ${views.at(-1).fov.toFixed(3)} deg, near ${(views.at(-1).near * 149_597_870.7).toFixed(1)} km, Earth radius drawn ${Math.round(placed.radiusKm)} km, realistic ${placed.realistic}`);
  }
}
await page.evaluate(() => {
  const tree = window.__cap.bodyMeshes.get('earth').userData.quadtree;
  tree.clouds.setRadius(tree.baseRadius);
  Object.assign(tree.clouds.mesh.material, { depthTest: true, ...window.__shipped });
  tree.clouds.mesh.visible = true;
});
await writeFile(`${outDir}/views.json`, `${JSON.stringify(views, null, 2)}\n`);
console.log(`problems: ${JSON.stringify(problems)}`);
await browser.close();
