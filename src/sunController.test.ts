import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Camera, Texture, TextureLoader } from 'three';

import { createSunController } from './sunController';

function responseWith(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  } as Response;
}

function realtimePayload(spatiallyEligible = false): Record<string, unknown> {
  return {
    schema: { name: 'solar_realtime_endpoint', version: 1 },
    source: 'backend',
    snapshot: {
      schema: { name: 'solar_realtime_context', version: 1 },
      fetched_at_utc: new Date().toISOString(),
      source_status: {
        swpc: { ok: false, error: 'offline' },
        silso: { ok: false, error: 'offline' },
        sdo_aia: { ok: true, updated: '2026-09-26T14:59:00Z' },
        gong_synoptic: { ok: false, status: 'disabled_unvalidated' }
      },
      swpc: null,
      silso: null,
      sdo_aia: {
        channels: {
          aia_193: {
            image_id: 'realtime-only-image',
            image_date: '2026-09-26T14:59:00Z',
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
        textureLoaded: false,
        loadInFlight: false
      }
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
