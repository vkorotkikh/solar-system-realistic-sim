// H-1 status-chip browser matrix (verify2). One page load per scenario.
// env: URL (default http://127.0.0.1:5191/), SCEN (tag), SECONDS, OUTDIR,
//      PHASE2_SECONDS + KILL_PID (optional: after SECONDS, SIGTERM that pid and observe PHASE2_SECONDS more),
//      CAPTURE_BODIES=1 (keep data_assimilation of every 200 /solar/physics body + first full body)
// Records (timestamped, seconds since script start):
//   chip #status-solar text + data-solar-state (MutationObserver from addInitScript),
//   announcer #status-solar-announcer every textContent write,
//   '[solar]' console lines, page errors, and every /solar/physics, /health, /solar/realtime/aia-tile request
//   (sec-fetch-mode, outcome, duration) via CDP.
import { chromium } from 'playwright';
import fs from 'fs';

const URL_ = process.env.URL || 'http://127.0.0.1:5191/';
const SCEN = process.env.SCEN || 'x';
const SECONDS = +(process.env.SECONDS || 60);
const PHASE2 = +(process.env.PHASE2_SECONDS || 0);
const KILL_PID = process.env.KILL_PID ? +process.env.KILL_PID : null;
const OUTDIR = process.env.OUTDIR;
fs.mkdirSync(OUTDIR, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  window.__chip = [];
  window.__ann = [];
  window.__chipMut = 0;
  let last = null;
  const recChip = (why) => {
    const el = document.getElementById('status-solar');
    if (!el) return;
    const text = el.textContent;
    const state = el.getAttribute('data-solar-state');
    const key = state + '|' + text;
    if (key === last) return;
    last = key;
    window.__chip.push({ wall: Date.now(), why, state, text, title: el.getAttribute('title') });
  };
  const recAnn = (why) => {
    const el = document.getElementById('status-solar-announcer');
    if (!el) return;
    window.__ann.push({ wall: Date.now(), why, text: el.textContent });
  };
  let chipOk = false, annOk = false;
  const attach = () => {
    const chip = document.getElementById('status-solar');
    if (chip && !chipOk) {
      chipOk = true;
      recChip('initial');
      new MutationObserver((m) => { window.__chipMut += m.length; recChip('mutation'); })
        .observe(chip, { childList: true, characterData: true, subtree: true, attributes: true });
    }
    const ann = document.getElementById('status-solar-announcer');
    if (ann && !annOk) {
      annOk = true;
      if (ann.textContent) recAnn('initial');
      new MutationObserver(() => recAnn('mutation')).observe(ann, { childList: true, characterData: true, subtree: true });
    }
    return chipOk && annOk;
  };
  if (!attach()) {
    const mo = new MutationObserver(() => { if (attach()) mo.disconnect(); });
    mo.observe(document, { childList: true, subtree: true });
  }
});

const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
const T0 = Date.now();
const rel = (wall) => +((wall - T0) / 1000).toFixed(2);
const kindOf = (url) => /\/solar\/physics(\?|$)/.test(url) ? 'physics' : /\/health(\?|$)/.test(url) ? 'health'
  : /\/solar\/realtime\/aia-tile/.test(url) ? 'aia' : /:8042\//.test(url) ? 'other8042' : null;
