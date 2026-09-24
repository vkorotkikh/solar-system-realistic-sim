import type { KeplerOrbit } from './orbitMath';

const TWO_PI = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;
const JULIAN_CENTURY_DAYS = 36_525;
const MIN_VECTOR_MAGNITUDE = 1e-14;

/** A Cartesian vector expressed in the simulation's ecliptic-J2000 axes. */
export interface CartesianVector {
  x: number;
  y: number;
  z: number;
}

/** The small part of THREE.Vector3 used by the propagator. */
export interface SettableCartesianVector extends CartesianVector {
  set(x: number, y: number, z: number): unknown;
}

/**
 * A fixed source-frame triad, with all three unit vectors expressed in the
 * simulation's ecliptic-J2000 axes.
 *
 * JPL's satellite mean elements are commonly referred to a Laplace plane or
 * parent equator.  Their node and apsis rates are rotations *within that source
 * frame*.  Converting the elements to ecliptic once and then adding the source
 * node rate to an ecliptic longitude composes rotations about different axes.
 */
export interface SourceFrameBasis {
  x: CartesianVector;
  y: CartesianVector;
  z: CartesianVector;
}

export interface SourceFrameKeplerOrbit extends KeplerOrbit {
  sourceFrameBasis: SourceFrameBasis;
}

export function isSourceFrameKeplerOrbit(orbit: KeplerOrbit): orbit is SourceFrameKeplerOrbit {
  const candidate = orbit as Partial<SourceFrameKeplerOrbit>;
  return candidate.sourceFrameBasis !== undefined;
}

export interface ResolvedSourceFrameOrbit {
  aAu: number;
  e: number;
  iRad: number;
  ascendingNodeRad: number;
  argPeriapsisRad: number;
  meanAnomalyRad: number;
  meanMotionRadPerDay: number;
  aRateAuPerDay: number;
  eRatePerDay: number;
  iRateRadPerDay: number;
  ascendingNodeRateRadPerDay: number;
  argPeriapsisRateRadPerDay: number;
  periodDays: number;
  centuriesSinceEpoch: number;
}

