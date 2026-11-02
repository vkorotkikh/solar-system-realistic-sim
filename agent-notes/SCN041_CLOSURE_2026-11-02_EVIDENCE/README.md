# SCN-041 corrective investigation — 2026-11-02

**SCN-041 remains open.** This change makes the outstanding scientific limits
reproducible and resolves an input-provenance ambiguity. It adds independently
computed sampling evidence, a matched external-speed comparison, and tested
travel-time assumptions. It does not change production, the existing appearance,
the observed-forcing policy, the pinned acceptance oracle, or any threshold.
No production decomposition replacement is justified by these results.

## Sampling failure is intrinsic to the retained grid

The independent NumPy Legendre Vandermonde gives a degree-90, order-zero condition
number of **5.387597713e9**, corroborating the production rejection at the unchanged
**1e6** limit. Its closest pixel center is 6.0423 degrees from a pole. A unit-norm
coefficient vector has at most **6.45e-10 G** at sampled centers but **4.9523 G** at
the north pole. Accurate numerical inversion cannot supply the missing polar
information. The normalized SciPy basis agrees with the independent order-zero
polynomials to 4.51e-15, and tests compare production and independent bases through
degree/order 90, including both poles.

The polar cell edges are present at ±1 in sine latitude; strip weights sum to 2.
Removing the monopole still gives condition **1.813687020e9**. Treating samples as
finite-cell averages still gives **1.483968696e9**. Thus a missing monopole treatment,
missing polar weights, or a faulty production harmonic recurrence does not explain
the rejection. Hypothetical *new* sampling is better conditioned: 360 and 720
equal-sine rows give 35,788 and 186.7 respectively; 180 uniform-colatitude rows give
13.44. Interpolation of the existing map is not those new measurements.

