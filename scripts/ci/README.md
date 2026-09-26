# R3/R4 scientific regression lane

`verify_r3_r4.py` is the bounded, blocking lane for the PFSS scientific-core
repairs already present in this repository. It does not install dependencies or
contact the network. Instead, it fails unless the current interpreter and every
declared scientific/test dependency exactly match
[`ci/r3-r4-science-verification.json`](../../ci/r3-r4-science-verification.json).

Run the complete baseline and mutation lane from the repository root with the
pinned Python 3.12.13 environment:

```bash
python scripts/ci/verify_r3_r4.py \
  --repo . \
  --manifest ci/r3-r4-science-verification.json \
  --artifacts artifacts/r3-r4-science \
  all
```

`baseline` runs only the unmodified required-node gate. `mutations` still runs
that baseline first, then executes all mutants. `all` is the release-lane
spelling and currently has the same behavior as `mutations`.

The runner fails closed when:

- a pinned package, source, test, fixture, generator, or patch hash drifts;
- a recorded fix commit does not resolve or is not an ancestor of the tested
  commit;
- exact required-node collection changes, a dependency is missing, or Pytest
  reports a skip, xfail, XPASS, import error, collection error, or timeout;
- the unmodified baseline is not green;
- a patch does not apply cleanly to an isolated detached worktree, changes an
  undeclared production file, or survives its mapped node;
- a mutant fails for anything other than its declared assertion regex.

Artifacts are `baseline.xml`, one JUnit XML file per mutant, and `summary.json`.
Temporary mutant worktrees are removed in a `finally` path; the source worktree
is hashed before execution and is never patched. The child Python processes load
a socket guard that rejects outbound INET sockets. This is a Python-process
guard, not container-level network isolation or protection from an arbitrary
subprocess; the selected nodes are pure scientific tests and spawn no programs.

The current matrix covers the old Legendre recurrence, uniform-theta weights on
an equal-area map, the extra `m>0` normalization, corrupted PFSS source-surface
factors, omitted exact shell-crossing interpolation, and vector-magnitude WSA
expansion. It does not close the independent real GONG/PFSS corpus, immutable
container attestation, Playwright/load lanes, the repository-wide TypeScript
gate, or the multi-worker/global coordinator and supervised-process release
architecture.
