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

### 2026-03-22 — Procedural Quadtree LOD and Shaders for Planetary Surfaces
Status: DONE

What changed:
- **Quadtree LOD System (`quadtreeLOD.ts`):** Replaced static low-poly `SphereGeometry` for Earth, Moon, and Mars with a dynamic quadtree mesh generation system. Subdivides terrain chunks (up to level 7, spanning 6 cube faces) dynamically based on distance to the camera to ensure massive geometric detail when zoomed in.
- **Procedural Displacement Shaders (`planetShaders.ts`):** Custom high-performance GLSL vertex and fragment shaders that compute dynamic terrain height using 3D Fractal Brownian Motion (FBM) and ridged noise. Normal vectors are calculated per-vertex using finite-differences. Added fragment-level micro-bump mapping and extended color blending to improve realism when hovering right above the surface. 
- **Solar System Integration (`main.ts`, `localSystemRenderer.ts`):** Wired the Quadtree logic into the active animation loops `update()` call and instanced it in place of standard planet meshes. Calculates local-space lighting direction to correctly shade the planets.

Why it changed:
- The user requested realistic, high-fidelity modeling of planetary surfaces that could seamlessly scale from a deep space overview down to the level of surface details like the Grand Canyon.

Evidence/validation:
- Build pipeline and TypeScript typechecker passed with no errors regarding geometry substitution.
- Verified visual detail down to surface level scaling dynamically via LOD patching.

Files touched:
- `src/frontend/features/planetary/quadtreeLOD.ts` [NEW]
- `src/frontend/features/planetary/planetShaders.ts` [NEW]
- `src/main.ts`
- `src/frontend/app/localSystemRenderer.ts`

Follow-ups / open questions:
- OPEN: Consider extending procedural topology logic to other planets like Mercury and Venus.
- OPEN: Test maximum hardware capacity for `MAX_LOD_LEVEL` on varying browsers.

### 2026-03-21 — Data-Driven Global Magnetic Field (PFSS solver)
Status: DONE

What changed:
- **PFSS Backend Solver (`pfss_magnetogram.py`):** A custom numpy-based solver for the Altschuler-Newkirk PFSS model. Ingests GONG synoptic magnetograms, decomposes into spherical harmonics (up to ℓ=15), solves the potential field, and traces field lines out to the source surface (2.5 Rsun). Handles open/closed tagging based on footpoint and endpoint.
- **Frontend Integration (`solarMagnetics.ts`, `sunController.ts`):** Renders the exact traced coordinates from the backend rather than using local analytical dipole/quadrupole approximations. Incorporates Carrington rotation into the caching signature to ensure visual updates on solar rotation boundaries.

Why it changed:
- SOTA evaluation showed our analytical model was unrealistic. We needed a true magnetogram-driven topology to hit SOTA benchmarks and reproduce actual streamer belts and coronal holes.

Evidence/validation:
- Pytest covers caching, fallback logic, Carrington rotation calculations, and geometry validation (open lines must reach > 2.4 Rsun).
- Frontend successfully falls back to analytical when GONG is down, or correctly renders lines matching the exact GONG map state.

Files touched:
- `backend/sim/pfss_magnetogram.py`
- `backend/sim/solar_physics.py`
- `src/frontend/features/solar/solarMagnetics.ts`
- `src/sunController.ts`

### 2026-03-21 — Data-Driven Coronal Hole Detection & Fast-Wind Coupling
Status: DONE

