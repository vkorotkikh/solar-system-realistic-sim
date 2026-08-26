import { describe, expect, it } from 'vitest';
import fixtureJson from '../../scripts/fixtures/moon-frames-j2000-horizons.json';
import { createSolarSystemCatalog } from './catalog';
import { propagateKeplerOrbit } from './orbitMath';
import {
  compareMoon,
  moonsByName,
  validateFixture,
  type MoonFrameFixture,
  type PropagateFn
} from './moonFrameCheck';

/**
 * Network-free frame-conversion gate.
 *
 * Propagates each catalog moon to the fixture epoch and compares the resulting
 * parent-relative state against a committed JPL Horizons snapshot. See
 * ./moonFrameCheck.ts for what the two tolerances mean and why there are two.
 *
 * The standalone `npm run verify:moon-frames` prints the same numbers as a
 * sorted diagnostic table; this file is the version that `npm test` enforces.
 */

const fixture = fixtureJson as MoonFrameFixture;
const propagate = propagateKeplerOrbit as unknown as PropagateFn;

describe('moon frame conversion vs JPL Horizons J2000 snapshot', () => {
  it('ships a structurally valid, provenanced fixture', () => {
    expect(validateFixture(fixture)).toEqual([]);
    expect(Object.keys(fixture.bodies).length).toBeGreaterThanOrEqual(20);
  });

  const catalog = createSolarSystemCatalog();
  const byName = moonsByName(catalog);

  for (const [name, truth] of Object.entries(fixture.bodies)) {
    it(`${name} matches Horizons in position and orbit plane`, () => {
      const moon = byName.get(name);
      expect(moon, `${name} is missing from the catalog`).toBeDefined();

      const row = compareMoon(name, moon!, truth, propagate);

      // |r| is frame-invariant, so a failure here indicts the fixture or the
      // element set -- not the frame conversion under test.
      expect(row.radialWarning).toBeNull();

      expect(
        row.planeDeg,
        `${name} (${row.frame}): orbit plane is ${row.planeDeg.toFixed(2)} deg off ` +
          `(limit ${row.planeTolDeg} deg). The plane angle is phase-immune, so this is a ` +
          'frame-conversion error in src/sim/catalog.ts.'
      ).toBeLessThanOrEqual(row.planeTolDeg);

      expect(
        row.rel,
        `${name} (${row.frame}): position is off by ${row.rel.toFixed(4)} of its orbit radius ` +
          `(limit ${row.positionTol}); ${row.drKm.toFixed(0)} km, ${row.sepDeg.toFixed(2)} deg ` +
          'from the true direction.'
      ).toBeLessThanOrEqual(row.positionTol);
    });
  }
});
