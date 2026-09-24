# Report A — Adversarial Verification of the Prior Register

**Part A of 4** · `main @ aa6e39a` · 2026-08-23 · read-only · **run 2 (independent re-execution)**

> Companion parts: **[Report 0 — Baseline](MAJOR_ISSUE_REPORT_0_BASELINE_2026-08-23.md)** · **[Report B — Blocked-Check Closure](MAJOR_ISSUE_REPORT_B_BLOCKED_CHECKS_2026-08-23.md)** · **[Report C — sun-focus & New-Issue Hunt](MAJOR_ISSUE_REPORT_C_SUNFOCUS_HUNT_2026-08-23.md)**

## 2026-09-24 current-branch reconciliation

> **Authoritative current status for `fix/nbody-osculating-initial-state`; code audited through `a864ea4`.** The original report body below is preserved unchanged as a historical record of `main @ aa6e39a` on 2026-08-23. Its `CONFIRMED`/`REVISED` counts and severity statements must not be read as current-branch status.

### Scope and normalization

This reconciliation counts **30 primary findings**: F-01 through F-20, K-13, and the nine bullets in original §5, normalized in order as N-01 through N-09. Original Report A accidentally skips F-10 in both its verdict table and headline lists even though it says it covers F-01..F-20. F-10 is reconstructed from `CODEBASE_EVALUATION_REPORT_2026-08-23.md:96` (real-time tile/cache jitter) and the matching cache roadmap in Report C. Without that reconstructed row, the literal Report A inventory contains 29 primary findings.

The three already-refuted subclaims — F-08 “~60 missing paths,” F-15 “epoch quantization in the shipped binary,” and F-20 “worker and CPU both propagate every tick” — are annotations on their parent findings, not additional primary rows. They remain refuted. If counted separately, the inventory would contain 33 items and the `NOT-A-BUG` count would be four rather than one.

| Current status | Count | Normalized IDs |
|---|---:|---|
| **ACTIVE** | **10** | F-08, F-13, F-15, F-16, F-17, N-01, N-02, N-06, N-07, N-09 |
| **PARTIAL** | **8** | F-03, F-05, F-09, F-11, F-18, F-19, N-03, N-05 |
| **RESOLVED** | **11** | F-01, F-02, F-04, F-06, F-07, F-10, F-12, F-14, F-20, K-13, N-04 |
| **NOT-A-BUG** | **1** | N-08 |

`DUPLICATE` count: **0**. `ACTIVE` means the current code still contains the reported mechanism. `PARTIAL` means a material mitigation landed but a scientifically or operationally relevant part remains. `RESOLVED` means the original defect is closed by current code and proportionate regression evidence.

### Validation snapshot

- Full backend suite: **176 passed** with 5 deprecation warnings.
- Full frontend Vitest suite: **108/108 passed across 7 files**, including asteroid-integrity/source-state, model-worker, and committed moon/planet/orbit regression gates.
- Production Vite build: **passed**, compiling **40 modules**; the only reported issue was the non-fatal approximately 892.90 kB main-chunk warning.
- Strict TypeScript checking is still not clean: a fresh `npm run typecheck` reported **280** `error TS` lines, which is why F-09 remains partial even though Vite builds successfully.

The selected fixes after the prior pin map primarily to Reports B and C, so this report's 30-row
counts do not change. For cross-report context: `90f4134` bounds/cancels WebSocket seeks and caps
admission, `a40005a` repairs PFSS cache identity/single-flight, `3f3b787` enforces unpowered flyby
continuity, and `84ddcd1` makes asteroid catalog integrity fail closed with visible provenance.
`ea54bea` further hardens the already-resolved F-06 Lambert certificate.

### F-05 moon follow-up (2026-09-24)

The current implementation separates two failures that the original F-05 discussion had grouped
together:

- **Frame/rate composition is resolved for every non-ecliptic fallback record.** Native
  Laplace/equatorial elements now precess in their source frame and the complete Cartesian state is
  transformed to ecliptic J2000 afterward. A source-frame node rate is no longer applied to an
  already-converted ecliptic node.
- **The four named phase/plane failures are resolved within explicit coverage.** Titan, Iapetus,
  and Phoebe use provenance-bearing `SAT441L` Horizons fits; Cordelia uses
  `URA184_MERGED`. Coverage is JDTDB 2451545.0–2469807.5 (2000–2050), and the artifact records
  target, center, frame, time scale, units, source hashes, and independent half-step validation.
