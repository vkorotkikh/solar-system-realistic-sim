import {
  AsteroidDef,
  AsteroidTaxonomy,
  colorForTaxonomy,
  albedoForTaxonomy
} from './asteroidBelt';

export interface Phase1CatalogLoadOptions {
  url?: string;
  maxRecords?: number;
}

export interface Phase1CatalogLoadResult {
  asteroids: AsteroidDef[];
  sourceCount: number;
}

const PHASE1_DEFAULT_URL = '/data/asteroid-phase1/asteroid_phase1_main_100000.bin';
const PHASE1_DEFAULT_MAX_RECORDS = 15_000;
const HEADER_MAGIC = 'ASPH';
const HEADER_SIZE_BYTES = 11;
const STRIDE_FLOATS = 11;
const STRIDE_BYTES = STRIDE_FLOATS * 4;

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

function parseOrbitCatalog(
  buffer: ArrayBuffer,
  maxCount: number
): { asteroids: AsteroidDef[]; sourceCount: number } {
  if (buffer.byteLength < HEADER_SIZE_BYTES) {
    throw new Error('Phase-1 binary payload is too small for header.');
  }

  const headerBytes = new Uint8Array(buffer, 0, 4);
  const magic = String.fromCharCode(headerBytes[0], headerBytes[1], headerBytes[2], headerBytes[3]);
  if (magic !== HEADER_MAGIC) {
    throw new Error(`Unknown phase-1 magic "${magic}", expected ${HEADER_MAGIC}.`);
  }

  const header = new DataView(buffer);
  const version = header.getUint8(4);
  if (version !== 1) {
    throw new Error(`Unsupported phase-1 catalog version: ${version}`);
  }

  const stride = header.getUint8(5);
  if (stride !== STRIDE_FLOATS) {
    throw new Error(`Unexpected phase-1 stride: ${stride} (expected ${STRIDE_FLOATS})`);
  }

  const count = header.getUint32(8, true);
  const payloadStart = HEADER_SIZE_BYTES;
  const expectedBytes = payloadStart + count * STRIDE_BYTES;
  if (buffer.byteLength < expectedBytes) {
    throw new Error(`Phase-1 payload truncated: expected ${expectedBytes}, got ${buffer.byteLength}`);
  }

  const payload = new DataView(buffer, payloadStart, count * STRIDE_BYTES);
  const limit = Math.max(0, Math.min(maxCount, count));
  const asteroids: AsteroidDef[] = [];
  asteroids.length = limit;

  for (let i = 0; i < limit; i++) {
    const baseOffset = i * STRIDE_BYTES;
    const read = (index: number) => payload.getFloat32(baseOffset + index * 4, true);

    const epochJd = read(0);
    const aAu = clampRange(read(1), 0.5, 10);
    const e = clampRange(read(2), 0, 0.98);
    const iDeg = read(3);
    const ascendingNodeDeg = read(4);
    const argPeriapsisDeg = read(5);
    const meanAnomalyDeg = read(6);
    const periodDays = read(7);
    const diameterKm = read(8);
    const albedo = read(9);
    const taxonomyIndex = read(10);
    const taxonomy = taxonomyFromIndex(taxonomyIndex, aAu);
    const radiusSeed = (Math.trunc(aAu * 100_000) ^ (i * 97) ^ (Math.trunc(meanAnomalyDeg * 100))) >>> 0;
    const baseColor = makeColor(taxonomy, radiusSeed);
    const color = Number.isFinite(baseColor) ? baseColor : colorForTaxonomy(taxonomy, mulberry32(radiusSeed + 1));
    const safeDiameter = Number.isFinite(diameterKm) && diameterKm > 0 ? diameterKm : 1.0;
    const safeAlbedo = Number.isFinite(albedo) && albedo > 0 ? albedo : albedoForTaxonomy(taxonomy, mulberry32(radiusSeed + 2));
    const sourceId = `${i + 1}`;

    asteroids[i] = {
      orbit: {
        epochJd: Number.isFinite(epochJd) ? epochJd : 2_451_545.0,
        aAu: Number.isFinite(aAu) && aAu > 0 ? aAu : 2.8,
        e,
        iDeg: Number.isFinite(iDeg) ? iDeg : 0,
        ascendingNodeDeg: Number.isFinite(ascendingNodeDeg) ? ascendingNodeDeg : 0,
        argPeriapsisDeg: Number.isFinite(argPeriapsisDeg) ? argPeriapsisDeg : 0,
        meanAnomalyDeg: Number.isFinite(meanAnomalyDeg) ? meanAnomalyDeg : 0,
        periodDays: Number.isFinite(periodDays) && periodDays > 0 ? periodDays : 365.25 * Math.pow(aAu, 1.5),
      },
      taxonomy,
      diameterKm: safeDiameter,
      albedo: safeAlbedo,
      color,
      irregularity: irregularityFromDiameter(safeDiameter),
      sourceId,
    };
  }

  return { asteroids, sourceCount: count };
}

export async function loadPhase1AsteroidCatalog(
  options: Phase1CatalogLoadOptions = {}
): Promise<Phase1CatalogLoadResult> {
  const url = options.url ?? PHASE1_DEFAULT_URL;
  const maxRecords = options.maxRecords ?? PHASE1_DEFAULT_MAX_RECORDS;

  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Failed to fetch phase-1 catalog (${response.status}): ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  return parseOrbitCatalog(buffer, maxRecords);
}

export const PHASE1_CATALOG_URL = PHASE1_DEFAULT_URL;
export const PHASE1_BELT_LIMIT = PHASE1_DEFAULT_MAX_RECORDS;
