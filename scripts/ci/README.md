# R3/R4 scientific regression lane

`verify_r3_r4.py` is the bounded, blocking lane for the PFSS scientific-core
repairs already present in this repository. The runner does not install
dependencies or contact the network. Instead, it fails unless the current
interpreter and every declared scientific/test dependency exactly match
[`ci/r3-r4-science-verification.json`](../../ci/r3-r4-science-verification.json).
The networked bootstrap, when needed, installs only
[`ci/r3-r4-requirements.txt`](../../ci/r3-r4-requirements.txt); the manifest
pins that file's hash and requires its exact pins to match the runtime package
table.

Run the complete baseline and mutation lane from the repository root with the
pinned Python 3.12.13 environment:

```bash
python scripts/ci/verify_r3_r4.py \
  --repo . \
  --manifest ci/r3-r4-science-verification.json \
  --artifacts artifacts/r3-r4-science-manual-001 \
  all
```

The explicit artifact directory must be absent or empty. Use a new name for
every attempt. Omitting `--artifacts` creates a unique run directory below
`artifacts/`.

`baseline` runs only the unmodified required-node gate. `mutations` still runs
that baseline first, then executes all mutants. `all` is the release-lane
spelling and currently has the same behavior as `mutations`.

The runner fails closed when:

- the manifest is outside the repository, or the manifest, a pinned input, or a
  mutation patch is untracked or differs from `HEAD`;
- a pinned package, requirements file, source, test, fixture, generator, or
  patch hash drifts; the verifier script itself is a tracked, clean, hashed
  manifest input;
- a recorded full fix commit does not resolve exactly or is not an ancestor of
  the tested commit;
- a required node's normalized repository-relative test file is not itself a
  pinned input;
- exact required-node collection changes, a dependency is missing, or Pytest
  reports a skip, xfail, XPASS, import error, collection error, or timeout;
- the unmodified baseline is not green;
- a patch does not apply cleanly to an isolated detached worktree, changes an
  undeclared production file, or survives its mapped node;
- a mutant fails for anything other than its declared assertion regex.

The baseline and every mutant run in a detached worktree at the exact recorded
`HEAD`. That full-tree checkout binds transitive committed imports as well as
the directly hashed scientific files; dirty source-worktree imports cannot leak
into evidence. Pytest runs with `--noconftest`, because this manifest declares
conftest disabled. Exact collection is performed before execution.

Artifacts are atomically published as `baseline.xml`, one JUnit XML file per
mutant, and `summary.json`. A nonempty artifact directory is rejected so an old
green summary or injected Python module cannot be replayed. Temporary
worktrees and the private socket/pytest guard directory are removed in `finally`
paths; guard code is never placed on a persistent artifact `PYTHONPATH`. The
socket guard rejects outbound INET sockets from child Python processes. It is
not container-level network isolation or protection from an arbitrary
subprocess; the selected scientific nodes spawn no programs.

[`r3-r4-science.yml`](../../.github/workflows/r3-r4-science.yml) installs the
exact requirements and invokes the `all` lane for pushes, pull requests, and
manual dispatches. The workflow is operational but still uses hosted-runner and
action references rather than an attested immutable container/action chain.
Repository-hosted branch protection and required-check configuration are
external state: this workflow cannot by itself prove that GitHub blocks merges
when the job is absent or red.

The current matrix covers the old Legendre recurrence, uniform-theta weights on
an equal-area map, the extra `m>0` normalization, corrupted PFSS source-surface
factors, omitted exact shell-crossing interpolation, and vector-magnitude WSA
expansion. It does not close the independent real GONG/PFSS corpus, immutable
container attestation, Playwright/load lanes, the repository-wide TypeScript
gate, or the multi-worker/global coordinator and supervised-process release
architecture or OS-level network isolation.
