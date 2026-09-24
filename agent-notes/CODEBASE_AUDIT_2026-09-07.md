# Comprehensive Read-Only Evaluation — `solar-system-realistic-sim`

> **Historical snapshot — not current branch status.** This report is pinned to commit `ec7ad33a503da3a4c6bfd87e4c498e8a53be6984`; later fixes are intentionally outside its scope.

**Commit audited:** `ec7ad33a503da3a4c6bfd87e4c498e8a53be6984` ("docs: reconcile issue reports with current fixes")
**Branch:** `fix/nbody-osculating-initial-state`
**Audit date:** 2026-09-07
**Method:** read-only. All builds, installs, servers, screenshots and regenerated data were produced in a
disposable `git worktree --detach` under a scratchpad. No tracked file in the user's repository was modified.

---

## 0. How to read this report

Every material claim below is backed by a command whose real output I saw. Where I could not run a check,
it is listed in §13 as **NOT RUN** or **BLOCKED**, never silently folded into a pass.

Three labels are used deliberately:

- **OBSERVED** — I ran it and saw the output quoted.
- **INFERRED** — reasoning from code I read; confidence stated.
- **REFUTED** — a hypothesis carried into this audit that the evidence does *not* support. §6.4 lists these,
  because a prior scan of commit `aa6e39a` supplied several presumptions that are no longer true at HEAD.

A note on fairness: this repository has improved substantially since `aa6e39a`. Typecheck errors fell
1300 → 280, the frontend acquired 100 real tests, the backend 48 → 143, and several subsystems
(REBOUND unit handling, the Lambert solver, the planet accuracy gate, the asteroid data provenance)
are genuinely well engineered. The report says so where true. It is nonetheless hard on the gap between
what `README.md` advertises and what the shipped bundle does, because that gap is the single largest
correctness risk in the project.

---

## 1. Executive verdict

**What this product actually is at HEAD:** a single-page, Sun-focused Three.js visualisation
(`index.html` → `src/main.ts`, titled *"Sun Model Lab"*) that renders the Sun, 8 planets + Pluto,
424 moons, ~50,000 catalogued asteroids and 5,000 synthetic Kuiper-belt objects using **in-browser
Keplerian two-body propagation**, plus an AGN/black-hole "Cataclysmic Events" visual panel. It optionally
calls **exactly one** backend endpoint, `GET /solar/physics`.

Alongside it lives a **much larger, largely disconnected FastAPI backend** (1,815-line `server.py`,
18 routes, REBOUND N-body, Lambert/MGA planner, multi-agent mission planner, benchmark harness) which is
well tested in isolation (143 tests) but which **the shipped user interface never talks to** apart from
that one solar endpoint. `README.md` documents the backend as the product's core; the bundle does not.

### Readiness by audience

| Use case | Verdict | Rationale |
|---|---|---|
| **Visual demonstration** | ✅ **Ready, with caveats** | Loads clean (0 page errors), 55,010 bodies, real JPL asteroid catalog, credible solar model. Caveats: no LICENSE (§11), Moon/Saturn-moon positions visibly wrong away from J2000 (§7), silent synthetic-data substitution (F-04). |
| **Education** | ⚠️ **Conditional** | Planet positions are honest visualisation-grade (§7.1) and the README's *"Physics Notes and Limitations"* section is genuinely accurate. But the Moon is up to **745,623 km** out of place (1.9× its own orbital radius) and Titan **2.4 M km** (2× its orbital radius) — a student would be taught a wrong sky. Fix F-01/F-02 first. |
| **Scientific analysis** | ❌ **Not ready** | `validationCoverage = 0.0`: the benchmark compares nothing (§8.3). No moon validation beyond a single epoch with a 200 %-of-orbit-radius tolerance. Frontend core propagation modules sit at **0 % test coverage**. |
| **Operational trajectory / mission design** | ❌ **Not ready** | The Lambert solver itself is sound (§8.2 — matches textbook Hohmann Δv to 0.1 %, certified residual 1×10⁻⁶ d). But: no multi-revolution support, no validated reference, no finite-burn modelling, `/trajectory/plan` issues **1,499 outbound JPL requests per call** and hangs (§10, F-03), and none of it is reachable from the UI. |

### The six findings that matter most

1. **F-01 (High)** — The apsidal-precession double-count fixed for planets (commit `68aff6b`) was never
   applied to moons. All 424 moons advance mean anomaly at the sidereal rate while their periapsis
   precesses. **Earth's Moon: 745,623 km error at +5 yr; 123× better with the one-line gate applied.**
2. **F-02 (High)** — The "Horizons-backed" moon gate cannot catch F-01: it validates a **single epoch**
   (J2000) with per-moon position tolerances up to **2.0 = 200 % of orbit radius**. 21 tests pass while
   Titan is 2.4 M km wrong.
3. **F-03 (High)** — One unauthenticated `POST /trajectory/plan` fans out to **1,499 HTTPS requests to
   `ssd.jpl.nasa.gov`** (measured), on a handler with **no timeout wrapper** (unlike its four sibling
   compute endpoints) and an **unbounded, never-evicted cache**. Reproducibly hangs >240 s.
4. **F-04 (High)** — Any Phase-1 acceptance-gate failure — **including a 2-second wall-clock load budget** —
   silently discards the real 100,000-row JPL catalog and substitutes a procedurally generated belt that is
   **pixel-indistinguishable** from real data. Observed firing in a normal browser run.
5. **F-06 (High)** — `GET /benchmark/accuracy` reports `passCount 0, passRate 0.0, validationCoverage 0.0`,
   all three scenarios `incomparable_reference`, while still reporting `meanAbsErrorKmS: 0.0` and the label
   `calibrationTier: "strict"`. The committed test **asserts** coverage stays 0.0.
6. **F-05 / F-08 (High)** — **No LICENSE file exists**, while the repo redistributes a 39 MB unmanifested
   texture tree and one texture whose recorded licence is *"Unspecified by provider; verify for
   redistribution"*. Meanwhile `README.md` advertises an engine-selection dropdown, satellite layer,
   nearby-system navigation and trajectory planner UI that **do not exist in `index.html`**.

---

## 2. Baseline and environment

### 2.1 Repository state (OBSERVED)

```
$ git rev-parse HEAD          → ec7ad33a503da3a4c6bfd87e4c498e8a53be6984
$ git status --short --branch → ## fix/nbody-osculating-initial-state
                                (8 untracked files under agent-notes/ and my-notes/; no modified tracked files)
```

| Metric | Value |
|---|---|
| Tracked files | 342 |
| Tracked by type | 103 `.md`, 73 `.ts`, 67 `.py`, 31 `.jpg`, 19 `.json`, 12 `.tex`, 10 `.csv`, 8 `.mjs`, 5 `.png`, 3 `.pdf` |
| Working tree | 225 MB total (`.git` 62 MB, `src` 41 MB, `node_modules` 106 MB) |
| Largest tracked files | `moon_albedo_lroc_8192.jpg` 9.2 MB, `mars_relief_mola_4096.png` 7.9 MB, `milky_way_2mass_equirect_4096.jpg` 4.4 MB, `asteroid_phase1_main_100000.bin` 3.5 MB |
| Committed build output | none (`dist/` untracked & gitignored) — good |
| Committed debug artifacts | `debug_screenshot.png` (69 kB), `debug_screenshot_full.png` (476 kB) — repo hygiene |

**Note:** there are **more tracked Markdown files (103) than TypeScript source files (73)**, and 28 `.md`/`.tex`
research/work-log documents sit at the repository root mixed with production source (§11.4).

### 2.2 Toolchain (OBSERVED)

| Component | Version | Notes |
|---|---|---|
| OS | Linux 6.18.33.2-microsoft-standard-WSL2, x86_64, 32 vCPU, 93 GB RAM | |
| Node / npm | v22.22.1 / 10.9.4 | Not on system PATH; obtained from the official tarball |
| Python | 3.12.13 (venv) | Host default is 3.14.6 — **the repo does not declare a supported Python version** |
| Browser | Chromium 1243 (Playwright), **WebGL 2.0 via SwiftShader** | ⚠️ software rasteriser — see §9 caveat |
| Prod deps | 2 (`three@0.182.0`, plus `@types/three`) | |
| Dev deps | 109 resolved | |
| REBOUND | 5.1.1 (installed, exercised) | |
| TudatPy | **not installed** — optional, correctly reported unavailable | Not penalised; see §13 |

### 2.3 Baseline command results (OBSERVED)

| Command | Exit | Result |
|---|---|---|
| `npm ci` | 0 | clean |
| `npm ls --all` | 0 | 160 lines; only unmet deps are cross-platform optional binaries (expected) |
| `npm run typecheck` | **2** | **280 errors** (was ~1300 at `aa6e39a`) |
| `vite build` | 0 | **39 modules**, `index-*.js` **890.48 kB** (gzip 222.97 kB) + `modelWorker-*.js` 19.46 kB + CSS 6.53 kB |
| `npm test` (vitest) | 0 | **100 tests / 6 files pass** in 639 ms |
| `npm audit` | 1 | **8 vulns**: 1 critical, 5 high, 1 moderate, 1 low — all dev-only |
| `pip install -r backend/requirements.txt` | 0 | ⚠️ **`httpx` is required by the test suite but absent from `requirements.txt`** |
| `pytest -q` (backend) | 0 | **143 tests pass** in 51 s |
| `python -m compileall backend scripts` | 0 | every Python file parses |

**Reproduce the environment:**
```bash
curl -sSL -o node.tar.xz https://nodejs.org/dist/v22.22.1/node-v22.22.1-linux-x64.tar.xz
tar xf node.tar.xz && export PATH=$PWD/node-v22.22.1-linux-x64/bin:$PATH
python3.12 -m venv venv && venv/bin/pip install -r backend/requirements.txt httpx   # httpx is undeclared
npm ci && npm run typecheck; npx vite build --outDir /tmp/dist; npm test
cd backend && ../venv/bin/python -m pytest -q
```

---

## 3. Architecture and runtime data-flow map

### 3.1 The real production graph

Derived from the **build sourcemaps**, not from file existence
(`npx vite build --sourcemap`, then reading `.map` → `sources`):

```
index.html  ("Sun Model Lab", 5.4 kB, 12 <label>s, 0 aria-*, 0 role=)
   └── <script type="module" src="/src/main.ts">
         │
         ├── src/main.ts  (1,224 lines — the monolith; 52 typecheck errors)
         │     ├── constants.ts ......... AU, JD conversion   ◄── currentJulianDate() = Date.now()/86400000 + 2440587.5   [UTC — see F-09]
         │     ├── sim/catalog.ts ....... builds 434 bodies (10 planets + 424 moons)
         │     ├── sim/orbitMath.ts ..... Kepler solver + Standish secular propagation
         │     ├── sim/solarSystemModel.ts  parent-relative → world accumulation   [0 % test coverage]
         │     ├── sim/asteroidBelt.ts .. 50,000 instances (procedural OR catalog-fed)
         │     ├── sim/kuiperBelt.ts .... 5,000 KBOs + binaries
         │     ├── sim/phase1AsteroidCatalog.ts ──fetch──► /data/asteroid-phase1/*.bin (3.5 MB) + .meta.json
         │     ├── data/planets.ts ...... JPL Standish Table-1 elements
         │     ├── frontend/app/{sceneSetup,bodyManager,stateStore,textureManager,timeController}.ts
         │     ├── frontend/features/asteroids/beltRenderer.ts   (InstancedMesh)
         │     ├── frontend/features/planetary/{planetShaders,quadtreeLOD}.ts
         │     ├── frontend/features/solar/*  (7 modules: sunVisuals, flares, magnetics,
         │     │        gravitationalWaves, featureBlending, observationTexture, physicsClient)
         │     │        └── solarPhysicsClient.ts ──fetch──► http://<host>:8042/solar/physics   ◄── ONLY backend call
         │     ├── frontend/features/superluminal-modeling/*  (4 modules, 133 typecheck errors)
         │     │        └── main.ts:735 ──► model.applyMetricKinematics(…, 1e12)   ◄── F-12 contamination path
         │     ├── sunController.ts (600 lines)
         │     └── workers/modelWorker.ts  ◄── Worker(); float64 contract, AU + AU/day, heliocentric ecliptic J2000
         │
         └── (nothing else — no WebSocket, no /trajectory, no /mission, no /benchmark, no /bodies)
```

**Reachability (OBSERVED):** **33 of 72** `.ts` files reach the production bundle; 39 do not
(6 of those are `*.test.ts`, 2 are test-only check helpers, leaving **31 genuinely dormant production modules**).

**The decisive evidence** that the backend is disconnected — grepping the *built bundle* for backend paths:
```bash
$ grep -o "/solar/physics\|/ws/sim\|/trajectory/[a-z]*\|/mission/[a-z]*\|/benchmark/[a-z]*\|/nearby-systems\|/bodies\|/health\|/info" dist/assets/index-*.js | sort | uniq -c
      1 /solar/physics
```
One endpoint. Nothing else. `grep -rn "new WebSocket"` across the 33 reachable files returns **nothing**.

### 3.2 Backend graph (runs, well tested, mostly unreachable from the UI)

```
uvicorn server:app  (backend/server.py, 1,815 lines, 56 % statement coverage)
 ├── CORS: default = 6-entry localhost allowlist (NOT wildcard), allow_credentials=True
 ├── GET  /health /info /bodies /solar/capabilities                     ← trivial
 ├── GET  /solar/realtime            → SWPC(404 ✗) SILSO(✓) SDO-AIA(✓) GONG(✓)
 ├── GET  /solar/realtime/aia-tile   → Helioviewer proxy      [timeout ✓]
 ├── GET  /solar/physics             → quasi_mhd_corona_v4    [timeout ✓]   ◄── the ONLY UI-reachable route
 ├── GET  /nearby-systems[/{ref}]    → catalog + manifests
 ├── POST /trajectory/lambert        → universal-variable Lambert   [NO timeout ✗]
 ├── POST /trajectory/plan           → MGA search, 1,499 ephem samples [NO timeout ✗]  ◄── F-03
 ├── POST /trajectory/porkchop       → grid scan             [timeout ✓ + size guard ✓]
 ├── POST /mission/plan              → 5-agent orchestration [timeout ✓]
 ├── GET  /benchmark/accuracy        → validationCoverage 0.0 ◄── F-06
 ├── POST /benchmark/accuracy/report → writes markdown, path-contained ✓, overwrite-guarded ✓
 └── WS   /ws/sim                    → REBOUND IAS15, 41 bodies
                                        NO Origin validation ✗ (F-07), no auth, no connection cap
       └── EphemerisService(provider="auto") → spice(absent) → horizons(NETWORK) → kepler
             cache: plain dict, NO eviction, NO TTL  ◄── F-03
```

### 3.3 Feature classification

