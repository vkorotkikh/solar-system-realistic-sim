import { describe, expect, it } from 'vitest';
import type { Line, Mesh } from 'three';
import { CLOUD_RENDER_ORDER } from './cloudShell';
import { OrbitalSatelliteSystem } from './satelliteSystem';

// Earth's cloud shell is see-through, writes no depth and is depth-tested with an offset toward
// the camera. Opaque objects draw before every see-through one, so an opaque marker within that
// offset (or, in enlarged scale, inside the 7,900 km cloud lift) ended up under the clouds.
// Satellites orbit above the clouds, so every marker style must draw after the shell. (Sprite
// markers already are see-through; their canvas texture needs a DOM, so they are not built here.)
describe('satellite markers draw after Earth\'s cloud shell', () => {
  it.each([
    ['instanced spheres', { useInstancing: true }],
    ['spheres', { useInstancing: false }],
  ])('%s', async (_style, options) => {
    // No TLE sources: the module's built-in records, no network.
    const system = new OrbitalSatelliteSystem({ primaryId: 'earth', tleSources: {}, ...options });
    await system.initialize();
    const markers = system.group.children.filter((object) => !(object as Line).isLine) as Mesh[];
    expect(markers.length).toBeGreaterThan(0);
    for (const marker of markers) {
      expect(marker.material).toMatchObject({ transparent: true });
      expect(marker.renderOrder).toBeGreaterThan(CLOUD_RENDER_ORDER);
    }
    system.dispose();
  });
});
