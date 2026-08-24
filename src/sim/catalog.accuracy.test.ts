/**
 * External-oracle accuracy tests for the moon catalog (R4 item 2).
 *
 * These replace the trust previously placed in catalog.test.ts, which
 * re-implements the very frame-conversion math it is checking (it recomputes
 * raDecToEquatorialUnit / crossProduct locally and asserts they agree with the
 * code) -- a test that agrees with the implementation by construction and cannot
 * catch a wrong result. It passed while converted moons were ~160 deg off (SF-9).
 *
 * The bar here is JPL Horizons, committed to the repo. Two groups:
 *
 *   1. Earth's Moon is in the 'ecliptic' source frame, so it bypasses the moon
 *      frame converter entirely. It is an ACTIVE CONTROL: if it drifts, the
 *      harness or the un-converted path is broken, not the converter.
 *
 *   2. The Galilean moons + Triton are in 'Laplace' frames and go through
 *      convertMoonOrbitFrameToEcliptic, which is wrong (K-05/K-06/SF-6): each is
 *      ~2 orbital radii from truth. Fixing SF-6 is deliberately out of scope here
 *      (Report C: the orbit-normal sign and the periapsis rotation are a single
 *      change and fixing either alone makes moons worse). So the second group is
 *      a TRIPWIRE: it asserts the defect still exists. When SF-6 is fixed these
 *      assertions will fail, forcing whoever fixes it to replace them with the
 *      intended accuracy budgets recorded below.
 *
 * Fixture provenance
 *   JPL Horizons API, EPHEM_TYPE=VECTORS, parent-relative (CENTER=500@<parent
 *   body>), REF_PLANE=ECLIPTIC (J2000), OUT_UNITS=KM-S, VEC_CORR=NONE,
 *   TLIST=2451545.0 (the catalog's moon element epoch). Retrieved 2026-08-24.
 */
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createSolarSystemCatalog } from './catalog';
import { propagateKeplerOrbit } from './orbitMath';

const KM_PER_AU = 149_597_870.7;

interface MoonFixture {
  name: string;
  parentId: string;
  positionKm: [number, number, number];
}

/** Parent-relative ecliptic-J2000 positions (km) at JD 2451545.0. */
const HORIZONS_MOONS: MoonFixture[] = [
  { name: 'Moon', parentId: 'earth', positionKm: [-291608.384, -274979.742, 36271.197] },
  { name: 'Io', parentId: 'jupiter', positionKm: [399714.236, 129266.651, 10663.256] },
  { name: 'Europa', parentId: 'jupiter', positionKm: [-561244.474, -356013.059, -17954.098] },
  { name: 'Ganymede', parentId: 'jupiter', positionKm: [-821345.095, -685388.824, -34557.737] },
  { name: 'Callisto', parentId: 'jupiter', positionKm: [325079.731, 1852260.034, 64754.766] },
  { name: 'Titan', parentId: 'saturn', positionKm: [-946802.938, 766868.032, -302959.988] },
  { name: 'Triton', parentId: 'neptune', positionKm: [-205696.474, 124061.524, 261000.774] }
];

const CATALOG = createSolarSystemCatalog();
const BODIES: any[] = (CATALOG as any).bodies ?? (CATALOG as any);

function parentRelativeErrorKm(fixture: MoonFixture): { errorKm: number; radiusKm: number } {
  const body = BODIES.find((b) => (b.name ?? '').toLowerCase() === fixture.name.toLowerCase());
  if (!body?.orbit) throw new Error(`no catalog orbit for ${fixture.name}`);
  const pos = new Vector3();
  propagateKeplerOrbit(body.orbit, 0, pos); // elapsedDays = 0 -> the element epoch
  pos.multiplyScalar(KM_PER_AU);
  const truth = new Vector3(...fixture.positionKm);
  return { errorKm: pos.distanceTo(truth), radiusKm: truth.length() };
}

describe('moon catalog accuracy vs JPL Horizons', () => {
  it("places Earth's Moon (unconverted control) within 5% of its orbital radius", () => {
    const moon = HORIZONS_MOONS.find((m) => m.name === 'Moon')!;
    const { errorKm, radiusKm } = parentRelativeErrorKm(moon);
    // Measured 4,432 km = 1.1% at this epoch. A regression here indicts the
    // harness or the ecliptic path, not the (separate) frame converter.
    expect(errorKm / radiusKm).toBeLessThan(0.05);
  });
});

/**
 * SF-6 tripwire. Intended budget once the frame conversion is fixed: each moon
 * within ~10% of its orbital radius (Report C's acceptance for F-05). Today they
 * sit at ~1.97 r, so we assert the defect is still present. DELETE this block and
 * enable the budget above for these moons when SF-6 lands.
 */
const SF6_BROKEN = new Set(['Io', 'Europa', 'Ganymede', 'Callisto', 'Triton']);
const SF6_INTENDED_BUDGET = 0.10; // orbital-radius fraction, for when SF-6 is fixed

describe('moon frame conversion is still broken (SF-6 tripwire)', () => {
  for (const fixture of HORIZONS_MOONS.filter((m) => SF6_BROKEN.has(m.name))) {
    it(`${fixture.name} is still displaced ~2 orbital radii (remove when SF-6 is fixed)`, () => {
      const { errorKm, radiusKm } = parentRelativeErrorKm(fixture);
      // When SF-6 is fixed this becomes false and the test fails on purpose,
      // signalling that the assertion should flip to:
      //   expect(errorKm / radiusKm).toBeLessThan(SF6_INTENDED_BUDGET);
      void SF6_INTENDED_BUDGET;
      expect(errorKm / radiusKm).toBeGreaterThan(0.5);
    });
  }
});
