import {
  BufferGeometry,
  Color,
  DodecahedronGeometry,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  Vector3
} from 'three';

import type { AsteroidDef } from '../../../sim/asteroidBelt';
import type { KBODef, BinaryCompanionDef } from '../../../sim/kuiperBelt';
import { J2000_JD, AU_KM } from '../../../constants';

// ── Geometry generation ──────────────────────────────────────────────────────

const DEG_TO_RAD = Math.PI / 180;
// Fixed heliocentric Kepler elements define the model. Planet positions/masses
// do not participate: an age-squared acceleration offset is not an integrator.
const ORBIT_TIME_WINDOW_DAYS = 8;

function mulberry32(seed: number) {
  let s = seed | 0;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createIrregularGeometry(
  detail: number,
  irregularity: number,
  rand: () => number
): BufferGeometry {
  const base = detail > 1
    ? new IcosahedronGeometry(1, detail)
    : rand() < 0.5
      ? new OctahedronGeometry(1, 0)
      : new DodecahedronGeometry(1, 0);

  const pos = base.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const scale = 1 + (rand() - 0.5) * 2 * irregularity;
    pos.setX(i, pos.getX(i) * scale);
    pos.setY(i, pos.getY(i) * (1 + (rand() - 0.5) * 2 * irregularity * 0.8));
    pos.setZ(i, pos.getZ(i) * (1 + (rand() - 0.5) * 2 * irregularity * 0.6));
  }
  pos.needsUpdate = true;
  base.computeVertexNormals();
  return base;
}

