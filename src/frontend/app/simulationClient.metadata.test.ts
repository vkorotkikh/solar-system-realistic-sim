import assert from 'node:assert/strict';
import { test } from 'vitest';
import { SimulationClient } from './simulationClient';
import captured from './fixtures/kuiper-runner-state.json';

interface FixtureState {
  type: string;
  jd: number;
  bodies: { earth: { pos: unknown; vel?: unknown } };
  kuiper: { positions: number[][]; velocities: number[][]; position_units: string; velocity_units: string; binary_pairs: number[][] };
  [key: string]: unknown;
}

type Mutation = (incoming: FixtureState) => void;
interface OwnedSocket {
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  message(payload: unknown): void;
}
interface OwnedClock { advance(ms: number): void }

// Regression: NBW007 — reject incompatible supplied state metadata before publication.
// Found by /qa on 2026-10-24; report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md.
const contract = (origin: string) => ({
  schema_version: 1, reference_frame: 'barycentric_ecliptic_j2000',
  origin, orientation: 'ecliptic_j2000', position_unit: 'AU',
  velocity_unit: 'AU/day', jd_time_scale: 'TDB'
});
const state = (): FixtureState => ({
  type: 'state_update', jd: 2451545, bodies: { earth: { pos: [1, 2, 3] } },
  kuiper: { positions: [[4, 5, 6]], velocities: [[0, 0, 0]],
    position_units: 'AU', velocity_units: 'AU/yr', binary_pairs: [] }
});
const supported = (origin: string): FixtureState => ({ ...state(),
  position_frame: 'barycentric', velocity_frame: 'barycentric',
  position_units: 'AU', velocity_units: 'AU/day', jd_time_scale: 'TDB',
  state_vector_contract: contract(origin),
  force_models: { state_vector_contract: contract(origin), description: 'owned fixture' }
});

