import { RepeatWrapping, Texture, TextureLoader } from 'three';
import { moonTextureCatalogEntryForBody } from './moonTextureCatalog';

interface MoonBody {
  parentId: string;
  name?: string;
  id: string;
}

interface CatalogEntry {
  key: string;
  publicPath: string;
  source: {
    provider: string;
    dataset: string;
    productPage: string;
    credit: string;
    license: string;
  };
  [key: string]: unknown;
}

interface PipelineOptions {
  textureLoader?: TextureLoader | null;
  configureTexture?: ((texture: Texture) => void) | null;
}

function defaultConfigureTexture(texture: Texture): void {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
}

export class MoonTexturePipeline {
  textureLoader: TextureLoader | null;
  configureTexture: (texture: Texture) => void;
  cache: Map<string, Texture>;
  inFlight: Map<string, Promise<Texture | null>>;
  failedKeys: Set<string>;

  constructor({ textureLoader = null, configureTexture = null }: PipelineOptions = {}) {
    this.textureLoader = textureLoader ?? null;
    this.configureTexture = typeof configureTexture === 'function' ? configureTexture : defaultConfigureTexture;
    this.cache = new Map();
    this.inFlight = new Map();
    this.failedKeys = new Set();
  }

  sourceForBody(body: MoonBody): CatalogEntry | null {
    return moonTextureCatalogEntryForBody(body) as CatalogEntry | null;
  }

  attributionForBody(body: MoonBody): CatalogEntry['source'] | null {
    return this.sourceForBody(body)?.source ?? null;
  }

  hasCuratedSource(body: MoonBody): boolean {
    return Boolean(this.sourceForBody(body));
  }

  requestTexture(body: MoonBody, onReady: ((texture: Texture, source: CatalogEntry) => void) | null = null): Texture | null {
    const source = this.sourceForBody(body);
    if (!source || !source.publicPath || !this.textureLoader) {
      return null;
    }

    if (this.cache.has(source.key)) {
      return this.cache.get(source.key)!;
    }

    if (this.failedKeys.has(source.key)) {
      return null;
    }

    if (!this.inFlight.has(source.key)) {
      const loader = this.textureLoader;
      const configureFn = this.configureTexture;
      const loadPromise = new Promise<Texture>((resolve, reject) => {
        loader.load(
          source.publicPath,
          (texture: Texture) => {
            configureFn(texture);
            resolve(texture);
          },
          undefined,
          reject
        );
      })
        .then((texture) => {
          this.cache.set(source.key, texture);
          this.inFlight.delete(source.key);
          return texture;
        })
        .catch((): null => {
          this.inFlight.delete(source.key);
          this.failedKeys.add(source.key);
          return null;
        });

      this.inFlight.set(source.key, loadPromise);
    }

    if (typeof onReady === 'function') {
      this.inFlight.get(source.key)!.then((texture) => {
        if (texture) {
          onReady(texture, source);
        }
      });
    }

    return null;
  }

  async preloadForBodies(bodies: MoonBody[]): Promise<void> {
    if (!Array.isArray(bodies) || bodies.length === 0) return;
    const promises: Promise<Texture | null>[] = [];
    for (const body of bodies) {
      const source = this.sourceForBody(body);
      if (!source || this.cache.has(source.key) || this.failedKeys.has(source.key)) continue;
      this.requestTexture(body);
      const pending = this.inFlight.get(source.key);
      if (pending) promises.push(pending);
    }
    await Promise.allSettled(promises);
  }
}
