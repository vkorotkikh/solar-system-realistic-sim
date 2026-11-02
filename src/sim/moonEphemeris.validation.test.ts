import { describe, expect, it } from 'vitest';
import canonical from '../data/moonEphemerisChebyshev.json';
import repairs from '../data/moonEphemerisRepairs.json';
import native from '../data/moonEphemerisSpkRepairs.json';
import daphnis from '../data/moonEphemerisDaphnis.json';
import s2023s38 from '../data/moonEphemerisS2023S38.json';
import { parseMoonEphemerisArtifact } from './moonEphemeris';

// Keep real coefficients, identity and provenance; mutate only an isolated
// certificate so another parser rejection cannot conceal the validation gap.
function titanFixture() {
  return { ...canonical, bodies: { titan: structuredClone(canonical.bodies.titan) } };
}

const errorFields = [
  { field: 'positionErrorKm', capField: 'positionKm', cap: 50 },
  { field: 'velocityErrorMPerS', capField: 'velocityMPerS', cap: 3 }
] as const;

describe('moon ephemeris endpoint accuracy certificate (MOON056)', () => {
  for (const { field, capField, cap } of errorFields) {
    for (const endpointIndex of [0, 1]) {
      it.each([
        ['negative', -1],
        ['above the declared cap', cap + 0.01],
        ['NaN', NaN],
        ['positive infinity', Infinity],
        ['negative infinity', -Infinity]
      ] as const)(`rejects endpoint ${endpointIndex} ${field} when %s`, (_label, value) => {
        const artifact = titanFixture();
        artifact.bodies.titan.validation.coverageEndpointErrors[endpointIndex][field] = value;

        expect(() => parseMoonEphemerisArtifact(artifact)).toThrow(field);
      });

      it.each([0, cap])(`accepts endpoint ${endpointIndex} ${field} at inclusive bound %s`, value => {
        const artifact = titanFixture();
        const validation = artifact.bodies.titan.validation;
        validation.coverageEndpointErrors[endpointIndex][field] = value;
        // The aggregate population includes endpoints. Keep this positive
        // control coherent when exercising the upper endpoint boundary.
        validation[field].max = cap;

        expect(() => parseMoonEphemerisArtifact(artifact)).not.toThrow();
      });
    }

    it.each([
      ['negative', -1],
      ['NaN', NaN],
      ['positive infinity', Infinity],
      ['negative infinity', -Infinity]
    ] as const)(`rejects a %s ${capField} accuracy cap`, (_label, value) => {
      const artifact = titanFixture();
      const validation = artifact.bodies.titan.validation;
      validation.accuracyLimits[capField] = value;
      if (Number.isFinite(value) && value < 0) {
        // A negative maximum used to satisfy max <= cap. The cap itself must
        // be rejected, independently of the other malformed error metadata.
        validation[field] = { p50: value, p95: value, p99: value, max: value };
        for (const endpoint of validation.coverageEndpointErrors) endpoint[field] = value;
      }

      expect(() => parseMoonEphemerisArtifact(artifact)).toThrow(/accuracyLimits/);
    });

    it(`accepts a zero ${capField} cap with exactly zero certified errors`, () => {
      const artifact = titanFixture();
      const validation = artifact.bodies.titan.validation;
      validation.accuracyLimits[capField] = 0;
      validation[field] = { p50: 0, p95: 0, p99: 0, max: 0 };
      for (const endpoint of validation.coverageEndpointErrors) endpoint[field] = 0;

      expect(() => parseMoonEphemerisArtifact(artifact)).not.toThrow();
    });
  }
});

describe('moon ephemeris aggregate error certificate (MOON056)', () => {
  for (const { field, cap } of errorFields) {
    for (const percentile of ['p50', 'p95', 'p99', 'max'] as const) {
      it.each([
        ['negative', -1],
        ['above the declared cap', cap + 0.01],
        ['NaN', NaN],
        ['positive infinity', Infinity],
        ['negative infinity', -Infinity]
      ] as const)(`rejects ${field}.${percentile} when %s`, (_label, value) => {
        const artifact = titanFixture();
        artifact.bodies.titan.validation[field][percentile] = value;

        expect(() => parseMoonEphemerisArtifact(artifact)).toThrow(/validation/);
      });
    }

    it.each([
      ['p50 > p95', [0.4, 0.2, 0.6, 0.8]],
      ['p95 > p99', [0.1, 0.6, 0.4, 0.8]],
      ['p99 > max', [0.1, 0.2, 0.8, 0.6]]
    ] as const)(`rejects unordered ${field} when %s`, (_label, fractions) => {
      const artifact = titanFixture();
      const [p50, p95, p99, max] = fractions.map(fraction => fraction * cap);
      artifact.bodies.titan.validation[field] = { p50, p95, p99, max };

      expect(() => parseMoonEphemerisArtifact(artifact)).toThrow(/validation/);
    });

    it.each([0, cap])(`accepts equal ${field} percentiles at %s`, value => {
      const artifact = titanFixture();
      const validation = artifact.bodies.titan.validation;
      validation[field] = { p50: value, p95: value, p99: value, max: value };
      for (const endpoint of validation.coverageEndpointErrors) endpoint[field] = value;

      expect(() => parseMoonEphemerisArtifact(artifact)).not.toThrow();
    });

    for (const endpointIndex of [0, 1]) {
      it(`rejects endpoint ${endpointIndex} ${field} above the aggregate maximum but below the cap`, () => {
        const artifact = titanFixture();
        const validation = artifact.bodies.titan.validation;
        validation[field] = { p50: 0, p95: 0, p99: 0, max: cap / 4 };
        for (const endpoint of validation.coverageEndpointErrors) endpoint[field] = 0;
        validation.coverageEndpointErrors[endpointIndex][field] = cap / 2;

        expect(() => parseMoonEphemerisArtifact(artifact)).toThrow(/validation/);
      });

      it(`accepts endpoint ${endpointIndex} ${field} equal to the aggregate maximum`, () => {
        const artifact = titanFixture();
        const validation = artifact.bodies.titan.validation;
        validation[field] = { p50: 0, p95: 0, p99: 0, max: cap / 2 };
        for (const endpoint of validation.coverageEndpointErrors) endpoint[field] = 0;
        validation.coverageEndpointErrors[endpointIndex][field] = cap / 2;

        expect(() => parseMoonEphemerisArtifact(artifact)).not.toThrow();
      });
    }
  }
});

