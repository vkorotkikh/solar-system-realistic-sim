// PLAN-008: full-five Pluto physical centre; internal consistency, not absolute accuracy.
// Immutable21 candidate c806752b, promoted with portable imports/ROOT only.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, vi } from 'vitest';
import { Vector3 } from 'three';
import { createSolarSystemCatalog, type CatalogBody, type RawMoonRecord, type SolarCatalog } from './catalog';
import { propagateKeplerOrbit, type KeplerOrbit } from './orbitMath';
import { SolarSystemModel } from './solarSystemModel';
import { PLANETS } from '../data/planets';
import { loadMoonEphemerides } from './loadMoonEphemerides';
import type { MoonChebyshevEphemeris } from './moonEphemeris';
import { buildModelWorkerCatalog, buildCatalogIndexContract, type ModelWorkerStateMessage } from '../workers/modelWorkerContract';
import { comparePlanetAtEpoch, heliocentricPositionKm, evaluatePlanetPositions, type PlanetPositionFixture, type PlanetTruthState, type MutableVector3, type PlanetPositionRow } from './planetPositionCheck';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const JD = 2451545;
const AU_KM = 149597870.7;
// Independently transcribed published adopted parameters, not catalog massKg.
// https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/satellites/plu060.cmt
const PLUTO_GM = 869.3261226311508;
const SYSTEM_GM = 975.4308664317557;
const COMPONENTS = [
  ['901', 'Charon', 106.1011388236118],
  ['902', 'Nix', 0.001496176095836919],
  ['903', 'Hydra', 0.002007962473606101],
  ['904', 'Kerberos', 0.0000603845078026937],
  ['905', 'Styx', 0.00004045391585487917],
] as const;
const EPOCHS = [JD, JD + 1.25, JD + 9131.5];
type Triple = [number, number, number];
type PluralOrbit = KeplerOrbit & {
  barycentreCompanions?: readonly { orbit: KeplerOrbit | null; massFraction: number }[];
};
type Callback = (orbit: KeplerOrbit, elapsed: number, p: MutableVector3, v?: MutableVector3 | null) => boolean | void;
// The extra argument is deliberately sent to the existing public entrypoint on RED.
const compare = comparePlanetAtEpoch as unknown as (
  id: string, body: CatalogBody, truth: PlanetTruthState, label: string,
  propagate: Callback, truthTargetId: string,
) => PlanetPositionRow;
const raw = JSON.parse(readFileSync(`${ROOT}/src/data/moons.json`, 'utf8')) as RawMoonRecord[];
const truthFixture = JSON.parse(readFileSync(`${ROOT}/scripts/fixtures/planet-positions-horizons.json`, 'utf8')) as PlanetPositionFixture;
const body = (catalog: SolarCatalog, id: string) => {
  const result = catalog.bodies.find(item => item.id === id);
  assert(result, `catalog contains ${id}`);
  return result;
};
const circle = (patch: Partial<PluralOrbit> = {}): PluralOrbit => ({
  epochJd: JD, aAu: 8, e: 0, periodDays: 256, iDeg: 0,
  ascendingNodeDeg: 0, argPeriapsisDeg: 0, meanAnomalyDeg: 0, ...patch,
});
const state = (orbit: KeplerOrbit, jd: number) => {
  const p = new Vector3(), v = new Vector3();
  assert.equal(propagateKeplerOrbit(orbit, jd - orbit.epochJd, p, v), true);
  return { p, v };
};
function near(actual: readonly number[], expected: readonly number[], label: string): void {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i += 1) {
    const budget = 256 * Number.EPSILON * Math.max(1e-12, Math.abs(actual[i]), Math.abs(expected[i]));
    assert(Math.abs(actual[i] - expected[i]) <= budget,
      `${label}[${i}]: ${actual[i]} vs ${expected[i]}, arithmetic budget ${budget}`);
  }
}
function companions(orbit: KeplerOrbit) {
  const result = (orbit as PluralOrbit).barycentreCompanions;
  assert(Array.isArray(result), 'plural correction metadata must be present');
  assert.equal(result.length, 5, 'all five required Pluto moons, not the Charon pair');
  return result;
}
function analytic(orbit: KeplerOrbit, jd: number, P: Triple, Q: Triple) {
  const n = 2 * Math.PI / orbit.periodDays;
  const phase = (orbit.meanAnomalyDeg ?? 0) * Math.PI / 180 + n * (jd - orbit.epochJd);
  return {
    p: P.map((p, i) => orbit.aAu * (p * Math.cos(phase) + Q[i] * Math.sin(phase))) as Triple,
    v: P.map((p, i) => orbit.aAu * n * (-p * Math.sin(phase) + Q[i] * Math.cos(phase))) as Triple,
  };
}
function analyticSystem() {
  // Exaggerated toy minor-moon radii make every tiny sourced weight observable.
  // These are independent circular test states, not physical Pluto predictions.
  const leaves = [
    { orbit: circle({ aAu: 0.25, periodDays: 4 }), P: [1, 0, 0], Q: [0, 1, 0] },
    { orbit: circle({ aAu: 1e4, periodDays: 8, iDeg: 90, meanAnomalyDeg: 90 }), P: [1, 0, 0], Q: [0, 0, 1] },
    { orbit: circle({ aAu: 2e4, periodDays: 16, iDeg: 90, ascendingNodeDeg: 90, meanAnomalyDeg: 180 }), P: [0, 1, 0], Q: [0, 0, 1] },
    { orbit: circle({ aAu: 3e4, periodDays: 32, ascendingNodeDeg: 90, meanAnomalyDeg: 270 }), P: [0, 1, 0], Q: [-1, 0, 0] },
    { orbit: circle({ aAu: 4e4, periodDays: 64, iDeg: 180, meanAnomalyDeg: 45 }), P: [1, 0, 0], Q: [0, -1, 0] },
  ] as { orbit: PluralOrbit; P: Triple; Q: Triple }[];
  const orbit = circle({ barycentreCompanions: leaves.map((leaf, i) => ({
    orbit: leaf.orbit, massFraction: COMPONENTS[i][2] / SYSTEM_GM,
  })) });
  return { orbit, leaves };
}
function analyticSystemState(system: ReturnType<typeof analyticSystem>, jd: number) {
  const result = analytic(system.orbit, jd, [1, 0, 0], [0, 1, 0]);
  system.leaves.forEach((leaf, i) => {
    const relative = analytic(leaf.orbit, jd, leaf.P, leaf.Q);
    const k = COMPONENTS[i][2] / SYSTEM_GM;
    for (let axis = 0; axis < 3; axis += 1) {
      result.p[axis] -= k * relative.p[axis];
      result.v[axis] -= k * relative.v[axis];
    }
  });
  return result;
}
function unchangedOnFailure(orbit: KeplerOrbit, elapsed: number, error?: new (...args: any[]) => Error) {
  const p = new Vector3(7, 8, 9), v = new Vector3(1, 2, 3);
  if (error) assert.throws(() => propagateKeplerOrbit(orbit, elapsed, p, v), error);
  else assert.equal(propagateKeplerOrbit(orbit, elapsed, p, v), false);
  assert.deepEqual(p.toArray(), [7, 8, 9]);
  assert.deepEqual(v.toArray(), [1, 2, 3]);
}
function fitted(): MoonChebyshevEphemeris {
  return {
    kind: 'horizons-chebyshev-elements-v1', coverageStartJd: 100, coverageEndJd: 102,
    meanLongitudeBaseDeg: 0, meanLongitudeRateDegPerDay: 90, sourceStepDays: 0.25,
    segments: [{ startJd: 100, endJd: 102,
      coefficients: [[AU_KM], [0], [0], [1], [0.01], [0], [0], [0], [90]] }],
    provenance: { source: 'test', sourceEphemeris: 'test', targetId: '901', centerId: '999',
      frame: 'ECLIPJ2000', timeScale: 'TDB', generatedAt: '2000-01-01T00:00:00Z', generator: 'test', query: 'test' },
  };
}
async function catalogFromRows(rows: readonly RawMoonRecord[]) {
  vi.resetModules();
  vi.doMock('../data/moons.json', () => ({ default: rows }));
  try {
    const imported = await import('./catalog');
    return imported.createSolarSystemCatalog({ moonsVisible: false });
  } finally {
    vi.doUnmock('../data/moons.json');
    vi.resetModules();
  }
}

