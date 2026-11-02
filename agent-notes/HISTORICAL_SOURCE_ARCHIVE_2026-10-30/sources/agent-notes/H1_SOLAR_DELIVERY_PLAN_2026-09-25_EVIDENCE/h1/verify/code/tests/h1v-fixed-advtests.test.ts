// THROW-AWAY adversarial tests for fix/solar-data-status-notice (728d21c). Not for commit.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SolarPhysicsClient } from './h1v-fixed-client';

const BASE_URL = 'http://localhost:8042';
const JD = 2_461_308.5;

function createClient(): SolarPhysicsClient {
  return new SolarPhysicsClient({ baseUrl: () => BASE_URL, pollIntervalMs: 900, timeoutMs: 2_600 });
}

function abortError(reason?: unknown): unknown {
  return reason ?? new DOMException('This operation was aborted', 'AbortError');
}

/**
 * Browser-faithful response: per Fetch "abort a fetch() call", when the request signal
 * aborts after headers arrived, the response body stream is errored with the abort reason.
 * `chunks` are enqueued immediately; if `endBody` is false the stream never closes.
 */
function signalAwareResponse(
  init: RequestInit | undefined,
  status: number,
  chunks: string[],
  endBody: boolean
): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      for (const c of chunks) ctrl.enqueue(enc.encode(c));
      if (endBody) ctrl.close();
      init?.signal?.addEventListener('abort', () => {
        try { ctrl.error(abortError((init.signal as AbortSignal).reason)); } catch { /* closed */ }
      });
    }
  });
  return new Response(stream, { status, headers: { 'content-type': 'application/json' } });
}

interface Deferred<T> { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

type Handler = (init?: RequestInit) => Promise<Response>;
function stubFetch(physics: Handler, health: Handler) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: `${input}`, init });
    return `${input}`.endsWith('/health') ? health(init) : physics(init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ADV-1 dispose() while the no-cors probe is running', () => {
  it('should not record a server failure, and should cancel the probe', async () => {
    const probe = deferred<Response>();
    let probeSignal: AbortSignal | undefined;
    stubFetch(
      () => Promise.reject(new TypeError('Failed to fetch')),
      (init) => { probeSignal = init?.signal ?? undefined; return probe.promise; }
    );
    const client = createClient();
    const pending = client.maybeRefresh(JD);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(probeSignal).toBeDefined(); // probe is in flight

    client.dispose();
    const probeAbortedByDispose = probeSignal?.aborted ?? null;
    probe.resolve(new Response(null, { status: 200 }));
    await pending;

    // Record what actually happened for the report, then assert the desired behaviour.
    console.log('[ADV-1] probe aborted by dispose:', probeAbortedByDispose,
      '| lastFailure:', JSON.stringify(client.status().lastFailure?.kind ?? null),
      '| consecutiveFailures:', client.status().consecutiveFailures);
    expect(client.status().lastFailure).toBeNull();
    expect(client.status().consecutiveFailures).toBe(0);
  });
});

describe('ADV-2 dispose() while the 200 body is being read', () => {
  it('should not record invalid-response', async () => {
    let physInit: RequestInit | undefined;
    stubFetch(
      (init) => { physInit = init; return Promise.resolve(signalAwareResponse(init, 200, ['{"activity_'], false)); },
      () => Promise.resolve(new Response(null, { status: 200 }))
    );
    const client = createClient();
    const pending = client.maybeRefresh(JD);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    expect(physInit).toBeDefined();
    client.dispose();
    await pending;
    console.log('[ADV-2] lastFailure after dispose mid-body:', JSON.stringify(client.status().lastFailure));
    expect(client.status().lastFailure).toBeNull();
  });
});

