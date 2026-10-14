# Codebase scan and issue / problem / bug tracker — 2026-10-10

> Current status (2026-10-14): see [the master tracker](MASTER_ISSUE_TRACKER_2026-10-11.md) and [active remediation effort](REMEDIATION_EFFORT_2026-10-14.md). The dated findings below preserve their original snapshot; they are not current merge status.


Fresh repository sweep across the **three newest local branch tips**, as confirmed by the user. This replaces the October 7 tracker as the current assessment while preserving that historical record and its stable IDs. The newer main/CI implementation repairs substantial solar mathematics, ingestion, process isolation and security work. It still has reproducible numerical, rendering, mission-model, recovery, tooling and documentation defects.

**Result: 15 newly registered findings, SCN-050–064, plus a branch-specific reconciliation of all 49 previous entries.** Across the selected tips, 55 IDs have an open finding on at least one branch and nine remain verification/capability queues. Main/CI have 45 open entries and ten scoped closures; trajectory has 54 open entries and one new-main-only entry that does not apply. These counts include model limitations, dormant activation hazards, a documented transport tradeoff, and documentation/tooling problems; they are not counts of independently exploitable production bugs. “New” means new to this register, not introduced by the latest commits.

This is a broad source sweep with fresh tests, independent numerical probes, controlled transport cases and browser interaction evidence. It cannot prove that every defect has been found. No application code, dataset, dependency declaration or branch was changed; no fixes, merge, staging or commit were performed.

## 1. Audited snapshots and branch differences

| Label | Branch / exact commit | Commit time | Git tree |
|---|---|---|---|
| M | `main` — `e7de6cc20ea0880da230432ea0c44f8f6ae93829` | 2026-10-10 01:57:51 −04:00 | `7feafab6cfd67455cc4bea8c47cba08e95bbeab6` |
| C | `fix/ci-red-on-main` — `0523a5bc94360f281f5c8c692b16a4fbc6dd60bc` | 2026-10-10 02:53:11 UTC | Same tree as M |
| T | `fix/trajectory-amplification-defense-in-depth` — `e40fc8cff85a8c7cf5dd24d0a135552faf424a20` | 2026-10-09 01:34:10 −04:00 | `59c58881470f8a240195e1f1bba7b92ae1565d53` |

Selection uses local tip committer dates with remote aliases deduplicated. **Remote freshness is unverified:** `git fetch --all` failed because GitHub SSH public-key authentication was unavailable. These are the selected local tips, not an assertion about inaccessible newer remote commits.

M and C are byte-identical complete trees; main is the merge of the CI fix. Tests executed on M apply to C by source identity; there was no redundant third full-suite run. T differs from M in 104 tracked paths, with approximately 32,030 inserted and 3,739 removed text lines. Its solar/security/CI implementation is older. Its physics/mission/renderer defects must not be assumed fixed by work on other, unselected branches such as `fix/physics-math-findings` or `fix/solar-display-truth`.

The user's working checkout remains **`fix/solar-status-chip-on-main` at `b29132842e60e2d404a8d864757bf98696a60120`**. It is not one of the selected tips. Product tests used `git archive` extractions under `/tmp/solar-sweep-2026-10-10-j1gnowo_/{main,ci,trajectory}`. The science mutation verifier used a separate local clone at the exact main commit. Source locations below refer to those named commits, **not necessarily the current checkout**; recover them with `git show <commit>:<path>`.

Durable evidence: [directory guide](CODEBASE_SCAN_2026-10-10_EVIDENCE/README.md), [branch record](CODEBASE_SCAN_2026-10-10_EVIDENCE/branches.json), [inventory and source integrity](CODEBASE_SCAN_2026-10-10_EVIDENCE/inventory.json), [evidence hashes](CODEBASE_SCAN_2026-10-10_EVIDENCE/MANIFEST.sha256). Existing untracked audits and evidence were preserved. This tracker and its evidence remain uncommitted.

### Reading the register

- **OPEN / OBS:** reproduced in this scan; the row states whether this is a browser, numerical, API, controlled-input or dormant-module observation.
- **OPEN / CODE:** current source establishes the mechanism; a complete runtime consequence was not measured.
- **RESOLVED (scope):** fresh reproduction or specific passing regression coverage supports the named correction. It does not certify the surrounding subsystem.
- **VERIFY:** capability, historical hypothesis or broader acceptance gate requiring more evidence. Excluded from open counts.
- **P0:** correct before relying on the affected scientific claim; **P1:** next release/reliability work; **P2:** follow-up correctness, model, capability or tooling work. These are sequencing priorities, not CVSS ratings.

All entries were reviewed on October 10, 2026, America/New_York. Owners are **unassigned**. Preserve IDs when fixing, splitting or superseding entries.

## 2. Highest-impact triggers and latent hazards

| Trigger | Observed failure / scope | IDs |
|---|---|---|
| Request a near-antiparallel Lambert transfer | At 179.999999°, returned velocity is wrong by 5.101 km/s and independent REBOUND propagation misses the target by 209 million km despite a ~1.12e-10-day scalar TOF residual. All tips. | SCN-064 |
| Split an otherwise identical vehicle burn into two | `[4.8]` km/s is infeasible but `[2.4,2.4]` is feasible, spending below the original 50 kg reserve. All tips. | SCN-052 |
| Zoom out after Earth/Mars subdivision | Actual attached quadtree meshes go 6 → 36 → **0**. Separately, the planet shader applies face translations after radius projection, placing a reference Earth vertex ~0.5 AU from its centre. All tips. | SCN-058, SCN-061 |
| Trust the benchmark's zero error | All three reference scenarios remain incomparable; reported mean error is still 0.0 with zero coverage. All tips. | SCN-012 |
| Advance REBOUND past its supported upper date | `step(1)` at the upper bound emits an unsupported epoch with `fidelity: high`; direct seeking to the same date rejects it. All tips. | SCN-053 |
| Recover SWPC after a brief outage | Failed aggregate snapshot persists at +5 and +299 seconds; recovery is fetched only at +301 seconds. Main/CI reproduced. | SCN-010 |
| Upstream headers trickle or DNS stalls | A 50 ms realtime acquisition budget takes ~404 ms for local byte-drip headers or ~201 ms for a controlled resolver delay. Thread ownership survives the deadline. Main/CI. | SCN-004 |
| Run normal tests with the existing H1 audit archive present | Six archived suites fail imports on both distinct source trees even though all product suites pass. | SCN-026 |
| Invoke the moon updater with `--help` | In an isolated temporary copy, a matching empty upstream table causes exit 0 and overwrites the catalog with `[]`. The user's real catalog was untouched. | SCN-033 |
| Enable presently dormant features | Accepted float64 FITS fails downstream PFSS admission; Tudat energy changes under translation; SRP/tide callbacks fail on actual REBOUND pointer arguments. These are activation hazards with explicit scope. | SCN-051, SCN-055, SCN-057 |

