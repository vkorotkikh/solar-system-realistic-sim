/**
 * Accuracy regression tests for secular-rate propagation.
 *
 * These exist because the secular-rate feature shipped with a defect that the
 * other orbitMath tests cannot see: they assert only that elements and positions
 * *changed*, never that they got *closer to reality*, so they stayed green while
 * planet positions became 4.8x worse than the fixed-element propagation they
 * replaced.
 *
 * The bar here is therefore an independent oracle, not a re-implementation:
 * heliocentric ecliptic-J2000 positions from JPL Horizons. Anything that
 * re-derives the expected values from orbitMath itself would be tautological.
 *
 * Fixture provenance
 *   JPL Horizons API, EPHEM_TYPE=VECTORS, CENTER=500@10 (Sun body centre),
 *   REF_PLANE=ECLIPTIC (J2000), OUT_UNITS=AU-D, VEC_CORR=NONE,
 *   TLIST=2461275.5. Body ids 199/299/399/499/599/699/799/899.
 *   Retrieved 2026-08-23.
 */
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { PLANETS } from '../data/planets';
import { propagateKeplerOrbit, type KeplerOrbit } from './orbitMath';

const TARGET_JD = 2_461_275.5;
const AU_KM = 149_597_870.7;

/** Heliocentric ecliptic-J2000 position (AU) — see fixture provenance above. */
const HORIZONS_AU: Record<string, [number, number, number]> = {
  mercury: [-0.208324937, 0.251798490, 0.039684790],
  venus: [0.269323779, -0.675829957, -0.024824859],
  earth: [0.871695995, -0.512706627, 0.000028178],
  mars: [0.631951035, 1.369345143, 0.013200834],
  jupiter: [-3.260004488, 4.170966586, 0.055611924],
  saturn: [9.309522714, 1.553075770, -0.397623591],
  uranus: [9.068071450, 17.204778405, -0.053681530],
  neptune: [29.843998062, 1.257211697, -0.713633122]
};

/**
 * Per-planet ceilings in km. Each is comfortably above what the corrected
 * propagator produces and comfortably below what the double-counted version
 * produced, so a regression of that class fails here rather than silently
 * shipping. Reference values at this epoch:
 *   planet    fixed      double-counted    fixed-element (pre-secular-rates)
 *   earth     17,118       182,212            10,487
 *   saturn   719,253     3,092,998         1,179,208
 *   uranus   953,611     6,113,608         1,033,678
 *   neptune  671,859     7,462,417           665,089
 */
const MAX_ERROR_KM: Record<string, number> = {
  earth: 60_000,
  mars: 120_000,
  jupiter: 1_200_000,
  saturn: 1_000_000,
  uranus: 1_500_000,
  neptune: 1_000_000
};

/** The fixed-element propagator this feature replaced scored 3,963,526 km. */
const MAX_TOTAL_ERROR_KM = 3_600_000;

function positionErrorKm(id: string): number {
  const planet = (PLANETS as any[]).find((p) => p.id === id);
  if (!planet?.orbit) throw new Error(`no orbit for ${id}`);
  const actual = new Vector3();
  propagateKeplerOrbit(planet.orbit, TARGET_JD - planet.orbit.epochJd, actual);
  const [x, y, z] = HORIZONS_AU[id];
  return actual.distanceTo(new Vector3(x, y, z)) * AU_KM;
}

describe('secular-rate propagation accuracy vs JPL Horizons', () => {
  it.each(Object.keys(MAX_ERROR_KM))('places %s within its error budget', (id) => {
    expect(positionErrorKm(id)).toBeLessThan(MAX_ERROR_KM[id]);
  });

  it('beats the fixed-element propagator across all eight planets', () => {
    const total = Object.keys(HORIZONS_AU).reduce((sum, id) => sum + positionErrorKm(id), 0);
    expect(total).toBeLessThan(MAX_TOTAL_ERROR_KM);
  });
});

describe('bodies without secular rates are unaffected', () => {
  it('propagates identically with and without an empty secularRates block', () => {
    // Moons, asteroids and KBOs carry no rates; the correction must vanish for them.
    const orbit: KeplerOrbit = {
      epochJd: 2_451_545.0,
      aAu: 5.2,
      e: 0.048,
      iDeg: 1.3,
      ascendingNodeDeg: 100.5,
      argPeriapsisDeg: 273.9,
      meanAnomalyDeg: 20.02,
      periodDays: 4332.59
    };
    const withRates: KeplerOrbit = { ...orbit, secularRates: {} };

    for (const elapsedDays of [0, 365.25, 36_525, -36_525]) {
      const a = new Vector3();
      const b = new Vector3();
      propagateKeplerOrbit(orbit, elapsedDays, a);
      propagateKeplerOrbit(withRates, elapsedDays, b);
      expect(a.x).toBe(b.x);
      expect(a.y).toBe(b.y);
      expect(a.z).toBe(b.z);
    }
  });
});
