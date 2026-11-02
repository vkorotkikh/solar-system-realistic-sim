// H-1 verify / ux: width sweep of status-bar height and overlap with .interaction-hint, branch (4192) vs main (4193).
// Measurement only (no screenshots); rAF frozen after load to keep swiftshader from starving the run.
import { chromium } from 'playwright';
import fs from 'fs';

const SP = '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad';
const OUT = `${SP}/h1/verify/ux`;
const BUILDS = { branch: 'http://127.0.0.1:4192/', main: 'http://127.0.0.1:4193/' };
const STATES = {
  error: 'Sun: procedural fallback (browser blocked the reply: origin http://127.0.0.1:4173 not allowed by CORS, or a server error)',
  stale: 'Sun: backend state from 14:03 UTC (refresh failing: solar server not reachable at http://localhost:8042)',
  backend: 'Sun: backend solar model (data-driven forcing, observations unavailable; AIA 171 image failed to load) · updated 14:03 UTC',
  connecting: 'Sun: procedural fallback (connecting to solar model server)',
};
const HEIGHT = 900;
const widths = [];
for (let w = 360; w <= 1600; w += 8) widths.push(w);
for (const w of [390, 700, 701, 768, 1024, 1100, 1101, 1280, 1366, 1440, 1536]) if (!widths.includes(w)) widths.push(w);
widths.sort((a, b) => a - b);

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

function measure() {
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
  const vis = (el) => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const bar = document.getElementById('status-bar');
  const chips = [...bar.children].filter(vis).map((el) => ({ id: el.id, ...box(el) }));
  const hintEl = document.querySelector('.interaction-hint');
  const hint = vis(hintEl) ? box(hintEl) : null;
  const top = Math.min(...chips.map((c) => c.y));
  const bottom = Math.max(...chips.map((c) => c.bottom));
  let hintOverlapPx = 0; let hintOverlapChips = [];
  if (hint) for (const c of chips) {
    const ow = Math.min(c.right, hint.right) - Math.max(c.x, hint.x); const oh = Math.min(c.bottom, hint.bottom) - Math.max(c.y, hint.y);
    if (ow > 0 && oh > 0) { hintOverlapPx = Math.max(hintOverlapPx, oh); hintOverlapChips.push(c.id); }
  }
  const panel = document.getElementById('control-panel');
  const shell = document.getElementById('viewport-shell');
  const toolbar = document.querySelector('.viewport-toolbar');
  const tb = toolbar ? box(toolbar) : null;
  return {
    bandH: Math.round(bottom - top), fromBottom: Math.round(innerHeight - top),
    rowsDistinctTops: new Set(chips.map((c) => Math.round(c.y))).size,
    hint: hint && { y: Math.round(hint.y), bottom: Math.round(hint.bottom), x: Math.round(hint.x), right: Math.round(hint.right) },
    hintOverlapPx: Math.round(hintOverlapPx), hintOverlapChips,
    solar: chips.find((c) => c.id === 'status-solar') ? Math.round(chips.find((c) => c.id === 'status-solar').h) : null,
    catalogH: Math.round(chips.find((c) => c.id === 'status-catalog')?.h ?? 0),
    hOverflow: document.documentElement.scrollWidth > innerWidth,
    shellW: Math.round(shell.getBoundingClientRect().width),
    panelOpen: document.getElementById('app').classList.contains('panel-is-open'),
    toolbarBottom: tb ? Math.round(tb.bottom) : null,
    barTopMinusToolbar: tb ? Math.round(top - tb.bottom) : null,
  };
}

const rows = [];
for (const [build, url] of Object.entries(BUILDS)) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: HEIGHT }, deviceScaleFactor: 1 });
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
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(9000);
  await page.evaluate(() => document.fonts.ready);
  const naturalText = await page.evaluate(() => document.getElementById('status-solar')?.textContent ?? null);
  const catalogText = await page.evaluate(() => document.getElementById('status-catalog')?.textContent ?? null);
  await page.evaluate(() => window.__freeze());
  for (const panelMode of ['panel-open', 'panel-closed']) {
    for (const w of widths) {
      await page.setViewportSize({ width: w, height: HEIGHT });
      // panel state: toggle classes directly (the app's own handler needs rAF for canvas resize only)
      await page.evaluate((open) => {
        const app = document.getElementById('app');
        const isOpen = app.classList.contains('panel-is-open');
        if (isOpen !== open) (open ? document.getElementById('panel-toggle') : document.getElementById('panel-close')).click();
      }, panelMode === 'panel-open');
      const states = build === 'branch' ? ['natural', ...Object.keys(STATES)] : ['natural'];
      for (const st of states) {
        await page.evaluate(([t, s, nat]) => {
          const el = document.getElementById('status-solar'); if (!el) return;
          if (s === 'natural') { el.textContent = nat; el.dataset.solarState = 'error'; } else { el.textContent = t; el.dataset.solarState = s; }
        }, [STATES[st] ?? '', st, naturalText]);
        const m = await page.evaluate(measure);
        rows.push({ build, panelMode, w, state: st, ...m });
      }
    }
  }
  rows.push({ build, naturalText, catalogText });
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/sweep.json`, JSON.stringify(rows, null, 0));
// summary: per build/panel/state, list width ranges where bar overlaps hint, and max band height
const summary = {};
for (const r of rows) {
  if (r.w === undefined) continue;
  const k = `${r.build}|${r.panelMode}|${r.state}`;
  summary[k] ??= { overlapWidths: [], maxBand: 0, maxBandAt: null, maxHintOverlap: 0, hOverflowWidths: [] };
  const s = summary[k];
  if (r.hintOverlapPx > 0) s.overlapWidths.push(r.w);
  if (r.hOverflow) s.hOverflowWidths.push(r.w);
  if (r.bandH > s.maxBand) { s.maxBand = r.bandH; s.maxBandAt = r.w; }
  if (r.hintOverlapPx > s.maxHintOverlap) s.maxHintOverlap = r.hintOverlapPx;
}
const ranges = (ws) => { const out = []; let a = null, b = null; for (const w of ws) { if (a === null) { a = b = w; } else if (w - b <= 8) b = w; else { out.push(a === b ? `${a}` : `${a}-${b}`); a = b = w; } } if (a !== null) out.push(a === b ? `${a}` : `${a}-${b}`); return out; };
for (const [k, s] of Object.entries(summary)) console.log(k, 'maxBand', s.maxBand, '@', s.maxBandAt, 'hintOverlap(max px)', s.maxHintOverlap, 'at widths', JSON.stringify(ranges(s.overlapWidths)), 'hOverflow', JSON.stringify(ranges(s.hOverflowWidths)));
fs.writeFileSync(`${OUT}/sweep-summary.json`, JSON.stringify(Object.fromEntries(Object.entries(summary).map(([k, s]) => [k, { ...s, overlapRanges: ranges(s.overlapWidths), hOverflowRanges: ranges(s.hOverflowWidths) }])), null, 1));
