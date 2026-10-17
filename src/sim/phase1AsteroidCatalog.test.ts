import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateAsteroidBelt } from './asteroidBelt';

import {
  loadPhase1AsteroidCatalog,
  type Phase1CatalogMeta,
} from './phase1AsteroidCatalog';
import {
  writeAsteroidCatalogBinary,
  type PackedAsteroidRecord,
} from '../data/asteroidCatalogLoader';
import {
  failedAsteroidCatalogStatus,
  rejectedAsteroidCatalogStatus,
  renderAsteroidCatalogSourceStatus,
  verifiedAsteroidCatalogStatus,
} from '../frontend/features/asteroids/catalogSourceStatus';

const CATALOG_URL = '/test/catalog.bin';
const METADATA_URL = '/test/catalog.meta.json';

function makeRecord(sourceId: number, taxonomyIndex: number): PackedAsteroidRecord {
  const aAu = 2.2 + taxonomyIndex * 0.4;
  return {
    sourceId,
    epochJd: 2_461_000.5,
    aAu,
    e: 0.05,
    iDeg: 3,
    ascendingNodeDeg: 20,
    argPeriapsisDeg: 40,
    meanAnomalyDeg: 60,
    periodDays: 365.25 * Math.pow(aAu, 1.5),
    diameterKm: 10,
    albedo: 0.12,
    taxonomyIndex,
  };
}

