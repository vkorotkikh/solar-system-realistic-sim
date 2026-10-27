# B026 Irregular-Moon Plane Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the moon accuracy gate reject incorrect nodal-precession direction for Pasiphae, Sinope, and Carme.

**Architecture:** Keep the production propagator and committed Horizons fixture unchanged. Re-measure each phase-immune plane-angle row, round twice the observed error upward to the next tenth of a degree, and add a test that negates each catalog node rate before running the real gate.

**Tech Stack:** TypeScript, Vitest

**Spec:** `agent-notes/BUG_FIX_REPORT_2026-10-17.md` (B026)

## Global Constraints

- Change only the three `PLANE_BUDGET_DEG` rows and their gate coverage.
- Derive budgets from the production catalog, propagator, and seven committed epochs.
- Use `ceil(20 * measuredDegrees) / 10`, preserving at least 2x headroom.
- A negated catalog `ascendingNodeDegPerCentury` must fail the real `evaluateMoonFrames` plane gate for all three moons.
- Leave the work uncommitted for parent review.

## Review Focus

- Budget keys must remain in `EPOCH_KEYS` order.
- Every budget must be at least twice the independently measured error.
- The mutation must change only the node-rate sign, not replace the propagator or oracle.
- The unmodified production catalog must continue to pass every moon gate.
- The new test must fail under the former wide budgets.

---

### Task 1: Tighten and mutation-test the irregular-moon plane gate

**Files:**
- Modify: `src/sim/moonFrameCheck.ts`
- Modify: `src/sim/moonFrames.horizons.test.ts`
- Create: `docs/superpowers/plans/2026-10-23-b026-irregular-moon-plane-budgets.md`

**Interfaces:**
- Consumes: `createSolarSystemCatalog`, `evaluateMoonFrames`, `propagateKeplerOrbit`, and the committed seven-epoch fixture.
- Produces: mutation-sensitive `PLANE_BUDGET_DEG` rows for Pasiphae, Sinope, and Carme.

- [x] **Step 1: Confirm the current production plane errors and derive literal 2x-upward-rounded budgets.**
- [x] **Step 2: Add a production-path test that negates all three node-rate signs and expects all three plane summaries to fail.**
- [x] **Step 3: Run the focused test and verify RED under the existing wide budgets.**
- [x] **Step 4: Replace only the three budget rows with the independently derived literals.**
- [x] **Step 5: Run focused gate tests, the standalone verifier, strict typecheck, and the full frontend suite; inspect the diff and leave it uncommitted.**

## Execution Evidence

- Measurement: the real catalog/propagator reproduced the requested rows exactly after `ceil(20 * errorDeg) / 10`; every cell is at least 2x and less than 2x plus 0.1 degrees.
- RED: with the former rows, the new real-gate mutation test failed because Pasiphae, Sinope, and Carme all retained `planeOk: true` after their catalog node-rate signs were negated; the other 27 tests passed.
- GREEN: the focused moon-frame test passed 28/28 after changing only the three rows.
- Related verification: moon-frame, secular-remediation, and catalog tests passed 53/53; the standalone gate passed 140/140 moon/epoch rows with utilization 52.7/100.
- Static verification: strict TypeScript and the TypeScript ratchet passed with 0/226 legacy diagnostics.
- Full verification: 83 test files passed and 1 skipped; 827 tests passed and 413 skipped.
