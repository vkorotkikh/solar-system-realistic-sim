import {
  SRGBColorSpace,
  TextureLoader
} from 'three';

export function createTextureManager({
  maxAnisotropy,
  crossOrigin = 'anonymous'
}) {
  const textureLoader = new TextureLoader();
  const solarObservationTextureLoader = new TextureLoader();
  textureLoader.setCrossOrigin(crossOrigin);
  solarObservationTextureLoader.setCrossOrigin(crossOrigin);

  function configureLoadedTexture(texture, { isColorMap = true } = {}) {
    texture.anisotropy = maxAnisotropy;
    texture.generateMipmaps = true;
    if (isColorMap) {
      texture.colorSpace = SRGBColorSpace;
    }
  }

  function disposeThreeMaterial(material) {
    if (!material) return;
    if (Array.isArray(material)) {
      material.forEach(disposeThreeMaterial);
      return;
    }
    if (typeof material.dispose === 'function') {
      material.dispose();
    }
  }

  function loadHiResTexture(url, options = {}) {
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