This behavior is consistent with the primary analysis by
[Tóth, van der Holst and Huang (2011)](https://arxiv.org/abs/1104.5672), which studies
high-degree PFSS errors on equal-sine-latitude magnetograms. The independent basis
uses SciPy's documented [normalized spherical harmonic convention](https://docs.scipy.org/doc/scipy/reference/generated/scipy.special.sph_harm_y.html),
with the Condon–Shortley phase removed explicitly. No unnormalized high-order
intermediate is used: a first diagnostic implementation with `lpmv` failed at
order 90, and the new independent regression caught that failure before evidence
generation.

The experimental cell-constant boundary is an explicit alternative assumption,
implemented only in the offline diagnostic. It analytically integrates longitude
pixels and integrates complete latitude cells, including the poles. Degree 90 is
retained. It does not invert the ill-conditioned pixel-center design and does not
claim to pass that design's admission gate. Increasing latitude quadrature from
32 to 64 changes coefficients by at most 1.24e-6 G. Against unchanged provider
coefficients, the full degree-90 normalized RMSE is **0.29952**. Against the
unchanged provider-feature oracle it still fails four requirements:

| Requirement | Result | Existing budget |
| --- | ---: | ---: |
| Open-region recall | 0.70393 | ≥0.74 |
| Matched feature cells | 233 | ≥240 |
| Log-expansion correlation | 0.64165 | ≥0.67 |
| Boundary-distance median absolute error | 3.91143 degrees | ≤3.5 degrees |

Therefore this alternative is **not enabled**. The original map remains rejected
at degree 90, and its recorded degree-64/30/15 feature failures remain unchanged.
The independently supplied provider-native spectral model is a separate test;
its success is not map reconstruction.

Full values and unchanged budgets: [sampling-report-v1.json](sampling-report-v1.json).

## Contributor-list identity resolved

The `mrzql261012t1744c2316_079` identifier is a contributor-list product. The
official [NSO/GONG archive](https://gong.nso.edu/data/magmap/QR/zql/202610/mrzql261012/)
serves `mrzql261012t1744c2316_079.lst.gz`; it is not another magnetogram FITS image.
Both the retained **zqs FITS header** and the **WSA FITS header** name this identical
`FILELIST`. The fetched list contains **6059** input paths, exactly the retained
map's `NFILETOT` and `MAPCOUNT` values. Hash-checked bytes and response headers are
included. This establishes a common named contributor list, while differences in
downstream remapping, smoothing, or other provider processing remain unverified.
The historical fixture/oracle is not rewritten to substitute a stronger claim.

## External speed comparison and propagation limits

The original retained NASA forecast has **zero** exact-time overlap with the
retained NOAA ACE observations. A new response to the **identical original query**
provides three matches at 06:00, 12:00 and 18:00 UTC on 2026-10-13. The comparator
selects ACE with quality zero, allows inactive ACE rows because the spacecraft is
explicit, rejects invalid numbers and duplicate times, and never shifts time,
fills nulls, extrapolates, or substitutes another spacecraft.

These three retrospective external-model point residuals have **MAE 97.85 km/s**,
**RMSE 118.98 km/s**, and **bias −97.85 km/s**. They are not application-model
calibration or an accepted forecast-skill result. The input is an ADAPT/GONG
ensemble, not the retained GONG_Z map, and the API does not expose individual map
identity, an issuance timestamp, or temporal aggregation-bin boundaries.

Two separate reproducibility hazards are captured:

- For the identical original query, the Oct 13 00:00 value changed from
  320.236 to 348.394949 km/s between captures.
- A different query starting Oct 13 instead of Oct 10 returns 470.04 km/s for
  that same nominal timestamp. This is query-window sensitivity, distinct from
  the same-query historical change. No favorable query result is selected for
  the comparison.

The [NASA dashboard documentation](https://ccmc.gsfc.nasa.gov/community-tools/WSA-Dashboard/)
limits this speed API to AGONG/AHMI. A captured GONG_Z request returns HTTP 400 and
names those two allowed values. The retained GONG_Z coronal FITS has no speed
plane. Thus the new matched external comparison is useful, but supplies neither
an application speed prediction nor the required matched GONG_Z speed oracle.

The tested ballistic helper computes only `(target_radius - source_radius) / speed`
with explicit km and km/s inputs and rejects invalid domains. At constant speeds
250/400/800 km/s, travel from 2.51 nominal solar radii to exactly 1 AU is
6.845/4.278/2.139 days. These are assumption checks. They are not a target
ephemeris, SCS stage, wind-acceleration or stream-interaction model, time-shift fit,
or independent propagation validation. [NASA's WSA model description](https://ccmc.gsfc.nasa.gov/models/WSA~6/)
distinguishes the PFSS, current-sheet, and outer-boundary wind stages; a PFSS source
surface must not be silently substituted for the outer speed boundary.

Full point pairs and disclosure: [speed-report-v1.json](speed-report-v1.json).
Capture identities, URLs, statuses and hashes:
[new-source-manifest.json](new-source-manifest.json).

## Reproduction and verification

Use Python 3.12.13 and the existing pinned NumPy 2.5.2/SciPy 1.18.0 environment.
These commands run offline after checkout; only the capture step used the network.

```sh
export OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
export PYTHONPATH=backend:backend/tests
uv run --python 3.12.13 --with-requirements ci/r3-r4-requirements.txt \
  python backend/tests/solar_sampling_diagnostic.py --include-alternative-boundary \
  --output /tmp/scn041-sampling-report.json
uv run --python 3.12.13 --with-requirements ci/r3-r4-requirements.txt \
  python backend/tests/solar_wind_comparison.py --output /tmp/scn041-speed-report.json
uv run --python 3.12.13 --with-requirements ci/r3-r4-requirements.txt \
  python -m pytest backend/tests/test_solar_wind_comparison.py \
  backend/tests/test_solar_sampling_diagnostic.py backend/tests/test_pfss_decomposition.py \
  backend/tests/test_solar_external_reference.py backend/tests/test_pfss_observed_route_policy.py \
  backend/tests/test_solar_observational_acceptance.py -q
```

The final targeted verification is in [targeted-tests.log](targeted-tests.log).
Root owns the integrated broad verification. No production scientific-manifest
hash changes are needed: production files and the original oracle are unchanged.

Outstanding closure requirements remain: a scientifically supported map-to-field
path passing the existing feature gates; independent matched application speed
and propagation acceptance with preregistered budgets; SCS/radius/ephemeris and
broader observed/frame evidence. Preserve the current appearance and fail-closed
observed route while these remain unmet.
