# SCN-042 actual-main rendered acceptance, 2026-10-15

**Acceptance remains FAILED.** The approved fixture correction improves the
physical RTX 5090 capture from 59/156 to 154/156 marker checks. All 235 surface
probes pass, but two limb footprints exceed the unchanged one-pixel budget and
the first case reports WebGL INVALID_OPERATION (1282). No production repair or
resolved-in-main claim is made.

## Revision and ownership

- Worktree: `/home/nomad/ai/projects/worktrees/solar-canonical-remediation-20261014`.
- Tested HEAD, before and after captures:
  `dbfdbedc306fa7e16b6fcff66adffd2c37cc09a9`.
- Source checkpoint supplied by parent:
  `4f2e2507797eb73d50443711df433e10032cc3fd`.
- Corrected, uncommitted `scripts/verify_solar_main_frame.py` SHA-256:
  `c3a22a63a8abac2639ca1df65bd58d8ca96236f10bbf98dd4170471647703959`.
- Owned files: that harness, this note, and the dedicated
  `agent-notes/SCN042_RENDERED_ACCEPTANCE_2026-10-15/` evidence directory.
- No production files, independent reference, numerical tolerances, master
  tracker, or closure plan were edited. No staging or commit was performed;
  the parent owns integration and committing these files. There is no new
  integration-ready commit hash to report.
- The GPU browser has been closed and its release announced to the parent.
  A process check found no remaining Chromium process. The Vite process started
  for these captures was also stopped; no preexisting process was terminated.

## Approved fixture correction

The independent CSPICE fixture specifies visual marker radii. Production's
enlarged-Sun mapping is `displayRadius = R * (1 + (sourceRadius - 1) * 0.15)`.
Previously a visual radius of 1.03 was fed directly to the PFSS creator as a
source radius, producing a visual radius of 1.0045.

The harness now inverse-maps both synthetic line endpoints before passing them
to the existing production PFSS geometry creator. A desired visual radius of
1.03 uses source radius 1.2; the 1.005 inner endpoint is inverse-mapped as well.
Directions, frame/epoch inputs, expected footprints, surface probes, comparison
rules, and all three negative controls are unchanged. This inversion is scoped
to the enlarged-Sun fixture, not a general display-scale adapter.

## Fresh results

| Run | Exit | Accepted cases | Marker checks | Surface probes | Negative controls detected |
| --- | --- | --- | --- | --- | --- |
| Unmodified harness, `before/` | 1 | 0/6 | 59/156 | 235/235 | 3/3 |
| Corrected harness, `after/` | 1 | 3/6 | 154/156 | 235/235 | 3/3 |
| Corrected diagnostic repeat, `diagnostic/` | 1 | 3/6 | 154/156 | 235/235 | 3/3 |
| Focused Vitest suite | 0 | 4/4 files | 28/28 tests | N/A | N/A |

Vitest reported duration 891 ms. The four files were `solarFrame.test.ts`,
`solarMagnetics.test.ts`, `solarDisplayScale.test.ts`, and `sunController.test.ts`.
No full frontend or backend suite, build, or typecheck was rerun for this
harness-only change. Earlier suite results are not presented as fresh results.

Both corrected captures have identical acceptance outcomes:

| Case | JDTDB | Input frame | Markers | Surface probes | WebGL error | Accepted |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 2451545 | IAU_SUN | 26/26 | 42/42 | 1282 | No |
| 1 | 2451545 | SOLAR_EQUATORIAL_J2000 | 26/26 | 42/42 | 0 | Yes |
| 2 | 2451552 | IAU_SUN | 25/26 | 37/37 | 0 | No |
| 3 | 2451552 | SOLAR_EQUATORIAL_J2000 | 26/26 | 39/39 | 0 | Yes |
| 4 | 2461326.238888889 | IAU_SUN | 25/26 | 37/37 | 0 | No |
| 5 | 2461326.238888889 | SOLAR_EQUATORIAL_J2000 | 26/26 | 38/38 | 0 | Yes |

