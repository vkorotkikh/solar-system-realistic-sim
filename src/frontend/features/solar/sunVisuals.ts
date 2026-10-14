import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Camera,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  Object3D,
  Points,
  PointsMaterial,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Texture,
  Vector4
} from 'three';
import { SOLAR_RADIUS_AU, coronalToDisplay } from './solarDisplayScale';
import { clampUnit, solarFeatureEntryBrightness, sampleSolarFeatureEntryPoint } from './solarFeatureBlending';
import type { SolarFeatureBlendView, SolarPhysicsStateLike } from './solarFeatureBlending';

const TWO_PI = Math.PI * 2;

export const SUN_SURFACE_VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vSunNormal;
varying vec3 vWorldPosition;
varying float vLatitude;

void main() {
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  // The mesh hangs from the Sun's spin group, whose local +Y is the true spin axis, so the
  // object-space normal gives heliographic latitude; the world normal's y does not.
  vSunNormal = normalize(normal);
  vLatitude = asin(clamp(vSunNormal.y, -1.0, 1.0));
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const SUN_SURFACE_FRAGMENT_SHADER = `
uniform float time;
uniform float activity;
uniform sampler2D baseMap;
uniform sampler2D observationMap;
uniform float observationBlend;
uniform float observationEmission;
// Sunspot seed positions: xy = (lon, lat) in radians, z = size (0.01..0.08), w = intensity
// w == 0.0 means the slot is inactive (no sunspot)
uniform vec4 sunspotSeeds[8];
uniform vec4 flarePoints[3];

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vSunNormal;
varying vec3 vWorldPosition;
varying float vLatitude;

// ─── Utility ─────────────────────────────────────────────────────────────────
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i),             hash13(i + vec3(1,0,0)), u.x),
        mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), u.x), u.y),
    mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), u.x),
        mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), u.x), u.y),
    u.z
  );
}
float fbm(vec3 p) {
  float s = 0.0, a = 0.65, n = 0.0;
  for (int i = 0; i < 5; i++) { s += a * noise3(p); n += a; p *= 2.02; a *= 0.5; }
  return s / max(1e-6, n);
}

// ─── Phase A1: Neckel-Labs Limb Darkening (Per-Channel) ──────────────────────
// Published 5th-order polynomial coefficients from Neckel & Labs (1994),
// Solar Physics 153:91-114.  Per-channel evaluation captures the physical
// wavelength-dependent limb reddening (blue darkens ~40% more than red).
// Each channel sums to exactly 1.0 at mu=1 (disk center).
vec3 neckellLimbDarkRGB(float mu) {
  float mu2 = mu * mu;
  float mu3 = mu2 * mu;
  float mu4 = mu3 * mu;
  float mu5 = mu4 * mu;
  // R channel (~650 nm)
  float ldR = 0.3434 + 0.9721*mu - 0.4348*mu2 + 0.2024*mu3 - 0.1220*mu4 + 0.0390*mu5;
  // G channel (~550 nm)
  float ldG = 0.3050 + 1.1312*mu - 0.7860*mu2 + 0.6164*mu3 - 0.3612*mu4 + 0.0946*mu5;
  // B channel (~450 nm)
  float ldB = 0.2688 + 1.3765*mu - 1.3645*mu2 + 1.2816*mu3 - 0.7458*mu4 + 0.1834*mu5;
  return vec3(ldR, ldG, ldB);
}

// ─── Phase A3: Snodgrass Differential Rotation ───────────────────────────────
// Snodgrass (1983): omega(lat) = 14.44 - 2.87*sin^2(lat) - 0.36*sin^4(lat)  [deg/day]
float snodgrassRotationOffset(float latRad, float timeDays) {
  float sinLat = sin(latRad);
  float sin2 = sinLat * sinLat;
  float sin4 = sin2 * sin2;
  float degPerDay = 14.44 - 2.87 * sin2 - 0.36 * sin4;
  return radians(degPerDay * timeDays);  // total longitude offset in radians
}

// ─── Phase A2: Voronoi Granulation ───────────────────────────────────────────
// Returns: x=cell brightness (0=lane, 1=center), y=dist to nearest center
vec2 voronoiGranulation(vec2 uv, float scale, float t) {
  vec2 scaledUv = uv * scale;
  vec2 cellId = floor(scaledUv);
  vec2 cellFr = fract(scaledUv);
  
  float minDist = 9.0;
  float secDist = 9.0;
  vec2 minCell = vec2(0.0);
  
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 nId = cellId + neighbor;
      // Drift cell centers slowly over time (granule lifetime ~8-10 min -> normalised to ~0.08 time units)
      float drift = t * 0.042;
      vec2 centerOffset = hash22(nId + vec2(drift, drift * 0.71)) * 0.62 + 0.19;
      vec2 r = neighbor + centerOffset - cellFr;
      float d = dot(r, r);
      if (d < minDist) { secDist = minDist; minDist = d; minCell = centerOffset; }
      else if (d < secDist) { secDist = d; }
    }
  }
  
  minDist = sqrt(minDist);
  secDist = sqrt(secDist);
  
  // Lane width: distance to edge (secDist - minDist)
  float edgeDist = secDist - minDist;
  float laneWidth = 0.065;
  float cellBrightness = smoothstep(0.0, laneWidth, edgeDist); // 0=dark lane, 1=cell center
  return vec2(cellBrightness, minDist);
}

// ─── Phase A4: Structured Sunspot ────────────────────────────────────────────
// Returns a darkening factor (1=no spot, 0=full umbra) at surface point nDir 
// given a spot at spherical (lon, lat) with angular radius, and a penumbra fibril noise
float sunspotDarkening(vec3 nDir, vec4 seed, float timeSec, float mu) {
  float spotIntensity = seed.w;       // [0..1], 0 = inactive slot
  if (spotIntensity < 0.001) return 1.0; // inactive — early exit, no darkening

  float spotLon = seed.x;
  float spotLat = seed.y;
  float spotSize = seed.z;            // angular radius in radians

  // Spot centre direction from spherical coords
  vec3 spotDir = vec3(cos(spotLat) * cos(spotLon), sin(spotLat), cos(spotLat) * sin(spotLon));
  float angDist = acos(clamp(dot(nDir, spotDir), -1.0, 1.0));

  if (angDist > spotSize * 2.5) return 1.0; // outside spot entirely

  // ─── Wilson Depression: foreshorten spot near limb (600 km depression) ────
  float spotMu = max(0.0, dot(spotDir, normalize(cameraPosition - vWorldPosition)));
  float wilsonFactor = 0.65 + 0.35 * spotMu;
  float umbra = spotSize * 0.45 * wilsonFactor;
  float penumbra = spotSize * wilsonFactor;
  
  // ─── Evershed-Flow Penumbral Fibrils (radially elongated noise) ───────────
  // Radial direction from umbra center projected onto the surface tangent plane
  vec3 radialDir = normalize(nDir - spotDir * dot(nDir, spotDir));
  vec3 tangentialDir = normalize(cross(spotDir, radialDir));
  // 2.67:1 elongation along tangential direction = narrow radial fibrils
  vec3 fibrilCoord = radialDir * 60.0 + tangentialDir * 160.0 + vec3(timeSec * 0.03);
  float fibrilNoise = noise3(fibrilCoord);
  float fibrilModulate = 0.85 + fibrilNoise * 0.3;
  
  // ─── Facular CLV: center-to-limb variation (Topka et al. 1997) ───────────
  // Faculae are dark at disk center (mu≈1), bright at limb (mu≈0.3)
  float faculaeZone = smoothstep(penumbra, penumbra * 2.0, angDist) * 
                      (1.0 - smoothstep(penumbra * 2.0, penumbra * 2.5, angDist));
  float faculaContrast = (-0.12 + 0.95 * (1.0 - mu)) * spotIntensity;
  float faculaeBrightness = 1.0 + faculaeZone * faculaContrast;
  
  if (angDist <= umbra) {
    // Umbra: deep dark core (T_umbra≈3700K vs 5778K → (3700/5778)^4 ≈ 0.13)
    return mix(0.10, 0.28, (angDist / umbra)) * spotIntensity + (1.0 - spotIntensity);
  } else if (angDist <= penumbra) {
    // Penumbra: Evershed-flow fibered transition
    float penumbraGrad = (angDist - umbra) / (penumbra - umbra);
    float penumbraBrightness = mix(0.28, 0.78, penumbraGrad) * fibrilModulate;
    return penumbraBrightness * spotIntensity + (1.0 - spotIntensity);
  } else {
    // Facular ring with CLV
    return faculaeBrightness;
  }
}

// ─── Sunspot Group Clustering ────────────────────────────────────────────────
// Each uniform slot represents a sunspot GROUP, not an individual spot.
// Generates 2-5 sub-spots per group at slightly offset positions with varying sizes.
// At solar max with 8 groups × 5 spots = up to 40 visible spots.
float sunspotGroupDarkening(vec3 nDir, vec4 seed, float timeSec, float mu) {
  if (seed.w < 0.001) return 1.0;
  float dark = 1.0;
  // Cluster count: 2-5 based on group intensity
  int clusterCount = 2 + int(seed.w * 3.0);
  for (int c = 0; c < 5; c++) {
    if (c >= clusterCount) break;
    float cSeed = float(c) * 0.618033;
    float lonOff = (hash12(vec2(seed.x, cSeed)) - 0.5) * seed.z * 1.5;
    float latOff = (hash12(vec2(seed.y, cSeed + 0.3)) - 0.5) * seed.z * 1.0;
    float subSize = seed.z * (0.3 + hash12(vec2(cSeed, seed.x)) * 0.7);
    vec4 subSpot = vec4(seed.x + lonOff, seed.y + latOff, subSize, seed.w);
    dark = min(dark, sunspotDarkening(nDir, subSpot, timeSec, mu));
  }
  return dark;
}

void main() {
  vec3 normalDir = normalize(vWorldNormal);
  vec3 sunNormal = normalize(vSunNormal); // body frame: latitude, spots and flares
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  float mu = max(0.0, dot(normalDir, viewDir));
  
  // ─── Phase A1: Neckel-Labs Limb Darkening (per-channel RGB) ────────────────
  vec3 limbDark = neckellLimbDarkRGB(mu);
  
  // ─── Phase A3: Differential Rotation UV ────────────────────────────────────
  // time uniform = timeSec * 0.4 (see updateSunMaterialUniforms).
  // Solar synodic rotation: ~27 days. In the simulation 1 display-second ≈ some sim-days.
  // We use a small perceptual scale so the differential pattern is visible without racing.
  // 0.00012 keeps equator completing one rotation in ~8300 display-time-units (~23h at 0.4x)
  float lonOffset = snodgrassRotationOffset(vLatitude, time * 0.00012);
  vec2 uvRotated = vUv + vec2(lonOffset / (2.0 * 3.14159265), 0.0);
  
  // ─── Phase A2: Voronoi Granulation ─────────────────────────────────────────
  // Large granules (~7px cells at scale 48)
  float granTime = time * 0.14;   // ~8-minute lifetime
  vec2 gran1 = voronoiGranulation(uvRotated, 48.0, granTime);
  // Super-granulation network overlay (much larger scale, ~30hr lifetime)
  vec2 gran2 = voronoiGranulation(uvRotated, 7.0, time * 0.008);
  
  // Rendering simplification: ~48 cells vs ~3000+ real granules per axis.
  // At typical zoom levels this produces visually acceptable granular texture.
  // Contrast: ~22% RMS matching Nordlund & Stein 1998 / Hinode-SOT observations.
  float granulationBrightness = gran1.x * 0.22 + 0.78;          // range 0.78–1.0 (22% contrast)
  float superGranNetwork = gran2.x * 0.04 + 0.98;               // subtle supergranule modulation
  float combinedGranulation = granulationBrightness * superGranNetwork;
  
  // Small-scale convective turbulence on the cell interior
  float cellTurbulence = fbm(normalDir * 80.0 + vec3(time * 2.1, -time * 1.6, time * 0.9));
  combinedGranulation = mix(combinedGranulation, combinedGranulation * (0.88 + cellTurbulence * 0.24), 0.35);
  
  // ─── Phase A4: Sunspot Group Darkening ─────────────────────────────────────
  // Unrolled fixed loop (GLSL ES 1.0 requires constant loop bounds)
  // Each slot is a sunspot GROUP producing 2-5 clustered spots
  float spotDark = 1.0;
  spotDark = min(spotDark, sunspotGroupDarkening(sunNormal, sunspotSeeds[0], time, mu));
  spotDark = min(spotDark, sunspotGroupDarkening(sunNormal, sunspotSeeds[1], time, mu));
  spotDark = min(spotDark, sunspotGroupDarkening(sunNormal, sunspotSeeds[2], time, mu));
  spotDark = min(spotDark, sunspotGroupDarkening(sunNormal, sunspotSeeds[3], time, mu));
  spotDark = min(spotDark, sunspotGroupDarkening(sunNormal, sunspotSeeds[4], time, mu));
  spotDark = min(spotDark, sunspotGroupDarkening(sunNormal, sunspotSeeds[5], time, mu));
  spotDark = min(spotDark, sunspotGroupDarkening(sunNormal, sunspotSeeds[6], time, mu));
  spotDark = min(spotDark, sunspotGroupDarkening(sunNormal, sunspotSeeds[7], time, mu));
  
  // ─── Base texture + observation overlay ────────────────────────────────────
  vec2 uvAdj = fract(uvRotated + vec2(time * 0.003, 0.0));
  vec3 baseTex = texture2D(baseMap, uvAdj).rgb;
  // Observation textures are admitted only under the static full-surface
  // sun_surface_uv_v1 contract. Do not scroll or vertically wrap spatial data.
  vec2 observationUv = vec2(fract(vUv.x), clamp(vUv.y, 0.0, 1.0));
  vec3 obsTex  = texture2D(observationMap, observationUv).rgb;
  float obsLuma = dot(obsTex, vec3(0.2126, 0.7152, 0.0722));
  vec2 observationNeighborUv = vec2(
    fract(observationUv.x + 0.0018),
    clamp(observationUv.y - 0.0018, 0.0, 1.0)
  );
  float obsNeighbor = dot(texture2D(observationMap, observationNeighborUv).rgb,
                          vec3(0.2126, 0.7152, 0.0722));
  float obsContrast = abs(obsLuma - obsNeighbor);
  
  // ─── Color Assembly ────────────────────────────────────────────────────────
  // Planck-function blackbody→sRGB colors (CIE 1931 color-matched).
  // G2V star at 5778K appears nearly white, not orange.
  // Umbra ~3700K, Quiet photosphere ~5778K, Granule top ~7000K.
  float scalarBrightness = combinedGranulation * spotDark;
  vec3 brightness = vec3(scalarBrightness) * limbDark; // per-channel limb darkening
  
  vec3 umbralColor  = vec3(1.000, 0.538, 0.203);  // 3700K blackbody (linear sRGB)
  vec3 quietColor   = vec3(1.000, 0.867, 0.757);  // 5778K blackbody
  vec3 hotColor     = vec3(1.000, 0.918, 0.843);  // 6300K blackbody
  vec3 granuletop   = vec3(0.953, 0.953, 1.000);  // 7000K blackbody
  
  vec3 baseColor = mix(quietColor, hotColor, clamp(brightness, 0.0, 1.0));
  baseColor = mix(baseColor, granuletop, clamp((brightness - vec3(0.85)) * 6.0, 0.0, 1.0));
  // Sunspot coloring: blend toward umbral in darkened areas
  baseColor = mix(umbralColor, baseColor, clamp(spotDark * 1.4, 0.0, 1.0));
  
  vec3 color = mix(baseColor, baseTex * 1.15, 0.38);
  
  // Observation overlay
  vec3 observedAccent = vec3(1.0, 0.58, 0.2) * (obsLuma * 0.45 + obsContrast * 1.1);
  color = mix(color, color + observedAccent * (0.24 + observationEmission * 0.5), observationBlend * 0.7);
  
  // Flare brightening on surface
  for (int i = 0; i < 3; i++) {
    vec4 fParams = flarePoints[i]; // x=lon, y=lat, z=intensity
    if (fParams.z > 0.001) {
      vec3 fDir = vec3(cos(fParams.y) * cos(fParams.x), sin(fParams.y), cos(fParams.y) * sin(fParams.x));
      float fDist = acos(clamp(dot(sunNormal, fDir), -1.0, 1.0));
      float fRadius = 0.05 + fParams.z * 0.06;
      if (fDist < fRadius * 3.0) {
        float falloff = pow(1.0 - clamp(fDist / (fRadius * 3.0), 0.0, 1.0), 2.5);
        color += vec3(1.0, 0.85, 0.5) * falloff * fParams.z * 1.8;
      }
    }
  }
  
  // Activity-driven brightening / flash highlights
  float activeFlash = fbm(normalDir * 28.0 + vec3(time * 0.82, -time * 0.61, time * 0.44));
  activeFlash = smoothstep(0.74, 0.96, activeFlash) * activity * 0.28;
  color += vec3(1.0, 0.85, 0.5) * activeFlash;
  
  gl_FragColor = vec4(color, 1.0);
}
`;


export const SUN_CORONA_VERTEX_SHADER = `
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vSunNormal;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vSunNormal = normalize(normal); // body frame, as in the surface shader
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const SUN_CORONA_FRAGMENT_SHADER = `
uniform float time;
uniform float activity;
uniform float coronalHoleActivity;
uniform vec3 coronaColor;
uniform float observationBlend;
uniform float observationEmission;
uniform float sunRadius;  // display radius of the sun in scene units

// ─── DEM Channel Response ────────────────────────────────────────────────────
// channelMode: 0.0 = default (no channel), 1.0 = 094, 2.0 = 171, 3.0 = 193,
//              4.0 = 211, 5.0 = 304
// Each AIA channel has a temperature response function peaked at a specific T.
uniform float channelMode;

// ─── Data-Driven Coronal Holes ───────────────────────────────────────────────
// Each vec4: (centerLon_rad, centerLat_rad, extentLon_rad, extentLat_rad)
uniform vec4 coronalHoles[8];
uniform float coronalHoleCount;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vSunNormal;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i + vec3(0.0, 0.0, 0.0)), hash13(i + vec3(1.0, 0.0, 0.0)), u.x),
        mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x),
        mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x), u.y),
    u.z
  );
}

