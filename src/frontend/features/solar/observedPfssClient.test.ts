import { describe, expect, it } from 'vitest';
import golden from '../../../../backend/tests/fixtures/observed_pfss/golden_sidecar.json';
import {
  checkObservedSidecar,
  createObservedPfssClient,
  OBSERVED_PFSS_POLL_MS,
  OBSERVED_PFSS_ROUTE,
  type ObservedPfssClientState,
} from './observedPfssClient';

const BASE = 'http://127.0.0.1:9142';
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const detail = (code: string, message: string) => ({ detail: { code, message, retryable: false } });
const copy = () => JSON.parse(JSON.stringify(golden));

/** A fetch whose responses the test releases by hand. */
function manualFetch() {
  const calls: { url: string; init: RequestInit; resolve: (r: Response) => void; reject: (e: unknown) => void }[] = [];
  const fetchImpl = (url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
    calls.push({ url, init, resolve, reject });
    init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

async function settle() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

function client(fetchImpl: typeof fetch, nowMs = { value: 1_000_000 }) {
  const states: ObservedPfssClientState[] = [];
  const instance = createObservedPfssClient({
    baseUrl: () => BASE, fetchImpl, now: () => nowMs.value, onChange: state => states.push(state),
  });
  return { instance, states, nowMs };
}

async function answer(response: Response | Error) {
  const fake = manualFetch();
  const { instance } = client(fake.fetchImpl);
  instance.setEnabled(true);
  expect(fake.calls).toHaveLength(1);
  if (response instanceof Error) fake.calls[0].reject(response); else fake.calls[0].resolve(response);
  await settle();
  return { state: instance.state, fake, instance };
}

describe('the observed-PFSS client', () => {
  it('asks the route once when the switch turns on, with no cache', async () => {
    const fake = manualFetch();
    const { instance } = client(fake.fetchImpl);
    expect(instance.state).toMatchObject({ enabled: false, awaitingFirst: false, accepted: null, failure: null });
    instance.setEnabled(true);
    expect(fake.calls.map(call => call.url)).toEqual([`${BASE}${OBSERVED_PFSS_ROUTE}`]);
    expect(fake.calls[0].init).toMatchObject({ cache: 'no-store', redirect: 'manual' });
    expect(instance.state).toMatchObject({ enabled: true, awaitingFirst: true, accepted: null, failure: null });
  });

  it('accepts the golden sidecar', async () => {
    const { state } = await answer(json(golden));
    expect(state.awaitingFirst).toBe(false);
    expect(state.failure).toBeNull();
    expect(state.accepted?.map_reference_utc).toBe('2026-10-12T17:44:00Z');
    expect(state.nextTryMs).toBe(1_000_000 + OBSERVED_PFSS_POLL_MS);
  });

  it('drops an accepted sidecar on a 404 and keeps the message', async () => {
    const fake = manualFetch();
    const { instance, nowMs } = client(fake.fetchImpl);
    instance.setEnabled(true);
    fake.calls[0].resolve(json(golden));
    await settle();
    nowMs.value += OBSERVED_PFSS_POLL_MS;
    instance.tick();
    fake.calls[1].resolve(json(detail('solar_observed_sidecar_disabled', 'Set SOLAR_OBSERVED_PFSS_SIDECAR on the backend and restart it.'), 404));
    await settle();
    expect(instance.state.accepted).toBeNull();
    expect(instance.state.failure).toEqual({ kind: 'not-found', message: 'Set SOLAR_OBSERVED_PFSS_SIDECAR on the backend and restart it.' });
  });

  // N5, N31: every status that is not 200, 404 or 429 is a route error, whatever its body.
  it.each([400, 401, 403, 413, 500, 502, 503, 504])('treats HTTP %i as a route error and keeps its message', async status => {
    const { state } = await answer(json(detail('some_code', `message for ${status}`), status));
    expect(state.accepted).toBeNull();
    expect(state.failure).toEqual({ kind: 'http', status, message: `message for ${status}` });
  });

  it('reads the app plain-text 500 as a route error without a message', async () => {
    const { state } = await answer(new Response('Internal Server Error', { status: 500, headers: { 'content-type': 'text/plain' } }));
    expect(state.failure).toEqual({ kind: 'http', status: 500, message: null });
  });

  it('reads a string detail, as in a 429, and treats 429 as transient', async () => {
    const fake = manualFetch();
    const { instance } = client(fake.fetchImpl);
    instance.setEnabled(true);
    fake.calls[0].resolve(json(golden));
    await settle();
    instance.refresh();
    fake.calls[1].resolve(json({ detail: 'Solar observed-field request rate limit exceeded; retry later.' }, 429, { 'retry-after': '30' }));
    await settle();
    expect(instance.state.accepted).not.toBeNull();
    expect(instance.state.failure).toEqual({ kind: 'transient', atMs: 1_000_000 });
  });

  it('treats a redirect as a route error', async () => {
    const redirect = { type: 'opaqueredirect', status: 0, ok: false, headers: new Headers(), body: null } as unknown as Response;
    const { state } = await answer(redirect);
    expect(state.failure).toEqual({ kind: 'http', status: 'redirect', message: null });
  });

  it('calls a body that is not JSON unreadable', async () => {
    const { state } = await answer(new Response('{not json', { status: 200 }));
    expect(state.failure).toEqual({ kind: 'unreadable' });
  });

  it('calls a body over 2 MiB unreadable', async () => {
    const { state } = await answer(new Response(' '.repeat(2 * 1024 * 1024 + 1), { status: 200 }));
    expect(state.failure).toEqual({ kind: 'unreadable' });
  });

  it('drops a sidecar whose frame check failed', async () => {
    const failed = copy();
    failed.carrington_check.pass = false;
    failed.carrington_check.delta_deg = 31.2;
    const { state } = await answer(json(failed));
    expect(state.accepted).toBeNull();
    expect(state.failure).toEqual({ kind: 'frame-check', deltaDeg: 31.2 });
  });

  it('keeps an accepted sidecar through a network failure or a timeout', async () => {
    const fake = manualFetch();
    const { instance } = client(fake.fetchImpl);
    instance.setEnabled(true);
    fake.calls[0].resolve(json(golden));
    await settle();
    instance.refresh();
    fake.calls[1].reject(new TypeError('Failed to fetch'));
    await settle();
    expect(instance.state.accepted).not.toBeNull();
    expect(instance.state.failure).toEqual({ kind: 'transient', atMs: 1_000_000 });
    expect(instance.state.nextTryMs).toBe(1_000_000 + OBSERVED_PFSS_POLL_MS);
  });

  it('gives up on a request after 10 s', async () => {
    const fake = manualFetch();
    const timers: { fn: () => void; ms: number }[] = [];
    const instance = createObservedPfssClient({
      baseUrl: () => BASE, fetchImpl: fake.fetchImpl, now: () => 5,
      setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {},
    });
    instance.setEnabled(true);
    expect(timers.map(timer => timer.ms)).toEqual([10_000]);
    timers[0].fn();
    await settle();
    expect(instance.state.failure).toEqual({ kind: 'transient', atMs: 5 });
  });

  it('refetches only every 30 minutes while on', async () => {
    const fake = manualFetch();
    const { instance, nowMs } = client(fake.fetchImpl);
    instance.setEnabled(true);
    fake.calls[0].resolve(json(golden));
    await settle();
    nowMs.value += OBSERVED_PFSS_POLL_MS - 1;
    instance.tick();
    expect(fake.calls).toHaveLength(1);
    nowMs.value += 1;
    instance.tick();
    instance.tick();
    expect(fake.calls).toHaveLength(2);
  });

  it('discards everything and aborts the request when the switch turns off', async () => {
    const fake = manualFetch();
    const { instance } = client(fake.fetchImpl);
    instance.setEnabled(true);
    fake.calls[0].resolve(json(golden));
    await settle();
    instance.refresh();
    const second = fake.calls[1];
    instance.setEnabled(false);
    expect(second.init.signal?.aborted).toBe(true);
    expect(instance.state).toMatchObject({ enabled: false, accepted: null, failure: null });
    instance.tick();
    expect(fake.calls).toHaveLength(2);
  });

  // C37: an abort cannot recall a response that has already been read.
  it('draws nothing from a response released after the switch was turned off', async () => {
    const fake = manualFetch();
    const { instance } = client(fake.fetchImpl);
    instance.setEnabled(true);
    const first = fake.calls[0];
    const late = json(golden);
    instance.setEnabled(false);
    first.resolve(late);
    await settle();
    expect(instance.state).toMatchObject({ enabled: false, accepted: null });
  });

  it('ignores an older response that arrives after a newer one', async () => {
    // A transport that cannot recall a response: it resolves even after its request was aborted.
    const calls: ((r: Response) => void)[] = [];
    const fetchImpl = (() => new Promise<Response>(resolve => { calls.push(resolve); })) as unknown as typeof fetch;
    const { instance } = client(fetchImpl);
    instance.setEnabled(true);
    instance.setEnabled(false);
    instance.setEnabled(true);
    await settle();
    expect(instance.state).toMatchObject({ awaitingFirst: true, accepted: null, failure: null });
    const newer = copy();
    newer.map_reference_utc = '2026-10-13T00:14:00Z';
    calls[1](json(newer));
    await settle();
    calls[0](json(golden));
    await settle();
    expect(instance.state.accepted?.map_reference_utc).toBe('2026-10-13T00:14:00Z');
    expect(instance.state.failure).toBeNull();
  });

  it('publishes nothing from a request that was aborted by a newer one', async () => {
    const fake = manualFetch();
    const { instance, states } = client(fake.fetchImpl);
    instance.setEnabled(true);
    instance.setEnabled(false);
    instance.setEnabled(true);
    await settle();
    expect(states.map(state => state.awaitingFirst)).toEqual([true, false, true]);
    expect(instance.state.failure).toBeNull();
  });

  it('turning the switch off and on fetches again', async () => {
    const fake = manualFetch();
    const { instance } = client(fake.fetchImpl);
    instance.setEnabled(true);
    fake.calls[0].resolve(json(detail('solar_observed_sidecar_unavailable', 'Run scripts/observed_pfss_probe.py.'), 503));
    await settle();
    instance.setEnabled(false);
    instance.setEnabled(true);
    expect(fake.calls).toHaveLength(2);
    expect(instance.state).toMatchObject({ awaitingFirst: true, failure: null });
  });
});

describe('the client check of a sidecar (D15, N18)', () => {
  it('accepts the golden file', () => {
    expect(checkObservedSidecar(golden)).not.toBeNull();
  });

  const broken: [string, (s: any) => void][] = [
    ['another schema name', s => { s.schema.name = 'solar_physics_state'; }],
    ['another schema version', s => { s.schema.version = 2; }],
    ['no lines', s => { s.lines = []; }],
    ['lines that are not a list', s => { s.lines = {}; }],
    ['an arc of one point', s => { s.lines[0].arc = [[1, 0, 0]]; }],
    ['a point of two numbers', s => { s.lines[0].arc[0] = [1, 0]; }],
    ['a point with a string', s => { s.lines[0].arc[0] = [1, 0, '0']; }],
    ['a point with null', s => { s.lines[0].arc[0] = [1, 0, null]; }],
    ['only unresolved lines', s => { for (const line of s.lines) line.state = 'indeterminate'; }],
    ['a frame verdict that is not a boolean', s => { s.carrington_check.pass = 'true'; }],
    ['a missing window edge', s => { delete s.valid_until_jd_tdb; }],
    ['a window in the wrong order', s => { s.valid_from_jd_tdb = s.valid_until_jd_tdb + 1; }],
    ['a map time that is not a time', s => { s.map_reference_utc = 'yesterday'; }],
    ['a degree that is not a number', s => { s.degree = '90'; }],
    ['a missing flux correction', s => { delete s.flux_correction; }],
  ];
  it.each(broken)('refuses %s', (_name, change) => {
    const sidecar = copy();
    change(sidecar);
    expect(checkObservedSidecar(sidecar)).toBeNull();
  });

  it('refuses a body that is not an object', () => {
    for (const body of [null, 1, 'sidecar', [golden]]) expect(checkObservedSidecar(body)).toBeNull();
  });
});
