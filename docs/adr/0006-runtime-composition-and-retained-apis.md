# Runtime composition and retained APIs

Accepted for the partial-finding repair, 2026-10-31 (F-006, F-022, F-029, F-030).

`index.html` loads `src/main.ts`. This is the composition root for the shipped
page. An exported module, a historical screenshot, or a passing library test
does not establish that a feature is part of that page. README describes the
page; this record describes ownership and retained integration surfaces.

| Responsibility | Owner | Boundary |
|---|---|---|
| Startup, disposal and renderer loss | `runtimeLifetime.ts`, `rendererRecovery.ts` and main startup | Every acquired resource has one retirement path. Renderer failure stops simulation work; DOM recovery remains usable. |
| Animation scheduling | `frameLifecycle.ts` | One RAF owner; hidden pages cancel frames; stage failure cannot starve later stages. |
| Simulation JD and playback | `stateStore.ts`, `timeController.ts` | Fixed-step JD policy, distinct from bounded decorative time. No wall-time catch-up is implied. |
| Canonical body states | `solarSystemModel.ts`, `modelWorkerContract.ts` | Float64 heliocentric J2000 vectors in AU and AU/day; unavailable states are explicit. |
| Orbital worker transport | `modelWorkerController.ts` | Owns readiness, exact request/reply matching, deadlines, two bounded lifetime restarts and disposal. Main owns scene application and local fallback. |
| Body scene and selection | main composition, `bodyManager.ts`, `planetView.ts`, viewport/camera controllers | View offsets cannot mutate canonical model vectors. Physical radii and display estimates remain distinct. |
| Labels and decorative stars | `sceneAnnotations.ts` | Screen-size labels; stars are directions without astronomical distances. |
| Asteroid/Kuiper display | `beltRenderer.ts`, `kuiperBeltUpdater.ts` | Fixed-element propagation; hidden/unchanged Kuiper epochs do no upload work. Candidate populations do not certify resonances. |
| Solar acquisition and presentation | `sunController.ts` and solar feature modules | Qualified provider state, owned polling and cancellation, explicit procedural fallback. Decorative motion is not calibrated plasma evolution. |
| Backend physical integration | `backend/sim` and owned process/runner layers | Scientific integration is independent of the default page's local orbital worker. |
| Mission planning | `backend/mission` and trajectory APIs | Candidate generation does not imply a verified feasible recommendation. |

File names in this table are resolved under `src/frontend/app/` unless a path
or other directory is stated. The body model and worker contracts are under
`src/sim/` and `src/workers/`; solar composition lives in `src/sunController.ts`.

## Retained surfaces

The backend WebSocket `SimulationClient`, planner/route UI, TLE and satellite
modules, nearby/local-system navigation, cloud imagery, catalog stars and
curated moon maps are retained library or optional integration surfaces. Their
maintainers must preserve their explicit input/protocol contracts and tests.
They are not implicitly wired into `main.ts` by this repair. Moon ephemerides
remain an opt-in loader; `showMoons=false` is the shipped composition policy.
Earth/Mars use procedural quadtree terrain; other body maps are procedural.

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
