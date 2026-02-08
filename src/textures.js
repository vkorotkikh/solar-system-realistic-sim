/**
 * Procedural planet texture generation using 3D value noise on the sphere surface.
 * Each texture is generated as a canvas element that can be used with CanvasTexture.
 */

const W = 1024;
const H = 512;

// ── 3D Value Noise ──────────────────────────────────────────────────────────

function hash3(ix, iy, iz) {
  let h = (ix * 374761393 + iy * 668265263 + iz * 1274126177) | 0;
  h = ((h ^ (h >> 13)) * 1103515245 + 12345) | 0;
  return (h & 0x7fffffff) / 2147483647.0;
}

function smoothstep(t) {
  return t * t * (3.0 - 2.0 * t);
}

function noise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const sx = smoothstep(fx);
  const sy = smoothstep(fy);
  const sz = smoothstep(fz);

  let v = 0;
  for (let dz = 0; dz < 2; dz++) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const w =
          (dx === 0 ? 1 - sx : sx) *
          (dy === 0 ? 1 - sy : sy) *
          (dz === 0 ? 1 - sz : sz);
        v += w * hash3(ix + dx, iy + dy, iz + dz);
      }
    }
  }
  return v;
}

function fbm(x, y, z, octaves = 5, lacunarity = 2.0, gain = 0.5) {
  let v = 0;
  let a = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    v += a * noise3(x, y, z);
    total += a;
    a *= gain;
    x *= lacunarity;
    y *= lacunarity;
    z *= lacunarity;
  }
  return v / total;
}

// ── Utilities ────────────────────────────────────────────────────────────────

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpRGB(r1, g1, b1, r2, g2, b2, t) {
  return [lerp(r1, r2, t), lerp(g1, g2, t), lerp(b1, b2, t)];
}

function sphereCoords(px, py) {
  const colat = (py / H) * Math.PI;
  const lon = (px / W) * Math.PI * 2;
  const sc = Math.sin(colat);
  return {
    x: sc * Math.cos(lon),
    y: sc * Math.sin(lon),
    z: Math.cos(colat),
    lat: Math.PI / 2 - colat,
    lon
  };
}

function fillPixels(colorFn) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const s = sphereCoords(px, py);
      const [r, g, b] = colorFn(s);
      const i = (py * W + px) * 4;
      d[i] = clamp01(r) * 255;
      d[i + 1] = clamp01(g) * 255;
      d[i + 2] = clamp01(b) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ── Planet Textures ──────────────────────────────────────────────────────────

function sunTexture() {
  return fillPixels((s) => {
    const n = fbm(s.x * 5, s.y * 5, s.z * 5, 6, 2.0, 0.55);
    const n2 = fbm(s.x * 14 + 50, s.y * 14, s.z * 14, 4, 2.0, 0.5);
    const granulation = fbm(s.x * 30 + 100, s.y * 30 + 100, s.z * 30, 3, 2.0, 0.4);
    const bright = 0.82 + n * 0.12 + n2 * 0.06;
    const spot = granulation > 0.62 ? 0.04 : 0;
    return [bright + 0.05 - spot, bright * 0.76 - spot, bright * 0.22];
  });
}

function mercuryTexture() {
  return fillPixels((s) => {
    const n = fbm(s.x * 8, s.y * 8, s.z * 8, 5, 2.1, 0.5);
    const craters = fbm(s.x * 22 + 10, s.y * 22, s.z * 22 + 10, 4, 2.0, 0.5);
    const fine = fbm(s.x * 40, s.y * 40, s.z * 40, 3, 2.0, 0.45);
    const base = 0.36 + n * 0.18 + fine * 0.06;
    const craterDim = craters > 0.58 ? 0.1 : craters < 0.3 ? 0.04 : 0;
    const c = base - craterDim;
    return [c * 1.06, c * 1.0, c * 0.9];
  });
}

function venusTexture() {
  return fillPixels((s) => {
    const dx = fbm(s.x * 3 + 10, s.y * 3, s.z * 3, 3, 2.0, 0.5) * 0.6;
    const n = fbm(s.x * 4 + dx, s.y * 4 + s.z * 2, s.z * 3 + dx, 5, 2.2, 0.45);
    const n2 = fbm(s.x * 7 + dx * 2, s.y * 7, s.z * 7 + dx, 4, 2.0, 0.5);
    const base = 0.7 + n * 0.14 + n2 * 0.06;
    return [base * 1.02, base * 0.88, base * 0.58];
  });
}