- **The loose exceptions have been removed.** A committed 20-moon, seven-epoch fixture now gates
  140 position/plane comparisons, secular drift, and velocity for each of the four fitted moons.
  This replaces the former approximately-two-radii phase allowances and Cordelia's 180° plane
  allowance with finite ephemeris-derived limits.
- **The scope remains deliberately partial.** The fitted four fail closed outside coverage: no
  position is published and the renderer hides the unavailable body rather than using its known-bad
  mean phase. Other moons use the corrected native-frame mean-element propagator with explicitly
  approximate quality. The repository does not claim those descriptive elements are ephemerides.

F-05 therefore remains **PARTIAL** at whole-catalog scope, but the original converter mechanism and
the specifically reported Titan/Iapetus/Phoebe/Cordelia failures are no longer active within their
declared 2000–2050 domain. The original measurements below are retained as historical evidence.

### Current finding table

| ID | Status through `a864ea4` | Current evidence and scoped disposition |
|---|---|---|
| **F-01** | **RESOLVED** | `0c99424` moves the GPU orbit translation after the instance rotation/scale in both `worldPosition` and `projectVertex` (`src/frontend/features/asteroids/beltRenderer.ts:175-212`). Add a shader-order or rendered-radius regression so a three.js shader edit cannot silently restore the collapse. |
| **F-02** | **RESOLVED** | REBOUND readiness loads and validates the scientific input and probes the configured integrator (`backend/sim/rebound_nbody.py:98-144`); IAS15-specific fields are guarded (`:247-255`). Invalid inputs withhold availability/high fidelity (`backend/tests/test_server_validation.py:46-68`, `test_nbody_initial_conditions.py:261-269`). |
| **F-03** | **PARTIAL** | Invalid comparisons are quarantined as `comparable_to_solver:false` and reported `incomparable_reference` (`backend/benchmark/accuracy.py:205-212`), but the rows remain sourced/labeled `strict-gmat-orekit-tudat` and tests accept `referenceIntegrityOk:true` with zero comparable coverage (`reference_scenarios.json:5-158`, `test_benchmark_accuracy.py:14-35`). Remove the strict/integrity claim or commit reproducible decks, endpoint states, frame/time scale, branch/revolution choice, kernels, and metric. |
| **F-04** | **RESOLVED** | `2226277` replaces mean-element initialization with fail-closed, committed DE441 Cartesian states and DE440 GM ratios (`backend/data/initial_conditions.py`, `backend/sim/rebound_nbody.py:232-356`). Multi-epoch Horizons tests gate the active IAS15 model; the exact 2026 closure requires Earth <2,000 km, Saturn-system <100 km, and Saturn-center <500 km (`test_nbody_horizons_accuracy.py:61-117,155-182`). |
| **F-05** | **PARTIAL** | Native-frame rates are now propagated before transforming the complete state to ecliptic J2000. Provenance-backed Horizons fits close Titan/Iapetus/Phoebe/Cordelia over JDTDB 2000–2050, and a 20-moon × 7-epoch position/plane/drift gate plus velocity checks for the fitted four replaces their loose exceptions. The fitted four fail closed outside coverage; whole-catalog status remains partial because unfitted moons retain approximate mean elements. |
| **F-06** | **RESOLVED** | Lambert output is withheld unless the requested TOF is bracketed/certified, and successful solutions expose `computedTofDays`, `rootResidualDays`, and bracket status. `ea54bea` adds Illinois-weighted bracket convergence, refuses to return an uncertified best point when the iteration budget is exhausted, and adds strict residual/failure regressions. Infeasible one-day Earth→Mars returns no solution/422 rather than an uncertified HTTP 200. |
| **F-07** | **RESOLVED** | `68aff6b` propagates mean anomaly as `M(T)=L(T)-varpi(T)` from JPL's tabulated mean-longitude rate (`src/data/planets.ts:14-26`, `src/sim/orbitMath.ts:128-157`), removing the SF-1 double-counting regression. `f1c79b9` adds a committed six-epoch Horizons gate (`planetPositionCheck.ts`, `planetPositions.horizons.test.ts`). Treat the 2100 row as an explicitly out-of-domain stress sample because the selected Standish table is documented through 2050. |
| **F-08** | **ACTIVE** | `README.md:51-69` still instructs users to select REBOUND/TudatPy and click Connect, but `index.html` has no engine/connect controls and `src/main.ts` does not import the only WebSocket client (`simulationClient.ts`). Wire the dormant client/UI end-to-end or remove the shipped-product claim. The historical “~60 missing paths” subclaim remains refuted. |
| **F-09** | **PARTIAL** | The error count has fallen substantially, but strict checking still reports 280 errors and `package.json` keeps `vite build` separate from `typecheck`. Eliminate errors in the reachable graph, then make typecheck and tests mandatory in CI/build; a successful Vite transpile is not a type-safety gate. |
| **F-10** | **RESOLVED** | After the earlier single-flight/completion-TTL work, `e740b21` keys snapshots by `latest` versus an exact finite JD and uses a bounded LRU (`backend/sim/solar_realtime_data.py:78-164`). `test_solar_realtime_data_cache.py` gates cross-JD isolation, latest-vs-explicit identity, refresh, eviction, and non-finite rejection. |
| **F-11** | **PARTIAL** | HTTP CORS and browser WebSocket origins are allowlisted; `90f4134` also caps `/ws/sim` admission before engine setup, while report paths are confined and accidental overwrite is refused atomically. Dev launch still defaults to public `0.0.0.0` with reload, no authentication exists, the report endpoint accepts explicit `allow_overwrite:true` without identity-based authorization, and some responses expose absolute paths. Default to loopback and require authorization for state-changing writes. |
| **F-12** | **RESOLVED** | The shipped `main.ts` calls resize at initialization and on resize events, not inside its animation loop (`src/main.ts:945-957,1122-1176`). Dormant `frontend/app/animationLoop.ts:195` still contains the old per-frame call and must be corrected before that stack is reactivated. |
| **F-13** | **ACTIVE** | H29 still applies a `1e12`-scaled speculative displacement directly to model state on wall-clock `deltaSeconds` (`src/main.ts:730-743`; `src/workers/modelWorker.ts:104-137`), including while the Julian-date clock is paused. Keep scientific state immutable and apply this as a renderer-only transform with persistent hypothesis labeling. |
| **F-14** | **RESOLVED** | Fixed-epoch synthetic corona sampling defaults its visual epoch to the requested JD and is exactly deterministic (`backend/sim/solar_physics.py:1015-1049`; `test_solar_physics_model.py:167-175`). Live assimilation remains intentionally observation-time dependent and should continue to be labeled separately. |
| **F-15** | **ACTIVE** | Absolute JD and per-instance epoch are still GLSL/attribute float32 values (`beltRenderer.ts:61-65,124-128,350-354,460-462`), producing coarse orbital phase steps. The synthetic round-trip generator also demands `1e-4` day fidelity from arbitrary fractional epochs stored as float32 (`asteroidCatalogLoader.ts:57-62,266-305`). Use relative epochs or high/low splits and gate the actual catalog; the shipped-binary-loss subclaim remains refuted because its quarter-day epochs are exactly representable. |
| **F-16** | **ACTIVE** | `scripts/fetch_gaia_catalog.py` can overwrite `stars_catalog.json` with tuple-only output while retaining no per-row source identity, query/retrieval record, license, or manifest (`:1-12,37-43,169-203`). Write a distinct artifact plus a hashed provenance/license manifest, or retain per-row provenance through a documented merge. |
| **F-17** | **ACTIVE** | `new WebGLRenderer` is unguarded (`src/frontend/app/sceneSetup.ts:147-160`), and `index.html` has neither a visible fallback nor ARIA/role/tabindex support for the canvas interaction. Add WebGL feature/error handling, accessible labels and keyboard equivalents, plus a browser test with WebGL unavailable. |
| **F-18** | **PARTIAL** | The byte-identical temporary renderer is gone and CPU asteroid/KBO code shares `solveKeplerFast`, but `scripts/ingest-moon-textures.mjs:5` imports a nonexistent `.js` module and `scripts/fetch_jpl_sbdb.py:36` targets deleted `src/data/planets.js`. Repair or retire them and add import/dry-run script smoke tests. |
| **F-19** | **PARTIAL** | Backend adapters now declare and normalize AU/AU-day J2000-ecliptic fields, but malformed/missing vectors silently become zero (`backend/sim/contracts.py:19-22,31-78`), schema metadata is not mandatory, and the frontend ignores velocity/frame/unit metadata. Make schema version, origin, frame, units and time scale required; fail closed and validate at the client boundary. Correct Tudat's stale AU/year module comment as well. |
| **F-20** | **RESOLVED** | `b6c4ce3` filters the shipped worker model from 434 catalog bodies to the 10 visible/required bodies, preserves source-index mapping, and publishes a versioned Float64 six-field state contract (`src/main.ts:110-143`; `modelWorkerContract.ts:29-42,92-147`). Five tests gate filtering, mapping, precision, schema and the 480-byte payload. The worker-plus-CPU double-propagation subclaim remains refuted. |
| **K-13** | **RESOLVED** | H29 emits `metric_slipstream` (`smbhPropagation.ts:568-581`), the AGN engine recognizes it, and `sunController.ts:368-395,486-493` creates, triggers and updates the warp mesh. Add a direct channel-to-visible-mesh regression. |
| **N-01** | **ACTIVE** | `/solar/physics` still ignores undeclared query keys (`backend/server.py:960-981`), so `julian_date=...` can silently select the wall epoch. Reject `request.query_params - allowed` or move to a strict request model; gate typo cases as 422. |
| **N-02** | **ACTIVE** | Observations with calculated confidence zero still receive a base blend of 0.25/0.78 and set `applied:true` (`backend/sim/solar_physics.py:487-519`). At/below the confidence floor, use synthetic state with zero weight and `applied:false`; add a stale-but-present observation fixture, not only a missing-data test. |
| **N-03** | **PARTIAL** | The literal trailing-space case is trimmed, but unmapped bodies still send a raw catalog name to Horizons without checking returned target identity (`backend/mission/ephemeris_service.py:237-247`). Require an explicit Horizons/SPK ID and reject ambiguous fallback. |
| **N-04** | **RESOLVED** | `3f5d097` gives both `tof_min_days` and `tof_max_days` strict `gt=0` constraints (`backend/server.py:719-725`) and tests negative/zero requests as 422 (`backend/tests/test_compute_budget.py:86-107`). |
| **N-05** | **PARTIAL** | Server grid caps, dedicated executors, lifetime-owned permits and cooperative cancellation now bound request amplification (`3f5d097`; `backend/server.py:434-475,1165-1208`). The scan still accumulates every successful point and failure before slicing the response (`backend/trajectory/lambert.py:381-441`). Replace full lists with bounded top-K/online Pareto state and aggregate failure counters. |
| **N-06** | **ACTIVE** | Lambert and porkchop endpoints still catch `KeyError`/`ValueError` but not ephemeris-provider exhaustion `RuntimeError` (`backend/server.py:1147-1158,1180-1208`), so that path remains an HTTP 500. Map transient provider exhaustion to structured 503; reserve 422 for a valid provider returning no physical solution. |
| **N-07** | **ACTIVE** | The H29 disclaimer is written once into `#body-info` (`src/main.ts:1088-1095`) and ordinary body selection overwrites that same node (`:1031-1033`). Move it to a persistent adjacent status/live region controlled by the selected hypothesis. |
| **N-08** | **NOT-A-BUG** | The custom shader replacement omits three.js's conditional `worldpos_vertex` guard, but the current shader compiles and the unconditional local declaration is harmless. Preserve the upstream guard or add a shader-compile upgrade test as maintenance hardening; this is not a current runtime defect. |
| **N-09** | **ACTIVE** | Belt and Kuiper meshes still disable frustum culling (`src/frontend/features/asteroids/beltRenderer.ts:382-383,499-500,560`). Define conservative bounds that include GPU orbital displacement, re-enable culling, and test visibility from representative camera directions. |

