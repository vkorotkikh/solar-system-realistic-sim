// H-1 verify2 / ux-a11y-layout: status bar layout per viewport, branch 7c791dc (4192) vs main bd48a7d (4193).
import { chromium } from 'playwright';
import fs from 'fs';

const SP = '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad';
const OUT = `${SP}/h1/verify2/ux`;
const SHOTS = `${OUT}/shots`;
fs.mkdirSync(SHOTS, { recursive: true });
const BUILDS = { branch: 'http://127.0.0.1:4192/', main: 'http://127.0.0.1:4193/' };
const VIEWPORTS = [[1440, 900], [1024, 768], [768, 1024], [390, 844]];
export const STATES = {
  error: "Sun: procedural fallback (solar server does not allow this page's origin http://127.0.0.1:4173 (CORS))",
  stale: 'Sun: backend state from 14:03 UTC (refresh failing: solar server failed without a readable reply, likely an internal error)',
  backend: 'Sun: backend solar model (data-driven forcing, observations unavailable; AIA 304 image; AIA 171 image failed to load) · updated 14:03 UTC',
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
  // Split an element's text into rendered lines (by character rects).
  const renderedLines = (el) => {
    const node = [...el.childNodes].find((n) => n.nodeType === 3);
    if (!node) return [];
    const range = document.createRange();
    const lines = []; let cur = null; let curTop = null;
    for (let i = 0; i < node.length; i++) {
      range.setStart(node, i); range.setEnd(node, i + 1);
      const r = range.getClientRects()[0];
      if (!r) continue;
      const top = Math.round(r.top);
      if (curTop === null || Math.abs(top - curTop) > 3) { if (cur !== null) lines.push(cur); cur = ''; curTop = top; }
      cur += node.data[i];
    }
    if (cur !== null) lines.push(cur);
    return lines;
  };
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const bar = document.getElementById('status-bar');
  const chips = [...bar.children].filter(vis).map((el) => ({
    id: el.id, state: el.dataset.solarState || el.dataset.catalogState || el.dataset.cameraMode || null,
    box: box(el), lines: renderedLines(el),
    hClip: el.scrollWidth > el.clientWidth + 1, vClip: el.scrollHeight > el.clientHeight + 1,
    offscreen: el.getBoundingClientRect().right > vw + 0.5 || el.getBoundingClientRect().left < -0.5 || el.getBoundingClientRect().bottom > vh + 0.5 || el.getBoundingClientRect().top < -0.5,
    fontPx: getComputedStyle(el).fontSize,
  }));
  const others = {
    'control-panel': document.getElementById('control-panel'),
    'panel-backdrop': document.querySelector('.panel-backdrop'),
    'panel-toggle': document.getElementById('panel-toggle'),
    'viewport-toolbar(header)': document.querySelector('.viewport-toolbar'),
    'frame-indicator': document.querySelector('.frame-indicator'),
    'interaction-hint': document.querySelector('.interaction-hint'),
    'time-controls': document.getElementById('time-controls'),
  };
  const otherBoxes = {};
  for (const [k, el] of Object.entries(others)) if (vis(el)) otherBoxes[k] = box(el);
  // Everything else that is fixed/absolute and visible, for completeness.
  const extraFixed = [];
  for (const el of document.querySelectorAll('body *')) {
    if (bar.contains(el) || el.closest('#control-panel')) continue;
    const cs = getComputedStyle(el);
    if ((cs.position === 'fixed' || cs.position === 'absolute') && vis(el) && el.id !== 'space-canvas' && !el.classList.contains('visually-hidden')) {
      const b = box(el); if (b.w * b.h < 4) continue;
      extraFixed.push({ sel: el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''), box: b, z: cs.zIndex });
    }
  }
  const canvas = document.getElementById('space-canvas') || document.querySelector('canvas');
  const cb = box(canvas);
  const inter = (a, b) => { const w = Math.min(a.right, b.right) - Math.max(a.x, b.x); const h = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y); return w > 0 && h > 0 ? { w, h, area: w * h } : null; };
  const overlaps = [];
  for (const c of chips) {
    for (const [k, b] of Object.entries(otherBoxes)) { const i = inter(c.box, b); if (i) overlaps.push({ chip: c.id, with: k, ...i }); }
    for (const e of extraFixed) { if (Object.values(otherBoxes).some((b) => JSON.stringify(b) === JSON.stringify(e.box))) continue; const i = inter(c.box, e.box); if (i) overlaps.push({ chip: c.id, with: e.sel, ...i }); }
  }
  for (let i = 0; i < chips.length; i++) for (let j = i + 1; j < chips.length; j++) { const o = inter(chips[i].box, chips[j].box); if (o) overlaps.push({ chip: chips[i].id, with: chips[j].id, ...o }); }
  const barTop = Math.min(...chips.map((c) => c.box.y));
  const barBottom = Math.max(...chips.map((c) => c.box.bottom));
  const hint = otherBoxes['interaction-hint'];
  let hintClearance = null;
  if (hint) { const hov = chips.filter((c) => Math.min(c.box.right, hint.right) - Math.max(c.box.x, hint.x) > 0); if (hov.length) hintClearance = hint.y > barBottom ? hint.y - barBottom : Math.min(...hov.map((c) => c.box.y)) - hint.bottom; }
  const tb = otherBoxes['viewport-toolbar(header)'];
  const chipArea = chips.reduce((s, c) => { const i = inter(c.box, cb); return s + (i ? i.area : 0); }, 0);
  return {
    viewport: [vw, vh], docScrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth,
    hOverflow: document.documentElement.scrollWidth > vw || document.body.scrollWidth > vw,
    barBox: box(bar), barScrollW: bar.scrollWidth, barClientW: bar.clientWidth, barHOverflow: bar.scrollWidth > bar.clientWidth + 1,
    hintClearance, chipBandTop: barTop, chipBandBottom: barBottom, chipBandHeight: barBottom - barTop,
    chipBandFromBottom: vh - barTop, chipRows: new Set(chips.map((c) => c.box.y)).size,
    headerToBarGap: tb ? barTop - tb.bottom : null,
    canvas: cb, canvasCoveredByChipsPct: +(100 * chipArea / (cb.w * cb.h)).toFixed(2),
    appClass: document.getElementById('app').className,
    chips, otherBoxes, extraFixed, overlaps,
  };
}

