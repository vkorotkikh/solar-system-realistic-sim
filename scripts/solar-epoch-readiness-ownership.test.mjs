// FE-EPOCH-RANGE: readiness is advisory; callback reentry cannot replace request ownership.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// Actual clients/controller; scoped call-through observation and owned transport/timers only.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { SolarPhysicsClient } from '../src/frontend/features/solar/solarPhysicsClient.ts';
import { createSunController } from '../src/sunController.ts';
import { SolarDataAnnouncer } from '../src/frontend/features/solar/solarDataStatus.ts';

const JD = 2451545;
const RANGE = { min_jd_tdb: JD - 365.25, max_jd_tdb: JD + 365.25 };
const OUTSIDE = RANGE.max_jd_tdb + 1;
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body });
function payload(jd) {
  return { schema: { name: 'solar_physics_state', version: 2 }, epoch_jd_tdb: jd, wall_epoch_jd_tdb: jd, jd_time_scale: 'TDB',
    forcing: 'hybrid', effective_forcing: 'synthetic', live_data_requested: true, live_data_enabled: false,
    fallback_reason: 'disabled_unvalidated', activity_index: 0.42,
    forcing_status: { requested: 'hybrid', effective: 'synthetic', observed_input_status: 'disabled_unvalidated', runtime_eligible: false, fallback_reason: 'disabled_unvalidated' } };
}
function rangeError(range = RANGE, status = 400, code = 'jd_out_of_range') {
  return response({ detail: { code, message: 'Owned configured solar interval.', retryable: false, valid_jd_range: range } }, status);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 100; i++) await Promise.resolve(); }
