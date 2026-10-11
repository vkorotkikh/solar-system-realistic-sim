import { describe, expect, it } from 'vitest';
import { M87, SGR_A } from './smbhPhysicsConstants';
import { computeMultiMessengerTimeline, heliosphereEquilibriumTime } from './smbhPropagation';
import { createAgnShockwaveEngine } from './agnShockwaveEngine';

// Independent 2GM/c^2 with CODATA 2018 G, c and IAU nominal solar mass parameter.
const schwarzschildCm = (massMsun: number) => (2 * 1.32712440018e26 * massMsun) / 2.99792458e10 ** 2;

describe('SMBH physics constants', () => {
  it('uses 2GM/c^2 for the Schwarzschild radius and the radii derived from it', () => {
    expect(SGR_A.rSchwarzschildCm / schwarzschildCm(4.154e6)).toBeCloseTo(1, 2); // ~1.23e12 cm, not 1.24e10
    expect(M87.rSchwarzschildCm / schwarzschildCm(6.5e9)).toBeCloseTo(1, 2); // ~1.92e15 cm, not 1.9e13
    expect(SGR_A.rIscoCm / SGR_A.rSchwarzschildCm).toBeCloseTo(3, 12);
    expect(SGR_A.rPhotonCm / SGR_A.rSchwarzschildCm).toBeCloseTo(1.5, 12);
  });

  it('reports the heliosphere equilibrium time in seconds, without a stray 1e5', () => {
    // 1e60 erg is the smallest decade whose blast still compresses the heliosphere at 8 kpc.
    const response = computeMultiMessengerTimeline(SGR_A, 1e60, (35 * Math.PI) / 180).heliosphereResponse;
    expect(response.pressureFactor).toBeGreaterThan(1);
    expect(response.equilibriumTimeSec).toBe(heliosphereEquilibriumTime(response.pressureFactor));
    // t = dR / v_LISM: (120 - R_HP) AU at 26 km/s is decades, not the 1.9 Myr the extra 1e5 gave.
    const expectedSec = ((120 - response.compressedHeliopauseAU) * 1.495978707e8) / 26;
    expect(response.equilibriumTimeSec / expectedSec).toBeCloseTo(1, 2);
  });
});

describe('AGN shockwave front', () => {
  function frontDistanceAt(seconds: number, observerFrame: boolean, hypothesis: string): number {
    let dist = Number.NaN;
    const displayer = { toggle() {}, setParams(p: { shockwaveDist?: number }) { if (p.shockwaveDist !== undefined) dist = p.shockwaveDist; } };
    const engine = createAgnShockwaveEngine(displayer, null);
    engine.setObserverFrameMode(observerFrame);
    engine.triggerEvent('SagittariusA', 8, 1, { hypothesis });
    for (let t = 0; t < seconds - 1e-9; t += 0.05) engine.update(0.05);
    return dist;
  }

  it.each([
    [true, 'compound'], [false, 'compound'], [true, 'h29']
  ])('reaches the Sun when its channel fires (observerFrame=%s, %s)', (observerFrame, hypothesis) => {
    // Before the fix the front hit at 8 s / beta_app (4.07 s for Sgr A*), ahead of the GW it is anchored to.
    expect(frontDistanceAt(7.5, observerFrame, hypothesis)).toBeGreaterThan(0);
    expect(frontDistanceAt(8.0, observerFrame, hypothesis)).toBeCloseTo(0, 6);
  });
});
