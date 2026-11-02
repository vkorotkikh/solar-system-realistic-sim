// /qa TOOL083 runtime admission regression, 2026-10-24.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// TOOL083/R0083: actual retained worker admission, not current-main reachability.
// Failure assertions constrain success publication, not a proposed error wire format.
import { afterEach, expect, test, vi } from 'vitest';
import { AU_KM } from '../src/constants.ts';
import { PRIMARY_MODELS, createMutableVec3, propagateAroundPrimary } from '../src/frontend/features/planetary/satellitePropagationCore.ts';
import { OrbitalSatelliteSystem } from '../src/frontend/features/planetary/satelliteSystem.ts';

const JD = 2451545;
const sat = () => ({ epochJd: JD, aKm: 7000, e: 0, iRad: 0, raanRad: 0,
  argPeriapsisRad: 0, meanAnomalyRad: 0, meanMotionRadSec: 2 * Math.PI / 86400, frame: 'ecliptic' });

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

async function boot() {
  vi.resetModules();
  const posted = [];
  const transfers = [];
  const worker = { onmessage: null, postMessage(message, options = {}) {
    const buffers = options.transfer ?? [];
    const lengthsBefore = buffers.map(buffer => buffer.byteLength);
    posted.push(structuredClone(message, { transfer: buffers }));
    transfers.push({ lengthsBefore, lengthsAfter: buffers.map(buffer => buffer.byteLength) });
  } };
  vi.stubGlobal('self', worker);
  await import('../src/frontend/features/planetary/satellitePropagationWorker.ts');
  expect(typeof worker.onmessage).toBe('function');
  return { posted, transfers, send(data) {
    const start = posted.length;
    let error = null;
    try { worker.onmessage({ data: structuredClone(data) }); } catch (caught) { error = caught; }
    return { messages: posted.slice(start), error };
  } };
}

function snapshot(worker, overrides = {}) {
  return worker.send({ type: 'snapshot', jd0: JD, jd1: JD + .25, applyJ2: false, ...overrides });
}

for (const [name, request] of [
  ['missing jd0', { type: 'snapshot', jd1: JD }],
  ['missing jd1', { type: 'snapshot', jd0: JD }],
  ['NaN jd0', { type: 'snapshot', jd0: NaN, jd1: JD }],
  ['infinite jd1', { type: 'snapshot', jd0: JD, jd1: Infinity }],
]) test(`admission: ${name} cannot publish a successful snapshot`, async () => {
  const worker = await boot();
  expect(worker.send({ type: 'init', satellites: [sat()] }).error).toBeNull();
  const result = worker.send(request);
  expect(result.messages.filter(message => message.type === 'snapshot')).toEqual([]);
});

for (const [name, record] of [
  ['null record', null],
  ['empty record', {}],
  ['missing semimajor axis', (({ aKm, ...rest }) => rest)(sat())],
  ['nonfinite epoch', { ...sat(), epochJd: NaN }],
]) test(`admission: ${name} cannot be acknowledged ready`, async () => {
  const worker = await boot();
  const result = worker.send({ type: 'init', satellites: [record] });
  expect(result.messages.filter(message => message.type === 'ready')).toEqual([]);
});

test('control: circular numeric snapshot has independent epoch/quarter-orbit coordinates', async () => {
  const worker = await boot();
  const init = worker.send({ type: 'init', primaryId: 'earth', satellites: [sat()] });
  expect(init).toEqual({ error: null, messages: [{ type: 'ready', count: 1 }] });
  const result = snapshot(worker);
  expect(result.error).toBeNull();
  const [message] = result.messages;
  expect(message.type).toBe('snapshot'); expect(message.count).toBe(1);
  expect([message.jd0, message.jd1]).toEqual([JD, JD + .25]);
  expect(message.positions0).toBeInstanceOf(Float32Array);
  expect([...message.positions0]).toEqual([Math.fround(7000 / AU_KM), 0, 0]);
  expect(Math.abs(message.positions1[0])).toBeLessThan(1e-18);
  expect(message.positions1[1]).toBe(Math.fround(7000 / AU_KM));
  expect(message.positions1[2]).toBe(0);
});

