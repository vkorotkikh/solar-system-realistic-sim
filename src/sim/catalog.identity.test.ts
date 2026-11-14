import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { test, vi } from 'vitest';
import { Vector3 } from 'three';
import { createSolarSystemCatalog, type RawMoonRecord, type SolarCatalog } from './catalog';
import { buildModelWorkerCatalog, buildCatalogIndexContract } from '../workers/modelWorkerContract';
import { propagateKeplerOrbit } from './orbitMath';

// MOON-RUNTIME-PUCK: canonical PR22 source, one runtime body per exact identity.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// Exact model compatibility only, not an independent astronomical accuracy certificate.
const rawPath = new URL('../data/moons.json', import.meta.url);
const rawBytes = readFileSync(rawPath);
const raw = JSON.parse(rawBytes.toString('utf8')) as RawMoonRecord[];
const AU_KM = 149597870.7;
const canonical = raw.find(row => row.id === 388)!;
// Synthetic duplicate probes selection without reviving a retired source model.
const alternate = { ...canonical, id: 90001, aKm: 90000, reference: 'owned alternate' };

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

const projectedRows = [...raw, alternate];
const createProjected = await loadCatalog(projectedRows);
const createCanonicalOnly = await loadCatalog([canonical]);
const canonicalBody = createCanonicalOnly().bodies.find(body => body.type === 'moon')!;
const runtime = createSolarSystemCatalog();
const projected = createProjected();
const moonBodies = (catalog: SolarCatalog) => catalog.bodies.filter(body => body.type === 'moon');
const puckBodies = (catalog: SolarCatalog) => catalog.bodies.filter(body => body.parentId === 'uranus' && body.name === 'Puck');
const fixtureCatalog = async (rows: readonly unknown[]) => (await loadCatalog(rows))();
const sourceIdentity = (row: RawMoonRecord) => JSON.stringify([row.planet, row.iauCode]);

test('raw423 contains unique physical identities and only Puck388/URA184', () => {
  assert.equal(raw.length, 423);
  assert.equal(new Set(raw.map(sourceIdentity)).size, 423);
  assert.deepEqual(raw.filter(row => row.planet === 'Uranus' && row.iauCode === '715'), [canonical]);
  assert.equal(raw.some(row => row.id === 378), false);
  const { id, planet, iauCode, ephemeris, frame, epochTdb, reference, aKm, e } = canonical;
  assert.deepEqual({ id, planet, iauCode, ephemeris, frame, epochTdb, reference, aKm, e },
    { id: 388, planet: 'Uranus', iauCode: '715', ephemeris: 'URA184', frame: 'Laplace',
      epochTdb: '2025-01-01.0', reference: '10', aKm: 86007, e: 0.009 });
});

test('runtime construction never mutates or removes raw provenance rows', async () => {
  const owned = structuredClone(raw);
  const before = structuredClone(owned);
  for (const row of owned) Object.freeze(row);
  Object.freeze(owned);
  const create = await loadCatalog(owned);
  create();
  assert.deepEqual(owned, before);
  assert.deepEqual(readFileSync(rawPath), rawBytes);
});

test(`runtime has423 moons/433 total`, () => {
  const catalog = runtime;
  assert.equal(moonBodies(catalog).length, 423);
  assert.equal(catalog.bodies.length, 433);
  assert.equal(new Set(catalog.bodies.map(body => body.id)).size, 433);
});

test(`one runtime Puck keeps canonical ID and removes only old duplicate ID`, () => {
  const catalog = runtime;
  assert.equal(puckBodies(catalog).length, 1);
  assert.equal(puckBodies(catalog)[0].id, 'moon-uranus-puck');
  assert.equal(catalog.bodies.some(body => body.id === 'moon-uranus-puck-2'), false);
});

test(`canonical Puck retains row388 source-model fields`, () => {
  const body = puckBodies(runtime)[0];
  assert.equal(body.id, 'moon-uranus-puck');
  assert.equal(body.reference, '10');
  assert.equal(body.orbitFrameSource, 'laplace');
  assert.equal(body.orbit!.aAu, 86007 / AU_KM);
  assert.equal(body.orbit!.epochJd, 2460676.5);
  assert.equal(body.orbit!.e, 0.009);
  assert.equal(body.orbit!.meanAnomalyDeg, 264.1);
  assert.equal(body.orbit!.ephemeris, undefined);
  assert.deepEqual(body, canonicalBody);
});

