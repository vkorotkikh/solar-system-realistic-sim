# Catalog remediation evidence, 2026-10-14

Assigned branch: `remediation/20261014-catalogs`.
Assigned worktree: `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-catalogs`.
Authority: the SCN-015/034/046/082 rows in the canonical master, plus the user's
additional SCN049 loader failure/cache/timeout child. These are branch fixes;
this note does not mark anything merged into main or update another worktree.
The fixing commit is the commit containing this report.

## Per-ID disposition and evidence

| ID | Branch disposition | Replacement contract and evidence |
| --- | --- | --- |
| SCN-015 | Implemented and tested | Explicit largest-first prefix of known-diameter MBA/IMB/OMB objects with 2 <= a <= 3.5 AU. Diameter descending, source ID ascending for ties. Metadata reports stored and displayed-prefix distributions; UI says not representative. Actual-artifact test loads 100,000 rows, selects the exact first 50,000 identities, preserves uniqueness, and checks diameter/unknown coverage. Catalog populations are never padded with procedural objects. |
| SCN-034 | Implemented and tested | Real source responses pinned by URL, signature, capture time, length and SHA-256. Normal asteroid/moon generation is offline and fails closed on missing/corrupt inputs. Asteroid binary/metadata/sample publish through one atomic directory exchange. Moon coefficients and provenance publish as one atomic file after every target validates. Tests inject exchange/rename/second-target failures, reject accidental moon subset replacement, check dry-run/check no writes, and reject unsafe artifact names. |
| SCN-046 | Implemented and tested for the new pinned release | Two independent temporary asteroid builds reproduce all three committed artifacts byte-for-byte with network functions disabled. Every one of 100,000 binary periods, diameters and albedos is compared independently with raw SBDB rows. Both generators' offline `--check` commands pass against committed artifacts. The original unpinned historical artifacts were replaced, not reverse-engineered into fake source inputs. |
| SCN-082 | Implemented and tested | No semimajor-axis taxonomy inference or assumed albedo. Unknown family code 255 and missing-albedo code 0 decode to `Unknown` and `null`. Raw spectral classifications remain pinned; ambiguous X/E are not claimed as metallic M. Full-precision SBDB periods are retained through the ACBF float32 boundary. Diameter helper uses 1329 km rather than the 664.5 radius coefficient, and cannot estimate without known albedo. This committed population requires SBDB-supplied diameters. Visible text says integrity checked and scientific accuracy not certified. |
| SCN049 loader child | Implemented and tested; parent SCN-049 remains outside this closure | Equivalent concurrent loads share work. Only accepted results enter a bounded two-entry, five-minute cache. Failures and rejected validation evict in-flight entries and permit recovery. Four distinct active loads maximum. Default total async deadline is 10 seconds, configurable up to 60 seconds; fetch, body and digest share it. Abort plus promise racing bounds waits even for a non-cooperating test transport. Late completion cannot replace a successful retry. Network, timeout, invalid binary and capacity failures have explicit codes; metadata/hash rejections retain their typed acceptance results. |

Observed original failures were nine builder assertions (unknown fields, source
albedo, X classification, diameter coefficient, missing period, uniqueness and
ordering), three runtime/status assertions, two moon offline/grid assertions,
four loader lifecycle assertions, and the real catalog taxonomy-completeness
assertion. Their replacements pass. The last assertion prevents the presence
of all three visual families from being reported as 100% taxonomy completeness
when only 1.367% of stored rows can be assigned to those families.

## Source and population evidence

Seventeen REAL JPL HTTPS responses were captured on 2026-10-14: one 100,000-row
SBDB Query API response and sixteen Horizons chunks. Source bodies are stored
verbatim inside gzip files, with exact request URLs and byte hashes in
`scripts/source-snapshots/catalogs/manifest.json`. No source was manufactured
from generated output. Raw bytes total 121,928,490; compressed bodies total
40,159,083 bytes. Capture is sequential and bounded to 60 seconds/64 MiB per
request, with a 65-second subprocess ceiling and no automatic retry.

The SBDB matching population was 133,963 diameter-bearing objects. This snapshot
retains its largest 100,000; it does not claim completeness of the physical belt.

