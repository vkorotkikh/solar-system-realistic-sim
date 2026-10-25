# SCN005 catalog startup diagnosis and ownership handoff

## Status

The application startup latency failure remains open. No production code,
scientific threshold, shader validation, or latency budget was changed.
The measured bottleneck is synchronous rendering/program initialization on the
main thread, outside the assigned loader write set. Peirce owns `src/main.ts`.
An asynchronous shader-compilation/startup scheduling change needs that owner's
implementation and subsequent integrated measurement; it is not a proven fix yet.

## Revision and scope

- Profiled delivery worktree revision: `b8610f4f7d544635a2b30d73491a7deaf635a386`.
- Parent reviewed read-only: `47c1d916945f87227573857ab9df6432b46d8652`.
- These five files were identical between the delivery worktree and reviewed
  parent, so no synchronization or loader patch was necessary:

```text
src/data/asteroidCatalogLoader.ts
src/data/asteroidCatalogLoader.test.ts
src/sim/phase1AsteroidCatalog.ts
src/sim/phase1AsteroidCatalog.test.ts
src/sim/phase1AsteroidCatalog.lifecycle.test.ts
```

Existing cache, cancellation, timeout, lifecycle, checksum, and binary-schema
validation behavior was preserved. The newer parent main integration was not
executed by these profiles. Its synchronous first-render path was reviewed and
still exists. The optional moon artifact was not used to explain this failure.

## Real-data diagnostic results

All browsers were headless. Full-app captures explicitly used software SwiftShader,
not the hardware GPU. These are diagnostic profiles, not replacement production
delivery gates or hardware performance passes.

The real binary was `asteroid_phase1_main_100000.bin`, 3,600,012 bytes, SHA-256
`f4debc48eea13a3be43eb69d7d70e8920ece7aa5e7e6dd0490c870bc83cb222a`.
Isolated probes imported the actual application loader and fetched the actual
catalog and metadata with browser caching disabled. Only their otherwise-empty
HTML document was supplied by the probe; catalog data and validation were not
mocked. Each full-count probe selected all 100,000 stored rows and passed integrity
acceptance. The production app also explicitly requests 100,000 rows; the loader's
15,000-row default is not the relevant application denominator.

| Probe | Runs | Catalog loadMs | Unchanged budget |
| --- | --- | --- | --- |
| Isolated full 100,000 rows | 3 | 123.1, 108.3, 83.3 ms | 2,000 ms |
| Full app, CPU profile | 1 | 3,839.9 ms | 2,000 ms, exceeded |
| Full app, GL diagnostic-call profile | 1 | 3,516.4 ms | 2,000 ms, exceeded |

The initial isolated default-count probes (15,000 rows) are retained in the
archive but are not substituted for the full-count comparison above.

The second full-app trace provides the following browser-monotonic timings:

| Event | Time or duration |
| --- | --- |
| Catalog fetch began | 591.2 ms |
| Network response headers available | 593.3 ms |
| Fetch promise observed by application | 2,802.6 ms |
| Metadata network transfer complete | 595.8 ms |
| Metadata JSON processing interval | 2,802.8-4,029.9 ms |
| Binary arrayBuffer interval | 4,029.9-4,050.0 ms, 20.1 ms |
| Catalog parsing interval | 4,050.0-4,104.7 ms, 54.7 ms |
| SHA-256 interval | 4,104.7-4,107.6 ms, 2.9 ms |

Network arrival is therefore not equivalent to JavaScript delivery. Catalog
headers were available roughly 2.21 seconds before the fetch continuation ran.
Parsing and hashing account for only about 58 ms of the 3.52-second measured
loader span. The profiles show that the loader timer includes startup main-thread
unavailability; they do not justify removing that time from the production metric.

Direct GL instrumentation measured 13 `getProgramInfoLog` calls totaling 504.2 ms
and 26 `getShaderInfoLog` calls totaling 3,135.6 ms across startup and the following
frame. Their call stacks run through Three.js `onFirstUse`, `getUniforms`,
`setProgram`, and `WebGLRenderer.render`. The largest individual shader-log call,
1,508.9 ms, occurred in the following animation frame, after catalog loading;
the combined 3,639.8 ms must not all be attributed to the loader's 3,516.4 ms span.

The separate CPU profile attributed about 2,322 ms self-time to `onFirstUse`
during initial rendering and about 1,626 ms in the following frame. CPU profiling
and wrapped native calls add overhead, and software timings are not extrapolated
to the RTX 5090. They identify the blocking call path, not a hardware speedup.

## Exact owner handoff

At the profiled revision, `src/main.ts:621` starts asynchronous catalog loading,
`src/main.ts:1203` synchronously renders the initial scene, and
`src/main.ts:1248` renders the animation frame. At the reviewed parent revision,
the corresponding initial and frame render calls are at lines 1219 and 1252.
No changes were made to those locations.

The local Three.js implementation has `renderer.compileAsync`, which waits for
program readiness using `KHR_parallel_shader_compile` when available. A bounded
candidate for Peirce is to coordinate asynchronous compilation with initial
catalog readiness and first-frame scheduling, retaining the latest generation,
cancellation, disposal, context-loss, and frame lifecycle guards. Catalog-renderer
replacement also needs consideration so startup does not simply move the stall
into the next frame. Unsupported-extension behavior must remain honest.

Do not disable `renderer.debug.checkShaderErrors`, skip checksum/schema checks,
reduce the 100,000-row source count, alter the 2,000 ms budget, or redefine the
timer to make the failure disappear. This handoff is a root-cause diagnosis,
not an implemented optimization or a claim that integrated startup now passes.

## Tests and concurrency

Executed with pinned Node 22.23.2 and npm 10.9.8:

```sh
node /tmp/solar-remediation-toolchain-20261014/node_modules/npm/bin/npm-cli.js test -- src/data/asteroidCatalogLoader.test.ts src/sim/phase1AsteroidCatalog.test.ts src/sim/phase1AsteroidCatalog.lifecycle.test.ts
```

Result: 3 test files passed, 35 tests passed, 0 failed, 0 skipped (237 ms Vitest
duration, reported start 19:10:15 local on 2026-10-14). These are focused regression
results, not a new full-suite or real production delivery pass.

Parent reported no concurrent backend full-suite load; other agents could still
run CPU work. The second full-app probe recorded host load average approximately
1.36 at start and 1.33 at finish. No exclusive CPU window was claimed. Beauvoir
retained the hardware window throughout these headless/software-only profiles.
All probe browsers closed; the owned Vite listener on 127.0.0.1:5186 was stopped
after profiling. No global process termination was used.

## Evidence and remaining gates

`catalog-startup-2026-10-14/evidence.tar.gz` contains the three diagnostic scripts,
their reports/logs, the two raw Chrome CPU profiles, and the CPU summary.
`catalog-startup-2026-10-14/summary.json` provides machine-readable denominators,
revisions, and pass/fail scope. Probe artifacts retain their original timestamps.

The earlier production delivery evidence remains in
`REMEDIATION_DELIVERY_2026-10-14.md` and `solar-delivery-2026-10-14/`.
Its measured hardware startup warnings were 6,086.2 ms DEV and 8,106.5 ms PREVIEW.
No new five-minute production run was performed. A repeat awaits Planck's cache
fix, the final main integration, and the parent's coordinated measurement window.
No WebKit, NVDA, VoiceOver, physical-touch, or integrated full-scene GPU pass is
claimed by this handoff.