describe('ADV-3 dispose() while a 503 error body is being read', () => {
  it('should not record busy', async () => {
    stubFetch(
      (init) => Promise.resolve(signalAwareResponse(init, 503, ['{"detail":"Solar physics generation timed'], false)),
      () => Promise.resolve(new Response(null, { status: 200 }))
    );
    const client = createClient();
    const pending = client.maybeRefresh(JD);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    client.dispose();
    await pending;
    console.log('[ADV-3] lastFailure after dispose mid-error-body:', JSON.stringify(client.status().lastFailure?.kind));
    expect(client.status().lastFailure).toBeNull();
  });
});

describe('HOLD-1 the timeout bounds a stalled error-detail body read', () => {
  it('settles at timeoutMs and does not hang', async () => {
    vi.useFakeTimers();
    stubFetch(
      (init) => Promise.resolve(signalAwareResponse(init, 503, ['{"detail":"Solar physics generation timed'], false)),
      () => Promise.resolve(new Response(null, { status: 200 }))
    );
    const client = createClient();
    let settled = false;
    const pending = client.maybeRefresh(JD).then((v) => { settled = true; return v; });
    await vi.advanceTimersByTimeAsync(2_599);
    const settledBefore = settled;
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    console.log('[HOLD-1] settled before timeout:', settledBefore, '| kind:', client.status().lastFailure?.kind,
      '| msg:', client.status().lastError);
    expect(settledBefore).toBe(false);
    expect(settled).toBe(true);
    // The real body said "timed out" but it never finished arriving: classified as busy.
    expect(client.status().lastFailure?.kind).toBe('busy');
  });

  it('settles at timeoutMs when a 200 body stalls, and classifies as timeout', async () => {
    vi.useFakeTimers();
    stubFetch(
      (init) => Promise.resolve(signalAwareResponse(init, 200, ['{"activity_'], false)),
      () => Promise.resolve(new Response(null, { status: 200 }))
    );
    const client = createClient();
    const pending = client.maybeRefresh(JD);
    await vi.advanceTimersByTimeAsync(2_600);
    await expect(pending).resolves.toBe(false);
    expect(client.status().lastFailure?.kind).toBe('timeout');
  });
});

describe('HOLD-2 timeout firing while the probe runs', () => {
  it('keeps the probe verdict (the TypeError came first) and is bounded by probe timeout', async () => {
    vi.useFakeTimers();
    // physics fails with TypeError after 2.0 s; probe hangs until its own 2 s abort.
    stubFetch(
      () => new Promise((_, rej) => setTimeout(() => rej(new TypeError('Failed to fetch')), 2_000)),
      (init) => new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(abortError())))
    );
    const client = createClient();
    let settledAt = -1;
    const t0 = Date.now();
    const pending = client.maybeRefresh(JD).then((v) => { settledAt = Date.now() - t0; return v; });
    await vi.advanceTimersByTimeAsync(5_000);
    await pending;
    console.log('[HOLD-2] settled after ms:', settledAt, '| kind:', client.status().lastFailure?.kind);
    expect(settledAt).toBe(4_000);
    expect(client.status().lastFailure?.kind).toBe('unreachable');
  });
});

