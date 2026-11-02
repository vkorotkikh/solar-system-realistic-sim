/// <reference types="node" />

import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { Camera, Texture, TextureLoader } from 'three';
import { createSunController } from '../../../sunController';
import { buildAiaProxyTextureUrl } from './solarObservationTexture';
import { resolveBackendOrigin } from '../../app/runtimeConfig';

// FE-AIA-SAME-ORIGIN. Found by /qa on 2026-10-24.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// Actual helper/controller/clients; only HTTP, clock/timers and image delivery are owned.
// Current main's absolute-origin default and nonspatial imagery are healthy controls.
const api = { createSunController, buildAiaProxyTextureUrl, resolveBackendOrigin };
type Controller = ReturnType<typeof createSunController>;
interface PendingLoad { url: string; onLoad: (texture: Texture) => void; onError: (error: unknown) => void }
interface Fixture { controller: Controller; loads: PendingLoad[]; fetches: string[]; configured: Texture[] }

const cases: Array<[string, unknown, unknown, string | null | undefined, string | null]> = [
  ['empty root', '', 'aia_193', 'owned', '/solar/realtime/aia-tile?channel=aia_193&image_id=owned&v=owned'],
  ['whitespace root', ' \t\n ', 'aia_193', 'owned', '/solar/realtime/aia-tile?channel=aia_193&image_id=owned&v=owned'],
  ['single slash root', '/', 'aia_193', 'owned', '/solar/realtime/aia-tile?channel=aia_193&image_id=owned&v=owned'],
  ['trimmed multiple slash root', ' /// ', 'aia_193', 'owned', '/solar/realtime/aia-tile?channel=aia_193&image_id=owned&v=owned'],
  ['relative prefix', '/api', 'aia_193', 'owned', '/api/solar/realtime/aia-tile?channel=aia_193&image_id=owned&v=owned'],
  ['trimmed prefix trailing slashes', ' /api/// ', ' AIA_193 ', 'owned', '/api/solar/realtime/aia-tile?channel=aia_193&image_id=owned&v=owned'],
  ['existing unrooted prefix', 'api/', 'aia_193', 'owned', 'api/solar/realtime/aia-tile?channel=aia_193&image_id=owned&v=owned'],
  ['absolute HTTPS origin', 'https://owned.invalid:8443///', 'aia_193', 'owned', 'https://owned.invalid:8443/solar/realtime/aia-tile?channel=aia_193&image_id=owned&v=owned'],
  ['absolute HTTP origin', 'http://owned.invalid/', 'aia_193', 'owned', 'http://owned.invalid/solar/realtime/aia-tile?channel=aia_193&image_id=owned&v=owned'],
  ['delimiter and Unicode encoding', '/api', ' AIA_193/&?Ω ', 'owned image/&?Ω', '/api/solar/realtime/aia-tile?channel=aia_193%2F%26%3F%CF%89&image_id=owned+image%2F%26%3F%CE%A9&v=owned+image%2F%26%3F%CE%A9'],
  ['root encoding', '', ' AIA_193 ', 'owned image/&?Ω', '/solar/realtime/aia-tile?channel=aia_193&image_id=owned+image%2F%26%3F%CE%A9&v=owned+image%2F%26%3F%CE%A9'],
  ['null image ID', '/api', 'aia_193', null, '/api/solar/realtime/aia-tile?channel=aia_193'],
  ['undefined image ID', '/api', 'aia_193', undefined, '/api/solar/realtime/aia-tile?channel=aia_193'],
  ['empty image ID', '/api', 'aia_193', '', '/api/solar/realtime/aia-tile?channel=aia_193'],
  ['null base remains absent', null, 'aia_193', 'owned', null],
  ['undefined base remains absent', undefined, 'aia_193', 'owned', null],
  ['empty channel', '/api', '', 'owned', null],
  ['whitespace channel', '', ' \t ', 'owned', null],
  ['null channel', '/api', null, 'owned', null],
  ['undefined channel', '/api', undefined, 'owned', null],
  // Outside declared string domain: preserve established nonempty coercion, not a new input guarantee.
  ['numeric base compatibility', 0, 'aia_193', null, '0/solar/realtime/aia-tile?channel=aia_193'],
  ['boolean base compatibility', false, 'aia_193', null, 'false/solar/realtime/aia-tile?channel=aia_193'],
  ['boxed prefix compatibility', new String('/api/'), 'aia_193', null, '/api/solar/realtime/aia-tile?channel=aia_193'],
  ['numeric channel compatibility', '/api', 193, null, '/api/solar/realtime/aia-tile?channel=193'],
];
for (const [label, base, channel, image, expected] of cases) {
  test(`literal URL: ${label}`, () => {
    assert.equal(api.buildAiaProxyTextureUrl(base as string | null | undefined, channel as string | null | undefined, image), expected);
  });
}

