import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Group, Mesh, PerspectiveCamera, SphereGeometry, Texture } from 'three';
import type { Camera, TextureLoader } from 'three';
import capturedPhysics from '../backend/tests/fixtures/solar_frames/synthetic_state_2451552.json';
import { createSunController } from './sunController';
import { SolarPhysicsClient } from './frontend/features/solar/solarPhysicsClient';
import type { SolarDataSourceStatus } from './frontend/features/solar/solarDataStatus';

type Controller = ReturnType<typeof createSunController>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function responseWith(payload: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => payload } as Response;
}
async function flushMicrotasks(count = 40) {
  for (let i = 0; i < count; i++) await Promise.resolve();
}
function physicsPayload(jd: number) {
  return {
    schema: { name: 'solar_physics_state', version: 2 }, epoch_jd_tdb: jd,
    wall_epoch_jd_tdb: jd, jd_time_scale: 'TDB', forcing: 'hybrid', effective_forcing: 'synthetic',
    live_data_requested: true, live_data_enabled: false, fallback_reason: 'disabled_unvalidated',
    activity_index: 0.42,
    forcing_status: { requested: 'hybrid', effective: 'synthetic', observed_input_status: 'disabled_unvalidated',
      runtime_eligible: false, fallback_reason: 'disabled_unvalidated' }
  };
}
// Same supported, synthetic projection fixture used by sunController.test.ts.
// It exercises ownership only; no production observation gate is enabled.
function realtimePayload(eligible = true) {
  const at = new Date().toISOString();
  return {
    schema: { name: 'solar_realtime_endpoint', version: 1 }, source: 'backend', snapshot: {
      schema: { name: 'solar_realtime_context', version: 1 }, fetched_at_utc: at,
      source_status: { swpc: { ok: false, error: 'offline' }, silso: { ok: false, error: 'offline' },
        sdo_aia: { ok: true, updated: at }, gong_synoptic: { ok: false, status: 'disabled_unvalidated' } },
      swpc: null, silso: null, gong_synoptic: null, combined_activity_proxy: 0.5,
      sdo_aia: {
        channels: { aia_193: { image_id: 'owned-force-image', image_date: at,
          tile_url: 'https://owned.invalid/tile',
          artifact: { schema: { name: eligible ? 'solar_surface_texture' : 'helioviewer_viewport_tile', version: 1 }, delivery: 'raw_on_demand' },
          spatial_use: eligible
            ? { eligible: true, reason: null, contract: { schema: { name: 'solar_surface_texture_projection', version: 1 },
              projection: 'equirectangular', coordinate_frame: 'iau_sun_body_fixed', coverage: 'full_surface', uv_mapping: 'sun_surface_uv_v1' } }
            : { eligible: false, reason: 'viewport_tile_has_no_validated_solar_surface_projection', contract: null } } },
        channel_activity_proxy: null, activity_proxy: null, coronal_holes: null,
        scientific_inference: { status: 'disabled', reason: 'viewport_tile_has_no_validated_solar_surface_projection',
          activity_proxy: null, coronal_holes: null }, visualization: { preferred_channel: 'aia_193' }
      }
    }
  };
}

interface PendingFetch {
  url: string;
  signal: AbortSignal;
  delivery: ReturnType<typeof deferred<Response>>;
}
interface ClientCall { jd: number; force: boolean; disposed: boolean; settled: boolean; result?: boolean }
const cleanups: Array<() => Promise<void>> = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(Date.UTC(2026, 9, 24));
});
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0)) await cleanup();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

