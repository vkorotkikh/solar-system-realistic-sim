import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import daphnis from '../data/moonEphemerisDaphnis.json';
import s2023s38 from '../data/moonEphemerisS2023S38.json';
import oracle from '../../backend/tests/fixtures/moon_exception_validation.json';
import { parseMoonEphemerisArtifact, propagateMoonEphemeris } from './moonEphemeris';

const artifacts = { daphnis, s2023_s38: s2023s38 };
const AU_KM = 149597870.7;
describe('qualified native handoffs and non-elliptic Cartesian moon states', () => {
  for (const key of ['daphnis', 's2023_s38'] as const) {
    it(`${key}: independent native/vector states, unchanged catalog caps and explicit domain`, () => {
      const body = parseMoonEphemerisArtifact(artifacts[key]).bodies[key];
      const positionCap = key === 'daphnis' ? 136.5 : 500;
      expect(body.validation.accuracyLimits).toEqual({ positionKm: positionCap, velocityMPerS: 10 });
      for (const truth of oracle.bodies[key]) {
        const p = new Vector3(), v = new Vector3();
        expect(propagateMoonEphemeris(body, truth.jd_tdb, p, v)).toBe(true);
        expect(p.distanceTo(new Vector3(...truth.position_au)) * AU_KM, `${key} JD ${truth.jd_tdb}`).toBeLessThanOrEqual(positionCap);
        expect(v.distanceTo(new Vector3(...truth.velocity_au_per_day)) * AU_KM * 1000 / 86400).toBeLessThanOrEqual(10);
      }
      for (const jd of [body.coverageStartJd - 1e-6, body.coverageEndJd + 1e-6]) {
        expect(propagateMoonEphemeris(body, jd, new Vector3(), new Vector3())).toBe(false);
      }
    });
  }
  it('does not mislabel the Daphnis provider changes as a continuous physical trajectory', () => {
    expect(daphnis.bodies.daphnis.sourceDiscontinuities).toEqual([2455197.5, 2457388.5]);
    expect(daphnis.bodies.daphnis.validation.boundaryContinuity.runtimeStateContinuous).toBe(false);
    expect(daphnis.bodies.daphnis.sourceDomain.observationsThrough).toBe('2016-07-16');
    const bad = structuredClone(daphnis);
    bad.bodies.daphnis.validation.boundaryContinuity.runtimeStateContinuous = true;
    expect(() => parseMoonEphemerisArtifact(bad)).toThrow(/continuity/);
  });
  it('rejects unsorted, unaligned or undocumented provider handoffs', () => {
    for (const epochs of [[2457388.5, 2455197.5], [2455198.5, 2457388.5]]) {
      const bad = structuredClone(daphnis);
      bad.bodies.daphnis.sourceDiscontinuities = epochs;
      expect(() => parseMoonEphemerisArtifact(bad)).toThrow();
    }
    const bad = structuredClone(daphnis);
    bad.bodies.daphnis.validation.boundaryContinuity.sourceDiscontinuities = [];
    expect(() => parseMoonEphemerisArtifact(bad)).toThrow(/handoff/);
  });
});
