# Canonical remediation: wave-two integration checkpoint

The effort is active. No all-item closure, main merge, push, or production
deployment is claimed. The current master records 54 committed unmerged fix
qualifiers, including three still-partial groups; nine rows remain partial.

## Tested snapshots and exact results

Full frontend and backend/CI/catalog runs below started at
`bc0e336e4da9b5835ae73b817c47d9fc4edc651e`. Solar component/reference additions
were subsequently integrated at `20d92cb9084af4f865d5ceb477f3d60ff165e217`;
their focused author evidence is separate from those earlier full runs.

| Gate | Result | Recorded log/evidence |
|---|---|---|
| Backend plus CI-runner and generator tests | 2,924 passed, 5 skipped, two dependency deprecations; 263.02 s | `/tmp/solar-full-backend-wave2-20261014.log` |
| Frontend with optional shader lane enabled | 564 passed, zero skipped; 55 files | `/tmp/solar-full-frontend-wave2-20261014.log` |
| Strict TypeScript and strict browser-test types | Both passed, zero diagnostics | Same frontend log |
| Merged runtime/transport focused gate | 115 passed; no resource or unhandled-thread warning failures | `/tmp/solar-runtime-horizons-integrated-20261014.log` |
| Integrated Chromium/Firefox production-DOM matrix | 54 passed, zero skipped; 1.1 min | `/tmp/solar-dom-browser-wave2-20261014.log` |
| Native optional Tudat gate | 8 passed, zero skips, including three actual native propagation tests | [Native evidence](REMEDIATION_NATIVE_TUDAT_2026-10-14.md) |
| Exact PFSS scientific manifest at b0b1030 | Six baseline tests passed; all six mutants killed | `/tmp/solar-r3r4-integrated-20261014-b/summary.json` |

The five default-backend skips are optional native-runtime and all-moon
reference-coverage gaps, not five scientific passes. Native execution has its
own successful environment/gate. The new 75052 reference is committed but the
all-moon consumer/model follow-up is not yet integrated at this checkpoint.

## Reproduction

Pinned frontend toolchain:

```sh
export PATH=/tmp/solar-remediation-toolchain-20261014/node_modules/node/bin:$PATH
NPM=/tmp/solar-remediation-toolchain-20261014/node_modules/npm/bin/npm-cli.js
PLANET_SHADER_GPU_TEST=1 node "$NPM" test
node "$NPM" run typecheck
node "$NPM" run test:types:ui
PLAYWRIGHT_BROWSERS_PATH=/home/nomad/ai/projects/worktrees/solar-remediation-20261014-accessibility/artifacts/accessibility/browsers \
UI_TEST_PORT=4195 node "$NPM" run test:browser -- \
  shell.spec.ts accessibility.spec.ts panel.spec.ts explorer.spec.ts \
  reflow.spec.ts camera.spec.ts experiment.spec.ts \
  --project=chromium --project=firefox
```

Backend and maintenance gates:

```sh
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 \
MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC \
uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
python -m pytest -q backend/tests scripts/ci/tests scripts/test_catalog_generation.py --tb=short
```

These commands are not a guarantee that an arbitrary later dirty tree passes.
Record the tested commit for every subsequent execution.

## Independent review did find additional bugs

The runtime review found and repaired repeated-cancellation lease release,
partial mutating-seek recovery, stale telemetry after a dead worker, response
queue starvation and concurrent native handshake access. Its fixes are
`06a2562`, not a claim that the earlier controller patch was already complete.
The Horizons follow-up `e6a02d9` proves kill/reap and capacity recovery instead
of assuming owner approval of permanent starvation. See the separate runtime
review and Horizons transport reports.

AGN frames now have a 22-check hardware oracle. Genuine 200%/400% browser zoom
has software/hardware evidence. Solar frames have an independent CSPICE and
screen-space component oracle, but active scene integration remains required.

## Known failed or missing acceptance evidence

- SCN-041's matched real PFSS accuracy gate fails at runtime degree 15. Its
  reported failure is retained; tests checking that failure is accurately
  reported do not turn it into successful calibration.
- SCN-043 still has major demonstrated model errors across the all-moon
  population. The six-body numerical repair checkpoint is under integration
  review; source identity, reproducibility and the remaining denominator must
  remain explicit. Accuracy criteria are not being loosened.
- SCN-042 needs full production-scene solar frame wiring and per-layer truth.
- SCN-005's five-minute dev and preview gates are active, not yet a pass.
- A possible live Kuiper payload-shape mismatch is assigned for actual
  backend-to-client reproduction, beyond fabricated client fixtures.
- WebKit, manual assistive-technology/touch, actual remote deployment and owner
  licensing/asset permission requirements remain explicit dependencies.

The canonical master, not a stale earlier workstream headline, controls status.

## Subsequent wave-three checkpoint

The continuing effort is recorded in
[REMEDIATION_WAVE3_2026-10-14.md](REMEDIATION_WAVE3_2026-10-14.md). It adds the
actual AIA date-coverage regression and fix (`938bca0`), frozen ACE observation
overlap (`892d049`), finite solar helper policy (`953eeb4`) and operational
trust/ownership corrections (`d8c75b4`). The five-minute two-worker operational
soak passed, but remote deployment and the other named scientific/manual
requirements remain explicit. Earlier test counts above retain their original
commit scope and are not substituted for the later integrated results.
