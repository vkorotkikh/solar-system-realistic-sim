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
}

export interface ResolvedKeplerOrbit {
  aAu: number;
  e: number;
  iRad: number;
  ascendingNodeRad: number;
  argPeriapsisRad: number;
  meanAnomalyRad: number;
  periodDays: number;
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
  const periodDays = basePeriodDays * Math.pow(a / baseA, 1.5);
  const meanMotion = TWO_PI / periodDays;
  const baseMeanMotion = TWO_PI / basePeriodDays;

  // Advancing the mean anomaly under secular rates needs two corrections, because
  // mean longitude L = varpi + M is the quantity the element tables actually pin
  // down, and both of the terms below would otherwise be counted twice in
  // along-track position.
  //
  // 1. varpi = ascendingNode + argPeriapsis drifts under the rates applied above,
  //    so the same drift must come out of the mean-anomaly advance. (JPL's
  //    approximate-positions scheme sidesteps this by tabulating L and deriving
  //    M = L - varpi.)
  // 2. The advance uses `baseMeanMotion`, not the `meanMotion` recomputed from the
  //    drifting semi-major axis. The tabulated mean-longitude rate already accounts
  //    for the a-drift, so re-deriving n from a(T) applies it a second time and
  //    accumulates linearly with elapsed time -- worth ~120 arcsec for Venus over
  //    only a quarter century. `meanMotion` is still used for the velocity below,
  //    where the instantaneous a is the right thing to use.
  //
  // With no secularRates both terms vanish and this reduces exactly to the previous
  // behaviour, so every moon, asteroid and KBO propagates bit-for-bit as before.
  const perihelionDriftRad =
    degToRad(
      (secularRates?.argPeriapsisDegPerCentury ?? 0) +
        (secularRates?.ascendingNodeDegPerCentury ?? 0)
    ) * centuriesSinceEpoch;

  const meanAnomalyRad = normalizeRadians(
    degToRad(orbit.meanAnomalyDeg ?? 0) + baseMeanMotion * elapsedDays - perihelionDriftRad
  );

  return {
    aAu: a,
    e,
    iRad,
    ascendingNodeRad,
    argPeriapsisRad,
    meanAnomalyRad,
    periodDays,
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
  const meanMotion = TWO_PI / resolved.periodDays;
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
