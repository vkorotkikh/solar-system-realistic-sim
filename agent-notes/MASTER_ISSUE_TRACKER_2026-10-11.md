# Master issue / problem / bug tracker — 2026-10-11

Generated **2026-10-11 21:25:36 -0400 (EDT)** from the issue-bearing artifacts
semantically dated **2026-09-27 through 2026-10-11 inclusive**. This is a
deduplicated status ledger, not a claim that every line of the repository has
been formally verified.

Current reconciliation **2026-10-14**. The product baseline is `origin/main`
at `f45c1f917398718e27d8f1a9fdfa8502592c21fd`. PRs #7, #8, #9, and #11
have landed since the original October 11 snapshot. Active implementation is on
`remediation/canonical-register-20261014`; its fixes remain explicitly unmerged.
See [the remediation effort](REMEDIATION_EFFORT_2026-10-14.md) for assignments,
closure gates, tests, and remaining dependencies. Historical source snapshots
below retain their original dates and are not current release certification.

<!-- MASTER_TRACKER_COUNTS {"snapshot":"origin/main@f45c1f917398718e27d8f1a9fdfa8502592c21fd","canonical_total":83,"OPEN":45,"RESOLVED_SCOPED":23,"VERIFY":9,"DECISION_REQUIRED":6,"PARTIAL_qualifier":11,"FIX_AVAILABLE_UNMERGED_qualifier":4,"alias_rows":138} -->

## 1. Result

| Primary state | Count | Meaning |
|---|---:|---|
| `OPEN` | **45** | Current observation or source establishes the defect at the pinned product snapshot. |
| `RESOLVED_SCOPED` | **23** | The named root defect is corrected and has replacement evidence; nearby capability or model limits remain separate rows. |
| `VERIFY` | **9** | An acceptance/capability question or historical observation still needs a current independent oracle. |
| `DECISION_REQUIRED` | **6** | Code implements a policy or tradeoff whose intended product contract must be chosen explicitly. |
| **Canonical total** | **83** | One row per root finding; aliases and split symptoms are not additional findings. |

Eleven rows carry the overlapping `PARTIAL` progress qualifier. Four rows currently have
an independently identified `FIX_AVAILABLE_UNMERGED`; these remain unclosed on
`origin/main`. Counts describe landing status, while the remediation effort
records additional work in progress. Dormant, optional, offline, and workspace-scoped findings are
still counted when their current code mechanism is established, but those
qualifiers are stated explicitly.

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
4. **Branch-only is not shipped.** Candidate commits on
   `fix/tracker-merge-2026-10-11` are recorded as
   `FIX_AVAILABLE_UNMERGED`, never as resolved on `origin/main`.
5. **Scoped closure stays scoped.** A resolved original defect does not certify
   its whole subsystem. `SCN-022` closes the JavaScript Kepler solver; a GLSL
   twin remains a verification child. `SCN-062` closes default-scale event
   lifetime, not every flare-coordinate or capacity question.
6. **No stale measurement laundering.** Historical numerical values are
   retained only as historical evidence unless rerun or supported by unchanged
   current code. `EXTRA-1` therefore remains under `SCN-043 VERIFY`, while the
   freshly checked retrograde-node mechanism is promoted to `SCN-081`.

