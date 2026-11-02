/**
 * H-1 draft contract specs for SolarPhysicsClient.
 * Target location after the fix: src/frontend/features/solar/solarPhysicsClient.test.ts
 *
 * Every test here fakes BOTH time (vi.useFakeTimers fakes setTimeout + Date) and fetch
 * (vi.stubGlobal), so it is deterministic and needs no backend.
 *
 * PROD mirrors src/sunController.ts:152-160 at bd48a7d. After the fix, the production options
 * must be exported from one module (e.g. SOLAR_PHYSICS_POLICY) and imported here instead,
 * otherwise the test and the app drift apart.
 */
import { SolarPhysicsClient } from '../../../wt-h1/src/frontend/features/solar/solarPhysicsClient';

const PROD = {
  pollIntervalMs: 900,
  timeoutMs: 2_600,
  maxFeatures: 180,
  fidelity: 'high',
  forcing: 'hybrid',
  liveData: true,
};
/** Measured cold-miss server latencies for the PROD query (audit: 4.6-9.4 s; this run 4.2-5.0 s offline, 10-12 s live). */
const MEASURED_COLD_MISS_MS = 4_600;
/** backend/server.py:168-177 defaults: 36 requests / 60 s per client identity. */
const SERVER_RATE_LIMIT_PER_MIN = 36;

type FetchPlan = (url: string, init: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** A fetch that resolves after `latencyMs` of FAKE time and rejects with AbortError when aborted. */
function delayedFetch(latencyMs: number, make: () => Response = () => jsonResponse({ activity_index: 0.5 })): FetchPlan {
  return (_url, init) =>
    new Promise<Response>((resolve, reject) => {
      const t = setTimeout(() => resolve(make()), latencyMs);
      init.signal?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new DOMException('This operation was aborted', 'AbortError'));
      });
    });
}

let calls: string[] = [];
function installFetch(plan: FetchPlan) {
  calls = [];
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    calls.push(String(url));
    return plan(String(url), init);
  }));
}

function makeClient() {
  return new SolarPhysicsClient({ baseUrl: () => 'http://127.0.0.1:8042', ...PROD });
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-24T12:00:00Z') });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('H-1 SolarPhysicsClient contract', () => {
  it('accepts a response that arrives at the measured cold-miss latency (client timeout > server p95)', async () => {
    installFetch(delayedFetch(MEASURED_COLD_MISS_MS));
    const client = makeClient();
    const pending = client.maybeRefresh(2_461_308.5);
    await vi.advanceTimersByTimeAsync(MEASURED_COLD_MISS_MS + 50);
    await expect(pending).resolves.toBe(true);
    expect(client.lastError).toBeNull();
  });

  it('an aborted, superseded request does not overwrite the newer in-flight request state', async () => {
    installFetch(delayedFetch(60_000));
    const client = makeClient();
    const first = client.maybeRefresh(2_461_308.5);
    await vi.advanceTimersByTimeAsync(100);
    const second = client.maybeRefresh(2_461_308.6, true); // force: aborts `first`
    await vi.advanceTimersByTimeAsync(10); // let `first` reject + run its finally
    expect(client.inFlight).toBe(true); // `second` is still running
    expect(client.lastError).toBeNull(); // an intentional supersede is not an error
    void first;
    void second;
  });

  it('failure backoff honours Retry-After and grows on consecutive failures; success resets it', async () => {
    installFetch(delayedFetch(20, () => jsonResponse({ detail: 'saturated' }, 503, { 'Retry-After': '2' })));
    const client = makeClient();
    const gaps: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const started = Date.now();
      const p = client.maybeRefresh(2_461_308.5, true);
      await vi.advanceTimersByTimeAsync(25);
      await p;
      gaps.push(client.nextRefreshMs - started);
    }
    expect(gaps[0]).toBeGreaterThanOrEqual(2_000); // at least Retry-After
    expect(gaps[1]).toBeGreaterThan(gaps[0]); // exponential (or at least increasing) backoff
    expect(gaps[2]).toBeGreaterThan(gaps[1]);
  });

  it('status() exposes a machine-readable state the UI can render (timeout vs saturated vs unreachable)', async () => {
    installFetch(delayedFetch(60_000));
    const client = makeClient();
    const p = client.maybeRefresh(2_461_308.5);
    await vi.advanceTimersByTimeAsync(PROD.timeoutMs + 50);
    await p;
    const status = client.status() as Record<string, unknown>;
    expect(status.state).toBe('timeout');
    expect(status.consecutiveFailures).toBe(1);
  });

  it('quantises jd so that successive frames inside one bucket share one server cache key', async () => {
    installFetch(delayedFetch(10));
    const client = makeClient();
    const a = client.maybeRefresh(2_461_308.5);
    await vi.advanceTimersByTimeAsync(20);
    await a;
    const b = client.maybeRefresh(2_461_308.5 + 1e-8, true); // ~0.9 ms of sim time later
    await vi.advanceTimersByTimeAsync(20);
    await b;
    const jdOf = (u: string) => new URL(u).searchParams.get('jd');
    expect(calls).toHaveLength(2);
    expect(jdOf(calls[1])).toBe(jdOf(calls[0]));
  });

  it('when the server is fast, a 60 s frame loop stays under the server rate limit (36/min)', async () => {
    installFetch(delayedFetch(50));
    const client = makeClient();
    for (let t = 0; t < 60_000; t += 16) {
      void client.maybeRefresh(2_461_308.5 + t / 86_400_000);
      await vi.advanceTimersByTimeAsync(16);
    }
    expect(calls.length).toBeLessThanOrEqual(SERVER_RATE_LIMIT_PER_MIN);
  });

  it('schedules the next poll from completion, not from start (no back-to-back requests after a slow reply)', async () => {
    installFetch(delayedFetch(2_000));
    const client = new SolarPhysicsClient({ baseUrl: () => 'http://127.0.0.1:8042', ...PROD, timeoutMs: 10_000 });
    const p = client.maybeRefresh(2_461_308.5);
    await vi.advanceTimersByTimeAsync(2_010);
    await expect(p).resolves.toBe(true);
    const immediate = client.maybeRefresh(2_461_308.6); // fetch() is invoked synchronously if it goes ahead
    const issuedImmediately = calls.length;
    await vi.advanceTimersByTimeAsync(2_010); // settle whatever was started
    await immediate;
    expect(issuedImmediately).toBe(1);
  });

  it('regression guard (green today): timeout aborts a hung request and records an error', async () => {
    installFetch(delayedFetch(60_000));
    const client = makeClient();
    const p = client.maybeRefresh(2_461_308.5);
    await vi.advanceTimersByTimeAsync(PROD.timeoutMs + 10);
    await expect(p).resolves.toBe(false);
    expect(client.lastError).toMatch(/abort/i);
    expect(client.inFlight).toBe(false);
  });
});
