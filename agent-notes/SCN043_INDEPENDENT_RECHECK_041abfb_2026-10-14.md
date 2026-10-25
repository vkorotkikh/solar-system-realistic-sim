# SCN043 independent repair recheck: 041abfb

Date: 2026-10-14

## Disposition

The four bounded source-integrity findings F1-F4 are resolved against the
unchanged 22 independent review cases. All 22 pass, with zero skips.
Final signoff remains pending the worker-packaging regression and Herschel's
assigned lazy-initialization followup. This is not a canonical or SCN043 closure.

## Exact scope and revision

- Integrated target: `041abfbfd972b9355d7bb316a90f32131e5a5109`.
- Repair: `95ecbaf454b1ab1f3e73b7a46139da347c84394d`.
- Reviewed only the new repair diff in `src/sim/moonEphemeris.ts` and
  `scripts/generate_s2023_s38_ephemeris.py`.
- Those two files are identical between the repair and integrated target.
- Executed the existing review cases from an exact `git archive` export of the
  integrated target, using the shared installed dependency tree.
- The two review test files and tracked independent native fixture are unchanged
  between review HEAD `76b8086f3f09d7406680fe4ae13a25720ed30a65` and the target.
- The numerical artifacts, pinned inputs, and original native capture compared
  with review baseline `4b55dff10c556572ed06393b9739adcd6c3c07eb` are unchanged.
- No production changes, threshold changes, test edits, source acquisition,
  browser runs, full-suite duplication, or type fixes were made for this recheck.

## Bounded findings

| Finding | Independent acceptance evidence | Result |
| --- | --- | --- |
| F1: erased Daphnis handoffs could activate invalid blending | The original erased-handoff mutation is now rejected. The positive runtime comparison against 212 independently SPK-derived states, including right-hand handoff probes, still passes without changing its limits. | Resolved for the reviewed contract. |
| F2: identity and source qualification were not fail-closed | The original wrong-target, wrong-center, and missing-Daphnis-source-domain mutations are rejected. The valid source-qualified artifacts still load. | Resolved for the reviewed contract. |
| F3: invalid post-selection audit claims were accepted | The original over-budget audit maximum and `usedForFitOrSubdivision: true` mutations are rejected. The pinned audit independence and no-adaptation negative control still pass. | Resolved for the reviewed contract. |
| F4: pinned-source manifest validation accepted contradictory metadata | All four original mutations are rejected: wrong provider center, contradictory requested start epoch, malformed raw-response digest, and unsupported schema version. Offline pinned-source reconstruction remains byte-identical. | Resolved for the reviewed contract. |

The original ten rejection failures were not removed, marked expected failures,
or weakened. They now pass against the repaired production implementation.

## Results

| Check | Result |
| --- | --- |
| Actual-runtime Vitest review | 11 passed, 0 failed, 0 skipped; 92 ms test duration, 272 ms total runner duration. |
| Required-native Python review, SpiceyPy 8.3.0 | 11 passed, 0 failed, 0 skipped; 10.27 s. |
| Machine-checked JSON/JUnit denominators | Exactly 11 runtime plus 11 native cases; zero failures, errors, or skips. |
| Earlier targeted strict TypeScript configuration | Exit 0; no diagnostics. |
| Integrated target project-config strict TypeScript check | Exit 0; no diagnostics. |

The native lane sets `SOLAR_MOON_REVIEW_REQUIRE_NATIVE=1`, requires SpiceyPy
8.3.0, and retains the fixture's structural and byte-for-byte reproduction
assertions against original SPK states. The independent tracked fixture remains
`backend/tests/fixtures/daphnis_independent_spk_review_oracle.json`.

These elapsed times describe correctness runs, not delivery-performance gates.
No quiet-host assumption is made. Host load snapshots are retained in the new
evidence archive; no browser or hardware window was used.

## Exact commands

All commands ran with the assigned review worktree as the explicit working
directory. `SNAPSHOT` is an exact export of the target, not a modified checkout.

