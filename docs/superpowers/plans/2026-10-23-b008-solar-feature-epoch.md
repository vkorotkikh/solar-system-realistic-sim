# B008 Solar Feature Epoch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep admitted backend sunspots, coronal holes, and flare surface anchors co-rotating from their payload epoch while preserving each already-launched CME's inertial direction.

**Architecture:** Convert already-evolved backend directions into surface-local coordinates exactly once, at the admitted layer context's payload epoch. The display-time Sun transform then supplies rigid rotation after that epoch. Split flare-event ownership: the flare sprite and surface-shader anchor live in the rotating surface frame, while the CME shell remains under the fixed flare parent with its launch-time orientation captured when the event is created.

**Tech Stack:** TypeScript, Three.js scene graph and matrices, Vitest 5.

**Spec:** `/home/nomad/ai/projects/repositories/solar-system-realistic-sim/agent-notes/BUG_FIX_REPORT_2026-10-17.md` — B008 at lines 292-304, corrected by the verified finding that blindly changing the shared feature helper would misorient fixed-parent CME geometry.

## Global Constraints

- Fix B008 only; do not alter backend solar generation, the frame-admission contract, differential-rotation constants, snapshot blending, layer refresh cadence, or unrelated solar visuals.
- Use strict TDD: change/add regressions first, observe the epoch-skew and flare-parent failures, then change production code.
- Treat backend `SOLAR_EQUATORIAL_J2000` vectors as `rotation_state: already_evolved` at `context.jdTdb`; never remove rigid phase using the display epoch.
- Surface-attached sunspots, coronal holes, flare sprites, and flare shader highlights must share an immutable surface-local anchor and advance with the real surface transform.
- An expanding CME shell must capture the surface orientation at launch and must not rotate when the display epoch advances afterward.
- Active flare events own their anchor; a later payload/context must not reinterpret an existing event.
- Keep the fixed root-level flare group and all public controller behavior; add only the minimal event/manager API needed to distinguish rotating surface sprites from fixed CME shells.
- Preserve fail-closed behavior for missing or unadmitted layer contexts and never mutate an accepted backend snapshot.
- Produce exactly one atomic B008 commit, including its regression tests and this plan.
- Run frontend commands under Node `22.23.2`.

## Review Focus

- For payload epoch `E` and display epoch `D`, the world direction must be `S(D) C(E) vE`, not the currently pinned `S(D) C(D) vE`.
- At `D - E = 8 days`, the captured-fixture regression must detect the pre-fix approximately 107-degree error and match independently composed rigid co-rotation after the fix.
- Coronal holes must consume their admitted `SolarFrameContext`, including both `inputFrame` and `jdTdb`; a display JD is not a substitute.
- The manager must reparent only the flare sprite into the rotating surface group. The CME event group must retain its launch-time world axis under the fixed flare parent.
- Shader flare longitude must be derived from the event's stored surface anchor (including the existing `-Z` manager versus `+Z` shader convention), not counter-rotated with the current display epoch.
- Disposal/expiry must remove and dispose both the reparented sprite and the fixed CME group without leaks.

---

### Task 1: B008 payload-epoch surface anchors and launch-frame CMEs

**Files:**
- Modify: `src/frontend/features/solar/solarGeometryContract.ts`
- Modify: `src/frontend/features/solar/solarFlares.ts`
- Modify: `src/sunController.ts`
- Modify: `src/frontend/features/solar/solarGeometryContract.test.ts`
- Modify: `src/frontend/features/solar/solarFlares.test.ts`

**Interfaces:**
- `solarFeaturesInSurfaceFrame(state, context)` consumes only the admitted payload context and returns a copied payload with surface-local feature vectors.
- `solarHolesInSurfaceFrame(state, context)` consumes the admitted hole context and returns copied surface-local hole centers, or `undefined` when either input is absent.
- `solarFlareParamsInSurfaceFrame(params)` performs only the manager `-Z` to surface-shader `+Z` longitude convention conversion; it does not consume a display epoch.
- `SolarFlareManager` consumes both the fixed CME parent and the rotating surface parent. Each event exposes/owns its surface sprite separately from its fixed CME group.
- `createSunController` passes `sunSpinGroup` as the rotating surface parent and uses each admitted layer context without a display-epoch override.

- [ ] **Step 1: Write the failing epoch and flare-ownership regressions**

In `solarGeometryContract.test.ts`, replace the assertion that currently expects a feature to remain at its payload inertial direction for every display epoch. Using the captured payload epoch `E`, an `E + 8` display epoch, the frozen fixed-frame reference matrix, and an explicit `14.1844 degrees/day` Z rotation, assert that:

