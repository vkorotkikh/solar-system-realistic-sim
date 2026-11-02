import rawMoons from '../data/moons.json';
import { parseMoonEphemerisArtifact, type GeneratedMoonChebyshevEphemeris } from './moonEphemeris';

const BASE_KEYS = new Set(['titan', 'iapetus', 'phoebe', 'cordelia', 'carme', 'dione', 'mimas', 'neso', 'phobos', 's2021_n1', 's2025_u_1', 'daphnis', 's2023_s38']);
const CENTERS: Record<string, string> = { Earth: '399', Mars: '499', Jupiter: '599', Saturn: '699', Uranus: '799', Neptune: '899', Pluto: '999' };
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_SHARD_BYTES = 2 * 1024 * 1024;
const START = 2451545, END = 2469807.5;

type CatalogMoon = (typeof rawMoons)[number];
export interface MoonShardEntry {
  path: string;
  sha256: string;
  bytes: number;
  catalogIds: number[];
  targetId: string;
  centerId: string;
  coverageStartJd: number;
  coverageEndJd: number;
  accuracyLimits: { positionKm: number; velocityMPerS: number };
  sourceEphemeris: string;
  sourceQuality: string;
}
export interface LazyMoonManifest {
  schemaVersion: 1;
  kind: 'moon-ephemeris-shards-v1';
  catalogRecordCount: 423;
  lazyRecordCount: 410;
  lazyModelCount: 410;
  records: Array<{ catalogId: number; key: string; name: string; parent: string; targetId: string; centerId: string; delivery: 'base' | 'lazy'; sourceQuality: unknown }>;
  bodies: Record<string, MoonShardEntry>;
}
export interface LazyMoonLoaderOptions {
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
  /** Accounted JSON bytes, not a claim about JavaScript object heap overhead. */
  maxCacheBytes?: number;
  maxConcurrentRequests?: number;
  /** Deadline for fetching headers and consuming the body; cleanup is awaited. */
  requestTimeoutMs?: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

function validateVectorOracle(body: GeneratedMoonChebyshevEphemeris, entry: MoonShardEntry, key: string) {
  const oracle = (body.validation as unknown as Record<string, unknown>).vectorOracle;
  if (!record(oracle) || !Array.isArray(oracle.catalogIds) ||
      oracle.catalogIds.length !== entry.catalogIds.length ||
      oracle.catalogIds.some((id, index) => id !== entry.catalogIds[index]) ||
      oracle.sampleCount !== 7 * entry.catalogIds.length) {
    throw new Error(`Invalid vector oracle alias identities or sample count: ${key}`);
  }
  for (const [field, limit] of [
    ['positionErrorKm', body.validation.accuracyLimits.positionKm],
    ['velocityErrorMPerS', body.validation.accuracyLimits.velocityMPerS]
  ] as const) {
    const stats = oracle[field];
    if (!record(stats)) throw new Error(`Missing vector oracle statistics: ${key}`);
    let previous = 0;
    for (const percentile of ['p50', 'p95', 'p99', 'max']) {
      const value = stats[percentile];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < previous || value > limit) {
        throw new Error(`Invalid vector oracle statistics or accuracy limit: ${key}/${field}`);
      }
      previous = value;
    }
  }
}