### Commit-level change in priority

The original headline N-body defect is scientifically closed by `2226277`; current work should not continue treating it as the dominant blocker. The subsequent commits summarized above additionally close bounded WebSocket resource ownership, PFSS cache identity, asteroid integrity/provenance, and unpowered-flyby continuity in their Report B/C rows. The highest-priority remaining scientific-contract work in this report is now F-03/F-05/F-19 and N-01/N-02/N-03/N-06; the original report body follows only for historical evidence.

---

## What this part is

The comprehensive evaluation of 2026-08-23 (`CODEBASE_EVALUATION_REPORT_2026-08-23.md`) produced 20 findings, F-01..F-20, every one of them re-derived by a single reviewer. Its planned independent adversarial pass **never ran** — its verifier agents died on a spend limit. This part closes that gap.

**Method.** Eleven agents, each assigned a finding cluster, each instructed to (1) re-run the reproduction from a clean state, (2) actively try to **refute** the finding — wrong line, guard in a caller, unreachable path, overstated impact, environmental artifact — and (3) record the refutation attempt and its outcome. A finding that could not survive a refutation attempt was to be downgraded or deleted.

This was executed **twice**. Run 1 and run 2 used the same cluster definitions but run-2 agents were explicitly told to derive everything fresh from source and their own command output, not to read run-1 artifacts, and to say plainly where they disagreed. **Run 2: 11/11 agents, 0 errors, 580 tool calls, ~1.25 M tokens.** Both runs are reported below, because agreement across two blind passes is stronger evidence than either alone — and the four places they disagree are the most interesting rows in the table.

