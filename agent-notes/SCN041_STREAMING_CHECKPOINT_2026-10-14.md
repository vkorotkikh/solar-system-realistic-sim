# SCN041 streaming solver checkpoint

Scope: PFSS solver, tests, and this report only. No main/controller, forcing
guards, response/time limits, canonical tracker, or live-data cache changes.

## Implementation

- Real Schmidt/no-Condon-Shortley recurrence streams degree/order evaluation
  through degree 90, with 1024-position scratch-buffer chunks. No interpolation,
  free rotation, sign/amplitude fit, or high-degree truncation is introduced.
- Display field lines use the existing batched three-state RK4 tracer instead
  of separate scalar integrations. Indeterminate remains distinct from closed.
- Latitude decomposition retains one order's design matrix at a time and
  obtains the conditioning check from the least-squares singular values,
  avoiding a second SVD. The original 1e6 conditioning limit is unchanged.
- Explicit `compute_pfss_from_coefficients` accepts native spectral boundaries
  through degree 90 and uses the same production tracing/WSA product builder.
  Input convention and source-surface radius are explicit. Output does not
  confer observed-frame or observational geometry validation. No global cache.
- The existing sampled-grid config still caps at degree 15. In particular,
  degree-90 fitting of the 180-row equal-area input remains ill-conditioned;
  native spectral input must not be confused with an adequately resolved grid.

## Measurements before checkpoint

One pinned NASA epoch, 2026-10-12T17:44, native full 90 coefficients, RADSS=2.51:

| Measurement | Result |
| --- | ---: |
| 3065 tangent evaluation positions | 0.1132 s |
| Production-size 120 display lines | 2.5178 s |
| Production-size 36x72 WSA grid | 10.2145 s |
| All 622 reference seeds, step .01/max 600 | 9.3079 s |
| Tangent median | 0.7895985005 deg |
| Tangent p90 | 5.0223799243 deg |
| Balanced topology accuracy | 99.8148148148% |
| Determinate reference traces | 100% |

The original acceptance limits remain median <=2 deg, p90 <=10 deg,
balanced topology >=95%, determinate >=99%. The two topology errors are
closed-to-open; all 82 observed-open reference lines agree. Photospheric and
near-surface samples are retained. The older degree-15 comparison still fails;
it has not been relabeled or replaced with a high-corona-only result.

A pre-change real high-fidelity worker profile was 14.4536 s under cProfile:
9.255 s display tracing, 4.743 s WSA; 32.48 million function calls. That profile
used the old degree-15 synthetic runtime, not the native degree-90 boundary.

Focused numerical, analytic, harmonic, tracing, and finite-policy tests after
the recurrence/decomposition changes: 490 passed in 3.03 s.

The full backend run then completed with 2387 passed, one failed, and two
existing dependency deprecation warnings in 89.35 s. The sole failure was in
the new spectral-entry-point test: it referred to `field.rss` rather than the
existing `field.r_ss` attribute. That assertion is corrected in this checkpoint.
The subsequent focused run, including both new test modules and the independent
degree diagnostic, passed all 512 tests in 3.23 s. The full suite was not rerun
after that test-only correction; no full post-correction pass is claimed.

Committed reference measurements are in
`solar-reference-2026-10-14/production-degree90-streaming-checkpoint.json`.

## Remaining gates (not claimed complete)

- Cold complete production response, including startup, decoding, all model
  products, and envelope serialization, must pass the unchanged 19 s worker
  limit and existing byte cap. Component timings alone are not that gate.
- The spectral solver is a production numerical entry point, not permission to
  enable the currently guarded observed-forcing HTTP route. Provider/provenance
  binding and full response integration remain separate acceptance concerns.
- Two additional raw NASA map/line pairs were captured to `/tmp`; parent owns
  their provenance sidecars/artifact integration. Held-out accuracy is pending.
- Independent degree-90 SciPy diagnostic remains unchanged as the basis oracle.

## Acquisition handoff (parent owns further capture/provenance)

Exact existing baseline URLs:

```text
https://iswa.ccmc.gsfc.nasa.gov/iswa_data_tree/model/solar/WSA6/R5.0/WSA_OUT/GONG_Z/2026/10/wsa_202610121744R000_gongz.fits
https://iswa.ccmc.gsfc.nasa.gov/iswa_data_tree/model/solar/WSA6/fieldlines/GONG_Z/trace_pfss_intoout/2026/10/2026-10-12T17-44-00.000.osfls
```

Templates:

```text
https://iswa.ccmc.gsfc.nasa.gov/iswa_data_tree/model/solar/WSA6/R5.0/WSA_OUT/GONG_Z/<YYYY>/<MM>/wsa_<YYYYMMDDHHMM>R000_gongz.fits
https://iswa.ccmc.gsfc.nasa.gov/iswa_data_tree/model/solar/WSA6/fieldlines/GONG_Z/trace_pfss_intoout/<YYYY>/<MM>/<YYYY-MM-DDTHH-MM-00.000>.osfls
```

Known epoch listing is an HTTP directory index, not a separate API:

```text
https://iswa.ccmc.gsfc.nasa.gov/iswa_data_tree/model/solar/WSA6/R5.0/WSA_OUT/GONG_Z/2026/10/
```

Already captured raw pairs, preserved in `/tmp` without response headers:

| Raw path | SHA-256 |
| --- | --- |
| `/tmp/solar-scn041-heldout-202610140814.fits` | `5a65bf897a8f493abc4c570f8eb2c7cd4ad154e2eabf59ae95e9419afce647fd` |
| `/tmp/solar-scn041-heldout-202610140814.osfls` | `77ac5d4d212d5c65f22c4448ef09f347bf8cc41d7cb596a9b1c91ce30822a2e8` |
| `/tmp/solar-scn041-heldout-202610142114.fits` | `de1f6c5f22b04ee7c8e71bb8ea7980e0fe821c59c33fe2bf2bc0dba0e6fed289` |
| `/tmp/solar-scn041-heldout-202610142114.osfls` | `be60933db93075dbe99e83d5e13abeb07e445222d44195b755706505727a1c15` |

Preserved experiment outputs include `/tmp/solar-scn041-before.prof`,
`/tmp/solar-scn041-production90-reference.json`,
`/tmp/solar-scn041-streaming-tests.log`, and
`/tmp/solar-scn041-checkpoint-backend.log`. No captures or experiments were
removed, and no files owned by the other remediation agents were edited.