const reqs = new Map();
const extraHdr = new Map();
const external = new Map();
cdp.on('Network.requestWillBeSent', (e) => {
  const k = kindOf(e.request.url);
  if (k) {
    const r = { k, url: e.request.url.replace(/^https?:\/\/[^/]+/, ''), type: e.type, t: rel(Date.now()), ts0: e.timestamp, origin: e.request.headers.Origin || null, mode: null };
    const x = extraHdr.get(e.requestId); if (x) r.mode = x;
    reqs.set(e.requestId, r); return;
  }
  try { const u = new URL(e.request.url); if (!['127.0.0.1', 'localhost'].includes(u.hostname) && /^https?:/.test(u.protocol)) external.set(e.requestId, { url: e.request.url.slice(0, 120) }); } catch {}
});
cdp.on('Network.requestWillBeSentExtraInfo', (e) => {
  const h = e.headers || {};
  const mode = h['sec-fetch-mode'] ?? h['Sec-Fetch-Mode'] ?? null;
  const r = reqs.get(e.requestId);
  if (r) r.mode = mode; else extraHdr.set(e.requestId, mode);
});
cdp.on('Network.responseReceived', (e) => {
  const r = reqs.get(e.requestId);
  if (r) { r.status = e.response.status; const h = e.response.headers; r.acao = h['access-control-allow-origin'] ?? h['Access-Control-Allow-Origin'] ?? null; r.ctype = h['content-type'] ?? h['Content-Type'] ?? null; }
  const x = external.get(e.requestId); if (x) x.status = e.response.status;
});
cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.done = true; r.ms = Math.round((e.timestamp - r.ts0) * 1000); r.tEnd = rel(Date.now()); } });
cdp.on('Network.loadingFailed', (e) => {
  const r = reqs.get(e.requestId);
  if (r) { r.failed = e.errorText; r.canceled = !!e.canceled; r.cors = e.corsErrorStatus?.corsError || null; r.blocked = e.blockedReason || null; r.ms = Math.round((e.timestamp - r.ts0) * 1000); r.tEnd = rel(Date.now()); }
  const x = external.get(e.requestId); if (x) x.failed = e.errorText;
});
const bodies = [];
if (process.env.CAPTURE_BODIES) {
  let full = false;
  page.on('response', async (resp) => {
    if (!/\/solar\/physics\?/.test(resp.url()) || resp.status() !== 200) return;
    try {
      const buf = await resp.body();
      const j = JSON.parse(buf.toString('utf8'));
      const da = j?.data_assimilation ?? null;
      bodies.push({ t: rel(Date.now()), bytes: buf.length, data_assimilation: da ? { mode: da.mode, applied: da.applied, blend_weight: da.blend_weight, live_data_available: da.live_data_available, observed_confidence: da.observed_confidence, preferred: da.sources?.sdo_aia?.preferred_channel ?? da.sources?.sdo_aia?.preferred ?? null } : null,
        aia_keys: da?.sources?.sdo_aia ? Object.keys(da.sources.sdo_aia) : null });
      if (!full) { full = true; fs.writeFileSync(`${OUTDIR}/${SCEN}-physics-body-first.json`, buf); }
    } catch (err) { bodies.push({ t: rel(Date.now()), error: String(err).slice(0, 200) }); }
  });
}
const consoleAll = [];
page.on('console', (m) => { consoleAll.push({ t: rel(Date.now()), type: m.type(), text: m.text().slice(0, 400) }); });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push({ t: rel(Date.now()), msg: e.message.slice(0, 400) }));

await page.goto(URL_, { waitUntil: 'load', timeout: 120000 });
const loadedAt = rel(Date.now());
const samples = [];
const sample = async (label) => {
  const s = await page.evaluate(() => { const el = document.getElementById('status-solar'); const a = document.getElementById('status-solar-announcer');
    return { text: el?.textContent ?? null, state: el?.getAttribute('data-solar-state') ?? null, ann: a?.textContent ?? null }; });
  samples.push({ t: rel(Date.now()), label, ...s });
};
const observe = async (sec, label) => {
  const end = Date.now() + sec * 1000;
  while (Date.now() < end) { await page.waitForTimeout(Math.min(5000, end - Date.now())); await sample(label); }
};
const CLIP = { x: 0, y: 780, width: 1440, height: 120 };
await observe(SECONDS, 'phase1');
await page.screenshot({ path: `${OUTDIR}/${SCEN}-statusbar${PHASE2 ? '-phase1' : ''}.png`, clip: CLIP, timeout: 60000 }).catch((e) => pageErrors.push({ t: -1, msg: 'screenshot ' + e.message }));
let killedAt = null;
if (PHASE2) {
  if (KILL_PID) { try { process.kill(KILL_PID, 'SIGTERM'); } catch (e) { console.error('kill failed', e.message); } }
  killedAt = rel(Date.now());
  await observe(PHASE2, 'phase2');
  await page.screenshot({ path: `${OUTDIR}/${SCEN}-statusbar-phase2.png`, clip: CLIP, timeout: 60000 }).catch(() => {});
}
const chip = (await page.evaluate(() => window.__chip)).map((x) => ({ t: rel(x.wall), why: x.why, state: x.state, text: x.text, titleMatches: x.title === null ? null : x.title === x.text }));
const ann = (await page.evaluate(() => window.__ann)).map((x) => ({ t: rel(x.wall), why: x.why, text: x.text }));
const chipMut = await page.evaluate(() => window.__chipMut);
const attrs = await page.evaluate(() => { const g = (id) => { const el = document.getElementById(id); if (!el) return null; const b = el.getBoundingClientRect();
  return { role: el.getAttribute('role'), live: el.getAttribute('aria-live'), atomic: el.getAttribute('aria-atomic'), cls: el.className, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), inStatusBar: !!el.closest('#status-bar') }; };
  return { chip: g('status-solar'), announcer: g('status-solar-announcer') }; });

