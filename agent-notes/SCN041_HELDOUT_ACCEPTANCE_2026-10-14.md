# SCN041 held-out reference acceptance and final-gate handoff

Production PFSS source is unchanged since `9a239f0`. Cold-response acceptance
and fail-closed policy are checkpointed separately in
`52f412d955860a5dba7e7d1c1a4623ee3fafec18`; see
`SCN041_COLD_RESPONSE_2026-10-14.md`. This checkpoint changes only comparison
tooling, parser tests, and reports. No raw captures or provenance files owned by
the parent were modified, and no additional network captures were performed.

## Three-epoch full-degree results

All cases use the actual full native NASA degree-90 coefficients, their own
hash-pinned provider field-line product, and RADSS=2.51. Coefficients use the
existing HDU3 transpose and microtesla-to-Gauss conversion. No free angle, sign,
or amplitude fitting, high-corona-only selection, or line subsampling is used.
Every reference line is traced with the unchanged .01-Rs / 600-step settings.
Tangent sampling remains at most five deterministic segments per line.

| Epoch | Lines | Tangent samples | Median deg | p90 deg | Balanced topology | Determinate | Comparison seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 202610121744 baseline | 622 | 3065 | 0.789599 | 5.022380 | 99.814815% | 100% | 9.068538 |
| 202610140814 held out | 626 | 3070 | 0.857377 | 5.800553 | 99.315068% | 100% | 9.375230 |
| 202610142114 held out | 645 | 3179 | 0.794800 | 5.854955 | 99.912892% | 100% | 9.414079 |

Acceptance remains median <=2 degrees, p90 <=10 degrees, balanced topology
>=95%, and determinate fraction >=99%. All three degree-90 comparisons pass.
These comparison timings are not production-response latency measurements;
the separate cold gate includes all production products and transport.

Near-surface samples below 1.2 Rs remain included and are reported separately:

| Epoch | Near-surface samples | Median deg | p90 deg |
| --- | ---: | ---: | ---: |
| 202610121744 | 2509 | 1.131331 | 5.726463 |
| 202610140814 | 2488 | 1.350194 | 6.717441 |
| 202610142114 | 2586 | 1.261204 | 6.527892 |

## Disagreements and failed lower degrees remain visible

- Baseline: two closed-to-open topology errors; maximum tangent error 35.9957 deg.
- 08:14 held out: one open-to-closed error; maximum tangent error 76.4861 deg.
- 21:14 held out: one closed-to-open error; maximum tangent error 59.2495 deg.
- Degree-64 p90 is 11.3683, 12.7875, and 13.1037 deg respectively: all fail 10 deg.
- Degree-15 p90 is 55.5786, 56.3210, and 55.6051 deg respectively: all fail.
- The default degree-15 CLI was rerun with `--require-accuracy` and still exited
  **2**, with `accuracy_budget_passed: false`. It has not become a false green.

These results are not zero-error closure or solar-cycle-wide validation. They
cover three nearby GONG-Z epochs in the provider-native shared frame; they do
not establish an inertial frame transform, observational route provenance, or
empirical WSA-speed calibration. The PFSS-only speed annotation is now scoped
to this comparison instead of repeating an old claim about non-overlapping ACE
windows; the parent's external-model ACE overlap work is neither overwritten
nor treated as PFSS speed calibration.

## One existing parser, now with explicit pinned alternate paths

`backend/tests/solar_reference_comparison.py` retains the existing FITS and
osfls parser. Default calls still require the original hashes and exact baseline
622/10869 counts. Alternate calls require both paths and valid hashes, retain
the provider/model/units/topology checks, and bound line/point counts and exact
record size before array decoding. No second osfls parser was introduced.

The parser tests prove exact baseline parity, valid variable cardinality,
hash rejection, paired-path requirements, truncated-record rejection, bounded
counts, and finite epoch validation. The focused scientific/policy run passed
**528 tests in 3.23 s**, with no skips. Earlier parser/streaming/spectral/oracle
checks passed 38 tests in 0.67 s. The actual alternate-path CLI was also run for
the 08:14 held-out case with `--require-accuracy`; the full comparison reports
were produced through the same `comparison` API.

The independent SciPy `degree_diagnostic()` remains the unchanged baseline
basis oracle. The alternate-epoch entry point below compares the production
evaluator/tracer against independent NASA coefficients and provider traces.

## Exact alternate-epoch CLI and API

After integrating the parent's `ec4e0bb` artifact commit and this comparator
checkpoint, run from the integration worktree:

```sh
export PYTHONPATH=backend:backend/tests PYTHONHASHSEED=0 TZ=UTC
export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1
solar_compare() {
  uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
    python backend/tests/solar_reference_comparison.py "$@"
}
pair=agent-notes/solar-reference-heldout-2026-10-14
solar_compare --degree 90 --require-accuracy \
  --fits "$pair/202610140814.fits" --lines "$pair/202610140814.osfls" \
  --fits-sha256 5a65bf897a8f493abc4c570f8eb2c7cd4ad154e2eabf59ae95e9419afce647fd \
  --lines-sha256 77ac5d4d212d5c65f22c4448ef09f347bf8cc41d7cb596a9b1c91ce30822a2e8 \
  --output /tmp/scn041-heldout-0814.json
solar_compare --degree 90 --require-accuracy \
  --fits "$pair/202610142114.fits" --lines "$pair/202610142114.osfls" \
  --fits-sha256 de1f6c5f22b04ee7c8e71bb8ea7980e0fe821c59c33fe2bf2bc0dba0e6fed289 \
  --lines-sha256 be60933db93075dbe99e83d5e13abeb07e445222d44195b755706505727a1c15 \
  --output /tmp/scn041-heldout-2114.json
```

API: `comparison(degree=90, fits_path=..., lines_path=..., fits_sha256=...,
lines_sha256=...)`. For parsing only, use `load_reference` with the same four
path/hash arguments and no `degree`. Original no-argument APIs remain valid.
The CLI defaults to degree 15, intentionally retaining the known failing gate.

Our runs used the preserved `/tmp/solar-scn041-heldout-<epoch>.fits/.osfls`
copies with these same verified hashes. Parent commit `ec4e0bb` owns the
byte-identical repository artifacts, fresh GET headers, URLs, and provenance
manifest under `agent-notes/solar-reference-heldout-2026-10-14`.

## Final scientific manifest/gate: still required, parent-owned

- Manifest: `ci/r3-r4-science-verification.json`.
- Entrypoint: `scripts/ci/verify_r3_r4.py`.
- Exact environment pins: `ci/r3-r4-requirements.txt`.
- Lane documentation: `scripts/ci/README.md`.

The old manifest binding at `b0b103024fe320e35574757bbbd275880d7c6d80`
predates the settled streaming source. Rebind and review on the final integrated
commit, including the new `backend/sim/pfss_evaluation.py` import path and
`backend/sim/pfss_magnetogram.py`. Review mutation application and reachability,
not merely source hashes. Then rerun all **six baseline nodes and six mutants**:

```sh
uv run --python 3.12.13 --with-requirements ci/r3-r4-requirements.txt \
  python scripts/ci/verify_r3_r4.py --repo . \
  --manifest ci/r3-r4-science-verification.json all
```

The verifier requires tracked clean pinned inputs at the tested HEAD and makes
fresh isolated worktrees/artifacts. This gate was not rebound or rerun by the
solar worker and is explicitly outstanding. Provider/frame binding and any
future observed-route activation also remain separate, fail-closed work.
