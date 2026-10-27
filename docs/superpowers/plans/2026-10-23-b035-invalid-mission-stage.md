# B035 Invalid Mission Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return a validation error for incomplete or non-propulsive custom vehicle stages and keep direct mission-planner calls from crashing when an invalid stage reaches the vehicle service.

**Architecture:** Enforce the public HTTP contract in the FastAPI/Pydantic request model: each custom propulsion stage must explicitly provide strictly positive dry mass, propellant mass, and specific impulse. Retain the vehicle service's sparse infeasible result as a valid internal outcome, but consume its optional aggregate total defensively in mission orchestration so non-HTTP callers receive a normal no-recommendation result instead of `KeyError`.

**Tech Stack:** Python 3.12, FastAPI, Pydantic 2, pytest.

**Spec:** `/home/nomad/ai/projects/repositories/solar-system-realistic-sim/agent-notes/BUG_FIX_REPORT_2026-10-17.md` — B035 at lines 308-312.

## Global Constraints

- Fix B035 only; do not change route search, rocket-equation math, default-vehicle behavior, cargo sizing, or mission HTTP result mapping.
- Use strict TDD: add the endpoint and direct-planner regressions, observe the 500/`KeyError`, then change production code.
- A supplied custom propulsion stage must explicitly contain `dry_mass_kg`, `propellant_mass_kg`, and `isp_s`, and every value must be finite and greater than zero.
- Omitting `vehicle` must continue to select the built-in default vehicle.
- Invalid HTTP payloads must return 422 during model validation, before mission compute admission or worker execution.
- Direct/internal planner input may still normalize malformed stages to zero, but it must return a structured no-recommendation result rather than raise.
- Preserve the vehicle service's fail-closed sparse `{feasible: false, error: ...}` result; do not fabricate physical totals for a vehicle with no usable stage.
- Produce exactly one atomic B035 commit, including its tests and this plan.
- Run tests under Python `3.12.13` from `/tmp/solar-sim-py312/bin/python` with `PYTHONPATH=backend`.

## Review Focus

- Missing and zero values for each required propulsion field produce 422 and identify the offending field.
- A fully positive custom stage still passes request validation.
- Invalid request bodies never invoke the mission worker or consume the mission semaphore.
- Direct `MissionPlannerAgent.plan(...)` calls with an omitted dry mass or an empty stage no longer raise `KeyError` and remain infeasible.
- The defensive default is used only for risk/reporting flow after an already-infeasible vehicle result; it cannot make that vehicle verify successfully.

---

### Task 1: B035 validate custom stages and tolerate sparse infeasible budgets

**Files:**
- Modify: `backend/server.py`
- Modify: `backend/mission/agents.py`
- Modify: `backend/tests/test_server_validation.py`
- Modify: `backend/tests/test_mission_agents.py`

- [x] **Step 1: Write failing HTTP and direct-planner regressions**

In `test_server_validation.py`, parameterize `dry_mass_kg`, `propellant_mass_kg`, and `isp_s` across both an omitted value and `0.0`. Submit an otherwise valid `/mission/plan` payload and assert status 422 plus a validation location ending in the selected field. Patch the mission worker/admission path with a sentinel that would fail if malformed input reached it. Add a positive-stage case at the request-model boundary so the test distinguishes strict positivity from rejecting custom vehicles altogether.

In `test_mission_agents.py`, reproduce direct calls with (a) omitted `dry_mass_kg` and (b) an empty stage dictionary. Assert neither raises, each returns no recommendation, and each reports a normal infeasible/no-verified status.

- [x] **Step 2: Run the regressions to verify RED**

Run:

```bash
PYTHONPATH=backend /tmp/solar-sim-py312/bin/python -m pytest -q \
  backend/tests/test_server_validation.py \
  backend/tests/test_mission_agents.py
```

Expected: malformed stages are currently accepted by request validation and the direct planner raises `KeyError: totalRequestedDeltaV_km_s`.

- [x] **Step 3: Tighten the HTTP stage schema**

In `MissionStageRequest`, remove numeric defaults from `dry_mass_kg`, `propellant_mass_kg`, and `isp_s`, making all three required `FiniteFloat` fields with `gt=0.0`. Keep the optional stage name and existing non-empty-name validation unchanged.

- [x] **Step 4: Consume sparse infeasible vehicle results defensively**

In `MissionPlannerAgent.plan`, read `totalRequestedDeltaV_km_s` with a `0.0` fallback after `LogisticsAgent.evaluate`. Keep `burns` and all other sparse-result accesses fail-closed. The existing verifier must continue rejecting the candidate for `vehicle_budget_not_feasible` (and zero returned payload).

- [x] **Step 5: Run focused and project verification**

Run:

```bash
PYTHONPATH=backend /tmp/solar-sim-py312/bin/python -m pytest -q \
  backend/tests/test_server_validation.py \
  backend/tests/test_mission_agents.py \
  backend/tests/test_mission_schemas.py \
  backend/tests/test_mission_propulsion_contract.py \
  backend/tests/test_mission_mass_flow.py
PYTHONPATH=backend /tmp/solar-sim-py312/bin/python -m pytest -q backend/tests
git diff --check
```

Expected: all focused and backend tests pass, and `git diff --check` is silent.

> Verification note (2026-10-23): the focused B035 set passed 63 tests and
> `git diff --check` was clean. After adding SciPy to the ephemeral Python 3.12
> verification environment, the full backend suite passed with 3,849 tests
> passed and 13 skipped.

- [x] **Step 6: Commit B035 atomically**

```bash
git add docs/superpowers/plans/2026-10-23-b035-invalid-mission-stage.md \
  backend/server.py backend/mission/agents.py \
  backend/tests/test_server_validation.py backend/tests/test_mission_agents.py
git commit -m "fix(mission): reject invalid vehicle stages (B035)"
```
