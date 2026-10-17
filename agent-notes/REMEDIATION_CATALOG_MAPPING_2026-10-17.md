# SCN-005: mapped catalog decoding CPU evidence, 2026-10-17

## Scope and conclusion

Base: `ec9d184`, branch `fix/scn005-startup-20261017`. This bounded loader
change removes the retained intermediate 100,000-record ACBF catalog and the
extra per-record source-shape copy. The binary reader can map each validated
record directly into its consumer representation. Existing callers still
receive ordinary decoded records. ASPH v1/v2 use the same final conversion;
identity and field semantics are unchanged.

SCN-005 remains open. These are isolated Node CPU diagnostics, not browser
startup acceptance. The full application still has the independently diagnosed
synchronous shader-initialization stall. No main entry, startup presentation,
record count, binary data, SHA-256 check, metadata/schema validation, cache,
abort/deadline behavior, or 2,000 ms fetch-to-parse/hash metric changed here.
The improvement does not defer content or substitute a procedural preview.

## Reproduction and root cause

A fresh actual-loader profile under Node **22.23.2** used the committed
3,600,012-byte `public/data/asteroid-phase1/asteroid_phase1_main_100000.bin` and
its metadata. Vite SSR loaded the production modules; in-memory `Response`
objects supplied the actual bytes. Every load used `cache: false` and
`maxRecords: 100000`, with the default unchanged budget. No browser, GPU,
backend or network transport was used.

The initial 25-load CPU sample attributed 234.653 ms self-time to
`parseAcbfRecord`, 218.666 ms to garbage collection, 144.107 ms to binary
decoding and 52.970 ms to `parseOrbitCatalog`. These sampled totals identify
allocation/conversion work, not exact stage durations or hardware browser
predictions. The old path retained a full decoded object array, constructed a
second source-shape object per record and then created final render records.

The first mapped implementation reduced sampled heap growth but did **not**
show a timing win (initial warmed medians 18.776 ms baseline, 21.642 ms mapped).
That was not reported as a speedup. The final implementation also removes the
redundant source-shape conversion. Fresh-process alternating comparisons below
measure that final implementation against the exact base sources.

## Before/after evidence

Each process performed one cold load, three more warmup loads, then 15 measured
uncached loads. An explicit GC occurred before each measured load, outside the
production timer. Heap growth is the process heap delta sampled around a load;
it is **not** a measured peak or retained-memory guarantee. CPU profiling ran
later, separately from these samples. Baseline modules were supplied from
`git show ec9d184:<path>` by a Vite load plugin; all other code and inputs were
identical. Process order was A baseline, A candidate, B candidate, B baseline,
C baseline, C candidate.

| Process | Cold load ms | Warm min / median / max ms | Median sampled heap growth bytes |
| --- | ---: | --- | ---: |
| Baseline A | 122.076 | 18.079 / 25.316 / 50.946 | 71,371,632 |
| Candidate A | 72.254 | 15.147 / 21.050 / 29.613 | 40,312,264 |
| Candidate B | 59.586 | 14.712 / 17.858 / 28.203 | 39,671,592 |
| Baseline B | 118.380 | 20.572 / 25.048 / 37.725 | 68,581,952 |
| Baseline C | 114.574 | 17.104 / 19.168 / 36.782 | 71,211,800 |
| Candidate C | 50.467 | 14.269 / 17.322 / 23.168 | 40,239,208 |

All loads accepted exactly 100,000 source/selected records. Every compared
process produced the same SHA-256 over `JSON.stringify(result.asteroids)`,
covering all final fields and their ordering:
`9cffbd4a811107996df9d2c046f23c276931e32976b05b33c84ba857972408d4`.
The binary SHA-256 was unchanged:
`f4debc48eea13a3be43eb69d7d70e8920ece7aa5e7e6dd0490c870bc83cb222a`.

These measurements were **not exclusive**. Host load averages ranged from
approximately 14.71/10.86/7.30 to 16.88/11.06/7.30 during the alternating runs;
a separate browser suite was active and the coordinator was notified. The
consistent allocation decrease and cold/warm direction justify the bounded
change; percentages or a browser speedup guarantee are not inferred.

## Correctness and validation

The mapped-decoding regression was written first. On unchanged production
code it failed because the reader returned raw records instead of transformed
consumer records (1 failed, 16 passed). Literal hand-encoded ACBF bytes provide
the expected field oracle independently of the binary writer. Coverage verifies
prefix selection with original header count, complete-buffer validation before
callback delivery, stable row order and independent callback records. ASPH v1/v2
compatibility cases preserve source IDs and exact orbital fields. Existing
integrity, deadlines, retries, caching, and the 2,001 ms latency-failure test remain.

Validation used the pinned executable at
`/home/nomad/.npm/_npx/f4985f1adc097c41/node_modules/node/bin/node`.
`node_modules` was reused only after `cmp package-lock.json` against the source
worktree passed; no package/lockfile was changed.

- Complete default frontend: **748 passed, 413 skipped**, 72 files passed and
  1 skipped. Skips retain the 411 unqualified moon records and 2 opt-in EGL
  cases. `PLANET_SHADER_GPU_TEST` was unset; no GPU claim is made.
- Strict TypeScript: exit 0, no diagnostics.
- Production build: exit 0; 68 modules; main chunk 969.19 kB / 249.32 kB gzip;
  model worker 26.13 kB. Existing >500 kB warning remains.
- `git diff --check`: exit 0.

Commands:

