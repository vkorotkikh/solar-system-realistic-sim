// H-1 frontend-consumers probe. Serves the HEAD production build (vite build output) and a FAKE backend
// entirely through Playwright request interception on the fake host http://sim.test (no ports bound, no real
// backend contacted, WebSockets closed). Scenarios:
//   today    : /solar/physics -> 503 (what users get now)                    -> fallback visuals
//   data     : /solar/physics -> 200 offline-generated payload (+ synthetic sdo_aia block), AIA tile -> PNG w/ ACAO
//   noacao   : as data, but the AIA tile response lacks Access-Control-Allow-Origin
//   slow     : /solar/physics -> 200 after 5 s (longer than the 2.6 s client timeout)
// env: OUTDIR (h1/frontend dir), SCEN (comma list, default all)
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUTDIR = process.env.OUTDIR;
const DIST = path.join(OUTDIR, 'dist');
const SHOTS = path.join(OUTDIR, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const PAYLOADS = [JSON.parse(fs.readFileSync(path.join(OUTDIR, 'payload_high_180.json'), 'utf8')),
                  JSON.parse(fs.readFileSync(path.join(OUTDIR, 'payload_high_180_b.json'), 'utf8'))];
const TILE = fs.readFileSync(path.join(OUTDIR, 'fake_aia_tile.png'));
const ORIGIN = 'http://sim.test';
const SCEN = (process.env.SCEN || 'today,data,noacao,slow').split(',');

function withSyntheticAia(state) {
  const now = new Date().toISOString();
  const ch = (id) => ({ image_id: id, image_date: now, tile_url: `https://api.helioviewer.org/v2/getTile/?id=${id}&x=-1&y=-1` });
  return { ...state, data_assimilation: { ...state.data_assimilation, applied: true, observed_confidence: 0.72, live_data_available: true,
    sources: { swpc: null, silso: null, sdo_aia: { freshness_proxy: 0.9, activity_proxy: 0.6,
      channel_activity_proxy: { aia_193: 0.6, aia_304: 0.5, aia_171: 0.4, aia_211: 0.55, aia_094: 0.3 },
      visualization: { preferred_channel: 'aia_193' },
      channels: { aia_193: ch('FAKE193'), aia_304: ch('FAKE304'), aia_171: ch('FAKE171'), aia_211: ch('FAKE211'), aia_094: ch('FAKE094') } } } } };
}
const ctype = (p) => ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.bin': 'application/octet-stream' }[path.extname(p)] || 'application/octet-stream');

const INIT = () => {
  window.__scenes = [];
  window.__THREE_DEVTOOLS__ = new EventTarget();
  window.__THREE_DEVTOOLS__.addEventListener('observe', (e) => { if (e.detail && e.detail.isScene) window.__scenes.push(e.detail); });
  window.__solar = { json: [], longtasks: [] };
  const oj = Response.prototype.json;
  Response.prototype.json = async function () { const t = performance.now(); const r = await oj.call(this);
    if (/\/solar\/physics/.test(this.url)) window.__solar.json.push({ at: +t.toFixed(0), bodyReadAndParseMs: +(performance.now() - t).toFixed(1) }); return r; };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__solar.longtasks.push({ at: +e.startTime.toFixed(0), dur: +e.duration.toFixed(0) }); }).observe({ type: 'longtask', buffered: true }); } catch {}
};

