# Physical-GPU rendering evidence, 2026-10-14

Scope: SCN-013, planetary SCN-042/058/059/061, and the hardware subset of
SCN-047. This is geometric correctness evidence, not a frame-rate, power,
cross-vendor, mobile, screen-reader, or sustained solar-delivery certification.

## Host and runtime

- WSL GPU device `/dev/dxg`; NVIDIA driver 596.36.
- Selected adapter: NVIDIA GeForce RTX 5090 through Mesa D3D12 and ANGLE.
- Exact WebGL renderer: `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 5090), OpenGL 4.6)`.
- Node 22.23.2; Chromium from Playwright's `chromium-1243` installation.
- Default headed Chromium used llvmpipe, and default headless Chromium used
  SwiftShader. Those runs were not counted as hardware evidence. The explicit
  D3D12 environment and headed GL launch produced the physical adapter above.

## Results

| Gate | Result | Bounds and observations |
| --- | --- | --- |
| Production asteroid GLSL transform feedback | 125/125 passed | Maximum independent-position error 0.000026319647650932267 AU, below the predeclared 0.00005 AU bound; one-minute motion 0.000009491934412667456 AU. Epochs 1900-2100 and eccentricities through 0.999999. |
| Earth/Mars relief-mode screen coverage | 12/12 passed | Both scale modes, far/near/far, 6/9/6 meshes. Near covered pixels: Earth 3116, Mars 3243; each far view 112. No captured browser/GL errors. |
| Earth/Mars zero-relief screen coverage | 12/12 passed | Both scale modes, far/near/far. Near covered pixels 3096, far 112, equal between display and physical scales. |

The first headed planetary relief attempt hit the existing 20-second browser
startup timeout before producing a result. The zero-relief run and subsequent
relief retry passed with unchanged assertions and unchanged startup budget. That
failed cold-start attempt is retained here; these runs do not close startup
reliability or performance acceptance under SCN-047.

## Reproduction

Use the installed pinned Node runtime and a Chromium/Playwright installation.
On this WSL host:

```sh
export GALLIUM_DRIVER=d3d12
export MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA
export LD_LIBRARY_PATH=/usr/lib/wsl/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
export PLANET_TEST_CHROMIUM=/home/nomad/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome
export PLANET_TEST_HARDWARE=1
node scripts/verify-planet-rendered-geometry.mjs
PLANET_TEST_FLAT=1 node scripts/verify-planet-rendered-geometry.mjs

PLAYWRIGHT_RUNTIME_MODULE=/tmp/solar-remediation-toolchain-20261014/node_modules/playwright/index.mjs \
PLAYWRIGHT_MODULE="$PWD/scripts/hardware-playwright.mjs" \
WEBGL_BROWSER="$PLANET_TEST_CHROMIUM" \
node scripts/verify-asteroid-gpu.mjs
```

The planetary hardware mode fails if its reported renderer is a known software
implementation. The asteroid adapter preserves the original production-shader
assertions and reports the renderer; inspect it before classifying a run. An
unavailable display, browser, adapter, or WebGL context is not a pass.

AGN and solar screen-space oracles are separate work. Neither these fixtures
nor the earlier software-renderer results establish whole-application delivery.