The older T branch additionally retains the wrong PFSS basis, valid-FITS crash, lost grid semantics, caller-controlled solar rate identities, rejected preview origins and stale observation assimilation. None should be reintroduced over the main fixes.

## 3. Fresh validation matrix

Frontend validation uses Node **22.23.2**, npm **10.9.8**. Python is **3.12.13**. The initial npm dependency installation used the host Node 24/npm 11, then the checks used the pinned binaries. Browser evidence uses Chromium software WebGL and host Node 24 as documented in its report. No hardware GPU benchmark is claimed.

| Check | Main / identical CI tree | Trajectory | Evidence under `CODEBASE_SCAN_2026-10-10_EVIDENCE/` |
|---|---|---|---|
| `npm test`, clean extracted tree | **PASS: 21 files, 309 tests** | **PASS: 14 files, 162 tests** | `validation/*-02-npm-test.log` |
| Same command with pre-existing H1 archive copied into snapshot | **FAIL: six archival suites; product tests pass** | Same six archival failures; product tests pass | `validation/*-with-h1-archive.log`, `h1-archive-discovery.json` |
| Strict `npm run typecheck` | **FAIL: 219 diagnostics** | **FAIL: 240 diagnostics** | `validation/*-03-npm-run-typecheck.log` |
| `npm run typecheck:ratchet` | **PASS: 219 within 226 baseline; no bucket growth** | Command absent | `validation/main-08-npm-run-typecheck-ratchet.log` |
| `npm run build` | **PASS** | **PASS** | `validation/*-04-npm-run-build.log` |
| Planet positions | **PASS: eight planets × six epochs = 48 rows** | Same gate passes | `validation/*-05-npm-run-verify-planet-positions.log` |
| Moon frame/accuracy gate | **PASS: 20 moons × seven epochs = 140 rows** | Same gate passes | `validation/*-06-npm-run-verify-moon-frames.log` |
| Full `pytest -q backend/tests` | **PASS: 2,142; 246.35 s**, exact declared CI package list | **PASS: 458; 61.34 s**, runtime requirements plus separately added `httpx2` | `validation/main-backend-tests.log`, `trajectory-backend-tests.log` |
| Fresh runtime-requirements-only backend collection | **FAIL: 11 collection errors**, missing `httpx2` with resolved Starlette 1.7 | **FAIL: eight collection errors**, same missing prerequisite | `validation/*-fresh-install.log` |
| CI verifier/workflow contracts | **PASS: 21 tests** | Absent | `validation/main-ci-contracts.log` |
| Exact R3/R4 baseline plus mutation verifier, `all` | **PASS: six required nodes, six mutants killed** | Absent | [structured summary](CODEBASE_SCAN_2026-10-10_EVIDENCE/validation/science-gate/summary.json), JUnit siblings |
| `npm audit --json` | **11 affected entries: 2 critical, 6 high, 2 moderate, 1 low** | Same counts | `validation/*-07-npm-audit---json.log` |
| Browser bootstrap and interaction probes | Boots with ten body options, no pageerrors with WebGL; accessibility/no-WebGL defects reproduced | Same startup result and shared defects | [browser observations](CODEBASE_SCAN_2026-10-10_EVIDENCE/frontend/browser-results.json) |
| Main client success → 503 → recovery | Last good physics retained; realtime fresh → stale → fresh | Old flow separately inspected; no equivalent recovery assertion | [client observations](CODEBASE_SCAN_2026-10-10_EVIDENCE/frontend/delivery-results.json) |

Registry audit entries are not unique vulnerabilities or proof that the production Three.js bundle is exploitable. Exact advisory payloads are retained. The ratchet prevents growth; it does not make strict TypeScript pass. Runtime requirements and the pinned CI test environment are distinct: main's reproducible test lane is real progress, while the README/runtime-only developer path still fails collection.

**Production solar latency is not established by the 2,142-test pass.** `backend/tests/conftest.py:68–89` raises selected content tests from the production 18-second budget to 60 seconds because slow CI hosts exceed 18 seconds. The browser now allows 20 seconds and the server caps configuration at 19 seconds; this fixes the old timeout-contract mismatch, but a fresh production-budget, five-minute browser delivery gate remains outstanding. Process kill/reap, saturation, crash, cancellation and capacity-recovery tests are covered separately.

The science mutation gate detects the old recurrence, wrong equal-area weighting, duplicate m-normalization, corrupt source-surface factors, omitted shell crossings and vector-magnitude WSA expansion. It does not certify real GONG pixels, calibrated WSA speeds, deployment settings, all frontend types or multi-worker release architecture. Main deliberately disables observed GONG runtime acquisition and unvalidated assimilation/spatial AIA use; hybrid returns synthetic provenance, and data-driven physics reports unavailable.

## 4. Existing IDs: current branch-specific register

The linked domain reports carry precise snapshot line references and full reproduction details: [solar](CODEBASE_SCAN_2026-10-10_EVIDENCE/solar/report.md), [backend integration](CODEBASE_SCAN_2026-10-10_EVIDENCE/backend/integration-review.md), [physics/data/mission](CODEBASE_SCAN_2026-10-10_EVIDENCE/physics/REPORT.md), [frontend](CODEBASE_SCAN_2026-10-10_EVIDENCE/frontend/REPORT.md). Historical acceptance criteria remain available in the [October 7 tracker](CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-07.md); where changed, the criteria below supersede them.

