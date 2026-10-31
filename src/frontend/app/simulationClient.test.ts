import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulationClient } from './simulationClient';

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = 3; });
  constructor(readonly url: string) { Socket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  message(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}

const state = () => ({
  type: 'state_update', jd: 2451545, jd_time_scale: 'TDB',
  bodies: { earth: { pos: [1, 2, 3] } }, kuiper: [[4, 5, 6]]
});
const ready = { type: 'connected', protocol_version: 1, jd_time_scale: 'TDB' };
let client: SimulationClient;
const socket = () => Socket.instances.at(-1)!;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('WebSocket', Socket);
  Socket.instances = [];
  client = new SimulationClient({ buildWebSocketUrl: () => 'ws://localhost/ws/sim' });
});
afterEach(() => { client.disconnect(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('simulation client schema boundary', () => {
  it('delivers validated orbital elements without treating them as another ready handshake', () => {
    const onReady = vi.fn(); client.onServerReady = onReady;
    const onElements = vi.fn(); client.onOrbitalElements = onElements;
    client.connect(); socket().open(); socket().message(ready); socket().message(state());
    const message = { type: 'orbital_elements', body_id: 'earth',
      elements: { a: 1, e: .0167, inc: 0, Omega: 0, omega: 102, M: 10, f: 10.3, P: 365.25 } };
    socket().message(message);
    expect(client.latestOrbitalElements).toEqual(message);
    expect(onElements).toHaveBeenCalledExactlyOnceWith(message);
    expect(onReady).toHaveBeenCalledOnce();
    const previous = client.latestOrbitalElements;
    socket().message({ ...message, elements: { ...message.elements, a: '1' } });
    expect(client.latestOrbitalElements).toBe(previous);
    expect(client.lastError).toContain('orbital_elements');
  });

  it('owns finite TDB seek commands and synchronizes confirmed JD from server messages', () => {
    const onJd = vi.fn(); client.onJulianDate = onJd;
    expect(client.setJulianDate(2460000.5)).toBe(false);
    expect(client.requestOrbitalElements('earth')).toBe(false);
    client.connect(); socket().open(); socket().message({ ...ready, jd: 2451545 });
    expect(client.latestJulianDate).toBe(2451545);
    expect(client.requestOrbitalElements('earth')).toBe(true);
    expect(JSON.parse(socket().send.mock.calls.at(-1)![0])).toEqual({ type: 'get_orbital_elements', body_id: 'earth' });
    socket().message(state());
    expect(client.setJulianDate(2460000.5)).toBe(true);
    expect(JSON.parse(socket().send.mock.calls.at(-1)![0])).toEqual({ type: 'set_julian_date', jd: 2460000.5, jd_time_scale: 'TDB' });
    expect(client.latestState).toBeNull();
    expect(client.latestKuiper).toBeNull();
    expect(client.latestJulianDate).toBe(2451545); // A send is not server confirmation.
    const calls = socket().send.mock.calls.length;
    expect(client.setJulianDate(NaN)).toBe(false);
    expect(client.setJulianDate(Infinity)).toBe(false);
    expect(client.requestOrbitalElements('')).toBe(false);
    expect(socket().send.mock.calls).toHaveLength(calls);
    socket().message({ ...state(), jd: 2460000.5 });
    expect(client.latestJulianDate).toBe(2460000.5);
    expect(onJd).toHaveBeenLastCalledWith(2460000.5);
    client.disconnect();
    expect(client.latestJulianDate).toBeNull();
    expect(client.latestOrbitalElements).toBeNull();
  });

  it('rejects malformed handshake epochs and clears auxiliary data when replacing sockets', () => {
    client.connect(); socket().open(); socket().message({ ...ready, jd: 'invalid' });
    expect(client.setJulianDate(2451546)).toBe(false);
    socket().message({ ...ready, jd: 2451545 });
    const oldMessage = socket().onmessage!;
    client.connect('kepler');
    oldMessage({ data: JSON.stringify({ ...state(), jd: 2460000 }) });
    expect(client.latestJulianDate).toBeNull();
    expect(client.latestOrbitalElements).toBeNull();
  });

  it('does not restore old-epoch caches after an epoch observer sends a reentrant seek', () => {
    client.connect(); socket().open(); socket().message(ready);
    client.onJulianDate = jd => { if (jd === 2451545) client.setJulianDate(2460000.5); };
    socket().message(state());
    expect(JSON.parse(socket().send.mock.calls.at(-1)![0])).toEqual({
      type: 'set_julian_date', jd: 2460000.5, jd_time_scale: 'TDB' });
    expect(client.latestState).toBeNull();
    expect(client.latestKuiper).toBeNull();
    expect(client.latestKuiperSnapshot).toBeNull();
    socket().message({ ...state(), jd: 2460000.5 });
    expect(client.latestState?.jd).toBe(2460000.5);
  });

  it('allows an initial seek from the confirmed handshake epoch observer', () => {
    const onReady = vi.fn(); client.onServerReady = onReady;
    const seeks: boolean[] = [];
    client.onJulianDate = () => { seeks.push(client.setJulianDate(2460000.5)); };
    client.connect(); socket().open(); socket().message({ ...ready, jd: 2451545 });
    expect(seeks).toEqual([true]);
    expect(JSON.parse(socket().send.mock.calls.at(-1)![0])).toEqual({
      type: 'set_julian_date', jd: 2460000.5, jd_time_scale: 'TDB' });
    expect(onReady).toHaveBeenCalledOnce();
    expect(client.latestState).toBeNull();
  });

  it('accepts supported state and rejects malformed coordinates without replacing it', () => {
    client.connect(); socket().open(); socket().message(ready); socket().message(state());
    const accepted = client.latestState;
    for (const pos of [[1, 2], [1, null, 3], ['1', 2, 3], [1, 2, 3, 4]]) {
      socket().message({ ...state(), bodies: { earth: { pos } } });
      expect(client.latestState).toBe(accepted);
    }
    expect(client.latestKuiper).toEqual([[4, 5, 6]]);
  });

  it.each([
    { ...state(), jd: '2451545' },
    { ...state(), jd: null },
    { ...state(), jd_time_scale: 'UTC' },
    { ...state(), bodies: [] },
    { ...state(), kuiper: [[1, 2]] }
  ])('rejects invalid state fields %#', (payload) => {
    client.connect(); socket().open(); socket().message(payload);
    expect(client.latestState).toBeNull();
    expect(client.latestKuiper).toBeNull();
  });

  it('reports delivered server errors and does not count them as fresh state', () => {
    client.connect(); socket().open(); socket().message(state());
    const warning = vi.fn(); client.onProtocolWarning = warning;
    vi.advanceTimersByTime(3000);
    socket().message({ type: 'error', code: 'command_failed', message: 'unsupported command' });
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('command_failed'));
    vi.advanceTimersByTime(1000);
    expect(client.getStatus()).toBe('stale');
    expect(client.latestState).toBeNull();
  });

  it('does not refresh liveness on invalid JSON or unknown messages', () => {
    client.connect(); socket().open(); socket().message(state());
    vi.advanceTimersByTime(3000);
    socket().onmessage?.({ data: '{' }); socket().message({ type: 'other' });
    vi.advanceTimersByTime(1000);
    expect(client.getStatus()).toBe('stale');
  });

  it('does not deliver ready callbacks for an incompatible handshake', () => {
    const onReady = vi.fn(); client.onServerReady = onReady;
    client.connect(); socket().open(); socket().message({ ...ready, protocol_version: 2 });
    expect(onReady).not.toHaveBeenCalled();
  });
});

describe('simulation client reconnection', () => {
  it('replays a queued Kuiper subscription once on ready, including after reconnect', () => {
    client.activateKuiper({ x: 1, y: 2, z: 3 }, 4);
    client.connect(); socket().open(); socket().message(ready); socket().message(ready);
    expect(socket().send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(socket().send.mock.calls[0][0])).toEqual({ type: 'activate_kuiper', center: [1, 2, 3], spread: 4 });
    socket().message(state()); socket().onclose?.();
    expect(client.latestKuiper).toBeNull();
    vi.advanceTimersByTime(600);
    socket().open(); socket().message(ready);
    expect(socket().send).toHaveBeenCalledTimes(1);
    socket().message(state()); client.deactivateKuiper(); socket().onclose?.(); vi.advanceTimersByTime(600);
    socket().open(); socket().message(ready);
    expect(socket().send).not.toHaveBeenCalled();
  });

  it('bounds a socket that never opens and a session that stops producing valid state', () => {
    client.connect(); const stalled = socket();
    vi.advanceTimersByTime(10_600);
    expect(stalled.close).toHaveBeenCalledOnce();
    expect(Socket.instances).toHaveLength(2);
    socket().open(); socket().message(ready); socket().message(state());
    const stale = socket(); vi.advanceTimersByTime(10_600);
    expect(stale.close).toHaveBeenCalledOnce();
    expect(Socket.instances).toHaveLength(3);
    expect(client.latestState).toBeNull();
    expect(client.latestKuiper).toBeNull();
  });

  it('ignores callbacks from replaced sockets and clears the old connected state', () => {
    client.connect(); socket().open(); socket().message(state());
    const oldMessage = socket().onmessage!; const oldClose = socket().onclose!;
    client.connect('kepler');
    expect(client.latestState).toBeNull();
    oldMessage({ data: JSON.stringify(state()) }); oldClose();
    expect(client.latestState).toBeNull();
    expect(client.getStatus()).toBe('connecting');
    expect(socket().close).not.toHaveBeenCalled();
  });

  it('retains exponential backoff through handshakes until valid state arrives', () => {
    const acceptThenClose = () => {
      socket().open();
      socket().message(ready);
      socket().onclose?.();
    };
    client.connect();
    const delays = [600, 1_200, 2_400, 4_800, 9_600, 15_000, 15_000];
    for (const [attempt, delay] of delays.entries()) {
      acceptThenClose();
      vi.advanceTimersByTime(delay - 1);
      expect(Socket.instances).toHaveLength(attempt + 1);
      vi.advanceTimersByTime(1);
      expect(Socket.instances).toHaveLength(attempt + 2);
    }

    socket().open(); socket().message(ready); socket().message(state()); socket().onclose?.();
    vi.advanceTimersByTime(599);
    expect(Socket.instances).toHaveLength(delays.length + 1);
    vi.advanceTimersByTime(1);
    expect(Socket.instances).toHaveLength(delays.length + 2);

    socket().onerror?.(); client.disconnect(); vi.advanceTimersByTime(60_000);
    expect(Socket.instances).toHaveLength(delays.length + 2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('recovers from synchronous socket construction failure', () => {
    vi.stubGlobal('WebSocket', class { constructor() { throw new Error('bad endpoint'); } });
    expect(() => client.connect()).not.toThrow();
    expect(client.getStatus()).toBe('reconnecting');
    vi.stubGlobal('WebSocket', Socket); vi.advanceTimersByTime(600);
    expect(Socket.instances).toHaveLength(1);
  });
});

describe('simulation client Kuiper activation lifecycle', () => {
  const negotiatedReady = {
    ...ready,
    kuiper_subscription_version: 1,
    kuiper_activation_error_version: 1,
  };
  const sentCommands = () => socket().send.mock.calls.map(([text]) => JSON.parse(text));

  it('supersedes a changed active request and filters the old subscription', () => {
    client.connect(); socket().open(); socket().message(negotiatedReady);
    client.activateKuiper({ x: 42, y: 0, z: 0 }, 5);
    socket().message({ ...state(), kuiper: [[1, 1, 1]], kuiper_subscription_id: '1' });
    expect(client.latestKuiper).toEqual([[1, 1, 1]]);

    client.activateKuiper({ x: -40, y: 10, z: 0 }, 2);

    expect(sentCommands()).toEqual([
      { type: 'activate_kuiper', center: [42, 0, 0], spread: 5, subscription_id: '1' },
      { type: 'activate_kuiper', center: [-40, 10, 0], spread: 2, subscription_id: '2' },
    ]);
    expect(client.latestKuiper).toBeNull();
    socket().message({ ...state(), kuiper: [[2, 2, 2]], kuiper_subscription_id: '1' });
    expect(client.latestKuiper).toBeNull();
    socket().message({ ...state(), kuiper: [[3, 3, 3]], kuiper_subscription_id: '2' });
    expect(client.latestKuiper).toEqual([[3, 3, 3]]);
  });

  it('allows an explicit retry only after an activation rejection', () => {
    client.connect(); socket().open(); socket().message(negotiatedReady);
    const activate = () => client.activateKuiper({ x: 42, y: 0, z: 0 }, 5);

    activate();
    activate();
    socket().message({ type: 'error', code: 'bad_request', message: 'unrelated' });
    activate();
    expect(sentCommands()).toHaveLength(1);

    socket().message({
      type: 'error',
      code: 'kuiper_activation_failed',
      message: 'fixture rejection',
      kuiper_subscription_id: '1',
    });
    expect(sentCommands()).toHaveLength(1);

    activate();
    expect(sentCommands()).toEqual([
      { type: 'activate_kuiper', center: [42, 0, 0], spread: 5, subscription_id: '1' },
      { type: 'activate_kuiper', center: [42, 0, 0], spread: 5, subscription_id: '2' },
    ]);
  });

  it('allows retry after an untagged rejection from a version-1 server', () => {
    client.connect(); socket().open();
    socket().message({ ...ready, kuiper_subscription_version: 1 });
    const activate = () => client.activateKuiper({ x: 42, y: 0, z: 0 }, 5);

    activate();
    socket().message({
      type: 'error',
      code: 'kuiper_activation_failed',
      message: 'legacy rejection',
    });
    activate();

    expect(sentCommands()).toEqual([
      { type: 'activate_kuiper', center: [42, 0, 0], spread: 5, subscription_id: '1' },
      { type: 'activate_kuiper', center: [42, 0, 0], spread: 5, subscription_id: '2' },
    ]);
  });

  it('does not let a delayed failure revoke a superseding activation', () => {
    client.connect(); socket().open(); socket().message(negotiatedReady);
    client.activateKuiper({ x: 42, y: 0, z: 0 }, 5);
    client.activateKuiper({ x: -40, y: 10, z: 0 }, 2);

    socket().message({
      type: 'error',
      code: 'kuiper_activation_failed',
      message: 'old request rejected',
      kuiper_subscription_id: '1',
    });
    socket().message({
      ...state(),
      kuiper: [[3, 3, 3]],
      kuiper_subscription_id: '2',
    });

    expect(client.latestKuiper).toEqual([[3, 3, 3]]);
  });
});