function earthTexture() {
  return fillPixels((s) => {
    const continental = fbm(s.x * 3.2 + 1.5, s.y * 3.2 + 0.8, s.z * 3.2, 6, 2.0, 0.52);
    const detail = fbm(s.x * 14, s.y * 14, s.z * 14, 4, 2.0, 0.5);
    const fine = fbm(s.x * 28 + 5, s.y * 28, s.z * 28, 3, 2.0, 0.45);
    const absLat = Math.abs(s.lat);

    // Ice caps
    if (absLat > 1.2) {
      const iceBlend = clamp01((absLat - 1.2) / 0.22);
      const snow = 0.88 + fine * 0.06;
      return lerpRGB(0.75, 0.82, 0.9, snow, snow * 1.02, snow * 1.05, iceBlend);
    }

    const landThreshold = 0.52;
    const isLand = continental > landThreshold;

    if (isLand) {
      const elevation = (continental - landThreshold) / (1 - landThreshold);

      if (absLat < 0.3) {
        // Tropical forest
        const g = 0.3 + detail * 0.12 + elevation * 0.05;
        return [0.1 + detail * 0.06, g, 0.06 + detail * 0.04];
      } else if (absLat < 0.55) {
        // Temperate / arid transition
        const t = clamp01((absLat - 0.3) / 0.25);
        const aridNoise = continental > 0.6 ? t * 0.8 : t * 0.3;
        return [
          0.2 + aridNoise * 0.5 + detail * 0.06,
          0.32 - aridNoise * 0.08 + detail * 0.08,
          0.1 + detail * 0.04
        ];
      } else if (absLat < 0.85) {
        // Temperate green/brown
        const g = 0.28 + detail * 0.1;
        const brownBlend = clamp01((absLat - 0.7) / 0.2);
        return lerpRGB(0.16, g, 0.08, 0.42, 0.36, 0.22, brownBlend);
      } else {
        // Tundra / boreal
        const tundra = clamp01((absLat - 0.85) / 0.3);
        return lerpRGB(0.32, 0.35, 0.2, 0.55, 0.52, 0.42, tundra);
      }
    } else {
      // Ocean
      const depth = clamp01((landThreshold - continental) / landThreshold);
      const coastBlend = clamp01((landThreshold - continental) / 0.05);
      const shallow = [0.04, 0.22, 0.52];
      const deep = [0.01, 0.06, 0.28];
      const coast = [0.06, 0.3, 0.55];
      if (coastBlend < 0.3) {
        return lerpRGB(...coast, ...shallow, coastBlend / 0.3);
      }
      return lerpRGB(...shallow, ...deep, clamp01(depth * 1.3));
    }
  });
}

function marsTexture() {
  return fillPixels((s) => {
    const n = fbm(s.x * 5, s.y * 5, s.z * 5, 5, 2.0, 0.5);
    const detail = fbm(s.x * 16, s.y * 16, s.z * 16, 4, 2.0, 0.5);
    const fine = fbm(s.x * 30 + 20, s.y * 30, s.z * 30, 3, 2.0, 0.45);
    const absLat = Math.abs(s.lat);

    // Polar ice caps
    if (absLat > 1.25) {
      const ice = clamp01((absLat - 1.25) / 0.2);
      return lerpRGB(0.72, 0.4, 0.26, 0.9, 0.88, 0.85, ice);
    }

    // Mars surface
    const darkRegion = detail > 0.55 ? 0.82 : 1.0;
    const base = 0.62 + n * 0.2 + fine * 0.05;
    return [
      base * 0.98 * darkRegion,
      base * 0.48 * darkRegion + fine * 0.03,
      base * 0.3 * darkRegion + fine * 0.02
    ];
  });
}

function jupiterTexture() {
  return fillPixels((s) => {
    const lat = s.lat;
    const bandFreq = 12;
    const band = Math.sin(lat * bandFreq);
    const turb = fbm(s.x * 7 + s.y * 2, s.y * 7, s.z * 7, 5, 2.0, 0.45) * 0.4;
    const bandN = band + turb;
    const detail = fbm(s.x * 18, s.y * 18, s.z * 18, 4, 2.0, 0.5);
    const fine = fbm(s.x * 35 + 5, s.y * 35, s.z * 35, 3, 2.0, 0.4);

    // Great Red Spot
    const grsLon = 4.9;
    const grsLat = -0.38;
    const dlon = Math.min(Math.abs(s.lon - grsLon), Math.PI * 2 - Math.abs(s.lon - grsLon));
    const dlat = s.lat - grsLat;
    const grsDist = Math.sqrt(dlon * dlon * 4 + dlat * dlat * 9);

    if (grsDist < 0.35) {
      const grsBlend = 1 - grsDist / 0.35;
      const swirl = fbm(s.x * 25 + 100, s.y * 25, s.z * 25, 3, 2.0, 0.5);
      return [
        0.78 + swirl * 0.08,
        0.3 + swirl * 0.06 - grsBlend * 0.12,
        0.16 + swirl * 0.04
      ];
    }

    // Band colors
    if (bandN > 0.3) {
      return [0.84 + detail * 0.06 + fine * 0.03, 0.74 + detail * 0.06, 0.56 + detail * 0.04];
    } else if (bandN > -0.15) {
      return [0.72 + detail * 0.06, 0.58 + detail * 0.05, 0.38 + detail * 0.04];
    } else {
      return [0.56 + detail * 0.07 + fine * 0.03, 0.4 + detail * 0.05, 0.24 + detail * 0.03];
    }
  });
}

