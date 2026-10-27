import {
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Vector4,
  type WebGLRenderer,
} from 'three';
import { describe, expect, it } from 'vitest';
import { createChromosphereLayer } from './sunVisuals';

const TYPE_I_WIDTH_TO_SOLAR_RADIUS = 660 / 696_340;

function projectedPointSizePx({
  renderedSunRadius,
  viewDepth,
  viewportHeight,
  camera,
}: {
  renderedSunRadius: number;
  viewDepth: number;
  viewportHeight: number;
  camera: PerspectiveCamera;
}): number {
  const worldWidth = renderedSunRadius * TYPE_I_WIDTH_TO_SOLAR_RADIUS;
  const projectionScaleY = camera.projectionMatrix.elements[5];
  const rawSize = worldWidth * projectionScaleY * viewportHeight * 0.5 / viewDepth;
  return Math.max(0.5, Math.min(6, rawSize));
}

describe('chromosphere perspective point size (B063)', () => {
  it('attenuates a physical spicule width using projection and view-space depth', () => {
    const camera = new PerspectiveCamera(58, 1, 0.0001, 20_000);
    camera.updateProjectionMatrix();

    const common = {
      renderedSunRadius: 0.2455,
      viewportHeight: 900,
      camera,
    };
    const near = projectedPointSizePx({ ...common, viewDepth: 0.1 });
    const far = projectedPointSizePx({ ...common, viewDepth: 0.2 });
    expect(near).toBeCloseTo(1.8890, 3);
    expect(far).toBeCloseTo(0.9445, 3);
    expect(near / far).toBeCloseTo(2, 12);

    const tallerViewport = projectedPointSizePx({
      ...common,
      viewDepth: 0.2,
      viewportHeight: 1_800,
    });
    expect(tallerViewport / far).toBeCloseTo(2, 12);

    const narrowFovCamera = new PerspectiveCamera(40, 1, 0.0001, 20_000);
    narrowFovCamera.updateProjectionMatrix();
    const narrowFov = projectedPointSizePx({
      ...common,
      viewDepth: 0.2,
      camera: narrowFovCamera,
    });
    expect(narrowFov / far).toBeCloseTo(
      narrowFovCamera.projectionMatrix.elements[5] / camera.projectionMatrix.elements[5],
      12,
    );

    expect(projectedPointSizePx({ ...common, viewDepth: 0.001 })).toBe(6);
    expect(projectedPointSizePx({ ...common, viewDepth: 100 })).toBe(0.5);
  });

  it('binds the production shader to that projection contract', () => {
    const chromosphere = createChromosphereLayer(0.2455, 1);
    const material = chromosphere.material as ShaderMaterial;
    try {
      const shader = material.vertexShader;
      const assignments = shader.match(/gl_PointSize\s*=\s*[^;]+;/g) ?? [];
      expect(assignments).toHaveLength(1);
      expect(shader).toContain('uniform float viewportHeight;');
      expect(shader).toContain(
        'vec4 viewPosition = modelViewMatrix * vec4(spiculePos, 1.0);',
      );
      expect(shader).toContain('gl_Position = projectionMatrix * viewPosition;');
      expect(shader).toMatch(
        /float objectWidth\s*=\s*sunRadius\s*\*\s*\(\s*isTypeII\s*\?\s*\(200\.0 \/ 696340\.0\)\s*:\s*\(660\.0 \/ 696340\.0\)\s*\);/,
      );
      expect(shader).toMatch(
        /float viewWidth\s*=\s*length\(\(modelViewMatrix \* vec4\(aAxis \* objectWidth, 0\.0\)\)\.xyz\);/,
      );
      expect(shader).toMatch(
        /float projectedSize\s*=\s*viewWidth\s*\*\s*projectionMatrix\[1\]\[1\]\s*\*\s*viewportHeight\s*\*\s*0\.5\s*\/\s*max\(-viewPosition\.z,\s*0\.000001\);/,
      );
      expect(assignments[0]!.replace(/\s+/g, ' ').trim()).toBe(
        'gl_PointSize = clamp(projectedSize, 0.5, 6.0);',
      );
      expect(shader).not.toContain('300.0');
      expect(shader).not.toContain('cameraPosition');
      expect(shader).not.toMatch(/float dist\s*=/);
    } finally {
      chromosphere.geometry.dispose();
      material.dispose();
    }
  });

  it('refreshes the active physical viewport height before every draw', () => {
    const chromosphere = createChromosphereLayer(0.2455, 1);
    const material = chromosphere.material as ShaderMaterial;
    const viewport = new Vector4(0, 0, 1_600, 900);
    const renderer = {
      getCurrentViewport(target: Vector4) {
        return target.copy(viewport);
      },
    } as unknown as WebGLRenderer;
    const scene = new Scene();
    const camera = new PerspectiveCamera();

    try {
      chromosphere.onBeforeRender(
        renderer,
        scene,
        camera,
        chromosphere.geometry,
        material,
        null!,
      );
      expect(material.uniforms.viewportHeight.value).toBe(900);

      viewport.w = 1_800;
      chromosphere.onBeforeRender(
        renderer,
        scene,
        camera,
        chromosphere.geometry,
        material,
        null!,
      );
      expect(material.uniforms.viewportHeight.value).toBe(1_800);
    } finally {
      chromosphere.geometry.dispose();
      material.dispose();
    }
  });
});
