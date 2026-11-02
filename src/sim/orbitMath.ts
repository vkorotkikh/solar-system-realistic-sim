import { Vector3 } from 'three';
import {
  canPropagateMoonEphemeris,
  moonEphemerisCoverageAt,
  propagateMoonEphemeris,
  type MoonChebyshevEphemeris
} from './moonEphemeris';
import {
  isSourceFrameKeplerOrbit,
  OrbitModelRangeError,
  propagateSourceFrameOrbit,
  resolveSourceFrameOrbitAtElapsedDays,
  type SourceFrameBasis,
  type SourceFrameKeplerOrbit
} from './sourceFrameOrbit';

const TWO_PI = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;
const JULIAN_CENTURY_DAYS = 36_525;
const ECLIPTIC_BASIS: SourceFrameBasis = {
  x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 }
};

export interface KeplerOrbit {
  aAu: number;
  periodDays: number;
  epochJd: number;
  e?: number;
  iDeg?: number;
  ascendingNodeDeg?: number;
  argPeriapsisDeg?: number;
  meanAnomalyDeg?: number;
  secularRates?: KeplerOrbitSecularRates;
  /**
   * Optional high-accuracy parent-relative state model. Inside its declared
   * coverage this is authoritative. Outside coverage, optional models fall back
   * to the mean elements without extrapolating; required models report unavailable.
   */
  ephemeris?: MoonChebyshevEphemeris;
  /**
   * Fail closed when the fitted state is missing, invalid, or outside coverage.
   * Use this for bodies whose fallback mean elements are known not to be a
   * scientifically usable positional ephemeris.
   */
  ephemerisRequired?: boolean;
  /** Native Laplace/equatorial axes for moon mean-element fallback propagation. */
  sourceFrameBasis?: SourceFrameBasis;
  /**
   * The elements describe the barycentre of this body and `orbit` (the companion's orbit
   * relative to this body): Standish's "Earth" is the Earth-Moon barycentre. The body itself
   * is at r_bary - massFraction * r_companion, with massFraction = m_companion / (m_body +
   * m_companion); the same holds for velocity.
   */
  barycentreCompanion?: { orbit: KeplerOrbit; massFraction: number };
}

/**
 * THE APSIDAL INVARIANT, obeyed by both propagation branches in
 * `resolveKeplerOrbitAtElapsedDays`:
 *
 *   If you precess varpi, you MUST subtract varpidot from the mean-anomaly advance,
 *   or you double-count it.
 *
 * varpi = Omega + argPeriapsis is the longitude of periapsis and L = M + varpi the mean
 * longitude, so dM/dt = dL/dt - dvarpi/dt identically. Precessing Omega and argPeriapsis while
 * advancing M at the full dL/dt makes the propagated L run fast by exactly dvarpi/dt: a pure
 * along-track error, identically zero at the element epoch and growing linearly in T. No check
 * performed only at the epoch can see it.
 *
 * Whether the invariant BITES depends on what the body's tabulated period means, which the two
 * flags below settle:
 *   - `meanLongitudeDegPerCentury` present: dL/dt is tabulated outright (JPL Standish planets).
 *   - `periodIsMeanLongitudePeriod` true: dL/dt = 2*pi/periodDays, because periodDays is the
 *     SIDEREAL period -- the period of the mean LONGITUDE.
 *   - neither: periodDays is taken to be the period of the MEAN ANOMALY, so 2*pi/periodDays is
 *     already dM/dt and no correction is due. This is the case for a body with no precession at
 *     all (asteroids, Kuiper-belt objects), where the distinction is vacuous.
 */
