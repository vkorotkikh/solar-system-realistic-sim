# B025 Sun Perihelion Display Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the display Sun safely inside the perihelion of every valid direct planetary child without changing its physical size.

**Architecture:** Apply the invariant through a small exported catalog postprocessor with a narrow structural body type. It derives the minimum valid perihelion from finalized catalog body/orbit data, considering direct Sun-child planets and dwarfs only, then caps only the Sun's `displayRadiusAu` at 80% of that minimum. Invoke it after the existing moon-aware display constraints so it is the final display-radius invariant while retaining `radiusKm`, `realRadiusAu`, orbital data, and B024 visibility behavior.

**Tech Stack:** TypeScript, Vitest

**Spec:** `agent-notes/BUG_FIX_REPORT_2026-10-17.md` (B025) and the approved task constraints

## Global Constraints

- Derive the cap from direct `parentId === 'sun'` planetary catalog bodies, not a hardcoded Mercury ID or distance.
- Accept finite elliptical elements with `aAu > 0` and `0 <= e < 1`; treat omitted eccentricity as the propagator's circular default.
- Ignore missing/invalid orbits, indirect children, roots, stars, moons, asteroids, and other non-planetary types.
- Cap with `Math.min(existingDisplayRadius, 0.8 * qMin)` so the invariant never inflates a smaller display Sun.
- Mercury's current elements yield the independent oracle `0.24599820128898311 AU`.
- Preserve physical Sun radius and all B024 visible/hidden-moon contracts.
- Leave work uncommitted for independent review.

## Review Focus

- The selected perihelion is `aAu * (1 - e)`, not aphelion, semimajor axis, or a hardcoded Mercury value.
- Eccentricity boundaries accept 0 and values below 1 while rejecting negative, non-finite, and `>= 1` values.
- A closer asteroid/moon/indirect body cannot shrink the Sun.
- With no valid direct planetary child, the existing display radius remains unchanged.
- The cap runs after display constraints and is identical for `moonsVisible` true and false.

---

### Task 1: Enforce the final Sun display/perihelion invariant

**Files:**
- Modify: `src/sim/catalog.ts:640-815`
- Modify: `src/sim/catalog.test.ts`
- Create: `src/sim/catalogDisplay.test.ts`

**Interfaces:**
- Produces: `applySunPerihelionDisplayConstraint(bodies) -> void` and a final catalog with `sun.displayRadiusAu <= 0.8 * qMin`.
- Consumes: `CatalogBody.parentId`, `type`, `orbit.aAu`, and optional `orbit.e`.

- [x] **Step 1: Add independent RED tests**

Pin the production catalog's Sun display radius to `0.24599820128898311 AU` in both moon modes and its physical radius to independent literals. Exercise the actual postprocessor with synthetic candidates proving direct planet/dwarf selection, invalid/non-direct/non-planetary exclusions, eccentricity boundaries, no-valid-candidate no-op, and no inflation of an already-smaller Sun. Update B024's intentionally changed Sun literal.

- [x] **Step 2: Verify RED**

Run the new display test plus `src/sim/catalog.test.ts`. Expected: current catalog returns `0.3755114512235279 AU`, and the postprocessor is absent.

- [x] **Step 3: Implement the postprocessor and final cap**

Add the narrowly typed postprocessor and use `Math.min` to cap the Sun after `applyDisplayScaleConstraints` and before derived navigation/planner lists.

- [x] **Step 4: Verify GREEN and regressions**

Run display/catalog/B024/planet-view/focus tests, then the full frontend suite, strict TypeScript, and the TypeScript ratchet.

- [x] **Step 5: Review and hand off**

Run `git diff --check`, inspect stage placement and mutation coverage, record evidence in the plan and ignored ledger, and leave the work uncommitted for independent review.

## Execution Evidence

- RED: `npm test -- --run src/sim/catalogDisplay.test.ts src/sim/catalog.test.ts` produced 4 expected failures and 7 passes: both production paths retained `0.3755114512235279 AU`, and the planned postprocessor was absent.
- Initial GREEN: the same two-file command passed all 11 tests after adding the derived cap.
- Independent review: no production defect found. Review identified that the combined boundary fixture masked mutations rejecting omitted or zero eccentricity; isolated single-candidate assertions were added for both cases.
- Final focused verification: 5 files / 19 tests passed across the display/catalog, B024 visibility, planet-view, and focus consumers.
- Final full verification: 81 files passed, 1 skipped; 802 tests passed, 413 skipped.
- Static verification: strict TypeScript passed; the ratchet passed with 0/226 legacy diagnostics and no exceeded bucket.
- Scope/diff review: only B025 production, tests, this plan, and the ignored SDD ledger changed; `git diff --check` passed. Work remains uncommitted for parent review.
