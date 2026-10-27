# Canonical remediation verification checkpoint: 4f2e250

Date: 2026-10-14. Branch: `remediation/canonical-register-20261014`.
Tested production revision: `4f2e2507797eb73d50443711df433e10032cc3fd`.
Later evidence/documentation commits do not change this tested production code.

**The canonical remediation effort is not complete. The full backend gate is red.**
No failing test was removed, converted to an expected failure, or counted as a
pass. No source-accuracy tolerance, startup budget, or worker deadline was relaxed.
No merge to `main`, remote push, or deployment was performed.

## Actual integrated results

| Gate | Result | Revision / evidence |
| --- | --- | --- |
| Full backend, CI, and script tests | **3593 passed, 55 failed, 12 skipped**, 2 dependency warnings; 174.49 s; exit 1 | `4f2e250`; `/tmp/solar-full-backend-4f2e250-20261014.log` |
| Complete frontend suite | **723 passed, 411 skipped**, 71 files passed | `4f2e250`; `/tmp/solar-full-frontend-lazy-validation-20261014.log` |
| Strict TypeScript using the integrated project configuration | Exit 0; no diagnostics | `4f2e250`; `/tmp/solar-strict-types-lazy-validation-20261014.log` |
| Production build | Exit 0; 1.53 s | `4f2e250`; `/tmp/solar-build-lazy-validation-20261014.log` |
| Required native Tudat tests | **17 passed, zero skipped** | `4f2e250`; `/tmp/solar-native-tudat-4f2e250-20261014.log` |
| Moon reproduction/integrity and solar-reference contract scope | **46 passed, zero skipped**, required SpiceyPy 8.3.0 | `041abfb`; `/tmp/solar-moon-integrity-and-source-041abfb-20261014.log` |
| Scientific verifier hardening tests | **37 passed, zero skipped** | `8ed5c7a`; `/tmp/solar-scientific-verifier-hardening-20261014.log` |
| Independent source-exception repair review | **22 passed, zero skipped**; unchanged rejection tests and native/runtime numerical checks | `95ecbaf` plus `86ac5fe`; scoped source/test/fixture bytes match `4f2e250` |
| Actual-app/browser matrix | **97 passed, 14 platform skips**, zero failures/flakes | Earlier integrated `b072d32`; `browser-matrix-b072d32-2026-10-14/README.md` |

The focused scopes overlap the full suites; their counts must not be summed as
distinct tests. The dedicated native lane does not turn skips in another runner
into passes. The browser matrix has documented project exclusions and uses
software WebGL; it is not a hardware rendering, human assistive-device, or
two-second startup-performance pass.

All 55 full-backend failures are in `backend/tests/test_pfss_streaming_review.py`:
32 spherical near-pole cases, 8 Cartesian near-pole cases, 6 integer-radius cases,
and 9 nonfinite-colatitude rejection cases. They expose three unresolved root
causes in the committed production source, not 55 unrelated defects.

## Repairs integrated during this followup

- `041abfb`: reject internally contradictory native handoffs, target/center
  identities, missing legacy qualifications, failed/reused post-selection audits,
  and contradictory pinned provider metadata. Numerical artifacts remain unchanged.
- `4f2e250`: defer catalog identity-map construction to parser use. The eager
  validation implementation had increased the default model worker to 194.02 kB;
  the integrated followup restores **26.13 kB** and the original emitted worker
  `modelWorker-DYAkMz1r.js`. Main output is **969.46 kB / 249.33 kB gzip**,
  `index-C1cPtVdP.js`. The existing greater-than-500-kB Vite warning remains.
- `8ed5c7a`: require actual call-phase assertion failure, a marker in that
  exception, and execution of changed production hunks for scientific mutation
  kills. Marker-bearing runtime exceptions and unrelated execution are rejected.
- Independent red review tests and their reproducible native fixture remain in
  the repository. The ten moon rejection failures now pass unchanged; the 55
  PFSS failures remain explicit until the held numerical repair is completed.

Independent review evidence is in
`SCN043_INDEPENDENT_FINAL_RECHECK_86ac5fe_2026-10-14.md`. Historical reports on
older agent bases retain their real TypeScript failures; they are not relabeled
as passes because the integrated branch has a clean strict check.

## Remaining decisions and required work

