# Solar canonical-register remediation, 2026-10-14

## Integration checkpoint

- Worktree: `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-solar`.
- Branch: `remediation/20261014-solar`.
- Baseline: `5be8696db4008bc969d09c3cbd258ba911580a07`.
- Code and regression checkpoint: `870de80` (`fix(solar): own acquisition deadlines and unify persistent solar physics`). Integrate this checkpoint before the SCN-005 delivery/full-suite gate; do not wait for observed WSA calibration.
- This report, external captures, and capture-integrity tests are a separate follow-up commit. No push, merge, master-tracker edit, subagent, websocket-runner edit, or unrelated composition change was performed.
- Existing SCN-052/053/056/064 behavior and tooling were preserved. Full integrated release gates belong to the controller and are NOT claimed here.

## Issue-by-issue disposition

| Issue | Disposition in this worktree | Evidence and remaining limits |
| --- | --- | --- |
| SCN-004 | FIXED, focused POSIX validation | Acquisition occurs in an owned disposable subprocess. Parent deadlines kill and reap DNS/header/body work and close IPC, rather than abandoning a waiting thread. GONG keeps its phase/framing checks inside the child. Repeated stalled DNS, slow headers/body, recovery, interrupt cleanup, byte limits, redirects and truncated chunk errors are exercised. Windows/other platforms were not validated. |
| SCN-010 | FIXED | Complete/partial/failed cache states; failed or partial snapshots retry after the bounded 4.5-second error backoff rather than 300 seconds. A bounded, detached, identity-keyed last-good SWPC cache preserves usable data without renewing its source age. |
| SCN-041 | VERIFY, NOT CLOSED | Independent analytic topology/speed checks added; actual NASA WSA/PFSS reference products and NOAA plasma observations captured. No matched observed/reference speed-map calibration has been established. `WSA_CALIBRATION_STATUS` remains `unvalidated`; no empirical accuracy claim is made. Detailed blockers below. |
| SCN-050 | FIXED | Active frontend fallback normalizes at the parameterized analytic maximum, not month 66.1. Backend and frontend share independently generated high-precision shape fixtures. No artificial clipped plateau. |
| SCN-051 | FIXED | Admission authenticates retained original expanded FITS bytes, reparses them, and compares the resulting science/grid/provenance. It no longer attempts a lossy inverse reconstruction of floating-point pixels. Every supported BITPIX encoding is covered in G and T, with tampering rejection. |
| SCN-075 | FIXED for synthetic-model consistency | One immutable region population supplies seed, rotation, smooth lifetime, birth-cycle Hale polarity, PFSS map and physics footpoints. No time-bucket bipole redraw. These are synthetic regions, not measured active-region reconstructions. |
| SCN-042 | OPEN, renderer/frame handoff | Backend region/map spatial consistency is tested, but that is not an independent rendered solar-frame validation. Backend geometry remains gated by `BACKEND_GEOMETRY_VALIDATED=false`. No frame-reference capture or renderer enablement is claimed. |
| SCN-005 | Controller delivery gate pending integration | Controller reports working RTX 5090 headful WebGL under WSL. This removes a reported hardware-availability obstacle, not the need to run and retain the integrated delivery/frame evidence. |

## Repairs and root-cause evidence

### SCN-004: acquisition owns the work, not just the wait

Baseline reproduction: a monkeypatched blocking resolver sleeping 0.7 seconds caused an acquisition with a 0.15-second budget to return after 0.702 seconds. Bounding socket/body reads did not own blocking resolution or header acquisition.

`backend/sim/solar_http_transport.py` is a standard-library worker protocol with an absolute monotonic deadline, bounded request/control/data frames, parent-side pipe polling, and synchronous kill/reap/pipe closure on timeout, failure or cancellation. The worker also arms a POSIX alarm. DNS, connection setup, TLS, headers and body reads are inside the disposable process. Tests deliberately disable the worker alarm in a stalled resolver to prove that parent ownership, not the alarm alone, reclaims repeated stalled children.

`backend/sim/solar_realtime_data.py` uses this boundary while preserving its origin, redirect, media and byte restrictions. `backend/sim/gong_magnetogram.py` exposes the same owned boundary and retains its original phase-aware transport as the worker-only implementation. Typed error control frames preserve GONG errors such as `truncated_body`; they cannot be confused with body bytes. Parser/phase unit tests use their in-memory transport seam; separate tests exercise the real public subprocess boundary.

Files: `backend/sim/solar_http_transport.py`, `backend/sim/solar_realtime_data.py`, `backend/sim/gong_magnetogram.py`, `backend/tests/test_solar_http_deadline.py`, `backend/tests/test_solar_realtime_data_transport.py`, `backend/tests/test_gong_archive.py`.

### SCN-010: distinguish retry state from usable data

