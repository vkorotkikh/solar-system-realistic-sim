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

// FE-PHYSICS-OPTIONS. Found by /qa on 2026-10-24:
// agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md.
// This finite-input boundary does not expose the separate SDEL065 factory configuration.
describe('SolarPhysicsClient finite numeric options', () => {
  const optionNames = ['pollIntervalMs', 'timeoutMs', 'maxFeatures'] as const;

  it.each(optionNames.flatMap((option) =>
    [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY].map((input) => ({ option, input }))))(
    'rejects $option=$input before any request or timer starts', ({ option, input }) => {
      const fetchMock = vi.fn();
      const timerSpy = vi.spyOn(globalThis, 'setTimeout');
      const baseUrl = vi.fn(() => 'http://backend.test');
      vi.stubGlobal('fetch', fetchMock);

      expect(() => new SolarPhysicsClient({ baseUrl, [option]: input })).toThrowError(
        new RangeError(`Solar physics ${option} must be finite`)
      );
      expect(baseUrl).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(timerSpy).not.toHaveBeenCalled();
    }
  );

  it.each([{}, { pollIntervalMs: undefined, timeoutMs: undefined, maxFeatures: undefined }])(
    'preserves defaults for omitted or undefined numeric options (%j)', (options) => {
      const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test', ...options });
      expect(client).toMatchObject({ pollIntervalMs: 30_000, timeoutMs: 20_000, maxFeatures: 220 });
    }
  );

  it.each([
    [-1, 5_000], [0, 5_000], [5_000, 5_000], [30_000, 30_000],
    [60_000, 60_000], [120_000, 120_000], [300_000, 300_000], [900_000, 300_000],
  ])('preserves finite poll interval %i → %i', (input, expected) => {
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test', pollIntervalMs: input });
    expect(client.pollIntervalMs).toBe(expected);
  });

  it.each([-1, 0, 500, 19_000, 20_000, 30_000])('preserves the 20 s delivery contract for finite timeout %i', (input) => {
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test', timeoutMs: input });
    expect(client.timeoutMs).toBe(20_000);
  });

  it.each([
    [-1, 8], [0, 8], [7.6, 8], [8, 8], [180, 180], [220, 220], [255.6, 255.6], [256, 256], [2_048, 256],
  ])('preserves finite maxFeatures %s → %s', (input, expected) => {
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test', maxFeatures: input });
    expect(client.maxFeatures).toBe(expected);
  });

  it.each([
    [{ pollIntervalMs: '60000', timeoutMs: '30000', maxFeatures: '180' }, { pollIntervalMs: 60_000, timeoutMs: 20_000, maxFeatures: 180 }],
    [{ pollIntervalMs: null, timeoutMs: null, maxFeatures: null }, { pollIntervalMs: 5_000, timeoutMs: 20_000, maxFeatures: 8 }],
  ])('preserves existing finite Number coercion for runtime callers (%j)', (options, expected) => {
    // Runtime compatibility is intentionally narrower than widening the declared number-only API.
    const client = new SolarPhysicsClient({
      baseUrl: () => 'http://backend.test',
      ...options as unknown as { pollIntervalMs: number; timeoutMs: number; maxFeatures: number },
    });
    expect(client).toMatchObject(expected);
  });

  it.each(optionNames)('coerces %s exactly once before clamping', (option) => {
    const firstValue = option === 'maxFeatures' ? 180 : 60_000;
    const valueOf = vi.fn().mockReturnValueOnce(firstValue).mockReturnValue(Number.NaN);
    const client = new SolarPhysicsClient({
      baseUrl: () => 'http://backend.test', [option]: { valueOf } as unknown as number,
    });

    expect(valueOf).toHaveBeenCalledOnce();
    expect(client[option]).toBe(option === 'timeoutMs' ? 20_000 : firstValue);
  });

  it('rounds a finite fractional feature count only when constructing the request', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) => responseWith(validPayload()));
    vi.stubGlobal('fetch', fetchMock);
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test', maxFeatures: 255.6 });
    expect(client.maxFeatures).toBe(255.6);

    await expect(client.maybeRefresh(2_460_000.5, true)).resolves.toBe(true);
    const url = `${fetchMock.mock.calls[0][0]}`;
    expect(new URL(url).searchParams.get('max_features')).toBe('256');
  });
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

  // FE-PHYSICS-DEADLINE (SDEL075). Found by /qa on 2026-10-24:
  // agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md.
  describe('owned physics delivery deadline', () => {
    const stages = ['fetch', 'success-body', 'error-body'] as const;
    type DeliveryStage = typeof stages[number];

    function stalledDelivery(stage: DeliveryStage) {
      const headers = deferred<Response>();
      const body = deferred<Record<string, unknown>>();
      const signals: AbortSignal[] = [];
      const json = vi.fn(() => stage === 'fetch' ? Promise.resolve(validPayload(JD)) : body.promise);
      const response = {
        ok: stage !== 'error-body', status: stage === 'error-body' ? 503 : 200,
        headers: new Headers({ 'Retry-After': '60' }), json,
      } as unknown as Response;
      return {
        headers, body, signals, json, response,
        physics: (init?: RequestInit): Promise<Response> => {
          signals.push(init!.signal!);
          return stage === 'fetch' ? headers.promise : Promise.resolve(response);
        },
        finish: (outcome: 'resolve' | 'reject'): void => {
          if (stage === 'fetch') {
            if (outcome === 'resolve') headers.resolve(response);
            else headers.reject(new TypeError('Late fetch failure'));
          } else if (outcome === 'resolve') {
            body.resolve(stage === 'error-body' ? { detail: 'Late HTTP detail' } : validPayload(JD));
          } else {
            body.reject(new SyntaxError('Late body failure'));
          }
        },
      };
    }

    function observeAbortListenerCleanup() {
      const adds = vi.spyOn(AbortSignal.prototype, 'addEventListener');
      const removes = vi.spyOn(AbortSignal.prototype, 'removeEventListener');
      return (): void => {
        for (const [index, [event, listener]] of adds.mock.calls.entries()) {
          if (event !== 'abort') continue;
          expect(removes.mock.calls.some(([removedEvent, removedListener], removeIndex) =>
            removedEvent === event && removedListener === listener
              && removes.mock.contexts[removeIndex] === adds.mock.contexts[index])).toBe(true);
        }
      };
    }

    it.each(stages.flatMap((stage) => (['resolve', 'reject'] as const).map((late) => ({ stage, late }))))(
      'bounds abort-ignoring $stage delivery and ignores a late $late', async ({ stage, late }) => {
        vi.useFakeTimers({ now: 1_000_000 });
        const checkListeners = observeAbortListenerCleanup();
        stubFetch(() => Promise.resolve(responseWith(validPayload(JD))));
        const client = createClient();
        await client.maybeRefresh(JD, true);
        const lastGood = client.latestState();
        const delivery = stalledDelivery(stage);
        const fetchMock = stubFetch(delivery.physics, healthServer('up'));
        const results: boolean[] = [];
        void client.maybeRefresh(JD, true).then((result) => results.push(result));
        await vi.advanceTimersByTimeAsync(19_999);
        expect(results).toEqual([]);
        expect(delivery.signals[0].aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);

        expect(results).toEqual([false]);
        expect(delivery.signals[0].aborted).toBe(true);
        expect(client.status()).toMatchObject({ inFlight: false, consecutiveFailures: 1, nextRefreshMs: 1_050_000 });
        expect(client.status().lastFailure).toMatchObject({ kind: 'timeout', httpStatus: null, code: null });
        expect(client.latestState()).toBe(lastGood);
        const settled = client.status();
        const probe = client.lastProbe;
        delivery.finish(late);
        await vi.advanceTimersByTimeAsync(0);
        expect(client.status()).toEqual(settled);
        expect(client.lastProbe).toBe(probe);
        expect(client.latestState()).toBe(lastGood);
        expect(delivery.json).toHaveBeenCalledTimes(stage === 'fetch' ? 0 : 1);
        expect(fetchMock.mock.calls.filter(([url]) => `${url}`.endsWith('/health'))).toHaveLength(stage === 'fetch' ? 1 : 0);
        expect(vi.getTimerCount()).toBe(0);
        checkListeners();
      }
    );

    const cancellationCases = stages.flatMap((stage) =>
      (['dispose', 'force'] as const).flatMap((action) =>
        (['resolve', 'reject'] as const).map((late) => ({ stage, action, late }))));
    it.each(cancellationCases)('$action settles pending $stage before its late $late', async ({ stage, action, late }) => {
      vi.useFakeTimers({ now: 1_000_000 });
      const checkListeners = observeAbortListenerCleanup();
      stubFetch(() => Promise.resolve(responseWith(validPayload(JD))));
      const client = createClient();
      await client.maybeRefresh(JD, true);
      const lastGood = client.latestState();
      const delivery = stalledDelivery(stage);
      const replacement = deferred<Response>();
      let physicsCalls = 0;
      const fetchMock = stubFetch((init) => ++physicsCalls === 1 ? delivery.physics(init) : replacement.promise);
      const results: boolean[] = [];
      void client.maybeRefresh(JD, true).then((result) => results.push(result));
      await vi.advanceTimersByTimeAsync(0);
      let newer: Promise<boolean> | undefined;
      if (action === 'dispose') client.dispose();
      else newer = client.maybeRefresh(JD + 1, true);
      await vi.advanceTimersByTimeAsync(0);

      expect(results).toEqual([false]);
      expect(delivery.signals[0].aborted).toBe(true);
      expect(client.status()).toMatchObject({
        disposed: action === 'dispose', inFlight: action === 'force',
        lastFailure: null, consecutiveFailures: 0, nextRefreshMs: 1_030_000,
      });
      expect(client.latestState()).toBe(lastGood);
      expect(vi.getTimerCount()).toBe(action === 'force' ? 1 : 0);
      if (newer) {
        replacement.resolve(responseWith(validPayload(JD + 1)));
        await expect(newer).resolves.toBe(true);
      } else {
        await expect(client.maybeRefresh(JD + 1, true)).resolves.toBe(false);
      }
      const newerStatus = client.status();
      const newerLatest = client.latestState();
      delivery.finish(late);
      await vi.advanceTimersByTimeAsync(0);
      expect(client.status()).toEqual(newerStatus);
      expect(client.latestState()).toBe(newerLatest);
      expect(client.lastProbe).toBeNull();
      expect(delivery.json).toHaveBeenCalledTimes(stage === 'fetch' ? 0 : 1);
      expect(fetchMock.mock.calls.filter(([url]) => `${url}`.endsWith('/health'))).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
      checkListeners();
    });

    it.each(['success-body', 'error-body'] as const)('does not restart the 20 s budget for late %s headers', async (stage) => {
      vi.useFakeTimers({ now: 1_000_000 });
      const delivery = stalledDelivery(stage);
      const fetchMock = stubFetch(() => delivery.headers.promise);
      const client = createClient();
      const results: boolean[] = [];
      void client.maybeRefresh(JD, true).then((result) => results.push(result));
      await vi.advanceTimersByTimeAsync(19_900);
      delivery.headers.resolve(delivery.response);
      await vi.advanceTimersByTimeAsync(99);
      expect(results).toEqual([]);
      expect(delivery.json).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);

      expect(results).toEqual([false]);
      expect(client.status().lastFailure?.kind).toBe('timeout');
      expect(client.status().nextRefreshMs).toBe(1_050_000);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['refused-origin', 'inconclusive'] as const)('allows bounded %s diagnosis after non-cooperating fetch expires', async (outcome) => {
      vi.useFakeTimers({ now: 1_000_000 });
      const delivery = stalledDelivery('fetch');
      const cors = deferred<Response>();
      const noCors = deferred<Response>();
      stubFetch(delivery.physics, (init) => init?.mode === 'cors' ? cors.promise : noCors.promise);
      const client = createClient();
      const results: boolean[] = [];
      void client.maybeRefresh(JD, true).then((result) => results.push(result));
      await vi.advanceTimersByTimeAsync(20_000);
      expect(delivery.signals[0].aborted).toBe(true);
      expect(results).toEqual([]);
      delivery.finish('resolve');
      await vi.advanceTimersByTimeAsync(1_999);
      expect(delivery.json).not.toHaveBeenCalled();
      cors.reject(new TypeError('CORS failure'));
      await vi.advanceTimersByTimeAsync(1_999);
      expect(results).toEqual([]);
      if (outcome === 'refused-origin') noCors.resolve(new Response(null));
      await vi.advanceTimersByTimeAsync(outcome === 'refused-origin' ? 0 : 1);

      expect(results).toEqual([false]);
      expect(client.status().lastFailure?.kind).toBe(outcome === 'refused-origin' ? 'blocked' : 'timeout');
      expect(client.status().nextRefreshMs).toBe(outcome === 'refused-origin' ? 1_053_998 : 1_053_999);
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['fetch', 'success-body'] as const)('publishes timeout before abort can resolve %s successfully', async (stage) => {
      vi.useFakeTimers();
      const delivery = stalledDelivery(stage);
      const fetchMock = stubFetch((init) => {
        init!.signal!.addEventListener('abort', () => delivery.finish('resolve'), { once: true });
        return delivery.physics(init);
      }, healthServer('refuses-origin'));
      const client = createClient();
      const pending = client.maybeRefresh(JD, true);
      await vi.advanceTimersByTimeAsync(20_000);
      await expect(pending).resolves.toBe(false);

      expect(client.latestState()).toBeNull();
      expect(client.status().lastFailure?.kind).toBe(stage === 'fetch' ? 'blocked' : 'timeout');
      expect(fetchMock.mock.calls.filter(([url]) => `${url}`.endsWith('/health'))).toHaveLength(stage === 'fetch' ? 2 : 0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['dispose', 'force'] as const)('%s after resolved headers does not start the retired body read', async (action) => {
      vi.useFakeTimers();
      const delivery = stalledDelivery('fetch');
      let physicsCalls = 0;
      stubFetch((init) => ++physicsCalls === 1 ? delivery.physics(init) : Promise.resolve(responseWith(validPayload(JD))));
      const client = createClient();
      const old = client.maybeRefresh(JD, true);
      delivery.finish('resolve');
      if (action === 'dispose') client.dispose();
      else await expect(client.maybeRefresh(JD, true)).resolves.toBe(true);
      await expect(old).resolves.toBe(false);

      expect(delivery.json).not.toHaveBeenCalled();
      expect(client.status()).toMatchObject({ lastFailure: null, consecutiveFailures: 0 });
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each(stages)('preserves classification and cleanup for synchronous %s throws', async (stage) => {
      vi.useFakeTimers({ now: 1_000_000 });
      const checkListeners = observeAbortListenerCleanup();
      const fetchMock = stubFetch(() => {
        if (stage === 'fetch') throw new TypeError('Synchronous fetch failure');
        return Promise.resolve({
          ok: stage !== 'error-body', status: stage === 'error-body' ? 503 : 200,
          headers: new Headers({ 'Retry-After': '60' }),
          json: () => { throw new SyntaxError('Synchronous decode failure'); },
        } as unknown as Response);
      });
      const client = createClient();
      await expect(client.maybeRefresh(JD, true)).resolves.toBe(false);

      expect(client.status().lastFailure?.kind).toBe(stage === 'fetch' ? 'unreachable' : stage === 'success-body' ? 'invalid-response' : 'http');
      expect(client.status().nextRefreshMs).toBe(stage === 'error-body' ? 1_060_000 : 1_030_000);
      expect(fetchMock.mock.calls.filter(([url]) => `${url}`.endsWith('/health'))).toHaveLength(stage === 'fetch' ? 2 : 0);
      expect(vi.getTimerCount()).toBe(0);
      checkListeners();
    });

    it.each(['success-body', 'error-body'] as const)('accepts %s completion immediately before the delivery deadline', async (stage) => {
      vi.useFakeTimers({ now: 1_000_000 });
      const delivery = stalledDelivery(stage);
      const fetchMock = stubFetch(delivery.physics);
      const client = createClient();
      const pending = client.maybeRefresh(JD, true);
      await vi.advanceTimersByTimeAsync(19_999);
      delivery.finish('resolve');
      await expect(pending).resolves.toBe(stage === 'success-body');

      expect(client.status().lastFailure?.kind ?? null).toBe(stage === 'success-body' ? null : 'http');
      expect(delivery.signals[0].aborted).toBe(false);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each([-60_000, 60_000])('keeps an under-budget body valid across a %i ms wall-clock correction', async (wallShift) => {
      vi.useFakeTimers({ now: 1_000_000 });
      vi.spyOn(performance, 'now').mockReturnValue(0);
      const fetchMock = stubFetch(() => Promise.resolve({
        ok: true, status: 200,
        json: () => {
          vi.setSystemTime(1_000_000 + wallShift);
          return Promise.resolve(validPayload(JD));
        },
      } as Response));
      const client = createClient();
      await expect(client.maybeRefresh(JD, true)).resolves.toBe(true);

      expect(client.status().lastFailure).toBeNull();
      expect(client.status().lastSuccessMs).toBe(1_000_000 + wallShift);
      expect(client.status().nextRefreshMs).toBe(1_030_000);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each([0, -60_000])('rejects an over-budget body before the timer callback despite a %i ms wall shift', async (wallShift) => {
      vi.useFakeTimers({ now: 1_000_000 });
      let elapsedMs = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => elapsedMs);
      const fetchMock = stubFetch(() => Promise.resolve({
        ok: true, status: 200,
        json: () => {
          // Models synchronous decode occupying the main thread; no timer callback runs here.
          elapsedMs = 20_000;
          vi.setSystemTime(1_000_000 + wallShift);
          return Promise.resolve(validPayload(JD));
        },
      } as Response));
      const client = createClient();
      await expect(client.maybeRefresh(JD, true)).resolves.toBe(false);

      expect(client.status().lastFailure?.kind).toBe('timeout');
      expect(client.latestState()).toBeNull();
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['returns', 'throws'] as const)('gives elapsed deadline precedence when synchronous validation %s', async (outcome) => {
      vi.useFakeTimers({ now: 1_000_000 });
      let elapsedMs = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => elapsedMs);
      const payload = validPayload(JD);
      Object.defineProperty(payload, 'epoch_jd_tdb', {
        get() {
          // Owned getter models elapsed validation without pretending synchronous work is preemptible.
          elapsedMs = 20_000;
          if (outcome === 'throws') throw new Error('Over-budget validation failed');
          return JD;
        },
      });
      const fetchMock = stubFetch(() => Promise.resolve(responseWith(payload)));
      const client = createClient();
      await expect(client.maybeRefresh(JD, true)).resolves.toBe(false);

      expect(client.status().lastFailure?.kind).toBe('timeout');
      expect(client.latestState()).toBeNull();
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  // FE-UNBOUNDED-PROBE (SDEL079). Found by /qa on 2026-10-24:
  // agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md.
  describe('owned health probes', () => {
    const cancellationCases = (['dispose', 'force'] as const).flatMap((action) =>
      (['cors', 'no-cors'] as const).flatMap((stage) =>
        (['resolve', 'reject'] as const).map((late) => ({ action, stage, late }))));

    it.each(cancellationCases)('$action cancels pending $stage without waiting for its late $late', async ({ action, stage, late }) => {
      vi.useFakeTimers({ now: 1_000_000 });
      stubFetch(() => Promise.resolve(responseWith(validPayload(JD))));
      const client = createClient();
      await client.maybeRefresh(JD, true);
      const lastGood = client.latestState();
      const health = deferred<Response>();
      const replacement = deferred<Response>();
      const signals: AbortSignal[] = [];
      let physicsCalls = 0;
      const fetchMock = stubFetch(
        () => ++physicsCalls === 1 ? Promise.reject(new TypeError('Failed to fetch')) : replacement.promise,
        (init) => {
          if (stage === 'no-cors' && init?.mode === 'cors') return Promise.reject(new TypeError('CORS failure'));
          signals.push(init!.signal!);
          return health.promise; // Deliberately ignores abort: the client owns settlement.
        }
      );
      const results: boolean[] = [];
      void client.maybeRefresh(JD, true).then((result) => results.push(result));
      await vi.advanceTimersByTimeAsync(0);
      expect(signals).toHaveLength(1);
      const healthCalls = fetchMock.mock.calls.filter(([url]) => `${url}`.endsWith('/health')).length;

      let newer: Promise<boolean> | undefined;
      if (action === 'dispose') {
        client.dispose();
        client.dispose();
      } else {
        newer = client.maybeRefresh(JD, true);
      }
      await vi.advanceTimersByTimeAsync(0);

      expect(results).toEqual([false]);
      expect(signals[0].aborted).toBe(true);
      expect(client.status()).toMatchObject({
        disposed: action === 'dispose', inFlight: action === 'force',
        lastFailure: null, consecutiveFailures: 0,
      });
      expect(client.latestState()).toBe(lastGood);
      expect(vi.getTimerCount()).toBe(action === 'force' ? 1 : 0);
      if (newer) {
        replacement.resolve(responseWith(validPayload(JD)));
        await expect(newer).resolves.toBe(true);
      }
      const settledStatus = client.status();
      const settledLatest = client.latestState();
      if (late === 'resolve') health.resolve(new Response(null));
      else health.reject(new TypeError('Late health failure'));
      await vi.advanceTimersByTimeAsync(0);

      expect(client.status()).toEqual(settledStatus);
      expect(client.latestState()).toBe(settledLatest);
      expect(fetchMock.mock.calls.filter(([url]) => `${url}`.endsWith('/health'))).toHaveLength(healthCalls);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('cannot repopulate a newer successful request cache from retired health work', async () => {
      vi.useFakeTimers();
      const oldHealth = deferred<Response>();
      let physicsCalls = 0;
      let healthCalls = 0;
      stubFetch(
        () => ++physicsCalls === 2
          ? Promise.resolve(responseWith(validPayload(JD)))
          : Promise.reject(new TypeError('Failed to fetch')),
        () => ++healthCalls === 1 ? oldHealth.promise : Promise.reject(new TypeError('Server down'))
      );
      const client = createClient();
      const old = client.maybeRefresh(JD, true);
      await vi.advanceTimersByTimeAsync(0);
      await expect(client.maybeRefresh(JD, true)).resolves.toBe(true);
      oldHealth.resolve(new Response(null));
      await expect(old).resolves.toBe(false);

      await expect(client.maybeRefresh(JD, true)).resolves.toBe(false);
      expect(client.status().lastFailure?.kind).toBe('unreachable');
      expect(client.status().consecutiveFailures).toBe(1);
      expect(healthCalls).toBe(3);
    });

    it.each((['cors', 'no-cors'] as const).flatMap((stage) =>
      (['resolve', 'reject'] as const).map((late) => ({ stage, late }))))(
      'bounds an abort-ignoring $stage probe at 2 s despite a late $late', async ({ stage, late }) => {
        vi.useFakeTimers({ now: 1_000_000 });
        const health = deferred<Response>();
        const signals: AbortSignal[] = [];
        const fetchMock = stubFetch(
          () => Promise.reject(new TypeError('Failed to fetch')),
          (init) => {
            if (stage === 'no-cors' && init?.mode === 'cors') return Promise.reject(new TypeError('CORS failure'));
            signals.push(init!.signal!);
            return health.promise;
          }
        );
        const client = createClient();
        const results: boolean[] = [];
        void client.maybeRefresh(JD, true).then((result) => results.push(result));
        await vi.advanceTimersByTimeAsync(1_999);
        expect(results).toEqual([]);
        expect(signals[0].aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);

        expect(results).toEqual([false]);
        expect(signals[0].aborted).toBe(true);
        expect(client.status()).toMatchObject({ inFlight: false, consecutiveFailures: 1, nextRefreshMs: 1_032_000 });
        expect(client.status().lastFailure?.kind).toBe('network');
        const settledStatus = client.status();
        const probeCalls = stage === 'cors' ? 1 : 2;
        expect(fetchMock.mock.calls.filter(([url]) => `${url}`.endsWith('/health'))).toHaveLength(probeCalls);
        expect(vi.getTimerCount()).toBe(0);
        if (late === 'resolve') health.resolve(new Response(null));
        else health.reject(new TypeError('Late health failure'));
        await vi.advanceTimersByTimeAsync(0);
        expect(client.status()).toEqual(settledStatus);

        // The late transport outcome must not replace the cached inconclusive verdict either.
        await client.maybeRefresh(JD, true);
        expect(client.status().lastFailure?.kind).toBe('network');
        expect(fetchMock.mock.calls.filter(([url]) => `${url}`.endsWith('/health'))).toHaveLength(probeCalls);
        expect(vi.getTimerCount()).toBe(0);
      }
    );

    it('captures one backend URL for physics and both diagnostic stages', async () => {
      vi.useFakeTimers();
      let baseUrl = 'http://origin-a.test';
      const physics = deferred<Response>();
      const cors = deferred<Response>();
      const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
        if (!`${input}`.endsWith('/health')) return physics.promise;
        return init?.mode === 'cors' ? cors.promise : Promise.resolve(new Response(null));
      });
      vi.stubGlobal('fetch', fetchMock);
      const client = new SolarPhysicsClient({ baseUrl: () => baseUrl });
      const pending = client.maybeRefresh(JD, true);
      baseUrl = 'http://origin-b.test';
      physics.reject(new TypeError('Failed to fetch'));
      await vi.advanceTimersByTimeAsync(0);
      baseUrl = 'http://origin-c.test';
      cors.reject(new TypeError('CORS failure'));
      await expect(pending).resolves.toBe(false);

      expect(fetchMock.mock.calls.map(([url]) => new URL(`${url}`).origin)).toEqual([
        'http://origin-a.test', 'http://origin-a.test', 'http://origin-a.test',
      ]);
      expect(client.status().lastFailure?.kind).toBe('blocked');
      expect(vi.getTimerCount()).toBe(0);
    });

    it('does not reuse health evidence for a different backend URL', async () => {
      vi.useFakeTimers();
      let baseUrl = 'http://origin-a.test';
      const healthUrls: string[] = [];
      vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
        const url = `${input}`;
        if (url.endsWith('/health')) {
          healthUrls.push(url);
          if (url.startsWith('http://origin-a.test/')) return Promise.resolve(new Response(null));
        }
        return Promise.reject(new TypeError('Failed to fetch'));
      }));
      const client = new SolarPhysicsClient({ baseUrl: () => baseUrl });
      await client.maybeRefresh(JD, true);
      expect(client.status().lastFailure?.kind).toBe('server-error');
      baseUrl = 'http://origin-b.test';
      await client.maybeRefresh(JD, true);

      expect(client.status().lastFailure?.kind).toBe('unreachable');
      expect(healthUrls).toEqual([
        'http://origin-a.test/health', 'http://origin-b.test/health', 'http://origin-b.test/health',
      ]);
    });

    it.each(['dispose', 'force'] as const)('%s cancels diagnosis after the physics signal already timed out', async (action) => {
      vi.useFakeTimers();
      const health = deferred<Response>();
      const physicsSignals: AbortSignal[] = [];
      const healthSignals: AbortSignal[] = [];
      stubFetch(
        (init) => {
          physicsSignals.push(init!.signal!);
          return physicsSignals.length === 1 ? hangUntilAborted(init) : Promise.resolve(responseWith(validPayload(JD)));
        },
        (init) => { healthSignals.push(init!.signal!); return health.promise; }
      );
      const client = createClient();
      const results: boolean[] = [];
      void client.maybeRefresh(JD, true).then((result) => results.push(result));
      await vi.advanceTimersByTimeAsync(20_000);
      expect(physicsSignals[0].aborted).toBe(true);
      expect(healthSignals).toHaveLength(1);
      expect(healthSignals[0].aborted).toBe(false);
      if (action === 'dispose') client.dispose();
      else await expect(client.maybeRefresh(JD, true)).resolves.toBe(true);
      await vi.advanceTimersByTimeAsync(0);

      expect(results).toEqual([false]);
      expect(healthSignals[0].aborted).toBe(true);
      expect(client.status()).toMatchObject({ lastFailure: null, consecutiveFailures: 0, inFlight: false });
      expect(vi.getTimerCount()).toBe(0);
    });

    it('cannot start diagnostics from a retired main fetch that rejects after its deadline', async () => {
      vi.useFakeTimers();
      const oldPhysics = deferred<Response>();
      let physicsCalls = 0;
      const fetchMock = stubFetch(
        () => ++physicsCalls === 1 ? oldPhysics.promise : Promise.resolve(responseWith(validPayload(JD))),
        healthServer('up')
      );
      const client = createClient();
      const old = client.maybeRefresh(JD, true);
      await vi.advanceTimersByTimeAsync(20_000);
      // The delivery fix may already diagnose the 20 s deadline. A later retired rejection
      // must not launch any additional probes, regardless of that authorized earlier work.
      const probesAtDeadline = fetchMock.mock.calls.filter(([url]) => `${url}`.endsWith('/health')).length;
      await expect(client.maybeRefresh(JD, true)).resolves.toBe(true);
      const newerStatus = client.status();
      oldPhysics.reject(new TypeError('Late physics failure'));
      await expect(old).resolves.toBe(false);

      expect(fetchMock.mock.calls.filter(([url]) => `${url}`.endsWith('/health'))).toHaveLength(probesAtDeadline);
      expect(client.status()).toEqual(newerStatus);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('allows each diagnostic stage its own 2 s after the 20 s physics deadline', async () => {
      vi.useFakeTimers({ now: 1_000_000 });
      const cors = deferred<Response>();
      const noCors = deferred<Response>();
      stubFetch(hangUntilAborted, (init) => init?.mode === 'cors' ? cors.promise : noCors.promise);
      const client = createClient();
      const results: boolean[] = [];
      void client.maybeRefresh(JD, true).then((result) => results.push(result));
      await vi.advanceTimersByTimeAsync(21_999);
      expect(results).toEqual([]);
      cors.reject(new TypeError('CORS failure'));
      await vi.advanceTimersByTimeAsync(1_999);
      expect(results).toEqual([]);
      noCors.resolve(new Response(null));
      await vi.advanceTimersByTimeAsync(0);

      expect(results).toEqual([false]);
      expect(client.status().lastFailure?.kind).toBe('blocked');
      expect(client.status().nextRefreshMs).toBe(1_053_998);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps a CORS timeout inconclusive when timeout cleanup synchronously rejects fetch', async () => {
      vi.useFakeTimers();
      const fetchMock = stubFetch(() => Promise.reject(new TypeError('Failed to fetch')), hangUntilAborted);
      const client = createClient();
      const pending = client.maybeRefresh(JD, true);
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(pending).resolves.toBe(false);

      expect(client.status().lastFailure?.kind).toBe('network');
      expect(fetchMock.mock.calls.filter(([url]) => `${url}`.endsWith('/health'))).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('classifies synchronous health transport throws and clears both stage timers', async () => {
      vi.useFakeTimers();
      const fetchMock = stubFetch(
        () => Promise.reject(new TypeError('Failed to fetch')),
        () => { throw new TypeError('Synchronous transport failure'); }
      );
      const client = createClient();
      await expect(client.maybeRefresh(JD, true)).resolves.toBe(false);

      expect(client.status()).toMatchObject({ inFlight: false, consecutiveFailures: 1 });
      expect(client.status().lastFailure?.kind).toBe('unreachable');
      expect(fetchMock.mock.calls.filter(([url]) => `${url}`.endsWith('/health')).map(([, init]) => init?.mode)).toEqual(['cors', 'no-cors']);
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['resolve', 'reject'] as const)('retires CORS after %s but before its continuation', async (outcome) => {
      vi.useFakeTimers();
      const health = deferred<Response>();
      const fetchMock = stubFetch(() => Promise.reject(new TypeError('Failed to fetch')), () => health.promise);
      const client = createClient();
      const pending = client.maybeRefresh(JD, true);
      await vi.advanceTimersByTimeAsync(0);
      if (outcome === 'resolve') health.resolve(new Response(null));
      else health.reject(new TypeError('CORS failure'));
      client.dispose();
      await expect(pending).resolves.toBe(false);

      expect(fetchMock.mock.calls.filter(([url]) => `${url}`.endsWith('/health'))).toHaveLength(1);
      expect(client.lastProbe).toBeNull();
      expect(client.status()).toMatchObject({ lastFailure: null, consecutiveFailures: 0 });
      expect(vi.getTimerCount()).toBe(0);
    });

    it('treats readable HTTP 503 health as reachability and preserves the exact cache expiry', async () => {
      vi.useFakeTimers({ now: 1_000_000 });
      const fetchMock = stubFetch(() => Promise.reject(new TypeError('Failed to fetch')), () => Promise.resolve(new Response(null, { status: 503 })));
      const client = createClient();
      await client.maybeRefresh(JD, true);
      expect(client.status().lastFailure?.kind).toBe('server-error');
      await vi.advanceTimersByTimeAsync(29_999);
      await client.maybeRefresh(JD, true);
      expect(fetchMock.mock.calls.filter(([url]) => `${url}`.endsWith('/health'))).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      await client.maybeRefresh(JD, true);

      expect(fetchMock.mock.calls.filter(([url]) => `${url}`.endsWith('/health'))).toHaveLength(2);
      expect(client.status().lastFailure?.kind).toBe('server-error');
      expect(vi.getTimerCount()).toBe(0);
    });
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

  it.each([503, 429])('records a timeout when an HTTP %i error body reaches the deadline', async (httpStatus) => {
    vi.useFakeTimers({ now: 1_000_000 });
    stubFetch(() => Promise.resolve(responseWith(validPayload(JD))));
    const client = createClient();
    await expect(client.maybeRefresh(JD, true)).resolves.toBe(true);
    const latest = client.latestState();

    const fetchMock = stubFetch((init) => Promise.resolve(new Response(new ReadableStream({
      start(stream) {
        init?.signal?.addEventListener('abort', () => stream.error(abortError()), { once: true });
      },
    }), { status: httpStatus, headers: { 'Retry-After': '60' } })));

    const pending = client.maybeRefresh(JD, true);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(client.status()).toMatchObject({ inFlight: true, lastFailure: null });
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toBe(false);
    expect(client.status().lastFailure).toMatchObject({ kind: 'timeout', httpStatus: null, code: null });
    expect(client.status()).toMatchObject({
      lastError: 'No reply from the solar server within 20 s',
      consecutiveFailures: 1,
      inFlight: false,
      nextRefreshMs: 1_050_000,
    });
    expect(client.latestState()).toBe(latest);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [503, 'http', 'SyntaxError'],
    [503, 'http', 'AbortError'],
    [429, 'rate-limited', 'SyntaxError'],
    [429, 'rate-limited', 'AbortError'],
  ] as const)('keeps HTTP %i as %s when the body has an early %s', async (httpStatus, kind, errorName) => {
    vi.useFakeTimers({ now: 1_000_000 });
    const transport: { signal?: AbortSignal | null } = {};
    const fetchMock = stubFetch((init) => {
      transport.signal = init?.signal;
      const body = errorName === 'SyntaxError'
        ? 'not JSON'
        : new ReadableStream({ start(stream) { stream.error(abortError()); } });
      return Promise.resolve(new Response(body, { status: httpStatus, headers: { 'Retry-After': '60' } }));
    });
    const client = createClient();

    await expect(client.maybeRefresh(JD, true)).resolves.toBe(false);

    expect(client.status().lastFailure).toMatchObject({ kind, httpStatus, code: null });
    expect(client.status()).toMatchObject({ consecutiveFailures: 1, inFlight: false, nextRefreshMs: 1_060_000 });
    expect(client.lastError).toBe(`Solar physics request failed (${httpStatus})`);
    expect(transport.signal?.aborted).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
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

describe('versioned render delivery', () => {
  const version = 'a'.repeat(64);
  function geometryPayload(epoch = 2_460_000.5) {
    return {
      ...validPayload(epoch),
      delivery: { schema: { name: 'solar_render_delivery', version: 1 }, geometry_version: version, geometry_included: true },
      corona: { features: [{ id: 'loop-1', arc: [[1, 0, 0], [1.2, 0.1, 0]] }] },
      pfss_field_lines: { lines: [{ id: 'field-1', arc: [[1, 0, 0], [2.5, 0, 0]] }] },
      heliosphere: { parker_spiral: { lines: [{ arc: [[1, 0, 0], [200, 1, 0]] }] } }
    };
  }

  it('reuses identical arrays while refreshing the latest scalar state, and reconnects with full geometry', async () => {
    const urls: string[] = [];
    let count = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      urls.push(String(input));
      count++;
      if (count === 2) return responseWith({
        ...validPayload(), activity_index: 0.9, wall_epoch_jd_tdb: 2460001.5, wall_epoch_jd: 2460001.5,
        delivery: { schema: { name: 'solar_render_delivery', version: 1 }, geometry_version: version, geometry_included: false },
        corona: {}, pfss_field_lines: {}, heliosphere: { parker_spiral: {} }
      });
      return responseWith(geometryPayload());
    }));
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test' });
    expect(await client.maybeRefresh(2460000.5, true)).toBe(true);
    const oldFeatures = client.latestState()?.corona?.features;
    expect(await client.maybeRefresh(2460000.5, true)).toBe(true);
    expect(client.latestState()?.activity_index).toBe(0.9);
    expect(client.latestState()?.wall_epoch_jd_tdb).toBe(2460001.5);
    expect(client.latestState()?.corona?.features).toBe(oldFeatures);
    expect(new URL(urls[0]).searchParams.get('delivery')).toBe('render-v1');
    expect(new URL(urls[1]).searchParams.get('geometry_version')).toBe(version);
    client.dispose();
    const reconnected = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test' });
    expect(await reconnected.maybeRefresh(2460000.5, true)).toBe(true);
    expect(new URL(urls[2]).searchParams.has('geometry_version')).toBe(false);
  });

  it('rejects reuse with the wrong version, retains the last state, and asks for full geometry next', async () => {
    const urls: string[] = [];
    let count = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      urls.push(String(input));
      count++;
      if (count === 2) return responseWith({
        ...validPayload(), activity_index: 0.99,
        delivery: { schema: { name: 'solar_render_delivery', version: 1 }, geometry_version: 'b'.repeat(64), geometry_included: false },
        corona: {}, pfss_field_lines: {}, heliosphere: { parker_spiral: {} }
      });
      return responseWith(geometryPayload());
    }));
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test' });
    expect(await client.maybeRefresh(2460000.5, true)).toBe(true);
    const previous = client.latestState();
    expect(await client.maybeRefresh(2460000.5, true)).toBe(false);
    expect(client.latestState()).toBe(previous);
    expect(await client.maybeRefresh(2460000.5, true)).toBe(true);
    expect(new URL(urls[2]).searchParams.has('geometry_version')).toBe(false);
  });
});

describe('solar HTTP body bounds', () => {
  it('rejects a decompressed body above two MiB and keeps the previous state', async () => {
    let count = 0;
    vi.stubGlobal('fetch', vi.fn(async () => ++count === 1
      ? new Response(JSON.stringify(validPayload()))
      : new Response(JSON.stringify({ ...validPayload(), oversized: 'x'.repeat(2 * 1024 * 1024) }))));
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test' });
    expect(await client.maybeRefresh(2460000.5, true)).toBe(true);
    const previous = client.latestState();
    expect(await client.maybeRefresh(2460000.5, true)).toBe(false);
    expect(client.latestState()).toBe(previous);
    expect(client.lastError).toContain('decoded byte budget');
  });
});

it('accepts a bounded complete legacy response when render delivery is unsupported', async () => {
  const body = JSON.stringify({ ...validPayload(), legacyMetadata: 'x'.repeat(600_000) });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {
    headers: { 'Content-Length': `${body.length}` }
  })));
  const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test' });
  expect(await client.maybeRefresh(2460000.5, true)).toBe(true);
  expect(client.latestState()?.activity_index).toBe(0.42);
});

describe('bounded render reader ownership', () => {
  const epoch = 2460000.5;
  const versionA = 'a'.repeat(64), versionB = 'b'.repeat(64);
  const payload = (version = versionA, included = true) => ({
    ...validPayload(epoch),
    delivery: { schema: { name: 'solar_render_delivery', version: 1 }, geometry_version: version, geometry_included: included },
    corona: included ? { features: [] } : {},
    pfss_field_lines: included ? { lines: [] } : {},
    heliosphere: { parker_spiral: included ? { lines: [] } : {} },
  });
  const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

  it.each(['deadline', 'force', 'dispose'] as const)('%s cancels and unlocks a stalled native body reader', async action => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(body))
      .mockResolvedValue(new Response(JSON.stringify(payload(versionB))));
    vi.stubGlobal('fetch', fetchMock);
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test' });
    try {
      const old = client.maybeRefresh(epoch, true);
      await flush(); expect(body.locked).toBe(true);
      if (action === 'deadline') await vi.advanceTimersByTimeAsync(client.timeoutMs);
      if (action === 'force') expect(await client.maybeRefresh(epoch, true)).toBe(true);
      if (action === 'dispose') client.dispose();
      expect(await old).toBe(false); await flush();
      expect(cancel).toHaveBeenCalledOnce(); expect(body.locked).toBe(false);
      if (action === 'deadline') expect(client.status().lastFailure?.kind).toBe('timeout');
      if (action === 'force') expect(client.latestState()?.delivery).toMatchObject({ geometry_version: versionB });
      expect(vi.getTimerCount()).toBe(0);
    } finally { client.dispose(); vi.useRealTimers(); }
  });

  it.each(['valid', 'invalid', 'rejected'] as const)('late %s stream completion cannot replace or clear newer geometry reuse', async late => {
    const pending = deferred<ReadableStreamReadResult<Uint8Array>>();
    const read = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue({ done: true });
    const cancel = vi.fn(async () => {}), releaseLock = vi.fn();
    const oldResponse = { ok: true, headers: new Headers(), body: { getReader: () => ({ read, cancel, releaseLock }) } } as unknown as Response;
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(payload())))
      .mockResolvedValueOnce(oldResponse)
      .mockResolvedValueOnce(new Response(JSON.stringify(payload(versionB))))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload(versionB, false))));
    vi.stubGlobal('fetch', fetchMock);
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test' });
    try {
      expect(await client.maybeRefresh(epoch, true)).toBe(true);
      const old = client.maybeRefresh(epoch, true); await flush(); expect(read).toHaveBeenCalledOnce();
      expect(await client.maybeRefresh(epoch, true)).toBe(true);
      const latest = client.latestState();
      if (late === 'rejected') pending.reject(new Error('retired stream'));
      else pending.resolve({ done: false, value: new TextEncoder().encode(late === 'valid' ? JSON.stringify(payload()) : '{invalid') });
      expect(await old).toBe(false); await flush();
      expect(client.latestState()).toBe(latest);
      expect(await client.maybeRefresh(epoch, true)).toBe(true);
      expect(client.latestState()?.corona?.features).toBe(latest?.corona?.features);
      expect(new URL(String(fetchMock.mock.calls[3][0])).searchParams.get('geometry_version')).toBe(versionB);
      expect(releaseLock).toHaveBeenCalledOnce();
    } finally { client.dispose(); }
  });

  it('does not offer or accept geometry from a different captured backend origin', async () => {
    let base = 'http://a.test';
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(payload())))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload(versionA, false))))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload(versionB))))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload(versionB, false))));
    vi.stubGlobal('fetch', fetchMock);
    const client = new SolarPhysicsClient({ baseUrl: () => base });
    try {
      expect(await client.maybeRefresh(epoch, true)).toBe(true);
      const previous = client.latestState(); base = 'http://b.test';
      expect(await client.maybeRefresh(epoch, true)).toBe(false);
      expect(client.latestState()).toBe(previous);
      expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.has('geometry_version')).toBe(false);
      expect(await client.maybeRefresh(epoch, true)).toBe(true);
      expect(new URL(String(fetchMock.mock.calls[2][0])).searchParams.has('geometry_version')).toBe(false);
      expect(await client.maybeRefresh(epoch, true)).toBe(true);
      expect(new URL(String(fetchMock.mock.calls[3][0])).searchParams.get('geometry_version')).toBe(versionB);
    } finally { client.dispose(); }
  });

  it('rejects render-v1 encoded size above 512 KiB even within the decoded budget', async () => {
    const body = JSON.stringify({ ...payload(), padding: 'x'.repeat(512 * 1024) });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Length': String(body.length) } })));
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test' });
    try {
      expect(await client.maybeRefresh(epoch, true)).toBe(false);
      expect(client.lastError).toContain('encoded byte budget'); expect(client.latestState()).toBeNull();
    } finally { client.dispose(); }
  });

  it('rejects a render-v1 marked response above 512 KiB before acquiring a reader', async () => {
    const response = new Response(JSON.stringify(payload()), {
      headers: { 'X-Solar-Delivery': 'render-v1', 'Content-Length': String(512 * 1024 + 1) }
    });
    const getReader = vi.spyOn(response.body!, 'getReader');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://backend.test' });
    try {
      expect(await client.maybeRefresh(epoch, true)).toBe(false);
      expect(getReader).not.toHaveBeenCalled();
      expect(client.lastError).toContain('Solar physics response exceeds encoded byte budget');
      expect(client.latestState()).toBeNull();
    } finally { client.dispose(); }
  });
});
