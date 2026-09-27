import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SOLAR_REALTIME_POLL_INTERVAL_MS,
  SOLAR_REALTIME_REQUEST_TIMEOUT_MS,
  SolarRealtimeClient,
  observationStateFromSolarRealtime,
  validateSolarRealtimePayload,
  type SolarRealtimePayload
} from './solarRealtimeClient';
import {
  buildAiaProxyTextureUrl,
  deriveSunObservationControls,
  inspectAiaObservationChannel,
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
            tile_url: 'https://api.helioviewer.org/v2/getTile/?id=42',
            artifact: {
              schema: { name: 'helioviewer_viewport_tile', version: 1 },
              delivery: 'raw_on_demand',
              media_type: 'image/png'
            },
            spatial_use: {
              eligible: false,
              reason: 'viewport_tile_has_no_validated_solar_surface_projection',
              contract: null
            }
          }
        },
        channel_activity_proxy: null,
        latest_image_date_utc: '2026-09-26T14:59:00Z',
        freshness_s: 60,
        freshness_proxy: 0.99,
        activity_proxy: null,
        coronal_holes: null,
        scientific_inference: {
          status: 'disabled',
          reason: 'viewport_tile_has_no_validated_solar_surface_projection',
          activity_proxy: null,
          coronal_holes: null
        },
        visualization: {
          preferred_channel: 'aia_193',
          preferred_image_id: imageId,
          preferred_tile_url: 'https://api.helioviewer.org/v2/getTile/?id=42',
          preferred_proxy_path: '/solar/realtime/aia-tile?channel=aia_193'
        }
      },
      gong_synoptic: null,
      combined_activity_proxy: null
    }
  };
}

function projectedPayload({
  fetchedAtUtc = '2026-09-26T15:00:00Z',
  imageDateUtc = '2026-09-26T14:59:00Z'
} = {}): SolarRealtimePayload {
  const payload = structuredClone(validPayload()) as SolarRealtimePayload;
  payload.snapshot.fetched_at_utc = fetchedAtUtc;
  payload.snapshot.source_status.sdo_aia.updated = imageDateUtc;
  const channel = payload.snapshot.sdo_aia?.channels.aia_193;
  if (!channel) throw new Error('fixture channel missing');
  channel.image_date = imageDateUtc;
  channel.artifact = {
    schema: { name: 'solar_surface_texture', version: 1 },
    delivery: 'raw_on_demand'
  };
  channel.spatial_use = {
    eligible: true,
    reason: null,
    contract: {
      schema: { name: 'solar_surface_texture_projection', version: 1 },
      projection: 'equirectangular',
      coordinate_frame: 'iau_sun_body_fixed',
      coverage: 'full_surface',
      uv_mapping: 'sun_surface_uv_v1'
    }
  };
  return payload;
}

