import {
  AsteroidDef,
  AsteroidTaxonomy,
  colorForTaxonomy
} from './asteroidBelt';
import { readAsteroidCatalogBinary, type PackedAsteroidRecord } from '../data/asteroidCatalogLoader';

export type Phase1TaxonomyCode = 'C' | 'S' | 'M' | 'unknown';

export interface Phase1CatalogLoadOptions {
  url?: string;
  metaUrl?: string;
  maxRecords?: number;
  loadLatencyBudgetMs?: number;
  /** Absolute network/body/hash deadline, shared by concurrent equivalent loads. */
  timeoutMs?: number;
  /** Bypass both completed and in-flight cache entries, e.g. for an explicit refresh. */
  cache?: boolean;
}

export class Phase1CatalogLoadError extends Error {
  constructor(public readonly code: 'timeout' | 'network-failed' | 'binary-invalid' | 'capacity-exceeded', message: string) {
    super(message);
    this.name = 'Phase1CatalogLoadError';
  }
}

const inFlightLoads = new Map<string, Promise<Phase1CatalogLoadResult>>();
const completedLoads = new Map<string, { result: Phase1CatalogLoadResult; expires: number }>();
const MAX_ACTIVE_LOADS = 4;
const MAX_COMPLETED_LOADS = 2;
const CACHE_LIFETIME_MS = 300_000;
let activeLoads = 0;

export interface Phase1CatalogMeta {
  version?: number;
  generated_utc?: string;
  generatedUtc?: string;
  source_rows?: number;
  sourceRows?: number;
  stored_count?: number;
  storedCount?: number;
  checksum?: string;
  checksum_algorithm?: string;
  checksum_sha256?: string;
  checksum_algorithm_sha256?: string;
  sha256?: string;
  fileChecksum?: string;
  metaChecksum?: string;
  [key: string]: unknown;
}

export type Phase1CatalogRejectionCode =
  | 'metadata-missing'
  | 'metadata-fetch-failed'
  | 'metadata-invalid'
  | 'sha256-missing'
  | 'sha256-invalid'
  | 'sha256-unavailable'
  | 'sha256-mismatch'
  | 'unsupported-catalog-version'
  | 'row-count-invalid'
  | 'taxonomy-incomplete';

export interface Phase1CatalogRejection {
  code: Phase1CatalogRejectionCode;
  message: string;
}

export interface Phase1CatalogAcceptanceItem {
  passed: boolean;
  code?: Phase1CatalogRejectionCode;
  reason?: string;
}

export interface Phase1CatalogMetadataAcceptance extends Phase1CatalogAcceptanceItem {
  status: 'loaded' | 'missing' | 'fetch-failed' | 'invalid';
  httpStatus?: number;
}

export interface Phase1CatalogRowAcceptance {
  sourceCount: number;
  parsedCount: number;
  requestedMax: number;
  capped: boolean;
  metadataSourceRows?: number;
  metadataStoredCount?: number;
  passed: boolean;
  code?: Phase1CatalogRejectionCode;
  reason?: string;
}

export interface Phase1CatalogTaxonomyAcceptance {
  counts: Record<Phase1TaxonomyCode, number>;
  present: Phase1TaxonomyCode[];
  expected: Phase1TaxonomyCode[];
  /** Fraction of rows assignable to a coarse visual family; not class diversity. */
  completeness: number;
  passed: boolean;
  code?: Phase1CatalogRejectionCode;
  reason?: string;
}

export interface Phase1CatalogChecksumAcceptance {
  expected?: string;
  actual: string;
  enforced: boolean;
  passed: boolean;
  code?: Phase1CatalogRejectionCode;
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
  code?: Phase1CatalogRejectionCode;
  reason?: string;
}

export interface Phase1CatalogAcceptance {
  metadata: Phase1CatalogMetadataAcceptance;
  version: Phase1CatalogVersionAcceptance;
  rows: Phase1CatalogRowAcceptance;
  taxonomy: Phase1CatalogTaxonomyAcceptance;
  checksum: Phase1CatalogChecksumAcceptance;
  latency: Phase1CatalogLatencyAcceptance;
  rejections: Phase1CatalogRejection[];
  passed: boolean;
}

