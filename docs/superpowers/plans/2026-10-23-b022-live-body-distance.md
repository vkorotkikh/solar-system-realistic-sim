# B022 Live Body Distance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the inspected body's solar-distance field current during simulation without rerendering static panel content.

**Architecture:** Extract distance formatting/updating from `updateBodyInfoPanel`, keyed by the durable `dom.bodyInfo.dataset.bodyId`. Add a named main frame stage beside the HUD that samples RAF wall-clock time every 250 ms after the model stage; it reads canonical model state and writes only when the formatted text changes.

**Tech Stack:** TypeScript, Vitest, Three.js, real `SolarSystemModel`, npm

**Spec:** `agent-notes/BUG_FIX_REPORT_2026-10-17.md` (B022) and the task's approved minimal-fix constraints

## Global Constraints

- Read `model.getState(bodyId)?.worldPosition.length()`; never use rendered nodes or focus/follow identity.
- The inspected identity is `dom.bodyInfo.dataset.bodyId`.
- Selection updates distance immediately; periodic refresh uses RAF `timestamp` at a 250 ms wall-clock cadence.
- The cadence is independent of pause, negative time scale, and reduced-motion preference; use no timer and perform no catch-up loop.
- Skip periodic work while the panel is hidden or has no inspected ID.
- Display `State unavailable` for missing/unavailable state and recover automatically.
- Assign `bodyInfoDistance.textContent` only when the formatted value changes.
- Leave work uncommitted for independent review.

## Review Focus

- The panel may inspect a different body than the focused/followed body and must keep that identity.
- A model mutation earlier in the same frame must be visible to the distance stage.
- Cadence boundaries must refresh at 0 and 250 ms, but not 249 ms.
- Unavailable state must recover without reselection, while unchanged formatted values cause no DOM write.
- Hidden/no-ID panels must perform neither model reads nor writes.

---

### Task 1: Refresh the inspected distance from the frame lifecycle

**Files:**
- Modify: `src/main.ts:690-711,1226-1270`
- Create: `src/main.bodyInfo.test.ts`

**Interfaces:**
- Consumes: canonical `model.getState(id)`, `dom.bodyInfo.dataset.bodyId`, `dom.bodyInfo.hidden`, and frame `timestamp`.
- Produces: `updateBodyInfoDistance(bodyId?)`, a 250 ms frame refresher, and a named `body-info` stage after model state application.

- [x] **Step 1: Add production-path RED tests**

Extract the actual main panel declarations and actual frame-stage array. Run the stages with the real catalog/model and counting DOM fields to prove durable inspected identity, immediate selection, exact 0/249/250 ms cadence, same-frame model mutation, pause/reverse/reduced-motion independence, unavailable recovery, write deduplication, and hidden/no-ID skipping.

- [x] **Step 2: Verify RED**

Run `npm test -- --run src/main.bodyInfo.test.ts`.

Expected: selection behavior passes, but frame-driven reads/updates fail because no `body-info` stage exists.

- [x] **Step 3: Implement the minimal dynamic updater and stage**

Extract the distance-only updater, compare before assigning text, add a stateful 250 ms RAF-timestamp refresher, call the updater from selection, and register `body-info` beside `hud` after `model`.

- [x] **Step 4: Verify focused behavior and types**

Run the new test plus the three-file 19-test lifecycle baseline, then strict TypeScript and the ratchet.

- [x] **Step 5: Review and hand off**

Run the full relevant frontend suite and `git diff --check`, inspect the scoped diff, update this plan and ignored ledger, and hand off uncommitted for independent review.

## Verification Evidence

- RED: `npm test -- --run src/main.bodyInfo.test.ts` — 3 tests failed for the expected stale-frame behavior (zero periodic state reads, stale same-frame distance, and stale unavailable state).
- Focused GREEN: the new test plus the three lifecycle modules — 4 files / 22 tests passed.
- Full frontend suite: 78 files passed, 1 skipped; 791 tests passed, 413 skipped.
- `npm run typecheck` and `npm run typecheck:ratchet` passed with zero new diagnostics.
- `git diff --check` passed; scoped diff reviewed and left uncommitted for independent review.
