/** PLAN021 gate-integrity boundaries, separate from the actual CLI/model regressions. */
import { describe, expect, it } from 'vitest';
import truthJson from '../../scripts/fixtures/planet-positions-horizons.json';
import { createSolarSystemCatalog } from './catalog';
import { evaluateEarthVelocity } from './planetPositionCheck';
import type { PlanetPositionFixture, PropagateFn } from './planetPositionCheck';

const catalog = createSolarSystemCatalog();
const earthOrbit = catalog.bodies.find(body => body.id === 'earth')!.orbit!;
const truth = () => structuredClone(truthJson) as PlanetPositionFixture;
const zeroVelocity: PropagateFn = (_orbit, _elapsed, position, velocity) => {
  position.set(0, 0, 0);
  velocity!.set(0, 0, 0);
  return true;
};

function constantError(errorMs: number): PlanetPositionFixture {
  const fixture = truth();
  for (const state of fixture.bodies.earth.states) {
    state.vx = -errorMs / 1000;
    state.vy = 0;
    state.vz = 0;
  }
  return fixture;
}

describe('Earth399 velocity gate integrity', () => {
  it('rejects exactly 2 m/s rather than accepting an inclusive boundary', () => {
    const report = evaluateEarthVelocity(catalog, zeroVelocity, constantError(2));
    expect(report.rows).toHaveLength(6);
    for (const row of report.rows) {
      expect(row.errMs).toBe(2);
      expect(row.budgetMs).toBe(2);
      expect(row.ok).toBe(false);
    }
  });

  it('accepts the representable value just below 2 m/s at every fixture epoch', () => {
    const fixture = constantError(2 - 2 * Number.EPSILON);
    const calls: number[] = [];
    const propagate: PropagateFn = (orbit, elapsed, position, velocity) => {
      expect(orbit).toBe(earthOrbit);
      expect(velocity).toBeTruthy();
      calls.push(elapsed);
      zeroVelocity(orbit, elapsed, position, velocity);
      // The established propagator interface also permits a successful void return.
    };
    const before = structuredClone(fixture);
    const report = evaluateEarthVelocity(catalog, propagate, fixture);
    expect(calls).toEqual(fixture.bodies.earth.states.map(state => state.jd - earthOrbit.epochJd));
    expect(report.rows.map(row => row.jd)).toEqual(fixture._epochs.map(epoch => epoch.jd));
    expect(report.rows.every(row => row.errMs === 1.9999999999999996 && row.ok)).toBe(true);
    expect(fixture).toEqual(before);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'does not pass a nonfinite propagated velocity (%s)', value => {
      const propagate: PropagateFn = (_orbit, _elapsed, position, velocity) => {
        position.set(0, 0, 0);
        velocity!.set(value, 0, 0);
        return true;
      };
      const report = evaluateEarthVelocity(catalog, propagate, constantError(0));
      expect(report.rows).toHaveLength(6);
      expect(report.rows.every(row => !Number.isFinite(row.errMs) && !row.ok)).toBe(true);
    },
  );

  it('does not invent zero velocity when a void propagator publishes no output', () => {
    const report = evaluateEarthVelocity(catalog, () => {}, constantError(0));
    expect(report.rows).toHaveLength(6);
    expect(report.rows.every(row => Number.isNaN(row.errMs) && !row.ok)).toBe(true);
  });

  it('throws check-cannot-run on explicit propagation failure, even after prior valid output', () => {
    let calls = 0;
    const propagate: PropagateFn = (orbit, elapsed, position, velocity) => {
      calls++;
      if (calls === 2) return false;
      return zeroVelocity(orbit, elapsed, position, velocity);
    };
    expect(() => evaluateEarthVelocity(catalog, propagate, constantError(0)))
      .toThrow(/state unavailable/i);
    expect(calls).toBe(2);
  });

  it('rejects absent Earth truth before any propagation', () => {
    const fixture = truth();
    delete fixture.bodies.earth;
    let calls = 0;
    expect(() => evaluateEarthVelocity(catalog, () => { calls++; }, fixture)).toThrow(/earth/i);
    expect(calls).toBe(0);
  });

  it.each(['3', ''])('rejects unsupported Earth target %j before any propagation', hid => {
    const fixture = truth();
    fixture.bodies.earth.hid = hid;
    let calls = 0;
    expect(() => evaluateEarthVelocity(catalog, () => { calls++; }, fixture)).toThrow(/399/);
    expect(calls).toBe(0);
  });

  it('rejects empty Earth truth instead of returning successful empty acceptance', () => {
    const fixture = truth();
    fixture.bodies.earth.states = [];
    expect(() => evaluateEarthVelocity(catalog, zeroVelocity, fixture)).toThrow(/earth/i);
  });

  it('leaves missing catalog Earth to the existing positional missing-body failure', () => {
    const withoutEarth = { ...catalog, bodies: catalog.bodies.filter(body => body.id !== 'earth') };
    let calls = 0;
    expect(evaluateEarthVelocity(withoutEarth, () => { calls++; }, truth())).toEqual({
      bodyId: 'earth', hid: '399', budgetMs: 2, rows: [],
    });
    expect(calls).toBe(0);
  });
});
