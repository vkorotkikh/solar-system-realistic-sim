# R3/R4 streaming verification gate: preliminary reachability audit

Audited integrated checkpoint:
`4b55dff10c556572ed06393b9739adcd6c3c07eb`.

This is diagnostic evidence, **not a final gate pass**. Cicero's numerical
repair and its independent recheck are still prerequisites for final bindings.
No manifest hashes, mutation definitions, thresholds, test assertions, verifier
code, production PFSS code, or time policy were changed by this audit.

## Actual results

The six manifest-required baseline nodes collected exactly and all six passed
in a temporary detached worktree at the audited commit. Tests used the pinned
`ci/r3-r4-requirements.txt` environment with Python 3.12.13, disabled conftest and
plugin autoload, manifest environment variables, and the existing socket guard.
The stale input-binding check was intentionally not represented as passing:
the diagnostic invoked baseline/mutation helpers separately from repository
attestation. The final `all` command must pass every normal attestation check.

For each applicable mutation, an extra temporary pytest hook recorded the
actual call exception type, message, and executed production source lines.
Each mutation ran in its own detached worktree. The four successful kills were
actual `builtins.AssertionError` outcomes with the expected marker in the
exception itself and executed lines from the changed production code.

| Mutation | Result | Reachability / issue |
| --- | --- | --- |
| `old-legendre-recurrence` | Genuine assertion kill | Mutated legacy `spherical_harmonics.py` recurrence executes; streaming evaluation does not |
| `uniform-theta-area-weights` | Genuine assertion kill | Mutated `MagnetogramGrid.area_weights` executes; decomposition reaches streaming latitude design |
| `extra-m-normalization` | Patch does not apply | Context assumes the old pre-fit condition check and old least-squares assignment |
| `corrupt-source-surface-factor` | Patch does not apply | Second hunk targets the removed legacy batch radial-factor loop |
| `omit-exact-boundary-crossing` | Genuine assertion kill | Modified boundary-intersection result construction executes |
| `wsa-vector-magnitude-expansion` | Genuine assertion kill | Both mutated radial-to-magnitude expansion lines execute |

The two application failures are not compile failures, scientific assertion
kills, skips, or passes. No six-of-six mutation claim is supported.

## Baseline reachability

- The immutable-harmonic fixture node constructs a `StreamingPFSS` object via
  `PFSSField`, but evaluates only `_legendre_batch` and the legacy shared
  recurrence. Constructor reachability is not streaming field coverage.
- The area-weight and extra-normalization nodes execute
  `schmidt_latitude_design` through the production decomposition path.
- The source-surface node executes `StreamingPFSS.evaluate` and `_chunk` via
  Cartesian batch evaluation; its representative scalar checks also use the
  legacy low-degree path. Its currently stale mutation misses the batch path.
- The endpoint node exercises the production batched tracer with an analytic
  radial field. It is a geometric crossing oracle, not a harmonic-field oracle.
- The expansion node deliberately supplies analytic fields and controlled
  classified endpoints to isolate radial flux semantics from tracing. It is
  not an observational WSA calibration or a streaming field accuracy test.

## Binding defect

`backend/sim/pfss_evaluation.py` is missing entirely from the manifest inputs.
The single existing pinned-input mismatch at this checkpoint is:

```text
backend/sim/pfss_magnetogram.py
pinned: bba246cb345183e3c0e75d3b09bfe829e8b80cbd6fc454ea82dcd3a4de81f527
actual: 8e973ec262aaf8c14cacf9fe1c9b1385f5e078d31a7ad09ea06f7db57934202a
```

These are observed bytes, not replacement manifest values. Final hashes must
be computed from the actual final Cicero source and committed verifier/tests,
after the independent recheck. Historical fix-commit provenance must not be
invented or silently relabeled to obtain a pass.

## Runner negative control

The current `_mutation` acceptance predicates require return code 1, one JUnit
failure, zero errors/skips, and an expected-regex match somewhere in stdout,
stderr, or JUnit. They do **not** establish that the exception is an assertion
or that the altered production behavior executed.

A temporary, isolated negative-control test raised:

