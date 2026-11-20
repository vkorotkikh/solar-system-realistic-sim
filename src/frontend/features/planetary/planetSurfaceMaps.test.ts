import { PerspectiveCamera, Texture } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlanetSurfaceMaps } from './planetSurfaceMaps';
import { PlanetQuadtree } from './quadtreeLOD';

const trees: PlanetQuadtree[] = [];
afterEach(() => { for (const tree of trees.splice(0)) tree.dispose(); vi.restoreAllMocks(); });

function target(visualId: 'moon' | 'mars') {
  const tree = new PlanetQuadtree(visualId, 0.01, new PerspectiveCamera(), visualId);
  trees.push(tree);
  return { visualId, tree };
}
const loaderFor = () => ({ loadAsync: vi.fn(async () => new Texture()) });

describe('createPlanetSurfaceMaps', () => {
  it('preloads every map at creation and hands each texture to the GPU upload', async () => {
    const textureLoader = loaderFor();
    const upload = vi.fn();
    const maps = createPlanetSurfaceMaps({ targets: [target('moon'), target('mars')], textureLoader, maxAnisotropy: 8, upload });
    // Requested at once: no camera distance or visibility gate.
    expect(textureLoader.loadAsync).toHaveBeenCalledTimes(3);
    await maps.ready;
    expect(upload).toHaveBeenCalledTimes(3);
  });

  it('applies the Moon maps in true kilometres', async () => {
    const textureLoader = loaderFor();
    const moon = target('moon');
    const maps = createPlanetSurfaceMaps({ targets: [moon], textureLoader, maxAnisotropy: 8 });
    await maps.ready;
    expect(textureLoader.loadAsync).toHaveBeenCalledTimes(2);
    const { uTerrainMode, uReliefZero, uDisplacementScale, uAlbedoReady } = moon.tree.material.uniforms;
    expect(uAlbedoReady.value).toBe(1);
    expect(uTerrainMode.value).toBe(1);
    // Heights are 1.0 full scale = 32.7675 km over a 1737.4 km Moon; the datum is 10 km up the range.
    expect(uDisplacementScale.value).toBeCloseTo(0.01 * 32.7675 / 1737.4, 12);
    expect(uReliefZero.value).toBeCloseTo(0.30518, 5);
    moon.tree.setRadius(0.02);
    expect(uDisplacementScale.value).toBeCloseTo(0.02 * 32.7675 / 1737.4, 12);
  });

  it('gives Mars imagery on a smooth globe, since no real heights ship', async () => {
    const textureLoader = loaderFor();
    const mars = target('mars');
    await createPlanetSurfaceMaps({ targets: [mars], textureLoader, maxAnisotropy: 8 }).ready;
    expect(textureLoader.loadAsync).toHaveBeenCalledTimes(1);
    expect(mars.tree.material.uniforms.uAlbedoReady.value).toBe(1);
    expect(mars.tree.material.uniforms.uTerrainMode.value).toBe(2);
  });

  it('keeps the procedural surface when a map fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const moon = target('moon');
    await createPlanetSurfaceMaps({
      targets: [moon], maxAnisotropy: 8, textureLoader: { loadAsync: vi.fn(async () => { throw new Error('offline'); }) },
    }).ready;
    expect(moon.tree.material.uniforms.uAlbedoReady.value).toBe(0);
    expect(moon.tree.material.uniforms.uTerrainMode.value).toBe(0);
  });

  it('releases every loaded texture on dispose', async () => {
    const textures: Texture[] = [];
    const textureLoader = { loadAsync: vi.fn(async () => { const texture = new Texture(); textures.push(texture); return texture; }) };
    const maps = createPlanetSurfaceMaps({ targets: [target('moon')], textureLoader, maxAnisotropy: 8 });
    await maps.ready;
    const released = textures.map(texture => { const spy = vi.fn(); texture.addEventListener('dispose', spy); return spy; });
    maps.dispose();
    for (const spy of released) expect(spy).toHaveBeenCalledTimes(1);
  });
});
