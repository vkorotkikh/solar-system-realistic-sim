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
  - 30 hold.
  - 4 are closed by the accepted policies.
  - SCN-005, SCN-030 and SCN-035 stay partial, as listed below.
  - SCN-029's CI exists, but nothing enforces it (see SCN-047 below).
  - SCN-033 and SCN-040 were incomplete.
- **Backend suite.** A clean install from `ci/backend-test-requirements.txt` ran the full suite on `main`:
  **5,833 passed, 13 skipped**.
- **Unchanged.** The 2026-10-30 counts and tables below are left as recorded.

| Item | Found on 2026-11-06 | Pull request (open, not merged) | CI on the PR |
|---|---|---|---|
| SCN-033 | Three more maintenance scripts ignored `--help` and ran. `capture_all_moon_oracle.py` and `fetch_remediation_ephemeris.py` queried JPL Horizons and overwrote tracked fixtures; `generate_synthetic_gong_fixture.py` rewrote the GONG fixture. | [#45](https://github.com/vkorotkikh/solar-system-realistic-sim/pull/45): `argparse` in each `__main__`. A subprocess test shows `--help` writes nothing and an unsupported option exits 2. | Pass, except one Chromium run: `scene-text-contrast.spec.ts:56` timed out waiting for `#control-panel` to hide. The other run of the same commit passed, and the PR changes no frontend code. |
| SCN-040 | The archive is on `main`, but the living trackers still linked the untracked originals and one retired note. | [#46](https://github.com/vkorotkikh/solar-system-realistic-sim/pull/46): three links now point at the committed archive copies and the retirement permalink. | Pass |
| SCN-004 | The product fix holds, but its transport-deadline tests failed 6 of 9 with one core shared by five busy processes. Their fixture server could also stop pytest from exiting after a client left early. | [#47](https://github.com/vkorotkikh/solar-system-realistic-sim/pull/47): deadline headroom, EOF handled as a disconnect, daemon thread. The full backend suite passed: 5,834 passed, 13 skipped. | Pass |

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
- **SCN-047.** The remote configuration is now known: `main` has no branch protection (checked 2026-11-07), so no
  check is required before a merge. Both workflows run on pushes and pull requests; the frontend workflow only when a
  change touches one of the paths it lists.

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

| Area | Result |
|---|---|
| Cargo / mission risk | Continuous production/loss chronology, departure-versus-arrival cargo and realized delivered yield corrected. Failed deliveries report zero cargo. Original30-sample risk floor and propellant reserve policy preserved. |
| Orbital solvers / binaries | Frontend/backend direct Kepler exhaustion is certified or rejected; valid near-unity eccentricity is preserved. Rendered binary phase and companion origin corrected. |
| Solar | Literal hemisphere/cycle Hale polarity and cache identity corrected. Eruption alpha zero, shared uploaded position storage and dynamic bounds corrected. Guarded exact-byte real-map admission added; broader scientific failures stay visible. |
| Moons | All 424 records now have committed fitted models and independent vector checks: original 13 plus 410 lazy shards for411 records, including both Puck aliases. Endpoint/aggregate/oracle validation and body cancellation/timeouts corrected. Native gzip/Brotli delivery works without weakening decoded integrity/caps. All 410 shards reproduce byte-for-byte offline. |
| Startup / ownership | Exactly one source-selected asteroid population/renderer, early catalog dispatch, final-scale reconciliation and cancellation implemented. Quadtree/Sun/worker/listener cleanup and internal renderer/controls acquisition failure repaired. DPR-reset fix retained. |
| Browser / client | Width-based modal reconciliation, immediate camera feedback and blocking browser lanes integrated. Versioned stale-activation rejection retained; legacy replacements get a new socket. Captures are REBOUND/WHFast API/library evidence, not default-UI N-body activation. |
| Accessibility | Two named areas now have explicit group roles. Five pinned axe4.11.1 rule audits cover desktop, mobile closed/open and recovery, without rule exclusions or accepted violation baselines. Manual evidence remains separate. |
| Time ingress | Precise two-part JDTDB is preserved through AIA HTTP ingress/provider/cache. Ambiguous scalar bins return400; true unsupported UTC leap instants return422. Valid precise midnight is retained. |
| Tooling / docs | Explicit CLI publication opt-in and Gaia identity/full-query cache prerequisites integrated. Non-root asset URLs, README counts/source links/entry scope and current model delivery corrected. |
| Provenance | All 577 selected September/H1 originals retained byte-identically with hashes. Exact427-file public inventory and source/runtime product boundaries recorded. Owner selected permission-required original-code terms; third-party rights stay separate. |

The owner explicitly retained the five existing product contracts in
[accepted policies](../docs/supported-product-policies.md). Copying/distribution
of original code requires express permission under [LICENSE](../LICENSE).
This does not grant rights in third-party material.

## Actual verification

Counts in separate lanes overlap; do not add them as unique coverage.

| Lane | Actual result and boundary |
|---|---|
| Backend + CI contracts | **4500 passed,12 skipped**. All 12 skipped optional-native cases map to fresh passing native checks. |
| Native Tudat | **17 +1 passed**, no skips, real Tudat1.0.0 / Python3.12.15 / NumPy1.26.4. Version-bound evidence; no claim about older compatibility branches. |
| Maintenance / moon native | **65 passed +9 subtests** in maintenance; separate **460 passed** moon/native/source checks, including byte-identical all 410 offline rebuild. |
| Frontend | **1672 passed,2 optional GPU skips**. Those two EGL cases separately passed on llvmpipe. All 424 record tests run without411 missing-model skips. |
| Types / build / dependency audit | Strict source/UI types, zero-error ratchet and production build pass. Pinned clean install and current npm audit pass with zero reported advisories. Existing >500kB bundle warning remains. |
| Scientific gate | **6/6 baselines pass;6/6 mutants detected** with original thresholds. Only the intentional PFSS input hash changed; current backend/science inputs match the executed checkpoint. |
| Chromium | **54 passed,1 optional native-visibility skip** in the final combined run. A separate **4/4 native run** covers that real hidden-tab case plus genuine200%/400% tab zoom and the substitute-rejection case. |
| Firefox / WebKit | Each earlier full lane: **33 passed,17 explicitly Chromium-specific skips**. Each also passed all **5 new rule audits** after the group-role correction. These are Linux engines, not VoiceOver/Safari device acceptance. |
| GPU | Actual RTX5090: **125 asteroid cases**, **12 relief +12 flat planetary screen cases**, **6 actual-main solar frame cases** and all 3 negative controls detected. Production AA retained; diagnostic pixel targets remain explicitly diagnostic. |
| Cold DEV / cold PREVIEW | Each fresh-backend five-minute gate: **11/11 physics,3/3 realtime,11/11 activity-uniform matches**. Original deadlines/polls/geometry eligibility retained. Synthetic forcing is disclosed; observed forcing remains disabled. |

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

| Item | Completed here | Still required |
|---|---|---|
| SCN-005 | Completed-result/slow-exit repair preserves cancellation and deadlines; planetary shader specialization improves measured median first GPU completion 32.2% DEV / 34.3% PREVIEW. | Candidate completion 5.1–5.9s remains host-bound; universal usable-scene/compositor startup acceptance remains open. See November 2 report/evidence. |
| SCN-030 | Scene contrast/layout fixes; 51 three-engine accessibility/reflow passes; actual-renderer checks; 19-case manual-record validator and operator checklist. | Actual NVDA, VoiceOver, OS text resizing and physical touch: 18 required manual cases pending. Automated contrast evidence and its bounded axe disposition are recorded. |
| SCN-035 | Permission-required code policy, noncommercial SILSO disposition and Deimos removal implemented. Exact 426-public-file + 12-local-input gate packages six notices/registers. | 43 product records retain explicit rights-review requirements; broader release/export scope remains separate. The old Deimos/SILSO owner-choice wording is stale and superseded. |
| SCN-041 | Numerical guards retained; independent sampling diagnosis, exact contributor-list provenance and matched external-speed comparison tooling added. | Real-map degree 90 conditioning and feature gates still fail; application speed/1-AU propagation calibration remains unmet. External-model residuals are not application validation. |
| SCN-042 | Alpha/upload/bounds repairs and actual-main diagnostic frame gate. | Broader artistic-layer/camera/epoch acceptance. The user-observed square eruption particles are untextured illustrative point sprites; realistic scale changes dimensions, not observational fidelity. |
| SCN-047 | Local code/type/build/science/browser/delivery lanes and blocking workflow configuration. | Remaining manual, rights, startup, broad science/render/capacity, architecture and deployed acceptance; actual remote required-check configuration is not certified. |
| SCN-048 | Leap-boundary policy, precise input/cache and typed provider errors. | Deployed TLS/auth/proxy evidence and remaining provider/frame calibration. Owner knows no target; public GitHub metadata advertises no homepage/Pages/deployment records. External hosting elsewhere was not excluded. |
| SCN-049 | Client/protocol/browser and legacy socket fences; real owner cleanup; current native visibility. | Broader composition/shared-executor/permanently hung native ownership and orphan-asset/operational acceptance children. |

Every original Section7 child remains in the retirement/register evidence.
A narrow supplement can close while its broader canonical parent remains open;
closing a coefficient/source/frame diagnostic does not certify the entire Sun,
mission, catalog distribution or deployed application.

## Original note dispositions

Original hashes, version comparisons, corrected scope mappings and exact proof
are in the retirement register. Links for retired notes target their
immutable original Git snapshots; archived source copies remain unchanged.

| Original remediation note | Current disposition |
|---|---|
| [75052_REFERENCE_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_75052_REFERENCE_2026-10-14.md) | Retired: scoped requirements verified |
| [ACCESSIBILITY_2026-10-14](REMEDIATION_ACCESSIBILITY_2026-10-14.md) | Open: accessibility-manual |
| [AIA_EPOCH_COVERAGE_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_AIA_EPOCH_COVERAGE_2026-10-14.md) | Retired: scoped requirements verified |
| [ASTEROID_RESIDUALS_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_ASTEROID_RESIDUALS_2026-10-14.md) | Retired: scoped requirements verified |
| [ASTEROID_TIME_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_ASTEROID_TIME_2026-10-14.md) | Retired: scoped requirements verified |
| [CATALOGS_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_CATALOGS_2026-10-14.md) | Retired: scoped requirements verified |
| [CATALOG_MAPPING_2026-10-17](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_CATALOG_MAPPING_2026-10-17.md) | Retired: scoped requirements verified |
| [CATALOG_STARTUP_2026-10-14](REMEDIATION_CATALOG_STARTUP_2026-10-14.md) | Open: startup |
| [CLOSURE_CHECKPOINT_6539902_2026-10-15](REMEDIATION_CLOSURE_CHECKPOINT_6539902_2026-10-15.md) | Open: startup, accessibility-manual, license, solar-full-science, solar-render, deployed-auth-tls, event-capacity, operational-architecture, agn-render |
| [CLOSURE_PLAN_2026-10-15](REMEDIATION_CLOSURE_PLAN_2026-10-15.md) | Open: startup, accessibility-manual, license, solar-full-science, solar-render, deployed-auth-tls, event-capacity, operational-architecture, agn-render |
| [DELIVERY_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_DELIVERY_2026-10-14.md) | Retired: scoped requirements verified |
| [DEPLOYMENT_2026-10-14](REMEDIATION_DEPLOYMENT_2026-10-14.md) | Open: deployed-auth-tls |
| [EFFORT_2026-10-14](REMEDIATION_EFFORT_2026-10-14.md) | Open: startup, accessibility-manual, operational-architecture, deployed-auth-tls, license, solar-full-science, solar-render, agn-render, event-capacity |
| [EPHEMERIS_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_EPHEMERIS_2026-10-14.md) | Retired: scoped requirements verified |
| [EVENTS_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_EVENTS_2026-10-14.md) | Retired: scoped requirements verified |
| [FORMAT_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_FORMAT_2026-10-14.md) | Retired: scoped requirements verified |
| [HARDWARE_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_HARDWARE_2026-10-14.md) | Retired: scoped requirements verified |
| [HORIZONS_TRANSPORT_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_HORIZONS_TRANSPORT_2026-10-14.md) | Retired: scoped requirements verified |
| [INTEGRATION_CHECKPOINT_2026-10-14](REMEDIATION_INTEGRATION_CHECKPOINT_2026-10-14.md) | Open: startup, accessibility-manual, license, solar-full-science, solar-render, deployed-auth-tls, event-capacity, operational-architecture, agn-render |
| [INTEGRATION_CHECKPOINT_A51BEBC_2026-10-14](REMEDIATION_INTEGRATION_CHECKPOINT_A51BEBC_2026-10-14.md) | Open: startup, accessibility-manual, license, solar-full-science, solar-render, deployed-auth-tls, event-capacity, operational-architecture, agn-render |
| [LIFECYCLE_OWNERSHIP_REVIEW_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_LIFECYCLE_OWNERSHIP_REVIEW_2026-10-14.md) | Retired: scoped requirements verified |
| [MISSION_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_MISSION_2026-10-14.md) | Retired: scoped requirements verified |
| [NATIVE_TUDAT_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_NATIVE_TUDAT_2026-10-14.md) | Retired: scoped requirements verified |
| [OPERATIONAL_2026-10-14](REMEDIATION_OPERATIONAL_2026-10-14.md) | Open: operational-architecture, deployed-auth-tls |
| [PLANETS_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_PLANETS_2026-10-14.md) | Retired: scoped requirements verified |
| [PROVENANCE_2026-10-14](REMEDIATION_PROVENANCE_2026-10-14.md) | Open: license |
| [RUNTIME_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_RUNTIME_2026-10-14.md) | Retired: scoped requirements verified |
| [RUNTIME_CLIENT_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_RUNTIME_CLIENT_2026-10-14.md) | Retired: scoped requirements verified |
| [RUNTIME_REVIEW_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_RUNTIME_REVIEW_2026-10-14.md) | Retired: scoped requirements verified |
| [SCN049_BROWSER_ACCEPTANCE_2026-10-17](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/sources/REMEDIATION_SCN049_BROWSER_ACCEPTANCE_2026-10-17.md) | Historical source retained |
| [SCN049_KUIPER_REACTIVATION_2026-10-15](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_SCN049_KUIPER_REACTIVATION_2026-10-15.md) | Retired: scoped requirements verified |
| [SOLAR_2026-10-14](REMEDIATION_SOLAR_2026-10-14.md) | Open: solar-full-science, solar-render |
| [SOLAR_FRAME_REVIEW_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_SOLAR_FRAME_REVIEW_2026-10-14.md) | Retired: scoped requirements verified |
| [SOLAR_SCN041_COMPARISON_2026-10-14](REMEDIATION_SOLAR_SCN041_COMPARISON_2026-10-14.md) | Open: solar-full-science |
| [SOLAR_SCN041_DEGREE90_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_SOLAR_SCN041_DEGREE90_2026-10-14.md) | Retired: scoped requirements verified |
| [SOLAR_SCN042_FRAMES_2026-10-14](REMEDIATION_SOLAR_SCN042_FRAMES_2026-10-14.md) | Open: solar-render |
| [SOLAR_SCN042_PRODUCTION_2026-10-14](REMEDIATION_SOLAR_SCN042_PRODUCTION_2026-10-14.md) | Open: solar-render |
| [SOLAR_SCN049_NUMERICAL_POLICY_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_SOLAR_SCN049_NUMERICAL_POLICY_2026-10-14.md) | Retired: scoped requirements verified |
| [SOLAR_WIND_OVERLAP_2026-10-14](REMEDIATION_SOLAR_WIND_OVERLAP_2026-10-14.md) | Open: solar-full-science |
| [STARTUP_CPU_2026-10-15](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_STARTUP_CPU_2026-10-15.md) | Retired: scoped requirements verified |
| [STARTUP_WARMUP_2026-10-17](REMEDIATION_STARTUP_WARMUP_2026-10-17.md) | Open: startup |
| [TOOLCHAIN_2026-10-14](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_TOOLCHAIN_2026-10-14.md) | Retired: scoped requirements verified |
| [VERIFICATION_CHECKPOINT_4728428_2026-10-14](REMEDIATION_VERIFICATION_CHECKPOINT_4728428_2026-10-14.md) | Open: startup, accessibility-manual, license, solar-full-science, solar-render, deployed-auth-tls, event-capacity, operational-architecture, agn-render |
| [VERIFICATION_CHECKPOINT_4B55DFF_2026-10-14](REMEDIATION_VERIFICATION_CHECKPOINT_4B55DFF_2026-10-14.md) | Open: startup, accessibility-manual, license, solar-full-science, solar-render, deployed-auth-tls, event-capacity, operational-architecture, agn-render |
| [VERIFICATION_CHECKPOINT_4F2E250_2026-10-14](REMEDIATION_VERIFICATION_CHECKPOINT_4F2E250_2026-10-14.md) | Open: startup, accessibility-manual, license, solar-full-science, solar-render, deployed-auth-tls, event-capacity, operational-architecture, agn-render |
| [WAVE3_2026-10-14](REMEDIATION_WAVE3_2026-10-14.md) | Open: startup, accessibility-manual, license, solar-full-science, solar-render, deployed-auth-tls, event-capacity, operational-architecture, agn-render |
