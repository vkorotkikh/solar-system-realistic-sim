import { LinearFilter, NoColorSpace, RepeatWrapping, type Texture } from 'three';
import type { PlanetQuadtree } from './quadtreeLOD';

const TEXTURE_ROOT = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}textures/surfaces/`;

/**
 * The Moon elevation map comes from NASA's CGI Moon Kit: half-metres above a 1727.4 km sphere,
 * scaled here to 8 bits, so full range is 32.7675 km and the 1737.4 km datum sits 10 km up.
 * Mars has imagery only: the retained MOLA file is a shaded-relief picture, not heights.
 */
export const PLANET_SURFACE_SOURCES = Object.freeze({
  moon: {
    albedo: 'moon_albedo_lroc_8192.jpg',
    relief: { file: 'moon_relief_ldem16_5760.png', zero: 10 / 32.7675, rangeOverRadius: 32.7675 / 1737.4 },
  },
  mars: { albedo: 'mars_albedo_usgs_4096.jpg' },
});
type SurfaceId = keyof typeof PLANET_SURFACE_SOURCES;

interface SurfaceTarget { visualId: SurfaceId; tree: PlanetQuadtree }

/**
 * Loads every map as soon as the page starts, whatever the camera distance or the
 * Moons switch, and passes each texture to `upload` so it reaches the GPU on arrival
 * rather than at the frame that first draws it.
 */
export function createPlanetSurfaceMaps({ targets, textureLoader, maxAnisotropy, upload }: {
  targets: readonly SurfaceTarget[]; textureLoader: { loadAsync(url: string): Promise<Texture> }; maxAnisotropy: number;
  upload?: (texture: Texture) => void;
}) {
  const loaded: Texture[] = [];
  let disposed = false;

  async function loadTexture(file: string, configure: (texture: Texture) => void) {
    const texture = await textureLoader.loadAsync(`${TEXTURE_ROOT}${file}`);
    // The planet shader lights and writes raw display values, so no sRGB decode.
    texture.colorSpace = NoColorSpace;
    texture.wrapS = RepeatWrapping;
    configure(texture);
    texture.needsUpdate = true;
    if (disposed) texture.dispose(); else { loaded.push(texture); upload?.(texture); }
    return texture;
  }

  async function load({ visualId, tree }: SurfaceTarget) {
    const source: { albedo: string; relief?: { file: string; zero: number; rangeOverRadius: number } } = PLANET_SURFACE_SOURCES[visualId];
    try {
      const [albedo, reliefMap] = await Promise.all([
        loadTexture(source.albedo, (texture) => { texture.anisotropy = maxAnisotropy; }),
        source.relief && loadTexture(source.relief.file, (texture) => {
          texture.generateMipmaps = false;
          texture.minFilter = LinearFilter;
        }),
      ]);
      if (disposed) return;
      tree.setSurfaceMaps({
        albedo,
        relief: source.relief && reliefMap ? { ...source.relief, map: reliefMap } : undefined,
      });
    } catch (error) {
      console.warn(`[surface-maps] ${visualId}: keeping procedural surface:`, error);
    }
  }

  const ready = Promise.all(targets.map(load)).then(() => undefined);

  return {
    /** Settles once every map has been applied or has failed back to the procedural surface. */
    ready,
    dispose() {
      disposed = true;
      for (const texture of loaded) texture.dispose();
    },
  };
}
