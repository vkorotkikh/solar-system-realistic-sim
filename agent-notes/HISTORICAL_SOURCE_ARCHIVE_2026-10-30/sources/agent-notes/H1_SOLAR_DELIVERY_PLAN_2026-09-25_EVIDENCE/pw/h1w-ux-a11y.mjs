// H-1 verify2 / ux: axe-core + accessibility tree + chip contrast + announcer behaviour, branch (4192) vs main (4193), 1440x900.
import { chromium } from 'playwright';
import fs from 'fs';

const SP = '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad';
const OUT = `${SP}/h1/verify2/ux`;
const BUILDS = { branch: 'http://127.0.0.1:4192/', main: 'http://127.0.0.1:4193/' };
const STATES = {
  error: "Sun: procedural fallback (solar server does not allow this page's origin http://127.0.0.1:4173 (CORS))",
  stale: 'Sun: backend state from 14:03 UTC (refresh failing: solar server failed without a readable reply, likely an internal error)',
  backend: 'Sun: backend solar model (data-driven forcing, observations unavailable; AIA 304 image; AIA 171 image failed to load) · updated 14:03 UTC',
  connecting: 'Sun: procedural fallback (connecting to solar model server)',
};
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

function chipColours() {
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2)); };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const BLACK = { r: 0, g: 0, b: 0, a: 1 }, WHITE = { r: 255, g: 255, b: 255, a: 1 }, SUN = { r: 255, g: 214, b: 150, a: 1 };
  const out = [];
  for (const id of ['status-focus', 'status-catalog', 'status-solar']) {
    const el = document.getElementById(id); if (!el) continue;
    const cs = getComputedStyle(el); const bcs = getComputedStyle(el, '::before');
    const text = parse(cs.color), bg = parse(cs.backgroundColor), border = parse(cs.borderTopColor), dot = parse(bcs.backgroundColor);
    const res = { id, state: el.dataset.solarState || el.dataset.catalogState || el.dataset.cameraMode, fontSize: cs.fontSize, fontWeight: cs.fontWeight, text: cs.color, bg: cs.backgroundColor, border: cs.borderTopColor, dot: bcs.backgroundColor };
    for (const [name, under] of [['overSpaceBlack', BLACK], ['overSunDisc', SUN], ['overWhite', WHITE]]) {
      const chipBg = over(bg, under);
      res[name] = { chipBg: hex(chipBg), textVsChip: ratio(over(text, chipBg), chipBg), borderVsScene: ratio(over(border, under), under), borderVsChip: ratio(over(border, chipBg), chipBg), dotVsChip: ratio(over(dot, chipBg), chipBg), dotHex: hex(over(dot, chipBg)) };
    }
    out.push(res);
  }
  return out;
}

async function axNode(cdp, selector) {
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  if (!nodeId) return null;
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
  return nodes.map((n) => ({
    role: n.role?.value, name: n.name?.value, ignored: n.ignored, ignoredReasons: (n.ignoredReasons || []).map((r) => r.name),
    props: Object.fromEntries((n.properties || []).map((p) => [p.name, p.value?.value])),
    childTextNodes: (n.childIds || []).length,
  }));
}