```python
RuntimeError("R4-PFSS-SOURCE-SURFACE: non-assertion negative control")
```

Exact collection succeeded. Actual pytest/JUnit output was return code 1,
one failure, zero errors, zero skips, and zero passes. The current result
predicates accepted it. This is a reproduced verifier-predicate weakness, not
a scientific mutation kill and not a claimed full `all` invocation.

The owned verifier should require call-phase `AssertionError` evidence and the
expected marker in that exception, plus recorded execution at the changed
production location. Collection, compile/import, runtime, setup, and teardown
failures must never substitute for a scientific assertion kill. Existing
baseline-first, exact-node, offline, clean-source, hash, no-skip, and no-xfail
checks must remain intact.

## Required change proposal: approval before applying

1. Extend the existing immutable-oracle baseline to evaluate streaming modes
   as well as the legacy basis, using the same frozen independent fixture,
   assertion marker, and unchanged numerical thresholds. This requires write
   permission for `backend/tests/test_pfss_harmonics.py`; simply replacing the
   old fixture check with a different, looser field gate is not proposed.
2. Retarget `old-legendre-recurrence.patch` to the actual streaming recurrence
   coefficients, reproducing the same historical normalization/recurrence
   error. This is a nontrivial execution-target change and must be disclosed.
3. Refresh `extra-m-normalization.patch` context around the current Fourier
   amplitude extraction. Preserve the exact same extra-epsilon-m defect.
4. Retarget `corrupt-source-surface-factor.patch` to the streaming tangential
   factor, preserving the same erroneous minus-to-plus reflected term. The
   existing independent source-surface node already reaches this calculation.
5. Leave the three currently reachable area-weight, crossing, and expansion
   mutations semantically unchanged. Bind the new evaluator and every changed
   test/patch/verifier using measured final bytes, not guessed hashes.
6. After Cicero's final source passes independent recheck, commit the scoped
   gate update and run the entire standard `all` gate from a clean isolated
   worktree. Report exact base/manifest hashes, all six baseline outcomes, all
   six mutation outcomes, assertion types, reachability, and artifact paths.

Steps 1-4 require extending the currently listed write scope to the harmonic
test and these three mutation patch files. None has been applied. Production
PFSS implementations and the pending `solar_time.py` policy remain untouched.

## Retained diagnostic evidence

Artifact directory:
`/tmp/solar-r3-r4-reachability-20261014-5cnihgeu`.
It contains baseline JUnit, four mutant JUnit files, per-node call/line records,
the audit summary, and the non-assertion negative-control artifacts.

Actual artifact SHA-256 values:

```text
reachability-audit.json
06e645db58cbacbf3b39f762db13d0079cb2877753f7315196d94160c3b9c5cb

nonassertion-negative-control.json
ffb80397b796e93dba2415eca65a3726a70da65367e7e3e36f475a18c0025b7b
```

These hashes bind diagnostic output only. They are not scientific baseline
input replacements, final release evidence, or a completed canonical closure.

## Provisional review of Cicero's held repair

Parent integration is reported at
`e62516025ba750793271fec6f8b2d68d8b638fce`; the repaired source is not committed
there. The registered solar worktree was inspected read-only at
`/home/nomad/ai/projects/worktrees/solar-remediation-20261014-solar`, whose
committed HEAD was `5247e4b99f4ebfe2a39e168043ec74a9a29b093d`. Its pending
production changes were confined to `pfss_evaluation.py` and
`pfss_magnetogram.py`. The repair note and generated measurements in that
worktree were not modified or treated as independently reproduced evidence.

No direct agent-messaging tool is exposed in this review session. This report
is the local handoff for Cicero and the parent; direct message delivery is not
claimed.

The two pending source files were read into one in-memory snapshot and executed
against the independent review environment. Bytecode and pytest cache writing
were disabled; no source edits, commits, or test artifacts were written into
Cicero's worktree. Observed snapshot hashes, **not final manifest bindings**:

