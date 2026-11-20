import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from 'three';
import type { KeplerOrbit } from '../../../sim/orbitMath';

const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;

/** The catalog's orbit-averaged density falls below 1% of its peak at 1.60 and 4.05 AU. */
export const BELT_BAND_GRID = Object.freeze({ innerAu: 1.55, outerAu: 4.15, radial: 52, azimuthal: 180 });
const { innerAu, outerAu, radial, azimuthal } = BELT_BAND_GRID;
const radialStepAu = (outerAu - innerAu) / radial;

const SAMPLES_PER_ORBIT = 24;
const MAX_ALPHA = 0.36;
const SPARSE_COLOR = new Color('#6e5a3c');
const DENSE_COLOR = new Color('#e3cb98');
/** The drawn edge is the iso-density contour at this fraction of the peak. */
const OUTLINE_LEVEL = 0.2;
const OUTLINE_SMOOTHING_COLUMNS = 3;

type BandOrbit = Pick<KeplerOrbit, 'aAu' | 'e' | 'iDeg' | 'ascendingNodeDeg' | 'argPeriapsisDeg'>;

/**
 * Surface density, in asteroids per AU², on a polar grid in the ecliptic plane.
 *
 * Each orbit is spread along its ellipse by time spent (uniform in mean anomaly),
 * not placed at its current position. Catalogued asteroids are bunched in orbital
 * phase, so a snapshot's azimuthal pattern wanders from 2% to 28% over a few years;
 * this average is what that pattern settles to once the phases mix. Kirkwood gaps
 * are gaps in semi-major axis and correctly do not appear: eccentricity fills them
 * in position space.
 */
export function beltSurfaceDensity(orbits: readonly BandOrbit[], samplesPerOrbit = SAMPLES_PER_ORBIT): Float64Array {
  const cells = new Float64Array(radial * azimuthal);
  const cosE = new Float64Array(samplesPerOrbit);
  const sinE = new Float64Array(samplesPerOrbit);
  for (let k = 0; k < samplesPerOrbit; k++) {
    const eccentricAnomaly = (TWO_PI * (k + 0.5)) / samplesPerOrbit;
    cosE[k] = Math.cos(eccentricAnomaly);
    sinE[k] = Math.sin(eccentricAnomaly);
  }

  for (const orbit of orbits) {
    const e = orbit.e ?? 0;
    const inclination = (orbit.iDeg ?? 0) * DEG;
    const node = (orbit.ascendingNodeDeg ?? 0) * DEG;
    const periapsis = (orbit.argPeriapsisDeg ?? 0) * DEG;
    const cosNode = Math.cos(node), sinNode = Math.sin(node);
    const cosPeri = Math.cos(periapsis), sinPeri = Math.sin(periapsis);
    const cosInc = Math.cos(inclination);
    const px = cosNode * cosPeri - sinNode * sinPeri * cosInc;
    const py = sinNode * cosPeri + cosNode * sinPeri * cosInc;
    const qx = -cosNode * sinPeri - sinNode * cosPeri * cosInc;
    const qy = -sinNode * sinPeri + cosNode * cosPeri * cosInc;
    const semiMinor = orbit.aAu * Math.sqrt(1 - e * e);

    for (let k = 0; k < samplesPerOrbit; k++) {
      const alongMajor = orbit.aAu * (cosE[k] - e);
      const alongMinor = semiMinor * sinE[k];
      const x = px * alongMajor + qx * alongMinor;
      const y = py * alongMajor + qy * alongMinor;
      const ring = Math.floor((Math.hypot(x, y) - innerAu) / radialStepAu);
      if (ring < 0 || ring >= radial) continue;
      const azimuth = Math.atan2(y, x);
      const column = Math.floor(((azimuth < 0 ? azimuth + TWO_PI : azimuth) / TWO_PI) * azimuthal);
      // dt/dE ∝ 1 - e cos E, so these weights sum to exactly one per orbit.
      cells[ring * azimuthal + Math.min(azimuthal - 1, column)] += (1 - e * cosE[k]) / samplesPerOrbit;
    }
  }

  for (let ring = 0; ring < radial; ring++) {
    const areaAu2 = (TWO_PI / azimuthal) * (innerAu + (ring + 0.5) * radialStepAu) * radialStepAu;
    for (let column = 0; column < azimuthal; column++) cells[ring * azimuthal + column] /= areaAu2;
  }
  return cells;
}