test('control: deliberately empty init remains ready with empty transferred buffers', async () => {
  const worker = await boot();
  expect(worker.send({ type: 'init', satellites: [] }).messages).toEqual([{ type: 'ready', count: 0 }]);
  const result = snapshot(worker);
  expect(result.error).toBeNull(); expect(result.messages[0].count).toBe(0);
  expect(result.messages[0].positions0.length).toBe(0);
  expect(result.messages[0].positions1.length).toBe(0);
});

test('control: current pre-init snapshot uses the default empty state', async () => {
  const worker = await boot();
  const result = snapshot(worker);
  expect(result.error).toBeNull(); expect(result.messages[0].count).toBe(0);
});

test('control: unknown message kinds and primitive envelopes are ignored', async () => {
  const worker = await boot();
  for (const value of [null, undefined, false, 12, 'snapshot', {}, { type: 'other' }]) {
    expect(worker.send(value)).toEqual({ messages: [], error: null });
  }
});

test('control: existing primary case normalization and unknown-primary Earth fallback', async () => {
  const worker = await boot();
  const record = { ...sat(), frame: 'equatorial', meanAnomalyRad: Math.PI / 2 };
  for (const [primaryId, expected] of [['MARS', 'mars'], ['unrecognized', 'earth']]) {
    expect(worker.send({ type: 'init', primaryId, satellites: [record] }).error).toBeNull();
    const result = snapshot(worker);
    const position = propagateAroundPrimary(record, JD, false, PRIMARY_MODELS[expected], createMutableVec3());
    expect([...result.messages[0].positions0]).toEqual([position.x, position.y, position.z].map(Math.fround));
  }
});

test('control: boolean J2 branch preserves actual core arithmetic', async () => {
  const worker = await boot();
  const record = { ...sat(), e: .02, iRad: .4, frame: 'equatorial' };
  worker.send({ type: 'init', primaryId: 'earth', satellites: [record] });
  const result = snapshot(worker, { applyJ2: true });
  const position = propagateAroundPrimary(record, JD + .25, true, PRIMARY_MODELS.earth, createMutableVec3());
  expect(result.error).toBeNull();
  expect([...result.messages[0].positions1]).toEqual([position.x, position.y, position.z].map(Math.fround));
  expect([...result.messages[0].positions1].every(Number.isFinite)).toBe(true);
});

test('control: inbound ownership and both transferable buffers are preserved', async () => {
  const worker = await boot();
  const record = sat();
  worker.send({ type: 'init', satellites: [record] });
  record.aKm = 9000;
  const result = snapshot(worker);
  expect(result.messages[0].positions0[0]).toBe(Math.fround(7000 / AU_KM));
  expect(worker.transfers.at(-1)).toEqual({ lengthsBefore: [12, 12], lengthsAfter: [0, 0] });
});

test('control: actual retained receiver declines a snapshot with nonfinite dates', async () => {
  const instances = [];
  vi.stubGlobal('Worker', class { constructor() { instances.push(this); } postMessage() {} terminate() {} });
  const system = new OrbitalSatelliteSystem({ primaryId: 'mars', useWorkerPropagation: true, tleSources: {} });
  try {
    system.satellites = [sat()]; system.currentPositionsAu = new Float32Array(3);
    system.initializeWorker();
    instances[0].onmessage({ data: { type: 'snapshot', jd0: NaN, jd1: JD, count: 1,
      positions0: new Float32Array([NaN, NaN, NaN]), positions1: new Float32Array([NaN, NaN, NaN]) } });
    expect(system.applyWorkerSnapshot(JD)).toBe(false);
    expect([...system.currentPositionsAu]).toEqual([0, 0, 0]);
  } finally { system.disableWorker(); system.markerGeometry.dispose(); system.group.clear(); }
});

export { boot, sat, snapshot, JD };

// Append-only selected admission contract. The entire original 16-case file above is immutable.
// This is a runtime shape/finite-number boundary, not an orbital-validity or current-main claim.
const INVALID_WORKER_MESSAGE = 'Invalid satellite worker message.';
const NUMERIC_SATELLITE_FIELDS = [
  'epochJd', 'aKm', 'e', 'iRad', 'raanRad', 'argPeriapsisRad', 'meanAnomalyRad', 'meanMotionRadSec',
];

