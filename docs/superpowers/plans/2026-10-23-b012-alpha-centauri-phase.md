# B012 Alpha Centauri Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Alpha Centauri B's shipped J2000 phase and period with the published 1955.66 periastron and 79.91-Julian-year visual orbit.

**Architecture:** Keep the correction in the local-system manifest. Protect it with a Vitest accuracy gate that loads the shipped JSON, derives the phase from independent published inputs, and passes the resulting orbit through the production Kepler propagator at J2000 and 2016.

**Tech Stack:** JSON manifest, TypeScript, Vitest, Three.js vectors.

**Spec:** `agent-notes/BUG_FIX_REPORT_2026-10-17.md` (B012)

## Global Constraints

- Correct B012 only; do not change the shared propagator.
- Use the Pourbaix & Boffin (2016) solution values `P = 79.91` Julian years and `T0 = 1955.66`.
- Leave the change uncommitted for the parent agent's one-bug atomic commit.

## Review Focus

- A literal phase unrelated to the cited periastron must fail the derived-phase gate.
- A period expressed with a non-Julian conversion must fail the source-period gate.
- A phase that is internally plausible but renders the wrong 2016 sky separation must fail the production-propagator gate.
- Orbit-axis or sky-plane mistakes must fail the independently calculated J2000 vector and projected separation checks.
- Provenance must identify the publication and the derivation represented by the manifest values.

---

### Task 1: Correct and Protect the Alpha Centauri B Orbit Phase

**Files:**
- Create: `docs/superpowers/plans/2026-10-23-b012-alpha-centauri-phase.md`
- Create: `src/sim/alphaCentauriOrbit.test.ts`
- Modify: `public/solar-systems/manifests/alpha-centauri.json`

**Interfaces:**
- Consumes: the manifest's snake-case orbit fields and `propagateKeplerOrbit(orbit, elapsedDays, position)`.
- Produces: a source-derived J2000 phase, published period, and network-free accuracy checks for the shipped orbit.

- [x] **Step 1: Write failing tests**

Load the shipped manifest and assert that its period is `79.91 * 365.25` days, its J2000 phase equals `360 * (2000.0 - 1955.66) / 79.91`, its production-propagated J2000 vector matches the independently calculated fixture, and its 2016 sky-plane separation at `0.743 arcsec/AU` is approximately `4.003630694 arcsec`.

- [x] **Step 2: Verify RED**

Run: `npm test -- src/sim/alphaCentauriOrbit.test.ts`

Expected: the current `156 degree` phase / `29171 day` orbit fails all phase and position checks.

- [x] **Step 3: Apply the minimal manifest correction**

Set `period_days` to `29187.1275`, set `mean_anomaly_deg` to the source-derived `199.75472406457334`, bump the manifest version, and record Pourbaix & Boffin (2016) plus the periastron derivation in provenance/notes.

- [x] **Step 4: Verify GREEN and regressions**

Run the focused Vitest file, TypeScript checks, local-system backend manifest tests, and the full frontend suite.

Expected: all commands exit zero with the B012 gates passing.

- [x] **Step 5: Hand off uncommitted**

Report the exact changed files and fresh verification evidence to the parent agent; do not commit.

## Execution Evidence

- Independent derivation: `79.91 * 365.25 = 29187.1275` days and `360 * (2000.0 - 1955.66) / 79.91 = 199.7547240645723` degrees (the stored value differs only by floating-point rounding in the equivalent day-based calculation).
- RED: all three new tests failed against the former manifest: period was 16.1275 days short, J2000 x was 7.4597 AU off, and the 2016 apparent separation was 9.5514 instead of 4.0036 arcsec.
- Independent review: one Important coverage gap found that `epoch_jd` was not tied to the absolute J2000/2016 dates. A temporary one-day epoch mutation passed the original 3/3 tests, then failed all 3 after adding the J2000 epoch contract and absolute-JD elapsed-time calculations; restoring the shipped J2000 epoch returned the suite to green. The reviewer found the orbital math, scope, and provenance otherwise clean.
- GREEN: the focused B012 suite passed 3/3 through the production Kepler propagator.
- Manifest verification: all six backend local-system manifest tests passed, including period/mass consistency.
- Static verification: strict TypeScript, the TypeScript diagnostic ratchet (0/226 legacy diagnostics), and UI type delta (0 diagnostics) passed.
- Full verification: 84 frontend test files passed and 1 skipped; 830 tests passed and 413 skipped.
