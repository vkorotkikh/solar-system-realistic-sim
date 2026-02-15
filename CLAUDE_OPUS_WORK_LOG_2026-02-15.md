# Claude Opus Work Log — 2026-02-15

## Session Overview

Full audit and bug fix session on the Solar System Realistic Simulator codebase. Investigated a reported critical Julian Date calculation bug, applied the fix, then performed a comprehensive codebase-wide analysis for additional bugs and issues.

---

## 1. Bug Fix Applied: Julian Date Double-Counting (CRITICAL)

### File Changed
`backend/sim/rebound_nbody.py` — line 137

### Root Cause
In `REBOUNDEngine.get_julian_date()`, the return value was:
```python
return self.sim.t * DAYS_PER_YEAR + self.start_jd  # BUG
```

REBOUND's internal time `sim.t` is always measured from t=0 (the J2000 epoch), because the simulation is initialized at J2000 and then optionally integrated forward to the requested `start_jd`. This means `sim.t` already encodes the full offset from J2000.

When `initialize(start_jd=X)` is called where X != J2000:
1. Orbital elements are set up at J2000
2. The simulation integrates forward to `(X - J2000) / DAYS_PER_YEAR`
3. So after init: `sim.t = (X - J2000) / DAYS_PER_YEAR`

The old code then computed:
```
sim.t * DAYS_PER_YEAR + self.start_jd
= (X - J2000) + X
= 2X - J2000
```
This is wrong — it double-counts the offset from J2000.

### Fix Applied
```python
return self.sim.t * DAYS_PER_YEAR + J2000_JD  # FIXED
```

### Verification
- After `initialize(start_jd=X)`: `get_julian_date() = (X - J2000) + J2000 = X` (correct)
- After `step(dt_days)`: `get_julian_date() = (X - J2000 + dt_days) / DAYS_PER_YEAR * DAYS_PER_YEAR + J2000 = X + dt_days` (correct)
- After `set_julian_date(jd)`: reinitializes with `start_jd=J2000`, integrates to `(jd - J2000) / DAYS_PER_YEAR`, returns `jd` (correct)

### Impact
Without this fix, any simulation started at a date other than J2000 (e.g., "today") would report incorrect Julian dates — off by `(start_jd - J2000)` days. This would cascade into wrong date display, wrong time-jump behavior, and desynchronization between frontend and backend time.

### Other Engines
- **TudatPy** (`backend/sim/tudatpy_hooks.py`): NOT affected. It tracks JD independently via `self._jd` and increments directly in `step()`.
- **Frontend local solver** (`src/sim/solarSystemModel.js`): NOT affected. It works purely with Julian dates passed in.

---

## 2. Full Codebase Analysis — Bug & Issue Report

### Files Analyzed
| File | Lines | Status |
|------|-------|--------|
| `backend/sim/rebound_nbody.py` | 187 | BUG FIXED |
| `backend/sim/tudatpy_hooks.py` | 528 | Clean |
| `backend/sim/kuiper.py` | 166 | Clean |
| `backend/sim/base.py` | 65 | Clean |
| `backend/server.py` | 676 | See observations below |
| `backend/data/bodies.py` | 684 | Clean |
| `backend/trajectory/planner.py` | 374 | Clean |
| `src/main.js` | 3,164 | See observations below |
| `src/sim/orbitMath.js` | 103 | Clean |
| `src/sim/solarSystemModel.js` | 145 | Clean |
| `src/sim/catalog.js` | 356 | Clean |
| `src/constants.js` | 105 | Clean |
| `src/data/planets.js` | 853 | Clean |
| `src/frontend/features/trajectory/index.js` | 97 | Clean |
| `src/frontend/features/trajectory/localPlanner.js` | 297 | Clean |

### Verified NOT Bugs (Correct Implementations)

1. **Kepler solver** (`orbitMath.js:15-30`, `planner.py:37-51`): Newton-Raphson with clamped eccentricity (<0.9999999), 20 max iterations, tolerance 1e-9. Correct and convergent.

2. **Velocity transform** (`orbitMath.js:68-93`): Perifocal → orbital plane → inertial frame rotation chain (R_z(omega) → R_x(i) → R_z(Omega)) is mathematically correct. The factor `(n*a)/(1-e*cos(E))` is the correct eccentric anomaly velocity scaling.

3. **Moon orbit frame normalization** (`catalog.js:72-98`): The Laplace/equatorial → ecliptic conversion via orbit normal rotation is a valid approximation for display purposes. Not a bug — it's a deliberate approximation.

4. **Kuiper belt particle generation** (`kuiper.py:99-126`): Rayleigh-distributed eccentricities and half-normal inclinations are physically motivated distributions for classical KBOs. Not a bug.

