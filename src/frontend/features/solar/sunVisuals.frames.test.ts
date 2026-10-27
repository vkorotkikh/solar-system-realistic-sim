import {
  Matrix3,
  Matrix4,
  Mesh,
  Object3D,
  PerspectiveCamera,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  Vector3,
} from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChromosphereLayer, createSunSurfaceMaterial } from './sunVisuals';

afterEach(() => vi.restoreAllMocks());

function transformedDiskCenter(
  object: Object3D,
  localPoint: Vector3,
  localAxis: Vector3,
) {
  object.position.set(3, -2, 5);
  object.rotation.y = Math.acos(0.07);
  object.scale.setScalar(2.3);
  object.updateMatrixWorld(true);

  const worldAxis = localAxis.clone().applyNormalMatrix(new Matrix3().getNormalMatrix(object.matrixWorld));
  const worldPoint = localPoint.clone().applyMatrix4(object.matrixWorld);
  const camera = new PerspectiveCamera();
  camera.position.copy(worldPoint).addScaledVector(worldAxis, 7);
  camera.lookAt(worldPoint);
  camera.updateMatrixWorld(true);

  const modelViewMatrix = new Matrix4().multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
  const viewAxis = localAxis.clone().applyNormalMatrix(new Matrix3().getNormalMatrix(modelViewMatrix));
  const viewPoint = localPoint.clone().applyMatrix4(modelViewMatrix);
  const viewDirection = viewPoint.clone().negate().normalize();
  const worldDirection = camera.position.clone().sub(worldPoint).normalize();
  return {
    sameSpaceMu: viewAxis.dot(viewDirection),
    mixedSpaceMu: localAxis.dot(worldDirection),
  };
}

describe('solar limb coordinate frames (B032)', () => {
  it('binds per-fragment Wilson mu to view-space surface operands', () => {
    const texture = new Texture();
    const material = createSunSurfaceMaterial(texture)!;
    const geometry = new SphereGeometry(1, 8, 4);
    const surface = new Mesh(geometry, material);
    try {
      const { sameSpaceMu, mixedSpaceMu } = transformedDiskCenter(
        surface,
        new Vector3(1, 0, 0),
        new Vector3(1, 0, 0),
      );
      expect(sameSpaceMu).toBeCloseTo(1, 12);
      expect(mixedSpaceMu).toBeCloseTo(0.07, 12);
      expect(0.65 + 0.35 * sameSpaceMu).toBeCloseTo(1, 12);
      expect(0.65 + 0.35 * mixedSpaceMu).toBeCloseTo(0.6745, 12);

      const violations = [
        (!material.vertexShader.includes('varying vec3 vViewNormal;')
          || !material.fragmentShader.includes('varying vec3 vViewNormal;'))
          && 'surface view normal varying is not declared in both shader stages',
        (!material.vertexShader.includes('varying vec3 vViewPosition;')
          || !material.fragmentShader.includes('varying vec3 vViewPosition;'))
          && 'surface view position varying is not declared in both shader stages',
        !material.vertexShader.includes('vViewNormal = normalize(normalMatrix * normal);')
          && 'surface vertex shader does not transform its normal to view space',
        !material.vertexShader.includes('vViewPosition = viewPosition.xyz;')
          && 'surface vertex shader does not expose its view-space position',
        !material.fragmentShader.includes('vec3 viewDir = normalize(-vViewPosition);')
          && 'surface fragment shader does not derive the camera direction in view space',
        !material.fragmentShader.includes('float mu = max(0.0, dot(viewNormal, viewDir));')
          && 'surface fragment shader does not dot two view-space directions',
        !material.fragmentShader.includes('float wilsonFactor = 0.65 + 0.35 * mu;')
          && 'Wilson depression does not consume the per-fragment mu',
        material.fragmentShader.includes('dot(spotDir, normalize(cameraPosition - vWorldPosition))')
          && 'Wilson depression retains the object/world mixed-space dot product',
      ].filter((violation): violation is string => Boolean(violation));
      expect(violations).toEqual([]);
    } finally {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    }
  });

  it('binds spicule limb fade to a view-space axis and Sun-center direction', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0)
      .mockReturnValue(0.5);
    const chromosphere = createChromosphereLayer(1, 1);
    const material = chromosphere.material as ShaderMaterial;
    try {
      const axisAttribute = chromosphere.geometry.getAttribute('aAxis');
      const localAxis = new Vector3().fromBufferAttribute(axisAttribute, 0);
      expect(localAxis.toArray()).toEqual([1, 0, 0]);
      const { sameSpaceMu, mixedSpaceMu } = transformedDiskCenter(
        chromosphere,
        new Vector3(0, 0, 0),
        localAxis,
      );
      expect(sameSpaceMu).toBeCloseTo(1, 12);
      expect(mixedSpaceMu).toBeCloseTo(0.07, 12);
      expect(1 - sameSpaceMu * 0.65).toBeCloseTo(0.35, 12);
      expect(1 - mixedSpaceMu * 0.65).toBeCloseTo(0.9545, 12);

      const violations = [
        !material.vertexShader.includes('vec3 viewAxis = normalize(normalMatrix * aAxis);')
          && 'spicule axis is not transformed and normalized in view space',
        !material.vertexShader.includes('vec3 viewCenter = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;')
          && 'Sun center is not transformed to view space',
        !material.vertexShader.includes('vec3 viewDir = normalize(-viewCenter);')
          && 'spicule camera direction is not computed from the view-space center',
        !material.vertexShader.includes('float ndotv = abs(dot(viewAxis, viewDir));')
          && 'spicule limb fade does not dot two view-space directions',
        material.vertexShader.includes('cameraPosition - vec3(modelMatrix[3])')
          && 'spicule limb fade retains the object/world mixed-space operands',
      ].filter((violation): violation is string => Boolean(violation));
      expect(violations).toEqual([]);
    } finally {
      chromosphere.geometry.dispose();
      material.dispose();
    }
  });
});
