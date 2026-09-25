import { afterEach, describe, expect, it, vi } from 'vitest';
import { SolarPhysicsClient } from './solarPhysicsClient';

const BASE_URL = 'http://localhost:8042';
const JD = 2_461_308.5;

function createClient(): SolarPhysicsClient {
  return new SolarPhysicsClient({ baseUrl: () => BASE_URL, pollIntervalMs: 900, timeoutMs: 2_600 });
}

function abortError(): DOMException {
  return new DOMException('This operation was aborted', 'AbortError');
}

/** A request that never answers; it only settles when its signal aborts. */
function hangUntilAborted(init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(abortError()));
  });
}

/** A 200 whose body arrives `delayMs` after the headers, and errors if the request is aborted. */
function delayedBodyResponse(json: string, delayMs: number, init?: RequestInit): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const handle = setTimeout(() => {
        controller.enqueue(new TextEncoder().encode(json));
        controller.close();
      }, delayMs);
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(handle);
        controller.error(abortError());
      });
    },
  });
  return new Response(body, { status: 200 });
}

/** How `/health` behaves: answering everyone, answering only no-cors requests, or not at all. */
function healthServer(behaviour: 'up' | 'refuses-origin' | 'down') {
  return (init?: RequestInit): Promise<Response> => {
    if (behaviour === 'down' || (behaviour === 'refuses-origin' && init?.mode !== 'no-cors')) {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    return Promise.resolve(new Response(null, { status: 200 }));
  };
}

function stubFetch(
  physics: (init?: RequestInit) => Promise<Response>,
  health: (init?: RequestInit) => Promise<Response> = healthServer('down')
) {
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => (
    `${input}`.endsWith('/health') ? health(init) : physics(init)
  ));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('SolarPhysicsClient deadlines', () => {
  it('does not report a timeout when the page was blocked while the reply arrived', async () => {
    vi.useFakeTimers();
    let deliver: ((response: Response) => void) | undefined;
    stubFetch((init) => new Promise<Response>((resolve, reject) => {
      deliver = resolve;
      init?.signal?.addEventListener('abort', () => reject(abortError()));
    }));
    const client = createClient();

    const pending = client.maybeRefresh(JD);
    vi.setSystemTime(Date.now() + 3_000);
    await vi.advanceTimersByTimeAsync(2_600);
    deliver?.(new Response('{"activity_index":0.5}', { status: 200 }));

    await expect(pending).resolves.toBe(true);
    expect(client.status().lastFailure).toBeNull();
  });

  it('still times out after the one-off grace when no reply ever comes', async () => {
    vi.useFakeTimers();
    stubFetch(hangUntilAborted);
    const client = createClient();

    const pending = client.maybeRefresh(JD);
    vi.setSystemTime(Date.now() + 3_000);
    await vi.advanceTimersByTimeAsync(2_600 + 1_000);

    await expect(pending).resolves.toBe(false);
    expect(client.status().lastFailure?.kind).toBe('timeout');
  });

  it('lets a reply whose headers arrived in time finish its body after the request timeout', async () => {
    vi.useFakeTimers();
    stubFetch((init) => Promise.resolve(delayedBodyResponse('{"activity_index":0.5}', 5_000, init)));
    const client = createClient();

    const pending = client.maybeRefresh(JD);
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(pending).resolves.toBe(true);
    expect(client.latestState()).toEqual({ activity_index: 0.5 });
  });

  it('gives up on a body that stalls past its own budget', async () => {
    vi.useFakeTimers();
    stubFetch((init) => Promise.resolve(delayedBodyResponse('{"activity_index":0.5}', 60_000, init)));
    const client = createClient();

    const pending = client.maybeRefresh(JD);
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(pending).resolves.toBe(false);
    expect(client.status().lastFailure?.kind).toBe('network');
  });

  it.each([
    ['60', 60_000],
    ['3600', 120_000],
    [null, 6_000],
  ] as const)('waits for Retry-After %s before the next attempt', async (retryAfter, waitMs) => {
    vi.useFakeTimers({ now: 1_000_000 });
    const headers: Record<string, string> = retryAfter ? { 'Retry-After': retryAfter } : {};
    stubFetch(() => Promise.resolve(new Response('{"detail":"Solar request rate limit exceeded; retry later."}', { status: 429, headers })));
    const client = createClient();

    await client.maybeRefresh(JD);

    expect(client.status().nextRefreshMs - 1_000_000).toBe(waitMs);
  });
});

describe('SolarPhysicsClient failure classification', () => {
  it('records a timeout when the server does not answer within timeoutMs', async () => {
    vi.useFakeTimers();
    stubFetch(hangUntilAborted);
    const client = createClient();

    const pending = client.maybeRefresh(JD);
    await vi.advanceTimersByTimeAsync(2_600);

    await expect(pending).resolves.toBe(false);
    const status = client.status();
    expect(status.lastFailure?.kind).toBe('timeout');
    expect(status.lastError).toBe('No reply from the solar server within 2.6 s');
    expect(status.consecutiveFailures).toBe(1);
    expect(status.timeoutMs).toBe(2_600);
  });

  it.each([
    [503, '{"detail":"Solar physics requests are temporarily saturated. Retry shortly."}', 'busy'],
    [503, '{"detail":"Solar physics generation timed out. Try again later."}', 'server-timeout'],
    [429, '{"detail":"Solar request rate limit exceeded; retry later."}', 'rate-limited'],
    [500, 'Internal Server Error', 'http'],
  ] as const)('classifies HTTP %i (%s) as %s', async (status, body, kind) => {
    stubFetch(() => Promise.resolve(new Response(body, { status })));
    const client = createClient();

    await client.maybeRefresh(JD);

    expect(client.status().lastFailure).toMatchObject({ kind, httpStatus: status });
    expect(client.status().consecutiveFailures).toBe(1);
  });

  it('counts consecutive failures until a success', async () => {
    stubFetch(() => Promise.resolve(new Response('busy', { status: 503 })));
    const client = createClient();
    await client.maybeRefresh(JD);
    await client.maybeRefresh(JD, true);
    expect(client.status().consecutiveFailures).toBe(2);
    expect(client.status().lastError).toBe('Solar physics request failed (503)');
  });

  it('reports a refused origin when only the no-cors probe reaches the server', async () => {
    const fetchMock = stubFetch(() => Promise.reject(new TypeError('Failed to fetch')), healthServer('refuses-origin'));
    const client = createClient();

    await client.maybeRefresh(JD);

    expect(client.status().lastFailure?.kind).toBe('blocked');
    const probeModes = fetchMock.mock.calls
      .filter(([input]) => `${input}`.endsWith('/health'))
      .map(([, init]) => init?.mode);
    expect(probeModes).toEqual(['cors', 'no-cors']);
  });

  it('reports a server error when the origin is allowed but the reply had no CORS headers', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')), healthServer('up'));
    const client = createClient();

    await client.maybeRefresh(JD);

    expect(client.status().lastFailure?.kind).toBe('server-error');
  });

  it('reports an unreachable server when both probes fail', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')), healthServer('down'));
    const client = createClient();

    await client.maybeRefresh(JD);

    expect(client.status().lastFailure?.kind).toBe('unreachable');
  });

  it.each([
    ['refuses-origin', 'blocked'],
    ['up', 'timeout'],
    ['down', 'timeout'],
  ] as const)('after a timeout with /health %s, reports %s', async (behaviour, kind) => {
    vi.useFakeTimers();
    stubFetch(hangUntilAborted, healthServer(behaviour));
    const client = createClient();

    const pending = client.maybeRefresh(JD);
    await vi.advanceTimersByTimeAsync(2_600);
    await pending;

    expect(client.status().lastFailure?.kind).toBe(kind);
  });

  it('reuses a probe verdict for 30 s instead of probing on every retry', async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch(() => Promise.reject(new TypeError('Failed to fetch')), healthServer('refuses-origin'));
    const client = createClient();
    const probes = () => fetchMock.mock.calls.filter(([input]) => `${input}`.endsWith('/health')).length;

    await client.maybeRefresh(JD);
    await vi.advanceTimersByTimeAsync(6_000);
    await client.maybeRefresh(JD);
    expect(probes()).toBe(2);
    expect(client.status().lastFailure?.kind).toBe('blocked');

    await vi.advanceTimersByTimeAsync(30_000);
    await client.maybeRefresh(JD);
    expect(probes()).toBe(4);
  });

  it('re-probes when a server that was unreachable starts answering and refuses the origin', async () => {
    vi.useFakeTimers();
    let serverUp = false;
    stubFetch(
      (init) => (serverUp ? hangUntilAborted(init) : Promise.reject(new TypeError('Failed to fetch'))),
      (init) => healthServer(serverUp ? 'refuses-origin' : 'down')(init)
    );
    const client = createClient();
    await client.maybeRefresh(JD);
    expect(client.status().lastFailure?.kind).toBe('unreachable');

    serverUp = true;
    await vi.advanceTimersByTimeAsync(6_000);
    const pending = client.maybeRefresh(JD);
    await vi.advanceTimersByTimeAsync(2_600);
    await pending;

    expect(client.status().lastFailure?.kind).toBe('blocked');
  });

  it('does not count dispose() during the probe as a server failure', async () => {
    let releaseProbe: (() => void) | undefined;
    stubFetch(
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => new Promise<Response>((resolve) => { releaseProbe = () => resolve(new Response(null)); })
    );
    const client = createClient();

    const pending = client.maybeRefresh(JD);
    await vi.waitFor(() => expect(releaseProbe).toBeDefined());
    client.dispose();
    releaseProbe?.();

    await expect(pending).resolves.toBe(false);
    expect(client.status().lastFailure).toBeNull();
  });

  it('rejects a JSON array as a physics payload', async () => {
    stubFetch(() => Promise.resolve(new Response('[]', { status: 200 })));
    const client = createClient();

    await client.maybeRefresh(JD);

    expect(client.status().lastFailure?.kind).toBe('invalid-response');
    expect(client.latestState()).toBeNull();
  });

  it('rejects a response body that is not a JSON object', async () => {
    stubFetch(() => Promise.resolve(new Response('not json', { status: 200 })));
    const client = createClient();

    await client.maybeRefresh(JD);

    expect(client.status().lastFailure?.kind).toBe('invalid-response');
    expect(client.latestState()).toBeNull();
  });

  it('clears the failure after a successful refresh', async () => {
    stubFetch(() => Promise.resolve(new Response('busy', { status: 503 })));
    const client = createClient();
    await client.maybeRefresh(JD);
    expect(client.status().consecutiveFailures).toBe(1);

    stubFetch(() => Promise.resolve(new Response('{"activity_index":0.4}', { status: 200 })));
    await expect(client.maybeRefresh(JD, true)).resolves.toBe(true);

    const status = client.status();
    expect(status.lastFailure).toBeNull();
    expect(status.lastError).toBeNull();
    expect(status.consecutiveFailures).toBe(0);
    expect(status.lastSuccessMs).toBeGreaterThan(0);
    expect(client.latestState()).toEqual({ activity_index: 0.4 });
  });

  it('does not count a request cancelled by dispose() as a server failure', async () => {
    stubFetch(hangUntilAborted);
    const client = createClient();

    const pending = client.maybeRefresh(JD);
    client.dispose();

    await expect(pending).resolves.toBe(false);
    expect(client.status().lastFailure).toBeNull();
    expect(client.status().consecutiveFailures).toBe(0);
  });

  it('ignores the outcome of a request superseded by a forced refresh', async () => {
    stubFetch(hangUntilAborted);
    const client = createClient();
    const superseded = client.maybeRefresh(JD);

    stubFetch(() => Promise.resolve(new Response('{"activity_index":0.6}', { status: 200 })));
    await expect(client.maybeRefresh(JD, true)).resolves.toBe(true);
    await expect(superseded).resolves.toBe(false);

    expect(client.status().lastFailure).toBeNull();
    expect(client.inFlight).toBe(false);
    expect(client.latestState()).toEqual({ activity_index: 0.6 });
  });
});