function fixture(withVisuals = false) {
  const physics: PendingFetch[] = [], realtime: PendingFetch[] = [];
  const publications: SolarDataSourceStatus[] = [], calls: ClientCall[] = [];
  const textures: Array<{ url: string; onLoad: (texture: Texture) => void }> = [];
  const simState = { julianDate: 2451552, paused: true, timeScaleDaysPerSec: 0 };
  const hooks: { onStatus?: () => void; onClientSettled?: (call: ClientCall) => void } = {};
  const realRefresh = SolarPhysicsClient.prototype.maybeRefresh;
  // Call through: counts distinguish wrapper reentry from actual transport.
  vi.spyOn(SolarPhysicsClient.prototype, 'maybeRefresh').mockImplementation(function (this: SolarPhysicsClient, jd, force = false) {
    const call: ClientCall = { jd, force, disposed: this.status().disposed, settled: false };
    calls.push(call);
    const result = realRefresh.call(this, jd, force);
    void result.then(updated => { call.settled = true; call.result = updated; hooks.onClientSettled?.(call); });
    return result;
  });
  vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const request: PendingFetch = { url: String(input), signal: init?.signal as AbortSignal, delivery: deferred<Response>() };
    if (request.url.endsWith('/solar/realtime')) realtime.push(request);
    else if (request.url.includes('/solar/physics?')) physics.push(request);
    else throw new Error(`Unexpected owned request: ${request.url}`);
    return request.delivery.promise;
  }));
  let controller: Controller;
  controller = createSunController({
    camera: withVisuals ? new PerspectiveCamera() : {} as Camera, simState,
    backendBaseUrl: () => 'http://owned.invalid', configureLoadedTexture: () => undefined,
    observationTextureLoader: { load: (url: string, onLoad: (texture: Texture) => void) => textures.push({ url, onLoad }) } as unknown as TextureLoader,
    getSunRadiusAu: () => 0.004655, isMagneticFieldEnabled: () => withVisuals,
    onSolarDataStatus: status => { publications.push(status); if (controller) hooks.onStatus?.(); }
  });
  const root = new Group();
  if (withVisuals) {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('document', { createElement: () => ({ width: 4, height: 4, getContext: () => null }) });
    const spin = new Group(); root.add(spin);
    const material = controller.createSunMaterial(new Texture())!;
    const surface = new Mesh(new SphereGeometry(1, 8, 4), material); spin.add(surface);
    controller.initSunVisuals({ node: root, spinGroup: spin, sunBody: { rotationPeriodHours: 609.12 }, sunGeometry: surface.geometry });
  }
  cleanups.push(async () => {
    hooks.onStatus = undefined; hooks.onClientSettled = undefined;
    controller.disposeSolarDelivery();
    for (const request of [...physics, ...realtime]) request.delivery.reject(new Error('owned cleanup'));
    await flushMicrotasks();
  });
  return {
    controller, simState, physics, realtime, calls, textures, publications, hooks, root,
    refresh(force = true) { controller.maybeRefreshPhysics(Date.now(), force); },
    succeed(index: number, jd = simState.julianDate) { physics[index].delivery.resolve(responseWith(physicsPayload(jd))); },
    async bindObservation() {
      controller.maybeRefreshRealtime(Date.now(), true);
      realtime[0].delivery.resolve(responseWith(realtimePayload())); await flushMicrotasks();
      expect(textures).toHaveLength(1);
      const texture = new Texture(); const dispose = vi.spyOn(texture, 'dispose');
      textures[0].onLoad(texture);
      expect(controller.getSolarDeliveryStatus().observation.textureLoaded).toBe(true);
      return dispose;
    }
  };
}

