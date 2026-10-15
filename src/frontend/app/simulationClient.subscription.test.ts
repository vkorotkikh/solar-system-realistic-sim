/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulationClient } from './simulationClient';

// Both frames and the handshake come from the native backend. Set the override
// to the pre-fix capture to reproduce the original stale-reactivation failure.
const captured = JSON.parse(readFileSync(process.env.KUIPER_SUBSCRIPTION_FIXTURE
  ?? new URL('./fixtures/kuiper-subscription-ordering.json', import.meta.url), 'utf8'));

class Socket {
  static OPEN = 1;
  static current: Socket;
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: Record<string, unknown>[] = [];
  constructor() { Socket.current = this; }
  send(text: string) { this.sent.push(JSON.parse(text)); }
  close() { this.readyState = 3; }
  message(payload: unknown) { this.onmessage?.({ data: JSON.stringify(payload) }); }
}

let client: SimulationClient;
const activate = (index: number) => {
  const command = captured.commands[index];
  client.activateKuiper({ x: command.center[0], y: command.center[1], z: command.center[2] }, command.spread);
};
const start = (connected = captured.connected) => {
  activate(0);
  client.connect();
  Socket.current.onopen?.();
  Socket.current.message(connected);
};
const reactivate = () => { client.deactivateKuiper(); activate(2); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('WebSocket', Socket);
  client = new SimulationClient({ buildWebSocketUrl: () => 'ws://localhost/ws/sim' });
});
afterEach(() => { client.disconnect(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('native producer stale-reactivation proof', () => {
  it('rejects the delayed old activation while retaining its ordinary body update', () => {
    expect(captured.capture.replacement_produced_before_old_delivery).toBe(true);
    start();
    reactivate();
    Socket.current.message(captured.late_old);
    expect(client.lastError).toBeNull();
    expect(client.latestState).toEqual(captured.late_old);
    expect(client.latestKuiper).toBeNull();
    expect(client.latestKuiperSnapshot).toBeNull();
    Socket.current.message(captured.replacement);
    expect(client.latestKuiperSnapshot).toEqual(captured.replacement.kuiper);
    expect(client.latestKuiper).toEqual(captured.replacement.kuiper.positions);
    expect(Socket.current.sent).toEqual(captured.commands);
  });

  it('retains the replacement snapshot when an old activation is replayed later', () => {
    start(); reactivate();
    Socket.current.message(captured.replacement);
    const accepted = client.latestKuiperSnapshot;
    Socket.current.message(captured.late_old);
    expect(client.latestState).toEqual(captured.late_old);
    expect(client.latestKuiperSnapshot).toBe(accepted);
    expect(accepted).toEqual(captured.replacement.kuiper);
  });

  it('retains native units and binary metadata across omitted Kuiper frames', () => {
    start(); reactivate();
    Socket.current.message(captured.replacement);
    const accepted = client.latestKuiperSnapshot;
    const { kuiper: _kuiper, kuiper_subscription_id: _id, ...omitted } = captured.replacement;
    Socket.current.message(omitted);
    expect(client.latestKuiperSnapshot).toBe(accepted);
    expect(accepted?.velocity_units).toBe('AU/yr');
    expect(accepted?.binary_model).toBe('osculating_initial_state_only_massless_no_mutual_gravity');
  });
});

describe('negotiated subscription contract boundaries', () => {
  it.each([undefined, null, 1, {}, 'other-activation'])(
    'ignores an unmatched identity %j without discarding body updates', identity => {
      start(); reactivate();
      const payload = { ...captured.replacement, kuiper_subscription_id: identity };
      Socket.current.message(payload);
      expect(client.latestState?.bodies).toEqual(payload.bodies);
      expect(client.latestKuiperSnapshot).toBeNull();
      expect(client.lastError).toBeNull();
    }
  );

  it('accepts matching null clearing but ignores null from an old activation', () => {
    start(); reactivate();
    Socket.current.message(captured.replacement);
    const accepted = client.latestKuiperSnapshot;
    Socket.current.message({ ...captured.late_old, kuiper: null });
    expect(client.latestKuiperSnapshot).toBe(accepted);
    Socket.current.message({ ...captured.replacement, kuiper: null });
    expect(client.latestKuiperSnapshot).toBeNull();
    expect(client.latestKuiper).toBeNull();
  });

  it('keeps the negotiated requirement after a duplicate legacy handshake', () => {
    start(); reactivate();
    Socket.current.message({ type: 'connected', protocol_version: 1 });
    Socket.current.message(captured.late_old);
    expect(client.latestKuiperSnapshot).toBeNull();
  });

  it('preserves legacy commands and untagged snapshots when capability is absent', () => {
    start({ type: 'connected', protocol_version: 1 });
    reactivate();
    const { kuiper_subscription_id: _id, ...legacy } = captured.replacement;
    Socket.current.message(legacy);
    expect(client.latestKuiperSnapshot).toEqual(legacy.kuiper);
    expect(Socket.current.sent.every(command => !('subscription_id' in command))).toBe(true);
  });

  it('uses a fresh identity when replaying the subscription on a replacement socket', () => {
    start();
    const previous = Socket.current;
    client.connect();
    Socket.current.onopen?.();
    Socket.current.message(captured.connected);
    expect(Socket.current.sent[0].subscription_id).not.toBe(previous.sent[0].subscription_id);
    Socket.current.message(captured.late_old);
    expect(client.latestKuiperSnapshot).toBeNull();
    const replay = { ...captured.replacement, kuiper_subscription_id: Socket.current.sent[0].subscription_id };
    Socket.current.message(replay);
    expect(client.latestKuiperSnapshot).toEqual(replay.kuiper);
  });
});
