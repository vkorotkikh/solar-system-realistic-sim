import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Mesh,
  Points,
  PointsMaterial,
  ShaderMaterial,
  Sprite,
  SpriteMaterial
} from 'three';
import { clampUnit, solarFeatureEntryBrightness, sampleSolarFeatureEntryPoint } from './solarFeatureBlending.js';

const TWO_PI = Math.PI * 2;

export const SUN_SURFACE_VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
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

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

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
  float amp = 0.65;
  float norm = 0.0;
  for (int i = 0; i < 5; i++) {
    sum += amp * noise3(p);
    norm += amp;
    p *= 2.02;
    amp *= 0.5;
  }
  return sum / max(1e-6, norm);
}

void main() {
  vec3 normalDir = normalize(vWorldNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  float limbWeight = pow(max(dot(normalDir, viewDir), 0.0), 0.42);

  float flowA = fbm(normalDir * 6.0 + vec3(time * 0.18, -time * 0.11, time * 0.07));
  float flowB = fbm(normalDir * 13.0 + vec3(-time * 0.42, time * 0.24, -time * 0.16));
  float granulation = fbm(normalDir * 56.0 + vec3(time * 1.65, -time * 1.25, time * 0.92));
  float spotField = fbm(normalDir * 19.0 + vec3(time * 0.07, time * 0.03, -time * 0.05));
  float spotMask = smoothstep(0.72, 0.92, spotField) * (0.35 + activity * 0.45);

  vec2 uvShift = vec2((flowA - 0.5) * 0.028, (flowB - 0.5) * 0.022);
  vec3 baseTex = texture2D(baseMap, fract(vUv + uvShift + vec2(time * 0.008, 0.0))).rgb;
  vec3 obsTex = texture2D(observationMap, fract(vUv + vec2(time * 0.0032, 0.0))).rgb;
  float obsLuma = dot(obsTex, vec3(0.2126, 0.7152, 0.0722));
  float obsNeighbor = dot(texture2D(observationMap, fract(vUv + vec2(0.0018, -0.0018))).rgb, vec3(0.2126, 0.7152, 0.0722));
  float obsContrast = abs(obsLuma - obsNeighbor);

  float heatPattern = mix(flowA, flowB, 0.5);
  float brightness = 0.62 + heatPattern * 0.35 + granulation * 0.22 - spotMask * 0.44;
  brightness += observationBlend * ((obsLuma - 0.44) * (0.22 + observationEmission * 0.28) + obsContrast * 0.9);
  brightness *= mix(0.78, 1.18, limbWeight);

  vec3 cool = vec3(1.0, 0.42, 0.06);
  vec3 hot = vec3(1.0, 0.78, 0.22);
  vec3 plasma = mix(cool, hot, clamp(brightness, 0.0, 1.0));
  vec3 color = mix(plasma, baseTex * 1.2, 0.42);
  color += vec3(0.95, 0.36, 0.08) * granulation * 0.18;
  vec3 observedAccent = vec3(1.0, 0.58, 0.2) * (obsLuma * 0.45 + obsContrast * 1.1);
  color = mix(color, color + observedAccent * (0.24 + observationEmission * 0.5), observationBlend * 0.7);

  gl_FragColor = vec4(color, 1.0);
}
`;

export const SUN_CORONA_VERTEX_SHADER = `
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const SUN_CORONA_FRAGMENT_SHADER = `
uniform float time;
uniform float activity;
uniform vec3 coronaColor;
uniform float observationBlend;
uniform float observationEmission;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

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

void main() {
  vec3 normalDir = normalize(vWorldNormal);
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
  vec3 hotWhite = vec3(1.0, 0.96, 0.86);
  vec3 color = mix(coronaColor * 0.8, hotWhite, 0.16 + burst * 0.36 + activity * 0.12);
  color = mix(color, hotWhite, observationBlend * (0.08 + observationEmission * 0.28));
  gl_FragColor = vec4(color, alpha);
}
`;

export function createSunSurfaceMaterial(sunMap) {
  if (!sunMap) {
    return null;
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
      observationEmission: { value: 0.25 }
    }
  });
  material.toneMapped = false;
  return material;
}