## Headline

**No finding was wholly refuted. Three sub-claims were.** Of the 20 findings plus K-13:

| Disposition | Count | Findings |
|---|---|---|
| **CONFIRMED** unchanged | 13 | F-01, F-02, F-03, F-04, F-05, F-06, F-09, F-11, F-14, F-17, F-18, F-19, K-13 |
| **REVISED** — real, mechanism/severity/blast-radius differs | 7 | F-07, F-08, F-12, F-13, F-15, F-16, F-20 |
| **Sub-claims refuted** | 3 | F-08 "~60 missing paths"; F-15 "epoch quantization in the shipped binary"; F-20 "worker *and* CPU both propagate every tick" |

The register survives as a body of work. What the adversarial pass bought is **precision**: several findings were stated more broadly than the evidence supports, and two were understated.

---

## 1. Verdict table (both runs)

| ID | Run 1 | Run 2 | Agreed severity | What the adversarial pass changed |
|---|---|---|---|---|
| **F-01** belt inside the Sun | CONFIRMED crit | CONFIRMED crit | **Critical** | Run 2 found the defect is *also* in the `projectVertex` chunk, which drives `gl_Position` — so it is direct on-screen geometry, not a lighting artifact. Realistic-scale mode makes it ~1000× worse, not better. |
| **F-02** default `ias15` dead | CONFIRMED **crit** | CONFIRMED **high** | *disputed* — see §3.1 | Run 2 showed the shipped frontend never opens a WebSocket at all, so no user reaches this path today. Real, but not user-facing on `main`. |
| **F-03** benchmark fabricated | CONFIRMED high | CONFIRMED high | **High** | Run 2 enumerated 0–8 revolutions in both senses with pykep (Nmax=0 → only two branches exist) and refuted the "window-optimised capture" excuse `sun-focus` adopts. |
| **F-04** N-body mean-as-osculating | CONFIRMED high | CONFIRMED high | **High** | Run 2 re-seeded the same 10 bodies from Horizons state vectors: Saturn error drops 60.2 → **0.124 Mkm**, proving the initial conditions are the entire defect. And *every* body is worse, not just Saturn. |
| **F-05** moon frame conversion | CONFIRMED high | CONFIRMED high | **High** | Both runs independently found the register understates it: there are **three** compounding defects, not one. |
| **F-06** Lambert uncertified | CONFIRMED high | CONFIRMED high | **High** | Run 2 measured endpoint miss **2.09 AU** at TOF 0.01 d and confirmed `computedTofDays` is absent from the response body entirely. |
| **F-07** planet mean elements | CONFIRMED med (14 Mkm *not* reproduced) | REVISED med (**14 Mkm rescued**) | **Medium** | Run 1 sampled 3 epochs and found max 7.57 Mkm; run 2 swept 1990–2060 yearly and found Saturn peaks at **12.89 Mkm**. The register's figure was roughly right; run 1 simply didn't look at enough epochs. |
| **F-08** README ≠ product | REVISED med | REVISED med | **Medium** | Both runs **refute "~60 referenced paths missing"**: all 70 Project-Structure paths exist. Correct statement: 5 dead absolute links, 31 of 70 documented entries unreachable. |
| **F-09** 1,300 tsc errors, no gate | CONFIRMED high | CONFIRMED high | **High** | Run 2 rebuilt the reachable set from scratch (BFS incl. `new URL(...,import.meta.url)`) and got 438 exactly. Nuance: a `typecheck` script *does* exist — it is simply never chained into `build` and there is no CI. |
| **F-11** security posture | CONFIRMED high | CONFIRMED high | **High** (network-exposed) | Run 2 **executed** the overwrite on a sandboxed repo copy and destroyed a sentinel file. Both runs independently tightened the same sub-claim: the write is confined to `my-notes/**/*.md`, not arbitrary-FS. |
| **F-12** per-frame resize | CONFIRMED high | REVISED med | **Medium** | Both runs converged on a sharper mechanism than "setPixelRatio each frame": a **unit mismatch** (`canvas.width` in device px vs `w` in CSS px) means the guard can never be true on any DPR>1 display. |
| **F-13** H29 displaces bodies | REVISED med | REVISED **low** | **Low** | Both runs agree the mechanism is exactly as described *and* that it is a **numeric no-op**. Run 2 quantified it: max **2.87e-11 AU (4.3 m)** per frame — far below the 1e-4 AU info-box print resolution. |
| **F-14** corona non-deterministic | CONFIRMED med | CONFIRMED high | **High** | Run 2 diffed per-feature: **1,633 numeric field differences** across 220 matched features between two calls 0.5 s apart at the same `jd`. Also: only NOAA SWPC is dead; SILSO and Helioviewer still respond. |
| **F-15** asteroid fp32 / self-test | CONFIRMED high | REVISED high (**half refuted**) | **High** | Run 2 **refutes the "in binary" half**: the shipped catalog's float32 epochs are *lossless* (all multiples of 0.25 d). The 0.125 d error is a property of the synthetic **test generator**, not the data. The GPU quantization and the failing self-test are both real. |
| **F-16** licensing/provenance | REVISED med | REVISED med | **Medium** | Both runs tightened the same point: the README credits d3-celestial **correctly**; the Gaia mis-attribution is confined to `scripts/fetch_gaia_catalog.py`. Run 2 measured a 5042/5042 exact match against upstream. |
| **F-17** resilience / a11y | REVISED high | CONFIRMED high | **High** | Run 2's A/B browser test: WebGL off → 1 uncaught page error, body list empty, date `--`, and **no error word anywhere in visible text**. |
| **F-18** dead/duplicate/broken scripts | CONFIRMED med | CONFIRMED med | **Medium** | Run 2 measured 7 Kepler solver copies (5 distinct implementations) and confirmed the `temp_` duplicate is byte-identical by md5 after its 619-line comment header. |
| **F-19** cross-engine contract | CONFIRMED med | CONFIRMED med | **Medium** | Both runs agree this is **latent, not live** — the frontend never reads the `vel` field. Run 2 enumerated the live message keys: no `units`, `frame`, or `schema_version`. |
| **F-20** 434-body propagation | REVISED med | REVISED med | **Medium** | Both runs **refute "worker *and* CPU both propagate every tick"**: `main.ts:827-829` early-returns on a successful worker snapshot. The wasted 424-moon propagation is real. |
| **K-13** warp mesh never renders | CONFIRMED | CONFIRMED | **Low** | Run 2 executed `computeMultiMessengerTimeline` in H29 mode and enumerated the runtime channel keys — `'warpMetric'` is absent. Worse: the mesh is *drawn and discarded* every AGN frame (~33k verts). |

