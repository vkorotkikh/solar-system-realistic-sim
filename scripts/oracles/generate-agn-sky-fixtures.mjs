// Independent, offline oracle construction. Never imports application code or Three.js.
// Catalog input: SIMBAD ICRS ep=J2000 (radio positions), NED Maffei 1 host position.
// Frame convention: https://ssd.jpl.nasa.gov/horizons/manual.html#frames
// Fixed IAU76/80 obliquity, NOT an IAU2006/of-date/apparent-place transformation.
import { writeFileSync } from 'node:fs';

const rad = Math.PI / 180;
const epsilon = 84381.448 / 3600 * rad;
const inputs = [
  ['SagittariusA', [17, 45, 40.03599], [-29, 0, 28.1699], 'https://simbad.cds.unistra.fr/simbad/sim-id?Ident=Sagittarius+A%2A', '2011AJ....142...35P'],
  ['CentaurusA', [13, 25, 27.61521044], [-43, 1, 8.8050291], 'https://simbad.cds.unistra.fr/simbad/sim-id?Ident=NGC5128', '2020A&A...644A.159C'],
  ['Maffei1', [2, 36, 35.5], [59, 39, 18.6], 'https://ned.ipac.caltech.edu/level5/NED1D/ned1d.html', 'NED-1D host-galaxy position; not SMBH astrometry'],
  ['M87', [12, 30, 49.42338414], [12, 23, 28.0436859], 'https://simbad.cds.unistra.fr/simbad/sim-id?Ident=M87', '2020A&A...644A.159C'],
];
const sources = inputs.map(([key, hms, dms, reference, provenance]) => {
  const raDeg = (hms[0] + hms[1] / 60 + hms[2] / 3600) * 15;
  const decDeg = Math.sign(dms[0]) * (Math.abs(dms[0]) + dms[1] / 60 + dms[2] / 3600);
  const a = raDeg * rad;
  const d = decDeg * rad;
  // Spherical longitude/latitude construction, independent of the application's
  // Cartesian rotation implementation. Quadrants are preserved by atan2.
  const longitude = Math.atan2(Math.sin(a) * Math.cos(epsilon) + Math.tan(d) * Math.sin(epsilon), Math.cos(a));
  const latitude = Math.asin(Math.sin(d) * Math.cos(epsilon) - Math.cos(d) * Math.sin(epsilon) * Math.sin(a));
  const direction = [Math.cos(latitude) * Math.cos(longitude), Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude)];
  const [x, y, z] = direction.map(component => component * 4);
  // Literal camera specification: 256px square, top orthographic +/-8; or
  // perspective 60deg at (0,-12,9), z-up, looking at origin. Eye basis is
  // right=(1,0,0), up=(0,.6,.8), back=(0,-.8,.6), eye distance=15.
  const depth = 15 + 0.8 * y - 0.6 * z;
  const focalPixels = 128 * Math.sqrt(3);
  return { key, raDeg, decDeg, reference, provenance, direction,
    eclipticLongitudeDeg: (longitude / rad + 360) % 360, eclipticLatitudeDeg: latitude / rad,
    topPixel: [128 + 16 * x, 128 - 16 * y],
    obliquePixel: [128 + focalPixels * x / depth, 128 - focalPixels * (0.6 * y + 0.8 * z) / depth] };
});
const fixture = { frame: 'ICRS catalog bearing rotated to fixed J2000 ecliptic; x=equinox, z=ecliptic north',
  obliquityArcsec: 84381.448, frameReference: 'https://ssd.jpl.nasa.gov/horizons/manual.html#frames',
  capturedDate: '2026-10-14', viewport: [256, 256], markerRadius: 4,
  limits: 'Direction/projection fixtures, not measured source distances, apparent places, GW amplitudes, or evidence for H29.', sources };
writeFileSync(new URL('../fixtures/agn-sky-j2000.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
