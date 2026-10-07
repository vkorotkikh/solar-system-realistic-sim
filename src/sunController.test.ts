import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Camera, Texture, TextureLoader } from 'three';

import { createSunController } from './sunController';
import {
  updateSunCoronalLoopsFromBlendView,
  updateSunParkerSpiralFromPhysicsState,
  updateSunspotUniforms
} from './frontend/features/solar/sunVisuals';

// Call-through spies: every test still draws with the real functions.
vi.mock('./frontend/features/solar/sunVisuals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./frontend/features/solar/sunVisuals')>();
  return {
    ...actual,
    updateSunCoronalLoopsFromBlendView: vi.fn(actual.updateSunCoronalLoopsFromBlendView),
    updateSunParkerSpiralFromPhysicsState: vi.fn(actual.updateSunParkerSpiralFromPhysicsState),
    updateSunspotUniforms: vi.fn(actual.updateSunspotUniforms)
  };
});

function responseWith(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  } as Response;
}

function realtimePayload(spatiallyEligible = false): Record<string, unknown> {
  const observedAtUtc = new Date().toISOString();
  return {
    schema: { name: 'solar_realtime_endpoint', version: 1 },
    source: 'backend',
    snapshot: {
      schema: { name: 'solar_realtime_context', version: 1 },
      fetched_at_utc: observedAtUtc,
      source_status: {
        swpc: { ok: false, error: 'offline' },
        silso: { ok: false, error: 'offline' },
        sdo_aia: { ok: true, updated: observedAtUtc },
        gong_synoptic: { ok: false, status: 'disabled_unvalidated' }
      },
      swpc: null,
      silso: null,
      sdo_aia: {
        channels: {
          aia_193: {
            image_id: 'realtime-only-image',
            image_date: observedAtUtc,
            tile_url: 'https://api.helioviewer.org/v2/getTile/?id=42',
            artifact: {
              schema: {
                name: spatiallyEligible
                  ? 'solar_surface_texture'
                  : 'helioviewer_viewport_tile',
                version: 1
              },
              delivery: 'raw_on_demand'
            },
            spatial_use: spatiallyEligible
              ? {
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
              : {
                  eligible: false,
                  reason: 'viewport_tile_has_no_validated_solar_surface_projection',
                  contract: null
                }
          }
        },
        channel_activity_proxy: null,
        activity_proxy: null,
        coronal_holes: null,
        scientific_inference: {
          status: 'disabled',
          reason: 'viewport_tile_has_no_validated_solar_surface_projection',
          activity_proxy: null,
          coronal_holes: null
        },
        visualization: { preferred_channel: 'aia_193' }
      },
      gong_synoptic: null,
      combined_activity_proxy: 0.5
    }
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sun controller solar delivery', () => {
  it('does not load a nonspatial AIA viewport tile and exposes the reason', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/solar/realtime')) return responseWith(realtimePayload());
      if (url.includes('/solar/physics?')) return responseWith({}, 503);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const load = vi.fn();
    const controller = createSunController({
      camera: {} as Camera,
      simState: { julianDate: 2_460_000.5 },
      backendBaseUrl: () => 'http://backend.test',
      configureLoadedTexture: vi.fn((_texture: Texture) => undefined),
      observationTextureLoader: { load } as unknown as TextureLoader,
      getSunRadiusAu: () => 0.01,
      isMagneticFieldEnabled: () => false
    });

    controller.maybeRefreshPhysics(Date.now(), true);

    await vi.waitFor(() => {
      expect(controller.getSolarDeliveryStatus().realtime).toMatchObject({
        source: 'backend',
        freshness: 'fresh',
        lastError: null
      });
    });
    expect(load).not.toHaveBeenCalled();
    expect(controller.getSolarDeliveryStatus()).toMatchObject({
      realtime: { source: 'backend', freshness: 'fresh', lastError: null },
      physics: { lastError: expect.stringContaining('(503)') },
      observation: {
        channel: 'aia_193',
        imageId: 'realtime-only-image',
        spatialUse: 'disabled',
        reason: 'viewport_tile_has_no_validated_solar_surface_projection',
        activeRenderChannel: null,
        textureLoaded: false,
        loadInFlight: false
      }
    });
    controller.setAiaChannelOverride('aia_304');
    expect(controller.getSolarDeliveryStatus().observation).toMatchObject({
      channel: 'aia_193',
      spatialUse: 'disabled',
      activeRenderChannel: null
    });
    controller.disposeSolarDelivery();
  });

  it('revokes a loaded observation texture when its spatial contract is withdrawn', async () => {
    let spatiallyEligible = true;
    vi.stubGlobal('fetch', vi.fn(async () => responseWith(realtimePayload(spatiallyEligible))));

    let settleTexture: ((texture: Texture) => void) | null = null;
    const load = vi.fn((_url: string, onLoad: (texture: Texture) => void) => {
      settleTexture = onLoad;
    });
    const controller = createSunController({
      camera: {} as Camera,
      simState: { julianDate: 2_460_000.5 },
      backendBaseUrl: () => 'http://backend.test',
      configureLoadedTexture: vi.fn((_texture: Texture) => undefined),
      observationTextureLoader: { load } as unknown as TextureLoader,
      getSunRadiusAu: () => 0.01,
      isMagneticFieldEnabled: () => false
    });

    controller.maybeRefreshRealtime(Date.now(), true);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    const disposeLoadedTexture = vi.fn();
    if (!settleTexture) throw new Error('texture callback was not captured');
    (settleTexture as (texture: Texture) => void)({
      dispose: disposeLoadedTexture,
      needsUpdate: false
    } as unknown as Texture);
    expect(controller.getSolarDeliveryStatus().observation).toMatchObject({
      activeRenderChannel: 'aia_193',
      textureLoaded: true
    });

    spatiallyEligible = false;
    controller.maybeRefreshRealtime(Date.now(), true);
    await vi.waitFor(() => {
      expect(controller.getSolarDeliveryStatus().observation.spatialUse).toBe('disabled');
    });

    expect(disposeLoadedTexture).toHaveBeenCalledTimes(1);
    expect(controller.getSolarDeliveryStatus().observation).toMatchObject({
      activeRenderChannel: null,
      textureLoaded: false,
      textureChannel: null,
      textureImageId: null
    });
    controller.disposeSolarDelivery();
  });

  it('rejects an async texture result after the selected projection is revoked', async () => {
    let spatiallyEligible = true;
    vi.stubGlobal('fetch', vi.fn(async () => responseWith(realtimePayload(spatiallyEligible))));

    let settleTexture: ((texture: Texture) => void) | null = null;
    const load = vi.fn((_url: string, onLoad: (texture: Texture) => void) => {
      settleTexture = onLoad;
    });
    const configureLoadedTexture = vi.fn((_texture: Texture) => undefined);
    const controller = createSunController({
      camera: {} as Camera,
      simState: { julianDate: 2_460_000.5 },
      backendBaseUrl: () => 'http://backend.test',
      configureLoadedTexture,
      observationTextureLoader: { load } as unknown as TextureLoader,
      getSunRadiusAu: () => 0.01,
      isMagneticFieldEnabled: () => false
    });

    controller.maybeRefreshRealtime(Date.now(), true);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    spatiallyEligible = false;
    controller.maybeRefreshRealtime(Date.now(), true);
    await vi.waitFor(() => {
      expect(controller.getSolarDeliveryStatus().observation.spatialUse).toBe('disabled');
    });

    const disposeIncomingTexture = vi.fn();
    if (!settleTexture) throw new Error('texture callback was not captured');
    (settleTexture as (texture: Texture) => void)({
      dispose: disposeIncomingTexture,
      needsUpdate: false
    } as unknown as Texture);

    expect(disposeIncomingTexture).toHaveBeenCalledTimes(1);
    expect(configureLoadedTexture).not.toHaveBeenCalled();
    expect(controller.getSolarDeliveryStatus().observation).toMatchObject({
      activeRenderChannel: null,
      textureLoaded: false,
      loadInFlight: false
    });
    controller.disposeSolarDelivery();
  });

  it('revokes a loaded projected texture immediately after realtime refresh failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWith(realtimePayload(true)))
      .mockRejectedValueOnce(new Error('network offline'));
    vi.stubGlobal('fetch', fetchMock);

    let settleTexture: ((texture: Texture) => void) | null = null;
    const load = vi.fn((_url: string, onLoad: (texture: Texture) => void) => {
      settleTexture = onLoad;
    });
    const controller = createSunController({
      camera: {} as Camera,
      simState: { julianDate: 2_460_000.5 },
      backendBaseUrl: () => 'http://backend.test',
      configureLoadedTexture: vi.fn((_texture: Texture) => undefined),
      observationTextureLoader: { load } as unknown as TextureLoader,
      getSunRadiusAu: () => 0.01,
      isMagneticFieldEnabled: () => false
    });

    controller.maybeRefreshRealtime(Date.now(), true);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    const disposeLoadedTexture = vi.fn();
    if (!settleTexture) throw new Error('texture callback was not captured');
    (settleTexture as (texture: Texture) => void)({
      dispose: disposeLoadedTexture,
      needsUpdate: false
    } as unknown as Texture);

    controller.maybeRefreshRealtime(Date.now(), true);
    await vi.waitFor(() => {
      expect(controller.getSolarDeliveryStatus().realtime.lastError).toBe('network offline');
    });

    expect(disposeLoadedTexture).toHaveBeenCalledTimes(1);
    expect(controller.getSolarDeliveryStatus()).toMatchObject({
      realtime: {
        aiaRenderEligible: false,
        aiaRenderReason: 'realtime_refresh_failed'
      },
      observation: {
        renderEligible: false,
        renderReason: 'realtime_refresh_failed',
        activeRenderChannel: null,
        textureLoaded: false
      }
    });
    controller.disposeSolarDelivery();
  });

  it('keeps backend geometry off-screen until its frame is validated, and says so', async () => {
    const jdTdb = 2_460_000.5;
    const physicsPayload = {
      schema: { name: 'solar_physics_state', version: 2 },
      epoch_jd_tdb: jdTdb,
      wall_epoch_jd_tdb: jdTdb,
      jd_time_scale: 'TDB',
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
      },
      activity_index: 0.42,
      corona: { features: [{ id: 'loop-1', kind: 'loop', brightness: 1, arc: [[1, 0, 0], [1.2, 0.3, 0], [1, 0.5, 0]] }] },
      heliosphere: { parker_spiral: { lines: [{ id: 'arm-0', arc: [[1.1, 0, 0], [200, 40, 0], [400, 120, 0]], wind_speed_kms: 420 }] } }
    };
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => (
      String(input).includes('/solar/physics') ? responseWith(physicsPayload) : Promise.reject(new Error('offline'))
    )));
    const onSolarDataStatus = vi.fn();
    const controller = createSunController({
      camera: {} as Camera,
      simState: { julianDate: jdTdb },
      backendBaseUrl: () => 'http://backend.test',
      configureLoadedTexture: vi.fn((_texture: Texture) => undefined),
      observationTextureLoader: { load: vi.fn() } as unknown as TextureLoader,
      getSunRadiusAu: () => 0.3755,
      isMagneticFieldEnabled: () => false,
      onSolarDataStatus
    });
    controller.maybeRefreshPhysics(Date.now(), true);
    await vi.waitFor(() => expect(onSolarDataStatus.mock.lastCall?.[0]?.state).toBe('backend'));
    controller.update(jdTdb, 1);

    expect(vi.mocked(updateSunParkerSpiralFromPhysicsState).mock.lastCall?.[1]).toBeNull();
    expect(vi.mocked(updateSunCoronalLoopsFromBlendView).mock.lastCall?.[1]).toBeNull();
    expect(vi.mocked(updateSunspotUniforms).mock.lastCall?.[3]).toBeUndefined();
    expect(onSolarDataStatus.mock.lastCall?.[0]?.text).toContain('Sun: backend activity, procedural features');
    controller.disposeSolarDelivery();
  });

  it('draws the solar-cycle activity, not a quiet Sun, before any backend data', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    const controller = createSunController({
      camera: {} as Camera,
      simState: { julianDate: 2_461_307.5 },
      backendBaseUrl: () => 'http://backend.test',
      configureLoadedTexture: vi.fn((_texture: Texture) => undefined),
      observationTextureLoader: { load: vi.fn() } as unknown as TextureLoader,
      getSunRadiusAu: () => 0.01,
      isMagneticFieldEnabled: () => false
    });
    const material = controller.createSunMaterial({} as Texture);

    controller.update(2_461_307.5, 1);

    // 2026-09-24 is near solar-cycle-25 maximum, so the cycle model is high (about 0.75);
    // Number(null) used to pin the uniform at 0, a completely quiet Sun.
    expect(material?.uniforms.activity.value).toBeGreaterThan(0.5);
    expect(material?.uniforms.activity.value).toBeLessThan(1);
    controller.disposeSolarDelivery();
  });

  it('republishes the Sun status chip when a loaded texture is revoked', async () => {
    vi.stubGlobal('fetch', vi
      .fn()
      .mockResolvedValueOnce(responseWith(realtimePayload(true)))
      .mockRejectedValueOnce(new Error('network offline')));
    let settleTexture: ((texture: Texture) => void) | null = null;
    const load = vi.fn((_url: string, onLoad: (texture: Texture) => void) => {
      settleTexture = onLoad;
    });
    const onSolarDataStatus = vi.fn();
    const controller = createSunController({
      camera: {} as Camera,
      simState: { julianDate: 2_460_000.5 },
      backendBaseUrl: () => 'http://backend.test',
      configureLoadedTexture: vi.fn((_texture: Texture) => undefined),
      observationTextureLoader: { load } as unknown as TextureLoader,
      getSunRadiusAu: () => 0.01,
      isMagneticFieldEnabled: () => false,
      onSolarDataStatus
    });
    controller.maybeRefreshRealtime(Date.now(), true);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    (settleTexture as unknown as (texture: Texture) => void)({ dispose: vi.fn(), needsUpdate: false } as unknown as Texture);
    const publishedBeforeRevoke = onSolarDataStatus.mock.calls.length;

    controller.maybeRefreshRealtime(Date.now(), true);
    await vi.waitFor(() => {
      expect(controller.getSolarDeliveryStatus().observation.textureLoaded).toBe(false);
    });

    expect(onSolarDataStatus.mock.calls.length).toBeGreaterThan(publishedBeforeRevoke);
    controller.disposeSolarDelivery();
  });

  it('revokes a loaded projected texture when the snapshot freshness deadline passes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:00Z'));
    vi.stubGlobal('fetch', vi.fn(async () => responseWith(realtimePayload(true))));

    let settleTexture: ((texture: Texture) => void) | null = null;
    const load = vi.fn((_url: string, onLoad: (texture: Texture) => void) => {
      settleTexture = onLoad;
    });
    const controller = createSunController({
      camera: {} as Camera,
      simState: { julianDate: 2_460_000.5 },
      backendBaseUrl: () => 'http://backend.test',
      configureLoadedTexture: vi.fn((_texture: Texture) => undefined),
      observationTextureLoader: { load } as unknown as TextureLoader,
      getSunRadiusAu: () => 0.01,
      isMagneticFieldEnabled: () => false
    });

    controller.maybeRefreshRealtime(Date.now(), true);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    const disposeLoadedTexture = vi.fn();
    if (!settleTexture) throw new Error('texture callback was not captured');
    (settleTexture as (texture: Texture) => void)({
      dispose: disposeLoadedTexture,
      needsUpdate: false
    } as unknown as Texture);

    vi.advanceTimersByTime(300_001);
    controller.update(2_460_000.5, 1);

    expect(disposeLoadedTexture).toHaveBeenCalledTimes(1);
    expect(controller.getSolarDeliveryStatus().observation).toMatchObject({
      renderEligible: false,
      renderReason: 'realtime_snapshot_stale',
      activeRenderChannel: null,
      textureLoaded: false
    });
    controller.disposeSolarDelivery();
  });

  it('applies the render-age gate to the user-selected projected channel', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:00Z'));
    const payload = realtimePayload(true) as {
      snapshot: {
        sdo_aia: {
          channels: Record<string, Record<string, unknown>>;
        };
      };
    };
    const freshChannel = payload.snapshot.sdo_aia.channels.aia_193;
    payload.snapshot.sdo_aia.channels.aia_304 = {
      ...structuredClone(freshChannel),
      image_id: 'old-304-image',
      image_date: '2026-09-26T08:59:59Z'
    };
    vi.stubGlobal('fetch', vi.fn(async () => responseWith(payload)));

    const load = vi.fn();
    const controller = createSunController({
      camera: {} as Camera,
      simState: { julianDate: 2_460_000.5 },
      backendBaseUrl: () => 'http://backend.test',
      configureLoadedTexture: vi.fn((_texture: Texture) => undefined),
      observationTextureLoader: { load } as unknown as TextureLoader,
      getSunRadiusAu: () => 0.01,
      isMagneticFieldEnabled: () => false
    });
    controller.setAiaChannelOverride('aia_304');

    controller.maybeRefreshRealtime(Date.now(), true);
    await vi.waitFor(() => {
      expect(controller.getSolarDeliveryStatus().realtime.source).toBe('backend');
    });

    expect(load).not.toHaveBeenCalled();
    expect(controller.getSolarDeliveryStatus().observation).toMatchObject({
      channel: 'aia_304',
      imageId: 'old-304-image',
      spatialUse: 'eligible',
      renderEligible: false,
      renderReason: 'aia_observation_too_old',
      activeRenderChannel: null,
      textureLoaded: false
    });
    controller.disposeSolarDelivery();
  });

  it('rejects late texture success and all refreshes after terminal disposal', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/solar/realtime')) return responseWith(realtimePayload(true));
      if (url.includes('/solar/physics?')) return responseWith({}, 503);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    let settleTexture: ((texture: Texture) => void) | null = null;
    const load = vi.fn((
      _url: string,
      onLoad: (texture: Texture) => void
    ) => {
      settleTexture = onLoad;
    });
    const configureLoadedTexture = vi.fn((_texture: Texture) => undefined);
    const controller = createSunController({
      camera: {} as Camera,
      simState: { julianDate: 2_460_000.5 },
      backendBaseUrl: () => 'http://backend.test',
      configureLoadedTexture,
      observationTextureLoader: { load } as unknown as TextureLoader,
      getSunRadiusAu: () => 0.01,
      isMagneticFieldEnabled: () => false
    });
    controller.maybeRefreshPhysics(Date.now(), true);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));

    controller.disposeSolarDelivery();
    const requestCountAtDisposal = fetchMock.mock.calls.length;
    const disposeIncomingTexture = vi.fn();
    const incomingTexture = {
      dispose: disposeIncomingTexture,
      needsUpdate: false
    } as unknown as Texture;
    if (!settleTexture) throw new Error('Texture load callback was not captured');
    const finishTexture = settleTexture as (texture: Texture) => void;
    finishTexture(incomingTexture);
    controller.maybeRefreshPhysics(Date.now(), true);
    controller.maybeRefreshRealtime(Date.now(), true);
    await Promise.resolve();

    expect(disposeIncomingTexture).toHaveBeenCalledTimes(1);
    expect(configureLoadedTexture).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(requestCountAtDisposal);
    expect(controller.getSolarDeliveryStatus()).toMatchObject({
      disposed: true,
      observation: {
        textureLoaded: false,
        loadInFlight: false
      },
      physics: { disposed: true, inFlight: false },
      realtime: { disposed: true, inFlight: false }
    });
  });
});
