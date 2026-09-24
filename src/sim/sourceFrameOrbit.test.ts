import { describe, expect, it } from 'vitest';
import { propagateKeplerOrbit, type KeplerOrbit } from './orbitMath';
import {
  createSourceFrameBasis,
  propagateSourceFrameOrbit,
  sourceFrameOrbitNormalEcliptic,
  type CartesianVector,
  type SettableCartesianVector,
  type SourceFrameKeplerOrbit
} from './sourceFrameOrbit';

const AU_KM = 149_597_870.7;
const SECONDS_PER_DAY = 86_400;
const DEG_TO_RAD = Math.PI / 180;
const EARTH_OBLIQUITY_RAD = 23.439281 * DEG_TO_RAD;
const ECLIPTIC_BASIS = {
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 }
};
const EARTH_EQUATOR_POLE_ECLIPTIC = {
  x: 0,
  y: Math.sin(EARTH_OBLIQUITY_RAD),
  z: Math.cos(EARTH_OBLIQUITY_RAD)
};

function outputVector(): SettableCartesianVector {
  return {
    x: 0,
    y: 0,
    z: 0,
    set(x: number, y: number, z: number): void {
      this.x = x;
      this.y = y;
      this.z = z;
    }
  };
}

function dot(a: CartesianVector, b: CartesianVector): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: CartesianVector, b: CartesianVector): CartesianVector {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function normalize(vector: CartesianVector): CartesianVector {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function angularSeparationDeg(a: CartesianVector, b: CartesianVector): number {
  const cosine = Math.max(-1, Math.min(1, dot(normalize(a), normalize(b))));
  return Math.acos(cosine) / DEG_TO_RAD;
}

function equatorialPoleToEcliptic(raDeg: number, decDeg: number): CartesianVector {
  const ra = raDeg * DEG_TO_RAD;
  const dec = decDeg * DEG_TO_RAD;
  const equatorial = {
    x: Math.cos(dec) * Math.cos(ra),
    y: Math.cos(dec) * Math.sin(ra),
    z: Math.sin(dec)
  };
  return normalize({
    x: equatorial.x,
    y: Math.cos(EARTH_OBLIQUITY_RAD) * equatorial.y + Math.sin(EARTH_OBLIQUITY_RAD) * equatorial.z,
    z: -Math.sin(EARTH_OBLIQUITY_RAD) * equatorial.y + Math.cos(EARTH_OBLIQUITY_RAD) * equatorial.z
  });
}

describe('source-frame moon propagation', () => {
  it('is identical to the ordinary propagator when the source frame is ecliptic and fixed', () => {
    const base: KeplerOrbit = {
      aAu: 0.01,
      periodDays: 41,
      epochJd: 2_451_545,
      e: 0.17,
      iDeg: 23,
      ascendingNodeDeg: 71,
      argPeriapsisDeg: 113,
      meanAnomalyDeg: 241
    };
    const source: SourceFrameKeplerOrbit = { ...base, sourceFrameBasis: ECLIPTIC_BASIS };
    const ordinaryPosition = outputVector();
    const ordinaryVelocity = outputVector();
    const sourcePosition = outputVector();
    const sourceVelocity = outputVector();

    propagateKeplerOrbit(base, 123.456, ordinaryPosition as never, ordinaryVelocity as never);
    propagateSourceFrameOrbit(source, 123.456, sourcePosition, sourceVelocity);

    expect(sourcePosition.x).toBeCloseTo(ordinaryPosition.x, 14);
    expect(sourcePosition.y).toBeCloseTo(ordinaryPosition.y, 14);
    expect(sourcePosition.z).toBeCloseTo(ordinaryPosition.z, 14);
    expect(sourceVelocity.x).toBeCloseTo(ordinaryVelocity.x, 14);
    expect(sourceVelocity.y).toBeCloseTo(ordinaryVelocity.y, 14);
    expect(sourceVelocity.z).toBeCloseTo(ordinaryVelocity.z, 14);
  });

  it('precesses the node around a tilted source pole, preserving source inclination', () => {
    const sourcePole = normalize({ x: 0.62, y: -0.31, z: 0.72 });
    const basis = createSourceFrameBasis(sourcePole, EARTH_EQUATOR_POLE_ECLIPTIC);
    const orbit: SourceFrameKeplerOrbit = {
      aAu: 0.002,
      periodDays: 8,
      epochJd: 2_451_545,
      e: 0.03,
      iDeg: 12,
      ascendingNodeDeg: 14,
      argPeriapsisDeg: 50,
      meanAnomalyDeg: 80,
      secularRates: { ascendingNodeDegPerCentury: 28_800 },
      sourceFrameBasis: basis
    };

    const afterFiveYears = sourceFrameOrbitNormalEcliptic(orbit, 5 * 365.25);
    const sourceInclinationDeg = Math.acos(dot(afterFiveYears, basis.z)) / DEG_TO_RAD;

    expect(sourceInclinationDeg).toBeCloseTo(12, 10);
    expect(dot(basis.x, basis.y)).toBeCloseTo(0, 14);
    expect(dot(basis.x, basis.z)).toBeCloseTo(0, 14);
    expect(dot(basis.y, basis.z)).toBeCloseTo(0, 14);
  });

  it('returns the analytic derivative of position when every secular rotation is active', () => {
    const basis = createSourceFrameBasis(
      normalize({ x: -0.38, y: 0.82, z: 0.43 }),
      EARTH_EQUATOR_POLE_ECLIPTIC
    );
    const orbit: SourceFrameKeplerOrbit = {
      aAu: 0.004,
      periodDays: 29,
      epochJd: 2_451_545,
      e: 0.21,
      iDeg: 37,
      ascendingNodeDeg: 118,
      argPeriapsisDeg: 251,
      meanAnomalyDeg: 33,
      secularRates: {
        aAuPerCentury: 0.0002,
        ePerCentury: -0.01,
        iDegPerCentury: 8,
        ascendingNodeDegPerCentury: -1_300,
        argPeriapsisDegPerCentury: 2_100,
        periodIsMeanLongitudePeriod: true
      },
      sourceFrameBasis: basis
    };
    const elapsedDays = 4_321.25;
    const stepDays = 1e-3;
    const position = outputVector();
    const velocity = outputVector();
    const before = outputVector();
    const after = outputVector();

    propagateSourceFrameOrbit(orbit, elapsedDays, position, velocity);
    propagateSourceFrameOrbit(orbit, elapsedDays - stepDays, before);
    propagateSourceFrameOrbit(orbit, elapsedDays + stepDays, after);

    const finiteDifference = {
      x: (after.x - before.x) / (2 * stepDays),
      y: (after.y - before.y) / (2 * stepDays),
      z: (after.z - before.z) / (2 * stepDays)
    };
    expect(velocity.x).toBeCloseTo(finiteDifference.x, 10);
    expect(velocity.y).toBeCloseTo(finiteDifference.y, 10);
    expect(velocity.z).toBeCloseTo(finiteDifference.z, 10);
  });

  it('keeps Cordelia in the Horizons plane when extrapolated from 2025 back to J2000', () => {
    // URA184 mean elements, epoch 2025-01-01 TDB.  The pole is the published
    // Cordelia Laplace-plane pole (RA 77.3 deg, Dec 15.2 deg).  This is the
    // regression that exposed the old composition: applying -60000 deg/cy to
    // an already converted ecliptic node made the J2000 plane 117.7 deg wrong.
    const orbit: SourceFrameKeplerOrbit = {
      epochJd: 2_460_676.5,
      aAu: 49_755 / AU_KM,
      e: 0,
      iDeg: 0.2,
      ascendingNodeDeg: 1.1,
      argPeriapsisDeg: 0,
      meanAnomalyDeg: 287.4,
      periodDays: 0.3347,
      secularRates: {
        ascendingNodeDegPerCentury: -60_000,
        argPeriapsisDegPerCentury: 0,
        periodIsMeanLongitudePeriod: true
      },
      sourceFrameBasis: createSourceFrameBasis(
        equatorialPoleToEcliptic(77.3, 15.2),
        EARTH_EQUATOR_POLE_ECLIPTIC
      )
    };
    const position = outputVector();
    const velocity = outputVector();
    propagateSourceFrameOrbit(orbit, 2_451_545 - orbit.epochJd, position, velocity);

    const propagatedPlane = cross(position, velocity);
    const horizonsPosition = { x: 48_606.78760862975, y: -10_462.10054810247, z: 2_248.45756000693 };
    const horizonsVelocity = {
      x: 0.166128451395837 * SECONDS_PER_DAY,
      y: -1.511113483016318 * SECONDS_PER_DAY,
      z: -10.68887875388504 * SECONDS_PER_DAY
    };
    const horizonsPlane = cross(horizonsPosition, horizonsVelocity);

    expect(angularSeparationDeg(propagatedPlane, horizonsPlane)).toBeLessThan(0.2);
  });
});
