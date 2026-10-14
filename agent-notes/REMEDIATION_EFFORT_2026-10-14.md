# Canonical register remediation effort - 2026-10-14

## Objective and baseline

Resolve every remaining OPEN, VERIFY, DECISION_REQUIRED, and partially resolved item in the 83-entry canonical register. Preserve each issue's independent closure requirements and regression gates. This is an implementation effort, not a new audit-only report.

Baseline: origin/main `f45c1f917398718e27d8f1a9fdfa8502592c21fd`.
Integration branch: `remediation/canonical-register-20261014`.
Prior PRs #7, #8, #9, and #11 are now merged. SCN-056's reviewed branch is integrated locally; landing status remains distinct from test status.

## Workflow and completion rules

1. Assign independent subsystem changes to separate worktrees and commit scoped changes with canonical IDs.
2. Reproduce each code defect with a meaningful regression, repair the root, run focused checks, and preserve source/physics contracts.
3. Integrate completed branches into the effort branch, resolve overlap deliberately, run backend/frontend/build/strict-type/science gates, and review integration.
4. Record exact commits, commands, outcomes, reference provenance, and remaining constraints in the master and supporting notes.
5. Keep current source trackers as dated evidence with a current-status pointer. Never rewrite a historical failure into a historical pass.
6. A green generic suite does not close an absent hardware, external-reference, deployed-origin, Tudat, or accessibility oracle. Owner licensing selection remains an explicit dependency.
7. Keep working through queued waves; do not stop after the first batch. Publish a reviewable effort branch/PR, not a direct main update.

## Initial parallel assignments

| Workstream | Canonical IDs | Primary ownership |
|---|---|---|
| solar | 004,010,050,051,075; assess 041 | backend solar acquisition/cache/PFSS and frontend analytic cycle |
| mission | 012,020,044,045,063,072,073,078,079 | trajectory/mission, benchmark and Horizons |
| ephemeris | 017,054,055,057,074,076,077,080,081 | ephemeris models, backend simulation/forces, moon rates |
| planets | 058,059,060,061,083 | Earth/Mars quadtrees, picking helper, shader and spin |
| events | 023,024,038,065,066,067,068,069 | event engines, grids, KBO update path, SMBH data |
| accessibility | 030,031,039 | reviewed UI plan, startup recovery, application configuration |

## Subsequent work and integration gates

- Catalog/asteroid ownership: 013,014,015,034,046,082.
- Backend runtime ownership: 037,070,071.
- Toolchain ownership after frontend integration: 025,028.
- Durable evidence and provenance: 035,040.
- Scientific and release verification: 005,041,042,043,044,045,047,048,049, including every named Section 7 child.
- Reconcile prior fixes 026,027,032,033,052,053,056,064 with actual ancestry.
- Rerun impacted resolved-scoped gates for 001,002,003,006,007,008,009,011,016,018,019,021,022,029,036,062.
- Choose conservative explicit contracts for sampling, step time, visual time, configuration, and remote permits; record rationale and test the chosen behavior.
- Licensing policy is requested from the repository owner; attribution research may proceed.

## Initial issue ledger

The original entry text is retained in MASTER_ISSUE_TRACKER_2026-10-11.md. Every ID remains represented; implementation evidence will be appended per workstream.

