# SCN-049 asteroid model meaning and GLSL residuals

## Scope and caller evidence

Worktree: `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-asteroid-residuals`.
Branch: `remediation/20261014-asteroid-residuals`.
Base: `f1bb9eb38da9de0a8c03422cc66be3ea1f918ba7`.

The assigned base already had `DEFAULT_PERTURBATION_SCALE_AU = 0`, following the
earlier SCN-013 time repair. `src/main.ts` creates the asteroid renderer at line
525, supplies Jupiter/Saturn masses at lines 528 and 541, and supplies positions
and Julian date at lines 561-562. The handle exposes no perturbation-scale setter.
Thus the actual application already declares and uses fixed-element two-body
Kepler propagation. No `main.ts`, loader/cache/format, Kuiper implementation,
canonical tracker, or other agent's production files were changed.

The historical `1e-10 * acceleration * age^2` expression is not an integrated
planetary perturbation model. Although acceleration times time squared has length
units, multiplying instantaneous gravity by a small visual scale does not compute
the time history of a perturbed orbit, evolve a velocity state, or supply a
consistent heliocentric perturbation solution. Retuning that coefficient would
not establish physical validity. No new physical model is introduced here.

The unused force uniforms, age-squared offset and force helper are removed.
Existing planet setters remain documented compatibility no-ops, preserving
callers and the already selected two-body policy. This also removes a concrete
numerical hazard: a nonfinite obsolete planet position produced NaN coordinates
even with a zero perturbation scale (`NaN * 0` is still NaN). Realistic finite
planet inputs, absent planet inputs and unusable planet inputs now produce
identical finite shader positions. Parent may remove the redundant caller wiring
as separate maintenance; it is not required for correctness of this increment.

## Numerical repair and declared limits

Small signed mean anomalies now remain signed through CPU phase rebasing and
the actual vertex shader. Unconditionally adding pi or 2*pi erased their low
bits, particularly immediately before periapsis. The existing eight-day relative
time windows, reverse seeks and fixed orbital elements remain in use.

The shader retains safeguarded Newton iteration with a 32-iteration ceiling.
Near periapsis it evaluates the algebraic identity
`E - e*sin(E) = (1-e)*E + e*(E-sin(E))`, using a small-angle polynomial for the
last difference. The derivative uses `(1-e) + 2*e*sin(E/2)^2`. Signed symmetry,
a bounded initial estimate and float convergence replace the absolute `1e-6`
step cutoff. These are numerical reformulations of the same elliptic Kepler
equation, not additional forces or changed scientific thresholds.

The new gate's sampled domain is explicit:

- Binary32 eccentricities from 0 through `float32(0.999999)`, exactly
  **0.9999989867210388**. The existing shader clamp is unchanged.
- Signed binary32 mean anomalies in radians through `+/-float32(pi)`, including
  nonzero magnitudes down to `float32(1e-20)` = **9.999999682655225e-21**.
- **189** direct production-solver cases across seven eccentricities and 27
  anomalies; **175** cases additionally exercise renderer CPU packing, uniforms,
  attributes and the production `begin_vertex` path. The latter omit the +/-pi
  chart boundary, where equivalent signed representations need not have the same
  eccentric-anomaly sign; the direct solver gate includes both boundary values.
- Predeclared budgets: **8 binary32 ULPs** of eccentric anomaly and **8e-7**
  relative Kepler-equation residual. Sine readback is bounded by eight times the
  sum of eccentric-anomaly and sine ULPs. The exact zero-anomaly case remains zero.

These are sampled numerical contracts, not a proof over every binary32 value.
Eccentricities above the existing cap still clamp; no acceptance of that range,
e=1, hyperbolic orbits, arbitrary time precision, N-body accuracy or physical
close-encounter dynamics is asserted. Expanding the eccentricity policy is a
separate model/domain decision. Tiny anomaly tests specify orbital phase at a
window epoch; they do not claim Julian-date increments of 1e-20 days.

## Independent oracle and red/green evidence

`scripts/asteroid-residual-oracle.mjs` uses double-precision monotonic bisection
and `Math.sin`, independently of production Newton iterations/polynomials. Six
near-cap reference roots were independently generated with **mpmath 1.3.0**, **80
decimal digits**, and **300 bisection iterations** on [0,4], converting the
binary32 inputs exactly to arbitrary precision. The committed reference literals
are rounded to doubles by JavaScript; the double oracle's maximum relative
disagreement is **2.0725271387142226e-10**, below its **1e-9** anchor budget and
well below the shader budgets. No production solver supplies its own oracle.

