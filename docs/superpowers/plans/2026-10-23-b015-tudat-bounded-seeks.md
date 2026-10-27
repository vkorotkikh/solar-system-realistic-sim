# B015 Tudat Bounded Seeks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound TudatPy seek memory by propagating long gaps as atomic fixed-size arcs within the validated 1990–2050 simulation interval.

**Architecture:** Put the inclusive JDTDB operating interval in one simulation contract imported by REBOUND and Tudat. Tudat constructs out-of-arc seeks on a shallow candidate engine, propagating sequential arcs of at most `CHUNK_DAYS` from each prior terminal state and retaining only the last arc; it commits the candidate JD, current state, and arc only after every chunk and cancellation check succeeds.

**Tech Stack:** Python 3.12, NumPy, optional TudatPy, pytest.

**Spec:** `agent-notes/BUG_FIX_REPORT_2026-10-17.md` (B015) plus the approved implementation assignment. The report is available in the primary repository checkout but is not tracked in this worktree.

## Global Constraints

- The inclusive supported JDTDB interval is exactly `2447892.5` through `2469807.5` (1990-01-01 through 2050-01-01), shared with REBOUND.
- Validate initialization, direct seeks, and steps before native propagation can leave the interval.
- Every native propagation span is at most `CHUNK_DAYS`; long seeks seed each new arc from the preceding arc's terminal integrated state and never reseed from SPICE.
- Retain only the final candidate arc. Commit `_jd`, `_current_state`, and all `_chunk_*` fields atomically after the complete seek succeeds.
- A propagation failure or cooperative cancellation in any intermediate or final chunk leaves the live JD, current state, and retained arc unchanged.
- Initializing at the upper supported endpoint propagates backward so its native arc remains inside the supported interval.
- Preserve the public `supported_jd_range` contract used by the B014 runner boundary clamp.
- Leave the B015 diff uncommitted until independent review.

## Review Focus

- A target many chunks forward or backward must never produce one target-sized native history.
- Intermediate arcs must begin from the exact prior terminal state, including direction changes, without a second SPICE seed.
- Targets exactly at either inclusive endpoint must work, while any epsilon outside must fail before native work.
- A middle/final solver failure or cancellation must not expose a partially advanced JD, state, or arc.
- Existing in-arc interpolation and optional real-Tudat continuity/energy behavior must remain intact.

---

### Task 1: Add bounded, atomic Tudat seek arcs

**Files:**
- Create: `backend/sim/epoch_contract.py`
- Modify: `backend/sim/rebound_nbody.py`
- Modify: `backend/sim/tudatpy_hooks.py`
- Modify: `backend/tests/test_seek_optimizations.py`
- Modify if needed: `backend/tests/test_ephemeris_remediation.py`
- Modify if needed: `backend/tests/test_tudat_science_review.py`
- Create: `.superpowers/sdd/2026-10-23-b015-tudat-bounded-seeks/{progress.md,task-1-brief.md}`

**Interfaces:**
- Consumes: `TudatPyEngine.initialize()`, `set_julian_date()`, `step()`, `_propagate_chunk()`, and `SimulationEngine.supported_jd_range`.
- Produces: shared `SUPPORTED_JD_MIN_TDB`/`SUPPORTED_JD_MAX_TDB`, Tudat's inclusive range property and validation, fixed-size candidate arc propagation, and cooperative seek cancellation.

- [x] **Step 1: Add supported-range and endpoint RED tests**

Using solver doubles, assert Tudat and REBOUND expose the same inclusive constants; invalid initialize/seek/step requests perform no native work and preserve state; initialization at the maximum endpoint creates a backward arc wholly inside the range.

- [x] **Step 2: Run range/endpoint RED**

Run the selected tests and confirm failures are caused by Tudat's missing range contract, missing validation, and forward-only initial arc.

Result: the range property returned `None`; two invalid initializations reached
native loading; the upper-endpoint arc ran forward; and invalid seeks/steps
performed propagation instead of raising.

- [x] **Step 3: Implement the shared epoch contract and range-aware initial arc**

Create the common constant module, preserve REBOUND's public constant imports, add Tudat `_validate_supported_jd()` and `supported_jd_range`, and choose the initial arc direction so a full bounded arc fits at the upper edge.

- [x] **Step 4: Run range/endpoint GREEN and existing range tests**

Run the selected Tudat tests plus REBOUND epoch/resource contract tests.

Result: all 15 seek-optimization tests and all 40 REBOUND epoch/resource
contract tests passed. REBOUND continues to export the shared constants.

- [x] **Step 5: Add sequential-seek and atomicity RED tests**

Exercise long forward and backward seeks with deterministic solver doubles. Assert each native span is no larger than `CHUNK_DAYS`, each seed equals the prior terminal state, only one SPICE seed occurs, only the final arc is retained, and middle/final failure or cancellation restores the exact original live fields.

- [x] **Step 6: Run sequential/atomicity RED**

Confirm the current single-arc implementation emits an oversized span and mutates the live arc before later failure.

Result: both directions produced one oversized native call instead of three
bounded calls; middle/final failure injections and cancellation were never
reached because no sequential loop existed.

- [x] **Step 7: Implement candidate-based sequential propagation**

Make `_propagate_chunk()` advance at most one bounded arc. Have out-of-arc seeks loop on a shallow candidate, check cooperative cancellation between chunks, interpolate there, and commit its JD/state/arc fields only after success.

- [x] **Step 8: Run sequential/atomicity GREEN**

Run all new B015 tests, then the complete modified test modules.

Result: all 15 seek-optimization tests passed. The three primary focused
modules passed 41 tests and skipped 10 optional-native tests. An existing
`1e308` validation test initially exposed a message compatibility regression;
validating finite JDTDB seconds before the range check restored it.

- [x] **Step 9: Run focused verification and request independent review**

```bash
PYTHONPATH=backend /tmp/solar-sim-py312/bin/python -m pytest -q \
  backend/tests/test_ephemeris_remediation.py \
  backend/tests/test_tudat_science_review.py \
  backend/tests/test_seek_optimizations.py \
  backend/tests/test_rebound_epoch_contract.py \
  backend/tests/test_ws_resource_contract.py
git diff --check
```

Record the RED/GREEN evidence in this plan and its ignored ledger. Leave the complete B015 diff uncommitted for independent review.

Result: the complete five-module focused suite passed 81 tests and skipped 10
optional-native tests in 6.39s. The separate native-runtime module passed 2
tests and skipped 2 when Tudat was unavailable. `git diff --check` was clean;
the B015 diff remains uncommitted and ready for independent review.
