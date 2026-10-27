import { Color, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';

import { NAMED_ASTEROIDS } from '../../../sim/asteroidBelt';
import { createAsteroidBeltRenderer } from './beltRenderer';

describe('main-belt instance colors', () => {
  it('uses instanceColor without enabling a missing vertex color attribute', () => {
    const asteroid = NAMED_ASTEROIDS[0];
    const renderer = createAsteroidBeltRenderer([asteroid]);

    try {
      expect(renderer.mesh.geometry.getAttribute('color')).toBeUndefined();
      expect(renderer.mesh.instanceColor).not.toBeNull();

      const expected = new Color(asteroid.color);
      expect(renderer.mesh.instanceColor!.getX(0)).toBeCloseTo(expected.r);
      expect(renderer.mesh.instanceColor!.getY(0)).toBeCloseTo(expected.g);
      expect(renderer.mesh.instanceColor!.getZ(0)).toBeCloseTo(expected.b);

      const material = renderer.mesh.material;
      expect(material).toBeInstanceOf(MeshStandardMaterial);
      expect((material as MeshStandardMaterial).vertexColors).toBe(false);
    } finally {
      renderer.dispose();
    }
  });
});
