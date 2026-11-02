// SMB052 only: actual public primary propagation, independent analytic offsets.
// Never call companion propagation: its separate SMB053 origin error is out of scope.
// Found by /qa 2026-10-24; report:
// agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { generateKuiperBelt, NAMED_KBOS, propagateKBOPositions } from '../src/sim/kuiperBelt';

const JD = 2451545;
const KM_PER_AU = 149597870.7;
const SEP_KM = 100000;
const HALF_SQRT_TWO = Math.SQRT1_2;

function body({ orbit = {}, binary = {} } = {}) {
  return {
    orbit: { epochJd: JD, aAu: 40, e: 0, iDeg: 0, ascendingNodeDeg: 0,
      argPeriapsisDeg: 0, meanAnomalyDeg: 0, periodDays: 1024, ...orbit },
    dynClass: 0, surfaceColor: 0, diameterKm: 100, albedo: 0.1,
    color: 0xaabbcc, irregularity: 0.1,
    binary: { diameterKm: 100, separationKm: SEP_KM, periodDays: 8,
      meanAnomalyDeg: 0, eccentricity: 0, inclinationDeg: 0,
      color: 0xaabbcc, albedo: 0.1, irregularity: 0.1, ...binary },
  };
}

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function float32Ulp(value) {
  const magnitude = Math.abs(value);
  return magnitude < 2 ** -126 ? 2 ** -149 : 2 ** (Math.floor(Math.log2(magnitude)) - 23);
}

function assertPrimaryOffset(kbo, date, expectedPrimaryKm) {
  const before = structuredClone(kbo);
  freezeDeep(kbo);
  const single = { ...kbo, binary: null };
  const barycentre = new Float32Array(3);
  const primary = new Float32Array(3);
  propagateKBOPositions([single], date, barycentre);
  propagateKBOPositions([kbo], date, primary);
  for (let axis = 0; axis < 3; axis++) {
    assert.ok(Number.isFinite(primary[axis]) && Number.isFinite(barycentre[axis]));
    const observedOffset = primary[axis] - barycentre[axis];
    const expectedOffset = expectedPrimaryKm[axis] / KM_PER_AU;
    // Both calls use the identical already-rounded barycentre. Only the final
    // primary addition rounds again: half a Float32 ULP plus 1e-12 AU arithmetic
    // allowance (~0.15 m), not a claim of sub-ULP heliocentric precision.
    const budgetAu = 0.5 * float32Ulp(primary[axis]) + 1e-12;
    assert.ok(Math.abs(observedOffset - expectedOffset) <= budgetAu,
      `axis ${axis}: offsetKm=${observedOffset * KM_PER_AU}, expectedKm=${expectedPrimaryKm[axis]}, budgetKm=${budgetAu * KM_PER_AU}`);
  }
  assert.deepEqual(kbo, before);
  return primary;
}

// Literal cardinal/intercardinal geometry: no production Kepler/basis helper is
// imported for expected offsets. Equal masses give the primary half the separation.
for (const [phase, direction] of [
  [0, [1, 0, 0]], [45, [HALF_SQRT_TWO, HALF_SQRT_TWO, 0]],
  [90, [0, 1, 0]], [180, [-1, 0, 0]], [270, [0, -1, 0]],
]) {
  test(`circular mutual phase ${phase} degrees is applied once`, () => {
    assertPrimaryOffset(body({ binary: { meanAnomalyDeg: phase } }), JD,
      direction.map(component => -50000 * component));
  });
}

for (const [days, direction] of [
  [-2, [0, -1, 0]], [2, [0, 1, 0]], [18, [0, 1, 0]],
  [-14, [0, 1, 0]], [8, [1, 0, 0]],
]) {
  test(`eight-day mutual period advances once at elapsed ${days} days`, () => {
    assertPrimaryOffset(body(), JD + days, direction.map(component => -50000 * component));
  });
}

for (const eccentricity of [0.2, 0.6]) {
  test(`eccentric periapsis e=${eccentricity} retains a(1-e) and orientation`, () => {
    assertPrimaryOffset(body({ binary: { eccentricity } }), JD,
      [-50000 * (1 - eccentricity), 0, 0]);
  });
  test(`eccentric apoapsis e=${eccentricity} has opposite a(1+e) direction`, () => {
    assertPrimaryOffset(body({ binary: { eccentricity, meanAnomalyDeg: 180 } }), JD,
      [50000 * (1 + eccentricity), 0, 0]);
  });
}

