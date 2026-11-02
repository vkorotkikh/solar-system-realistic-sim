/**
 * H-1 draft specs for the sunController physics -> AIA texture chain.
 * Target location after the fix: src/sunController.test.ts
 *
 * createSunController can be built in vitest's node environment: construction touches no DOM,
 * rebuildMagneticFieldLines() returns early without initSunVisuals(), and the TextureLoader is
 * injected, so a stub records every AIA tile URL requested.
 */
import { PerspectiveCamera } from 'three';
import { createSunController } from '../../../wt-h1/src/sunController';

const AIA_PAYLOAD = {
  schema: { name: 'solar_physics_state', version: 1 },
  activity_index: 0.56,
  corona: { features: [] },
  data_assimilation: {
    applied: true,
    observed_confidence: 0.39,
    live_data_available: true,
    sources: {
      sdo_aia: {
        visualization: { preferred_channel: 'aia_193' },
        channels: {
          aia_193: {
            image_id: '192406635',
            image_date: '2026-09-25 00:17:53',
            tile_url: 'https://api.helioviewer.org/v2/getTile/?id=192406635&x=-1&y=-1&imageScale=0.601789',
          },
        },
      },
    },
  },
};

function build(fetchImpl: (url: string, init: RequestInit) => Promise<Response>) {
  const load = vi.fn();
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  const ctrl = createSunController({
    camera: new PerspectiveCamera(),
    simState: { julianDate: 2_461_308.5 },
    backendBaseUrl: () => 'http://127.0.0.1:8042',
    configureLoadedTexture: () => {},
    observationTextureLoader: { load } as never,
    getSunRadiusAu: () => 0.00465,
    isMagneticFieldEnabled: () => false,
  });
  return { ctrl, load };
}

beforeEach(() => vi.useFakeTimers({ now: new Date('2026-09-24T12:00:00Z') }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('H-1 sunController physics -> AIA chain', () => {
  it('regression guard (green today): first physics success requests the AIA tile via the backend proxy', async () => {
    const { ctrl, load } = build(async () => new Response(JSON.stringify(AIA_PAYLOAD), { status: 200 }));
    ctrl.maybeRefreshPhysics(Date.now(), true);
    await vi.advanceTimersByTimeAsync(10);
    expect(load).toHaveBeenCalledTimes(1);
    expect(String(load.mock.calls[0][0])).toBe(
      'http://127.0.0.1:8042/solar/realtime/aia-tile?channel=aia_193&image_id=192406635&v=192406635',
    );
  });

  it('while physics keeps timing out, no AIA tile is requested AND the controller exposes a status for the UI', async () => {
    const { ctrl, load } = build((_u, init) => new Promise((_res, rej) => {
      init.signal?.addEventListener('abort', () => rej(new DOMException('This operation was aborted', 'AbortError')));
    }));
    for (let t = 0; t < 30_000; t += 100) {
      ctrl.maybeRefreshPhysics(Date.now());
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(load).not.toHaveBeenCalled();
    const getStatus = (ctrl as unknown as { getPhysicsStatus?: () => { state?: string } }).getPhysicsStatus;
    expect(typeof getStatus).toBe('function'); // no status accessor exists at bd48a7d
    expect(getStatus?.().state).toBe('timeout');
  });
});
