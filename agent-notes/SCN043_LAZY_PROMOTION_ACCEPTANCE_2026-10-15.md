# SCN-043 lazy promotion acceptance, 2026-10-15

Local scientific and runtime acceptance passed. Parent integration remains pending review and explicit bulk-asset commit approval. This note does not claim resolution in main. No commit, staging, push, fetch, rebase, main merge, or global tracker edit was performed.

Worktree: `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris`. Worktree HEAD: `86ac5fe0bad35d5bed4a2a18df82cfc6d453d6f6`. Parent review target: `4f2e2507797eb73d50443711df433e10032cc3fd`. The worktree is deliberately not merged with the parent.

The approved corrections are `target.parent` to `target.center_name` in `scripts/generate_moon_lazy_ephemerides.py`, and both `rowCounts` accesses to `counts` in `scripts/test_moon_lazy_ephemerides.py`. The inherited lazy loader, test helpers, loader extension, and all-catalog gate are included in the authored patch. No numerical tolerance, coverage, original artifact, or catalog denominator was changed. The source-integrity and eager-worker fixes already present in the parent were not redone.

**Pinned Node acceptance**

Executable: `/home/nomad/.npm/_npx/f4985f1adc097c41/node_modules/node/bin/node`; version: `v22.23.2`. npm used the supplied PATH and reports 11.19.0; this verifies the requested Node pin, not the package's npm 10.9.8 pin. Vitest is 3.2.4; the installed Vite used for the production build is 7.3.1.

Run from `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris`:

```bash
PATH=/home/nomad/.npm/_npx/f4985f1adc097c41/node_modules/node/bin:$PATH npm test -- src/sim/moon src/sim/lazyMoonEphemerides.test.ts src/sim/loadMoonEphemerides.test.ts src/workers/modelWorkerContract.test.ts --reporter=default --reporter=json --outputFile.json=/tmp/scn043-lazy-20261015-R0ZX2q/node22/vitest-results.json
PATH=/home/nomad/.npm/_npx/f4985f1adc097c41/node_modules/node/bin:$PATH npm run build -- --outDir /tmp/scn043-lazy-20261015-R0ZX2q/node22/dist --emptyOutDir
```

The scoped run exited 0: **517 passed, 0 failed, 0 skipped/pending, 0 todo, 10 files**, in 1.31 seconds. The catalog suite contains one denominator assertion plus 424 record-specific tests; each record checks seven independent reference states, for 2,968 state comparisons. Both Puck IDs 378 and 388 remain represented, sharing a single model with the stricter position cap. There are 423 unique models: 13 unchanged base models plus 410 lazy models for 411 additional records.

| Suite | Passed |
|---|---:|
| `src/sim/lazyMoonEphemerides.test.ts` | 25/25 |
| `src/sim/loadMoonEphemerides.test.ts` | 1/1 |
| `src/sim/moonCartesianEphemeris.test.ts` | 5/5 |
| `src/sim/moonCatalogIdentity.horizons.test.ts` | 3/3 |
| `src/sim/moonCatalogRepair.horizons.test.ts` | 425/425 |
| `src/sim/moonEphemeris.test.ts` | 10/10 |
| `src/sim/moonFrames.horizons.test.ts` | 27/27 |
| `src/sim/moonSourceExceptionIndependentReview.test.ts` | 11/11 |
| `src/sim/moonSourceExceptions.test.ts` | 4/4 |
| `src/workers/modelWorkerContract.test.ts` | 6/6 |

The pinned production build exited 0 in 1.79 seconds. It is byte-identical to the prior Node 24 build, including every copied public shard. Build total: **65767858 bytes**. Main JavaScript: **938094 bytes**; CSS: **22744 bytes**; production model worker: **26961 bytes**. The worker module graph has 11 inputs and zero eager moon coefficient, lazy-loader, or base-loader inputs. The existing warning about a JavaScript chunk exceeding 500 kB remains; its threshold was not changed.

Pinned evidence:

- `/tmp/scn043-lazy-20261015-R0ZX2q/node22/vitest.log`
- `/tmp/scn043-lazy-20261015-R0ZX2q/node22/vitest-results.json`
- `/tmp/scn043-lazy-20261015-R0ZX2q/node22/build.log`
- `/tmp/scn043-lazy-20261015-R0ZX2q/node22/build-integrity.json`
- `/tmp/scn043-lazy-20261015-R0ZX2q/node22/cold-load.json`
- `/tmp/scn043-lazy-20261015-R0ZX2q/node22/dist`

**Exact cold-load footprint and runtime behavior**

The production `createLazyMoonEphemerisLoader` was bundled for execution under pinned Node and supplied actual published bytes through the existing local Fetch Response adapter. Each measurement uses a fresh loader and requests one distinct key twice in the same call to exercise deduplication. The following are exact decoded response-body bytes, excluding HTTP headers and negotiated compression; they are not live HTTP wire measurements.

| Requested body | Index bytes | Single shard bytes | Cold lazy asset total | Requests |
|---|---:|---:|---:|---:|
| amalthea | 303149 | 403584 | 706733 | 2 |
| metis | 303149 | 1624520 | 1927669 | 2 |

Metis is the largest current shard, so **1927669 bytes** is the largest current one-body cold lazy asset load. The measured Amalthea load is **706733 bytes**. A repeat request in the same default loader makes zero further asset requests. Construction and `load([])` make zero requests. The manifest uses `no-cache`; a content-addressed shard uses `force-cache`.

No background download, polling, prefetch, or automatic loading of all 410 shards was added. The all-catalog test explicitly requests all models; its aggregate asset volume must not be presented as a normal cold-load footprint. `getManifest()` explicitly requests only the index. The default `loadMoonEphemerides()` still loads the existing 13 base models and makes no additional shard requests; the higher-level call with additional keys also loads those base models. The five unchanged base JSON artifacts total **6765158 bytes on disk**. Their raw JSON total is not a measurement of bundled JavaScript transfer, and the cold lazy asset totals above do not include application JavaScript, textures, or those base modules.

| Runtime bound | Bytes / value | Meaning |
|---|---:|---|
| Manifest response | 1048576 | 1 MiB decoded cap; current index 303149 bytes |
| Each model shard | 2097152 | 2 MiB decoded cap; exact size and SHA-256 checked |
| Default concurrent shard requests | 4 | Configurable from 1 through 8 |
| Default retained cache | 8388608 | 8 MiB of serialized JSON accounting |
| Allowed cache range | 0 through 33554432 | Zero disables retention; upper limit 32 MiB |

LRU accounting is not a JavaScript heap or total caller-retained model memory guarantee. Over-budget streams, corrupt/truncated bytes, invalid identities, changed coverage/caps, unknown keys, and failures do not silently select a fallback. Offline deterministic generation is a maintenance property; no persistent browser offline store or service worker was added. Runtime assets must still be served or available in the browser's HTTP cache on first use.

**Offline source, provenance, and numerical acceptance**

Prior evidence remains applicable because no source code changed during the pinned-Node follow-up. Python executable: `/home/nomad/miniconda3/envs/agentic-rag/bin/python`; Python 3.12.13, NumPy 2.5.2, pytest 9.1.1. The generator and Python tests ran with `PYTHONHASHSEED=0`, `OMP_NUM_THREADS=1`, `OPENBLAS_NUM_THREADS=1`, `MKL_NUM_THREADS=1`, `NUMEXPR_NUM_THREADS=1`, and `TZ=UTC`.

```bash
/home/nomad/miniconda3/envs/agentic-rag/bin/python scripts/generate_moon_lazy_ephemerides.py --offline --write
/home/nomad/miniconda3/envs/agentic-rag/bin/python -m pytest -q scripts/test_moon_lazy_ephemerides.py
```

Generation published all 410 content-addressed shards locally, preserving the 424-record denominator. All fixed numerical gates passed. The Python suite passed **7/7 in 75.87 seconds**. Its isolated checkout test runs `--offline --check` against all 410 regenerated shards and the index, with socket connection and URL acquisition blocked and no candidate cache or `node_modules` available. That proves byte identity from the lossless pins in this numerical environment. The input codec rejects compressed or decoded groups over 33554432 bytes and sets an XZ decoder memory limit of 67108864 bytes; these are not whole-process RAM limits. Normal generation is offline; pinning from preexisting capture cache is a separate maintenance mode.