function expectInvalidMessage(result) {
  expect(result.error).toBeInstanceOf(TypeError);
  expect(result.error.message).toBe(INVALID_WORKER_MESSAGE);
  expect(result.messages).toEqual([]);
}

for (const field of NUMERIC_SATELLITE_FIELDS) {
  for (const [kind, value] of [['missing', undefined], ['NaN', NaN], ['infinity', Infinity], ['numeric string', '1']]) {
    test(`selected contract: rejects ${kind} in consumed ${field} with fixed TypeError`, async () => {
      const worker = await boot();
      const record = { ...sat(), [field]: value };
      if (kind === 'missing') delete record[field];
      expectInvalidMessage(worker.send({ type: 'init', satellites: [record] }));
    });
  }
}

for (const [name, request] of [
  ['missing jd0', { type: 'snapshot', jd1: JD }],
  ['missing jd1', { type: 'snapshot', jd0: JD }],
  ['NaN jd0', { type: 'snapshot', jd0: NaN, jd1: JD }],
  ['infinite jd1', { type: 'snapshot', jd0: JD, jd1: Infinity }],
]) test(`selected contract: ${name} snapshot reports fixed TypeError without publication`, async () => {
  const worker = await boot();
  worker.send({ type: 'init', satellites: [sat()] });
  expectInvalidMessage(worker.send(request));
});

for (const [name, record] of [['null', null], ['array', []], ['boolean', false], ['string', 'satellite']]) {
  test(`selected contract: ${name} satellite entry reports fixed TypeError`, async () => {
    const worker = await boot();
    expectInvalidMessage(worker.send({ type: 'init', satellites: [record] }));
  });
}

for (const position of ['first', 'later']) {
  test(`selected contract: rejected ${position} re-init leaves both prior primary and records intact`, async () => {
    const worker = await boot();
    const prior = { ...sat(), frame: 'equatorial', meanAnomalyRad: Math.PI / 2 };
    expect(worker.send({ type: 'init', primaryId: 'earth', satellites: [prior] }))
      .toEqual({ error: null, messages: [{ type: 'ready', count: 1 }] });
    const before = snapshot(worker);
    expect(before.error).toBeNull();
    expect(before.messages[0].positions0[2]).not.toBe(0);
    const bad = { ...sat(), epochJd: NaN };
    const changed = { ...sat(), aKm: 9000, frame: 'equatorial' };
    const records = position === 'first' ? [bad] : [changed, bad];
    const rejected = worker.send({ type: 'init', primaryId: 'mars', satellites: records });
    const after = snapshot(worker);
    // State assertion distinguishes atomic admission from a late throw after assignment.
    expect(after).toEqual(before);
    expectInvalidMessage(rejected);
  });
}

for (const [name, jd0, jd1, expected0, expected1] of [
  ['numeric strings', String(JD), String(JD + .25), JD, JD + .25],
  ['booleans', false, true, 0, 1],
  ['null dates', null, null, 0, 0],
  ['empty strings', '', '', 0, 0],
]) test(`supplement control: retains finite Number conversion for ${name}`, async () => {
  const worker = await boot();
  worker.send({ type: 'init', satellites: [sat()] });
  const result = snapshot(worker, { jd0, jd1 });
  expect(result.error).toBeNull();
  expect(result.messages).toHaveLength(1);
  expect([result.messages[0].jd0, result.messages[0].jd1]).toEqual([expected0, expected1]);
  expect([...result.messages[0].positions0, ...result.messages[0].positions1].every(Number.isFinite)).toBe(true);
});

for (const [name, value] of [['missing', undefined], ['null', null], ['non-array object', { record: sat() }]]) {
  test(`supplement control: ${name} init satellite list retains empty fallback`, async () => {
    const worker = await boot();
    expect(worker.send({ type: 'init', satellites: [sat()] }).error).toBeNull();
    expect(worker.send({ type: 'init', satellites: value }))
      .toEqual({ error: null, messages: [{ type: 'ready', count: 0 }] });
    const result = snapshot(worker);
    expect(result.error).toBeNull();
    expect(result.messages[0].count).toBe(0);
    expect([...result.messages[0].positions0, ...result.messages[0].positions1]).toEqual([]);
  });
}

