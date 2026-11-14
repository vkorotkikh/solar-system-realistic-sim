import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createSolarSystemCatalog } from './catalog';
import {
  propagateKeplerOrbit,
  resolveKeplerOrbitAtElapsedDays,
  sampleOrbitLoop,
  solveKeplerFast,
  type KeplerOrbit
} from './orbitMath';

describe('orbitMath secular drift support', () => {
  it('applies configured secular rates when resolving orbit elements', () => {
    const orbit: KeplerOrbit = {
      epochJd: 2_451_545.0,
      aAu: 1.0,
      periodDays: 365.25,
      e: 0.1,
      iDeg: 2,
      ascendingNodeDeg: 10,
      argPeriapsisDeg: 20,
      meanAnomalyDeg: 30,
      secularRates: {
        aAuPerCentury: 0.02,
        ePerCentury: 0.03,
        iDegPerCentury: -0.5,
        ascendingNodeDegPerCentury: 15,
        argPeriapsisDegPerCentury: -5
      }
    };

    const resolved = resolveKeplerOrbitAtElapsedDays(orbit, 36_525);

    expect(resolved.aAu).toBeCloseTo(1.02, 10);
    expect(resolved.e).toBeCloseTo(0.13, 10);
    expect(resolved.iRad).toBeCloseTo((1.5 * Math.PI) / 180, 10);
    expect(resolved.ascendingNodeRad).toBeCloseTo((25 * Math.PI) / 180, 10);
    expect(resolved.argPeriapsisRad).toBeCloseTo((15 * Math.PI) / 180, 10);
  });

  it('reports secular model range exhaustion atomically through the propagation adapter', () => {
    const orbit: KeplerOrbit = {
      epochJd: 2_451_545,
      aAu: 1,
      periodDays: 365.25,
      e: 0.1,
      secularRates: { ePerCentury: -0.2 }
    };
    const position = new Vector3(1, 2, 3);
    const velocity = new Vector3(4, 5, 6);

    expect(propagateKeplerOrbit(orbit, 36_525, position, velocity)).toBe(false);
    expect(position.toArray()).toEqual([1, 2, 3]);
    expect(velocity.toArray()).toEqual([4, 5, 6]);
    expect(() => resolveKeplerOrbitAtElapsedDays(orbit, 36_525)).toThrow(
      'secular drift produced an invalid elliptic orbit'
    );
  });

  it('keeps malformed secular inputs as programmer errors', () => {
    const malformed: KeplerOrbit = {
      epochJd: 2_451_545,
      aAu: 1,
      periodDays: 365.25,
      e: -0.1,
      secularRates: {}
    };

    expect(() => propagateKeplerOrbit(malformed, 0, new Vector3())).toThrow(
      'source-frame orbit requires'
    );
  });

});

describe('solveKeplerFast', () => {
  it('solves Kepler\'s equation for every eccentricity below 1, including e >= 0.99', () => {
    let worst = 0;
    for (const e of [0, 0.1, 0.5, 0.9, 0.97, 0.99, 0.995, 0.999, 0.9999]) {
      for (let k = 0; k <= 720; k++) {
        const M = (k / 720) * 2 * Math.PI;
        const E = solveKeplerFast(M, e);
        worst = Math.max(worst, Math.abs(E - e * Math.sin(E) - M));
      }
    }
    expect(worst).toBeLessThan(1e-9);
  });
});

