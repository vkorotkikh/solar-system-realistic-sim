import { afterEach, describe, expect, it, vi } from 'vitest';

import {
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

    expect(client.pollIntervalMs).toBe(SOLAR_PHYSICS_POLL_INTERVAL_MS);
    expect(client.pollIntervalMs).toBeGreaterThanOrEqual(30_000);
    expect(client.timeoutMs).toBe(SOLAR_PHYSICS_REQUEST_TIMEOUT_MS);
    expect(client.timeoutMs).toBeGreaterThan(18_000);
    expect(client.timeoutMs).toBeLessThanOrEqual(20_000);
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
