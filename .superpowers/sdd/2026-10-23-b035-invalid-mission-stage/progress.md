# SDD ledger — plan: docs/superpowers/plans/2026-10-23-b035-invalid-mission-stage.md

## Baseline

- HEAD: `10d832718a07da4b99c1afc19b77a0dcc56b3ca1`
- Original HTTP reproduction: missing `dry_mass_kg` returns 500; positive dry mass returns 200.
- Original direct reproduction: omitted dry mass and an empty stage both raise `KeyError: totalRequestedDeltaV_km_s`.
- Focused backend baseline: 42 tests passed across server validation, mission schemas, propulsion contract, and mass flow.
- Working tree before planning: clean.

## Preflight

| Check | Result |
| --- | --- |
| Tests consume production output | Yes: FastAPI `TestClient` exercises the real request model; direct tests exercise `MissionPlannerAgent.plan`. |
| Production produces tested output | Yes: `MissionStageRequest` owns HTTP validation and mission orchestration consumes `VehicleService` results. |
| File paths are consistent | Yes: the plan names the request schema, planner, and their existing focused test modules. |
| Scope is atomic | Yes: one B035 validation/crash correction and one commit. |

Ruling: a custom vehicle stage represents an active propulsion stage, so dry mass, propellant mass, and Isp are all required and strictly positive at the HTTP boundary — if wrong, legitimate inert/coast-only hardware needs a separate vehicle representation rather than zero-valued propulsion-stage fields.

## Task 1 — B035 validate custom stages and tolerate sparse infeasible budgets

- Status: complete
- Brief: `task-1-brief.md`
- Report: RED: 8 failures (six HTTP 500 responses and two direct `KeyError: totalRequestedDeltaV_km_s`); GREEN: 63 focused tests passed; full backend suite passed with 3,849 tests passed and 13 skipped after adding SciPy to the ephemeral test environment.
- Commit: this B035 commit (`fix(mission): reject invalid vehicle stages (B035)`)
- Review: approved with no Critical or Important findings. Deferred Minor: the direct-planner regression asserts the fail-closed status but not the exact verifier reasons; the reviewed production result includes `vehicle_budget_not_feasible`.

## Completion

- Focused verification: 63 tests passed.
- Full backend verification: 3,849 tests passed, 13 skipped.
- `git diff --check`: passed.
- Atomic commit count: 1.
