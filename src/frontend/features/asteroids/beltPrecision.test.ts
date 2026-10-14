import { describe, expect, it } from 'vitest';
import { MeshStandardMaterial, ShaderLib, type WebGLRenderer, type WebGLProgramParametersWithUniforms } from 'three';
import { createAsteroidBeltRenderer } from './beltRenderer';
import { NAMED_ASTEROIDS } from '../../../sim/asteroidBelt';

describe('SCN-013 relative GPU orbital time', () => {
  it.each([2415020.125, 2461320.125, 2488069.875])(
    'retains one-second motion at JD %s', (jd) => {
      const asteroid = NAMED_ASTEROIDS[0];
      const renderer = createAsteroidBeltRenderer([asteroid]);
      const shader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: '', uniforms: {} };
      (renderer.mesh.material as MeshStandardMaterial).onBeforeCompile(shader as WebGLProgramParametersWithUniforms, {} as WebGLRenderer);
      const uniforms = shader.uniforms as Record<string, { value: number }>;
      renderer.setJulianDate(jd);
      const first = Math.fround(uniforms.uElapsedDays.value);
      renderer.setJulianDate(jd + 1 / 86400);
      const second = Math.fround(uniforms.uElapsedDays.value);
      expect(second - first).toBeCloseTo(1 / 86400, 6);
      expect(Math.abs(second)).toBeLessThan(8);
      expect(shader.vertexShader).not.toContain('uJulianDate - epochJd');
      renderer.dispose();
    },
  );

  it('rebases orbital phase continuously when the time window changes or reverses', () => {
    const asteroid = NAMED_ASTEROIDS[0];
    if (asteroid.orbit.meanAnomalyDeg == null || asteroid.orbit.periodDays == null) {
      throw new Error('Named fixture must supply an anomaly and period');
    }
    const renderer = createAsteroidBeltRenderer([asteroid]);
    const shader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: '', uniforms: {} };
    (renderer.mesh.material as MeshStandardMaterial).onBeforeCompile(shader as WebGLProgramParametersWithUniforms, {} as WebGLRenderer);
    const uniforms = shader.uniforms as Record<string, { value: number }>;
    for (const jd of [2461327.999, 2461328.001, 2461327.999, 2451545.123]) {
      renderer.setJulianDate(jd);
      const orbit = renderer.mesh.geometry.getAttribute('aOrbitParams2');
      const phase = orbit.getY(0) + 2 * Math.PI / orbit.getZ(0) * uniforms.uElapsedDays.value;
      const expected = asteroid.orbit.meanAnomalyDeg * Math.PI / 180
        + 2 * Math.PI * (jd - asteroid.orbit.epochJd) / asteroid.orbit.periodDays;
      expect(Math.abs(Math.atan2(Math.sin(phase - expected), Math.cos(phase - expected))))
        .toBeLessThan(1e-6);
    }
    renderer.dispose();
  });
});
