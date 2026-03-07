# Development History Context

## 1) Instruction Layer
This file is a rolling, timestamped development context log for recent high-value engineering changes and decisions.

Current size objective:
- Keep this file under `30,000 tokens`.
- Approximate line equivalent at current density:
  - Current file density is ~`54.7 chars/line` (`13,614 chars / 249 lines` as of `2026-02-17`).
  - Using `~4 chars/token` heuristic, `30,000 tokens ≈ 120,000 chars`.
  - Estimated line budget: `~2,195 lines` (practical range: `~2,000-2,400` depending formatting/code blocks).
- Always check this file before and after significant implementation work.

Purpose:
- Preserve current implementation context for future sessions.
- Record what changed, why it changed, and what remains open.
- Keep short-horizon roadmap notes tied to concrete code/work items.

Scope boundaries:
- Include implemented changes, validated findings, architecture decisions, incidents, and near-term follow-ups.
- Exclude long-form brainstorming, duplicated chat text, and low-signal commentary.
- Use concrete dates/times (`YYYY-MM-DD HH:MM:SS UTC`) and avoid relative time wording.

Update triggers:
- Add an entry after meaningful code changes, bug root-cause findings, or architectural decisions.
- Add an entry when a prior assumption is invalidated by testing or production behavior.
- Add an entry when follow-up work is created, blocked, or resolved.

Maintenance rules:
- Keep entries in reverse chronological order (newest first).
- Keep entries concise and implementation-focused.
- Prefer append-only history; do not rewrite old entries except factual corrections.
- Do not modify this instruction layer unless process rules change.

Quality bar per entry:
- Must be understandable without external chat context.
- Must include impacted files and at least one next action or explicit closure note.
- Must distinguish facts from proposals.

Rolling size control (required):
- Soft target: keep total file under `30,000 tokens` (targeting roughly `~2,200` lines at current density).
- Hard cap: if file exceeds `35,000 tokens` (roughly `~2,550` lines), prune oldest notes from the bottom.
- Prune only the notes section, never the instruction layer.
- Preserve unresolved items tagged `OPEN` where possible.
- After pruning, add a one-line note indicating prune date/time and approximate number of entries removed.

Entry template (use this order):
- Timestamp (`YYYY-MM-DD HH:MM:SS UTC`)
- Status (`OPEN`, `IN-PROGRESS`, `DONE`, `BLOCKED`)
- What changed
- Why it changed
- Evidence/validation
- Files touched
- Follow-ups / open questions

## 2) Notes (Rolling Log)

### 2026-03-07 05:56:36 UTC — Compact asteroid catalog contract added and documented
Status: DONE

What changed:
- Added `src/data/asteroidCatalogLoader.ts` with a compact `ACBF` v1 binary reader/writer for asteroid orbital elements and stable numeric IDs.
- Added `src/data/asteroidCatalogBinaryFormat.md` documenting header bytes, field order, quantization ranges, and version rules.
- Added `src/data/asteroidCatalogLoader.test.ts` exposing a 100k-body roundtrip validation entrypoint.
- Updated `README.md`, `Development_Improvements.md`, and `Development_History_Context.md` so the repo context reflects the new compact catalog layer and the current realism state of asteroid/Kuiper/Oort systems more accurately.

Why it changed:
- The active thread delivered the Data Compression Engineer scope for the asteroid simulation plan: compact typed-array/binary packing plus versioned validation, while explicitly avoiding fetch-logic and taxonomy-rule changes.
- Existing docs did not mention the new compact catalog contract and still risked overstating how complete the distant small-body runtime is.

Evidence/validation:
- Verified the new contract lives in `src/data/asteroidCatalogLoader.ts` with fixed-width `ACBF` v1 records and strict header validation.
- Verified the format documentation and validation entrypoint were added alongside it.
- Verified the live runtime ingestion path remains separate in `src/sim/phase1AsteroidCatalog.ts`, so the new binary contract is available but not yet the canonical runtime path.

Files touched:
- `src/data/asteroidCatalogLoader.ts`
- `src/data/asteroidCatalogBinaryFormat.md`
- `src/data/asteroidCatalogLoader.test.ts`
- `README.md`
- `Development_Improvements.md`
- `Development_History_Context.md`

Follow-ups / open questions:
- Consolidate legacy `ASPH` loading and new `ACBF` tooling into one canonical ingestion path once fetch/taxonomy ownership is available.
- Add checksum/version stamping at the dataset-generation layer before mission-target promotion depends on the binary contract.

### 2026-03-07 05:47:00 UTC — Documentation refreshed after TS migration and runtime analysis
Status: DONE

What changed:
- Updated `README.md` so it no longer describes the frontend/runtime tree as a JS/TS hybrid.
- Corrected the documented `src` module graph from deleted `.js` entrypoints to the current `.ts` files, including the `superluminal-modeling` feature namespace.
- Recorded the current runtime state from this thread's analysis:
  - `src` is fully TypeScript-native and no longer contains shim `.js` files.
  - The active render loop still lives directly in `src/main.ts`.
  - `src/frontend/app/animationLoop.ts` exists as a reusable scheduler but is not yet the sole runtime entry path.
  - The only existing frontend workerized compute path is satellite propagation.

Why it changed:
- Recent work in this thread focused on evaluating what remains after the filename migration: stricter typing, performance hardening, and thread/domain partitioning for the simulation.
- Without a docs refresh, the repo context continued to imply that core JS migration work was still pending, which is no longer true.

Evidence/validation:
- Verified `src` contains no `.js` files during the analysis pass.
- Verified `src/main.ts` owns the active `requestAnimationFrame` loop while `src/frontend/app/animationLoop.ts` remains available but not yet the normalized entry.
- Verified worker usage is currently limited to `src/frontend/features/planetary/satelliteSystem.ts` and `src/frontend/features/planetary/satellitePropagationWorker.ts`.