// FE-PHYSICS-FORCE. Found by /qa on 2026-10-24.
// agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md.
// Real clients/Three objects; only external transport and texture completion are controlled.
describe('solar physics wrapper request ownership', () => {
  it('forwards force while non-force stays single-flight, without an old finally releasing the new owner', async () => {
    const f = fixture(); f.refresh();
    f.simState.julianDate += 100; f.refresh(false);
    expect(f.calls).toHaveLength(1);
    f.refresh();
    expect(f.physics).toHaveLength(2);
    expect(new URL(f.physics[1].url).searchParams.get('jd_tdb')).toBe('2451652.00000000');
    expect(f.physics[0].signal.aborted).toBe(true);
    const published = f.publications.length;
    await flushMicrotasks();
    expect(f.calls[0]).toMatchObject({ settled: true, result: false });
    expect(f.publications).toHaveLength(published);
    f.refresh(false);
    expect(f.calls).toHaveLength(2); // Fetch count alone misses an incorrectly cleared wrapper flag.
    f.succeed(1); await flushMicrotasks();
    expect(f.controller.getSolarDeliveryStatus().geometry.snapshotEpochJdTdb).toBe(2451652);
    expect(f.publications).toHaveLength(published + 1);
  });

  it.each(['resolve', 'reject'] as const)('keeps only the latest of three forced requests after late transports %s', async late => {
    const f = fixture(); f.refresh();
    f.simState.julianDate += 100; f.refresh();
    f.simState.julianDate += 100; f.refresh();
    expect(f.physics).toHaveLength(3);
    expect(f.physics.slice(0, 2).every(request => request.signal.aborted)).toBe(true);
    const published = f.publications.length;
    await flushMicrotasks(); f.refresh(false);
    expect(f.calls).toHaveLength(3);
    expect(f.calls.slice(0, 2).map(call => call.result)).toEqual([false, false]);
    expect(f.publications).toHaveLength(published);
    f.succeed(2); await flushMicrotasks();
    const accepted = f.controller.getSolarDeliveryStatus();
    for (const request of f.physics.slice(0, 2)) {
      if (late === 'resolve') request.delivery.resolve(responseWith(physicsPayload(2451552)));
      else request.delivery.reject(new Error('late retired transport'));
    }
    await flushMicrotasks();
    expect(f.controller.getSolarDeliveryStatus()).toEqual(accepted);
    expect(accepted.geometry.snapshotEpochJdTdb).toBe(2451752);
    expect(f.publications).toHaveLength(published + 1);
  });

  it.each(['force', 'dispose'] as const)('rejects a ready result when %s happens before its wrapper then', async action => {
    const f = fixture(); f.refresh();
    f.hooks.onClientSettled = call => {
      if (call !== f.calls[0]) return;
      f.hooks.onClientSettled = undefined;
      if (action === 'dispose') f.controller.disposeSolarDelivery();
      else { f.simState.julianDate += 100; f.refresh(); }
    };
    const published = f.publications.length;
    f.succeed(0); await flushMicrotasks();
    expect(f.calls[0].result).toBe(true);
    expect(f.controller.getSolarDeliveryStatus().geometry.snapshotEpochJdTdb).toBeNull();
    expect(f.publications).toHaveLength(published);
    if (action === 'force') {
      expect(f.calls).toHaveLength(2);
      f.succeed(1); await flushMicrotasks();
      expect(f.controller.getSolarDeliveryStatus().geometry.snapshotEpochJdTdb).toBe(2451652);
    }
  });

  it('does not publish or release an old owner when force lands between its then and finally', async () => {
    const f = fixture(); f.refresh();
    f.hooks.onClientSettled = call => {
      if (call !== f.calls[0]) return;
      f.hooks.onClientSettled = undefined;
      queueMicrotask(() => { f.simState.julianDate += 100; f.refresh(); });
    };
    const published = f.publications.length;
    f.succeed(0); await flushMicrotasks();
    expect(f.calls).toHaveLength(2);
    expect(f.controller.getSolarDeliveryStatus().geometry.snapshotEpochJdTdb).toBe(2451552);
    expect(f.publications).toHaveLength(published);
    f.refresh(false); expect(f.calls).toHaveLength(2);
    f.succeed(1); await flushMicrotasks();
    expect(f.publications).toHaveLength(published + 1);
  });

  it.each(['fetch', 'body'] as const)('settles a retired %s caller without post-disposal wrapper publication', async stage => {
    const f = fixture(); const body = deferred<unknown>(); f.refresh();
    if (stage === 'body') {
      f.physics[0].delivery.resolve({ ...responseWith(null), json: () => body.promise } as Response);
      await flushMicrotasks();
    }
    f.controller.disposeSolarDelivery(); const published = f.publications.length;
    await flushMicrotasks();
    expect(f.calls[0]).toMatchObject({ settled: true, result: false });
    expect(f.publications).toHaveLength(published);
    f.controller.disposeSolarDelivery(); f.refresh(); f.refresh(false);
    f.controller.maybeRefreshRealtime(Date.now(), true);
    expect(f.calls).toHaveLength(1); expect(f.physics).toHaveLength(1);
    body.resolve(physicsPayload(2451552)); f.succeed(0); await flushMicrotasks();
    expect(f.publications).toHaveLength(published);
    expect(f.controller.getSolarDeliveryStatus()).toMatchObject({ disposed: true, physics: { inFlight: false, disposed: true } });
  });

  it('preserves ordinary cadence and last-good state after an owned HTTP failure', async () => {
    const f = fixture(); const start = Date.now(); f.refresh(); f.succeed(0); await flushMicrotasks();
    vi.setSystemTime(start + 29_999); f.refresh(false); expect(f.calls).toHaveLength(1);
    vi.setSystemTime(start + 30_000); f.refresh(false); expect(f.calls).toHaveLength(2);
    f.physics[1].delivery.resolve(responseWith({ detail: 'owned failure' }, 503)); await flushMicrotasks();
    expect(f.controller.getSolarDeliveryStatus()).toMatchObject({
      geometry: { snapshotEpochJdTdb: 2451552 }, physics: { lastFailure: { kind: 'http', httpStatus: 503 }, consecutiveFailures: 1 }
    });
    vi.setSystemTime(start + 59_999); f.refresh(false); expect(f.calls).toHaveLength(2);
    vi.setSystemTime(start + 60_000); f.refresh(false); expect(f.calls).toHaveLength(3);
  });

  it('continues realtime delivery while physics is pending and still suppresses nonspatial image loading', async () => {
    const f = fixture(); f.refresh();
    f.realtime[0].delivery.resolve(responseWith(realtimePayload(false))); await flushMicrotasks();
    expect(f.controller.getSolarDeliveryStatus()).toMatchObject({
      physics: { inFlight: true }, realtime: { freshness: 'fresh' }, observation: { textureLoaded: false, renderEligible: false }
    });
    expect(f.textures).toHaveLength(0);
    f.controller.maybeRefreshRealtime(Date.now(), true);
    expect(f.realtime).toHaveLength(2); expect(f.physics).toHaveLength(1);
  });

  it('preserves synchronous publication when disposal revokes an actually bound image', async () => {
    const f = fixture(); const dispose = await f.bindObservation(); const published = f.publications.length;
    f.controller.disposeSolarDelivery();
    expect(dispose).toHaveBeenCalledOnce();
    expect(f.publications).toHaveLength(published + 1);
    await flushMicrotasks();
    expect(f.publications).toHaveLength(published + 1);
    expect(f.controller.getSolarDeliveryStatus().observation.textureLoaded).toBe(false);
  });

  it.each(['force', 'dispose'] as const)('rechecks admission after observation revocation synchronously invokes %s', async action => {
    const f = fixture(); await f.bindObservation();
    let reentered = false;
    f.hooks.onStatus = () => {
      if (reentered || f.controller.getSolarDeliveryStatus().observation.textureLoaded) return;
      reentered = true;
      if (action === 'dispose') f.controller.disposeSolarDelivery();
      else { f.simState.julianDate += 100; f.refresh(); }
    };
    vi.setSystemTime(Date.now() + 600_001); // Revoke the stale observation in the outer call.
    const published = f.publications.length; f.refresh(); await flushMicrotasks();
    expect(reentered).toBe(true);
    expect(f.publications).toHaveLength(published + 1);
    expect(f.calls).toHaveLength(action === 'force' ? 1 : 0);
    expect(f.physics).toHaveLength(action === 'force' ? 1 : 0);
    expect(f.realtime).toHaveLength(2); // The independent helper ran before physics admission.
    if (action === 'force') expect(f.calls[0]).toMatchObject({ jd: 2451652, force: true, disposed: false });
  });

  it.each(['force', 'dispose'] as const)('fully applies A before its observation callback invokes %s', async action => {
    const f = fixture(true); await f.bindObservation(); const initialField = f.controller.magneticFieldGroup;
    f.refresh(); await flushMicrotasks();
    expect(f.textures).toHaveLength(2); f.textures[1].onLoad(new Texture());
    let reentered = false, fieldAtNotification: number | undefined, epochAtNotification: number | null = null;
    let publishedAtNotification = 0;
    f.hooks.onStatus = () => {
      if (reentered || f.controller.getSolarDeliveryStatus().observation.textureLoaded) return;
      reentered = true;
      epochAtNotification = f.controller.getSolarDeliveryStatus().geometry.snapshotEpochJdTdb;
      fieldAtNotification = f.controller.magneticFieldGroup?.userData.activity;
      publishedAtNotification = f.publications.length;
      if (action === 'dispose') f.controller.disposeSolarDelivery();
      else { f.simState.julianDate += 100; f.refresh(); }
    };
    const accepted = structuredClone(capturedPhysics); accepted.activity_index = 0.9;
    accepted.corona.features[0].arc[0] = [1, 0, 0]; accepted.pfss_field_lines.lines[0].arc[0] = [1, 0, 0];
    f.physics[0].delivery.resolve(responseWith(accepted));
    await flushMicrotasks(1);
    f.realtime[1].delivery.resolve(responseWith(realtimePayload(false)));
    await flushMicrotasks();
    expect(reentered).toBe(true);
    expect(epochAtNotification).toBe(2451552);
    expect(fieldAtNotification).toBe(0.9); // A must not remain half-applied if callback retires it.
    expect(f.controller.magneticFieldGroup).not.toBe(initialField);
    expect(f.publications).toHaveLength(publishedAtNotification);
    if (action === 'force') {
      expect(f.calls).toHaveLength(2);
      f.physics[1].delivery.resolve(responseWith({ detail: 'replacement B failed' }, 503)); await flushMicrotasks();
      f.controller.update(f.simState.julianDate, 0);
      const loops = f.root.children.find(child => child.userData.bodyId === 'sun-coronal-loops')!;
      expect(loops.children).toHaveLength(8);
      expect(f.controller.getSolarDeliveryStatus().geometry.snapshotEpochJdTdb).toBe(2451552);
      expect(f.controller.magneticFieldGroup?.userData).toMatchObject({ activity: 0.9, solarGeometrySource: 'backend_synthetic_uncalibrated' });
      expect(f.publications).toHaveLength(publishedAtNotification + 1);
    } else {
      expect(f.controller.getSolarDeliveryStatus().disposed).toBe(true);
      f.refresh(); expect(f.calls).toHaveLength(1);
    }
  });
});