| ID / priority | Main / CI | Trajectory | Current evidence and closure criterion |
|---|---|---|---|
| SCN-001 · P0 | RESOLVED: examined basis/decomposition | OPEN / OBS | M has correct P₂=-.125/P₃=-.4375 at μ=.5, overlap ~1.28e-14 and quadrupole reconstruction; mutation gate passes. T returns -.633911/-1.134220 and overlap -.945074. Preserve independent harmonic/pole/field gates. |
| SCN-002 · P1 | RESOLVED: original dtype crash | OPEN / OBS | Valid frozen FITS parses on M. T raises `AttributeError` on `np.float32.newbyteorder`. Use a valid parser-to-source-status fixture; M's separate float64 admission defect is SCN-051. |
| SCN-003 · P1 | RESOLVED: explicit grid contract | OPEN / CODE | M carries WCS, orientation, exact area weights and weighted decomposition; T still maps sine-latitude pixels into uniform θ assumptions. Preserve fixture orientation/area/harmonic gates. Real observed accuracy remains unverified. |
| SCN-004 · P1 | OPEN / OBS, narrower residual | OPEN / CODE | M bounds bytes/redirects/framing/gzip and body reads, but blocking header/DNS acquisition exceeds total deadlines. T retains unbounded legacy acquisition and wrong-rotation fallback. Require bounded completion/resource recovery for DNS, headers, bodies and cancellation; GONG residual is offline on M. |
| SCN-005 · P1 | OPEN / CODE + browser OBS, materially improved | OPEN / CODE | M separates realtime/physics polling and adds process containment, last-good state and compatible deadlines, but no shipped UI consumes `getSolarDeliveryStatus`: refused backend still displays “Live simulation” without solar error/source state. T retains 900 ms polling/2.6 s timeout and observation coupling. Require visible provenance/state plus real production-budget dev/preview delivery. Old 4.094 s is historical, not remeasured. |
| SCN-006 · P1 | RESOLVED: default preview CORS | OPEN / OBS | Fresh localhost and 127.0.0.1:4173 preflights pass on M and fail on T; 5173 passes. Preserve origin tests and verify actual configured deployment/browser resources separately. |
| SCN-007 · P1 | RESOLVED: original identity bypass/store bounds | OPEN / OBS | M collapses 50 rotating XFF/key values to one transport identity: 36 admitted/14 rejected; bounded stores/trusted proxies covered. T admits all 50 and creates 50 entries. Preserve authenticated/trusted transport policy, caps and eviction. |
| SCN-008 · P1 | RESOLVED: `/solar/physics` admission | OPEN / OBS | M rejects ±1e30 before compute and bounds JDTDB to J2000±200 Julian years. T reaches the recording compute stub. Do not generalize closure to AIA tile historical-date coverage: its route only resolves finite aliases; that contract remains under SCN-048. |
| SCN-009 · P1 | RESOLVED by explicit disable/fallback | OPEN / OBS | M stale input leaves .8 unchanged, `applied=false`, `disabled_unvalidated`; T changes .8→.625 with confidence0/weight.25. This is safe disabling, not delivered validated assimilation. Require independently validated epoch/provenance policy before enabling. |
| SCN-010 · P1 | OPEN / OBS | OPEN / CODE | M aggregate failure cache suppresses SWPC recovery until normal 300 s expiry despite 4.5 s failure-backoff machinery; T retains mechanism. SILSO last-known-good handling is improved and must be preserved. Gate failed/partial snapshots, bounded retry and source age independently. |
| SCN-011 · P2 | RESOLVED: UTC ingestion contract | OPEN / CODE | M canonicalizes AIA dates to UTC before frontend `Date.parse`; relevant backend tests pass. T keeps raw zone-less strings. Preserve canonical UTC ingestion and cross-timezone freshness tests; old timezone offsets are not a new live-provider observation. |
| SCN-012 · P0 | OPEN / OBS | OPEN / OBS | Fresh Kepler benchmark: three scenarios, zero comparable, coverage0 and mean error0.0. Source `backend/benchmark/accuracy.py:509–538`. Require independent fixed states, nonzero comparison coverage and unavailable/null undefined metrics. |
| SCN-013 · P1 | OPEN / OBS, CPU input arithmetic | Same | Shader absolute float32 JD2461320.125 rounds to2461320, ULP .25 day. No fresh GPU position-error estimate. Use relative/split time, CPU-vs-GPU subday gates and actual GPU readback. |
| SCN-014 · P1 | OPEN / OBS, ACBF format validator | Same | Own 100,000-record round trip reports99,916 mismatches, max epoch error≈.125 day. This is not evidence of corruption in the separate shipped ASPH artifact, which passes its integrity gate. Define field-specific precision/encoding contracts. |
| SCN-015 · P2 | OPEN / CODE, population policy | Same | App selects first50,000 records from a diameter-descending catalog. Declare large-body subset or implement reproducible representative sampling and population gates. No new bias distribution measured. |
| SCN-016 · P1 | OPEN / CODE + primary-source identity | Same | “Earth” uses JPL's EM Bary elements without lunar correction. The [JPL table](https://ssd.jpl.nasa.gov/planets/approx_pos.html) was rechecked. Label EMB explicitly or derive geocentric Earth; compare both target3 and399 before asserting Earth-state accuracy. |
| SCN-017 · P1 | OPEN / OBS | Same | Fixed-element velocity omits secular-element derivatives. Converging finite differences show Neptune8.0674 m/s, Uranus6.6387, Saturn2.8141, Earth.2716 at the recorded epoch. Internal consistency, not live Horizons residuals. Differentiate all evolving elements/axes and gate multiple steps/epochs. |
| SCN-018 · P2 | OPEN / CODE, model coverage | Same | Pluto has fixed elements and is absent from the eight-planet gate. Declare interval/fidelity and add independent Pluto state tests. No fresh external Pluto error estimate. |
| SCN-019 · P1 | OPEN / CODE | Same | Acquired cargo is absent from the chronological return-burn mass ledger. Fuel is carried across burns; the old blanket “every leg resets mass” claim is wrong. Gate cargo/staging/ISRU/loss transitions and return propellant sensitivity. |
| SCN-020 · P1 | OPEN / OBS | Same | Infeasible100+100 km/s case yields0 failure probability with zero uncertainties;1,275 kg reported margin is entirely jettisoned fuel. Existing mission verifier separately rejects infeasible logistics. Propagate deterministic feasibility and re-close every sampled budget; do not claim endpoint acceptance from this service probe. |
| SCN-021 · P1 | OPEN / OBS | Same | Sgr A* and M87 radii are98.95×/101.05× smaller than their own2GM/c² values; a propagation consumer exists. Derive one consistent unit system and gate dependent radii/conversions. Speculative model truth is separate. |
| SCN-022 · P2 | OPEN / OBS, expansion hazard | Same | At e=.99, six-step Newton solver has worst residual1.3874e8 rad. Shipped loaded ASPH population max e=.5555, so current population divergence is not established. Safeguard solve or bound domain and gate callers. |
| SCN-023 · P1 | OPEN / OBS + CODE | Same | Metric-kinematics probe moves canonical Earth world state by.00200399 AU while independent sampled state stays unchanged; those world states feed perturbers. Separate canonical simulation states from display offsets; enforce experiment on/off invariance. |
| SCN-024 · P2 | OPEN / CODE + browser work OBS | Same | KBO propagation/upload remains unconditional during pause. Browser records further buffer uploads with date paused, but counters aggregate all effects and are not KBO-only bandwidth. Require no unnecessary unchanged-state uploads with per-buffer instrumentation. |
| SCN-025 · P1 | OPEN / OBS:219 diagnostics | OPEN / OBS:240 | Main ratchet passes219/226, strict check fails; build is independent. Close when strict typecheck exits0 without weakening settings. |
| SCN-026 · P1 | OPEN / OBS | OPEN / OBS | Clean trees pass, but copying existing H1 evidence into each temporary tree makes bare `npm test` fail six archive suites. Deliberately scope discovery while retaining evidence. Copying October7 evidence alone passes. |
| SCN-027 · P1 | OPEN / OBS, narrowed developer path | OPEN / OBS | M now has a pinned passing CI backend test environment; runtime-only install still fails11 collection imports, T fails8. Document the tested dev/test setup; verify fresh README path→suite without manual additions. Do not claim main has no dependency pins. |
| SCN-028 · P1 | OPEN / OBS, registry advisories | Same | Eleven affected entries,2critical/6high/2moderate/1low. Review reachability and update toolchain with lockfile/test/type/build evidence. No production exploitation conclusion. |
| SCN-029 · P1 | RESOLVED: missing tracked CI workflow | OPEN / CODE | M has `.github/workflows/r3-r4-science.yml`, full backend lane, frontend Vitest tests/build/type ratchet and mutation gate; local equivalents pass. Global zero-error TS, planet/moon command enforcement, live/browser/load lanes and external required checks are remaining release gates, not proof no CI exists. |
| SCN-030 · P1 | OPEN / browser OBS | Same |240px viewport has280px document/body width; canvas lacks keyboard camera control; desktop→mobile focus falls to body; drawer background is not inert/modal; paused HUD rewrites persist. Preserve working Escape restoration. Require real keyboard/zoom/drawer/screen-reader acceptance; the historical design is not an implementation. |
| SCN-031 · P2 | OPEN / browser OBS | Same | No WebGL yields `Error creating WebGL context.`, empty body selector, uninitialized date (—), and zero accessible alerts. Catch startup/context loss and offer an accessible recovery path; gate unavailable WebGL. |
| SCN-032 · P1 | OPEN / CODE | Same | README still instructs REBOUND/Tudat selection and Connect, absent from shipped entry UI; moons remain hidden; missing asteroidWorker path remains listed. Align user-facing claims and distinguish API/library features. |
| SCN-033 · P2 | OPEN / OBS | Same | Texture CLI imports missing `.js`; moon updater `--help` overwrites a temp catalog with[] after a matched empty table. Implement safe help/dry-run, validate nonempty source and atomically publish intentional outputs. |
| SCN-034 · P2 | OPEN / CODE + controlled OBS | Same | Mutable upstream regeneration remains; external-output builder writes three temporary files before `relative_to(PROJECT_ROOT)` raises. Pin archived inputs, support external destinations and transactional writes; full dataset rebuild not run. |
| SCN-035 · P1 | OPEN / CODE, documentation/provenance | Same | No tracked repository LICENSE/COPYING; moon attribution includes “Unspecified by provider; verify for redistribution.” Owner must specify distribution terms and complete attribution. This is an observed documentation gap, not a legal opinion. |
| SCN-036 · P1 | RESOLVED: authentication/per-subject admission | OPEN / CODE | M adds authenticated network profile, bounded message handling and per-subject admission alongside global ownership; corresponding resource/security tests pass. T retains global-only fairness mechanism. Multiple valid subjects can still fill all slots; exclusion/session-lifetime fairness, multi-worker deployment and long-lived load remain SCN-047/048. |
| SCN-037 · P2 | OPEN / CODE, timing contract | Same | Backend advances `time_scale*frame_time` even if compute overruns; simulation slows relative to wall seconds. Define fixed-step versus wall-time semantics and test slow engines with bounded catch-up if wall-time promised. |
| SCN-038 · P2 | OPEN / CODE, animation semantics | Same | Sun visuals use wall time during pause/reverse and do not follow simulation JD. Relative-time precision is preserved. Declare decorative versus simulation motion and gate pause/reverse/reduced-motion behavior. |
| SCN-039 · P2 | OPEN / CODE, configuration | Same | Main bootstrap uses page host plus fixed8042 backend port; no deployed override in this path. Some parsed UI-size/renderScale configuration is also unused by bootstrap. Define one consumed deployment/viewport contract and test nondefault values; mere mixed casing is not a separate bug. |
| SCN-040 · P1 | OPEN / workspace OBS | Same workspace condition | Historical audit/index/H1 evidence and this report remain untracked; fresh clones omit them. Intentionally archive the selected artifacts together after review. No unrelated files were staged or committed. |

