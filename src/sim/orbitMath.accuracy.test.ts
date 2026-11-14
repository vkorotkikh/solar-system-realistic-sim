/**
 * Bodies without secular rates must propagate exactly as they did before the
 * secular-rate correction. Accuracy against JPL Horizons across 1900-2100 is
 * pinned by planetPositions.horizons.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { propagateKeplerOrbit, type KeplerOrbit } from './orbitMath';

/**
 * Positions for an orbit carrying NO secular rates, captured from the propagator
 * *before* the secular-rate correction landed. Comparing against these committed
 * numbers - rather than against the current function with an empty rates block -
 * is what makes this a real invariant instead of a tautology.
 */
const RATE_FREE_EXPECTED: Array<[number, number, number, number]> = [
  [0, 3.996002574, 2.948330826, -0.101356336],
  [365.25, 1.794533284, 4.718132630, -0.059553585],
  [36525, -5.368076606, -0.925691519, 0.123607034],
  [-36525, -3.025740100, -4.449933705, 0.085916582],
  [365250, -4.527320671, 2.875814815, 0.089125960]
];

describe('bodies without secular rates are unaffected', () => {
  it('matches the pre-correction propagator exactly', () => {
    // Asteroids and KBOs carry no rates at all. (Moons DO carry them - see
    // catalog.ts resolveMoonSecularRates - so they are intentionally not covered here.)
    const orbit: KeplerOrbit = {
      epochJd: 2_451_545.0,
      aAu: 5.2,
      e: 0.048,
      iDeg: 1.3,
      ascendingNodeDeg: 100.5,
      argPeriapsisDeg: 273.9,
      meanAnomalyDeg: 20.02,
      periodDays: 4332.59
    };

    for (const [elapsedDays, x, y, z] of RATE_FREE_EXPECTED) {
      const actual = new Vector3();
      propagateKeplerOrbit(orbit, elapsedDays, actual);
      expect(actual.x).toBeCloseTo(x, 9);
      expect(actual.y).toBeCloseTo(y, 9);
      expect(actual.z).toBeCloseTo(z, 9);
    }
  });
});
