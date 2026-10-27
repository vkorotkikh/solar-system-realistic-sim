# Retained scan evidence — 2026-10-10

Companion to [the October 10 tracker](../CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-10.md).
All product probes ran on separate extractions of the selected commits. The user's
checkout, application files, datasets, dependencies and branch were preserved.

## Branch identity and coverage

- [branches.json](branches.json): exact tips, trees, snapshot paths, initial checkout status and failed remote refresh.
- `main-tree.txt`, `ci-tree.txt`, `trajectory-tree.txt`: complete tracked blob inventories.
- `inventory.json`: source-category counts and final comparison of extracted tracked files against Git blob hashes.
- `MANIFEST.sha256`: SHA-256 hashes of retained evidence, excluding itself and Python cache files.
- [solar report](solar/report.md), [backend integration review](backend/integration-review.md),
  [physics report](physics/REPORT.md), [frontend report](frontend/REPORT.md),
  [Lambert/transport supplement](backend/TRANSPORT_LAMBERT_NOTES.md): findings, precise source locations,
  scope, reproduction, expected/actual results and closure gates.

Source line references in these reports belong to the named immutable commit, not
necessarily the user's current `fix/solar-status-chip-on-main` checkout. Recover a
file with `git show <commit>:<path>`. Main and the CI branch have identical trees;
their applicability is established by identity, not an invented third test run.

## Validation

`validation/main-frontend-checks.json` and `trajectory-frontend-checks.json` record
commands, exit codes, durations and logs for pinned Node 22.23.2/npm 10.9.8 checks.
`run_frontend_checks.py` reproduces that sequence in a prepared snapshot.

- `main-backend-tests.log`: 2,142 backend tests pass using `ci/backend-test-requirements.txt` on Python 3.12.13.
- `trajectory-backend-tests.log`: 458 tests pass after adding the missing TestClient dependency `httpx2` to a temporary runtime-requirements environment.
- `main-fresh-install.log`, `trajectory-fresh-install.log`: requirements-only collection failures, separately retained.
- `main-ci-contracts.log`: 21 verifier/workflow tests pass.
- `science-gate.log`, `science-gate/summary.json`, and JUnit files: exact-commit baseline and six killed mutants.
- `main-python-freeze.txt`, `trajectory-python-freeze.txt`: resolved environments. These are observations, not edits to project dependency declarations.
- `h1-archive-discovery.json` and `*-with-h1-archive.log`: both branches' ordinary `npm test` fails when the existing H1 archive is copied into their temporary trees. The archive was removed afterward. Six archive suites fail; product suites pass.
- `historical-archive-discovery.json` and `*-with-historical-archive.log`: copying only October 7 evidence causes no discovery failures. It contains no offending test suites.

The initial dependency install used the host Node 24/npm 11; the recorded frontend
validation commands use the declared Node 22.23.2/npm 10.9.8 binaries. Browser probe
scripts use host Node 24 and cached Chromium/SwiftShader as documented separately.
No actual GitHub Actions run or repository branch-protection setting was inspected.

`main-node-contracts.log` records an **invalid audit invocation** of Vitest suites
with Node's native test runner. It is not a product failure and is excluded from
the validation matrix. Those suites run successfully under the supported `npm test`.

## Probe interpretation

The domain reports give complete probe commands and temporary environment paths.
Rebuild those disposable environments/snapshots if `/tmp` has been removed. Audit
scripts print observations: **exit 0 means the probe completed, not that the
reported product invariant passed**. They are not new passing product tests.

Frontend scene probes expose lexical objects through Playwright response
interception and suppress drawing for deterministic inspection. The separate
browser bootstrap probe leaves drawing active. CPU shader-transform checks are
not GPU readback. Backend probes use local fixtures, clock/transport stubs and
actual numerical routines; no upstream load or production service was targeted.

The `.gitignore` here deliberately retains `.log` files that the repository-wide
ignore pattern otherwise hides. Nothing was staged or committed. Preserve the
tracker and this entire directory together when intentionally archiving the work.