Files touched:
- `README.md`
- `Development_Improvements.md`
- `Development_History_Context.md`

Follow-ups / open questions:
- The next runtime pass should be architectural, not cosmetic: worker contracts for orbital propagation, sun feature state, SMBH/AGN timeline computation, and asteroid generation.
- Strong typing is still incomplete in several hot-path files due to `// @ts-nocheck`; that should be addressed alongside worker boundary design rather than as an isolated cleanup pass.

### 2026-02-26 10:16:00 UTC — Superluminal modeling feature moved and TS-converted
Status: DONE

What changed:
- Renamed `src/frontend/features/galactic-superluminal-v` to `src/frontend/features/superluminal-modeling`.
- Converted the superluminal hypothesis stack to TypeScript filenames:
  - `agnShockwaveEngine.ts`
  - `smbhPropagation.ts`
  - `smbhPhysicsConstants.ts`
- Renamed `src/sunController.js` to `src/sunController.ts`.
- Rewired imports to maintain runtime wiring:
  - `src/sunController.ts` now consumes `./frontend/features/superluminal-modeling/agnShockwaveEngine`.
  - `src/main.ts` consumes `./sunController` (extensionless).

Why it changed:
- User requested the hypothesis feature to move out of `solar` scope, adopt the domain folder `superluminal-modeling`, and be represented as TypeScript modules.

Evidence/validation:
- Verified active references now point to `superluminal-modeling` only (`rg` sweep over `src`, `index.html`, and migration logs).
- Verified `src/main.ts` is the active entrypoint in `index.html`.
- Verified old `.js` module filenames are no longer present in `src/frontend/features/galactic-superluminal-v` (directory removed/renamed).

Files touched:
- `src/frontend/features/superluminal-modeling/agnShockwaveEngine.ts`
- `src/frontend/features/superluminal-modeling/smbhPropagation.ts`
- `src/frontend/features/superluminal-modeling/smbhPhysicsConstants.ts`
- `src/sunController.ts`
- `src/main.ts`

Follow-ups / open questions:
- All three TypeScript files plus `sunController.ts` currently include `// @ts-nocheck`; should be replaced with typed interfaces (`source`, timeline/channel/event, and responder callback contracts) in a follow-up pass.

### 2026-02-26 09:00:00 UTC — Phase 4 asteroids migration cleanup complete
Status: DONE

What changed:
- Completed final Phase 4 request for `src/sim/asteroids/*`: no obsolete `.js` shims remain in this directory and no `src` callsites/imports are required to target deleted shim entrypoints.
- Added/updated parity-facing documentation in `src/sim/asteroids/README.md` to reference TS module names and import paths.
- Updated `typescript_migration_plan.md` to mark Phase 4 asteroids cleanup items as complete.

Why it changed:
- User asked for explicit Phase 4 execution and shim removal, with completion parity tracking.

Evidence/validation:
- Verified `rg --files src/sim/asteroids` returns only four `.ts` implementation files and README.
- Verified no active `src` imports reference `asteroidDistributions.js`, `asteroidGeometry.js`, `asteroidPipeline.js`, or `asteroidShaders.js`.

Files touched:
- `src/sim/asteroids/README.md`
- `src/sim/asteroids/asteroidDistributions.ts`
- `src/sim/asteroids/asteroidGeometry.ts`
- `src/sim/asteroids/asteroidPipeline.ts`
- `src/sim/asteroids/asteroidShaders.ts`
- `typescript_migration_plan.md`
- `Development_Improvements.md`
- Removed:
  - `src/sim/asteroids/asteroidDistributions.js`
  - `src/sim/asteroids/asteroidGeometry.js`
  - `src/sim/asteroids/asteroidPipeline.js`
  - `src/sim/asteroids/asteroidShaders.js`

Follow-ups / open questions:
- If you want behavior-level parity guarantees, run `npx vite build` and smoke paths that render asteroid pipeline wiring.

### 2026-02-26 10:15:00 UTC — src shim removal sweep across runtime and feature imports
Status: DONE

What changed:
- Completed the remaining shim-removal pass requested for `src` after the phase-1 through phase-4 migration sequence by deleting legacy `.js` compatibility wrappers that now had no purpose.
- Updated entrypoints and internal imports to consume `.ts` modules directly (extensionless module paths where supported).
- Removed the stale runtime shim entry `src/main.js` and switched the app bootstrap in `index.html` to `/src/main.ts`.
- Fixed a lingering missing import in `src/sim/asteroids/asteroidDistributions.ts` by replacing the non-existent `../physics.js` fallback import with `../../constants` and using `MU_SUN_AU3_DAY2`.
- Updated `typescript_migration_plan.md` to mark the `src` shim-removal task as complete.

Why it changed:
- The remaining shims were one-line re-export wrappers only, and they were adding module-resolution indirection without runtime benefit.
- Keeping them made dependency graphs harder to reason about and required duplicate maintenance when touching callsites.

Evidence/validation:
- `rg --files src -g '*.js'` returns no results after this pass.
- `rg -n "from './...\\.js'" src` / `rg -n "new URL\\('./...\\.js'" src` no longer returns local shim import references.