---

## 2. The three refuted sub-claims

These matter because a register that overstates loses credibility on the findings that are exactly right.

**F-08 — "~60 referenced paths do not exist" is false.** Run 2 checked all 70 README Project-Structure entries: **70/70 exist** (the single "missing" hit was a `#`-glue parse artifact). What is true: **5** distinct absolute `/home/nomad/Documents/...` links are dead, and **31 of 70** documented entries are unreachable from `src/main.ts`. The real doc defect is "these files exist but are not wired into the shipped app," which is a different and more useful statement.

**F-15 — the shipped binary's epochs are not quantized.** Run 2 decoded the shipped `.bin`: every float32 epoch is an exact multiple of 0.25 d and **99,956/100,000 are identical** to their source values — lossless, because the source epochs are themselves quarter-day values. The 0.125 d round-trip error the register cites comes from the **synthetic test generator** (`asteroidCatalogLoader.ts:285` adds 0.125/0.25-day fractions), not from any shipped data. The GPU-side quantization (absolute JD in an fp32 uniform → 0.25 d ULP → ~376,000 km along-track steps) and the self-test returning `ok:false` at 1250× its documented tolerance are both **confirmed**.

**F-20 — the worker and CPU paths do not both run.** `main.ts:827-829` early-returns once a worker snapshot lands, so the main-thread `model.update` executes only during startup or after the worker errors out. What is confirmed is the genuinely wasteful part: the worker propagates all **434** bodies including **424 moons that are never rendered** (98.3% of propagation cost, 97.7% of the worker→main payload) because `showMoons = false`.

