// H-1 status-chip browser-matrix harness.
// env: URL (default http://127.0.0.1:5191/), SCEN (tag), SECONDS, OUTDIR,
//      PHASE2_SECONDS + KILL_PID (optional: after SECONDS, kill that pid and observe PHASE2_SECONDS more),
//      FULLPAGE=1 (extra full-page screenshot), CAPTURE_BODY=1 (save first 200 /solar/physics body)
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
  window.__solarLog = [];
  window.__solarMut = 0;
  let last = null;
  const rec = (why) => {
    const el = document.getElementById('status-solar');
    if (!el) return;
    const text = el.textContent;
    const state = el.getAttribute('data-solar-state');
    const title = el.getAttribute('title');
    const key = state + '|' + text;
    if (key === last) return;
    last = key;
    window.__solarLog.push({ wall: Date.now(), perf: Math.round(performance.now()), why, state, text, title });
  };
  const attach = () => {
    const el = document.getElementById('status-solar');
    if (!el) return false;
    rec('initial');
    new MutationObserver((muts) => { window.__solarMut += muts.length; rec('mutation'); })
      .observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
    return true;
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
  : /\/solar\/realtime\/aia-tile/.test(url) ? 'aia' : null;
const reqs = new Map();
const external = new Map();
cdp.on('Network.requestWillBeSent', (e) => {
  const k = kindOf(e.request.url);
  if (k) { reqs.set(e.requestId, { k, url: e.request.url.replace(/^https?:\/\/[^/]+/, ''), type: e.type, t: rel(Date.now()), ts0: e.timestamp, origin: e.request.headers.Origin || null }); return; }
  try { const u = new URL(e.request.url); if (!['127.0.0.1', 'localhost'].includes(u.hostname) && /^https?:/.test(u.protocol)) external.set(e.requestId, { url: e.request.url.slice(0, 120) }); } catch {}
});
cdp.on('Network.responseReceived', (e) => {
  const r = reqs.get(e.requestId);
  if (r) { r.status = e.response.status; const h = e.response.headers; r.acao = h['access-control-allow-origin'] ?? h['Access-Control-Allow-Origin'] ?? null; }
  const x = external.get(e.requestId); if (x) x.status = e.response.status;
});
cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.done = true; r.ms = Math.round((e.timestamp - r.ts0) * 1000); } });
cdp.on('Network.loadingFailed', (e) => {
  const r = reqs.get(e.requestId);
  if (r) { r.failed = e.errorText; r.canceled = !!e.canceled; r.cors = e.corsErrorStatus?.corsError || null; r.blocked = e.blockedReason || null; r.ms = Math.round((e.timestamp - r.ts0) * 1000); }
  const x = external.get(e.requestId); if (x) x.failed = e.errorText;
});
let bodyCaptured = false;
if (process.env.CAPTURE_BODY) {
  page.on('response', async (resp) => {
    if (bodyCaptured || !/\/solar\/physics\?/.test(resp.url()) || resp.status() !== 200) return;
    try { const buf = await resp.body(); bodyCaptured = true; fs.writeFileSync(`${OUTDIR}/${SCEN}-physics-body.json`, buf);
      fs.writeFileSync(`${OUTDIR}/${SCEN}-physics-body.meta.json`, JSON.stringify({ t: rel(Date.now()), url: resp.url(), headers: resp.headers() }, null, 1)); } catch (err) { console.error('body capture failed', err.message); }
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
  const s = await page.evaluate(() => { const el = document.getElementById('status-solar');
    return { text: el?.textContent ?? null, state: el?.getAttribute('data-solar-state') ?? null, mut: window.__solarMut }; });
  samples.push({ t: rel(Date.now()), label, ...s });
};
const observe = async (sec, label) => {
  const end = Date.now() + sec * 1000;
  while (Date.now() < end) { await page.waitForTimeout(Math.min(5000, end - Date.now())); await sample(label); }
};
await observe(SECONDS, 'phase1');
const shot1 = `${OUTDIR}/${SCEN}-statusbar${PHASE2 ? '-phase1' : ''}.png`;
await page.screenshot({ path: shot1, clip: { x: 0, y: 780, width: 1440, height: 120 }, timeout: 60000 }).catch((e) => pageErrors.push({ t: -1, msg: 'screenshot ' + e.message }));
if (process.env.FULLPAGE) await page.screenshot({ path: `${OUTDIR}/${SCEN}-fullpage${PHASE2 ? '-phase1' : ''}.png`, fullPage: true, timeout: 60000 }).catch(() => {});
let killedAt = null;
if (PHASE2) {
  if (KILL_PID) { try { process.kill(KILL_PID, 'SIGTERM'); } catch (e) { console.error('kill failed', e.message); } }
  killedAt = rel(Date.now());
  await observe(PHASE2, 'phase2');
  await page.screenshot({ path: `${OUTDIR}/${SCEN}-statusbar-phase2.png`, clip: { x: 0, y: 780, width: 1440, height: 120 }, timeout: 60000 }).catch(() => {});
  if (process.env.FULLPAGE) await page.screenshot({ path: `${OUTDIR}/${SCEN}-fullpage-phase2.png`, fullPage: true, timeout: 60000 }).catch(() => {});
}
const log = (await page.evaluate(() => window.__solarLog)).map((x) => ({ t: rel(x.wall), perf: x.perf, why: x.why, state: x.state, text: x.text, titleMatches: x.title === null ? null : x.title === x.text }));
const mut = await page.evaluate(() => window.__solarMut);
const layout = await page.evaluate(() => { const r = (id) => { const el = document.getElementById(id); if (!el) return null; const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), overflowX: el.scrollWidth > el.clientWidth + 1, border: cs.borderColor, dot: getComputedStyle(el, '::before').backgroundColor, role: el.getAttribute('role'), live: el.getAttribute('aria-live'), atomic: el.getAttribute('aria-atomic') }; };
  return { solar: r('status-solar'), catalog: r('status-catalog'), bar: r('status-bar'), docScrollW: document.documentElement.scrollWidth, innerW: innerWidth }; });

