import { describe, expect, it } from 'vitest';
import { MeshStandardMaterial, ShaderLib, Vector3, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { NAMED_ASTEROIDS } from '../../../sim/asteroidBelt';
import { createAsteroidBeltRenderer } from './beltRenderer';

function sample(meanRadians = 0) {
  return createAsteroidBeltRenderer([{
    ...NAMED_ASTEROIDS[0],
    orbit: { ...NAMED_ASTEROIDS[0].orbit, epochJd: 2461320, e: 0.999999,
      meanAnomalyDeg: meanRadians * 180 / Math.PI },
  }]);
}

describe('declared two-body asteroid model and representable periapsis phase', () => {
  it.each([1e-20, -1e-20, 1e-12, -1e-12])('retains signed float32 phase %s at the window epoch', mean => {
    const renderer = sample(mean);
    try {
      renderer.setJulianDate(2461320);
      const packed = renderer.mesh.geometry.getAttribute('aOrbitParams2').getY(0);
      expect(packed).toBe(Math.fround(mean));
      expect(packed).not.toBe(0);
    } finally {
      renderer.dispose();
    }
  });

  it('keeps legacy planet setters inert under the declared two-body model', () => {
    const renderer = sample();
    try {
      const shader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: '', uniforms: {} };
      (renderer.mesh.material as MeshStandardMaterial).onBeforeCompile(
        shader as WebGLProgramParametersWithUniforms, {} as WebGLRenderer,
      );
      const uniforms = shader.uniforms as Record<string, { value: number | Vector3 }>;
      const snapshot = () => Object.fromEntries(Object.entries(uniforms).map(([key, uniform]) => [
        key, uniform.value instanceof Vector3 ? uniform.value.toArray() : uniform.value,
      ]));
      const before = snapshot();
      renderer.setPerturberMasses(2.825e-7, 8.459e-8);
      renderer.setPerturberPositions(new Vector3(5.2, 0, 0), new Vector3(9.5, 0, 0));
      expect(snapshot()).toEqual(before);
      renderer.setPerturberPositions(new Vector3(1e300, 0, 0), new Vector3(Number.NaN, 0, 0));
      expect(snapshot()).toEqual(before);
      renderer.setJulianDate(2461320.125);
      expect(uniforms.uElapsedDays.value).toBe(0.125);
    } finally {
      renderer.dispose();
    }
  });
});
