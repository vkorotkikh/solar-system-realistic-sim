import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, type BufferAttribute, type DataTexture, type Points, type PointsMaterial } from 'three';
import { createSolarWindLayer, updateSolarWindLayer } from './sunVisuals';
import { SOLAR_RADIUS_AU } from './solarDisplayScale';
import { AU_KM } from '../../../constants';

const OMEGA_RAD_DAY = (2 * Math.PI) / 25.38;
const SOURCE_RADII = 2.5;
const SOURCE_AU = SOURCE_RADII * SOLAR_RADIUS_AU;
const DEG = Math.PI / 180;

// Backend-shaped heliosphere: each arm starts on the source surface at its longitude.
function spiral(...arms: Array<{ lonDeg: number; kms: number }>) {
  return { heliosphere: { parker_spiral: {
    source_surface_radii: SOURCE_RADII,
    omega_sun_rad_day: OMEGA_RAD_DAY,
    lines: arms.map(({ lonDeg, kms }, index) => ({ id: `spiral-${index}`, polarity: 1, wind_speed_kms: kms, arc: [
      [SOURCE_RADII * Math.cos(lonDeg * DEG), SOURCE_RADII * Math.sin(lonDeg * DEG), 0],
      [600 * Math.cos(lonDeg * DEG), 600 * Math.sin(lonDeg * DEG), 0],
    ] })),
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
const allRadii = (layer: Points) => Array.from({ length: layer.userData.solarWind.count }, (_, i) => radius(layer, i));
function brightness(layer: Points, index: number) {
  const attr = layer.geometry.getAttribute('color') as BufferAttribute;
  return Math.max(attr.getX(index), attr.getY(index), attr.getZ(index));
}

// Pin a particle's streamline (source longitude and latitude) and its path progress (0..1).
function pin(layer: Points, index: number, { progress = 0.5, lonDeg = 0, sinLat = 0 } = {}) {
  const wind = layer.userData.solarWind;
  wind.progress[index] = progress;
  wind.lons[index] = lonDeg * DEG;
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
      pin(layer, 0, { progress: 0.3 });
      updateSolarWindLayer(layer, spiral({ lonDeg: 0, kms: 400 }), SOLAR_RADIUS_AU, 0, cameraAt(0.05));
      expect(layer.visible).toBe(true);
      const before = radius(layer, 0);
      expect(before).toBeGreaterThan(SOURCE_AU);
      updateSolarWindLayer(layer, spiral({ lonDeg: 0, kms: 400 }), SOLAR_RADIUS_AU, 1, cameraAt(0.05));
      expect(radius(layer, 0)).toBeGreaterThan(before);
    });
  });

  it('moves at the speed of the nearest backend arm', () => {
    withLayer(layer => {
      pin(layer, 0, { progress: 0.2, lonDeg: 10 });
      pin(layer, 1, { progress: 0.2, lonDeg: 170 });
      const state = spiral({ lonDeg: 0, kms: 350 }, { lonDeg: 180, kms: 700 });
      updateSolarWindLayer(layer, state, SOLAR_RADIUS_AU, 0, cameraAt(0.05));
      const [slow, fast] = [radius(layer, 0), radius(layer, 1)];
      updateSolarWindLayer(layer, state, SOLAR_RADIUS_AU, 1, cameraAt(0.05));
      expect((radius(layer, 1) - fast) / (radius(layer, 0) - slow)).toBeCloseTo(2, 4);
    });
  });

  it.each([300, 650])('preserves XYZ on a poll, then moves at the latest %s km/s rate', kms => {
    withLayer(layer => {
      pin(layer, 0, { progress: 0.4, lonDeg: 20, sinLat: 0.35 });
      const camera = cameraAt(1);
      const initial = spiral({ lonDeg: 0, kms: 400 });
      updateSolarWindLayer(layer, initial, SOLAR_RADIUS_AU, 100, camera);
      const startRadius = radius(layer, 0);
      updateSolarWindLayer(layer, initial, SOLAR_RADIUS_AU, 100.1, camera);
      const before = position(layer, 0);
      const beforeRadius = radius(layer, 0);
      const latest = spiral({ lonDeg: 0, kms });
      for (let i = 0; i < 3; i++) {
        updateSolarWindLayer(layer, latest, SOLAR_RADIUS_AU, 100.1, camera);
        expect(position(layer, 0)).toEqual(before);
      }
      updateSolarWindLayer(layer, latest, SOLAR_RADIUS_AU, 100.2, camera);
      const step = radius(layer, 0) - beforeRadius;
      expect(step).toBeGreaterThan(0);
      expect(step / (beforeRadius - startRadius)).toBeCloseTo(kms / 400, 4);
    });
  });

  it('preserves XYZ when rotating unequal-speed arms reassign both sectors', () => {
    withLayer(layer => {
      pin(layer, 0, { progress: 0.2, lonDeg: 20, sinLat: 0.4 });
      pin(layer, 1, { progress: 0.2, lonDeg: 200, sinLat: -0.4 });
      const camera = cameraAt(1);
      const initial = spiral({ lonDeg: 0, kms: 350 }, { lonDeg: 180, kms: 700 });
      updateSolarWindLayer(layer, initial, SOLAR_RADIUS_AU, 0, camera);
      const start = [radius(layer, 0), radius(layer, 1)];
      updateSolarWindLayer(layer, initial, SOLAR_RADIUS_AU, 0.1, camera);
      const before = [position(layer, 0), position(layer, 1)];
      const beforeRadii = [radius(layer, 0), radius(layer, 1)];
      const rotated = spiral({ lonDeg: 180, kms: 350 }, { lonDeg: 0, kms: 700 });
      updateSolarWindLayer(layer, rotated, SOLAR_RADIUS_AU, 0.1, camera);
      expect([position(layer, 0), position(layer, 1)]).toEqual(before);
      updateSolarWindLayer(layer, rotated, SOLAR_RADIUS_AU, 0.2, camera);
      expect((radius(layer, 0) - beforeRadii[0]) / (beforeRadii[0] - start[0])).toBeCloseTo(2, 4);
      expect((radius(layer, 1) - beforeRadii[1]) / (beforeRadii[1] - start[1])).toBeCloseTo(0.5, 4);
    });
  });

  it.each([null, spiral()])('discards hidden time and preserves XYZ on readmission from %j', withdrawn => {
    withLayer(layer => {
      pin(layer, 0, { progress: 0.4, sinLat: 0.35 });
      const camera = cameraAt(1);
      const initial = spiral({ lonDeg: 0, kms: 400 });
      updateSolarWindLayer(layer, initial, SOLAR_RADIUS_AU, 0, camera);
      const startRadius = radius(layer, 0);
      updateSolarWindLayer(layer, initial, SOLAR_RADIUS_AU, 0.1, camera);
      const before = position(layer, 0);
      const beforeRadius = radius(layer, 0);
      for (const time of [4, 7]) {
        updateSolarWindLayer(layer, withdrawn, SOLAR_RADIUS_AU, time, camera);
        expect(layer.visible).toBe(false);
      }
      const latest = spiral({ lonDeg: 90, kms: 650 });
      updateSolarWindLayer(layer, latest, SOLAR_RADIUS_AU, 9, camera);
      expect(layer.visible).toBe(true);
      expect(position(layer, 0)).toEqual(before);
      updateSolarWindLayer(layer, latest, SOLAR_RADIUS_AU, 9, camera);
      expect(position(layer, 0)).toEqual(before);
      updateSolarWindLayer(layer, latest, SOLAR_RADIUS_AU, 9.1, camera);
      expect((radius(layer, 0) - beforeRadius) / (beforeRadius - startRadius)).toBeCloseTo(650 / 400, 4);
    });
  });

  it.each([0.7, 14.7])('adopts the latest Parker curvature after wrapping at %s seconds', time => {
    withLayer(layer => {
      pin(layer, 0, { progress: 0.95, lonDeg: 30 });
      const camera = cameraAt(1);
      updateSolarWindLayer(layer, spiral({ lonDeg: 0, kms: 400 }), SOLAR_RADIUS_AU, 0, camera);
      const before = position(layer, 0);
      const latest = spiral({ lonDeg: 0, kms: 800 });
      updateSolarWindLayer(layer, latest, SOLAR_RADIUS_AU, 0, camera);
      expect(position(layer, 0)).toEqual(before);
      // At 800 km/s a flight takes 7 seconds: wrap once or three times, with 5% left over.
      updateSolarWindLayer(layer, latest, SOLAR_RADIUS_AU, time, camera);
      expect(radius(layer, 0)).toBeCloseTo(SOURCE_AU + (1.5 - SOURCE_AU) * 0.05, 6);
      const [x, y] = position(layer, 0);
      const lag = (OMEGA_RAD_DAY / ((800 * 86_400) / AU_KM)) * (radius(layer, 0) - SOURCE_AU);
      expect(Math.cos(Math.atan2(y, x) - (30 * DEG - lag))).toBeCloseTo(1, 8);
      const wrapped = position(layer, 0);
      updateSolarWindLayer(layer, latest, SOLAR_RADIUS_AU, time, camera);
      expect(position(layer, 0)).toEqual(wrapped);
      updateSolarWindLayer(layer, latest, SOLAR_RADIUS_AU, time + 0.1, camera);
      expect(radius(layer, 0)).toBeGreaterThan(Math.hypot(...wrapped));
    });
  });

  it('lags behind its source longitude like a Parker spiral', () => {
    withLayer(layer => {
      pin(layer, 0, { progress: 0.9, lonDeg: 30 });
      updateSolarWindLayer(layer, spiral({ lonDeg: 0, kms: 400 }), SOLAR_RADIUS_AU, 0, cameraAt(1));
      const [x, y] = position(layer, 0);
      const lag = (OMEGA_RAD_DAY / ((400 * 86_400) / AU_KM)) * (radius(layer, 0) - SOURCE_AU);
      expect(lag).toBeGreaterThan(1);
      expect(Math.cos(Math.atan2(y, x) - (30 * DEG - lag))).toBeCloseTo(1, 6);
    });
  });

  it.each([0.05, 1])('fills about one and a half camera distances (camera at %s AU)', distanceAu => {
    withLayer(layer => {
      updateSolarWindLayer(layer, spiral({ lonDeg: 0, kms: 400 }), SOLAR_RADIUS_AU, 0, cameraAt(distanceAu));
      const farthest = Math.max(...allRadii(layer));
      expect(farthest).toBeLessThanOrEqual(1.5 * distanceAu + 1e-9);
      expect(farthest).toBeGreaterThan(distanceAu);
    });
  });

  it('starts outside an enlarged display Sun', () => {
    withLayer(layer => {
      const enlarged = 40 * SOLAR_RADIUS_AU;
      updateSolarWindLayer(layer, spiral({ lonDeg: 0, kms: 400 }), enlarged, 0, cameraAt(1));
      expect(Math.min(...allRadii(layer))).toBeGreaterThanOrEqual(enlarged * 1.05 * (1 - 1e-6));
    });
  });

  it.each([
    { label: 'at the source', progress: 0, visible: false },
    { label: 'mid-flight', progress: 0.5, visible: true },
    { label: 'at the far edge', progress: 0.999, visible: false },
  ])('fades a particle $label', ({ progress, visible }) => {
    withLayer(layer => {
      pin(layer, 0, { progress });
      updateSolarWindLayer(layer, spiral({ lonDeg: 0, kms: 400 }), SOLAR_RADIUS_AU, 0, cameraAt(0.05));
      expect(brightness(layer, 0) > 0.05).toBe(visible);
    });
  });

  it('tints fast wind cooler than slow wind', () => {
    withLayer(layer => {
      pin(layer, 0, { lonDeg: 0 });
      pin(layer, 1, { lonDeg: 180 });
      updateSolarWindLayer(layer, spiral({ lonDeg: 0, kms: 350 }, { lonDeg: 180, kms: 800 }), SOLAR_RADIUS_AU, 0, cameraAt(0.05));
      const color = layer.geometry.getAttribute('color') as BufferAttribute;
      const warmth = (index: number) => color.getX(index) / color.getZ(index);
      expect(warmth(0)).toBeGreaterThan(warmth(1) * 1.2);
    });
  });

  it('draws small soft discs of constant screen size, so nearby particles never balloon', () => {
    withLayer(layer => {
      const material = layer.material as PointsMaterial;
      expect(material.sizeAttenuation).toBe(false);
      const mask = material.alphaMap as DataTexture | null;
      const data = mask?.image?.data;
      expect(data).toBeInstanceOf(Uint8Array);
      const { width, height } = mask!.image;
      expect(data![1]).toBe(0); // corner texel, green channel
      expect(data![((height / 2) * width + width / 2) * 4 + 1]).toBeGreaterThan(240);
    });
  });
});
