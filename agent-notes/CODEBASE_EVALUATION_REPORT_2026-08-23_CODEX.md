# solar-system-realistic-sim — Codebase Evaluation Report (Codex)

> **Historical snapshot — not current branch status.** This evaluation is pinned to `main @ aa6e39a03e7d95d6f7733e8a4710b990bada9859`; its findings must not be read as claims about later branches or commits.

## 1. Header

| Item | Value |
|---|---|
| Evaluated checkout | `main @ aa6e39a03e7d95d6f7733e8a4710b990bada9859` |
| Commit date | 2026-03-07 01:16:50 −05:00 |
| Evaluation date | 2026-08-23 (America/New_York) |
| Comparison checkout | cached `origin/sun-focus @ fd793f43d0b62ab211e37e344fdbf657bfaf0072` (2026-07-25) |
| Merge base / divergence | `c3b00e058d6a4963396b5e5b6bce11d2b83a5b7e`; main-only 7, sun-focus-only 69 |
| Tools | Node 22.23.2; npm 10.9.8; Vite 7.3.1; TypeScript 5.9.3; Python 3.14.6 clean venv; REBOUND 5.1.1; FastAPI 0.141.1; Starlette 1.6.0; pytest 9.1.1; headless Chromium/SwiftShader |
| Host | WSL2 Linux 6.18, x86-64, Ryzen 9 9950X3D (32 logical CPUs), 45 GiB RAM |
| Review effort | approximately 55 minutes wall-clock with four parallel reviewers (about 3 reviewer-hours), followed by synthesis |

Scope decisions: `main` is the evaluated product. Reachable code is judged as shipped; unreachable code is inventory and its defects are capped at Medium. The speculative astrophysics is not peer-reviewed here: only standard calculations, labels, and side effects are checked. Assets are assessed for use, integrity, size, and attribution—not aesthetics. `sun-focus` was built and tested in throwaway worktrees and is used only for branch comparison.

At audit start the checkout already contained six untracked evaluation artifacts: `CODEBASE_EVALUATION_REPORT_2026-08-23.md`, `MAJOR_ISSUE_REPORT_0_BASELINE_2026-08-23.md`, `audit.html`, `codebase_evaluation_prompt_2026-08-22.md`, `codebase_evaluation_prompt_major_issues.md`, and `major_issues_audit_prompt_2026-08-23.md` (all under `agent-notes/`). During the run another process changed the unsuffixed report and added/removed further audit artifacts. This report therefore uses the collision-safe `_CODEX` suffix and does not overwrite those user/concurrent files. At 19:43 local time, a concurrent cleanup removed the entire `.eval/` directory after its outputs had been captured into this report and the reviewer transcripts. Appendix A therefore embeds the relied-on excerpts, and Appendix C records the now-ephemeral probe names/purposes. No tracked project file was changed.

Limitations: `git fetch origin` failed with SSH `Permission denied (publickey)`, so the comparison uses the locally cached ref. TudatPy was unavailable and was read but not executed. A real GPU was unavailable. Live upstream services were not load-tested. The `sun-focus` EPO smoke run was aborted after more than 11 minutes waiting in its JPL Horizons fallback. The content of roughly 55 research papers was not scientifically peer-reviewed, and individual duplicate research notes were hashed rather than read in full.

## 2. Executive summary

Five facts dominate this evaluation. First, a clean checkout cannot pass its own verification path: TypeScript reports 1,300 errors, `main` has no frontend test command, and the current backend requirements omit `httpx2`, causing three pytest modules to fail collection. Second, the documented default WebSocket engine fails immediately under the dependency it installs—REBOUND 5.1.1 removed `ri_ias15`—while `/health` says REBOUND is available. Third, a newly verified shader transform-order bug scales every live asteroid's 2–3.5 AU orbital translation by its tiny instance radius, collapsing the advertised 15,000-body belt to roughly 0.0075 AU. Fourth, the main-branch Lambert wrapper silently labels solutions computed for 23.51, 7.31, and 17.15 days as requested 2-, 5-, and 10-day transfers. Fifth, only 15 of 42 substantive README claim rows are true on HEAD (35.7%).

There are real foundations worth keeping: the base Kepler solver is numerically robust, the ACBF binary/checksum chain is internally consistent, the REBOUND WHFast core conserves energy well, request validation and queue boundaries are thoughtful, and `sun-focus` adds useful tests and fixes. They do not yet make the shipped application trustworthy.

**Maturity verdict:** a capable research/visualization prototype whose default branch is not a reproducible or scientifically dependable release.

**Trust statement:** a second engineer can rely on the Vite production build, JD helpers, base elliptic Kepler solver, ACBF integrity checks, and several isolated numerical kernels after running their probes; rendered asteroid/moon geometry, default backend operation, trajectory/mission outputs, benchmarks, and README feature claims require re-verification.

## 3. Scorecard

Scores use the prompt's 1–5 anchors; no aggregate score is computed.

| # | Dimension | Score | Cited basis |
|---:|---|---:|---|
| 1 | Build & test health from a clean clone | 1 | F-001: build passes, but `tsc` fails; no main frontend test command; fresh pytest cannot collect. |
| 2 | Type safety as practiced | 1 | F-001: 1,300 errors, including 438 in seven live files; live HTTP/worker/controller boundaries are not consistently typed. |
| 3 | Architecture & modularity of live app | 2 | F-030: 1,083-line `main.ts` owns scene, loop, workers, belts, and AGN while an 8,275-LOC extracted stack is dead. |
| 4 | Correctness of live paths | 1 | F-003 and F-004 are silent wholesale position/TOF errors. |
| 5 | Physics fidelity and labelling | 1 | F-007, F-010, and F-011: frame transforms and standard unit conversions are wrong; H29 is not clearly fenced as fictional. |
| 6 | Data integrity and provenance | 2 | ACBF hashes/layout are strong, but F-012/F-026/F-027 show lossy epochs/periods, synthetic composition, and hash-derived moon radii. |
| 7 | Backend robustness and concurrency | 1 | F-002/F-013/F-014/F-019: default init failure, uninterruptible work, permanent error latch, and runner/payload leaks. |
| 8 | Security and operational exposure | 1 | F-005/F-020: cross-origin destructive write plus unauthenticated unbounded compute/upstream refresh on a public bind. |
| 9 | Performance and resource use | 2 | F-009/F-019/F-022/F-028: high-frequency 0.5 MB polling, redundant propagation, large frames, and unconditional per-frame uploads. |
| 10 | Test strategy | 1 | F-001/F-021: no main frontend runner; backend fakes mask REBOUND; zero main WS/runner/real-engine tests. |
| 11 | Documentation accuracy | 1 | F-006: 15/42 README claim rows are true; architecture-changing commits are absent from the mandated logs. |
| 12 | Repository hygiene and process | 1 | F-021/F-031: broken scripts, personal paths, no CI/LICENSE/LFS policy, duplicate notes, stale default branch. |

**Claims-accuracy ratio:** **15/42 = 35.7% TRUE-ON-HEAD**. Compound or partially true rows count against, as requested; focus/follow exists, but the claimed search and smooth transition do not.

## 4. Baseline measurements

### Main and ground-truth drift

| Measurement | Packet (2026-08-22) | Re-measured 2026-08-23 | Drift / interpretation |
|---|---:|---:|---|
| `npm ci` | success | success, 24 packages | none |
| `npm run typecheck` | 1,300 errors | exit 2, 1,300 | none |
| Error codes | TS7006 439; TS2339 438; TS7031 188; TS18047 90; TS7005 79; TS7034 30 | identical; 36 other | none |
| Live-code TypeScript errors | 438 in 7 files | 438 in 7 files | none |
| Reachability | 30 files / 11,329 LOC live; 32 / 8,275 dead | identical | none |
| `vite build` | 848.57 kB main, 18.4 kB worker, 6.5 kB CSS | 848.57 kB (gzip 208.04), 18.44 kB, 6.53 kB; 1.49 s | gzip packet said 209.85; content size stable |
| Worker handler in main chunk | 1 | 1 | none |
| Fresh Python install | REBOUND 5.1.1; missing `httpx` | REBOUND 5.1.1; current Starlette requires undeclared **`httpx2`** | dependency ecosystem drift; root defect persists |
| Fresh pytest | 3 modules fail collection | 3 modules fail collection in 0.23 s | none except dependency name |
| After undeclared client dependency | 48 pass | 48 pass, 1 warning, 0.45 s, 12 modules | none |
| Frontend tests | none | `npm test` fails: missing script | none |
| EPO smoke | 0/30 | 0/30, no exceptions; every family 0/10 | none |
| Accuracy benchmark | 0/3 | 0/3; `passRate=0` | none |
| Default `/ws/sim` | `ri_ias15` failure | `engine_init_failed`, close 1011 | none |
| DOM direct IDs | live path clean | all 28 direct IDs exist; 31 IDs total | none |
| Dead injected DOM handles | about 50; 14 resolve | exactly 50 mapped; 14 resolve, 36 absent | clarified |
| Tracked source/docs | 63 TS; 54 py; 85 md; moons JSON 9,330 lines | identical; 62 TS under `src`, 19,604 TS LOC | none |
| Repo/assets | pack 46.6 MiB; `src/assets` ~39 MB; `public` 4.4 MB | pack 46.63 MiB; assets 38.68 MiB/25 files; public 4.4 MB | none |
| Code counters | console calls 8 | 9 actual TS calls; explicit `any` 4; non-null 3; no ignore/nocheck/TODO | console count +1 from stricter pattern |

The seven live files with errors are `sunController.ts` 109, `smbhPropagation.ts` 81, `main.ts` 72, `solarPhysicsClient.ts` 60, `agnShockwaveEngine.ts` 55, `sunVisuals.ts` 51, and `solarObservationTexture.ts` 10. The worst repo-wide file is the unreachable `satelliteSystem.ts` at 311.

### Runtime probes

| Probe | Result |
|---|---|
| Browser, >30 s | no page errors or failed requests; one Three warning: `sizeAttenuation` is not a `ShaderMaterial` property |
| UI | title “Sun Model Lab”; 31 IDs; 10 selectable bodies; status `Bodies: 20,010` |
| Phase-1 catalog | accepted 100,000 rows in 366 ms; checksum matched |
| Pause | date remained `2026-10-14`, but screenshots 1.5 s apart changed 464,123 pixels (37.92%, MAE 0.7545) |
| Realistic focus | Earth and Pluto both focused at 0.01 AU (1,495,979 km); computed Earth diameter about 9.09 px at 1080 px/58° |
| H29 | event ran, but instrumented `metric_slipstream` fired with `warpImpacts=0`; no violet pixels observed |
| First-paint kernels | catalog 11.06 ms; Sun texture 316.7–341.9 ms; asteroid generation 18.40 ms; KBO generation 7.75 ms |
| Frame kernels | 434-body model update 0.10–0.12 ms; KBO propagation 1.126 ms plus 320,000-byte matrix upload |
| HTTP | all GET surfaces returned 200; high/180 solar physics 495,672 B; AIA tile 206,295 B; default mission POST 422 |
| CORS | `https://evil.example` reflected with `access-control-allow-credentials: true` |
| WHFast WS | connected; pause/time scale/seek worked until `get_orbital_elements(sun)`, then permanent runtime error with `paused:false` after resume |
| Long seek | `stop()` returned at 3 s while worker remained alive; checkpoints 4 at 35 y, 11 at 105 y, 21 at 205 y |
| Kuiper backend | requested 365 d/s delivered 12.165 simulated d/wall-s; paused 10 Hz stream sent ~100.9 kB each tick |

Every valid/invalid POST body was exercised: Lambert, porkchop, trajectory plan, mission plan, nearby-system lookup, and report path validation. Pydantic rejected extra/invalid inputs and path traversal/non-Markdown report targets. The valid Lambert core and small porkchop returned 200; the default mission returned `422 no_verified_candidate`.

### `sun-focus` delta

| Measurement | main | cached `origin/sun-focus` | Assessment |
|---|---:|---:|---|
| Branch relation | — | 69 ahead / 7 behind; 104 files, +14,058/−3,065 | divergent, not fast-forwardable |
| Clean npm install | 24 packages | 61 packages | Vitest/test dependencies added |
| Tracked source/docs | 63 TS / 54 py / 85 md; `src` TS 19,604 LOC | 67 TS / 58 py / 91 md; `src` TS 22,527 LOC | larger active branch |
| Type errors | 1,300 (438 live) | **341** (242 live) | packet's 344 drifted; substantial but still red |
| Reachability | 30 / 11,329 live; 32 / 8,275 dead | 32 / 13,731 live; 34 / 8,796 app-unreachable (3 are test roots) | `planetShaders`/`quadtreeLOD` become live; most old stack stays dead |
| Build | 848.57 kB / gzip 208.04 | 890.15 kB / gzip 220.85 | passes, +41.58 kB raw |
| Frontend tests | none | 3 files, 8 tests pass | useful but narrow |
| Backend tests | 48 pass after undeclared `httpx2` | requirements still omit `httpx2`; after install, 80 pass, **1 fails**, 2 warnings | new real-engine test exposes the same REBOUND break |
| Benchmark | 0/3 pass | all 3 fenced `incomparable_reference`; coverage 0 | more honest, still no validation coverage |
| EPO | 0/30 | not completed; auto fallback waited >11 min in Horizons | new reproducibility/network regression |

### Runtime map

```text
index.html -> src/main.ts -> sceneSetup/bodyManager/timeController
                         -> planets.ts + moons.json -> catalog.ts
                            -> SolarSystemModel and modelWorker -> scene nodes
                         -> phase1 .meta/.bin -> phase1AsteroidCatalog
                            -> asteroidBelt -> beltRenderer GPU shader
                         -> kuiperBelt -> CPU propagation -> instance matrices
                         -> solarPhysicsClient -> backend /solar/*
                            -> sunController -> sunVisuals/flares/magnetics
                         -> #agn-* -> agnShockwaveEngine -> sun callbacks
                            -> metricFrameDragPeak -> local + worker model paths

HTTP: browser -> FastAPI validation -> solar/trajectory/mission/benchmark services
WS: client -> one SimulationRunner thread -> REBOUND/Tudat engine -> bounded queues -> async sender
```

The live browser contacts its same-host backend at `:8042`; the backend contacts SWPC, SILSO, and Helioviewer. Frontend URLs to USGS, CelesTrak, Solarviews, and NASA GIBS occur only in unreachable modules. Simulation JD drives orbital positions/body spin; `performance.now()`/wall time drives Sun shaders, flares, solar blending/polling, controls, GW/warp visuals, worker dispatch, and both belt refresh loops even while paused.

## 5. Findings index

| ID | Severity | Reachability | Subsystem | Primary location | Title | Status | Effort |
|---|---|---|---|---|---|---|---|
| F-002 | Critical | BACKEND | simulation | `backend/sim/rebound_nbody.py:65-72` | Installed default IAS15 cannot initialize, but health advertises it | VERIFIED | S |
| F-004 | Critical | BACKEND | trajectory | `backend/trajectory/lambert.py:104-146` | Lambert silently substitutes a different time of flight | VERIFIED | S |
| F-005 | Critical | BACKEND | security | `backend/server.py:85-91,716-731` | Cross-origin unauthenticated endpoint overwrites research notes | VERIFIED | S |
| F-003 | Critical | LIVE | asteroids | `src/frontend/features/asteroids/beltRenderer.ts:175-200` | Instance scaling collapses the entire asteroid belt | VERIFIED | S |
| F-001 | Critical | LIVE/BACKEND | verification | `package.json:6-23`; `backend/requirements.txt:1-9` | Clean-clone type/test contract is red and incomplete | VERIFIED | M |
| F-013 | High | BACKEND | lifecycle | `backend/server.py:758-760,938-946` | Unbounded seeks outlive disconnect and grow checkpoints | VERIFIED | M |
| F-014 | High | BACKEND | lifecycle | `backend/server.py:832-849,935-936` | One command error permanently bricks a session | VERIFIED | S |
| F-015 | High | BACKEND | protocol | `backend/sim/rebound_nbody.py:65-67,133-150` | Engine velocity units/frame disagree across one WS contract | VERIFIED | M |
| F-016 | High | BACKEND | trajectory | `backend/trajectory/mga.py:104-109,258-280` | MGA truncates routes and accepts powered flybys as unpowered | VERIFIED | M |
| F-017 | High | BACKEND | benchmark | `backend/benchmark/accuracy.py:162-273` | Accuracy benchmark supplies no supported validation evidence | VERIFIED | M |
| F-018 | High | BACKEND | mission/EPO | `backend/mission/agents.py:318-400` | Cargo, propellant, risk, and EPO contracts disagree | VERIFIED | M |
| F-019 | High | BACKEND | Kuiper/WS | `backend/server.py:817-911,1143-1188` | Frame overrun, repeated payload, and early-send path leak resources | VERIFIED | M |
| F-020 | High | BACKEND | operations | `backend/server.py:408-510,640-664` | Public endpoints admit unbounded CPU and upstream amplification | VERIFIED | M |
| F-006 | High | DOC | product claims | `README.md:1-17,121-143` | README materially describes a different application | VERIFIED | M |
| F-007 | High | LIVE | orbit catalog | `src/sim/catalog.ts:98-108,178-205,415-425` | Moon plane and apsidal transformations are wrong | VERIFIED | M |
| F-008 | High | LIVE | Sun | `src/main.ts:253-265,584-597`; `src/frontend/features/solar/sunVisuals.ts:25-34` | Solar features use incompatible axes and clocks | VERIFIED | M |
| F-009 | High | LIVE/BACKEND | solar data | `src/sunController.ts:127-135`; `backend/sim/solar_realtime_data.py:107-122` | Solar observation and polling pipeline is misleading and wasteful | VERIFIED | M |
| F-010 | High | LIVE | SMBH | `src/frontend/features/superluminal-modeling/smbhPropagation.ts:234-271` | Standard rigidity/gyroradius and radius units are wrong | VERIFIED | S |
| F-011 | High | LIVE | H29 | `src/frontend/features/superluminal-modeling/agnShockwaveEngine.ts:179-192,342-352` | H29's key, front speed, and UI labels contradict its behavior | VERIFIED | M |
| F-012 | High | LIVE/DATA | asteroids | `src/data/asteroidCatalogLoader.ts:185,222,305`; `scripts/fetch_jpl_sbdb.py:131-149` | Float32 epochs and 3-s.f. periods violate catalog fidelity | VERIFIED | M |
| F-021 | High | SCRIPT | tooling | `scripts/ingest-moon-textures.mjs:5`; `scripts/fetch_jpl_sbdb.py:34-36` | Documented maintenance and test scripts do not run safely | VERIFIED | M |
| F-031 | Medium | DATA/DOC | repository | `src/assets/textures`; `Development_Improvements.md:30-35` | Orphan binaries and absent governance make the repo hard to transfer | VERIFIED | M |
| F-026 | Medium | DATA/LIVE | asteroids | `scripts/build_asteroid_phase1_dataset.py:54-75,126-132`; `src/frontend/features/asteroids/beltRenderer.ts:22-23` | Synthetic taxonomy, heuristic perturbation, and cache gates distort data | VERIFIED | M |
| F-027 | Medium | DATA/LIVE | moons | `src/sim/orbitMath.ts:54-63`; `src/sim/catalog.ts:232-264` | Main omits secular motion and presents synthetic moon radii as measured | VERIFIED | M |
| F-022 | Medium | LIVE | worker/runtime | `src/main.ts:42-50,691-833`; `src/workers/modelWorker.ts:122-142` | Worker import claims `window.onmessage`; transport loses precision and lacks watchdog | VERIFIED | M |
| F-023 | Medium | LIVE | scale/camera | `src/main.ts:244-249,496-506,569-580` | “Realistic scale” retains display-sized overlays and poor focus framing | VERIFIED | M |
| F-024 | Medium | LIVE | H29/rendering | `src/sim/solarSystemModel.ts:165-193`; `src/frontend/features/solar/gravitationalWaves.ts:144` | Metric displacement is frame-rate dependent and dormant grids draw | VERIFIED | M |
| F-025 | Medium | LIVE/BACKEND | solar fidelity | `src/frontend/features/solar/sunVisuals.ts:108-115,306-318,750-764`; `src/frontend/features/solar/solarFlares.ts:175-273` | Solar formula/profile/lifetime/scale choices drift from labels | VERIFIED | L |
| F-028 | Medium | LIVE/BACKEND | Kuiper model | `src/main.ts:1061-1063`; `backend/sim/kuiper.py:60-180` | Kuiper work runs while paused/hidden and scientific class labels overclaim | VERIFIED | M |
| F-030 | Medium | LIVE/DOC | architecture/process | `src/main.ts:1-1083`; commits `04e99a4`,`d1484e8` | Rewrite replaced decomposition without recording the decision | VERIFIED | L |
| F-029 | Medium | UNREACHABLE | disconnected UI | `src/frontend/features/trajectory/localPlanner.ts:15-47`; `src/frontend/features/planetary/satelliteSystem.ts:201-233` | Dead stack is internally broken and unsafe to rewire wholesale | VERIFIED | L |

