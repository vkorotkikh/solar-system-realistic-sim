# B004 Motion-Disabled Solar Snapshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure newly delivered solar-physics snapshots reach rendered geometry and shader activity while the simulation is paused, reversed, or honoring reduced motion.

**Architecture:** Keep SCN-038's decorative clock frozen whenever motion is disabled, but separate that animation rule from physical snapshot admission. The controller will promote an outstanding feature target immediately when decorative motion is suppressed, while normal forward playback retains smooth interpolation; shader activity will come from the latest physical payload before any decorative blend value.

**Tech Stack:** TypeScript, Vitest 5, Three.js solar controller and feature blending.

**Spec:** `/home/nomad/ai/projects/repositories/solar-system-realistic-sim/agent-notes/BUG_FIX_REPORT_2026-10-17.md` — B004 at lines 265-279.

## Global Constraints

- Fix B004 only; do not change solar coordinate frames, delivery cadence, or unrelated visual animation behavior.
- Use strict TDD: replace/add the controller regression, observe its expected stale-alpha/activity failure, then change production code.
- Preserve the SCN-038 contract that decorative time and event animation do not advance or catch up during pause, reverse, or reduced motion.
- A pending physical snapshot must be promoted immediately whenever decorative motion is suppressed; normal forward playback must still interpolate.
- Shader activity must prefer the latest finite `solarPhysicsState.activity_index`, independent of whether feature geometry is blendable or admitted.
- Produce exactly one atomic B004 commit, including its regression tests and this plan.
- Run frontend commands under Node `22.23.2`.

## Review Focus

- A snapshot arriving while already paused must render with blend alpha 1 and latest activity; the controller regression covers it.
- Reverse playback and reduced motion must have the same immediate-promotion behavior; table-driven cases cover both.
- Disabling motion during an in-flight blend must not strand an intermediate physical snapshot; the updated controller test covers promotion.
- Normal forward playback must retain an intermediate blend before completion; the regression explicitly checks `0 < alpha < 1` before suppression.
- Decorative event time must remain frozen without wall-clock catch-up; the existing `sunController.events.test.ts` stays in the focused run.

---

### Task 1: B004 physical snapshot promotion

**Files:**
- Modify: `src/sunController.ts`
- Modify: `src/sunController.frameReview.test.ts`
- Test: `src/sunController.events.test.ts`
- Test: `src/frontend/features/solar/solarFeatureBlending.test.ts`

**Interfaces:**
- Consumes: `simState.paused`, `simState.timeScaleDaysPerSec`, and `matchMedia('(prefers-reduced-motion: reduce)')` as the existing motion-suppression inputs.
- Produces: the existing private `buildSolarFeatureBlendView(featureLimit)` contract, augmented so any pending target is promoted before the blend view is built when decorative motion is suppressed.
- Preserves: the public `createSunController` API and the `SolarFeatureBlendView` data contract.

- [ ] **Step 1: Write the failing controller regressions**

Update `actual controller snapshot and decorative-clock ownership` so a table-driven case for pause, reverse, and reduced motion disables motion before admitting a changed payload (`activity_index = 0.9` plus a changed feature arc), performs one update, and asserts:

```typescript
expect(f.blend().blendAlpha).toBe(1);
expect(f.blend().activityIndex).toBe(0.9);
expect(f.material.uniforms.activity.value).toBe(0.9);
```

Also change the existing in-flight-blend case to assert that entering a disabled mode promotes the target to alpha 1 rather than freezing the intermediate geometry. Retain its precondition proving normal forward playback produced `0 < alpha < 1`, and retain a rendered-loop assertion so the test observes real output rather than state alone.

- [ ] **Step 2: Run the regression to verify RED**

Run:

```bash
npx --yes node@22.23.2 node_modules/vitest/vitest.mjs run src/sunController.frameReview.test.ts
```

Expected: the new cases fail with `blendAlpha` remaining 0 or intermediate and activity remaining at the old payload value; unrelated frame-admission cases pass.

- [ ] **Step 3: Separate motion suppression from physical snapshot admission**

In `src/sunController.ts`, extract one private motion-suppression predicate shared by update-time decorative gating and feature-blend admission. Before calling `buildSolarFeatureBlendViewImpl`, if a target exists and pause, non-positive time scale, or reduced motion suppresses decoration, assign the target to current, clear the target, and reset the blend start to the current decorative time. Do not restore wall-clock (`Date.now()`) blending.

- [ ] **Step 4: Prefer latest physical activity**

In `update`, compute activity in this order:

```typescript
finiteOrNull(solarPhysicsState?.activity_index)
  ?? finiteOrNull(solarBlendView?.activityIndex)
  ?? fallbackActivity
```

Keep the existing `clampUnit` boundary.

- [ ] **Step 5: Run focused verification to verify GREEN**

Run:

```bash
npx --yes node@22.23.2 node_modules/vitest/vitest.mjs run src/sunController.frameReview.test.ts src/sunController.events.test.ts src/frontend/features/solar/solarFeatureBlending.test.ts
```

Expected: all focused tests pass with pristine test output.

- [ ] **Step 6: Run project verification**

Run:

```bash
npx --yes node@22.23.2 node_modules/vitest/vitest.mjs run
npx --yes node@22.23.2 node_modules/typescript/bin/tsc --project tsconfig.json --strict --noEmit
npx --yes node@22.23.2 node_modules/vite/bin/vite.js build
git diff --check
```

Expected: all 73 baseline passing files remain green, the one skipped file and 413 skipped tests remain accounted for, strict TypeScript reports no errors, Vite builds successfully, and `git diff --check` is silent.

- [ ] **Step 7: Commit B004 atomically**

```bash
git add docs/superpowers/plans/2026-10-23-b004-motion-disabled-snapshots.md src/sunController.ts src/sunController.frameReview.test.ts
git commit -m "fix(solar): apply snapshots while motion is disabled (B004)"
```
