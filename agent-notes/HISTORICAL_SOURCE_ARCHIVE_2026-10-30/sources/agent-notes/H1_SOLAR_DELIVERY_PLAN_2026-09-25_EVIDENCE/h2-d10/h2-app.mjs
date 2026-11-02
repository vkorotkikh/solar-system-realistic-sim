import { chromium } from 'playwright';
const OUT = process.env.OUT;
const b = await chromium.launch({ headless: true, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
for (const [tag, port] of [['before', 5198], ['after', 5199]]) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
  await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await p.waitForTimeout(9000);
  await p.screenshot({ path: `${OUT}/app-${tag}.png` });
  const note = await p.evaluate(() => document.querySelector('.switch-note')?.textContent ?? null);
  console.log(JSON.stringify({ tag, errors, scaleNote: note }));
  await p.close();
}
await b.close();
