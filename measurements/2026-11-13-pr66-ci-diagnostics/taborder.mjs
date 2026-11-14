import { chromium } from 'playwright';
// How many Tab presses does each control in the open panel absorb? Headless only.
// Usage: node taborder.mjs [port]   (a Vite dev server of the app on 127.0.0.1)
const port = process.argv[2] ?? '4195';
const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
await page.route('**/*', route => new URL(route.request().url()).origin === `http://127.0.0.1:${port}` ? route.continue() : route.fulfill({ status: 503, body: 'offline' }));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
const panel = page.locator('#control-panel');
await panel.waitFor({ state: 'visible', timeout: 120000 });
for (const summary of await panel.locator('details > summary').all()) {
  if (!await summary.evaluate(e => e.parentElement.open)) { await summary.focus(); await summary.press('Enter'); }
}
const stops = await panel.locator('a[href],button,input,select,summary,[tabindex]').evaluateAll(els => els
  .filter(e => e instanceof HTMLElement && e.tabIndex >= 0 && !e.matches(':disabled') && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden')
  .map(e => e.id || `${e.tagName}:${e.textContent?.trim().slice(0, 20)}`));
await panel.locator('#panel-close').focus();
const presses = new Map();
let wrappedAfter = null;
for (let i = 0; i < stops.length * 4; i += 1) {
  const key = await page.evaluate(() => { const a = document.activeElement; return a?.id || `${a?.tagName}:${a?.textContent?.trim().slice(0, 20)}`; });
  if (i > 0 && key === 'panel-close') { wrappedAfter = i; break; }
  presses.set(key, (presses.get(key) ?? 0) + 1);
  await page.keyboard.press('Tab');
}
console.log(JSON.stringify({ stops: stops.length, distinctVisited: presses.size, wrappedAfterPresses: wrappedAfter,
  multiPress: [...presses].filter(([, n]) => n > 1), notInStops: [...presses.keys()].filter(k => !stops.includes(k)), neverVisited: stops.filter(s => !presses.has(s)) }));
await browser.close();