float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.6;
  float norm = 0.0;
  for (int i = 0; i < 4; i++) {
    sum += amp * noise3(p);
    norm += amp;
    p *= 2.1;
    amp *= 0.52;
  }
  return sum / max(1e-6, norm);
}

// ─── DEM Temperature-Channel Response Function ───────────────────────────────
// Computes the response of a specific AIA passband to plasma at temperature T(MK).
// Based on instrument response functions from Lemen et al. 2012, Solar Physics 275.
// Returns a [0..1] factor: 1.0 = peak sensitivity, 0.0 = invisible to this channel.
//
// Channel peak temperatures (log T):
//   094Å: Fe XVIII  → 6.3 MK (log T = 6.8)  — flare plasma only
//   171Å: Fe IX     → 0.63 MK (log T = 5.8) — quiet corona loops
//   193Å: Fe XII    → 1.6 MK (log T = 6.2)  — hot corona, active regions
//   211Å: Fe XIV    → 2.0 MK (log T = 6.3)  — active region loops
//   304Å: He II     → 0.05 MK (log T = 4.7) — chromosphere / transition region
float demChannelResponse(float temperatureMK, float channelId) {
  if (channelId < 0.5) return 1.0;  // No channel active → show everything

  float logT = log(max(temperatureMK, 0.01)) / log(10.0) + 6.0; // log10(T in K)

  // Channel peak log T and width (sigma of Gaussian response)
  float peakLogT;
  float sigma;

  if (channelId < 1.5) {
    // 094Å — Fe XVIII, 6.3 MK → log T = 6.8
    peakLogT = 6.8; sigma = 0.22;
  } else if (channelId < 2.5) {
    // 171Å — Fe IX, 0.63 MK → log T = 5.8
    peakLogT = 5.8; sigma = 0.28;
  } else if (channelId < 3.5) {
    // 193Å — Fe XII, 1.6 MK → log T = 6.2
    peakLogT = 6.2; sigma = 0.32;
  } else if (channelId < 4.5) {
    // 211Å — Fe XIV, 2.0 MK → log T = 6.3
    peakLogT = 6.3; sigma = 0.25;
  } else {
    // 304Å — He II, 0.05 MK → log T = 4.7
    peakLogT = 4.7; sigma = 0.35;
  }

  float delta = (logT - peakLogT) / sigma;
  return exp(-0.5 * delta * delta);
}