// Shader source for two-body Kepler propagation.
const ASTEROID_ORBIT_VERTEX_SHADER = {
  header: /* glsl */`
    attribute vec4 aOrbitParams1; // x = aAu, y = e, z = iRad, w = Omega
    attribute vec4 aOrbitParams2; // omega, signed mean anomaly at window start, period, reserved
    attribute vec4 aSpinParams;   // xyz = spinAxis, w = spinRateRadPerDay
    attribute float aSpinPhase;   // spin phase at window start

    uniform float uElapsedDays;
    uniform float uOrbitScaleAu;
    const float TWO_PI = 6.283185307179586;
    const float PI = 3.141592653589793;

    vec3 vOrbitOffset;

    // Range-reduced Taylor polynomials keep orbital coordinates independent of
    // implementation-defined GPU transcendental accuracy (including SwiftShader).
    float orbitSin(float angle) {
      float x = angle;
      // Adding pi to an already small angle destroys its low-order bits.
      if (x > PI || x < -PI) x -= TWO_PI * floor((x + PI) / TWO_PI);
      if (x > 1.570796326794897) x = 3.141592653589793 - x;
      if (x < -1.570796326794897) x = -3.141592653589793 - x;
      float y = x * x;
      return x * (1.0 + y * (-0.166666666666667 + y * (0.008333333333333
        + y * (-0.000198412698413 + y * (0.000002755731922
        + y * (-0.000000025052108 + y * 0.000000000160590))))));
    }

    float orbitCos(float angle) {
      float x = angle;
      if (x > PI || x < -PI) x -= TWO_PI * floor((x + PI) / TWO_PI);
      float signValue = 1.0;
      if (x > 1.570796326794897) { x = 3.141592653589793 - x; signValue = -1.0; }
      if (x < -1.570796326794897) { x = -3.141592653589793 - x; signValue = -1.0; }
      float y = x * x;
      return signValue * (1.0 + y * (-0.5 + y * (0.041666666666667
        + y * (-0.001388888888889 + y * (0.000024801587302
        + y * (-0.000000275573192 + y * 0.000000002087676))))));
    }

    float solveKepler(float meanAnomaly, float eccentricity) {
      if (meanAnomaly == 0.0) return 0.0;
      // Input: signed binary32 mean anomaly in [-PI, PI], 0 <= e <= 0.999999.
      // Odd symmetry retains tiny negative anomalies without adding 2*pi.
      float mean = abs(meanAnomaly);
      float lower = 0.0;
      float upper = PI;
      float eccentricAnomaly = eccentricity < 0.8 ? mean : min(
        mean / (1.0 - eccentricity), pow(6.0 * mean / eccentricity, 1.0 / 3.0)
      );
      for (int i = 0; i < 32; i++) {
        float f;
        if (eccentricAnomaly <= 1.0) {
          // E - e*sin(E) = (1-e)*E + e*(E-sin(E)). Evaluate the small
          // difference directly; subtracting two rounded sines is ill-conditioned.
          float y = eccentricAnomaly * eccentricAnomaly;
          float difference = eccentricAnomaly * y * (0.166666666666667
            + y * (-0.008333333333333 + y * (0.000198412698413
            + y * (-0.000002755731922 + y * (0.000000025052108
            - y * 0.000000000160590)))));
          f = (1.0 - eccentricity) * eccentricAnomaly + eccentricity * difference - mean;
        } else {
          f = eccentricAnomaly - eccentricity * orbitSin(eccentricAnomaly) - mean;
        }
        if (f == 0.0) return sign(meanAnomaly) * eccentricAnomaly;
        if (f > 0.0) upper = eccentricAnomaly;
        else lower = eccentricAnomaly;
        float halfSine = orbitSin(0.5 * eccentricAnomaly);
        float fPrime = (1.0 - eccentricity) + 2.0 * eccentricity * halfSine * halfSine;
        float candidate = eccentricAnomaly - f / fPrime;
        // Stop at float convergence, not an absolute 1e-6-radian step cutoff.
        if (candidate == eccentricAnomaly) return sign(meanAnomaly) * eccentricAnomaly;
        if (candidate <= lower || candidate >= upper) candidate = 0.5 * (lower + upper);
        eccentricAnomaly = candidate;
      }
      return sign(meanAnomaly) * eccentricAnomaly;
    }

    vec3 rotateAroundAxis(vec3 value, vec3 axis, float angle) {
      float s = sin(angle);
      float c = cos(angle);
      float oc = 1.0 - c;
      return value * c
        + cross(axis, value) * s
        + axis * dot(axis, value) * oc;
    }

  `,

  normalVertex: /* glsl */`
    float spinLenSq = dot(aSpinParams.xyz, aSpinParams.xyz);
    vec3 spinAxis = aSpinParams.xyz;
    float spinAngle = aSpinPhase + aSpinParams.w * uElapsedDays;
    if (spinLenSq > 1e-6) {
      spinAxis /= sqrt(spinLenSq);
      objectNormal = rotateAroundAxis(objectNormal, spinAxis, spinAngle);
    }
  `,

  beginVertex: /* glsl */`
    float a = aOrbitParams1.x;
    float e = clamp(aOrbitParams1.y, 0.0, 0.999999);
    float i = aOrbitParams1.z;
    float omegaNode = aOrbitParams1.w;
    float argPeriapsis = aOrbitParams2.x;
    float meanAnomaly0 = aOrbitParams2.y;
    float periodDays = max(aOrbitParams2.z, 1.0);
    float meanMotion = (TWO_PI / periodDays);
    float deltaDays = uElapsedDays;
    float meanAnomaly = meanAnomaly0 + meanMotion * deltaDays;
    if (meanAnomaly > PI || meanAnomaly < -PI) {
      meanAnomaly -= TWO_PI * floor((meanAnomaly + PI) / TWO_PI);
    }
    float eccentricAnomaly = solveKepler(meanAnomaly, e);

    float sqrtTerm = sqrt(max(1.0 - e * e, 1e-6));
    vec3 orbital = vec3(
      a * (orbitCos(eccentricAnomaly) - e),
      a * sqrtTerm * orbitSin(eccentricAnomaly),
      0.0
    );

    float cosOmega = orbitCos(omegaNode);
    float sinOmega = orbitSin(omegaNode);
    float cosArg = orbitCos(argPeriapsis);
    float sinArg = orbitSin(argPeriapsis);
    float cosI = orbitCos(i);
    float sinI = orbitSin(i);
    vec3 orbitPosition = vec3(
      orbital.x * (cosOmega * cosArg - sinOmega * sinArg * cosI) + orbital.y * (-cosOmega * sinArg - sinOmega * cosArg * cosI),
      orbital.x * (sinOmega * cosArg + cosOmega * sinArg * cosI) + orbital.y * (-sinOmega * sinArg + cosOmega * cosArg * cosI),
      orbital.x * (sinArg * sinI) + orbital.y * (cosArg * sinI)
    );

    vOrbitOffset = orbitPosition * uOrbitScaleAu;

    float spinLenSqLocal = dot(aSpinParams.xyz, aSpinParams.xyz);
    vec3 transformed = position.xyz;
    float localSpin = aSpinPhase + aSpinParams.w * deltaDays;
    if (spinLenSqLocal > 1e-6) {
      vec3 spinAxis = normalize(aSpinParams.xyz);
      transformed = rotateAroundAxis(position.xyz, spinAxis, localSpin);
    }
  `,

  worldPosition: /* glsl */`
    // The instance matrix carries the asteroid's own shape (random rotation x
    // body-radius scale, ~1e-3). It must transform only the vertex; adding the
    // orbital offset first would scale the orbit down by that same factor and
    // collapse the whole belt inside the Sun.
    vec4 worldPositionWithOrbit = vec4( transformed, 1.0 );

    #ifdef USE_BATCHING
      worldPositionWithOrbit = batchingMatrix * worldPositionWithOrbit;
    #endif

    #ifdef USE_INSTANCING
      worldPositionWithOrbit = instanceMatrix * worldPositionWithOrbit;
    #endif

    worldPositionWithOrbit.xyz += vOrbitOffset;

    vec4 worldPosition = modelMatrix * worldPositionWithOrbit;
  `,

  projectVertex: /* glsl */`
    // Same ordering rule as worldPosition above: instance transform first, then
    // the orbital offset, so gl_Position places the asteroid on its real orbit.
    vec4 mvPositionWithOrbit = vec4( transformed, 1.0 );

    #ifdef USE_BATCHING
      mvPositionWithOrbit = batchingMatrix * mvPositionWithOrbit;
    #endif

    #ifdef USE_INSTANCING
      mvPositionWithOrbit = instanceMatrix * mvPositionWithOrbit;
    #endif

    mvPositionWithOrbit.xyz += vOrbitOffset;

    vec4 mvPosition = modelViewMatrix * mvPositionWithOrbit;
    gl_Position = projectionMatrix * mvPosition;
  `
};

