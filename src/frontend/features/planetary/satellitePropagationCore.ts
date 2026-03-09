import { AU_KM } from '../../../constants';
import { solveKepler } from '../../../sim/orbitMath';

const TWO_PI = Math.PI * 2;
const DAY_SECONDS = 86_400;
const DEG_TO_RAD = Math.PI / 180;

export interface PrimaryModel {
  id: string;
  muKm3S2: number;
  j2: number;
  equatorialRadiusKm: number;
  obliquityRad: number;
}

export interface PropagatedSatellite {
  epochJd: number;
  aKm: number;
  e: number;
  iRad: number;
  raanRad: number;
  argPeriapsisRad: number;
  meanAnomalyRad: number;
  meanMotionRadSec: number;
  frame: string;
}

export interface MutableVec3Like {
  x: number;
  y: number;
  z: number;
  set: (x: number, y: number, z: number) => unknown;
}

export const PRIMARY_MODELS: Record<string, PrimaryModel> = {
  earth: {
    id: 'earth',
    muKm3S2: 398_600.4418,
    j2: 1.08262668e-3,
    equatorialRadiusKm: 6_378.137,
    obliquityRad: 23.439291111 * DEG_TO_RAD
  },
  moon: {
    id: 'moon',
    muKm3S2: 4_902.800066,
    j2: 2.032e-4,
    equatorialRadiusKm: 1_738.1,
    obliquityRad: 1.5424 * DEG_TO_RAD
  },
  mars: {
    id: 'mars',
    muKm3S2: 42_828.375214,
    j2: 1.96045e-3,
    equatorialRadiusKm: 3_396.19,
    obliquityRad: 25.19 * DEG_TO_RAD
  }
};

export function createMutableVec3(x = 0, y = 0, z = 0): MutableVec3Like {
  return {
    x,
    y,
    z,
    set(nextX: number, nextY: number, nextZ: number) {
      this.x = nextX;
      this.y = nextY;
      this.z = nextZ;
      return this;
    }
  };
}

export function normalizeRadians(angle: number): number {
  const wrapped = angle % TWO_PI;
  return wrapped >= 0 ? wrapped : wrapped + TWO_PI;
}

export function meanMotionFromSemimajorAxis(aKm: number, muKm3S2: number): number {
  const nRadSec = Math.sqrt(muKm3S2 / (aKm * aKm * aKm));
  return (nRadSec * DAY_SECONDS) / TWO_PI;
}

export function semimajorAxisFromMeanMotion(meanMotionRevDay: number, muKm3S2: number): number {
  const nRadSec = (meanMotionRevDay * TWO_PI) / DAY_SECONDS;
  return Math.cbrt(muKm3S2 / (nRadSec * nRadSec));
}

export function toEcliptic(
  primaryModel: PrimaryModel,
  frame: string,
  xPrimary: number,
  yPrimary: number,
  zPrimary: number,
  out: MutableVec3Like
): MutableVec3Like {
  if (frame === 'ecliptic') {
    out.set(xPrimary / AU_KM, yPrimary / AU_KM, zPrimary / AU_KM);
    return out;
  }

  const obliquity = Number.isFinite(primaryModel.obliquityRad) ? primaryModel.obliquityRad : 0;
  const cosOb = Math.cos(obliquity);
  const sinOb = Math.sin(obliquity);
  const y = cosOb * yPrimary + sinOb * zPrimary;
  const z = -sinOb * yPrimary + cosOb * zPrimary;
  out.set(xPrimary / AU_KM, y / AU_KM, z / AU_KM);
  return out;
}

export function propagateAroundPrimary(
  satellite: PropagatedSatellite,
  jd: number,
  applyJ2: boolean,
  primaryModel: PrimaryModel,
  outPositionAu: MutableVec3Like
): MutableVec3Like {
  const dtSec = (jd - satellite.epochJd) * DAY_SECONDS;

  const e = satellite.e;
  const i = satellite.iRad;
  const a = satellite.aKm;
  const n = satellite.meanMotionRadSec;

  let raan = satellite.raanRad;
  let argPeriapsis = satellite.argPeriapsisRad;
  let meanAnomaly = satellite.meanAnomalyRad + n * dtSec;

  if (applyJ2 && Number.isFinite(primaryModel.j2) && primaryModel.j2 > 0) {
    const p = a * (1 - e * e);
    const pRatio2 = (primaryModel.equatorialRadiusKm * primaryModel.equatorialRadiusKm) / (p * p);
    const j2Factor = 1.5 * primaryModel.j2 * pRatio2 * n;
    const cosI = Math.cos(i);
    const cosI2 = cosI * cosI;

    const raanDot = -j2Factor * cosI;
    const argDot = 0.5 * j2Factor * (5 * cosI2 - 1);
    const mDotJ2 = 0.5 * j2Factor * Math.sqrt(Math.max(1e-9, 1 - e * e)) * (3 * cosI2 - 1);

    raan += raanDot * dtSec;
    argPeriapsis += argDot * dtSec;
    meanAnomaly += mDotJ2 * dtSec;
  }

  const eccentricAnomaly = solveKepler(normalizeRadians(meanAnomaly), e, 1e-9, 24);
  const cosE = Math.cos(eccentricAnomaly);
  const sinE = Math.sin(eccentricAnomaly);
  const sqrtOneMinusESquared = Math.sqrt(Math.max(1e-9, 1 - e * e));

  const xPerifocal = a * (cosE - e);
  const yPerifocal = a * (sqrtOneMinusESquared * sinE);

  const cosO = Math.cos(raan);
  const sinO = Math.sin(raan);
  const cosW = Math.cos(argPeriapsis);
  const sinW = Math.sin(argPeriapsis);
  const cosI = Math.cos(i);
  const sinI = Math.sin(i);

  const r11 = cosO * cosW - sinO * sinW * cosI;
  const r12 = -cosO * sinW - sinO * cosW * cosI;
  const r21 = sinO * cosW + cosO * sinW * cosI;
  const r22 = -sinO * sinW + cosO * cosW * cosI;
  const r31 = sinW * sinI;
  const r32 = cosW * sinI;

  const xPrimary = r11 * xPerifocal + r12 * yPerifocal;
  const yPrimary = r21 * xPerifocal + r22 * yPerifocal;
  const zPrimary = r31 * xPerifocal + r32 * yPerifocal;

  return toEcliptic(primaryModel, satellite.frame, xPrimary, yPrimary, zPrimary, outPositionAu);
}