void main() {
  vec3 normalDir = normalize(vWorldNormal);
  vec3 sunNormal = normalize(vSunNormal); // body frame: streamer belt and coronal holes
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  float ndotv = clamp(abs(dot(normalDir, viewDir)), 0.0, 1.0);
  float limb = clamp(1.0 - ndotv, 0.0, 1.0);
  float offLimb = smoothstep(0.78, 0.998, limb);
  float rim = pow(offLimb, 1.8);
  float turbulence = fbm(normalDir * 9.0 + vec3(time * 0.38, -time * 0.26, time * 0.19));
  float burst = smoothstep(0.72, 0.95, turbulence);
  float pulse = 0.78 + 0.22 * sin(time * 1.4 + turbulence * 6.8);
  float alpha = (offLimb * 0.06 + rim * 0.09) * (0.26 + burst * (0.42 + activity * 0.32)) * pulse;
  alpha *= 1.0 + observationBlend * (0.18 + observationEmission * 0.46);

  // ─── K-Corona Radial Intensity Falloff (Baumbach/van de Hulst 1950) ────────
  // N(r) = 10^8 * (0.036*r^-1.5 + 1.55*r^-6 + 2.99*r^-16)
  // Simplified to two dominant terms for real-time rendering.
  float fragR = max(length(vWorldPosition) / max(sunRadius, 0.0001), 1.001);
  float coronaRadial = 0.036 * pow(fragR, -1.5) + 1.55 * pow(fragR, -6.0);
  coronaRadial = coronaRadial / 1.586; // normalize to ~1.0 at r=1
  alpha *= coronaRadial;

  // ─── DEM Channel Modulation ────────────────────────────────────────────────
  // Corona temperature varies radially: ~1 MK inner → ~2 MK mid → ~1.5 MK outer.
  // This is a simplified radial temperature profile.
  float coronaTempMK = mix(1.0, 2.2, smoothstep(1.0, 2.0, fragR))
                     * mix(1.0, 0.7, smoothstep(2.0, 4.0, fragR));
  // Burst regions are hotter (flare-heated plasma)
  coronaTempMK += burst * activity * 3.5;
  float demResponse = demChannelResponse(coronaTempMK, channelMode);
  alpha *= mix(1.0, demResponse, step(0.5, channelMode));

  // ─── Helmet Streamer Structure ─────────────────────────────────────────────
  // During solar minimum: bright equatorial streamer belt
  // During solar maximum: streamers at all latitudes
  float streamerLat = abs(sunNormal.y); // 0 at equator, 1 at poles
  float streamerWidth = 0.15 + activity * 0.35; // narrow at min, broad at max
  float streamerBright = smoothstep(streamerWidth, max(streamerWidth - 0.1, 0.01), streamerLat);
  // Add streamer-specific turbulence (radially elongated)
  float streamerTurb = fbm(vec3(sunNormal.x * 3.0, sunNormal.y * 0.5, sunNormal.z * 3.0)
                          + vec3(time * 0.1, 0.0, -time * 0.08));
  alpha *= (1.0 + streamerBright * (0.8 + streamerTurb * 0.4));

  // ─── Magnetically-Driven Coronal Holes ─────────────────────────────────────
  // Data-driven when coronalHoleCount > 0, otherwise fallback to polar darkening
  float inHole = 0.0;
  if (coronalHoleCount > 0.5) {
    float fragLon = atan(sunNormal.z, sunNormal.x);
    float fragLat = asin(clamp(sunNormal.y, -1.0, 1.0));
    for (int i = 0; i < 8; i++) {
      if (float(i) >= coronalHoleCount) break;
      vec4 hole = coronalHoles[i];
      float dLon = abs(fragLon - hole.x);
      dLon = min(dLon, 6.28318 - dLon);  // wrap-around
      float dLat = abs(fragLat - hole.y);
      if (dLon < hole.z && dLat < hole.w) {
        // Smooth edge falloff (1.0 at center → 0.0 at edge)
        float edgeFade = smoothstep(1.0, 0.65, max(dLon / max(hole.z, 0.01), dLat / max(hole.w, 0.01)));
        inHole = max(inHole, edgeFade);
      }
    }
  } else {
    // Fallback: generic polar + equatorial hole pattern from coronalHoleActivity
    float polarHole = abs(sunNormal.y);
    float holeThreshold = 0.55 - coronalHoleActivity * 0.35;
    float polarFade = smoothstep(holeThreshold - 0.1, holeThreshold + 0.15, polarHole);
    float holeNoise = fbm(normalDir * 4.0 + vec3(time * 0.02));
    float equatorialHole = smoothstep(0.6, 0.8, holeNoise) * coronalHoleActivity;
    inHole = max(polarFade, equatorialHole);
  }
  // Emission measure drops ~5× in coronal holes (alpha → 0.2)
  alpha *= mix(1.0, 0.2, inHole);

  // ─── Temperature-Dependent Corona Color ────────────────────────────────────
  // Inner corona (~1 MK): Fe XIV green line at 530.3 nm contribution
  // Outer corona (~2 MK): traditional warm white
  vec3 hotWhite = vec3(1.0, 0.96, 0.86);
  vec3 innerCorona = vec3(0.6, 1.0, 0.5); // Fe XIV green line contribution
  float tempGradient = smoothstep(1.0, 3.5, fragR);
  vec3 baseCorona = mix(innerCorona * 0.3 + hotWhite * 0.7, coronaColor * 0.8, tempGradient);
  vec3 color = mix(baseCorona, hotWhite, 0.16 + burst * 0.36 + activity * 0.12);
  color = mix(color, hotWhite, observationBlend * (0.08 + observationEmission * 0.28));

  // ─── DEM Channel Color Override ────────────────────────────────────────────
  // When a specific channel is active, tint the corona to match SDO/AIA false-color.
  if (channelMode > 0.5) {
    vec3 channelColor;
    if (channelMode < 1.5) {
      channelColor = vec3(0.1, 0.9, 0.1);  // 094Å: green (Fe XVIII)
    } else if (channelMode < 2.5) {
      channelColor = vec3(0.7, 0.7, 1.0);  // 171Å: blue-white (Fe IX)
    } else if (channelMode < 3.5) {
      channelColor = vec3(0.8, 0.5, 0.2);  // 193Å: brown-gold (Fe XII)
    } else if (channelMode < 4.5) {
      channelColor = vec3(0.6, 0.2, 0.8);  // 211Å: purple (Fe XIV)
    } else {
      channelColor = vec3(0.9, 0.15, 0.12); // 304Å: red (He II)
    }
    color = mix(color, channelColor * (0.6 + 0.4 * demResponse), 0.65);
  }

  gl_FragColor = vec4(color, alpha);
}
`;

// (no shared buffer needed — each material owns its Vector4 seed array)

export function createSunSurfaceMaterial(sunMap: Texture | null | undefined): ShaderMaterial | null {
  if (!sunMap) {
    return null;
  }

  // Pre-fill initial sunspot seeds  
  const sunspotSeeds = [];
  for (let i = 0; i < 8; i++) {
    sunspotSeeds.push({ value: new Array(4).fill(0) });
  }

  const material = new ShaderMaterial({
    vertexShader: SUN_SURFACE_VERTEX_SHADER,
    fragmentShader: SUN_SURFACE_FRAGMENT_SHADER,
    uniforms: {
      time: { value: 0 },
      activity: { value: 0.55 },
      baseMap: { value: sunMap },
      observationMap: { value: sunMap },
      observationBlend: { value: 0 },
      observationEmission: { value: 0.25 },
      flarePoints: {
        value: [
          new Vector4(0, 0, 0, 0),
          new Vector4(0, 0, 0, 0),
          new Vector4(0, 0, 0, 0)
        ]
      },
      // Sunspot uniforms: each vec4 is (longitude, latitude, angularRadius, intensity)
      // Three.js requires Vector4 for vec4 uniforms (Float32Array would be treated as float[])
      sunspotSeeds: {
        value: [
          new Vector4(0, 0, 0, 0), new Vector4(0, 0, 0, 0), new Vector4(0, 0, 0, 0), new Vector4(0, 0, 0, 0),
          new Vector4(0, 0, 0, 0), new Vector4(0, 0, 0, 0), new Vector4(0, 0, 0, 0), new Vector4(0, 0, 0, 0)
        ]
      }
    }
  });
  material.toneMapped = false;
  return material;
}

function clampSunspotSeedValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeFeatureDirection(sample: unknown): [number, number, number] | null {
  if (!Array.isArray(sample) || sample.length !== 3) return null;
  const x = Number(sample[0]);
  const y = Number(sample[1]);
  const z = Number(sample[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  const len = Math.hypot(x, y, z);
  if (len < 1e-6) return null;
  return [x / len, y / len, z / len];
}

function collectPhysicsDrivenSunspotGroups(physicsState: SolarPhysicsStateLike | null | undefined, activity: number) {
  const features = Array.isArray(physicsState?.corona?.features) ? physicsState.corona.features : [];
  if (features.length === 0) return [];

  const grouped = new Map();
  for (const feature of features) {
    const kind = `${feature?.kind ?? 'loop'}`.toLowerCase();
    if (kind !== 'loop' && kind !== 'cme') continue;

    const baseDir = normalizeFeatureDirection(feature?.base_dir) ?? normalizeFeatureDirection(feature?.arc?.[0]);
    const pairedDir = normalizeFeatureDirection(feature?.paired_dir)
      ?? normalizeFeatureDirection(feature?.arc?.[feature?.arc?.length - 1]);
    if (!baseDir || !pairedDir) continue;

    const centerX = baseDir[0] + pairedDir[0];
    const centerY = baseDir[1] + pairedDir[1];
    const centerZ = baseDir[2] + pairedDir[2];
    const centerLen = Math.hypot(centerX, centerY, centerZ);
    if (centerLen < 1e-6) continue;

    const brightness = clampUnit(Number(feature?.brightness) || 0.2);
    const emergence = clampUnit(Number(feature?.emergence) || brightness);
    const dot = clampSunspotSeedValue(
      baseDir[0] * pairedDir[0] + baseDir[1] * pairedDir[1] + baseDir[2] * pairedDir[2],
      -1,
      1
    );
    const separation = Math.acos(dot);
    const centerDir = [centerX / centerLen, centerY / centerLen, centerZ / centerLen];
    const lon = Math.atan2(centerDir[2], centerDir[0]);
    const lat = Math.asin(clampSunspotSeedValue(centerDir[1], -1, 1));
    const intensity = clampUnit(0.22 + brightness * 0.5 + emergence * 0.28 + activity * 0.08);
    const angularRadius = clampSunspotSeedValue(0.018 + separation * 0.38 + intensity * 0.022, 0.018, 0.105);
    const score = brightness * 0.62 + emergence * 0.28 + (kind === 'cme' ? 0.10 : 0.04);
    const regionId = `${feature?.active_region_id ?? feature?.region_id ?? feature?.id ?? `sunspot-${grouped.size}`}`;
    const existing = grouped.get(regionId);
    if (!existing || score > existing.score) {
      grouped.set(regionId, { lon, lat, angularRadius, intensity, score });
    }
  }

  return Array.from(grouped.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

/**
 * Procedurally update sunspot positions based on current activity level.
 * Sunspots follow Spörer's law: appear at ~±35° lat at cycle start, migrate to ~±5° at end.
 * Called once per second from the animation loop.
 */
export function updateSunspotUniforms(sunSurfaceMaterial: ShaderMaterial | null | undefined, activity: number, timeSec: number, physicsState: SolarPhysicsStateLike | null = null): void {
  if (!sunSurfaceMaterial?.uniforms?.sunspotSeeds) return;

  const TWO_PI = Math.PI * 2;
  const seeds = sunSurfaceMaterial.uniforms.sunspotSeeds.value;
  const physicsDrivenGroups = collectPhysicsDrivenSunspotGroups(physicsState, activity);
  let seedIndex = 0;

  for (const group of physicsDrivenGroups) {
    seeds[seedIndex].set(group.lon, group.lat, group.angularRadius, group.intensity);
    seedIndex += 1;
    if (seedIndex >= seeds.length) return;
  }

  // Fill any remaining slots with deterministic synthetic spots so the Sun still reads correctly
  // when the backend has not produced enough active-region structure yet.
  const targetCount = Math.min(8, Math.round(activity * 7) + 1);
  for (let i = seedIndex; i < 8; i++) {
    if (i >= targetCount) {
      seeds[i].set(0, 0, 0, 0);
      continue;
    }

    const syntheticIndex = i - seedIndex;
    const s = (syntheticIndex * 0.618033 + activity * 0.3) % 1;
    const s2 = ((syntheticIndex + 3) * 0.382 + activity * 0.5) % 1;
    const baseLon = (s * TWO_PI + timeSec * 0.000261) % TWO_PI;
    const maxLat = 0.05 + activity * 0.55;
    const latSign = (syntheticIndex % 2 === 0) ? 1.0 : -1.0;
    const baseLat = latSign * (maxLat * 0.3 + s2 * maxLat * 0.7);
    const angularRadius = 0.025 + s * 0.08 * activity;
    const intensity = 0.55 + s2 * 0.35;
    seeds[i].set(baseLon, baseLat, angularRadius, intensity);
  }
}

export function updateSunFlaresUniforms(
  sunSurfaceMaterial: ShaderMaterial | null | undefined,
  flareParamsArray: readonly number[]
): void {
  if (!sunSurfaceMaterial?.uniforms?.flarePoints) return;
  const fp = sunSurfaceMaterial.uniforms.flarePoints.value;
  for (let i = 0; i < 3; i++) {
    const base = i * 4;
    // lon, lat, intensity, unused
    fp[i].set(flareParamsArray[base], flareParamsArray[base + 1], flareParamsArray[base + 2], flareParamsArray[base + 3]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE B: CHROMOSPHERE LAYER
// ─────────────────────────────────────────────────────────────────────────────

const CHROMOSPHERE_VERTEX_SHADER = `
attribute float aLifetime;   // [0,1] normalized phase offset per spicule
attribute float aSpeed;      // animation speed multiplier (< 3.0 = Type I, >= 3.0 = Type II)
attribute vec3  aAxis;       // outward normal direction