Failure and partial entries receive the short backoff TTL. Successful SWPC samples are retained in an entry-count-bounded LRU by exact snapshot identity, with wall-clock source-age and monotonic expiry limits. Failed refreshes do not renew the observation timestamp or lifetime. Returned data are detached; last-good delivery carries explicit `last_known_good`, `refresh_ok=false` and failure provenance. A partial snapshot remains usable after the final source exhausts its owned deadline. Historical and latest identities do not share fallback observations.

Files: `backend/sim/solar_realtime_data.py`, `backend/tests/test_solar_realtime_recovery.py`. Existing cache, SILSO and SWPC regression suites also pass. This does not turn stale observations into live data or replace SILSO's separate provenance rules.

### SCN-050: one analytic shape, two implementations

For the Hathaway shape, the peak condition in `s=(t/b)^2` is `exp(s)*(3-2*s)=3*c`. The default peak is 58.38975912570091 months, not 66.1. The frontend now solves that condition and normalizes at the actual parameterized maximum. The fixture was generated independently using 65-digit Decimal arithmetic and 240 bisection iterations, with four parameter sets and twelve samples per set, without production imports. Before repair the frontend regression had five failures and one pass, including 1,511 clipped plateau samples.

Files: `src/sunController.ts` (analytic functions/exports only), `src/frontend/features/solar/solarCycle.test.ts`, `backend/tests/test_solar_cycle_reference.py`, `backend/tests/fixtures/solar_hathaway.json`. Source: Hathaway (2015), equation 6, [The Solar Cycle](https://arxiv.org/html/1502.07020). This is an analytic oracle, not a fit to new observed cycle data.

### SCN-051: authenticate the representation that was parsed

The old admission path could not recover the original bytes from scaled float values, so parser-accepted inputs failed their own SHA admission. Frozen provenance now retains bounded native expanded FITS bytes; admission verifies their hash/header, reparses the artifact, and compares parsed data/provenance. Original bytes are not included in public API serialization. All six supported BITPIX encodings (8, 16, 32, 64, -32, -64), nontrivial scaling and G/T units round-trip. Field mutation, native-byte mutation and digest/provenance tampering remain rejected.

Files: `backend/sim/gong_magnetogram.py`, `backend/sim/pfss_magnetogram.py`, `backend/tests/test_gong_encoding_roundtrip.py`, `backend/tests/test_pfss_decomposition.py`. Retained artifacts remain subject to the existing expanded-FITS cap; retaining bytes has a bounded memory cost. This does not enable the separately gated observed PFSS runtime.

### SCN-075: persistent regions across physics layers

`backend/sim/solar_active_regions.py` owns immutable seeds, the existing differential-rotation profile, smooth periodic emergence/decay and polarity assignment at region birth. `SolarPhysicsModel` and its `PFSSCache` receive the same population. Each bipole's map centers and signs agree with the physics footpoints; polarity does not jump at a cycle boundary while the region is alive. Magnetic field, Alfven quantities and brightness share lifetime weighting. Dormant regions are not emitted. The synthetic transform identity is versioned to prevent reuse of old bucketed maps.

The former 0.01-day bucket boundary produced approximately 1.465 relative map change in the reproduction; the continuity regression requires less than 1e-4 across that boundary. Tests cover both hemispheres, cycle polarity changes between emergences, continuity within a living region, Joy geometry, rotation, quiet intervals, seed-dependent maps and magnetic/Alfven consistency. The previous test demanding an instantaneous whole-population polarity flip at minimum was replaced with a new-emergence comparison.

Files: `backend/sim/solar_active_regions.py`, `backend/sim/solar_physics.py`, `backend/sim/pfss_magnetogram.py`, `backend/tests/test_solar_region_consistency.py`, `backend/tests/test_solar_physics_model.py`. Physical conventions: Hathaway (2015), sections 3.6 and 4.13, and [Snodgrass and Ulrich (1990)](https://articles.adsabs.harvard.edu/pdf/1990ApJ...351..309S). The chosen recurrence/lifetime envelope remains a documented synthetic assumption, not observational evidence.

## SCN-041: actual external evidence and explicit blockers

### Added independent analytic checks

`backend/tests/test_wsa_analytic_topology.py` derives a dipolar flux-function oracle without production field/tracing helpers. It checks open/closed domains, endpoints and expansion factors for three tilts and both polarities, an independently calculated aligned-dipole speed map (0.05 km/s numerical budget), and quadrupolar polar/equatorial topology. These eight cases strengthen numerical/topological coverage. They do not independently calibrate the empirical wind-speed law against the Sun. [NSO's PFSS description](https://nso.edu/data/nisp-data/pfss/) supplies the model/boundary context.

### Captured provider products, not generated stand-ins

Raw response bodies and HTTP headers are committed under `agent-notes/solar-reference-2026-10-14/`. `manifest.json` and `requests.tsv` record exact URLs, UTC capture starts, byte counts, SHA-256 digests, product roles and limitations. No application solar-model output was substituted for these artifacts.

| Artifact | Actual captured content | SHA-256 |
| --- | --- | --- |
| `nasa_wsa_ace.json` | NASA WSA AGONG/ACE ensemble forecast, 17 six-hour slots, 13 non-null speeds | `3eeb807edca46fc8206387f40797de80aaf59ca4ff667ee60255a7b04c6755c0` |
| `noaa_rtsw_wind_1m.json` | NOAA operational multi-spacecraft plasma observations, 3,562 records, 2,637,253 bytes | `12f89300b5c7dc67f3702fbd1ba459d8df3b531ff1d18b5f67ea915170e3fc3d` |
| `nasa_wsa_gongz_202610121744.fits` | NASA WSA 6.2 GONG-Z coronal reference, 754,560 bytes; primary image has ten 90x180 maps | `5b8f1da9e8bcf057b1c86ecd80207166e3362e1ecb92db7a54499ec7bf192035` |
| `nasa_pfss_gongz_202610121744.osfls` | NASA same-epoch PFSS in-to-out field-line reference, 178,948 bytes; binary payload retained, not decoded | `c76da8e6f8322ba4c55703f52f0991fac7bd48864a0661583467d07c99aee520` |

The FITS primary header identifies `WSA_V6.2`, observation `2026:10:12_17h:44m:00s`, Carrington rotation 2316, longitude 79 degrees, source map `mrzql261012t1744c2316_079`, and 90 harmonics. Its arrays include expansion factors, photospheric field/footpoints, boundary distance and independent open/closed classification. Captured topology counts are closed=12,883, in-to-out only=570, out-to-in only=243, both=2,504. This is genuinely independent provider topology, but no agreement score against our solver has yet been established. The primary image is NOT itself a wind-speed image; its other HDUs were not scientifically interpreted here.

Capture tests (`backend/tests/test_solar_external_reference.py`) assert byte identity, metadata and actual open/closed coverage, and explicitly retain the unmatched forecast/observation window. Their six passes are evidence-integrity checks, NOT calibration passes.

### Remaining requirements, not a generic network-access blocker

1. Construct and document a matched-input comparator. The reference uses `RADSS=2.51`, `RADINT=2.49`, `RADOUT=5.0`, PFSS plus Schatten current-sheet processing, and a provider map/frame convention. Our WSA-inspired synthetic source-surface calculation is not the same model. A Carrington grid/orientation, monopole treatment, radial-boundary and harmonic-resolution adapter must be validated before comparing topology/expansion/speed values. Do not silently compare 2.5 Rs and 5 Rs cells or unrelated magnetograms.
2. Decode the independent `.osfls` format against its producer specification and retain coordinate/epoch provenance. Capturing a binary field-line file does not validate its coordinate interpretation or renderer transform.
3. Obtain overlapping observation/forecast windows for the same spacecraft and product. The last non-null captured ACE forecast is 2026-10-13 00:00; the NOAA capture begins after 05:27 that day. Later captured WSA slots are null. No valid paired speed-error statistic can be computed from this pair. The legacy seven-day plasma URL returned HTTP 404 (headers retained); the current official RTSW endpoint succeeded.
4. Preregister physical comparison/error criteria, compare source-surface/reference topology and speed maps, and separately account for propagation to L1 before reporting observed skill. The captured AGONG/ACE forecast and GONG-Z coronal map are distinct products and must not be presented as a single matched run.
5. Retain `unvalidated` until those comparisons succeed. Provider access is no longer the main blocker; scientific comparability and missing matched data/evaluation are. No claim of observational calibration, PFSS-reference agreement or scientific renderer correctness is made.

Primary provenance: [NASA WSA Dashboard and API](https://ccmc.gsfc.nasa.gov/community-tools/WSA-Dashboard/), [NASA WSA 6 model description](https://ccmc.gsfc.nasa.gov/models/WSA~6/), [NASA WSA6 data tree](https://iswa.ccmc.gsfc.nasa.gov/iswa_data_tree/model/solar/WSA6/), [NOAA solar-wind product description](https://www.spaceweather.gov/products/solar-wind). Dashboard publication attribution: DOI `10.5281/zenodo.8417483`; WSA model attribution: Arge and Pizzo (2000), DOI `10.1029/1999JA000262`. NASA model outputs are forecasts/reference calculations; NOAA RTSW supplies operational in-situ observations, not a measured full-Sun source-surface speed map.

### SCN-042 / SCN-005 handoff

SCN-042 still requires an independent solar-frame specification and rendered checks for axes/poles, longitude sense, epoch/rotation and feature overlays. The backend z-up inertial region agreement is not that check. `BACKEND_GEOMETRY_VALIDATED=false` was not changed. No UI composition/frame transform was enabled just to make a browser capture look successful.

Controller reports real RTX 5090 headful WebGL works with `GALLIUM_DRIVER=d3d12`, `LD_LIBRARY_PATH=/usr/lib/wsl/lib`, `--use-gl=angle --use-angle=gl`. Available Chromium: `/home/nomad/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`. This implementer did not run that hardware capture. The controller should apply `870de80`, integrate the other domain fixes, then run SCN-005 and the full gates, preserving actual adapter/frame evidence. Hardware absence must not be listed as the current blocker.

## Exact validation commands and results

Commands were executed only in the assigned worktree. New worktree dependencies were installed locally because the proposed root `node_modules` symlink target did not contain dependencies. The temporary owned symlink was removed; no root repository dependency changes were made. Frontend runs used pinned Node 22.23.2/npm 10.9.8, not the environment's Node 24.

Initial focused backend red run: 13 failures, 6 passes (cache recovery, FITS encodings, map continuity/seed dependence). Initial frontend shape red run: 5 failures, 1 pass. The baseline blocking-DNS reproduction is recorded above. A later malformed-chunk test reproduced loss of the GONG `truncated_body` error before typed IPC errors repaired it. One broad-suite failure was the old public-provenance field-set assertion; it now explicitly excludes private native FITS bytes. These were resolved before the checkpoint, not hidden as passing runs.

Affected acquisition/cache/FITS/PFSS gate, after repairs: **1,452 passed in 25.26s**.

```sh
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt python -m pytest -q backend/tests/test_solar_http_deadline.py backend/tests/test_solar_realtime_recovery.py backend/tests/test_gong_encoding_roundtrip.py backend/tests/test_solar_region_consistency.py backend/tests/test_solar_realtime_data_cache.py backend/tests/test_solar_realtime_data_transport.py backend/tests/test_solar_silso_cache.py backend/tests/test_solar_swpc_rtsw.py backend/tests/test_pfss_cache.py backend/tests/test_gong_fits.py backend/tests/test_gong_archive.py backend/tests/test_gong_wcs.py backend/tests/test_pfss_decomposition.py backend/tests/test_pfss_analytic_fields.py backend/tests/test_pfss_harmonics.py backend/tests/test_pfss_tracing.py --tb=short
```

Scientific behavior/reference gate: **88 passed in 82.76s**.

```sh
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt python -m pytest -q backend/tests/test_wsa_analytic_topology.py backend/tests/test_wsa_semantics.py backend/tests/test_solar_region_consistency.py backend/tests/test_solar_cycle_reference.py backend/tests/test_solar_physics_model.py --tb=short
```

Frontend solar gate: **5 files, 140 passed in 1.52s**.

```sh
npx --yes --package=node@22.23.2 --package=npm@10.9.8 --call 'npm test -- src/frontend/features/solar/solarCycle.test.ts src/sunController.test.ts src/frontend/features/solar/solarDataStatus.test.ts src/frontend/features/solar/solarRealtimeClient.test.ts src/frontend/features/solar/solarPhysicsClient.test.ts'
```

Final transport rerun after the typed-error IPC repair: **249 passed in 8.85s**. The 1,452-test run preceded that final narrowly scoped IPC change; this affected-boundary rerun followed it.

```sh
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt python -m pytest -q backend/tests/test_solar_http_deadline.py backend/tests/test_gong_archive.py backend/tests/test_solar_realtime_data_transport.py backend/tests/test_solar_silso_cache.py backend/tests/test_solar_swpc_rtsw.py --tb=short
```

External evidence integrity/topology-content gate: **6 passed in 0.06s**, with topology counts printed above. Again, this is NOT a calibration or solver-agreement gate.

```sh
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt python -m pytest -q backend/tests/test_solar_external_reference.py -s --tb=short
```

`git diff --check` passed before the checkpoint. The follow-up source whitespace check excludes verbatim `*.headers` captures: HTTP CRLF, status-line whitespace and terminating blank lines are preserved as received, rather than normalized to satisfy source-code whitespace rules. No entire-backend rerun, frontend build/typecheck, browser capture, hardware probe or integrated delivery pass is claimed by this report. Counts overlap between focused commands and must not be added as unique tests.

## Provider terms / ownership

No blanket public-domain characterization is made. Controller supplied [SILSO's CC BY-NC 4.0 terms](https://www.sidc.be/SILSO/infosndtot) and owns the provenance/NOTICE update; no SILSO observation bytes are included in the new reference bundle. NASA WSA has publication/attribution conditions; retain those alongside each captured product. The NOAA archive's [dataset terms](https://registry.opendata.aws/noaa-wsa-enlil/) apply to that NOAA dataset, not all upstream sources. Owner code-license selection remains pending and was not decided here.
