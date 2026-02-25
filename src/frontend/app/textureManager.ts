import {
  SRGBColorSpace,
  Texture,
  TextureLoader
} from 'three';

interface LoadTextureOptions {
  isColorMap?: boolean;
}

interface TextureManagerDeps {
  maxAnisotropy: number;
  crossOrigin?: string;
}

export interface TextureManager {
  textureLoader: TextureLoader;
  solarObservationTextureLoader: TextureLoader;
  configureLoadedTexture: (texture: Texture, options?: LoadTextureOptions) => void;
  disposeThreeMaterial: (material: unknown) => void;
  loadHiResTexture: (url: string, options?: LoadTextureOptions) => Texture;
}

export function createTextureManager({
  maxAnisotropy,
  crossOrigin = 'anonymous'
}: TextureManagerDeps): TextureManager {
  const textureLoader = new TextureLoader();
  const solarObservationTextureLoader = new TextureLoader();
  textureLoader.setCrossOrigin(crossOrigin);
  solarObservationTextureLoader.setCrossOrigin(crossOrigin);

  function configureLoadedTexture(texture: Texture, { isColorMap = true }: LoadTextureOptions = {}) {
    texture.anisotropy = maxAnisotropy;
    texture.generateMipmaps = true;
    if (isColorMap) {
      texture.colorSpace = SRGBColorSpace;
    }
  }

  function disposeThreeMaterial(material: unknown) {
    if (!material) return;
    if (Array.isArray(material)) {
      material.forEach(disposeThreeMaterial);
      return;
    }

    const maybeDisposable = material as { dispose?: () => void };
    if (typeof maybeDisposable.dispose === 'function') {
      maybeDisposable.dispose();
    }
  }

  function loadHiResTexture(url: string, options: LoadTextureOptions = {}) {
    const texture = textureLoader.load(
      url,
      (loaded) => configureLoadedTexture(loaded, options),
      undefined,
      () => {
        // Keep procedural fallback material behavior if a texture fails to load.
      }
    );
    configureLoadedTexture(texture, options);
    return texture;
  }

  return {
    textureLoader,
    solarObservationTextureLoader,
    configureLoadedTexture,
    disposeThreeMaterial,
    loadHiResTexture
  };
}
