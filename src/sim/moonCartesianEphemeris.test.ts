import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { propagateMoonEphemeris, type MoonChebyshevEphemeris } from './moonEphemeris';

const AU_KM = 149597870.7;
function synthetic(harmonics: number, coefficients: number[][]): MoonChebyshevEphemeris {
  return {
    kind: 'horizons-chebyshev-cartesian-v1', carrierHarmonics: harmonics,
    coverageStartJd: 2451545, coverageEndJd: 2451555, sourceStepDays: .5,
    meanLongitudeBaseDeg: 30, meanLongitudeRateDegPerDay: 720,
    segments: [{ startJd: 2451545, endJd: 2451555, coefficients }],
    provenance: { source: 'analytic test only', sourceEphemeris: 'not external evidence',
      targetId: 'test', centerId: 'test', frame: 'ECLIPJ2000', timeScale: 'TDB',
      generatedAt: 'test', generator: 'test', query: 'test' }
  };
}

describe('Cartesian Chebyshev moon states', () => {
  it('differentiates a direct polynomial in physical days', () => {
    const orbit = synthetic(0, [[100, 20, 3], [5], [2, 1]]);
    const p = new Vector3(), v = new Vector3();
    expect(propagateMoonEphemeris(orbit, 2451550, p, v)).toBe(true);
    expect(p.x * AU_KM).toBeCloseTo(97, 10);
    expect(v.x * AU_KM).toBeCloseTo(4, 10);
    expect(v.z * AU_KM).toBeCloseTo(.2, 10);
  });
  it('retains fast orbital phase and differentiates its carrier', () => {
    const orbit = synthetic(1, [[0], [0], [0], [1000], [0], [0], [0], [1000], [0]]);
    const p = new Vector3(), v = new Vector3();
    const jd = 2451545.12345;
    expect(propagateMoonEphemeris(orbit, jd, p, v)).toBe(true);
    const phase = (30 + 720 * (jd - 2451545)) * Math.PI / 180;
    expect(p.x * AU_KM).toBeCloseTo(1000 * Math.cos(phase), 8);
    expect(p.y * AU_KM).toBeCloseTo(1000 * Math.sin(phase), 8);
    expect(v.x * AU_KM).toBeCloseTo(-4000 * Math.PI * Math.sin(phase), 8);
    expect(v.y * AU_KM).toBeCloseTo(4000 * Math.PI * Math.cos(phase), 8);
  });
  it('includes the blend derivative, including at the shared boundary', () => {
    const orbit = synthetic(0, [[1], [0], [0]]);
    orbit.segments = [
      { startJd: 2451545, endJd: 2451550, coefficients: [[1], [0], [0]] },
      { startJd: 2451550, endJd: 2451555, coefficients: [[2], [0], [0]] }
    ];
    const p = new Vector3(), v = new Vector3();
    expect(propagateMoonEphemeris(orbit, 2451550, p, v)).toBe(true);
    expect(p.x * AU_KM).toBeCloseTo(1.5, 12);
    expect(v.x * AU_KM).toBeCloseTo(3, 12);
  });
  it('does not extrapolate or mutate outputs on malformed input', () => {
    const orbit = synthetic(0, [[1], [0], [0]]);
    const p = new Vector3(1, 2, 3), v = new Vector3(4, 5, 6);
    expect(propagateMoonEphemeris(orbit, 2451544, p, v)).toBe(false);
    orbit.segments[0].coefficients[0] = [Number.NaN];
    expect(propagateMoonEphemeris(orbit, 2451546, p, v)).toBe(false);
    expect(p.toArray()).toEqual([1, 2, 3]);
    expect(v.toArray()).toEqual([4, 5, 6]);
  });
  it('preserves a declared provider handoff and selects the right-hand state at its epoch', () => {
    const orbit = { ...synthetic(0, [[1], [0], [0]]), sourceDiscontinuities: [2451550] };
    orbit.segments = [
      { startJd: 2451545, endJd: 2451550, coefficients: [[1], [0], [0]] },
      { startJd: 2451550, endJd: 2451555, coefficients: [[2], [0], [0]] }
    ];
    const p = new Vector3(), v = new Vector3();
    for (const [jd, expected] of [[2451550 - 1e-6, 1], [2451550, 2], [2451550 + 1e-6, 2]]) {
      expect(propagateMoonEphemeris(orbit, jd, p, v)).toBe(true);
      expect(p.x * AU_KM).toBeCloseTo(expected, 12);
      expect(v.length()).toBe(0);
    }
  });
});
