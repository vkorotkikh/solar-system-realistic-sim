// @ts-nocheck
import { RepeatWrapping } from 'three';
import { moonTextureCatalogEntryForBody } from './moonTextureCatalog';

function defaultConfigureTexture(texture) {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
}

export class MoonTexturePipeline {
  constructor({ textureLoader, configureTexture = null } = {}) {
    this.textureLoader = textureLoader ?? null;
    this.configureTexture = typeof configureTexture === 'function' ? configureTexture : defaultConfigureTexture;
    this.cache = new Map();
    this.inFlight = new Map();
    this.failedKeys = new Set();
  }

  sourceForBody(body) {
    return moonTextureCatalogEntryForBody(body);
  }

  attributionForBody(body) {
    return this.sourceForBody(body)?.source ?? null;
  }

  hasCuratedSource(body) {
    return Boolean(this.sourceForBody(body));
  }

  requestTexture(body, onReady = null) {
    const source = this.sourceForBody(body);
    if (!source || !source.publicPath || !this.textureLoader) {
      return null;
    }

    if (this.cache.has(source.key)) {
      return this.cache.get(source.key);
    }

    if (this.failedKeys.has(source.key)) {
      return null;
    }

    if (!this.inFlight.has(source.key)) {
      const loadPromise = new Promise((resolve, reject) => {
        this.textureLoader.load(
          source.publicPath,
          (texture) => {
            this.configureTexture(texture);
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
        .catch(() => {
          this.inFlight.delete(source.key);
          this.failedKeys.add(source.key);
          return null;
        });

      this.inFlight.set(source.key, loadPromise);
    }

    if (typeof onReady === 'function') {
      this.inFlight.get(source.key).then((texture) => {
        if (texture) {
          onReady(texture, source);
        }
      });
    }

    return null;
  }

  async preloadForBodies(bodies) {
    if (!Array.isArray(bodies) || bodies.length === 0) return;
    const promises = [];
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