function payloadWithSilso(): SolarRealtimePayload {
  const payload = structuredClone(validPayload()) as SolarRealtimePayload;
  payload.snapshot.silso = {
    schema: { name: 'wdc_silso_daily_total_sunspot_number', version: 2 },
    date: '2026-08-31',
    source_age_days: 26,
    coverage: {
      policy: 'through_last_elapsed_month',
      latest_expected_date: '2026-08-31',
      status: 'current_for_published_coverage'
    }
  };
  payload.snapshot.source_status.silso = {
    ok: true,
    updated: '2026-08-31',
    source_age_days: 26,
    coverage: {
      policy: 'through_last_elapsed_month',
      latest_expected_date: '2026-08-31',
      status: 'current_for_published_coverage'
    },
    delivered_at_utc: '2026-09-26T15:00:00Z'
  };
  return payload;
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
  it('accepts SILSO delivery metadata with exact payload and status parity', () => {
    const payload = validateSolarRealtimePayload(payloadWithSilso());

    expect(payload.snapshot.silso).toMatchObject({
      date: '2026-08-31',
      source_age_days: 26,
      coverage: {
        policy: 'through_last_elapsed_month',
        latest_expected_date: '2026-08-31',
        status: 'current_for_published_coverage'
      }
    });
    expect(payload.snapshot.source_status.silso).toMatchObject({
      ok: true,
      updated: '2026-08-31',
      source_age_days: 26,
      delivered_at_utc: '2026-09-26T15:00:00Z'
    });
  });

  it.each([
    ['negative age', (payload: SolarRealtimePayload) => {
      payload.snapshot.silso!.source_age_days = -1;
    }],
    ['fractional age', (payload: SolarRealtimePayload) => {
      payload.snapshot.source_status.silso.source_age_days = 1.5;
    }],
    ['coverage policy', (payload: SolarRealtimePayload) => {
      (payload.snapshot.silso!.coverage as unknown as Record<string, unknown>).policy =
        'calendar_month';
    }],
    ['coverage status', (payload: SolarRealtimePayload) => {
      (
        payload.snapshot.source_status.silso.coverage as unknown as Record<string, unknown>
      ).status = 'current';
    }],
    ['observation date', (payload: SolarRealtimePayload) => {
      payload.snapshot.silso!.date = 'August 31, 2026';
    }],
    ['coverage date', (payload: SolarRealtimePayload) => {
      payload.snapshot.silso!.coverage = {
        policy: 'through_last_elapsed_month',
        latest_expected_date: '2026-08-31T00:00:00Z',
        status: 'current_for_published_coverage'
      };
    }],
    ['delivery timestamp', (payload: SolarRealtimePayload) => {
      payload.snapshot.source_status.silso.delivered_at_utc = 'not-a-time';
    }],
    ['payload/status age parity', (payload: SolarRealtimePayload) => {
      payload.snapshot.source_status.silso.source_age_days = 27;
    }],
    ['payload/status coverage parity', (payload: SolarRealtimePayload) => {
      payload.snapshot.source_status.silso.coverage = {
        policy: 'through_last_elapsed_month',
        latest_expected_date: '2026-07-31',
        status: 'lagging_within_age_bound'
      };
    }]
  ])('rejects invalid SILSO temporal metadata (%s)', (_label, mutate) => {
    const payload = payloadWithSilso();
    mutate(payload);

    expect(() => validateSolarRealtimePayload(payload)).toThrow(/SILSO/i);
  });

  it('accepts a legacy v1 snapshot with unavailable SILSO metadata', () => {
    expect(validateSolarRealtimePayload(validPayload()).snapshot.silso).toBeNull();
  });

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
      aiaSpatialUse: 'disabled',
      aiaSpatialReason: 'viewport_tile_has_no_validated_solar_surface_projection',
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
      tile_url: null,
      artifact: {
        schema: { name: 'helioviewer_viewport_tile', version: 1 },
        delivery: 'raw_on_demand'
      },
      spatial_use: {
        eligible: false,
        reason: 'viewport_tile_has_no_validated_solar_surface_projection',
        contract: null
      }
    };
    vi.stubGlobal('fetch', vi.fn(async () => responseWith(payload)));
    const client = new SolarRealtimeClient({ baseUrl: () => 'http://backend.test' });

    await expect(client.maybeRefresh()).resolves.toBe(true);

    const observationState = observationStateFromSolarRealtime(client.latestState());
    expect(inspectAiaObservationChannel(observationState)?.channel).toBe('aia_193');
    expect(pickAiaObservationChannel(observationState)).toBeNull();
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

  it('discloses a fresh projected observation as render eligible', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:30Z'));
    vi.stubGlobal('fetch', vi.fn(async () => responseWith(projectedPayload())));
    const client = new SolarRealtimeClient({ baseUrl: () => 'http://backend.test' });

    await expect(client.maybeRefresh(true)).resolves.toBe(true);

    expect(client.status()).toMatchObject({
      aiaSpatialUse: 'eligible',
      aiaRenderEligible: true,
      aiaRenderReason: null,
      aiaRenderAgeMs: 90_000,
      aiaMaxRenderAgeMs: 21_600_000
    });
  });

  it('revokes projected rendering immediately after a refresh failure', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:30Z'));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWith(projectedPayload()))
      .mockRejectedValueOnce(new Error('network offline'));
    vi.stubGlobal('fetch', fetchMock);
    const client = new SolarRealtimeClient({ baseUrl: () => 'http://backend.test' });
    await client.maybeRefresh(true);

    await expect(client.maybeRefresh(true)).resolves.toBe(false);

    expect(client.status()).toMatchObject({
      freshness: 'stale',
      aiaSpatialUse: 'eligible',
      aiaRenderEligible: false,
      aiaRenderReason: 'realtime_refresh_failed'
    });
  });

  it('revokes projected rendering when the snapshot freshness deadline passes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:00Z'));
    vi.stubGlobal('fetch', vi.fn(async () => responseWith(projectedPayload({
      fetchedAtUtc: '2026-09-26T15:00:00Z',
      imageDateUtc: '2026-09-26T15:00:00Z'
    }))));
    const client = new SolarRealtimeClient({
      baseUrl: () => 'http://backend.test',
      pollIntervalMs: 30_000,
      staleAfterMs: 30_000
    });
    await client.maybeRefresh(true);

    vi.advanceTimersByTime(30_001);

    expect(client.status()).toMatchObject({
      freshness: 'stale',
      aiaRenderEligible: false,
      aiaRenderReason: 'realtime_snapshot_stale'
    });
  });

  it('revokes a fresh snapshot whose projected observation exceeds the render age', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:00Z'));
    vi.stubGlobal('fetch', vi.fn(async () => responseWith(projectedPayload({
      fetchedAtUtc: '2026-09-26T15:00:00Z',
      imageDateUtc: '2026-09-26T08:59:59Z'
    }))));
    const client = new SolarRealtimeClient({ baseUrl: () => 'http://backend.test' });

    await client.maybeRefresh(true);

    expect(client.status()).toMatchObject({
      freshness: 'fresh',
      aiaSpatialUse: 'eligible',
      aiaRenderEligible: false,
      aiaRenderReason: 'aia_observation_too_old',
      aiaRenderAgeMs: 21_601_000
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

  it('retains the raw AIA artifact but refuses it as a spatial texture', () => {
    const observationState = observationStateFromSolarRealtime(validPayload('standalone-image'));
    const status = inspectAiaObservationChannel(observationState);
    const selection = pickAiaObservationChannel(observationState);

    expect(status).toMatchObject({
      channel: 'aia_193',
      imageId: 'standalone-image',
      imageDate: '2026-09-26T14:59:00Z',
      spatialUse: 'disabled',
      reason: 'viewport_tile_has_no_validated_solar_surface_projection'
    });
    expect(selection).toBeNull();
    expect(
      buildAiaProxyTextureUrl('http://backend.test/', status?.channel, status?.imageId)
    ).toBe(
      'http://backend.test/solar/realtime/aia-tile?channel=aia_193&image_id=standalone-image&v=standalone-image'
    );
  });

  it('rejects an eligibility flag without a supported spatial projection contract', () => {
    const payload = structuredClone(validPayload()) as SolarRealtimePayload;
    const channel = payload.snapshot.sdo_aia?.channels.aia_193;
    if (!channel) throw new Error('fixture channel missing');
    channel.spatial_use = {
      eligible: true,
      reason: null,
      contract: { schema: { name: 'unknown_projection', version: 1 } }
    };

    const state = observationStateFromSolarRealtime(payload);

    expect(inspectAiaObservationChannel(state)).toMatchObject({
      spatialUse: 'unsupported',
      reason: 'unsupported_spatial_projection_contract'
    });
    expect(pickAiaObservationChannel(state)).toBeNull();
  });

  it('does not let a viewport artifact masquerade as a projected surface', () => {
    const payload = structuredClone(validPayload()) as SolarRealtimePayload;
    const channel = payload.snapshot.sdo_aia?.channels.aia_193;
    if (!channel) throw new Error('fixture channel missing');
    channel.spatial_use = {
      eligible: true,
      reason: null,
      contract: {
        schema: { name: 'solar_surface_texture_projection', version: 1 },
        projection: 'equirectangular',
        coordinate_frame: 'iau_sun_body_fixed',
        coverage: 'full_surface',
        uv_mapping: 'sun_surface_uv_v1'
      }
    };

    const state = observationStateFromSolarRealtime(payload);

    expect(inspectAiaObservationChannel(state)).toMatchObject({
      spatialUse: 'unsupported',
      reason: 'unsupported_spatial_projection_contract'
    });
    expect(pickAiaObservationChannel(state)).toBeNull();
  });

  it('rejects a viewport artifact that claims spatial eligibility', () => {
    const payload = structuredClone(validPayload()) as SolarRealtimePayload;
    const channel = payload.snapshot.sdo_aia?.channels.aia_193;
    if (!channel) throw new Error('fixture channel missing');
    channel.spatial_use = {
      eligible: true,
      reason: null,
      contract: {
        schema: { name: 'solar_surface_texture_projection', version: 1 },
        projection: 'equirectangular',
        coordinate_frame: 'iau_sun_body_fixed',
        coverage: 'full_surface',
        uv_mapping: 'sun_surface_uv_v1'
      }
    };

    expect(() => validateSolarRealtimePayload(payload)).toThrow(
      'viewport artifact must disable spatial use'
    );
  });

  it('rejects a surface artifact without the exact eligible projection contract', () => {
    const payload = structuredClone(validPayload()) as SolarRealtimePayload;
    const channel = payload.snapshot.sdo_aia?.channels.aia_193;
    if (!channel) throw new Error('fixture channel missing');
    channel.artifact = {
      schema: { name: 'solar_surface_texture', version: 1 },
      delivery: 'raw_on_demand'
    };
    channel.spatial_use = {
      eligible: true,
      reason: null,
      contract: {
        schema: { name: 'solar_surface_texture_projection', version: 1 },
        projection: 'equirectangular',
        coordinate_frame: 'iau_sun_body_fixed',
        coverage: 'partial',
        uv_mapping: 'sun_surface_uv_v1'
      }
    };

    expect(() => validateSolarRealtimePayload(payload)).toThrow(
      'surface artifact projection contract is invalid'
    );
  });

  it('accepts only the complete projected surface artifact union member', () => {
    const payload = structuredClone(validPayload()) as SolarRealtimePayload;
    const channel = payload.snapshot.sdo_aia?.channels.aia_193;
    if (!channel) throw new Error('fixture channel missing');
    channel.artifact = {
      schema: { name: 'solar_surface_texture', version: 1 },
      delivery: 'raw_on_demand'
    };
    channel.spatial_use = {
      eligible: true,
      reason: null,
      contract: {
        schema: { name: 'solar_surface_texture_projection', version: 1 },
        projection: 'equirectangular',
        coordinate_frame: 'iau_sun_body_fixed',
        coverage: 'full_surface',
        uv_mapping: 'sun_surface_uv_v1'
      }
    };

    const validated = validateSolarRealtimePayload(payload);
    const selection = pickAiaObservationChannel(
      observationStateFromSolarRealtime(validated)
    );

    expect(selection).toMatchObject({
      channel: 'aia_193',
      imageId: 'hv-193-42',
      spatialUse: 'eligible'
    });
  });

  it('can select a validated projected channel after a nonspatial preferred channel', () => {
    const payload = structuredClone(validPayload()) as SolarRealtimePayload;
    const channels = payload.snapshot.sdo_aia?.channels;
    if (!channels) throw new Error('fixture channels missing');
    channels.aia_171 = {
      source_id: 10,
      image_id: 'projected-171',
      image_date: '2026-09-26T14:59:00Z',
      tile_url: 'https://example.invalid/projected-171.png',
      artifact: {
        schema: { name: 'solar_surface_texture', version: 1 },
        delivery: 'raw_on_demand'
      },
      spatial_use: {
        eligible: true,
        reason: null,
        contract: {
          schema: { name: 'solar_surface_texture_projection', version: 1 },
          projection: 'equirectangular',
          coordinate_frame: 'iau_sun_body_fixed',
          coverage: 'full_surface',
          uv_mapping: 'sun_surface_uv_v1'
        }
      }
    };

    const state = observationStateFromSolarRealtime(payload);

    expect(pickAiaObservationChannel(state)).toMatchObject({
      channel: 'aia_171',
      imageId: 'projected-171',
      spatialUse: 'eligible',
      reason: null
    });
  });

  it('forces spatial observation blend to zero without an eligible texture', () => {
    const state = observationStateFromSolarRealtime(validPayload());
    if (!state?.data_assimilation) throw new Error('observation fixture missing');
    state.data_assimilation.observed_confidence = 0.9;

    const controls = deriveSunObservationControls(state, 0.8, 'aia_193', {
      hasObservationTexture: true,
      spatialUseEligible: false,
      selectedChannel: 'aia_193',
      selectedImageDate: '2026-09-26T14:59:00Z'
    });

    expect(controls.observationBlend).toBe(0);
    expect(controls.observationEmission).toBe(0);
    expect(controls.activityBoost).toBe(0);
    expect(controls.coronaHue).toBeNull();
    expect(controls.observedSignal).toBe(0);
    expect(controls.observedConfidence).toBe(0);
    expect(controls.observedFreshness).toBe(0);
  });
});
