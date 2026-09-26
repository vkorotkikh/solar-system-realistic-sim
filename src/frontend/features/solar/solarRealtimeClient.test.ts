import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SOLAR_REALTIME_POLL_INTERVAL_MS,
  SOLAR_REALTIME_REQUEST_TIMEOUT_MS,
  SolarRealtimeClient,
  observationStateFromSolarRealtime,
  type SolarRealtimePayload
} from './solarRealtimeClient';
import {
  buildAiaProxyTextureUrl,
  pickAiaObservationChannel
} from './solarObservationTexture';

function responseWith(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload
  } as Response;
}

function validPayload(imageId = 'hv-193-42'): SolarRealtimePayload {
  return {
    schema: { name: 'solar_realtime_endpoint', version: 1 },
    source: 'backend',
    snapshot: {
      schema: { name: 'solar_realtime_context', version: 1 },
      fetched_at_utc: '2026-09-26T15:00:00Z',
      source_status: {
        swpc: {
          ok: false,
          error: 'upstream unavailable',
          endpoint: 'https://services.swpc.noaa.gov/example'
        },
        silso: {
          ok: false,
          error: 'upstream unavailable',
          endpoint: 'https://www.sidc.be/example'
        },
        sdo_aia: {
          ok: true,
          updated: '2026-09-26T14:59:00Z',
          endpoint: 'https://api.helioviewer.org/v2/getClosestImage/'
        },
        gong_synoptic: {
          product: 'zqs',
          ok: false,
          attempted: false,
          runtime_eligible: false,
          status: 'disabled_unvalidated',
          reason: 'disabled_unvalidated'
        }
      },
      swpc: null,
      silso: null,
      sdo_aia: {
        request_date_utc: '2026-09-26T15:00:00Z',
        channels: {
          aia_193: {
            source_id: 11,
            image_id: imageId,
            image_date: '2026-09-26T14:59:00Z',
            tile_url: 'https://api.helioviewer.org/v2/getTile/?id=42'
          }
        },
        channel_activity_proxy: { aia_193: 0.63 },
        latest_image_date_utc: '2026-09-26T14:59:00Z',
        freshness_s: 60,
        freshness_proxy: 0.99,
        activity_proxy: 0.63,
        coronal_holes: null,
        visualization: {
          preferred_channel: 'aia_193',
          preferred_image_id: imageId,
          preferred_tile_url: 'https://api.helioviewer.org/v2/getTile/?id=42',
          preferred_proxy_path: '/solar/realtime/aia-tile?channel=aia_193'
        }
      },
      gong_synoptic: null,
      combined_activity_proxy: 0.63
    }
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SolarRealtimeClient delivery contract', () => {
  it('accepts a labelled backend snapshot and reports its provenance', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:30Z'));
    const fetchMock = vi.fn(async () => responseWith(validPayload()));
    vi.stubGlobal('fetch', fetchMock);
    const client = new SolarRealtimeClient({ baseUrl: () => 'http://backend.test/' });

    await expect(client.maybeRefresh()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend.test/solar/realtime',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(client.latestState()?.source).toBe('backend');
    expect(client.status()).toMatchObject({
      freshness: 'fresh',
      source: 'backend',
      snapshotFetchedAtUtc: '2026-09-26T15:00:00Z',
      aiaUpdatedAtUtc: '2026-09-26T14:59:00Z',
      lastError: null,
      inFlight: false
    });
    expect(client.pollIntervalMs).toBe(SOLAR_REALTIME_POLL_INTERVAL_MS);
    expect(client.timeoutMs).toBe(SOLAR_REALTIME_REQUEST_TIMEOUT_MS);
  });

  it('accepts unavailable channel entries while retaining usable AIA imagery', async () => {
    const payload = structuredClone(validPayload()) as unknown as {
      snapshot: {
        sdo_aia: {
          channels: Record<string, Record<string, unknown>>;
        };
      };
    };
    payload.snapshot.sdo_aia.channels.aia_094 = {
      source_id: 8,
      image_id: null,
      image_date: null,
      tile_url: null
    };
    vi.stubGlobal('fetch', vi.fn(async () => responseWith(payload)));
    const client = new SolarRealtimeClient({ baseUrl: () => 'http://backend.test' });

    await expect(client.maybeRefresh()).resolves.toBe(true);

    const observationState = observationStateFromSolarRealtime(client.latestState());
    expect(pickAiaObservationChannel(observationState)?.channel).toBe('aia_193');
  });

  it.each([
    [{ ...validPayload(), schema: { name: 'solar_realtime_endpoint', version: 2 } }, 'schema'],
    [{ ...validPayload(), source: 'browser' }, 'source'],
    [
      {
        ...validPayload(),
        snapshot: { ...validPayload().snapshot, source_status: { sdo_aia: { ok: true } } }
      },
      'source_status'
    ],
    [
      {
        ...validPayload(),
        snapshot: { ...validPayload().snapshot, sdo_aia: null }
      },
      'sdo_aia status'
    ],
    [
      {
        ...validPayload(),
        snapshot: { ...validPayload().snapshot, combined_activity_proxy: undefined }
      },
      'combined_activity_proxy'
    ]
  ])('rejects malformed or inconsistent realtime data (%s)', async (payload, message) => {
    vi.stubGlobal('fetch', vi.fn(async () => responseWith(payload)));
    const client = new SolarRealtimeClient({ baseUrl: () => 'http://backend.test' });

    await expect(client.maybeRefresh()).resolves.toBe(false);

    expect(client.latestState()).toBeNull();
    expect(client.status().lastError).toContain(message);
  });

  it('retains last-known-good data across an upstream error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWith(validPayload()))
      .mockRejectedValueOnce(new Error('network offline'));
    vi.stubGlobal('fetch', fetchMock);
    const client = new SolarRealtimeClient({ baseUrl: () => 'http://backend.test' });

    await expect(client.maybeRefresh(true)).resolves.toBe(true);
    const lastKnownGood = client.latestState();
    await expect(client.maybeRefresh(true)).resolves.toBe(false);

    expect(client.latestState()).toBe(lastKnownGood);
    expect(client.status()).toMatchObject({
      freshness: 'stale',
      lastError: 'network offline'
    });
  });

  it('bounds a stalled request and preserves last-known-good data', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:30Z'));
    const stalled = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWith(validPayload()))
      .mockImplementationOnce(() => stalled.promise);
    vi.stubGlobal('fetch', fetchMock);
    const client = new SolarRealtimeClient({
      baseUrl: () => 'http://backend.test',
      timeoutMs: 1_000
    });
    await client.maybeRefresh(true);
    const lastKnownGood = client.latestState();

    const refresh = client.maybeRefresh(true);
    await vi.advanceTimersByTimeAsync(1_001);

    await expect(refresh).resolves.toBe(false);
    expect(client.latestState()).toBe(lastKnownGood);
    expect(client.status().lastError).toContain('timed out');
  });

  it('deduplicates refreshes while one request is in flight', async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn(() => pending.promise);
    vi.stubGlobal('fetch', fetchMock);
    const client = new SolarRealtimeClient({ baseUrl: () => 'http://backend.test' });

    const leader = client.maybeRefresh(true);
    await expect(client.maybeRefresh(true)).resolves.toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending.resolve(responseWith(validPayload()));
    await expect(leader).resolves.toBe(true);
  });

  it('ignores a late response after disposal and cannot restart', async () => {
    const pending = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => pending.promise));
    const client = new SolarRealtimeClient({ baseUrl: () => 'http://backend.test' });

    const refresh = client.maybeRefresh(true);
    client.dispose();
    pending.resolve(responseWith(validPayload()));

    await expect(refresh).resolves.toBe(false);
    await expect(client.maybeRefresh(true)).resolves.toBe(false);
    expect(client.latestState()).toBeNull();
    expect(client.status()).toMatchObject({ freshness: 'unavailable', disposed: true });
  });

  it('selects an AIA proxy texture from realtime data without physics state', () => {
    const observationState = observationStateFromSolarRealtime(validPayload('standalone-image'));
    const selection = pickAiaObservationChannel(observationState);

    expect(selection).toMatchObject({
      channel: 'aia_193',
      imageId: 'standalone-image',
      imageDate: '2026-09-26T14:59:00Z'
    });
    expect(
      buildAiaProxyTextureUrl('http://backend.test/', selection?.channel, selection?.imageId)
    ).toBe(
      'http://backend.test/solar/realtime/aia-tile?channel=aia_193&image_id=standalone-image&v=standalone-image'
    );
  });
});
