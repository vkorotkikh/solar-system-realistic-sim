# Evidence for the August partial findings closure

This bundle preserves implementation reports, independent reviews and raw checks
for the sixteen findings in the [acceptance plan](../../docs/plans/2026-10-31-close-august-partials.md).
It was assembled on 2026-11-01 at integrated implementation commit
`8b4d3207a33a8e5cdcb0276183ec93e7e66ddaf8`, while final integration checks and
review were still in progress. Historical passing checks, failed checks and
interrupted runs retain their original scope. The coordinator's
[closure matrix](../AUGUST_PARTIALS_CLOSURE_2026-10-31.md) owns the final verdict.

The repair baseline is `8d330a073faf011b1764f77d444019aed8f9c54a`, following merge
`9f7c5f7`, which combines remote `81b042b` with local repairs through `c9e0cc7`.
Implementation reports often name source-worktree commits. The table below and
the full hashes in [provenance.json](provenance.json) map them to the integrated
branch `fix/close-august-partials-20261031`.


## Current acceptance — 2026-11-01

**Complete: all sixteen findings pass independent review and the required gates.**

The records below labeled “at assembly” are historical snapshots. The current
implementation is `a1977f828aea76a2828869823ccb7eae86b00aec`, including the
independently reviewed worker-fixture correction after `8b4d320`.
The [validation manifest](validation-runs.json) records commands, environment,
exit status, exact commit scope and optional-test qualifications.

| Current gate | Result | Record |
|---|---|---|
| Source/UI/script strict types and TypeScript ratchet/delta | Passed, zero diagnostics | [Types](types-final-nov01.txt), [final fixture types](ui-fixture-types-final-nov01.txt) |
| Production build | Passed; curated maps and notices validated | [Build](build-final-nov01.txt) |
| Full frontend suite | 1,752 passed, 2 optional EGL skips | [Frontend](frontend-final-nov01.txt) |
| Full backend suite | 4,510 passed, 13 optional SPICE/Tudat skips | [Backend](backend-final-nov01.txt) |
| Scientific runner/workflow checks | 21 passed | [Contracts](science-runner-contracts-nov01.txt) |
| Scientific baseline and mutation checks | 11 passed; all 8 introduced defects detected | [Structured summary](science-final-nov01/summary.json) |
| Asteroid GPU numerical acceptance | 125 planar and 2 inclined cases passed, plus sub-minute motion | [WebGL2 readback](asteroid-gpu-final-nov01.txt) |
| Final complete browser matrix | 136 passed, 34 documented Chromium-only skips; zero failures/flaky cases | [Output](browser-qualified-matrix-nov01.txt), [per-project summary](browser-summary-nov01.json), [raw report](browser-qualified-matrix-nov01.json) |
| Retained-API final review | Approved at production head `8b4d320` | [Final review and earlier findings](review-retained-apis.md) |
| Whole-branch final review | All sixteen approved; no blocking findings remain | [Final independent sweep](final-sweep.md) |

The [worker-fixture record](browser-worker-fixture-nov01.md) preserves the
failure mechanism and deterministic probes. Its subsequent actual browser
check [passed](browser-worker-corrected-nov01.txt); the first run's failure is
still preserved in [selected raw trace records](worker-fixture-failure-nov01.json).
The [environment restoration record](environment-restoration-nov01.md) and
[package/configuration evidence](environment/README.md) explain the isolated
WebKit setup. The separate `browser-webkit-final-nov01.txt` run was stopped
because port 4190 is restricted by WebKit: one failed, one interrupted and
53 unrun cases. It is not a successful matrix. A real WebKit accessibility
check subsequently [passed on an allowed port](browser-webkit-qualified-nov01.txt).
The final complete run uses port 4187 and no global host-validation skip flag.

The final test-only commit `a1977f8` follows the assembly-time commit mapping
below. No production files changed after `8b4d320`. Final documentation and
raw-evidence whitespace attributes do not change runtime behavior or test
assertions. Those exact evidence paths retain original captured bytes; code
keeps its normal whitespace checks.

## Implementation and review records