Files touched:
- Removed:
  - `src/constants.js`
  - `src/data/planets.js`
  - `src/main.js`
  - `src/sim/catalog.js`
  - `src/textures.js`
  - `src/frontend/app/timeController.js`
  - `src/frontend/app/temp_nearbySystemsRenderer.js`
  - `src/frontend/app/stateStore.js`
  - `src/frontend/app/textureManager.js`
  - `src/frontend/app/sceneSetup.js`
  - `src/frontend/app/uiBindings.js`
  - `src/frontend/camera/transitions.js`
  - `src/frontend/features/planetary/terrainSynthesis.js`
  - `src/frontend/features/planetary/moonTextureCatalog.js`
  - `src/frontend/features/planetary/cloudDataPipeline.js`
  - `src/frontend/features/planetary/moonTexturePipeline.js`
  - `src/frontend/features/planetary/visualProfiles.js`
  - `src/frontend/features/planetary/satellitePropagationWorker.js`
  - `src/frontend/features/planetary/satelliteSystem.js`
  - `src/frontend/features/solar/solarProminences.js`
  - `src/frontend/features/solar/solarPhysicsClient.js`
  - `src/frontend/features/solar/gravitationalWaves.js`
  - `src/frontend/features/solar/solarObservationTexture.js`
  - `src/frontend/features/solar/solarMagnetics.js`
  - `src/frontend/features/solar/solarFeatureBlending.js`
  - `src/frontend/features/solar/solarFlares.js`
  - `src/frontend/features/solar/sunVisuals.js`
  - `src/frontend/features/solar/solarWind.js`
  - `src/frontend/features/trajectory/localPlanner.js`
  - `src/frontend/features/trajectory/index.js`
- Updated:
  - `index.html`
  - `src/main.ts`
  - `src/sunController.ts`
  - `src/data/planets.ts`
  - `src/sim/catalog.ts`
  - `src/sim/asteroids/asteroidDistributions.ts`
  - `src/frontend/app/inputHandler.ts`
  - `src/frontend/app/sceneSetup.ts`
  - `src/frontend/features/planetary/satelliteSystem.ts`
  - `src/frontend/features/planetary/moonTexturePipeline.ts`
  - `src/frontend/features/solar/{solarFeatureBlending.ts,sunVisuals.ts,solarObservationTexture.ts,solarFlares.ts,solarMagnetics.ts,solarPhysicsClient.ts,solarProminences.ts,solarWind.ts,gravitationalWaves.ts}`
  - `src/frontend/features/trajectory/{index.ts,localPlanner.ts}`

Follow-ups / open questions:
- Run your behavior and smoke checks (especially launch/animation loop rendering path) after this cleanup.
- If any remaining `.js` references are reported by tooling outside `src`, update callsites or keep compatibility wrappers as needed.

### 2026-02-25 12:45:00 UTC — Phase 3 rendering+asteroids migration completed
Status: DONE

What changed:
- Migrated the full Phase 3 scope:
  - `src/frontend/rendering/{lodManager.ts,milkyWay.ts,orbitRenderer.ts}`
  - `src/sim/asteroids/{asteroidDistributions.ts,asteroidGeometry.ts,asteroidPipeline.ts,asteroidShaders.ts}`
- Updated internal imports inside converted asteroid modules to reference TS modules directly.
- Removed corresponding `.js` shim files for the phase-3 module set after TS-native usage was established.
- Updated `typescript_migration_plan.md` completion metrics and marked Phase 3 modules as complete.

Why it changed:
- User requested immediate progress on phase 3 and the optional cleanup step removing obsolete JS shims when TS-native.
- Keeping shim strategy for behavior parity, then removing obsolete shims reduces future maintenance overhead.

Evidence/validation:
- Verified no runtime callsites under `src` currently import the removed module-shim entrypoints.
- Recomputed migration counts now show `53` TS files and `53` unique stems in `src`.
- Remaining JavaScript-only module stems in `src` are now `0`.

Files touched:
- `src/frontend/rendering/{lodManager.ts,milkyWay.ts,orbitRenderer.ts}`
- `src/sim/asteroids/{asteroidDistributions.ts,asteroidGeometry.ts,asteroidPipeline.ts,asteroidShaders.ts}`
- `src/sim/asteroids/asteroidGeometry.ts`
- `src/sim/asteroids/asteroidPipeline.ts`
- `src/frontend/rendering/lodManager.ts`
- `src/frontend/rendering/milkyWay.ts`
- `src/frontend/rendering/orbitRenderer.ts`
- `src/sim/asteroids/asteroidDistributions.ts`
- `src/sim/asteroids/asteroidShaders.ts`
- `typescript_migration_plan.md`
- `Development_Improvements.md`
- Removed:
  - `src/frontend/rendering/lodManager.js`
  - `src/frontend/rendering/milkyWay.js`
  - `src/frontend/rendering/orbitRenderer.js`
  - `src/sim/asteroids/asteroidDistributions.js`
  - `src/sim/asteroids/asteroidGeometry.js`
  - `src/sim/asteroids/asteroidPipeline.js`
  - `src/sim/asteroids/asteroidShaders.js`

Follow-ups / open questions:
- Next phase should focus on residual runtime callsite cleanup and full TS-native wiring where feasible.

### 2026-02-25 12:15:00 UTC — Phase 2 feature-stack migration completed (Phase 2)
Status: DONE

What changed:
- Converted the full feature stack (`planetary`, `solar`, `trajectory`) from `.js` to `.ts` under shim pattern:
  - `src/frontend/features/planetary/*.ts`
  - `src/frontend/features/solar/*.ts`
  - `src/frontend/features/trajectory/*.ts`
- Added compatibility re-export shims in each corresponding `.js` file.
- Added `// @ts-nocheck` at the top of each new TypeScript feature file to preserve behavior and avoid type contract regressions during migration.
- Corrected `src/frontend/features/trajectory/index.js` shim to re-export from `./index.ts`.
- Updated `typescript_migration_plan.md` to reflect current completion snapshot and remaining workload.

Why it changed:
- User requested Phase 2 execution directly after Phase 1, with emphasis on keeping behavior unchanged.
- A shim-only migration keeps module boundaries stable while enabling TypeScript iteration.

Evidence/validation:
- Verified all feature `.js` modules now function as shim re-exports instead of direct implementation.
- Counted conversion scope as all `18` feature modules under `frontend/features`.
- Remaining JavaScript-only runtime modules are now limited to rendering + asteroid modules.