Primary `State` values are `OPEN`, `RESOLVED_SCOPED`, `VERIFY`, and
`DECISION_REQUIRED`. `Progress` may be `PARTIAL` and/or
`FIX_AVAILABLE_UNMERGED`. Evidence is `OBS` (executed observation), `CODE`
(current source establishes the mechanism), or `MIXED`.

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
| SCN-004 | P1 | OPEN | — | OBS | Solar upstream bytes and body reads are bounded, but blocking DNS and header acquisition can exceed the total deadline. Require deadline-owned resolution/header/body cancellation and resource recovery. |
| SCN-005 | P1 | OPEN | PARTIAL | MIXED | Solar source/fallback state is now visible, but production-budget dev/preview delivery remains unproved. The single five-minute browser delivery gate is owned here; `047` depends on it. |
| SCN-006 | P1 | RESOLVED_SCOPED | — | OBS | Default localhost and loopback-IP Vite preview origins pass the CORS contract. Actual deployed origins remain `048`. |
| SCN-007 | P1 | RESOLVED_SCOPED | — | OBS | Solar admission now uses trusted identity policy and bounded stores; rotating untrusted headers no longer create unlimited identities. Preserve proxy/auth/cap/eviction tests. |
| SCN-008 | P1 | RESOLVED_SCOPED | — | OBS | `/solar/physics` rejects extreme finite epochs and bounds JDTDB before compute. AIA historical-date coverage is separately `048`; playback escape is `053`. |
| SCN-009 | P1 | RESOLVED_SCOPED | — | OBS | Unvalidated/stale observation assimilation fails closed rather than applying zero-confidence forcing. Enabling validated assimilation still requires an epoch/provenance oracle. |
| SCN-010 | P1 | OPEN | — | OBS | A failed aggregate realtime snapshot is cached for the normal 300-second lifetime, delaying SWPC recovery. Distinguish failure/partial cache entries and retain bounded last-known-good behavior. |
| SCN-011 | P2 | RESOLVED_SCOPED | — | OBS | AIA timestamps are canonicalized to UTC before the browser freshness calculation. Preserve cross-timezone tests. |
| SCN-012 | P0 | OPEN | PARTIAL | OBS | Undefined benchmark metrics are now null and two published fixed-state references catch mutations, but the three legacy scenarios remain 0/3 comparable. Require reproducible nonzero coverage. |
| SCN-013 | P1 | OPEN | — | OBS | Asteroid shader inputs subtract float32 absolute Julian dates, losing sub-day precision. Upload relative/split time and gate CPU-double versus GPU/readback behavior. |
| SCN-014 | P1 | OPEN | — | OBS | ACBF's own 100,000-row round trip still reports 99,916 mismatches. Define field-specific quantization budgets and add a passing format contract without conflating it with artifact integrity. |
| SCN-015 | P2 | DECISION_REQUIRED | — | CODE | The app displays the first 50,000 records of a diameter-descending catalog. Declare this largest-body policy or implement deterministic representative sampling and population gates. |
| SCN-016 | P1 | RESOLVED_SCOPED | — | MIXED | Runtime Earth is now geocentric (`fea6f9d`); the raw source row remains EMB and fixture scope is narrow. Preserve target-3/399 identity gates. |
| SCN-017 | P1 | OPEN | — | OBS | Planet velocity omits derivatives of secular elements and axes. Differentiate the full time-dependent model and gate derivative agreement across epochs/steps before external accuracy claims. |
| SCN-018 | P2 | RESOLVED_SCOPED | — | MIXED | Pluto secular rates and a position/velocity gate were added by `fc32483`. Preserve the declared model interval and fidelity limitations. |
| SCN-019 | P1 | RESOLVED_SCOPED | — | MIXED | Mined cargo now enters the chronological return-burn mass ledger and closure (`62a4f5d`). This does not close risk, reserve, or burn-definition roots `020/052/078`. |
| SCN-020 | P1 | OPEN | PARTIAL | OBS | Every risk sample now re-closes deterministic feasibility, but reported propellant margin still counts fuel discarded with jettisoned stages. Margin must mean onboard usable fuel. |
| SCN-021 | P1 | RESOLVED_SCOPED | — | OBS | SMBH Schwarzschild radii and dependent unit conversions were corrected by `eef8945`. Direction/jet-data consistency is separately `069`. |
| SCN-022 | P2 | RESOLVED_SCOPED | — | OBS | The JavaScript Kepler solver is safeguarded for all supported `e < 1` (`7a21468`). The GLSL twin remains a `049` verification child outside the shipped catalog domain. |
| SCN-023 | P1 | OPEN | — | MIXED | H29 metric presentation still mutates canonical orbital state. Separate scientific state from display offsets and prove experiment on/off invariance. |
| SCN-024 | P2 | OPEN | — | OBS | KBO propagation and buffer upload continue while simulation time is paused. Instrument per-buffer work and skip unchanged-state uploads. |
| SCN-025 | P1 | OPEN | PARTIAL | OBS | TypeScript diagnostics improved and the ratchet passes, but strict typecheck still fails. Close only on strict zero without relaxed settings. |
| SCN-026 | P1 | RESOLVED_SCOPED | — | MIXED | PR #7 (`952de6a`, merge `6a9de62`) restricts Vitest discovery to product/script trees. Prior branch gate: 393 frontend/script tests and production build passed; preserve discovery exclusions. |
| SCN-027 | P1 | RESOLVED_SCOPED | — | MIXED | PR #7 documents the pinned backend test environment and current invocation. Prior reviewed branch gates passed; full current integrated README-to-suite execution is recorded in the remediation effort. |
| SCN-028 | P1 | OPEN | — | OBS | Eleven registry advisory entries remain without reachability/remediation closure. Update deliberately and rerun lockfile, test, type, build, and audit gates. |
| SCN-029 | P1 | RESOLVED_SCOPED | — | MIXED | A tracked CI/backend/science mutation workflow exists and passes its scoped contract. Strict TS is `025`; broader browser/live/load gates are `047`. |
| SCN-030 | P1 | OPEN | — | MIXED | Responsive reflow, modal focus, keyboard/tap camera control, stable announcements, and accurate experiment copy remain unimplemented. The October 11 R1–R8 artifacts are plans, not fixes. |
| SCN-031 | P2 | OPEN | — | OBS | No-WebGL startup still yields no accessible recovery surface. Catch startup/context loss and verify a usable unavailable-state path. |
| SCN-032 | P1 | RESOLVED_SCOPED | — | MIXED | PR #7 aligns the README with shipped entry controls, moon display/propagation limitations, and maintenance safeguards. Review and 393-test/build gate passed. |
| SCN-033 | P2 | RESOLVED_SCOPED | — | MIXED | PR #7 ships safe maintenance help/import paths, atomic catalog writes, explicit count-change admission, and shape/uniqueness/orbit validation. Nine updater regressions and full frontend/script gate passed. |
| SCN-034 | P2 | OPEN | PARTIAL | MIXED | PR #7 fixes external-output paths; pinned source inputs and multi-artifact transactionality remain under this issue. Offline byte-identical reproduction remains independently `046`. |
| SCN-035 | P1 | DECISION_REQUIRED | — | CODE | Repository distribution terms and asset/provider attribution remain incomplete. The owner must choose licensing policy and document per-source provenance. |
| SCN-036 | P1 | RESOLVED_SCOPED | — | MIXED | Authenticated network profile and per-subject WebSocket admission are implemented. Multi-worker, long-lived, and exclusion fairness remain `047/048`. |
| SCN-037 | P2 | DECISION_REQUIRED | FIX_AVAILABLE_UNMERGED | MIXED | The remediation effort selects explicit fixed-step semantics: time_scale/target_fps days per tick, no wall-time catch-up promise. Runtime telemetry declares the policy. Slow-step regression passes in `a33ad93`; not merged. |
| SCN-038 | P2 | DECISION_REQUIRED | — | CODE | Solar visuals use wall time during pause/reverse rather than simulation JD. Declare decorative versus simulation motion and gate pause/reverse/reduced-motion behavior. |
| SCN-039 | P2 | DECISION_REQUIRED | — | CODE | Backend and viewport configuration has multiple partially consumed paths and a fixed port assumption. Select one deployment/configuration contract and test nondefaults. |
| SCN-040 | P1 | OPEN | — | MIXED | Recent audit/tracker artifacts remain outside `origin/main`, so fresh clones omit them. Archive an intentionally selected, reviewed set without sweeping unrelated work. |
| SCN-041 | P1 | VERIFY | — | MIXED | WSA-inspired formula/label and boundary mutants are corrected, but independent observed/reference speed-map calibration and topology coverage remain. |
| SCN-042 | P1 | VERIFY | PARTIAL | MIXED | Hathaway normalization, rotation labeling, and Sun pole/presentation subparts were fixed; broad solar frame, projection, coordinate, and screen-space truth still needs separate oracles. |
| SCN-043 | P1 | VERIFY | PARTIAL | MIXED | Io, Europa, and Triton were corrected, but the intended 424-body denominator, Dione/Rhea historical offsets, and broader moon accuracy remain unverified. Generic retrograde-node sign is promoted to `081`. |
| SCN-044 | P2 | VERIFY | PARTIAL | MIXED | Per-body/equatorial flyby floors exist, but real-window/two-assist search quality, v-infinity continuity, and exhausted/inconclusive reporting need independent benchmarks. |
| SCN-045 | P2 | VERIFY | PARTIAL | MIXED | Multi-revolution, hyperbolic, and zero-revolution handling improved, but exact-180° plane policy, near-zero geometry, and independent boundary coverage remain. Near-π wrong states are `064`. |
| SCN-046 | P2 | VERIFY | — | MIXED | Current artifacts parse and hashes match, but pinned-input, offline, byte-identical regeneration remains unproved. `034` owns generator safety. |
| SCN-047 | P1 | VERIFY | — | MIXED | Hardware GPU, browser, accessibility, multi-worker/load, startup, and sustained delivery release gates remain. It depends on `005` for the single production delivery gate. |
| SCN-048 | P1 | VERIFY | — | MIXED | Live providers, actual deployment/proxy/auth behavior, and AIA date coverage remain unestablished. Do not convert network absence into a current upstream failure claim. |
| SCN-049 | P2 | VERIFY | PARTIAL | MIXED | Historical low-priority/dormant catch-all: Sirius, tide axes, and Trojan phasing are fixed; unpromoted children remain named in Section 7 rather than silently discarded. |
| SCN-050 | P2 | OPEN | PARTIAL | MIXED | Backend Hathaway normalization uses the true parameterized peak, but the active frontend fallback still clips an artificial plateau. Gate both implementations against one analytic shape. |
| SCN-051 | P2 | OPEN | — | OBS | Parser-accepted float64 FITS can fail PFSS admission when reconstructed bytes no longer match the original hash. Round-trip every supported encoding while rejecting tampering. |
| SCN-052 | P1 | RESOLVED_SCOPED | — | MIXED | PR #8 (`44503ec`, merge `bb2e8ef`) fixes stage reserves against immutable initial propellant. Partition, unequal-stage/cargo/jettison regressions and full 2168-test backend gate passed. Discarded onboard margin remains `020`. |
| SCN-053 | P1 | RESOLVED_SCOPED | — | MIXED | PR #9 (`9102c18`, merge `1fa45f0`) applies the REBOUND supported epoch contract before stepping. Focused regressions and full 2167-test backend gate passed. |
| SCN-054 | P2 | OPEN | — | OBS | Kuiper binary initialization floors separation cubed and reverses primary/companion mass weighting; preserve each subclaim and gate physical relative-orbit invariants plus serialization. |
| SCN-055 | P2 | OPEN | — | OBS | Tudat energy subtracts Sun-in-SSB and planet-in-heliocentric coordinates, so translation changes energy. Reconstruct one declared origin/frame and rerun with real Tudat. |
| SCN-056 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | Reviewed commit `2605f25` enforces family registration through both public EPO runners; included in the remediation integration branch. Prior full 2165-test backend gate passed. Not yet on origin/main; smoke truth remains `079`. |
| SCN-057 | P2 | OPEN | — | OBS | Dormant force callbacks access a REBOUND simulation pointer as a direct object and raise. Use the supported callback API and gate actual acceleration before activation. |
| SCN-058 | P1 | OPEN | — | OBS | Earth/Mars LOD merge destroys children but leaves a detached parent mesh pointer, producing zero far meshes. Repeated near/far cycles must preserve coverage and bounded ownership. |
| SCN-059 | P1 | OPEN | — | OBS | Physical-scale toggling does not update Earth/Mars quadtrees. Gate effective radii, displacement, LOD thresholds, and camera framing in both scale modes. |
| SCN-060 | P2 | OPEN | — | OBS | Nonrecursive raycasting and missing child identity prevent Earth/Mars double-click selection. Use deliberate pick proxies or ancestor identity across LOD/scale states. |
| SCN-061 | P1 | OPEN | — | MIXED | Planet shader projects the face-local plane before applying face translations, placing vertices hundreds of radii away. Apply face coordinates before spherical projection and gate seams/centres/corners. |
| SCN-062 | P2 | RESOLVED_SCOPED | — | MIXED | `b5387c2` gives default-scale flare/CME events a positive lifetime with tests. Other stochastic and coordinate behavior is `065/042`. |
| SCN-063 | P2 | DECISION_REQUIRED | — | OBS | A stalled Horizons read retains the sole remote permit, bounding abandoned work but temporarily removing capacity. Explicitly accept that tradeoff or provide terminable transport ownership; never release permits while work survives unbounded. |
| SCN-064 | P1 | RESOLVED_SCOPED | — | MIXED | PR #11 (`3927ab7`, merge `f45c1f9`) stabilizes near-collinear angle/state recovery. Independent endpoint regressions and full 2177-test backend gate passed; broader solver coverage remains `045`. |
| SCN-065 | P2 | OPEN | — | CODE | Continuous stochastic AGN flaring advances only while a foreground event is active. Advance background state independently and deterministically test bursts with no active event. |
| SCN-066 | P2 | OPEN | — | CODE | AGN preset/observer controls do not select the behavior their labels promise: H29 changes energy without selecting H29, while observer projection calls a no-op. Align copy, dispatch, and status or remove the controls. |
| SCN-067 | P2 | OPEN | — | MIXED | Disabled AGN grids remain visible/submitted with `frustumCulled=false`, and the warp grid lacks a reset path. Start hidden, enable only per event, reset both, and gate lifecycle/submission. Wrong-plane semantics remain `042`. |
| SCN-068 | P2 | OPEN | — | CODE | Latent `metricFrameDragPeak` default references unimported `SGR_A`, producing TS2304 and a potential no-third-argument runtime error. Import it or remove the default and add a direct test. |
| SCN-069 | P2 | OPEN | — | MIXED | SMBH scene directions differ 33–92° from source coordinates and M87's declared intrinsic beta cannot produce its declared apparent speed. Use a cited frame and mutually consistent or explicitly hypothetical data. |
| SCN-070 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | Commit `a33ad93` returns command_failed without permanently latching runtime_error, preserves fatal engine failure, and rejects misleading resume. Live-runner recovery regressions pass; not merged. |
| SCN-071 | P2 | OPEN | FIX_AVAILABLE_UNMERGED | MIXED | Commit `a33ad93` bounds ASGI send/accept/close and output-idle lifetime, guards runner start/initial delivery, and awaits socket/runner cleanup before releasing admission. Stalled handshake/send and slot-reuse gates pass; 59 focused runtime tests; not merged. |
| SCN-072 | P2 | OPEN | — | MIXED | Trajectory/mission routes accept unsupported finite epochs and can leak low-level failures as plain HTTP 500. Enforce one interval and stable structured 4xx errors across all planning routes. |
| SCN-073 | P2 | OPEN | — | CODE | Horizons transport follows default cross-host or HTTPS-downgrade redirects. Disable automatic redirects and validate every hop against an HTTPS host/port allow-list. |
| SCN-074 | P2 | OPEN | — | MIXED | Thirteen REBOUND fallback bodies are initialized by long invalid back-propagation from their element epochs, previously measuring median 11.9 million km error. Initialize at declared epochs and gate per-body accuracy/fidelity. |
| SCN-075 | P1 | OPEN | — | MIXED | Synthetic PFSS maps redraw time-bucketed random bipoles unrelated to persistent active regions, causing discontinuity and inconsistent physics layers. Share seeds/rotation/lifetime/Hale polarity and gate continuity/spatial agreement. |
| SCN-076 | P2 | OPEN | — | CODE | Dormant Poynting–Robertson drag omits the inward radial term and cancels for radial motion. Correct and reference-test circular/radial/eccentric cases before wiring, or remove the advertised capability. |
| SCN-077 | P2 | OPEN | — | CODE | Optional Tudat execution reseeds every chunk from SPICE, nullifying accumulated J2/J4 effects, and omits `jd_time_scale`. Preserve continuous state, emit TDB metadata, and test across chunks in a Tudat environment. |
| SCN-078 | P1 | OPEN | — | MIXED | Mission logistics treats planet-relative heliocentric v-infinity sums as spacecraft propulsive burns. Derive declared parking/capture burns or prohibit the field's use in rocket-equation closure and gate independent patched-conic cases. |
| SCN-079 | P2 | OPEN | — | MIXED | EPO smoke verification reads the wrong result nesting, uses an unsupported objective, and exits zero with 0/30 passes. Fix all three and require known pass/fail episodes with nonzero failure exit. |
| SCN-080 | P2 | OPEN | — | MIXED | Backend `kepler/auto` ephemeris advances fixed J2000 elements without secular rates and publishes no error interval. Share a gated model or ephemeris and add independent multi-epoch accuracy bounds. |
| SCN-081 | P2 | OPEN | — | MIXED | Generic moon-node precession assigns the same negative sign to 286 of 287 current retrograde moons, although nodal direction reverses with inclination convention. Carry signed source rates or derive direction and gate representative prograde/retrograde cases. |
| SCN-082 | P2 | OPEN | — | MIXED | The “verified” Phase-1 asteroid catalog uses synthetic taxonomy/albedo and coarse periods; its hash proves integrity, not scientific fidelity. Preserve unknowns, use precise periods, and label/gate provenance separately. |
| SCN-083 | P2 | OPEN | — | MIXED | Planet pole construction and signed spin periods double-encode retrograde behavior for Venus/Uranus/Pluto and misorient axes. Store cited IAU poles, encode direction once, and gate signed angular-velocity vectors. |