## 6. Findings detail

### Critical

#### F-001 — Clean-clone type/test contract is red and incomplete

**Classification:** VERIFIED · LIVE/BACKEND · Critical · effort M. **Locations:** `package.json:6-23`, `backend/requirements.txt:1-9`, live TypeScript files listed in §4.

```json
"build": "vite build",
"typecheck": "tsc --noEmit"
```

`npm ci` and Vite build succeed, but `npm run typecheck` exits 2 with 1,300 errors; 438 are on the live import graph. There is no main-branch `test`, lint, format, CI, or hook. A fresh Python 3.14 venv resolves Starlette 1.6.0, whose TestClient now requires undeclared `httpx2`; three modules fail collection. Installing it manually yields 48 passes, but none opens `/ws/sim` or a real REBOUND simulation. This directly meets the rubric's clean-clone Critical threshold.

**Impact:** a green bundle can conceal type-contract failures, and the checked-in backend test instructions do not reproduce. **Fix:** use the chosen canonical branch; make live TypeScript pass first, declare/pin runtime and test dependency sets (including `httpx2`), add an actual `npm test`, and gate `npm ci && npm run typecheck && npm test && pytest` in CI. **Acceptance:** those four commands pass in new Node/Python environments without an extra install. **Adversarial check:** build success was considered, but Vite intentionally does not type-check; errors remain live, and the fresh-venv failure reproduces independently.

#### F-002 — Installed default IAS15 cannot initialize, but health advertises it

**Classification:** VERIFIED · BACKEND · Critical · effort S. **Locations:** `backend/sim/rebound_nbody.py:65-72`, `backend/server.py:111-115,1075-1129`, `backend/tests/test_seek_optimizations.py:30-37`.

```python
self.sim = rebound.Simulation()
self.sim.integrator = self._integrator
if self._integrator == "ias15":
    self.sim.ri_ias15.min_dt = 0
```

The open requirement installs REBOUND 5.1.1, where `Simulation.ri_ias15` does not exist. `_rebound_available()` checks only the constructor's `available` property, so `/health` advertises REBOUND and the WS selects it; the default handshake then returns `engine_init_failed: 'Simulation' object has no attribute 'ri_ias15'` and closes 1011. The 48 main tests pass only because `_FakeSimulation` invents that member. `sun-focus` retains the defect, and its new real-engine test fails (80 pass, 1 fail).

**Impact:** the documented/default simulation service is unusable from a clean install, with a false-positive health signal. **Fix:** use the REBOUND 5 API or version-gate/remove these assignments, have readiness perform a minimal real initialization, and retain the sun-focus real-engine regression test. **Acceptance:** default WS emits `connected` under the pinned version and health reports unavailable if initialization fails. **Adversarial check:** WHFast was tested and works with ~`5.7e-15` one-year energy error; that is an explicit workaround, not a refutation of the default IAS15 contract.

#### F-003 — Instance scaling collapses the entire asteroid belt

**Classification:** VERIFIED · LIVE · Critical · effort S. **Locations:** `src/frontend/features/asteroids/beltRenderer.ts:164,175-200,393-414`.

```glsl
worldPositionWithOrbit.xyz += vOrbitOffset;
#ifdef USE_INSTANCING
  worldPositionWithOrbit = instanceMatrix * worldPositionWithOrbit;
#endif
```

The orbital translation is added before the per-instance matrix. Those matrices have zero translation and contain random rotation plus asteroid display-radius scale (`min/median=0.003`, max `0.007585`). Consequently a nominal 2.5 AU orbit is scaled/rotated to roughly 0.0075 AU (1.12 million km); realistic scale reduces a 1 km body's translation to `8.36e-9 AU`. The default screenshot shows no belt outside the display Sun, whose radius is ~0.3755 AU. The same shader order exists on `sun-focus`.

**Impact:** all 15,000 advertised live asteroid positions are silently wrong, including the accepted 100,000-row catalog sample—wholesale scientific misrepresentation. **Fix:** apply batching/instance transforms to the local vertex first, then add the orbital translation before `modelMatrix`, in both world and projection chunks; add a GPU/readback or transform-contract test asserting a 2.5 AU instance remains 2.5 AU from origin. **Acceptance:** sampled instance world radii agree with CPU Kepler positions within a stated float tolerance. **Adversarial check:** `instanceMatrix` was inspected for a compensating translation and has none; its scale is deliberate geometry scale, so no later transform restores the orbit.

#### F-004 — Lambert silently substitutes a different time of flight

**Classification:** VERIFIED · BACKEND · Critical · effort S. **Locations:** `backend/trajectory/lambert.py:104-146,180-196,228-246`.

```python
if root_low is None or root_high is None:
    z_star = best_z
    tof_state = _tof_from_z(z_star, r1_mag, r2_mag, A, mu)
```

When no root is bracketed, main returns the closest sampled `z` rather than failure. The low-level result carries `computedTofDays`, but `compute_lambert_leg` drops it and labels the leg with requested `tofDays`. Earth→Mars requests of 2/5/10 days returned states for 23.510199/7.307078/17.145202 days (residuals 21.510/2.307/7.145 days), with departure Δv as high as 511.6 km/s. The known Vallado core case itself agrees within `4e-5 km/s`. `sun-focus` correctly rejects all three via a residual guard.

**Impact:** a valid-looking 200 response silently associates velocities with the wrong arrival epoch. **Fix:** port the sun-focus residual guard, expose computed TOF/residual in the response, and reject outside tolerance; add these short-TOF cases plus an independent Vallado case. **Acceptance:** every returned leg satisfies `abs(computed-requested) < tolerance`; otherwise it is an explicit no-solution. **Adversarial check:** endpoint validation and the core solver were separately tested and are sound; the defect survives specifically in main's unbracketed fallback/wrapper contract.

#### F-005 — Cross-origin unauthenticated endpoint overwrites research notes

**Classification:** VERIFIED · BACKEND · Critical · effort S. **Locations:** `backend/server.py:85-91,170-193,716-731,1193-1195`, `backend/benchmark/accuracy.py:344-360`.

```python
allow_origins=["*"],
allow_credentials=True,
allow_methods=["*"],
allow_headers=["*"],
```

The server binds `0.0.0.0`; a hostile origin is reflected with credentials. The public report endpoint accepts any `.md` resolving under `my-notes` and `write_text` overwrites it. A safe tempfile monkeypatch demonstrated an existing `victim.md` changing from a user note to the generated report. Traversal and non-`.md` targets are correctly rejected; this is confined destructive write, not arbitrary-host filesystem write.

**Impact:** any web page or LAN peer that can reach the development server can destroy existing research Markdown under `my-notes`. **Fix:** bind loopback by default; use an origin allow-list; remove credentials unless required; require explicit local authorization; create reports exclusively with `O_CREAT|O_EXCL` under a dedicated generated directory. **Acceptance:** hostile preflight is denied and an existing path returns 409 without changing bytes. **Adversarial check:** confinement, extension checks, and traversal tests were re-run and narrow the claim; overwrite of an allowed existing note still survives.

### High

#### F-006 — README materially describes a different application

**Classification:** VERIFIED · DOC · High · effort M. **Locations:** `README.md:1-17,44-60,121-143`, `index.html:1-101`, `src/main.ts:283-285,358-380`.

```ts
const showMoons = false;
const theta = Math.random() * TWO_PI;
material = new MeshStandardMaterial({ color: new Color(col), roughness: 0.8 });
```

The README's “Solar System Mission Lab” promises moon/satellite/cloud/Milky-Way/nearby/Oort controls, planner, engine selector/Connect, catalog stars, and textured/ringed planets. The shipped “Sun Model Lab” has 31 IDs and only time, four display toggles, navigation, explorer select, and AGN controls. The 424 moons are propagated but hidden, stars are 6,000 random white points, planets are flat materials, and no UI WebSocket client is reachable. The row-by-row result is 15/42 true on HEAD.

**Impact:** onboarding, validation expectations, and product scope are materially false under common use. **Fix:** regenerate the feature table from DOM IDs and reachability, describe the Sun/AGN lab actually shipped, put dead work under a clearly labelled roadmap, and remove absolute `/home/nomad/Documents/...` links. **Acceptance:** every README feature has a browser smoke assertion or is marked unavailable. **Adversarial check:** backend-only features and files that merely exist were credited where true; dead modules were not counted as shipped features.

#### F-007 — Moon plane and apsidal transformations are wrong

**Classification:** VERIFIED · LIVE (loaded/propagated, hidden visually) · High · effort M. **Locations:** `src/sim/catalog.ts:98-108,178-205,415-425`; `src/sim/orbitMath.ts:54-85`.

```ts
return {
  x: -Math.sin(omega) * sinI,
  y: Math.cos(omega) * sinI,
  z: Math.cos(i)
};
```

The catalog normal is the Rz(180°) counterpart of the propagator's angular momentum, and argument of periapsis is not rotated when the reference plane/node changes. The fallback pole rotates +Z only about X, ignoring parent pole longitude. Executed checks found epoch direction/normal errors: Io 178.508°/4.411°, Titan 96.034°/54.808°, Cordelia 38.961°/164.608°; Ariel and Cordelia normals differ by 160.377°. Charon versus an independent JPL Horizons ecliptic state at J2000 differs 22.015° in direction and 42.694° in normal. `sun-focus` leaves these cases wrong.

**Impact:** all 67 non-ecliptic moon states can be in a wrong plane or orbital phase; if moons are exposed later, geometry will be scientifically false. **Fix:** define a tested frame basis from ICRF/equator to ecliptic, transform the full perifocal basis (not just `i/Ω`), use IAU parent poles, and validate Io/Titan/Cordelia/Charon against independent vectors. **Acceptance:** position/normal residuals at fixed epochs are within a declared ephemeris tolerance. **Adversarial check:** Uranian moons were not used alone because defects partially cancel; four frame families and an external Charon oracle were checked.

#### F-008 — Solar features use incompatible axes and clocks

**Classification:** VERIFIED · LIVE · High · effort M. **Locations:** `src/main.ts:253-265,584-597`, `src/frontend/features/solar/sunVisuals.ts:25-34,155-165,235-277,500-524`, `src/sunController.ts:225-260`.

```glsl
vLatitude = asin(clamp(vWorldNormal.y, -1.0, 1.0));
vec3 spotDir = vec3(cos(spotLat) * cos(spotLon), sin(spotLat), cos(spotLat) * sin(spotLon));
```

The mesh's local Y axis is quaternion-mapped to the physical spin vector near world Z, while shader latitude/streamers/holes still interpret world +Y as the pole. Coronal loops are under the rotating group while their generated coordinates already incorporate physics rotation. Body mesh spin uses simulation JD; sunspot longitude, UV drift, granulation, flare/GW effects use unrelated wall clocks. In a paused browser the date stayed fixed while 37.92% of pixels changed in 1.5 s.

**Impact:** solar latitude features are 90°-class misoriented and slide independently of the surface, including during pause. **Fix:** choose one local solar frame, compute latitudes before world transform, and pass simulation time/paused state through one clock; keep observation polling wall-clock but not physical animation. **Acceptance:** a pole marker, spot, and loop retain longitude relative to a paused/accelerated Sun. **Adversarial check:** the spin-group quaternion and shader world normal were traced through full parent transforms; the measured paused-frame delta confirms the mismatch is visible, not only algebraic.

#### F-009 — Solar observation and polling pipeline is misleading and wasteful

**Classification:** VERIFIED · LIVE/BACKEND · High · effort M. **Locations:** `src/sunController.ts:127-135`, `src/frontend/features/solar/sunVisuals.ts:274-280`, `backend/sim/solar_realtime_data.py:107-122,292-385`.

```ts
pollIntervalMs: 900,
timeoutMs: 2_600,
maxFeatures: 180,
fidelity: 'high'
```

The live request measured 495,672 B, or about 551 kB/s per tab at 900 ms, while blending reads only a subset of feature fields. A single 512-px Helioviewer interior tile covers roughly 16% of the disk diameter, yet is wrapped as an equirectangular full-sphere texture and used for an “activity proxy.” Backend `latest()` releases its lock before as many as 13 sequential 3.8 s upstream calls; the 2.6 s browser timeout and retry can overlap cold fetches. The warm cache ignores requested JD, and concurrent forced refreshes produced five fetches for five callers. SILSO's ~2.9 MB CSV can be fetched each 120 s refresh.

**Impact:** the visual suggests whole-disk/epoch fidelity it does not have and can create per-tab bandwidth and upstream storms. **Fix:** fetch a full-disk product with explicit projection, expose observation footprint/epoch, cache by epoch/channel, add single-flight and response limits, and poll compact deltas at a realistic cadence. **Acceptance:** one upstream transaction serves concurrent callers and the live page remains below a stated bytes/min budget. **Adversarial check:** both normal and explicit high/180 payloads were measured; the service was monkeypatched for concurrency rather than stressing third parties.

#### F-010 — Standard rigidity/gyroradius and radius units are wrong

**Classification:** VERIFIED · LIVE · High · effort S. **Locations:** `src/frontend/features/superluminal-modeling/smbhPropagation.ts:225-271`, `src/frontend/features/superluminal-modeling/smbhPhysicsConstants.ts:55-64,145-153`.

```ts
const rigidityGV = (energyEV * EV_ERG) / (chargeZ * E_CHARGE * C_CM_S * 1e9);
return (energyEV * EV_ERG) / (chargeZ * E_CHARGE * bFieldG * C_CM_S);
```

Both cgs expressions divide by an extra `c`. A 1 EeV proton at 5 μG yields `2.2251e10 cm = 0.001487 AU`; the correct ultrarelativistic cgs result is `6.6708e20 cm = 216.164 pc`, ratio `3.34e-11`. The packet's “1.5 AU” code result was itself 1,000× high. Rigidity is likewise low by ~`1.11e-13`; CR-tsunami arrival for the requested 1e56 erg Sgr A* case is `3.221735615e11 y`, not the channel's 1e5–1e6 y. Catalog Schwarzschild radii are metres labelled centimetres: Sgr A* `1.24e10` versus `1.227e12 cm`, M87 `1.9e13` versus `1.92e15 cm`.

**Impact:** standard, non-speculative values and downstream delays/deflections are wrong by 2–13 orders of magnitude. **Fix:** centralize dimensioned constants, implement `R_GV≈E_eV/(Z·1e9)` and `r=E_erg/(ZeB)`, correct radii and derived ISCO/photon values, and add hand-calculation tests. **Acceptance:** the numeric examples above match to <1%. **Adversarial check:** equations were recalculated from cgs units and both code and expected values were executed; corrected results replace two inaccurate packet numbers.

#### F-011 — H29's key, front speed, and UI labels contradict its behavior

**Classification:** VERIFIED · LIVE · High · effort M. **Locations:** `src/frontend/features/superluminal-modeling/smbhPropagation.ts:548-570`, `src/frontend/features/superluminal-modeling/agnShockwaveEngine.ts:179-192,342-352`, `index.html:56-101`.

```ts
if (channel.key === 'warpMetric' && solarResponder.triggerWarpWaveImpact) {
  solarResponder.triggerWarpWaveImpact(currentEnergyErg, SGR_A.massG);
}
```

The only H29 channel is `metric_slipstream`, while both impact and initial grid gates require `warpMetric`. An instrumented full event fired the channel but recorded zero warp impacts. With observer-frame checked by default, transverse apparent β is reused as radial front speed (`β_app≈1.965` for β=.9, θ=35°), so even channels described as exactly light-speed can approach ~2c; H29's model computes 2.112c and arrives 12,632 y before light for Sgr A*. The UI presents H29 beside “standard” without the speculative/educational tags used on other presets, and preset and propagation model can be selected independently.

