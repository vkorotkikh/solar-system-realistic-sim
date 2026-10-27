import {
  BufferGeometry,
  Group,
  LineBasicMaterial,
  Mesh,
  PerspectiveCamera,
  Sprite,
  SpriteMaterial,
  Texture
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createLocalSystemRenderer } from './localSystemRenderer';
import { disposeThreeMaterial } from './textureManager';

type RendererArgs = Parameters<typeof createLocalSystemRenderer>[0];
type RendererState = RendererArgs['state'];

function onDispose(resource: { addEventListener: (type: 'dispose', listener: () => void) => void }) {
  const listener = vi.fn();
  resource.addEventListener('dispose', listener);
  return listener;
}

function makeHarness() {
  const sharedSunGeometry = new BufferGeometry();
  const sharedPlanetGeometry = new BufferGeometry();
  const cachedSurfaceTexture = new Texture();
  const createdLabels: Array<{ sprite: Sprite; material: SpriteMaterial; texture: Texture }> = [];
  const createdGlows: Array<{ sprite: Sprite; material: SpriteMaterial; texture: Texture }> = [];
  const state: RendererState = {
    activeLocalSystem: null,
    localTextureCache: new Map(),
    localOrbitLines: [],
    localBodyEntries: [],
    localBodyById: new Map(),
    localBodyMeshById: new Map(),
    localBodyNodeById: new Map(),
    localSystemManifestCache: new Map()
  };
  const simState = { useRealisticScale: false, followBodyId: null };
  const renderer = createLocalSystemRenderer({
    dom: {
      toggleLabels: { checked: true },
      toggleOrbits: { checked: true },
      statusFocus: { textContent: '' }
    },
    simState: simState as never,
    camera: new PerspectiveCamera(),
    controls: { target: new Group().position, minDistance: 0 },
    constants: { AU_KM: 149_597_870.7, J2000_JD: 2_451_545 },
    state,
    localSystemGroup: new Group(),
    geometryCache: { sun: sharedSunGeometry, planet: sharedPlanetGeometry },
    createLabelSprite: () => {
      const texture = new Texture();
      const material = new SpriteMaterial({ map: texture });
      const sprite = new Sprite(material);
      createdLabels.push({ sprite, material, texture });
      return sprite;
    },
    createSunGlow: () => {
      const texture = new Texture();
      const material = new SpriteMaterial({ map: texture });
      const sprite = new Sprite(material);
      createdGlows.push({ sprite, material, texture });
      return sprite;
    },
    textureTools: {
      loadHiResTexture: () => cachedSurfaceTexture,
      configureLoadedTexture: vi.fn(),
      generateMoonTexture: () => null,
      generatePlanetTexture: () => null
    },
    mathTools: { stableHash: () => 0 },
    orbitTools: { propagateKeplerOrbit: () => true },
    disposeThreeMaterial
  });
  return {
    renderer,
    state,
    sharedSunGeometry,
    sharedPlanetGeometry,
    cachedSurfaceTexture,
    createdLabels,
    createdGlows
  };
}

const systemB = {
  id: 'system-b',
  name: 'System B',
  stars: [{ id: 'star-b', name: 'Star B', type: 'star', radius_km: 100_000 }]
};

