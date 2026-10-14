# SCN-049 solar numerical-helper policy

Date: 2026-10-14. Worktree: `solar-remediation-20261014-solar`.

## Status and scope

The solar numerical-helper child reported by Hooke is repaired and regression-tested. This does not close the entire SCN-049 umbrella or assert an HTTP bypass. The existing PFSS cache and HTTP ingress already reject nonfinite inputs; this change makes direct numerical-helper calls reject them as well.

Handoff source: `a5f3c41:agent-notes/REMEDIATION_RUNTIME_CLIENT_2026-10-14.md`, read through `git show` without merging or modifying that owner's files.

Files changed:

- `backend/sim/solar_physics.py`: scalar clamp and raw, normalized, and peak Hathaway helpers reject nonfinite numeric arguments with `ValueError` before arithmetic or early-zero returns.
- `backend/sim/pfss_magnetogram.py`: scalar clamp rejects nonfinite values/bounds; public `synthetic_magnetogram` explicitly rejects nonfinite activity and JDTDB before map construction, including calls with no active regions.
- `backend/tests/test_solar_numerical_policy.py`: 103 scoped regression cases covering NaN, positive/negative infinity, all scalar arguments, early returns, empty-region epochs, and retained finite saturation.
- This report.

No HTTP, websocket, frame, UI composition, provider acquisition, dependency, scientific manifest, offline guard, or existing mutant assertion edits. SCN-041 calibration and SCN-042 integrated-scene requirements remain as reported in their separate checkpoints.

## Root cause and baseline reproduction

Python's ordered `min`/`max` expression used by both scalar clamps can silently map NaN to the lower bound. That turned NaN activity into a finite synthetic quiet-Sun map and NaN Hathaway time into zero activity. Infinity was also saturated rather than rejected. Moreover, a nonfinite epoch could escape incidental downstream rejection when the synthetic map had no active regions. Hathaway's early-zero paths could mask invalid shape parameters.

Before editing production code, a direct diagnostic using the pinned backend requirements reproduced:

```json
{"nan_map_finite": true, "nan_map_equals_zero_activity": true, "solar_clamp_nan": 0, "hathaway_normalized_nan": 0.0}
```

The same diagnostic required `ValueError` from five direct helper calls for each of NaN, positive infinity, and negative infinity: synthetic activity, synthetic epoch with empty regions, both scalar clamps, and normalized Hathaway time. **All 15 lacked the required rejection**. Its concluding assertion failed with exit 1, establishing the reported behavior before repair. This was a numerical diagnostic, not a network or HTTP exploit test.

The baseline used this environment and interpreter invocation:

```bash
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC PYTHONPATH=backend uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt python -
```

## Policy retained

Finite scalar values still saturate to their specified bounds. Finite synthetic activity still saturates to [0, 1], including extreme finite magnitudes. Valid finite pre-cycle Hathaway times still return zero. Existing valid Hathaway shape calculations, shared analytic reference values, region lifecycle/rotation/polarity, and PFSS physics formulas are unchanged.

The finite check runs before shape-dependent early returns. Invalid values are not converted into zero, quiet-Sun fallback data, or a cacheable successful numerical result. Invalid shape-domain behavior beyond the nonfinite policy and every possible overflow from extreme finite scientific parameters are not claimed to be newly specified by this change.

## Exact focused validation

Command, from the assigned worktree:

```bash
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt python -m pytest -q backend/tests/test_solar_numerical_policy.py backend/tests/test_solar_cycle_reference.py backend/tests/test_solar_region_consistency.py backend/tests/test_solar_physics_model.py backend/tests/test_solar_physics_determinism.py backend/tests/test_pfss_cache.py
```

Result: **273 passed, 2 warnings in 96.97 seconds**, exit 0. This includes all 103 new parameterized policy cases and the existing cycle analytic oracle, persistent-region consistency, solar model/determinism, and PFSS cache regressions.

Warnings were third-party deprecations for Starlette TestClient's `httpx` integration and the `anyio.abc.BlockingPortal` alias. No full backend or frontend suite was rerun; the controller retains integrated full-gate ownership. No external provider acquisition, observed calibration, or GPU evidence is inferred from these numerical tests.

## Integration hashes and remaining actions

The numerical guard change necessarily changes the reviewed PFSS source hash, superseding the previous frame-only checkpoint's promise of no PFSS edits:

```text
15309de0933546675e41cf569412f7b88a893bd35647585899e52e9aa265912b  backend/sim/pfss_magnetogram.py
3e5c1b88070761d10a3699c594677f9552ae2809a0dc229fd0a904e992cb1a83  backend/sim/solar_physics.py
```

The controller should review these narrowly scoped guards, refresh only corresponding approved manifest hashes, and run the integrated baseline/mutant gates without weakening their assertions or offline restrictions. No blocker remains for this numerical-policy child. Broader SCN-049 children and the previously quantified SCN-041/042 requirements are not reclassified by this commit.
