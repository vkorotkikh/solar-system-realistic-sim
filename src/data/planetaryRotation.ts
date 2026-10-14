import { J2000_JD } from '../constants';

const DEG = Math.PI / 180;
// NAIF ECLIPJ2000: mean obliquity 84381.448 arcsec, a proper X rotation.
const OBLIQUITY = (84381.448 / 3600) * DEG;
export const IAU_ROTATION_SOURCE = 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc';

export interface IauPlanetRotation {
  poleRaDeg: number;
  poleDecDeg: number;
  primeMeridianRateDegPerDay: number;
  poleConvention: 'north' | 'positive';
  epochJd: number;
  reference: string;
}

function pole(ra: number, dec: number, rate: number, convention: 'north' | 'positive' = 'north'): IauPlanetRotation {
  return {
    poleRaDeg: ra, poleDecDeg: dec, primeMeridianRateDegPerDay: rate,
    poleConvention: convention, epochJd: J2000_JD, reference: IAU_ROTATION_SOURCE,
  };
}

function periodic(terms: readonly (readonly [number, number])[], trig: (angle: number) => number) {
  return terms.reduce((sum, [amplitude, angle]) => sum + amplitude * trig(angle * DEG), 0);
}

/**
 * Fixed J2000 poles, evaluated from NAIF pck00011 (2022-12-27), IAU 2015
 * WGCCRE; Earth is the kernel's retained IAU 2009 model. Include the J2000
 * periodic pole terms for Mars/Jupiter/Neptune, not just their constant parts.
 *
 * Planets use north of the invariable plane, independent of rotation. Venus
 * and Uranus consequently have negative dW/dt. Pluto uses the IAU positive
 * (right-hand) pole and POSITIVE dW/dt. Never negate that pole a second time.
 * See also https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/pck.html
 *
 * This is a fixed-pole display model with the kernel's mean spin rates, not a
 * true-of-date PCK evaluator, ITRF Earth orientation, or texture-meridian oracle.
 */
export const PLANETARY_ROTATION: Readonly<Record<string, IauPlanetRotation>> = {
  mercury: pole(281.0103, 61.4155, 6.1385108),
  venus: pole(272.76, 67.16, -1.4813688),
  earth: pole(0, 90, 360.9856235),
  mars: pole(
    317.269202 + periodic([[0.000068, 198.991226], [0.000238, 226.292679], [0.000052, 249.663391], [0.000009, 266.183510], [0.419057, 79.398797]], Math.sin),
    54.432516 + periodic([[0.000051, 122.433576], [0.000141, 43.058401], [0.000031, 57.663379], [0.000005, 79.476401], [1.591274, 166.325722]], Math.cos),
    350.891982443297,
  ),
  jupiter: pole(
    268.056595 + periodic([[0.000117, 99.360714], [0.000938, 175.895369], [0.001432, 300.323162], [0.000030, 114.012305], [0.002150, 49.511251]], Math.sin),
    64.495303 + periodic([[0.000050, 99.360714], [0.000404, 175.895369], [0.000617, 300.323162], [-0.000013, 114.012305], [0.000926, 49.511251]], Math.cos),
    870.536,
  ),
  saturn: pole(40.589, 83.537, 810.7939024),
  uranus: pole(257.311, -15.175, -501.1600928),
  neptune: pole(299.36 + 0.70 * Math.sin(357.85 * DEG), 43.46 - 0.51 * Math.cos(357.85 * DEG), 541.1397757),
  pluto: pole(132.993, -6.163, 56.3625225, 'positive'),
};

/** Adapt cited equatorial poles to the existing scene's ecliptic polar angles. */
export function planetaryRotationFields(id: string) {
  const iauRotation = PLANETARY_ROTATION[id];
  if (!iauRotation) throw new RangeError(`No IAU planetary pole for ${id}`);
  const ra = iauRotation.poleRaDeg * DEG;
  const dec = iauRotation.poleDecDeg * DEG;
  const x = Math.cos(dec) * Math.cos(ra);
  const equatorialY = Math.cos(dec) * Math.sin(ra);
  const equatorialZ = Math.sin(dec);
  const y = Math.cos(OBLIQUITY) * equatorialY + Math.sin(OBLIQUITY) * equatorialZ;
  const z = -Math.sin(OBLIQUITY) * equatorialY + Math.cos(OBLIQUITY) * equatorialZ;
  return {
    iauRotation,
    axialTiltDeg: Math.acos(Math.max(-1, Math.min(1, z))) / DEG,
    spinAxisLongitudeDeg: Math.atan2(y, x) / DEG,
    rotationPeriodHours: 360 * 24 / iauRotation.primeMeridianRateDegPerDay,
  };
}
