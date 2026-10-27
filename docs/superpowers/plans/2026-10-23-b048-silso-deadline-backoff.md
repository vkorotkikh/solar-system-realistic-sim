# B048 SILSO Deadline Backoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent an aggregate acquisition deadline reached during a SILSO refresh from poisoning SILSO's independent 300-second failure backoff.

**Architecture:** Keep the B047 cache-first and refresh-scoped deadline flow unchanged. At the existing refresh exception boundary, continue describing every failure for delivery and generic single-flight behavior, but persist `_silso_failure` only for failures whose code is not `acquisition_deadline`; a deadline leaves any existing descriptor untouched.

**Tech Stack:** Python 3.12, pytest, existing SILSO cache/single-flight/deadline machinery.

**Spec:** `agent-notes/BUG_FIX_REPORT_2026-10-17.md` B048 plus the approved B048 implementation assignment. The report is available in the primary checkout but is not tracked in this worktree.

## Global Constraints

- Trigger deadline regressions after a refresh has started, specifically at the existing post-parse `_remaining_provider_budget()` check.
- The only production behavior change is conditional persistence after `_describe_failure()`: assign `_silso_failure` only when `failure.code != "acquisition_deadline"`.
- An `acquisition_deadline` must not clear or replace any existing SILSO failure descriptor, whether absent, active, or expired.
- Ordinary transport, HTTP, and parser failures retain the existing sanitized descriptor and 300-second SILSO backoff.
- Preserve B047 cache ordering and deadline scoping, plus generic `_singleflight_fetch()` behavior.
- Leave B048 uncommitted until independent review.

## Review Focus

- A no-cache deadline after successful download/parse permits an immediate second refresh rather than a 300-second rejection.
- Stale LKG delivery reports the current `acquisition_deadline` while retaining the exact canonical cache object.
- An expired ordinary failure descriptor remains the same object after a later deadline and does not become active again.
- An active ordinary failure still suppresses repeated HTTP and retains its original sanitized provenance.
- `TimeoutError` and representative parser failures still create the normal 300-second `upstream_timeout`/`upstream_failure` backoff.

---

### Task 1: Exclude acquisition deadlines from SILSO failure persistence

**Files:**
- Modify: `backend/sim/solar_realtime_data.py`
- Modify: `backend/tests/test_solar_silso_cache.py`
- Create: `.superpowers/sdd/2026-10-23-b048-silso-deadline-backoff/{progress.md,task-1-brief.md}`

**Interfaces:**
- Consumes: `refresh()` inside `_fetch_silso_with_deadline()`, `_describe_failure()`, `_silso_failure`, and B047's refresh-only `_acquisition_scope()`.
- Produces: deadline failures remain request-local while all non-deadline SILSO failures keep their existing persistent backoff.

- [x] **Step 1: Add post-parse deadline RED tests**

Add deterministic tests that advance the monotonic clock only after the real parser returns. Cover no-cache immediate retry, stale-LKG deadline provenance/canonical preservation, and exact identity preservation of an expired existing ordinary failure.

- [x] **Step 2: Add ordinary-failure controls and run RED**

Use representative `TimeoutError` and parser failures to prove ordinary failures still create active sanitized 300-second backoff and suppress immediate HTTP retries. Run the complete SILSO test module; the deadline persistence assertions must fail for B048 while the ordinary controls pass.

Result: the SILSO module produced 3 expected failures and 37 passes. The
deadline cases exposed blocked immediate retry, newly persisted deadline
state, and replacement of an expired ordinary descriptor; both ordinary
failure controls passed unchanged.

- [x] **Step 3: Implement the one-condition persistence guard**

In the existing `refresh()` exception block, keep `_describe_failure()` unchanged and guard only the `_silso_failure` assignment with `failure.code != "acquisition_deadline"`. Do not clear or replace a descriptor in the deadline branch.

Result: production adds only that condition around the existing locked
assignment; failure description, re-raise, B047 ordering, and generic
single-flight code are unchanged.

- [x] **Step 4: Run GREEN and focused verification**

Run `test_solar_silso_cache.py`, then the four-module solar realtime suite. Inspect the complete diff, confirm B047 and generic single-flight code are untouched, and run `git diff --check` before independent review.

Result: SILSO GREEN passed all 40 tests. Fresh focused verification passed
all 174 tests in 0.62s; `git diff --check` was clean. The zero-context
production diff is one conditional around the existing assignment, and B048
remains uncommitted for independent review.