export interface KeplerOrbitSecularRates {
  aAuPerCentury?: number;
  ePerCentury?: number;
  iDegPerCentury?: number;
  ascendingNodeDegPerCentury?: number;
  argPeriapsisDegPerCentury?: number;
  /**
   * Set when `periodDays` is the SIDEREAL period, i.e. 2*pi/periodDays is dL/dt rather than
   * dM/dt, so the apsidal invariant above requires varpidot to be subtracted from the
   * mean-anomaly advance.
   *
   * This is a property of the SOURCE TABLE, not of orbital mechanics, and it cannot be assumed:
   * see SIDEREAL_PERIOD_EPHEMERIDES in catalog.ts for which JPL satellite ephemerides were
   * measured to tabulate which, and for the Horizons evidence behind each verdict.
   *
   * Omitted (the default) leaves the legacy arithmetic bit-for-bit unchanged.
   */
  periodIsMeanLongitudePeriod?: boolean;
  /**
   * Rate of change of the MEAN LONGITUDE L = M + varpi, where varpi = Omega + argPeriapsis,
   * in degrees per Julian century (JPL Standish, "Approximate Positions of the Major Planets",
   * Table 1). This is the authoritative tabulated companion to the other five rates.
   *
   * When this is present the mean anomaly is propagated the way the Standish recipe defines it,
   *   M(T) = L(T) - varpi(T) = M0 + (Ldot - varpidot) * T,
   * so M advances at exactly (Ldot - varpidot). Two consequences matter:
   *
   *  - The apsidal precession is applied ONCE. Advancing M at 2*pi/periodDays (a SIDEREAL period,
   *    i.e. the dL/dt rate) while separately precessing Omega and argPeriapsis double-counts
   *    dvarpi/dt and produces a pure along-track error growing linearly in T.
   *  - The mean-anomaly advance no longer depends on periodDays at all, so the (a/a0)^1.5 period
   *    rescaling can no longer re-apply an a-drift that the tabulated Ldot already contains.
   *
   * Bodies that do NOT supply this field keep the legacy 2*pi/periodDays behaviour unchanged.
   */
  meanLongitudeDegPerCentury?: number;
}

export interface ResolvedKeplerOrbit {
  aAu: number;
  e: number;
  iRad: number;
  ascendingNodeRad: number;
  argPeriapsisRad: number;
  meanAnomalyRad: number;
  periodDays: number;
  /**
   * dM/dt in radians per day for the propagation actually performed. This is the mean motion the
   * Kepler solution and the velocity formula must use. It equals (Ldot - varpidot) when a secular
   * mean-longitude rate is supplied, (2*pi/periodDays - varpidot) when periodDays is flagged as a
   * mean-longitude (sidereal) period, and 2*pi/periodDays otherwise.
   */
  meanMotionRadPerDay: number;
  centuriesSinceEpoch: number;
}

export type OrbitPropagationQuality =
  | 'jpl-fitted-ephemeris'
  | 'state-unavailable-required-ephemeris-missing'
  | 'state-unavailable-outside-ephemeris-coverage'
  | 'state-unavailable-invalid-ephemeris'
  | 'approximate-mean-elements-outside-coverage'
  | 'approximate-mean-elements-invalid-ephemeris'
  | 'approximate-mean-elements'
  | 'keplerian-elements';

/**
 * Exposes the active scientific model so fitted coverage never degrades to an
 * unlabelled extrapolation. Optional fits can retain a labelled approximate
 * fallback; required fits expose an unavailable state instead.
 */
export function orbitPropagationQualityAt(
  orbit: KeplerOrbit,
  julianDate: number
): OrbitPropagationQuality {
  if (orbit.ephemeris) {
    if (moonEphemerisCoverageAt(orbit.ephemeris, julianDate) !== 'covered') {
      return orbit.ephemerisRequired
        ? 'state-unavailable-outside-ephemeris-coverage'
        : 'approximate-mean-elements-outside-coverage';
    }
    if (canPropagateMoonEphemeris(orbit.ephemeris, julianDate)) {
      return 'jpl-fitted-ephemeris';
    }
    return orbit.ephemerisRequired
      ? 'state-unavailable-invalid-ephemeris'
      : 'approximate-mean-elements-invalid-ephemeris';
  }
  if (orbit.ephemerisRequired) return 'state-unavailable-required-ephemeris-missing';
  if (isSourceFrameKeplerOrbit(orbit)) return 'approximate-mean-elements';
  return 'keplerian-elements';
}

