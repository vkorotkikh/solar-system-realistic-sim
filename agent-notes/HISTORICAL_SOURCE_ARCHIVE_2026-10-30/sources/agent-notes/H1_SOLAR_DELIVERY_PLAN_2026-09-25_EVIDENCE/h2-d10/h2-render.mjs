import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const OUT = process.env.OUT, TAG = process.env.TAG;
const b = await chromium.launch({ headless: true, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto('http://127.0.0.1:5199/h2-harness/index.html');
const r = await p.waitForFunction(() => window.__result, null, { timeout: 60000 }).then((h) => h.jsonValue());
for (const view of ['side', 'pole']) {
  writeFileSync(`${OUT}/d10-${TAG}-${view}-corona-alpha.png`, Buffer.from(r[view].image.split(',')[1], 'base64'));
  writeFileSync(`${OUT}/d10-${TAG}-${view}-frame.png`, Buffer.from(r[view].frame.split(',')[1], 'base64'));
  delete r[view].image; delete r[view].frame;
}
console.log(JSON.stringify({ tag: TAG, ...r, errors }, null, 1));
await b.close();
