# SCN-043 independent lazy-promotion review, 2026-10-15

Reviewed the author's uncommitted changes in
`/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris`,
at HEAD `86ac5fe0bad35d5bed4a2a18df82cfc6d453d6f6`.

The two findings below were accepted and reported to the user. **Repairs are
on hold pending the user's asynchronous approval.** This document records
evidence only; it does not authorize repairs or bulk-asset staging/commit.
The review made no source, asset, or pin changes. Writing this note was
separately authorized. No probes were rerun to prepare the note.

## Important findings

### P2: Missing or failed independent-accuracy evidence is accepted

Location: [lazyMoonEphemerides.ts:183](/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/src/sim/lazyMoonEphemerides.ts:183).
The lazy loader validates identity, coverage, and declared caps after invoking
the existing parser, but does not enforce the new `validation.vectorOracle`
certificate. The existing parser checks aggregate held-out error maxima and
endpoint identities, without bounding each endpoint's reported error.

Read-only probes used the actual Amalthea artifact, changed only certification
metadata, and recomputed the shard digest, filename, and exact byte count in
the returned manifest. All three controls were accepted:

- Delete `validation.vectorOracle` entirely.
- Set both independent vector-oracle error maxima to `1e9`.
- Set the first coverage endpoint's position error to `1e9`.

Amalthea's unchanged limits are 181.4 km and 10 m/s. These controls demonstrate
a semantic rejection gap despite successful content-address verification.
The sampled current artifacts themselves contained consistent evidence.

A correction should require the independent certificate, its expected alias
IDs and seven samples per alias, and valid error statistics within the fixed
caps; individual endpoint errors also need enforcement. No correction was made.

### P2: Early response rejection does not cancel the response body

Location: [lazyMoonEphemerides.ts:118](/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/src/sim/lazyMoonEphemerides.ts:118).
HTTP-status and advertised-size rejection occur before acquiring a stream
reader and do not cancel the body. `withSlot` then releases its concurrency
permit. An underlying transfer can remain active outside that accounting.

The reproduced case used oversized Content-Length headers and
`maxConcurrentRequests: 1`: three sequential rejected loads created three
response streams, with **zero cancellation calls**. HTTP-status rejection has
the same cleanup omission by inspection; that variant was not separately probed.
This was a controlled Response/ReadableStream reproduction, not a deployed
HTTP/socket measurement.

A correction should cancel or abort rejected response bodies before releasing
their permit and cover that cleanup with a regression test. No correction was made.

## Independently checked scope and accounting

- The index has 424 unique catalog record IDs, 411 lazy records, and 410 lazy
  model entries; its five base artifacts contain 13 models, for 423 models total.
- Puck retains IDs 378 and 388, both NAIF 715 around center 799, sharing one
  shard with the stricter 86.004 km position limit and 10 m/s velocity limit.
- All 410 lazy entries were cross-checked against catalog IDs, target/center,
  recipe identity, source-ephemeris identity, fixed caps, and declared coverage.
- Lazy coverage remains JDTDB `[2451545, 2469807.5]`. Position limits remain
  `min(500 km, 0.001 * catalog aKm)`, taking the minimum across aliases;
  velocity remains 10 m/s.
- The index is 303149 bytes, below 1048576 bytes. The largest shard, Metis,
  is 1624520 bytes, below 2097152 bytes. All declared shard sizes were checked
  against filesystem sizes. The 410 shards total 59955387 bytes; with the
  index, published assets total 60258536 bytes.
- The index's source-manifest hash matches the actual 5119933-byte manifest.
  Its 410 recipes reference 330929304 bytes of compressed archives. Archive
  filenames and filesystem sizes were checked without reading their payloads.
- Metadata accounting covers 1370 original response records, 3950260 retained
  training rows, 3949393 held-out rows, and 820 exact endpoint rows. Encoded
  query hashes, query parameter consistency, provider signatures, target/center
  IDs, and response-to-retained row counts were checked across the recipes.
- Actual bytes for three selected shards, Amalthea, Puck, and Metis, matched
  their index hashes. Their normalized-input and source/held-out row digest
  references matched the corresponding recipes.
- All five base artifacts matched their index digests and retained the original
  13-model set. They were unchanged in the reviewed worktree status; the
  generator retains its explicit reviewed base-hash guards.
- The all-catalog test preserves the accuracy-cap formulas and removes the
  former conditional skips. Both Puck reference records remain represented.
- Source inspection found no acquisition call on the new normal offline build
  path. The capture parser checks target, center, numerical source, frame,
  units, and finite rows. The generator enforces disjoint training epochs and
  fixed provider/oracle accuracy gates before publication.
- Cache accounting is for serialized JSON bytes: 8 MiB default, configurable
  through 32 MiB, with in-flight deduplication and LRU retention. It is not a
  JavaScript heap or caller-retained memory limit. The loader returns immutable
  models and does not itself apply an epoch-specific state or selection.

Observed manifest digests:

```text
scripts/moon-lazy-inputs/manifest.json
235714411f6ec2bd897608b1fbd6cea8cdaddb3ba810fa3f9938f41550869b0d
public/moon-ephemerides/manifest.json
2e40645b28e180337c791493fafae884d6d9e81700c8d0aa23abc2721783cf91
```

## Reproduction command

This reproduces the same boundary probes used in the review. It reads the
current TypeScript sources, catalog, public index, and one shard; TypeScript
transpilation and mutations happen only in memory. It writes no files, performs
no network requests, and does not read the compressed source archives. Run only
when a rerun is desired; it was not rerun while writing this note.

```bash
cd /home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris
/home/nomad/.npm/_npx/f4985f1adc097c41/node_modules/node/bin/node --input-type=module <<'SCN043_READ_ONLY_PROBES'
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(process.cwd() + '/package.json');
const ts = require('typescript');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const catalog = JSON.parse(await readFile('src/data/moons.json', 'utf8'));
const indexRaw = await readFile('public/moon-ephemerides/manifest.json');
const index = JSON.parse(indexRaw);
const original = JSON.parse(await readFile(
  'public/moon-ephemerides/' + index.bodies.amalthea.path
));
const parserSource = await readFile('src/sim/moonEphemeris.ts', 'utf8');
const loaderSource = await readFile('src/sim/lazyMoonEphemerides.ts', 'utf8');

function moduleUrl(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  }).outputText;
  return 'data:text/javascript;base64,' + Buffer.from(output).toString('base64');
}
const parserUrl = moduleUrl(parserSource.replace(
  "import moonCatalog from '../data/moons.json';",
  'const moonCatalog = ' + JSON.stringify(catalog) + ';'
));
const loaderUrl = moduleUrl(loaderSource.replace(
  "import rawMoons from '../data/moons.json';",
  'const rawMoons = ' + JSON.stringify(catalog) + ';'
).replace("'./moonEphemeris'", JSON.stringify(parserUrl)));
const { createLazyMoonEphemerisLoader } = await import(loaderUrl);

async function probe(name, mutate) {
  const manifest = structuredClone(index);
  const artifact = structuredClone(original);
  mutate(artifact.bodies.amalthea);
  const raw = Buffer.from(JSON.stringify(artifact));
  const digest = hash(raw);
  Object.assign(manifest.bodies.amalthea, {
    bytes: raw.length, sha256: digest, path: digest + '.json'
  });
  const fetch = async url => String(url).endsWith('/manifest.json')
    ? new Response(JSON.stringify(manifest)) : new Response(raw);
  try {
    await createLazyMoonEphemerisLoader({ fetch, baseUrl: '/' }).load(['amalthea']);
    console.log(JSON.stringify({ probe: name, result: 'ACCEPTED' }));
  } catch (error) {
    console.log(JSON.stringify({ probe: name, result: 'REJECTED', message: error.message }));
  }
}

await probe('missing independent vector oracle', body => {
  delete body.validation.vectorOracle;
});
await probe('independent vector oracle exceeds fixed caps', body => {
  body.validation.vectorOracle.positionErrorKm.max = 1e9;
  body.validation.vectorOracle.velocityErrorMPerS.max = 1e9;
});
await probe('endpoint errors exceed fixed caps', body => {
  body.validation.coverageEndpointErrors[0].positionErrorKm = 1e9;
});

let transfers = 0, cancelled = 0;
const fetch = async url => {
  if (String(url).endsWith('/manifest.json')) return new Response(indexRaw);
  transfers++;
  return new Response(new ReadableStream({ cancel() { cancelled++; } }), {
    headers: { 'content-length': String(2 * 1024 * 1024 + 1) }
  });
};
const bounded = createLazyMoonEphemerisLoader({
  fetch, baseUrl: '/', maxConcurrentRequests: 1
});
for (let i = 0; i < 3; i++) {
  try { await bounded.load(['amalthea']); } catch {}
}
console.log(JSON.stringify({
  probe: 'oversized headers with concurrency=1', transfers, cancelled
}));
SCN043_READ_ONLY_PROBES
```

Observed review output:

```jsonl
{"probe":"missing independent vector oracle","result":"ACCEPTED"}
{"probe":"independent vector oracle exceeds fixed caps","result":"ACCEPTED"}
{"probe":"endpoint errors exceed fixed caps","result":"ACCEPTED"}
{"probe":"oversized headers with concurrency=1","transfers":3,"cancelled":0}
```

## Review limits

This was a bounded source/metadata review with in-memory boundary probes.
It did not read or independently hash/decompress the 331 MB archive payloads,
re-audit the original cached provider envelopes, hash every published shard,
rerun the offline rebuild, or rerun the author's test suites and build.
The author's reported numerical and byte-identity passes remain separate
evidence. Live HTTP behavior, cross-platform reproduction, and caller-level
stale-selection handling outside these changes were not certified.

The reviewed publication and provenance structure was consistent within the
checks listed above. The two rejection gaps remain open. Bulk-asset approval
and repair approval remain pending; no source, pin, asset, staging, or commit
action is authorized by this report.
