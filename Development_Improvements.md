# Development Improvements

## 1) Instruction Layer
This file is a rolling, timestamped log for suggestions, improvements, candidate fixes, known problems, and forward-looking development ideas.

Purpose:
- Keep a high-signal backlog of improvement opportunities.
- Capture problems and proposed solutions before and after implementation.
- Preserve context for future planning and prioritization.

Scope boundaries:
- Include ideas, bug hypotheses, optimization opportunities, architecture improvements, UX suggestions, and technical debt notes.
- Include both implemented and unimplemented items, clearly marked by status.
- Exclude verbose discussion transcripts and duplicate notes from other files.

Maintenance rules:
- Keep entries in reverse chronological order (newest first).
- Use UTC timestamps in `YYYY-MM-DD HH:MM:SS UTC`.
- Keep entries concise, actionable, and file-aware.
- Prefer append-only updates; only edit old entries for factual corrections or status changes.
- Do not modify this instruction layer unless process rules change.

Entry status values:
- `OPEN`: Identified, not started.
- `IN-PROGRESS`: Being implemented/evaluated.
- `DONE`: Completed and validated.
- `BLOCKED`: Cannot proceed due to dependency/constraint.
- `DEFERRED`: Valid idea, postponed intentionally.

Rolling size control:
- Soft target: keep file under `35 KB` or `350` lines.
- Hard cap: if file exceeds `48 KB` or `500` lines, prune oldest entries from the bottom.
- Prune notes only; never prune the instruction layer.
- Preserve unresolved high-priority `OPEN` / `BLOCKED` entries where possible.
- After pruning, add one line noting prune date/time and approximate entries removed.

Entry template (use this order):
- Timestamp
- Status
- Type (`IDEA`, `PROBLEM`, `FIX`, `OPTIMIZATION`, `ARCHITECTURE`, `UX`, `TECH-DEBT`)
- Summary
- Context / rationale
- Proposed approach
- Expected impact
- Affected files/systems
- Next step

## 2) Improvements Log (Rolling)

Maintenance 2026-10-24 19:58:33 UTC: archived 30 historical DONE entries from this rolling view; [complete pre-prune snapshot](agent-notes/archives/Development_Improvements.pre-cap-2026-10-24.md) preserves all 46 original entries. The 11 OPEN, 4 IN-PROGRESS and 1 DONE (partial) entries below retain their original order, statuses and timestamps; historical status/time accuracy has not been revalidated.
### 2026-03-07 ~08:00 UTC
Status: `IN-PROGRESS`
Type: `TECH-DEBT`
Summary:
- Removed `// @ts-nocheck` from all 41 source files and began adding proper type annotations.

Context / rationale:
- The comprehensive codebase audit identified `@ts-nocheck` across 41 files as the single biggest systemic issue, disabling all compile-time type safety for the majority of the frontend. This was the #1 critical finding.

Proposed approach:
- Phase 1 (DONE): Remove `@ts-nocheck` from all files.
- Phase 2 (IN-PROGRESS): Add proper type annotations file by file, starting with simulation and rendering modules, then features, then app orchestration.
- Phase 3 (OPEN): Fix remaining type errors in the largest files (`satelliteSystem.ts`, `sunController.ts`, `cloudDataPipeline.ts`, `main.ts`).

Expected impact:
- TypeScript now catches null dereferences, wrong argument types, and property access errors at compile time across the entire codebase.
- ~15 files fully typed so far; ~30 files still need annotations.

Affected files/systems:
- All 41 previously `@ts-nocheck` files in `src/`
- New interfaces added in `sim/asteroids/`, `frontend/rendering/`, `frontend/features/solar/`, `frontend/features/planetary/`, `frontend/features/trajectory/`

Next step:
- Continue adding type annotations to remaining files, prioritizing the largest error counts: `satelliteSystem.ts` (311 errors), `sunController.ts` (109), `cloudDataPipeline.ts` (91), `smbhPropagation.ts` (81), `main.ts` (72).

