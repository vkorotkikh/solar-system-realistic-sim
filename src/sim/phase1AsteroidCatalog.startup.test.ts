import { createHash } from 'node:crypto';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeAsteroidCatalogBinary } from '../data/asteroidCatalogLoader';
import { loadPhase1AsteroidCatalog } from './phase1AsteroidCatalog';

let sequence = 0;
function options() {
  const id = ++sequence;
  return { url: `/startup/${id}.bin`, metaUrl: `/startup/${id}.json`, maxRecords: 3, timeoutMs: 1000 };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function fixture() {
  const binary = writeAsteroidCatalogBinary([0, 1, 2].map(taxonomyIndex => ({
    sourceId: taxonomyIndex + 1, epochJd: 2461000.5, aAu: 2.7, e: 0.1,
    iDeg: 1, ascendingNodeDeg: 2, argPeriapsisDeg: 3, meanAnomalyDeg: 4,
    periodDays: 1600.1234, diameterKm: 10, albedo: 0.1, taxonomyIndex,
  })));
  const checksum = createHash('sha256').update(new Uint8Array(binary)).digest('hex');
  const metadata = { stored_count: 3, checksum_sha256: checksum };
  return { binary, checksum, metadata };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Phase-1 startup body overlap (SCN-005)', () => {
  it('consumes the binary before metadata completes while sharing and caching the accepted result', async () => {
    const { binary, checksum, metadata } = fixture();
    const gate = deferred<typeof metadata>();
    const binaryResponse = new Response(binary);
    const metadataResponse = new Response(JSON.stringify(metadata));
    vi.spyOn(metadataResponse, 'json').mockReturnValue(gate.promise);
    const fetcher = vi.fn(async (url: string) => url.endsWith('.bin') ? binaryResponse : metadataResponse);
    vi.stubGlobal('fetch', fetcher);
    const request = options();
    let settled = false;
    const pending = Promise.all([
      loadPhase1AsteroidCatalog(request), loadPhase1AsteroidCatalog(request),
    ]).finally(() => { settled = true; });

    await nextTurn();
    const beforeMetadata = { bodyUsed: binaryResponse.bodyUsed, settled };
    gate.resolve(metadata);
    const [first, second] = await pending;

    expect(beforeMetadata).toEqual({ bodyUsed: true, settled: false });
    expect(first.accepted).toBe(true);
    expect(first.sourceCount).toBe(3);
    expect(first.loadedCount).toBe(3);
    expect(first.checksumActual).toBe(checksum);
    expect(second).toBe(first);
    expect(await loadPhase1AsteroidCatalog(request)).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(['reject', 'throw', 'reject-undefined'] as const)(
    'retains an early body %s until metadata settles and permits a successful retry', async mode => {
      const { binary, metadata } = fixture();
      const gate = deferred<typeof metadata>();
      const binaryResponse = new Response(binary);
      const metadataResponse = new Response(JSON.stringify(metadata));
      const failure = new Error('binary body failed');
      const readBody = vi.spyOn(binaryResponse, 'arrayBuffer');
      if (mode === 'throw') readBody.mockImplementation(() => { throw failure; });
      else readBody.mockRejectedValue(mode === 'reject-undefined' ? undefined : failure);
      vi.spyOn(metadataResponse, 'json').mockReturnValue(gate.promise);
      vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('.bin') ? binaryResponse : metadataResponse));
      const request = options();
      let settled = false;
      const pending = loadPhase1AsteroidCatalog(request)
        .finally(() => { settled = true; }).catch((error: unknown) => error);

      // Crossing an event-loop turn exposes any unhandled early rejection to Vitest.
      await nextTurn();
      const beforeMetadata = { bodyAttempts: readBody.mock.calls.length, settled };
      gate.resolve(metadata);
      const error = await pending;

      expect(beforeMetadata).toEqual({ bodyAttempts: 1, settled: false });
      expect(error).toMatchObject({
        code: 'network-failed', message: mode === 'reject-undefined' ? 'undefined' : failure.message,
      });
      vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(
        url.endsWith('.bin') ? binary : JSON.stringify(metadata),
      )));
      expect((await loadPhase1AsteroidCatalog(request)).accepted).toBe(true);
    },
  );

  it('waits for metadata before reporting an HTTP error without consuming its response body', async () => {
    const { metadata } = fixture();
    const gate = deferred<typeof metadata>();
    const binaryResponse = new Response('unavailable', { status: 503, statusText: 'Service Unavailable' });
    const metadataResponse = new Response(JSON.stringify(metadata));
    vi.spyOn(metadataResponse, 'json').mockReturnValue(gate.promise);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('.bin') ? binaryResponse : metadataResponse));
    let settled = false;
    const pending = loadPhase1AsteroidCatalog(options())
      .finally(() => { settled = true; }).catch((error: unknown) => error);

    await nextTurn();
    const settledBeforeMetadata = settled;
    gate.resolve(metadata);
    const error = await pending;

    expect(settledBeforeMetadata).toBe(false);
    expect(binaryResponse.bodyUsed).toBe(false);
    expect(error).toMatchObject({ code: 'network-failed', message: expect.stringContaining('(503): Service Unavailable') });
  });

  it.each(['http', 'body'] as const)(
    'keeps the absolute deadline when metadata stalls after an early %s failure', async failureKind => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const { binary, metadata } = fixture();
      const gate = deferred<typeof metadata>();
      const binaryResponse = failureKind === 'http'
        ? new Response('unavailable', { status: 503 }) : new Response(binary);
      if (failureKind === 'body') vi.spyOn(binaryResponse, 'arrayBuffer').mockRejectedValue(new Error('body failed'));
      const metadataResponse = new Response(JSON.stringify(metadata));
      vi.spyOn(metadataResponse, 'json').mockReturnValue(gate.promise);
      const signals: AbortSignal[] = [];
      vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.signal) signals.push(init.signal);
        return url.endsWith('.bin') ? binaryResponse : metadataResponse;
      }));
      let settled = false;
      const pending = loadPhase1AsteroidCatalog({ ...options(), timeoutMs: 20 })
        .finally(() => { settled = true; }).catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(19);
      const settledBeforeDeadline = settled;
      await vi.advanceTimersByTimeAsync(2);
      const error = await pending;
      gate.resolve(metadata);
      await nextTurn();

      expect(settledBeforeDeadline).toBe(false);
      expect(error).toMatchObject({ code: 'timeout' });
      expect(signals).toHaveLength(2);
      expect(signals.every(signal => signal.aborted)).toBe(true);
    },
  );

  it('still reports a fetch rejection before stalled metadata settles', async () => {
    const { metadata } = fixture();
    const gate = deferred<typeof metadata>();
    const metadataResponse = new Response(JSON.stringify(metadata));
    vi.spyOn(metadataResponse, 'json').mockReturnValue(gate.promise);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('.bin')) throw new Error('binary transport failed');
      return metadataResponse;
    }));
    let settled = false;
    const pending = loadPhase1AsteroidCatalog(options())
      .finally(() => { settled = true; }).catch((error: unknown) => error);

    await nextTurn();
    const settledBeforeMetadata = settled;
    gate.resolve(metadata);
    const error = await pending;

    expect(settledBeforeMetadata).toBe(true);
    expect(error).toMatchObject({ code: 'network-failed', message: 'binary transport failed' });
  });

  it('does not let late metadata after a timeout overwrite a successful retry', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { binary, metadata } = fixture();
    const gate = deferred<typeof metadata>();
    const binaryResponse = new Response(binary);
    const metadataResponse = new Response(JSON.stringify(metadata));
    vi.spyOn(metadataResponse, 'json').mockReturnValue(gate.promise);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('.bin') ? binaryResponse : metadataResponse));
    const request = { ...options(), timeoutMs: 20 };
    const pending = loadPhase1AsteroidCatalog(request).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(21);
    const failure = await pending;
    const consumedBeforeRetry = binaryResponse.bodyUsed;
    const fetcher = vi.fn(async (url: string) => new Response(url.endsWith('.bin') ? binary : JSON.stringify(metadata)));
    vi.stubGlobal('fetch', fetcher);
    const recovered = await loadPhase1AsteroidCatalog(request);
    gate.resolve(metadata);
    await nextTurn();

    expect(failure).toMatchObject({ code: 'timeout' });
    expect(consumedBeforeRetry).toBe(true);
    expect(recovered.accepted).toBe(true);
    expect(await loadPhase1AsteroidCatalog(request)).toBe(recovered);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('includes the metadata wait in the unchanged two-second latency budget', async () => {
    const { binary, metadata } = fixture();
    const gate = deferred<typeof metadata>();
    const metadataResponse = new Response(JSON.stringify(metadata));
    vi.spyOn(metadataResponse, 'json').mockReturnValue(gate.promise);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('.bin') ? new Response(binary) : metadataResponse));
    const clock = vi.spyOn(performance, 'now').mockReturnValue(10);
    const pending = loadPhase1AsteroidCatalog(options());
    await nextTurn();
    clock.mockReturnValue(2011);
    gate.resolve(metadata);
    const result = await pending;

    expect(result.loadMs).toBe(2001);
    expect(result.acceptance.latency).toMatchObject({ loadMs: 2001, budgetMs: 2000, passed: false });
  });
});
