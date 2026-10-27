import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import captured from './fixtures/kuiper-runner-state.json';
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
  constructor() { Socket.instances.push(this); }
  open() { this.readyState = Socket.OPEN; this.onopen?.(); }
  message(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}

let client: SimulationClient;
const socket = () => Socket.instances.at(-1)!;
const ready = { type: 'connected', protocol_version: 1, jd_time_scale: 'TDB' };
const observerFailure = () => { throw new Error('injected observer failure'); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('WebSocket', Socket);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  Socket.instances = [];
  client = new SimulationClient({ buildWebSocketUrl: () => 'ws://localhost/ws/sim' });
});
afterEach(() => {
  client.onConnected = client.onDisconnected = client.onServerReady = null;
  client.onStatusChange = client.onProtocolWarning = null;
  client.disconnect();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('simulation-client observer failure ownership', () => {
  it('still connects when the status observer throws', () => {
    client.onStatusChange = observerFailure;
    expect(() => client.connect()).not.toThrow();
    expect(Socket.instances).toHaveLength(1);
    socket().open();
    expect(() => socket().message(captured.state)).not.toThrow();
    expect(client.latestState).toEqual(captured.state);
  });

  it('still schedules reconnection when the disconnect observer throws', () => {
    client.connect(); socket().open();
    client.onDisconnected = observerFailure;
    expect(() => socket().onclose?.()).not.toThrow();
    vi.advanceTimersByTime(600);
    expect(Socket.instances).toHaveLength(2);
  });

  it('still closes a failed transport when the warning observer throws', () => {
    client.connect(); socket().open();
    const failed = socket();
    client.onProtocolWarning = observerFailure;
    expect(() => failed.onerror?.()).not.toThrow();
    expect(failed.close).toHaveBeenCalledOnce();
    expect(client.getStatus()).toBe('reconnecting');
    vi.advanceTimersByTime(600);
    expect(Socket.instances).toHaveLength(2);
  });

  it('still replays the queued subscription when the ready observer throws', () => {
    client.activateKuiper({ x: 1, y: 2, z: 3 }, 4);
    client.onServerReady = observerFailure;
    client.connect(); socket().open();
    expect(() => socket().message(ready)).not.toThrow();
    expect(socket().send).toHaveBeenCalledOnce();
    expect(JSON.parse(socket().send.mock.calls[0][0])).toEqual({ type: 'activate_kuiper', center: [1, 2, 3], spread: 4 });
  });
});

describe('simulation-client reentrant lifecycle ownership', () => {
  it('does not create an orphan connection after a connecting observer disconnects', () => {
    client.onStatusChange = status => { if (status === 'connecting') client.disconnect(); };
    client.connect();
    expect(client.getStatus()).toBe('offline');
    expect(Socket.instances.every(instance => instance.readyState === 3)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not repopulate state or rearm timers after a fresh-state observer disconnects', () => {
    client.connect(); socket().open();
    client.onStatusChange = status => { if (status === 'connected') client.disconnect(); };
    socket().message(captured.state);
    expect(client.getStatus()).toBe('offline');
    expect(client.latestState).toBeNull();
    expect(client.latestKuiper).toBeNull();
    expect(client.latestKuiperSnapshot).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('counts validated state as recovery before a connected observer closes the socket', () => {
    client.connect(); socket().open(); socket().onclose?.();
    vi.advanceTimersByTime(600);
    socket().open();
    client.onStatusChange = status => { if (status === 'connected') socket().onclose?.(); };

    socket().message(captured.state);

    vi.advanceTimersByTime(599);
    expect(Socket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(Socket.instances).toHaveLength(3);
  });

  it('does not leave a timeout after a stale-state observer disconnects', () => {
    client.connect(); socket().open(); socket().message(captured.state);
    client.onStatusChange = status => { if (status === 'stale') client.disconnect(); };
    vi.advanceTimersByTime(4000);
    expect(client.getStatus()).toBe('offline');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not schedule an old-session retry over a connection started by onDisconnected', () => {
    client.connect(); socket().open();
    client.onDisconnected = () => client.connect('kepler');
    socket().onclose?.();
    const replacement = socket();
    expect(Socket.instances).toHaveLength(2);
    vi.advanceTimersByTime(600);
    expect(Socket.instances).toHaveLength(2);
    expect(replacement.close).not.toHaveBeenCalled();
    expect(client.getStatus()).toBe('connecting');
  });

  it('does not close a replacement opened by the transport-error observer', () => {
    client.connect(); socket().open();
    client.onProtocolWarning = () => client.connect('kepler');
    socket().onerror?.();
    expect(Socket.instances).toHaveLength(2);
    expect(socket().close).not.toHaveBeenCalled();
    expect(client.getStatus()).toBe('connecting');
  });

  it('does not deliver ready for a session replaced by a handshake-warning observer', () => {
    client.connect(); socket().open();
    client.onProtocolWarning = () => client.connect('kepler');
    client.onServerReady = vi.fn();
    socket().message({ ...ready, warnings: ['producer warning'] });
    expect(client.onServerReady).not.toHaveBeenCalled();
    expect(client.getStatus()).toBe('connecting');
  });
});

describe('actual producer Kuiper revocation and retention', () => {
  it('ignores in-flight Kuiper snapshots after explicit deactivation while retaining body updates', () => {
    client.activateKuiper({ x: 1, y: 2, z: 3 }, 4);
    client.connect(); socket().open(); socket().message(ready);
    socket().message(captured.state);
    client.deactivateKuiper();
    const next = { ...captured.state, jd: captured.state.jd + 1 };
    socket().message(next);
    expect(client.latestState?.jd).toBe(next.jd);
    expect(client.latestKuiper).toBeNull();
    expect(client.latestKuiperSnapshot).toBeNull();
    client.activateKuiper({ x: 1, y: 2, z: 3 }, 4);
    socket().message(next);
    expect(client.latestKuiper).toEqual(captured.state.kuiper.positions);
    expect(client.latestKuiperSnapshot).toEqual(captured.state.kuiper);
  });

  it('keeps the real units and binary model unchanged between fifth-frame snapshots', () => {
    client.connect(); socket().open(); socket().message(captured.state);
    const accepted = client.latestKuiperSnapshot;
    const { kuiper: _kuiper, ...omitted } = captured.state;
    for (let frame = 1; frame <= 4; frame++) socket().message({ ...omitted, jd: omitted.jd + frame });
    expect(client.latestKuiperSnapshot).toBe(accepted);
    expect(accepted?.velocity_units).toBe('AU/yr');
    expect(accepted?.binary_model).toBe('osculating_initial_state_only_massless_no_mutual_gravity');
    expect(accepted?.velocities).toEqual(captured.state.kuiper.velocities);
  });
});