### 2026-03-07 ~08:00 UTC
Status: `OPEN`
Type: `PROBLEM`
Summary:
- Comprehensive codebase audit identified 23 issues; critical and high-severity items fixed, medium/low items tracked here.

Context / rationale:
- Full inspection of all `src/`, `scripts/`, and `src/workers/` files performed. Findings categorized by severity.

Proposed approach:
- Track remaining medium/low issues for future passes:
  1. **1.925M synchronous asteroid generation** (`asteroidPipeline.ts`): `async initialize()` has no `await`; blocks main thread for seconds. Should use chunked processing or a web worker.
  2. **`new Color()`/`new Vector3()` in hot loops**: `beltRenderer.ts:311` and `asteroidPipeline.ts` allocate throwaway objects per instance. Reuse module-level temporaries.
  3. **`resizeRenderer()` every frame** (`main.ts`): includes `setPixelRatio()` each frame. Should only fire on actual window resize.
  4. **No resource cleanup on teardown**: No `dispose()` calls for textures, geometries, materials, or the web worker on page unload.
  5. **Duplicated utilities**: `mulberry32` (3 copies), `clamp` (3 copies), `lerp` (2 copies), `solveKeplerFast` (2 copies), `disposeThreeMaterial` (2 copies). Should consolidate.
  6. **Dead code**: `temp_nearbySystemsRenderer.ts` (~1129 lines, mostly commented-out archive). `asteroidCatalogLoader.test.ts` is not a real test.
  7. **Typo**: `ALCBEO_SCALE_U16` in `asteroidCatalogLoader.ts:55` should be `ALBEDO_SCALE_U16`.
  8. **BFS uses `Array.shift()`** in `solarSystemModel.ts:80` — O(n) per call.
  9. **`Math.random()` in `asteroidDistributions.ts`** makes GPU asteroid pipeline non-deterministic, inconsistent with seeded PRNG elsewhere.
  10. **`const enum` in `asteroidTaxonomyResolver.ts`** erased at compile time; breaks cross-bundle imports.
  11. **Fragile `onBeforeCompile` shader patching** in `beltRenderer.ts` — will break silently on Three.js updates.

Expected impact:
- Items 1-4 affect performance and memory in long sessions. Items 5-6 are maintainability debt. Items 7-11 are correctness and fragility risks.

Affected files/systems:
- `src/sim/asteroids/asteroidPipeline.ts`, `src/frontend/features/asteroids/beltRenderer.ts`, `src/main.ts`, `src/sim/asteroidBelt.ts`, `src/sim/kuiperBelt.ts`, `src/data/asteroidCatalogLoader.ts`, `src/sim/solarSystemModel.ts`, `src/data/asteroidTaxonomyResolver.ts`, `src/frontend/app/temp_nearbySystemsRenderer.ts`

Next step:
- Prioritize synchronous asteroid generation offload (item 1) and resource cleanup (item 4) for next pass.

### 2026-03-07 05:56:36 UTC
Status: `OPEN`
Type: `ARCHITECTURE`
Summary:
- Asteroid ingestion currently has two binary paths: legacy runtime `ASPH` loading and new compact `ACBF` packing utilities.

Context / rationale:
- The new compact loader was intentionally delivered without touching fetch logic or taxonomy rules.
- That preserves ownership boundaries, but it leaves the runtime on `src/sim/phase1AsteroidCatalog.ts` while the new format lives in `src/data/asteroidCatalogLoader.ts`.

Proposed approach:
- Pick one canonical on-disk asteroid format, add checksum/version metadata at the dataset layer, and move the runtime loader onto that single contract.

Expected impact:
- Removes schema drift risk between offline dataset generation, runtime ingestion, and future mission-target promotion APIs.

Affected files/systems:
- `src/sim/phase1AsteroidCatalog.ts`
- `src/data/asteroidCatalogLoader.ts`
- `scripts/build_asteroid_phase1_dataset.py`
- `public/data/asteroid-phase1/*`