| Record | Scope and interpretation |
|---|---|
| [Task 1](task-1-report.md) | F-012, F-026, F-027: catalog precision, taxonomy retirement, moon identities and physical radii. Historical source-worktree checks. |
| [Task 2](task-2-report.md) | F-013, F-018, F-021: bounded native seeks, mission contracts and legacy publication retirement. Preserves original thirty stress failures, measured overhead and interrupted follow-up run. |
| [Task 3](task-3-report.md) | F-022, F-023, F-028, F-030: worker ownership, labels/stars, hidden Kuiper work and runtime owners. Readable archival transcription of the implementation report. |
| [Task 4](task-4-report.md) | F-009, F-025: bounded solar delivery and qualified rotation/display model. Historical native and HTTP wire checks. |
| [Task 5](task-5-report.md) | F-029: reconstructed from eight commits and historical independent review because the original turn stopped before the report. No new final passing result is inferred. |
| [Task 6](task-6-report.md) | F-001, F-006, F-021, F-031: gates, documentation, scratch-command retirement and distribution. Readable archival transcription with the later notice-link correction identified. |
| [Catalog and backend review](review-catalog-backend.md) | Initial review plus completed F-018 repair rereview at source `197bd69`, integrated as `4fab6ae`. Final scoped approval covers Tasks 1 and 2. |
| [Runtime, delivery and distribution review](review-runtime-delivery.md) | Scoped approval and browser-test delta review through `24802ff`. Explicitly leaves F-001 pending final integration gates. |
| [Rendered label measurements](review-label-pixels.json) | Independent actual WebGL glyph probe at close/distant views and DPR 1/2. Supports the scope stated in the runtime review. |
| [Solar raw evidence](task-4-evidence/) | Byte-preserved red/green/full logs, actual wire probe and results referenced by Task 4. These belong to the source implementation, ending at `97b514e`. |

The two copied Markdown reviews and label JSON are byte-identical snapshots of
their completed source records. Reports 1, 2 and 4 have historical-scope notices;
Task 2 also has spacing corrections. Reports 3 and 6 expand compressed wording
without changing their recorded measurements or handoff status. Task 5 is a
reconstruction, explicitly distinguished from a contemporary implementer log.
Source SHA-256 values and transformations are recorded in `provenance.json`.

At initial assembly, `review-retained-apis.md` and `final-sweep.md` were still
being written. Completed versions are linked in the current-acceptance section
above. Existing review verdicts apply to their stated ranges; later acceptance
is recorded explicitly rather than inferred from an earlier review.

## Historical and interrupted integration checks

| Raw log | Recorded result and limitation |
|---|---|
| [frontend-suite.txt](frontend-suite.txt) | Historical integrated run: 111 files passed, 1 skipped; 1,725 tests passed, 2 skipped. It predates the completed retained-API repairs and is not final-HEAD acceptance. |
| [backend-suite.txt](backend-suite.txt) | Historical full run: **2 failed, 4,493 passed, 13 skipped**, 2 warnings. Failures are the GONG blocking-DNS deadline case and normal-interpreter child deadline case. This is a failed suite. |
| [backend-deadline-rerun.txt](backend-deadline-rerun.txt) | Two unchanged deadline cases passed in 3.41 seconds when rerun. This targeted result does not convert the failed full run into a full-suite pass. |
| [browser-matrix.txt](browser-matrix.txt) | Interrupted original 170-test matrix with failure markers and no terminal successful matrix summary. Preserved raw, including NUL padding from the stopped process. **Not a final pass.** |
| [browser-hardware.txt](browser-hardware.txt) | Initial hardware-qualification attempt: 1 failed, 4 passed. The selected software renderer did not satisfy hardware qualification. |
| [browser-hardware-qualified.txt](browser-hardware-qualified.txt) | Later historical hardware run: 5 passed in 49.3 seconds with ANGLE D3D12 on NVIDIA RTX 5090. It qualifies those five Chromium actual-app checks, not the whole browser matrix or all physical GPUs. |

The original `browser-matrix.txt` is 11,362 bytes, including **1,247 NUL bytes**.
Its SHA-256 is
`9643c70ebbae77bbb67347e2b2630bab79341f6686f80363fbb5b712131fe540`.
The padding has not been removed, the failure records have not been rewritten,
and the absent final summary has not been reconstructed as a result.

## Final integration evidence

The coordinator owns newly produced final logs. A filename containing `final`
does not by itself establish completion or success. At bundle assembly:

