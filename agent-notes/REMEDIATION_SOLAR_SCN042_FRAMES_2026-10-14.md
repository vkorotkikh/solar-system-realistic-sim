# Solar remediation: SCN-042 independent frame and screen oracles

Date: 2026-10-14. Worktree: `solar-remediation-20261014-solar`.

## Status and integration boundary

- SCN-042: component-level frame repair and independent hardware projection validation implemented. Full-application closure remains pending the UI owner's integration and delivery run. This is not a claim that the current main scene is fixed.
- SCN-041: remains open against measured accuracy requirements. Separate commit `313ccac` contains the matched NASA reference comparison and explicit failing accuracy gate. No production PFSS changes are included here; `backend/sim/pfss_magnetogram.py` remains at the integration checkpoint.
- SCN-004/010/050/051/075: earlier implementation checkpoint `870de80`; evidence/provenance checkpoint `9a5499f`. See `REMEDIATION_SOLAR_2026-10-14.md` for their tests and limits.
- SCN-005: not claimed. This standalone component harness does not replace full application delivery validation. No websocket runner, main composition, master tracker, or global backend-geometry enablement changes.

## Root cause and repair

The existing main-scene Sun orientation uses a minimal local-Y-to-pole rotation with the catalog's 7.25-degree tilt and default pole longitude. It misses the primary reference pole by **1.792009043 degrees**. A tilt angle alone does not specify the pole direction or prime meridian. In addition, backend solar geometry is Z-up while the solar surface uses local Y-up. Already-rotated model vectors must not receive a second body spin.

New `src/frontend/features/solar/solarFrame.ts` implements explicit, right-handed transforms:

- `IAU_SUN`: body-fixed, Z-up vectors at the supplied `jdTdb`.
- `SOLAR_EQUATORIAL_J2000`: explicitly defined model frame frozen to `IAU_SUN` at J2000. Time evolution already present in backend coordinates is not applied again. This binding is not evidence that untagged provider data uses this frame.
- `solarFrameToEclipticMatrix`: either declared input frame to ECLIPJ2000, with epoch and frame validation.
- `solarSurfaceToEclipticMatrix`: local Y-up surface to ECLIPJ2000, preserving the shader's north and longitude conventions.
- `solarVectorToSurfaceLocal`: converts a declared backend vector into the rotating surface's local coordinates without a second spin.
- `applySolarGeometryFrame`: applies the frame quaternion without changing translation/scale and marks the object against extra body spin.

`createMagneticFieldLinesFromPFSS` accepts an optional fourth `SolarFrameContext` argument and uses this adapter on actual production PFSS geometry. Existing three-argument callers retain their behavior. This is an integration-ready repair, not a silent change to frame semantics for untagged data.

## Independent primary reference

Reference kernel: [NAIF generic planetary constants kernel pck00011.tpc](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc), retained verbatim in `backend/tests/fixtures/solar_frames/pck00011.tpc`.

SHA-256: `3dff7b1dbeceaa01f25467767d3fa25816051c85d162d1edf04acb310ee28bb1`.

The Sun constants are pole right ascension 286.13 degrees, declination 63.87 degrees, and prime meridian `84.176 + 14.1844 * d` degrees, with `d` in TDB days since J2000. ECLIPJ2000 uses the fixed J2000 obliquity. The generator uses **SpiceyPy 8.3.0 / CSPICE N0067** `pxform('IAU_SUN', 'ECLIPJ2000', et)`, not the TypeScript implementation. The reference does not conflate UTC with TDB. The frozen model frame uses CSPICE at ET zero.

`backend/tests/fixtures/solar_frames/generate_reference.py` imports no production solar code. It generates the source-controlled `cspice_solar_frame.json` using CSPICE for frame vectors and independent NumPy camera/ray geometry for expected screen positions, limb occlusion, point footprints, and surface quadrants.

Coverage: JDTDB 2451545, 2451552, and 2461326.238888889; both declared input frames; 26 anchors per case (eight longitudes at three latitudes, plus both poles). Six cases contain 156 marker instances. A fixed independently specified camera, 800x600 viewport, and 20-degree vertical field of view are used. This is not a sweep of every camera, viewport, distance, or epoch.

## Actual screen oracle and reproduction

`agent-notes/solar-frame-browser-2026-10-14/index.html` is a standalone Vite harness. It imports the production PFSS geometry creator and actual solar surface vertex shader. A diagnostic fragment shader encodes physical latitude/longitude signs, rather than relying on subjective visual similarity. The oracle checks the real rasterized geometry endpoints, surface quadrants, and limb behavior against the independently generated reference.

The production artistic fragment shader, full main composition, and complete application UI are deliberately not claimed by this component test.

Commands, from this assigned worktree:

```bash
npx --yes --package=node@22.23.2 --package=npm@10.9.8 --call 'npm run dev -- --host 127.0.0.1 --port 5187 --strictPort'

timeout 90 env GALLIUM_DRIVER=d3d12 LD_LIBRARY_PATH=/usr/lib/wsl/lib PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC uv run --python 3.12 --with playwright==1.64.0 --with pillow python agent-notes/solar-frame-browser-2026-10-14/capture.py

npx --yes --package=node@22.23.2 --package=npm@10.9.8 --call 'npm test -- src/frontend/features/solar/solarFrame.test.ts src/frontend/features/solar/solarMagnetics.test.ts src/frontend/features/solar/solarDisplayScale.test.ts src/sunController.test.ts'
```

