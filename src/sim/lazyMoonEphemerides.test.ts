import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { loadMoonEphemerides } from './loadMoonEphemerides';
import { publicShardFetch } from './moonRepairTestInputs.mjs';

it('loads an explicitly requested unpromoted body through the public shard loader', async () => {
  const bodies = await loadMoonEphemerides({ additionalBodyKeys: ['amalthea'], lazyOptions: { fetch: publicShardFetch } });
  expect(bodies.amalthea).toBeDefined();
  expect(bodies.amalthea.provenance.targetId).toBe('505');
  expect(bodies.amalthea.validation.accuracyLimits.velocityMPerS).toBe(10);
  expect(bodies.titan).toBeDefined();
});

import { describe, vi } from 'vitest';
import { createLazyMoonEphemerisLoader } from './lazyMoonEphemerides';

it.each(['gzip', 'br'] as const)('loads verified decoded shards from native %s HTTP responses', async encoding => {
  const server = createServer((request, response) => {
    const name = request.url?.split('/').pop() ?? '';
    if (name !== 'manifest.json' && !/^[a-f0-9]{64}\.json$/.test(name)) {
      response.writeHead(404); response.end(); return;
    }
    const raw = readFileSync(new URL(`../../public/moon-ephemerides/${name}`, import.meta.url));
    const wire = encoding === 'gzip' ? gzipSync(raw) : brotliCompressSync(raw);
    response.writeHead(200, {
      'Content-Type': 'application/json', 'Content-Encoding': encoding, 'Content-Length': wire.length
    });
    response.end(wire);
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing HTTP test port');
    const loader = createLazyMoonEphemerisLoader({ baseUrl: `http://127.0.0.1:${address.port}/nested/` });
    const manifest = await loader.getManifest();
    const loaded = await loader.load(['amalthea']);
    expect(Object.keys(loaded)).toEqual(['amalthea']);
    expect(loaded.amalthea.provenance.targetId).toBe(manifest.bodies.amalthea.targetId);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

it('retains decoded integrity when CORS hides Content-Encoding', async () => {
  const loader = createLazyMoonEphemerisLoader({ fetch: async input => {
    const response = await publicShardFetch(input);
    const decoded = await response.arrayBuffer();
    const cors = new Response(decoded, { headers: { 'Content-Length': '100' } });
    Object.defineProperty(cors, 'type', { value: 'cors' });
    return cors;
  } });
  expect(Object.keys(await loader.load(['amalthea']))).toEqual(['amalthea']);
});

const jsonResponse = (value: unknown) => new Response(JSON.stringify(value), {
  headers: { 'Content-Type': 'application/json' }
});

describe('content-addressed opt-in delivery', () => {
  it('does no IO until requested and keeps the default loader at the existing 13 models', async () => {
    const fetcher = vi.fn(publicShardFetch);
    const loader = createLazyMoonEphemerisLoader({ fetch: fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await loader.load([])).toEqual({});
    expect(Object.keys(await loadMoonEphemerides({ lazyOptions: { fetch: fetcher } }))).toHaveLength(13);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fetches only one requested shard, deduplicates in-flight requests, and freezes cached state', async () => {
    const fetcher = vi.fn(publicShardFetch);
    const loader = createLazyMoonEphemerisLoader({ fetch: fetcher });
    const [first, second] = await Promise.all([loader.load(['amalthea', 'amalthea']), loader.load(['amalthea'])]);
    expect(Object.keys(first)).toEqual(['amalthea']);
    expect(first.amalthea).toBe(second.amalthea);
    expect((await loader.load(['amalthea'])).amalthea).toBe(first.amalthea);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(Object.isFrozen(first.amalthea)).toBe(true);
    expect(Object.isFrozen(first.amalthea.segments[0].coefficients[0])).toBe(true);
  });

  it('retains 423 identities and only the newer Puck solution while storing only one Puck shard', async () => {
    const loader = createLazyMoonEphemerisLoader({ fetch: publicShardFetch });
    const manifest = await loader.getManifest();
    expect(manifest.records).toHaveLength(423);
    expect(manifest.records.filter(row => row.delivery === 'lazy')).toHaveLength(410);
    expect(Object.keys(manifest.bodies)).toHaveLength(410);
    expect(manifest.records.filter(row => row.key === 'puck').map(row => row.catalogId)).toEqual([388]);
    expect(manifest.bodies.puck.catalogIds).toEqual([388]);
    expect(manifest.bodies.puck.accuracyLimits).toEqual({ positionKm: 86.004, velocityMPerS: 10 });
    expect(Object.keys(await loader.load(['puck', 'puck']))).toEqual(['puck']);
  });

  it('bounds concurrently open coefficient response bodies', async () => {
    let active = 0, maximum = 0;
    const fetcher = async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/manifest.json')) return publicShardFetch(input);
      const bytes = new Uint8Array(await (await publicShardFetch(input)).arrayBuffer());
      return new Response(new ReadableStream({
        start() { active += 1; maximum = Math.max(maximum, active); },
        async pull(controller) {
          await new Promise(resolve => setTimeout(resolve, 3));
          controller.enqueue(bytes); active -= 1; controller.close();
        }
      }));
    };
    const loader = createLazyMoonEphemerisLoader({ fetch: fetcher, maxConcurrentRequests: 2 });
    const manifest = await loader.getManifest();
    const keys = Object.keys(manifest.bodies).slice(0, 8);
    expect(Object.keys(await loader.load(keys))).toHaveLength(8);
    expect(maximum).toBe(2);
    expect(active).toBe(0);
  });

  it('does not poison a retry after a transport failure', async () => {
    let fail = true;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (!String(input).endsWith('/manifest.json') && fail) { fail = false; throw new Error('transport unavailable'); }
      return publicShardFetch(input);
    });
    const loader = createLazyMoonEphemerisLoader({ fetch: fetcher });
    await expect(loader.load(['amalthea'])).rejects.toThrow('transport unavailable');
    expect((await loader.load(['amalthea'])).amalthea).toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('bounds retained serialized bytes with LRU eviction, and permits a zero cache', async () => {
    const manifest = await createLazyMoonEphemerisLoader({ fetch: publicShardFetch }).getManifest();
    const fetcher = vi.fn(publicShardFetch);
    const keys = ['amalthea', 'himalia'];
    const budget = Math.max(...keys.map(key => manifest.bodies[key].bytes));
    const loader = createLazyMoonEphemerisLoader({ fetch: fetcher, maxCacheBytes: budget });
    await loader.load([keys[0]]); await loader.load([keys[1]]); await loader.load([keys[0]]);
    expect(fetcher).toHaveBeenCalledTimes(4);
    const uncachedFetch = vi.fn(publicShardFetch);
    const uncached = createLazyMoonEphemerisLoader({ fetch: uncachedFetch, maxCacheBytes: 0 });
    await uncached.load(['amalthea']); await uncached.load(['amalthea']);
    expect(uncachedFetch).toHaveBeenCalledTimes(3);
  });

  it('rejects unknown identities without fetching any coefficient shard', async () => {
    const fetcher = vi.fn(publicShardFetch);
    const loader = createLazyMoonEphemerisLoader({ fetch: fetcher });
    await expect(loader.load(['amalthea', 'not-a-moon'])).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  for (const [name, mutate] of [
    ['missing record', (m: any) => { m.records.pop(); }],
    ['wrong target', (m: any) => { m.bodies.amalthea.targetId = '599'; }],
    ['wrong parent', (m: any) => { m.bodies.amalthea.centerId = '699'; }],
    ['relaxed cap', (m: any) => { m.bodies.amalthea.accuracyLimits.velocityMPerS = 11; }],
    ['relaxed Puck ceiling', (m: any) => { m.bodies.puck.accuracyLimits.positionKm = 86.008; }],
    ['zero Puck cap', (m: any) => { m.bodies.puck.accuracyLimits.positionKm = 0; }],
    ['nonfinite Puck cap', (m: any) => { m.bodies.puck.accuracyLimits.positionKm = Infinity; }],
    ['unqualified source', (m: any) => { m.bodies.amalthea.sourceQuality = ''; }],
    ['path escape', (m: any) => { m.bodies.amalthea.path = '../escape.json'; }],
    ['false coverage', (m: any) => { m.bodies.amalthea.coverageStartJd -= 1; }]
  ] as const) {
    it(`rejects manifest ${name}`, async () => {
      const fetcher = vi.fn(async (input: RequestInfo | URL) => {
        const response = await publicShardFetch(input);
        if (!String(input).endsWith('/manifest.json')) return response;
        const value = await response.json(); mutate(value); return jsonResponse(value);
      });
      await expect(createLazyMoonEphemerisLoader({ fetch: fetcher }).load(['amalthea'])).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  }

  for (const kind of ['corrupt', 'truncated', 'oversized', 'http-failure'] as const) {
    it(`rejects ${kind} coefficient bytes instead of falling back`, async () => {
      const fetcher = async (input: RequestInfo | URL) => {
        const response = await publicShardFetch(input);
        if (String(input).endsWith('/manifest.json')) return response;
        if (kind === 'http-failure') return new Response('unavailable', { status: 503 });
        const raw = new Uint8Array(await response.arrayBuffer());
        if (kind === 'corrupt') { raw[raw.length - 1] ^= 1; return new Response(raw); }
        if (kind === 'truncated') return new Response(raw.slice(0, -1));
        return new Response(new Uint8Array(2 * 1024 * 1024 + 1));
      };
      await expect(createLazyMoonEphemerisLoader({ fetch: fetcher }).load(['amalthea'])).rejects.toThrow();
    });
  }

  it('rejects invalid concurrency and cache budgets before IO', () => {
    expect(() => createLazyMoonEphemerisLoader({ maxConcurrentRequests: 0 })).toThrow();
    expect(() => createLazyMoonEphemerisLoader({ maxConcurrentRequests: 9 })).toThrow();
    expect(() => createLazyMoonEphemerisLoader({ maxCacheBytes: -1 })).toThrow();
    expect(() => createLazyMoonEphemerisLoader({ maxCacheBytes: 33 * 1024 * 1024 })).toThrow();
  });
});

import { mutatedShardFetch } from './moonRepairTestInputs.mjs';

for (const [name, mutate] of [
  ['target identity', (body: any) => { body.provenance.targetId = '599'; }],
  ['center identity', (body: any) => { body.provenance.centerId = '699'; }],
  ['numerical-source identity', (body: any) => { body.provenance.sourceEphemeris = 'different solution'; }],
  ['declared accuracy cap', (body: any) => { body.validation.accuracyLimits.velocityMPerS = 11; }],
  ['declared coverage', (body: any) => { body.coverageStartJd -= 1; }]
] as const) {
  it(`rejects content-address-consistent corruption of ${name}`, async () => {
    const fetcher = await mutatedShardFetch('amalthea', mutate);
    await expect(createLazyMoonEphemerisLoader({ fetch: fetcher }).load(['amalthea'])).rejects.toThrow();
  });
}

// Rehashed corruptions must reach semantic admission, rather than stop at SHA-256.
for (const [name, mutate] of [
  ['missing vector oracle', (v: any) => { delete v.vectorOracle; }],
  ['wrong alias identity', (v: any) => { v.vectorOracle.catalogIds = [378]; }],
  ['missing shared Puck alias', (v: any) => { v.vectorOracle.catalogIds = [378]; v.vectorOracle.sampleCount = 7; }],
  ['duplicate shared Puck alias', (v: any) => { v.vectorOracle.catalogIds = [378, 378]; }],
  ['extra retired Puck alias', (v: any) => { v.vectorOracle.catalogIds = [388, 378]; }],
  ['incomplete per-alias samples', (v: any) => { v.vectorOracle.sampleCount -= 1; }],
  ['extra per-alias samples', (v: any) => { v.vectorOracle.sampleCount += 1; }],
  ['fractional sample count', (v: any) => { v.vectorOracle.sampleCount = 7.5; }],
  ['missing oracle statistic', (v: any) => { delete v.vectorOracle.positionErrorKm.p95; }],
  ['nonfinite oracle statistic', (v: any) => { v.vectorOracle.velocityErrorMPerS.p95 = Infinity; }],
  ['negative oracle statistic', (v: any) => { v.vectorOracle.positionErrorKm.p50 = -1; }],
  ['unordered oracle statistics', (v: any) => { v.vectorOracle.positionErrorKm.p95 = v.vectorOracle.positionErrorKm.p99 + 1; }],
  ['oracle position above cap', (v: any) => { v.vectorOracle.positionErrorKm.max = v.accuracyLimits.positionKm + 1; }],
  ['oracle velocity above cap', (v: any) => { v.vectorOracle.velocityErrorMPerS.max = 10.01; }],
] as const) {
  it(`rejects semantic certificate corruption: ${name}`, async () => {
    const key = name.includes('Puck') ? 'puck' : 'amalthea';
    const fetcher = await mutatedShardFetch(key, (body: any) => mutate(body.validation));
    await expect(createLazyMoonEphemerisLoader({ fetch: fetcher }).load([key])).rejects.toThrow(/vector oracle/i);
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

for (const kind of ['http', 'malformed-length', 'unsafe-length', 'oversized-length', 'wrong-exact-length', 'decoded-overflow', 'decoded-exact-overflow'] as const) {
  it(`awaits real stream cancellation before transferring its permit: ${kind}`, async () => {
    const events: string[] = [];
    const finishCancellation = deferred();
    let rejectedResponse!: Response;
    let exactBytes = 0;
    const fetcher = async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/manifest.json')) return publicShardFetch(input);
      if (events.includes('first')) { events.push('next'); return publicShardFetch(input); }
      events.push('first');
      const headers: Record<string, string> = {};
      if (kind === 'malformed-length') headers['Content-Length'] = 'NaN';
      if (kind === 'unsafe-length') headers['Content-Length'] = '9007199254740993';
      if (kind === 'oversized-length') headers['Content-Length'] = '2097153';
      if (kind === 'wrong-exact-length') headers['Content-Length'] = '1';
      rejectedResponse = new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          if (kind === 'decoded-overflow') controller.enqueue(new Uint8Array(2097153));
          if (kind === 'decoded-exact-overflow') controller.enqueue(new Uint8Array(exactBytes + 1));
        },
        async cancel() {
          events.push('cancel-start');
          await finishCancellation.promise;
          events.push('cancel-end');
        }
      }), { status: kind === 'http' ? 503 : 200, headers });
      return rejectedResponse;
    };
    const loader = createLazyMoonEphemerisLoader({ fetch: fetcher, maxConcurrentRequests: 1 });
    exactBytes = (await loader.getManifest()).bodies.amalthea.bytes;
    const first = loader.load(['amalthea']).catch(error => error);
    const second = loader.load(['himalia']);
    try {
      await vi.waitFor(() => expect(events).toContain('cancel-start'), { timeout: 150 });
      expect(events).not.toContain('next');
    } finally { finishCancellation.resolve(); }
    expect(await first).toBeInstanceOf(Error);
    expect((await second).himalia).toBeDefined();
    expect(events).toEqual(['first', 'cancel-start', 'cancel-end', 'next']);
    expect(rejectedResponse.body!.locked).toBe(false);
  });
}

it('aborts a stalled body and awaits stream cleanup before releasing its permit', async () => {
  const events: string[] = [];
  const finishCancellation = deferred();
  let signal: AbortSignal | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).endsWith('/manifest.json')) return publicShardFetch(input);
    if (events.includes('first')) { events.push('next'); return publicShardFetch(input); }
    events.push('first'); signal = init?.signal ?? undefined;
    return new Response(new ReadableStream({
      async cancel() { events.push('cancel-start'); await finishCancellation.promise; events.push('cancel-end'); }
    }));
  };
  const loader = createLazyMoonEphemerisLoader({ fetch: fetcher, maxConcurrentRequests: 1, requestTimeoutMs: 25 });
  // Keep the 25 ms deadline virtual for every request, to the end of the test: the
  // manifest and the second shard are real file IO, and a loaded machine can take
  // longer than 25 real milliseconds to read them.
  vi.useFakeTimers();
  try {
    await loader.getManifest();
    const first = loader.load(['amalthea']).catch(error => error);
    const second = loader.load(['himalia']);
    await vi.advanceTimersByTimeAsync(26);
    expect(signal?.aborted).toBe(true);
    expect(events).toEqual(['first', 'cancel-start']);
    finishCancellation.resolve();
    expect(await first).toBeInstanceOf(Error);
    expect((await second).himalia).toBeDefined();
    expect(events).toEqual(['first', 'cancel-start', 'cancel-end', 'next']);
  } finally { finishCancellation.resolve(); vi.useRealTimers(); }
});

it('cancels a rejected manifest body and allows a clean retry', async () => {
  let cancellationCount = 0;
  const loader = createLazyMoonEphemerisLoader({ fetch: async input => cancellationCount
    ? publicShardFetch(input)
    : new Response(new ReadableStream({ cancel() { cancellationCount += 1; } }), { status: 503 }) });
  await expect(loader.getManifest()).rejects.toThrow('503');
  expect(cancellationCount).toBe(1);
  expect((await loader.getManifest()).records).toHaveLength(423);
});

it('preserves the transport failure when cancellation itself rejects', async () => {
  let cancelled = false;
  const loader = createLazyMoonEphemerisLoader({ fetch: async input => String(input).endsWith('/manifest.json')
    ? publicShardFetch(input)
    : new Response(new ReadableStream({ cancel() { cancelled = true; throw new Error('cleanup rejected'); } }), { status: 503 }) });
  await expect(loader.load(['amalthea'])).rejects.toThrow('503');
  expect(cancelled).toBe(true);
});

it('aborts a header timeout and cancels a late response from a transport that ignores abort', async () => {
  let deliver!: (response: Response) => void;
  let signal: AbortSignal | undefined;
  let cancelled = false;
  const loader = createLazyMoonEphemerisLoader({ requestTimeoutMs: 25,
    fetch: async (_input, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(resolve => { deliver = resolve; });
    }
  });
  vi.useFakeTimers();
  const failed = loader.getManifest().catch(error => error);
  try {
    await vi.advanceTimersByTimeAsync(26);
    expect(await failed).toHaveProperty('message', expect.stringContaining('timed out'));
    expect(signal?.aborted).toBe(true);
    deliver(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancelled).toBe(true);
  } finally { vi.useRealTimers(); }
});

it('aborts a read failure, unlocks the errored stream and admits the next request', async () => {
  let failedResponse!: Response;
  let signal: AbortSignal | undefined;
  let fail = true;
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).endsWith('/manifest.json') || !fail) return publicShardFetch(input);
    fail = false; signal = init?.signal ?? undefined;
    failedResponse = new Response(new ReadableStream({
      pull(controller) { controller.error(new Error('stream failed')); }
    }));
    return failedResponse;
  };
  const loader = createLazyMoonEphemerisLoader({ fetch: fetcher, maxConcurrentRequests: 1 });
  await expect(loader.load(['amalthea'])).rejects.toThrow('stream failed');
  expect(signal?.aborted).toBe(true);
  expect(failedResponse.body!.locked).toBe(false);
  expect((await loader.load(['himalia'])).himalia).toBeDefined();
});

