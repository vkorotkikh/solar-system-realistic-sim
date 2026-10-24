import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SimulationClient } from './simulationClient';

// NBW-062 narrow case-equivalence regression. Other alias/rejection policy is not changed.
class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn(() => { this.readyState = 3; });
  send = vi.fn();
  constructor(readonly url: string) { Socket.instances.push(this); }
}
let client: SimulationClient;
const build = vi.fn((args?: {port?: number; params?: Record<string, string | number | boolean>}) => {
  const url = new URL(`ws://127.0.0.1:${args?.port}/ws/sim`);
  for (const [key, value] of Object.entries(args?.params ?? {})) url.searchParams.set(key, String(value));
  return url.href;
});
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('window', globalThis); vi.stubGlobal('WebSocket', Socket);
  vi.spyOn(Math, 'random').mockReturnValue(0.5); Socket.instances = []; build.mockClear();
  client = new SimulationClient({ buildWebSocketUrl: build });
});
afterEach(() => {
  client.disconnect(); expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function request(index = 0) { return new URL(Socket.instances[index]!.url); }
function expectRequest(engine: string, integrator: string, port = 8042, index = 0) {
  const url = request(index);
  expect(url.port).toBe(String(port));
  expect([...url.searchParams.entries()]).toEqual([
    ['engine', engine], ['integrator', integrator], ['protocol_version', '1'],
  ]);
}
test('control default request retains rebound IAS15 and default port', () => {
  client.connect(); expectRequest('rebound', 'ias15');
});
test('control exact canonical rebound preserves explicit port and protocol', () => {
  client.connect('rebound', 9137); expectRequest('rebound', 'ias15', 9137);
});
test.each(['REBOUND', 'ReBoUnD'])('case-equivalent %s keeps REBOUND IAS15 without rewriting wire name', engine => {
  client.connect(engine, 9137); expectRequest(engine, 'ias15', 9137);
});
test('case-equivalent REBOUND reconnect retains IAS15 and raw engine spelling', () => {
  client.connect('REBOUND', 9137); Socket.instances[0]!.onclose?.();
  vi.advanceTimersByTime(600); expect(Socket.instances).toHaveLength(2);
  expectRequest('REBOUND', 'ias15', 9137, 1);
});
test.each(['tudatpy', 'TUDATPY', 'tudat', 'kepler', 'custom-engine', ' rebound ', ''])('control non-REBOUND %j is passed through without new alias/rejection policy', engine => {
  client.connect(engine); expectRequest(engine, 'whfast');
});
test('control current server fallback warnings stay visible rather than silently claiming requested engine', () => {
  const warning = vi.fn(), ready = vi.fn(); client.onProtocolWarning = warning; client.onServerReady = ready;
  client.connect('tudat');
  const s = Socket.instances[0]!; s.readyState = Socket.OPEN; s.onopen?.();
  s.onmessage?.({ data: JSON.stringify({ type: 'connected', protocol_version: 1, engine: 'rebound', engine_requested: 'tudat', integrator: 'whfast', warnings: ['Unknown engine `tudat`; selecting available engine'] }) });
  expect(warning).toHaveBeenCalledExactlyOnceWith('Unknown engine `tudat`; selecting available engine');
  expect(ready).toHaveBeenCalledExactlyOnceWith(client); expect(client.getStatus()).toBe('connected');
});
