export type SolarArcPoint = [number, number, number];

export interface SolarFeature {
  id: string;
  kind: string;
  brightness: number;
  speedFactor: number;
  peakExtent: number;
  arc: SolarArcPoint[];
}

export interface SolarFeatureSet {
  features: SolarFeature[];
  featureById: Map<string, SolarFeature>;
  activityIndex: number | null;
  epochJd: number;
}

export interface SolarFeatureBlendEntry {
  id: string;
  kind: string;
  fromFeature: SolarFeature;
  toFeature: SolarFeature;
  fromWeight: number;
  toWeight: number;
}

export interface SolarFeatureBlendView {
  blendAlpha: number;
  activityIndex: number | null;
  entries: SolarFeatureBlendEntry[];
  nextCurrentFeatureSet: SolarFeatureSet | null;
  nextTargetFeatureSet: SolarFeatureSet | null;
  nextBlendStartMs: number;
  complete: boolean;
}

interface SolarPhysicsFeatureLike {
  id?: unknown;
  kind?: unknown;
  brightness?: unknown;
  expansion_speed_kms?: unknown;
  peak_extent_solar_radii?: unknown;
  arc?: unknown[] | null;
}

interface SolarPhysicsStateLike {
  corona?: {
    features?: SolarPhysicsFeatureLike[] | null;
  } | null;
  activity_index?: unknown;
  epoch_jd?: unknown;
}