function attemptMetrics(status) {
  return Object.fromEntries(['lastError', 'lastFailure', 'consecutiveFailures', 'lastSuccessMs', 'lastRefreshMs', 'lastLatencyMs'].map(key => [key, structuredClone(status[key])]));
}
async function fixture({ controller: useController = true, jd = OUTSIDE, holdRealtime = false } = {}, run) {
  const saved = { realRefresh: SolarPhysicsClient.prototype.maybeRefresh, fetch: globalThis.fetch, now: Date.now, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
    performance: Object.getOwnPropertyDescriptor(globalThis, 'performance') };
  let now = Date.UTC(2026, 9, 24), timerId = 0, base = 'http://owned-a.invalid', client, controller;
  const timers = new Map(), physics = [], realtime = [], publications = [], announcements = [], pending = [], clientCalls = [];
  const hooks = { onBase: null };
  const realtimeDelivery = deferred();
  const getBase = () => { hooks.onBase?.(); return base; };
  SolarPhysicsClient.prototype.maybeRefresh = function (...args) {
    clientCalls.push({ jd: args[0], force: args[1], disposed: this.disposed });
    return saved.realRefresh.apply(this, args);
  };
  const state = { julianDate: jd, paused: true, timeScaleDaysPerSec: 120, timeScaleDirty: false };
  const announcer = new SolarDataAnnouncer({ textContent: '' });
  let handler = request => request.jd < RANGE.min_jd_tdb || request.jd > RANGE.max_jd_tdb ? rangeError() : response(payload(request.jd));
  Date.now = () => now;
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
  globalThis.setTimeout = (fn, ms) => { const id = ++timerId; timers.set(id, { fn, at: now + Number(ms) }); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  globalThis.fetch = (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/solar/realtime')) { realtime.push(String(input)); return holdRealtime ? realtimeDelivery.promise : Promise.resolve(response({ detail: 'Owned realtime unavailable.' }, 503)); }
    assert(url.pathname.endsWith('/solar/physics'), 'no health/provider/unexpected request in this fixture');
    const request = { url: String(input), jd: Number(url.searchParams.get('jd_tdb')), signal: init.signal };
    physics.push(request);
    try { return Promise.resolve(handler(request, physics.length - 1)); } catch (error) { return Promise.reject(error); }
  };
  try {
    if (useController) controller = createSunController({
      camera: {}, simState: state, backendBaseUrl: getBase,
      configureLoadedTexture: () => assert.fail('no eligible observation in fixture'),
      observationTextureLoader: { load: () => assert.fail('no texture acquisition in fixture') },
      getSunRadiusAu: () => 0.01, isMagneticFieldEnabled: () => false,
      onSolarDataStatus: status => { publications.push(structuredClone(status)); if (announcer.observe(status)) announcements.push(structuredClone(status)); },
    });
    else client = new SolarPhysicsClient({ baseUrl: getBase });
    const f = {
      state, physics, realtime, publications, announcements, client, controller, hooks, clientCalls,
      status: () => controller ? controller.getSolarDeliveryStatus().physics : client.status(),
      retained: () => controller ? controller.getSolarDeliveryStatus().geometry.snapshotEpochJdTdb : client.latestState()?.epoch_jd_tdb ?? null,
      setHandler(value) { handler = value; }, setBase(value) { base = value; },
      start(force = false) { if (controller) controller.maybeRefreshPhysics(now, force); else pending.push(client.maybeRefresh(state.julianDate, force)); },
      async refresh(force = false) { f.start(force); await flush(); },
      dispose() { if (controller) controller.disposeSolarDelivery(); else client.dispose(); },
      async advance(ms) {
        const target = now + ms;
        for (let n = 0; n < 100; n++) {
          const next = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
          if (!next) { now = target; await flush(); return; }
          now = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
        }
        assert.fail('owned timer loop exceeded bound');
      },
    };
    await run(f);
  } finally {
    try { controller?.disposeSolarDelivery(); client?.dispose(); realtimeDelivery.resolve(response({ detail: 'Owned realtime unavailable.' }, 503)); await flush(); await Promise.all(pending); assert.equal(timers.size, 0, 'owned timers retired'); }
    finally { SolarPhysicsClient.prototype.maybeRefresh = saved.realRefresh; globalThis.fetch = saved.fetch; Date.now = saved.now; globalThis.setTimeout = saved.setTimeout; globalThis.clearTimeout = saved.clearTimeout;
      Object.defineProperty(globalThis, 'performance', saved.performance); }
  }
}

for (const [preparedJd, actualJd, expectedCount] of [[OUTSIDE, JD, 2], [JD, OUTSIDE, 1]]) {
  test(`review: prepared admission for ${preparedJd} cannot govern actual epoch ${actualJd}`, async () => {
    await fixture({ controller: false }, async f => {
      await f.refresh();
      const prepared = f.client.epochRangeReadiness(preparedJd);
      await f.client.maybeRefresh(actualJd, false, prepared);
      assert.equal(f.physics.length, expectedCount, 'recompute admission for actual JD/current tuple');
      if (actualJd === JD) assert.equal(f.retained(), JD);
      else assert.equal(f.status().epochRangeBlocked.baseUrl, 'http://owned-a.invalid');
    });
  });
}

for (const useController of [false, true]) test(`review: readiness callback replacement remains owner (controller=${useController})`, async () => {
  await fixture({ controller: useController, holdRealtime: useController }, async f => {
    await f.refresh(); f.state.julianDate = JD; await f.advance(1);
    const body = deferred(); f.setHandler(() => body.promise);
    let hookCalls = 0;
    f.hooks.onBase = () => {
      f.hooks.onBase = null; hookCalls++;
      f.state.julianDate = JD + 1;
      f.start(true);
    };
    f.start(true); await flush();
    assert.equal(hookCalls, 1);
    body.resolve(response(payload(JD + 1))); await flush();
    assert.equal(f.retained(), JD + 1, 'outer caller cannot retire the callback-owned replacement');
    assert.equal(f.physics.length, 2, 'no superseded outer transport');
    assert.equal(f.status().inFlight, false);
    assert.equal(f.status().lastFailure, null);
  });
});

for (const useController of [false, true]) test(`review: readiness callback disposal stays retired (controller=${useController})`, async () => {
  await fixture({ controller: useController, holdRealtime: useController }, async f => {
    await f.refresh(); f.state.julianDate = JD; await f.advance(1);
    const publicationCount = f.publications.length;
    let hookCalls = 0;
    f.hooks.onBase = () => { f.hooks.onBase = null; hookCalls++; f.dispose(); };
    f.start(true); await flush();
    assert.equal(hookCalls, 1);
    assert.equal(f.physics.length, 1);
    assert.equal(f.status().disposed, true);
    assert.equal(f.status().inFlight, false, 'disposal cannot be undone during readiness');
    assert.equal(f.clientCalls.filter(call => call.disposed).length, 0, 'no wrapper client call after disposal');
    assert.equal(f.publications.length, publicationCount, 'no wrapper publication after disposal');
  });
});

test('review: changed-base callback may retire the tuple before outer readiness returns', async () => {
  await fixture({ controller: true, holdRealtime: true }, async f => {
    await f.refresh(); f.state.julianDate = JD; await f.advance(1);
    const body = deferred(); f.setHandler(() => body.promise);
    f.hooks.onBase = () => {
      f.hooks.onBase = null;
      f.setBase('http://owned-b.invalid');
      f.state.julianDate = JD + 1;
      f.start(true);
    };
    let outerError;
    try { f.start(true); } catch (error) { outerError = error; }
    body.resolve(response(payload(JD + 1))); await flush();
    assert.equal(outerError, undefined, 'tuple disappearance cannot throw during readiness');
    assert.equal(f.physics.length, 2, 'only the changed-base replacement is dispatched');
    assert.equal(new URL(f.physics[1].url).origin, 'http://owned-b.invalid');
    assert.equal(f.retained(), JD + 1);
    assert.equal(f.status().inFlight, false);
    assert.equal(f.status().epochRangeBlocked, null);
  });
});
