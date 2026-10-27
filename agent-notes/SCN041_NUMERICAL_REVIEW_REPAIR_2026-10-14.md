# SCN041 numerical review repair: validated azimuth correction, ready for integration

Review commit `294768281a0fffb8670c3ed12042cf0157962402` was cherry-picked
unchanged as `5247e4b99f4ebfe2a39e168043ec74a9a29b093d`. No reviewer tests,
tolerances, skips, or reference artifacts were modified.

## Requested corrections in the pending implementation patch

Only `backend/sim/pfss_evaluation.py` and
`backend/sim/pfss_magnetogram.py` contain implementation changes:

- Coerce numerical coordinates to floating-point arrays before broadcasting and
  scratch allocation, so integer radius 1 and floating radius 1.0 are equivalent.
- Reject non-finite colatitudes and azimuths before broadcasting or recurrence
  instead of propagating NaNs.
- Preserve sine from the supplied theta, rather than reconstructing it from a
  rounded cosine. Only exact theta endpoints use exact-pole limits.
- Use `atan2(hypot(x,y), z)` in scalar and batch Cartesian conversions so a
  resolved transverse displacement is not discarded by `acos(z/r)`.
- Route scalar field evaluation through the same streaming recurrence as batch
  evaluation, including lower degrees, to preserve near-pole terms consistently.

The latitude-design helper still accepts mu-only grid coordinates; it has no
additional theta information to preserve and was not changed. Scientific
normalization, source-surface factors, degree caps, and acceptance limits were
not changed. No server, endpoint, time, AIA, controller, or manifest edits.

## Inherited validation of the prepared repair (2026-10-14)

- Reproduced review baseline: **315 passed, 55 failed**, 4.20 s.
- After the three requested repairs, identical review/existing four-file run:
  **370 passed**, 4.04 s, no skips or tolerance changes.
- Full `backend/tests`: **2712 passed**, no skips, 109.06 s. The only warnings
  were the two existing Starlette/httpx dependency deprecations.
- The unchanged review memory assertions passed: less than 32 MiB traced
  evaluation allocation, with at most 2 MiB additional output-adjusted scratch
  between one chunk and eight chunks. This is not a process RSS threshold.

Logs are preserved at `/tmp/solar-scn041-review-before.log`,
`/tmp/solar-scn041-review-after.log`, and
`/tmp/solar-scn041-reviewed-full-backend.log`.

## Inherited reference and cold-response regressions (2026-10-14)

All complete reference comparisons passed the original scientific thresholds:

| Epoch | All reference lines | Median / p90, degrees | Balanced topology | Determinate | Seconds |
| --- | ---: | --- | ---: | ---: | ---: |
| 202610121744 | 622 | 0.789599 / 5.022380 | 99.814815% | 100% | 8.935598 |
| 202610140814 | 626 | 0.857377 / 5.800553 | 99.315068% | 100% | 9.121091 |
| 202610142114 | 645 | 0.794800 / 5.854955 | 99.912892% | 100% | 9.326965 |

Full cold native-boundary response reruns also passed without changing limits:

| Fidelity | Display lines | Complete response seconds | Wire bytes | Peak child RSS KiB |
| --- | ---: | ---: | ---: | ---: |
| High | 120 | 12.099855 | 860804 | 89452 |
| Ultra | 180 | 12.245886 | 1107342 | 90904 |

The actual configured deadline remains 18 s, below the unchanged 19 s hard
ceiling. The wire cap remains 2097152 bytes, WSA grid 36x72, and evaluation
chunk bound 1024 positions. Both workers were reaped cleanly. No concurrent
parent suite was reported for these reruns; load averages are captured, not
claimed to prove exclusive CPU access. Native fixture injection remains a
numerical integration test, not activation of the guarded observed route.

New JSON evidence preserves earlier results rather than overwriting them:

- `solar-reference-2026-10-14/production-degree90-reviewed-baseline-202610121744.json`
- `solar-reference-2026-10-14/production-degree90-reviewed-heldout-202610140814.json`
- `solar-reference-2026-10-14/production-degree90-reviewed-heldout-202610142114.json`
- `solar-reference-2026-10-14/cold-degree90-reviewed-high.json`
- `solar-reference-2026-10-14/cold-degree90-reviewed-ultra.json`

## Authorized azimuth correction and fresh validation (2026-10-15)

The user approved closing the adjacent compatibility issue. Before the final
correction, scalar calls with positive infinite phi returned three NaNs at
degrees 1, 15, 64, and 90. The prepared scalar-path unification had extended
this gap to degrees where the old scalar loop raised `ValueError`.

The additional production change is a finite-azimuth check in
`StreamingPFSS.evaluate`, immediately after the existing finite-colatitude
check and before broadcasting. This common entry handles direct streaming,
public scalar evaluation, and the batch spherical entry. It also rejects an
invalid scalar phi when other inputs would broadcast to an empty result.
The prepared float-dtype, stable sine recurrence, exact-pole handling, scalar
delegation, and Cartesian atan2 repairs are preserved. Recurrence coefficients,
Fourier extraction scaling, and source-surface factors are unchanged by this
final correction.

New coverage is isolated in `backend/tests/test_pfss_azimuth_validation.py`:

- Reject NaN and both infinities at degrees 0, 1, 15, 64, and 90.
- Exercise public scalar, batch spherical, and direct streaming entry points.
- Cover scalar, mixed, broadcast, later-chunk, and empty-output inputs.
- Require rejection before NumPy invalid arithmetic occurs.
- Check valid negative and unwrapped finite azimuths against an analytic dipole.

