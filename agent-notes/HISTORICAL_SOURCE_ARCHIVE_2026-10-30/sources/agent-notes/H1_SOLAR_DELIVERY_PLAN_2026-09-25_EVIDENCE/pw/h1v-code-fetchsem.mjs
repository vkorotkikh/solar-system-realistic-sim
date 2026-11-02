// h1v adversarial-code: real-Chromium fetch semantics the classifier relies on. Opens NO sockets:
// page origin + "reachable backend" are Playwright interceptions; 59998 is a verified-closed port.
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = process.env.OUT;
const PAGE = 'http://localhost:59997/';
const FAKE = 'http://localhost:59996';
const CLOSED = 'http://localhost:59998';

async function run(label, extraArgs) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', ...extraArgs] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const consoleMsgs = [];
  page.on('console', (m) => consoleMsgs.push(`${m.type()}: ${m.text()}`));
  const hits = [];
  await page.route(`${PAGE}**`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>t</title>' }));
  await page.route(`${FAKE}/**`, async (r) => {
    const u = new URL(r.request().url());
    hits.push(`${r.request().method()} ${u.pathname} mode-hdr=${r.request().headers()['sec-fetch-mode'] ?? '?'} pragma=${r.request().headers()['pragma'] ?? '-'} cache-control=${r.request().headers()['cache-control'] ?? '-'}`);
    if (u.pathname === '/health') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' });
    if (u.pathname === '/err500') return r.fulfill({ status: 500, contentType: 'text/plain', body: 'Internal Server Error' });
    if (u.pathname === '/busy503-cors') return r.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://localhost:59997' }, body: '{"detail":"Solar physics requests are temporarily saturated. Retry shortly."}' });
    if (u.pathname === '/slow') return; // never answer
    return r.fulfill({ status: 404, body: 'nf' });
  });
  await page.goto(PAGE);
  const result = await page.evaluate(async ({ FAKE, CLOSED }) => {
    const describe = (e) => ({ name: e?.name, ctor: e?.constructor?.name, isTypeError: e instanceof TypeError, isDOMException: e instanceof DOMException, message: String(e?.message ?? e) });
    const out = {};
    const t = async (key, fn) => { const t0 = performance.now(); try { const r = await fn(); out[key] = { resolved: true, type: r.type, status: r.status, ms: Math.round(performance.now() - t0) }; } catch (e) { out[key] = { resolved: false, ...describe(e), ms: Math.round(performance.now() - t0) }; } };
    await t('noCorsClosedPort', () => fetch(`${CLOSED}/health`, { mode: 'no-cors', cache: 'no-store' }));
    await t('corsClosedPort', () => fetch(`${CLOSED}/solar/physics`, { cache: 'no-store' }));
    await t('noCorsReachable500', () => fetch(`${FAKE}/err500`, { mode: 'no-cors', cache: 'no-store' }));
    await t('noCorsReachableHealth', () => fetch(`${FAKE}/health`, { mode: 'no-cors', cache: 'no-store' }));
    await t('corsReachable500NoAcao', () => fetch(`${FAKE}/err500`, { cache: 'no-store' }));
    await t('cors503WithAcao', () => fetch(`${FAKE}/busy503-cors`, { cache: 'no-store' }));
    await t('abortControllerNoReason', () => { const c = new AbortController(); setTimeout(() => c.abort(), 150); return fetch(`${FAKE}/slow`, { signal: c.signal, cache: 'no-store' }); });
    await t('abortSignalTimeout', () => fetch(`${FAKE}/slow`, { signal: AbortSignal.timeout(150), cache: 'no-store' }));
    const c = new AbortController(); c.abort();
    out.defaultAbortReason = describe(c.signal.reason);
    return out;
  }, { FAKE, CLOSED });
  await browser.close();
  return { label, result, hits, consoleMsgs };
}

const runs = [];
runs.push(await run('chromium-default-features (intercepted page origin = "public" for LNA)', []));
runs.push(await run('chromium-LNA-disabled', ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights']));
const txt = JSON.stringify(runs, null, 2);
if (OUT) fs.writeFileSync(OUT, txt);
console.log(txt);
