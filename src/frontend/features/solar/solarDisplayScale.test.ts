import { Group, Line } from 'three';
import { describe, expect, it } from 'vitest';
import { buildSolarFeatureBlendView, type SolarFeatureSet } from './solarFeatureBlending';
import { SOLAR_RADIUS_AU, coronalToDisplay } from './solarDisplayScale';
import { updateSunCoronalLoopsFromBlendView, updateSunParkerSpiralFromPhysicsState } from './sunVisuals';

const ENLARGED_SUN_AU = 0.3755; // the default display radius (about 81x physical)

function maxDrawnRadiusAu(group: Group): number {
  let max = 0;
  group.traverse((child) => {
    if (!(child instanceof Line) || !child.visible) return;
    const position = child.geometry.getAttribute('position');
    const count = child.geometry.drawRange.count === Infinity ? position.count : child.geometry.drawRange.count;
    for (let i = 0; i < count; i += 1) max = Math.max(max, Math.hypot(position.getX(i), position.getY(i), position.getZ(i)));
  });
  return max;
}

describe('coronalToDisplay (owner decision D3)', () => {
  it('compresses height above the surface to 15% on the enlarged Sun', () => {
    expect(coronalToDisplay(4.74, ENLARGED_SUN_AU) / ENLARGED_SUN_AU).toBeCloseTo(1.561, 3);
    expect(coronalToDisplay(4.74, ENLARGED_SUN_AU)).toBeCloseTo(0.586, 3);
  });

  it('is physical at realistic scale and keeps the surface on the surface', () => {
    expect(coronalToDisplay(4.74, SOLAR_RADIUS_AU)).toBeCloseTo(4.74 * SOLAR_RADIUS_AU, 12);
    expect(coronalToDisplay(1, ENLARGED_SUN_AU)).toBe(ENLARGED_SUN_AU);
    expect(coronalToDisplay(3, ENLARGED_SUN_AU)).toBeGreaterThan(coronalToDisplay(2, ENLARGED_SUN_AU));
  });
});

describe('drawn extents on the enlarged Sun', () => {
  it('draws the Parker spiral at true distance, clipped inside the enlarged disk', () => {
    const group = new Group();
    const arc = Array.from({ length: 40 }, (_, i) => [1 + i * 16.5, 0, 0]); // out to ~645 R_sun (~3 AU)
    updateSunParkerSpiralFromPhysicsState(group, { heliosphere: { parker_spiral: { lines: [{ id: 'arm', arc }] } } }, ENLARGED_SUN_AU, 6, 120, 0, null);

    expect(maxDrawnRadiusAu(group)).toBeCloseTo(644.5 * SOLAR_RADIUS_AU, 6); // ~3.0 AU, was ~242 AU
    const line = group.children[0] as Line;
    const position = line.geometry.getAttribute('position');
    expect(Math.hypot(position.getX(0), position.getY(0), position.getZ(0))).toBeGreaterThanOrEqual(ENLARGED_SUN_AU * 1.05);
  });

  it('keeps a 4.74 R_sun loop within 1.6 display radii', () => {
    const feature = { id: 'loop-1', kind: 'loop', brightness: 1, speedFactor: 0, peakExtent: 4.74, arc: [[1, 0, 0], [4.74, 0, 0], [1, 0.01, 0]] };
    const set = { features: [feature], featureById: new Map([[feature.id, feature]]), activityIndex: 0.5, epochJd: 2_460_000.5 } as SolarFeatureSet;
    const view = buildSolarFeatureBlendView({ currentFeatureSet: set, targetFeatureSet: null, blendStartMs: 0, blendDurationMs: 1_000, nowMs: 2_000 });
    const group = new Group();
    updateSunCoronalLoopsFromBlendView(group, view, ENLARGED_SUN_AU, 144, 0, null);

    expect(maxDrawnRadiusAu(group)).toBeGreaterThan(ENLARGED_SUN_AU);
    expect(maxDrawnRadiusAu(group)).toBeLessThanOrEqual(1.6 * ENLARGED_SUN_AU);
  });
});