**Impact:** the named feature's defining visual never appears, while causal and speculative semantics are presented as peer physics. **Fix:** use one discriminated channel key, couple compatible preset/model choices, keep standard GW/EM fronts at c, reserve apparent motion for observed transverse jets, and mark H29 explicitly fictional/educational in UI and response metadata. **Acceptance:** an H29 browser test observes one warp impact; standard channels never have radial speed >c. **Adversarial check:** the browser's lack of violet pixels alone was inconclusive under SwiftShader, so the event was executed with instrumented callbacks; the key mismatch directly proves the defect.

#### F-012 — Float32 epochs and 3-s.f. periods violate catalog fidelity

**Classification:** VERIFIED · LIVE/DATA · High · effort M. **Locations:** `src/data/asteroidCatalogLoader.ts:57,185,222,305`, `src/frontend/features/asteroids/beltRenderer.ts:58-70,124-128,325-339,445-447`, `scripts/fetch_jpl_sbdb.py:39,131-149`, `scripts/build_asteroid_phase1_dataset.py:203-228`.

```ts
view.setFloat32(baseOffset + 4, epoch, true);
```

The actual 100,000-record round-trip is `ok=false`: 99,916 mismatches, max epoch error `0.1249998966 d`, 3,600,012 bytes. Float32 ULP at JD 2,461,000 is 0.25 d; the GPU subtracts two raw-JD floats, so at 4 d/s and 60 fps the belt changes every 3.75 frames (and only every ~6 wall-hours at real time). Source fetch uses `full-prec:false`; only 131 periods exist. Vesta is stored at 1,330 d versus Kepler 1,325.8978 d (+0.3094%), drifting 1.110° per stored orbit.

**Impact:** the loader fails its own tolerance and time evolution is quantized/lossy before the shader transform defect is even fixed. **Fix:** encode integer epoch day plus fractional offset or use a relative/split high-low representation; request full precision or derive period from `a`; make the 100k validation a real Vitest. **Acceptance:** zero records fail declared tolerances and a real-time asteroid advances smoothly. **Adversarial check:** both branches' actual exported function and shipped binary were executed; highp GLSL is still IEEE float32 and supplies no hidden precision.

#### F-013 — Unbounded seeks outlive disconnect and grow checkpoints

**Classification:** VERIFIED · BACKEND · High · effort M. **Locations:** `backend/server.py:758-760,820-837,938-946`, `backend/sim/rebound_nbody.py:21,36-38,176-225,242-272`.

```python
jd = self._coerce_finite_float(cmd.get("jd"))
if jd is None:
    self._push_error("`set_julian_date` requires numeric `jd`", action=action)
    return
```

Any finite JD is accepted; REBOUND integration is not interruptible. A real long WHFast seek caused `stop()` to return after exactly 3 s with the worker alive. Ten-year full-Simulation checkpoints are never pruned (4/11/21 copies after 35/105/205 years). A 10 Myr request extrapolates to hours of CPU and substantial retained state.

**Impact:** a disconnected client can leave CPU-pinned work and memory growing without bound. **Fix:** enforce configurable JD horizons/work budgets, integrate in cancellable chunks, check a stop event, cap/LRU checkpoints, and do not report stopped while a thread lives. **Acceptance:** a maximum-horizon request is rejected and disconnect terminates the thread within one frame with bounded checkpoint count. **Adversarial check:** a shorter real seek and actual thread liveness were observed; the claim does not rely solely on extrapolation.

#### F-014 — One command error permanently bricks a session

**Classification:** VERIFIED · BACKEND · High · effort S. **Locations:** `backend/server.py:832-849,932-944,979-999`, `backend/sim/rebound_nbody.py:296-302`.

```python
except Exception as exc:
    self._runtime_error = f"Command handling failed: {exc}"
    self.paused = True
    self._push_error(self._runtime_error, code="runtime_error")
```

`get_orbital_elements` for the Sun asks for a primary relative to itself and raises. The runner latches `_runtime_error`; `resume` clears only `paused`. The WS then reports `paused:false` while JD remains frozen and the error persists. No command clears it.

**Impact:** one otherwise bounded command permanently disables stepping with contradictory telemetry. **Fix:** return command-scoped errors without poisoning the simulation; reserve fatal state for engine corruption and add explicit reset/reinitialize semantics. **Acceptance:** the Sun query returns an error and the next state update advances after resume. **Adversarial check:** the complete command sequence was run on WHFast; queue and telemetry behavior were observed, not inferred.

#### F-015 — Engine velocity units/frame disagree across one WS contract

**Classification:** VERIFIED · BACKEND · High · effort M. **Locations:** `backend/sim/rebound_nbody.py:65-67,105-150`, `backend/sim/tudatpy_hooks.py:271-305`, `backend/sim/base.py:21-31`, `backend/sim/contracts.py:25-55`, `backend/server.py:958-974`.

```python
self.sim.units = ("yr", "AU", "Msun")
```

REBOUND emits barycentric AU/year after `move_to_com`; Tudat emits AU/day. Main's common `state_update` has neither velocity units nor frame, and Kuiper activation assumes AU/year. `sun-focus` labels/converts REBOUND to AU/day but injects the converted value unchanged into the year-unit Kuiper sub-sim—a 365.25× slowdown regression—and Tudat remains incomplete.

**Impact:** changing engines or enabling Kuiper changes physical meaning while preserving identical field names. **Fix:** make frame/units required enums in one shared schema, normalize at each adapter boundary, and make Kuiper consume that normalized contract. **Acceptance:** a one-day Earth displacement and injected velocity agree between engines within tolerance. **Adversarial check:** raw engine units, COM call, adapters, contracts, and Kuiper consumer were all traced; the branch's apparent fix was tested for downstream units rather than credited by diff alone.

#### F-016 — MGA truncates routes and accepts powered flybys as unpowered

**Classification:** VERIFIED · BACKEND · High · effort M. **Locations:** `backend/trajectory/mga.py:21-49,104-130,184-280`.

```python
v_inf_mag_au_day = 0.5 * (vector_length(v_inf_in) + vector_length(v_inf_out))
```

For Earth→Mars, `max_assists=3`, the generator formed 41 distinct body routes but the completion budget was consumed by TOF realizations: only four routes were reached, Venus was skipped, and no two-/three-assist route was evaluated. Flyby feasibility averages incoming/outgoing v∞ magnitude rather than enforcing equality or charging a powered mismatch; feasible-labelled Venus examples differed by as much as 13.142 km/s with no Δv penalty.

**Impact:** the optimizer can miss obvious candidates and rank physically impossible unpowered assists as cheap. **Fix:** budget/evaluate routes explicitly with fair ordering, enforce `|v∞in|-|v∞out|` tolerance or add powered-flyby Δv, and expose search coverage/truncation. **Acceptance:** a test confirms all generated routes are either evaluated or reported pruned, and every unpowered flyby conserves v∞ magnitude. **Adversarial check:** the cap's wording was corrected from “beam partials” to completed TOF realizations after instrumentation; the observed four-of-41 outcome and energy mismatch remain.

#### F-017 — Accuracy benchmark supplies no supported validation evidence

**Classification:** VERIFIED · BACKEND · High · effort M. **Locations:** `backend/benchmark/accuracy.py:25-273`, `backend/benchmark/reference_scenarios.json:1-152`, `backend/benchmark/artifacts/*.csv:1-2`.

```python
"passRate": (pass_count / len(ok_rows)) if ok_rows else 0.0,
```

Main reports 0/3 passing; errors are about 0.85, 32.9, and 34.7 km/s. Nine one-row CSVs share a capture timestamp and contain no state vectors or commands sufficient to reproduce GMAT/Orekit/Tudat results. This does not prove fabrication, but it cannot establish comparability. `sun-focus` improves honesty by marking all three `incomparable_reference`, yielding comparable=0, solved=0, pass=0, validationCoverage=0.

**Impact:** “strict accuracy” results cannot validate or calibrate the current solver. **Fix:** define identical state/frame/epoch/objective inputs, preserve tool versions/scripts/state vectors, regenerate independent artifacts, and report coverage separately from pass rate. **Acceptance:** at least one independently reproducible scenario is comparable and reruns from checked-in instructions. **Adversarial check:** hashes/integrity logic works and was credited; the conclusion is deliberately “unsupported/non-comparable,” not an accusation about artifact origin.

#### F-018 — Cargo, propellant, risk, and EPO contracts disagree

**Classification:** VERIFIED · BACKEND · High · effort M. **Locations:** `backend/mission/agents.py:318-400`, `backend/mission/mining_service.py:63-90`, `backend/mission/risk_service.py:55-87`, `backend/epo/verifier.py:25-40`.

```python
logistics = self._logistics_agent.evaluate(
    vehicle=vehicle,
    payload_mass_kg=mission_inputs["payload_mass_kg"],
    outbound_delta_v_km_s=float(outbound["totalDeltaVKmS"]),
    return_delta_v_km_s=float(return_route["totalDeltaVKmS"]),
    reserve_fraction=mission_inputs["reserve_fraction"],
    decision_log=candidate_log,
)
```

The return burn still uses input payload rather than the default mined refined product (~31,881.6 kg); closure subtracts return propellant from cargo, then the objective subtracts total propellant again. Risk counts only stochastic payload/margin and reports 0/240 failures even for a route missing 35.716 km/s versus 3.716 delivered; its 120 kg/(km/s) penalty has no cited basis. EPO reads `result.verification`, but success returns it under `candidate.verification`: main smoke is 0/30 with missing recommendation/score/probability. Default mission POST returns 422.

**Impact:** mission score, mass closure, and risk probability do not describe the same physical candidate, and the completed-status EPO claim is false. **Fix:** introduce a unit-tested mass ledger through each burn, include cargo in return initial mass, count propellant once, condition risk on deterministic feasibility, and align one EPO result schema. **Acceptance:** mass conservation balances to <1 g in a fixture, infeasible logistics imply failure, and EPO passes its known fixtures. **Adversarial check:** the full candidate path and defaults were executed; seeded Monte Carlo and the verifier's deterministic nature were credited separately.

#### F-019 — Frame overrun, repeated payload, and early-send path leak resources

**Classification:** VERIFIED · BACKEND · High · effort M. **Locations:** `backend/server.py:817-911,1033-1062,1143-1188`, `backend/sim/kuiper.py:169-180`.

```python
runner = SimulationRunner(engine, target_fps=target_fps)
runner.start()
```

At requested 365 d/s, 3,000-particle Kuiper frames overrun and delivered only 12.165 simulated d/wall-s because sim dt is based on target frame, not elapsed wall time. While paused, `_frame_counter` stops on a multiple of five, so every 10 Hz state includes ~100.9 kB again. If the client drops after `runner.start()` but before the `connected` send, execution has not entered the cleanup `try/finally`; a deterministic send failure left the runner alive. `sun-focus` sends a larger binary Kuiper payload.

**Impact:** speed controls lie under load, idle sockets waste bandwidth, and a connect race leaks threads. **Fix:** start inside `try/finally`, couple integration to measured elapsed time with bounded substeps, cache/send Kuiper only on change or subscription cadence, and stop on send failure. **Acceptance:** fault-injected initial send leaves zero runner threads; paused bytes/s is near zero; delivered rate stays within a declared tolerance. **Adversarial check:** all three conditions were reproduced separately; bounded queues and normal thread/async handoff remain strengths.

#### F-020 — Public endpoints admit unbounded CPU and upstream amplification

**Classification:** VERIFIED · BACKEND · High · effort M. **Locations:** `backend/server.py:408-510,640-664`, `backend/trajectory/lambert.py:261-315`, `backend/sim/solar_realtime_data.py:107-122,387-441`.

```python
@app.post("/trajectory/porkchop")
def trajectory_porkchop(payload: TrajectoryPorkchopRequest):
    if payload.from_id == payload.to_id:
        raise HTTPException(status_code=400, detail="`from_id` and `to_id` must differ")
```

There is no authentication/rate limit/work quota. Minimum grid steps over a 100-year window imply ~9.42 million Lambert evaluations; the measured 7,865 evaluations/s projects to ~20 minutes CPU for one request. Public `force_refresh=true` bypasses warm solar data, lacks single-flight and size limits, and five concurrent callers caused five upstream fetches. CORS/public bind compound exposure.

**Impact:** any reachable client can monopolize CPU or amplify traffic to scientific data providers. **Fix:** loopback-only default, strict date/grid bounds, cost preflight and timeout/cancellation, per-client rate limits, upstream single-flight/cache, and maximum response bytes. **Acceptance:** worst accepted request completes within a set budget; over-budget and concurrent refresh tests reject/coalesce deterministically. **Adversarial check:** a tiny valid grid and validation errors were tested and work; only the unbounded high end remains in scope, and no live third-party stress was performed.

#### F-021 — Documented maintenance and test scripts do not run safely

**Classification:** VERIFIED · SCRIPT · High · effort M. **Locations:** `package.json:6-23`, `scripts/ingest-moon-textures.mjs:5`, `scripts/fetch_jpl_sbdb.py:34-36,488-492`, root browser probes.

```js
import { CURATED_MOON_TEXTURE_CATALOG } from '../src/frontend/features/planetary/moonTextureCatalog.js';
```

Only `.ts` exists, so `npm run ingest:moon-textures` exits with `ERR_MODULE_NOT_FOUND` on both branches. A safe mocked SBDB fixture proved `fetch_jpl_sbdb.py` writes `backend/data/bodies.py` and then raises `FileNotFoundError` for deleted `src/data/planets.js`: a half-applied update. Root browser scripts require undeclared `puppeteer`, use ports 5173/5174/5175, and one writes to a personal `~/.gemini/antigravity/...` path. The documented offline `npx tsx scripts/asteroid/catalog_fetcher.ts` fails `ENOTCACHED`; the 1,058-line file is outside tsconfig and `tsx/@types/node` are undeclared.

**Impact:** routine regeneration can fail after mutating authoritative data, while advertised tests are non-reproducible. **Fix:** preflight every target/dependency, write to temporaries and atomically replace only after all outputs validate, make TS scripts executable through declared tooling, and turn browser probes into one declared smoke suite. **Acceptance:** each package script runs offline after `npm ci`; an injected second-output failure leaves both tracked targets byte-identical. **Adversarial check:** the destructive script was isolated with fixtures/monkeypatches; no tracked file was changed.

### Medium

#### F-022 — Worker import claims `window.onmessage`; transport loses precision and lacks a watchdog

**Classification:** VERIFIED · LIVE · Medium · effort M. **Locations:** `src/main.ts:42-50,691-833`, `src/workers/modelWorker.ts:78-142`, `src/sim/solarSystemModel.ts:17-32`.

```ts
import { buildCatalogIndexContract } from './workers/modelWorker';
```

A value import executes the worker entry in the Window realm; both built main and worker chunks contain one `self.onmessage`, and the live page's `window.onmessage` is the worker handler. A normal page remained stable after a crafted message, so the packet's implied startup failure is overstated; an embedding page can nevertheless invoke worker parsing in the wrong realm. Every tick transfers 12,152 bytes of Float32 state, then overwrites the model's Float64 vectors. At Pluto's 35.6 AU, position ULP is `3.8147e-6 AU = 570.67 km` (48% of radius). The worker still propagates 424 hidden moons; no sequence/JD freshness check or timeout notices a silent stall, despite a local 434-body update costing only ~0.10 ms.

**Impact:** global-message ownership is unsafe, realistic outer-body placement loses visible precision, and complexity/wasted work likely exceeds the isolated CPU saving. **Fix:** move protocol/index helpers to a side-effect-free module; make the worker entry import them, use relative/split Float64 state or leave propagation local, skip hidden moons, and reject stale sequence/JD with a watchdog. **Acceptance:** no `self.onmessage` appears in the main chunk; a Pluto round-trip is <10 km; a killed worker automatically falls back.

#### F-023 — “Realistic scale” retains display-sized overlays and poor focus framing

**Classification:** VERIFIED · LIVE · Medium · effort M. **Locations:** `src/main.ts:244-249,496-506,569-580,865-880`, `src/sunController.ts:238-260`.

```ts
sprite.scale.set(0.12, 0.03, 1);
const preferredDistance = Math.max(radius * 20, 0.01);
```

Earth's real radius is `4.26e-5 AU`, yet the 0.01 AU focus floor yields only ~9.09 px diameter at 1080 px/58°; Pluto is framed at the same 1,495,979 km. A label is 0.12 AU wide—about 1,409 Earth diameters—and does not rescale. Main's magnetic group is constructed from display Sun radius and not rebuilt, while default Sun display radius is 80.67× physical. Realistic mode clamps far ≤120 AU, clipping the 15,000 AU star sphere. On DPR>1, `resizeRenderer` compares physical canvas pixels with CSS pixels, calls `setPixelRatio` and `setSize` every animation frame.

**Impact:** the mode name implies a coherent physical scale while camera, labels, magnetic structures, background, and resize behavior remain display-scale or wasteful. **Fix:** define scale policy per layer, make labels screen-space, frame from angular size with sensible minimum pixels, rebuild all Sun groups, and compare renderer drawing-buffer/CSS sizes correctly only on resize. **Acceptance:** Earth/Pluto fill a target pixel range, overlays remain legible but not physical geometry, stars are not clipped, and DPR2 triggers no steady-state resize.

#### F-024 — Metric displacement is frame-rate dependent and dormant grids draw

**Classification:** VERIFIED · LIVE · Medium · effort M. **Locations:** `src/sim/solarSystemModel.ts:165-193`, `src/workers/modelWorker.ts:177-210`, `src/frontend/features/solar/gravitationalWaves.ts:99-167`, `src/frontend/features/superluminal-modeling/warpSlipstreamVisuals.ts:71-126`.

```ts
const shiftDispAu = shiftVelocityAuS * dtSec * visualExaggeration;
state.worldPosition.addScaledVector(direction, shiftDispAu);
```

Each tick first resets Kepler state, then adds `v·frameDt`, so the “displacement” is non-integrating and differs at 30/60 fps; source distance uses the questionable `sourceDistance + projection` sign. Across 40 AU, the sampled H29 β varied only `2.25e-13` relatively because σ grows to ~409 pc, producing essentially rigid translation. Even at `1e12` exaggeration the effect is only metres per frame, so the packet's large visual-impact implication is refuted. Separately, 384² and 128² GW/warp grids start visible, `frustumCulled=false`, totaling 164,866 vertices/327,680 triangles while shaders discard disabled fragments; rotation places them in XZ although orbital convention is XY/Z-up.

