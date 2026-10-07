import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SOLAR_PHYSICS_MAX_FEATURES,
  SOLAR_PHYSICS_POLL_INTERVAL_MS,
  SOLAR_PHYSICS_REQUEST_TIMEOUT_MS,
  SolarPhysicsClient,
  type SolarForcingMode
} from './solarPhysicsClient';

const _forcingModeCompileSentinel: SolarForcingMode = 'hybrid';
void _forcingModeCompileSentinel;
// @ts-expect-error Unsupported observed modes must not enter the first-party client.
const _invalidForcingModeCompileSentinel: SolarForcingMode = 'unvalidated_observed';
void _invalidForcingModeCompileSentinel;

function responseWith(payload: Record<string, unknown>): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload
  } as Response;
}

function errorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({})
  } as Response;
}

function validPayload(
  epochJdTdb = 2_460_000.5,
  forcing: SolarForcingMode = 'hybrid'
): Record<string, unknown> {
  const hybrid = forcing === 'hybrid';
  return {
    schema: { name: 'solar_physics_state', version: 2 },
    epoch_jd_tdb: epochJdTdb,
    wall_epoch_jd_tdb: epochJdTdb,
    jd_time_scale: 'TDB',
    epoch_jd: epochJdTdb,
    wall_epoch_jd: epochJdTdb,
    forcing,
    effective_forcing: 'synthetic',
    live_data_requested: true,
    live_data_enabled: false,
    ...(hybrid ? { fallback_reason: 'disabled_unvalidated' } : {}),
    forcing_status: {
      requested: forcing,
      effective: 'synthetic',
      observed_input_status: hybrid ? 'disabled_unvalidated' : 'not_requested',
      runtime_eligible: false,
      ...(hybrid ? { fallback_reason: 'disabled_unvalidated' } : {})
    },
    activity_index: 0.42
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SolarPhysicsClient time contract', () => {
  it('ships a bounded cadence and waits beyond the backend compute ceiling', () => {
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test' });
    const underconfigured = new SolarPhysicsClient({
      baseUrl: () => 'http://backend.test',
      timeoutMs: 500
    });

    expect(client.pollIntervalMs).toBe(SOLAR_PHYSICS_POLL_INTERVAL_MS);
    expect(client.pollIntervalMs).toBeGreaterThanOrEqual(30_000);
    expect(client.timeoutMs).toBe(SOLAR_PHYSICS_REQUEST_TIMEOUT_MS);
    expect(client.timeoutMs).toBeGreaterThan(19_000);
    expect(client.timeoutMs).toBeLessThanOrEqual(20_000);
    expect(underconfigured.timeoutMs).toBe(SOLAR_PHYSICS_REQUEST_TIMEOUT_MS);
  });

  it('clamps and sends the backend-supported feature ceiling', async () => {
    let requestUrl = '';
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      requestUrl = String(input);
      return responseWith(validPayload());
    }));
    const client = new SolarPhysicsClient({
      baseUrl: () => 'http://backend.test',
      maxFeatures: 2_048
    });

    await expect(client.maybeRefresh(2_460_000.5, true)).resolves.toBe(true);

    expect(SOLAR_PHYSICS_MAX_FEATURES).toBe(256);
    expect(client.maxFeatures).toBe(SOLAR_PHYSICS_MAX_FEATURES);
    expect(new URL(requestUrl).searchParams.get('max_features')).toBe('256');
  });

  it('sends jd_tdb and accepts a labelled canonical response', async () => {
    let requestUrl = '';
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      requestUrl = String(input);
      return responseWith(validPayload());
    }));
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test' });

    await expect(client.maybeRefresh(2_460_000.5, true)).resolves.toBe(true);

    const query = new URL(requestUrl).searchParams;
    expect(query.get('jd_tdb')).toBe('2460000.50000000');
    expect(query.has('jd')).toBe(false);
    expect(client.latestState()?.jd_time_scale).toBe('TDB');
  });

  it.each([
    [{ ...validPayload(), jd_time_scale: 'UTC' }, 'time scale'],
    [{ ...validPayload(), epoch_jd_tdb: Number.NaN }, 'epoch_jd_tdb'],
    [{ ...validPayload(), wall_epoch_jd_tdb: undefined }, 'wall_epoch_jd_tdb'],
    [{ ...validPayload(), epoch_jd: 2_460_001.5 }, 'deprecated epoch_jd alias']
  ])('rejects an invalid canonical response (%s)', async (payload, message) => {
    vi.stubGlobal('fetch', vi.fn(async () => responseWith(payload)));
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test' });

    await expect(client.maybeRefresh(2_460_000.5, true)).resolves.toBe(false);

    expect(client.latestState()).toBeNull();
    expect(client.lastError).toContain(message);
  });

  it.each([
    [{ ...validPayload(), schema: { name: 'solar_physics_state', version: 1 } }, 'schema'],
    [{ ...validPayload(), schema: undefined }, 'schema'],
    [{ ...validPayload(), forcing: undefined }, 'forcing'],
    [{ ...validPayload(), effective_forcing: undefined }, 'effective_forcing'],
    [{ ...validPayload(), forcing_status: undefined }, 'forcing_status'],
    [{ ...validPayload(), forcing: 'synthetic' }, 'requested forcing']
  ])('rejects a stale or mislabeled contract (%s)', async (payload, message) => {
    vi.stubGlobal('fetch', vi.fn(async () => responseWith(payload)));
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test' });

    await expect(client.maybeRefresh(2_460_000.5, true)).resolves.toBe(false);

    expect(client.latestState()).toBeNull();
    expect(client.lastError).toContain(message);
  });

  it('accepts an explicitly disabled hybrid fallback contract', async () => {
    const payload = {
      ...validPayload(),
      forcing: 'hybrid',
      effective_forcing: 'synthetic',
      live_data_requested: true,
      live_data_enabled: false,
      fallback_reason: 'disabled_unvalidated',
      forcing_status: {
        requested: 'hybrid',
        effective: 'synthetic',
        observed_input_status: 'disabled_unvalidated',
        runtime_eligible: false,
        fallback_reason: 'disabled_unvalidated'
      }
    };
    vi.stubGlobal('fetch', vi.fn(async () => responseWith(payload)));
    const client = new SolarPhysicsClient({
      baseUrl: () => 'http://backend.test',
      forcing: 'hybrid',
      liveData: true
    });

    await expect(client.maybeRefresh(2_460_000.5, true)).resolves.toBe(true);

    expect(client.latestState()?.forcing_status?.observed_input_status).toBe(
      'disabled_unvalidated'
    );
  });

  it('surfaces a provider-unavailable 503 without replacing state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => errorResponse(503)));
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test' });

    await expect(client.maybeRefresh(2_460_000.5, true)).resolves.toBe(false);

    expect(client.latestState()).toBeNull();
    expect(client.lastError).toContain('(503)');
  });

  it('retains the last-known-good response when a later payload is invalid', async () => {
    const first = validPayload();
    const invalid = { ...validPayload(2_460_001.5), jd_time_scale: 'UTC' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWith(first))
      .mockResolvedValueOnce(responseWith(invalid));
    vi.stubGlobal('fetch', fetchMock);
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test' });

    await expect(client.maybeRefresh(2_460_000.5, true)).resolves.toBe(true);
    const lastKnownGood = client.latestState();
    await expect(client.maybeRefresh(2_460_001.5, true)).resolves.toBe(false);

    expect(client.latestState()).toBe(lastKnownGood);
    expect(client.lastError).toContain('time scale');
  });

  it.each([
    [{ ...validPayload(2_460_001.5), schema: { name: 'solar_physics_state', version: 1 } }, 'schema'],
    [{ ...validPayload(2_460_001.5), forcing: 'synthetic' }, 'requested forcing']
  ])('does not replace last-known-good with stale or mislabeled payload (%s)', async (invalid, message) => {
    const first = validPayload();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWith(first))
      .mockResolvedValueOnce(responseWith(invalid));
    vi.stubGlobal('fetch', fetchMock);
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test' });

    await expect(client.maybeRefresh(2_460_000.5, true)).resolves.toBe(true);
    const lastKnownGood = client.latestState();
    await expect(client.maybeRefresh(2_460_001.5, true)).resolves.toBe(false);

    expect(client.latestState()).toBe(lastKnownGood);
    expect(client.lastError).toContain(message);
  });

  it('keeps newer forced-refresh ownership when an aborted request settles late', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      return signals.length === 1 ? first.promise : second.promise;
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test' });

    const oldRequest = client.maybeRefresh(2_460_000.5, true);
    const newRequest = client.maybeRefresh(2_460_001.5, true);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    first.reject(new Error('late aborted request'));
    await expect(oldRequest).resolves.toBe(false);
    expect(client.inFlight).toBe(true);
    expect(client.abortController).not.toBeNull();
    expect(signals[1].aborted).toBe(false);
    expect(client.lastError).toBeNull();

    second.resolve(responseWith(validPayload(2_460_001.5)));
    await expect(newRequest).resolves.toBe(true);
    expect(client.latestState()?.epoch_jd_tdb).toBe(2_460_001.5);
    expect(client.inFlight).toBe(false);
    expect(client.abortController).toBeNull();
    expect(client.lastError).toBeNull();
  });

  it('makes disposal terminal and suppresses a late response', async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn(() => pending.promise);
    vi.stubGlobal('fetch', fetchMock);
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test' });

    const refresh = client.maybeRefresh(2_460_000.5, true);
    client.dispose();
    pending.resolve(responseWith(validPayload()));

    await expect(refresh).resolves.toBe(false);
    await expect(client.maybeRefresh(2_460_001.5, true)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(client.latestState()).toBeNull();
    expect(client.status()).toMatchObject({ disposed: true, inFlight: false });
  });
});

