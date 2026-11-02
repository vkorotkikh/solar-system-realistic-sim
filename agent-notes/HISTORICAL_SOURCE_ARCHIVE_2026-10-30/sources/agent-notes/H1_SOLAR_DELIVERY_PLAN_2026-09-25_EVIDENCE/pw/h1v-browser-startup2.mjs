// H-1 browser matrix, startup false-timeout, precise: wraps window.fetch (observation only) to time each
// /solar/physics call (call, resolve, body-read, abort event) and runs a 50 ms heartbeat to find main-thread stalls.
import { chromium } from 'playwright';
import fs from 'fs';
const OUT = process.env.OUT; const RUNS = +(process.env.RUNS || 2); const SEC = +(process.env.SEC || 10);
const URL_ = process.env.URL || 'http://127.0.0.1:5191/';
const results = [];
for (let run = 1; run <= RUNS; run++) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    const now = () => Math.round(performance.now());
    window.__ev = []; window.__gaps = []; let last = now();
    setInterval(() => { const t = now(); if (t - last > 250) window.__gaps.push([last, t - last]); last = t; }, 50);
    const orig = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = String(input?.url ?? input);
      if (!/\/solar\/physics\?|\/health/.test(url)) return orig(input, init);
      const id = (window.__fid = (window.__fid || 0) + 1); const k = /health/.test(url) ? 'health' : 'physics';
      window.__ev.push([now(), id, k, 'call']);
      init?.signal?.addEventListener('abort', () => window.__ev.push([now(), id, k, 'signal-abort']));
      const p = orig(input, init);
      p.then((r) => { window.__ev.push([now(), id, k, `resolved ${r.status} ${r.type}`]);
        const j = r.json; r.json = function () { window.__ev.push([now(), id, k, 'json() called']); const q = j.call(r); q.then(() => window.__ev.push([now(), id, k, 'json() resolved']), (e) => window.__ev.push([now(), id, k, 'json() rejected ' + e.name])); return q; };
      }, (e) => window.__ev.push([now(), id, k, 'rejected ' + e.name]));
      return p;
    };
    const rec = () => { const el = document.getElementById('status-solar'); if (!el) return false;
      const push = () => window.__ev.push([now(), 0, 'chip', el.dataset.solarState + ' | ' + el.textContent]);
      push(); new MutationObserver(push).observe(el, { childList: true, characterData: true, subtree: true, attributes: true }); return true; };
    if (!rec()) { const mo = new MutationObserver(() => { if (rec()) mo.disconnect(); }); mo.observe(document, { childList: true, subtree: true }); }
  });
  const page = await ctx.newPage();
  await page.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(SEC * 1000);
  const ev = await page.evaluate(() => window.__ev);
  const gaps = await page.evaluate(() => window.__gaps);
  results.push({ run, events: ev.slice(0, 40).map((e) => `${e[0]}ms #${e[1]} ${e[2]} ${e[3]}`), mainThreadStallsOver250ms: gaps.map(([s, d]) => `${s}ms +${d}ms`) });
  await browser.close();
}
fs.writeFileSync(`${OUT}/startup-false-timeout-precise.json`, JSON.stringify(results, null, 1));
console.log(JSON.stringify(results, null, 1));
