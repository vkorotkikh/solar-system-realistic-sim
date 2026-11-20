import { LinearFilter, NoColorSpace, RepeatWrapping, type Texture } from 'three';
import type { PlanetQuadtree, PlanetSurfaceMaps } from './quadtreeLOD';

const TEXTURE_ROOT = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}textures/surfaces/`;

/**
 * The Moon elevation map comes from NASA's CGI Moon Kit: half-metres above a 1727.4 km sphere,
 * scaled here to 8 bits, so full range is 32.7675 km and the 1737.4 km datum sits 10 km up.
 * Mars has imagery only: the retained MOLA file is a shaded-relief picture, not heights.
 * Earth's four maps come from scripts/build_earth_surface_maps.py: NASA Blue Marble: Next
 * Generation colour (August 2004), relief shading from NOAA ETOPO 2022 slopes, a Natural Earth
 * water mask for the sun glint, and NASA's Blue Marble clouds. The globe stays smooth.
 */
export const PLANET_SURFACE_SOURCES = Object.freeze({
  moon: {
    albedo: 'moon_albedo_lroc_8192.jpg',
    relief: { file: 'moon_relief_ldem16_5760.png', zero: 10 / 32.7675, rangeOverRadius: 32.7675 / 1737.4 },
  },
  mars: { albedo: 'mars_albedo_usgs_4096.jpg' },
  earth: {
    albedo: 'earth_albedo_bmng_200408_8192.jpg',
    normal: 'earth_normal_etopo2022_8192.png',
    water: 'earth_water_ne10m_8192.png',
    clouds: 'earth_clouds_bmng_2048.jpg',
  },
});
type SurfaceId = keyof typeof PLANET_SURFACE_SOURCES;
interface SurfaceSource {
  albedo: string;
  relief?: { file: string; zero: number; rangeOverRadius: number };
  normal?: string;
  water?: string;
  clouds?: string;
}

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

  const filtered = (texture: Texture) => { texture.anisotropy = maxAnisotropy; };

  async function load({ visualId, tree }: SurfaceTarget) {
    const source: SurfaceSource = PLANET_SURFACE_SOURCES[visualId];
    const failed = (file: string, outcome: string) => (error: unknown) => {
      console.warn(`[surface-maps] ${visualId}: ${file} failed, ${outcome}:`, error);
      return undefined;
    };
    // `ready` must settle for every body, so a throw here cannot strand the others.
    const apply = (maps: Partial<PlanetSurfaceMaps>) => {
      if (disposed) return false;
      try {
        tree.setSurfaceMaps(maps);
        return true;
      } catch (error) {
        console.warn(`[surface-maps] ${visualId}: keeping procedural surface:`, error);
        return false;
      }
    };
    // Every map loads at once. The colour map is drawn on arrival and is the only one
    // required; each other layer is drawn when it lands, or freed if the colour map failed.
    const colour = loadTexture(source.albedo, filtered)
      .then((albedo) => apply({ albedo }), failed(source.albedo, 'keeping procedural surface'))
      .then(Boolean);
    const layer = (file: string | undefined, configure: (texture: Texture) => void,
      maps: (texture: Texture) => Partial<PlanetSurfaceMaps>) => file && loadTexture(file, configure).then(
      async (texture) => { if (await colour) apply(maps(texture)); else texture.dispose(); },
      failed(file, 'drawing without it'),
    );
    const { relief } = source;
    await Promise.all([
      colour,
      layer(relief?.file, (texture) => {
        texture.generateMipmaps = false;
        texture.minFilter = LinearFilter;
      }, (map) => ({ relief: relief && { ...relief, map } })),
      layer(source.normal, filtered, (normal) => ({ normal })),
      layer(source.water, filtered, (water) => ({ water })),
      layer(source.clouds, filtered, (clouds) => ({ clouds })),
    ]);
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
