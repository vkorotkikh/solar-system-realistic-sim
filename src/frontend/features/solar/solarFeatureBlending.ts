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

export interface SolarPhysicsFeatureLike {
  id?: unknown;
  kind?: unknown;
  brightness?: unknown;
  expansion_speed_kms?: unknown;
  peak_extent_solar_radii?: unknown;
  arc?: unknown[] | null;
  base_dir?: unknown;
  paired_dir?: unknown;
  emergence?: unknown;
  active_region_id?: unknown;
  region_id?: unknown;
}

export interface SolarPhysicsStateLike {
  corona?: {
    features?: SolarPhysicsFeatureLike[] | null;
  } | null;
  activity_index?: unknown;
  epoch_jd?: unknown;
  heliosphere?: { parker_spiral?: { lines?: unknown } | null } | null;
}

export function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** `Number(null)` is 0, which would turn "no activity reported" into a completely quiet Sun. */
export function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

function sphericalInterpolateArcPoint(
  fromPoint: SolarArcPoint,
  toPoint: SolarArcPoint,
  blendAlpha: number,
): SolarArcPoint {
  const alpha = clampUnit(Number.isFinite(blendAlpha) ? blendAlpha : 1);
  if (alpha <= 0) return [...fromPoint];
  if (alpha >= 1) return [...toPoint];

  const fromRadius = Math.hypot(fromPoint[0], fromPoint[1], fromPoint[2]);
  const toRadius = Math.hypot(toPoint[0], toPoint[1], toPoint[2]);
  const radius = lerpNumber(fromRadius, toRadius, alpha);
  const epsilon = 1e-12;

  if (fromRadius <= epsilon && toRadius <= epsilon) return [0, 0, 0];

  // A zero-length endpoint has no direction. Keep the defined endpoint's
  // direction while its separately interpolated radius grows or collapses.
  if (fromRadius <= epsilon) {
    return [
      toPoint[0] / toRadius * radius,
      toPoint[1] / toRadius * radius,
      toPoint[2] / toRadius * radius,
    ];
  }
  if (toRadius <= epsilon) {
    return [
      fromPoint[0] / fromRadius * radius,
      fromPoint[1] / fromRadius * radius,
      fromPoint[2] / fromRadius * radius,
    ];
  }

  const fromX = fromPoint[0] / fromRadius;
  const fromY = fromPoint[1] / fromRadius;
  const fromZ = fromPoint[2] / fromRadius;
  const toX = toPoint[0] / toRadius;
  const toY = toPoint[1] / toRadius;
  const toZ = toPoint[2] / toRadius;
  const dot = Math.max(-1, Math.min(1, fromX * toX + fromY * toY + fromZ * toZ));

  let directionX: number;
  let directionY: number;
  let directionZ: number;

  if (dot > 1 - epsilon) {
    // Normalized lerp avoids precision loss from acos/sin for coincident directions.
    directionX = lerpNumber(fromX, toX, alpha);
    directionY = lerpNumber(fromY, toY, alpha);
    directionZ = lerpNumber(fromZ, toZ, alpha);
    const directionLength = Math.hypot(directionX, directionY, directionZ) || 1;
    directionX /= directionLength;
    directionY /= directionLength;
    directionZ /= directionLength;
  } else {
    let tangentX = toX - dot * fromX;
    let tangentY = toY - dot * fromY;
    let tangentZ = toZ - dot * fromZ;
    let tangentLength = Math.hypot(tangentX, tangentY, tangentZ);

    if (tangentLength <= epsilon) {
      // Exact antipodes have infinitely many shortest arcs. Pick a stable
      // perpendicular so the midpoint cannot collapse to the origin.
      const referenceX = 0;
      const referenceY = Math.abs(fromZ) >= 0.85 ? 1 : 0;
      const referenceZ = Math.abs(fromZ) >= 0.85 ? 0 : 1;
      const projection = referenceX * fromX + referenceY * fromY + referenceZ * fromZ;
      tangentX = referenceX - projection * fromX;
      tangentY = referenceY - projection * fromY;
      tangentZ = referenceZ - projection * fromZ;
      tangentLength = Math.hypot(tangentX, tangentY, tangentZ);
    }

    tangentX /= tangentLength;
    tangentY /= tangentLength;
    tangentZ /= tangentLength;
    const angle = Math.acos(dot) * alpha;
    const fromWeight = Math.cos(angle);
    const tangentWeight = Math.sin(angle);
    directionX = fromX * fromWeight + tangentX * tangentWeight;
    directionY = fromY * fromWeight + tangentY * tangentWeight;
    directionZ = fromZ * fromWeight + tangentZ * tangentWeight;
  }

  return [directionX * radius, directionY * radius, directionZ * radius];
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
  const alpha = clampUnit(Number.isFinite(blendAlpha) ? blendAlpha : 1);

  // Outside a live cross-fade both sides normally reference the same feature.
  // Avoid sampling the same arc twice on every animation frame.
  if (hasFrom && hasTo && entry?.fromFeature === entry?.toFeature) {
    return sampleCoronalArcPoint(entry?.toFeature?.arc, phase);
  }
  if (hasFrom && hasTo && alpha <= 0) {
    return sampleCoronalArcPoint(entry?.fromFeature?.arc, phase);
  }
  if (hasFrom && hasTo && alpha >= 1) {
    return sampleCoronalArcPoint(entry?.toFeature?.arc, phase);
  }

  const fromPoint = hasFrom ? sampleCoronalArcPoint(entry?.fromFeature?.arc, phase) : null;
  const toPoint = hasTo ? sampleCoronalArcPoint(entry?.toFeature?.arc, phase) : null;

  if (fromPoint && toPoint && hasFrom && hasTo) {
    return sphericalInterpolateArcPoint(fromPoint, toPoint, alpha);
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
  const currentActivity = finiteOrNull(nextCurrentFeatureSet.activityIndex);
  const targetActivity = finiteOrNull(nextTargetFeatureSet.activityIndex);
  if (currentActivity !== null && targetActivity !== null) {
    activityIndex = lerpNumber(currentActivity, targetActivity, blendAlpha);
  } else if (targetActivity !== null) {
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
    activityIndex: finiteOrNull(blendView.activityIndex) === null ? null : clampUnit(blendView.activityIndex as number),
    epochJd: fallbackEpochJd
  };
}
