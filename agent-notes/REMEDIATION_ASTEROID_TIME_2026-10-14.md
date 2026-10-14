# SCN-013 asteroid time precision

The renderer now uploads elapsed time within an eight-day window. At a window
boundary, mean anomaly and spin phase are recomputed in CPU double precision
before upload. Absolute Julian dates are never subtracted in the shader.
Backward playback and arbitrary seeks rebase through the same path.

Four targeted regressions failed before the fix and pass afterward. They cover
one-second time increments around 1900, 2026, and 2100, phase continuity at a
window boundary, and reverse seeks. The GLSL Kepler solver now safeguards Newton
iterations with a bracket, including high eccentricity. The uncalibrated
age-squared pseudo-perturbation is disabled by default; this renderer declares
Keplerian propagation rather than an N-body integration.

`scripts/verify-asteroid-gpu.mjs` compiles the actual production orbital shader
and reads back transform-feedback positions against an independent CPU double
bisection oracle. It passed 125 cases spanning 1900-2100, eccentricities through
0.999999, anomaly boundaries, and window boundaries. Maximum observed position
error was 0.000020815 AU against the declared 0.00005 AU encoding/shader budget;
one-minute motion was 0.0000095962 AU, without float-JD quantization jumps.

The first GPU run exposed an additional trigonometric accuracy discrepancy:
0.000474 AU on a circular orbit. Range-reduced polynomial sine/cosine evaluation
removed the dependency on the driver's loose transcendental accuracy. These
polynomials and the safeguarded solver are exercised by the same readback gate.

Renderer: ANGLE/Vulkan SwiftShader (Subzero). This is actual shader execution
and readback, but is software rendering and does not establish hardware GPU
performance under SCN-047. Playwright API: https://playwright.dev/docs/api/class-browsertype.

Run with a Vite server at `GPU_TEST_ORIGIN` (default localhost:5189), Playwright
available as a package or `PLAYWRIGHT_MODULE`, and optional `WEBGL_BROWSER`.
The script fails when WebGL is unavailable; it never converts a skipped gate
into a pass.