---

## 3. Where the two runs disagreed

Four disagreements, all worth stating rather than smoothing over.

### 3.1 F-02 severity: Critical (run 1) vs High (run 2)

Both runs agree on every fact: `rebound_nbody.py:70-72` sets `sim.ri_ias15.min_dt/.epsilon`; REBOUND 5.1.1 has no such attribute (`'ri_ias15' in dir(Simulation())` → `False`); the default and explicit-`ias15` WebSocket connections both die `engine_init_failed` → close 1011; `whfast` and `mercurius` work (energy error 1.6e-15 / 2.2e-15); `/health` reports `available:true, fidelity:high` because it only checks that the module imports; and `test_seek_optimizations.py` monkeypatches a `_FakeIAS15` so 48/48 pass over the crash.

They disagree on blast radius. Run 2 established that **no shipped code path reaches this at all**: `src/main.ts` contains no WebSocket, and `simulationClient.ts` — the only module that opens `/ws/sim`, hardcoding `integrator: 'ias15'` — has **zero importers** anywhere in `src/`.

**Resolution: High, not Critical.** It is a genuine broken-capability-plus-false-health-claim defect, and the mocked test is a real testing failure. But nothing a user of the shipped app touches is broken by it today. It becomes Critical the moment the WebSocket client is wired up — which is exactly what the README already promises.