test('five independently oriented circular states subtract all published weights in position and velocity', () => {
  const system = analyticSystem();
  for (const offset of [0.375, 1.25, 3.125]) {
    const expected = analyticSystemState(system, JD + offset);
    const actual = state(system.orbit, JD + offset);
    near(actual.p.toArray(), expected.p, 'physical position');
    near(actual.v.toArray(), expected.v, 'physical velocity');
    const pOnly = new Vector3();
    assert.equal(propagateKeplerOrbit(system.orbit, offset, pOnly), true);
    assert.deepEqual(pOnly.toArray(), actual.p.toArray());
  }
});

test('each companion uses absolute epoch alignment, including positive and negative elapsed time', () => {
  const system = analyticSystem();
  system.orbit.epochJd = JD + 8;
  system.leaves.forEach((leaf, i) => { leaf.orbit.epochJd = JD - 3 * i; });
  for (const jd of [JD - 2.375, JD + 9.125]) {
    const expected = analyticSystemState(system, jd), actual = state(system.orbit, jd);
    near(actual.p.toArray(), expected.p, 'epoch-aligned position');
    near(actual.v.toArray(), expected.v, 'epoch-aligned velocity');
  }
});

test('empty and nullable required slots report false atomically instead of bare-parent success', () => {
  unchangedOnFailure(circle({ barycentreCompanions: [] }), 1);
  for (const index of [0, 4]) {
    const system = analyticSystem();
    system.orbit.barycentreCompanions![index].orbit = null;
    unchangedOnFailure(system.orbit, 1);
  }
});