| Population | Count | Diameter range, km | Unknown visual taxonomy | Unknown albedo |
| --- | ---: | ---: | ---: | ---: |
| Stored | 100,000 | 2.797 to 939.4 | 98,633 | 590 |
| Largest-first displayed prefix | 50,000 | 4.662 to 939.4 | 48,667 | 85 |

The prefix is 50% of stored rows. Semimajor-axis bins [2, 2.5), [2.5, 2.82),
[2.82, 3.5] contain 4,142 / 12,334 / 33,524 prefix rows, versus
13,724 / 32,316 / 53,960 stored rows. Inclination histograms and taxonomy
counts are also in artifact metadata. Those distributions explicitly expose
the selection bias rather than claiming a representative sample.

Horizons inputs cover Titan, Iapetus, Phoebe and Cordelia from JD 2451545.0
through JD 2469807.5 TDB. Each body retains two fitting chunks and two disjoint
half-step validation chunks. Identity/frame/units/ephemeris/GM and complete grid
checks precede fitting. The existing gates evaluate 36,527 states per body:
36,525 held-out half-steps and the two exact coverage endpoints.

| Body | Maximum position error, km | Maximum velocity error, m/s | Existing limits, km / m/s |
| --- | ---: | ---: | ---: |
| Titan | 22.439714 | 2.378522 | 50 / 3 |
| Iapetus | 89.704445 | 4.408774 | 125 / 6 |
| Phoebe | 173.336604 | 9.830987 | 250 / 12 |
| Cordelia | 87.196564 | 23.241745 | 125 / 30 |

These are same-provider held-out fitting checks, not an independent planetary
ephemeris certification or an all-moon validation claim.

## Exact validation commands and results

Node was `v22.23.2`, npm `10.9.8`, Python `3.12.13` on Linux. For the Node commands
below, the toolchain was selected with:

```sh
export PATH=/tmp/solar-remediation-toolchain-20261014/node_modules/node/bin:$PATH
NODE=/tmp/solar-remediation-toolchain-20261014/node_modules/node/bin/node
NPM=/tmp/solar-remediation-toolchain-20261014/node_modules/npm/bin/npm-cli.js
```

| Command | Result |
| --- | --- |
| `$NODE $NPM test` | 423 passed, 32 files. Includes 12 catalog-integrity/science tests, 8 loader-lifecycle tests, the real-artifact prefix test, and the existing 15 ACBF tests. |
| `uv run --with-requirements ci/backend-test-requirements.txt python -m pytest backend/tests scripts/ci/tests scripts/test_catalog_generation.py -q` | 2,234 passed in 221.74 seconds, two dependency deprecation warnings. This run collected the then-existing 18 generator tests. |
| `uv run --with-requirements ci/backend-test-requirements.txt python -m pytest scripts/test_catalog_generation.py -q` | Final expanded generator suite: 20 passed in 5.41 seconds, including both additional moon publication/admission cases. |
| `uv run --with-requirements ci/backend-test-requirements.txt python scripts/build_asteroid_phase1_dataset.py --offline --check` | All three asteroid artifacts byte-identical. |
| `uv run --with-requirements ci/backend-test-requirements.txt python scripts/generate_moon_ephemeris.py --offline --check` | Byte-identical four-body artifact; all embedded accuracy and continuity gates pass. |
| `$NODE $NPM run build` | Passed; existing large-chunk advisory remains. |
| `$NODE $NPM run typecheck:ratchet` | Fails only on three inherited SCN013 test diagnostics, detailed below. No added diagnostic bucket remains in this assignment's files. |
| `git diff --check` | Passed. |

An initial full-backend attempt used the looser `backend/requirements.txt` and
failed collection on a newer Starlette/httpx2 dependency mismatch. A transient
unpinned diagnostic run was stopped after 1,690 passing tests when the existing
`ci/backend-test-requirements.txt` was located. Neither attempt is claimed as
the backend gate. The final full run uses that repository pin file and passes;
no package/requirements files were edited.

## Artifact SHA-256