```text
backend/sim/pfss_evaluation.py
fc5260b5ce7f74a58a4a0bc87fa651e6973f2064638ff99b896c3d571bf86948

backend/sim/pfss_magnetogram.py
902dca1f33025596bf4b66ea725ece142fb914a2c9db021a1bacde3aa6f50628
```

The snapshot normalizes coordinate dtypes, rejects non-finite colatitude,
retains resolved `sin(theta)`, uses exact angular endpoint limits, and uses
`atan2(hypot(x,y),z)` for Cartesian colatitude. Scalar field evaluation is
unified onto the streaming evaluator at every degree.

Independent provisional run of the review, streaming, spectral, and harmonic
files: **370 passed, zero skipped, in 3.88 seconds**. This is a result for the
in-memory uncommitted snapshot, not acceptance of a final production commit.
The parent-reported full-backend, three-epoch, and cold-response measurements
were not rerun or promoted to independent evidence by this review.

### Confirmed unresolved infinite-azimuth regression

For scalar `PFSSField.evaluate(1.0, 0.7, phi)` and a unit axial dipole:

| Degrees | Input phi | Integrated behavior | Held snapshot behavior |
| --- | --- | --- | --- |
| 1, 15, 64 | +infinity or -infinity | `ValueError` | Non-finite output |
| 90 | +infinity or -infinity | Non-finite output | Non-finite output |

Thus scalar unification extends the pre-existing streaming azimuth gap to
previously rejecting low-degree scalar paths. The 370 passing tests do not
cover this regression. Correction remains with Cicero, pending the explicit
owner decision and then dedicated regression verification. No azimuth or time
policy correction was implemented here, and no final acceptance is claimed.

### Exact provisional rebinding plan

The intended immutable-fixture extension was executed in memory, without
changing the test file, oracle fixture, production source, or thresholds.
For each of its 135 non-monopole modes, a unit-coefficient streaming field was
evaluated at the photosphere and the fixture's colatitudes. Br was compared
with the frozen Schmidt values; Btheta was divided by the independently known
nonzero tangential radial factor before comparing theta derivatives. The
existing inequalities were unchanged: `5e-13 * max(1, abs(reference))` for
values and `1e-8` absolute for derivatives. The original legacy check must
remain, including its monopole coverage; the PFSS monopole is explicitly
excluded rather than silently interpreted as a field mode.

All 135 streaming mode checks passed provisionally. Maximum observed errors
were `1.2975731600306517e-15` for values and `1.837419105754634e-14` for theta
derivatives. This demonstrates that the proposed reachability extension does
not need a tolerance relaxation or a regenerated fixture.

Final mutation targets after approval and source freeze:

| Mutation | Production function / expression to bind |
| --- | --- |
| `old-legendre-recurrence` | `pfss_evaluation.py`, `StreamingPFSS.__init__`, historical erroneous a/b recurrence coefficients |
| `uniform-theta-area-weights` | `magnetogram_grid.py`, `MagnetogramGrid.area_weights`, unchanged semantic mutation |
| `extra-m-normalization` | `pfss_magnetogram.py`, `decompose_spherical_harmonics`, extra epsilon-m in Fourier amplitude extraction |
| `corrupt-source-surface-factor` | `pfss_evaluation.py`, `StreamingPFSS._chunk`, `-(radial - reflected)` changed to `-(radial + reflected)` |
| `omit-exact-boundary-crossing` | `pfss_tracing.py`, `_boundary_intersections`, unchanged semantic mutation |
| `wsa-vector-magnitude-expansion` | `pfss_magnetogram.py`, `compute_wsa_velocity_map`, unchanged semantic mutation |

The held patch removes the old scalar radial-factor loop entirely, so neither
old source-surface hunk should be retained as a purported production target.
The existing independent source-surface baseline already exercises the correct
streaming batch path. Constructor execution alone still does not make the old
immutable-harmonic baseline a streaming evaluation test.

The verifier change should retain all existing gate guards and additionally
bind each kill to a call-phase assertion, its actual exception marker, and
execution in the changed production hunk/function. The reproduced marker-only
RuntimeError control must be rejected, not counted as a kill. No patches,
verifier code, manifest entries, or test assertions have yet been changed.

