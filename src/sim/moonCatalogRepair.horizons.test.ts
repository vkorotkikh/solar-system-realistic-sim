/** All-424 accounting. Explicit repair-pending skips are NOT scientific passes. */
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import rawMoons from '../data/moons.json';
import generated from '../data/moonEphemerisChebyshev.json';
import oracle from '../../backend/tests/fixtures/all_moons_horizons_oracle.json';
import { createSolarSystemCatalog } from './catalog';
import { parseMoonEphemerisArtifact } from './moonEphemeris';
import { propagateKeplerOrbit } from './orbitMath';

const parsed = parseMoonEphemerisArtifact(generated);
const catalog = createSolarSystemCatalog({ moonEphemerides: parsed.bodies });
const references = oracle.bodies as Record<string, {
  status: string; states?: { jd_tdb: number; position_au: number[]; velocity_au_per_day: number[] }[];
}>;
const AU_KM = 149597870.7;

describe('SCN-043 independent catalog repair gates', () => {
  it('retains all 424 catalog records, including provider gaps and unrepaired models', () => {
    expect(rawMoons).toHaveLength(424);
    expect(Object.keys(references)).toHaveLength(424);
    for (const moon of rawMoons) expect(references[String(moon.id)]).toBeDefined();
  });
  for (const moon of rawMoons) {
    const fit = parsed.bodies[moon.name.toLowerCase()];
    const reference = references[String(moon.id)];
    const available = !!reference.states?.length;
    const state = !available ? 'provider unavailable' : !fit ? 'repair pending, oracle available' : 'independent accuracy';
    it.skipIf(!fit || !available)(`${moon.planet}/${moon.name}: ${state}`, () => {
      const body = catalog.bodies.find(b => b.type === 'moon' && b.name === moon.name && b.parentId === moon.planet.toLowerCase())!;
      const newlyRepaired = fit.provenance.generator === 'scripts/repair_catalog_moon_ephemeris.py';
      const positionLimit = newlyRepaired ? Math.min(500, .001 * moon.aKm) : fit.validation.accuracyLimits.positionKm;
      const velocityLimit = newlyRepaired ? 10 : fit.validation.accuracyLimits.velocityMPerS;
      if (newlyRepaired) {
        expect(fit.validation.accuracyLimits).toEqual({positionKm: positionLimit, velocityMPerS: velocityLimit});
      }
      for (const truth of reference.states!) {
        expect(truth.jd_tdb).toBeGreaterThanOrEqual(fit.coverageStartJd);
        expect(truth.jd_tdb).toBeLessThanOrEqual(fit.coverageEndJd);
        const p = new Vector3(), v = new Vector3();
        expect(propagateKeplerOrbit(body.orbit!, truth.jd_tdb - body.orbit!.epochJd, p, v)).toBe(true);
        const positionError = p.distanceTo(new Vector3(...truth.position_au)) * AU_KM;
        const velocityError = v.distanceTo(new Vector3(...truth.velocity_au_per_day)) * AU_KM * 1000 / 86400;
        expect(positionError, `${moon.name} JD ${truth.jd_tdb} km`).toBeLessThanOrEqual(positionLimit);
        expect(velocityError, `${moon.name} JD ${truth.jd_tdb} m/s`).toBeLessThanOrEqual(velocityLimit);
      }
    });
  }
});
