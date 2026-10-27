# SCN043 independent-review fixture integration follow-up

This follow-up corrects test infrastructure only, following review commit
`6c5b0cc09f3aa62bbe9831d5cb92da638e50d749`. Production source remains the reviewed
`4b55dff10c556572ed06393b9739adcd6c3c07eb`; no Herschel repairs are included here.
All ten scientific-integrity rejection assertions remain unchanged and failing.
The original findings report, summary, archive, and raw evidence are preserved.

## Independently derived tracked fixture

Exact path for Herschel:

```text
backend/tests/fixtures/daphnis_independent_spk_review_oracle.json
```

The fixture contains the original review's 212 direct-SPK states: 192 deterministic
fresh random epochs plus exact endpoints and native-handoff probes. It was copied
from the previously captured independent oracle, not derived from a fitted
production artifact. Its metadata identifies direct SPKPVN evaluation, SpiceyPy
8.3.0, native descriptor coverage, both measured source jumps, and the source
kernel SHA-256.

- Fixture SHA-256:
  `fc90ab19770f4c0a703f16d2403c8e401a5dfa1ec2c9afd8412bb151c55d5d87`.
- Original embedded SAT393 kernel SHA-256:
  `8b21b3b68e5603006b67cb02197d789afa2e04925c3495363ac16fe180be2e08`.
- Original embedded kernel size: 9,216 bytes.

The Python native-descriptor test now independently regenerates the oracle from
those original kernel bytes, asserts all 212 states and metadata are structurally
equal to the tracked fixture, and asserts exact UTF-8 JSON byte equality. It also
binds the fixture source hash to the embedded kernel and verifies the 192 fresh
random-epoch denominator. The original qualification and native-jump assertions
remain in that test.

Vitest now reads this tracked fixture directly in both native comparison and
erased-handoff reproduction. It never needs
`artifacts/moon-source-independent-review/native-oracle.json` or a Python-first
run, and does not generate an oracle from the production model.

## Explicit optional and required native lanes

Without `SOLAR_MOON_REVIEW_REQUIRE_NATIVE=1`, absence of SpiceyPy produces an explicit
`pytest.importorskip` module skip, with the reason that it is not a scientific pass.
With `SOLAR_MOON_REVIEW_REQUIRE_NATIVE=1`, SpiceyPy is required: absence raises a
collection error rather than silently skipping the review.

Both Python and Vitest accept `SOLAR_MOON_REVIEW_EVIDENCE_DIR` for a separate output
directory. This follow-up used a new directory so previous raw results were not
overwritten. This setting changes only review evidence destinations, not inputs,
scientific thresholds, runtime behavior, or assertions.

Required native command, from the assigned review worktree:

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 \
SOLAR_MOON_REVIEW_REQUIRE_NATIVE=1 \
SOLAR_MOON_REVIEW_EVIDENCE_DIR="$PWD/artifacts/moon-source-independent-review-fixture-followup/native-evidence" \
uv run --offline --python 3.12.13 \
  --with-requirements ci/backend-test-requirements.txt --with spiceypy==8.3.0 \
  python -m pytest scripts/test_moon_source_exception_independent_review.py \
  -q --tb=short \
  --junitxml=artifacts/moon-source-independent-review-fixture-followup/native-results.xml
```

The required run's JUnit results were explicitly checked for 11 tests, 4 failures,
0 errors, and **0 skips**. A native run with any skip must not be reported as this
full independent review.

## Validation performed

| Check | Actual result |
| --- | --- |
| Fresh tracked-tree export, Vitest before any Python execution in that export | **5 passed, 6 failed, 0 skipped**, exit 1; 255 ms Vitest duration |
| Required full native review, including committed-fixture byte/structural reproduction | **7 passed, 4 failed, 0 skipped**, exit 1; 10.33 s |
| Optional-native collection without SpiceyPy, alongside the existing non-native candidate-input module | 3 existing tests collected, **1 explicit native-module skip**, no collection errors, exit 0; collection only, not a numerical pass |
| Required-native collection without SpiceyPy | Refused with `ModuleNotFoundError`, exit 2; expected missing-dependency negative control, not a scientific test failure or pass |
| Targeted strict TypeScript check | Exit 0, no diagnostics |

The fresh export was produced from the staged tracked tree with `git archive`.
Only the dependency directory was linked in. The ignored Python-generated oracle
path was verified absent before and after Vitest. All five real-source/runtime
checks executed successfully there, including the 212 original-SPK states and
6,891 pinned S2023_S38 audit vectors. The six parser rejection failures were
preserved. No browser was started.

The four Python provenance rejections and six TypeScript parser rejections are
the same live failures from the original review. None was converted to an expected
failure, removed, weakened, or counted as a pass. They remain for Herschel's
bounded production repair.

## Paths and evidence

Changed test files:

```text
scripts/test_moon_source_exception_independent_review.py
src/sim/moonSourceExceptionIndependentReview.test.ts
```

New tracked fixture: the exact path above. This follow-up report and
`SCN043-independent-fixture-followup-2026-10-14/evidence.tar.gz` contain the new
integration evidence. The archive excludes the disposable checkout export but
includes its staged-tree ID, test reports, native reproduction outputs, and
collection-control logs.

Historical evidence archive SHA-256 remains
`27cd1f12b1302ca01b05640d321137ec614c6bf61d338b9cf18a335b3fe83632`.
There are no production, generator, tolerance, canonical tracker, or historical
report changes, and no new gate-closure claim.
