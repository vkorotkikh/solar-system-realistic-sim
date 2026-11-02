// H-1 verify / ux: axe-core + accessibility tree + chip contrast, branch (4192) vs main (4193), 1440x900.
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
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

function chipColours() {
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2)); };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const BLACK = { r: 0, g: 0, b: 0, a: 1 }, WHITE = { r: 255, g: 255, b: 255, a: 1 };
  // the canvas behind the bar: sample the space background colour used by the page (body bg)
  const bodyBg = parse(getComputedStyle(document.body).backgroundColor) || BLACK;
  const out = [];
  for (const id of ['status-focus', 'status-catalog', 'status-solar']) {
    const el = document.getElementById(id); if (!el) continue;
    const cs = getComputedStyle(el); const bcs = getComputedStyle(el, '::before');
    const text = parse(cs.color), bg = parse(cs.backgroundColor), border = parse(cs.borderTopColor), dot = parse(bcs.backgroundColor);
    const res = { id, state: el.dataset.solarState || el.dataset.catalogState || el.dataset.cameraMode, fontSize: cs.fontSize, fontWeight: cs.fontWeight, text: cs.color, bg: cs.backgroundColor, border: cs.borderTopColor, dot: bcs.backgroundColor };
    for (const [name, under] of [['overBlack', BLACK], ['overBodyBg', bodyBg], ['overWhite', WHITE]]) {
      const chipBg = over(bg, under);
      const borderOnScene = over(border, under); // border drawn over the scene (outside edge) ...
      const borderOnChip = over(border, chipBg);  // ... vs the chip interior
      const dotOnChip = over(dot, chipBg);
      res[name] = {
        chipBg: hex(chipBg), textVsChip: ratio(over(text, chipBg), chipBg),
        borderVsScene: ratio(borderOnScene, under), borderVsChip: ratio(borderOnChip, chipBg),
        dotVsChip: ratio(dotOnChip, chipBg), dotHex: hex(dotOnChip),
      };
    }
    out.push(res);
  }
  return out;
}

async function axTreeFor(page, cdp, selector) {
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  if (!nodeId) return null;
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
  return nodes.map((n) => ({
    role: n.role?.value, name: n.name?.value, nameSources: (n.name?.sources || []).filter((s) => s.value || s.attributeValue).map((s) => `${s.type}${s.attribute ? ':' + s.attribute : ''}=${JSON.stringify((s.value?.value ?? s.attributeValue?.value ?? '').slice(0, 60))}${s.superseded ? '(superseded)' : ''}`),
    ignored: n.ignored, ignoredReasons: (n.ignoredReasons || []).map((r) => r.name),
    props: Object.fromEntries((n.properties || []).map((p) => [p.name, p.value?.value])),
  }));
}

const result = { generated: new Date().toISOString(), runs: [] };
for (const [build, url] of Object.entries(BUILDS)) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.route(/:8042\//, (r) => r.abort('connectionrefused'));
  await ctx.addInitScript(() => {
    const orig = window.requestAnimationFrame.bind(window);
    window.__rafFrozen = false; window.__rafQueue = [];
    window.requestAnimationFrame = (cb) => (window.__rafFrozen ? (window.__rafQueue.push(cb), 0) : orig(cb));
    window.__freeze = () => { window.__rafFrozen = true; };
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(9000);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.__freeze());
  await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js' });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Accessibility.enable');
  const states = build === 'branch' ? ['natural', ...Object.keys(STATES)] : ['natural'];
  for (const st of states) {
    if (st !== 'natural') {
      await page.evaluate(([t, s]) => { const el = document.getElementById('status-solar'); el.textContent = t; el.title = t; el.dataset.solarState = s; }, [STATES[st], st]);
    }
    await page.waitForTimeout(200);
    const axe = await page.evaluate(async (tags) => {
      const r = await axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations', 'incomplete'] });
      const slim = (list) => list.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target.join(' '), summary: (n.failureSummary || '').slice(0, 300), data: n.any?.[0]?.data ?? null })) }));
      return { version: axe.version, violations: slim(r.violations), incomplete: slim(r.incomplete).filter((v) => v.nodes.some((n) => /status-/.test(n.target))) };
    }, TAGS);
    const colours = await page.evaluate(chipColours);
    const ax = {
      statusBar: await axTreeFor(page, cdp, '#status-bar'),
      catalog: await axTreeFor(page, cdp, '#status-catalog'),
      solar: await axTreeFor(page, cdp, '#status-solar'),
    };
    const text = await page.evaluate(() => ({ solar: document.getElementById('status-solar')?.textContent ?? null, title: document.getElementById('status-solar')?.title ?? null, catalog: document.getElementById('status-catalog')?.textContent }));
    result.runs.push({ build, state: st, text, axe, colours, ax });
    console.log(`\n== ${build} ${st} axe ${axe.version}: ${axe.violations.map((v) => `${v.id}(${v.impact},${v.nodes.length}: ${v.nodes.map((n) => n.target).join(' | ').slice(0, 160)})`).join('; ') || 'none'}`);
    console.log('   incomplete on status chips:', JSON.stringify(axe.incomplete.map((v) => `${v.id}:${v.nodes.filter((n) => /status-/.test(n.target)).map((n) => n.target).join(',')}`)));
    console.log('   ax solar:', JSON.stringify(ax.solar), '\n   ax bar:', JSON.stringify(ax.statusBar), '\n   ax catalog:', JSON.stringify(ax.catalog));
    for (const c of colours) console.log('   colour', c.id, c.state, JSON.stringify({ overBlack: c.overBlack, overBodyBg: c.overBodyBg, overWhite: c.overWhite }));
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/a11y.json`, JSON.stringify(result, null, 1));
