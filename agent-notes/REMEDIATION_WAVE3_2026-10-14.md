# Canonical remediation: third integration checkpoint

This is a continuation ledger, not an all-items-resolved declaration. Work stays
on `remediation/canonical-register-20261014`, outside `main`. The latest explicitly
requested work includes all open and partially open canonical-register items;
passing unrelated tests does not close missing scientific or external evidence.

## Newly integrated work

| Commit | Scope | Evidence |
| --- | --- | --- |
| `892d049` | Independent ACE observations overlapping the frozen NASA WSA forecast | Eight offline comparison-contract tests pass; 11 exact matches. This is not application calibration. |
| `938bca0` | Reject AIA images outside the requested epoch | 25 actual source/date captures; 12 regression failures before the guard; 163 focused tests pass afterward. |
| `953eeb4` | Explicit finite-input policy for solar numerical helpers | NaN/infinity no longer silently become quiet-Sun data; finite saturation is preserved. |
| `d8c75b4` | Report-writer trust, safe failures, detached Futures and queued-work ownership | Focused and repeated faults plus a five-minute real two-worker soak. Local deployment is not remote TLS acceptance. |

Combined integrated operational/numerical/AIA command:

```bash
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 \
NUMEXPR_NUM_THREADS=1 TZ=UTC \
uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
  python -m pytest -q \
  backend/tests/test_solar_numerical_policy.py \
  backend/tests/test_operational_contract.py \
  backend/tests/test_benchmark_endpoint_budget.py \
  backend/tests/test_benchmark_report_overwrite.py \
  backend/tests/test_server_validation.py backend/tests/test_solar_security.py \
  backend/tests/test_runtime_recovery_contract.py \
  backend/tests/test_runtime_review_regressions.py \
  backend/tests/test_compute_budget.py backend/tests/test_ws_resource_contract.py \
  backend/tests/test_solar_aia_epoch_coverage.py --tb=short
```

Result: **339 passed**, two dependency deprecation warnings, 9.15 seconds.
Log: `/tmp/solar-operations-numerics-integrated-20261014.log`.

The preceding full backend/CI/catalog/observation-comparator run at `938bca0`
passed **2,966 tests**, with **5 skips**, two dependency deprecation warnings,
259.08 seconds. The five skips are not counted as successful scientific or native
coverage. Native Tudat has a separate real-environment gate. This full run
predates integration of `953eeb4` and `d8c75b4`; a later full run remains required.
Log: `/tmp/solar-full-backend-aia-20261014.log`.

The existing asteroid loader/cache/quantization tests independently passed
**35 tests** on this construction branch. No second loader implementation was
introduced. Their bounds assume normal event-loop scheduling and native fetch
abort semantics, as documented in the catalog evidence.

## Resumed workers and interface ownership

The previous worker sessions became unavailable. Their commits and uncommitted
work were preserved. Six replacement workers resume those same worktrees rather
than deleting or recreating their work.

| Worker | Existing worktree suffix | Current bounded responsibility |
| --- | --- | --- |
| Cicero | `solar` | Finish active solar frame/geometry wiring, then repair the measured PFSS accuracy gap. |
| Herschel | `ephemeris` | All-moon model accuracy, identity and reproducible artifact generation. |
| Planck | `science-review` | Complete independent native-Tudat and catalog-source review repairs. |
| Volta | `delivery` | Five-minute dev/preview production-budget evidence and remaining browser support. |
| Peirce | `frame-lifecycle` | Real backend Kuiper payload compatibility and frame/visibility lifecycle. |
| Beauvoir | `operational` | Independent operational checkpoint review and remaining bounded acceptance work. |

Interface rulings:

- Only Peirce edits `main.ts`; Cicero supplies a narrow solar-orientation handoff.
  This preserves both frame-lifecycle and solar-frame behavior without competing
  writers. A wrong integration requires a combined regression fix, not dropping
  one side's change.
- Herschel owns the moon artifact and moon-specific generator. Planck owns the
  shared catalog source acquisition/identity layer and coordinates interface
  changes. Existing four-body offline reproducibility cannot be silently broken
  by adding a mixed-format artifact.
- The controller owns the AIA epoch guard and independent observational captures.
  Replaying external NASA forecasts is not a substitute for evaluating the
  application's actual PFSS/WSA path.
- Preserve original scientific thresholds. In particular, the degree-15 PFSS
  comparison remains failed; high-corona-only accuracy cannot replace the
  required near-surface/topology result.

## Still not closed

- SCN-005 sustained production-budget dev/preview delivery.
- SCN-030 remaining browser and manual assistive-technology/physical-touch checks.
- SCN-035 owner license choice and unresolved third-party distribution rights.
- SCN-041 application PFSS near-surface/topology accuracy and matched wind-speed
  calibration.
- SCN-042 full-scene solar wiring and remaining visual contracts.
- SCN-043 complete, independently qualified all-moon model accuracy and the
  offline generator/artifact contract.
- SCN-047/048/049 remaining named children, especially actual deployment URL/auth
  and TLS evidence, active frame/client compatibility, and explicitly identified
  architectural or operational acceptance questions.

The master keeps landing state separate from tested branch progress. No fix is
reported as merged into `main`, no remote push is claimed, and no skipped/manual
requirement is converted into a passing automated test.
