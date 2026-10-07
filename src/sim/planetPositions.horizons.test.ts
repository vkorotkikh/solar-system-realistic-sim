import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import fixtureJson from '../../scripts/fixtures/planet-positions-horizons.json';
import { createSolarSystemCatalog } from './catalog';
import { propagateKeplerOrbit } from './orbitMath';
import {
  DRIFT_EPOCH_MIN_CENTURIES,
  MIN_EPOCHS,
  TOTAL_BUDGET_KM,
  comparePlanetAtEpoch,
  planetsById,
  summarizePlanet,
  validateFixture,
  type PlanetPositionFixture,
  type PlanetPositionRow,
  type PropagateFn
} from './planetPositionCheck';

/**
 * Network-free planet-position accuracy gate.
 *
 * Propagates each catalog planet to six epochs spanning 1900-2100 and compares
 * the heliocentric ecliptic-J2000 position against a committed JPL Horizons
 * snapshot. See ./planetPositionCheck.ts for what the two budgets mean, why they
 * are the sizes they are, and how they were measured.
 *
 * This asserts ACCURACY IN KILOMETRES, deliberately. The predecessor of this gate
 * asserted only that the secular rates changed the elements, which is true of a
 * correct propagator and of a badly wrong one alike -- that is how a propagator
 * that double-counts apsidal precession shipped. "Differs from before" is not a
 * correctness claim; "within N km of Horizons at six epochs" is.
 *
 * The standalone `npm run verify:planet-positions` prints the same numbers as a
 * full planet x epoch table; this file is the version that `npm test` enforces.
 */

const fixture = fixtureJson as unknown as PlanetPositionFixture;
const propagate = propagateKeplerOrbit as unknown as PropagateFn;

describe('planet positions vs JPL Horizons 1900-2100 snapshot', () => {
  it('ships a structurally valid, multi-epoch, provenanced fixture', () => {
    expect(validateFixture(fixture)).toEqual([]);
    expect(Object.keys(fixture.bodies).length).toBe(9); // eight planets + Pluto
    // The single-epoch trap: a model anchored at J2000 that drifts passes one
    // epoch by construction. Six epochs over two centuries is the whole point.
    expect(fixture._epochs.length).toBeGreaterThanOrEqual(MIN_EPOCHS);
    expect(
      fixture._epochs.filter((e) => Math.abs(e.jd - 2451545.0) / 36525 >= DRIFT_EPOCH_MIN_CENTURIES)
        .length
    ).toBeGreaterThanOrEqual(4);
  });

  const catalog = createSolarSystemCatalog();
  const byId = planetsById(catalog);
  const allRows: PlanetPositionRow[] = [];

  for (const [id, body] of Object.entries(fixture.bodies)) {
    describe(id, () => {
      const planet = byId.get(id);
      const rows = planet
        ? body.states.map((state, k) =>
            comparePlanetAtEpoch(id, planet, state, fixture._epochs[k].label, propagate)
          )
        : [];
      allRows.push(...rows);

      it('is in the catalog', () => {
        expect(planet, `${id} is missing from the catalog`).toBeDefined();
      });

      for (const row of rows) {
        it(`is within ${(row.budgetKm / 1e3).toFixed(0)} thousand km of Horizons at ${row.label}`, () => {
          // |r| is set by a, e and phase alone, so a failure here indicts the
          // fixture -- wrong centre, target or units -- not the propagator.
          expect(row.radialWarning).toBeNull();

          expect(
            row.errKm,
            `${id} @ ${row.label} (T = ${row.centuries.toFixed(2)} cy): ` +
              `${row.errKm.toExponential(3)} km off, budget ${row.budgetKm.toExponential(2)} km ` +
              `(${(row.rel * 100).toFixed(4)}% of r, ${row.sepDeg.toFixed(4)} deg). ` +
              'Run `npm run verify:planet-positions` for the full table.'
          ).toBeLessThanOrEqual(row.budgetKm);
        });
      }

      it('does not drift away from Horizons with time', () => {
        expect(planet).toBeDefined();
        const summary = summarizePlanet(id, rows);
        expect(
          summary.driftKm,
          `${id}: error grows by ${summary.driftKm.toExponential(3)} km between J2000 ` +
            `(${summary.j2000ErrKm.toExponential(3)} km) and its worst distant epoch ` +
            `(${summary.maxErrKm.toExponential(3)} km); budget ${summary.driftBudgetKm.toExponential(2)} km. ` +
            'Drift subtracts the J2000 error, so this is the secular-rate handling in ' +
            'resolveKeplerOrbitAtElapsedDays, not the accuracy of the J2000 elements themselves.'
        ).toBeLessThanOrEqual(summary.driftBudgetKm);
      });
    });
  }

  it('puts Earth at the geocentre, not the Earth-Moon barycentre', () => {
    // Standish "Earth" is the EMB, 4,476-4,890 km and 11.8-13.0 m/s from Earth over these epochs.
    // That offset hides inside the element set's own position error, so pin it with velocity:
    // the barycentre is 11-14 m/s off Horizons 399 here, the geocentre 0.5-1.5 m/s.
    const earth = byId.get('earth');
    expect(earth?.orbit).toBeTruthy();
    const position = new Vector3();
    const velocity = new Vector3();
    for (const truth of fixture.bodies.earth.states) {
      propagateKeplerOrbit(earth!.orbit!, truth.jd - earth!.orbit!.epochJd, position, velocity);
      const kmPerSecond = 149597870.7 / 86400;
      const errMs = 1000 * Math.hypot(
        velocity.x * kmPerSecond - truth.vx,
        velocity.y * kmPerSecond - truth.vy,
        velocity.z * kmPerSecond - truth.vz
      );
      expect(errMs, `Earth velocity at JD ${truth.jd}`).toBeLessThan(2);
    }
  });

  it('keeps the aggregate error over all 54 planet x epoch rows within budget', () => {
    expect(allRows.length).toBe(54);
    const totalKm = allRows.reduce((sum, r) => sum + r.errKm, 0);
    expect(
      totalKm,
      `total error ${totalKm.toExponential(4)} km over ${allRows.length} rows, ` +
        `budget ${TOTAL_BUDGET_KM.toExponential(3)} km. Per-planet budgets are worst-epoch ` +
        'limits; this catches a model that sits just under all of them everywhere.'
    ).toBeLessThanOrEqual(TOTAL_BUDGET_KM);
  });
});
