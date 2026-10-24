import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import type { KeplerOrbit } from '../sim/orbitMath';
import {
  buildCatalogIndexContract,
  type ModelWorkerCatalog, type ModelWorkerInboundMessage,
  type ModelWorkerOutboundMessage, type ModelWorkerStateMessage,
} from './modelWorkerContract';

// FE-WORKER-SOURCE-INDEX-RANGE /qa 2026-10-24: reject indices before Int32 storage wraps.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

async function withWorker(run: (
  send: (message: ModelWorkerInboundMessage) => void,
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
    run(data => worker.onmessage!({ data }), posted);
  } finally {
    vi.unstubAllGlobals();
    vi.resetModules();
  }
}

const JD = 2451545;
const orbit: KeplerOrbit = { epochJd: JD, aAu: 1, e: 0, periodDays: 365.25, meanAnomalyDeg: 0 };
const catalog = (sourceIndex: unknown): ModelWorkerCatalog => ({ bodies: [{ id: 'root', sourceIndex: sourceIndex as number, orbit }] });

for (const sourceIndex of [2147483648, 2147483649, 4294967295, 4294967296, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE]) {
  test(`reject sourceIndex outside signed Int32 storage: ${sourceIndex}`, () => {
    const input = catalog(sourceIndex);
    const before = structuredClone(input);
    assert.throws(() => buildCatalogIndexContract(input), /invalid sourceIndex/);
    assert.deepEqual(input, before);
  });
}
for (const sourceIndex of [0, -0, 1, 2147483646, 2147483647]) {
  test(`preserve representable sourceIndex: ${Object.is(sourceIndex, -0) ? '-0' : sourceIndex}`, () => {
    const input = catalog(sourceIndex);
    const result = buildCatalogIndexContract(input);
    assert.deepEqual(result.idByIndex, ['root']);
    assert.equal(result.sourceIndexByIndex[0], sourceIndex === 0 ? 0 : sourceIndex);
    assert.equal(result.parentIndexByIndex[0], -1);
    assert.equal(result.idToIndex.get('root'), 0);
    assert.equal(input.bodies[0].sourceIndex, sourceIndex);
  });
}
for (const sourceIndex of [-1, 1.5, NaN, Infinity, -Infinity, '1']) {
  test(`retain existing sourceIndex rejection: ${typeof sourceIndex}:${String(sourceIndex)}`, () => {
    assert.throws(() => buildCatalogIndexContract(catalog(sourceIndex)), /invalid sourceIndex/);
  });
}
test('out-of-range first worker init must not publish ready or later state', async () => {
  await withWorker((send, posted) => {
    assert.throws(() => send(structuredClone({ type: 'init', catalog: catalog(2147483648), simStartJd: JD, sequence: 0 })), /model worker init failed:.*invalid sourceIndex/);
    assert.deepEqual(posted, []);
    send({ type: 'tick', sequence: 1, simState: { julianDate: JD } });
    assert.deepEqual(posted, []);
  });
});
test('out-of-range worker reinit retains prior accepted catalog and sequence', async () => {
  await withWorker((send, posted) => {
    send({ type: 'init', catalog: catalog(7), simStartJd: JD, sequence: 0 });
    send({ type: 'tick', sequence: 1, simState: { julianDate: JD } });
    const replacement = { bodies: [{ id: 'replacement', sourceIndex: 4294967296, orbit: { ...orbit, aAu: 2 } }] };
    assert.throws(() => send(structuredClone({ type: 'init', catalog: replacement, simStartJd: JD, sequence: 100 })), /model worker init failed:.*invalid sourceIndex/);
    assert.equal(posted.length, 2);
    for (const sequence of [2, 101]) {
      const before: number = posted.length;
      send({ type: 'tick', sequence, simState: { julianDate: JD } });
      assert.equal(posted.length, before + 1);
      const state = posted.at(-1)! as ModelWorkerStateMessage;
      assert.equal(state.sequence, sequence);
      assert.equal(state.bodies.length, 6);
      assert.deepEqual([...state.availability], [1]);
      assert.deepEqual([...state.bodies.slice(0, 3)], [1, 0, 0]);
    }
  });
});
test('largest representable sparse sourceIndex remains accepted by worker', async () => {
  await withWorker((send, posted) => {
    send({ type: 'init', catalog: catalog(2147483647), simStartJd: JD, sequence: 0 });
    assert.deepEqual(posted, [{ type: 'ready', bodyCount: 1, schemaVersion: 2 }]);
    send({ type: 'tick', sequence: 1, simState: { julianDate: JD } });
    assert.equal(posted.length, 2);
    assert.deepEqual([...(posted[1] as ModelWorkerStateMessage).availability], [1]);
    assert.deepEqual([...(posted[1] as ModelWorkerStateMessage).bodies.slice(0, 3)], [1, 0, 0]);
  });
});