describe('HOLD-3 forced refresh superseding a request that is mid-probe', () => {
  it('the old probe verdict does not overwrite the newer success', async () => {
    const probe = deferred<Response>();
    let physicsCalls = 0;
    const { calls } = stubFetch(
      () => {
        physicsCalls += 1;
        return physicsCalls === 1
          ? Promise.reject(new TypeError('Failed to fetch'))
          : Promise.resolve(new Response('{"activity_index":0.6}', { status: 200 }));
      },
      () => probe.promise
    );
    const client = createClient();
    const old = client.maybeRefresh(JD);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    await expect(client.maybeRefresh(JD, true)).resolves.toBe(true);
    probe.resolve(new Response(null, { status: 200 }));
    await expect(old).resolves.toBe(false);
    expect(client.status().lastFailure).toBeNull();
    expect(client.inFlight).toBe(false);
    expect(client.abortController).toBeNull();
    expect(client.latestState()).toEqual({ activity_index: 0.6 });
    // Note for report: the superseded probe was not cancelled.
    const healthCall = calls.find((c) => c.url.endsWith('/health'));
    console.log('[HOLD-3] superseded probe signal aborted:', healthCall?.init?.signal?.aborted);
  });

  it('the old probe verdict does not overwrite a newer, different failure', async () => {
    const probe = deferred<Response>();
    let physicsCalls = 0;
    stubFetch(
      () => {
        physicsCalls += 1;
        return physicsCalls === 1
          ? Promise.reject(new TypeError('Failed to fetch'))
          : Promise.resolve(new Response('{"detail":"Solar request rate limit exceeded; retry later."}', { status: 429 }));
      },
      () => probe.promise
    );
    const client = createClient();
    const old = client.maybeRefresh(JD);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    await client.maybeRefresh(JD, true);
    probe.resolve(new Response(null, { status: 200 }));
    await old;
    expect(client.status().lastFailure?.kind).toBe('rate-limited');
    expect(client.status().consecutiveFailures).toBe(1);
  });
});

describe('HOLD-4 own-abort never misclassified', () => {
  it.each([
    ['DOMException AbortError (Chrome/Firefox/Safari default reason)', () => new DOMException('signal is aborted without reason', 'AbortError')],
    ['custom non-DOMException reason', () => new Error('custom reason')],
    ['a TypeError as abort reason (hypothetical engine)', () => new TypeError('cancelled')],
  ] as const)('timeout -> timeout kind when fetch rejects with %s', async (_label, make) => {
    vi.useFakeTimers();
    stubFetch(
      (init) => new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(make()))),
      () => Promise.resolve(new Response(null, { status: 200 }))
    );
    const client = createClient();
    const pending = client.maybeRefresh(JD);
    await vi.advanceTimersByTimeAsync(2_600);
    await pending;
    expect(client.status().lastFailure?.kind).toBe('timeout');
  });

  it('a supersede abort that surfaces as TypeError still starts a probe (extra request)', async () => {
    const { calls } = stubFetch(
      (init) => new Promise((resolve, rej) => {
        if (calls.filter((c) => !c.url.endsWith('/health')).length > 1) {
          resolve(new Response('{"activity_index":0.1}', { status: 200 }));
          return;
        }
        init?.signal?.addEventListener('abort', () => rej(new TypeError('cancelled')));
      }),
      () => Promise.resolve(new Response(null, { status: 200 }))
    );
    const client = createClient();
    const old = client.maybeRefresh(JD);
    await client.maybeRefresh(JD, true);
    await old;
    const probes = calls.filter((c) => c.url.endsWith('/health')).length;
    console.log('[HOLD-4b] probes after a TypeError-shaped supersede abort:', probes, '| lastFailure:', client.status().lastFailure);
    expect(client.status().lastFailure).toBeNull();
  });
});

describe('HOLD-5 probe only after TypeError', () => {
  it.each([
    ['timeout', 'timeout'],
    ['503 busy', 'busy'],
    ['429', 'rate-limited'],
    ['500 with CORS headers', 'http'],
    ['invalid json', 'invalid-response'],
  ] as const)('%s does not probe', async (label, kind) => {
    vi.useFakeTimers();
    const handlers: Record<string, Handler> = {
      timeout: (init) => new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(abortError()))),
      '503 busy': () => Promise.resolve(new Response('{"detail":"Solar physics requests are temporarily saturated. Retry shortly."}', { status: 503 })),
      '429': () => Promise.resolve(new Response('{"detail":"Solar request rate limit exceeded; retry later."}', { status: 429 })),
      '500 with CORS headers': () => Promise.resolve(new Response('Internal Server Error', { status: 500 })),
      'invalid json': () => Promise.resolve(new Response('nope', { status: 200 })),
    };
    const { calls } = stubFetch(handlers[label], () => Promise.resolve(new Response(null, { status: 200 })));
    const client = createClient();
    const pending = client.maybeRefresh(JD);
    await vi.advanceTimersByTimeAsync(2_600);
    await pending;
    expect(client.status().lastFailure?.kind).toBe(kind);
    expect(calls.filter((c) => c.url.endsWith('/health'))).toHaveLength(0);
  });
});

