import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SolarRealtimeClient } from './solarRealtimeClient';

const payload = () => ({
  schema: { name: 'solar_realtime_endpoint', version: 1 }, source: 'backend',
  snapshot: {
    schema: { name: 'solar_realtime_context', version: 1 },
    fetched_at_utc: new Date().toISOString(),
    source_status: {
      swpc: { ok: false }, silso: { ok: false }, sdo_aia: { ok: false }, gong_synoptic: { ok: false }
    },
    swpc: null, silso: null, sdo_aia: null, gong_synoptic: null, combined_activity_proxy: null
  }
});
const response = (json: () => Promise<unknown>) => ({ ok: true, status: 200, json }) as Response;
let client: SolarRealtimeClient;
beforeEach(() => { vi.useFakeTimers(); client = new SolarRealtimeClient({ baseUrl: () => '', timeoutMs: 500 }); });
afterEach(() => { client.dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('solar realtime transport lifecycle', () => {
  it('bounds body decoding even when abort is ignored and allows a later retry', async () => {
    let finishBody!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(() => new Promise(resolve => { finishBody = resolve; }))));
    let settled = false;
    const pending = client.maybeRefresh().then(value => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(500);
    expect(settled).toBe(true);
    expect(await pending).toBe(false);
    expect(client.inFlight).toBe(false);
    expect(client.lastError).toMatch(/timed out/);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(async () => payload())));
    expect(await client.maybeRefresh(true)).toBe(true);
    const accepted = client.latestState();
    finishBody({ invalid: true }); await Promise.resolve(); await Promise.resolve();
    expect(client.latestState()).toBe(accepted);
    expect(client.lastError).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles disposal during decoding without recording a stale request failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(() => new Promise(() => {}))));
    let settled = false;
    const pending = client.maybeRefresh().then(value => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(0); client.dispose(); await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true); expect(await pending).toBe(false);
    expect(client.lastError).toBeNull(); expect(client.inFlight).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases the in-flight latch when URL resolution throws', async () => {
    client = new SolarRealtimeClient({ baseUrl: () => { throw new Error('endpoint unavailable'); } });
    await expect(client.maybeRefresh()).resolves.toBe(false);
    expect(client.inFlight).toBe(false); expect(client.lastError).toMatch(/endpoint unavailable/);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves explicit validation failure and recovers on the next valid delivery', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(async () => ({ schema: {} }))));
    expect(await client.maybeRefresh()).toBe(false); expect(client.lastError).toBeTruthy();
    expect(client.latestState()).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(async () => payload())));
    expect(await client.maybeRefresh(true)).toBe(true); expect(client.lastError).toBeNull();
  });

  it.each(['pollIntervalMs', 'timeoutMs', 'errorBackoffMs', 'staleAfterMs'] as const)(
    'rejects nonfinite timing option %s', (key) => {
      expect(() => new SolarRealtimeClient({ baseUrl: () => '', [key]: NaN })).toThrow(/finite/);
    }
  );
});