Next step:
- Fold this into Stage 3 Data Pipeline work when fetch integration and taxonomy enrichment are allowed to change together.

### 2026-03-07 05:47:00 UTC
Status: `IN-PROGRESS`
Type: `ARCHITECTURE`
Summary:
- TypeScript migration in `src` is functionally complete. `@ts-nocheck` has been removed from all files. Worker contracts and type hardening are in progress.

Context / rationale:
- As of 2026-03-07 ~08:00 UTC, all `// @ts-nocheck` directives have been removed and ~15 files have full type annotations. ~30 files still need annotations.
- `src/workers/modelWorker.ts` provides an off-thread solar-system model propagation path with typed message contracts.
- The runtime still uses a mostly monolithic `requestAnimationFrame` loop in `src/main.ts`.

Proposed approach:
- Complete type annotation work across remaining ~30 files (see IN-PROGRESS entry above).
- Normalize the runtime around a single frame scheduler and add phase-level timing instrumentation.
- Introduce additional typed worker contracts for `sunWorker`, `smbhWorker`, and `asteroidWorker`.

Expected impact:
- Full compile-time type safety across the entire codebase.
- Lower main-thread frame pressure via additional worker offload.

Affected files/systems:
- All `src/**/*.ts` files (type annotations)
- `src/main.ts`, `src/frontend/app/animationLoop.ts` (frame scheduler)
- `src/sunController.ts`, `src/frontend/features/solar/*`, `src/frontend/features/superluminal-modeling/*`, `src/sim/asteroids/*` (worker candidates)

Next step:
- Finish type annotations for the largest remaining files, then implement sun and asteroid worker offload.

### 2026-03-12 UTC
Status: `IN-PROGRESS`
Type: `ARCHITECTURE` / `FIX`
Summary:
- Implementing DEM (Differential Emission Measure) channel response system for the solar corona, a new transition region atmospheric shell, and physics fixes for the heliospheric current sheet tilt and Parker spiral geometry.

Context / rationale:
- The AIA channel selector UI (added 2026-02-18) allowed channel switching but the corona rendered identically regardless of channel — a "false color skin" only. Real SDO/AIA channels are bandpass filters responding to plasma at specific temperatures; the same coronal structure looks dramatically different at 094Å vs 304Å because different ions dominate at different temperatures.
- The transition region (TR) between chromosphere and corona is one of the most scientifically interesting layers of the solar atmosphere: temperature jumps 50× over ~100 km. It is the primary emission source for AIA 304Å (He II) and was the only major atmospheric layer not rendered.
- The backend HCS tilt peaked at ~22° instead of the observed ~75° at solar maximum, producing unrealistically flat Parker spiral geometry.

Proposed approach:
- **DEM Channel Response (GLSL):** Gaussian instrument response `demChannelResponse(T_MK, channelId)` based on Lemen et al. 2012 peak temperatures and widths. Modulates corona alpha so hot channels (094Å) suppress cool plasma and vice versa.
- **AIA False-Color Override:** When a channel is active, tint corona to standard SDO false-color mapping (green/blue-white/brown-gold/purple/red) at 65% blend weighted by DEM response.
- **Transition Region Shell:** New `BackSide` additive-blended sphere at 1.006× R☉ with limb brightening (`pow(1-μ, 2.8)`), supergranulation network texture, and channel-dependent visibility (304Å dominant, 094Å invisible).
- **DEM-Aware Coronal Loops:** Each AIA channel modifies loop color and opacity — e.g., 094Å shows only flare-heated loops, 171Å highlights quiet corona, 304Å dims everything (loops are too hot for He II).
- **HCS Tilt Fix:** Polynomial `7.25 + 67.75 * activity^1.8` clamped [7°, 75°] from Wilcox Solar Observatory data. Removed 0.16× latitude damping so spiral arms show full tilt excursion.