5. **Backend `epoch_jd` mean anomaly correction** (`rebound_nbody.py:83-86`): Bodies with `epoch_jd != J2000` (e.g., Hebe at JD 2461000.5) correctly propagate their mean anomaly backward to J2000 before REBOUND initialization. The formula `delta_days = start_jd - epoch_jd` with period-based correction is correct.

6. **Thread safety in `server.py`** (lines 385-386, 266-267): The `_latest_state` dict is assigned under lock after all mutations. The sim thread always creates a fresh dict each frame, never mutating the previous one. The send loop only reads (via `json.dumps`). This pattern is thread-safe in practice — no data races.

### Observations (Not Bugs, But Worth Noting)

#### A. Time Scale Sent Every Frame (Low Priority)
**Location**: `src/main.js:3109`
```javascript
simClient.send({ type: 'set_time_scale', days_per_sec: simState.timeScaleDaysPerSec });
```
This sends a `set_time_scale` command to the backend on every animation frame (~60 Hz), even when the value hasn't changed. This floods the command queue with redundant messages. The backend processes up to 128 commands per frame, so it doesn't cause functional issues, but it's wasteful bandwidth and CPU.

**Not a bug**: The backend handles duplicate commands idempotently. It just sets `self.time_scale` to the same value.

**Recommendation**: Only send when the value changes.

#### B. Data Duplication Between Frontend and Backend (Architectural)
**Location**: `src/data/planets.js` vs `backend/data/bodies.py`

Planet orbital elements, masses, and radii are defined in both files with different naming conventions (`aAu` vs `a_au`, `iDeg` vs `i_deg`, `epochJd` vs `epoch_jd`). These must be manually kept in sync.

**Not a bug currently**: Both files contain identical numerical values. But any future update to one file without updating the other would cause frontend/backend position disagreement.

**Recommendation**: Consider having the frontend fetch body data from the backend's `/bodies` endpoint, or generate both files from a single source of truth.

#### C. WebSocket URL Hardcoded to localhost (Design Choice)
**Location**: `src/main.js:2094`
```javascript
this.ws = new WebSocket(`ws://localhost:${port}/ws/sim?...`);
```

This prevents connecting to a remote backend server. The trajectory planner (`src/frontend/features/trajectory/index.js:13-16`) uses `window.location.hostname` with a fallback, but the WebSocket client doesn't.

**Not a bug**: Works for the intended local development use case.

#### D. No Geometry/Material Disposal on Scene Teardown
The Three.js meshes, geometries, textures, and materials created in `main.js` are never disposed. Since the app is a single-page application that runs until the tab closes, this is not a memory leak in practice — the browser reclaims everything on page unload.

**Not a bug**: Standard pattern for single-page Three.js applications.

#### E. Orbit Lines Use Fixed Segment Count
Orbit lines are drawn with a fixed number of segments (per orbit). For very eccentric orbits (e.g., Sedna with e=0.8496), the segments near periapsis may be spaced far apart angularly, leading to visible chunkiness. This is a visual fidelity tradeoff, not a computational bug.

#### F. Frontend Asteroid Particles (Performance Note)
The asteroid belt and Kuiper belt each generate thousands of particles on the GPU via `Points` geometry. The detail layers use adaptive LOD, which mitigates the worst case. Frame drops on low-end GPUs are possible but are handled gracefully (the detail just won't appear).

---

## 3. Conclusions

### Bugs Found and Fixed: 1
- **Julian Date double-counting** in `rebound_nbody.py` — FIXED

### Additional Bugs Found: 0
After thorough analysis of all 15 source files (~6,500+ lines of code across Python and JavaScript), no additional bugs were found. The orbital mechanics implementations are mathematically correct, the data transformations are properly handled, and the frontend-backend communication protocol is robust.

### Code Quality Assessment
The codebase is well-architected with clean separation of concerns:
- Abstract engine interface allows transparent backend swapping
- Frontend gracefully degrades to local Keplerian simulation when backend is unavailable
- Trajectory planning has both local and backend implementations with automatic fallback
- Input validation is thorough on the backend API endpoints
- Numerical edge cases (division by zero, NaN) are properly guarded

---

## 4. Future Recommendations

1. **Deduplicate planet data**: Create a shared JSON source of truth for orbital elements, generate both `planets.js` and `bodies.py` from it.

2. **Throttle time scale sync**: Only send `set_time_scale` over WebSocket when the value actually changes, rather than every frame.

3. **WebSocket reconnection**: Add automatic reconnection with exponential backoff in the `SimulationClient` class.

4. **Backend state snapshot**: Consider returning a deep copy from `get_latest_state()` instead of a reference, for defensive thread safety.

5. **Test coverage**: Add unit tests for the Kepler solver and Julian Date conversion functions to catch regressions like the one fixed today.