**Impact:** a speculative effect has ill-defined frame semantics, while disabled visuals consume render work and use the wrong plane. **Fix:** define a position or integrated velocity perturbation in simulation time, transform with the same frame as orbits, and set meshes invisible until enabled. **Acceptance:** 30/60/120 fps produce the same state and idle grid draw calls are zero.

#### F-025 — Solar formula/profile/lifetime/scale choices drift from labels

**Classification:** VERIFIED · LIVE/BACKEND · Medium · effort L. **Locations:** `src/frontend/features/solar/sunVisuals.ts:108-115,306-318,750-764`, `src/frontend/features/solar/solarFlares.ts:175-273`, `backend/sim/solar_physics.py:69-90`.

```glsl
// Snodgrass (1983)
float degPerDay = 14.44 - 2.87*sin2 - 0.36*sin4;
```

The frontend and backend use different differential-rotation profiles, and neither matches the cited Snodgrass coefficients stated by the prompt (`14.38,-1.95,-2.17`). The Hathaway curve's implemented maximum is 58.39 months rather than the assumed 66.14, with clipping creating a plateau. The corona is 4× a display Sun radius (~1.50 AU), and the Parker geometry can reach ~242 display AU. Flare analysis corrected the packet: with default exaggerated radius the lifetime expression is negative, so a flare expires on its first positive-time update; in realistic mode a denominator floor gives 2,953.45 s (~49.22 min), not 25–61 hours. Surface flare uniforms also do not decay with sprite lifecycle.

**Impact:** labels/citations and visible lifetimes/scales do not identify a consistent fidelity tier. **Fix:** select and cite one rotation/solar-cycle profile, add analytic unit tests for maxima/lifetimes, separate physical radii from visualization radii, and bind surface/sprite flare lifecycle. **Acceptance:** coefficients and extrema match a cited fixture; default/realistic flare visibility is testable and intentional; metadata names visualization approximations plainly.

#### F-026 — Synthetic taxonomy, heuristic perturbation, and cache gates distort asteroid data

**Classification:** VERIFIED · DATA/LIVE · Medium · effort M. **Locations:** `scripts/build_asteroid_phase1_dataset.py:54-75,126-132`, `src/sim/phase1AsteroidCatalog.ts:486-555`, `src/frontend/features/asteroids/beltRenderer.ts:22-23,97-103,154-164`.

```ts
orbitPosition += perturb * (age * age) * uPerturbationScale;
```

Shipped classes are C 66,362 / S 14,009 / M 19,629; among 19,518 bodies at 2.5–2.7 AU, 19,312 (98.9446%) are M because fallback taxonomy is an orbital-zone rule, not composition. Only three albedos decode (`.0650034/.1400015/.1600061`). The dead validator fails the shipped distribution. Three Python/TS mappings disagree on O and missing-a fallback. The advertised Jupiter/Saturn “perturbation” uses current planet position and `acc·|Δt|²·1e-10`; actual shipped maximum was 4.142 km versus a 35.667 km Float32 ULP, then F-003 scales it further. A correct 3.6 MB catalog that hashes slower than 2 s is rejected as invalid; metadata `force-cache` can pair stale metadata with newer binary (conditional, not guaranteed). `sun-focus` fixes metadata cache policy only.

**Impact:** colors/composition claims are synthetic, perturbations are invisible and nonphysical, and device/network speed can silently select procedural fallback. **Fix:** name inferred taxonomy explicitly or enrich from sourced spectroscopy/albedo, centralize mappings and run the coverage validator, remove/replace the perturbation, treat latency as telemetry, and version/hash metadata+binary atomically. **Acceptance:** distributions pass declared evidence-based checks; slow correct loads remain accepted; perturbation exceeds numerical resolution or is absent.

#### F-027 — Main omits secular motion and presents synthetic moon radii as measured

**Classification:** VERIFIED · DATA/LIVE · Medium · effort M. **Locations:** `src/sim/orbitMath.ts:54-63`, `src/sim/catalog.ts:232-264`, `src/data/moons.json`, `scripts/update-moons-data.mjs`.

```ts
const meanMotion = TWO_PI / period;
const meanAnomaly = normalizeRadians(meanAnomaly0 + meanMotion * elapsedDays);
```

Main holds `i/Ω/ω` constant and ignores supplied node/apsis precession. At JD 2461276.5 its geocentric Moon latitude is +2.130716° versus JPL Horizons −3.828997°: 5.959714° latitude and 6.379634° full-direction error. `sun-focus` secular rates improve latitude to −3.647142° (0.181855° residual) but do not repair F-007. `moons.json` contains duplicate Puck/IAU 715 (IDs 378/388). Only 47 moon radii come from the major-radius table; 377/424 are stable-hash synthetic values, displayed as `Radius: X km` without provenance.

**Impact:** date-dependent moon states and presented physical sizes look authoritative but are approximated or invented. **Fix:** port tested secular terms, deduplicate by source/IAU ID, encode radius as nullable with source/uncertainty, and label synthetic display radius separately. **Acceptance:** lunar oracle residual stays within a declared range over multiple epochs, source IDs are unique, and unknown radii never appear as measured kilometres.

#### F-028 — Kuiper work runs while paused/hidden and scientific class labels overclaim

**Classification:** VERIFIED · LIVE/BACKEND · Medium · effort M. **Locations:** `src/main.ts:1061-1063`, `src/sim/kuiperBelt.ts:67-145`, `backend/sim/kuiper.py:60-180`.

```ts
propagateKBOPositions(kuiperPop.kbos, simState.julianDate, kuiperPositions);
kuiperBeltRenderer.updatePositions(kuiperPositions);
```

The 5,000-body CPU update (~1.126 ms) and 320,000-byte instance-matrix upload occur every frame regardless of pause or visibility. Frontend generation is seeded and has explicit four-bin semimajor-axis classes, but “resonant/Plutino” is merely an `a` bucket with no resonant angle. Backend sampling is unseeded, excludes Uranus, and is untested; its much costlier sub-simulation drives F-019.

**Impact:** hidden/paused work burns frame budget and labels imply dynamics not modeled. **Fix:** dirty-update only when JD changes and visible; make seeds/config explicit; rename semimajor-axis bins or actually initialize/test resonant arguments; include/document perturber scope. **Acceptance:** paused/hidden matrix uploads are zero and fixed seed reproduces positions/classes.

#### F-029 — Dead stack is internally broken and unsafe to rewire wholesale

**Classification:** VERIFIED · UNREACHABLE · Medium (capped) · effort L. **Locations:** 32 files in §9; representative `src/frontend/features/trajectory/localPlanner.ts:15-47,85-112`, `src/frontend/features/planetary/satelliteSystem.ts:201-233,887-930`, `src/frontend/app/uiBindings.ts:34-52`, `src/frontend/app/simulationClient.ts:62-115`.

```ts
const averageVelocity = toState.position.clone().sub(fromState.position).divideScalar(tofDays);
```

Nothing outside this stack imports it on either branch. Extracted probes show Earth→Mars local v∞ 29.4476 versus analytic 2.6489 km/s (11.1169×), turning an analytic 60°-assist-feasible case into infeasible; the TLE loop retains 0/1 and 2/4 two-line sets; default satellite worker lead spans 1.8 simulated days (~27.9 ISS revolutions) and linearly interpolates endpoints. Only 14/50 injected DOM handles remain; 36 are absent and several are dereferenced unsafely. The temporary nearby renderer's tail is byte-identical to the 508-line original, duplicating 44 errors. Sixteen constants are absent. The WS client has reconnect races, drops `error/orbital_elements`, and never synchronizes JD. `sun-focus` fixes some types/reconnect details but does not wire the stack.

**Impact:** simply importing the “feature modules” would crash or produce wrong routes/satellites. **Fix:** follow §9 dispositions; delete duplicates/superseded glue, preserve isolated math and contracts, and restore any chosen feature behind new DOM/schema/oracle tests rather than reviving the old graph. **Acceptance:** reachability changes only through a reviewed composition root and each restored module has a green contract/browser test.

#### F-030 — Rewrite replaced decomposition without recording the decision

**Classification:** VERIFIED · LIVE/DOC · Medium · effort L. **Locations:** `src/main.ts:1-1083`, commits `04e99a4`,`d1484e8`, `Development_History_Context.md`, `Development_Improvements.md`.

```text
04e99a4: src/main.js +400 / -4190 (4,404 -> 614 LOC)
d1484e8: index.html +8 / -126 (Sun Model Lab transition)
```

Nine seconds apart on 2026-02-23, the old application was replaced by a smaller Sun app rather than decomposed into the extracted modules. Neither mandated rolling log records the architecture decision; subsequent plans and typing work target dead code. Current `main.ts` has regrown to 1,083 lines and owns DOM, scene assembly, animation, worker protocol, belts, and AGN. On sun-focus, +1,824/−632 LOC were invested in modules that remain production-dead (after excluding deletion/new live shader work).

**Impact:** maintainers cannot tell product direction from logs or module names, and effort is repeatedly spent on code that cannot execute. **Fix:** record an ADR selecting the Sun app/composition root, archive/delete rejected architecture, split `main.ts` along current live data flows, and have reachability/unused checks gate future work. **Acceptance:** one documented composition root, no unexplained production-dead feature stack, and live modules own explicit state/contracts.

#### F-031 — Orphan binaries and absent governance make the repo hard to transfer

**Classification:** VERIFIED · DATA/DOC · Medium · effort M. **Locations:** `src/assets/textures`, `.vscode/extensions.json`, `Development_Improvements.md:30-35`, `my-notes/`.

```text
src/assets: 25 files, 40,557,506 bytes
git pack: 46.63 MiB; no .gitattributes/LFS policy
```

No reachable code imports an actual `src/assets/textures` path and Vite emits none of those basenames; nine built images are copied from `public`. Asteroid binary history retains three large blobs totaling 12,800,036 uncompressed bytes. There is no LICENSE (so reuse is not licensed), CONTRIBUTING, CI, Dockerfile, editor/runtime version files, pyproject/pytest config, or pre-commit policy. `my-notes` has 62 files and three byte-identical groups; three SMBH “MASTER” files have no canonical choice. `Development_Improvements.md` violates its own 48 KB/500-line cap at 48,551 B/998 lines without a prune note. `.vscode` recommends only an agent-quota meter.

**Impact:** clones are heavy, asset provenance/licensing is unclear, and a second engineer lacks supported environment/process boundaries. **Fix:** delete/archive or intentionally load and attribute textures, adopt LFS/release artifacts for regenerable binaries, choose/archive canonical research notes, add a license and minimal contributor/CI/tool-version files, and enforce log caps. **Acceptance:** asset manifest maps every shipped asset to live use/source/license; no duplicate MASTERs; clean CI is green under declared versions.

### Supplied K-01–K-53 disposition after adversarial review

| Packet item | Disposition on main / branch evidence |
|---|---|
| K-01 | **Confirmed → F-002.** Persists on sun-focus; its real-engine test exposes it. |
| K-02 | **Confirmed → F-006.** 15/42 claims rows true. |
| K-03 | **Confirmed → F-001.** Exactly 1,300 errors; removal of directives added no types. |
| K-04 | **Confirmed mechanism, downgraded → F-022.** Main chunk claims `window.onmessage`; crafted browser post did not crash the normal page, so no High startup-impact claim. |
| K-05 | **Confirmed → F-007.** Normal sign disagrees with `r×v`; current visual impact muted because moons are hidden. |
| K-06 | **Confirmed → F-007.** Io remains 178.508° wrong on both; sun-focus's partial rotation does not close Titan/Cordelia. |
| K-07 | **Confirmed → F-007.** Independent Charon vector closes the fallback-pole issue. |
| K-08 | **Confirmed → F-008.** Full transforms show shader world-Y versus spin axis near world-Z. |
| K-09 | **Confirmed → F-008.** Pause screenshots and clock tracing demonstrate motion. |
| K-10 | **Confirmed → F-009.** Current 4096² image radius 1,582 px; 512 tile covers ~16.18% of diameter. |
| K-11 | **Confirmed with drift → F-009.** 495,672–495,837 B, ~551 kB/s, not exactly 509 KB. |
| K-12 | **Confirmed with qualification → F-009/F-020.** Five concurrent calls yielded five fetches; 50 s is worst timeout bound, not observed steady-state. |
| K-13 | **Confirmed → F-011.** Actual key fires, warp callback does not. |
| K-14 | **Confirmed, packet arithmetic corrected → F-010.** Code gyroradius is 0.001487 AU, correct 216.164 pc. |
| K-15 | **Confirmed → F-012.** 0.25-day JD ULP; 3.75 frames at default speed. |
| K-16 | **Confirmed → F-012.** 99,916/100,000 mismatches on both branches. |
| K-17 | **Confirmed → F-012.** 131 distinct periods; Vesta +0.3094% against decoded-a Kepler period. |
| K-18 | **Confirmed, severity-capped → F-029.** 11.1169× local v∞ error. |
| K-19 | **Confirmed, capped → F-029.** TLE 1→0, 4→2. |
| K-20 | **Confirmed, capped → F-029.** 1.8-day/~27.9-orbit worker interpolation. |
| K-21 | **Confirmed, capped → F-029.** 14/50 handles exist; unsafe accesses remain on sun-focus. |
| K-22 | **Confirmed, capped → F-029.** Duplicate tail hash/cmp match; absent constants traced to deleted `main.js`. |
| K-23 | **Confirmed, capped → F-029.** Sun-focus improves reconnect but still drops orbital frames/no seek. |
| K-24 | **Confirmed → F-013.** Real thread/checkpoint probes. |
| K-25 | **Confirmed → F-014.** Full WS sequence reproduced. |
| K-26 | **Confirmed, narrowed → F-005.** Existing `.md` under `my-notes`, not arbitrary host path; traversal is rejected. |
| K-27 | **Confirmed main; fixed sun-focus → F-004.** Branch rejects all three residual cases. |
| K-28 | **Confirmed, wording corrected → F-016.** Budget counts completed TOF realizations, not distinct routes. |
| K-29 | **Confirmed → F-016.** Up to 13.142 km/s mismatch uncharged. |
| K-30 | **Confirmed without fabrication inference → F-017.** Sun-focus fences all rows and has zero coverage. |
| K-31 | **Confirmed → F-018.** Cargo absent from return burn; propellant affects closure and score. |
| K-32 | **Confirmed, dependency drift → F-001.** Missing package is now `httpx2`, not `httpx`. |
| K-33 | **Confirmed safely → F-021.** Mock fixture proved half-mutation order. |
| K-34 | **Confirmed with attribution qualification → F-031.** Assets are 82.95% of pack-byte magnitude, not proof of exact pack attribution. |
| K-35 | **Confirmed → F-006.** Runtime/DOM/source checks, not README, establish false claims. |
| K-36 | **Confirmed → F-030.** Both architecture commits absent from both rolling logs. |
| K-37 | **Confirmed → F-030.** Replacement, not decomposition; current monolith regrowing. |
| K-38 | **Confirmed → F-001/F-021.** Main has no runner and scratch probes lack dependencies. |
| K-39 | **Confirmed, retained Medium → F-022.** 570.67 km ULP; common but muted at default display scale. |
| K-40 | **Confirmed mechanism, impact downgraded → F-024.** Frame dependence real; measured displacement only metres/frame even exaggerated. |
| K-41 | **Confirmed → F-011.** β_app 1.9646 and H29 2.1117c produce pre-light arrival. |
| K-42 | **Confirmed → F-024.** 164,866 idle vertices, wrong XZ plane. |
| K-43 | **Confirmed → F-023.** Label is ~1,409 Earth diameters; sun-focus fixes only magnetic rebuild. |
| K-44 | **Original mechanism refuted; corrected → F-025.** Default flare expires immediately; realistic lifetime ~49.22 min, not 25–61 h. |
| K-45 | **Confirmed but split → F-008/F-025.** Axis/time/scale and formula-label issues have different impacts. |
| K-46 | **Confirmed → F-026.** 98.9446% M in 2.5–2.7 AU; three albedos; validator fails. |
| K-47 | **Confirmed conditionally → F-026.** Stale pair can fail; `force-cache` does not guarantee it. Sun fixes meta cache only. |
| K-48 | **Conclusion confirmed, number corrected → F-026.** Actual shipped max 4.142 km, still <35.667 km ULP; F-003 further dominates. |
| K-49 | **Confirmed with date correction → F-027.** Current lunar latitude error 5.9597°, not prompt's ~8°; sun secular fix reduces it. |
| K-50 | **Confirmed → F-019.** Rate/payload/leak all reproduced. |
| K-51 | **Confirmed; sun regression found → F-015/F-020.** AU/day conversion feeds AU/year Kuiper 365.25× low. |
| K-52 | **Confirmed → F-018/F-020.** Sun changes provider order but risk/EPO/unbounded porkchop persist. |
| K-53 | **Confirmed → F-006/F-021/F-030/F-031.** Counts, contradictions, duplicates, missing governance re-measured. |

## 7. Claims vs reality

The denominator is the prompt Appendix B's 42 substantive README rows, excluding its prior-audit summary. For compound rows, any material false/dead component makes the row non-true. That conservative rule produces 15/42.

