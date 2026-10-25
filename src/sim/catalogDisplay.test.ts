import { describe, expect, it } from 'vitest';
import {
  applySunPerihelionDisplayConstraint,
  createSolarSystemCatalog,
} from './catalog';

interface ConstraintBody {
  id: string;
  parentId: string | null;
  type: string;
  displayRadiusAu: number;
  orbit: { aAu: number; e?: number } | null;
}

describe('Sun perihelion display constraint (B025)', () => {
  it('caps the production Sun from independent Mercury and physical-radius oracles in both moon modes', () => {
    const expectedMercuryPerihelionAu = 0.3074977516112289;
    const expectedSunDisplayRadiusAu = 0.24599820128898311;
    const expectedSunRealRadiusAu = 0.00465474539672041;

    for (const moonsVisible of [true, false]) {
      const catalog = createSolarSystemCatalog({ moonsVisible });
      const sun = catalog.bodies.find((body) => body.id === 'sun')!;

      expect(sun.displayRadiusAu, `moonsVisible=${moonsVisible}`).toBe(
        expectedSunDisplayRadiusAu,
      );
      expect(sun.displayRadiusAu).toBeLessThan(expectedMercuryPerihelionAu);
      expect(sun.radiusKm).toBe(696_340);
      expect(sun.realRadiusAu).toBeCloseTo(expectedSunRealRadiusAu, 15);
    }
  });

  it('derives the cap from valid direct planets and dwarfs only', () => {
    const bodies: ConstraintBody[] = [
      { id: 'sun', parentId: null, type: 'star', displayRadiusAu: 10, orbit: null },
      { id: 'planet', parentId: 'sun', type: 'planet', displayRadiusAu: 1, orbit: { aAu: 1, e: 0.2 } },
      { id: 'dwarf', parentId: 'sun', type: 'dwarf', displayRadiusAu: 1, orbit: { aAu: 0.5, e: 0.4 } },
      { id: 'asteroid', parentId: 'sun', type: 'asteroid', displayRadiusAu: 1, orbit: { aAu: 0.01, e: 0 } },
      { id: 'moon', parentId: 'sun', type: 'moon', displayRadiusAu: 1, orbit: { aAu: 0.02, e: 0 } },
      { id: 'other-star', parentId: 'sun', type: 'star', displayRadiusAu: 1, orbit: { aAu: 0.03, e: 0 } },
      { id: 'indirect', parentId: 'planet', type: 'planet', displayRadiusAu: 1, orbit: { aAu: 0.04, e: 0 } },
      { id: 'root', parentId: null, type: 'planet', displayRadiusAu: 1, orbit: { aAu: 0.05, e: 0 } },
      { id: 'missing-orbit', parentId: 'sun', type: 'planet', displayRadiusAu: 1, orbit: null },
    ];
    const nonSunBefore = structuredClone(bodies.slice(1));

    applySunPerihelionDisplayConstraint(bodies);

    expect(bodies[0].displayRadiusAu).toBeCloseTo(0.24, 15);
    expect(bodies.slice(1)).toEqual(nonSunBefore);
  });

  it('honors eccentricity boundaries while leaving smaller or unconstrained Suns unchanged', () => {
    const omittedEccentricity: ConstraintBody[] = [
      { id: 'sun', parentId: null, type: 'star', displayRadiusAu: 10, orbit: null },
      { id: 'circular-default', parentId: 'sun', type: 'planet', displayRadiusAu: 1, orbit: { aAu: 0.125 } },
    ];
    applySunPerihelionDisplayConstraint(omittedEccentricity);
    expect(omittedEccentricity[0].displayRadiusAu).toBeCloseTo(0.1, 15);

    const zeroEccentricity: ConstraintBody[] = [
      { id: 'sun', parentId: null, type: 'star', displayRadiusAu: 10, orbit: null },
      { id: 'circular-zero', parentId: 'sun', type: 'planet', displayRadiusAu: 1, orbit: { aAu: 0.2, e: 0 } },
    ];
    applySunPerihelionDisplayConstraint(zeroEccentricity);
    expect(zeroEccentricity[0].displayRadiusAu).toBeCloseTo(0.16, 15);

    const boundaryBodies: ConstraintBody[] = [
      { id: 'sun', parentId: null, type: 'star', displayRadiusAu: 10, orbit: null },
      { id: 'circular-default', parentId: 'sun', type: 'planet', displayRadiusAu: 1, orbit: { aAu: 0.5 } },
      { id: 'circular-zero', parentId: 'sun', type: 'planet', displayRadiusAu: 1, orbit: { aAu: 0.2, e: 0 } },
      { id: 'elliptic-boundary', parentId: 'sun', type: 'planet', displayRadiusAu: 1, orbit: { aAu: 100, e: 0.999 } },
      { id: 'zero-a', parentId: 'sun', type: 'planet', displayRadiusAu: 1, orbit: { aAu: 0, e: 0 } },
      { id: 'negative-a', parentId: 'sun', type: 'planet', displayRadiusAu: 1, orbit: { aAu: -1, e: 0 } },
      { id: 'nan-a', parentId: 'sun', type: 'planet', displayRadiusAu: 1, orbit: { aAu: Number.NaN, e: 0 } },
      { id: 'infinite-a', parentId: 'sun', type: 'planet', displayRadiusAu: 1, orbit: { aAu: Number.POSITIVE_INFINITY, e: 0 } },
      { id: 'negative-e', parentId: 'sun', type: 'planet', displayRadiusAu: 1, orbit: { aAu: 0.01, e: -0.001 } },
      { id: 'parabolic', parentId: 'sun', type: 'planet', displayRadiusAu: 1, orbit: { aAu: 0.01, e: 1 } },
      { id: 'hyperbolic', parentId: 'sun', type: 'planet', displayRadiusAu: 1, orbit: { aAu: 0.01, e: 1.1 } },
      { id: 'nan-e', parentId: 'sun', type: 'planet', displayRadiusAu: 1, orbit: { aAu: 0.01, e: Number.NaN } },
      { id: 'infinite-e', parentId: 'sun', type: 'planet', displayRadiusAu: 1, orbit: { aAu: 0.01, e: Number.POSITIVE_INFINITY } },
    ];
    applySunPerihelionDisplayConstraint(boundaryBodies);
    expect(boundaryBodies[0].displayRadiusAu).toBeCloseTo(0.08, 15);

    const alreadySmaller: ConstraintBody[] = [
      { id: 'sun', parentId: null, type: 'star', displayRadiusAu: 0.05, orbit: null },
      { id: 'planet', parentId: 'sun', type: 'planet', displayRadiusAu: 1, orbit: { aAu: 0.5, e: 0.4 } },
    ];
    applySunPerihelionDisplayConstraint(alreadySmaller);
    expect(alreadySmaller[0].displayRadiusAu).toBe(0.05);

    const noValidCandidate: ConstraintBody[] = [
      { id: 'sun', parentId: null, type: 'star', displayRadiusAu: 10, orbit: null },
      { id: 'invalid', parentId: 'sun', type: 'planet', displayRadiusAu: 1, orbit: { aAu: 0, e: 0 } },
      { id: 'asteroid', parentId: 'sun', type: 'asteroid', displayRadiusAu: 1, orbit: { aAu: 0.01, e: 0 } },
    ];
    applySunPerihelionDisplayConstraint(noValidCandidate);
    expect(noValidCandidate[0].displayRadiusAu).toBe(10);
  });
});
