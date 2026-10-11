import { describe, expect, it } from 'vitest';
import { generateAsteroidElement } from './asteroidDistributions';

const DEG = Math.PI / 180;

function meanLongitudeStats(population: string) {
  let sx = 0, sy = 0;
  const n = 2000;
  for (let k = 0; k < n; k++) {
    const el = generateAsteroidElement(population);
    const lambda = (el.ascendingNodeDeg + el.argPeriapsisDeg + el.meanAnomalyDeg) * DEG;
    sx += Math.cos(lambda); sy += Math.sin(lambda);
  }
  const meanDeg = ((Math.atan2(sy, sx) / DEG) + 360) % 360;
  const resultant = Math.hypot(sx, sy) / n; // 1 = all at one longitude, 0 = uniform
  return { meanDeg, resultant };
}

describe('Jupiter Trojans', () => {
  it.each([
    ['trojan-l4', 34.396 + 60],
    ['trojan-l5', 34.396 - 60 + 360]
  ])('cluster in mean longitude about %s', (population, expectedDeg) => {
    const { meanDeg, resultant } = meanLongitudeStats(population);
    expect(Math.abs(((meanDeg - expectedDeg + 540) % 360) - 180)).toBeLessThan(3);
    expect(resultant).toBeGreaterThan(0.9); // 15 deg libration spread; uniform would be ~0.02
  });
});
