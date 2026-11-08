// SMB056: synthetic heliocentric periods only; source and binary periods retained.
// Found by /qa 2026-10-24; report:
// agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { MU_SUN_AU3_DAY2 } from '../src/constants';
import { generateAsteroidBelt, NAMED_ASTEROIDS } from '../src/sim/asteroidBelt';
import { generateKuiperBelt, NAMED_KBOS } from '../src/sim/kuiperBelt';

// SMB056 selected synthetic-period contract, not observed-body ephemeris accuracy.
// Full pre-change populations and capture provenance are retained in the owned
// preparation root. The reference fixture retains ALL original values except
// generated orbit.periodDays; PR22 population metadata is asserted separately,
// not stored. The Kuiper values were re-baselined for SMB-051: binary fractions
// apply at every size, which changes which objects are binary and so the seeded
// draw after them.
//
// Engine independence: the populations used to be pinned by SHA-256, but V8 12.4
// (Node 22) and V8 13.6 (Node 24) round Math.pow / `**` differently (up to 1 ULP
// per call, and Node 24 is the correctly rounded one), which moved the last bits
// of every diameterKm (and the binary fields derived from it). The reference
// fixture was captured on Node 22.23.2 and is byte-for-byte the data the old
// hashes covered. Values that do not pass through pow/exp/log are compared
// EXACTLY; the few that do are compared to REL_TOL.
// Regenerate on purpose with: UPDATE_POPULATION_REFERENCE=1 vitest run <this file>
const SEEDS = [0, 42, 137];
const BINARY_COUNTS = [31, 24, 24];
const NAMED_ASTEROIDS_HASH = '1c8043c8c0a3f5a1fd7f6c945c6ab036bacb2a5e06d0ffbeb6ec4cf669c25608';
const NAMED_KBOS_HASH = '2a7cb40e576844186af0bc2003b49aa9b7bb7b676baf6c03db9880365bb05a45';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Observed engine noise is <= 3 ULP (4e-16 relative; pow is <= 1 ULP per call and
// the binary period chains `**3` and sqrt). 1e-13 is ~450 ULP: >200x that noise,
// yet a 1e-12 relative change in any value is still rejected.
const REL_TOL = 1e-13;
// Generated-row fields that pass through Math.pow / `**` / exp / log.
const LIBM_FIELDS = new Set(['diameterKm', 'binary.diameterKm', 'binary.separationKm', 'binary.periodDays']);
const REFERENCE_URL = new URL('./fixtures/generated-solar-period-reference.json', import.meta.url);

function withoutGeneratedPeriods(population, key, namedCount) {
  return { ...population, [key]: population[key].map((row, index) => {
    if (index < namedCount) return row;
    const { periodDays, ...orbit } = row.orbit;
    return { ...row, orbit };
  }) };
}

const asteroidProjection = seed =>
  withoutGeneratedPeriods(generateAsteroidBelt(64, seed), 'asteroids', NAMED_ASTEROIDS.length);
// seed and populationModel are asserted separately; the rest is the pre-PR22 envelope.
const kuiperProjection = ({ seed, populationModel, ...originalFields }) =>
  withoutGeneratedPeriods(originalFields, 'kbos', NAMED_KBOS.length);
const binariesOf = ({ kbos }) => ({ kbos: kbos.map(row => ({ binary: row.binary ?? null })) });
// The hashes saw populations through JSON.stringify; compare exactly that view.
const plain = value => JSON.parse(JSON.stringify(value));

if (process.env.UPDATE_POPULATION_REFERENCE) {
  const rows = [['capture', { node: process.version, v8: process.versions.v8 }]];
  for (const seed of SEEDS) {
    rows.push(['asteroid:' + seed, asteroidProjection(seed)]);
    rows.push(['kuiper:' + seed, kuiperProjection(generateKuiperBelt(256, seed))]);
  }
  writeFileSync(REFERENCE_URL, '{\n' + rows.map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',\n') + '\n}\n');
}
const REFERENCE = JSON.parse(readFileSync(REFERENCE_URL, 'utf8'));

// Exact everywhere (keys, order, ids, counts, nulls, strings, integers, named source
// rows, and every rand()-only float) except generated-row LIBM_FIELDS at REL_TOL.
function assertMatchesReference(actual, expected, namedCount, path = []) {
  const where = path.join('.');
  if (expected !== null && typeof expected === 'object') {
    assert.ok(actual !== null && typeof actual === 'object' && Array.isArray(actual) === Array.isArray(expected),
      where + ' shape');
    assert.deepEqual(Object.keys(actual), Object.keys(expected), where + ' keys');
    for (const key of Object.keys(expected)) {
      assertMatchesReference(actual[key], expected[key], namedCount, [...path, key]);
    }
    return;
  }
  const [, index, ...field] = path;
  if (typeof expected === 'number' && Number(index) >= namedCount && LIBM_FIELDS.has(field.join('.'))) {
    assert.equal(typeof actual, 'number', where);
    assert.ok(Math.abs(actual - expected) <= REL_TOL * Math.abs(expected),
      where + ': ' + actual + ' vs reference ' + expected + ' exceeds relative ' + REL_TOL);
  } else assert.equal(actual, expected, where);
}

