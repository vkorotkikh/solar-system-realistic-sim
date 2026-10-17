# Master issue / problem / bug tracker — 2026-10-11

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

| Date | Source | Provenance | Master use |
|---|---|---|---|
| 2026-10-06 | `CODEBASE_EVALUATION_REPORT_2026-10-06.md` and `_APPENDIX_B_REVIEWERS.md` | Git-only at `e6f8eedd0ae90c71f309921e8effe62ef45ef0cd` on `origin/sun-focus`; 102 `F-*` findings plus `KF-1`–`KF-11` | Primary omitted corpus. Every ID is crosswalked below; current-supported independent roots become `SCN-065`–`083`. |
| 2026-10-07 | [Audit/index](AUDIT_AND_ISSUE_INDEX_2026-10-07.md) | Untracked historical index | Source lineage, physics-fix commits, Dione/Rhea and node-sign leads. |
| 2026-10-07 | [SCN-001–049 tracker](CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-07.md) and `CODEBASE_SCAN_2026-10-07_EVIDENCE/` | Untracked; explicitly superseded by October 10 | Original IDs and September 24 crosswalk; no duplicate rows. |
| 2026-10-07 | [H1 solar plan](H1_SOLAR_DELIVERY_PLAN_2026-09-25.md) and `H1_SOLAR_DELIVERY_PLAN_2026-09-25_EVIDENCE/h2-d10/` | Plan materially updated October 7; 19-file H2-D10 evidence subtree | Solar acceptance detail and H2.5 pole-frame evidence; no additive issue count. |
| 2026-10-07 | `docs/superpowers/specs/2026-10-07-frontend-accessibility-remediation-design.md` | Tracked design | Superseded design provenance only. |
| 2026-10-10 | [SCN-001–064 tracker](CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-10.md) | Untracked; audits `e7de6cc`, `0523a5b`, and `e40fc8c` | Stable canonical backbone and closure criteria; statuses rebased here. |
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
| SCN-005 | P1 | OPEN | PARTIAL | MIXED | Binary-body/metadata overlap is integrated in `6539902`, preserving validation and deadlines; it does not establish the unchanged 2 s startup gate. Earlier `fc3b6a0` passed five-minute DEV/PREVIEW delivery (11/11 physics and 3/3 realtime each), with startup 6.09/8.11 s. Startup behavior, fresh performance/delivery acceptance and actual usable-scene measurement remain open. [Current checkpoint](REMEDIATION_CLOSURE_CHECKPOINT_6539902_2026-10-15.md). |
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
| SCN-030 | P1 | OPEN | PARTIAL; FIX_AVAILABLE_UNMERGED | MIXED | R1-R8 implementation is integrated via `cae3c0f`. Earlier `b072d32` passed 87 UI checks, 29 each in Chromium, Firefox, and WebKit; `00b5346` separately records genuine Chromium 200%/400% zoom on software and RTX 5090. Manual NVDA, VoiceOver, and physical-touch evidence remains outstanding, as does final browser validation after remaining changes. Owner: accessibility/manual acceptance with parent browser integration. [Accessibility evidence](REMEDIATION_ACCESSIBILITY_2026-10-14.md); [dated browser scope](REMEDIATION_CLOSURE_PLAN_2026-10-15.md#recorded-evidence). |
| SCN-031 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `2e2b31d` through `6c6f232` provide accessible no-WebGL/context-loss recovery, stop owned runtime work, and preserve keyboard restart. Actual-app software and RTX 5090 browser gates pass. |
| SCN-032 | P1 | RESOLVED_SCOPED | — | MIXED | PR #7 aligns the README with shipped entry controls, moon display/propagation limitations, and maintenance safeguards. Review and 393-test/build gate passed. |
| SCN-033 | P2 | RESOLVED_SCOPED | — | MIXED | PR #7 ships safe maintenance help/import paths, atomic catalog writes, explicit count-change admission, and shape/uniqueness/orbit validation. Nine updater regressions and full frontend/script gate passed. |
| SCN-034 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | PR #7 path safety is retained. `71ba472` adds real pinned source acquisition, offline-by-default generators, atomic multi-artifact publication and failure-injection tests. Byte identity is separately recorded under `046`. |
| SCN-035 | P1 | DECISION_REQUIRED | PARTIAL | MIXED | `14741bd` adds NOTICE and source/provenance evidence. Owner code-license choice, SILSO noncommercial terms, and unresolved Deimos image permission still prevent a blanket distribution claim. Close with recorded owner choices, permission or approved asset replacement/removal, and a matching distribution inventory. Owner: product/licensing; moon source-storage decisions remain separately required under `043`. [Provenance report](REMEDIATION_PROVENANCE_2026-10-14.md). |
| SCN-036 | P1 | RESOLVED_SCOPED | — | MIXED | Authenticated network profile and per-subject WebSocket admission are implemented. Multi-worker, long-lived, and exclusion fairness remain `047/048`. |
| SCN-037 | P2 | DECISION_REQUIRED | FIX_AVAILABLE_UNMERGED | MIXED | The remediation effort selects explicit fixed-step semantics: time_scale/target_fps days per tick, no wall-time catch-up promise. Runtime telemetry declares the policy. Slow-step regression passes in `a33ad93`; not merged. |
| SCN-038 | P2 | DECISION_REQUIRED | FIX_AVAILABLE_UNMERGED | MIXED | `32da51b` declares simulation-driven versus decorative solar motion and gates pause/reverse/reduced-motion behavior. Integrated UI adapters preserve live JD, pause and time-scale inputs. |
| SCN-039 | P2 | DECISION_REQUIRED | FIX_AVAILABLE_UNMERGED | MIXED | `cae3c0f` integrates a consumed runtime configuration contract: explicit VITE_BACKEND_ORIGIN or same-origin, no query redirects, nondefault backend ports, viewport sizes and drawing-buffer scale. Real-app configuration checks pass. |
| SCN-040 | P1 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `56e799a` archives an intentionally selected source set with original/archived hashes and current-status pointers. This effort and its reports are committed on the construction branch, not yet included in a clone of main. |
| SCN-041 | P1 | VERIFY | RESOLVED_SCOPED | PASS_BOUNDED | Numerical repair `df8adc6` and streaming scientific gate `cdea3bc` remain intact. A pinned NSO/GONG `zqs` epoch now passes production ingestion with bounded, reconstructable polarity scaling; its exact Carrington provider frame is declared but remains non-renderable. Public degree-90 PFSS/WSA topology and provider features pass preregistered one-epoch budgets with bound source hashes. `wsa_inspired_v1` remains globally `unvalidated`, and public observed forcing remains fail-closed; no operational, live-provider, solar-cycle, 1-AU, or scene claim is made. [Observational acceptance](SCN041_OBSERVATIONAL_ACCEPTANCE_2026-10-17.md). |
| SCN-042 | P1 | VERIFY | PARTIAL; FIX_AVAILABLE_UNMERGED | MIXED | Main orientation and controller fixes are integrated. Corrected actual-main hardware fixture passes 154/156 markers and 235/235 surface probes, but default acceptance still fails: diagnostic MSAA/reference mismatch and an asteroid shader PI macro collision. In-memory controls pass all six cases; applying the newly identified corrections awaits approval. Preserve production MSAA, independent reference, one-pixel limit and negative controls. [Rendering evidence](SCN042_RENDERED_ACCEPTANCE_2026-10-15.md). |
| SCN-043 | P1 | VERIFY | PARTIAL | MIXED | All 424 records are prepared in the isolated moon worktree; 517 scoped Node 22 tests and seven Python tests pass, including offline byte-identical generation. Only 13 records are integrated here. Independent review found missing/inconsistent accuracy-certificate and endpoint-limit validation plus uncancelled rejected response bodies; correction approval and source-storage disposition remain pending before promotion. Preserve original 13 hashes, both Puck IDs and all accuracy limits. [Independent review](SCN043_LAZY_INDEPENDENT_REVIEW_2026-10-15.md); [checkpoint](REMEDIATION_CLOSURE_CHECKPOINT_6539902_2026-10-15.md). |
| SCN-044 | P2 | VERIFY | FIX_AVAILABLE_UNMERGED | MIXED | `2613436` adds a dated two-assist witness independently closed with Izzo/Gooding/DOP853, physical periapsis/continuity checks and an inconclusive-on-exhaustion gate. This is a feasible quality floor, not a global optimum or external ephemeris certification. |
| SCN-045 | P2 | VERIFY | FIX_AVAILABLE_UNMERGED | MIXED | `2613436` declares rejection of exact collinearity without a supplied plane. Independent propagated-state gates cover rotated near-zero/near-pi/hyperbolic cases and both senses/branches for 1-3 revolutions. Existing `064` remains preserved. |
| SCN-046 | P2 | VERIFY | FIX_AVAILABLE_UNMERGED | MIXED | `71ba472` pins 17 real provider responses. Two network-disabled asteroid builds and both generators' offline checks reproduce the new committed artifacts byte-for-byte; all 100,000 source periods/diameters/albedos are compared. Historical unpinned artifacts were replaced, not reverse-engineered. |
| SCN-047 | P1 | VERIFY | PARTIAL | MIXED | Fresh backend at `a8187a7`: 3878 passed, zero failed, 12 skipped. Frontend at `6539902`, Node 22.23.2: 745 passed, 411 skipped; strict TypeScript/build pass. Required native Tudat: 17 passed without skips. Scientific gate: six baselines pass and six mutants killed. Remaining rendering, startup/delivery, moon, browser and applicable manual/deployment acceptance prevent global closure. Exact revisions, warnings and overlapping scopes remain explicit. [Checkpoint](REMEDIATION_CLOSURE_CHECKPOINT_6539902_2026-10-15.md). |
| SCN-048 | P1 | VERIFY | PARTIAL | MIXED | Requested-epoch coverage `938bca0`, live AIA cache freshness `64cc9d4`, and local authenticated proxy/soak evidence are integrated. Scalar-JD leap-boundary information loss remains unresolved: owner choice is strict ambiguous-bin rejection with precise two-part input or documented rounding. Remote URL/authentication/TLS acceptance and provider/frame calibration remain outstanding; observations stay fail-closed. Owner: time-policy and deployment owners, with solar review; local captures do not certify continuous archive coverage or spatial use. [Independent review](INDEPENDENT_EVIDENCE_REVIEW_892d049_938bca0_2026-10-14.md); [closure plan](REMEDIATION_CLOSURE_PLAN_2026-10-15.md). |
| SCN-049 | P2 | VERIFY | FIX_AVAILABLE_UNMERGED | HIGH | Stale-Kuiper reactivation was reproduced with actual native producer captures and repaired in `a8187a7` using negotiated subscription IDs. Review-strengthened browser replay now proves `src/main.ts` advanced beyond its static range placeholder with no page errors or cross-origin network escape, the stale 36-position Kuiper payload is rejected while its valid body update applies, and the exact 38-position replacement payload is accepted in Chromium and Firefox. WebKit remains enabled but is host-blocked before test code by missing shared libraries. Legacy non-negotiated semantics remain intentionally compatible; Section 7 visual/lifecycle children retain independent acceptance requirements. [Producer/protocol evidence](REMEDIATION_SCN049_KUIPER_REACTIVATION_2026-10-15.md). [Browser closure](REMEDIATION_SCN049_BROWSER_ACCEPTANCE_2026-10-17.md). |
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
| SCN-070 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `a33ad93` command recovery is strengthened by independent review `06a2562`: partial mutating seeks latch fatal state, read-only failures recover, failed telemetry clears stale snapshots, and live native/ASGI cases pass. |
| SCN-071 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | `06a2562` repairs repeated-cancellation lease release, stale-snapshot liveness, queue-drain starvation and concurrent native handshake reads. Cleanup retains actual worker ownership; focused, repeated and integrated gates pass. Arbitrary unkillable native-thread hangs remain a declared limitation. |
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
| Realtime-client schema inconsistency and reconnect details | SCN-049 | A current delivered-payload or consumer failure with supported schema inputs. |
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
