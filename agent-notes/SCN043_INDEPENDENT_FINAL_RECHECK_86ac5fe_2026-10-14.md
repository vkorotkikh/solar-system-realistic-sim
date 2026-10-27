# SCN043 bounded independent final recheck

Date: 2026-10-14

## Findings and disposition

No unresolved findings remain in the bounded F1-F4 repair and lazy-initialization
followup reviewed here. The unchanged 22 independent cases pass with zero skips.
The worker-packaging regression is resolved in an independent paired build on the
repair branch; the parent separately confirms restoration on its integrated base.

This signs off only the four reviewed defects and their packaging followup.
It does not authorize bulk promotion, field-name changes, canonical closure,
changed scientific tolerances, or any claim that all repository gates pass.

| Finding | Final bounded disposition |
| --- | --- |
| F1: erased Daphnis handoffs enabled invalid blending | Resolved. The unchanged erased-handoff rejection and 212 original-SPK-derived runtime state checks pass, including right-hand boundary probes. |
| F2: identity/source qualification was not fail-closed | Resolved. Wrong target, wrong center, and missing legacy source-domain mutations are rejected; valid qualified artifacts still load. |
| F3: invalid post-selection audit claims were accepted | Resolved. Over-budget and reused-for-selection audit mutations are rejected; disjointness and the no-adaptation negative control remain passing. |
| F4: contradictory pinned-source metadata was accepted | Resolved. All four original manifest mutations are rejected; offline pinned-source reconstruction remains byte-identical. |
| Eager worker catalog inclusion | Resolved within the reviewed change. Cached identity-map construction now occurs only through the parser, not at module evaluation; propagation-only worker output drops from 194,845 to 26,961 bytes on the same branch. |

All ten original rejection failures remain unchanged tests. None were deleted,
weakened, skipped, or reclassified as expected failures.

## Revisions and scope

- Scientific repair: `95ecbaf454b1ab1f3e73b7a46139da347c84394d`.
- Lazy-map followup: `86ac5fe0bad35d5bed4a2a18df82cfc6d453d6f6`.
- The followup's immediate parent is exactly the scientific repair above.
- Integrated parent: `4f2e2507797eb73d50443711df433e10032cc3fd`.
- Reviewed the new scientific repair diff only in
  `src/sim/moonEphemeris.ts` and `scripts/generate_s2023_s38_ephemeris.py`, then
  the followup's sole-file diff in `src/sim/moonEphemeris.ts`.
- The followup replaces module-level map construction with a cached lookup
  invoked at the existing parser validation site. It changes neither the
  validation predicates nor artifact fields or numerical logic.
- Both production files, both independent review test files, and the tracked
  native oracle are identical between `86ac5fe` and integrated `4f2e250`.
- Review cases, independent fixture, and Python generator are unchanged between
  `041abfb` and `86ac5fe`. Numerical artifact preservation was established in
  the preceding `041abfb` recheck; the followup changes only the parser file.
- No production edits, test edits, threshold changes, source acquisition,
  browsers, unrelated source review, or promotion were performed.

## Independent results

Tests and builds used exact `git archive` exports, with the same installed
dependency tree linked into both build roots.

| Check at 86ac5fe | Result |
| --- | --- |
| Actual-runtime independent Vitest cases | 11 passed, 0 failed, 0 skipped; 77 ms test duration, 240 ms total runner duration. |
| Required-native independent Python cases, SpiceyPy 8.3.0 | 11 passed, 0 failed, 0 skipped; 10.43 s. |
| Machine-checked JSON/JUnit denominators | Exactly 11 runtime plus 11 native cases; zero failures, errors, or skips. |
| Targeted strict check with explicit Node types | Exit 0; no diagnostics. |
| Old-base whole-project strict check | Exit 2; 223 diagnostics, preserved in full. This is not a pass. |
| Production Vite build at 95ecbaf | Exit 0; 1.41 s. |
| Production Vite build at 86ac5fe | Exit 0; 1.42 s. |

The mandatory-native lane sets `SOLAR_MOON_REVIEW_REQUIRE_NATIVE=1`. The tracked
fixture `backend/tests/fixtures/daphnis_independent_spk_review_oracle.json`
is reproduced structurally and byte-for-byte from the original SPK, not from the
production model. These are the same 22 cases as the earlier checkpoint, not
44 different cases or a broader suite claim.

Independent paired worker outputs:

| Revision | Emitted worker | Exact bytes | SHA-256 |
| --- | --- | ---: | --- |
| 95ecbaf | `modelWorker-B0VwM5S7.js` | 194845 | `9cf764237c72e55e9f832b9adb9d8bff309eb2bdfc7b08e3edc8274950e339d6` |
| 86ac5fe | `modelWorker-DC7iGepg.js` | 26961 | `77779dde28aeff44933cc0570033ce69d90813a933ad5ebebc1dd1ed02492304` |

