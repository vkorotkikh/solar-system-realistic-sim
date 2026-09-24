# Report C — `origin/sun-focus` and the New-Issue Hunt

**Part C of 4** · `main @ aa6e39a` vs `origin/sun-focus @ fd793f4` · 2026-08-23 · read-only · **run 2 (independent re-execution)**

> Companion parts: **[Report 0 — Baseline](MAJOR_ISSUE_REPORT_0_BASELINE_2026-08-23.md)** · **[Report A — Adversarial Verification](MAJOR_ISSUE_REPORT_A_ADVERSARIAL_2026-08-23.md)** · **[Report B — Blocked-Check Closure](MAJOR_ISSUE_REPORT_B_BLOCKED_CHECKS_2026-08-23.md)**

## 2026-09-24 current-branch reconciliation

> **Authoritative current status for `fix/nbody-osculating-initial-state`; code audited through `a864ea4`.** The original 2026-08-23 report is preserved unchanged below as historical evidence: its measurements and conclusions describe `origin/sun-focus @ fd793f4`, not the current branch. The old audited pin, `e740b21`, is an ancestor of this branch. Statuses here supersede the old headline and roadmap wherever they conflict.

### Current totals

The report normalizes to **56 distinct findings**. At the implementation pin: **18 ACTIVE, 11 PARTIAL, 22 RESOLVED, 4 NOT-A-BUG, 1 DUPLICATE**. Thus **29 findings remain unresolved** (active or partial).

| Status | Count | Meaning in this reconciliation |
|---|---:|---|
| **ACTIVE** | **18** | The defect remains observable or the required scientific/operational contract is absent. |
| **PARTIAL** | **11** | A material mitigation landed, but a stated failure mode or acceptance criterion remains. |
| **RESOLVED** | **22** | The original defect is closed by implementation plus proportionate regression evidence. |
| **NOT-A-BUG** | **4** | Re-execution or primary-source review did not support the report's proposed defect. |
| **DUPLICATE** | **1** | The item is not independent of another normalized finding. |

### What changed after the audited snapshot

- `2226277` replaced the mean-element REBOUND initialization with a validated, offline JPL Horizons Cartesian state set. The input contract is DE441 state vectors at J2000 JDTDB, Solar System barycentric origin, ecliptic J2000/ICRF orientation, AU and AU/day; Earth (`399`) and Moon (`301`) are explicit particles, while Mars through Pluto use planetary-system barycenters (`4` through `9`) with matching DE440 system GMs. At 2026-08-23 the reduced IAS15 model is 1,550 km from Horizons for Earth center and 69.85 km for the Saturn system barycenter (275 km against Saturn center `699`), rather than the old 232,000 km / 60.2 million km failures.
- `68aff6b` stopped double-counting apsidal precession by advancing `M` at `Ldot - varpidot`; `f1c79b9` added a committed six-epoch Horizons oracle. A fresh 2026-08-23 barycenter comparison gives 7,429 km for the browser Earth/EMB approximation and 1.823 million km for Saturn, both materially below the pre-fix branch values.
- `b6c4ce3` moved worker state to an index-free `Float64Array`, enforces one outstanding tick, rejects malformed/out-of-order states, and falls back to current main-thread propagation when a snapshot is absent or too old. This prevents the old permanent visual freeze, but it is not a full watchdog: a silently hung worker is not terminated or respawned, and snapshots within the explicit approximately-three-frame age allowance can still differ from the HUD epoch.
- `3f5d097` closes the compute-permit lifetime defect. PFSS, AIA tile, porkchop, and mission work use owned bounded executors; timeout/disconnect does not release a semaphore until the worker actually exits. Porkchop additionally requires positive TOF bounds and checks a cooperative cancellation event within the scan.
- `e740b21` keys realtime-solar snapshots by exact requested JD versus `latest`, retains single-flight, rejects non-finite epochs, and bounds the cache with LRU eviction. The broader upstream item remains partial: one refresh still fans out across multiple sequential Helioviewer reads, and the two committed NOAA SWPC `/products/solar-wind/*-1-day.json` URLs returned HTTP 404 on 2026-08-27.
- `90f4134` bounds REBOUND seeks to the validated 1990–2050 JDTDB interval, integrates long seeks in cancellable ten-year segments, limits checkpoints to an eight-entry LRU, and holds a four-connection WebSocket admission permit until the worker thread actually exits. Browser WebSocket origins are allowlisted before engine construction; authentication and safe public-bind defaults remain separate R11 work.
- `a40005a` gives PFSS a normalized full-input cache key, finite-input validation, bounded LRU behavior, and same-key single-flight. `3f3b787` rejects unpowered MGA encounters whose incoming/outgoing `|v∞|` differ beyond `max(0.001 km/s, 1e-4 relative)` and computes the turn bound from incoming `v∞`.
- `84ddcd1` makes Phase-1 asteroid loading fail closed unless valid metadata supplies a matching 64-hex SHA-256, separates latency telemetry from integrity, and exposes persistent typed verified/fallback status in an ARIA live region. It does not repair the separate period/taxonomy or independent expected-row-contract findings.
- `a864ea4` removes the mirrored moon-frame unit test and retains the independent 21-body Horizons oracle as the scientific gate, closing the test-quality finding without claiming the remaining catalog phase tolerances are fixed.