Reference regeneration requires the optional `spiceypy==8.3.0` and NumPy runtime and the retained kernel; the normal frontend tests use the committed independent fixture and do not install CSPICE.

## Exact results

- Focused frontend run: **4 files, 28 tests passed**, 1.21 seconds, exit 0. The new frame module accounts for 10 tests. Before implementation, the new suite failed because its module did not exist.
- Headful browser: **Chromium 153.0.8010.12**, supplied executable `/home/nomad/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`, Playwright 1.64.0.
- Actual hardware renderer: **ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 5090), OpenGL 4.6)**, WebGL 2.0. The runner requires this hardware rather than accepting SwiftShader as a hardware pass.
- Final browser run: **6/6 reference cases passed**, exit 0, zero console/page errors and zero WebGL errors.
- **156/156 independent point-footprint checks passed**, including partially occluded billboards. Bidirectional footprint coverage permits at most one pixel of raster-boundary discrepancy; the maximum footprint-centroid discrepancy was 1.0 pixel.
- Of those 156 instances, 30 have robustly visible centers, 58 are robustly hidden, and 68 are partial/limb-adjacent cases. The last group is included in the footprint gate, not silently excluded. For robust visible centers, maximum projection error was **0.627887945 pixels**, RMS **0.470457936 pixels**.
- **235/235 independent surface-pixel probes passed**. Probes avoid exact quadrant boundaries and marker overlays, with an explicit geometric exclusion margin in the generator.
- Three separately captured negative controls were detected: legacy axis (37 marker failure entries, 42 surface failures), double spin (29 marker failure entries), and handedness reversal (19 marker failure entries). Failure-entry counts include distinct footprint, projection, and occlusion checks on the same marker, not necessarily distinct markers.
- `results-initial.json` preserves the initial failed browser attempt: two center-occlusion assumptions did not model the finite nine-pixel point billboard at the limb, and a favicon request produced a 404. The oracle was corrected to model complete independently ray-tested pixel footprints, and a data favicon removed the irrelevant request. No failed case was relabeled as calibrated or omitted.
- `results.json`, `summary.json`, six reference PNGs, and three negative-control PNGs retain the evidence. `summary.json` records screenshot hashes, software/hardware identity, and measured errors.

No full backend suite, full application build, or full application delivery pass is asserted for this frame-only checkpoint. Existing mutant assertions and offline guards were not edited.

## Required UI-owner integration to close SCN-042

1. Attach adapted backend geometry under an ECLIPJ2000-aligned Sun translation parent, not beneath an already tilted/spinning parent. Otherwise a correct local adapter is composed with an incorrect second transform.
2. Use `solarSurfaceToEclipticMatrix(jdTdb)` for the surface's full orientation, including its prime meridian. Do not replace this with a scalar tilt or an unrelated 25.38-day Euler spin.
3. Convert backend active-region positions through `solarVectorToSurfaceLocal` before supplying local-Y-up surface coordinates, using an explicit and correct source frame and TDB epoch.
4. Bind each backend layer's actual coordinate semantics, including PFSS, loops, spots, Parker geometry, and CMEs. Never guess the frame of observed magnetograms from array shape or label model-frame coordinates as validated Carrington observations.
5. Keep `BACKEND_GEOMETRY_VALIDATED=false` until integrated production-scene tests demonstrate that every enabled layer avoids double tilt/spin and agrees spatially. The component adapter alone does not justify switching this global gate.
6. Run the integrated hardware scene/projection and SCN-005 delivery checks after wiring. Preserve these primary-reference budgets and fault controls rather than weakening them to match current rendering.

## SCN-041 unresolved requirements, not an access-only blocker

The matched NASA coefficient/fieldline comparison in commit `313ccac` has the same provider-native frame, input coefficients, epoch, and source-surface radius. At runtime degree 15, all-height tangent median error is 17.300 degrees and p90 is 55.579 degrees; open/closed balanced accuracy is 90.206 percent. These fail the declared broad accuracy budgets. Higher-degree measurements and restricted-height accuracy are retained, not substituted for the failing all-height claim. See `REMEDIATION_SOLAR_SCN041_COMPARISON_2026-10-14.md` for exact commands, metrics, radius coverage, and the deliberately failing `--require-accuracy` gate.

An actual NASA WSA FITS capture and NOAA RTSW observations are retained, but that FITS product contains no wind-speed plane and the available non-null forecast window does not overlap the observation capture. Thus observed speed calibration remains unavailable from these specific captures. Required next work is both a demonstrably acceptable PFSS accuracy/performance repair and matched speed-map or in-situ reference inputs/time windows, not merely capture integrity, a renamed model label, or an assertion against the same formula.

Provider data is not uniformly public domain. SILSO's CC BY-NC 4.0 restriction and the pending owner code-license decision remain with the controller's NOTICE/provenance work; this report grants no additional rights.
