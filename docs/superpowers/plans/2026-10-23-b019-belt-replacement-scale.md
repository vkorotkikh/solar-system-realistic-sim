# B019 Belt Replacement Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every Phase-1 asteroid renderer replacement adopts the live realistic/display scale before entering the scene.

**Architecture:** Execute the actual nested `refreshAsteroidBeltRenderer` declaration from `src/main.ts` in a focused test, injecting only its surrounding runtime bindings. Preserve the existing replacement lifecycle and add one live-state `setScaleMode` call between renderer configuration and scene adoption. Existing Phase-1 startup tests retain coverage of rejected and empty catalog branches.

**Tech Stack:** TypeScript, Vitest, Three.js, npm

**Spec:** `agent-notes/BUG_FIX_REPORT_2026-10-17.md` (B019) and the task's approved minimal-fix constraints

## Global Constraints

- Production changes are limited to `src/main.ts` and must not call the full `applyScaleMode` path.
- Read `simState.useRealisticScale` at replacement adoption time, after construction/configuration and before `solarSystemGroup.add`.
- Exercise the actual production declarations rather than a copied lifecycle implementation.
- Preserve rejected/empty catalog behavior through the existing startup suite and remove/dispose the old renderer exactly once on replacement.
- Use the npm package scripts; leave the work uncommitted for independent review.

## Review Focus

- Display and realistic replacements must have the corresponding real instance scale before the Group's `childadded` event.
- A scale toggle while catalog loading is deferred must win at adoption time.
- Removal, disposal, scale application, and addition must retain their lifecycle order.
- The existing startup suite must continue protecting rejected and empty catalog results.
- The focused catalog/renderer baseline and TypeScript ratchet must remain green.

---

### Task 1: Preserve scale during Phase-1 renderer adoption

**Files:**
- Modify: `src/main.ts:538-545`
- Create: `src/main.asteroidRefresh.test.ts`

**Interfaces:**
- Consumes: live `simState.useRealisticScale`, `BeltRendererHandle.setScaleMode(boolean)`, and Three `Group.add/remove`.
- Produces: a replacement renderer whose matrices already match the live scale when added.

- [x] **Step 1: Add RED tests against the actual main declaration**

Recursively locate, extract, and transpile the production `refreshAsteroidBeltRenderer` function nested in `startSimulation`. Execute it with real asteroid renderers and a real Three Group to cover display mode, realistic mode, a live latest-toggle-at-adoption case, pre-add scale ordering, and exact old-renderer removal/disposal. Rely on the existing Phase-1 startup suite for rejected/empty behavior rather than expanding the source-execution harness to `initPhaseOneAsteroids`.

- [x] **Step 2: Verify RED**

Run `npm test -- --run src/main.asteroidRefresh.test.ts`.

Expected: realistic/deferred cases observe display-scale matrices at the `childadded` event.

Observed: `1 passed, 2 failed`; display passed, while realistic and live latest-flag cases both observed `0.007585397...` instead of `0.000003139...`.

- [x] **Step 3: Apply the minimal production fix**

Call `asteroidBeltRenderer.setScaleMode(simState.useRealisticScale)` after perturber configuration and before `solarSystemGroup.add(asteroidBeltRenderer.mesh)`.

- [x] **Step 4: Verify focused frontend behavior and types**

Run the new test, the six-file 44-test catalog/renderer baseline, and `npm run typecheck:ratchet`.

Observed: `7 files passed; 47 tests passed`. TypeScript ratchet passed with `0/226` legacy diagnostics and no bucket regression.

- [x] **Step 5: Diff review and uncommitted handoff**

Run `git diff --check`, inspect the complete diff/status, and update this plan plus its ignored ledger. Do not commit before independent review.

Observed: `git diff --check` passed. The scoped worktree contains only `src/main.ts`, this plan, and `src/main.asteroidRefresh.test.ts`; the ignored SDD ledger records the same evidence. Ready for independent review, uncommitted.