Expected impact:
- Switching AIA channels now produces visually distinct, physically meaningful views of the corona — matching what solar physicists actually see on SDO imagery.
- The transition region adds a new atmospheric feature especially dramatic in 304Å mode.
- Parker spiral geometry becomes physically accurate across the full solar cycle range.

Affected files/systems:
- `src/frontend/features/solar/sunVisuals.ts` — DEM shader, TR shell, channel-aware loops
- `backend/sim/solar_physics.py` — HCS tilt, Parker spiral latitude
- `src/sunController.ts` — TR wiring, activeChannel threading

Next step:
- Commit and build-validate. Extend DEM response to the photosphere shader. Add dedicated TR geometry for finer resolution.

### 2026-03-09 UTC
Status: `OPEN`
Type: `IDEA`
Summary:
- Solar corona physics engineering plan — roadmap for DEM-aware rendering and atmospheric layer completion.

Context / rationale:
- Created a detailed engineering plan document (in `my-notes/`) outlining the technical approach for implementing Phase 13 items that were deferred from the 2026-02-23 Sun physics overhaul: DEM-aware AIA channel rendering, transition region shell, irradiance variability model, and coronal loop temperature stratification.

Proposed approach:
- Plan specifies implementation order: (1) DEM channel response function in GLSL, (2) transition region shell, (3) channel-aware coronal loop coloring, (4) photospheric DEM response, (5) irradiance variability from activity/sunspot coverage.
- DEM work partially started in the 2026-03-12 uncommitted changes.

Expected impact:
- Guides structured implementation of the remaining Sun model improvements without ad-hoc scope creep.

Affected files/systems:
- `my-notes/` — engineering plan document
- Future: `sunVisuals.ts`, `solar_physics.py`, `sunController.ts`

Next step:
- Continue implementation per plan. First two items (DEM shader + TR shell) are in progress.

### 2026-03-09 UTC
Status: `OPEN`
Type: `IDEA`
Summary:
- Brainstorming: channel-specific coronal heating diagnostics and observation-comparison mode.

Context / rationale:
- With DEM channel response now being implemented, there is an opportunity to add a split-screen or overlay mode where the synthetic corona can be compared side-by-side with actual SDO/AIA imagery. This would serve both as validation tooling and an educational feature.
- Additionally, the per-channel temperature response data could be exposed as an interactive DEM plot (emission measure vs. temperature) that updates in real time as the user orbits the Sun.

Proposed approach:
- **Split-screen mode:** Divide the Sun view into left (synthetic) and right (SDO observation) halves, synchronized by channel and rotation angle.
- **Interactive DEM curve:** Small overlay chart showing the Gaussian response curves for all 5 channels, with a vertical marker at the current corona region's estimated temperature.
- **Temperature map overlay:** False-color the corona by estimated temperature (from the radial profile) rather than by channel response, toggled via a "T-map" checkbox.

Expected impact:
- Significant educational value — users can see why different channels reveal different structures.
- Validation path for the DEM model against real data.

Affected files/systems:
- `index.html` — UI controls for split/overlay mode
- `src/frontend/features/solar/sunVisuals.ts` — temperature map shader variant
- `src/frontend/features/solar/solarObservationTexture.ts` — synchronized SDO tile loading

Next step:
- Prototype split-screen as a shader uniform toggle before committing to a full canvas split.

### 2026-03-07 UTC
Status: `DONE` (partial)
Type: `FIX`
Summary:
- GPU memory cleanup on session teardown now implemented via `beforeunload` handler.

Context / rationale:
- Previously tracked as item 5 in the 2026-02-23 OPEN problem list: "No GPU memory cleanup (`geometry.dispose()`, `material.dispose()`) when toggling feature systems or switching between solar/local system views."
- The `beforeunload` handler addresses session-end cleanup. Feature-toggle and view-switch cleanup remains open.

Proposed approach:
- Handler disposes: web worker, belt renderers, body mesh geometries/materials, orbit line geometries/materials, label sprite materials/maps, background star geometry, sun texture, and WebGL renderer.