What changed:
- **AIA 193Å Coronal Hole Detection (`solar_realtime_data.py`):** Added `detect_coronal_holes()` method (163 lines). Thresholds AIA 193Å tiles at `0.25 × median(disk)` — inspired by CATCHES (Heinemann+ 2019) and SPoCA (Verbeeck+ 2014). Pipeline: grayscale conversion → disk mask via circle geometry → intensity thresholding → morphological erode/dilate cleanup (3×3 kernel, scipy-free) → BFS connected component labeling → heliographic lat/lon bounding box mapping via plate-carrée approximation. Returns up to 8 regions sorted by area, with coverage fraction, polar open flux, and per-hole type classification (polar >50° lat, equatorial otherwise). Integrated into `_fetch_sdo_aia()` reusing the already-cached 193Å tile.
- **Synthetic Coronal Hole Fallback (`solar_physics.py`):** Added `_synthetic_coronal_holes()` static method. Generates physically plausible holes from activity index: polar holes centered at ±72° lat with extent that shrinks 70% from solar min to max; stochastic equatorial holes appear when `activity > 0.35` (seeded PRNG from JD for reproducibility). Fallback activates automatically when realtime data is unavailable.
- **Parker Spiral Fast-Wind Coupling (`solar_physics.py`):** Updated `_build_parker_spiral()` to accept `coronal_holes` parameter. Polar coronal holes feed fast wind (660-780 km/s) to 4/6 spiral arms at solar minimum via super-radial expansion model (coupling diminishes toward solar max). Equatorial holes use direct HCS-tilt-based latitude matching. Each spiral line now includes `in_coronal_hole: bool` flag and physically meaningful wind speed (fast: 660-780 km/s, slow: 350-450 km/s). `sample_state()` extracts coronal holes from realtime data or synthesizes, passes to Parker spiral, includes in output under `coronal_holes`.
- **Corona Shader Upgrade (`sunVisuals.ts`):** Added `coronalHoles[8]` vec4 array (center_lon, center_lat, extent_lon, extent_lat) and `coronalHoleCount` float uniform. Fragment shader computes per-fragment lat/lon from normal direction, matches against hole boundaries with longitude wrap-around and smooth edge falloff via `smoothstep`. Emission drops ~5× inside holes (`alpha *= mix(1.0, 0.2, inHole)`). Falls back to `coronalHoleActivity`-driven polar darkening when `coronalHoleCount == 0`. Uniform update in `updateSunMaterialUniforms()`, 8-element Vector4 initialization in `createSunCoronaShell()`.
- **Solar Wind Enhancement (`solarWind.ts`):** Added `solarWindSpeedWithHoles()` — checks if latitude falls inside any coronal hole boundary for fast/slow wind assignment with fallback to existing `solarWindSpeed()`.
- **Controller Wiring (`sunController.ts`):** Passes `solarPhysicsState?.coronal_holes ?? null` as `coronalHoleData` to `updateSunMaterialUniforms()`.
- **Bug Found & Fixed:** Initial implementation only checked `source_lat = hcs_tilt * sin(phase)` against coronal hole boundaries, but HCS tilt at solar minimum (~7°) never reaches polar hole boundaries at ±72°. Fixed by adding polar super-radial expansion coupling: polar holes feed fast wind to most spiral arms at solar minimum regardless of HCS tilt, with coupling strength diminishing toward solar max.

Why it changed:
- SOTA evaluation identified coronal hole detection as a 🔴 Major gap. The simulation had no mechanism to identify or visualize coronal holes, and the Parker spiral used a generic latitude-only wind model that didn't distinguish fast/slow wind channels.

Evidence/validation:
- `pytest tests/test_solar_physics_model.py tests/test_solar_physics_api.py -v` — **15/15 passed** (0.51s), including 4 new tests:
  - `test_synthetic_coronal_holes_present_at_solar_minimum` — verifies polar holes exist, coverage > 5%
  - `test_synthetic_coronal_holes_coverage_decreases_at_solar_max` — verifies polar area shrinks
  - `test_parker_spiral_fast_wind_in_coronal_holes` — verifies fast wind > 600 km/s in holes, slow < 500 km/s outside
  - `test_solar_physics_returns_coronal_hole_section` — verifies API response includes all required fields
- Smoke test output at solar minimum (activity 0.107): 4/6 spiral arms ⚡ fast wind (663-778 km/s), 2/6 🌊 slow wind (399-414 km/s) — matches Ulysses observations.
- Smoke test output at solar maximum (activity 0.919): 2/6 ⚡ fast wind from equatorial holes, 4/6 🌊 slow wind — matches mixed streamer-dominated heliosphere.

