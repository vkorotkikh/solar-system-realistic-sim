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
    for (const body of createSolarSystemCatalog({ moonsVisible: false }).bodies) {
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
