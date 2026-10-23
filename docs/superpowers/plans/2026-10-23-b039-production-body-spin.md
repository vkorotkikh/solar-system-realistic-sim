# B039 Production Body Spin Test Implementation Plan

> **For agentic workers:** Use test-driven development and leave the change uncommitted for the parent agent's one-bug atomic commit.

**Goal:** Make the planetary rotation test exercise the same signed local-axis spin step that both rendering paths ship.

**Architecture:** Extract the duplicated absolute local-Y rotation into a leaf `applyBodySpin` helper. Keep each caller's existing Sun/lock, period-validation, fallback, and J2000 elapsed-time policies outside the helper. Test the helper with real Three.js objects beneath an independently oriented pole frame and the existing CSPICE fixtures.

**Tech Stack:** TypeScript, Three.js, Vitest.

**Spec:** `/home/nomad/ai/projects/repositories/solar-system-realistic-sim/agent-notes/BUG_FIX_REPORT_2026-10-17.md` — B039.

## Constraints

- Fix B039 only; do not change catalog rotation data or Sun-controller ownership.
- Preserve main-scene `lockBodySpin`, child/catalog fallbacks, and its `< 0.01 h` guard.
- Preserve local-scene mesh values, zero phase fallback, and its `> 0.01 h` guard.
- Preserve J2000 anchoring in both callers; local orbit epochs are not spin epochs.
- The shared helper must apply an absolute, normalized rotation around the target's local +Y axis and accept signed periods.
- Do not import `main.ts` from tests or shared code.

### Task 1: Route both production spin paths through the tested helper

**Files:**
- Add: `src/frontend/features/planetary/bodySpin.ts`
- Modify: `src/frontend/features/planetary/planetRotation.test.ts`
- Modify: `src/main.ts`
- Modify: `src/frontend/app/localSystemRenderer.ts`

- [ ] Replace the test's hand-built `(cos(angle), 0, -sin(angle))` endpoint with calls to `applyBodySpin` on a real child object under the independent pole frame.
- [ ] Use a nonzero phase and a fractional-day epoch to cover offset, prograde/retrograde sign, local +Y, and absolute (non-accumulating) updates.
- [ ] Run the focused test before the helper exists and record the intended failure.
- [ ] Implement `applyBodySpin(target, elapsedSeconds, rotationPeriodHours, rotationOffsetRad)` in the leaf module.
- [ ] Replace both duplicated normalization/assignment blocks with the helper while leaving caller policies intact.
- [ ] Run the focused test, frontend suite, strict TypeScript gates, build, and `git diff --check`.
