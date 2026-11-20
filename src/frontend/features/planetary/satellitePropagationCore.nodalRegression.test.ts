import { describe, expect, it } from 'vitest';
import {
  createMutableVec3, PRIMARY_MODELS, propagateAroundPrimary, type PropagatedSatellite,
} from './satellitePropagationCore';

// Independent oracle for the J2 secular drift: the first-order nodal regression of a circular orbit,
//   dOmega/dt = -1.5 n J2 (R/a)^2 cos(i)
// with the standard Earth constants (EGM2008 / WGS-84: mu 398600.4418 km3/s2, R 6378.137 km, J2 1.08262668e-3),
// written out here rather than read from PRIMARY_MODELS so that a changed model constant is caught.
const MU = 398_600.4418;
const R = 6_378.137;
const J2 = 1.08262668e-3;
const DAY_S = 86_400;
const RAD = Math.PI / 180;

function circular(altitudeKm: number, inclinationDeg: number): PropagatedSatellite {
  const aKm = R + altitudeKm;
  return {
    epochJd: 2_460_000.5, aKm, e: 0, iRad: inclinationDeg * RAD, raanRad: 1.1, argPeriapsisRad: 0,
    meanAnomalyRad: 0.4, meanMotionRadSec: Math.sqrt(MU / aKm ** 3), frame: 'ecliptic',
  };
}

/** Right ascension of the ascending node, from the orbit normal r(t) x r(t+1 s). */
function raanAt(satellite: PropagatedSatellite, jd: number): number {
  const at = (t: number) => {
    const p = propagateAroundPrimary(satellite, t, true, PRIMARY_MODELS.earth, createMutableVec3());
    return [p.x, p.y, p.z];
  };
  const [a, b] = [at(jd), at(jd + 1 / DAY_S)];
  const nx = a[1] * b[2] - a[2] * b[1];
  const ny = a[2] * b[0] - a[0] * b[2];
  return Math.atan2(nx, -ny);
}

/** Node drift over one day in degrees, wrapped to (-180, 180]. */
function nodalDriftDegPerDay(satellite: PropagatedSatellite): number {
  const delta = raanAt(satellite, satellite.epochJd + 1) - raanAt(satellite, satellite.epochJd);
  return Math.atan2(Math.sin(delta), Math.cos(delta)) / RAD;
}

function closedFormDegPerDay(satellite: PropagatedSatellite): number {
  return (-1.5 * satellite.meanMotionRadSec * J2 * (R / satellite.aKm) ** 2 * Math.cos(satellite.iRad) * DAY_S) / RAD;
}

describe('J2 nodal regression of a circular Earth orbit', () => {
  it('regresses the ISS orbit (420 km, 51.64 deg) westward by about 5 degrees per day, as the closed form says', () => {
    const iss = circular(420, 51.64);
    const drift = nodalDriftDegPerDay(iss);
    expect(drift).toBeLessThan(0);
    expect(drift).toBeCloseTo(closedFormDegPerDay(iss), 2);
    expect(Math.abs(drift)).toBeGreaterThan(4.8);
    expect(Math.abs(drift)).toBeLessThan(5.1);
  });

  it('precesses a retrograde orbit eastward, and a 700 km, 98.19 deg orbit keeps pace with the Sun (360 deg per tropical year)', () => {
    const sunSynchronous = circular(700, 98.19);
    const sunRateDegPerDay = 360 / 365.2422;
    const drift = nodalDriftDegPerDay(sunSynchronous);
    expect(drift).toBeGreaterThan(0);
    expect(drift / sunRateDegPerDay).toBeCloseTo(1, 2);
  });

  it('does not precess the node of a polar orbit', () => {
    expect(nodalDriftDegPerDay(circular(800, 90))).toBeCloseTo(0, 6);
  });
});
