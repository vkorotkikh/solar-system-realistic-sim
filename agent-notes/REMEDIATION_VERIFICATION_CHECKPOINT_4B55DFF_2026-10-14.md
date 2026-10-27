# Canonical remediation checkpoint: 4b55dff

Date: 2026-10-14. Construction branch: `remediation/canonical-register-20261014`.
This is local integration evidence, not evidence of merge or deployment to `main`.

## Integrated work

- `b072d32`: frame/socket ownership guards and stale callback regressions.
- `6d92ad8`, `e6c75ce`: independently checked Daphnis and S2023_S38 source
  exceptions, pinned inputs, offline reproduction, runtime validation, and handoff.
- `c439f68`: degree-90 cold-worker acceptance and observed-route fail-closed tests.
- `c8e7038`: hash-pinned, held-out NASA PFSS comparisons using the shared parser.
- `4b55dff`: independent streaming PFSS review and intentionally failing numerical
  regressions. These failures are not skipped, suppressed, or counted as passes.

## Executed on this integration checkpoint

| Gate | Result | Evidence |
| --- | --- | --- |
| Complete frontend suite, GPU-test flag enabled | 712 passed; 411 skipped; 70 files passed | `/tmp/solar-full-frontend-4b55dff-20261014.log` |
| Strict TypeScript | Exit 0; no diagnostics | `/tmp/solar-strict-types-4b55dff-20261014.log` |
| Moon source reproduction plus reference parser and observed-route contracts | 35 passed; no skips | `/tmp/solar-moon-source-and-pfss-contracts-4b55dff-20261014.log` |

Commands used Node 22.23.2 and the existing integration dependencies. Backend
execution used Python 3.12.13, `ci/backend-test-requirements.txt`, SpiceyPy, UTC,
`PYTHONHASHSEED=0`, and single-threaded numerical-library settings.

```sh
PLANET_SHADER_GPU_TEST=1 node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit --strict --pretty false
uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
  --with spiceypy python -m pytest -q scripts/test_moon*.py \
  backend/tests/test_solar_reference_inputs.py \
  backend/tests/test_pfss_observed_route_policy.py
```

The latest complete backend run predates this checkpoint: 3224 passed, 12 skipped
at `ec4e0bb`. It must not be described as a complete passing run of `4b55dff`.
The new PFSS review deliberately exposes failures that were absent from that run.

## Outstanding work, not waived

1. Independent PFSS review found nonfinite-colatitude acceptance, integer-radius
   scratch-array failure, and lost near-pole terms. The solver owner is repairing
   these against the unchanged independent tolerances. Prior review: 315 passed,
   55 failed. Final independent rerun, cold-response rerun, held-out comparisons,
   and six-baseline/six-mutation scientific CI gate remain required.
2. All 424 moon candidates passed the agent's candidate gate (425 tests including
   denominator assertion), but only 13 records have shipped reproducible models.
   The other 411 still need pinned, offline-reproducible, bounded lazy promotion.
   Daphnis retains explicitly qualified legacy-provider discontinuities; passing
   interpolation tests does not establish a continuous physical trajectory.
3. The actual-main solar GPU harness is paused after an acknowledged fixture
   error: it omitted the existing 0.15 enlarged-Sun coronal-height scale. Failed
   evidence is retained. Owner approval to correct this harness is pending;
   no pixel tolerance or independent reference has been weakened.
4. Scalar-JD leap-boundary ambiguity needs an explicit interface policy decision.
   The timestamp collision is reproduced; passing evidence tests are not a fix.
5. Catalog startup still exceeds its existing two-second budget. A full-content-
   first scene versus early procedural scene is an owner-visible behavior choice
   awaiting a decision. No deadline or catalog-size reduction is substituted.
6. Fresh integrated browser evidence, final full-suite/build evidence, and final
   delivery acceptance remain distinct from agent-base or earlier-checkpoint runs.
7. License/distribution decisions, actual deployed endpoint/authentication/TLS
   evidence, and real assistive-technology/physical-touch checks cannot be inferred
   from local automated test success. Unvalidated observed solar forcing stays
   fail-closed; PFSS numerical agreement alone does not authorize activation.

See `PFSS_STREAMING_INDEPENDENT_REVIEW_2026-10-14.md`,
`SCN041_COLD_RESPONSE_2026-10-14.md`,
`SCN041_HELDOUT_ACCEPTANCE_2026-10-14.md`, and
`SCN043_SOURCE_EXCEPTIONS_AND_PROMOTION_2026-10-14.md` for scoped provenance,
limitations, and agent-run evidence. Canonical landing states are not promoted
to `RESOLVED` merely because work is available on the construction branch.