test('required parent or late companion ephemeris failures leave both caller outputs unchanged', () => {
  const missingParent = analyticSystem();
  missingParent.orbit.ephemerisRequired = true;
  unchangedOnFailure(missingParent.orbit, 0);
  const missingLeaf = analyticSystem();
  missingLeaf.leaves[4].orbit.ephemerisRequired = true;
  unchangedOnFailure(missingLeaf.orbit, 0);
  const outside = analyticSystem();
  Object.assign(outside.leaves[4].orbit, { epochJd: 100, ephemeris: fitted(), ephemerisRequired: true });
  unchangedOnFailure(outside.orbit, 103 - outside.orbit.epochJd);
});

test('late derivative failure is atomic while position-only propagation remains usable', () => {
  const system = analyticSystem();
  system.orbit.epochJd = 100;
  system.leaves.forEach(leaf => { leaf.orbit.epochJd = 100; });
  const ephemeris = fitted();
  ephemeris.segments[0].endJd = 101;
  Object.assign(system.leaves[4].orbit, { epochJd: 100, ephemeris, ephemerisRequired: true });
  const jd = 100.99995;
  unchangedOnFailure(system.orbit, jd - system.orbit.epochJd);
  const p = new Vector3(7, 8, 9);
  assert.equal(propagateKeplerOrbit(system.orbit, jd - system.orbit.epochJd, p, null), true);
  const parent = analytic(system.orbit, jd, [1, 0, 0], [0, 1, 0]).p;
  for (let i = 0; i < 5; i += 1) {
    const relative = new Vector3();
    assert.equal(propagateKeplerOrbit(system.leaves[i].orbit, jd - system.leaves[i].orbit.epochJd, relative, null), true);
    relative.toArray().forEach((value, axis) => { parent[axis] -= COMPONENTS[i][2] / SYSTEM_GM * value; });
  }
  near(p.toArray(), parent, 'position-only despite derivative gap');
});

