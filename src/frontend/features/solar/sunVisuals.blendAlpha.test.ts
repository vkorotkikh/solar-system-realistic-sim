import { describe, expect, it } from 'vitest';
import { BufferAttribute, Group, Mesh, Vector3 } from 'three';
import { buildSolarFeatureBlendView, normalizeSolarFeatureSetFromState } from './solarFeatureBlending';
import { createSunEruptionLayer, setSunEruptionBaseRadius, updateSunCoronalLoopsFromBlendView, updateSunEruptionLayerFromBlendView } from './sunVisuals';
import { SOLAR_RADIUS_AU } from './solarDisplayScale';

const sourceArc = [[1, 0, 0], [0, 0, 1]];
const targetArc = [[0, 1, 0], [0, 0, -1]];

function blendAtStart() {
  const current = normalizeSolarFeatureSetFromState({ corona: { features: [
    { id: 'endpoint-probe', arc: sourceArc, brightness: 0.5 }
  ] } }, 2451552);
  const target = normalizeSolarFeatureSetFromState({ corona: { features: [
    { id: 'endpoint-probe', arc: targetArc, brightness: 0.5 }
  ] } }, 2451552);
  return buildSolarFeatureBlendView({ currentFeatureSet: current, targetFeatureSet: target,
    blendStartMs: 0, blendDurationMs: 1000, nowMs: 0 });
}

describe('actual coronal-loop geometry blend endpoints', () => {
  it.each([
    { label: 'zero from the real blender', alpha: 0, expected: sourceArc },
    { label: 'completed blend', alpha: 1, expected: targetArc },
    { label: 'finite negative alpha clamps to source', alpha: -1, expected: sourceArc },
    { label: 'finite alpha above one clamps to target', alpha: 2, expected: targetArc },
    { label: 'NaN falls back to target', alpha: NaN, expected: targetArc },
    { label: 'positive infinity falls back to target', alpha: Infinity, expected: targetArc },
    { label: 'negative infinity falls back to target', alpha: -Infinity, expected: targetArc }
  ])('$label', ({ alpha, expected }) => {
    const blend = blendAtStart();
    expect(blend.blendAlpha).toBe(0);
    if (alpha !== 0) blend.blendAlpha = alpha;
    const group = new Group();
    updateSunCoronalLoopsFromBlendView(group, blend, SOLAR_RADIUS_AU);
    expect(group.children).toHaveLength(1);
    const line = group.children[0] as Mesh;
    try {
      const position = line.geometry.getAttribute('position');
      expect(position.count).toBe(2);
      const actual = new Vector3().fromBufferAttribute(position, 0);
      const endpoint = new Vector3(...expected[0] as [number, number, number]).multiplyScalar(SOLAR_RADIUS_AU);
      // Preserve the original first-endpoint probe and its position budget.
      // The unrelated arc sampler intentionally caps the final phase at 0.999999.
      expect(actual.distanceTo(endpoint)).toBeLessThan(1e-9);
    } finally {
      line.geometry.dispose();
      for (const material of Array.isArray(line.material) ? line.material : [line.material]) material.dispose();
    }
  });

  it('keeps a mid-blend loop on or above the photosphere', () => {
    const current = normalizeSolarFeatureSetFromState({ corona: { features: [
      {
        id: 'rotating-loop',
        arc: [[1, 0, 0], [1, 0, 0]],
        brightness: 0.5,
      },
    ] } }, 2451552)!;
    const target = normalizeSolarFeatureSetFromState({ corona: { features: [
      {
        id: 'rotating-loop',
        arc: [[-0.5, Math.sqrt(3) / 2, 0], [-0.5, Math.sqrt(3) / 2, 0]],
        brightness: 0.5,
      },
    ] } }, 2451672)!;
    const blend = buildSolarFeatureBlendView({
      currentFeatureSet: current,
      targetFeatureSet: target,
      blendStartMs: 0,
      blendDurationMs: 1_000,
      nowMs: 500,
    });
    expect(blend.blendAlpha).toBe(0.5);

    const group = new Group();
    updateSunCoronalLoopsFromBlendView(group, blend, SOLAR_RADIUS_AU);
    const line = group.children[0] as Mesh;
    try {
      const position = line.geometry.getAttribute('position');
      const midpoint = new Vector3().fromBufferAttribute(position, 0);
      // BufferGeometry stores Float32 positions, so compare within one upload ULP.
      expect(midpoint.length()).toBeCloseTo(SOLAR_RADIUS_AU, 9);
      expect(Math.atan2(midpoint.y, midpoint.x)).toBeCloseTo(Math.PI / 3, 6);
    } finally {
      line.geometry.dispose();
      for (const material of Array.isArray(line.material) ? line.material : [line.material]) material.dispose();
    }
  });
});

