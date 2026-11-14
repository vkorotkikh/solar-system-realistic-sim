# Runtime composition and retained APIs

Accepted for the partial-finding repair, 2026-10-31 (F-006, F-022, F-029, F-030).

`index.html` loads `src/main.ts`. This is the composition root for the shipped
page. An exported module, a historical screenshot, or a passing library test
does not establish that a feature is part of that page. README describes the
page; this record describes ownership and retained integration surfaces.

| Responsibility | Owner | Boundary |
|---|---|---|
| Startup, disposal and renderer loss | `runtimeLifetime.ts`, `rendererRecovery.ts` and `src/main.ts` startup | Every acquired resource has one retirement path. Renderer failure stops simulation work; DOM recovery remains usable. |
| Animation scheduling | `frameLifecycle.ts` | One RAF owner; hidden pages cancel frames; stage failure cannot starve later stages. |
| Simulation JD and playback | `stateStore.ts`, `timeController.ts` | Fixed-step JD policy, distinct from bounded decorative time. No wall-time catch-up is implied. |
| Canonical body states | `src/sim/solarSystemModel.ts`, `src/workers/modelWorkerContract.ts` | Float64 heliocentric J2000 vectors in AU and AU/day; unavailable states are explicit. |
| Orbital worker transport | `modelWorkerController.ts` | Owns readiness, exact request/reply matching, deadlines, at most two restarts per rolling ten minutes and disposal. Main owns scene application and local fallback. |
| Body scene and selection | `src/main.ts` composition, `bodyManager.ts`, `src/frontend/features/planetary/planetView.ts`, `viewportCameraController.ts` | View offsets cannot mutate canonical model vectors. Physical radii and display estimates remain distinct. |
| Labels and decorative stars | `sceneAnnotations.ts` | Screen-size labels; stars are directions without astronomical distances. |
| Asteroid/Kuiper display | `src/frontend/features/asteroids/beltRenderer.ts`, `src/frontend/features/asteroids/kuiperBeltUpdater.ts` | Fixed-element propagation; hidden/unchanged Kuiper epochs do no upload work. Candidate populations do not certify resonances. |
| Solar acquisition and presentation | `src/sunController.ts` and the modules in `src/frontend/features/solar/` | Qualified provider state, owned polling and cancellation, explicit procedural fallback. Decorative motion is not calibrated plasma evolution. |
| Backend physical integration | `backend/sim` and owned process/runner layers | Scientific integration is independent of the default page's local orbital worker. |
| Mission planning | `backend/mission` and trajectory APIs; page panel via `plannerController.ts`, `routeRenderer.ts` and `src/frontend/features/trajectory/` | Candidate generation does not imply a verified feasible recommendation. Listeners and plotted routes retire with startup. |
| Moons, surface maps and satellites | `src/main.ts` composition, `src/frontend/features/planetary/planetSurfaceMaps.ts`, `moonTexturePipeline.ts`, `satelliteSystem.ts` | Display offsets keep moons and satellites above enlarged primaries without touching canonical vectors. Maps and satellite orbits load on demand and retire with startup. |

Bare file names in this table are in `src/frontend/app/`; every other entry
states its path from the repository root.

## Retained surfaces

The backend WebSocket `SimulationClient`, nearby/local-system navigation,
cloud imagery and catalog stars are retained library or optional integration
surfaces. Their maintainers must preserve their explicit input/protocol
contracts and tests. They are not implicitly wired into `main.ts`.

On 2026-11-08 the moons, the planner panel and route display, Earth satellites
and the curated moon maps were composed into `main.ts`, with acceptance in
`tests/browser/restored-layers.spec.ts`. Moons default on. Planets keep their
enlarged radii and each moon moves out by its parent's enlargement; the catalog
no longer shrinks planets to fit their moons. Since 2026-11-14 the page preloads
fitted ephemerides for all 423 moons and the Moon and Mars surface maps at
startup, uploading the maps to the GPU on arrival; Earth stays procedural.

Before activating a retained feature, its change must include the composition
call, typed capability requirements, disposal ownership, real browser/API
acceptance and updated README scope. Avoid a second independent animation
loop, simulation clock, network owner or mutable copy of canonical state.
Obsolete publication paths with no valid output contract are retired, with
migration instructions, rather than retained as apparently functional APIs.

## Evidence and maintenance

Worker failure/recovery is exercised against the actual page in
`tests/browser/app-smoke.spec.ts`; unit tests cover timeouts, exact reply
matching, finite-state validation and disposal. Frame lifecycle tests cover
hidden pages, delayed callbacks and independent stage failure. Scene tests
exercise pixel size and rendered close-focus stars, including body occlusion.

Current repair status belongs to
[`AUGUST_PARTIALS_CLOSURE_2026-10-31.md`](../../agent-notes/AUGUST_PARTIALS_CLOSURE_2026-10-31.md).
Historical audit and research notes retain their original claims as dated
evidence, not as current implementation specifications. Product decisions are
recorded in [supported policies](../supported-product-policies.md).
