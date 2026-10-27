# B051 Kuiper Payload Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop paused `/ws/sim` sessions from repeatedly serializing and sending an unchanged Kuiper payload while preserving cadence, subscriptions, and slow-transport ordering.

**Architecture:** Cache each Kuiper engine snapshot until the simulation revision changes. Have `SimulationRunner` retain that immutable snapshot across non-cadence frames and deliberately refresh or clear it at lifecycle boundaries. Have the WebSocket sender compare the retained payload object and subscription against the last successful delivery, shallow-copying the outer state and omitting repeated Kuiper fields.

**Tech Stack:** Python 3.12, asyncio, REBOUND 5.1.1, pytest.

**Spec:** `agent-notes/BUG_FIX_REPORT_2026-10-17.md` (B051) plus the approved three-layer architecture in the implementation assignment.

## Global Constraints

- Scope is B051 only; preserve the established state-update schema and non-Kuiper send cadence.
- The engine cache is invalidated on activation, deactivation, and each successful step; cached snapshots are never mutated after publication.
- The runner refreshes on activation, Kuiper cadence, and the final paused state, and clears retained data on replacement, deactivation, seek, or failure.
- Sender deduplication uses payload object identity plus subscription identity, keeps a strong reference, and advances only after a successful send.
- Slow-sender pending activation and replacement ordering must remain unchanged.
- Do not commit until an independent review is complete.

## Review Focus

- A paused frame at a cadence boundary must not rebuild or retransmit the same large payload.
- Resuming must retain old data between cadence frames and publish the newly stepped payload at cadence.
- A replacement activation or changed subscription must receive one complete initial payload even while an older send is pending.
- A failed send must not mark its Kuiper payload delivered; retrying it must remain complete.
- Deactivate, seek, replacement, and runtime failure must never republish a retained stale payload.

---

### Task 1: Cache, retain, and deduplicate Kuiper snapshots

**Files:**
- Modify: `backend/sim/kuiper.py`
- Modify: `backend/server.py`
- Modify: `backend/tests/test_kuiper_binary.py`
- Modify: `backend/tests/test_kuiper_subscription_ordering.py`
- Modify: `backend/tests/test_runtime_review_regressions.py`
- Modify: `backend/tests/test_runtime_recovery_contract.py`
- Create: `.superpowers/sdd/2026-10-23-b051-kuiper-payload-deduplication/{progress.md,task-1-brief.md}`

**Interfaces:**
- Consumes: `KuiperBeltEngine.get_state()`, `SimulationRunner._run_frames()`, `_ws_send_loop()`.
- Produces: stable Kuiper payload identity per engine revision, retained runner snapshots, and successful-delivery-based wire deduplication.

- [x] **Step 1: Add engine-cache RED tests**

Assert repeated `get_state()` calls return the same object; a successful step, deactivation, and reactivation invalidate it and produce the next snapshot.

- [x] **Step 2: Run engine-cache RED**

Run the selected tests and confirm identity/invalidation failures come from the missing cache.

Result: both tests failed on object identity because each `get_state()` call
rebuilt an equal but distinct dictionary.

- [x] **Step 3: Implement the engine snapshot cache and run GREEN**

Cache the completed state dictionary; clear the cache at activation/deactivation and only after a successful integration step.

Result: the two selected tests passed, followed by all 17 Kuiper binary tests.

- [x] **Step 4: Add runner-retention RED tests**

Exercise production `SimulationRunner` with deterministic engines to prove initial activation, paused retention, resumed cadence, final-pause refresh, and clearing after replacement/deactivate/seek/failure.

- [x] **Step 5: Run runner-retention RED**

Confirm repeated paused reads, missing non-cadence retention, or stale lifecycle data cause the expected failures.

Result: four retention/final-pause cases failed on missing payloads. After
minimal retention, five lifecycle/failure cases failed on the stale retained
object, proving the clear paths independently.

- [x] **Step 6: Implement runner retention and run GREEN**

Retain the latest Kuiper payload object, refresh only on explicit lifecycle/cadence conditions, and clear it from all invalidating paths.

Result: all nine selected cases passed, followed by all 47 runtime review
regression tests.

- [x] **Step 7: Add sender-deduplication RED tests**

Exercise `_ws_send_loop` and its production delivery tracker for paused bandwidth, moving-JD omitted-field retention, cadence refresh, subscription replacement, and failed-send retry behavior.

- [x] **Step 8: Run sender RED**

Confirm unchanged payloads remain on every wire update and that successful-delivery state does not yet exist.

Result: three cases failed because unchanged payloads remained on the wire and
the delivery tracker did not exist; the changed-subscription preservation case
already passed against the old full-payload behavior.

- [x] **Step 9: Implement sender deduplication and run GREEN**

Use object identity plus subscription identity, shallow-copy only repeated states, and record the strong-reference marker after `_ws_send_text` succeeds.

Result: all four selected sender cases passed. The complete recovery and
slow-sender ordering modules then passed 31 tests.

- [x] **Step 10: Run focused verification and request review**

```bash
PYTHONPATH=backend /tmp/solar-sim-py312/bin/python -m pytest -q \
  backend/tests/test_kuiper_binary.py \
  backend/tests/test_kuiper_subscription_ordering.py \
  backend/tests/test_runtime_review_regressions.py \
  backend/tests/test_runtime_recovery_contract.py
git diff --check
```

Record RED/GREEN evidence in this plan and the ignored ledger. Leave the complete B051 diff uncommitted for independent review.

Result: the four-module focused suite passed 95 tests in 15.25s and
`git diff --check` reported no errors. The B051 diff is uncommitted and ready
for independent review.

- [x] **Step 11: Remediate independent-review activation failure finding**

Add a regression in which replacement activation mutates the Kuiper engine to
active and then raises a generic exception. Clear the partial engine,
subscription identity, and retained payload before re-raising to the existing
`command_failed` boundary.

Result: RED failed because the partially activated engine remained active and
could publish under the old subscription. GREEN passed the selected regression,
all 48 runtime review tests, and the complete focused suite of 96 tests in
15.23s.

- [x] **Step 12: Complete independent review**

Result: independent re-review found no remaining Critical or Important
findings. Its fresh four-module suite passed 96 tests in 15.20s, the generic
activation-failure and legacy behavior probes passed, and `git diff --check`
was clean. B051 is approved for its atomic commit.
