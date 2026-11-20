import { describe, expect, it, vi } from 'vitest';
import { createLazyMoonEphemerisLoader } from './lazyMoonEphemerides';
import { publicShardFetch } from './moonRepairTestInputs.mjs';

describe('moon shards on a page without crypto.subtle (orbits-04)', () => {
  it('still loads a shard and checks its digest', async () => {
    vi.stubGlobal('crypto', {});
    try {
      const loaded = await createLazyMoonEphemerisLoader({ fetch: publicShardFetch }).load(['himalia']);
      expect(loaded.himalia).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('still refuses a corrupted shard', async () => {
    vi.stubGlobal('crypto', {});
    const corrupting = (async (input: RequestInfo | URL) => {
      const response = await publicShardFetch(input);
      if (String(input).endsWith('manifest.json')) return response;
      const bytes = new Uint8Array(await response.arrayBuffer());
      const at = bytes.indexOf(0x35); // flip one digit '5' to '6'
      bytes[at] = 0x36;
      return new Response(bytes, { status: 200, headers: { 'Content-Length': String(bytes.byteLength) } });
    }) as typeof fetch;
    try {
      await expect(createLazyMoonEphemerisLoader({ fetch: corrupting }).load(['himalia'])).rejects.toThrow(/integrity failure/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
