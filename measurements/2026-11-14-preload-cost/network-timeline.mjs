// Why does page.goto(..., { waitUntil: 'networkidle' }) never settle with the preloads?
// Records every request for a while after load: when it started, ended, and what it was.
// Usage: GPU=0 node network-timeline.mjs <url> [seconds]
import { launch } from '../lib/headless-gpu.mjs';

const [url, seconds = '60'] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
const origin = new URL(url).origin;
const t0 = Date.now();
const open = new Map();
const done = [];
const kind = (u) => {
  const path = new URL(u).pathname;
  if (path.startsWith('/moon-ephemerides/')) return 'moon shard';
  if (path.startsWith('/textures/surfaces/')) return 'surface map';
  if (new URL(u).origin !== origin) return `external ${new URL(u).host}`;
  if (/\.(ts|js|mjs|css|json)$/.test(path) || path.startsWith('/@') || path.startsWith('/node_modules/')) return 'module';
  return path;
};
page.on('request', (request) => open.set(request, { url: request.url(), start: Date.now() - t0 }));
const finish = (request, outcome) => {
  const entry = open.get(request); if (!entry) return;
  open.delete(request);
  done.push({ ...entry, end: Date.now() - t0, outcome, kind: kind(entry.url) });
};
page.on('requestfinished', (request) => finish(request, 'ok'));
page.on('requestfailed', (request) => finish(request, `failed ${request.failure()?.errorText}`));
await page.route('**/*', (route) => (new URL(route.request().url()).origin === origin ? route.continue() : route.fulfill({ status: 503, body: 'offline' })));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(Number(seconds) * 1000);

const byKind = {};
for (const entry of done) {
  const k = byKind[entry.kind] ??= { count: 0, first: Infinity, last: 0, failed: 0 };
  k.count += 1; k.first = Math.min(k.first, entry.start); k.last = Math.max(k.last, entry.end);
  if (entry.outcome !== 'ok') k.failed += 1;
}
console.log(JSON.stringify(byKind, null, 1));
const lastEnd = Math.max(...done.map((entry) => entry.end));
console.log(`requests finished: ${done.length}; still open after ${seconds} s: ${open.size}; last finished at ${lastEnd} ms`);
for (const entry of [...open.values()].slice(0, 10)) console.log(`  open since ${entry.start} ms: ${entry.url}`);
const gaps = done.map((entry) => entry.start).sort((a, b) => a - b);
const late = gaps.filter((start) => start > 20_000);
console.log(`requests started after 20 s: ${late.length}; examples: ${JSON.stringify(done.filter((entry) => entry.start > 20_000).slice(0, 6).map((entry) => `${entry.start} ${entry.kind} ${entry.url.slice(-60)}`))}`);
console.log('orbital worker:', await page.evaluate(() => document.getElementById('space-canvas')?.dataset.orbitalWorker));
console.log('status chips:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#status-bar [id^="status-"]')].map((el) => `${el.id}=${el.textContent?.trim().slice(0, 50)}`))));
await browser.close();
