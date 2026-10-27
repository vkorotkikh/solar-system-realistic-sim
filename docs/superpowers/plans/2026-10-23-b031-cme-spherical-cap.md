# B031 CME Spherical Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render each CME shell as a rotationally symmetric spherical cap centered on its launch normal, with the requested angular width interpreted as the cone's full width.

**Architecture:** Keep `createSolarFlareEvent`'s existing +Y-to-launch-normal quaternion and replace the longitude lune with a +Y-centered spherical cap: full `2π` azimuth and polar extent equal to half the full angular width. Retain the 10-degree shared-geometry cache, but construct every cached geometry from its quantized bucket width so callers in the same bucket cannot make geometry depend on request order.

**Tech Stack:** TypeScript, Three.js, Vitest

**Spec:** `agent-notes/BUG_FIX_REPORT_2026-10-17.md` (B031) and the approved task constraints

## Global Constraints

- Exercise actual `createSolarFlareEvent` geometry, not copied construction logic or source text.
- Treat `angularWidthDeg` as the full angular cone width; its rim is half that angle from the launch axis.
- Cover all azimuths around local +Y before the existing launch quaternion is applied.
- Retain 10-degree cache quantization and shared geometry, while removing first-writer dependence inside a bucket.
- Preserve B030's sprite material flags and all flare/CME update, attachment, expiry, and disposal behavior.
- Leave work uncommitted for independent review.

## Review Focus

- A 60-degree CME needs a 30-degree polar half-width, not a 60- or 90-degree extent.
- Full azimuth must produce balanced coverage on both tangent axes, not another partial longitude wedge.
- An arbitrary non-axis-aligned launch normal must remain the cap centroid after quaternion rotation.
- Two requests in one cache bucket must reuse one geometry with the bucket's deterministic width regardless of first request.
- Shared cached geometry must not be disposed by per-event cleanup.

---

### Task 1: Replace the CME lune with a deterministic spherical cap

**Files:**
- Modify: `src/frontend/features/solar/solarFlares.ts:101-109`
- Modify: `src/frontend/features/solar/solarFlares.test.ts`

- [x] **Step 1: Add strict RED production-path geometry tests**

Through real `createSolarFlareEvent` handles, verify a 60-degree cap's area-weighted centroid aligns with an arbitrary launch normal, every vertex stays within a 30-degree half-width, and tangent coverage is symmetric. Add a same-bucket pair proving geometry identity and a bucket-derived rim independent of the first request.

- [x] **Step 2: Verify RED**

Run `solarFlares.test.ts`. Expected: the current lune fails centroid, 30-degree extent, symmetry/area, and deterministic bucket-width assertions while established lifetime, B030, orientation, and disposal tests pass.

- [x] **Step 3: Implement the minimal cap and cache correction**

Convert the 10-degree cache key back to radians and use that quantized full width to construct `SphereGeometry(1, 32, 16, 0, 2π, 0, quantizedWidthRad / 2)`.

- [x] **Step 4: Verify GREEN and regressions**

Run the flare module, the focused flare/controller/geometry suite, then the full frontend suite, strict TypeScript, and the TypeScript ratchet.

- [x] **Step 5: Review and hand off**

Run independent review, `git diff --check`, inspect cache/lifecycle mutation coverage and scope, record evidence here and in the ignored ledger, and leave the work uncommitted.

## Execution Evidence

- Baseline: 3 focused flare/controller/geometry modules passed 47 tests.
- RED: `solarFlares.test.ts` produced exactly 3 expected geometry failures and 8 passes. The lune centroid was `0.9437` from its launch normal, tangent coverage was one-sided, and the first 94-degree request created a 90-degree polar extent instead of the deterministic 45-degree half-width for its 90-degree cache bucket.
- Test-oracle refinement: the symmetry case now launches along +Y so X/Z are explicitly tangent axes. With the production fix temporarily reverted, the corrected test still produced the intended 3 failures / 8 passes.
- GREEN: the flare module passed all 11 tests after the full-azimuth, half-width cap and deterministic cache construction were restored.
- Focused verification: 3 flare/controller/geometry modules passed 50 tests, including B030 depth flags and established exact-once expiry/disposal coverage.
- Full frontend verification: 82 files passed, 1 skipped; 824 tests passed, 413 skipped.
- Static verification: strict TypeScript passed; the ratchet passed with 0/226 legacy diagnostics and no exceeded bucket.
- Independent review: no Critical or Important findings. A separate Three.js probe confirmed full azimuth, a `30.0000004°` rim, symmetric `±0.5` tangent extents, deterministic 94°/86° bucket reuse, arbitrary-normal centering, and retained B030/lifecycle contracts.
- Non-blocking review note: shared-geometry non-disposal is verified by the unchanged cleanup implementation rather than a new listener assertion; no geometry lifecycle code changed.
- Scope/diff review: only B031 production, test, and plan files changed; `git diff --check` passed. Work remains uncommitted.
