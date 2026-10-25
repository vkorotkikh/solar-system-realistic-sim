// PLAN-011/012/013: direct elliptic-helper contract on the actual exported module.
// Oracle strings come from independent mpmath1.3.0 160/200-digit solves of exact
// binary64 inputs. These regressions contain no replacement Kepler implementation.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { solveKepler } from '../src/sim/orbitMath.ts';

const ORACLES = {
  "unwrapped1000": {
    "M": 1000,
    "e": 0.99,
    "root": "1000.934300251938276908831340345708520006088110434636870059318794700894"
  },
  "unwrappedNegative": {
    "M": -1000,
    "e": 0.99,
    "root": "-1000.934300251938276908831340345708520006088110434636870059318794700894"
  },
  "unwrappedLarge": {
    "M": 1000000000,
    "e": 0.99,
    "root": "1000000000.989994255406893030323738846009344360656214063390538238406754"
  },
  "aboveClamp": {
    "M": 0.1,
    "e": 0.99999999,
    "root": "0.8537501346553166743373881975867381123604036540177510459073415622368403"
  },
  "nearUnityTiny": {
    "M": 1e-20,
    "e": 0.9999999999999999,
    "root": "0.0000003909195815970804785308285687337035618252270151691985236751753947738267"
  },
  "nearUnitySmall": {
    "M": 1e-12,
    "e": 0.9999999999999999,
    "root": "0.0001817120581612554163938328002837088434337423384182839533876364832608477"
  },
  "propagationSmall": {
    "M": 1e-12,
    "e": 0.9999999,
    "root": "0.000009998334171538095940253927587073562679040335718882140956728186940842669"
  },
  "propagationEnd": {
    "M": 6.283185307179585,
    "e": 0.9999999,
    "root": "6.283185295848508678089873358390284798603383498683332305663712507295602"
  },
  "owner0": {
    "M": 1.2,
    "e": 0,
    "root": "1.1999999999999999555910790149937383830547332763671875"
  },
  "owner1": {
    "M": 1.2,
    "e": 0.1,
    "root": "1.29625496378722598069221078499179140530612628616077965227076"
  },
  "owner2": {
    "M": 0.1,
    "e": 0.99,
    "root": "0.831660423791056759471785393846447568179151692935902704828628"
  },
  "owner3": {
    "M": 1e-12,
    "e": 0.9999,
    "root": "0.0000000099999999999994346401069046682204926858036590143057934055244"
  },
  "owner4": {
    "M": 6.283185307179585,
    "e": 0.9999,
    "root": "6.28318530716825539912998955994526161922847339371581446844329"
  },
  "owner5": {
    "M": 3.141592653589793,
    "e": 0.9999,
    "root": "3.14159265358979317722724165582547165853795630812360051031555"
  }
};

// All literal decimal roots have <1e-50 absolute transcription/reference error.
// This bound is reference precision, not a replacement production tolerance.
const REFERENCE_ERROR = decimal('1e-50');

function decimal(text) {
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  assert.ok(match, 'valid independent decimal reference');
  const fraction = match[3] ?? '';
  let numerator = BigInt(match[2] + fraction);
  if (match[1] === '-') numerator = -numerator;
  const exponent = Number(match[4] ?? 0) - fraction.length;
  return exponent >= 0
    ? { n: numerator * 10n ** BigInt(exponent), d: 1n }
    : { n: numerator, d: 10n ** BigInt(-exponent) };
}

function binary64(value) {
  assert.ok(Number.isFinite(value), 'finite returned whole eccentric anomaly');
  const bytes = new DataView(new ArrayBuffer(8));
  bytes.setFloat64(0, value, false);
  const bits = bytes.getBigUint64(0, false);
  const sign = (bits >> 63n) === 0n ? 1n : -1n;
  const exponent = Number((bits >> 52n) & 2047n);
  const fraction = bits & ((1n << 52n) - 1n);
  const mantissa = exponent === 0 ? fraction : fraction + (1n << 52n);
  const power = exponent === 0 ? -1074 : exponent - 1023 - 52;
  return power >= 0
    ? { n: sign * mantissa * (1n << BigInt(power)), d: 1n }
    : { n: sign * mantissa, d: 1n << BigInt(-power) };
}

function add(a, b) { return { n: a.n * b.d + b.n * a.d, d: a.d * b.d }; }
function distance(a, b) {
  const n = a.n * b.d - b.n * a.d;
  return { n: n < 0n ? -n : n, d: a.d * b.d };
}
function atMost(a, b) { return a.n * b.d <= b.n * a.d; }

function expectReference(key, tolerance = 1e-9, budget, useDefaults = false) {
  const reference = ORACLES[key];
  const args = useDefaults ? [reference.M, reference.e]
    : budget === undefined ? [reference.M, reference.e, tolerance]
      : [reference.M, reference.e, tolerance, budget];
  const result = solveKepler(...args);
  const upperError = add(distance(binary64(result), decimal(reference.root)), REFERENCE_ERROR);
  assert.ok(atMost(upperError, binary64(tolerance)),
    `${key}: whole E=${result} must be within ${tolerance} rad of independent root ${reference.root}`);
  return result;
}

