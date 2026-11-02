# Independent final sweep of the sixteen partial findings

Reviewer: `/root/final_sweep_nov01`. Date: 2026-11-01.
Reviewed integration HEAD `8b4d3207a33a8e5cdcb0276183ec93e7e66ddaf8` on
`fix/close-august-partials-20261031`, implementation range `8d330a07..8b4d320`.
Scoped browser-fixture followup reviewed through `a1977f828aea76a2828869823ccb7eae86b00aec`;
that commit changes only the previously reviewed browser test.

## Final verdict

No new important production-code defect was found in the integrated repairs.
The original subclaims remain accounted for; storage fidelity, display policy,
scientific-model scope, dormant API status and distribution rights have not been
collapsed into a single unsupported “accurate” or “fully activated” claim.
**All sixteen requested findings satisfy independent closure review at
implementation commit `a1977f828aea76a2828869823ccb7eae86b00aec`. No blocking
findings remain.** F-001 is approved after independent inspection of the complete
passing final browser matrix and the other completed integrated gates. Earlier
pending verdicts below are chronological evidence, superseded by the final
acceptance section. The scientific, platform and optional-feature limits remain
explicit; none has been counted as an unrun passing result.

The independent F-029 review approves the exact production head. Its latest
section supersedes its earlier blockers. Task 5 now has a clearly labeled
reconstructed archival report; that reconstruction is distinct from the
reviewer's direct source/probe evidence.

## Scope and method

Read the repair plan, current closure ledger, available Task 1/2/3/4/6 reports,
all three independent area reviews and their followups, original detailed
October 31 recheck, and owner-approved product policies. Inspected the complete
implementation change inventory, relevant production diffs, surrounding runtime
consumers and regression assertions. Independently ran the focused frontend
checks and artifact comparisons below. No runtime source edits, commits,
subagents, provider refreshes, browser jobs or full backend suites were performed.
The only authored file is this report. Concurrent coordinator evidence/ledger
changes were left intact.

## Per-finding closure matrix

