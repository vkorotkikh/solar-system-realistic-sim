// H-1 verify / ux-a11y-layout: status bar layout per viewport, branch (4192) vs main (4193).
import { chromium } from 'playwright';
import fs from 'fs';

const SP = '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad';
const OUT = `${SP}/h1/verify/ux`;
const SHOTS = `${OUT}/shots`;
fs.mkdirSync(SHOTS, { recursive: true });
const BUILDS = { branch: 'http://127.0.0.1:4192/', main: 'http://127.0.0.1:4193/' };
const VIEWPORTS = [[1440, 900], [1024, 768], [768, 1024], [390, 844]];
const STATES = {
  error: 'Sun: procedural fallback (browser blocked the reply: origin http://127.0.0.1:4173 not allowed by CORS, or a server error)',
  stale: 'Sun: backend state from 14:03 UTC (refresh failing: solar server not reachable at http://localhost:8042)',
  backend: 'Sun: backend solar model (data-driven forcing, observations unavailable; AIA 171 image failed to load) · updated 14:03 UTC',
  connecting: 'Sun: procedural fallback (connecting to solar model server)',
};
const ONLY = process.env.ONLY_VP ? process.env.ONLY_VP.split(',') : null;

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

function measure() {
  const vis = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) }; };
  const lines = (el) => {
    const range = document.createRange(); range.selectNodeContents(el);
    const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
    return tops.size;
  };
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const bar = document.getElementById('status-bar');
  const chips = [...bar.children].filter(vis).map((el) => ({
    id: el.id, text: el.textContent, state: el.dataset.solarState || el.dataset.catalogState || el.dataset.cameraMode || null,
    box: box(el), lines: lines(el),
    hClip: el.scrollWidth > el.clientWidth + 1, vClip: el.scrollHeight > el.clientHeight + 1,
    offscreen: el.getBoundingClientRect().right > vw + 0.5 || el.getBoundingClientRect().left < -0.5 || el.getBoundingClientRect().bottom > vh + 0.5 || el.getBoundingClientRect().top < -0.5,
    fontPx: getComputedStyle(el).fontSize,
  }));
  const others = {
    'control-panel': document.getElementById('control-panel'),
    'panel-backdrop': document.getElementById('panel-backdrop'),
    'panel-toggle': document.getElementById('panel-toggle'),
    'viewport-toolbar': document.querySelector('.viewport-toolbar'),
    'frame-indicator': document.querySelector('.frame-indicator'),
    'interaction-hint': document.querySelector('.interaction-hint'),
  };
  const otherBoxes = {};
  for (const [k, el] of Object.entries(others)) if (vis(el)) otherBoxes[k] = box(el);
  const canvas = document.getElementById('space-canvas');
  const cb = box(canvas);
  const inter = (a, b) => { const w = Math.min(a.right, b.right) - Math.max(a.x, b.x); const h = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y); return w > 0 && h > 0 ? { w, h, area: w * h } : null; };
  const overlaps = [];
  for (const c of chips) for (const [k, b] of Object.entries(otherBoxes)) { if (k === 'viewport-toolbar') continue; const i = inter(c.box, b); if (i) overlaps.push({ chip: c.id, with: k, ...i }); }
  // chip vs chip overlap
  for (let i = 0; i < chips.length; i++) for (let j = i + 1; j < chips.length; j++) { const o = inter(chips[i].box, chips[j].box); if (o) overlaps.push({ chip: chips[i].id, with: chips[j].id, ...o }); }
  // stacking: which element is on top at each chip centre (temporarily allow hit testing on the bar)
  const prev = bar.style.pointerEvents; bar.style.pointerEvents = 'auto'; [...bar.children].forEach((c) => (c.style.pointerEvents = 'auto'));
  const topAt = chips.map((c) => { const el = document.elementFromPoint(c.box.x + c.box.w / 2, c.box.y + c.box.h / 2); return { chip: c.id, top: el ? (el.id || el.className || el.tagName) : null, chipOnTop: !!el && (el.id === c.id || el.closest?.('#' + c.id) != null) }; });
  bar.style.pointerEvents = prev; [...bar.children].forEach((c) => (c.style.pointerEvents = ''));
  const barTop = Math.min(...chips.map((c) => c.box.y));
  const hint = otherBoxes['interaction-hint'];
  let hintClearance = null;
  if (hint) { const hov = chips.filter((c) => Math.min(c.box.right, hint.right) - Math.max(c.box.x, hint.x) > 0); if (hov.length) hintClearance = Math.min(...hov.map((c) => c.box.y)) - hint.bottom; }
  const barBottom = Math.max(...chips.map((c) => c.box.bottom));
  const chipArea = chips.reduce((s, c) => { const i = inter(c.box, cb); return s + (i ? i.area : 0); }, 0);
  return {
    viewport: [vw, vh], docScrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth,
    hOverflow: document.documentElement.scrollWidth > vw || document.body.scrollWidth > vw,
    barBox: box(bar), barScrollW: bar.scrollWidth, barClientW: bar.clientWidth,
    hintClearance, chipBandTop: barTop, chipBandBottom: barBottom, chipBandHeight: barBottom - barTop,
    chipBandFromBottom: vh - barTop, chipRows: new Set(chips.map((c) => c.box.y)).size,
    canvas: cb, canvasCoveredByChipsPct: +(100 * chipArea / (cb.w * cb.h)).toFixed(2),
    canvasBottomBandCoveredPct: +(100 * (vh - barTop) / cb.h).toFixed(1),
    appClass: document.getElementById('app').className,
    chips, otherBoxes, overlaps, topAt,
  };
}