function assertSolarClosure(rows, expectedCount) {
  assert.equal(rows.length, expectedCount);
  assert.ok(rows.length > 0);
  assert.equal(MU_SUN_AU3_DAY2, 0.0002959122082855911, 'existing shared mu is not a repair target');
  let maximumResidual = 0, minimumOldRuleDifference = Infinity;
  for (const { orbit } of rows) {
    const { aAu, periodDays } = orbit;
    assert.ok(Number.isFinite(aAu) && aAu > 0);
    assert.ok(Number.isFinite(periodDays) && periodDays > 0);
    const n = 2 * Math.PI / periodDays;
    maximumResidual = Math.max(maximumResidual,
      Math.abs(n * n * aAu * aAu * aAu / MU_SUN_AU3_DAY2 - 1));
    minimumOldRuleDifference = Math.min(minimumOldRuleDifference,
      Math.abs(periodDays / (365.25 * Math.pow(aAu, 1.5)) - 1));
  }
  // Dimensionless roundoff budget for a short well-scaled arithmetic chain.
  // This is not a position/velocity tolerance, nor a copied period formula.
  assert.ok(maximumResidual <= 32 * Number.EPSILON,
    'n²a³/mu relative closure residual ' + maximumResidual + ' exceeds roundoff budget ' + 32 * Number.EPSILON);
  assert.ok(minimumOldRuleDifference > 1e-6,
    'the selected constant correction must be observably distinct from the Julian-year rule');
}

for (const seed of SEEDS) {
  test('contract asteroid synthetic solar closure seed ' + seed, () => {
    const population = generateAsteroidBelt(64, seed);
    assert.equal(population.count, 64);
    assertSolarClosure(population.asteroids.slice(NAMED_ASTEROIDS.length), 54);
  });

  test('contract Kuiper synthetic solar closure seed ' + seed, () => {
    const population = generateKuiperBelt(256, seed);
    assert.equal(population.count, 256);
    assertSolarClosure(population.kbos.slice(NAMED_KBOS.length), 248);
  });

  test('control complete asteroid non-generated-period projection seed ' + seed, () => {
    assertMatchesReference(plain(asteroidProjection(seed)), REFERENCE['asteroid:' + seed], NAMED_ASTEROIDS.length);
  });

  test('control Kuiper non-generated-period projection and population metadata seed ' + seed, () => {
    const population = generateKuiperBelt(256, seed);
    assert.equal(population.seed, seed);
    assert.equal(population.populationModel, 'synthetic_orbit_candidates_not_resonance_verified');
    // Preserve the original numeric oracle. Only the two explicitly checked
    // metadata fields are outside its pre-PR22 population envelope.
    assertMatchesReference(plain(kuiperProjection(population)), REFERENCE['kuiper:' + seed], NAMED_KBOS.length);
  });
}

test('control reference comparison tolerates only last-bit noise in libm fields', () => {
  const reference = REFERENCE['kuiper:0'];
  const first = NAMED_KBOS.length;                    // first generated row
  const binary = reference.kbos.findIndex(row => row.binary != null);
  const edit = (mutate) => { const copy = structuredClone(reference); mutate(copy); return copy; };
  const passes = copy => assertMatchesReference(copy, reference, NAMED_KBOS.length);
  const fails = copy => assert.throws(() => passes(copy), assert.AssertionError);
  // 4 ULP-scale noise (4e-16) in libm fields is accepted ...
  passes(edit(c => { c.kbos[first].diameterKm *= 1 + 4e-16; c.kbos[binary].binary.periodDays *= 1 - 4e-16; }));
  // ... but a 1e-12 relative change is not, and nothing else gets any slack.
  fails(edit(c => { c.kbos[first].diameterKm *= 1 + 1e-12; }));
  fails(edit(c => { c.kbos[binary].binary.periodDays *= 1 + 1e-12; }));
  fails(edit(c => { c.kbos[first].albedo *= 1 + 1e-9; }));
  fails(edit(c => { c.kbos[first].orbit.aAu *= 1 + 2.3e-16; }));              // 1 ULP, exact field
  fails(edit(c => { c.kbos[binary].binary.eccentricity *= 1 + 2.3e-16; }));   // exact binary field
  fails(edit(c => { c.kbos[0].orbit.periodDays *= 1 + 2.3e-16; }));            // source-supplied row
  fails(edit(c => { c.kbos[0].diameterKm *= 1 + 2.3e-16; }));                  // named rows get no tolerance
  fails(edit(c => { c.kbos[first].dynClass += 1; }));
  fails(edit(c => { c.binaryCount += 1; }));
  fails(edit(c => { c.kbos.pop(); }));
  fails(edit(c => { delete c.kbos[first].irregularity; }));
});

