/** Catalog ICRS directions, epoch J2000. Retrieved 2026-10-14.
 * Sgr A*, Cen A and M87: CDS SIMBAD radio positions (URLs per entry).
 * Maffei 1: NASA/IPAC NED-1D, J2000 RA 02:36:35.5, Dec +59:39:18.6.
 * The directions locate the source; they do not specify the jet axis.
 */
export const SOURCE_COORDINATES = Object.freeze({
  SagittariusA: { raDeg: (17 + 45 / 60 + 40.03599 / 3600) * 15,
    decDeg: -(29 + 28.1699 / 3600), reference: 'https://simbad.cds.unistra.fr/simbad/sim-id?Ident=Sagittarius+A%2A' },
  CentaurusA: { raDeg: (13 + 25 / 60 + 27.61521044 / 3600) * 15,
    decDeg: -(43 + 1 / 60 + 8.8050291 / 3600), reference: 'https://simbad.cds.unistra.fr/simbad/sim-id?Ident=NGC5128' },
  Maffei1: { raDeg: (2 + 36 / 60 + 35.5 / 3600) * 15,
    decDeg: 59 + 39 / 60 + 18.6 / 3600, reference: 'https://ned.ipac.caltech.edu/level5/NED1D/ned1d.html' },
  M87: { raDeg: (12 + 30 / 60 + 49.42338414 / 3600) * 15,
    decDeg: 12 + 23 / 60 + 28.0436859 / 3600, reference: 'https://simbad.cds.unistra.fr/simbad/sim-id?Ident=M87' }
});

export type SourceKey = keyof typeof SOURCE_COORDINATES;

/** ICRS -> mean ecliptic J2000, z north, x equinox; same axes as model/worker.
 * Fixed IAU76/80 obliquity, 84381.448 arcsec, as used by JPL Horizons:
 * https://ssd.jpl.nasa.gov/horizons/manual.html#frames
 * No of-date precession, aberration or source proper motion is modeled here.
 */
export function sourceEclipticDirection(key: SourceKey): readonly [number, number, number] {
  const { raDeg, decDeg } = SOURCE_COORDINATES[key];
  const ra = raDeg * Math.PI / 180;
  const dec = decDeg * Math.PI / 180;
  const eps = 84381.448 / 3600 * Math.PI / 180;
  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.cos(dec) * Math.sin(ra);
  const z = Math.sin(dec);
  return Object.freeze([x, y * Math.cos(eps) + z * Math.sin(eps), z * Math.cos(eps) - y * Math.sin(eps)]);
}

/** Inversion of beta_app = beta sin(theta)/(1-beta cos(theta)).
 * Bogensberger et al. (2024), eq. 1: https://arxiv.org/html/2408.14078v1
 * A chosen inclination is a model assumption, not an additional measurement.
 */
export function intrinsicBetaForApparentSpeed(betaApp: number, thetaDeg: number): number {
  const theta = thetaDeg * Math.PI / 180;
  return betaApp / (Math.sin(theta) + betaApp * Math.cos(theta));
}