export function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function lerpNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function normalizeSolarFeatureSetFromState(
  physicsState: SolarPhysicsStateLike | null | undefined,
  fallbackEpochJd: number,
  featureLimit = 220
): SolarFeatureSet | null {
  const sourceFeatures = physicsState?.corona?.features;
  if (!Array.isArray(sourceFeatures) || sourceFeatures.length === 0) return null;

  const safeLimit = Math.max(8, Math.min(2_048, Math.floor(Number(featureLimit) || 220)));
  const features: SolarFeature[] = [];
  const featureById = new Map<string, SolarFeature>();
  for (let i = 0; i < sourceFeatures.length && features.length < safeLimit; i += 1) {
    const feature = sourceFeatures[i];
    const arcRaw = Array.isArray(feature?.arc) ? feature.arc : null;
    if (!arcRaw || arcRaw.length < 2) continue;

    const arc: SolarArcPoint[] = [];
    for (const sample of arcRaw) {
      if (!Array.isArray(sample) || sample.length !== 3) continue;
      const x = Number(sample[0]);
      const y = Number(sample[1]);
      const z = Number(sample[2]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      arc.push([x, y, z]);
    }
    if (arc.length < 2) continue;

    const id = `${feature?.id ?? `feature-${i}`}`;
    if (featureById.has(id)) continue;
    const kind = `${feature?.kind ?? 'loop'}`.toLowerCase();
    const brightness = Math.max(0.05, Math.min(1, Number(feature?.brightness) || 0.35));
    const speedKms = Number(feature?.expansion_speed_kms);
    let speedFactor = 0.2;
    if (Number.isFinite(speedKms)) {
      // Map widened physical speed range (20..3500 km/s) into a perceptual animation factor.
      const normalized = clampUnit((speedKms - 20) / 3_480);
      speedFactor = Math.max(0.02, Math.min(0.95, normalized ** 0.55));
    }
    const peakExtentRaw = Number(feature?.peak_extent_solar_radii);
    const peakExtent = Number.isFinite(peakExtentRaw) ? Math.max(1, peakExtentRaw) : 1.0;

    const normalized: SolarFeature = {
      id,
      kind,
      brightness,
      speedFactor,
      peakExtent,
      arc
    };
    features.push(normalized);
    featureById.set(id, normalized);
  }

  if (features.length === 0) return null;
  const activityRaw = Number(physicsState?.activity_index);
  const epochRaw = Number(physicsState?.epoch_jd);
  return {
    features,
    featureById,
    activityIndex: Number.isFinite(activityRaw) ? clampUnit(activityRaw) : null,
    epochJd: Number.isFinite(epochRaw) ? epochRaw : fallbackEpochJd
  };
}

export function sampleCoronalArcPoint(
  arc: SolarArcPoint[] | null | undefined,
  phase: number
): SolarArcPoint | null {
  if (!Array.isArray(arc) || arc.length === 0) return null;
  if (arc.length === 1) return arc[0];
  const t = Math.max(0, Math.min(0.999999, phase));
  const scaled = t * (arc.length - 1);
  const idx = Math.floor(scaled);
  const next = Math.min(arc.length - 1, idx + 1);
  const frac = scaled - idx;
  const p0 = arc[idx];
  const p1 = arc[next];
  if (!Array.isArray(p0) || !Array.isArray(p1) || p0.length !== 3 || p1.length !== 3) return null;
  const x = Number(p0[0]) + (Number(p1[0]) - Number(p0[0])) * frac;
  const y = Number(p0[1]) + (Number(p1[1]) - Number(p0[1])) * frac;
  const z = Number(p0[2]) + (Number(p1[2]) - Number(p0[2])) * frac;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return [x, y, z];
}

export function sampleSolarFeatureEntryPoint(
  entry: SolarFeatureBlendEntry | null | undefined,
  phase: number,
  blendAlpha: number
): SolarArcPoint | null {
  const fromWeight = Number(entry?.fromWeight);
  const toWeight = Number(entry?.toWeight);
  const hasFrom = Number.isFinite(fromWeight) ? fromWeight > 0.5 : true;
  const hasTo = Number.isFinite(toWeight) ? toWeight > 0.5 : true;
  const fromPoint = hasFrom ? sampleCoronalArcPoint(entry?.fromFeature?.arc, phase) : null;
  const toPoint = hasTo ? sampleCoronalArcPoint(entry?.toFeature?.arc, phase) : null;

  if (fromPoint && toPoint && hasFrom && hasTo) {
    return [
      lerpNumber(fromPoint[0], toPoint[0], blendAlpha),
      lerpNumber(fromPoint[1], toPoint[1], blendAlpha),
      lerpNumber(fromPoint[2], toPoint[2], blendAlpha)
    ];
  }
  return toPoint ?? fromPoint;
}

export function solarFeatureEntryBrightness(
  entry: SolarFeatureBlendEntry | null | undefined,
  blendAlpha: number
): number {
  const fromBrightnessRaw = Number(entry?.fromFeature?.brightness);
  const toBrightnessRaw = Number(entry?.toFeature?.brightness);
  const fromBrightness = Number.isFinite(fromBrightnessRaw) ? Math.max(0, fromBrightnessRaw) : 0;
  const toBrightness = Number.isFinite(toBrightnessRaw) ? Math.max(0, toBrightnessRaw) : 0;
  const fromWeight = Number(entry?.fromWeight);
  const toWeight = Number(entry?.toWeight);
  const hasFrom = Number.isFinite(fromWeight) ? fromWeight > 0.5 : true;
  const hasTo = Number.isFinite(toWeight) ? toWeight > 0.5 : true;

  if (hasFrom && hasTo) {
    return lerpNumber(fromBrightness, toBrightness, blendAlpha);
  }
  if (hasTo) return toBrightness * blendAlpha;
  if (hasFrom) return fromBrightness * (1 - blendAlpha);
  return 0;
}

export function buildSolarFeatureBlendView({
  currentFeatureSet,
  targetFeatureSet,
  blendStartMs,
  blendDurationMs,
  nowMs = Date.now(),
  featureLimit = 220
}: {
  currentFeatureSet: SolarFeatureSet | null;
  targetFeatureSet: SolarFeatureSet | null;
  blendStartMs: number;
  blendDurationMs: number;
  nowMs?: number;
  featureLimit?: number;
}): SolarFeatureBlendView {
  if (!currentFeatureSet && !targetFeatureSet) {
    return {
      blendAlpha: 1,
      activityIndex: null,
      entries: [],
      nextCurrentFeatureSet: currentFeatureSet,
      nextTargetFeatureSet: targetFeatureSet,
      nextBlendStartMs: blendStartMs,
      complete: false
    };
  }

  let nextCurrentFeatureSet = currentFeatureSet;
  let nextTargetFeatureSet = targetFeatureSet;
  let nextBlendStartMs = blendStartMs;

  if (!nextCurrentFeatureSet && nextTargetFeatureSet) {
    nextCurrentFeatureSet = nextTargetFeatureSet;
    nextTargetFeatureSet = null;
  }
  if (!nextCurrentFeatureSet) {
    return {
      blendAlpha: 1,
      activityIndex: null,
      entries: [],
      nextCurrentFeatureSet,
      nextTargetFeatureSet,
      nextBlendStartMs,
      complete: false
    };
  }

  const safeLimit = Math.max(8, Math.min(2_048, Math.floor(Number(featureLimit) || 220)));
  if (!nextTargetFeatureSet) {
    const entries = nextCurrentFeatureSet.features
      .slice(0, safeLimit)
      .map((feature) => ({
        id: feature.id,
        kind: feature.kind,
        fromFeature: feature,
        toFeature: feature,
        fromWeight: 1,
        toWeight: 1
      }));
    return {
      blendAlpha: 1,
      activityIndex: nextCurrentFeatureSet.activityIndex,
      entries,
      nextCurrentFeatureSet,
      nextTargetFeatureSet,
      nextBlendStartMs,
      complete: false
    };
  }

  const durationMs = Math.max(240, Number(blendDurationMs) || 900);
  const linearAlpha = clampUnit((nowMs - nextBlendStartMs) / durationMs);
  const blendAlpha = linearAlpha * linearAlpha * (3 - 2 * linearAlpha);
  const entries: SolarFeatureBlendEntry[] = [];
  const seen = new Set();

  for (const targetFeature of nextTargetFeatureSet.features) {
    const fromFeature = nextCurrentFeatureSet.featureById.get(targetFeature.id) ?? targetFeature;
    entries.push({
      id: targetFeature.id,
      kind: targetFeature.kind,
      fromFeature,
      toFeature: targetFeature,
      fromWeight: nextCurrentFeatureSet.featureById.has(targetFeature.id) ? 1 : 0,
      toWeight: 1
    });
    seen.add(targetFeature.id);
    if (entries.length >= safeLimit) break;
  }

  if (entries.length < safeLimit) {
    for (const currentFeature of nextCurrentFeatureSet.features) {
      if (seen.has(currentFeature.id)) continue;
      entries.push({
        id: currentFeature.id,
        kind: currentFeature.kind,
        fromFeature: currentFeature,
        toFeature: currentFeature,
        fromWeight: 1,
        toWeight: 0
      });
      if (entries.length >= safeLimit) break;
    }
  }

  let activityIndex = nextCurrentFeatureSet.activityIndex;
  const currentActivity = Number(nextCurrentFeatureSet.activityIndex);
  const targetActivity = Number(nextTargetFeatureSet.activityIndex);
  if (Number.isFinite(currentActivity) && Number.isFinite(targetActivity)) {
    activityIndex = lerpNumber(currentActivity, targetActivity, blendAlpha);
  } else if (Number.isFinite(targetActivity)) {
    activityIndex = targetActivity;
  }

  const complete = linearAlpha >= 1;
  if (complete) {
    nextCurrentFeatureSet = nextTargetFeatureSet;
    nextTargetFeatureSet = null;
    nextBlendStartMs = nowMs;
  }

  return {
    blendAlpha: complete ? 1 : blendAlpha,
    activityIndex: complete ? nextCurrentFeatureSet.activityIndex : activityIndex,
    entries: complete
      ? nextCurrentFeatureSet.features.slice(0, safeLimit).map((feature) => ({
          id: feature.id,
          kind: feature.kind,
          fromFeature: feature,
          toFeature: feature,
          fromWeight: 1,
          toWeight: 1
        }))
      : entries,
    nextCurrentFeatureSet,
    nextTargetFeatureSet,
    nextBlendStartMs,
    complete
  };
}

export function materializeSolarFeatureSetFromBlendView(
  blendView: SolarFeatureBlendView | null | undefined,
  fallbackEpochJd: number
): SolarFeatureSet | null {
  if (!blendView || !Array.isArray(blendView.entries) || blendView.entries.length === 0) return null;
  const blendAlpha = clampUnit(Number(blendView.blendAlpha) || 0);
  const features: SolarFeature[] = [];
  const featureById = new Map<string, SolarFeature>();

  for (const entry of blendView.entries) {
    const fromCount = entry?.fromFeature?.arc?.length ?? 0;
    const toCount = entry?.toFeature?.arc?.length ?? 0;
    const pointCount = Math.max(2, fromCount, toCount);
    const arc: SolarArcPoint[] = [];

    for (let i = 0; i < pointCount; i += 1) {
      const phase = pointCount <= 1 ? 0 : i / (pointCount - 1);
      const sampled = sampleSolarFeatureEntryPoint(entry, phase, blendAlpha);
      if (!sampled) continue;
      arc.push(sampled);
    }
    if (arc.length < 2) continue;

    const brightness = solarFeatureEntryBrightness(entry, blendAlpha);
    if (brightness <= 0.002) continue;
    const speedFrom = Number(entry?.fromFeature?.speedFactor);
    const speedTo = Number(entry?.toFeature?.speedFactor);
    const speedFactor = Number.isFinite(speedFrom) && Number.isFinite(speedTo)
      ? lerpNumber(speedFrom, speedTo, blendAlpha)
      : (Number.isFinite(speedTo) ? speedTo : (Number.isFinite(speedFrom) ? speedFrom : 0.2));
    const peakFrom = Number(entry?.fromFeature?.peakExtent);
    const peakTo = Number(entry?.toFeature?.peakExtent);
    const peakExtent = Number.isFinite(peakFrom) && Number.isFinite(peakTo)
      ? lerpNumber(peakFrom, peakTo, blendAlpha)
      : (Number.isFinite(peakTo) ? peakTo : (Number.isFinite(peakFrom) ? peakFrom : 1.0));

    const normalized: SolarFeature = {
      id: `${entry?.id ?? `feature-${features.length}`}`,
      kind: `${entry?.kind ?? 'loop'}`.toLowerCase(),
      brightness,
      speedFactor,
      peakExtent,
      arc
    };
    if (featureById.has(normalized.id)) continue;
    features.push(normalized);
    featureById.set(normalized.id, normalized);
  }

  if (features.length === 0) return null;
  return {
    features,
    featureById,
    activityIndex: Number.isFinite(Number(blendView.activityIndex))
      ? clampUnit(Number(blendView.activityIndex))
      : null,
    epochJd: fallbackEpochJd
  };
}
