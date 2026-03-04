#!/usr/bin/env node
/* eslint-disable no-console */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import process from 'node:process';

const VERSION = 'catalog-fetcher-ts-1.0.0';
const DEFAULT_OUTPUT_DIR = resolve(process.cwd(), 'public/data/asteroid-phase2');
const DEFAULT_RAW_BASENAME = 'asteroid_raw_snapshot.json';
const DEFAULT_META_BASENAME = 'asteroid_raw_snapshot.provenance.json';

const SBDB_QUERY_URL = 'https://ssd-api.jpl.nasa.gov/sbdb_query.api';
const SBDB_FIELDS = 'spkid,full_name,H,diameter,e,a,i,om,w,ma,per,epoch,class,spec_B,spec_T';
const MPCORB_URL = 'https://www.minorplanetcenter.net/iau/MPCORB/MPCORB.DAT';

const TAXONOMY_BY_CODE: Record<string, 'C' | 'S' | 'M'> = {
  B: 'C',
  C: 'C',
  D: 'C',
  E: 'M',
  F: 'C',
  G: 'C',
  K: 'S',
  L: 'S',
  M: 'M',
  O: 'C',
  P: 'C',
  Q: 'S',
  R: 'S',
  S: 'S',
  T: 'C',
  V: 'S',
  X: 'M',
  A: 'S',
};

type Source = 'jpl' | 'mpc';

interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
  retryableStatuses: number[];
}

interface CommandOptions {
  sources: Source[];
  jplMainLimit: number;
  jplNeoLimit: number;
  jplTrojanLimit: number;
  mpcLimit: number;
  mpcMaxAbsMag: number | null;
  requestIntervalMs: number;
  retryPolicy: RetryPolicy;
  cacheDir: string;
  cacheTtlHours: number;
  outputDir: string;
  rawOutputPath: string;
  metaOutputPath: string;
  intervalMinutes: number;
  maxRuns: number;
  dryRun: boolean;
}

interface FetchJob {
  id: string;
  source: Source;
  cadenceMinutes: number;
  description: string;
  run: () => Promise<FetchJobResult>;
}

interface FetchJobResult {
  source: Source;
  taskId: string;
  requestedAt: string;
  completedAt: string;
  query: string;
  sourceVersion: string;
  cacheHit: boolean;
  attempts: number;
  rawRows: number;
  normalizedRows: number;
  status: 'ok' | 'error';
  errorMessage?: string;
  responseBytes: number;
  responseChecksum: string;
  records: NormalizedAsteroidRecord[];
}

interface NormalizedOrbit {
  epochJd?: number;
  epochPacked?: string | null;
  aAu: number | null;
  e: number;
  iDeg: number;
  ascendingNodeDeg: number;
  argPeriapsisDeg: number;
  meanAnomalyDeg: number;
  periodDays: number;
  epochSource: Source | 'fallback';
}

interface NormalizedAsteroidRecord {
  id: string;
  source: Source;
  sourceBodyId: string;
  displayName: string;
  fullName: string | null;
  absMag: number | null;
  slopeG: number | null;
  diameterKm: number | null;
  albedo: number | null;
  taxonomy: {
    inferred: 'C' | 'S' | 'M';
    specB: string | null;
    specT: string | null;
  } | null;
  orbitClass: string | null;
  selectionPriority: number;
  orbit: NormalizedOrbit;
  raw: Record<string, unknown>;
  sourceMeta: {
    queryId: string;
    sourceVersion: string | null;
    normalizedAt: string;
  };
}

interface SnapshotArtifact {
  version: number;
  generatedAt: string;
  snapshotVersion: string;
  source: string;
  records: NormalizedAsteroidRecord[];
  counts: {
    total: number;
    bySource: Record<Source, number>;
    byOrbitClass: Record<string, number>;
    byTaxonomy: Record<'C' | 'S' | 'M', number>;
  };
  schema: {
    columns: string[];
    notes: string[];
  };
}

interface MetaArtifact {
  pipelineVersion: string;
  generatedAt: string;
  runTag: string;
  source: string;
  config: Record<string, unknown>;
  schedule: Array<{
    id: string;
    source: Source;
    cadenceMinutes: number;
    description: string;
    lastRunAt: string | null;
  }>;
  sourceRuns: Array<Omit<FetchJobResult, 'records'>>;
}

interface SbdbResponse {
  fields?: unknown;
  data?: unknown;
}

interface SbdbRawRow {
  [key: string]: unknown;
}