| ID | Verdict | Original subclaims and integrated evidence |
|---|---|---|
| F-001 | **Pass** | `.github/workflows/frontend-ui.yml:19,21,52` retains locked installation, adds the script strict gate and makes the configured Chromium/tab-zoom/Firefox/WebKit jobs blocking. `tsconfig.scripts.json` covers maintained TypeScript tools; retired tools no longer require undeclared runtimes. The pinned install and source/UI/script/frontend/backend/build/science/GPU gates pass. The final complete browser matrix selects 170 cases: **136 passed / 34 existing platform skips / zero failures or flaky results**, including actual worker recovery and native hidden-tab acceptance. The restored WebKit environment and unchanged skip declarations were independently checked. No lint runner, native Windows support or new optional-engine certification is inferred. |
| F-006 | **Pass** | README's opening scope, feature list, runtime/API division and current data sections match `src/main.ts`: major bodies, 6,000 decorative stars, 50,000 asteroid display target, 5,000 Kuiper objects, local propagation and no enabled moon/satellite/cloud/nearby/planner UI. Source links, single active orbital worker, mandatory SHA-256, v2 storage and moon counts are corrected. The retained-module ADR supplies the feature-to-owner distinction missing from the original audit. |
| F-009 | **Pass** | `backend/solar_delivery.py:31` hashes the complete geometry arrays and omits them only for an exact content version; current scalars/provenance still travel. Limits are 512 KiB encoded / 2 MiB decoded, with 413 rather than silent field loss. The actual route opts into this transport while preserving full legacy responses. `solarPhysicsClient.ts:341,548` reconstructs only a matching accepted version and fences async ownership. Existing nonspatial AIA rejection, observed-input gates, single-flight, requested-JD cache keys and SILSO caching remain intact. Independent prior TCP evidence measured 262,645-byte first and 2,904-byte reused responses. This is a wire-delivery repair, not a claim of calibrated full-disk imagery or provider compute caching. |
| F-012 | **Pass** | `asteroidCatalogLoader.ts:168,171,231` implements validated v2 Float64 records while retaining legacy reads. The maintained builder emits v2/88-byte rows and the production loader admits their actual resource size. An independent direct struct/source join in this sweep confirms all 1,000,000 scalar values exactly match parsed pinned input across 100,000 unique identities. Literal legacy/v2 and fractional-epoch tests pass. Relative-time GPU behavior is preserved; Float32 rendering and fixed two-body dynamics remain explicitly qualified. |
| F-013 | **Pass** | `rebound_nbody.py:566` bounds native seek calls to 0.1 year, checks cancellation between calls, propagates cancellation from backward seeks and retains separate sparse checkpoint materialization/LRU. Original epoch bounds and worker-join ownership remain. Both deterministic direction/copy tests and the prior independent native probe support the repair (4.325/4.820 ms on that machine). The report discloses roughly 6% isolated throughput cost; neither the subsegment limit nor those timings is a universal wall-clock latency guarantee. |
| F-018 | **Pass** | Inherited stock production, departure capacity, return-transit survival and failed-delivery yield fixes are verified end to end by real planner and analytic tests. `mission/epo/verifier.py:40,128` requires candidate physical failure plus completed, untruncated search evidence; malformed nested results fail with actionable reasons. One real feasible nonzero-loss mission and two explicit negative contracts replace the invalid assumption that all original stress cases must succeed. The original thirty inputs and success policies remain opt-in failures, including Pluto/Eris search-inconclusive outcomes and unsupported masses. A default 422 is still safely disclosed rather than renamed as a successful mission. |
| F-021 | **Pass** | `fetch_jpl_sbdb.py:358` rejects publishing arguments before cache, fetch or source side effects; append helpers are removed and optional preview cannot publish. Existing query helpers remain available to the maintained builder. The obsolete TS acquisition/resolver and personal-path Puppeteer commands are retired with supported alternatives. Missing legacy `planets.js`, early rejection and unchanged-source regressions cover the original destructive ordering failure. |
| F-022 | **Pass** | `modelWorkerController.ts:26` owns exact reply matching, initialization/response deadlines, two lifetime restarts, stale-worker fencing, quarantine and disposal. `main.ts:911` still computes local state whenever no acceptable fresh snapshot is applied; Float64 arrays, hidden-moon filtering and import/global ownership are preserved. All six controller regressions passed in this sweep. The corrected real-browser acceptance passed **1/1 in 40.8 seconds**, requiring an actual injected in-flight kill, bounded replacement/retirement and repeated replacement state replies. The reviewed fixture SHA exactly matches committed `a1977f8`; the initial attempt-targeting failure remains documented below. |
| F-023 | **Pass** | `sceneAnnotations.ts:13` gives labels a constant CSS-pixel plane and body-relative clearance; `:34` renders decorative star directions at far depth without depth writes or world frustum culling. Main updates labels after controls/clip planes and retains lifetime disposal. Prior independent actual glyph captures at close/distant views and DPR 1/2 established equal visible dimensions and clearance; actual star pixels/occlusion passed again in the coordinator's November 1 matrix. Focus, physical/display sizing and resize behavior remain covered. |
| F-025 | **Pass** | Surface material and backend use the same documented Snodgrass–Ulrich Doppler-feature coefficient shape. Actual material-uniform/display-scope tests pass; backend metadata carries the adopted model/reference. Documentation and visible controls identify corona glow and eruption time-lapse as illustrative at either display scale. Parker geometry, flare lifetime/surface decay and decorative-clock ownership remain distinct. The prior reviewer independently checked the primary paper; this sweep does not claim a new physical speed or observed-render calibration. |
| F-026 | **Pass** | The unimported conflicting taxonomy resolver is deleted and its legacy acquisition path now exits before work. Maintained source-only taxonomy/albedo behavior and unknown sentinels remain; no orbital-radius or ambiguous X/E/O-to-metallic rule is reintroduced. Source integrity/deadline/cache behavior and explicit procedural fallback remain intact. The accepted largest-diameter prefix is still described as nonrepresentative, not repaired by inventing distributions. |
| F-027 | **Pass** | Independent count is 423 unique identities, retaining Puck 388 only; 46 source-backed mean radii and 377 null physical radii. `catalog.ts:800,824,834` separates source provenance/uncertainty and nullable physical AU from finite display estimates. Actual main info/focus tests cover unknown Callirrhoe. Lazy validation at `lazyMoonEphemerides.ts:79,117` accepts a positive cap no larger than the physical ceiling, preserving Puck's stricter 86.004 km cap. All 410 shard hashes validate; only Puck differs from baseline. The 424-row historical oracle remains byte-identical and is projected onto active identities. Existing model-specific residual limits are preserved, not replaced by a newly uniform physical-accuracy claim. |
| F-028 | **Pass** | `kuiperBeltUpdater.ts:24` suppresses work when both populations or their ancestors are hidden, leaves the last published JD pending and computes the current JD once on reveal. Paused/reveal tests inspect renderer uploads/matrices, and binary geometry remains corrected. Frontend and backend use validated explicit seeds and synthetic-candidate metadata; the old resonance alias is compatibility-only. The backend's reduced perturber list, including omitted Uranus, is disclosed rather than promoted to verified resonance dynamics. |
| F-029 | **Pass** | `satelliteSystem.ts:231,284` consumes mixed/trailing TLE pairs and uses matching catalog identity across feeds. `:940,982` validates complete finite worker arrays before mutation, bounds interpolation to the fastest period and otherwise propagates at display JD. `uiBindings.ts:96` preflights optional/all-or-none capabilities before effects. `simulationClient.ts:316,564,577` commits readiness/state before observers, preserves seek invalidation and implements orbital-element/JD contracts. The separate exact-head independent review passed 86 tests plus 12 native reentrancy scenarios and resolved all earlier blockers. Dormant modules remain unactivated; no SGP4 or universal eccentric-orbit precision claim is made. |
| F-030 | **Pass** | ADR 0006 names actual composition and lifecycle/state/transport owners, explicitly distinguishes retained APIs and requires deliberate activation with acceptance. Worker/annotation ownership has real modules; main remains an explicit composition root. Historical logs are labeled historical and navigation points to current status. The fix is not justified merely by reduced line count or wholesale rewiring. |
| F-031 | **Pass** | Original permission-required code terms remain. CONTRIBUTING, canonical research/archive navigation and binary/distribution policy exist. Deimos's unresolved map and acquisition entry are removed with generated fallback. `prepare-distribution.mjs:10,36` fails closed on unlisted/unreviewed/mismatched curated maps and packages original/data/Three.js notices with portable links. The 25 retired source images have a hash inventory; this sweep independently confirms the shortened rolling log's full archive is byte-identical to baseline. SILSO's separate noncommercial data boundary remains explicit. No blanket upstream rights clearance or optional container requirement is invented. |

