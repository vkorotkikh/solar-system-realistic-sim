// H-1 spike: same-camera before/after screenshots around the FIRST /solar/physics success.
// Physics requests are aborted (page.route) until the "before" shots are taken; sim is paused so camera/planets are fixed.
import { chromium } from 'playwright';
import fs from 'fs';
const URL = process.env.URL, OUT = process.env.OUT, TAG = process.env.TAG || 'ab', EXTRA = +(process.env.EXTRA || 0);
fs.mkdirSync(`${OUT}/shots`, { recursive: true });
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
const T0 = Date.now(); const rel = () => Date.now() - T0; const ev = [];
let gateOpen = false;
await p.route('**/solar/physics**', r => { if (gateOpen) return r.continue(); ev.push({ t: rel(), e: 'gate-abort' }); return r.abort('failed'); });
const reqT = new Map();
p.on('request', r => { if (/\/solar\//.test(r.url())) reqT.set(r, rel()); });
p.on('requestfinished', async r => { if (!reqT.has(r)) return; const resp = await r.response(); ev.push({ t: rel(), e: 'finished', kind: /aia-tile/.test(r.url()) ? 'aia' : 'physics', status: resp?.status(), durMs: rel() - reqT.get(r), jd: new globalThis.URL(r.url()).searchParams.get('jd') }); });
p.on('requestfailed', r => { if (!reqT.has(r)) return; ev.push({ t: rel(), e: 'failed', url: r.url().slice(-60), err: r.failure()?.errorText }); });
p.on('console', m => { const t = m.text(); if (/spike|error|warn/i.test(t) || m.type() === 'error') ev.push({ t: rel(), e: 'console', type: m.type(), text: t.slice(0, 300) }); });
p.on('pageerror', e => ev.push({ t: rel(), e: 'pageerror', text: e.message }));
const shot = async label => { const path = `${OUT}/shots/${TAG}_${label}.png`; await p.screenshot({ path, timeout: 90000 }); ev.push({ t: rel(), e: 'shot', label, path }); };
const state = async () => p.evaluate(() => window.__spikeSolar ? window.__spikeSolar() : null);
await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
await p.waitForTimeout(6000);
ev.push({ t: rel(), e: 'pause', r: await p.evaluate(() => { const bt = document.getElementById('toggle-play'); bt.click(); return bt.getAttribute('aria-pressed') + '|' + bt.textContent.trim(); }) });
await p.mouse.move(815, 400); for (let i = 0; i < 5; i++) { await p.mouse.wheel(0, -400); await p.waitForTimeout(150); }
await p.waitForTimeout(3000);
ev.push({ t: rel(), e: 'state-before', s: await state() });
await shot('B1'); await p.waitForTimeout(1500); await shot('B2');
gateOpen = true; ev.push({ t: rel(), e: 'gate-open' });
const tGate = rel();
while (rel() - tGate < 90000) { if (ev.some(x => x.e === 'finished' && x.kind === 'physics' && x.status === 200)) break; await p.waitForTimeout(500); }
const tOk = rel();
while (rel() - tOk < 15000) { if (ev.some(x => x.e === 'console' && /spike-aia\] (loaded|error)/.test(x.text))) break; await p.waitForTimeout(500); }
await p.waitForTimeout(2500);
ev.push({ t: rel(), e: 'state-after', s: await state() });
await shot('A1'); await p.waitForTimeout(1500); await shot('A2');
ev.push({ t: rel(), e: 'toggle-field', r: await p.evaluate(() => { const e = document.getElementById('toggle-magnetic-field'); e.click(); return e.checked; }) });
await p.waitForTimeout(2000);
ev.push({ t: rel(), e: 'state-field', s: await state() });
await shot('A3field');
if (EXTRA > 0) { await p.waitForTimeout(EXTRA * 1000); ev.push({ t: rel(), e: 'state-extra', s: await state() }); }
fs.writeFileSync(`${OUT}/ab_${TAG}.json`, JSON.stringify(ev, null, 1));
for (const x of ev) console.log(JSON.stringify(x).slice(0, 420));
await b.close();