function getOrbitFloat(value: number | null | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return value;
}

interface OrbitUniforms {
  uElapsedDays: { value: number };
  uOrbitScaleAu: { value: number };
}

function createOrbitMaterial() {
  const uniforms: OrbitUniforms = {
    uElapsedDays: { value: 0 },
    uOrbitScaleAu: { value: 1 },
  };

  const material = new MeshStandardMaterial({
    roughness: 0.85,
    metalness: 0.08,
    flatShading: true,
    vertexColors: true
  });

  // WARNING: Fragile shader patching — uses string replacement on Three.js
  // shader includes (e.g. #include <common>). These include names may change
  // across Three.js versions. Verify after any Three.js upgrade.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uElapsedDays = uniforms.uElapsedDays;
    shader.uniforms.uOrbitScaleAu = uniforms.uOrbitScaleAu;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>\n${ASTEROID_ORBIT_VERTEX_SHADER.header}`
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>\n${ASTEROID_ORBIT_VERTEX_SHADER.normalVertex}`
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      ASTEROID_ORBIT_VERTEX_SHADER.beginVertex
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      ASTEROID_ORBIT_VERTEX_SHADER.worldPosition
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      ASTEROID_ORBIT_VERTEX_SHADER.projectVertex
    );
  };

  return { material, uniforms };
}

// ── Display scale ────────────────────────────────────────────────────────────

function displayRadiusAu(diameterKm: number, isKuiper: boolean): number {
  const radiusKm = diameterKm / 2;
  const minDisplay = isKuiper ? 0.008 : 0.003;
  const scale = isKuiper ? 0.00025 : 0.00035;
  return Math.max(minDisplay, Math.sqrt(radiusKm) * scale);
}

function realRadiusAu(diameterKm: number): number {
  return (diameterKm / 2) / AU_KM;
}

// ── Belt renderer ────────────────────────────────────────────────────────────

