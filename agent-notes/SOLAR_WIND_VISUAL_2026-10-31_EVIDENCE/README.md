# Solar wind outflow: rendered evidence (2026-10-31)

Branch `feat/solar-wind-visual` (stacked on `fix/solar-eruption-visuals`): ceac3d3 adds the layer;
9fc09e0 keeps it continuous across backend polls and tunes it after the first real-GPU render.

**Capture conditions.** Same rig as the eruption evidence: Playwright 1.64 Chromium through ANGLE on
D3D12 (NVIDIA GeForce RTX 5090) under WSLg, gated on that renderer string. Local
`uvicorn server:app` backend with synthetic forcing, viewport 1288×873, DPR 1, Sun focus, +4 d/s,
Auto channel. Each sequence is 20 frames, 120 ms apart (about 2.4 s).

| File | View | What it shows |
|---|---|---|
| `trail-close.png` | Realistic scale, range 10,006,296 km | Brightest pixel over the 20 frames. Wind particles trace 48 straight streams out of the corona; stars stay points. The green and magenta strokes at the top are a pre-existing transient layer, not the wind, whose tints run only from amber to light blue. |
| `trail-au.png` | Default enlarged scale, range 2.60 AU | The same composite. The streams curve into Parker-spiral arms through the inner orbits; the planets' short streaks are their own motion over 2.4 s. |
| `flow-close.gif` | Realistic scale, as above | The animation behind `trail-close.png`. |

**Backend offline** (requests to the backend blocked): the layer stays hidden, with no page errors.

**Per-frame CPU** of `updateSolarWindLayer` (headless Chromium, 4,000 particles, 6 arms, mean of 400
calls): 0.28 ms.

**Not covered:** DPR 2, Firefox/WebKit, slow GPUs, and any calibration of density or emission. The
layer is an illustrative flow driven by the backend's arm speeds.
