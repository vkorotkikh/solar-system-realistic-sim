# Planets canonical-register remediation, 2026-10-14

Assigned worktree: `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-planets`.

Implementation and verification are complete for SCN-058, SCN-059, SCN-060,
SCN-061, and SCN-083. SCN-042 remains PARTIAL overall; the planetary geometry
and fixed-J2000 frame portions below are verified. No master tracker, solar
implementation, AGN event code, Kepler derivatives, or moon precession code was
edited. No subagents, push, or merge were used.

## Issue status and evidence

| Issue | Status in this scope | Repair and regression evidence |
| --- | --- | --- |
| SCN-058 | FIXED / VERIFIED | Splitting releases the detached parent mesh reference; merging restores a leaf. Constructors establish six-face coverage before evaluation in the attached frame. Destruction clears child ownership. Earth and Mars each pass 12 repeated near/far cycles, complete per-face area accounting, fewer than 2,000 live leaves in the exercised near views, and one shared geometry/material per tree. Far views return to exactly six meshes. Parented cameras and translated/rotated parents use refreshed matrices and camera coordinates in the planet frame. |
| SCN-059 | FIXED / VERIFIED | `setRadius` synchronizes the effective radius, relief amplitude, LOD distance scale, and inward seam-skirt scale. It rejects nonpositive/nonfinite radii and reuses geometry/material. Scale toggling calls it from `main.ts`. Focus distance is 20 radii and minimum camera distance is 1.1 radii for nonstellar bodies, eliminating the fixed 0.01 AU framing floor. Numeric projection tests and browser pixels verify proportional framing across both scale modes. |
| SCN-060 | FIXED / VERIFIED | Each quadtree group supplies a deliberate mean-radius sphere raycast, independent of shader-displaced plane triangles and LOD topology. Hits carry body identity; leaf identity is also populated. Real Three Raycaster tests cover Earth/Mars, both scales, near/far LOD, translated/rotated parents, misses, far clipping, and invisible ancestors. The existing nonrecursive double-click pick path uses the group proxy. |
| SCN-061 | FIXED / VERIFIED | Per-draw `uPatchToCube` transforms the face-local plane before normalization. Mesh transforms remain in the body frame, preventing a second face translation/scale after projection. Pole-safe finite-difference tangents avoid zero cross products. Camera-dependent atmosphere uses a body-local camera position. Actual production vertex-shader execution checks centres, seams, corners, child/grandchild boundaries, relief, finite normals, and transformed coordinates. Chromium rendering additionally exposed and then verified repair of fine/coarse edge cracks using inward skirts. |
| SCN-083 | FIXED / VERIFIED | Cited IAU poles and signed mean prime-meridian rates replace inference from orbital obliquity. The catalog adapts equatorial J2000 poles to the existing ecliptic scene fields. Venus/Uranus use north poles and negative rates; Pluto uses the positive pole and a positive rate. All nine poles and signed angular-velocity vectors match an independent CSPICE fixture. Finite angular sweeps test Earth/Venus/Uranus/Pluto direction. Raw orbital obliquities remain available for unchanged moon-frame code. |
| SCN-042 | PLANETARY SUBSET VERIFIED; OVERALL PARTIAL | Verified fixed-J2000 planetary pole frames, signed spin vectors, projection ordering, geometric seam/centre/corner coordinates, proportional camera framing, and controlled planetary screen coverage. This does not establish solar or AGN display truth, epoch-specific texture meridians, or precision true-of-date Earth orientation. Remaining requirements are listed below. |

## Reproduction and root causes

- Before repair, Earth/Mars far-near-far returned zero meshes instead of six;
  split nodes retained detached mesh references. Moving a parent left 216 meshes
  where a far view required six. Nonrecursive quadtree picking returned no hits.
- Radius changes had no quadtree implementation. Tests first demonstrated the
  missing radius-update contract, then exercised both catalog radii repeatedly.
- Independent pole expectations exposed vector errors of approximately 0.563
  (Earth), 1.999 (Venus), 0.270 (Uranus), and 1.651 (Pluto) before repair.
- The initial EGL test setup needed a complete framebuffer even for transform
  feedback. After correcting that harness issue, the original production shader
  emitted NaN face-centre coordinates. The repaired shader emits finite, bounded
  coordinates for all exercised samples. The harness explicitly rejects GL errors
  and nonfinite output.
