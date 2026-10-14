import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPhase1AsteroidCatalog } from './phase1AsteroidCatalog';
import { writeAsteroidCatalogBinary } from '../data/asteroidCatalogLoader';

let sequence = 0;
function options() {
  const id = ++sequence;
  return { url: `/lifecycle/${id}.bin`, metaUrl: `/lifecycle/${id}.json`, maxRecords: 3, timeoutMs: 20 };
}
async function fixture() {
  const binary = writeAsteroidCatalogBinary([0, 1, 2].map(taxonomyIndex => ({
    sourceId: taxonomyIndex + 1, epochJd: 2461000.5, aAu: 2.7, e: 0.1,
    iDeg: 1, ascendingNodeDeg: 2, argPeriapsisDeg: 3, meanAnomalyDeg: 4,
    periodDays: 1600.1234, diameterKm: 10, albedo: 0.1, taxonomyIndex,
  })));
  const hash = await crypto.subtle.digest('SHA-256', binary);
  const checksum = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  return { binary, checksum };
}
function respond(url: string, binary: ArrayBuffer, checksum: string) {
  return url.endsWith('.bin')
    ? new Response(binary)
    : new Response(JSON.stringify({ stored_count: 3, checksum_sha256: checksum }));
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Phase-1 bounded load lifecycle (SCN049 child)', () => {
  it('shares in-flight work and caches only successfully accepted parsing', async () => {
    const { binary, checksum } = await fixture();
    const fetcher = vi.fn(async (url: string) => respond(url, binary, checksum));
    vi.stubGlobal('fetch', fetcher);
    const request = { ...options(), timeoutMs: 1000 };
    const [first, second] = await Promise.all([loadPhase1AsteroidCatalog(request), loadPhase1AsteroidCatalog(request)]);
    const third = await loadPhase1AsteroidCatalog(request);
    expect(first.accepted).toBe(true);
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('evicts rejected integrity results so a corrected deployment can recover', async () => {
    const { binary, checksum } = await fixture();
    let declaredChecksum = '0'.repeat(64);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => respond(url, binary, declaredChecksum)));
    const request = { ...options(), timeoutMs: 1000 };
    const first = await loadPhase1AsteroidCatalog(request);
    expect(first.accepted).toBe(false);
    expect(first.rejectionReasons.map(r => r.code)).toContain('sha256-mismatch');
    declaredChecksum = checksum;
    expect((await loadPhase1AsteroidCatalog(request)).accepted).toBe(true);
  });

  it('reports network failures explicitly and retries after recovery', async () => {
    const { binary, checksum } = await fixture();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const request = { ...options(), timeoutMs: 1000 };
    await expect(loadPhase1AsteroidCatalog(request)).rejects.toMatchObject({ code: 'network-failed' });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => respond(url, binary, checksum)));
    expect((await loadPhase1AsteroidCatalog(request)).accepted).toBe(true);
  });

  it('bounds every shared wait even when fetch ignores abort, then allows retry', async () => {
    const { binary, checksum } = await fixture();
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal);
      return new Promise<Response>(() => {});
    }));
    const request = options();
    const failures: unknown[] = [];
    const first = loadPhase1AsteroidCatalog(request).catch(error => failures.push(error));
    const second = loadPhase1AsteroidCatalog(request).catch(error => failures.push(error));
    await vi.advanceTimersByTimeAsync(21);
    expect(failures).toHaveLength(2);
    expect(failures).toEqual([expect.objectContaining({ code: 'timeout' }), expect.objectContaining({ code: 'timeout' })]);
    expect(signals.length).toBe(2);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    await Promise.all([first, second]);
    vi.useRealTimers();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => respond(url, binary, checksum)));
    expect((await loadPhase1AsteroidCatalog(request)).accepted).toBe(true);
  });

  it('includes a stalled response body in the total deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, arrayBuffer: () => new Promise(() => {}), json: () => new Promise(() => {}),
    })));
    const failures: unknown[] = [];
    void loadPhase1AsteroidCatalog(options()).catch(error => failures.push(error));
    await vi.advanceTimersByTimeAsync(21);
    expect(failures).toEqual([expect.objectContaining({ code: 'timeout' })]);
  });

  it('caps simultaneous distinct loads and releases all admissions on timeout', async () => {
    const { binary, checksum } = await fixture();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const waiting = Array.from({ length: 4 }, () => loadPhase1AsteroidCatalog(options()).catch(error => error));
    await expect(loadPhase1AsteroidCatalog(options())).rejects.toMatchObject({ code: 'capacity-exceeded' });
    await vi.advanceTimersByTimeAsync(21);
    expect((await Promise.all(waiting)).every(error => error.code === 'timeout')).toBe(true);
    vi.useRealTimers();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => respond(url, binary, checksum)));
    expect((await loadPhase1AsteroidCatalog({ ...options(), timeoutMs: 1000 })).accepted).toBe(true);
  });

  it('distinguishes invalid binary from transport failure and does not cache it', async () => {
    const { binary, checksum } = await fixture();
    let current = new ArrayBuffer(1);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => respond(url, current, checksum)));
    const request = { ...options(), timeoutMs: 1000 };
    await expect(loadPhase1AsteroidCatalog(request)).rejects.toMatchObject({ code: 'binary-invalid' });
    current = binary;
    expect((await loadPhase1AsteroidCatalog(request)).accepted).toBe(true);
  });

  it('never lets a late post-timeout success overwrite a successful retry', async () => {
    const { binary, checksum } = await fixture();
    let finishBody!: (body: ArrayBuffer) => void;
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('.bin') ? {
      ok: true, arrayBuffer: () => new Promise<ArrayBuffer>(resolve => { finishBody = resolve; }),
    } : respond(url, binary, checksum)));
    const request = options();
    const failure = loadPhase1AsteroidCatalog(request).catch(error => error);
    await vi.advanceTimersByTimeAsync(21);
    expect((await failure).code).toBe('timeout');
    vi.useRealTimers();
    const fetcher = vi.fn(async (url: string) => respond(url, binary, checksum));
    vi.stubGlobal('fetch', fetcher);
    const recovered = await loadPhase1AsteroidCatalog(request);
    finishBody(binary);
    await Promise.resolve();
    await Promise.resolve();
    expect(await loadPhase1AsteroidCatalog(request)).toBe(recovered);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
