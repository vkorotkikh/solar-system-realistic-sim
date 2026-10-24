import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { test, vi } from 'vitest';
import { Vector3 } from 'three';
import { createSolarSystemCatalog, type RawMoonRecord, type SolarCatalog } from './catalog';
import { buildModelWorkerCatalog, buildCatalogIndexContract } from '../workers/modelWorkerContract';
import { propagateKeplerOrbit } from './orbitMath';

// MOON-RUNTIME-PUCK /qa 2026-10-24: one runtime identity, distinct raw source models.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// Exact model compatibility only, not an independent astronomical accuracy certificate.
const rawPath = new URL('../data/moons.json', import.meta.url);
const rawBytes = readFileSync(rawPath);
const raw = JSON.parse(rawBytes.toString('utf8')) as RawMoonRecord[];
const RAW_SHA256 = '3fab19c00fd86b35bb262135eb048b4f0bd376d9dd8104da9416bb09bc96143a';
const AU_KM = 149597870.7;
const canonical = raw.find(row => row.id === 378)!;
const alternate = raw.find(row => row.id === 388)!;

async function loadCatalog(rows: readonly unknown[]): Promise<typeof createSolarSystemCatalog> {
  vi.resetModules();
  vi.doMock('../data/moons.json', () => ({ default: rows }));
  try {
    return (await import('./catalog')).createSolarSystemCatalog;
  } finally {
    vi.doUnmock('../data/moons.json');
    vi.resetModules();
  }
}

const projectedRows = raw.filter(row => row.id !== 388);
const createProjected = await loadCatalog(projectedRows);
const createCanonicalOnly = await loadCatalog([canonical]);
const canonicalBody = createCanonicalOnly().bodies.find(body => body.type === 'moon')!;
const runtime = new Map([false, true].map(moonsVisible => [moonsVisible, createSolarSystemCatalog({ moonsVisible })]));
const projected = new Map([false, true].map(moonsVisible => [moonsVisible, createProjected({ moonsVisible })]));
const moonBodies = (catalog: SolarCatalog) => catalog.bodies.filter(body => body.type === 'moon');
const puckBodies = (catalog: SolarCatalog) => catalog.bodies.filter(body => body.parentId === 'uranus' && body.name === 'Puck');
const fixtureCatalog = async (rows: readonly unknown[]) => (await loadCatalog(rows))();
const sourceIdentity = (row: RawMoonRecord) => JSON.stringify([row.planet, row.iauCode]);

test('raw424 keeps both distinct Puck source models and exactly423 physical identities', () => {
  assert.equal(createHash('sha256').update(rawBytes).digest('hex'), RAW_SHA256);
  assert.equal(raw.length, 424);
  assert.equal(new Set(raw.map(sourceIdentity)).size, 423);
  const groups = new Map<string, number[]>();
  for (const row of raw) groups.set(sourceIdentity(row), [...(groups.get(sourceIdentity(row)) || []), row.id]);
  assert.deepEqual([...groups].filter(([, ids]) => ids.length > 1), [['["Uranus","715"]', [378, 388]]]);
  const provenance = (row: RawMoonRecord) => ({ id: row.id, planet: row.planet, iauCode: row.iauCode,
    ephemeris: row.ephemeris, frame: row.frame, epochTdb: row.epochTdb, reference: row.reference,
    aKm: row.aKm, e: row.e });
  assert.deepEqual([canonical, alternate].map(provenance), [
    { id: 378, planet: 'Uranus', iauCode: '715', ephemeris: 'URA182', frame: 'equatorial',
      epochTdb: '2000-01-01.5', reference: '45', aKm: 86004, e: 0 },
    { id: 388, planet: 'Uranus', iauCode: '715', ephemeris: 'URA184', frame: 'Laplace',
      epochTdb: '2025-01-01.0', reference: '10', aKm: 86007, e: 0.009 },
  ]);
});

test('runtime construction never mutates or removes raw provenance rows', async () => {
  const owned = structuredClone(raw);
  const before = structuredClone(owned);
  for (const row of owned) Object.freeze(row);
  Object.freeze(owned);
  const create = await loadCatalog(owned);
  create({ moonsVisible: false });
  create({ moonsVisible: true });
  assert.deepEqual(owned, before);
  assert.equal(createHash('sha256').update(readFileSync(rawPath)).digest('hex'), RAW_SHA256);
});

