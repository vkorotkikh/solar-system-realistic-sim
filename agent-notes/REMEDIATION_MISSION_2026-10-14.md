# Mission remediation, 2026-10-14

Assigned worktree: `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-mission`.
No subagents, pushes, merges, root-main edits, or master-tracker edits.

## Priority fixes

| Issue | Status | Evidence and limits |
|---|---|---|
| SCN-012 | FIXED for reproducible nonzero Lambert coverage | Three legacy date pairs now have archived actual JPL Horizons endpoint states and independent lamberthub 1.0.0 Izzo/Gooding answers. 3/3 comparable and passing. Historical GMAT/Orekit/Tudat totals remain explicitly incomparable in `legacyCalibration`; their execution was not reproduced. This validates the fixed-state Lambert solver, not live Kepler/SPICE accuracy. |
| SCN-020 | FIXED | Margin includes only usable propellant on attached stages, excluding protected reserves. Onboard, protected and discarded fuel are separately reported. Exhausted risk samples report zero usable margin. |
| SCN-078 | FIXED within declared ideal patched-conic model | Four chronological impulsive burns: departure, target capture, target departure, return capture. Cargo loads before burn 2 (zero-based), after target capture. Circular parking altitude defaults to 200 km and is declared in schema/capabilities/results. No surface operations, plane changes, finite thrust or aerocapture claim. |
| SCN-044 | VERIFIED for bounded-search contract | Added a dated Earth-Jupiter-Venus-Mars two-assist witness closed independently using Izzo + scipy.brentq, checked with Gooding and DOP853. Production must retain a route meeting this independent score floor, continuity and physical periapsis floors. Budget-exhausted real search must report inconclusive. This is a feasible quality floor, not global optimality or exhaustive real-window coverage. |
| SCN-045 | VERIFIED with explicit plane policy | Exact collinearity/180 degrees is rejected because no plane normal is specified. Policy documented in API capabilities and solver docstring; tested on four axes and both senses. Independent DOP853 verifies rotated near-zero/near-pi/hyperbolic cases and both branches/senses for 1-3 revolutions. Integrated SCN-064 preserved. |
| SCN-063 | OPEN: no owner acceptance of permanent capacity loss | The original implementation retains the sole permit while a worker lives. Its bounded-ownership regressions pass, but the owner did not approve permanent remote-capacity loss. A separate follow-up implements terminable transport while preserving redirect and budget rules. |
| SCN-072 | FIXED | One inclusive planning interval [2447892.5, 2469807.5] JDTDB (1990-2050), matching existing simulation operating bounds. Core and HTTP validators reject departure, arrival, derived grid and mission dwell epochs with structured 422 `trajectory_epoch_out_of_range`. Search-generated out-of-range arrivals inherit the same rejection type. All server hunks remain above websocket/runtime code. |
| SCN-073 | FIXED | Default redirects disabled; initial URL and up to three explicit hops validated for HTTPS + exact host + port 443/omitted; credentials/fragments rejected. Every hop charged and deadline-owned. Actual urllib handler tests reproduce and reject cross-host/downgrade/bad-port/userinfo redirects; relative redirects, loops and budget exhaustion tested. |
| SCN-079 | FIXED | Verifier reads recommendation.verification, samples use supported min_distance, empty/failed/exception runs exit 1. Real known passing and failing episodes gate nesting/runner behavior. Unsupported physical-body requests are failed episodes, not runtime exceptions. The default vehicle's actual infeasible demo missions remain failures. |

## Focused test results

All pytest invocations use this prefix:

```sh
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt python -m pytest -q
```