| Feature | Class | Evidence |
|---|---|---|
| Sun visual stack (limb darkening, corona, flares, magnetics) | **Active, user-accessible** | 7 modules in bundle; `#toggle-magnetic-field`, `#aia-channel` in `index.html` |
| Planets + 424 moons, orbits, labels, realistic-scale toggle | **Active, user-accessible** | `index.html:57-63`; `Bodies: 55,010` observed |
| Asteroid belt (50k) + Kuiper belt (5k) | **Active, user-accessible** | `main.ts:417-418` |
| AGN / SMBH / H29 warp panel | **Active, user-accessible** | `index.html` "Cataclysmic Events" section |
| Phase-1 JPL asteroid catalog load | **Active, background** | `phase1AsteroidCatalog.ts:628-635` |
| `/solar/physics` backend call | **Active, background** | only backend ref in bundle |
| modelWorker propagation | **Active, background** | `modelWorker-*.js` emitted |
| REBOUND N-body `/ws/sim` | **Backend-only — NOT connected to UI** | no `WebSocket` in reachable graph |
| Lambert / MGA / porkchop | **Backend-only — NOT connected to UI** | `trajectory/index.ts` + `localPlanner.ts` dormant |
| Mission planner (5 agents) | **Backend-only — NOT connected to UI** | no `/mission` in bundle |
| Benchmark API | **Backend-only** | no `/benchmark` in bundle |
| Nearby star systems | **Dormant prototype** | `nearbySystemsRenderer.ts` dormant; backend route live; no UI |
| Earth satellite layer / TLE / J2 | **Dormant prototype** | `satelliteSystem.ts`, `satellitePropagationWorker.ts` dormant |
| NASA GIBS real-time clouds | **Dormant prototype** | `cloudDataPipeline.ts` dormant |
| Milky Way band, orbit renderer, LOD manager | **Dormant prototype** | `milkyWay.ts` (463 lines), `orbitRenderer.ts`, `lodManager.ts` dormant |
| Camera transitions, input handler, label system, UI bindings | **Dormant prototype** | 12 `frontend/app/*` modules dormant |
| Moon textures pipeline, terrain synthesis, visual profiles | **Dormant prototype** | dormant |
| Asteroid GPU pipeline + shaders | **Dormant prototype** | `sim/asteroids/*` all dormant (0 % coverage) |
| Engine-selection dropdown + "Connect" button | **Documentation-only — ABSENT** | `grep -c "engine\|Connect" index.html` → **0** |
| Oort cloud | **Documentation-only — ABSENT** | no `oort` in any reachable file |
| `src/workers/asteroidWorker.ts` | **Documentation-only — FILE DOES NOT EXIST** | `ls src/workers/` → only `modelWorker*.ts` |
| "1.9M particle" pipeline | **Documentation-only — unsupported** | no such constant anywhere |

---

## 4. Implemented-versus-declared matrix (README claims vs runtime)

Verified against the built bundle and a live browser, not file existence.

| # | README claim | Line | Status | Evidence |
|---|---|---|---|---|
| 1 | "real-time 3D solar system simulator **and mission-design workbench**" | 3 | ⚠️ **Half true** | Simulator ✅. Mission-design workbench is backend-only, unreachable from UI. |
| 2 | "Sun + 8 planets + Pluto with axial tilt, spin" | 7 | ✅ **True** | catalog builds 434 bodies |
| 3 | "**424 moons** from the NASA/JPL satellite mean-elements table" | 8 | ✅ **True** | `len(moons.json) == 424` |
| 4 | "Physics-grounded Sun model — 13-phase overhaul…" | 9 | ⚠️ **Partly** | Modules exist & are active; constants check out (§7.5). "Physics-grounded" is defensible; "PFSS magnetics" is a dipole+octupole analytic field, not a magnetogram-driven PFSS solve. |
| 5 | "SMBH shockwave simulation — AGN warp-wave engine" | 10 | ✅ **Active** but **speculative** | Reachable; carries 133 of 199 reachable type errors; see F-12. |
| 6 | "Adjustable clock: pause, reverse, time-warp, jump-to-date" | 11 | ✅ **True** | `#time-scale` range −120…120 |
| 7 | "Catalog-driven background stars **and synthetic Milky Way band**" | 12 | ⚠️ Stars ✅ / Milky Way ❌ | `milkyWay.ts` (463 lines) is **dormant** |
| 8 | "**Nearby star systems** … navigable 3D manifests and seamless zoom" | 13 | ❌ **Absent from UI** | `nearbySystemsRenderer.ts` dormant; no UI control |
| 9 | "Asteroid belt … **Phase 1 real-catalog pipeline (1.9M particles)**" | 14 | ❌ **False** | Corpus is 100,000 rows; 50,000 rendered. No "1.9M" anywhere in the tree. |
| 10 | "Kuiper belt … and approximate **Oort cloud** shell" | 15 | ⚠️ KBO ✅ / Oort ❌ | no `oort` in any reachable file |
| 11 | "**Earth satellite layer** (ISS + GEO) with TLE propagation, J2" | 16 | ❌ **Absent from UI** | `satelliteSystem.ts` + worker dormant |
| 12 | "**Real-time Earth clouds** via NASA GIBS WMS" | 17 | ❌ **Absent from UI** | `cloudDataPipeline.ts` dormant |
| 13 | "**Interplanetary route planner** … multi-gravity-assist" | 18 | ⚠️ **Backend-only** | works via curl; no UI |
| 14 | "**Multi-agent mission planner** …" | 19 | ⚠️ **Backend-only** | `/mission/capabilities` lists 5 agents; no UI |
| 15 | "**Strict type checking is now active on every source file**" | 24 | ❌ **Misleading** | 0 `@ts-nocheck` ✅, but `npm run typecheck` **exits 2 with 280 errors**, and no gate runs it |
| 16 | "two workerized paths: satellite propagation and solar-system model" | 26 | ⚠️ **Half** | model worker ✅ active; satellite worker **dormant** |
| 17 | Project structure lists `src/workers/asteroidWorker.ts` | 156 | ❌ **File does not exist** | `ls src/workers/` |
| 18 | "switch simulation engines **in the UI dropdown**" / "click **Connect**" | 53, 69 | ❌ **No such UI** | `grep -c "engine\|Connect" index.html` → 0 |
| 19 | "backend … `--port 8042`" and all `curl` examples on 8042 | 66-88 | ✅ consistent, but **hard-coded** | `main.ts:150 DEFAULT_BACKEND_PORT = 8042`, no env override (F-21) |
| 20 | "WebSocket accepts `fps`, `stream_hz` query params" | 74-75 | ✅ **True** (backend) | but no UI ever opens a WebSocket |
| 21 | "backend/tests/ — **14 pytest modules**" | 176 | ❌ **Stale** | 22 test modules, 143 tests |
| 22 | "`solar_physics.py` — Solar corona physics model (**v3**)" | 167 | ❌ **Stale** | code reports `quasi_mhd_corona_v4` |
| 23 | "Browser planetary positions use JPL's fitted approximate-element model … **visualization-grade approximations, not osculating initial conditions**" | ~250 | ✅ **True and commendably honest** | Confirmed exactly (§7.1) |
| 24 | "REBOUND starts at JD 2451545.0 **TDB** … exact DE440 GM ratios … recentered to barycentre" | ~255 | ✅ **True** | `/health` + `force_models.initial_conditions` corroborate |
| 25 | "REBOUND JDs are TDB, declared `jd_time_scale: \"TDB\"`" | ~262 | ✅ **True** | observed in every `state_update` |
| 26 | "Moon element frames normalized into an **ecliptic approximation**" | ~268 | ✅ **True**, and the approximation is worse than implied | §7.2 |
| 27 | "Kepler solver **clamps eccentricity at 0.9999999**, preventing hyperbolic propagation" | ~300 | ✅ **True & disclosed** | `orbitMath.ts:85,102` — but `solveKeplerFast` has **no clamp** (F-27) |
| 28 | "Frontend propagation is Keplerian two-body, **not a full N-body integrator**" | ~292 | ✅ **True and honest** | |
| 29 | "REBOUND remains a **reduced Newtonian model, not a replacement for DE441**" | ~295 | ✅ **True and honest** | |
| 30 | "Transfer arcs are **smooth visual curves, not numerically integrated** finite-burn" | ~305 | ✅ **True and honest** | |
| 31 | Data-source table (moons/JPL, Mars/USGS-MOLA, Milky Way/2MASS, asteroids/SBDB, clouds/GIBS, TLE/CelesTrak, AIA/Helioviewer, SWPC+SILSO) | ~330 | ⚠️ **Sources named, licences absent** | No LICENSE file; `src/assets/textures` unmanifested (F-05) |
| 32 | "Solar activity data — **NOAA SWPC**" | ~345 | ❌ **Dead upstream** | Both documented SWPC URLs return **HTTP 404** (F-18) |
| 33 | `npm run update:moons` refreshes moon data | ~315 | ⚠️ **Works but not reproducible** | Regenerates **460** records vs 424 committed (F-17) |
| 34 | `python scripts/fetch_jpl_nbody_ephemeris.py --check` verifies states vs live Horizons | ~322 | ✅ script exists, `--help` OK | Not exercised end-to-end (§13) |
| 35 | `npm run ingest:moon-textures` | ~318 | ❌ **Broken** | `ERR_MODULE_NOT_FOUND` (F-19) |

**Summary:** of 35 sampled claims — **13 fully true**, **9 partly true / backend-only**, **9 false or absent**,
**4 stale**. Notably, the *"Physics Notes and Limitations"* and *"Data Model"* sections (rows 23-30) are
**accurate and admirably candid**; the *Highlights* and *Features* sections are where the drift lives.

---

## 5. Validation matrix — every command run

| # | Command | Environment | Result | Status |
|---|---|---|---|---|
| 1 | `git rev-parse HEAD` | worktree | `ec7ad33…` | ✅ |
| 2 | `npm ci` | Node 22.22.1 | clean | ✅ PASSED |
| 3 | `npm ls --all` | | 160 lines, only optional-binary unmets | ✅ PASSED |
| 4 | `npm run typecheck` | tsc 5.9.3 strict | **280 errors, exit 2** | ❌ FAILED |
| 5 | `npx vite build --outDir <tmp>` | vite 7.3.1 | 39 modules, 890.48 kB | ✅ PASSED |
| 6 | `npx vite build --sourcemap` → parse `.map` | | **33/72 src files reachable** | ✅ PASSED |
| 7 | `npm test` | vitest 3.2.4 | **100 passed / 6 files** | ✅ PASSED |
| 8 | `npx vitest run --coverage` | v8 | `src/sim` **39.6 %**; `solarSystemModel.ts` **0 %** | ⚠️ PASSED w/ gaps |
| 9 | `npm audit` | | 8 vulns (1 crit, 5 high) dev-only | ❌ FAILED |
| 10 | `pip install -r backend/requirements.txt` | py3.12 | ok; **`httpx` undeclared** | ⚠️ |
| 11 | `pytest -q` | backend | **143 passed** / 51 s | ✅ PASSED |
| 12 | `pytest --cov` | backend | TOTAL 74 %; `server.py` **56 %**; `radiation_pressure.py` **0 %** | ⚠️ |
| 13 | `python -m compileall backend scripts` | | exit 0 | ✅ PASSED |
| 14 | `uvicorn server:app` + 18 endpoint probes | live :8055 | see §10 | ✅ PASSED |
| 15 | WebSocket `/ws/sim` invariants | live | units ✅, idempotence ✅, closure ✅, engine labelling ✅ | ✅ PASSED |
| 16 | **Live JPL Horizons fetch**, 9 planets × 6 epochs | network | 54 records | ✅ PASSED |
| 17 | Frontend model vs Horizons (esbuild→Node harness) | | §7.1 error table | ✅ PASSED |
| 18 | Independent Standish reimplementation vs Horizons | | reproduces app to 4 s.f. | ✅ PASSED |
| 19 | Moon/Galilean/Saturnian vs Horizons, 5 epochs | network | §7.2 — **F-01** | ❌ FAILED |
| 20 | Lambert closure via independent universal-variable propagator, 13 cases | | 0.13–93 km closure | ✅ PASSED |
| 21 | Lambert vs textbook Hohmann Δv | | 2.9461 vs 2.943 km/s (0.1 %) | ✅ PASSED |
| 22 | ACBF binary parse + fnv1a32 + sha256 + round-trip | | **all match** | ✅ PASSED |
| 23 | `/trajectory/plan` fan-out instrumentation | | **1,499 ephemeris samples** | ❌ FAILED |
| 24 | Threadpool/concurrency probe (45 concurrent) | live | server stayed responsive (cache hit) | ✅ PASSED |
| 25 | Path-traversal on `/benchmark/accuracy/report` (4 payloads) | live | all contained, HTTP 400 | ✅ PASSED |
| 26 | WebSocket forged `Origin: https://evil.example.com` | live | **ACCEPTED** | ❌ FAILED |
| 27 | Playwright load + 30 s frame sampling + screenshots | SwiftShader | loads, 0 page errors | ⚠️ see §9 |
| 28 | 2-minute heap sampling | | **flat 35.6 MB** | ✅ PASSED |
| 29 | Degraded modes: catalog-blocked / backend-blocked / reduced-motion | | silent fallback, no UI signal | ❌ FAILED |
| 30 | Run all 9 `.mjs`/`.js` + 6 `.py` scripts | | 4 broken, 1 unsafe | ❌ FAILED |
| 31 | Regenerate `moons.json` → compare | network | **460 vs 424** | ⚠️ |
| 32 | `npm run verify:moon-frames` / `verify:planet-positions` | | both pass | ✅ PASSED |
| 33 | `solveKeplerFast` divergence sweep | | diverges e≥0.99; shipped max e 0.9164 | ⚠️ latent |
| 34 | KBO propagation CPU benchmark (Node) | | **1.06 ms / frame** for 5,000 | ⚠️ |
| 35 | SWPC endpoint liveness | network | **404 ×2** | ❌ FAILED |

---

## 6. Severity-ranked findings

### 6.1 HIGH

---

#### F-01 — Apsidal-precession double-count still present for all 424 moons (SF-1 fixed for planets only)

| | |
|---|---|
| **Severity** | High · **Confidence** High · **Category** Numerical correctness · **Status** ACTIVE (reachable) |
| **Evidence** | `src/sim/catalog.ts:365-379` `resolveMoonSecularRates()` returns only `argPeriapsisDegPerCentury` + `ascendingNodeDegPerCentury`, never `meanLongitudeDegPerCentury`. Therefore `src/sim/orbitMath.ts:132-136` takes the **legacy branch**: `meanMotionRadPerDay = TWO_PI / periodDays` while lines 115-120 *separately* precess Ω and ω. |
| **Root cause** | Commit `68aff6b` ("Stop double-counting apsidal precession in planet propagation (SF-1)") introduced the `meanLongitudeDegPerCentury` gate and applied it to planets. The moon builder was never updated. `periodDays` for the Moon is the **sidereal** period (27.322 d), i.e. dL/dt — using it as dM/dt while ϖ = Ω+ω advances at 4067.5 °/cy double-counts the apsidal rate exactly. |
| **Verified** | 0 of 424 moons carry a mean-longitude rate (421 carry the other two). |

**Reproduction** — Moon vs live JPL Horizons (`301` relative to `500@399`, ecliptic ICRF):

| Epoch | **A: as shipped** | **B: + SF-1 gate** | Improvement |
|---|---:|---:|---:|
| J2000 (element epoch) | 4,432 km | 4,432 km | — |
| +1 yr | **266,688 km** | 6,728 km | **40×** |
| +5 yr | **745,623 km** | 6,071 km | **123×** |
| today (2026-09-07) | **167,457 km** | 1,839 km | **91×** |
| +50 yr | **716,164 km** | 5,558 km | **129×** |

The Moon's orbital radius is 384,400 km — **at +5 yr the error is 1.94× the orbit radius**, i.e. the Moon is
rendered on an essentially arbitrary side of the Earth.

**Expected vs actual:** a mean-element lunar model should hold a few thousand km over decades (variant B does).
Actual: up to 745,623 km.

**⚠️ The fix must be per-ephemeris, not global.** I tested the same gate on other moons:

