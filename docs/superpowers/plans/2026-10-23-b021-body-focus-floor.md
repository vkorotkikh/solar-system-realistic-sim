# B021 Body Focus Floor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep camera zoom outside every focused body's rendered surface, including the Sun in both scale modes.

**Architecture:** Exercise the actual nested `bodyBaseRadiusAu` and `focusBody` declarations from `src/main.ts` with the real catalog, Three scene objects, real OrbitControls, and the production keyboard/button camera action. Replace only the star-specific hardcoded minimum with the shared radius-derived minimum while preserving preferred framing and focus update order.

**Tech Stack:** TypeScript, Vitest, Three.js, OrbitControls, npm

**Spec:** `agent-notes/BUG_FIX_REPORT_2026-10-17.md` (B021) and the task's approved minimal-fix constraints

## Global Constraints

- Use `planetViewDistances(radius).minimum` for every visible focused body.
- Preserve Sun preferred focus distances exactly: `2.6 AU` in display scale and `0.14 AU` in realistic scale.
- Read the live scale mode when focus/refocus runs.
- Preserve the existing target/camera mutation followed by `controls.update()` ordering.
- Do not extract or refactor production helpers solely for testability.
- Leave work uncommitted for independent review.

## Review Focus

- Sun closest approach must equal `1.1 ×` the currently rendered radius in both scale modes.
- Repeated production zoom-in actions must clamp at that floor rather than entering the Sun.
- Planets and moons must retain the same shared framing and minimum-distance contract.
- Focus must use the node's world-space center even under an offset parent.
- A missing body must not mutate camera, controls, or focus state.

---

### Task 1: Apply the shared focus floor to stars

**Files:**
- Modify: `src/main.ts:633-645`
- Create: `src/main.focusBody.test.ts`

**Interfaces:**
- Consumes: `bodyBaseRadiusAu(body)`, `planetViewDistances(radius)`, real `OrbitControls`, and `applyCameraAction(camera, controls, action)`.
- Produces: a live rendered-radius-derived `controls.minDistance` for every valid focus target.

- [x] **Step 1: Add production-path RED tests**

Recursively extract and execute the actual nested `bodyBaseRadiusAu` and `focusBody` declarations. With the real catalog, Three Groups/PerspectiveCamera, real OrbitControls, and `applyCameraAction`, cover Sun display/realistic floors and zoom clamps, unchanged preferred framing and update ordering, live toggle/refocus, planet/moon contracts, an off-origin world center, and missing-body no-op behavior.

- [x] **Step 2: Verify RED**

Run `npm test -- --run src/main.focusBody.test.ts`.

Expected: Sun floor/clamp assertions fail because `focusBody` sets `0.0002 AU`; planet/moon and missing-body contracts already pass.

Observed after correcting an assertion-tolerance setup issue: `1 failed, 3 passed`. The actual production declaration returned `0.0002 AU` for the Sun instead of the required `0.4130625963 AU` display-radius floor; the other three contracts passed.

- [x] **Step 3: Apply the minimal production fix**

Replace the conditional hardcoded minimum with `planetViewDistances(radius).minimum`. Do not change preferred-distance selection or statement order.

- [x] **Step 4: Verify focused behavior and types**

Run the new test plus the three-file 23-test baseline (`planetView`, `viewportCameraController`, and `quadtreeLOD`), followed by relevant TypeScript checks.

Observed: `4 files/27 tests passed`; both `npm run typecheck` and `npm run typecheck:ratchet` passed, with the ratchet reporting `0/226` legacy diagnostics and no bucket regression. The whole frontend suite passed `77 files` plus `1 skipped`, `788 tests` plus `413 skipped`.

- [x] **Step 5: Review and hand off**

Run `git diff --check`, inspect the complete scoped diff, update this plan and its ignored ledger, and hand off uncommitted for independent review.

Observed: `git diff --check` passed and the production diff is the single intended minimum-distance expression. Ready for independent review, uncommitted.
