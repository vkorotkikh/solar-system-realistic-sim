import { chromium } from 'playwright';
const OUT = process.env.OUT;
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await p.goto('http://127.0.0.1:5183/?backendPort=8073', { waitUntil: 'load' });
await p.waitForTimeout(3000);
await p.mouse.move(815, 400);
for (const n of [6, 12]) { for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, -400); await p.waitForTimeout(150); }
  await p.waitForTimeout(1500); const range = await p.evaluate(() => [...document.querySelectorAll('*')].map(e => e.textContent).find(t => /^\s*Range/.test(t || '') && t.length < 40));
  console.log(n, range); const t0 = Date.now(); await p.screenshot({ path: `${OUT}/shots/zoomprobe_${n}.png` }); console.log('shot ms', Date.now() - t0); }
await b.close();
