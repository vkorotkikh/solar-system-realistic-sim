// SMB056: synthetic heliocentric periods only; source and binary periods retained.
// Found by /qa 2026-10-24; report:
// agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'vitest';
import { MU_SUN_AU3_DAY2 } from '../src/constants';
import { generateAsteroidBelt, NAMED_ASTEROIDS } from '../src/sim/asteroidBelt';
import { generateKuiperBelt, NAMED_KBOS } from '../src/sim/kuiperBelt';

// SMB056 selected synthetic-period contract, not observed-body ephemeris accuracy.
// Full pre-change populations and capture provenance are retained in the owned
// preparation root. These hashes retain ALL original values except generated
// orbit.periodDays; PR22 population metadata is asserted separately, not rehashed.
// The Kuiper values were re-baselined for SMB-051: binary fractions apply at every
// size, which changes which objects are binary and so the seeded draw after them.
const SEEDS = [0, 42, 137];
const BASELINES = [
  { asteroid: '70cc1a3b8f3db67e52297385f8424691638e9540e953db59d2af2785e99c1652',
    kuiper: 'b8fc760fe0ab236621f398768e2920984b09ee02c7939e2eea4017f09f432645',
    binaryCount: 31, binary: '18fbf6ce7cd5816c5321c361ca8e05e66896e6648ef14f8f7a92ddbfd01757a3' },
  { asteroid: 'e53ad5d3cda40b4fb7f00c20d31fd12ccd29df8b1b607592a9a8d86d91f2771b',
    kuiper: '1c106e18c3c9423dc3ce22c6a6821cb358d26f0339e466d3be5e78fececec1ae',
    binaryCount: 24, binary: 'd93ddfc2efcb984dfc75f55b0221e4995d721a116a924e375268ab1fa99a78fa' },
  { asteroid: '84531be183a08c2d5cf7167a677d0b2bf1f21575fb126c3d8618a730d0438357',
    kuiper: 'cec3a6591fb157fbdabfc63fb60d7ddafff0b92863585dcd959a4f60df90b490',
    binaryCount: 24, binary: 'bb33ff0a7a5cb347418d64492e2f8d8ff20df58b42db963e8e25927e5ed8d5f6' },
];
const NAMED_ASTEROIDS_HASH = '1c8043c8c0a3f5a1fd7f6c945c6ab036bacb2a5e06d0ffbeb6ec4cf669c25608';
const NAMED_KBOS_HASH = '2a7cb40e576844186af0bc2003b49aa9b7bb7b676baf6c03db9880365bb05a45';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function withoutGeneratedPeriods(population, key, namedCount) {
  return { ...population, [key]: population[key].map((row, index) => {
    if (index < namedCount) return row;
    const { periodDays, ...orbit } = row.orbit;
    return { ...row, orbit };
  }) };
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

for (const [index, seed] of SEEDS.entries()) {
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
    assert.equal(hash(withoutGeneratedPeriods(generateAsteroidBelt(64, seed),
      'asteroids', NAMED_ASTEROIDS.length)), BASELINES[index].asteroid);
  });

  test('control Kuiper non-generated-period projection and population metadata seed ' + seed, () => {
    const { seed: actualSeed, populationModel, ...originalFields } = generateKuiperBelt(256, seed);
    assert.equal(actualSeed, seed);
    assert.equal(populationModel, 'synthetic_orbit_candidates_not_resonance_verified');
    // Preserve the original numeric oracle. Only the two explicitly checked
    // metadata fields are outside its pre-PR22 population envelope.
    assert.equal(hash(withoutGeneratedPeriods(originalFields,
      'kbos', NAMED_KBOS.length)), BASELINES[index].kuiper);
  });
}

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

test('control nonempty mutual binaries preserve complete parameters and periods exactly', () => {
  for (const [index, seed] of SEEDS.entries()) {
    const population = generateKuiperBelt(256, seed);
    const binaries = population.kbos.filter(row => row.binary != null);
    assert.equal(population.binaryCount, BASELINES[index].binaryCount);
    assert.ok(population.binaryCount > 0);
    assert.equal(binaries.length, population.binaryCount);
    assert.equal(hash(population.kbos.map(row => row.binary ?? null)), BASELINES[index].binary);
    for (const row of binaries) assert.ok(Number.isFinite(row.binary.periodDays) && row.binary.periodDays > 0);
  }
});
