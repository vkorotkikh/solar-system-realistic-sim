// Startup cost of preloading, A against B: two Vite dev servers of the app, one per checkout.
// Usage: node startup.mjs <labelA>=<urlA> <labelB>=<urlB> [runs]
// Each run is a fresh browser, so shader and HTTP caches are cold in both arms.
import { launch, median, loadAverage } from '../lib/headless-gpu.mjs';

const args = process.argv.slice(2);
const arms = args.filter((arg) => arg.includes('=')).map((arg) => { const [label, url] = arg.split('='); return { label, url }; });
const runs = Number(args.find((arg) => /^\d+$/.test(arg)) ?? 5);
if (arms.length < 1) throw new Error('usage: node startup.mjs <label>=<url> [<label>=<url>] [runs]');

// Inserted into main.ts as Vite serves it (re-indented, so anchors ignore leading spaces):
// timestamps around the first frame, then a probe of what loaded. A missing anchor fails
// loudly instead of measuring nothing.
const FIRST_FRAME = /updateLabels\(\);\s*\n\s*renderer\.render\(scene, camera\);/;
const CATALOG = /const catalog = createSolarSystemCatalog\(\{ moonEphemerides \}\);/;
const MAPS = /ownDisposable\(createPlanetSurfaceMaps\(\{/;

// Arms whose label contains these words switch one preload off in the served preload build:
// 'nofits' loads only the 21 named moons' fits, 'nomaps' gives the surface-map loader no targets.
async function once(url, label = '') {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript(() => {
    window.__t = {};
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(...rest) {
        super(...rest);
        const post = this.postMessage.bind(this);
        this.postMessage = (message, ...more) => {
          if (message?.type !== 'init') return post(message, ...more);
          let bytes = -1;
          try { bytes = JSON.stringify(message).length; } catch { /* not serialisable as JSON */ }
          const before = performance.now();
          window.__t.workerInitPosted = before;
          const result = post(message, ...more);
          window.__t.workerInitJsonBytes = bytes;
          window.__t.workerPostBlockedMs = performance.now() - before;
          this.addEventListener('message', (event) => { if (event.data?.type === 'ready') window.__t.workerReady = performance.now(); });
          return result;
        };
      }
    };
  });
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    const swap = (pattern, insert, required = true) => {
      const match = body.match(pattern);
      if (!match) { if (required) throw new Error(`anchor missing: ${pattern}`); return; }
      body = body.replace(match[0], insert(match[0]));
    };
    swap(CATALOG, (found) => `${found}\nwindow.__t.moonFits = Object.keys(moonEphemerides ?? {}).length; window.__t.fitsLoaded = performance.now();`);
    if (label.includes('nofits')) swap(/loadAllMoonEphemerides\(\)\.catch\(/, () => '(await import("/src/sim/loadMoonEphemerides.ts")).loadNamedMoonEphemerides().catch(');
    if (label.includes('nomaps')) swap(MAPS, () => 'ownDisposable(((options) => createPlanetSurfaceMaps({ ...options, targets: [] }))({');
    swap(MAPS, (found) => `window.__maps = ${found}`, false);
    swap(FIRST_FRAME, (found) => `${found}
  window.__t.renderReturned = performance.now();
  { const gl = renderer.getContext(), px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); window.__t.firstPicture = performance.now(); }
  { let n = 0; const tick = (now) => { if (++n === 30) window.__t.thirtyFrames = now; else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
  window.__maps?.ready?.then(() => { window.__t.mapsReady = performance.now(); });`);
    await route.fulfill({ response, body, headers: { ...response.headers(), 'content-type': 'text/javascript' } });
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__t?.thirtyFrames, null, { timeout: 120_000 });
  // Stalls after startup, for example from texture uploads: the longest frame gap over 8 s.
  const worstFrameNext8s = await page.evaluate(() => new Promise((resolve) => {
    let last = performance.now(), worst = 0; const end = last + 8_000;
    const tick = (now) => { worst = Math.max(worst, now - last); last = now; if (now < end) requestAnimationFrame(tick); else resolve(worst); };
    requestAnimationFrame(tick);
  }));
  const t = { ...(await page.evaluate(() => window.__t)), worstFrameNext8s };
  await browser.close();
  return Object.fromEntries(Object.entries(t).map(([key, value]) => [key, Math.round(value)]));
}

console.log(`load average at start: ${await loadAverage()}`);
const results = Object.fromEntries(arms.map(({ label }) => [label, []]));
for (let run = 0; run < runs; run += 1) for (const { label, url } of arms) results[label].push(await once(url, label));
for (const { label } of arms) {
  const rows = results[label];
  const pick = (key) => median(rows.map((row) => row[key] ?? NaN));
  console.log(`${label}: first picture ${pick('firstPicture')} ms | 30 frames ${pick('thirtyFrames')} ms | worst frame next 8 s ${pick('worstFrameNext8s')} ms | moon fits ${pick('moonFits')} (loaded at ${pick('fitsLoaded')} ms) | maps ready ${pick('mapsReady')} ms | worker init ${pick('workerInitJsonBytes')} B JSON, post blocked ${pick('workerPostBlockedMs')} ms, posted at ${pick('workerInitPosted')} ms, ready at ${pick('workerReady')} ms`);
  console.log(`  worker init to ready, per run: ${JSON.stringify(rows.map((row) => row.workerReady - row.workerInitPosted))} ms`);
  console.log(`  runs ${JSON.stringify(rows)}`);
}
console.log(`load average at end: ${await loadAverage()}`);
