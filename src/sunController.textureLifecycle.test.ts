/// <reference types="node" />

import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { Camera, Texture, TextureLoader } from 'three';
import { createSunController } from './sunController';
import type { SolarDataSourceStatus } from './frontend/features/solar/solarDataStatus';

// FE-TEXTURE-LATE-ERROR. Found by /qa on 2026-10-24.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// Actual controller and clients; only HTTP, clock/timers and image callbacks are owned.
// Synthetic eligible imagery is a lifecycle fixture, not a production observation gate.
type Controller = ReturnType<typeof createSunController>;
type OwnedTexture = Texture & { disposals: number };
interface PendingLoad { url: string; onLoad: (texture: Texture) => void; onError: (error: unknown) => void }
interface Fixture {
  controller: Controller;
  now: number;
  loads: PendingLoad[];
  configured: Texture[];
  publications: SolarDataSourceStatus[];
  fetches: string[];
  snapshot: () => ReturnType<Controller['getSolarDeliveryStatus']>;
  reload: () => Promise<void>;
}

const response = (value: unknown): Response => ({ ok: true, status: 200, json: async () => value } as Response);
async function flush() { for (let i = 0; i < 80; i++) await Promise.resolve(); }
function realtimePayload(now: number, eligible: boolean) {
  const at = new Date(now).toISOString();
  const channel = (name: string) => ({
    image_id: `owned-${name}-image`, image_date: at, tile_url: 'https://owned.invalid/tile',
    artifact: { schema: { name: eligible ? 'solar_surface_texture' : 'helioviewer_viewport_tile', version: 1 }, delivery: 'raw_on_demand' },
    spatial_use: eligible ? { eligible: true, reason: null, contract: {
      schema: { name: 'solar_surface_texture_projection', version: 1 },
      projection: 'equirectangular', coordinate_frame: 'iau_sun_body_fixed', coverage: 'full_surface', uv_mapping: 'sun_surface_uv_v1',
    } } : { eligible: false, reason: 'viewport_tile_has_no_validated_solar_surface_projection', contract: null },
  });
  return { schema: { name: 'solar_realtime_endpoint', version: 1 }, source: 'backend', snapshot: {
    schema: { name: 'solar_realtime_context', version: 1 }, fetched_at_utc: at,
    source_status: { swpc: { ok: false, error: 'offline' }, silso: { ok: false, error: 'offline' },
      sdo_aia: { ok: true, updated: at }, gong_synoptic: { ok: false, status: 'disabled_unvalidated' } },
    swpc: null, silso: null, gong_synoptic: null, combined_activity_proxy: 0.5,
    sdo_aia: { channels: { aia_193: channel('193'), aia_304: channel('304') },
      channel_activity_proxy: null, activity_proxy: null, coronal_holes: null,
      scientific_inference: { status: 'disabled', reason: 'viewport_tile_has_no_validated_solar_surface_projection', activity_proxy: null, coronal_holes: null },
      visualization: { preferred_channel: 'aia_193' } },
  } };
}
const physicsPayload = (jd: number) => ({
  schema: { name: 'solar_physics_state', version: 2 }, epoch_jd_tdb: jd, wall_epoch_jd_tdb: jd, jd_time_scale: 'TDB',
  forcing: 'hybrid', effective_forcing: 'synthetic', live_data_requested: true, live_data_enabled: false,
  fallback_reason: 'disabled_unvalidated', activity_index: 0.42,
  forcing_status: { requested: 'hybrid', effective: 'synthetic', observed_input_status: 'disabled_unvalidated',
    runtime_eligible: false, fallback_reason: 'disabled_unvalidated' },
});
function texture(): OwnedTexture {
  return { needsUpdate: false, disposals: 0, dispose(this: { disposals: number }) { this.disposals++; } } as unknown as OwnedTexture;
}

