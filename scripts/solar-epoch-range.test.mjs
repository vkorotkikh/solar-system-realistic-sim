// FE-EPOCH-RANGE: authoritative backend interval admission and truthful local status.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// Actual client/controller/status; owned transport/timers, no provider or science claim.
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
async function fixture({ controller: useController = true, jd = OUTSIDE } = {}, run) {
  const saved = { fetch: globalThis.fetch, now: Date.now, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
    performance: Object.getOwnPropertyDescriptor(globalThis, 'performance') };
  let now = Date.UTC(2026, 9, 24), timerId = 0, base = 'http://owned-a.invalid', client, controller;
  const timers = new Map(), physics = [], realtime = [], publications = [], announcements = [], pending = [];
  const state = { julianDate: jd, paused: true, timeScaleDaysPerSec: 120, timeScaleDirty: false };
  const announcer = new SolarDataAnnouncer({ textContent: '' });
  let handler = request => request.jd < RANGE.min_jd_tdb || request.jd > RANGE.max_jd_tdb ? rangeError() : response(payload(request.jd));
  Date.now = () => now;
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
  globalThis.setTimeout = (fn, ms) => { const id = ++timerId; timers.set(id, { fn, at: now + Number(ms) }); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  globalThis.fetch = (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/solar/realtime')) { realtime.push(String(input)); return Promise.resolve(response({ detail: 'Owned realtime unavailable.' }, 503)); }
    assert(url.pathname.endsWith('/solar/physics'), 'no health/provider/unexpected request in this fixture');
    const request = { url: String(input), jd: Number(url.searchParams.get('jd_tdb')), signal: init.signal };
    physics.push(request);
    try { return Promise.resolve(handler(request, physics.length - 1)); } catch (error) { return Promise.reject(error); }
  };
  try {
    if (useController) controller = createSunController({
      camera: {}, simState: state, backendBaseUrl: () => base,
      configureLoadedTexture: () => assert.fail('no eligible observation in fixture'),
      observationTextureLoader: { load: () => assert.fail('no texture acquisition in fixture') },
      getSunRadiusAu: () => 0.01, isMagneticFieldEnabled: () => false,
      onSolarDataStatus: status => { publications.push(structuredClone(status)); if (announcer.observe(status)) announcements.push(structuredClone(status)); },
    });
    else client = new SolarPhysicsClient({ baseUrl: () => base });
    const f = {
      state, physics, realtime, publications, announcements,
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
    try { controller?.disposeSolarDelivery(); client?.dispose(); await flush(); await Promise.all(pending); assert.equal(timers.size, 0, 'owned timers retired'); }
    finally { globalThis.fetch = saved.fetch; Date.now = saved.now; globalThis.setTimeout = saved.setTimeout; globalThis.clearTimeout = saved.clearTimeout;
      Object.defineProperty(globalThis, 'performance', saved.performance); }
  }
}

test('contract: one discovery suppresses identical and advancing unsupported epochs without new attempt metrics', async () => {
  await fixture({}, async f => {
    await f.refresh(); const metrics = attemptMetrics(f.status());
    assert.equal(f.physics.length, 1); assert.equal(metrics.lastFailure.httpStatus, 400);
    for (const jd of [OUTSIDE, OUTSIDE + 500, RANGE.min_jd_tdb - 1]) { f.state.julianDate = jd; await f.advance(30000); await f.refresh(); }
    assert.equal(f.physics.length, 1, 'learned bounds suppress all subsequent outside physics requests');
    assert.deepEqual(attemptMetrics(f.status()), metrics);
    assert(f.realtime.length > 1, 'physics suppression does not stop separate realtime cadence');
  });
});

for (const useController of [false, true]) test(`contract: nonforced supported reentry bypasses both cadence gates (controller=${useController})`, async () => {
  await fixture({ controller: useController }, async f => {
    await f.refresh(); f.state.julianDate = JD; await f.advance(1); await f.refresh();
    assert.equal(f.physics.length, 2, 'supported reentry reaches transport before30s');
    assert.equal(f.retained(), JD); assert.equal(f.status().lastFailure, null);
    assert.equal(f.status().epochRangeBlocked ?? null, null);
  });
});

test('contract: a failed supported recovery consumes its bypass and retains ordinary503 backoff', async () => {
  await fixture({}, async f => {
    await f.refresh(); f.setHandler(() => response({ detail: { code: 'solar_compute_saturated', retryable: true } }, 503));
    f.state.julianDate = JD; await f.advance(1); await f.refresh();
    assert.equal(f.physics.length, 2); assert.equal(f.status().lastFailure.httpStatus, 503);
    await f.refresh(); await f.advance(29999); await f.refresh(); assert.equal(f.physics.length, 2);
    await f.advance(1); await f.refresh(); assert.equal(f.physics.length, 3);
  });
});

test('contract: later outside admission is explicit stale state, with one immediate announcement and no fakeHTTP', async () => {
  await fixture({}, async f => {
    await f.refresh(); f.state.julianDate = JD; await f.advance(1); await f.refresh(true);
    assert.equal(f.retained(), JD); assert.equal(f.publications.at(-1).state, 'backend');
    const metrics = attemptMetrics(f.status()), count = f.physics.length, announcements = f.announcements.length;
    f.state.julianDate = OUTSIDE; await f.advance(1); await f.refresh();
    assert.equal(f.physics.length, count); assert.deepEqual(attemptMetrics(f.status()), metrics);
    assert.equal(f.retained(), JD); assert.equal(f.publications.at(-1).state, 'stale');
    assert(f.status().epochRangeBlocked, 'local admission has dedicated state');
    assert.equal(f.announcements.length, announcements + 1, 'authoritative local block announces immediately');
    const block = structuredClone(f.status().epochRangeBlocked), publications = f.publications.length;
    for (let i = 0; i < 3; i++) { f.state.julianDate += 200; await f.advance(30000); await f.refresh(); }
    assert.equal(f.physics.length, count); assert.deepEqual(f.status().epochRangeBlocked, block);
    assert.equal(f.publications.length, publications); assert.equal(f.announcements.length, announcements + 1);
    f.state.julianDate = JD + 1; await f.refresh(); assert.equal(f.retained(), JD + 1);
    assert.equal(f.publications.at(-1).state, 'backend');
    f.state.julianDate = OUTSIDE; await f.advance(1); await f.refresh();
    assert.equal(f.announcements.length, announcements + 3, 'recovery and next outside episode each announce once');
  });
});

test('contract: first discovery publishes only one unavailable range announcement and counts its actualHTTP once', async () => {
  await fixture({}, async f => {
    await f.refresh();
    assert.equal(f.physics.length, 1); assert.equal(f.status().consecutiveFailures, 1);
    assert.equal(f.status().lastFailure.httpStatus, 400); assert.equal(f.status().lastFailure.code, 'jd_out_of_range');
    assert.equal(f.publications.at(-1).state, 'error'); assert.equal(f.announcements.length, 1);
    assert(f.status().epochRangeBlocked);
    assert.match(f.announcements[0].announcementKey, /range/);
  });
});

for (const target of ['http://owned-b.invalid', 'http://owned-a.invalid/other-api']) test(`contract: captured backend identity change permits fresh discovery ${target}`, async () => {
  await fixture({}, async f => {
    await f.refresh(); f.setBase(target); f.setHandler(request => response(payload(request.jd)));
    await f.advance(1); await f.refresh();
    assert.equal(f.physics.length, 2); assert(f.physics[1].url.startsWith(target + '/solar/physics?'));
    assert.equal(f.retained(), OUTSIDE); assert.equal(f.status().epochRangeBlocked ?? null, null);
  });
});

test('control: force probes outside and a valid contradictory success permits later nonforced delivery', async () => {
  await fixture({}, async f => {
    await f.refresh(); await f.refresh(true); assert.equal(f.physics.length, 2);
    f.setHandler(request => response(payload(request.jd))); await f.refresh(true);
    assert.equal(f.physics.length, 3); assert.equal(f.retained(), OUTSIDE);
    await f.advance(30000); await f.refresh(); assert.equal(f.physics.length, 4);
  });
});

for (const jd of [RANGE.min_jd_tdb, RANGE.max_jd_tdb]) test(`control: inclusive wire endpoint ${jd} remains accepted`, async () => {
  await fixture({ jd }, async f => { await f.refresh(); assert.equal(f.physics.length, 1); assert.equal(f.retained(), jd); assert.equal(f.status().lastFailure, null); });
});

test('control: raw just-outside JD that rounds inside follows actual8decimal request identity', async () => {
  await fixture({}, async f => {
    await f.refresh(); f.state.julianDate = RANGE.max_jd_tdb + 1e-9;
    await f.advance(30000); await f.refresh();
    assert.equal(f.physics.length, 2); assert.equal(f.physics[1].jd, RANGE.max_jd_tdb); assert.equal(f.status().lastFailure, null);
  });
});

test('contract: raw inside JD that rounds outside is suppressed by actual wire identity', async () => {
  const range = { ...RANGE, max_jd_tdb: RANGE.max_jd_tdb - 3e-9 };
  await fixture({}, async f => {
    f.setHandler(() => rangeError(range)); await f.refresh();
    f.state.julianDate = range.max_jd_tdb - 1e-9;
    assert(f.state.julianDate <= range.max_jd_tdb); assert(Number(f.state.julianDate.toFixed(8)) > range.max_jd_tdb);
    await f.advance(30000); await f.refresh(); assert.equal(f.physics.length, 1);
  });
});

const malformed = [
  ['absent', undefined], ['null', null], ['array', [RANGE.min_jd_tdb, RANGE.max_jd_tdb]],
  ['min-string', { ...RANGE, min_jd_tdb: String(RANGE.min_jd_tdb) }], ['max-string', { ...RANGE, max_jd_tdb: String(RANGE.max_jd_tdb) }],
  ['min-null', { ...RANGE, min_jd_tdb: null }], ['max-bool', { ...RANGE, max_jd_tdb: true }],
  ['min-nan', { ...RANGE, min_jd_tdb: NaN }], ['max-infinity', { ...RANGE, max_jd_tdb: Infinity }],
  ['missing-max', { min_jd_tdb: RANGE.min_jd_tdb }], ['missing-min', { max_jd_tdb: RANGE.max_jd_tdb }],
  ['equal', { min_jd_tdb: JD, max_jd_tdb: JD }], ['reversed', { min_jd_tdb: JD + 1, max_jd_tdb: JD - 1 }],
  ['contradicts-rejected-epoch', { min_jd_tdb: JD - 1000, max_jd_tdb: JD + 1000 }],
];
for (const [name, range] of malformed) test(`control: invalid or contradictory range ${name} retains ordinary retry`, async () => {
  await fixture({}, async f => {
    // Explicit assignment avoids rangeError's default parameter for the absent case.
    f.setHandler(() => response({ detail: { code: 'jd_out_of_range', retryable: false, valid_jd_range: range } }, 400));
    await f.refresh(); await f.refresh(); assert.equal(f.physics.length, 1);
    await f.advance(30000); await f.refresh(); assert.equal(f.physics.length, 2);
    assert.equal(f.status().epochRangeBlocked ?? null, null);
  });
});

for (const [status, code] of [[503, 'jd_out_of_range'], [422, 'jd_out_of_range'], [400, 'unknown_query_parameters']]) test(`control: ${status}/${code} cannot teach an epoch range`, async () => {
  await fixture({}, async f => {
    f.setHandler(() => rangeError(RANGE, status, code)); await f.refresh(); await f.advance(30000); await f.refresh();
    assert.equal(f.physics.length, 2); assert.equal(f.status().epochRangeBlocked ?? null, null);
  });
});

for (const action of ['force', 'dispose', 'timeout']) test(`control: ${action} during error-body delivery cannot publish late range metadata`, async () => {
  await fixture({ controller: false }, async f => {
    const body = deferred();
    f.setHandler((request, index) => index === 0
      ? { ok: false, status: 400, headers: new Headers(), json: () => body.promise }
      : response(payload(request.jd)));
    f.start(true); await flush(); assert.equal(f.status().inFlight, true);
    if (action === 'force') { f.setBase('http://owned-b.invalid'); await f.refresh(true); }
    else if (action === 'dispose') f.dispose();
    else await f.advance(20000);
    await flush(); const settled = structuredClone(f.status());
    body.resolve({ detail: { code: 'jd_out_of_range', valid_jd_range: RANGE, retryable: false } });
    await flush(); assert.deepEqual(f.status(), settled); assert.equal(f.status().epochRangeBlocked ?? null, null);
    if (action !== 'dispose') {
      await f.advance(30000); await f.refresh();
      assert.equal(f.physics.length, action === 'force' ? 3 : 2);
      assert.equal(f.retained(), OUTSIDE);
    } else { await f.refresh(true); assert.equal(f.physics.length, 1); }
  });
});

test('control: ordinary failure announcement still requires two distinct attempts', async () => {
  await fixture({ jd: JD }, async f => {
    await f.refresh(); const count = f.announcements.length;
    f.setHandler(() => response({ detail: { code: 'solar_compute_saturated' } }, 503));
    await f.advance(1); await f.refresh(true); assert.equal(f.announcements.length, count);
    await f.advance(30000); await f.refresh(); assert.equal(f.announcements.length, count + 1);
  });
});

test('contract: a forced changed valid range enables its newly supported epoch and announces one new range transition', async () => {
  const wider = { min_jd_tdb: RANGE.min_jd_tdb, max_jd_tdb: RANGE.max_jd_tdb + 500 };
  await fixture({}, async f => {
    await f.refresh(); const firstAnnouncements = f.announcements.length;
    f.state.julianDate = wider.max_jd_tdb + 1;
    f.setHandler(() => rangeError(wider)); await f.advance(1); await f.refresh(true);
    assert.equal(f.physics.length, 2);
    assert.equal(f.announcements.length, firstAnnouncements + 1, 'new authoritative tuple is one new transition');
    const block = structuredClone(f.status().epochRangeBlocked);
    await f.advance(1); await f.refresh(true);
    assert.equal(f.physics.length, 3); assert.deepEqual(f.status().epochRangeBlocked, block);
    assert.equal(f.announcements.length, firstAnnouncements + 1, 'same tuple force does not chatter');
    f.setHandler(request => response(payload(request.jd)));
    f.state.julianDate = OUTSIDE; await f.advance(1); await f.refresh();
    assert.equal(f.physics.length, 4); assert.equal(f.retained(), OUTSIDE);
  });
});

test('contract: malformed forced range data cannot erase earlier independently valid bounds', async () => {
  await fixture({}, async f => {
    await f.refresh(); f.setHandler(() => rangeError({ ...RANGE, max_jd_tdb: 'not-a-number' }));
    await f.advance(1); await f.refresh(true); assert.equal(f.physics.length, 2);
    const metrics = attemptMetrics(f.status());
    await f.advance(30000); await f.refresh();
    assert.equal(f.physics.length, 2); assert.deepEqual(attemptMetrics(f.status()), metrics);
  });
});

test('control: unreadable error JSON does not invent capability data or alter ordinary backoff', async () => {
  await fixture({}, async f => {
    f.setHandler(() => ({ ok: false, status: 400, headers: new Headers(), json: async () => { throw new SyntaxError('owned invalid JSON'); } }));
    await f.refresh(); assert.equal(f.status().lastFailure.httpStatus, 400); assert.equal(f.status().lastFailure.code, null);
    assert.equal(f.status().epochRangeBlocked ?? null, null);
    await f.refresh(); assert.equal(f.physics.length, 1);
    await f.advance(30000); await f.refresh(); assert.equal(f.physics.length, 2);
  });
});

test('contract: failed supported reentry starts a new immediate outside announcement episode', async () => {
  await fixture({}, async f => {
    await f.refresh(); const firstAnnouncements = f.announcements.length;
    assert.equal(firstAnnouncements, 1);
    f.setHandler(() => response({ detail: { code: 'solar_compute_saturated', retryable: true } }, 503));
    f.state.julianDate = JD;
    // Wait out existing cadence so this case reaches the announcement boundary on baseline.
    await f.advance(30000); await f.refresh();
    assert.equal(f.physics.length, 2); assert.equal(f.status().lastFailure.httpStatus, 503);
    assert.equal(f.announcements.length, firstAnnouncements, 'one ordinary503 remains debounced');
    const metrics = attemptMetrics(f.status());
    f.state.julianDate = OUTSIDE; await f.advance(1); await f.refresh();
    assert.equal(f.announcements.length, firstAnnouncements + 1, 'new outside episode announces despite pending ordinary503');
    assert.equal(f.physics.length, 2); assert.deepEqual(attemptMetrics(f.status()), metrics);
    assert.equal(f.publications.at(-1).state, 'error');
    assert(f.status().epochRangeBlocked); assert.match(f.announcements.at(-1).announcementKey, /range/);
    const block = structuredClone(f.status().epochRangeBlocked), publications = f.publications.length;
    for (const jd of [OUTSIDE + 100, OUTSIDE + 200, RANGE.min_jd_tdb - 1]) {
      f.state.julianDate = jd; await f.advance(30000); await f.refresh();
    }
    assert.equal(f.physics.length, 2); assert.deepEqual(attemptMetrics(f.status()), metrics);
    assert.deepEqual(f.status().epochRangeBlocked, block); assert.equal(f.publications.length, publications);
    assert.equal(f.announcements.length, firstAnnouncements + 1, 'stable outside episode does not chatter');
  });
});