The legacy-axis control fails 42 surface probes; the double-spin control fails
21 markers; handedness reversal fails 14 markers. Each control has WebGL error
zero, so detection does not depend on the startup WebGL failure.

## Remaining failures and diagnostic evidence

- Case 2, `lon90_lat0`: one actual marker pixel versus three expected pixels.
  Footprint-centroid error is exactly 1.0 pixel, but expected-to-actual maximum
  pixel distance is 2. The one-pixel bidirectional footprint gate correctly fails.
- Case 4, `lon270_lat0`: nine actual marker pixels versus 18 expected pixels.
  Footprint-centroid error is 1.3252067157640137 pixels, and expected-to-actual
  maximum pixel distance is 3. Both exceed the unchanged budget.
- Case 0: all markers and surface probes pass, but WebGL reports 1282 in all
  three runs, including the unmodified baseline. The diagnostic console records
  `THREE.WebGLProgram` shader validation failure and
  `WebGL: INVALID_OPERATION: useProgram: program not valid`. The full shader
  compiler output is retained in `diagnostic.log`. The underlying shader defect
  was not repaired or assigned to a production file in this bounded task.
- The diagnostic log also retains offline-provider HTTP 503 messages, a
  procedural fallback warning, a catalog performance-budget warning, and a
  multiple-Three.js-instances warning. The reports' empty `errors` arrays mean
  zero uncaught page errors, not zero browser console errors.

The diagnostic repeat added console listeners and printed exact actual/expected
pixel sets through an in-memory wrapper around the existing comparison function.
It returned the original comparison results unchanged and did not consume or
clear WebGL errors. No harness source was changed after the single fixture patch.
No cause is asserted for the two remaining limb discrepancies without further
investigation. Parent follow-up is required before claiming a hardware pass.

## Runtime and reproduction

Hardware renderer in every capture:
`ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 5090), OpenGL 4.6)`.
The context is WebGL 2.0 with antialiasing enabled. The harness rejects a missing
RTX 5090 identity or SwiftShader. This was a headful hardware run, not software
rendering. Chromium was 153.0.8010.12, Playwright 1.64.0, Pillow 12.3.0, and
Node 22.23.2; Vite reported 7.3.7 and Vitest 5.0.4.

The supplied `/tmp/solar-remediation-toolchain-20261014/` was absent, so the same
Node version was used from its existing npm cache. Vite was not initially running.
The recorded server and corrected acceptance commands, from the worktree, were:

```bash
export PATH="/home/nomad/.npm/_npx/f4985f1adc097c41/node_modules/node/bin:$PATH"
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5188 --strictPort

env GALLIUM_DRIVER=d3d12 MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA \
  LD_LIBRARY_PATH=/usr/lib/wsl/lib PYTHONHASHSEED=0 OMP_NUM_THREADS=1 \
  OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC \
  uv run --offline --python 3.12 --with playwright==1.64.0 --with pillow \
  python scripts/verify_solar_main_frame.py --origin http://127.0.0.1:5188 \
  --out agent-notes/SCN042_RENDERED_ACCEPTANCE_2026-10-15/after

node node_modules/vitest/vitest.mjs run \
  src/frontend/features/solar/solarFrame.test.ts \
  src/frontend/features/solar/solarMagnetics.test.ts \
  src/frontend/features/solar/solarDisplayScale.test.ts src/sunController.test.ts
```

Run the server separately. For any new capture use a fresh `--out` directory;
the harness intentionally refuses to overwrite an existing evidence directory.
The named capture output and test output were redirected to the corresponding
`.log` files. `SHA256SUMS` inventories the retained evidence.

## Evidence and acceptance boundary

The originally supplied `/tmp/solar-main-frame-55067da-20261014/` did not exist
when this session checked it. It was not modified, removed, or recreated. The
new `before/` capture is explicitly a fresh reproduction, not a replacement
represented as the original historical evidence. Recovery of that historical
directory requires another retained copy.

Each of `before/`, `after/`, and `diagnostic/` retains six reference PNGs, three
negative-control PNGs, and its complete `results.json`. The evidence directory
also contains their logs and `frontend-tests.log`.

