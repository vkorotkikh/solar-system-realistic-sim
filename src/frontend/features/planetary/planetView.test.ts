import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { createSolarSystemCatalog } from '../../../sim/catalog';
import { planetViewDistances } from './planetView';

describe.each(['earth', 'mars'])('%s camera scaling', (id) => {
  it('preserves angular framing and surface clearance in both radius modes', () => {
    const body = createSolarSystemCatalog().bodies.find((body) => body.id === id)!;
    const fractions: number[] = [];
    for (const radius of [body.displayRadiusAu, body.realRadiusAu]) {
      const distances = planetViewDistances(radius);
      expect(distances.focus / radius).toBeCloseTo(20, 12);
      expect(distances.minimum / radius).toBeCloseTo(1.1, 12);
      const camera = new PerspectiveCamera(58, 1, radius * 0.001, 20000);
      camera.position.set(0, 0, distances.focus);
      camera.updateMatrixWorld();
      const limb = new Vector3(radius, 0, 0).project(camera);
      expect(limb.x).toBeGreaterThan(0.05);
      expect(limb.x).toBeLessThan(0.2);
      fractions.push(limb.x);
      // Even the exaggerated relief envelope fits outside closest approach.
      expect(distances.minimum).toBeGreaterThan(radius * (id === 'earth' ? 1.02 : 1.06));
    }
    expect(fractions[0]).toBeCloseTo(fractions[1], 12);
  });
});
