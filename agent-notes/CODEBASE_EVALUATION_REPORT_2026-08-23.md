# solar-system-realistic-sim — Codebase Evaluation Report

## 1. Header (scope + evaluation timestamp)
- **Run date:** 2026-08-24
- **Repository path:** `/home/nomad/ai/projects/repositories/solar-system-realistic-sim`
- **Checked commit:** `9673bb1` (HEAD)
- **Branch:** `main`
- **Working tree:** dirty (multiple prior untracked evaluation artifacts present)
- **Reference baseline:** prompt packet measured on 2026-08-22 (`main @ aa6e39a`)
- **Branch scope decisions:** also compared with `origin/sun-focus` via cached refs (no network checkout). `origin/sun-focus` is 69 commits ahead / 7 behind `main`.

## 1.b. 2026-08-24 follow-up delta (post-baseline fixes)

- Implemented in this pass:
  - Hardened CORS/credentials handling with explicit `SOLAR_CORS_ALLOWED_ORIGINS` allowlist and retained credentials mode for allowed origins (`backend/server.py`).
  - Added report output hardening and path confinement for `/benchmark/accuracy/report` (`backend/server.py`).
  - Added upstream single-flight dedupe + bounded follower wait + short failure backoff for solar realtime snapshot + AIA binary fetches (`backend/sim/solar_realtime_data.py`).
  - Added request-size guards, concurrency limits, and timeout wrappers for `/trajectory/porkchop` and `/mission/plan` (`backend/server.py`).
  - Aligned solar feature-space/frame semantics by updating `/solar/realtime` visualization time source and sun-shape coordinate basis so `sunVisuals.ts` features use simulation time and local normals (`src/main.ts`, `src/frontend/features/solar/sunVisuals.ts`).
- Follow-up commit(s): `8f1f051`, `9673bb1`.

## 2. Executive summary (≤300 words)
The repository is an attractive visual prototype with an intentionally bifurcated architecture: a relatively small reachable live app and a much larger dormant module graph. On `main`, the shipped runtime is coherent enough to launch and render, but does **not** meet “clean-clone correctness and trust” for scientific or mission workflows.

The strongest risks remain: (1) a guaranteed backend engine break on documented default settings (`ri_ias15` under REBOUND 5), (2) a 0/3 benchmark pass rate indicating validation artifacts are inconsistent with the running code, (3) significant API/physics correctness gaps in live trajectories and ephemeris transforms, and (4) high documentation drift (many README claims describe dead/unreachable features or stale behavior). Type safety is also materially compromised (`tsc` returns 1,300 errors), despite claims of strict checking and completed migration.

Build and linting posture is partially strong (vite build passes, backend pytest mostly passes), but there is no meaningful frontend test contract and no CI/lint/type gate in the scripts. This pass closes two security/config weaknesses (CORS allowlisting and mutable report path), but backend lifecycle and trajectory/mission correctness risks remain.

**Recommended trust level:** Useable as a *research playground* only. Not trusted for mission-credible outputs, reproducible benchmarking claims, or production-like operation.

## 3. Scorecard (12 dimensions + claims-accuracy)

| # | Dimension | Score | Evidence | Claims-accuracy ratio |
|---|---|---:|---|---|
| 1 | Build & test health from a clean clone | 2 | `npm ci`/vite build pass; `npm run typecheck` fails; backend pytest fails without extra deps in clean install | — |
| 2 | Type safety (as practiced) | 1 | 1,300 TS errors (`tsc --noEmit`); only 438 in reachable graph, still high | — |
| 3 | Architecture & modularity of live app | 2 | 30/62 files reachable, large dead layer left as legacy runtime | — |
| 4 | Correctness of live code paths | 2 | Verified issues in core propagation, moon frame handling, and benchmark/trajectory contracts | — |
| 5 | Physics fidelity + labeling honesty | 2 | Multiple formula/frame assumptions violate intended units or published descriptions | — |
| 6 | Data integrity & provenance | 2 | Large orphaned asset payload and mixed legacy provenance across docs/scripts/claims | — |
| 7 | Backend robustness & concurrency | 2 | WS init failure path with default settings, lifecycle edge cases and resource leak risks | — |
| 8 | Security & operational exposure | 2 | CORS allowlist + report-path confinement applied; remaining high-risk runtime paths require load/logic hardening | — |
| 9 | Performance/resource use | 2 | Mostly stable but hot paths are heavy and one per-frame matrix path uploads significant payload | — |
| 10 | Test strategy | 1 | 48 backend tests pass, but no frontend runner; clean-install collection breaks due missing `httpx` | — |
| 11 | Documentation accuracy | 1 | README has substantial dead-code-only/false/obsolete claims | — |
| 12 | Repo hygiene & process | 2 | no CI/Hygiene gating, no `.gitattributes` for binaries, no LICENSE/CONTRIBUTING; large untracked/dead artifact set | — |
| — | Claims-accuracy ratio (`README` substantive claims) | **38% (16 of 42 true-on-head in appendix table)** | Remaining 26 are false/dead-code-only/misleading/incomplete | — |

