import { afterEach, describe, expect, it, vi } from 'vitest';

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
    expect(element.textContent).toContain('verified Phase-1 catalog (100,000 rows, SHA-256)');

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
