// /qa SAT-PRIMARY-IDENTITY — Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { OrbitalSatelliteSystem } from '../src/frontend/features/planetary/satelliteSystem.ts';
import { PRIMARY_MODELS, createMutableVec3, propagateAroundPrimary } from '../src/frontend/features/planetary/satellitePropagationCore.ts';

// Composed identity, not a change to independently callable owner/worker normalization.
// Actual owner and handler; owned queued transport, not native Worker scheduling.
const JD = 2451545;
const equatorial = { id: 'owned-transverse', name: 'Owned transverse probe', category: 'synthetic',
  epochJd: JD, aKm: 7000, e: 0, iDeg: 0, ascendingNodeDeg: 0,
  argPeriapsisDeg: 0, meanAnomalyDeg: 90, meanMotionRevDay: 1, frame: 'equatorial' };
const inclined = { ...equatorial, id: 'owned-j2', name: 'Owned inclined eccentric probe',
  e: .2, iDeg: 40, ascendingNodeDeg: 20, argPeriapsisDeg: 30, meanAnomalyDeg: 10,
  frame: 'ecliptic' };

function coordinates(record, jd, applyJ2, model) {
  const p = propagateAroundPrimary(record, jd, applyJ2, model, createMutableVec3());
  return [p.x, p.y, p.z].map(Math.fround);
}

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

async function withOwner({ primaryId, record = equatorial, useJ2 = false }, inspect) {
  let system, worker, fetchCalls = 0;
  const requests = [], pending = [], sources = {};
  try {
    vi.stubGlobal('fetch', () => { fetchCalls++; throw new Error('Provider access is forbidden in this fixture'); });
    vi.spyOn(globalThis.performance, 'now').mockReturnValue(1000);
    const transport = await bootWorker();
    vi.stubGlobal('Worker', class {
      onmessage = null;
      terminated = 0;
      constructor() { worker = this; }
      postMessage(message) {
        const copy = structuredClone(message);
        requests.push(copy);
        pending.push(copy);
      }
      terminate() { this.terminated++; }
    });
    const options = { tleSources: sources, catalogSatellites: [record], useJ2,
      useWorkerPropagation: true, showOrbits: false, maxOrbitLines: 1 };
    if (primaryId !== undefined) options.primaryId = primaryId;
    system = new OrbitalSatelliteSystem(options);
    await system.initialize();
    assert.equal(system.satellites.length, 1);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].type, 'init');
    assert.deepEqual(requests[0].satellites, system.satellites);
    function flush() {
      const messages = [];
      while (pending.length) {
        for (const message of transport.send(pending.shift())) {
          messages.push(message);
          worker.onmessage({ data: structuredClone(message) });
        }
      }
      return messages;
    }
    assert.deepEqual(flush(), [{ type: 'ready', count: 1 }]);
    assert.equal(system.workerReady, true);
    const raw = primaryId ?? 'earth';
    assert.equal(system.primaryId, raw);
    assert.equal(system.status().primaryId, raw);
    assert.equal(system.group.name, `satellite-layer-${raw}`);
    assert.equal(system.useInstancing, raw === 'earth');
    assert.equal(system.tleSources, sources);
    await inspect({ system, requests, transport, flush, init: requests[0] });
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
    assert.equal(fetchCalls, 0);
    if (worker) assert.equal(worker.terminated, 1);
  }
}