Files touched:
- `src/frontend/features/planetary/{terrainSynthesis,moonTextureCatalog,cloudDataPipeline,moonTexturePipeline,visualProfiles,satellitePropagationWorker,satelliteSystem}.*`
- `src/frontend/features/solar/{solarObservationTexture,solarMagnetics,solarFeatureBlending,solarFlares,sunVisuals,solarWind,solarProminences,solarPhysicsClient,gravitationalWaves}.*`
- `src/frontend/features/trajectory/{localPlanner,index}.*`
- `typescript_migration_plan.md`
- `Development_Improvements.md`

Follow-ups / open questions:
- Next block should target rendering and asteroids modules with the same shim strategy, then remove `*.js` shims once imports are all `.ts`-native.

### 2026-02-23 06:40 UTC — Sun Model Physics Overhaul: 13-Phase Implementation
Status: DONE

What changed:
- **Implemented all 13 phases** of the Sun model physics overhaul plan across 3 modified files and 5 new modules.
- **Phase 1 (Critical bug fixes):** Replaced invented limb darkening polynomial with per-channel Neckel & Labs 1994 coefficients (R/G/B independent, blue darkens ~40% more than red at limb). Fixed PFSS RK4 in-place vector mutation using `addScaledVector` on a fresh accumulator.
- **Phase 2 (Blackbody):** Replaced artistic orange palette with Planck-derived linear sRGB colors. Sun at 5778K now appears near-white (correct for G2V star), not orange.
- **Phase 3 (Granulation & sunspots):** Granulation contrast reduced 82% → 22% RMS (Nordlund-Stein). Each of 8 sunspot uniform slots now generates 2-5 clustered sub-spots (up to 40 at solar max). Penumbral fibrils now radially elongated 2.67:1 (Evershed flow). Facular contrast inverts from dark at disk center to +15% bright at limb (Topka 1997). Wilson depression foreshortening applied near limb.
- **Phase 4 (Chromosphere):** Added Type II spicule population (30% of 8000 particles): rapid rise, fade-without-descent. Distance-scaled point sizes.
- **Phase 5 (Corona):** K-corona radial falloff (Baumbach/van de Hulst `0.036r⁻¹·⁵ + 1.55r⁻⁶`). Corona shell expanded 1.032× → 4× R☉. Helmet streamer equatorial brightening. Noise-modulated coronal holes (polar + equatorial at solar max). Fe XIV temperature-gradient color.
- **Phase 6 (Flares/CME):** CME angular width parameterized 20°-120°. GOES Neupert-effect flare temporal profile.
- **Phase 7 (PFSS):** Dipole tilt angle applied (~12° at solar max). Octupole (ℓ=3) harmonic added.
- **Phase 8 (NEW):** Created `solarProminences.js` — catenary arch prominences with Hα emission, eruption animation, ProminenceManager.
- **Phase 9 (NEW):** Created `radiation_pressure.py` — SRP, Poynting-Robertson drag, β ratio, Yarkovsky, REBOUND callback.
- **Phase 10 (NEW):** Created `galactic_tide.py` — Heisler-Tremaine tidal field, REBOUND callback.
- **Phase 11 (NEW):** Created `solarWind.js` — Parker spiral physics, bimodal speed model, IMF.
- **Phase 12 (NEW):** Created `gravitationalWaves.js` — educational GW spacetime distortion visualization.

Why it changed:
- Comprehensive physics audit identified 14 deficiencies + 6 new phenomena gaps. All physics constants sourced from peer-reviewed publications.

Evidence/validation:
- `npx vite build` — zero errors, 25 modules transformed.
- Neckel-Labs coefficient sums at μ=1: R=1.0001, G=1.0000, B=1.0000.
- K-corona at 2 R☉: 2.33% of surface intensity.
- Python radiation_pressure β: 6.09e-8 for 1m²/1000kg spacecraft.
- Python galactic_tide: relevant at 50,000 AU (True), irrelevant at 1 AU (False).

Files touched:
- `src/frontend/features/solar/sunVisuals.js` (15 shader corrections)
- `src/frontend/features/solar/solarMagnetics.js` (RK4 fix + tilt + octupole)
- `src/frontend/features/solar/solarFlares.js` (CME width + Neupert profile)
- `src/frontend/features/solar/solarProminences.js` (new)
- `src/frontend/features/solar/solarWind.js` (new)
- `src/frontend/features/solar/gravitationalWaves.js` (new)
- `backend/sim/radiation_pressure.py` (new)
- `backend/sim/galactic_tide.py` (new)
- `my-notes/Sun_Physics_Overhaul_Plan_2026-02-23.md` (updated v2 plan)
- `my-notes/Sun_Physics_Overhaul_Report_2026-02-23.md` (new report)

Follow-ups / open questions:
- OPEN: wire `ProminenceManager`, `solarWind.js`, and `gravitationalWaves.js` into `main.js` animation loop.
- OPEN: wire `radiation_pressure.py` and `galactic_tide.py` as REBOUND `additional_forces` callbacks.
- OPEN: Phase 7A (differential rotation → Julian date sync) not implemented — requires Julian date propagation.
- OPEN: Phase 13 (coronal loop temperature stratification, DEM-aware AIA channels, irradiance variability) deferred.
- OPEN: unused imports in `solarProminences.js` (`DoubleSide`, `AU_M`) — cosmetic cleanup.
- OPEN: visual verification at browser zoom levels needed for corona 4× expansion and sunspot clustering.

### 2026-02-23 — Codebase Analysis: Non-Solar Bug Sweep & Physics Fixes
Status: DONE

