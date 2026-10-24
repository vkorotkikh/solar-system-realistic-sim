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
