import { describe, expect, it } from 'vitest';
import { BELT_BAND_GRID, beltSurfaceDensity, createBeltDensityBand } from './beltDensityBand';

const { innerAu, outerAu, radial, azimuthal } = BELT_BAND_GRID;
const dr = (outerAu - innerAu) / radial;
const cellAreaAu2 = (r: number) => (2 * Math.PI / azimuthal) * (innerAu + (r + 0.5) * dr) * dr;
const orbit = (aAu: number, e = 0, iDeg = 0, ascendingNodeDeg = 0, argPeriapsisDeg = 0) =>
  ({ aAu, e, iDeg, ascendingNodeDeg, argPeriapsisDeg });

/** Asteroids in the cells selected by `keep(radialIndex, azimuthCentreRad)`. */
function count(cells: Float64Array, keep: (r: number, az: number) => boolean = () => true) {
  let sum = 0;
  for (let r = 0; r < radial; r++) {
    for (let a = 0; a < azimuthal; a++) {
      if (keep(r, ((a + 0.5) / azimuthal) * 2 * Math.PI)) sum += cells[r * azimuthal + a] * cellAreaAu2(r);
    }
  }
  return sum;
}

describe('beltSurfaceDensity', () => {
  it('puts a circular orbit in one radial ring, evenly around it', () => {
    const ringCentreAu = innerAu + 21.5 * dr;
    const cells = beltSurfaceDensity([orbit(ringCentreAu)], 720);
    expect(count(cells)).toBeCloseTo(1, 10);
    expect(count(cells, (r) => r === 21)).toBeCloseTo(1, 10);
    expect(count(cells, (r, az) => r === 21 && az < Math.PI)).toBeCloseTo(0.5, 2);
  });

  it('weights an eccentric orbit by time spent, per the Kepler equation', () => {
    const e = 0.2;
    const cells = beltSurfaceDensity([orbit(2.6, e)], 7200);
    // Perihelion is on +x. x < 0 holds for cos E < e, so M = E - e sin E gives its time share.
    const E0 = Math.acos(e);
    expect(count(cells, (_r, az) => Math.cos(az) < 0)).toBeCloseTo(1 - (E0 - e * Math.sin(E0)) / Math.PI, 2);
  });

  it('rotates the apsides with the node and the argument of periapsis', () => {
    const apheliaDirectionDeg = (nodeDeg: number, periDeg: number) => {
      const cells = beltSurfaceDensity([orbit(2.6, 0.2, 0, nodeDeg, periDeg)], 7200);
      const outermostRings = Math.floor((3.0 - innerAu) / dr);
      let x = 0, y = 0;
      for (let r = outermostRings; r < radial; r++) {
        for (let a = 0; a < azimuthal; a++) {
          const az = ((a + 0.5) / azimuthal) * 2 * Math.PI;
          x += cells[r * azimuthal + a] * cellAreaAu2(r) * Math.cos(az);
          y += cells[r * azimuthal + a] * cellAreaAu2(r) * Math.sin(az);
        }
      }
      return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    };
    expect(apheliaDirectionDeg(0, 0)).toBeCloseTo(180, 0);
    expect(apheliaDirectionDeg(90, 0)).toBeCloseTo(270, 0);
    expect(apheliaDirectionDeg(0, 90)).toBeCloseTo(270, 0);
    expect(apheliaDirectionDeg(30, 40)).toBeCloseTo(250, 0);
  });

  it('projects inclined orbits onto the ecliptic', () => {
    // A polar orbit whose node line is x seen from above is the line y = 0.
    const cells = beltSurfaceDensity([orbit(2.6, 0, 90)], 7200);
    expect(count(cells, (_r, az) => Math.abs(Math.sin(az)) < 0.02)).toBeCloseTo(count(cells), 5);
  });

  it('ignores orbits outside the band', () => {
    expect(count(beltSurfaceDensity([orbit(30), orbit(0.5)], 96))).toBe(0);
  });
});

describe('createBeltDensityBand', () => {
  const ring = [orbit(2.4), orbit(2.6), orbit(2.8), orbit(3.0)];

  it('fades with density and is empty away from the population', () => {
    const band = createBeltDensityBand(beltSurfaceDensity(ring, 720));
    const color = band.surface.geometry.getAttribute('color');
    const alphaAt = (r: number, a = 0) => color.getW(r * (azimuthal + 1) + a);
    const densest = Array.from({ length: radial + 1 }, (_, r) => alphaAt(r));
    expect(Math.max(...densest)).toBeGreaterThan(0.1);
    expect(alphaAt(0)).toBe(0);
    expect(alphaAt(radial)).toBe(0);
    band.dispose();
  });

  it('traces a closed outline on both edges of the band', () => {
    const band = createBeltDensityBand(beltSurfaceDensity([orbit(2.4), orbit(2.5), orbit(2.6)], 720));
    const [inner, outer] = band.outlines.map(line => line.geometry.getAttribute('position'));
    expect(inner.count).toBe(azimuthal);
    expect(outer.count).toBe(azimuthal);
    expect(Math.hypot(inner.getX(0), inner.getY(0))).toBeLessThan(Math.hypot(outer.getX(0), outer.getY(0)));
    band.dispose();
  });
});