uniform float time;
uniform float sunRadius;
uniform float chromoActivity;
uniform float chromoOpacity;  // driven from JS, not material.opacity

varying float vAlpha;
varying float vHeight; // 0 = base, 1 = tip

void main() {
  // Distinguish Type I (slow, parabolic) from Type II (fast, fade-without-descent)
  // Type I: 10-40 km/s, 3-7 min lifetime, symmetric rise+fall
  // Type II: 80-300 km/s, 10-150s lifetime, rapid rise then fade in place
  bool isTypeII = aSpeed >= 3.0;

  float phase = fract(time * aSpeed * 0.018 + aLifetime);
  float rise;
  if (isTypeII) {
    // Type II: rapid ballistic rise (30% of cycle), then fade without descent
    rise = phase < 0.3 ? (phase / 0.3) : max(0.0, 1.0 - (phase - 0.3) * 2.5);
  } else {
    // Type I: parabolic rise and fall (Beckers 1972)
    rise = phase < 0.5 ? phase * 2.0 : (1.0 - phase) * 2.0;
  }

  // Type II spicules reach higher and are thinner
  float maxHeight = isTypeII
    ? (0.007 + chromoActivity * 0.013)   // Type II: 4,900-13,900 km
    : (0.005 + chromoActivity * 0.009);   // Type I:  3,500-9,700 km
  float height = rise * maxHeight;
  vHeight = rise;

  // Offset vertex outward along the surface normal
  vec3 spiculePos = position + aAxis * height * sunRadius;

  // Limb fade: spicules are most visible at the limb (edge) of the disk
  vec3 viewDelta = cameraPosition - vec3(modelMatrix[3]);
  float ndotv = abs(dot(normalize(aAxis), normalize(viewDelta)));
  float limbFade = clamp(1.0 - ndotv * 0.65, 0.0, 1.0);

  vAlpha = rise * limbFade * (0.45 + chromoActivity * 0.55) * chromoOpacity;
  // Type II fade faster overall
  if (isTypeII) vAlpha *= 0.7;

  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(spiculePos, 1.0);

  // Distance-scaled point size (perspective attenuation)
  float dist = length(cameraPosition - (modelMatrix * vec4(spiculePos, 1.0)).xyz);
  float baseSize = isTypeII ? 1.2 : 2.0; // Type II are thinner (~200 km vs ~660 km)
  gl_PointSize = clamp(baseSize * (300.0 / max(dist, 0.001)), 0.5, 6.0);
}
`;

const CHROMOSPHERE_FRAGMENT_SHADER = `
uniform vec3 chromoColor;
varying float vAlpha;
varying float vHeight;