test('control named objects retain all source periods, fields, order and references', () => {
  assert.equal(NAMED_ASTEROIDS.length, 10); assert.equal(NAMED_KBOS.length, 8);
  for (const seed of SEEDS) {
    const asteroid = generateAsteroidBelt(64, seed), kuiper = generateKuiperBelt(256, seed);
    assert.notEqual(asteroid.asteroids, NAMED_ASTEROIDS);
    assert.notEqual(kuiper.kbos, NAMED_KBOS);
    NAMED_ASTEROIDS.forEach((row, index) => assert.equal(asteroid.asteroids[index], row));
    NAMED_KBOS.forEach((row, index) => assert.equal(kuiper.kbos[index], row));
  }
  assert.equal(hash(NAMED_ASTEROIDS), NAMED_ASTEROIDS_HASH);
  assert.equal(hash(NAMED_KBOS), NAMED_KBOS_HASH);
});

function suppliedFixture(id, periodDays) {
  return { ...NAMED_ASTEROIDS[0], sourceId: id, sourceName: 'Owned supplied fixture',
    orbit: { ...NAMED_ASTEROIDS[0].orbit, periodDays } };
}

test('control supplied non-solar-law periods survive mixed population and source-id dedupe', () => {
  const supplied = suppliedFixture('smb056-supplied', 7.125);
  const duplicate = suppliedFixture('smb056-supplied', 999999);
  const before = JSON.stringify([supplied, duplicate, NAMED_ASTEROIDS]);
  for (const seed of SEEDS) {
    const population = generateAsteroidBelt(16, seed,
      { deterministicAsteroids: [supplied, duplicate], includeNamed: true });
    assert.equal(population.count, 16);
    assert.equal(population.asteroids[0], supplied);
    assert.equal(population.asteroids[0].orbit.periodDays, 7.125);
    assert.ok(!population.asteroids.includes(duplicate));
    NAMED_ASTEROIDS.forEach((row, index) => assert.equal(population.asteroids[index + 1], row));
    assert.equal(population.asteroids.slice(11).length, 5);
  }
  assert.equal(JSON.stringify([supplied, duplicate, NAMED_ASTEROIDS]), before);
});

test('control accepted catalog prefix remains exact, unpadded and unmutated', () => {
  const a = suppliedFixture('smb056-a', 7.125), b = suppliedFixture('smb056-b', 1234567.89);
  const duplicate = suppliedFixture('smb056-a', 100);
  const supplied = [a, duplicate, b], before = JSON.stringify(supplied);
  const population = generateAsteroidBelt(50000, 42,
    { deterministicAsteroids: supplied, includeNamed: false });
  assert.equal(population.count, 2);
  assert.deepEqual(population.asteroids, [a, b]);
  assert.equal(population.asteroids[0], a); assert.equal(population.asteroids[1], b);
  assert.deepEqual(population.asteroids.map(row => row.orbit.periodDays), [7.125, 1234567.89]);
  assert.equal(JSON.stringify(supplied), before);
  const capped = generateAsteroidBelt(1, 0, { deterministicAsteroids: supplied, includeNamed: false });
  assert.equal(capped.count, 1); assert.equal(capped.asteroids[0], a);
});

test('control existing low-count and explicit-empty semantics remain unchanged', () => {
  assert.deepEqual(generateAsteroidBelt(0), { count: 0, asteroids: [] });
  assert.deepEqual(generateAsteroidBelt(3).asteroids, NAMED_ASTEROIDS.slice(0, 3));
  assert.equal(generateAsteroidBelt(4, 0, { includeNamed: false }).count, 4);
  assert.deepEqual(generateAsteroidBelt(50000, 42,
    { deterministicAsteroids: [], includeNamed: false }), { count: 0, asteroids: [] });
  for (const count of [0, 3, 8]) {
    const population = generateKuiperBelt(count);
    assert.equal(population.count, 8); assert.equal(population.binaryCount, 0);
    assert.deepEqual(population.kbos, NAMED_KBOS);
  }
});

test('control complete same-seed repeatability and distinct-seed populations', () => {
  for (const seed of SEEDS) {
    assert.deepEqual(generateAsteroidBelt(64, seed), generateAsteroidBelt(64, seed));
    assert.deepEqual(generateKuiperBelt(256, seed), generateKuiperBelt(256, seed));
  }
  assert.notDeepEqual(generateAsteroidBelt(64, 0), generateAsteroidBelt(64, 42));
  assert.notDeepEqual(generateKuiperBelt(256, 0), generateKuiperBelt(256, 42));
});

test('control nonempty mutual binaries preserve complete parameters and periods', () => {
  for (const [index, seed] of SEEDS.entries()) {
    const population = generateKuiperBelt(256, seed);
    const binaries = population.kbos.filter(row => row.binary != null);
    assert.equal(population.binaryCount, BINARY_COUNTS[index]);
    assert.ok(population.binaryCount > 0);
    assert.equal(binaries.length, population.binaryCount);
    assertMatchesReference(plain(binariesOf(population)), binariesOf(REFERENCE['kuiper:' + seed]), NAMED_KBOS.length);
    for (const row of binaries) assert.ok(Number.isFinite(row.binary.periodDays) && row.binary.periodDays > 0);
  }
});
