import { afterAll, describe, expect, it } from 'vitest';
import { Matrix4, SphereGeometry, Vector3, type ShaderMaterial, type Vector4 } from 'three';
import {
  SUN_CORONA_FRAGMENT_SHADER,
  SUN_CORONA_VERTEX_SHADER,
  createSunCoronaShell
} from './sunVisuals';

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function raySphereIntersection(
  rayOrigin: Vector3,
  rayDirection: Vector3,
  sphereCenter: Vector3,
  sphereRadius: number
): Vector3 {
  const centerFromRay = sphereCenter.clone().sub(rayOrigin);
  const closestApproach = centerFromRay.dot(rayDirection);
  const halfChord = Math.sqrt(sphereRadius ** 2 - (centerFromRay.lengthSq() - closestApproach ** 2));
  return rayOrigin.clone().addScaledVector(rayDirection, closestApproach - halfChord);
}

function rayCenterImpactRadius(camera: Vector3, fragment: Vector3, sunCenter: Vector3, sunRadius: number): number {
  const rayDirection = fragment.clone().sub(camera).normalize();
  const centerFromCamera = sunCenter.clone().sub(camera);
  return centerFromCamera
    .sub(rayDirection.multiplyScalar(centerFromCamera.dot(rayDirection)))
    .length() / sunRadius;
}

function normalizedCoronaRadial(radius: number): number {
  return (0.036 * radius ** -1.5 + 1.55 * radius ** -6.0) / 1.586;
}

function quietCoronaAlpha(impactRadius: number): number {
  const offLimb = smoothstep(1.0, 1.02, impactRadius);
  const rim = offLimb ** 1.8;
  return (offLimb * 0.06 + rim * 0.09) * 0.26 * normalizedCoronaRadial(Math.max(impactRadius, 1.001));
}