export interface Phase1Bundle {
  /** Integrity acceptance never certifies scientific fidelity. */
  fidelity: { status: 'not-independently-validated' };
  population: {
    policy: 'largest-first-prefix';
    representative: false;
    storedCount: number;
    selectedCount: number;
    fraction: number;
  };
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
  rejectionReasons: Phase1CatalogRejection[];
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
  [AsteroidTaxonomy.M]: 'M',
  [AsteroidTaxonomy.Unknown]: 'unknown'
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

function isSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/u.test(value);
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
  const taxonomy = taxonomyFromIndex(record.taxonomyIndex);
  const taxonomySeed = buildOrbitSeed(aAu, index, taxonomy, record.meanAnomalyDeg);
  const safeE = clampRange(record.e, 0, 1);
  const safeDiameter = safePositiveOrbitNumber(record.diameterKm, 1.0);
  // ACBF zero is the missing-albedo sentinel. Appearance is carried by color,
  // separately from this source field; no inferred science is inserted here.
  const safeAlbedoFinal = Number.isFinite(record.albedo) && record.albedo > 0 && record.albedo <= 1
    ? record.albedo : null;
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

function taxonomyFromIndex(raw: number): AsteroidTaxonomy {
  const index = Math.round(raw);
  if (index === 1) return AsteroidTaxonomy.S;
  if (index === 2) return AsteroidTaxonomy.M;
  if (index === 0) return AsteroidTaxonomy.C;

  return AsteroidTaxonomy.Unknown;
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

async function checksumSHA256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = new Uint8Array(hashBuffer);
  let hex = '';
  for (let i = 0; i < hashArray.length; i += 1) {
    hex += hashArray[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function parseTaxonomyCounts(asteroids: readonly AsteroidDef[]): Phase1TaxonomyCounts {
  const counts: Phase1TaxonomyCounts = { C: 0, S: 0, M: 0, unknown: 0 };
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

interface ExpectedChecksum {
  value: string;
  algorithm: 'sha256';
}

interface ExpectedChecksumResolution {
  expected?: ExpectedChecksum;
  code?: 'sha256-missing' | 'sha256-invalid';
  reason?: string;
}

function extractExpectedChecksum(meta: Phase1CatalogMeta | undefined): ExpectedChecksumResolution {
  if (!meta) return {};
  const rec = meta as Record<string, unknown>;

  const declaredAlgorithm = rec.checksum_algorithm_sha256;
  if (
    declaredAlgorithm != null
    && (typeof declaredAlgorithm !== 'string'
      || declaredAlgorithm.trim().toLowerCase().replace('-', '') !== 'sha256')
  ) {
    return {
      code: 'sha256-invalid',
      reason: 'Metadata checksum_algorithm_sha256 must identify SHA-256.'
    };
  }

  const sha256Keys = ['checksum_sha256', 'checksumSha256', 'sha256', 'sha256_hex', 'sha256Hex'];
  for (const key of sha256Keys) {
    if (!(key in rec)) continue;
    const value = normalizeChecksum(rec[key]);
    if (value && isSha256Hex(value)) {
      return { expected: { value, algorithm: 'sha256' } };
    }
    return {
      code: 'sha256-invalid',
      reason: `Metadata field ${key} must contain exactly 64 hexadecimal SHA-256 characters.`
    };
  }

  return {
    code: 'sha256-missing',
    reason: 'Metadata must declare a SHA-256 checksum; FNV and unspecified hashes are not integrity substitutes.'
  };
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
  if (metaSourceRows != null && metaSourceRows < sourceCount) reasons.push(`meta.source_rows=${metaSourceRows} < sourceCount=${sourceCount}`);
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
    code: passed ? undefined : 'row-count-invalid',
    reason: passed ? undefined : reasons.join('; ')
  };
}

function buildTaxonomyAcceptance(asteroids: readonly AsteroidDef[]): Phase1CatalogTaxonomyAcceptance {
  const counts = parseTaxonomyCounts(asteroids);
  const present = EXPECTED_TAXONOMIES.filter((code) => counts[code] > 0);
  const completeness = asteroids.length ? (asteroids.length - counts.unknown) / asteroids.length : 0;

  const reasons: string[] = [];
  // Family diversity is descriptive telemetry, never an integrity requirement:
  // an honest small/largest-first prefix may contain only unknown taxonomy.
  if (!asteroids.length) reasons.push('no asteroid rows');

  const passed = reasons.length === 0;
  return {
    counts,
    present,
    expected: [...EXPECTED_TAXONOMIES],
    completeness,
    passed,
    code: passed ? undefined : 'taxonomy-incomplete',
    reason: passed ? undefined : reasons.join('; ')
  };
}

function buildChecksumAcceptance(
  metadataAcceptance: Phase1CatalogMetadataAcceptance,
  resolution: ExpectedChecksumResolution,
  actual: string,
  checksumFailureReason?: string
): Phase1CatalogChecksumAcceptance {
  if (!metadataAcceptance.passed) {
    return {
      expected: undefined,
      actual,
      enforced: true,
      passed: false,
      reason: 'A trusted SHA-256 checksum cannot be established without valid metadata.'
    };
  }

  if (resolution.code) {
    return {
      expected: undefined,
      actual,
      enforced: true,
      passed: false,
      code: resolution.code,
      reason: resolution.reason
    };
  }

  const expected = resolution.expected;
  if (!expected) {
    return {
      expected: undefined,
      actual,
      enforced: true,
      passed: false,
      code: 'sha256-missing',
      reason: 'Metadata must declare a valid SHA-256 checksum.'
    };
  }

  if (checksumFailureReason) {
    return {
      expected: expected.value,
      actual,
      enforced: true,
      passed: false,
      code: 'sha256-unavailable',
      reason: checksumFailureReason
    };
  }

  const matched = actual === expected.value;
  return {
    expected: expected.value,
    actual,
    enforced: true,
    passed: matched,
    code: matched ? undefined : 'sha256-mismatch',
    reason: matched
      ? undefined
      : `SHA-256 mismatch: expected=${expected.value}, actual=${actual}`
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
    metadataAcceptance: Phase1CatalogMetadataAcceptance;
    checksumResolution: ExpectedChecksumResolution;
    checksumActual: string;
    checksumFailureReason?: string;
  }
): Phase1Bundle['acceptance'] {
  const catalogSignature = `${parsed.catalogMagic}-v${parsed.catalogVersion}`;
  const expected = EXPECTED_PHASE1_VERSION.includes(catalogSignature);
  const version = {
    expected: EXPECTED_PHASE1_VERSION.join(', '),
    actual: catalogSignature,
    passed: expected,
    code: expected ? undefined : 'unsupported-catalog-version' as const,
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
    options.metadataAcceptance,
    options.checksumResolution,
    options.checksumActual,
    options.checksumFailureReason
  );
  const latency = buildLatencyAcceptance(options.loadMs, options.latencyBudgetMs);
  const rejectionItems: Phase1CatalogAcceptanceItem[] = [
    options.metadataAcceptance,
    version,
    rows,
    taxonomy,
    checksum
  ];
  const rejections = rejectionItems.flatMap((item) => (
    !item.passed && item.code && item.reason
      ? [{ code: item.code, message: item.reason }]
      : []
  ));
  return {
    metadata: options.metadataAcceptance,
    version,
    rows,
    taxonomy,
    checksum,
    latency,
    rejections,
    passed: options.metadataAcceptance.passed && version.passed && rows.passed && taxonomy.passed && checksum.passed
  };
}

interface Phase1CatalogMetadataLoadResult {
  metadata?: Phase1CatalogMeta;
  acceptance: Phase1CatalogMetadataAcceptance;
}

async function loadPhase1CatalogMetadata(
  url?: string,
  signal?: AbortSignal
): Promise<Phase1CatalogMetadataLoadResult> {
  if (!url) {
    return {
      acceptance: {
        status: 'missing',
        passed: false,
        code: 'metadata-missing',
        reason: 'Phase-1 catalog metadata URL is missing.'
      }
    };
  }

  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-cache', signal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      acceptance: {
        status: 'fetch-failed',
        passed: false,
        code: 'metadata-fetch-failed',
        reason: `Failed to fetch Phase-1 catalog metadata: ${message}`
      }
    };
  }

  if (!response.ok) {
    const missing = response.status === 404 || response.status === 410;
    return {
      acceptance: {
        status: missing ? 'missing' : 'fetch-failed',
        httpStatus: response.status,
        passed: false,
        code: missing ? 'metadata-missing' : 'metadata-fetch-failed',
        reason: `Failed to fetch Phase-1 catalog metadata (${response.status}): ${response.statusText}`
      }
    };
  }

  try {
    const payload: unknown = await response.json();
    if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
      return {
        metadata: payload as Phase1CatalogMeta,
        acceptance: {
          status: 'loaded',
          passed: true
        }
      };
    }
  } catch {
    // Returned below as a typed metadata-integrity rejection.
  }

