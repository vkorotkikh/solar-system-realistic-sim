// /qa MOON034 — Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { Matrix4 } from 'three';
import { AU_KM } from '../src/constants.ts';
import { OrbitalSatelliteSystem } from '../src/frontend/features/planetary/satelliteSystem.ts';
import { createMutableVec3, propagateAroundPrimary } from '../src/frontend/features/planetary/satellitePropagationCore.ts';

// MOON034: retained callable owner/worker, not native Worker scheduling or current-page reach.
// Bounded interpolation plus explicit boolean J2 admission; long spans use CPU propagation.
const JD = 0;
const INTERPOLATION_SPAN = 1 / 256; // Fastest fixture orbit is one day.
// Eccentric records sweep faster at periapsis, so their limit is shorter than the circular 1/256 day.
const ECCENTRIC_SPAN = INTERPOLATION_SPAN / 2;
const RADIUS_AU = 7000 / AU_KM;
const circular = { id: 'owned-circle', name: 'Owned circular probe', category: 'synthetic',
  epochJd: JD, aKm: 7000, e: 0, iDeg: 0, ascendingNodeDeg: 0,
  argPeriapsisDeg: 0, meanAnomalyDeg: 0, meanMotionRevDay: 1, frame: 'ecliptic' };
const inclined = { ...circular, id: 'owned-j2', name: 'Owned inclined eccentric probe',
  e: .2, iDeg: 40, ascendingNodeDeg: 20, argPeriapsisDeg: 30, meanAnomalyDeg: 10 };

async function bootWorker() {
  vi.resetModules();
  const posted = [], transfers = [];
  const scope = { onmessage: null, postMessage(message, options = {}) {
    const buffers = options.transfer ?? [];
    const before = buffers.map(buffer => buffer.byteLength);
    posted.push(structuredClone(message, { transfer: buffers }));
    transfers.push({ before, after: buffers.map(buffer => buffer.byteLength) });
  } };
  vi.stubGlobal('self', scope);
  await import('../src/frontend/features/planetary/satellitePropagationWorker.ts');
  assert.equal(typeof scope.onmessage, 'function');
  return { posted, transfers, send(message) {
    const start = posted.length;
    scope.onmessage({ data: structuredClone(message) });
    return posted.slice(start);
  } };
}

async function withOwner(options, inspect) {
  let system, worker, wallMs = 1000;
  let fetchCalls = 0;
  const requests = [];
  try {
    vi.stubGlobal('fetch', () => { fetchCalls++; throw new Error('Provider access is forbidden in this fixture'); });
    vi.spyOn(globalThis.performance, 'now').mockImplementation(() => wallMs);
    const transport = await bootWorker();
    vi.stubGlobal('Worker', class {
      onmessage = null;
      terminated = 0;
      constructor() { worker = this; }
      postMessage(message) { requests.push(structuredClone(message)); }
      terminate() { this.terminated++; }
    });
    system = new OrbitalSatelliteSystem({ primaryId: 'earth', tleSources: {},
      catalogSatellites: [options.record ?? circular], useJ2: options.useJ2 ?? false,
      useInstancing: options.instanced ?? true, useWorkerPropagation: false,
      showOrbits: false, maxOrbitLines: 1, workerLeadSeconds: .45, workerCadenceMs: 120 });
    await system.initialize();
    assert.equal(system.satellites.length, 1);
    system.useWorkerPropagation = true;
    system.initializeWorker();
    assert.ok(worker);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].type, 'init');
    const ready = transport.send(requests[0]);
    assert.deepEqual(ready, [{ type: 'ready', count: 1 }]);
    worker.onmessage({ data: structuredClone(ready[0]) });
    assert.equal(system.workerReady, true);
    const fixture = {
      system, worker, requests, transport,
      setWall: value => { wallMs = value; },
      deliver: message => worker.onmessage({ data: structuredClone(message) }),
      packet(jd0, jd1, ...setting) {
        const request = { type: 'snapshot', jd0, jd1 };
        if (setting.length === 0) request.applyJ2 = system.useJ2;
        else if (setting[0] !== undefined) request.applyJ2 = setting[0];
        const messages = transport.send(request);
        assert.equal(messages.length, 1);
        assert.equal(messages[0].type, 'snapshot');
        assert.deepEqual(transport.transfers.at(-1), { before: [12, 12], after: [0, 0] });
        return messages[0];
      },
    };
    await inspect(fixture);
  } finally {
    if (system) {
      system.disableWorker();
      const geometries = new Set([system.markerGeometry]), materials = new Set();
      system.group.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material) materials.add(material);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      system.group.clear();
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
    assert.equal(fetchCalls, 0, 'No provider call may occur');
    if (worker) assert.equal(worker.terminated, 1, 'Only the owned Worker-shaped transport is retired');
  }
}