describe('moon ephemeris validation sample counts (MOON056)', () => {
  it.each([
    ['negative held-out count with positive total', -1, 1],
    ['negative held-out count with zero total', -2, 0],
    ['negative total and held-out count', -3, -1],
    ['unsafe counts whose sum rounds to the same value', 1e20, 1e20],
    ['unsafe held-out count', Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 3],
    ['unsafe total with safe held-out count', Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER + 1],
    ['fractional counts', 1.5, 3.5],
    ['mismatched total', 10, 11]
  ] as const)('rejects %s', (_label, heldOut, total) => {
    const artifact = titanFixture();
    artifact.bodies.titan.validation.heldOutSampleCount = heldOut;
    artifact.bodies.titan.validation.sampleCount = total;

    expect(() => parseMoonEphemerisArtifact(artifact)).toThrow(/validation/);
  });

  for (const field of ['sampleCount', 'heldOutSampleCount'] as const) {
    it.each([NaN, Infinity, -Infinity])(`rejects nonfinite ${field}: %s`, value => {
      const artifact = titanFixture();
      artifact.bodies.titan.validation[field] = value;

      expect(() => parseMoonEphemerisArtifact(artifact)).toThrow(/validation/);
    });
  }

  it.each([0, 1, 3])('still requires exactly two coverage endpoints, not %s', count => {
    const artifact = titanFixture();
    const validation = artifact.bodies.titan.validation;
    validation.coverageEndpointSampleCount = count;
    validation.sampleCount = validation.heldOutSampleCount + count;

    expect(() => parseMoonEphemerisArtifact(artifact)).toThrow(/validation/);
  });

  it.each([
    ['zero held-out samples', 0, 2],
    ['one held-out sample', 1, 3],
    ['largest safe total', Number.MAX_SAFE_INTEGER - 2, Number.MAX_SAFE_INTEGER]
  ] as const)('accepts %s with an exact total', (_label, heldOut, total) => {
    const artifact = titanFixture();
    artifact.bodies.titan.validation.heldOutSampleCount = heldOut;
    artifact.bodies.titan.validation.sampleCount = total;

    expect(() => parseMoonEphemerisArtifact(artifact)).not.toThrow();
  });

  it.each([0, -1, 1.5, NaN, Infinity, -Infinity, 1e20, Number.MAX_SAFE_INTEGER + 1])(
    'requires a safe positive post-selection audit count, rejecting %s', count => {
      const artifact = structuredClone(s2023s38);
      artifact.bodies.s2023_s38.validation.postSelectionCrossValidation.sampleCount = count;

      expect(() => parseMoonEphemerisArtifact(artifact)).toThrow(/post-selection audit/);
    }
  );

  it.each([1, Number.MAX_SAFE_INTEGER])('accepts safe positive post-selection audit count %s', count => {
    const artifact = structuredClone(s2023s38);
    artifact.bodies.s2023_s38.validation.postSelectionCrossValidation.sampleCount = count;

    expect(() => parseMoonEphemerisArtifact(artifact)).not.toThrow();
  });
});

describe('shipped moon certificate positive controls', () => {
  it.each([
    ['canonical', canonical, ['cordelia', 'iapetus', 'phoebe', 'titan']],
    ['repairs', repairs, ['carme', 'dione', 'mimas', 'neso', 'phobos', 's2021_n1']],
    ['native', native, ['s2025_u_1']],
    ['Daphnis', daphnis, ['daphnis']],
    ['S/2023 S38', s2023s38, ['s2023_s38']]
  ] as const)('accepts every unchanged %s record', (_label, artifact, expectedIds) => {
    expect(Object.keys(parseMoonEphemerisArtifact(artifact).bodies).sort()).toEqual([...expectedIds].sort());
  });
});