export interface BeltRendererHandle {
  mesh: InstancedMesh;
  companionMesh?: InstancedMesh;
  updatePositions: (positions: Float32Array) => void;
  updateBinaryPositions?: (companionPositions: Float32Array) => void;
  setJulianDate: (julianDate: number) => void;
  /** Compatibility no-op: fixed two-body elements, no planetary perturbation integration. */
  setPerturberPositions: (jupiterPositionAu: Vector3, saturnPositionAu: Vector3) => void;
  /** Compatibility no-op: fixed two-body elements, no planetary perturbation integration. */
  setPerturberMasses: (jupiterMuAu3Day2: number, saturnMuAu3Day2: number) => void;
  setScaleMode: (useRealisticScale: boolean) => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

const _mat4 = new Matrix4();
const _pos = new Vector3();
const _quat = new Quaternion();
const _scale = new Vector3();

const _reusableColor = new Color();

function addInstanceColorData(colors: Float32Array, index: number, value: number): void {
  const offset = index * 3;
  _reusableColor.set(value);
  colors[offset] = _reusableColor.r;
  colors[offset + 1] = _reusableColor.g;
  colors[offset + 2] = _reusableColor.b;
}

function fillAsteroidOrbits(
  count: number,
  asteroids: readonly AsteroidDef[],
  orbitParam1: Float32Array,
  orbitParam2: Float32Array,
  spinParams: Float32Array,
  colors: Float32Array
) {
  for (let i = 0; i < count; i++) {
    const ast = asteroids[i];
    const orbit = ast.orbit;
    const offset4 = i * 4;

    orbitParam1[offset4] = getOrbitFloat(orbit.aAu, 2.5);
    orbitParam1[offset4 + 1] = getOrbitFloat(orbit.e, 0);
    orbitParam1[offset4 + 2] = getOrbitFloat(orbit.iDeg, 0) * DEG_TO_RAD;
    orbitParam1[offset4 + 3] = getOrbitFloat(orbit.ascendingNodeDeg, 0) * DEG_TO_RAD;

    orbitParam2[offset4] = getOrbitFloat(orbit.argPeriapsisDeg, 0) * DEG_TO_RAD;
    orbitParam2[offset4 + 1] = getOrbitFloat(orbit.meanAnomalyDeg, 0) * DEG_TO_RAD;
    const period = getOrbitFloat(orbit.periodDays, 0);
    orbitParam2[offset4 + 2] = period < 1 ? 365.25 : period;
    orbitParam2[offset4 + 3] = 0; // Reserved; no age-squared perturbation model.

    addInstanceColorData(colors, i, ast.color);
  }

  for (let i = 0; i < count; i++) {
    const i4 = i * 4;
    const angle = (i + 1) * 0.6180339887498949;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const spin = 2.0 * (i + 7.3) * 1e-4;
    spinParams[i4] = cosA;
    spinParams[i4 + 1] = sinA;
    spinParams[i4 + 2] = cosA * sinA * (1 - (Math.abs(sinA)));
    spinParams[i4 + 3] = spin;
  }
}

export function createAsteroidBeltRenderer(
  asteroids: readonly AsteroidDef[],
  seed = 99
): BeltRendererHandle {
  const rand = mulberry32(seed);
  const count = asteroids.length;
  let disposed = false;

  const geometry = createIrregularGeometry(1, 0.20, rand);
  const { material, uniforms } = createOrbitMaterial();

  const mesh = new InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  const colors = new Float32Array(count * 3);
  const orbitParam1 = new Float32Array(count * 4);
  const orbitParam2 = new Float32Array(count * 4);
  const spinParams = new Float32Array(count * 4);

  fillAsteroidOrbits(count, asteroids, orbitParam1, orbitParam2, spinParams, colors);

  const spinPhases = new Float32Array(count);
  let referenceJd = Number.NaN;
  const wrapPhase = (phase: number) => {
    const wrapped = phase % (2 * Math.PI);
    return wrapped > Math.PI ? wrapped - 2 * Math.PI
      : wrapped < -Math.PI ? wrapped + 2 * Math.PI : wrapped;
  };
  function rebaseTime(julianDate: number) {
    const nextReference = Math.floor(julianDate / ORBIT_TIME_WINDOW_DAYS) * ORBIT_TIME_WINDOW_DAYS;
    if (nextReference !== referenceJd) {
      referenceJd = nextReference;
      for (let i = 0; i < count; i++) {
        const orbit = asteroids[i].orbit;
        const age = referenceJd - getOrbitFloat(orbit.epochJd, J2000_JD);
        const rawPeriod = getOrbitFloat(orbit.periodDays, 365.25);
        const period = rawPeriod < 1 ? 365.25 : rawPeriod;
        // Reduce in CPU double precision before packing the small phase/time.
        orbitParam2[i * 4 + 1] = wrapPhase(
          getOrbitFloat(orbit.meanAnomalyDeg, 0) * DEG_TO_RAD + 2 * Math.PI * ((age % period) / period),
        );
        spinPhases[i] = wrapPhase(spinParams[i * 4 + 3] * age);
      }
      const orbitAttribute = geometry.getAttribute('aOrbitParams2');
      const spinAttribute = geometry.getAttribute('aSpinPhase');
      if (orbitAttribute) orbitAttribute.needsUpdate = true;
      if (spinAttribute) spinAttribute.needsUpdate = true;
    }
    uniforms.uElapsedDays.value = julianDate - referenceJd;
  }
  rebaseTime(J2000_JD);

  geometry.setAttribute('aOrbitParams1', new InstancedBufferAttribute(orbitParam1, 4));
  geometry.setAttribute('aOrbitParams2', new InstancedBufferAttribute(orbitParam2, 4));
  geometry.setAttribute('aSpinParams', new InstancedBufferAttribute(spinParams, 4));
  geometry.setAttribute('aSpinPhase', new InstancedBufferAttribute(spinPhases, 1));
  geometry.getAttribute('aOrbitParams1').needsUpdate = true;
  geometry.getAttribute('aOrbitParams2').needsUpdate = true;
  geometry.getAttribute('aSpinParams').needsUpdate = true;

  mesh.instanceColor = new InstancedBufferAttribute(colors, 3);
  mesh.instanceColor.needsUpdate = true;

  // Store per-instance orientation & irregularity factors for scale-mode switching
  const instanceQuats = new Float32Array(count * 4);
  const instanceStretch = new Float32Array(count * 2); // [stretchX, squishZ]

  for (let i = 0; i < count; i++) {
    const ast = asteroids[i];
    const diameterRenderScale = displayRadiusAu(ast.diameterKm, false);
    _quat.set(rand() - 0.5, rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const stretch = 1 + ast.irregularity * (rand() - 0.3);
    const squishZ = 1 / (1 + ast.irregularity * rand() * 0.4);
    instanceQuats[i * 4] = _quat.x;
    instanceQuats[i * 4 + 1] = _quat.y;
    instanceQuats[i * 4 + 2] = _quat.z;
    instanceQuats[i * 4 + 3] = _quat.w;
    instanceStretch[i * 2] = stretch;
    instanceStretch[i * 2 + 1] = squishZ;
    _scale.set(
      diameterRenderScale * stretch,
      diameterRenderScale,
      diameterRenderScale * squishZ
    );
    _pos.set(0, 0, 0);
    _mat4.compose(_pos, _quat, _scale);
    mesh.setMatrixAt(i, _mat4);
  }
  mesh.instanceMatrix.needsUpdate = true;

  function rebuildInstanceScales(useRealistic: boolean) {
    for (let i = 0; i < count; i++) {
      const ast = asteroids[i];
      const baseR = useRealistic
        ? realRadiusAu(ast.diameterKm)
        : displayRadiusAu(ast.diameterKm, false);
      _quat.set(
        instanceQuats[i * 4],
        instanceQuats[i * 4 + 1],
        instanceQuats[i * 4 + 2],
        instanceQuats[i * 4 + 3]
      );
      const stretch = instanceStretch[i * 2];
      const squishZ = instanceStretch[i * 2 + 1];
      _scale.set(baseR * stretch, baseR, baseR * squishZ);
      _pos.set(0, 0, 0);
      _mat4.compose(_pos, _quat, _scale);
      mesh.setMatrixAt(i, _mat4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    mesh,
    updatePositions(_positions: Float32Array) {
      // Kept for renderer interface compatibility.
      // Main belt asteroids are now fully GPU-propagated from orbital attributes.
      return;
    },
    setJulianDate(julianDate: number) {
      const safe = Number.isFinite(julianDate) ? julianDate : J2000_JD;
      rebaseTime(safe);
    },
    setPerturberPositions() { return; },
    setPerturberMasses() { return; },
    setScaleMode(useRealisticScale: boolean) {
      rebuildInstanceScales(useRealisticScale);
    },
    setVisible(v: boolean) {
      mesh.visible = v;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // Instance buffers belong to InstancedMesh, not BufferGeometry.
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    }
  };
}

export function createKuiperBeltRenderer(
  kbos: readonly KBODef[],
  seed = 200
): BeltRendererHandle {
  const rand = mulberry32(seed);
  const count = kbos.length;
  let disposed = false;

  const geometry = createIrregularGeometry(0, 0.25, rand);
  const material = new MeshStandardMaterial({
    roughness: 0.90,
    metalness: 0.02,
    flatShading: true
  });

  const mesh = new InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  const colors = new Float32Array(count * 3);
  const tmpColor = new Color();
  const baseQuats = new Float32Array(count * 4);
  const baseScales = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const kbo = kbos[i];
    const radius = displayRadiusAu(kbo.diameterKm, true);

    _quat.set(rand() - 0.5, rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const stretch = 1 + kbo.irregularity * (rand() - 0.3);
    _scale.set(
      radius * stretch,
      radius,
      radius / (1 + kbo.irregularity * rand() * 0.4)
    );
    baseScales[i * 3] = _scale.x;
    baseScales[i * 3 + 1] = _scale.y;
    baseScales[i * 3 + 2] = _scale.z;
    _pos.set(0, 0, 0);
    _mat4.compose(_pos, _quat, _scale);
    mesh.setMatrixAt(i, _mat4);
    baseQuats[i * 4] = _quat.x;
    baseQuats[i * 4 + 1] = _quat.y;
    baseQuats[i * 4 + 2] = _quat.z;
    baseQuats[i * 4 + 3] = _quat.w;

    tmpColor.set(kbo.color);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  mesh.instanceColor = new InstancedBufferAttribute(colors, 3);
  mesh.instanceMatrix.needsUpdate = true;

  // ── Binary companion mesh ──────────────────────────────────────────────────
  const binaryKBOs: { idx: number; bin: NonNullable<KBODef['binary']> }[] = [];
  for (let i = 0; i < count; i++) {
    if (kbos[i].binary) binaryKBOs.push({ idx: i, bin: kbos[i].binary! });
  }
  const binCount = binaryKBOs.length;

  let companionMesh: InstancedMesh | undefined;
  let companionQuats: Float32Array | undefined;
  let companionScales: Float32Array | undefined;
  const lastPositions = new Float32Array(count * 3).fill(NaN);
  const lastCompanionPositions = new Float32Array(binCount * 3).fill(NaN);
  // CPU writes and requested uploads, not a claim of measured GPU transfers.
  const primaryWork = { matrixWrites: count, uploadRequests: 1, requestedUploadBytes: mesh.instanceMatrix.array.byteLength };
  const companionWork = { matrixWrites: binCount, uploadRequests: binCount > 0 ? 1 : 0, requestedUploadBytes: binCount * 16 * 4 };
  mesh.userData.kuiperBufferWork = primaryWork;

  if (binCount > 0) {
    const compGeometry = createIrregularGeometry(0, 0.30, rand);
    const compMaterial = new MeshStandardMaterial({
      roughness: 0.92,
      metalness: 0.02,
      flatShading: true
    });

    companionMesh = new InstancedMesh(compGeometry, compMaterial, binCount);
    companionMesh.frustumCulled = false;
    companionMesh.castShadow = false;
    companionMesh.receiveShadow = false;

    const compColors = new Float32Array(binCount * 3);
    companionQuats = new Float32Array(binCount * 4);
    companionScales = new Float32Array(binCount * 3);

    for (let j = 0; j < binCount; j++) {
      const { bin } = binaryKBOs[j];
      const radius = displayRadiusAu(bin.diameterKm, true);

      _quat.set(rand() - 0.5, rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
      const stretch = 1 + bin.irregularity * (rand() - 0.3);
      _scale.set(
        radius * stretch,
        radius,
        radius / (1 + bin.irregularity * rand() * 0.4)
      );
      companionScales[j * 3] = _scale.x;
      companionScales[j * 3 + 1] = _scale.y;
      companionScales[j * 3 + 2] = _scale.z;
      _pos.set(0, 0, 0);
      _mat4.compose(_pos, _quat, _scale);
      companionMesh.setMatrixAt(j, _mat4);
      companionQuats[j * 4] = _quat.x;
      companionQuats[j * 4 + 1] = _quat.y;
      companionQuats[j * 4 + 2] = _quat.z;
      companionQuats[j * 4 + 3] = _quat.w;

      tmpColor.set(bin.color);
      compColors[j * 3] = tmpColor.r;
      compColors[j * 3 + 1] = tmpColor.g;
      compColors[j * 3 + 2] = tmpColor.b;
    }

    companionMesh.instanceColor = new InstancedBufferAttribute(compColors, 3);
    companionMesh.instanceMatrix.needsUpdate = true;
    companionMesh.userData.kuiperBufferWork = companionWork;
  }

  return {
    mesh,
    companionMesh,
    updatePositions(positions: Float32Array) {
      let dirty = false;
      for (let i = 0; i < count; i++) {
        const off = i * 3;
        if (positions[off] === lastPositions[off]
          && positions[off + 1] === lastPositions[off + 1]
          && positions[off + 2] === lastPositions[off + 2]) continue;
        lastPositions.set(positions.subarray(off, off + 3), off);
        dirty = true;
        primaryWork.matrixWrites++;
        const q = i * 4;
        const s = i * 3;
        _pos.set(positions[off], positions[off + 1], positions[off + 2]);
        _quat.set(
          baseQuats[q],
          baseQuats[q + 1],
          baseQuats[q + 2],
          baseQuats[q + 3]
        );
        _scale.set(
          baseScales[s],
          baseScales[s + 1],
          baseScales[s + 2]
        );
        _mat4.compose(_pos, _quat, _scale);
        mesh.setMatrixAt(i, _mat4);
      }
      if (dirty) {
        mesh.instanceMatrix.needsUpdate = true;
        primaryWork.uploadRequests++;
        primaryWork.requestedUploadBytes += mesh.instanceMatrix.array.byteLength;
      }
    },
    updateBinaryPositions(companionPositions: Float32Array) {
      if (!companionMesh || !companionQuats || !companionScales) return;
      let dirty = false;
      for (let j = 0; j < binCount; j++) {
        const off = j * 3;
        if (companionPositions[off] === lastCompanionPositions[off]
          && companionPositions[off + 1] === lastCompanionPositions[off + 1]
          && companionPositions[off + 2] === lastCompanionPositions[off + 2]) continue;
        lastCompanionPositions.set(companionPositions.subarray(off, off + 3), off);
        dirty = true;
        companionWork.matrixWrites++;
        const q = j * 4;
        const s = j * 3;
        _pos.set(companionPositions[off], companionPositions[off + 1], companionPositions[off + 2]);
        _quat.set(
          companionQuats[q],
          companionQuats[q + 1],
          companionQuats[q + 2],
          companionQuats[q + 3]
        );
        _scale.set(
          companionScales[s],
          companionScales[s + 1],
          companionScales[s + 2]
        );
        _mat4.compose(_pos, _quat, _scale);
        companionMesh.setMatrixAt(j, _mat4);
      }
      if (dirty) {
        companionMesh.instanceMatrix.needsUpdate = true;
        companionWork.uploadRequests++;
        companionWork.requestedUploadBytes += companionMesh.instanceMatrix.array.byteLength;
      }
    },
    setJulianDate() { return; },
    setPerturberPositions() { return; },
    setPerturberMasses() { return; },
    setScaleMode(_useRealisticScale: boolean) {
      // KBOs are far from the Sun; no visual conflict in realism mode.
      return;
    },
    setVisible(v: boolean) {
      mesh.visible = v;
      if (companionMesh) companionMesh.visible = v;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      if (companionMesh) {
        companionMesh.dispose();
        companionMesh.geometry.dispose();
        (companionMesh.material as MeshStandardMaterial).dispose();
      }
    }
  };
}
