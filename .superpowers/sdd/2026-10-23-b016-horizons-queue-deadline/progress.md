# SDD ledger — plan: docs/superpowers/plans/2026-10-23-b016-horizons-queue-deadline.md

## Baseline

- HEAD: `2a205cf` (`fix(trajectory): reclaim stranded MGA budget (B041)`).
- B016 path: `_run_horizons_request` creates `absolute_deadline` before acquiring `_HORIZONS_CONCURRENCY_GUARD`; queue delay can therefore be misclassified as upstream timeout and open the shared Horizons outage breaker.

## Preflight

| Check | Result |
| --- | --- |
| Production path under test | `EphemerisService.sample_state` → shared-flight owner → `_run_horizons_request` → shared semaphore/transport/outage state. |
| Test strategy | Distinct-key threads use real request ownership, context, semaphore, response parsing, and outage bookkeeping; only network transport is deterministic. |
| Scope | One B016 timing boundary, safety tests, plan, and ledger. |

Ruling: queue wait belongs to the owner context rather than the upstream provider — otherwise healthy provider capacity becomes a shared outage; cost if wrong is either false 30-second outage or unchecked local waiting.

## Task 1 — Separate Horizons queue and upstream deadlines

- Status: complete
- Brief: `task-1-brief.md`

### Evidence

- RED: the distinct-key, healthy 75 ms transport contention test failed before the change because the queued caller inherited the original 100 ms deadline and raised `EphemerisUpstreamTimeout`.
- GREEN: queue admission now polls only against `PlanningContext`; after admission it checkpoints and creates `min(now + upstream_timeout, context_deadline)`.
- Controls: queue-only expiry and cancellation during permit admission produce `PlanningDeadlineExceeded` / `PlanningCancelled`, call no transport, and record no provider failure or outage. A retained genuine upstream timeout breaker test remains in the focused suite.
- Focused verification: 144 passed in 7.37 s across the four requested modules; `git diff --check` passed.

## Completion

- Complete in the accompanying single atomic B016 commit.
