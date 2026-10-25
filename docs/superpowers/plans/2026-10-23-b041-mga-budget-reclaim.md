# B041 MGA Budget Reclamation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a truncated assist-depth stage with no certified output from abandoning most of the request's leg-evaluation budget and returning an inconclusive search.

**Architecture:** Keep cumulative per-depth ceilings as soft reservations for deeper search. While the current depth has produced no certified output of its own, allow its currently running outgoing-edge generator to borrow the still-unused global/context budget. Record that output durably before retention can trim a route, then disable borrowing immediately when the generator yields the first certified route or partial. Hard request limits, cancellation, and deadlines remain authoritative on every leg.

**Tech Stack:** Python 3.12, deterministic bounded MGA search, pytest.

**Spec:** `/home/nomad/ai/projects/repositories/solar-system-realistic-sim/agent-notes/BUG_FIX_REPORT_2026-10-17.md` — B041 at lines 320-324.

## Global Constraints

- Fix B041 only; do not change Lambert physics, flyby certification, beam width, configured hard limits, result ranking, provider behavior, or HTTP status mapping.
- Use strict TDD: add a deterministic search whose first certified assisted route requires more than the depth-1 reservation but less than the hard total, observe `best=None` at 768 evaluations, then change production code.
- Keep `LEG_EVALUATION_CUMULATIVE_TARGETS` as the normal reservation schedule.
- Borrow only while a depth has no certified output of its own. A pre-existing direct route does not count as depth output, but the first completed assisted route or next-depth partial does.
- Do not restart an unwound `_matched_outgoing_legs` generator; replaying cached legs still consumes logical request budget and can strand work again.
- Never exceed `MAX_LEG_EVALUATIONS`, the owning `PlanningContext` limits, its deadline, or cancellation state.
- Preserve cached-leg accounting and charge unique evaluations exactly once.
- Make telemetry disclose the effective enlarged stage limit only if borrowed work actually crosses the original ceiling; preserve existing stage-limit telemetry when the reservation was sufficient.
- Preserve the existing deeper-route reservation regression unchanged.
- Produce exactly one atomic B041 commit, including tests and this plan.
- Run tests under Python `3.12.13` from `/tmp/solar-sim-py312/bin/python` with `PYTHONPATH=backend`.

## Review Focus

- The RED fixture reaches exactly the current 768-evaluation depth-1 ceiling and yields no route; GREEN continues the same generator and finds the certified route after 800 unique evaluations.
- The corrected search stays at or below 2,000 evaluations and reports the borrowed effective limit consistently.
- Borrowing switches off on the first yielded output, before the generator can consume work intended for deeper depths.
- Retaining only the top completed routes cannot erase that this depth already yielded a certified route and reopen borrowing for a later generator.
- A smaller request-owned limit, cancellation, or deadline still terminates immediately without being bypassed by the local borrowing flag.
- Existing searches that generate a partial within their reservation still attempt depths 1, 2, and 3 under the unchanged cumulative targets.

---

### Task 1: B041 reclaim unused MGA leg budget for an empty frontier

**Files:**
- Modify: `backend/trajectory/mga.py`
- Modify: `backend/tests/test_mga_bounded_search.py`

- [x] **Step 1: Write the failing empty-frontier regression**

In `test_mga_bounded_search.py`, build a deterministic two-assist search with real `PlanningContext` and owned `EphemerisService`. Patch time-of-flight candidates to one value and Lambert legs to deterministic complete dictionaries, suppress the direct Earth-to-target result, and make `_matched_outgoing_legs` perform 800 unique `runtime.leg(...)` evaluations before yielding one certified route/partial. Assert:

- `result["best"]` is present;
- `768 < search["legEvaluations"] <= 2_000`;
- depth-1 telemetry shows that its effective limit borrowed the remaining budget; and
- the global planning-context counter equals the search's unique evaluation count.

The current code must fail with `best=None`, `legEvaluations == 768`, and `assist_depth_1_budget_exhausted`.

Add focused controls proving a stage that yields inside 768 retains the original limit/deeper reservation, and a request limit/cancellation during borrowed work remains authoritative. Reuse existing helpers rather than duplicating search physics.

- [x] **Step 2: Run the regression to verify RED**

Run:

```bash
PYTHONPATH=backend /tmp/solar-sim-py312/bin/python -m pytest -q \
  backend/tests/test_mga_bounded_search.py \
  backend/tests/test_trajectory_endpoint_budget.py
```

Expected: the new empty-frontier route assertion fails at the 768-evaluation soft ceiling; all existing bounded-search tests remain green.

- [x] **Step 3: Add explicit soft-budget borrowing to the search runtime**

In `_SearchRuntime`, retain the configured per-stage ceiling and add a narrowly scoped flag/method for borrowing the remaining global/context capacity. In `leg(...)`:

- continue to check the planning context before work;
- when the soft ceiling is reached, proceed only if borrowing is enabled and the effective hard/context ceiling has room;
- otherwise record the same truncated stage and raise `_DepthBudgetExhausted`;
- retain the existing hard global and context reservations; and
- update stage-limit telemetry only when evaluations actually pass the normal reservation.

Never relax route-prefix or ephemeris budgets.

- [x] **Step 4: Enable borrowing only until the depth produces output**

In the assist-depth loop, maintain a per-depth `stage_has_certified_output` flag. Before iterating each `_matched_outgoing_legs` generator, enable borrowing only while that flag is false. Set it true before processing the first yielded route or partial, so `_retain_completed` cannot erase the fact that output occurred. Always clear the runtime borrowing flag in `finally`, including exception, cancellation, and natural-exhaustion paths.

Keep the existing `_DepthBudgetExhausted` catch so outputs yielded before restoration remain owned by their lists and the search can advance normally.

- [x] **Step 5: Run focused verification**

Run:

```bash
PYTHONPATH=backend /tmp/solar-sim-py312/bin/python -m pytest -q \
  backend/tests/test_mga_bounded_search.py \
  backend/tests/test_trajectory_endpoint_budget.py \
  backend/tests/test_trajectory_regression.py \
  backend/tests/test_mission_agents.py
PYTHONPATH=backend /tmp/solar-sim-py312/bin/python -m pytest -q backend/tests
git diff --check
```

Focused result: 138 passed and `git diff --check` was silent. The full backend suite is intentionally deferred to the reviewer.

- [x] **Step 6: Commit B041 atomically**

```bash
git add docs/superpowers/plans/2026-10-23-b041-mga-budget-reclaim.md \
  backend/trajectory/mga.py backend/tests/test_mga_bounded_search.py
git commit -m "fix(trajectory): reclaim stranded MGA budget (B041)"
```

## Review follow-up

Review found that `_retain_completed` can trim a newly certified assisted route while leaving `len(completed)` equal to its stage-entry value. A later generator would then incorrectly reopen borrowing. The added 48-direct/two-assist regression failed before the follow-up (`assistedRoutes == 2`), then passed after the durable per-depth flag prevented the second generator from crossing the 768-evaluation reservation.

Verification after the review correction:

```bash
PYTHONPATH=backend /tmp/solar-sim-py312/bin/python -m pytest -q \
  backend/tests/test_mga_bounded_search.py \
  backend/tests/test_trajectory_endpoint_budget.py \
  backend/tests/test_trajectory_regression.py \
  backend/tests/test_mission_agents.py
```

Result: 139 passed.
