import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, type BufferAttribute, type DataTexture, type Points, type PointsMaterial } from 'three';
import { createSolarWindLayer, updateSolarWindLayer } from './sunVisuals';
import { SOLAR_RADIUS_AU } from './solarDisplayScale';
import { AU_KM } from '../../../constants';

const OMEGA_RAD_DAY = (2 * Math.PI) / 25.38;
const SOURCE_RADII = 2.5;
const SOURCE_AU = SOURCE_RADII * SOLAR_RADIUS_AU;

// Backend-shaped heliosphere: each arm starts on the source surface at its longitude.
function spiral(...arms: Array<{ lonDeg: number; kms: number }>) {
  return { heliosphere: { parker_spiral: {
    source_surface_radii: SOURCE_RADII,
    omega_sun_rad_day: OMEGA_RAD_DAY,
    lines: arms.map(({ lonDeg, kms }, index) => {
      const lon = (lonDeg * Math.PI) / 180;
      return { id: `spiral-${index}`, polarity: 1, wind_speed_kms: kms, arc: [
        [SOURCE_RADII * Math.cos(lon), SOURCE_RADII * Math.sin(lon), 0],
        [600 * Math.cos(lon), 600 * Math.sin(lon), 0],
      ] };
    }),
  } } };
}

function cameraAt(distanceAu: number) {
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0, distanceAu);
  return camera;
}

function withLayer(run: (layer: Points) => void) {
  const layer = createSolarWindLayer();
  try {
    run(layer);
  } finally {
    const material = layer.material as PointsMaterial;
    layer.geometry.dispose();
    material.alphaMap?.dispose();
    material.dispose();
  }
}

function position(layer: Points, index: number) {
  const attr = layer.geometry.getAttribute('position') as BufferAttribute;
  return [attr.getX(index), attr.getY(index), attr.getZ(index)];
}
const radius = (layer: Points, index: number) => Math.hypot(...position(layer, index));
function brightness(layer: Points, index: number) {
  const attr = layer.geometry.getAttribute('color') as BufferAttribute;
  return Math.max(attr.getX(index), attr.getY(index), attr.getZ(index));
}

// Pin a particle's random draws; its path progress at time t is (t * rate + phase) mod 1.
function pin(layer: Points, index: number, { phase = 0.5, lonOffset = 0, sinLat = 0 } = {}) {
  const wind = layer.userData.solarWind;
  wind.phases[index] = phase;
  wind.lonOffsets[index] = lonOffset;
  wind.sinLats[index] = sinLat;
}

