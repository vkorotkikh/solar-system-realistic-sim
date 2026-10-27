# B029 Procedural Magnetic Field Display Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Map procedural magnetic-field heights consistently with PFSS geometry when the Sun is visually enlarged, while retaining physical geometry at realistic scale.

**Architecture:** Keep tracing in normalized solar-radius coordinates. During procedural vertex emission only, preserve each point's direction and replace its radial distance with `coronalToDisplay(r, sunRadiusAu)` using the same radial scale already applied by the PFSS branch. Do not postprocess the returned group or alter the PFSS path, which would double-scale admitted backend geometry.

**Tech Stack:** TypeScript, Three.js, Vitest

**Spec:** `agent-notes/BUG_FIX_REPORT_2026-10-17.md` (B029) and the approved task constraints

## Global Constraints

- Change only procedural magnetic-field vertex placement.
- At the accepted B025 display Sun radius of `0.24599820128898311 AU`, a point at `2.5 R_sun` maps to `0.30134779657900435 AU`, not `0.6149955032224578 AU`.
- At realistic scale (`696340 / 149597870.7 AU`), normalized radii remain physically scaled without height compression.
- Preserve every procedural point's direction, ordering, topology, activity, and finite coordinates.
- Keep surface footpoints on the rendered surface.
- PFSS vertices are already mapped through `coronalToDisplay`; never map them twice.
- Leave work uncommitted for independent review.

## Review Focus

- Omitting division by normalized radius would scale directions by an extra radial factor.
- Applying the fix to the group after branch selection would double-scale PFSS vertices.
- Compressing at realistic scale would make the outer field only about `1.225 R_sun` instead of at least `2.5 R_sun`.
- Zero/non-finite coordinates must not be introduced by radial normalization.
- Enlarged and realistic runs must trace the same lines and retain identical unit directions.

---

### Task 1: Apply coronal display mapping to procedural vertices

**Files:**
- Modify: `src/frontend/features/solar/solarMagnetics.ts:340-355`
- Modify: `src/frontend/features/solar/solarMagnetics.test.ts`

**Interfaces:**
- Consumes: `coronalToDisplay(r: number, sunRadiusAu: number) -> number`.
- Produces: procedural vertex radius `coronalToDisplay(point.length(), sunRadiusAu)` with unchanged direction.

- [x] **Step 1: Add strict RED geometry tests**

Use real `createMagneticFieldLines` at enlarged and realistic radii. Assert independent surface and outer-extent literals, finite vertices, one-to-one trace topology, and unchanged directions. Exercise the wrapper's PFSS branch with a literal arc so an accidental second mapping fails.

- [x] **Step 2: Verify RED**

Run `solarMagnetics.test.ts`. Expected: at the accepted current display radius the procedural extent remains about `0.626 AU` instead of the compressed `~0.303 AU`; realistic and PFSS controls pass. (The report's pre-B025 `0.3755 AU` display radius produced the original `~0.955 AU` repro.)

- [x] **Step 3: Implement the minimal procedural mapping**

For each traced procedural point, compute `r`, then `scale = coronalToDisplay(r, sunRadiusAu) / r`, and multiply all three components by that scale. Leave `createMagneticFieldLinesFromPFSS` unchanged.

- [x] **Step 4: Verify GREEN and regressions**

Run focused solar-display/controller tests, then the full frontend suite, strict TypeScript, and the TypeScript ratchet.

- [x] **Step 5: Review and hand off**

Run independent review, `git diff --check`, inspect branch isolation and mutation coverage, record evidence here and in the ignored ledger, and leave the work uncommitted.

## Execution Evidence

- Baseline: five solar magnetic/display/controller modules passed 69 tests.
- RED: `solarMagnetics.test.ts` produced 1 expected procedural-mapping failure and 3 passes. At the report's representative radius, an early nonsurface vertex was `0.3936176460 AU` instead of the required `0.3782176492 AU`; the realistic and PFSS controls passed.
- Initial GREEN: the magnetic module passed all 4 tests after applying the radial display mapping inside the procedural vertex loop only.
- Integration refinement: independent review identified B025's accepted display radius as the correct live oracle. Tests now pin `0.24599820128898311 AU`, with `2.5 R_sun = 0.30134779657900435 AU`.
- Final focused verification: 5 files / 71 tests passed across magnetic generation, display scaling, frame/geometry contracts, and B028 scale rebuilding.
- Final full verification: 82 files passed, 1 skipped; 820 tests passed, 413 skipped.
- Static verification: strict TypeScript passed; the ratchet passed with 0/226 legacy diagnostics and no exceeded bucket.
- Independent review: no Critical or Important findings. Runtime probe found a corrected procedural maximum of `0.3025361791 AU`, physical maximum `0.0117867736 AU`, PFSS `2.5 R_sun` at `0.3013477921 AU` (Float32), and zero non-finite vertices.
- Scope/diff review: only B029 production, test, plan, and ignored ledger files changed; `git diff --check` passed. Work remains uncommitted.
