# Consolidated remediation review - 2026-10-29

> **Current status (2026-10-30):** See the [verified remediation status](REMEDIATION_STATUS_2026-10-30.md) for all 83 dispositions, branch-specific fixes, remaining acceptance gates and the 25 completed working-note removals. The dated content below is historical evidence; it does not describe current main.

**Result: the remediation effort is not completely resolved.** All **83 canonical items** and **46 remediation-note filenames** were reconciled against locally available `origin/main@bb29d4be393c9dedca7049fc9b83511ed955be40`, with six independent domain reviewers and fresh central checks. The inventory contains **62 distinct note versions**; alternate versions were compared for conflicting claims. Supporting SCN-specific reviews were included where needed.

**61 scoped code fixes are confirmed; 16 items remain partial and 6 require decisions.** A scoped fix means its original implementation and targeted regression are present at this baseline. It does not certify every adjacent scientific capability, deployment, platform or manual acceptance condition. Seven concrete remaining defects were reproduced despite passing general unit suites. Source and detailed reviewer findings are retained in [the evidence directory](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/README.md).

## Scope and saved work

- Audit branch: `docs/remediation-reconciliation-20261029`; worktree: `/home/nomad/ai/projects/worktrees/solar-remediation-reconciliation-20261029`.
- The normal local `main` checkout is `e9052f9`, one commit ahead and 219 behind this locally available `origin/main`. No fetch, push, merge or deployment was performed. This report does not establish GitHub's current tip or check status.
- Startup work is preserved, uncommitted, on `fix/scn005-final-acceptance-20261028` in `/home/nomad/ai/projects/worktrees/solar-scn005-final-acceptance-20261028`. It has a known `catalog.acceptance` versus `phaseOneCatalog.acceptance` wiring defect and has not passed validation. The saved delivery captures predate that unfinished code change.
- Browser work is preserved, uncommitted, on `fix/scn030-scn031-browser-gate-20261027` in its separate worktree. Its recorded candidate passes are not credited to the audited main baseline.
- Historical notes, original failures, all 83 IDs and the 138-alias ledger are preserved. This review supplies current dispositions; old `FIX_AVAILABLE_UNMERGED` and approval wording describes its original snapshot.
- `Decision` rows retain the outstanding owner/platform contracts requested in the work list. Declaring a behavior in code does not supply the missing owner acceptance. This explains the more conservative coordinator verdicts recorded in [the structured register](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/canonical-register.json).

## Remaining defects reproduced at the baseline

| Item | Observed result and consequence | Existing correction |
|---|---|---|
| SCN-019 | With production 100 kg/day for ten days and loss rate 0.1/day, current end stock is **367.879 kg** versus **632.121 kg** for continuously produced stock. Planner also loads post-return surviving cargo at departure. Mass/loss chronology remains wrong. | `6e26a66`, local only. |
| SCN-075 | Generated leading polarity is opposite the literal hemispheric expectations in all six Cycle 24/25/26 cases. Continuity tests can pass while both solar layers share the wrong absolute sign. | `3fa05a0`, local only; include model/cache identity and independent sign tests. |
| SCN-020 | Thirty infeasible deliveries produce **failureProbability=1**, but returned-cargo p05/p50/p95 are all **1,000 kg**. Successful samples can also report cargo not loaded by reclosure. | `9b7f9fd`, local only. |
| SCN-022 | `solveKepler(0.1, 0.99, 1e-12, 0)` returns pi with residual **3.04159**, without rejecting exhaustion. Source also clamps valid near-unity eccentricity to a different value. | `736c57c` and `137ad15`, local only. |
| SCN-042 | At blend alpha zero, the actual eruption-particle geometry lands on the **target +Y axis**, rather than the source +X axis. `Number(alpha) || 1` loses zero. | No inspected landed repair for this particle path; loop-path repair already landed. |
| SCN-043 | An unchanged valid artifact is admitted, then a mutated Titan endpoint error of **1,000,000,000 km** is also admitted against its **50 km** limit. Aggregate/count consistency has related gaps. | `bf92467` / `f02d63e`, local only. |
| SCN-054 | The production Float32 primary/companion path renders a requested **100,000 km** equal-mass separation as **50,219.012 km**. The companion origin is wrong; reviewed source also applies phase twice. | `f162421`, local only. |