## Initial browser acceptance defect (resolved below)

The coordinator's current run is captured in
`agent-notes/AUGUST_PARTIALS_CLOSURE_EVIDENCE_2026-10-31/browser-final-nov01.txt`.
The failed artifact is
`test-results/4187/app-smoke-actual-app-recov-31a58-y-terminated-orbital-worker-chromium/trace.zip`.
I read that trace without launching a browser.

At the reviewed head, `tests/browser/app-smoke.spec.ts:56` kills only a tick
from constructor attempt 1. The trace logs `worker initialization timed out` for
that worker. The controller retires it, creates a replacement, reaches ready and
submits repeated replacement ticks. The test then fails at line 76 because
`probe.killed` is **0**, expected **1**. It therefore never exercised its intended
in-flight silent termination. This is a concrete injection-targeting defect, not
evidence that recovery or local fallback failed. Do not solve it by accepting a
zero kill or changing production deadlines. Target the first actual tick once,
record the counter baseline at injection, retain bounded attempts/retirement,
and rerun the real-browser acceptance. The coordinator is arranging that repair.

## Independent execution in this sweep

Pinned Node `v22.23.2`, Vitest `v5.0.4`:

```sh
/home/nomad/.npm/_npx/f4985f1adc097c41/node_modules/node/bin/node \
  node_modules/vitest/vitest.mjs run \
  src/data/asteroidCatalogLoader.test.ts \
  src/sim/moonPhysicalIntegrity.test.ts \
  src/frontend/app/modelWorkerController.test.ts \
  src/frontend/app/sceneAnnotations.test.ts \
  src/frontend/features/solar/solarPhysicsClient.test.ts \
  src/frontend/features/solar/solarRotation.test.ts \
  src/frontend/features/asteroids/kuiperPaused.test.ts \
  scripts/prepare-distribution.test.mjs \
  scripts/asteroid/retirement.test.mjs --maxWorkers=1
```