async function fixture(options: { physics?: boolean; eligible?: boolean }, run: (fixture: Fixture) => Promise<void>) {
  const { physics = false, eligible = true } = options;
  const saved = { fetch: globalThis.fetch, now: Date.now, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const now = Date.UTC(2026, 9, 24), timers = new Map<number, { fn: TimerHandler; ms?: number }>(), loads: PendingLoad[] = [], configured: Texture[] = [], publications: SolarDataSourceStatus[] = [], fetches: string[] = [];
  let timerId = 0, controller: Controller | undefined;
  Date.now = () => now;
  globalThis.setTimeout = ((fn: TimerHandler, ms?: number) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }) as typeof globalThis.setTimeout;
  globalThis.clearTimeout = ((id: number) => timers.delete(id)) as typeof globalThis.clearTimeout;
  globalThis.fetch = async input => {
    const url = String(input);
    fetches.push(url);
    if (url.endsWith('/solar/realtime')) return response(realtimePayload(now, eligible));
    if (url.includes('/solar/physics?')) return response(physicsPayload(Number(new URL(url).searchParams.get('jd_tdb'))));
    throw new Error(`Unexpected owned-fixture URL: ${url}`);
  };
  try {
    controller = createSunController({
      camera: {} as Camera, simState: { julianDate: 2460000.5 }, backendBaseUrl: () => 'http://owned.invalid',
      configureLoadedTexture: loaded => configured.push(loaded),
      observationTextureLoader: { load: (url: string, onLoad: (texture: Texture) => void, _progress: unknown, onError: (error: unknown) => void) => loads.push({ url, onLoad, onError }) } as unknown as TextureLoader,
      getSunRadiusAu: () => 0.01, isMagneticFieldEnabled: () => false,
      onSolarDataStatus: value => publications.push(structuredClone(value)),
    });
    if (physics) controller.maybeRefreshPhysics(now, true);
    else controller.maybeRefreshRealtime(now, true);
    await flush();
    assert.equal(loads.length, eligible ? 1 : 0, 'fixture reaches actual image selection');
    assert.equal(timers.size, 0, 'real clients completed their owned HTTP work');
    if (physics) assert.equal(publications.at(-1)!.state, 'backend', 'fixture delivered valid physics');
    await run({ controller, now, loads, configured, publications, fetches,
      snapshot: () => structuredClone(controller!.getSolarDeliveryStatus()),
      async reload() { controller!.maybeRefreshRealtime(now, true); await flush(); },
    });
  } finally {
    try { controller?.disposeSolarDelivery(); await flush(); assert.equal(timers.size, 0, 'no remaining fixture timers'); }
    finally {
      globalThis.fetch = saved.fetch; Date.now = saved.now;
      globalThis.setTimeout = saved.setTimeout; globalThis.clearTimeout = saved.clearTimeout;
    }
  }
}

for (const physics of [false, true]) {
  const label = physics ? 'with backend physics' : 'without backend physics';
  test(`late error is inert after disposing an initial pending texture ${label}`, async () => {
    await fixture({ physics }, async f => {
      f.controller.disposeSolarDelivery();
      const atDisposal = f.snapshot(), published = f.publications.length;
      f.loads[0].onError(new Error('owned late texture failure'));
      assert.equal(f.publications.length, published, 'retired image errors cannot publish');
      assert.deepEqual(f.snapshot(), atDisposal);
      assert.equal(f.configured.length, 0);
      assert.equal(f.loads.length, 1);
    });
  });
  test(`late success disposes its texture without publication ${label}`, async () => {
    await fixture({ physics }, async f => {
      f.controller.disposeSolarDelivery();
      const atDisposal = f.snapshot(), published = f.publications.length, late = texture();
      f.loads[0].onLoad(late);
      assert.equal(late.disposals, 1);
      assert.equal(late.needsUpdate, false);
      assert.equal(f.configured.length, 0);
      assert.equal(f.publications.length, published);
      assert.deepEqual(f.snapshot(), atDisposal);
      assert.equal(f.loads.length, 1);
    });
  });
  test(`active failure remains visible and a successful retry recovers ${label}`, async () => {
    await fixture({ physics }, async f => {
      const published = f.publications.length;
      f.loads[0].onError(new Error('owned active texture failure'));
      assert.equal(f.publications.length, published + 1);
      assert.equal(f.snapshot().observation.loadInFlight, false);
      if (physics) assert.match(f.publications.at(-1)!.text, /AIA 193 image failed to load/);
      await f.reload();
      assert.equal(f.loads.length, 2);
      const loaded = texture(); f.loads[1].onLoad(loaded);
      assert.equal(f.configured.length, 1);
      assert.equal(f.configured[0], loaded);
      assert.equal(loaded.needsUpdate, true);
      assert.equal(loaded.disposals, 0);
      assert.equal(f.snapshot().observation.textureLoaded, true);
      assert.equal(f.snapshot().observation.textureChannel, 'aia_193');
      assert.equal(f.publications.length, published + 2);
      assert.doesNotMatch(f.publications.at(-1)!.text, /image failed to load/);
    });
  });
}

