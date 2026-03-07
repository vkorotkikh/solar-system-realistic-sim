export const enum TaxonomyClass {
  C = 'C',
  S = 'S',
  M = 'M',
  Unknown = 'U',
}

export const enum MaterialClass {
  Carbonaceous = 0, // C-type
  Silicaceous = 1, // S-type
  Metallic = 2, // M-type
  Unknown = 3,
}

export const enum MassClass {
  Rubble = 0, // sub-40 m analog (very small body)
  Small = 1, // 40-250 m
  Medium = 2, // 250 m - 2 km
  Large = 3, // 2 - 20 km
  Massive = 4, // 20 - 120 km
  Giant = 5, // > 120 km
}

export const enum MissionPriorityClass {
  Archive = 'archive',
  Background = 'background',
  Standard = 'standard',
  Priority = 'priority',
  Critical = 'critical',
}

export interface TaxonomyResolverInput {
  specB?: string | null;
  specT?: string | null;
  taxonomy?: TaxonomyClass | string | null;
  semiMajorAxisAu?: number | null;
  albedo?: number | null;
  diameterKm?: number | null;
  absMag?: number | null;
  eccentricity?: number | null;
  source?: 'jpl' | 'mpc' | 'synthetic' | 'phase1' | string;
  sourceId?: string | number | null;
}

export interface TaxonomyResolvedRecord extends TaxonomyResolverInput {
  taxonomy: TaxonomyClass;
  taxonomyEvidence: 'specT' | 'specB' | 'semi-major-fallback' | 'default';
  materialClass: MaterialClass;
  materialClassIndex: number;
  albedo: number;
  albedoEvidence: 'provided' | 'fallback';
  massClass: MassClass;
  massClassIndex: number;
  missionClass: MissionPriorityClass;
  priorityClass: MissionPriorityClass;
  selectionPriority: number;
  resolverSeed: number;
}

export interface SemiMajorAxisBin {
  label: string;
  minAu: number;
  maxAu: number;
  expectedTaxonomyShare?: Partial<Record<TaxonomyClass, number>>;
  expectedTotalFraction?: number;
  tolerance?: number;
  minCount?: number;
}

export interface SemiMajorAxisBinResult {
  label: string;
  minAu: number;
  maxAu: number;
  total: number;
  expectedTotal: number | null;
  taxonomyCount: Record<TaxonomyClass, number>;
  taxonomyShare: Record<TaxonomyClass, number>;
  expectedTaxonomyShare: Partial<Record<TaxonomyClass, number>>;
  tolerance: number;
  passed: boolean;
  issues: string[];
}

export interface SemiMajorAxisCoverageCheck {
  totalInput: number;
  inRangedCount: number;
  outOfRangeCount: number;
  bins: SemiMajorAxisBinResult[];
  passed: boolean;
  issues: string[];
}

const TAXONOMY_FROM_SPEC: Readonly<Record<string, TaxonomyClass>> = {
  B: TaxonomyClass.C,
  C: TaxonomyClass.C,
  D: TaxonomyClass.C,
  F: TaxonomyClass.C,
  G: TaxonomyClass.C,
  O: TaxonomyClass.C,
  P: TaxonomyClass.C,
  T: TaxonomyClass.C,
  K: TaxonomyClass.S,
  L: TaxonomyClass.S,
  Q: TaxonomyClass.S,
  R: TaxonomyClass.S,
  S: TaxonomyClass.S,
  V: TaxonomyClass.S,
  A: TaxonomyClass.S,
  E: TaxonomyClass.M,
  M: TaxonomyClass.M,
  X: TaxonomyClass.M,
};

const TAXONOMY_FROM_AU: ReadonlyArray<{
  minAu: number;
  maxAu: number;
  taxonomy: TaxonomyClass;
}> = [
  { minAu: 0, maxAu: 2.5, taxonomy: TaxonomyClass.S },
  { minAu: 2.5, maxAu: 2.7, taxonomy: TaxonomyClass.M },
  { minAu: 2.7, maxAu: Number.POSITIVE_INFINITY, taxonomy: TaxonomyClass.C },
];

const MATERIAL_CLASS_INDEX: Record<TaxonomyClass, MaterialClass> = {
  [TaxonomyClass.C]: MaterialClass.Carbonaceous,
  [TaxonomyClass.S]: MaterialClass.Silicaceous,
  [TaxonomyClass.M]: MaterialClass.Metallic,
  [TaxonomyClass.Unknown]: MaterialClass.Unknown,
};

