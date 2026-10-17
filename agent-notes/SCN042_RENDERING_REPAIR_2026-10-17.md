# SCN-042 rendering repairs and scoped acceptance — 2026-10-17

The two documented blockers are repaired on `fix/scn042-rendering-20261017`,
based on `ec9d184c7f7b38f82a491b45d09f82cdd7496dcb`. The actual-main hardware
frame gate passes all six reference cases, all 156 markers and all 235 surface
probes. All three geometric negative controls remain detected. This is scoped
rendering evidence, not closure of every SCN-042 child or a claim of landing on
main. The shader repair and actual-main browser regression are in `1cbf273`.

## Changes and preserved contracts

`beltRenderer.ts` used a `PI` constant after Three.js's `<common>` include, whose
macro substituted a number into the declaration. Namespaced `ASTEROID_PI` and
`ASTEROID_TWO_PI` constants preserve every numerical value and expression while
working in both the assembled `MeshStandardMaterial` and standalone shader
probes. No propagation algorithm, precision budget or production AA setting
changed.

The independent CSPICE fixture models pixel-centre depth and aliased nine-pixel
points. `verify_solar_main_frame.py` now uses a zero-MSAA RGBA8 ID/depth target
on the actual main renderer. Marker colors are explicitly raw ID bytes, with no
display color transfer; readback flips WebGL's bottom-up rows before the existing
PNG comparison. The production canvas remains antialiased with four samples.
The renderer restores its previous target after each capture, and diagnostics
dispose their owned target, material and markers.

Before diagnostic substitution, the gate separately records the default-AA
startup's resident program compile/link statuses and pending GL error. A startup
failure fails overall acceptance even if every diagnostic pixel passes. Each
case also requires a complete framebuffer, zero diagnostic samples, preserved
production AA/sample count and zero GL error. Negative controls must fail pixel
comparisons with zero GL error. Readback does not discard or filter GL errors.
Cleanup failures are recorded and fail the report, while browser close is still
attempted.

Hardware capture now requires explicit `--chromium` and `--expect-gpu` arguments
(or their `SOLAR_CHROMIUM_EXECUTABLE` / `SOLAR_EXPECT_GPU` environment equivalents).
Software renderer identities are rejected even when the expectation matches
them. The independent reference and `compare_pixels` function are unchanged;
AST comparison confirms the latter. Fixture SHA-256:
`c6126304d6f880e15f7693fae1790f44254de45c07cac5e2a68fceb4ba4c7faf`.

## Fresh before/after evidence

Evidence is in [SCN042_RENDERING_REPAIR_2026-10-17](SCN042_RENDERING_REPAIR_2026-10-17/).
All captures use this worktree's served source. `before/` is a fresh reproduction
at `ec9d184`, not reused October 15 evidence.

| Run | Exit | Reference cases | Markers | Surface probes | Negative controls |
| --- | --- | --- | --- | --- | --- |
| Original harness/source, `before/` | 1 | 3/6 | 154/156 | 235/235 | 3/3 detected |
| Repaired harness/source, `after/` | 0 | 6/6 | 156/156 | 235/235 | 3/3 detected |
| Reintroduced startup shader fault, `startup-negative-control/` | 1 | 6/6 | 156/156 | 235/235 | 3/3 detected |

Before repair, case 0 records GL 1282; cases 2 and 4 fail `lon90_lat0` and
`lon270_lat0` respectively. After repair every diagnostic case records GL 0,
target samples 0 and production samples 4. Default-AA startup records 12 resident
programs with successful stages/linking and GL 0. The unchanged negative controls
reject legacy axis through 42 surface probes, double spin through 21 markers and
handedness through 14 markers.

The startup negative control replaces `ASTEROID_PI` with `PI` only in GPU shader
input, leaving production files unchanged. Its six diagnostic cases pass, but
the separately recorded startup GL 1282 correctly fails the whole run. The
reproducible wrapper `startup_negative_control.py` does not consume GL errors.

The new Playwright regression executes the actual main page and inspects the
assembled asteroid `MeshStandardMaterial` immediately after production rendering.
`assembled-shader-before.log` fails with “Vertex shader is not compiled.”
`assembled-shader-after.log` records successful vertex/fragment compilation,
successful link and GL 0 with production AA enabled/four samples. A separate
standard headless run also passes on SwiftShader; that is CI regression evidence,
not hardware acceptance.

