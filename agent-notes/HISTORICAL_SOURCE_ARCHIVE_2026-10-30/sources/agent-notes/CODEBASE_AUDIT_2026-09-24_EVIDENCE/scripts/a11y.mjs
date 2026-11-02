import { chromium } from 'playwright'; import fs from 'fs'; import crypto from 'crypto';
const SP = process.env.SP, URL = 'http://127.0.0.1:5173/'; const out = {};
const GPU = ['--no-sandbox','--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist','--enable-gpu'];
const b = await chromium.launch({ headless: false, args: GPU });
// axe-core (WCAG 2.x A/AA) + keyboard traversal
{ const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } }); const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(6000);
  await p.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js' });
  const r = await p.evaluate(async () => { const x = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] });
    return { axeVersion: axe.version, violations: x.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })), passes: x.passes.length, incomplete: x.incomplete.length }; });
  out.axe = r;
  const tabs = []; for (let k = 0; k < 45; k++) { await p.keyboard.press('Tab'); tabs.push(await p.evaluate(() => { const e = document.activeElement;
    const cs = e && getComputedStyle(e); return e ? `${e.tagName.toLowerCase()}#${e.id || ''}${e.getAttribute('aria-label') ? '[' + e.getAttribute('aria-label') + ']' : ''}|outline:${cs.outlineStyle}/${cs.outlineWidth}` : null; })); }
  out.keyboard = { stops: tabs.length, unique: [...new Set(tabs.map(t => t.split('|')[0]))].length, first12: tabs.slice(0, 12), noVisibleFocus: tabs.filter(t => /outline:none\/0px/.test(t)).length };
  // can the canvas be driven by keyboard at all (arrow keys / +-)?
  const camBefore = await p.evaluate(() => document.getElementById('status-zoom')?.textContent);
  await p.focus('#space-canvas').catch(() => {}); for (const k of ['ArrowUp', 'ArrowLeft', '+', '-', 'PageDown']) await p.keyboard.press(k);
  out.keyboard.canvasFocusable = await p.evaluate(() => document.getElementById('space-canvas').tabIndex >= 0);
  out.keyboard.zoomChangedByKeys = camBefore !== await p.evaluate(() => document.getElementById('status-zoom')?.textContent);
  await ctx.close(); }
// reduced motion: does simulated time / animation actually stop?
{ for (const rm of ['no-preference', 'reduce']) { const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, reducedMotion: rm }); const p = await ctx.newPage();
    await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(5000);
    const s1 = await p.evaluate(() => ({ date: document.getElementById('time-date').textContent, play: document.getElementById('toggle-play').textContent.trim(), scale: document.getElementById('time-scale-value').textContent }));
    const shotA = await p.locator('#space-canvas').screenshot(); await p.waitForTimeout(3000); const shotB = await p.locator('#space-canvas').screenshot();
    const s2 = await p.evaluate(() => document.getElementById('time-date').textContent);
    out['reducedMotion_' + rm] = { ...s1, dateAfter3s: s2, canvasChangedIn3s: crypto.createHash('sha1').update(shotA).digest('hex') !== crypto.createHash('sha1').update(shotB).digest('hex') }; await ctx.close(); } }
// responsive
out.responsive = {}; for (const [w, h] of [[1920, 1080], [1280, 720], [390, 844]]) { const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 }); const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(5000);
  out.responsive[`${w}x${h}`] = await p.evaluate(() => { const c = document.getElementById('space-canvas'); const panel = document.getElementById('control-panel');
    return { hOverflow: document.documentElement.scrollWidth > innerWidth, canvas: [c.clientWidth, c.clientHeight], panelVisible: panel && getComputedStyle(panel).visibility !== 'hidden' && panel.getBoundingClientRect().width > 0,
      panelToggleVisible: !!document.getElementById('panel-toggle') && getComputedStyle(document.getElementById('panel-toggle')).display !== 'none', smallTargets: [...document.querySelectorAll('button,input,select')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.width < 24 || r.height < 24); }).length }; });
  await p.screenshot({ path: `${SP}/out/shots/resp-${w}x${h}.png` }); await ctx.close(); }
// determinism: two loads, same wall clock -> same date? is there any seed/date URL override?
{ const vals = []; for (let k = 0; k < 2; k++) { const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const p = await ctx.newPage();
    await p.addInitScript(() => { const fixed = Date.UTC(2026, 8, 24, 0, 0, 0); const D = Date; window.Date = class extends D { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } }; });
    await p.goto(URL + '?date=2000-01-01&seed=1', { waitUntil: 'load' }); await p.waitForTimeout(4000); await p.evaluate(() => document.getElementById('toggle-play').click());
    vals.push(await p.evaluate(() => document.getElementById('time-date').textContent)); await ctx.close(); } out.determinism = { datesWithFrozenClock: vals, urlDateParamHonoured: vals[0] === '2000-01-01' }; }
await b.close();
// WebGL unavailable
{ const b2 = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--disable-webgl', '--disable-webgl2'] });
  const p = await b2.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(5000);
  out.webglUnavailable = { pageErrors: errs.slice(0, 4), visibleText: (await p.evaluate(() => document.body.innerText)).slice(0, 300).replace(/\s+/g, ' '),
    fallbackMessage: await p.evaluate(() => /webgl|not supported|unsupported|graphics/i.test(document.body.innerText)) };
  await p.screenshot({ path: `${SP}/out/shots/webgl-off.png` }); await b2.close(); }
fs.writeFileSync(SP + '/out/browser_a11y.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
