# SCN-041 matched-provider comparison follow-up

Status: **accuracy budget FAILED; SCN-041 remains open**. This is now a numerical comparison with independently integrated NASA PFSS field lines, not merely capture integrity. No production calibration label, degree cap or scientific claim was changed.

## Matched input, frame, units and radius

- Input: the same pinned NASA WSA 6.2 FITS and same-epoch PFSS `.osfls` artifacts committed in `9a5499f`; SHA-256 checks remain mandatory. Map identity is `mrzql261012t1744c2316_079`, observed 2026-10-12 17:44.
- FITS HDU 3 contains the actual provider's 90-degree Schmidt coefficients. Its axes are `[g/h,m,l]`; conversion is transpose to `[g/h,l,m]` and microtesla times 0.01 to Gauss. These are photospheric radial coefficients, not unnormalized potential coefficients.
- The [producer's dataset documentation](https://huggingface.co/datasets/nasa-ibm-ai4science/surya-bench-coronal-extrapolation/raw/main/README.md) independently specifies HDU 3, Schmidt normalization and triangular coefficient storage. The captured file itself specifies coefficient units and `RADSS=2.51`.
- `.osfls` is decoded against [OpenSpace's published v0 reader](https://github.com/OpenSpace/OpenSpace/blob/e8d4f88d7ad83da2124585c7c201383bb9deb219/modules/fieldlinessequence/util/fieldlinesstate.cpp), `loadStateFromOsfls`. Producer source git blob: `ef6d4ee53b8d8131faef3a04c679d67b48a0c62a`. All 622 line ranges, 10,869 vertices, per-line topology labels, payload length and finite coordinates are checked. The labels identify 82 open and 540 closed lines.
- The comparison operates entirely in the provider-native Cartesian frame shared by coefficients and lines. No free longitude, sign, amplitude or radial fit is made. A fixed 90-degree frame-error control is measured separately. An absolute Carrington-to-inertial frame convention is NOT inferred from low residuals.
- Production `PFSSField` uses the provider's source radius of 2.51 solar radii. The 5-Rs SCS map is not misidentified as a PFSS source-surface map. Provider timestamp agreement is checked as an internal epoch identity only, not silently declared TDB.

## Measured results and coverage

The full report is `agent-notes/solar-reference-2026-10-14/comparison.json`. Tangents use up to five deterministic segments on every reference line, 3,065 samples total; the reference directions are finite provider line segments, not derivatives computed by our code. No weak-field samples are silently dropped. Every reference start is traced by the production integrator with step 0.01 Rs and 600-step budget.

| Domain / quantity | Result |
| --- | --- |
| Runtime degree 15, all tangent samples | median 17.3000 deg; p90 55.5786 deg |
| Degree 30 diagnostic, all samples | median 7.9815 deg; p90 36.1125 deg |
| Degree 64 diagnostic, all samples | median 1.7804 deg; p90 11.3683 deg |
| Runtime degree 15, radius >= 1.2 Rs | 556 samples; median 0.1587 deg; p90 2.9712 deg |
| Runtime degree 15, radius >= 1.5 Rs | 310 samples; median 0.03894 deg; p90 0.20713 deg |
| All 622 runtime traces | 100% determinate; no time/step exhaustion |
| Runtime open recall | 81.7073%; 15 provider-open lines became closed |
| Runtime closed recall | 98.7037%; 7 provider-closed lines became open |
| Balanced topology accuracy | 90.2055% |
| 67 mutually open endpoints | median 6.6637 deg; p90 16.1732 deg; maximum 22.0841 deg |
| Fixed wrong-frame control | median 54.6472 deg; p90 82.7766 deg |

The broad-domain accuracy criteria were placed in the comparator before its full run: tangent median <=2 deg, tangent p90 <=10 deg, balanced topology >=95%, determinate fraction >=99%. The accuracy command exits **2**, and `accuracy_budget_passed=false` is retained. The separate high-corona regression is explicitly limited to the 310 samples above 1.5 Rs with median <0.25 deg and p90 <1 deg; it is not used to excuse the failed lower-coronal/topology criteria.

Interpretation: convergence with harmonic degree and good higher-altitude agreement point to unresolved near-surface harmonic content as a major source of mismatch. That is a supported inference, not proof that all tracer or reference errors are eliminated. Runtime degree 15 was NOT raised to 64/90 without a computational budget, nor was the provider's degree-90 solution quietly truncated and relabeled as an independent full-resolution reference.

## Exact commands

Matched comparison and explicit failed accuracy gate (exit 2; JSON retained):

```sh
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt python backend/tests/solar_reference_comparison.py --output agent-notes/solar-reference-2026-10-14/comparison.json --require-accuracy
```

Focused comparison regressions: **11 passed**. These include the qualified high-corona agreement check and explicit preservation of the failed broad-domain accuracy result; they are not eleven calibration passes.

```sh
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt python -m pytest -q backend/tests/test_solar_reference_comparison.py backend/tests/test_solar_external_reference.py --tb=short
```

Astropy 8.0.1 was used to inspect the provider HDUs and confirm their headers/shapes. The committed comparator does not require Astropy, SunPy or another optional runtime; it reads only the bounded, hash-pinned image/line formats. No whole backend gate was repeated.

## Remaining requirements

1. Resolve the near-photosphere resolution/topology error under an explicit runtime cost/degree budget and test additional epochs/map morphologies. One real GONG-Z epoch is not solar-cycle-wide coverage.
2. Acquire a matched provider speed product or independent observed interval. All four captured FITS HDUs were inspected: they contain coronal/maps, subspacecraft tracks and coefficients, but no wind-speed image. The pinned ACE forecasts and available observations still do not overlap. No speed residual or observed skill statistic is fabricated.
3. Keep empirical WSA calibration open until speed-map/propagation comparisons have quantitative acceptance criteria and matching input/epoch/radius/frame semantics. Independent PFSS field validation, even if complete, is not empirical wind-speed calibration.
4. Use the separate SCN-042 CSPICE/screen-oracle work for absolute solar axes/projection; this provider-native comparison does not validate UI frame wiring.
