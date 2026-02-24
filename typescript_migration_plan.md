# TypeScript Migration Plan

## Current state (as of now)

- Source files in `src` with JS/TS target modules: `58`
- TypeScript files: `12`
- JavaScript files: `46`
- Pure JS-to-TS conversion completion (file-based): `12/58 = 20.7%`
- JavaScript/TypeScript source LOC (combined, via `wc`): `15,625`
- TypeScript LOC: `5,824`
- TypeScript LOC coverage: `5,824 / 15,625 = 37.3%`
- New TS wave completed in this iteration: `5` files (`constants`, `stateStore`, `timeController`, `textureManager`, `sceneSetup`) with compatibility `.js` re-export shims.

### Immediate interpretation
- Progress is meaningful in infrastructure, but most feature/simulation modules are still JavaScript (mostly `src/frontend/features/*`, `src/frontend/app/*`, and `src/main.js`).

---

## Scope breakdown (remaining, by file count)

### Remaining files to convert
- `46` JavaScript files
  - `app`: 15 files
  - `features`: 18 files
  - `sim`: 5 files
  - `data`: 1 file
  - root (`main`, `textures`, etc.): 7 files

### High-level risk / complexity buckets
- Core runtime path (`main`, state/time/controls/render integration): medium-high
- Planetary/solar feature math + shaders / visuals: high
- Asteroid pipeline + distributions: medium-high

---

## Phased TODO plan

### Phase 0 — Completed (already done)
- [x] Convert core infrastructure modules to TypeScript
  - `src/constants.ts` (+ shim `src/constants.js`)
  - `src/frontend/app/stateStore.ts` (+ shim)
  - `src/frontend/app/timeController.ts` (+ shim)
  - `src/frontend/app/textureManager.ts` (+ shim)
  - `src/frontend/app/sceneSetup.ts` (+ shim)

### Phase 1 — Data + catalog + simulation model (target: 20–25% of remaining effort)
- [ ] `src/sim/catalog.js` → `src/sim/catalog.ts` + shim
- [ ] `src/data/planets.js` → `src/data/planets.ts` (or structured typings in adjacent `types` module + minimal wrapper)
- [ ] `src/textures.js` → `src/textures.ts` + shim
- [ ] `src/sunController.ts` and tightly coupled dependencies audit for stronger typings

### Phase 2 — Runtime wiring & interaction layer (target: 20–25% of remaining effort)
- [ ] `src/main.js` → `src/main.ts` or TS boundary shim pattern
- [ ] `src/frontend/app/animationLoop.js` → `src/frontend/app/animationLoop.ts`
- [ ] `src/frontend/app/cameraController.js` → `src/frontend/app/cameraController.ts`
- [ ] `src/frontend/app/inputHandler.js` → `src/frontend/app/inputHandler.ts`
- [ ] `src/frontend/app/uiBindings.js` → `src/frontend/app/uiBindings.ts`
- [ ] `src/frontend/app/labelSystem.js` (strongly tied to runtime; do after `state`/`model` stabilize)

### Phase 3 — Feature stack (target: 40–45% of remaining effort)
- [ ] `src/frontend/features/solar/*` (all 9 files)
- [ ] `src/frontend/features/planetary/*` (all 7 files)
- [ ] `src/frontend/features/trajectory/*` (2 files)
- [ ] Keep behavior parity checks at integration points (no visible changes in rendering/control behavior).

### Phase 4 — Asteroids + hardening (target: 10–15% remaining)
- [ ] `src/sim/asteroids/*` (4 files)
- [ ] Resolve any residual `allowJs`/typing pressure (import/export gaps, JSON typing)
- [ ] Remove shim burden where all callers move to `.ts` extensions
- [ ] Final migration cleanup pass on app bootstrap and docs

---

## Completion metric proposal

- Milestone A (first value): finish Phase 1 end-to-end and land 1st PR
  - Estimated new conversion ratio: `~35% files` / `~55% LOC`
- Milestone B (core runtime): finish Phase 2
  - Estimated conversion ratio: `~55% files` / `~75% LOC`
- Milestone C (full migration): finish all phases
  - Target conversion ratio: `100% JS/TS source files` with strict TS types on call boundaries

## Suggested immediate action order (next 1–2 passes)
1. Start Phase 1, starting with:
   - `src/sim/catalog.ts` (single integration seam)
   - `src/data/planets.ts` (type surface)
   - keep behavior unchanged behind temporary shim exports where needed
2. Then proceed through `src/main.ts` migration to stabilize app wiring.
3. Only after runtime wiring is stable, convert visual feature clusters.