export function createSunGlow(sunDisplayRadius) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(255, 246, 176, 0.4)');
  gradient.addColorStop(0.12, 'rgba(255, 214, 102, 0.22)');
  gradient.addColorStop(0.34, 'rgba(255, 170, 66, 0.09)');
  gradient.addColorStop(0.68, 'rgba(255, 124, 42, 0.03)');
  gradient.addColorStop(1, 'rgba(255, 82, 20, 0.0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

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

export function createSunCoronaShell(geometry) {
  const material = new ShaderMaterial({
    vertexShader: SUN_CORONA_VERTEX_SHADER,
    fragmentShader: SUN_CORONA_FRAGMENT_SHADER,
    uniforms: {
      time: { value: 0 },
      activity: { value: 0.5 },
      coronaColor: { value: new Color('#ffb877') },
      observationBlend: { value: 0 },
      observationEmission: { value: 0.25 }
    },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: BackSide
  });
  const mesh = new Mesh(geometry, material);
  mesh.userData.bodyId = 'sun-corona';
  mesh.userData.surfaceScale = 1.032;
  return mesh;
}

export function createSunEruptionLayer(sunDisplayRadius) {
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

export function setSunGlowScale(sunGlowSprite, baseRadiusAu, pulse = 1) {
  if (!sunGlowSprite) return;
  const baseScaleMultiplier = sunGlowSprite.userData.baseScaleMultiplier ?? 9.1;
  sunGlowSprite.scale.setScalar(baseRadiusAu * baseScaleMultiplier * pulse);
}

export function setSunEruptionBaseRadius(sunEruptionLayer, baseRadiusAu) {
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
  if (sunEruptionLayer.material?.isPointsMaterial) {
    sunEruptionLayer.material.size = Math.max(0.0000035, radius * 0.65);
  }
}

export function clearSunCoronalLoops(sunCoronalLoopGroup) {
  if (!sunCoronalLoopGroup) return;
  const loops = Array.isArray(sunCoronalLoopGroup.children)
    ? [...sunCoronalLoopGroup.children]
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

export function clearSunParkerSpiralLines(sunParkerSpiralGroup) {
  if (!sunParkerSpiralGroup) return;
  const lines = Array.isArray(sunParkerSpiralGroup.children)
    ? [...sunParkerSpiralGroup.children]
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

function ensureSunCoronalLoop(sunCoronalLoopGroup, index) {
  if (!sunCoronalLoopGroup) return null;
  if (sunCoronalLoopGroup.children[index]) return sunCoronalLoopGroup.children[index];

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

function stableHash01(input) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}

function ensureSunParkerSpiralLine(sunParkerSpiralGroup, index) {
  if (!sunParkerSpiralGroup) return null;
  if (sunParkerSpiralGroup.children[index]) return sunParkerSpiralGroup.children[index];

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
  sunCoronalLoopGroup,
  blendView,
  sunRadiusAu,
  maxLoops = 144,
  timeSec = 0
) {
  if (!sunCoronalLoopGroup) return;
  const blendAlpha = clampUnit(Number(blendView?.blendAlpha) || 1);
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

      array[base] = sampleX * sunRadiusAu * radialScale + tx * sunRadiusAu * tangentOffset;
      array[base + 1] = sampleY * sunRadiusAu * radialScale + ty * sunRadiusAu * tangentOffset;
      array[base + 2] = sampleZ * sunRadiusAu * radialScale + tz * sunRadiusAu * tangentOffset;
    }
    positionAttr.needsUpdate = true;
    geometry.setDrawRange(0, pointCount);

    const kind = `${entry?.kind ?? 'loop'}`.toLowerCase();
    const color = kind === 'cme'
      ? '#ffb67f'
      : kind === 'plume'
        ? '#ffd7a7'
        : '#fff1d2';
    if (loop.material?.isLineBasicMaterial) {
      loop.material.color.set(color);
      const baseOpacity = kind === 'cme' ? 0.05 : 0.065;
      const gain = kind === 'cme' ? 0.2 : 0.31;
      const flicker = 0.84 + 0.16 * Math.sin(timeSec * (0.9 + speedFactor * 0.8) + featureSeed * TWO_PI * 1.3);
      loop.material.opacity = Math.max(0.028, Math.min(0.46, (baseOpacity + brightness * gain) * flicker));
    }
    loop.visible = brightness > 0.003;
  }

  for (let i = loopEntries.length; i < sunCoronalLoopGroup.children.length; i += 1) {
    sunCoronalLoopGroup.children[i].visible = false;
  }
}

export function updateSunParkerSpiralFromPhysicsState(
  sunParkerSpiralGroup,
  physicsState,
  sunRadiusAu,
  maxLines = 6,
  maxPoints = 96,
  timeSec = 0,
  camera = null
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
  const cameraFade = Number.isFinite(cameraDistanceAu)
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
      array[base] = arc[p][0] * sunRadiusAu;
      array[base + 1] = arc[p][1] * sunRadiusAu;
      array[base + 2] = arc[p][2] * sunRadiusAu;
    }
    positionAttr.needsUpdate = true;
    geometry.setDrawRange(0, pointCount);

    if (line.material?.isLineBasicMaterial) {
      const seed = stableHash01(`${entry?.id ?? `spiral-${i}`}`);
      const windKmsRaw = Number(entry?.wind_speed_kms);
      const windKms = Number.isFinite(windKmsRaw) ? windKmsRaw : 420;
      const windFactor = clampUnit((windKms - 300) / 560);
      const slowWindFactor = 1 - windFactor;
      const polarity = Number(entry?.polarity);
      const flicker = 0.84 + 0.16 * Math.sin(timeSec * (0.38 + seed * 0.22) + seed * TWO_PI);
      if (polarity < 0) {
        line.material.color.setRGB(0.73 + slowWindFactor * 0.09, 0.53 + slowWindFactor * 0.07, 0.40 + slowWindFactor * 0.06);
      } else {
        line.material.color.setRGB(0.40 + slowWindFactor * 0.08, 0.53 + slowWindFactor * 0.07, 0.73 + slowWindFactor * 0.09);
      }
      const sectorOpacity = 0.06 + slowWindFactor * 0.06;
      line.material.opacity = Math.max(0.0, Math.min(0.34, sectorOpacity * flicker * cameraFade));
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
      bursts.positions[base] = sampled[0] * sunRadiusAu * radialBoost;
      bursts.positions[base + 1] = sampled[1] * sunRadiusAu * radialBoost;
      bursts.positions[base + 2] = sampled[2] * sunRadiusAu * radialBoost;
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
  if (sunEruptionLayer.material?.isPointsMaterial) {
    sunEruptionLayer.material.opacity = Math.max(0.1, 0.14 + activity * 0.27);
    sunEruptionLayer.material.size = Math.max(0.0000024, bursts.baseRadius * (0.28 + activity * 0.2));
  }
}

export function setSunObservationTexture({
  sunSurfaceMaterial,
  observationTexture
}) {
  if (!sunSurfaceMaterial?.uniforms?.observationMap) return;
  const baseMap = sunSurfaceMaterial.uniforms.baseMap?.value ?? null;
  sunSurfaceMaterial.uniforms.observationMap.value = observationTexture ?? baseMap;
}

export function updateSunMaterialUniforms({
  sunSurfaceMaterial,
  sunCoronaMaterial,
  timeSec,
  activity,
  observationBlend = 0,
  observationEmission = 0.25
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
    if (sunCoronaMaterial.uniforms.observationBlend) {
      sunCoronaMaterial.uniforms.observationBlend.value = obsBlend;
    }
    if (sunCoronaMaterial.uniforms.observationEmission) {
      sunCoronaMaterial.uniforms.observationEmission.value = obsEmission;
    }
    const coronaColor = sunCoronaMaterial.uniforms.coronaColor?.value;
    if (coronaColor?.isColor) {
      coronaColor.setRGB(1.0, 0.66 + activity * 0.14, 0.34 + activity * 0.1);
    }
  }
}