## 5. New findings and actionable closure gates

### SCN-050 · P2 · OPEN / OBS · All tips — Hathaway normalization clips an artificial plateau

`backend/sim/solar_physics.py:125–143` on M uses `b*sqrt(3/2)` as the peak for `x³/(exp(x²)-c)`, although that peak assumes c=0 and the configured c=.71. Independent differentiation/bisection gives **58.3898 months**, while normalization uses **66.1362**. The true peak is1.03433 times that denominator; clamping produces a flat top from approximately51.03–66.13 months. This promotes the demonstrated normalization portion of SCN-042; broader frame/solar semantics remain separate. The frontend fallback uses the same historical normalization and also needs review when repairing it.

**Closure:** normalize against the actual parameterized maximum, or explicitly document an intentional clipped visualization policy. Gate derivative zero, peak value and shape independently. [Solar SOL-03 and both JSON probes](CODEBASE_SCAN_2026-10-10_EVIDENCE/solar/report.md).

### SCN-051 · P2 · OPEN / OBS, latent/offline · Main/CI only — Parser-accepted FITS fails PFSS admission

`gong_magnetogram.py:688–711` subtracts an allowed floating-point monopole; `pfss_magnetogram.py:1805–1822,1644–1647` then reconstructs original bytes and demands their original SHA. That arithmetic is not lossless. A checksummed180×360 float64 fixture with an admissible ~1e-13 G mean and tiny1e-30 pixel parses successfully but its immutable snapshot raises **“snapshot native header fields are inconsistent”** at PFSS admission.