These are direct executions of audited production code, with independent literal/control expectations; no production file was changed. See [backend probes](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/backend-defect-probes.json), [frontend probes](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/frontend-defect-probes.json) and their retained reproduction sources. The absolute Cycle 25 polarity anchor was independently checked against [Moore et al., section 3.1.3, NASA-hosted manuscript](https://ntrs.nasa.gov/api/citations/20250006012/downloads/pivot_250521_submitted.pdf#page=5), which identifies negative-leading northern AR 12929 as opposite the usual Cycle 25 sign.

Additional source-confirmed residuals are recorded in the domain reviews: native-zoom drawer modality and camera-feedback latency; non-root-base catalog URLs; missing quadtree-owner disposal; scalar-JD leap identity; and pending lazy-moon vector-oracle checks/body cancellation. The lazy loader is local preparation and is not a shipped main fetch path. README still advertises 1.9M particles and FNV-1a fallback, and has three broken source links. The shipped catalog path selects 50,000 of 100,000 source rows and uses SHA-256 only.

## Fresh verification

| Lane | Actual result | Scope/evidence |
|---|---|---|
| Backend plus CI-contract tests | **4,057 passed; 13 skipped; 0 failed** | Python 3.12.13; 184.08 s; [log](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/backend.log), [JUnit](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/backend-junit.xml). Twelve skips require Tudat; one requires SpiceyPy. |
| Generator/maintenance/native Daphnis checks | **91 passed; 9 subtests passed** | Augmented environment with Python Playwright 1.64.1 and SpiceyPy 8.3.0; [log](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/maintenance-native.log). The first pinned-only attempt failed collection for missing Python Playwright and is [retained](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/maintenance.log). |
| Frontend unit/integration | **881 passed; 413 skipped; 0 failed** | Node 22.23.2/npm 10.9.8; [structured result](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/frontend-results.json). Skips: 411 unpromoted moons and two opt-in GPU cases. |
| Strict source and UI types; production build | **Passed** | No relaxed source compiler settings; >500 kB bundle warning retained. [Build](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/build.log), [verification](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/verification.json). |
| Scientific baselines/mutations | **6/6 baselines; 6/6 mutants killed** | Exact pinned manifest on detached baseline; [summary](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/science-summary.json). |
| Chromium software WebGL | **41 passed; 2 failed; 1 skipped** | 418.68 s; [failures](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/browser-failures.json), [full result](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/browser-chromium.json). Both failures time out waiting for pending-shader completion reads at startup-warmup.spec.ts:59/83. Actual-app recovery tests pass. |
| Asteroid transform-feedback GPU gate | **125 cases passed** | Actual WebGL2 shader execution; [result](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/asteroid-gpu.log). Does not imply hardware performance. |
| Optional planet shader gate | **2 passed; 0 skipped** | Separate opt-in software-GPU run closes those two default-suite skips for this lane; [result](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/planet-gpu-results.json). |
| Pinned install/advisories | **Passed; zero advisories reported** | [Install log](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/npm-ci.log); current registry assessment only. |
| Archived evidence integrity | **164/164 scan files match; 4/4 report hashes match original archival commit** | [Scan/current hashes](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/archive-verification.json), [pinned report hashes](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/archive-historical-verification.json). Two maintained documents evolved after the dated report manifest; this is expected history, not archive corruption. |

Do not add overlapping counts as distinct coverage. The dedicated SpiceyPy run does not rewrite the earlier default-suite skip. Real Tudat was unavailable, and its older version-bounded passes remain dated. Fresh Firefox/WebKit, human assistive-device, deployed TLS/auth and broad rendered/scientific acceptance were not supplied by these runs. Main's browser workflow still has `continue-on-error: true`; its green required jobs cannot establish browser acceptance.

October 28 delivery evidence remains separately scoped: DEV with a cold backend passed 11/11 physics and 3/3 realtime; the first cold PREVIEW ended unexpectedly around 220 s with an unknown browser-closure cause. A controlled PREVIEW retry passed the same counts with an already-warm backend. That retry does not complete cold-PREVIEW acceptance, and the first RAF used by the harness does not certify a complete presented scene.

## Condensed canonical register

| ID | Current verdict | Correction and remaining boundary | Evidence |
|---|---|---|---|
| SCN-001 | Scoped fix | PFSS recurrence/Schmidt normalization repaired; independent harmonic and mutation gates pass. | [code](../backend/sim/spherical_harmonics.py#L17) |
| SCN-002 | Scoped fix | Bounded Astropy FITS parsing handles byte order, scaling and finite pixels correctly. | [code](../backend/sim/gong_magnetogram.py#L721) |
| SCN-003 | Scoped fix | Explicit sine-latitude grid, row order, longitude and cell-area weighting repaired. | [code](../backend/sim/magnetogram_grid.py#L24) |
| SCN-004 | Partial | Owned solar HTTP child has deadlines and kill/reap cleanup. POSIX passes; supported-platform declaration/certification remains. | [code](../backend/sim/solar_http_transport.py#L29) |
| SCN-005 | Partial | Catalog timing improved; duplicate startup construction remains. Cold PREVIEW aborted; warm retry passed. Complete-scene acceptance remains. | [code](../src/sim/phase1AsteroidCatalog.ts#L741) |
| SCN-006 | Scoped fix | Localhost and loopback dev/preview CORS origins admitted under exact-origin policy. | [code](../backend/server.py#L454) |
| SCN-007 | Scoped fix | Trusted-proxy identity handling and bounded TTL/LRU admission stores prevent spoofed-header memory amplification. | [code](../backend/server.py#L1661) |
| SCN-008 | Scoped fix | Solar physics rejects nonfinite and unsupported epochs before provider/compute work. | [code](../backend/server.py#L922) |
| SCN-009 | Scoped fix | Unvalidated observational forcing fails closed; hybrid uses explicitly labeled synthetic forcing. | [code](../backend/sim/solar_physics.py#L351) |
| SCN-010 | Scoped fix | Failed refreshes back off briefly; bounded last-good data retain true age and independent health status. | [code](../backend/sim/solar_realtime_data.py#L214) |
| SCN-011 | Scoped fix | AIA dates are canonical UTC timestamps; coverage and wall-clock freshness remain separate. | [code](../backend/sim/solar_realtime_data.py#L2514) |
| SCN-012 | Scoped fix | Independent fixed-state benchmark references replace false perfect-zero metrics. This is not live-provider calibration. | [code](../backend/benchmark/accuracy.py#L301) |
| SCN-013 | Scoped fix | Asteroid phases use CPU-double rebasing and small relative shader time; obsolete fake perturbations are inert. | [code](../src/frontend/features/asteroids/beltRenderer.ts#L62) |
| SCN-014 | Scoped fix | Format checks use encoding-derived quantization bounds, circular angles, finite values and exact identities. | [code](../src/data/asteroidCatalogLoader.ts#L57) |
| SCN-015 | Decision | Largest-known-diameter prefix is disclosed as nonrepresentative. Recorded owner acceptance or representative replacement remains. | [code](../scripts/build_asteroid_phase1_dataset.py#L81) |
| SCN-016 | Scoped fix | Runtime Earth subtracts the Moon mass fraction from EMB position and velocity. | [code](../src/data/planets.ts#L84) |
| SCN-017 | Scoped fix | Secular velocity differentiates changing elements and basis rotations consistently. | [code](../src/sim/orbitMath.ts#L219) |
| SCN-018 | Scoped fix | Pluto secular model and sampled independent state gates retained; approximate barycenter/model limits remain explicit. | [code](../src/data/planets.ts#L205) |
| SCN-019 | Partial | Cargo enters return burns, but storage/production chronology underloads departure mass. Separate departure and arrival stock is needed. | [code](../backend/mission/vehicle_service.py#L66) |
| SCN-020 | Partial | Reserve/discarded-fuel accounting repaired. Risk still reports positive returned cargo for failed or unloaded delivery scenarios. | [code](../backend/mission/vehicle_service.py#L86) |
| SCN-021 | Scoped fix | SMBH Schwarzschild, ISCO and photon-radius arithmetic uses consistent units. | [code](../src/frontend/features/superluminal-modeling/smbhPhysicsConstants.ts#L54) |
| SCN-022 | Partial | Fast Kepler helper improved. General solver still clamps valid eccentricity and can return uncertified iterates. | [code](../src/sim/orbitMath.ts#L181) |
| SCN-023 | Scoped fix | Metric display offsets modify scene nodes without mutating canonical worker/model state. | [code](../src/sim/solarSystemModel.ts#L169) |
| SCN-024 | Scoped fix | Identical-JD Kuiper updates skip propagation and redundant renderer buffer uploads. | [code](../src/frontend/features/asteroids/kuiperBeltUpdater.ts#L13) |
| SCN-025 | Scoped fix | Complete strict source typecheck passes with zero diagnostics; strict CI gate retained. | [code](../tsconfig.json#L9) |
| SCN-026 | Scoped fix | Vitest collects product/script tests and excludes copied audit suites. | [code](../vitest.config.ts#L9) |
| SCN-027 | Scoped fix | README documents the full pinned backend test environment, including httpx; fresh documented backend lane passes. | [code](../README.md#L486) |
| SCN-028 | Scoped fix | Pinned install succeeds; its current advisory audit reports zero vulnerabilities. Future advisories remain time-dependent. | [code](../package.json#L7) |
| SCN-029 | Scoped fix | Backend/scientific CI and fail-closed verifier are tracked and passing. Browser enforcement remains SCN-047. | [code](../.github/workflows/r3-r4-science.yml#L9) |
| SCN-030 | Partial | Accessibility implementation landed; native-zoom/camera improvements remain local. Manual screen-reader, resize and touch acceptance remains. | [code](../src/frontend/app/panelController.ts#L19) |
| SCN-031 | Scoped fix | No-WebGL/context-loss recovery stops owned work and offers accessible reload. Actual-app checks pass; two warmup fixtures fail separately. | [code](../src/frontend/app/rendererRecovery.ts#L5) |
| SCN-032 | Partial | API-only and moon scope are documented, but particle counts, checksum claims and three source links remain wrong. | [code](../README.md#L8) |
| SCN-033 | Scoped fix | Moon maintenance validates shape/count/orbits, requires count-change admission and publishes through atomic rename. | [code](../scripts/update-moons-data.mjs#L130) |
| SCN-034 | Scoped fix | Pinned offline source acquisition and transactional publication repaired. Additional explicit-write/default-preview hardening is local only. | [code](../scripts/catalog_sources.py#L30) |
| SCN-035 | Decision | NOTICE records attribution. Code license, SILSO disposition, Deimos permission/replacement and distribution inventory remain undecided. | [code](../NOTICE.md#L1) |
| SCN-036 | Scoped fix | Network authentication precedes bounded per-subject/global WebSocket admission. Deployed fairness/TLS remain separate. | [code](../backend/server.py#L513) |
| SCN-037 | Decision | Fixed-step semantics and telemetry implemented/tested. Recorded product acceptance of that timing contract remains absent. | [code](../backend/server.py#L4382) |
| SCN-038 | Decision | Scientific JD and decorative clocks are separated; pause/reverse/reduced-motion behavior works. Recorded policy acceptance remains absent. | [code](../src/sunController.ts#L257) |
| SCN-039 | Decision | Consumed backend-origin/viewport/render-scale configuration works. Recorded deployment/product contract acceptance remains absent. | [code](../src/frontend/app/runtimeConfig.ts#L6) |
| SCN-040 | Partial | 164 scan artifacts verify; four report hashes verify at their archival commit. Older September/H1 raw archival remains separate. | [code](../agent-notes/SCAN_EVIDENCE_ARCHIVE_2026-10-17.json#L1) |
| SCN-041 | Partial | Numerical PFSS and mutation repairs pass. Real-map admission fix is local; observed frames, wind speed and 1-AU calibration remain. | [code](../backend/sim/pfss_evaluation.py#L14) |
| SCN-042 | Partial | Solar frames/shader/diagnostic repairs landed. Eruption particles still treat blend alpha zero as one; broader rendered acceptance remains. | [code](../src/frontend/features/solar/solarFrame.ts#L35) |
| SCN-043 | Partial | Only 13/424 fitted records ship. Main certificate defect reproduced; lazy validation/cancellation and publication remain incomplete. | [code](../src/sim/loadMoonEphemerides.ts#L4) |
| SCN-044 | Scoped fix | Bounded MGA search has independent two-assist quality witness and physical flyby checks; no global-optimum claim. | [code](../backend/trajectory/mga.py#L134) |
| SCN-045 | Scoped fix | Independent near-zero/near-pi, hyperbolic and multi-revolution Lambert checks retained; exact collinearity requires an explicit plane. | [code](../backend/trajectory/lambert.py#L620) |
| SCN-046 | Scoped fix | Pinned new release reproduces offline; source/serialization checks pass. Historical unpinned artifacts were replaced. | [code](../scripts/source-snapshots/catalogs/README.md#L3) |
| SCN-047 | Partial | Unit/type/build/science lanes pass; Chromium has two fixture failures. Startup/moons/manual/deployed/scientific release gates remain. | [code](../.github/workflows/frontend-ui.yml#L29) |
| SCN-048 | Partial | Temporal coverage/cache/network safeguards landed. Scalar-JD leap ambiguity and actual deployed TLS/auth/provider calibration remain. | [code](../backend/sim/solar_time.py#L153) |
| SCN-049 | Partial | Socket/frame/activation repairs landed. Browser subscription evidence is local; legacy ambiguity and quadtree cleanup remain. | [code](../src/frontend/app/frameLifecycle.ts#L36) |
| SCN-050 | Scoped fix | Hathaway curve uses its parameterized analytic peak; shared independent fixture rejects the clipped plateau. | [code](../backend/sim/solar_physics.py#L144) |
| SCN-051 | Scoped fix | FITS admission authenticates retained native bytes and reparses them; no lossy inverse reconstruction. | [code](../backend/sim/gong_magnetogram.py#L245) |
| SCN-052 | Scoped fix | Stage reserves use immutable initial propellant, preserving burn-partition invariance. | [code](../backend/mission/vehicle_service.py#L86) |
| SCN-053 | Scoped fix | REBOUND stepping validates the same finite supported epoch bounds as seeking. | [code](../backend/sim/rebound_nbody.py#L122) |
| SCN-054 | Partial | Backend binary initialization repaired. Frontend companion origin/phase remains wrong; initial conditions do not model sustained mutual gravity. | [code](../backend/sim/kuiper.py#L128) |
| SCN-055 | Scoped fix | Tudat energy uses a common SSB origin and force-model GMs. Native evidence is dated; harmonic potential is excluded. | [code](../backend/sim/tudatpy_hooks.py#L553) |
| SCN-056 | Scoped fix | Single-family EPO runs register family policy through the common execution path. | [code](../backend/mission/epo/runners.py#L71) |
| SCN-057 | Scoped fix | Force callbacks dereference REBOUND pointers and use caller-owned beta mappings; dormant callbacks remain dormant. | [code](../backend/sim/radiation_pressure.py#L178) |
| SCN-058 | Scoped fix | Quadtree split/merge restores bounded Earth/Mars face coverage; unload-owner cleanup is separately open under SCN-049. | [code](../src/frontend/features/planetary/quadtreeLOD.ts#L60) |
| SCN-059 | Scoped fix | Scale changes update quadtree radius/relief/LOD and camera clearance consistently. | [code](../src/frontend/features/planetary/quadtreeLOD.ts#L262) |
| SCN-060 | Scoped fix | Mean-sphere picking proxies preserve body identity through LOD and scale changes. | [code](../src/frontend/features/planetary/quadtreeLOD.ts#L203) |
| SCN-061 | Scoped fix | Face placement precedes spherical projection; pole-safe normals and skirts pass CPU and opt-in software-GPU checks. | [code](../src/frontend/features/planetary/quadtreeLOD.ts#L136) |
| SCN-062 | Scoped fix | Flare/CME lifetimes stay positive at enlarged display scale; capacity acceptance remains a separate child. | [code](../src/frontend/features/solar/solarFlares.ts#L232) |
| SCN-063 | Decision | Horizons deadline-owned child recovers capacity after kill/reap. POSIX works; platform/support disposition remains. | [code](../backend/mission/ephemeris_service.py#L139) |
| SCN-064 | Scoped fix | Stable atan2 transfer angles and near-collinear velocity recovery pass independent endpoint gates. | [code](../backend/trajectory/lambert.py#L519) |
| SCN-065 | Scoped fix | Background AGN stochastic windows advance without a foreground event and preserve elapsed-window state. | [code](../src/sunController.ts#L729) |
| SCN-066 | Scoped fix | One resolver/controller owns source, preset, model and labels; ineffective observer UI removed. | [code](../src/frontend/features/superluminal-modeling/agnShockwaveEngine.ts#L65) |
| SCN-067 | Scoped fix | AGN grids begin hidden and reset/detach correctly; historical hardware evidence remains dated. | [code](../src/frontend/features/solar/gravitationalWaves.ts#L187) |
| SCN-068 | Scoped fix | Default SMBH propagation explicitly resolves SGR_A mass; direct two-argument regression retained. | [code](../src/frontend/features/superluminal-modeling/smbhPropagation.ts#L17) |
| SCN-069 | Scoped fix | Cited fixed-J2000 source directions and consistent apparent/intrinsic jet assumptions replace mismatched values. | [code](../src/frontend/features/superluminal-modeling/sourceCoordinates.ts#L1) |
| SCN-070 | Scoped fix | Read-only failures recover; mutating-seek failures latch fatal state; stale telemetry is cleared. | [code](../backend/server.py#L4498) |
| SCN-071 | Scoped fix | Cancellation/handshake/queue ownership repaired. Unkillable native threads still lack a hard termination guarantee. | [code](../backend/server.py#L4412) |
| SCN-072 | Scoped fix | Direct, derived and dwell planning epochs enforce the inclusive 1990-2050 TDB interval. | [code](../backend/trajectory/contracts.py#L17) |
| SCN-073 | Scoped fix | Every HTTPS/exact-host redirect is charged under one deadline; automatic redirects are disabled. | [code](../backend/sim/solar_http_transport.py#L137) |
| SCN-074 | Scoped fix | Thirteen explicit-epoch fallback bodies initialize at their own epochs; sampled approximate-quality metadata survives serialization. | [code](../backend/sim/rebound_nbody.py#L354) |
| SCN-075 | Partial | Persistent shared regions repair continuity, but absolute Hale polarity is reversed in six reproduced hemisphere/cycle cases. Fix remains local. | [code](../backend/sim/solar_active_regions.py#L17) |
| SCN-076 | Scoped fix | Poynting-Robertson drag restores the inward radial component; this does not activate its dormant callback. | [code](../backend/sim/radiation_pressure.py#L102) |
| SCN-077 | Scoped fix | Tudat chunks retain integrated boundaries and correct TDB metadata. Real native acceptance remains version/date bounded. | [code](../backend/sim/tudatpy_hooks.py#L76) |
| SCN-078 | Scoped fix | Four chronological circular parking/capture burns enter mass closure; cargo loads before target departure. | [code](../backend/mission/propulsion.py#L18) |
| SCN-079 | Scoped fix | EPO verifier reads nested verification and fails honestly. Default infeasible campaign is not relabeled successful. | [code](../backend/mission/epo/verifier.py#L30) |
| SCN-080 | Scoped fix | Shared secular coefficients and complete velocity derivatives have independent sampled state gates; approximate scope retained. | [code](../backend/data/secular_planets.py#L5) |
| SCN-081 | Scoped fix | Generic nodal precession uses native inclination sign; measured overrides remain preserved. | [code](../src/sim/catalog.ts#L505) |
| SCN-082 | Scoped fix | Catalog retains source periods/diameters/albedo and unknown taxonomy; integrity is distinguished from physical fidelity. | [code](../scripts/fetch_jpl_sbdb.py#L38) |
| SCN-083 | Scoped fix | Cited IAU fixed-J2000 poles and signed spin rates apply direction once; no true-of-date PCK claim. | [code](../src/data/planetaryRotation.ts#L28) |

## Named verification children and next work

The original twelve Section 7 children remain represented; none disappears under an umbrella pass.

| Child | Current disposition |
|---|---|
| Dione/Rhea historical offsets | SCN-043 remains incomplete; unpromoted candidate states are not shipped validation. |
| Lambert near-zero/root exit | SCN-045 independent endpoint/velocity suite is retained and exercised in the backend lane. Exact collinearity remains declared capability scope. |
| AGN grid/solar color, granulation and limb | Coordinate/loop repairs landed; eruption zero-alpha bug and broader camera/epoch/layer visual acceptance remain SCN-042/049. |
| Realtime schema/reconnect | Protocol/library repairs landed. Client remains API/library-only; no default-UI N-body claim. Stronger branch browser fixture replays captured **REBOUND/WHFast**, not Tudat, data. |
| Startup texture and event capacity | Full-scene startup and sustained event-capacity acceptance remain; loader latency/lifetime checks are narrower. |
| Report writer Host/NUL/trusted loopback | Operational contracts pass; actual protected deployment/TLS remains SCN-048/049. |
| Logging/composition/error/shared executor | Bounded runtime fixes pass; broad operational acceptance and permanently hung native ownership remain scoped limits. |
| Task exceptions/optional Tudat epochs | Cooperative recovery contracts pass; no current real-Tudat run. Preserve historical native evidence and current skips. |
| Real GONG/provider truth | Numerical repair passes; real-map admission correction remains local and empirical application/frame/wind calibration remains open. |
| Nonfinite solar helpers | Explicit finite-input rejection/saturation policy landed and is exercised by the backend suite. |
| Asteroid perturbation/cache/timeout | Fake perturbation disabled; precision, loader ownership and offline checks retained. Non-root asset URL and startup work remain. |
| Frame isolation/hidden tab/disposal/orphan assets | Frame ownership and hidden-delta repair landed; quadtree unload cleanup, licensing/orphan disposition and final browser acceptance remain. |

Repair priority: reconcile the existing local cargo/risk/Kepler/binary/Hale/certificate corrections onto a reviewed current-main branch, preserving their independent tests; correct the uncovered eruption-particle alpha and quadtree cleanup paths; finish startup and blocking browser gates; then close moon publication, scientific calibration and applicable owner/manual/deployment requirements. The approximately **396.3 MB** pending moon footprint is **336.0 MB source pins plus 60.3 MB published assets**, not source-only data or a single browser download.

## Source-note index

Every pre-review `REMEDIATION_*.md` filename found across the registered local worktrees is listed below. The [inventory](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/source-inventory.json) records all 62 content hashes and original locations before this review's pointer additions. The one browser-acceptance note absent from audited main is retained as an explicitly historical branch-only source copy. All other listed notes were already present in the audited tree. Detailed source/test/branch citations are in the seven [domain review files](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/README.md).

| Remediation note | Reviewer domain | Inventoried versions |
|---|---|---:|
| [75052 REFERENCE](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_75052_REFERENCE_2026-10-14.md) | frontend | 1 |
| [ACCESSIBILITY](REMEDIATION_ACCESSIBILITY_2026-10-14.md) | frontend | 2 |
| [AIA EPOCH COVERAGE](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_AIA_EPOCH_COVERAGE_2026-10-14.md) | solar | 1 |
| [ASTEROID RESIDUALS](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_ASTEROID_RESIDUALS_2026-10-14.md) | catalogs | 1 |
| [ASTEROID TIME](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_ASTEROID_TIME_2026-10-14.md) | catalogs | 1 |
| [CATALOG MAPPING](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_CATALOG_MAPPING_2026-10-17.md) | catalogs | 1 |
| [CATALOG STARTUP](REMEDIATION_CATALOG_STARTUP_2026-10-14.md) | catalogs | 1 |
| [CATALOGS](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_CATALOGS_2026-10-14.md) | catalogs | 1 |
| [CLOSURE CHECKPOINT 6539902](REMEDIATION_CLOSURE_CHECKPOINT_6539902_2026-10-15.md) | global | 3 |
| [CLOSURE PLAN](REMEDIATION_CLOSURE_PLAN_2026-10-15.md) | global | 3 |
| [DELIVERY](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_DELIVERY_2026-10-14.md) | catalogs | 1 |
| [DEPLOYMENT](REMEDIATION_DEPLOYMENT_2026-10-14.md) | runtime | 1 |
| [EFFORT](REMEDIATION_EFFORT_2026-10-14.md) | global | 3 |
| [EPHEMERIS](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_EPHEMERIS_2026-10-14.md) | mission | 2 |
| [EVENTS](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_EVENTS_2026-10-14.md) | frontend | 4 |
| [FORMAT](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_FORMAT_2026-10-14.md) | catalogs | 1 |
| [HARDWARE](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_HARDWARE_2026-10-14.md) | frontend | 1 |
| [HORIZONS TRANSPORT](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_HORIZONS_TRANSPORT_2026-10-14.md) | runtime | 1 |
| [INTEGRATION CHECKPOINT](REMEDIATION_INTEGRATION_CHECKPOINT_2026-10-14.md) | global | 1 |
| [INTEGRATION CHECKPOINT A51BEBC](REMEDIATION_INTEGRATION_CHECKPOINT_A51BEBC_2026-10-14.md) | global | 1 |
| [LIFECYCLE OWNERSHIP REVIEW](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_LIFECYCLE_OWNERSHIP_REVIEW_2026-10-14.md) | runtime | 1 |
| [MISSION](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_MISSION_2026-10-14.md) | mission | 2 |
| [NATIVE TUDAT](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_NATIVE_TUDAT_2026-10-14.md) | mission | 2 |
| [OPERATIONAL](REMEDIATION_OPERATIONAL_2026-10-14.md) | mission | 1 |
| [PLANETS](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_PLANETS_2026-10-14.md) | frontend | 1 |
| [PROVENANCE](REMEDIATION_PROVENANCE_2026-10-14.md) | global | 1 |
| [RUNTIME](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_RUNTIME_2026-10-14.md) | runtime | 1 |
| [RUNTIME CLIENT](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_RUNTIME_CLIENT_2026-10-14.md) | runtime | 1 |
| [RUNTIME REVIEW](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_RUNTIME_REVIEW_2026-10-14.md) | runtime | 1 |
| [SCN049 BROWSER ACCEPTANCE](REMEDIATION_REVIEW_2026-10-29_EVIDENCE/sources/REMEDIATION_SCN049_BROWSER_ACCEPTANCE_2026-10-17.md) | frontend | 2 |
| [SCN049 KUIPER REACTIVATION](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_SCN049_KUIPER_REACTIVATION_2026-10-15.md) | frontend | 1 |
| [SOLAR](REMEDIATION_SOLAR_2026-10-14.md) | solar | 1 |
| [SOLAR FRAME REVIEW](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_SOLAR_FRAME_REVIEW_2026-10-14.md) | solar | 2 |
| [SOLAR SCN041 COMPARISON](REMEDIATION_SOLAR_SCN041_COMPARISON_2026-10-14.md) | solar | 1 |
| [SOLAR SCN041 DEGREE90](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_SOLAR_SCN041_DEGREE90_2026-10-14.md) | solar | 1 |
| [SOLAR SCN042 FRAMES](REMEDIATION_SOLAR_SCN042_FRAMES_2026-10-14.md) | solar | 1 |
| [SOLAR SCN042 PRODUCTION](REMEDIATION_SOLAR_SCN042_PRODUCTION_2026-10-14.md) | solar | 1 |
| [SOLAR SCN049 NUMERICAL POLICY](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_SOLAR_SCN049_NUMERICAL_POLICY_2026-10-14.md) | frontend | 1 |
| [SOLAR WIND OVERLAP](REMEDIATION_SOLAR_WIND_OVERLAP_2026-10-14.md) | solar | 1 |
| [STARTUP CPU](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_STARTUP_CPU_2026-10-15.md) | catalogs | 1 |
| [STARTUP WARMUP](REMEDIATION_STARTUP_WARMUP_2026-10-17.md) | catalogs | 2 |
| [TOOLCHAIN](https://github.com/vkorotkikh/solar-system-realistic-sim/blob/bb29d4be393c9dedca7049fc9b83511ed955be40/agent-notes/REMEDIATION_TOOLCHAIN_2026-10-14.md) | global | 1 |
| [VERIFICATION CHECKPOINT 4728428](REMEDIATION_VERIFICATION_CHECKPOINT_4728428_2026-10-14.md) | global | 1 |
| [VERIFICATION CHECKPOINT 4B55DFF](REMEDIATION_VERIFICATION_CHECKPOINT_4B55DFF_2026-10-14.md) | global | 1 |
| [VERIFICATION CHECKPOINT 4F2E250](REMEDIATION_VERIFICATION_CHECKPOINT_4F2E250_2026-10-14.md) | global | 1 |
| [WAVE3](REMEDIATION_WAVE3_2026-10-14.md) | global | 1 |

The archived intake/checkpoint tables retain their original dates and failures. Their old unmerged and approval states are superseded only where actual ancestry, patch equivalence and present source were checked. In particular, the October 17 rendering patches are landed equivalents, the 164-file archive is landed, the all-424 moon data remain local, and the newer markdown-audit fixes are still unlanded. Source hashes authenticate identity; they do not prove physical correctness, empirical calibration or distribution rights.