Expected impact:
- Prevents GPU memory leaks across page refreshes and tab closures.
- Does not yet address mid-session cleanup during feature toggling.

Affected files/systems:
- `src/main.ts`

Next step:
- Add dispose calls when toggling asteroid/Kuiper/Oort visibility or switching between solar/local system views.

### 2026-02-23 UTC
Status: `OPEN`
Type: `PROBLEM`
Summary:
- Identified additional non-solar issues from codebase sweep requiring future attention.

Context / rationale:
- Deep code analysis revealed several moderate-priority issues not addressed in this pass.

Proposed approach:
- Track remaining items:
  1. `applyScaleMode` ring scaling uses `body.displayRadiusAu` at geometry creation time then applies a `ringFactor` scalar at runtime — works correctly but is fragile; should use `bodyRenderRadiusAu()` directly at creation.
  2. Moon texture loading has a potential race condition — procedural texture set immediately, then async curated texture replaces it without checking if the material was disposed.
  3. Earthshine phase calculation uses a simplified dot-product model that may not match actual lunar phase geometry.
  4. Asteroid detail N-body perturbation integration doesn't validate Jupiter/Saturn mass data before use (potential NaN).
  5. ~~No GPU memory cleanup~~ — session-end cleanup added via `beforeunload` (2026-03-07). Mid-session cleanup during feature toggling/view switching remains OPEN.
  6. Kepler solver clamps eccentricity at 0.9999999, preventing near-parabolic and hyperbolic orbit propagation for comets.
  7. Camera clip plane logic could benefit from HUD diagnostics (`near/far` values) during interstellar zoom tuning.

Expected impact:
- Items 2 and 5 are memory leak risks in long sessions. Items 4 and 6 are correctness risks for edge-case bodies.

Affected files/systems:
- `src/main.js`, `src/sim/orbitMath.js`, `src/frontend/app/labelSystem.js`

Next step:
- Prioritize GPU memory cleanup (item 5) and the Kepler solver parabolic/hyperbolic extension (item 6) for next pass.

### 2026-02-18 11:38:22 UTC
Status: `OPEN`
Type: `ARCHITECTURE`
Summary:
- Next-phase partitioning roadmap for finishing `main.js` decomposition.

Context / rationale:
- Largest remaining complexity is concentrated in body construction and particle systems (asteroid/Kuiper/Oort), plus high-density UI/body-list wiring.

Proposed approach:
- Phase A: create `src/frontend/rendering/particleSystems.js` for asteroid, Kuiper, and Oort creation/update flows.
- Phase B: create `src/frontend/rendering/bodyFactory.js` for `getMaterial`, body shell layering, rings, sun structures, and label/halo attachment.
- Phase C: move body-list/info-panel logic to a dedicated UI domain module (`src/frontend/app/bodyExplorer.js`).
- Phase D: keep `src/main.js` as bootstrap/composition layer only (imports, wiring, lifecycle start).

Expected impact:
- Further reduction of regression surface in orbital and rendering edits.
- Faster onboarding and parallel development across independent modules.

Affected files/systems:
- `src/main.js`
- `src/frontend/rendering/*`
- `src/frontend/app/*`

Next step:
- Start with Phase A and include API-style integration tests for visibility toggles and LOD behavior.

### 2026-02-18 11:38:22 UTC
Status: `IN-PROGRESS`

Status: `IN-PROGRESS` (updated 2026-03-12: major typing pass completed 2026-03-09; remaining modules listed below)
Type: `TECH-DEBT`
Summary:
- TypeScript continuation plan for physics and frontend contract safety.

Context / rationale:
- **UPDATE 2026-03-07:** `constants.ts` and `catalog.ts` are already TypeScript-native. All `@ts-nocheck` directives removed. Type annotations added to ~15 files so far; ~30 still need annotations.
- Unit brands/types and CI gates remain open.

Proposed approach:

- Initial TS migration of `orbitMath`, `solarSystemModel`, and `simulationClient` is complete; unit/contract safety should now expand to sources feeding those modules.
- **Update 2026-03-09:** A comprehensive 7-commit type safety pass added ~774 lines of interfaces across 15 modules (solar, planetary, navigation, camera). The majority of solar/planetary/navigation modules now have explicit interfaces. `constants.ts` and `catalog.ts` are already TypeScript.

Proposed approach:
- ~~Convert `src/constants.js` and `src/sim/catalog.js` to TS next.~~ Done (completed during earlier migration).
- Add shared unit brands/types (`Au`, `Km`, `JulianDay`, `Radians`) and apply in orbital interfaces.
- ~~Add explicit wire types for solar/API payloads (`solarPhysicsClient`, observation texture metadata).~~ Done (2026-03-09 type safety pass).
- Add CI gate requiring both `npm run typecheck` and `npm run build`.
- Remaining untyped modules: `animationLoop.ts`, `cameraController.ts`, `inputHandler.ts`, `uiBindings.ts`, `main.ts`.

Expected impact:
- Reduced risk of unit confusion and payload-shape drift.
- Stronger compile-time guardrails for future physics/model upgrades.

Affected files/systems:
- `src/sim/orbitMath.ts`, `src/sim/solarSystemModel.ts`
- `src/frontend/features/solar/*`

- Remaining: `src/frontend/app/{animationLoop,cameraController,inputHandler,uiBindings}.ts`, `src/main.ts`
- CI pipeline config

Next step:
- Introduce a `src/types/units.ts` barrel and adopt it in `orbitMath.ts` first. Type the remaining 5 modules.

### 2026-02-18 10:00:00 UTC
Status: `OPEN`
Type: `IDEA`
Summary:
- Add multi-revolution Lambert solver and Izzo's algorithm for improved trajectory planning.

Context / rationale:
- Current Lambert solver (`backend/trajectory/lambert.py`) uses universal variables with bisection root-finding, limited to single revolution.
- Multi-rev solutions are critical for long-duration transfers and can yield significantly lower delta-V options.
- Izzo's 2015 algorithm provides robust multi-rev handling with Householder iteration (4th-order convergence).

Proposed approach:
- Implement Izzo's Lancaster-Blanchard formulation alongside existing universal-variable solver.
- Add `max_revs` parameter to `solve_lambert_universal` and `compute_lambert_leg`.
- Return multiple solutions (short/long path per revolution count) for porkchop grid evaluation.

Expected impact:
- Wider trajectory solution space for mission planning.
- Better delta-V optimization for outer-planet transfers.

Affected files/systems:
- `backend/trajectory/lambert.py`
- `backend/server.py` (API parameter addition)

Next step:
- Prototype Izzo solver in isolation and validate against known test cases (Earth-Mars, Earth-Jupiter).

### 2026-02-18 10:00:00 UTC
Status: `OPEN`
Type: `IDEA`
Summary:
- Add GR precession and J2 oblateness corrections to REBOUND N-body engine via REBOUNDx.

Context / rationale:
- Current REBOUND engine uses point-mass gravity only. Mercury's perihelion precession (~43 arcsec/century from GR) is not captured.
- REBOUNDx provides `gr_potential` (post-Newtonian) and `gravitational_harmonics` (J2) as drop-in force additions.

Proposed approach:
- Add optional REBOUNDx import in `backend/sim/rebound_nbody.py`.
- Add `gr_potential` for GR precession on inner planets.
- Add `gravitational_harmonics` with J2 coefficients for Sun, Jupiter, Saturn.
- Make these configurable via initialization parameters.

Expected impact:
- Mercury precession accuracy improves from ~0 to ~43 arcsec/century.
- Inner-planet close encounters become more accurate for trajectory planning.

Affected files/systems:
- `backend/sim/rebound_nbody.py`
- `backend/requirements.txt`

Next step:
- Test REBOUNDx availability and benchmark integration overhead with IAS15.

### 2026-02-18 07:49:28 UTC
Status: `OPEN`
Type: `ARCHITECTURE`
Summary:
- Recorded external architectural/scientific deep review as a prioritized implementation queue.