test('whole metadata validation precedes parent or companion unavailable short circuits', () => {
  const invalidList: unknown[] = [
    null, {}, [undefined], Array(1), [{ orbit: {}, massFraction: 0.1 }],
    [{ orbit: [], massFraction: 0.1 }], [{ orbit: circle(), massFraction: '0.1' }],
    ...[NaN, Infinity, -0.1, 1].map(massFraction => [{ orbit: circle(), massFraction }]),
    [{ orbit: circle(), massFraction: 0.6 }, { orbit: circle(), massFraction: 0.4 }],
    ...['aAu', 'periodDays', 'epochJd'].map(field => [{ orbit: { ...circle(), [field]: undefined }, massFraction: 0.1 }]),
    ...['aAu', 'periodDays', 'epochJd'].map(field => [{ orbit: { ...circle(), [field]: NaN }, massFraction: 0.1 }]),
  ];
  for (const invalid of invalidList) {
    const orbit = circle({ ephemerisRequired: true });
    (orbit as unknown as Record<string, unknown>).barycentreCompanions = invalid;
    unchangedOnFailure(orbit, 0, TypeError);
  }
  for (const first of [null, circle({ ephemerisRequired: true })]) {
    const orbit = circle({ barycentreCompanions: [
      { orbit: first, massFraction: 0.1 }, { orbit: circle(), massFraction: NaN },
    ] });
    unchangedOnFailure(orbit, 0, TypeError);
  }
  let samplingReads = 0;
  const first = circle(), parent = circle({ barycentreCompanions: [
    { orbit: first, massFraction: 0.1 }, { orbit: circle(), massFraction: NaN },
  ] });
  for (const orbit of [parent, first]) Object.defineProperty(orbit, 'ephemeris', {
    get() { samplingReads += 1; return undefined; },
  });
  unchangedOnFailure(parent, 0, TypeError);
  assert.equal(samplingReads, 0, 'reject the complete invalid list before sampling parent or first leaf');
});

test('singular conflict, nested composite and self-reference reject without scratch recursion or output writes', () => {
  const conflict = analyticSystem();
  conflict.orbit.barycentreCompanion = { orbit: circle(), massFraction: 0.1 };
  unchangedOnFailure(conflict.orbit, 1, TypeError);
  const nestedSingle = analyticSystem();
  nestedSingle.leaves[4].orbit.barycentreCompanion = { orbit: circle(), massFraction: 0.1 };
  unchangedOnFailure(nestedSingle.orbit, 1, TypeError);
  const nestedPlural = analyticSystem();
  nestedPlural.leaves[4].orbit.barycentreCompanions = [];
  unchangedOnFailure(nestedPlural.orbit, 1, TypeError);
  const self = circle();
  self.barycentreCompanions = [{ orbit: self, massFraction: 0.1 }];
  unchangedOnFailure(self, 1, TypeError);
});

test('zero weight is legal but does not make its required state optional', () => {
  const leaf = circle({ aAu: 0.1 });
  const orbit = circle({ barycentreCompanions: [{ orbit: leaf, massFraction: 0 }] });
  const actual = state(orbit, JD + 0.25), bare = state(circle(), JD + 0.25);
  assert.deepEqual(actual.p.toArray(), bare.p.toArray());
  assert.deepEqual(actual.v.toArray(), bare.v.toArray());
  leaf.ephemerisRequired = true;
  unchangedOnFailure(orbit, 0.25);
});

test('leaf range exhaustion returns false and programmer exceptions retain their kind without partial outputs', () => {
  const exhausted = analyticSystem();
  Object.assign(exhausted.leaves[4].orbit, { aAu: 1, secularRates: { aAuPerCentury: -2 } });
  unchangedOnFailure(exhausted.orbit, 36525);
  const malformed = analyticSystem();
  malformed.leaves[4].orbit.e = NaN;
  malformed.leaves[4].orbit.sourceFrameBasis = {
    x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 },
  };
  unchangedOnFailure(malformed.orbit, 0, RangeError);
});

test('absent plural metadata preserves ordinary propagation and the exact existing Earth single-companion arithmetic', () => {
  const catalog = createSolarSystemCatalog({ moonsVisible: false });
  const earth = body(catalog, 'earth').orbit!;
  assert.equal((earth as PluralOrbit).barycentreCompanions, undefined);
  const moon = body(catalog, 'moon-earth-moon').orbit!;
  assert.equal(earth.barycentreCompanion!.orbit, moon);
  assert.equal(earth.barycentreCompanion!.massFraction, 0.01215058);
  const { barycentreCompanion, ...bare } = earth;
  for (const jd of EPOCHS) {
    const actual = state(earth, jd), bary = state(bare, jd), relative = state(moon, jd);
    for (const field of ['p', 'v'] as const) {
      const expected = bary[field].toArray().map((value, axis) => value - 0.01215058 * relative[field].toArray()[axis]);
      assert.deepEqual(actual[field].toArray(), expected);
    }
    for (const source of PLANETS.filter(item => !['earth', 'pluto'].includes(item.id))) {
      const runtime = body(catalog, source.id).orbit!;
      assert.deepEqual(runtime, source.orbit);
      assert.deepEqual(state(runtime, jd), state(source.orbit, jd));
    }
  }
});

