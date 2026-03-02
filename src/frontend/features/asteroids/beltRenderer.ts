import {
  BufferGeometry,
  Color,
  DodecahedronGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  Vector3,
} from 'three';

import type { AsteroidDef } from '../../../sim/asteroidBelt';
import type { KBODef } from '../../../sim/kuiperBelt';
import { AU_KM } from '../../../constants';

// ── Geometry generation ──────────────────────────────────────────────────────
// Creates a small library of deformed polyhedra for visual variety.
// Each instance picks one at random; within the InstancedMesh we use a single
// merged geometry but vary scale + rotation per instance.

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

// ── Display scale ────────────────────────────────────────────────────────────
// Asteroids are tiny in AU. We exaggerate size to make them visible while
// keeping relative proportions roughly correct.

function displayRadiusAu(diameterKm: number, isKuiper: boolean): number {
  const radiusKm = diameterKm / 2;
  const realAu = radiusKm / AU_KM;
  // Exaggerate: smallest ~0.003 AU, Ceres ~0.012 AU
  const minDisplay = isKuiper ? 0.008 : 0.003;
  const scale = isKuiper ? 0.00025 : 0.00035;
  return Math.max(minDisplay, Math.sqrt(radiusKm) * scale);
}

// ── Belt renderer ────────────────────────────────────────────────────────────

export interface BeltRendererHandle {
  mesh: InstancedMesh;
  updatePositions: (positions: Float32Array) => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

const _mat4 = new Matrix4();
const _pos = new Vector3();
const _quat = new Quaternion();
const _scale = new Vector3();

export function createAsteroidBeltRenderer(
  asteroids: readonly AsteroidDef[],
  seed = 99
): BeltRendererHandle {
  const rand = mulberry32(seed);
  const count = asteroids.length;

  const geometry = createIrregularGeometry(1, 0.20, rand);

  const material = new MeshStandardMaterial({
    roughness: 0.85,
    metalness: 0.08,
    flatShading: true,
    vertexColors: false,
  });

  const mesh = new InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  // Per-instance color
  const colors = new Float32Array(count * 3);
  const tmpColor = new Color();

  for (let i = 0; i < count; i++) {
    const ast = asteroids[i];
    const r = displayRadiusAu(ast.diameterKm, false);

    // Random rotation for visual variety
    _quat.set(rand() - 0.5, rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    // Slight elongation for irregular shapes
    const stretch = 1 + ast.irregularity * (rand() - 0.3);
    _scale.set(r * stretch, r, r / (1 + ast.irregularity * rand() * 0.4));
    _pos.set(0, 0, 0);
    _mat4.compose(_pos, _quat, _scale);
    mesh.setMatrixAt(i, _mat4);

    tmpColor.set(ast.color);
    colors[i * 3]     = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  mesh.instanceColor = new InstancedBufferAttribute(colors, 3);
  mesh.instanceMatrix.needsUpdate = true;

  // Pre-store per-instance quaternion and scale for position-only updates
  const storedQuats = new Float32Array(count * 4);
  const storedScales = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    mesh.getMatrixAt(i, _mat4);
    _mat4.decompose(_pos, _quat, _scale);
    storedQuats[i * 4]     = _quat.x;
    storedQuats[i * 4 + 1] = _quat.y;
    storedQuats[i * 4 + 2] = _quat.z;
    storedQuats[i * 4 + 3] = _quat.w;
    storedScales[i * 3]     = _scale.x;
    storedScales[i * 3 + 1] = _scale.y;
    storedScales[i * 3 + 2] = _scale.z;
  }

  function updatePositions(positions: Float32Array) {
    for (let i = 0; i < count; i++) {
      const off = i * 3;
      _pos.set(positions[off], positions[off + 1], positions[off + 2]);
      _quat.set(
        storedQuats[i * 4], storedQuats[i * 4 + 1],
        storedQuats[i * 4 + 2], storedQuats[i * 4 + 3]
      );
      _scale.set(storedScales[off], storedScales[off + 1], storedScales[off + 2]);
      _mat4.compose(_pos, _quat, _scale);
      mesh.setMatrixAt(i, _mat4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    mesh,
    updatePositions,
    setVisible(v: boolean) { mesh.visible = v; },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

export function createKuiperBeltRenderer(
  kbos: readonly KBODef[],
  seed = 200
): BeltRendererHandle {
  const rand = mulberry32(seed);
  const count = kbos.length;

  const geometry = createIrregularGeometry(0, 0.25, rand);

  const material = new MeshStandardMaterial({
    roughness: 0.90,
    metalness: 0.02,
    flatShading: true,
  });

  const mesh = new InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  const colors = new Float32Array(count * 3);
  const tmpColor = new Color();

  for (let i = 0; i < count; i++) {
    const kbo = kbos[i];
    const r = displayRadiusAu(kbo.diameterKm, true);

    _quat.set(rand() - 0.5, rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const stretch = 1 + kbo.irregularity * (rand() - 0.3);
    _scale.set(r * stretch, r, r / (1 + kbo.irregularity * rand() * 0.4));
    _pos.set(0, 0, 0);
    _mat4.compose(_pos, _quat, _scale);
    mesh.setMatrixAt(i, _mat4);

    tmpColor.set(kbo.color);
    colors[i * 3]     = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  mesh.instanceColor = new InstancedBufferAttribute(colors, 3);
  mesh.instanceMatrix.needsUpdate = true;

  const storedQuats = new Float32Array(count * 4);
  const storedScales = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    mesh.getMatrixAt(i, _mat4);
    _mat4.decompose(_pos, _quat, _scale);
    storedQuats[i * 4]     = _quat.x;
    storedQuats[i * 4 + 1] = _quat.y;
    storedQuats[i * 4 + 2] = _quat.z;
    storedQuats[i * 4 + 3] = _quat.w;
    storedScales[i * 3]     = _scale.x;
    storedScales[i * 3 + 1] = _scale.y;
    storedScales[i * 3 + 2] = _scale.z;
  }

  function updatePositions(positions: Float32Array) {
    for (let i = 0; i < count; i++) {
      const off = i * 3;
      _pos.set(positions[off], positions[off + 1], positions[off + 2]);
      _quat.set(
        storedQuats[i * 4], storedQuats[i * 4 + 1],
        storedQuats[i * 4 + 2], storedQuats[i * 4 + 3]
      );
      _scale.set(storedScales[off], storedScales[off + 1], storedScales[off + 2]);
      _mat4.compose(_pos, _quat, _scale);
      mesh.setMatrixAt(i, _mat4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    mesh,
    updatePositions,
    setVisible(v: boolean) { mesh.visible = v; },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