Result: **9 files / 99 tests passed**, no skips, 3.38 seconds. This did not run
browser jobs, heavy native suites or the coordinator's full gates.

A separate read-only Python standard-library probe:

- Verified the captured SBDB response bytes/SHA, decoded the binary directly with
  `struct.iter_unpack('<I10dBBH', ...)`, joined by source ID and compared ten
  source scalar values for each of 100,000 unique rows: **1,000,000 exact matches**.
  It did not use the production writer or its source-comparison helper.
- Counted unique moon identities/source-backed radii directly from committed JSON:
  **423 / 46**, with **377 unknown** and only Puck row **388** active.
- Verified byte length/SHA of **410** public shards; compared baseline/current
  manifest hashes: **Puck alone changed**, retaining **86.004 km** acceptance.
- Compared the historical all-moon oracle and the archived former rolling log
  against `git show 8d330a07:<path>`: **byte-identical**. Oracle SHA-256 remains
  `71943bc60c7c542a8e4845c86cad2812382bd5d29a44db4e9af32f0f4ce8ad5c`.
- Confirmed the retired Deimos public file is absent.

`git diff 8d330a07..8b4d320 --check` passed.

Existing task/area reports supply independent native cancellation, full native
model/HTTP bytes, real mission mass flow, complete moon accuracy, rendered label
and retained-API evidence; those were inspected, not claimed as rerun by this
sweep. Final integrated source/UI/script/build/frontend/backend/browser results
must be assessed by the coordinator before an all-findings-complete statement.

## Independent review of the browser fixture correction

Reviewed the uncommitted `tests/browser/app-smoke.spec.ts` delta after the trace
above. **Approved as a scoped test-only correction**, subject to its actual
browser rerun. No production controller/deadline or scientific assertion changes.

The fixture now kills the first worker that actually receives a tick, once,
and records its creation/retirement baseline at that point. It requires one
post-injection replacement and one post-injection retirement, more than one
replacement tick **and actual replacement state reply**, final ready status,
exactly one injected kill and no more than three lifetime workers. The existing
initialization watchdog can therefore fire without preventing the intended
in-flight failure injection. Recovery before injection alone cannot satisfy the
new acceptance, and lifetime exhaustion still fails. This strengthens observable
recovery compared with the previous sent-tick-only assertion.

The inspected test file SHA-256 is
`56dd8fe9f5545709b417478146507c57523bfbe3ac7283d40f978ceca6163676`.
Its diff whitespace check passed. This approval resolves the fixture design
issue; the coordinator must still record successful runtime acceptance and final
integrated gates before closing F-022/F-001. Earlier matrix failure remains
preserved evidence and must not be relabeled as a passed matrix.


## F-022 runtime acceptance confirmed — `a1977f8`

Independently read the coordinator's recorded corrected browser result at
`agent-notes/AUGUST_PARTIALS_CLOSURE_EVIDENCE_2026-10-31/browser-worker-corrected-nov01.txt`:
**1 test passed in 40.8 seconds**; the actual silent-worker recovery test body
took 39.3 seconds. This reviewer inspected the result and did not launch a second
browser run.