This is not the old dtype crash, and no live GONG artifact with these pixels was observed. Observed runtime is disabled on M. **Closure:** preserve admitted original artifact information or a well-defined canonical representation; parser→solver round trips must work for every supported BITPIX/scaling/unit combination while tampered artifacts remain rejected. [Solar SOL-04](CODEBASE_SCAN_2026-10-10_EVIDENCE/solar/report.md).

### SCN-052 · P1 · OPEN / OBS · All tips — Burn partitioning spends protected reserve

`backend/mission/vehicle_service.py:79–80` reapplies reserve fraction to remaining fuel on every burn. For100kg dry+1,000kg propellant+100kg payload, Isp300s and5% reserve, `[4.8]`km/s is infeasible while `[2.4,2.4]` is feasible and leaves only**34.7523kg**, below the original50kg reserve. Fuel does carry across burns; the reserve floor erodes. Mission agents call this service for outbound/return burns.

**Closure:** define reserve against the intended stage baseline, maintain a chronological ledger, and gate burn-partition invariance without intervening mass/staging changes. Exclude discarded fuel from onboard margin. Keep acquired-cargo SCN-019 and risk SCN-020 separate. [Physics PHYS-N01](CODEBASE_SCAN_2026-10-10_EVIDENCE/physics/REPORT.md).

### SCN-053 · P1 · OPEN / OBS · All tips — REBOUND playback escapes validated epoch coverage

`backend/sim/rebound_nbody.py:404–408` computes an integration target without the supported-JD validator used by seeking. At upper bound**2469807.5**, `step(1)` returns2469808.5 with **high fidelity**; directly setting that epoch raises. `backend/server.py:4353–4354` on M reaches stepping during playback.

**Closure:** enforce the same finite/epoch contract for initialization, seek and positive/negative advancement, and stop or explicitly downgrade out-of-coverage states. Gate both endpoints through engine and playback contracts. Preserve correct IAS15 seeding and frame/time units. [Physics PHYS-N02](CODEBASE_SCAN_2026-10-10_EVIDENCE/physics/REPORT.md).

### SCN-054 · P2 · OPEN / OBS · All tips — Backend Kuiper binary initialization violates its own orbit invariants

`backend/sim/kuiper.py:156–157` floors separation³ at1e-12, altering supported separations below~14,960km. At1,000km with its own nominal mass, relative circular speed is**2.9699e-5AU/year** instead of**.0017184AU/year** (~57.9× too slow). Offsets at`:173–193` also reverse conventional companion/primary mass weighting; q=.35 displaces the weighted centre by~481km. Speed failure is independent of ratio naming.

Backend particles are subsequently massless test particles: initializer repair alone does not create persistent gravitational binaries. **Closure:** remove unit-inappropriate floors, define q, gate speed and weighted position/velocity, and honestly label/integrate mutual motion. Assess five-decimal position serialization before claiming1,000km pair resolution. [Physics PHYS-N03](CODEBASE_SCAN_2026-10-10_EVIDENCE/physics/REPORT.md).

### SCN-055 · P2 · OPEN / OBS, optional runtime · All tips — Tudat energy mixes coordinate origins

`backend/sim/tudatpy_hooks.py:243–245` stores Sun relative to SSB and planets relative to Sun. `get_energy():425–434` subtracts those mixed states directly. Injecting the documented Sun/Earth representation and translating only the Sun's SSB position by.01AU changes energy by**2.019%** while the physical relative orbit is unchanged. This exercised the real diagnostic on injected states; Tudat itself was not installed/run.

**Closure:** reconstruct one declared inertial frame/origin before potential and kinetic energy, gate translation invariance, and repeat with actual Tudat. Do not reopen its separately corrected output-state conversion. [Physics PHYS-N04](CODEBASE_SCAN_2026-10-10_EVIDENCE/physics/REPORT.md).

### SCN-056 · P2 · OPEN / OBS · All tips — Single-family EPO execution omits its policy

`backend/mission/epo/runners.py:64–74` registers a family's policy only in `run_families`, not `run_family`. With a family requiring score≥100, failure≤.01 and valid embedded verification, a stub planner result score−100/risk.9/invalid returns**one pass** directly; the aggregate entry rejects all three violations. The actual verifier runs; only planner output is controlled.