test('actual catalog binds exact component identities and published weights without modifying masses, orbits or visibility semantics', () => {
  const hidden = createSolarSystemCatalog({ moonsVisible: false });
  const visible = createSolarSystemCatalog({ moonsVisible: true });
  const pluto = body(hidden, 'pluto');
  const selected = companions(pluto.orbit!);
  assert.equal(pluto.massKg, 1.303e22);
  assert.equal(pluto.orbit!.barycentreCompanion, undefined);
  const { barycentreCompanions, ...bare } = pluto.orbit as PluralOrbit;
  assert.deepEqual(bare, PLANETS.find(item => item.id === 'pluto')!.orbit);
  COMPONENTS.forEach(([identity, name, gm], index) => {
    assert.equal(raw.filter(row => row.planet === 'Pluto' && row.iauCode === identity).length, 1);
    const moon = body(hidden, `moon-pluto-${name.toLowerCase()}`);
    assert.equal(moon.massKg, null);
    assert.equal(selected[index].orbit, moon.orbit);
    assert.equal(selected[index].massFraction, gm / SYSTEM_GM);
    assert.equal((moon.orbit as PluralOrbit).barycentreCompanions, undefined);
    assert.equal(moon.orbit!.barycentreCompanion, undefined);
  });
  const nonDisplay = (catalog: SolarCatalog) => catalog.bodies.map(({ displayRadiusAu, ...item }) => item);
  assert.deepEqual(nonDisplay(hidden), nonDisplay(visible));
  assert.equal(hidden.bodies.length, 433);
  assert.deepEqual(hidden.jumpBodyIds, visible.jumpBodyIds);
  assert.deepEqual(hidden.plannerBodyIds, visible.plannerBodyIds);
});

test('actual model closes all-five weighted world position and velocity onto the unchanged secular system centre', () => {
  const catalog = createSolarSystemCatalog({ moonsVisible: false });
  const model = new SolarSystemModel(catalog);
  const rawSystemOrbit = PLANETS.find(item => item.id === 'pluto')!.orbit;
  for (const jd of EPOCHS) {
    model.update(jd);
    const physical = model.getState('pluto')!;
    assert.equal(physical.available, true);
    const rawSystem = state(rawSystemOrbit, jd);
    for (const [field, expected] of [['worldPosition', rawSystem.p], ['worldVelocity', rawSystem.v]] as const) {
      const weighted = physical[field].toArray().map(value => PLUTO_GM * value);
      for (const [, name, gm] of COMPONENTS) {
        const moon = model.getState(`moon-pluto-${name.toLowerCase()}`)!;
        assert.equal(moon.available, true);
        moon[field].toArray().forEach((value, axis) => { weighted[axis] += gm * value; });
      }
      near(weighted.map(value => value / SYSTEM_GM), expected.toArray(), field);
    }
    assert(physical.worldPosition.distanceTo(rawSystem.p) * AU_KM > 1000, 'nonzero physical-centre correction, not an accuracy bound');
    for (const [, name] of COMPONENTS) {
      const id = `moon-pluto-${name.toLowerCase()}`, moon = model.getState(id)!;
      const relative = state(body(catalog, id).orbit!, jd);
      assert.deepEqual(moon.relativePosition.toArray(), relative.p.toArray());
      assert.deepEqual(moon.relativeVelocity.toArray(), relative.v.toArray());
      assert.deepEqual(moon.worldPosition.toArray(), physical.worldPosition.clone().add(relative.p).toArray());
      assert.deepEqual(moon.worldVelocity.toArray(), physical.worldVelocity.clone().add(relative.v).toArray());
    }
  }
});

