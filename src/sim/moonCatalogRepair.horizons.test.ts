/** All-424 production-asset accounting; missing fits or references fail the gate. */
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import rawMoons from '../data/moons.json';
import generated from '../data/moonEphemerisChebyshev.json';
import oracle from '../../backend/tests/fixtures/all_moons_horizons_oracle.json';
import spk75052 from '../../backend/tests/fixtures/uranus_75052_spk_capture.json';
import daphnisLegacy from '../../backend/tests/fixtures/daphnis_legacy_spk_capture.json';
import { createSolarSystemCatalog } from './catalog';
import { loadMoonEphemerides } from './loadMoonEphemerides';
import { publicShardFetch } from './moonRepairTestInputs.mjs';
import { propagateKeplerOrbit } from './orbitMath';

// Exercise the production loader against actual published bytes, never candidate caches.
const baseKeys = new Set(Object.keys(await loadMoonEphemerides()));
const parsed = { bodies: await loadMoonEphemerides({
  additionalBodyKeys: rawMoons.map(moon => moon.name.toLowerCase()).filter(key => !baseKeys.has(key)),
  lazyOptions: { fetch: publicShardFetch }
}) };
const catalog = createSolarSystemCatalog({ moonEphemerides: parsed.bodies });
const references = { ...oracle.bodies } as Record<string, {
  status: string; states?: { jd_tdb: number; position_au: number[]; velocity_au_per_day: number[] }[];
}>;
const spkMoon = rawMoons.find(moon => String(moon.iauCode) === '75052')!;
references[String(spkMoon.id)] = {
  status: 'captured',
  states: spk75052.states.map(row => ({jd_tdb: row.jdTdb, position_au: row.positionAu, velocity_au_per_day: row.velocityAuDay}))
};
const daphnisMoon = rawMoons.find(moon => String(moon.iauCode) === '635')!;
const liveDaphnis = references[String(daphnisMoon.id)];
references[String(daphnisMoon.id)] = {
  status: 'captured_with_legacy_provider_supplement',
  states: daphnisLegacy.states.map(row => liveDaphnis.states?.find(live => live.jd_tdb === row.jd_tdb) ?? row)
};
const AU_KM = 149597870.7;

describe('SCN-043 independent catalog repair gates', () => {
  it('retains all 424 catalog records, including both source exceptions and duplicate Puck', () => {
    expect(rawMoons).toHaveLength(424);
    expect(Object.keys(parsed.bodies)).toHaveLength(423);
    expect(Object.keys(references)).toHaveLength(424);
    for (const moon of rawMoons) expect(references[String(moon.id)]).toBeDefined();
  });
  for (const moon of rawMoons) {
    const fit = parsed.bodies[moon.name.toLowerCase()];
    const reference = references[String(moon.id)];
    const available = !!reference.states?.length;
    const state = !available ? 'provider unavailable' : !fit ? 'repair pending, oracle available' : 'independent accuracy';
    it(`${moon.planet}/${moon.name}: ${state}`, () => {
      expect(fit).toBeDefined();
      expect(available).toBe(true);
      expect(reference.states).toHaveLength(7);
      const body = catalog.bodies.find(b => b.type === 'moon' && b.name === moon.name && b.parentId === moon.planet.toLowerCase())!;
      const newlyRepaired = !(moon.name.toLowerCase() in generated.bodies);
      const positionLimit = newlyRepaired ? Math.min(500, .001 * moon.aKm) : fit.validation.accuracyLimits.positionKm;
      const velocityLimit = newlyRepaired ? 10 : fit.validation.accuracyLimits.velocityMPerS;
      if (newlyRepaired) {
        // Duplicate Puck records share NAIF 715 and a model with the stricter cap.
        expect(fit.provenance.targetId).toBe(String(moon.iauCode));
        expect(fit.validation.accuracyLimits.positionKm).toBeGreaterThan(0);
        expect(fit.validation.accuracyLimits.positionKm).toBeLessThanOrEqual(positionLimit);
        expect(fit.validation.accuracyLimits.velocityMPerS).toBeGreaterThan(0);
        expect(fit.validation.accuracyLimits.velocityMPerS).toBeLessThanOrEqual(velocityLimit);
      }
      for (const truth of reference.states!) {
        expect(truth.jd_tdb).toBeGreaterThanOrEqual(fit.coverageStartJd);
        expect(truth.jd_tdb).toBeLessThanOrEqual(fit.coverageEndJd);
        const p = new Vector3(), v = new Vector3();
        expect(propagateKeplerOrbit(body.orbit!, truth.jd_tdb - body.orbit!.epochJd, p, v)).toBe(true);
        const positionError = p.distanceTo(new Vector3(...truth.position_au)) * AU_KM;
        const velocityError = v.distanceTo(new Vector3(...truth.velocity_au_per_day)) * AU_KM * 1000 / 86400;
        expect(positionError, `${moon.name} JD ${truth.jd_tdb} km`).toBeLessThanOrEqual(Math.min(positionLimit, fit.validation.accuracyLimits.positionKm));
        expect(velocityError, `${moon.name} JD ${truth.jd_tdb} m/s`).toBeLessThanOrEqual(Math.min(velocityLimit, fit.validation.accuracyLimits.velocityMPerS));
      }
    });
  }
});