test('late error cannot republish after legitimate bound-texture disposal', async () => {
  await fixture({ physics: true }, async f => {
    const bound = texture(); f.loads[0].onLoad(bound);
    await f.reload(); assert.equal(f.loads.length, 2);
    const published = f.publications.length;
    f.controller.disposeSolarDelivery();
    assert.equal(bound.disposals, 1);
    assert.equal(f.publications.length, published + 1, 'binding revocation publishes synchronously');
    const atDisposal = f.snapshot();
    f.loads[1].onError(new Error('owned late reload failure'));
    assert.equal(f.publications.length, published + 1, 'no later retired-image publication');
    assert.deepEqual(f.snapshot(), atDisposal);
    assert.equal(bound.disposals, 1);
  });
});

test('late successful reload disposes only its incoming texture after binding revocation', async () => {
  await fixture({ physics: true }, async f => {
    const bound = texture(); f.loads[0].onLoad(bound);
    await f.reload(); assert.equal(f.loads.length, 2);
    const published = f.publications.length;
    f.controller.disposeSolarDelivery();
    assert.equal(f.publications.length, published + 1);
    const atDisposal = f.snapshot(), late = texture(); f.loads[1].onLoad(late);
    assert.equal(bound.disposals, 1);
    assert.equal(late.disposals, 1);
    assert.equal(late.needsUpdate, false);
    assert.equal(f.configured.length, 1);
    assert.equal(f.publications.length, published + 1);
    assert.deepEqual(f.snapshot(), atDisposal);
  });
});

test('bound disposal publishes once and later public refresh calls stay terminal', async () => {
  await fixture({ physics: true }, async f => {
    const bound = texture(); f.loads[0].onLoad(bound);
    const published = f.publications.length, fetches = f.fetches.length;
    f.controller.disposeSolarDelivery();
    assert.equal(f.publications.length, published + 1);
    assert.equal(bound.disposals, 1);
    const atDisposal = f.snapshot();
    f.controller.disposeSolarDelivery();
    f.controller.maybeRefreshPhysics(f.now, true);
    f.controller.maybeRefreshRealtime(f.now, true);
    await flush();
    assert.equal(f.publications.length, published + 1);
    assert.equal(f.fetches.length, fetches);
    assert.equal(bound.disposals, 1);
    assert.deepEqual(f.snapshot(), atDisposal);
  });
});

test('currently nonspatial backend-style imagery remains ineligible', async () => {
  await fixture({ eligible: false }, async f => {
    assert.equal(f.loads.length, 0);
    assert.equal(f.snapshot().observation.renderEligible, false);
    assert.equal(f.snapshot().observation.textureLoaded, false);
  });
});

test('active superseded-channel success disposes stale texture and loads current selection', async () => {
  await fixture({}, async f => {
    const published = f.publications.length;
    f.controller.setAiaChannelOverride('aia_304');
    assert.equal(f.loads.length, 1, 'existing in-flight image policy is preserved');
    const stale = texture(); f.loads[0].onLoad(stale);
    assert.equal(stale.disposals, 1);
    assert.equal(stale.needsUpdate, false);
    assert.equal(f.configured.length, 0);
    assert.equal(f.publications.length, published);
    assert.equal(f.loads.length, 2);
    assert.match(f.loads[1].url, /channel=aia_304/);
    const current = texture(); f.loads[1].onLoad(current);
    assert.equal(current.disposals, 0);
    assert.equal(f.configured[0], current);
    assert.equal(f.snapshot().observation.textureChannel, 'aia_304');
    assert.equal(f.publications.length, published + 1);
  });
});