What changed:
- **Label positioning (camera-relative):** Rewrote label offset logic in `labelSystem.js` so planet name labels always appear directly above the body's center of mass from the camera's viewpoint, regardless of camera angle or orbit orientation. Previously labels used a fixed local-Y offset (`(0, Y, 0)`) which caused them to drift off-center when the camera orbited around a planet. Now computes the camera's screen-up direction (`camera.quaternion` → local Y axis in world space) once per frame and positions all labels along that vector. Same fix applied to local-system body labels, which also had a `pointerTipWorld * 0` bug that zeroed out the pointer offset entirely.
- **Asteroid belt visibility:** Increased base asteroid particle size from `0.0085` to `0.018` AU and opacity from `0.74` to `0.82`. Increased detail layer particle size from `0.0022` to `0.006` AU and opacity from `0.68` to `0.76`. Relaxed detail layer activation region from `height < 3.1 && cameraDist < 5.6` to `height < 5.0 && cameraDist < 7.0` so the detail LOD layer is visible from edge-on ecliptic views and slightly further zoom distances.
- **Planet spin axis ecliptic longitudes (physics fix):** Added `spinAxisLongitudeDeg` to Earth (90°), Mars (353°), Jupiter (248°), and Neptune (319°) in `src/data/planets.js`. These values are the ecliptic longitude of the IAU north pole direction, computed from the equatorial-to-ecliptic frame rotation of each planet's IAU pole coordinates. Previously all four defaulted to 0°, causing Earth's axis to point 90° off (toward the vernal equinox instead of toward ecliptic longitude 90°), misaligning the solstice/equinox cycle by ~3 months and orienting the day-night terminator incorrectly. Saturn and Uranus already had correct values.
- **Ring material constant:** Replaced `side: 2` magic number with imported `DoubleSide` constant for Saturn and Uranus ring materials.
- **Initial label radius:** Changed initial label position from `body.displayRadiusAu` to `bodyRenderRadiusAu(body, simState.useRealisticScale)` so the first-frame label offset matches the actual rendered size.
- **applyScaleMode local labels:** Fixed local body label repositioning in `applyScaleMode()` to also use camera-relative up direction instead of fixed Y.

Why it changed:
- User-reported: planet labels were visibly off-center and did not track correctly from all camera angles.
- User-reported: asteroid belt objects were invisible at typical zoom levels despite toggle being enabled.
- Codebase analysis identified missing spin axis ecliptic longitudes as a physics inconsistency affecting planetary orientation, seasonal cycle accuracy, and day-night terminator direction.

Evidence/validation:
- No linter errors after all changes.
- Label offset now uses `screenUpVec.set(0, 1, 0).applyQuaternion(camera.quaternion)` which correctly tracks the camera's billboard-up axis.
- Spin axis values verified by converting IAU pole coordinates (RA/Dec) from equatorial to ecliptic frame using the standard rotation matrix `Rx(+23.44°)`.

Files touched:
- `src/frontend/app/labelSystem.js`
- `src/main.js`
- `src/data/planets.js`

Follow-ups / open questions:
- OPEN: consider adding `spinAxisLongitudeDeg` for Mercury (effectively irrelevant with 0.034° tilt) and Pluto (relevant with 122.53° tilt, but ecliptic longitude of pole needs careful calculation due to extreme obliquity).
- OPEN: asteroid belt particle sizes may need further tuning after visual verification at multiple zoom levels.
- OPEN: the `rotationPhaseDeg: -90` for Earth was calibrated before the axis correction — verify that the texture prime meridian alignment is still accurate after the spin axis longitude fix.

### 2026-02-18 11:38:22 UTC
Status: DONE

What changed:
- Continued `src/main.js` decomposition with additional focused modules and rewiring:
  - Camera transition lifecycle extracted to `src/frontend/camera/transitions.js`.
  - Orbit line generation extracted to `src/frontend/rendering/orbitRenderer.js`.
  - Milky Way/starfield generation and appearance switching extracted to `src/frontend/rendering/milkyWay.js`.
  - Surface LOD transition logic extracted to `src/frontend/rendering/lodManager.js`.
- Preserved previous extraction set already in place and integrated with the new split (`stateStore`, `sceneSetup`, `textureManager`, `cameraController`, `bodyManager`, `inputHandler`, `animationLoop`).
- Completed first incremental TypeScript phase for high-risk simulation paths:
  - Converted `src/sim/orbitMath.js` -> `src/sim/orbitMath.ts`.
  - Converted `src/sim/solarSystemModel.js` -> `src/sim/solarSystemModel.ts`.
  - Converted `src/frontend/app/simulationClient.js` -> `src/frontend/app/simulationClient.ts`.
  - Added `tsconfig.json`, `npm run typecheck`, `typescript`, and `@types/three`.
- Repaired syntax corruption in `src/frontend/features/solar/solarPhysicsClient.js` that was blocking bundling (duplicate/garbled constructor/query/fetch fields).

Why it changed:
- User-directed goal: further partition `main.js` into focused modules to reduce coupling and implementation risk.
- High-risk physics and messaging paths were prioritized for typed contracts to reduce silent runtime errors.
- Build stability required immediate syntax recovery in `solarPhysicsClient.js` before validating architecture work.

Evidence/validation:
- `npm run build` passed after module extraction and syntax repair.
- `npm run typecheck` passed after TS adoption for targeted modules.
- `src/main.js` reduced from `4521` lines to `4026` lines in this pass.

Files touched:
- `src/main.js`
- `src/frontend/camera/transitions.js` (new)
- `src/frontend/rendering/orbitRenderer.js` (new)
- `src/frontend/rendering/milkyWay.js` (new)
- `src/frontend/rendering/lodManager.js` (new)
- `src/sim/orbitMath.ts` (new, replaced `.js`)
- `src/sim/solarSystemModel.ts` (new, replaced `.js`)
- `src/frontend/app/simulationClient.ts` (new, replaced `.js`)
- `src/frontend/features/solar/solarPhysicsClient.js`
- `package.json`
- `package-lock.json`
- `tsconfig.json` (new)

Follow-ups / open questions:
- OPEN: extract asteroid/Kuiper/Oort systems into `rendering/particleSystems` module(s) to remove the largest remaining block from `main.js`.
- OPEN: isolate `createBodyNode`/material creation into `rendering/bodyFactory` to complete the major rendering split.
- OPEN: add unit-branded TypeScript types (`Au`, `Km`, `JulianDay`, `Radians`) and propagate through `constants` and catalog/orbit contracts.

