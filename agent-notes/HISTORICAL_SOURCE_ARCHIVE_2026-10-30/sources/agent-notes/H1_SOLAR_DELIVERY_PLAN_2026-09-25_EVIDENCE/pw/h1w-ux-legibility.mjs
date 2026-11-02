// H-1 verify2 / ux: legibility of dots in "127.0.0.1" / "localhost:8042" in #status-solar at 1x DPR.
import { chromium } from 'playwright';
import fs from 'fs';

const SP = '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad';
const OUT = `${SP}/h1/verify2/ux`;
const ZOOM = `${OUT}/zoom`;
fs.mkdirSync(ZOOM, { recursive: true });
const URL = 'http://127.0.0.1:4192/';

const TEXTS = {
  ip8042: ['Sun: procedural fallback (solar server not reachable at ', 'http://127.0.0.1:8042', ')'],
  localhost8042: ['Sun: procedural fallback (solar server not reachable at ', 'http://localhost:8042', ')'],
  origin4191: ["Sun: procedural fallback (solar server does not allow this page's origin ", 'http://127.0.0.1:4191', ' (CORS))'],
};
const MONO = "ui-monospace, 'Cascadia Mono', 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', 'DejaVu Sans Mono', monospace";
// Each option: css applied to #status-solar, and css applied to the URL span (span.solar-url).
const OPTIONS = {
  current: { chip: '', url: '' },
  'ls-0.04em': { chip: 'letter-spacing: 0.04em;', url: '' },
  'ls-0.04em-url-only': { chip: '', url: 'letter-spacing: 0.04em;' },
  'ls-0.08em-url-only': { chip: '', url: 'letter-spacing: 0.08em;' },
  'tabular-nums': { chip: 'font-variant-numeric: tabular-nums;', url: '' },
  'mono-url': { chip: '', url: `font-family: ${MONO}; font-size: 0.95em;` },
  'mono-url-1em': { chip: '', url: `font-family: ${MONO};` },
  'weight600-url': { chip: '', url: 'font-weight: 600;' },
  'system-sans-url': { chip: '', url: 'font-family: system-ui, sans-serif;' },
};

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const result = { generated: new Date().toISOString(), monoStack: MONO, runs: [] };