### Moon accuracy follow-up (2026-09-24)

The post-pin implementation strengthens R10 without broadening its claim to the entire catalog:

- Every non-ecliptic fallback orbit now keeps its native Laplace/equatorial elements and basis,
  applies inclination/node/periapsis rates there, and transforms the complete Cartesian state to
  ecliptic J2000 only after propagation. This closes the rate-frame composition error that drove
  Cordelia's old 117.7° plane discrepancy.
- Titan, Iapetus, and Phoebe use fitted parent-relative Horizons states sourced from `SAT441L`;
  Cordelia uses `URA184_MERGED`. The committed artifact is reproducible and records provenance,
  frame, center, units, JDTDB time scale, hashes, and held-out validation over
  **JDTDB 2451545.0–2469807.5 (2000–2050)**.
- The prior single-epoch/loose-exemption gate is replaced by 20 moons at seven epochs: 140
  position/plane comparisons plus drift checks, with velocity gates for every fitted moon. The
  Titan/Iapetus/Phoebe two-radii allowances and Cordelia 180° plane allowance no longer exist.
- Unfitted moons deliberately use the corrected source-frame mean-element fallback and are reported
  as approximate. The fitted four publish no state outside 2000–2050, preventing time warp from
  silently restoring their known-bad table phases. JPL's descriptive mean elements are not treated
  as universal osculating initial states.

R10 remains **RESOLVED** for the reported frame conversion. The named four-body phase/plane defect
is resolved inside the stated domain; complete catalog ephemeris accuracy remains **PARTIAL**.
Historical measurements in the original body below remain valid descriptions of the old branch.

### Re-executed validation at `a864ea4`

- Backend: **176 passed**, 5 deprecation warnings (`pytest -q backend/tests`). This includes bounded/cancellable WebSocket resources, PFSS cache identity/single-flight, unpowered-flyby invariants, certified Lambert convergence, N-body Horizons accuracy, and the earlier compute/solar-cache gates.
- Frontend: **108 passed in 7 files**, including 10 asteroid-integrity/source-status tests, **5 worker-contract tests**, 21 moon-frame/Horizons tests, and 66 planet-position/Horizons cases.
- Planet oracle: **8 planets × 6 epochs = 48 rows passed**, spanning 1900–2100; aggregate position error `3.6918e7 km` against the declared `7.5e7 km` aggregate budget.
- Production bundle: `vite build` passed with **40 modules transformed**; it still reports an approximately 893 kB main-chunk warning. Build does not yet invoke typecheck or either test suite, and strict TypeScript still has **280 errors**.

### Normalized 56-finding inventory