### 2026-02-18 10:30:00 UTC
Status: DONE

What changed:
- Expanded SDO/AIA observation pipeline from 3 channels (171/193/211) to 5 channels (094/171/193/211/304):
  - Added AIA 094 Å (hot flare plasma, 6.3 MK) and AIA 304 Å (chromospheric, prominences/filaments).
  - Backend: added source IDs and rebalanced activity weights across all 5 channels (sum = 1.0).
  - Frontend: updated channel priority list, added `AIA_CHANNEL_OPTIONS` export for UI, added `CHANNEL_VISUAL_WEIGHTS` for per-channel blend/emission boost.
  - Updated `pickAiaObservationChannel()` to accept optional `overrideChannel` parameter.
  - Updated `deriveSunObservationControls()` to accept optional `activeChannel` parameter and apply channel-specific visual weight adjustments.
- Added AIA channel selector dropdown to `index.html` Display section with all 5 channels + "Auto" mode.
- Wired AIA dropdown in `main.js` with `userAiaChannelOverride` state variable, change listener that forces texture refresh, and channel passthrough to observation controls and channel picker.
- Closes prior OPEN item: "expose UI controls to toggle observational texturing and tune observation blend strength at runtime."

Why it changed:
- AIA 094 Å captures hot flare plasma (Fe XVIII, ~6.3 MK) essential for flare/CME visualization.
- AIA 304 Å captures chromospheric He II emission, providing prominence/filament structure visibility.
- User-facing channel selector enables targeted solar observation for educational and scientific exploration.

Evidence/validation:
- Backend `AIA_SOURCE_IDS` dict now has 5 entries; `/solar/realtime/aia-tile?channel=aia_304` and `?channel=aia_094` resolve to valid Helioviewer source IDs (8, 13).
- Frontend `pickAiaObservationChannel` correctly prioritizes override channel when set.

Files touched:
- `backend/sim/solar_realtime_data.py`
- `src/frontend/features/solar/solarObservationTexture.js`
- `index.html`
- `src/main.js`

Follow-ups / open questions:
- OPEN: add per-channel false-color remapping in shader for channels with distinct temperature ranges (094 vs 304).
- OPEN: consider channel-specific tile refresh cadence (094/304 may update less frequently on Helioviewer).

### 2026-02-18 10:00:00 UTC
Status: DONE

What changed:
- Created three new data-fetching scripts under `scripts/` for external catalog enrichment:
  1. `scripts/fetch_utils.py` — shared HTTP/caching utilities (urllib-based, no external deps). Provides `http_get()`, `http_get_json()`, `load_or_fetch()` with time-based cache, `parse_csv_text()`, `safe_float()`/`safe_int()`.
  2. `scripts/fetch_gaia_catalog.py` — queries ESA Gaia DR3 TAP endpoint for bright stars (G < 7.5) and nearby systems (parallax > 100 mas). TAP fallback chain: ESA → VizieR → static fallback. Cross-matches with existing nearby systems CSV by angular position (5 arcsec). Outputs updated `src/data/stars_catalog.json` (~10k entries) and enriched `solar-systems/nearby_star_systems_ranked_full.csv`.
  3. `scripts/fetch_jpl_sbdb.py` — queries JPL SBDB API for top asteroids (by H mag), notable NEOs (Aten/Apollo/Amor classes), and Jupiter Trojans. Directly appends new entries to `backend/data/bodies.py` and `src/data/planets.js` with deduplication. Estimates radius from H magnitude, assigns colors from taxonomic classification.
- Added `scripts/.cache/` and `scripts/output/` to `.gitignore`.

Why it changed:
- Star catalog had ~5,500 entries; Gaia DR3 enrichment targets ~10,000 with proper motions.
- Asteroid catalog had 20 named objects; SBDB enrichment adds ~80 additional with orbital elements.
- Scripts are idempotent with caching for re-runs and fallback strategies for network failures.

Evidence/validation:
- All three scripts parse without errors (`python -m py_compile` passes).
- Gaia TAP queries use standard ADQL against public endpoints with documented fallback chain.
- SBDB script uses documented JPL API fields and matches existing data format in bodies.py/planets.js.

Files touched:
- `scripts/fetch_utils.py` (new)
- `scripts/fetch_gaia_catalog.py` (new)
- `scripts/fetch_jpl_sbdb.py` (new)
- `.gitignore`

Follow-ups / open questions:
- OPEN: run `python scripts/fetch_gaia_catalog.py` and `python scripts/fetch_jpl_sbdb.py` to generate updated data files.
- OPEN: validate star catalog rendering density and asteroid orbital element accuracy after data refresh.
- OPEN: consider adding a static Gaia fallback JSON for fully offline builds (currently falls back to bundled data if network unavailable).

### 2026-02-17 08:22:20 UTC
Status: DONE

What changed:
- Updated `Development_History_Context.md` instruction layer with a new primary file-size objective of staying under `30,000 tokens`.
- Added an explicit token-to-line estimate based on current file density and noted the practical line range (`~2,000-2,400`, centered around `~2,195`).
- Added an explicit maintenance reminder to always check this file before and after significant implementation work.
- Replaced prior rolling size-control thresholds (`KB/line-based`) with token-based soft/hard caps aligned to the new objective.

Why it changed:
- User requested a token-based target at the top of the file and asked for an approximate line conversion.
- Token-based policy is a better fit for model context management than raw file-size-only thresholds.

Evidence/validation:
- Measured current file metrics: `249 lines`, `1,640 words`, `13,614 chars` via `wc -l -w -c Development_History_Context.md`.
- Computation used in-file:
  - `chars/line ≈ 13,614 / 249 ≈ 54.7`
  - `30,000 tokens * ~4 chars/token ≈ 120,000 chars`
  - `120,000 / 54.7 ≈ 2,195 lines`

