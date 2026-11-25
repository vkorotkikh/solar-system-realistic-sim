// Binary KBO propagation, primary and companion. Both used to be wrong: the primary's
// mutual phase was applied twice (SMB052) and the companion sat half a separation from
// its primary (SMB053). Found by /qa 2026-10-24; report:
// agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { propagateKBOPositions, propagateBinaryKBOPositions } from '../src/sim/kuiperBelt';

const JD = 2451545;
const KM_PER_AU = 149597870.7;
const SEP_KM = 100000;
const HALF_SQRT_TWO = Math.SQRT1_2;
const MASS_CASES = [
  { label: 'equal', diameterKm: 100, q: 1 },
  { label: 'unequal', diameterKm: 50, q: 1 / 8 },
  { label: 'existing floor', diameterKm: 10, q: 1 / 20 },
];

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

// ── Primary: offset from the barycentre (SMB052) ─────────────────────────────

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

// ── Companion: placed one full separation from the primary (SMB053) ──────────

function pairAtPeriapsis(kbo) {
  const before = structuredClone(kbo);
  freezeDeep(kbo);
  const barycentre = new Float32Array(3);
  const primary = new Float32Array(3);
  const companion = new Float32Array(3);
  const indices = [];
  propagateKBOPositions([{ ...kbo, binary: null }], JD, barycentre);
  propagateKBOPositions([kbo], JD, primary);
  const primaryBefore = primary.slice();
  propagateBinaryKBOPositions([kbo], JD, primary, indices, companion);
  assert.deepEqual(indices, [0]);
  assert.deepEqual(primary, primaryBefore);
  assert.deepEqual(kbo, before);
  assert.ok([...barycentre, ...primary, ...companion].every(Number.isFinite));
  return { barycentre, primary, companion };
}

function assertSeparation({ primary, companion }, expectedRelativeKm) {
  for (let axis = 0; axis < 3; axis++) {
    const observedAu = companion[axis] - primary[axis];
    // The actual caller supplies its already-rounded primary. Its roundoff
    // cancels in c-p: only the companion Float32 write rounds the relative step.
    const budgetAu = 0.5 * float32Ulp(companion[axis]) + 1e-12;
    assert.ok(Math.abs(observedAu - expectedRelativeKm[axis] / KM_PER_AU) <= budgetAu,
      `separation axis ${axis}: actualKm=${observedAu * KM_PER_AU}, expectedKm=${expectedRelativeKm[axis]}, budgetKm=${budgetAu * KM_PER_AU}`);
  }
}

function assertBarycentre({ barycentre, primary, companion }, q) {
  for (let axis = 0; axis < 3; axis++) {
    // Subtract the common Float32 barycentre before weighting to avoid a new
    // large-coordinate cancellation. Mass shares are literal independent inputs.
    const observedAu = ((primary[axis] - barycentre[axis])
      + q * (companion[axis] - barycentre[axis])) / (1 + q);
    // p=B+p0+ep; c=p+(c0-p0)+ec. The weighted residual is ep+q/(1+q)*ec.
    const budgetAu = 0.5 * float32Ulp(primary[axis])
      + q / (1 + q) * 0.5 * float32Ulp(companion[axis]) + 1e-12;
    assert.ok(Math.abs(observedAu) <= budgetAu,
      `centre axis ${axis}: residualKm=${observedAu * KM_PER_AU}, budgetKm=${budgetAu * KM_PER_AU}`);
  }
}

for (const mass of MASS_CASES) {
  test(`${mass.label} pair retains the full mutual separation at periapsis`, () => {
    assertSeparation(pairAtPeriapsis(body({ binary: { diameterKm: mass.diameterKm } })), [SEP_KM, 0, 0]);
  });
  test(`${mass.label} pair retains its mass-weighted barycentre at periapsis`, () => {
    assertBarycentre(pairAtPeriapsis(body({ binary: { diameterKm: mass.diameterKm } })), mass.q);
  });
}

for (const eccentricity of [0.2, 0.6]) {
  test(`eccentric e=${eccentricity} periapsis separation is a(1-e)`, () => {
    assertSeparation(pairAtPeriapsis(body({ binary: { eccentricity } })), [SEP_KM * (1 - eccentricity), 0, 0]);
  });
  test(`eccentric e=${eccentricity} periapsis retains the weighted centre`, () => {
    assertBarycentre(pairAtPeriapsis(body({ binary: { eccentricity } })), 1);
  });
}

function inclinedBody() {
  // Hand-worked periapsis axis for Omega=90, i=60, omega=90:
  // P=(-1/2,0,sqrt(3)/2). Mutual inclination rotates Q, not this P axis.
  return body({ orbit: { ascendingNodeDeg: 90, iDeg: 60, argPeriapsisDeg: 90 },
    binary: { inclinationDeg: 30 } });
}
test('inclined periapsis pair retains the independently oriented full separation', () => {
  assertSeparation(pairAtPeriapsis(inclinedBody()), [-SEP_KM / 2, 0, SEP_KM * Math.sqrt(3) / 2]);
});
test('inclined periapsis pair retains its mass-weighted barycentre', () => {
  assertBarycentre(pairAtPeriapsis(inclinedBody()), 1);
});
test('the original equal-mass 200000 km example is not displayed at half separation', () => {
  assertSeparation(pairAtPeriapsis(body({ binary: { separationKm: 200000 } })), [200000, 0, 0]);
});