test('default compact worker preserves hidden companions through structured clone and its actual init/tick path', async () => {
  const catalog = createSolarSystemCatalog({ moonsVisible: false });
  const compact = buildModelWorkerCatalog(catalog.bodies);
  assert.equal(compact.bodies.length, 10);
  assert.equal(compact.bodies.some(item => item.parentId === 'pluto'), false);
  companions(compact.bodies.find(item => item.id === 'pluto')!.orbit!);
  const contract = buildCatalogIndexContract(compact);
  const posted: unknown[] = [];
  const worker = { onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage(message: unknown) { posted.push(message); } };
  vi.resetModules();
  vi.stubGlobal('self', worker);
  try {
    await import('../workers/modelWorker');
    worker.onmessage!({ data: structuredClone({ type: 'init', catalog: compact, simStartJd: JD, sequence: 0 }) });
    assert.deepEqual(posted[0], { type: 'ready', bodyCount: 10, schemaVersion: 2 });
    const jd = JD + 1.25;
    worker.onmessage!({ data: structuredClone({ type: 'tick', sequence: 1, simState: { julianDate: jd } }) });
    const message = posted[1] as ModelWorkerStateMessage;
    assert.equal(message.type, 'state'); assert.equal(message.schemaVersion, 2);
    assert.equal(message.tickJd, jd); assert.equal(message.sequence, 1);
    assert.equal(message.bodies.length, 60); assert.deepEqual([...message.availability], Array(10).fill(1));
    const model = new SolarSystemModel(catalog); model.update(jd);
    for (let index = 0; index < compact.bodies.length; index += 1) {
      const item = compact.bodies[index], actual = model.getState(item.id)!;
      assert.equal(catalog.bodies[contract.sourceIndexByIndex[index]].id, item.id);
      assert.deepEqual([...message.bodies.slice(index * 6, index * 6 + 6)], [...actual.worldPosition.toArray(), ...actual.worldVelocity.toArray()]);
    }
  } finally {
    vi.unstubAllGlobals(); vi.resetModules();
  }
});

test('partial source catalogs preserve unrelated bodies while fixed missing slots make only the Pluto system unavailable', async () => {
  const puck = raw.find(row => row.id === 388)!;
  const plutoRows = raw.filter(row => row.planet === 'Pluto');
  for (const rows of [[puck], [puck, ...plutoRows.filter(row => row.iauCode !== '905')]]) {
    const catalog = await catalogFromRows(rows);
    const selected = companions(body(catalog, 'pluto').orbit!);
    COMPONENTS.forEach(([identity], i) => assert.equal(selected[i].orbit === null, !rows.some(row => row.planet === 'Pluto' && row.iauCode === identity)));
    const model = new SolarSystemModel(catalog); model.update(JD);
    assert.equal(model.getState('pluto')!.available, false);
    assert.equal(model.getState('moon-uranus-puck')!.available, true);
    assert.equal(model.getState('mercury')!.available, true);
    for (const item of catalog.bodies.filter(item => item.parentId === 'pluto')) assert.equal(model.getState(item.id)!.available, false);
  }
});

test('source order and display names cannot replace the exact parent/IAU binding or first-selected identity', async () => {
  const rows = raw.filter(row => row.planet === 'Pluto');
  const duplicate = { ...rows.find(row => row.iauCode === '901')!, id: 90001, name: 'Wrong duplicate', aKm: 1e7 };
  // A same-name impostor must not own a required component; keep measured
  // source names intact so physical-radius identity checks remain active.
  const impostor = { ...rows.find(row => row.iauCode === '901')!, id: 90002, iauCode: 'owned-901', aKm: 1e7 };
  const catalog = await catalogFromRows([impostor, ...[...rows].reverse(), duplicate]);
  const selected = companions(body(catalog, 'pluto').orbit!);
  COMPONENTS.forEach(([identity, , gm], i) => {
    const moon = catalog.bodies.find(item => item.parentId === 'pluto' && item.sourceId === identity)!;
    assert(moon);
    assert.equal(selected[i].orbit, moon.orbit);
    assert.equal(selected[i].massFraction, gm / SYSTEM_GM);
    assert.equal(moon.orbit!.aAu, rows.find(row => row.iauCode === identity)!.aKm / AU_KM);
  });
  assert.equal(catalog.bodies.some(item => item.name === 'Wrong duplicate'), false);
  assert.equal(catalog.bodies.filter(item => item.parentId === 'pluto' && item.name === 'Charon').length, 2);
  assert.notEqual(selected[0].orbit, catalog.bodies.find(item => item.sourceId === 'owned-901')!.orbit);
});

