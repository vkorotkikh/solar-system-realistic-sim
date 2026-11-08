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

const OLD_JD = 2451545.01;
const TARGET_JD = 2460000.5;
const state = (jd: number, seekId?: number) => ({
  type: 'state_update', jd, jd_time_scale: 'TDB', bodies: { earth: { pos: [1, 2, 3] } },
  ...(seekId === undefined ? {} : { seek_id: seekId })
});
const elements = (a: number, seekId?: number) => ({
  type: 'orbital_elements', body_id: 'earth',
  elements: { a, e: 0.0167, inc: 0, Omega: 0, omega: 102, M: 10 },
  ...(seekId === undefined ? {} : { seek_id: seekId })
});
const tagged = { type: 'connected', protocol_version: 1, jd_time_scale: 'TDB', seek_id_version: 1 };
const legacy = { type: 'connected', protocol_version: 1, jd_time_scale: 'TDB' };
let client: SimulationClient;
const socket = () => Socket.instances.at(-1)!;
const sent = () => socket().send.mock.calls.map(call => JSON.parse(call[0]));

function connect(handshake: object): void {
  client.connect(); socket().open(); socket().message(handshake); socket().message(state(OLD_JD, 0));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('WebSocket', Socket);
  Socket.instances = [];
  client = new SimulationClient({ buildWebSocketUrl: () => 'ws://localhost/ws/sim' });
});
afterEach(() => { client.disconnect(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('seek tagging', () => {
  it('sends a monotonically increasing seek id to a server that advertises support', () => {
    connect(tagged);
    expect(client.setJulianDate(TARGET_JD)).toBe(true);
    expect(client.setJulianDate(TARGET_JD + 1)).toBe(true);
    expect(sent().map(m => m.seek_id)).toEqual([1, 2]);
    expect(sent()[0]).toEqual({ type: 'set_julian_date', jd: TARGET_JD, jd_time_scale: 'TDB', seek_id: 1 });
  });

  it('ignores a state_update from before the seek and accepts the first one echoing the new id', () => {
    const onJd = vi.fn(); client.onJulianDate = onJd;
    connect(tagged);
    onJd.mockClear();
    client.setJulianDate(TARGET_JD);
    socket().message(state(OLD_JD, 0)); // In flight when the seek was sent.
    expect(onJd).not.toHaveBeenCalled();
    expect(client.latestJulianDate).toBe(OLD_JD); // Last confirmed epoch, not rewound further.
    expect(client.latestState).toBeNull();
    socket().message(state(TARGET_JD, 1));
    expect(onJd).toHaveBeenCalledExactlyOnceWith(TARGET_JD);
    expect(client.latestJulianDate).toBe(TARGET_JD);
    expect(client.latestState?.jd).toBe(TARGET_JD);
  });

  it('does not rewind a confirmed post-seek epoch when an old frame arrives late', () => {
    const onJd = vi.fn(); client.onJulianDate = onJd;
    connect(tagged);
    client.setJulianDate(TARGET_JD);
    socket().message(state(TARGET_JD, 1));
    onJd.mockClear();
    socket().message(state(OLD_JD, 0));
    expect(onJd).not.toHaveBeenCalled();
    expect(client.latestJulianDate).toBe(TARGET_JD);
    expect(client.latestState?.jd).toBe(TARGET_JD);
  });

  it('ignores orbital_elements from before the seek and delivers the one after it', () => {
    const onElements = vi.fn(); client.onOrbitalElements = onElements;
    connect(tagged);
    client.setJulianDate(TARGET_JD);
    socket().message(elements(1, 0));
    expect(onElements).not.toHaveBeenCalled();
    expect(client.latestOrbitalElements).toBeNull();
    socket().message(elements(2, 1));
    expect(onElements).toHaveBeenCalledOnce();
    expect(client.latestOrbitalElements?.elements.a).toBe(2);
  });

  it('keeps today\'s behaviour with a server that does not advertise or echo seek ids', () => {
    const onJd = vi.fn(); client.onJulianDate = onJd;
    const onElements = vi.fn(); client.onOrbitalElements = onElements;
    connect(legacy);
    client.setJulianDate(TARGET_JD);
    expect(sent()).toEqual([{ type: 'set_julian_date', jd: TARGET_JD, jd_time_scale: 'TDB' }]);
    onJd.mockClear();
    socket().message(state(OLD_JD));
    socket().message(elements(3));
    expect(onJd).toHaveBeenCalledExactlyOnceWith(OLD_JD);
    expect(client.latestState?.jd).toBe(OLD_JD);
    expect(onElements).toHaveBeenCalledOnce();
  });

  it('accepts a frame without seek_id from an advertising server as unknown', () => {
    const onJd = vi.fn(); client.onJulianDate = onJd;
    connect(tagged);
    client.setJulianDate(TARGET_JD);
    onJd.mockClear();
    socket().message(state(TARGET_JD));
    expect(onJd).toHaveBeenCalledExactlyOnceWith(TARGET_JD);
  });

  it('does not advance the id when the seek was not sent', () => {
    connect(tagged);
    socket().readyState = 0; // send() reports false without ending the session.
    expect(client.setJulianDate(TARGET_JD)).toBe(false);
    socket().readyState = 1;
    socket().message(state(OLD_JD, 0));
    expect(client.latestJulianDate).toBe(OLD_JD);
    expect(client.latestState?.jd).toBe(OLD_JD);
    client.setJulianDate(TARGET_JD);
    expect(sent().at(-1).seek_id).toBe(1);
  });

  it('starts a fresh id sequence on a replacement socket', () => {
    connect(tagged);
    client.setJulianDate(TARGET_JD);
    client.connect(); socket().open(); socket().message(tagged);
    socket().message(state(OLD_JD, 0)); // New session: nothing has been seeked yet.
    expect(client.latestJulianDate).toBe(OLD_JD);
    client.setJulianDate(TARGET_JD);
    expect(sent().at(-1).seek_id).toBe(1);
  });

  it('judges frames against a reentrant seek made from an epoch observer', () => {
    connect(tagged);
    client.onJulianDate = jd => { if (jd === OLD_JD + 1) client.setJulianDate(TARGET_JD); };
    socket().message(state(OLD_JD + 1, 0)); // Observer seeks: id 1.
    expect(sent().at(-1).seek_id).toBe(1);
    socket().message(state(OLD_JD + 2, 0));
    expect(client.latestJulianDate).toBe(OLD_JD + 1);
    socket().message(state(TARGET_JD, 1));
    expect(client.latestJulianDate).toBe(TARGET_JD);
  });

  it('survives a disconnect from inside the epoch observer', () => {
    connect(tagged);
    client.setJulianDate(TARGET_JD);
    client.onJulianDate = () => client.disconnect();
    socket().message(state(TARGET_JD, 1));
    expect(client.getStatus()).toBe('offline');
    expect(client.latestJulianDate).toBeNull();
    socket().message(state(OLD_JD, 0)); // Revoked socket: ignored as before.
    expect(client.latestJulianDate).toBeNull();
  });

  it('rejects malformed seek ids like any other invalid field', () => {
    connect(tagged);
    client.setJulianDate(TARGET_JD);
    for (const bad of [-1, 1.5, '1', null, true]) {
      socket().message({ ...state(TARGET_JD), seek_id: bad });
      socket().message({ ...elements(1), seek_id: bad });
      expect(client.latestState).toBeNull();
      expect(client.latestOrbitalElements).toBeNull();
      expect(client.lastError).toContain('seek_id');
    }
  });

  it('lets a never-acknowledged seek go stale instead of freezing as connected', () => {
    connect(tagged);
    client.setJulianDate(TARGET_JD);
    vi.advanceTimersByTime(3_000);
    socket().message(state(OLD_JD, 0)); // Dropped: proves nothing about the seek.
    vi.advanceTimersByTime(1_500);
    expect(client.getStatus()).toBe('stale');
  });
});
