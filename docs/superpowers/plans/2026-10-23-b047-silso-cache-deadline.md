# B047 SILSO Cache Deadline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let aggregate solar snapshots deliver an admissible SILSO cache entry even when an earlier SWPC acquisition exhausts the shared deadline.

**Architecture:** Check SILSO's fresh cache and last-known-good policy before entering an acquisition deadline scope. Only the actual single-flight refresh owns or inherits an acquisition scope, so standalone refreshes remain bounded and nested refreshes use the aggregate request's remaining budget.

**Tech Stack:** Python 3.12, pytest, the existing bounded solar HTTP and single-flight helpers.

**Spec:** `agent-notes/BUG_FIX_REPORT_2026-10-17.md` B047, plus the approved B047 implementation assignment. The report is available in the primary checkout but is not tracked in this worktree.

## Global Constraints

- Remove only the aggregate SILSO budget precheck; SWPC and SDO/AIA deadline behavior stays unchanged.
- `_fetch_silso()` must inspect fresh cache and recent-failure/LKG state before any acquisition-scope deadline check.
- Only the `_singleflight_fetch()` refresh path enters `_acquisition_scope()`; it inherits an active aggregate deadline and creates a bounded deadline for a standalone refresh.
- An expired nested deadline with no admissible cache performs no SILSO HTTP request and reports `acquisition_deadline`.
- Preserve B048 behavior exactly: do not change `_silso_failure` assignment, descriptor, or backoff logic.
- Leave the B047 diff uncommitted until independent review.

## Review Focus

- A fresh SILSO cache survives complete SWPC budget exhaustion in an aggregate snapshot without HTTP.
- An expired transport cache that is still admissible as SILSO LKG is returned as `stale_lkg` after SWPC budget exhaustion without HTTP.
- Direct `_fetch_silso()` calls inside an expired inherited scope still reach admissible cache state before checking the deadline.
- Missing or scientifically expired cache data never bypasses the deadline and never starts HTTP after aggregate budget exhaustion.
- A real refresh inherits the caller's remaining budget, while a standalone refresh still receives its own bounded budget.

---

### Task 1: Move SILSO deadline ownership to refresh acquisition

**Files:**
- Modify: `backend/sim/solar_realtime_data.py`
- Modify: `backend/tests/test_solar_silso_cache.py`
- Create: `.superpowers/sdd/2026-10-23-b047-silso-cache-deadline/{progress.md,task-1-brief.md}`

**Interfaces:**
- Consumes: `SolarRealtimeDataProvider._acquisition_scope()`, `_fetch_snapshot_with_deadline()`, `_fetch_silso()`, `_fetch_silso_with_deadline()`, `_singleflight_fetch()`.
- Produces: cache-first SILSO delivery and refresh-only deadline scoping without altering the SILSO failure/backoff contract.

- [x] **Step 1: Add aggregate and direct cache-path regression tests**

Add tests proving fresh cache and stale LKG delivery after SWPC exhausts the aggregate deadline, plus direct fresh-cache access within an already-expired inherited scope. Assert SILSO performs no HTTP work and aggregate source status remains truthful.

- [x] **Step 2: Run cache-path RED**

Run the new B047 tests. Confirm the current aggregate precheck or `_fetch_silso()` wrapper reports `acquisition_deadline` before the cache policy is consulted.

Result: all three cache-path regressions failed for the expected early
deadline gate: both aggregate snapshots marked SILSO unavailable, and the
direct call raised before returning its fresh cache.

- [x] **Step 3: Add refresh deadline contract tests**

Add tests proving an expired nested scope with no cache raises `SolarRealtimeFetchError(code="acquisition_deadline")` without HTTP, a nested live refresh passes only the parent's remaining budget, and a standalone refresh receives a new bounded budget.

- [x] **Step 4: Run the complete B047 test selection before production edits**

Confirm the new cache-path tests fail for B047 while the refresh-budget characterization tests protect existing behavior.

Result: `test_solar_silso_cache.py` produced 3 expected failures and 32
passes. The no-cache/no-HTTP, inherited remainder, and standalone refresh
guards already passed against the original implementation.

- [x] **Step 5: Implement the minimal scope move**

Remove the SILSO-only `_remaining_provider_budget()` precheck from `_fetch_snapshot_with_deadline()`, make `_fetch_silso()` call its cache-aware implementation without an outer scope, and wrap only `_singleflight_fetch()` in `_acquisition_scope()` inside its existing `try` block. Do not edit either `_silso_failure` assignment path.

Result: production changed only at those three scope/precheck sites. Both
`_silso_failure` assignments and their descriptor/backoff calculations are
unchanged.

- [x] **Step 6: Run B047 GREEN and the focused four-module suite**

Run `test_solar_silso_cache.py`, then the baseline four-module solar realtime suite. Inspect the full diff and run `git diff --check` before requesting independent review.

Result: SILSO GREEN passed all 35 tests. Fresh final verification passed all
169 tests across the four solar realtime modules in 0.58s, and
`git diff --check` was clean. The diff is uncommitted and ready for
independent review.
