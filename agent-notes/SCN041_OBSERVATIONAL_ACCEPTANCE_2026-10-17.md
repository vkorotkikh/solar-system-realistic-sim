# SCN-041 Observational Acceptance Closure

Date: 2026-10-17

Status: `RESOLVED_SCOPED` for deterministic, offline observational ingestion and
provider-feature acceptance at one pinned epoch. This is not operational WSA,
live-provider, solar-cycle, 1-AU, or scene-rendering validation.

## Root cause

The production GONG parser accepted only maps whose signed flux was already
within a roundoff-scale monopole bound. The pinned real NSO/GONG `zqs` map has a
signed/unsigned flux fraction of `0.04073496488871058` and a mean of
`0.1971407661918085 G`, consistent with the matched WSA V6.2 product's disclosed
pre-correction monopole. Production therefore rejected a valid observed input
with `flux_unbalanced` before PFSS ingestion. Observed geometry also remained
intentionally unresolved, and the WSA-inspired application path had no bounded
provider-feature acceptance record.

## Pinned offline corpus

- NSO/GONG compressed SHA-256: `e405550e1f8844bf5556419e7137aa6eb9bce79e0292a628df2c1ece28872ee8`
- Expanded FITS SHA-256: `e93f2c4daec232b5c98583d15a589130c3bc588201c25e980455db9aa8144efd`
- Matched NASA/CCMC WSA V6.2 SHA-256: `5b8f1da9e8bcf057b1c86ecd80207166e3362e1ecb92db7a54499ec7bf192035`
- Generated report SHA-256: `09ebd55d71da1dc3462d6b86e80e7299eb4c6b1e309aa1621e218b84f9f39021`
- Corpus manifest: `agent-notes/solar-observational-acceptance-2026-10-17/manifest.json`
- Machine-readable result: `agent-notes/solar-observational-acceptance-2026-10-17/report.json`

## Implemented contract

- The legacy roundoff-only policy and its normalized identities are preserved.
- Real maps with both polarities may use `bounded-polarity-scale-monopole-v1`
  only when `abs(signed_flux / unsigned_flux) <= 0.05`.
- For `q = signed_flux / unsigned_flux`, positive samples are scaled by `1-q`
  and negative samples by `1+q`; one-polarity, nonfinite, over-limit, and
  inconsistent provenance inputs fail closed.
- PFSS re-derives the pre-correction map and every correction metric from the
  immutable balanced field, then reparses and compares the pinned native FITS.
- Observed geometry is declared as provider-native
  `GONG_ZQS_CARRINGTON_GRID_V1`, using product token `zqs` and source contract
  `equal-area-sine-latitude-v1`. It remains non-renderable because no validated
  provider-to-scene adapter exists.
- WSA remains `wsa_inspired_v1` with `calibration_status: unvalidated`.
  Separate metadata records only `accepted_bounded_single_epoch` and binds both
  corpus hashes. It is model-level evidence, not certification of an arbitrary
  current input.
- Public `data_driven` forcing remains fail-closed with
  `disabled_unvalidated`.

## Measured acceptance

All preregistered checks pass without changing existing numerical tolerances:

| Measure | Result | Budget |
|---|---:|---:|
| Degree-15 coefficient correlation | `0.9999712887` | `>= 0.9999` |
| Coefficient normalized RMSE | `0.0079832297` | `<= 0.01` |
| Coefficient maximum absolute error | `0.0558274031 G` | `<= 0.06 G` |
| Wrong-frame negative-control correlation | `0.0282959068` | `<= 0.1` |
| Constant-offset negative-control normalized RMSE | `0.0518961046` | `>= 0.04` |
| Provider topology accuracy | `0.9679783951` | `>= 0.96` |
| Provider-open recall | `0.7492447130` | `>= 0.74` |
| Provider-closed recall | `1.0` | `>= 0.999` |
| False-open cells | `0` | exact observation |
| Matched feature cells | `248` | `>= 240` |
| Log-expansion correlation / median absolute error | `0.6804423537 / 0.4610123558` | `>= 0.67 / <= 0.47` |
| Boundary correlation / median absolute error | `0.5171549418 / 3.4211313136 deg` | `>= 0.50 / <= 3.5 deg` |
| Speed correlation / RMSE / absolute bias | `0.6678807620 / 85.8743687293 / 44.6890825752 km/s` | `>= 0.65 / <= 90 / <= 50 km/s` |

## TDD and verification evidence

The production pre-change ingestion RED was captured with:

```text
PYTHONPATH=backend:backend/tests PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC UV_NO_PROGRESS=1 uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt pytest -q backend/tests/test_solar_observational_acceptance.py::test_real_gong_ingestion_uses_bounded_disclosed_polarity_scaling
```

Result: `1 error`; production raised `GongFitsError: flux_unbalanced: map
monopole exceeds roundoff-only policy`.

The production metadata hash-binding RED was `1 failed` with
`KeyError: 'observation_sha256'`. After the minimal metadata change, that exact
test passed.

Final focused acceptance: `7 passed in 10.60s`.

Focused GONG/PFSS/frame/WSA regressions: `236 passed in 18.44s`.

Final backend suite:

```text
PYTHONPATH=.:backend:backend/tests PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC UV_NO_PROGRESS=1 uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt pytest -q backend/tests
```

Result: `3761 passed, 13 skipped, 2 warnings in 151.93s`. The warnings are
existing Starlette/httpx deprecations.

The canonical R3/R4 verifier and manifest are unchanged byte-for-byte. Its
pre-commit invocation correctly refused to run because
`backend/sim/pfss_magnetogram.py` is a dirty pinned input; no baseline or mutant
executed in that rejected invocation. The baseline supplied for this branch at
`/tmp/solar-scn041-scn049-baseline.gO69Ke/` records six passing baselines and
six killed mutants. The unchanged gate must be rerun from the clean commit.

## Deliberate limitations

- One observed epoch is not solar-cycle-wide validation.
- The provider WSA product is an independent model output, not in-situ truth.
- Speed acceptance evaluates the repository relation on provider expansion and
  boundary-distance features; it does not establish operational equivalence.
- No Schatten current-sheet stage, 1-AU propagation, arrival-time calibration,
  live availability, or scene-coordinate rendering calibration is claimed.
