# SDD ledger — plan: docs/superpowers/plans/2026-10-23-b041-mga-budget-reclaim.md

## Baseline

- HEAD: `abf916c` (`fix(mission): reserve cargo delta-v margin (B042)`).
- Real max-assists=2 search consumes 768/2,000 evaluations, records `assist_depth_1_budget_exhausted`, and never starts depth 2; a direct route currently survives in this branch.
- Deterministic no-direct-route reproduction requiring 800 outgoing evaluations returns `best=None` at exactly 768.
- Focused bounded-search baseline: 117 tests passed.
- Working tree before planning: clean.

## Preflight

| Check | Result |
| --- | --- |
| Tests consume production output | Yes: deterministic stubs drive the real `optimize_mga_route`, `_SearchRuntime`, planning context, stage loop, and telemetry. |
| Production produces tested output | Yes: the runtime enforces stage/global limits and the assist-depth loop owns certified outputs/frontiers. |
| File paths are consistent | Yes: the plan names the MGA implementation and existing bounded-search/endpoint tests. |
| Scope is atomic | Yes: one B041 soft-reservation reclamation and one commit. |

Ruling: a stage may borrow reserved leg evaluations only until it yields its first certified output; this preserves deeper capacity once a viable frontier exists while avoiding an empty-frontier stop — if wrong, difficult edges may still strand work or early depths may starve deeper searches.

## Task 1 — B041 reclaim unused MGA leg budget for an empty frontier

- Status: complete
- Brief: `task-1-brief.md`
- Report:
  - RED: `PYTHONPATH=backend /tmp/solar-sim-py312/bin/python -m pytest -q backend/tests/test_mga_bounded_search.py backend/tests/test_trajectory_endpoint_budget.py` produced 117 passed and 3 expected new failures. The no-direct-route regression returned `best=None`; request-limit and cancellation controls stopped at the old 768-evaluation soft ceiling before reaching their authority checks.
  - GREEN: the same focused slice passed 120 tests after the runtime retained its normal stage ceiling, borrowed only to the hard context/global ceiling, and the stage loop cleared borrowing before consuming the next item after a certified output.
  - Focused verification before review: 138 passed across bounded-search, endpoint-budget, trajectory-regression, and mission-agent targets; `git diff --check` was silent. The plan's plural `test_trajectory_regressions.py` target was corrected to the existing singular `test_trajectory_regression.py`. Full backend verification is deferred to the reviewer as requested.
- Commit: `fix(trajectory): reclaim stranded MGA budget (B041)` (this commit)
- Review: complete. `_retain_completed` could trim a depth's newly certified route and restore the old completed-list length, incorrectly reopening borrowing for the next outgoing generator. A 48-direct/two-assist production-loop regression failed RED with `assistedRoutes == 2`; the durable per-depth `stage_has_certified_output` flag fixes it. Post-review focused verification: 139 passed in 2.50s.

## Completion

- Complete after review correction. The single B041 commit includes the durable-output fix, regression, plan, and ledger; `git diff --check` is required before amend.