Files touched:
- `backend/sim/solar_realtime_data.py` — `detect_coronal_holes()`, `_fetch_sdo_aia()` integration, `coronal_holes` field
- `backend/sim/solar_physics.py` — `_synthetic_coronal_holes()`, `_build_parker_spiral()` (coronal hole coupling), `sample_state()` (extraction/synthesis/output)
- `src/frontend/features/solar/sunVisuals.ts` — corona shader uniforms, fragment matching logic, uniform update
- `src/frontend/features/solar/solarWind.ts` — `solarWindSpeedWithHoles()`
- `src/sunController.ts` — data flow wiring
- `backend/tests/test_solar_physics_model.py` — 3 new tests
- `backend/tests/test_solar_physics_api.py` — 1 new test

Follow-ups / open questions:
- OPEN: Add coronal hole debug overlay panel showing detected boundaries on the solar disk.
- OPEN: Replace BFS flood-fill with `scipy.ndimage.label` when available for ~10× faster connected-component labeling.
- OPEN: Wire `solarWindSpeedWithHoles()` into the frontend wind profile generation loop (`generateWindProfile()`).
- OPEN: Visual verification of corona darkening at coronal hole boundaries in browser.

### 2026-03-12 — DEM Channel Response, Transition Region Shell & HCS Tilt Physics Fix
Status: IN-PROGRESS

What changed:
- **DEM Channel Response (corona shader):** Added a `demChannelResponse()` GLSL function implementing Gaussian instrument response functions for all 5 AIA passbands based on Lemen et al. 2012 (Solar Physics 275). Each channel has a peak `log T` and sigma: 094Å→6.8/0.22, 171Å→5.8/0.28, 193Å→6.2/0.32, 211Å→6.3/0.25, 304Å→4.7/0.35. A simplified radial corona temperature profile (1 MK inner → 2.2 MK mid → 1.5 MK outer, plus burst/activity heating) drives the response, modulating corona alpha when a channel is active.
- **AIA False-Color Corona:** When a specific AIA channel is selected, the corona shader now tints to match SDO/AIA false-color conventions: 094Å green (Fe XVIII), 171Å blue-white (Fe IX), 193Å brown-gold (Fe XII), 211Å purple (Fe XIV), 304Å red (He II). Blends 65% toward channel color scaled by DEM response intensity.
- **Transition Region (TR) Shell:** New `createTransitionRegionShell()` and `updateTransitionRegionShell()` functions in `sunVisuals.ts`. The TR is a thin (~100 km) emissive layer at ~1.004 R☉ between the chromosphere (20,000 K) and corona (1 MK). Rendered as a `BackSide` additive-blended sphere at 1.006× Sun radius with:
  - Limb brightening: `pow(1-μ, 2.8)` — strong limb emission characteristic of optically thin EUV layers.
  - Supergranulation network pattern (~30 Mm cells) using multi-octave noise.
  - Activity-dependent emission scaling.
  - Channel-dependent appearance: 304Å makes TR the dominant feature (channelBoost 3.2×, magenta-red); 171Å moderate; 193/211Å dim; 094Å invisible (too cool for Fe XVIII).