  return {
    acceptance: {
      status: 'invalid',
      passed: false,
      code: 'metadata-invalid',
      reason: 'Phase-1 catalog metadata is not a valid JSON object.'
    }
  };
}

function parseOrbitCatalog(
  buffer: ArrayBuffer,
  maxCount: number
): ParsedPhase1Catalog {
  if (buffer.byteLength < HEADER_SIZE_BYTES) {
    throw new Error('Phase-1 binary payload is too small for header.');
  }
  if (buffer.byteLength > HEADER_SIZE_BYTES + 100_000 * 48 || new DataView(buffer).getUint32(8, true) > 100_000) {
    throw new Error('Phase-1 catalog exceeds the 100,000-row resource limit.');
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

async function fetchPhase1AsteroidCatalog(
  options: Phase1CatalogLoadOptions,
  signal: AbortSignal
): Promise<Phase1CatalogLoadResult> {
  const url = options.url ?? PHASE1_DEFAULT_URL;
  const metaUrl = options.metaUrl ?? PHASE1_DEFAULT_META_URL;
  const maxRecords = options.maxRecords ?? PHASE1_DEFAULT_MAX_RECORDS;
  const latencyBudgetMs = options.loadLatencyBudgetMs ?? PHASE1_LOAD_LATENCY_BUDGET_MS;
  const loadStarted = nowMs();

  const [binaryLoad, metadataLoad] = await Promise.all([
    fetch(url, { signal, cache: 'no-cache' }).then(async (response) => {
      // Consume the binary while metadata is loading. Retain HTTP/body errors
      // until metadata settles, preserving the existing error/deadline ordering
      // without leaving an early body rejection unhandled. Fetch rejection still
      // rejects Promise.all immediately, as it did before body reads overlapped.
      try {
        if (!response.ok) {
          throw new Error(`Failed to fetch phase-1 catalog (${response.status}): ${response.statusText}`);
        }
        return { ok: true as const, buffer: await response.arrayBuffer() };
      } catch (error) {
        return { ok: false as const, error };
      }
    }),
    loadPhase1CatalogMetadata(metaUrl, signal),
  ]);

  if (!binaryLoad.ok) throw binaryLoad.error;

  const buffer = binaryLoad.buffer;
  signal.throwIfAborted();
  let parsed: ParsedPhase1Catalog;
  try {
    parsed = parseOrbitCatalog(buffer, maxRecords);
  } catch (error) {
    throw new Phase1CatalogLoadError('binary-invalid', error instanceof Error ? error.message : String(error));
  }
  const metadata = metadataLoad.metadata;
  const checksumResolution = extractExpectedChecksum(metadata);
  let checksumActual = '';
  let checksumFailureReason: string | undefined;
  try {
    checksumActual = await checksumSHA256(buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checksumFailureReason = `Unable to compute SHA-256 for the Phase-1 catalog: ${message}`;
  }
  const loadMs = nowMs() - loadStarted;
  signal.throwIfAborted();
  const acceptance = buildAcceptance(parsed, {
    requestedMax: maxRecords,
    metadata,
    loadMs,
    latencyBudgetMs,
    metadataAcceptance: metadataLoad.acceptance,
    checksumResolution,
    checksumActual,
    checksumFailureReason
  });

  const rowCount = acceptance.rows;
  const taxonomyCheck = acceptance.taxonomy;

  return {
    fidelity: { status: 'not-independently-validated' },
    population: {
      policy: 'largest-first-prefix',
      representative: false,
      storedCount: parsed.sourceCount,
      selectedCount: parsed.asteroids.length,
      fraction: parsed.sourceCount ? parsed.asteroids.length / parsed.sourceCount : 0,
    },
    asteroids: parsed.asteroids,
    sourceCount: parsed.sourceCount,
    loadedCount: parsed.asteroids.length,
    catalogVersion: parsed.catalogVersion,
    acceptance,
    checksumActual,
    checksumExpected: checksumResolution.expected?.value,
    rowCount,
    taxonomyCheck,
    rejectionReasons: acceptance.rejections,
    accepted: acceptance.passed,
    loadMs,
    loadLatencyBudgetMs: latencyBudgetMs,
    meta: metadata
  };
}

export async function loadPhase1AsteroidCatalog(
  options: Phase1CatalogLoadOptions = {}
): Promise<Phase1CatalogLoadResult> {
  const maxRecords = options.maxRecords ?? PHASE1_DEFAULT_MAX_RECORDS;
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isInteger(maxRecords) || maxRecords <= 0 || maxRecords > 100_000) {
    throw new RangeError('maxRecords must be an integer from 1 to 100000');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
    throw new RangeError('timeoutMs must be positive and at most 60000');
  }
  const key = JSON.stringify([
    options.url ?? PHASE1_DEFAULT_URL, options.metaUrl ?? PHASE1_DEFAULT_META_URL,
    maxRecords, timeoutMs, options.loadLatencyBudgetMs ?? PHASE1_LOAD_LATENCY_BUDGET_MS,
  ]);
  const useCache = options.cache !== false;
  if (useCache) {
    const completed = completedLoads.get(key);
    if (completed && completed.expires > Date.now()) return completed.result;
    completedLoads.delete(key);
    const pending = inFlightLoads.get(key);
    if (pending) return pending;
  }
  if (activeLoads >= MAX_ACTIVE_LOADS) {
    throw new Phase1CatalogLoadError('capacity-exceeded', 'Four catalog loads are already in flight.');
  }
  activeLoads += 1;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Phase1CatalogLoadError('timeout', `Catalog load exceeded ${timeoutMs} ms.`);
      reject(error);
      controller.abort(error);
    }, timeoutMs);
  });
  // Promise.race bounds the caller even if a transport/body ignores abort.
  // Only this raced result can enter the completed cache; late success cannot.
  const pending = Promise.race([fetchPhase1AsteroidCatalog(options, controller.signal), deadline])
    .then(result => {
      if (useCache && result.accepted) {
        if (completedLoads.size >= MAX_COMPLETED_LOADS) {
          const oldest = completedLoads.keys().next().value;
          if (oldest !== undefined) completedLoads.delete(oldest);
        }
        completedLoads.set(key, { result, expires: Date.now() + CACHE_LIFETIME_MS });
      }
      return result;
    })
    .catch((error: unknown) => {
      controller.abort();
      if (error instanceof Phase1CatalogLoadError) throw error;
      throw new Phase1CatalogLoadError('network-failed', error instanceof Error ? error.message : String(error));
    })
    .finally(() => {
      clearTimeout(timer);
      activeLoads -= 1;
      if (useCache) inFlightLoads.delete(key);
    });
  if (useCache) inFlightLoads.set(key, pending);
  return pending;
}

export const PHASE1_CATALOG_URL = PHASE1_DEFAULT_URL;
export const PHASE1_CATALOG_META_URL = PHASE1_DEFAULT_META_URL;
export const PHASE1_BELT_LIMIT = PHASE1_DEFAULT_MAX_RECORDS;