| Moon | Ephemeris | shipped (today) | with gate (today) | verdict |
|---|---|---:|---:|---|
| Moon | DE405/LE405 | 167,457 km | **1,839 km** | gate **helps** (91×) |
| Ganymede | JUP365 | 29,861 km | 1,209,342 km | gate **harms** (40× worse) |
| Callisto | JUP365 | 9,429 km | 573,261 km | gate **harms** (61×) |
| Triton | NEP097 | 127,767 km | 249,039 km | gate **harms** (2×) |
| Io | JUP365 | 141,867 km | 839,912 km | both bad — separate defect |
| Europa | JUP365 | 897,338 km | 1,336,794 km | both bad — separate defect |

The JPL satellite tables publish **anomalistic** periods for the `JUP*`/`NEP*` sets (where the current code is
correct) and a **sidereal** period for `DE405/LE405`. `moons.json` already records the discriminator in its
`ephemeris` field (16 distinct values across 424 moons).

**Minimal remediation:** in `resolveMoonSecularRates`, emit
`meanLongitudeDegPerCentury = 360 / periodDays * 36525` **only** for records whose `ephemeris` publishes a
sidereal period (`DE405/LE405` today). Drive the decision from an explicit per-ephemeris table with a
comment citing the JPL source for each, and **fail closed** (legacy path) for unknown ephemerides.

**Acceptance test:** extend the moon fixture to ≥4 epochs spanning ≥50 yr and assert Moon error < 15,000 km
at every epoch, with no regression > 10 % for any JUP/SAT/URA/NEP moon. This test fails today.

**Effort:** ~0.5 day for the Moon; 2-3 days to classify all 16 ephemerides properly.

---

#### F-02 — The moon-frame gate structurally cannot detect F-01 (single epoch + 200 %-of-orbit tolerance)

| | |
|---|---|
| **Severity** | High · **Confidence** High · **Category** Test validity · **Status** ACTIVE |
| **Evidence** | `scripts/fixtures/moon-frames-j2000-horizons.json` — `_epoch: "JD 2451545.0 TDB"`, a **single** epoch, 20 moons. `src/sim/moonFrameCheck.ts:31-41`: `DEFAULT_POSITION_TOL = 0.15`, with `POSITION_TOL_OVERRIDE = { Titan: 2.0, Iapetus: 2.0, Phoebe: 2.0, Cordelia: 2.0, … }`. |

Two independent blindnesses compound:

1. **Single-epoch validation.** Every mean-element model matches at its own element epoch by construction.
   F-01 produces ~0 error at J2000 and 745,623 km at +5 yr — the fixture samples only the one epoch where the
   bug is invisible. (This is precisely the failure mode the *planet* gate was designed to avoid — see §8.4,
   where `planetPositionCheck.ts` uses **six** epochs spanning 1900-2100 **plus a secular-drift budget**.
   The moon gate did not inherit that design.)
2. **A tolerance of 2.0 = 200 % of orbit radius.** I measured Titan at **2,392,364 km** from Horizons *at
   J2000*, against an orbital radius of 1,221,870 km (ratio ≈ 1.96). It passes because the limit is 2.0.
   A position tolerance that permits ~2× the orbit radius cannot fail on anything except a gross radial error.

`npm run verify:moon-frames` → `moon-frame check passed: 20 moons within tolerance.` and 21 vitest cases pass —
while Titan and Rhea (1,033,977 km vs 527,000 km orbital radius) are both roughly *twice their orbit radius* out
of place.

**In fairness:** the code comments are explicit that these pins exist to tolerate "a known element-set defect
in `src/data/moons.json` (correct orbit plane, wrong phase)", and the companion `planeTolDeg` check *is* a
sound, phase-immune frame test. The defect is that the position tolerance is presented as a gate while
asserting nothing, and that the "tracked separately" defect has no tracking artifact I could find.

**Also (Low, bundled here):** the comment at `moonFrameCheck.ts:64-67` justifies Cordelia's wide pin by stating
*"propagateKeplerOrbit models no node precession at all (orbitMath.ts never reads nodePrecessionYears)"*.
That is **false** — `catalog.ts` converts `nodePrecessionYears` into `ascendingNodeDegPerCentury` (Cordelia
gets −60000 °/cy) and `orbitMath.ts:116` applies it. A wide tolerance justified by a false premise.

**Remediation:** add ≥4 epochs to the fixture; replace the 2.0 pins with a documented per-moon *expected*
error plus a regression band; file the element-set defect explicitly. **Effort:** 1-2 days.

---

#### F-03 — One `/trajectory/plan` request issues 1,499 outbound JPL requests, with no timeout and an unbounded cache

| | |
|---|---|
| **Severity** | High · **Confidence** High · **Category** Security / availability · **Status** ACTIVE (backend-only) |
| **Evidence** | `backend/server.py:1103` `def trajectory_plan(...)` and `:1138` `def trajectory_lambert(...)` — plain `def`, **no `_run_with_timeout` wrapper**, unlike `/trajectory/porkchop` (`:1187`), `/mission/plan` (`:1250`), `/solar/physics` (`:1028`) and the AIA tile (`:932`) which all pass `timeout_seconds=`. Default `ephemeris_provider="auto"` → `backend/mission/ephemeris_service.py:143-146` chain `["spice","horizons","kepler"]`; SPICE is absent, so **every** sample goes to `urllib.request.urlopen("https://ssd.jpl.nasa.gov/api/horizons.api?…", timeout=10.0)` (`:219-221`). Cache at `:91` is a bare `Dict` with **no eviction and no TTL**. |

**Measured fan-out** (instrumented `EphemerisService._sample_kepler`):

| `max_assists` | ephemeris samples | local compute |
|---|---:|---:|
| 0 | 17 | 0.00 s |
| 1 | 382 | 0.11 s |
| 2 | **1,499** | 0.48 s |
| 3 | **1,499** | 0.50 s |

**Reproduction:**
```bash
# hangs; observed http=000 after 240 s, twice out of two attempts
curl -m 240 -X POST localhost:8042/trajectory/plan -H 'Content-Type: application/json' \
  -d '{"from_id":"earth","to_id":"jupiter","departure_jd":2461025.5,"max_assists":2}'
# identical request, local provider: 0.47 s, HTTP 200
curl -X POST localhost:8042/trajectory/plan -H 'Content-Type: application/json' \
  -d '{"from_id":"earth","to_id":"jupiter","departure_jd":2461025.5,"max_assists":2,"ephemeris_provider":"kepler"}'
```

The compute is trivial (0.48 s); **100 % of the latency is third-party network fan-out**. Three consequences:

- **Amplification:** ~1,500× — one unauthenticated HTTP request → 1,500 HTTPS requests to a NASA/JPL
  government API. This will get the deployer's IP throttled or blocked, and is abusive to JPL.
- **Availability:** the handler is a sync `def`, so it occupies a thread from FastAPI's bounded anyio
  threadpool (default 40) for its whole lifetime. ~40 concurrent calls with a cold cache exhaust it.
  *(I attempted this with 45 concurrent requests and the server stayed responsive — my earlier bulk fetches
  had already warmed the cache for that exact key. The threadpool arithmetic stands on the code; the
  end-to-end exhaustion is marked **NOT PROVEN** in §13.)*
- **Memory:** the cache never evicts. Distinct `departure_jd` values grow it without bound.

**Remediation (all four):** (a) wrap both handlers in the same timeout helper the sibling endpoints use;
(b) default `ephemeris_provider` to `"kepler"` and make `"horizons"` opt-in; (c) bound the cache
(`functools.lru_cache` or an LRU dict with TTL); (d) add a per-request outbound-fetch budget that fails
fast with HTTP 503 when exceeded. **Acceptance:** `/trajectory/plan` with `max_assists=3` returns ≤5 s or
HTTP 504, and issues ≤N outbound requests where N is asserted by a test. **Effort:** 1 day.

---

#### F-04 — Real JPL catalog silently replaced by synthetic asteroids, including on a 2-second load budget

| | |
|---|---|
| **Severity** | High · **Confidence** High · **Category** Data integrity / scientific honesty · **Status** ACTIVE |
| **Evidence** | `src/sim/phase1AsteroidCatalog.ts:119` `PHASE1_LOAD_LATENCY_BUDGET_MS = 2_000`; `:486-493` `buildLatencyAcceptance` sets `passed: loadMs <= budgetMs`. `src/main.ts:474-486`: if **any** acceptance gate fails → `console.warn(...); return;` — leaving the procedural belt from `main.ts:417` in place. `main.ts:511` catch → `console.warn('[phase-1] Using procedural fallback for asteroid belt:', error)`. |

**A wall-clock performance budget is wired as a data-acceptance gate**, alongside genuine integrity gates
(version, row count, taxonomy, checksum). A slow network, a cold cache, a busy CPU or a loaded GPU therefore
causes the app to **discard verified-authentic JPL data and substitute procedurally generated asteroids**.

**Observed in a routine Playwright run** (no fault injection):
```
[phase-1] Acceptance gates failed: loadMs=3768.3 exceeded budgetMs=2000
```

And with the catalog fetch blocked:
```
[catalog-blocked] {"bodies":"Bodies: 55,010", "err":false, "bannerText":null}
[phase-1] Using procedural fallback for asteroid belt: TypeError: Failed to fetch
```

`Bodies: 55,010` is **identical** in both cases. There is **no DOM element, banner, badge, colour change or
status text** distinguishing real catalog data from synthetic — the only signal is a `console.warn` no user
will read. A viewer cannot tell whether they are looking at 50,000 real asteroids or 50,000 invented ones.

**Remediation:** (a) demote latency from an *acceptance* gate to a telemetry field — never let slowness
invalidate authentic data; (b) surface provenance in the UI (`Asteroids: 50,000 (JPL SBDB catalog)` vs
`(procedural — catalog unavailable)`); (c) retry with backoff before falling back.
**Acceptance:** a test that stalls the fetch 5 s still accepts the catalog; a DOM assertion proves the
provenance label switches. **Effort:** 0.5 day.

---

#### F-05 — No repository licence, an unmanifested 39 MB texture tree, and one unresolved redistribution licence

| | |
|---|---|
| **Severity** | High · **Confidence** High · **Category** Legal / provenance · **Status** ACTIVE |
| **Evidence** | `ls LICENSE* COPYING*` → *No such file or directory*. `ls src/assets/textures/*.json *.md LICENSE*` → none; the directory holds **25 files, 39 MB**. `public/textures/moons/moon_texture_attribution.json` entry `mars:deimos` → `"license": "Unspecified by provider; verify for redistribution"`, provider `Solarviews`. |

Three compounding problems:

1. **No LICENSE.** Under default copyright the work is all-rights-reserved: nobody may legally fork, reuse
   or redistribute it, and the README's open-source-style contribution framing is unbacked.
2. **`src/assets/textures/` has no manifest at all** — no source URL, retrieval date, licence or checksum for
   9.2 MB of LROC lunar albedo, 7.9 MB of MOLA relief, 4.4 MB of 2MASS all-sky, or the Earth/planet maps.
   Filenames imply NASA/USGS/2MASS (mostly public domain) — but the README also credits *"Solar System Scope
   texture pack"* (CC BY 4.0, **attribution required**) and *"three.js planetary texture set"*. Without a
   manifest nobody can tell which file came from which, so the attribution obligations cannot be discharged.
3. **One texture is knowingly unresolved.** The Deimos map is redistributed in-repo with its own metadata
   recording that its licence is unknown.

**The contrast is instructive:** `moon_texture_attribution.json` is *excellent* — per-file provider, dataset,
product page, credit, licence, `sha256` and download URL for all 9 moon textures (8 are USGS public domain).
The remedy is to apply that same discipline to `src/assets/textures/`.

**Remediation:** add a LICENSE; add `src/assets/textures/ATTRIBUTION.json` in the moon-texture format;
replace or remove the Deimos texture. **Acceptance:** a CI check that fails when any file under
`src/assets/**` or `public/textures/**` lacks a manifest entry. **Effort:** 1 day + legal review.

---

#### F-06 — The accuracy benchmark validates nothing, yet reports `meanAbsErrorKmS: 0.0` and `tier: "strict"`

| | |
|---|---|
| **Severity** | High · **Confidence** High · **Category** Scientific validity · **Status** ACTIVE (backend-only) |
| **Evidence** | `GET /benchmark/accuracy` (captured live): `scenarioCount 3, comparableScenarioCount 0, incomparableCount 3, solvedCount 0, passCount 0, failedCount 0, passRate 0.0, validationCoverage 0.0, meanAbsErrorKmS 0.0`; every row `status: "incomparable_reference"`, `comparisonContract.comparableToSolver: false`. |

**What is genuinely good here.** The `comparison_contract` block is *honest*: it states plainly that the
legacy window-level captures "do not record endpoint states, branch/path selection, or revolution count
needed to compare against direct fixed-state Lambert results." That is a principled refusal to compare
incomparable quantities, and it is a real improvement over the earlier behaviour (0/3 passing at
MAE ≈ 22.824 km/s), which compared them anyway and produced a meaningless number.

**What is wrong.**

1. **`meanAbsErrorKmS: 0.0` with zero comparisons.** A dashboard, a README badge or a reader skimming
   JSON will read 0.0 km/s as a *perfect* result. With `comparableScenarioCount == 0` this field must be
   `null`, not `0.0`. Same for `passRate: 0.0`.
2. **The label survived the downgrade.** `source: "strict-gmat-orekit-tudat"` and
   `calibrationTier: "strict"` remain on data that validates nothing.
3. **The provenance is not reproducible.** Each artifact is a **single-row CSV** carrying exactly the same
   eight fields as the JSON — not tool output. There are **no GMAT scripts, no Orekit configuration, no SPICE
   kernels, no frames, no time scales, no solver settings, no logs, and no regeneration script** anywhere in
   the tree (`grep -rln "gmat\|orekit"` matches only `accuracy.py` and its test). A third party cannot
   re-derive these numbers. `"tool_version": "1.0"` for Tudat does not correspond to any TudatPy release
   (which are 0.6.x–0.8.x).
4. **`accuracy.py` never parses the CSVs.** It computes `_sha256(artifact_path)` (`:22-24, :74`) and reads
   the Δv from the **JSON**. The CSV is decorative; the checksum proves only that a file did not change.
   *(I cross-checked anyway: all 9 sha256 match, all 9 CSV Δv equal the JSON Δv, and all 3 consensus means
   recompute exactly. Integrity is fine — it is provenance that is missing.)*
5. **The test enshrines zero coverage.** `backend/tests/test_benchmark_accuracy.py:23`
   `assert summary["validationCoverage"] == pytest.approx(0.0)`. The only pass/fail test
   (`:85-108`) monkey-patches `solve_direct_lambert` with `fake_solve_direct_lambert` and rewrites the
   scenarios — it exercises the **plumbing**, never the real solver against a real reference.

**Remediation:** (a) emit `null` (not 0.0) for `meanAbsErrorKmS`/`passRate` when nothing is comparable, and
surface `validationCoverage` first; (b) drop "strict" until something is validated; (c) either commit
re-runnable GMAT/Orekit inputs + kernels, or relabel the tier `unverified-vendor-capture`; (d) add ≥1
genuinely comparable fixed-state scenario with endpoint states so `validationCoverage > 0`.
**Acceptance:** `validationCoverage ≥ 0.8` with real (non-monkeypatched) solver runs. **Effort:** 3-5 days.

---

#### F-07 — WebSocket accepts any Origin; unauthenticated, uncapped, spawns a REBOUND simulation per connection

| | |
|---|---|
| **Severity** | High · **Confidence** High · **Category** Security · **Status** ACTIVE (backend-only) |
| **Evidence** | `grep -n "origin\|Origin" backend/server.py` → only the CORS allowlist at `:115`. The `@app.websocket("/ws/sim")` handler at `:1665` performs **no Origin check**. CORS does not apply to WebSockets. |

