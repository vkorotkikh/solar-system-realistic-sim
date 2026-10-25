# B032 Solar Limb Coordinate Frames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute sunspot Wilson foreshortening and chromosphere spicule limb fade from vectors expressed in one coordinate space, so rotating or translating the Sun cannot change their physical viewing angle.

**Architecture:** Add view-space position and normal varyings to the surface shader for camera-dependent `mu`, while retaining body/world directions used by unrelated solar texture structure. Feed that per-fragment `mu` into Wilson depression. In the chromosphere vertex shader, transform each object-space spicule axis with `normalMatrix`, transform the Sun center with `modelViewMatrix`, and take the limb dot product wholly in view space.

**Tech Stack:** TypeScript, Three.js, GLSL, Vitest

**Spec:** `agent-notes/BUG_FIX_REPORT_2026-10-17.md` (B032) and the approved task constraints

## Global Constraints

- Use independent numeric frame oracles with a translated, scaled, and rotated production object; do not rely on rendered pixels or source text alone.
- Bind the numeric contracts to the actual assembled `ShaderMaterial` sources.
- For a constructed disk-centre +X probe rotated so object/world dot is `0.07`, the correct same-space `mu` is `1`, Wilson factor is `1`, and the mixed-space Wilson factor is `0.6745`.
- Surface camera-facing math uses view-space normal and view-space point-to-camera direction; solar latitude, spot coordinates, and flare coordinates remain in the body frame.
- Spicule limb math transforms `aAxis` with `normalMatrix` and computes the Sun-center viewing direction in view space.
- Do not change unrelated corona, flare, material, geometry, animation, or lifecycle behavior.
- Leave work uncommitted for independent review.

## Review Focus

- A rotation of the owning mesh must rotate both operands of every camera-facing dot product.
- Translation must affect point/center positions but never normal directions.
- Surface Wilson depression must consume the fragment's camera angle instead of dotting an object-space spot direction with a world/view direction.
- Chromosphere `normalMatrix * aAxis` and `-viewCenter` must be normalized before the dot product.
- Vertex/fragment varying declarations and actual material assembly must agree.

---

### Task 1: Make surface and spicule limb terms coordinate-consistent

**Files:**
- Modify: `src/frontend/features/solar/sunVisuals.ts`
- Create: `src/frontend/features/solar/sunVisuals.frames.test.ts`

- [x] **Step 1: Add strict RED numeric and assembly tests**

Build a transformed disk-centre fixture whose true view-space dot is `1` while the old object/world dot is `0.07`. Verify the independent Wilson and spicule fade literals, then guard the actual surface and chromosphere shader assembly for the corresponding view-space transforms and per-fragment Wilson input.

- [x] **Step 2: Verify RED**

Run `sunVisuals.frames.test.ts`. Expected: both numeric oracles reproduce the true and mixed values, while surface and chromosphere assembly guards fail on the current mixed-space GLSL.

- [x] **Step 3: Implement the minimal shader corrections**

Add surface `vViewNormal`/`vViewPosition`, derive `mu` from them, and use the existing `mu` argument for Wilson depression. Replace the spicule limb dot with normalized `normalMatrix * aAxis` and normalized negative model-view center.

- [x] **Step 4: Verify GREEN and regressions**

Run the new frame tests, focused shader/controller tests, then the full frontend suite, strict TypeScript, and the TypeScript ratchet.

- [x] **Step 5: Review and hand off**

Run independent shader review, `git diff --check`, inspect frame mutation coverage and scope, record evidence here and in the ignored ledger, and leave the work uncommitted.

## Execution Evidence

- Baseline: 4 focused shader/display/controller modules passed 34 tests.
- RED: `sunVisuals.frames.test.ts` produced exactly 2 expected failures. Both independent transformed-object oracles passed (`mu 1` versus `0.07`, Wilson `1` versus `0.6745`, and spicule fade `0.35` versus `0.9545`); only the actual assembled surface and chromosphere shader contracts reported their mixed-space GLSL.
- GREEN: the new frame module passed both tests after the minimal surface and chromosphere view-space corrections.
- Focused verification: 5 shader/display/controller modules passed 36 tests.
- Full frontend verification: 83 files passed, 1 skipped; 826 tests passed, 413 skipped.
- Static verification: strict TypeScript passed; the ratchet passed with 0/226 legacy diagnostics and no exceeded bucket.
- Independent review: no Critical or Important findings. The reviewer confirmed the matched varying interface, valid Three.js built-ins, algebraically equivalent clip transform, retained world/body responsibilities, coordinate-correct spicule math, actual material/attribute test seam, and independent numeric oracle; its broader focused run passed 48 tests.
- Scope/diff review: only B032 production, test, and plan files changed; `git diff --check` passed. Work remains uncommitted.
