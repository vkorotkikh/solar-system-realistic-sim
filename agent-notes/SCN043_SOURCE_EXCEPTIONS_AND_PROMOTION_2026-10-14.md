# SCN-043 source exceptions and bounded promotion

## Scope and source semantics

Only moon models, their specific generators/tests, and the opt-in loader module
are changed. No `main.ts`, canonical tracker, general catalog source store, parent
worktree, or other agent write set is modified. The original four-model artifact
and its metadata remain byte-for-byte preserved. The previously delivered six-body
extension and native 75052 artifact remain separate and reproducible.

Daphnis uses the already pinned complete 9216-byte SAT393 type-17 SPK. Its three
native descriptors hand off at JDTDB 2455197.5 and 2457388.5. Independent direct
SPKPVN evaluation of both descriptors at each shared epoch gives jumps of
647.5196515539692 km / 79.7746497162883 m/s and 168.444650880279 km /
20.760364651107984 m/s. These are provider fit changes, not physical impulses.
Later native segments have priority at the exact shared epoch, following
[NAIF SPK segment precedence](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/spk.html#Segment%20Order%20and%20Priority).
Fitting and runtime cross-fades are restricted to each native arc. The model
honestly declares global continuity false and retains the dated jump evidence.

Daphnis domain: JDTDB 2451545.0 through 2469807.5, inside actual SPK descriptor
coverage 2433276.5 through 2469816.5. This is a legacy Cassini-imaging fit released
2016-10-11, with observations through 2016-07-16, not a newly observed 2025/2026
solution. Five available live Horizons oracle states remain in the independent
seven-date comparison; the two provider-unavailable recent dates use the explicitly
qualified native source. Native boundary probes are never omitted to claim green.

S2023_S38 is target 65273 relative to Saturn body center 699, from
`sat455_merged_DE440`. Geometric ECLIPJ2000/TDB position and velocity are fitted
directly, with no positive-semimajor-axis or elliptic-eccentricity assumption.
The independent vector at JDTDB 2451805.125 reproduces instantaneous two-body
`e = 1.001396285462024` and positive specific energy with the original Saturn GM.
That osculating classification is not an assertion of permanent N-body escape.
The request identity, geometric corrections, units, and frame are checked against
provider headers as specified by the [JPL Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html).

The S2023_S38 source has a half-day base grid plus 36 bounded 32-day periapsis
windows with 90-minute samples. Source and selection-validation phases are
strictly disjoint. Adaptive polynomial intervals retain enough bracketing position
and velocity constraints rather than forcing an underdetermined ellipse or
underconstrained polynomial. A fresh 6891-state phase is reserved for post-selection
cross-validation and is not used to fit coefficients or choose interval boundaries.

## Reproduction commands

Use Python 3.12.13 and `ci/backend-test-requirements.txt`; include SpiceyPy 8.3.0
for native SPK tests. Set `OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
MKL_NUM_THREADS=1` for deterministic fitting. No pre-existing repository cache is
required by offline generation.

```sh
python scripts/repair_spk_moon_ephemeris.py --target 635 --offline --check --output src/data/moonEphemerisDaphnis.json
python scripts/generate_s2023_s38_ephemeris.py --offline --check
python scripts/generate_moon_exception_validation.py --check
python scripts/repair_spk_moon_ephemeris.py --target 75052 --offline --check
python scripts/generate_moon_repairs.py --offline --check
```

## Remaining 411-record promotion: recommendation

The remaining 411 catalog records represent 410 unique model keys; the duplicate
Puck records retain their separate denominator entries and share one NAIF-715
model under the stricter original cap. Their measured payload is 59,274,899 bytes
as a combined JSON envelope (28,120,248 bytes gzip). Individually gzipped body
shards total 28,702,873 bytes, only about 2.1 percent larger than one compressed
monolith. Largest body: Metis, 1,622,237 JSON bytes / 747,749 gzip bytes.
These measurements are source JSON, not claims about production build transfer.
The accompanying JSON report records per-parent and largest-body measurements.

1. Recommended first promotion: content-addressed per-body data shards, with a
small catalog manifest containing target/center, domain, cap, SHA-256, byte count,
source-quality qualifier, and body-key aliases. Keep coefficient data out of the
initial JavaScript import graph. Fetch only explicitly requested bodies, bounded
concurrency, deduplicated in-flight requests, bounded resident cache, and strict
parser/identity checks before installing a model. Failed loads remain explicit
unavailable states, never unmarked scientific passes or silent mean-orbit success.
2. Parent bundles are simpler but not adequately bounded: Saturn alone is
30,045,649 JSON bytes / 14,223,582 gzip bytes. Jupiter is 14,215,411 / 6,738,255.
A single opt-in `Promise.all` that loads every bundle still transfers everything.
Do not extend the current 13-body opt-in loader into that all-body bulk request.
3. If all 424 moons must be simultaneously precise for one date, follow with
per-body time-window shards. Preserve global carrier phase, source handoffs,
neighbor-polynomial blend halos, and exact endpoint ownership. Time slicing needs
its own boundary and source-domain tests; it must not simply truncate segments
and silently change the mean-longitude epoch.

Promotion is not yet complete: cache-only candidate fits must first receive pinned
source/validation inputs and deterministic offline rebuild checks, like the current
reproducible extensions. Do not relabel the 411 shipped-model skips as passes while
that work is pending. The manifest/shard loader can be integrated independently of
`main.ts`; Peirce owns application selection/loading wiring. Source archives are
build/test inputs only, never browser payload. The present checkpoint removes the
two scientific failures without publishing an eager 64 MB catalog artifact.

## Tested numerical result

- Daphnis dense native grid, endpoints, and both sides of both handoffs:
  8.239943387508438 km / 0.9216652325237726 m/s maximum. Separate seven-date
  vector comparison: 25.91921527124919 km / 3.090201212806617 m/s.
  Caps remain 136.5 km / 10 m/s.
- S2023_S38 disjoint dense selection grid, hyperbolic probe, and endpoints:
  238.79038413905795 km / 6.386164323165674 m/s maximum. Seven-date vector
  comparison: 3.4668892201149624 km / 0.07161141314517613 m/s.
  Fresh post-selection 6891-state audit: 42.04170068088634 km /
  3.442211291536412 m/s. Caps remain 500 km / 10 m/s.
- All-424 candidate gate: **425 passed, zero skipped** (424 records plus denominator
  assertion). This is candidate evidence, not a claim that every model is shipped.
- Shipped frontend suite: **437 passed, 411 explicitly skipped**, 34 files.
  Only 13 records have shipped reproducible models; the remaining 411 require
  source pinning, offline reproduction, and bounded lazy promotion.
- Focused Python source/reproduction regressions: **16 passed**, with SpiceyPy
  8.3.0 enabled. Includes both clean-checkout regressions and full byte equality
  against the six-body, native 75052, Daphnis, and S2023_S38 artifacts.
- Strict TypeScript still has **217 pre-existing diagnostics** outside this work.
  The unchanged ratchet permits 226; no moon diagnostics remain. This is not a
  claim of a clean strict typecheck, and its baseline was not edited.

The two new runtime artifacts total **1,637,952 bytes** uncompressed. Their hashes
and source-input footprint are recorded in the separate machine-readable artifact
report. The source pin archive is build/test-only and is not imported by the browser.

## Final checkpoint validation

- All local `scripts/test_moon*.py`: **19 passed** (the focused 16 above plus the
  existing three candidate-input tests).
- Full `backend/tests`: **2662 passed, 1 skipped, 2 warnings**, 229.24 seconds.
  The skip is not counted as a pass.
- Canonical parent-generator compatibility (`integration84ac256` export):
  **20 catalog-generation tests passed** and original four-model `--offline --check`
  byte identity passed against the assigned worktree artifact.
- Final TypeScript ratchet: **217/226**, no new diagnostic bucket. Final four
  targeted frontend files: **24 passed, 411 explicitly skipped**.
- Daphnis and S2023_S38 CLI `--offline --check`, independent runtime-oracle
  `--check`, and the Python byte-reproduction tests all pass without acquisition.
- No scientific failure remains in the **all-424 candidate gate**. Production
  promotion of 411 records is still unfinished; it must not be conflated with the
  13-record shipped-model coverage or with the existing strict-TypeScript debt.

The `rawResponseSha256` fields hash captured JSON cache envelopes, not HTTP transfer
encoding. All source rows are independently derived from those provider tables,
not from fitted coefficients. Original API query strings, headers, and normalized
row hashes are retained as distinct evidence.
