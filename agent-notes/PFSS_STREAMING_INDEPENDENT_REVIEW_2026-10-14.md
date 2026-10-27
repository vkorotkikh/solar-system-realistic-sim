# Independent streaming PFSS numerical review

Review base: `ec4e0bb`, including integrated `b123b7f` / source `9a239f0`.
Branch: `remediation/20261014-pfss-streaming-review`.
Implementation owner: Cicero. This commit changes only this note and
`backend/tests/test_pfss_streaming_review.py`. No implementation, tracker,
time-policy, controller, or cold-response integration files were changed.

## Findings requiring implementation-owner handoff

### Important: streaming path bypasses non-finite colatitude rejection

Locations: `backend/sim/pfss_evaluation.py:65` and
`backend/sim/pfss_magnetogram.py:242`, `:360`.

The streaming evaluator enters cosine/recurrence operations without validating
coordinates. NaN and either infinity as colatitude return three NaN components
instead of raising. The low-degree scalar path still raises `ValueError`.
Loading the pre-streaming `b123b7f^` module in memory confirmed that its batch
path rejected the same NaN input with `mu must be finite and in [-1, 1]`.
Thus the batch rejection loss is a reproduced regression, not a proposed new
policy. The high-degree scalar path has the same omission.

Nine new cases fail in
`test_nonfinite_colatitude_keeps_existing_fail_closed_contract`; the three
low-degree scalar controls pass. Reject invalid coordinates before recurrence;
do not sanitize NaNs into plausible zero fields.

### Important: integer radii crash the new high-degree scalar evaluator

Locations: `backend/sim/pfss_evaluation.py:65`, `:85`, `:109`.

`PFSSField(..., lmax=90, r_ss=2.51).evaluate(1, .7, .4)` raises NumPy
`_UFuncOutputCastingError`. The physically identical radius `1.0` succeeds.
Broadcasting preserves the integer radius dtype; `np.full_like` truncates the
reflected term into an integer buffer, then its in-place floating multiplication
fails. The new scalar dispatch for degrees above 64 exposes this dtype issue.

Six new cases fail in
`test_integer_radius_is_the_same_physical_input_as_float_radius`, covering
scalar degrees 65/90 and batch degrees 1/64/65/90. Scalar degrees 1/64 pass.
The pre-streaming batch evaluator also rejected integer radii, with a different
negative-integer-power error; do not mislabel that older batch limitation as a
new regression. Normalize numerical coordinate dtype before allocation without
changing any physical value or numerical acceptance threshold.

### Important: near-pole angular information is discarded

Locations: `backend/sim/pfss_evaluation.py:75` and `:87`;
Cartesian conversion also uses `acos(z/r)` in
`backend/sim/pfss_magnetogram.py:310` and `:338`.

Recovering sine from `sqrt((1-cos(theta))*(1+cos(theta)))` collapses a resolved
nonzero angle to an exact pole when cosine rounds to +/-1. The pole fallback
then removes real radial or tangential terms, including an entire degree-90,
order-2 field at the reviewed near-pole point. This is not an exact-pole failure:
the independent exact-pole gates pass for every degree 0 through 90.

For a unit zonal coefficient at the photosphere, `theta=1e-8`, `r_ss=2.51`:

| Degree | Streaming Btheta | Independent polynomial Btheta |
| --- | --- | --- |
| 15 | 0 | 7.499999999994082e-8 |
| 64 | 0 | 3.2000000000000043e-7 |
| 90 | 0 | 4.4999999999999966e-7 |

These results were independently reproduced both with SciPy harmonic theta
derivatives and NumPy Legendre-polynomial derivatives. They exceed the existing
near-pole absolute gate of `1e-8`; no tighter threshold was invented here.
There are 32 failing spherical near-pole cases and eight failing public
Cartesian scalar/batch cases, at both poles. The Cartesian wrappers also lose
the nonzero transverse displacement through `acos(z/r)`, so repairing only the
streaming sine computation is not sufficient for the public Cartesian tests.

