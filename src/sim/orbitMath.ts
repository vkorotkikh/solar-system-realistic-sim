import { Vector3 } from 'three';

const TWO_PI = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;
const JULIAN_CENTURY_DAYS = 36_525;

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
}

export interface KeplerOrbitSecularRates {
  aAuPerCentury?: number;
  ePerCentury?: number;
  iDegPerCentury?: number;
  ascendingNodeDegPerCentury?: number;
  argPeriapsisDegPerCentury?: number;
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
   * Kepler solution and the velocity formula must use; it equals 2*pi/periodDays only on the legacy
   * path, and equals (Ldot - varpidot) when secular mean-longitude data is supplied.
   */
  meanMotionRadPerDay: number;
  centuriesSinceEpoch: number;
}

export function degToRad(deg: number): number {
  return deg * DEG_TO_RAD;
}

function normalizeRadians(angle: number): number {
  const reduced = angle % TWO_PI;
  return reduced >= 0 ? reduced : reduced + TWO_PI;
}

export function solveKeplerFast(M: number, e: number): number {
  let E = M;
  for (let i = 0; i < 6; i++) {
    E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
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
  const centuriesSinceEpoch = elapsedDays / JULIAN_CENTURY_DAYS;
  const secularRates = orbit.secularRates;
  const baseA = Math.max(1e-9, orbit.aAu);
  const a = Math.max(1e-9, baseA + (secularRates?.aAuPerCentury ?? 0) * centuriesSinceEpoch);
  const e = clampEccentricity((orbit.e ?? 0) + (secularRates?.ePerCentury ?? 0) * centuriesSinceEpoch);
  const iRad = degToRad((orbit.iDeg ?? 0) + (secularRates?.iDegPerCentury ?? 0) * centuriesSinceEpoch);
  const ascendingNodeRad = degToRad(
    (orbit.ascendingNodeDeg ?? 0) + (secularRates?.ascendingNodeDegPerCentury ?? 0) * centuriesSinceEpoch
  );
  const argPeriapsisRad = degToRad(
    (orbit.argPeriapsisDeg ?? 0) + (secularRates?.argPeriapsisDegPerCentury ?? 0) * centuriesSinceEpoch
  );

  const basePeriodDays = Math.max(1e-9, orbit.periodDays);
  // periodDays keeps its established meaning (sidereal period, drifted with a) because orbit-line
  // drawing, the UI readout and the satellite code all consume it. It no longer drives the mean
  // anomaly for bodies that carry a tabulated mean-longitude rate.
  const periodDays = basePeriodDays * Math.pow(a / baseA, 1.5);

  const meanLongitudeRate = secularRates?.meanLongitudeDegPerCentury;
  let meanMotionRadPerDay: number;
  let meanAnomalyRad: number;

  if (meanLongitudeRate === undefined) {
    // Legacy path, bit-for-bit unchanged for every body without a mean-longitude rate
    // (moons, Kuiper-belt objects, asteroids, Pluto).
    meanMotionRadPerDay = TWO_PI / periodDays;
    meanAnomalyRad = normalizeRadians(degToRad(orbit.meanAnomalyDeg ?? 0) + meanMotionRadPerDay * elapsedDays);
  } else {
    // Standish: M = L - varpi, with varpi = Omega + argPeriapsis, so dM/dt = Ldot - varpidot.
    const varpiDegPerCentury =
      (secularRates?.ascendingNodeDegPerCentury ?? 0) + (secularRates?.argPeriapsisDegPerCentury ?? 0);
    const meanAnomalyDegPerCentury = meanLongitudeRate - varpiDegPerCentury;
    meanMotionRadPerDay = degToRad(meanAnomalyDegPerCentury) / JULIAN_CENTURY_DAYS;
    // Reduce in degrees before converting, so a multi-century advance keeps full precision.
    const meanAnomalyDeg =
      ((orbit.meanAnomalyDeg ?? 0) + meanAnomalyDegPerCentury * centuriesSinceEpoch) % 360;
    meanAnomalyRad = normalizeRadians(degToRad(meanAnomalyDeg));
  }

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

export function propagateKeplerOrbit(
  orbit: KeplerOrbit,
  elapsedDays: number,
  outPosition: Vector3,
  outVelocity: Vector3 | null = null
): void {
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