### 3.2 F-07 magnitude: run 2 rescued the register's number

Run 1 sampled three epochs, found a maximum Saturn error of 7.57 Mkm, and called the register's "1–14 Mkm" overstated. Run 2 swept **yearly from 1990 to 2060** against Horizons and found Saturn peaks at **12.89 Mkm** (around the 2020s), Jupiter 3.23, Uranus 1.69, Neptune 1.55. The register's upper bound was approximately right; run 1 simply sampled too few epochs to see it. **This is the clearest argument for running the pass twice** — a single blind pass produced a confidently wrong downgrade.

Run 2 also apportioned the UTC-as-TDB error precisely: the 69.184 s offset contributes only 0.06% of Saturn's error but **19.4% of Earth's**.

### 3.3 F-13 severity: Medium (run 1) → Low (run 2)

Both runs independently reached the same surprising conclusion — the `1e12` "visual exaggeration" multiplier multiplies a β of order 1e-18, so the H29 displacement is physically invisible. Run 2 measured the maximum per-frame world-position offset at **2.87e-11 AU (4.3 m)** for the H29 preset and 7.8e-9 AU (1.17 km) for the largest-energy preset, against a 1e-4 AU info-box print resolution. The mechanism (writes into `state.worldPosition`, non-integrating, runs while paused, reaches three user-visible consumers) is fully confirmed; the consequence is not. **Resolution: Low**, and the finding should be restated as a *labelling* issue, not a state-corruption one.

### 3.4 F-12 severity: High (run 1) → Medium (run 2)

Same mechanism, better characterized in run 2 (the CSS-px vs device-px unit mismatch at `main.ts:880`). Both agree the redundant `setSize` + `updateProjectionMatrix` runs every frame forever on any HiDPI display. Since the measured cost is real but bounded and the fix is a one-line comparison change, **Medium** is the better call.

---

## 4. Selected evidence

The strongest independent re-derivations from run 2, quoted because they are what a second engineer would want to re-run:

**F-01** — instantiated the real renderer under Node and read `mesh.instanceMatrix` directly, rather than reasoning about GLSL:
```
i=    0  a=2.769 AU  |orbit|=2.7066 AU  |world_actual|=0.023496 AU  |world_if_correct|=2.7001 AU
i=14999  a=2.695 AU  |orbit|=2.4462 AU  |world_actual|=0.005445 AU  |world_if_correct|=2.4451 AU
ALL 15000: orbital radius 1.742..3.700 AU  ->  MAX rendered world radius 0.023496 AU
instanceMatrix decompose: scale=(2.7e-3..7.67e-3), translation=(0,0,0) for every instance
Sun rendered radius = 0.3754 AU  ->  the belt blob sits 16x inside the Sun's sphere
```
Five refutation routes were tried and all failed, including executing `updatePositions()` with a 2.5 AU array and confirming `instanceMatrix` does not change.

**F-04** — the isolation experiment that proves the cause:
```
body      Kepler err   N-body err    N/K
saturn      1.179 Mkm    60.204 Mkm  51.0x
earth       0.010        0.232       22.1x
neptune     0.665       15.009       22.6x
Same 10 bodies re-seeded from Horizons STATE VECTORS instead of elements:
saturn 60.204 -> 0.124 Mkm   (whfast and ias15 bit-identical)
```
The integrator is exonerated; the initial conditions are the entire defect.

**F-05** — with Earth's Moon as a control (it bypasses the converter, so a large error there would indict the test harness rather than the code):
```
moon        frame      dr(km)     dr/r    sep°    plane°
Moon (CTRL) ecliptic     4,432    0.011    0.53     0.13   <- harness is sound
Io          Laplace    827,729    1.970  159.95     4.42
Callisto    Laplace  3,506,727    1.864  137.40     3.66
Enceladus   Laplace    451,639    1.906  144.16    56.13
```

**F-11** — the file-overwrite primitive, executed against a sandboxed copy:
```
POST /benchmark/accuracy/report {"output_path":"ACCURACY_REPORT_2026-02-15_04-51-05.md"}
  -> sha 8fce85b8 -> ab4e4058; sentinel "IMPORTANT USER NOTES" grep count 0 (file destroyed)
"a/b/c/d/e/f/g/pwn.md" -> 200, 7 directories created under my-notes/
Traversal correctly REJECTED: ../README.md, /etc/passwd, my-notes/../README.md, symlink escapes
GET /health -H 'Origin: https://evil.example'
  -> access-control-allow-origin: https://evil.example + allow-credentials: true
```

---

## 5. New issues surfaced while verifying

The refutation pass was not supposed to find new defects, but adversarial reading does that anyway. These are carried into **Report C** for disposition; listed here for provenance:

- **`/solar/physics` silently ignores unknown query parameters.** `?julian_date=...` (instead of the declared `jd`) returns a state for the current wall-clock instant with no warning — a caller typo yields plausible-looking wrong-epoch data.
- **Zero-confidence observations are still blended.** `data_assimilation.applied=true` with `observed_confidence=0.0` and `blend_weight=0.25` — the model blends in an observation it knows nothing about.
- **`ephemeris_service.py:238-243`** falls back to sending a raw catalog name (e.g. `'Europa '`) as a Horizons `COMMAND` for any body outside its 10-entry map.
- **`TrajectoryPorkchopRequest.tof_min_days`** has no `gt` constraint while the step fields do, so `tof_min_days=0.01` is accepted and every sub-feasible grid row enters the scan.
- **`scan_porkchop_window`** accumulates every solved cell in memory and truncates only at serialization (`points[:500]`), so memory scales with the grid, not the response.
- **Unhandled `RuntimeError` → HTTP 500** on `/trajectory/porkchop` and `/trajectory/lambert` when the provider chain is exhausted.
- **The H29 speculative label is destructible**: `main.ts:1018-1025` writes it into `#body-info` on one change event, and any later body-list interaction overwrites it.
- **`beltRenderer.ts:175-188`** drops the `#if defined(USE_ENVMAP) || ...` guard three.js wraps `worldpos_vertex` in — harmless today, breaks if three moves the declaration.
- **Frustum culling is disabled on the belt** (`mesh.frustumCulled = false`), which masks that its bounding sphere is ~0.02 AU; re-enabling culling would cull the entire belt.

---

## 6. What this part did not do

- It did **not** re-derive the Ground-Truth-Packet baseline (that is Report 0) or hunt outside the register (that is Report C).
- Four F-items touch code that is unreachable from `src/main.ts`; their severities are stated for the dormant class, with the reactivation trigger noted, per the scope rule in Report 0 §1.2.
- TudatPy and real-GPU measurements remain blocked; no finding here depends on either.