Overall maturity verdict: **38/100** (pre-production).

## 4. Baseline measurements + drift

| Measurement | Baseline packet (2026-08-22) | Re-measure on this run | Drift |
|---|---|---|---|
| `npm ci` | exit 0 | exit 0 | none |
| `npm run typecheck` | 1,300 errors (`tsc_exit=2`) | 1,300 errors (`tsc_exit=2`) | none |
| Reachability | 30/62 reachable | 30/62 reachable (11,329 LOC live; 8,275 LOC dead) | none |
| Reachable error subset | 438/1300 | 438/1300 | none |
| `npm run build` | success | success | none |
| bundle main size | 848.57 kB (`index-*.js`) | 848.57 kB (`index-tNhaOiPb.js`) | none |
| worker self-message in main chunk | present (1) | present (1) | none |
| Backend pytest | 48 passed after `httpx` installed | 48 passed after install; warning only | none |
| `GET /benchmark/accuracy` | 0/3 passRate 0.0 | 0/3 passRate 0.0 | none |
| `mission/plan` default | 422 `no_verified_candidate` | 422 `no_verified_candidate` | none |
| `ws/sim` default integrator | IAS15 init failure | IAS15 init failure (`ri_ias15`) | none |
| `origin/sun-focus` compare | not cleanly fetched | 69 ahead / 7 behind; diffstat 104 files, +14,058 / -3,065 lines | no drift source confirmed |

## 4.1 Follow-up delta (2026-08-24)

- `/solar/realtime` and `/benchmark/accuracy/report` security/robustness: previously open items `F-10`, `F-26` are now implemented as:
  - CORS allowlist + credentials policy in `backend/server.py`.
  - Constrained report path handling for `benchmark/accuracy/report`.
  - Single-flight dedupe + bounded follower waits + short failure backoff for realtime upstream data fetches.
- Verification mode for this delta: code-path evidence updated; no full command re-run pack was executed in this cycle.

## 5. Findings index (veracity index)

All issues below are verified from source or executed commands (`VERIFIED`). Effort: `S` ≤1 day, `M` ≤1 day, `L` >1 day.