| # | README ref | Substantive claim | Verdict | Evidence on `main` |
|---:|---|---|---|---|
| 1 | :3 | Solar System Mission Lab / mission-design workbench | FALSE | `index.html` ships “Sun Model Lab”; planner and connection UI absent. |
| 2 | :7 | Sun, eight planets, Pluto, tilt and spin | TRUE-ON-HEAD | Ten nodes/select options; `main.ts:253-291,584-597`. |
| 3 | :7 | Per-planet visual profiles | DEAD-CODE-ONLY | `visualProfiles.ts` unreachable; live planets are flat materials. |
| 4 | :8 | 424 moons as a feature | DEAD-CODE-ONLY | Loaded/propagated, `showMoons=false`, no control. |
| 5 | :9 | Pause, reverse, time warp | TRUE-ON-HEAD | Controls alter JD; visual pause is incomplete (F-008). |
| 6 | :9 | Jump to date | FALSE | Only “Now”; no date input. |
| 7 | :10 | Catalog stars with proper motion | FALSE | `Math.random()` points; JSON unused. |
| 8 | :10 | Synthetic Milky Way band | DEAD-CODE-ONLY | `milkyWay.ts` unreachable; live object is a stub. |
| 9 | :11 | Navigable nearby-star manifests | DEAD-CODE-ONLY | API/data exist; render/navigation modules unreachable. |
| 10 | :12 | GPU-Kepler asteroid belt and Phase-1 catalog | TRUE-ON-HEAD | Live/loaded, but all rendered positions fail F-003. |
| 11 | :13 | CPU-refreshed Kuiper belt | TRUE-ON-HEAD | 5,000 objects updated every frame. |
| 12 | :13 | Oort placeholder | FALSE | No reachable Oort object/control. |
| 13 | :14 | Earth satellites, TLE, J2 | DEAD-CODE-ONLY | Entire stack unreachable and defective. |
| 14 | :15 | Real-time GIBS Earth clouds | DEAD-CODE-ONLY | Cloud pipeline unreachable. |
| 15 | :16 | Interplanetary planner in application | DEAD-CODE-ONLY | Frontend planner unreachable; backend endpoints exist separately. |
| 16 | :17 | Multi-agent mission planner API | TRUE-ON-HEAD | Backend exists; method is sequential and fails defaults. |
| 17 | :20-21 | Source is TS-native; no `@ts-nocheck` | TRUE-ON-HEAD | 62 `src` TS files; zero directives. |
| 18 | :21 | “Strict type checking is now active on every source file” | FALSE | Strict config exists, but `tsc` reports 1,300 errors. |
| 19 | :24 | Two workerized paths | FALSE | Model worker live; satellite worker dead. |
| 20 | :24-25,217-218 | Linked supporting docs | FALSE | Absolute `/home/nomad/Documents/...` links. |
| 21 | :25 | ACBF loader, SHA/FNV, parallel fetch | TRUE-ON-HEAD | All exist and hashes match; round-trip fidelity fails. |
| 22 | :44,:60 | Engine selector and Connect | FALSE | No such DOM IDs on either branch. |
| 23 | :48-50 | Working REBOUND IAS15 / Tudat fallback | FALSE | Default REBOUND fails; Tudat not installed; no UI caller. |
| 24 | :64-66 | WS `fps` and `stream_hz` | TRUE-ON-HEAD | Server validates/clamps both. |
| 25 | :72-79 | Listed API endpoints exist | TRUE-ON-HEAD | Listed routes exist; list omits the UI's `/solar/*` routes. |
| 26 | :82-135 | Project-tree paths exist | TRUE-ON-HEAD | 57/57 paths exist, but 16 entries are dead and key live files omitted. |
| 27 | :121 | Moons/asteroids/Kuiper/Oort toggles | FALSE | Only orbit/magnetic/label/real-scale display toggles. |
| 28 | :122 | Milky Way modes | DEAD-CODE-ONLY | UI and renderer unreachable. |
| 29 | :123-124 | Realism locators and gravity vectors | FALSE | No controls or live implementations. |
| 30 | :131 | Explorer search by name | FALSE | The Explorer is a ten-option `<select>` with no search. |
| 31 | :131 | Focus/follow with smooth navigation | FALSE | Focus/follow work, but all UI calls pass `hardSnap=true`; the compound claim is not true. |
| 32 | :135-143 | Textures/clouds/terrain/LOD/rings/oblateness | FALSE | Flat spheres; 38.68 MiB texture directory not emitted. |
| 33 | :147 | Live solar GLSL/flares/magnetics/observations/data | TRUE-ON-HEAD | Core stack reachable; prominences/wind excluded and fidelity defects apply. |
| 34 | :164-172 | Mission and benchmark APIs | TRUE-ON-HEAD | Routes execute; defaults/validation coverage fail. |
| 35 | :175 | 13 pytest modules | FALSE | Main has 12; sun-focus has 15, not its claimed 14. |
| 36 | :210-214 | J2000/JPL/frame-normalized moons/catalog stars | FALSE | Elements exist; normalization is wrong and star catalog unused. |
| 37 | :224 | Frontend Keplerian two-body propagation | TRUE-ON-HEAD | Live `orbitMath` is accurate for valid ellipses. |
| 38 | :226-228,:236 | Satellite J2, clouds, gravity, Oort in product | FALSE | Dead-code-only or absent. |
| 39 | :233-234 | Hard flyby constraints and frontend transfer arcs | FALSE | F-016 violates energy; frontend renderer dead. |
| 40 | :240-250 | Named source inventory | TRUE-ON-HEAD | Source names/URLs exist; several consumers/assets are dead or synthetic. |
| 41 | :254-268 | Vite/Three/TS stack and build commands | TRUE-ON-HEAD | Versions resolve and build passes. |
| 42 | :283-288 | `pip install -r`; `pytest` works | FALSE | Fresh collection needs undeclared `httpx2`. |

### Status-document claims

| Document/ref | Claim | Verdict | Evidence |
|---|---|---|---|
| `README.md:20-25` Current TypeScript Status sentence 1 | codebase converted to TypeScript | TRUE-ON-HEAD | 62 TS under `src`, no live JS. |
| same, sentence 2 | strict checking active on every file | FALSE | 1,300 errors; scripts excluded from tsconfig. |
| same, sentence 3 | two workerized paths | FALSE | one live, one dead. |
| same, sentence 4 | binary loader/checksum path | TRUE-ON-HEAD | ACBF/hash chain verified; precision self-test false. |
| same, links | migration/status docs available at linked paths | FALSE | links are machine-absolute. |
| `Development_History_Context.md:137-148` | main owns animation; only satellite propagation uses worker | FALSE | first clause true; model worker is live and satellite worker dead. |
| `typescript_migration_plan.md:5-14` | 82 total / 53 TS / 0 JS migration snapshot | FALSE | 53+0 does not total 82; now 62 TS under `src`, 92 source entries including JSON/CSS. |
| `typescript_migration_plan.md:71,85,91` | behavior validation done / parity status | FALSE | line 71 overstates; later lines admit validation/parity pending. |
| `ADVANCED_ASTROPHYSICS_INDEX.md:175` | `testWarp.js` is E2E visualization verification | FALSE | checks console only and cannot run without undeclared Puppeteer. |
| same `:202` | H29 visuals + metric kinematics implemented | FALSE | callback key prevents defining visual; kinematics are frame-dependent. |
| same `:286-309` | index/archive is a single source of truth | FALSE | no archive/canonical choice among three MASTER variants. |
| `Development_Improvements.md:149-179` | hardening order represents current risk | FALSE | leads with 311 errors in unreachable code while 438 live errors/default-engine defects remain. |
| same `:30-35,153` | log cap/process and critical/high closure enforced | FALSE | file is 48,551 B/998 lines; no prune note; open Critical/High findings remain. |

### 2026-02-21 audit closure

| Item | Status on main / evidence |
|---|---|
| A1 decomposition | **Regressed/mooted by replacement:** old monolith deleted; current 1,083-line `main.ts` regrowing and extracted stack dead. |
| A2 global state | **Partial:** `SimulationState` exists, but only 7/17 fields are meaningfully read and globals remain. |
| A3 duplicate utilities | **Untouched:** `solveKepler`×3, fast variant×2, `mulberry32`×6, `clamp`×5. |
| A4 tests | **Open main / partial sun:** no main runner; sun 8 narrow tests. |
| A5 CI/quality gates | **Untouched:** no CI/lint/format, typecheck red. |
| A6 backend connection/UI | **Mooted in live UI:** removed; dormant client remains defective. |
| A7 shared protocol | **Open main / partial sun:** branch adds fields but has Kuiper unit regression. |
| A8 modules/docs | **Partial:** some live extraction; product/docs graph diverges. |
| A9 temporary/duplicate code | **Open main / partial sun:** temp duplicate remains on main, deleted on sun. |
| B1 general relativity | **Open.** No live GR correction. |
| B2 secular planet/moon elements | **Open main / substantial partial sun.** |
| B3 orbital precession | **Open main / partial sun.** Lunar oracle improves, frame defects persist. |
| B4 satellite perturbations | **Dormant J2 only.** |
| B5 eclipses | **Open.** |
| B6 light-time correction | **Open** for solar-system rendering; SMBH travel time is separate. |
| B7 Kuiper dynamics | **Open:** static class bins; no resonance dynamics. |
| B8 fidelity framing | **Open:** phenomenological models still overstated. |
| B9 external force callbacks | **Code exists, unwired.** |
| B10 fixed RK4 | **Open/not the active engine strategy.** |
| C1 Lambert robustness | **Unchanged bisection/fallback on main; short-TOF fixed only on sun.** |
| C2 multi-revolution | **Open.** z cap has no multi-revolution branch. |
| C3 low thrust | **Open.** |
| D governance/deployment | **Untouched.** No CI/license/container/contributor contract. |

### `agent-notes` TODO closure

For `phase1_closure_and_hardening_todos.md`, all 26 numbered TODOs were checked:

| TODOs | Main | `sun-focus` | Evidence |
|---|---|---|---|
| 1.1, 1.2, 1.3 | CLOSED | CLOSED | ACBF supersedes proposed path; 100k source IDs are unique; deterministic prefix. |
| 2.1–2.6 | OPEN | OPEN | evidence-backed taxonomy/albedo/enrichment pipeline absent. |
| 3.1 | OPEN | OPEN | acceptance/schema cleanup outstanding. |
| 3.2 | PARTIAL | PARTIAL | checksum used; unused acceptance type/no unused gate remain. |
| 3.3–3.5 | OPEN | OPEN | validation/fallback hardening incomplete. |
| 4.1 | OPEN | CLOSED | main no runner; sun has 3 files/8 tests. |
| 4.2–4.5 | OPEN | OPEN | required asteroid/browser/perf coverage absent. |
| 5.1, 5.2 | OPEN | OPEN | cache/delivery tasks incomplete. |
| 5.3 | OPEN | CLOSED | sun changes metadata to `no-cache`. |
| 5.4 | CLOSED | CLOSED | SHA/FNV integrity is algorithm-aware and authoritative. |
| 5.5 | OPEN | OPEN | remaining release integrity work. |
| 6.1, 6.2 | OPEN | OPEN | operational/docs closure absent. |

Only 1/10 completion-checklist assertions passes (“no checksum integrity bug”); sun's general runner does not meet the requested asteroid coverage row.

For `asteroid_simulation_phase2_multistage_wbs.md`, all 29 primary tasks were checked:

| Status | Tasks | Evidence summary |
|---|---|---|
| CLOSED (4) | B1, B3, C5, D1 | packing; GPU/no primary CPU solve; checksum/version; class bins |
| PARTIAL (5) | B5, C1, C2, D5, F1 | interfaces; binary path; duplicated mapping; assumptions; validator exists but fails/is unwired |
| OPEN (20) | A1–A4; B2,B4; C3,C4; D2–D4; E1–E5; F2–F5 | acquisition/provenance, precision/cache/performance/validation tasks remain |

## 8. Subsystem assessments

### 8.1 Frontend runtime core — LIVE

Purpose/data flow: `index.html` starts `main.ts`; `sceneSetup`, `bodyManager`, `stateStore`, `timeController`, and `textureManager` provide small helpers, while `main.ts` remains the composition root and animation loop. `modelWorker` receives catalog/tick messages and returns packed state. Strengths are clean null-guarding for all 28 direct DOM IDs, a well-shaped worker message union, explicit time conversion helpers, bounded worker fallback, and no page errors over the runtime probe. There are no frontend tests on main, and the controller/main/worker boundary is among the type-error hotspots.

1. **Worker import:** the value import is only to reuse `buildCatalogIndexContract`; it executes the worker handler on Window. Production main contains one `self.onmessage`; live `window.onmessage` is that handler. A crafted post reaches it, although the normal page did not crash. Split the helper from the entry (F-022).
2. **Cost/benefit:** catalog 11.06 ms; median model update ~0.10–0.12 ms; worker transfer 12,152 B plus two 434-record unpack/state loops. Float32 loses 570.67 km at Pluto, and all 424 hidden moons are propagated. The worker is not net-positive on measured CPU/fidelity without additional load.
3. **Realistic scale:** Earth diameter is ~9.09 px at the 0.01 AU floor; labels remain `.12×.03 AU`; magnetic geometry remains based on the display Sun on main. See F-023.
4. **Pause semantics:** only JD advancement stops. Worker ticks, KBO/belt refresh, controls, Sun UV/granulation/spots/flares, solar blend/polling, GW/warp/AGN, and H29 frame-dt displacement continue. The latter is reset each tick rather than accumulated.
5. **Startup grids:** GW and warp meshes default `visible=true`; only later toggle calls change it. They remain submitted with `frustumCulled=false` and disabled fragments discarded (F-024).
6. **Resize:** called at startup and every frame. `setPixelRatio` is unconditional; at DPR2, drawing-buffer width is 2× CSS width, so `canvas.width!==clientWidth` stays true and `setSize` repeats.
7. **Depth/background:** default near/far ratio is `2e8` without logarithmic depth, inviting z precision loss at outer planets. In realistic close focus, far is capped at 120 AU, so the 15,000 AU star sphere is clipped.
8. **State/config:** of 17 `SimulationState` fields, meaningful live reads are JD, time scale, paused, focus, follow, realistic scale, and initial zoom sensitivity. `timeScaleDirty` is write-only; backend/view/route/nearby fields are inert. The slider changes `controls.zoomSpeed` but not `simState.zoomSensitivity`; parsed `uiWidth/uiHeight/renderScale` overrides are never applied (only `maxPixelRatio` is used).
9. **Worker liveness:** nothing detects a worker that stops replying. Sequence/tick JD is not compared with current JD; the last snapshot can be reapplied indefinitely.
10. **First paint:** Sun texture 316.7–341.9 ms in browser (clean-process TS probe ~235.8 ms); 15k asteroid generation 16–18 ms; 5k KBO generation 6–8 ms; catalog ~11 ms. Sun canvas generation dominates before GPU upload.
11. **Contract reality:** TypeScript reports 109 controller, 72 main, and multiple worker-boundary errors (including direction array/tuple mismatch). Runtime protocol is a locally typed message union plus untyped controller objects; it is not a shared validated browser/backend contract.

### 8.2 Orbital mechanics and body catalog — LIVE (moons hidden)

Purpose/data flow: `planets.ts`/`moons.json` become a 434-body catalog; `orbitMath` propagates ellipses and `SolarSystemModel` composes parent-relative states. The Kepler implementation and Standish reduction are strong. Main has no tests; sun-focus adds four catalog and two orbit tests, but frame tests replicate implementation helpers rather than use an independent oracle.