- After projection was repaired, Chromium still found a Mars relief-mode hole at
  pixel `(90,58)` and an Earth zero-relief hole at `(51,39)` in the 3.8-radius view.
  Fine spherical edges and coarse chords do not coincide between common vertices.
  Inward skirts seal those T-junctions. Both rendering modes pass after repair.

## Fixed files

- `src/frontend/features/planetary/quadtreeLOD.ts`: lifecycle, current-frame LOD,
  shared skirt geometry, per-draw face coordinates, radius updates, identity and
  mean-sphere raycasting.
- `src/frontend/features/planetary/planetShaders.ts`: projection ordering,
  finite polar tangents, inward skirts, body-local camera direction.
- `src/frontend/features/planetary/planetView.ts`: proportional camera distances.
- `src/data/planetaryRotation.ts`: cited J2000 poles, periodic pole contributions
  at J2000, mean rates, and equatorial-to-ecliptic adapter.
- `src/sim/catalog.ts`: planet-only orientation adapter and explicit metadata;
  no changes to the moon-frame implementation.
- `src/main.ts`: isolated imports, radius update wiring, camera distance wiring,
  and a comment documenting the existing nonrecursive pick path.
- `src/frontend/features/planetary/quadtreeLOD.test.ts`,
  `planetRotation.test.ts`, and `planetView.test.ts`: focused behavioral tests.
- `scripts/planetShaderGeometry.test.mjs` and `scripts/planet-shader-feedback.py`:
  production GLSL transform-feedback tests, explicitly enabled by environment.
- `scripts/verify-planet-rendered-geometry.mjs` and
  `scripts/fixtures/planet-rendered-geometry.html`: native Chromium DevTools
  runner and actual Three/WebGL rendering fixture; no Playwright dependency.
- `scripts/fixtures/planetary-poles-iau-j2000.json`: independent CSPICE oracle.

## Exact validation commands and results

All commands ran in the assigned worktree. The root `node_modules` directory
contained no usable packages. The attempted dependency symlink was replaced by
`npm ci --ignore-scripts --prefix .`, installing only in this worktree. No tracked
dependency manifests or lockfiles changed. Runtime: Node v24.21.0, npm 11.19.0;
the repository requests Node 22.23.2/npm 10.9.8, so matching the pinned CI runtime
remains an integration check.

```sh
PLANET_SHADER_GPU_TEST=1 npm test -- src/frontend/features/planetary/quadtreeLOD.test.ts src/frontend/features/planetary/planetRotation.test.ts src/frontend/features/planetary/planetView.test.ts scripts/planetShaderGeometry.test.mjs src/sim/catalog.test.ts src/sim/sourceFrameOrbit.test.ts src/sim/moonFrames.horizons.test.ts
```

Result: 7 files, 62 tests passed before adding the second (Mars) GLSL case.
Existing catalog, source-frame, and 27 moon-frame tests remained green.

```sh
PLANET_SHADER_GPU_TEST=1 npm test
```

Final result: **32 files, 420 tests passed**, including both Earth and Mars GLSL
cases; no skipped tests in this run. Transform feedback executes the production
shader on **Mesa llvmpipe (LLVM 20.1.2, 256 bits)** via EGL/ModernGL, not a CPU
reimplementation of its projection. There are 180 sampled vertices per planet,
covering all six faces without and with relief plus nested patches. Without
`PLANET_SHADER_GPU_TEST=1`, the two optional-runtime tests are explicitly skipped;
that default does not claim GPU evidence. Enabled tests fail if EGL is unavailable.

```sh
PLANET_TEST_CHROMIUM=/home/nomad/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome node scripts/verify-planet-rendered-geometry.mjs
PLANET_TEST_FLAT=1 PLANET_TEST_CHROMIUM=/home/nomad/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome node scripts/verify-planet-rendered-geometry.mjs
```

