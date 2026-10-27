import { describe, expect, it } from 'vitest';
import { Matrix4, SphereGeometry, Vector3 } from 'three';
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