test('provided base coercion still occurs once and throwing coercion is not swallowed', () => {
  let calls = 0;
  assert.equal(api.buildAiaProxyTextureUrl({ toString() { calls++; return '/api/'; } } as unknown as string, 'aia_193'), '/api/solar/realtime/aia-tile?channel=aia_193');
  assert.equal(calls, 1);
  const failure = new Error('owned base conversion failure');
  assert.throws(() => api.buildAiaProxyTextureUrl({ toString() { throw failure; } } as unknown as string, 'aia_193'), (error: unknown) => error === failure);
});

for (const configured of ['', undefined]) {
  test(`current main origin resolution remains absolute: ${String(configured)}`, () => {
    const origin = api.resolveBackendOrigin(configured, 'https://observatory.example:8443');
    assert.equal(origin, 'https://observatory.example:8443');
    assert.equal(api.buildAiaProxyTextureUrl(origin, 'aia_193', 'owned'), 'https://observatory.example:8443/solar/realtime/aia-tile?channel=aia_193&image_id=owned&v=owned');
  });
}

function realtimePayload(now: number, eligible: boolean) {
  const at = new Date(now).toISOString();
  return { schema: { name: 'solar_realtime_endpoint', version: 1 }, source: 'backend', snapshot: {
    schema: { name: 'solar_realtime_context', version: 1 }, fetched_at_utc: at,
    source_status: { swpc: { ok: false, error: 'offline' }, silso: { ok: false, error: 'offline' },
      sdo_aia: { ok: true, updated: at }, gong_synoptic: { ok: false, status: 'disabled_unvalidated' } },
    swpc: null, silso: null, gong_synoptic: null, combined_activity_proxy: 0.5,
    sdo_aia: { channels: { aia_193: {
      image_id: 'owned-193-image', image_date: at, tile_url: 'https://owned.invalid/tile',
      artifact: { schema: { name: eligible ? 'solar_surface_texture' : 'helioviewer_viewport_tile', version: 1 }, delivery: 'raw_on_demand' },
      spatial_use: eligible ? { eligible: true, reason: null, contract: {
        schema: { name: 'solar_surface_texture_projection', version: 1 }, projection: 'equirectangular',
        coordinate_frame: 'iau_sun_body_fixed', coverage: 'full_surface', uv_mapping: 'sun_surface_uv_v1',
      } } : { eligible: false, reason: 'viewport_tile_has_no_validated_solar_surface_projection', contract: null },
    } }, channel_activity_proxy: null, activity_proxy: null, coronal_holes: null,
      scientific_inference: { status: 'disabled', reason: 'viewport_tile_has_no_validated_solar_surface_projection', activity_proxy: null, coronal_holes: null },
      visualization: { preferred_channel: 'aia_193' } },
  } };
}
async function flush() { for (let i = 0; i < 80; i++) await Promise.resolve(); }
async function controllerFixture(base: string, eligible: boolean, run: (fixture: Fixture) => Promise<void>) {
  const saved = { fetch: globalThis.fetch, now: Date.now, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const now = Date.UTC(2026, 9, 24), timers = new Map<number, { fn: TimerHandler; ms?: number }>(), loads: PendingLoad[] = [], fetches: string[] = [], configured: Texture[] = [];
  let timerId = 0, controller: Controller | undefined;
  Date.now = () => now;
  globalThis.setTimeout = ((fn: TimerHandler, ms?: number) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }) as typeof globalThis.setTimeout;
  globalThis.clearTimeout = ((id: number) => timers.delete(id)) as typeof globalThis.clearTimeout;
  globalThis.fetch = async input => {
    const url = String(input); fetches.push(url);
    if (!url.endsWith('/solar/realtime')) throw new Error(`Unexpected fixture URL: ${url}`);
    return { ok: true, status: 200, json: async () => realtimePayload(now, eligible) } as Response;
  };
  try {
    controller = api.createSunController({
      camera: {} as Camera, simState: { julianDate: 2460000.5 }, backendBaseUrl: () => base,
      configureLoadedTexture: loaded => configured.push(loaded),
      observationTextureLoader: { load: (url: string, onLoad: (texture: Texture) => void, _progress: unknown, onError: (error: unknown) => void) => loads.push({ url, onLoad, onError }) } as unknown as TextureLoader,
      getSunRadiusAu: () => 0.01, isMagneticFieldEnabled: () => false,
    });
    controller.maybeRefreshRealtime(now, true); await flush();
    assert.equal(timers.size, 0);
    await run({ controller, loads, fetches, configured });
  } finally {
    try { controller?.disposeSolarDelivery(); await flush(); assert.equal(timers.size, 0, 'owned timers cleaned'); }
    finally { globalThis.fetch = saved.fetch; Date.now = saved.now; globalThis.setTimeout = saved.setTimeout; globalThis.clearTimeout = saved.clearTimeout; }
  }
}