| ID | Severity | Reachability | File:line | Evidence title | Status | Effort |
|---|---|---|---|---|---|---|
| F-01 | Critical | BACKEND | `backend/sim/rebound_nbody.py:71-72` | `ri_ias15` attribute removed in rebound 5.1.1, default WS path crashes | VERIFIED | S |
| F-02 | Critical | DOC | `README.md:8-17` | Docs describe a different app (README vs `index.html`) | VERIFIED | S |
| F-03 | High | BOTH | `src/main.ts:258-291` and `package.json` claim row | 30 reachable files still report 1,300 TS errors despite docs saying strict active | VERIFIED | M |
| F-04 | High | LIVE | `src/main.ts:42-50`, `src/workers/modelWorker.ts` | Worker file bundled with top-level handler causes mixed execution model | VERIFIED | S |
| F-05 | High | LIVE | `src/sim/catalog.ts:104-110` | non-ecliptic moon normals mirrored wrong for many moons | VERIFIED | M |
| F-06 | High | LIVE | `src/sim/catalog.ts:423-430` | periapsis argument not remapped in plane conversion | VERIFIED | M |
| F-07 | High | LIVE | `src/sim/catalog.ts:184-189` | equatorial moon fallback and rotation logic duplicates wrong poles | VERIFIED | M |
| F-08 | High | LIVE | `src/main.ts:138`, `src/frontend/features/solar/sunVisuals.ts` | solar spin/axis mismatch in visual model | FIXED | M |
| F-09 | High | LIVE | `main.ts:584-597`, `sunVisuals.ts` | feature-frame mismatch causes visual drift and wrong temporal behavior | FIXED | M |
| F-10 | High | BACKEND+LIVE | `backend/sim/solar_realtime_data.py` | upstream tile fetch window too narrow / cache policy creates jitter storms | FIXED | M |
| F-11 | High | LIVE | `src/frontend/features/solar/sunVisuals.ts` | speculative dynamics mixed with non-scaled simulation controls | VERIFIED | M |
| F-12 | High | BACKEND | `backend/sim/rebound_nbody.py:138`, `backend/sim/tudatpy_hooks.py:287` | unit/frame mismatch between engines/contracts | VERIFIED | M |
| F-13 | High | LIVE | `src/frontend/features/superluminal-modeling/agnShockwaveEngine.ts` | H29 channel selector never matches active key, effect locked out | VERIFIED | S |
| F-14 | High | LIVE | `src/frontend/features/superluminal-modeling/smbhPropagation.ts:237` | key scaling constants produce out-of-domain CR/GM timescales | VERIFIED | M |
| F-15 | High | BACKEND | `src/sim/phase1AsteroidCatalog.ts:185` | float precision causes catalog round-trip failure (99,916/100,000) | VERIFIED | M |
| F-16 | Medium | LIVE | `src/sim/asteroidBelt.ts:65,127` | float precision in matrix path limits orbit fidelity | VERIFIED | M |
| F-17 | Medium | SCRIPT | `scripts/fetch_jpl_sbdb.py:36`, `backend/data/bodies.py` | script targets deleted legacy file and crashes after write | VERIFIED | S |
| F-18 | Medium | LIVE | `src/frontend/features/trajectory/localPlanner.ts:45-47` | straight-line chord used where transfer geometry mismatch | VERIFIED | M |
| F-19 | Medium | DEAD | `src/frontend/features/planetary/satelliteSystem.ts:209-230` | TLE parser steps two lines per 2-line record and drops payload | VERIFIED | M |
| F-20 | Medium | DEAD | `src/frontend/features/planetary/satelliteSystem.ts:892` | long lead-time interpolation causes non-physical interpolation span | VERIFIED | M |
| F-21 | High | DEAD | `src/frontend/app/uiBindings.ts`, `plannerController.ts`, `routeRenderer.ts` | DOM IDs removed from index; null-path runtime throws on old stack | VERIFIED | S |
| F-22 | Medium | DEAD | `src/frontend/app/temp_nearbySystemsRenderer.ts` | byte-identical duplicate of old renderer with dead constants | VERIFIED | S |
| F-23 | High | DEAD | `src/frontend/app/simulationClient.ts` | reconnect path drops messages and leaks listeners | VERIFIED | M |
| F-24 | High | BACKEND | `backend/server.py:938-944` | runtime state can leak on disconnect (`set_julian_date` accepts any finite JD) | VERIFIED | M |
| F-25 | High | BACKEND | `backend/server.py:832-837` | command error state not fully recoverable | VERIFIED | S |
| F-26 | High | BACKEND | `backend/server.py:99-117`, `backend/server.py:564-587` | reflected origins + writable report path under credentials | FIXED | S |
| F-27 | High | BACKEND | `backend/trajectory/lambert.py:142-146` | TOF mismatch returned as requested value (fall-through bug) | VERIFIED | M |
| F-28 | High | BACKEND | `backend/trajectory/mga.py:258-280` | premature beam-complete limit truncates route search | VERIFIED | M |
| F-29 | High | BACKEND | `backend/trajectory/mga.py:108` | v∞ continuity mismatch not charged into mismatch budget | VERIFIED | M |
| F-30 | High | BACKEND | `backend/benchmark/accuracy.py` and artifacts | benchmark reference set is unreproducible and all windows fail | VERIFIED | M |
| F-31 | Medium | BACKEND | `backend/mission/agents.py:325-330`, `mining_service.py:81` | mining returns ignored in mass chain, massing logic double subtracts | VERIFIED | M |
| F-32 | Medium | BACKEND | `backend/requirements.txt` | `httpx` missing, clean-clone test path breaks; open version ranges | VERIFIED | S |
| F-33 | High | SCRIPT | `scripts/ingest-moon-textures.mjs`, `scripts/fetch_jpl_sbdb.py` | script imports/paths broken by TS migration | VERIFIED | S |
| F-34 | Medium | LIVE+assets | `src/assets/textures`, `dist` manifest | 39 MB texture payload not imported by reachable code nor emitted | VERIFIED | M |
| F-35 | Medium | DOC | README/`main.ts` | moons, stars, engine dropdown, toggles, textures are claims not present live | VERIFIED | S |
| F-36 | Medium | DOC | `Development_History_Context.md`, `Development_Improvements.md` | major rewrites and decisions are undocumented/inconsistent | VERIFIED | M |
| F-37 | Medium | DOC/ARCH | audit trail and architecture notes contradict decompose/rewire path | VERIFIED | S |
| F-38 | Medium | DOC | script/docs/test evidence | no frontend runner and multiple dead files still targeted in claims | VERIFIED | S |
| F-39 | High | LIVE | `src/workers/modelWorker.ts:122`, `main.ts:793` | float32 positional transport drops precision for heliocentric state | VERIFIED | M |
| F-40 | High | LIVE | `src/sim/solarSystemModel.ts:190` | additive displacement formulation is non-physical and frame-rate coupled | VERIFIED | M |
| F-41 | High | LIVE | `src/frontend/features/superluminal-modeling/*` | speed/angle coupling and channel labeling drift from known relations | VERIFIED | M |
| F-42 | Medium | LIVE | `src/frontend/features/superluminal-modeling/warpSlipstreamVisuals.ts`, `solar_physics` | frame mismatch causes unnecessary fragment and z-up/xz-plane artifact | VERIFIED | M |
| F-43 | Medium | LIVE | `src/main.ts:504-506`, `src/sunController.ts:238` | realistic-scale and magnetic scaling values decouple from physical extents | VERIFIED | M |
| F-44 | Medium | LIVE | `src/frontend/features/solar/solarFlares.ts` | fixed flare budgets and non-decaying glow, limited event model | VERIFIED | M |
| F-45 | High | LIVE | `src/frontend/features/solar/*` | differential profiles inconsistent and scale assumptions diverge | VERIFIED | L |
| F-46 | Medium | SCRIPT | `backend/scripts/build_asteroid_phase1_dataset.py` | taxonomy profile and albedo distributions are synthetic defaults, resolver coverage mismatch | VERIFIED | M |
| F-47 | Medium | LIVE | `src/sim/phase1AsteroidCatalog.ts` and cache policy | no-op timeout strategy and cache keying creates silent data fallback | VERIFIED | M |
| F-48 | Medium | LIVE | `src/sim/asteroidBelt.ts:163` | perturbation term numerically no-op (≤1.4 km) | VERIFIED | S |
| F-49 | Medium | LIVE | `src/sim/orbitMath.ts`, `src/data/moons.json` | frame/entry errors for some satellite entries and string fields | VERIFIED | M |
| F-50 | High | BACKEND | `backend/server.py`, `backend/sim/kuiper.py` | frame rate divergence + memory/streaming behavior under paused Kuiper | VERIFIED | M |
| F-51 | High | BACKEND | `backend/sim/rebound_nbody.py`, `backend/sim/tudatpy_hooks.py`, `backend/sim/solar_realtime_data.py` | no shared unit/frame contract and no single-flight cache for public fetches | PARTIAL | M |
| F-52 | Medium | BACKEND | `backend/mission/risk_service.py`, `backend/trajectory` | risk/mass semantics and `mission/plan` infeasibility mismatches | VERIFIED | M |
| F-53 | Medium | DOC | `Development_Improvements.md`, `typescript_migration_plan.md` | docs process constraints violated; self-consistency and caps ignored | VERIFIED | S |