const outcome = (r) => r.failed ? (r.cors ? `cors:${r.cors}` : r.canceled || /ABORTED/.test(r.failed) ? `aborted(${r.failed})` : `failed:${r.failed}`)
  : r.status != null && r.done ? `http_${r.status}` : r.status != null ? `http_${r.status}(pending body)` : 'pending';
const R = [...reqs.values()].sort((a, b) => a.t - b.t).map((r) => ({ t: r.t, tEnd: r.tEnd ?? null, k: r.k, mode: r.mode, type: r.type, url: r.url.slice(0, 110), outcome: outcome(r), status: r.status ?? null, acao: r.acao ?? null, ms: r.ms ?? null, origin: r.origin }));
const tally = {};
for (const r of R) { const key = `${r.k} ${r.mode ?? '?'} ${r.outcome}`; tally[key] = (tally[key] || 0) + 1; }
// probes attributed to each physics attempt: health requests started after physics i started and before physics i+1 started
const phys = R.filter((r) => r.k === 'physics');
const health = R.filter((r) => r.k === 'health');
const probesPerAttempt = phys.map((p, i) => {
  const next = phys[i + 1]?.t ?? Infinity;
  const hs = health.filter((h) => h.t >= p.t && h.t < next);
  return { t: p.t, outcome: p.outcome, ms: p.ms, probes: hs.map((h) => `${h.mode}:${h.outcome}`) };
});
const solarConsole = consoleAll.filter((c) => c.text.includes('[solar]'));
let flips = 0; for (let i = 1; i < chip.length; i++) if (chip[i].text !== chip[i - 1].text) flips++;
let stateFlips = 0; for (let i = 1; i < chip.length; i++) if (chip[i].state !== chip[i - 1].state) stateFlips++;
const out = { scen: SCEN, url: URL_, t0wall: T0, t0iso: new Date(T0).toISOString(), seconds: SECONDS, phase2: PHASE2, loadedAt, killedAt,
  chipLog: chip, chipChanges: chip.length, textFlips: flips, stateFlips, rawChipMutationRecords: chipMut, distinctTexts: [...new Set(chip.map((x) => x.text))],
  announcements: ann, solarConsole, finalChip: samples.at(-1), samples, attrs, requestTally: tally, probesPerAttempt, requests: R, bodies,
  consoleWarnErrorOther: consoleAll.filter((c) => (c.type === 'warning' || c.type === 'error') && !c.text.includes('[solar]')).slice(0, 60),
  pageErrors, externalRequests: [...external.values()].slice(0, 30) };
fs.writeFileSync(`${OUTDIR}/${SCEN}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ scen: SCEN, t0iso: out.t0iso, loadedAt, killedAt, chipChanges: chip.length, textFlips: flips, stateFlips,
  chipLog: chip.map((x) => `${x.t}s [${x.state}] ${x.text}${x.titleMatches === false ? ' (TITLE MISMATCH)' : ''}`),
  announcements: ann.map((a) => `${a.t}s ${a.why}: ${a.text}`), solarConsole: solarConsole.map((c) => `${c.t}s ${c.type} ${c.text}`),
  requestTally: tally, probesPerAttempt: probesPerAttempt.map((p) => `${p.t}s ${p.outcome} ${p.ms}ms probes=[${p.probes.join(', ')}]`),
  bodies: bodies.length, pageErrors, externalN: external.size, attrs }, null, 1));
await browser.close();