**Reproduction (OBSERVED):**
```python
websockets.connect("ws://127.0.0.1:8042/ws/sim",
                   additional_headers={"Origin": "https://evil.example.com"})
# → ACCEPTED: {"type":"connected", "engine":"rebound", ...}
```

Any web page a developer visits while the backend runs can open `/ws/sim` against `localhost:8042`, and each
connection allocates a REBOUND `Simulation` with 41 bodies on its own thread. There is no authentication, no
per-origin limit and no visible connection cap. Combined with the documented
`uvicorn … --host 0.0.0.0 --port 8042 --reload` run command (README:66), this is reachable from the whole LAN.

**Remediation:** validate `websocket.headers["origin"]` against `SOLAR_CORS_ALLOWED_ORIGINS` and close with
1008 on mismatch; cap concurrent connections per client. **Acceptance:** a test asserting a forged Origin is
rejected. **Effort:** 2 hours.

---

#### F-08 — README advertises a product the shipped bundle is not

| | |
|---|---|
| **Severity** | High · **Confidence** High · **Category** Documentation integrity · **Status** ACTIVE |
| **Evidence** | §4 matrix — 9 of 35 sampled claims are false or absent. |

The most consequential: `index.html` is titled **"Sun Model Lab"** with the subtitle *"Isolated sun model with
barebones solar system context"* and its own eyebrow text *"Sun-Focus Branch"* — the file is honest about what
it is. `README.md:3` calls the same artifact *"a real-time 3D solar system simulator and mission-design
workbench"* and then documents an engine dropdown, a Connect button, a satellite layer, nearby-system
navigation, a trajectory planner UI, real-time clouds, a Milky Way band, an Oort cloud, a 1.9M-particle
pipeline and a `src/workers/asteroidWorker.ts` — **none of which exist in the shipped UI**, and one of which
is not a file.

This matters beyond tidiness: a user or reviewer who trusts the README will believe they are looking at
REBOUND N-body output when they are looking at in-browser two-body Kepler propagation.

**Remediation:** retitle the README to match `index.html`; move every backend-only capability under an
explicit *"Backend API (no UI)"* heading; delete claims for dormant modules or mark them
*"prototype — not wired"*. **Acceptance:** a doc test asserting every README-claimed UI control exists in
`index.html`. **Effort:** 0.5 day.

### 6.2 MEDIUM

---

#### F-09 — Frontend feeds a UTC Julian Date into a model JPL defines in TDB (costs Mercury 13× accuracy)

**Confidence** High · **ACTIVE** · `src/constants.ts:38-41`

```ts
export function currentJulianDate(): number { return julianDateFromUnixMs(Date.now()); }
//  = Date.now()/86400000 + 2440587.5   ← a UTC-based JD
```
JPL states the approximate-element recipe takes `T_eph`, *"equivalent to the post-2006 IAU Barycentric
Dynamical Timescale, JDTDB"*. TT−UTC is currently **69.184 s** (TAI−UTC 37 s + 32.184 s), TDB≈TT.
`src/workers/modelWorkerContract.ts:34` acknowledges this — *"no UTC/TT/TDB conversion is performed at this
browser-only boundary"* — but the disclosure lives in a worker comment, not the README.

**Measured effect of applying the correction** (vs live Horizons, epoch today):

| Body | as shipped (UTC) | TDB-corrected | change |
|---|---:|---:|---:|
| **Mercury** | 2,990 km | **229 km** | **−2,760 km (13× better)** |
| Venus | 3,330 km | 1,897 km | −1,432 km |
| Mars | 34,767 km | 34,121 km | −646 km |
| Earth | 8,075 km | 9,017 km | +943 km (within its own budget) |

For Mercury the time-scale error (3,155 km of along-track motion in 69.184 s) is comparable to the model's
entire error, and dominates it. **Remediation:** add a ΔT table (or a constant with a documented review date)
and convert UTC→TDB before propagation; state the convention in the README. **Effort:** 0.5 day.

---

#### F-10 — Pluto carries no secular rates at all (1.5–4.4× worse than the same JPL table allows)

**Confidence** High · **ACTIVE** · `src/data/planets.ts:269-278`

Pluto's `orbit` block has **no `secularRates` key**, so every element is frozen at J2000 and M advances at
`2π/90560 d`. All eight other planets carry the full six-rate set.

| Epoch | shipped | with tabulated `Ldot=145.2078` | ratio |
|---|---:|---:|---:|
| J2000 | 1,359,996 km | 1,359,996 km | 1.00 |
| 1850 | 1,554,449 km | 352,499 km | **4.41×** |
| 2050 | 1,129,062 km | 285,975 km | **3.95×** |
| 2100 | 1,903,355 km | 1,006,395 km | 1.89× |

Pluto also comes from JPL's 3000 BC–3000 AD table, which **requires** additional b/c/s/f correction terms for
Jupiter–Pluto; `grep` finds no such terms anywhere. **Remediation:** add Pluto's six rates; either implement
the extra terms or document the resulting envelope. **Effort:** 2 hours (rates) / 1 day (extra terms).

---

#### F-11 — 5,000 KBO positions recomputed and re-uploaded every frame, even while paused

**Confidence** High · **ACTIVE** · `src/main.ts:1132-1137`

```ts
propagateKBOPositions(kuiperPop.kbos, simState.julianDate, kuiperPositions);
kuiperBeltRenderer.updatePositions(kuiperPositions);
if (kuiperPop.binaryCount > 0) { propagateBinaryKBOPositions(...); ... }
```
Unconditional — no dirty check against `simState.julianDate`, so a paused simulation still performs the full
Kepler solve and GPU buffer upload every frame.

**Measured (Node, CPU only, hardware-independent):** `propagateKBOPositions(5,000)` = **1.06 ms/call** →
**6.3 % of a 60 FPS frame budget**, plus a 60 kB `Float32Array` upload. **Remediation:** skip when the epoch
is unchanged; gate `instanceMatrix.needsUpdate`. **Effort:** 2 hours.

*Related (Low):* `main.ts:1150-1157` allocates two `Vector3`s and a `Matrix4.clone()` per quadtree mesh per
frame. Heap sampling showed **no growth** (flat 35.6 MB over 2 min), so this is GC churn, not a leak.

---

#### F-12 — Speculative AGN/H29 warp state writes into the orbital model with a 1×10¹² exaggeration factor

**Confidence** High · **ACTIVE (user-triggered)** · `src/main.ts:729-742` → `src/sim/solarSystemModel.ts:161-194`

```ts
function updateModelLocally(deltaSeconds) {
  model.update(simState.julianDate);
  const warpState = sunCtrl.getWarpState();
  if (warpState && warpState.direction && deltaSeconds > 0) {
    const peakData = metricFrameDragPeak(...);
    model.applyMetricKinematics(warpState.direction, deltaSeconds,
                                (d) => evaluateLocalMetricShift(d, peakData),
                                warpState.sourceDistanceCm, 1e12);   // ← visualExaggeration
  }
}
```
`applyMetricKinematics` mutates `state.worldPosition` for **every body** by
`direction * localBeta * c * dt * 1e12`.

**The good news:** the four `superluminal-modeling/*` modules are themselves **pure** — they export functions
and write no shared state (verified by grep). And because `model.update()` recomputes `worldPosition` from
elements each frame, the displacement is **transient, not cumulative**.

**The problem:** while a warp is active, `model.getState(id).worldPosition` returns non-physical positions,
and `syncAsteroidBeltInputs()` (`main.ts:448-466`, called *after* `updateModelState`) feeds exactly those
positions to the asteroid belt's Jupiter/Saturn perturbation model. So a speculative-metric visual effect
propagates into the asteroid dynamics inputs and into the `#body-info` readout, with **nothing in the UI
marking the displayed state as non-physical**.

**Remediation:** write the displacement to a separate render-only offset rather than `state.worldPosition`;
or read perturber positions from a pristine snapshot; and show a persistent "SPECULATIVE MODE" badge whenever
`warpState` is non-null. **Effort:** 0.5 day.

---

#### F-13 — Solar visuals run on the wall clock, decoupled from the simulation epoch

**Confidence** High · **ACTIVE** · `src/main.ts:1139-1145` (self-documented)

```
// Solar visuals run on the WALL clock, not the simulation epoch. Feeding the
// epoch (~8.4e8 s) into sunController's `uniform float time` freezes every
// procedural effect: float32 ULP at that magnitude is 64 s, so a 1 s advance
// does not change the uniform. main's 56930fb paired this with a rate-bounded
// visual clock in sunVisuals.ts, which this tree does not carry.
```
`sunCtrl.update(simState.julianDate, timestamp * 0.001)`. The float32 shader-uniform reasoning is correct, but
the consequence is that **time warp, reverse time and jump-to-date do not affect the Sun's appearance**: at
120 days/sec the planets race while granulation, flares and the corona evolve in real time. The comment states
the mitigation from `main` (a rate-bounded visual clock) *"this tree does not carry"* — i.e. a known,
unported regression. **Remediation:** port the rate-bounded visual clock. **Effort:** 0.5 day.

---

#### F-14 — 280 type errors, 199 of them in shipped code, and no gate anywhere runs the type checker

**Confidence** High · **ACTIVE**

| File | Errors | Reachable? |
|---|---:|---|
| `superluminal-modeling/smbhPropagation.ts` | 81 | **YES** |
| `superluminal-modeling/agnShockwaveEngine.ts` | 52 | **YES** |
| `src/main.ts` | 52 | **YES** |
| `sunController.ts` | 14 | **YES** |
| `rendering/milkyWay.ts` | 40 | dormant |
| `features/trajectory/localPlanner.ts` | 30 | dormant |
| `rendering/lodManager.ts` | 11 | dormant |
| **Total** | **280** | **199 reachable / 81 dormant** |

Codes: `TS7006` implicit-any ×165, `TS2339` ×38, `TS7005` ×15, `TS2345` ×12, `TS18047` possibly-null ×12,
`TS7031` ×11, `TS2322` ×10, `TS7053` ×8. **Two-thirds of the reachable errors (133) sit in the two
speculative AGN modules.**

Compounding gates that do not exist (`ls -a` finds none): no `.github/`, no CI, no ESLint/Biome/Prettier, no
husky/pre-commit, no Makefile, no tox. And `"test": "vitest run"` — `npm test` **does not run**
`npm run typecheck`, so all 280 errors pass through every check the project has. `tsconfig.json` includes only
`src/**/*.ts` with `checkJs: false`, so the 8 `.mjs` scripts and 2 root `.js`/`.mjs` test harnesses are
**never checked at all**.

