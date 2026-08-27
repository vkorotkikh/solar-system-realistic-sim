import { describe, expect, it } from 'vitest';
import fixtureJson from '../../scripts/fixtures/moon-positions-horizons.json';
import legacyJson from '../../scripts/fixtures/moon-frames-j2000-horizons.json';
import { createSolarSystemCatalog } from './catalog';
import { propagateKeplerOrbit } from './orbitMath';
import {
  BLIND_BUDGET_FRACTION,
  DATA_LIMITED,
  DRIFT_BUDGET_KM,
  MIN_EPOCHS,
  POSITION_BUDGET_KM,
  UTILISATION_BUDGET,
  compareMoonAtEpoch,
  evaluateMoonFrames,
  moonsByName,
  summarizeMoon,
  validateFixture,
  type MoonPositionFixture,
  type PropagateFn
} from './moonFrameCheck';

/**
 * Network-free moon frame + position gate.
 *
 * Propagates each catalog moon to SEVEN epochs and compares the resulting
 * parent-relative state against a committed JPL Horizons snapshot. See
 * ./moonFrameCheck.ts for what the three budgets mean and why there are three.
 *
 * The predecessor of this file checked ONE epoch, J2000, where every secular term is
 * identically zero. It was green while the propagator double-counted apsidal
 * precession badly enough to put the Moon 2.7e5 km (66% of its orbit radius) from
 * Horizons one year later. The epoch ladder below is the fix for the gate itself.
 *
 * The standalone `npm run verify:moon-frames` prints the same numbers as a moon x
 * epoch diagnostic table; this file is the version that `npm test` enforces.
 */

const fixture = fixtureJson as unknown as MoonPositionFixture;
const propagate = propagateKeplerOrbit as unknown as PropagateFn;

describe('moon positions vs JPL Horizons multi-epoch snapshot', () => {
  it('ships a structurally valid, provenanced, MULTI-EPOCH fixture', () => {
    expect(validateFixture(fixture)).toEqual([]);
    expect(fixture._epochs.length).toBeGreaterThanOrEqual(MIN_EPOCHS);
    expect(Object.keys(fixture.bodies).length).toBeGreaterThanOrEqual(20);
  });

  it('refuses a single-epoch fixture, so the J2000-only blind spot cannot come back', () => {
    const collapsed = {
      ...fixture,
      _epochs: fixture._epochs.slice(0, 1),
      bodies: Object.fromEntries(
        Object.entries(fixture.bodies).map(([k, b]) => [k, { ...b, states: b.states.slice(0, 1) }])
      )
    } as MoonPositionFixture;
    expect(validateFixture(collapsed).join('\n')).toMatch(/at least \d+ epochs/);
  });

  it('keeps the J2000 truth rows byte-identical to the legacy single-epoch fixture', () => {
    // The legacy fixture is retained purely as this anchor: it proves the multi-epoch
    // snapshot did not quietly restate the truth the 20-moon check was already using.
    for (const [name, legacy] of Object.entries(legacyJson.bodies)) {
      const state = fixture.bodies[name]?.states[0];
      expect(state, `${name} is missing from the multi-epoch fixture`).toBeDefined();
      expect({ ...state }).toEqual({
        jd: legacy.jd,
        x: legacy.x,
        y: legacy.y,
        z: legacy.z,
        vx: legacy.vx,
        vy: legacy.vy,
        vz: legacy.vz
      });
    }
  });

  const catalog = createSolarSystemCatalog();
  const byName = moonsByName(catalog);

  it('gates every moon in the fixture -- no silent pass-through', () => {
    const ungated = Object.keys(fixture.bodies).filter(
      (name) => !(name in POSITION_BUDGET_KM) || !(name in DRIFT_BUDGET_KM)
    );
    expect(ungated, 'fixture moons with no budget entry are not checked at all').toEqual([]);
  });

  for (const [name, body] of Object.entries(fixture.bodies)) {
    it(`${name} matches Horizons in position, orbit plane and drift at every epoch`, () => {
      const moon = byName.get(name);
      expect(moon, `${name} is missing from the catalog`).toBeDefined();

      const rows = body.states.map((state, k) =>
        compareMoonAtEpoch(name, moon!, state, fixture._epochs[k], propagate)
      );

      for (const row of rows) {
        // |r| is frame- and propagator-invariant given a and e, so a failure here
        // indicts the fixture or the element set, not the code under test.
        expect(row.radialWarning).toBeNull();

        expect(
          row.planeDeg,
          `${name} (${row.frame}) @ ${row.label}: orbit plane is ${row.planeDeg.toFixed(2)} deg off ` +
            `(budget ${row.planeBudgetDeg} deg). The plane angle is phase-immune, so this is a ` +
            'frame-conversion error in src/sim/catalog.ts or a node-precession error in orbitMath.ts.'
        ).toBeLessThanOrEqual(row.planeBudgetDeg);

        expect(
          row.errKm,
          `${name} (${row.frame}) @ ${row.label}: position is off by ${row.errKm.toExponential(3)} km ` +
            `(budget ${row.positionBudgetKm.toExponential(2)} km); ${(row.rel * 100).toFixed(1)}% of the ` +
            `orbit radius, ${row.sepDeg.toFixed(2)} deg from the true direction.`
        ).toBeLessThanOrEqual(row.positionBudgetKm);
      }

      const summary = summarizeMoon(name, rows);
      expect(
        summary.driftKm,
        `${name}: error GREW by ${summary.driftKm.toExponential(3)} km between J2000 and its worst ` +
          `epoch (budget ${summary.driftBudgetKm.toExponential(2)} km). Drift cancels the element ` +
          "set's own offset at the epoch, so this is a SECULAR RATE error, not a bad element set. " +
          'If you precess varpi = ascendingNode + argPeriapsis, subtract varpidot from the ' +
          'mean-anomaly advance, or it is double-counted.'
      ).toBeLessThanOrEqual(summary.driftBudgetKm);
    });
  }

  it('names a cause for every budget too wide to see a whole-orbit error', () => {
    // A budget above half the orbit radius is effectively blind at that epoch. That is
    // sometimes unavoidable -- the shipped element set for Titan is 1.9 orbit radii off
    // AT J2000 -- but it must never be silent. Each such row has to be attributable to a
    // named, measured data defect, or the loose budget is just an unexamined pass.
    const report = evaluateMoonFrames(catalog, propagate, fixture);
    const unexplained = report.rows
      .filter((r) => r.positionBudgetKm > BLIND_BUDGET_FRACTION * r.rTruthKm)
      .filter((r) => !(r.name in DATA_LIMITED))
      .map((r) => `${r.name} @ ${r.epochKey} (budget ${(r.positionBudgetKm / r.rTruthKm).toFixed(2)} r)`);
    expect(unexplained, 'wide budget with no DATA_LIMITED entry explaining it').toEqual([]);
  });

  it('stays within the aggregate budget-utilisation limit', () => {
    const report = evaluateMoonFrames(catalog, propagate, fixture);
    expect(report.missing).toEqual([]);
    expect(
      report.utilisation,
      `summed errKm/budgetKm over ${report.rows.length} moon x epoch rows is ` +
        `${report.utilisation.toFixed(1)} (budget ${UTILISATION_BUDGET}). Per-cell budgets are ` +
        'individual limits; this catches a model that sits just under all of them everywhere.'
    ).toBeLessThanOrEqual(UTILISATION_BUDGET);
  });
});