function direct(system, jd, applyJ2 = system.useJ2) {
  const p = propagateAroundPrimary(system.satellites[0], jd, applyJ2, system.primaryModel, createMutableVec3());
  return [p.x, p.y, p.z];
}
function state(system) {
  return {
    positions: [...system.currentPositionsAu],
    matrices: system.markerInstancedMesh ? [...system.markerInstancedMesh.instanceMatrix.array] : null,
    version: system.markerInstancedMesh?.instanceMatrix.version ?? null,
    meshes: system.meshByIndex.map(mesh => mesh.position.toArray()),
  };
}
function assertPublished(system, expected) {
  assert.deepEqual([...system.currentPositionsAu], expected.map(Math.fround));
  if (system.markerInstancedMesh) {
    const matrix = new Matrix4();
    system.markerInstancedMesh.getMatrixAt(0, matrix);
    assert.deepEqual(matrix.elements.slice(12, 15), expected.map(Math.fround));
  } else assert.deepEqual(system.meshByIndex[0].position.toArray(), expected);
}
function controlledProvenance(message, value) {
  // Isolate owner admission from the normalized worker echo.
  // Coordinates still come from the actual worker. Separate cases test the actual echo.
  const result = { ...message };
  if (value === undefined) delete result.applyJ2;
  else result.applyJ2 = value;
  return result;
}
function assertCircularCardinal(system, sign = 1) {
  const positions = system.currentPositionsAu;
  // Binary64 trig/Float32 storage guard only, not a physical orbit error policy.
  assert.ok(Math.abs(positions[0]) <= 8 * Number.EPSILON * RADIUS_AU);
  assert.equal(positions[1], Math.fround(sign * RADIUS_AU));
  assert.equal(Math.abs(positions[2]), 0); // Both signs of exact zero are the same orbital plane.
}

// Actual worker handler/structured-clone protocol: preserve existing input coercion.
for (const [label, input, normalized] of [
  ['false', false, false], ['true', true, true], ['truthy string', 'false', true],
  ['numeric zero', 0, false], ['missing', undefined, false],
]) test(`worker echoes its normalized J2 boolean: ${label}`, () => withOwner({ record: inclined }, f => {
  const message = f.packet(JD + .375, JD + .625, input);
  const expected = direct(f.system, JD + .625, normalized);
  assert.deepEqual([...message.positions1], expected.map(Math.fround));
  assert.equal(typeof message.applyJ2, 'boolean');
  assert.equal(message.applyJ2, normalized);
}));

for (const instanced of [true, false]) test(`control direct unready propagation publishes current state: instanced=${instanced}`, () => withOwner({ instanced }, f => {
  f.system.workerReady = false;
  f.system.update(JD + .25);
  assertPublished(f.system, direct(f.system, JD + .25));
  assertCircularCardinal(f.system);
  assert.equal(f.requests.length, 1);
  f.system.useWorkerPropagation = false;
  f.system.update(JD + .75);
  assertPublished(f.system, direct(f.system, JD + .75));
  assertCircularCardinal(f.system, -1);
}));

for (const [label, jd0, jd1, jd, instanced] of [
  ['forward first', JD, JD + INTERPOLATION_SPAN, JD, true],
  ['forward second', JD + .125, JD + .125 + INTERPOLATION_SPAN, JD + .125 + INTERPOLATION_SPAN, false],
  ['reverse first', JD + INTERPOLATION_SPAN, JD, JD + INTERPOLATION_SPAN, false],
  ['reverse second', JD + .125 + INTERPOLATION_SPAN, JD + .125, JD + .125, true],
  ['paused zero span', JD + .125, JD + .125, JD + .125, true],
]) test(`control matching false-J2 exact endpoint is usable: ${label}`, () => withOwner({ instanced }, f => {
  const message = controlledProvenance(f.packet(jd0, jd1), false);
  f.deliver(message);
  assert.equal(f.system.applyWorkerSnapshot(jd), true);
  assertPublished(f.system, [...(jd === jd0 ? message.positions0 : message.positions1)]);
  f.system.workerBusy = true;
  f.system.update(jd);
  assertPublished(f.system, [...(jd === jd0 ? message.positions0 : message.positions1)]);
}));