describe('ADV-4 payload shape check', () => {
  it('a JSON array is accepted as a valid solar payload', async () => {
    stubFetch(() => Promise.resolve(new Response('[]', { status: 200 })), () => Promise.resolve(new Response(null)));
    const client = createClient();
    const ok = await client.maybeRefresh(JD);
    console.log('[ADV-4] [] accepted:', ok, '| latest:', JSON.stringify(client.latestState()));
    expect(ok).toBe(false);
  });
});

describe('ADV-5 a CORS-refused origin is reported as a timeout while compute takes 8-10 s', () => {
  it('the TypeError only arrives with the (slow) response, after our 2.6 s abort', async () => {
    vi.useFakeTimers();
    // Starlette CORSMiddleware runs the endpoint for a disallowed simple GET and only omits ACAO,
    // so the browser can only reject (TypeError) once the ~9 s response arrives.
    stubFetch(
      (init) => new Promise((_, rej) => {
        const t = setTimeout(() => rej(new TypeError('Failed to fetch')), 9_000);
        init?.signal?.addEventListener('abort', () => { clearTimeout(t); rej(abortError()); });
      }),
      () => Promise.resolve(new Response(null, { status: 200 }))
    );
    const client = createClient();
    const pending = client.maybeRefresh(JD);
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
    console.log('[ADV-5] disallowed origin + 9 s compute ->', client.status().lastFailure?.kind);
    expect(client.status().lastFailure?.kind).toBe('blocked');
  });
});

describe('ADV-6 server-timeout (503 "timed out") cannot be observed with timeoutMs 2.6 s < server budget 12 s', () => {
  it('the 503 arrives at 12 s, 9.4 s after the client gave up', async () => {
    vi.useFakeTimers();
    stubFetch(
      (init) => new Promise((res, rej) => {
        const t = setTimeout(() => res(new Response('{"detail":"Solar physics generation timed out. Try again later."}', { status: 503 })), 12_000);
        init?.signal?.addEventListener('abort', () => { clearTimeout(t); rej(abortError()); });
      }),
      () => Promise.resolve(new Response(null, { status: 200 }))
    );
    const client = createClient();
    const pending = client.maybeRefresh(JD);
    await vi.advanceTimersByTimeAsync(13_000);
    await pending;
    console.log('[ADV-6] server compute budget exhausted ->', client.status().lastFailure?.kind);
    expect(client.status().lastFailure?.kind).toBe('server-timeout');
  });
});

describe('HOLD-6 no supersede re-check after the 200 body is read', () => {
  it('a superseded request whose body still completes overwrites latest (only if the body ignores abort)', async () => {
    const body = deferred<string>();
    let n = 0;
    stubFetch(
      (init) => {
        n += 1;
        if (n === 1) {
          // NOT signal-aware: real browsers error the body on abort, so this is a mock-only path.
          const r = new Response('{}', { status: 200 });
          Object.defineProperty(r, 'json', { value: () => body.promise.then(JSON.parse) });
          return Promise.resolve(r);
        }
        return new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(abortError())));
      },
      () => Promise.resolve(new Response(null, { status: 200 }))
    );
    const client = createClient();
    const old = client.maybeRefresh(JD);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    const newer = client.maybeRefresh(JD, true);
    body.resolve('{"activity_index":0.99,"stale":true}');
    const oldResult = await old;
    console.log('[HOLD-6] superseded request returned', oldResult, 'latest =', JSON.stringify(client.latestState()));
    client.dispose();
    await newer;
    expect(oldResult).toBe(false);
  });
});
