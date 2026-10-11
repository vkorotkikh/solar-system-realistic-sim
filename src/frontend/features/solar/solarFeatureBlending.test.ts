import { describe, expect, it } from 'vitest';
import {
  buildSolarFeatureBlendView,
  materializeSolarFeatureSetFromBlendView,
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