function validateManifest(value: unknown): LazyMoonManifest {
  if (!record(value) || value.schemaVersion !== 1 || value.kind !== 'moon-ephemeris-shards-v1' ||
      value.catalogRecordCount !== 423 || value.lazyRecordCount !== 410 || value.lazyModelCount !== 410 ||
      !Array.isArray(value.records) || value.records.length !== 423 || !record(value.bodies)) {
    throw new Error('Invalid complete-423 lazy moon manifest');
  }
  const bodies = value.bodies;
  const aliases = new Map<string, CatalogMoon[]>();
  const byId = new Map(rawMoons.map(moon => [moon.id, moon]));
  for (const moon of rawMoons) {
    const key = moon.name.toLowerCase();
    if (!BASE_KEYS.has(key)) aliases.set(key, [...(aliases.get(key) ?? []), moon]);
  }
  if (Object.keys(bodies).length !== 410 || [...aliases.keys()].some(key => !(key in bodies))) {
    throw new Error('Lazy manifest dropped or replaced a catalog model');
  }
  const seen = new Set<number>();
  for (const item of value.records) {
    if (!record(item) || typeof item.catalogId !== 'number') throw new Error('Invalid catalog record');
    const moon = byId.get(item.catalogId);
    if (!moon || seen.has(moon.id) || item.key !== moon.name.toLowerCase() || item.name !== moon.name ||
        item.parent !== moon.planet || item.targetId !== String(moon.iauCode) || item.centerId !== CENTERS[moon.planet] ||
        item.delivery !== (BASE_KEYS.has(moon.name.toLowerCase()) ? 'base' : 'lazy') ||
        !(typeof item.sourceQuality === 'string' && item.sourceQuality.length > 0 ||
          record(item.sourceQuality) && typeof item.sourceQuality.kind === 'string' && item.sourceQuality.kind.length > 0)) {
      throw new Error('Lazy catalog record identity or source qualification differs');
    }
    seen.add(moon.id);
  }
  for (const [key, moons] of aliases) {
    const entry = bodies[key];
    const cap = Math.min(500, ...moons.map(moon => .001 * moon.aKm));
    if (!record(entry) || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
        entry.path !== `${entry.sha256}.json` || typeof entry.bytes !== 'number' || !Number.isInteger(entry.bytes) ||
        entry.bytes <= 0 || entry.bytes > MAX_SHARD_BYTES || !Array.isArray(entry.catalogIds) ||
        entry.catalogIds.length !== moons.length || entry.catalogIds.some((id, index) => id !== moons[index].id) ||
        moons.some(moon => entry.targetId !== String(moon.iauCode) || entry.centerId !== CENTERS[moon.planet]) ||
        entry.coverageStartJd !== START || entry.coverageEndJd !== END || !record(entry.accuracyLimits) ||
        typeof entry.accuracyLimits.positionKm !== 'number' || !Number.isFinite(entry.accuracyLimits.positionKm) || entry.accuracyLimits.positionKm <= 0 || entry.accuracyLimits.positionKm > cap || entry.accuracyLimits.velocityMPerS !== 10 ||
        typeof entry.sourceEphemeris !== 'string' || entry.sourceEphemeris.length === 0 ||
        typeof entry.sourceQuality !== 'string' || entry.sourceQuality.length === 0) {
      throw new Error(`Invalid shard identity, domain, or fixed accuracy cap: ${key}`);
    }
  }
  return freeze(value as unknown as LazyMoonManifest);
}