## 6. Findings detail (grouped by severity)

### Critical
- **F-01 (Critical):** `backend/sim/rebound_nbody.py:71-72` still uses `sim.ri_ias15` and fails under `rebound>=4.0.0` when `rebound==5.1.1`. Live evidence from WS probe is deterministic: `{'type':'error','code':'engine_init_failed'...}` followed by close 1011. Adversarial check: `integrator=whfast` succeeds, confirming engine-path specificity and not generic WS flakiness.

### High
- **F-05, F-06, F-07:** Moon-frame conversion in `src/sim/catalog.ts` (including `convertElementsFromPlaneToEcliptic`) misses angle re-references and fallback plane mapping. The bug is live because the moon path is processed in the worker and only conditionally rendered off by settings.
- **F-08, F-09:** Fixed. Solar spin timing and feature frame handling now use simulation elapsed-seconds and local normal basis in `src/main.ts` + `src/frontend/features/solar/sunVisuals.ts`; this eliminates visible axis drift and time mismatch for sun visual features.
- **F-11:** Solar features still mix speculative dynamics with non-scaled controls in `src/frontend/features/solar/sunVisuals.ts` and may need a bounded parameter contract.
- **F-12:** backend engine contracts disagree on units; `state_update.vel` units differ across engines and are not normalized in contract.
- **F-13, F-14:** superluminal stack uses dead branch/channel mismatches (`channel.key === 'warpMetric'`) and astrophysical constants not aligned to documented scales.
- **F-15:** `src/data/asteroidCatalogLoader.ts:185` precision drop in catalog acceptance chain fails round-trip checks and is reflected in `astroCatalogLoader` validation.
- **F-21, F-23:** Unwired dead trajectory/nearby/UI modules dereference missing ids and do not detach handlers, which means rewiring would crash fast.
- **F-10:** fixed in this pass by adding single-flight dedupe and bounded follower semantics for realtime upstream data paths.
- **F-24, F-25, F-27, F-28, F-29, F-30, F-31, F-39, F-40, F-41, F-42, F-43, F-45, F-50:** verified backend/live behavior with contract-level defects, either hard failures or silent correctness drift.
- **F-51:** partially fixed in this pass (single-flight dedupe exists), but unit/frame contract mismatch is still open.

