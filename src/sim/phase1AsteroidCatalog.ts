import {
  AsteroidDef,
  AsteroidTaxonomy,
  colorForTaxonomy,
  albedoForTaxonomy
} from './asteroidBelt';
import { readAsteroidCatalogBinary, type PackedAsteroidRecord } from '../data/asteroidCatalogLoader';

export type Phase1TaxonomyCode = 'C' | 'S' | 'M';

export interface Phase1CatalogLoadOptions {
  url?: string;
  metaUrl?: string;
  maxRecords?: number;
  loadLatencyBudgetMs?: number;
}

export interface Phase1CatalogMeta {
  version?: number;
  generated_utc?: string;
  generatedUtc?: string;
  source_rows?: number;
  sourceRows?: number;
  stored_count?: number;
  storedCount?: number;
  checksum?: string;
  sha256?: string;
  fileChecksum?: string;
  metaChecksum?: string;
  [key: string]: unknown;
}

export interface Phase1CatalogAcceptanceItem {
  passed: boolean;
  reason?: string;
}

export interface Phase1CatalogRowAcceptance {
  sourceCount: number;
  parsedCount: number;
  requestedMax: number;
  capped: boolean;
  metadataSourceRows?: number;
  metadataStoredCount?: number;
  passed: boolean;
  reason?: string;
}

export interface Phase1CatalogTaxonomyAcceptance {
  counts: Record<Phase1TaxonomyCode, number>;
  present: Phase1TaxonomyCode[];
  expected: Phase1TaxonomyCode[];
  completeness: number;
  passed: boolean;
  reason?: string;
}

export interface Phase1CatalogChecksumAcceptance {
  expected?: string;
  actual: string;
  enforced: boolean;
  passed: boolean;
  reason?: string;
}

export interface Phase1CatalogLatencyAcceptance {
  loadMs: number;
  budgetMs: number;
  passed: boolean;
  reason?: string;
}

export interface Phase1CatalogVersionAcceptance {
  expected: string;
  actual: string;
  passed: boolean;
  reason?: string;
}

export interface Phase1CatalogAcceptance {
  version: Phase1CatalogVersionAcceptance;
  rows: Phase1CatalogRowAcceptance;
  taxonomy: Phase1CatalogTaxonomyAcceptance;
  checksum: Phase1CatalogChecksumAcceptance;
  latency: Phase1CatalogLatencyAcceptance;
  passed: boolean;
}

export interface Phase1Bundle {
  asteroids: AsteroidDef[];
  sourceCount: number;
  loadedCount: number;
  catalogVersion: number;
  meta?: Phase1CatalogMeta;
  accepted: boolean;
  acceptance: Phase1CatalogAcceptance;
  loadMs: number;
  loadLatencyBudgetMs: number;
  checksumActual: string;
  checksumExpected?: string;
  rowCount: Phase1CatalogRowAcceptance;
  taxonomyCheck: Phase1CatalogTaxonomyAcceptance;
}

export interface Phase1CatalogLoadResult extends Phase1Bundle { }

interface ParsedPhase1Catalog {
  asteroids: AsteroidDef[];
  sourceCount: number;
  catalogVersion: number;
  catalogMagic: string;
}

type Phase1TaxonomyCounts = Record<Phase1TaxonomyCode, number>;

const PHASE1_DEFAULT_URL = '/data/asteroid-phase1/asteroid_phase1_main_100000.bin';
const PHASE1_DEFAULT_META_URL = '/data/asteroid-phase1/asteroid_phase1_main_100000.meta.json';
const PHASE1_DEFAULT_MAX_RECORDS = 15_000;
export const PHASE1_LOAD_LATENCY_BUDGET_MS = 2_000;
const ASPH_MAGIC = 'ASPH';
const ACBF_MAGIC = 'ACBF';
const HEADER_SIZE_BYTES = 12;
const EXPECTED_PHASE1_VERSION = ['ASPH-v1', 'ASPH-v2', 'ACBF-v1'];
const EXPECTED_TAXONOMIES: readonly Phase1TaxonomyCode[] = ['C', 'S', 'M'];
const DEFAULT_PHASE1_EPOCH_JD = 2_451_545.0;

const TAXONOMY_LABEL_BY_VALUE: Record<AsteroidTaxonomy, Phase1TaxonomyCode> = {
  [AsteroidTaxonomy.C]: 'C',
  [AsteroidTaxonomy.S]: 'S',
  [AsteroidTaxonomy.M]: 'M'
};

