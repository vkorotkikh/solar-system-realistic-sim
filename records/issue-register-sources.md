---
title: Issue register: source texts
updated: 2026-11-18
target: none (carried from the six registers below, not re-checked against 7b94861)
status: frozen
---

# Issue register: source texts

The six registers merged into `records/issue-register.md`, minus their table rows: each table is replaced by a
placeholder naming the rows it moved. Restore an original from the commit in the table below, or, for the two
untracked ones, rebuild it from this file and the register.

| Source | Was | Last commit on main | SHA-256 of the merged text |
|---|---|---|---|
| `scan-2026-10-10` | `agent-notes/CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-10.md` (tracked, 190 KB) | 813b405a 2026-11-09 | `6cf4661b35da4c40…` |
| `master-2026-10-11` | `agent-notes/MASTER_ISSUE_TRACKER_2026-10-11.md` (tracked, 61 KB) | 73afb6b0 2026-11-08 | `8ed0a19dd4d5daf5…` |
| `bug-fix-2026-10-17` | `agent-notes/BUG_FIX_REPORT_2026-10-17.md` (untracked, never committed, 46 KB) | none | `04d6e3791ca43135…` |
| `consolidated-2026-10-24` | `agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md` (tracked, 3171 KB) | 3e35a9ac 2026-11-07 | `c7607e55add674dd…` |
| `remediation-status-2026-10-30` | `agent-notes/REMEDIATION_STATUS_2026-10-30.md` (tracked, 24 KB) | 813b405a 2026-11-09 | `f6c7afc456a857db…` |
| `open-findings-2026-11-02` | `agent-notes/OPEN_FINDINGS_2026-11-02.md` (untracked, never committed, 22 KB) | none | `796bd46d148cabe8…` |

## Source `scan-2026-10-10`: `agent-notes/CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-10.md`

    # Codebase scan and issue / problem / bug tracker — 2026-10-10

> **2026-11-02 implementation follow-up:** [Four-issue implementation and remaining acceptance](FOUR_ISSUE_IMPLEMENTATION_2026-11-02.md) records fresh multi-agent repairs for SCN-005/030/035/041 on `fix/scn-four-closure-20261102`, based on main `4f97dce`. Solar appearance is preserved. The four parent entries remain partial; actual manual devices, product rights and scientific/performance acceptance are explicitly separated from repaired code defects.

> **Last full 83-entry status (2026-10-30):** See the [verified remediation status](REMEDIATION_STATUS_2026-10-30.md) for all 83 dispositions, branch-specific fixes, remaining acceptance gates and the 25 completed working-note removals. The dated content below is historical evidence; it does not describe current main.