The probe executes actual main/controller transforms and the actual WebGL
renderer, with a diagnostic surface fragment shader and production-PFSS-geometry
ID markers. It checks both declared frames at three epochs against the unchanged
independent CSPICE reference, using the specified 800x600 camera, 20-degree field
of view, and one-pixel budget. Providers are disabled and markers are synthetic.
This does not validate live delivery, observed calibration, every enabled layer,
the production artistic fragment output, all cameras, or all epochs. SCN-042
hardware acceptance and integration remain open.

## Final root-cause investigation result, 2026-10-15

The two remaining limb failures are a harness/reference sampling mismatch.
The startup WebGL 1282 is an independent production asteroid shader defect.
Both causes were isolated on the physical RTX 5090 without changing production
files, the acceptance harness, the reference geometry, the one-pixel budget,
or the three negative controls. The original report and evidence above remain
intact; this section is appended once as the final investigation result.

Tested HEAD remains `dbfdbedc306fa7e16b6fcff66adffd2c37cc09a9`; the uncommitted
harness SHA-256 remains
`c3a22a63a8abac2639ca1df65bd58d8ca96236f10bbf98dd4170471647703959`.

### Limb footprint cause and exact coordinates

The independent reference generator models aliased nine-pixel points using
pixel-center visibility against a sphere. The earlier component renderer uses
`antialias:false`. Actual main's `createSceneSetup` uses `antialias:true`, and
its hardware context reports four samples. The harness extracts only pixels
within two RGB units of the unblended marker color, with a red-channel floor
of 205. Multisample resolution blends partial marker coverage with the surface
or background, so those covered pixels are omitted by that ID extractor.

- Case 2, JDTDB 2451552, IAU_SUN, `lon90_lat0`: expected pixels are
  `(243,271)`, `(243,272)`, `(243,273)`. The marker color is `(210,85,80)`.
  Only `(243,271)` retains that color. Both missing pixels are `(197,74,100)`
  under four-sample rendering, matching partial marker/surface coverage.
  The extracted centroid differs by 1.0 pixel, and the maximum missing-pixel
  distance is 2 pixels.
- Case 4, JDTDB 2461326.238888889, IAU_SUN, `lon270_lat0`: the marker color is
  `(210,195,80)`. Nine of 18 expected pixels are rejected: `(546,231)`,
  `(546,232)`, `(546,233)`, `(546,234)`, `(546,235)`, `(545,236)`,
  `(546,236)`, `(546,237)`, `(546,238)`. At x=546, y=231 through 237,
  the observed RGB is `(157,146,60)`; `(545,236)` is `(185,117,60)`;
  `(546,238)` is `(102,69,40)`. These are resolved coverage blends.
  The extracted centroid differs by 1.3252067157640137 pixels and the maximum
  missing-pixel distance is 3 pixels.

Changing only the diagnostic context to single-sample rendering restores the
exact marker RGB at every listed coordinate and passes all 156 marker checks.
The actual main scene, controller transforms, 128-by-96 Sun sphere geometry,
marker positions, camera, reference and comparator are otherwise identical.
Across all six cases and 156 anchors, the maximum independently referenced
projection error is `6.2283453867584895e-6` pixels and maximum normalized world
position error is `3.871380354074099e-8` solar display radii. Thus these two
failures do not demonstrate a frame, projection, or surface-geometry error
within the tested cases; the incompatible sampling contracts explain them.

A future acceptance-harness repair needs an explicit sampling contract, such
as a single-sample diagnostic ID/depth render target using the actual renderer,
or an independently specified multisample coverage oracle. Disabling production
antialiasing, increasing pixel/color thresholds, or dropping partial footprints
is not proposed here. The single-sample context run below is a diagnostic control,
not an accepted change to the default production capture.

### Startup shader cause and exact compile/link errors

