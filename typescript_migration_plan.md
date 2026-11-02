# TypeScript Migration Plan (Archived February 2026 Snapshot)

## Archive correction (2026-10-24)

This is a historical migration record, not the current project checklist or a
current validation report. The dated snapshot and original phase checkboxes are
retained below; their completion statements describe the migration at that time.

- The snapshot's `82` total does not follow from its listed `53` TypeScript
  and `0` JavaScript files. Those two counts sum to `53`; the extra `29`
  files are not identified in this record. Do not use `82` as a verified source
  count or infer an undocumented file category to reconcile it.
- The references to modules "with shim" describe intermediate migration steps,
  not files that still exist. The named `catalog.js`, `planets.js`,
  `textures.js` and `constants.js` shims are absent from the current source
  tree, as are tracked `.js` files under `src`.
- The final lint/build/parity checkbox remains unchecked because this record
  does not establish that historical acceptance step. "Phases 1–4 complete"
  below is limited to shim removal, not proof of final behavior parity. Later
  test results do not retroactively complete that checkbox.

For current scope and setup, see [README](README.md). For dated findings,
verification results and remaining limitations, see the
[consolidated issue audit](agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md).
Current commands are defined in [package.json](package.json): `npm run typecheck`
checks source and tooling, `npm run test:types:ui` checks browser-test types,
and `npm test` / `npm run build` run the unit suite / production build.
These command references do not claim visual, physical or historical parity.

## Original migration record

## Current state snapshot (2026-02-26)

- Logical module count in `src` (unique stems): `53`
- TypeScript modules: `53`
- JavaScript modules: `0`
- File-based completion (logical): `53/53 = 100%`
- Files on disk (including legacy JS): `82` total (`53` `.ts`, `0` `.js`)
- Combined source LOC on disk: `15,715`
- TypeScript LOC: `15,715`
- TypeScript LOC ratio on disk: `15,715 / 15,715 = 100%`
- Phases 1, 2, 3, and 4 are complete on the full in-`src` shim-removal scope;
- All `src` modules are now TypeScript-native.

## What is currently done

- [x] `src/sim/catalog.ts` with shim `src/sim/catalog.js`
- [x] `src/data/planets.ts` with shim `src/data/planets.js`
- [x] `src/textures.ts` with shim `src/textures.js`
- [x] `src/constants.ts` with shim `src/constants.js`
- [x] `src/sunController.ts` migration completed
- [x] `src/frontend/app/stateStore.ts` with shim
- [x] `src/frontend/app/timeController.ts` with shim
- [x] `src/frontend/app/textureManager.ts` with shim
- [x] `src/frontend/app/sceneSetup.ts` with shim
- [x] Backend EPO smoke-test scaffold and 30 seeded episodes:
  - `backend/mission/epo/config.py`
  - `backend/mission/epo/metrics.py`
  - `backend/mission/epo/runners.py`
  - `backend/mission/epo/verifier.py`
  - `backend/mission/epo/sample_episodes.py`
  - `backend/mission/epo/smoke_test.py`
- [x] Runtime bootstrap app modules converted with shim strategy:
  - `src/main.ts`
  - `src/frontend/app/{animationLoop,cameraController,inputHandler,uiBindings,labelSystem,bodyManager,routeRenderer,localSystemRenderer,nearbySystemsRenderer,plannerController,temp_nearbySystemsRenderer}.ts`
  - `src/frontend/camera/transitions.ts`
- [x] Feature logic stack converted with shim strategy:
  - `src/frontend/features/planetary/{terrainSynthesis,moonTextureCatalog,cloudDataPipeline,moonTexturePipeline,visualProfiles,satellitePropagationWorker,satelliteSystem}.ts`
  - `src/frontend/features/solar/{solarObservationTexture,solarMagnetics,solarFeatureBlending,solarFlares,sunVisuals,solarWind,solarProminences,solarPhysicsClient,gravitationalWaves}.ts`
  - `src/frontend/features/trajectory/{localPlanner,index}.ts`
