// H-1 end-to-end acceptance (draft). Counts /solar/physics outcomes over a window and checks:
//   >= 95% of settled /solar/physics requests are HTTP 200 (none CORS-blocked, none aborted)
//   >= 1 AIA tile (/solar/realtime/aia-tile) loaded as an image with 200 and no CORS failure
//   a solar status element exists and shows a live/degraded state (id + data attribute are the proposed contract)
// Needs ONE real port only: the page origin (dev 5173 / preview 4173) is served from a built dist by
// Playwright interception (no socket is opened on 5173/4173), and the app's hard-coded :8042 backend
// (src/main.ts:189-195) is rerouted to BACKEND. The Origin header the backend sees is therefore the real
// dev/preview origin, so CORS is exercised exactly as in the product.
//
// env: DIST (vite build output), BACKEND (e.g. http://127.0.0.1:8075), ORIGIN (http://localhost:5173 |
//      http://localhost:4173), SECONDS (window, default 300), OUT (json path), STATUS_SELECTOR (default #status-solar)
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const DIST = process.env.DIST, BACKEND = process.env.BACKEND || 'http://127.0.0.1:8075';
const ORIGIN = process.env.ORIGIN || 'http://localhost:5173', SECONDS = +(process.env.SECONDS || 300);
const OUT = process.env.OUT, STATUS_SELECTOR = process.env.STATUS_SELECTOR || '#status-solar';
const REWRITE = process.env.REWRITE || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ktx2': 'application/octet-stream', '.bin': 'application/octet-stream', '.wasm': 'application/wasm', '.txt': 'text/plain' };

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  // The intercepted page origin has no real IP, so Chromium's Local Network Access check treats it as public and
  // blocks calls to localhost ('LocalNetworkAccessPermissionDenied'). A real Vite server on localhost does not hit
  // this; disable the check so the harness measures the product, not the interception.
  '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const originUrl = new URL(ORIGIN);
const external = [];
await ctx.route('**/*', async (route) => {
  const u = new URL(route.request().url());
  if (u.origin === originUrl.origin) {
    let p = decodeURIComponent(u.pathname); if (p.endsWith('/')) p += 'index.html';
    const file = path.join(DIST, p);
    if (!file.startsWith(DIST) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not in dist' });
    return route.fulfill({ status: 200, body: fs.readFileSync(file), headers: { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' } });
  }
  // POSITIVE CONTROL ONLY: REWRITE='a:b' rewrites the query (e.g. fidelity=high:fidelity=preview) to prove the
  // harness can observe success; never set it in the acceptance run itself.
  if (u.port === '8042') { let qs = u.search; if (REWRITE) { const [a, b] = REWRITE.split(':'); qs = qs.replace(a, b); }
    return route.continue({ url: BACKEND + u.pathname + qs }); }
  external.push(u.origin); return route.abort('blockedbyclient'); // hermetic: nothing else leaves the box
});

const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable');
const reqs = new Map(); // requestId -> record
const kind = (url) => /\/solar\/physics\?/.test(url) ? 'physics' : /\/solar\/realtime\/aia-tile/.test(url) ? 'aia' : null;
cdp.on('Network.requestWillBeSent', (e) => { const k = kind(e.request.url); if (k) reqs.set(e.requestId, { k, url: e.request.url, t0: e.timestamp, type: e.type }); });
cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r) { r.status = e.response.status; r.acao = e.response.headers['access-control-allow-origin'] || e.response.headers['Access-Control-Allow-Origin'] || null; } });
cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.done = true; r.ms = Math.round((e.timestamp - r.t0) * 1000); } });
cdp.on('Network.loadingFailed', (e) => { const r = reqs.get(e.requestId); if (r) { r.failed = e.errorText; r.canceled = !!e.canceled; r.cors = e.corsErrorStatus?.corsError || null; r.ms = Math.round((e.timestamp - r.t0) * 1000); } });
const logs = []; page.on('console', (m) => { if (/solar|cors|aia/i.test(m.text())) logs.push(`[${m.type()}] ${m.text()}`.slice(0, 240)); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message.slice(0, 240)));

await page.goto(ORIGIN + '/', { waitUntil: 'load', timeout: 120000 });
const samples = [];
for (let t = 0; t < SECONDS; t += 15) {
  await page.waitForTimeout(Math.min(15, SECONDS - t) * 1000);
  samples.push(await page.evaluate((sel) => { const el = document.querySelector(sel); return { t: Math.round(performance.now() / 1000), text: el?.textContent?.trim() ?? null, state: el?.getAttribute('data-solar-state') ?? null }; }, STATUS_SELECTOR));
}

const outcome = (r) => r.cors ? `cors:${r.cors}` : r.failed ? (r.canceled || /ABORTED/.test(r.failed) ? 'aborted' : `failed:${r.failed}`) : r.status != null && r.done ? `http_${r.status}` : 'pending';
const physics = [...reqs.values()].filter((r) => r.k === 'physics');
const settled = physics.filter((r) => outcome(r) !== 'pending');
const tally = {}; for (const r of physics) tally[outcome(r)] = (tally[outcome(r)] || 0) + 1;
const ok = settled.filter((r) => outcome(r) === 'http_200');
const lat = ok.map((r) => r.ms).sort((a, b) => a - b);
const q = (x) => lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * x))] : null;
const aia = [...reqs.values()].filter((r) => r.k === 'aia');
const aiaLoaded = aia.filter((r) => outcome(r) === 'http_200');
const last = samples.at(-1) || {};
const checks = {
  physics_200_ratio_ge_0_95: settled.length > 0 && ok.length / settled.length >= 0.95,
  aia_tile_loaded_ge_1: aiaLoaded.length >= 1,
  status_label_present: last.text != null,
  status_state_live_or_degraded: /^(live|degraded)$/.test(last.state || ''),
};
const result = { origin: ORIGIN, backend: BACKEND, rewrite: REWRITE || null, seconds: SECONDS, physics_total: physics.length, physics_settled: settled.length,
  physics_outcomes: tally, physics_200_ratio: settled.length ? +(ok.length / settled.length).toFixed(3) : null,
  physics_200_latency_ms: { p50: q(0.5), p95: q(0.95), max: lat.at(-1) ?? null },
  aia_requests: aia.length, aia_outcomes: aia.map(outcome), status_samples: samples.slice(-3), external_blocked: [...new Set(external)].slice(0, 8),
  checks, pass: Object.values(checks).every(Boolean), logs: logs.slice(0, 12) };
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
await browser.close();
process.exit(result.pass ? 0 : 1);