- Baseline benchmark: `scenarioCount=3`, `comparableScenarioCount=0`, `validationCoverage=0.0`.
- New window regressions initially failed 2/2; after repair, window plus existing benchmark tests passed 11/11.
- New propulsion/margin regressions initially failed 6/6. A mistaken literal in a new Earth example was removed in favor of its independent energy invariant; incomplete old orchestration fixtures were updated with endpoint burn fields.
- Focused priority gate: `backend/tests/test_mission_window_references.py backend/tests/test_benchmark_accuracy.py backend/tests/test_mission_propulsion_contract.py backend/tests/test_mission_agents.py backend/tests/test_mission_mass_flow.py backend/tests/test_mission_reserve_partition.py backend/tests/test_mission_schemas.py --tb=short`: **52 passed in 0.37s**.
- Deliberate 10 m/s departure-velocity mutation fails all three independent window comparisons even without changing reported total delta-v.
- DOP853 integration independently checks both returned endpoint states. Reference generation also requires independent Izzo/Gooding agreement below 1e-8 km/s and DOP853 arrival miss below 0.1 km.
- Epoch/EPO regressions initially failed 26/26; redirect regressions initially failed 6/6 through the actual urllib handler, including uncharged second requests.
- Transport/epoch/EPO/entry/mission intermediate gate: **157 passed, 2 warnings in 1.33s**.
- First comprehensive scoped gate: **438 passed, 2 warnings in 3.08s**. No full-backend sweep was run.
- Final supplemental MGA/mission/EPO/Lambert gate: **66 passed in 1.01s**.
- The two warnings are pre-existing Starlette TestClient httpx and AnyIO BlockingPortal deprecations.
- A new near-zero retrograde Cartesian integration probe hit the central singularity. The physical regression now checks that this Sun-intersecting arc is rejected under the default solar-radius policy; no singular numerical integration is claimed to pass.
- Missing Flora mass surfaced as a TypeError during the actual smoke run. The mission now rejects missing/invalid mass or radius with `mission_propulsion_body_unsupported` rather than inventing mu. A dedicated regression covers this.
- Actual `--family mining_core --compact`: **10 total, 0 passed, 10 failed, 0 exceptions, exit 1**. Nine infeasible recommendations and one unsupported Flora mass are retained as failures, not relabeled successes.

Final scoped gate: **444 passed, 2 warnings in 3.87s**, exit 0. Exact command:

```sh
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt python -m pytest -q backend/tests/test_benchmark_accuracy.py backend/tests/test_benchmark_report_overwrite.py backend/tests/test_benchmark_endpoint_budget.py backend/tests/test_mission_window_references.py backend/tests/test_mission_propulsion_contract.py backend/tests/test_mission_mass_flow.py backend/tests/test_mission_reserve_partition.py backend/tests/test_mission_agents.py backend/tests/test_mission_schemas.py backend/tests/test_trajectory_regression.py backend/tests/test_trajectory_endpoint_budget.py backend/tests/test_trajectory_entry_validation.py backend/tests/test_trajectory_contracts.py backend/tests/test_lambert_solver_reference.py backend/tests/test_lambert_near_antiparallel.py backend/tests/test_lambert_independent_boundaries.py backend/tests/test_lambert_state_contract.py backend/tests/test_porkchop_core_bounds.py backend/tests/test_mga_bounded_search.py backend/tests/test_mga_acceptance_quality.py backend/tests/test_mga_flyby_physics.py backend/tests/test_mga_independent_window.py backend/tests/test_ephemeris_service_safety.py backend/tests/test_horizons_redirect_contract.py backend/tests/test_planning_epoch_contract.py backend/tests/test_epo_smoke_contract.py backend/tests/test_epo_single_family_policy.py --tb=short
```

Actual EPO smoke command (failure exit is required for infeasible episodes):

Result: **30 total, 0 passed, 30 failed, 0 exceptions, exit 1**. Each family has
10 failures. Unsupported physical-body data accounts for 1 mining_core,
1 outer_reacher and 9 return_pressure rejections; the other 19 episodes have no
verified feasible recommendation. The separate known-pass/known-fail real
planner gate passes, proving the verifier is not permanently failing all input.

```sh
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC PYTHONPATH=backend uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt python -m mission.epo.smoke_test --compact
```

`git diff --check` passed before the final documentation update. Full backend and frontend integration gates are left to the controller as assigned.

## Fixed files (priority commit)

`backend/benchmark/accuracy.py`, `backend/benchmark/reference_scenarios.json`, nine new JSON artifacts under `backend/benchmark/artifacts/`, `scripts/generate_mission_window_references.py`, `backend/mission/{agents,schemas,vehicle_service,propulsion}.py`, `backend/trajectory/mga.py` (metric label only), small `backend/server.py` schema/capability hunks, and focused benchmark/mission tests.

Priority commit: `56ac52a` (`fix(mission): independently benchmark legacy windows and close parking burns`).

