// FE-EPOCH-RANGE: preserve exact relative/path backend identity and owned diagnosis.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// Actual public client; owned transport/timers only, no live backend/provider.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { SolarPhysicsClient } from '../src/frontend/features/solar/solarPhysicsClient.ts';

const JD = 2451545;
const RANGE = { min_jd_tdb: JD - 365.25, max_jd_tdb: JD + 365.25 };
const OUTSIDE = RANGE.max_jd_tdb + 1;
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body });
const rangeError = () => response({detail: {code: 'jd_out_of_range', message: 'Owned solar range.', retryable: false, valid_jd_range: RANGE}}, 400);
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
async function flush() { for (let i = 0; i < 100; i++) await Promise.resolve(); }
function metrics(status) {
  return Object.fromEntries(['lastError', 'lastFailure', 'consecutiveFailures', 'lastSuccessMs', 'lastRefreshMs', 'lastLatencyMs']
    .map(key => [key, structuredClone(status[key])]));
}
async function fixture(initialBase, run) {
  const saved = { fetch: globalThis.fetch, now: Date.now, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
    performance: Object.getOwnPropertyDescriptor(globalThis, 'performance') };
  let now = 1_000_000, timerId = 0, base = initialBase, baseCalls = 0;
  const timers = new Map(), requests = [], pending = [];
  let handler = () => rangeError();
  Date.now = () => now;
  Object.defineProperty(globalThis, 'performance', {configurable: true, value: {now: () => now}});
  globalThis.setTimeout = (fn, ms) => { const id = ++timerId; timers.set(id, {fn, at: now + Number(ms)}); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  globalThis.fetch = (input, init) => {
    // Preserve the exact caller string. URL resolution is only for parsing query
    // fields in assertions, never for source/base identity or dispatch.
    const request = {url: String(input), mode: init?.mode, signal: init?.signal};
    requests.push(request);
    try { return Promise.resolve(handler(request)); } catch (error) { return Promise.reject(error); }
  };
  const client = new SolarPhysicsClient({baseUrl: () => { baseCalls++; return base; }});
  const f = {
    client, requests, status: () => client.status(), baseCalls: () => baseCalls,
    setBase(value) { base = value; }, setHandler(value) { handler = value; },
    refresh(jd = OUTSIDE, force = false) { const promise = client.maybeRefresh(jd, force); pending.push(promise); return promise; },
    async advance(ms) {
      const target = now + ms;
      for (let i = 0; i < 100; i++) {
        const next = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) { now = target; await flush(); return; }
        now = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
      }
      assert.fail('owned timer bound exceeded');
    },
    timerCount: () => timers.size,
  };
  try { await run(f); }
  finally {
    try { client.dispose(); await flush(); await Promise.all(pending); assert.equal(timers.size, 0, 'all owned timers retired'); }
    finally { globalThis.fetch = saved.fetch; Date.now = saved.now; globalThis.setTimeout = saved.setTimeout;
      globalThis.clearTimeout = saved.clearTimeout; Object.defineProperty(globalThis, 'performance', saved.performance); }
  }
}

for (const base of ['', '/api/v2']) test(`contract: relative base ${JSON.stringify(base)} learns and suppresses exact-range retries`, async () => {
  await fixture(base, async f => {
    assert.equal(await f.refresh(), false);
    assert.equal(f.requests.length, 1);
    assert(f.requests[0].url.startsWith(`${base}/solar/physics?`));
    assert.equal(new URL(f.requests[0].url, 'http://fixture.invalid').searchParams.get('jd_tdb'), OUTSIDE.toFixed(8));
    assert.equal(f.baseCalls(), 1, 'one captured base for the real discovery request');
    assert.equal(f.status().lastFailure.httpStatus, 400);
    const previousMetrics = metrics(f.status());
    await f.advance(30000);
    assert.equal(await f.refresh(OUTSIDE + 20), false);
    assert.equal(f.requests.length, 1, 'learned bounds suppress a later unsupported relative-base request');
    assert.deepEqual(metrics(f.status()), previousMetrics);
    assert.equal(f.status().epochRangeBlocked.baseUrl, base, 'retain the exact relative/path identity');
  });
});

for (const [base, nextBase] of [['', '/api/v2'], ['/api/v2', '/api/v3']]) test(`contract: exact base change ${JSON.stringify(base)} to ${JSON.stringify(nextBase)} permits a fresh attempt`, async () => {
  await fixture(base, async f => {
    await f.refresh();
    assert.equal(f.requests.length, 1);
    assert(f.requests[0].url.startsWith(`${base}/solar/physics?`));
    assert.equal(f.baseCalls(), 1);
    f.setBase(nextBase); await f.advance(1); await f.refresh();
    assert.equal(f.requests.length, 2, 'new exact backend base bypasses old range cadence once');
    assert(f.requests[1].url.startsWith(`${nextBase}/solar/physics?`));
    assert.equal(f.baseCalls(), 2, 'each real request resolves its base callback exactly once');
    assert.equal(f.status().epochRangeBlocked.baseUrl, nextBase);
    await f.advance(30000); await f.refresh();
    assert.equal(f.requests.length, 2, 'new backend independently learned the owned range');
  });
});

test('control: one captured relative base owns physics and both diagnosis stages', async () => {
  for (const base of ['', '/api/v2']) {
    await fixture(base, async f => {
      const physics = deferred(), cors = deferred();
      f.setHandler(request => request.url.endsWith('/health')
        ? request.mode === 'cors' ? cors.promise : response(null)
        : physics.promise);
      const pending = f.refresh(JD, true);
      assert.equal(f.baseCalls(), 1);
      assert(f.requests[0].url.startsWith(`${base}/solar/physics?`));
      f.setBase('/changed-during-physics'); physics.reject(new TypeError('Owned opaque failure'));
      await flush();
      assert.equal(f.requests[1].url, `${base}/health`);
      assert.equal(f.requests[1].mode, 'cors');
      f.setBase('/changed-during-diagnosis'); cors.reject(new TypeError('Owned CORS failure'));
      assert.equal(await pending, false);
      assert.equal(f.requests.length, 3);
      assert.equal(f.requests[2].url, `${base}/health`);
      assert.equal(f.requests[2].mode, 'no-cors');
      assert.equal(f.baseCalls(), 1, 'diagnosis never re-resolves the callback');
      assert.equal(f.status().lastFailure.kind, 'blocked');
      assert.equal(f.timerCount(), 0);
    });
  }
});
