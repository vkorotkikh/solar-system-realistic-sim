# SCN041 cold complete-response acceptance

Both high and ultra cold native-degree-90 runs passed the existing supervisor
and wire limits. No production timeout, byte cap, numerical threshold, memory
policy, observed-forcing guard, or scientific production setting was changed.

## Actual measured path

The harness starts a fresh `spawn` process through `SupervisedProcessRunner`,
imports the target and numerical modules, decodes the hash-pinned baseline NASA
reference, computes native degree-90 PFSS display lines and the complete 36x72
WSA grid, runs `execute_solar_physics_job` for all other response products,
encodes the actual supervisor envelope, receives and validates that result with
`validate_solar_physics_result`, and serializes the full HTTP JSON response.
Timing begins before supervisor submission and ends after HTTP serialization.

The child-side fixture replaces only the model's PFSS cache. It does not replace
the response with a benchmark surrogate, skip WSA, lower line counts, or use a
warm solution cache. This proves numerical full-response integration capacity;
it does NOT enable or validate the public observed-forcing route. The request
remains explicitly synthetic while the test injects the native PFSS boundary.

| Quantity | High | Ultra |
| --- | ---: | ---: |
| Complete response, seconds | 12.244045306 | 12.317880813 |
| Native PFSS/WSA solve, seconds | 11.909305137 | 11.968890017 |
| Display lines | 120 | 180 |
| WSA grid | 36x72 | 36x72 |
| Degree / RADSS | 90 / 2.51 | 90 / 2.51 |
| Requested max features | 256 | 256 |
| Actual supervisor envelope, bytes | 860754 | 1107167 |
| HTTP response body, bytes | 860593 | 1107005 |
| Peak child RSS, KiB | 89668 | 90932 |
| Native solver calls / warm cache hits | 1 / 0 | 1 / 0 |

The actual configured deadline is **18 seconds**, stricter than the unchanged
**19-second HTTP hard ceiling**. The wire cap remains **2097152 bytes**. Native
evaluation scratch batches remain bounded to **1024 positions**. Existing JSON
tree limits and result validation are applied by the real supervisor. No numeric
RSS ceiling is configured, so RSS is reported as a measurement, not as passing
an invented memory threshold. Both workers were reaped with zero active jobs,
zero quarantined jobs, and no broken-runner state.

The parent reported a concurrent pinned single-thread full backend run. Both
reports are consequently marked `reported_shared_cpu_contention: true`; they
are not presented as uncontended benchmark measurements. All four numerical
thread environment variables were pinned to one for these runs.

JSON evidence:

- `solar-reference-2026-10-14/cold-degree90-high.json`
- `solar-reference-2026-10-14/cold-degree90-ultra.json`

## Reproduction

Run from this solar worktree, not the environment's unrelated default cwd:

```sh
PYTHONPATH=backend:backend/tests PYTHONHASHSEED=0 \
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC \
uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
python backend/tests/solar_pfss_cold_response.py --fidelity high --contended \
  --output /tmp/solar-cold-high.json
```

Use `--fidelity ultra` for the second case. Omit `--contended` only when no
contention is reported. The command exits 2 on budget or worker failure and
records the actual failure rather than promoting it to a pass. The optional
`--synthetic-baseline` uses the unmodified synthetic PFSS cache for comparison.

## Fail-closed integration policy

New regression tests prove that high/ultra `data_driven` requests, with either
live-data flag, reject as `ObservedSolarInputUnavailable: disabled_unvalidated`
before grid or native PFSS computation. The worker also rejects extra payload
fields attempting to inject coefficients, a validation flag, a source-surface
radius, or a native-boundary object. Native solver availability alone cannot
promote observational provenance or frame validation.

Provider/provenance binding and observational route activation remain separate
work. No Planck time/AIA/cache or Beauvoir controller/visual files were touched.
Held-out parser support and scientific comparisons follow this cold gate in a
separate bounded checkpoint; the parent owns captured artifact provenance.

Validation: the spectral-entry-point and new policy tests first passed 24/24
in 0.28 s. The subsequent worker-contract, supervisor, endpoint, spectral, and
policy run passed **69 tests in 17.33 s**, with the two existing Starlette/httpx
dependency deprecation warnings and no skips. Both cold acceptance commands
exited zero. The entire backend suite was not rerun in this checkpoint because
the parent was already running the integrated suite.
