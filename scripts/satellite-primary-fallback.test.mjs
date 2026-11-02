// /qa SAT-PRIMARY-LOOKUP — Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// Separate retained primary-lookup regression; not TOOL083 admission or current-main acceptance.
// Actual model/core comparisons protect existing fallback semantics, not independent orbital accuracy.
import { afterEach, expect, test, vi } from 'vitest';
import { PRIMARY_MODELS, createMutableVec3, propagateAroundPrimary } from '../src/frontend/features/planetary/satellitePropagationCore.ts';
import { OrbitalSatelliteSystem } from '../src/frontend/features/planetary/satelliteSystem.ts';

const JD = 2451545;
const validRecord = () => ({ epochJd: JD, aKm: 7000, e: 0, iRad: 0, raanRad: 0,
  argPeriapsisRad: 0, meanAnomalyRad: Math.PI / 2,
  meanMotionRadSec: 2 * Math.PI / 86400, frame: 'equatorial' });

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

function ownerSelection(primaryId, expectedModel) {
  const ownedSources = {};
  const options = { tleSources: ownedSources };
  if (primaryId !== undefined) options.primaryId = primaryId;
  const owner = new OrbitalSatelliteSystem(options);
  try {
    expect(owner.primaryModel).toBe(expectedModel);
    expect(owner.primaryId).toBe(primaryId === undefined ? 'earth' : primaryId);
    expect(owner.tleSources).toBe(ownedSources);
    expect(owner.useInstancing).toBe(primaryId === undefined || primaryId === 'earth');
    expect(owner.useWorkerPropagation).toBe(false);
    expect(owner.worker).toBeNull();
  } finally {
    owner.disableWorker();
    owner.markerGeometry.dispose();
    owner.group.clear();
  }
}

async function workerSelection(primaryId, expectedModel) {
  vi.resetModules();
  const posted = [];
  const transfers = [];
  const scope = { onmessage: null, postMessage(message, options = {}) {
    const buffers = options.transfer ?? [];
    const before = buffers.map(buffer => buffer.byteLength);
    posted.push(structuredClone(message, { transfer: buffers }));
    transfers.push({ before, after: buffers.map(buffer => buffer.byteLength) });
  } };
  vi.stubGlobal('self', scope);
  await import('../src/frontend/features/planetary/satellitePropagationWorker.ts');
  expect(typeof scope.onmessage).toBe('function');
  const record = validRecord();
  const init = { type: 'init', satellites: [record] };
  if (primaryId !== undefined) init.primaryId = primaryId;
  expect(() => scope.onmessage({ data: structuredClone(init) })).not.toThrow();
  expect(posted).toEqual([{ type: 'ready', count: 1 }]);
  expect(() => scope.onmessage({ data: structuredClone({ type: 'snapshot', jd0: JD, jd1: JD + .125, applyJ2: false }) })).not.toThrow();
  expect(posted).toHaveLength(2);
  const message = posted[1];
  expect([message.type, message.count, message.jd0, message.jd1]).toEqual(['snapshot', 1, JD, JD + .125]);
  for (const [positions, date] of [[message.positions0, JD], [message.positions1, JD + .125]]) {
    const expected = propagateAroundPrimary(record, date, false, expectedModel, createMutableVec3());
    expect(positions).toBeInstanceOf(Float32Array);
    expect([...positions]).toEqual([expected.x, expected.y, expected.z].map(Math.fround));
    expect([...positions].every(Number.isFinite)).toBe(true);
  }
  expect(message.positions0[2]).not.toBe(0);
  expect(transfers).toEqual([{ before: [], after: [] }, { before: [12, 12], after: [0, 0] }]);
}

for (const primaryId of ['__proto__', 'constructor']) {
  test(`fallback: owner ${primaryId} selects actual Earth model`, () => {
    ownerSelection(primaryId, PRIMARY_MODELS.earth);
  });
  test(`fallback: worker ${primaryId} propagates using actual Earth model`, async () => {
    await workerSelection(primaryId, PRIMARY_MODELS.earth);
  });
}

for (const [label, primaryId, ownerExpected, workerExpected] of [
  ['Earth', 'earth', PRIMARY_MODELS.earth, PRIMARY_MODELS.earth],
  ['Moon', 'moon', PRIMARY_MODELS.moon, PRIMARY_MODELS.moon],
  ['Mars', 'mars', PRIMARY_MODELS.mars, PRIMARY_MODELS.mars],
  // Preserve the existing asymmetry: owner does not lowercase; worker does.
  ['uppercase MARS', 'MARS', PRIMARY_MODELS.earth, PRIMARY_MODELS.mars],
  ['ordinary unknown', 'ordinary-unknown', PRIMARY_MODELS.earth, PRIMARY_MODELS.earth],
  ['omitted', undefined, PRIMARY_MODELS.earth, PRIMARY_MODELS.earth],
]) {
  test(`control: owner ${label} keeps existing selection/defaults`, () => {
    ownerSelection(primaryId, ownerExpected);
  });
  test(`control: worker ${label} keeps existing normalization/positions`, async () => {
    await workerSelection(primaryId, workerExpected);
  });
}