void main() {
  if (vAlpha < 0.008) discard;
  // Spicules brighten toward tip (hot plasma) with slight color shift
  vec3 baseColor = chromoColor * (0.65 + vHeight * 0.35);
  gl_FragColor = vec4(baseColor, vAlpha);
}
`;

/**
 * Phase B1: Create the chromosphere spicule field.
 * Returns a Points object that should be added to the sun's spinGroup.
 * @param {number} sunDisplayRadius - The Sun's rendered radius in scene units
 * @param {number} count - Number of spicule points (~8000 is realistic)
 */
export function createChromosphereLayer(sunDisplayRadius: number, count = 8000): Points {
  const positions = new Float32Array(count * 3);
  const lifetimes = new Float32Array(count);
  const speeds = new Float32Array(count);
  const axes = new Float32Array(count * 3);
  const TWO_PI = Math.PI * 2;

  for (let i = 0; i < count; i++) {
    // Random point on unit sphere surface
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * TWO_PI;
    const r = Math.sqrt(Math.max(0, 1 - u * u));
    const nx = r * Math.cos(theta);
    const ny = u;
    const nz = r * Math.sin(theta);

    // Position at solar surface
    positions[i * 3] = nx * sunDisplayRadius;
    positions[i * 3 + 1] = ny * sunDisplayRadius;
    positions[i * 3 + 2] = nz * sunDisplayRadius;

    // Outward axis (same as normal)
    axes[i * 3] = nx;
    axes[i * 3 + 1] = ny;
    axes[i * 3 + 2] = nz;

    // Lifetime offset: evenly spread so not all in phase
    lifetimes[i] = Math.random();
    // Speed: Type I (70% of particles) vs Type II (30%)
    // Type I: aSpeed 0.5-2.0 (slow, parabolic rise+fall)
    // Type II: aSpeed 5.0-15.0 (fast, rapid rise then fade)
    if (i < count * 0.7) {
      speeds[i] = 0.5 + Math.random() * 1.5;   // Type I
    } else {
      speeds[i] = 5.0 + Math.random() * 10.0;  // Type II
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aAxis', new Float32BufferAttribute(axes, 3));
  geometry.setAttribute('aLifetime', new Float32BufferAttribute(lifetimes, 1));
  geometry.setAttribute('aSpeed', new Float32BufferAttribute(speeds, 1));

  const material = new ShaderMaterial({
    vertexShader: CHROMOSPHERE_VERTEX_SHADER,
    fragmentShader: CHROMOSPHERE_FRAGMENT_SHADER,
    uniforms: {
      time: { value: 0 },
      sunRadius: { value: sunDisplayRadius },
      chromoActivity: { value: 0.5 },
      chromoOpacity: { value: 0.3 },  // controlled via updateChromosphereLayer
      chromoColor: { value: new Color('#ff8842') }  // default warm orange
    },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false
  });

  const points = new Points(geometry, material);
  points.userData.bodyId = 'sun-chromosphere';
  points.userData.baseRadiusAu = sunDisplayRadius;
  points.userData.radiusScale = 1;
  points.userData.activityScale = 1.004;
  points.renderOrder = 4;
  points.frustumCulled = false;
  return points;
}

/**
 * Phase B: Update the chromosphere spicule layer each frame.
 * @param {Points} chromospherePoints - The object returned by createChromosphereLayer
 * @param {number} timeSec - Current wall-clock seconds
 * @param {number} activity - [0,1] solar activity level
 */
export function updateChromosphereLayer(chromospherePoints: Points | null | undefined, timeSec: number, activity: number, {
  activeChannel = undefined as string | null | undefined,
  observationBlend = 0,
  observationEmission = 0,
  observedConfidence = 0,
  observedFreshness = 0
} = {}) {
  if (!chromospherePoints) return;
  const chromoMaterial = chromospherePoints.material as ShaderMaterial | undefined;
  if (!chromoMaterial?.uniforms) return;
  const u = chromoMaterial.uniforms;
  u.time.value = timeSec;
  u.chromoActivity.value = activity;
  const channelKey = `${activeChannel ?? ''}`.toLowerCase();
  const observationWeight = clampUnit(observationBlend * 0.55 + observationEmission * 0.30 + observedConfidence * 0.15);
  const confidenceWeight = clampUnit(observedConfidence * 0.6 + observedFreshness * 0.4);

  if (channelKey === 'aia_304') {
    u.chromoColor.value.set('#ff3d78');
    u.chromoOpacity.value = 0.48 + activity * 0.18 + confidenceWeight * 0.24 + observationWeight * 0.14;
  } else if (channelKey === 'aia_171') {
    u.chromoColor.value.set('#ff9d4d');
    u.chromoOpacity.value = 0.16 + activity * 0.08 + observationWeight * 0.06;
  } else {
    u.chromoColor.value.set('#ff8842');
    u.chromoOpacity.value = 0.14 + activity * 0.10 + observationWeight * 0.08;
  }

  const radiusScale = Number(chromospherePoints.userData?.radiusScale) || 1;
  const activityScale = 1.004 + activity * 0.010 + observationEmission * 0.012 + (channelKey === 'aia_304' ? 0.010 : 0);
  chromospherePoints.userData.activityScale = activityScale;
  chromospherePoints.scale.setScalar(radiusScale * activityScale);
}

export function createSunGlow(sunDisplayRadius: number): Sprite {

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx?.createRadialGradient(128, 128, 0, 128, 128, 128);
  if (ctx && gradient) {
  gradient.addColorStop(0, 'rgba(255, 246, 176, 0.4)');
  gradient.addColorStop(0.12, 'rgba(255, 214, 102, 0.22)');
  gradient.addColorStop(0.34, 'rgba(255, 170, 66, 0.09)');
  gradient.addColorStop(0.68, 'rgba(255, 124, 42, 0.03)');
  gradient.addColorStop(1, 'rgba(255, 82, 20, 0.0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
  }

  const texture = new CanvasTexture(canvas);
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.42,
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: false
  });

  const glow = new Sprite(material);
  glow.scale.setScalar(sunDisplayRadius * 9.1);
  glow.userData.baseScaleMultiplier = 9.1;
  glow.userData.baseOpacity = 0.42;
  return glow;
}

export function createSunCoronaShell(
  geometry: BufferGeometry
): Mesh<BufferGeometry, ShaderMaterial> {
  const material = new ShaderMaterial({
    vertexShader: SUN_CORONA_VERTEX_SHADER,
    fragmentShader: SUN_CORONA_FRAGMENT_SHADER,
    uniforms: {
      time: { value: 0 },
      activity: { value: 0.5 },
      coronalHoleActivity: { value: 0.5 },
      coronaColor: { value: new Color('#ffb877') },
      observationBlend: { value: 0 },
      observationEmission: { value: 0.25 },
      sunRadius: { value: 1.0 },  // updated by updateSunMaterialUniforms
      channelMode: { value: 0.0 },  // DEM channel: 0=off, 1=094, 2=171, 3=193, 4=211, 5=304
      coronalHoles: {
        value: [
          new Vector4(0, 0, 0, 0), new Vector4(0, 0, 0, 0),
          new Vector4(0, 0, 0, 0), new Vector4(0, 0, 0, 0),
          new Vector4(0, 0, 0, 0), new Vector4(0, 0, 0, 0),
          new Vector4(0, 0, 0, 0), new Vector4(0, 0, 0, 0)
        ]
      },
      coronalHoleCount: { value: 0.0 }
    },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: BackSide
  });
  const mesh = new Mesh(geometry, material);
  mesh.userData.bodyId = 'sun-corona';
  // Expanded to ~4 solar radii for physical K-corona radial falloff
  mesh.userData.surfaceScale = 4.0;
  return mesh;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSITION REGION SHELL
// ─────────────────────────────────────────────────────────────────────────────
// The transition region (TR) is a thin (~100 km, or ~1.4×10⁻⁴ R☉) layer
// between the chromosphere (~20,000 K) and corona (~1 MK). Temperature jumps
// 50× over just a few hundred km. The TR produces characteristic EUV emission
// visible in SDO/AIA 304Å (He II at ~50,000 K).

const TR_VERTEX_SHADER = `
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying float vNdotV;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec3 viewDir = normalize(cameraPosition - worldPosition.xyz);
  vNdotV = dot(vWorldNormal, viewDir);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const TR_FRAGMENT_SHADER = `
uniform float time;
uniform float activity;
uniform float channelMode;  // 0=off, 1=094, 2=171, 3=193, 4=211, 5=304
uniform float trOpacity;    // base opacity multiplier

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying float vNdotV;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1,0,0)), u.x),
        mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), u.x), u.y),
    mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), u.x),
        mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), u.x), u.y),
    u.z
  );
}

void main() {
  // TR is a limb-brightened emission layer
  float mu = abs(vNdotV);
  float limbBright = pow(1.0 - mu, 2.8);  // strong limb brightening

  // Emission network pattern — TR has a reticulated, web-like structure
  // matching supergranulation cell boundaries (~30 Mm cells)
  vec3 nDir = normalize(vWorldNormal);
  float n1 = noise3(nDir * 18.0 + vec3(time * 0.04, -time * 0.03, time * 0.02));
  float n2 = noise3(nDir * 42.0 + vec3(-time * 0.06, time * 0.05, -time * 0.03));
  float network = smoothstep(0.35, 0.55, n1) * (0.6 + 0.4 * n2);

  // Activity-dependent brightening (more network emission at solar max)
  float emission = (0.12 + network * 0.38 + activity * 0.22) * limbBright;
  emission += 0.04;  // floor emission even at disk center

  // ─── Channel-dependent appearance ──────────────────────────────────────────
  // 304Å: TR is the PRIMARY emission source → very bright, magenta-red
  // 171Å: TR is secondarily visible → moderate
  // 193/211Å: TR barely visible
  // 094Å: TR invisible (too cool for Fe XVIII)
  vec3 baseColor;
  float channelBoost = 1.0;

  if (channelMode > 4.5) {
    // 304Å — He II at 50,000K: TR is the dominant feature
    baseColor = vec3(0.85, 0.10, 0.25);  // magenta-red (He II 304)
    channelBoost = 3.2;  // TR becomes very prominent
  } else if (channelMode > 1.5 && channelMode < 2.5) {
    // 171Å — Fe IX at 0.63 MK: TR weakly visible
    baseColor = vec3(0.5, 0.5, 0.9);
    channelBoost = 0.6;
  } else if (channelMode > 0.5 && channelMode < 1.5) {
    // 094Å — Fe XVIII at 6.3 MK: TR is invisible
    discard;
  } else if (channelMode > 2.5 && channelMode < 4.5) {
    // 193Å or 211Å: very faint TR
    baseColor = vec3(0.55, 0.30, 0.45);
    channelBoost = 0.25;
  } else {
    // Default (no channel): warm UV glow
    baseColor = vec3(0.50, 0.08, 0.18);
    channelBoost = 1.0;
  }

  float alpha = emission * trOpacity * channelBoost;
  alpha = clamp(alpha, 0.0, 0.85);

  if (alpha < 0.005) discard;
  gl_FragColor = vec4(baseColor, alpha);
}
`;