describe('orbit loop sampling', () => {
  it('spaces vertices uniformly in eccentric anomaly, starting at perihelion', () => {
    // a = 2, e = 0.6 in the reference plane, periapsis on +x, epoch away from perihelion.
    const orbit: KeplerOrbit = { epochJd: 2_451_545, aAu: 2, periodDays: 1_000, e: 0.6, meanAnomalyDeg: 75 };
    const segments = 8;
    const out = new Float32Array(segments * 3);

    expect(sampleOrbitLoop(orbit, segments, out)).toBe(true);
    for (let k = 0; k < segments; k++) {
      const eccentricAnomaly = (k / segments) * 2 * Math.PI;
      expect(out[k * 3]).toBeCloseTo(2 * (Math.cos(eccentricAnomaly) - 0.6), 5);
      expect(out[k * 3 + 1]).toBeCloseTo(1.6 * Math.sin(eccentricAnomaly), 5);
      expect(out[k * 3 + 2]).toBeCloseTo(0, 6);
    }
  });

  it('closes every Sun-orbiting catalog loop without a jump at its seam', () => {
    const segments = 512;
    const out = new Float32Array(segments * 3);
    for (const body of createSolarSystemCatalog().bodies) {
      if (!body.orbit || body.type === 'star' || body.type === 'moon') continue;
      expect(sampleOrbitLoop(body.orbit, segments, out), body.id).toBe(true);
      const chord = (k: number) => {
        const i = ((k % segments) + segments) % segments;
        const j = (i + 1) % segments;
        return Math.hypot(out[j * 3] - out[i * 3], out[j * 3 + 1] - out[i * 3 + 1], out[j * 3 + 2] - out[i * 3 + 2]);
      };
      // Chords change smoothly around a closed loop. Spanning a rounded periodDays
      // leaves Saturn 0.023 AU apart next to 0.12 AU chords (about 20%), and the
      // anomalistic period leaves Neptune 0.28 AU apart (about 75%). Pluto's own
      // apsidal precession over one revolution keeps 0.037 AU (8%) at its seam.
      let worst = 0;
      for (let k = 0; k < segments; k++) {
        worst = Math.max(worst, Math.abs(chord(k) / ((chord(k - 1) + chord(k + 1)) / 2) - 1));
      }
      expect(worst, body.id).toBeLessThan(0.1);
    }
  });
});

describe('sampleOrbitLoop around a later date', () => {
  // A Moon-like orbit: its node regresses about 19 degrees a year.
  const precessing: KeplerOrbit = {
    epochJd: 2451545, aAu: 0.00257, periodDays: 27.32, e: 0.055, iDeg: 5.1, ascendingNodeDeg: 125, argPeriapsisDeg: 318, meanAnomalyDeg: 135,
    secularRates: { ascendingNodeDegPerCentury: -1934, argPeriapsisDegPerCentury: 6004 },
  };
  const nearest = (loop: Float32Array, point: Vector3) => {
    let best = Infinity;
    for (let i = 0; i < loop.length; i += 3) best = Math.min(best, Math.hypot(loop[i] - point.x, loop[i + 1] - point.y, loop[i + 2] - point.z));
    return best;
  };

  it('draws the revolution containing that date, so the body is on its line', () => {
    const atEpoch = new Float32Array(512 * 3), current = new Float32Array(512 * 3), position = new Vector3();
    expect(sampleOrbitLoop(precessing, 512, atEpoch)).toBe(true);
    // Across a whole month, because the old and new orbit planes cross at two points.
    let worstOnCurrentLine = 0, worstOnEpochLine = 0;
    for (let day = 0; day < 28; day++) {
      const elapsed = 9_800.4 + day;
      expect(propagateKeplerOrbit(precessing, elapsed, position)).toBe(true);
      expect(sampleOrbitLoop(precessing, 512, current, elapsed)).toBe(true);
      worstOnCurrentLine = Math.max(worstOnCurrentLine, nearest(current, position) / position.length());
      worstOnEpochLine = Math.max(worstOnEpochLine, nearest(atEpoch, position) / position.length());
    }
    expect(worstOnCurrentLine).toBeLessThan(0.02);
    expect(worstOnEpochLine).toBeGreaterThan(0.1);
  });

  it('is unchanged by default', () => {
    const implicit = new Float32Array(64 * 3), explicit = new Float32Array(64 * 3);
    sampleOrbitLoop(precessing, 64, implicit);
    sampleOrbitLoop(precessing, 64, explicit, 0);
    expect(Array.from(implicit)).toEqual(Array.from(explicit));
  });
});