for (const [label, base, realtimeUrl, textureUrl] of [
  ['empty root', '', '/solar/realtime', '/solar/realtime/aia-tile?channel=aia_193&image_id=owned-193-image&v=owned-193-image'],
  ['slash root', '/', '/solar/realtime', '/solar/realtime/aia-tile?channel=aia_193&image_id=owned-193-image&v=owned-193-image'],
  ['prefix', '/api/', '/api/solar/realtime', '/api/solar/realtime/aia-tile?channel=aia_193&image_id=owned-193-image&v=owned-193-image'],
  ['absolute', 'https://owned.invalid/', 'https://owned.invalid/solar/realtime', 'https://owned.invalid/solar/realtime/aia-tile?channel=aia_193&image_id=owned-193-image&v=owned-193-image'],
]) {
  test(`actual controller eligible image delivery: ${label}`, async () => {
    await controllerFixture(base, true, async f => {
      assert.deepEqual(f.fetches, [realtimeUrl]);
      assert.equal(f.controller.getSolarDeliveryStatus().observation.renderEligible, true, 'actual projection/freshness checks accept owned fixture');
      assert.equal(f.loads.length, 1, 'eligible selected image starts a load');
      assert.equal(f.loads[0].url, textureUrl);
      const loaded = { needsUpdate: false, disposals: 0, dispose() { this.disposals++; } };
      f.loads[0].onLoad(loaded as unknown as Texture);
      assert.equal(f.configured[0], loaded);
      assert.equal(loaded.needsUpdate, true);
      assert.equal(f.controller.getSolarDeliveryStatus().observation.textureLoaded, true);
      f.controller.disposeSolarDelivery();
      assert.equal(loaded.disposals, 1);
    });
  });
}
for (const base of ['', 'https://owned.invalid']) {
  test(`actual controller rejects current nonspatial imagery: ${base || 'empty root'}`, async () => {
    await controllerFixture(base, false, async f => {
      assert.equal(f.fetches.length, 1);
      assert.equal(f.controller.getSolarDeliveryStatus().observation.renderEligible, false);
      assert.equal(f.loads.length, 0);
      assert.equal(f.configured.length, 0);
    });
  });
}