test('measured Pluto moon identity mismatches still reject before physical radius assignment', async () => {
  const charon = raw.find(row => row.planet === 'Pluto' && row.iauCode === '901')!;
  await assert.rejects(() => catalogFromRows([{ ...charon, name: 'Owned wrong label' }]),
    /Moon physical radius identity differs/);
});

test('actual opt-in loader and injected fit bind the runtime orbit instances without new acquisition', async () => {
  const loaded = await loadMoonEphemerides();
  for (const [, name] of COMPONENTS) assert.equal(loaded[name.toLowerCase()], undefined);
  const plain = createSolarSystemCatalog({ moonsVisible: false });
  const loadedCatalog = createSolarSystemCatalog({ moonEphemerides: loaded, moonsVisible: false });
  assert.deepEqual(body(loadedCatalog, 'pluto').orbit, body(plain, 'pluto').orbit);
  const synthetic = fitted();
  synthetic.coverageStartJd = JD;
  synthetic.coverageEndJd = JD + 2;
  synthetic.segments[0].startJd = JD;
  synthetic.segments[0].endJd = JD + 2;
  const injected = createSolarSystemCatalog({ moonEphemerides: { ...loaded, charon: synthetic }, moonsVisible: false });
  const pluto = body(injected, 'pluto').orbit!, charon = body(injected, 'moon-pluto-charon').orbit!;
  assert.equal(companions(pluto)[0].orbit, charon);
  assert.equal(charon.ephemeris, synthetic);
  charon.ephemerisRequired = true;
  unchangedOnFailure(pluto, JD + 3 - pluto.epochJd);
  const jd = JD + 0.5, parent = state(PLANETS.find(item => item.id === 'pluto')!.orbit, jd);
  for (let i = 0; i < 5; i += 1) {
    const relative = state(companions(pluto)[i].orbit!, jd);
    parent.p.addScaledVector(relative.p, -COMPONENTS[i][2] / SYSTEM_GM);
    parent.v.addScaledVector(relative.v, -COMPONENTS[i][2] / SYSTEM_GM);
  }
  const actual = state(pluto, jd);
  near(actual.p.toArray(), parent.p.toArray(), 'injected fitted position');
  near(actual.v.toArray(), parent.v.toArray(), 'injected fitted velocity');
});

function controlledBody(orbit: KeplerOrbit): CatalogBody {
  return { ...body(createSolarSystemCatalog(), 'pluto'), orbit };
}
const truth = (jd: number, positionAu: readonly number[]): PlanetTruthState => ({
  jd, x: positionAu[0] * AU_KM, y: positionAu[1] * AU_KM, z: positionAu[2] * AU_KM,
  vx: 0, vy: 0, vz: 0,
});
const publicCallback: Callback = (orbit, elapsed, p, v) => propagateKeplerOrbit(orbit, elapsed, p as Vector3, (v ?? null) as Vector3 | null);

test('gate target9 reconstructs the corrected result while999 remains physical and unknown Pluto targets reject', () => {
  const system = analyticSystem(), jd = JD + 1.25;
  const physical = analyticSystemState(system, jd), centre = analytic(system.orbit, jd, [1, 0, 0], [0, 1, 0]);
  const item = controlledBody(system.orbit);
  const baryRow = compare('pluto', item, truth(jd, centre.p), 'controlled', publicCallback, '9');
  const physicalRow = compare('pluto', item, truth(jd, physical.p), 'controlled', publicCallback, '999');
  // Absolute arithmetic budget scales with the input coordinates, not near-zero error.
  assert(baryRow.errKm <= 1024 * Number.EPSILON * AU_KM * 8);
  assert(physicalRow.errKm <= 1024 * Number.EPSILON * AU_KM * 8);
  assert.throws(() => compare('pluto', item, truth(jd, centre.p), 'controlled', publicCallback, '901'));
});

