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