The current smoke workflow uses the aggregate method, so its policy is not shown bypassed. **Closure:** enforce policy identically through both public entry points, independent of previously registered verifier state. [Physics PHYS-N05](CODEBASE_SCAN_2026-10-10_EVIDENCE/physics/REPORT.md).

### SCN-057 · P2 · OPEN / OBS, dormant · All tips — Force callbacks fail with REBOUND's actual argument

`radiation_pressure.py:190` and `galactic_tide.py:124` access `reb_sim.particles`, but real REBOUND invokes callbacks with an `LP_Simulation` pointer. Registered observer wrappers forwarding the actual argument raise **AttributeError** in both helpers. Shipped REBOUND/Kuiper engines do not currently register these helpers; this is an activation hazard.

**Closure:** use the supported callback interface, validate per-particle force coefficients and unit/frame conventions, and test an actual acceleration delta with the forces enabled. SRP coefficient plumbing and full scientific force formulas still require verification. [Physics PHYS-N06](CODEBASE_SCAN_2026-10-10_EVIDENCE/physics/REPORT.md).

### SCN-058 · P1 · OPEN / browser OBS · All tips — LOD merge removes Earth/Mars surfaces

`src/frontend/features/planetary/quadtreeLOD.ts:53–59` detaches a mesh without clearing its pointer. Merge destroys children at`:86–91`, then `createMesh():94–95` returns early because the detached mesh still exists. Browser execution yields **6 far meshes →36 near meshes →0 far meshes**, with six non-null mesh pointers whose parents are null. Earth/Mars instantiate and update these trees in shipped main.

**Closure:** repeated near/far cycles preserve complete surface coverage, parent ownership and bounded resource counts at all LOD boundaries. This does not fix the independent vertex-coordinate error SCN-061. [Frontend F-NEW-2](CODEBASE_SCAN_2026-10-10_EVIDENCE/frontend/REPORT.md).

### SCN-059 · P1 · OPEN / browser scene OBS · All tips — Physical scale skips Earth/Mars quadtrees

`src/main.ts:699–712` has an empty scale-update branch for quadtrees. Actual checkbox handler leaves Earth radius**.00167021AU** instead of**.0000425875AU** (39.22×); Mars is1.798× physical. Jupiter and Sun change correctly in the same probe. This measured uniforms/scene transforms, not screenshots, and remains a separate defect after fixing sphere projection.

**Closure:** toggle both ways and gate effective radius, displacement, LOD thresholds and camera framing for every body representation. [Frontend F-NEW-3 and scene results](CODEBASE_SCAN_2026-10-10_EVIDENCE/frontend/REPORT.md).

### SCN-060 · P2 · OPEN / browser scene OBS · All tips — Earth/Mars cannot be double-click picked

`src/main.ts:1296–1307` raycasts body entries with recursion disabled. Earth/Mars entries are groups, and their patch children have no body ID. Actual scene/raycaster gives**zero Earth/Mars hits versus one Jupiter hit**. Explorer selection remains available; adding recursion alone leaves identity resolution unfinished.

**Closure:** double-click-follow works for each planet across LOD/scale modes; resolve ancestor identity or use deliberate pick proxies while accounting for shader displacement. [Frontend F-NEW-4](CODEBASE_SCAN_2026-10-10_EVIDENCE/frontend/REPORT.md).

### SCN-061 · P1 · OPEN / CODE + CPU transform OBS · All tips — Planet shader projects before applying face coordinates

`planetShaders.ts:166–201` normalizes raw z=0 plane positions, scales to `uRadius`, then applies the full model-view matrix. `quadtreeLOD.ts:94–109,151–163` places faces with translations±.5, so those offsets are added in world AU **after** sphere projection. With Earth radius.00167021AU, reference vertex(.5,0,0), zero terrain and identity body transform, exact matrix evaluation produces(.00167021,0,.5), radius**.50000279AU**,299.37× intended.

The source path is active for Earth/Mars. This is a CPU evaluation of shipped transform order, not GPU readback or a screenshot claim. **Closure:** apply face/chunk coordinates before spherical projection, then physical radius/body transform; independently gate centres/corners/seams, all subdivision levels, finite normals and actual rendered radius bounds. [Frontend F-NEW-1](CODEBASE_SCAN_2026-10-10_EVIDENCE/frontend/REPORT.md).

### SCN-062 · P2 · OPEN / lifecycle OBS · All tips — Default-scale flare/CME expires immediately

`solarFlares.ts:225–228` computes lifetime from `(.3 - sunRadiusAu)/speed`. Display Sun radius is**.375511AU**, giving a negative lifetime. The actual event expires on its first1/60s update, while an otherwise identical physical-radius event survives. The active manager removes expired events; current display radius is passed by the solar controller.

**Closure:** positive lifetime/bounded expansion across every presentation scale, with actual random/physics/AGN spawning; separate physical speed/time policy from display radius. [Frontend F-NEW-5](CODEBASE_SCAN_2026-10-10_EVIDENCE/frontend/REPORT.md).

### SCN-063 · P2 · OPEN / controlled OBS, documented tradeoff · All tips — A stalled Horizons transport retains sole remote capacity

`backend/mission/ephemeris_service.py:1174–1292` deliberately retains its single global transport permit until the I/O thread exits. A local Event-backed response read makes caller1 time out at~50ms; caller2 also times out waiting for capacity without a second outbound call. Releasing the read restores caller3 immediately. The probe releases all threads and contacts no upstream.

This bounds abandoned work correctly but leaves uncached Horizons work unavailable while a transport remains blocked. It **does not** reproduce old API-wide starvation, invalidate Kepler fallback policy, or show unrelated endpoints blocked. **Closure/decision:** explicitly accept the bounded availability tradeoff, or provide terminable transport ownership and prove prompt recovery plus bounded abandoned work. Never “fix” it by freeing permits while old work remains unbounded. [Transport supplement](CODEBASE_SCAN_2026-10-10_EVIDENCE/backend/TRANSPORT_LAMBERT_NOTES.md).

