# B014 Playback Epoch Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop live simulation playback cleanly at an engine's inclusive supported epoch boundary instead of latching a fatal engine failure.

**Architecture:** Before each playback step, clamp its signed fixed-frame delta to the remaining distance to `engine.supported_jd_range`. Apply that identical delta to the main and active Kuiper engines, pause at the boundary, and emit one recoverable `epoch_out_of_range` notice. Keep explicit seeking and genuine in-range exceptions on their existing paths.

**Tech Stack:** Python 3.12, `SimulationRunner`, pytest.

**Spec:** B014 in `/home/nomad/ai/projects/repositories/solar-system-realistic-sim/agent-notes/BUG_FIX_REPORT_2026-10-17.md:334-337` plus the parent task ruling.

## Global Constraints

- Scope is B014 playback only: no REBOUND validation change, no explicit seek semantic change, and no WebSocket schema change.
- Boundaries are inclusive. Outward motion at a bound performs neither main nor Kuiper step; inward motion can resume normally.
- A crossing frame advances both engines by the same signed remaining delta, pauses, and emits exactly one recoverable `epoch_out_of_range` response without setting `_runtime_error`.
- Genuine in-range main or Kuiper failures retain their current fatal behavior.
- Verify with Python 3.12 at `/tmp/solar-sim-py312/bin/python` and `PYTHONPATH=backend`.
- Produce exactly one atomic commit: `fix(runtime): stop playback at epoch boundary (B014)`.

## Review Focus

- Positive and negative partial frames must preserve equal main/Kuiper deltas and land exactly on each inclusive endpoint.
- A bound reached before the frame must perform no zero-duration main or Kuiper step and must not repeat the notice on later paused frames.
- Resuming inward after a boundary event must clear no fatal state because none was latched, and must issue no second boundary notice.
- In-range engine and active-Kuiper exceptions must still stop playback through the existing fatal latch.
- Explicit `set_julian_date` range rejection and REBOUND's independent stepping validation must stay unchanged.

---

### Task 1: Clamp runner playback at declared epoch bounds

**Files:**
- Modify: `backend/server.py:4474-4565`
- Test: `backend/tests/test_runtime_review_regressions.py`
- Create: `.superpowers/sdd/2026-10-23-b014-playback-epoch-boundary/{progress.md,task-1-brief.md}`

**Interfaces:**
- Consumes: `SimulationEngine.get_julian_date()`, optional inclusive `supported_jd_range`, `SimulationEngine.step(dt_days)`, and `KuiperBeltEngine.step(dt_days)`.
- Produces: unchanged state schema plus recoverable runner response `{type: "error", code: "epoch_out_of_range"}` at a playback boundary.

- [x] **Step 1: Write actual-frame RED regressions**

Use deterministic bounded main and active-Kuiper recorder fixtures through `SimulationRunner._loop()`: assert a positive/negative crossing uses only the same remaining signed delta, an already-outward bound calls neither step, an inward resume works without a duplicate response, and actual in-range main/Kuiper failures still latch.

- [x] **Step 2: Run RED**

Run:

```bash
PYTHONPATH=backend /tmp/solar-sim-py312/bin/python -m pytest -q backend/tests/test_runtime_review_regressions.py -k 'playback_clamps_partial_boundary_step_for_main_and_kuiper or playback_at_bound_does_not_step_and_can_resume_inward_once or in_range_playback_failures_remain_fatal'
```

Expected: crossing/boundary tests fail because the current generic step exception latches `_runtime_error` or steps past the window.

Result: three boundary cases failed in 0.91 s with the fixture's out-of-range `ValueError` entering `simulation_step_failed`; the in-range fatal controls passed.

- [x] **Step 3: Implement the smallest pre-step clamp**

Compute the fixed signed frame delta as today. When the engine declares a range, compare `current_jd + delta` against it; if crossing, step by the signed remainder only when nonzero, apply the same delta to active Kuiper, then pause and emit one `epoch_out_of_range` error. If already outward at a bound, pause/notify without stepping. Leave explicit seek and generic exception handling intact.

- [x] **Step 4: Run GREEN and focused regression suite**

Run:

```bash
PYTHONPATH=backend /tmp/solar-sim-py312/bin/python -m pytest -q backend/tests/test_runtime_review_regressions.py backend/tests/test_runtime_recovery_contract.py backend/tests/test_ws_resource_contract.py backend/tests/test_rebound_epoch_contract.py backend/tests/test_kuiper_subscription_ordering.py
git diff --check
```

Expected: all focused modules pass with no whitespace errors.

Result: 107 passed in 17.90 s. The selected boundary tests were separately green (5 passed in 1.10 s).

- [x] **Step 5: Request review, record results, and commit atomically**

Request the parent review before commit if available; otherwise record review pending in the ledger and commit only the B014 production/tests/plan/SDD artifacts with the required message.

Result: independent review reported no Critical/Important findings, confirmed 107 focused tests and real REBOUND probes at both bounds; only the corrected historical RED selector needed updating.
