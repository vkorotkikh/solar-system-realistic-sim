# SCN-005: overlap catalog response bodies with metadata loading

## Status and scope

Implemented a bounded loader scheduling improvement. SCN-005 remains open:
there is no new browser startup measurement or claim that full application
startup meets the unchanged 2,000 ms budget.

Base: `dbfdbedc306fa7e16b6fcff66adffd2c37cc09a9`, including the production
integration at `4f2e2507797eb73d50443711df433e10032cc3fd`. The initially clean
worktree was switched from `1396bd7` with the parent's approved
`git switch --detach`; its former branch was preserved. This supplies the
existing `loadMoonEphemerides` dependency missing from the older checkout.

Parent-approved write set:

- `src/sim/phase1AsteroidCatalog.ts`
- `src/sim/phase1AsteroidCatalog.startup.test.ts`
- `agent-notes/REMEDIATION_STARTUP_CPU_2026-10-15.md`

No moon loader/lazy files, Sun/GPU harness, or global tracker was edited.
Startup presentation and shader scheduling remain subject to the pending
owner decision. No browser was launched; the reserved GPU was not used.

## Change and preserved contracts

Previously, the loader waited for both the binary response headers and the
completed metadata JSON operation before calling `binaryResponse.arrayBuffer()`.
It now starts consuming a successful binary response as soon as its headers
arrive, overlapping body consumption with metadata loading.

The binary fetch continuation captures HTTP and body-read errors as an explicit
success/failure result. Those errors are surfaced only after metadata settles,
matching the previous ordering. This handles synchronous throws, rejected
promises, and rejection with `undefined`, without an unhandled early rejection.
Non-success HTTP bodies are not consumed. A rejection of the fetch itself still
rejects immediately, as before.

The existing absolute deadline, abort signal, admission limit, shared in-flight
loads, accepted-result cache, retry behavior, post-timeout cache exclusion,
checksum/schema/row validation, and load timer remain in place. No numerical
tolerance, content count, startup budget, or error classification was relaxed.
Parsing and acceptance still wait for both inputs.

## Regression proof

Before editing production code, a CPU probe invoked the real integrated loader
under Node 22.23.2, held the metadata JSON promise, and asserted that the binary
body had already started. It failed with exit 1 for the intended reason:

```text
{"node":"v22.23.2","startedBeforeMetadata":false,"expected":true}
AssertionError: binary body must start before metadata JSON resolves
false !== true
```

The dedicated test file contains ten cases covering:

- Body consumption before metadata completes, shared requests, and accepted caching.
- Early asynchronous rejection, synchronous throw, and rejection with `undefined`.
- HTTP failure ordering and avoiding consumption of unsuccessful response bodies.
- A stalled metadata operation after either an HTTP or body failure retaining the deadline.
- Transport rejection remaining immediate despite stalled metadata.
- Late metadata after timeout being unable to overwrite a successful retry.
- A metadata wait of 2,001 ms still failing the unchanged 2,000 ms latency budget.

The early-error tests cross an event-loop turn before releasing metadata, so an
unhandled rejection would be exposed to Vitest rather than silently deferred
until the test finishes.

## Verification on the patched integration base

All results below used Node **22.23.2** from the existing npm cache:

```sh
export PATH=/home/nomad/.npm/_npx/f4985f1adc097c41/node_modules/node/bin:$PATH
```

The npm commands used npm **10.9.8** from
`/tmp/solar-scn005-node22-A1dl7s/lib/node_modules/npm/bin/npm-cli.js`.
That isolated toolchain was extracted from the official Node 22.23.2 archive,
whose SHA-256 matched its published `SHASUMS256.txt`. The download had already
started before the cached Node location was supplied; validation used the
requested cached Node executable. Earlier Node 24 diagnostics are provisional
and are not substituted for these results.