The `after/` hardware capture preceded only expanded software-name rejection and
failure-path cleanup reporting. Neither changes the successful rendering or
comparison path. The shader source was unchanged thereafter. Final unit checks
cover the completed hardware guards; integration-source browser validation
remains the integration owner's responsibility.

## Validation and environment

- Full configured Vitest: **743 passed, 413 skipped, zero failed**. The 411
  generated moon skips and two optional EGL shader skips are not passes.
- Strict production and UI-test TypeScript: **passed**.
- Production Vite build: **passed**, retaining the existing >500 kB chunk warning.
- Verifier unit checks: **7 passed**, including software/absent/mismatched GPU
  rejection and exact/one-pixel/two-pixel/missing-limb footprint boundaries.
- Existing hardware asteroid GLSL oracle: **189 solver and 175 packed-phase
  cases passed**, unchanged budgets of 8 root ULP and `8e-7` relative residual.
  Maximum root/packed-phase error: 2.8156413920223713 ULP; maximum relative
  residual: `4.0776410129261367e-7`.
- New actual-main assembled shader regression: **1 passed on hardware**,
  **1 passed on software** after its recorded baseline failure.
- `git diff --check`: passed. No backend suite was run for these shader/harness
  changes; no backend implementation changed.

Hardware identity: `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 5090),
OpenGL 4.6)`, driver 610.88. Browser 153.0.8010.12; Playwright 1.64.0; Pillow
13.0.0; Node 22.23.2; Vite 7.3.7; Vitest 5.0.4. The lockfile matches the reused
dependency installation. Other browser sessions were active on the host; no
performance or exclusive-host measurement is claimed. Only this task's Vite
5194 and temporary Playwright server 5195/browser processes were stopped.

## Reproduction

Use the pinned Node 22.23.2 on `PATH`. Start Vite in this worktree on a free port:

```sh
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5194 --strictPort
```

On this WSL GPU host, the hardware run used:

```sh
GALLIUM_DRIVER=d3d12 MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA \
LD_LIBRARY_PATH=/usr/lib/wsl/lib \
uv run --offline --python 3.12 --with playwright==1.64.0 --with pillow \
python scripts/verify_solar_main_frame.py \
  --chromium /home/nomad/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome \
  --expect-gpu 'NVIDIA GeForce RTX 5090' \
  --origin http://127.0.0.1:5194 --out <fresh-output-directory>
```

To reproduce the startup-failure control, replace the script path with
`agent-notes/SCN042_RENDERING_REPAIR_2026-10-17/startup_negative_control.py` and
use another fresh output directory; expected exit is 1. The baseline used the
original script with `SOLAR_CHROMIUM_EXECUTABLE` and no `--expect-gpu` argument.

```sh
UI_TEST_PORT=5195 UI_HARDWARE_WEBGL=1 \
GALLIUM_DRIVER=d3d12 MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA \
LD_LIBRARY_PATH=/usr/lib/wsl/lib \
node node_modules/@playwright/test/cli.js test tests/browser/asteroid-shader.spec.ts --project=chromium

GPU_TEST_ORIGIN=http://127.0.0.1:5194 \
WEBGL_BROWSER=/home/nomad/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome \
GALLIUM_DRIVER=d3d12 MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA \
LD_LIBRARY_PATH=/usr/lib/wsl/lib node scripts/verify-asteroid-residuals.mjs --hardware

uv run --offline --python 3.12 --with playwright==1.64.0 --with pillow \
  python -m unittest scripts/test_solar_main_frame_verifier.py
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --project tsconfig.json --strict --noEmit
node node_modules/typescript/bin/tsc -p tsconfig.ui-tests.json --noEmit
node node_modules/vite/bin/vite.js build
```

The frozen 800×600 camera, 20-degree FOV, three epochs, two declared frames,
one-pixel budget, production PFSS geometry, controller transforms and independent
CSPICE reference remain intact. The diagnostic fragment and ID/depth target do
not certify the production artistic fragment's colors, all layers/cameras/epochs,
provider delivery, observational calibration, startup timing or all accessibility
requirements.