for (const [label, jd0, jd1, jd, instanced] of [
  ['oversized forward endpoint', JD, JD + 2, JD, true],
  ['oversized reverse endpoint', JD + 2, JD, JD, false],
  ['forward multi-cycle interior', JD, JD + 2, JD + .25, true],
  ['reverse multi-cycle interior', JD + 2, JD, JD + 1.75, false],
  ['after snapshot window', JD, JD + INTERPOLATION_SPAN, JD + 1, true],
  ['before reverse window', JD + INTERPOLATION_SPAN, JD, JD - .25, false],
  ['stale zero span', JD + .125, JD + .125, JD + .25, true],
]) test(`decline without mutation and use current-JD fallback: ${label}`, () => withOwner({ instanced }, f => {
  f.deliver(controlledProvenance(f.packet(jd0, jd1), false));
  const before = state(f.system);
  const accepted = f.system.applyWorkerSnapshot(jd);
  const afterAdmission = state(f.system);
  f.system.workerBusy = true; // Simulate a silent/in-flight worker without timers or real threads.
  f.system.update(jd);
  assertPublished(f.system, direct(f.system, jd));
  if (label.includes('interior') || label === 'stale zero span') {
    assertCircularCardinal(f.system, label.startsWith('reverse') ? -1 : 1);
  }
  assert.deepEqual(afterAdmission, before, 'A rejected snapshot must publish nothing');
  assert.equal(accepted, false);
  assert.equal(f.requests.length, 1, 'Busy acquisition does not stop direct propagation');
}));

for (const direction of [-1, 1]) for (const instanced of [true, false]) {
  test(`actual worker supports bounded interior interpolation: direction=${direction}, instanced=${instanced}`, () => withOwner({ instanced }, f => {
    const start = JD + .125;
    const end = start + direction * INTERPOLATION_SPAN;
    const message = f.packet(start, end);
    f.deliver(message);
    for (const fraction of [.25, .5, .75]) {
      const jd = start + (end - start) * fraction;
      const expected = [...message.positions0].map((value, axis) =>
        value + (message.positions1[axis] - value) * fraction);
      assert.equal(f.system.applyWorkerSnapshot(jd), true);
      assertPublished(f.system, expected);
      const exact = direct(f.system, jd);
      const errorKm = Math.hypot(...expected.map((value, axis) => (value - exact[axis]) * AU_KM));
      assert.ok(errorKm < .55, `circular interpolation error ${errorKm} km`);
      f.system.workerBusy = true;
      f.system.update(jd);
      assertPublished(f.system, expected);
    }
  }));
}

for (const [label, provenance, current] of [
  ['missing', undefined, false], ['numeric false', 0, false], ['truthy string', 'false', true],
  ['old true setting', true, false], ['old false setting', false, true],
]) test(`matching epoch rejects unproven or mismatched J2: ${label}`, () => withOwner({ record: inclined, useJ2: current }, f => {
  const jd = JD + .5;
  f.deliver(controlledProvenance(f.packet(jd, jd + ECCENTRIC_SPAN, current), provenance));
  const before = state(f.system);
  const accepted = f.system.applyWorkerSnapshot(jd);
  assert.deepEqual(state(f.system), before);
  assert.equal(accepted, false);
  f.system.workerBusy = true;
  f.system.update(jd);
  assertPublished(f.system, direct(f.system, jd));
}));

for (const oldSetting of [false, true]) test(`delayed reply cannot cross a J2 toggle: ${oldSetting} to ${!oldSetting}`, () => withOwner({ record: inclined, useJ2: oldSetting, instanced: !oldSetting }, f => {
  const jd = JD + .5;
  const pending = controlledProvenance(f.packet(jd, jd + ECCENTRIC_SPAN, oldSetting), oldSetting);
  const oldCoordinates = direct(f.system, jd, oldSetting).map(Math.fround);
  const newCoordinates = direct(f.system, jd, !oldSetting).map(Math.fround);
  assert.notDeepEqual(oldCoordinates, newCoordinates, 'The fixture must expose J2 away from its epoch');
  f.system.setJ2Enabled(!oldSetting);
  f.deliver(pending);
  const before = state(f.system);
  const accepted = f.system.applyWorkerSnapshot(jd);
  assert.deepEqual(state(f.system), before);
  assert.equal(accepted, false);
  f.system.workerBusy = true;
  f.system.update(jd);
  assertPublished(f.system, direct(f.system, jd));
  const current = controlledProvenance(f.packet(jd, jd + ECCENTRIC_SPAN, !oldSetting), !oldSetting);
  f.deliver(current);
  assert.equal(f.system.applyWorkerSnapshot(jd), true);
  assertPublished(f.system, [...current.positions0]);
}));

