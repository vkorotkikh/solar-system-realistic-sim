# SCN-042 production frame wiring checkpoint

Assigned worktree: `solar-remediation-20261014-solar`, branch `remediation/20261014-solar`.
Parent integration owns `src/main.ts`; apply `SCN042_MAIN_HANDOFF_2026-10-14.patch`
there when integrating this checkpoint. No master tracker or observation helper was edited.

## Behavior

- Backend synthetic snapshots declare frozen, Z-up `SOLAR_EQUATORIAL_J2000`
  coordinates (defined as `IAU_SUN` at J2000), their TDB epoch, units, source,
  and unvalidated calibration status per layer. Observed PFSS native frames remain unresolved.
- The active Sun controller admits PFSS, loops, spots, Parker geometry, CMEs,
  and coronal holes independently. Missing/incompatible provenance, malformed vectors,
  explicit rendering revocation, and observed PFSS tags are rejected.
- Frozen geometry is attached below the Sun translation parent and transformed to
  ECLIPJ2000. The surface alone uses the evolving IAU orientation. Surface feature
  coordinates remove that rigid phase so their world positions do not spin twice.
- Existing `lockBodySpin` child orientations are preserved. Newly owned surface
  children discard catalog scalar rotation once, then remain locked.
- CME mesh and shader longitude conventions agree. `BACKEND_GEOMETRY_VALIDATED`
  remains false; the delivery status explicitly reports uncalibrated synthetic geometry.

## Fresh checkpoint checks

- Full frontend: **443 passed, 31 files**, exit 0.
- Backend frame contract, solar physics model, and PFSS cache: **163 passed**,
  exit 0 (67.10 seconds).
- Production build: exit 0; existing bundle-size warning remains.
- TypeScript ratchet: exit 0, **217/226** baseline diagnostics, no bucket regression.
  Strict typecheck is not green: 217 legacy diagnostics remain outside this change.
- `git diff --check`: exit 0.
- Follow-up full backend suite: **2,358 passed, zero skipped**, exit 0, 227.10 seconds.
  Two existing Starlette/httpx/AnyIO deprecation warnings remain. This is the
  assigned branch's suite, not the parent's broader integrated test count.

The production-controller regression uses the independent CSPICE matrices at display
epochs 2451545, 2451552, and 2461326.238888889. It checks pole and prime meridian,
PFSS world geometry, surface feature alignment, and spin locks. Initial failures
exposed an incorrectly embedded 3x3 reference matrix, overwritten existing spin
locks, ignored explicit rendering revocation, and a null-hole exception. These
were corrected without widening scientific tolerances.

Commands (run from the assigned worktree):

```sh
export PATH=/tmp/solar-remediation-solar-toolchain-20261014/node_modules/node-linux-x64/bin:$PATH
node /tmp/solar-remediation-solar-toolchain-20261014/node_modules/npm/bin/npm-cli.js test
node /tmp/solar-remediation-solar-toolchain-20261014/node_modules/npm/bin/npm-cli.js run typecheck:ratchet
node /tmp/solar-remediation-solar-toolchain-20261014/node_modules/npm/bin/npm-cli.js run build
PYTHONPATH=backend PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt python -m pytest -q backend/tests/test_solar_frame_contract.py backend/tests/test_solar_physics_model.py backend/tests/test_pfss_cache.py --tb=short
```

The supplied shared `/tmp` toolchain was absent and its reconstruction failed.
An isolated copy uses the same pinned Node 22.23.2 and npm 10.9.8.

## Remaining integration boundary

This checkpoint does not close SCN-042 application delivery: the lifecycle owner
must integrate the main-scene handoff and rerun the integrated hardware screen
oracle and delivery checks. No observed Carrington calibration is asserted.
SCN-041's full-domain accuracy gate remains failed; its numerical investigation
follows this checkpoint. Parent ACE overlap work is external-model-only and is
not replaced by this frame change.
