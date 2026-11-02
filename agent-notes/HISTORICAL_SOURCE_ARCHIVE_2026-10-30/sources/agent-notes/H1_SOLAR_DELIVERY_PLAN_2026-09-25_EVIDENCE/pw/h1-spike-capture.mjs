// H-1 spike capture: records every /solar/physics and /solar/realtime/aia-tile request outcome for DUR seconds.
// env: URL, TAG, DUR (s, default 180), OUT (dir), SHOTS (comma list of seconds), ACTIONS (JSON [{t, js, label}])
import { chromium } from 'playwright';
import fs from 'fs';
const URL = process.env.URL, TAG = process.env.TAG || 'run', DUR = +(process.env.DUR || 180);
const OUT = process.env.OUT; fs.mkdirSync(`${OUT}/shots`, { recursive: true });
const SHOTS = (process.env.SHOTS || '12,16').split(',').filter(Boolean).map(Number);
const ACTIONS = JSON.parse(process.env.ACTIONS || '[]');
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable');
const T0 = Date.now(); const rel = () => Date.now() - T0;
const isSolar = u => /\/solar\/(physics|realtime\/aia-tile)/.test(u);
const reqs = new Map(); let seq = 0; const cdpById = new Map();
const logs = []; const timings = [];
cdp.on('Network.requestWillBeSent', e => { if (isSolar(e.request.url)) cdpById.set(e.requestId, { url: e.request.url }); });
cdp.on('Network.loadingFailed', e => { const r = cdpById.get(e.requestId); if (r) { r.errorText = e.errorText; r.canceled = e.canceled; r.blockedReason = e.blockedReason; r.cors = e.corsErrorStatus?.corsError || null; } });
cdp.on('Network.responseReceived', e => { const r = cdpById.get(e.requestId); if (r) { r.status = e.response.status; r.acao = e.response.headers['access-control-allow-origin'] || e.response.headers['Access-Control-Allow-Origin'] || null; } });
cdp.on('Network.loadingFinished', e => { const r = cdpById.get(e.requestId); if (r) r.encodedBytes = e.encodedDataLength; });
p.on('request', r => { if (!isSolar(r.url())) return; const id = ++seq; r.__id = id; reqs.set(r, { id, kind: /aia-tile/.test(r.url()) ? 'aia' : 'physics', url: r.url(), jd: +(new globalThis.URL(r.url()).searchParams.get('jd')) || null, tStart: rel() }); });
p.on('response', r => { const e = reqs.get(r.request()); if (e) { e.status = r.status(); e.tResp = rel(); e.spikeCache = r.headers()['x-spike-cache'] || null; } });
p.on('requestfinished', async r => { const e = reqs.get(r); if (!e) return; e.tEnd = rel(); e.outcome = 'finished'; try { const s = await r.sizes(); e.respBodyBytes = s.responseBodySize; } catch {} });
p.on('requestfailed', r => { const e = reqs.get(r); if (!e) return; e.tEnd = rel(); e.outcome = 'failed'; e.failure = r.failure()?.errorText; });
p.on('console', m => { const t = m.text(); const rec = { t: rel(), type: m.type(), text: t.slice(0, 400) }; if (t.startsWith('[spike-timing]')) { try { timings.push({ t: rec.t, ...JSON.parse(t.slice(15)) }); } catch { logs.push(rec); } } else logs.push(rec); });
p.on('pageerror', e => logs.push({ t: rel(), type: 'pageerror', text: String(e.message).slice(0, 400) }));
await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
const tLoad = rel();
const samples = []; const shots = [];
let firstSuccessShotDone = false; const pending = [...SHOTS].sort((a, b) => a - b); const acts = [...ACTIONS].sort((a, b) => a.t - b.t);
const sample = async () => p.evaluate(() => ({ date: document.getElementById('time-date')?.textContent?.trim(), scale: document.getElementById('time-scale-value')?.textContent?.trim(), spike: window.__spikeSolar ? window.__spikeSolar() : null })).catch(e => ({ err: e.message }));
const shot = async (label) => { const path = `${OUT}/shots/${TAG}_${label}.png`; try { await p.screenshot({ path, timeout: 60000 }); shots.push({ t: rel(), label, path }); } catch (e) { logs.push({ t: rel(), type: 'shot-error', text: e.message }); } };
while (rel() < DUR * 1000) {
  const tS = rel() / 1000;
  while (acts.length && acts[0].t <= tS) { const a = acts.shift(); let r; if (a.wheel) { await p.mouse.move(a.x || 815, a.y || 400); for (let i = 0; i < a.wheel; i++) { await p.mouse.wheel(0, a.dy || -400); await p.waitForTimeout(120); } r = 'wheel x' + a.wheel; } else r = await p.evaluate(a.js).catch(e => 'ERR ' + e.message); logs.push({ t: rel(), type: 'action', text: `${a.label}: ${JSON.stringify(r)}` }); }
  while (pending.length && pending[0] <= tS) { const s = pending.shift(); await shot(`t${s}`); }
  if (!firstSuccessShotDone) { const ok = [...reqs.values()].find(e => e.kind === 'physics' && e.status === 200 && e.outcome === 'finished'); if (ok && rel() - ok.tEnd > 4000) { firstSuccessShotDone = true; await shot('firstSuccessPlus4s'); } }
  if (samples.length === 0 || rel() - samples.at(-1).t > 5000) samples.push({ t: rel(), ...(await sample()) });
  await p.waitForTimeout(500);
}
await shot('end');
const cdpList = [...cdpById.values()];
const list = [...reqs.values()].map(e => { const c = cdpList.find(x => x.url === e.url && !x.__used); if (c) c.__used = true; return { ...e, durMs: e.tEnd != null ? e.tEnd - e.tStart : null, cdp: c ? { status: c.status, errorText: c.errorText, canceled: c.canceled, cors: c.cors, blockedReason: c.blockedReason, acao: c.acao, encodedBytes: c.encodedBytes } : null }; });
const summarize = kind => { const L = list.filter(e => e.kind === kind); const by = {}; for (const e of L) { const k = e.outcome === 'finished' ? `http_${e.status}` : (e.cdp?.cors ? `cors:${e.cdp.cors}` : (e.cdp?.canceled || /ABORT/i.test(e.failure || '') ? 'aborted' : `failed:${e.failure}`)); by[k] = (by[k] || 0) + 1; } const ok = L.filter(e => e.status === 200 && e.outcome === 'finished').map(e => e.durMs).sort((a, b) => a - b); const q = x => ok.length ? ok[Math.min(ok.length - 1, Math.floor(ok.length * x))] : null; const cache = {}; for (const e of L) if (e.spikeCache) cache[e.spikeCache] = (cache[e.spikeCache] || 0) + 1; const hitDur = L.filter(e => e.spikeCache === 'HIT').map(e => e.durMs).sort((a, b) => a - b); const missDur = L.filter(e => e.spikeCache === 'MISS').map(e => e.durMs).sort((a, b) => a - b); return { n: L.length, by, cache, hitDurMs: hitDur, missDurMs: missDur, okDurMs: { n: ok.length, min: ok[0] ?? null, p50: q(0.5), p95: q(0.95), max: ok.at(-1) ?? null }, inFlightAtEnd: L.filter(e => e.tEnd == null).length }; };
const out = { tag: TAG, url: URL, durS: DUR, tLoad, physics: summarize('physics'), aia: summarize('aia'), requests: list, timings, samples, shots, logs };
fs.writeFileSync(`${OUT}/capture_${TAG}.json`, JSON.stringify(out, null, 1));
const errLogs = logs.filter(l => l.type === 'error' || l.type === 'pageerror' || l.type === 'warning');
console.log(JSON.stringify({ tag: TAG, tLoad, physics: out.physics, aia: out.aia, nTimings: timings.length, timings: timings.slice(0, 8), firstSamples: samples.slice(0, 2), lastSample: samples.at(-1), shots: shots.map(s => s.label), errorLogCount: errLogs.length, errorLogsHead: errLogs.slice(0, 12) }, null, 1));
await b.close();
