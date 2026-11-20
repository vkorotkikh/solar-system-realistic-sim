import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, test, vi } from 'vitest';
import { SolarSystemModel, type SolarSystemCatalog } from './solarSystemModel';
import { createSolarSystemCatalog } from './catalog';
import type { KeplerOrbit } from './orbitMath';
import {
  buildCatalogIndexContract, buildModelWorkerCatalog,
  type ModelWorkerCatalog, type ModelWorkerCatalogBody, type ModelWorkerInboundMessage,
  type ModelWorkerOutboundMessage, type ModelWorkerReadyMessage, type ModelWorkerStateMessage,
} from '../workers/modelWorkerContract';

// FE-WORKER-PARENT /qa 2026-10-24: deliberate graph rejection at real public boundaries.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// Preserve the reviewed 68-case matrix; runtime-outside-type fixtures are compatibility controls.
type TestCatalog = ModelWorkerCatalog;
type Boundary = 'contract' | 'constructor' | 'worker';
type RuntimeBody = { id: unknown; parentId?: unknown; orbit?: KeplerOrbit | null; sourceIndex?: number };
type GraphFixture = [string, () => TestCatalog];
type ValidFixture = [string, () => TestCatalog, string[], number[], number[], number[] | null];
type CompatibleFixture = [string, () => { catalog: TestCatalog; parents: number[]; xs: number[] }];
const deliberateGraphError = (error: unknown) => error instanceof Error && !(error instanceof RangeError);

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

async function withWorker(run: (
  send: (message: ModelWorkerInboundMessage) => void,
  posted: ModelWorkerOutboundMessage[],
) => void | Promise<void>): Promise<void> {
  vi.resetModules();
  const posted: ModelWorkerOutboundMessage[] = [];
  const worker = {
    onmessage: null as ((event: { data: ModelWorkerInboundMessage }) => void) | null,
    postMessage: (message: ModelWorkerOutboundMessage) => posted.push(message),
  };
  vi.stubGlobal('self', worker);
  try {
    await import('../workers/modelWorker');
    assert.equal(typeof worker.onmessage, 'function');
    await run(data => worker.onmessage!({ data }), posted);
  } finally {
    vi.unstubAllGlobals();
    vi.resetModules();
  }
}

interface ConstructorChildResult {
  stdout: string;
  stderr: string;
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: NodeJS.ErrnoException;
  events: string[];
  closed: boolean;
}