| Work | Current state and required next action |
| --- | --- |
| PFSS numerical repair | Held, uncommitted in the solar agent worktree. Its 370 review cases pass provisionally, but scalar unification introduced an infinite-azimuth rejection regression. Owner approval to correct that additional issue is pending. Then commit, independently recheck, integrate, and rerun full/scientific gates. |
| Scientific six-baseline/six-mutation gate | Verifier hardening is integrated. Three mutation targets and final source/test/patch/manifest bindings remain to be updated after the solver is frozen. No final `all` acceptance is claimed. |
| Actual-main solar GPU acceptance | The new harness omitted the existing 0.15 enlarged-Sun coronal-height mapping. Approval to correct the fixture is pending. Preserve the failed capture, independent reference, one-pixel limit, and negative controls. |
| Kuiper reactivation proof | New capture cleanup called `runner.stop()` instead of passing `runner.stop` to `asyncio.to_thread`. Approval to correct and rerun is pending. No completed producer/client replay or protocol fix is claimed. |
| Remaining moon promotion | 13 shipped records, 411 still unpromoted. The proposed 410 shared lazy shards retain the duplicate Puck record in the 424-record denominator. Two promotion-code field-name corrections (`parent` to `center_name`, `rowCounts` to `counts`) await approval; the full-424 lazy gate has not run successfully. |
| Bulk source storage | 410 local, uncommitted lossless column-major float64 XZ input archives total **330929304 bytes**, before runtime output. Do not silently commit this bulk dataset. Review retention/distribution and final footprint before promotion. |
| Scalar-JD leap boundary | Reproduced information loss can make an ordinary midnight and a genuine leap instant share one scalar JD. Choose strict ambiguous-bin rejection with precise two-part-JD input, or explicitly documented rounding. No policy was silently selected. |
| Startup | The existing two-second catalog-startup gate still fails. Choose full-content-first loading with asynchronous shader warmup or preservation of an early procedural scene; then implement and rerun actual delivery acceptance without resetting timers or reducing content. |
| External/manual requirements | License and third-party distribution decisions, deployed URL/auth/TLS evidence, and actual assistive-technology/physical-touch checks remain owner/environment dependent. Local automated passes do not replace them. |

Unvalidated observational solar forcing remains fail-closed. Numerical PFSS
agreement alone does not establish provider-to-inertial frame binding or authorize
turning that route on. Daphnis remains a dated legacy source with declared fit
changes, not a contemporary continuous physical ephemeris.

## Reproduction commands

All commands below run from the integration worktree. Numerical runs use UTC,
`PYTHONHASHSEED=0`, and `OMP_NUM_THREADS=OPENBLAS_NUM_THREADS=MKL_NUM_THREADS=NUMEXPR_NUM_THREADS=1`.
Node is 22.23.2 from the isolated toolchain. Optional-native requirements are
made mandatory in their respective recorded lanes.

```sh
SOLAR_MOON_REVIEW_REQUIRE_NATIVE=1 \
uv run --offline --python 3.12.13 \
  --with-requirements ci/backend-test-requirements.txt --with spiceypy==8.3.0 \
  python -m pytest -q backend/tests ci scripts/test_*.py scripts/ci/tests --tb=line

PLANET_SHADER_GPU_TEST=1 node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit --strict --pretty false
node /tmp/solar-remediation-toolchain-20261014/node_modules/npm/bin/npm-cli.js run build

SOLAR_REQUIRE_TUDAT=1 /tmp/solar-remediation-tudat-20261014/bin/python \
  -m pytest -q backend/tests/test_tudat*.py
```

## Resume ownership

Integration worktree: `/home/nomad/ai/projects/worktrees/solar-canonical-remediation-20261014`.
User-facing notes are synchronized into the original repository only after an
owned-checkpoint byte comparison; its application checkout is not switched.

- Cicero: solar numerical repair in `solar-remediation-20261014-solar`.
- Herschel: bulk moon promotion in `solar-remediation-20261014-ephemeris`.
- Planck: final independent PFSS review and scientific gate in `solar-remediation-20261014-pfss-streaming-review`.
- Peirce: startup policy implementation after a decision, in `solar-remediation-20261014-frame-lifecycle`.
- Volta: independent moon/delivery acceptance; latest review in `solar-remediation-20261014-moon-source-review`.
- Beauvoir: actual Kuiper reproduction in `solar-remediation-20261014-lifecycle-review`.

Preserve the paused/uncommitted work and failed evidence. No canonical item is
promoted to `RESOLVED` merely because a construction-branch or agent-base scope
passes. A final integrated all-green run and the applicable external evidence
are still required.
