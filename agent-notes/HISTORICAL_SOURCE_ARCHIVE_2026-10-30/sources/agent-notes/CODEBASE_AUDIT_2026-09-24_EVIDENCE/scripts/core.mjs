import { chromium } from 'playwright'; import fs from 'fs';
const SP = process.env.SP, URL = process.env.URL, TAG = process.env.TAG, DPR = +(process.env.DPR || 1), EXT = +(process.env.EXT || 0);
const GPU = ['--no-sandbox','--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist','--enable-gpu'];
const b = await chromium.launch({ headless: false, args: GPU });
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: DPR });
await ctx.addInitScript({ path: SP + '/pw/instrument.js' });
const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable'); await cdp.send('Performance.enable');
const net = new Map(); cdp.on('Network.responseReceived', e => net.set(e.requestId, { url: e.response.url, status: e.response.status, type: e.type, bytes: 0 }));
cdp.on('Network.loadingFinished', e => { const r = net.get(e.requestId); if (r) r.bytes = e.encodedDataLength; });
cdp.on('Network.loadingFailed', e => net.set(e.requestId, { ...(net.get(e.requestId) || {}), failed: e.errorText, blocked: e.blockedReason, cors: e.corsErrorStatus && e.corsErrorStatus.corsError }));
const logs = []; p.on('console', m => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 260))); p.on('pageerror', e => logs.push('[pageerror] ' + e.message));
const t0 = Date.now(); await p.goto(URL, { waitUntil: 'load', timeout: 120000 }); const loadMs = Date.now() - t0;
// first frame + first "stable" frame (10 consecutive frames under 25 ms)
const firstFrames = await p.evaluate(() => new Promise(res => { const st = performance.now(); const t = []; let last = st;
  const f = ts => { t.push(ts - last); last = ts; const k = t.length;
    if (k >= 10 && t.slice(-10).every(x => x < 25)) return res({ stableAfterMs: ts - st, frames: k });
    if (ts - st > 30000) return res({ stableAfterMs: null, frames: k }); requestAnimationFrame(f); }; requestAnimationFrame(f); }));
await p.waitForTimeout(8000);
const ui = await p.evaluate(() => { const g = window.__m.gl, d = g && g.getExtension('WEBGL_debug_renderer_info');
  const txt = id => document.getElementById(id)?.textContent?.trim();
  return { renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : null, timerQuery: !!window.__m.timerExt,
    canvas: [document.getElementById('space-canvas').width, document.getElementById('space-canvas').height],
    statusCatalog: txt('status-catalog'), statusBodies: txt('status-bodies'), experiment: txt('experiment-status'),
    date: txt('time-date'), bodyOptions: document.getElementById('body-list')?.options?.length,
    solarText: [...document.querySelectorAll('[id*=solar],[class*=solar],[data-solar]')].map(e => e.textContent.trim()).filter(Boolean).slice(0, 5) }; });
const snap = async () => p.evaluate(() => { const M = window.__m; return { live: { ...M.live }, created: { ...M.created }, deleted: { ...M.deleted },
  heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, frames: M.frames.length, sizeWrites: M.canvasSizeWrites }; });
const window_ = async (sec) => { await p.evaluate(() => { window.__m.frames = []; window.__m.gpu = []; window.__m.rtt = []; });
  await p.waitForTimeout(sec * 1000);
  return p.evaluate(() => { const M = window.__m, F = M.frames.slice(1); const dt = F.slice(1).map((f, i) => f.t - F[i].t).sort((a, b) => a - b);
    const q = (a, x) => a.length ? +a[Math.min(a.length - 1, Math.floor(a.length * x))].toFixed(2) : null; const s = k => F.map(f => f[k]).sort((a, b) => a - b);
    const gpu = [...M.gpu].sort((a, b) => a - b), rtt = [...M.rtt].sort((a, b) => a - b);
    return { frames: F.length, fps_p50: dt.length ? +(1000 / q(dt, .5)).toFixed(1) : null, frameMs: { p50: q(dt, .5), p95: q(dt, .95), p99: q(dt, .99), max: dt.length ? +dt.at(-1).toFixed(1) : null },
      jsMs: { p50: q(s('jsMs'), .5), p95: q(s('jsMs'), .95), max: q(s('jsMs'), 1) }, gpuMs: gpu.length ? { p50: q(gpu, .5), p95: q(gpu, .95), n: gpu.length } : 'EXT_disjoint_timer_query_webgl2 unavailable',
      drawsPerFrame: q(s('draws'), .5), instancesPerFrame: q(s('instances'), .5), bufBytesPerFrame: { p50: q(s('bufBytes'), .5), max: q(s('bufBytes'), 1) },
      texUploadsPerFrame: q(s('texUploads'), .5), sizeWritesInWindow: F.reduce((a, f) => a + f.sizeWrites, 0),
      workerRttMs: rtt.length ? { p50: q(rtt, .5), p95: q(rtt, .95), n: rtt.length } : null, workerPosts: M.workerPosts }; }); };
if (process.env.REQUIRE_GPU && !/NVIDIA/.test(ui.renderer||'')) { console.log('ABORT: renderer is not the NVIDIA GPU:', ui.renderer); await b.close(); process.exit(3); }
const steady = await window_(30);
const series = []; const s0 = await snap(); series.push({ t: 0, ...s0 });
for (let k = 1; k <= EXT; k++) { await p.waitForTimeout(15000); series.push({ t: k * 15, ...(await snap()) }); }
await p.screenshot({ path: `${SP}/out/shots/${TAG}.png`, timeout: 60000 }).catch(e => logs.push('[screenshot] ' + e.message));
const perf = (await cdp.send('Performance.getMetrics')).metrics.filter(m => /TaskDuration|ScriptDuration|LayoutCount|RecalcStyleCount|JSHeapUsedSize/.test(m.name));
const reqs = [...net.values()]; const byType = {}; for (const r of reqs) { const k = r.type || 'other'; byType[k] = byType[k] || { n: 0, bytes: 0 }; byType[k].n++; byType[k].bytes += r.bytes || 0; }
const out = { tag: TAG, url: URL, dpr: DPR, loadMs, firstFrames, ui, steady, series, perf, requests: reqs.length,
  transferKB: +(reqs.reduce((a, r) => a + (r.bytes || 0), 0) / 1024).toFixed(1), byType,
  backendCalls: reqs.filter(r => /:8042\//.test(r.url || '')).map(r => ({ url: r.url.replace(/^.*:8042/, ''), status: r.status, failed: r.failed, cors: r.cors })),
  failures: reqs.filter(r => r.failed).map(r => ({ url: (r.url || '').slice(-80), failed: r.failed, cors: r.cors })), logs: logs.slice(0, 40) };
fs.writeFileSync(`${SP}/out/browser_${TAG}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ tag: TAG, loadMs, firstFrames, ui, steady, requests: out.requests, transferKB: out.transferKB, backendCalls: out.backendCalls.slice(0, 6), seriesFirstLast: [series[0], series.at(-1)] }, null, 1));
await b.close();