for (const rate of [4, -4]) test(`control forecast is period-bounded and acquisition cadence is preserved at rate ${rate}`, () => withOwner({}, f => {
  f.system.estimatedJdRate = rate;
  f.system.requestWorkerSnapshot(JD);
  assert.equal(f.requests.length, 2);
  assert.deepEqual(f.requests[1], { type: 'snapshot', jd0: JD, jd1: JD + Math.sign(rate) * INTERPOLATION_SPAN, applyJ2: false });
  assert.equal(f.system.workerBusy, true);
  f.system.requestWorkerSnapshot(JD + 5);
  assert.equal(f.requests.length, 2);
  const [message] = f.transport.send(f.requests[1]);
  f.deliver(controlledProvenance(message, false));
  assert.equal(f.system.workerBusy, false);
  f.setWall(1001);
  f.system.requestWorkerSnapshot(JD + 5);
  assert.equal(f.requests.length, 2, 'Cadence remains in wall-clock milliseconds');
  f.setWall(1121);
  f.system.requestWorkerSnapshot(JD + 5);
  assert.equal(f.requests.length, 3);
  f.system.workerReady = false;
  f.system.workerBusy = false;
  f.setWall(2000);
  f.system.update(JD + 6);
  assert.equal(f.requests.length, 3);
  assertPublished(f.system, direct(f.system, JD + 6));
}));

test('control equal-date receiver contract prefers endpoint0 without blending', () => withOwner({}, f => {
  const jd = JD + .25;
  // Deliberately distinct synthetic payloads isolate receiver preference only.
  // An actual worker evaluates equal dates identically; these are not orbit coordinates.
  const message = controlledProvenance(f.packet(jd, jd), false);
  message.positions0 = new Float32Array([1, 2, 3]);
  message.positions1 = new Float32Array([4, 5, 6]);
  f.deliver(message);
  assert.equal(f.system.applyWorkerSnapshot(jd), true);
  assertPublished(f.system, [1, 2, 3]);
  f.system.workerBusy = true;
  f.system.update(jd);
  assertPublished(f.system, [1, 2, 3]);
}));

for (const field of ['jd0', 'jd1']) test(`control nonfinite ${field} remains rejected without mutation`, () => withOwner({}, f => {
  const message = controlledProvenance(f.packet(JD + .25, JD + .25 + INTERPOLATION_SPAN), false);
  message[field] = NaN; // Receiver admission probe; worker-side finite validation stays separate.
  f.deliver(message);
  const before = state(f.system);
  assert.equal(f.system.applyWorkerSnapshot(JD + .25), false);
  assert.deepEqual(state(f.system), before);
  f.system.workerBusy = true;
  f.system.update(JD + .25);
  assertPublished(f.system, direct(f.system, JD + .25));
  assertCircularCardinal(f.system);
}));

test('control different satellite count remains rejected without mutation', () => withOwner({}, f => {
  const message = controlledProvenance(f.packet(JD + .25, JD + .25 + INTERPOLATION_SPAN), false);
  message.count = 2;
  message.positions0 = new Float32Array([...message.positions0, ...message.positions0]);
  message.positions1 = new Float32Array([...message.positions1, ...message.positions1]);
  f.deliver(message);
  assert.equal(f.system.workerSnapshot.count, 2, 'Exercise owner count admission, not earlier buffer-length rejection');
  const before = state(f.system);
  assert.equal(f.system.applyWorkerSnapshot(JD + .25), false);
  assert.deepEqual(state(f.system), before);
  f.system.workerBusy = true;
  f.system.update(JD + .25);
  assertPublished(f.system, direct(f.system, JD + .25));
  assertCircularCardinal(f.system);
}));