| Check | Result |
| --- | --- |
| Focused loader regression suite | 4 files passed; **45 passed, 0 failed, 0 skipped**; 277 ms; exit 0; start 01:45:32 local |
| Complete default CPU frontend suite | **731 passed, 413 skipped, 0 failed**; 71 files passed, 1 skipped; 1.64 s; exit 0; start 01:46:07 local |
| Strict integrated TypeScript check | Exit 0; no diagnostics |
| Production build | Exit 0; 68 modules transformed; 1.94 s |
| Real-data CPU loader probe | 3/3 loads accepted all 100,000 rows and matched the expected SHA-256; exit 0 |

The focused tests overlap the complete suite and must not be added to its count.
The complete CPU suite retains the 411 existing moon qualification skips and
the two existing opt-in Earth/Mars EGL cases. `PLANET_SHADER_GPU_TEST` was
unset for the CPU-only reservation; no test source or exclusion was changed.
These skips are not GPU passes or promotion of the unqualified moon records.

Reproduction commands, from this worktree with the PATH above:

```sh
node node_modules/vitest/vitest.mjs run \
  src/data/asteroidCatalogLoader.test.ts \
  src/sim/phase1AsteroidCatalog.test.ts \
  src/sim/phase1AsteroidCatalog.lifecycle.test.ts \
  src/sim/phase1AsteroidCatalog.startup.test.ts

env -u PLANET_SHADER_GPU_TEST \
  node /tmp/solar-scn005-node22-A1dl7s/lib/node_modules/npm/bin/npm-cli.js test

node node_modules/typescript/bin/tsc --noEmit --strict --pretty false

node /tmp/solar-scn005-node22-A1dl7s/lib/node_modules/npm/bin/npm-cli.js run build
```

The build still emits the existing greater-than-500-kB chunk warning. Its main
output is `index-DYcf3sEI.js`, 969.57 kB / 249.38 kB gzip. The model worker
remains `modelWorker-DYAkMz1r.js`, 26.13 kB. No chunk warning limit was changed.

## CPU diagnostic and impact limit

The real-data probe loaded the actual application loader through Vite SSR and
served the shipped binary and metadata through in-memory `Response` objects.
Every call used `cache: false`, `maxRecords: 100000`, and the default budget.
It used no browser, backend, live network transport, or replacement catalog.

- Binary: `asteroid_phase1_main_100000.bin`, 3,600,012 bytes.
- SHA-256: `f4debc48eea13a3be43eb69d7d70e8920ece7aa5e7e6dd0490c870bc83cb222a`.
- Load times: **86.690922, 46.069661, 47.651012 ms**.
- Each run: 100,000 source rows, 100,000 selected rows, integrity accepted.
- Host load averages at start/end: 1.27 / 1.30 / 1.07; no exclusive CPU window.

These are diagnostic results, not a before/after speedup experiment or a
hardware startup gate. The earlier Node 24 timings are not a comparable baseline.

The preserved historical software trace in
`REMEDIATION_CATALOG_STARTUP_2026-10-14.md` apportions its 3,516.4 ms loader span:

| Interval | Duration |
| --- | --- |
| Fetch dispatch to response headers | 2.1 ms |
| Headers to JavaScript continuation | 2,209.3 ms |
| Continuation handoff | 0.2 ms |
| Metadata JSON await interval | 1,227.1 ms |
| Binary body consumption | 20.1 ms |
| Catalog parsing | 54.7 ms |
| SHA-256 | 2.9 ms |

The metadata await interval includes main-thread unavailability; it is not a
measurement of JSON parsing CPU cost. This patch can overlap the body-consumption
interval with metadata waiting. The observed 20.1 ms interval bounds that narrow
opportunity in that historical trace, not a promised hardware speedup. It does
not remove the multi-second synchronous shader initialization stall.

Historical hardware startup remains **6,086.2 ms DEV / 8,106.5 ms PREVIEW**.
The 2,000 ms application gate must still be rerun on a coordinated integrated
build after the startup decision and any independently reviewed shader work.
No new five-minute delivery, GPU, backend-science, or resolved-in-main claim is
made by this scoped loader commit.
