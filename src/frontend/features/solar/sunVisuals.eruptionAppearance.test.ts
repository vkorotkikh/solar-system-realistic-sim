import { describe, expect, it } from 'vitest';
import type { BufferAttribute, DataTexture, Points, PointsMaterial } from 'three';
import { buildSolarFeatureBlendView, normalizeSolarFeatureSetFromState } from './solarFeatureBlending';
import { createSunEruptionLayer, setSunEruptionBaseRadius, updateSunEruptionLayerFromBlendView } from './sunVisuals';
import { SOLAR_RADIUS_AU } from './solarDisplayScale';

function withLayer(run: (layer: Points) => void) {
  const layer = createSunEruptionLayer(SOLAR_RADIUS_AU);
  try {
    run(layer);
  } finally {
    const material = layer.material as PointsMaterial;
    layer.geometry.dispose();
    material.alphaMap?.dispose();
    material.dispose();
  }
}

function singleFeatureBlend() {
  const features = normalizeSolarFeatureSetFromState({ corona: { features: [
    { id: 'plume', arc: [[1, 0, 0], [2, 0, 0]], brightness: 1 }
  ] } }, 2451552);
  return buildSolarFeatureBlendView({ currentFeatureSet: features, targetFeatureSet: features,
    blendStartMs: 0, blendDurationMs: 1000, nowMs: 0 });
}

function particleBrightness(layer: Points) {
  const color = layer.geometry.getAttribute('color') as BufferAttribute | undefined;
  expect(color).toBeDefined();
  return color!.getX(0);
}

describe('eruption particle appearance', () => {
  it('draws each particle as a soft disc, not a square', () => {
    withLayer(layer => {
      const mask = (layer.material as PointsMaterial).alphaMap as DataTexture | null;
      const data = mask?.image?.data;
      expect(data).toBeInstanceOf(Uint8Array);
      const { width, height } = mask!.image;
      // PointsMaterial multiplies fragment alpha by the alpha map's green channel.
      const green = (x: number, y: number) => data![(y * width + x) * 4 + 1];
      for (const [x, y] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]]) {
        expect(green(x, y)).toBe(0);
      }
      const row = Array.from({ length: width / 2 }, (_, i) => green(width / 2 + i, height / 2));
      expect(row[0]).toBeGreaterThan(240);
      for (let i = 1; i < row.length; i += 1) expect(row[i]).toBeLessThanOrEqual(row[i - 1]);
      expect(mask!.version).toBeGreaterThan(0); // queued for upload; otherwise every particle samples zero
    });
  });

  it('keeps particles small next to the Sun', () => {
    withLayer(layer => {
      const material = layer.material as PointsMaterial;
      setSunEruptionBaseRadius(layer, SOLAR_RADIUS_AU);
      expect(material.size).toBeLessThanOrEqual(0.12 * SOLAR_RADIUS_AU);
      updateSunEruptionLayerFromBlendView({ sunEruptionLayer: layer, blendView: null,
        sunRadiusAu: SOLAR_RADIUS_AU, timeSec: 0, activity: 1 });
      expect(material.size).toBeLessThanOrEqual(0.12 * SOLAR_RADIUS_AU);
    });
  });

  it('gives every admitted feature a stream of particles rather than a lone marker', () => {
    // buildSolarFeatureBlendView admits at most 220 features by default.
    withLayer(layer => expect(layer.userData.sunBursts.burstCount).toBeGreaterThanOrEqual(8 * 220));
  });

  // Feature phase at t = 0 is (index * 0.013 + phases[index] * 0.17) mod 1.
  it.each([
    { label: 'restarting its path', phase: 0, visible: false },
    { label: 'mid-path', phase: 0.5, visible: true },
  ])('fades a feature particle $label', ({ phase, visible }) => {
    withLayer(layer => {
      layer.userData.sunBursts.burstCount = 1;
      layer.userData.sunBursts.phases[0] = phase / 0.17;
      updateSunEruptionLayerFromBlendView({ sunEruptionLayer: layer, blendView: singleFeatureBlend(),
        sunRadiusAu: SOLAR_RADIUS_AU, timeSec: 0, activity: 0.5 });
      expect(particleBrightness(layer) > 0.05).toBe(visible);
    });
  });

  // Fallback plume height at t = 0 follows sin(phases[index]).
  it.each([
    { label: 'resting on the surface', phase: -Math.PI / 2, visible: false },
    { label: 'rising in a plume', phase: Math.PI / 2, visible: true },
  ])('fades a fallback particle $label', ({ phase, visible }) => {
    withLayer(layer => {
      layer.userData.sunBursts.burstCount = 1;
      layer.userData.sunBursts.phases[0] = phase;
      updateSunEruptionLayerFromBlendView({ sunEruptionLayer: layer, blendView: null,
        sunRadiusAu: SOLAR_RADIUS_AU, timeSec: 0, activity: 0.5 });
      expect(particleBrightness(layer) > 0.05).toBe(visible);
    });
  });
});