function saturnTexture() {
  return fillPixels((s) => {
    const lat = s.lat;
    const band = Math.sin(lat * 10) * 0.5 + 0.5;
    const n = fbm(s.x * 5, s.y * 5, s.z * 5, 4, 2.0, 0.45);
    const detail = fbm(s.x * 14, s.y * 14, s.z * 14, 3, 2.0, 0.5);
    const fine = fbm(s.x * 25 + 10, s.y * 25, s.z * 25, 3, 2.0, 0.4);

    const base = 0.74 + band * 0.1 + n * 0.08 + fine * 0.03;
    return [
      base * 1.02,
      base * 0.89 + detail * 0.03,
      base * 0.62 + detail * 0.02
    ];
  });
}

function uranusTexture() {
  return fillPixels((s) => {
    const n = fbm(s.x * 4, s.y * 4, s.z * 4, 4, 2.0, 0.4);
    const detail = fbm(s.x * 10, s.y * 10, s.z * 10, 3, 2.0, 0.45);
    const base = 0.56 + n * 0.08 + detail * 0.04;
    // Very uniform pale blue-green
    return [base * 0.6, base * 0.88, base * 0.92];
  });
}

function neptuneTexture() {
  return fillPixels((s) => {
    const n = fbm(s.x * 5, s.y * 5, s.z * 5, 5, 2.0, 0.45);
    const bands = Math.sin(s.lat * 8) * 0.04;
    const detail = fbm(s.x * 14 + 3, s.y * 14, s.z * 14, 4, 2.0, 0.5);
    const base = 0.33 + n * 0.1 + bands + detail * 0.04;

    // Dark spot approximation
    const dlon = Math.min(Math.abs(s.lon - 3.5), Math.PI * 2 - Math.abs(s.lon - 3.5));
    const spotDist = Math.sqrt(dlon * dlon * 2 + (s.lat + 0.3) * (s.lat + 0.3) * 5);
    const spot = spotDist < 0.3 ? (1 - spotDist / 0.3) * 0.07 : 0;

    return [base * 0.38 - spot, base * 0.5 - spot * 0.5, base * 1.1 + 0.22];
  });
}

function plutoTexture() {
  return fillPixels((s) => {
    const n = fbm(s.x * 4, s.y * 4, s.z * 4, 5, 2.0, 0.5);
    const detail = fbm(s.x * 12 + 30, s.y * 12, s.z * 12, 4, 2.0, 0.5);

    // Tombaugh Regio (heart-shaped bright region)
    const heartLon = 3.14;
    const heartLat = 0.2;
    const dlon = Math.min(Math.abs(s.lon - heartLon), Math.PI * 2 - Math.abs(s.lon - heartLon));
    const dlat = s.lat - heartLat;
    const heartDist = Math.sqrt(dlon * dlon + dlat * dlat * 2.5);
    const inHeart = heartDist < 0.45;

    const base = 0.52 + n * 0.14;
    if (inHeart) {
      const blend = clamp01(1 - heartDist / 0.45);
      return [
        base * 0.92 + blend * 0.2,
        base * 0.86 + blend * 0.18,
        base * 0.76 + blend * 0.12
      ];
    }

    return [base * 0.78 + detail * 0.04, base * 0.68, base * 0.58];
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

export function generatePlanetTexture(bodyId) {
  const generators = {
    sun: sunTexture,
    mercury: mercuryTexture,
    venus: venusTexture,
    earth: earthTexture,
    mars: marsTexture,
    jupiter: jupiterTexture,
    saturn: saturnTexture,
    uranus: uranusTexture,
    neptune: neptuneTexture,
    pluto: plutoTexture
  };

  const gen = generators[bodyId];
  return gen ? gen() : null;
}