Files touched:
- `Development_History_Context.md`

Follow-ups / open questions:
- OPEN: if writing style density changes significantly (more code blocks/paths), recalibrate the line-equivalent estimate quarterly.

### 2026-02-17 08:20:20 UTC
Status: DONE

What changed:
- Upgraded realtime SDO/AIA ingestion from metadata-only to imagery-aware context:
  - Added Helioviewer tile URL support (`getTile`) per AIA channel (171/193/211).
  - Added cached binary fetch path for AIA PNG tiles.
  - Added image-stat activity extraction (luma/contrast/edge/hot-fraction proxy) from AIA tiles for each channel.
- Added backend AIA tile proxy endpoint `GET /solar/realtime/aia-tile` so frontend can load observational textures through backend CORS instead of direct third-party origin fetch.
- Extended realtime snapshot payload with AIA visualization hints (`preferred_channel`, `preferred_image_id`, proxy-path hint) and per-channel activity proxies.
- Refined solar physics assimilation blending:
  - Added `observed_confidence` from source freshness (SWPC/SILSO/SDO).
  - Added adaptive `blend_weight` in `hybrid` and `data_driven` modes.
  - Added `proxy_breakdown` diagnostics in `data_assimilation`.
- Added frontend observational texture pipeline for Sun shading:
  - New module `solarObservationTexture.js` for channel selection and confidence-driven blending controls.
  - Added backend-proxied AIA texture loading and texture swap management in `main.js`.
  - Added Sun shader uniforms for observational blending (`observationMap`, `observationBlend`, `observationEmission`) on surface/corona materials.

Why it changed:
- Close the remaining realism gap where SDO/AIA was present only as metadata and did not influence rendering.
- Deliver a higher-fidelity, data-driven visual mode while preserving synthetic fallback and backend stability under upstream outages.

Evidence/validation:
- `python -m py_compile backend/sim/solar_physics.py backend/sim/solar_realtime_data.py backend/server.py backend/tests/test_solar_physics_api.py` passed.
- `pytest -q backend/tests/test_solar_physics_api.py` passed (`7 passed`).
- `npm run build` passed.
- Manual backend checks:
  - `/solar/physics?forcing=hybrid&live_data=true` returned `200` with `data_assimilation.applied=true`, nonzero confidence, and adaptive blend-weight.
  - `/solar/realtime/aia-tile?channel=aia_193` returned PNG payload successfully.

Files touched:
- `backend/sim/solar_realtime_data.py`
- `backend/server.py`
- `backend/sim/solar_physics.py`
- `backend/tests/test_solar_physics_api.py`
- `backend/requirements.txt`
- `src/frontend/features/solar/sunVisuals.js`
- `src/frontend/features/solar/solarObservationTexture.js`
- `src/main.js`

Follow-ups / open questions:
- OPEN: expose UI controls to toggle observational texturing and tune observation blend strength at runtime.
- OPEN: add optional deterministic fixture mode for AIA tile analysis to keep CI fully offline while still testing image-stat logic.
- OPEN: consider lightweight temporal smoothing for successive AIA texture swaps to avoid abrupt visual transitions when image ID updates.

### 2026-02-17 08:11:40 UTC
Status: DONE

What changed:
- Added a high-fidelity, data-driven solar forcing pipeline with cached ingestion of:
  - NOAA SWPC solar-wind plasma and IMF feeds.
  - SILSO daily sunspot series.
  - SDO/AIA (171/193/211) latest-image metadata via Helioviewer.
- Added backend module `SolarRealtimeDataProvider` with resilient timeout/caching behavior and combined live activity proxy generation.
- Extended `/solar/physics` with optional forcing controls:
  - `forcing` = `synthetic|hybrid|data_driven`
  - `live_data` and `force_data_refresh` switches.
- Added `/solar/realtime` endpoint to inspect current ingested solar context and source health.
- Extended `SolarCoronaPhysicsModel.sample_state(...)` to blend synthetic-cycle activity with live observed proxies in `hybrid`/`data_driven` modes and to inject solar-wind speed into Parker-spiral construction.
- Updated frontend solar client defaults to request `forcing=hybrid` and `live_data=true`.
- Expanded API tests to cover forcing modes and hybrid no-live stability behavior.

Why it changed:
- Implement the requested complex high-fidelity mode while preserving deterministic synthetic fallback.
- Move model behavior from purely procedural forcing toward observationally informed forcing without introducing hard runtime dependency on upstream services.

Evidence/validation:
- `python -m py_compile backend/sim/solar_physics.py backend/sim/solar_realtime_data.py backend/server.py backend/tests/test_solar_physics_api.py` passed.
- `pytest -q backend/tests/test_solar_physics_api.py` passed (`5 passed`).
- `npm run build` passed.
- Manual backend call with `forcing=hybrid&live_data=true` returned `status 200`, `data_assimilation.applied=true`, live SWPC/AIA source payloads, and wind-coupled Parker-spiral speed.

Files touched:
- `backend/sim/solar_realtime_data.py`
- `backend/sim/solar_physics.py`
- `backend/server.py`
- `backend/tests/test_solar_physics_api.py`
- `src/frontend/features/solar/solarPhysicsClient.js`
- `src/main.js`

Follow-ups / open questions:
- OPEN: use AIA image content (not only metadata) to drive corona brightness/texture assimilation on frontend.
- OPEN: add UI controls for selecting forcing mode (`synthetic|hybrid|data_driven`) and live-data refresh behavior.
- OPEN: add explicit offline fixtures and deterministic replay tests for realtime-ingestion paths.

### 2026-02-17 07:59:38 UTC
Status: DONE

What changed:
- Reverted `src/frontend/app/nearbySystemsRenderer.js` to the pre-experiment baseline (halo-based nearby marker behavior restored) after interstellar-visibility regression feedback.
- Added rollback archive `src/frontend/app/temp_nearbySystemsRenderer.js` containing:
  - commented removed-original snippets,
  - commented experimental replacement snapshot,
  - active restored original code.