Remaining scoped files: `backend/trajectory/{contracts,lambert}.py`, `backend/mission/ephemeris_service.py`, `backend/mission/epo/{verifier,sample_episodes,smoke_test,runners}.py`, `backend/mission/HORIZONS_TRANSPORT.md`, `backend/benchmark/CALIBRATION_PROTOCOL.md`, mission/propulsion validation, small server validation/capability hunks, `scripts/generate_mga_reference.py`, its independent witness fixture and focused tests. Existing test mocks now intercept the dedicated no-auto-redirect opener; their original cancellation/permit assertions remain.

## Reference reproduction and provenance

```sh
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12 --with lamberthub==1.0.0 --with numpy==2.2.6 --with scipy==1.15.3 --with numba==0.61.2 --with llvmlite==0.44.0 python scripts/generate_mission_window_references.py
```

Default reproduction uses the six archived raw provider responses. Initial capture used the same command with `--capture`. Each independent artifact records exact requests, target/center, epochs, frames, units, geometric corrections, SHA-256 hashes, versions, solar mu, branch/revolution policy, oracle answers and propagation residuals. The generator never imports application code. It is not part of the normal offline test runtime.

Actual independent window results, reproduced offline with the command above:

| Date-pair target | Endpoint v-infinity sum (km/s) | Izzo/Gooding difference (km/s) | DOP853 miss (km) |
|---|---:|---:|---:|
| Mars | 7.639904702 | 1.354e-14 | 0.000133 |
| Venus | 39.988885388 | 1.462e-14 | 0.000270 |
| Jupiter | 51.634430269 | 3.506e-14 | 0.001018 |

The independent MGA witness is reproduced by replacing the script with `scripts/generate_mga_reference.py` in the same pinned command. It uses catalog Kepler geometry as input only (not a claim of Kepler ephemeris accuracy), never the production Lambert/search/flyby functions. At departure JD 2460570.5, independent TOFs are [1540, 984.0800391269449, 664.713447121634] days. Its score is 11.17641514055543; inferred Jupiter/Venus periapses are 5033133.793758778 / 7072.00139888119 km; maximum independently integrated miss is 0.0021675761238042018 km. The root brackets define a feasible witness, not an independently optimized global solution. Production's looser 1 m/s continuity tolerance permits a slightly different TOF; the test checks physics and a 0.01 score allowance, not exact times.

- [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html): vector-state query contract. Actual raw captures include the provider's ephemeris/API metadata.
- [Izzo, Revisiting Lambert's Problem, version 2](https://arxiv.org/abs/1403.2705v2), DOI 10.1007/s10569-014-9587-y.
- [Gooding, A procedure for the solution of Lambert's orbital boundary-value problem](https://doi.org/10.1007/BF00049511).
- [lamberthub v1.0.0](https://github.com/jorgepiloto/lamberthub/tree/v1.0.0): independently executed solvers; no source copied into production.
- [Weber, Planetary Departure](https://orbital-mechanics.space/interplanetary-maneuvers/planetary-departure-trajectory.html) and [Planetary Arrival: Capture](https://orbital-mechanics.space/interplanetary-maneuvers/planetary-arrival-capture.html): specific energy and circular parking/capture equations. Tests independently enforce specific energy and hand-derived unit cases.

## Outstanding requirements / next actions

No implementation blocker remains within the declared contracts. Residual requirements are explicit:

- Original GMAT/Orekit/Tudat executions still lack the endpoint/branch metadata needed to compare their historical totals. They remain incomparable; replacement oracles must not be described as those tool runs.
- MGA validation establishes a dated two-assist feasible quality floor and independent continuity/propagation, not global optimality or an exhaustive mission-design campaign. The frozen catalog-geometry witness should be reassessed if the ephemeris agent intentionally changes the underlying Kepler input geometry.
- Parking/capture assumes spherical catalog body radius, aligned circular parking planes and cargo already supplied in target orbit. Surface ascent/descent, plane changes, finite thrust and missing body mass/radius remain unsupported.
- The shared operating interval rejects missions whose generated legs extend beyond 2050; it is a computational contract, not scientific validation over the entire interval.
- At this original mission checkpoint, a permanently stalled Horizons read can occupy remote capacity until process restart. This was not an owner-approved tradeoff; the terminable-transport follow-up and current master govern closure.
- No optional SPICE/Tudat/GMAT/Orekit runtime, GPU or hardware capture is represented as passing. Controller owns full integration gates and websocket/runtime changes; server edits remain above that section.
