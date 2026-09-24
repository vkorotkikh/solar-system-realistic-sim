import { CanvasTexture, RepeatWrapping } from 'three';

function fract(value: number): number {
  return value - Math.floor(value);
}

function hash2D(x: number, y: number, seed: number): number {
  const dot = x * (127.1 + seed * 0.37) + y * (311.7 + seed * 0.19);
  return fract(Math.sin(dot) * 43_758.5453123);
}

function smoothStep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const tx = smoothStep(x - x0);
  const ty = smoothStep(y - y0);

  const n00 = hash2D(x0, y0, seed);
  const n10 = hash2D(x1, y0, seed);
  const n01 = hash2D(x0, y1, seed);
  const n11 = hash2D(x1, y1, seed);

  const nx0 = n00 + (n10 - n00) * tx;
  const nx1 = n01 + (n11 - n01) * tx;
  return nx0 + (nx1 - nx0) * ty;
}

function fbm2D(x: number, y: number, seed: number, octaves = 6): number {
  let sum = 0;
  let amplitude = 0.55;
  let frequency = 1;
  let norm = 0;

  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise2D(x * frequency, y * frequency, seed + i * 17) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return norm > 0 ? sum / norm : 0;
}

export function createPlanetHeightTexture({
  size = 1024,
  seed = 17,
  mode = 'default',
  craterDensity = 0.5,
  ridgeStrength = 0.65,
  mountainStrength = 0.45
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire 2D canvas context');
  const image = ctx.createImageData(size, size);
  const data = image.data;

  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    const latitude = (v - 0.5) * Math.PI;
    const latitudeFade = Math.pow(Math.max(0.12, Math.cos(latitude)), mode === 'eolian' ? 0.75 : 0.5);

    for (let x = 0; x < size; x += 1) {
      const u = x / size;

      const continental = fbm2D(u * 2.3 + 1.9, v * 1.7 - 0.6, seed, 5);
      const detail = fbm2D(u * 18.0 - 3.7, v * 12.0 + 2.1, seed + 31, 4);
      const ridged = 1 - Math.abs(fbm2D(u * 8.0 + 1.2, v * 6.0 - 2.8, seed + 59, 5) * 2 - 1);
      const dunes = fbm2D(u * 34.0 + 1.5, v * 10.0 - 2.3, seed + 211, 4);
      const craterMacro = fbm2D(u * 6.5 + 0.2, v * 6.5 + 0.3, seed + 97, 4);
      const craterMicro = fbm2D(u * 38.0 + 0.9, v * 38.0 - 0.4, seed + 193, 3);
      const craterSignal = Math.max(0, 1 - Math.abs(craterMacro * 2 - 1) * 1.5) * 0.72
        + Math.max(0, 1 - Math.abs(craterMicro * 2 - 1) * 2.0) * 0.28;

      let modeTerm = 0;
      if (mode === 'cratered') {
        modeTerm = -craterSignal * (0.55 + craterDensity * 0.45);
      } else if (mode === 'eolian') {
        modeTerm = dunes * 0.22 - Math.abs(dunes - 0.5) * 0.18;
      }

      const h = Math.max(
        0,
        Math.min(
          1,
          continental * 0.56 + detail * mountainStrength * 0.34 + ridged * ridgeStrength * 0.26 + modeTerm
        )
      ) * latitudeFade;

      const value = Math.round(h * 255);
      const idx = (y * size + x) * 4;
      data[idx] = value;
      data[idx + 1] = value;
      data[idx + 2] = value;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}