function magnitude(vector: CartesianVector): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function dot(a: CartesianVector, b: CartesianVector): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: CartesianVector, b: CartesianVector): CartesianVector {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function normalize(vector: CartesianVector, label: string): CartesianVector {
  const length = magnitude(vector);
  if (!Number.isFinite(length) || length < MIN_VECTOR_MAGNITUDE) {
    throw new RangeError(`${label} must be a finite, non-zero vector`);
  }
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

/**
 * Builds the source axes used by JPL's satellite element tables.
 *
 * `sourcePoleEcliptic` is the Laplace/equatorial pole in ecliptic-J2000
 * coordinates. `longitudeReferencePoleEcliptic` is the pole of the plane from
 * whose ascending node source-frame longitudes are measured.  For the JPL mean
 * satellite tables this is the Earth mean equator of J2000, whose pole in
 * ecliptic coordinates is `(0, sin(epsilon), cos(epsilon))`.
 */
export function createSourceFrameBasis(
  sourcePoleEcliptic: CartesianVector,
  longitudeReferencePoleEcliptic: CartesianVector
): SourceFrameBasis {
  const z = normalize(sourcePoleEcliptic, 'source-frame pole');
  const referencePole = normalize(longitudeReferencePoleEcliptic, 'longitude-reference pole');
  const node = cross(referencePole, z);

  // Parallel planes have no unique node line.  Project a stable inertial axis
  // into the source plane instead of returning a numerically arbitrary axis.
  let x: CartesianVector;
  if (magnitude(node) < 1e-12) {
    const candidate = Math.abs(z.x) < 0.9
      ? { x: 1, y: 0, z: 0 }
      : { x: 0, y: 1, z: 0 };
    const projection = dot(candidate, z);
    x = normalize(
      {
        x: candidate.x - projection * z.x,
        y: candidate.y - projection * z.y,
        z: candidate.z - projection * z.z
      },
      'source-frame x axis'
    );
  } else {
    x = normalize(node, 'source-frame node axis');
  }

  const y = normalize(cross(z, x), 'source-frame y axis');
  return { x, y, z };
}

function normalizeRadians(angle: number): number {
  const reduced = angle % TWO_PI;
  return reduced < 0 ? reduced + TWO_PI : reduced;
}

function solveKepler(meanAnomalyRad: number, eccentricity: number): number {
  let eccentricAnomaly = eccentricity < 0.8 ? meanAnomalyRad : Math.PI;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const delta =
      (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomalyRad) /
      (1 - eccentricity * Math.cos(eccentricAnomaly));
    eccentricAnomaly -= delta;
    if (Math.abs(delta) < 1e-13) break;
  }
  return eccentricAnomaly;
}

function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`);
  }
  return value;
}

/**
 * Integral of n(t) for a linearly drifting semimajor axis and Kepler's
 * n proportional to a^(-3/2).  `expm1(log1p())` avoids cancellation when the
 * fractional drift is tiny.
 */
function integratedMeanMotion(
  baseMeanMotionRadPerDay: number,
  baseAAu: number,
  aRateAuPerDay: number,
  elapsedDays: number
): number {
  if (aRateAuPerDay === 0 || elapsedDays === 0) {
    return baseMeanMotionRadPerDay * elapsedDays;
  }

  const relativeChange = (aRateAuPerDay * elapsedDays) / baseAAu;
  if (relativeChange <= -1) {
    throw new RangeError('semimajor-axis drift reaches a non-positive value');
  }

  const oneMinusInverseSqrt = -Math.expm1(-0.5 * Math.log1p(relativeChange));
  return (2 * baseMeanMotionRadPerDay * baseAAu * oneMinusInverseSqrt) / aRateAuPerDay;
}

export function resolveSourceFrameOrbitAtElapsedDays(
  orbit: SourceFrameKeplerOrbit,
  elapsedDays: number
): ResolvedSourceFrameOrbit {
  requireFinite(elapsedDays, 'elapsed days');

  const baseA = requireFinite(orbit.aAu, 'semimajor axis');
  const baseE = requireFinite(orbit.e ?? 0, 'eccentricity');
  const basePeriodDays = requireFinite(orbit.periodDays, 'period');
  if (baseA <= 0 || basePeriodDays <= 0 || baseE < 0 || baseE >= 1) {
    throw new RangeError('source-frame orbit requires a > 0, period > 0 and 0 <= e < 1');
  }

  const rates = orbit.secularRates;
  const centuriesSinceEpoch = elapsedDays / JULIAN_CENTURY_DAYS;
  const aRateAuPerDay = (rates?.aAuPerCentury ?? 0) / JULIAN_CENTURY_DAYS;
  const eRatePerDay = (rates?.ePerCentury ?? 0) / JULIAN_CENTURY_DAYS;
  const iRateRadPerDay = ((rates?.iDegPerCentury ?? 0) * DEG_TO_RAD) / JULIAN_CENTURY_DAYS;
  const ascendingNodeRateRadPerDay =
    ((rates?.ascendingNodeDegPerCentury ?? 0) * DEG_TO_RAD) / JULIAN_CENTURY_DAYS;
  const argPeriapsisRateRadPerDay =
    ((rates?.argPeriapsisDegPerCentury ?? 0) * DEG_TO_RAD) / JULIAN_CENTURY_DAYS;

  const aAu = baseA + aRateAuPerDay * elapsedDays;
  const e = baseE + eRatePerDay * elapsedDays;
  if (aAu <= 0 || e < 0 || e >= 1) {
    throw new RangeError('secular drift produced an invalid elliptic orbit');
  }

  const iRad = (orbit.iDeg ?? 0) * DEG_TO_RAD + iRateRadPerDay * elapsedDays;
  const ascendingNodeRad =
    (orbit.ascendingNodeDeg ?? 0) * DEG_TO_RAD + ascendingNodeRateRadPerDay * elapsedDays;
  const argPeriapsisRad =
    (orbit.argPeriapsisDeg ?? 0) * DEG_TO_RAD + argPeriapsisRateRadPerDay * elapsedDays;
  const periodDays = basePeriodDays * Math.pow(aAu / baseA, 1.5);

  const baseMeanMotionRadPerDay = TWO_PI / basePeriodDays;
  const currentPeriodMotionRadPerDay = TWO_PI / periodDays;
  const varpiRateRadPerDay = ascendingNodeRateRadPerDay + argPeriapsisRateRadPerDay;
  const configuredMeanLongitudeRate = rates?.meanLongitudeDegPerCentury;
  let meanMotionRadPerDay: number;
  let meanAnomalyAdvance: number;

  if (configuredMeanLongitudeRate !== undefined) {
    const meanLongitudeRateRadPerDay =
      (configuredMeanLongitudeRate * DEG_TO_RAD) / JULIAN_CENTURY_DAYS;
    meanMotionRadPerDay = meanLongitudeRateRadPerDay - varpiRateRadPerDay;
    meanAnomalyAdvance = meanMotionRadPerDay * elapsedDays;
  } else {
    const periodAdvance = integratedMeanMotion(
      baseMeanMotionRadPerDay,
      baseA,
      aRateAuPerDay,
      elapsedDays
    );
    if (rates?.periodIsMeanLongitudePeriod) {
      meanMotionRadPerDay = currentPeriodMotionRadPerDay - varpiRateRadPerDay;
      meanAnomalyAdvance = periodAdvance - varpiRateRadPerDay * elapsedDays;
    } else {
      meanMotionRadPerDay = currentPeriodMotionRadPerDay;
      meanAnomalyAdvance = periodAdvance;
    }
  }

  return {
    aAu,
    e,
    iRad,
    ascendingNodeRad,
    argPeriapsisRad,
    meanAnomalyRad: normalizeRadians((orbit.meanAnomalyDeg ?? 0) * DEG_TO_RAD + meanAnomalyAdvance),
    meanMotionRadPerDay,
    aRateAuPerDay,
    eRatePerDay,
    iRateRadPerDay,
    ascendingNodeRateRadPerDay,
    argPeriapsisRateRadPerDay,
    periodDays,
    centuriesSinceEpoch
  };
}

function rotateZ(vector: CartesianVector, angle: number): CartesianVector {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: cosine * vector.x - sine * vector.y,
    y: sine * vector.x + cosine * vector.y,
    z: vector.z
  };
}

function rotateX(vector: CartesianVector, angle: number): CartesianVector {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: vector.x,
    y: cosine * vector.y - sine * vector.z,
    z: sine * vector.y + cosine * vector.z
  };
}

function add(a: CartesianVector, b: CartesianVector): CartesianVector {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(vector: CartesianVector, scalar: number): CartesianVector {
  return { x: scalar * vector.x, y: scalar * vector.y, z: scalar * vector.z };
}

function transformByBasis(vector: CartesianVector, basis: SourceFrameBasis): CartesianVector {
  return {
    x: basis.x.x * vector.x + basis.y.x * vector.y + basis.z.x * vector.z,
    y: basis.x.y * vector.x + basis.y.y * vector.y + basis.z.y * vector.z,
    z: basis.x.z * vector.x + basis.y.z * vector.y + basis.z.z * vector.z
  };
}

/**
 * Propagates the precessing ellipse in its native source frame, then transforms
 * its Cartesian state to ecliptic J2000.
 *
 * Velocity is the analytic derivative of the same position model.  In addition
 * to Keplerian motion it includes da/dt, de/dt, di/dt, dOmega/dt and domega/dt.
 * Omitting the last three terms makes position and velocity describe different
 * curves and corrupts the orbit normal inferred from r x v.
 */
export function propagateSourceFrameOrbit(
  orbit: SourceFrameKeplerOrbit,
  elapsedDays: number,
  outPosition: SettableCartesianVector,
  outVelocity: SettableCartesianVector | null = null
): void {
  const resolved = resolveSourceFrameOrbitAtElapsedDays(orbit, elapsedDays);
  const eccentricAnomaly = solveKepler(resolved.meanAnomalyRad, resolved.e);
  const cosineE = Math.cos(eccentricAnomaly);
  const sineE = Math.sin(eccentricAnomaly);
  const beta = Math.sqrt(1 - resolved.e * resolved.e);
  const keplerDenominator = 1 - resolved.e * cosineE;

  const perifocalPosition: CartesianVector = {
    x: resolved.aAu * (cosineE - resolved.e),
    y: resolved.aAu * beta * sineE,
    z: 0
  };

  const afterPeriapsis = rotateZ(perifocalPosition, resolved.argPeriapsisRad);
  const afterInclination = rotateX(afterPeriapsis, resolved.iRad);
  const sourcePosition = rotateZ(afterInclination, resolved.ascendingNodeRad);
  const eclipticPosition = transformByBasis(sourcePosition, orbit.sourceFrameBasis);
  outPosition.set(eclipticPosition.x, eclipticPosition.y, eclipticPosition.z);

  if (!outVelocity) {
    return;
  }

  // Differentiate M = E - e sin(E), including a secular eccentricity rate.
  const eccentricAnomalyRate =
    (resolved.meanMotionRadPerDay + resolved.eRatePerDay * sineE) / keplerDenominator;
  const betaRate = beta > 0 ? (-resolved.e * resolved.eRatePerDay) / beta : 0;
  const perifocalVelocity: CartesianVector = {
    x:
      resolved.aRateAuPerDay * (cosineE - resolved.e) +
      resolved.aAu * (-sineE * eccentricAnomalyRate - resolved.eRatePerDay),
    y:
      resolved.aRateAuPerDay * beta * sineE +
      resolved.aAu * (betaRate * sineE + beta * cosineE * eccentricAnomalyRate),
    z: 0
  };

  // Product-rule derivative of Rz(Omega) Rx(i) Rz(omega) r_pf.  Each
  // cross-product term is the velocity of the corresponding rotating frame.
  const velocityAfterPeriapsis = add(
    rotateZ(perifocalVelocity, resolved.argPeriapsisRad),
    scale(cross({ x: 0, y: 0, z: 1 }, afterPeriapsis), resolved.argPeriapsisRateRadPerDay)
  );
  const velocityAfterInclination = add(
    rotateX(velocityAfterPeriapsis, resolved.iRad),
    scale(cross({ x: 1, y: 0, z: 0 }, afterInclination), resolved.iRateRadPerDay)
  );
  const sourceVelocity = add(
    rotateZ(velocityAfterInclination, resolved.ascendingNodeRad),
    scale(cross({ x: 0, y: 0, z: 1 }, sourcePosition), resolved.ascendingNodeRateRadPerDay)
  );
  const eclipticVelocity = transformByBasis(sourceVelocity, orbit.sourceFrameBasis);
  outVelocity.set(eclipticVelocity.x, eclipticVelocity.y, eclipticVelocity.z);
}

/** Geometric orbit normal after source-frame precession, expressed ecliptically. */
export function sourceFrameOrbitNormalEcliptic(
  orbit: SourceFrameKeplerOrbit,
  elapsedDays: number
): CartesianVector {
  const resolved = resolveSourceFrameOrbitAtElapsedDays(orbit, elapsedDays);
  const sourceNormal = {
    x: Math.sin(resolved.ascendingNodeRad) * Math.sin(resolved.iRad),
    y: -Math.cos(resolved.ascendingNodeRad) * Math.sin(resolved.iRad),
    z: Math.cos(resolved.iRad)
  };
  return normalize(transformByBasis(sourceNormal, orbit.sourceFrameBasis), 'ecliptic orbit normal');
}