it('keeps a single deadline across slow body chunks instead of renewing it per chunk', async () => {
  let signal: AbortSignal | undefined;
  let cancelled = false;
  const loader = createLazyMoonEphemerisLoader({ requestTimeoutMs: 25,
    fetch: async (_input, init) => {
      signal = init?.signal ?? undefined;
      return new Response(new ReadableStream({
        async pull(controller) {
          await new Promise(resolve => setTimeout(resolve, 10));
          if (!cancelled) controller.enqueue(new TextEncoder().encode(' '));
        },
        cancel() { cancelled = true; }
      }));
    }
  });
  vi.useFakeTimers();
  const failed = loader.getManifest().catch(error => error);
  try {
    await vi.advanceTimersByTimeAsync(26);
    expect(await failed).toHaveProperty('message', expect.stringContaining('timed out'));
    expect(signal?.aborted).toBe(true);
    expect(cancelled).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
  } finally { vi.useRealTimers(); }
});

for (const requestTimeoutMs of [0, -1, 0.5, Infinity, NaN, 120001]) {
  it(`rejects invalid request deadline ${requestTimeoutMs}`, () => {
    expect(() => createLazyMoonEphemerisLoader({ requestTimeoutMs })).toThrow();
  });
}

describe('loadAllMoonEphemerides', () => {
  it('gives all 423 moons a fit by fetching every shard once', async () => {
    const { loadAllMoonEphemerides } = await import('./loadMoonEphemerides');
    const requests: string[] = [];
    const bodies = await loadAllMoonEphemerides({
      maxConcurrentRequests: 8,
      fetch: ((input: RequestInfo | URL) => { requests.push(String(input)); return publicShardFetch(input); }) as typeof fetch,
    });
    expect(Object.keys(bodies)).toHaveLength(423);
    expect(bodies.himalia).toBeDefined();
    // The manifest twice (key listing, then loading) and each of the 410 shards once.
    expect(requests.filter(url => url.endsWith('manifest.json'))).toHaveLength(2);
    expect(new Set(requests.filter(url => !url.endsWith('manifest.json'))).size).toBe(410);
    expect(requests).toHaveLength(412);
  }, 60_000);

  it('falls back to the named-moon fits when the shards overrun the budget', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { loadAllMoonEphemerides } = await import('./loadMoonEphemerides');
    const stalled = ((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as typeof fetch;
    const started = Date.now();
    const bodies = await loadAllMoonEphemerides({ fetch: stalled, requestTimeoutMs: 2_000 }, 50, 50);
    expect(Date.now() - started).toBeLessThan(1_500);
    // Both budgets ran out, so only the bundled fits remain.
    expect(bodies.titan).toBeDefined();
    expect(bodies.himalia).toBeUndefined();
    vi.restoreAllMocks();
  });

  it('keeps the named-moon fits when only the extra shards fail', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { loadAllMoonEphemerides } = await import('./loadMoonEphemerides');
    const { MAJOR_MOONS } = await import('../data/planets');
    const named = new Set([...MAJOR_MOONS].map(name => name.toLowerCase()));
    const manifest = JSON.parse(readFileSync(new URL('../../public/moon-ephemerides/manifest.json', import.meta.url), 'utf8')) as { bodies: Record<string, { path: string }> };
    const namedPaths = new Set(Object.entries(manifest.bodies).filter(([key]) => named.has(key)).map(([, entry]) => entry.path));
    const failExtra = ((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('manifest.json') || [...namedPaths].some(path => url.endsWith(path))) return publicShardFetch(input);
      return Promise.reject(new TypeError('offline'));
    }) as typeof fetch;
    const bodies = await loadAllMoonEphemerides({ fetch: failExtra });
    for (const name of MAJOR_MOONS) expect(bodies[name.toLowerCase()], name).toBeDefined();
    expect(bodies.himalia).toBeUndefined();
    vi.restoreAllMocks();
  });
});