The full prior Vitest run under Node 24.21.0 passed **884/884 across 36 files, zero skips**, in 2.02 seconds. This is supplementary evidence; the requested scoped acceptance above was rerun under Node 22.23.2.

The provenance audit verified all **410 models / 411 additional records**, **1370 original cached response envelopes**, and **7900473 retained rows** bit-for-bit: 3950260 training rows, 3949393 held-out rows, and 820 exact endpoint rows. Sixteen oracle/endpoint training overlaps were excluded exactly as recorded. It checked candidate hashes, lossless archive hashes, normalized group and per-response row digests, original encoded queries/cache keys, target/center/source identity, verified provider headers and preambles, provider signatures, and GM. Fixed position limits remain `min(500 km, 0.001 * catalog aKm)` for additional records and velocity remains 10 m/s; shared Puck uses the stricter alias limit. Original base-model accuracy declarations are unchanged.

Original cached response envelopes total **2693748741 bytes**. This is cached envelope storage, not original HTTP transfer size. No provider acquisition or provider download occurred during acceptance.

| Local storage / publication | Exact bytes |
|---|---:|
| 410 XZ source archives | 330929304 |
| Source provenance manifest | 5119933 |
| Complete source pins | 336049237 |
| 410 published model shards | 59955387 |
| Published index | 303149 |
| Complete published lazy assets | 60258536 |
| Source pins plus published assets, approval pending | 396307773 |
| Uncompressed normalized float64 rows | 505630272 |

The 60258536-byte published set is a build/deployment storage figure. A one-body runtime request fetches only the index and its one shard as measured above. Optional local gzip-level-9 sizes from the earlier footprint calculation are 28477004 bytes for all shards and 32935 bytes for the index; these are not observed server transfer sizes.

Source manifest: `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/scripts/moon-lazy-inputs/manifest.json`, SHA-256 `235714411f6ec2bd897608b1fbd6cea8cdaddb3ba810fa3f9938f41550869b0d`.

Published index: `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/public/moon-ephemerides/manifest.json`, SHA-256 `2e40645b28e180337c791493fafae884d6d9e81700c8d0aa23abc2721783cf91`.

The published index binds the source manifest hash; each body binds its normalized input and recipe hashes. Source recipes preserve exact provider query/header provenance and distinguish lossless normalized rows from cached response envelopes. The recorded generation timestamp is an acquisition upper bound, not a claimed HTTP retrieval timestamp. Numerical-source interpolation accuracy is not observational uncertainty.

Original 13-model artifacts were rechecked during pinned acceptance:

| Read-only artifact | Bytes | Unchanged SHA-256 |
|---|---:|---|
| `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/src/data/moonEphemerisChebyshev.json` | 4118909 | `9331771c6ae51983c21efcea2bb07191055c2d7891db5f702006487f54e0b9f4` |
| `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/src/data/moonEphemerisRepairs.json` | 737611 | `d65c466ce3fb84a46f15af89388abe34f0239df3382de4de59a9af3e6a8cb3d7` |
| `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/src/data/moonEphemerisSpkRepairs.json` | 270686 | `b3f2cff1db399908475129505dea7e317fada4c47f13e005aef95c66d79434f9` |
| `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/src/data/moonEphemerisDaphnis.json` | 219401 | `d7709853c059884f20763ace6aacd50a34c38e26b924e20c9f5a6b943f02a7c8` |
| `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/src/data/moonEphemerisS2023S38.json` | 1418551 | `b3410184508f68eff0add063f4f7eb4f9a5ac349a61ecec8c6f324c39f06e1e8` |

Earlier evidence:

- `/tmp/scn043-lazy-20261015-R0ZX2q/generate.log`
- `/tmp/scn043-lazy-20261015-R0ZX2q/pytest.log`
- `/tmp/scn043-lazy-20261015-R0ZX2q/provenance.log`
- `/tmp/scn043-lazy-20261015-R0ZX2q/vitest.log`
- `/tmp/scn043-lazy-20261015-R0ZX2q/sizes.json`
- `/tmp/scn043-lazy-20261015-R0ZX2q/typecheck-comparison.json`

**Parent review patch and final ready-file allowlist**

Code-only patch: [SCN043_LAZY_PROMOTION_AUTHORED_2026-10-15.patch](/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/agent-notes/SCN043_LAZY_PROMOTION_AUTHORED_2026-10-15.patch). It contains the tracked `git diff HEAD` for two files and full additions for five authored source/test files. It contains no source archive, generated shard, data manifest, original artifact, or unrelated change. Patch size: **54311 bytes**. Patch SHA-256: `bab847c50f85151af5c975b32b7781f3f58594c5f5f0e6186d6f4b673792c554`.

A read-only `git apply --check` passed against an isolated snapshot of the worktree HEAD. The same check against an isolated snapshot of parent `4f2e2507797eb73d50443711df433e10032cc3fd` passed (exit 0). No patch was applied to the live parent or to the worktree. Patch evidence: `/tmp/scn043-lazy-20261015-R0ZX2q/node22/patch-review.json`. Apply-check success is not a parent test run or a merge claim.

Exact machine-readable allowlist: [SCN043_LAZY_PROMOTION_READY_FILES_2026-10-15.json](/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/agent-notes/SCN043_LAZY_PROMOTION_READY_FILES_2026-10-15.json). It lists seven authored code files, three handoff files, all 411 pending source-pin files, and all 411 pending published-asset files using absolute paths. `bulkCommitAuthorized` is false. No broad directory staging is authorized by this document.

The seven code files ready for review are:

- `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/src/sim/loadMoonEphemerides.ts`
- `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/src/sim/moonCatalogRepair.horizons.test.ts`
- `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/scripts/generate_moon_lazy_ephemerides.py`
- `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/scripts/test_moon_lazy_ephemerides.py`
- `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/src/sim/lazyMoonEphemerides.ts`
- `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/src/sim/lazyMoonEphemerides.test.ts`
- `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/src/sim/moonLazyTestInputs.mjs`

The three handoff files are:

- `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/agent-notes/SCN043_LAZY_PROMOTION_ACCEPTANCE_2026-10-15.md`
- `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/agent-notes/SCN043_LAZY_PROMOTION_AUTHORED_2026-10-15.patch`
- `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/agent-notes/SCN043_LAZY_PROMOTION_READY_FILES_2026-10-15.json`

The data files are ready locally but remain **unapproved for staging or commit**. Their full individual paths appear in the allowlist's `pendingBulkSourceFiles` and `pendingBulkPublishedFiles` arrays, which are derived from the source and published manifests. No data bytes are embedded in the review patch. Original base artifacts and the global tracker are excluded.

**Remaining limitations and integration status**

The older worktree's prior TypeScript check reported 223 diagnostics, exactly matching its own HEAD. The ratchet failure concerns five TS2307 diagnostics and one TS2591 diagnostic in `src/sim/moonSourceExceptionIndependentReview.test.ts`; these are not new diagnostics from this promotion. The parent `4f2e2507797eb73d50443711df433e10032cc3fd` strict pass is user-provided context, not reverified here. No attempt was made to fix the old-worktree diagnostics, loosen the ratchet, or copy them into the parent. This follow-up reran scoped tests and build on pinned Node, not a parent strict check. npm remains 11.19.0 as disclosed above.

Bulk approval remains outstanding for 396307773 bytes of source pins plus published assets. The authored full-catalog and generator tests require those assets, so the code-only patch is for review and is not independently ready to land with missing data. No integration-ready commit was created; worktree HEAD remains `86ac5fe0bad35d5bed4a2a18df82cfc6d453d6f6`. Logs and build output under `/tmp` are temporary; this note preserves the exact acceptance results and the repository handoff files preserve the review patch and ready-file allowlist. Cross-platform/other-NumPy reproducibility and live deployed HTTP behavior were not tested.