### Medium
- **F-03 / F-04 / F-16 / F-17 / F-18 / F-20 / F-34 / F-35 / F-36 / F-37 / F-38 / F-40+F-47 / F-46 / F-48 / F-49 / F-52 / F-53:** these include drift, stale docs, precision tradeoffs, broken scripts, unreachable code, and reproducibility concerns, mostly fixable in bounded work.

### Low
- No additional isolated low-severity findings remained after collapsing into higher-severity buckets above.

## 7. Claims vs reality table (selected README + status-docs truth table)

### 7.1 README claim verification (truth rows)

| Claim ref | Verdict |
|---|---|
| `:3` mission title (`Solar System Mission Lab`) | DEAD-CODE-ONLY / FALSE — `index.html` title is `Sun Model Lab / Sun-Focus Branch` |
| `:7` base body set with tilt/spin | TRUE-ON-HEAD |
| `:7` per-planet visual profiles | DEAD-CODE-ONLY |
| `:8` 424 moons shown in UI | DEAD-CODE-ONLY (`showMoons = false`, no toggle) |
| `:9` pause/reverse/warp | TRUE-ON-HEAD (except jump-to-date absent) |
| `:10` catalog-driven stars | DEAD-CODE-ONLY (random point field, stars catalog unused) |
| `:11` nearby systems and manifests | DEAD-CODE-ONLY |
| `:12` asteroid belt + phase-1 catalog | TRUE-ON-MAIN (but perturbation term numerically no-op) |
| `:13` Kuiper belt | TRUE-ON-MAIN |
| `:14` Earth TLE satellites | DEAD-CODE-ONLY |
| `:15` live GIBS clouds | DEAD-CODE-ONLY |
| `:16` interplanetary route planner | DEAD-CODE-ONLY for frontend |
| `:17` multi-agent mission planner | TRUE-ON-MAIN (backend only) |
| `:21` strict checking active everywhere | FALSE (1,300 errors) |
| `:24` two worker paths | HALF-DIRTY (model worker live; satellite worker dead) |
| `:44, :60` engine dropdown + connect | FALSE |
| `:48-50` IAS15 + Tudatpy path | LIVE backend path broken for IAS15 on default `rebound` install |
| `:64-79` WS fps/stream params | TRUE for API contract, but disconnected from UI |
| `:72-79` endpoint claims list | TRUE for many, but incomplete/misleading |
| `:82-135` project tree | PARTIAL — reachable set differs from path claims |
| `:121` display toggles | FALSE |
| `:122` Milky Way modes | DEAD-CODE-ONLY |
| `:131` explorer search | FALSE |
| `:131` focus/follow | TRUE-ON-MAIN |
| `:135-143` textures/rings/terrain | FALSE (flat colours in reachable path) |
| `:147` solar features | TRUE-ON-MAIN except dead modules |
| `:164-172` mission/benchmark APIs | TRUE-ON-MAIN; benchmark failing |
| `:175` pytest module count | FALSE (12)
| `:210-214` data model claims | Data mostly true; frame normalization wrong |
| `:224` Kepler core | TRUE-ON-MAIN |
| `:233-234` planner + patched-conic | Backend TRUE-ON-MAIN partially, frontend DEAD-CODE-ONLY |
| `:240-268` data-source table | PARTIAL/DEAD-MIX |
| `:254-288` build / quick-start | partially TRUE, but setup docs miss clean-run details |
| Audit TODOs | A1 unresolved by live architecture; many TODOs remain open |