const ALBEDO_RANGE_BY_TAXONOMY: Readonly<Record<TaxonomyClass, [number, number]>> = {
  [TaxonomyClass.C]: [0.03, 0.10],
  [TaxonomyClass.S]: [0.10, 0.22],
  [TaxonomyClass.M]: [0.10, 0.18],
  [TaxonomyClass.Unknown]: [0.08, 0.16],
};

const MASS_CLASS_LABELS: ReadonlyArray<{
  cls: MassClass;
  maxDiameterKm: number;
}> = [
  { cls: MassClass.Rubble, maxDiameterKm: 0.04 },
  { cls: MassClass.Small, maxDiameterKm: 0.25 },
  { cls: MassClass.Medium, maxDiameterKm: 2 },
  { cls: MassClass.Large, maxDiameterKm: 20 },
  { cls: MassClass.Massive, maxDiameterKm: 120 },
  { cls: MassClass.Giant, maxDiameterKm: Number.POSITIVE_INFINITY },
];

export const DEFAULT_SEMI_MAJOR_AXIS_BINS: readonly SemiMajorAxisBin[] = [
  {
    label: 'inner-belt',
    minAu: 2.06,
    maxAu: 2.5,
    expectedTaxonomyShare: {
      [TaxonomyClass.C]: 0.15,
      [TaxonomyClass.S]: 0.75,
      [TaxonomyClass.M]: 0.10,
    },
    expectedTotalFraction: 0.35,
    tolerance: 0.25,
    minCount: 100,
  },
  {
    label: 'middle-belt',
    minAu: 2.5,
    maxAu: 2.82,
    expectedTaxonomyShare: {
      [TaxonomyClass.C]: 0.45,
      [TaxonomyClass.S]: 0.40,
      [TaxonomyClass.M]: 0.15,
    },
    expectedTotalFraction: 0.35,
    tolerance: 0.25,
    minCount: 100,
  },
  {
    label: 'outer-belt',
    minAu: 2.82,
    maxAu: 3.28,
    expectedTaxonomyShare: {
      [TaxonomyClass.C]: 0.80,
      [TaxonomyClass.S]: 0.12,
      [TaxonomyClass.M]: 0.08,
    },
    expectedTotalFraction: 0.30,
    tolerance: 0.20,
    minCount: 100,
  },
];