Confirmed the current HEAD is `a1977f828aea76a2828869823ccb7eae86b00aec`, its sole
change is the reviewed browser fixture, and the committed/current test file has
SHA-256 `56dd8fe9f5545709b417478146507c57523bfbe3ac7283d40f978ceca6163676`,
exactly matching the independent fixture review above. The code review, native
controller checks and corrected runtime acceptance now justify **F-022 closure**.
No production deadline or implementation was changed to obtain that result.

**F-001 remains pending.** The coordinator reports the first November matrix as
96 passed / 34 skipped / 40 failed: the now-repaired worker fixture plus 39
WebKit host-library launch failures. Those launch failures still require an
actual passing configured-project run after environment repair. The backend
gate is also still running. Neither this scoped pass nor reported frontend/type/
build results constitute a passing final integration matrix.


## Earlier F-001 completed-gate and environment review — matrix was still running

Independently inspected `validation-runs.json`, the closure draft, and terminal
results in the named gate logs. The recorded results agree:

- Pinned install: 51 added / 52 audited / zero reported vulnerabilities.
- Strict source/UI/scripts plus ratchet/delta: zero diagnostics. The primary
  type log is at `8b4d320`; the only subsequent implementation commit is the
  separately typechecked and browser-accepted fixture correction.
- Frontend: **1,752 passed / 2 optional EGL skips**.
- Backend: **4,510 passed / 13 skips**, with explicit reasons: one optional
  SPICE case and twelve unavailable Tudat cases. Two deprecation warnings remain.
- Build: success, **8 maps / 4 notices**, with the disclosed large-chunk advisory.
- Scientific runner/workflow contracts: **21 passed**. Scientific acceptance
  summary binds exact `a1977f8`, records **11 baseline passes** and **8 detected
  mutants**, and preserves its own scope gaps rather than treating them as passes.
- Actual asteroid WebGL2 numerical output records 125 planar cases, two inclined
  cases and sub-minute motion; the stated maximum planar error remains below
  the unchanged acceptance limit. Hardware performance is not inferred.

These are independently inspected coordinator-run records, not duplicate suite
runs by this reviewer. The closure draft's **31** post-plan commits matches
`git rev-list --count 8d330a07..a1977f8`. Its claim of fifteen findings reviewed
and accepted, with F-001 still pending, is appropriately qualified. The evidence
index should gain a current final-results section after matrix completion so
its preserved assembly-time pending rows cannot be mistaken for current status.

Reviewed the `.gitattributes` delta: it changes only whitespace-error treatment
for raw logs, the archived Task 4 report and scientific XML under the fixed dated
evidence directory. It does not change source/tests, browser definitions,
scientific thresholds, content bytes or integrity checks. `git diff --check`
passes, and `git check-attr whitespace -- src/main.ts` remains unspecified.
Independently recomputed all **33** frozen `SHA256SUMS` entries: all match.

Reviewed the isolated WebKit restoration report, config, launcher, pinned
package manifest and recorded dependency checks. The config imports the original
repository config and only gives WebKit its explicit launcher, while retaining
all four projects, matching rules, timeout/worker settings and launch arguments.
The launcher invokes the original cached GTK/WPE MiniBrowser with its original
bundle paths plus the extracted Ubuntu library directory. It does not mock
browser behavior or exclude tests. Archived config/launcher files byte-match the
active cache files (SHA-256 respectively
`bd728318953874c15c4e5287bc9a7b3f4c25fa0542b7b18db61ea65507822330` and
`78666cf9fcc59facb4124f5b5b301a74d0c43338076160d996a3ab911f349174`).
Independently rehashed all **31** local `.deb` files against the captured
package manifest: all match. Recorded ldd results cover 13 distinct bundled
executables/libraries with zero missing dependencies. A qualified WebKit
application-page test already passed, but it is not the full matrix.

