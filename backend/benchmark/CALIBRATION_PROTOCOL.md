# Strict Reference Calibration Protocol

This benchmark suite uses strict per-scenario calibration rows that must include:

- `gmat` result
- `orekit` result
- `tudat` result

For each tool row, the following fields are mandatory:

- `total_delta_v_km_s`
- `tool_version`
- `run_id`
- `captured_utc`
- `artifact_path`
- `artifact_sha256`

## Data Contract

`backend/benchmark/reference_scenarios.json` stores the strict scenario rows.

Each scenario must include:

- `truth_calibration.tier = "strict"`
- `truth_calibration.tools.{gmat,orekit,tudat}`
- `truth_calibration.consensus_total_delta_v_km_s`
- `truth_calibration.delta_v_tolerance_km_s`
- `truth_calibration.comparison_contract`

`comparison_contract` declares whether a reference row is actually comparable to the
solver being benchmarked. At minimum it should identify:

- `problem_type`
- `comparable_to_solver`
- `compatibility_note`

For true direct Lambert validation, also record the transfer definition explicitly:

- `central_body`
- `state_source`
- `state_center`
- `reference_frame`
- `velocity_units`
- `prograde`
- `revolutions`
- `path`
- `delta_v_metric`

The benchmark loader verifies:

1. All required tools are present.
2. Every artifact path exists.
3. Every artifact SHA-256 matches the recorded checksum.
4. Consensus value matches the mean of the three tool values within a tight bound.
5. Only scenarios marked comparable are scored as pass/fail against `solve_direct_lambert`.

## Updating Calibration Data

1. Re-run GMAT, Orekit, and Tudat for each scenario date pair.
2. Export per-tool artifact CSV files under `backend/benchmark/artifacts/`.
3. Update each tool row's delta-v/version/run metadata.
4. Update `artifact_sha256` to match each artifact.
5. Set `comparison_contract` so the benchmark knows whether the scenario is a true
   `fixed_state_lambert` comparison or some other trajectory problem.
6. Recompute `consensus_total_delta_v_km_s` and tune `delta_v_tolerance_km_s`.
7. Run:
   - `pytest -q backend/tests`
   - `python -m compileall -q backend`

## Notes

- This protocol hardens benchmark integrity and prevents silent drift back to loose blended references.
- If any checksum or required-tool row is missing, benchmark execution fails fast.
- If a scenario does not encode a transfer problem comparable to the solver under test,
  it is reported as `incomparable_reference` instead of being counted as a solver failure.
- The benchmark test suite also validates pass/fail bookkeeping with a controlled solver stub so that reporting regressions are caught even when the live solver output changes.