### SCN-064 · P1 · OPEN / independent numerical OBS · All tips — Near-antiparallel Lambert velocities miss their target

`backend/trajectory/lambert.py:499–500` reconstructs angle via `acos(dot)`, losing relative precision nearπ. The recovered angle feeds sine/A at`:651–655`; velocities divide by small g at`:723–731`. Scalar TOF convergence does not certify those recovered velocities.

Independent case:1AU circular orbit, r₁=[1,0,0], r₂=[cosθ,sinθ,0], TOF=θ/√μ, analytic v₁=[0,√μ,0]. A separate real REBOUND IAS15 Sun/massless-particle integration uses the returned v₁ and requested TOF:

| θ | Velocity error | Actual propagated endpoint miss | Reported TOF root residual |
|---|---:|---:|---:|
|179.999°|.001104m/s|56.785km|1.1261e-10day|
|179.9999°|.813087m/s|41,810.837km|1.1238e-10day|
|179.99999°|20.37377m/s|1,046,762.558km|1.1235e-10day|
|179.999999°|5,101.243m/s|209,061,472.255km|1.1238e-10day|

Both sides ofπ fail symmetrically; ordinary-angle controls and both branch runs are retained. Exactly180° returns `None` and is recorded under capability SCN-045 because the collinear inputs do not determine a unique plane. It is not the defect asserted here.

**Closure:** stable angle/velocity recovery or explicit ill-conditioned rejection, independent endpoint and velocity gates on both sides ofπ over multiple radii/tolerances, while retaining bounded work and TOF residual checks. [Full reproduction and JSON](CODEBASE_SCAN_2026-10-10_EVIDENCE/backend/TRANSPORT_LAMBERT_NOTES.md).

## 6. Verification and capability queues — excluded from open counts

| ID | Current queue and evidence needed |
|---|---|
| SCN-041 · P1 | **WSA scientific calibration.** Main fixes exact radial-boundary expansion and labels `wsa_inspired_v1`; formula regression mutant is killed. Independent observed/reference speed-map calibration and topology/coverage acceptance remain. T retains older formula. Do not label corrected main formula still broken merely because calibration is pending. |
| SCN-042 · P1 | **Broader solar time/frame/projection semantics.** Confirmed Hathaway error split to050; stale forcing009; main disables unvalidated spatial/observed inference. Both backend PFSS and Parker are Z-up, so direct-copy evidence alone does not prove a backend axis mismatch. Require separate coordinate/rotation/projection oracles. |
| SCN-043 · P1 before exposing moons | **Full satellite coverage.**424 catalog moons, four required fitted artifacts, and20×7 passing gate rows are different denominators. Validate intended rendered population/intervals and truthful unavailable behavior. Historical Dione/Rhea/Io/Europa error counts are not current independent measurements. |
| SCN-044 · P2 | **MGA solution quality/realism.** Preserve bounded search, independently revalidated feasible assists and unpowered v∞ continuity. Fresh real-window/two-assist coverage, equatorial-radius/periapsis policy and exhausted/inconclusive reporting are still needed. No old inert-search count is reused. |
| SCN-045 · P2 | **Lambert capability boundaries.** Multi-revolution support remains0; exact180° needs a plane policy; fixed[-40,40] z scan and short/hyperbolic coverage need independent oracle cases. Confirmed near-antiparallel numerical failure is064; a good179.999° case cannot certify closer angles. |
| SCN-046 · P2 | **Artifact regeneration.** Shipped asteroid hash/metadata and four moon fit parsers pass; mutable-input generators are not yet independently reproduced offline. Pin inputs and perform safe temporary byte-identical rebuilds. |
| SCN-047 · P1 | **Broader browser/GPU/load release gates.** Fresh startup, drawer/keyboard, no-WebGL, mocked recovery and scene probes narrow the unknowns. Still missing production-budget five-minute dev/preview solar delivery, real observed AIA, hardware GPU precision/FPS, declared coverage denominator, screen reader, multi-browser, sustained cross-endpoint and multi-worker load. |
| SCN-048 · P1 | **Live providers and actual deployment.** Main migrates NOAA to quality/age/skew-checked RTSW1-minute products; T retains old one-day constants. No fresh live upstream HTTP status or real deployment/proxy/auth configuration was established. Bound AIA historical-date coverage separately from physics epochs. Remote branch freshness also remains unverified. |
| SCN-049 · P2 | **Remaining historical leads/dormant paths.** Binary, Tudat energy and callback findings split to054/055/057; SMBH radius021 expanded. Remaining replay/randomness, star mass/period manifests, Trojans, other SMBH conversions, dormant client reconnect/schema state, cloud/satellite timeout/disposal, font/doc-link details and force-model truth need focused caller-aware evidence. Source leads are not additional confirmed bugs. |

## 7. Coverage and preserved fixes

| Domain | Sweep performed | Explicit limits |
|---|---|---|
| Repository/history/docs/CI | Complete tracked-tree inventories; branch/tree comparison; supplied audit index, October7 register and historical crosswalk; workflow/dependency/scripts/README/provenance review; fresh build/tests/type/audit/CI mutation execution | No all-line formal review, actual hosted CI/branch-protection capture, license determination or guarantee newest remote tips |
| Backend routes/security/concurrency | HTTP/WS surfaces, auth/profile/proxy identities, bounded bodies/messages, budgets, dedicated workers/process ownership, epoch admission, tests and local route probes | No production proxy inspection, sustained multi-tenant load or all-endpoint fuzz campaign |
| Solar/PFSS/FITS/realtime | Basis/grid/field/tracing/WSA, source metadata/ingestion, flux/provenance, bounded transport/cache, temporal semantics, process supervisor; analytic and controlled-source probes | No independent real GONG corpus, calibrated WSA map or live observed delivery |
| Dynamics/catalogs/mission | Planets/moons/asteroids/KBO, time/velocity frames, REBOUND/Tudat hooks, mission vehicle/risk/EPO, benchmark and Lambert/Horizons; independent arithmetic, finite differences, real REBOUND and safe script probes | Tudat absent, no live Horizons/SBDB truth refresh, no all424-moon accuracy campaign, no full dataset regeneration |
| Frontend/rendering/browser | Bootstrap/DOM/style/camera, worker contracts/fallback, clients/controller, solar visuals, Earth/Mars quadtree/shader, asteroid/KBO/SMBH paths; all frontend files inventoried and import/lifecycle boundaries reviewed | Software WebGL only; screenshot readback timed out; scene instrumentation suppresses rendering; no claim of pixel/GPU throughput coverage |
| Dormant modules | Alternative animation/UI/planner clients, local/nearby/cloud/satellite/moon/Milky-Way pipelines and inactive forces reviewed for reachability and hazards | Not exposed controls merely because files exist; unexecuted leads remain049 |