Context / rationale:
- The review confirms project differentiation (hybrid client/server physics, solar-corona model, mission stack) and highlights concrete debt/risk areas requiring sequencing.

Proposed approach:
- Prioritize next implementation batch from the review in this order:
- `main.js` decomposition into domain setup modules and a thin bootstrap.
- REST workload/rate caps for heavy trajectory endpoints.
- CORS hardening for deployment profiles.
- Backend session scaling guardrails (connection/resource limits).
- Worker-based procedural texture generation to reduce startup main-thread blocking.

Expected impact:
- Reduced architectural coupling and lower regression risk.
- Improved production safety/performance under multi-client or adversarial usage.

Affected files/systems:
- `src/main.js` and frontend setup modules
- `backend/server.py`
- `backend/trajectory/*`
- `src/frontend/textures.js` (or equivalent texture generation module)

Next step:
- Start a scoped `main.js` extraction plan with first migration target: UI/setup wiring into a dedicated module.

### 2026-02-18 07:48:40 UTC
Status: `OPEN`
Type: `PROBLEM`
Summary:
- Added quick status table from latest deep re-audit to track unresolved and resolved platform items.

Context / rationale:
- The latest audit identified several still-open high-impact risks and confirmed a set of previously critical fixes as landed.
- Keeping this table in the rolling log improves planning visibility and prevents duplicate triage.

Proposed approach:
- Track the current platform posture using this quick status table and update it on each deep audit pass.

| Category | Status |
|---|---|
| Critical/High still open | `/trajectory/porkchop` caps (`backend/server.py:640`, `backend/trajectory/lambert.py:280`), CORS wildcard+credentials (`backend/server.py:87`), backend-time sync gap (`src/frontend/app/timeController.js:11`), per-frame `set_time_scale` spam (`src/frontend/app/animationLoop.js:62`), silent backend->local fallback (`src/frontend/features/trajectory/index.js:208`), mission body-ID semantics inconsistency (`backend/server.py:690`) |
| Medium/Low still open | mission error detail not surfaced, route per-frame allocation churn, missing frontend lint/test gates, oversized bundle, dual mission validation path drift, nearby-systems cache lifecycle |
| Closed since earlier passes | mission payload hardening, invalid `ok` recommendation guard, mission prograde propagation, benchmark path hardening, WebSocket URL host/protocol fix, route GPU disposal, cloud bitmap eviction cleanup, satellite update allocation fix |

Expected impact:
- Single glance snapshot of codebase risk posture.
- Faster prioritization for next implementation batches.

Affected files/systems:
- `Development_Improvements.md`
- Backend trajectory, mission, server API surface
- Frontend sim-control/planner/runtime modules

Next step:
- Start P0 implementation from the top row in order: porkchop workload caps, CORS correction, backend-time synchronization.

### 2026-02-18 06:57:56 UTC
Status: `OPEN`
Type: `ARCHITECTURE`
Summary:
- Create a shared solar feature-state service to unify polling cadence, blending state, and render subscriptions.

Context / rationale:
- Solar behavior now spans multiple modules (`sunVisuals`, `solarFeatureBlending`, `main` orchestration). A dedicated service can reduce cross-module wiring and simplify future star-system extensions.

Proposed approach:
- Introduce a solar state controller under `src/frontend/features/solar/` that owns:
- backend refresh scheduling
- blend lifecycle state transitions
- a read-only snapshot API for renderer modules

Expected impact:
- Lower coupling in app orchestration code.
- Easier extension to additional star visual models.
- Clearer test boundaries for solar state transitions.

Affected files/systems:
- `src/frontend/features/solar/solarPhysicsClient.js`
- `src/frontend/features/solar/solarFeatureBlending.js`
- `src/frontend/features/solar/sunVisuals.js`
- `src/main.js`

Next step:
- Draft controller interface and migration plan, then move one call path (`maybeRefreshSolarPhysics`) first.
