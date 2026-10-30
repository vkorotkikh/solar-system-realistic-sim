import { chromium } from 'playwright'; import fs from 'fs';
const SP = process.env.SP, BASE = process.env.URL || 'http://127.0.0.1:5173/';
const GPU = ['--no-sandbox','--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist','--enable-gpu'];
const b = await chromium.launch({ headless: false, args: GPU });
const bin = fs.readFileSync(SP + '/wt/public/data/asteroid-phase1/asteroid_phase1_main_100000.bin');
const results = {}; const save = () => fs.writeFileSync(SP + '/out/browser_battery.json', JSON.stringify(results, null, 1));
async function open({ dpr = 1, vw = 1600, vh = 900, route = null, reducedMotion = 'no-preference' } = {}) {
  const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, reducedMotion });
  await ctx.addInitScript({ path: SP + '/pw/instrument.js' });
  if (route) await route(ctx);
  const p = await ctx.newPage(); const logs = []; p.on('console', m => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 220))); p.on('pageerror', e => logs.push('[pageerror] ' + e.message));
  await p.goto(BASE, { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(9000);
  return { ctx, p, logs };
}
const measure = (p, sec) => p.evaluate(async (sec) => { const M = window.__m; M.frames = []; M.gpu = [];
  await new Promise(r => setTimeout(r, sec * 1000)); const F = M.frames.slice(1); const dt = F.slice(1).map((f, i) => f.t - F[i].t).sort((a, b) => a - b);
  const q = (a, x) => a.length ? +a[Math.min(a.length - 1, Math.floor(a.length * x))].toFixed(2) : null; const s = k => F.map(f => f[k]).sort((a, b) => a - b); const g = [...M.gpu].sort((a, b) => a - b);
  const c = document.getElementById('space-canvas');
  return { fps: dt.length ? +(1000 / q(dt, .5)).toFixed(1) : null, frameP99: q(dt, .99), jsP95: q(s('jsMs'), .95), gpuP50: q(g, .5), gpuP95: q(g, .95),
    bufBytesPerFrame: q(s('bufBytes'), .5), draws: q(s('draws'), .5), sizeWrites: F.reduce((a, f) => a + f.sizeWrites, 0), canvas: [c.width, c.height, c.clientWidth, c.clientHeight],
    date: document.getElementById('time-date')?.textContent, catalog: document.getElementById('status-catalog')?.textContent }; }, sec);
const renderer = p => p.evaluate(() => { const g = window.__m.gl, d = g && g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : null; });
// 1. forced-GC heap trend over 5 minutes
{ const { ctx, p } = await open(); const cdp = await ctx.newCDPSession(p); results.renderer = await renderer(p); const pts = [];
  for (let k = 0; k <= 10; k++) { await cdp.send('HeapProfiler.collectGarbage'); const h = await p.evaluate(() => performance.memory.usedJSHeapSize / 1048576);
    const f = await p.evaluate(() => window.__m.frames.length); pts.push({ t: k * 30, heapMB_postGC: +h.toFixed(2), live: await p.evaluate(() => ({ ...window.__m.live })) }); if (k < 10) await p.waitForTimeout(30000); }
  results.heapPostGC = pts; save(); await ctx.close(); }
// 2. interaction states
{ const { ctx, p, logs } = await open(); const S = {};
  S.default = await measure(p, 8);
  await p.evaluate(()=>document.getElementById('toggle-play').click()); await p.waitForTimeout(1500); S.paused = await measure(p, 8); await p.evaluate(()=>document.getElementById('toggle-play').click());
  const setScale = async v => p.evaluate(v => { const r = document.getElementById('time-scale'); r.value = String(v); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); }, v);
  await setScale(-120); await p.waitForTimeout(1000); const d0 = await p.evaluate(() => document.getElementById('time-date').textContent); S.reverseMax = await measure(p, 6); S.reverseMax.dateBefore = d0;
  await setScale(120); await p.waitForTimeout(1000); S.forwardMax = await measure(p, 6);
  await p.evaluate(()=>document.getElementById('toggle-realistic-scale').click()); await p.waitForTimeout(1500); S.realisticScale = await measure(p, 6); await p.evaluate(()=>document.getElementById('toggle-realistic-scale').click());
  await p.evaluate(()=>document.getElementById('now-time').click()); await p.waitForTimeout(800); S.afterNow = await measure(p, 3);
  const cdp = await ctx.newCDPSession(p); await cdp.send('Performance.enable'); const m0 = (await cdp.send('Performance.getMetrics')).metrics;
  const f0 = await p.evaluate(() => window.__m.frames.length); await p.waitForTimeout(10000); const m1 = (await cdp.send('Performance.getMetrics')).metrics; const f1 = await p.evaluate(() => window.__m.frames.length);
  const g = (m, n) => m.find(x => x.name === n)?.value || 0;
  S.layoutPerFrame = +((g(m1, 'LayoutCount') - g(m0, 'LayoutCount')) / Math.max(1, f1 - f0)).toFixed(3);
  S.styleRecalcPerFrame = +((g(m1, 'RecalcStyleCount') - g(m0, 'RecalcStyleCount')) / Math.max(1, f1 - f0)).toFixed(3);
  S.layoutMsPerFrame = +(((g(m1, 'LayoutDuration') - g(m0, 'LayoutDuration')) * 1000) / Math.max(1, f1 - f0)).toFixed(3);
  S.pageErrors = logs.filter(l => l.startsWith('[pageerror]')); results.interactions = S; save(); await ctx.close(); }
// 3. DPR
results.dpr = {}; for (const dpr of [1, 2, 3]) { const { ctx, p } = await open({ dpr }); results.dpr[dpr] = await measure(p, 8); save(); await ctx.close(); }
// 4. catalog failure modes
const variants = {
  truncated: async ctx => ctx.route('**/asteroid_phase1_main_100000.bin', r => r.fulfill({ status: 200, contentType: 'application/octet-stream', body: bin.subarray(0, 1_000_000) })),
  corrupt_byte: async ctx => ctx.route('**/asteroid_phase1_main_100000.bin', r => { const c = Buffer.from(bin); c[50000] ^= 0xff; return r.fulfill({ status: 200, body: c }); }),
  meta_404: async ctx => ctx.route('**/asteroid_phase1_main_100000.meta.json', r => r.fulfill({ status: 404, body: 'nope' })),
  bin_404: async ctx => ctx.route('**/asteroid_phase1_main_100000.bin', r => r.fulfill({ status: 404, body: 'nope' })),
  slow_6s: async ctx => ctx.route('**/asteroid_phase1_main_100000.bin', async r => { await new Promise(z => setTimeout(z, 6000)); return r.continue(); }),
  backend_offline: async ctx => ctx.route('**/*:8042/**', r => r.abort('connectionrefused')),
};
results.failureModes = {};
for (const [k, fn] of Object.entries(variants)) { const { ctx, p, logs } = await open({ route: fn }); if (k === 'slow_6s') await p.waitForTimeout(6000);
  results.failureModes[k] = { catalog: await p.evaluate(() => document.getElementById('status-catalog')?.textContent), catalogState: await p.evaluate(() => document.getElementById('status-catalog')?.dataset?.state),
    bodies: await p.evaluate(() => document.getElementById('status-bodies')?.textContent), pageErrors: logs.filter(l => l.startsWith('[pageerror]')).length,
    warns: logs.filter(l => /phase-1|catalog/i.test(l)).slice(0, 2) }; await ctx.close(); }
fs.writeFileSync(SP + '/out/browser_battery.json', JSON.stringify(results, null, 1)); console.log(JSON.stringify(results, null, 1)); await b.close();