/** No request is made until load(nonempty keys) or getManifest() is called. */
export function createLazyMoonEphemerisLoader(options: LazyMoonLoaderOptions = {}) {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const baseUrl = (options.baseUrl ?? import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');
  const root = `${baseUrl}moon-ephemerides/`;
  const maxCacheBytes = options.maxCacheBytes ?? 8 * 1024 * 1024;
  const concurrency = options.maxConcurrentRequests ?? 4;
  const requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  if (!Number.isInteger(maxCacheBytes) || maxCacheBytes < 0 || maxCacheBytes > 32 * 1024 * 1024 ||
      !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8 ||
      !Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 120_000) {
    throw new Error('Invalid bounded moon loader limits');
  }
  const cache = new Map<string, { body: GeneratedMoonChebyshevEphemeris; bytes: number }>();
  const inFlight = new Map<string, Promise<GeneratedMoonChebyshevEphemeris>>();
  const waiting: Array<() => void> = [];
  let active = 0, cachedBytes = 0;
  let manifestPromise: Promise<LazyMoonManifest> | undefined;

  async function boundedBytes(url: string, limit: number, exact?: number): Promise<Uint8Array> {
    const controller = new AbortController();
    let response: Response | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const timeoutError = new Error(`Moon ephemeris request timed out: ${url}`);
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(timeoutError); controller.abort(timeoutError); }, requestTimeoutMs);
    });
    try {
      response = await Promise.race([Promise.resolve(fetcher(url, {
        cache: exact === undefined ? 'no-cache' : 'force-cache', signal: controller.signal
      })).then(async incoming => {
        // A custom transport may resolve after abort. It still owns no live body.
        if (controller.signal.aborted) {
          try { await incoming.body?.cancel(controller.signal.reason); } catch { /* preserve timeout */ }
          throw timeoutError;
        }
        return incoming;
      }), deadline]);
      if (!response.ok) throw new Error(`Moon ephemeris request failed (${response.status}): ${url}`);
      const advertised = response.headers.get('content-length');
      const encoding = response.headers.get('content-encoding')?.trim().toLowerCase();
      // Fetch decodes compressed bodies while retaining the wire length. CORS
      // can hide Content-Encoding too, so only known identity responses permit
      // comparing that header with the manifest's decoded JSON byte count.
      const identityRepresentation = encoding === 'identity'
        || (encoding === undefined && response.type !== 'cors');
      if (advertised !== null && (!/^\d+$/.test(advertised) || !Number.isSafeInteger(Number(advertised)) ||
          Number(advertised) > limit || identityRepresentation && exact !== undefined && Number(advertised) !== exact)) {
        throw new Error('Moon asset exceeds declared transfer budget or differs from exact shard length');
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (response.body) {
        reader = response.body.getReader();
        while (true) {
          const next = await Promise.race([reader.read(), deadline]);
          if (next.done) break;
          size += next.value.byteLength;
          if (size > limit || exact !== undefined && size > exact) {
            throw new Error('Moon asset exceeds decoded byte budget');
          }
          chunks.push(next.value);
        }
      } else {
        const bytes = new Uint8Array(await Promise.race([response.arrayBuffer(), deadline]));
        size = bytes.byteLength;
        if (size > limit) throw new Error('Moon asset exceeds decoded byte budget');
        chunks.push(bytes);
      }
      if (exact !== undefined && size !== exact) throw new Error('Truncated or oversized moon shard');
      const result = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
      return result;
    } catch (error) {
      controller.abort(error);
      // Keep the concurrency permit until cancellation completes, even when the
      // failure precedes reader acquisition. Closed/errored streams need no drain.
      try {
        if (reader) await reader.cancel(error);
        else await response?.body?.cancel(error);
      } catch { /* a cleanup error must not hide the admission/transport failure */ }
      throw error;
    } finally {
      clearTimeout(timer!);
      reader?.releaseLock();
    }
  }

  function getManifest(): Promise<LazyMoonManifest> {
    manifestPromise ??= boundedBytes(`${root}manifest.json`, MAX_MANIFEST_BYTES)
      .then(bytes => validateManifest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))))
      .catch(error => { manifestPromise = undefined; throw error; });
    return manifestPromise;
  }

  async function withSlot<T>(task: () => Promise<T>): Promise<T> {
    if (active >= concurrency) await new Promise<void>(resolve => waiting.push(resolve));
    else active += 1;
    try { return await task(); }
    finally {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  }

  function one(key: string, entry: MoonShardEntry): Promise<GeneratedMoonChebyshevEphemeris> {
    const hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return Promise.resolve(hit.body); }
    const pending = inFlight.get(key);
    if (pending) return pending;
    const promise = withSlot(async () => {
      const raw = await boundedBytes(root + entry.path, MAX_SHARD_BYTES, entry.bytes);
      const buffer = new ArrayBuffer(raw.byteLength);
      new Uint8Array(buffer).set(raw);
      const digest = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', buffer)), byte => byte.toString(16).padStart(2, '0')).join('');
      if (digest !== entry.sha256) throw new Error(`Moon shard integrity failure: ${key}`);
      const artifact = parseMoonEphemerisArtifact(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)));
      const body = artifact.bodies[key];
      if (Object.keys(artifact.bodies).length !== 1 || !body || body.provenance.targetId !== entry.targetId ||
          body.provenance.centerId !== entry.centerId || body.provenance.sourceEphemeris !== entry.sourceEphemeris ||
          body.coverageStartJd !== entry.coverageStartJd || body.coverageEndJd !== entry.coverageEndJd ||
          !(body.validation.accuracyLimits.positionKm > 0 && body.validation.accuracyLimits.positionKm <= entry.accuracyLimits.positionKm) ||
          !(body.validation.accuracyLimits.velocityMPerS > 0 && body.validation.accuracyLimits.velocityMPerS <= 10)) {
        throw new Error(`Moon shard identity, domain, or accuracy mismatch: ${key}`);
      }
      validateVectorOracle(body, entry, key);
      freeze(body);
      if (entry.bytes <= maxCacheBytes) {
        while (cachedBytes + entry.bytes > maxCacheBytes && cache.size > 0) {
          const oldest = cache.keys().next().value!;
          cachedBytes -= cache.get(oldest)!.bytes;
          cache.delete(oldest);
        }
        cache.set(key, { body, bytes: entry.bytes }); cachedBytes += entry.bytes;
      }
      return body;
    }).finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  }

  async function load(keys: readonly string[]): Promise<Record<string, GeneratedMoonChebyshevEphemeris>> {
    if (keys.length === 0) return {};
    const manifest = await getManifest();
    const unique = [...new Set(keys)];
    for (const key of unique) {
      if (typeof key !== 'string' || !Object.hasOwn(manifest.bodies, key)) throw new Error(`Unknown additional moon model: ${key}`);
    }
    const entries = await Promise.all(unique.map(async key => [key, await one(key, manifest.bodies[key])] as const));
    return Object.fromEntries(entries);
  }
  return { load, getManifest };
}

let defaultLoader: ReturnType<typeof createLazyMoonEphemerisLoader> | undefined;
export function loadLazyMoonEphemerides(keys: readonly string[], options?: LazyMoonLoaderOptions) {
  if (options) return createLazyMoonEphemerisLoader(options).load(keys);
  defaultLoader ??= createLazyMoonEphemerisLoader();
  return defaultLoader.load(keys);
}