const introspect = () => {
  const out = { scenes: window.__scenes.length };
  const all = []; for (const s of window.__scenes) s.traverse((o) => all.push(o));
  const byId = (id) => all.find((o) => o.userData && o.userData.bodyId === id);
  const radius = (o) => { let m = 0; o.traverse((c) => { const a = c.geometry && c.geometry.getAttribute && c.geometry.getAttribute('position'); if (!a || !c.visible) return;
    const n = c.geometry.drawRange && Number.isFinite(c.geometry.drawRange.count) ? Math.min(a.count, c.geometry.drawRange.count) : a.count;
    for (let i = 0; i < n; i++) m = Math.max(m, Math.hypot(a.getX(i), a.getY(i), a.getZ(i))); }); return +m.toFixed(3); };
  const grp = (id) => { const g = byId(id); if (!g) return null; return { visible: g.visible, children: g.children.length, visibleChildren: g.children.filter((c) => c.visible).length,
    dataDriven: g.userData.isDataDriven ?? null, source: g.userData.source ?? null, maxRadiusAU_local: radius(g) }; };
  out.coronalLoops = grp('sun-coronal-loops'); out.parkerSpiral = grp('sun-parker-spiral'); out.magneticField = grp('sun-magnetic-field');
  out.flares = grp('sun-flares');
  const surf = all.find((o) => o.material && o.material.uniforms && o.material.uniforms.observationMap);
  if (surf) { const u = surf.material.uniforms; out.surface = { observationMapIsBaseMap: u.observationMap.value === u.baseMap.value,
    observationMapImage: u.observationMap.value && u.observationMap.value.image ? (u.observationMap.value.image.src || u.observationMap.value.image.constructor.name).toString().slice(0, 120) : null,
    observationBlend: +u.observationBlend.value.toFixed(3), observationEmission: +u.observationEmission.value.toFixed(3), activity: +u.activity.value.toFixed(3),
    sunspotSeeds: u.sunspotSeeds.value.map((v) => [v.x, v.y, v.z, v.w].map((x) => +x.toFixed(3))), flarePoints: u.flarePoints.value.map((v) => +v.z.toFixed(3)) }; }
  const cor = all.find((o) => o.material && o.material.uniforms && o.material.uniforms.coronalHoleCount);
  if (cor) { const u = cor.material.uniforms; out.corona = { coronalHoleCount: u.coronalHoleCount.value, channelMode: u.channelMode ? u.channelMode.value : null,
    coronaColor: u.coronaColor ? [u.coronaColor.value.r, u.coronaColor.value.g, u.coronaColor.value.b].map((x) => +x.toFixed(3)) : null, obsBlend: +u.observationBlend.value.toFixed(3) }; }
  const tr = byId('sun-transition-region'); if (tr) out.transitionRegion = { channelMode: tr.material.uniforms.channelMode.value, trOpacity: +tr.material.uniforms.trOpacity.value.toFixed(3) };
  const sunMesh = all.find((o) => o.userData && o.userData.bodyId === 'sun' && o.isMesh) || surf; if (sunMesh) out.sunMeshScale = +sunMesh.scale.x.toFixed(4);
  out.aiaSelect = document.getElementById('aia-channel')?.value; out.magToggle = document.getElementById('toggle-magnetic-field')?.checked;
  out.date = document.getElementById('time-date')?.textContent?.trim();
  out.statusBar = [...document.querySelectorAll('#status-bar > span')].map((s) => s.textContent.trim());
  out.solarText = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /solar data|live|unavailable|offline/i.test(e.textContent || '')).map((e) => e.textContent.trim()).slice(0, 6);
  out.longtasks = window.__solar.longtasks.slice(-20); out.json = window.__solar.json.slice(-10);
  return out;
};

