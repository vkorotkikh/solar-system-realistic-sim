import { describe, expect, it } from 'vitest';
import {
  createSolarSystemCatalog,
  resolveMoonSecularRates,
  resolveMoonRotationPeriodHours
} from './catalog';

describe('moon catalog realism', () => {

  it('applies synchronous rotation defaults to major moons', () => {
    expect(resolveMoonRotationPeriodHours({ name: 'Moon', periodDays: 27.322 })).toBeCloseTo(27.322 * 24, 8);
    expect(resolveMoonRotationPeriodHours({ name: 'Europa', periodDays: 3.525463 })).toBeCloseTo(3.525463 * 24, 8);
    expect(resolveMoonRotationPeriodHours({ name: 'Triton', periodDays: 5.876854 })).toBeCloseTo(-(5.876854 * 24), 8);
  });

  it('converts published moon precession periods into secular orbit rates', () => {
    const rates = resolveMoonSecularRates({
      apsisPrecessionYears: 4_000,
      nodePrecessionYears: 2_000
    });

    expect(rates?.argPeriapsisDegPerCentury).toBeCloseTo(9, 12);
    expect(rates?.ascendingNodeDegPerCentury).toBeCloseTo(-18, 12);
  });

  it('carries precession rates into the moon orbit catalog', () => {
    const catalog = createSolarSystemCatalog();
    const moon = catalog.bodies.find((body) => body.name === 'Moon');
    const phobos = catalog.bodies.find((body) => body.name === 'Phobos');

    expect(moon?.rotationPeriodHours).toBeCloseTo(27.322 * 24, 8);
    expect(moon?.orbit?.secularRates?.argPeriapsisDegPerCentury).toBeGreaterThan(0);
    expect(moon?.orbit?.secularRates?.ascendingNodeDegPerCentury).toBeLessThan(0);

    expect(phobos?.orbitFrameSource).toBe('laplace');
    expect(phobos?.orbit?.argPeriapsisDeg).not.toBeCloseTo(216.3, 6);
    expect(phobos?.orbit?.secularRates?.argPeriapsisDegPerCentury).toBeGreaterThan(0);
    expect(phobos?.orbit?.secularRates?.ascendingNodeDegPerCentury).toBeLessThan(0);
  });
});
