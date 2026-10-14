import { Vector3 } from 'three';
import {
  canPropagateMoonEphemeris,
  moonEphemerisCoverageAt,
  propagateMoonEphemeris,
  type MoonChebyshevEphemeris
} from './moonEphemeris';
import {
  isSourceFrameKeplerOrbit,
  propagateSourceFrameOrbit,
  resolveSourceFrameOrbitAtElapsedDays,
  type SourceFrameBasis
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

export function solveKepler(
  meanAnomalyRad: number,
  eccentricity: number,
  tolerance = 1e-9,
  maxIterations = 20
): number {
  const e = Math.max(0, Math.min(0.9999999, eccentricity));
  let eccentricAnomaly = e < 0.8 ? meanAnomalyRad : Math.PI;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const f = eccentricAnomaly - e * Math.sin(eccentricAnomaly) - meanAnomalyRad;
    const fPrime = 1 - e * Math.cos(eccentricAnomaly);
    const delta = f / fPrime;
    eccentricAnomaly -= delta;
    if (Math.abs(delta) < tolerance) {
      break;
    }
  }

  return eccentricAnomaly;
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
    propagateSourceFrameOrbit(orbit, elapsedDays, outPosition, outVelocity);
    return true;
  }

  // The same precessing-ellipse model applies to planets, with identity source
  // axes. Reuse its full product-rule derivative (a, e and all three rotations)
  // and the integral of n(t) when a drifts without a tabulated longitude rate.
  if (orbit.secularRates) {
    propagateSourceFrameOrbit({ ...orbit, sourceFrameBasis: ECLIPTIC_BASIS }, elapsedDays, outPosition, outVelocity);
    return true;
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
