/**
 * Explicit solar geometry frames, independently checked against CSPICE N0067.
 * Primary source: NAIF pck00011.tpc BODY10_{POLE_RA,POLE_DEC,PM}.
 * ECLIPJ2000 uses the fixed 84381.448 arcsecond J2000 obliquity.
 * Epoch arguments are JDTDB, never Unix time, elapsed render time, or UTC JD.
 */
import { Matrix4, Object3D, Vector3 } from 'three';

export type SolarFrame = 'IAU_SUN' | 'SOLAR_EQUATORIAL_J2000';
export interface SolarFrameContext {
  inputFrame: SolarFrame;
  jdTdb: number;
}

const DEG = Math.PI / 180;
const J2000 = 2451545;
const RATE_DEG_DAY = 14.1844;
const EQUATORIAL_TO_ECLIPTIC = new Matrix4().makeRotationX(-84381.448 / 3600 * DEG);
const SURFACE_LOCAL_TO_BODY = new Matrix4().set(
  1, 0, 0, 0,
  0, 0, -1, 0,
  0, 1, 0, 0,
  0, 0, 0, 1
);

function phase(jdTdb: number): number {
  const angle = RATE_DEG_DAY * (jdTdb - J2000);
  if (!Number.isFinite(jdTdb) || !Number.isFinite(angle)) {
    throw new RangeError('Solar frame epoch must be finite JDTDB');
  }
  return angle;
}

/** Right-handed rotation from the declared z-up solar frame into ECLIPJ2000. */
export function solarFrameToEclipticMatrix(frame: SolarFrame, jdTdb: number): Matrix4 {
  const elapsedPhase = phase(jdTdb);
  if (frame !== 'IAU_SUN' && frame !== 'SOLAR_EQUATORIAL_J2000') {
    throw new RangeError('Solar coordinate frame must be explicit');
  }
  const alpha = 286.13 * DEG;
  const delta = 63.87 * DEG;
  const w = ((84.176 + (frame === 'IAU_SUN' ? elapsedPhase : 0)) % 360) * DEG;
  const node = new Vector3(-Math.sin(alpha), Math.cos(alpha), 0);
  const pole = new Vector3(Math.cos(delta)*Math.cos(alpha), Math.cos(delta)*Math.sin(alpha), Math.sin(delta));
  const transverse = pole.clone().cross(node);
  const x = node.clone().multiplyScalar(Math.cos(w)).addScaledVector(transverse, Math.sin(w));
  const y = node.clone().multiplyScalar(-Math.sin(w)).addScaledVector(transverse, Math.cos(w));
  const equatorial = new Matrix4().makeBasis(x, y, pole);
  return EQUATORIAL_TO_ECLIPTIC.clone().multiply(equatorial);
}

/** The sphere shader's +Y is north; positive body longitude points toward -Z. */
export function solarSurfaceToEclipticMatrix(jdTdb: number): Matrix4 {
  return solarFrameToEclipticMatrix('IAU_SUN', jdTdb).multiply(SURFACE_LOCAL_TO_BODY);
}

/**
 * Convert an already-evolved backend vector to the rotating surface's local
 * coordinates. Removing rigid phase here prevents double rotation when the
 * surface receives its IAU orientation. Differential rotation is not removed.
 */
export function solarVectorToSurfaceLocal(vector: readonly number[], frame: SolarFrame, jdTdb: number): Vector3 {
  if (vector.length !== 3 || !vector.every(Number.isFinite)) {
    throw new RangeError('Solar vector must contain three finite coordinates');
  }
  const elapsedPhase = phase(jdTdb);
  if (frame !== 'IAU_SUN' && frame !== 'SOLAR_EQUATORIAL_J2000') {
    throw new RangeError('Solar coordinate frame must be explicit');
  }
  const point = new Vector3(vector[0], vector[1], vector[2]);
  if (frame === 'SOLAR_EQUATORIAL_J2000') {
    point.applyAxisAngle(new Vector3(0, 0, 1), -(elapsedPhase % 360)*DEG);
  }
  return new Vector3(point.x, point.z, -point.y);
}

/**
 * Orient z-up geometry under an ECLIPJ2000-aligned Sun-translation parent.
 * Do NOT put this object under a second tilted/spinning surface parent.
 * Translation/scale are deliberately preserved. Legacy callers must opt in
 * with a declared input frame; unknown observed-map frames are not guessed.
 */
export function applySolarGeometryFrame(object: Object3D, context: SolarFrameContext): void {
  object.quaternion.setFromRotationMatrix(solarFrameToEclipticMatrix(context.inputFrame, context.jdTdb));
  object.userData.lockBodySpin = true;
  object.userData.solarInputFrame = context.inputFrame;
  object.userData.solarOutputFrame = 'ECLIPJ2000';
  object.userData.solarFrameEpochJdTdb = context.jdTdb;
}