function verifyIntegrated(f, modelId, jd0, checkWire = true, distinguishMars = false) {
  const { system } = f;
  assert.equal(system.primaryModel, PRIMARY_MODELS[modelId]);
  const record = system.satellites[0];
  const expected0 = coordinates(record, jd0, system.useJ2, system.primaryModel);
  assert.notEqual(expected0[1], 0, 'Fixture has transverse position');
  if (distinguishMars) {
    assert.notDeepEqual(expected0, coordinates(record, jd0, system.useJ2, PRIMARY_MODELS.mars), 'Fixture must expose the wrong primary');
    if (system.useJ2) assert.notDeepEqual(expected0, coordinates(record, jd0, false, system.primaryModel), 'Away-epoch J2 must be observable');
  }
  system.workerReady = false;
  system.update(jd0);
  assert.deepEqual([...system.currentPositionsAu], expected0, 'Actual direct owner path is the selected model');
  const directPublished = [...system.currentPositionsAu];
  system.workerReady = true;
  system.estimatedJdRate = 1;
  system.requestWorkerSnapshot(jd0);
  assert.equal(f.requests.length, 2);
  const request = f.requests[1];
  assert.equal(request.type, 'snapshot');
  assert.equal(request.applyJ2, system.useJ2);
  const [snapshot] = f.flush();
  assert.equal(snapshot.type, 'snapshot');
  assert.equal(snapshot.applyJ2, system.useJ2);
  assert.deepEqual(f.transport.transfers, [
    { before: [], after: [] }, { before: [12, 12], after: [0, 0] },
  ]);
  system.workerBusy = true;
  system.update(jd0); // Exercise actual publication of the worker-produced endpoint.
  assert.deepEqual([...system.currentPositionsAu], directPublished, 'Worker-enabled owner must retain its already selected model');
  assert.deepEqual([...snapshot.positions0], expected0);
  assert.deepEqual([...snapshot.positions1], coordinates(record, request.jd1, system.useJ2, system.primaryModel));
  if (checkWire) assert.equal(f.init.primaryId, system.primaryModel.id);
  assert.equal(f.requests.length, 2);
}

test('integrated uppercase MARS init identifies the already resolved Earth model', () => withOwner({ primaryId: 'MARS' }, f => {
  assert.equal(f.system.primaryModel, PRIMARY_MODELS.earth);
  assert.equal(f.init.primaryId, 'earth');
}));

test('integrated uppercase MARS preserves equatorial transverse endpoints with J2 disabled', () => withOwner({ primaryId: 'MARS' }, f => {
  verifyIntegrated(f, 'earth', JD + .125, true, true);
}));

test('integrated uppercase MARS preserves inclined eccentric away-epoch J2 endpoints', () => withOwner({ primaryId: 'MARS', record: inclined, useJ2: true }, f => {
  verifyIntegrated(f, 'earth', JD + .5, true, true);
}));

for (const [label, primaryId, modelId, checkWire] of [
  ['Earth', 'earth', 'earth', true], ['Moon', 'moon', 'moon', true], ['Mars', 'mars', 'mars', true],
  // These controls preserve outcomes, not the intentionally changing raw wire spelling.
  ['unknown', 'ordinary-unknown', 'earth', false], ['prototype name', '__proto__', 'earth', false],
  ['constructor name', 'constructor', 'earth', false], ['omitted', undefined, 'earth', true],
]) test(`control integrated ${label} preserves model agreement and raw owner defaults`, () => withOwner({ primaryId, record: inclined, useJ2: true }, f => {
  verifyIntegrated(f, modelId, JD + .5, checkWire);
}));

for (const applyJ2 of [false, true]) test(`control standalone uppercase worker still selects Mars: J2=${applyJ2}`, async () => {
  let fetchCalls = 0;
  try {
    vi.stubGlobal('fetch', () => { fetchCalls++; throw new Error('Provider access is forbidden in this fixture'); });
    const transport = await bootWorker();
    const record = { epochJd: JD, aKm: 7000, e: .2, iRad: .7, raanRad: .2,
      argPeriapsisRad: .3, meanAnomalyRad: .4, meanMotionRadSec: 2 * Math.PI / 86400, frame: 'equatorial' };
    assert.deepEqual(transport.send({ type: 'init', primaryId: 'MARS', satellites: [record] }), [{ type: 'ready', count: 1 }]);
    const [snapshot] = transport.send({ type: 'snapshot', jd0: JD + .5, jd1: JD + .75, applyJ2 });
    for (const [positions, jd] of [[snapshot.positions0, JD + .5], [snapshot.positions1, JD + .75]]) {
      const expected = coordinates(record, jd, applyJ2, PRIMARY_MODELS.mars);
      assert.notDeepEqual(expected, coordinates(record, jd, applyJ2, PRIMARY_MODELS.earth));
      assert.deepEqual([...positions], expected);
    }
    assert.equal(snapshot.applyJ2, applyJ2);
    assert.deepEqual(transport.transfers, [{ before: [], after: [] }, { before: [12, 12], after: [0, 0] }]);
  } finally {
    vi.unstubAllGlobals();
    vi.resetModules();
    assert.equal(fetchCalls, 0);
  }
});