describe('SolarPhysicsClient failure classification', () => {
  const BASE_URL = 'http://localhost:8042';
  const JD = 2_460_000.5;

  function abortError(): DOMException {
    return new DOMException('This operation was aborted', 'AbortError');
  }

  /** A request that never answers; it only settles when its signal aborts. */
  function hangUntilAborted(init?: RequestInit): Promise<Response> {
    return new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(abortError()));
    });
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

  function structuredError(status: number, code: string, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify({ detail: { code, message: `${code} message`, retryable: true } }), { status, headers });
  }

  const createClient = () => new SolarPhysicsClient({ baseUrl: () => BASE_URL });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records a timeout when the server does not answer within the request deadline', async () => {
    vi.useFakeTimers();
    stubFetch(hangUntilAborted);
    const client = createClient();

    const pending = client.maybeRefresh(JD, true);
    await vi.advanceTimersByTimeAsync(SOLAR_PHYSICS_REQUEST_TIMEOUT_MS);

    await expect(pending).resolves.toBe(false);
    const status = client.status();
    expect(status.lastFailure?.kind).toBe('timeout');
    expect(status.lastError).toBe('No reply from the solar server within 20 s');
    expect(status.consecutiveFailures).toBe(1);
    expect(status.timeoutMs).toBe(SOLAR_PHYSICS_REQUEST_TIMEOUT_MS);
  });

  it.each([
    [503, 'solar_compute_saturated', 'busy'],
    [503, 'solar_compute_timeout', 'server-timeout'],
    [429, 'solar_rate_limit_exceeded', 'rate-limited'],
    [503, 'solar_compute_worker_crashed', 'http'],
    [400, 'jd_out_of_range', 'http'],
  ] as const)('classifies HTTP %i %s as %s and keeps the code', async (status, code, kind) => {
    stubFetch(() => Promise.resolve(structuredError(status, code)));
    const client = createClient();

    await client.maybeRefresh(JD, true);

    expect(client.status().lastFailure).toMatchObject({ kind, httpStatus: status, code });
    expect(client.lastError).toContain(`(${status}): ${code} message`);
  });

  it('reports a refused origin when only the no-cors probe reaches the server', async () => {
    const fetchMock = stubFetch(() => Promise.reject(new TypeError('Failed to fetch')), healthServer('refuses-origin'));
    const client = createClient();

    await client.maybeRefresh(JD, true);

    expect(client.status().lastFailure?.kind).toBe('blocked');
    const probeModes = fetchMock.mock.calls
      .filter(([input]) => `${input}`.endsWith('/health'))
      .map(([, init]) => init?.mode);
    expect(probeModes).toEqual(['cors', 'no-cors']);
  });

  it.each([
    ['up', 'server-error'],
    ['down', 'unreachable'],
  ] as const)('after a TypeError with /health %s, reports %s', async (behaviour, kind) => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')), healthServer(behaviour));
    const client = createClient();

    await client.maybeRefresh(JD, true);

    expect(client.status().lastFailure?.kind).toBe(kind);
  });

  it.each([
    ['refuses-origin', 'blocked'],
    ['up', 'timeout'],
    ['down', 'timeout'],
  ] as const)('after a timeout with /health %s, reports %s', async (behaviour, kind) => {
    vi.useFakeTimers();
    stubFetch(hangUntilAborted, healthServer(behaviour));
    const client = createClient();

    const pending = client.maybeRefresh(JD, true);
    await vi.advanceTimersByTimeAsync(SOLAR_PHYSICS_REQUEST_TIMEOUT_MS);
    await pending;

    expect(client.status().lastFailure?.kind).toBe(kind);
  });

  it('reuses a probe verdict for the same kind of failure, and re-probes once a timeout contradicts it', async () => {
    vi.useFakeTimers();
    let serverUp = false;
    const fetchMock = stubFetch(
      (init) => (serverUp ? hangUntilAborted(init) : Promise.reject(new TypeError('Failed to fetch'))),
      (init) => healthServer(serverUp ? 'refuses-origin' : 'down')(init)
    );
    const probes = () => fetchMock.mock.calls.filter(([input]) => `${input}`.endsWith('/health')).length;
    const client = createClient();

    await client.maybeRefresh(JD, true);
    await client.maybeRefresh(JD, true);
    expect(client.status().lastFailure?.kind).toBe('unreachable');
    expect(probes()).toBe(2);

    serverUp = true;
    const pending = client.maybeRefresh(JD, true);
    await vi.advanceTimersByTimeAsync(SOLAR_PHYSICS_REQUEST_TIMEOUT_MS);
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

    const pending = client.maybeRefresh(JD, true);
    await vi.waitFor(() => expect(releaseProbe).toBeDefined());
    client.dispose();
    releaseProbe?.();

    await expect(pending).resolves.toBe(false);
    expect(client.status().lastFailure).toBeNull();
  });

  it('classifies an invalid payload as invalid-response and keeps the validation message', async () => {
    stubFetch(() => Promise.resolve(responseWith({ ...validPayload(JD), jd_time_scale: 'UTC' })));
    const client = createClient();

    await client.maybeRefresh(JD, true);

    expect(client.status().lastFailure?.kind).toBe('invalid-response');
    expect(client.lastError).toContain('time scale');
  });

  it('clears the failure after a successful refresh', async () => {
    stubFetch(() => Promise.resolve(structuredError(503, 'solar_compute_saturated')));
    const client = createClient();
    await client.maybeRefresh(JD, true);
    expect(client.status().consecutiveFailures).toBe(1);

    stubFetch(() => Promise.resolve(responseWith(validPayload(JD))));
    await expect(client.maybeRefresh(JD, true)).resolves.toBe(true);

    expect(client.status()).toMatchObject({ lastFailure: null, lastError: null, consecutiveFailures: 0 });
  });

  it.each([
    ['60', 60_000],
    ['3600', 120_000],
    [null, 30_000],
  ] as const)('waits for Retry-After %s before the next attempt', async (retryAfter, waitMs) => {
    vi.useFakeTimers({ now: 1_000_000 });
    stubFetch(() => Promise.resolve(structuredError(429, 'solar_rate_limit_exceeded', retryAfter ? { 'Retry-After': retryAfter } : {})));
    const client = createClient();

    await client.maybeRefresh(JD, true);

    expect(client.status().nextRefreshMs - 1_000_000).toBe(waitMs);
  });
});