/** Density at the ring's vertices (peak = 1): the mean of the cells around each, zero on the rim. */
function normalizedVertexDensity(cells: Float64Array): Float64Array {
  const vertices = new Float64Array((radial + 1) * azimuthal);
  let peak = 0;
  for (let ring = 1; ring < radial; ring++) {
    for (let column = 0; column < azimuthal; column++) {
      const previous = (column + azimuthal - 1) % azimuthal;
      const value = (cells[(ring - 1) * azimuthal + previous] + cells[(ring - 1) * azimuthal + column]
        + cells[ring * azimuthal + previous] + cells[ring * azimuthal + column]) / 4;
      vertices[ring * azimuthal + column] = value;
      if (value > peak) peak = value;
    }
  }
  if (peak > 0) for (let i = 0; i < vertices.length; i++) vertices[i] /= peak;
  return vertices;
}

function contourRadiusAu(profile: Float64Array, fromInside: boolean): number | null {
  const step = fromInside ? 1 : -1;
  for (let ring = fromInside ? 0 : radial; ring >= 0 && ring + step >= 0 && ring + step <= radial; ring += step) {
    const here = profile[ring];
    const next = profile[ring + step];
    if (here < OUTLINE_LEVEL && next >= OUTLINE_LEVEL) {
      return innerAu + (ring + step * ((OUTLINE_LEVEL - here) / (next - here))) * radialStepAu;
    }
  }
  return null;
}

function outlineLoop(density: Float64Array, fromInside: boolean, material: LineBasicMaterial): LineLoop {
  const profile = new Float64Array(radial + 1);
  const positions = new Float32Array(azimuthal * 3);
  let lastRadiusAu: number = fromInside ? innerAu : outerAu;
  for (let column = 0; column < azimuthal; column++) {
    profile.fill(0);
    for (let offset = -OUTLINE_SMOOTHING_COLUMNS; offset <= OUTLINE_SMOOTHING_COLUMNS; offset++) {
      const source = (column + offset + azimuthal) % azimuthal;
      for (let ring = 0; ring <= radial; ring++) profile[ring] += density[ring * azimuthal + source];
    }
    for (let ring = 0; ring <= radial; ring++) profile[ring] /= OUTLINE_SMOOTHING_COLUMNS * 2 + 1;
    lastRadiusAu = contourRadiusAu(profile, fromInside) ?? lastRadiusAu;
    const azimuth = (column / azimuthal) * TWO_PI;
    positions[column * 3] = lastRadiusAu * Math.cos(azimuth);
    positions[column * 3 + 1] = lastRadiusAu * Math.sin(azimuth);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const line = new LineLoop(geometry, material);
  line.renderOrder = -4;
  return line;
}

/** A flat band in the ecliptic whose shading and edges both come from the measured density. */
export function createBeltDensityBand(cells: Float64Array) {
  const density = normalizedVertexDensity(cells);
  const geometry = new RingGeometry(innerAu, outerAu, azimuthal, radial);
  const colors = new Float32Array((radial + 1) * (azimuthal + 1) * 4);
  const color = new Color();
  for (let ring = 0; ring <= radial; ring++) {
    for (let column = 0; column <= azimuthal; column++) {
      const value = density[ring * azimuthal + (column % azimuthal)];
      color.copy(SPARSE_COLOR).lerp(DENSE_COLOR, value);
      const offset = (ring * (azimuthal + 1) + column) * 4;
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
      colors[offset + 3] = MAX_ALPHA * value ** 0.75;
    }
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 4));

  const surfaceMaterial = new MeshBasicMaterial({
    vertexColors: true, transparent: true, side: DoubleSide, depthWrite: false,
  });
  const surface = new Mesh(geometry, surfaceMaterial);
  surface.renderOrder = -5;

  const outlineMaterial = new LineBasicMaterial({
    color: DENSE_COLOR, transparent: true, opacity: 0.4, depthWrite: false,
  });
  const outlines = [outlineLoop(density, true, outlineMaterial), outlineLoop(density, false, outlineMaterial)] as const;

  const group = new Group();
  group.name = 'asteroid-density-band';
  group.add(surface, ...outlines);
  return {
    group,
    surface,
    outlines,
    dispose() {
      geometry.dispose();
      surfaceMaterial.dispose();
      outlineMaterial.dispose();
      for (const outline of outlines) outline.geometry.dispose();
    },
  };
}
