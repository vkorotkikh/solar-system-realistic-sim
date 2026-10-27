# B020 Kuiper Horizons Elements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all eight named frontend KBOs use their authoritative JD 2461000.5 Horizons osculating elements so their rendered positions agree with independent captured vectors.

**Architecture:** Replace only the orbit records in the active `NAMED_KBOS` array and its first seven stale catalog duplicates, leaving visual metadata and ordering intact. A new real-propagator test pins full literal source fields, independent literal Horizons vectors, duplicate agreement, and metadata/order invariants.

**Tech Stack:** TypeScript, Vitest, Three.js vector propagation, npm

**Spec:** `agent-notes/BUG_FIX_REPORT_2026-10-17.md` (B020), with `backend/data/bodies.py` as the authoritative element source

## Global Constraints

- Use epoch JD `2461000.5`; J2000 describes the ecliptic reference frame, not the element epoch.
- Copy the exact seven legacy-Horizons rows plus the already-remediated Varuna row from `backend/data/bodies.py`.
- Keep all non-orbit `NAMED_KBOS` metadata and array order unchanged.
- Update only the first seven stale `KUIPER_BELT_OBJECTS` duplicates; preserve the already-correct Varuna row.
- Expectations must use committed literal Horizons vectors and must not derive truth through production orbit helpers.
- Leave work uncommitted for independent review.

## Review Focus

- Every named KBO must remain at the same index and retain class, color, size, albedo, and irregularity metadata.
- Every orbit field, including `periodDays`, must match the authoritative source exactly.
- The active generator and duplicate catalog must agree for all eight named objects.
- Propagated position error at the source epoch must be below `1e-5 AU` for each object.
- The comment must distinguish the J2000 coordinate frame from the JD 2461000.5 element epoch.

---

### Task 1: Replace named KBO orbit records

**Files:**
- Modify: `src/sim/kuiperBelt.ts:59-68`
- Modify: `src/data/planets.ts:662-812`
- Create: `src/sim/kuiperBelt.horizons.test.ts`

**Interfaces:**
- Consumes: `generateKuiperBelt(count, seed)`, `propagateKBOPositions(kbos, jd, out)`, and `KUIPER_BELT_OBJECTS`.
- Produces: eight ordered `NAMED_KBOS` with Horizons osculating elements at JD 2461000.5 and synchronized catalog duplicates.

- [x] **Step 1: Add strict RED tests**

Use literal orbit rows and captured heliocentric ecliptic-J2000 vectors for Eris, Makemake, Haumea, Sedna, Quaoar, Orcus, Gonggong, and Varuna. Assert exact orbit fields, `<1e-5 AU` Euclidean position error through the real generator/propagator, catalog agreement, and unchanged order/metadata.

- [x] **Step 2: Verify RED**

Run `npm test -- --run src/sim/kuiperBelt.horizons.test.ts`.

Expected: the first seven source-field assertions and stale active-vector assertions fail; Varuna's active row also fails because its epoch and rounded fields are stale.

Observed: `3 failed, 1 passed`. Exact fields, independent vectors, and duplicate agreement failed; the unchanged metadata/order invariant passed. Eris was `10.2339603 AU` from its captured vector.

- [x] **Step 3: Apply exact source rows**

Replace all eight active orbit records from `backend/data/bodies.py`. Replace the first seven duplicate orbit records in `src/data/planets.ts`, preserve Varuna, and correct the epoch/frame comment.

- [x] **Step 4: Verify focused behavior and types**

Run the new test, the four-file 45-test baseline, and the relevant TypeScript check.

Observed: the new test passed `4/4`; the combined focused run passed `5 files/49 tests`; `npm run typecheck:ratchet` passed with `0/226` legacy diagnostics and no bucket regression. The whole frontend suite also passed `76 files` plus `1 skipped`, `784 tests` plus `413 skipped`.

- [x] **Step 5: Review the complete diff**

Run `git diff --check`, inspect every changed orbit literal against the backend source, update this plan and the ignored ledger, and hand off uncommitted for independent review.

Observed: every production literal matches the backend source and every independent vector passes below `1e-5 AU`; `git diff --check` passed. Ready for independent review, uncommitted.