- **DEM-Aware Coronal Loops:** `updateSunCoronalLoopsFromBlendView()` now accepts an `activeChannel` parameter. Loop colors and opacity modulation are channel-specific: 094Å dims quiet loops and boosts CMEs (Fe XVIII response); 171Å boosts quiet loops and dims CMEs (Fe IX response); 304Å dims all coronal loops (too hot for He II). Each channel uses its SDO false-color palette.
- **HCS Tilt Physics Fix (backend):** Replaced linear HCS tilt formula (`7.25 + activity * 15.0` = max 22°) with polynomial ramp `7.25 + 67.75 * (activity^1.8)` clamped to [7°, 75°], matching Wilcox Solar Observatory observations of heliospheric current sheet tilt ranging from ~7° at solar minimum to ~75° at solar maximum. The polynomial's exponent (1.8) produces a gentle rise at low activity and steep ramp above activity ~0.5.
- **Parker Spiral Latitude Fix:** Removed artificial `0.16×` damping factor on spiral arm latitude excursion. Spiral arms now show full HCS-tilt-driven latitudinal oscillation (`lat = hcs_tilt_rad * sin(phi + ...)`), producing flat spiral at solar minimum and highly warped current sheet geometry at solar maximum.
- **Sun Controller Integration:** Wired transition region shell into Sun group hierarchy, per-frame update path, and scale-mode resize. Threaded `activeChannel` through to `updateSunMaterialUniforms` and `updateSunCoronalLoopsFromBlendView`.

Why it changed:
- Prior OPEN item from Phase 13 (coronal loop temperature stratification, DEM-aware AIA channels) is now partially addressed.
- The transition region was the only major solar atmospheric layer not yet rendered — completing the photosphere→chromosphere→TR→corona stack.
- HCS tilt was under-parameterized (max 22° vs observed 75°), producing unrealistically flat Parker spiral geometry at solar maximum.

Evidence/validation:
- Changes are in working tree (uncommitted). Build validation pending.
- DEM response function produces expected behavior: 094Å filters out cool corona, 304Å filters out hot corona, 171/193/211Å respond at their documented peak temperatures.

Files touched:
- `src/frontend/features/solar/sunVisuals.ts` — DEM shader, TR shell, channel-aware loop coloring, `channelMode` uniform
- `backend/sim/solar_physics.py` — HCS tilt polynomial, Parker spiral latitude fix
- `src/sunController.ts` — TR shell wiring, activeChannel threading

Follow-ups / open questions:
- OPEN: Commit and build-validate the DEM + TR changes.
- OPEN: Surface material (photosphere shader) does not yet respond to `channelMode` — adding DEM-driven photospheric appearance would complete the channel-filter visualization stack.
- OPEN: TR shell currently shares geometry with corona; consider a dedicated higher-resolution sphere for the thin TR layer.
- OPEN: Phase 13 remaining items: DEM-aware AIA channel rendering for photosphere, irradiance variability model.

### 2026-03-09 — Comprehensive TypeScript Type Safety Pass
Status: DONE

What changed:
- Executed a 7-commit type safety sweep across ~15 modules, adding explicit TypeScript interfaces, parameter type annotations, return type declarations, and structured option types. This is the largest single typing effort since the JS→TS migration completed.
- Modules enhanced:
  - **Solar stack:** `solarWind.ts` (wind state/particle interfaces), `solarPhysicsClient.ts` (API response/query types), `solarProminences.ts` (prominence geometry/lifecycle types), `solarMagnetics.ts` (field line config/dipole interfaces), `solarObservationTexture.ts` (channel/observation control types), `gravitationalWaves.ts` (GW visualization params), `solarFeatureBlending.ts` (blend state/view interfaces).
  - **Planetary:** `satelliteSystem.ts` (satellite orbit/propagation interfaces), `cloudDataPipeline.ts` (cloud layer/tile types).
  - **Navigation/Rendering:** `nearbySystemsRenderer.ts` (star marker/rendering interfaces), `plannerController.ts` (mission plan/leg types), `labelSystem.ts` (label config/overlay types), `localSystemRenderer.ts` (local body/ring rendering interfaces).
  - **Camera:** `transitions.ts` (transition config/state types).
- Total: ~774 lines of type definitions added across 15 files.

Why it changed:
- Addresses the long-standing OPEN item: "~80+ pre-existing `implicit any` TypeScript errors across many files need gradual typing."
- Typing these modules provides compile-time safety for the most complex rendering and physics interfaces.

Evidence/validation:
- Each commit focused on a coherent module group (solar, planetary, navigation, etc.).
- Interfaces follow existing runtime shapes — no behavioral changes, purely additive type safety.

