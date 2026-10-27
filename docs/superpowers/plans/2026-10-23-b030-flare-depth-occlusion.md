# B030 Far-Side Flare Depth Occlusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the rendered solar disk occlude flare sprites launched on its far side, without changing flare appearance or lifecycle on the visible side.

**Architecture:** Keep the existing transparent additive sprite with depth writes disabled, but enable depth testing on its `SpriteMaterial`. Prove the contract through the public deterministic `SolarFlareManager.spawnFeatureFlare` path so the test exercises the real production material, attachment, and cleanup rather than copied construction logic or source text.

**Tech Stack:** TypeScript, Three.js, Vitest

**Spec:** `agent-notes/BUG_FIX_REPORT_2026-10-17.md` (B030) and the approved task constraints

## Global Constraints

- Change only the flare sprite's `depthTest` setting.
- Preserve `transparent: true`, `AdditiveBlending`, and `depthWrite: false`.
- Do not change the CME shader material or flare geometry, spawn selection, animation, expiry, attachment, or disposal.
- Use an actual manager-spawned far-side feature flare as the regression seam.
- Leave work uncommitted for independent review.

## Review Focus

- A sprite behind the solar disk must participate in the depth test against the disk's depth buffer.
- The additive flare must not write depth and incorrectly hide later transparent effects.
- Existing expiry and explicit-disposal paths must still detach both render objects and dispose each event material exactly once.

---

### Task 1: Enable depth occlusion for flare sprites

**Files:**
- Modify: `src/frontend/features/solar/solarFlares.ts`
- Modify: `src/frontend/features/solar/solarFlares.test.ts`

- [x] **Step 1: Add a strict RED production-path test**

Spawn a deterministic feature flare through `SolarFlareManager`, place it behind the disk relative to a literal camera position, and assert both the geometric ordering and the actual `SpriteMaterial` contract.

- [x] **Step 2: Verify RED**

Run `solarFlares.test.ts`. Expected: the new assertion reports `depthTest === false`; all established flare geometry and lifecycle tests remain green.

- [x] **Step 3: Implement the minimal fix**

Set only the flare `SpriteMaterial`'s `depthTest` option to `true`.

- [x] **Step 4: Verify GREEN and regressions**

Run the focused flare/controller/geometry suite, then the full frontend suite, strict TypeScript, and the TypeScript ratchet.

- [x] **Step 5: Review and hand off**

Run independent review, `git diff --check`, inspect scope and mutation sensitivity, record evidence here and in the ignored ledger, and leave the work uncommitted.

## Execution Evidence

- Baseline: 3 focused flare/controller/geometry modules passed 46 tests.
- RED: `solarFlares.test.ts` produced exactly 1 expected failure and 7 passes; the manager-spawned far-side sprite reported `depthTest: false` while its geometry and all established lifecycle tests passed.
- GREEN: the flare module passed 8 tests after enabling depth testing on the sprite material.
- Focused verification: 3 flare/controller/geometry modules passed 47 tests, including exact-once expiry and explicit-disposal coverage.
- Full frontend verification: 82 files passed, 1 skipped; 821 tests passed, 413 skipped.
- Static verification: strict TypeScript passed; the ratchet passed with 0/226 legacy diagnostics and no exceeded bucket.
- Independent review: no Critical or Important findings. The reviewer confirmed the production manager seam, far-side geometry, opaque Sun depth-buffer premise, retained material flags, and existing exact-once lifecycle coverage; its fresh flare run passed 8 tests.
- Scope/diff review: only B030 production, test, and plan files changed; `git diff --check` passed. Work remains uncommitted.