test('gate reconstruction cannot strip composite metadata and hide a correction-output perturbation', () => {
  const system = analyticSystem(), jd = JD + 1.25;
  const centre = analytic(system.orbit, jd, [1, 0, 0], [0, 1, 0]);
  const calls: KeplerOrbit[] = [];
  const callback: Callback = (orbit, elapsed, p) => {
    calls.push(orbit);
    // A deliberately independent fake public propagation contract: only the full
    // composite result has this known offset. Every output supports set() only.
    if (orbit === system.orbit) {
      assert.equal((orbit as PluralOrbit).barycentreCompanions, system.orbit.barycentreCompanions);
      const physical = analyticSystemState(system, orbit.epochJd + elapsed).p;
      p.set(physical[0] + 0.125, physical[1], physical[2]);
    } else {
      const index = system.leaves.findIndex(leaf => leaf.orbit === orbit);
      assert(index >= 0, 'gate passes an actual required leaf, never a stripped parent copy');
      const leaf = system.leaves[index];
      const relative = analytic(leaf.orbit, orbit.epochJd + elapsed, leaf.P, leaf.Q).p;
      p.set(...relative);
    }
    // Deliberately no return value: supported historical set-only callbacks.
  };
  const row = compare('pluto', controlledBody(system.orbit), truth(jd, centre.p), 'controlled', callback, '9');
  near([row.errKm], [0.125 * AU_KM], 'composite-only perturbation');
  assert.equal(calls[0], system.orbit);
  assert.deepEqual(calls.slice(1), system.leaves.map(leaf => leaf.orbit));
});

test('gate rejects explicit propagation false and missing required target9 metadata instead of comparing zero or bare state', () => {
  const system = analyticSystem(), jd = JD + 1;
  const centre = analytic(system.orbit, jd, [1, 0, 0], [0, 1, 0]);
  assert.throws(() => heliocentricPositionKm(() => false, system.orbit, jd));
  assert.throws(() => compare('pluto', controlledBody(system.orbit), truth(jd, centre.p), 'controlled', () => false, '9'));
  assert.throws(() => compare('pluto', controlledBody(circle()), truth(jd, centre.p), 'controlled', publicCallback, '9'));
  const selected = system.orbit.barycentreCompanions!;
  selected[4].orbit = null;
  assert.throws(() => compare('pluto', controlledBody(system.orbit), truth(jd, centre.p), 'controlled', publicCallback, '9'));
});

test('Earth and ordinary gate rows keep physical positions and void-returning set-only compatibility', () => {
  const catalog = createSolarSystemCatalog();
  for (const [id, target] of [['earth', '399'], ['mars', '4']]) {
    const item = body(catalog, id), jd = JD + 1.25;
    const expected = state(item.orbit!, jd).p.toArray();
    const callback: Callback = (orbit, elapsed, p) => {
      assert.equal(orbit, item.orbit);
      assert.equal(typeof (p as unknown as Record<string, unknown>).copy, 'undefined');
      assert.equal(publicCallback(orbit, elapsed, p), true);
    };
    const row = compare(id, item, truth(jd, expected), 'controlled', callback, target);
    assert.equal(row.errKm, 0);
  }
});

test('aggregate gate forwards actual fixture target IDs and preserves original54 truth rows and budgets', () => {
  const catalog = createSolarSystemCatalog();
  const original = structuredClone(truthFixture);
  assert.equal(original.bodies.pluto.hid, '9');
  assert.equal(original.bodies.earth.hid, '399');
  const result = evaluatePlanetPositions(catalog, publicCallback, truthFixture);
  assert.equal(result.rows.length, 54);
  assert.equal(result.rows.filter(row => row.id === 'pluto').length, 6);
  const pluto = body(catalog, 'pluto');
  const rawSystem = PLANETS.find(item => item.id === 'pluto')!.orbit;
  for (const entry of original.bodies.pluto.states) {
    const expected = state(rawSystem, entry.jd).p.multiplyScalar(AU_KM);
    const error = Math.hypot(expected.x - entry.x, expected.y - entry.y, expected.z - entry.z);
    const row = result.rows.find(row => row.id === 'pluto' && row.jd === entry.jd)!;
    const arithmeticBudgetKm = 256 * Number.EPSILON * Math.max(1, ...expected.toArray().map(Math.abs));
    assert(Math.abs(row.errKm - error) <= arithmeticBudgetKm, 'target9 error unchanged within coordinate roundoff');
    assert.equal(row.budgetKm, 1600000);
  }
  assert.equal(pluto.orbit!.barycentreCompanion, undefined);
  assert.deepEqual(truthFixture, original);
});