| ID | Current status | Normalized finding and current evidence |
|---|---|---|
| **R01** | **PARTIAL** | Strict TypeScript debt improved from 344 to 280 errors, but is not closed (`package.json` keeps typecheck separate from build). |
| **R02** | **RESOLVED** | Vitest is wired and the current frontend suite is 108/108 green rather than the original 8-test baseline. |
| **R03** | **RESOLVED** | The REBOUND 5.1.1 IAS15 break is closed: dependency pinned, `ri_ias15` feature-detected, readiness constructs a probe simulation, and unmocked IAS15 tests pass. |
| **R04** | **ACTIVE** | A substantial alternate frontend stack remains unreachable; `simulationClient.ts` and `animationLoop.ts` still have no production importer. |
| **R05** | **RESOLVED** | Lambert rejects uncertified/non-converged time-of-flight roots and surfaces residual/bracketing evidence for accepted roots. `ea54bea` also prevents an exhausted bracket iteration from returning its uncertified best sample and gates strict residual convergence. |
| **R06** | **PARTIAL** | Benchmark false scoring is stopped with `incomparable_reference`, but validation coverage remains zero and no reproducible GMAT/Orekit/Tudat decks/logs replace the invalid references. |
| **R07** | **RESOLVED** | Asteroid metadata now uses `no-cache`, matching binary revalidation and removing the stale-checksum split. |
| **R08** | **RESOLVED** | SF-1 secular propagation now uses `Mdot = Ldot - varpidot` and is guarded by the 48-row Horizons test (`68aff6b`, `f1c79b9`). |
| **R09** | **RESOLVED** | SF-2 Kuiper activation requires declared velocity units, converts supported units, and refuses to guess. |
| **R10** | **RESOLVED** | Non-ecliptic rates propagate in their native source frame before the complete state is transformed to ecliptic J2000. Titan/Iapetus/Phoebe/Cordelia additionally use provenance-backed Horizons fits over JDTDB 2000–2050, gated by seven-epoch position/plane/drift checks and velocity checks. Unfitted states remain explicitly approximate; the fitted four fail closed outside coverage. |
| **R11** | **PARTIAL** | CORS and endpoint bounds improved; `90f4134` adds a pre-engine WebSocket origin allowlist and connection cap. The server still defaults to `0.0.0.0` with reload, has no authentication, permits authorized-by-flag report overwrites without an identity check, and exposes absolute paths in some responses. |
| **R12** | **ACTIVE** | The approximately 39 MB `src/assets` texture corpus remains unreferenced by reachable runtime code. |
| **R13** | **RESOLVED** | Benchmark report paths are contained below the approved notes directory and overwrite behavior has dedicated tests. |
| **R14** | **RESOLVED** | SF-3 compute exhaustion is bounded by rate/concurrency limits plus the owned executor whose permit remains attached to actual PFSS worker lifetime (`3f5d097`, `test_compute_budget.py`). Authentication policy remains tracked separately in R11. |
| **R15** | **RESOLVED** | `a40005a` keys PFSS solutions by Carrington rotation plus exact finite JD, clamped activity, effective `n_lines`/`lmax`, and GONG timeout; it uses a bounded true LRU and same-key single-flight with shared success/error completion (`test_pfss_cache.py`). |
| **R16** | **PARTIAL** | Ephemeris provider reporting improved, but `auto` still makes an otherwise local planning request network-dependent through `spice -> horizons -> kepler`. |
| **R17** | **ACTIVE** | Claimed binary-KBO primaries and companions remain massless; tests do not establish negative two-body energy or long-term binding. |
| **R18** | **PARTIAL** | Kuiper WS protocol metadata exists, but mismatches only warn and the latent server-object/client-`number[][]` schema conflict remains in dead code. |
| **R19** | **RESOLVED** | `a864ea4` removed the mirrored/tautological conversion assertion. The independent oracle now covers 20 moons across seven epochs (140 states), with position, plane, drift, and fitted-body velocity gates; no production correctness claim depends on a mirrored converter. |
| **R20** | **NOT-A-BUG** | A 20 km/s modeled CME lower bound is not inherently invalid; official SOHO/LASCO sky-plane catalogs include speeds of roughly 20 km/s. |
| **R21** | **DUPLICATE** | The 50k belt-count/fp32 claim depended on the belt transform-order defect in R44; the count increase is not an independent correctness issue. |
| **R22** | **ACTIVE** | Realistic-scale toggling still skips quadtree meshes (`applyScaleMode` retains the explicit TODO). |
| **R23** | **RESOLVED** | `90f4134` enforces the validated 1990–2050 JDTDB interval, integrates long forward seeks in at-most-ten-year segments with cooperative cancellation, caps checkpoints at eight with deterministic LRU eviction, and keeps endpoint admission owned until a stopping worker actually exits. Boundary, cancellation, eviction, and runner-error tests gate the contract. |
| **R24** | **RESOLVED** | Porkchop grid cardinality/concurrency/timeout bounds, positive TOF schema constraints, owned permit lifetime, and cooperative timeout/disconnect cancellation are now implemented and tested (`3f5d097`). |
| **R25** | **RESOLVED** | `90f4134` admits at most four `/ws/sim` sessions by default, rejects disallowed browser origins and excess sessions before engine setup, and releases a permit only after the worker thread exits. Endpoint tests cover rejection-before-readiness and capacity reuse. |
| **R26** | **PARTIAL** | Worker stalls no longer freeze the scene because a missing new sequence triggers current local propagation, but no elapsed-time watchdog terminates or respawns a hung worker. |
| **R27** | **PARTIAL** | Worker snapshots now carry/check `tickJd` and overly old states fall back locally, but states inside the allowed approximately-three-frame skew can still render at a slightly different epoch from the HUD. |
| **R28** | **ACTIVE** | Solar coordinate conventions remain inconsistent: backend feature latitude uses +Z as pole while shader/body-local solar layers use +Y before scene transforms. |
| **R29** | **ACTIVE** | Backend, shader, catalog spin, and solar-wind code still use divergent differential/rigid rotation laws; the frontend coefficients remain misattributed to Snodgrass 1983. |
| **R30** | **ACTIVE** | Hathaway normalization still uses the `c=0` peak formula for `c=0.71`, producing a clamped plateau instead of the true approximately-58.39-month maximum. |
| **R31** | **ACTIVE** | One 512 px Helioviewer viewport tile is still analyzed as a centered full disk and wrapped over the solar sphere. |
| **R32** | **RESOLVED** | Cosmic-ray rigidity conversion now correctly computes `R[GV] = E[eV] / (abs(Z) * 1e9)`. |
| **R33** | **RESOLVED** | With the corrected rigidity conversion, the numerical floor no longer saturates the relevant advertised energy range. |
| **R34** | **RESOLVED** | Cosmic-ray gyroradius no longer contains the spurious `/c` in Gaussian CGS. |
| **R35** | **ACTIVE** | Sgr A* and M87* Schwarzschild radii remain 100x too small, propagating to derived ISCO/photon radii. |
| **R36** | **ACTIVE** | `heliosphereResponse.equilibriumTimeSec` still multiplies an already-seconds result by `1e5`. |
| **R37** | **NOT-A-BUG** | Sedov-Taylor radius/inversion/velocity and Rankine-Hugoniot compression remain internally correct. |
| **R38** | **ACTIVE** | Parsing the shipped ACBF confirms all 100,000 asteroid periods equal their three-significant-digit representation. |
| **R39** | **ACTIVE** | Missing measured asteroid spectra are still converted into apparent C/S/M taxonomy from semimajor axis without preserving that inference as distinct evidence. |
| **R40** | **ACTIVE** | The shipped taxonomy distribution still fails the project's own middle-belt validator expectations. |
| **R41** | **ACTIVE** | Null-semimajor-axis taxonomy defaults still disagree across the Python builder, catalog fetcher, and resolver (C/M/Unknown). |
| **R42** | **NOT-A-BUG** | The browser time machinery remained well-behaved under the report's extreme-rate/reverse-time checks; backend seek abuse is separately R23. |
| **R43** | **NOT-A-BUG** | Sequence monotonicity itself remains sound; `b6c4ce3` additionally closes the separate Float32 worker-state precision/index-boundary defect with five contract tests. |
| **R44** | **RESOLVED** | Belt orbital translation is applied after instance rotation/scale, so the annulus no longer collapses into the Sun. |
| **R45** | **RESOLVED** | `84ddcd1` requires valid metadata and a matching 64-hex SHA-256, never substitutes FNV, reports typed rejection reasons, treats load latency as telemetry rather than integrity, and renders persistent accessible verified/fallback/load-failure provenance. The independent expected-row and inferred-taxonomy issues remain R38–R41 / Report B AST-03/06. |
| **R46** | **RESOLVED** | REBOUND major-body initialization now uses validated Cartesian Horizons states and GM-consistent masses rather than fitted elements (`2226277`). |
| **R47** | **RESOLVED** | `3f3b787` rejects ideal unpowered flybys unless incoming/outgoing `|v∞|` agree within `max(0.001 km/s, 1e-4 relative)`, derives maximum turn from incoming `v∞`, and exposes magnitude/turn diagnostics. Five focused physics tests gate mismatch, tolerance, turn-limit, and missing-body failure paths. Route-budget/accounting work remains R48. |
| **R48** | **ACTIVE** | MGA still returns best plus five alternatives without separately reporting generated routes, evaluated beam partials, and distinct completed routes. |
| **R49** | **PARTIAL** | Exact-JD/latest cache identity, single-flight, finite-JD validation, and bounded LRU are resolved (`e740b21`); sequential upstream fan-out and dead SWPC URLs remain. |
| **R50** | **RESOLVED** | Belt propagation now uses `uJulianDate - epochJd`, not an absolute-JD phase advance. |
| **R51** | **ACTIVE** | ACBF epoch round-trip compares float32 JDs near 2.45 million with a `1e-4` day tolerance despite an approximately 0.25-day ULP, and reuses the period epsilon name. |
| **R52** | **ACTIVE** | `build` remains only `vite build`; strict typecheck, Vitest, scientific fixtures, and pytest are not a release/CI gate, and no CI workflow exists. |
| **R53** | **PARTIAL** | H29 interaction text says hypothetical, but the persistent Cataclysmic Events panel does not; README still advertises 1.9M particles while runtime/shipped counts are 50k/100k. |
| **R54** | **PARTIAL** | Mission risk now uses propellant margin, but return propellant is deducted from returned payload and total propellant is then subtracted again from objective score. |
| **R55** | **ACTIVE** | No root LICENSE or complete redistribution/attribution manifest covers the repository's full texture and data corpus. |
| **R56** | **PARTIAL** | Responsive rules and most labels exist, but reduced-motion, WebGL-unavailable and offline indicators are absent; `body-list` is unlabeled and the narrow layout still puts the full panel before the canvas. |