// Owned timer adapter: no wall clock, browser, sockets or real background timers.
function withClient(run: (
  client: SimulationClient, socket: () => OwnedSocket, clock: OwnedClock,
  sockets: { instances: OwnedSocket[] }
) => void) {
  const originals = Object.fromEntries(['window', 'WebSocket'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const random = Math.random;
  let now = 0, serial = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock = {
    advance(ms: number) {
      const end = now + ms;
      for (let steps = 0; ; steps++) {
        assert.ok(steps < 1000, 'timer adapter runaway');
        const next = [...timers].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]); now = next[1].at; next[1].fn();
      }
      now = end;
    }
  };
  class Socket {
    static OPEN = 1;
    static instances: Socket[] = [];
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    readyState = 1;
    constructor() { Socket.instances.push(this); }
    send() {}
    close() { this.readyState = 3; }
    message(payload: unknown) { this.onmessage?.({ data: JSON.stringify(payload) }); }
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    setTimeout(fn: () => void, ms: number) { const id = ++serial; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id: number) { timers.delete(id); }
  } });
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: Socket });
  Math.random = () => 0.5;
  const client = new SimulationClient({ buildWebSocketUrl: () => 'ws://owned.invalid/ws/sim' });
  client.connect(); Socket.instances.at(-1)!.onopen!();
  try { run(client, () => Socket.instances.at(-1)!, clock, Socket); }
  finally {
    client.disconnect();
    assert.equal(timers.size, 0, 'client leaves no owned timers after disconnect');
    Math.random = random;
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

function rejection(name: string, mutate: Mutation) {
  test(name, () => withClient((client, socket, clock) => {
    socket().message(state());
    const accepted = client.latestState;
    const kuiper = client.latestKuiperSnapshot;
    clock.advance(3000);
    const incoming = state(); incoming.jd += 10; incoming.bodies.earth.pos = [9, 9, 9];
    incoming.kuiper.positions = [[9, 9, 9]];
    mutate(incoming);
    socket().message(incoming);
    assert.equal(client.latestState, accepted, 'incompatible frame must not replace last accepted state');
    assert.equal(client.latestKuiperSnapshot, kuiper, 'incompatible frame must not replace independent Kuiper state');
    assert.ok(client.lastError, 'provided incompatible declaration must report a protocol error');
    clock.advance(1000);
    assert.equal(client.getStatus(), 'stale', 'invalid metadata must not reset freshness');
    assert.equal(client.latestState, null);
    assert.equal(client.latestKuiperSnapshot, null);
  }));
}

const flat = {
  position_frame: 'heliocentric', velocity_frame: 'heliocentric',
  position_units: 'km', velocity_units: 'AU/yr', jd_time_scale: 'UTC'
};
for (const [field, wrong] of Object.entries(flat)) {
  for (const value of [wrong, null, 42]) {
    rejection(`flat ${field}=${JSON.stringify(value)}`, incoming => { incoming[field] = value; });
  }
}
const nested = {
  schema_version: 2, reference_frame: 'heliocentric_equatorial_j2000',
  origin: 'heliocenter', orientation: 'equatorial_j2000',
  position_unit: 'km', velocity_unit: 'AU/yr', jd_time_scale: 'UTC'
};
for (const location of ['top', 'nested']) {
  const set = (incoming: FixtureState, value: unknown) => {
    if (location === 'top') incoming.state_vector_contract = value;
    else incoming.force_models = { state_vector_contract: value };
  };
  for (const [field, wrong] of Object.entries(nested)) {
    for (const value of [wrong, null, field === 'schema_version' ? true : 42]) {
      rejection(`${location} ${field}=${JSON.stringify(value)}`, incoming => {
        set(incoming, { ...contract('integrated_particle_barycenter'), [field]: value });
      });
    }
  }
  for (const value of [null, [], 'contract', 1]) {
    rejection(`${location} malformed contract ${JSON.stringify(value)}`, incoming => set(incoming, value));
  }
}
rejection('two individually supported origins contradict each other', incoming => {
  incoming.state_vector_contract = contract('integrated_particle_barycenter');
  incoming.force_models = { state_vector_contract: contract('solar_system_barycenter') };
});

// Optional velocity shape is hardening only: the current scene consumes positions, not velocities.
for (const vel of [null, [1, 2], [1, 2, 3, 4], ['1', 2, 3], [1, null, 3]]) {
  rejection(`provided body velocity ${JSON.stringify(vel)}`, incoming => { incoming.bodies.earth.vel = vel; });
}

const positive: [string, FixtureState][] = [
  ['legacy positions only', state()],
  ['partial flat', { ...state(), position_units: 'AU' }],
  ['partial top', { ...state(), state_vector_contract: { origin: 'solar_system_barycenter' } }],
  ['empty top', { ...state(), state_vector_contract: {} }],
  ['partial nested', { ...state(), force_models: { state_vector_contract: { schema_version: 1 } } }],
  ['REBOUND origin', supported('integrated_particle_barycenter')],
  ['Tudat origin', supported('solar_system_barycenter')],
  ['finite optional velocity', { ...state(), bodies: { earth: { pos: [1, 2, 3], vel: [0, -1, 2] } } }],
  ['unrelated diagnostics remain optional', { ...state(), force_models: null }],
  ['unknown descriptive fields', { ...state(), state_vector_contract: { ...contract('solar_system_barycenter'), note: 'A' },
    force_models: { state_vector_contract: { ...contract('solar_system_barycenter'), note: 'B' } } }],
];
for (const [name, payload] of positive) {
  test(`positive ${name}`, () => withClient((client, socket) => {
    socket().message({ type: 'connected', protocol_version: 1 });
    socket().message(payload);
    assert.equal(client.lastError, null);
    assert.deepEqual(client.latestState, payload);
    assert.equal(client.latestKuiperSnapshot!.velocity_units, 'AU/yr');
  }));
}
test('current recorded real-runner Kuiper payload remains accepted', () => withClient((client, socket) => {
  socket().message(captured.state);
  assert.equal(client.lastError, null);
  assert.deepEqual(client.latestState, captured.state);
  assert.deepEqual(client.latestKuiperSnapshot, captured.state.kuiper);
}));
test('invalid metadata does not erase reconnect backoff', () => withClient((client, socket, clock, Socket) => {
  socket().onclose!(); clock.advance(600); socket().onopen!();
  socket().message({ type: 'connected', protocol_version: 1 });
  socket().message({ ...state(), position_units: 'km' });
  socket().onclose!();
  clock.advance(1199);
  assert.equal(Socket.instances.length, 2, 'invalid frame cannot reset second reconnect delay to600ms');
  clock.advance(1); assert.equal(Socket.instances.length, 3);
}));


// Supplemental parent-reviewed compatibility controls; original83 cases above stay unchanged.
for (const location of ['top', 'nested']) {
  rejection('supplemental schema string1 is rejected at ' + location, incoming => {
    const supplied = { schema_version: '1' };
    if (location === 'top') incoming.state_vector_contract = supplied;
    else incoming.force_models = { state_vector_contract: supplied };
  });
}

const supplementalPositive: [string, FixtureState, number][] = [
  ['lexical schema1.0 top', { ...state(), state_vector_contract: { schema_version: 1 } }, 1],
  ['lexical schema1.0 nested', { ...state(), force_models: { state_vector_contract: { schema_version: 1 } } }, 1],
  ['duplicate numeric1.0 top and1 nested', { ...state(), state_vector_contract: { schema_version: 1 },
    force_models: { state_vector_contract: { schema_version: 1 } } }, 1],
  ['duplicate numeric1 top and1.0 nested', { ...state(), state_vector_contract: { schema_version: 1 },
    force_models: { state_vector_contract: { schema_version: 1 } } }, 2],
  ['disjoint partial declarations', { ...state(),
    state_vector_contract: { reference_frame: 'barycentric_ecliptic_j2000', note: 'top' },
    force_models: { state_vector_contract: { origin: 'solar_system_barycenter', note: 'nested' } } }, 0],
  ['empty nested declaration', { ...state(), force_models: { state_vector_contract: {} } }, 0],
  ['full top with empty nested', { ...state(), state_vector_contract: contract('integrated_particle_barycenter'),
    force_models: { state_vector_contract: {} } }, 0],
];
for (const [name, payload, decimalOccurrence] of supplementalPositive) {
  test('supplemental accepts ' + name, () => withClient((client, socket) => {
    const warnings: string[] = [];
    client.onProtocolWarning = warning => warnings.push(warning);
    let wire = JSON.stringify(payload);
    if (decimalOccurrence) {
      // JSON1.0 and1 parse to the same JS Number; exercise actual lexical1.0.
      let occurrence = 0;
      wire = wire.replace(/"schema_version":1/g, match =>
        ++occurrence === decimalOccurrence ? '"schema_version":1.0' : match);
      assert.ok(wire.includes('"schema_version":1.0'), 'fixture must put1.0 on the actual wire');
    }
    socket().onmessage!({ data: wire });
    assert.equal(client.lastError, null);
    assert.deepEqual(warnings, []);
    assert.deepEqual(client.latestState, JSON.parse(wire));
    assert.equal(client.latestKuiperSnapshot!.velocity_units, 'AU/yr');
  }));
}

const diagnosticRejections: [string, Mutation][] = [
  ['incompatible provided main units', incoming => { incoming.position_units = 'km'; }],
  ['existing incompatible TDB control', incoming => { incoming.jd_time_scale = 'UTC'; }],
  ['optional provided velocity hardening', incoming => { incoming.bodies.earth.vel = [1, 2]; }],
];
for (const [name, mutate] of diagnosticRejections) {
  test('supplemental rejection preserves diagnostic notification: ' + name,
    () => withClient((client, socket, clock) => {
      socket().message(state());
      clock.advance(4000);
      assert.equal(client.getStatus(), 'stale');
      const warnings: string[] = [], success: string[] = [];
      client.onProtocolWarning = warning => warnings.push(warning);
      client.onConnected = () => success.push('connected');
      client.onServerReady = () => success.push('ready');
      client.onStatusChange = status => success.push(status);
      const incoming = state();
      mutate(incoming);
      socket().message(incoming);
      assert.equal(warnings.length, 1, 'rejecting a frame must keep the existing diagnostic callback');
      assert.equal(typeof warnings[0], 'string');
      assert.ok(warnings[0].length > 0);
      assert.equal(warnings[0], client.lastError);
      assert.deepEqual(success, [], 'rejected state must not publish successful-message status');
      assert.equal(client.getStatus(), 'stale');
      assert.equal(client.latestState, null);
      assert.equal(client.latestKuiperSnapshot, null);
    }));
}


// Diagnostic envelopes are optional/uninterpreted unless a record declares a contract.
const diagnosticEnvelopes: [string, unknown][] = [['array', []], ['string', 'diagnostic'], ['zero', 0], ['false', false]];
for (const [name, diagnostic] of diagnosticEnvelopes) {
  test('envelope compatibility accepts ' + name, () => withClient((client, socket) => {
    const payload = { ...state(), force_models: diagnostic };
    const warnings: string[] = [];
    client.onProtocolWarning = message => warnings.push(message);
    socket().message(payload);
    assert.equal(client.lastError, null);
    assert.deepEqual(warnings, []);
    assert.deepEqual(client.latestState, payload, 'client retains uninterpreted diagnostics');
    assert.equal(client.latestKuiperSnapshot!.velocity_units, 'AU/yr');
  }));
  rejection('envelope does not bypass malformed top contract: ' + name, incoming => {
    incoming.force_models = diagnostic;
    incoming.state_vector_contract = null;
  });
}