/**
 * Creates the transition region (TR) shell — a thin emissive layer at ~1.004 R☉.
 * The TR is the interface between the chromosphere (20,000K) and corona (1 MK).
 * Brightest in AIA 304Å, visible at the limb in white-light as a thin strip.
 *
 * @param geometry - A SphereGeometry to use (shared with other shells or dedicated)
 * @param sunDisplayRadius - The Sun's display radius in scene units
 */
export function createTransitionRegionShell(
  geometry: BufferGeometry,
  sunDisplayRadius: number
): Mesh<BufferGeometry, ShaderMaterial> {
  const material = new ShaderMaterial({
    vertexShader: TR_VERTEX_SHADER,
    fragmentShader: TR_FRAGMENT_SHADER,
    uniforms: {
      time: { value: 0 },
      activity: { value: 0.5 },
      channelMode: { value: 0.0 },
      trOpacity: { value: 0.18 }
    },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: BackSide
  });

  const mesh = new Mesh(geometry, material);
  mesh.userData.bodyId = 'sun-transition-region';
  // TR sits at ~1.004 R☉ (2,800 km above photosphere)
  // Use 1.006× scale to account for shell geometry thickness
  mesh.userData.surfaceScale = 1.006;
  mesh.scale.setScalar(sunDisplayRadius * 1.006);
  mesh.renderOrder = 3;  // between chromosphere (4) and corona (default)
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Update the transition region shell per frame.
 * @param trMesh - The mesh returned by createTransitionRegionShell
 * @param timeSec - Current wall-clock seconds
 * @param activity - Solar activity [0..1]
 * @param options.activeChannel - AIA channel key (e.g. 'aia_304')
 */
export function updateTransitionRegionShell(
  trMesh: Mesh | null | undefined,
  timeSec: number,
  activity: number,
  { activeChannel = undefined as string | null | undefined } = {}
) {
  if (!trMesh || !(trMesh as any).material?.uniforms) return;
  const u = (trMesh as any).material.uniforms;
  u.time.value = timeSec * 0.4;
  u.activity.value = activity;

  // Map channel key to channelMode float
  const channelKey = `${activeChannel ?? ''}`.toLowerCase();
  let mode = 0.0;
  if (channelKey === 'aia_094') mode = 1.0;
  else if (channelKey === 'aia_171') mode = 2.0;
  else if (channelKey === 'aia_193') mode = 3.0;
  else if (channelKey === 'aia_211') mode = 4.0;
  else if (channelKey === 'aia_304') mode = 5.0;
  u.channelMode.value = mode;

  // Base opacity: faint normally, very bright in 304Å
  u.trOpacity.value = channelKey === 'aia_304'
    ? 0.55 + activity * 0.25
    : 0.12 + activity * 0.08;
}

export function createSunEruptionLayer(sunDisplayRadius: number): Points {
  const burstCount = 360;
  const positions = new Float32Array(burstCount * 3);
  const directions = new Float32Array(burstCount * 3);
  const tangents = new Float32Array(burstCount * 3);
  const speeds = new Float32Array(burstCount);
  const phases = new Float32Array(burstCount);
  const amplitudes = new Float32Array(burstCount);

  for (let i = 0; i < burstCount; i += 1) {
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * TWO_PI;
    const radial = Math.sqrt(Math.max(1e-6, 1 - u * u));
    const dx = radial * Math.cos(theta);
    const dy = radial * Math.sin(theta);
    const dz = u;

    const axisX = Math.abs(dz) > 0.78 ? 1 : 0;
    const axisY = 0;
    const axisZ = Math.abs(dz) > 0.78 ? 0 : 1;

    let tx = dy * axisZ - dz * axisY;
    let ty = dz * axisX - dx * axisZ;
    let tz = dx * axisY - dy * axisX;
    const tangentLen = Math.hypot(tx, ty, tz);
    if (tangentLen > 1e-9) {
      tx /= tangentLen;
      ty /= tangentLen;
      tz /= tangentLen;
    } else {
      tx = 1;
      ty = 0;
      tz = 0;
    }

    const base = i * 3;
    directions[base] = dx;
    directions[base + 1] = dy;
    directions[base + 2] = dz;
    tangents[base] = tx;
    tangents[base + 1] = ty;
    tangents[base + 2] = tz;
    speeds[i] = 0.32 + Math.random() * 1.7;
    phases[i] = Math.random() * TWO_PI;
    amplitudes[i] = 0.04 + Math.random() * 0.22;
    positions[base] = dx * sunDisplayRadius * 1.03;
    positions[base + 1] = dy * sunDisplayRadius * 1.03;
    positions[base + 2] = dz * sunDisplayRadius * 1.03;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

  const material = new PointsMaterial({
    color: new Color('#ffbf74'),
    size: sunDisplayRadius * 0.65,
    transparent: true,
    opacity: 0.34,
    blending: AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });

  const points = new Points(geometry, material);
  points.userData.bodyId = 'sun-eruptions';
  points.userData.sunBursts = {
    burstCount,
    positions,
    directions,
    tangents,
    speeds,
    phases,
    amplitudes,
    baseRadius: sunDisplayRadius
  };
  points.renderOrder = 6;
  return points;
}

export function setSunGlowScale(sunGlowSprite: Sprite | null | undefined, baseRadiusAu: number, pulse = 1): void {
  if (!sunGlowSprite) return;
  const baseScaleMultiplier = sunGlowSprite.userData.baseScaleMultiplier ?? 9.1;
  sunGlowSprite.scale.setScalar(baseRadiusAu * baseScaleMultiplier * pulse);
}

export function setSunEruptionBaseRadius(sunEruptionLayer: Points | null | undefined, baseRadiusAu: number): void {
  if (!sunEruptionLayer) return;
  const bursts = sunEruptionLayer.userData?.sunBursts;
  if (!bursts) return;
  const geometry = sunEruptionLayer.geometry;
  if (!geometry || typeof geometry.getAttribute !== 'function') return;
  const positionAttr = geometry.getAttribute('position');
  if (!positionAttr) return;

  const radius = Math.max(1e-9, baseRadiusAu);
  bursts.baseRadius = radius;
  for (let i = 0; i < bursts.burstCount; i += 1) {
    const base = i * 3;
    bursts.positions[base] = bursts.directions[base] * radius * 1.03;
    bursts.positions[base + 1] = bursts.directions[base + 1] * radius * 1.03;
    bursts.positions[base + 2] = bursts.directions[base + 2] * radius * 1.03;
  }
  positionAttr.needsUpdate = true;
  const eruptionMaterial = sunEruptionLayer.material as PointsMaterial | undefined;
  if (eruptionMaterial?.isPointsMaterial) {
    eruptionMaterial.size = Math.max(0.0000035, radius * 0.65);
  }
}

export function clearSunCoronalLoops(sunCoronalLoopGroup: Group | null | undefined): void {
  if (!sunCoronalLoopGroup) return;
  const loops = Array.isArray(sunCoronalLoopGroup.children)
    ? ([...sunCoronalLoopGroup.children] as Array<Mesh | Line>)
    : [];

  for (const loop of loops) {
    if (loop?.geometry && typeof loop.geometry.dispose === 'function') {
      loop.geometry.dispose();
    }
    const material = loop?.material;
    if (Array.isArray(material)) {
      for (const entry of material) {
        if (entry && typeof entry.dispose === 'function') {
          entry.dispose();
        }
      }
    } else if (material && typeof material.dispose === 'function') {
      material.dispose();
    }
  }

  sunCoronalLoopGroup.clear();
}

export function clearSunParkerSpiralLines(sunParkerSpiralGroup: Group | null | undefined): void {
  if (!sunParkerSpiralGroup) return;
  const lines = Array.isArray(sunParkerSpiralGroup.children)
    ? ([...sunParkerSpiralGroup.children] as Array<Mesh | Line>)
    : [];

  for (const line of lines) {
    if (line?.geometry && typeof line.geometry.dispose === 'function') {
      line.geometry.dispose();
    }
    const material = line?.material;
    if (Array.isArray(material)) {
      for (const entry of material) {
        if (entry && typeof entry.dispose === 'function') {
          entry.dispose();
        }
      }
    } else if (material && typeof material.dispose === 'function') {
      material.dispose();
    }
  }

  sunParkerSpiralGroup.clear();
}

function ensureSunCoronalLoop(sunCoronalLoopGroup: Group, index: number): Line | null {
  if (!sunCoronalLoopGroup) return null;
  if (sunCoronalLoopGroup.children[index]) return sunCoronalLoopGroup.children[index] as Line;

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3));
  const material = new LineBasicMaterial({
    color: new Color('#ffe8c2'),
    transparent: true,
    opacity: 0.15,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const loop = new Line(geometry, material);
  loop.renderOrder = 5;
  loop.frustumCulled = false;
  sunCoronalLoopGroup.add(loop);
  return loop;
}

function stableHash01(input: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}

function ensureSunParkerSpiralLine(sunParkerSpiralGroup: Group, index: number): Line | null {
  if (!sunParkerSpiralGroup) return null;
  if (sunParkerSpiralGroup.children[index]) return sunParkerSpiralGroup.children[index] as Line;

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3));
  const material = new LineBasicMaterial({
    color: new Color('#9bd8ff'),
    transparent: true,
    opacity: 0.17,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const line = new Line(geometry, material);
  line.renderOrder = 4;
  line.frustumCulled = false;
  sunParkerSpiralGroup.add(line);
  return line;
}

export function updateSunCoronalLoopsFromBlendView(
  sunCoronalLoopGroup: Group | null | undefined,
  blendView: SolarFeatureBlendView | null | undefined,
  sunRadiusAu: number,
  maxLoops = 144,
  timeSec = 0,
  activeChannel: string | null = null
) {
  if (!sunCoronalLoopGroup) return;
  const rawBlendAlpha = blendView?.blendAlpha;
  const blendAlpha = clampUnit(
    typeof rawBlendAlpha === 'number' && Number.isFinite(rawBlendAlpha) ? rawBlendAlpha : 1
  );
  const sourceEntries = Array.isArray(blendView?.entries) ? blendView.entries : [];
  const loopEntries = sourceEntries.slice(0, maxLoops);

  for (let i = 0; i < loopEntries.length; i += 1) {
    const entry = loopEntries[i];
    const loop = ensureSunCoronalLoop(sunCoronalLoopGroup, i);
    if (!loop) continue;

    const fromCount = entry?.fromFeature?.arc?.length ?? 0;
    const toCount = entry?.toFeature?.arc?.length ?? 0;
    const pointCount = Math.max(2, fromCount, toCount);
    const geometry = loop.geometry;
    let positionAttr = geometry.getAttribute('position');
    if (!positionAttr || positionAttr.count !== pointCount) {
      positionAttr = new Float32BufferAttribute(new Float32Array(pointCount * 3), 3);
      geometry.setAttribute('position', positionAttr);
    }

    const array = positionAttr.array;
    const featureSeed = stableHash01(`${entry?.id ?? `loop-${i}`}`);
    const speedRaw = Number(entry?.toFeature?.speedFactor);
    const speedFactor = Number.isFinite(speedRaw) ? speedRaw : 0.2;
    const brightness = solarFeatureEntryBrightness(entry, blendAlpha);
    const flowRate = 0.42 + speedFactor * 1.6 + featureSeed * 0.55;
    const wobbleRate = 0.29 + speedFactor * 0.9 + featureSeed * 0.35;
    for (let p = 0; p < pointCount; p += 1) {
      const phase = pointCount <= 1 ? 0 : p / (pointCount - 1);
      const sampled = sampleSolarFeatureEntryPoint(entry, phase, blendAlpha);
      const base = p * 3;
      if (!sampled) {
        array[base] = 0;
        array[base + 1] = 0;
        array[base + 2] = 0;
        continue;
      }

      const sampleX = sampled[0];
      const sampleY = sampled[1];
      const sampleZ = sampled[2];
      const sampleLen = Math.hypot(sampleX, sampleY, sampleZ) || 1;
      const nx = sampleX / sampleLen;
      const ny = sampleY / sampleLen;
      const nz = sampleZ / sampleLen;
      let tx = -ny;
      let ty = nx;
      let tz = 0;
      let tangentLen = Math.hypot(tx, ty, tz);
      if (tangentLen < 1e-6) {
        tx = 0;
        ty = -nz;
        tz = ny;
        tangentLen = Math.hypot(tx, ty, tz);
      }
      if (tangentLen > 1e-8) {
        tx /= tangentLen;
        ty /= tangentLen;
        tz /= tangentLen;
      }

      const envelope = Math.sin(Math.PI * phase);
      const flow = Math.sin(timeSec * flowRate + phase * 11.8 + featureSeed * TWO_PI);
      const wobble = Math.cos(timeSec * wobbleRate - phase * 8.4 + featureSeed * TWO_PI * 0.7);
      const radialScale = 1 + flow * (0.004 + brightness * 0.012) * envelope;
      const tangentOffset = wobble * (0.0009 + brightness * 0.003) * envelope;

      const displayRadius = coronalToDisplay(sampleLen, sunRadiusAu) * radialScale;
      array[base] = nx * displayRadius + tx * sunRadiusAu * tangentOffset;
      array[base + 1] = ny * displayRadius + ty * sunRadiusAu * tangentOffset;
      array[base + 2] = nz * displayRadius + tz * sunRadiusAu * tangentOffset;
    }
    positionAttr.needsUpdate = true;
    geometry.setDrawRange(0, pointCount);

    const kind = `${entry?.kind ?? 'loop'}`.toLowerCase();
    // Default (white-light) colors per feature type
    let color = kind === 'cme'
      ? '#ffb67f'
      : kind === 'plume'
        ? '#ffd7a7'
        : '#fff1d2';

    // DEM channel-aware coloring for coronal loops
    const channelKey = `${activeChannel ?? ''}`.toLowerCase();
    let demOpacityMod = 1.0;  // channel-based opacity multiplier
    if (channelKey === 'aia_094') {
      // 094Å (Fe XVIII, 6.3 MK): only flare-heated loops visible
      color = kind === 'cme' ? '#44ff44' : '#22cc22';
      demOpacityMod = kind === 'cme' ? 1.8 : 0.15;  // dim quiet loops, boost CMEs
    } else if (channelKey === 'aia_171') {
      // 171Å (Fe IX, 0.63 MK): quiet coronal loops are brightest
      color = kind === 'cme' ? '#8888ff' : '#aabbff';
      demOpacityMod = kind === 'cme' ? 0.4 : 1.6;  // boost quiet loops
    } else if (channelKey === 'aia_193') {
      // 193Å (Fe XII, 1.6 MK): hot active region loops
      color = kind === 'cme' ? '#cc8844' : '#ddaa55';
      demOpacityMod = 1.3;
    } else if (channelKey === 'aia_211') {
      // 211Å (Fe XIV, 2.0 MK): active region loops
      color = kind === 'cme' ? '#9944cc' : '#bb66dd';
      demOpacityMod = 1.2;
    } else if (channelKey === 'aia_304') {
      // 304Å (He II, 0.05 MK): coronal loops are too hot — dim them
      color = '#992222';
      demOpacityMod = 0.2;
    }

    const loopMaterial = loop.material as LineBasicMaterial | undefined;
    if (loopMaterial?.isLineBasicMaterial) {
      loopMaterial.color.set(color);
      const baseOpacity = kind === 'cme' ? 0.05 : 0.065;
      const gain = kind === 'cme' ? 0.2 : 0.31;
      const flicker = 0.84 + 0.16 * Math.sin(timeSec * (0.9 + speedFactor * 0.8) + featureSeed * TWO_PI * 1.3);
      loopMaterial.opacity = Math.max(0.015, Math.min(0.55, (baseOpacity + brightness * gain) * flicker * demOpacityMod));
    }
    loop.visible = brightness > 0.003;
  }

  for (let i = loopEntries.length; i < sunCoronalLoopGroup.children.length; i += 1) {
    sunCoronalLoopGroup.children[i].visible = false;
  }
}

export function updateSunParkerSpiralFromPhysicsState(
  sunParkerSpiralGroup: Group | null | undefined,
  physicsState: SolarPhysicsStateLike | null | undefined,
  sunRadiusAu: number,
  maxLines = 6,
  maxPoints = 96,
  timeSec = 0,
  camera: Camera | null = null
) {
  if (!sunParkerSpiralGroup) return;
  const sourceLines = Array.isArray(physicsState?.heliosphere?.parker_spiral?.lines)
    ? physicsState.heliosphere.parker_spiral.lines
    : [];
  const spiralLines = sourceLines.slice(0, Math.max(1, maxLines));
  const cameraDistanceAu = camera?.position
    ? Math.hypot(
      Number(camera.position.x) || 0,
      Number(camera.position.y) || 0,
      Number(camera.position.z) || 0
    )
    : null;
  const cameraFade = cameraDistanceAu !== null && Number.isFinite(cameraDistanceAu)
    ? clampUnit((cameraDistanceAu - 0.5) / 1.5)
    : 1;

  for (let i = 0; i < spiralLines.length; i += 1) {
    const entry = spiralLines[i];
    const line = ensureSunParkerSpiralLine(sunParkerSpiralGroup, i);
    if (!line) continue;

    const arcRaw = Array.isArray(entry?.arc) ? entry.arc : [];
    const arc = [];
    for (let p = 0; p < arcRaw.length && arc.length < Math.max(2, maxPoints); p += 1) {
      const sample = arcRaw[p];
      if (!Array.isArray(sample) || sample.length !== 3) continue;
      const x = Number(sample[0]);
      const y = Number(sample[1]);
      const z = Number(sample[2]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      // The heliosphere is drawn at true distances so the spiral crosses 1 AU at Earth's orbit;
      // the part that would sit inside the enlarged Sun is clipped (owner decision D3).
      if (Math.hypot(x, y, z) * SOLAR_RADIUS_AU < sunRadiusAu * 1.05) continue;
      arc.push([x, y, z]);
    }
    if (arc.length < 2) {
      line.visible = false;
      continue;
    }

    const pointCount = arc.length;
    const geometry = line.geometry;
    let positionAttr = geometry.getAttribute('position');
    if (!positionAttr || positionAttr.count !== pointCount) {
      positionAttr = new Float32BufferAttribute(new Float32Array(pointCount * 3), 3);
      geometry.setAttribute('position', positionAttr);
    }
    const array = positionAttr.array;
    for (let p = 0; p < pointCount; p += 1) {
      const base = p * 3;
      array[base] = arc[p][0] * SOLAR_RADIUS_AU;
      array[base + 1] = arc[p][1] * SOLAR_RADIUS_AU;
      array[base + 2] = arc[p][2] * SOLAR_RADIUS_AU;
    }
    positionAttr.needsUpdate = true;
    geometry.setDrawRange(0, pointCount);

    const lineMaterial = line.material as LineBasicMaterial | undefined;
    if (lineMaterial?.isLineBasicMaterial) {
      const seed = stableHash01(`${entry?.id ?? `spiral-${i}`}`);
      const windKmsRaw = Number(entry?.wind_speed_kms);
      const windKms = Number.isFinite(windKmsRaw) ? windKmsRaw : 420;
      const windFactor = clampUnit((windKms - 300) / 560);
      const slowWindFactor = 1 - windFactor;
      const polarity = Number(entry?.polarity);
      const flicker = 0.84 + 0.16 * Math.sin(timeSec * (0.38 + seed * 0.22) + seed * TWO_PI);
      if (polarity < 0) {
        lineMaterial.color.setRGB(0.73 + slowWindFactor * 0.09, 0.53 + slowWindFactor * 0.07, 0.40 + slowWindFactor * 0.06);
      } else {
        lineMaterial.color.setRGB(0.40 + slowWindFactor * 0.08, 0.53 + slowWindFactor * 0.07, 0.73 + slowWindFactor * 0.09);
      }
      const sectorOpacity = 0.06 + slowWindFactor * 0.06;
      lineMaterial.opacity = Math.max(0.0, Math.min(0.34, sectorOpacity * flicker * cameraFade));
    }
    line.visible = cameraFade > 0.01;
  }

  for (let i = spiralLines.length; i < sunParkerSpiralGroup.children.length; i += 1) {
    sunParkerSpiralGroup.children[i].visible = false;
  }
}

export function updateSunEruptionLayerFromBlendView({
  sunEruptionLayer,
  blendView,
  sunRadiusAu,
  timeSec,
  activity
}: {
  sunEruptionLayer: Points | null | undefined;
  blendView: SolarFeatureBlendView | null | undefined;
  sunRadiusAu: number;
  timeSec: number;
  activity: number;
}) {
  const bursts = sunEruptionLayer?.userData?.sunBursts;
  if (!bursts) return;
  const geometry = sunEruptionLayer.geometry;
  if (!geometry || typeof geometry.getAttribute !== 'function') return;
  const positionAttr = geometry.getAttribute('position');
  if (!positionAttr) return;

  const blendedFeatures = Array.isArray(blendView?.entries) ? blendView.entries : [];
  if (blendedFeatures.length > 0) {
    const blendAlpha = clampUnit(Number(blendView?.blendAlpha) || 1);
    bursts.baseRadius = sunRadiusAu;
    for (let i = 0; i < bursts.burstCount; i += 1) {
      const base = i * 3;
      const featureEntry = blendedFeatures[i % blendedFeatures.length];
      const sampledSpeed = Number(featureEntry?.toFeature?.speedFactor);
      const speedFactor = Number.isFinite(sampledSpeed) ? sampledSpeed : 0.2;
      const phase = (timeSec * speedFactor * 0.08 + i * 0.013 + bursts.phases[i] * 0.17) % 1;
      const sampled = sampleSolarFeatureEntryPoint(featureEntry, phase, blendAlpha);
      if (!sampled) {
        bursts.positions[base] = bursts.directions[base] * sunRadiusAu * 1.03;
        bursts.positions[base + 1] = bursts.directions[base + 1] * sunRadiusAu * 1.03;
        bursts.positions[base + 2] = bursts.directions[base + 2] * sunRadiusAu * 1.03;
        continue;
      }

      const brightness = solarFeatureEntryBrightness(featureEntry, blendAlpha);
      const radialBoost = 1 + brightness * 0.065;
      const sampledLen = Math.hypot(sampled[0], sampled[1], sampled[2]) || 1;
      const displayScale = (coronalToDisplay(sampledLen, sunRadiusAu) / sampledLen) * radialBoost;
      bursts.positions[base] = sampled[0] * displayScale;
      bursts.positions[base + 1] = sampled[1] * displayScale;
      bursts.positions[base + 2] = sampled[2] * displayScale;
    }
  } else {
    const plumeFactor = 0.45 + activity * 0.95;
    for (let i = 0; i < bursts.burstCount; i += 1) {
      const base = i * 3;
      const wave = Math.sin(timeSec * bursts.speeds[i] + bursts.phases[i]);
      const plume = Math.max(0, wave) * bursts.amplitudes[i] * plumeFactor;
      const swirl = Math.sin(timeSec * bursts.speeds[i] * 0.53 + bursts.phases[i] * 1.7) * bursts.amplitudes[i] * 0.36;
      const radius = bursts.baseRadius * (1.03 + plume);
      const tangentOffset = bursts.baseRadius * swirl;

      bursts.positions[base] = bursts.directions[base] * radius + bursts.tangents[base] * tangentOffset;
      bursts.positions[base + 1] = bursts.directions[base + 1] * radius + bursts.tangents[base + 1] * tangentOffset;
      bursts.positions[base + 2] = bursts.directions[base + 2] * radius + bursts.tangents[base + 2] * tangentOffset;
    }
  }

  positionAttr.needsUpdate = true;
  const burstMaterial = sunEruptionLayer.material as PointsMaterial | undefined;
  if (burstMaterial?.isPointsMaterial) {
    burstMaterial.opacity = Math.max(0.1, 0.14 + activity * 0.27);
    burstMaterial.size = Math.max(0.0000024, bursts.baseRadius * (0.28 + activity * 0.2));
  }
}

export function setSunObservationTexture({
  sunSurfaceMaterial,
  observationTexture
}: {
  sunSurfaceMaterial: ShaderMaterial | null | undefined;
  observationTexture: Texture | null | undefined;
}) {
  if (!sunSurfaceMaterial?.uniforms?.observationMap) return;
  const baseMap = sunSurfaceMaterial.uniforms.baseMap?.value ?? null;
  sunSurfaceMaterial.uniforms.observationMap.value = observationTexture ?? baseMap;
}

export function updateSunMaterialUniforms({
  sunSurfaceMaterial = undefined as ShaderMaterial | null | undefined,
  sunCoronaMaterial = undefined as ShaderMaterial | null | undefined,
  timeSec = 0,
  activity = 0,
  observationBlend = 0,
  observationEmission = 0.25,
  coronaHue = undefined as number[] | null | undefined,
  sunDisplayRadius = 1.0,
  activeChannel = undefined as string | null | undefined,
  coronalHoleData = undefined as { holes?: Array<{ center_lon_rad?: unknown; center_lat_rad?: unknown; extent_lon_rad?: unknown; extent_lat_rad?: unknown }> | null } | null | undefined
}) {
  const obsBlend = clampUnit(Number(observationBlend) || 0);
  const obsEmission = clampUnit(Number(observationEmission) || 0.25);
  if (sunSurfaceMaterial?.uniforms) {
    sunSurfaceMaterial.uniforms.time.value = timeSec * 0.4;
    sunSurfaceMaterial.uniforms.activity.value = activity;
    if (sunSurfaceMaterial.uniforms.observationBlend) {
      sunSurfaceMaterial.uniforms.observationBlend.value = obsBlend;
    }
    if (sunSurfaceMaterial.uniforms.observationEmission) {
      sunSurfaceMaterial.uniforms.observationEmission.value = obsEmission;
    }
  }

  if (sunCoronaMaterial?.uniforms) {
    sunCoronaMaterial.uniforms.time.value = timeSec * 0.54;
    sunCoronaMaterial.uniforms.activity.value = activity;
    if (sunCoronaMaterial.uniforms.coronalHoleActivity) {
      sunCoronaMaterial.uniforms.coronalHoleActivity.value = activity;
    }
    if (sunCoronaMaterial.uniforms.sunRadius) {
      sunCoronaMaterial.uniforms.sunRadius.value = sunDisplayRadius;
    }
    if (sunCoronaMaterial.uniforms.observationBlend) {
      sunCoronaMaterial.uniforms.observationBlend.value = obsBlend;
    }
    if (sunCoronaMaterial.uniforms.observationEmission) {
      sunCoronaMaterial.uniforms.observationEmission.value = obsEmission;
    }
    const coronaColor = sunCoronaMaterial.uniforms.coronaColor?.value;
    if (coronaColor?.isColor) {
      if (coronaHue && Array.isArray(coronaHue) && coronaHue.length === 3) {
        // Apply the channel-specific corona color directly
        coronaColor.setRGB(coronaHue[0], coronaHue[1], coronaHue[2]);
      } else {
        // Default activity-driven orange tint
        coronaColor.setRGB(1.0, 0.66 + activity * 0.14, 0.34 + activity * 0.1);
      }
    }

    // DEM channel mode: map AIA channel key to numeric mode
    if (sunCoronaMaterial.uniforms.channelMode) {
      const channelKey = `${activeChannel ?? ''}`.toLowerCase();
      let mode = 0.0;
      if (channelKey === 'aia_094') mode = 1.0;
      else if (channelKey === 'aia_171') mode = 2.0;
      else if (channelKey === 'aia_193') mode = 3.0;
      else if (channelKey === 'aia_211') mode = 4.0;
      else if (channelKey === 'aia_304') mode = 5.0;
      sunCoronaMaterial.uniforms.channelMode.value = mode;
    }

    // ─── Coronal Hole Uniform Update ────────────────────────────────────────
    if (sunCoronaMaterial.uniforms.coronalHoles && sunCoronaMaterial.uniforms.coronalHoleCount) {
      const holesArray = sunCoronaMaterial.uniforms.coronalHoles.value;
      const holesList = coronalHoleData?.holes;
      if (Array.isArray(holesList) && holesList.length > 0) {
        const count = Math.min(8, holesList.length);
        for (let i = 0; i < count; i++) {
          const h = holesList[i];
          const cLon = Number(h?.center_lon_rad) || 0;
          const cLat = Number(h?.center_lat_rad) || 0;
          const eLon = Number(h?.extent_lon_rad) || 0.1;
          const eLat = Number(h?.extent_lat_rad) || 0.1;
          holesArray[i].set(cLon, cLat, eLon, eLat);
        }
        for (let i = count; i < 8; i++) {
          holesArray[i].set(0, 0, 0, 0);
        }
        sunCoronaMaterial.uniforms.coronalHoleCount.value = count;
      } else {
        // No data — reset to fallback (coronalHoleActivity-driven)
        sunCoronaMaterial.uniforms.coronalHoleCount.value = 0.0;
        for (let i = 0; i < 8; i++) {
          holesArray[i].set(0, 0, 0, 0);
        }
      }
    }
  }
}