function normalizeSpecCode(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().toUpperCase();
  return t.length > 0 ? t[0] : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isKnownTaxonomy(value: string | null | undefined): value is TaxonomyClass {
  return (
    value === TaxonomyClass.C ||
    value === TaxonomyClass.S ||
    value === TaxonomyClass.M ||
    value === TaxonomyClass.Unknown
  );
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function makeSeed(parts: Array<string | number | null | undefined>): number {
  let hash = 2166136261;
  for (const part of parts) {
    const text = part == null ? '' : String(part);
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function classifySpecTaxonomy(specCode: string | null): TaxonomyClass | null {
  if (!specCode) return null;
  return TAXONOMY_FROM_SPEC[specCode] ?? null;
}

function classifyFromSemiMajorAxis(aAu: number): TaxonomyClass {
  for (const bucket of TAXONOMY_FROM_AU) {
    if (aAu >= bucket.minAu && aAu < bucket.maxAu) return bucket.taxonomy;
  }
  return TaxonomyClass.Unknown;
}

export function resolveTaxonomy(input: TaxonomyResolverInput): {
  taxonomy: TaxonomyClass;
  evidence: TaxonomyResolvedRecord['taxonomyEvidence'];
} {
  const specT = normalizeSpecCode(input.specT);
  const specB = normalizeSpecCode(input.specB);
  const bySpec = classifySpecTaxonomy(specT) ?? classifySpecTaxonomy(specB);
  if (bySpec) {
    return {
      taxonomy: bySpec,
      evidence: classifySpecTaxonomy(specT) ? 'specT' : 'specB',
    };
  }

  const aAu = isFiniteNumber(input.semiMajorAxisAu) ? input.semiMajorAxisAu : null;
  if (aAu === null || aAu <= 0) {
    return { taxonomy: TaxonomyClass.Unknown, evidence: 'default' };
  }

  return {
    taxonomy: classifyFromSemiMajorAxis(aAu),
    evidence: 'semi-major-fallback',
  };
}

function resolveAlbedo(taxonomy: TaxonomyClass, fallbackSeed: number, fallback: number | null | undefined): number {
  if (isFiniteNumber(fallback) && (fallback as number) > 0 && (fallback as number) <= 1) {
    return clamp01(fallback as number);
  }
  const range = ALBEDO_RANGE_BY_TAXONOMY[taxonomy] ?? ALBEDO_RANGE_BY_TAXONOMY[TaxonomyClass.Unknown];
  const rng = mulberry32(fallbackSeed);
  const weighted = 0.2 + 0.6 * rng();
  return clamp01(range[0] + (range[1] - range[0]) * weighted);
}

function resolveMassClass(diameterKm: number | null | undefined): { class: MassClass; index: number } {
  const fallbackDiameter = isFiniteNumber(diameterKm) ? diameterKm : 1;
  const d = Math.abs(fallbackDiameter);
  for (const bucket of MASS_CLASS_LABELS) {
    if (d < bucket.maxDiameterKm) {
      return { class: bucket.cls, index: bucket.cls };
    }
  }
  return { class: MassClass.Giant, index: MassClass.Giant };
}

function resolveSelectionPriority(input: TaxonomyResolverInput): number {
  const aAu = isFiniteNumber(input.semiMajorAxisAu) ? input.semiMajorAxisAu : 2.8;
  const e = isFiniteNumber(input.eccentricity) ? input.eccentricity : 0;
  const diameterKm = isFiniteNumber(input.diameterKm) ? Math.max(0.001, input.diameterKm) : 1;
  const absMag = isFiniteNumber(input.absMag) ? input.absMag : 12.5;
  const sourceBonus = (() => {
    if (input.source === 'jpl') return 150;
    if (input.source === 'mpc') return 110;
    if (input.source === 'phase1') return 90;
    return 40;
  })();
  const brightnessBonus = Math.max(0, 12.5 - absMag) * 16;
  const orbitBonus = aAu >= 2 && aAu <= 3.5 ? 45 : 0;
  const sizeBonus = Math.min(70, Math.log10(Math.max(0.5, diameterKm)) * 18);
  const stabilityBonus = e < 0.35 ? 18 : Math.max(0, 18 - (e - 0.35) * 30);
  return Math.round(sourceBonus + brightnessBonus + orbitBonus + sizeBonus + stabilityBonus);
}

function resolvePriorityClass(selectionPriority: number): MissionPriorityClass {
  if (selectionPriority >= 260) return MissionPriorityClass.Critical;
  if (selectionPriority >= 210) return MissionPriorityClass.Priority;
  if (selectionPriority >= 170) return MissionPriorityClass.Standard;
  if (selectionPriority >= 120) return MissionPriorityClass.Background;
  return MissionPriorityClass.Archive;
}

export function resolveAsteroidProfile(input: TaxonomyResolverInput): TaxonomyResolvedRecord {
  const { taxonomy, evidence } = resolveTaxonomy(input);
  const seed = makeSeed([
    input.sourceId ?? '',
    input.semiMajorAxisAu,
    input.diameterKm,
    input.specB,
    input.specT,
    taxonomy,
  ]);
  const aAu = isFiniteNumber(input.semiMajorAxisAu) ? input.semiMajorAxisAu : 2.8;
  const materialClass = MATERIAL_CLASS_INDEX[taxonomy];
  const albedo = resolveAlbedo(taxonomy, seed, input.albedo);
  const mass = resolveMassClass(isFiniteNumber(input.diameterKm) ? input.diameterKm : null);
  const selectionPriority = resolveSelectionPriority({
    ...input,
    semiMajorAxisAu: aAu,
  });
  const missionClass = resolvePriorityClass(selectionPriority);

  return {
    ...input,
    taxonomy,
    taxonomyEvidence: evidence,
    materialClass,
    materialClassIndex: materialClass,
    albedo,
    albedoEvidence: isFiniteNumber(input.albedo) ? 'provided' : 'fallback',
    massClass: mass.class,
    massClassIndex: mass.index,
    missionClass,
    priorityClass: missionClass,
    selectionPriority,
    resolverSeed: seed,
  };
}

function initBinCounts(): Record<TaxonomyClass, number> {
  return {
    [TaxonomyClass.C]: 0,
    [TaxonomyClass.S]: 0,
    [TaxonomyClass.M]: 0,
    [TaxonomyClass.Unknown]: 0,
  };
}

function calcShare(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

function classifyBin(aAu: number, bin: SemiMajorAxisBin): boolean {
  return aAu >= bin.minAu && aAu < bin.maxAu;
}

export function validateSemiMajorAxisCoverage(
  records: readonly TaxonomyResolverInput[],
  bins: readonly SemiMajorAxisBin[] = DEFAULT_SEMI_MAJOR_AXIS_BINS
): SemiMajorAxisCoverageCheck {
  const binAccumulators = bins.map((bin) => ({
    ...bin,
    total: 0,
    taxonomyCount: initBinCounts(),
    issues: [] as string[],
  }));

  let inRange = 0;
  let outOfRange = 0;

  for (const record of records) {
    const aAu = isFiniteNumber(record.semiMajorAxisAu) ? record.semiMajorAxisAu as number : null;
    if (aAu === null) {
      outOfRange += 1;
      continue;
    }

    const taxonomy = isKnownTaxonomy(record.taxonomy)
      ? record.taxonomy
      : resolveTaxonomy(record).taxonomy;

    const matchingBin = binAccumulators.find((bin) => classifyBin(aAu, bin));
    if (!matchingBin) {
      outOfRange += 1;
      continue;
    }

    matchingBin.total += 1;
    matchingBin.taxonomyCount[taxonomy] += 1;
    inRange += 1;
  }

  const rangedTotal = inRange;
  const issues: string[] = [];
  const binResults: SemiMajorAxisBinResult[] = [];
  let allPassed = true;

  for (const bin of binAccumulators) {
    const share = {
      [TaxonomyClass.C]: calcShare(bin.taxonomyCount[TaxonomyClass.C], bin.total),
      [TaxonomyClass.S]: calcShare(bin.taxonomyCount[TaxonomyClass.S], bin.total),
      [TaxonomyClass.M]: calcShare(bin.taxonomyCount[TaxonomyClass.M], bin.total),
      [TaxonomyClass.Unknown]: calcShare(bin.taxonomyCount[TaxonomyClass.Unknown], bin.total),
    };
    const expectedTaxonomyShare = { ...bin.expectedTaxonomyShare } as Partial<Record<TaxonomyClass, number>>;
    const tolerance = bin.tolerance ?? 0.20;
    const expectedTotal = bin.expectedTotalFraction == null
      ? null
      : Math.round(rangedTotal * bin.expectedTotalFraction);
    const passed = (() => {
      let ok = true;

      if (bin.minCount != null && bin.total < bin.minCount) {
        const msg = `[${bin.label}] Underrepresented: total=${bin.total}, required>=${bin.minCount}`;
        bin.issues.push(msg);
        issues.push(msg);
        ok = false;
      }

      if (expectedTotal !== null && bin.total < expectedTotal * 0.6) {
        const msg = `[${bin.label}] Coverage dropped below expected total; got ${bin.total}, expected around ${expectedTotal}`;
        bin.issues.push(msg);
        issues.push(msg);
        ok = false;
      }

      for (const taxonomyKey of Object.keys(expectedTaxonomyShare) as Array<keyof typeof expectedTaxonomyShare>) {
        const expected = expectedTaxonomyShare[taxonomyKey];
        if (expected == null || !Number.isFinite(expected)) continue;
        const actual = share[taxonomyKey] ?? 0;
        const drift = Math.abs(actual - expected);
        if (drift > tolerance) {
          const msg = `[${bin.label}] ${taxonomyKey} taxonomy ratio drift > ${tolerance}: actual=${actual.toFixed(3)}, expected=${expected.toFixed(3)}`;
          bin.issues.push(msg);
          issues.push(msg);
          ok = false;
        }
      }
      return ok;
    })();

    allPassed = allPassed && passed;

    binResults.push({
      label: bin.label,
      minAu: bin.minAu,
      maxAu: bin.maxAu,
      total: bin.total,
      expectedTotal,
      taxonomyCount: { ...bin.taxonomyCount },
      taxonomyShare: share,
      expectedTaxonomyShare,
      tolerance,
      passed,
      issues: [...bin.issues],
    });
  }

  const outOfRangeRate = records.length === 0 ? 0 : outOfRange / records.length;
  if (outOfRangeRate > 0.25) {
    const msg = `High number of records out of main-belt bins: ${outOfRange} / ${records.length} (${(outOfRangeRate * 100).toFixed(1)}%).`;
    issues.push(msg);
    allPassed = false;
  }

  if (binResults.some((bin) => bin.total === 0)) {
    allPassed = false;
  }

  return {
    totalInput: records.length,
    inRangedCount: inRange,
    outOfRangeCount: outOfRange,
    bins: binResults,
    passed: allPassed,
    issues,
  };
}
