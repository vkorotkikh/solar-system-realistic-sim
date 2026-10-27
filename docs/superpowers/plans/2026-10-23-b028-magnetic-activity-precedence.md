# B028 Magnetic Activity Precedence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the correct solar activity when UI scale changes rebuild the Sun's magnetic field.

**Architecture:** Centralize the rebuild's precedence in a small pure resolver: use a finite explicit override first, otherwise a finite admitted physics-state activity, otherwise `0.5`, then clamp the selected value to `[0, 1]`. The existing magnetic rebuild calls that resolver; the UI scale-change path remains unchanged and continues to rebuild through `sunCtrl.onScaleChange()`.

**Tech Stack:** TypeScript, Three.js, Vitest

**Spec:** `agent-notes/BUG_FIX_REPORT_2026-10-17.md` (B028) and the approved task constraints

## Global Constraints

- `null`, `undefined`, `NaN`, and infinities are absence, not activity zero.
- A finite override takes precedence over physics state, including explicit `0`.
- If the override is absent, preserve a finite `solarPhysicsState.activity_index`, including explicit `0`.
- Clamp the selected finite value to `[0, 1]`; use `0.5` only when neither source is finite.
- Exercise the real controller scale-change rebuild and production magnetic geometry, not a copied implementation.
- Do not change magnetic geometry, UI wiring, polling, or any later bug.
- Leave work uncommitted for independent review.

## Review Focus

- `Number(null) === 0` must not make an omitted scale-change override win.
- `0` must not be lost through truthiness fallback.
- Numeric strings and other non-number values must not count as finite activity.
- The resolver must clamp the selected source, not clamp an invalid source into validity.
- A scale rebuild without backend state must retain the normal `0.5` procedural field and line population.

---

### Task 1: Resolve magnetic activity without null coercion

**Files:**
- Modify: `src/sunController.ts:375-380`
- Create: `src/sunController.scaleActivity.test.ts`

**Interfaces:**
- Produces: `resolveMagneticFieldActivity(activityOverride, stateActivity) -> number`.
- Consumes: existing `finiteOrNull`, `clampUnit`, `createSunController().onScaleChange()`, and real `createMagneticFieldLines` output.

- [x] **Step 1: Add strict RED tests**

Add an independent literal table for override/state/default precedence, zero preservation, invalid-value fallthrough, and clamping. Add a real initialized-controller reproduction proving a no-argument UI scale rebuild retains activity `0.5` and the initial procedural line count.

- [x] **Step 2: Verify RED**

Run the new test alone. Expected: the scale rebuild changes activity from `0.5` to `0` and reduces the procedural field from its initial line population; the resolver is absent.

- [x] **Step 3: Implement the minimal resolver**

Use `clampUnit(finiteOrNull(activityOverride) ?? finiteOrNull(stateActivity) ?? 0.5)` and call it from `rebuildMagneticFieldLines`; make no other production change.

- [x] **Step 4: Verify GREEN and regressions**

Run the new test and existing controller/magnetic tests, then the full frontend suite, strict TypeScript, and the TypeScript ratchet.

- [x] **Step 5: Review and hand off**

Run independent review, `git diff --check`, inspect mutation coverage and scope, record evidence here and in the ignored ledger, and leave the change uncommitted.

## Execution Evidence

- Baseline: four existing controller/magnetic modules passed 33 tests.
- RED: the new test produced 15 expected failures and 1 passing zero control. The resolver was absent, and the real no-argument scale rebuild changed activity from `0.5` to `0` (52 procedural lines to 26).
- Initial GREEN: the new module passed all 16 cases after the resolver became the rebuild's single activity-selection path.
- Final focused verification: 5 files / 49 tests passed across the new regression, controller delivery/events/frame behavior, and solar magnetics.
- Final full verification: 82 files passed, 1 skipped; 818 tests passed, 413 skipped.
- Static verification: strict TypeScript passed; the ratchet passed with 0/226 legacy diagnostics and no exceeded bucket.
- Independent review: no Critical or Important findings; the reviewer separately reproduced the 52/26 line counts and verified the DOM-to-rebuild call path, source precedence, and explicit-zero retention.
- Scope/diff review: only B028 production, test, plan, and ignored ledger files changed; `git diff --check` passed. Work remains uncommitted.
