import { describe, expect, it } from 'vitest';
import { AU_KM } from '../../../constants';
import { AU_CM, C_CM_S, M_SUN_G, PC_CM } from './smbhPhysicsConstants';
import {
  gertsenshteinProbability,
  gwMemoryStrain,
  gwRootSumSquareStrain,
  schwarzschildRingdownFrequencyHz,
} from './smbhPropagation';

const KPC = 3.0856775814913673e21;

describe('exotic-mode physics formulas', () => {
  it('uses the exact conversions shared with the rest of the simulation (EXO-013)', () => {
    expect(AU_CM).toBe(AU_KM * 1e5);
    expect(C_CM_S).toBe(2.99792458e10);
    expect(PC_CM).toBeCloseTo(3.0856775814913673e18, -4);
    expect(M_SUN_G / 1.98841e33).toBeCloseTo(1, 5);
  });

  it('turns radiated energy into a root-sum-square strain only with a frequency (EXO-015)', () => {
    // E = (pi^2 c^3 / G) d^2 f^2 h_rss^2 for a narrowband burst (LIGO-P070105):
    // 1e50 erg at 1 kpc and 100 Hz gives 5.134e-19 per root hertz.
    expect(gwRootSumSquareStrain(1e50, KPC, 100) / 5.134e-19).toBeCloseTo(1, 3);
    expect(gwRootSumSquareStrain(1e50, KPC, 200) / gwRootSumSquareStrain(1e50, KPC, 100)).toBeCloseTo(0.5, 12);
    // The permanent memory strain is G E / (c^4 d) in order of magnitude: 2.678e-21.
    expect(gwMemoryStrain(1e50, KPC) / 2.678e-21).toBeCloseTo(1, 3);
    // Schwarzschild l = m = 2 ringdown: about 12.07 kHz for one solar mass.
    expect(schwarzschildRingdownFrequencyHz(M_SUN_G) / 1.2074e4).toBeCloseTo(1, 3);
  });

  it('converts gravitons to photons with G B^2 L^2 / c^4 per coherent domain (EXO-016)', () => {
    // 1 G over 1 cm is G / c^4 = 8.2627e-50 in Gaussian units.
    expect(gertsenshteinProbability(1, 1) / 8.2627e-50).toBeCloseTo(1, 3);
    const domain = 100 * PC_CM;
    const oneDomain = gertsenshteinProbability(5e-6, domain, domain);
    // Coherent: quadratic in path length up to one domain ...
    expect(gertsenshteinProbability(5e-6, domain / 2, domain) / oneDomain).toBeCloseTo(0.25, 12);
    // ... then randomly oriented domains add their probabilities.
    expect(gertsenshteinProbability(5e-6, 40 * domain, domain) / oneDomain).toBeCloseTo(40, 9);
  });
});
