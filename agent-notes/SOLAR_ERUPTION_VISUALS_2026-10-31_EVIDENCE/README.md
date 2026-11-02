# Solar eruption particle repair: rendered evidence (2026-10-31)

Branch `fix/solar-eruption-visuals`: d03ecd3 (soft-disc sprites, size, density, restart fade) and
269e075 (alpha-map disposal), on base fda20ab.

**Capture conditions.** Real GPU: Playwright 1.64 Chromium 156 through ANGLE on D3D12
(NVIDIA GeForce RTX 5090) under WSLg. Every capture was gated on that renderer string.
Backend: local `uvicorn server:app` from this tree (synthetic forcing). Viewport 1288×873,
DPR 1, Sun focus, +4 d/s, Auto channel. The "before" captures served fda20ab's
`sunVisuals.ts` and `sunController.ts` from the same dev server and backend.
Particle seeds and animation are random, so these are composition comparisons, not pixel diffs.

| File | View | Before (fda20ab) | After |
|---|---|---|---|
| `pair-realistic.png` | Realistic scale, range 6,916,451 km (the range in the reported screenshot) | hard translucent squares, saturated at the limb | small soft particles streaming along backend loops, plumes and CME fronts |
| `pair-enlarged.png` | Default enlarged scale, range 2.60 AU, 2× crop | squares cover most of the disk | fine plasma clumps at the limb and over active regions |
| `pair-fallback.png` | Backend blocked (procedural fallback), realistic scale, 6,916,451 km, 2× crop | squares cover the disk | faint speckle around the limb |

**Per-frame CPU** of `updateSunEruptionLayerFromBlendView` with 220 features (headless
Chromium, mean of 400 calls): 0.047 ms at the old 360 particles, 0.19 ms at 2,400.

**Not covered:** a rendered-pixel browser regression test, DPR 2, Firefox/WebKit, and
the physical transport/emission work in Stage C of `docs/solar-eruption-modeling.md`.