for (const moonsVisible of [false, true]) {
  test(`runtime has423 moons/433 total, not424 physical moons: visible=${moonsVisible}`, () => {
    const catalog = runtime.get(moonsVisible)!;
    assert.equal(moonBodies(catalog).length, 423);
    assert.equal(catalog.bodies.length, 433);
    assert.equal(new Set(catalog.bodies.map(body => body.id)).size, 433);
  });

  test(`one runtime Puck keeps canonical ID and removes only old duplicate ID: visible=${moonsVisible}`, () => {
    const catalog = runtime.get(moonsVisible)!;
    assert.equal(puckBodies(catalog).length, 1);
    assert.equal(puckBodies(catalog)[0].id, 'moon-uranus-puck');
    assert.equal(catalog.bodies.some(body => body.id === 'moon-uranus-puck-2'), false);
  });

  test(`canonical Puck retains row378 source-model fields: visible=${moonsVisible}`, () => {
    const body = puckBodies(runtime.get(moonsVisible)!)[0];
    assert.equal(body.id, 'moon-uranus-puck');
    assert.equal(body.reference, '45');
    assert.equal(body.orbitFrameSource, 'equatorial');
    assert.equal(body.orbit!.aAu, 86004 / AU_KM);
    assert.equal(body.orbit!.epochJd, 2451545);
    assert.equal(body.orbit!.e, 0);
    assert.equal(body.orbit!.meanAnomalyDeg, 50.1);
    assert.equal(body.orbit!.ephemeris, undefined);
    assert.deepEqual(body, canonicalBody);
  });

  test(`surviving runtime body objects equal explicit row388-free projection: visible=${moonsVisible}`, () => {
    // The same strict structural comparison, with a bounded diagnostic rather
    // than printing two complete 400-body catalogs on the expected RED run.
    assert.equal(isDeepStrictEqual(runtime.get(moonsVisible)!.bodies, projected.get(moonsVisible)!.bodies), true);
  });

  test(`jump and planner identities are unaffected by projection: visible=${moonsVisible}`, () => {
    assert.deepEqual(runtime.get(moonsVisible)!.jumpBodyIds, projected.get(moonsVisible)!.jumpBodyIds);
    assert.deepEqual(runtime.get(moonsVisible)!.plannerBodyIds, projected.get(moonsVisible)!.plannerBodyIds);
  });

  test(`Earth-Moon barycentric correction retains the actual runtime orbit reference: visible=${moonsVisible}`, () => {
    const catalog = runtime.get(moonsVisible)!;
    const earth = catalog.bodies.find(body => body.id === 'earth');
    const moon = catalog.bodies.find(body => body.parentId === 'earth' && body.name === 'Moon');
    assert.equal(earth!.orbit!.barycentreCompanion!.orbit, moon!.orbit);
    assert.equal(earth!.orbit!.barycentreCompanion!.massFraction, 0.01215058);
  });
}

test('visibility changes display constraints, not surviving identity or orbital fields', () => {
  const withoutDisplay = (catalog: SolarCatalog) => catalog.bodies.map(({ displayRadiusAu, ...body }) => body);
  assert.deepEqual(withoutDisplay(runtime.get(false)!), withoutDisplay(runtime.get(true)!));
  assert.deepEqual(runtime.get(false)!.jumpBodyIds, runtime.get(true)!.jumpBodyIds);
  assert.deepEqual(runtime.get(false)!.plannerBodyIds, runtime.get(true)!.plannerBodyIds);
});

for (const includeMoons of [false, true]) {
  test(`worker projection recomputes compact source indices and retains parents: includeMoons=${includeMoons}`, () => {
    const source = runtime.get(includeMoons)!;
    const worker = buildModelWorkerCatalog(source.bodies, { includeMoons });
    const contract = buildCatalogIndexContract(worker);
    assert.equal(worker.bodies.length, includeMoons ? 433 : 10);
    assert.equal(new Set(contract.idByIndex).size, worker.bodies.length);
    for (let i = 0; i < worker.bodies.length; i++) {
      assert.equal(source.bodies[contract.sourceIndexByIndex[i]].id, worker.bodies[i].id);
      const parentId = worker.bodies[i].parentId;
      assert.equal(contract.parentIndexByIndex[i], parentId ? contract.idToIndex.get(parentId) : -1);
    }
    if (!includeMoons) assert.equal(worker.bodies.length * (6 * 8 + 1), 490);
  });
}

test('reversed source rows cannot silently replace preferred row378 with row388', async () => {
  const catalog = await fixtureCatalog([...raw].reverse());
  const body = puckBodies(catalog)[0];
  assert.deepEqual(body, canonicalBody);
  assert.equal(puckBodies(catalog).length, 1);
});

test('different display labels for the same parent/IAU remain one physical identity', async () => {
  const catalog = await fixtureCatalog([canonical, { ...alternate, name: 'Alternate Puck label' }]);
  assert.equal(moonBodies(catalog).length, 1);
  assert.deepEqual(moonBodies(catalog)[0], canonicalBody);
});

test('an unpinned duplicate physical identity preserves its existing first-selected model', async () => {
  const first = { ...canonical, id: 1001, name: 'Owned moon', iauCode: 'owned-715' };
  const second = { ...alternate, id: 1002, name: 'Owned moon', iauCode: 'owned-715' };
  const expected = moonBodies(await fixtureCatalog([first]))[0];
  const catalog = await fixtureCatalog([first, second]);
  assert.equal(moonBodies(catalog).length, 1);
  assert.deepEqual(moonBodies(catalog)[0], expected);
});

for (const [name, other] of [
  ['different resolved parent', { ...canonical, id: 1002, planet: 'Neptune' }],
  ['different opaque IAU code', { ...canonical, id: 1002, iauCode: '716' }],
  ['opaque IAU code with leading zero', { ...canonical, id: 1002, iauCode: '0715' }],
]) {
  test(`same display name must not collapse ${name}`, async () => {
    const bodies = moonBodies(await fixtureCatalog([canonical, other]));
    assert.equal(bodies.length, 2);
    assert.equal(new Set(bodies.map(body => body.id)).size, 2);
  });
}