export function degToRad(deg: number): number {
  return deg * DEG_TO_RAD;
}

function normalizeRadians(angle: number): number {
  const reduced = angle % TWO_PI;
  return reduced >= 0 ? reduced : reduced + TWO_PI;
}

export function solveKeplerFast(M: number, e: number): number {
  // Danby's starter E0 = M + 0.85 e sign(sin M) converges for every e < 1; the old E0 = M with a
  // fixed six steps diverged for e >= ~0.99. Usually 3-5 steps, so still fast.
  let E = M + 0.85 * e * Math.sign(Math.sin(M));
  for (let i = 0; i < 50; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

// Private arithmetic support for the direct solver only; other solvers retain
// their existing contracts. One reusable view avoids per-step buffer allocation.
const keplerFloatBits = new DataView(new ArrayBuffer(8));
const KEPLER_UNIT_ROUNDOFF = Number.EPSILON / 2;
const KEPLER_GAMMA64 = (64 * KEPLER_UNIT_ROUNDOFF) / (1 - 64 * KEPLER_UNIT_ROUNDOFF);
const KEPLER_UNDERFLOW_ALLOWANCE = 64 * Number.MIN_VALUE;

function keplerAdjacent(value: number, direction: -1 | 1): number {
  if (!Number.isFinite(value)) return value;
  if (value === 0) return direction * Number.MIN_VALUE;
  keplerFloatBits.setFloat64(0, value, false);
  const bits = keplerFloatBits.getBigUint64(0, false);
  keplerFloatBits.setBigUint64(0, bits + ((value > 0) === (direction > 0) ? 1n : -1n), false);
  return keplerFloatBits.getFloat64(0, false);
}

function keplerUp(value: number): number { return keplerAdjacent(value, 1); }
function keplerDown(value: number): number { return keplerAdjacent(value, -1); }

function keplerSineAllowance(value: number): number {
  // Math.sin is implementation-approximated, not specified correctly rounded.
  // One adjacent spacing is a practical runtime assumption, not an ECMA-wide
  // interval guarantee; independent exact-input regressions exercise it.
  return keplerUp(Math.max(keplerUp(value) - value, value - keplerDown(value)));
}

function evaluateDirectKepler(anomaly: number, mean: number, e: number) {
  const oneMinusE = 1 - e;
  let residual: number;
  let residualError: number;
  if (Math.abs(anomaly) <= 1) {
    const square = anomaly * anomaly;
    // E-sin(E), alternating through E^19/19!. The nine coefficient divisions,
    // 16 Horner operations and eight surrounding operations total 33 rounded
    // operations; repeated square factors add at most eight error factors.
    // On square<=1 the absolute-term sum / polynomial is <=400/361, so even
    // gamma41 times that cancellation factor fits below gamma64, with room
    // for scale/bound arithmetic. There is no |M|>=1 scale floor. The fixed
    // cap is arithmetic, not an orbital-range policy.
    let polynomial = 1 / 121645100408832000;
    polynomial = 1 / 355687428096000 - square * polynomial;
    polynomial = 1 / 1307674368000 - square * polynomial;
    polynomial = 1 / 6227020800 - square * polynomial;
    polynomial = 1 / 39916800 - square * polynomial;
    polynomial = 1 / 362880 - square * polynomial;
    polynomial = 1 / 5040 - square * polynomial;
    polynomial = 1 / 120 - square * polynomial;
    polynomial = 1 / 6 - square * polynomial;
    const difference = (anomaly * square) * polynomial;
    const linear = oneMinusE * anomaly;
    const nonlinear = e * difference;
    residual = (linear + nonlinear) - mean;
    const scale = keplerUp(keplerUp(Math.abs(linear) + Math.abs(nonlinear)) + Math.abs(mean));
    // On |E|<=1, the tail <= |E|^21/21! <= |E|^3/21!. The latter avoids
    // underestimating a rounded power; subnormal operations have an absolute
    // allowance as well. 21! itself is exactly representable in binary64.
    const cubeUpper = keplerUp(Math.abs(anomaly) * keplerUp(square));
    const tail = keplerUp(cubeUpper / 51090942171709440000);
    residualError = keplerUp(keplerUp(keplerUp(KEPLER_GAMMA64 * scale) + tail)
      + KEPLER_UNDERFLOW_ALLOWANCE);
  } else {
    const sine = Math.sin(anomaly);
    const difference = anomaly - mean;
    const sineTerm = e * sine;
    residual = difference - sineTerm;
    const scale = keplerUp(Math.abs(difference) + Math.abs(sineTerm));
    const sineError = keplerUp(e * keplerSineAllowance(sine));
    // Three basic operations; gamma64 deliberately dominates their gamma3.
    residualError = keplerUp(keplerUp(keplerUp(KEPLER_GAMMA64 * scale) + sineError)
      + KEPLER_UNDERFLOW_ALLOWANCE);
  }

  const halfSine = Math.sin(anomaly / 2);
  const curved = (2 * e * halfSine) * halfSine;
  const derivative = oneMinusE + curved;
  const sineError = keplerUp(keplerSineAllowance(halfSine) + Number.MIN_VALUE);
  const squareError = keplerUp(keplerUp(2 * Math.abs(halfSine) * sineError)
    + keplerUp(sineError * sineError));
  const trigError = keplerUp(2 * e * squareError);
  // Six basic operations including 1-e and halving; the extra MIN_VALUE
  // covers a subnormal half-angle input before the sine-spacing allowance.
  const derivativeError = keplerUp(keplerUp(keplerUp(KEPLER_GAMMA64 * derivative) + trigError)
    + KEPLER_UNDERFLOW_ALLOWANCE);
  return { residual, residualError, derivative, derivativeError };
}

/**
 * Solve E-e*sin(E)=M for the whole, unwrapped binary64 E. Tolerance is an
 * absolute anomaly target, not a residual/step threshold. The safeguarded
 * refinements honor the supplied budget; a result that cannot establish that
 * precision throws instead of clamping e or returning an unchecked iterate.
 * Rounding allowances are practical binary64 checks, not formal guarantees for
 * every implementation-approximated Math.sin on every JavaScript engine.
 */
export function solveKepler(
  meanAnomalyRad: number,
  eccentricity: number,
  tolerance = 1e-9,
  maxIterations = 64
): number {
  if (!Number.isFinite(meanAnomalyRad) || !Number.isFinite(eccentricity)
    || eccentricity < 0 || eccentricity >= 1
    || !Number.isFinite(tolerance) || tolerance <= 0
    || !Number.isSafeInteger(maxIterations) || maxIterations <= 0) {
    throw new RangeError('Invalid elliptic Kepler solver arguments.');
  }
  const e = eccentricity;
  // Validation precedes exact identities and the analytic |E-M|<=e certificate.
  // This also covers finite boundary M without constructing infinite endpoints.
  if (meanAnomalyRad === 0 || e <= tolerance) return meanAnomalyRad;

  let lower = keplerDown(meanAnomalyRad - e);
  let upper = keplerUp(meanAnomalyRad + e);
  let anomaly = meanAnomalyRad;
  let previous = NaN;
  let certifiedFallback: number | null = null;
  let cycleLower = NaN;
  let cycleUpper = NaN;
  let checkpointAnomaly = NaN;
  let checkpointPrevious = NaN;
  let cyclePower = 1;
  let cycleLength = 0;
  let cycleSafeguarded = false;
  const globalDerivativeLower = keplerDown(1 - e);
  // Initial evaluation plus at most maxIterations actual refinements; there is
  // no hidden larger budget for explicit callers such as the satellite core.
  for (let iteration = 0; iteration <= maxIterations; iteration += 1) {
    const { residual, residualError, derivative, derivativeError } = evaluateDirectKepler(anomaly, meanAnomalyRad, e);
    // Only a sign resolved beyond the arithmetic allowance owns an endpoint.
    if (residual > residualError) upper = anomaly;
    else if (residual < -residualError) lower = anomaly;

    // Bound distance from the actual returned float, not an ideal midpoint.
    const radius = keplerUp(Math.max(anomaly - lower, upper - anomaly));
    const localDerivativeLower = keplerDown(keplerDown(derivative - derivativeError) - keplerUp(e * radius));
    const derivativeLower = Math.max(globalDerivativeLower, localDerivativeLower);
    const residualUpper = keplerUp(Math.abs(residual) + residualError);
    const errorUpper = keplerUp(residualUpper / derivativeLower);
    const certified = radius <= tolerance || errorUpper <= tolerance;
    // Preserve the prior helper's useful final Newton polish, but only within
    // the caller's remaining budget and with an independently checked result.
    // A failed polish cannot discard the already-certified fallback or search
    // further after success. Analytic identities above need no refinement.
    if (certifiedFallback !== null) return certified ? anomaly : certifiedFallback;
    if (certified) {
      const polished = anomaly - residual / derivative;
      if (iteration < maxIterations && Number.isFinite(polished)
        && polished !== anomaly && polished > lower && polished < upper) {
        certifiedFallback = anomaly;
        previous = anomaly;
        anomaly = polished;
        continue;
      }
      return anomaly;
    }
    if (iteration === maxIterations || !Number.isFinite(lower) || !Number.isFinite(upper)) break;

    // Constant-space Brent checkpoints detect deterministic repeated states,
    // including cycles through Newton and midpoint steps. A genuinely tighter
    // bracket starts a new epoch: revisiting a point then is not stagnation.
    let forceSafeguard = false;
    if (lower !== cycleLower || upper !== cycleUpper) {
      cycleLower = lower;
      cycleUpper = upper;
      checkpointAnomaly = anomaly;
      checkpointPrevious = previous;
      cyclePower = 1;
      cycleLength = 0;
      cycleSafeguarded = false;
    } else {
      cycleLength += 1;
      if (anomaly === checkpointAnomaly && previous === checkpointPrevious) {
        if (cycleSafeguarded) break;
        cycleSafeguarded = true;
        forceSafeguard = true;
        // Forced safeguarding changes the transition once; restart the
        // checkpoint but retain its used flag until the bracket tightens.
        checkpointAnomaly = anomaly;
        checkpointPrevious = previous;
        cyclePower = 1;
        cycleLength = 0;
      } else if (cycleLength === cyclePower) {
        checkpointAnomaly = anomaly;
        checkpointPrevious = previous;
        cyclePower = Math.min(2 * cyclePower, maxIterations);
        cycleLength = 0;
      }
    }

    let next = anomaly - residual / derivative;
    if (forceSafeguard || !Number.isFinite(next) || next <= lower || next >= upper || next === anomaly) {
      next = lower + (upper - lower) / 2;
      // An unresolved residual may leave the current value at the midpoint.
      // Split its wider side rather than treating rounded f=0 as convergence.
      if (next === anomaly) {
        next = anomaly - lower >= upper - anomaly
          ? lower + (anomaly - lower) / 2
          : anomaly + (upper - anomaly) / 2;
      }
      if (next <= lower || next >= upper || next === anomaly) {
        next = anomaly === lower ? upper : lower;
        if (next === anomaly || next === previous) break;
      }
    }
    previous = anomaly;
    anomaly = next;
  }
  throw new RangeError('Kepler solver could not establish the requested precision.');
}

function clampEccentricity(eccentricity: number): number {
  return Math.max(0, Math.min(0.9999999, eccentricity));
}

export function resolveKeplerOrbitAtElapsedDays(
  orbit: KeplerOrbit,
  elapsedDays: number
): ResolvedKeplerOrbit {
  if (orbit.secularRates) {
    return resolveSourceFrameOrbitAtElapsedDays(
      { ...orbit, sourceFrameBasis: orbit.sourceFrameBasis ?? ECLIPTIC_BASIS }, elapsedDays
    );
  }
  const centuriesSinceEpoch = elapsedDays / JULIAN_CENTURY_DAYS;
  // Secular models use the shared resolver above. Keep this fixed-element path
  // and its clamping/arithmetic for existing asteroid and Kuiper callers.
  const a = Math.max(1e-9, orbit.aAu);
  const e = clampEccentricity(orbit.e ?? 0);
  const iRad = degToRad(orbit.iDeg ?? 0);
  const ascendingNodeRad = degToRad(orbit.ascendingNodeDeg ?? 0);
  const argPeriapsisRad = degToRad(orbit.argPeriapsisDeg ?? 0);
  const periodDays = Math.max(1e-9, orbit.periodDays);
  const meanMotionRadPerDay = TWO_PI / periodDays;
  const meanAnomalyRad = normalizeRadians(degToRad(orbit.meanAnomalyDeg ?? 0) + meanMotionRadPerDay * elapsedDays);
  return {
    aAu: a,
    e,
    iRad,
    ascendingNodeRad,
    argPeriapsisRad,
    meanAnomalyRad,
    periodDays,
    meanMotionRadPerDay,
    centuriesSinceEpoch
  };
}

const baryPosition = new Vector3();
const baryVelocity = new Vector3();
const companionPosition = new Vector3();
const companionVelocity = new Vector3();

function tryPropagateSourceFrameOrbit(
  orbit: SourceFrameKeplerOrbit,
  elapsedDays: number,
  outPosition: Vector3,
  outVelocity: Vector3 | null
): boolean {
  try {
    propagateSourceFrameOrbit(orbit, elapsedDays, outPosition, outVelocity);
    return true;
  } catch (error) {
    if (error instanceof OrbitModelRangeError) return false;
    throw error;
  }
}

export function propagateKeplerOrbit(
  orbit: KeplerOrbit,
  elapsedDays: number,
  outPosition: Vector3,
  outVelocity: Vector3 | null = null
): boolean {
  const companion = orbit.barycentreCompanion;
  if (!companion) return propagateOwnOrbit(orbit, elapsedDays, outPosition, outVelocity);

  // ponytail: shared scratch vectors, so a companion must not itself carry a companion.
  // Outputs are written once with .set(), and not at all on failure, like every other branch.
  const companionElapsedDays = elapsedDays + orbit.epochJd - companion.orbit.epochJd;
  const wantVelocity = outVelocity !== null;
  if (
    !propagateOwnOrbit(orbit, elapsedDays, baryPosition, wantVelocity ? baryVelocity : null) ||
    !propagateOwnOrbit(companion.orbit, companionElapsedDays, companionPosition, wantVelocity ? companionVelocity : null)
  ) {
    return false;
  }
  const k = companion.massFraction;
  outPosition.set(
    baryPosition.x - k * companionPosition.x,
    baryPosition.y - k * companionPosition.y,
    baryPosition.z - k * companionPosition.z
  );
  outVelocity?.set(
    baryVelocity.x - k * companionVelocity.x,
    baryVelocity.y - k * companionVelocity.y,
    baryVelocity.z - k * companionVelocity.z
  );
  return true;
}

function propagateOwnOrbit(
  orbit: KeplerOrbit,
  elapsedDays: number,
  outPosition: Vector3,
  outVelocity: Vector3 | null
): boolean {
  if (
    orbit.ephemeris &&
    propagateMoonEphemeris(
      orbit.ephemeris,
      orbit.epochJd + elapsedDays,
      outPosition,
      outVelocity
    )
  ) {
    return true;
  }

  // A required fitted state must never degrade silently to the mean-element
  // approximation that it was introduced to replace. The ephemeris evaluator
  // is atomic, so false also guarantees that neither output was modified.
  if (orbit.ephemerisRequired) return false;

  // JPL satellite mean-element node/apsis rates are rotations in the table's
  // Laplace/equatorial source frame. Apply them there and rotate the resulting
  // state, rather than adding them to already-converted ecliptic angles.
  if (isSourceFrameKeplerOrbit(orbit)) {
    return tryPropagateSourceFrameOrbit(orbit, elapsedDays, outPosition, outVelocity);
  }

  // The same precessing-ellipse model applies to planets, with identity source
  // axes. Reuse its full product-rule derivative (a, e and all three rotations)
  // and the integral of n(t) when a drifts without a tabulated longitude rate.
  if (orbit.secularRates) {
    return tryPropagateSourceFrameOrbit(
      { ...orbit, sourceFrameBasis: ECLIPTIC_BASIS },
      elapsedDays,
      outPosition,
      outVelocity
    );
  }

  const resolved = resolveKeplerOrbitAtElapsedDays(orbit, elapsedDays);
  const a = resolved.aAu;
  const e = resolved.e;
  const i = resolved.iRad;
  const ascendingNode = resolved.ascendingNodeRad;
  const argPeriapsis = resolved.argPeriapsisRad;
  const meanAnomaly = resolved.meanAnomalyRad;
  const meanMotion = resolved.meanMotionRadPerDay;
  const eccentricAnomaly = solveKepler(meanAnomaly, e);

  const cosE = Math.cos(eccentricAnomaly);
  const sinE = Math.sin(eccentricAnomaly);
  const sqrtOneMinusESquared = Math.sqrt(1 - e * e);
  const radius = a * (1 - e * cosE);

  const cosNu = (cosE - e) / (1 - e * cosE);
  const sinNu = (sqrtOneMinusESquared * sinE) / (1 - e * cosE);
  const trueAnomaly = Math.atan2(sinNu, cosNu);

  const argLatitude = argPeriapsis + trueAnomaly;
  const cosArgLatitude = Math.cos(argLatitude);
  const sinArgLatitude = Math.sin(argLatitude);
  const cosNode = Math.cos(ascendingNode);
  const sinNode = Math.sin(ascendingNode);
  const cosInclination = Math.cos(i);
  const sinInclination = Math.sin(i);

  const x = radius * (cosNode * cosArgLatitude - sinNode * sinArgLatitude * cosInclination);
  const y = radius * (sinNode * cosArgLatitude + cosNode * sinArgLatitude * cosInclination);
  const z = radius * (sinArgLatitude * sinInclination);

  outPosition.set(x, y, z);

  if (outVelocity) {
    const factor = (meanMotion * a) / (1 - e * cosE);

    const vxPerifocal = -factor * sinE;
    const vyPerifocal = factor * sqrtOneMinusESquared * cosE;

    const cosArgPeriapsis = Math.cos(argPeriapsis);
    const sinArgPeriapsis = Math.sin(argPeriapsis);

    const vx1 =
      vxPerifocal * cosArgPeriapsis -
      vyPerifocal * sinArgPeriapsis;
    const vy1 =
      vxPerifocal * sinArgPeriapsis +
      vyPerifocal * cosArgPeriapsis;

    const vx2 = vx1;
    const vy2 = vy1 * cosInclination;
    const vz2 = vy1 * sinInclination;

    const vx = vx2 * cosNode - vy2 * sinNode;
    const vy = vx2 * sinNode + vy2 * cosNode;
    const vz = vz2;

    outVelocity.set(vx, vy, vz);
  }

  return true;
}

export function orbitalPeriodDaysFromSemimajorAxisAu(
  aAu: number,
  mu = 0.0002959122082855911
): number {
  return TWO_PI * Math.sqrt((aAu * aAu * aAu) / mu);
}

export function cloneVector(vec: Pick<Vector3, 'x' | 'y' | 'z'>): Vector3 {
  return new Vector3(vec.x, vec.y, vec.z);
}