const result = { generated: new Date().toISOString(), runs: [], timelines: {}, announcer: {} };
for (const [build, url] of Object.entries(BUILDS)) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.route(/:8042\//, (r) => r.abort('connectionrefused'));
  await ctx.addInitScript(() => {
    const orig = window.requestAnimationFrame.bind(window);
    window.__rafFrozen = false; window.__rafQueue = [];
    window.requestAnimationFrame = (cb) => (window.__rafFrozen ? (window.__rafQueue.push(cb), 0) : orig(cb));
    window.__freeze = () => { window.__rafFrozen = true; };
    // timeline of writes to the chip and the announcer, from the very first moment
    window.__timeline = [];
    window.__shifts = [];
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__shifts.push({ t: Math.round(e.startTime), value: e.value, hadRecentInput: e.hadRecentInput, sources: (e.sources || []).map((s) => s.node ? (s.node.id || s.node.nodeName) : null) }); }).observe({ type: 'layout-shift', buffered: true }); } catch (e) { window.__shifts.push({ error: String(e) }); }
    document.addEventListener('DOMContentLoaded', () => {
      for (const id of ['status-solar', 'status-solar-announcer', 'status-catalog']) {
        const el = document.getElementById(id); if (!el) continue;
        window.__timeline.push({ t: Math.round(performance.now()), id, event: 'initial', text: el.textContent, state: el.dataset.solarState ?? el.dataset.catalogState ?? null });
        new MutationObserver(() => window.__timeline.push({ t: Math.round(performance.now()), id, event: 'write', text: el.textContent, state: el.dataset.solarState ?? el.dataset.catalogState ?? null }))
          .observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-solar-state', 'data-catalog-state'] });
      }
    });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  const warns = []; page.on('console', (m) => { if (m.type() === 'warning') warns.push({ t: Date.now(), text: m.text().slice(0, 220) }); });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(12000);
  await page.evaluate(() => document.fonts.ready);
  result.timelines[build] = await page.evaluate(() => window.__timeline);
  result.timelines[build + '_consoleWarns'] = warns.map((w) => ({ ms: w.t - t0, text: w.text })).filter((w) => /solar|Sun/i.test(w.text));
  await page.evaluate(() => window.__freeze());
  await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js' });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Accessibility.enable');
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const natural = await page.evaluate(() => ({ t: document.getElementById('status-solar')?.textContent ?? null, s: document.getElementById('status-solar')?.dataset.solarState ?? null }));
  const states = build === 'branch' ? ['natural', ...Object.keys(STATES)] : ['natural'];
  for (const st of states) {
    if (build === 'branch') {
      const [t, s] = st === 'natural' ? [natural.t, natural.s] : [STATES[st], st];
      await page.evaluate(([t, s]) => { const el = document.getElementById('status-solar'); el.textContent = t; el.title = t; el.dataset.solarState = s; }, [t, s]);
    }
    await page.waitForTimeout(200);
    const axe = await page.evaluate(async (tags) => {
      const r = await axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations', 'incomplete'] });
      const slim = (list) => list.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target.join(' '), summary: (n.failureSummary || '').slice(0, 300), data: n.any?.[0]?.data ?? null })) }));
      return { version: axe.version, violations: slim(r.violations), incompleteOnStatus: slim(r.incomplete).map((v) => ({ ...v, nodes: v.nodes.filter((n) => /status-/.test(n.target)) })).filter((v) => v.nodes.length) };
    }, TAGS);
    const colours = await page.evaluate(chipColours);
    const ax = { statusBar: await axNode(cdp, '#status-bar'), catalog: await axNode(cdp, '#status-catalog'), solar: await axNode(cdp, '#status-solar'), announcer: await axNode(cdp, '#status-solar-announcer') };
    result.runs.push({ build, state: st, axe, colours, ax });
    console.log(`== ${build} ${st} axe ${axe.version}: ${axe.violations.map((v) => `${v.id}(${v.impact},${v.nodes.length}: ${v.nodes.map((n) => n.target).join(' | ').slice(0, 140)})`).join('; ') || 'none'}`);
    console.log('   incomplete on status:', JSON.stringify(axe.incompleteOnStatus.map((v) => `${v.id}:${v.nodes.map((n) => n.target).join(',')}`)));
    for (const c of colours.filter((c) => c.id === 'status-solar' || st === 'natural')) console.log('   colour', c.id, c.state, JSON.stringify({ black: c.overSpaceBlack, sun: c.overSunDisc }));
  }
  // Tree dumps (full, for the record) for the chip and announcer
  if (build === 'branch') {
    const ann = {};
    ann.ax = await axNode(cdp, '#status-solar-announcer');
    ann.dom = await page.evaluate(() => {
      const el = document.getElementById('status-solar-announcer');
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { outerHTML: el.outerHTML, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, clip: cs.clip, overflow: cs.overflow, position: cs.position, whiteSpace: cs.whiteSpace, tabIndex: el.tabIndex, focusableAttr: el.hasAttribute('tabindex'), parent: el.parentElement.id || el.parentElement.tagName, inBar: !!el.closest('#status-bar'), liveAttr: el.getAttribute('aria-live'), roleAttr: el.getAttribute('role') };
    });
    // tab through the page: does focus ever land on the announcer or the chip?
    await page.evaluate(() => document.body.focus());
    const tabStops = [];
    for (let k = 0; k < 80; k++) { await page.keyboard.press('Tab'); tabStops.push(await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)); }
    ann.tabStopsHitAnnouncerOrChip = tabStops.filter((id) => id === 'status-solar-announcer' || id === 'status-solar');
    ann.tabStopCount = new Set(tabStops).size;
    // layout shift on announcer write
    const before = await page.evaluate(() => ({ bar: document.getElementById('status-bar').getBoundingClientRect().toJSON(), docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, bodyW: document.body.scrollWidth, bodyH: document.body.scrollHeight, mainW: document.querySelector('main').scrollWidth, mainH: document.querySelector('main').scrollHeight, shifts: window.__shifts.length }));
    await page.evaluate(() => { document.getElementById('status-solar-announcer').textContent = 'Sun data unavailable: solar server does not allow this page\'s origin. Showing the procedural Sun. ' + 'x'.repeat(400); });
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({ bar: document.getElementById('status-bar').getBoundingClientRect().toJSON(), docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, bodyW: document.body.scrollWidth, bodyH: document.body.scrollHeight, mainW: document.querySelector('main').scrollWidth, mainH: document.querySelector('main').scrollHeight, shifts: window.__shifts.length, annRect: document.getElementById('status-solar-announcer').getBoundingClientRect().toJSON() }));
    ann.layoutShiftCheck = { before, after, allShifts: await page.evaluate(() => window.__shifts) };
    // which fonts actually render the candidate URL styles here (for the legibility note)
    const fonts = {};
    for (const [k, fam] of Object.entries({ chakra: '', systemUi: 'system-ui, sans-serif', mono: "ui-monospace, 'Cascadia Mono', 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', 'DejaVu Sans Mono', monospace" })) {
      await page.evaluate((fam) => { const el = document.getElementById('status-solar'); el.textContent = 'http://127.0.0.1:8042'; el.style.fontFamily = fam; }, fam);
      const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#status-solar' });
      fonts[k] = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts;
    }
    ann.platformFonts = fonts;
    result.announcer = ann;
    console.log('announcer', JSON.stringify(ann.dom), '\n ax', JSON.stringify(ann.ax), '\n tab hits', JSON.stringify(ann.tabStopsHitAnnouncerOrChip), 'unique stops', ann.tabStopCount);
    console.log(' shift', JSON.stringify({ before, after }), '\n shifts', JSON.stringify(ann.layoutShiftCheck.allShifts).slice(0, 600));
    console.log(' fonts', JSON.stringify(fonts));
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/a11y.json`, JSON.stringify(result, null, 1));
console.log('timeline branch', JSON.stringify(result.timelines.branch));
console.log('warns branch', JSON.stringify(result.timelines.branch_consoleWarns));
console.log('timeline main', JSON.stringify(result.timelines.main));
console.log('done');
