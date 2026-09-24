import { describe, expect, it } from 'vitest';
import { resolveKeplerOrbitAtElapsedDays, type KeplerOrbit } from './orbitMath';

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