### Current priority order

1. Finish server authentication, safe bind/reload defaults, write authorization, and path redaction (R11), plus the remaining WebSocket protocol defects recorded in Report B.
2. Regenerate scientifically honest asteroid periods/taxonomy and add an independent expected-row/real-fraction contract (R38–R41; Report B AST-03/06).
3. Make MGA route enumeration/accounting honor its advertised search space and remove the hardcoded route penalty field (R48; Report B MGA-01/02/05).
4. Cap realtime upstream reads, replace dead SWPC products, and publish coverage/confidence (R49 and Report B SOL-05–08).
5. Unify the solar coordinate and rotation contracts and correct Hathaway/Helioviewer modeling (R28–R31).
6. Correct remaining SMBH dimensional constants (R35/R36), then restore benchmark truth coverage (R06).
7. Close the release gate, dead-stack, licensing, and resilience debt (R01/R04/R12/R52/R55/R56).

## What this part is

Two jobs the prior evaluation never did. First, **audit `origin/sun-focus`** — 69 commits ahead, the actual line of development, never reviewed by anyone. Second, **hunt outside the known register** for majors that both prior passes missed.

**Method.** Six agents, each required to verify claimed fixes by *executing both branch versions*, never by reading commit messages. `sun-focus` was checked out in a throwaway worktree. Run twice; run-2 agents were told not to read run-1 artifacts. **Run 2: 6/6 agents, 0 errors, 402 tool calls, ~850 k tokens.**