describe('loadNamedMoonEphemerides', () => {
  it('gives every named moon a fit, fetching only the ones not bundled', async () => {
    const { MAJOR_MOONS } = await import('../data/planets');
    const { loadNamedMoonEphemerides } = await import('./loadMoonEphemerides');
    const requests: string[] = [];
    const bodies = await loadNamedMoonEphemerides({
      fetch: ((input: RequestInfo | URL) => { requests.push(String(input)); return publicShardFetch(input); }) as typeof fetch,
    });
    for (const name of MAJOR_MOONS) expect(bodies[name.toLowerCase()], name).toBeDefined();
    // The manifest plus one shard for each of the 16 named moons outside the 13 bundled fits.
    expect(requests).toHaveLength(17);
  });

  it('starts with the bundled fits when the extra fits are slower than the budget', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { loadNamedMoonEphemerides } = await import('./loadMoonEphemerides');
    // A request that never answers, but honours its abort signal.
    const stalled = ((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as typeof fetch;
    const started = Date.now();
    const bodies = await loadNamedMoonEphemerides({ fetch: stalled, requestTimeoutMs: 2_000 }, 50);
    expect(Date.now() - started).toBeLessThan(1_500);
    expect(bodies.titan).toBeDefined();
    expect(bodies.moon).toBeUndefined();
    vi.restoreAllMocks();
  });

  it('keeps the bundled fits when a shard cannot be loaded', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { loadNamedMoonEphemerides } = await import('./loadMoonEphemerides');
    const bodies = await loadNamedMoonEphemerides({ fetch: (async () => { throw new TypeError('offline'); }) as typeof fetch });
    expect(bodies.titan).toBeDefined();
    expect(bodies.moon).toBeUndefined();
    vi.restoreAllMocks();
  });
});