interface MpcParsedLine {
  designation: string;
  h: number | null;
  g: number | null;
  epoch: string | null;
  meanAnomalyDeg: number | null;
  argPeriapsisDeg: number | null;
  ascendingNodeDeg: number | null;
  inclinationDeg: number | null;
  eccentricity: number | null;
  meanMotionDegPerDay: number | null;
  semiMajorAxisAu: number | null;
  name: string | null;
  raw: {
    line: string;
  };
}

const DEFAULT_OPTIONS: CommandOptions = {
  sources: ['jpl', 'mpc'],
  jplMainLimit: 4000,
  jplNeoLimit: 800,
  jplTrojanLimit: 400,
  mpcLimit: 1200,
  mpcMaxAbsMag: 16.5,
  requestIntervalMs: 1100,
  retryPolicy: {
    maxAttempts: 4,
    initialDelayMs: 800,
    maxDelayMs: 6000,
    timeoutMs: 30000,
    retryableStatuses: [429, 500, 502, 503, 504],
  },
  cacheDir: resolve(process.cwd(), 'scripts/.cache/asteroid-fetcher'),
  cacheTtlHours: 24,
  outputDir: DEFAULT_OUTPUT_DIR,
  rawOutputPath: resolve(DEFAULT_OUTPUT_DIR, DEFAULT_RAW_BASENAME),
  metaOutputPath: resolve(DEFAULT_OUTPUT_DIR, DEFAULT_META_BASENAME),
  intervalMinutes: 0,
  maxRuns: 1,
  dryRun: false,
};

class RateLimiter {
  private nextAllowAt = 0;
  constructor(private readonly minIntervalMs: number) {}

