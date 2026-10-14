import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulationClient } from './simulationClient';

// The checked-in fixture is captured, not a hand-written approximation. The
// override lets the same gate consume a fresh real backend runner in one run.
const captured = JSON.parse(readFileSync(process.env.KUIPER_WIRE_FIXTURE
  ?? new URL('./fixtures/kuiper-runner-state.json', import.meta.url), 'utf8'));

class Socket {
  static OPEN = 1;
  static current: Socket;
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { Socket.current = this; }
  close() { this.readyState = 3; }
  send() {}
  message(payload: unknown) { this.onmessage?.({ data: JSON.stringify(payload) }); }
}
let client: SimulationClient;
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('window', globalThis); vi.stubGlobal('WebSocket', Socket);
  client = new SimulationClient({ buildWebSocketUrl: () => 'ws://localhost/ws/sim' });
  client.connect(); Socket.current.onopen?.();
});
afterEach(() => { client.disconnect(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('real runner to simulation-client Kuiper contract', () => {
  it('accepts the current producer object and retains positions, velocities, units and binary metadata', () => {
    expect(captured.capture.producer).toContain('SimulationRunner');
    expect(captured.state.kuiper.binary_pairs.length).toBeGreaterThan(0);
    Socket.current.message(captured.state);
    expect(client.lastError).toBeNull();
    expect(client.latestState).toEqual(captured.state);
    expect(client.latestKuiper).toEqual(captured.state.kuiper.positions);
    expect(client.latestKuiperSnapshot).toEqual(captured.state.kuiper);
  });

  it('retains the snapshot between the backend fifth-frame Kuiper deliveries', () => {
    Socket.current.message(captured.state);
    const { kuiper: _kuiper, ...next } = captured.state;
    Socket.current.message(next);
    expect(client.latestState).toEqual(next);
    expect(client.latestKuiper).toEqual(captured.state.kuiper.positions);
    expect(client.latestKuiperSnapshot).toEqual(captured.state.kuiper);
  });

  it('preserves additional producer metadata without treating it as renderer positions', () => {
    const kuiper = { ...captured.state.kuiper, provenance: { frame: 'barycentric', generation: 7 } };
    Socket.current.message({ ...captured.state, kuiper });
    expect(client.lastError).toBeNull();
    expect(client.latestKuiper).toEqual(kuiper.positions);
    expect(client.latestKuiperSnapshot).toEqual(kuiper);
  });

  it('accepts an empty object snapshot and replaces previously populated positions', () => {
    Socket.current.message(captured.state);
    const kuiper = { positions: [], velocities: [], binary_pairs: [], position_units: 'AU' };
    Socket.current.message({ ...captured.state, kuiper });
    expect(client.lastError).toBeNull();
    expect(client.latestKuiper).toEqual([]);
    expect(client.latestKuiperSnapshot).toEqual(kuiper);
  });

  it('accepts older object snapshots without optional physics metadata', () => {
    Socket.current.message({ ...captured.state, kuiper: { positions: [[4, 5, 6]] } });
    expect(client.lastError).toBeNull();
    expect(client.latestKuiper).toEqual([[4, 5, 6]]);
    expect(client.latestKuiperSnapshot).toEqual({ positions: [[4, 5, 6]] });
  });

  it.each(['positions', 'velocities', 'binary_pairs', 'position_units'])(
    'rejects malformed %s in a real-shaped delivery without replacing accepted state', field => {
      Socket.current.message(captured.state);
      const accepted = client.latestState;
      const invalid = structuredClone(captured.state);
      if (field === 'positions') invalid.kuiper.positions[0] = [1, null, 3];
      if (field === 'velocities') invalid.kuiper.velocities[0] = [1, 2];
      if (field === 'binary_pairs') invalid.kuiper.binary_pairs[0] = [0, invalid.kuiper.positions.length];
      if (field === 'position_units') invalid.kuiper.position_units = 'km';
      Socket.current.message(invalid);
      expect(client.latestState).toBe(accepted);
      expect(client.lastError).toBeTruthy();
    }
  );

  it('continues accepting legacy arrays and clears all cached Kuiper state on deactivation', () => {
    Socket.current.message({ ...captured.state, kuiper: [[4, 5, 6]] });
    expect(client.latestKuiper).toEqual([[4, 5, 6]]);
    expect(client.latestKuiperSnapshot).toEqual({ positions: [[4, 5, 6]] });
    client.deactivateKuiper();
    expect(client.latestKuiper).toBeNull(); expect(client.latestKuiperSnapshot).toBeNull();
  });

  it.each(['stale', 'disconnect', 'null'] as const)('clears positions and metadata on %s', action => {
    Socket.current.message(captured.state);
    if (action === 'stale') vi.advanceTimersByTime(4000);
    if (action === 'disconnect') client.disconnect();
    if (action === 'null') Socket.current.message({ ...captured.state, kuiper: null });
    expect(client.latestKuiper).toBeNull(); expect(client.latestKuiperSnapshot).toBeNull();
  });
});
