# TypeScript Migration Plan

## Current state snapshot (2026-02-25)

- Source files in `src`: `61`
- TypeScript files: `28`
- JavaScript files: `33`
- File-based completion: `28/61 = 45.9%`
- Combined source LOC: `15,714`
- TypeScript LOC: `8,804`
- TypeScript LOC coverage: `8,804 / 15,714 = 56.0%`
- Phase 1 data/sim items (`catalog`, `planets`, `textures`) are migrated with compatibility `.js` shims.

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
- [x] Backend EPO smoke-test scaffold and 30 seeded episodes: `backend/mission/epo/config.py`, `backend/mission/epo/metrics.py`, `backend/mission/epo/runners.py`, `backend/mission/epo/verifier.py`, `backend/mission/epo/sample_episodes.py`, `backend/mission/epo/smoke_test.py`
- [x] Runtime bootstrap app modules converted with shim strategy:
  - `src/main.ts`
  - `src/frontend/app/{animationLoop,cameraController,inputHandler,uiBindings,labelSystem,bodyManager,routeRenderer,localSystemRenderer,nearbySystemsRenderer,plannerController,temp_nearbySystemsRenderer}.ts`
  - `src/frontend/camera/transitions.ts`

## Remaining JS workload (in `src`)

- `33` JavaScript modules remain (all as shims + non-migrated feature/render modules)
- `frontend/app`: `13` unconverted JS files (the remaining app+feature-facing render/control modules)
- `frontend/features`: `18` files, about `5,789` LOC
- `sim`: `5` files, about `544` LOC
- `frontend/rendering`: `3` files, about `557` LOC
- `frontend/camera`: `1` file, `80` LOC
- `root`: `main.js` plus existing shims, about `681` LOC

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
- [ ] `src/frontend/features/planetary/*` (all `7` files)
- [ ] `src/frontend/features/solar/*` (all `9` files)
- [ ] `src/frontend/features/trajectory/*` (both files)
- [ ] Validate UI/visual behavior against current baselines.

### Phase 3 — Rendering + completion glue
- [ ] `src/frontend/rendering/*`
- [ ] Clean up bootstrap exports once app and features are on TS.
- [ ] `src/sim` runtime callsites touched by previous phases.

### Phase 4 — Asteroids and hardening
- [ ] `src/sim/asteroids/*` (4 files)
- [ ] Remove shims where all imports are migrated to `.ts` sources.
- [ ] Final lint/build smoke pass plus behavior parity checks.

## Milestones

- Milestone A (runtime loop stable): end of Phase 1 — **completed in this iteration**
- Milestone B (feature parity): end of Phase 2
- Milestone C (migration complete): end of Phase 4

## Smoke-test command

- `PYTHONPATH=backend python -m mission.epo.smoke_test --family mining_core --family outer_reacher --family return_pressure --compact`