async function runConstructorChild(): Promise<ConstructorChildResult> {
  const fixture = fileURLToPath(new URL('./__fixtures__/catalogParentGraphChild.cjs', import.meta.url));
  const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
  const child = fork(fixture, [repositoryRoot], {
    execPath: process.execPath,
    execArgv: ['--max-old-space-size=128'],
    cwd: repositoryRoot,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let phase: 'startup' | 'ready' | 'entered' = 'startup';
  let phaseTimer: ReturnType<typeof setTimeout> | undefined;
  let reapTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let failure: Error | undefined;
  let outputBytes = 0;
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  const events: string[] = [];
  let onMessage: (message: unknown) => void;
  let onError: (error: Error) => void;
  let onClose: (code: number | null, signal: NodeJS.Signals | null) => void;
  let onStdout: (chunk: Buffer) => void;
  let onStderr: (chunk: Buffer) => void;
  try {
    return await new Promise<ConstructorChildResult>((resolve, reject) => {
      const fail = (error: Error) => {
        failure ??= error;
        clearTimeout(phaseTimer);
        if (closed) { reject(failure); return; }
        if (child.exitCode === null && child.signalCode === null) {
          try { child.kill('SIGKILL'); } catch { /* Record the first failure; close remains mandatory. */ }
        }
        reapTimer ??= setTimeout(() => reject(new Error(
          `${failure!.message}; owned child ${child.pid ?? 'unspawned'} did not close within 2 seconds after kill`,
        )), 2000);
      };
      const collect = (chunks: Buffer[], chunk: Buffer) => {
        try {
          outputBytes += chunk.length;
          if (outputBytes > 1024 * 1024) { fail(new Error('owned constructor child exceeded 1 MiB combined output')); return; }
          chunks.push(chunk);
        } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
      };
      onStdout = chunk => collect(out, chunk);
      onStderr = chunk => collect(err, chunk);
      onError = error => fail(error);
      onMessage = message => {
        if (failure) return;
        try {
          if (!message || typeof message !== 'object' || Buffer.byteLength(JSON.stringify(message)) > 1024) {
            fail(new Error('invalid or oversized owned constructor child protocol message')); return;
          }
          const type = (message as { type?: unknown }).type;
          if (type === 'ready' && phase === 'startup') {
            phase = 'ready';
            events.push(type);
            child.send({ type: 'construct' }, error => { if (error) fail(error); });
          } else if (type === 'entered' && phase === 'ready') {
            phase = 'entered';
            events.push(type);
            clearTimeout(phaseTimer);
            phaseTimer = setTimeout(() => fail(new Error(
              'actual constructor did not complete within 1 second after entered IPC; child import completed',
            )), 1000);
          } else {
            fail(new Error(`unexpected owned constructor child protocol in ${phase}`));
          }
        } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
      };
      onClose = (code, signal) => {
        closed = true;
        clearTimeout(phaseTimer);
        clearTimeout(reapTimer);
        if (failure) {
          failure.message += `; owned child ${child.pid ?? 'unspawned'} closed (phase=${phase}, signal=${signal}); stdout=${Buffer.concat(out).toString('utf8').slice(0, 1024)}`;
          reject(failure);
          return;
        }
        if (phase !== 'entered') {
          reject(new Error(`owned constructor child closed before constructor entry (${phase}); code=${code}, signal=${signal}`));
          return;
        }
        resolve({ stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'),
          status: code, signal, error: undefined, events, closed });
      };
      child.on('error', onError);
      child.on('message', onMessage);
      child.on('close', onClose);
      child.stdout!.on('data', onStdout);
      child.stderr!.on('data', onStderr);
      phaseTimer = setTimeout(() => fail(new Error(
        `owned constructor child startup/entry exceeded 10 seconds (${phase}); no constructor timeout claim`,
      )), 10000);
    });
  } finally {
    clearTimeout(phaseTimer);
    clearTimeout(reapTimer);
    if (!closed && child.exitCode === null && child.signalCode === null) {
      try { child.kill('SIGKILL'); } catch { /* The rejected forced-close bound reports unconfirmed cleanup. */ }
    }
    const removeOwnedListeners = () => {
      child.off('message', onMessage!);
      child.off('error', onError!);
      child.off('close', onClose!);
      child.stdout?.off('data', onStdout!);
      child.stderr?.off('data', onStderr!);
    };
    if (closed) removeOwnedListeners();
    else child.once('close', removeOwnedListeners);
  }
}

const JD = 2451545;
const orbit: KeplerOrbit = { epochJd: JD, aAu: 1, e: 0, periodDays: 365.25, meanAnomalyDeg: 0 };
const asWorker = (bodies: RuntimeBody[]): TestCatalog => ({ bodies: bodies.map((body, index) => ({ sourceIndex: index * 2, orbit: null, ...body })) }) as unknown as TestCatalog;
const chain = (count: number): ModelWorkerCatalogBody[] => Array.from({ length: count }, (_, i) => ({
  id: `body${i}`, parentId: i ? `body${i - 1}` : null, orbit: i ? orbit : null, sourceIndex: i * 2,
}));
const unsafe: GraphFixture[] = [
  ['dangling-orbital', () => asWorker([{ id: 'child', parentId: 'absent', orbit }])],
  ['dangling-orbitless', () => asWorker([{ id: 'child', parentId: 'absent', orbit: null }])],
  ['self-cycle', () => asWorker([{ id: 'self', parentId: 'self', orbit: null }])],
  ['two-body-cycle', () => asWorker([{ id: 'a', parentId: 'b', orbit }, { id: 'b', parentId: 'a', orbit }])],
  ['duplicate-roots', () => asWorker([{ id: 'same', orbit: null }, { id: 'same', orbit }])],
  ['deep-cycle', () => { const bodies = chain(12000); bodies[0].parentId = 'body11999'; return { bodies }; }],
  ['filtered-required-parent', () => buildModelWorkerCatalog([
    { id: 'root', type: 'planet', orbit: null },
    { id: 'hidden', type: 'moon', parentId: 'root', orbit },
    { id: 'retained', type: 'asteroid', parentId: 'hidden', orbit },
  ])],
];
const boundaries: Boundary[] = ['contract', 'constructor', 'worker'];
for (const [name, fixture] of unsafe) {
  for (const boundary of boundaries) {
    test(`reject unsafe ${name} at public ${boundary} boundary`, async () => {
      const catalog = fixture();
      const before = JSON.stringify(catalog);
      if (boundary === 'contract') {
        assert.throws(() => buildCatalogIndexContract(catalog), Error);
        assert.throws(() => buildCatalogIndexContract(catalog), deliberateGraphError);
      }
      else if (boundary === 'constructor') {
        assert.throws(() => new SolarSystemModel(catalog as unknown as SolarSystemCatalog), Error);
        assert.throws(() => new SolarSystemModel(catalog as unknown as SolarSystemCatalog), deliberateGraphError);
      }
      else await withWorker((send, posted) => {
        assert.throws(() => send({ type: 'init', catalog, simStartJd: JD, sequence: 0 }), /model worker init failed/);
        assert.deepEqual(posted, []);
        send({ type: 'tick', sequence: 1, simState: { julianDate: JD } });
        assert.deepEqual(posted, []);
      });
      assert.equal(JSON.stringify(catalog), before);
    });
  }
}
const valid: ValidFixture[] = [
  ['empty', () => ({ bodies: [] }), [], [], [], null],
  ['multiple-roots-child-first', () => ({ bodies: [
    { id: 'child', sourceIndex: 7, parentId: 'rootA', orbit },
    { id: 'rootB', sourceIndex: 2, orbit: null },
    { id: 'rootA', sourceIndex: 42, orbit },
  ] }), ['child', 'rootB', 'rootA'], [7, 2, 42], [2, -1, -1], [2, 0, 0]],
  ['filtered-source-gaps', () => buildModelWorkerCatalog([
    { id: 'sun', type: 'star', orbit: null },
    { id: 'earth', type: 'planet', parentId: 'sun', orbit },
    { id: 'moon', type: 'moon', parentId: 'earth', orbit },
    { id: 'pluto', type: 'dwarf', parentId: 'sun', orbit },
  ]), ['sun', 'earth', 'pluto'], [0, 1, 3], [-1, 0, 0], [0, 0, 0]],
  ['included-required-moon-parent', () => buildModelWorkerCatalog([
    { id: 'root', type: 'planet', orbit: null },
    { id: 'moon', type: 'moon', parentId: 'root', orbit },
    { id: 'retained', type: 'asteroid', parentId: 'moon', orbit },
  ], { includeMoons: true }), ['root', 'moon', 'retained'], [0, 1, 2], [-1, 0, 1], [0, 0, 0]],
];
for (const [name, fixture, ids, sourceIndices, parentIndices, firstPosition] of valid) {
  for (const boundary of boundaries) {
    test(`preserve valid ${name} at public ${boundary} boundary`, async () => {
      const catalog = fixture();
      const before = JSON.stringify(catalog);
      if (boundary === 'contract') {
        const contract = buildCatalogIndexContract(catalog);
        assert.deepEqual(contract.idByIndex, ids);
        assert.deepEqual([...contract.sourceIndexByIndex], sourceIndices);
        assert.deepEqual([...contract.parentIndexByIndex], parentIndices);
        assert.equal(contract.idToIndex.size, ids.length);
      } else if (boundary === 'constructor') {
        const model = new SolarSystemModel(catalog as unknown as SolarSystemCatalog);
        assert.deepEqual(model.getBodies().map(body => body.id), ids);
        model.update(JD);
        assert.equal(model.getBodies().every(body => model.getState(body.id)!.available), true);
        if (ids.length) assert.deepEqual(model.getWorldPosition(ids[0])!.toArray(), firstPosition);
      } else await withWorker((send, posted) => {
        send({ type: 'init', catalog, simStartJd: JD, sequence: 0 });
        assert.deepEqual(posted, [{ type: 'ready', bodyCount: ids.length, schemaVersion: 2 }]);
        send({ type: 'tick', sequence: 1, simState: { julianDate: JD } });
        assert.equal(posted.length, 2);
        assert.equal((posted[1] as ModelWorkerStateMessage).type, 'state');
        assert.equal((posted[1] as ModelWorkerStateMessage).bodies.length, ids.length * 6);
        assert.deepEqual([...(posted[1] as ModelWorkerStateMessage).availability], ids.map(() => 1));
        if (ids.length) assert.deepEqual([...(posted[1] as ModelWorkerStateMessage).bodies.slice(0, 3)], firstPosition);
      });
      assert.equal(JSON.stringify(catalog), before);
    });
  }
}
for (const boundary of boundaries) {
  test(`preserve reversed 12000-body valid chain at ${boundary} boundary`, async () => {
    const catalog = { bodies: chain(12000).reverse() };
    if (boundary === 'contract') {
      const contract = buildCatalogIndexContract(catalog);
      assert.equal(contract.idToIndex.size, 12000);
      assert.equal(contract.idByIndex[0], 'body11999');
      assert.equal(contract.parentIndexByIndex[0], 1);
      assert.equal(contract.parentIndexByIndex[11999], -1);
      assert.equal(contract.sourceIndexByIndex[0], 23998);
    } else if (boundary === 'constructor') {
      const model = new SolarSystemModel(catalog as unknown as SolarSystemCatalog);
      model.update(JD);
      assert.deepEqual(model.getWorldPosition('body11999')!.toArray(), [11999, 0, 0]);
    } else await withWorker((send, posted) => {
      send({ type: 'init', catalog, simStartJd: JD, sequence: 0 });
      send({ type: 'tick', sequence: 1, simState: { julianDate: JD } });
      assert.equal((posted[0] as ModelWorkerReadyMessage).bodyCount, 12000);
      assert.equal((posted[1] as ModelWorkerStateMessage).bodies.length, 72000);
      assert.equal((posted[1] as ModelWorkerStateMessage).availability.every(value => value === 1), true);
      assert.deepEqual([...(posted[1] as ModelWorkerStateMessage).bodies.slice(0, 3)], [11999, 0, 0]);
    });
  });
}
for (const includeMoons of [false, true]) {
  test(`shipped catalog remains valid: includeMoons=${includeMoons}`, async () => {
    const source = createSolarSystemCatalog();
    const catalog = buildModelWorkerCatalog(source.bodies, { includeMoons });
    const count = includeMoons ? 433 : 10;
    assert.equal(catalog.bodies.length, count);
    const contract = buildCatalogIndexContract(catalog);
    assert.equal(contract.idToIndex.size, count);
    assert.deepEqual(contract.idByIndex, catalog.bodies.map(body => body.id));
    assert.deepEqual([...contract.sourceIndexByIndex], catalog.bodies.map(body => body.sourceIndex));
    assert.equal(catalog.bodies.every(body => !body.parentId || contract.idToIndex.has(body.parentId)), true);
    const model = new SolarSystemModel(catalog as unknown as SolarSystemCatalog);
    assert.doesNotThrow(() => model.update(JD));
    await withWorker((send, posted) => {
      send({ type: 'init', catalog, simStartJd: JD, sequence: 0 });
      send({ type: 'tick', sequence: 1, simState: { julianDate: JD } });
      assert.equal((posted[0] as ModelWorkerReadyMessage).bodyCount, count);
      assert.equal((posted[1] as ModelWorkerStateMessage).bodies.length, count * 6);
      assert.deepEqual([...(posted[1] as ModelWorkerStateMessage).availability], catalog.bodies.map(body => model.getState(body.id)!.available ? 1 : 0));
      if (!includeMoons) assert.equal((posted[1] as ModelWorkerStateMessage).availability.every(value => value === 1), true);
    });
  });
}
for (const sourceIndex of [-1, 1.5, NaN, Infinity]) {
  test(`existing sourceIndex rejection remains: ${String(sourceIndex)}`, async () => {
    assert.throws(() => buildCatalogIndexContract({ bodies: [{ id: 'root', orbit: null, sourceIndex }] }), /invalid sourceIndex/);
  });
}
test('reachable duplicate cannot hang the actual constructor (bounded owned child)', async () => {
  const result = await runConstructorChild();
  assert.match(result.stdout, /ENTERING_ACTUAL_CONSTRUCTOR/);
  assert.equal(result.error, undefined, `constructor did not complete: ${result.error?.code}`);
  assert.equal(result.status, 0, `constructor child ended with signal ${result.signal}`);
  const last = result.stdout.trim().split('\n').at(-1)!;
  const value = JSON.parse(last);
  assert.equal(value.rejected, true);
  assert.notEqual(value.name, 'RangeError', 'reject identity before overflowing or exhausting the traversal');
  assert.equal(value.isError, true);
  assert.equal(value.isRangeError, false);
  assert.equal(result.signal, null);
  assert.deepEqual(result.events, ['ready', 'entered']);
  assert.equal(result.closed, true);
}, 15000);

// Reviewed 25-case supplement; original43 assertions and fixtures above are retained.
const reviewUnsafe: GraphFixture[] = [
  ['healthy-root-plus-disconnected-cycle', () => asWorker([
    {id:'healthy-root',orbit:null}, {id:'healthy-child',parentId:'healthy-root',orbit},
    {id:'cycle-a',parentId:'cycle-b',orbit}, {id:'cycle-b',parentId:'cycle-a',orbit},
  ])],
  ['duplicate-runtime-falsy-id-zero', () => asWorker([
    {id:0,orbit:null}, {id:0,orbit},
  ])],
];
for (const [name, fixture] of reviewUnsafe) {
  for (const boundary of boundaries) {
    test('review reject ' + name + ' at ' + boundary, async () => {
      const catalog = fixture();
      const before = structuredClone(catalog);
      if (boundary === 'contract') {
        assert.throws(() => buildCatalogIndexContract(catalog), Error);
        assert.throws(() => buildCatalogIndexContract(catalog), deliberateGraphError);
      }
      else if (boundary === 'constructor') {
        assert.throws(() => new SolarSystemModel(catalog as unknown as SolarSystemCatalog), Error);
        assert.throws(() => new SolarSystemModel(catalog as unknown as SolarSystemCatalog), deliberateGraphError);
      }
      else await withWorker((send, posted) => {
        assert.throws(() => send(structuredClone({type:'init',catalog,simStartJd:JD,sequence:0})),
          /model worker init failed/);
        assert.deepEqual(posted, []);
        send({type:'tick',sequence:1,simState:{julianDate:JD}});
        assert.deepEqual(posted, []);
      });
      assert.deepEqual(catalog, before);
    });
  }
}
const reviewCompatible: CompatibleFixture[] = [
  ['runtime-outside-declared-string-domain-single-root-identities', () => {
    const ids = ['', ' ', 0, false, null, undefined, {owned:'opaque-id'}];
    return {catalog:{bodies:ids.map((id,i) => ({id,sourceIndex:i*3+1,orbit}))} as unknown as TestCatalog,
      parents:ids.map(() => -1), xs:ids.map(() => 1)};
  }],
  ['runtime-outside-declared-string-domain-falsy-parents-stay-roots', () => {
    const ids = [undefined,null,'',0,false];
    const rows: RuntimeBody[] = ids.map(id => ({id,orbit}));
    for (let i=0;i<ids.length;i++) rows.push({id:'falsy-parent-child-'+i,parentId:ids[i],orbit});
    return {catalog:asWorker(rows),parents:rows.map(() => -1),xs:rows.map(() => 1)};
  }],
  ['opaque-exact-space-case-unicode-identities', () => ({
    catalog:asWorker([
      {id:' ',orbit}, {id:'A',parentId:' ',orbit},
      {id:'a',parentId:'A',orbit}, {id:'天体',parentId:'a',orbit},
    ]), parents:[-1,0,1,2], xs:[1,2,3,4],
  })],
  ['runtime-outside-declared-string-domain-shared-object-identity-parent', () => {
    const id = {owned:'shared-identity'};
    return {catalog:asWorker([{id,orbit},{id:'child',parentId:id,orbit}]),
      parents:[-1,0],xs:[1,2]};
  }],
];
async function reviewCheckCompatible(catalog: TestCatalog, boundary: Boundary, parents: number[], xs: number[]) {
  const rows = [...catalog.bodies];
  const bodyArray = catalog.bodies;
  const before = structuredClone(catalog);
  const ids = catalog.bodies.map(b => b.id);
  const sources = catalog.bodies.map(b => b.sourceIndex);
  for (const row of catalog.bodies) Object.freeze(row);
  Object.freeze(catalog.bodies);
  if (boundary === 'contract') {
    const contract = buildCatalogIndexContract(catalog);
    assert.deepEqual(contract.idByIndex, ids);
    assert.deepEqual([...contract.sourceIndexByIndex], sources);
    assert.deepEqual([...contract.parentIndexByIndex], parents);
    assert.equal(contract.idToIndex.size, ids.length);
    ids.forEach((id,i) => {
      assert.strictEqual(contract.idByIndex[i],id);
      assert.equal(contract.idToIndex.get(id),i);
    });
  } else if (boundary === 'constructor') {
    const model = new SolarSystemModel(catalog as unknown as SolarSystemCatalog);
    assert.strictEqual(model.getBodies(), bodyArray);
    model.update(JD);
    ids.forEach((id,i) => {
      assert.equal(model.getState(id)!.available,true);
      assert.deepEqual(model.getWorldPosition(id)!.toArray(),[xs[i],0,0]);
    });
  } else await withWorker((send, posted) => {
    send(structuredClone({type:'init',catalog,simStartJd:JD,sequence:0}));
    assert.deepEqual(posted,[{type:'ready',bodyCount:ids.length,schemaVersion:2}]);
    send({type:'tick',sequence:1,simState:{julianDate:JD}});
    assert.equal(posted.length,2);
    assert.deepEqual([...(posted[1] as ModelWorkerStateMessage).availability],ids.map(() => 1));
    assert.equal((posted[1] as ModelWorkerStateMessage).bodies.length,ids.length*6);
    xs.forEach((x,i) => assert.deepEqual([...(posted[1] as ModelWorkerStateMessage).bodies.slice(i*6,i*6+3)],[x,0,0]));
  });
  assert.strictEqual(catalog.bodies,bodyArray);
  rows.forEach((row,i) => assert.strictEqual(catalog.bodies[i],row));
  assert.deepEqual(catalog,before);
}
for (const [name,fixture] of reviewCompatible) {
  for (const boundary of boundaries) {
    test('review compatibility ' + name + ' at ' + boundary, async () => {
      const {catalog,parents,xs}=fixture();
      await reviewCheckCompatible(catalog,boundary,parents,xs);
    });
  }
}
for (const sourceIndex of [-1,1.5]) {
  test('review sourceIndex precedence survives mixed dangling graph: '+sourceIndex, async () => {
    const catalog={bodies:[{id:'dangling',parentId:'missing',orbit,sourceIndex}]};
    assert.throws(() => buildCatalogIndexContract(catalog), /invalid sourceIndex/);
  });
}
async function reviewRetainedPriorAfterRejectedInit(catalog: TestCatalog) {
  await withWorker((send, posted) => {
    const deliver = (message: ModelWorkerInboundMessage) => send(structuredClone(message));
    deliver({type:'init',catalog:{bodies:[{id:'prior',sourceIndex:7,orbit}]},simStartJd:JD,sequence:0});
    deliver({type:'tick',sequence:1,simState:{julianDate:JD}});
    assert.equal(posted.length,2);
    assert.deepEqual([...(posted[1] as ModelWorkerStateMessage).bodies.slice(0,3)],[1,0,0]);
    assert.throws(() => deliver({type:'init',catalog,simStartJd:JD,sequence:100}),/model worker init failed/);
    assert.equal(posted.length,2,'early rejected reinit must not publish new ready');
    for (const sequence of [2,101]) {
      const before: number = posted.length;
      deliver({type:'tick',sequence,simState:{julianDate:JD}});
      assert.equal(posted.length,before+1);
      const state = posted.at(-1)! as ModelWorkerStateMessage;
      assert.equal(state.type,'state');
      assert.equal(state.sequence,sequence);
      assert.equal(state.schemaVersion,2);
      assert.equal(state.tickJd,JD);
      assert.equal(state.bodies.length,6);
      assert.deepEqual([...state.availability],[1]);
      assert.deepEqual([...state.bodies.slice(0,3)],[1,0,0]);
    }
  });
}
for (const [name,fixture] of [
  ['dangling', () => asWorker([{id:'new',parentId:'missing',orbit}])],
  ...reviewUnsafe,
] as GraphFixture[]) {
  test('review reject graph reinit retains prior valid state and sequence: '+name, async () => {
    await reviewRetainedPriorAfterRejectedInit(fixture());
  });
}
test('review compatibility invalid sourceIndex reinit retains prior state and sequence', async () => {
  await reviewRetainedPriorAfterRejectedInit({bodies:[{id:'new',sourceIndex:-1,orbit}]});
});
test('review compatibility valid reinit replaces catalog and retains sequence gate', async () => {
  await withWorker((send, posted) => {
    const deliver = (message: ModelWorkerInboundMessage) => send(structuredClone(message));
    deliver({type:'init',catalog:{bodies:[{id:'prior',sourceIndex:0,orbit}]},simStartJd:JD,sequence:0});
    deliver({type:'tick',sequence:1,simState:{julianDate:JD}});
    const next={bodies:[
      {id:'next-a',sourceIndex:7,orbit:{...orbit,aAu:2}},
      {id:'next-b',sourceIndex:9,orbit:{...orbit,aAu:3}},
    ]};
    deliver({type:'init',catalog:next,simStartJd:JD,sequence:100});
    assert.deepEqual(posted.at(-1),{type:'ready',bodyCount:2,schemaVersion:2});
    assert.equal(posted.length,3);
    deliver({type:'tick',sequence:2,simState:{julianDate:JD}});
    assert.equal(posted.length,3);
    deliver({type:'tick',sequence:101,simState:{julianDate:JD}});
    assert.equal(posted.length,4);
    assert.equal((posted[3] as ModelWorkerStateMessage).sequence,101);
    assert.equal((posted[3] as ModelWorkerStateMessage).bodies.length,12);
    assert.deepEqual([...(posted[3] as ModelWorkerStateMessage).availability],[1,1]);
    assert.deepEqual([...(posted[3] as ModelWorkerStateMessage).bodies.slice(0,3)],[2,0,0]);
    assert.deepEqual([...(posted[3] as ModelWorkerStateMessage).bodies.slice(6,9)],[3,0,0]);
  });
});
