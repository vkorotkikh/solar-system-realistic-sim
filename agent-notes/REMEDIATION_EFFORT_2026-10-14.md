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

## Original supplied issue ledger

This is the original supplied October 11 intake, not current landing status.
The master now records subsequent main merges and construction-branch evidence.
Every canonical ID appears exactly once below. Noncanonical disposition-table
rows accidentally appended by the initial extraction have been removed.

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

## Activity

- 2026-10-14: Started from fetched remote main; isolated user main and untracked audit material.
- 2026-10-14: Integrated the previously reviewed SCN-056 branch into the construction branch.

## Integration checkpoint: b0b1030

The master records 51 rows with committed `FIX_AVAILABLE_UNMERGED` evidence and
10 overlapping `PARTIAL` qualifiers. Its primary counts still describe pinned
main, not an unapproved claim that this branch has shipped. This is an active
effort; all-item closure has not been achieved.

| Gate | Executed result | Scope |
|---|---|---|
| Full integrated backend before catalog/native additions | 2,809 passed, 3 explicit coverage skips | The native gap has since been exercised separately; moon reference/accuracy follow-up remains. |
| Frontend after catalog integration | 531 passed, 2 optional GPU skips | Earlier full optional-shader run passed 522 with no skips; rerun the expanded optional lane before release. |
| Strict TypeScript | Zero errors after catalog integration | No relaxed compiler settings or baseline inflation. |
| Pinned install/build/audit | npm ci, production build and audit pass; zero reported advisories | Node 22.23.2/npm 10.9.8; Vite 7.3.7/Vitest 5.0.4. |
| Exact scientific CI lane | 6/6 baseline pass, all 6 mutants killed | b0b1030; unchanged assertions and offline guard; only reviewed PFSS input hashes refreshed. |
| Native Tudat | 8 passed, no skips | Includes three real native propagation tests; see the dedicated native report. |
| Hardware rendering | RTX 5090 asteroid, Earth/Mars and actual-app checks pass | Specific tested driver/renderer, not every GPU/platform. |
| Real local network deployment | 64/64 authenticated requests, both Uvicorn workers exercised | Real reverse proxy/auth/CORS/liveness checks; not remote TLS or production-load certification. |
| Catalog regeneration | Two independent offline builds, byte-identical artifacts | 17 actual pinned source responses, complete 100,000-row source comparison. |

Artifact locations: `/tmp/solar-remediation-integrated-backend-20261014-b.log`,
`/tmp/solar-catalog-integrated-frontend-20261014.log`,
`/tmp/solar-native-tudat-expanded-20261014.log`, and
`/tmp/solar-r3r4-integrated-20261014-b/summary.json`. Durable descriptions and
reproduction commands are in the linked workstream reports, not only these
temporary logs.

## Active next wave and external dependencies

- Solar: matched-input WSA/reference calibration and rendered solar frame oracle.
- Ephemeris: actual repair of the demonstrated 424-moon model errors. Target
  75052 now has identity-safe SPK samples; two Daphnis dates remain unavailable.
- Events: independent AGN scene/screen frames and production shader corrections.
- Runtime: independent runner/WebSocket review and kill/reap-owned Horizons I/O.
- Accessibility: real zoom/WebKit follow-up, then five-minute dev and preview
  delivery with unchanged production budgets.
- Catalog follow-up: realtime schema/reconnect and isolated frame/lifecycle
  children under SCN-049. Named Section 7 children must not disappear.
- Owner: choose code/distribution licensing and resolve restricted or unknown
  third-party asset permissions. No owner approval has been inferred.
- Deployment: provide the actual frontend/backend origin and authentication
  contract before remote deployment evidence can be collected.
- Manual release evidence: NVDA/VoiceOver and physical-touch checks remain
  distinct from DOM/browser automation; none is invented as a pass.

SCN-063's initial mission report incorrectly described lost-capacity behavior
as an accepted policy. The owner did not approve that tradeoff. It remains open
pending the terminable-transport work, and the master is authoritative.

## Third integration checkpoint

See [REMEDIATION_WAVE3_2026-10-14.md](REMEDIATION_WAVE3_2026-10-14.md) for the
continued six-worker ownership map, new AIA epoch coverage repair, solar finite
input policy, operational soak evidence and precise remaining requirements.
The full backend checkpoint at `938bca0` is 2,966 passed / 5 skipped; the later
combined operational/numerical/AIA gate is 339 passed. These are scoped results,
not complete closure of the canonical register or a merge into `main`.