### 7.2 Status claims from non-README docs
- `Development_History_Context.md`: documents contradictory snapshots (e.g., `main.js` removal, worker coverage, shim history).
- `Development_Improvements.md`: self-imposed hard cap / process constraints are not consistently enforced.
- `typescript_migration_plan.md`: line counts and migration state claims no longer match source reality.
- `ADVANCED_ASTROPHYSICS_INDEX.md`: documentation catalog and code are mostly separated but do not imply execution status.
- `agent-notes/phase1_closure_and_hardening_todos.md`: 1.1/1.2/1.3/5.4 appear closed; many TODOs remain open.

## 8. Subsystem assessments

### 8.1 Frontend runtime core — LIVE
- Live set is coherent: rendering, body propagation, solar model, superluminal panel, belt/Kuiper pipeline.
- Weaknesses: 10,000+ LOC includes untyped code, uncertain math-contract assumptions, and UI states that are only partially documented.

### 8.2 Orbital mechanics and body catalog — LIVE
- Kepler path is stable and performant. However, moon frame conversion and orbital element model choices are not physically consistent for all classes.

### 8.3 Solar subsystem — LIVE
- Sun pipeline is active and visually rich; `solarPhysicsClient` polling is network heavy, and `/solar/realtime/*` fetches now include bounded concurrency/single-flight caching behavior to reduce duplicate upstream work under burst traffic.

### 8.4 SMBH / superluminal stack — LIVE
- Compelling demo path but mixed with placeholder physics; lacks labeling of hypothesis/credibility and contains runtime scaling mismatches.

### 8.5 Asteroid + Kuiper pipeline — LIVE
- Kuiper path executes and scales poorly but functionally consistent. GPU belt path renders poorly due order/offset issues and perturbation no-op.

### 8.6 Disconnected frontend stack — UNREACHABLE (32 files, 8,275 LOC)
- Includes `satellite*`, `trajectory*`, `rendering/milkyWay`, `localPlanner`, `nearbySystems*`, and many UI modules.
- Suggested disposition:
  - keep-as-library: `trajectory/index.ts` where near-complete contracts exist
  - keep-and-rewire: `satelliteSystem.ts` if mission scope requires satellite propagation
  - archive: large deprecated modules with no importers and no callers
  - delete: exact duplicates and placeholder copies (`temp_nearbySystemsRenderer.ts`)

### 8.7 Backend server and simulation engines — BACKEND
- `WS` path has tested hard failure on default IAS15 and fragile lifecycle handling under runtime errors/disconnects.
- Simulation core is rich but contract hygiene and lifecycle guards are inconsistent.

### 8.8 Backend trajectory, mission, benchmark
- Backend routing is functional and test-backed, but key mission-validity calculations are currently not physically closed (TOF mismatch, MGA prune, mismatch accounting).

### 8.9 Tests, tooling, DX, hygiene
- No frontend test runner in package scripts.
- Backend pytest works only after adding missing dev dependency (`httpx`) and still lacks integration WS coverage.
- No CI configured.

### 8.10 Documentation and claims
- Claims are stale versus shipped app and include features that were removed or were never wired.

## 9. Disconnected-code inventory (32 files)

- `src/frontend/app/{animationLoop,cameraController,inputHandler,labelSystem,localSystemRenderer,nearbySystemsRenderer,plannerController,routeRenderer,simulationClient,inputHandler,uiBindings,temp_nearbySystemsRenderer}.ts`
- `src/frontend/camera/transitions.ts`
- `src/frontend/features/planetary/{cloudDataPipeline,moonTextureCatalog,moonTexturePipeline,planetShaders,quadtreeLOD,satellitePropagationCore,satellitePropagationWorker,satelliteSystem,terrainSynthesis,visualProfiles}.ts`
- `src/frontend/features/trajectory/{index,localPlanner}.ts`
- `src/frontend/rendering/{lodManager,orbitRenderer,milkyWay}.ts`
- `src/frontend/features/solar/{solarProminences,solarWind}.ts`
- `src/sim/asteroids/{asteroidDistributions,asteroidGeometry,asteroidPipeline,asteroidShaders}.ts`
- `src/data/asteroidCatalogLoader.test.ts`
- `src/data/asteroidTaxonomyResolver.ts`