## 5. Candidate-fix reconciliation (2026-10-14)

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

These source findings remain explicit. They were not promoted because the
current snapshot lacks a fresh failing observation, their impact is conditional,
or they are acceptance/debt questions rather than one atomic product defect.

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

## 8. Post-October-10 disposition changes on main

| Canonical ID | Fixing evidence | Current result |
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

- `SCN-004` concerns acquisition deadline ownership; `SCN-063` is a
  deliberate single-permit availability tradeoff. Neither is the old
  API-wide trajectory-starvation report.
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
- `SCN-050` is partial until backend and active frontend fallback share the
  same analytic normalization.
- `SCN-054` contains separation-floor, mass-offset, persistence, and
  serialization subclaims; a one-line fix cannot close the group silently.
- `SCN-055` energy origins, `SCN-057` callback ABI, `SCN-076` force formula,
  and `SCN-077` Tudat chunk/time semantics are distinct.
- `SCN-058` lifecycle, `059` scale, `060` picking, and `061` shader coordinates
  are independent Earth/Mars failures and should be verified together without
  merging their identities.
- `SCN-062` event lifetime, `SCN-065` stochastic scheduling, and `SCN-067`
  grid lifecycle are separate event-system roots.

## 10. Recommended repair order

1. **Protect numerical and mission claims:** `SCN-012`, `064`, `075`, `078`,
   `052`, `020`, `053`, then `017`, `051`, `054`, `055`, `080`, `081`, `083`.