Files touched:
- `src/frontend/features/solar/{solarWind,solarPhysicsClient,solarProminences,solarMagnetics,solarObservationTexture,gravitationalWaves,solarFeatureBlending}.ts`
- `src/frontend/features/planetary/{satelliteSystem,cloudDataPipeline}.ts`
- `src/frontend/app/{nearbySystemsRenderer,plannerController,labelSystem,localSystemRenderer}.ts`
- `src/frontend/camera/transitions.ts`

Follow-ups / open questions:
- OPEN: `animationLoop.ts`, `cameraController.ts`, `inputHandler.ts`, `uiBindings.ts`, `main.ts` still have implicit-any gaps — these are the remaining high-value typing targets.
- OPEN: Consider adding a `src/types/` barrel file aggregating shared interfaces for cross-module contracts.

### 2026-03-09 — Testing Infrastructure: Vitest + Unit Tests
Status: DONE

What changed:
- Added Vitest as the frontend testing framework (`package.json` devDependency, configuration).
- Created unit tests for `stateStore` (state management change tracking, dirty flag behavior) and `orbitMath` (Kepler solver, orbital element calculations).
- Added trajectory regression tests and WebSocket protocol version handling in `simulationClient.ts`.

Why it changed:
- No frontend unit testing framework existed prior to this. Vitest was chosen for native ESM/TypeScript support and Vite integration.
- `stateStore` and `orbitMath` are high-risk modules (state correctness and physics accuracy) that benefit most from regression coverage.

Evidence/validation:
- `stateStore.test.ts` and `orbitMath.test.ts` created and passing.
- `test_trajectory_regression.py` updated for backend parity.

Files touched:
- `package.json`, `package-lock.json` — Vitest devDependency
- `src/frontend/app/stateStore.test.ts` — [NEW]
- `src/sim/orbitMath.test.ts` — [NEW]
- `src/frontend/app/simulationClient.ts` — WebSocket protocol version
- `backend/tests/test_trajectory_regression.py` — trajectory regression update

Follow-ups / open questions:
- OPEN: Expand test coverage to `solarSystemModel.ts` (propagation accuracy), `asteroidDistributions.ts` (PRNG determinism), and `catalog.ts` (data parsing).
- OPEN: Add `npm run test` script and wire into CI gate alongside `npm run typecheck`.

### 2026-03-09 — Multi-Module Enhancements: State Management, Secular Rates, Cloud Pipeline
Status: DONE

What changed:
- **State management refactor:** Improved change tracking in `stateStore.ts` with cleaner dirty-flag propagation for simulation state mutations.
- **Secular orbital rates:** Added linear secular rate coefficients (da/dt, de/dt, dI/dt, dΩ/dt, dω/dt) for planetary orbits in `planets.ts`. These correct for slow orbital element drift over centuries, improving long-duration propagation accuracy beyond the J2000 osculating elements.
- **Cloud data pipeline:** Enhanced `cloudDataPipeline.ts` with structured type definitions for cloud layer tiles, blending parameters, and eviction lifecycle.
- **Camera transitions:** Added typed interfaces to `transitions.ts` for transition configuration, easing profiles, and interpolation state.
- **Solar corona engineering plan:** Added `my-notes/` document outlining the engineering plan for upcoming solar corona physics improvements (DEM channels, transition region, etc.).

Why it changed:
- Secular rates address a known accuracy gap: osculating elements alone drift visibly for outer planets over simulation timescales of hundreds of years.
- State management and pipeline typing were prerequisites for the broader type safety pass.

Evidence/validation:
- Build passes after all changes.
- Secular rate values sourced from Standish 1992 / Meeus planetary tables.

Files touched:
- `src/frontend/app/stateStore.ts` — change tracking refactor
- `src/data/planets.ts` — secular rate coefficients
- `src/frontend/features/planetary/cloudDataPipeline.ts` — typed interfaces
- `src/frontend/camera/transitions.ts` — typed interfaces
- `my-notes/` — solar corona engineering plan document