## Headline

**`sun-focus` is a real improvement that ships two regressions worse than what they replace — and neither is caught by its own new tests.** It genuinely fixes four things. It inherits every Critical and High from `main` except the Lambert defect. And it introduces **ten new majors**, two of which silently produce wrong physics.

Separately, the hunt found **four new majors on `main`** that neither prior pass caught, including two unauthenticated denial-of-service paths.

---

## 1. `sun-focus` baseline

| Measure | `main` | `sun-focus` | Note |
|---|---|---|---|
| `tsc --noEmit` | 1,300 errors | **344** | `tsconfig.json` is byte-identical; only 44 of the 956-error reduction comes from the deleted `temp_` duplicate. The rest is **genuine typing work** — `satelliteSystem.ts` 311→0, `sunController.ts` 109→0, `cloudDataPipeline.ts` 91→0. |
| `npm test` | script absent | **8 tests / 3 files, all pass** | vitest wired up properly. |
| `pytest` | 48 passed | **80 passed, 1 FAILED** | The failure is `test_rebound_engine_exports_self_describing_barycentric_states` — **sun-focus's own new test catches the `ias15` break that neither branch fixes.** |
| Unreachable TS | 31 of 61 files | 31 of 63 files (8,446 LOC) | sun-focus added **+2,041 / −769 lines into files that are still not wired**. |

That last row is the shape of the branch in miniature: substantial, careful work, some of it invested in code nothing executes.

---

## 2. The five claimed fixes, verified by execution

### 2.1 Lambert TOF-residual guard — **genuine and complete** ✅

A 4,000-case seeded fuzz across both branches:

```
main:      accepts 4000/4000, of which 538 (13.4%) have TOF residual > 1e-4 d, worst 322.2 DAYS wrong
sun-focus: accepts 3462,      of which    0 are non-converged
live, POST /trajectory/lambert earth->mars with arrival = departure + 1 day:
  main      -> HTTP 200, deltaVDeparture 180.10 km/s, deltaVArrival 181.51 km/s, no residual field
  sun-focus -> HTTP 422 "No Lambert solution for requested geometry/time"
  sun-focus, tof = 210 d -> HTTP 200 with rootResidualDays = 1.44e-06, rootBracketed = true
```

Endpoint miss also improves from 37–155 km to 1.9–4.1 km. This is the model of what a fix should look like: it rejects the bad case, and it *surfaces the evidence* (`rootResidualDays`) so a client can tell.

### 2.2 Benchmark honesty relabel — **genuine** ✅

`main` reports `scenarioCount 3, solvedCount 3, passCount 0` as though a real comparison ran, over the fabricated references documented in Report A. `sun-focus` marks all three `incomparable_reference` with `validationCoverage 0.0` and emits the compatibility note. It correctly **stops a false comparison** — while leaving zero validated accuracy scenarios, now disclosed rather than hidden. That is the right trade.