```text
f4debc48eea13a3be43eb69d7d70e8920ece7aa5e7e6dd0490c870bc83cb222a  asteroid_phase1_main_100000.bin
609f06e469f77d14db258818a00594533e50e55ae7faf95a274cfba9c3bc7602  asteroid_phase1_main_100000.meta.json
ecde5df226491332db1bb2562123482526a5bd4045586dd14c7374cb8c78f079  sample_top_10.json
9331771c6ae51983c21efcea2bb07191055c2d7891db5f702006487f54e0b9f4  moonEphemerisChebyshev.json
f5982f10e4caa74bcc3eecbc674c2b24b89021161b45f52d38f6a19a3c062b4d  source manifest.json
```

## Changed files and ownership

- `scripts/build_asteroid_phase1_dataset.py`
- `scripts/fetch_jpl_sbdb.py`
- `scripts/generate_moon_ephemeris.py`
- `scripts/catalog_sources.py`
- `scripts/capture_catalog_sources.py`
- `scripts/test_catalog_generation.py`
- `scripts/phase1-catalog-artifacts.test.mjs`
- `scripts/source-snapshots/catalogs/manifest.json`
- `scripts/source-snapshots/catalogs/README.md`
- All 17 `scripts/source-snapshots/catalogs/*.json.gz` bodies listed by request key in the manifest.
- `src/sim/phase1AsteroidCatalog.ts`
- `src/sim/phase1AsteroidCatalog.test.ts`
- `src/sim/phase1AsteroidCatalog.lifecycle.test.ts`
- `src/sim/asteroidBelt.ts`
- `src/frontend/features/asteroids/catalogSourceStatus.ts`
- `src/data/moonEphemerisChebyshev.json`
- `public/data/asteroid-phase1/asteroid_phase1_main_100000.bin`
- `public/data/asteroid-phase1/asteroid_phase1_main_100000.meta.json`
- `public/data/asteroid-phase1/sample_top_10.json`
- This evidence note.

The status helper is the one narrow UI boundary edit, announced to the
controller: its visible wording distinguishes integrity from fidelity and
states the population policy. Existing exported function/state identifiers are
preserved. No edits to beltRenderer, orbitMath, sim/catalog, main, package files,
or other worktrees. The SCN014 ACBF codec and quantization budgets are unchanged.

## Remaining limits and integration blocker

- The typecheck ratchet is still red in unchanged `src/frontend/features/asteroids/beltPrecision.test.ts`: TS2345 at lines 12 and 29 (incomplete Three shader fixtures), TS18048 at line 35 (optional mean anomaly). That file came from inherited SCN013 commit `2dee43c`; `git diff --quiet HEAD -- <file>` confirms this assignment did not alter it. Reported to the controller for its owner; not hidden by changing the baseline.
- Source hashes prove byte integrity. Asteroid propagation remains quantized, fixed-element, two-body visualization without an independent multi-epoch accuracy interval. Colors and irregularity remain illustrative. No broader SCN049 or SCN047 closure is implied.
- Moon accuracy evidence covers only the four registered targets and the declared interval. No all-424-moon, hardware GPU, browser timing, deployment, or independent second-reviewer run was added.
- Atomic replacement of existing asteroid directories requires Linux `renameat2` and filesystem support. Unsupported replacement fails closed; a new output directory remains supported. Separate reader opens across a deployment can straddle generations; SHA-256 rejection plus retry handles that case.
- Loader waits are bounded under normal event-loop scheduling. JavaScript cannot preempt a blocked synchronous event loop or force an arbitrary custom transport to honor abort. The runtime rejects catalogs declaring more than 100,000 rows and bounds parsing; this is not a hardware latency certification.
- Offline byte identity is verified on the stated Python/Linux platform, not every libm/interpreter platform. Refreshing provider data requires explicit acquisition into a new source directory and review of the resulting artifact changes.
- Author contract review and failure-injection tests were used; no fresh independent reviewer was available. No pushes, merges, or changes to the canonical master were made.

Primary scientific sources: [JPL SBDB Query API](https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html),
[JPL CNEOS diameter estimator](https://cneos.jpl.nasa.gov/tools/ast_size_est.html),
[JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html).