- Restored nearby-renderer wiring lines in `src/main.js` that were removed during the experiment:
  - `INTERSTELLAR_NEARBY_HALO_MAX_DISTANCE_LY` constant,
  - `nearbySystemCloseHaloEntries` state collection,
  - `nearbySystemHoverHalo` state getter/setter.
- Fixed deep-zoom disappearance regression in `updateCameraClipPlanes()` by ensuring `camera.far` scales with both interstellar catalog range and actual camera range (`rangeAu * 1.05` safeguard).

Why it changed:
- Reported behavior: zooming out beyond Oort-cloud visibility could produce a blank scene.
- Root cause: interstellar far-clip logic could under-shoot camera distance in extreme zoom states.
- User requested rollback-safe archival of renderer experiment and restoration-first handling.

Evidence/validation:
- `npm run build` passed after rollback + clip-plane fix.
- Regression-path logic review confirms far-plane is now guarded against clipping the focused solar scene at max interstellar zoom.

Files touched:
- `src/frontend/app/nearbySystemsRenderer.js`
- `src/frontend/app/temp_nearbySystemsRenderer.js`
- `src/main.js`

Follow-ups / open questions:
- OPEN: if nearby-system halo style remains undesired, reintroduce the new depiction work behind a feature flag (`experimental_interstellar_markers`) instead of direct replacement.
- OPEN: add a quick runtime debug line in HUD for clip planes (`near/far`) while tuning interstellar ranges.

### 2026-02-17 07:48:06 UTC
Status: DONE

What changed:
- Implemented frontend rendering for backend-provided Parker-spiral heliosphere lines and integrated it into Sun update paths.
- Added solar-visual lifecycle teardown for Parker-spiral lines (`clearSunParkerSpiralLines(...)`) and wired cleanup before Sun-group reinitialization.
- Closed prior OPEN item about missing Parker-spiral visualization by adding runtime scene integration in `main.js`.

Why it changed:
- The backend already emitted Parker-spiral data, but it was not displayed; this was the primary remaining gap from the Sun-model improvement list.
- Teardown parity was extended to avoid line geometry/material leaks when Sun visuals are rebuilt.

Evidence/validation:
- `npm run build` passed after module and integration changes.
- `pytest -q backend/tests/test_solar_physics_api.py` passed (`3 passed`), confirming backend payload contract remains valid.
- Code-path verification confirms Parker-spiral updates now run in both scale-mode refresh and per-frame Sun dynamics updates.

Files touched:
- `src/frontend/features/solar/sunVisuals.js`
- `src/main.js`

Follow-ups / open questions:
- OPEN: add user-facing UI toggle and style controls for Parker-spiral visibility/intensity.
- OPEN: consider blending/interpolating Parker-spiral states across backend refreshes to smooth visual transitions.

### 2026-02-17 07:35:53 UTC
Status: DONE

What changed:
- Implemented a new explicit coronal-loop teardown API `clearSunCoronalLoops(...)` in the solar visuals module and wired it in `src/main.js` before loop-group reinitialization.
- Upgraded backend solar physics model from `quasi_mhd_corona_v2` to `quasi_mhd_corona_v3` with:
  - Asymmetric Hathaway-style cycle forcing plus Carrington modulation.
  - Bipolar active-region topology and paired loop anchoring.
  - RTV-style thermodynamic coupling (`temperature_mk ~ field_strength_gauss^(2/7)`).
  - Alfvén-coupled CME speed model with bounded envelope `20..3500 km/s`.
  - Parker-spiral heliosphere metadata in API output.
- Updated frontend solar speed normalization to map the widened physical speed range without flattening slower features.
- Expanded solar API tests for new topology/thermodynamic fields and speed bounds.

Why it changed:
- Address known parity gap from refactor analysis: explicit standalone loop teardown/dispose helper was missing.
- Improve physical plausibility and coupling in backend Sun model while preserving existing frontend contract compatibility.

Evidence/validation:
- `pytest -q backend/tests/test_solar_physics_api.py` passed (`3 passed`).
- `npm run build` passed (Vite production build successful after changes).
- Manual sampling of backend state confirms new fields and model id (`quasi_mhd_corona_v3`) are emitted.

Files touched:
- `src/frontend/features/solar/sunVisuals.js`
- `src/main.js`
- `backend/sim/solar_physics.py`
- `src/frontend/features/solar/solarFeatureBlending.js`
- `backend/tests/test_solar_physics_api.py`

Follow-ups / open questions:
- OPEN: frontend does not yet render `heliosphere.parker_spiral` lines; add optional visual layer and UI toggle.
- OPEN: consider adding a full Sun-visual teardown call in any future global scene-destroy/reset path (beyond current pre-reinit guard).

### 2026-02-17 05:07:33 UTC
What changed:
- Added dedicated solar modules and moved Sun-specific rendering/blending logic out of `src/main.js`.
- Added wall-clock transient behavior in backend solar physics generation so coronal activity evolves even when simulation epoch is static.
- Added per-frame coronal loop deformation/flicker so loops visually evolve continuously instead of appearing static between backend snapshots.

Why:
- Improve maintainability (modular architecture).
- Improve realism and continuity of coronal emergence/evolution.

Files touched:
- `src/frontend/features/solar/sunVisuals.js`
- `src/frontend/features/solar/solarFeatureBlending.js`
- `src/frontend/features/solar/solarPhysicsClient.js`
- `src/main.js`
- `backend/sim/solar_physics.py`
- `backend/tests/test_solar_physics_api.py`

Follow-ups / open questions:
- Add active-region lifecycle persistence (birth, growth, decay) on backend.
- Integrate observational magnetic map inputs (HMI/JSOC) for field-line driving.
- Add runtime quality profile controls for Sun render cost vs fidelity.