### 2.3 Asteroid `no-cache` meta fetch — **genuine** ✅

One line, `force-cache` → `no-cache`, matching the binary's default-mode revalidation. Live-reachable and it closes the stale-checksum false-failure documented in Report B §6.

### 2.4 Secular rates — **an anti-fix: 4.8× worse** ❌

The branch adds JPL per-century rates to every planet. The rate *values* are correct. The propagator is not:

```
propagated to JD 2461275.5, compared to JPL Horizons (CENTER 500@10, ECLIPTIC/J2000):
planet      MAIN km    SUN-FOCUS km    SF + M-correction km
earth        10,487        182,215              40,984
mars         58,000        326,414             150,232
saturn    1,179,225      3,093,042             295,269
uranus    1,033,692      6,113,695           1,081,527
neptune     665,098      7,462,523             687,618
TOTAL     3,963,582     19,081,786           3,387,128
```

**Root cause, proven:** mean anomaly advances at `n` while `argPeriapsis` and `node` *also* advance, so mean longitude gains an extra `d(ϖ)/dt` — apsidal precession is double-counted into along-track position. Subtracting `d(ϖ)·T` from `M` recovers 3.39e6 km, which **beats `main`**. So the intended fix is achievable; the implementation is one term wrong.

**And its own tests do not catch it:** the new `orbitMath` tests assert only that elements *changed*, never that accuracy *improved*.

### 2.5 Velocity units and frame — **a partial fix that introduces a worse regression** ❌

The fix is real: `main` emitted REBOUND's AU/yr unlabelled while `tudatpy_hooks` emitted AU/day — a 365.25× inconsistency. `sun-focus` divides by `DAYS_PER_YEAR` and declares `position_frame` / `velocity_frame` / `position_units` / `velocity_units`, and the `barycentric` label is truthful.

But **no frontend consumer of `vel` exists at all**, while the one real consumer — `server.py → kuiper.activate`, whose REBOUND sim is still `("yr","AU","Msun")` with no conversion added — now receives AU/day:

```
                 Jupiter            Saturn             Neptune
MAIN        a=5.2081 e=0.0493   a=9.5392 e=0.0540   a=30.0703 e=0.0086
SUN-FOCUS   a=2.4837 e=1.0000   a=4.5862 e=1.0000   a=15.0587 e=1.0000
TRUTH       a=5.20   e=0.048    a=9.58   e=0.056    a=30.07   e=0.009
```

`a = r/2` with `e = 1.0` is the exact signature of **zero injected velocity** (365.25× too small). Every `activate_kuiper` command now builds a Kuiper simulation whose Sun, Jupiter, Saturn and Neptune **plunge radially into the Sun** — the entire perturber field, which is the stated reason those bodies are there, destroyed silently with no error raised. `main` was self-consistent and numerically correct here.

**Fix:** multiply by `DAYS_PER_YEAR` at the `kuiper.activate` boundary, or have `activate` honour the new `velocity_units` field it was just given.

---

## 3. What `sun-focus` inherits unfixed

Verified by reading the branch's own blobs and by live execution, never by commit message:

| Defect | Evidence that it is unfixed |
|---|---|
| **`ias15` engine break** | Identical failure on a sun-focus uvicorn; the 69 commits touch `rebound_nbody.py` (+32/−20) but never remove the `ri_ias15` block. Its *own new test* fails on it. |
| **Orbit-normal sign flip** (K-05) | `git show main:… vs origin/sun-focus:…` of `orbitNormalFromElements` — **identical**. Io error unchanged at 159.95° / 827,729 km. |
| **Security posture** | `git diff main origin/sun-focus -- backend/server.py` = 18 added lines, **all** `protocol_version`; CORS/auth/bind lines untouched. |
| **39 MB orphaned textures** | `git diff --stat main origin/sun-focus -- src/assets` is **empty**. |
| **Dead frontend stack** | 31 of 63 files unreachable; `simulationClient.ts` — the only WebSocket client — still has zero importers. |
| **Asteroid data defects** (K-17, K-46) | The `.bin` blob is byte-identical (same git object, same md5); the builder is unchanged. |
| **Solar/SMBH numerics** | `smbhPropagation.ts` and `smbhPhysicsConstants.ts` are byte-identical between branches (`git diff` reports no change). |
| **Report-write containment** | Correctly contained on both — the one piece of good news that survives on both branches. |

---

## 4. New majors that `sun-focus` introduces