function nowMs(): number {
  return typeof performance === 'object' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function normalizeChecksum(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized.length) return undefined;
  return normalized.startsWith('0x') ? normalized.slice(2) : normalized;
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

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function buildOrbitSeed(aAu: number, i: number, taxonomy: AsteroidTaxonomy, anomalyDeg: number): number {
  return (Math.trunc(aAu * 100_000) ^ (i * 97) ^ (Math.trunc(anomalyDeg * 100))) >>> 0;
}

function buildPaletteColor(taxonomy: AsteroidTaxonomy, seed: number): number {
  const baseColor = makeColor(taxonomy, seed);
  return Number.isFinite(baseColor) ? baseColor : colorForTaxonomy(taxonomy, mulberry32(seed + 1));
}

function safeOrbitNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function safePositiveOrbitNumber(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function safePeriodDays(value: number, fallbackAu: number): number {
  if (!Number.isFinite(value) || value <= 0) return 365.25 * Math.pow(fallbackAu, 1.5);
  return value;
}

interface SourceOrbitRecord {
  sourceIdRaw: number;
  epochJd: number;
  aAu: number;
  e: number;
  iDeg: number;
  ascendingNodeDeg: number;
  argPeriapsisDeg: number;
  meanAnomalyDeg: number;
  periodDays: number;
  diameterKm: number;
  albedo: number;
  taxonomyIndex: number;
}

function toAsteroidDef(record: SourceOrbitRecord, index: number): AsteroidDef {
  const aAu = safePositiveOrbitNumber(record.aAu, 2.8);
  const taxonomy = taxonomyFromIndex(record.taxonomyIndex, aAu);
  const taxonomySeed = buildOrbitSeed(aAu, index, taxonomy, record.meanAnomalyDeg);
  const safeE = clampRange(record.e, 0, 1);
  const safeDiameter = safePositiveOrbitNumber(record.diameterKm, 1.0);
  const safeAlbedo = safeOrbitNumber(record.albedo, albedoForTaxonomy(taxonomy, mulberry32(taxonomySeed + 2)));
  const safeAlbedoFinal = safeAlbedo <= 0 ? albedoForTaxonomy(taxonomy, mulberry32(taxonomySeed + 3)) : safeAlbedo;
  const color = buildPaletteColor(taxonomy, taxonomySeed);

  return {
    orbit: {
      epochJd: safeOrbitNumber(record.epochJd, DEFAULT_PHASE1_EPOCH_JD),
      aAu,
      e: safeE,
      iDeg: safeOrbitNumber(record.iDeg, 0),
      ascendingNodeDeg: safeOrbitNumber(record.ascendingNodeDeg, 0),
      argPeriapsisDeg: safeOrbitNumber(record.argPeriapsisDeg, 0),
      meanAnomalyDeg: safeOrbitNumber(record.meanAnomalyDeg, 0),
      periodDays: safePeriodDays(record.periodDays, aAu),
    },
    taxonomy,
    diameterKm: safeDiameter,
    albedo: safeAlbedoFinal,
    color,
    irregularity: irregularityFromDiameter(safeDiameter),
    sourceId: String(record.sourceIdRaw),
  };
}

function parseAcbfRecord(record: PackedAsteroidRecord, index: number): AsteroidDef {
  return toAsteroidDef({
    sourceIdRaw: record.sourceId,
    epochJd: record.epochJd,
    aAu: record.aAu,
    e: record.e,
    iDeg: record.iDeg,
    ascendingNodeDeg: record.ascendingNodeDeg,
    argPeriapsisDeg: record.argPeriapsisDeg,
    meanAnomalyDeg: record.meanAnomalyDeg,
    periodDays: record.periodDays,
    diameterKm: record.diameterKm,
    albedo: record.albedo,
    taxonomyIndex: record.taxonomyIndex,
  }, index);
}

interface ParsedAsphRecord {
  version: number;
  sourceIdRaw: number;
  epochJd: number;
  aAu: number;
  e: number;
  iDeg: number;
  ascendingNodeDeg: number;
  argPeriapsisDeg: number;
  meanAnomalyDeg: number;
  periodDays: number;
  diameterKm: number;
  albedo: number;
  taxonomyIndex: number;
}

function parseAsphRecord(payload: DataView, dataOffset: number, index: number, version: number): ParsedAsphRecord {
  const read = (offset: number) => payload.getFloat32(offset, true);
  const sourceIdRaw = version === 2 ? payload.getUint32(dataOffset, true) : index + 1;
  const baseOffset = version === 2 ? dataOffset + 4 : dataOffset;
  const epochJd = read(baseOffset);
  const aAu = read(baseOffset + 4);
  const e = read(baseOffset + 8);
  const iDeg = read(baseOffset + 12);
  const ascendingNodeDeg = read(baseOffset + 16);
  const argPeriapsisDeg = read(baseOffset + 20);
  const meanAnomalyDeg = read(baseOffset + 24);
  const periodDays = read(baseOffset + 28);
  const diameterKm = read(baseOffset + 32);
  const albedo = read(baseOffset + 36);
  const taxonomyIndex = read(baseOffset + 40);

  return {
    version,
    sourceIdRaw,
    epochJd,
    aAu,
    e,
    iDeg,
    ascendingNodeDeg,
    argPeriapsisDeg,
    meanAnomalyDeg,
    periodDays,
    diameterKm,
    albedo,
    taxonomyIndex,
  };
}

function taxonomyFromIndex(raw: number, aAu: number): AsteroidTaxonomy {
  const index = Math.round(raw);
  if (index === 1) return AsteroidTaxonomy.S;
  if (index === 2) return AsteroidTaxonomy.M;
  if (index === 0) return AsteroidTaxonomy.C;

  if (aAu < 2.5) return AsteroidTaxonomy.S;
  if (aAu > 2.7) return AsteroidTaxonomy.C;
  return AsteroidTaxonomy.M;
}

function irregularityFromDiameter(diameterKm: number): number {
  if (diameterKm > 200) return 0.02 + Math.min(0.05, (diameterKm - 200) / 40_000);
  if (diameterKm > 50) return 0.05 + Math.min(0.15, Math.sqrt(diameterKm - 50) / 60);
  return 0.10 + Math.min(0.30, Math.sqrt(diameterKm) / 20);
}

function makeColor(taxonomy: AsteroidTaxonomy, seed: number): number {
  const rng = mulberry32(seed);
  return colorForTaxonomy(taxonomy, rng);
}

function checksumFNV1a32(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hash = 0x811c9dc5;

  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}

function parseTaxonomyCounts(asteroids: readonly AsteroidDef[]): Phase1TaxonomyCounts {
  const counts: Phase1TaxonomyCounts = { C: 0, S: 0, M: 0 };
  for (const asteroid of asteroids) {
    const label = TAXONOMY_LABEL_BY_VALUE[asteroid.taxonomy];
    if (counts[label] == null) continue;
    counts[label] += 1;
  }
  return counts;
}

function extractMetaNumber(meta: Phase1CatalogMeta | undefined, keys: string[]): number | undefined {
  if (!meta) return undefined;
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }
  return undefined;
}

function extractExpectedChecksum(meta: Phase1CatalogMeta | undefined): string | undefined {
  if (!meta) return undefined;
  const candidates: Array<unknown> = [
    meta.checksum,
    meta.sha256,
    meta.fileChecksum,
    meta.metaChecksum,
    (meta as Record<string, unknown>).checksumSha256,
    (meta as Record<string, unknown>).checksum_sha256,
    (meta as Record<string, unknown>).sha256_hex,
    (meta as Record<string, unknown>).sha256Hex,
    (meta as Record<string, unknown>).file_hash,
    (meta as Record<string, unknown>).catalogChecksum,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeChecksum(candidate);
    if (normalized) return normalized;
  }
  return undefined;
}

function buildRowAcceptance(
  sourceCount: number,
  parsedCount: number,
  requestedMax: number,
  meta: Phase1CatalogMeta | undefined
): Phase1CatalogRowAcceptance {
  const metaSourceRows = extractMetaNumber(meta, ['source_rows', 'sourceRows']);
  const metaStoredCount = extractMetaNumber(meta, ['stored_count', 'storedCount']);
  const capped = sourceCount > requestedMax;
  const parsedMatchesExpectation = parsedCount === Math.min(requestedMax, sourceCount);
  const reasons: string[] = [];

  if (sourceCount <= 0) reasons.push('sourceCount=0');
  if (parsedCount <= 0) reasons.push('parsedCount=0');
  if (!parsedMatchesExpectation) reasons.push(`parsedCount ${parsedCount} != min(requestedMax, sourceCount)=${Math.min(requestedMax, sourceCount)}`);
  if (metaSourceRows != null && metaSourceRows !== sourceCount) reasons.push(`meta.source_rows=${metaSourceRows} != sourceCount=${sourceCount}`);
  if (metaStoredCount != null && metaStoredCount !== sourceCount) reasons.push(`meta.stored_count=${metaStoredCount} != sourceCount=${sourceCount}`);

  const passed = reasons.length === 0;
  return {
    sourceCount,
    parsedCount,
    requestedMax,
    capped,
    metadataSourceRows: metaSourceRows,
    metadataStoredCount: metaStoredCount,
    passed,
    reason: passed ? undefined : reasons.join('; ')
  };
}

function buildTaxonomyAcceptance(asteroids: readonly AsteroidDef[]): Phase1CatalogTaxonomyAcceptance {
  const counts = parseTaxonomyCounts(asteroids);
  const present = EXPECTED_TAXONOMIES.filter((code) => counts[code] > 0);
  const completeness = present.length / EXPECTED_TAXONOMIES.length;

  const reasons: string[] = [];
  for (const code of EXPECTED_TAXONOMIES) {
    if (counts[code] === 0) reasons.push(`missing taxonomy ${code}`);
  }
  if (!asteroids.length) reasons.push('no asteroid rows');

  const passed = reasons.length === 0;
  return {
    counts,
    present,
    expected: [...EXPECTED_TAXONOMIES],
    completeness,
    passed,
    reason: passed ? undefined : reasons.join('; ')
  };
}

function buildChecksumAcceptance(
  expected: string | undefined,
  actual: string,
  enforced: boolean
): Phase1CatalogChecksumAcceptance {
  if (!expected) {
    return {
      expected: undefined,
      actual,
      enforced: false,
      passed: true,
      reason: 'No checksum declared by metadata.'
    };
  }

  const matched = actual === expected;
  return {
    expected,
    actual,
    enforced,
    passed: matched,
    reason: matched ? undefined : `checksum mismatch expected=${expected}, actual=${actual}`
  };
}

function buildLatencyAcceptance(loadMs: number, budgetMs: number): Phase1CatalogLatencyAcceptance {
  const reason = loadMs <= budgetMs
    ? undefined
    : `loadMs=${loadMs.toFixed(1)} exceeded budgetMs=${budgetMs}`;
  return {
    loadMs,
    budgetMs,
    passed: loadMs <= budgetMs,
    reason
  };
}

function buildAcceptance(
  parsed: ParsedPhase1Catalog,
  options: {
    requestedMax: number;
    metadata: Phase1CatalogMeta | undefined;
    loadMs: number;
    latencyBudgetMs: number;
    checksumExpected?: string;
    checksumActual: string;
  }
): Phase1Bundle['acceptance'] {
  const catalogSignature = `${parsed.catalogMagic}-v${parsed.catalogVersion}`;
  const expected = EXPECTED_PHASE1_VERSION.includes(catalogSignature);
  const version = {
    expected: EXPECTED_PHASE1_VERSION.join(', '),
    actual: catalogSignature,
    passed: expected,
    reason: expected
      ? undefined
      : `Unsupported catalog signature ${catalogSignature} (expected ${EXPECTED_PHASE1_VERSION.join(', ')}).`
  };
  const rows = buildRowAcceptance(
    parsed.sourceCount,
    parsed.asteroids.length,
    options.requestedMax,
    options.metadata
  );
  const taxonomy = buildTaxonomyAcceptance(parsed.asteroids);
  const checksum = buildChecksumAcceptance(
    options.checksumExpected,
    options.checksumActual,
    options.checksumExpected != null
  );
  const latency = buildLatencyAcceptance(options.loadMs, options.latencyBudgetMs);
  return {
    version,
    rows,
    taxonomy,
    checksum,
    latency,
    passed: version.passed && rows.passed && taxonomy.passed && checksum.passed && latency.passed
  };
}

async function loadPhase1CatalogMetadata(
  url?: string
): Promise<Phase1CatalogMeta | undefined> {
  if (!url) return undefined;
  try {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) return undefined;
    const payload = await response.json();
    if (typeof payload === 'object' && payload !== null) {
      return payload as Phase1CatalogMeta;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function parseOrbitCatalog(
  buffer: ArrayBuffer,
  maxCount: number
): ParsedPhase1Catalog {
  if (buffer.byteLength < HEADER_SIZE_BYTES) {
    throw new Error('Phase-1 binary payload is too small for header.');
  }

  const headerBytes = new Uint8Array(buffer, 0, 4);
  const magic = String.fromCharCode(headerBytes[0], headerBytes[1], headerBytes[2], headerBytes[3]);
  if (magic === ASPH_MAGIC) {
    const header = new DataView(buffer);
    const version = header.getUint8(4);
    if (version !== 1 && version !== 2) {
      throw new Error(`Unsupported ASPH catalog version: ${version}`);
    }

    const stride = header.getUint8(5);
    const expectedStride = version === 2 ? 12 : 11;
    if (stride !== expectedStride) {
      throw new Error(`Unexpected ASPH stride: ${stride} (expected ${expectedStride})`);
    }

    const count = header.getUint32(8, true);
    const payloadStart = HEADER_SIZE_BYTES;
    const strideBytes = stride * 4;
    const expectedBytes = payloadStart + count * strideBytes;
    if (buffer.byteLength < expectedBytes) {
      throw new Error(`ASPH payload truncated: expected ${expectedBytes}, got ${buffer.byteLength}`);
    }

    const payload = new DataView(buffer, payloadStart, count * strideBytes);
    const limit = Math.max(0, Math.min(maxCount, count));
    const asteroids: AsteroidDef[] = [];
    asteroids.length = limit;

    for (let i = 0; i < limit; i += 1) {
      const baseOffset = i * strideBytes;
      const parsed = parseAsphRecord(payload, baseOffset, i, version);
      asteroids[i] = toAsteroidDef(parsed, i);
    }

    return {
      asteroids,
      sourceCount: count,
      catalogVersion: version,
      catalogMagic: ASPH_MAGIC
    };
  }

  if (magic === ACBF_MAGIC) {
    const parsed = readAsteroidCatalogBinary(buffer, { maxRecords: maxCount });
    const limit = Math.max(0, Math.min(maxCount, parsed.records.length));
    const asteroids = Array.from({ length: limit }, (_, i) => parseAcbfRecord(parsed.records[i], i));

    return {
      asteroids,
      sourceCount: parsed.header.recordCount,
      catalogVersion: parsed.header.version,
      catalogMagic: ACBF_MAGIC
    };
  }

  throw new Error(`Unknown phase-1 magic "${magic}". Expected ${ASPH_MAGIC} or ${ACBF_MAGIC}.`);
}

export async function loadPhase1AsteroidCatalog(
  options: Phase1CatalogLoadOptions = {}
): Promise<Phase1CatalogLoadResult> {
  const url = options.url ?? PHASE1_DEFAULT_URL;
  const metaUrl = options.metaUrl ?? PHASE1_DEFAULT_META_URL;
  const maxRecords = options.maxRecords ?? PHASE1_DEFAULT_MAX_RECORDS;
  const latencyBudgetMs = options.loadLatencyBudgetMs ?? PHASE1_LOAD_LATENCY_BUDGET_MS;
  const loadStarted = nowMs();

  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Failed to fetch phase-1 catalog (${response.status}): ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const parsed = parseOrbitCatalog(buffer, maxRecords);
  const metadata = await loadPhase1CatalogMetadata(metaUrl);
  const checksumActual = checksumFNV1a32(buffer);
  const checksumExpected = extractExpectedChecksum(metadata);
  const loadMs = nowMs() - loadStarted;
  const acceptance = buildAcceptance(parsed, {
    requestedMax: maxRecords,
    metadata,
    loadMs,
    latencyBudgetMs,
    checksumExpected,
    checksumActual
  });

  const rowCount = acceptance.rows;
  const taxonomyCheck = acceptance.taxonomy;
  const checksum = {
    expected: checksumExpected,
    actual: checksumActual,
    enforced: checksumExpected != null,
    passed: acceptance.checksum.passed,
    reason: acceptance.checksum.reason
  };

  return {
    asteroids: parsed.asteroids,
    sourceCount: parsed.sourceCount,
    loadedCount: parsed.asteroids.length,
    catalogVersion: parsed.catalogVersion,
    acceptance,
    checksumActual,
    checksumExpected,
    rowCount,
    taxonomyCheck,
    accepted: acceptance.passed,
    loadMs,
    loadLatencyBudgetMs: latencyBudgetMs,
    meta: metadata
  };
}

export const PHASE1_CATALOG_URL = PHASE1_DEFAULT_URL;
export const PHASE1_CATALOG_META_URL = PHASE1_DEFAULT_META_URL;
export const PHASE1_BELT_LIMIT = PHASE1_DEFAULT_MAX_RECORDS;
