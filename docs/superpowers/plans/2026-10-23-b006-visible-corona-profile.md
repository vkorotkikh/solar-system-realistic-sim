# B006 Visible Corona Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 4-R☉ corona shell visibly render the K-corona, streamers, coronal holes, and AIA tint with a physically decreasing off-limb profile.

**Architecture:** Compute each shell fragment's world-space camera-ray impact parameter relative to the rendered Sun center. Use the raw impact parameter for the photospheric off-limb mask and its clamped value for radial density/temperature; pass the Sun center from the vertex shader via a world-space varying so parent translations cannot desynchronize a CPU uniform.

**Tech Stack:** TypeScript, Three.js GLSL shaders, Vitest 5.

**Spec:** `/home/nomad/ai/projects/repositories/solar-system-realistic-sim/agent-notes/BUG_FIX_REPORT_2026-10-17.md` — B006 at lines 280-291, corrected by the verified finding that the existing shell-normal limb mask must use the same impact parameter to make the report's visibility criterion attainable.

## Global Constraints

- Fix B006 only; do not change corona layer ownership, data inputs, shell radius, blend mode, or other solar shaders.
- Use strict TDD: add the numerical and shader-contract regression, observe failure on the origin/shell-radius formula, then change the shader.
- Keep `sunRadius` as the photospheric display radius in world units and retain the 4-R☉ shell.
- Compute ray, Sun center, and impact parameter in one world-space coordinate system; translated parent nodes must not change the normalized profile.
- Use raw `impactR` for the off-limb mask and `max(impactR, 1.001)` only for falloff/temperature, preventing the clamp from enabling on-disk corona.
- The corrected reference profile at 1.05 R☉ must have alpha at least `0.02` under the specified deterministic quiet-corona reference factors and must fall strictly at 2 and 4 R☉.
- Produce exactly one atomic B006 commit, including its regression test and this plan.
- Run frontend commands under Node `22.23.2`.

## Review Focus

- At 1.05 R☉ the legacy shell-normal mask is zero but the corrected impact mask is fully enabled; the numerical regression proves both.
- The normalized K-corona factors must be `0.75037408` at 1.05 R☉, `0.02329551` at 2 R☉, and `0.00307593` at 4 R☉; literal expected values pin the profile.
- Translating and rotating the Sun/camera geometry together must not change impact radius or falloff; the coordinate-invariance case covers it.
- The shader must use the transformed Sun center rather than world origin and must guard zero-length ray normalization; the shader contract covers the GPU boundary.
- The production shell must remain 4 R☉ and compile in the full Vite build; the geometry assertion and build cover both.

---

### Task 1: B006 world-space corona falloff

**Files:**
- Modify: `src/frontend/features/solar/sunVisuals.ts`
- Create: `src/frontend/features/solar/sunVisuals.corona.test.ts`

**Interfaces:**
- Consumes: Three.js built-ins `modelMatrix` and `cameraPosition`, the existing photospheric `sunRadius` uniform, and each fragment's `vWorldPosition`.
- Produces: vertex varying `vSunCenterWorld` and fragment-local `impactR`/`fragR`; no TypeScript API changes.
- Preserves: `createSunCoronaShell(geometry)` and all material/uniform contracts.

- [ ] **Step 1: Write the failing corona profile regression**

Create `sunVisuals.corona.test.ts` with independent test helpers for smoothstep, camera-ray/sphere intersection, ray-to-center impact radius, and the documented two-term normalized radial falloff. Assert:

```text
radial(1.05) = 0.75037408
radial(2.00) = 0.02329551
radial(4.00) = 0.00307593
reference alpha at 1.05 R_sun >= 0.02
radial(1.05) > radial(2) > radial(4)
```

Prove the current shell-normal mask is zero at 1.05 R☉ while `smoothstep(1.0, 1.02, impactR)` is one. Apply a shared rigid transform to camera, Sun center, and sampled fragment and assert the recovered impact/falloff is invariant. Instantiate `createSunCoronaShell(new SphereGeometry(1, ...))`, apply its production `surfaceScale`, and assert sampled world radii are 4 within `1e-6`.

Add a narrow shader-boundary contract that requires the vertex shader to pass the model-matrix-transformed Sun origin and the fragment shader to derive both `offLimb` and `fragR` from the center-relative `impactR`; reject the legacy `length(vWorldPosition) / sunRadius` expression. This source check binds the independently verified math to the GLSL artifact that Vite compiles.

- [ ] **Step 2: Run the regression to verify RED**

Run:

```bash
npx --yes node@22.23.2 node_modules/vitest/vitest.mjs run src/frontend/features/solar/sunVisuals.corona.test.ts
```

Expected: numerical geometry checks pass, but the shader-boundary assertions fail because no transformed Sun-center varying or impact-radius formula exists and the legacy origin/shell-radius expression remains.

- [ ] **Step 3: Implement the world-space impact profile**

In `SUN_CORONA_VERTEX_SHADER`, pass the transformed object origin as `vSunCenterWorld`. In `SUN_CORONA_FRAGMENT_SHADER`, before the opacity terms, compute:

```glsl
vec3 ray = vWorldPosition - cameraPosition;
vec3 rayDirection = ray / max(length(ray), 1e-6);
vec3 centerFromCamera = vSunCenterWorld - cameraPosition;
float impactR = length(centerFromCamera - rayDirection * dot(centerFromCamera, rayDirection))
  / max(sunRadius, 0.0001);
float offLimb = smoothstep(1.0, 1.02, impactR);
float rim = pow(offLimb, 1.8);
float fragR = max(impactR, 1.001);
```

Remove the shell-normal `ndotv`/`limb` opacity mask and the origin-based `fragR`. Keep `normalDir` and `vSunNormal` for turbulence, streamers, and holes.

- [ ] **Step 4: Run focused verification to verify GREEN**

Run:

```bash
npx --yes node@22.23.2 node_modules/vitest/vitest.mjs run src/frontend/features/solar/sunVisuals.corona.test.ts src/frontend/features/solar/solarDisplayScale.test.ts src/frontend/features/solar/solarGeometryContract.test.ts src/sunController.test.ts
```

Expected: all focused tests pass with pristine output.

- [ ] **Step 5: Run project verification**

Run:

```bash
npx --yes node@22.23.2 node_modules/vitest/vitest.mjs run
npx --yes node@22.23.2 node_modules/typescript/bin/tsc --project tsconfig.json --strict --noEmit
npx --yes node@22.23.2 node_modules/vite/bin/vite.js build
git diff --check
```

Expected: all baseline frontend tests plus the B006 regression pass, strict TypeScript reports no errors, Vite compiles the GLSL-bearing module and builds successfully, and `git diff --check` is silent.

- [ ] **Step 6: Commit B006 atomically**

```bash
git add docs/superpowers/plans/2026-10-23-b006-visible-corona-profile.md src/frontend/features/solar/sunVisuals.ts src/frontend/features/solar/sunVisuals.corona.test.ts
git commit -m "fix(solar): restore visible corona falloff (B006)"
```