| ID | Sev | Finding |
|---|---|---|
| **SF-1** | High | **Secular-rate regression** — 4.8× worse than `main` (§2.4). |
| **SF-2** | High | **Kuiper perturbers destroyed** by the velocity-unit change (§2.5). |
| **SF-3** | Critical | **Unauthenticated CPU DoS via `GET /solar/physics`** — the new PFSS solver raises per-request cost ~100–360×, starving the whole threadpool. Absent on `main` (no `pfss` module exists there). |
| **SF-4** | High | **PFSS cache key ignores `fidelity`, `activity` and `jd`** → non-deterministic responses, contradicting the branch's own newly-added determinism claim. |
| **SF-5** | High | **Ephemeris `auto` chain reordered** to `spice → horizons → kepler`, making unauthenticated trajectory planning **network-bound on JPL**. `main`'s order is offline and deterministic (9-point porkchop grid: 0.01 s). |
| **SF-6** | High | **Moon periapsis rotation regresses Europa 4.8× and Ganymede 1.3×** — the new rotation is layered on the *uncorrected* K-05 sign convention, so all Galileans converge on the same ~159.8° error. |
| **SF-7** | Medium | **Binary-KBO companions are massless** and unbind immediately, while `binary_pairs` metadata claims they are bound. |
| **SF-8** | Medium | **Kuiper WS payload changed** `number[][]` → dict with no effective protocol gate (latent; both consumers are dead code). |
| **SF-9** | Medium | **`catalog.test.ts` is tautological** — it re-implements the code under test, so it passes while results are 160° wrong. A test that cannot fail. |
| **SF-10** | Low | CME minimum speed lowered to **20 km/s**, below the solar wind and below escape velocity; belt count raised 15k → 50k, so the fp32 defect now covers 3.3× the instances; `applyScaleMode` silently skips quadtree meshes (the code admits this in a comment). |

SF-9 deserves emphasis alongside §2.4: **both new test suites are written so they cannot detect the regressions the same commits introduced.** A green suite here is not evidence.

---

## 5. New majors found on `main`

Beyond the register and beyond Report B:

**N-1 (Critical) — `set_julian_date` drives an unbounded loop with never-evicted checkpoints.** Verified over a live WS session: `{"type":"set_julian_date","jd":3547295.0}` (+3000 yr) is accepted with no bound, entering a `while True` checkpoint loop while the checkpoint dict grows without eviction. Combined with the uninterruptible-integrate finding in Report B §3, one message permanently hangs a connection's worker thread.

**N-2 (Critical) — porkchop grid completely unbounded** (measured in Report B §2; the hunt independently confirmed 45 in-flight requests exhaust the default anyio threadpool).

**N-3 (High) — no WebSocket connection cap.** Each connection allocates a REBOUND engine, an OS thread, and a 3,000-particle Kuiper sim. *Explicit refutation of the tasked hypothesis:* the Kuiper particle count is **not** client-supplied on `main` — it is hard-coded at 3,000 — so that specific amplification lever does not exist.

**N-4 (High) — no worker watchdog and no snapshot-freshness check.** A silently stalled model worker freezes every planet and moon forever while the HUD clock keeps advancing; nothing notices. Related: the worker snapshot is *always* exactly one frame stale and nothing reconciles it, so planets render at a different date than the HUD displays.