Follow-ups / open questions:
- OPEN: Wire secular rates into `solarSystemModel.ts` propagation to actually use the coefficients at runtime.
- OPEN: Validate secular rate drift against JPL Horizons for Jupiter/Saturn over ±500 year windows.

### 2026-03-09 — Binary KBO System Implementation
Status: DONE

What changed:
- Added binary KBO companion support across the full stack (frontend data model, rendering, propagation, backend physics, tests).
- ~20% of generated KBOs now have gravitationally-bound companions with mutual Keplerian orbits.

Why it changed:
- Codebase audit identified "No binary KBOs" as the biggest gap in the Kuiper Belt simulation (7/10 score). Observationally, ~30% of cold classical KBOs are binaries (Noll+ 2008).

Evidence/validation:
- Vite build succeeds (37 modules, 1.54s).
- Backend tests in `test_kuiper_binary.py` (8 cases) pass when `rebound` is available; gracefully skip otherwise.
- Binary companions rendered via a separate `InstancedMesh` in `beltRenderer.ts` — no breaking changes to existing asteroid belt rendering.

Files touched:
- `src/sim/kuiperBelt.ts` — `BinaryCompanionDef`, `BINARY_FRACTION`, `generateBinaryCompanion()`, `propagateBinaryKBOPositions()`
- `src/frontend/features/asteroids/beltRenderer.ts` — companion mesh construction, `updateBinaryPositions()`
- `src/main.ts` — import, buffer allocation, scene addition, animation loop, cleanup
- `backend/sim/kuiper.py` — binary pair generation, `get_state()` now returns dict with `positions` + `binary_pairs`
- `backend/tests/test_kuiper_binary.py` — [NEW]

Follow-ups / open questions:
- Consider visual indicators (tidal bridge lines) for tight binary pairs.
- Support named binary KBOs (1998 WW31, Borasisi–Pabu) in the `NAMED_KBOS` array.
- Backend `get_state()` return type change may require WebSocket handler update in `server.py`.

### 2026-03-07 — Comprehensive Codebase Audit: Medium/Low Severity Fix Pass
Status: DONE