describe('world-space corona profile', () => {
  it('preserves the documented normalized two-term K-corona falloff', () => {
    expect(normalizedCoronaRadial(1.05)).toBeCloseTo(0.75037408, 8);
    expect(normalizedCoronaRadial(2.0)).toBeCloseTo(0.02329551, 8);
    expect(normalizedCoronaRadial(4.0)).toBeCloseTo(0.00307593, 8);
    expect(quietCoronaAlpha(1.05)).toBeGreaterThanOrEqual(0.02);
    expect(normalizedCoronaRadial(1.05)).toBeGreaterThan(normalizedCoronaRadial(2.0));
    expect(normalizedCoronaRadial(2.0)).toBeGreaterThan(normalizedCoronaRadial(4.0));
  });

  it('uses the camera-ray impact mask where the shell-normal mask suppresses 1.05 solar radii', () => {
    const camera = new Vector3(0, 0, 10);
    const sunCenter = new Vector3();
    const rayDirection = new Vector3(1.05 / 10, 0, -Math.sqrt(1 - (1.05 / 10) ** 2));
    const fragment = raySphereIntersection(camera, rayDirection, sunCenter, 4);
    const shellNormal = fragment.clone().normalize();
    const viewDirection = camera.clone().sub(fragment).normalize();
    const legacyLimb = 1 - Math.abs(shellNormal.dot(viewDirection));

    expect(smoothstep(0.78, 0.998, legacyLimb)).toBe(0);
    expect(rayCenterImpactRadius(camera, fragment, sunCenter, 1)).toBeCloseTo(1.05, 12);
    expect(smoothstep(1.0, 1.02, rayCenterImpactRadius(camera, fragment, sunCenter, 1))).toBe(1);
  });

  it('keeps impact radius and falloff invariant under a shared rigid world transform', () => {
    const camera = new Vector3(0, 0, 10);
    const sunCenter = new Vector3();
    const fragment = raySphereIntersection(
      camera,
      new Vector3(1.05 / 10, 0, -Math.sqrt(1 - (1.05 / 10) ** 2)),
      sunCenter,
      4
    );
    const transform = new Matrix4().makeRotationY(0.73).setPosition(12, -3, 7);
    const originalImpact = rayCenterImpactRadius(camera, fragment, sunCenter, 1);
    const transformedImpact = rayCenterImpactRadius(
      camera.clone().applyMatrix4(transform),
      fragment.clone().applyMatrix4(transform),
      sunCenter.clone().applyMatrix4(transform),
      1
    );

    expect(transformedImpact).toBeCloseTo(originalImpact, 12);
    expect(normalizedCoronaRadial(transformedImpact)).toBeCloseTo(normalizedCoronaRadial(originalImpact), 12);
  });

  it('keeps the production corona shell at four solar radii', () => {
    const geometry = new SphereGeometry(1, 16, 8);
    const shell = createSunCoronaShell(geometry);
    try {
      shell.scale.setScalar(Number(shell.userData.surfaceScale));
      shell.updateMatrixWorld(true);
      const positions = geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index += Math.max(1, Math.floor(positions.count / 16))) {
        expect(new Vector3().fromBufferAttribute(positions, index).applyMatrix4(shell.matrixWorld).length()).toBeCloseTo(4, 6);
      }
    } finally {
      geometry.dispose();
      shell.material.dispose();
    }
  });

  it('binds the independently checked profile to center-relative shader inputs', () => {
    const violations = [
      !SUN_CORONA_VERTEX_SHADER.includes('varying vec3 vSunCenterWorld;') && 'vertex shader omits vSunCenterWorld',
      !SUN_CORONA_VERTEX_SHADER.includes('vSunCenterWorld = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;')
        && 'vertex shader does not transform the Sun origin with modelMatrix',
      !SUN_CORONA_FRAGMENT_SHADER.includes('varying vec3 vSunCenterWorld;') && 'fragment shader omits vSunCenterWorld',
      !SUN_CORONA_FRAGMENT_SHADER.includes('float impactR = length(centerFromCamera - rayDirection * dot(centerFromCamera, rayDirection))')
        && 'fragment shader omits center-relative impact radius',
      !SUN_CORONA_FRAGMENT_SHADER.includes('float offLimb = smoothstep(1.0, 1.02, impactR);')
        && 'off-limb mask does not derive from impactR',
      !SUN_CORONA_FRAGMENT_SHADER.includes('float fragR = max(impactR, 1.001);')
        && 'falloff radius does not derive from impactR',
      SUN_CORONA_FRAGMENT_SHADER.includes('length(vWorldPosition) / max(sunRadius, 0.0001)')
        && 'fragment shader retains the legacy world-origin radius'
    ].filter((violation): violation is string => Boolean(violation));

    expect(violations).toEqual([]);
  });
});

// ─── Coronal-hole dimming, evaluated from the shader's own source ───────────────────────────────
// Audit finding solar-visuals-03 (2026-11-17 record): removing the 5x dimming left every test green,
// because nothing ran the hole branch (the tests above only check strings). There is no GL context
// here, so this runs the shader's own hole lookup: the GLSL between `float inHole = 0.0;` and the
// `alpha *= ...inHole` line is translated token-for-token into JavaScript and called with the real
// material's uniforms.
//
// AS SHIPPED, NOT AS INTENDED (audit finding solar-visuals-01): the lookup uses `sunNormal`, the
// body-frame normal of the shell point, and the shell is drawn BackSide, so the point it tests is on
// the FAR side of the Sun from the observer. These tests assert what the code does today (alpha is
// dimmed exactly where the shader's own lookup says a hole is). When the lookup moves to the
// plane-of-sky point, update the sample points below to that point.

type Vec3 = { x: number; y: number; z: number };

const glslClamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
const glslMix = (a: number, b: number, t: number) => a * (1 - t) + b * t;

