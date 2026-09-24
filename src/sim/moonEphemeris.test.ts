import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import generatedJson from '../data/moonEphemerisChebyshev.json';
import {
  evaluateChebyshev,
  moonEphemerisCoverageAt,
  parseMoonEphemerisArtifact,
  propagateMoonEphemeris,
  type MoonChebyshevEphemeris
} from './moonEphemeris';
import {
  orbitPropagationQualityAt,
  propagateKeplerOrbit,
  type KeplerOrbit
} from './orbitMath';

const constantSeries = (value: number): number[] => [value];
const generatedArtifact = parseMoonEphemerisArtifact(generatedJson);

function circularFixture(): MoonChebyshevEphemeris {
  return {
    kind: 'horizons-chebyshev-elements-v1',
    coverageStartJd: 100,
    coverageEndJd: 102,
    meanLongitudeBaseDeg: 0,
    meanLongitudeRateDegPerDay: 90,
    sourceStepDays: 0.25,
    segments: [
      {
        startJd: 100,
        endJd: 102,
        coefficients: [
          constantSeries(149_597_870.7),
          constantSeries(0),
          constantSeries(0),
          constantSeries(1),
          constantSeries(0.01),
          constantSeries(0),
          constantSeries(0),
          constantSeries(0),
          constantSeries(90)
        ]
      }
    ],
    provenance: {
      source: 'test',
      sourceEphemeris: 'test',
      targetId: '1',
      centerId: '0',
      frame: 'ECLIPJ2000',
      timeScale: 'TDB',
      generatedAt: '2000-01-01T00:00:00Z',
      generator: 'test',
      query: 'test'
    }
  };
}