for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
  await ctx.route(/:8042\//, (r) => r.abort('connectionrefused'));
  await ctx.addInitScript(() => {
    const orig = window.requestAnimationFrame.bind(window);
    window.__rafFrozen = false; window.__rafQueue = [];
    window.requestAnimationFrame = (cb) => (window.__rafFrozen ? (window.__rafQueue.push(cb), 0) : orig(cb));
    window.__freeze = () => { window.__rafFrozen = true; };
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(8000);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.__freeze());
  // close the panel at desktop so the chip sits on one row, and hide the other chips' influence on wrapping? keep them (realistic)
  if (w > 1100) { await page.evaluate(() => document.getElementById('panel-close')?.click()); await page.waitForTimeout(800); }
  await page.addStyleTag({ content: '#status-solar .solar-url{}' });
  for (const [textKey, [pre, urlText, post]] of Object.entries(TEXTS)) {
    for (const [optKey, opt] of Object.entries(OPTIONS)) {
      await page.evaluate(([pre, urlText, post, opt]) => {
        let st = document.getElementById('__legib'); if (!st) { st = document.createElement('style'); st.id = '__legib'; document.head.appendChild(st); }
        st.textContent = `#status-solar{${opt.chip}} #status-solar .solar-url{${opt.url}}`;
        const el = document.getElementById('status-solar');
        el.dataset.solarState = 'error';
        const wrap = document.createElement('span'); wrap.className = 'solar-text'; wrap.append(document.createTextNode(pre), Object.assign(document.createElement('span'), { className: 'solar-url', textContent: urlText }), document.createTextNode(post)); el.replaceChildren(wrap);
      }, [pre, urlText, post, opt]);
      await page.waitForTimeout(150);
      const geo = await page.evaluate(() => {
        const el = document.getElementById('status-solar');
        const span = el.querySelector('.solar-url');
        const node = span.firstChild;
        const range = document.createRange();
        const chars = [];
        for (let i = 0; i < node.length; i++) { range.setStart(node, i); range.setEnd(node, i + 1); const r = range.getClientRects()[0]; chars.push({ c: node.data[i], x: r.x, y: r.y, w: r.width, h: r.height }); }
        const sr = span.getBoundingClientRect(); const cr = el.getBoundingClientRect();
        const cs = getComputedStyle(span);
        return { chars, span: { x: sr.x, y: sr.y, w: sr.width, h: sr.height }, chip: { x: cr.x, y: cr.y, w: cr.width, h: cr.height }, chipTextW: (() => { const rr = document.createRange(); rr.selectNodeContents(el); return [...rr.getClientRects()].reduce((s, r) => s + r.width, 0); })(), font: `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, letterSpacing: cs.letterSpacing, fontVariantNumeric: cs.fontVariantNumeric, lines: new Set(chars.map((c) => Math.round(c.y))).size };
      });
      // screenshot the chip row
      const pad = 6;
      const clip = { x: Math.max(0, Math.floor(geo.span.x) - pad), y: Math.max(0, Math.floor(geo.chip.y)), width: Math.ceil(geo.span.w) + 2 * pad, height: Math.ceil(geo.chip.h) };
      if (geo.lines > 1) { clip.x = Math.floor(geo.chip.x); clip.width = Math.ceil(geo.chip.w); }
      const png = await page.screenshot({ clip, timeout: 120000 });
      const analysis = await page.evaluate(async ([b64, clip, geo, scale]) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
        const data = g.getImageData(0, 0, img.width, img.height).data;
        const L = (x, y) => { const i = (y * img.width + x) * 4; return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; };
        // background: median of the chip's top padding row
        const bgRow = []; for (let x = 0; x < img.width; x++) bgRow.push(L(x, 2)); bgRow.sort((a, b) => a - b); const bgL = bgRow[Math.floor(bgRow.length / 2)];
        const chars = geo.chars.map((c) => ({ ...c, x0: Math.round(c.x - clip.x), x1: Math.round(c.x + c.w - clip.x), y0: Math.max(0, Math.round(c.y - clip.y)), y1: Math.min(img.height, Math.round(c.y + c.h - clip.y)) }));
        const y0 = Math.min(...chars.map((c) => c.y0)), y1 = Math.max(...chars.map((c) => c.y1));
        let textL = bgL; for (let y = y0; y < y1; y++) for (let x = 0; x < img.width; x++) textL = Math.max(textL, L(x, y));
        const norm = (v) => (v - bgL) / Math.max(1, textL - bgL);
        const colInk = (x, ya, yb) => { let m = 0; for (let y = ya; y < yb; y++) m = Math.max(m, norm(L(x, y))); return m; };
        const INK = 0.2;
        const dots = [];
        chars.forEach((c, i) => {
          if (c.c !== '.' && c.c !== ':') return;
          // ink columns of the dot inside its advance box
          let peak = 0; const cols = [];
          for (let x = Math.max(0, c.x0 - 1); x <= Math.min(img.width - 1, c.x1); x++) { const v = colInk(x, c.y0, c.y1); cols.push(+v.toFixed(2)); peak = Math.max(peak, v); }
          let inkXs = []; for (let x = Math.max(0, c.x0 - 1); x <= Math.min(img.width - 1, c.x1); x++) if (colInk(x, c.y0, c.y1) >= INK) inkXs.push(x);
          const prev = chars[i - 1], next = chars[i + 1];
          // last ink column of prev glyph, first ink column of next glyph
          let prevInk = null; if (prev) for (let x = prev.x1; x >= prev.x0 - 1; x--) if (colInk(x, prev.y0, prev.y1) >= INK) { prevInk = x; break; }
          let nextInk = null; if (next) for (let x = next.x0; x <= next.x1; x++) if (colInk(x, next.y0, next.y1) >= INK) { nextInk = x; break; }
          const dotL = inkXs.length ? Math.min(...inkXs) : null, dotR = inkXs.length ? Math.max(...inkXs) : null;
          // dot ink separated from neighbours by background columns?
          const clearCols = (a, b) => { if (a === null || b === null) return null; let n = 0; for (let x = a + 1; x < b; x++) if (colInk(x, c.y0, c.y1) < INK) n++; return n; };
          dots.push({ i, ch: c.c, context: geo.chars.slice(Math.max(0, i - 1), i + 2).map((q) => q.c).join(''), advancePx: +c.w.toFixed(2), peakInk: +peak.toFixed(2), inkWidthPx: dotL === null ? 0 : dotR - dotL + 1,
            clearLeft: dotL === null ? null : clearCols(prevInk, dotL), clearRight: dotR === null ? null : clearCols(dotR, nextInk), prevToNextInkGap: prevInk !== null && nextInk !== null ? nextInk - prevInk - 1 : null, cols });
        });
        // zoom (nearest neighbour)
        const z = document.createElement('canvas'); z.width = img.width * scale; z.height = img.height * scale; const zg = z.getContext('2d'); zg.imageSmoothingEnabled = false; zg.drawImage(img, 0, 0, z.width, z.height);
        return { bgL: +bgL.toFixed(1), textL: +textL.toFixed(1), dots, zoom: z.toDataURL('image/png').split(',')[1] };
      }, [png.toString('base64'), clip, geo, 8]);
      const tag = `${w}x${h}-${textKey}-${optKey}`;
      fs.writeFileSync(`${ZOOM}/${tag}-x8.png`, Buffer.from(analysis.zoom, 'base64'));
      fs.writeFileSync(`${ZOOM}/${tag}-x1.png`, png);
      delete analysis.zoom;
      const periods = analysis.dots.filter((d) => d.ch === '.');
      const summary = {
        minPeakInk: periods.length ? Math.min(...periods.map((d) => d.peakInk)) : null,
        minClear: periods.length ? Math.min(...periods.map((d) => Math.min(d.clearLeft ?? -1, d.clearRight ?? -1))) : null,
        minInkW: periods.length ? Math.min(...periods.map((d) => d.inkWidthPx)) : null,
        minGap: periods.length ? Math.min(...periods.map((d) => d.prevToNextInkGap ?? -1)) : null,
      };
      result.runs.push({ vp: `${w}x${h}`, text: textKey, option: optKey, font: geo.font, letterSpacing: geo.letterSpacing, fontVariantNumeric: geo.fontVariantNumeric, urlWidthPx: +geo.span.w.toFixed(1), chipTextW: +geo.chipTextW.toFixed(1), urlLines: geo.lines, summary, ...analysis });
      console.log(tag.padEnd(46), 'urlW', geo.span.w.toFixed(1).padStart(6), 'lines', geo.lines, 'periods', JSON.stringify(periods.map((d) => `${d.context}:pk${d.peakInk}/w${d.inkWidthPx}/L${d.clearLeft}R${d.clearRight}/gap${d.prevToNextInkGap}`)), 'font', geo.font.slice(0, 40));
    }
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/legibility.json`, JSON.stringify(result, null, 1));
console.log('done');