Read the active Playwright process's narrowly selected environment fields:
`FRAME_NATIVE_VISIBILITY=1`, `UI_TEST_PORT=4187`, and no
`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS`, `PLAYWRIGHT_BROWSERS_PATH` or
outer `LD_LIBRARY_PATH`. Its command uses the inspected isolated config. Thus
there is no global host-validation bypass, and Chromium/Firefox retain their
normal launch path. The earlier restricted-port 4190 and missing-library runs
remain failed evidence. **No important issue found in this gate/environment/doc
review; F-001 approval still awaits the terminal final browser-matrix result.**


## Final F-001 and all-sixteen closure verdict — `a1977f8`

**APPROVED. No remaining blocking finding was identified.** Current runtime/test
HEAD remains `a1977f828aea76a2828869823ccb7eae86b00aec`; the outstanding tracked
changes are documentation and evidence whitespace attributes only. The final
coordinator browser run exited successfully. Independently parsed the complete
JSON and matched its terminal text log:

| Project | Passed | Skipped | Failed / flaky |
|---|---:|---:|---:|
| Chromium | 57 | 0 | 0 / 0 |
| Chromium tab zoom | 3 | 0 | 0 / 0 |
| Firefox | 38 | 17 | 0 / 0 |
| WebKit | 38 | 17 | 0 / 0 |
| **Total** | **136** | **34** | **0 / 0** |

All **170** configured cases are present, each with one result at retry 0.
There are no global errors or per-test errors. Duration is 831.366 seconds
(**13.9 minutes**). This is a complete final matrix, unlike the preserved prior
failed/interrupted attempts. The existing actual-app smoke-file exclusions for
Firefox/WebKit remain explicit in the config; this is not cross-engine actual
3D-scene or all-GPU certification.

The 34 skips are the pre-existing Chromium-specific assembled-material, frame/
worker, startup-ownership/warmup and Chrome-tab-zoom cases: 17 each in Firefox
and WebKit. Independently compared every corresponding `test.skip` declaration
against `8d330a07`; all are unchanged. Native hidden-tab acceptance runs and
passes in Chromium rather than remaining an opt-in skip. No skip was added to
make this matrix pass.

Decoded the embedded JSON attachments directly:

- `silent-worker-recovery`: the first actual tick was injected into attempt 2
  after one cold-start retirement; final counters are **created 3, killed 1,
  retired 2, replacement ticks 2, replacement states 2**. Relative to injection,
  exactly one worker was created and one retired. This exercises both the cold
  initialization path and the intended silent in-flight failure while retaining
  the three-worker lifetime bound.
- `native-hidden-tab`: Chromium **156.0.8078.4**, two trusted hidden/visible
  transitions, and the first recorded resume tick has **stepMs 0** with a finite
  JD. This supports discarded hidden elapsed time without introducing real-time
  catch-up or weakening the fixed-step contract.
- `star-clip-pixel-counts`: **495 wide / 495 close / 0 occluded** pixels, retaining
  the close-focus visibility and foreground-occlusion contract.

Final records independently hashed:

- `browser-qualified-matrix-nov01.json`, 7,084,361 bytes, SHA-256
  `76acfd5628e262802d4d62b00471743b8badfb3f1750fb6863f61cce373905f4`.
- `browser-qualified-matrix-nov01.txt`, 29,471 bytes, SHA-256
  `ac26ae4e943b8e4a79ed91342647588904bc95e39270126779d71c1ef6648bb1`.

Together with the independently reviewed completed gates, corrected fixture,
source/data contracts and scoped scientific evidence, this closes **F-001** and
completes independent acceptance for **F-001, F-006, F-009, F-012, F-013, F-018,
F-021, F-022, F-023, F-025, F-026, F-027, F-028, F-029, F-030 and F-031**.
The approved implementation still has the disclosed optional EGL/SPICE/Tudat
skips, software-renderer versus historical hardware distinctions, Linux/WSL2
platform scope, finite model domains, illustrative display behavior, dormant API
composition, unknown physical measurements and independent third-party terms.
Those limits do not represent repaired defects being renamed or passed without
evidence. This approval covers the tested implementation and reviewed doc-only
finalization; subsequent runtime or gate changes require their own assessment.
