import { describe, expect, it } from 'vitest';
import reference from '../../../../backend/tests/fixtures/solar_hathaway.json';
import { fallbackSolarActivityFromJulianDate, hathawayNormalized } from '../../../sunController';

describe('shared analytic Hathaway envelope', () => {
  it.each(reference.shapes)('matches the independent shape b=$b, c=$c', (shape) => {
    expect(hathawayNormalized(shape.peak_months, shape.b, shape.c)).toBeCloseTo(1, 14);
    reference.months.forEach((month, index) => {
      expect(hathawayNormalized(month, shape.b, shape.c)).toBeCloseTo(shape.values[index], 13);
    });
  });

  it('has one peak with no clipped plateau', () => {
    const values = Array.from({ length: 13201 }, (_, k) => hathawayNormalized(k / 100));
    expect(values.filter((value) => value >= 1 - 1e-12)).toHaveLength(0);
    const peak = Math.max(...values);
    expect(peak).toBeCloseTo(1, 9);
    expect(values.indexOf(peak) / 100).toBeCloseTo(58.39, 2);
  });

  it('uses the analytic shape in the active fallback, including earlier cycles', () => {
    const shape = reference.shapes[0];
    for (const cycle of [-1, 0, 1]) {
      const jd = 2458849.5 + cycle * 132 * 30.44 + 60 * 30.44;
      const rotation = .5 + .5 * Math.sin((jd - 2451545) / 27.2753 * 2 * Math.PI + .17);
      const expected = .06 + .82 * (shape.values[6] + 0.000288484678398785) + .1 * rotation;
      expect(fallbackSolarActivityFromJulianDate(jd)).toBeCloseTo(expected, 11);
    }
  });

  it('carries the previous cycle tail continuously across solar minimum', () => {
    const boundaryJd = 2458849.5 + 132 * 30.44;
    const before = fallbackSolarActivityFromJulianDate(boundaryJd - 0.01);
    const atBoundary = fallbackSolarActivityFromJulianDate(boundaryJd);
    const after = fallbackSolarActivityFromJulianDate(boundaryJd + 0.01);

    expect(before).toBeCloseTo(0.210739831890143, 11);
    expect(atBoundary).toBeCloseTo(0.210806770259572, 11);
    expect(after).toBeCloseTo(0.210873502743775, 11);
    expect(after - before).toBeLessThan(1e-3);
    expect(fallbackSolarActivityFromJulianDate(2458849.5 + 12 * 30.44))
      .toBeCloseTo(0.237060195980691, 11);
    expect(fallbackSolarActivityFromJulianDate(2458849.5 + reference.shapes[0].peak_months * 30.44))
      .toBeCloseTo(0.929678329312317, 11);
  });
});
