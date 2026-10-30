// Attribute the startup main-thread stall (that makes the first /solar/physics read time out) to code:
// CPU-profile the first SEC seconds of a page load and aggregate self time by function/url.
import { chromium } from 'playwright';
import fs from 'fs';
const OUT = process.env.OUT; const SEC = +(process.env.SEC || 6);
const URL_ = process.env.URL || 'http://127.0.0.1:5191/';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  window.__lt = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch {}
  window.__phys = [];
  const orig = window.fetch.bind(window);
  window.fetch = (input, init) => { const url = String(input?.url ?? input); if (/\/solar\/physics\?/.test(url)) window.__phys.push(Math.round(performance.now())); return orig(input, init); };
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await cdp.send('Profiler.start');
await page.goto(URL_, { waitUntil: 'load', timeout: 120000 });
await page.waitForTimeout(SEC * 1000);
const { profile } = await cdp.send('Profiler.stop');
const lt = await page.evaluate(() => window.__lt);
const phys = await page.evaluate(() => window.__phys);
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dts = profile.timeDeltas; let i = 0;
for (const sid of profile.samples) { const n = byId.get(sid); const cf = n.callFrame; const key = `${cf.functionName || '(anon)'} ${cf.url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]}:${cf.lineNumber + 1}`; self.set(key, (self.get(key) || 0) + (dts[i++] || 0)); }
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, us]) => `${Math.round(us / 1000)}ms ${k}`);
// inclusive time per top-level-ish app function: walk parents
const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
const incl = new Map(); i = 0;
for (const sid of profile.samples) { const dt = dts[i++] || 0; const seen = new Set(); let id = sid; while (id) { const cf = byId.get(id).callFrame; if (/\/src\//.test(cf.url)) { const key = `${cf.functionName || '(anon)'} ${cf.url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]}:${cf.lineNumber + 1}`; if (!seen.has(key)) { seen.add(key); incl.set(key, (incl.get(key) || 0) + dt); } } id = parent.get(id); } }
const topIncl = [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, us]) => `${Math.round(us / 1000)}ms ${k}`);
const res = { physicsFetchCalledAtMs: phys, longTasks: lt, topSelf: top, topInclusiveSrc: topIncl };
fs.writeFileSync(`${OUT}/startup-stall-profile.json`, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res, null, 1));
await browser.close();