| Log or reserved record | Status at assembly |
|---|---|
| [clean-install-nov01.txt](clean-install-nov01.txt) | Completed install output: 51 packages added, 52 audited, zero reported vulnerabilities. This only establishes the recorded install result. |
| [browser-final-nov01.txt](browser-final-nov01.txt) | Active rerun with an observed worker-recovery failure marker; no completed passing summary at inspection. Requires coordinator assessment and any subsequent repair/rerun. |
| Later frontend, backend, types, build and browser final logs | Owned by the coordinator; add their command, implementation commit, terminal result, skips and scope when complete. Not included in the frozen historical checksum list while being written. |
| Completed retained-API review and final sweep | Pending archive by their owners/coordinator. Required before declaring all sixteen findings closed. |

For final acceptance, use the completed log for the tested commit and the final
independent verdict together. Keep preceding failures and interrupted attempts
in this bundle when adding successful reruns. No tests were run merely to
assemble this documentation.

## Source to integrated commit mapping

All mapped cherry-picks below have matching `git patch-id --stable` values.
That verifies patch correspondence; it does not make a source-worktree test run
an integrated-tree test run. Full commit and patch hashes are in `provenance.json`.

| Task / finding | Source commit | Integrated commit |
|---|---|---|
| 1 / F-012 | `131debe` | `e02b8b1` |
| 1 / F-026 | `5f6c22a` | `ddd49a0` |
| 1 / F-027 | `359cb57` | `1660173` |
| 2 / F-013 | `6224b86` | `e2d4a4c` |
| 2 / F-018 | `b35ebdb` | `f88686d` |
| 2 / F-021 | `22d2c6e` | `40a9830` |
| 2 / F-018 review repair | `197bd69` | `4fab6ae` |
| 3 / F-022 | `fef6c5b` | same root commit |
| 3 / F-023 | `640bf15` | same root commit |
| 3 / F-028 | `08a6d8e` | same root commit |
| 3 / F-030 | `692457c` | same root commit |
| 4 / F-009 | `0b40954` | `3e9297f` |
| 4 / F-025 | `97b514e` | `d8eae54` |
| 5 / TLE iteration | `9d455bb` | `e8387d8` |
| 5 / interpolation | `5cdab12` | `b026c21` |
| 5 / DOM capabilities | `ce24b9a` | `3ea320d` |
| 5 / client APIs | `93e5064` | `581b162` |
| 5 / reentrant seek | `a2f95e6` | `eb7977a` |
| 5 / TLE identity | `37140fb` | `7e49b5f` |
| 5 / snapshot validation | `b9ebcc0` | `7abcce1` |
| 5 / handshake ordering | `58ee0e1` | `8b4d320` |
| 6 / F-001 script gate | `5a37287` | same root commit |
| 6 / F-021 scratch entrypoints | `a472f59` | same root commit |
| 6 / F-031 distribution | `fd8d149`, `ebc81a4` | same root commits |
| 6 / F-006 docs | `23fb74d` | same root commit |
| 6 / F-031 notice-link repair | `2b5ccaa` | same root commit |
| 6 / F-001 browser follow-ups | `7938f54`, `1f12d7b`, `24802ff` | same root commits |

## Integrity and qualifications

[SHA256SUMS](SHA256SUMS) covers every file in this completed evidence bundle
except the checksum index itself, including this README, completed final logs,
raw structured browser evidence, independent reviews and environment records.
The initial 33 frozen-file hashes were rechecked before expanding the index.
Verify the bundle from this directory with `sha256sum -c SHA256SUMS`. Historical
failures and interrupted attempts remain unchanged; they are not relabeled as
passes. `provenance.json` preserves the initial assembly mapping through
`8b4d320`; `validation-runs.json` adds final acceptance at `a1977f8`.

Catalog evidence establishes preservation of parsed source values, not new GPU
or physical-model accuracy. Moon counts do not imply a uniform new orbital
error bound. Solar wire measurements do not prove provider availability or
forecast calibration. Mission negatives remain conditional on supported inputs
and complete evaluated search evidence. Satellite interpolation evidence retains
its circular-fixture and mean-Kepler/J2 limits. Skipped optional checks are never
counted as passes, and historical software/hardware browser evidence retains
its renderer and browser scope.
