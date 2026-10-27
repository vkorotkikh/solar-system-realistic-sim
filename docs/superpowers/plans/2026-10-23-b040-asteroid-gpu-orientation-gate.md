# B040 Asteroid GPU Orientation Gate Implementation Plan

> **For agentic workers:** Use mutation-driven test development and leave the change uncommitted for the parent agent's one-bug atomic commit.

**Goal:** Make CI execute the production asteroid vertex shader with a genuinely inclined orbit and reject orientation errors that planar probes cannot see.

**Architecture:** Strengthen the existing WebGL2 transform-feedback probe rather than duplicating shader math in a unit test. Preserve its independent planar bisection matrix, then add a separate production renderer fixture with nonzero inclination, ascending node, and argument of periapsis and compare that GPU position with the shipped CPU `propagateKeplerOrbit`. Let the script start and stop an isolated Vite server, expose it as an npm command, and run that command in the frontend CI lane whose Chromium installation supplies SwiftShader.

**Tech Stack:** Node.js 22, Vite, Playwright Chromium/SwiftShader, WebGL2 transform feedback, GitHub Actions.

**Spec:** `/home/nomad/ai/projects/repositories/solar-system-realistic-sim/agent-notes/BUG_FIX_REPORT_2026-10-17.md` — B040.

## Constraints

- Fix B040 only; do not change production orbit arithmetic.
- Exercise `createAsteroidBeltRenderer` and its actual `onBeforeCompile` shader patch.
- Use `i = 30°`, `Ω = 80°`, and `ω = 110°`, all nonzero and distinct.
- Obtain the expected position from production CPU `propagateKeplerOrbit`; do not recreate the 3-D rotation in the gate.
- Fail rather than skip if WebGL2 or the default CI path's SwiftShader is unavailable.
- Keep the existing planar eccentricity/anomaly/epoch matrix, its independent oracle, and the one-minute motion check.
- Make the npm command self-contained and guarantee browser/Vite teardown.

### Task 1: Strengthen and wire the GPU gate

**Files:**
- Modify: `scripts/verify-asteroid-gpu.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/frontend-ui.yml`

- [ ] Preserve the planar matrix and add a separate probe orbit with nonzero inclination, node, and apsis.
- [ ] Import `propagateKeplerOrbit` and `Vector3` in the browser and use them only for the inclined expected positions.
- [ ] Assert the default CI renderer is SwiftShader, retain the explicit hardware adapter, and include the orientation in the structured report.
- [ ] Start an ephemeral-port Vite server inside the script when no explicit `GPU_TEST_ORIGIN` is supplied; close it in `finally`.
- [ ] Add `npm run verify:asteroid-gpu` and invoke it in frontend CI after the production build.
- [ ] Run the gate normally, then temporarily flip the shader inclination sign and prove the gate fails; restore production unchanged.
- [ ] Run frontend tests, strict TypeScript/UI gates, build, workflow syntax checks, and `git diff --check`.