What changed:
- Completed a 15-item fix pass addressing medium and low severity issues from a comprehensive codebase analysis (issues #9–#23). All fixes applied, one issue (#11) was already resolved.

Summary of fixes:
1. **Chunked async asteroid pipeline (#9):** Added chunked processing (10k per batch) with `setTimeout(0)` yields and reused `Vector3`/`Color` objects to prevent main-thread blocking and GC pressure during ~1.9M asteroid generation.
2. **Reusable Color in beltRenderer (#10):** Added module-level `_reusableColor` object for `addInstanceColorData` to eliminate per-call allocations.
3. **Sequential fetches (#11):** Already fixed — `Promise.all` was in place at line 634 of `phase1AsteroidCatalog.ts`.
4. **force-cache → no-cache (#12):** Changed `cache: 'force-cache'` to `cache: 'no-cache'` in `loadPhase1CatalogMetadata()` to prevent stale metadata causing checksum mismatches.
5. **CSV parser (#13):** Replaced naive comma-split parser in `scripts/fetch_utils.py` with Python `csv.DictReader` for RFC-compliant field handling.
6. **Resource cleanup (#14):** Added `beforeunload` handler in `main.ts` disposing worker, belt renderers, body meshes (geometry + materials), orbit lines, label sprites, background stars, sun texture, and renderer.
7. **resizeRenderer every frame (#15):** Removed redundant `resizeRenderer()` call from animation loop — already handled by `window.addEventListener('resize')`.
8. **Deduplicate utilities (#16):** Consolidated `clamp()` imports to `constants.ts` across 4 files, `lerp()` to `constants.ts` in `textures.ts`, extracted `solveKeplerFast()` to `orbitMath.ts`, and exported `disposeThreeMaterial` from `textureManager.ts`.
9. **Dead code (#17):** Deleted `temp_nearbySystemsRenderer.ts` (1127 lines), deleted fake `asteroidCatalogLoader.test.ts`, removed unused `MU_SUN_AU3_DAY2` import and `Math.sqrt(1)` no-op from `asteroidBelt.ts`.
10. **Typo (#18):** Renamed `ALCBEO_SCALE_U16` → `ALBEDO_SCALE_U16` in `asteroidCatalogLoader.ts`.
11. **BFS Array.shift() (#19):** Replaced O(n) `Array.shift()` in `buildUpdateOrder()` with O(1) index counter pattern in `solarSystemModel.ts`.
12. **Math.random() → seeded PRNG (#20):** Added module-level mulberry32 seeded PRNG to `asteroidDistributions.ts`, replaced all `Math.random()` calls with `_rng()`, exported `seedDistributionRng()`.
13. **const enum → enum (#21):** Changed `const enum` to regular `enum` in `asteroidBelt.ts`, `kuiperBelt.ts`, and `asteroidTaxonomyResolver.ts` (7 enums total) to prevent erasure breaking web worker imports.
14. **Null-checks (#22):** Added `getContext('2d')` null guards in `main.ts`, `labelSystem.ts` (3 functions), and `nearbySystemsRenderer.ts`.
15. **Shader patching warning (#23):** Added fragility warning comment before `onBeforeCompile` in `beltRenderer.ts`.

Why it changed:
- Codebase analysis identified these as remaining medium/low severity issues after severe/high issues were already addressed.

Evidence/validation:
- Build check confirmed no new TypeScript errors introduced. All pre-existing `implicit any` errors are unchanged.
- Each fix verified against the specific issue description and affected code.

Files touched:
- `src/sim/asteroids/asteroidPipeline.ts` — chunked processing, object reuse
- `src/frontend/features/asteroids/beltRenderer.ts` — reusable Color, shader warning
- `src/sim/phase1AsteroidCatalog.ts` — cache policy fix
- `scripts/fetch_utils.py` — CSV parser replacement
- `src/main.ts` — resource cleanup handler, resize removal, null-checks, type annotations
- `src/sim/solarSystemModel.ts` — BFS optimization
- `src/sim/asteroids/asteroidDistributions.ts` — seeded PRNG
- `src/data/asteroidCatalogLoader.ts` — typo fix (ALBEDO)
- `src/sim/asteroidBelt.ts` — dead code removal, const enum → enum, solveKeplerFast import
- `src/sim/kuiperBelt.ts` — const enum → enum, solveKeplerFast import
- `src/data/asteroidTaxonomyResolver.ts` — const enum → enum
- `src/frontend/app/labelSystem.ts` — null-checks
- `src/frontend/app/nearbySystemsRenderer.ts` — null-check
- `src/sim/orbitMath.ts` — exported solveKeplerFast
- `src/constants.ts` — canonical clamp/lerp exports
- `src/textures.ts` — lerp import from constants
- `src/sim/catalog.ts` — clamp import from constants
- `src/frontend/features/planetary/cloudDataPipeline.ts` — clamp import from constants
- `src/frontend/features/solar/solarPhysicsClient.ts` — clamp import from constants
- `src/frontend/features/superluminal-modeling/agnShockwaveEngine.ts` — clamp import from constants
- `src/frontend/app/textureManager.ts` — disposeThreeMaterial export
- `src/frontend/app/routeRenderer.ts` — disposeThreeMaterial import
- Deleted: `src/frontend/app/temp_nearbySystemsRenderer.ts`, `src/data/asteroidCatalogLoader.test.ts`

Follow-ups / open questions:
- OPEN: ~80+ pre-existing `implicit any` TypeScript errors across many files need gradual typing (animationLoop.ts, cameraController.ts, inputHandler.ts, etc.).
- OPEN: `asteroidPipeline.ts` still uses `Math.random()` for bucket selection and spin axis generation (lines 59, 74-76, 81) — these were intentionally left as non-deterministic since they affect rendering only, not orbital mechanics.

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