```sh
export PATH=/home/nomad/.npm/_npx/f4985f1adc097c41/node_modules/node/bin:$PATH
env -u PLANET_SHADER_GPU_TEST node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit --strict --pretty false
node node_modules/vite/bin/vite.js build
```

Immediate raw evidence is in `/tmp/scn005-*-20261017.json`, corresponding
`.cpuprofile` files, and `/tmp/scn005-{red,full-frontend,strict-types,build}-20261017.log`.
The reproducible diagnostic harness is preserved below rather than treating
those temporary paths as permanent artifacts.

## Diagnostic harness

Save the following as `/tmp/scn005-catalog-probe-20261017.mjs`. From the repository,
prepare the exact baseline inputs and run sequentially with pinned Node:

```sh
mkdir -p /tmp/scn005-baseline-source-20261017/src/data /tmp/scn005-baseline-source-20261017/src/sim
git show ec9d184:src/data/asteroidCatalogLoader.ts > /tmp/scn005-baseline-source-20261017/src/data/asteroidCatalogLoader.ts
git show ec9d184:src/sim/phase1AsteroidCatalog.ts > /tmp/scn005-baseline-source-20261017/src/sim/phase1AsteroidCatalog.ts
node --expose-gc /tmp/scn005-catalog-probe-20261017.mjs baseline-a baseline
node --expose-gc /tmp/scn005-catalog-probe-20261017.mjs candidate-a
node --expose-gc /tmp/scn005-catalog-probe-20261017.mjs candidate-b
node --expose-gc /tmp/scn005-catalog-probe-20261017.mjs baseline-b baseline
node --expose-gc /tmp/scn005-catalog-probe-20261017.mjs baseline-c baseline
node --expose-gc /tmp/scn005-catalog-probe-20261017.mjs candidate-c
```

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { Session } from 'node:inspector/promises';
import os from 'node:os';
const root = process.cwd();
const label = process.argv[2] ?? 'probe';
const useBaseline = process.argv[3] === 'baseline';
const { createServer } = await import(pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js')));
const server = await createServer({ root, configFile: false, appType: 'custom', server: { middlewareMode: true }, plugins: useBaseline ? [{ name: 'baseline-source', enforce: 'pre', async load(id) { for (const file of ['src/data/asteroidCatalogLoader.ts', 'src/sim/phase1AsteroidCatalog.ts']) { if (id === path.join(root, file)) return fs.readFile(path.join('/tmp/scn005-baseline-source-20261017', file), 'utf8'); } } }] : [] });
try {
  const { loadPhase1AsteroidCatalog } = await server.ssrLoadModule('/src/sim/phase1AsteroidCatalog.ts');
  const { readAsteroidCatalogBinary } = await server.ssrLoadModule('/src/data/asteroidCatalogLoader.ts');
  const binary = await fs.readFile('public/data/asteroid-phase1/asteroid_phase1_main_100000.bin');
  const meta = await fs.readFile('public/data/asteroid-phase1/asteroid_phase1_main_100000.meta.json', 'utf8');
  const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
  globalThis.fetch = async url => new Response(String(url).endsWith('.bin') ? binary : meta);
  const options = { cache: false, maxRecords: 100000 };
  const report = { label, node: process.version, loadStart: os.loadavg(), binaryBytes: binary.byteLength, binarySha256: createHash('sha256').update(binary).digest('hex'), warmupRuns: 4, samples: [], decodeMs: [] };
  const cold = await loadPhase1AsteroidCatalog(options); report.coldLoadMs = cold.loadMs;
  for (let i=1; i<4; i++) await loadPhase1AsteroidCatalog(options);
  for (let i=0; i<15; i++) {
    globalThis.gc?.();
    const before = process.memoryUsage().heapUsed;
    const result = await loadPhase1AsteroidCatalog(options);
    report.samples.push({ loadMs: result.loadMs, heapDeltaBytes: process.memoryUsage().heapUsed - before, accepted: result.accepted, sourceCount: result.sourceCount, loadedCount: result.loadedCount, checksumActual: result.checksumActual });
    if (i===0) report.asteroidsSha256 = createHash('sha256').update(JSON.stringify(result.asteroids)).digest('hex');
  }
  for (let i=0; i<15; i++) {
    globalThis.gc?.();
    const start = performance.now();
    const result = readAsteroidCatalogBinary(arrayBuffer);
    report.decodeMs.push(performance.now()-start);
    if (result.records.length!==100000) throw new Error('wrong decode count');
  }
  const session = new Session(); session.connect();
  await session.post('Profiler.enable'); await session.post('Profiler.setSamplingInterval', { interval: 100 }); await session.post('Profiler.start');
  for (let i=0; i<25; i++) await loadPhase1AsteroidCatalog(options);
  const { profile } = await session.post('Profiler.stop'); session.disconnect();
  const idToNode = new Map(profile.nodes.map(n=>[n.id,n])); const hits = new Map();
  for (let i=0; i<profile.samples.length; i++) {
    const node = idToNode.get(profile.samples[i]); const key = `${node.callFrame.functionName} ${node.callFrame.url}:${node.callFrame.lineNumber+1}`;
    hits.set(key, (hits.get(key)??0) + profile.timeDeltas[i]);
  }
  report.profileTopSelfMs = [...hits].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([frame,us])=>({frame,ms:us/1000}));
  report.loadEnd=os.loadavg();
  await fs.writeFile(`/tmp/scn005-${label}-20261017.json`,JSON.stringify(report,null,2)+'\n');
  await fs.writeFile(`/tmp/scn005-${label}-20261017.cpuprofile`,JSON.stringify(profile));
  console.log(JSON.stringify(report,null,2));
} finally { await server.close(); }
```
