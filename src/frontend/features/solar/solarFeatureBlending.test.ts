import { describe, expect, it } from 'vitest';
import {
  buildSolarFeatureBlendView,
  materializeSolarFeatureSetFromBlendView,
  sampleSolarFeatureEntryPoint,
  type SolarArcPoint,
  type SolarFeature,
  type SolarFeatureBlendEntry,
  type SolarFeatureSet
} from './solarFeatureBlending';

function featureSet(activityIndex: number | null): SolarFeatureSet {
  const feature = { id: 'loop-1', kind: 'loop', brightness: 1, speedFactor: 1, peakExtent: 1.2, arc: [[1, 0, 0], [0, 1, 0]] };
  return { features: [feature], featureById: new Map([[feature.id, feature]]), activityIndex, epochJd: 2_460_000.5 } as SolarFeatureSet;
}

const halfway = (current: SolarFeatureSet, target: SolarFeatureSet) => buildSolarFeatureBlendView({
  currentFeatureSet: current,
  targetFeatureSet: target,
  blendStartMs: 0,
  blendDurationMs: 1_000,
  nowMs: 500
});

// Number(null) is 0, so a missing activity used to blend as a completely quiet Sun.
describe('solar feature blending with unknown activity', () => {
  it('takes the target activity when the current one is unknown', () => {
    expect(halfway(featureSet(null), featureSet(0.6)).activityIndex).toBe(0.6);
  });

  it('keeps the current activity when the target one is unknown', () => {
    expect(halfway(featureSet(0.6), featureSet(null)).activityIndex).toBe(0.6);
  });

  it('keeps unknown activity unknown when a blend is materialized', () => {
    const view = halfway(featureSet(null), featureSet(null));
    expect(materializeSolarFeatureSetFromBlendView(view, 2_460_000.5)?.activityIndex).toBeNull();
  });
});

function feature(id: string, arc: SolarArcPoint[]): SolarFeature {
  return {
    id,
    kind: 'loop',
    brightness: 1,
    speedFactor: 0.2,
    peakExtent: 1,
    arc,
  };
}

function entry(fromPoint: SolarArcPoint, toPoint: SolarArcPoint): SolarFeatureBlendEntry {
  return {
    id: 'persistent-loop',
    kind: 'loop',
    fromFeature: feature('persistent-loop', [fromPoint, fromPoint]),
    toFeature: feature('persistent-loop', [toPoint, toPoint]),
    fromWeight: 1,
    toWeight: 1,
  };
}

function radius(point: SolarArcPoint): number {
  return Math.hypot(...point);
}

function pointAtDegrees(angleDeg: number, pointRadius = 1): SolarArcPoint {
  const angle = angleDeg * Math.PI / 180;
  return [Math.cos(angle) * pointRadius, Math.sin(angle) * pointRadius, 0];
}

describe('coronal-loop spherical cross-fade (B066)', () => {
  it('moves along the sphere while interpolating radial height separately', () => {
    const from: SolarArcPoint = [1, 0, 0];
    const to: SolarArcPoint = [-0.8, 0.8 * Math.sqrt(3), 0];
    const midpoint = sampleSolarFeatureEntryPoint(entry(from, to), 0, 0.5)!;

    // A Cartesian midpoint has radius 0.7 and would disappear below the photosphere.
    expect(radius([
      (from[0] + to[0]) * 0.5,
      (from[1] + to[1]) * 0.5,
      (from[2] + to[2]) * 0.5,
    ])).toBeCloseTo(0.7, 12);
    expect(radius(midpoint)).toBeCloseTo(1.3, 12);
    expect(midpoint[0]).toBeCloseTo(0.65, 12);
    expect(midpoint[1]).toBeCloseTo(1.3 * Math.sqrt(3) / 2, 12);
    expect(midpoint[2]).toBeCloseTo(0, 12);

    const quarter = sampleSolarFeatureEntryPoint(entry(from, to), 0, 0.25)!;
    expect(radius(quarter)).toBeCloseTo(1.15, 12);
    expect(Math.atan2(quarter[1], quarter[0])).toBeCloseTo(Math.PI / 6, 12);
  });

  it('preserves exact endpoints and handles parallel and antipodal directions', () => {
    const from: SolarArcPoint = [2, 0, 0];
    const to: SolarArcPoint = [-4, 0, 0];
    const blendEntry = entry(from, to);

    expect(sampleSolarFeatureEntryPoint(blendEntry, 0, 0)).toEqual(from);
    expect(sampleSolarFeatureEntryPoint(blendEntry, 0, 1)).toEqual(to);

    const antipodalMidpoint = sampleSolarFeatureEntryPoint(blendEntry, 0, 0.5)!;
    expect(antipodalMidpoint.every(Number.isFinite)).toBe(true);
    expect(radius(antipodalMidpoint)).toBeCloseTo(3, 12);
    expect(antipodalMidpoint[0]).toBeCloseTo(0, 12);

    const parallelMidpoint = sampleSolarFeatureEntryPoint(
      entry([2, 0, 0], [4, 0, 0]),
      0,
      0.5,
    )!;
    expect(parallelMidpoint).toEqual([3, 0, 0]);
  });

  it('uses the defined direction when one endpoint is at the origin', () => {
    expect(sampleSolarFeatureEntryPoint(
      entry([0, 0, 0], [0, 4, 0]),
      0,
      0.25,
    )).toEqual([0, 1, 0]);
    expect(sampleSolarFeatureEntryPoint(
      entry([2, 0, 0], [0, 0, 0]),
      0,
      0.5,
    )).toEqual([1, 0, 0]);
    expect(sampleSolarFeatureEntryPoint(
      entry([0, 0, 0], [0, 0, 0]),
      0,
      0.5,
    )).toEqual([0, 0, 0]);
  });

  it('takes the constant-speed shortest arc across longitude wrap and near antipodes', () => {
    const wrapped = sampleSolarFeatureEntryPoint(
      entry(pointAtDegrees(170), pointAtDegrees(-170)),
      0,
      0.25,
    )!;
    expect(radius(wrapped)).toBeCloseTo(1, 12);
    expect(Math.atan2(wrapped[1], wrapped[0]) * 180 / Math.PI).toBeCloseTo(175, 12);

    const nearAntipodal = sampleSolarFeatureEntryPoint(
      entry(pointAtDegrees(0), pointAtDegrees(179)),
      0,
      0.25,
    )!;
    expect(radius(nearAntipodal)).toBeCloseTo(1, 12);
    expect(Math.atan2(nearAntipodal[1], nearAntipodal[0]) * 180 / Math.PI)
      .toBeCloseTo(44.75, 12);
  });

  it('materializes interrupted blends without baking a chord through the Sun', () => {
    const blendEntry = entry(
      [1, 0, 0],
      [-0.5, Math.sqrt(3) / 2, 0],
    );
    const materialized = materializeSolarFeatureSetFromBlendView({
      blendAlpha: 0.5,
      activityIndex: 0.5,
      entries: [blendEntry],
      nextCurrentFeatureSet: null,
      nextTargetFeatureSet: null,
      nextBlendStartMs: 0,
      complete: false,
    }, 2_451_672);

    expect(materialized?.features).toHaveLength(1);
    for (const point of materialized!.features[0]!.arc) {
      expect(radius(point)).toBeCloseTo(1, 12);
      expect(Math.atan2(point[1], point[0])).toBeCloseTo(Math.PI / 3, 12);
    }
  });
});
