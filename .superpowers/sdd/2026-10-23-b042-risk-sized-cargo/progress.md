# SDD ledger — plan: docs/superpowers/plans/2026-10-23-b042-risk-sized-cargo.md

## Baseline

- HEAD: `7c7c7e9` (`fix(mission): reject invalid vehicle stages (B035)`).
- Reproduction with default vehicle, 6,500 kg payload, burns `[2.0, 1.5]`, 5% reserves: nominal maximum cargo 2,195.835 kg, only 0.149 kg nominal margin, infeasible at 1.0001x delta-v, seeded 5,000-sample failure probability 0.4698.
- Focused current tests: 27 passed across mission mass flow, propulsion contract, and agents.
- Full backend baseline after B035: 3,849 passed, 13 skipped.
- Working tree before planning: clean.

## Preflight

| Check | Result |
| --- | --- |
| Tests consume production output | Yes: real `VehicleService`, `LogisticsAgent`, and `RiskService` functions close and disperse the same staged vehicle. |
| Production produces tested output | Yes: logistics selects cargo and emits nominal budget telemetry; risk service owns the dispersion defaults. |
| File paths are consistent | Yes: the plan names the risk/logistics modules and their existing focused test modules. |
| Scope is atomic | Yes: one B042 cargo-margin correction and one commit. |

Ruling: cargo capacity uses the configured verifier risk threshold with the shared default delta-v sigma, so default 45% acceptance uses a 1.006283067 factor while 5% reproduces the report's 1.082242681 factor. Thresholds at or above 0.5 use nominal sizing; zero or below clamps to the largest finite quantile below one — if wrong, cargo may be over-conservative or fail to satisfy the mission's stated acceptance policy.

## Task 1 — B042 size return cargo at dispersed delta-v

- Status: complete
- Brief: `task-1-brief.md`
- Report: Initial RED: two failures (missing shared cargo factor and nominal cargo selection); initial GREEN: 17 mass-flow/propulsion tests and 52 focused tests passed. Correction RED: the report's actual 22-ton fixture returned `no_verified_candidate` with zero cargo under fixed p95 sizing. Corrected GREEN: the exact fixture returned `ok`, positive 2,078.3 kg cargo, seeded failure probability 0.3995, and 58 focused tests passed.
- Commit: this B042 commit (`fix(mission): reserve cargo delta-v margin (B042)`)
- Review: approved with no Critical or Important findings. Deferred Minors: the tracked SDD ledger is harmless workflow metadata outside the documented add list; zero-threshold coverage pins finite factor math but not direct JSON serialization.

## Completion

- Exact report reproduction: status `ok`, 2,078.2 kg cargo, failure probability 0.3995 at threshold 0.45.
- Focused verification: 58 tests passed.
- Full backend verification, two runs: 3,855 passed, 13 skipped, with two unrelated timing-sensitive failures per loaded run; each failed case passed immediately in isolation.
- `git diff --check`: passed.
- Atomic commit count: 1.
