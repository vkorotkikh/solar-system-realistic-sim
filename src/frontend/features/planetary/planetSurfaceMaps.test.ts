import { PerspectiveCamera, Texture } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlanetSurfaceMaps } from './planetSurfaceMaps';
import { PlanetQuadtree } from './quadtreeLOD';

const trees: PlanetQuadtree[] = [];
afterEach(() => { for (const tree of trees.splice(0)) tree.dispose(); vi.restoreAllMocks(); });

function target(visualId: 'moon' | 'mars' | 'earth') {
  const tree = new PlanetQuadtree(visualId, 0.01, new PerspectiveCamera(), visualId);
  trees.push(tree);
  return { visualId, tree };
}
const loaderFor = () => ({ loadAsync: vi.fn(async (_url: string) => new Texture()) });
const failing = (file: string) => ({
  loadAsync: vi.fn(async (url: string) => { if (url.endsWith(file)) throw new Error('offline'); return new Texture(); }),
});

describe('createPlanetSurfaceMaps', () => {
  it('preloads every map at creation and hands each texture to the GPU upload', async () => {
    const textureLoader = loaderFor();
    const upload = vi.fn();
    const maps = createPlanetSurfaceMaps({ targets: [target('moon'), target('mars'), target('earth')], textureLoader, maxAnisotropy: 8, upload });
    // Requested at once: no camera distance or visibility gate. Moon 2, Mars 1, Earth 4.
    expect(textureLoader.loadAsync).toHaveBeenCalledTimes(7);
    await maps.ready;
    expect(upload).toHaveBeenCalledTimes(7);
  });

  it('gives Earth the NASA colour map on a smooth globe, with relief shading and the water mask', async () => {
    const textureLoader = loaderFor();
    const earth = target('earth');
    await createPlanetSurfaceMaps({ targets: [earth], textureLoader, maxAnisotropy: 8 }).ready;
    const urls = textureLoader.loadAsync.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      expect.stringMatching(/\/textures\/surfaces\/earth_albedo_bmng_200408_8192\.jpg$/),
      expect.stringMatching(/\/earth_normal_etopo2022_8192\.png$/),
      expect.stringMatching(/\/earth_water_ne10m_8192\.png$/),
      expect.stringMatching(/\/earth_clouds_bmng_2048\.jpg$/),
    ]);
    const { uAlbedoReady, uTerrainMode, uNormalReady, uWaterReady, uNormalMap, uWaterMap } = earth.tree.material.uniforms;
    expect(uAlbedoReady.value).toBe(1);
    expect(uTerrainMode.value).toBe(2);
    expect(uNormalReady.value).toBe(1);
    expect(uWaterReady.value).toBe(1);
    expect(uNormalMap.value).toBeInstanceOf(Texture);
    expect(uWaterMap.value).toBeInstanceOf(Texture);
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

  it.each([
    ['earth', 'earth_albedo_bmng_200408_8192.jpg', 3],
    ['moon', 'moon_albedo_lroc_8192.jpg', 1],
  ] as const)('keeps the procedural %s, with no other layer, when its colour map fails', async (visualId, file, others) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const released: Texture[] = [];
    const textureLoader = { loadAsync: vi.fn(async (url: string) => {
      if (url.endsWith(file)) throw new Error('offline');
      const texture = new Texture();
      texture.addEventListener('dispose', () => released.push(texture));
      return texture;
    }) };
    const body = target(visualId);
    await createPlanetSurfaceMaps({ targets: [body], maxAnisotropy: 8, textureLoader }).ready;
    const uniforms = body.tree.material.uniforms;
    expect(uniforms.uAlbedoReady.value).toBe(0);
    expect(uniforms.uTerrainMode.value).toBe(0);
    expect(uniforms.uNormalReady?.value ?? 0).toBe(0);
    expect(uniforms.uWaterReady?.value ?? 0).toBe(0);
    expect(body.tree.clouds).toBeUndefined();
    // The layers that did load are freed at once rather than held on the GPU unused.
    expect(released).toHaveLength(others);
  });

  it('names the layer, and keeps the colour map, when applying one layer throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const earth = target('earth');
    const apply = earth.tree.setSurfaceMaps.bind(earth.tree);
    vi.spyOn(earth.tree, 'setSurfaceMaps').mockImplementation((maps) => {
      if (maps.clouds) throw new Error('context lost');
      apply(maps);
    });
    await createPlanetSurfaceMaps({ targets: [earth], textureLoader: loaderFor(), maxAnisotropy: 8 }).ready;
    expect(earth.tree.material.uniforms.uAlbedoReady.value).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/earth: clouds .*drawing without it/);
  });

  it('draws the colour map without waiting for a slow layer, then adds the layer when it lands', async () => {
    let release!: (texture: Texture) => void;
    const textureLoader = { loadAsync: vi.fn((url: string) => url.endsWith('earth_normal_etopo2022_8192.png')
      ? new Promise<Texture>((resolve) => { release = resolve; })
      : Promise.resolve(new Texture())) };
    const earth = target('earth');
    const maps = createPlanetSurfaceMaps({ targets: [earth], textureLoader, maxAnisotropy: 8 });
    const uniforms = earth.tree.material.uniforms;
    await vi.waitFor(() => expect(uniforms.uAlbedoReady.value).toBe(1));
    expect(uniforms.uWaterReady.value).toBe(1);
    expect(earth.tree.clouds).toBeDefined();
    expect(uniforms.uNormalReady.value).toBe(0);
    release(new Texture());
    await maps.ready;
    expect(uniforms.uNormalReady.value).toBe(1);
  });

  it('keeps the Moon on its relief whatever order its maps arrive in', async () => {
    let releaseColour!: (texture: Texture) => void;
    const textureLoader = { loadAsync: vi.fn((url: string) => url.endsWith('moon_albedo_lroc_8192.jpg')
      ? new Promise<Texture>((resolve) => { releaseColour = resolve; })
      : Promise.resolve(new Texture())) };
    const moon = target('moon');
    const maps = createPlanetSurfaceMaps({ targets: [moon], textureLoader, maxAnisotropy: 8 });
    await vi.waitFor(() => expect(releaseColour).toBeTypeOf('function'));
    expect(moon.tree.material.uniforms.uTerrainMode.value).toBe(0); // no relief before the colour map
    releaseColour(new Texture());
    await maps.ready;
    expect(moon.tree.material.uniforms.uTerrainMode.value).toBe(1);
  });

  it.each([
    ['earth', 'earth_normal_etopo2022_8192.png', 'uNormalReady'],
    ['earth', 'earth_water_ne10m_8192.png', 'uWaterReady'],
    ['earth', 'earth_clouds_bmng_2048.jpg', undefined],
    ['moon', 'moon_relief_ldem16_5760.png', undefined],
  ] as const)('drops only the failed layer when %s %s fails', async (visualId, file, flag) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const body = target(visualId);
    await createPlanetSurfaceMaps({ targets: [body], maxAnisotropy: 8, textureLoader: failing(file) }).ready;
    const uniforms = body.tree.material.uniforms;
    expect(uniforms.uAlbedoReady.value).toBe(1);
    expect(uniforms.uTerrainMode.value).toBe(2); // smooth globe: the Moon without its relief too
    if (flag) expect(uniforms[flag].value).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain(file);
  });

  it('settles ready and keeps the other bodies when applying one body throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const earth = target('earth');
    const moon = target('moon');
    vi.spyOn(earth.tree, 'setSurfaceMaps').mockImplementation(() => { throw new Error('context lost'); });
    await expect(createPlanetSurfaceMaps({ targets: [earth, moon], textureLoader: loaderFor(), maxAnisotropy: 8 }).ready).resolves.toBeUndefined();
    expect(moon.tree.material.uniforms.uAlbedoReady.value).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('[surface-maps] earth');
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
