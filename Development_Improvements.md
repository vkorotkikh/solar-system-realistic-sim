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

### 2026-02-18 07:49:28 UTC
Status: `DONE`
Type: `FIX`
Summary:
- Eliminated per-frame `set_time_scale` WebSocket traffic by switching to a dirty-flag sync model.

Context / rationale:
- The animation loop was sending `set_time_scale` every render frame while connected, creating avoidable control-channel spam (~60 msgs/s) with no value when unchanged.

Proposed approach:
- Added `simState.timeScaleDirty` in the state store.
- Marked the flag on UI slider changes in `timeController`.
- Sent `set_time_scale` only when dirty in `animationLoop`, then cleared the flag.
- Cleared the flag on backend-ready initial sync in `main.js`.

Expected impact:
- Lower steady-state WebSocket message volume.
- Cleaner control signaling and less backend parsing overhead.

Affected files/systems:
- `src/frontend/app/stateStore.js`
- `src/frontend/app/timeController.js`
- `src/frontend/app/animationLoop.js`
- `src/main.js`

Next step:
- Add a focused frontend unit/integration check for "time-scale updates emit only on change".

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

### 2026-02-18 07:45:47 UTC
Status: `DONE`
Type: `FIX`
Summary:
- Recalibrated CME speed synthesis to restore a realistic slow-CME population at low solar activity while preserving extreme-event ceiling behavior.

Context / rationale:
- Low-activity distributions were too compressed toward higher speeds in visible output slices, reducing representation of gradual/slow eruptions.

Proposed approach:
- Implemented a deterministic three-term speed model (`base + activity + eruption`) with reduced base/activity gain and stronger eruption-only burst contribution.
- Kept hard physical clamps at `20..3500 km/s` for compatibility with existing rendering and schema expectations.

Expected impact:
- Better physical plausibility across cycle minima and maxima.
- Improved separation between routine slow events and rare fast eruptions without introducing non-determinism.

Affected files/systems:
- `backend/sim/solar_physics.py`
- `backend/tests/test_solar_physics_model.py`

Next step:
- Add optional API telemetry for CME speed distribution percentiles to track drift across future parameter updates.

### 2026-02-18 07:45:46 UTC
Status: `DONE`
Type: `UX`
Summary:
- Improved Parker spiral readability by adding camera-distance fading and polarity-aware color encoding.

Context / rationale:
- Spiral lines created visual clutter when zoomed in near the Sun, and polarity structure was not clearly distinguishable.

Proposed approach:
- Applied opacity fade based on camera distance (`~0.5 AU` near-hide, stronger visibility farther out).
- Mapped polarity sign to distinct warm/cool tones and retained wind-dependent modulation for sector emphasis.

Expected impact:
- Cleaner close-up solar views.
- Better interpretability of heliospheric polarity sectors during zoomed-out exploration.

Affected files/systems:
- `src/frontend/features/solar/sunVisuals.js`
- `src/main.js`

Next step:
- Add a UI toggle for Parker spiral visibility and style presets for diagnostic vs presentation modes.

### 2026-02-18 07:45:45 UTC
Status: `DONE`
Type: `FIX`
Summary:
- Added focused backend model tests for cycle asymmetry, Hale polarity flipping, CME speed spread, and Parker spiral extent; updated API test expectation for current activity model identifier.

Context / rationale:
- API smoke tests alone were insufficient to guard regressions in newly tuned physical behavior and metadata labels.

Proposed approach:
- Added dedicated model-level tests for:
- Hathaway-shaped activity curve asymmetry
- Cycle-to-cycle polarity sign inversion
- Slow/fast CME population coverage
- Multi-AU Parker spiral geometry payload
- Updated existing API assertion to `hathaway_2015_normalized`.

Expected impact:
- Higher confidence in physics behavior stability after future refactors.
- Faster detection of regressions in synthesis logic.

Affected files/systems:
- `backend/tests/test_solar_physics_model.py`
- `backend/tests/test_solar_physics_api.py`

Next step:
- Wire these tests into the default backend CI target so they run on all solar-physics changes.

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