describe('local-system resource disposal', () => {
  it('releases per-scene body, label, and glow resources while preserving shared caches', () => {
    const harness = makeHarness();
    expect(harness.renderer.buildLocalSystemScene({
      id: 'system-a',
      name: 'System A',
      stars: [{ id: 'star-a', name: 'Star A', type: 'star', radius_km: 100_000 }],
      planets: [{
        id: 'planet-a',
        name: 'Planet A',
        type: 'planet',
        radius_km: 5_000,
        observed_texture: '/planet-a.png'
      }]
    })).toBe(true);

    const bodyMaterials = harness.state.localBodyEntries.flatMap((entry) => {
      const material = (entry.mesh as Mesh).material;
      return Array.isArray(material) ? material : [material];
    });
    const bodyDisposals = bodyMaterials.map(onDispose);
    const labelMaterialDisposals = harness.createdLabels.map(entry => onDispose(entry.material));
    const labelTextureDisposals = harness.createdLabels.map(entry => onDispose(entry.texture));
    const glowMaterialDisposal = onDispose(harness.createdGlows[0].material);
    const glowTextureDisposal = onDispose(harness.createdGlows[0].texture);
    const sharedSunDisposal = onDispose(harness.sharedSunGeometry);
    const sharedPlanetDisposal = onDispose(harness.sharedPlanetGeometry);
    const cachedTextureDisposal = onDispose(harness.cachedSurfaceTexture);

    expect(harness.renderer.buildLocalSystemScene(systemB)).toBe(true);

    bodyDisposals.forEach(disposed => expect(disposed).toHaveBeenCalledOnce());
    labelMaterialDisposals.forEach(disposed => expect(disposed).toHaveBeenCalledOnce());
    labelTextureDisposals.forEach(disposed => expect(disposed).toHaveBeenCalledOnce());
    expect(glowMaterialDisposal).toHaveBeenCalledOnce();
    expect(glowTextureDisposal).toHaveBeenCalledOnce();
    expect(sharedSunDisposal).not.toHaveBeenCalled();
    expect(sharedPlanetDisposal).not.toHaveBeenCalled();
    expect(cachedTextureDisposal).not.toHaveBeenCalled();
    expect(harness.state.localTextureCache.get('system-a:planet-a')).toBe(harness.cachedSurfaceTexture);

    const systemBMaterial = (harness.state.localBodyEntries[0].mesh as Mesh).material;
    const systemBBodyDisposals = (Array.isArray(systemBMaterial) ? systemBMaterial : [systemBMaterial]).map(onDispose);
    const systemBLabel = harness.createdLabels[harness.createdLabels.length - 1];
    const systemBGlow = harness.createdGlows[harness.createdGlows.length - 1];
    const systemBLabelMaterialDisposal = onDispose(systemBLabel.material);
    const systemBLabelTextureDisposal = onDispose(systemBLabel.texture);
    const systemBGlowMaterialDisposal = onDispose(systemBGlow.material);
    const systemBGlowTextureDisposal = onDispose(systemBGlow.texture);

    harness.renderer.clearActiveLocalSystemScene();
    harness.renderer.clearActiveLocalSystemScene();
    systemBBodyDisposals.forEach(disposed => expect(disposed).toHaveBeenCalledOnce());
    expect(systemBLabelMaterialDisposal).toHaveBeenCalledOnce();
    expect(systemBLabelTextureDisposal).toHaveBeenCalledOnce();
    expect(systemBGlowMaterialDisposal).toHaveBeenCalledOnce();
    expect(systemBGlowTextureDisposal).toHaveBeenCalledOnce();
  });

  it('releases a quadtree material without disposing its shared patch geometry', () => {
    const harness = makeHarness();
    expect(harness.renderer.buildLocalSystemScene({
      id: 'earth-system',
      planets: [{ id: 'earth', name: 'Earth', type: 'planet', radius_km: 6_371 }]
    })).toBe(true);
    const quadtree = harness.state.localBodyEntries[0].mesh.userData.quadtree;
    const patch = quadtree.group.children[0] as Mesh;
    const materialDisposal = onDispose(quadtree.material);
    const sharedPatchGeometryDisposal = onDispose(patch.geometry);

    expect(harness.renderer.buildLocalSystemScene(systemB)).toBe(true);

    expect(materialDisposal).toHaveBeenCalledOnce();
    expect(sharedPatchGeometryDisposal).not.toHaveBeenCalled();
    expect(quadtree.group.children).toHaveLength(0);

    quadtree.dispose();
    harness.renderer.clearActiveLocalSystemScene();
    harness.renderer.clearActiveLocalSystemScene();
    expect(materialDisposal).toHaveBeenCalledOnce();
    expect(sharedPatchGeometryDisposal).not.toHaveBeenCalled();
  });
});