const result = { generated: new Date().toISOString(), runs: [] };
for (const [w, h] of VIEWPORTS) {
  if (ONLY && !ONLY.includes(`${w}x${h}`)) continue;
  for (const [build, url] of Object.entries(BUILDS)) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
    await ctx.route(/:8042\//, (r) => r.abort('connectionrefused'));
    await ctx.addInitScript(() => {
      const orig = window.requestAnimationFrame.bind(window);
      window.__rafFrozen = false; window.__rafQueue = [];
      window.requestAnimationFrame = (cb) => (window.__rafFrozen ? (window.__rafQueue.push(cb), 0) : orig(cb));
      window.__freeze = () => { window.__rafFrozen = true; };
      window.__thaw = () => { window.__rafFrozen = false; const q = window.__rafQueue.splice(0); q.forEach((cb) => orig(cb)); };
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(120000);
    const warns = []; page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') warns.push(`[${m.type()}] ${m.text()}`.slice(0, 200)); });
    const errs = []; page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(9000);
    await page.evaluate(() => document.fonts.ready);
    const fontOk = await page.evaluate(() => document.fonts.check('500 11px "Chakra Petch"'));
    const panelModes = w > 1100 ? ['panel-open', 'panel-closed'] : ['panel-closed', 'panel-open'];
    for (const panelMode of panelModes) {
      const isOpen = await page.evaluate(() => document.getElementById('app').classList.contains('panel-is-open'));
      const wantOpen = panelMode === 'panel-open';
      if (isOpen !== wantOpen) {
        await page.evaluate((want) => { const btn = want ? document.getElementById('panel-toggle') : document.getElementById('panel-close'); btn.click(); }, wantOpen);
        await page.waitForTimeout(900);
      }
      const nowOpen = await page.evaluate(() => document.getElementById('app').classList.contains('panel-is-open'));
      const stateList = build === 'branch' ? ['natural', ...Object.keys(STATES)] : ['natural'];
      for (const st of stateList) {
        if (st !== 'natural') {
          await page.evaluate(([t, s]) => { const el = document.getElementById('status-solar'); el.textContent = t; el.title = t; el.dataset.solarState = s; }, [STATES[st], st]);
        }
        await page.waitForTimeout(250);
        const m = await page.evaluate(measure);
        const tag = `${build}-${w}x${h}-${panelMode}-${st}`;
        await page.evaluate(() => window.__freeze()); await page.waitForTimeout(400);
        await page.screenshot({ path: `${SHOTS}/${tag}-full.png`, timeout: 120000 });
        const clipY = Math.max(0, m.chipBandTop - 60);
        await page.screenshot({ path: `${SHOTS}/${tag}-bottom.png`, clip: { x: 0, y: clipY, width: w, height: h - clipY }, timeout: 120000 });
        await page.evaluate(() => window.__thaw());
        const stillForced = st === 'natural' ? null : await page.evaluate((t) => document.getElementById('status-solar').textContent === t, STATES[st]);
        result.runs.push({ build, vp: `${w}x${h}`, panelMode, panelOpenActual: nowOpen, state: st, stillForced, fontOk, tag, ...m });
        console.log(tag, 'rows', m.chipRows, 'band', m.chipBandHeight, 'fromBottom', m.chipBandFromBottom, 'hintGap', m.hintClearance, 'overlaps', JSON.stringify(m.overlaps.map((o) => `${o.chip}~${o.with}:${o.w}x${o.h}`)), 'hOverflow', m.hOverflow, 'clip', m.chips.filter((c) => c.hClip || c.vClip || c.offscreen).map((c) => c.id).join(','));
      }
    }
    result.runs.push({ build, vp: `${w}x${h}`, consoleWarns: warns.slice(0, 20), pageErrors: errs });
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(`${OUT}/layout${process.env.ONLY_VP ? '-' + process.env.ONLY_VP : ''}.json`, JSON.stringify(result, null, 1));