describe('solar wind outflow', () => {
  it('stays hidden without backend spiral data', () => {
    withLayer(layer => {
      updateSolarWindLayer(layer, null, SOLAR_RADIUS_AU, 0, cameraAt(0.05));
      expect(layer.visible).toBe(false);
      updateSolarWindLayer(layer, { heliosphere: { parker_spiral: { lines: [] } } }, SOLAR_RADIUS_AU, 0, cameraAt(0.05));
      expect(layer.visible).toBe(false);
    });
  });

  it('flows outward from the source surface over time', () => {
    withLayer(layer => {
      pin(layer, 0, { phase: 0.3 });
      updateSolarWindLayer(layer, spiral({ lonDeg: 0, kms: 400 }), SOLAR_RADIUS_AU, 0, cameraAt(0.05));
      expect(layer.visible).toBe(true);
      const before = radius(layer, 0);
      expect(before).toBeGreaterThan(SOURCE_AU);
      updateSolarWindLayer(layer, spiral({ lonDeg: 0, kms: 400 }), SOLAR_RADIUS_AU, 1, cameraAt(0.05));
      expect(radius(layer, 0)).toBeGreaterThan(before);
    });
  });

  it('moves faster where the backend reports faster wind', () => {
    withLayer(layer => {
      // Particles are dealt to arms in turn: 0 rides the slow arm, 1 the fast one.
      pin(layer, 0, { phase: 0.2 });
      pin(layer, 1, { phase: 0.2 });
      const state = spiral({ lonDeg: 0, kms: 350 }, { lonDeg: 180, kms: 700 });
      updateSolarWindLayer(layer, state, SOLAR_RADIUS_AU, 0, cameraAt(0.05));
      const [slow, fast] = [radius(layer, 0), radius(layer, 1)];
      updateSolarWindLayer(layer, state, SOLAR_RADIUS_AU, 1, cameraAt(0.05));
      expect((radius(layer, 1) - fast) / (radius(layer, 0) - slow)).toBeCloseTo(2, 4);
    });
  });

  it('lags behind its source longitude like a Parker spiral', () => {
    withLayer(layer => {
      pin(layer, 0, { phase: 0.9 });
      updateSolarWindLayer(layer, spiral({ lonDeg: 30, kms: 400 }), SOLAR_RADIUS_AU, 0, cameraAt(1));
      const [x, y] = position(layer, 0);
      const lag = (OMEGA_RAD_DAY / ((400 * 86_400) / AU_KM)) * (radius(layer, 0) - SOURCE_AU);
      expect(lag).toBeGreaterThan(1);
      expect(Math.cos(Math.atan2(y, x) - ((30 * Math.PI) / 180 - lag))).toBeCloseTo(1, 6);
    });
  });

  it.each([0.05, 1])('fills about three camera distances (camera at %s AU)', distanceAu => {
    withLayer(layer => {
      updateSolarWindLayer(layer, spiral({ lonDeg: 0, kms: 400 }), SOLAR_RADIUS_AU, 0, cameraAt(distanceAu));
      const radii = Array.from({ length: layer.userData.solarWind.count }, (_, i) => radius(layer, i));
      expect(Math.max(...radii)).toBeLessThanOrEqual(3 * distanceAu + 1e-9);
      expect(Math.max(...radii)).toBeGreaterThan(2 * distanceAu);
    });
  });

  it('starts outside an enlarged display Sun', () => {
    withLayer(layer => {
      const enlarged = 40 * SOLAR_RADIUS_AU;
      updateSolarWindLayer(layer, spiral({ lonDeg: 0, kms: 400 }), enlarged, 0, cameraAt(1));
      const radii = Array.from({ length: layer.userData.solarWind.count }, (_, i) => radius(layer, i));
      expect(Math.min(...radii)).toBeGreaterThanOrEqual(enlarged * 1.05 * (1 - 1e-6));
    });
  });

  it.each([
    { label: 'at the source', phase: 0, visible: false },
    { label: 'mid-flight', phase: 0.5, visible: true },
    { label: 'at the far edge', phase: 0.999, visible: false },
  ])('fades a particle $label', ({ phase, visible }) => {
    withLayer(layer => {
      pin(layer, 0, { phase });
      updateSolarWindLayer(layer, spiral({ lonDeg: 0, kms: 400 }), SOLAR_RADIUS_AU, 0, cameraAt(0.05));
      expect(brightness(layer, 0) > 0.05).toBe(visible);
    });
  });

  it('tints fast wind cooler than slow wind', () => {
    withLayer(layer => {
      pin(layer, 0);
      pin(layer, 1);
      updateSolarWindLayer(layer, spiral({ lonDeg: 0, kms: 350 }, { lonDeg: 180, kms: 800 }), SOLAR_RADIUS_AU, 0, cameraAt(0.05));
      const color = layer.geometry.getAttribute('color') as BufferAttribute;
      const warmth = (index: number) => color.getX(index) / color.getZ(index);
      expect(warmth(0)).toBeGreaterThan(warmth(1) * 1.2);
    });
  });

  it('draws soft discs, not squares', () => {
    withLayer(layer => {
      const mask = (layer.material as PointsMaterial).alphaMap as DataTexture | null;
      const data = mask?.image?.data;
      expect(data).toBeInstanceOf(Uint8Array);
      const { width, height } = mask!.image;
      expect(data![1]).toBe(0); // corner texel, green channel
      expect(data![((height / 2) * width + width / 2) * 4 + 1]).toBeGreaterThan(240);
    });
  });
});