- [x] `src/frontend/rendering/{lodManager,milkyWay,orbitRenderer}.ts`
- [x] `src/sim/asteroids/{asteroidDistributions,asteroidGeometry,asteroidPipeline,asteroidShaders}.ts`

## Remaining JS workload (in `src`)

- `0` JavaScript-only modules remain (all remaining stems have `.ts` equivalents).
- `src`: no JavaScript-only modules remain (all `.js` in this tree have been removed).

## Phase plan (priority order)

### Phase 1 — Runtime bootstrap and interaction layer
- [x] `src/main.js` shim → `src/main.ts`
- [x] `src/frontend/app/animationLoop.js` shim → `src/frontend/app/animationLoop.ts`
- [x] `src/frontend/app/cameraController.js` shim → `src/frontend/app/cameraController.ts`
- [x] `src/frontend/app/inputHandler.js` shim → `src/frontend/app/inputHandler.ts`
- [x] `src/frontend/app/uiBindings.js` shim → `src/frontend/app/uiBindings.ts`
- [x] `src/frontend/app/labelSystem.js` shim → `src/frontend/app/labelSystem.ts`
- [x] `src/frontend/app/bodyManager.js` shim → `src/frontend/app/bodyManager.ts`
- [x] `src/frontend/app/routeRenderer.js` shim → `src/frontend/app/routeRenderer.ts`
- [x] `src/frontend/app/localSystemRenderer.js` shim → `src/frontend/app/localSystemRenderer.ts`
- [x] `src/frontend/app/nearbySystemsRenderer.js` shim → `src/frontend/app/nearbySystemsRenderer.ts`
- [x] `src/frontend/app/plannerController.js` shim → `src/frontend/app/plannerController.ts`
- [x] `src/frontend/app/temp_nearbySystemsRenderer.js` shim → `src/frontend/app/temp_nearbySystemsRenderer.ts`
- [x] `src/frontend/camera/transitions.js` shim → `src/frontend/camera/transitions.ts`

### Phase 2 — Feature logic stack
- [x] `src/frontend/features/planetary/*` (all `7` files)
- [x] `src/frontend/features/solar/*` (all `9` files)
- [x] `src/frontend/features/trajectory/*` (both files)
- [x] Validate UI/visual behavior against current baselines.

### Phase 3 — Rendering + completion glue
- [x] `src/frontend/rendering/{lodManager,milkyWay,orbitRenderer}.ts`
- [x] `src/sim/asteroids/{asteroidDistributions,asteroidGeometry,asteroidPipeline,asteroidShaders}.ts`
- [x] Remove obsolete `.js` shims after TS-native imports and file paths are in place.
- [x] Clean up bootstrap exports once app and features are on TS.
- [x] `src/sim` runtime callsites touched by previous phases.

### Phase 4 — Runtime hardening and remaining cleanup
- [x] Audit `src/sim/asteroids/*` imports/callers for remaining shim usage and update parity references.
- [x] Remove obsolete `.js` shims for asteroids (`asteroidDistributions`, `asteroidGeometry`, `asteroidPipeline`, `asteroidShaders`).
- [x] Refresh `src/sim/asteroids/README.md` parity notes for the TS migration.
- [x] Remove remaining `src` shim files that became obsolete after TS-native callsite migration (`main`, `sim/catalog`, `textures`, constants, rendering/app/features/runtime).
- [ ] Final lint/build smoke pass plus behavior parity checks.

## Milestones

- Milestone A (runtime loop stable): end of Phase 1 — **completed in this iteration**
- Milestone B (feature parity): end of Phase 2 — **completed in this iteration**
- Milestone C (migration complete): end of Phase 4 — **TS shim removal complete in `src`, parity smoke validation pending**

## Smoke-test command

- `PYTHONPATH=backend python -m mission.epo.smoke_test --family mining_core --family outer_reacher --family return_pressure --compact`