- the real feature helper plus the real surface transform matches rigid co-rotation from `E`;
- the result has moved by more than 100 degrees from the pinned pre-fix direction;
- converting a coronal-hole center with its admitted context produces the same payload-epoch surface anchor; and
- neither helper mutates the captured payload.

Update the flare convention test so `solarFlareParamsInSurfaceFrame` takes no display epoch and maps the event's immutable surface-local direction directly into shader longitude/latitude.

In `solarFlares.test.ts`, construct sibling fixed and rotating groups under a common root. Give them the real J2000 and payload/display surface orientations, create a physics-driven event through `SolarFlareManager`, then advance only the rotating group by eight days. Assert:

- the exposed flare sprite remains under the rotating surface group and advances to the expected world direction;
- the shader direction reconstructed from the event parameters is colocated with that sprite through the same surface transform;
- the CME mesh launch axis remains unchanged after the surface advances; and
- expiry/disposal removes the reparented sprite and fixed event group and disposes their materials.

- [ ] **Step 2: Run the focused regression to verify RED**

Run:

```bash
npx --yes node@22.23.2 node_modules/vitest/vitest.mjs run src/frontend/features/solar/solarGeometryContract.test.ts src/frontend/features/solar/solarFlares.test.ts
```

Expected: the rigid co-rotation assertion fails by roughly 107 degrees (or the context-only call rejects an undefined display epoch), coronal-hole context conversion fails, and flare ownership remains under the fixed event group.

- [ ] **Step 3: Convert admitted surface data at its payload epoch**

In `solarGeometryContract.ts`:

- remove the display-epoch argument from `solarFeaturesInSurfaceFrame` and call `solarVectorToSurfaceLocal` with `context.inputFrame` and `context.jdTdb`;
- make `solarHolesInSurfaceFrame` accept `SolarFrameContext | undefined`, fail closed without it, and use that context for each center;
- make `solarFlareParamsInSurfaceFrame` an epoch-free convention conversion from each event's stored surface-local longitude/latitude to the shader's longitude/latitude; and
- preserve all non-coordinate fields and copy-on-convert behavior.

- [ ] **Step 4: Separate rotating flare anchors from fixed CME launches**

In `solarFlares.ts`, retain one immutable surface-local direction per event. Expose its sprite separately from the CME event group. Extend `SolarFlareManager` to receive the rotating surface group in addition to its existing fixed group. When spawning:

- capture the relative quaternion from the fixed parent to the current rotating surface parent on the event/CME group;
- reparent only the sprite into the rotating surface group without changing its intended surface-local position;
- keep the CME mesh under the launch-oriented fixed event group; and
- keep event longitude/latitude as the immutable surface anchor used by shader parameters.

Ensure the normal update, expiry, and `dispose()` paths clean up objects in both parents and dispose the sprite and CME materials exactly once.

- [ ] **Step 5: Wire the controller to the corrected ownership**

In `sunController.ts`:

- construct `SolarFlareManager` with the fixed flare group and `sunSpinGroup`;
- call `solarFeaturesInSurfaceFrame` for spots and CMEs without a display/J2000 override, so both get payload-epoch surface anchors;
- call `solarHolesInSurfaceFrame` with `solarLayerFrames.coronal_holes`; and
- call `solarFlareParamsInSurfaceFrame` without the current display epoch.

Keep `updateSurfaceFrame(julianDate)` before flare spawning/updating so a newly launched CME captures the current surface orientation. Do not rotate the fixed flare parent after initialization.

- [ ] **Step 6: Run focused verification to verify GREEN**

Run:

```bash
npx --yes node@22.23.2 node_modules/vitest/vitest.mjs run src/frontend/features/solar/solarGeometryContract.test.ts src/frontend/features/solar/solarFlares.test.ts src/frontend/features/solar/solarFrame.test.ts src/sunController.frameReview.test.ts
```

Expected: all focused tests pass with pristine output.

- [ ] **Step 7: Run project verification**

Run:

```bash
npx --yes node@22.23.2 node_modules/vitest/vitest.mjs run
npx --yes node@22.23.2 node_modules/typescript/bin/tsc --project tsconfig.json --strict --noEmit
npx --yes node@22.23.2 node_modules/vite/bin/vite.js build
git diff --check
```

Expected: all frontend tests pass, strict TypeScript reports no errors, Vite builds successfully, and `git diff --check` is silent.

- [ ] **Step 8: Commit B008 atomically**

```bash
git add docs/superpowers/plans/2026-10-23-b008-solar-feature-epoch.md src/frontend/features/solar/solarGeometryContract.ts src/frontend/features/solar/solarFlares.ts src/sunController.ts src/frontend/features/solar/solarGeometryContract.test.ts src/frontend/features/solar/solarFlares.test.ts
git commit -m "fix(solar): co-rotate backend surface features (B008)"
```