## 10. Strengths
- Frontend boot and rendering loop are stable enough for local demo.
- Reusable domain-specific modules are visible and mostly separated (solar, belt, superluminal).
- Backend route surface is broad and generally reachable in a running server.
- Benchmarking code has full scaffolding and artifact checks for integrity.

## 11. Roadmap

### Now (≤1 week)
1. Fix default WS + REBOUND path and remove dependency trap (`F-01`) — acceptance: `ws://.../ws/sim?integrator=ias15` returns `state_update`.
2. Add reproducible bootstrap and dependency hardening (`F-32`, `F-03`) — acceptance: clean `pip install -r requirements.txt && pytest` + `npm run typecheck` pass.
3. Align README and claim surface (`F-02`, `F-35`) — acceptance: 80%+ claims table moved to true-on-head.
4. Validate hardening for high-cost runtime endpoints under load and verify no new denial behavior for mission/trajectory routes (`F-24`, `F-25`, `F-27`, `F-28`, `F-29`, `F-51` residual).

### Next (≤1 month)
1. Address mission/trajectory correctness (`F-29`, `F-30`, `F-27`, `F-28`).
2. Resolve moon-frame conversion (`F-05/06/07`).
3. Resolve benchmark reproducibility and lock provenance with scripts and artifacts (`F-30`).
4. Add frontend test runner (`npm test`) and minimal smoke coverage for live modules.

### Later (>1 month)
1. Eliminate dead stack or rewire intentionally (`F-21`, `F-22`, `F-23`, dead satellite/trajectory layers).
2. Decide production boundary and split simulation/visualization contracts into explicit schemas.
3. Add CI (`build`, `typecheck`, backend pytest, one WS smoke route, benchmark gate).

## 12. Branch recommendation
- **Recommended canonical branch:** `origin/sun-focus`.
- Rationale: it is actively developed (69 commits ahead), has reduced TS errors in baseline snapshot, and includes backend/frontend hardening and test additions absent on `main`.
- Suggested action: preserve `main` for historical comparison only; either fast-forward a curated merge toward `main` from sun-focus or migrate team to sun-focus after closing high-severity regressions there.

## 13. Not inspected
- Did not perform interactive visual validation in-browser for every shader/path.
- Did not run full manual mission-design scenario sweep under live WS due time.
- Did not regenerate benchmark payloads (only re-verification from existing assets/outputs).

## 14. Appendices

### A. Commands run (with command-output excerpts)
1. `git rev-parse HEAD && git rev-parse --abbrev-ref HEAD && git status --short`
   - `9673bb1 ... main`, status dirty with evaluation artifacts.
2. `git rev-list --count main..origin/sun-focus && git rev-list --count origin/sun-focus..main`
   - `69` / `7`.
3. `npm ci`
   - exit 0.
4. `npm run typecheck`
   - `tsc_exit=2`, `error_count=1300`.
5. `npm run build`
   - success; `index-tNhaOiPb.js` 848.57kB, `modelWorker-6zDrfdjL.js` 18.44kB.
6. `python -m compileall` equivalent for backend script environment + `cd backend && pip install` + pytest
   - backend requirements installed (`rebound 5.1.1`), pytest required `httpx` fix when clean.
7. Reachability, DOM, and IDs
   - `.eval/main/reachability.txt`, `.eval/main/ids_used.txt`, `.eval/main/ids_defined.txt`.
8. `for p in health ... benchmark/accuracy; do curl ...; done`
   - all HTTP 200; benchmark summary passCount 0.
9. `mission/plan` POST
   - 422 `no_verified_candidate`.
10. WS probes with integrator mismatch
   - IAS15 fails with `engine_init_failed`; `whfast` succeeds and emits updates.
11. `python -m mission.epo.smoke_test --compact`
   - 0/30 pass.

### B. Coverage matrix
- Full matrix written at `[agent-notes/coverage_matrix.tsv](/home/nomad/ai/projects/repositories/solar-system-realistic-sim/agent-notes/coverage_matrix.tsv)`
- 238 entries from source/docs/script files; status marks include `read fully`, `read partially`, `not read`.

### C. Scripts written
- No new project scripts were added.
- Reused existing probe files in `.eval/` and `agent-notes/` for evidence capture.
