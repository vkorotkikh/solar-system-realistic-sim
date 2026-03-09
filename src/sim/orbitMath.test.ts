import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { propagateKeplerOrbit, resolveKeplerOrbitAtElapsedDays, type KeplerOrbit } from './orbitMath';

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

  it('changes propagated positions when secular drift is enabled', () => {
    const baseOrbit: KeplerOrbit = {
      epochJd: 2_451_545.0,
      aAu: 1.52371034,
      periodDays: 686.98,
      e: 0.0933941,
      iDeg: 1.84969142,
      ascendingNodeDeg: 49.55953891,
      argPeriapsisDeg: 286.4968315,
      meanAnomalyDeg: 19.39019754
    };

    const driftedOrbit: KeplerOrbit = {
      ...baseOrbit,
      secularRates: {
        ePerCentury: 0.00007882,
        iDegPerCentury: -0.00813131,
        ascendingNodeDegPerCentury: -0.29257343,
        argPeriapsisDegPerCentury: 0.73698431
      }
    };

    const withoutDrift = new Vector3();
    const withDrift = new Vector3();

    propagateKeplerOrbit(baseOrbit, 36_525, withoutDrift);
    propagateKeplerOrbit(driftedOrbit, 36_525, withDrift);

    expect(withDrift.distanceTo(withoutDrift)).toBeGreaterThan(1e-4);
  });
});
