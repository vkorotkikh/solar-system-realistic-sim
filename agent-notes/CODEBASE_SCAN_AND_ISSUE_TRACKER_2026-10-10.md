# Codebase scan and issue / problem / bug tracker — 2026-10-10

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

## Pasted SCN-001–040 branch inventory — 2026-10-17

The supplied list contains exactly **40 unique findings**. After a successful
`git fetch origin --prune`, remote-tracking `origin/main` is
`1e82830bd5979c1c7391c57840e3236494009045`. The reviewed repair trees
`review/construction-1c5d88b-fixes@9e00947` and
`fix/scn-041-scn-049-closure@c67a8d5` are byte-identical; the later branch date
reflects cherry-picked review fixes, not additional issue coverage.

| Exclusive disposition | Count |
|---|---:|
| Scoped root fixed on refreshed remote main | 19 |
| Additional scoped repair available on construction/review branches | 18 |
| Implemented, with partial acceptance (`SCN-005`, `SCN-030`) | 2 |
| Owner decision required (`SCN-035`) | 1 |
| **Total** | **40** |

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

| ID | Disposition | Fix / evidence commits | Scoped result and remaining boundary |
|---|---|---|---|
| SCN-001 | Fixed on main (scoped) | `1a6fcaa` | Normalized PFSS basis and decomposition fixed. Observed calibration and later near-pole/scientific gates remain separate. |
| SCN-002 | Fixed on main (scoped) | `401c28d` | Original NumPy dtype/endian crash replaced by validated FITS parser. Later float64 snapshot admission defect is SCN-051, not this pasted root. |
| SCN-003 | Fixed on main (scoped) | `70af7c8`, `401c28d` | Explicit sine-latitude geometry, WCS, area and weighted decomposition. Real observed-field accuracy remains separate. |
| SCN-004 | Branch repair available | `870de80`, `5403b57` | Killable subprocess owns acquisition deadlines and cleanup; reviewed poll portability fix retained. Recorded transport evidence is platform-scoped, not universal network certification. |
| SCN-005 | Partial acceptance | `82dd139`, `febb93d`, `6539902` | Visible source/error status is on main; branch has recorded five-minute production-budget DEV/PREVIEW passes. Pasted requirements have dated scoped evidence. Current integrated final-source delivery acceptance remains; later 2 s catalog/usable-scene startup gate is expanded scope, not the originally pasted UI defect. |
| SCN-006 | Fixed on main (scoped) | `5182128` | Localhost and loopback preview-origin contract fixed. Actual configured deployment acceptance is separate. |
| SCN-007 | Fixed on main (scoped) | `0789e08` | Trusted transport identity and bounded stores close original rotating-header bypass. Eviction/edge limits and broader deployment fairness remain separate. |
| SCN-008 | Fixed on main (scoped) | `9655458`, `0789e08` | Solar physics epoch bounds reject before compute. AIA date coverage and playback bounds are different roots. |
| SCN-009 | Fixed on main (scoped) | `9655458` | Unvalidated assimilation explicitly disabled with safe fallback. Validated assimilation is not claimed delivered. |
| SCN-010 | Branch repair available | `870de80`, `e448e4f` | Failed/partial cache states retry with bounded failure backoff; reviewed restored-SWPC blend fix retained. Source age and disabled observational assimilation remain explicit. |
| SCN-011 | Fixed on main (scoped) | `af027c2` | AIA timestamps canonicalized to UTC before browser parsing. Historical tests are not a fresh provider observation. |
| SCN-012 | Branch repair available | `dc1f0ab`, `56ac52a` | Main fixed null undefined metrics; branch independently covers all three legacy windows, 3/3 comparable. Old third-party aggregate totals are not relabeled as executed. |
| SCN-013 | Branch repair available | `2dee43c`, `2bddea3`, `a568625` | Relative/rebased GPU time and phase plus actual hardware readback evidence. Dated hardware gate is not new or whole-scene acceptance. |
| SCN-014 | Branch repair available | `259601a` | Field-specific ACBF quantization budgets and full 100000-row format gate. Integrity, scientific fidelity and provenance are separate. |
| SCN-015 | Branch repair available | `71ba472` | Pasted permitted alternative implemented: explicit largest-known-diameter, nonrepresentative prefix with population gates. Old DECISION_REQUIRED is historical product-baseline state; no representative sampling is promised and owner endorsement is not inferred. |
| SCN-016 | Fixed on main (scoped) | `fea6f9d` | Runtime Earth corrected to geocentre while source EMB identity retained. Target-specific fixture scope remains limited. |
| SCN-017 | Branch repair available | `2005a1f` | All secular element and moving-axis derivatives included with multi-epoch finite-difference gates. External sampled accuracy is separate SCN-080. |
| SCN-018 | Fixed on main (scoped) | `fc32483` | Pluto secular rates and independent coverage gate added. Approximate fidelity/interval limits remain. |
| SCN-019 | Fixed on main (scoped) | `62a4f5d` | Cargo enters chronological return-burn mass ledger. Risk, reserves and burn semantics remain separate roots. |
| SCN-020 | Branch repair available | `62a4f5d`, `56ac52a` | Main ties deterministic risk to feasibility; branch excludes discarded/reserved fuel from usable margin and re-closes sampled budgets. Service evidence is scoped; independent mission endpoint/solver acceptance is retained. |
| SCN-021 | Fixed on main (scoped) | `eef8945` | Schwarzschild radii and dependent conversions corrected. Speculative model truth and direction/jet sources are separate. |
| SCN-022 | Fixed on main (scoped) | `7a21468` | Original six-step high-e JavaScript solver defect repaired. GLSL twin and current-catalog domain remain separate evidence scopes. |
| SCN-023 | Branch repair available | `32da51b` | Display offsets separated from canonical states with experiment invariance gates. Actual full-scene rendering acceptance remains separate. |
| SCN-024 | Branch repair available | `32da51b` | KBO propagation/upload skipped for unchanged JD with targeted regressions. Earlier aggregate browser traffic never became KBO-only bandwidth evidence. |
| SCN-025 | Branch repair available | `19d1b6f`, `94cf1d4` | Strict typing closes zero-error backlog and is enforced without relaxed settings. Reported passing evidence is pinned, not a rerun in this read-only audit. |
| SCN-026 | Fixed on main (scoped) | `fbe3d1c` | Discovery restricted to product/script trees; archive evidence retained. Main merge PR7 6a9de62 verified by ancestry. |
| SCN-027 | Fixed on main (scoped) | `4177b51` | README documents pinned backend development/test environment. Runtime-only requirements do not pretend to include every test dependency. |
| SCN-028 | Branch repair available | `94cf1d4` | Vite/Vitest/toolchain updates plus historical pinned install/test/type/build/audit evidence. Zero advisories is dated evidence; no fresh registry audit performed here. |
| SCN-029 | Fixed on main (scoped) | `d6f19d1`, `477030a` | Tracked backend/frontend/scientific mutation CI exists. Strict TS and broader browser/load gates remain distinct. |
| SCN-030 | Partial acceptance | `7fafd83`, `cae3c0f`, `00b5346`, `7681a0c` | Pasted concrete accessibility defects implemented; real three-engine automation and native Chromium zoom evidence retained. Manual NVDA/VoiceOver/physical touch and affected final-source browser acceptance remain; implementation is not merely a plan. |
| SCN-031 | Branch repair available | `7fafd83`, `6c6f232` | Unavailable-WebGL/context-loss state, owned teardown and accessible restart implemented and browser-tested. Historical browser evidence remains revision scoped. |
| SCN-032 | Fixed on main (scoped) | `4177b51`, `952de6a` | README aligned with actual local entry, hidden moons and real worker paths. Latest API/library-only clarification is docs follow-up; main root already repaired. |
| SCN-033 | Fixed on main (scoped) | `fbe3d1c`, `f6a9fe7`, `952de6a` | Safe imports/help/dry-run, nonempty validation and atomic intentional publication. Original destructive --help/import roots repaired on main. |
| SCN-034 | Branch repair available | `d78b732`, `71ba472` | Main fixes external-output path; branch adds pinned source snapshots and transactional offline-by-default generation. Byte-identical full-artifact rebuild evidence remains separate SCN-046. |
| SCN-035 | Owner decision | `14741bd` | Provenance notices improved; original-code license and asset permissions remain undecided. Owner chooses code/distribution license; resolve SILSO terms and Deimos permission/replacement. Cannot be closed by code/tests alone. |
| SCN-036 | Fixed on main (scoped) | `0789e08`, `735a2cc` | Authenticated profile and bounded per-subject WebSocket admission implemented. Multi-subject/global capacity fairness, multi-worker deployment and soak are separate. |
| SCN-037 | Branch repair available | `a33ad93` | Pasted permitted alternative implemented: explicit fixed-step telemetry with slow-step/no-catch-up regression. Policy is implemented; owner acceptance is not retroactively manufactured. Optional API/library mode only. |
| SCN-038 | Branch repair available | `32da51b` | Decorative versus scientific motion declared; pause/reverse/reduced-motion freezes and resume discard implemented. Policy is implemented; owner acceptance is separate from its recorded tests. |
| SCN-039 | Branch repair available | `7fafd83`, `cae3c0f` | Consumed backend-origin/viewport/render-scale contract with nondefault browser checks. Owner deployment selection is separate; no dormant-client activation implied. |
| SCN-040 | Branch repair available | `56e799a`, `0964ed9` | Selected Markdown plus 164 original scan/merged evidence files are now committed on `remediation/scn-followup-20261017`; every copied byte is verified. Main landing and older September/H1 raw archival remain separate. |

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

| Verification scope | Finding / retained evidence | Acceptance boundary |
|---|---|---|
| **Backend verification** | SCN-070 command recovery/fatal-state handling and SCN-071 deadlines/cancellation/worker ownership: `a33ad93` and `06a2562`, with native/ASGI evidence in the [runtime review](REMEDIATION_RUNTIME_REVIEW_2026-10-14.md). SCN-049 producer-side activation identities: `a8187a7` and the [native Kuiper capture/regressions](REMEDIATION_SCN049_KUIPER_REACTIVATION_2026-10-15.md). | Credit only the named server/API contracts at their tested revisions. These repairs do not depend on default-UI client integration. Cooperative worker evidence does not establish forcible termination of arbitrary native hangs. Retain branch-only/main-baseline qualifiers. |
| **Client-library verification** | SCN-049 schema validation, stale/replaced-socket handling, reconnect intent, and subscription matching: the [runtime-client report](REMEDIATION_RUNTIME_CLIENT_2026-10-14.md), [lifecycle review](REMEDIATION_LIFECYCLE_OWNERSHIP_REVIEW_2026-10-14.md), and native capture replay through the real client with a socket test double. Preserve `simulationClient.test.ts`, `.kuiper.test.ts`, `.lifecycleReview.test.ts`, and `.subscription.test.ts`, plus their fixtures. | Evidence for the optional library's protocol behavior, not a live deployed handshake or default-page N-body acceptance. Upgraded peers reject stale tagged Kuiper frames while preserving ordinary body updates; legacy peers retain their documented ambiguity. Reconnect intent coverage is not full epoch/rate/pause session restoration. |
| **Shipped-browser acceptance** | Active `main.ts` / `frameLifecycle`, local propagation, solar HTTP polling, belt disposal, rendering and their browser tests. The same runtime-client work also repaired active solar HTTP and belt paths; those repairs are not reclassified as dormant. | Keep each active child's final-source browser/manual/deployment requirements. A library test or backend pass cannot close them. Earlier browser evidence remains scoped to its recorded revision. Default-page N-body acceptance is outside the retained library's scope; it would become required only for a separately approved UI integration. |

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

| Primary state | Count | Meaning |
|---|---:|---|
| `OPEN` | **45** | Current observation or source establishes the defect at the pinned product snapshot. |
| `RESOLVED_SCOPED` | **23** | The named root defect is corrected and has replacement evidence; nearby capability or model limits remain separate rows. |
| `VERIFY` | **9** | An acceptance/capability question or historical observation still needs a current independent oracle. |
| `DECISION_REQUIRED` | **6** | Code implements a policy or tradeoff whose intended product contract must be chosen explicitly. |
| **Canonical total** | **83** | One row per root finding; aliases and split symptoms are not additional findings. |

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