test(`later duplicate does not change surviving runtime body objects`, () => {
  // The same strict structural comparison, with a bounded diagnostic rather
  // than printing two complete 400-body catalogs on the expected RED run.
  assert.equal(isDeepStrictEqual(runtime.bodies, projected.bodies), true);
});

test(`jump and planner identities are unaffected by projection`, () => {
  assert.deepEqual(runtime.jumpBodyIds, projected.jumpBodyIds);
  assert.deepEqual(runtime.plannerBodyIds, projected.plannerBodyIds);
});

test(`Earth-Moon barycentric correction retains the actual runtime orbit reference`, () => {
  const catalog = runtime;
  const earth = catalog.bodies.find(body => body.id === 'earth');
  const moon = catalog.bodies.find(body => body.parentId === 'earth' && body.name === 'Moon');
  assert.equal(earth!.orbit!.barycentreCompanion!.orbit, moon!.orbit);
  assert.equal(earth!.orbit!.barycentreCompanion!.massFraction, 0.01215058);
});

for (const includeMoons of [false, true]) {
  test(`worker projection recomputes compact source indices and retains parents: includeMoons=${includeMoons}`, () => {
    const source = runtime;
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

test('reversed canonical source rows preserve the Puck388 model', async () => {
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
  test(`canonical fallback state stays exactly row388-compatible at JDTDB ${jd}`, () => {
    const body = puckBodies(runtime)[0];
    const actualP = new Vector3(), actualV = new Vector3(), expectedP = new Vector3(), expectedV = new Vector3();
    assert.equal(propagateKeplerOrbit(body.orbit!, jd - body.orbit!.epochJd, actualP, actualV), true);
    assert.equal(propagateKeplerOrbit(canonicalBody.orbit!, jd - canonicalBody.orbit!.epochJd, expectedP, expectedV), true);
    assert.deepEqual(actualP.toArray(), expectedP.toArray());
    assert.deepEqual(actualV.toArray(), expectedV.toArray());
  });
}

// Independent review supplement: approved source-selection safety, not accuracy.
// Fixture imports remain isolated; malformed identities are not normalized.
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

for (const [label, row] of [
  ['canonical only', canonical],
  ['changed ephemeris', { ...canonical, ephemeris: 'OWNED-CHANGED' }],
  ['changed source row ID', { ...canonical, id: 1001 }],
] as const) {
  test(`review Puck admission does not depend on a retired source selector: ${label}`, async () => {
    const body = puckBodies(await fixtureCatalog([row]))[0];
    assert.equal(body.sourceId, '715');
    assert.equal(body.orbit!.aAu, row.aKm / AU_KM);
    assert.equal(body.reference, row.reference);
  });
}

test('review a catalog without the known Puck identity needs no preferred source', async () => {
  const owned = { ...canonical, id: 1001, name: 'Owned other moon', iauCode: 'owned-715' };
  const catalog = await fixtureCatalog([owned]);
  const bodies = moonBodies(catalog);
  assert.equal(catalog.bodies.length, 11);
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].name, 'Owned other moon');
  assert.equal(bodies[0].orbit!.aAu, 86007 / AU_KM);
  assert.equal(bodies[0].reference, '10');
});

test('review unresolved parents remain skipped without creating an unresolved moon', async () => {
  const catalog = await fixtureCatalog([{ ...alternate, planet: 'Owned unknown parent' }]);
  assert.equal(catalog.bodies.length, 10);
  assert.equal(moonBodies(catalog).length, 0);
});

// Exact duplicate identities retain their first selected source position.
test('review first-selected source retains its own position', async () => {
  const before = { ...canonical, id: 1001, name: 'Owned before', iauCode: 'owned-before' };
  const after = { ...canonical, id: 1002, name: 'Owned after', iauCode: 'owned-after' };
  const catalog = await fixtureCatalog([before, canonical, after, alternate]);
  assert.deepEqual(moonBodies(catalog).map(body => body.name), ['Owned before', 'Puck', 'Owned after']);
  assert.deepEqual(puckBodies(catalog)[0], canonicalBody);
});
