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

An actual WebGL transform-feedback readback gate is required in addition to the
CPU/attribute tests. Its outcome and renderer identity will be added here;
headless software WebGL is not evidence of hardware performance.