**Remediation:** add CI running `typecheck && test && build`; fix the 4 reachable files (start with
`main.ts`'s 52); extend `tsconfig` include or add a second config for scripts. **Effort:** 3-5 days.

---

#### F-15 — Frontend core propagation modules are at 0 % test coverage

**Confidence** High · **ACTIVE** · `npx vitest run --coverage`

| Module | Lines | Coverage |
|---|---:|---:|
| `src/sim/solarSystemModel.ts` | 241 | **0 %** |
| `src/sim/kuiperBelt.ts` | 516 | **0 %** |
| `src/sim/asteroidBelt.ts` | 255 | **0 %** |
| `src/sim/phase1AsteroidCatalog.ts` | 682 | **0 %** |
| `src/workers/modelWorker.ts` | 156 | **0 %** |
| `src/sim/asteroids/*` (4 files) | 596 | **0 %** |
| `src/main.ts` | 1,224 | not instrumented (never imported by a test) |
| — well covered — | | |
| `src/sim/catalog.ts` | | 94.7 % |
| `src/sim/orbitMath.ts` | | 91.2 % |
| `src/workers/modelWorkerContract.ts` | | 96.5 % |

`src/sim` aggregate **39.6 %**, `src/workers` **30.4 %**. The 100 passing tests concentrate on element
resolution and the worker contract; **the class that actually drives propagation and the parent→world
accumulation is entirely untested**, as is every belt generator and the catalog loader whose acceptance
gates cause F-04. Backend is healthier: TOTAL 74 % (inflated by 100 %-covered test files),
`server.py` **56 %**, `lambert.py` 86 %, `mga.py` 92 %, `rebound_nbody.py` 76 %,
`solar_realtime_data.py` **21 %**, `tudatpy_hooks.py` **31 %**, `radiation_pressure.py` **0 %**.
`@vitest/coverage-v8` is **not in `package.json`** — I had to install it, so coverage is not routinely run.

**Effort:** 3-5 days to bring the five 0 % modules to a meaningful level.

---

#### F-16 — Committed data cannot be reproduced against its mutable upstream

**Confidence** High · `npm run update:moons`

Regenerating the moon catalog produced **460 records** against the **424** committed — the JPL SSD satellite
table has grown since capture. `src/data/moons.json` records no retrieval date, no upstream snapshot id and
no row-count assertion; each record's `"reference"` field is `"n/a"`.

This is the **deterministic-algorithm vs reproducible-against-a-mutable-API** distinction: the builder is
deterministic, but the artifact is not reproducible. **The asteroid pipeline shows how to do it right** —
`asteroid_phase1_main_100000.meta.json` records `generated_utc`, the exact endpoint, the field list,
`sort: "-diameter"`, `limit`, the class/AU filters, `source_rows`, `stored_count`, and **two checksums**
(fnv1a32 + sha256), all of which I verified match.

**Remediation:** give `moons.json` a sidecar meta in the asteroid format; make `update:moons` refuse to
overwrite when the row count changes without `--accept-drift`. **Effort:** 0.5 day.

---

#### F-17 — Broken and unsafe scripts

**Confidence** High · `node <script> --help` for each

| Script | Result |
|---|---|
| `scripts/ingest-moon-textures.mjs` | ❌ `ERR_MODULE_NOT_FOUND` |
| `get_errors.mjs` | ❌ `ERR_MODULE_NOT_FOUND` (undeclared puppeteer) |
| `testRealisticScale.mjs` | ❌ `ERR_MODULE_NOT_FOUND` (undeclared puppeteer) |
| `testWarp.js` | ❌ `ERR_MODULE_NOT_FOUND` (undeclared puppeteer) |
| `scripts/update-moons-data.mjs` | ⚠️ **ignores `--help` and performs a live fetch + overwrites `src/data/moons.json`** |
| `verify-moon-frames.mjs`, `verify-planet-positions.mjs`, `dev-full.mjs`, `run-ui-dev.mjs` | ✅ |
| all 6 `scripts/*.py` | ✅ argparse `--help` |

`update-moons-data.mjs` mutating a tracked source file on `--help` is a real footgun — it silently modified my
worktree during this audit. **Remediation:** add puppeteer to `devDependencies` or delete the three dead root
harnesses; add argparse-style flag handling and a `--dry-run` default to `update-moons-data.mjs`.
**Effort:** 0.5 day.

---

#### F-18 — Documented NOAA SWPC data source is dead upstream (HTTP 404)

**Confidence** High · **ACTIVE**

Both URLs advertised by `GET /solar/capabilities` and README ("Data assimilation … using NOAA SWPC") return
**404**:
```
404  https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json
404  https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json
```
**The backend handles this correctly and honestly** — `GET /solar/realtime` reports
`source_status.swpc.ok = False`, the 404 text, and the endpoint that failed, while SILSO, SDO/AIA and GONG
all report `ok: True` with fresh timestamps. That per-source health reporting is genuinely good design.
The defect is that `/solar/capabilities` and the README still advertise SWPC as an active source.
**Remediation:** update the URLs (SWPC reorganised these paths) or drop the claim. **Effort:** 1 hour.

---

#### F-19 — Filesystem path disclosure across several endpoints

**Confidence** High · **ACTIVE (backend-only)**

`GET /health` → `engines.rebound.initial_conditions.path` returns the absolute server path.
`GET /benchmark/accuracy` → `referenceFile` likewise. `POST /benchmark/accuracy/report` with a traversal
payload returns:
```
{"detail":"`output_path` must resolve under `/…/wt/my-notes`"}
```
Low exploitability alone; useful for chaining. **Remediation:** return repo-relative paths.
**Effort:** 1 hour.

---

#### F-20 — Backend host/port hard-coded with no override; request/response casing inconsistent

**Confidence** High

`src/main.ts:149-150` `DEFAULT_BACKEND_HOST='localhost'`, `DEFAULT_BACKEND_PORT=8042`, with no
`import.meta.env` override — the backend URL cannot be configured at build or run time (dormant
`features/trajectory/index.ts:9` duplicates the same constant, so the drift is already latent).

Separately, `/trajectory/lambert` accepts **snake_case** (`from_id`, `departure_jd`; extras rejected via
Pydantic `extra_forbidden` — good strictness) but replies in **camelCase** (`tofDays`, `rootResidualDays`,
`deltaVDepartureKmS`). One endpoint, two conventions, no schema version field on REST responses (the
WebSocket does carry `protocol_version: 1`). **Effort:** 0.5 day.

---

#### F-21 — Asteroid rendering is a size-biased subsample presented as "the asteroid belt"

**Confidence** High · **ACTIVE** · `src/sim/asteroidBelt.ts:154-155`

```ts
for (const entry of deterministicAsteroids) { if (asteroids.length >= count) break; … }
```
takes the **first `count`** entries in file order, and the corpus is `sort: "-diameter"` (per its own meta).
With `main.ts:144 ASTEROID_BELT_TARGET_COUNT = 50_000` against 100,000 rows:

| Set | mean diameter | min diameter | mean a | mean i |
|---|---:|---:|---:|---:|
| first 50,000 (**rendered**) | 8.85 km | **4.66 km** | 2.9415 AU | 11.107° |
| full 100,000 (corpus) | 6.26 km | 2.80 km | 2.8574 AU | 10.562° |

So the rendered belt is the largest half, with a hard 4.66 km cutoff; mean semi-major axis shifts +0.084 AU
outward and mean inclination +0.55°. Fine for visualisation, **wrong for any population-statistics claim**.
**Remediation:** sample uniformly (or stratify by diameter) when subsetting, and label the selection rule in
the UI. **Effort:** 0.5 day.

---

#### F-22 — Dev-dependency vulnerabilities, including one critical

**Confidence** High · `npm audit`

| Package | Severity | Advisory |
|---|---|---|
| `vitest` <3.2.6 | **critical** | GHSA-5xrq-8626-4rwp — arbitrary file read/execute when the Vitest UI server listens |
| `vite` 7.0.0–7.3.3 | high | GHSA-4w7w-66w2-5vf9, GHSA-p9ff-h696-f583 (arbitrary file read via dev-server WebSocket), 3 more |
| `rollup`, `postcss`, `picomatch`, `nanoid` | high | path traversal / XSS / ReDoS / overflow |
| `fflate`, `esbuild` | moderate / low | |

**Fair assessment:** all are **dev-only** (`prod: 2` dependencies), so a deployed static bundle is unaffected.
They do matter for a developer running `npm run dev` on an untrusted network — the Vite dev-server file-read
advisories are directly applicable, and the README's `--host 0.0.0.0` guidance makes that plausible.
`npm audit fix` reportedly resolves all 8. **Effort:** 1 hour + regression run.

---

#### F-23 — `httpx` is required by the test suite but absent from `requirements.txt`

**Confidence** High. A clean `pip install -r backend/requirements.txt` then `pytest` fails at import;
`starlette.testclient` additionally warns that `httpx2` is now preferred. A new contributor following the
README cannot run the backend tests. **Remediation:** add `httpx` (or `httpx2`) to a
`requirements-dev.txt`. **Effort:** 15 minutes.

### 6.3 LOW

| ID | Finding | Evidence | Note |
|---|---|---|---|
| **F-24** | `solveKeplerFast` (6 fixed Newton iterations, **no eccentricity clamp**, seed `E=M`) diverges for high e: at e=0.99, M=0.1 it returns **E = −54.96 rad** vs true 0.8317. Used by `asteroidBelt.ts:228`, `kuiperBelt.ts:267,439`. | measured | **Latent only.** Max shipped e is 0.9164 (KBO) / 0.2313 (asteroid); worst error over *all* shipped eccentricities is **7.2×10⁻¹⁴ rad**. Becomes real if NEOs, Centaurs or comets are ever added. Add a clamp + convergence check. |
| **F-25** | `solveKepler` returns a bare number with **no convergence flag** (`orbitMath.ts:79-99`); a caller cannot distinguish converged from exhausted. | code | Add a status return. |
| **F-26** | ACBF stores `f32 epochJd`; float32 spacing near JD 2.45×10⁶ is **0.25 day** (≈377,600 km of main-belt motion). | measured | **Latent.** All 42 distinct epochs in the committed file are multiples of 0.5 d and therefore exact. Any future epoch off a 0.25-d boundary is silently snapped. Store an offset from J2000 instead. |
| **F-27** | `renderer.setPixelRatio()` is called unconditionally inside `resizeRenderer` (`main.ts:949`), *outside* the dimension guard at `:950`; three.js `setPixelRatio` internally calls `setSize`, reallocating the drawing buffer. | code | Only fires on the `resize` event, so impact is negligible. Guard it anyway. |
| **F-28** | `energy_error` resets to 0 on every seek (`rebound_nbody.py:357` re-baselines `_initial_energy`). | measured (0.0 after a +200 yr seek) | Cannot measure long-run drift; document it as per-segment. |
| **F-29** | `?engine=bogus_engine` is accepted and silently falls back to REBOUND. | measured | Disclosed via `engine_requested`, so not a correctness bug — but an unknown engine should be HTTP 4xx. |
| **F-30** | 18 tracked `.md` files contain absolute local paths (`/home/…`). 28 `.md`/`.tex` research documents sit at the repo root; 103 tracked `.md` vs 73 `.ts`. `sun_diff.diff` is 0 bytes. Two debug screenshots (545 kB) are committed. | measured | Repo hygiene; a reader can mistake a speculative design doc for a specification. |
| **F-31** | `index.html` has 12 `<label>`s but **0 `aria-*`, 0 `role=`, 0 `alt=`**; no `prefers-reduced-motion` handling (verified: a reduced-motion context changed nothing); `<canvas>` has no WebGL-unavailable fallback message. | measured | Keyboard/AT users and reduced-motion users are unsupported. |

### 6.4 REFUTED — hypotheses that the evidence does not support

The audit brief carried forward observations from a prior scan of commit `aa6e39a`. Several are no longer
true at HEAD, and reporting them as findings would be wrong. Each was tested, not assumed.

| # | Hypothesis | Verdict | Evidence |
|---|---|---|---|
| R-1 | *"`resizeRenderer`/`setPixelRatio` resets the drawing buffer every animation frame"* | **REFUTED** | `resizeRenderer` is bound only to `window.addEventListener('resize', …)` (`main.ts:956`) and called twice at startup. The `animate()` loop (`:1122-1176`) never calls it, and `setSize` is guarded by `if (dom.canvas.width !== w \|\| dom.canvas.height !== h)` (`:950`). |
| R-2 | *"Require a certified TOF residual before accepting a Lambert solution"* (implying none exists) | **REFUTED** | The solver already returns `rootResidualDays` (**1.19×10⁻⁶ d ≈ 0.10 s**), `computedTofDays`, `rootBracketed: true` and `transferAngleDeg`. A certified residual is present and tight. |
| R-3 | *"REBOUND native AU/year vs other paths exposing AU/day"* unit confusion | **REFUTED** | `rebound_nbody.py:237` sets `units=("yr","AU","Msun")` and converts on the boundary (`:274-276` `× DAYS_PER_YEAR`). Live check vs Horizons at J2000: Earth **30.285** vs 30.292 km/s, Jupiter **13.660** vs 13.676, Mercury **38.892** vs 38.882 — all within 0.12 %. Payload declares `velocity_units: "AU/day"`. Correct. |
| R-4 | *"Server silently mislabels the engine when TudatPy is absent"* | **REFUTED** | The `connected` frame carries **both** `engine: "rebound"` and `engine_requested: "tudatpy"`, plus `integrator`/`integrator_requested` and `fidelity`. Honest fallback disclosure. |
| R-5 | *"Path traversal on the server-side report write"* | **REFUTED** | All four payloads (`../../../../tmp/pwned.md`, `/tmp/abs_pwned.md`, `../../pwned2.md`) → **HTTP 400**, contained to `my-notes/`; nothing landed outside. `allow_overwrite` guard also works (commit `2b8a2c3` verified). |
| R-6 | *"Wildcard CORS with credentials"* | **REFUTED as a default** | Default is a 6-entry localhost allowlist (`server.py:101-111`). ⚠️ *Caveat:* `allow_credentials=True` is combined with it, so a deployer who sets `SOLAR_CORS_ALLOWED_ORIGINS="*"` gets the dangerous combination. Worth a guard, but not a defect at defaults. |
| R-7 | *"~1,300 typecheck errors, 438 reachable"* | **OUTDATED** | Now **280 total / 199 reachable**. Real, substantial improvement. |
| R-8 | *"No working frontend unit/E2E test configuration"* | **OUTDATED** | 100 vitest tests across 6 files pass. (E2E remains absent — see §9.) |
| R-9 | *"48 backend tests; Kepler benchmark 0/3 with MAE ≈ 22.824 km/s"* | **OUTDATED** | 143 backend tests pass; the benchmark now declines to compare incomparable quantities rather than producing a meaningless MAE. The *replacement* has its own defects (F-06), but the change was an improvement. |
| R-10 | *"Memory / GPU-resource growth over an extended run"* | **REFUTED (JS heap)** | `usedJSHeapSize` sampled every 20 s for 2 min: **35.6 → 35.6 MB, perfectly flat**; 0 page errors. GPU-object growth via `renderer.info` is **NOT RUN** (see §13). |
| R-11 | *"Speculative state contaminates baseline orbital results"* | **PARTLY CONFIRMED** | The four `superluminal-modeling/*` modules are pure and write nothing. But `main.ts:735` wires them into `model.applyMetricKinematics`, which *does* mutate `worldPosition` — see F-12. The nuance matters: the modules are clean, the wiring is not. |
| R-12 | *"The bundle does not use the ~39 MB `src/assets/textures` collection"* | **PARTLY REFUTED** | `src/textures.ts` **is** in the reachable set and the build emits texture assets. Which specific files load at runtime was **NOT fully enumerated** (§13). The licensing problem (F-05) is independent of whether they load. |
| R-13 | *"`testRealisticScale.mjs` / `testWarp.js` depend on undeclared Puppeteer and inconsistent hard-coded ports"* | **CONFIRMED** | Both fail `ERR_MODULE_NOT_FOUND`; see F-17. |
| R-14 | *"Benchmark CSV contents disagree with metadata"* | **REFUTED** | All 9 sha256 match; all 9 CSV `total_delta_v_km_s` equal the JSON values exactly; all 3 consensus means recompute to the declared value; departure/arrival JDs agree. Integrity is sound — *provenance* is the problem (F-06). |

---

## 7. Scientific claim/evidence and units/frame/time matrix

### 7.1 Planet propagation — **validated, and accurate to JPL's own published envelope**

| Property | Value | Source |
|---|---|---|
| Active | Yes — the production path | `main.ts:36-37` |
| Method | Keplerian elements + linear secular rates (JPL Standish *Approximate Positions of the Planets*, Table 1, 1800–2050) | `data/planets.ts`, `orbitMath.ts:105-160` |
| Equations | `a,e,I,L,ϖ,Ω = X₀ + Ẋ·T`; `M = L − ϖ`; Newton Kepler solve; 3-1-3 rotation `R_z(Ω)R_x(i)R_z(ω)` | `orbitMath.ts:112-147, 178-199` |
| Units | AU, AU/day, degrees→radians, days | `modelWorkerContract.ts:36-40` |
| Origin | Heliocentric (parent-relative, accumulated to world) | `solarSystemModel.ts:106-140` |
| Frame | Mean ecliptic & equinox of J2000 | declared |
| Epoch / time scale | JD 2451545.0; **model expects TDB, receives UTC** | **F-09** |
| Precision | float64 throughout, including the worker boundary | `MODEL_WORKER_ELEMENT_TYPE = 'float64'` |
| Perturbations | **None** — pure two-body + linear secular drift | by design, disclosed in README |
| Validation oracle | **Live JPL Horizons**, 9 planets × 6 epochs (this audit) | |
| Classification | **Approximation — validated** | |

**Measured error vs live Horizons** (`CENTER='500@10'`, `REF_PLANE='ECLIPTIC'`, `REF_SYSTEM='ICRF'`):

| Epoch | Mercury | Venus | Earth | Mars | Jupiter | Saturn | Uranus | Neptune | Pluto |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **J2000** | 1,030 | 8,112 | 6,792 | 8,193 | 1.15e6 | 3.85e6 | 1.08e6 | 1.10e6 | 1.36e6 |
| 1850 | 245 | 9,691 | 3,772 | 21,176 | 5.35e5 | 4.23e6 | 4.89e5 | 1.45e5 | 1.55e6 |
| 1900 | 1,393 | 6,907 | 4,490 | 23,208 | 3.35e5 | 4.40e6 | 1.22e6 | 1.04e6 | 1.27e6 |
| **today** | 2,990 | 3,330 | 8,075 | 34,767 | 4.25e5 | 1.87e6 | 1.03e6 | 8.33e5 | 1.57e6 |
| 2050 | 2,475 | 2,051 | 1,715 | 69,513 | 1.13e6 | 2.99e6 | 1.05e6 | 6.47e5 | 1.13e6 |
| 2100¹ | 2,251 | 11,347 | 3,501 | 39,288 | 5.42e5 | 6.20e6 | 1.93e6 | 1.85e6 | 1.90e6 |

¹ 2100 lies **outside** the table's 1800–2050 fit window; errors grow as expected.

**Is this a bug or the model?** I wrote an **independent Standish implementation** from the JPL tables and
compared it to the same Horizons data. It reproduces the app's errors to 4 significant figures
(Saturn J2000: mine 3,848,012 km vs app 3.848e6; Jupiter 1,149,805 vs 1.150e6; Earth 6,792.1 vs 6.792e3).
**The app is a faithful implementation; the error is the model's own.**

Against **JPL's published nominal errors** for 1800–2050 (fetched from `ssd.jpl.nasa.gov/planets/approx_pos.html`):

| Body | JPL λ budget | measured along-track | JPL ρ budget | measured radial | verdict |
|---|---:|---:|---:|---:|---|
| Mercury | 15″ | ~10″ | 1,000 km | 473 km | ✅ within |
| Venus | 20″ | ~15″ | 4,000 km | 2,465 km | ✅ within |
| EM Bary | 20″ | ~8″ | 6,000 km | 3,029 km | ✅ within |
| Mars | 40″ | ~59″ (2050) | 25,000 km | 9,158 km | ⚠️ marginal at window edge |
| Jupiter | 400″ | ~310″ | 600,000 km | 287,149 km | ✅ within |
| Saturn | 600″ | ~518″ | 1,500,000 km | 1,728,529 km | ⚠️ marginally over |
| Uranus | 50″ | ~70″ | 1,000,000 km | 349,943 km | ⚠️ λ over |
| Neptune | 10″ | ~45″ | 200,000 km | 490,663 km | ⚠️ over |

**Verdict:** the frontend planet model is a *correct implementation of a visualisation-grade model*, performing
at or near JPL's stated envelope for the inner planets and Jupiter/Saturn, slightly outside it for Uranus and
Neptune. The README describes it accurately. **It is not suitable for any analysis needing better than
~10⁴ km (inner) / ~10⁶ km (outer).**

### 7.2 Moon propagation — **NOT validated; actively wrong away from J2000**

| Property | Value |
|---|---|
| Method | Same Kepler path; elements from JPL SSD satellite tables, 16 distinct ephemerides |
| Frame | Source frames (`Laplace`, `equatorial`, `ecliptic`) converted to a **unified ecliptic approximation** at catalog-build time (`catalog.ts:397-405`) |
| Secular rates | ω̇ and Ω̇ only — **no mean-longitude rate for any of 424 moons** (F-01) |
| Validation oracle | committed fixture, **single epoch (J2000)**, 20 moons, tolerances up to 200 % of orbit radius (F-02) |
| Classification | **Approximation — NOT validated beyond J2000** |

Measured vs live Horizons (parent-relative, ecliptic ICRF):

| Moon | orbit radius | J2000 | +1 yr | +5 yr | today |
|---|---:|---:|---:|---:|---:|
| **Moon** | 384,400 km | 4,432 | 266,688 | **745,623** | 167,457 |
| **Titan** | 1,221,870 km | **2,392,364** | 2,366,361 | 2,404,850 | 2,427,741 |
| **Rhea** | 527,000 km | **1,033,977** | 1,036,273 | 1,045,661 | 974,666 |
| **Europa** | 671,000 km | 401 | 1,324,956 | 684,284 | 897,338 |
| **Io** | 421,700 km | 831 | 840,170 | 842,281 | 141,867 |
| Ganymede | 1,070,400 km | 1,602 | 816 | 7,929 | 29,861 |
| Callisto | 1,882,700 km | 4,790 | 3,573 | 4,365 | 9,429 |
| Triton | 354,800 km | 25,064 | 25,688 | 37,115 | 127,767 |

Two distinct defects are visible:
- **Phase divergence away from epoch** (Moon, Io, Europa) — F-01 for the Moon; Io/Europa are additionally
  affected by very fast apsidal precession (1.33 / 1.39 yr periods) where a *linear* secular model is invalid
  over years. **Not fixed by the F-01 gate** (both variants remain >100,000 km).
- **Wrong at the element epoch itself** (Titan 2.4 M km, Rhea 1.03 M km at J2000) — an element-set or
  frame-conversion defect, *not* a propagation defect, since T=0. Ganymede/Callisto (same JUP365 ephemeris)
  are fine at J2000, so this is specific to the SAT441 Laplace-frame entries.

**Nothing in the repository tests any of this away from J2000.**

### 7.3 Cross-engine contracts — units, origin, frame, time scale

| Boundary | Position | Velocity | Origin | Frame | Time scale | Precision | Verdict |
|---|---|---|---|---|---|---|---|
| `main.ts` → `modelWorker` | AU | AU/day | heliocentric | ecliptic J2000 | app JD (**UTC**), no conversion — *declared* | **float64** | ✅ correct & self-documenting |
| `solarSystemModel` internal | AU | AU/day | parent-relative → world | ecliptic J2000 | as above | float64 | ✅ |
| `phase1AsteroidCatalog` (ACBF) | AU (`f32 aAu`) | — | heliocentric | ecliptic | **`f32` epochJd**, 0.25 d resolution | float32 | ⚠️ F-26 (latent) |
| Frontend → `GET /solar/physics` | — | — | — | — | `jd` query param | — | ✅ |
| `/ws/sim` → client | AU | **AU/day** | **barycentric** | ecliptic J2000/ICRF | **TDB, declared** | float64 | ✅ **verified vs Horizons** |
| `rebound_nbody` internal | AU | AU/yr (`units=("yr","AU","Msun")`) | barycentric | ecliptic J2000 | TDB | float64 | ✅ converts correctly at the boundary |
| `EphemerisService` → Lambert | AU | AU/day | heliocentric | ecliptic | JD | float64 | ✅ |
| `tudatpy_hooks` | n/a | n/a | n/a | n/a | n/a | n/a | **not installed** — capability correctly reported `available: false`; force models are configured but were **NOT verified as wired** (§13) |

**Notable strength:** the WebSocket `state_update` frame self-describes with `position_units`,
`velocity_units`, `position_frame`, `velocity_frame`, `jd_time_scale`, `fidelity`, `energy_error` and a full
`force_models.initial_conditions` block naming the dataset id, DE441, the provider, the retrieval timestamp
and the input origin/orientation. That is better contract hygiene than most research codes.

**The one systematic gap** is the frontend's UTC/TDB conflation (F-09), which the worker contract discloses
but the README does not.

### 7.4 Invariants measured on the live REBOUND engine

| Invariant | Result | Verdict |
|---|---|---|
| Earth speed @ J2000 | 30.285 km/s vs Horizons 30.292 | ✅ 0.02 % |
| Jupiter speed @ J2000 | 13.660 vs 13.676 | ✅ 0.12 % |
| Mercury speed @ J2000 | 38.892 vs 38.882 | ✅ 0.03 % |
| Seek idempotence — `set_julian_date(2451545)` twice | Δ = **0.000e+00 km** | ✅ exact |
| Forward 10 yr → back to J2000 | Δ = **0.000e+00 km** | ✅ exact — *but* because seek re-initialises from the fixture rather than integrating backwards, so this does **not** measure integrator reversibility |
| `energy_error` at J2000 | 1.17e-15 | ✅ excellent (IAS15) |
| `energy_error` after +200 yr seek | **0.0** | ⚠️ re-baselined on seek (F-28) — cannot measure long-run drift |
| Engine fallback labelling | `engine: "rebound"`, `engine_requested: "tudatpy"` | ✅ honest |
| Unknown command | `{"type":"error","code":"unsupported_command",…}` | ✅ structured |
| Documented protocol messages | `set_time_scale`, `pause`, `resume`, `set_julian_date`, `activate_kuiper`, `deactivate_kuiper`, `get_orbital_elements` all accepted; observed reply types `connected`, `state_update`, `orbital_elements`, `error` | ✅ matches the `server.py` docstring |

### 7.5 Solar model — approximation and synthetic visualisation, honestly labelled

`GET /solar/capabilities` reports `model: "quasi_mhd_corona_v4"`, described as a *"Backend-driven quasi-MHD
solar corona model"*. **No MHD PDE is solved** — no induction equation, no momentum equation, no force-free
extrapolation. It is deterministic procedural synthesis from analytic envelopes.

**The endpoint says so itself**, in its own `notes` array: *"Deterministic physically-inspired synthesis, not
a full MHD PDE solve."* That disclosure is exactly what the audit brief asks for, and it is present. The
residual issue is that the **model name** `quasi_mhd_corona_v4` still carries "MHD" into every client that
reads only the identifier, and README:9 lists "PFSS magnetics" among physics features when the implementation
is a dipole + octupole analytic field rather than a magnetogram-driven PFSS solve.

Constants I checked against primary sources: solar radius **695,700 km** ✅ (IAU 2015 B3 nominal);
solar cycle **4017.75 d = 11.00 yr** ✅; Hathaway-2015 envelope parameters `b_months 54.0`, `c_asymmetry 0.71`
✅ plausible for the normalised form; CME speed envelope 20–3500 km/s ✅ (spans the observed SOHO/LASCO range);
RTV scaling referenced ✅ (Rosner-Tucker-Vaiana 1978). `solar_radius_au` = 0.004650467 ✅ (695700/1.495979e8).

| Sub-feature | Classification |
|---|---|
| Limb darkening (Neckel & Labs 1994), Planck 5778 K colour | **Approximation from published coefficients** |
| K-corona (Baumbach/van de Hulst), RTV temperature scaling | **Approximation** |
| Granulation, spicules, prominences, flares/CMEs | **Synthetic visualisation** |
| PFSS "magnetics" (dipole + octupole) | **Approximation**, not a PFSS solve |
| SDO/AIA observation textures | **Catalog observation** (real, via Helioviewer ✅ live) |
| SILSO sunspot number, GONG synoptic | **Catalog observation** ✅ live |
| NOAA SWPC solar wind | **Dead upstream** (404) — F-18 |
| AGN / SMBH / H29 metric-frame-dragging slipstream | **Speculative hypothesis** |

The H29 / Alcubierre-like material is labelled *"exotic hypothesis modeling"* in the README and the UI option
reads *"H29: The Metric-Frame-Dragging Slipstream"*, so a user is not told it is established physics. The
`1e12` visual-exaggeration factor (F-12) is however not surfaced anywhere.

---

## 8. Numerical benchmark and invariant results

### 8.1 Lambert solver — **certified and correct** (a genuine strength)

`backend/trajectory/lambert.py` implements a universal-variable (Stumpff `C(z)`/`S(z)`) formulation with a
bracketed root solve, `max_iter=80`, `tol_days=1e-4` (8.64 s).

**Closure test** — I propagated each returned `v1` with my **own independent** universal-variable Kepler
propagator (Vallado Algorithm 8, written for this audit) and measured `|r(t₀+TOF) − r₂|`:

| Case | status | closure error |
|---|---|---:|
| Earth→Venus type | ok | **2.35 km** |
| short TOF 60 d | ok | 9.44 km |
| near-collinear θ→0 | ok | 44.55 km |
| near-collinear θ→180 | ok | 5.08 km |
| high inclination 89° | ok | 2.40 km |
| outer (Jupiter-like) | ok | **0.13 km** |
| very long TOF 1500 d | ok | 93.55 km |
| exactly 180° transfer | **no solution** | — (correct: transfer plane is undefined) |
| TOF = 1 d / 0 / negative | no solution | ✅ correct rejection |
| identical endpoints | no solution | ✅ correct rejection |

Closure of 0.13–93 km on AU-scale transfers is consistent with the declared 8.64 s tolerance.

**Reported residual:** the solver returns `rootResidualDays = 1.19×10⁻⁶ d ≈ 0.10 s`, `rootBracketed: true`,
`computedTofDays`, `transferAngleDeg`, `pathSense`. **A certified TOF residual is present** (refutes R-2).

**180° singularity behaviour** — continuous and well-conditioned right up to the degeneracy:

| θ (deg) | 179.0 | 179.9 | 179.99 | **180.00** | 180.01 | 180.1 | 181.0 |
|---|---|---|---|---|---|---|---|
| result | ok | ok | ok | **no-sol** | ok | ok | ok |
| \|v₁\| km/s | 32.7306 | 32.7307 | 32.7307 | — | 32.7307 | 32.7307 | 32.7306 |

**Textbook validation** — circular-orbit Hohmann Earth→Mars:

| Quantity | This solver (θ=179.99°, Hohmann TOF) | Independent computation | Vallado/Curtis |
|---|---:|---:|---:|
| Δv₁ | **2.9461 km/s** | 2.9461 | 2.943 |
| TOF | 258.8 d | 258.915 d | ~258.8 d |

**0.1 % agreement with the textbook value.** This is the strongest-validated component in the repository.

**Limitations:** `revolutions` is hard-coded to `0` and is not even an accepted parameter
(`TypeError: unexpected keyword argument 'revolutions'`) — **no multi-revolution transfers**, which rules out
a large part of real mission design. No finite-burn modelling (README discloses this). No independent
cross-check against `pykep`/`poliastro` (§13 — NOT RUN).

### 8.2 MGA / flyby

`optimize_mga_route` enumerates assist permutations (`mga.py:44`) × 8 TOF candidates per leg
(`planner.py:95`: 80, 120, 180, 260, 360, 520, 700, 980 d) — a fixed grid, deterministic, no local
refinement. `max_assists` is clamped to 3. `estimate_turn_angle_deg` exists (`lambert.py:445`) and the
result reports `hardConstraintMode: "flyby_turn_limit"` and `turnDeficitPenalty`.

**v-infinity conservation and body-specific periapsis constraints were NOT independently verified** — see §13.
The TOF grid being fixed and coarse means the reported "best" route is the best *on that grid*, not an
optimum; `deltaVDepartureKmS` of 15.6 km/s for the Earth→Jupiter direct leg reflects a grid TOF (1590 d)
rather than an optimised departure.

### 8.3 Accuracy benchmark

```
scenarioCount 3 | comparableScenarioCount 0 | incomparableCount 3 | solvedCount 0
passCount 0 | failedCount 0 | passRate 0.0 | validationCoverage 0.0 | meanAbsErrorKmS 0.0
referenceIntegrityOk true | requiredTools [gmat, orekit, tudat]
```
Integrity verified independently: **9/9 sha256 match**, **9/9 CSV Δv equal the JSON**, **3/3 consensus means
recompute exactly**, departure/arrival JDs agree. **Scientific coverage: zero.** See F-06.

### 8.4 The planet accuracy gate — a model of how to do this properly

`src/sim/planetPositionCheck.ts` deserves explicit credit, and stands in sharp contrast to the moon gate:

- **Six epochs spanning 1900–2100**, not one (`:18`).
- **Per-planet error budget in km, applied at every epoch** (`POSITION_BUDGET_KM`, `:81`).
- **A separate secular-drift budget** (`DRIFT_BUDGET_KM`, `:124`):
  `drift = max over |T| ≥ 0.25 cy of (err(epoch) − err(J2000))`. This is *precisely* the construct that
  catches an apsidal double-count, and its comments explicitly record the "current buggy tip" values it was
  calibrated against.
- **An aggregate cap** `TOTAL_BUDGET_KM = 7.5e7` over all 48 rows.

`npm run verify:planet-positions` → *"planet-position check passed: 8 planets within budget at 6 epochs
(48 rows, total 3.692e+07 km)"* — i.e. 49 % of the aggregate budget consumed.

**Recommendation:** port this design wholesale to the moon gate. Doing so would have caught F-01 automatically.

---

## 9. Performance and browser validation

### ⚠️ Hardware caveat — read before using any FPS number here

All browser measurements ran under **SwiftShader (software WebGL)** — `ANGLE (Google, Vulkan 1.3.0
(SwiftShader Device (Subzero)), SwiftShader driver)`. No GPU was available in this environment.
**The FPS figures below characterise a software rasteriser and are NOT representative of real hardware.**
They are reported for completeness and marked accordingly. The CPU-side measurements (§9.3) are
hardware-independent and *are* meaningful.

### 9.1 Startup and load (OBSERVED, `vite preview` on :4173)

| Metric | Value |
|---|---|
| `load` event | **1,162 ms** |
| Canvas + WebGL 2.0 context | ✅ initialised |
| Bodies rendered | **55,010** (50,000 asteroids + 5,000 KBOs + 10 major bodies) |
| Page errors / uncaught exceptions | **0** |
| Console errors | 3–5, all `net::ERR_CONNECTION_REFUSED` for the absent backend on :8042 |
| Main bundle | 890.48 kB (gzip **222.97 kB**) + worker 19.46 kB + CSS 6.53 kB |
| Largest data fetch | `asteroid_phase1_main_100000.bin` 3.5 MB |
| Body-list dropdown | **10 options** despite 55,010 bodies (README claims *"Search all bodies by name"*) |

### 9.2 Frame timing — SOFTWARE RENDERING, not representative

| Metric | Value (SwiftShader) |
|---|---|
| FPS p50 / p95 / p99 | 0.8 / 0.4 / 0.4 |
| rAF interval p50 / p95 / max | 1,183 / 2,333 / 2,333 ms |
| Worst frame | 2,500 ms |
| `page.screenshot()` | **timed out at 30 s** — the compositor could not produce a frame |

**NOT RUN:** GPU frame time, draw-call counts, `renderer.info` sampling, DPR 2×/3× comparison,
canvas-resize-frequency instrumentation. See §13.

### 9.3 CPU-side per-frame cost (hardware-independent, measured in Node)

| Operation | Cost | Frequency |
|---|---:|---|
| `propagateKBOPositions(5,000)` | **1.06 ms** | **every frame, unconditionally, even paused** (F-11) |
| = share of a 60 FPS budget | **6.3 %** | |
| `generateAsteroidBelt(50,000)` | 32 ms | once, at startup |

### 9.4 Memory (OBSERVED)

`usedJSHeapSize` sampled every 20 s for 2 minutes: **35.6 → 35.6 → 35.6 → 35.6 → 35.6 → 35.6 MB**.
**Perfectly flat — no JS memory leak.** (GPU-object growth NOT measured — §13.)

### 9.5 Degraded modes (OBSERVED)

| Mode | Bodies shown | UI signal | Verdict |
|---|---|---|---|
| Normal | 55,010 | — | ✅ |
| **Catalog fetch blocked** | **55,010** (identical) | **none** — only `console.warn` | ❌ **F-04** |
| **Backend blocked** | 55,010 | none; app fully functional | ✅ graceful, but silent |
| **`prefers-reduced-motion: reduce`** | 55,010 | **no behavioural change** | ❌ F-31 |
| Slow load (occurred naturally) | 55,010 | `Acceptance gates failed: loadMs=3768.3 exceeded budgetMs=2000` → procedural substitution | ❌ **F-04** |

### 9.6 Accessibility (OBSERVED, static + runtime)

12 `<label>` elements ✅ · **0 `aria-*`** ❌ · **0 `role=`** ❌ · **0 `alt=`** ❌ ·
0 unnamed buttons ✅ · no WebGL-unavailable fallback message ❌ · no reduced-motion support ❌.
**NOT RUN:** axe-core scan, keyboard-only traversal, responsive layout at 390×844 (§13).

---

## 10. Security and deployment-readiness assessment

**Threat model context matters.** This reads as a local research/visualisation tool. Every finding below is
rated for the *documented* deployment posture — the README instructs
`uvicorn server:app --host 0.0.0.0 --port 8042 --reload`, i.e. **bound to all interfaces with the auto-reloader
on**, which is a development server exposed to the whole LAN.

| # | Area | Finding | Severity |
|---|---|---|---|
| S-1 | **Authentication** | **None on any endpoint.** All 18 routes + the WebSocket are anonymous, including the two that write files and the ones that make outbound network calls. | High (if exposed) |
| S-2 | **WebSocket Origin** | **Not validated** — forged `Origin: https://evil.example.com` accepted (F-07). Each connection allocates a 41-body REBOUND sim on its own thread. No connection cap observed. | **High** |
| S-3 | **External-fetch amplification** | **~1,500× to `ssd.jpl.nasa.gov`** from one anonymous request (F-03). No outbound budget, no circuit breaker. | **High** |
| S-4 | **Unbounded cache** | `EphemerisService._cache` is a plain dict, no TTL/eviction; attacker-chosen `departure_jd` grows it indefinitely (F-03). | Medium |
| S-5 | **Missing compute timeouts** | `/trajectory/plan` and `/trajectory/lambert` are sync `def` with **no** timeout wrapper, unlike the four sibling compute endpoints. | **High** |
| S-6 | **CORS** | Default is a **localhost allowlist**, not wildcard ✅. But `allow_credentials=True` is paired with it, so a deployer setting `SOLAR_CORS_ALLOWED_ORIGINS="*"` creates the credentialed-wildcard footgun. | Low (default) |
| S-7 | **Path containment** | ✅ **Holds.** 4 traversal payloads → HTTP 400, contained to `my-notes/`; overwrite guard works. | — (pass) |
| S-8 | **Path disclosure** | Absolute server paths leak via `/health`, `/benchmark/accuracy`, and 400 error bodies (F-19). | Low |
| S-9 | **Input validation** | ✅ **Strong.** Pydantic strict mode with `extra_forbidden`; `FiniteFloat`/`StrictStr`/`StrictBool` reject NaN/Infinity; semantic guards (`from_id != to_id`, `arrival_jd > departure_jd`) return 400. Malformed input produced **no stack traces**. | — (pass) |
| S-10 | **Porkchop bounds** | ✅ `_enforce_porkchop_request_size` (`server.py:490`) clamps step sizes to minimums and rejects inverted ranges, plus a compute timeout. | — (pass) |
| S-11 | **Report writes** | Unauthenticated file creation in `my-notes/`; each call runs the full benchmark. Contained and overwrite-guarded, but unbounded in count. | Medium |
| S-12 | **Production config** | `server.py:1815` `uvicorn.run(..., host="0.0.0.0", port=8042, reload=True)`. **`reload=True` must never ship**; `0.0.0.0` + no TLS + no reverse-proxy guidance + no auth. | **High** (as documented) |
| S-13 | **Supply chain (npm)** | 8 vulns — 1 critical (`vitest` UI file read/exec), 5 high (`vite` dev-server arbitrary file read, `rollup` path traversal, `postcss`, `picomatch`, `nanoid`). **All dev-only**; prod tree is 2 packages. Matters for `npm run dev` on an untrusted network. | Medium |
| S-14 | **Supply chain (Python)** | `rebound 5.1.1` pinned ✅; everything else is `>=` floors (`fastapi>=0.100.0` etc.) → **unpinned, non-reproducible installs**. No lockfile. `pip-audit` **NOT RUN** (§13). | Medium |
| S-15 | **Secrets** | `git grep -nE "(api[_-]?key\|secret\|token\|password\|BEGIN .*PRIVATE KEY)"` — **no committed credentials found**. | — (pass) |
| S-16 | **Client disconnect** | Abrupt disconnects logged cleanly; no thread-count growth observed across ~15 connections. Graceful-shutdown path exists (`_thread.join(timeout=3)`). | — (pass) |

**Deployment verdict: NOT ready for any network-exposed deployment.** It is acceptable as a
`127.0.0.1`-bound local tool. To expose it, S-1, S-2, S-3, S-5 and S-12 are all prerequisites.

---

## 11. Data, asset, licence and reproducibility assessment

| Artifact | Size | Provenance recorded | Checksum | Regen command | Reproducible? | Licence |
|---|---:|---|---|---|---|---|
| `public/data/asteroid-phase1/*.bin` | 3.5 MB | ✅ **Exemplary** — endpoint, 15 fields, `sort=-diameter`, `limit`, class/AU filters, `generated_utc`, counts | ✅ **fnv1a32 + sha256, both verified by me** | `npm run phase1:asteroid-dataset` | ⚠️ deterministic, but upstream SBDB is mutable | ❓ JPL SBDB (public domain, unstated) |
| `src/data/moons.json` | 221 kB | ⚠️ per-record `ephemeris` + `epochTdb` ✅, but no retrieval date, no snapshot id, `reference: "n/a"` | ❌ none | `npm run update:moons` | ❌ **regenerates 460 vs 424** (F-16) | ❓ JPL SSD (public domain, unstated) |
| `backend/data/ephemerides/jpl_horizons_de441_*.json` | — | ✅ **Exemplary** — `dataset_id`, `epoch_jd_tdb`, `state_ephemeris: DE441`, `provider`, `api_version`, `retrieved_utc: 2026-08-26T04:31:41Z`, origin/orientation | — | `scripts/fetch_jpl_nbody_ephemeris.py --check/--write` | ✅ has a verify mode | ❓ NASA/JPL |
| `backend/benchmark/artifacts/*.csv` (9) | 2 kB | ❌ **no tool inputs, kernels, frames, solver settings or logs** | ✅ 9/9 sha256 verified | ❌ **none exists** | ❌ **not reproducible** (F-06) | ❓ |
| `src/data/stars_catalog.json` | 172 kB | ⚠️ README credits d3-celestial + optional Gaia DR3 | ❌ | `scripts/fetch_gaia_catalog.py` | ⚠️ | ❓ **Gaia has explicit attribution requirements** — unmet |
| `src/assets/textures/` (25 files) | **39 MB** | ❌ **NO manifest of any kind** | ❌ | ❌ none | ❌ | ❌ **F-05 — unresolved** |
| `public/textures/moons/` (9 files) | 1.5 MB | ✅ **Exemplary** — provider, dataset, product page, credit, licence, sha256, download URL per file | ✅ per-file sha256 | `npm run ingest:moon-textures` | ❌ **script is broken** (F-17) | 8× USGS public domain ✅ / **1× "Unspecified — verify for redistribution"** ❌ |
| `public/solar-systems/manifests/*.json` (3) | 12 kB | ⚠️ | ❌ | ❌ | ⚠️ | ❓ |
| `debug_screenshot*.png` | 545 kB | — | — | — | — | hygiene: should not be committed |
| **Repository itself** | — | — | — | — | — | ❌ **NO LICENSE FILE** |

**The pattern is instructive:** where this project documents provenance it does so *very* well (the asteroid
meta, the ephemeris block, the moon-texture attribution are all better than typical research-code practice).
The failures are concentrated in what was never given that treatment — the 39 MB texture tree, the moon
catalog, and the benchmark artifacts.

**Regeneration performed:** `npm run update:moons` → 460 records vs 424 committed (F-16).
`npm run phase1:asteroid-dataset` was **NOT RUN** (would issue a 100,000-row SBDB query; deemed abusive to
JPL during an audit that had already made ~1,500 Horizons requests) — see §13.

---

## 12. Testing and coverage-gap matrix

| Subsystem | Unit | Integration | External oracle | Coverage | Gap |
|---|---|---|---|---|---|
| Planet propagation | ✅ | ✅ | ✅ **Horizons, 6 epochs 1900-2100 + drift budget** | `orbitMath` 91 % | **Best-validated frontend component** |
| `solarSystemModel` (propagation driver) | ❌ | ❌ | ❌ | **0 %** | Entirely untested |
| Moon propagation | ⚠️ | ⚠️ | ⚠️ **single epoch, ≤200 %-of-orbit tolerance** | `catalog` 95 % | **F-01/F-02 — the critical gap** |
| Moon frame conversion | ✅ | ✅ | ✅ plane-angle check is sound | 83 % | Position check asserts ~nothing |
| Kuiper belt | ❌ | ❌ | ❌ | **0 %** | none |
| Asteroid belt / ACBF loader | ⚠️ backend binary test only | ❌ | ❌ | **0 %** (frontend) | Acceptance gates (F-04) untested |
| Model worker | contract 96 % ✅ | ❌ | ❌ | worker **0 %** | Contract tested, implementation not |
| `main.ts` (1,224 lines) | ❌ | ❌ | ❌ | not instrumented | Monolith, untestable as-is |
| REBOUND engine | ✅ | ✅ | ✅ multi-epoch Horizons gate | 76 % | Good |
| Lambert | ✅ | ✅ | ⚠️ reference test exists; **no independent library cross-check** | 86 % | No multi-rev |
| MGA / flyby | ✅ | ✅ | ❌ | 92 % | **v∞ conservation not asserted** |
| Benchmark harness | ✅ plumbing | ✅ | ❌ **monkeypatched fake solver** | 100 % (test file) | **validationCoverage 0.0** |
| Solar physics | ✅ | ✅ | ❌ | 76 % | No observational comparison |
| Solar realtime ingest | ⚠️ cache test | ❌ | ❌ | **21 %** | SWPC 404 undetected by tests |
| `tudatpy_hooks` | ⚠️ | ❌ | ❌ | **31 %** | Not installed |
| `radiation_pressure` | ❌ | ❌ | ❌ | **0 %** | Dead weight |
| Server routes | ✅ validation tests | ✅ | — | **56 %** | No auth/origin/rate-limit tests |
| **E2E / browser** | ❌ | ❌ | ❌ | **none** | **No E2E framework at all** |
| **Lint / format / typecheck gate** | ❌ | — | — | — | **None exist** (F-14) |

**Determinism:** the backend suite was run 3× (51 s, 63 s, 64 s) with identical results — stable.
Frontend suite 100/100 across repeated runs. Tests that touch the network or wall clock: the solar-realtime
cache test and `accuracy.py`'s `datetime.utcnow()` (deprecation-warned) are the flake candidates.

**Tautological tests:** `test_benchmark_accuracy.py:13-34` asserts the production system's *current* zero-coverage
state as the expected outcome — it will pass forever regardless of scientific validity, and will *fail* if
someone fixes the benchmark.

---

## 13. Prioritised remediation roadmap

### P0 — correctness and legal (do before any further feature work)

| ID | Action | Acceptance criterion | Effort |
|---|---|---|---|
| **P0-1** | **F-01** Apply the SF-1 mean-longitude gate to moons, driven by a per-ephemeris table (sidereal vs anomalistic period), failing closed for unknown ephemerides | Moon error < 15,000 km at J2000, +1, +5, +25, +50 yr; **no JUP/SAT/URA/NEP moon regresses > 10 %** | 2–3 d |
| **P0-2** | **F-02** Rebuild the moon gate on the planet gate's design: ≥4 epochs, per-moon km budgets, **secular-drift budget**, aggregate cap. Replace the 2.0 tolerance pins | The rebuilt gate **fails** on today's code and passes after P0-1 | 1–2 d |
| **P0-3** | **F-05** Add `LICENSE`; add `src/assets/textures/ATTRIBUTION.json` in the moon-texture format; resolve or remove the Deimos texture | CI fails if any file under `src/assets/**` or `public/textures/**` lacks a manifest entry | 1 d + legal |
| **P0-4** | **F-04** Demote the latency budget from acceptance gate to telemetry; surface catalog-vs-procedural provenance in the UI | A 5 s stalled fetch still accepts the catalog; DOM assertion proves the provenance label switches | 0.5 d |
| **P0-5** | **F-03/F-05(sec)** Timeout-wrap `/trajectory/plan` + `/trajectory/lambert`; default provider `kepler`; bound the ephemeris cache; per-request outbound-fetch budget | `max_assists=3` returns ≤5 s or HTTP 504; a test asserts outbound calls ≤ N | 1 d |
| **P0-6** | **F-07** Validate WebSocket `Origin` against the CORS allowlist; cap connections per client | Test: forged Origin closed with 1008 | 2 h |
| **P0-7** | **F-12** Route the metric displacement to a render-only offset; feed perturbers from a pristine snapshot; add a persistent "SPECULATIVE MODE" badge | Test: with warp active, `model.getState('jupiter').worldPosition` equals the unwarped value | 0.5 d |
| **P0-8** | **F-08** Retitle README to match `index.html`; move backend-only capabilities under "Backend API (no UI)"; delete claims for absent features | Doc test: every README-claimed UI control exists in `index.html` | 0.5 d |

### P1 — scientific credibility and engineering hygiene

| ID | Action | Acceptance criterion | Effort |
|---|---|---|---|
| **P1-1** | **F-06** Emit `null` (not `0.0`) for `meanAbsErrorKmS`/`passRate` when nothing is comparable; drop the "strict" label; add ≥1 genuinely comparable fixed-state scenario | `validationCoverage ≥ 0.8` with the real solver (no monkeypatch) | 3–5 d |
| **P1-2** | **F-09** Convert UTC→TDB before propagation (ΔT table + documented review date) | Mercury error at today's epoch < 500 km vs Horizons (currently 2,990) | 0.5 d |
| **P1-3** | **F-14** Add CI running `typecheck && test && build`; fix the 199 reachable type errors (start with `main.ts`) | `npm run typecheck` exits 0; CI blocks merge | 3–5 d |
| **P1-4** | **F-15** Tests for `solarSystemModel`, `kuiperBelt`, `asteroidBelt`, `phase1AsteroidCatalog`, `modelWorker` | Each ≥ 60 % line coverage; catalog acceptance gates covered | 3–5 d |
| **P1-5** | **F-10** Add Pluto's six secular rates; document or implement the extra b/c/s/f terms | Pluto within 2× the tabulated-rate reference at all 6 gate epochs | 2 h–1 d |
| **P1-6** | **F-16/F-17** Sidecar meta for `moons.json`; fix or delete the 4 broken scripts; make `update-moons-data.mjs` dry-run by default | `--help` mutates nothing; a row-count change requires `--accept-drift` | 1 d |
| **P1-7** | **F-23/S-14** Add `httpx` to a `requirements-dev.txt`; pin all Python deps with a lockfile | Clean-venv install → `pytest` passes with no manual additions | 0.5 d |
| **P1-8** | **F-22** `npm audit fix` | 0 critical/high | 1 h |
| **P1-9** | **S-12** Remove `reload=True`; bind `127.0.0.1` by default; document a production posture (TLS, reverse proxy, auth) | Default `python server.py` binds loopback with reload off | 0.5 d |
| **P1-10** | Moon element-set defect: fix or formally track Titan/Rhea/Io/Europa (wrong at J2000 ⇒ element or frame issue, not propagation) | Titan < 100,000 km at J2000 | 2–3 d |

### P2 — performance, polish, maintainability

| ID | Action | Acceptance criterion | Effort |
|---|---|---|---|
| **P2-1** | **F-11** Skip KBO propagation + upload when the epoch is unchanged | 0 KBO work while paused; measurable frame-time drop | 2 h |
| **P2-2** | **F-13** Port the rate-bounded visual clock so solar visuals track simulation time | Time warp visibly changes solar evolution rate | 0.5 d |
| **P2-3** | **F-24/F-25/F-26** Clamp + convergence-flag `solveKeplerFast`; store epoch as an offset from J2000 in ACBF v2 | Solver accurate to 1e-10 rad at e=0.999; format test at a non-0.25-d epoch | 1 d |
| **P2-4** | **F-21** Uniform or stratified sampling when subsetting the catalog; label the rule in the UI | Rendered diameter distribution matches the corpus within 10 % | 0.5 d |
| **P2-5** | **F-31** aria/role/alt attributes; `prefers-reduced-motion`; WebGL-unavailable fallback; axe-core in CI | 0 critical axe violations | 2 d |
| **P2-6** | **F-15/arch** Decompose `main.ts` (1,224 lines); adopt or delete the 31 dormant modules | No file > 400 lines; dormant modules removed or wired with tests | 5–10 d |
| **P2-7** | **F-20** Env-configurable backend URL; consistent request/response casing; REST schema version | `VITE_BACKEND_URL` honoured; one casing convention | 0.5 d |
| **P2-8** | **F-30** Move root research docs to `docs/research/`; fix 18 absolute paths; drop committed screenshots | Repo root holds only README + config | 0.5 d |
| **P2-9** | **F-18** Fix or drop the SWPC source | `/solar/realtime` reports `swpc.ok: true`, or SWPC is removed from capabilities + README | 1 h |
| **P2-10** | Multi-revolution Lambert; independent cross-check vs `pykep`/`poliastro` | N≥1 rev solutions with closure < 100 km, agreeing with the reference library | 3–5 d |

---

## 14. Weighted scorecard

Scores reflect **what was tested**. Optional components that are legitimately absent (TudatPy) are excluded
rather than scored as failures. Coverage/confidence is rated separately per the brief.

| Dimension | Weight | Score | Weighted | Coverage / confidence | Basis |
|---|---:|---:|---:|---|---|
| **Functional / runtime correctness** | 15 | **9.0 / 15** | 9.0 | **High** — built, ran, browsed, probed 18 endpoints | Loads clean, 0 page errors, graceful degradation, strong input validation, correct engine fallback. Deducted for F-01 (moons visibly wrong), F-04 (silent synthetic substitution), F-12, F-13, and 199 reachable type errors. |
| **Scientific / numerical validity** | 25 | **11.0 / 25** | 11.0 | **High** for planets/Lambert/REBOUND (live-Horizons validated); **High** for moons (measured); **Medium** for solar | Planets validated to JPL's own envelope ✅; Lambert matches textbook to 0.1 % ✅; REBOUND units/invariants exact ✅. But: moons wrong by up to 1.9× orbit radius ❌, `validationCoverage = 0.0` ❌, UTC/TDB conflation, Pluto rates missing, no multi-rev, "MHD"/"strict" labels unearned. |
| **Testing / reproducibility** | 15 | **6.0 / 15** | 6.0 | **High** — ran both suites, measured coverage both stacks | 243 tests pass and the planet gate is exemplary ✅. But core frontend modules at 0 %, moon oracle single-epoch with meaningless tolerances, benchmark test asserts zero coverage, no E2E, no CI/lint/typecheck gate, `moons.json` not reproducible. |
| **Architecture / maintainability** | 10 | **4.5 / 10** | 4.5 | **High** — full reachability map from sourcemaps | Clean module boundaries and an excellent worker contract ✅. But 31 dormant production modules (43 % of the tree), a 1,224-line entry monolith, backend effectively disconnected from the UI, 103 `.md` vs 73 `.ts`. |
| **Performance / scalability** | 10 | **5.5 / 10** | 5.5 | **LOW** — software rasteriser only; no GPU measurements | Heap flat (no leak) ✅; the per-frame drawing-buffer hypothesis **refuted** ✅; bundle 223 kB gzip is reasonable ✅. Deducted for F-11 (unconditional 5,000-body per-frame work) and per-frame allocations. **GPU frame time, draw calls, DPR scaling, resize frequency all NOT MEASURED** — score carries low confidence. |
| **Security / operations** | 10 | **4.0 / 10** | 4.0 | **High** — actively attacked a live instance | Path containment holds ✅, input validation strong ✅, no secrets ✅, sane CORS default ✅, porkchop bounded ✅. But no auth anywhere, no WS Origin check, ~1,500× fetch amplification, missing timeouts on 2 of 6 compute endpoints, unbounded cache, `reload=True` + `0.0.0.0` as the documented run command. |
| **Data provenance / licensing** | 10 | **4.5 / 10** | 4.5 | **High** — verified every checksum, regenerated one dataset | Asteroid meta, ephemeris block and moon-texture attribution are genuinely exemplary ✅; all 9 benchmark + 2 catalog checksums verified ✅. But **no LICENSE**, 39 MB unmanifested textures, one unresolved redistribution licence, unmet Gaia attribution, benchmark artifacts unreproducible, `moons.json` drifts 424→460. |
| **Documentation / accessibility** | 5 | **1.5 / 5** | 1.5 | **High** | *"Physics Notes and Limitations"* and *"Data Model"* are accurate and admirably candid ✅. But Highlights/Features describe a different product (9 false/absent claims), 4 stale facts, a non-existent file in the structure listing, 0 aria/role/alt, no reduced-motion, no WebGL fallback. |
| **TOTAL** | **100** | | **46.0 / 100** | **Overall coverage: Medium-High** | |

### Confidence and coverage statement

- **High confidence (independently measured, reproducible):** planet/moon/Lambert accuracy vs **live**
  Horizons; REBOUND units and invariants; reachability (from sourcemaps); all checksums; typecheck/test/build/
  audit/coverage; security probes against a live server; memory flatness; the 1,499-request fan-out.
- **Medium confidence:** solar-model classification (read + constants checked, no observational comparison);
  MGA search quality (read, partially exercised).
- **Low confidence:** **all GPU/rendering performance** — SwiftShader only. The 5.5/10 performance score should
  be re-derived on real hardware before being relied on.
- **Excluded from scoring, not penalised:** TudatPy (optional, absent, correctly reported unavailable).

**For context:** a prior evaluation of `aa6e39a` scored 36/100. The improvement to **46/100** is real —
typecheck errors down 78 %, frontend tests 0 → 100, backend tests 48 → 143, the benchmark made honest, and
several subsystems (planet gate, Lambert, REBOUND contracts, asteroid provenance) are now genuinely good.
The ceiling is held down by the moon defect, zero benchmark coverage, the README/runtime gap, and the
missing licence — all of which are addressable.

---

## 15. Audit limitations and blocked checks

### Blocked (environmental)

| Check | Reason |
|---|---|
| **GPU frame time, draw calls, `renderer.info` geometry/texture growth, DPR 1×/2×/3× comparison, canvas-resize-frequency instrumentation** | No GPU in this environment. SwiftShader software WebGL rendered at ~0.85 FPS, and `page.screenshot()` timed out at 30 s — the app could not be driven interactively fast enough to collect these. **All §9.2 FPS figures are software-rendered and non-representative.** |
| **TudatPy force-model verification** | `tudatpy` is not installed (conda-only). I verified the *capability reporting* is honest (`available: false`, `engine_requested` disclosed) but could **not** confirm whether the configured force models would actually be applied. |
| **`pip-audit` / Python CVE scan** | Not attempted; no Python vulnerability scanner available. §10 S-14 is based on reading `requirements.txt` (unpinned `>=` floors, no lockfile), not a scan. |
| **`claude.ai` MCP connectors (Gmail/Calendar/Drive)** | Require OAuth; this session is non-interactive. Not needed for this audit. |

### Not run (deliberate)

| Check | Reason |
|---|---|
| **Regenerating the 100,000-row asteroid dataset** | Would issue a very large query to JPL SBDB. I had already made ~1,500 Horizons requests; a second bulk job seemed abusive. Provenance was instead verified via the committed metadata + both checksums + a 10-row round-trip against `sample_top_10.json`, all of which passed. |
| **Independent Lambert cross-check against `pykep`/`poliastro`** | Not installed; I substituted my **own** independent universal-variable propagator plus a textbook Hohmann comparison (§8.1), which is weaker than a second library but stronger than self-consistency. |
| **Flyby v∞-magnitude conservation and body-specific periapsis constraints** | The MGA path was exercised end-to-end but I did not extract per-flyby incoming/outgoing v∞ vectors to assert conservation. **This is the largest unclosed gap in the mission-design assessment.** |
| **Threadpool-exhaustion DoS end-to-end** | My 45-concurrent-request attempt was defeated by the ephemeris cache (I had already warmed that exact key). The 1,499-sample fan-out and the missing timeout wrapper are both **proven**; the resulting server-wide exhaustion is **inferred from the code**, not demonstrated. |
| **axe-core accessibility scan, keyboard-only traversal, responsive layouts (390×844 / 1280×720)** | The software renderer made interactive driving impractical. §9.6 is a static DOM audit only. |
| **Full enumeration of which `src/assets/textures` files load at runtime** | Partially checked (`src/textures.ts` is reachable, build emits assets). R-12 is therefore only partly refuted. |
| **Long-horizon REBOUND energy drift** | `energy_error` re-baselines on every seek (F-28), so a true long-run drift measurement needs a continuous multi-hour integration. Not attempted. |
| **`scripts/fetch_jpl_nbody_ephemeris.py --check` end-to-end** | `--help` verified; the full live check against DE440 GM kernels was not run. |

### Method caveats

- Everything ran in a **detached worktree** at `ec7ad33`, not the user's working copy. Untracked files present
  in the user's tree (8 `agent-notes/`/`my-notes/` documents) were **not** part of the audited snapshot.
- `scripts/update-moons-data.mjs` **modified the worktree** during script testing (it ignores `--help`); this
  was restored via `git checkout --` and is itself reported as **F-17**.
- Per the brief, historical documents in `agent-notes/` were consulted **only after** independent conclusions
  were formed. `ec7ad33` ("docs: reconcile issue reports with current fixes") was checked: `git show --stat`
  confirms it added **811 lines across 4 `agent-notes/` files and touched no source**, so it does not
  overstate fixes in code.
- **This audit was conducted single-threaded.** A planned 18-agent parallel fan-out (15 dimension auditors +
  3 completeness critics, each adversarially verified by 3 independent refuters) failed instantly on an API
  session limit with **zero tool calls executed**. Every finding above was therefore produced and verified by
  one auditor. The adversarial-refutation pass the design called for **did not happen** — §6.4 records the
  hypotheses I actively refuted, but the surviving findings have not been independently attacked. Treat
  single-source findings accordingly; all of them carry a reproduction command so they can be re-checked.

---

## Appendix A — Reproducing the headline measurements

```bash
# Environment (no node/npm on this host)
curl -sSL -o node.tar.xz https://nodejs.org/dist/v22.22.1/node-v22.22.1-linux-x64.tar.xz
tar xf node.tar.xz && export PATH=$PWD/node-v22.22.1-linux-x64/bin:$PATH
python3.12 -m venv venv && venv/bin/pip install -r backend/requirements.txt httpx   # httpx undeclared

# Baseline
npm ci && npm run typecheck            # 280 errors, exit 2
npx vite build --outDir /tmp/dist --sourcemap
npm test                               # 100 pass
cd backend && ../venv/bin/python -m pytest -q   # 143 pass

# Reachability: 33 of 72 src files
node -e 'const fs=require("fs"),p="/tmp/dist/assets";const s=new Set();
for(const f of fs.readdirSync(p).filter(x=>x.endsWith(".map")))
  JSON.parse(fs.readFileSync(p+"/"+f)).sources.filter(x=>x.includes("/src/"))
    .forEach(x=>s.add(x.replace(/^.*\/src\//,"src/")));
console.log(s.size, [...s].sort().join("\n"));'

# Only backend endpoint in the bundle
grep -o "/solar/physics\|/ws/sim\|/trajectory/[a-z]*\|/mission/[a-z]*\|/benchmark/[a-z]*" /tmp/dist/assets/index-*.js | sort | uniq -c

# F-01: Moon vs live Horizons  (301 relative to 500@399, ecliptic ICRF, KM-S)
curl -s "https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='301'&EPHEM_TYPE=VECTORS\
&CENTER='500@399'&REF_PLANE=ECLIPTIC&REF_SYSTEM=ICRF&VEC_TABLE=2&OUT_UNITS=KM-S&TLIST=2453371.0&TLIST_TYPE=JD"
#   → compare against the catalog moon propagated to JD 2453371.0  ⇒ 745,623 km

# F-03: outbound fan-out per /trajectory/plan
cd backend && ../venv/bin/python -c "
import sys; sys.path.insert(0,'.')
from data.bodies import ALL_BODIES
from mission.ephemeris_service import EphemerisService
from trajectory.planner import plan_interplanetary_route
n=[0]; o=EphemerisService._sample_kepler
EphemerisService._sample_kepler=lambda s,b,j:(n.__setitem__(0,n[0]+1), o(s,b,j))[1]
plan_interplanetary_route(ALL_BODIES,from_id='earth',to_id='jupiter',departure_jd=2461025.5,
  objective='min_distance',max_assists=2,assist_pool=None,ephemeris_provider='kepler',prograde=True)
print(n[0],'ephemeris samples')"      # → 1499

# F-07: WebSocket accepts a forged Origin
../venv/bin/python -c "
import asyncio,json,websockets
async def m():
    async with websockets.connect('ws://127.0.0.1:8042/ws/sim',
        additional_headers={'Origin':'https://evil.example.com'}) as ws:
        print(json.loads(await ws.recv())['type'])
asyncio.run(m())"                      # → connected

# F-06 / benchmark integrity (all 9 checksums + CSV/JSON agreement)
curl -s localhost:8042/benchmark/accuracy | python -m json.tool | head -20
```

---

*Report generated 2026-09-07 against commit `ec7ad33a503da3a4c6bfd87e4c498e8a53be6984`.
All builds, servers, environments, screenshots and regenerated data were produced in a disposable worktree;
no tracked file in the repository was modified.*