> **2026-11-06 re-check of SCN-001–040 on main:** 31 hold, 4 are closed by owner policy, 3 still need the owner, and 2 were not fully fixed (SCN-033, SCN-040). See [the re-check](#scn-001040-re-check-on-main--2026-11-06).

Consolidated **2026-10-17**. This is the maintained tracker: the canonical
SCN-001–083 ledger and alias mappings are below, followed by the complete
[October 10 scan](#appendix-a--october-10-scan-historical) and
[October 7 scan](#appendix-b--october-7-scan-historical). Original scan
findings, acceptance criteria, crosswalks, and evidence links are retained.
The separate October 7 and October 11 files are historical records pointing here.

The October 17 `SimulationClient` scope decision was implemented
against `review/construction-1c5d88b-fixes@9e00947`. That decision is documentation only:
no new runtime test, merge, deployment, or whole-codebase revalidation is
claimed by that decision. The separate branch inventory below records its own
remote-ref refresh; the dated follow-up below records subsequent code repairs.
The ledger's main baseline, construction checkpoint,
83 canonical IDs, 138 aliases, counts, and dated test results remain pinned to
their recorded evidence. Scope clarification does not promote a finding to
resolved or turn branch-only repairs into shipped fixes.

    ## SCN-001–040 re-check on main — 2026-11-06

This re-check ran on `main` at `8e75993`, after `git fetch`. Every fix commit cited in the 2026-10-17 inventory
below is an ancestor of `main`, including all 18 that it lists as branch repairs. Only SCN-001–040 were re-checked.

- **Fresh run:** the original reproduction from the 2026-10-07 scan, or a direct equivalent, was run again.
- **Gate tests:** the result rests on reading the code and on the tests that guard the fix. Those tests passed in a
  full local backend run (5,833 passed, 13 skipped) or in CI on `main`.

> [table: 4 rows moved to the register: rows without an id]
| Result | Count | IDs |

> [table: 40 rows moved to the register: SCN-001 … SCN-040]
| ID | Result | Evidence |

Since the re-check, `main` has merged every pull request from #32 to #58; those changes were not re-checked. All
three fix PRs are merged: SCN-004 (#47) and SCN-040 (#46) on 2026-11-08, and SCN-033 (#45) on 2026-11-09. #45 also
covers a fourth script the re-check missed, `generate_mga_reference.py`.

    ## Pasted SCN-001–040 branch inventory — 2026-10-17

The supplied list contains exactly **40 unique findings**. After a successful
`git fetch origin --prune`, remote-tracking `origin/main` is
`1e82830bd5979c1c7391c57840e3236494009045`. The reviewed repair trees
`review/construction-1c5d88b-fixes@9e00947` and
`fix/scn-041-scn-049-closure@c67a8d5` are byte-identical; the later branch date
reflects cherry-picked review fixes, not additional issue coverage.

> [table: 5 rows moved to the register: rows without an id]
| Exclusive disposition | Count |

**37/40 have scoped fixes; 2 remain partial and 1 needs owner decisions.**
Counting implementation/mitigation rather than acceptance, 39/40 have repairs
or mitigations. These are finding counts, not commit counts or whole-subsystem
certification. The 18 branch repairs are not claimed merged into main.
`SCN-005`'s visible source/error status is already fixed on main and dated
five-minute DEV/PREVIEW passes exist on a repair branch; its current startup
and final integrated acceptance remain open. `SCN-030` still needs final-source
browser and actual manual device/screen-reader evidence. `SCN-035` remains open
for the owner's code-license choice, SILSO distribution disposition and Deimos
permission or replacement decision.

`SCN-015/037/038/039` permit explicit population, clock, animation and configuration
contracts in the pasted criteria. Those contracts are implemented and tested on
repair branches; historical `DECISION_REQUIRED` baseline labels do not mean no
implementation exists, nor do implementation tests imply owner endorsement.
This targeted inventory does not rewrite the older 83-row baseline counts.

Source/commit ancestry was checked independently for every cited commit;
runtime outcomes in the inventory remain dated evidence, not a fresh rerun
of all 40 findings. The
[structured inventory](SCN001_040_BRANCH_STATUS_2026-10-17.json) records exact
refs, per-commit ancestry, evidence paths, attachment hash and residual scope.

> [table: 40 rows moved to the register: SCN-001 … SCN-040]
| ID | Disposition | Fix / evidence commits | Scoped result and remaining boundary |

    ### SCN-040 evidence preservation follow-up

The earlier `56e799a` repair intentionally archived selected Markdown only;
its linked raw scan evidence was absent from fresh branch checkouts. This
follow-up commit `0964ed9` preserves **164 original files (2,739,963 bytes)** from the October 7,
October 10 and merged-review evidence directories, including ignored log files.
All 102 entries in the original October 10 SHA-256 manifest match; the October 7
manifest's 175 source hashes match its recorded Git snapshot. The
[archive manifest](SCAN_EVIDENCE_ARCHIVE_2026-10-17.json) records every copied
file's byte count and hash. Historical probes were not executed or relabeled as
fresh passes. Older September/H1 raw evidence remains outside this archive;
this closes the missing scan-evidence gap, not all historical archival work or
the remaining main-landing requirement.

    ## Implemented follow-up and combined validation — 2026-10-17

Follow-up branch **`remediation/scn-followup-20261017`**, tested source `66ef13c`:

- **SCN-005:** direct catalog mapping plus full-catalog adoption before owned,
  cancelable shader warmup. The unchanged catalog gate passes three author DEV
  measurements at 162–182 ms; GPU-fenced scene readiness remains 6.5–6.9 s.
  Usable-scene and final-source delivery acceptance remain open.
- **SCN-042:** asteroid shader PI collision and diagnostic sampling mismatch
  repaired. Fresh combined-source RTX 5090 acceptance passes all six reference
  cases, 156 markers and 235 surface probes, with three negative controls
  detected, production antialiasing preserved and separate startup shader checks.
- **SCN-030/031 and active SCN-049 children:** the final Chromium suite passes
  43 checks with one native-visibility skip, including recovery, frame lifecycle,
  reflow and native browser zoom. Manual accessibility and other applicable
  current-source engine/deployment acceptance remain separate.
- **SCN-040:** all 164 original scan/merged evidence files are preserved with
  hash verification, alongside the consolidated scans and complete ledgers.

The combined source also passes **759 frontend tests / 413 existing skips**,
seven rendering-verifier tests, strict source/browser TypeScript and the
production build. See [exact commands, revisions, raw evidence and limits](SCN_FOLLOWUP_VALIDATION_2026-10-17.md).
Independent review found no actionable blockers. No push, main merge or
deployment occurred. These follow-ups preserve the 37 scoped / two partial /
one decision inventory above and do not promote historical main-baseline counts.

    ## SimulationClient scope decision — 2026-10-17

**Approved status: API/library-only; not integrated into the default UI.**

Retain `SimulationClient`, all four `simulationClient*.test.ts` protocol suites,
the native producer fixtures, and the verified backend repairs/regressions.
The default `src/main.ts` entry uses local Keplerian propagation and the active
`frameLifecycle`; it does not import `SimulationClient` or the dormant
`animationLoop`. Starting the backend or setting its origin does not activate
N-body playback in that UI. The API/library capability remains available;
absence from the default UI is neither a deletion decision nor defect closure.

    ### Verification boundaries for SCN-049, SCN-070 and SCN-071

> [table: 3 rows moved to the register: rows without an id]
| Verification scope | Finding / retained evidence | Acceptance boundary |

SCN-049 remains an umbrella with independently scoped children. Neither
retaining nor retiring the library closes its unrelated visual, numerical,
architecture, or active-browser requirements. SCN-070/071 retain their backend
repair credit and existing landing qualifiers; no default-UI activation is
needed to recognize those server fixes.

    ### Explicit decision required before changing scope

The selected course is retention at the API/library boundary. **Neither
retirement nor opt-in N-body UI integration is selected.** Before either
change, record a separate explicit product-owner decision in this tracker,
including the affected consumers, intended behavior, migration/compatibility
impact, implementation scope, and acceptance evidence. Routine library or
backend bug fixes within the retained scope do not require reopening that decision.

- **Retirement:** establish which API/library consumers are affected and record
  the removal/migration plan. Client retirement does not itself authorize
  deleting `/ws/sim`, its backend repairs, or their regression coverage.
- **Opt-in integration:** define mode selection and state ownership; use the
  active routing and frame-lifecycle contracts. Independently validate epoch,
  rate/pause/reverse-time and reconnect synchronization; position/velocity,
  coordinate-origin and body-identity mapping; Kuiper subscription lifecycle;
  authentication, errors, cancellation and local startup when the backend is
  unavailable. Require actual browser/backend acceptance at the final revision
  before claiming the N-body mode is delivered. Do not activate the dormant
  animation loop as a shortcut.

This decision introduces no new canonical finding or change to historical
counts. It preserves the backend, library, and active-UI acceptance boundaries
for future remediation and PR review.

    ## Canonical ledger — recorded baseline and remediation evidence

Generated **2026-10-11 21:25:36 -0400 (EDT)** from the issue-bearing artifacts
semantically dated **2026-09-27 through 2026-10-11 inclusive**. This is a
deduplicated status ledger, not a claim that every line of the repository has
been formally verified.

Recorded remediation reconciliation: **2026-10-15**, construction source
`6539902`. The pre-work checkpoint was `dbfdbed`. Primary `State` remains
pinned to the historical product baseline
`origin/main@f45c1f917398718e27d8f1a9fdfa8502592c21fd`; PRs #7, #8, #9,
and #11 had landed at that baseline. This baseline section does not assert newer remote state; the separate October 17 inventory above records its own refreshed refs.
Construction-branch progress on `remediation/canonical-register-20261014`
is separate from main resolution.

The recorded full backend/CI/script run at `a8187a7` is **3878 passed,
zero failed, 12 skipped**. Frontend at `6539902` with Node 22.23.2 is
**745 passed, 411 skipped**; strict TypeScript/build pass. Required real
Tudat at `a8187a7` is **17 passed, zero skipped**. The scientific gate
at `cdea3bc` passes all six baselines and kills all six mutants.
See [the current checkpoint](REMEDIATION_CLOSURE_CHECKPOINT_6539902_2026-10-15.md) for exact scope,
warnings, remaining failures, and evidence. The earlier `b072d32` browser
result remains **97 passed, 14 platform skips**, not a final-source browser
claim. At that checkpoint, default actual-main rendering, startup and moon promotion were not closed. The dated October 17 follow-up above records subsequent scoped repairs without relabeling these older suite results.

Use the [closure plan](REMEDIATION_CLOSURE_PLAN_2026-10-15.md) for current
owners, dependencies, remaining gates, and dated evidence. The
[remediation effort](REMEDIATION_EFFORT_2026-10-14.md) retains earlier
assignments and implementation history. The complete pre-reconciliation
tracker is preserved at Git object
`dbfdbed:agent-notes/MASTER_ISSUE_TRACKER_2026-10-11.md`.

<!-- MASTER_TRACKER_COUNTS {"snapshot":"origin/main@f45c1f917398718e27d8f1a9fdfa8502592c21fd","integration_checkpoint":"6539902","reconciliation_date":"2026-10-15","latest_full_suite_revision":"6539902","earlier_browser_revision":"b072d32","canonical_total":83,"RESOLVED_SCOPED":23,"OPEN":45,"DECISION_REQUIRED":6,"VERIFY":9,"PARTIAL_qualifier":9,"FIX_AVAILABLE_UNMERGED_qualifier":54,"FIX_AVAILABLE_UNMERGED_only":51,"PARTIAL_with_FIX_AVAILABLE_UNMERGED":3,"PARTIAL_only":6,"no_progress_qualifier":23,"alias_rows":138,"backend_suite_revision":"a8187a7","frontend_suite_revision":"6539902","scientific_gate_revision":"cdea3bc"} -->

    ## 1. Result

> [table: 5 rows moved to the register: rows without an id]
| Primary state | Count | Meaning |

The mutually exclusive progress buckets are **51 `FIX_AVAILABLE_UNMERGED`
only**, **9 `PARTIAL` rows**, and **23 without a progress qualifier**.
Three partial rows (`030`, `042`, `049`) also carry
`FIX_AVAILABLE_UNMERGED`, giving **54 total occurrences** of that qualifier,
not 54 additional rows. The nine partial IDs are `005`, `030`, `035`, `041`,
`042`, `043`, `047`, `048`, and `049`.

Primary-state counts describe the pinned main baseline. Construction-branch
fixes, scoped passes, and pending repairs do not change those counts or certify
the current branch. Evidence linked from canonical rows is dated and scoped;
overlapping suites must not be added together. Dormant, optional, offline, and
workspace-scoped findings remain counted with their scope stated explicitly.

The supplied [October 10 scan](#appendix-a--october-10-scan-historical)
is internally consistent for its exact historical snapshots: it contains one
entry for every `SCN-001` through `SCN-064`, and its 55-open/9-VERIFY union
arithmetic is correct. It is not a current branch-status report. Subsequent
merges changed multiple dispositions, and its phrase “three newest local
branch tips” cannot be independently reconstructed from the retained evidence;
those were three user-selected, exact-commit tips.

    ## 2. Deduplication and status rules

1. **Root cause wins.** Multiple reports of the same mechanism become aliases
   of one canonical `SCN` row. Similar symptoms at different layers remain
   separate; for example, `SCN-013` shader precision and `SCN-014` file-format
   quantization both involve float32 but have different producers and closure
   gates.
2. **Compound findings split.** A source row spanning independent mechanisms
   maps to every owning canonical row with relation `SPLIT`. This preserves the
   distinctions among cargo (`019`), risk (`020`), protected reserve (`052`),
   and v-infinity/burn semantics (`078`), and among Earth/Mars lifecycle,
   scale, picking, and coordinates (`058`–`061`).
3. **Plans are not fixes.** Accessibility implementation is active under the
   remediation effort; its October 11 plan alone is not closure evidence.
   The formerly loose SCN-052/053/056/064 tests now belong to committed fixes,
   with actual landing status recorded per canonical row.
4. **Branch-only is not shipped.** Fixes integrated into
   `remediation/canonical-register-20261014` remain
   `FIX_AVAILABLE_UNMERGED`, never resolved on `origin/main` without landing
   evidence. Section 5 records the older candidates already merged at the
   pinned main baseline.
5. **Scoped closure stays scoped.** A resolved original defect does not certify
   its whole subsystem. `SCN-022` closes the JavaScript Kepler solver; a GLSL
   twin remains a verification child. `SCN-062` closes default-scale event
   lifetime, not every flare-coordinate or capacity question.
6. **No stale measurement laundering.** Historical numerical values are
   retained only as historical evidence unless rerun or supported by unchanged
   current code. `EXTRA-1` therefore remains under `SCN-043 VERIFY`, while the
   freshly checked retrograde-node mechanism is promoted to `SCN-081`.

Primary `State` values are `OPEN`, `RESOLVED_SCOPED`, `VERIFY`, and
`DECISION_REQUIRED`. `Progress` contains only `PARTIAL` and/or
`FIX_AVAILABLE_UNMERGED`, or a dash; chronology belongs in dated evidence.
Evidence is `OBS` (executed observation), `CODE` (source establishes the
mechanism at its stated snapshot), or `MIXED`. Undated pass wording in retained
rows is scoped to its cited fixing evidence, not a fresh suite result. Approved
corrections remain pending until their exact source and passing evidence are
recorded; approval itself does not close a gate.

    ## 3. Source inventory and precedence

> [table: 11 rows moved to the register: rows without an id]
| Date | Source | Provenance | Master use |

The September 24 audit and September 25–26 plans are outside the strict
document-date window. Their IDs remain reachable through the October 7
crosswalk, but they are ancestor sources rather than additive issue sets.
Filesystem mtimes caused by checkout or evidence restoration were ignored.

    ## 4. Canonical register

> [table: 83 rows moved to the register: SCN-001 … SCN-083]
| ID | Pri | State | Progress | Evidence | Canonical finding, scope, and closure |

    ## 5. Dated candidate-fix reconciliation (2026-10-14)

> [table: 6 rows moved to the register: rows without an id]
| Canonical IDs | Fixing branch/head | Current landing status |

The earlier four expected-red files are now committed regression tests with
production fixes. Old hashes in the source inventory are historical provenance;
this table supersedes their former branch-only status.

    ## 6. Complete alias ledger

Each source alias occurs once below. `MERGE` means the source symptom belongs
to one canonical root; `SPLIT` preserves multiple independent roots;
`SUPERSEDED` is a historical symptom whose owning root is scoped-resolved;
`VERIFY_CHILD` retains a lead without inflating the confirmed-open count.
The Treatment column preserves source-date wording, including old
"planned, not fixed" descriptions. It is lineage, not current status; Section 4
and the closure plan control the construction-branch disposition.

> [table: 138 rows moved to the register: F-SOL-01 … EXTRA-2]
| Alias | Source | Relation | Canonical target | Treatment |

    ## 7. Named verification children not promoted to new OPEN IDs

These source findings retain their original identities and evidence contracts.
They were not promoted at the original reconciliation because evidence was
conditional or they described acceptance/debt rather than one atomic defect.
This table is not a claim that each child is still unimplemented. Current
implemented portions and remaining proof are separated in Section 4 and the
closure plan; no umbrella row closes without dispositions for its children.

> [table: 12 rows moved to the register: rows without an id]
| Source finding | Canonical queue | Required evidence |

    ## 8. Historical disposition changes at the pinned main baseline

This table records the main baseline named above, not newer construction-branch
progress or a fresh remote check.

> [table: 13 rows moved to the register: SCN-005 … SCN-062]
| Canonical ID | Fixing evidence | Result at pinned main baseline |

    ## 9. Root-cause boundaries that must survive future merges

- `SCN-070/071` are backend recovery/lifecycle defects; their repair credit is
  independent of the optional client's UI reachability. `SCN-049` separates
  backend, client-library, and active-browser children under the
  [approved scope decision](#simulationclient-scope-decision--2026-10-17).

- `SCN-004` concerns solar acquisition deadline ownership; `SCN-063` is
  Horizons transport ownership and permit recovery. Permanent capacity loss
  has not been approved as an owner policy. Neither is the old API-wide
  trajectory-starvation report.
- `SCN-008` is `/solar/physics` admission; `SCN-053` is playback stepping;
  `SCN-072` is planning-route epoch/error handling.
- `SCN-012` measures benchmark truth. `SCN-045` defines solver capability,
  and `SCN-064` is a concrete near-antiparallel wrong-state failure.
- `SCN-019`, `020`, `052`, and `078` share mission data flow but have four
  independent roots and replacement gates.
- `SCN-022` resolves the CPU Kepler solver only. Do not use it to close an
  untested GLSL implementation.
- `SCN-034` owns safe generator execution; `SCN-046` owns reproducible
  byte-identical artifacts.
- `SCN-050` requires backend and active frontend fallback to share the same
  analytic normalization. The construction-branch fix and its scoped evidence
  are recorded in Section 4; this requirement does not imply it is unimplemented.
- `SCN-054` contains separation-floor, mass-offset, persistence, and
  serialization subclaims; a one-line fix cannot close the group silently.
- `SCN-055` energy origins, `SCN-057` callback ABI, `SCN-076` force formula,
  and `SCN-077` Tudat chunk/time semantics are distinct.
- `SCN-058` lifecycle, `059` scale, `060` picking, and `061` shader coordinates
  are independent Earth/Mars failures and should be verified together without
  merging their identities.
- `SCN-062` event lifetime, `SCN-065` stochastic scheduling, and `SCN-067`
  grid lifecycle are separate event-system roots.

    ## 10. Remaining closure work

1. Retain the implemented October 17 shader/sampling and startup repairs with their failed baselines and acceptance limits. Complete the separately recorded moon-loader corrections and independent review before promotion.
2. Complete usable-scene and final-source delivery acceptance under full-catalog startup. Resolve precise-time handling, source-storage and licensing decisions; manual device and actual deployment acceptance require real evidence.
3. Complete observed-input/frame/calibration work without enabling unvalidated observational data.
4. Promote the prepared moon records only after independent accuracy/provenance/resource checks and approved storage; all 424 identities remain in the denominator.
5. Run affected final rendering, browser, startup/delivery and combined acceptance gates; retain exact revisions, every skip and every remaining failure.
6. Retain construction-branch qualifiers until a separately authorized and evidenced landing on main.

    ## 11. Review corrections and evidence limitations

- The October 10 headline counts and `SCN-001`–`064` coverage were verified,
  as were all 102 files in its retained evidence manifest. Its status labels
  were not normalized: cells such as `Same`, `Same workspace condition`, and
  implicit queue status have been replaced here by explicit state/progress/
  evidence fields.
- The original `SCN-057` source reference begins at
  `backend/sim/radiation_pressure.py:189–192`, not line 190. The galactic-tide
  reference at line 124 is correct.
- `CODEBASE_SCAN_2026-10-10_EVIDENCE/verify_artifacts.py` is not safe as a
  read-only current-check command: it hard-codes historical counts and rewrites
  `inventory.json` before rejecting a nonhistorical HEAD. Future work should
  add a default read-only `--check`, assert before writing, derive counts from
  explicit states, and place this tracker plus the evidence under an outer
  manifest.
- The original October 11 independent reruns reproduced `SCN-052`, `063`,
  and `064`, including the 179.999999° Lambert velocity error of 5,101.243 m/s
  and propagated miss of 209,061,472 km. Those are historical failing
  observations, not new failures of their later fixes. Original dispositions
  also used structured `68c3f85` evidence, fixing commits, and source checks;
  none was blanket subsystem certification.
- Original `SCN-051` evidence was a synthetic parser-to-solver contract;
  `055/077` initially used injected states but now also have real native Tudat
  evidence in the linked report. `057` remains dormant in production. `063`
  requires resource-ownership evidence, not an assumed acceptance of lost capacity.
- The original October 11 reconciliation added no live-provider, hardware or
  native-runtime evidence. Later dated reports add real-provider captures,
  RTX 5090 gates, a local multi-worker proxy gate, and native Tudat execution.
  All 424 moon candidates have passing candidate evidence; only 13 records
  are shipped. A successful full-424 production lazy-loading gate, actual
  remote deployment, and a complete manual screen-reader matrix remain unclaimed.
- Remote network freshness was not reasserted. This report is pinned to the
  local `origin/main` ref named at the top, not an inaccessible newer server
  state.

    ## 12. Maintenance contract

Maintain current status in this October 10 consolidated file. The separate
October 7 and October 11 trackers are retained historical records. Preserve the
[explicit decision requirement](#explicit-decision-required-before-changing-scope)
before client retirement or opt-in N-body UI integration.

For any state change, retain the canonical ID and record: exact fixing commit
or PR, original failing reproduction, passing replacement gate, affected
snapshot, and remaining scope. When a compound row is split, add new IDs and
alias mappings rather than deleting history. A generic green suite, a merged
plan, a disabled feature, or absence from the default UI is never sufficient
for `RESOLVED_SCOPED` by itself.

The 2026-10-15 construction effort integrates tested PFSS, scientific-gate,
Kuiper and catalog-loading changes. The current checkpoint distinguishes fresh
results from earlier evidence and unintegrated proposals. Related notes are
mirrored to the primary repository without merging product changes into main.
No state is promoted solely on approval, implementation, or a generic green
suite; release, external and manual acceptance remain explicit.

    ## Appendix A — October 10 scan (historical)

The following is the original dated scan, with headings nested for this file.
Its status and test claims refer only to the snapshots it names.

> Current status (2026-10-14): see [the master tracker](MASTER_ISSUE_TRACKER_2026-10-11.md) and [active remediation effort](REMEDIATION_EFFORT_2026-10-14.md). The dated findings below preserve their original snapshot; they are not current merge status.


Fresh repository sweep across the **three newest local branch tips**, as confirmed by the user. This replaces the October 7 tracker as the current assessment while preserving that historical record and its stable IDs. The newer main/CI implementation repairs substantial solar mathematics, ingestion, process isolation and security work. It still has reproducible numerical, rendering, mission-model, recovery, tooling and documentation defects.

**Result: 15 newly registered findings, SCN-050–064, plus a branch-specific reconciliation of all 49 previous entries.** Across the selected tips, 55 IDs have an open finding on at least one branch and nine remain verification/capability queues. Main/CI have 45 open entries and ten scoped closures; trajectory has 54 open entries and one new-main-only entry that does not apply. These counts include model limitations, dormant activation hazards, a documented transport tradeoff, and documentation/tooling problems; they are not counts of independently exploitable production bugs. “New” means new to this register, not introduced by the latest commits.

This is a broad source sweep with fresh tests, independent numerical probes, controlled transport cases and browser interaction evidence. It cannot prove that every defect has been found. No application code, dataset, dependency declaration or branch was changed; no fixes, merge, staging or commit were performed.

    ### October 10 — 1. Audited snapshots and branch differences

> [table: 3 rows moved to the register: rows without an id]
| Label | Branch / exact commit | Commit time | Git tree |

Selection uses local tip committer dates with remote aliases deduplicated. **Remote freshness is unverified:** `git fetch --all` failed because GitHub SSH public-key authentication was unavailable. These are the selected local tips, not an assertion about inaccessible newer remote commits.

M and C are byte-identical complete trees; main is the merge of the CI fix. Tests executed on M apply to C by source identity; there was no redundant third full-suite run. T differs from M in 104 tracked paths, with approximately 32,030 inserted and 3,739 removed text lines. Its solar/security/CI implementation is older. Its physics/mission/renderer defects must not be assumed fixed by work on other, unselected branches such as `fix/physics-math-findings` or `fix/solar-display-truth`.

The user's working checkout remains **`fix/solar-status-chip-on-main` at `b29132842e60e2d404a8d864757bf98696a60120`**. It is not one of the selected tips. Product tests used `git archive` extractions under `/tmp/solar-sweep-2026-10-10-j1gnowo_/{main,ci,trajectory}`. The science mutation verifier used a separate local clone at the exact main commit. Source locations below refer to those named commits, **not necessarily the current checkout**; recover them with `git show <commit>:<path>`.

Durable evidence: [directory guide](CODEBASE_SCAN_2026-10-10_EVIDENCE/README.md), [branch record](CODEBASE_SCAN_2026-10-10_EVIDENCE/branches.json), [inventory and source integrity](CODEBASE_SCAN_2026-10-10_EVIDENCE/inventory.json), [evidence hashes](CODEBASE_SCAN_2026-10-10_EVIDENCE/MANIFEST.sha256). Existing untracked audits and evidence were preserved. This tracker and its evidence remain uncommitted.

    #### October 10 — Reading the register

- **OPEN / OBS:** reproduced in this scan; the row states whether this is a browser, numerical, API, controlled-input or dormant-module observation.
- **OPEN / CODE:** current source establishes the mechanism; a complete runtime consequence was not measured.
- **RESOLVED (scope):** fresh reproduction or specific passing regression coverage supports the named correction. It does not certify the surrounding subsystem.
- **VERIFY:** capability, historical hypothesis or broader acceptance gate requiring more evidence. Excluded from open counts.
- **P0:** correct before relying on the affected scientific claim; **P1:** next release/reliability work; **P2:** follow-up correctness, model, capability or tooling work. These are sequencing priorities, not CVSS ratings.

All entries were reviewed on October 10, 2026, America/New_York. Owners are **unassigned**. Preserve IDs when fixing, splitting or superseding entries.

    ### October 10 — 2. Highest-impact triggers and latent hazards

> [table: 10 rows moved to the register: rows without an id]
| Trigger | Observed failure / scope | IDs |

The older T branch additionally retains the wrong PFSS basis, valid-FITS crash, lost grid semantics, caller-controlled solar rate identities, rejected preview origins and stale observation assimilation. None should be reintroduced over the main fixes.

    ### October 10 — 3. Fresh validation matrix

Frontend validation uses Node **22.23.2**, npm **10.9.8**. Python is **3.12.13**. The initial npm dependency installation used the host Node 24/npm 11, then the checks used the pinned binaries. Browser evidence uses Chromium software WebGL and host Node 24 as documented in its report. No hardware GPU benchmark is claimed.

> [table: 14 rows moved to the register: rows without an id]
| Check | Main / identical CI tree | Trajectory | Evidence under `CODEBASE_SCAN_2026-10-10_EVIDENCE/` |

Registry audit entries are not unique vulnerabilities or proof that the production Three.js bundle is exploitable. Exact advisory payloads are retained. The ratchet prevents growth; it does not make strict TypeScript pass. Runtime requirements and the pinned CI test environment are distinct: main's reproducible test lane is real progress, while the README/runtime-only developer path still fails collection.

**Production solar latency is not established by the 2,142-test pass.** `backend/tests/conftest.py:68–89` raises selected content tests from the production 18-second budget to 60 seconds because slow CI hosts exceed 18 seconds. The browser now allows 20 seconds and the server caps configuration at 19 seconds; this fixes the old timeout-contract mismatch, but a fresh production-budget, five-minute browser delivery gate remains outstanding. Process kill/reap, saturation, crash, cancellation and capacity-recovery tests are covered separately.

The science mutation gate detects the old recurrence, wrong equal-area weighting, duplicate m-normalization, corrupt source-surface factors, omitted shell crossings and vector-magnitude WSA expansion. It does not certify real GONG pixels, calibrated WSA speeds, deployment settings, all frontend types or multi-worker release architecture. Main deliberately disables observed GONG runtime acquisition and unvalidated assimilation/spatial AIA use; hybrid returns synthetic provenance, and data-driven physics reports unavailable.

    ### October 10 — 4. Existing IDs: current branch-specific register

The linked domain reports carry precise snapshot line references and full reproduction details: [solar](CODEBASE_SCAN_2026-10-10_EVIDENCE/solar/report.md), [backend integration](CODEBASE_SCAN_2026-10-10_EVIDENCE/backend/integration-review.md), [physics/data/mission](CODEBASE_SCAN_2026-10-10_EVIDENCE/physics/REPORT.md), [frontend](CODEBASE_SCAN_2026-10-10_EVIDENCE/frontend/REPORT.md). Historical acceptance criteria remain available in the [October 7 tracker](CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-07.md); where changed, the criteria below supersede them.

> [table: 40 rows moved to the register: rows without an id]
| ID / priority | Main / CI | Trajectory | Current evidence and closure criterion |

    ### October 10 — 5. New findings and actionable closure gates

    #### October 10 — SCN-050 · P2 · OPEN / OBS · All tips — Hathaway normalization clips an artificial plateau

`backend/sim/solar_physics.py:125–143` on M uses `b*sqrt(3/2)` as the peak for `x³/(exp(x²)-c)`, although that peak assumes c=0 and the configured c=.71. Independent differentiation/bisection gives **58.3898 months**, while normalization uses **66.1362**. The true peak is1.03433 times that denominator; clamping produces a flat top from approximately51.03–66.13 months. This promotes the demonstrated normalization portion of SCN-042; broader frame/solar semantics remain separate. The frontend fallback uses the same historical normalization and also needs review when repairing it.

**Closure:** normalize against the actual parameterized maximum, or explicitly document an intentional clipped visualization policy. Gate derivative zero, peak value and shape independently. [Solar SOL-03 and both JSON probes](CODEBASE_SCAN_2026-10-10_EVIDENCE/solar/report.md).

    #### October 10 — SCN-051 · P2 · OPEN / OBS, latent/offline · Main/CI only — Parser-accepted FITS fails PFSS admission

`gong_magnetogram.py:688–711` subtracts an allowed floating-point monopole; `pfss_magnetogram.py:1805–1822,1644–1647` then reconstructs original bytes and demands their original SHA. That arithmetic is not lossless. A checksummed180×360 float64 fixture with an admissible ~1e-13 G mean and tiny1e-30 pixel parses successfully but its immutable snapshot raises **“snapshot native header fields are inconsistent”** at PFSS admission.

This is not the old dtype crash, and no live GONG artifact with these pixels was observed. Observed runtime is disabled on M. **Closure:** preserve admitted original artifact information or a well-defined canonical representation; parser→solver round trips must work for every supported BITPIX/scaling/unit combination while tampered artifacts remain rejected. [Solar SOL-04](CODEBASE_SCAN_2026-10-10_EVIDENCE/solar/report.md).

    #### October 10 — SCN-052 · P1 · OPEN / OBS · All tips — Burn partitioning spends protected reserve

`backend/mission/vehicle_service.py:79–80` reapplies reserve fraction to remaining fuel on every burn. For100kg dry+1,000kg propellant+100kg payload, Isp300s and5% reserve, `[4.8]`km/s is infeasible while `[2.4,2.4]` is feasible and leaves only**34.7523kg**, below the original50kg reserve. Fuel does carry across burns; the reserve floor erodes. Mission agents call this service for outbound/return burns.

**Closure:** define reserve against the intended stage baseline, maintain a chronological ledger, and gate burn-partition invariance without intervening mass/staging changes. Exclude discarded fuel from onboard margin. Keep acquired-cargo SCN-019 and risk SCN-020 separate. [Physics PHYS-N01](CODEBASE_SCAN_2026-10-10_EVIDENCE/physics/REPORT.md).

    #### October 10 — SCN-053 · P1 · OPEN / OBS · All tips — REBOUND playback escapes validated epoch coverage

`backend/sim/rebound_nbody.py:404–408` computes an integration target without the supported-JD validator used by seeking. At upper bound**2469807.5**, `step(1)` returns2469808.5 with **high fidelity**; directly setting that epoch raises. `backend/server.py:4353–4354` on M reaches stepping during playback.

**Closure:** enforce the same finite/epoch contract for initialization, seek and positive/negative advancement, and stop or explicitly downgrade out-of-coverage states. Gate both endpoints through engine and playback contracts. Preserve correct IAS15 seeding and frame/time units. [Physics PHYS-N02](CODEBASE_SCAN_2026-10-10_EVIDENCE/physics/REPORT.md).

    #### October 10 — SCN-054 · P2 · OPEN / OBS · All tips — Backend Kuiper binary initialization violates its own orbit invariants

`backend/sim/kuiper.py:156–157` floors separation³ at1e-12, altering supported separations below~14,960km. At1,000km with its own nominal mass, relative circular speed is**2.9699e-5AU/year** instead of**.0017184AU/year** (~57.9× too slow). Offsets at`:173–193` also reverse conventional companion/primary mass weighting; q=.35 displaces the weighted centre by~481km. Speed failure is independent of ratio naming.

Backend particles are subsequently massless test particles: initializer repair alone does not create persistent gravitational binaries. **Closure:** remove unit-inappropriate floors, define q, gate speed and weighted position/velocity, and honestly label/integrate mutual motion. Assess five-decimal position serialization before claiming1,000km pair resolution. [Physics PHYS-N03](CODEBASE_SCAN_2026-10-10_EVIDENCE/physics/REPORT.md).

    #### October 10 — SCN-055 · P2 · OPEN / OBS, optional runtime · All tips — Tudat energy mixes coordinate origins

`backend/sim/tudatpy_hooks.py:243–245` stores Sun relative to SSB and planets relative to Sun. `get_energy():425–434` subtracts those mixed states directly. Injecting the documented Sun/Earth representation and translating only the Sun's SSB position by.01AU changes energy by**2.019%** while the physical relative orbit is unchanged. This exercised the real diagnostic on injected states; Tudat itself was not installed/run.

**Closure:** reconstruct one declared inertial frame/origin before potential and kinetic energy, gate translation invariance, and repeat with actual Tudat. Do not reopen its separately corrected output-state conversion. [Physics PHYS-N04](CODEBASE_SCAN_2026-10-10_EVIDENCE/physics/REPORT.md).

    #### October 10 — SCN-056 · P2 · OPEN / OBS · All tips — Single-family EPO execution omits its policy

`backend/mission/epo/runners.py:64–74` registers a family's policy only in `run_families`, not `run_family`. With a family requiring score≥100, failure≤.01 and valid embedded verification, a stub planner result score−100/risk.9/invalid returns**one pass** directly; the aggregate entry rejects all three violations. The actual verifier runs; only planner output is controlled.

The current smoke workflow uses the aggregate method, so its policy is not shown bypassed. **Closure:** enforce policy identically through both public entry points, independent of previously registered verifier state. [Physics PHYS-N05](CODEBASE_SCAN_2026-10-10_EVIDENCE/physics/REPORT.md).

    #### October 10 — SCN-057 · P2 · OPEN / OBS, dormant · All tips — Force callbacks fail with REBOUND's actual argument

`radiation_pressure.py:190` and `galactic_tide.py:124` access `reb_sim.particles`, but real REBOUND invokes callbacks with an `LP_Simulation` pointer. Registered observer wrappers forwarding the actual argument raise **AttributeError** in both helpers. Shipped REBOUND/Kuiper engines do not currently register these helpers; this is an activation hazard.

**Closure:** use the supported callback interface, validate per-particle force coefficients and unit/frame conventions, and test an actual acceleration delta with the forces enabled. SRP coefficient plumbing and full scientific force formulas still require verification. [Physics PHYS-N06](CODEBASE_SCAN_2026-10-10_EVIDENCE/physics/REPORT.md).

    #### October 10 — SCN-058 · P1 · OPEN / browser OBS · All tips — LOD merge removes Earth/Mars surfaces

`src/frontend/features/planetary/quadtreeLOD.ts:53–59` detaches a mesh without clearing its pointer. Merge destroys children at`:86–91`, then `createMesh():94–95` returns early because the detached mesh still exists. Browser execution yields **6 far meshes →36 near meshes →0 far meshes**, with six non-null mesh pointers whose parents are null. Earth/Mars instantiate and update these trees in shipped main.

**Closure:** repeated near/far cycles preserve complete surface coverage, parent ownership and bounded resource counts at all LOD boundaries. This does not fix the independent vertex-coordinate error SCN-061. [Frontend F-NEW-2](CODEBASE_SCAN_2026-10-10_EVIDENCE/frontend/REPORT.md).

    #### October 10 — SCN-059 · P1 · OPEN / browser scene OBS · All tips — Physical scale skips Earth/Mars quadtrees

`src/main.ts:699–712` has an empty scale-update branch for quadtrees. Actual checkbox handler leaves Earth radius**.00167021AU** instead of**.0000425875AU** (39.22×); Mars is1.798× physical. Jupiter and Sun change correctly in the same probe. This measured uniforms/scene transforms, not screenshots, and remains a separate defect after fixing sphere projection.

**Closure:** toggle both ways and gate effective radius, displacement, LOD thresholds and camera framing for every body representation. [Frontend F-NEW-3 and scene results](CODEBASE_SCAN_2026-10-10_EVIDENCE/frontend/REPORT.md).

    #### October 10 — SCN-060 · P2 · OPEN / browser scene OBS · All tips — Earth/Mars cannot be double-click picked

`src/main.ts:1296–1307` raycasts body entries with recursion disabled. Earth/Mars entries are groups, and their patch children have no body ID. Actual scene/raycaster gives**zero Earth/Mars hits versus one Jupiter hit**. Explorer selection remains available; adding recursion alone leaves identity resolution unfinished.

**Closure:** double-click-follow works for each planet across LOD/scale modes; resolve ancestor identity or use deliberate pick proxies while accounting for shader displacement. [Frontend F-NEW-4](CODEBASE_SCAN_2026-10-10_EVIDENCE/frontend/REPORT.md).

    #### October 10 — SCN-061 · P1 · OPEN / CODE + CPU transform OBS · All tips — Planet shader projects before applying face coordinates

`planetShaders.ts:166–201` normalizes raw z=0 plane positions, scales to `uRadius`, then applies the full model-view matrix. `quadtreeLOD.ts:94–109,151–163` places faces with translations±.5, so those offsets are added in world AU **after** sphere projection. With Earth radius.00167021AU, reference vertex(.5,0,0), zero terrain and identity body transform, exact matrix evaluation produces(.00167021,0,.5), radius**.50000279AU**,299.37× intended.

The source path is active for Earth/Mars. This is a CPU evaluation of shipped transform order, not GPU readback or a screenshot claim. **Closure:** apply face/chunk coordinates before spherical projection, then physical radius/body transform; independently gate centres/corners/seams, all subdivision levels, finite normals and actual rendered radius bounds. [Frontend F-NEW-1](CODEBASE_SCAN_2026-10-10_EVIDENCE/frontend/REPORT.md).

    #### October 10 — SCN-062 · P2 · OPEN / lifecycle OBS · All tips — Default-scale flare/CME expires immediately

`solarFlares.ts:225–228` computes lifetime from `(.3 - sunRadiusAu)/speed`. Display Sun radius is**.375511AU**, giving a negative lifetime. The actual event expires on its first1/60s update, while an otherwise identical physical-radius event survives. The active manager removes expired events; current display radius is passed by the solar controller.

**Closure:** positive lifetime/bounded expansion across every presentation scale, with actual random/physics/AGN spawning; separate physical speed/time policy from display radius. [Frontend F-NEW-5](CODEBASE_SCAN_2026-10-10_EVIDENCE/frontend/REPORT.md).

    #### October 10 — SCN-063 · P2 · OPEN / controlled OBS, documented tradeoff · All tips — A stalled Horizons transport retains sole remote capacity

`backend/mission/ephemeris_service.py:1174–1292` deliberately retains its single global transport permit until the I/O thread exits. A local Event-backed response read makes caller1 time out at~50ms; caller2 also times out waiting for capacity without a second outbound call. Releasing the read restores caller3 immediately. The probe releases all threads and contacts no upstream.

This bounds abandoned work correctly but leaves uncached Horizons work unavailable while a transport remains blocked. It **does not** reproduce old API-wide starvation, invalidate Kepler fallback policy, or show unrelated endpoints blocked. **Closure/decision:** explicitly accept the bounded availability tradeoff, or provide terminable transport ownership and prove prompt recovery plus bounded abandoned work. Never “fix” it by freeing permits while old work remains unbounded. [Transport supplement](CODEBASE_SCAN_2026-10-10_EVIDENCE/backend/TRANSPORT_LAMBERT_NOTES.md).

    #### October 10 — SCN-064 · P1 · OPEN / independent numerical OBS · All tips — Near-antiparallel Lambert velocities miss their target

`backend/trajectory/lambert.py:499–500` reconstructs angle via `acos(dot)`, losing relative precision nearπ. The recovered angle feeds sine/A at`:651–655`; velocities divide by small g at`:723–731`. Scalar TOF convergence does not certify those recovered velocities.

Independent case:1AU circular orbit, r₁=[1,0,0], r₂=[cosθ,sinθ,0], TOF=θ/√μ, analytic v₁=[0,√μ,0]. A separate real REBOUND IAS15 Sun/massless-particle integration uses the returned v₁ and requested TOF:

> [table: 4 rows moved to the register: rows without an id]
| θ | Velocity error | Actual propagated endpoint miss | Reported TOF root residual |

Both sides ofπ fail symmetrically; ordinary-angle controls and both branch runs are retained. Exactly180° returns `None` and is recorded under capability SCN-045 because the collinear inputs do not determine a unique plane. It is not the defect asserted here.

**Closure:** stable angle/velocity recovery or explicit ill-conditioned rejection, independent endpoint and velocity gates on both sides ofπ over multiple radii/tolerances, while retaining bounded work and TOF residual checks. [Full reproduction and JSON](CODEBASE_SCAN_2026-10-10_EVIDENCE/backend/TRANSPORT_LAMBERT_NOTES.md).

    ### October 10 — 6. Verification and capability queues — excluded from open counts

> [table: 9 rows moved to the register: rows without an id]
| ID | Current queue and evidence needed |

    ### October 10 — 7. Coverage and preserved fixes

> [table: 6 rows moved to the register: rows without an id]
| Domain | Sweep performed | Explicit limits |

Preserve the following demonstrated improvements when fixing remaining issues:

- Main's harmonic/grid/source-surface/tracing/WSA formula corrections and six mutation checks; do not equate disabled observed runtime with a delivered observed-data product.
- Main's explicit local/network security profiles, authenticated network access, trusted-proxy interpretation, bounded ingress/identity storage and per-subject WebSocket admission. Supported local launchers bind loopback; unsafe deployed overrides were not assumed.
- Main's killable solar physics workers, owned permits, cancellation/reap, typed failures, independent client polling, last-good state and source/epoch/schema guards. Realtime thread transport remains a separate problem.
- Trajectory budget/cancellation/deadline containment, shared ephemeris validation/cache ownership, report path containment and exclusive-write checks. Horizons single-slot availability residual063 is narrower than the old global-starvation report.
- UTC↔TDB correction, Float64 worker transport, native-frame/fitted moon paths, corrected REBOUND initial states/IAS15 compatibility and Kuiper input velocity units. New derivative/range/binary findings do not undo those repairs.
- Existing unpowered flyby continuity and Lambert scalar root certification. New064 demonstrates why endpoint certification must also be checked.

    #### October 10 — Historical reconciliation

Every SCN-001–049 is explicitly retained above. The October7 report's [September24 crosswalk](#october-7--september-24-id-crosswalk) maps all47 earlier IDs into those entries/preserved fixes, and remains the historical mapping. No older count, readiness score, FPS value, backend latency or orbital error was copied as a fresh measurement.

The supplied [audit index](AUDIT_AND_ISSUE_INDEX_2026-10-07.md) names fixes on unselected branches. Those are useful leads, not main status. In particular, its179.999° Lambert comparison is compatible with the small error reproduced at that angle and does not rule out the much closer-toπ failure discovered here. “Exactly180° unsupported” remains distinct from returning a wrong state for non-collinear inputs.

Domain-local labels map as follows: SOL-01→010, SOL-02→004, SOL-03→050, SOL-04→051; PHYS-N01–06→052–057; frontend F-NEW-1→061, F-NEW-2→058, F-NEW-3→059, F-NEW-4→060, F-NEW-5→062; transport supplement→063/064. This prevents counting the same reproduction twice.

    ### October 10 — 8. Recommended repair order and tracker maintenance

1. **Protect scientific outputs:**012 benchmark validity,064 Lambert state recovery,052/019/020 mission mass/reserve/risk,053 epoch contract; preserve current budgets/containment.
2. **Repair active Earth/Mars presentation:**061 transform order,058 lifecycle,059 scale,060 picking; verify them together without merging the independent root causes. Then062 flare lifecycle and013 shader time precision.
3. **Finish solar reliability and truthfulness:**004 total transport deadlines,010 outage recovery,005 visible status and production-budget delivery. Keep observed acquisition disabled until its independent gates, including051, pass. Correct050 normalization.
4. **Make developer gates dependable:**026 archival discovery,027 documented pinned test setup,025 type backlog,028 advisory remediation. Retain operational main CI029 and its mutation checks.
5. **Complete catalog/model/UI/provenance work:**016/017/021 and remaining physics entries,030/031 accessibility/startup,032–035 tooling/docs/provenance, then optional/dormant and wider verification queues. Treat old T-only solar/security failures as branch reconciliation work, not regressions present on main.

For each change, record owner, exact fixing commit/PR, original failing reproduction, passing replacement gate and remaining scope. A green generic suite, missing UI exposure, a merged design document or disabled capability is not a blanket subsystem closure. Accepting a model limitation/tradeoff requires an explicit contract and truthful presentation; do not silently delete its ID.

    ### October 10 — 9. Reproduction and evidence handling

See [evidence README](CODEBASE_SCAN_2026-10-10_EVIDENCE/README.md) and the individual domain reports for commands. The frontend runner accepts a prepared snapshot path, label and pinned tool binary directory. Backend standard suites use their separately recorded environments; the main science gate requires Git history and clean exact-commit inputs, which is why it ran in a separate local clone.

```bash
    # From a clean checkout of the specified main commit, with declared runtimes:
npm ci --ignore-scripts
npm test
npm run typecheck
npm run typecheck:ratchet
npm run build
npm run verify:planet-positions
npm run verify:moon-frames
npm audit --json

    # In a fresh Python 3.12.13 test environment:
python -m pip install -r ci/backend-test-requirements.txt
python -m pytest -q backend/tests
python -m pytest --noconftest -q scripts/ci/tests/test_verify_r3_r4_runner.py scripts/ci/tests/test_r3_r4_workflow.py
    # Set the deterministic environment shown in the committed workflow first.
python scripts/ci/verify_r3_r4.py --repo . --manifest ci/r3-r4-science-verification.json all
```

Do not substitute the above pinned test install when reproducing027: that reproduction intentionally installs only `backend/requirements.txt` into a different fresh environment. Likewise, clean-tree `npm test` and an archive-present workspace answer different questions for026. The retained invalid `node --test` invocation of Vitest files is an audit harness mistake, excluded from product findings; supported Vitest execution passes those files.

Probe exit0 means observations were captured, not that invariants passed. All fixtures, scripts, results, logs and per-file evidence hashes are retained beneath the new evidence directory; temporary environments are disposable. The evidence-local `.gitignore` preserves intentional logs otherwise hidden by the repository-wide pattern. Archive this report and evidence together deliberately; all remain uncommitted.

    ## Appendix B — October 7 scan (historical)

The following is the original dated scan, with headings nested for this file.
Its status and test claims refer only to the snapshot it names.

> Current status (2026-10-14): see [the master tracker](MASTER_ISSUE_TRACKER_2026-10-11.md) and [active remediation effort](REMEDIATION_EFFORT_2026-10-14.md). The dated findings below preserve their original snapshot; they are not current merge status.


> **Successor:** [October 10, 2026 three-branch scan and tracker](CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-10.md). This October 7 record is retained as historical evidence; use the successor for current branch-specific status.

This is a fresh scan of the current checkout, with an actionable register and a reconciliation of the older audits. The application builds, and the scoped frontend and backend suites pass under the conditions below. Significant scientific, solar-delivery, tooling, and documentation defects remain. Passing those suites does not establish scientific validity: independent probes still fail the PFSS basis and expose a benchmark with no comparable scenarios.

    ### October 7 — 1. Snapshot and scope

> [table: 9 rows moved to the register: rows without an id]
| Field | Value |

The supplied context named `d175e4b`. HEAD is one documentation commit newer. The accessibility design is approved **for implementation planning**, not implemented. The trajectory work in `931faae`, `406b2c3`, and `d175e4b`, and the moon/time work in `bd48a7d`, must be accounted for before reusing September findings.

Existing untracked material was preserved:

- `CODEBASE_AUDIT_2026-09-24.md` and `CODEBASE_AUDIT_2026-09-24_EVIDENCE/`.
- `H1_SOLAR_DELIVERY_PLAN_2026-09-25.md` and `H1_SOLAR_DELIVERY_PLAN_2026-09-25_EVIDENCE/`.

This is a broad source scan with targeted reproductions, not a new exhaustive browser, live-Horizons, GPU, coverage, or load audit. Old measurements are not presented as current measurements. There is deliberately no new readiness score or sum of historical issue counts.

    #### October 7 — Reading the tracker

- **OPEN / OBS**: reproduced by a command or probe in this scan.
- **OPEN / CODE**: the mechanism is present in current source; the full user-visible outcome was not exercised here.
- **VERIFY**: historical claim, capability question, or broader acceptance gate that needs fresh evidence. Excluded from confirmed-open counts.
- **Preserved fix**: current implementation and relevant passing regression coverage support closure in the stated scope. It does not close the whole subsystem.
- **P0**: first corrective work before relying on the affected scientific output. **P1**: next release/reliability work. **P2**: follow-up quality, model, or capability work. Priority is sequencing, not a CVSS rating.

All entries were reviewed on 2026-10-07. Owners are **unassigned** until claimed. IDs are stable: do not renumber or reuse them. The 40 open entries include code bugs, model limitations, tooling, and documentation/governance problems; they are **not** a claim of 40 independent production bugs. Nine additional entries are a verification queue.

    ### October 7 — 2. Fresh validation results

> [table: 12 rows moved to the register: rows without an id]
| Check | Current result | Evidence and interpretation |

Environment: Linux/WSL2, Node **24.21.0**, npm **11.19.0**, temporary Python **3.12.13**, NumPy **2.5.3**. The default shell Python was 3.14.6 without the backend dependencies; it was not used for backend validation. See [node-packages.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/node-packages.log), [python-freeze.txt](CODEBASE_SCAN_2026-10-07_EVIDENCE/python-freeze.txt), and [scan-manifest.json](CODEBASE_SCAN_2026-10-07_EVIDENCE/scan-manifest.json). The manifest records source hashes; hashing a file does not mean every line was reviewed.

    ### October 7 — 3. Coverage map

> [table: 8 rows moved to the register: rows without an id]
| Area | Work performed | Remaining boundary |

    ### October 7 — 4. Open tracker

    #### October 7 — Solar computation and delivery

> [table: 11 rows moved to the register: SCN-001 … SCN-011]
| ID | Priority / state | Problem and current evidence | Next action / closure gate |

    #### October 7 — Scientific results, propagation, and mission models

> [table: 11 rows moved to the register: SCN-012 … SCN-022]
| ID | Priority / state | Problem and current evidence | Next action / closure gate |

    #### October 7 — Frontend state, validation, and operations

> [table: 18 rows moved to the register: SCN-023 … SCN-040]
| ID | Priority / state | Problem and current evidence | Next action / closure gate |

    ### October 7 — 5. Reproduction details and limits for the highest-impact findings

    #### October 7 — PFSS correctness is independent of green tests

The backend probe calls the real `_associated_legendre` implementation. Its expected zonal P₂/P₃ values are elementary polynomial values, and the P₀/P₂ inner product is integrated with a 128-point Gauss–Legendre rule. Nonzero cross-degree overlap cannot be repaired by simply relabelling a normalization constant. The independent FITS fixture is constructed locally with a primary header and big-endian float32 image; it does not depend on GONG availability.

SCN-001, SCN-002, and SCN-003 are separate gates: fixing the recurrence will not fix the reader; fixing the reader will expose the grid/WCS problem. The retained [R3/R4 implementation work order](R3R4_PFSS_IMPLEMENTATION_PROMPT_2026-09-25.md) has more extensive analytic, ingestion, topology, and load acceptance criteria. It remains a plan, not evidence that those criteria pass.

    #### October 7 — Solar timeout and rate-limit probes are narrowly scoped

The timing probe patches the GONG fetch to return unavailable and supplies no realtime data. Its final run takes 4.094 s for one cold high/180 state, compared with the actual frontend's 2.6 s timeout. This demonstrates a local deadline mismatch even without upstream delay. It does **not** establish the previous audit's 0/39 success rate, a current p95, or universal failure on other hardware.

The rate-limit probe directly exercises the actual guard function with Starlette Requests from one transport peer. It admits 50 different forwarded identities and 50 arbitrary API-key identities when key authentication is unconfigured. A production proxy or independently configured credentials could change exposure; those deployments were not inspected. Trajectory-family ingress now uses transport identity with bounded storage and must not be conflated with this older solar guard.

The exact-JD cache keys currently preserve input distinctions. Replacing them with a day/rotation bucket without an error budget could introduce new scientific aliasing. Delivery improvements must retain the cache correctness tests until the replacement equivalence is proven.

    #### October 7 — Mission risk and cargo findings do not imply all feasibility checks are absent

The current vehicle service carries remaining propellant across its burn sequence. The missing state transition is acquired mining cargo before the return burn, not a complete per-leg mass reset. The risk probe combines real vehicle/risk services with a deliberately infeasible burn requirement and zero uncertainty; it exposes a contradictory probability contract. The mission verifier separately checks `logistics.feasible`. A full API regression should assert both correct candidate rejection and truthful reported risk.

    #### October 7 — Existing orbital gates remain valuable but have defined scope

The planet gate's broad approximation budgets and the moon gate's selected bodies/epochs are printed in the retained logs and implemented in their checker modules. They should be preserved. They do not validate rendered moon availability, the rest of the moon catalog, Earth geocentre semantics, every epoch, or the derivative of a secularly rotating orbit. The new velocity probe is a central difference with h=0.001 day; a fix should establish convergence across multiple h values before choosing a tolerance.

    ### October 7 — 6. Verification queue — not confirmed open bugs in this scan

> [table: 9 rows moved to the register: SCN-041 … SCN-049]
| ID | Priority / state | Historical item or unmeasured gate | Required next evidence |

    ### October 7 — 7. Historical reconciliation and preserved fixes

    #### October 7 — Changes that invalidate blanket carry-forward claims

> [table: 12 rows moved to the register: rows without an id]
| Historical claim | Current assessment | Evidence / residual |

    #### October 7 — September 24 ID crosswalk

All 47 IDs from that audit are mapped below so that omissions are visible. Mapping is not a claim that every historical reproduction was repeated.

> [table: 42 rows moved to the register: H-1 … L-17]
| Prior ID(s) | Current destination / treatment |

Older R01–R56 and September 6 physics topics remain historical root-cause inventories. Their counts and branch statuses are not additive to this tracker. In particular, the September 25 sun-focus convergence plan describes multiple branch tips; its proposed branch merge is not automatically the next action on this trajectory branch.

    ### October 7 — 8. Suggested execution order

1. **Retain reproducible evidence and restore trustworthy developer gates:** SCN-026/027/029, then the typecheck and dependency backlog SCN-025/028. Archive the intended historical artifacts under SCN-040 without deleting or staging unrelated work.
2. **Correct the scientific solar foundation:** SCN-001/002/003, with exact/bounded input handling SCN-004/008 and independent WSA/solar reference checks SCN-041/042. Security identity containment SCN-007 can proceed independently of the numerical work.
3. **Make solar delivery observable and reliable:** SCN-005/006/009/010/011, followed by the real browser/load gates in SCN-047. Use the existing H1 and R3/R4 plans as design inputs, rechecking their branch assumptions.
4. **Repair scientific representation and evidence:** SCN-012/013/014/016/017/019/020/021. Preserve current trajectory and moon fixes; establish missing oracles before expanding capabilities.
5. **Complete the approved frontend work and align product claims:** SCN-030/031/032, then paused work, configuration, dataset tooling/provenance and other P2 items. Enable moons or advertise mission-grade accuracy only after the relevant acceptance gates.

    #### October 7 — Tracker maintenance contract

For an entry moved to `IN PROGRESS`, record an owner and implementation branch/PR. For `RESOLVED`, record the fixing commit, the original failing reproduction, the passing replacement gate, and its scope. For `NOT A BUG`, record the counterexample or intended contract. Retain the old ID with a destination for duplicates. A passing generic test suite, a merged design document, an upstream timeout, or absence from the UI is not by itself a closure reason.

Suggested update record:

```text
ID: SCN-___
Status: OPEN | IN PROGRESS | BLOCKED | RESOLVED | NOT A BUG | DUPLICATE
Owner:
Last verified (date + commit):
Evidence / reproduction:
Fix / PR:
Acceptance command and actual result:
Remaining scope / linked ID:
```

    ### October 7 — 9. Reproduce this scan

Run from the repository root. These instructions intentionally scope product tests and use a temporary Python environment. Do not execute catalog update scripts merely to ask for help.

```bash
git rev-parse HEAD
git status --short
npm run build
npm run typecheck
npm test
npm test -- src
npm run verify:planet-positions
npm run verify:moon-frames
npm audit --json

    # First reproduce the missing test dependency in a NEW temporary environment.
uv venv --python python3.12 /tmp/solar-codebase-scan-repro
uv pip install --python /tmp/solar-codebase-scan-repro/bin/python -r backend/requirements.txt
/tmp/solar-codebase-scan-repro/bin/python -m pytest backend/tests --collect-only -q

    # Then add the separately recorded test prerequisite; do not confuse this with
    # a successful requirements-only install. Current registry resolutions may drift.
uv pip install --python /tmp/solar-codebase-scan-repro/bin/python httpx2
/tmp/solar-codebase-scan-repro/bin/python -m pytest backend/tests -q
/tmp/solar-codebase-scan-repro/bin/python agent-notes/CODEBASE_SCAN_2026-10-07_EVIDENCE/probe_backend.py

node_modules/.bin/esbuild agent-notes/CODEBASE_SCAN_2026-10-07_EVIDENCE/probe_frontend.mjs \
  --bundle --platform=node --format=esm --outfile=/tmp/solar-scan-repro.mjs
node /tmp/solar-scan-repro.mjs
```

For an exact Python package set, use the retained `python-freeze.txt` instead of resolving requirements anew; doing so does not reproduce the requirements-only collection failure. The backend audit probe refuses urllib network access and prints observations rather than failing on known bugs. **Exit 0 from a probe means the probe ran, not that its reported invariants passed.** Browser/provider/load acceptance requires separate harnesses. The temporary environment and generated JS bundle are disposable; all report evidence and probe sources are retained in the repository directory.

    ### October 7 — 10. Source documents and provenance

- [September 24 audit](HISTORICAL_SOURCE_ARCHIVE_2026-10-30/sources/agent-notes/CODEBASE_AUDIT_2026-09-24.md) and its retained evidence: principal historical ID baseline; includes its own corrections and the `bd48a7d` addendum. Pre-existing untracked material.
- [September 7 audit](CODEBASE_AUDIT_2026-09-07.md) and [September 6 physics audit](CODEBASE_AUDIT_2026-09-06.md): historical hypotheses and physics leads, not current status authority.
- [August 24 reconciliation](MAJOR_ISSUE_REPORT_2026-08-24.md) and [Report C / R01–R56 ledger](MAJOR_ISSUE_REPORT_C_SUNFOCUS_HUNT_2026-08-23.md): prior root-cause and branch history.
- [September 25 consolidated status/plan](SUNFOCUS_REGRESSION_STATUS_AND_FIX_PLAN_2026-09-25.md): branch-aware preservation and release gates; not a scan of this exact HEAD.
- [Trajectory amplification plan](TRAJECTORY_AMPLIFICATION_DEFENSE_IN_DEPTH_PLAN_2026-09-25.md): compare with the actual September 26 implementation and passing tests.
- [R3/R4 PFSS work order](R3R4_PFSS_IMPLEMENTATION_PROMPT_2026-09-25.md): solver/input/delivery acceptance design.
- [H1 solar delivery plan](H1_SOLAR_DELIVERY_PLAN_2026-09-25.md) and [digest](HISTORICAL_SOURCE_ARCHIVE_2026-10-30/sources/agent-notes/H1_SOLAR_DELIVERY_PLAN_2026-09-25_EVIDENCE/h1/digest.md): historical delivery/upstream mechanisms; pre-existing untracked material.
- [October 7 accessibility design](../docs/superpowers/specs/2026-10-07-frontend-accessibility-remediation-design.md): approved design only at audited HEAD.
- [JPL approximate planetary elements](https://ssd.jpl.nasa.gov/planets/approx_pos.html): primary-source identity/time-scale check, accessed in this scan. JPL labels the matching Earth row as the Earth/Moon barycentre and specifies JDTDB for the formula. No new live Horizons truth vectors were downloaded.

Old February accuracy pass rates, unverifiable multi-tool captures, pruned plans, and a September 25 scan without retained results are not used as fresh numerical evidence. This file and its evidence directory are the current scan record; previous reports remain historical records.


## Source `master-2026-10-11`: `agent-notes/MASTER_ISSUE_TRACKER_2026-10-11.md`

    # Master issue / problem / bug tracker — 2026-10-11

> **Current status (2026-10-30):** See the [verified remediation status](REMEDIATION_STATUS_2026-10-30.md) for all 83 dispositions, branch-specific fixes, remaining acceptance gates and the 25 completed working-note removals. The dated content below is historical evidence; it does not describe current main.

> **Historical record — superseded for maintenance on 2026-10-17.** Use the [consolidated October 10 tracker](CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-10.md), including the [approved SimulationClient scope and verification boundaries](CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-10.md#simulationclient-scope-decision--2026-10-17). The original dated content below is preserved; it is not a fresh status report.

Generated **2026-10-11 21:25:36 -0400 (EDT)** from the issue-bearing artifacts
semantically dated **2026-09-27 through 2026-10-11 inclusive**. This is a
deduplicated status ledger, not a claim that every line of the repository has
been formally verified.

Current remediation reconciliation: **2026-10-15**, construction source
`6539902`. The pre-work checkpoint was `dbfdbed`. Primary `State` remains
pinned to the historical product baseline
`origin/main@f45c1f917398718e27d8f1a9fdfa8502592c21fd`; PRs #7, #8, #9,
and #11 had landed at that baseline. No newer main or remote state is asserted.
Construction-branch progress on `remediation/canonical-register-20261014`
is separate from main resolution.

The latest full backend/CI/script run at `a8187a7` is **3878 passed,
zero failed, 12 skipped**. Frontend at `6539902` with Node 22.23.2 is
**745 passed, 411 skipped**; strict TypeScript/build pass. Required real
Tudat at `a8187a7` is **17 passed, zero skipped**. The scientific gate
at `cdea3bc` passes all six baselines and kills all six mutants.
See [the current checkpoint](REMEDIATION_CLOSURE_CHECKPOINT_6539902_2026-10-15.md) for exact scope,
warnings, remaining failures, and evidence. The earlier `b072d32` browser
result remains **97 passed, 14 platform skips**, not a final-source browser
claim. Default actual-main rendering, startup and moon promotion are not closed.

Use the [closure plan](REMEDIATION_CLOSURE_PLAN_2026-10-15.md) for current
owners, dependencies, remaining gates, and dated evidence. The
[remediation effort](REMEDIATION_EFFORT_2026-10-14.md) retains earlier
assignments and implementation history. The complete pre-reconciliation
tracker is preserved at Git object
`dbfdbed:agent-notes/MASTER_ISSUE_TRACKER_2026-10-11.md`.

<!-- MASTER_TRACKER_COUNTS {"snapshot":"origin/main@f45c1f917398718e27d8f1a9fdfa8502592c21fd","integration_checkpoint":"6539902","reconciliation_date":"2026-10-15","latest_full_suite_revision":"6539902","earlier_browser_revision":"b072d32","canonical_total":83,"RESOLVED_SCOPED":23,"OPEN":45,"DECISION_REQUIRED":6,"VERIFY":9,"PARTIAL_qualifier":9,"FIX_AVAILABLE_UNMERGED_qualifier":54,"FIX_AVAILABLE_UNMERGED_only":51,"PARTIAL_with_FIX_AVAILABLE_UNMERGED":3,"PARTIAL_only":6,"no_progress_qualifier":23,"alias_rows":138,"backend_suite_revision":"a8187a7","frontend_suite_revision":"6539902","scientific_gate_revision":"cdea3bc"} -->

    ## 1. Result

> [table: 5 rows moved to the register: rows without an id]
| Primary state | Count | Meaning |

The mutually exclusive progress buckets are **51 `FIX_AVAILABLE_UNMERGED`
only**, **9 `PARTIAL` rows**, and **23 without a progress qualifier**.
Three partial rows (`030`, `042`, `049`) also carry
`FIX_AVAILABLE_UNMERGED`, giving **54 total occurrences** of that qualifier,
not 54 additional rows. The nine partial IDs are `005`, `030`, `035`, `041`,
`042`, `043`, `047`, `048`, and `049`.

Primary-state counts describe the pinned main baseline. Construction-branch
fixes, scoped passes, and pending repairs do not change those counts or certify
the current branch. Evidence linked from canonical rows is dated and scoped;
overlapping suites must not be added together. Dormant, optional, offline, and
workspace-scoped findings remain counted with their scope stated explicitly.

The supplied [October 10 tracker](CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-10.md)
is internally consistent for its exact historical snapshots: it contains one
entry for every `SCN-001` through `SCN-064`, and its 55-open/9-VERIFY union
arithmetic is correct. It is not a current branch-status report. Subsequent
merges changed multiple dispositions, and its phrase “three newest local
branch tips” cannot be independently reconstructed from the retained evidence;
those were three user-selected, exact-commit tips.

    ## 2. Deduplication and status rules

1. **Root cause wins.** Multiple reports of the same mechanism become aliases
   of one canonical `SCN` row. Similar symptoms at different layers remain
   separate; for example, `SCN-013` shader precision and `SCN-014` file-format
   quantization both involve float32 but have different producers and closure
   gates.
2. **Compound findings split.** A source row spanning independent mechanisms
   maps to every owning canonical row with relation `SPLIT`. This preserves the
   distinctions among cargo (`019`), risk (`020`), protected reserve (`052`),
   and v-infinity/burn semantics (`078`), and among Earth/Mars lifecycle,
   scale, picking, and coordinates (`058`–`061`).
3. **Plans are not fixes.** Accessibility implementation is active under the
   remediation effort; its October 11 plan alone is not closure evidence.
   The formerly loose SCN-052/053/056/064 tests now belong to committed fixes,
   with actual landing status recorded per canonical row.
4. **Branch-only is not shipped.** Fixes integrated into
   `remediation/canonical-register-20261014` remain
   `FIX_AVAILABLE_UNMERGED`, never resolved on `origin/main` without landing
   evidence. Section 5 records the older candidates already merged at the
   pinned main baseline.
5. **Scoped closure stays scoped.** A resolved original defect does not certify
   its whole subsystem. `SCN-022` closes the JavaScript Kepler solver; a GLSL
   twin remains a verification child. `SCN-062` closes default-scale event
   lifetime, not every flare-coordinate or capacity question.
6. **No stale measurement laundering.** Historical numerical values are
   retained only as historical evidence unless rerun or supported by unchanged
   current code. `EXTRA-1` therefore remains under `SCN-043 VERIFY`, while the
   freshly checked retrograde-node mechanism is promoted to `SCN-081`.

Primary `State` values are `OPEN`, `RESOLVED_SCOPED`, `VERIFY`, and
`DECISION_REQUIRED`. `Progress` contains only `PARTIAL` and/or
`FIX_AVAILABLE_UNMERGED`, or a dash; chronology belongs in dated evidence.
Evidence is `OBS` (executed observation), `CODE` (source establishes the
mechanism at its stated snapshot), or `MIXED`. Undated pass wording in retained
rows is scoped to its cited fixing evidence, not a fresh suite result. Approved
corrections remain pending until their exact source and passing evidence are
recorded; approval itself does not close a gate.

    ## 3. Source inventory and precedence

> [table: 11 rows moved to the register: rows without an id]
| Date | Source | Provenance | Master use |

The September 24 audit and September 25–26 plans are outside the strict
document-date window. Their IDs remain reachable through the October 7
crosswalk, but they are ancestor sources rather than additive issue sets.
Filesystem mtimes caused by checkout or evidence restoration were ignored.

    ## 4. Canonical register

> [table: 83 rows moved to the register: SCN-001 … SCN-083]
| ID | Pri | State | Progress | Evidence | Canonical finding, scope, and closure |

    ## 5. Dated candidate-fix reconciliation (2026-10-14)

> [table: 6 rows moved to the register: rows without an id]
| Canonical IDs | Fixing branch/head | Current landing status |

The earlier four expected-red files are now committed regression tests with
production fixes. Old hashes in the source inventory are historical provenance;
this table supersedes their former branch-only status.

    ## 6. Complete alias ledger

Each source alias occurs once below. `MERGE` means the source symptom belongs
to one canonical root; `SPLIT` preserves multiple independent roots;
`SUPERSEDED` is a historical symptom whose owning root is scoped-resolved;
`VERIFY_CHILD` retains a lead without inflating the confirmed-open count.
The Treatment column preserves source-date wording, including old
"planned, not fixed" descriptions. It is lineage, not current status; Section 4
and the closure plan control the construction-branch disposition.

> [table: 138 rows moved to the register: F-SOL-01 … EXTRA-2]
| Alias | Source | Relation | Canonical target | Treatment |

    ## 7. Named verification children not promoted to new OPEN IDs

These source findings retain their original identities and evidence contracts.
They were not promoted at the original reconciliation because evidence was
conditional or they described acceptance/debt rather than one atomic defect.
This table is not a claim that each child is still unimplemented. Current
implemented portions and remaining proof are separated in Section 4 and the
closure plan; no umbrella row closes without dispositions for its children.

> [table: 12 rows moved to the register: rows without an id]
| Source finding | Canonical queue | Required evidence |

    ## 8. Historical disposition changes at the pinned main baseline

This table records the main baseline named above, not newer construction-branch
progress or a fresh remote check.

> [table: 13 rows moved to the register: SCN-005 … SCN-062]
| Canonical ID | Fixing evidence | Result at pinned main baseline |

    ## 9. Root-cause boundaries that must survive future merges

- `SCN-004` concerns solar acquisition deadline ownership; `SCN-063` is
  Horizons transport ownership and permit recovery. Permanent capacity loss
  has not been approved as an owner policy. Neither is the old API-wide
  trajectory-starvation report.
- `SCN-008` is `/solar/physics` admission; `SCN-053` is playback stepping;
  `SCN-072` is planning-route epoch/error handling.
- `SCN-012` measures benchmark truth. `SCN-045` defines solver capability,
  and `SCN-064` is a concrete near-antiparallel wrong-state failure.
- `SCN-019`, `020`, `052`, and `078` share mission data flow but have four
  independent roots and replacement gates.
- `SCN-022` resolves the CPU Kepler solver only. Do not use it to close an
  untested GLSL implementation.
- `SCN-034` owns safe generator execution; `SCN-046` owns reproducible
  byte-identical artifacts.
- `SCN-050` requires backend and active frontend fallback to share the same
  analytic normalization. The construction-branch fix and its scoped evidence
  are recorded in Section 4; this requirement does not imply it is unimplemented.
- `SCN-054` contains separation-floor, mass-offset, persistence, and
  serialization subclaims; a one-line fix cannot close the group silently.
- `SCN-055` energy origins, `SCN-057` callback ABI, `SCN-076` force formula,
  and `SCN-077` Tudat chunk/time semantics are distinct.
- `SCN-058` lifecycle, `059` scale, `060` picking, and `061` shader coordinates
  are independent Earth/Mars failures and should be verified together without
  merging their identities.
- `SCN-062` event lifetime, `SCN-065` stochastic scheduling, and `SCN-067`
  grid lifecycle are separate event-system roots.

    ## 10. Remaining closure work

1. Apply the newly requested shader/sampling and moon-loader corrections only after approval; retain all failing evidence and acceptance limits.
2. Resolve startup behavior, precise-time handling, source-storage and licensing decisions. Manual device and actual deployment acceptance require real evidence.
3. Complete observed-input/frame/calibration work without enabling unvalidated observational data.
4. Promote the prepared moon records only after independent accuracy/provenance/resource checks and approved storage; all 424 identities remain in the denominator.
5. Run affected final rendering, browser, startup/delivery and combined acceptance gates; retain exact revisions, every skip and every remaining failure.
6. Retain construction-branch qualifiers until a separately authorized and evidenced landing on main.

    ## 11. Review corrections and evidence limitations

- The October 10 headline counts and `SCN-001`–`064` coverage were verified,
  as were all 102 files in its retained evidence manifest. Its status labels
  were not normalized: cells such as `Same`, `Same workspace condition`, and
  implicit queue status have been replaced here by explicit state/progress/
  evidence fields.
- The original `SCN-057` source reference begins at
  `backend/sim/radiation_pressure.py:189–192`, not line 190. The galactic-tide
  reference at line 124 is correct.
- `CODEBASE_SCAN_2026-10-10_EVIDENCE/verify_artifacts.py` is not safe as a
  read-only current-check command: it hard-codes historical counts and rewrites
  `inventory.json` before rejecting a nonhistorical HEAD. Future work should
  add a default read-only `--check`, assert before writing, derive counts from
  explicit states, and place this tracker plus the evidence under an outer
  manifest.
- The original October 11 independent reruns reproduced `SCN-052`, `063`,
  and `064`, including the 179.999999° Lambert velocity error of 5,101.243 m/s
  and propagated miss of 209,061,472 km. Those are historical failing
  observations, not new failures of their later fixes. Original dispositions
  also used structured `68c3f85` evidence, fixing commits, and source checks;
  none was blanket subsystem certification.
- Original `SCN-051` evidence was a synthetic parser-to-solver contract;
  `055/077` initially used injected states but now also have real native Tudat
  evidence in the linked report. `057` remains dormant in production. `063`
  requires resource-ownership evidence, not an assumed acceptance of lost capacity.
- The original October 11 reconciliation added no live-provider, hardware or
  native-runtime evidence. Later dated reports add real-provider captures,
  RTX 5090 gates, a local multi-worker proxy gate, and native Tudat execution.
  All 424 moon candidates have passing candidate evidence; only 13 records
  are shipped. A successful full-424 production lazy-loading gate, actual
  remote deployment, and a complete manual screen-reader matrix remain unclaimed.
- Remote network freshness was not reasserted. This report is pinned to the
  local `origin/main` ref named at the top, not an inaccessible newer server
  state.

    ## 12. Maintenance contract

For any state change, retain the canonical ID and record: exact fixing commit
or PR, original failing reproduction, passing replacement gate, affected
snapshot, and remaining scope. When a compound row is split, add new IDs and
alias mappings rather than deleting history. A generic green suite, a merged
plan, a disabled feature, or absence from the default UI is never sufficient
for `RESOLVED_SCOPED` by itself.

The 2026-10-15 construction effort integrates tested PFSS, scientific-gate,
Kuiper and catalog-loading changes. The current checkpoint distinguishes fresh
results from earlier evidence and unintegrated proposals. Related notes are
mirrored to the primary repository without merging product changes into main.
No state is promoted solely on approval, implementation, or a generic green
suite; release, external and manual acceptance remain explicit.


## Source `bug-fix-2026-10-17`: `agent-notes/BUG_FIX_REPORT_2026-10-17.md`

    # Bug Fix Report — 2026-10-17

> **Status: DRAFT 2** (checkpoint 2026-10-23). Every candidate is now resolved.
>
> **Verification counts:** 64 distinct candidate bugs.
> - **62 reproduced** at the audited commit: 9 High, 33 Medium, 20 Low.
> - **1 not reproduced:** B045.
> - **1 withdrawn after checking:** B071.
>
> **Where the bugs live:**
> - **Also on `origin/main`:** most bugs, as the summary's *On `origin/main`* column shows.
> - **Regressions introduced by the remediation branch:** B004, B008, B009 and B011.
> - **Bugs in my own PR #3:** B010 and B042.
>
> **Fix status (2026-10-24).** Branch `fix/five-audit-bugs-v2@683e48e` (built 2026-10-23 by another session on top of
> `0ed7183`; local, unpushed, unmerged) carries one commit per finding in this report, B001–B072. I re-ran this audit's
> own repros against it for the five Highs the owner asked about:
> - **B010** (`8d7e28a`): the bisection returns after 1,026 evaluations (was still spinning after 807,235); `1e308`
>   mining inputs get 413 `mission_complexity_limit`, later requests get 200, and the compute thread is free. Huge but
>   finite inputs (`1e200`, `1e30`) answer in under 0.1 s.
> - **B011** (`9e8e02c`): `/health/live` max 2 ms during a handshake (was 2,057 ms).
> - **B003** (`7a38d34`): the Earth→Mars and Earth→Jupiter replays return states (were 502).
> - **B001** (`0136862`): all 18 legacy rows carry `epoch_jd 2461000.5`; Ceres, Vesta and Pallas are within 1.5–1.8e4 km
>   of SBDB (were 4.8–6.5e8 km).
> - **B009** (`05ff533`): all four requests return 200; the mission planner answers down to 600 d of headroom.
>
> The other 57 fixes on that branch are **not verified here**. The peer's `fix/audit-new-bugs-20261019` is superseded
> by it (B010, B003), except for its Horizons out-of-coverage breaker fix, ported as `a04cb64` on
> `fix/horizons-coverage-refusal-on-v2`.
>
> Test gates on `683e48e` (Node 22.23.2, Python 3.12.13): `python -m pytest -q backend/tests` **4,017 passed, 13 skipped**
> (3,757 at `0ed7183`); `vitest run` **881 passed, 413 skipped** (759); `tsc --strict` 0 errors; ratchet 0/226; `vite build`
> OK. Log: this session's `bugfix-audit/logs/gates_v2_683e48e.log`.
>
> **Recheck 2026-10-23** (repros re-run on `origin/main@1e82830` and the peer's `2404d6f`; no remediation branch changed
> these files since `ae3ae0b`):
> - **B010:** fixed on the peer branch only (`2404d6f`, unmerged). It returns after 1,026 evaluations; `origin/main`
>   still spins (807,235 calls in 5 s).
> - **B003, B001:** reproduce unchanged on all three refs.
> - **B009:** remediation only. `origin/main` returns 200 for all four requests.
> - **B011 was corrected:** it is a remediation regression. On `origin/main`, `initialize` takes 1 ms and the worst
>   `/health/live` latency was 5 ms. `2005a1f` added two `sim.integrate` calls (about 1 s each) to `initialize`.

    ## 1. Target and baseline

**Audited code:** commit `0ed7183`, a scratch merge on a detached worktree (no branch moved) of:
- `remediation/scn-followup-20261017@ae3ae0b`, the newest integrated remediation tip. It contains the canonical
  register `1c5d88b`, the construction-review fixes `9e00947` and the 2026-10-17 follow-ups.
- `origin/main@1e82830`, the only main commit missing from that tip (the EPO single-family policy, `scn-056`).

The line numbers below are from this tree. Newer, separate lines of work (`fix/scn-041-scn-049-closure@faa0e8d`,
`fix/scn005-startup-20261017`, `fix/scn042-rendering-20261017`) were **not** audited.

**Baseline at `0ed7183`** (Node 22.23.2 and Python 3.12.13, the versions CI pins):

> [table: 6 rows moved to the register: rows without an id]
| Gate | Result |

    ## 2. Method, and what actually ran

1. **Finders.** 43 scoped finders were planned: 31 subsystem slices read end to end, and 12 whole-repo lenses.
   - Run `wf_10df0902-c05` produced nothing: all 45 agents hit the account's shared session usage limit within 7
     minutes.
   - The rerun `wf_4001b3c0-e8f` had **25 finders complete** and **6 more leave partial results** (each finder saved
     every proven finding as soon as it had it).
   - The **12 scopes listed in §7 never ran**.
2. **Deduplication.** 76 raw findings → 70 after automatic deduplication → **62 distinct** after merging 8 duplicates
   by hand (B002→B001, B005→B004, B036→B008, B034/B043/B049→B009, B037→B011, B050→B014). Two more candidates (B071,
   B072) came out of the verification mutation runs, for **64**.
3. **Verification.** The planned independent reviewer agents (2–3 per finding) all hit the usage limit. **I verified
   each finding myself instead, by re-running the finder's repro against `0ed7183` and reading the code.**
   - Evidence lives in this session's `bugfix-audit/out/scratch/<finder>-r1/`; every command quoted below can be
     re-run from there.
   - This is one reviewer, not three: treat Medium and Low entries accordingly.
4. **Novelty.** Each finding was checked against 1,033 known issues: the 980-issue v2 ledger, the 53 confirmed
   discovery findings, and the trackers. **On `origin/main`** compares the cited lines with `origin/main`'s copy of the
   same file; for B004, B008 and B009 it was checked directly.
5. **Coordination.**
   - The peer session's own (a)–(k) (§5) are not re-reported. Its fix branch is superseded by
     `fix/five-audit-bugs-v2` (see the status block at the top).
   - Bugs in areas the remediation register owns are marked **[register]**: PFSS cache/spawn, solar frames, the SILSO
     budget, WSA, GONG and moon sources.

    ## 3. Summary

> [table: 62 rows moved to the register: B010 … B069]
| ID | Sev | Bug | Area | On `origin/main` | Known as | Effort |

🔧 = fixed on `fix/five-audit-bugs-v2@683e48e` and verified against this audit's repro on 2026-10-24.

\* B027 is downgraded from Medium: it lives in the opt-in H29 hypothesis mode.

    ## 4. Verified findings

    ### High

    #### B010 — Cargo bisection never terminates (my PR #3)
- **Where:** `backend/mission/vehicle_service.py:195-207` (`max_closable_cargo_kg`), fed by
  `mining_service.py:34-42` and `agents.py:209-216`.
- **Mechanism:**
  - `while hi - lo > tolerance_kg` has no iteration cap and no PlanningContext checkpoint.
  - With `available_cargo_kg = inf` (finite HTTP inputs reach it: `available_power_kw: 1e308` / 0.24 overflows), `hi`
    stays `inf` forever.
  - Above about 9e15 kg the float spacing exceeds the 1 kg tolerance, so `mid` collapses onto `lo` or `hi` and the loop
    never ends.
- **Impact:**
  - The request itself returns 504 at the deadline.
  - Its compute thread spins forever and keeps the **only** mission permit, so every later `/mission/plan` gets
    `503 mission_plan_saturated` until restart.
  - It also takes one of the two shared heavy-compute threads.
- **Evidence:** `out/scratch/mission-r1/repro_bisect_hang.py` → `deliverable inf`, `alive after 5 s: True`, 577,971
  `evaluate_burn_budget` calls. `http_bisect_hang.py` → 504, then 503 for valid requests.
- **Fix:**
  - Reject a non-finite `available_cargo_kg`.
  - Bound the loop (`for _ in range(200)`), and break when `mid` is not strictly between `lo` and `hi`.
  - Check the PlanningContext inside the loop.
  - Cap `extraction_rate_kg_day`, `available_power_kw` and `mining_days` in `MissionPlanRequest` to physical maxima,
    so that inf cannot be produced.
- **Test (red first):** `max_closable_cargo_kg(..., available_cargo_kg=math.inf)` returns or raises within 1 s; HTTP
  `/mission/plan` with `1e308` mining inputs gives 422 and leaves the permit free.

    #### B011 — `/ws/sim` blocks the event loop for ~2 s per handshake
- **Where:** `backend/server.py:5011-5041`. `_serve_simulation_websocket` is `async`, but it builds the engine and calls
  `engine.initialize(ALL_BODIES)` (~2.0 s of CPU) inline.
- **Origin:** the inline call is old, but it was cheap (1 ms on `origin/main`). Remediation commit `2005a1f` made
  `REBOUNDEngine.initialize` integrate the initial conditions (two `sim.integrate` calls, 2.07 s in total per
  cProfile). A red-first test therefore fails only on the remediation line, not on a branch cut from `origin/main`.
- **Evidence:** `out/scratch/srv-routes-r1/ws_block.py <backend>`: baseline `/health/live` 1.2 ms; during one
  handshake, n=91 probes, **max 2,020 ms**.
- **Impact:** any client freezes every HTTP route and WebSocket stream for ~2 s per connect. A reconnect loop keeps the
  API mostly frozen, and the 4-slot cap doesn't help because each slot is released quickly.
- **Fix:** move engine selection, construction, `initialize` and the three initial reads into one sync helper, and run
  it with `await asyncio.to_thread(...)` inside the admission slot. Ownership passes to the runner thread only after it
  returns, so it stays sequential.
- **Test:** a TestClient/uvicorn probe asserting `/health/live` max latency < 200 ms during a handshake; or a fake
  engine asserting `initialize` runs off the event-loop thread.

    #### B003 — Horizons direct Lambert fails for Earth↔Mars/Jupiter
- **Where:** `backend/mission/ephemeris_service.py:1620-1624` builds
  `provider_revision = "<{source: …}>; horizons-api-<v>"` from the target header. `backend/trajectory/lambert.py:452-458`
  requires `from_revision == to_revision`.
- **Mechanism:** Horizons names the per-body file. Earth and Venus are `DE441`, but Mars is `mar099` and Jupiter
  `jup365_merged`, so any pair spanning two files fails.
- **Evidence:** the six committed live captures in `backend/benchmark/artifacts/*horizons*.json`, replayed through the
  real service (`out/scratch/ephemeris-r1/repro_revision_mismatch.py <wt>`): Earth→Venus OK; Earth→Mars and
  Earth→Jupiter give `EphemerisProtocolError … incompatible provider revisions` (502, `retryable: false`).
- **Fix:**
  - Make the revision provider-level: Horizons API version plus the **centre** body's source (`Sun (10) {source: DE441}`).
  - Keep the per-body source as per-state metadata.
- **Test:** replay the mar099 capture; Earth→Mars `ephemeris_provider: horizons` returns 200.

    #### B001 — Legacy minor bodies propagated from J2000 although their elements are modern (B002 merged)
- **Where:**
  - `backend/data/bodies.py:166-341` (11 main-belt bodies) and `:480-592` (7 KBOs): no `epoch_jd`.
  - `mission/orbital.py:167` defaults to J2000.
  - `sim/rebound_nbody.py:341-349` does the same, labelled `catalog_assumed_j2000`.
- **Evidence:** `out/scratch/bench-data-r1/ceres_epoch.py <wt>` against SBDB elements at their own epoch:

  | Body | Miss |
  |---|---|
  | Ceres | 4.97e8 km |
  | Vesta | 6.54e8 km |
  | Pallas | 5.12e8 km |
  | Hygiea | 9.33e8 km |
  | Interamnia | 7.39e8 km |
  | 52 Europa | 8.88e8 km |
  | Davida | 6.79e8 km |
  | Controls carrying `epoch_jd = 2461000.5` (Euphrosyne, Sylvia) | 1.9e4 and 1.7e5 km |

  REBOUND shows the same 5.0e8 km (Ceres) and 6.4e8 km (Vesta) at three epochs (`dynamics-r1/ceres_epoch.py`).
- **Not a one-line fix:** I tested a single epoch for all rows (2458600.5 … 2461000.5). JD 2458600.5 fits Ceres
  (2.5e6 km), but Vesta, Pallas, Interamnia and Davida still miss by 5–8e8 km. The legacy rows come from mixed,
  undocumented epochs.
- **Fix:**
  - Regenerate the 18 rows from SBDB at the common epoch the corrected rows use (2461000.5, with `epoch_jd`), with
    `scripts/fetch_jpl_sbdb.py`.
  - Make `initialize()` and the planner refuse element sets with no declared epoch, instead of silently assuming J2000.
- **Test:** every non-planet orbit declares `epoch_jd`; Ceres and Vesta are within 1e6 km of the committed SBDB sample.

    #### B009 — Searches abort on their own out-of-window candidates (regression; B034, B043, B049 merged)
- **Where:** `backend/trajectory/mga.py:1092-1093` and `:815, :849, :493`, `lambert.py:66-70, 1061-1066`, and
  `contracts.py:36-44`.
- **Mechanism:**
  - The remediation commit `2613436` (TRAJ-068) re-validates *every derived* arrival epoch with the user-input
    validator.
  - The searches generate TOF candidates up to 2,000 days, so one candidate landing after 2050 raises
    `TrajectoryInputError('trajectory_epoch_out_of_range', field='arrival_jd')`. That aborts the whole request and
    discards routes already found.
  - `origin/main` has no such validation and does not fail this way.
- **Evidence:** `out/scratch/mga-orbital-r1/http_epoch.py`:
  - departure 2464842.5 (2036): `max_assists` 0 → 200, 1 → 200, **2 → 422**;
  - 2468592.5, `max_assists` 0 → **422**.
  - The sweep finds the first failures at 2036.4 (2 assists), 2039.7 (default 1 assist) and 2046.7 (direct).
  - Mission planning shows the same failure for the last ~5.5 years (B043, `mission-r1/probe_epoch_tail.py`).
- **Fix:**
  - Treat out-of-window candidates as infeasible: filter TOFs so that departure + TOF ≤ `PLANNING_JD_MAX` in the MGA,
    direct-grid and mission-return candidate generators.
  - Keep the strict 422 only for a **user-supplied** `arrival_jd` (direct Lambert).
- **Test:** `/trajectory/plan` earth→mars, departure 2464842.5, `max_assists: 2` → 200; no request without
  `arrival_jd` ever returns `trajectory_epoch_out_of_range`.

    #### B007 — Trajectory client ignores the configured backend origin
- **Where:** `src/frontend/features/trajectory/index.ts:9-10, 127-131`: its own `backendBaseUrl()` returns
  `` `${protocol}://${window.location.hostname}:8042` ``. `main.ts:262` already uses `runtimeUiConfig.backendOrigin`.
- **Evidence:** `out/scratch/fe-trajectory-dev-r1/origin.test.ts`, with `--backend-port 9000`:
  `VITE_BACKEND_ORIGIN http://127.0.0.1:9000`, `plan source local degraded true reason backend_unreachable`,
  `lambert error TypeError Failed to fetch`.
- **Impact:** any deployment or dev setup without the backend on page-host:8042 (a reverse proxy, a custom port)
  silently falls back to the offline planner. Lambert, porkchop and mission requests fail.
- **Fix:** delete the module's `DEFAULT_BACKEND_PORT`/`backendBaseUrl` and inject `runtimeUiConfig.backendOrigin`.
  This is `LEDGER-FE-022`, still open in this module.
- **Test:** the origin test above, asserting every trajectory URL starts with the configured origin.

    #### B004 — Solar snapshots frozen while motion is off (regression; B005 merged)
- **Where:** `src/sunController.ts:591-616, 747-761`, `solarFeatureBlending.ts:272-274, 307-321`.
- **Mechanism:**
  - The SCN-038 remediation drives the snapshot blend with `decorativeTimeSec`, which advances only while playing
    forward without reduced motion.
  - A new snapshot's blend starts at the frozen clock, so alpha stays 0.
  - The blended `activityIndex` is preferred over the payload's own value, so the Sun keeps the old activity.
- **Evidence:** `out/scratch/fe-solar-features-r1/blendFreeze.test.ts` (real controller, fetch stubbed): normal →
  rendered activity 0.9; **paused → 0.2; reduced motion → 0.2**, `blendAlpha = 0`. A reduced-motion user sees the first
  snapshot's activity for the whole session.
- **Fix:** when motion is disabled, complete the blend immediately (promote target to current). Take physical
  `activity` from the latest payload, and keep the decorative clock for animation only.
- **Test:** the blendFreeze test, asserting the shader `activity` equals the new payload's value after one `update()`
  while paused or under reduced motion.

    #### B006 — Corona layer invisible
- **Where:** `src/frontend/features/solar/sunVisuals.ts:477-480` (`fragR = length(vWorldPosition)/sunRadius`) and
  `:981` (shell scaled to 4 R_sun).
- **Mechanism:** every fragment of the shell is at r = 4.000, so the K-corona term is a constant 0.0031 and
  alpha ≤ 0.0017, under half of one 8-bit level. Streamers, the data-driven coronal holes (only this shader draws them)
  and the AIA tint never show.
- **Evidence:** `out/scratch/fe-sunvisuals-r1/corona.test.ts`: `fragRmin 3.9999998`, `fragRmax 4.0000002`,
  `alphaMax 0.00166`, the same at both display scales. Introduced with `67a08f6`.
- **Fix:** use the line of sight's impact parameter:
  `vec3 d = normalize(vWorldPosition - cameraPosition); vec3 c = uSunCenter - cameraPosition; float fragR = max(length(c - d*dot(c,d))/sunRadius, 1.001);`
- **Test:** shader-formula test, asserting alpha just off the limb is ≥ 0.02 and falls with impact parameter.

    #### B008 — Backend solar features pinned in inertial space [register] (B036 merged)
- **Where:** `src/frontend/features/solar/solarGeometryContract.ts:73-88, 103-115`.
- **Mechanism:**
  - `solarFeaturesInSurfaceFrame` and `solarHolesInSurfaceFrame` convert to surface-local coordinates with the
    **display** epoch. The spin group then re-applies the display-epoch rotation, and the two cancel exactly.
  - Features stay at the payload epoch's inertial direction while the surface spins. The physics-driven sunspots and
    flare points (B036) are affected the same way.
- **Evidence:** `out/scratch/lens-contract-r1/epoch_skew.test.ts`, with real payloads:
  - at D−E = 8 d, the displayed direction is 110.7° from rigid co-rotation and 114.0° from the backend's own answer at D;
  - rigid co-rotation would be within 3.4° of the backend.
- **Fix:** convert with the payload epoch, `context.jdTdb`, instead of `displayJdTdb`; pass the coronal-hole layer its
  context too.
- **Test:** the epoch-skew test, asserting < 5° from the backend at D−E = 8 d.

    ### Medium

- **B035 — `/mission/plan` 500 on a stage without `dry_mass_kg`.**
  - Cause: the model defaults the field to 0. `evaluate_burn_budget` then returns `{feasible: False, error}` without
    the totals, and the server indexes `totalRequestedDeltaV_km_s` (`server.py:2939-2954`).
  - Repro: `mission-r1/http_zero_dry_stage.py` → 500; with `dry_mass_kg: 100` → 200.
  - Fix: `gt=0` on `dry_mass_kg`, `propellant_mass_kg` and `isp_s` (422), and read the totals with `.get()`.
- **B042 — Cargo at the exact closure limit (my PR #3).**
  - Cause: the planner loads the largest cargo that closes at **nominal** Δv, so every above-nominal Monte Carlo
    sample fails.
  - Repro: `mission-r1/probe_capacity_risk.py`: at 22 t propellant, 2,269 kg loaded gives `failP 0.454`, so the
    mission is rejected, while a lighter load would pass.
  - Fix: size cargo against the dispersed Δv, i.e. bisect with burns × (1 + 1.645·σ_dv) ≈ ×1.082, or bisect on
    `failP ≤ threshold`.
- **B041 — MGA strands its leg budget.**
  - Cause: a truncated depth-1 stage with no partials ends the search.
  - Repro: `mga-orbital-r1/http_budget.py` → `max_assists 2` → 503 "exhausted its work budget" with 768/2000
    evaluations used.
  - Fix: hand leftover budget back to the truncated stage before declaring exhaustion.
- **B016 — Permit queueing counted as an upstream timeout.**
  - Repro: `ephemeris-r1/repro_contention_breaker.py <wt>`: two concurrent requests against a healthy fake upstream
    both time out and record an outage; a fresh client then fails immediately.
  - Fix: start the 2.5 s deadline after acquiring the permit, and never record an outage for local waits. Coordinate
    with the peer's (b).
- **B052 — Rate-limit identity behind a trusted proxy.**
  - Cause: the trajectory middleware uses the peer IP, while solar uses the trusted-proxy identity.
  - Repro: `srv-setup-r1/proxy_identity.py`: the 61st distinct user gets a 429.
  - Fix: one shared, scope-based identity helper.
- **B014 — Window edge bricks the `/ws/sim` session.**
  - Repro: `dynamics-r1/boundary_brick.py` and `srv-routes-r1/range_latch.py`: `Simulation step failed` → afterwards
    `engine_unavailable` for both `set_julian_date` and `resume`.
  - Fix: clamp to the window and pause with an `epoch_out_of_range` notice instead of latching a fatal error.
- **B013 — Kuiper O(N²).**
  - Repro: `dynamics-r1/kuiper_perf.py`: `N_active` is 2^64−1; a step takes 0.745 s, against 0.011 s with it set
    (dt = 6 d).
  - Fix: `self.sim.N_active = massive_count` after adding the massive bodies.
- **B051 — Paused Kuiper floods the socket.**
  - Repro: `srv-routes-r1/kuiper_paused.py`: paused, 95 of 95 snapshots carry the 410 KB payload; running, 16 of 80.
  - Fix: send Kuiper state only when it changed.
- **B015 — TudatPy far seeks.**
  - Repro (stub, since tudatpy isn't installed): `dynamics-r1/tudat_far_seek.py`: a seek to 2100 gives a
    36,495-day arc and ~5 GB of retained nodes.
  - Fix: give the engine a `supported_jd_range`, and keep only end states over long gaps.
- **B047 / B048 — SILSO starved and penalised by a slow SWPC [register].**
  - B047 repro: `solar-realtime-r1/stall_repro.py`: SILSO is `acquisition_deadline` although its cache is fresh.
  - B048 repro: `backoff_repro.py`: 300 s backoff after a deadline caused only by SWPC.
  - Fix: serve the SILSO cache or last-known-good before any budget check; never start a backoff on
    `acquisition_deadline`.
- **B044 — Frozen synthetic dipole tilt [register].**
  - Repro: `pfss-r1/tilt.py <wt>`: an active region's longitude moves from 205° to 27° in 12.7 days while the dipole
    axis stays at 0–4°.
  - Fix: rotate φ_tilt with the sidereal rate.
- **B046 — Lifetime envelope compounded twice.**
  - Repro: a CME tube with envelope 0.0205 has 1.70 G (below the 12 G floor) and brightness 0.008, while its 1,040 km/s
    speed and 2.7 R_sun extent stay unfaded.
  - Fix: apply the envelope once, after the clamp, and consistently.
- **B019 — Realistic scale lost on the belt renderer swap.**
  - Repro: `fe-main-r1/repro.mjs`: instance scale goes from 3.1e-6 to 7.6e-3 while `useRealisticScale` stays true.
  - Fix: call `setScaleMode(simState.useRealisticScale)` on the new renderer.
- **B020 — Named KBOs misplaced.**
  - Repro: `fe-data-r1/kbo_vs_horizons.txt`:

    | KBO | Error |
    |---|---|
    | Eris | 9.9 AU |
    | Makemake | 10.1 AU |
    | Haumea | 8.6 AU |
    | Sedna | 14.9 AU |
    | Quaoar | 5.4 AU |
    | Orcus | 17.0 AU |
    | Gonggong | 13.0 AU |
    | Varuna | 24.1 AU |

  - Fix: true J2000 elements, or the real per-object epoch; add a Horizons fixture test.
- **B021 — Inside the Sun.**
  - Repro: `controls.minDistance = 0.0002` for stars; after 400 zoom-ins the camera is at 0.05% (display scale) or
    4.3% (realistic) of the radius.
  - Fix: a radius-relative floor.
- **B022 — Stale solar distance.**
  - Repro: Mercury's panel shows 0.4040 AU indefinitely; after 15 s at 4 d/s the true value is 0.4614.
  - Fix: refresh at 4 Hz.
- **B023 — Camera up is +Y in a Z-up scene.**
  - Repro: orbit-left tilts the elevation 31° → 0° → −31°.
  - Fix: `camera.up.set(0, 0, 1)` before creating OrbitControls.
- **B024 — Display radii clamped by hidden moons.**
  - Repro: `fe-sim-core-r1/display.test.ts`: Mercury 1,272×, Venus 808×, Earth 39×, but Mars, Jupiter, Saturn, Uranus
    and Neptune 1.2–1.8×.
  - Fix: apply the moon clamp only when moons are rendered.
- **B025 — Sun swallows Mercury.**
  - Repro: display Sun 0.3755 AU > Mercury's perihelion 0.3075 AU.
  - Fix: cap the display Sun below the innermost perihelion.
- **B028 — Field rebuilt at activity 0.**
  - Repro: `fe-solar-clients-r1/scale.test.ts`: activity 0.5 → 0; field lines 52 → 26.
  - Fix: treat `null` as "no override".
- **B029 — Procedural field lines too long.**
  - Repro: `magExtent.test.ts`: 0.955 AU, against 0.460 AU for PFSS.
  - Fix: use the same `coronalToDisplay` mapping as the PFSS path.
- **B030 — Far-side flares visible.**
  - Repro: `flareSide.test.ts`: the sprite is behind the disk along the ray (5.38 vs 4.63) but has `depthTest: false`.
  - Fix: `depthTest: true`.
- **B031 — CME lune.**
  - Repro: `cmeShape.test.ts`: at 60° width, vertices sit 0–90° from the normal with the centroid 43.6° off.
  - Fix: `SphereGeometry(1, 32, 16, 0, 2π, 0, width/2)`.
- **B032 — Mixed frames in limb terms.**
  - Repro: `fe-sunvisuals-r1/frames.test.ts`: a disk-centre spot (true μ = 1) gets shader μ 0.07, so its Wilson factor
    is 0.675 instead of 1.
  - Fix: dot vectors in one frame.
- **B026 — Moon gate can't see irregular-moon rate regressions.**
  - Repro: `fe-sim-gates-r1/mutate_irregular.out`: "Carme [no secular rates]: gate PASSES".
  - Fix: re-measure the plane budgets at 2× the current propagator and add a negated-node mutation test.
- **B012 — Alpha Centauri B ~10 years out of phase.**
  - Cause: `alpha-centauri.json:42` has `mean_anomaly_deg: 156.0`. The visual orbit whose a, e, i, Ω, ω and P the
    manifest already uses (Pourbaix 2002 / Kervella 2016) has periastron 1955.6, which gives M(J2000) ≈ 200°.
  - Repro: Kepler solve with the manifest's elements: 10.0 AU off at J2000, 17.7 AU off on 2026-10-18 (r 27.8 vs 18.6
    AU). The apparent-separation cross-check reproduces the known 2016 minimum (4.0″) only with T0 = 1955.6; the
    manifest's implied T0 = 1965.4 gives 9.7″.
  - Fix: `mean_anomaly_deg = 360·(2000.0 − T0)/P` ≈ 199.8°, derived in the manifest the way Sirius already is.
- **B017 — Horizons echo tolerance tighter than the echo.**
  - Cause: `ephemeris_service.py:1611-1615` rejects a returned JD more than 5e-10 d from the request. Horizons prints 9
    decimals, so rounding alone is up to 5e-10 d, and float parsing pushes it over.
  - Repro (live Horizons, 6 calls, real transport): `2460400.987654321` → echoed `…320`, diff −9.3e-10 d →
    `EphemerisProtocolError`. One of three random fractional JDs failed the same way. Half-day JDs pass, which is why
    the tests don't see it.
  - Fix: accept |Δ| ≤ 2e-9 d (still ≪ 1 s), and keep the requested JD as the sample's key. This is distinct from the
    peer's (b) (out-of-coverage epochs).
- **B018 — Black asteroid belt.**
  - Cause: `beltRenderer.ts:267` sets `vertexColors: true`, but the geometry has no `color` attribute, so the shader
    multiplies diffuse by the default (0, 0, 0). `instanceColor` alone already enables per-instance colour.
  - Repro: `fe-asteroids-r1/color_probe.mjs` (real renderer, headless Chromium): ambient-only light gives 0 lit
    pixels; with `vertexColors: false`, 23,406. With the app's own lighting, mean RGB is (27, 26, 22) against
    (66, 57, 46).
  - Fix: delete `vertexColors: true`.
- **B038 — Backend Kepler velocity untested.**
  - Cause: no test checks `propagate_kepler_orbit` velocity for the bodies without secular rates (every asteroid and
    dwarf planet takes this path).
  - Repro: `lens-test-integrity-r1/batch1.log`: flipping `vz`'s sign in `orbital.py:102` → **3,757 passed**. A control
    mutation (Kepler tolerance 1e-10 → 1e-2) is killed, so the harness works. Impact (`repro/b1_vz_impact.py`): a Vesta
    transfer's arrival Δv changes from 6.48 to 5.41 km/s.
  - Fix: one parametrised test over every body, asserting velocity equals a central difference of position, plus a
    vis-viva check.
- **B039 — Rotation test re-implements the transform.**
  - Cause: `planetRotation.test.ts:27-51` imports only the catalog and rebuilds the spin math itself. The shipped spin
    lives in `main.ts:750-770` and `localSystemRenderer.ts:560-566`, which no vitest file imports.
  - Repro: spin-sign, spin-axis and local-spin mutations of the shipped code all survive: the test still reports 13
    passed, and the full suite 759.
  - Fix: export the spin step (`applyBodySpin`) used by both callers, and test that.
- **B040 — Belt GLSL orbit orientation ungated.**
  - Cause: the residual and GPU probe bodies (`verify-asteroid-residuals.mjs:37-38`, `verify-asteroid-gpu.mjs:31-32`)
    use i = Ω = ω = 0, and neither script is wired into `package.json` or CI.
  - Repro: flipping the shader's inclination sign survives vitest and the Playwright shader spec (1 passed).
  - Fix: add an inclined probe (e.g. i 30°, Ω 80°, ω 110°) compared with `propagateKeplerOrbit`, run in CI under
    SwiftShader.
- **B033 — Dev launchers crash on a missing executable.**
  - Cause: `spawn` at `dev-full.mjs:90` and `run-ui-dev.mjs:97` has no `error` listener.
  - Repro (`fe-trajectory-dev-r1/fake`, PATH without python3): `Unhandled 'error' event … spawn python3 ENOENT`, exit
    1, and the already-started Vite child survives, reparented.
  - Fix: `child.on('error', …)` that logs and runs the existing teardown.

    ### Low

- **B027 — H29 metric display invisible** (opt-in mode). `fe-smbh-r1/h29mag.test.ts`: the maximum offset is
  1.7–4.7e-9 AU.
- **B065 — Wrong retry hint.** Deterministic exhaustion on `/mission/plan` is labelled 503 `retryable: true` (four
  identical retries); the sibling path says `false`.
- **B067 — Cycle-boundary step.** Activity is 0.2107 → 0.1504 across the boundary at JD 2462867.6, because
  `_cycle_offset_months` wraps with a modulo. Sum the previous cycle's tail instead.
- **B068 — Vacuous test.** At the test's own inputs, all 6 spiral lines have `in_coronal_hole = False` and get WSA
  speeds, so the fast-wind branch never runs.
- **B064 — Carrington round-trip.** 93 of 200 rotation starts are classified as rotation n−1 (2199.999999999993
  floors to 2199). Round before the floor.
- **B053 — Benchmark Markdown shows `0.000`** for the 1e-4 km/s tolerance. Use `.2e`.
- **B070 — CORS validator** accepts `HTTP://LOCALHOST:5173`, `http://localhost:80` and trailing `?`/`#`, none of which
  can match. Canonicalise or reject at startup.
- **B072 — Horizons envelope checks untested.** Neutering all five checks at `ephemeris_service.py:1548-1559` at once
  (not an object, upstream `error`, provider signature, missing `result`, ≠ 1 vector table) → **3,757 passed**
  (`lens-test-integrity-r1/b072_fullsuite.log`). Without them a malformed response surfaces as whatever fails next, not
  as a classified protocol error. The finder's wider sweep found 13 of 19 parser raises unkilled (on a test subset). Add one
  fixture per check.
- **B054 — Kuiper activation no-op** (latent: `SimulationClient` is imported only by `animationLoop.ts`, which nothing
  imports). `fe-app-core-r1/simclient.test.ts`: a second activation sends nothing; after a rejection, retries send
  nothing. Clear `kuiperActive` on `kuiper_activation_failed`.
- **B055 — Reconnect backoff never grows** (latent, same client). 8 accept-then-close cycles give delays of 500–740 ms
  instead of 600 → 15,000 ms. Reset the attempt counter on the first `state_update`, not on the handshake.
- **B056 — Planner races.** `fe-app-renderers-r1/planner.repro.test.ts`: a late response re-plots Earth→Mars after
  "Clear route", and an older request overwrites a newer one (output Mars, selector Venus). Add a request sequence
  number and drop stale responses.
- **B057 — Oversized local-system labels.** Barnard's Star labels are 1.2 × 0.32 AU around orbits of 0.019–0.038 AU,
  seen from 0.23 AU. Size them per pixel, as the solar loop does.
- **B058 — Local-system dispose leak.** `localSystemRenderer.ts:403-418` disposes only orbit lines, so body materials,
  label textures and glows leak on every switch. This is from a code trace; `routeRenderer.ts:58-68` shows the right
  pattern.
- **B059 — Far-date crash.** `fe-sim-core-r1/fardate.test.ts`: years up to 12,500 work; 12,600, 13,000, 18,600 and
  −14,900 throw `RangeError: secular drift produced an invalid elliptic orbit`, which stops every body update. Mark the
  body unavailable, or clamp the clock to the model's range.
- **B060 — Analytic field inconsistent.** `fe-solar-features-r1/fieldcheck.py`: the tilted dipole isn't rotated back,
  and the multipoles are projected in the wrong basis. The direction is off by a median 5.2° (activity 0.5) to 10.4°
  (activity 1.0), and 876 of 20,000 footpoint polarities flip. LEDGER-SVIS-002 is marked fixed.
- **B061 — Sub-spots re-randomise.** `fe-sunvisuals-r1/hash_count.mjs`: the sub-spot hash is seeded by the group's
  current longitude, so in 39 of 60 frames in one second a sub-spot jumps by over half a group radius. Seed from a
  stable region id.
- **B062 — Granulation seam.** `seam.mjs`: 46 of 199 samples jump > 50% across u = 0/1, against 0 at u = 0.5. Wrap the
  cell lattice (`mod(nId.x, scale)`).
- **B063 — Spicules pinned at 6 px.** The size divides a pixel constant by an AU distance, so it is clamped at 6 px
  from 0.5 to 100 AU. Use the projection-matrix point size. LEDGER-SVIS-087 is marked fixed.
- **B066 — Loop blend sinks into the Sun.** `lens-physics-r1/loop_blend2.py` (backend snapshots, frontend lerp at
  α = 0.5): at a 30 d gap, 24 of 24 matched loops dip below 0.9 R_sun (median minimum 0.80). Rotate the old snapshot
  to the new epoch, or slerp.
- **B069 — Contradictory `cache_state`.** `solar-realtime-r1/gen.py`: `partial` when every source failed, `failed`
  when SWPC delivered. Compute it once from the final delivered statuses.

    ## 5. Already being fixed elsewhere (not re-reported)

Branch `fix/audit-new-bugs-20261019` (off `origin/main@1e82830`, peer session; tip `aa34962` on 2026-10-23).

Status as the peer reported it:
- **(b): fixed** in `aa34962`.
- **(a), (g) and part of (f):** fixed on the remediation line, pending merge.
- **The rest:** being triaged.
- **This report's B010 and B003:** superseded by `fix/five-audit-bugs-v2`; its remaining unique fix is `a04cb64`.
- **B009, B004 and B008:** have commits on `fix/five-audit-bugs-v2` (B009 verified here; B004 and B008 not).

The peer's findings:
- (a) No Origin/Host check on the local profile, so `POST /benchmark/accuracy/report` can write files.
- (b) One out-of-coverage epoch trips the Horizons outage breaker.
- (c) `/ws/sim` runner thread leak.
- (d) ASGI ERROR traceback on client disconnect.
- (e) No parent-death guard for solar worker children.
- (f) Responses disclose absolute filesystem paths.
- (g) Benchmark `output_path` edge cases return 500.
- (h) Malformed AIA `image_id` returns 503 retryable instead of 400.
- (i) `dev:full` CORS, Vite exposure and orphaned processes.
- (j) `generate_moon_ephemeris.py --bodies` truncates the artifact.
- (k) Synthetic Hale and Joy's-law polarity.

    ## 6. Not reproduced

- **B045:** the supervisor discards a received result if the child takes > 0.25 s to exit.
  - Measured exit lag: 0.052–0.082 s idle, and ≤ 0.108 s under 2× CPU oversubscription.
  - The fixed 0.25 s grace overriding a deadline with time left is a real smell, but its impact is unproven.

**Withdrawn:**
- **B071:** removing `dm -= dn + dw` (`orbital.py:137`) keeps all 3,757 backend tests green, but the cause is
  unreachability, not a missing test.
  - The line sits in the `periodIsMeanLongitudePeriod` branch. Only the frontend catalog sets that flag (Io, Europa).
  - All nine backend bodies with secular rates carry `meanLongitudeDegPerCentury`, so the branch never runs.
  - It is dead code in the backend, with no runtime effect.

Every other candidate is resolved: there is no pending table.

    ## 7. Coverage and remaining gaps

- **Scopes whose finders never ran** (usage limit):
  - **Whole-repo lenses:** numerics, backend concurrency, frontend lifecycle, data integrity, time, deadlines and
    config.
  - **Subsystem slices:** `fe-planetary`, `scripts-moons`, `scripts-catalogs`, `scripts-misc` and
    `scripts-ci-verify`.
- **Partial only** (killed mid-run; partial findings kept): `ci-tests-harness`, `lens-test-integrity`,
  `lens-error-handling`, `fe-app-core`, `fe-sim-gates`, `fe-smbh` and `fe-trajectory-dev`.
- **Verification depth:** one reviewer (me) instead of 2–3 independent ones.
- **The 413 skipped frontend tests** have not been analysed: the test-integrity finder that would have done it died.
- **Gap rerun (2026-10-19):** three narrower finders were launched for the missing scopes. All three hit the usage limit
  before writing anything, so every gap above is still open.
- **Mutation leads not yet triaged:** the finder's throw sweep left 44 of 60 neutered `throw`s surviving in
  `moonEphemeris.ts`, `solarPhysicsClient.ts` and `modelWorkerContract.ts` (`lens-test-integrity-r1/throwmut1.log`).
  That sweep ran a test subset, so these are leads, not findings.

    ## 8. Recommended fix order

Every item below has a commit on `fix/five-audit-bugs-v2`; this is the order in which to review and land them.

1. **B010, B011:** one request can hang or freeze the backend. Both are XS–S.
2. **B009, B004, B008:** regressions the remediation branch is about to ship; fix them before it merges.
3. **B003, B007:** whole features broken in common configurations (Horizons Lambert; any non-8042 backend).
4. **B001 + B020, B006:** wrong science and invisible layers in the default views.
5. **B018, B012, B017:** one-line data and visual fixes with a large visible effect (black belt, misplaced star,
   Horizons rejecting fractional dates).
6. **B035, B042, B041, B016, B052, B014, B013, B051:** API robustness and performance.
7. **B038, B039, B040, B072:** test gaps in which a real defect would pass every gate. Each fix is a test, not a
   code change.
8. The remaining Mediums, then the Lows. [register] items go to the remediation register's owners.


## Source `consolidated-2026-10-24`: `agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md`

    # Consolidated Markdown issue audit — 2026-10-24

Status: **IN PROGRESS**. This is the single working issue register requested by the owner. The inventory is complete within the stated search boundary; claim verification and serial remediation are ongoing. An inherited “open”, “fixed”, or “not checked” label is not a fresh result.

    ## Scope and provenance

- Window: August 24 through October 24, 2026 (America/New_York). Recent revisions and uncertain filesystem-only dates are included conservatively and identified below; modification time is not proof of creation.
- Baseline under test: `683e48ef50a94c9a5683eab1721ccacfaaf13f5e`; repair branch: `fix/markdown-audit-20261024`. This includes the earlier 62-bug repair series. `origin/main` remains a separate older line; passing here does not mean merged there.
- Search: registered repository worktrees, reachable Git Markdown history (including deleted files), and the project-specific Claude audit/memory directory. Dependencies, bundled operating-system documentation, caches, and build outputs are excluded; generated browser error-context Markdown is included as historical evidence.
- Inventory: 48 registered worktrees, 46 present; 14,948 Markdown filesystem locations; 290 historical blobs; 452 eligible distinct contents (220 on the baseline, 232 absent/different; 76 Git-only). Exact duplicate contents are represented once.
- The historical ledger contains 980 clusters, not 980 proven bugs. Some clusters incorrectly combine unrelated aliases. Their source claims remain attached below; each root and any distinct child must be verified on its reachable current path. Old severity is retained only as a triage hint.
- Do not enable unvalidated observed solar forcing, invent physical parameters, select a software licence, delete user evidence, push, or merge as a side effect of this audit.

    ## Status rules

`PENDING_CHECK` is not a finding. `CONFIRMED` requires a current reproduction (or conclusive static evidence where execution is inappropriate), root cause, reachability and source. `FIXED_BASELINE` requires current code/test evidence, not ancestry alone. `FIXED_HERE` additionally records the repair commit and red/green verification. `LIMITATION` is a truthful model/product boundary. `BLOCKED_EXTERNAL` names the missing owner/data/environment input. Dormant but callable library bugs remain bugs, separately labelled.

    ## Work sequence

- [x] Preserve existing worktrees; create one branch atop completed repairs.
- [x] Inventory recent Markdown, historical variants and hidden project notes.
- [x] Start one consolidated register with source inventory and historical claim crosswalk.
- [ ] Finish per-domain current-code verification; split false cluster merges and deduplicate actual roots.
- [ ] For each confirmed root, write/run its failing regression, apply the smallest repair, rerun original and adjacent contracts, review, and commit that issue alone. Multiple commits are allowed when one issue needs distinct safe stages.
- [ ] Run complete pinned-toolchain frontend/backend suites, strict types/build and applicable browser/science gates; retain skips and external acceptance gaps explicitly.
- [ ] Reconcile every row, update the commit ledger, and report unresolved external decisions without pretending they are fixed.

    ## Probe charters

- MIS-033: Positive finite dry mass, fuel and payload retain their independent mass contributions across burns, cargo loading and stage jettison; representable results must not be lost to intermediate cancellation or overflow. Risk: A valid large stage falsely fails mission closure and can report negative final mass. Entry: VehicleService.evaluate_burn_budget, backend/mission/vehicle_service.py. Isolation: In-memory dataclass fixtures; Decimal-derived independent expected masses; no external mission submission. Exit: Failing large-stage reproduction becomes feasible with correct remaining fuel; exhaustion and multistage controls plus complete backend suite pass. Source: Historical MIS-033 title and current backend audit captures025-033. Commands: PYTHONPATH=backend uv run --offline --no-project --python3.12.13 --with-requirements ci/backend-test-requirements.txt python -m pytest -q backend/tests/test_mission_mass_flow.py backend/tests/test_mission_reserve_partition.py backend/tests/test_mission_propulsion_contract.py backend/tests/test_mission_schemas.py; complete backend/tests suite.
- FE-083: Finite camera transition inputs complete and restore controls; nonfinite duration/timestep is rejected before state mutation. Risk: NaN interpolation poisons positions and leaves controls permanently disabled. Entry: createCameraTransitions in src/frontend/camera/transitions.ts (retained library). Isolation: New PerspectiveCamera and controls per test; no network, DOM, GPU or shared external state. Exit: Exact invalid-input replay plus full pinned frontend suite and strict TypeScript pass after repair. Source: CODEBASE_AUDIT_2026-09-06.md L6 / FE-083 Commands: Node 22.23.2 node_modules/vitest/vitest.mjs run src/frontend/camera/transitions.test.ts; full npm test; npm run typecheck. Each command bounded at 60 seconds.

    ## Current verification evidence

- SMB057 185db66: exact one-comment correction, whole-source inverse and all 1,360 executable tokens unchanged; 103 existing focused tests pass. Independent static approval 9d7b960d. Root final f1d4ea109c46f4297e5b6549a9fc4b4e1fd8793060aa1ef2f46a2680bc3c4d43; archive PASS/open[] 774fec0a. Description facet only; illustrative physical model remains qualified. Audit IN PROGRESS; worker no-reply retirement preparation and TRAJ070 guard-coverage characterization next. No push/merge.
- MOON037 4783ba1: fresh 8 RED/8 controls to identical 16 GREEN; original 16, adjacent 56, strict three projects and independent 45 pass. Root frontend 2,291 passed/413 existing skips; exact source/test promotion, 443 protected inputs and raw evidence authenticate. Root final f02c6c22cb3a0ca53656c5314fc4598817532b068582b0625ce8cfc433a45f69; archive PASS/open[] 857b92c6. Consumer-only retained-module repair, not an active leak claim. Audit IN PROGRESS; SMB057 description and worker-stall lifecycle next. No push/merge.
- PLAN021/P063 78837bc: fresh native6RED/5controls to11GREEN; original11, helper12, adjacent145, strict3 and independent130 pass. Root frontend2275passed413existing skips and source/promotion/native-artifact authentication pass. Root final2db53e3eb3f499f6e560b6be4f85bf9a11ee0103d4a29436408d8f89fbdbfdb1; archive PASS/open[]d026ab76. Existing Earth399 bound only; compound claims separately qualified. Whole audit IN PROGRESS; MOON037 cancellation next, no push/merge.
- SMB059 a00f2e8: one-comment correction, whole-source inverse and all1360 executable tokens unchanged; actual private-expression/CDF characterization and103 existing focused tests pass. Independent static approval a8266174. Root final c8f72ed7b873f4f0a5e60965c12ee51a47a35c3e30b8668fb0580c4eef62a415; archive PASS/open[]01bfc637. Description facet only; physical calibration remains unverified. Whole audit IN PROGRESS; PLAN021 CLI velocity gate next, no push/merge.
- SMB056 28d4875: fresh6RED/12controls to18GREEN; original18, adjacent101, full-population1, strict3 and independent117 pass. Root frontend2252passed413existing skips, build75 and browser3 pass. Complete source/test preservation, 435 protected inputs, 960 records/906 selected periods/18 binaries and 712 browser inputs authenticated. Root final8c6d7d55a15525b71757e606130014d0a2e104b6373abae91744645e8257fb19, archive PASS/open[]38dfdde1. Whole audit IN PROGRESS; SMB059 description correction next, no push/merge.
- SMB024 publication5ad5560: fresh permanent5RED/5controls→10GREEN; original10, unchanged35, strict3 and independent55 pass. Root frontend2234passed413existing skips; source inverse/full13774-byte promotion/421 protected inputs and raw/native artifacts verified. Final root6ad9b84d3ee699a530d5e3a15f7a8703e389f6373199d2920c792b452f2e4ec5, archive PASS/open[]1380d57b. Canonical SMB024 remains qualified for unrelated packing claims. Whole audit IN PROGRESS; SMB056 generated heliocentric periods next; no push/merge.
- SAT-PRIMARY-IDENTITY 2a7695e: fresh permanent3RED/9controls then12GREEN; original12, focused203, strict3 and independent174 pass. Full frontend2224passed413existing skips, build75 and existing browser5 pass. Root final d2b5932831ebb8dbe8ac4b3816883ea84b2cfb10f616e69acb2b8b87b52f453b; archive PASS/open[]159a2804. Exact two-file source/test repair, selected-model identity only. Whole audit remains IN PROGRESS; no push/merge.
- SMB068 documentation qualification: root fully read retained owner/distribution/shader; static capture001 pins four files and finds no production importer. Current inputs share J2000, so hypothetical newer-epoch catalog reuse is not a demonstrated current wrong-epoch bug. Independent queue review agrees. Evidence /tmp/solar-smb068-static-qualification-20261024.3ZrSop/evidence.json (d232fc7d63c9e855d3ea89035496fd5ad9fffa9d17de419a38e688468c8c4e5e), static PASS/open[]. No source or dataset repair, GPU execution or full-suite rerun claimed.
- MOON034 (655eba4): fresh 17 RED/13 controls becomes 30 GREEN; immutable 30, focused 191, strict three projects and independent 180 pass. Root frontend 2212 passed/413 retained skips; build 75 modules and actual browser five pass. Complete inverses, 442 protected inputs, 709 browser inputs and owned-resource retirement authenticated. Final root archive PASS; checker-only schema corrections retained. Root receipt /tmp/solar-moon034-root-final-verification-20261024.json (ba34777839f18cfc55a6dab05deb453769715c0236ba6af903d3fc3ef4345be8). MOON046 remains partial for distinct activation/performance claims. Audit IN PROGRESS; composed satellite primary identity and finite-score publication are queued separately.
- SMB024 sign (b6d7e1c): fresh permanent four RED/five controls → nine GREEN; original nine, unchanged26, strict three projects and independent44 pass. Root frontend2182 passed/413 retained skips; entire source/promotion inverse,439 protected inputs and93 fixture directories/525 files verified. Final root/author/review archives PASS; original preparation FAIL/open supersession qualification retained. Root receipt /tmp/solar-smb024-root-final-verification-20261024.json (42598ce53362cf75d84ee0bc822da2b3e7af898747934fae98292ed96cc45a63). Canonical SMB024 stays partial; no arbitrary score/H domain policy selected. Audit IN PROGRESS; MOON034 exact-date/J2 snapshot admission is next.
- SMB023 (b6bccab): fresh permanent four RED/two controls → six GREEN; immutable native six, unchanged period 18/help two, three strict projects and independent 32 pass. Root full frontend 2173 passed/413 retained skips. Whole source/promotion inverse, 438 protected inputs, raw evidence and 66 retained fixture directories/332 files authenticated; all final archives PASS. Root receipt /tmp/solar-smb023-root-final-verification-20261024.json (afb9ba4c484a98df162f11af95d991eeff91a6fb7f92b99e2970abf27fad621f). Retained CLI parsing only. Audit remains IN PROGRESS; eccentricity-priority sign is next, with overflow/domain policy kept separate.
- SMB022 (f894e3d): fresh permanent 6 RED / 12 controls → 18 GREEN; immutable native 18, unchanged help 2, three strict projects and independent 38 pass. Root full frontend 2167 passed / 413 retained skips. Exact two-file source/test inverses, 437 protected inputs and completed raw/fixture evidence authenticated; all final archives PASS. Retained CLI units only, no published data regeneration. Root receipt /tmp/solar-smb022-root-final-verification-20261024.json (a2460ab83898705b32497561ce070cc20b9ad29d8dd348b7dffd4e4de5728f51). Audit remains IN PROGRESS; MPC angle offsets are next.
- MOON015 (9b7ba10): fresh permanent 9 RED / 5 controls → 14 GREEN; original immutable 27, adjacent 243, three strict projects and independent 80 pass. Root frontend 2149 passed/413 retained skips, build 75 modules and unchanged actual app-smoke 3 pass in 44.1s; 705 inputs and all owned resources preserved. Exact 3 source/test scope and complete old catalog/worker value/reference graphs authenticated. Labels disclose synthetic/catalog/unspecified origin without changing radii or enabling moons; no measured-radius accuracy claim. Root receipt /tmp/solar-moon015-root-final-verification-20261024.json (2f9c7807818ea172e02bba01e9436b2ef6bee301806a3fea47623efa514c565b).
- PLAN00872e226c: permanent21RED18/3 then21GREEN, original21+exactEarth1,268adjacent,strict3projects/standalone54rows and independent140 pass. Whole5source inverses/full21promotion91assertion sites/460protected authenticated. Fullfrontend2135passed413retainedskips,75module build, unchanged actual app-smoke3pass44.9s;704inputs/13ownedidentities/profile/ports clean. Root/author/reviewer archivesPASS. Full-five published coordinate weights repair approximate-state centre consistency, not underlying accuracy/PLAN009 masses/backend target9. /tmp/solar-plan008-root-final-verification-20261024.json. Audit IN PROGRESS; next MOON015 truthful radius-source labels.
- SMB071/R1725 report-only reconciliation: current actual-source helper/actual renderer native7 and independent replay7 pass,251 protected frontend inputs and Pluto candidate unchanged. Historical nonfinite-mass perturbation defect is FIXED_BASELINE on current guarded/inert path, not a new source repair or all-positive-mass/GPU/science claim. Root and reviewer archivesPASS; /tmp/solar-smb071-current-independent-review-20261024.json and /tmp/solar-smb071-current-check-20261024.PY7GUJ/report.md. Audit IN PROGRESS; next confirmed PLAN008 full-five Pluto centre repair.
- Backend direct Kepler137ad15:29 nativeRED/GREEN, immutable20,232adjacent/1retainedskip and98independent pass;101 numerical observations give90 verified returns/11 retained explicit precision failures,8 requireddefault24 controls return,6ownedchildrenreaped. Full backend5432passed13skipped2warnings193.34s. Entire outer-source/original20/680protected and all raw evidence authenticated, all archivesPASS. Root manifest /tmp/solar-plan014-root-final-verification-20261024.json. PLAN014 compound remains partial for velocity/mu/hyperbolic/outer-clamp facets. No frontend/browser/data change; audit IN PROGRESS, next report-only SMB071 reconciliation then Pluto centre.
- Frontend direct Kepler736c57c:33 nativeRED/GREEN, originals26/28/5,266 adjacent and79 independent pass; immutable156 numerical requests give135 independently checked returns/21 retained throws. Full frontend2114passed413skipped, strict3projects/build75 and actual app-smoke3pass44.8s;702 inputs/13ownedidentities/profile/ports verified. Root/reviewerPASS; authorINCONCLUSIVE historical supersessions retained. Whole source/test promotion inverses and679protected authenticated. PLAN011 remains partial for outer period/model/hyperbolic clauses; PLAN012/013 share this helper repair. Manifest /tmp/solar-kepler-direct-root-final-verification-20261024.json. Audit IN PROGRESS; backend PLAN014 next, then separately reviewed Pluto full-system centre.
- MOON006 280f246:10 nativeRED/GREEN, immutable18/adjacent294/independent62 pass; whole-main5line inverse/full promotion/698protected verified. Full frontend2081passed413skipped, strict types/build75 and actual app-smoke3pass42.4s,700inputs/13ownedidentities/profile/ports clean. All archivesPASS. Coordinate consistency only, default moons hidden; no model/data/warp/GPU-science policy changes. /tmp/solar-moon006-root-final-verification-20261024.json. Audit IN PROGRESS; direct Kepler numerical contracts next.
- MOON005 visual b9a480a:8 nativeRED/GREEN; two resolver-only fixture adapters preserve27 prior assertions; adjacency121/independent55 pass. Full frontend2071passed413skipped, strict types/build75 and actual app-smoke3pass42.4s. Complete inverses/694protected and445browserinputs/13ownedidentities/profile/ports verified. All three archivesPASS, scope dormant visual dispatch only; MOON005 compound partial, next separate MOON006 hierarchy. Manifest /tmp/solar-moon005-root-final-verification-20261024.json.
- FE-EPOCH-RANGE c90ba4d:60 unique new contracts pass; independent308 overlapping executions. Full backend5403passed13skipped2warnings, frontend2063passed413skipped, strict types/build75 pass. Actual Chromium unchanged-v2 app1pass verifies suppressed unsupported requests and Now recovery with445 inputs unchanged and owned cleanup. Root archiveINCONCLUSIVE retains setup-only PATH capture002; corrected product gates pass, author/reviewerPASS. See /tmp/solar-epoch-range-root-final-verification-20261024.json. No hardcoded epoch/clock/retention/scientific policy; audit IN PROGRESS, next MOON005.
- PFSS057/SOL-COLD-CACHE ebbaa0c: exact completed synthetic ready reuse verified; original failures retained, one cold-deadline fixture isolated without assertion changes, final counts and warning limitations in /tmp/solar-pfss057-ready-root-final-verification-20261024.json. FE-PHYSICS-CACHE-CADENCE remains partial for changing epochs.
- EXO019-ORBITAL-TEXT1655237:6 nativeRED/GREEN,55adjacent,2013frontendpass413skip, strict3projects/build75pass; independent original6, exact four-prose-replacement inverse and424protected pass. Unsupported orbital teaching claims removed, no new magnitude or physical-calibration claim.
- EXO019-AMPLIFICATION a563ad7:8 nativeRED/GREEN,55 adjacent,2007 frontendpass413skip, strict3projects/build75pass; independentoriginal8, whole-source/two-prose-line inverse and423 protected pass. Callable metadata only; unit/nucleus text and physical model remain separate.
- FE-LABEL-SCALE-TRANSITION f7eb500:12 fresh nativeRED/GREEN;27 direction/transition;1999 frontendpass413skips; strict3projects/build75 pass; independent original12/protected438. Actual Chromium original1+permanent1+direction2+smoke3=7pass,442inputs/27ownedPIDs/two profiles/port closed. Existing formula only, no sizing/font/science closure.
- SOL-AIA-BUNDLE-ISOLATION a7fa5fc:41 final native,68 originals,330 adjacent,85 independent executions; full pinned backend5346passed13skipped2warnings185.52s. Source/adapters inverses and251 protected inputs pass. First-stage all-five-channel bundle only; parent remains partial.
- NBW-REBOUND-CASE 258ab19:13 fresh RED/GREEN,172 client, full frontend1987pass/413existing skips, strict source/scripts and build75 pass; independent original13 and protected14/source inverse pass. Library-only scope; no broad alias/ABC or native-physics closure.
- FE020/R1109 qualified recheck: request retries remain confirmed after30s, but fallback/stale status and accessibility already exist; no worker or endpoint-rate admission on server range rejection. Six observational frontend cases plus one actual-ASGI control pass, not a repaired-product claim. Configured range transport/policy remains to design; no hard-coded frontend200-year assumption.
- Quarantine test-only follow-up f246142: 230 targeted passed, two warnings; independent whole-file promotion review approved. No production change; preceding full backend5298/13/2 does not include the seven newly permanent controls.
- Quarantine checkpoint 81efa9d: full backend5298 passed/13 existing skips/2 dependency warnings; targeted16 and adjacent207 pass, independent32+7 pass. Source inverse and248 protected inputs prove bounded lifecycle-only change. Frontend1974/413/types/build and scoped FE041browser2+2+3 are preceding unchanged checkpoints. Audit IN PROGRESS; no push/merge.
- FE041 checkpoint 14064ae: full frontend1974pass/413existing skips, strict frontend/script types and production build pass (existing large-bundle warning). Native15 red6/controls9 then green15; independent immutable26 and actual original2/permanent2/app-smoke3 pass. Direction-only; baseline browser twice2RED and all raw evidence retained. No full backend rerun for frontend-only source. Audit remains IN PROGRESS; SOL-QUARANTINE is next serial confirmed repair.
- Solar description checkpoint 777500e: permanent4 red2/controls2 then green4, original4+API/security111 pass115, independent8 pass. Exact literal-only inverse and244 protected files preserve all numerical code and stablev6 identity; no new full solver/browser rerun. Backend5272/13/2 and frontend1959/413/fullChromium52/1 remain preceding checkpoints. Audit IN PROGRESS; FE041 realbrowser baseline reproduces both first-draw and trusted-drag direction failures.
- Full Chromium checkpoint on unchanged frontend through f23cc48 (before Barnard note edit):52 passed/1 existing native-display skip,0 unexpected/flaky/global errors,464.137s Playwright run. All447 consumed inputs identical across f0094c3→f23cc48 backend/report-only commits; root authenticated23 artifact/receipt metadata entries.81 sampled PID/starttime identities exited,3 profiles removed,4357 closed. SwiftShader and existing endpoint fixtures, not physical-GPU/live-provider/scientific acceptance. Full checkpoint manifest: /tmp/solar-frontend-chromium-checkpoint-final-20261024.json; report: /tmp/solar-frontend-chromium-checkpoint-20261024.vkbCT3/report.md; gstack PASS/open[].
- EXO025 note checkpoint cfc1f41: fresh6 red4/controls2 then green6; original6/existing6/retainedconsumer2 and independent20 pass. Exact four note appends preserve all46 numerical fields, sources and every other byte; no full numerical/browser rerun for metadata-only change. Author/reviewer PASS; audit IN PROGRESS.
- AIA identity checkpoint 9708405: full backend5272 passed/13 existing skips/2 warnings (213.15s), fresh43 red22/controls21 then green43; immutable83/adjacent357/reviewer197/root87 pass with overlaps explicit. Exact three-file admission-only repair and244 protected hashes verified. Frontend1959/413 and strict types/build75 remain SAT492eade checkpoint; refreshed fullChromium is in progress, not yet claimed passing. Audit IN PROGRESS; next metadata-only EXO025.
- SATprimary checkpoint492eade: original16/permanent16/adjacent161/independent136 pass after repeated4RED12controls. Fullfrontend1959/413, stricttypes/build pass; exactthreefile/tworead repair with435protected verified and both scoped archivesPASS. Backend5227/13/2 and lastfullChromium47/1 remain historical; latest dedicated nativeWorker2+appsmoke3 at398581e. Audit IN PROGRESS; next AIA identity preflight.
- TOOL083 runtime checkpoint398581e: permanent74/original74/adjacent145, frontend1943/413, strict types/build, actual retained-worker2 and unchanged app-smoke3 pass after meaningful native/browserRED. Full source/candidate inverse and protected434 authenticated; independent final review bound below. No default-main, static full protocol or orbital-accuracy closure. Backend5227/13/2 and prior fullChromium47/1 are historical checkpoints. Audit IN PROGRESS; next separate inherited primary-key lookup.
- Documentation checkpoint91166c3: separate one-sentence false active-trajectory claim corrected,2native checks pass with unchanged62source graph; exact inverse and independent review approve. Also reconciled five historical clusters with fresh actual-controller/worker-helper characterizations: obsolete shipped-path amplification and severity/integration overclaims narrowed; snapshot retention/lag and cross-job cache reuse remain scoped pending work, not marked fixed. Audit IN PROGRESS; next satellite-worker message admission.
- TOOL045 checkpointcc08d34: final native33, immutable64, independent66; full frontend1869/413, types/build and actual diagnostic3+existing smoke3 pass. Root final EOF-only inverse and fresh33 pass; writer archive qualified INCONCLUSIVE, peer PASS. Backend5227/13/2 and full Chromium47/1 remain earlier checkpoints. Whole audit IN PROGRESS; next separate active-trajectory documentation correction and retained worker validation.
- 2026-10-24 CI pinning checkpointfa626d8: exact2RED3controls→5GREEN; original/permanent/CIrunner25 and independent7 passed;18malformed+4empty mutation checks reject. Fresh official refs independently match; exact9 substitutions preserve all other workflow semantics. Writer/peer PASS/open[]. No hostedCI or broadsuite rerun claim. Audit IN PROGRESS; next retained browser diagnostic entrypoints.
- 2026-10-24 solar-query checkpoint8da3e06: final-byte13RED25controls→38GREEN; immutable67,adjacent256,independent167 passed; fullbackend5227passed13existing skips2existingwarnings197.50s. Exact13-line source delta and full executable candidate suffix authenticated. Writer/peer PASS/open[]. Only /solar/physics query-name admission changes; scientific/model/process code unchanged. Audit IN PROGRESS; next direct CI action-reference pinning.
- 2026-10-24 verifier checkpoint8a64bfc: full backend5189passed13skips2existingwarnings189.36s; original/permanent30,adjacent36,independent30 passed. Only one write relocated;102 other historical files unchanged. No historical regeneration. Writer aggregate INCONCLUSIVE on supersededRED001 retained; raw final gates/independentPASS authenticate frozen source. Audit IN PROGRESS; next SOL-QUERY unknown-name/wrong-default-epoch rejection.
- 2026-10-24 catalog publication checkpoint8a6af2e: permanent40/original62/adjacent210 and independent85 passed; fullbackend5174/13/2 in187.06s, frontend1836/413 in4.06s, strict types and build passed. Protected46 assets/helpers/config/tests and production cache unchanged. Writer aggregate honestly INCONCLUSIVE on superseded RED bookkeeping; raw final gates and independent PASS establish final bytes. No provider/data regeneration in tracked paths or Gaia offline/atomicity claim. Audit IN PROGRESS; next retained audit-verifier evidence preservation.
- 2026-10-24 AGN environment checkpoint 1dcaa19: two source hunks plus permanent 22-case regression, independent review, exact inverses and 16 protected-input checks. Full frontend 1,836 passed / 413 existing skips; strict types and build passed; writer and peer gstack PASS/open[]. Backend and real-browser checkpoints unchanged. TOOL102 compound remains partial; no GPU portability claim. Audit IN PROGRESS; next explicit catalog publication consent.
- 2026-10-24 scope-record checkpointa058d28: exact independently approved24-line history correction+one rolling pointer, original-byte inverses, Git UTC/source facts, seven link occurrences and preserved008seven checks; root gstack PASS. TOOL007 compound remains PARTIALLY_FIXED; no historical ADR or feature policy invented. Rolling500lines27577bytes; runtime checkpoints unchangedfrontend1814/413,backend5134/13,fullChromium47/1. Audit IN PROGRESS; next AGN graphics environment.
- 2026-10-24 rolling-log checkpoint3044ab0: archive-first preservation, actual UTC maintenance time, exact16 retained blocks, current500lines/27475bytes; root7 and independent7 pass, gstack PASS. Thirty completed notes moved from rolling view with full original archived, no historical evidence lost. TOOL008 compound remains PARTIALLY_FIXED; dates/statuses/chronology not revalidated. Runtime checkpoints remain frontend1814/413, backend5134/13, full Chromium47/1; no prose-only rerun. Audit IN PROGRESS.
- 2026-10-24 migration documentation checkpointa6e7588: exact one-file archived correction, full historical body preserved, three links/four protected config files checked; independent review and root gstack PASS. R1547 contradiction fixed; compound TOOL009 remains PARTIALLY_FIXED and historical acceptance remains unverified. Prior frontend1814/413, backend5134/13, full Chromium47/1 not rerun for prose. Audit IN PROGRESS.
- 2026-10-24 moon-review isolation checkpoint17471d0:6permanent/6original and11science disabled+11explicit; independent6/fidelity approval; strict types/build green; full frontend1814passed413existing skips. Backend5134/13 and full Chromium47/1 are prior checkpoints, not rerun for test recorder isolation. Three retained artifacts unchanged from the pre-edit112 snapshot, not claimed unchanged across earlier audit work. Audit IN PROGRESS; next historical migration correction and rolling-log cap.
- 2026-10-24 asteroid documentation checkpoint8a1de4e: independently reviewed exact nested reference plus one root tree comment, eight links/eight unchanged source inputs and source AST checks; root gstack PASS. Corrects four stale implementation/integration claims without enabling the retained pipeline or asserting accuracy/performance. Frontend1,808/413, backend5,134/13 and full Chromium47/1 remain prior checkpoints; no runtime rerun for prose. Audit IN PROGRESS; next opt-in moon review output.
- 2026-10-24 TypeScript allowance checkpoint89d24aa: clean pre-edit source/scripts zero bound to ca803b1/70c3f60; permanent12 and real-tsc10 green, full frontend1,808pass/413existing-skips, final pinned source/scripts/UI typechecks and both real ratchets pass. Original5tests and414protected inputs unchanged. Independent PASS; writer gstack INCONCLUSIVE solely retained008 PATH setup failure with semantically corrected pinned011,010 unpinned npm attempt also qualified. Product gates pass; backend5,134/13 and full Chromium47/1 retained checkpoints. Audit IN PROGRESS; next source-backed asteroid documentation and opt-in moon review exports.
- 2026-10-24 MIS022 local-family checkpoint bb92bd9: permanent16 RED9/7 twice then GREEN; immutable14/16 and344adjacent pass; full backend5,134pass/13existing-skips/2existingwarnings181.47s. Final docstring-only attribution correction separately rerun16 and byte/AST verified. Independent57 overlapping executions and12protected files, root63hash guard plus source/test fidelity. Both gstack aggregates PASS. Compound MIS022 remains partially fixed; no HTTP/default-family exploit inferred. Frontend1,801/413 and full Chromium47/1 remain prior checkpoints. Audit IN PROGRESS; next stale TypeScript diagnostic allowances.
- 2026-10-24 README scope checkpoint0add2e2: independent complete-document/source review and82hashguard, exact candidate promotion,70 unchanged source-graph inputs,16 preserved command blocks and11 preserved links. Root gstack PASS; no runtime feature/science changes. README corrections close scoped TOOL001/002 and solar-overclaim facets, not closed observed-input gates or all historical/source comments. Frontend1,801/413, backend5,118/13 and full Chromium47/1 remain prior checkpoints. Next local mission-family validation; audit IN PROGRESS.
- 2026-10-24 SMB053 origin checkpointf162421: full frontend1,801 passed/413 existing skips, strict types/build and actual-app composition1/1 pass. Original/permanent24 pass after twice15 RED/9 controls; adjacent182 and independent81 overlapping executions pass. Phase helper/test and generation unchanged. Exact two-file commit after378hashes;269 browser inputs unchanged. Scoped gstack aggregates PASS. Backend5,118/13 and full Chromium47/1 remain prior checkpoints. README scope and local mission-family identity are next; audit IN PROGRESS.
- 2026-10-24 SMB052 phase checkpointa19165c: full frontend1,777 passed/413 existing skips, strict types/build and actual-app composition1/1 pass. Original/permanent26 and adjacent158 pass after twice14 RED/12 controls; independent59 overlapping executions and generation preservation verified. Exact two-file commit after381hashes;269 browser inputs unchanged. Scoped gstack aggregates PASS. SMB053 remains reproduced15fail/9controls and is next. Backend5,118/13 and full Chromium47/1 remain prior checkpoints. Audit IN PROGRESS.
- 2026-10-24 README link checkpoint6bb7f9b: three original missing-file failures and two controls become five passes, independently replayed. Exact three-href document transformation and24hashes verified. Scoped gstack aggregates PASS. No source behavior changed; broad checkpoints retained. Broader README feature claims remain queued; audit IN PROGRESS.
- 2026-10-24 quadtree lighting checkpoint 7557e91: full frontend1,751 passed / 413 existing skips, strict types/build and actual-app Chromium3/3 pass. Original/permanent15 pass after repeated3 RED/12 controls; adjacent130 and independent71 overlapping executions pass. Exact two-file commit after375 hashes;269 browser inputs unchanged. Writer archive retains qualified INCONCLUSIVE for missing-rg PATH setup, final product gates and peer review pass. Backend5,118/13 remains EXO checkpoint; full Chromium47/1 remains Sun checkpoint. Audit IN PROGRESS; no push or merge.
- 2026-10-24 EXO029 alias checkpoint 1704010: complete backend 5,118 passed / 13 existing skips / 2 warnings in 180.08 seconds. Original/permanent29 pass after repeated15 RED/14 controls; adjacent127 and independent65 overlapping executions plus six scripted compatibility checks pass. Exact two-file commit after63 hashes; catalog and manifests unchanged. Frontend1,736 passed/413 existing skips and full Chromium47 passed/1 existing skip remain the Sun checkpoint. Next serial repair: per-owner quadtree lighting scratch objects. Whole audit IN PROGRESS; no push or merge.
- 2026-10-24 Sun-private disposal checkpoint 90fe726: original/permanent 15 pass after 11 RED / 4 controls; adjacent 523, full frontend 1,736 passed / 413 existing skips, strict types and build pass. Full Chromium 47 passed / 1 existing native-display skip, zero unexpected/flaky/errors in 307.44 seconds; exact frozen source/test reviewed and 97 hashes checked. Backend checkpoint remains 5,089 passed / 13 existing skips at 3cf5314. Next serial repair EXO029 supported aliases; whole audit IN PROGRESS, no push or merge.
- 2026-10-24 orbit-closure checkpoint ce058d5: permanent 14 cases went from 4 failures / 10 controls to 14 passes; independent original 14 and focused/adjacent 41 pass. Full frontend 1,706 passed / 413 existing skips, strict types, build and actual-app Chromium smoke pass. Exact two-file commit after 41 hash checks; no numerical or dataset change. Backend 5,089 passed / 13 skipped checkpoint remains applicable. Next: redundant pixel-ratio setter; whole audit IN PROGRESS, no push or merge.
- 2026-10-24 latest backend checkpoint, 3cf5314: 5,089 passed, 13 existing skips and two existing warnings in 179.85 seconds on the frozen five-file launcher repair. Original native and environment RED/GREEN evidence is retained. Focused 96, adjacent 264 and independent 154 checks pass; precommit guard checked 52 hashes. Frontend checkpoint remains 1,692 passed / 413 existing skips, strict types and build at b481c4a; not rerun for this backend-only fix. Original checkout e9052f9 remains tracked/index clean with 1,009 untracked files preserved. Audit IN PROGRESS; no push or merge.
- 2026-10-24 FE-HUD-REDUNDANT b481c4a:5RED/13controls→18GREEN; actualDOM repeated mutations12→0 with changed1/missing0 controls; independent18+36+native1 overlapping checks pass. Full frontend1692pass413existing skips, strictsource/scripts/UI,75module production build and2actual-app Chromium camera/frame checks pass. Exacttwofile commit after58hash/fidelity checks. Backend checkpoint unchanged5018pass13skip; fullChromium checkpoint47pass1skip, not rerun wholesale. No performance or science overclaim. Next: BKP029 interpreter-option-preserving legacy launcher; orbit closure is being prepared. Whole audit IN PROGRESS.
- 2026-10-24 FE-ASSET-BASE 858a0da: repeated permanent 20-case RED (14 failures / 6 controls) becomes GREEN; unchanged original 20, adjacent 56, root 53 and independent peer 76 pass (overlapping counts). Full frontend 1,674 passed / 413 existing skips; strict source/scripts/UI and build pass. Fresh native root/subpath production replay: 4 passed, 16.284 seconds, real catalog integrity and worker controls, 263 inputs unchanged and owned processes/ports/profiles closed. Exact two-file source inverse and immutable assertions checked before commit. Latest full backend remains 5,018 passed / 13 skipped at f7d859b; full Chromium remains 47 passed / 1 native-display skip at d13d7d6, with this separate four-case production gate. Next prepared repair: BKP029 legacy file-launch spawn isolation. FE019 wording and exact-zero observed-map policy await owner choices. Whole audit IN PROGRESS; one branch, serial bug commits, no push/merge.
- 2026-10-24 PEER-g/P013 output-path f7d859b: repeated46RED16/30 becomes46GREEN, immutable28/46 and439adjacent pass; root92/peer225 independent passes, exact4files/immutableassertions verified. Fullbackend5018pass13skip2existingwarnings161.85s, frontend1654pass413skip, source/scripts/UI types/build pass. Last nativeChromium checkpoint remains47pass1existing native-display skip at startupd13d7d6; backend-only change did not rerun browser. FE019 neutral-versus-dynamic badge choice pending; subpath catalog and backend launch claims being rechecked. WholeauditINPROGRESS, one branch/serial bug commits, no push/merge.
- 2026-10-24 FE-STARTUP-ESCAPE d13d7d6: repeated actual-main RED3/1 becomes4GREEN, immutable early/later originals pass; new35 units,64focused,18Now and root136adjacent pass (overlapping counts). Final fullfrontend1654pass413existing skips, source/scripts/UI types and build75modules1.52s. Independent finalChromium47pass1native-display skip/48registered,290695.712ms, zero unexpected/flaky/global errors;263input hashes unchanged and owned4341/76PIDs/3profiles closed. Root402 precommit hash checks bind ten files, both reviews and30writer captures. Old full-suite9/6fixture failures were resolved before commit without assertion weakening; conservative writer archive INCONCLUSIVE only on superseded argv/artifact identities, final root/browser PASS. Existing backend4972/13 checkpoint unchanged, not rerun for frontend-only repair. FullSunGPU/factory-hidden/top-level/bootstrap/hardware/live-science boundaries stay open. Next serial repair PEER-g/P013 output-path classification; whole audit IN PROGRESS, no push/merge.
- 2026-10-24 BKP00796daad2: repeatednative38RED13/25, finalnative/immutable38GREEN, adjacent198/root151/peer182pass; fullbackend4972pass13skip2existingwarnings158.00s, frontend1619pass413skip/types/buildpass. Three frozen files,13protectedfiles,2reviews and33capture hashes verified before commit. Writer scopedPASS; reviewer superseded setup-command typo explicitly qualified, not a clean archivePASS. Second runtime product repair since Chromium checkpoint136e6b8, still no frontend runtime changes. Startup early actual-main failure independently replayed by root; partial ownership map and bounded recovery/lifetime design prepared, later-stage native probe in progress. User checkout e9052f9 remains tracked-clean with110untracked entries preserved. WholeauditINPROGRESS; one branch/serial fixes, no push/merge.
- 2026-10-24 DOC-CATALOG-FRAME-NOTE0bf567f: historical TOOL093 assertions already removed by a864ea4; stale present-tense guidance corrected in two files only. Exact executable suffix/comment-freeTS output unchanged, guideinverseexact, focused40tests/typespass; independentreview and3capturegstackPASS. No new physics/testimplementationfix or allmoonaccuracy claim. MIS029 remains only runtime product repair after checkpoint136e6b8; latestfullbackend4934pass13skip andfrontend1619pass413skip unchanged. NextBKP007 actualHTTPprojection33 independently13RED20controls, additional nonmutation/dependency controls being prepared. Actual startup failure reproducedtwice in ownedChromium, fullhandoffpending. WholeauditINPROGRESS; no push/merge.
- 2026-10-24 MIS0296e26a66: repeatednative86 RED66/20 (11current numerical/wiring failures,55approved additive guards), GREEN86/immutable86/adjacent242; root256/peer262pass and four exact legacy fullresult/callback fingerprints preserved. Fullbackend4934pass13skip2existingwarnings164.24s; frontend1619pass413skip/types/buildpass. Four-file coordinated repair, manifest/reviews/36capture hashes andPASS evidence verified before commit. First product repair after browser checkpoint136e6b8; no frontend runtime changes. Next narrow stale moon-test documentation correction, then BKP007 HTTP path projection if its current probes confirm. Actual startup failure preparation independently ongoing, no implementation yet. Whole audit IN PROGRESS; no push/merge.
- 2026-10-24 TOOL050 preflightbdddf2e:20nativeGREEN after twiceRED8/12; original37/adjacent103/root96/peer57pass. Fullbackend4848pass13skip2existingwarnings176.38s; fullfrontend1619pass413skip/types/buildpass74modules1.62s. All3product/2review/39capture/evidence hashes verified before commit. Five product repairs since prior browser checkpoint complete. Separate publication hazards still open and owner write-mode decision pending; not an audit blocker for other safe repairs.
- 2026-10-24 post-Moon Chromium checkpoint atb6756a4, concurrent approved Python/README-only Tool050 dirty changes:43passed1existing native-display skip/44registered,0unexpected0flaky249060.367ms. All258frontend/src/browser/config/package hashes unchanged aggregate04e60ec2c56e0a755a2919d727f15ed358b0821bdd7d98d59aaf32614ed5d0cd; port4331closed,34observedownedPIDs/3profiles cleaned normally. Chrome156/SwiftShader, actual asteroid shader compiled/linked, existing genuine200%/400%zoom checks pass. Root checked4capture receipts/results/cleanup and scopedPASS. Receipt /tmp/solar-post-moon-chromium-receipt-20261024.json. No all126/hardware/manualAT/native-display/liveprovider/science acceptance claim. Initial owned snapshot config discovery error superseded before suite; no product/test changes. Next serial repair MIS029; whole audit IN PROGRESS, no push/merge.
- 2026-10-24 MOON-NAME-SPELLING78c4ca3: repeatedRED8/32; native40/original40/adjacent485pass411skip, root148 and peer134 independent cases. Fullfrontend1619passed413skipped, strict types/buildpass74modules1.49s. Six-file atomic repair; manifest/product/reviews/36capture hashes andPASS evidence verified before commit. Inspection010/011 setup issues superseded012 without source changes. MOON014 runtime facets now resolved; raw source provenance and unrelated N0244/P048 scientific qualifications retained. Fourth product repair since Chromium checkpoint563db71; TOOL050 metadata preflight next, then browser/backend checkpoint. Whole audit IN PROGRESS, no push/merge.
- 2026-10-24 FE-AIA-SAME-ORIGINf0a4425: repeatedRED7/26; native33/original33/adjacent361 pass, root91 and peer91 independent cases. Fullfrontend1579passed413skipped, strict types/buildpass73modules1.52s. Two-file atomic repair; manifest/product/reviews/30capture hashes andPASS evidence verified before commit. Third product repair since Chromium checkpoint563db71. Moon spelling40 starts next with root+peer approved policy and independent8fail32controls; TOOL050 missing-target20 prepared as a separate protective repair, later publication hazards remain open. Whole audit IN PROGRESS, no push/merge.
- 2026-10-24 FE-TEXTURE-LATE-ERROR73f86f6: repeatedRED3/8; final native11/original11/adjacent314 pass, fullfrontend1546passed413skipped, strict types/buildpass. One guard and new11-case test in two-file commit; both reviews approve frozen bytes. Root manifest hash revalidation corrected stdout/stderr filenames and then verified all42 capture hashes immediately after commit; product/review hashes had already matched. Second product repair since Chromium checkpoint563db71. Same-origin AIA33 is next; Moon spelling40 independently reproduces8fail32controls on committed Puck catalog. Whole audit IN PROGRESS, no push/merge.
- 2026-10-24 orbitless0488cd2: permanent18 twiceRED12fail6controls then18pass; immutable12/18/31, adjacent147, root65+18, peer114pass. Fullfrontend1345pass413skip100filespass1skip2.10s; strictsource/scripts/UI/build1.55s pass, existing979.29kB warning retained. Frozenbytes/fidelity/root+peerreviews and gstackPASS. Backendunchanged latest4848pass13skip2warnings160.77s remainscurrent. Oneproductrepair sincecheckpoint; cataloggraph validation next. Threefreshscoped graph/indexrange/failed-init entries retain separate runtime-only qualifications, not defaultUIincidents. WholeauditINPROGRESS; no push/merge.
- 2026-10-24 fifth-repair checkpoint after d998bd1: client metadata c1a8158, producer metadata d516b1b, local policy9dae307, solar continuity35f3230, sampler safety d998bd1. Sampler permanent31 RED17fail14controls twice then31pass; root61plus original31/independent97pass, frozen-hash reviews approved, gstackPASS. Current full frontend1327passed413existing-skipped, strict source/scripts/UI types/build pass; existing979.33kB chunk warning retained. Current backend4848passed13existing-skipped2warnings160.77s remains valid after TS-only change. Unchanged postcommit solarR3/R4 all passes6baseline nodes/kills6mutations. No repairs reverted/gates weakened. User checkout e9052f9/untracked notes preserved; onebranch/serial writer. Next inheritance remains original18=12fail6controls; graph ingress/Hohmann separatelyopen. Inventory452eligiblecontents/980historicalclusters is not980verifiedbugs. Owner decisions/native/deployed/manual acceptance remainopen. Whole audit INPROGRESS; no push/merge.
- 2026-10-24 SOL-HOLE 35f3230: repeated permanent RED 14 failures/20 controls; GREEN 34 plus original 25/34, adjacent backend 285/frontend 414; root independent 155. Full backend 4,848 passed, 13 existing skips, two existing warnings, 160.77s. Both frozen-byte reviews approved; gstack PASS. Unchanged postcommit R3/R4 all mode at exact 35f3230159a20cc3e58d8c56d93f1d805eecbad7 passed six baseline nodes and killed six scientific mutations; manifest pins/thresholds unchanged, separate scoped evidence PASS. Four product repairs since checkpoint; sampler safety now sole writer, then inheritance. New FE036 local Hohmann radius probe retains separate open facet; no blanket compound closure. Whole audit IN PROGRESS; no push or merge.
- 2026-10-24 MIS022 localpolicy 9dae307: repeatedpermanentRED2fail21controls; final23/original23/adjacent110pass, root55 and independentpeer55+27policyrows pass. Fullbackend4814passed13existing-skipped2existingwarnings155.23s; exactconfigreversal/testsuffix and bothfrozenhashreviews approved, gstackPASS. CanonicalMIS022 remainsPARTIAL for its compoundhistoricalclauses. Frontend unchanged: latest1296pass413skip/types/build remains current. Threeproductrepairs since checkpoint; solewriterSOL-HOLE next, unchanged postcommit R3/R4 all remains required. Usercheckout e9052f9/untrackednotes preserved; wholeauditINPROGRESS, no push/merge.
- 2026-10-24 NBW007 producer d516b1b: permanentRED87fail12controls twice; GREEN99 plus original99/91,38additional malformedvalue checks; adjacent458pass1existing-skip; root344independent executions, peer366pass1existing optionalTudatskip. Fullbackend4791passed13existing-skipped2existingwarnings155.60s. Threefrozenhashes approved; only extra existingtest edit is physically equivalent main-AU/day fixture conversion, all assertions untouched. Clientc1a8158 remains separatelyverified1296frontendpass413skip/types/build. Historical mandatorymetadata recommendation remains explicitlypendinglegacycompatibility choice, not blanketclosed. Two productrepairs since lastcheckpoint; MIS022solewriter next. Usercheckoutstille9052f9 with untrackednotes preserved; wholeauditINPROGRESS, no push/merge.
- 2026-10-24 NBW007 client c1a8158: repeated permanentRED77fail26controls; GREEN103 permanent, unchanged95/103originals,56adjacent; root159plus original103,peer262. Fullfrontend1296passed413existing-skipped,98filespassed1skipped; strictsource/scripts/UI and productionbuild pass, existing978.96kB warning retained. All34assertion sites/lifecycle unchanged; matchinghashreviews and gstackPASS. Backend unchanged: latestfull4692pass13skip2warnings155.33s remains current. Latest producer99 still87fail12controls; sole backend repair now underway separately. No mandatorymetadata/nativephysics/mainhookup claim. One productrepair since lastfive-repaircheckpoint; wholeauditINPROGRESS, no push/merge.
- 2026-10-24 fifth-repair checkpoint afterb954797: NBW05467f5617, TOOL051cebc409, TOOL060inlinea134498, TOOL060diagnostics59ceb10, MOON033b954797. MOON permanentRED12fail18controls twice; GREEN30/original30/adjacent63, root63+original30; first9 parser characterizations unchanged, final2 intended improvements. Latest full frontend1,193pass413skip, strictsource/scripts/UI and build pass; unchanged978.96kB mainchunk warning. Latest full backend4,692pass13skip2existingwarnings155.33s remains current because subsequent product change is frontendonly. Both frozenhash reviews each repair; no gates/tolerances weakened and no repair reverts. Active branch clean after exact2file MOONcommit; user checkout stille9052f9 with its untrackednotes preserved. Inventory452sourcecontents/980historicalclusters remains bounded, not980verifiedbugs. Continue serial clientmetadata then producermetadata/MIS022/solar work; owner licence/data/native/deployed/manualacceptance decisions remain open. WholeauditINPROGRESS; no push/merge.
- 2026-10-24 TOOL060 Part2 59ceb10: permanent RED3fail/34controls twice; GREEN37 permanent, original8+older1,166adjacent, originalPart1 29, root independent46. Full pinned backend4,692pass/13skip/two existing warnings155.33s. Eight gstack captures PASS/open[], both matching-hash reviews approved, Part1 preserved. Exact outer diagnostic redaction only; intentional success/rawJSON and causes remain unchanged. Next serialMOON033 cursor fix; no backend changes pending and no push/merge.
- 2026-10-24 TOOL060 Part1 a134498: permanent RED16fail/13controls twice, GREEN29 permanent/29 unchanged original/158 adjacent, root independent58. Full pinned backend4,684pass/13skip/two existing warnings155.25s; both matching-hash reviews approved. Exact two-file fix preserves all API/model/Part2 code. TOOL051 cebc409 separately passed full frontend1,163/413skips, strict source/scripts/UI checks and build with existing bundle warning; no frontend changes since. NBW007 refined candidates remain open at client73fail/22controls, producer83fail/8controls. Next serial Part2 default-diagnostic redaction; whole auditINPROGRESS, no push/merge.
- 2026-10-24 NBW-05467f5617: originalRED39fail/60controls twice; reviewadded9domainerrorRED twice, final108focused/unchanged99/literalprobe/327adjacent12skip pass. Root288pass9skip plus1400finite cases and9exactbaseline dictionaries, matching-hash peerapproval. Full pinned backend4,655pass13skip2existingwarnings154.32s; gstack16capturesPASS. Rejected unguarded patch never committed; no tolerance or gate weakening. FreshMOON03312fail18controls and NBW007 metadata client69fail14controls/producer76fail6controls are separately recordedOPEN. Next serial TOOL051 nativeCLI repair, no push/merge.
- 2026-10-24 fifth-repair checkpoint afterbbd9e9d: Gaia query9ab2e43, static9e02c0e, exactseed51bc04d, HTTPboundsb475a6e, plantcostbbd9e9d. MIS-012 RED13fail/27controls twice; GREEN40 permanent/unchangedoriginal40,287adjacent, root220; full pinned backend4,547passed/13skipped/twoexistingwarnings154.51s. Exact4file hashes match both reviews; gstack10capturesPASS/open[]. Only obsolete PartA plant-floor literals adapted; qualified original43/oneexcluded versus complete permanent44. No tests/gates silently weakened. No frontend changed since1,161pass/413skip/types/build and actual-mainNow browser gate. Native engines/deployed acceptance and owner decisions remain unclaimed. No repair reverted; one branch/serial product writer, no push/merge. NBW054 next approved root; whole auditINPROGRESS.
- 2026-10-24 MIS-010 HTTP-range/MIS-011 clarification b475a6e: repeatedRED15fail/29controls; permanent44 and unchangedoriginal44pass,247adjacent, root160; full backend4,507passed/13skipped/twoexistingwarnings154.30s. Exactly five published Field bounds now match existing modeled limits through shared constants; service algorithms, seed normalization, direct vehicle sub1 behavior, standalone risk50000 and configurable upper413 remain unchanged. Both independent reviews match final hashes; gstack8capturesPASS. Existing direct test assertions retained and labelled; MIS-012 was separately repaired later inbbd9e9d; see its scoped evidence. Narrow report credential-pattern count check found no matches; this is a heuristic, not a complete secret audit.
- 2026-10-24 MIS-010-SEED51bc04d: repeatedRED9fail/22controls; GREEN31focused, unchangedoriginal31,172adjacent, root110; full pinned backend4,463passed/13skipped/twoexistingwarnings154.23s. Matching-hash root/science reviews and gstack8capturesPASS. Only seed normalization changed; sharedcountfallbacks and standaloneRandom contract preserved. CanonicalMIS-010 remainsPARTIALLY_FIXED for the five separate HTTP-bound rewrites; PartA red15/29 was independently reconfirmed before implementation. Also reconciled Gaia cross-links to later static9e02c0e instead of leaving obsolete open labels.
- 2026-10-24 TOOL-GAIA-STATIC-MAGNITUDE9e02c0e: expandedRED11fail/101controls twice; GREEN112focused,51adjacent, root147; unchangedstatic11, priorquery16 (one known wrong behavior excluded), adaptedEXO46 pass. Full pinned backend4,432passed/13skipped/twoexistingwarnings156.25s, both reviews match final hashes, gstackPASS. Staticfirstmiss selection is now separately fixed, with brightcachegeneration3; queryidentity remains its own9ab2e43 commit. Fresh mission preparation separately reproduced integer-seed9fail/22controls and HTTP/directplant28fail/50controls; serial seed repair next. Whole audit remainsINPROGRESS, no push/merge.
- 2026-10-24 TOOL-057 Gaia facet9ab2e43: semantic RED18failed/61controls twice;15 new-helper failures labelled separately. GREEN94focused,51adjacent, root118; originalquery16 with one wrong-behavior characterization excluded; EXO46 with only current-filename assertion adapted. Full pinned backend4,414passed/13skipped/twoexistingwarnings155.35s, gstackPASS and both matching-hash reviews approved. Together withSBDBc0ee926 closes the actual current query-cache consumers. Fresh root static candidate remains5failed/6controls on this commit; new TOOL-GAIA-STATIC-MAGNITUDE explicitly keeps that separate first-miss bug open. No frontend edits since1,161pass/413skip/types/build/Now browser gate.
- 2026-10-24 EXO-026 eddb253: repeatedRED22failed/24controls; GREEN46focused,51adjacent, unchangedcandidate46 and originalrootprobe; root independent70. Full pinned backend4,366passed/13skipped/twoexistingwarnings154.80s, matching-hash reviews approved and gstackproofPASS. This completes five serial repairs since the prior checkpoint: Retry-After9df74a5,SBDBc0ee926,forcewrapper4b23c95,Nowab2feb6,GaiaIDeddb253. Current frontend1,161pass/413skip/types/build and actualfull-mainNow browser evidence remain valid because no frontend changed since. No repair reverted; scopedresiduals/blockedexternaldecisions retained. Continue single product writer and per-bug commits; no push/merge.
- 2026-10-24 SDEL-060 Now facet ab2feb6: RED 4 failed/19 passed; GREEN 23 focused, 564 adjacent, full frontend 1,161 passed/413 skipped; strict source/UI and production build pass, existing978.96kB bundle warning retained. Root independently23+originalprobe; matching-hash independent review approved. Real full-main Chromium156 aborts/rekeys at newTDB after Now while paused/rate4 unchanged; local routes only, owned resources closed. Browser oracle corrected from preliminary UTC to TDB and qualified rather than claiming identical harness bytes. CanonicalSDEL-060 now closes only after separate wrapper and activeNow fixes, not by alias inheritance.
- 2026-10-24 FE-PHYSICS-FORCE 4b23c95: RED 11 failed/4 passed; GREEN 15 focused, 411 adjacent, full frontend 1,154 passed/413 skipped; strict source/UI types pass. Root independently reran 15 and four original current-source probe sequences; matching-hash independent reviews approved. Corrected SDEL-060 routing to partial so the actual Now UI integration R0052 stays open, rather than inheriting the wrapper-only repair. No native browser/GPU or expanded solar scientific acceptance claimed.
- 2026-10-24 TOOL-057 SBDB facet c0ee926: two RED runs 10 failed/7 passed, focused/original replay 17 passed, adjacent 30 passed, root independent 44 passed; full pinned backend 4,320 passed/13 skipped/two existing warnings in 156.50s. Complete request+endpoint cache identity, unchanged 168-hour freshness/decoder and legacy nonmutation verified by real temporary files. Broad root remains partial for Gaia. Also corrected FE-AIA-SAME-ORIGIN reach after fresh root probe: explicit empty helper base fails, but current main default resolves to an absolute page origin and builds its URL correctly.
- 2026-10-24 SDEL-017 9df74a5: repeated RED 9 failed/12 passed; GREEN 21 focused, 297 adjacent, full pinned backend 4,303 passed/13 skipped/two warnings in 156.22s. Root independently 91 backend and 146 client cases pass. Actual Chromium 156 credentialed allowed-origin fetch reads timeout/saturation Retry-After2; invalid-result hint remains null and foreign origins remain blocked. Matching-hash independent review approved. Separately corrected R1060 compound generic500/timeout/code claims and the SDEL-066/R1011 false blanket closure: explicit texture force remains guarded out even though per-frame observation retries no longer depend on physics success.
- 2026-10-24 SDEL-016 6cea825 supersedes its earlier RED below: 102 focused and root replay passed, 289 adjacent passed, full pinned backend 4,289 passed/13 skipped/two existing warnings in 155.83s. Native Chromium allowed-origin fetch reads sanitized 500 with private/no-store; untrusted remains unreadable, original errors remain logged once each. Exact harness and independent review hashes are retained in the scoped repair entry. This is the fifth serial repair since the prior gstack checkpoint: diagnostic probe, delivery deadline, handling defaults, finite options, generic HTTP CORS. No repair reverts or unrelated source changes; remaining retry hints, wrapper ownership, cache/data/tooling and science facets stay queued. Continue one product writer and one bug per commit.
- 2026-10-24 FE-PHYSICS-OPTIONS 8136d86: RED9 failed/137 passed; GREEN146 focused,396 adjacent,1,139 frontend passed/413 skipped. Strict source/UI types pass; root146 independently passes; review hashes match. Finite input coercions and clamps unchanged; infinities now deliberately reject. Original probe's expected newly guarded exit1 is distinguished from the complete supplemental replay exit0.
- 2026-10-24 SDEL-016 native-browser RED on8136d86: Chromium156.0.8078.4 credentialed fetch to the actual app's controlled unexpected500 fails from both allowed and untrusted page origins. The allowed-origin failure reproduces missing CORS error headers; untrusted refusal is a control. Two original RuntimeErrors remain logged by owned Uvicorn. Three ephemeral loopback servers stopped cleanly, no provider calls. Probe:/tmp/solar-sdel016-browser-20261024.py; receipt:/tmp/solar-sdel016-browser-red-20261024.json. Repair remains pending; no deployed acceptance inferred.
- 2026-10-24 MIS-031e960bff: exact native RED4 failed/21 controls passed, GREEN25 focused and114 adjacent; root independently114. Full pinned backend4,255 passed/13 skipped/two existing warnings in155.46s. Product change is two omitted-default literals only; final hashes match independent review and original-source/current replay. Active planner already explicitly uses4%, so no new default-planner output correction is claimed.
- 2026-10-24 FE-PHYSICS-DEADLINE58b7f1c: original RED25/76 and separate review RED5/101; final106 focused,356 adjacent,1,099 frontend passed/413 skipped, strict source/UI types pass. Root106 and13 independent public sequences pass. Deadline is monotonic20s across fetch/body; fetch diagnosis remains separately bounded up-to4s. Corrected SDEL-075 title/raw cross-links: historical2.6s cold-start and prior0/6 verification records do not equal the current non-cooperating-delivery root or prove current browser incidence.
- 2026-10-24 FE-UNBOUNDED-PROBE4b347eb: RED20 failures/48 passes; final69 focused, full pinned frontend1,062 passed/413 skipped, strict source/UI types pass. Root original ten public sequences and final69 tests independently pass; second review matched final bytes. Captured backend ownership, bounded two-second probes, cancellation settlement and stale-cache isolation fixed. Main fetch/body delivery settlement remains separately open.
- 2026-10-24 MIS-020 postcommit original-source comparison: c24b5de all-failed rocket reports1000/1000/1000kg versus current0/0/0kg with unchanged failure probability1; dispersed p951798.5307839187794kg becomes1000kg, exactly the evaluated cargo cap. All30 callback arguments and other envelopes match. Nine postcommit native tests pass. Value/proof record:/tmp/solar-mis020-regression-record-20261024.md and companionJSON. This supersedes only the realized-yield open status in the historical e242c24 recheck below.
- 2026-10-24 MIS-020 returned-yield repair9b7f9fd: RED7 intended failures/2 controls; GREEN9 focused,68 adjacent; root independently68 passed. Full pinned backend4,230 passed/13 skipped/two warnings in155.09s, exit0. Final hashes match both reviews. Actual failed-rocket and real planner regressions included; RNG, closure callbacks, failure probability, other envelopes and nominal scoring unchanged. Broader historical risk-model clauses remain separately scoped.
- 2026-10-24 BKP-028 Linux-only repair ac36cd7: two original RED runs16 failed/2 passed; final20 focused and177 adjacent GREEN; root independent20 passed. Full pinned backend4,223 passed/13 skipped/two dependency warnings in155.59s, exit0. Final product/test/fixture hashes match independent review. Native fixtures kill only exact owned pidfd targets and reap all descendants. Non-Linux and pre-entry containment remain unverified/unfixed, so the broad finding is PARTIALLY_FIXED.
- 2026-10-24 independent open-issue rechecks at e242c24: actual TestClient /solar/physics with an allowed Origin and unexpected runner RuntimeError returns generic500 without ACAO; typed timeout503 has no Retry-After; saturation503 has Retry-After2 but no exposed headers. No private error marker leaked. SDEL-016/017 remain open, distinct from Origin authorization policy. Actual default-vehicle [6,9]km/s Monte Carlo closure fails all30 zero-uncertainty samples yet reports returned-yield quantiles1000kg; a separate positive-dispersion control reports p951798.53kg although reclose cargo is capped at1000kg. MIS-020 realized-yield repair remains open. Read-only plans: /tmp/solar-sdel016-017-prep-20261024.md and /tmp/solar-mis020-repair-plan-20261024.md.
- 2026-10-24 FE-ERROR-BODY-TIMEOUT commit0feaba9: exact RED2 failed/43 passed; GREEN45 focused and295 adjacent; full pinned frontend1,038 passed/413 skipped. Strict source and UI types exit0. Root independent45 tests passed and final hashes matched receipt. Classification repair only; separate promise/probe ownership residuals remain open.
- 2026-10-24 F-TRJ-11-GRID commit2108a61: original3 behavioral RED failures;58 focused and152 adjacent GREEN, root independently152 passed. Full pinned backend4,203 passed/13 skipped/two warnings in153.36s, exit0. All four source/test hashes unchanged across final runs. No solver, tolerance, source data, resource cap or provider-policy changes.
- 2026-10-24 BKP-025 detached-process repair93e20d3: corrected exact RED10 failed/9 passed, GREEN19 passed/23 deselected; adjacent270 passed, root52 passed. Full pinned backend4,158 passed/13 skipped/two warnings in152.41s, exit0. Native spawned-child cancellation and quarantine/admission regressions included; no native-GPU or science-accuracy claim. CollectorPASS at /tmp/solar-bkp025b-evidence/qa-report-bkp025b.md; final changed-file hashes matched root verification.
- 2026-10-24 BKP-025 HTTP-boundary repair944eea8: exact original filtered replay7 passed/3 deselected; complete new regression module10 passed, adjacent253 passed. Full pinned backend4,141 passed/13 skipped/two warnings in149.28s. Root independent88 and second-review10 tests passed; source hashes unchanged throughout final verification. Actual Uvicorn h11 log channel covered on an owned loopback ephemeral port, not a deployed server.
- 2026-10-24 NBW-007 numerical guard at994d725: full pinned Python3.12.13 backend4,131 passed/13 skipped/two dependency warnings in168.54s; final three-file hashes and raw outputs retained in /tmp/solar-nbw007a-evidence. Root independently replayed132 related tests. Metadata/protocol follow-up remains open.
- 2026-10-24 complete Chromium156 browser suite after MOON-056 repairs:43 passed, one native hidden-tab test skipped in4.2minutes, exit0. Test-owned local Vite port4298, pinned Node22.23.2, SwiftShader software GL; native200% and400% tab-zoom evidence verified real browser zoom and keyboard reachability. Outputs: test-results/4298. No live deployed backend, hardware GPU, manual assistive-technology or native hidden-tab acceptance inferred.
- 2026-10-24 MOON-056 final pinned Node22.23.2 acceptance: 1,032 frontend tests passed, 413 skipped; strict source and UI TypeScript exited0. Root independently replayed141 moon cases. All five numerical artifact SHA-256 values unchanged;13 shipped-model positive controls pass. Separate commits bf92467 and f02d63e cover endpoint bounds then certificate consistency.
- 2026-10-24 SOL-HALE committed HEAD 3fa05a0ebf8b0521ffe9a4c3ccb6eb6221b8a1aa: pinned offline R3/R4 all lane passed six baselines and killed six mutants, exit 0. Manifest SHA-256 8ecad4544f9a56e664b8d237d03a17f10d60dae527e8ee4ea5923a88b02dc1dc. Full backend final product bytes 4,051 passed/13 skipped/two warnings in147.22s; final continuity-test strengthening independently replayed by root, 168 passed. Frontend901 passed/413 skipped. No observed-provider accuracy acceptance inferred.
- 2026-10-24 TOOL-105 exact committed HEAD 29e87e0496419cae47f7136f9d01d403b5792c31: pinned offline R3/R4 all lane passed six baseline nodes and killed all six mutations, exit 0. Manifest SHA-256 3f1547aba74982472fa7913ded66cd7c7e0114699d2bf09f53e255caadf8c36b. Numerical gates, immutable fixtures and mutant definitions unchanged. This supersedes the earlier stale-pin failure; subsequent science source edits require fresh pin/gate verification.
- 2026-10-24 BKP-031: final product full backend run 4,042 passed, 13 skipped, two dependency warnings, exit 0 in 156.49s. Final strengthened test-only revision: 178 focused tests passed; root independently reran 78 tests successfully. No live Horizons availability or real Earth coverage cutoff is inferred from the synthetic refusal fixture.
- 2026-10-24 SMB-061 acceptance on pinned Node22.23.2/npm10.9.8:901 frontend tests passed,413 skipped; strictTypeScript exit0; production build exit0 with existing977.36kB mainchunk warning. Root independently reran39 adjacent tests. Receipt:/tmp/solar-smb061-verification-pinned-20261024.json includes fileSHA256 and complete output. Original Node24 run is retained separately, not substituted for pinned acceptance.
- 2026-10-24 R3/R4 verifier negative-control suite:40 passed. Six mutation patches apply to current source, but the manifest has one stale pfss_magnetogram.py source hash; full scientific mutation acceptance remains pending reconciliation, not closed by these harness tests.
- 2026-10-24 final MIS-033 backend run:4024 passed,13 skipped,2 dependency deprecation warnings in165.06s; Python3.12 offline pinned requirements, exit0. Root separately reran47 mission contract tests:pass.
- 2026-10-24 Chromium156 software SwiftShader suite:41 passed,1 skipped,2 failed in7.0m. Both failures are pending-warmup fault-injection tests that assume unavailable KHR_parallel_shader_compile; independent capability probe confirmed extension absent and WEBGL_lose_context present. Harness repair pending; no hardware-GPU acceptance inferred.
- 2026-10-24 baseline npm test: 91 test files passed, one skipped; 881 tests passed, 413 skipped. Node 24.21.0/npm 11.19.0 (not pinned; rerun on pinned toolchain before final gates).
- Pinned cached Node 22.23.2 and npm 10.9.8 located and version-checked.
- Aside absent; gstack packaged browser unavailable because its package.json is missing. Existing project Playwright browsers are available for browser regression execution; gstack interactive exploration remains unavailable. No gstack installation or upgrade authorized.
- 2026-10-24 FE-WORKER-PARENT aa5a286: repeated permanent RED 31 failures/37 controls; GREEN 68 and original 43/68, 233 adjacent tests, independent root 128 and peer 196. Full frontend 1,413 passed/413 skipped; types/build pass. Both final reviews approve exact five files; 60 manifest-linked hashes verified before commit. This closes the narrow FE075 dangling-parent/graph ingress claim, not source-index range or general initialization atomicity. Second product repair since checkpoint a431ffa; range repair next. Whole audit IN PROGRESS; no push or merge.
- 2026-10-24 FE-WORKER-SOURCE-INDEX-RANGE eedeb5b: repeated RED8/12; GREEN20, original20 and adjacent253. Root94 and peer47 independent passes; full frontend1,433 passed/413 skipped, strict types/build pass. One-clause source repair in its own two-file commit. Third repair since checkpoint a431ffa; worker initialization transaction next. MOON014 preparation corrected unsupported one-fit claim; raw provenance and compound spelling/scientific claims remain separate. Whole audit IN PROGRESS, no push/merge.
- 2026-10-24 FE-WORKER-INIT-ATOMICITY 2d18c8e: repeatedRED6/4; GREEN10 plus originals8/10 and adjacent263; root99/peer41 independent passes. Full frontend1,443 passed/413 skipped; strict types/build pass. Both reviews approve exact two files; 33 capture hashes and scoped PASS evidence verified. Fourth repair since checkpoint a431ffa; local Hohmann radius repair next. Newly reproduced texture late-error lifecycle and primary-source-backed moon spelling facets remain separately queued. Whole audit IN PROGRESS, no push/merge.
- 2026-10-24 FE-LOCAL-HOHMANN-RADIUS d97e8df: original49 RED25/24 twice; review caught introduced shared-vector read-order regression before commit, supplemented3 controls reproduced3/49 twice, corrected final52 pass. Original probes165, adjacent315, root165 and peer153 pass. Full frontend1,495 passed/413 skipped; strict types/build pass.66 captured receipt/output hashes verified; archive INCONCLUSIVE exact-command bookkeeping explicitly retained, final captures015–022 pass. Fifth repair since a431ffa; both reproduced FE036/R0216 facets resolved, unknown-ID clause not reproduced.
- 2026-10-24 fifth-repair Chromium checkpoint on frozen Hohmann0c30dbcd/test98836197:43passed1existing native-display skip/44registered,0unexpected/0flaky,247900.198ms. Playwright1.64.0/Chrome156/SwiftShader; no hardware/live-science/all126 claim. Source/config/browser hashes unchanged before/after; root committed exact bytes during run. Port4329 closed and all11 owned PIDs/profiles cleared normally. Receipt /tmp/solar-fifth-repair-chromium-receipt-20261024.json; materialized scoped PASS. Last full backend4,848 passed/13 skipped at35f3230 remains applicable to later frontend-only changes. Next serial repair MOON-RUNTIME-PUCK; whole audit IN PROGRESS, no push/merge.
- 2026-10-24 MOON-RUNTIME-PUCK4307b8d: repeated39 RED13/26 and append-only40 RED14/26, GREEN40 plus immutable31/39/40. Adjacent468pass411skip, root164 and peer231 passes; fullfrontend1,535passed413skipped, types/buildpass73modules1.56s. Seven-file atomic commit,42capture hashes and exactproduct/review/evidence checks. Raw424/all-source424 retained; runtime423moons/433total; defaultworker10/490bytes. First product repair after Chromium checkpoint563db71; texture late-error next. MOON014 remains partial pending spelling, with unrelated historical numerical claims explicitly separated. Whole audit IN PROGRESS; no push/merge.
- Five-cluster fresh reconciliation: author6frontend+2backend factual characterizations pass, independent same8 pass. Root read original tests/report/inventory generator and full independent checker, reran123hashes/15sourcepins/62graphinputs/6immutableprovenance/5canonical mappings successfully. H2.7 disagreement corrected specifically to30-second cadence, not all cadences. Independent review supports separate one-line active-trajectory documentation correction. Author archive INCONCLUSIVE retains setup002 missingAny; reviewer archive INCONCLUSIVE retains strict003 root-ledger drift, qualified004 passes. Both open[]; no product/source edits, actual spawned solver, browser, provider, new scientific timing or threshold. Receipts: /tmp/solar-unverified-cluster-shortlist-20261024.json (4a9bef3e7283f718bd565f68bf819d23b212e50b38e95c86fe84d3efe540e914) and /tmp/solar-unverified-cluster-science-independent-review-20261024.json (83660461d9ec1d069374521780d179c0471949b708d827437ece7e77a1e0ba59).

    ## Fresh findings and repair ledger

> [table: 143 rows moved to the register: PLAN-021 … SMB-057]
| ID | State | Severity / reach | Evidence and next action | Repair |

    ### Code and verification references

These references belong to the scoped fresh findings above, not blanket closure of historical aliases. Committed source/tests and repair commits are the durable record. Local `/tmp` plans, probes and execution receipts are retained workspace evidence, not committed artifacts; non-path historical descriptions remain plain text.

> [table: 143 rows moved to the register: PLAN-021 … SMB-057]
| Finding | Code, source and verification references |

    ## Domain verification register

These are scoped title/subclaim assessments on the integrated audit branch. They do not automatically close every alias in a corrupt historical cluster. “Partial”, “unverified” and reassigned rows remain work; dormant callable defects are retained. Test results establish only their actual assertions, not physical accuracy or unavailable native acceptance. Original domain status wording is preserved to avoid turning a qualified result into a stronger claim.

> [table: 1029 rows moved to the register: NBW-001 … EXO-031]
| ID | Domain | Scoped current assessment | Evidence / limits | Next action / verification |

    ### Domain execution evidence

- {"skill":"gstack QA functional-only; isolated fixtures, finite60000ms probes, baseline+replay","directory":"/tmp/solar-markdown-backend-evidence","probe":"/tmp/solar-markdown-backend-probe.py","regression_capture":"014","regression_result":"341 passed,9 skipped,2 warnings in14.31s","environment":"uv run --offline --python3.12 --with-requirements ci/backend-test-requirements.txt; Python3.12/Astropy8.0.1 cached environment","live_network":false}
- [{"command":"node node_modules/vitest/vitest.mjs run src/sim/moonCatalogRepair.horizons.test.ts src/sim/moonFrames.horizons.test.ts src/sim/moonEphemeris.test.ts src/sim/moonSourceExceptionIndependentReview.test.ts src/sim/orbitMath.accuracy.test.ts src/sim/sourceFrameOrbit.test.ts src/sim/catalog.test.ts --reporter=default","result":"112passed,411skipped;7files"},{"command":"uv run --offline --no-project --python 3.12.13 --with-requirements ci/backend-test-requirements.txt python -m pytest -q backend/tests/test_secular_ephemeris.py backend/tests/test_fallback_ephemeris_accuracy.py backend/tests/test_all_moon_oracle_coverage.py scripts/test_catalog_generation.py scripts/test_catalog_science_review.py scripts/test_moon_source_exception_independent_review.py scripts/test_moon_source_exceptions.py scripts/test_moon_repairs.py","result":"488passed,3skipped;23.21s"},{"command":"node node_modules/vitest/vitest.mjs run src/sim/phase1AsteroidCatalog.test.ts src/sim/phase1AsteroidCatalog.lifecycle.test.ts src/sim/phase1AsteroidCatalog.startup.test.ts src/data/asteroidCatalogLoader.test.ts scripts/phase1-catalog-artifacts.test.mjs src/sim/asteroids/asteroidDistributions.test.ts src/sim/kuiperBelt.horizons.test.ts src/sim/secularRemediation.test.ts src/sim/orbitMath.test.ts --reporter=default","result":"78passed;9files"},{"command":"Pinned Node22/Vitest: src/main.catalogVisibility.test.ts src/main.focusBody.test.ts src/sim/solarSystemModel.test.ts src/sim/catalog.test.ts src/sim/planetPositions.horizons.test.ts src/sim/secularRemediation.test.ts src/frontend/app/stateStore.test.ts src/frontend/app/localSystemRenderer.disposal.test.ts","result":"8 files,114passed,0skipped; plus read-only module probes and in-memory Vite build","receipt":"/tmp/solar-moon-render-recheck-20261024.json"}]
- {"targeted":{"kind":"runtime","captures":["/tmp/solar-markdown-solar-probes.k54phJ/.qa-evidence/001/observation.json","/tmp/solar-markdown-solar-probes.k54phJ/.qa-evidence/009/observation.json"],"result":"709 targeted solar contracts passed in 5.00 s; broader 2163 PFSS/WSA/GONG/time/realtime/AIA/determinism tests passed in 38.04 s, no skips.","limits":"Contract tests are not observed calibration or rendered browser acceptance."},"degree15":"/tmp/solar-markdown-solar-probes.k54phJ/current-degree15-comparison.json","reproductionFile":"/tmp/solar-markdown-solar-probes.k54phJ/test_remaining_claims.py","evidenceRoot":"/tmp/solar-markdown-solar-probes.k54phJ"}
- Pinned Node 22.23.2: vitest run src/frontend/features/superluminal-modeling => 5 files, 37 tests passed, 2026-10-24. Full 888-test frontend suite also passed earlier. Native browser run: 41 passed, 1 skipped, 2 warmup-harness failures. No new astrophysical accuracy acceptance inferred.
- Pinned Node22.23.2: quadtreeLOD, Phase1 catalog/lifecycle/startup and asteroid feature suites: 9 files,58 tests passed, exit0 on 2026-10-24. Source inspection is distinguished from visual/scientific acceptance below.
- {"backend":"224passed,2warnings","launchers":"22passed","new_reproduced_residuals":["BKP025 ASGI sentinel escape","PEER-g long basename and directory-overwrite500"],"limits":["No live Uvicorn log capture","No parent SIGKILL probe","No remote deployment acceptance","No unbounded resource exhaustion"]}

    ### Distinct solar findings

> [table: 31 rows moved to the register: SOL-DEGREE15]
| ID | State / claim | Evidence | Repair boundary |

    ### Distinct frontend findings

> [table: 86 rows moved to the register: rows without an id]
| ID | State / claim | Evidence | Repair boundary |

Finding IDs shared with the solar register are listed once above; frontend title rows retain their scoped evidence.

    ### Corrected raw-claim routing

The following independent claim texts were found under unrelated historical titles. The correction routes evidence; it does not inherit a neighbouring title’s verdict.

> [table: 127 rows moved to the register: N0137 … R0194]
| Original key | Incorrect cluster | Correct scoped assessment | Original source / claim |

    ### Fresh peer-report semantic crosswalk

These whole-request checks supersede broader historical title-only closure where explicitly corrected. They distinguish helper cancellation from quiet ASGI completion, NUL rejection from other invalid paths, and default loopback safety from explicit network deployment policy.

> [table: 7 rows moved to the register: rows without an id]
| Original ID / canonical mapping | Current state | Actual evidence / limits | Remaining action |

    ### Deleted October 6 reviewer residuals: fresh facet verification

The following clauses lacked a reliable historical-ID match. They were checked directly, with original full text preserved below. Their original broad claims are not treated as one indivisible bug.

Metadata probes were captured at `29e87e0`; later repairs advanced the model identifier. The current short-description repair and retained v6 compatibility identifier are recorded separately under SOL-NAMING; historical facet text below is not a new claim about the current suffix.

> [table: 11 rows moved to the register: rows without an id]
| Facet | Current status | Current evidence / limits | Repair boundary |

Domain outputs and source-coverage gaps continue to be reconciled. A title marked fixed does not close unrelated raw claims, and an unlisted issue is not proof of absence.

    ## Historical claim crosswalk (verification queue)

Every row below is a source cluster to check, not an endorsement of the old finding. Source aliases preserve the original document and issue IDs. Detailed original claims remain available at the hashed sources in the inventory; the full v2 ledger is a supplemental extraction aid, not authoritative current status.

    ### SOLAR_PFSS

> [table: 66 rows moved to the register: PFSS-001 … PFSS-066]
| ID | Historical claim | Current audit state | Original source aliases |

    ### SOLAR_MODEL_VISUALS

> [table: 112 rows moved to the register: SVIS-001 … SVIS-112]
| ID | Historical claim | Current audit state | Original source aliases |

    ### SOLAR_DELIVERY

> [table: 112 rows moved to the register: SDEL-001 … SDEL-112]
| ID | Historical claim | Current audit state | Original source aliases |

    ### PLANETS_TIME

> [table: 39 rows moved to the register: PLAN-001 … PLAN-039]
| ID | Historical claim | Current audit state | Original source aliases |

    ### MOONS

> [table: 75 rows moved to the register: MOON-001 … MOON-075]
| ID | Historical claim | Current audit state | Original source aliases |

    ### SMALL_BODIES

> [table: 98 rows moved to the register: SMB-001 … SMB-098]
| ID | Historical claim | Current audit state | Original source aliases |

    ### NBODY_WS

> [table: 79 rows moved to the register: NBW-001 … NBW-079]
| ID | Historical claim | Current audit state | Original source aliases |

    ### TRAJECTORY

> [table: 71 rows moved to the register: TRAJ-001 … TRAJ-071]
| ID | Historical claim | Current audit state | Original source aliases |

    ### MISSION_BENCHMARK

> [table: 41 rows moved to the register: MIS-001 … MIS-041]
| ID | Historical claim | Current audit state | Original source aliases |

    ### BACKEND_PLATFORM

> [table: 38 rows moved to the register: BKP-001 … BKP-038]
| ID | Historical claim | Current audit state | Original source aliases |

    ### FRONTEND_APP

> [table: 95 rows moved to the register: FE-001 … FE-095]
| ID | Historical claim | Current audit state | Original source aliases |

    ### EXOTIC

> [table: 41 rows moved to the register: EXO-001 … EXO-041]
| ID | Historical claim | Current audit state | Original source aliases |

    ### TOOLING_DOCS

> [table: 112 rows moved to the register: TOOL-001 … TOOL-113]
| ID | Historical claim | Current audit state | Original source aliases |

    ## Original source claims (independent of cluster labels)

The inherited extraction has incorrectly associated some new source claims with unrelated cluster titles. To avoid silently losing or misclosing those findings, all unique extracted claim texts are preserved here independently. Their original status is historical, not the current audit verdict. Claims duplicated verbatim under the same source/key are represented once.

> [table: 3016 rows moved to the register: R0046 … P072]
| Original key | Document / date | Historical status | Original claim text |

    ## Additional source findings omitted by the inherited ledger

The main-checkout B report, peer-branch notes and deleted October 6 reviewer appendix were not fully represented in the historical extraction. Their full issue sections are retained here, with exact source hash and line. A matching inherited commit is not an independent reproduction. Historical instructions inside these quotations are evidence, not authorization to weaken gates or change product scope.

> [table: 177 rows moved to the register: B010 … F-REPO-17]
| Original ID | Source / line / SHA-256 | Current coverage state | Original issue section |

    ## Prior B-report repair crosswalk

These fixes are inherited, not new audit commits. The fresh complete frontend test run above does not prove every backend reproduction; backend and browser rechecks are tracked separately.

> [table: 63 rows moved to the register: rows without an id]
| Commit | Original bug / repair |

    ## Source inventory

A source number identifies one content SHA-256, not one physical copy. “Baseline” means the exact content exists in the audited worktree. A `git:<blob>:<path>` source can be recovered with `git show <blob>`. Source date reasons are evidence of inclusion, not a claim of filesystem birth. Variant count includes all recorded source locations; identical copies are not reread as independent evidence.

> [table: 452 rows moved to the register: D001 … D452]
| Source | SHA-256 | Lines | Baseline | Date evidence | Representative location | Locations | Claim coverage (not runtime verification) |

    ## External acceptance boundaries

- Original-code licence and commercial/noncommercial distribution policy require an owner decision; third-party notices do not grant missing Deimos redistribution rights.
- Manual screen-reader and real-touch acceptance cannot be inferred from DOM tests. Remote TLS/auth/proxy acceptance requires a specified deployed target and authorization.
- Numerical regression success is separate from observed-provider calibration and scientific validation. Missing reference data cannot be replaced by a fabricated oracle.
- The current default visualization is the local simulation path; the retained SimulationClient is intentionally API/library-only. This audit does not silently change that product decision.


## Source `remediation-status-2026-10-30`: `agent-notes/REMEDIATION_STATUS_2026-10-30.md`

    # Remediation status and note retirement — 2026-10-30

**The complete remediation effort remains open.** All **83 canonical items** and
**46 original remediation-note filenames / 62 versions** have current dispositions.
**75 scoped fixes are verified on this construction branch; eight items remain
partial.** This does not declare those fixes merged into main or certify every
adjacent scientific capability, device or deployment.

**25 completed working notes were removed after independent final review.**
Twenty incomplete original working notes remain, together with the historical
browser-source copy and the dated October 29 review. Every retired note retains
its original content identity, Git revision, original requirements, assigned
children, executed proof and source/lock identity in the
[retirement register](REMEDIATION_COMPLETION_2026-10-30_EVIDENCE/note-retirement.json).
The original source copies and immutable archives are retained.

    ## 2026-11-07 follow-up: re-check, PRs #45–#47 and related items

- **Now on `main`.** This record's code checkpoint, `09421c9`, is an ancestor of `main`, so the caveat above that
  these fixes are not merged into main is out of date.
- **What the 2026-11-06 re-check covered.** It re-ran the original reproductions on `main` (`8e75993`) for SCN-001–040
  only:
  - 31 hold, including SCN-029: both workflows run on pushes and pull requests and passed on `main`.
  - 4 are closed by the accepted policies.
  - SCN-005, SCN-030 and SCN-035 stay partial, as listed below.
  - SCN-033 and SCN-040 were incomplete.
- **Backend suite.** A clean install from `ci/backend-test-requirements.txt` ran the full suite on `main`:
  **5,833 passed, 13 skipped**.
- **Unchanged.** The 2026-10-30 counts and tables below are left as recorded.

**Update 2026-11-09.** All three are merged: #46 and #47 on 2026-11-08, and #45 on 2026-11-09. #45 also covers a
fourth script, `generate_mga_reference.py`. The table below is as of 2026-11-07.

> [table: 3 rows moved to the register: SCN-033 … SCN-004]
| Item | Found on 2026-11-06 | Pull request (open, not merged) | CI on the PR |

Related items:
- **Provenance (SCN-040).** At the owner's request, the archived copy of the H1 plan was removed on 2026-11-07 after
  its gate write-up moved into the SCN-042 production note. The [archive](HISTORICAL_SOURCE_ARCHIVE_2026-10-30/README.md)
  now holds 576 files, and `SHA256SUMS` checks clean. The exact bytes stay in `f92e7c7`, and the living
  [H1 plan](H1_SOLAR_DELIVERY_PLAN_2026-09-25.md) keeps the same text. The "577" in the Provenance row below is the
  2026-10-30 capture.
- **SCN-042.** The backend geometry gate's plan, history and state on `main` are now in one place:
  [REMEDIATION_SOLAR_SCN042_PRODUCTION_2026-10-14.md](REMEDIATION_SOLAR_SCN042_PRODUCTION_2026-10-14.md#backend-geometry-gate-plan-history-and-state-on-main).
  Nothing has read `BACKEND_GEOMETRY_VALIDATED` since `68be768`. All six backend layers are admitted per layer by
  their frame contract. That includes PFSS lines labelled synthetic and unvalidated, which draw when the "Solar
  magnetic field" switch is on. The owner has deferred the choice between an honest label and a restored gate.

    ## Saved work and scope

Branch: `fix/remediation-completion-20261030`; worktree:
`/home/nomad/ai/projects/worktrees/solar-remediation-completion-20261030`.
Code checkpoint: `09421c9b379debb9c944fc60ec8a0b67bd07cff4`, based on locally
available `origin/main@bb29d4be393c9dedca7049fc9b83511ed955be40` through the
October 29 reconciliation branch. No fetch, push, merge or deployment was performed.
The original primary checkout and its existing uncommitted work remain untouched.

The [83-item register](REMEDIATION_COMPLETION_2026-10-30_EVIDENCE/canonical-register.json)
is the detailed current record. Its baseline fields preserve historical findings;
its current dispositions apply to this branch. The
[source identity](REMEDIATION_COMPLETION_2026-10-30_EVIDENCE/final-source-identity.json)
binds the code, requirements, all 424 moon assets and lockfile to the checks.

    ## Implemented corrections

> [table: 10 rows moved to the register: rows without an id]
| Area | Result |

The owner explicitly retained the five existing product contracts in
[accepted policies](../docs/supported-product-policies.md). Copying/distribution
of original code requires express permission under [LICENSE](../LICENSE).
This does not grant rights in third-party material.

    ## Actual verification

Counts in separate lanes overlap; do not add them as unique coverage.

> [table: 10 rows moved to the register: rows without an id]
| Lane | Actual result and boundary |

Cold delivery observed checkpoint `f92e7c7`. After two ARIA group attributes were
added, the final production JS, CSS and all public bytes remain identical;
only those two HTML semantics differ. That difference has separate corrected
browser/axe/native evidence. The
[build comparison](REMEDIATION_COMPLETION_2026-10-30_EVIDENCE/production-build-after-aria-equivalence.json)
records it explicitly. No end-to-end deployed TLS or broad observational
calibration is inferred from local HTTP success.

Initial failures are retained: seven reproduced baseline defects; an incomplete
integration prerequisite; the original native400% CDP timeout; planetary Chrome
startup failures before unattended launch flags; and an over-strict new culling
assertion. The culling test now compares radius directly instead of re-squaring
a rounded radius. Actual final checks pass; original limits were not relaxed.
Gradient contrast remains an explicit axe review item. The
[manual protocol](../docs/accessibility-acceptance.md) and
[unexecuted evidence template](ACCESSIBILITY_MANUAL_EVIDENCE_TEMPLATE_2026-10-30.json)
keep unknown operator/device outcomes `NOT_RUN`.

The subsequent [bounded startup diagnosis](REMEDIATION_COMPLETION_2026-10-30_EVIDENCE/startup-diagnosis/diagnosis-result.json)
reproduces the delay with frequent fence polling and a single-render control.
Detailed traces locate long native GL submission work in the GPU process;
trusted keyboard input and HUD updates remain responsive. The exact native
driver/compiler cause and compositor timing remain unresolved. Raw traces and
profiles are retained; no source patch or startup-budget change is claimed.

    ## Eight remaining partial items

**2026-11-02 focused implementation:** [Current four-issue report](FOUR_ISSUE_IMPLEMENTATION_2026-11-02.md) supersedes the four selected rows below on the local integration branch. Other rows retain their dated scope. No new parent closure or deployed acceptance is claimed.

**2026-10-31 documentation follow-up:** The dedicated [solar-eruption architecture and implementation strategy](../docs/solar-eruption-modeling.md) records the screenshot defect, current motion/material pipeline, proposed repair and remaining physical-model requirements. The visual repair is still proposed; SCN-042 remains open.

**2026-10-31 repair:** The square-sprite defect is repaired on `fix/solar-eruption-visuals` (soft-disc alpha map, smaller and denser particles, per-particle restart fade, texture disposal), with [rendered real-GPU evidence](SOLAR_ERUPTION_VISUALS_2026-10-31_EVIDENCE/README.md). Physical transport/emission and the rest of SCN-042 remain open.

> [table: 8 rows moved to the register: SCN-005 … SCN-049]
| Item | Completed here | Still required |

Every original Section7 child remains in the retirement/register evidence.
A narrow supplement can close while its broader canonical parent remains open;
closing a coefficient/source/frame diagnostic does not certify the entire Sun,
mission, catalog distribution or deployed application.

    ## Original note dispositions

Original hashes, version comparisons, corrected scope mappings and exact proof
are in the retirement register. Links for retired notes target their
immutable original Git snapshots; archived source copies remain unchanged.

> [table: 46 rows moved to the register: rows without an id]
| Original remediation note | Current disposition |


## Source `open-findings-2026-11-02`: `agent-notes/OPEN_FINDINGS_2026-11-02.md`

    # Open findings — compiled 2026-11-02

This is one list of the bug, error and problem-area findings recorded in the project's Markdown notes from 2026-10-19 to
2026-11-02, with each item's status on today's `main`.

**Baseline:** `origin/main@4f97dce` (PR #27 merge, 2026-11-02). Both CI workflows pass on it.

    ## Bottom line

Most of what the last two weeks' audits found is fixed and merged:

> [table: 4 rows moved to the register: rows without an id]
| Source | Findings | Status on `main` |

What remains falls into seven groups:
1. **Confirmed defects in the shipped code** (§1). As of 2026-11-03: items 1 and 2 are fixed on `main` (PR #31); the other ten fixable items have open PRs (#32, #33, #35–#42); item 6 was reopened by the owner and is being worked step by step.
2. **B045, now fixed:** PR #25 fixed the 0.25 s grace and PR #29 the past-deadline teardown; both are merged (§2).
3. **CI and test reliability** (§3).
4. **Performance** (§4).
5. **External acceptance and owner decisions** (§5).
6. **Scientific-accuracy gaps** that are declared, not regressions (§6).
7. **Defects in dormant modules** the shipped UI does not load (§7).

    ## 1. Confirmed defects in the shipped code

Each row was confirmed by an earlier audit. I re-checked the code on `4f97dce` by reading the source, not by running it.

Status as of 2026-11-03 (`main` at `8e75993`). Each fix gets its own PR; "Fixed" means the PR is open with passing local gates, until it merges.

> [table: 13 rows moved to the register: rows without an id]
| # | Status | Problem | Where on `main` | Impact | Source IDs |

**Listed as open in the 10-24 register but fixed on `main` now:**
- **Leap-second handling (SDEL-101, SOL-LEAP).** Ambiguous scalar bins return 400; genuine leap instants return 422 (`backend/server.py:3448-3488`, `backend/sim/solar_time.py:36-55`).
- **GONG flux-balance gate (PFSS-063).** A second, scaled policy with a 5 % limit exists (`gong_magnetogram.py:56-60`).
- **`dev:full` LAN exposure (BKP-030).** It now needs an explicit `SOLAR_SECURITY_PROFILE=network` (`scripts/dev-full-config.mjs:38-86`).
- **Unsafe SBDB publication (TOOL-050-PUBLICATION).** Fixed by F-021 (`40a9830`).
- **Fixed-size labels and close-view star clipping (FE-044 / FE-LABEL-SCALE).** Fixed by F-023 (`640bf15`).
- **Lazy moon loader candidates (MOON-062/063/065).** Fixed by F-027 and SCN-043.

    ## 2. Confirmed bug, now fixed

> [table: 2 rows moved to the register: rows without an id]
| Problem | Evidence | Fix |

    ## 3. CI and test reliability

- **Intermittent backend-test hang in CI:** 2 of 49 runs from 10-25 to 10-31, on commits `28043fc` and `81b042b`.
  - Both runs stalled after exactly 3,312 tests, in `test_solar_physics_api`, `_determinism` and `_model`, which use a spawn-based worker pool, and hit the 30-min job limit.
  - It did not reproduce in 24 parallel local runs.
  - Suggested next step: `faulthandler_timeout` in CI, so a hang dumps stacks.
  - Source: session notes, 11-01.
- **Tests that encode one host's float bits.** OpenBLAS picks kernels per CPU. The AVX-512 dev box and AVX2 runners differ in the last bits.
  - The GONG report case was fixed in PR #13 (structural compare, rel 1e-12).
  - Any other test calibrated only on this host carries the same risk. Reproduce with `OPENBLAS_CORETYPE=Haswell CI=true`.
- **Browser CI is timing-sensitive under software rendering.** Budgets were raised to make the gates pass on runners; none of these are performance thresholds. Source: `BRANCH_INTEGRATION_2026-11-02.md` and `PR22_NATIVE_TAB_ZOOM_2026-11-02.md`.
  - Label drag: 90 s → 180 s.
  - Native zoom scenarios: 90 s → 150 s.
  - Worker-fault fixtures were re-sequenced.
  - Other observations:
    - The input driver has a deferred-render regression that breaks burst ordering.
    - There were action-stability timeouts under host CPU stress.
    - `WEBGL_lose_context.loseContext()` blocked for 85 s in headless-shell; this was worked around by switching to full Chromium headless.
- **The Playwright install step stalled on the Azure apt mirror** (push `ui` run, ~45 KB/s, twice). The suggested fix is the official Playwright container image. Source: session notes, 10-30.

    ## 4. Performance problem areas

- **Startup (SCN-005).**
  - Quiet submission: 1.86–1.92 s.
  - Observed GPU completion: 6.5 s (DEV) and 6.9 s (PREVIEW).
  - Traces show long native GL submission work in the GPU process; the driver/compiler cause is unresolved.
  - No startup budget is accepted. Source: `REMEDIATION_STATUS_2026-10-30.md`.
- **Software-renderer stall:** `WebGLRenderer.setSize` takes ~6.3 s during native tab zoom on CPU-only machines. It is documented as a limitation, not fixed (PR #22 note).
- **Bundle size:** see §1 #8.

    ## 5. External acceptance and owner decisions still open

These are the eight remediation items left partial on 10-30. Branch integration on 11-02 states explicitly that it closed none of these gaps.

> [table: 8 rows moved to the register: SCN-005 … SCN-049]
| Item | What is still required |

The owner accepted SCN-004/063 (POSIX only), SCN-015, SCN-037, SCN-038 and SCN-039 as product policies on 10-30
(`docs/supported-product-policies.md`). The two August findings, F-008 (solar axes and clocks) and F-019 (frame overrun,
repeated payload and early-send resource leaks), remain mitigated: the behavior is narrowed and disclosed, not fully fixed.

    ## 6. Scientific-accuracy and visual gaps (declared limits, not regressions)

- **Solar observations.**
  - Observed route/frame and WSA speed calibration are unvalidated, so the fallback stays synthetic (SOL-OBSERVED-GATES).
  - NASA WSA/ACE versus NOAA comparisons do not calibrate this app (SOL-EXTERNAL-OVERLAP).
- **Solar runtime.**
  - PFSS workers have no RSS ceiling (SOL-RSS).
  - Deadlines start at admission, so queued work can start with little time left (SOL-QUEUED-DEADLINE).
  - AIA selected-channel and exact-JD refresh residuals remain (SOL-AIA-FANOUT, partial).
- **Eruption visuals** (fixed 10-31 for the square-sprite defect). Two problems remain:
  - Phase is `t × speedFactor`, so changing the speed reshuffles the particles.
  - Particles clump at the limb at the enlarged display scale.
- **Solar wind (PR #24).**
  - No latitude structure.
  - Motion follows the decorative clock, not simulated time.
  - Density and emission are uncalibrated.
  - `solarProminences.ts` is unused.
- **Other declared model limits:**
  - Procedural CME occurrence.
  - No MHD.
  - Simplified Parker/HCS.
  - Uncalibrated limb, blackbody and granulation photometry (SOL-MODEL-LIMITS, SOL-PHOTOMETRY-GAP).
  - The asteroid belt is a fixed two-body model with an eccentricity cap (SMB-MODEL-LIMITS).
  - The local Hohmann fallback is circular at the instantaneous radius (TRAJ-LOCAL-MODEL-LIMIT).

    ## 7. Defects in dormant modules

These modules are not loaded by the shipped UI and must be fixed before anyone enables them.

> [table: 5 rows moved to the register: rows without an id]
| Problem | Source IDs |

    ## 8. Coverage gaps and loose ends

- **The markdown issue audit is still marked IN PROGRESS.**
  - Its last three work-sequence steps are unchecked.
  - 113 domain rows are "blocked" on external data, environments or decisions.
  - 28 rows are partly fixed, with unverified residual clauses.
- **My 10-17 bug audit never ran 12 of its planned scopes.** The skipped-test gap it reported is gone: the 413 skips were 411 unpromoted moon rows, and the frontend suite now runs with only 2 optional GPU skips.
- **Uncommitted work sits in three worktrees:** `solar-scn005-final-acceptance-20261028`, `solar-scn030-scn031-browser-gate-20261027` and `solar-remediation-20261014-ephemeris`. Their branch histories are merged; the working copies are not certified (`BRANCH_INTEGRATION_2026-11-02.md`).
- **Stale code comment:** the GONG drift comment on `main` says 1.2e-14, but the runner's real maximum is 1.30e-14.

    ## Sources

> [table: 13 rows moved to the register: rows without an id]
| Date | Document | Used for |

Not used as finding sources: the 37 per-bug fix plans in `docs/superpowers/plans/2026-10-23-b0*.md` (all fixed), the
`HISTORICAL_SOURCE_ARCHIVE_2026-10-30/` copies, and files whose only recent change was the 11-02 checkout.
