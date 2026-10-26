# B024 Hidden-Moon Display Radii Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent hidden moons from shrinking their parent planets' display radii while preserving the complete scientific moon catalog.

**Architecture:** Add a `moonsVisible` catalog option that defaults to `true`, preserving every existing caller. Continue building and constraining all moon records and attaching Earth's barycentric companion unconditionally; only skip the second display pass that caps parent radii from their innermost moon when visibility is false. The shipped main call passes its existing `showMoons` flag.

**Tech Stack:** TypeScript, Vitest, TypeScript AST production-path extraction

**Spec:** `agent-notes/BUG_FIX_REPORT_2026-10-17.md` (B024) and the approved task constraints

## Global Constraints

- `createSolarSystemCatalog()` and explicit `moonsVisible: true` retain current radii.
- `moonsVisible: false` gates only parent display-radius caps derived from moon orbits.
- All 424 moon records, their display radii/orbits/provenance, major-moon navigation IDs, and Earth's barycentric correction remain present and identical.
- The actual hidden-moon `src/main.ts` call must pass `moonsVisible: showMoons`; do not infer visibility from ephemeris loading.
- Leave work uncommitted for independent review.

## Review Focus

- Earth, Mars, Jupiter, Saturn, Uranus, Neptune, and Pluto recover their base display radii only in hidden mode.
- Sun, Mercury, Venus, and moon radii remain unchanged across both modes.
- Default option behavior remains backward-compatible with visible-moon constraints.
- Hidden mode retains moon identity/orbit records and Earth's Moon-backed barycentric correction.
- Omitting or inverting the option at the actual main call must fail a production-path test.

---

### Task 1: Make parent display constraints visibility-aware

**Files:**
- Modify: `src/sim/catalog.ts:40-50,641-675,794-804`
- Modify: `src/main.ts:178-186`
- Modify: `src/sim/catalog.test.ts`
- Create: `src/main.catalogVisibility.test.ts`

**Interfaces:**
- Consumes: `createSolarSystemCatalog({ moonEphemerides?, moonsVisible? })` and main's existing `showMoons` flag.
- Produces: an unchanged complete catalog whose parent display radii reflect whether moons are rendered.

- [x] **Step 1: Add direct and production-path RED tests**

Test default/visible/hidden modes with independent literal radii for affected and unaffected bodies; compare all moon records and the Earth barycentric companion across modes. Extract and execute the actual main `showMoons` declaration and catalog call to prove the shipped hidden path selects the unclamped parent radii without dropping moons.

- [x] **Step 2: Verify RED**

Run the catalog and main visibility tests. Expected: hidden-mode calls either reject the new option at typecheck or retain the current clamped Jupiter/Earth radii, and the actual main call remains clamped.

- [x] **Step 3: Implement the minimal option and parent-loop gate**

Add `moonsVisible?: boolean`, default it to `true`, pass it into `applyDisplayScaleConstraints`, and return after the unconditional moon loop when false. Pass `moonsVisible: showMoons` at the actual main call.

- [x] **Step 4: Verify GREEN and regressions**

Run both new paths plus catalog/model/worker/main consumer baselines, then the full frontend suite, strict TypeScript, and the TypeScript ratchet.

- [x] **Step 5: Review and hand off**

Run `git diff --check`, inspect mutation coverage and the scoped diff, record evidence in the plan and ignored ledger, and leave the work uncommitted for independent review.

## Verification Evidence

- RED: catalog and actual-main tests — 2 intended failures / 8 passing controls. Hidden Earth remained `0.0016702109` AU instead of `0.0335237886`; shipped main left Jupiter `0.0005561576` AU instead of `0.1110508910`.
- GREEN: direct option modes and both branches of the actual main call — 2 files / 10 tests passed.
- Focused regressions: catalog, model, worker contract, and B021/B022 main consumers — 6 files / 25 tests passed.
- Full frontend suite: 80 files passed, 1 skipped; 799 tests passed, 413 skipped.
- `npm run typecheck` and `npm run typecheck:ratchet` passed with zero new diagnostics.
- Mutation controls cover an omitted/inverted main flag, an inverted/default-hidden catalog option, gating the entire constraint pass, deleting moon records, or dropping the Earth barycentric link.
- Independent review found no Critical or Important issues in option semantics, gate placement, main wiring, preservation, or test mutation coverage.
- `git diff --check` passed; scoped diff reviewed and left uncommitted for independent review.