**Confirmed with sharper numbers:** the solar-pole 90° mismatch; three divergent differential-rotation coefficient sets (the frontend's mis-attributed to Snodgrass 1983); the Hathaway normalizer using the `c=0` peak (66.14 mo) instead of the true `c=0.71` peak (58.39 mo), flat-topping solar maximum; the Helioviewer "real SDO observation" being a **512-px interior quadrant covering 3.33% of the solar disk**, wrapped equirectangularly over the whole sphere.

**SMBH constants, precisely diagnosed** (all inherited unchanged on `sun-focus`, verified by `git diff`):
- `crDiffusionCoefficient` rigidity conversion is wrong by **8.99e12** — statvolt→volt inverted (divides by `c` instead of multiplying).
- **New:** the `1e-10` rigidity floor **saturates for every energy below 3.6e12 eV**, so the advertised energy dependence is dead across the entire relevant range.
- `gyroRadius` has a spurious `/c`: 2.23e10 cm (0.0015 AU) for a 1 EeV proton in 5 µG, instead of 6.67e20 cm (216 pc).
- `rSchwarzschildCm` (and derived `rIscoCm`, `rPhotonCm`) for Sgr A* and M87* are **metres labelled cm** — 100× small.
- **New:** `heliosphereResponse.equilibriumTimeSec` multiplies an already-correct seconds value by an undocumented `1e5`.
- **Confirmed correct:** Sedov–Taylor with ξ₀ = 1.15 *and its exact inversion*, Sedov velocity, Rankine–Hugoniot compression, and the rest of the standard blast-wave set.

**Asteroid provenance, re-derived from the shipped bytes and live JPL:** all 100,000 periods quantized to 3 significant figures (`full-prec=false`); taxonomy for **99.07%** of the catalog fabricated from semi-major axis alone; the project's own coverage validator **fails against its own shipped data**; and the three taxonomy tables agree on the letter map but **disagree three ways on the null-`a` fallback** (Python → C, `catalog_fetcher` → M, resolver → Unknown).

**Clean:** time machinery under abuse — reverse at maximum warp and extreme dates are well-behaved, and no jump-to-date UI exists to abuse. The worker sequence protocol is sound.

---

## 6. Branch recommendation

**Adopt `sun-focus` as the canonical branch — but land three fixes on it first, and do not fast-forward `main` blind.**

*Why adopt it:* it is the active line (last commit 2026-07-25 vs `main`'s 2026-03-07), it cuts type errors 1,300 → 344 through genuine work, it adds a real test runner and three backend test modules, and it carries four verified fixes — the Lambert guard, the benchmark honesty relabel, the asteroid cache fix, and the velocity labelling. Nothing on `main` is absent from `sun-focus` except a stale README framing.

*Why not blind:* it ships **SF-1** (planets 4.8× worse), **SF-2** (Kuiper perturbers in radial free-fall), and **SF-3** (an unauthenticated CPU DoS that does not exist on `main`) — three regressions that are each worse than what they replace, and none of which its new tests can detect.

**Sequence:**
1. Fix **SF-1** — subtract `d(ϖ)·T` from `M` (the correction is proven to beat `main` at 3.39e6 km).
2. Fix **SF-2** — convert at the `kuiper.activate` boundary, or honour `velocity_units`.
3. Fence or bound **SF-3/SF-4** — cap PFSS work per request and key the cache on `fidelity`/`activity`/`jd`.
4. Then land the shared roadmap below.

---

## 7. Roadmap (both branches unless noted)

**Now — correctness and honesty (≤ 1 week)**
1. Fix the belt transform order — accept: an annulus is visible at 6 AU; a unit test asserts `|world − orbitPos| < radius` for one instance.
2. Pin or port REBOUND, and make `/health` initialize an engine rather than test an import — accept: default `/ws/sim` streams; an **unmocked** init test exists per advertised integrator.
3. Fail the asteroid load **closed** on missing `meta.json`; never downgrade SHA-256 → FNV-1a; separate "slow" from "invalid" — accept: each of the six failure modes in Report B §6 shows a labelled fallback.
4. Retract the benchmark references and regenerate with committed inputs and logs; gate CI on `passRate == 1` (`sun-focus` has already done the honest half).
5. Bound `/trajectory/porkchop` (total grid points, plus `gt=0` on `tof_min_days`) and make it async so client disconnect cancels — accept: a 300-byte POST cannot buy minutes of CPU.
6. Bound `set_julian_date` and prune `_checkpoints`; add a cooperative interrupt inside the integration loop so `stop()`'s 3 s join actually stops it.
7. Security baseline for any non-localhost use: explicit origin allowlist without credentials, WS origin check, `127.0.0.1` default, no absolute paths in responses.
8. Rewrite the README around what `index.html` ships; label the Cataclysmic Events panel speculative in a way that survives the next UI interaction.

**Next — scientific validity (≤ 1 month)**
9. Seed the N-body from osculating state vectors (proven: Saturn 60.2 → 0.124 Mkm).
10. Fix the moon frame conversion — the orbit-normal sign *and* the periapsis re-referencing together; fixing one without the other made `sun-focus` worse.
11. Enforce `|v∞|` continuity at flybys, or charge the mismatch; count distinct routes rather than beam partials.
12. Fix the ephemeris `auto` order so it matches its docstring, and report the provider actually used.
13. Key the solar cache on `jd`, add single-flight, cap upstream reads, fix or remove the dead SWPC feed.
14. Pass `JD − J2000` to the belt shader; fix the ACBF self-test tolerance.
15. Correct the SMBH constants (rigidity, gyroradius, Schwarzschild radii, the saturating floor).
16. Wire `typecheck` + vitest into `build`; add CI.

**Later** — planet secular rates (done correctly this time); real taxonomy and full-precision periods; mission economics (charge propellant once, couple risk to feasibility); delete or quarantine the dead stack; LICENSE and attribution manifest; resilience and accessibility (WebGL banner, offline indicator, labelled `<select>`, reduced-motion, the sub-1150px layout).