1. **Normal convention:** catalog returns `(-sinΩ sin i,+cosΩ sin i,cos i)`; propagator `r×v` yields the opposite x/y signs. Io normal error is 4.411° after conversion, with larger plane errors for Titan/Cordelia (F-007).
2. **Periapsis:** main never rotates `argPeriapsisDeg` when its plane/node basis changes. Epoch direction errors are Io 178.508°, Titan 96.034°, Cordelia 38.961°; sun's partial fix does not close them.
3. **Node origin:** JPL's node is based on the ICRF equator; code uses `eclipticNorth × sourcePole`. An independent vector calculation gives a 40.878° in-plane basis difference for Mars and 39.912° for Saturn.
4. **Fallback pole:** absent RA/Dec, every parent is +Z rotated only about X by tilt; spin-axis longitude is ignored. Ariel/Cordelia normals differ 160.377°; Charon versus Horizons has 42.694° normal error.
5. **Puck:** two rows share IAU/SPK 715; the updater lacks a source-ID dedupe gate.
6. **Secular motion:** main advances only M. Current Moon latitude differs from Horizons by 5.9597° (not the packet's date-dependent ~8°). Sun-focus rates reduce this to 0.1819° but frame defects remain.
7. **Branch tests:** sun's catalog frame test uses copies of the same sign/basis logic, so it is tautological; the independent Io/Titan/Cordelia/Charon probes still fail.
8. **Radii/provenance:** 377/424 are stable-hash display values, yet info UI prints them as kilometres without provenance; only 47 use a known major-radius table.
9. **Correct numerics:** maximum Kepler residual through `e=.9999999` is `5.53e-11`; analytic velocity relative error versus finite difference is `7.8e-10` (e=0), `1.3e-9` (.7), `1.25e-8` (.99). Standish uses ω=ϖ−Ω and M=L−ϖ; current planet angular errors versus an independent Standish evaluation are 0.000607° (Neptune) to 0.12034° (Saturn). JD/epoch helpers are correct for valid inputs.
10. **Degenerate input:** period 0 yields NaN; e=2 silently clamps to `.9999999`. No current catalog record triggers either, but external asteroid/backend inputs should be rejected rather than coerced.

### 8.3 Solar subsystem — LIVE frontend + backend

Purpose/data flow: `SolarPhysicsClient` polls `/solar/physics`; `sunController` blends state and owns `sunVisuals`, flares, magnetics, observation texture, GW and AGN callbacks. Backend supplies deterministic quasi-corona geometry plus optional SWPC/SILSO/Helioviewer data. Strengths include bounded client timeout, explicit metadata/fidelity fields, deterministic seeded backend geometry, texture disposal, and meaningful PFSS consumption on sun-focus. Main solar tests exercise API/model pieces but not rendered orientation or clock behavior.

1. **Pole:** frontend shader world-Y, visible spin near world-Z, backend physical pole z. Loops also sit under a rotating group after coordinates encode rotation. Sun-focus's additional spots/PFSS inherit the frame mismatch.
2. **Clocks:** mesh rotation follows JD; spots/UV/granulation/flares/GW/warp use wall time. At 120 d/s the surface mesh races through simulated rotation while texture rates remain fixed; all decorative layers continue paused (F-008).
3. **Helioviewer:** current source image is 4096² with solar radius 1,582.06 px; requested 512² tile is ~16.18% of disk diameter and an interior crop, then `sunVisuals` repeats/wraps it over the sphere.
4. **Payload consumption:** main high/180 is ~495.7 kB every 900 ms. Per feature, blending reads only `id`, `kind`, `brightness`, `expansion_speed_kms`, `peak_extent_solar_radii`, and `arc`, plus top-level activity/epoch; many physical fields never affect geometry.
5. **Cold/live data:** lock is released before fetch; five concurrent cold callers produced five snapshots. Providers are sequential; current cold run was 4.879 s, while the timeout-bound worst case is ~49 s. Warm cache ignores requested JD; SILSO can re-download ~2.9 MB each TTL.
6. **Flares:** packet's slot-blocking explanation is refuted. Default display radius makes lifetime negative/first-update expiry; realistic mode lasts 2,953 s (~49 min) because of the denominator floor. Surface uniform glow is not lifecycle-cleared and longitude conventions differ.
7. **Rotation/cycle:** frontend `(14.44,-2.87,-.36)`, backend `(14.713,-2.396,-1.787)`, and cited target differ. Hathaway maximum is 58.39 months, not assumed 66.14.
8. **Default geometry scale:** display Sun ~0.3755 AU; 4R corona ~1.50 AU; Parker path can reach ~242 AU.
9. **Honesty:** responses disclose `quasi_mhd_corona_v4`, source and fidelity metadata, which is good; names remain stronger than a sinusoidal/parametric model, and field strength/temperature/Alfvén fields largely do not drive visible geometry.
10. **Sun-focus:** PFSS is wired into `/solar/physics` and its 120 lines are consumed; scale change rebuilds magnetic/Parker geometry. Polling remains 900 ms and measured payload rises to ~612.6 kB; axis, clock, tile and flare defects persist.

### 8.4 SMBH / superluminal Cataclysmic Events — LIVE

Purpose/data flow: AGN controls select source/preset/model; `agnShockwaveEngine` schedules channels and Sun callbacks; `metricFrameDragPeak` feeds local and worker `SolarSystemModel` paths. The standard isolated kernels for light travel, Sedov–Taylor/inversion, Rankine–Hugoniot compression, Alfvén speed, apparent β/Doppler, Hillas, Eddington, and Blandford–McKee are mostly sound. There are no automated tests and 136 type errors across the two largest live files.

1. **H29 visual:** instrumented event fired `metric_slipstream`; gates require `warpMetric`; `warpImpacts=0`, so defining visual callback never occurs.
2. **CR diffusion:** extra-c rigidity makes the 1e56 Sgr A* CR tsunami arrive `3.2217e11 y`, contradicting 1e5–1e6 text.
3. **Gyroradius:** code 1 EeV/5 μG = `2.225e10 cm=.001487 AU`; correct `6.671e20 cm=216.164 pc`. Huge downstream deflection is visually hidden by clamps/normalization.
4. **Schwarzschild radii:** Sgr A* is 0.0101× and M87 0.00990× correct; derived near-source lengths/probabilities consume them.
5. **Observer frame:** transverse β_app (1.9646 for .9/35°) is used radially; H29 uses 2.1117c, contradicting “exactly c.”
6. **Labelling:** H29 is a peer “Propagation model” without explicit fictional tag; preset and model are independent. This violates the project's own strict-causality layer even without judging the hypothesis.
7. **Metric kinematics:** shift is `v·frameDt` after reset, not integrated; 30/60 fps differ. Across the solar system σ~409 pc makes it rigid; exaggerated shift remains only metres/frame. Source-distance sign is questionable.
8. **Grid plane:** both grids rotate into XZ; orbital plane convention is XY with z-up.
9. **Default argument:** calling `metricFrameDragPeak` without the third argument throws `ReferenceError: SGR_A is not defined`; live callers supply it. Worker fallback mass of 1 g is physically meaningless but not reached on valid live state.
10. **Good/side effects:** the standard formulas named above were numerically checked; feature code never writes Julian date. Side effects are rendered position/camera/Sun callbacks and derived timelines, not simulation-time corruption.

### 8.5 Asteroid / Kuiper data pipeline — LIVE + scripts + dead prototype

Purpose/data flow: Python fetch/build scripts emit ACBF `.meta/.bin`; TS validates/decodes it; deterministic sample feeds `asteroidBelt` and live GPU shader. KBOs use a seeded frontend generator/CPU update. A dead alternate asteroid pipeline and resolver remain. The ACBF writer/reader/spec layout, real source IDs, deterministic diameter prefix, and checksums are strong; the scoped live asteroid TS files have zero tsc errors.

1. **Round-trip:** 100k result `ok=false`, 99,916 mismatches, max epoch 0.1249999 d; Float32 encoding cannot meet `1e-4 d` tolerance.
2. **GPU time:** JD ULP is 0.25 d; positions step every 3.75 frames at 4 d/s/60 fps and ~6 wall-hours at real time. Use relative/split epoch as the dead shader already does.
3. **Perturbation:** actual maximum over shipped records is ~4.142 km, <0.117 ULP at 2.5 AU (nominal conservative radial bound 2.395 km/0.067 ULP). `acc·age²` toward current planet is not a physical integration; F-003 scales it further.
4. **Periods:** `full-prec:false` plus builder preference for `per`; 131 values. Vesta 1330 versus 1325.8978 d (+0.3094%, 1.110°/orbit).
5. **Taxonomy:** 19,312/19,518 in 2.5–2.7 AU are M (98.9446%); meta M count is a positional heuristic, not measured composition. Dead coverage validator fails inner/middle bins.
6. **Photometry/priority:** only three inferred albedos; `albedo` is not fetched, while H is fetched only to estimate diameter and is not packed. Dead fetcher's `selectionPriority` is mathematically unbounded for negative H; with ordinary H≥0 its nominal maximum is 1,460, including a mistakenly *added* 20 “eccentricityPenalty.”
7. **TODOs:** exact Phase-1 closure status is in §7: 1.1–1.3/5.4 closed both, 4.1/5.3 only sun, 3.2 partial, all others open.
8. **Acceptance/cache:** >2 s makes a valid file fail and main silently keeps procedural fallback. `force-cache` metadata can mismatch a newer binary but does not guarantee it; sun fixes metadata caching only.
9. **Mapping tables:** builder omits O/missing-a→C; dead fetcher includes O/missing-a→M; resolver includes O/missing-a→Unknown and is unimported. They are not identical.
10. **KBO runtime/model:** frontend update never skips paused/hidden. Frontend is seeded; backend is not, omits Uranus, calls an `a` bin “Plutino” without resonance, and lacks tests.
11. **Dead fetcher:** `eccentricityPenalty` is added at line 311. The script is outside tsconfig, has no runtime caller, and its documented offline command lacks dependencies.
12. **Preserve:** shipped `ACBF v1`, stride 36, count 100,000, bytes 3,600,012; FNV `f1f80244` and SHA `a0b832…8823d` match; all source IDs are unique; writer/reader/spec agree and prefix is diameter-nonincreasing.

### 8.6 Disconnected frontend stack — UNREACHABLE

Purpose: remnants of the pre-2026-02-23 mission UI, satellites/clouds/terrain, nearby systems, trajectory UI, Milky Way and alternate asteroid rendering. Exact per-module dispositions are in §9. These files are not application features. Useful isolated pieces include backend-compatible trajectory hydration, correct TLE column slices/J2 formulas, WMS axis order/bitmap eviction, self-validating galactic transform, and clean transition cancellation.

1. **Reachability:** no live main or sun-focus production file imports this stack. Sun spent +1,824/−632 LOC on still-dead modules; only newly added `planetShaders`/`quadtreeLOD` became live.
2. **Rewire needs/disposition:** see every row in §9; do not wire the graph wholesale.
3. **TLE parser:** exact loop gives 0 satellites from one two-line set and 2 from four.
4. **Worker lead:** `.45 s × 4 d/s = 1.8 d`, ~27.9 ISS revolutions; endpoint linear interpolation cannot represent it.
5. **Local planner:** Earth→Mars code v∞ 29.4476 versus analytic 2.6489 km/s; 60° case becomes max turn 1.511°/false rather than 77.047°/true.
6. **DOM:** 14/50 handles map to current IDs; 36 absent. Unsafe dereferences remain in `uiBindings`, `plannerController`, and `routeRenderer`, including after sun's partial typing.
7. **Duplicate:** `temp_nearbySystemsRenderer.ts:620-1127` is byte-identical to the original and duplicates all 44 errors.
8. **WS client:** old close/error handlers can clear a new connection; only connected/state-update handled, error/orbital frames dropped; connect never seeks from J2000. Sun fixes handler detachment but not full protocol/JD.
9. **Constants:** `PC_TO_AU`, `INTERSTELLAR_MAX_DISTANCE_AU`, `AU_PER_LIGHT_YEAR`, and manifest mapping (16 total destructured names) do not exist on main; last definitions are in `04e99a4^:src/main.js:235-267`.
10. **Deletion effect:** live `main.ts` already implements labels, orbit lines and camera clipping; deleting their dead counterparts loses no shipped behavior.
11. **Libraries worth keeping:** trajectory request/AbortController hydration, Milky Way matrix, TLE slices/J2 equations, WMS/bitmap cache, and transitions—as isolated tested libraries, not claims of current features.

### 8.7 Backend server and simulation engines — BACKEND

Purpose: FastAPI HTTP/WS surface, one simulation thread per connection, engine adapters, optional Kuiper sub-sim and solar providers. The bounded command/response queues, lock/async boundary, structured overflow/backpressure codes, strict Pydantic `extra=forbid`, JD conversion (`sim.t·365.25+J2000`), path traversal rejection, and WHFast conservation are concrete strengths. Test coverage avoids the most important default/lifecycle paths.

1. **REBOUND:** REBOUND 5.1.1 has no `ri_ias15`; default fails while health checks only nominal availability (F-002).
2. **Seek/lifecycle:** any finite JD, 3 s join, uninterruptible integrate, unpruned ten-year Simulation copies (F-013).
3. **Error recovery:** no command clears `_runtime_error`; Sun orbital query + resume freezes with `paused:false` (F-014).
4. **Origin/write:** any reachable hostile origin is reflected with credentials; report can overwrite existing `.md` under `my-notes`. It cannot traverse or write non-Markdown (F-005).
5. **Units/frame:** REBOUND barycentric AU/year versus Tudat AU/day; main contract says neither; Kuiper expects years (F-015).
6. **Realtime cache:** warm cache ignores JD; public force refresh amplifies upstream calls without single-flight/byte cap (F-009/F-020).
7. **Kuiper rate/payload:** requested 365 delivers 12.165 d/s under overrun; paused modulo repeats ~100.9 kB at every stream tick.
8. **Early disconnect:** runner starts before connected send enters cleanup; injected send failure leaks it.
9. **Coverage:** no main test opens WS, invokes real runner command flow, or initializes real REBOUND. Fake IAS member masks the default.
10. **Force callbacks:** galactic-tide/radiation-pressure callbacks are never registered; ctypes particle `beta` is not established writable/nonzero, so they are not active force models.
11. **Tudat chunks:** each chunk is reseeded from SPICE rather than previous propagated terminal state; reported energy is not a conserved continuous-run diagnostic. Runtime untested because Tudat is absent.
12. **Confirmed strengths:** WHFast 41 bodies initializes ~1.1 ms and one year integrates ~0.019 s with `5.7e-15` energy error; queue, validation, confinement, and JD facts above all survived adversarial checks.

### 8.8 Backend trajectory, mission, benchmark — BACKEND

Purpose: universal-variable Lambert, fixed-departure MGA, sequential mission/mining/logistics/risk/verifier services, EPO smoke families, and reference benchmark. Stumpff guards, f/g reconstruction, prograde/retrograde selection, flyby turn-angle equation, seeded Monte Carlo, strict schemas, tamper hashes, and low-precision ephemeris longitude (<~1° checked) are worth preserving.

1. **Short Lambert:** requested 2/5/10 d returns computed 23.510199/7.307078/17.145202 on main; wrapper omits computed TOF. Sun rejects them.
2. **MGA coverage:** 41 body routes generated, four reached; Venus and all 2/3-assist routes skipped. Order/budget bias follows generated ordering and TOF completions.
3. **Flyby energy:** magnitudes averaged; forced feasible cases differ up to 13.142 km/s and mismatch is not in total Δv.
4. **Benchmark:** main 0/3; artifacts lack reproducible states/tool commands. Sun calls them incomparable and reports validationCoverage 0—honest fencing, not validation.
5. **Provider:** main `auto` always returns Kepler when Tudat absent because Kepler never returns None, making Horizons unreachable; API reports requested “auto,” not actual. Sun changes order to SPICE→Horizons→Kepler and improves source reporting but introduces a live network wait.
6. **Mass chain:** return-burn payload is input 6,500 kg, not ~31,881.6 kg refined cargo; return propellant is subtracted from cargo and again from score.
7. **Defaults/risk:** mission 422 `no_verified_candidate`, unmet Δv 35.716 versus 3.716 available; risk nevertheless 0/240, independent of deterministic infeasibility.
8. **EPO:** 0/30; verifier reads top-level verification while planner nests it under candidate. “Done” migration status is false.
9. **Porkchop bounds:** 100-year minimum-step case ~9.42M solves; measured rate projects ~20 minutes unauthenticated CPU.
10. **Reference tests:** main has no independent analytic Lambert case. Sun's regression test snapshots its own expected output, while a Vallado probe independently validates the core to <`4e-5 km/s` but not wrapper edge handling.
11. **Domain limits:** no multi-revolution branch; fixed departure rather than windowed MGA; hand weights; uniform 300 km flyby floor; many “deltaV” values are heliocentric v∞; SPICE J2000 equatorial versus ecliptic fallbacks; mining constants uncited; storage factor `exp(-.0015·days)` loses ~85% over long returns.
12. **Preserve:** accurate elliptic/Stumpff/f-g core, direction selection, turn-angle relation, deterministic risk sampling, strict request models, hash tamper checks, and explicit sun-focus comparability fence.

### 8.9 Tests, tooling, developer experience, repository hygiene

1. **Typecheck:** main 1,300 and sun 341; neither exits 0. No CI/hook/lint catches it.
2. **Frontend runner:** none on main; the five-line asteroid “test” is an unimported re-export whose underlying function fails. Sun has 8 narrow tests.
3. **Python:** fresh requirements cannot collect three modules without `httpx2`; no upper bounds, pytest mixed into runtime, no pyproject/pytest.ini, and conftest mutates `sys.path`.
4. **Maintenance scripts:** moon ingest cannot import `.js`; SBDB update can half-apply (F-021).
5. **Assets/config:** no `src/assets` image is emitted; `visualProfiles` is unimported; three historical asteroid binary blobs remain; no LFS policy.
6. **Root browser probes:** undeclared Puppeteer, three ports, one personal output path; fail from clean clone.
7. **Asteroid fetcher:** outside `include`, requires undeclared `tsx/@types/node`, offline command fails.
8. **Notes:** three duplicate groups (one triple, two pairs); three similarly named MASTER files lack canonical selection.
9. **Governance:** LICENSE, CONTRIBUTING, CI, Dockerfile, editor/version files all absent; quota extension is sole recommendation.
10. **Dev/CLI:** `dev-full` launches bare `python3` and binds publicly; unrelated OpenAI prompt CLI accepts API key on command line. Keep only if product-scoped, use environment/secret input and resolved venv executable.
11. **History:** 294 main commits in 28 days; 101 subjects exceed 72 chars; 15 consecutive directive-removal commits add no types; duplicate subjects make bisection noisy.
12. **tsconfig:** `allowJs` remains with no source JS, scripts excluded, no unused checks. Enabling them would expose dead imports/fields (including `timeScaleDirty` and unused acceptance types) but only after baseline errors are reduced.

### 8.10 Documentation and claims — DOC

1. **README highlights:** both UI and reachable implementation exist for time controls, asteroid/KBO machinery, and core solar/AGN panel (AGN is omitted from README). Asteroid rendering is present but wrong. Most mission/satellite/nearby visuals are dead or absent.
2. **Moons:** hard-disabled at `main.ts:380`, no toggle, no logged decision.
3. **Assets/stars:** no reachable import of actual texture paths or `stars_catalog.json`; they appear to be abandoned inputs, not shipped features.
4. **Rewrite record:** neither rolling log names `04e99a4`/`d1484e8`; later plans target the removed architecture.
5. **Engine UI:** README's selector/Connect workflow cannot be performed on either branch.
6. **Error prioritization:** 438 live/862 dead; current hardening leads with 311 errors in a dead file, so it is not reachability-prioritized.
7. **Prior audit:** complete A/B/C/D closure table is in §7; A1 is not a successful decomposition.
8. **Contradictions:** README says two workers; History says only satellite; reality is model live/satellite dead. Migration file's 53+0 cannot total 82.
9. **Instruction layer:** size/timestamp/prune rules are not enforced, including five approximate `~08:00` entries; an unenforced process contract is historical guidance, not a quality gate.
10. **Claims/TODOs:** all 42 README rows, status-document claims, 23 prior-audit items, 26 Phase-1 TODOs, and 29 WBS tasks are dispositioned in §7.
11. **Credit:** README's Physics Notes acknowledges approximations; ACBF and calibration specs are colocated; the 2026-02-15 JD bug log is an effective evidence write-up; the 2026-03-07 audit candidly records ~1,254 errors; checked API descriptions are often accurate. Preserve these patterns while pruning stale scope.

## 9. Disconnected-code inventory

Main has exactly 32 unreachable TS files, 8,275 LOC, and 862 TypeScript errors. “Sun live?” means application reachability, not test-runner discovery.

| Module | LOC / tsc | Needed to rewire | Sun live? | Disposition | Worth preserving |
|---|---:|---|---|---|---|
| `src/data/asteroidCatalogLoader.test.ts` | 5 / 0 | real Vitest registration/assertions | deleted | **delete/replace** | no; five-line fake test |
| `src/data/asteroidTaxonomyResolver.ts` | 498 / 0 | canonical mapping imported by builder/runtime; gate | no | **keep-as-library** | resolver and coverage validator |
| `src/frontend/app/animationLoop.ts` | 139 / 45 | entire removed callback/state graph | no | **delete** | live loop supersedes it |
| `src/frontend/app/cameraController.ts` | 154 / 22 | removed AU constants/current camera API | no | **delete** | live focus/clip duplicates it |
| `src/frontend/app/inputHandler.ts` | 22 / 7 | dead planner/ui binder | no | **delete** | obsolete thin coordinator |
| `src/frontend/app/labelSystem.ts` | 223 / 70 | current node/UI wiring | no | **delete** | live label helper duplicates it |
| `src/frontend/app/localSystemRenderer.ts` | 424 / 28 | old constants/assets/manifests/scene ownership | no | **archive** | salvage only if old product restored |
| `src/frontend/app/nearbySystemsRenderer.ts` | 508 / 44 | nearby UI, constants/manifests, camera/group ownership | no | **keep-and-rewire** | proper-motion/manifest rendering |
| `src/frontend/app/plannerController.ts` | 317 / 11 | ~17 DOM controls, backend contracts | no | **keep-and-rewire** | existing backend API workflow |
| `src/frontend/app/routeRenderer.ts` | 117 / 21 | planner caller/current scene/safe DOM | no | **keep-and-rewire** | arc rendering |
| `src/frontend/app/simulationClient.ts` | 137 / 0 | Connect UI, JD handshake, full WS union | no | **keep-and-rewire** | compact client basis; fix races |
| `src/frontend/app/temp_nearbySystemsRenderer.ts` | 1,127 / 44 | none | deleted | **delete** | duplicated tail only |
| `src/frontend/app/uiBindings.ts` | 183 / 11 | 36 missing elements/new product surface | no | **delete/rewrite narrowly** | no mega-binder |
| `src/frontend/camera/transitions.ts` | 80 / 8 | typed caller | no | **keep-as-library** | good easing/cancel cleanup |
| `src/frontend/features/planetary/cloudDataPipeline.ts` | 213 / 91 | Earth material/control/endpoint lifecycle | no | **keep-and-rewire** | correct WMS axis order/bitmap eviction |
| `src/frontend/features/planetary/moonTextureCatalog.ts` | 146 / 0 | runnable ingest + moon rendering | no | **keep-as-library** | source/attribution catalog |
| `src/frontend/features/planetary/moonTexturePipeline.ts` | 94 / 31 | moon material/LOD caller | no | **keep-as-library** | texture selection logic |
| `src/frontend/features/planetary/satellitePropagationWorker.ts` | 166 / 11 | redesigned cadence/protocol/caller | no | **archive** | current interpolation invalid |
| `src/frontend/features/planetary/satelliteSystem.ts` | 1,001 / 311 | UI, lifecycle, parser tests, worker rewrite | no | **archive** | extract TLE slices and J2 equations |
| `src/frontend/features/planetary/terrainSynthesis.ts` | 113 / 13 | planet material/geometry caller | no | **keep-as-library** | small procedural helper |
| `src/frontend/features/planetary/visualProfiles.ts` | 328 / 2 | actual loaders/material pipeline/UI | no | **archive** | profile ideas; bad worker lead must go |
| `src/frontend/features/solar/solarProminences.ts` | 372 / 0 | Sun ownership/lifecycle/toggle | no | **keep-as-library** | isolated typed effect; dedupe first |
| `src/frontend/features/solar/solarWind.ts` | 145 / 11 | Sun group/lifecycle/scale review | no | **keep-as-library** | isolated visual primitive |
| `src/frontend/features/trajectory/index.ts` | 294 / 0 | planner UI/date/body state | no | **keep-and-rewire** | schema hydration + AbortController |
| `src/frontend/features/trajectory/localPlanner.ts` | 336 / 30 | validated Lambert/ephemeris | no | **archive** | do not retain wrong chord fallback |
| `src/frontend/rendering/lodManager.ts` | 44 / 11 | profile/material caller | no | **delete** | tiny generic swap unnecessary |
| `src/frontend/rendering/milkyWay.ts` | 463 / 40 | display controls/catalog/scene lifecycle | no | **keep-and-rewire** | self-validating frame matrix |
| `src/frontend/rendering/orbitRenderer.ts` | 62 / 0 | typed caller | no | **delete** | live `createOrbitLine` equivalent |
| `src/sim/asteroids/asteroidDistributions.ts` | 181 / 0 | old pipeline caller | no | **delete after comparison** | seeded distributions only |
| `src/sim/asteroids/asteroidGeometry.ts` | 100 / 0 | old shader caller | no | **delete** | superseded |
| `src/sim/asteroids/asteroidPipeline.ts` | 127 / 0 | explicit runtime caller | no | **delete** | superseded 1.925M path |
| `src/sim/asteroids/asteroidShaders.ts` | 156 / 0 | old pipeline caller | no | **delete** | extract relative-JD technique first |

On `sun-focus`, application reachability reports 34 files/8,796 LOC, but three are intentional Vitest roots. Production-dead count is 31 after deleting the fake asteroid test and temporary renderer and adding dead `satellitePropagationCore` (171 LOC, keep as tested library). `stateStore.test`, `catalog.test`, and `orbitMath.test` are **TEST-ONLY/KEEP**, not production-dead. `planetShaders` and `quadtreeLOD` are live and must not be put in the dead table.

## 10. Strengths

- **Elliptic orbit core:** Kepler residual ≤`5.53e-11` through e=.9999999; analytic velocities agree with finite differences to ~`1e-8`; Standish element reduction and JD conversions are correct. Preserve these kernels and wrap validation around them.
- **ACBF integrity:** Python writer, TS reader and colocated spec agree on `ACBF v1`, stride 36, count 100,000, length 3,600,012. Recomputed FNV-1a `f1f80244` and SHA-256 `a0b832…8823d` match; 100,000 source IDs are unique and selection prefix is deterministic/diameter-sorted.
- **Backend concurrency primitives:** bounded queues, one lock-owned engine thread, async send/receive bridge, explicit overflow/backpressure messages, and cleanup on the normal connected path are good foundations. Fix lifecycle gaps without replacing the model casually.
- **Validation boundaries:** strict Pydantic models reject extra fields; nearby IDs and report paths are checked; traversal/non-Markdown paths are rejected. These should remain while authorization and overwrite semantics change.
- **Trajectory kernels:** Stumpff guards, f/g reconstruction, prograde/retrograde handling, and the unpowered turn-angle equation are correct in isolation. The Vallado probe validates the Lambert core; errors are in fallback/search/contract layers.
- **Simulation numerics:** WHFast initialized 41 bodies quickly and conserved relative energy to ~`5.7e-15` over one year. The 2026-02-15 `365.25 d/yr` JD correction remains right.
- **Isolated dormant libraries:** WMS 1.3 EPSG:4326 axis order and ImageBitmap eviction, galactic/equatorial matrix self-check, fixed-column TLE slices/J2 equations, transition cancellation, and trajectory AbortController/schema hydration are specific salvageable pieces.
- **Solar/SMBH honest pieces:** solar responses expose source/fidelity metadata; light travel, Sedov/inversion, compression, Alfvén, apparent-β/Doppler, Hillas/Eddington/Blandford–McKee kernels checked correctly. Keep them separate from broken unit chains/speculation.
- **Process candor:** the 2026-03-07 log admits the type-error scale; `CLAUDE_OPUS_WORK_LOG_2026-02-15.md` is a model evidence-based bug write-up; ACBF and calibration specs are colocated. These are better patterns than unsupported completion prose.
- **Sun-focus direction:** 72% fewer tsc errors, eight deterministic frontend tests, real-engine registry coverage, secular lunar improvement, cache/reconnect work, live planet shaders/LOD, and honest benchmark fencing are meaningful progress even though its gates remain red.

## 11. Roadmap

### Now — no more than one week

| Action | Findings | Script-checkable acceptance |
|---|---|---|
| Choose `sun-focus` as integration base, reconcile seven main-only patches, then repoint/merge main | F-030/F-031 | `git rev-list --left-right --count main...chosen` is `0 0`; reviewed cherry list recorded |
| Restore a reproducible green gate | F-001/F-021 | clean `npm ci && npm run typecheck && npm test`; fresh `pip install -r ... && pytest` all exit 0 in CI |
| Repair/fence REBOUND default | F-002 | real default `/ws/sim` emits `connected`, or health/default explicitly disables IAS15 |
| Fix asteroid transform before claiming a belt | F-003 | GPU/CPU sampled world-radius test at 2.5 AU passes; browser screenshot/readback shows belt outside Sun |
| Port Lambert TOF residual guard | F-004 | 2/5/10 d cases explicitly reject; Vallado case stays within tolerance |
| Remove destructive cross-origin report behavior | F-005/F-020 | hostile CORS denied; existing report path returns 409 and hash is unchanged |
| Make README describe the chosen reachable app | F-006 | automated README feature manifest agrees with DOM/reachability; no absolute home paths |

### Next — no more than one month

| Action | Findings | Acceptance |
|---|---|---|
| Correct moon full-basis transforms and secular propagation | F-007/F-027 | Io/Titan/Cordelia/Charon and multi-epoch Moon oracle tests within stated tolerances |
| Unify solar axis/time/scale and compact data delivery | F-008/F-009/F-025 | pause/warp invariants pass; one concurrent fetch; documented payload budget |
| Correct SMBH units and fence H29 | F-010/F-011/F-024 | hand-unit tests <1%; H29 marked speculative; standard fronts ≤c; callback browser test passes |
| Version asteroid precision/provenance schema | F-012/F-026 | 100k round-trip passes; taxonomy/albedo provenance fields explicit; slow valid load accepted |
| Harden runner and shared state contract | F-013–F-015/F-019 | cancellation/thread-leak suite passes; units/frame required; engine parity displacement test |
| Repair MGA/mission/benchmark semantics | F-016–F-018 | route coverage reported; v∞ conserved; mass ledger balances; ≥1 independent comparable benchmark |
| Act on every dead-module disposition | F-029/F-030 | no temp duplicate; production-dead LOC intentionally archived or covered by an approved ADR |

### Later

- Add fidelity tiers and primary-reference fixtures for every scientific visualization rather than growing one “realistic” mode (F-007–F-012, F-025–F-028).
- Reintroduce satellites, nearby systems, planner, Milky Way, or cloud layers only as separately tested slices from §9—not by reconnecting the old graph (F-029).
- Establish asset/license/provenance manifests, LFS/release-artifact policy, canonical research index, and measured performance budgets on a real GPU (F-031).
- If TudatPy remains a goal, build continuous-chunk state propagation and cross-engine frame/unit/energy validation before advertising fallback (F-015).

## 12. Branch recommendation

Use `origin/sun-focus` as the **integration/canonical base**, not as a releasable branch yet. It is the active line (69 unique commits; July versus main's March), cuts tsc from 1,300 to 341, adds 8 passing frontend tests and 33 additional passing backend tests, makes planet shaders/LOD live, materially improves lunar secular motion, fixes main's Lambert silent fallback and metadata cache mode, and labels legacy benchmark rows incomparable.

Do not fast-forward: histories diverge by 7 main-only and 69 sun-only commits. `git cherry origin/sun-focus main` marks all seven main patches unique: solar/trajectory/orbit/asteroid typing, stale docs, ACBF docs/tools, and audit changes. Review and cherry-pick the useful typing/ACBF parts; reject or rewrite stale documentation explicitly. Then merge/repoint `main` only after the “Now” gates pass. A blind replacement risks dropping useful main-only work; a blind merge risks reviving stale docs/dead modules. Sun-focus itself still has 341 type errors, the REBOUND failure, asteroid collapse, moon-frame defects, README falsehoods, and a new Horizons-dependent EPO hang.

## 13. Not inspected

- TudatPy runtime and numerical output: package is not installed by the project; implementation was fully read, but execution requires a separate heavy environment.
- `sun-focus`'s new 1,193-line `pfss_magnetogram.py` and expanded solar physics were inspected only at integration/serialization/consumer paths, not numerically validated as a solar-field model.
- Full scientific merit of H29/superluminal research papers, by scope. Only standard formulas, labels and runtime effects were checked.
- Every paragraph of ~55 research documents and 62 `my-notes` files. Names/sizes/hashes, indices, canonicality and relied-on claims were checked; duplicates were not treated as evidence.
- Real discrete-GPU frame timing, mobile/browser matrix, accessibility, and visual aesthetics. Headless Chromium used SwiftShader; screenshots support state/fidelity findings, not aesthetic judgment.
- Long-duration live third-party reliability/rate behavior. Helioviewer/Horizons were queried narrowly; concurrency was reproduced with monkeypatched providers to avoid stressing upstreams.
- Full security penetration testing, dependency vulnerability scan, deployment environment, and secrets history. The report covers observed CORS/write/compute exposure only.
- Every possible invalid numeric combination and multi-year ephemeris oracle. Representative boundaries and four moon families were chosen; broader reference validation belongs in the roadmap.

## 14. Appendix A — commands and output excerpts

Repeated `rg -n`, `nl -ba ... | sed -n`, `git show`, and `git diff -- <path>` commands were used to read the exact paths/lines cited above; those source excerpts are quoted in findings and not duplicated here. The commands below are the executable measurements relied upon. The transient `.eval` logs were deleted by a concurrent cleanup after their excerpts were captured.

### A.1 Environment, repository and branch

```bash
/home/nomad/miniconda3/envs/icl-vram-py312-cu132/bin/node --version
PATH=/home/nomad/miniconda3/envs/icl-vram-py312-cu132/bin:$PATH npm --version
/home/nomad/miniconda3/bin/python3.14 --version
git rev-parse HEAD; git branch --show-current; git status --porcelain
git fetch -q origin
git rev-list --left-right --count main...origin/sun-focus
git merge-base main origin/sun-focus
git diff --stat main origin/sun-focus | tail -1
```

```text
v22.23.2; npm 10.9.8; Python 3.14.6
aa6e39a03e7d95d6f7733e8a4710b990bada9859; main
fetch: Permission denied (publickey)
7 69
c3b00e058d6a4963396b5e5b6bce11d2b83a5b7e
104 files changed, 14058 insertions(+), 3065 deletions(-)
```

```bash
git worktree add ../ssrs-sunfocus origin/sun-focus
git cherry origin/sun-focus main
git log -20 --date=iso-strict --format='%H %cI %s'
du -sh .git src/assets public
git count-objects -vH | grep size-pack
git ls-files '*.ts' | wc -l; git ls-files '*.py' | wc -l; git ls-files '*.md' | wc -l
```

```text
main-only commits: 7, all `+`; pack 46.63 MiB
.git 56M; src/assets 39M (40,557,506 B); public 4.4M
63 TS; 54 Python; 85 Markdown
```

### A.2 Main clean baseline

```bash
PATH=/home/nomad/miniconda3/envs/icl-vram-py312-cu132/bin:$PATH npm ci --no-audit --no-fund
PATH=...:$PATH npm run typecheck > .eval/main/tsc.log 2>&1
grep -c 'error TS' .eval/main/tsc.log
grep -o 'error TS[0-9]*' .eval/main/tsc.log | sort | uniq -c | sort -rn
PATH=...:$PATH npm run build
grep -c self.onmessage dist/assets/index-*.js
```

```text
npm ci: added 24 packages, exit 0
typecheck exit 2; 1300 errors
TS7006 439; TS2339 438; TS7031 188; TS18047 90; TS7005 79; TS7034 30; other 36
index JS 848.57 kB / gzip 208.04; worker 18.44 kB; CSS 6.53 kB; build 1.49 s
worker handler in main chunk: 1
```

```bash
/home/nomad/miniconda3/bin/python3.14 -m venv .eval/main-venv
.eval/main-venv/bin/pip install -r backend/requirements.txt
(cd backend && ../.eval/main-venv/bin/python -m pytest -q -p no:cacheprovider)
.eval/main-venv/bin/pip install httpx2
(cd backend && ../.eval/main-venv/bin/python -m pytest -q -p no:cacheprovider)
```

```text
rebound 5.1.1; `ri_ias15` absent
fresh: 3 collection errors — Starlette TestClient requires `httpx2`
after extra install: 48 passed, 1 warning in 0.45 s
```

```bash
(cd backend && ../.eval/main-venv/bin/python -m mission.epo.smoke_test --compact)
python3 .eval/reach.py
grep/getElementById and index-id `comm` cross-check from prompt A.4
```

```text
EPO total 30, passed 0, failed 30, exceptions 0; each family 0/10
REACHABLE 30 files / 11,329 LOC; UNREACHABLE 32 / 8,275 LOC
reachable tsc errors 438; unreachable 862
direct IDs missing 0; dead injected handles 50, present 14, missing 36
```

### A.3 Comparison branch

```bash
(cd ../ssrs-sunfocus && PATH=...:$PATH npm ci --no-audit --no-fund)
(cd ../ssrs-sunfocus && PATH=...:$PATH npm run typecheck)
(cd ../ssrs-sunfocus && PATH=...:$PATH npm run build)
(cd ../ssrs-sunfocus && PATH=...:$PATH npm test)
(cd ../ssrs-sunfocus/backend && <fresh-venv>/python -m pytest -q)
python3 .eval/reach.py  # with comparison root
```

```text
tsc exit 2: 341 errors (242 live, 99 production-dead/test-only split as described)
build: 890.15 kB / gzip 220.85; worker 18.95 kB
Vitest: 3 files, 8 tests passed
pytest: 80 passed, 1 failed (`ri_ias15`), 2 warnings
reachability: 32 / 13,731 live; 34 / 8,796 app-unreachable
```

The comparison EPO command was interrupted after >11 minutes inside Horizons retrieval. Its benchmark command returned:

```text
scenarioCount=3; comparable=0; incomparable=3; solved=0; pass=0
passRate=0; validationCoverage=0; referenceIntegrityOk=True
```

### A.4 HTTP and WebSocket runtime

```bash
(cd backend && ../.eval/main-venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8102)
for p in health info bodies solar/capabilities solar/realtime solar/realtime/aia-tile \
 solar/physics nearby-systems trajectory/capabilities mission/capabilities benchmark/accuracy; do
  curl -s -o output -w '%{http_code} %{size_download}B %{time_total}s' http://127.0.0.1:8102/$p
done
curl -s 'http://127.0.0.1:8102/solar/physics?fidelity=high&max_features=180'
curl -i -X OPTIONS ... -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: POST'
```

```text
all GETs 200; bodies 4,343 B; default solar physics 408,869 B; high/180 495,672 B
AIA 206,295 B; nearby 36,306 B; benchmark 5,482 B and passCount 0
hostile origin reflected; allow-credentials true
mission default: 422 no_verified_candidate
```

The 10-line `websockets` client from prompt A.6 was run first with defaults and then `integrator=whfast`, issuing pause, scale 12, seek JD 2460600.5, Sun orbital elements, and resume:

```text
default: error engine_init_failed "'Simulation' object has no attribute 'ri_ias15'"; close 1011
WHFast: connected/state_update; Sun query -> runtime_error "Particle and primary are the same"
resume telemetry paused:false, JD frozen, runtime_error retained
```

Valid and invalid JSON were posted with `curl` to `/trajectory/lambert`, `/trajectory/porkchop`, `/trajectory/plan`, `/mission/plan`, and `/benchmark/accuracy/report`; nearby valid/invalid IDs were fetched. Strict extra/invalid requests returned 4xx; valid Lambert/porkchop/plan returned 200; traversal and `.txt` report paths returned 400.

### A.5 Backend numerical/lifecycle probes

```bash
(cd backend && <venv>/python <inline probes>)
```

The inline probes imported production functions and instrumented calls without editing sources:

```text
Lambert requests 2/5/10 d -> computed 23.510199/7.307078/17.145202 d
MGA: 41 routes generated, 4 reached; Venus/2-/3-assist absent
flyby |v∞| mismatch observed up to 13.142 km/s
porkchop throughput 7,865 Lambert eval/s; 100-y estimate ~19.97 min
long seek: stop returned at 3 s while thread alive; checkpoints 4/11/21 at 35/105/205 y
Kuiper requested 365 -> 12.165 simulated d/wall-s; paused payload ~100.9 kB/tick at 10 Hz
five concurrent forced solar refresh calls -> five upstream executions
```

The report-overwrite probe monkeypatched `BENCHMARK_REPORTS_DIR` to a temporary directory, wrote `victim.md`, called the real endpoint path/writer, and verified changed bytes. No research note was used.

### A.6 Browser and TypeScript probes

```bash
PATH=...:$PATH npm run dev -- --host 127.0.0.1 --port 5199 --strictPort
node .eval/browser_probe.mjs
node .eval/browser_focus_probe.mjs
node .eval/texture_bench.mjs
node_modules/.bin/esbuild .eval/<probe>.ts --bundle --platform=node --format=cjs --outfile=.eval/<probe>.cjs
node .eval/<probe>.cjs
```

```text
>30 s: 0 page errors/failed requests; one ShaderMaterial property warning
phase-1 accepted in 366 ms; status Bodies: 20,010; 10 select options
pause date unchanged; 464,123 pixels / 37.9185% changed over 1.5 s
Earth/Pluto focus range 1,495,979 km; H29 instrumented warpImpacts=0
catalog 11.06 ms; model update 0.10–0.12 ms; asteroids 16–18 ms; KBO 6–8 ms
KBO propagate 1.126 ms; upload 320,000 B; Sun texture 316.7–341.9 ms browser
```

Bundled numeric probes produced:

```text
Kepler max residual 5.5289e-11; velocity relative errors 7.8e-10/1.3e-9/1.25e-8
period 0 -> NaN; e=2 -> clamped ellipse; no current invalid records
Io/Titan/Cordelia direction errors 178.508°/96.034°/38.961°
Ariel-Cordelia normal angle 160.377°
Float32 Pluto ULP 570.67 km; raw JD ULP .25 d
100k asteroid round-trip: 99,916 mismatches, max epoch .1249998966 d
1 EeV/5 μG gyroradius: code 2.2251e10 cm; correct 6.6708e20 cm
CR tsunami: 3.221735615e11 y; Sedov inverse round-trip ~1e11 s
```

The reference-plane inline Python vector calculation (ICRF-equator node versus code's ecliptic node) returned Mars `40.8776°`, Saturn `39.9119°`. JPL Horizons queries used `ssd.jpl.nasa.gov/api/horizons.api`, `COMMAND=901 CENTER=500@999 TLIST=2451545 REF_PLANE=ECLIPTIC` for Charon and `COMMAND=301 CENTER=500@399 TLIST=2461276.5` for the Moon.

### A.7 Data, scripts, dead code and repository probes

```bash
node <bundled roundtrip/taxonomy/TLE/local-planner probes>
npm run ingest:moon-textures
python .eval/data_dead_docs/probe_fetch_jpl.py   # mocked fixture/temporary targets
PATH=...:$PATH npm exec --offline -- tsx scripts/asteroid/catalog_fetcher.ts
find src/assets/textures -type f -printf '%s %p\n'
git rev-list --objects --all | git cat-file --batch-check='...'
sha256sum / cmp over my-notes and renderer tails
```

```text
ACBF: magic/version/stride/count/size all valid; FNV f1f80244 and SHA a0b832…8823d match
100,000 unique source IDs; taxonomy C66362/S14009/M19629; 2.5–2.7 AU M=98.9446%
only three albedos; coverage validator false; periods 131 distinct
TLE sets: 1 -> 0, 4 -> 2; planner v∞ ratio 11.1169
moon ingest: ERR_MODULE_NOT_FOUND; mocked SBDB run writes first target then FileNotFound second
offline tsx: ENOTCACHED; Puppeteer/tsx/@types-node absent
assets 40,557,506 B; asteroid history blobs total 12,800,036 uncompressed B
duplicate notes: one triple and two pairs; temp renderer tail cmp exit 0
```

### Appendix B — coverage matrix

Status is team coverage: **read fully** means at least one reviewer read the entire source or structured data; **read partially** means the relevant call path/exports/diff were read or executed; **not read** means no manual source review. Execution alone did not upgrade a file to “fully.”

| Source file | Coverage |
|---|---|
| `backend/benchmark/__init__.py` | read fully |
| `backend/benchmark/accuracy.py` | read fully |
| `backend/data/__init__.py` | read fully |
| `backend/data/bodies.py` | read fully |
| `backend/data/nearby_systems.py` | read fully |
| `backend/mission/__init__.py` | read fully |
| `backend/mission/agents.py` | read fully |
| `backend/mission/ephemeris_service.py` | read fully |
| `backend/mission/epo/__init__.py` | read fully |
| `backend/mission/epo/config.py` | read fully |
| `backend/mission/epo/metrics.py` | read fully |
| `backend/mission/epo/runners.py` | read fully |
| `backend/mission/epo/sample_episodes.py` | read fully |
| `backend/mission/epo/smoke_test.py` | read fully |
| `backend/mission/epo/verifier.py` | read fully |
| `backend/mission/explainability.py` | read fully |
| `backend/mission/mining_service.py` | read fully |
| `backend/mission/orbital.py` | read fully |
| `backend/mission/risk_service.py` | read fully |
| `backend/mission/schemas.py` | read fully |
| `backend/mission/vehicle_service.py` | read fully |
| `backend/server.py` | read fully |
| `backend/sim/__init__.py` | read fully |
| `backend/sim/base.py` | read fully |
| `backend/sim/contracts.py` | read fully |
| `backend/sim/galactic_tide.py` | read fully |
| `backend/sim/kuiper.py` | read fully |
| `backend/sim/radiation_pressure.py` | read fully |
| `backend/sim/rebound_nbody.py` | read fully |
| `backend/sim/solar_physics.py` | read fully |
| `backend/sim/solar_realtime_data.py` | read fully |
| `backend/sim/tudatpy_hooks.py` | read fully |
| `backend/trajectory/__init__.py` | read fully |
| `backend/trajectory/lambert.py` | read fully |
| `backend/trajectory/mga.py` | read fully |
| `backend/trajectory/planner.py` | read fully |
| `backend/tests/conftest.py` | read fully |
| `backend/tests/test_benchmark_accuracy.py` | read fully |
| `backend/tests/test_mission_agents.py` | read fully |
| `backend/tests/test_mission_schemas.py` | read fully |
| `backend/tests/test_nearby_systems_api_contract.py` | read fully |
| `backend/tests/test_nearby_systems_catalog.py` | read fully |
| `backend/tests/test_seek_optimizations.py` | read fully |
| `backend/tests/test_server_validation.py` | read fully |
| `backend/tests/test_sim_contracts.py` | read fully |
| `backend/tests/test_sim_registry.py` | read fully |
| `backend/tests/test_solar_physics_api.py` | read fully |
| `backend/tests/test_solar_physics_model.py` | read fully |
| `backend/tests/test_trajectory_regression.py` | read fully |
| `get_errors.mjs` | read fully |
| `scripts/asteroid/catalog_fetcher.ts` | read partially |
| `scripts/build_asteroid_phase1_dataset.py` | read partially |
| `scripts/dev-full.mjs` | read partially |
| `scripts/fetch_gaia_catalog.py` | not read |
| `scripts/fetch_jpl_sbdb.py` | read partially |
| `scripts/fetch_utils.py` | read partially |
| `scripts/ingest-moon-textures.mjs` | read partially |
| `scripts/openai_codex_prompt.py` | read partially |
| `scripts/run-ui-dev.mjs` | not read |
| `scripts/update-moons-data.mjs` | read fully |
| `src/constants.ts` | read fully |
| `src/data/asteroidCatalogLoader.test.ts` | read fully |
| `src/data/asteroidCatalogLoader.ts` | read fully |
| `src/data/asteroidTaxonomyResolver.ts` | read partially |
| `src/data/planets.ts` | read fully |
| `src/frontend/app/animationLoop.ts` | read partially |
| `src/frontend/app/bodyManager.ts` | read fully |
| `src/frontend/app/cameraController.ts` | read partially |
| `src/frontend/app/inputHandler.ts` | read fully |
| `src/frontend/app/labelSystem.ts` | read partially |
| `src/frontend/app/localSystemRenderer.ts` | read partially |
| `src/frontend/app/nearbySystemsRenderer.ts` | read partially |
| `src/frontend/app/plannerController.ts` | read partially |
| `src/frontend/app/routeRenderer.ts` | read partially |
| `src/frontend/app/sceneSetup.ts` | read fully |
| `src/frontend/app/simulationClient.ts` | read partially |
| `src/frontend/app/stateStore.ts` | read fully |
| `src/frontend/app/temp_nearbySystemsRenderer.ts` | read partially |
| `src/frontend/app/textureManager.ts` | read fully |
| `src/frontend/app/timeController.ts` | read fully |
| `src/frontend/app/uiBindings.ts` | read partially |
| `src/frontend/camera/transitions.ts` | read fully |
| `src/frontend/features/asteroids/beltRenderer.ts` | read fully |
| `src/frontend/features/planetary/cloudDataPipeline.ts` | read partially |
| `src/frontend/features/planetary/moonTextureCatalog.ts` | read partially |
| `src/frontend/features/planetary/moonTexturePipeline.ts` | read partially |
| `src/frontend/features/planetary/satellitePropagationWorker.ts` | read partially |
| `src/frontend/features/planetary/satelliteSystem.ts` | read partially |
| `src/frontend/features/planetary/terrainSynthesis.ts` | read partially |
| `src/frontend/features/planetary/visualProfiles.ts` | read partially |
| `src/frontend/features/solar/gravitationalWaves.ts` | read fully |
| `src/frontend/features/solar/solarFeatureBlending.ts` | read fully |
| `src/frontend/features/solar/solarFlares.ts` | read fully |
| `src/frontend/features/solar/solarMagnetics.ts` | read fully |
| `src/frontend/features/solar/solarObservationTexture.ts` | read fully |
| `src/frontend/features/solar/solarPhysicsClient.ts` | read fully |
| `src/frontend/features/solar/solarProminences.ts` | read fully |
| `src/frontend/features/solar/solarWind.ts` | read fully |
| `src/frontend/features/solar/sunVisuals.ts` | read fully |
| `src/frontend/features/superluminal-modeling/agnShockwaveEngine.ts` | read fully |
| `src/frontend/features/superluminal-modeling/smbhPhysicsConstants.ts` | read fully |
| `src/frontend/features/superluminal-modeling/smbhPropagation.ts` | read fully |
| `src/frontend/features/superluminal-modeling/warpSlipstreamVisuals.ts` | read fully |
| `src/frontend/features/trajectory/index.ts` | read partially |
| `src/frontend/features/trajectory/localPlanner.ts` | read partially |
| `src/frontend/rendering/lodManager.ts` | read fully |
| `src/frontend/rendering/milkyWay.ts` | read partially |
| `src/frontend/rendering/orbitRenderer.ts` | read fully |
| `src/main.ts` | read fully |
| `src/sim/asteroidBelt.ts` | read fully |
| `src/sim/asteroids/asteroidDistributions.ts` | read partially |
| `src/sim/asteroids/asteroidGeometry.ts` | read partially |
| `src/sim/asteroids/asteroidPipeline.ts` | read partially |
| `src/sim/asteroids/asteroidShaders.ts` | read partially |
| `src/sim/catalog.ts` | read fully |
| `src/sim/kuiperBelt.ts` | read partially |
| `src/sim/orbitMath.ts` | read fully |
| `src/sim/phase1AsteroidCatalog.ts` | read fully |
| `src/sim/solarSystemModel.ts` | read fully |
| `src/sunController.ts` | read fully |
| `src/textures.ts` | read fully |
| `src/workers/modelWorker.ts` | read fully |
| `testRealisticScale.mjs` | read fully |
| `testWarp.js` | read fully |

Additional runtime/config/data inputs opened:

| File | Coverage |
|---|---|
| `index.html` | read fully |
| `src/style.css` | read partially |
| `package.json` | read fully |
| `package-lock.json` | read partially |
| `tsconfig.json` | read fully |
| `backend/requirements.txt` | read fully |
| `.gitignore` | read partially |
| `.vscode/extensions.json` | read fully |
| `src/data/moons.json` | read fully as structured data |
| `src/data/stars_catalog.json` | read partially (shape/use only) |
| `public/data/asteroid-phase1/asteroid_phase1_main_100000.meta.json` | read fully |
| `public/data/asteroid-phase1/asteroid_phase1_main_100000.bin` | read partially/data-probed in full |
| `backend/benchmark/reference_scenarios.json` | read fully |
| `backend/benchmark/artifacts/earth_mars_2024_window__gmat.csv` | read fully |
| `backend/benchmark/artifacts/earth_mars_2024_window__orekit.csv` | read fully |
| `backend/benchmark/artifacts/earth_mars_2024_window__tudat.csv` | read fully |
| `backend/benchmark/artifacts/earth_jupiter_2024_window__gmat.csv` | read fully |
| `backend/benchmark/artifacts/earth_jupiter_2024_window__orekit.csv` | read fully |
| `backend/benchmark/artifacts/earth_jupiter_2024_window__tudat.csv` | read fully |
| `backend/benchmark/artifacts/earth_venus_2024_window__gmat.csv` | read fully |
| `backend/benchmark/artifacts/earth_venus_2024_window__orekit.csv` | read fully |
| `backend/benchmark/artifacts/earth_venus_2024_window__tudat.csv` | read fully |

Documentation opened and used as claims, never as verification:

| File | Coverage |
|---|---|
| `README.md` | read fully |
| `Development_History_Context.md` | read partially |
| `Development_Improvements.md` | read partially |
| `typescript_migration_plan.md` | read fully |
| `ADVANCED_ASTROPHYSICS_INDEX.md` | read partially |
| `CLAUDE_OPUS_WORK_LOG_2026-02-15.md` | read partially |
| `solar_system_codebase_analysis_consolidated_2026-02-21_03-08-50.md` | read partially |
| `agent-notes/phase1_closure_and_hardening_todos.md` | read partially, every TODO heading/status checked |
| `agent-notes/asteroid_simulation_phase2_multistage_wbs.md` | read partially, every primary task checked |
| `src/data/asteroidCatalogBinaryFormat.md` | read fully |
| `scripts/asteroid/README.md` | read partially |
| `src/sim/asteroids/README.md` | not read |
| `backend/benchmark/CALIBRATION_PROTOCOL.md` | read fully |
| `WORK_DONE_2026-02-10.md` | not read |
| `WORK_DONE_2026-02-11.md` | not read |
| individual `my-notes/*.md` bodies | not read (names/sizes/hashes only) |
| `agent-notes/CODEBASE_EVALUATION_REPORT_2026-08-23.md` | read partially, read-only; not used as evidence |

Comparison-branch coverage: complete relevant diffs/current call paths were read for package/README, all corresponding live frontend/orbit/solar files, `planetShaders`, `quadtreeLOD`, `satellitePropagationCore`, the three frontend tests, server/contracts/REBOUND/Kuiper/radiation/solar-realtime, Lambert/planner/ephemeris/benchmark, requirements, and changed tests. Blob equality was used only after full main review for unchanged MGA, mission/risk/mining/EPO, Tudat and galactic-tide code. New PFSS and expanded comparison solar model were read partially as stated in §13.

### Appendix C — scripts written

All scripts were temporary and were removed when a concurrent process deleted `.eval/` at 19:43. No project source was modified. Their names and purposes were:

| Ephemeral script | Purpose / key output |
|---|---|
| `.eval/reach.py` and `data_dead_docs/reach.py` | import/worker reachability and LOC, both branches |
| `.eval/numeric_check.ts` | asteroid round-trip, SMBH units/timeline, standard formula round-trips |
| `.eval/perf_check.ts` | catalog/model/asteroid/KBO timing and upload byte count |
| `.eval/agn_probe.ts` | full H29 timeline with instrumented Sun callbacks (`warpImpacts=0`) |
| `.eval/browser_probe.mjs` | >30 s console/network/UI/toggle/pause/H29 browser probe and screenshots |
| `.eval/browser_focus_probe.mjs` | realistic Earth/Pluto focus behavior |
| `.eval/texture_bench.mjs` | browser Sun texture generation timings |
| `frontend_physics/probe.ts` | Kepler, catalog frames, performance, SMBH numeric sweep |
| `frontend_physics/startup_probe.ts` | module startup costs and configuration observations |
| `frontend_physics/asteroid_probe.ts` / `asteroid_data_probe.mjs` | Float32/perturbation/instance-transform and shipped-data calculations |
| `frontend_physics/charon_probe.ts` | internal and Horizons Charon frame comparison |
| `frontend_physics/sunfocus_orbit_probe.ts` | branch frame/secular comparison |
| `data_dead_docs/analyze_acbf.py` | ACBF structure, hashes, IDs, distributions, period/albedo statistics |
| `data_dead_docs/check-roundtrip-{main,sunfocus}.ts` | actual 100k exported round-trip |
| `data_dead_docs/check-taxonomy-{main,sunfocus}.ts` | shipped validator/distribution check |
| `data_dead_docs/tle-loop.mjs` | exact parser-loop survivor counts |
| `data_dead_docs/probe_fetch_jpl.py` | mocked, isolated half-mutation proof |
| backend inline/temporary probes | Lambert residuals, MGA route accounting, flyby mismatch, runner lifecycle, Kuiper rate/payload, CORS/write, refresh single-flight |

Generated `.cjs` bundles were mechanical esbuild outputs of the TS probes, not independent scripts. All quoted outputs needed to reproduce a finding are retained in Appendix A and the finding itself despite loss of raw logs.
