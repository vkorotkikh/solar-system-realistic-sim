# SCN-041 full-degree diagnosis

Production accuracy remains **FAILED** at degree 15. The matched full-degree
diagnostic passes the original accuracy budgets, but is not enabled in production
and does not meet the existing worker latency budget. No scientific thresholds,
runtime caps, numerical policy, provider data, or canonical tracker were changed.

## Matched evidence

`backend/tests/solar_reference_degree_diagnostic.py` uses all degree-90 NASA
coefficients from `mrzql261012t1744c2316_079` and the captured `RADSS=2.51`.
The existing SHA-256 gates validate the FITS and `.osfls` artifacts before use.
Conversion remains microtesla times 0.01 to Gauss, with the documented coefficient
axis transpose. No longitude, sign, or amplitude is fitted.

The diagnostic uses SciPy 1.18.0's normalized associated Legendre functions,
converts the declared normalization/Condon-Shortley convention analytically,
and independently differentiates the potential satisfying the two boundary
conditions. It does not relax the production basis's degree-64 guard.
Checks against analytic degree-90 zonal/sectoral modes and exact pole limits pass.

Across all 3,065 provider tangent samples, the maximum relative vector differences
between the independent evaluator and production are:

| Degree | Maximum relative vector difference |
| --- | --- |
| 15 | 1.454e-14 |
| 30 | 4.766e-14 |
| 64 | 5.452e-14 |

These comparisons check complete vectors, including amplitude and sign. The
external tangent comparison itself is unoriented and cannot independently
calibrate absolute field amplitude or a global sign. Absolute solar-to-inertial
frame validation remains the separate SCN-042 concern.

## Accuracy, including the photosphere

All degrees use the same 3,065 finite segments on all 622 NASA lines. No weak-field
sample, photospheric sample, or line is discarded. All 2,509 samples below 1.2 Rs
are reported separately as well as in the mandatory full-domain result.

| Degree | Full-domain median | Full-domain p90 | Below 1.2 Rs median | Below 1.2 Rs p90 |
| --- | --- | --- | --- | --- |
| 15 | 17.299998 deg | 55.578639 deg | 22.995029 deg | 60.107060 deg |
| 30 | 7.981517 deg | 36.112492 deg | 11.523102 deg | 40.477149 deg |
| 64 | 1.780435 deg | 11.368268 deg | 2.793545 deg | 13.011788 deg |
| 90 | 0.789599 deg | 5.022380 deg | 1.131331 deg | 5.726463 deg |

Full-degree tracing uses the existing production RK4 tracer, the same 622 starts,
0.01 Rs steps and 600-step ceiling. All 82 provider-open lines remain open; 538 of
540 closed lines remain closed. There are **zero indeterminate traces** and two
closed-as-open mismatches. Balanced accuracy is **99.814815%**. Open-endpoint
angular error is median **0.222560 deg**, p90 **1.158160 deg**, max **2.185492 deg**.

The unchanged budgets are median <=2 deg, p90 <=10 deg, balanced topology >=95%,
and determinate fraction >=99%. Full degree 90 meets these diagnostic budgets.
The degree-15 production gate remains failed at 90.2055% balanced topology.

Inference: the convergence under unchanged coefficients, radius, and coordinates,
together with independent vector agreement, identifies spectral truncation as
the dominant source of the measured near-surface mismatch. It does not prove
perfect model closure: two topology discrepancies and finite-segment residuals
remain, and only one GONG-Z epoch has been covered.

## Runtime limit remains a real blocker to a degree-cap change

The diagnostic holds at most 128 positions in a basis allocation. Its largest
degree-90 basis is **33,732,608 bytes**; measured whole-process peak RSS was
**193,820 KiB**. Input/output arrays still scale with the caller's point count.

Evaluating all 3,065 degree-90 tangent positions took **0.831896 s**. Tracing the
622 lines took **49.357974 s**, with 1,584 evaluator calls and 183,620 evaluated
positions. This alone exceeds the existing **19 s** worker computation ceiling,
before adding magnetogram decomposition, the WSA map, serialization, or delivery.
Timings are one local run, not a hardware-independent performance guarantee.

Therefore the production degree-15 config cap and shared degree-64 API guard are
unchanged. A follow-up production repair needs bounded streaming/compiled
recurrences or equivalent batching, sufficient source-grid resolution, and an
end-to-end cold-worker latency/memory measurement before enabling higher degree.
Copying this diagnostic into the request path would not satisfy that requirement.

## Reproduction and tests

Run from `solar-remediation-20261014-solar`:

```sh
PYTHONPATH=backend:backend/tests PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt python backend/tests/solar_reference_degree_diagnostic.py --output agent-notes/solar-reference-2026-10-14/degree90-diagnostic.json
PYTHONPATH=backend:backend/tests PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt python -m pytest -q backend/tests/test_solar_reference_degree_diagnostic.py -W error --tb=short
PYTHONPATH=backend:backend/tests PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt python backend/tests/solar_reference_comparison.py --output agent-notes/solar-reference-2026-10-14/runtime-degree15-checkpoint.json --require-accuracy
```

Diagnostic command: exit 0, with explicit `degree90_diagnostic_accuracy_passed=true`
and `production_accuracy_budget_passed=false` in the retained JSON. New diagnostic
tests: **6 passed**, warnings treated as errors. These are evaluator checks, not
six production calibration passes.

The original production accuracy command was rerun and exited **2**, as required
for the actual failing degree-15 result. Its fresh report is retained separately
as `runtime-degree15-checkpoint.json`; earlier comparison evidence is preserved.

The preceding SCN-042 checkpoint passed the full frontend (443 tests), full backend
(2,358 tests, no skips), build, and TypeScript ratchet. Strict TypeScript retains
217 baseline diagnostics outside the assigned solar change. The main-scene handoff
and integrated hardware delivery remain with the lifecycle owner.

Parent ACE overlap work is external-model-only. This PFSS diagnosis makes no
observed wind-speed calibration claim and does not replace that work.
