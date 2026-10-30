import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const runs = [];
for (let i = 0; i < 6; i++) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    window.__chip = [];
    const t0 = performance.now();
    new MutationObserver(() => {
      const el = document.querySelector('#status-solar');
      const an = document.querySelector('#status-solar-announcer');
      if (el) window.__chip.push({ t: Math.round(performance.now() - t0), state: el.dataset.solarState, text: el.textContent, ann: an?.textContent ?? '' });
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-solar-state'] });
  });
  const warns = [];
  p.on('console', (m) => { if (m.text().startsWith('[solar]')) warns.push(m.text().split('\n')[0]); });
  await p.goto('http://127.0.0.1:4194/', { waitUntil: 'load' });
  await p.waitForTimeout(12000);
  const log = await p.evaluate(() => window.__chip);
  const states = [...new Set(log.map((e) => e.state))];
  const falseError = log.some((e) => e.state === 'error');
  const final = log.at(-1);
  runs.push({ run: i + 1, states, falseError, final: final?.text, finalAnn: final?.ann, warns });
  await ctx.close();
}
console.log(JSON.stringify(runs, null, 1));
await b.close();