test('companion positions use the supplied already-offset primary, not a recomputed barycentre', () => {
  const kbo = freezeDeep(body());
  const primary = new Float32Array(3);
  propagateKBOPositions([kbo], JD, primary);
  // A caller-owned translated primary checks the documented relative contract.
  // Recomputing heliocentric positions would ignore this supplied buffer.
  primary[0] += 3;
  primary[1] -= 2;
  primary[2] += 5;
  const before = primary.slice();
  const companion = new Float32Array(3);
  const indices = [];
  propagateBinaryKBOPositions([kbo], JD, primary, indices, companion);
  assert.deepEqual(primary, before);
  assert.deepEqual(indices, [0]);
  assertSeparation({ primary, companion }, [SEP_KM, 0, 0]);
});

function mixedPopulation() {
  const absent = body();
  delete absent.binary;
  return freezeDeep([
    { ...body(), binary: null },
    body({ orbit: { aAu: 41 }, binary: { diameterKm: 50 } }),
    absent,
    body({ orbit: { aAu: 42 } }),
    body({ orbit: { aAu: 43 }, binary: { diameterKm: 10 } }),
  ]);
}
test('mixed single/binary packing retains each matched primary origin', () => {
  const kbos = mixedPopulation();
  const primary = new Float32Array(kbos.length * 3);
  const companion = new Float32Array(9);
  const indices = [];
  propagateKBOPositions(kbos, JD, primary);
  propagateBinaryKBOPositions(kbos, JD, primary, indices, companion);
  assert.deepEqual(indices, [1, 3, 4]);
  for (let packed = 0; packed < indices.length; packed++) {
    assertSeparation({ primary: primary.slice(indices[packed] * 3, indices[packed] * 3 + 3),
      companion: companion.slice(packed * 3, packed * 3 + 3) }, [SEP_KM, 0, 0]);
  }
});

test('control: packed indices, untouched tails and input buffers are preserved', () => {
  const kbos = mixedPopulation();
  const before = structuredClone(kbos);
  const primary = new Float32Array(kbos.length * 3 + 2);
  primary.set([101, 102], kbos.length * 3);
  propagateKBOPositions(kbos, JD, primary);
  const primaryBefore = primary.slice();
  const companion = new Float32Array(11).fill(-999);
  const indices = [-11, -12, -13, 404];
  propagateBinaryKBOPositions(kbos, JD, primary, indices, companion);
  assert.deepEqual(indices, [1, 3, 4, 404]);
  assert.ok(Array.from(companion.slice(0, 9)).every(value => Number.isFinite(value) && value !== -999));
  assert.deepEqual(Array.from(companion.slice(9)), [-999, -999]);
  assert.deepEqual(primary, primaryBefore);
  assert.deepEqual(kbos, before);
});
test('control: absent and null binary singles do not consume companion slots', () => {
  const absent = body();
  delete absent.binary;
  const kbos = freezeDeep([absent, { ...body(), binary: null }]);
  const primary = new Float32Array(6);
  propagateKBOPositions(kbos, JD, primary);
  const primaryBefore = primary.slice();
  const companion = new Float32Array([1, 2, 3]);
  const indices = [808];
  propagateBinaryKBOPositions(kbos, JD, primary, indices, companion);
  assert.deepEqual(Array.from(companion), [1, 2, 3]);
  assert.deepEqual(indices, [808]);
  assert.deepEqual(primary, primaryBefore);
});
test('control: one binary overwrites only one packed slot', () => {
  const kbo = freezeDeep(body());
  const primary = new Float32Array(3);
  const companion = new Float32Array([9, 9, 9, 123, 456, 789]);
  const indices = [111, 222];
  propagateKBOPositions([kbo], JD, primary);
  propagateBinaryKBOPositions([kbo], JD, primary, indices, companion);
  assert.deepEqual(indices, [0, 222]);
  assert.deepEqual(Array.from(companion.slice(3)), [123, 456, 789]);
  assert.ok(Array.from(companion.slice(0, 3)).every(value => Number.isFinite(value) && value !== 9));
});
test('control: repeated companion propagation is deterministic and does not mutate primary or definitions', () => {
  const kbo = freezeDeep(body({ binary: { eccentricity: 0.2, diameterKm: 50 } }));
  const before = structuredClone(kbo);
  const primary = new Float32Array(3);
  propagateKBOPositions([kbo], JD, primary);
  const primaryBefore = primary.slice();
  const first = new Float32Array(3);
  const repeat = new Float32Array(3);
  propagateBinaryKBOPositions([kbo], JD, primary, [], first);
  propagateBinaryKBOPositions([kbo], JD, primary, [], repeat);
  assert.deepEqual(first, repeat);
  assert.deepEqual(primary, primaryBefore);
  assert.deepEqual(kbo, before);
  assert.ok(Array.from(first).every(Number.isFinite));
});

test('existing mass floor has a resolvable weighted-centre oracle at 200000 km', () => {
  // The 100000 km floor case remains as-is: its centre error can be hidden by
  // Float32 world rounding at 40 AU. This larger existing-range separation
  // resolves that error without tightening the storage-derived tolerance.
  assertBarycentre(pairAtPeriapsis(body({ binary: { diameterKm: 10, separationKm: 200000 } })), 1 / 20);
});

