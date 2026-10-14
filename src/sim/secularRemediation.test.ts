import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { PLANETS } from '../data/planets';
import rawMoons from '../data/moons.json';
import carmeElements from '../../backend/tests/fixtures/carme_elements_horizons_capture.json';
import himaliaElements from '../../backend/tests/fixtures/himalia_elements_horizons_capture.json';
import { createSolarSystemCatalog, resolveMoonSecularRates } from './catalog';
import { propagateKeplerOrbit, type KeplerOrbit } from './orbitMath';

// Derivative consistency is an internal gate, not external ephemeris accuracy.
const epochs = [-36524.5, -18262.5, 0, 9131.5, 18262.5];
const synthetic: KeplerOrbit = {
  aAu: 2, e: 0.3, iDeg: 37, ascendingNodeDeg: 41, argPeriapsisDeg: 53,
  meanAnomalyDeg: 71, epochJd: 2451545, periodDays: 900,
  secularRates: { aAuPerCentury: 0.1, ePerCentury: 0.03, iDegPerCentury: 7,
    ascendingNodeDegPerCentury: 11, argPeriapsisDegPerCentury: 17 }
};

describe('SCN-017 full secular state derivative', () => {
  for (const { id, orbit } of [...PLANETS, { id: 'drifting-period', orbit: synthetic }]) {
    if (!orbit.secularRates) continue;
    it(`${id}: velocity differentiates position at five epochs and two step sizes`, () => {
      for (const t of epochs) {
        const velocity = new Vector3();
        propagateKeplerOrbit(orbit, t, new Vector3(), velocity);
        for (const h of [0.02, 0.005]) {
          // Fourth-order centered difference, independent of analytic velocity.
          const positions = [-2, -1, 1, 2].map(k => {
            const p = new Vector3();
            expect(propagateKeplerOrbit(orbit, t + k * h, p)).toBe(true);
            return p;
          });
          const numerical = positions[0].clone().addScaledVector(positions[1], -8)
            .addScaledVector(positions[2], 8).addScaledVector(positions[3], -1)
            .multiplyScalar(1 / (12 * h));
          expect(velocity.distanceTo(numerical), `${id} t=${t}, h=${h}`).toBeLessThan(3e-10);
        }
      }
    });
  }
});

describe('SCN-081 node direction in the source inclination convention', () => {
  function measuredSlope(result: string, column: number): number {
    const rows = result.split('$$SOE')[1].split('$$EOE')[0].trim().split('\n')
      .map(line => line.split(','));
    const t = rows.map(row => Number(row[0]) - 2451545);
    const angle = rows.map(row => Number(row[column]));
    const unwrapped = [angle[0]];
    for (let i = 1; i < angle.length; i++) {
      const delta = ((angle[i] - angle[i - 1] + 540) % 360) - 180;
      unwrapped.push(unwrapped[i - 1] + delta);
    }
    const tMean = t.reduce((a,b) => a+b, 0)/t.length;
    const aMean = unwrapped.reduce((a,b) => a+b, 0)/t.length;
    return t.reduce((sum,x,i) => sum+(x-tMean)*(unwrapped[i]-aMean),0)
      /t.reduce((sum,x) => sum+(x-tMean)**2,0);
  }

  it.each([['Carme', carmeElements], ['Himalia', himaliaElements]] as const)(
    '%s node direction agrees with independent Horizons elements over 30 years', (name, capture) => {
      const source = rawMoons.find(m => m.name === name)!;
      const actual = resolveMoonSecularRates(source)!.ascendingNodeDegPerCentury! / 36525;
      const reference = measuredSlope(capture.result, 5);
      expect(Math.sign(actual)).toBe(Math.sign(reference));
      expect(Math.abs(actual/reference - 1)).toBeLessThan(0.25);
    }
  );

  it('uses the independently fitted Carme mean-anomaly rate with the corrected node direction', () => {
    const moon = createSolarSystemCatalog().bodies.find(b => b.name === 'Carme')!;
    expect(360 / moon.orbit!.periodDays).toBeCloseTo(measuredSlope(carmeElements.result, 9), 10);
  });
  it.each([[30, -18], [150, 18], [90, 0]])('i=%s gives signed rate %s', (inclinationDeg, want) => {
    const rates = resolveMoonSecularRates({
      apsisPrecessionYears: null, nodePrecessionYears: 2000, inclinationDeg
    });
    expect(rates?.ascendingNodeDegPerCentury).toBeCloseTo(want, 12);
  });

  it('gates every catalog prograde/retrograde node without overriding measured Triton', () => {
    for (const moon of rawMoons) {
      const rate = resolveMoonSecularRates(moon)?.ascendingNodeDegPerCentury;
      if (rate === undefined || rate === 0) continue;
      expect(Math.sign(rate), moon.name).toBe(moon.inclinationDeg > 90 ? 1 : -1);
    }
    expect(resolveMoonSecularRates(rawMoons.find(m => m.name === 'Triton')!)
      ?.ascendingNodeDegPerCentury).toBe(53.126);
  });
});