describe('actual eruption-particle geometry blend endpoints', () => {
  it.each(['scale', 'blend'] as const)('keeps cached culling bounds around the moved particles: %s', mode => {
    const particles = createSunEruptionLayer(SOLAR_RADIUS_AU);
    try {
      particles.geometry.computeBoundingSphere();
      const initial = particles.geometry.boundingSphere!.clone();
      if (mode === 'scale') setSunEruptionBaseRadius(particles, 3 * SOLAR_RADIUS_AU);
      else {
        const features = normalizeSolarFeatureSetFromState({ corona: { features: [
          { id: 'extended-eruption', arc: [[3, 0, 0], [0, 0, 3]], brightness: 0.5 }
        ] } }, 2451552);
        const blend = buildSolarFeatureBlendView({ currentFeatureSet: features, targetFeatureSet: features,
          blendStartMs: 0, blendDurationMs: 1000, nowMs: 0 });
        updateSunEruptionLayerFromBlendView({ sunEruptionLayer: particles, blendView: blend,
          sunRadiusAu: SOLAR_RADIUS_AU, timeSec: 0, activity: 0.5 });
      }
      const position = particles.geometry.getAttribute('position');
      expect(initial.containsPoint(new Vector3().fromBufferAttribute(position, 0))).toBe(false);
      for (let index = 0; index < position.count; index += 1) {
        // Re-squaring a rounded radius in Sphere.containsPoint can put its own
        // extremal vertex outside by one ULP. Compare distances directly.
        const bounds = particles.geometry.boundingSphere!;
        expect(new Vector3().fromBufferAttribute(position, index).distanceTo(bounds.center))
          .toBeLessThanOrEqual(bounds.radius);
      }
    } finally {
      particles.geometry.dispose();
      for (const material of Array.isArray(particles.material) ? particles.material : [particles.material]) material.dispose();
    }
  });

  it.each([
    { label: 'zero from the real blender', alpha: 0, direction: [1, 0, 0] },
    { label: 'completed blend', alpha: 1, direction: [0, 1, 0] },
    { label: 'finite negative alpha clamps to source', alpha: -1, direction: [1, 0, 0] },
    { label: 'finite alpha above one clamps to target', alpha: 2, direction: [0, 1, 0] },
    { label: 'NaN falls back to target', alpha: NaN, direction: [0, 1, 0] },
    { label: 'positive infinity falls back to target', alpha: Infinity, direction: [0, 1, 0] },
    { label: 'negative infinity falls back to target', alpha: -Infinity, direction: [0, 1, 0] },
    { label: 'mid-blend follows the spherical arc', alpha: 0.5, direction: [Math.SQRT1_2, Math.SQRT1_2, 0] },
  ])('$label', ({ alpha, direction }) => {
    const blend = blendAtStart();
    expect(blend.blendAlpha).toBe(0);
    blend.blendAlpha = alpha;
    const particles = createSunEruptionLayer(SOLAR_RADIUS_AU);
    // Pin the sampled particle to the first point without replacing the real
    // geometry or production sampler. Particles normally have different phases.
    particles.userData.sunBursts.phases.fill(0);
    particles.userData.sunBursts.burstCount = 1;
    const position = particles.geometry.getAttribute('position') as BufferAttribute;
    const previousVersion = position.version;
    try {
      updateSunEruptionLayerFromBlendView({
        sunEruptionLayer: particles,
        blendView: blend,
        sunRadiusAu: SOLAR_RADIUS_AU,
        timeSec: 0,
        activity: 0.5,
      });
      expect(position.version).toBe(previousVersion + 1);
      const actual = new Vector3().fromBufferAttribute(position, 0);
      const expected = new Vector3(...direction as [number, number, number])
        .multiplyScalar(SOLAR_RADIUS_AU * (1 + 0.5 * 0.065));
      // Keep the loop endpoint budget unchanged; this independent particle
      // budget includes its documented radial brightness boost and Float32 upload.
      expect(actual.distanceTo(expected)).toBeLessThan(1e-9);
    } finally {
      particles.geometry.dispose();
      for (const material of Array.isArray(particles.material) ? particles.material : [particles.material]) material.dispose();
    }
  });
});
