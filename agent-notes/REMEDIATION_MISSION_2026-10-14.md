# Mission remediation, 2026-10-14

Assigned worktree: `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-mission`.
No subagents, pushes, merges, root-main edits, or master-tracker edits.

## Priority fixes

| Issue | Status | Evidence and limits |
|---|---|---|
| SCN-012 | FIXED for reproducible nonzero Lambert coverage | Three legacy date pairs now have archived actual JPL Horizons endpoint states and independent lamberthub 1.0.0 Izzo/Gooding answers. 3/3 comparable and passing. Historical GMAT/Orekit/Tudat totals remain explicitly incomparable in `legacyCalibration`; their execution was not reproduced. This validates the fixed-state Lambert solver, not live Kepler/SPICE accuracy. |
| SCN-020 | FIXED | Margin includes only usable propellant on attached stages, excluding protected reserves. Onboard, protected and discarded fuel are separately reported. Exhausted risk samples report zero usable margin. |
| SCN-078 | FIXED within declared ideal patched-conic model | Four chronological impulsive burns: departure, target capture, target departure, return capture. Cargo loads before burn 2 (zero-based), after target capture. Circular parking altitude defaults to 200 km and is declared in schema/capabilities/results. No surface operations, plane changes, finite thrust or aerocapture claim. |
| SCN-044 | IN PROGRESS | Independent real-window/two-assist search-quality evidence still to assess. |
| SCN-045 | IN PROGRESS | Preserve integrated SCN-064; independent boundary propagation and exact-plane policy still to assess. |
| SCN-063 | IN PROGRESS | Existing single-permit owner retained pending explicit contract documentation. |
| SCN-072 | IN PROGRESS | Reproduced unsupported-epoch route rejection gaps; focused regression pending repair. |
| SCN-073 | IN PROGRESS | Default redirect transport pending repair. |
| SCN-079 | IN PROGRESS | Reproduced wrong verifier nesting, unsupported sample objective and zero failure exit; repair pending. |

## Tests so far

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

## Fixed files (priority commit)

`backend/benchmark/accuracy.py`, `backend/benchmark/reference_scenarios.json`, nine new JSON artifacts under `backend/benchmark/artifacts/`, `scripts/generate_mission_window_references.py`, `backend/mission/{agents,schemas,vehicle_service,propulsion}.py`, `backend/trajectory/mga.py` (metric label only), small `backend/server.py` schema/capability hunks, and focused benchmark/mission tests.

## Reference reproduction and provenance

```sh
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12 --with lamberthub==1.0.0 --with numpy==2.2.6 --with scipy==1.15.3 --with numba==0.61.2 --with llvmlite==0.44.0 python scripts/generate_mission_window_references.py
```

Default reproduction uses the six archived raw provider responses. Initial capture used the same command with `--capture`. Each independent artifact records exact requests, target/center, epochs, frames, units, geometric corrections, SHA-256 hashes, versions, solar mu, branch/revolution policy, oracle answers and propagation residuals. The generator never imports application code. It is not part of the normal offline test runtime.

- [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html): vector-state query contract. Actual raw captures include the provider's ephemeris/API metadata.
- [Izzo, Revisiting Lambert's Problem, version 2](https://arxiv.org/abs/1403.2705v2), DOI 10.1007/s10569-014-9587-y.
- [Gooding, A procedure for the solution of Lambert's orbital boundary-value problem](https://doi.org/10.1007/BF00049511).
- [lamberthub v1.0.0](https://github.com/jorgepiloto/lamberthub/tree/v1.0.0): independently executed solvers; no source copied into production.
- [Weber, Planetary Departure](https://orbital-mechanics.space/interplanetary-maneuvers/planetary-departure-trajectory.html) and [Planetary Arrival: Capture](https://orbital-mechanics.space/interplanetary-maneuvers/planetary-arrival-capture.html): specific energy and circular parking/capture equations. Tests independently enforce specific energy and hand-derived unit cases.

## Outstanding requirements / next actions

Complete the remaining scoped transport, epoch, EPO and boundary checks. No optional runtime/hardware test is represented as passing. Controller owns full integration gates and websocket/runtime changes; server edits remain above that section.