```sh
export PATH="/tmp/solar-remediation-toolchain-20261014/node_modules/node/bin:$PATH"
export OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1
RECHECK="$PWD/artifacts/moon-source-independent-recheck-041abfb"
SNAPSHOT="$RECHECK/checkout"
git archive 041abfbfd972b9355d7bb316a90f32131e5a5109 | tar -xf - -C "$SNAPSHOT"
ln -s /home/nomad/ai/projects/worktrees/solar-canonical-remediation-20261014/node_modules "$SNAPSHOT/node_modules"

SOLAR_MOON_REVIEW_EVIDENCE_DIR="$RECHECK/runtime-evidence" \
  node /tmp/solar-remediation-toolchain-20261014/node_modules/npm/bin/npm-cli.js \
  --prefix "$SNAPSHOT" test -- src/sim/moonSourceExceptionIndependentReview.test.ts \
  --reporter=default --reporter=json --outputFile="$RECHECK/runtime-results.json"

SOLAR_MOON_REVIEW_REQUIRE_NATIVE=1 \
SOLAR_MOON_REVIEW_EVIDENCE_DIR="$RECHECK/native-evidence" \
  uv run --offline --python 3.12.13 \
  --with-requirements "$SNAPSHOT/ci/backend-test-requirements.txt" \
  --with spiceypy==8.3.0 python -m pytest \
  "$SNAPSHOT/scripts/test_moon_source_exception_independent_review.py" \
  -q --tb=short --junitxml="$RECHECK/native-results.xml"

# Earlier direct-file configuration, not the project's tsconfig:
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck \
  --target ES2022 --module ESNext --moduleResolution bundler --types node \
  --pretty false "$SNAPSHOT/src/sim/moonSourceExceptionIndependentReview.test.ts"

# Project-config strict check at the integrated target:
node node_modules/typescript/bin/tsc --project "$SNAPSHOT/tsconfig.json" \
  --noEmit --strict --pretty false
```

The two TypeScript commands above both produced no diagnostics. The parent
subsequently attributed Herschel's six earlier diagnostics to missing Node types
in an older worktree, not to this integrated revision. That unprovided older
command was not reproduced, and no purported type fix is proposed.

## Open packaging finding: final signoff withheld

The parent reports its independent build changed the worker from 26.13 kB to
194.02 kB after the new module-level `MOON_IDENTITIES` map in shared
`moonEphemeris.ts` eagerly retained the moon catalog. The parent reports the main
bundle remains substantially unchanged at 969.51 kB / 249.34 kB gzip.
These are parent-provided build measurements, not measurements from this recheck.

Herschel owns the bounded lazy-initialization fix. Acceptance must preserve all
identity, domain, handoff, audit, and pinned-source validation while removing the
worker's eager catalog inclusion. Await the followup checkpoint before final
signoff; do not bulk-promote this result or infer packaging acceptance from the
22 passing scientific-contract cases.

## Qualifications retained

- Daphnis remains explicitly qualified as the legacy SAT393/type-17 source,
  not an independently established contemporary observational solution.
- The fresh audit checks establish disjointness and no adaptive reuse in the
  inspected generation path, not historical preregistration or independent
  observational provenance.
- The historical review had 0/115 original raw JSON cache envelopes available
  for rehashing. Retained normalized data, headers, queries, and chunk hashes do
  not close that raw-envelope limitation; this recheck does not claim otherwise.
- The S2023S38 hyperbolic-epoch test establishes the pinned Cartesian state and
  positive osculating energy at that epoch, not permanent escape.
- Historical reports and raw evidence are preserved unchanged. Parent full-suite
  results are not added to this recheck's 22-case denominator.

## Evidence

New raw results, logs, exit codes, runtime/native evidence, revision marker, and
host snapshots are archived in
`agent-notes/SCN043-independent-recheck-041abfb-2026-10-14/evidence.tar.gz`.
Its sibling `SHA256SUMS` records the archive digest. The archive excludes the
temporary exported checkout and dependency symlink.
