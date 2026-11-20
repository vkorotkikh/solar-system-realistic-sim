import { describe, expect, it } from 'vitest';
import type { MoonChebyshevEphemeris } from '../../../sim/moonEphemeris';
import type { KeplerOrbit } from '../../../sim/orbitMath';
import { moonPositionStatusText } from './moonPositionStatus';

// The shipped fits cover exactly this span: 2000-01-01 12:00 to 2050-01-01 00:00 TDB.
const START = 2_451_545;
const END = 2_469_807.5;

function fit(): MoonChebyshevEphemeris {
  return {
    kind: 'horizons-chebyshev-elements-v1',
    coverageStartJd: START,
    coverageEndJd: END,
    meanLongitudeBaseDeg: 0,
    meanLongitudeRateDegPerDay: 90,
    sourceStepDays: 0.25,
    segments: [{
      startJd: START,
      endJd: END,
      coefficients: [[149_597_870.7], [0], [0], [1], [0.01], [0], [0], [0], [90]]
    }],
    provenance: {
      source: 'test', sourceEphemeris: 'test', targetId: '1', centerId: '0', frame: 'ECLIPJ2000',
      timeScale: 'TDB', generatedAt: '2000-01-01T00:00:00Z', generator: 'test', query: 'test'
    }
  };
}

const elements = { epochJd: START, aAu: 1, periodDays: 4 };
const fitted = (): KeplerOrbit[] => [
  { ...elements, ephemeris: fit() },
  { ...elements, ephemeris: fit() },
  { ...elements, ephemeris: fit(), ephemerisRequired: true }
];

describe('moon position status line', () => {
  it('says nothing while every moon is at a fitted position', () => {
    expect(moonPositionStatusText(fitted(), START)).toBeNull();
    expect(moonPositionStatusText(fitted(), END)).toBeNull();
  });

  it.each([START - 1, END + 1])('names the fitted years once the date leaves them (JD %d)', (jd) => {
    expect(moonPositionStatusText(fitted(), jd)).toBe('Moons · 2 approximate, 1 hidden · fits cover 2000–2050');
  });

  it('says so when the fits did not load', () => {
    const unfitted = fitted().map((orbit) => ({ ...orbit, ephemeris: undefined }));
    expect(moonPositionStatusText(unfitted, START + 1)).toBe(
      'Moons · 2 approximate, 1 hidden · fitted positions not loaded'
    );
  });
});
