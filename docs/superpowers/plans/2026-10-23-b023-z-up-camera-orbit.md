# B023 Z-Up Camera Orbit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make camera azimuth controls orbit around the solar system's Z axis without changing ecliptic elevation.

**Architecture:** Configure the production `PerspectiveCamera` with a normalized Z-up vector before constructing `OrbitControls`, because the installed controls cache their camera-up transform in the constructor. Verify the constructor ordering through real pointer interaction rather than source inspection, while mocking only the GPU-backed renderer.

**Tech Stack:** TypeScript, Vitest, Three.js `PerspectiveCamera` and `OrbitControls`

**Spec:** `agent-notes/BUG_FIX_REPORT_2026-10-17.md` (B023) and the approved task constraints

## Global Constraints

- Change only B023 behavior; preserve B021 focus distances and B022 body-info cadence.
- Set `camera.up` to `(0, 0, 1)` before `new OrbitControls(camera, canvas)`.
- Exercise actual `createSceneSetup`, camera, controls, and pointer listeners; mock only `WebGLRenderer` because Node has no WebGL context.
- Leave the fix uncommitted for independent review.

## Review Focus

- Moving the up-vector assignment below the controls constructor must fail the pointer-orbit test.
- Horizontal pointer orbit must preserve target-relative Z elevation for an off-origin target.
- Keyboard azimuth actions must use the same Z-up orientation and remain compatible with a subsequent controls update.
- Controls disposal must remove the real listeners installed by construction.

---

### Task 1: Configure and verify the camera's orbital up axis

**Files:**
- Modify: `src/frontend/app/sceneSetup.ts:100-107`
- Create: `src/frontend/app/sceneSetup.test.ts`

**Interfaces:**
- Consumes: `createSceneSetup(...)`, real `PerspectiveCamera`, real `OrbitControls`, and `applyCameraAction(...)`.
- Produces: a production camera whose Z-up axis is cached by controls at construction.

- [x] **Step 1: Add production-path RED tests**

Call actual `createSceneSetup` with an event-capable canvas double and renderer-only module double. Use real pointer events to prove a horizontal quarter orbit preserves radius and target-relative elevation around a translated target; check Z-up keyboard behavior and real listener disposal proportionally.

- [x] **Step 2: Verify RED**

Run `npm test -- --run src/frontend/app/sceneSetup.test.ts`.

Expected: the pointer test fails because the current controls instance cached Three.js's default Y-up orientation.

- [x] **Step 3: Implement the one-line constructor-ordering fix**

Set `camera.up.set(0, 0, 1)` immediately after constructing the camera and before setting its position or creating `OrbitControls`.

- [x] **Step 4: Verify GREEN and regressions**

Run the new test with the camera/runtime/focus baseline, then the full frontend suite, strict TypeScript, and the TypeScript ratchet.

- [x] **Step 5: Review and hand off**

Run `git diff --check`, inspect the scoped diff and mutation sensitivity, record evidence in this plan and the ignored SDD ledger, and leave the work uncommitted for independent review.

## Verification Evidence

- RED: `npm test -- --run src/frontend/app/sceneSetup.test.ts` — 2 expected failures and 1 passing lifecycle control; a real pointer quarter-turn changed elevation from `0.5404195` radians to approximately zero under Y-up.
- GREEN: the new production-path module — 3 tests passed.
- Mutation check: moving `camera.up.set(0, 0, 1)` below the controls constructor made the pointer test fail with the same elevation loss, despite the returned camera reporting Z-up; the correct ordering was restored afterward.
- Focused regressions: scene setup, viewport camera controller, runtime config, and main focus — 4 files / 32 tests passed.
- Full frontend suite: 79 files passed, 1 skipped; 794 tests passed, 413 skipped.
- `npm run typecheck` and `npm run typecheck:ratchet` passed with zero new diagnostics.
- `git diff --check` passed; scoped diff reviewed and left uncommitted for independent review.
