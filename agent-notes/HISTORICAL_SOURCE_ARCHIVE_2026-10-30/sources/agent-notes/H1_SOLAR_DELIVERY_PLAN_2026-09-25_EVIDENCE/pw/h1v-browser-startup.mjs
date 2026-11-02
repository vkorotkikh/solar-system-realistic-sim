// H-1 browser matrix: does the first /solar/physics attempt time out against an instant local server
// because the page's own startup work blocks the main thread? Records chip changes, long tasks
// (PerformanceObserver 'longtask') and CDP timings of the first physics requests. No screenshots.
import { chromium } from 'playwright';
import fs from 'fs';
const OUT = process.env.OUT; const RUNS = +(process.env.RUNS || 3); const SEC = +(process.env.SEC || 12);
const URL_ = process.env.URL || 'http://127.0.0.1:5191/';
const results = [];
for (let run = 1; run <= RUNS; run++) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    window.__lt = []; window.__chip = [];
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch {}
    const rec = () => { const el = document.getElementById('status-solar'); if (!el) return false;
      const push = () => { const k = el.dataset.solarState + '|' + el.textContent; if (window.__chip.at(-1)?.k !== k) window.__chip.push({ k, t: Math.round(performance.now()) }); };
      push(); new MutationObserver(push).observe(el, { childList: true, characterData: true, subtree: true, attributes: true }); return true; };
    if (!rec()) { const mo = new MutationObserver(() => { if (rec()) mo.disconnect(); }); mo.observe(document, { childList: true, subtree: true }); }
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable');
  const reqs = new Map(); let navTs = null;
  cdp.on('Network.requestWillBeSent', (e) => { if (navTs === null && e.type === 'Document') navTs = e.timestamp;
    if (/\/solar\/physics\?/.test(e.request.url)) reqs.set(e.requestId, { ts0: e.timestamp }); });
  cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r) { r.status = e.response.status; r.tResp = e.timestamp; } });
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) r.tDone = e.timestamp; });
  cdp.on('Network.loadingFailed', (e) => { const r = reqs.get(e.requestId); if (r) { r.tFail = e.timestamp; r.err = e.errorText; } });
  const warns = []; page.on('console', (m) => { if (m.text().includes('[solar]')) warns.push(m.text()); });
  await page.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(SEC * 1000);
  const chip = await page.evaluate(() => window.__chip);
  const lt = await page.evaluate(() => window.__lt);
  const nav = await page.evaluate(() => performance.timeOrigin);
  const rel = (ts) => ts == null || navTs == null ? null : Math.round((ts - navTs) * 1000);
  const R = [...reqs.values()].slice(0, 3).map((r) => ({ sentMs: rel(r.ts0), respMs: rel(r.tResp), doneMs: rel(r.tDone), failMs: rel(r.tFail), status: r.status ?? null, err: r.err ?? null }));
  const longTasksOver500 = lt.filter(([s, d]) => d >= 500);
  results.push({ run, chip: chip.map((c) => `${c.t}ms ${c.k}`), firstPhysicsRequests: R, longTasksOver500, longTaskTotalMs: lt.reduce((a, [, d]) => a + d, 0), solarWarns: warns });
  await browser.close();
}
fs.writeFileSync(`${OUT}/startup-false-timeout.json`, JSON.stringify(results, null, 1));
console.log(JSON.stringify(results, null, 1));