The two emitted workers are preserved in the evidence archive. Both builds
retained Vite's ordinary greater-than-500-kB chunk warning; no warning threshold
was changed. Shared-host elapsed times are not quiet-window performance gates.
Host load snapshots are archived; no browser or hardware window was used.

## Exact commands and strict-check distinction

Working directory for every command:
`/home/nomad/ai/projects/worktrees/solar-remediation-20261014-moon-source-review`.

```sh
export PATH="/tmp/solar-remediation-toolchain-20261014/node_modules/node/bin:$PATH"
export OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1
RECHECK="$PWD/artifacts/moon-source-independent-recheck-86ac5fe"
SNAPSHOT="$RECHECK/checkout"
BEFORE="$RECHECK/checkout-before"
# SNAPSHOT is the exact 86ac5fe export; BEFORE is its exact parent, 95ecbaf.

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

# Exit 2 on the older repair-branch whole-project configuration:
node node_modules/typescript/bin/tsc --project "$SNAPSHOT/tsconfig.json" \
  --noEmit --strict --pretty false

# Exit 0, targeted review file, explicit Node types, no project config:
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck \
  --target ES2022 --module ESNext --moduleResolution bundler --types node \
  --pretty false "$SNAPSHOT/src/sim/moonSourceExceptionIndependentReview.test.ts"

node node_modules/vite/bin/vite.js build "$BEFORE" --outDir "$RECHECK/build-before"
node node_modules/vite/bin/vite.js build "$SNAPSHOT" --outDir "$RECHECK/build-after"
```

The old-base whole-project check produced 223 diagnostics: 217 in six unrelated
production files, plus six missing-Node-declaration errors in the review test.
The six review errors are exactly:

```text
src/sim/moonSourceExceptionIndependentReview.test.ts(2,28): TS2307: Cannot find module 'node:crypto' or its corresponding type declarations.
src/sim/moonSourceExceptionIndependentReview.test.ts(3,56): TS2307: Cannot find module 'node:fs' or its corresponding type declarations.
src/sim/moonSourceExceptionIndependentReview.test.ts(4,31): TS2307: Cannot find module 'node:url' or its corresponding type declarations.
src/sim/moonSourceExceptionIndependentReview.test.ts(5,25): TS2307: Cannot find module 'node:path' or its corresponding type declarations.
src/sim/moonSourceExceptionIndependentReview.test.ts(6,28): TS2307: Cannot find module 'node:zlib' or its corresponding type declarations.
src/sim/moonSourceExceptionIndependentReview.test.ts(12,32): TS2591: Cannot find name 'process'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
```

The unabridged diagnostic output is retained as
`agent-notes/SCN043-independent-recheck-86ac5fe-2026-10-14/project-typecheck-old-base.log`.
The archive includes per-file and per-code counts. No unrelated files were
inspected or fixed. The earlier independent project-config check at integrated
`041abfb` exited 0; the parent reports the same at `4f2e250`. Neither result
converts the older branch's exit 2 into a pass or proves the unprovided earlier
ratchet command was identical to this command.

## Parent-observed integration results, not independently rerun here

At `4f2e250`, the parent reports:

- Worker restored to 26.13 kB, `modelWorker-DYAkMz1r.js`.
- Main bundle 969.46 kB / 249.33 kB gzip, `index-C1cPtVdP.js`, matching the
  pre-regression integration output.
- Full frontend: 723 passed, 411 skipped. Skips are not passes.
- Default full strict TypeScript: exit 0. Production build: 1.53 s.
- Full backend including CI/script tests still running when this report was
  prepared; 55 known PFSS red cases remained pending owner approval.

The independent old-base worker size and the parent-observed integrated worker
size refer to different whole-repository revisions. They are intentionally not
presented as the same build or the same byte count. Backend/PFSS issues remain
outside this review and are not closed here.

## Evidence and retained qualifications

- Initial repair checkpoint:
  `agent-notes/SCN043_INDEPENDENT_RECHECK_041abfb_2026-10-14.md` and
  `agent-notes/SCN043-independent-recheck-041abfb-2026-10-14/evidence.tar.gz`.
- Final followup evidence:
  `agent-notes/SCN043-independent-recheck-86ac5fe-2026-10-14/evidence.tar.gz`.
  It contains raw logs/results, exit codes, host snapshots, scoped parent
  comparison, typecheck diagnostic counts, and both emitted workers. Sibling
  `SHA256SUMS` files record archive digests.
- Daphnis remains the explicitly qualified legacy SAT393/type-17 source.
  Passing numerical checks do not establish a contemporary observational model.
- Fresh audit disjointness and no-adaptation checks do not establish historical
  preregistration or independent observational provenance.
- The historical raw-envelope limitation remains: original cache envelopes
  available for rehashing were 0/115. Normalized pinned values, retained headers,
  query checks, and raw-digest syntax validation do not close that limitation.
- The S2023S38 hyperbolic-epoch Cartesian check does not claim permanent escape.
- Historical failures, reports, and raw evidence remain unchanged. This commit
  adds reports/evidence only; no production or test changes are included.