2. **Repair active Earth/Mars and event presentation:** `061`, `058`, `059`,
   `060`, followed by `065`–`069`; preserve the scoped `062` fix.
3. **Finish solar delivery and provider reliability:** `004`, `010`, `005`,
   then the independent `041/042/048` acceptance work.
4. **Close network/session contracts:** `070`–`073`, `056`, `057`, and the
   controlled decision for `063`, with soak/load evidence under `047`.
5. **Integrate the branch-only developer fixes:** rebase/review `026`, `027`,
   `032`, `033`, and the `034` sub-fix; then address strict typing (`025`) and
   dependency advisories (`028`).
6. **Implement the reviewed accessibility work:** `030` and `031`, keeping
   browser/AT evidence explicit under `047` rather than treating the plan as a
   pass.
7. **Resolve policy/provenance decisions:** `015`, `035`, `037`–`039`, artifact
   reproducibility `046`, and catalog truth `082`.

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
- Current independent reruns reproduced `SCN-052`, `063`, and `064`, including
  the 179.999999° Lambert velocity error of 5,101.243 m/s and propagated miss
  of 209,061,472 km. Other current dispositions use the structured `68c3f85`
  evidence, exact fixing commits, and/or unchanged-source checks; they are not
  blanket subsystem certifications.
- `SCN-051` is a synthetic offline parser-to-solver contract; `055` used
  injected states without executing Tudat; `057` is dormant; and `063` is a
  controlled local availability experiment. Those scopes must remain visible.
- No live provider, production deployment, hardware GPU, complete screen-reader
  matrix, all-424-moon oracle, or real Tudat run was added by this merge.
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

The 2026-10-14 remediation effort updates this master and links related source
notes to the current ledger. Dated source findings remain historical evidence.
Implementation and release validation are recorded separately, with no blanket
closure inferred from generic green tests.