| Date | Source | Provenance | Master use |
|---|---|---|---|
| 2026-10-06 | `CODEBASE_EVALUATION_REPORT_2026-10-06.md` and `_APPENDIX_B_REVIEWERS.md` | Git-only at `e6f8eedd0ae90c71f309921e8effe62ef45ef0cd` on `origin/sun-focus`; 102 `F-*` findings plus `KF-1`–`KF-11` | Primary omitted corpus. Every ID is crosswalked below; current-supported independent roots become `SCN-065`–`083`. |
| 2026-10-07 | [Audit/index](AUDIT_AND_ISSUE_INDEX_2026-10-07.md) | Untracked historical index | Source lineage, physics-fix commits, Dione/Rhea and node-sign leads. |
| 2026-10-07 | [SCN-001–049 scan](#appendix-b--october-7-scan-historical) and `CODEBASE_SCAN_2026-10-07_EVIDENCE/` | Untracked; explicitly superseded by October 10 | Original IDs and September 24 crosswalk; no duplicate rows. |
| 2026-10-07 | [H1 solar plan](H1_SOLAR_DELIVERY_PLAN_2026-09-25.md) and `H1_SOLAR_DELIVERY_PLAN_2026-09-25_EVIDENCE/h2-d10/` | Plan materially updated October 7; 19-file H2-D10 evidence subtree | Solar acceptance detail and H2.5 pole-frame evidence; no additive issue count. |
| 2026-10-07 | `docs/superpowers/specs/2026-10-07-frontend-accessibility-remediation-design.md` | Tracked design | Superseded design provenance only. |
| 2026-10-10 | [SCN-001–064 scan](#appendix-a--october-10-scan-historical) | Untracked; audits `e7de6cc`, `0523a5b`, and `e40fc8c` | Stable canonical backbone and closure criteria; statuses rebased here. |
| 2026-10-10 | [Evidence guide](CODEBASE_SCAN_2026-10-10_EVIDENCE/README.md) and domain reports | 103 files; manifest verified October 11 | Reproductions for `SCN-050`–`064` and historical status. |
| 2026-10-10 | [Physics PR body](PR_BODY_physics-math-findings.md) | Untracked local artifact | Exact fixing-commit provenance; never treated as blanket closure. |
| 2026-10-10/11 | `ISSUE_TRACKER_MERGED_2026-10-10_EVIDENCE/` | Untracked structured evidence against `68c3f85`; 42 assessments | Current status deltas and two temporary aliases, `EXTRA-1/2`; not a complete register. |
| 2026-10-11 | Accessibility final review, revised design, and implementation plan | Git objects under `origin/main`, commits `cdd110e`–`f4caea9`, merged by `67d896f` | `R1`–`R8` closure requirements only; no product implementation. |
| 2026-10-11 | `fix/tracker-merge-2026-10-11@71d8412` | Branch-only four-commit candidate | Unmerged fixes for `026/027/032/033` and one `034` sub-defect. |

The September 24 audit and September 25–26 plans are outside the strict
document-date window. Their IDs remain reachable through the October 7
crosswalk, but they are ancestor sources rather than additive issue sets.
Filesystem mtimes caused by checkout or evidence restoration were ignored.

## 4. Canonical register

| ID | Pri | State | Progress | Evidence | Canonical finding, scope, and closure |
|---|---|---|---|---|---|
| SCN-001 | P0 | RESOLVED_SCOPED | — | MIXED | PFSS harmonic basis/decomposition is normalized and analytic basis, orthogonality, quadrupole, and mutation gates pass. Preserve pole/derivative/boundary gates; observed calibration is `041/048`. |
| SCN-002 | P1 | RESOLVED_SCOPED | — | OBS | Original NumPy endian/dtype FITS crash is fixed with a valid frozen fixture. Parser-to-solver float64 admission remains independently `051`. |
| SCN-003 | P1 | RESOLVED_SCOPED | — | MIXED | GONG WCS, orientation, exact area weights, and weighted decomposition now have an explicit grid contract. Real observed accuracy remains `041/048`. |
| SCN-004 | P1 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | Owned, killable DNS/header/body subprocess transport is implemented in `870de80`; stalled phases, interruption, framing, recovery and permit/resource cleanup pass. POSIX evidence in [solar report](REMEDIATION_SOLAR_2026-10-14.md); other platforms are not certified. |
| SCN-005 | P1 | OPEN | PARTIAL | MIXED | October 17 follow-up `6045dba` / `66ef13c` maps catalog rows directly and waits for full adoption before owned shader warmup. The unchanged 2 s fetch-to-parse/hash gate passes 3/3 DEV author measurements (162–182 ms); observed GPU-fenced full-scene readiness remains 6.5–6.9 s. Earlier `fc3b6a0` five-minute DEV/PREVIEW delivery passes remain dated; final-source delivery and usable-scene acceptance are still open. [Startup repair](REMEDIATION_STARTUP_WARMUP_2026-10-17.md). |
| SCN-006 | P1 | RESOLVED_SCOPED | — | OBS | Default localhost and loopback-IP Vite preview origins pass the CORS contract. Actual deployed origins remain `048`. |
| SCN-007 | P1 | RESOLVED_SCOPED | — | OBS | Solar admission now uses trusted identity policy and bounded stores; rotating untrusted headers no longer create unlimited identities. Preserve proxy/auth/cap/eviction tests. |
| SCN-008 | P1 | RESOLVED_SCOPED | — | OBS | `/solar/physics` rejects extreme finite epochs and bounds JDTDB before compute. AIA historical-date coverage is separately `048`; playback escape is `053`. |
| SCN-009 | P1 | RESOLVED_SCOPED | — | OBS | Unvalidated/stale observation assimilation fails closed rather than applying zero-confidence forcing. Enabling validated assimilation still requires an epoch/provenance oracle. |
| SCN-010 | P1 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `870de80` separates failed/partial/complete cache states and retries failures after a bounded 4.5-second backoff; detached last-known-good data retains source age. Cache/recovery regressions and the integrated backend suite pass. |
| SCN-011 | P2 | RESOLVED_SCOPED | — | OBS | AIA timestamps are canonicalized to UTC before the browser freshness calculation. Preserve cross-timezone tests. |
| SCN-012 | P0 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `56ac52a` supplies actual pinned Horizons endpoint states plus independently executed Izzo/Gooding/DOP853 references for all three legacy date pairs: 3/3 comparable. Historical GMAT/Orekit/Tudat totals remain incomparable, not relabeled as executed. See [mission evidence](REMEDIATION_MISSION_2026-10-14.md). |
| SCN-013 | P1 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `2dee43c` rebases GPU epoch/phase; `2bddea3` gates actual shader readback. `a568625` passes 125 hardware cases on RTX 5090, max position error 0.00002632 AU and retained minute-scale motion. [Hardware evidence](REMEDIATION_HARDWARE_2026-10-14.md). |
| SCN-014 | P1 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `259601a` defines field-specific ACBF quantization budgets and passes the complete 100,000-row format contract. Artifact provenance and scientific fidelity remain separately gated by `046/082`. |
| SCN-015 | P2 | DECISION_REQUIRED | FIX_AVAILABLE_UNMERGED | MIXED | `71ba472` makes the largest-known-diameter prefix policy explicit and nonrepresentative. The exact 50,000/100,000 identity, uniqueness and distribution gate passes; catalog rows are not padded with procedural objects. [Catalog evidence](REMEDIATION_CATALOGS_2026-10-14.md). |
| SCN-016 | P1 | RESOLVED_SCOPED | — | MIXED | Runtime Earth is now geocentric (`fea6f9d`); the raw source row remains EMB and fixture scope is narrow. Preserve target-3/399 identity gates. |
| SCN-017 | P1 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `2005a1f` differentiates all secular elements and changing basis axes; nine planets, five epochs, two step sizes and a full-rate synthetic case pass. Independent sampled accuracy remains scoped separately under `080`. |
| SCN-018 | P2 | RESOLVED_SCOPED | — | MIXED | Pluto secular rates and a position/velocity gate were added by `fc32483`. Preserve the declared model interval and fidelity limitations. |
| SCN-019 | P1 | RESOLVED_SCOPED | — | MIXED | Mined cargo now enters the chronological return-burn mass ledger and closure (`62a4f5d`). This does not close risk, reserve, or burn-definition roots `020/052/078`. |
| SCN-020 | P1 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `56ac52a` defines usable margin as attached-stage fuel excluding protected reserves. Onboard, reserved and discarded fuel are separately reported; exhausted risk samples have zero usable margin. Mission/reserve regressions pass. |
| SCN-021 | P1 | RESOLVED_SCOPED | — | OBS | SMBH Schwarzschild radii and dependent unit conversions were corrected by `eef8945`. Direction/jet-data consistency is separately `069`. |
| SCN-022 | P2 | RESOLVED_SCOPED | — | OBS | The JavaScript Kepler solver is safeguarded for all supported `e < 1` (`7a21468`). The GLSL twin remains a `049` verification child outside the shipped catalog domain. |
| SCN-023 | P1 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `32da51b` isolates H29 display offsets from canonical orbital state and gates experiment on/off invariance. The merged UI retains the isolated composition path. |
| SCN-024 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `32da51b` separates KBO state and upload work and skips unchanged Julian dates. Pause/unchanged-state upload regressions pass in the integrated frontend suite. |
| SCN-025 | P1 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `19d1b6f`, event/UI contracts and `94cf1d4` close strict TypeScript errors without relaxed settings. Pinned Node 22.23.2 strict typecheck passes at zero, including after catalog integration; strict CI step added. |
| SCN-026 | P1 | RESOLVED_SCOPED | — | MIXED | PR #7 (`952de6a`, merge `6a9de62`) restricts Vitest discovery to product/script trees. Prior branch gate: 393 frontend/script tests and production build passed; preserve discovery exclusions. |
| SCN-027 | P1 | RESOLVED_SCOPED | — | MIXED | PR #7 documents the pinned backend test environment and current invocation. Prior reviewed branch gates passed; full current integrated README-to-suite execution is recorded in the remediation effort. |
| SCN-028 | P1 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `94cf1d4` deliberately updates Vite/Vitest and compatible transitive dependencies. Pinned npm ci, production build, strict typecheck, frontend tests and npm audit pass with zero reported advisories. [Toolchain evidence](REMEDIATION_TOOLCHAIN_2026-10-14.md). |
| SCN-029 | P1 | RESOLVED_SCOPED | — | MIXED | A tracked CI/backend/science mutation workflow exists and passes its scoped contract. Strict TS is `025`; broader browser/live/load gates are `047`. |
| SCN-030 | P1 | OPEN | PARTIAL; FIX_AVAILABLE_UNMERGED | MIXED | R1-R8 implementation is integrated via `cae3c0f`. Earlier `b072d32` passed 87 UI checks across Chromium, Firefox and WebKit. At `66ef13c`, the full Chromium suite passes 43 checks with one native-visibility skip, including actual-app recovery and native 200%/400% zoom on RTX 5090. This is Chromium-only automation: manual NVDA, VoiceOver and physical-touch acceptance and current-source checks on other applicable engines remain outstanding. [Accessibility evidence](REMEDIATION_ACCESSIBILITY_2026-10-14.md); [October 17 validation](SCN_FOLLOWUP_VALIDATION_2026-10-17.md). |
| SCN-031 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `2e2b31d` through `6c6f232` provide accessible no-WebGL/context-loss recovery, stop owned runtime work, and preserve keyboard restart. Actual-app software and RTX 5090 browser gates pass. |
| SCN-032 | P1 | RESOLVED_SCOPED | — | MIXED | PR #7 aligns the README with shipped entry controls, moon display/propagation limitations, and maintenance safeguards. Review and 393-test/build gate passed. |
| SCN-033 | P2 | RESOLVED_SCOPED | — | MIXED | PR #7 ships safe maintenance help/import paths, atomic catalog writes, explicit count-change admission, and shape/uniqueness/orbit validation. Nine updater regressions and full frontend/script gate passed. |
| SCN-034 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | PR #7 path safety is retained. `71ba472` adds real pinned source acquisition, offline-by-default generators, atomic multi-artifact publication and failure-injection tests. Byte identity is separately recorded under `046`. |
| SCN-035 | P1 | DECISION_REQUIRED | PARTIAL | MIXED | `14741bd` adds NOTICE and source/provenance evidence. Owner code-license choice, SILSO noncommercial terms, and unresolved Deimos image permission still prevent a blanket distribution claim. Close with recorded owner choices, permission or approved asset replacement/removal, and a matching distribution inventory. Owner: product/licensing; moon source-storage decisions remain separately required under `043`. [Provenance report](REMEDIATION_PROVENANCE_2026-10-14.md). |
| SCN-036 | P1 | RESOLVED_SCOPED | — | MIXED | Authenticated network profile and per-subject WebSocket admission are implemented. Multi-worker, long-lived, and exclusion fairness remain `047/048`. |
| SCN-037 | P2 | DECISION_REQUIRED | FIX_AVAILABLE_UNMERGED | MIXED | The remediation effort selects explicit fixed-step semantics: time_scale/target_fps days per tick, no wall-time catch-up promise. Runtime telemetry declares the policy. Slow-step regression passes in `a33ad93`; not merged. |
| SCN-038 | P2 | DECISION_REQUIRED | FIX_AVAILABLE_UNMERGED | MIXED | `32da51b` declares simulation-driven versus decorative solar motion and gates pause/reverse/reduced-motion behavior. Integrated UI adapters preserve live JD, pause and time-scale inputs. |
| SCN-039 | P2 | DECISION_REQUIRED | FIX_AVAILABLE_UNMERGED | MIXED | `cae3c0f` integrates a consumed runtime configuration contract: explicit VITE_BACKEND_ORIGIN or same-origin, no query redirects, nondefault backend ports, viewport sizes and drawing-buffer scale. Real-app configuration checks pass. |
| SCN-040 | P1 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `56e799a` archives selected Markdown; `0964ed9` additionally preserves 164 original October 7/10 scan and merged-review files with byte/hash verification. The consolidated tracker retains both complete scans, all 83 canonical IDs and 138 aliases. Repairs/evidence are committed on construction/follow-up branches, not main; older September/H1 raw archival remains separate. [Archive manifest](SCAN_EVIDENCE_ARCHIVE_2026-10-17.json). |
| SCN-041 | P1 | VERIFY | PARTIAL | MIXED | The numerical repair `df8adc6` clears the 55 failing PFSS regression cases. Updated streaming-path scientific gates at `cdea3bc` pass six baselines and kill all six mutants with unchanged oracle limits; full backend at `a8187a7` passes 3878 cases. Three reference epochs and cold High/Ultra budgets also pass. Observed-input/frame and provider/application calibration acceptance remain scoped open; observations are not silently enabled. [Current checkpoint](REMEDIATION_CLOSURE_CHECKPOINT_6539902_2026-10-15.md). |
| SCN-042 | P1 | VERIFY | PARTIAL; FIX_AVAILABLE_UNMERGED | MIXED | October 17 repairs `8888563` / `b1f6bd9` fix the assembled asteroid shader PI collision and diagnostic sampling mismatch. Scoped actual-main hardware acceptance passes 6/6 cases, 156/156 markers, 235/235 surface probes and all three negative controls; production MSAA, pixel budget and independent reference remain intact. Startup compilation is separately gated. Broader artistic/layer/camera/epoch and application requirements remain open. [Rendering repair and retained failed baseline](SCN042_RENDERING_REPAIR_2026-10-17.md). |
| SCN-043 | P1 | VERIFY | PARTIAL | MIXED | All 424 records are prepared in the isolated moon worktree; 517 scoped Node 22 tests and seven Python tests pass, including offline byte-identical generation. Only 13 records are integrated here. Independent review found missing/inconsistent accuracy-certificate and endpoint-limit validation plus uncancelled rejected response bodies; the code corrections, source-storage disposition and independent acceptance remain pending before promotion. Preserve original 13 hashes, both Puck IDs and all accuracy limits. [Independent review](SCN043_LAZY_INDEPENDENT_REVIEW_2026-10-15.md); [checkpoint](REMEDIATION_CLOSURE_CHECKPOINT_6539902_2026-10-15.md). |
| SCN-044 | P2 | VERIFY | FIX_AVAILABLE_UNMERGED | MIXED | `2613436` adds a dated two-assist witness independently closed with Izzo/Gooding/DOP853, physical periapsis/continuity checks and an inconclusive-on-exhaustion gate. This is a feasible quality floor, not a global optimum or external ephemeris certification. |
| SCN-045 | P2 | VERIFY | FIX_AVAILABLE_UNMERGED | MIXED | `2613436` declares rejection of exact collinearity without a supplied plane. Independent propagated-state gates cover rotated near-zero/near-pi/hyperbolic cases and both senses/branches for 1-3 revolutions. Existing `064` remains preserved. |
| SCN-046 | P2 | VERIFY | FIX_AVAILABLE_UNMERGED | MIXED | `71ba472` pins 17 real provider responses. Two network-disabled asteroid builds and both generators' offline checks reproduce the new committed artifacts byte-for-byte; all 100,000 source periods/diameters/albedos are compared. Historical unpinned artifacts were replaced, not reverse-engineered. |
| SCN-047 | P1 | VERIFY | PARTIAL | MIXED | Fresh backend at `a8187a7`: 3878 passed, zero failed, 12 skipped. Frontend at `6539902`, Node 22.23.2: 745 passed, 411 skipped; strict TypeScript/build pass. Required native Tudat: 17 passed without skips. Scientific gate: six baselines pass and six mutants killed. Remaining rendering, startup/delivery, moon, browser and applicable manual/deployment acceptance prevent global closure. Exact revisions, warnings and overlapping scopes remain explicit. [Checkpoint](REMEDIATION_CLOSURE_CHECKPOINT_6539902_2026-10-15.md). |
| SCN-048 | P1 | VERIFY | PARTIAL | MIXED | Requested-epoch coverage `938bca0`, live AIA cache freshness `64cc9d4`, and local authenticated proxy/soak evidence are integrated. Scalar-JD leap-boundary information loss remains unresolved: owner choice is strict ambiguous-bin rejection with precise two-part input or documented rounding. Remote URL/authentication/TLS acceptance and provider/frame calibration remain outstanding; observations stay fail-closed. Owner: time-policy and deployment owners, with solar review; local captures do not certify continuous archive coverage or spatial use. [Independent review](INDEPENDENT_EVIDENCE_REVIEW_892d049_938bca0_2026-10-14.md); [closure plan](REMEDIATION_CLOSURE_PLAN_2026-10-15.md). |
| SCN-049 | P2 | VERIFY | PARTIAL; FIX_AVAILABLE_UNMERGED | MIXED | **SimulationClient child: API/library-only; not integrated into the default UI.** Stale-Kuiper reactivation is reproduced with native producer captures and repaired in `a8187a7` using negotiated activation IDs; client rejection preserves ordinary body updates. Recorded backend and client-library gates support those contracts; legacy peers retain their documented ambiguity. Active frame/solar HTTP/belt/rendering children retain separate final-browser acceptance. No umbrella closure or default-UI N-body delivery is inferred. See the [scope decision and three verification boundaries](#simulationclient-scope-decision--2026-10-17) and [dated checkpoint](REMEDIATION_CLOSURE_CHECKPOINT_6539902_2026-10-15.md). |
| SCN-050 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `870de80` normalizes the active frontend Hathaway curve at its analytic parameterized peak. Backend/frontend pass one independently generated high-precision reference, eliminating the clipped plateau. |
| SCN-051 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `870de80` authenticates original retained FITS bytes, reparses them and compares science/grid/provenance instead of inverse-reconstructing lossy float pixels. All supported BITPIX encodings and tampering gates pass. |
| SCN-052 | P1 | RESOLVED_SCOPED | — | MIXED | PR #8 (`44503ec`, merge `bb2e8ef`) fixes stage reserves against immutable initial propellant. Partition, unequal-stage/cargo/jettison regressions and full 2168-test backend gate passed. Discarded onboard margin remains `020`. |
| SCN-053 | P1 | RESOLVED_SCOPED | — | MIXED | PR #9 (`9102c18`, merge `1fa45f0`) applies the REBOUND supported epoch contract before stepping. Focused regressions and full 2167-test backend gate passed. |
| SCN-054 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `2005a1f` repairs separation scaling and companion mass weighting, validates inputs and preserves tight-binary serialized separation/velocity. Vis-viva, angular momentum and barycenter tests pass; massless Kuiper particles still do not model a sustained mutual binary. |
| SCN-055 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `2005a1f` reconstructs a common SSB origin; `6f7ec2a` supplies actual TudatPy 1.0 translation/energy evidence. The quantity remains a point-mass diagnostic excluding harmonic potential, not exact extended-force energy. [Native report](REMEDIATION_NATIVE_TUDAT_2026-10-14.md). |
| SCN-056 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | Reviewed commit `2605f25` enforces family registration through both public EPO runners; included in the remediation integration branch. Prior full 2165-test backend gate passed. Not yet on origin/main; smoke truth remains `079`. |
| SCN-057 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `2005a1f` fixes REBOUND pointer dereference and caller-owned beta assignment. Actual REBOUND SRP/tide/combined callback acceleration gates pass; dormant callbacks are not silently activated. |
| SCN-058 | P1 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `9221a61` restores parent ownership during Earth/Mars LOD merges and gates repeated bounded near/far coverage. Software and actual RTX 5090 rendered checks pass. |
| SCN-059 | P1 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `9221a61` propagates scale changes through Earth/Mars radius, displacement, LOD and camera framing. Actual software/hardware geometry gates cover both scale modes. |
| SCN-060 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `9221a61` adds deliberate mean-sphere picking proxies and body identity across LOD/scale states. Selection regressions pass without depending on detached patch hierarchy. |
| SCN-061 | P1 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `9221a61` applies face placement before spherical projection and adds pole-safe normals/skirts. CPU, production shader and actual hardware screen gates cover centers/corners/seams and relief/flat modes. |
| SCN-062 | P2 | RESOLVED_SCOPED | — | MIXED | `b5387c2` gives default-scale flare/CME events a positive lifetime with tests. Other stochastic and coordinate behavior is `065/042`. |
| SCN-063 | P2 | DECISION_REQUIRED | FIX_AVAILABLE_UNMERGED | MIXED | `e6a02d9` replaces starvation-prone I/O with deadline-owned child kill/reap before permit release. Redirect/budget rules are preserved; 169 focused tests, 111 repeated executions and a 115-test integrated runtime/transport gate pass. POSIX-only evidence, not an invented owner acceptance of starvation. |
| SCN-064 | P1 | RESOLVED_SCOPED | — | MIXED | PR #11 (`3927ab7`, merge `f45c1f9`) stabilizes near-collinear angle/state recovery. Independent endpoint regressions and full 2177-test backend gate passed; broader solver coverage remains `045`. |
| SCN-065 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `32da51b` advances background AGN stochastic state independently of foreground events. Deterministic no-active-event burst regressions pass. |
| SCN-066 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `32da51b` aligns preset/source/model resolution and removes the no-op observer control. `cae3c0f` preserves one authoritative experiment controller; dispatch, restored H29 and selection-reset tests pass. |
| SCN-067 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `32da51b` starts both AGN grids hidden, enables them only during events and resets visibility/state. Lifecycle/submission tests pass; frame-plane correctness remains separately `042`. |
| SCN-068 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `32da51b` repairs the default SMBH reference and adds a direct no-third-argument regression. Strict TypeScript now passes as well. |
| SCN-069 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `32da51b` uses cited source coordinates and an explicit ECLIPJ2000 transform. M87 apparent/intrinsic jet parameters are consistent or clearly illustrative. Source/frame tests pass; rendered projection follows under `042`. |
| SCN-070 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | **Backend verification:** `a33ad93`, strengthened by independent review `06a2562`, repairs command recovery: partial mutating seeks latch fatal state, read-only failures recover, and failed telemetry clears stale snapshots. Recorded native/ASGI cases pass in the [runtime review](REMEDIATION_RUNTIME_REVIEW_2026-10-14.md). Repair credit is independent of `SimulationClient` UI integration and does not establish shipped-browser N-body acceptance; retain the [scope decision](#simulationclient-scope-decision--2026-10-17) and main-baseline qualifier. |
| SCN-071 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | **Backend verification:** `06a2562` repairs repeated-cancellation lease release, stale-snapshot liveness, queue-drain starvation and concurrent native handshake reads. Cleanup retains actual worker ownership; focused, repeated and integrated gates are recorded in the [runtime review](REMEDIATION_RUNTIME_REVIEW_2026-10-14.md). Arbitrary unkillable native-thread hangs remain a declared limitation. Repair credit is independent of `SimulationClient` UI integration and does not establish shipped-browser N-body acceptance; retain the [scope decision](#simulationclient-scope-decision--2026-10-17) and main-baseline qualifier. |
| SCN-072 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `2613436` applies the inclusive 1990-2050 TDB planning interval to direct, grid-derived and mission-dwell epochs, returning structured 422 errors. `3ef4310` updates an obsolete overflow fixture to the earlier epoch rejection without weakening production validation. |
| SCN-073 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `2613436` disables automatic redirects and validates every explicitly charged hop against HTTPS, exact host and port rules. Actual urllib rejection/relative redirect/loop/budget gates pass; owned transport follow-up preserves these checks. |
| SCN-074 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `2005a1f` initializes all 13 identified fallback bodies at their declared epochs before integrating to the requested epoch. Four independent Horizons epochs gate each body; sampled bounds and approximate fidelity survive serialization. |
| SCN-075 | P1 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `870de80` shares immutable active-region seeds, rotation, smooth lifetimes and birth-cycle Hale polarity across synthetic PFSS and coronal layers. Continuity and spatial agreement pass; these are not measured observed regions. |
| SCN-076 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `2005a1f` restores inward radial PR drag and independently gates circular, inward/outward radial and eccentric component/power cases. This does not activate the dormant callback. |
| SCN-077 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `6f7ec2a` executes the repaired adapter on real TudatPy 1.0: continuous forward/backward chunks, one initial SPICE seed, TDB metadata and an observable 422 m ten-day harmonic effect. Native compatibility, Saturn gravity and honest Pluto-system metadata are covered. |
| SCN-078 | P1 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `56ac52a` replaces v-infinity sums in mass closure with four declared circular parking/capture burns and chronological cargo loading. Independent patched-conic energy gates pass; finite thrust, plane changes and surface operations are explicitly out of scope. |
| SCN-079 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `2613436` fixes verifier nesting, supported objective and nonzero failure exits. Known-pass/known-fail real episodes pass their contract. The default demo remains 0/30 feasible and correctly exits 1; it is not falsely reported as a successful mission campaign. |
| SCN-080 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `2005a1f` shares secular coefficients and complete state derivatives across backend/frontend. Nine targets at five independent Horizons epochs pass declared sampled caps; supported interval, target identity and approximate fidelity are explicit, not continuous precision guarantees. |
| SCN-081 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `2005a1f` derives generic nodal direction from the native inclination convention, preserving measured overrides. All generic signs and independent Carme/Himalia representative rate captures pass; full moon accuracy remains `043`. |
| SCN-082 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `71ba472` preserves unknown taxonomy/albedo, source precision and real diameters, fixes the radius/diameter coefficient, and labels integrity separately from fidelity. Full-artifact source comparison passes. |
| SCN-083 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `9221a61` uses cited IAU J2000 poles and encodes spin direction once. Signed angular-velocity regressions cover Venus/Uranus/Pluto; this is not a true-of-date PCK orientation model. |

## 5. Dated candidate-fix reconciliation (2026-10-14)

| Canonical IDs | Fixing branch/head | Current landing status |
|---|---|---|
| 026,027,032,033; partial 034 | `fix/tracker-merge-2026-10-11@952de6a` | Merged by PR #7 (`6a9de62`). Remaining 034 work stays open. |
| 052 | `fix/scn-052-reserve-partition@44503ec` | Merged by PR #8 (`bb2e8ef`). |
| 053 | `fix/scn-053-rebound-epoch-contract@9102c18` | Merged by PR #9 (`1fa45f0`). |
| 056 | `fix/scn-056-epo-family-policy@2605f25` | Integrated in the remediation branch; not on product main. |
| 064 | `fix/scn-064-lambert-antiparallel@3927ab7` | Merged by PR #11 (`f45c1f9`). |
| 037,070,071 | `remediation/canonical-register-20261014@a33ad93` | 59 focused runtime tests passed; not on product main. |

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

| Alias | Source | Relation | Canonical target | Treatment |
|---|---|---|---|---|
| F-SOL-01 | Oct 6 Appendix B | SUPERSEDED | SCN-029 | Stale assertion was a CI-red symptom; scoped workflow root is resolved. |
| F-SOL-02 | Oct 6 Appendix B | MERGE | SCN-005 | Solar computation/deadline delivery contract. |
| F-SOL-03 | Oct 6 Appendix B | SPLIT | SCN-062, SCN-042 | Default lifetime is resolved; wider coordinate/capacity questions remain VERIFY. |
| F-SOL-04 | Oct 6 Appendix B | MERGE | SCN-042 | Solar pole/frame/projection family. |
| F-SOL-05 | Oct 6 Appendix B | MERGE | SCN-032 | README versus shipped solar/SMBH behavior. |
| F-SOL-06 | Oct 6 Appendix B | MERGE | SCN-038 | Wall-time solar animation policy. |
| F-SOL-07 | Oct 6 Appendix B | SPLIT | SCN-005, SCN-042, SCN-048 | Visible delivery state plus unvalidated AIA/model capability. |
| F-SOL-08 | Oct 6 Appendix B | MERGE | SCN-065 | Stochastic-only event engine never advances. |
| F-SOL-09 | Oct 6 Appendix B | SPLIT | SCN-066, SCN-023, SCN-030 | Control semantics, underlying metric-state mutation, and accessible copy are separate. |
| F-SOL-10 | Oct 6 Appendix B | SPLIT | SCN-067, SCN-042 | Mesh lifecycle is OPEN; plane/frame claim remains VERIFY. |
| F-SOL-11 | Oct 6 Appendix B | SPLIT | SCN-021, SCN-069 | Radius arithmetic is resolved; directions/jet kinematics remain open. |
| F-SOL-12 | Oct 6 Appendix B | MERGE | SCN-047 | Live visual test-coverage/release gate. |
| F-SOL-13 | Oct 6 Appendix B | SUPERSEDED | SCN-042 | Presentation-scale subclaim fixed by later H2 work; broader solar geometry remains. |
| F-SOL-14 | Oct 6 Appendix B | SPLIT | SCN-042, SCN-049 | VERIFY children: color/granulation/limb claims lack current screen-space measurement. |
| F-SOL-15 | Oct 6 Appendix B | VERIFY_CHILD | SCN-049 | Schema-validation inconsistency retained without a current consumer failure. |
| F-SOL-16 | Oct 6 Appendix B | MERGE | SCN-068 | Latent unimported `SGR_A` default. |
| F-SOL-17 | Oct 6 Appendix B | SPLIT | SCN-032, SCN-049 | Advertised unreachable modules: claim truth plus dormant-code queue. |
| F-SOL-18 | Oct 6 Appendix B | VERIFY_CHILD | SCN-047 | Startup texture cost was not remeasured at current snapshot. |
| F-SOL-19 | Oct 6 Appendix B | SPLIT | SCN-032, SCN-049 | Stale documentation and residual code comments. |
| F-API-01 | Oct 6 Appendix B | MERGE | SCN-005 | Same solar deadline root as F-SOL-02/F-SCI-01. |
| F-API-02 | Oct 6 Appendix B | SUPERSEDED | SCN-005 | Old supervisor-discard path was replaced; retained delivery gate remains. |
| F-API-03 | Oct 6 Appendix B | SUPERSEDED | SCN-029 | Historical CI-red symptom. |
| F-API-04 | Oct 6 Appendix B | MERGE | SCN-070 | WebSocket command-error latch. |
| F-API-05 | Oct 6 Appendix B | SPLIT | SCN-048, SCN-049 | VERIFY children: network auth/path containment improved; residual local-profile policy needs explicit review. |
| F-API-06 | Oct 6 Appendix B | MERGE | SCN-071 | Stalled reader/send timeout and slot lifecycle. |
| F-API-07 | Oct 6 Appendix B | SPLIT | SCN-037, SCN-047 | Simulation-rate contract and load gate. |
| F-API-08 | Oct 6 Appendix B | SPLIT | SCN-048, SCN-010, SCN-047 | AIA date coverage, cache policy, and amplification/load. |
| F-API-09 | Oct 6 Appendix B | MERGE | SCN-072 | Same unsupported-epoch/typed-error root as F-TRJ-05. |
| F-API-10 | Oct 6 Appendix B | VERIFY_CHILD | SCN-049 | Operational structured-logging debt. |
| F-API-11 | Oct 6 Appendix B | VERIFY_CHILD | SCN-049 | Composition-root architecture debt, not an atomic runtime failure. |
| F-API-12 | Oct 6 Appendix B | VERIFY_CHILD | SCN-047 | Backend API end-to-end test coverage. |
| F-API-13 | Oct 6 Appendix B | SPLIT | SCN-032, SCN-039, SCN-048 | Documentation, configuration, and deployment trust. |
| F-API-14 | Oct 6 Appendix B | VERIFY_CHILD | SCN-049 | Error-shape/path-disclosure hygiene. |
| F-API-15 | Oct 6 Appendix B | VERIFY_CHILD | SCN-048 | Deployment/uvicorn trust boundary. |
| F-API-16 | Oct 6 Appendix B | SPLIT | SCN-071, SCN-077, SCN-047 | Runner/send lifecycle, Tudat contract, and remaining soak verification. |
| F-API-17 | Oct 6 Appendix B | VERIFY_CHILD | SCN-047 | Shared-executor head-of-line/load behavior. |
| F-API-18 | Oct 6 Appendix B | MERGE | SCN-027 | Backend runtime/test dependency setup. |
| F-API-19 | Oct 6 Appendix B | SPLIT | SCN-073, SCN-048 | Redirect hardening is open; live-provider trust remains VERIFY. |
| F-SCI-01 | Oct 6 Appendix B | MERGE | SCN-005 | Scalar PFSS tracing was the solar deadline root. |
| F-SCI-02 | Oct 6 Appendix B | SUPERSEDED | SCN-029 | Same stale mutation-patch root as F-REPO-01; scoped CI now passes. |
| F-SCI-03 | Oct 6 Appendix B | MERGE | SCN-074 | REBOUND fallback-body element-epoch initialization. |
| F-SCI-04 | Oct 6 Appendix B | MERGE | SCN-075 | Synthetic magnetogram temporal/coherence defect. |
| F-SCI-05 | Oct 6 Appendix B | SPLIT | SCN-037, SCN-047 | Same Kuiper rate/load family as F-API-07. |
| F-SCI-06 | Oct 6 Appendix B | SPLIT | SCN-041, SCN-047 | Scientific mutation coverage and wider release evidence. |
| F-SCI-07 | Oct 6 Appendix B | SPLIT | SCN-041, SCN-048 | VERIFY children: real GONG pixels/provider behavior remain unverified, not SCN-051. |
| F-SCI-08 | Oct 6 Appendix B | SPLIT | SCN-076, SCN-057, SCN-049 | PR-drag formula is open; callback ABI and other dormant-force questions are separate. |
| F-SCI-09 | Oct 6 Appendix B | MERGE | SCN-077 | Tudat reseeding/time metadata; energy-origin issue remains SCN-055. |
| F-SCI-10 | Oct 6 Appendix B | SPLIT | SCN-032, SCN-042 | Model-label truth and solar semantics. |
| F-SCI-11 | Oct 6 Appendix B | MERGE | SCN-041 | WSA formula/calibration family. |
| F-SCI-12 | Oct 6 Appendix B | SPLIT | SCN-050, SCN-049 | Hathaway normalization plus latent NaN-clamp verification child. |
| F-SCI-13 | Oct 6 Appendix B | VERIFY_CHILD | SCN-049 | Preserved IAS15 configuration/test caveat; seeding crash is not reopened. |
| F-SCI-14 | Oct 6 Appendix B | SUPERSEDED | SCN-029 | Vestigial `wall_jd` CI symptom was corrected. |
| F-TRJ-01 | Oct 6 Appendix B | MERGE | SCN-012 | Benchmark provenance/non-comparability. |
| F-TRJ-02 | Oct 6 Appendix B | SPLIT | SCN-019, SCN-020 | Cargo mass closure and infeasible-risk reporting. |
| F-TRJ-03 | Oct 6 Appendix B | MERGE | SCN-078 | V-infinity sum consumed as propulsive burn. |
| F-TRJ-04 | Oct 6 Appendix B | MERGE | SCN-044 | MGA search-quality capability. |
| F-TRJ-05 | Oct 6 Appendix B | MERGE | SCN-072 | Same epoch/typed-error root as F-API-09. |
| F-TRJ-06 | Oct 6 Appendix B | MERGE | SCN-079 | Three-root EPO false-green bundle; distinct from SCN-056. |
| F-TRJ-07 | Oct 6 Appendix B | VERIFY_CHILD | SCN-048 | Live Horizons/SPICE provider compatibility. |
| F-TRJ-08 | Oct 6 Appendix B | SPLIT | SCN-045, SCN-047 | Independent Lambert/MGA oracle and release coverage. |
| F-TRJ-09 | Oct 6 Appendix B | MERGE | SCN-080 | Backend fixed-element ephemeris accuracy. |
| F-TRJ-10 | Oct 6 Appendix B | SPLIT | SCN-064, SCN-045 | Fresh near-π failure is OPEN; near-zero/exact-π/tolerance remain VERIFY. |
| F-TRJ-11 | Oct 6 Appendix B | VERIFY_CHILD | SCN-047 | Sustained containment/load and truncation behavior. |
| F-TRJ-12 | Oct 6 Appendix B | SPLIT | SCN-032, SCN-044, SCN-049 | Documentation, periapsis/search policy, and field-label truth. |
| F-FEC-01 | Oct 6 Appendix B | MERGE | SCN-032 | README versus live entry UI. |
| F-FEC-02 | Oct 6 Appendix B | MERGE | SCN-081 | Generic retrograde moon-node sign. |
| F-FEC-03 | Oct 6 Appendix B | MERGE | SCN-043 | Full moon coverage/accuracy umbrella. |
| F-FEC-04 | Oct 6 Appendix B | MERGE | SCN-060 | Earth/Mars double-click picking. |
| F-FEC-05 | Oct 6 Appendix B | MERGE | SCN-059 | Earth/Mars physical-scale quadtree behavior. |
| F-FEC-06 | Oct 6 Appendix B | VERIFY_CHILD | SCN-047 | Startup/catalog jank requires current browser timing. |
| F-FEC-07 | Oct 6 Appendix B | SPLIT | SCN-024, SCN-030 | Paused KBO work and repeated HUD announcements/writes. |
| F-FEC-08 | Oct 6 Appendix B | VERIFY_CHILD | SCN-049 | Worker/code-path architecture debt. |
| F-FEC-09 | Oct 6 Appendix B | VERIFY_CHILD | SCN-049 | Main composition/dead-module architecture debt. |
| F-FEC-10 | Oct 6 Appendix B | SPLIT | SCN-023, SCN-038 | Canonical-state mutation and pause/time semantics. |
| F-FEC-11 | Oct 6 Appendix B | MERGE | SCN-082 | Synthetic asteroid science fields. |
| F-FEC-12 | Oct 6 Appendix B | SPLIT | SCN-043, SCN-047 | Orbital-gate coverage gaps and broader release evidence. |
| F-FEC-13 | Oct 6 Appendix B | MERGE | SCN-083 | Planet pole/retrograde-spin consistency. |
| F-FEC-14 | Oct 6 Appendix B | SPLIT | SCN-013, SCN-049 | Float-JD root is OPEN; fake perturbation remains a VERIFY child. |
| F-FEC-15 | Oct 6 Appendix B | SPLIT | SCN-014, SCN-046, SCN-047 | Round-trip contract plus artifact/cache/timeout verification. |
| F-FEC-16 | Oct 6 Appendix B | SPLIT | SCN-033, SCN-039 | Broken maintenance tooling and unused configuration. |
| F-FEC-17 | Oct 6 Appendix B | SPLIT | SCN-035, SCN-049 | Asset licensing/provenance and repository clutter. |
| F-FEC-18 | Oct 6 Appendix B | VERIFY_CHILD | SCN-049 | Vestigial/duplicated numerics and stale comments. |
| F-FEC-19 | Oct 6 Appendix B | SPLIT | SCN-037, SCN-038, SCN-059, SCN-049 | Timing, scale, buffer disposal, and hidden-tab runtime subclaims. |
| F-FEC-20 | Oct 6 Appendix B | SPLIT | SCN-025, SCN-068 | Type debt plus the concrete latent `SGR_A` root. |
| F-FEC-21 | Oct 6 Appendix B | SPLIT | SCN-016, SCN-018, SCN-032 | Earth/Pluto interval and user-facing accuracy claims. |
| F-REPO-01 | Oct 6 Appendix B | SUPERSEDED | SCN-029 | Same mutation-patch root as F-SCI-02; scoped CI fixed. |
| F-REPO-02 | Oct 6 Appendix B | SUPERSEDED | SCN-029 | Historical no-green-CI symptom. |
| F-REPO-03 | Oct 6 Appendix B | MERGE | SCN-032 | README materially misdescribes the shipped product. |
| F-REPO-04 | Oct 6 Appendix B | MERGE | SCN-027 | Backend install/test dependency contract. |
| F-REPO-05 | Oct 6 Appendix B | SPLIT | SCN-029, SCN-047 | CI gate structure is scoped-resolved; broader release verification remains. |
| F-REPO-06 | Oct 6 Appendix B | SPLIT | SCN-033, SCN-034 | Unsafe/broken maintenance commands and generator safety. |
| F-REPO-07 | Oct 6 Appendix B | SPLIT | SCN-035, SCN-049 | Orphan assets, provenance, and hygiene. |
| F-REPO-08 | Oct 6 Appendix B | SPLIT | SCN-028, SCN-039, SCN-048 | Toolchain, host/configuration, and deployment exposure. |
| F-REPO-09 | Oct 6 Appendix B | SPLIT | SCN-028, SCN-029 | Dependency advisories and CI pinning. |
| F-REPO-10 | Oct 6 Appendix B | VERIFY_CHILD | SCN-047 | Integrated end-to-end/coverage gap. |
| F-REPO-11 | Oct 6 Appendix B | SPLIT | SCN-005, SCN-029, SCN-047 | Solar timing, CI tests, and production-budget validation. |
| F-REPO-12 | Oct 6 Appendix B | MERGE | SCN-040 | Process/history evidence durability. |
| F-REPO-13 | Oct 6 Appendix B | MERGE | SCN-027 | Backend test-environment pinning. |
| F-REPO-14 | Oct 6 Appendix B | MERGE | SCN-029 | Mutation verifier soundness subclaim under scoped CI. |
| F-REPO-15 | Oct 6 Appendix B | MERGE | SCN-035 | License/NOTICE and data terms. |
| F-REPO-16 | Oct 6 Appendix B | SPLIT | SCN-032, SCN-040, SCN-049 | Stale docs, durable records, and residual hygiene. |
| F-REPO-17 | Oct 6 Appendix B | SPLIT | SCN-040, SCN-049 | Repository/audit clutter and preservation. |
| KF-1 | Oct 6 report | SPLIT | SCN-029, SCN-005, SCN-025 | CI-red rollup; owning roots remain separately scoped. |
| KF-2 | Oct 6 report | MERGE | SCN-005 | Solar deadline/delivery rollup. |
| KF-3 | Oct 6 report | MERGE | SCN-032 | README/product-truth rollup. |
| KF-4 | Oct 6 report | SPLIT | SCN-021, SCN-038, SCN-042, SCN-047, SCN-049, SCN-062 | Solar/SMBH presentation rollup. |
| KF-5 | Oct 6 report | SPLIT | SCN-012, SCN-019, SCN-020, SCN-078, SCN-079 | Benchmark and mission-validation rollup. |
| KF-6 | Oct 6 report | SPLIT | SCN-032, SCN-049 | Unexposed backend/product-claim rollup. |
| KF-7 | Oct 6 report | MERGE | SCN-049 | Architecture/dead-weight rollup. |
| KF-8 | Oct 6 report | SPLIT | SCN-041, SCN-043, SCN-045, SCN-047 | Test/oracle portfolio rollup. |
| KF-9 | Oct 6 report | SPLIT | SCN-037, SCN-047, SCN-048, SCN-049 | Backend lifecycle/input residual rollup. |
| KF-10 | Oct 6 report | SPLIT | SCN-023, SCN-024, SCN-038, SCN-043, SCN-049, SCN-059, SCN-060 | Frontend correctness rollup. |
| KF-11 | Oct 6 report | SPLIT | SCN-027, SCN-028, SCN-033, SCN-034, SCN-035, SCN-039, SCN-040, SCN-049 | Supply-chain/tooling/documentation rollup. |
| R1 | Oct 11 accessibility review | MERGE | SCN-030 | Root overflow/minimum-width reflow defect; planned, not fixed. |
| R2 | Oct 11 accessibility review | MERGE | SCN-030 | Panel modality/breakpoint focus defect; planned, not fixed. |
| R3 | Oct 11 accessibility review | MERGE | SCN-030 | Canvas keyboard/tap camera access defect; planned, not fixed. |
| R4 | Oct 11 accessibility review | MERGE | SCN-030 | Rendered accessibility evidence architecture; planned, not fixed. |
| R5 | Oct 11 accessibility review | MERGE | SCN-030 | Repeated HUD/search announcement behavior; planned, not fixed. |
| R6 | Oct 11 accessibility review | MERGE | SCN-030 | Mobile controls/context and target behavior; planned, not fixed. |
| R7 | Oct 11 accessibility review | MERGE | SCN-030 | Experiment copy/dispatch presentation; underlying engine semantics remain SCN-066/023. |
| R8 | Oct 11 accessibility review | SPLIT | SCN-026, SCN-030, SCN-047 | Product-test discovery, UI regression coverage, and browser release evidence. |
| SOL-01 | Oct 10 solar report | MERGE | SCN-010 | Realtime failure-cache recovery. |
| SOL-02 | Oct 10 solar report | MERGE | SCN-004 | Total upstream acquisition deadline. |
| SOL-03 | Oct 10 solar report | MERGE | SCN-050 | Hathaway normalization split from the broader solar queue. |
| SOL-04 | Oct 10 solar report | MERGE | SCN-051 | FITS parser-to-PFSS admission. |
| PHYS-N01 | Oct 10 physics report | MERGE | SCN-052 | Protected reserve/burn partition. |
| PHYS-N02 | Oct 10 physics report | MERGE | SCN-053 | REBOUND playback epoch escape. |
| PHYS-N03 | Oct 10 physics report | MERGE | SCN-054 | Kuiper binary invariants. |
| PHYS-N04 | Oct 10 physics report | MERGE | SCN-055 | Tudat energy origins. |
| PHYS-N05 | Oct 10 physics report | MERGE | SCN-056 | Direct EPO family policy. |
| PHYS-N06 | Oct 10 physics report | MERGE | SCN-057 | REBOUND force callback API. |
| F-NEW-1 | Oct 10 frontend report | MERGE | SCN-061 | Planet-face shader coordinate order. |
| F-NEW-2 | Oct 10 frontend report | MERGE | SCN-058 | Quadtree LOD merge lifecycle. |
| F-NEW-3 | Oct 10 frontend report | MERGE | SCN-059 | Physical scale and quadtrees. |
| F-NEW-4 | Oct 10 frontend report | MERGE | SCN-060 | Earth/Mars picking. |
| F-NEW-5 | Oct 10 frontend report | MERGE | SCN-062 | Default-scale flare/CME lifetime. |
| EXTRA-1 | Oct 11 merged evidence | VERIFY_CHILD | SCN-043 | Dione/Rhea historical half-orbit offsets need a fresh external oracle. |
| EXTRA-2 | Oct 11 merged evidence | MERGE | SCN-081 | Current generic retrograde-node sign mechanism. |

## 7. Named verification children not promoted to new OPEN IDs

These source findings retain their original identities and evidence contracts.
They were not promoted at the original reconciliation because evidence was
conditional or they described acceptance/debt rather than one atomic defect.
This table is not a claim that each child is still unimplemented. Current
implemented portions and remaining proof are separated in Section 4 and the
closure plan; no umbrella row closes without dispositions for its children.

| Source finding | Canonical queue | Required evidence |
|---|---|---|
| Dione/Rhea historical half-orbit offsets (`EXTRA-1`) | SCN-043 | Fresh parent-relative external states over the declared coverage interval. |
| Lambert near-zero geometry and root-exit tolerance | SCN-045 | Rerun independent endpoint/velocity cases after the current Lambert changes; do not infer from SCN-064's near-π result. |
| AGN grid plane, solar color/granulation/limb behavior | SCN-042/049 | Declared frames plus actual screen/GPU measurements. |
| Realtime-client schema inconsistency and reconnect details | SCN-049 | Distinguish optional `SimulationClient` protocol verification from active solar HTTP payload/consumer checks. Retain dated library schema/reconnect evidence without claiming full session restoration or default-UI N-body acceptance; active consumers retain their own browser requirements. See the [three verification boundaries](#simulationclient-scope-decision--2026-10-17). |
| Solar startup texture cost and slot/capacity saturation | SCN-047/062 | Current browser startup/event-load timing with a declared host and denominator. |
| Benchmark report writer local-profile/Host/NUL policy | SCN-048/049 | Re-evaluate under the authenticated network profile and explicit trusted-loopback contract. |
| Structured logging, server composition, error-shape, and shared-executor debt | SCN-047/048/049 | Operational acceptance criteria and current integrated failure/load evidence. |
| Remaining task-exception and optional-Tudat epoch clauses | SCN-047/077 | Soak tests and a real Tudat environment. |
| Real GONG/provider truth | SCN-041/048 | Timestamped bounded real-provider fixtures/captures and independent map calibration. |
| Latent solar `_clamp(NaN)` behavior | SCN-049 | A supported ingress/caller path or explicit numerical policy; current HTTP epoch ingress rejects nonfinite input. |
| Asteroid fake perturbation and loader cache/timeout residuals | SCN-013/014/046/047/049 | Current caller impact, network/cache contract, and independent numerical meaning. |
| Frame-loop isolation, hidden-tab jump, belt buffer disposal, orphan assets, dead modules | SCN-035/037/038/047/049/059 | Focused current reproductions split by lifecycle root. |

## 8. Historical disposition changes at the pinned main baseline

This table records the main baseline named above, not newer construction-branch
progress or a fresh remote check.

| Canonical ID | Fixing evidence | Result at pinned main baseline |
|---|---|---|
| SCN-005 | PR #4/#5, especially `82dd139` | Visible fallback/source status shipped; production delivery remains open. |
| SCN-012 | `dc1f0ab7ffacb564b81f71fad1ccd21d2fbeb0e6` | Null undefined metrics and two fixed-state oracles; legacy 0/3 coverage remains. |
| SCN-016 | `fea6f9d26943342ce3c898e773fb8be82633b164` | Geocentric runtime Earth; scoped resolved. |
| SCN-018 | `fc32483de365e81af98580fe5c6c3184ebe4398c` | Pluto secular model/gate; scoped resolved. |
| SCN-019/020 | `62a4f5dc55353dfb90472a91db62e7382902a6a5` | Cargo ledger resolved; deterministic risk improved; discarded-fuel margin remains. |
| SCN-021 | `eef8945cbc3eba45d46051f98166b355de3ee5c6` | SMBH radius/unit root resolved; source direction/jet root promoted to `069`. |
| SCN-022 | `7a214680d351d6449999663dca5e5d5fd8aaec71` | CPU Kepler root resolved; GLSL twin remains VERIFY. |
| SCN-042/050 | `a91ce42ce01fc4573de3d1d0be40eaa90cf32ea1`, `0ea15f8a1599598490ff455ceae872ec24263682` | Rotation label and backend Hathaway fixed; broader queue/frontend implementation remain. |
| SCN-043 | `0caa1bd6fc3445a91133a50a526bbb551b0060b2` | Io/Europa/Triton corrected; full coverage remains partial. |
| SCN-044 | `838e7bfeb42ea7bb450c6ff847ac700d0c90991f` | Per-body/equatorial periapsis policy improved; search-quality oracle remains. |
| SCN-045 | `62fd99a5dcae23552d5fdad43adcef2061b6356b` | Multi-rev/hyperbolic/zero-rev work landed; exact-π and `064` remain. |
| SCN-049 children | `dcef69b6ca473e28507e489456f962e92e88792c`, `074759c8d07b93c9e04c0850430b6106abccd1be`, `607ba0dc6796165032ae54d32892ff1451ab4a99` | Sirius period, galactic-tide axes, and Trojan phasing resolved without closing the umbrella. |
| SCN-062 | `b5387c257a4d95b72097ee46407c1aea051bbc65` | Default-scale event lifetime fixed and tested. |

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

| Label | Branch / exact commit | Commit time | Git tree |
|---|---|---|---|
| M | `main` — `e7de6cc20ea0880da230432ea0c44f8f6ae93829` | 2026-10-10 01:57:51 −04:00 | `7feafab6cfd67455cc4bea8c47cba08e95bbeab6` |
| C | `fix/ci-red-on-main` — `0523a5bc94360f281f5c8c692b16a4fbc6dd60bc` | 2026-10-10 02:53:11 UTC | Same tree as M |
| T | `fix/trajectory-amplification-defense-in-depth` — `e40fc8cff85a8c7cf5dd24d0a135552faf424a20` | 2026-10-09 01:34:10 −04:00 | `59c58881470f8a240195e1f1bba7b92ae1565d53` |

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

| Trigger | Observed failure / scope | IDs |
|---|---|---|
| Request a near-antiparallel Lambert transfer | At 179.999999°, returned velocity is wrong by 5.101 km/s and independent REBOUND propagation misses the target by 209 million km despite a ~1.12e-10-day scalar TOF residual. All tips. | SCN-064 |
| Split an otherwise identical vehicle burn into two | `[4.8]` km/s is infeasible but `[2.4,2.4]` is feasible, spending below the original 50 kg reserve. All tips. | SCN-052 |
| Zoom out after Earth/Mars subdivision | Actual attached quadtree meshes go 6 → 36 → **0**. Separately, the planet shader applies face translations after radius projection, placing a reference Earth vertex ~0.5 AU from its centre. All tips. | SCN-058, SCN-061 |
| Trust the benchmark's zero error | All three reference scenarios remain incomparable; reported mean error is still 0.0 with zero coverage. All tips. | SCN-012 |
| Advance REBOUND past its supported upper date | `step(1)` at the upper bound emits an unsupported epoch with `fidelity: high`; direct seeking to the same date rejects it. All tips. | SCN-053 |
| Recover SWPC after a brief outage | Failed aggregate snapshot persists at +5 and +299 seconds; recovery is fetched only at +301 seconds. Main/CI reproduced. | SCN-010 |
| Upstream headers trickle or DNS stalls | A 50 ms realtime acquisition budget takes ~404 ms for local byte-drip headers or ~201 ms for a controlled resolver delay. Thread ownership survives the deadline. Main/CI. | SCN-004 |
| Run normal tests with the existing H1 audit archive present | Six archived suites fail imports on both distinct source trees even though all product suites pass. | SCN-026 |
| Invoke the moon updater with `--help` | In an isolated temporary copy, a matching empty upstream table causes exit 0 and overwrites the catalog with `[]`. The user's real catalog was untouched. | SCN-033 |
| Enable presently dormant features | Accepted float64 FITS fails downstream PFSS admission; Tudat energy changes under translation; SRP/tide callbacks fail on actual REBOUND pointer arguments. These are activation hazards with explicit scope. | SCN-051, SCN-055, SCN-057 |

The older T branch additionally retains the wrong PFSS basis, valid-FITS crash, lost grid semantics, caller-controlled solar rate identities, rejected preview origins and stale observation assimilation. None should be reintroduced over the main fixes.

### October 10 — 3. Fresh validation matrix

Frontend validation uses Node **22.23.2**, npm **10.9.8**. Python is **3.12.13**. The initial npm dependency installation used the host Node 24/npm 11, then the checks used the pinned binaries. Browser evidence uses Chromium software WebGL and host Node 24 as documented in its report. No hardware GPU benchmark is claimed.

| Check | Main / identical CI tree | Trajectory | Evidence under `CODEBASE_SCAN_2026-10-10_EVIDENCE/` |
|---|---|---|---|
| `npm test`, clean extracted tree | **PASS: 21 files, 309 tests** | **PASS: 14 files, 162 tests** | `validation/*-02-npm-test.log` |
| Same command with pre-existing H1 archive copied into snapshot | **FAIL: six archival suites; product tests pass** | Same six archival failures; product tests pass | `validation/*-with-h1-archive.log`, `h1-archive-discovery.json` |
| Strict `npm run typecheck` | **FAIL: 219 diagnostics** | **FAIL: 240 diagnostics** | `validation/*-03-npm-run-typecheck.log` |
| `npm run typecheck:ratchet` | **PASS: 219 within 226 baseline; no bucket growth** | Command absent | `validation/main-08-npm-run-typecheck-ratchet.log` |
| `npm run build` | **PASS** | **PASS** | `validation/*-04-npm-run-build.log` |
| Planet positions | **PASS: eight planets × six epochs = 48 rows** | Same gate passes | `validation/*-05-npm-run-verify-planet-positions.log` |
| Moon frame/accuracy gate | **PASS: 20 moons × seven epochs = 140 rows** | Same gate passes | `validation/*-06-npm-run-verify-moon-frames.log` |
| Full `pytest -q backend/tests` | **PASS: 2,142; 246.35 s**, exact declared CI package list | **PASS: 458; 61.34 s**, runtime requirements plus separately added `httpx2` | `validation/main-backend-tests.log`, `trajectory-backend-tests.log` |
| Fresh runtime-requirements-only backend collection | **FAIL: 11 collection errors**, missing `httpx2` with resolved Starlette 1.7 | **FAIL: eight collection errors**, same missing prerequisite | `validation/*-fresh-install.log` |
| CI verifier/workflow contracts | **PASS: 21 tests** | Absent | `validation/main-ci-contracts.log` |
| Exact R3/R4 baseline plus mutation verifier, `all` | **PASS: six required nodes, six mutants killed** | Absent | [structured summary](CODEBASE_SCAN_2026-10-10_EVIDENCE/validation/science-gate/summary.json), JUnit siblings |
| `npm audit --json` | **11 affected entries: 2 critical, 6 high, 2 moderate, 1 low** | Same counts | `validation/*-07-npm-audit---json.log` |
| Browser bootstrap and interaction probes | Boots with ten body options, no pageerrors with WebGL; accessibility/no-WebGL defects reproduced | Same startup result and shared defects | [browser observations](CODEBASE_SCAN_2026-10-10_EVIDENCE/frontend/browser-results.json) |
| Main client success → 503 → recovery | Last good physics retained; realtime fresh → stale → fresh | Old flow separately inspected; no equivalent recovery assertion | [client observations](CODEBASE_SCAN_2026-10-10_EVIDENCE/frontend/delivery-results.json) |

Registry audit entries are not unique vulnerabilities or proof that the production Three.js bundle is exploitable. Exact advisory payloads are retained. The ratchet prevents growth; it does not make strict TypeScript pass. Runtime requirements and the pinned CI test environment are distinct: main's reproducible test lane is real progress, while the README/runtime-only developer path still fails collection.

**Production solar latency is not established by the 2,142-test pass.** `backend/tests/conftest.py:68–89` raises selected content tests from the production 18-second budget to 60 seconds because slow CI hosts exceed 18 seconds. The browser now allows 20 seconds and the server caps configuration at 19 seconds; this fixes the old timeout-contract mismatch, but a fresh production-budget, five-minute browser delivery gate remains outstanding. Process kill/reap, saturation, crash, cancellation and capacity-recovery tests are covered separately.

The science mutation gate detects the old recurrence, wrong equal-area weighting, duplicate m-normalization, corrupt source-surface factors, omitted shell crossings and vector-magnitude WSA expansion. It does not certify real GONG pixels, calibrated WSA speeds, deployment settings, all frontend types or multi-worker release architecture. Main deliberately disables observed GONG runtime acquisition and unvalidated assimilation/spatial AIA use; hybrid returns synthetic provenance, and data-driven physics reports unavailable.

### October 10 — 4. Existing IDs: current branch-specific register

The linked domain reports carry precise snapshot line references and full reproduction details: [solar](CODEBASE_SCAN_2026-10-10_EVIDENCE/solar/report.md), [backend integration](CODEBASE_SCAN_2026-10-10_EVIDENCE/backend/integration-review.md), [physics/data/mission](CODEBASE_SCAN_2026-10-10_EVIDENCE/physics/REPORT.md), [frontend](CODEBASE_SCAN_2026-10-10_EVIDENCE/frontend/REPORT.md). Historical acceptance criteria remain available in the [October 7 tracker](CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-07.md); where changed, the criteria below supersede them.

| ID / priority | Main / CI | Trajectory | Current evidence and closure criterion |
|---|---|---|---|
| SCN-001 · P0 | RESOLVED: examined basis/decomposition | OPEN / OBS | M has correct P₂=-.125/P₃=-.4375 at μ=.5, overlap ~1.28e-14 and quadrupole reconstruction; mutation gate passes. T returns -.633911/-1.134220 and overlap -.945074. Preserve independent harmonic/pole/field gates. |
| SCN-002 · P1 | RESOLVED: original dtype crash | OPEN / OBS | Valid frozen FITS parses on M. T raises `AttributeError` on `np.float32.newbyteorder`. Use a valid parser-to-source-status fixture; M's separate float64 admission defect is SCN-051. |
| SCN-003 · P1 | RESOLVED: explicit grid contract | OPEN / CODE | M carries WCS, orientation, exact area weights and weighted decomposition; T still maps sine-latitude pixels into uniform θ assumptions. Preserve fixture orientation/area/harmonic gates. Real observed accuracy remains unverified. |
| SCN-004 · P1 | OPEN / OBS, narrower residual | OPEN / CODE | M bounds bytes/redirects/framing/gzip and body reads, but blocking header/DNS acquisition exceeds total deadlines. T retains unbounded legacy acquisition and wrong-rotation fallback. Require bounded completion/resource recovery for DNS, headers, bodies and cancellation; GONG residual is offline on M. |
| SCN-005 · P1 | OPEN / CODE + browser OBS, materially improved | OPEN / CODE | M separates realtime/physics polling and adds process containment, last-good state and compatible deadlines, but no shipped UI consumes `getSolarDeliveryStatus`: refused backend still displays “Live simulation” without solar error/source state. T retains 900 ms polling/2.6 s timeout and observation coupling. Require visible provenance/state plus real production-budget dev/preview delivery. Old 4.094 s is historical, not remeasured. |
| SCN-006 · P1 | RESOLVED: default preview CORS | OPEN / OBS | Fresh localhost and 127.0.0.1:4173 preflights pass on M and fail on T; 5173 passes. Preserve origin tests and verify actual configured deployment/browser resources separately. |
| SCN-007 · P1 | RESOLVED: original identity bypass/store bounds | OPEN / OBS | M collapses 50 rotating XFF/key values to one transport identity: 36 admitted/14 rejected; bounded stores/trusted proxies covered. T admits all 50 and creates 50 entries. Preserve authenticated/trusted transport policy, caps and eviction. |
| SCN-008 · P1 | RESOLVED: `/solar/physics` admission | OPEN / OBS | M rejects ±1e30 before compute and bounds JDTDB to J2000±200 Julian years. T reaches the recording compute stub. Do not generalize closure to AIA tile historical-date coverage: its route only resolves finite aliases; that contract remains under SCN-048. |
| SCN-009 · P1 | RESOLVED by explicit disable/fallback | OPEN / OBS | M stale input leaves .8 unchanged, `applied=false`, `disabled_unvalidated`; T changes .8→.625 with confidence0/weight.25. This is safe disabling, not delivered validated assimilation. Require independently validated epoch/provenance policy before enabling. |
| SCN-010 · P1 | OPEN / OBS | OPEN / CODE | M aggregate failure cache suppresses SWPC recovery until normal 300 s expiry despite 4.5 s failure-backoff machinery; T retains mechanism. SILSO last-known-good handling is improved and must be preserved. Gate failed/partial snapshots, bounded retry and source age independently. |
| SCN-011 · P2 | RESOLVED: UTC ingestion contract | OPEN / CODE | M canonicalizes AIA dates to UTC before frontend `Date.parse`; relevant backend tests pass. T keeps raw zone-less strings. Preserve canonical UTC ingestion and cross-timezone freshness tests; old timezone offsets are not a new live-provider observation. |
| SCN-012 · P0 | OPEN / OBS | OPEN / OBS | Fresh Kepler benchmark: three scenarios, zero comparable, coverage0 and mean error0.0. Source `backend/benchmark/accuracy.py:509–538`. Require independent fixed states, nonzero comparison coverage and unavailable/null undefined metrics. |
| SCN-013 · P1 | OPEN / OBS, CPU input arithmetic | Same | Shader absolute float32 JD2461320.125 rounds to2461320, ULP .25 day. No fresh GPU position-error estimate. Use relative/split time, CPU-vs-GPU subday gates and actual GPU readback. |
| SCN-014 · P1 | OPEN / OBS, ACBF format validator | Same | Own 100,000-record round trip reports99,916 mismatches, max epoch error≈.125 day. This is not evidence of corruption in the separate shipped ASPH artifact, which passes its integrity gate. Define field-specific precision/encoding contracts. |
| SCN-015 · P2 | OPEN / CODE, population policy | Same | App selects first50,000 records from a diameter-descending catalog. Declare large-body subset or implement reproducible representative sampling and population gates. No new bias distribution measured. |
| SCN-016 · P1 | OPEN / CODE + primary-source identity | Same | “Earth” uses JPL's EM Bary elements without lunar correction. The [JPL table](https://ssd.jpl.nasa.gov/planets/approx_pos.html) was rechecked. Label EMB explicitly or derive geocentric Earth; compare both target3 and399 before asserting Earth-state accuracy. |
| SCN-017 · P1 | OPEN / OBS | Same | Fixed-element velocity omits secular-element derivatives. Converging finite differences show Neptune8.0674 m/s, Uranus6.6387, Saturn2.8141, Earth.2716 at the recorded epoch. Internal consistency, not live Horizons residuals. Differentiate all evolving elements/axes and gate multiple steps/epochs. |
| SCN-018 · P2 | OPEN / CODE, model coverage | Same | Pluto has fixed elements and is absent from the eight-planet gate. Declare interval/fidelity and add independent Pluto state tests. No fresh external Pluto error estimate. |
| SCN-019 · P1 | OPEN / CODE | Same | Acquired cargo is absent from the chronological return-burn mass ledger. Fuel is carried across burns; the old blanket “every leg resets mass” claim is wrong. Gate cargo/staging/ISRU/loss transitions and return propellant sensitivity. |
| SCN-020 · P1 | OPEN / OBS | Same | Infeasible100+100 km/s case yields0 failure probability with zero uncertainties;1,275 kg reported margin is entirely jettisoned fuel. Existing mission verifier separately rejects infeasible logistics. Propagate deterministic feasibility and re-close every sampled budget; do not claim endpoint acceptance from this service probe. |
| SCN-021 · P1 | OPEN / OBS | Same | Sgr A* and M87 radii are98.95×/101.05× smaller than their own2GM/c² values; a propagation consumer exists. Derive one consistent unit system and gate dependent radii/conversions. Speculative model truth is separate. |
| SCN-022 · P2 | OPEN / OBS, expansion hazard | Same | At e=.99, six-step Newton solver has worst residual1.3874e8 rad. Shipped loaded ASPH population max e=.5555, so current population divergence is not established. Safeguard solve or bound domain and gate callers. |
| SCN-023 · P1 | OPEN / OBS + CODE | Same | Metric-kinematics probe moves canonical Earth world state by.00200399 AU while independent sampled state stays unchanged; those world states feed perturbers. Separate canonical simulation states from display offsets; enforce experiment on/off invariance. |
| SCN-024 · P2 | OPEN / CODE + browser work OBS | Same | KBO propagation/upload remains unconditional during pause. Browser records further buffer uploads with date paused, but counters aggregate all effects and are not KBO-only bandwidth. Require no unnecessary unchanged-state uploads with per-buffer instrumentation. |
| SCN-025 · P1 | OPEN / OBS:219 diagnostics | OPEN / OBS:240 | Main ratchet passes219/226, strict check fails; build is independent. Close when strict typecheck exits0 without weakening settings. |
| SCN-026 · P1 | OPEN / OBS | OPEN / OBS | Clean trees pass, but copying existing H1 evidence into each temporary tree makes bare `npm test` fail six archive suites. Deliberately scope discovery while retaining evidence. Copying October7 evidence alone passes. |
| SCN-027 · P1 | OPEN / OBS, narrowed developer path | OPEN / OBS | M now has a pinned passing CI backend test environment; runtime-only install still fails11 collection imports, T fails8. Document the tested dev/test setup; verify fresh README path→suite without manual additions. Do not claim main has no dependency pins. |
| SCN-028 · P1 | OPEN / OBS, registry advisories | Same | Eleven affected entries,2critical/6high/2moderate/1low. Review reachability and update toolchain with lockfile/test/type/build evidence. No production exploitation conclusion. |
| SCN-029 · P1 | RESOLVED: missing tracked CI workflow | OPEN / CODE | M has `.github/workflows/r3-r4-science.yml`, full backend lane, frontend Vitest tests/build/type ratchet and mutation gate; local equivalents pass. Global zero-error TS, planet/moon command enforcement, live/browser/load lanes and external required checks are remaining release gates, not proof no CI exists. |
| SCN-030 · P1 | OPEN / browser OBS | Same |240px viewport has280px document/body width; canvas lacks keyboard camera control; desktop→mobile focus falls to body; drawer background is not inert/modal; paused HUD rewrites persist. Preserve working Escape restoration. Require real keyboard/zoom/drawer/screen-reader acceptance; the historical design is not an implementation. |
| SCN-031 · P2 | OPEN / browser OBS | Same | No WebGL yields `Error creating WebGL context.`, empty body selector, uninitialized date (—), and zero accessible alerts. Catch startup/context loss and offer an accessible recovery path; gate unavailable WebGL. |
| SCN-032 · P1 | OPEN / CODE | Same | README still instructs REBOUND/Tudat selection and Connect, absent from shipped entry UI; moons remain hidden; missing asteroidWorker path remains listed. Align user-facing claims and distinguish API/library features. |
| SCN-033 · P2 | OPEN / OBS | Same | Texture CLI imports missing `.js`; moon updater `--help` overwrites a temp catalog with[] after a matched empty table. Implement safe help/dry-run, validate nonempty source and atomically publish intentional outputs. |
| SCN-034 · P2 | OPEN / CODE + controlled OBS | Same | Mutable upstream regeneration remains; external-output builder writes three temporary files before `relative_to(PROJECT_ROOT)` raises. Pin archived inputs, support external destinations and transactional writes; full dataset rebuild not run. |
| SCN-035 · P1 | OPEN / CODE, documentation/provenance | Same | No tracked repository LICENSE/COPYING; moon attribution includes “Unspecified by provider; verify for redistribution.” Owner must specify distribution terms and complete attribution. This is an observed documentation gap, not a legal opinion. |
| SCN-036 · P1 | RESOLVED: authentication/per-subject admission | OPEN / CODE | M adds authenticated network profile, bounded message handling and per-subject admission alongside global ownership; corresponding resource/security tests pass. T retains global-only fairness mechanism. Multiple valid subjects can still fill all slots; exclusion/session-lifetime fairness, multi-worker deployment and long-lived load remain SCN-047/048. |
| SCN-037 · P2 | OPEN / CODE, timing contract | Same | Backend advances `time_scale*frame_time` even if compute overruns; simulation slows relative to wall seconds. Define fixed-step versus wall-time semantics and test slow engines with bounded catch-up if wall-time promised. |
| SCN-038 · P2 | OPEN / CODE, animation semantics | Same | Sun visuals use wall time during pause/reverse and do not follow simulation JD. Relative-time precision is preserved. Declare decorative versus simulation motion and gate pause/reverse/reduced-motion behavior. |
| SCN-039 · P2 | OPEN / CODE, configuration | Same | Main bootstrap uses page host plus fixed8042 backend port; no deployed override in this path. Some parsed UI-size/renderScale configuration is also unused by bootstrap. Define one consumed deployment/viewport contract and test nondefault values; mere mixed casing is not a separate bug. |
| SCN-040 · P1 | OPEN / workspace OBS | Same workspace condition | Historical audit/index/H1 evidence and this report remain untracked; fresh clones omit them. Intentionally archive the selected artifacts together after review. No unrelated files were staged or committed. |

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

| θ | Velocity error | Actual propagated endpoint miss | Reported TOF root residual |
|---|---:|---:|---:|
|179.999°|.001104m/s|56.785km|1.1261e-10day|
|179.9999°|.813087m/s|41,810.837km|1.1238e-10day|
|179.99999°|20.37377m/s|1,046,762.558km|1.1235e-10day|
|179.999999°|5,101.243m/s|209,061,472.255km|1.1238e-10day|

Both sides ofπ fail symmetrically; ordinary-angle controls and both branch runs are retained. Exactly180° returns `None` and is recorded under capability SCN-045 because the collinear inputs do not determine a unique plane. It is not the defect asserted here.

**Closure:** stable angle/velocity recovery or explicit ill-conditioned rejection, independent endpoint and velocity gates on both sides ofπ over multiple radii/tolerances, while retaining bounded work and TOF residual checks. [Full reproduction and JSON](CODEBASE_SCAN_2026-10-10_EVIDENCE/backend/TRANSPORT_LAMBERT_NOTES.md).

### October 10 — 6. Verification and capability queues — excluded from open counts

| ID | Current queue and evidence needed |
|---|---|
| SCN-041 · P1 | **WSA scientific calibration.** Main fixes exact radial-boundary expansion and labels `wsa_inspired_v1`; formula regression mutant is killed. Independent observed/reference speed-map calibration and topology/coverage acceptance remain. T retains older formula. Do not label corrected main formula still broken merely because calibration is pending. |
| SCN-042 · P1 | **Broader solar time/frame/projection semantics.** Confirmed Hathaway error split to050; stale forcing009; main disables unvalidated spatial/observed inference. Both backend PFSS and Parker are Z-up, so direct-copy evidence alone does not prove a backend axis mismatch. Require separate coordinate/rotation/projection oracles. |
| SCN-043 · P1 before exposing moons | **Full satellite coverage.**424 catalog moons, four required fitted artifacts, and20×7 passing gate rows are different denominators. Validate intended rendered population/intervals and truthful unavailable behavior. Historical Dione/Rhea/Io/Europa error counts are not current independent measurements. |
| SCN-044 · P2 | **MGA solution quality/realism.** Preserve bounded search, independently revalidated feasible assists and unpowered v∞ continuity. Fresh real-window/two-assist coverage, equatorial-radius/periapsis policy and exhausted/inconclusive reporting are still needed. No old inert-search count is reused. |
| SCN-045 · P2 | **Lambert capability boundaries.** Multi-revolution support remains0; exact180° needs a plane policy; fixed[-40,40] z scan and short/hyperbolic coverage need independent oracle cases. Confirmed near-antiparallel numerical failure is064; a good179.999° case cannot certify closer angles. |
| SCN-046 · P2 | **Artifact regeneration.** Shipped asteroid hash/metadata and four moon fit parsers pass; mutable-input generators are not yet independently reproduced offline. Pin inputs and perform safe temporary byte-identical rebuilds. |
| SCN-047 · P1 | **Broader browser/GPU/load release gates.** Fresh startup, drawer/keyboard, no-WebGL, mocked recovery and scene probes narrow the unknowns. Still missing production-budget five-minute dev/preview solar delivery, real observed AIA, hardware GPU precision/FPS, declared coverage denominator, screen reader, multi-browser, sustained cross-endpoint and multi-worker load. |
| SCN-048 · P1 | **Live providers and actual deployment.** Main migrates NOAA to quality/age/skew-checked RTSW1-minute products; T retains old one-day constants. No fresh live upstream HTTP status or real deployment/proxy/auth configuration was established. Bound AIA historical-date coverage separately from physics epochs. Remote branch freshness also remains unverified. |
| SCN-049 · P2 | **Remaining historical leads/dormant paths.** Binary, Tudat energy and callback findings split to054/055/057; SMBH radius021 expanded. Remaining replay/randomness, star mass/period manifests, Trojans, other SMBH conversions, dormant client reconnect/schema state, cloud/satellite timeout/disposal, font/doc-link details and force-model truth need focused caller-aware evidence. Source leads are not additional confirmed bugs. |

### October 10 — 7. Coverage and preserved fixes

| Domain | Sweep performed | Explicit limits |
|---|---|---|
| Repository/history/docs/CI | Complete tracked-tree inventories; branch/tree comparison; supplied audit index, October7 register and historical crosswalk; workflow/dependency/scripts/README/provenance review; fresh build/tests/type/audit/CI mutation execution | No all-line formal review, actual hosted CI/branch-protection capture, license determination or guarantee newest remote tips |
| Backend routes/security/concurrency | HTTP/WS surfaces, auth/profile/proxy identities, bounded bodies/messages, budgets, dedicated workers/process ownership, epoch admission, tests and local route probes | No production proxy inspection, sustained multi-tenant load or all-endpoint fuzz campaign |
| Solar/PFSS/FITS/realtime | Basis/grid/field/tracing/WSA, source metadata/ingestion, flux/provenance, bounded transport/cache, temporal semantics, process supervisor; analytic and controlled-source probes | No independent real GONG corpus, calibrated WSA map or live observed delivery |
| Dynamics/catalogs/mission | Planets/moons/asteroids/KBO, time/velocity frames, REBOUND/Tudat hooks, mission vehicle/risk/EPO, benchmark and Lambert/Horizons; independent arithmetic, finite differences, real REBOUND and safe script probes | Tudat absent, no live Horizons/SBDB truth refresh, no all424-moon accuracy campaign, no full dataset regeneration |
| Frontend/rendering/browser | Bootstrap/DOM/style/camera, worker contracts/fallback, clients/controller, solar visuals, Earth/Mars quadtree/shader, asteroid/KBO/SMBH paths; all frontend files inventoried and import/lifecycle boundaries reviewed | Software WebGL only; screenshot readback timed out; scene instrumentation suppresses rendering; no claim of pixel/GPU throughput coverage |
| Dormant modules | Alternative animation/UI/planner clients, local/nearby/cloud/satellite/moon/Milky-Way pipelines and inactive forces reviewed for reachability and hazards | Not exposed controls merely because files exist; unexecuted leads remain049 |

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

| Field | Value |
|---|---|
| Audited HEAD | `fc191df036b72059e019bbc7ee6a387d51c33bf2` |
| Branch | `fix/trajectory-amplification-defense-in-depth` |
| Last commit | `docs: define frontend accessibility remediation` |
| Scan date | 2026-10-07, America/New_York; evidence captured that day in UTC |
| Baseline source state | No tracked modifications at scan start; four pre-existing untracked audit/report paths listed below |
| Inventory | 381 tracked files; 175 tracked `.ts` / `.py` / `.mjs` / `.js` files; 114 tracked Markdown files. These counts exclude untracked evidence and this new tracker. |
| Method | Single-agent source and history review, repository validation commands, fresh Python environment, offline numerical and API probes, selected primary-source comparison |
| Deliverable scope | Documentation and retained probe evidence. No application fixes, dataset refresh, branch merge, dependency-file edits, or commits. |
| Evidence | [CODEBASE_SCAN_2026-10-07_EVIDENCE/](CODEBASE_SCAN_2026-10-07_EVIDENCE/) |

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

| Check | Current result | Evidence and interpretation |
|---|---|---|
| `npm run build` | PASS | [build.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/build.log). Vite 7.3.1; 44 modules; main JS 904.92 kB, gzip 228.17 kB. Large-chunk warning remains. |
| `npm test` | FAIL, exit 1 | [frontend-default.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/frontend-default.log). 14 passing source files / 162 passing tests, plus **6 failing suite imports** from old untracked H1 evidence. This is not six failed product assertions. |
| `npm test -- src` | PASS | [frontend-src.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/frontend-src.log): **14 files, 162 tests**. Explicitly scoped; not a claim that plain `npm test` passes. |
| `npm run typecheck` | FAIL, exit 2 | [typecheck.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/typecheck.log): **240 TypeScript diagnostics**, counted by `error TS…` lines. September's 246 is stale. |
| `npm run verify:planet-positions` | PASS | [planet-positions.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/planet-positions.log): 8 planets × 6 epochs, 48 rows, under existing budgets. This is a position gate, not a geocentre or velocity certification. |
| `npm run verify:moon-frames` | PASS | [moon-frames.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/moon-frames.log): **20 moons × 7 epochs, 140 rows**, utilisation 50.0/100. Does not cover all 424 catalog entries. |
| Fresh Python 3.12 environment, only `backend/requirements.txt`, collect backend suite | FAIL, exit 2 | [backend-fresh-install.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/backend-fresh-install.log): **8 collection errors** because Starlette 1.7.0 requires undeclared `httpx2`; 362 tests collected before interruption. |
| Same environment after adding `httpx2` locally | PASS | [backend-tests.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/backend-tests.log): **458 passed in 48.15 s**, no skips reported. REBOUND 5.1.1 installed. Repository requirements were not changed. |
| `npm audit --json` | FAIL, exit 1 | [npm-audit.json](CODEBASE_SCAN_2026-10-07_EVIDENCE/npm-audit.json): **11 affected dependency entries**: 2 critical, 6 high, 2 moderate, 1 low. Registry output, not an exploitability test or 11 distinct root advisories. |
| Offline backend audit probe | Defects reproduced | [probe-backend.json](CODEBASE_SCAN_2026-10-07_EVIDENCE/probe-backend.json): PFSS basis, FITS reader, benchmark, solar identity, preview CORS, risk-service composition, stale assimilation, and cold solar timing. |
| Frontend numerical / DOM-write probe | Defects reproduced | [probe-frontend.json](CODEBASE_SCAN_2026-10-07_EVIDENCE/probe-frontend.json): date precision, catalog round trip, fast Kepler, SMBH radius, repeated HUD writes, position/velocity derivative mismatch. No browser or GPU measurement. |
| Moon texture ingestion CLI | FAIL, exit 1 | [texture-script.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/texture-script.log): missing `moonTextureCatalog.js` import, before ingestion starts. |

Environment: Linux/WSL2, Node **24.21.0**, npm **11.19.0**, temporary Python **3.12.13**, NumPy **2.5.3**. The default shell Python was 3.14.6 without the backend dependencies; it was not used for backend validation. See [node-packages.log](CODEBASE_SCAN_2026-10-07_EVIDENCE/node-packages.log), [python-freeze.txt](CODEBASE_SCAN_2026-10-07_EVIDENCE/python-freeze.txt), and [scan-manifest.json](CODEBASE_SCAN_2026-10-07_EVIDENCE/scan-manifest.json). The manifest records source hashes; hashing a file does not mean every line was reviewed.

### October 7 — 3. Coverage map

| Area | Work performed | Remaining boundary |
|---|---|---|
| Frontend startup, UI, rendering | Entry path, animation loop, panel/focus code, scene setup, shipped solar client, build and source tests | No fresh browser interaction, screen-reader, GPU, screenshot, or frame-time run |
| Planets, moons, worker boundary | Propagator and catalog review, time/worker tests, committed planet/moon gates, finite-difference velocity probe | No new live Horizons capture; no all-moon accuracy assertion |
| Asteroids / Kuiper belt | Live shader inputs, deterministic catalog selection, catalog serializer probe, paused-loop review | No GPU shader readback, new upstream catalog, or bandwidth benchmark |
| Solar / PFSS / live data | Basis and FITS probes, ingress/CORS checks, provider/cache/forcing review, one cold offline timing in final probe output | No five-minute browser delivery run; no observed magnetogram oracle or live outage/load test |
| Trajectory / Lambert / MGA | Recent patch/test review; full backend and frontend planner tests | No new independent Izzo/Gooding sweep or broad real-mission window search |
| Mission / risk | Mass-flow source tracing, infeasible vehicle + risk service probe, backend suite | Probe does not establish that the endpoint recommends an infeasible candidate |
| REBOUND / WebSocket | Full backend suite with REBOUND installed; runner/admission review | No long-duration stream, GPU client, fairness/load, or TudatPy run |
| Tooling / data / documentation | Clean Python setup, dependency audit, type/build/test commands, CLI failure, licensing/README/history checks | No Python vulnerability scan, fresh dataset rebuild, license determination, or comprehensive link audit |

### October 7 — 4. Open tracker

#### October 7 — Solar computation and delivery

| ID | Priority / state | Problem and current evidence | Next action / closure gate |
|---|---|---|---|
| SCN-001 | P0 · OPEN / OBS | **PFSS harmonic basis is incorrect.** `_associated_legendre` at [pfss_magnetogram.py](../backend/sim/pfss_magnetogram.py):281–313 mixes seeds and recurrence normalization. At x=0.5, P₂ is −0.633911 instead of −0.125; P₃ is −1.134220 instead of −0.4375. The integral of P₀P₂ is −0.945074 instead of zero. Historical H-2 / R3. | Establish one basis convention across decomposition and scalar/batch field evaluation. Gate analytic values, orthogonality, derivatives/poles, dipole/quadrupole reconstruction, and source-surface boundary behavior through supported lmax. |
| SCN-002 | P1 · OPEN / OBS | **FITS reader rejects a valid image in the fresh supported dependency environment.** `dtype` is the scalar class `np.float32`, then `dtype.newbyteorder('>')` is called at [pfss_magnetogram.py](../backend/sim/pfss_magnetogram.py):117. A 12×12, BITPIX=−32 fixture raises `AttributeError` on NumPy 2.5.3. `_compute` catches fetch exceptions and falls back to synthetic. | Use the NumPy dtype API correctly and add a committed valid FITS fixture with exact expected pixels. Exercise the complete fetch/parse/source-status path so a parser failure cannot masquerade as observed input. |
| SCN-003 | P1 · OPEN / CODE | **Observed GONG grid semantics are lost.** Fetch documents a sine-latitude grid, while decomposition constructs uniform θ and `sin(θ) dθ` weights at [pfss_magnetogram.py](../backend/sim/pfss_magnetogram.py):131–136, 316–364. The reader discards WCS/longitude metadata and passes a bare array onward. This remains a distinct problem after SCN-002. | Preserve source grid/WCS metadata; explicitly transform or integrate on the declared grid. Validate orientation, latitude ordering, LONG0, and a known harmonic map from a committed observed-format fixture. |
| SCN-004 | P1 · OPEN / CODE | **Solar upstream selection and reads are insufficiently bounded.** [pfss_magnetogram.py](../backend/sim/pfss_magnetogram.py):167–197 falls back to any monthly FITS match, selects the last listing entry, reads without a byte cap, and decompresses without an expansion cap. [solar_realtime_data.py](../backend/sim/solar_realtime_data.py):207–224, 322–328 also reads full remote bodies. Historical L-17 and H1 digest. | Require exact declared source/rotation or report unavailable; retain actual source identity. Bound downloaded and decompressed bytes and total work. Test wrong-rotation input, oversize bodies, gzip expansion, and slow-drip responses. |
| SCN-005 | P1 · OPEN / OBS | **Cold solar computation exceeds the shipped client deadline.** [sunController.ts](../src/sunController.ts):152–155 uses a 900 ms polling interval and 2.6 s timeout. The final probe's cold high/180/hybrid computation takes **4.094 s even with network disabled**. AIA refresh occurs only after a successful physics update (:500–509), and the error is used for scheduling without a visible delivery-state UI. Historical H-1. | Complete the solar delivery contract: bounded compute/snapshot lifecycle, compatible deadlines/cadence, cached availability, visible source/stale/error state, and independent observation recovery. Dev and preview must meet a recorded five-minute delivery gate. Do not close from this one timing sample. |
| SCN-006 | P1 · OPEN / OBS | **Default preview origin is rejected by CORS.** [server.py](../backend/server.py):392–404 allows :3000/:5173 but not :4173. TestClient OPTIONS from `http://localhost:4173` returns 400 with no allow-origin header. | Align configured dev/preview origins and test both localhost and loopback-IP cases. Verify real browser physics and AIA delivery from preview. |
| SCN-007 | P1 · OPEN / OBS | **Solar rate-limit identity is caller-controlled and retained without a key bound.** [server.py](../backend/server.py):885–944 trusts X-Forwarded-For and prefers an API-key header as identity. With auth unconfigured, 50 rotating XFF values pass a 36/request window; 50 unvalidated API-key values create 50 identities. Dictionaries retain keys. The new trajectory middleware has different, stronger behavior. | Derive identity from validated credentials or a trusted transport/proxy policy; bound identity storage with expiry/eviction. Test both forged XFF and arbitrary key rotation from one peer. |
| SCN-008 | P1 · OPEN / CODE | **Solar JD validation checks finiteness but no supported epoch range.** [server.py](../backend/server.py):1970–1982 and PFSS `_normalize_key` admit arbitrary finite epochs; GONG selection converts them to a calendar timestamp. The sun-focus plan's bounded-JD behavior is not present in this checkout. | Define supported epochs and reject out-of-range finite values before remote access or compute. Test route and cache boundaries; distinguish unavailable historical data from an invalid input. |
| SCN-009 | P1 · OPEN / OBS | **Hybrid forcing applies zero-confidence observations.** [solar_physics.py](../backend/sim/solar_physics.py):397–519 has no requested-epoch argument in its assimilation function and a minimum hybrid weight of 0.25. A stale 2000-01-01 input produces confidence 0, `applied: true`, weight 0.25, and changes synthetic activity 0.8 to 0.625. SWPC/SILSO ingestion also lacks requested-date selection; AIA does accept a requested date. Historical M-8. | Gate assimilation by observation validity, requested epoch, and provenance; stale/unavailable data must follow a declared fallback. Test historical, current, future, missing, and zero-confidence observations. |
| SCN-010 | P1 · OPEN / CODE | **Realtime cache discards expired good snapshots and caches returned failure snapshots as ordinary values.** [solar_realtime_data.py](../backend/sim/solar_realtime_data.py):118–170 removes expired entries, then caches whatever `_fetch_snapshot` returns; that method catches provider failures. Exact-JD keys also limit reuse as simulation time advances. H1 digest remains relevant, but old outage timings were not rerun. | Add a declared stale-data and recovery policy, distinguish successful/failed snapshots, and test outage followed by recovery. Preserve valid exact-input identity until any reuse equivalence has a scientific error budget. |
| SCN-011 | P2 · OPEN / OBS | **AIA freshness depends on the browser timezone.** [solarObservationTexture.ts](../src/frontend/features/solar/solarObservationTexture.ts):66–71 uses `Date.parse` on upstream `image_date`; the backend preserves the raw date at [solar_realtime_data.py](../backend/sim/solar_realtime_data.py):682. The same zone-less string resolves seven hours later in Los Angeles and nine hours earlier in Tokyo than UTC. [Probe](CODEBASE_SCAN_2026-10-07_EVIDENCE/aia-timezones.json). | Normalize the upstream timestamp to a declared UTC representation at ingestion; test the full freshness result across multiple TZ settings with a fixed clock. |

#### October 7 — Scientific results, propagation, and mission models

| ID | Priority / state | Problem and current evidence | Next action / closure gate |
|---|---|---|---|
| SCN-012 | P0 · OPEN / OBS | **Accuracy benchmark still validates zero scenarios.** [accuracy.py](../backend/benchmark/accuracy.py):509–538 reports 3 scenarios, 0 comparable, coverage 0, and mean error **0.0**. Tests explicitly accept zero coverage; reference rows still use `strict`. Resource-budget improvements did not repair the oracle. Historical H-4. | Record reproducible fixed-state references and generate them with an independent implementation; make nonzero comparable coverage a gate. Represent undefined error as unavailable, and distinguish artifact-integrity checks from numerical validation. |
| SCN-013 | P1 · OPEN / OBS | **Asteroid shader uses float32 absolute JD.** [beltRenderer.ts](../src/frontend/features/asteroids/beltRenderer.ts):62–65, 124–128 subtracts float epoch from float JD. `2461320.125` rounds to `2461320`; spacing here is **0.25 day**. This reproduces input precision loss, not September's GPU position-error or stutter measurements. Historical M-1. | Send relative time computed in CPU double precision or a validated split representation. Gate arbitrary sub-day epochs against a double-precision reference and then measure actual GPU motion/readback. |
| SCN-014 | P1 · OPEN / OBS | **ACBF's own round-trip validator fails.** [asteroidCatalogLoader.ts](../src/data/asteroidCatalogLoader.ts):319–394 reports `ok: false`, **99,916/100,000 mismatched records**, maximum epoch error ≈0.125 day and angle error ≈0.002747°. Historical M-14. | Declare field-specific quantization budgets, correct the round-trip comparison contract, and add a meaningful format gate. A failing synthetic validator alone does not prove the committed catalog is corrupt. |
| SCN-015 | P2 · OPEN / CODE | **Rendered asteroid selection favors the leading catalog records.** [asteroidBelt.ts](../src/sim/asteroidBelt.ts):138–161 stops at `count`; the phase-1 catalog builder orders by descending diameter and the app uses 50,000 records. Historical M-21. | Declare the displayed population or use a reproducible representative sampling policy. Gate the selection against the full source corpus; September's diameter statistics were not remeasured. |
| SCN-016 | P1 · OPEN / CODE | **The object labelled Earth uses Earth–Moon barycentre elements.** [planets.ts](../src/data/planets.ts):85–113 matches JPL Table 1's EM Bary row; propagation supplies that state without a geocentre correction. Historical M-3. The published row identity was rechecked against [JPL's table](https://ssd.jpl.nasa.gov/planets/approx_pos.html). | Either explicitly model/label EMB and derive Earth/Moon offsets, or use geocentric Earth states consistently. Test against both Horizons 3 and 399; do not quote the old ~4,700 km / 12.3 m/s as a fresh measurement. |
| SCN-017 | P1 · OPEN / OBS | **Planet velocities are not the derivative of the secularly changing position model.** [orbitMath.ts](../src/sim/orbitMath.ts):202–265 evolves elements and axes; :337–358 uses the instantaneous fixed-element velocity formula. Central differences at J2000+9775.12345 days disagree by **8.067 m/s for Neptune**, 6.639 Uranus, 2.814 Saturn, 0.272 Earth. These are internal consistency differences, not errors against Horizons. R2 velocity residual. | Differentiate all time-dependent elements/rotations consistently. Gate derivative agreement at several step sizes/epochs, then apply independent velocity budgets. Preserve the existing mean-longitude correction and rate-free invariant. |
| SCN-018 | P2 · OPEN / CODE | **Pluto lacks secular rates and is outside the eight-planet gate.** [planets.ts](../src/data/planets.ts):261–279 defines fixed elements only. Historical M-15. | Define the supported Pluto model/date range; add appropriate rates or an ephemeris and explicit Pluto position/velocity acceptance cases. No new Pluto error estimate was measured here. |
| SCN-019 | P1 · OPEN / CODE | **Mission return cargo is absent from the burn mass model.** [agents.py](../backend/mission/agents.py):480–518 evaluates outbound and return burns using the request payload before computing returned mining cargo. [vehicle_service.py](../backend/mission/vehicle_service.py):64 initializes that one payload mass; mining closure later subtracts return propellant from product. The older claim that every leg resets the wet mass is too broad: fuel is tracked across burns, but acquired cargo is not added. | Use one chronological mass ledger for stages, expended propellant, acquired cargo, losses, and any declared ISRU. A return cargo increase must affect return Δv/propellant feasibility. |
| SCN-020 | P1 · OPEN / OBS | **Risk output can say 0% failure for an infeasible vehicle budget.** An actual 100+100 km/s burn-budget evaluation returns `feasible: false`, yet retains a 1,275 kg reserve margin. Passing that margin into [risk_service.py](../backend/mission/risk_service.py):28–115 with zero uncertainty and positive payload gives `failureProbability: 0.0`. The service accepts no deterministic-feasibility input; [agents.py](../backend/mission/agents.py):510–518 passes the margin. | Propagate unmet Δv/feasibility into risk, and re-close each sampled mass/burn case. Preserve the mission verifier that already rejects infeasible logistics; this probe does **not** show an infeasible recommendation passing the endpoint. |
| SCN-021 | P1 · OPEN / OBS | **SMBH radius constants disagree with the module's own G, M, c by about 100×.** [smbhPhysicsConstants.ts](../src/frontend/features/superluminal-modeling/smbhPhysicsConstants.ts):62 stores Sgr A* radius `1.24e10` cm; `2GM/c²` from the same file gives `1.227027274220e12` cm, ratio **98.954**. The radius has a consumer in [smbhPropagation.ts](../src/frontend/features/superluminal-modeling/smbhPropagation.ts):642. | Derive dimensional constants from one unit system and cover Sgr A*, M87*, ISCO/photon radii and downstream dimensional conversions. Keep speculative interpretation distinct from arithmetic consistency. |
| SCN-022 | P2 · OPEN / OBS | **Fast Kepler solver diverges at high eccentricity.** [orbitMath.ts](../src/sim/orbitMath.ts):168–173 uses six unguarded Newton iterations. A 10,001-angle sweep at e=0.99 produces maximum residual **1.3874×10⁸ radians**. Historical L-2; activation risk for expanded catalogs, not proof of a failure in the currently shipped population. | Bound the supported domain or use safeguarded convergence and a fallback. Gate residuals around periapsis and e→1, and test caller handling of unsupported values. |

#### October 7 — Frontend state, validation, and operations

| ID | Priority / state | Problem and current evidence | Next action / closure gate |
|---|---|---|---|
| SCN-023 | P1 · OPEN / CODE | **Speculative warp mutates canonical planet positions.** [main.ts](../src/main.ts):840–845 and [modelWorker.ts](../src/workers/modelWorker.ts):17, 131 call `applyMetricKinematics` with `1e12`; [solarSystemModel.ts](../src/sim/solarSystemModel.ts):169 onward mutates world positions. Those positions feed display/perturber paths. Historical M-9. | Keep scientific states distinct from visual experiment offsets. Assert identical canonical states with the experiment on/off while allowing the presentation to differ. |
| SCN-024 | P2 · OPEN / CODE | **Paused frames still propagate/upload KBO positions.** [main.ts](../src/main.ts):1395–1409 unconditionally calls both propagators and renderer updates; pause affects time advancement, not this work. Historical M-10. | Skip unchanged-state propagation and buffer updates. Instrument a paused frame sequence and require no unnecessary KBO position uploads. September's bandwidth/CPU numbers were not rerun. |
| SCN-025 | P1 · OPEN / OBS | **Strict TypeScript checking fails with 240 diagnostics.** [Log](CODEBASE_SCAN_2026-10-07_EVIDENCE/typecheck.log). `build` only runs Vite, so it succeeds despite this failure. Historical M-11. | Resolve the diagnostics in manageable modules and make strict checking an enforced release command. Close only when `npm run typecheck` exits 0 without relaxed settings. |
| SCN-026 | P1 · OPEN / OBS | **Default Vitest discovery loads archival audit suites.** Six untracked evidence suites fail imports; all 162 source tests pass. [package.json](../package.json) uses bare `vitest run`, with no repository-level include/exclude config. | Limit product test discovery deliberately while retaining audit evidence. Plain `npm test` must pass with those archives present. This is a workspace reproducibility defect; a fresh clone lacks those untracked suites. |
| SCN-027 | P1 · OPEN / OBS | **Fresh backend install cannot collect the full suite.** [requirements.txt](../backend/requirements.txt) omits the TestClient dependency (`httpx2` for the resolved Starlette 1.7.0); most dependencies have only lower bounds and there is no backend lock. Eight collection failures reproduced. Historical M-16. | Declare tested runtime/dev environments and lock compatible versions. Verify clean install → full suite with no manual dependency additions. Record the supported Python version. |
| SCN-028 | P1 · OPEN / OBS | **Installed frontend toolchain has registry-reported advisories.** Fresh npm audit reports 11 affected entries, including critical classifications on Vitest/tinypool and high on Vite and transitive tools. [Full advisories](CODEBASE_SCAN_2026-10-07_EVIDENCE/npm-audit.json). Historical M-20 count of 9 is stale. | Triage and update affected packages, then rerun the lockfile install, type/test/build gates, and audit. Do not treat the registry counts as evidence that the production Three.js bundle is exploitable. |
| SCN-029 | P1 · OPEN / CODE | **No tracked repository CI workflow enforces release gates.** No `.github` workflow/configured equivalent found in the tracked tree; package scripts remain independent. Historical M-11/S14. External hosting checks were not inspected. | Add a reproducible enforced lane for typecheck, product tests, backend tests with REBOUND, numerical gates, and build. Scientific probes should become independent-oracle tests, not assertions that bless current wrong output. |
| SCN-030 | P1 · OPEN / CODE + OBS | **Accessibility remediation remains a design, with current code gaps.** `style.css:59` sets a 280px minimum; :1213 expands the small-screen panel width to 100vw. The canvas has no keyboard camera controller; mobile panel code at [main.ts](../src/main.ts):1117–1160 does not isolate the background or restore focus on breakpoint changes. `index.html:222,249` has two search-related live regions. The HUD probe records four identical text writes across two paused updates. | Implement the [approved accessibility design](../docs/superpowers/specs/2026-10-07-frontend-accessibility-remediation-design.md), including its eight acceptance areas. Require interaction tests plus real zoom/keyboard/drawer checks. The design explicitly leaves existing reduced-motion simulation behavior unchanged, so that residual needs its own decision. |
| SCN-031 | P2 · OPEN / CODE | **WebGL initialization has no usable fallback.** [sceneSetup.ts](../src/frontend/app/sceneSetup.ts):155 constructs WebGLRenderer directly, with no startup error surface around this path. Historical L-6. | Catch unavailable/lost-context initialization and display an accessible recovery explanation. Verify with WebGL disabled; no fresh browser reproduction was performed here. |
| SCN-032 | P1 · OPEN / CODE | **README still describes controls/capabilities absent from the entry UI.** [README](../README.md) tells users to select REBOUND/TudatPy and click Connect; current [index.html](../index.html) does not supply those controls, and [main.ts](../src/main.ts):147 still disables moons. README also lists missing `src/workers/asteroidWorker.ts` and an outdated backend-test module count. Historical H-6. | Audit README claims against the shipped entry point and separate API/library capabilities from exposed UI. Keep corrected moon implementation notes, but do not imply moons are rendered. |
| SCN-033 | P2 · OPEN / OBS + CODE | **Maintenance scripts have broken or misleading invocation behavior.** `ingest-moon-textures.mjs --help` fails on a deleted `.js` import. [update-moons-data.mjs](../scripts/update-moons-data.mjs):79 always writes the catalog and has no argument parsing, so `--help` is not a safe help operation. The latter was inspected, not executed. | Repair the import/runner contract; implement help/dry-run and explicit output destinations. Add invocation smoke checks that cannot overwrite tracked data. |
| SCN-034 | P2 · OPEN / CODE | **Dataset regeneration is not pinned to archived source inputs.** The asteroid and moon update scripts retrieve mutable upstreams; [build_asteroid_phase1_dataset.py](../scripts/build_asteroid_phase1_dataset.py):423,427 also calls `relative_to(PROJECT_ROOT)` on a caller-selected output path after writing it. Historical M-13. | Add immutable input snapshots with hashes, offline rebuild mode, and safe external output directories. Require byte-identical regeneration from those snapshots. Do not repeat September's changed-record totals without a fresh rebuild. |
| SCN-035 | P1 · OPEN / CODE | **Repository licensing and asset provenance remain unresolved.** No repository LICENSE/COPYING was found. [moon_texture_attribution.json](../public/textures/moons/moon_texture_attribution.json):37 explicitly says one provider license is unspecified. Texture/catalog provenance is incomplete. Historical H-5. | Have the owner choose/document distribution terms and complete per-asset/source attribution. Verify dependency and provider terms for the intended distribution. This is a documentation/provenance finding, not a legal determination of redistribution rights. |
| SCN-036 | P1 · OPEN / CODE | **WebSocket global capacity still has no client fairness/authentication policy.** [server.py](../backend/server.py):454 defaults to four slots; `_websocket_origin_allowed` allows absent Origin, and the endpoint acquires only the global slot. Origin filtering and permit ownership are already implemented. Historical M-5. | Define authenticated/per-client admission and session lifetime appropriate to deployment; verify that four unrelated draining clients cannot indefinitely exclude an authorized client. No fresh long-duration lockout attack was run. |
| SCN-037 | P2 · OPEN / CODE | **Backend simulation speed uses a target tick duration even when computation overruns.** [server.py](../backend/server.py):2957 advances by `time_scale * frame_time`; slow steps therefore reduce simulated days per real second. | Declare fixed-step versus wall-time semantics. If the UI/API promises days per wall second, use a bounded elapsed-time accumulator and test a deliberately slow engine without unbounded catch-up. |
| SCN-038 | P2 · OPEN / CODE | **Solar animation timing is disconnected from pause/reverse/epoch progression.** [main.ts](../src/main.ts):1412–1417 explicitly passes wall-clock seconds to sun visuals while other simulation state uses JD. This avoids the old absolute-time float precision defect, but the behavior needs a clear contract. Historical L-3. | Decide and expose simulation versus decorative motion semantics; test pause/reverse/reduced-motion behavior. Preserve the relative-time precision fix. |
| SCN-039 | P2 · OPEN / CODE | **Backend connection configuration is hard-coded around port 8042.** [main.ts](../src/main.ts) defines the backend URL from the page location and `DEFAULT_BACKEND_PORT`; there is no documented deployment override in this entry path. Historical L-15. | Provide an explicit configurable backend/proxy contract, document standalone behavior, and test a nondefault origin/port. Mixed request/response casing alone is not counted as a defect here. |
| SCN-040 | P1 · OPEN / CODE | **Recent audit evidence is outside version control.** The September 24 audit and H1 plan/evidence remain untracked in this checkout. The user's source inventory correctly warns that fresh clones do not contain them. | Deliberately archive or commit the intended evidence with appropriate review; link a durable source from the tracker. Do not sweep unrelated files into a commit. This new tracker/evidence also remains uncommitted until intentionally included. |

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

| ID | Priority / state | Historical item or unmeasured gate | Required next evidence |
|---|---|---|---|
| SCN-041 | P1 · VERIFY | WSA expansion uses field magnitude at a 1.005 R☉ footpoint and a nominal radius factor; historical R3/R4 and September 6 reports dispute the formula/name and topology semantics. Current magnitude computation was inspected, but no independent WSA case was run. | Analytic/reference expansion and speed-map comparison, footpoint/radius convention, open/closed mask and source-surface behavior. Fix or label the approximation honestly. |
| SCN-042 | P1 · VERIFY | Broader solar semantics: Hathaway normalization, multiple rotation laws, Y-up/Z-up transforms, Carrington orientation, AIA tile projection, and current-day sources at historical epochs. SCN-009 covers the demonstrated assimilation mechanism only. | Separate analytic/frame/projection probes per root cause using the September 6 report and H1 digest as leads. Do not count all solar formulas as either fixed or broken from one PFSS probe. |
| SCN-043 | P1 before enabling moons · VERIFY | Remaining satellite elements/period conventions and full-catalog accuracy. September's 11/26 or 18/26 failure counts are not current measurements; `bd48a7d` adds fitted and native-source-frame paths and stronger validation. | Validate the intended rendered set across declared coverage; compare uncovered bodies and boundaries with parent-relative external states. Define unavailable/approximate behavior before exposing moons. |
| SCN-044 | P2 · VERIFY | Broad MGA solution quality and mission realism. The old inert-search complaint is substantially changed by bounded coupled search and real/synthetic feasible-assist tests; those tests pass. This is not proof of Galileo/Cassini window coverage or global optimality. | New independent real-window benchmark including two-assist cases, pruning/budget effects, v∞ continuity, periapsis policies, and truthful exhausted/inconclusive outcomes. |
| SCN-045 | P2 · VERIFY / capability | Multi-revolution Lambert remains unsupported (`TRAJECTORY_LAMBERT_MAX_REVOLUTIONS = 0`); short-TOF/hyperbolic and near-180° claims need rechecking after the large Lambert rewrite. | Declare supported transfer classes; repeat independent reference cases for boundary geometry, TOF, and M>0 before requesting expanded support. Old fixed-bracket failures are not presumed current. |
| SCN-046 | P2 · VERIFY | Actual reproducibility of current asteroid/moon artifacts and the new fitted moon generator. The scripts' mutable-input problem is SCN-034; exact present-day deltas were not measured. | Safe rebuild to a temporary destination from pinned input; hashes and provenance; offline `generate_moon_ephemeris.py --check` with its required inputs. |
| SCN-047 | P1 · VERIFY | End-to-end browser delivery, accessibility, frontend coverage, GPU precision/performance, and cross-endpoint load. September's FPS, coverage, bandwidth, and 17 s `/health` figure cannot be reused as current. | Browser traces for dev/preview with source states, observed AIA success, missing-WebGL and keyboard cases; coverage with a declared denominator; bounded slow-upstream and cold-PFSS load tests with a documented host. |
| SCN-048 | P1 · VERIFY | Live SWPC/GONG/provider availability and deployment exposure. Current SWPC constants still name the old one-day feeds. Web retrieval in this scan returned tool errors, not a usable HTTP-status measurement. Non-loopback authentication/proxy policy was not tested. | Timestamped bounded HTTP captures for the exact configured endpoints and real deployment configuration; distinguish upstream HTTP failure from tooling/network failure. Do not assert a current 404 from the September log. |
| SCN-049 | P2 · VERIFY | Remaining low-priority historical ledger: replay/randomness, dead Tudat SRP/galactic tide, WebSocket seek correlation/disconnect logs, energy rebaselining, path disclosure, broken doc links, fonts, ineffective perturbation claims, other SMBH conversions, binaries/Trojans/star manifests. | Triage each against current callers and a focused reproduction; split confirmed root causes into new stable IDs. Do not carry old counts forward or label dormant code as a shipped feature. |

### October 7 — 7. Historical reconciliation and preserved fixes

#### October 7 — Changes that invalidate blanket carry-forward claims

| Historical claim | Current assessment | Evidence / residual |
|---|---|---|
| H-3: unbounded synchronous trajectory fan-out starves the shared API pool | **Fixed in the covered implementation/tests; broader load acceptance remains SCN-047.** | Async trajectory endpoints, dedicated bounded executor, deadlines/budgets/cancellation, remote-provider constraints, and shared ephemeris safety tests. The 458-test run includes these tests. Do not repeat the old 1,312-call / 3.6 h / 17 s measurements as current. |
| M-7: body size is unbounded and validation reflects full inputs | **Fixed for the six named trajectory/mission/benchmark ingress paths.** | [server.py](../backend/server.py):781–828 applies bounded bodies and sanitized validation errors to `TRAJECTORY_INGRESS_PATHS`; corresponding endpoint tests pass. This is not a claim of universal API authentication or all-path protection. |
| M-2: browser UTC is fed directly to a TDB model | **Preserve the `bd48a7d` conversion and contracts.** | `src/constants.ts`, its tests, and worker contracts are updated and pass. Leap-second/time-range assumptions remain part of the documented model. |
| M-22: the Moon still double-counts apsidal precession | **Old blanket claim superseded for the corrected fitted/native-frame paths.** | Moon ephemeris/source-frame tests and 140-row gate pass. Remaining catalog accuracy is SCN-043. |
| M-24: moon verification is only one epoch with loose radius tolerances | **Old description is obsolete.** | Current command validates 20 moons × 7 epochs, including corrected-state contracts. It is still not an all-moon certification. |
| M-4: MGA is effectively inert | **Changed substantially; do not repeat the old 96-attempt result.** | Bounded search tests include independently revalidated real Kepler assist and feasible synthetic two-assist cases. Wider search quality is SCN-044. |
| Worker transport loses double precision | **Preserve Float64 payload/filtering behavior.** | Current worker contract tests pass. Shader precision remains the separate SCN-013. |
| IAS15 compatibility / mean-element N-body seeding / Kuiper velocity units | **Preserve the existing fixes.** | REBOUND 5.1.1 is installed and the full suite, including initial-condition, Horizons-accuracy, and Kuiper-unit tests, passes. No new long-term integration claim is made. |
| Lambert returns uncertified exhausted solutions / free powered flybys | **Preserve TOF certification and unpowered v∞ checks.** | Current Lambert state/reference and MGA flyby tests pass. Extra solver capabilities and coverage remain SCN-044/045. |
| Heavy permits are released while timed-out work continues | **Preserve ownership until worker completion.** | `_run_owned_thread` and resource-contract tests cover this behavior. It does not terminate solar compute or guarantee warm-snapshot availability. |
| Catalog provenance, report path containment and overwrite checks | **Preserve current protections.** | Source frontend tests and backend report/benchmark tests pass. Dataset regeneration and independent benchmark truth remain separate issues. |
| Accessibility is now fully fixed | **Incorrect; latest commit is a design.** | Existing labels, focus styles, drawer trapping and CSS reduced-motion improvements remain. SCN-030/031 and the approved design cover outstanding behavior. |

#### October 7 — September 24 ID crosswalk

All 47 IDs from that audit are mapped below so that omissions are visible. Mapping is not a claim that every historical reproduction was repeated.

| Prior ID(s) | Current destination / treatment |
|---|---|
| H-1 | SCN-005, SCN-006; additional solar mechanisms SCN-007–011 |
| H-2 | SCN-001–004; WSA/solar acceptance SCN-041/042 |
| H-3 | Preserved trajectory containment above; wider load SCN-047 |
| H-4 | SCN-012 |
| H-5 | SCN-035; no inherited legal conclusion |
| H-6 | SCN-032 |
| M-1 | SCN-013 |
| M-2 | Preserved time-scale correction above |
| M-3 | SCN-016 |
| M-4 | Updated implementation above; wider quality SCN-044 |
| M-5 | SCN-036 |
| M-6 | SCN-007; solar and trajectory guards differ |
| M-7 | Scoped ingress fix above; deployment review SCN-048 |
| M-8 | SCN-009 |
| M-9 | SCN-023 |
| M-10 | SCN-024 |
| M-11 | SCN-025, SCN-029 |
| M-12 | SCN-047; no current coverage percentage asserted |
| M-13 | SCN-034, SCN-046 |
| M-14 | SCN-014 |
| M-15 | SCN-018 |
| M-16 | SCN-027 |
| M-17 | SCN-033, SCN-049 |
| M-18 | SCN-048; current upstream HTTP status unverified |
| M-19 | SCN-045 |
| M-20 | SCN-028 |
| M-21 | SCN-015 |
| M-22 | Corrected-path closure above; residual SCN-043 |
| M-23 | SCN-043; old counts not reused |
| M-24 | Multi-epoch gate now passes; residual SCN-043 |
| L-1 | SCN-045; changed Lambert code needs a new boundary probe |
| L-2 | SCN-022 |
| L-3 | SCN-038 |
| L-4, L-5 | SCN-049; disclosure/disconnect outcomes not rerun |
| L-6 | SCN-031 |
| L-7 | SCN-030, SCN-047; distinguish CSS motion from simulation motion |
| L-8 | SCN-049 |
| L-9 | Repeated writes in SCN-030; actual layout counts in SCN-047 |
| L-10, L-11, L-12, L-13, L-14 | SCN-049 |
| L-15 | SCN-039; casing inconsistency is not independently counted |
| L-16 | SCN-049 |
| L-17 | SCN-004 |

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

- [September 24 audit](CODEBASE_AUDIT_2026-09-24.md) and its retained evidence: principal historical ID baseline; includes its own corrections and the `bd48a7d` addendum. Pre-existing untracked material.
- [September 7 audit](CODEBASE_AUDIT_2026-09-07.md) and [September 6 physics audit](CODEBASE_AUDIT_2026-09-06.md): historical hypotheses and physics leads, not current status authority.
- [August 24 reconciliation](MAJOR_ISSUE_REPORT_2026-08-24.md) and [Report C / R01–R56 ledger](MAJOR_ISSUE_REPORT_C_SUNFOCUS_HUNT_2026-08-23.md): prior root-cause and branch history.
- [September 25 consolidated status/plan](SUNFOCUS_REGRESSION_STATUS_AND_FIX_PLAN_2026-09-25.md): branch-aware preservation and release gates; not a scan of this exact HEAD.
- [Trajectory amplification plan](TRAJECTORY_AMPLIFICATION_DEFENSE_IN_DEPTH_PLAN_2026-09-25.md): compare with the actual September 26 implementation and passing tests.
- [R3/R4 PFSS work order](R3R4_PFSS_IMPLEMENTATION_PROMPT_2026-09-25.md): solver/input/delivery acceptance design.
- [H1 solar delivery plan](H1_SOLAR_DELIVERY_PLAN_2026-09-25.md) and [digest](H1_SOLAR_DELIVERY_PLAN_2026-09-25_EVIDENCE/h1/digest.md): historical delivery/upstream mechanisms; pre-existing untracked material.
- [October 7 accessibility design](../docs/superpowers/specs/2026-10-07-frontend-accessibility-remediation-design.md): approved design only at audited HEAD.
- [JPL approximate planetary elements](https://ssd.jpl.nasa.gov/planets/approx_pos.html): primary-source identity/time-scale check, accessed in this scan. JPL labels the matching Earth row as the Earth/Moon barycentre and specifies JDTDB for the formula. No new live Horizons truth vectors were downloaded.

Old February accuracy pass rates, unverifiable multi-tool captures, pruned plans, and a September 25 scan without retained results are not used as fresh numerical evidence. This file and its evidence directory are the current scan record; previous reports remain historical records.