const outcome = (r) => r.failed ? (r.cors ? `cors:${r.cors}` : r.canceled || /ABORTED/.test(r.failed) ? `aborted(${r.failed})` : `failed:${r.failed}`)
  : r.status != null && r.done ? `http_${r.status}` : r.status != null ? `http_${r.status}(pending body)` : 'pending';
const R = [...reqs.values()].map((r) => ({ t: r.t, k: r.k, type: r.type, url: r.url.slice(0, 110), outcome: outcome(r), status: r.status ?? null, acao: r.acao ?? null, ms: r.ms ?? null, blocked: r.blocked ?? null, origin: r.origin }));
const tally = {};
for (const r of R) { const key = `${r.k} ${r.outcome}`; tally[key] = (tally[key] || 0) + 1; }
const solarConsole = consoleAll.filter((c) => c.text.includes('[solar]'));
const texts = log.map((x) => x.text);
const distinct = [...new Set(texts)];
let flips = 0; for (let i = 1; i < log.length; i++) if (log[i].text !== log[i - 1].text) flips++;
const out = { scen: SCEN, url: URL_, t0wall: T0, seconds: SECONDS, phase2: PHASE2, loadedAt, killedAt, chipLog: log, chipChanges: log.length, textFlips: flips, rawMutationRecords: mut, distinctTexts: distinct,
  finalChip: samples.at(-1), samples, requestTally: tally, requests: R, solarConsole, consoleWarnErrorOther: consoleAll.filter((c) => (c.type === 'warning' || c.type === 'error') && !c.text.includes('[solar]')).slice(0, 40),
  pageErrors, externalRequests: [...external.values()].slice(0, 30), layout };
fs.writeFileSync(`${OUTDIR}/${SCEN}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ scen: SCEN, loadedAt, killedAt, chipChanges: log.length, textFlips: flips, rawMutationRecords: mut, chipLog: log.map((x) => `${x.t}s [${x.state}] ${x.text}`),
  requestTally: tally, solarConsole: solarConsole.map((c) => `${c.t}s ${c.type} ${c.text}`), pageErrors, externalN: external.size, layout: layout.solar }, null, 1));
await browser.close();