describe('moon ephemeris interpolation', () => {
  it('rejects an artifact whose feature schema does not match the runtime', () => {
    expect(() =>
      parseMoonEphemerisArtifact({ ...generatedJson, featureOrder: ['aKm'] })
    ).toThrow(/featureOrder/);
  });

  it('uses a stable Chebyshev evaluation', () => {
    // 1*T0 + 2*T1 + 3*T2 = 1 + 2x + 3(2x^2 - 1).
    expect(evaluateChebyshev([1, 2, 3], 0.25)).toBeCloseTo(-1.125, 14);
  });

  it('never extrapolates beyond declared coverage', () => {
    const ephemeris = circularFixture();
    expect(moonEphemerisCoverageAt(ephemeris, 99.99)).toBe('before-coverage');
    expect(moonEphemerisCoverageAt(ephemeris, 100)).toBe('covered');
    expect(moonEphemerisCoverageAt(ephemeris, 102)).toBe('covered');
    expect(moonEphemerisCoverageAt(ephemeris, 102.01)).toBe('after-coverage');

    const position = new Vector3();
    expect(propagateMoonEphemeris(ephemeris, 99, position)).toBe(false);
    expect(propagateMoonEphemeris(ephemeris, 103, position)).toBe(false);

    const orbit: KeplerOrbit = {
      epochJd: 100,
      aAu: 1,
      periodDays: 4,
      ephemeris
    };
    expect(orbitPropagationQualityAt(orbit, 101)).toBe('jpl-fitted-ephemeris');
    expect(orbitPropagationQualityAt(orbit, 103)).toBe(
      'approximate-mean-elements-outside-coverage'
    );
  });

  it('fails closed without modifying outputs when a fitted state is required', () => {
    const ephemeris = circularFixture();
    const requiredOrbit: KeplerOrbit = {
      epochJd: 100,
      aAu: 1,
      periodDays: 4,
      ephemeris,
      ephemerisRequired: true
    };
    const position = new Vector3(7, 8, 9);
    const velocity = new Vector3(1, 2, 3);

    expect(propagateKeplerOrbit(requiredOrbit, 3, position, velocity)).toBe(false);
    expect(position.toArray()).toEqual([7, 8, 9]);
    expect(velocity.toArray()).toEqual([1, 2, 3]);
    expect(orbitPropagationQualityAt(requiredOrbit, 103)).toBe(
      'state-unavailable-outside-ephemeris-coverage'
    );

    const missingOrbit = { ...requiredOrbit, ephemeris: undefined };
    expect(propagateKeplerOrbit(missingOrbit, 1, position, velocity)).toBe(false);
    expect(orbitPropagationQualityAt(missingOrbit, 101)).toBe(
      'state-unavailable-required-ephemeris-missing'
    );
  });

  it('commits neither half of a state when velocity evaluation fails', () => {
    const malformed = circularFixture();
    // The requested position is inside the segment, but the forward sample used
    // for velocity falls into an artificial gap. This exercises the late-failure
    // path that formerly emitted a new position paired with an old velocity.
    malformed.segments[0].endJd = 101;
    const position = new Vector3(7, 8, 9);
    const velocity = new Vector3(1, 2, 3);
    expect(propagateMoonEphemeris(malformed, 100.99995, position, velocity)).toBe(false);
    expect(position.toArray()).toEqual([7, 8, 9]);
    expect(velocity.toArray()).toEqual([1, 2, 3]);
  });

  it('preserves revolution count through unwrapped mean longitude', () => {
    const ephemeris = circularFixture();
    const atStart = new Vector3();
    const afterQuarterOrbit = new Vector3();
    const velocity = new Vector3();

    expect(propagateMoonEphemeris(ephemeris, 100, atStart, velocity)).toBe(true);
    expect(propagateMoonEphemeris(ephemeris, 101, afterQuarterOrbit)).toBe(true);

    expect(atStart.x).toBeCloseTo(0.99, 12);
    expect(atStart.y).toBeCloseTo(0, 12);
    // At M=90 deg an eccentric orbit has E>90 deg, so x=a(cos(E)-e)
    // is a little inside -2ae rather than exactly -ae.
    expect(afterQuarterOrbit.x).toBeCloseTo(-0.0199993334133215, 12);
    expect(afterQuarterOrbit.y).toBeCloseTo(0.9999000066656446, 12);
    expect(velocity.y).toBeGreaterThan(1);
  });

  it('supports the circular limit without falling back', () => {
    const ephemeris = circularFixture();
    for (const eccentricityFeature of [4, 5, 6]) {
      ephemeris.segments[0].coefficients[eccentricityFeature] = [0];
    }
    const position = new Vector3();
    expect(propagateMoonEphemeris(ephemeris, 101, position)).toBe(true);
    expect(position.length()).toBeCloseTo(1, 12);
    const orbit: KeplerOrbit = { epochJd: 100, aAu: 1, periodDays: 4, ephemeris };
    expect(orbitPropagationQualityAt(orbit, 101)).toBe('jpl-fitted-ephemeris');
  });

  it('ships a validated, contiguous 2000-2050 artifact for all four corrected moons', () => {
    const accuracyLimits: Record<string, { positionKm: number; velocityMPerS: number }> = {
      titan: { positionKm: 50, velocityMPerS: 3 },
      iapetus: { positionKm: 125, velocityMPerS: 6 },
      phoebe: { positionKm: 250, velocityMPerS: 12 },
      cordelia: { positionKm: 125, velocityMPerS: 30 }
    };
    for (const [name, limits] of Object.entries(accuracyLimits)) {
      const body = generatedArtifact.bodies[name];
      expect(body, `${name} generated ephemeris missing`).toBeDefined();
      expect(body.coverageStartJd).toBe(2_451_545);
      expect(body.coverageEndJd).toBe(2_469_807.5);
      expect(body.validation.sampleCount).toBeGreaterThan(18_000);
      expect(body.validation.heldOutSampleCount).toBeGreaterThan(18_000);
      expect(body.validation.coverageEndpointSampleCount).toBe(2);
      expect(body.validation.sampleCount).toBe(
        body.validation.heldOutSampleCount + body.validation.coverageEndpointSampleCount
      );
      expect(body.validation.coverageEndpointErrors.map((row) => row.jdTdb)).toEqual([
        body.coverageStartJd,
        body.coverageEndJd
      ]);
      expect(body.validation.accuracyLimits).toEqual(limits);
      expect(body.validation.positionErrorKm.max).toBeLessThanOrEqual(limits.positionKm);
      expect(body.validation.velocityErrorMPerS.max).toBeLessThanOrEqual(limits.velocityMPerS);
      expect(body.validation.boundaryContinuity.runtimeStateContinuous).toBe(true);
      expect(body.sourceRowsSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(body.heldOutRowsSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(body.segments.every((segment) => segment.coefficients.length === 9)).toBe(true);
    }
  });

  it('cross-fades independent polynomial segments into a continuous state', () => {
    const bodies = generatedArtifact.bodies;
    const epsilonDays = 1e-7;
    for (const [name, ephemeris] of Object.entries(bodies)) {
      const boundary = ephemeris.segments[1].startJd;
      const beforePosition = new Vector3();
      const afterPosition = new Vector3();
      const beforeVelocity = new Vector3();
      const afterVelocity = new Vector3();
      expect(
        propagateMoonEphemeris(ephemeris, boundary - epsilonDays, beforePosition, beforeVelocity)
      ).toBe(true);
      expect(
        propagateMoonEphemeris(ephemeris, boundary + epsilonDays, afterPosition, afterVelocity)
      ).toBe(true);
      expect(
        beforePosition.distanceTo(afterPosition) * 149_597_870.7,
        `${name} position jumps at a Chebyshev boundary`
      ).toBeLessThan(0.5);
      expect(
        beforeVelocity.distanceTo(afterVelocity) * 149_597_870.7 / 86_400,
        `${name} velocity jumps at a Chebyshev boundary`
      ).toBeLessThan(1e-4);
    }
  });

  it('returns velocity as the derivative of the fitted position trajectory', () => {
    const bodies = generatedArtifact.bodies;
    const independentStepDays = 2e-4;
    for (const [name, ephemeris] of Object.entries(bodies)) {
      const jd = ephemeris.coverageStartJd + 123.4567;
      const position = new Vector3();
      const velocity = new Vector3();
      const before = new Vector3();
      const after = new Vector3();
      expect(propagateMoonEphemeris(ephemeris, jd, position, velocity)).toBe(true);
      expect(propagateMoonEphemeris(ephemeris, jd - independentStepDays, before)).toBe(true);
      expect(propagateMoonEphemeris(ephemeris, jd + independentStepDays, after)).toBe(true);
      const finiteDifference = after.clone().sub(before).multiplyScalar(1 / (2 * independentStepDays));
      expect(
        velocity.distanceTo(finiteDifference) * 149_597_870.7 / 86_400,
        `${name} velocity is not d(position)/dt`
      ).toBeLessThan(5e-5);
    }
  });
});