const result = { generated: new Date().toISOString(), runs: [] };
for (const [w, h] of VIEWPORTS) {
  if (ONLY && !ONLY.includes(`${w}x${h}`)) continue;
  for (const [build, url] of Object.entries(BUILDS)) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
    // Never reach the other verifier's :8042 server.
    await ctx.route(/:8042\//, (r) => r.abort('connectionrefused'));
    await ctx.addInitScript(() => {
      const orig = window.requestAnimationFrame.bind(window);
      window.__rafFrozen = false; window.__rafQueue = [];
      window.requestAnimationFrame = (cb) => (window.__rafFrozen ? (window.__rafQueue.push(cb), 0) : orig(cb));
      window.__freeze = () => { window.__rafFrozen = true; };
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(120000);
    const warns = []; page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') warns.push(`[${m.type()}] ${m.text()}`.slice(0, 220)); });
    const errs = []; page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(9000);
    await page.evaluate(() => document.fonts.ready);
    const natural = await page.evaluate(() => ({ solar: document.getElementById('status-solar')?.textContent ?? null, solarState: document.getElementById('status-solar')?.dataset.solarState ?? null, catalog: document.getElementById('status-catalog')?.textContent, fontChakra: [...document.fonts].filter((f) => f.family.includes('Chakra') && f.status === 'loaded').map((f) => f.weight) }));
    await page.evaluate(() => window.__freeze());
    // Guard: any write by the app to #status-solar is reverted to the forced text/state.
    await page.evaluate(() => {
      const el = document.getElementById('status-solar'); if (!el) return;
      window.__forced = null; window.__reverts = 0;
      new MutationObserver(() => {
        const f = window.__forced; if (!f) return;
        if (el.textContent !== f.t || el.dataset.solarState !== f.s || el.title !== f.t) { window.__reverts++; el.textContent = f.t; el.title = f.t; el.dataset.solarState = f.s; }
      }).observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
    });
    const panelModes = w > 1100 ? ['panel-open', 'panel-closed'] : ['panel-closed', 'panel-open'];
    for (const panelMode of panelModes) {
      const isOpen = await page.evaluate(() => document.getElementById('app').classList.contains('panel-is-open'));
      const wantOpen = panelMode === 'panel-open';
      if (isOpen !== wantOpen) {
        await page.evaluate((want) => { const btn = want ? document.getElementById('panel-toggle') : (document.getElementById('panel-close') || document.getElementById('panel-toggle')); btn.click(); }, wantOpen);
        await page.waitForTimeout(900);
      }
      const nowOpen = await page.evaluate(() => document.getElementById('app').classList.contains('panel-is-open'));
      const stateList = build === 'branch' ? ['natural', ...Object.keys(STATES)] : ['natural'];
      for (const st of stateList) {
        if (st !== 'natural') {
          await page.evaluate(([t, s]) => { window.__forced = { t, s }; const el = document.getElementById('status-solar'); el.textContent = t; el.title = t; el.dataset.solarState = s; }, [STATES[st], st]);
        } else if (build === 'branch') {
          // restore the app's own text captured before any forcing
          await page.evaluate(([t, s]) => { window.__forced = { t, s }; const el = document.getElementById('status-solar'); el.textContent = t; el.title = t; el.dataset.solarState = s; }, [natural.solar, natural.solarState]);
        }
        await page.waitForTimeout(250);
        const m = await page.evaluate(measure);
        const tag = `${build}-${w}x${h}-${panelMode}-${st}`;
        await page.screenshot({ path: `${SHOTS}/${tag}-full.png`, timeout: 120000 });
        const clipY = Math.max(0, Math.min(m.chipBandTop, m.otherBoxes['interaction-hint']?.y ?? 1e9) - 24);
        await page.screenshot({ path: `${SHOTS}/${tag}-bottom.png`, clip: { x: 0, y: clipY, width: w, height: h - clipY }, timeout: 120000 });
        const stillForced = st === 'natural' ? null : await page.evaluate((t) => document.getElementById('status-solar').textContent === t, STATES[st]);
        result.runs.push({ build, vp: `${w}x${h}`, panelMode, panelOpenActual: nowOpen, state: st, stillForced, natural, tag, ...m });
        const solar = m.chips.find((c) => c.id === 'status-solar');
        console.log(tag, 'rows', m.chipRows, 'bar', m.barBox.h, 'band', m.chipBandHeight, 'fromBottom', m.chipBandFromBottom, 'hintGap', m.hintClearance, 'hdrGap', m.headerToBarGap,
          'overlaps', JSON.stringify(m.overlaps.map((o) => `${o.chip}~${o.with}:${o.w}x${o.h}`)), 'hOverflow', m.hOverflow, m.barHOverflow,
          'clip', m.chips.filter((c) => c.hClip || c.vClip || c.offscreen).map((c) => c.id).join(','), 'solarLines', solar ? JSON.stringify(solar.lines) : '-');
      }
      if (build === 'branch') await page.evaluate(() => { window.__forced = null; });
    }
    result.runs.push({ build, vp: `${w}x${h}`, consoleWarns: warns.slice(0, 20), pageErrors: errs, reverts: await page.evaluate(() => window.__reverts ?? null) });
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(`${OUT}/layout${process.env.ONLY_VP ? '-' + process.env.ONLY_VP : ''}.json`, JSON.stringify(result, null, 1));
console.log('done');
