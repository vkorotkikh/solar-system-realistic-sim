# Development Context

## 1) Instruction Layer
This file is a rolling, timestamped development context log for recent high-value engineering changes and decisions.

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
- Soft target: keep total file under `35 KB` or `350` lines.
- Hard cap: if file exceeds `48 KB` or `500` lines, prune oldest notes from the bottom.
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