The failed material is the production asteroid belt's instanced
`MeshStandardMaterial`. Its source owner is
`src/frontend/features/asteroids/beltRenderer.ts:70`.
`createOrbitMaterial` injects `ASTEROID_ORBIT_VERTEX_SHADER.header` immediately
after Three.js's `<common>` include. The assembled shader already contains
`#define PI 3.141592653589793`, then the injected header declares
`const float PI = 3.141592653589793;`.
Macro expansion turns the declaration into the invalid statement
`const float 3.141592653589793 = 3.141592653589793;`.

Exact driver diagnostics, captured before the harness's diagnostic setup:

```text
Vertex compile status: false
ERROR: 0:155: '3.141592653589793' : syntax error

Fragment compile status: true
Fragment compile log: empty

Program link status: false
Vertex shader is not compiled.

WebGL: INVALID_OPERATION: useProgram: program not valid
```

The generated vertex and fragment sources are retained in
`rootcause-msaa/program-0-vertex.glsl` and `program-0-fragment.glsl`.
This is an actual startup production shader failure, not a Sun-frame error,
provider error, or tolerance issue. It occurs before the diagnostic material
swap; the first acceptance case observes the pending GL error.

For causal confirmation only, an in-memory `shaderSource` wrapper removed the
single duplicate declaration from the asteroid shader, leaving all expressions
to use Three.js's identical PI macro. Both stages then compiled successfully
with empty compile logs, and the program linked successfully with an empty
link log. All six reference cases reported WebGL error zero. No GL error was
consumed early, cleared, ignored, or filtered from the acceptance result.

The proposed production write path was communicated to the parent before any
production edit: `src/frontend/features/asteroids/beltRenderer.ts`. A robust
repair can rename the injected constant and its uses to an asteroid-specific
identifier, preserving standalone shader use and the exact numerical value.
No production edit was made; parent coordination/integration is still required.
An assembled MeshStandardMaterial shader compile regression should accompany
that repair, since a standalone shader does not contain the conflicting macro.

### Controlled hardware results and retained evidence

| Diagnostic variant | Harness exit | Accepted cases | Markers | Surface probes | Negative controls | First-case GL error |
| --- | --- | --- | --- | --- | --- | --- |
| Default main, four samples | 1 | 3/6 | 154/156 | 235/235 | 3/3 detected | 1282 |
| Single-sample context only | 1 | 5/6 | 156/156 | 235/235 | 3/3 detected | 1282 |
| In-memory duplicate-declaration removal only, four samples | 1 | 4/6 | 154/156 | 235/235 | 3/3 detected | 0 |
| Both diagnostic controls | 0 | 6/6 | 156/156 | 235/235 | 3/3 detected | 0 |

All later reference cases have GL error zero. The unchanged negative controls
reject legacy axis via 42 surface probes, double spin via 21 markers, and
handedness reversal via 14 markers. The evidence-only probe itself exits zero
when its instrumentation finishes; each row's harness exit is recorded separately.
The fourth row proves the isolated causes and is not an unmodified production
hardware acceptance pass. Full suites were not rerun during this diagnosis.

New evidence is under the existing dedicated evidence directory:

- `rootcause_probe.py`: reproducible shader-link capture, projection comparison,
  and sampling A/B instrumentation that executes the unchanged acceptance harness.
- `rootcause-msaa/` and `rootcause-single-sample/`: complete harness reports,
  nine captures each, structured diagnostics, exact failing shader sources,
  expected-pixel RGB values, and all marker projection comparisons.
- `rootcause-summary.json` and `rootcause-probe.log`: full A/B results.
- `shader-control/`: the same paired experiments with only the duplicate
  declaration removed in memory, including successful compile/link status/logs.
- `shader-control.log`: full control results; `SHA256SUMS-rootcause`: hashes of
  the new investigation evidence. The earlier checksum manifest is unchanged.

The GPU browser has been closed and released to the parent/startup agent; the
Vite process started for this investigation was stopped. Known parent tracker
and closure-plan edits were preserved. No production file, acceptance harness,
reference fixture, or existing evidence file was edited. No commit was created.
Default-main acceptance remains failed until the coordinated production shader
repair and a principled acceptance sampling contract are integrated and rerun.
