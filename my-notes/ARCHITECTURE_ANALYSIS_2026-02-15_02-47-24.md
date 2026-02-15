# Solar System Sim Architecture Analysis and Execution Report

## Timestamp

- Generated: Sun Feb 15 02:47:39 EST 2026
- Project root: `/home/nomad/Documents/solar-system-realistic-sim`

## 1. Current Scaffolding Assessment

### What is strong

- Simulation foundation is clear and practical:
  - frontend local Keplerian model in `src/sim/`
  - backend optional higher-fidelity engines in `backend/sim/`
- Data cataloging is explicit and portable:
  - body definitions in `src/data/planets.js` and backend parity in `backend/data/bodies.py`
- Rendering and interaction capabilities are rich and integrated in one runtime:
  - body focus/follow, labels, overlays, belts/clouds, route visualization.
- Backend already exposes stable operational endpoints:
  - `/health`, `/info`, `/bodies`, websocket `/ws/sim`.

### What needs improvement

- Frontend feature boundaries are shallow; core `src/main.js` still owns many concerns.
- Course/trajectory logic was frontend-only and not centered in backend mission services.
- Directory structure did not strongly communicate feature ownership (especially mission planning).
- Backend lacked a dedicated mission-planning package namespace.

## 2. Target Architecture Direction

### Guiding structure

- Keep frontend in a dedicated feature subtree under source:
  - `src/frontend/features/<feature>/...`
- Keep backend services in backend package tree:
  - `backend/<feature>/...`
- Keep simulation engines and mission-planning modules independent:
  - `backend/sim/` for propagation
  - `backend/trajectory/` for course design

Rationale:
- This keeps Python backend deployable and import-clean while still enforcing feature-level ownership.
- Moving Python backend into JS `src/` would create language/toolchain coupling and break clean runtime boundaries.

## 3. Improvement Plan

1. Create dedicated backend trajectory package and move route logic there.
2. Add backend REST API for course planning so frontend becomes client/orchestrator, not solver host.
3. Introduce frontend feature directory for trajectory module.
4. Switch planner flow to backend-first with local fallback.
5. Continue decomposition of `src/main.js` into feature modules in follow-up passes:
- explorer/focus
- labels/locators
- deep-space rendering (Milky Way, Oort, belts)
- simulation transport (`/ws/sim` client)

## 4. Work Carried Out In This Iteration

### Implemented now

- Added backend trajectory package:
- `backend/trajectory/__init__.py`
- `backend/trajectory/planner.py`
- Added backend trajectory API endpoints in `backend/server.py`:
- `GET /trajectory/capabilities`
- `POST /trajectory/plan`
- Added frontend feature-scoped trajectory module:
- `src/frontend/features/trajectory/localPlanner.js`
- `src/frontend/features/trajectory/index.js`
- Switched frontend planner import to feature module path in `src/main.js`.
- Updated planner execution path to async backend-first flow with local fallback and solver attribution in output.
- Removed legacy planner path file:
- deleted `src/planner/trajectoryPlanner.js`
- Updated scaffolding docs in `README.md` with architecture and trajectory API checks.

### Backend runtime context retained

- Existing backend hardening from earlier pass remains active:
- queue bounds
- backpressure signaling
- runtime-error latching
- state diagnostics

## 5. Validation

- `python -m compileall backend` passed.
- `npm run build` passed after the planner module path correction.

## 6. Next Recommended Steps

1. Create `src/frontend/features/simulation-client/` and move websocket connect/apply logic out of `src/main.js`.
2. Create `src/frontend/features/explorer/` and move body search/focus/follow logic there.
3. Create `src/frontend/features/deep-space/` for Milky Way + Oort + Kuiper + asteroid visual layers.
4. Add backend unit tests for `backend/trajectory/planner.py` (input validation + deterministic route scoring).
5. Add API contract tests for `/trajectory/plan` and websocket error payload format.