Loading `b123b7f^` confirmed the degree-15 near-pole defect already existed.
The streaming implementation retains it and extends it to degree 90. Handoff
must distinguish this inherited precision defect from the new finite-domain
regression. The shared lower-degree helper also reconstructs sine from cosine;
coordinate/basis repairs require implementation-owner coordination rather than
concurrent review-agent edits.

## Independent evidence and unchanged numerical gates

The new oracle does not call production Legendre, derivative, azimuthal, or
streaming helpers. SciPy 1.18.0 `sph_harm_y(..., diff_n=1)` supplies complex
orthonormal Condon-Shortley harmonics and analytic angular derivatives. The
explicit conversion multiplier is
`(-1)^m * sqrt(4*pi*(2-delta_m0)/(2*l+1))`. Radial terms are differentiated
directly from the separated PFSS potential, not advanced by the production
radial recurrence. Exact poles use closed-form Schmidt limits; Cartesian
dipoles and the public near-pole zonal checks have separate analytic oracles.

- Every degree 0 through 90 is compared for scalar spherical, broadcast batch,
  and Cartesian batch evaluation using deterministic dense triangular g/h
  coefficients. Photosphere, its next representable radius, interior, the last
  radius below the source surface, and the source surface are included.
- Degree zero returns zero despite a nonzero supplied monopole, matching the
  documented exclusion of monopoles from the PFSS field.
- Exact north/south pole limits pass at every degree, with several azimuths and
  radii. Near-pole offsets are `1e-6`, `1e-8`, and `1e-9` radians, with zonal,
  tesseral, and degree-90 sectoral samples.
- The degree-90 latitude design passes independent SciPy comparisons for orders
  0, 1, 2, 45, 89, and 90, including both endpoint latitudes.
- Empty arrays, noncontiguous inputs, and sizes immediately before/at/after
  chunk boundaries pass the analytic Cartesian dipole oracle.
- Invalid degree and non-finite/subphotospheric source-radius checks pass.
- Existing field gates remain `rtol=1e-11`, `atol=1e-12`. Existing near-pole
  absolute gate remains `1e-8`. No reference artifacts or gates were modified.

## Bounded-memory evidence

Python/NumPy traced evaluation allocations at degree 90:

| Positions | Peak allocated bytes | Returned output bytes |
| --- | --- | --- |
| 1024 | 9,133,176 | 24,576 |
| 8195 | 9,305,608 | 196,680 |

After subtracting necessary returned output, the measured peak increases by
328 bytes, not by harmonic count times total positions. The regression checks
allow at most 2 MiB additional scratch and a 32 MiB total evaluation peak for
these sizes. These are memory checks, not changed scientific tolerances.
The measurements are traced evaluator allocations, not a claim about total
process RSS, cold-response products, startup, or untraced native allocations.

## Commands and actual results

```sh
uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt python -m pytest -q -ra --tb=short \
  backend/tests/test_pfss_streaming_review.py \
  backend/tests/test_pfss_streaming.py \
  backend/tests/test_pfss_spectral.py \
  backend/tests/test_pfss_harmonics.py
```

The final combined run used these same four paths with a small in-memory
pytest reporting plugin to print failure-group counts and memory properties:
**315 passed, 55 failed, zero skipped, zero xfailed, in 4.04 seconds**.
All 62 pre-existing tests in that run passed. The new review file contributes
**253 passes and 55 failures**. Failure groups are:

| Test function | Failures |
| --- | --- |
| `test_near_poles_preserve_resolved_terms_against_scipy` | 32 |
| `test_public_cartesian_near_poles_match_independent_zonal_polynomial` | 8 |
| `test_integer_radius_is_the_same_physical_input_as_float_radius` | 6 |
| `test_nonfinite_colatitude_keeps_existing_fail_closed_contract` | 9 |

This is an intentionally red **evidence-only handoff**, not a green repair
commit. Cicero owns implementation fixes and rerunning these cases. No skips,
xfails, threshold relaxation, or scientific closure are substituted for those
repairs. No full backend, native, field-line observational calibration, or
cold-complete-response validation was run or claimed by this review.