Preserve the following demonstrated improvements when fixing remaining issues:

- Main's harmonic/grid/source-surface/tracing/WSA formula corrections and six mutation checks; do not equate disabled observed runtime with a delivered observed-data product.
- Main's explicit local/network security profiles, authenticated network access, trusted-proxy interpretation, bounded ingress/identity storage and per-subject WebSocket admission. Supported local launchers bind loopback; unsafe deployed overrides were not assumed.
- Main's killable solar physics workers, owned permits, cancellation/reap, typed failures, independent client polling, last-good state and source/epoch/schema guards. Realtime thread transport remains a separate problem.
- Trajectory budget/cancellation/deadline containment, shared ephemeris validation/cache ownership, report path containment and exclusive-write checks. Horizons single-slot availability residual063 is narrower than the old global-starvation report.
- UTC↔TDB correction, Float64 worker transport, native-frame/fitted moon paths, corrected REBOUND initial states/IAS15 compatibility and Kuiper input velocity units. New derivative/range/binary findings do not undo those repairs.
- Existing unpowered flyby continuity and Lambert scalar root certification. New064 demonstrates why endpoint certification must also be checked.

### Historical reconciliation

Every SCN-001–049 is explicitly retained above. The October7 report's [September24 crosswalk](CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-07.md#september-24-id-crosswalk) maps all47 earlier IDs into those entries/preserved fixes, and remains the historical mapping. No older count, readiness score, FPS value, backend latency or orbital error was copied as a fresh measurement.

The supplied [audit index](AUDIT_AND_ISSUE_INDEX_2026-10-07.md) names fixes on unselected branches. Those are useful leads, not main status. In particular, its179.999° Lambert comparison is compatible with the small error reproduced at that angle and does not rule out the much closer-toπ failure discovered here. “Exactly180° unsupported” remains distinct from returning a wrong state for non-collinear inputs.

Domain-local labels map as follows: SOL-01→010, SOL-02→004, SOL-03→050, SOL-04→051; PHYS-N01–06→052–057; frontend F-NEW-1→061, F-NEW-2→058, F-NEW-3→059, F-NEW-4→060, F-NEW-5→062; transport supplement→063/064. This prevents counting the same reproduction twice.

## 8. Recommended repair order and tracker maintenance

1. **Protect scientific outputs:**012 benchmark validity,064 Lambert state recovery,052/019/020 mission mass/reserve/risk,053 epoch contract; preserve current budgets/containment.
2. **Repair active Earth/Mars presentation:**061 transform order,058 lifecycle,059 scale,060 picking; verify them together without merging the independent root causes. Then062 flare lifecycle and013 shader time precision.
3. **Finish solar reliability and truthfulness:**004 total transport deadlines,010 outage recovery,005 visible status and production-budget delivery. Keep observed acquisition disabled until its independent gates, including051, pass. Correct050 normalization.
4. **Make developer gates dependable:**026 archival discovery,027 documented pinned test setup,025 type backlog,028 advisory remediation. Retain operational main CI029 and its mutation checks.
5. **Complete catalog/model/UI/provenance work:**016/017/021 and remaining physics entries,030/031 accessibility/startup,032–035 tooling/docs/provenance, then optional/dormant and wider verification queues. Treat old T-only solar/security failures as branch reconciliation work, not regressions present on main.

For each change, record owner, exact fixing commit/PR, original failing reproduction, passing replacement gate and remaining scope. A green generic suite, missing UI exposure, a merged design document or disabled capability is not a blanket subsystem closure. Accepting a model limitation/tradeoff requires an explicit contract and truthful presentation; do not silently delete its ID.

## 9. Reproduction and evidence handling

See [evidence README](CODEBASE_SCAN_2026-10-10_EVIDENCE/README.md) and the individual domain reports for commands. The frontend runner accepts a prepared snapshot path, label and pinned tool binary directory. Backend standard suites use their separately recorded environments; the main science gate requires Git history and clean exact-commit inputs, which is why it ran in a separate local clone.

```bash
# From a clean checkout of the specified main commit, with declared runtimes:
npm ci --ignore-scripts
npm test
npm run typecheck
npm run typecheck:ratchet
npm run build
npm run verify:planet-positions
npm run verify:moon-frames
npm audit --json

# In a fresh Python 3.12.13 test environment:
python -m pip install -r ci/backend-test-requirements.txt
python -m pytest -q backend/tests
python -m pytest --noconftest -q scripts/ci/tests/test_verify_r3_r4_runner.py scripts/ci/tests/test_r3_r4_workflow.py
# Set the deterministic environment shown in the committed workflow first.
python scripts/ci/verify_r3_r4.py --repo . --manifest ci/r3-r4-science-verification.json all
```

Do not substitute the above pinned test install when reproducing027: that reproduction intentionally installs only `backend/requirements.txt` into a different fresh environment. Likewise, clean-tree `npm test` and an archive-present workspace answer different questions for026. The retained invalid `node --test` invocation of Vitest files is an audit harness mistake, excluded from product findings; supported Vitest execution passes those files.

Probe exit0 means observations were captured, not that invariants passed. All fixtures, scripts, results, logs and per-file evidence hashes are retained beneath the new evidence directory; temporary environments are disposable. The evidence-local `.gitignore` preserves intentional logs otherwise hidden by the repository-wide pattern. Archive this report and evidence together deliberately; all remain uncommitted.
