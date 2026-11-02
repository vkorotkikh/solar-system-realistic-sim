// H-1 config-deploy probe: load the app, capture every backend request and
// classify its fate (ok / http error / CORS-blocked / aborted).
// Usage: node h1-config-probe.mjs <pageUrl> <seconds> <rewrite8042to> <label>
//   rewrite8042to: a port number (the app hardcodes :8042; we redirect it to the
//   investigator's backend while keeping the page Origin) or "none".
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const [pageUrl, secondsRaw = '25', rewritePort = 'none', label = 'run'] = process.argv.slice(2);
const OUT = '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/config';
const seconds = Number(secondsRaw);

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext();
const page = await ctx.newPage();
const t0 = Date.now();
const consoleLines = [];
const isBackend = (u) => /\/(solar|trajectory|mission|nearby-systems|health|info|bodies|benchmark|ws)\b/.test(new URL(u).pathname)
  && !/\/src\//.test(u) && !/solar-systems/.test(u);

if (rewritePort !== 'none') {
  await page.route(/:8042\//, (route) => {
    const u = new URL(route.request().url());
    u.port = rewritePort;
    route.continue({ url: u.toString() });
  });
}

const recs = new Map();
page.on('request', (r) => {
  if (!isBackend(r.url())) return;
  recs.set(r, { t: Date.now() - t0, type: r.resourceType(), url: r.url(), origin: r.headers()['origin'] ?? null, outcome: 'pending' });
});
page.on('response', async (r) => {
  const rec = recs.get(r.request()); if (!rec) return;
  const h = r.headers();
  rec.outcome = `http ${r.status()}`; rec.acao = h['access-control-allow-origin'] ?? null; rec.tResp = Date.now() - t0;
});
page.on('requestfailed', (r) => {
  const rec = recs.get(r); if (!rec) return;
  rec.outcome = `${rec.outcome === 'pending' ? '' : rec.outcome + ' then '}failed ${r.failure()?.errorText ?? ''}`; rec.tEnd = Date.now() - t0;
});
page.on('requestfinished', (r) => { const rec = recs.get(r); if (rec) { rec.finished = true; rec.tEnd = Date.now() - t0; } });
page.on('console', (m) => {
  const text = m.text();
  if (/CORS|Access-Control|blocked|ERR_|Failed to load|solar/i.test(text)) consoleLines.push(`${Date.now() - t0}ms [${m.type()}] ${text.slice(0, 300)}`);
});
page.on('pageerror', (e) => consoleLines.push(`${Date.now() - t0}ms [pageerror] ${String(e).slice(0, 300)}`));

await page.goto(pageUrl, { waitUntil: 'load' });
await page.waitForTimeout(seconds * 1000);

const reqs = [...recs.values()].sort((a, b) => a.t - b.t);
const summary = {};
for (const r of reqs) {
  const path = new URL(r.url).pathname;
  const key = `${path} :: ${r.outcome}${r.outcome.startsWith('http') ? ` acao=${r.acao}` : ''}`;
  summary[key] = (summary[key] || 0) + 1;
}
const result = { label, pageUrl, rewritePort, seconds, pageOrigin: new URL(pageUrl).origin,
  backendRequestOrigins: [...new Set(reqs.map((r) => new URL(r.url).origin))],
  summary, requests: reqs.map((r) => ({ t: r.t, dur: (r.tEnd ?? r.tResp ?? null) !== null ? (r.tEnd ?? r.tResp) - r.t : null,
    url: r.url.replace(/jd=[0-9.]+/, 'jd=…'), type: r.type, origin: r.origin, outcome: r.outcome, acao: r.acao ?? null })),
  console: consoleLines.slice(0, 40) };
writeFileSync(`${OUT}/browser-${label}.json`, JSON.stringify(result, null, 1));
console.log(JSON.stringify({ label, pageOrigin: result.pageOrigin, backendRequestOrigins: result.backendRequestOrigins, summary }, null, 1));
console.log('console (first 6):'); consoleLines.slice(0, 6).forEach((l) => console.log('  ', l));
await browser.close();
