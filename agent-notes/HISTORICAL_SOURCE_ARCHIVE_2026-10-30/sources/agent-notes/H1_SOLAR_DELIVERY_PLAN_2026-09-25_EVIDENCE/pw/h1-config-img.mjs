// Load the AIA proxy tile the way three's TextureLoader does (img.crossOrigin='anonymous')
// and a physics fetch, from several page origins, against a backend whose allowlist is
// SOLAR_CORS_ALLOWED_ORIGINS=http://localhost:5184 only.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const OUT = '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/config';
const backend = process.argv[2] || 'http://127.0.0.1:8074';
const pages = (process.argv[3] || 'http://localhost:5184/,http://127.0.0.1:5184/').split(',');

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const results = [];
for (const pageUrl of pages) {
  const page = await browser.newPage();
  // Navigate to a static JSON asset on the real server so the document has the right origin
  // (a route-fulfilled document is treated as 'public' by Chrome's local-network rules)
  // and no app code runs.
  await page.goto(new URL('/data/asteroid-phase1/asteroid_phase1_main_100000.meta.json', pageUrl).toString());
  const res = await page.evaluate(async (b) => {
    const img = await new Promise((resolve) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      const t0 = performance.now();
      el.onload = () => {
        let taintFree = null;
        try { const c = document.createElement('canvas'); c.width = 4; c.height = 4; const g = c.getContext('2d'); g.drawImage(el, 0, 0, 4, 4); g.getImageData(0, 0, 1, 1); taintFree = true; } catch { taintFree = false; }
        resolve({ ok: true, ms: Math.round(performance.now() - t0), w: el.naturalWidth, taintFree });
      };
      el.onerror = () => resolve({ ok: false, ms: Math.round(performance.now() - t0) });
      el.src = `${b}/solar/realtime/aia-tile?channel=aia_304`;
    });
    let fetchRes;
    try {
      const r = await fetch(`${b}/solar/physics?jd=2461308.5&fidelity=preview&max_features=64&forcing=synthetic&live_data=false`, { cache: 'no-store' });
      fetchRes = { ok: true, status: r.status, retryAfterReadable: r.headers.get('retry-after') };
    } catch (e) { fetchRes = { ok: false, error: String(e) }; }
    return { img, fetch: fetchRes };
  }, backend);
  results.push({ pageOrigin: new URL(pageUrl).origin, ...res });
  await page.close();
}
await browser.close();
writeFileSync(`${OUT}/browser-img-cors.json`, JSON.stringify(results, null, 1));
console.log(JSON.stringify(results, null, 1));
