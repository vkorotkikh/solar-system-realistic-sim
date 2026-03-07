import { Vector3 } from 'three';

const TWO_PI = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;

export interface KeplerOrbit {
  aAu: number;
  periodDays: number;
  epochJd: number;
  e?: number;
  iDeg?: number;
  ascendingNodeDeg?: number;
  argPeriapsisDeg?: number;
  meanAnomalyDeg?: number;
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

export function propagateKeplerOrbit(
  orbit: KeplerOrbit,
  elapsedDays: number,
  outPosition: Vector3,
  outVelocity: Vector3 | null = null
): void {
  const a = orbit.aAu;
  const e = Math.max(0, Math.min(0.9999999, orbit.e ?? 0));
  const i = degToRad(orbit.iDeg ?? 0);
  const ascendingNode = degToRad(orbit.ascendingNodeDeg ?? 0);
  const argPeriapsis = degToRad(orbit.argPeriapsisDeg ?? 0);
  const meanAnomaly0 = degToRad(orbit.meanAnomalyDeg ?? 0);
  const period = orbit.periodDays;

  const meanMotion = TWO_PI / period;
  const meanAnomaly = normalizeRadians(meanAnomaly0 + meanMotion * elapsedDays);
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
