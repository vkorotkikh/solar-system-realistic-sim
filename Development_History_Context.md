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