test('known eccentric anomaly pi/2 uses the fixed ellipse axes', () => {
  // Analytic Kepler pair E=pi/2, e=1/5 gives M=pi/2-1/5,
  // relative coordinates (-a/5, a*sqrt(24)/5), without a numerical oracle solver.
  const meanAnomalyDeg = 90 - 0.2 * 180 / Math.PI;
  assertPrimaryOffset(body({ binary: { eccentricity: 0.2, meanAnomalyDeg } }), JD,
    [10000, -10000 * Math.sqrt(24), 0]);
});

// Independent hand-worked frame: Omega=90, i=60, omega=90 gives
// P=(-1/2,0,sqrt(3)/2), Q=(0,-1,0), N=(sqrt(3)/2,0,1/2).
// A +30-degree tilt about P gives Qt=(sqrt(3)/4,-sqrt(3)/2,1/4).
const P = [-0.5, 0, Math.sqrt(3) / 2];
const QT = [Math.sqrt(3) / 4, -Math.sqrt(3) / 2, 0.25];
for (const [phase, direction] of [
  [0, P], [90, QT], [180, P.map(value => -value)], [270, QT.map(value => -value)],
]) {
  test(`inclined fixed mutual plane at phase ${phase} degrees`, () => {
    assertPrimaryOffset(body({ orbit: { ascendingNodeDeg: 90, iDeg: 60, argPeriapsisDeg: 90 },
      binary: { meanAnomalyDeg: phase, inclinationDeg: 30 } }), JD,
      direction.map(component => -50000 * component));
  });
}

// Existing mass policy, not a new physical density/floor recommendation.
for (const [diameterKm, expectedPrimaryKm] of [[100, 50000], [50, SEP_KM / 9], [10, SEP_KM / 21]]) {
  test(`control: diameter ${diameterKm} preserves the primary mass share at periapsis`, () => {
    assertPrimaryOffset(body({ binary: { diameterKm } }), JD, [-expectedPrimaryKm, 0, 0]);
  });
}

test('control: absent and null binaries keep identical singles and output tail', () => {
  const single = body();
  delete single.binary;
  const nullBinary = { ...single, binary: null };
  const snapshot = structuredClone([single, nullBinary]);
  freezeDeep(single);
  freezeDeep(nullBinary);
  const out = new Float32Array([0, 0, 0, 0, 0, 0, 123, 456]);
  propagateKBOPositions([single, nullBinary], JD + 256, out);
  assert.deepEqual(Array.from(out.slice(0, 3)), Array.from(out.slice(3, 6)));
  assert.ok(Math.abs(out[0]) < 1e-12 && out[1] === 40 && out[2] === 0);
  assert.deepEqual(Array.from(out.slice(6)), [123, 456]);
  assert.deepEqual([single, nullBinary], snapshot);
});

test('control: frozen binary inputs and repeated dates are unchanged', () => {
  const kbo = body({ binary: { eccentricity: 0.2 } });
  freezeDeep(kbo);
  const before = structuredClone(kbo);
  const first = new Float32Array(3);
  const repeated = new Float32Array(3);
  propagateKBOPositions([kbo], JD + 3, first);
  propagateKBOPositions([kbo], JD + 3, repeated);
  assert.deepEqual(first, repeated);
  assert.ok(Array.from(first).every(Number.isFinite));
  assert.deepEqual(kbo, before);
});

test('control: seeded population includes procedural binaries and retains named singles', () => {
  const first = generateKuiperBelt(500, 137);
  const repeated = generateKuiperBelt(500, 137);
  assert.deepEqual(first, repeated);
  assert.equal(first.count, 500);
  assert.ok(first.binaryCount > 0);
  assert.equal(first.binaryCount, first.kbos.filter(kbo => kbo.binary != null).length);
  assert.deepEqual(first.kbos.slice(0, NAMED_KBOS.length), NAMED_KBOS);
  assert.equal(NAMED_KBOS.length, 8);
  assert.ok(NAMED_KBOS.every(kbo => kbo.binary == null));
});

test('control: empty input does not change the output buffer', () => {
  const out = new Float32Array([11, 22, 33]);
  propagateKBOPositions([], JD, out);
  assert.deepEqual(Array.from(out), [11, 22, 33]);
});