  async wait(): Promise<void> {
    const now = Date.now();
    const delay = this.nextAllowAt - now;
    if (delay > 0) {
      await sleep(delay);
    }
    this.nextAllowAt = Date.now() + this.minIntervalMs;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const out = value.trim();
  return out.length > 0 ? out : null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sanitizeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

function cleanJplDisplayName(fullName: string): string {
  return fullName.replace(/\s*\([^)]*\)\s*$/u, '').trim();
}

function estimatePeriodDays(aAu: number | null, meanMotionDegPerDay: number | null): number {
  if (meanMotionDegPerDay !== null && meanMotionDegPerDay > 0 && Number.isFinite(meanMotionDegPerDay)) {
    return clamp(360.0 / meanMotionDegPerDay, 0.001, 2_000_000);
  }
  if (aAu !== null && aAu > 0 && Number.isFinite(aAu)) {
    return 365.25 * Math.pow(aAu, 1.5);
  }
  return 365.25;
}

function taxonomyFromSpec(specB: string | null, specT: string | null, semiMajorAxisAu: number | null): 'C' | 'S' | 'M' {
  for (const raw of [specT, specB]) {
    const code = normalizeString(raw)?.toUpperCase();
    const key = code ? code[0] : null;
    if (key && key in TAXONOMY_BY_CODE) {
      return TAXONOMY_BY_CODE[key];
    }
  }
  if (semiMajorAxisAu === null) return 'M';
  if (semiMajorAxisAu < 2.5) return 'S';
  if (semiMajorAxisAu > 2.7) return 'C';
  return 'M';
}

function orbitClassFromElements(aAu: number | null, eccentricity: number | null): string {
  if (aAu === null || !Number.isFinite(aAu)) return 'unknown';
  if (aAu < 1.3) return 'Atira';
  if (aAu < 1.666) return 'Aten';
  if (aAu < 2.0) return 'Apollo';
  if (aAu < 3.3) return 'main-belt';
  if (aAu < 4.8) return 'outer-main-belt';
  if (aAu < 5.2) return 'Jupiter-crosser';
  if (aAu < 30) return 'kuiper-proxy';
  return 'trans-neptunian';
}

function selectionPriority(source: Source, absMag: number | null, aAu: number | null, e: number | null): number {
  const sourceBias = source === 'jpl' ? 1000 : 700;
  const brightness = absMag === null ? 0 : Math.max(0, 12 - absMag) * 30;
  const beltBias = aAu !== null && aAu >= 2.0 && aAu <= 3.5 ? 80 : 0;
  const eccentricityPenalty = e !== null && e > 0.5 ? 20 : 0;
  return Math.round(sourceBias + brightness + beltBias + eccentricityPenalty);
}

function nowIso(): string {
  return new Date().toISOString();
}

function isFresh(modifiedAtMs: number, ttlHours: number): boolean {
  return (Date.now() - modifiedAtMs) / 3_600_000 <= ttlHours;
}

async function isCached(cachePath: string, ttlHours: number): Promise<string | null> {
  try {
    const fileInfo = await stat(cachePath);
    if (!isFresh(fileInfo.mtimeMs, ttlHours)) {
      return null;
    }
    return await readFile(cachePath, 'utf8');
  } catch (_err) {
    return null;
  }
}

async function fetchText(
  url: string,
  policy: RetryPolicy,
  limiter: RateLimiter,
  sourceLabel: string
): Promise<{ body: string; attempts: number; fromCache: boolean }> {
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    await limiter.wait();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), policy.timeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': `SolarSystemSim-CatalogFetcher/${VERSION}`,
          Accept: 'application/json, text/plain;q=0.9, */*;q=0.7',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        if (policy.retryableStatuses.includes(response.status) && attempt < policy.maxAttempts) {
          const waitMs = Math.min(policy.maxDelayMs, policy.initialDelayMs * Math.pow(2, attempt - 1));
          console.warn(`[${sourceLabel}] HTTP ${response.status}, retrying in ${waitMs}ms`);
          await sleep(waitMs + Math.random() * 1000);
          continue;
        }
        throw new Error(`HTTP ${response.status} ${response.statusText} ${body.slice(0, 200)}`);
      }

      const body = await response.text();
      return { body, attempts: attempt, fromCache: false };
    } catch (error) {
      if (attempt >= policy.maxAttempts) {
        throw error instanceof Error ? error : new Error(String(error));
      }
      const waitMs = Math.min(policy.maxDelayMs, policy.initialDelayMs * Math.pow(2, attempt - 1));
      await sleep(waitMs + Math.random() * 1000);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Unable to fetch ${url}`);
}

async function fetchTextWithCache(
  url: string,
  policy: RetryPolicy,
  limiter: RateLimiter,
  cacheFile: string,
  ttlHours: number,
  sourceLabel: string
): Promise<{ body: string; attempts: number; fromCache: boolean }> {
  const cached = await isCached(cacheFile, ttlHours);
  if (cached !== null) {
    return { body: cached, attempts: 0, fromCache: true };
  }

  const fetched = await fetchText(url, policy, limiter, sourceLabel);
  await mkdir(dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, fetched.body, 'utf8');
  return { ...fetched, fromCache: false };
}

function toSbdbRows(payload: SbdbResponse): Array<SbdbRawRow> {
  const rawFields = Array.isArray(payload.fields) ? payload.fields.map(String) : [];
  const fields = rawFields.map((field) => field.toLowerCase());
  if (!Array.isArray(payload.data)) {
    return [];
  }

  const rows = [];
  for (const row of payload.data) {
    if (!Array.isArray(row)) continue;
    const mapped: SbdbRawRow = {};
    for (let i = 0; i < fields.length; i += 1) {
      mapped[fields[i] ?? `col_${i}`] = (row as unknown[])[i];
    }
    rows.push(mapped);
  }
  return rows;
}

function normalizeJplRow(raw: SbdbRawRow, queryId: string, sourceVersion: string): NormalizedAsteroidRecord | null {
  const rawId = normalizeString(raw.spkid) || sanitizeId(normalizeString(raw.full_name) ?? 'unknown');
  if (!rawId) return null;

  const fullName = normalizeString(raw.full_name) ?? rawId;
  const absMag = normalizeNumber(raw.h);
  const aAu = normalizeNumber(raw.a);
  const e = normalizeNumber(raw.e);
  const iDeg = normalizeNumber(raw.i);
  const nodeDeg = normalizeNumber(raw.om);
  const periDeg = normalizeNumber(raw.w);
  const meanAnomalyDeg = normalizeNumber(raw.ma);
  const periodPerQuery = normalizeNumber(raw.per);
  const periodFromN = normalizeNumber(raw.n);
  const epoch = normalizeNumber(raw.epoch);

  const specB = normalizeString(raw.spec_b) ?? normalizeString(raw.specB);
  const specT = normalizeString(raw.spec_t) ?? normalizeString(raw.specT);
  const inferredTaxonomy = taxonomyFromSpec(specB, specT, aAu);
  const orbitClass = normalizeString(raw.class) ?? orbitClassFromElements(aAu, e);

  return {
    id: `jpl:${sanitizeId(rawId)}`,
    source: 'jpl',
    sourceBodyId: rawId,
    displayName: cleanJplDisplayName(fullName),
    fullName,
    absMag,
    slopeG: normalizeNumber(raw.g),
    diameterKm: normalizeNumber(raw.diameter),
    albedo: null,
    taxonomy: {
      inferred: inferredTaxonomy,
      specB: specB ?? null,
      specT: specT ?? null,
    },
    orbitClass,
    selectionPriority: selectionPriority('jpl', absMag, aAu, e),
    orbit: {
      epochJd: epoch ?? null,
      epochPacked: null,
      aAu: aAu ?? null,
      e: e === null ? 0 : clamp(e, 0, 0.999),
      iDeg: iDeg ?? 0,
      ascendingNodeDeg: nodeDeg ?? 0,
      argPeriapsisDeg: periDeg ?? 0,
      meanAnomalyDeg: meanAnomalyDeg ?? 0,
      periodDays: estimatePeriodDays(aAu, periodFromN ?? periodPerQuery),
      epochSource: 'jpl',
    },
    raw: {
      sourceRecord: raw,
      sourceVersion,
    },
    sourceMeta: {
      queryId,
      sourceVersion,
      normalizedAt: nowIso(),
    },
  };
}

function normalizeSbdbResults(rawResponse: string, queryId: string): { normalized: NormalizedAsteroidRecord[]; rawRows: number } {
  const payload = JSON.parse(rawResponse) as SbdbResponse;
  const rows = toSbdbRows(payload);
  const normalized = [];
  for (const row of rows) {
    const normalizedRow = normalizeJplRow(row, queryId, 'JPL SBDB');
    if (normalizedRow) normalized.push(normalizedRow);
  }
  return { normalized, rawRows: rows.length };
}

function parseMpcLine(line: string): MpcParsedLine | null {
  if (line.length < 120) return null;
  const designation = line.slice(0, 7).trim();
  if (!designation) return null;

  const h = normalizeNumber(line.slice(8, 13));
  const g = normalizeNumber(line.slice(14, 19));
  const epoch = normalizeString(line.slice(20, 25));
  const meanAnomalyDeg = normalizeNumber(line.slice(26, 35));
  const argPeriapsisDeg = normalizeNumber(line.slice(38, 47));
  const ascendingNodeDeg = normalizeNumber(line.slice(49, 58));
  const inclinationDeg = normalizeNumber(line.slice(59, 68));
  const eccentricity = normalizeNumber(line.slice(70, 79));
  const meanMotionDegPerDay = normalizeNumber(line.slice(80, 91));
  const semiMajorAxisAu = normalizeNumber(line.slice(92, 103));

  const nameRaw = line.slice(160).trim();
  const match = nameRaw.match(/^(.*?)\s+\d{8}$/u);
  const name = match ? match[1] ?? null : nameRaw || designation;

  return {
    designation,
    h,
    g,
    epoch: epoch ?? null,
    meanAnomalyDeg,
    argPeriapsisDeg,
    ascendingNodeDeg,
    inclinationDeg,
    eccentricity,
    meanMotionDegPerDay,
    semiMajorAxisAu,
    name,
    raw: {
      line,
    },
  };
}

function parseMpcPayload(text: string): string[] {
  const lines = text.split(/\r?\n/u);
  let start = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^-{8,}/.test((lines[i] ?? '').trim())) {
      start = i + 1;
      break;
    }
  }
  return lines.slice(start).filter((line) => line.trim().length > 0);
}

function parseAndLimitMpcLines(dataLines: string[], limit: number, maxAbsMag: number | null): MpcParsedLine[] {
  const parsed = [];
  for (const line of dataLines) {
    const row = parseMpcLine(line);
    if (!row) continue;
    if (maxAbsMag !== null && row.h !== null && row.h > maxAbsMag) continue;
    parsed.push(row);
  }

  parsed.sort((a, b) => {
    const av = a.h ?? Number.POSITIVE_INFINITY;
    const bv = b.h ?? Number.POSITIVE_INFINITY;
    return av - bv;
  });

  return parsed.slice(0, limit);
}

function normalizeMpcRows(rows: MpcParsedLine[]): NormalizedAsteroidRecord[] {
  const result: NormalizedAsteroidRecord[] = [];
  for (const row of rows) {
    const inferredTaxonomy = taxonomyFromSpec(null, null, row.semiMajorAxisAu);
    result.push({
      id: `mpc:${sanitizeId(row.designation)}`,
      source: 'mpc',
      sourceBodyId: row.designation,
      displayName: row.name || row.designation,
      fullName: row.name || row.designation,
      absMag: row.h,
      slopeG: row.g,
      diameterKm: null,
      albedo: null,
      taxonomy: {
        inferred: inferredTaxonomy,
        specB: null,
        specT: null,
      },
      orbitClass: orbitClassFromElements(row.semiMajorAxisAu, row.eccentricity),
      selectionPriority: selectionPriority('mpc', row.h, row.semiMajorAxisAu, row.eccentricity),
      orbit: {
        epochJd: null,
        epochPacked: row.epoch,
        aAu: row.semiMajorAxisAu,
        e: row.eccentricity === null ? 0 : clamp(row.eccentricity, 0, 0.999),
        iDeg: row.inclinationDeg ?? 0,
        ascendingNodeDeg: row.ascendingNodeDeg ?? 0,
        argPeriapsisDeg: row.argPeriapsisDeg ?? 0,
        meanAnomalyDeg: row.meanAnomalyDeg ?? 0,
        periodDays: estimatePeriodDays(row.semiMajorAxisAu, row.meanMotionDegPerDay),
        epochSource: 'mpc',
      },
      raw: {
        sourceRecord: row,
        sourceVersion: 'MPCORB.DAT',
      },
      sourceMeta: {
        queryId: 'mpcorb-file',
        sourceVersion: 'MPCORB.DAT',
        normalizedAt: nowIso(),
      },
    });
  }
  return result;
}

function dedupeBySourcePriority(records: NormalizedAsteroidRecord[]): NormalizedAsteroidRecord[] {
  const index = new Map<string, NormalizedAsteroidRecord>();
  for (const record of records) {
    const existing = index.get(record.id);
    if (!existing || record.selectionPriority > existing.selectionPriority) {
      index.set(record.id, record);
    }
  }
  return Array.from(index.values());
}

function buildSbdbQueryUrl(params: Record<string, string>): string {
  const query = new URLSearchParams({
    ...params,
    fields: SBDB_FIELDS,
  });
  return `${SBDB_QUERY_URL}?${query.toString()}`;
}

function buildJobs(options: CommandOptions, limiter: RateLimiter): FetchJob[] {
  const jobs: FetchJob[] = [];
  const cachePrefix = `v${VERSION}`;
  const policy = options.retryPolicy;

  if (options.sources.includes('jpl')) {
    jobs.push({
      id: 'jpl-main-belt',
      source: 'jpl',
      cadenceMinutes: 24 * 60,
      description: 'JPL SBDB top targets',
      run: async () => {
        const startedAt = nowIso();
        const queryId = 'jpl-main';
        const query = buildSbdbQueryUrl({
          'sb-kind': 'a',
          sort: 'H',
          limit: String(options.jplMainLimit),
        });
        const cacheFile = resolve(options.cacheDir, `${cachePrefix}-jpl-main.json`);
        const result = await fetchTextWithCache(query, policy, limiter, cacheFile, options.cacheTtlHours, 'jpl-main');
        const normalized = normalizeSbdbResults(result.body, queryId);

        const completedAt = nowIso();
        return {
          source: 'jpl',
          taskId: 'jpl-main-belt',
          requestedAt: startedAt,
          completedAt,
          query,
          sourceVersion: 'sbdb_query.api',
          cacheHit: result.fromCache,
          attempts: result.attempts,
          rawRows: normalized.rawRows,
          normalizedRows: normalized.normalized.length,
          status: 'ok',
          responseBytes: result.body.length,
          responseChecksum: sha256(result.body),
          records: normalized.normalized,
        };
      },
    });

    jobs.push({
      id: 'jpl-neo',
      source: 'jpl',
      cadenceMinutes: 24 * 60,
      description: 'JPL SBDB near-Earth sample',
      run: async () => {
        const startedAt = nowIso();
        const queryId = 'jpl-neo';
        const query = buildSbdbQueryUrl({
          'sb-kind': 'a',
          'sb-class': 'ATE:APO:AMO',
          sort: 'H',
          limit: String(options.jplNeoLimit),
        });
        const cacheFile = resolve(options.cacheDir, `${cachePrefix}-jpl-neo.json`);
        const result = await fetchTextWithCache(query, policy, limiter, cacheFile, options.cacheTtlHours, 'jpl-neo');
        const normalized = normalizeSbdbResults(result.body, queryId);
        return {
          source: 'jpl',
          taskId: 'jpl-neo',
          requestedAt: startedAt,
          completedAt: nowIso(),
          query,
          sourceVersion: 'sbdb_query.api',
          cacheHit: result.fromCache,
          attempts: result.attempts,
          rawRows: normalized.rawRows,
          normalizedRows: normalized.normalized.length,
          status: 'ok',
          responseBytes: result.body.length,
          responseChecksum: sha256(result.body),
          records: normalized.normalized,
        };
      },
    });

    jobs.push({
      id: 'jpl-trojans',
      source: 'jpl',
      cadenceMinutes: 24 * 60,
      description: 'JPL SBDB Jupiter Trojan sample',
      run: async () => {
        const startedAt = nowIso();
        const queryId = 'jpl-trojans';
        const query = buildSbdbQueryUrl({
          'sb-kind': 'a',
          'sb-class': 'TJN',
          sort: 'H',
          limit: String(options.jplTrojanLimit),
        });
        const cacheFile = resolve(options.cacheDir, `${cachePrefix}-jpl-trojans.json`);
        const result = await fetchTextWithCache(query, policy, limiter, cacheFile, options.cacheTtlHours, 'jpl-trojans');
        const normalized = normalizeSbdbResults(result.body, queryId);
        return {
          source: 'jpl',
          taskId: 'jpl-trojans',
          requestedAt: startedAt,
          completedAt: nowIso(),
          query,
          sourceVersion: 'sbdb_query.api',
          cacheHit: result.fromCache,
          attempts: result.attempts,
          rawRows: normalized.rawRows,
          normalizedRows: normalized.normalized.length,
          status: 'ok',
          responseBytes: result.body.length,
          responseChecksum: sha256(result.body),
          records: normalized.normalized,
        };
      },
    });
  }

  if (options.sources.includes('mpc')) {
    jobs.push({
      id: 'mpc-orb',
      source: 'mpc',
      cadenceMinutes: 24 * 60,
      description: 'MPCORB top objects by absolute magnitude',
      run: async () => {
        const startedAt = nowIso();
        const cacheFile = resolve(options.cacheDir, `${cachePrefix}-mpcorb.txt`);
        const fetched = await fetchTextWithCache(
          MPCORB_URL,
          policy,
          limiter,
          cacheFile,
          options.cacheTtlHours,
          'mpc-orb'
        );
        const lines = parseMpcPayload(fetched.body);
        const parsed = parseAndLimitMpcLines(lines, options.mpcLimit, options.mpcMaxAbsMag);
        const normalized = normalizeMpcRows(parsed);
        return {
          source: 'mpc',
          taskId: 'mpc-orb',
          requestedAt: startedAt,
          completedAt: nowIso(),
          query: MPCORB_URL,
          sourceVersion: 'MPCORB.DAT',
          cacheHit: fetched.fromCache,
          attempts: fetched.attempts,
          rawRows: lines.length,
          normalizedRows: normalized.length,
          status: 'ok',
          responseBytes: fetched.body.length,
          responseChecksum: sha256(fetched.body),
          records: normalized,
        };
      },
    });
  }

  return jobs;
}

async function runSchedule(jobs: FetchJob[], options: CommandOptions): Promise<{
  records: NormalizedAsteroidRecord[];
  sourceRuns: Array<Omit<FetchJobResult, 'records'>>;
  scheduleState: Array<{ id: string; source: Source; cadenceMinutes: number; description: string; lastRunAt: string | null }>;
}> {
  const records: NormalizedAsteroidRecord[] = [];
  const sourceRuns: Array<Omit<FetchJobResult, 'records'>> = [];
  const scheduleState = jobs.map((job) => ({
    id: job.id,
    source: job.source,
    cadenceMinutes: job.cadenceMinutes,
    description: job.description,
    lastRunAt: null as string | null,
  }));

  const totalRuns = Math.max(1, options.maxRuns);
  for (let runIndex = 0; runIndex < totalRuns; runIndex += 1) {
    console.log(`\n[cycle ${runIndex + 1}/${totalRuns}] starting`);
    for (const job of jobs) {
      try {
        const result = await job.run();
        records.push(...result.records);
        sourceRuns.push({
          source: result.source,
          taskId: result.taskId,
          requestedAt: result.requestedAt,
          completedAt: result.completedAt,
          query: result.query,
          sourceVersion: result.sourceVersion,
          cacheHit: result.cacheHit,
          attempts: result.attempts,
          rawRows: result.rawRows,
          normalizedRows: result.normalizedRows,
          status: result.status,
          errorMessage: result.errorMessage,
          responseBytes: result.responseBytes,
          responseChecksum: result.responseChecksum,
        });
        for (const state of scheduleState) {
          if (state.id === job.id) {
            state.lastRunAt = result.completedAt;
          }
        }
        console.log(`  ${result.taskId}: +${result.normalizedRows} rows (raw=${result.rawRows}, cache=${result.cacheHit})`);
      } catch (error) {
        const failed: Omit<FetchJobResult, 'records'> = {
          source: job.source,
          taskId: job.id,
          requestedAt: nowIso(),
          completedAt: nowIso(),
          query: job.description,
          sourceVersion: job.source === 'jpl' ? 'sbdb_query.api' : 'MPCORB.DAT',
          cacheHit: false,
          attempts: 0,
          rawRows: 0,
          normalizedRows: 0,
          status: 'error',
          errorMessage: error instanceof Error ? error.message : String(error),
          responseBytes: 0,
          responseChecksum: '0',
        };
        sourceRuns.push(failed);
        console.error(`  ${job.id}: failed (${failed.errorMessage})`);
      }
    }

    if (runIndex < totalRuns - 1 && options.intervalMinutes > 0) {
      console.log(`waiting ${options.intervalMinutes}m before next cycle...`);
      await sleep(options.intervalMinutes * 60_000);
    }
  }

  return { records, sourceRuns, scheduleState };
}

function writeOutputs(
  records: NormalizedAsteroidRecord[],
  sourceRuns: Array<Omit<FetchJobResult, 'records'>>,
  scheduleState: Array<{ id: string; source: Source; cadenceMinutes: number; description: string; lastRunAt: string | null }>,
  options: CommandOptions,
  runTag: string
): Promise<void> {
  const bySource: Record<Source, number> = { jpl: 0, mpc: 0 };
  const byOrbitClass: Record<string, number> = {};
  const byTaxonomy: Record<'C' | 'S' | 'M', number> = { C: 0, S: 0, M: 0 };

  for (const row of records) {
    bySource[row.source] += 1;
    byOrbitClass[row.orbitClass ?? 'unknown'] = (byOrbitClass[row.orbitClass ?? 'unknown'] ?? 0) + 1;
    if (row.taxonomy) byTaxonomy[row.taxonomy.inferred] += 1;
  }

  const snapshot: SnapshotArtifact = {
    version: 1,
    generatedAt: nowIso(),
    snapshotVersion: `${VERSION}`,
    source: options.sources.join('+'),
    records,
    counts: {
      total: records.length,
      bySource,
      byOrbitClass,
      byTaxonomy,
    },
    schema: {
      columns: [
        'id',
        'source',
        'sourceBodyId',
        'displayName',
        'fullName',
        'absMag',
        'slopeG',
        'diameterKm',
        'taxonomy.inferred',
        'orbitClass',
        'selectionPriority',
        'orbit.epochJd',
        'orbit.epochPacked',
        'orbit.aAu',
        'orbit.e',
        'orbit.iDeg',
        'orbit.ascendingNodeDeg',
        'orbit.argPeriapsisDeg',
        'orbit.meanAnomalyDeg',
        'orbit.periodDays',
        'sourceMeta.queryId',
        'sourceMeta.sourceVersion',
      ],
      notes: [
        'records are de-duplicated by deterministic `id` with per-id source priority.',
        'selectionPriority is deterministic for stable deterministic targeting decisions.',
        'provenance metadata includes source fetches, checksums, and attempt counters.',
        'scheduled fetch jobs are periodic by declaration but executed for maxRuns batches.',
      ],
    },
  };

  const meta: MetaArtifact = {
    pipelineVersion: VERSION,
    generatedAt: nowIso(),
    runTag,
    source: options.sources.join('+'),
    config: {
      ...options,
      // avoid serializing potentially large inline blobs
      intervalMinutes: options.intervalMinutes,
      maxRuns: options.maxRuns,
    },
    schedule: scheduleState,
    sourceRuns,
  };

  if (options.dryRun) {
    console.log(`[dry-run] records=${records.length}`);
    console.log(`[dry-run] checksum=${sha256(JSON.stringify(records))}`);
    return Promise.resolve();
  }

  const rawOutput = ensureJsonExt(options.rawOutputPath);
  const metaOutput = ensureJsonExt(options.metaOutputPath);
  return Promise.all([
    mkdir(dirname(rawOutput), { recursive: true }).then(() => writeFile(rawOutput, JSON.stringify(snapshot, null, 2), 'utf8')),
    mkdir(dirname(metaOutput), { recursive: true }).then(() => writeFile(metaOutput, JSON.stringify(meta, null, 2), 'utf8')),
  ]).then(() => {
    console.log(`Wrote raw snapshot: ${rawOutput}`);
    console.log(`Wrote provenance: ${metaOutput}`);
  });
}

function ensureJsonExt(filePath: string): string {
  return extname(filePath).length === 0 ? `${filePath}.json` : filePath;
}

function parseArgs(argv: string[]): CommandOptions {
  const out: CommandOptions = { ...DEFAULT_OPTIONS };
  const set = out.sources;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/asteroid/catalog_fetcher.ts [options]
  --source <jpl|mpc|jpl,mpc>
  --jpl-main-limit <n> (default ${DEFAULT_OPTIONS.jplMainLimit})
  --jpl-neo-limit <n> (default ${DEFAULT_OPTIONS.jplNeoLimit})
  --jpl-trojan-limit <n> (default ${DEFAULT_OPTIONS.jplTrojanLimit})
  --mpc-limit <n> (default ${DEFAULT_OPTIONS.mpcLimit})
  --mpc-max-h <value|null> (default ${DEFAULT_OPTIONS.mpcMaxAbsMag})
  --request-interval-ms <n> (default ${DEFAULT_OPTIONS.requestIntervalMs})
  --retry-attempts <n> (default ${DEFAULT_OPTIONS.retryPolicy.maxAttempts})
  --retry-timeout-ms <n> (default ${DEFAULT_OPTIONS.retryPolicy.timeoutMs})
  --retry-initial-delay-ms <n> (default ${DEFAULT_OPTIONS.retryPolicy.initialDelayMs})
  --retry-max-delay-ms <n> (default ${DEFAULT_OPTIONS.retryPolicy.maxDelayMs})
  --cache-dir <path> (default ${DEFAULT_OPTIONS.cacheDir})
  --cache-ttl-hours <n> (default ${DEFAULT_OPTIONS.cacheTtlHours})
  --output-dir <path>
  --raw-output <path>
  --meta-output <path>
  --interval-minutes <n> (default ${DEFAULT_OPTIONS.intervalMinutes})
  --max-runs <n> (default ${DEFAULT_OPTIONS.maxRuns})
  --dry-run`);
      process.exit(0);
    }

    const next = (): string => {
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[++i]!;
    };
    if (arg === '--source') {
      set.length = 0;
      const parts = normalizeList(next());
      for (const src of parts) {
        if (src !== 'jpl' && src !== 'mpc') {
          throw new Error(`Invalid source "${src}"`);
        }
        set.push(src);
      }
      continue;
    }
    if (arg === '--jpl-main-limit') out.jplMainLimit = Number.parseInt(next(), 10);
    if (arg === '--jpl-neo-limit') out.jplNeoLimit = Number.parseInt(next(), 10);
    if (arg === '--jpl-trojan-limit') out.jplTrojanLimit = Number.parseInt(next(), 10);
    if (arg === '--mpc-limit') out.mpcLimit = Number.parseInt(next(), 10);
    if (arg === '--mpc-max-h') {
      const value = next();
      out.mpcMaxAbsMag = value === 'null' ? null : normalizeNumber(value);
    }
    if (arg === '--request-interval-ms') out.requestIntervalMs = Number.parseInt(next(), 10);
    if (arg === '--retry-attempts') out.retryPolicy = { ...out.retryPolicy, maxAttempts: Number.parseInt(next(), 10) };
    if (arg === '--retry-timeout-ms') out.retryPolicy = { ...out.retryPolicy, timeoutMs: Number.parseInt(next(), 10) };
    if (arg === '--retry-initial-delay-ms') out.retryPolicy = { ...out.retryPolicy, initialDelayMs: Number.parseInt(next(), 10) };
    if (arg === '--retry-max-delay-ms') out.retryPolicy = { ...out.retryPolicy, maxDelayMs: Number.parseInt(next(), 10) };
    if (arg === '--cache-dir') out.cacheDir = next();
    if (arg === '--cache-ttl-hours') out.cacheTtlHours = Number.parseInt(next(), 10);
    if (arg === '--interval-minutes') out.intervalMinutes = Number.parseInt(next(), 10);
    if (arg === '--max-runs') out.maxRuns = Number.parseInt(next(), 10);
    if (arg === '--output-dir') {
      out.outputDir = next();
      out.rawOutputPath = resolve(out.outputDir, basename(out.rawOutputPath));
      out.metaOutputPath = resolve(out.outputDir, basename(out.metaOutputPath));
    }
    if (arg === '--raw-output') out.rawOutputPath = next();
    if (arg === '--meta-output') out.metaOutputPath = next();
    if (arg === '--dry-run') out.dryRun = true;
  }

  out.outputDir = resolve(out.outputDir);
  out.rawOutputPath = ensureJsonExt(resolve(out.rawOutputPath));
  out.metaOutputPath = ensureJsonExt(resolve(out.metaOutputPath));
  return out;
}

function normalizeList(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const limiter = new RateLimiter(Math.max(250, options.requestIntervalMs));
  const jobs = buildJobs(options, limiter);
  const runTag = nowIso().replace(/[:.]/g, '-');
  const { records, sourceRuns, scheduleState } = await runSchedule(jobs, options);
  const merged = dedupeBySourcePriority(records);
  merged.sort((a, b) => b.selectionPriority - a.selectionPriority);
  console.log(`Total rows before dedupe: ${records.length}, after dedupe: ${merged.length}`);
  await writeOutputs(merged, sourceRuns, scheduleState, options, runTag);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