| ID | Intake state | Intake progress |
|---|---|---|
| SCN-001 | RESOLVED_SCOPED | — |
| SCN-002 | RESOLVED_SCOPED | — |
| SCN-003 | RESOLVED_SCOPED | — |
| SCN-004 | OPEN | — |
| SCN-005 | OPEN | PARTIAL |
| SCN-006 | RESOLVED_SCOPED | — |
| SCN-007 | RESOLVED_SCOPED | — |
| SCN-008 | RESOLVED_SCOPED | — |
| SCN-009 | RESOLVED_SCOPED | — |
| SCN-010 | OPEN | — |
| SCN-011 | RESOLVED_SCOPED | — |
| SCN-012 | OPEN | PARTIAL |
| SCN-013 | OPEN | — |
| SCN-014 | OPEN | — |
| SCN-015 | DECISION_REQUIRED | — |
| SCN-016 | RESOLVED_SCOPED | — |
| SCN-017 | OPEN | — |
| SCN-018 | RESOLVED_SCOPED | — |
| SCN-019 | RESOLVED_SCOPED | — |
| SCN-020 | OPEN | PARTIAL |
| SCN-021 | RESOLVED_SCOPED | — |
| SCN-022 | RESOLVED_SCOPED | — |
| SCN-023 | OPEN | — |
| SCN-024 | OPEN | — |
| SCN-025 | OPEN | PARTIAL |
| SCN-026 | OPEN | FIX_AVAILABLE_UNMERGED |
| SCN-027 | OPEN | FIX_AVAILABLE_UNMERGED |
| SCN-028 | OPEN | — |
| SCN-029 | RESOLVED_SCOPED | — |
| SCN-030 | OPEN | — |
| SCN-031 | OPEN | — |
| SCN-032 | OPEN | FIX_AVAILABLE_UNMERGED |
| SCN-033 | OPEN | FIX_AVAILABLE_UNMERGED |
| SCN-034 | OPEN | PARTIAL; FIX_AVAILABLE_UNMERGED |
| SCN-035 | DECISION_REQUIRED | — |
| SCN-036 | RESOLVED_SCOPED | — |
| SCN-037 | DECISION_REQUIRED | — |
| SCN-038 | DECISION_REQUIRED | — |
| SCN-039 | DECISION_REQUIRED | — |
| SCN-040 | OPEN | — |
| SCN-041 | VERIFY | — |
| SCN-042 | VERIFY | PARTIAL |
| SCN-043 | VERIFY | PARTIAL |
| SCN-044 | VERIFY | PARTIAL |
| SCN-045 | VERIFY | PARTIAL |
| SCN-046 | VERIFY | — |
| SCN-047 | VERIFY | — |
| SCN-048 | VERIFY | — |
| SCN-049 | VERIFY | PARTIAL |
| SCN-050 | OPEN | PARTIAL |
| SCN-051 | OPEN | — |
| SCN-052 | OPEN | — |
| SCN-053 | OPEN | — |
| SCN-054 | OPEN | — |
| SCN-055 | OPEN | — |
| SCN-056 | OPEN | — |
| SCN-057 | OPEN | — |
| SCN-058 | OPEN | — |
| SCN-059 | OPEN | — |
| SCN-060 | OPEN | — |
| SCN-061 | OPEN | — |
| SCN-062 | RESOLVED_SCOPED | — |
| SCN-063 | DECISION_REQUIRED | — |
| SCN-064 | OPEN | — |
| SCN-065 | OPEN | — |
| SCN-066 | OPEN | — |
| SCN-067 | OPEN | — |
| SCN-068 | OPEN | — |
| SCN-069 | OPEN | — |
| SCN-070 | OPEN | — |
| SCN-071 | OPEN | — |
| SCN-072 | OPEN | — |
| SCN-073 | OPEN | — |
| SCN-074 | OPEN | — |
| SCN-075 | OPEN | — |
| SCN-076 | OPEN | — |
| SCN-077 | OPEN | — |
| SCN-078 | OPEN | — |
| SCN-079 | OPEN | — |
| SCN-080 | OPEN | — |
| SCN-081 | OPEN | — |
| SCN-082 | OPEN | — |
| SCN-083 | OPEN | — |
| SCN-033 | Repairs moon-texture ingester import and safe `--help`. | Not merged. |
| SCN-034 | Removes the external-output `relative_to` crash only. | Not merged; mutable-input/pinning scope remains even on branch. |
| SCN-005 | Visible fallback/source status shipped; production delivery remains open. |  |
| SCN-012 | Null undefined metrics and two fixed-state oracles; legacy 0/3 coverage remains. |  |
| SCN-016 | Geocentric runtime Earth; scoped resolved. |  |
| SCN-018 | Pluto secular model/gate; scoped resolved. |  |
| SCN-021 | SMBH radius/unit root resolved; source direction/jet root promoted to `069`. |  |
| SCN-022 | CPU Kepler root resolved; GLSL twin remains VERIFY. |  |
| SCN-043 | Io/Europa/Triton corrected; full coverage remains partial. |  |
| SCN-044 | Per-body/equatorial periapsis policy improved; search-quality oracle remains. |  |
| SCN-045 | Multi-rev/hyperbolic/zero-rev work landed; exact-π and `064` remain. |  |
| SCN-062 | Default-scale event lifetime fixed and tested. |  |

## Activity

- 2026-10-14: Started from fetched remote main; isolated user main and untracked audit material.
- 2026-10-14: Integrated the previously reviewed SCN-056 branch into the construction branch.

