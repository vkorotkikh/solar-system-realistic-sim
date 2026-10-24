import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import type { KeplerOrbit } from '../sim/orbitMath';
import type { ModelWorkerInboundMessage, ModelWorkerOutboundMessage, ModelWorkerStateMessage } from './modelWorkerContract';

// FE-WORKER-INIT-ATOMICITY /qa 2026-10-24: publish only fully prepared initialization state.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

async function withWorker(run: (
  send: (message: unknown) => void,
  posted: ModelWorkerOutboundMessage[],
) => void): Promise<void> {
  vi.resetModules();
  const posted: ModelWorkerOutboundMessage[] = [];
  const worker = {
    onmessage: null as ((event: { data: ModelWorkerInboundMessage }) => void) | null,
    postMessage: (message: ModelWorkerOutboundMessage) => posted.push(message),
  };
  vi.stubGlobal('self', worker);
  try {
    await import('./modelWorker');
    run(data => worker.onmessage!({ data: data as ModelWorkerInboundMessage }), posted);
  } finally {
    vi.unstubAllGlobals();
    vi.resetModules();
  }
}

const JD = 2451545;
const orbit = (aAu: number): KeplerOrbit => ({ epochJd: JD, aAu, e: 0, periodDays: 365.25, meanAnomalyDeg: 0 });
const prior = () => ({ bodies: [{ id: 'prior', sourceIndex: 7, orbit: orbit(1) }] });
const replacement = () => ({ bodies: [
  { id: 'next-a', sourceIndex: 11, orbit: orbit(2) },
  { id: 'next-b', sourceIndex: 13, orbit: orbit(3) },
] });
const failureModes: [string, () => { catalog: ReturnType<typeof replacement>; simStartJd: number | bigint }, RegExp][] = [
  ['BigInt start time', () => ({ catalog: replacement(), simStartJd: BigInt(JD) }), /BigInt/],
  ['BigInt second orbit epoch', () => {
    const catalog = replacement();
    catalog.bodies[1].orbit.epochJd = BigInt(JD) as unknown as number;
    return { catalog, simStartJd: JD };
  }, /BigInt/],
  ['existing invalid sourceIndex', () => {
    const catalog = replacement();
    catalog.bodies[1].sourceIndex = -1;
    return { catalog, simStartJd: JD };
  }, /invalid sourceIndex/],
];
for (const [name, fixture, diagnostic] of failureModes) {
  for (const initialized of [false, true]) {
    test(`failed initialization is not accepted: ${name}, prior=${initialized}`, async () => {
      await withWorker((send, posted) => {
        const deliver = (message: unknown) => send(structuredClone(message));
        if (initialized) {
          deliver({ type: 'init', catalog: prior(), simStartJd: JD, sequence: 0 });
          deliver({ type: 'tick', sequence: 1, simState: { julianDate: JD } });
          assert.equal(posted.length, 2);
          assert.deepEqual([...(posted[1] as ModelWorkerStateMessage).bodies.slice(0, 3)], [1, 0, 0]);
        }
        const beforeInit = posted.length;
        assert.throws(() => deliver({ type: 'init', ...fixture(), sequence: 100 }), error => {
          assert.match((error as Error).message, /model worker init failed:/);
          assert.match((error as Error).message, diagnostic);
          return true;
        });
        assert.equal(posted.length, beforeInit, 'failed preparation emits no new ready');
        for (const sequence of [2, 101]) {
          const beforeTick: number = posted.length;
          assert.doesNotThrow(() => deliver({ type: 'tick', sequence, simState: { julianDate: JD } }));
          assert.equal(posted.length, beforeTick + (initialized ? 1 : 0));
          if (initialized) {
            const state = posted.at(-1)! as ModelWorkerStateMessage;
            assert.equal(state.type, 'state');
            assert.equal(state.sequence, sequence);
            assert.equal(state.schemaVersion, 2);
            assert.equal(state.tickJd, JD);
            assert.equal(state.bodies.length, 6);
            assert.deepEqual([...state.availability], [1]);
            assert.deepEqual([...state.bodies.slice(0, 3)], [1, 0, 0]);
          }
        }
      });
    });
  }
}
for (const initialized of [false, true]) {
  test(`successful initialization accepts complete replacement and sequence: prior=${initialized}`, async () => {
    await withWorker((send, posted) => {
      const deliver = (message: unknown) => send(structuredClone(message));
      if (initialized) {
        deliver({ type: 'init', catalog: prior(), simStartJd: JD, sequence: 0 });
        deliver({ type: 'tick', sequence: 1, simState: { julianDate: JD } });
      }
      const before = posted.length;
      deliver({ type: 'init', catalog: replacement(), simStartJd: JD, sequence: 100 });
      assert.equal(posted.length, before + 1);
      assert.deepEqual(posted.at(-1), { type: 'ready', bodyCount: 2, schemaVersion: 2 });
      deliver({ type: 'tick', sequence: 2, simState: { julianDate: JD } });
      assert.equal(posted.length, before + 1);
      deliver({ type: 'tick', sequence: 101, simState: { julianDate: JD } });
      assert.equal(posted.length, before + 2);
      const state = posted.at(-1)! as ModelWorkerStateMessage;
      assert.equal(state.sequence, 101);
      assert.equal(state.bodies.length, 12);
      assert.deepEqual([...state.availability], [1, 1]);
      assert.deepEqual([...state.bodies.slice(0, 3)], [2, 0, 0]);
      assert.deepEqual([...state.bodies.slice(6, 9)], [3, 0, 0]);
    });
  });
}

for (const initialized of [false, true]) {
  test(`failed initialization is not accepted: sequence coercion, prior=${initialized}`, async () => {
    await withWorker((send, posted) => {
      const deliver = (message: unknown) => send(structuredClone(message));
      if (initialized) {
        deliver({ type: 'init', catalog: prior(), simStartJd: JD, sequence: 0 });
        deliver({ type: 'tick', sequence: 1, simState: { julianDate: JD } });
        assert.equal(posted.length, 2);
        assert.deepEqual([...(posted[1] as ModelWorkerStateMessage).bodies.slice(0, 3)], [1, 0, 0]);
      }
      const beforeInit = posted.length;
      const sequence = { valueOf: 0, toString: 0 };
      assert.throws(() => deliver({
        type: 'init', catalog: replacement(), simStartJd: JD, sequence,
      }), error => {
        assert.match((error as Error).message, /model worker init failed:/);
        assert.match((error as Error).message, /Cannot convert object to primitive value/);
        return true;
      });
      assert.equal(posted.length, beforeInit, 'failed sequence preparation emits no new ready');
      for (const sequence of [2, 101]) {
        const beforeTick: number = posted.length;
        assert.doesNotThrow(() => deliver({ type: 'tick', sequence, simState: { julianDate: JD } }));
        assert.equal(posted.length, beforeTick + (initialized ? 1 : 0));
        if (initialized) {
          const state = posted.at(-1)! as ModelWorkerStateMessage;
          assert.equal(state.type, 'state');
          assert.equal(state.sequence, sequence);
          assert.equal(state.schemaVersion, 2);
          assert.equal(state.tickJd, JD);
          assert.equal(state.bodies.length, 6);
          assert.deepEqual([...state.availability], [1]);
          assert.deepEqual([...state.bodies.slice(0, 3)], [1, 0, 0]);
        }
      }
    });
  });
}