Remaining prerequisites: owner approval for the infinite-azimuth correction;
Cicero's corrected commit; independent recheck; approval for the previously
listed harmonic-test/three-mutation-patch write-scope extension; then actual
final-byte hash generation and the complete standard `all` gate from a clean
isolated worktree. The pending scalar-JD time-policy decision remains separate.

## Independent verifier-hardening checkpoint

Owner-approved scope extension implemented while the corrected PFSS production
commit remains pending. This checkpoint does not accept the provisional azimuth
behavior, rebind the final scientific manifest, or claim a standard `all` pass.

### Runtime evidence contract

- Preserve the exact-node collection, single-failure JUnit counts, no-skip/xfail,
  offline socket guard, clean/tracked inputs, hash checks, historical fix ancestry,
  detached baseline/mutant worktrees, and source-drift checks.
- Capture the actual pytest exception through `pytest_runtest_makereport`, not
  console output, traceback source, or JUnit text. Require clean setup/teardown and
  a call-phase `AssertionError`; match the scientific marker only against that
  exception's message.
- Derive production line targets from the applied Git diff's new-side line
  numbers. Each three-context-line diff hunk must have an added nonblank,
  noncomment candidate line that actually executes during the required test call.
  Import-time, setup-only, unchanged-line, and merely same-file execution do not
  establish this evidence. Deletion-only/comment-only hunks fail closed rather
  than guessing an unchanged execution anchor.
- Preserve per-mutant `mutant-<id>.evidence.json` artifacts with node identity,
  setup/call/teardown outcomes, actual exception type/message, changed line
  targets, and executed lines. Reject missing/malformed/mismatched evidence,
  an interrupted call tracer, or any unexecuted hunk. Ignore inherited mutation
  requests so only the verifier supplies the runtime evidence configuration.
- The runner-test synthetic calibration now executes a production function
  during the test call instead of mutating an import-time constant. No scientific
  fixture, threshold, production implementation, or scientific baseline test was
  changed in this checkpoint.

### Actual regression evidence

Command, from the assigned PFSS review worktree:

```sh
uv run --python 3.12.13 --with-requirements ci/r3-r4-requirements.txt python -m pytest -q scripts/ci/tests/test_verify_r3_r4_runner.py scripts/ci/tests/test_verify_r3_r4_mutation_evidence.py
```

Result after hardening: **37 passed, zero skips, 12.41 seconds**. This includes
18 existing runner contracts and 19 new end-to-end evidence controls. Each
end-to-end control uses real pytest subprocesses and committed synthetic input
repositories with detached baseline/mutant worktrees; no mocked assertion type
or fabricated coverage output is used.

Before implementing the verifier change, the new controls produced **14 failed,
5 passed in 9.62 seconds**. They reproduced acceptance of marker-bearing
`RuntimeError`, `ValueError`, and generic `Exception`; marker-only stdout,
stderr, or source comments; assertions without changed-hunk execution;
setup-only execution; partial multi-hunk execution; comment/deletion-only
changes; and interrupted tracing. Positive structured-artifact checks also
failed because the previous runner emitted no runtime evidence. Existing
setup/teardown and runtime skip/xfail rejection continued to work.

After hardening, positive controls prove a marked call assertion with actual
production-line execution, including both separated changed hunks. Negative
controls reject all of the above non-evidence cases. Existing runner tests
continue to reject syntax/collection errors, wrong markers, skip/xfail baselines,
dependency mismatches, dirty patch/manifest inputs, invalid historical commits,
external/unpinned/malformed nodes, stale artifacts, and conftest poisoning.

### Remaining work, explicitly not closed

The production azimuth correction and final source commit still belong to
Cicero. The harmonic streaming bridge, three approved equivalent mutation
retargets, final `pfss_evaluation.py`/runner/test/patch hash bindings, independent
final-source recheck, and standard clean-isolated-worktree `all` run remain
pending that corrected commit. The scientific manifest is intentionally unchanged
here, so its old verifier binding does not match this checkpoint. No acceptance
or six-mutation final-gate claim is made. No tolerances, immutable oracle bytes,
legacy harmonic assertions, or time policy were changed.