The 213 new cases were run first from a temporary test file against the
uncorrected prepared production source, then installed unchanged in the
repository with the two-line validation repair. No existing tests, skips,
fixtures, or tolerance budgets were changed.

| Fresh run | Result | Seconds |
| --- | --- | ---: |
| New azimuth cases before correction | 165 failed, 48 passed | 0.97 |
| Existing four-file PFSS suite before correction | 647 passed | 7.59 |
| Same suite plus new azimuth cases after correction | 860 passed | 7.47 |
| Full backend suite after correction | 2925 passed, 2 warnings | 98.40 |

The full backend run had no failures or skips. Its two existing dependency
warnings concern Starlette's deprecated httpx integration and AnyIO's deprecated
BlockingPortal alias. The review memory and accuracy assertions passed without
modification as part of the focused and full runs.

Commands were run from this worktree using Python 3.12.13 and the pinned
`ci/backend-test-requirements.txt` environment:

```bash
uv run --no-project --python 3.12 --with-requirements ci/backend-test-requirements.txt python -m pytest \
  backend/tests/test_pfss_streaming_review.py \
  backend/tests/test_pfss_streaming.py \
  backend/tests/test_pfss_harmonics.py \
  backend/tests/test_pfss_analytic_fields.py \
  backend/tests/test_pfss_azimuth_validation.py -q
uv run --no-project --python 3.12 --with-requirements ci/backend-test-requirements.txt python -m pytest backend/tests -q
```

Fresh logs are in `/tmp/solar-scn041-azimuth-V9DraS/`: `azimuth-before.log`,
`scoped-before.log`, `scoped-after.log`, and `backend-after.log`.

## Fresh reference and cold-response proof (2026-10-15)

All three complete degree-90 comparisons were rerun with `--require-accuracy`.
The original budgets remain median tangent error <= 2 degrees, p90 <= 10 degrees,
balanced topology accuracy >= 0.95, and determinate fraction >= 0.99.

| Epoch | All reference lines | Median / p90, degrees | Balanced topology | Determinate |
| --- | ---: | --- | ---: | ---: |
| 202610121744 | 622 | 0.789599 / 5.022380 | 99.814815% | 100% |
| 202610140814 | 626 | 0.857377 / 5.800553 | 99.315068% | 100% |
| 202610142114 | 645 | 0.794800 / 5.854955 | 99.912892% | 100% |

The held-out FITS and line inputs were read from
`/home/nomad/ai/projects/repositories/solar-system-realistic-sim/agent-notes/solar-reference-heldout-2026-10-14/`.
Their SHA-256 values matched the inherited review evidence and were passed
explicitly as `--fits-sha256` and `--lines-sha256`. The final JSON files retain
these hashes. No datasets were altered or added by this repair.

Cold responses were run sequentially after the full backend suite and reference
comparisons, with the production process, wire, and response contracts:

| Fidelity | Display lines | Complete response seconds | Wire bytes | Peak child RSS KiB |
| --- | ---: | ---: | ---: | ---: |
| High | 120 | 12.251215 | 860806 | 89412 |
| Ultra | 180 | 12.220302 | 1107342 | 90800 |

Both `budget_passed` flags are true. The configured deadline is still 18 s,
below the unchanged 19 s hard ceiling. The wire cap remains 2097152 bytes,
the WSA grid 36x72, and the evaluation chunk bound 1024 positions. Both workers
were reaped cleanly. The reports record load averages; they do not establish
exclusive CPU access. RSS is reported, not treated as a configured acceptance
cap. These native-fixture checks do not enable the guarded observed route.

The first cold invocation omitted `PYTHONPATH` and stopped before evaluation
with `ModuleNotFoundError: No module named 'server'`. It is preserved in
`cold-high.log`. The corrected High and Ultra invocations used
`PYTHONPATH=backend:backend/tests` and passed; their logs are
`cold-high-corrected.log` and `cold-ultra.log`. No source change or relaxed
limit was needed for this invocation error.

New final evidence accompanies this report under
`agent-notes/solar-reference-2026-10-14/`:

- `production-degree90-azimuth-final-baseline-202610121744.json`
- `production-degree90-azimuth-final-heldout-202610140814.json`
- `production-degree90-azimuth-final-heldout-202610142114.json`
- `cold-degree90-azimuth-final-high.json`
- `cold-degree90-azimuth-final-ultra.json`

The five preexisting reviewed JSON files are preserved unchanged and unstaged.
No post-edit production or test source rereads were performed. Whitespace
validation uses `git diff --check`; the scoped commit contains only the owned
production repair, new azimuth tests, this report, and the five final evidence
files.

## Integration boundary

This is an integration-ready local numerical repair, not a resolved-in-main
claim. The independent scientific gate remains the parent's responsibility.
The parent is extending the required immutable oracle through public
`PFSSField.evaluate_cartesian_batch` for its 135 physical nonmonopole modes
(136 fixture modes including the monopole), preserving the fixture and its
5e-13 value / 1e-8 derivative caps, retargeting three mutation patches, binding
the final source, and running all six baseline nodes and six mutants.

This worktree does not modify the harmonic tests, scientific manifest, mutation
patches, or global tracker. No push, fetch, rebase, or main-branch merge was
performed. Observed-forcing guards remain unchanged and fail-closed.