Results: **12/12 relief cases and 12/12 zero-relief cases passed** on Chromium
ANGLE/SwiftShader. Each planet and scale mode traverses 20, 3.8, and 20 radii,
with 6, 9, and 6 rendered meshes. Pixel gates require coverage inside the
independently calculated spherical silhouette and no coverage beyond a bounded
relief/antialiasing envelope. The near relief counts were Earth 3,118 pixels and
Mars 3,243 pixels, identical between display/physical modes. Zero-relief near
coverage was 3,100 pixels for both planets/modes. All far cases covered 112 pixels.
There were no WebGL or captured browser console errors. This is actual software
WebGL evidence; discrete hardware/browser-vendor results were not collected.

```sh
npm run typecheck:ratchet
npm run build
git diff --check
```

Results: type ratchet passed with **217/226 legacy diagnostics, no new or enlarged
buckets**. A new Node-only test was moved into the repository's existing `.mjs`
script-test area instead of weakening frontend type settings. Build passed
(49 modules; 940.75 kB main bundle) with the existing large-chunk advisory.
Whitespace check passed. Strict-zero-diagnostic cleanup is left to SCN-025.
No backend tests were needed for these frontend/data changes; controller-owned
backend and combined integration gates were not claimed as passing here.

## Scientific references and oracle provenance

1. [NAIF pck00011.tpc, 2022-12-27](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc),
   sections "Orientation Constants for the Sun and Planets" and "Orientation
   Constants for the Dwarf Planet Pluto". Uses current BODY199/299/399/499/599/
   699/799/899/999 pole and prime-meridian coefficients. Mars/Jupiter/Neptune
   periodic pole terms are evaluated at J2000. Earth is the kernel's retained
   older IAU model, which NAIF explicitly limits for precision work.
2. [NAIF PCK Required Reading](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/pck.html),
   planetocentric coordinate conventions and pole/prime-meridian parameterization.
   The scene conversion is a proper rotation about X by minus the ECLIPJ2000 mean
   obliquity, 84381.448 arcseconds. Direction is represented by pole times signed
   dW/dt, not by independently reversing both pole and period.
3. The offline JSON oracle was produced with **CSPICE_N0067**, using
   `uv run --python 3.12 --with spiceypy python` and the downloaded kernel.
   For each body, `spice.pxform('IAU_' + name.upper(), 'ECLIPJ2000', 0)[:, 2]`
   supplies its pole, and `spice.bodvcd(body_id, 'PM', 3)[1][1]` supplies the
   signed mean degrees/day rate. Epoch is ET=0, J2000 TDB. Kernel SHA-256:
   `3dff7b1dbeceaa01f25467767d3fa25816051c85d162d1edf04acb310ee28bb1`.
   The fixture records source, version, epoch, frame, hash, and values. Assertions
   use vector differences below 1e-12 for the poles and 1e-11 rad/day for angular
   velocities; these are numerical agreement tolerances, not physical accuracy
   claims. No Horizons/provider image capture was invented or substituted.

## Remaining requirements and next actions

- **SCN-042 stays PARTIAL.** The solar owner/controller still needs independent
  solar-frame, coordinate, projection, and screen-space oracles, including known
  observer/epoch geometry and orientation of visible solar features. Existing
  Hathaway normalization, rotation labeling, and Sun pole/presentation work is
  preserved and is not reclassified by this report.
- AGN display truth still needs its own rendered oracle for frame choice, camera
  projection, scale, and visible event placement over time. No AGN event or
  propagation implementation was edited or certified by these planetary gates.
- The planetary model deliberately uses fixed J2000 poles and mean spin rates.
  Full true-of-date precession/nutation, periodic prime-meridian evolution,
  precision ITRF/EOP Earth orientation, and georeferenced texture/absolute-phase
  validation are not implemented or claimed here. Procedural terrain/relief and
  render skirts are presentation geometry, not measured topography.
- Picking deliberately targets the mean sphere, not exact terrain elevations;
  no false claim of terrain-triangle intersection is made. Complete application
  double-click DOM automation is not part of the isolated rendering fixture.
- Controller: integrate the scoped commit, preserve isolated `main.ts` hunks,
  run combined gates under the pinned Node runtime, and continue the outstanding
  solar/AGN SCN-042 oracles and SCN-025 strict type cleanup. Optional physical GPU
  coverage remains uncollected, not passed.

There is no blocker to integrating the completed planetary repairs. The remaining
requirements above prevent closing broad SCN-042, not SCN-058/059/060/061/083.