test('unwrapped1000: solves the reported .99 orbit within requested1e-12', () => {
  expectReference('unwrapped1000', 1e-12);
});
test('control: negative unwrapped1000 retains its accurate result', () => {
  expectReference('unwrappedNegative', 1e-12);
});
test('valid eccentricity above the old clamp is solved without alteration', () => {
  expectReference('aboveClamp', 1e-12);
});
test('near-unity tiny M resolves the eccentric anomaly, not just a small residual', () => {
  expectReference('nearUnityTiny', 1e-12);
});
test('near-unity small M preserves the exact supplied eccentricity', () => {
  expectReference('nearUnitySmall', 1e-12);
});
test('default precision and budget resolve the normalized small-M propagation boundary', () => {
  expectReference('propagationSmall', 1e-9, undefined, true);
});
test('explicit24 resolves the normalized near2pi propagation boundary', () => {
  expectReference('propagationEnd', 1e-9, 24);
});
test('large unwrapped input can succeed when requested whole-E precision is representable', () => {
  expectReference('unwrappedLarge', 1e-6);
});

for (const [key, label] of [
  ['owner0', 'circular'],
  ['owner1', 'ordinary'],
  ['owner2', 'high eccentricity'],
  ['owner3', 'small M at owner clamp'],
  ['owner4', 'near2pi at owner clamp'],
  ['owner5', 'pi at owner clamp'],
]) test(`control: normalized owner ${label} preserves explicit24 and existing1e-9`, () => {
  expectReference(key, 1e-9, 24);
});

test('control: coarse output spacing alone does not reject a representable noncircular answer', () => {
  // |E-M|<=e=1e-12<requested1e-9; at M=1e9 only M is representable this close.
  assert.equal(solveKepler(1e9, 1e-12, 1e-9), 1e9);
});

test('control: circular signed/large identities remain exact even with tiny precision and budget1', () => {
  for (const M of [+0, -0, 1.2, -1.2, 1e20, -1e20]) {
    assert.ok(Object.is(solveKepler(M, 0, Number.MIN_VALUE, 1), M),
      `circular identity must retain ${Object.is(M, -0) ? '-0' : M}`);
  }
});

for (const [label, M] of [['positive', +0], ['negative', -0]]) {
  test(`zero-anomaly ${label} identity remains exact for high eccentricity`, () => {
    assert.ok(Object.is(solveKepler(M, .99, 1e-9), M), 'zero anomaly is an exact identity');
  });
}

const INVALID_GROUPS = [
  ['M before circular identity', [NaN, Infinity, -Infinity, '0', null, undefined]
    .map(value => [value, 0, 1e-9, 2])],
  ['e before zero-anomaly identity', [-.1, 1, 1.2, NaN, Infinity, '0', null, undefined]
    .map(value => [0, value, 1e-9, 2])],
  ['tolerance before zero-anomaly identity', [0, -1, NaN, Infinity, '1e-9', null]
    .map(value => [0, .99, value, 2])],
  ['budget before circular identity', [0, -1, .5, NaN, Infinity,
    Number.MAX_SAFE_INTEGER + 1, '20', null]
    .map(value => [1.2, 0, 1e-9, value])],
];
for (const [label, requests] of INVALID_GROUPS) {
  test(`invalid arguments: reject ${label}`, () => {
    const unRejected = [];
    // Execute the whole compact matrix even if an early case fails.
    for (const args of requests) {
      let thrown;
      try { solveKepler(...args); } catch (error) { thrown = error; }
      if (!(thrown instanceof Error)) unRejected.push(args.map(String).join(','));
    }
    assert.deepEqual(unRejected, [], 'every invalid request must throw an Error');
  });
}

test('explicit exhausted budget throws instead of returning an unchecked iterate', () => {
  assert.throws(() => solveKepler(.1, .99, 1e-12, 1), Error);
});

for (const [label, key, tolerance, minimumError] of [
  ['large whole-E precision', 'unwrappedLarge', 1e-9, '3.208395169623876115399065564e-8'],
  ['tiny ordinary precision', 'owner2', 1e-20, '1.835388015327270131350538412e-18'],
  ['tiny near-unity precision', 'nearUnityTiny', 1e-30, '5.517053938128555693517224055e-24'],
]) test(`unrepresentable request: ${label} throws instead of silently relaxing tolerance`, () => {
  // The independent oracle compared the nearest float and both neighbors.
  // Half its measured minimum error is still well above this requested precision.
  const min = decimal(minimumError);
  assert.ok(atMost(binary64(tolerance), { n: min.n, d: 2n * min.d }));
  const { M, e } = ORACLES[key];
  assert.throws(() => solveKepler(M, e, tolerance), Error);
});

// Finite-boundary supplement: |E-M| <= e < tolerance already proves M adequate.
// No trigonometric oracle or replacement solver is needed for these two cases.
for (const [label, M] of [["positive", Number.MAX_VALUE], ["negative", -Number.MAX_VALUE]]) {
  test(`finite-boundary ${label}: adequate exact M remains finite with budget1`, () => {
    const e = .99, tolerance = 1, budget = 1;
    const exactE = binary64(e), exactTolerance = binary64(tolerance);
    assert.ok(atMost(exactE, exactTolerance));
    assert.ok(!atMost(exactTolerance, exactE), "exact binary rational e is strictly below tolerance");
    const result = solveKepler(M, e, tolerance, budget);
    assert.ok(Number.isFinite(result), "finite boundary must not overflow during iteration or bracketing");
    assert.ok(Object.is(result, M), "the input itself meets the requested absolute precision");
  });
}
