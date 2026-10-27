# B016 Horizons Queue Deadline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent local Horizons permit waiting from consuming the configured upstream timeout or opening the shared provider-outage breaker.

**Architecture:** `_run_horizons_request` will poll semaphore admission only against its request-owned `PlanningContext`; after acquiring the permit, it will recheck that context and begin a fresh upstream deadline capped by the context deadline. The transport, redirect reservations, and permit ownership remain unchanged.

**Tech Stack:** Python 3.12, threading, request-owned `PlanningContext`, pytest.

**Spec:** `/home/nomad/ai/projects/repositories/solar-system-realistic-sim/agent-notes/BUG_FIX_REPORT_2026-10-17.md` — B016 at lines 325-329.

## Global Constraints

- Fix B016 only in Horizons queue/admission timing; do not change provider selection, state contract, caching, redirect allow-list, or budget limits.
- Queue waiting is governed solely by the owning `PlanningContext`; cancellation and context deadline never become provider failures or shared outages.
- Start configured upstream timeout only after permit admission; cap it at remaining context lifetime.
- Preserve post-admission context recheck, request reservation, child/permit release lifecycle, redirect deadline behavior, genuine upstream-timeout breaker behavior, and B003 provider-revision coverage.
- Add deterministic distinct-key contention plus queue-expiry/cancellation admission-race controls using healthy transports.
- Run tests with Python `3.12.13` at `/tmp/solar-sim-py312/bin/python`, `PYTHONPATH=backend`.
- Produce exactly one atomic commit: `fix(ephemeris): separate Horizons queue and upstream deadlines (B016)`.

## Review Focus

- Two distinct keys queue behind one healthy ~75 ms transport under a ~100 ms upstream timeout, both receive full post-admission allowance, and a third call sees no outage.
- Queue-only context expiry reaches no transport and does not create a provider outage.
- Cancellation racing permit admission exits as planning control, releases the permit, and never starts a transport.
- A real transport timeout still opens the outage breaker after one provider attempt.
- Redirect transport and provider revision contract tests retain their existing behavior.

---

### Task 1: Separate Horizons queue and upstream deadlines

**Files:**
- Modify: `backend/mission/ephemeris_service.py:1208-1375`
- Modify: `backend/tests/test_ephemeris_service_safety.py`
- Create: `.superpowers/sdd/2026-10-23-b016-horizons-queue-deadline/{progress.md,task-1-brief.md}`

**Interfaces:**
- Consumes: `PlanningContext.checkpoint()`, `deadline_monotonic`, `remaining_seconds()`, and `_HORIZONS_CONCURRENCY_GUARD`.
- Produces: unchanged `_run_horizons_request(...) -> bytes` behavior with separately scoped queue and upstream deadlines.

- [x] **Step 1: Write deterministic failing admission tests**

Add a real-service contention test with two distinct request keys and one shared permit. Healthy transports sleep about 75 ms, record received timeouts, and return valid payloads. With `horizons_timeout_s≈0.10` and longer contexts, assert both samples succeed, the second transport receives a fresh near-0.10 s allowance, no provider failure/outage occurs, and a fresh third key starts normally. Add queue-only deadline, cancellation/admission-race, and genuine provider timeout controls.

- [x] **Step 2: Run RED**

Run:

```bash
PYTHONPATH=backend /tmp/solar-sim-py312/bin/python -m pytest -q backend/tests/test_ephemeris_service_safety.py -k 'queue or timeout_opens_request_circuit'
```

Expected: the healthy distinct-key queue case fails because the second request receives the nearly exhausted pre-admission deadline and is classified as an upstream timeout.

Result: captured on the primary test before the production change (0.42 s): the queued request raised `EphemerisUpstreamTimeout` at `assert not errors`.

- [x] **Step 3: Implement post-admission upstream deadline**

In `_run_horizons_request`, acquire by polling `HORIZONS_WAIT_POLL_S` while checkpointing the context. On admission, checkpoint again, then calculate `absolute_deadline = min(time.monotonic() + timeout_s, context.deadline_monotonic)` before reserving/starting transport. Do not turn queue deadline/cancellation into `EphemerisUpstreamTimeout`.

- [x] **Step 4: Run GREEN and focused regression suite**

Run the four parent-requested tests: `test_ephemeris_service_safety.py`, `test_horizons_owned_transport.py`, `test_horizons_redirect_contract.py`, and `test_trajectory_endpoint_budget.py`, then `git diff --check`.

Expected: all selected tests pass and the diff check is silent.

Result: `144 passed in 7.37s`; `git diff --check` was silent.

- [x] **Step 5: Commit atomically**

Commit the two code/test files, this plan, and this plan's SDD ledger with message `fix(ephemeris): separate Horizons queue and upstream deadlines (B016)`.