for (const frame of [undefined, 'unrecognized-frame']) {
  test(`supplement control: ${String(frame)} frame keeps existing equatorial fallback`, async () => {
    const worker = await boot();
    const record = { ...sat(), frame, meanAnomalyRad: Math.PI / 2 };
    worker.send({ type: 'init', primaryId: 'mars', satellites: [record] });
    const result = snapshot(worker);
    const expected = propagateAroundPrimary(record, JD, false, PRIMARY_MODELS.mars, createMutableVec3());
    expect(result.error).toBeNull();
    expect([...result.messages[0].positions0]).toEqual([expected.x, expected.y, expected.z].map(Math.fround));
  });
}

test('supplement control: truthy string J2 retains Boolean coercion', async () => {
  const worker = await boot();
  worker.send({ type: 'init', satellites: [{ ...sat(), e: .02, iRad: .4 }] });
  const numeric = snapshot(worker, { applyJ2: true });
  const string = snapshot(worker, { applyJ2: 'false' });
  expect(string).toEqual(numeric);
  expect(string.error).toBeNull();
});

test('supplement control: admission does not invent finite physical range bounds', async () => {
  const worker = await boot();
  // Acknowledgement only: this fixture makes no physical-validity or finite-output claim.
  const record = { epochJd: -1, aKm: 0, e: 2, iRad: -9, raanRad: 100,
    argPeriapsisRad: -100, meanAnomalyRad: 1000, meanMotionRadSec: 0, frame: 'opaque' };
  expect(worker.send({ type: 'init', satellites: [record] }))
    .toEqual({ error: null, messages: [{ type: 'ready', count: 1 }] });
});

test('supplement control: valid empty re-init replaces previous records', async () => {
  const worker = await boot();
  worker.send({ type: 'init', satellites: [sat()] });
  expect(worker.send({ type: 'init', primaryId: 'MARS', satellites: [] }))
    .toEqual({ error: null, messages: [{ type: 'ready', count: 0 }] });
  const result = snapshot(worker);
  expect(result.error).toBeNull();
  expect(result.messages[0].count).toBe(0);
});

// Append-only review supplement: conversion failures and sparse cloned arrays are malformed recognized messages.
for (const dateField of ['jd0', 'jd1']) {
  test(`selected contract supplement: cloneable ${dateField} conversion failure has fixed TypeError`, async () => {
    const worker = await boot();
    worker.send({ type: 'init', satellites: [sat()] });
    const unconvertible = structuredClone({ valueOf: 0, toString: 0 });
    expect(() => Number(unconvertible)).toThrow(TypeError);
    expectInvalidMessage(snapshot(worker, { [dateField]: unconvertible }));
  });
}

for (const position of ['first', 'later']) {
  test(`selected contract supplement: sparse ${position} init hole rejects before either state assignment`, async () => {
    const worker = await boot();
    const prior = { ...sat(), frame: 'equatorial', meanAnomalyRad: Math.PI / 2 };
    expect(worker.send({ type: 'init', primaryId: 'earth', satellites: [prior] }))
      .toEqual({ error: null, messages: [{ type: 'ready', count: 1 }] });
    const before = snapshot(worker);
    expect(before.error).toBeNull();
    expect(before.messages[0].positions0[2]).not.toBe(0);
    const records = position === 'first' ? new Array(1) : [{ ...sat(), aKm: 9000, frame: 'equatorial' }];
    if (position === 'later') records.length = 2;
    const holeIndex = position === 'first' ? 0 : 1;
    expect(holeIndex in structuredClone(records)).toBe(false);
    const rejected = worker.send({ type: 'init', primaryId: 'mars', satellites: records });
    const after = snapshot(worker);
    expect(after).toEqual(before);
    expectInvalidMessage(rejected);
  });
}
