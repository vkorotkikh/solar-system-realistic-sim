import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeAsteroidCatalogBinary } from '../data/asteroidCatalogLoader';
import { loadPhase1AsteroidCatalog, PHASE1_LOAD_LATENCY_BUDGET_MS } from './phase1AsteroidCatalog';

// main.ts asks for the catalog without a timeoutMs, so the loader's default deadline decides whether
// startup draws the real asteroids or invents 50,000. No document states that deadline, so these tests
// measure it from behaviour and check the relations it must satisfy:
//   - it leaves room for the load-latency budget the loader itself reports against (a load slower than
//     the budget is reported as slow, not abandoned), and
//   - it is no looser than the 60 s ceiling the loader allows any caller to choose (RangeError above it).
const LOADER_MAX_TIMEOUT_MS = 60_000;

let sequence = 0;
function request() {
  const id = ++sequence;
  return { url: `/deadline/${id}.bin`, metaUrl: `/deadline/${id}.json`, maxRecords: 3 }; // no timeoutMs
}

function catalogResponses() {
  const binary = writeAsteroidCatalogBinary([0, 1, 2].map(taxonomyIndex => ({
    sourceId: taxonomyIndex + 1, epochJd: 2461000.5, aAu: 2.7, e: 0.1,
    iDeg: 1, ascendingNodeDeg: 2, argPeriapsisDeg: 3, meanAnomalyDeg: 4,
    periodDays: 1600.1234, diameterKm: 10, albedo: 0.1, taxonomyIndex,
  })));
  const checksum = createHash('sha256').update(new Uint8Array(binary)).digest('hex');
  return (url: string) => new Response(url.endsWith('.bin') ? binary : JSON.stringify({ stored_count: 3, checksum_sha256: checksum }));
}

/** Fake clock that only moves when advanced; performance.now stays real so loadMs stays small. */
function useFakeClock() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
}

/** Resolves after `ms` of fake time, then answers like the real server. */
function slowServer(ms: number) {
  const respond = catalogResponses();
  vi.stubGlobal('fetch', vi.fn((url: string) => new Promise<Response>(resolve => {
    setTimeout(() => resolve(respond(url)), ms);
  })));
}

/** Fake milliseconds until a load that never answers is abandoned, and how it was reported. */
async function measureDefaultDeadline() {
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
  const started = Date.now();
  let abandonedAt: number | undefined;
  const outcome = loadPhase1AsteroidCatalog(request())
    .then(() => 'resolved' as const, (error: unknown) => error)
    .finally(() => { abandonedAt = Date.now() - started; });
  for (let i = 0; i < 100 && abandonedAt === undefined; i++) await vi.advanceTimersToNextTimerAsync();
  return { deadlineMs: abandonedAt, outcome: await outcome };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('default asteroid-catalog deadline (belts-04)', () => {
  it('abandons a catalog that never arrives, as a timeout, within the loader\'s own ceiling', async () => {
    useFakeClock();
    const { deadlineMs, outcome } = await measureDefaultDeadline();

    expect(outcome).toMatchObject({ code: 'timeout' });
    expect(deadlineMs).toBeDefined();
    expect(deadlineMs).toBeGreaterThan(PHASE1_LOAD_LATENCY_BUDGET_MS);
    expect(deadlineMs).toBeLessThanOrEqual(LOADER_MAX_TIMEOUT_MS);
  });

  it('still accepts a catalog that arrives one millisecond before that deadline', async () => {
    useFakeClock();
    const { deadlineMs } = await measureDefaultDeadline();
    expect(deadlineMs).toBeDefined();

    slowServer(deadlineMs! - 1);
    const pending = loadPhase1AsteroidCatalog(request());
    await vi.advanceTimersByTimeAsync(deadlineMs! - 1);
    const result = await pending;

    expect(result.accepted).toBe(true);
    expect(result.loadedCount).toBe(3);
  });

  it('does not give up on a catalog that takes twice the latency budget', async () => {
    useFakeClock();
    const slow = 2 * PHASE1_LOAD_LATENCY_BUDGET_MS;
    slowServer(slow);
    const pending = loadPhase1AsteroidCatalog(request());
    await vi.advanceTimersByTimeAsync(slow);

    expect((await pending).accepted).toBe(true);
  });
});
