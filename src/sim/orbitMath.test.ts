import { describe, expect, it } from 'vitest';
import { resolveKeplerOrbitAtElapsedDays, solveKeplerFast, type KeplerOrbit } from './orbitMath';

describe('orbitMath secular drift support', () => {
  it('applies configured secular rates when resolving orbit elements', () => {
    const orbit: KeplerOrbit = {
      epochJd: 2_451_545.0,
      aAu: 1.0,
      periodDays: 365.25,
      e: 0.1,
      iDeg: 2,
      ascendingNodeDeg: 10,
      argPeriapsisDeg: 20,
      meanAnomalyDeg: 30,
      secularRates: {
        aAuPerCentury: 0.02,
        ePerCentury: 0.03,
        iDegPerCentury: -0.5,
        ascendingNodeDegPerCentury: 15,
        argPeriapsisDegPerCentury: -5
      }
    };

    const resolved = resolveKeplerOrbitAtElapsedDays(orbit, 36_525);

    expect(resolved.aAu).toBeCloseTo(1.02, 10);
    expect(resolved.e).toBeCloseTo(0.13, 10);
    expect(resolved.iRad).toBeCloseTo((1.5 * Math.PI) / 180, 10);
    expect(resolved.ascendingNodeRad).toBeCloseTo((25 * Math.PI) / 180, 10);
    expect(resolved.argPeriapsisRad).toBeCloseTo((15 * Math.PI) / 180, 10);
  });

});

describe('solveKeplerFast', () => {
  it('solves Kepler\'s equation for every eccentricity below 1, including e >= 0.99', () => {
    let worst = 0;
    for (const e of [0, 0.1, 0.5, 0.9, 0.97, 0.99, 0.995, 0.999, 0.9999]) {
      for (let k = 0; k <= 720; k++) {
        const M = (k / 720) * 2 * Math.PI;
        const E = solveKeplerFast(M, e);
        worst = Math.max(worst, Math.abs(E - e * Math.sin(E) - M));
      }
    }
    expect(worst).toBeLessThan(1e-9);
  });
});
