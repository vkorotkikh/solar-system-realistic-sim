import { chromium } from 'playwright';
const OUT = process.env.OUT;
const b = await chromium.launch({ headless: true, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
for (const [w, h] of [[1024, 768], [390, 844], [1440, 900]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto('http://127.0.0.1:4194/', { waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelector('#status-solar')?.dataset.solarState === 'error', null, { timeout: 30000 });
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => {
    const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }; };
    const url = document.querySelector('#status-solar .status-url');
    return { hint: r('.interaction-hint'), bar: r('#status-bar'), chipText: document.querySelector('#status-solar').textContent, urlText: url?.textContent, urlFont: url ? getComputedStyle(url).fontFamily : null, announcer: document.querySelector('#status-solar-announcer').textContent };
  });
  const overlap = info.hint && info.bar && !(info.hint.bottom <= info.bar.top || info.hint.top >= info.bar.bottom);
  console.log(JSON.stringify({ w, h, overlap, ...info }));
  await p.screenshot({ path: `${OUT}/chip-${w}x${h}.png`, clip: { x: 0, y: Math.max(0, info.bar.top - 50), width: w, height: Math.min(h, info.bar.bottom - info.bar.top + 60) } });
  await p.close();
}
await b.close();