/** Returns the factor the shader multiplies the corona alpha by at a surface normal, for the given hole uniforms. */
function shaderHoleDimming(material: ShaderMaterial): (sunNormal: Vec3) => number {
  const source = material.fragmentShader;
  const block = /float inHole = 0\.0;[\s\S]*?alpha \*= [^;]*inHole[^;]*;/.exec(source);
  if (!block) throw new Error('corona shader has no coronal-hole dimming of alpha');
  const js = block[0]
    .replace(/\/\/.*$/gm, '')
    .replace(/\bfloat\(/g, 'Number(')
    .replace(/\b(?:float|int|vec[234])\s+(?=[A-Za-z_]\w*\s*=)/g, 'let ');
  const run = new Function(
    'sunNormal', 'coronalHoles', 'coronalHoleCount', 'proceduralHoleWeight', 'coronalHoleActivity', 'normalDir', 'time',
    'abs', 'min', 'max', 'clamp', 'asin', 'atan', 'smoothstep', 'mix', 'fbm', 'vec3',
    `let alpha = 1.0; ${js}; return alpha;`
  );
  return (sunNormal) => run(
    sunNormal, material.uniforms.coronalHoles.value as Vector4[], material.uniforms.coronalHoleCount.value, 0,
    material.uniforms.coronalHoleActivity.value, sunNormal, 0,
    Math.abs, Math.min, Math.max, glslClamp, Math.asin, Math.atan2, smoothstep, glslMix,
    () => { throw new Error('procedural hole branch must stay off in this test'); }, () => { throw new Error('unused'); }
  ) as number;
}

/** The surface normal the shader would decode as (lon, lat): lon = atan(n.z, n.x), lat = asin(n.y). */
const normalAt = (lonRad: number, latRad: number): Vec3 =>
  ({ x: Math.cos(latRad) * Math.cos(lonRad), y: Math.sin(latRad), z: Math.cos(latRad) * Math.sin(lonRad) });

describe('corona shader coronal-hole dimming (as shipped: looked up at the BackSide shell normal, solar-visuals-01)', () => {
  const geometry = new SphereGeometry(1, 8, 4);
  const shell = createSunCoronaShell(geometry);
  const material = shell.material;
  const HOLE = { lon: 1.0, lat: 0.4, extentLon: 0.3, extentLat: 0.2 };
  function setHoles(...holes: Array<typeof HOLE>) {
    const uniforms = material.uniforms.coronalHoles.value as Vector4[];
    holes.forEach((h, i) => uniforms[i].set(h.lon, h.lat, h.extentLon, h.extentLat));
    material.uniforms.coronalHoleCount.value = holes.length;
  }
  const dimming = shaderHoleDimming(material);
  afterAll(() => { geometry.dispose(); material.dispose(); });

  it('dims the corona by the documented ~5x ("emission measure drops ~5x in coronal holes") at the hole centre', () => {
    setHoles(HOLE);
    const factor = dimming(normalAt(HOLE.lon, HOLE.lat));
    expect(factor).toBeGreaterThan(1 / 10);
    expect(factor).toBeLessThan(1 / 3);
  });

  it('leaves the corona untouched wherever the lookup says there is no hole', () => {
    setHoles(HOLE);
    for (const [lon, lat] of [
      [HOLE.lon + 2 * HOLE.extentLon, HOLE.lat], [HOLE.lon, HOLE.lat + 2 * HOLE.extentLat],
      [HOLE.lon, -HOLE.lat], [HOLE.lon + Math.PI, HOLE.lat], [-HOLE.lon, HOLE.lat]
    ]) expect(dimming(normalAt(lon, lat))).toBe(1);
  });

  it('fades smoothly from the hole centre to its edge instead of switching', () => {
    setHoles(HOLE);
    const factors = [0, 0.4, 0.7, 0.85, 0.95, 0.999].map(f => dimming(normalAt(HOLE.lon + f * HOLE.extentLon, HOLE.lat)));
    for (let i = 1; i < factors.length; i += 1) expect(factors[i]).toBeGreaterThanOrEqual(factors[i - 1]);
    expect(factors[0]).toBeLessThan(factors[2]);
    expect(factors[factors.length - 1]).toBeGreaterThan(0.99);
  });

  it('dims across the longitude seam and reads only as many holes as the count says', () => {
    const wrapped = { lon: Math.PI - 0.05, lat: -0.3, extentLon: 0.3, extentLat: 0.2 };
    setHoles(HOLE, wrapped);
    expect(dimming(normalAt(-Math.PI + 0.05, -0.3))).toBeLessThan(1 / 3); // 0.1 rad from the centre, across +-pi
    expect(dimming(normalAt(HOLE.lon, HOLE.lat))).toBeLessThan(1 / 3);
    setHoles(HOLE);
    expect(dimming(normalAt(-Math.PI + 0.05, -0.3))).toBe(1); // a hole beyond the count is not read
  });
});
