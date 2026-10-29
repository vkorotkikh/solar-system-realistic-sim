# Retained remediation review evidence - 2026-10-29

Baseline: `bb29d4be393c9dedca7049fc9b83511ed955be40`. See [the condensed review](../REMEDIATION_CONSOLIDATED_REVIEW_2026-10-29.md).

- `verification.json`: central run results, environment, explicit exclusions and verdict totals.
- `canonical-register.json`: all 83 per-issue source/regression/branch assessments, coordinator scope rulings and compact dispositions.
- `reviews/*.json`: six independent domain reviewers plus the coordinating global review. Statements that central results were pending describe when those reviews were written; use `verification.json` for completed central runs.
- `source-inventory.json`: all 46 pre-review remediation-note names, 62 distinct versions and source paths/hashes. Raw local paths record provenance, not a promise those worktrees persist.
- `backend-junit.xml`, `frontend-results.json`, `maintenance-native-junit.xml`, `science-summary.json`, `browser-chromium.json`, `browser-failures.json`: executed results. Browser traces remain locally in the audit worktree's ignored `test-results/4175/`; they were not bulk-staged.
- `maintenance.log`: the initial missing-Python-Playwright collection failure. `maintenance-native.log`: subsequent complete augmented-environment pass; these are different environments.
- `archive-verification.json`: 164 raw evidence files match the audited tree. `archive-historical-verification.json` confirms all four dated report hashes at commit `56e799a`; two evolved report documents differ today.
- `frontend-defect-probes.entry.ts` and `backend-defect-probes.py`: minimal baseline reproductions. A probe returning true means the defect was reproduced, not fixed. `run-frontend-defect-probes.mjs` bundles actual source with the installed esbuild package; run from the repository root using the pinned Node toolchain. The backend script needs `PYTHONPATH=backend` and the pinned Python environment. No production files are edited.
- `sources/REMEDIATION_SCN049_BROWSER_ACCEPTANCE_2026-10-17.md`: branch-only historical note; its Tudat producer label is corrected in the condensed review based on the capture harness's actual REBOUND/WHFast implementation.
- `SHA256SUMS`: hashes of this retained evidence set, excluding the checksum file itself.

Reproduce the central lanes from the repository root:

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run typecheck:ui-delta
npm run test:types:ui
npm run build
npm run verify:asteroid-gpu
PLANET_SHADER_GPU_TEST=1 node node_modules/vitest/vitest.mjs run scripts/planetShaderGeometry.test.mjs
npm run test:browser -- --project=chromium --reporter=json
uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt python -m pytest -q backend/tests scripts/ci/tests
uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt --with playwright==1.64.1 --with spiceypy==8.3.0 python -m pytest -q ci scripts/test_*.py backend/tests/test_all_moon_oracle_coverage.py::test_native_daphnis_reference_has_real_piecewise_discontinuities
uv run --python 3.12.13 --with-requirements ci/r3-r4-requirements.txt python scripts/ci/verify_r3_r4.py --repo . --manifest ci/r3-r4-science-verification.json --artifacts /tmp/solar-review-science-UNUSED-DIRECTORY all
```

Use Node 22.23.2/npm 10.9.8, Python 3.12.13, UTC, `PYTHONHASHSEED=0` and one thread for OMP/OpenBLAS/MKL/NumExpr. The science output directory must not preexist. The Chromium command is expected to retain the two recorded baseline fixture failures until their correction is integrated.
