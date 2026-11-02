// H-1 verify2 / ux: how much of the interaction hint the status chips hide, pointer-events/title reachability, and a candidate CSS fix.
import { chromium } from 'playwright';
import fs from 'fs';
const SP = '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad';
const OUT = `${SP}/h1/verify2/ux`;
const BUILDS = { branch: 'http://127.0.0.1:4192/', main: 'http://127.0.0.1:4193/' };
const FIX_CSS = `@media (max-width: 1100px) { .interaction-hint { top: calc(68px + env(safe-area-inset-top, 0px)); bottom: auto; } }`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

function hintCoverage() {
  const hint = document.querySelector('.interaction-hint');
  const bar = document.getElementById('status-bar');
  const tb = document.querySelector('.viewport-toolbar');
  const cs = getComputedStyle(hint);
  if (cs.display === 'none') return { hidden: true };
  // text rects of the hint's visible spans
  const range = document.createRange(); range.selectNodeContents(hint);
  const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
  const prev = bar.style.pointerEvents; bar.style.pointerEvents = 'auto'; [...bar.children].forEach((c) => (c.style.pointerEvents = 'auto'));
  hint.style.pointerEvents = 'auto';
  let total = 0, covered = 0;
  for (const r of rects) for (let x = r.left + 1; x < r.right - 1; x += 2) for (let y = r.top + 1; y < r.bottom - 1; y += 2) {
    total++; const el = document.elementFromPoint(x, y); if (el && bar.contains(el)) covered++;
  }
  bar.style.pointerEvents = prev; [...bar.children].forEach((c) => (c.style.pointerEvents = '')); hint.style.pointerEvents = '';
  const hb = hint.getBoundingClientRect(); const tbb = tb.getBoundingClientRect();
  const toolbarKids = [...tb.querySelectorAll('*')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
  const hitsToolbar = toolbarKids.some((r) => Math.min(r.right, hb.right) > Math.max(r.left, hb.left) && Math.min(r.bottom, hb.bottom) > Math.max(r.top, hb.top));
  // pointer reachability of the solar chip (title tooltips need hover)
  const solar = document.getElementById('status-solar');
  let solarHit = null, solarPE = null;
  if (solar) { const r = solar.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); solarHit = el ? (el.id || el.tagName) : null; solarPE = getComputedStyle(solar).pointerEvents; }
  return { hintBox: { y: Math.round(hb.top), bottom: Math.round(hb.bottom), x: Math.round(hb.left), right: Math.round(hb.right) }, hintTextCoveredPct: total ? +(100 * covered / total).toFixed(1) : 0, hintHitsToolbarItem: hitsToolbar, toolbarBottom: Math.round(tbb.bottom), solarPointerEvents: solarPE, elementAtSolarCentre: solarHit, barTop: Math.round(Math.min(...[...bar.children].map((c) => c.getBoundingClientRect().top))) };
}

const result = [];
for (const [w, h] of [[1440, 900], [1024, 768], [768, 1024]]) {
  for (const [build, url] of Object.entries(BUILDS)) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await ctx.route(/:8042\//, (r) => r.abort('connectionrefused'));
    await ctx.addInitScript(() => { const orig = window.requestAnimationFrame.bind(window); window.__f = false; window.requestAnimationFrame = (cb) => (window.__f ? 0 : orig(cb)); window.__freeze = () => { window.__f = true; }; });
    const page = await ctx.newPage(); page.setDefaultTimeout(120000);
    await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(8000); await page.evaluate(() => document.fonts.ready); await page.evaluate(() => window.__freeze());
    for (const panel of w > 1100 ? ['open', 'closed'] : ['closed']) {
      if (panel === 'closed' && w > 1100) { await page.evaluate(() => document.getElementById('panel-close')?.click()); await page.waitForTimeout(900); }
      const natural = await page.evaluate(hintCoverage);
      let fixed = null;
      if (build === 'branch' && w <= 1100) {
        await page.addStyleTag({ content: FIX_CSS }); await page.waitForTimeout(200);
        fixed = await page.evaluate(hintCoverage);
        await page.screenshot({ path: `${OUT}/shots/fixcandidate-${w}x${h}-full.png` });
      }
      result.push({ build, vp: `${w}x${h}`, panel, natural, withTopHintFix: fixed });
      console.log(build, `${w}x${h}`, panel, JSON.stringify(natural), fixed ? '\n   FIX: ' + JSON.stringify(fixed) : '');
    }
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(`${OUT}/hint.json`, JSON.stringify({ fixCss: FIX_CSS, result }, null, 1));