function makeCatalog(): ArrayBuffer {
  return writeAsteroidCatalogBinary([
    makeRecord(1, 0),
    makeRecord(2, 1),
    makeRecord(3, 2),
  ]);
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fnv1a32Hex(buffer: ArrayBuffer): string {
  let hash = 0x811c9dc5;
  for (const byte of new Uint8Array(buffer)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function responseStub(options: {
  ok: boolean;
  status?: number;
  statusText?: string;
  json?: () => Promise<unknown>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}): Response {
  return {
    ok: options.ok,
    status: options.status ?? (options.ok ? 200 : 500),
    statusText: options.statusText ?? (options.ok ? 'OK' : 'Error'),
    json: options.json,
    arrayBuffer: options.arrayBuffer,
  } as Response;
}

function installFetch(
  catalog: ArrayBuffer,
  metadataResponse: () => Response | Promise<Response>
): void {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === CATALOG_URL) {
      return responseStub({
        ok: true,
        arrayBuffer: async () => catalog.slice(0),
      });
    }
    if (url === METADATA_URL) return metadataResponse();
    throw new Error(`Unexpected URL: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
}

async function loadTestCatalog(loadLatencyBudgetMs = 2_000) {
  return loadPhase1AsteroidCatalog({
    url: CATALOG_URL,
    metaUrl: METADATA_URL,
    maxRecords: 3,
    loadLatencyBudgetMs,
    cache: false,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Phase-1 asteroid catalog integrity gate', () => {
  it('accepts a matching SHA-256 when auxiliary legacy FNV fields coexist', async () => {
    const catalog = makeCatalog();
    const checksum = await sha256Hex(catalog);
    const metadata: Phase1CatalogMeta = {
      version: 1,
      source_rows: 3,
      stored_count: 3,
      checksum: `0x${fnv1a32Hex(catalog)}`,
      checksum_algorithm: 'fnv1a32',
      checksum_sha256: checksum,
      checksum_algorithm_sha256: 'sha256',
    };
    installFetch(catalog, async () => responseStub({
      ok: true,
      json: async () => metadata,
    }));

    const result = await loadTestCatalog();

    expect(result.accepted).toBe(true);
    expect(result.acceptance.passed).toBe(true);
    expect(result.acceptance.metadata).toMatchObject({ status: 'loaded', passed: true });
    expect(result.acceptance.checksum).toMatchObject({
      expected: checksum,
      actual: checksum,
      enforced: true,
      passed: true,
    });
    expect(result.acceptance.latency.passed).toBe(true);
    expect(result.rejectionReasons).toEqual([]);
  });

  it('treats a slow authenticated load as telemetry rather than rejection', async () => {
    const catalog = makeCatalog();
    const checksum = await sha256Hex(catalog);
    installFetch(catalog, async () => responseStub({
      ok: true,
      json: async () => ({
        source_rows: 3,
        stored_count: 3,
        checksum_sha256: checksum,
      }),
    }));
    vi.spyOn(globalThis.performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(3_001);

    const result = await loadTestCatalog(2_000);

    expect(result.accepted).toBe(true);
    expect(result.acceptance.passed).toBe(true);
    expect(result.acceptance.latency).toMatchObject({ passed: false, loadMs: 3_001, budgetMs: 2_000 });
    expect(result.acceptance.latency.reason).toContain('exceeded');
    expect(result.rejectionReasons).toEqual([]);
  });

  it('rejects a catalog when metadata is missing', async () => {
    const catalog = makeCatalog();
    installFetch(catalog, async () => responseStub({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    }));

    const result = await loadTestCatalog();

    expect(result.accepted).toBe(false);
    expect(result.acceptance.metadata).toMatchObject({
      status: 'missing',
      passed: false,
      code: 'metadata-missing',
      httpStatus: 404,
    });
    expect(result.rejectionReasons.map(({ code }) => code)).toEqual(['metadata-missing']);
  });

  it('rejects metadata that is not a JSON object', async () => {
    const catalog = makeCatalog();
    installFetch(catalog, async () => responseStub({
      ok: true,
      json: async () => [],
    }));

    const result = await loadTestCatalog();

    expect(result.accepted).toBe(false);
    expect(result.acceptance.metadata).toMatchObject({
      status: 'invalid',
      passed: false,
      code: 'metadata-invalid',
    });
    expect(result.rejectionReasons.map(({ code }) => code)).toEqual(['metadata-invalid']);
  });

  it('does not accept a legacy FNV checksum as an integrity substitute', async () => {
    const catalog = makeCatalog();
    const fnv = fnv1a32Hex(catalog);
    installFetch(catalog, async () => responseStub({
      ok: true,
      json: async () => ({
        source_rows: 3,
        stored_count: 3,
        checksum: `0x${fnv}`,
        checksum_algorithm: 'fnv1a32',
      }),
    }));

    const result = await loadTestCatalog();

    expect(result.accepted).toBe(false);
    expect(result.acceptance.checksum).toMatchObject({
      enforced: true,
      passed: false,
      code: 'sha256-missing',
    });
    expect(result.checksumActual).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.checksumActual).not.toBe(fnv);
    expect(result.rejectionReasons.map(({ code }) => code)).toContain('sha256-missing');
  });

  it.each([
    ['63 hexadecimal characters', 'a'.repeat(63)],
    ['64 non-hexadecimal characters', 'z'.repeat(64)],
  ])('rejects a malformed SHA-256 declaration with %s', async (_label, malformedChecksum) => {
    const catalog = makeCatalog();
    installFetch(catalog, async () => responseStub({
      ok: true,
      json: async () => ({
        source_rows: 3,
        stored_count: 3,
        checksum: `0x${fnv1a32Hex(catalog)}`,
        checksum_algorithm: 'fnv1a32',
        checksum_sha256: malformedChecksum,
      }),
    }));

    const result = await loadTestCatalog();

    expect(result.accepted).toBe(false);
    expect(result.acceptance.checksum.code).toBe('sha256-invalid');
    expect(result.checksumExpected).toBeUndefined();
    expect(result.rejectionReasons.map(({ code }) => code)).toContain('sha256-invalid');
  });

  it('returns a typed rejection for a valid but non-matching SHA-256', async () => {
    const catalog = makeCatalog();
    installFetch(catalog, async () => responseStub({
      ok: true,
      json: async () => ({
        source_rows: 3,
        stored_count: 3,
        checksum_sha256: '0'.repeat(64),
      }),
    }));

    const result = await loadTestCatalog();

    expect(result.accepted).toBe(false);
    expect(result.acceptance.checksum).toMatchObject({
      expected: '0'.repeat(64),
      enforced: true,
      passed: false,
      code: 'sha256-mismatch',
    });
    expect(result.rejectionReasons.map(({ code }) => code)).toContain('sha256-mismatch');
  });

  it('fails closed with a typed result when SHA-256 cannot be computed', async () => {
    const catalog = makeCatalog();
    const checksum = await sha256Hex(catalog);
    installFetch(catalog, async () => responseStub({
      ok: true,
      json: async () => ({
        source_rows: 3,
        stored_count: 3,
        checksum: `0x${fnv1a32Hex(catalog)}`,
        checksum_sha256: checksum,
      }),
    }));
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn().mockRejectedValue(new Error('digest unavailable')),
      },
    });

    const result = await loadTestCatalog();

    expect(result.accepted).toBe(false);
    expect(result.checksumActual).toBe('');
    expect(result.acceptance.checksum).toMatchObject({
      expected: checksum,
      enforced: true,
      passed: false,
      code: 'sha256-unavailable',
    });
    expect(result.rejectionReasons.map(({ code }) => code)).toEqual(['sha256-unavailable']);
  });
});

describe('Phase-1 asteroid catalog source status', () => {
  it('renders persistent verified, typed fallback, and load-failure states', () => {
    const element = {
      textContent: null as string | null,
      title: '',
      dataset: {} as DOMStringMap,
    };

    renderAsteroidCatalogSourceStatus(element, verifiedAsteroidCatalogStatus(100_000));
    expect(element.dataset.catalogState).toBe('verified');
    expect(element.textContent).toContain('integrity checked');
    expect(element.textContent).toContain('largest-first');
    expect(element.textContent).toContain('accuracy not certified');

    renderAsteroidCatalogSourceStatus(element, rejectedAsteroidCatalogStatus([
      { code: 'metadata-missing', message: 'metadata missing' },
      { code: 'sha256-missing', message: 'checksum missing' },
    ]));
    expect(element.dataset.catalogState).toBe('fallback');
    expect(element.textContent).toContain('metadata-missing, sha256-missing');

    renderAsteroidCatalogSourceStatus(element, failedAsteroidCatalogStatus());
    expect(element.dataset.catalogState).toBe('error');
    expect(element.textContent).toContain('catalog load failed');
    expect(element.title).toBe(element.textContent);
  });
});

describe('Phase-1 source fidelity and population policy', () => {
  it.each([1, 2])('retains ASPH-v%s identities and orbital fields through the shared conversion', async version => {
    const stride = version === 2 ? 12 : 11;
    const catalog = new ArrayBuffer(12 + stride * 4);
    new Uint8Array(catalog).set([65, 83, 80, 72, version, stride, 0, 0, 1, 0, 0, 0]);
    const view = new DataView(catalog);
    if (version === 2) view.setUint32(12, 42, true);
    const offset = version === 2 ? 16 : 12;
    [2451545, 2.5, 0.125, 10, 30, 40, 50, 1500, 20, 0.25, 2].forEach((value, index) => {
      view.setFloat32(offset + 4 * index, value, true);
    });
    installFetch(catalog, async () => responseStub({ ok: true, json: async () => ({
      stored_count: 1, source_rows: 1, checksum_sha256: await sha256Hex(catalog),
    }) }));

    const result = await loadTestCatalog();
    expect(result.accepted).toBe(true);
    expect(result.asteroids).toHaveLength(1);
    expect(result.asteroids[0]).toMatchObject({
      sourceId: version === 2 ? '42' : '1', taxonomy: 2, diameterKm: 20, albedo: 0.25,
      orbit: {
        epochJd: 2451545, aAu: 2.5, e: 0.125, iDeg: 10, ascendingNodeDeg: 30,
        argPeriapsisDeg: 40, meanAnomalyDeg: 50, periodDays: 1500,
      },
    });
  });

  it('preserves unknown science without rejecting an honest homogeneous prefix', async () => {
    const record = { ...makeRecord(42, 0), taxonomyIndex: 255, albedo: 0 };
    const catalog = writeAsteroidCatalogBinary([record]);
    installFetch(catalog, async () => responseStub({ ok: true, json: async () => ({
      stored_count: 1, source_rows: 1, checksum_sha256: await sha256Hex(catalog),
    }) }));
    const result = await loadTestCatalog();
    expect(result.accepted).toBe(true);
    expect(result.asteroids[0].taxonomy).toBe(255);
    expect(result.asteroids[0].albedo).toBeNull();
    expect(result.taxonomyCheck.counts).toMatchObject({ unknown: 1, C: 0, S: 0, M: 0 });
    expect(result).toMatchObject({
      fidelity: { status: 'not-independently-validated' },
      population: { policy: 'largest-first-prefix', representative: false },
    });
  });

  it('keeps the diameter-ordered prefix and reports its coverage without synthetic top-ups', async () => {
    const catalog = writeAsteroidCatalogBinary([30, 20, 10, 5].map((diameterKm, i) => ({
      ...makeRecord(i + 1, 0), diameterKm,
    })));
    installFetch(catalog, async () => responseStub({ ok: true, json: async () => ({
      stored_count: 4, source_rows: 4, checksum_sha256: await sha256Hex(catalog),
    }) }));
    const result = await loadTestCatalog();
    expect(result.accepted).toBe(true);
    expect(result.asteroids.map(a => a.sourceId)).toEqual(['1', '2', '3']);
    expect(result).toMatchObject({ population: { storedCount: 4, selectedCount: 3, fraction: 0.75 } });
    const population = generateAsteroidBelt(50_000, 42, {
      deterministicAsteroids: result.asteroids, includeNamed: false,
    });
    expect(population.count).toBe(3);
    expect(population.asteroids.map(a => a.sourceId)).toEqual(['1', '2', '3']);
  });
});