for (const [name, iauCode] of [['absent', undefined], ['null', null], ['empty', ''], ['whitespace', '   ']]) {
  test(`missing identity is not an implicit duplicate key: ${name}`, async () => {
    const rows = [1001, 1002].map(id => ({ ...canonical, id, iauCode, name: 'Owned unidentified moon' }));
    const bodies = moonBodies(await fixtureCatalog(rows));
    assert.equal(bodies.length, 2);
    assert.equal(new Set(bodies.map(body => body.id)).size, 2);
  });
}

test('optional fitted lookup retains lowercase puck key without inventing a fit', () => {
  const keys: PropertyKey[] = [];
  const moonEphemerides = new Proxy({}, { get(_target, key) { keys.push(key); return undefined; } });
  const catalog = createSolarSystemCatalog({ moonEphemerides });
  assert.equal(keys.includes('puck'), true);
  assert.equal(keys.includes('Puck'), false);
  assert.equal(puckBodies(catalog)[0].orbit!.ephemeris, undefined);
});

for (const jd of [2451545, 2457023.5, 2461041.5]) {
  test(`canonical fallback state stays exactly row378-compatible at JDTDB ${jd}`, () => {
    const body = puckBodies(runtime.get(false)!)[0];
    const actualP = new Vector3(), actualV = new Vector3(), expectedP = new Vector3(), expectedV = new Vector3();
    assert.equal(propagateKeplerOrbit(body.orbit!, jd - body.orbit!.epochJd, actualP, actualV), true);
    assert.equal(propagateKeplerOrbit(canonicalBody.orbit!, jd - canonicalBody.orbit!.epochJd, expectedP, expectedV), true);
    assert.deepEqual(actualP.toArray(), expectedP.toArray());
    assert.deepEqual(actualV.toArray(), expectedV.toArray());
  });
}

// Independent review supplement: approved source-selection safety, not accuracy.
// The original31 assertions above retain their oracles; fixture imports are asynchronous.
test('review opaque nonblank whitespace in an IAU code is not normalized', async () => {
  const other = { ...canonical, id: 1002, iauCode: ' 715 ' };
  const bodies = moonBodies(await fixtureCatalog([canonical, other]));
  assert.equal(bodies.length, 2);
  assert.equal(new Set(bodies.map(body => body.id)).size, 2);
});

for (const [label, iauCode] of [['number', 715], ['boolean', true]]) {
  test(`review nonstring ${label} IAU values do not become duplicate identity keys`, async () => {
    const rows = [1001, 1002].map(id => ({
      ...canonical, id, iauCode, name: 'Owned nonstring identity',
    }));
    const bodies = moonBodies(await fixtureCatalog(rows));
    assert.equal(bodies.length, 2);
    assert.equal(new Set(bodies.map(body => body.id)).size, 2);
  });
}

for (const [label, rows] of [
  ['missing', [alternate]],
  ['changed ephemeris', [{ ...canonical, ephemeris: 'OWNED-CHANGED' }, alternate]],
  ['changed source row ID', [{ ...canonical, id: 1001 }, alternate]],
] as const) {
  test(`review known Uranus/715 fails closed when preferred source is ${label}`, async () => {
    // Pin a deliberate source-selection error, not incidental range/typing failure.
    await assert.rejects(() => fixtureCatalog(rows), error =>
      error instanceof Error &&
      !(error instanceof RangeError) &&
      !(error instanceof TypeError) &&
      /Puck/i.test(error.message) &&
      /URA182/.test(error.message));
  });
}

test('review a catalog without the known Puck identity needs no preferred source', async () => {
  const owned = { ...canonical, id: 1001, name: 'Owned other moon', iauCode: 'owned-715' };
  const catalog = await fixtureCatalog([owned]);
  const bodies = moonBodies(catalog);
  assert.equal(catalog.bodies.length, 11);
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].name, 'Owned other moon');
  assert.equal(bodies[0].orbit!.aAu, 86004 / AU_KM);
  assert.equal(bodies[0].reference, '45');
});

test('review unresolved parents remain skipped without triggering the Puck source guard', async () => {
  const catalog = await fixtureCatalog([{ ...alternate, planet: 'Owned unknown parent' }]);
  assert.equal(catalog.bodies.length, 10);
  assert.equal(moonBodies(catalog).length, 0);
});

// Root-approved selected-record order control; original39 above remains unchanged.
test('review preferred source retains its own selected-record position', async () => {
  const before = { ...canonical, id: 1001, name: 'Owned before', iauCode: 'owned-before' };
  const after = { ...canonical, id: 1002, name: 'Owned after', iauCode: 'owned-after' };
  const catalog = await fixtureCatalog([alternate, before, canonical, after]);
  assert.deepEqual(moonBodies(catalog).map(body => body.name), ['Owned before', 'Puck', 'Owned after']);
  assert.deepEqual(puckBodies(catalog)[0], canonicalBody);
});
