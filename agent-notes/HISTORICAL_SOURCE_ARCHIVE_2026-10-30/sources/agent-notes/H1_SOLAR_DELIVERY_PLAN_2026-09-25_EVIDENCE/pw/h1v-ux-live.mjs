// H-1 verify / ux: how often does the #status-solar live region change text (= polite announcements) with a healthy
// backend? Backend is mocked with Playwright routes (no port): the real captured payload + real AIA tile.
// Scenario A: image loads. Scenario B: image endpoint returns 404.
import { chromium } from 'playwright';
import fs from 'fs';

const SP = '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad';
const OUT = `${SP}/h1/verify/ux`;
const PAYLOAD = fs.readFileSync(`${SP}/h1/upstream/physics_payload.json`);
const PNG = fs.readFileSync(`${SP}/h1/upstream/aia_304_tile_192408248.png`);
const DURATION_MS = Number(process.env.DUR_MS || 75000);
const CORS = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const result = {};
for (const scenario of (process.env.SCEN || 'A,B').split(',')) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 700 }, deviceScaleFactor: 1 });
  const hits = { physics: 0, tile: 0, health: 0, other: 0 };
  await ctx.route(/:8042\//, async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/solar/physics') { hits.physics++; return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: PAYLOAD }); }
    if (u.pathname === '/solar/realtime/aia-tile') {
      hits.tile++;
      if (scenario === 'B') return route.fulfill({ status: 404, headers: { ...CORS, 'content-type': 'application/json' }, body: '{"detail":"not found"}' });
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/png' }, body: PNG });
    }
    if (u.pathname === '/health') { hits.health++; return route.fulfill({ status: 200, headers: CORS, body: '{"ok":true}' }); }
    hits.other++; return route.fulfill({ status: 404, headers: CORS, body: '' });
  });
  await ctx.addInitScript(() => {
    window.__solarLog = [];
    const t0 = performance.now();
    const hook = () => {
      const el = document.getElementById('status-solar'); if (!el) return;
      window.__solarLog.push({ t: Math.round(performance.now() - t0), state: el.dataset.solarState, text: el.textContent });
      new MutationObserver(() => window.__solarLog.push({ t: Math.round(performance.now() - t0), state: el.dataset.solarState, text: el.textContent }))
        .observe(el, { childList: true, characterData: true, subtree: true });
    };
    document.addEventListener('DOMContentLoaded', hook);
  });
  const page = await ctx.newPage();
  const warns = []; page.on('console', (m) => { if (m.type() === 'warning' && /\[solar\]/.test(m.text())) warns.push(m.text()); });
  page.setDefaultTimeout(180000);
  await page.goto('http://127.0.0.1:4192/', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(DURATION_MS);
  const log = await page.evaluate(() => window.__solarLog);
  // collapse identical consecutive entries (a mutation that did not change text)
  const changes = log.filter((e, i) => i === 0 || e.text !== log[i - 1].text);
  result[scenario] = { durationMs: DURATION_MS, hits: { ...hits }, mutationRecords: log.length, textChanges: changes.length - 1, changes, solarWarns: warns };
  console.log(`\n== scenario ${scenario}: hits ${JSON.stringify(hits)} textChanges ${changes.length - 1} in ${DURATION_MS} ms, warns ${warns.length}`);
  for (const c of changes) console.log(`  t=${c.t}ms [${c.state}] ${c.text}`);
  await page.screenshot({ path: `${OUT}/shots/live-${scenario}-final.png`, timeout: 120000 }).catch((e) => console.log('shot failed', e.message.slice(0, 80)));
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/live.json`, JSON.stringify(result, null, 1));