async function run(scen) {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  const T0 = Date.now(); const rel = () => Date.now() - T0;
  const reqs = []; let nPhys = 0;
  await ctx.route('**/*', async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (u.hostname !== 'sim.test') return route.abort();
    if (u.port === '8042') {
      const cors = { 'access-control-allow-origin': ORIGIN, vary: 'Origin' };
      if (u.pathname === '/solar/physics') {
        const rec = { kind: 'physics', t: rel(), jd: u.searchParams.get('jd'), q: u.search.slice(0, 140) }; reqs.push(rec);
        if (scen === 'today') { rec.served = 503; return route.fulfill({ status: 503, headers: { ...cors, 'retry-after': '2', 'content-type': 'application/json' }, body: '{"detail":"Solar physics requests are temporarily saturated. Retry shortly."}' }); }
        const payload = withSyntheticAia(PAYLOADS[nPhys++ % 2]);
        if (scen === 'slow') await new Promise((r) => setTimeout(r, 5000));
        rec.served = 200;
        return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(payload) }).catch((e) => { rec.fulfillError = e.message.slice(0, 80); });
      }
      if (u.pathname === '/solar/realtime/aia-tile') {
        reqs.push({ kind: 'aia', t: rel(), q: u.search, crossOriginModeHeader: req.headers()['sec-fetch-mode'] || null });
        const h = { 'content-type': 'image/png', 'cache-control': 'public, max-age=120' };
        if (scen !== 'noacao') Object.assign(h, cors);
        return route.fulfill({ status: 200, headers: h, body: TILE });
      }
      reqs.push({ kind: 'other-backend', t: rel(), path: u.pathname });
      return route.fulfill({ status: 404, headers: { ...cors, 'content-type': 'application/json' }, body: '{"detail":"not in probe"}' });
    }
    let p = decodeURIComponent(u.pathname); if (p === '/' || p === '') p = '/index.html';
    const f = path.join(DIST, p);
    if (!f.startsWith(DIST) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ status: 200, headers: { 'content-type': ctype(f) }, body: fs.readFileSync(f) });
  });
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage();
  const logs = []; p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push({ t: rel(), type: m.type(), text: m.text().slice(0, 300) }); });
  p.on('pageerror', (e) => logs.push({ t: rel(), type: 'pageerror', text: String(e.message).slice(0, 300) }));
  p.on('requestfailed', (r) => { if (/sim\.test:8042/.test(r.url())) logs.push({ t: rel(), type: 'requestfailed', text: `${r.url().slice(0, 90)} ${r.failure()?.errorText}` }); });
  await p.goto(ORIGIN + '/', { waitUntil: 'load', timeout: 120000 });
  const snaps = {}; const wait = async (s) => { const d = s * 1000 - rel(); if (d > 0) await p.waitForTimeout(d); };
  const snap = async (label) => { snaps[label] = { t: rel(), ...(await p.evaluate(introspect).catch((e) => ({ err: e.message }))) }; };
  const shot = async (label) => p.screenshot({ path: path.join(SHOTS, `${scen}_${label}.png`), timeout: 60000 }).catch((e) => logs.push({ type: 'shot', text: e.message }));
  const DUR = scen === 'noacao' ? 16 : scen === 'slow' ? 26 : 40;
  if (scen === 'today' || scen === 'data') {
    await wait(14); await snap('t14_default'); await shot('t14_default');
    await p.evaluate(() => { const c = document.getElementById('toggle-magnetic-field'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
    await wait(18); await snap('t18_magnetic_on'); await shot('t18_magnetic_on');
    await p.evaluate(() => { const s = document.getElementById('aia-channel'); s.value = 'aia_304'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await wait(24); await snap('t24_aia304'); await shot('t24_aia304');
    await p.mouse.move(640, 400); for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, 600); await p.waitForTimeout(100); }
    await wait(32); await snap('t32_zoomed_out'); await shot('t32_zoomed_out');
  }
  await wait(DUR); await snap('end');
  const out = { scen, reqs, snaps, logs: logs.slice(0, 40), physicsRequestCount: reqs.filter((r) => r.kind === 'physics').length, aiaRequestCount: reqs.filter((r) => r.kind === 'aia').length,
    otherBackend: [...new Set(reqs.filter((r) => r.kind === 'other-backend').map((r) => r.path))] };
  fs.writeFileSync(path.join(OUTDIR, `inject_${scen}.json`), JSON.stringify(out, null, 1));
  await b.close();
  return out;
}

for (const s of SCEN) {
  const o = await run(s);
  const phys = o.reqs.filter((r) => r.kind === 'physics');
  console.log(JSON.stringify({ scen: s, physicsRequestCount: o.physicsRequestCount, physicsT: phys.map((r) => r.t), jdFirstLast: [phys[0]?.jd, phys.at(-1)?.jd], aia: o.reqs.filter((r) => r.kind === 'aia'), otherBackend: o.otherBackend,
    snapsBrief: Object.fromEntries(Object.entries(o.snaps).map(([k, v]) => [k, { loops: v.coronalLoops, parker: v.parkerSpiral, mag: v.magneticField, flares: v.flares?.children, surf: v.surface && { ...v.surface, sunspotSeeds: undefined }, corona: v.corona, tr: v.transitionRegion, sunScale: v.sunMeshScale, solarText: v.solarText, json: v.json, longtasks: v.longtasks?.length }])),
    logs: o.logs.slice(0, 12) }, null, 1));
}