Before the repair, all **5** new CPU tests failed. The initial new signed-domain
GPU gate failed **139/189** cases and the inert-planet test. That count includes
new signed-domain requirements and is not 139 distinct production bugs; the old
solver previously expected nonnegative phases. The independent original
125-position gate already passed, showing that its coarser position budget did
not protect tiny-phase residuals. Its budgets and implementation remain unchanged.

Final results, all exit 0:

| Gate | Result |
| --- | --- |
| Focused CPU: new model/phase cases, time precision, disposal, paused Kuiper contracts | **15 passed**, 4 files, 231 ms |
| Direct production GLSL solver | **189 passed**, 0 failed |
| CPU packing through production vertex shader | **175 passed**, 0 failed |
| Maximum root error, both shader paths | **0.8735167346894741 ULP** versus 8 ULP budget |
| Maximum relative equation residual | **1.9296971642823735e-7** versus 8e-7 budget |
| Planet-input inertness, actual position shader | Finite, identical positions for absent, finite and unusable inputs |
| Existing actual GPU position gate | **125 passed**; maximum **0.00002080942241489669 AU**, unchanged **0.00005 AU** budget |
| Existing one-minute motion gate | **0.00001109094939194966 AU**, unchanged 0.5x..1.5x expected-motion bounds |
| Strict TypeScript `npm run typecheck` | PASS |
| `git diff --check` | PASS |

Actual renderer for these shader runs:
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`.
Vertex highp reported 23 fraction bits and exponent range 127/127. This is actual
compiled production GLSL and transform-feedback readback on **software**, not
hardware or application performance evidence. The gate explicitly reports
`identifiedHardware: false` in this mode.

## Reproduction and evidence paths

Use the assigned worktree for every command. `node_modules` is an ignored symlink
to the parent integration worktree's dependency installation. The isolated Vite
cache is under `/tmp`, and the test pages never load the application UI.

```bash
export PATH=/tmp/solar-remediation-toolchain-20261014/node_modules/node/bin:$PATH
node --input-type=module -e 'import { createServer } from "vite"; const server = await createServer({ configFile: false, cacheDir: "/tmp/solar-asteroid-residuals-vite-cache-20261014", server: { host: "127.0.0.1", port: 5197, strictPort: true } }); await server.listen(); server.printUrls();'
# In a separate terminal, same worktree and PATH:
node node_modules/vitest/vitest.mjs run \
  src/frontend/features/asteroids/beltRenderer.residuals.test.ts \
  src/frontend/features/asteroids/beltPrecision.test.ts \
  src/frontend/features/asteroids/beltRenderer.disposal.test.ts \
  src/frontend/features/asteroids/kuiperPaused.test.ts
GPU_TEST_ORIGIN=http://127.0.0.1:5197 node scripts/verify-asteroid-residuals.mjs
env -u PLAYWRIGHT_MODULE GPU_TEST_ORIGIN=http://127.0.0.1:5197 node scripts/verify-asteroid-gpu.mjs
node /tmp/solar-remediation-toolchain-20261014/node_modules/npm/bin/npm-cli.js run typecheck
git diff --check
```

Retained local results:
`/tmp/solar-asteroid-residuals-cpu-red-20261014.txt`,
`/tmp/solar-asteroid-residuals-shader-red-20261014.json`,
`/tmp/solar-asteroid-residuals-shader-final-20261014.json`,
`/tmp/solar-asteroid-residuals-legacy125-20261014.json`, and
`/tmp/solar-asteroid-residuals-types-20261014.txt`.

## Remaining evidence and parent handoff

**Hardware mode has not run.** Parent reserved the visible GPU/browser for
Volta's real five-minute dev/preview measurement and has not provided a clear
window. No headful or focus-changing browser was launched. After parent supplies
that window, the same focused gates can be run without changing their budgets:

```bash
GPU_TEST_ORIGIN=http://127.0.0.1:5197 node scripts/verify-asteroid-residuals.mjs --hardware
PLAYWRIGHT_MODULE="$PWD/scripts/hardware-playwright.mjs" GPU_TEST_ORIGIN=http://127.0.0.1:5197 node scripts/verify-asteroid-gpu.mjs
```

The new hardware mode requires an identified physical renderer and fails for
software/unknown rendering; absent WebGL or insufficient highp also fails rather
than silently skipping. Hardware execution remains pending, not a pass. Loader
cache/format tests were deliberately not repeated, and this scoped change does
not assert a fresh full-project suite pass. No focused final failures remain.

Changed paths: `src/frontend/features/asteroids/beltRenderer.ts`, the new
`beltRenderer.residuals.test.ts`, `scripts/asteroid-residual-oracle.mjs`,
`scripts/verify-asteroid-residuals.mjs`, and this single evidence note.
