# Sun Model Lab (Sun-Focus branch)

A Sun-focused browser visualization of the solar system, with local orbital propagation, procedural Sun and planet visuals, asteroid/Kuiper belts, and experimental AGN displays. An optional Python backend provides synthetic solar-state data and separate N-body, trajectory, mission and benchmark APIs. The default page does not expose planner panels or the retained nearby-system, satellite and cloud interfaces.

## Highlights

- **Sun + 8 planets + Pluto** with axial tilt, spin, and major-body search/focus controls
- **424-moon source catalog** from the NASA/JPL satellite mean-elements table, retained for provenance and offline tooling; the shipped entry does not load moon ephemerides, render moons, or send moons to the model worker (`showMoons` in `src/main.ts` is fixed to `false`)
- **Synthetic Sun visualization** with physically inspired surface, corona, flare, magnetic-field and solar-wind layers; these are models, not a calibrated observation reconstruction
- **SMBH/AGN experiments** with transient timelines and exotic hypothesis-model displays
- **Adjustable simulation clock** with pause, reverse, time-warp, and a Now control
- **6,000 procedural background stars**, rather than catalog proper-motion or survey-sky rendering
- **Asteroid belt** targeting 50,000 displayed objects from an accepted Phase 1 subset of up to 100,000 source rows, with deterministic procedural fallback
- **5,000-object Kuiper field** including binary companions

Catalog-star proper motion, nearby-system navigation, Earth satellites/clouds, Oort-related UI/update hooks and planner interfaces remain repository modules/assets, not enabled features of this entry. Backend APIs are described separately below.

## Current TypeScript Status

- `src` is fully TypeScript-native; legacy `.js` shim/re-export files have been removed from the frontend/runtime tree.
- All `// @ts-nocheck` directives have been removed across the entire `src` tree. Strict type checking is now active on every source file.
- Type annotations have been added to simulation, rendering, solar-feature, planetary-feature, and asteroid-pipeline modules. Remaining files still require explicit type definitions for full compile-time safety.
- The browser runtime is driven from [`src/main.ts`](src/main.ts) with solar-system model propagation in [`src/workers/modelWorker.ts`](src/workers/modelWorker.ts). The retained satellite worker is not connected to this entry.
- Small-body data tooling includes compact binary pack/read utilities in [`src/data/asteroidCatalogLoader.ts`](src/data/asteroidCatalogLoader.ts). The phase-1 runtime loader now supports algorithm-aware checksum verification (SHA-256 via WebCrypto, FNV-1a fallback) and parallelized binary+metadata fetching.
- Ongoing hardening: replacing implicit `any` types with concrete interfaces across app, rendering, and feature modules.

## Quick Start

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal.

This standalone command runs the browser simulation without starting the optional
backend. Backend requests default to the page's own origin (for example,
`http://localhost:5173`), not port 8042; unavailable services leave the local
simulation running with explicitly reported fallback data. For both processes,
use `npm run dev:full`, or set the explicit backend origin as shown below.

### CLI resolution overrides

```bash
npm run dev:ui -- --width 2560 --height 1440 --render-scale 1.25 --max-pixel-ratio 2.5
```

### Full-stack dev (frontend + backend)

```bash
npm run dev:full
```

The unified launcher binds both processes to `127.0.0.1`. A non-loopback
`--host` is rejected unless `SOLAR_SECURITY_PROFILE=network`; the backend then
also requires `SOLAR_PHYSICS_API_KEYS` at startup.
The launcher supplies `VITE_BACKEND_ORIGIN` from the selected backend host/port
unless you explicitly set it yourself.

## Backend (optional)

The shipped frontend always propagates the planets in-browser (**Local
(Keplerian)** model). The backend adds, over HTTP, the solar physics route
that drives the Sun model and the trajectory, mission and benchmark APIs. It
also serves a WebSocket N-body simulation engine, but the current entry UI
has no engine selector or Connect control for it: that engine is reachable
through the `SimulationClient` class and the WebSocket API below, not
through the shipped page.

`SimulationClient` status: **API/library-only; not integrated into the default UI.**
The client, its protocol tests, and the backend repairs are retained. Starting
the backend does not activate N-body simulation in the page. Either retiring
the client or adding an opt-in N-body UI requires a separate, explicit product
decision and a scoped implementation/acceptance plan. See the
[scope decision and verification boundaries](agent-notes/CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-10.md#simulationclient-scope-decision--2026-10-17).

| Engine | Description | Reachable from the shipped UI |
|---|---|---|
| Local (Keplerian) | No backend required; two-body element propagation in-browser | Yes (always on) |
| REBOUND N-body | IAS15 adaptive integrator via FastAPI/WebSocket | No; API/library only |
| TudatPy | Conda-based engine; falls back to REBOUND if unavailable | No; API/library only |

### Starting the backend

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn server:app --host 127.0.0.1 --port 8042 --reload --no-proxy-headers --ws-max-size 16384
```

In a second terminal at the repository root, explicitly point standalone Vite
at that backend:

```bash
VITE_BACKEND_ORIGIN=http://127.0.0.1:8042 npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

`VITE_BACKEND_ORIGIN` must be an HTTP(S) origin without a path, query, credentials
or fragment. Nondefault backend ports are supported. Cross-origin deployments
must allow the exact frontend origin through backend `SOLAR_CORS_ALLOWED_ORIGINS`;
setting the frontend variable does not widen the backend CORS policy. For a
same-origin reverse-proxy deployment, leave the variable unset and route backend
API paths on the frontend origin. Vite embeds the variable at build time, so set
it for `npm run build` too when deploying a separate backend origin. See
[Frontend configuration](docs/frontend-configuration.md) for the full contract.
With the backend available, the Sun chip reports its solar model source/status.
Trajectory and mission services are available through their APIs; starting the
backend does not add planner panels to the page.

The default `SOLAR_SECURITY_PROFILE=local` keeps solar endpoints available
without a key and should stay bound to loopback. To expose the backend on a
network, explicitly set `SOLAR_SECURITY_PROFILE=network`, provide one or more
comma-separated `SOLAR_PHYSICS_API_KEYS`, configure exact
`SOLAR_CORS_ALLOWED_ORIGINS`, and pass a non-loopback host to Uvicorn without
`--reload`. Network profile startup fails closed when no API key is configured,
and its default browser CORS policy is deny-all. Forwarded client addresses are
accepted only from `SOLAR_TRUSTED_PROXY_CIDRS`; otherwise the immediate socket
peer is used for rate limiting. Keep Uvicorn proxy-header rewriting disabled so
the application can verify that immediate peer itself.

Solar rate-limit identity stores have fixed memory ceilings and TTL expiry.
Under more simultaneous valid peer identities than the configured ceiling,
the least-recently-used identity is evicted; this is memory containment, not a
replacement for an edge rate limiter in a network deployment.
`SOLAR_SECURITY_PROFILE` covers the solar HTTP endpoints in this tranche; it
does not add route-wide authentication or replace production TLS/proxy policy.

### WebSocket tuning

The optional N-body WebSocket API accepts query parameters:

- `fps` — simulation thread target rate
- `stream_hz` — outbound state update rate

### Health and diagnostic endpoints

```bash
curl http://127.0.0.1:8042/health
curl http://127.0.0.1:8042/info
curl http://127.0.0.1:8042/bodies
curl http://127.0.0.1:8042/trajectory/capabilities
curl http://127.0.0.1:8042/mission/capabilities
curl http://127.0.0.1:8042/benchmark/accuracy
curl http://127.0.0.1:8042/solar/physics
curl http://127.0.0.1:8042/solar/realtime
```

## Project Structure

Inventory of active and retained modules; this is not a live wiring diagram.
Not every module or asset below is imported by the shipped entry.

```
├── src/
│   ├── main.ts                                # Application entry point
│   ├── constants.ts                           # Shared constants (AU, scale factors, utilities)
│   ├── textures.ts                            # Texture path definitions
│   ├── sunController.ts                       # Sun lifecycle orchestration
│   ├── style.css
│   ├── data/
│   │   ├── planets.ts                         # Planet orbital elements + metadata
│   │   ├── moons.json                         # 424-moon catalog (JPL SSD)
│   │   ├── moonEphemerisChebyshev.json         # Validated Horizons fits for corrected moons
│   │   ├── stars_catalog.json                 # Background star catalog
│   │   ├── asteroidCatalogLoader.ts           # Phase 1 asteroid data loader
│   │   ├── asteroidCatalogBinaryFormat.md     # Binary catalog format specification
│   │   └── asteroidTaxonomyResolver.ts        # Asteroid taxonomy + color mapping
│   ├── sim/
│   │   ├── orbitMath.ts                       # Kepler solver, coordinate transforms
│   │   ├── moonEphemeris.ts                    # Fitted moon-state interpolation/validation
│   │   ├── sourceFrameOrbit.ts                 # Native Laplace/equatorial propagation
│   │   ├── solarSystemModel.ts                # Canonical solar system model
│   │   ├── catalog.ts                         # Body catalog utilities
│   │   ├── asteroidBelt.ts                    # Asteroid belt element generation
│   │   ├── kuiperBelt.ts                      # Kuiper belt + binary KBO pipeline
│   │   ├── phase1AsteroidCatalog.ts           # Phase 1 real-data asteroid catalog
│   │   └── asteroids/                         # Asteroid pipeline + shaders
│   │       ├── asteroidDistributions.ts       #   Size/taxonomy/family distributions
│   │       ├── asteroidGeometry.ts            #   Instanced mesh generation
│   │       ├── asteroidPipeline.ts            #   Central simulation pipeline
│   │       └── asteroidShaders.ts             #   GPU vertex/fragment shaders
│   ├── frontend/
│   │   ├── app/
│   │   │   ├── sceneSetup.ts                  # Three.js scene, renderer, lights
│   │   │   ├── bodyManager.ts                 # Celestial body lifecycle
│   │   │   ├── animationLoop.ts               # Render + simulation tick loop
│   │   │   ├── cameraController.ts            # Focus, follow, clip-plane logic
│   │   │   ├── textureManager.ts              # Texture load, cache, fallback
│   │   │   ├── stateStore.ts                  # Application state
│   │   │   ├── inputHandler.ts                # Keyboard / mouse / touch
│   │   │   ├── timeController.ts              # Simulation clock controls
│   │   │   ├── labelSystem.ts                 # Camera-relative 3D label rendering
│   │   │   ├── simulationClient.ts            # Backend WebSocket client
│   │   │   ├── plannerController.ts           # Trajectory planner UI bridge
│   │   │   ├── routeRenderer.ts               # Transfer-arc visualization
│   │   │   ├── uiBindings.ts                  # DOM ↔ state bindings
│   │   │   ├── localSystemRenderer.ts         # Local solar system renderer
│   │   │   └── nearbySystemsRenderer.ts       # Nearby star systems renderer
│   │   ├── camera/
│   │   │   └── transitions.ts                 # Smooth camera transitions
│   │   ├── features/
│   │   │   ├── asteroids/
│   │   │   │   └── beltRenderer.ts            # Instanced asteroid belt renderer
│   │   │   ├── planetary/                     # Clouds, terrain, satellites, moon textures,
│   │   │   │   │                              #   visual profiles
│   │   │   ├── solar/                         # Sun visuals, flares, magnetics, corona,
│   │   │   │   │                              #   prominences, wind, GW visualization,
│   │   │   │   │                              #   observation textures, feature blending,
│   │   │   │   │                              #   solar physics client
│   │   │   ├── superluminal-modeling/         # SMBH/AGN shockwave engine,
│   │   │   │   │                              #   propagation, warp slipstream visuals
│   │   │   └── trajectory/                    # Local patched-conic planner
│   │   │       ├── index.ts                   #   Trajectory feature exports
│   │   │       └── localPlanner.ts            #   Local trajectory computation
│   │   └── rendering/
│   │       ├── milkyWay.ts                    # Milky Way background layer
│   │       ├── orbitRenderer.ts               # Orbit-line drawing
│   │       └── lodManager.ts                  # Level-of-detail management
│   ├── workers/
│   │   ├── modelWorker.ts                     # Off-thread body propagation (shipped entry sends planets only)
│   │   └── modelWorkerContract.ts             # Worker message contract (Float64 transport)
│   └── assets/textures/                       # Planet day maps, normals, clouds, relief
├── backend/
│   ├── server.py                              # FastAPI entry point
│   ├── requirements.txt
│   ├── sim/
│   │   ├── __init__.py                        # Sim package + engine registry
│   │   ├── base.py                            # Abstract engine base class
│   │   ├── contracts.py                       # API data contracts
│   │   ├── rebound_nbody.py                   # REBOUND IAS15 integrator
│   │   ├── tudatpy_hooks.py                   # TudatPy integration
│   │   ├── solar_physics.py                   # Synthetic solar corona model
│   │   ├── solar_realtime_data.py             # SDO/AIA, SWPC, SILSO ingestion
│   │   ├── kuiper.py                          # Kuiper belt physics + binary KBOs
│   │   ├── radiation_pressure.py              # SRP, Poynting-Robertson, Yarkovsky
│   │   └── galactic_tide.py                   # Heisler-Tremaine galactic tidal field
│   ├── trajectory/                            # Lambert solver, MGA optimizer, planner
│   ├── mission/                               # Multi-agent mission planner + services
│   ├── benchmark/                             # Accuracy benchmarks + calibration protocol
│   ├── data/                                  # Body definitions, nearby systems catalog
│   └── tests/                                 # Contract, regression and benchmark tests
├── public/
│   ├── data/asteroid-phase1/                  # Phase 1 asteroid catalog data files
│   ├── textures/moons/                        # Moon texture assets
│   └── solar-systems/manifests/               # Nearby system JSON manifests
├── scripts/
│   ├── update-moons-data.mjs                  # Refresh moon catalog from JPL
│   ├── generate_moon_ephemeris.py              # Rebuild/validate fitted Horizons artifact
│   ├── ingest-moon-textures.mjs               # Download moon texture assets
│   ├── run-ui-dev.mjs                         # Dev server with CLI resolution args
│   ├── dev-full.mjs                           # Full-stack dev launcher
│   ├── build_asteroid_phase1_dataset.py       # Build Phase 1 asteroid real-data catalog
│   ├── fetch_gaia_catalog.py                  # Gaia DR3 star catalog fetcher
│   ├── fetch_jpl_sbdb.py                      # JPL Small-Body Database fetcher
│   ├── fetch_utils.py                         # Shared HTTP/cache utilities
│   └── asteroid/                              # Asteroid catalog fetcher utilities
├── index.html                                 # Main HTML shell with UI controls
├── package.json                               # Vite + Three.js + TypeScript
└── tsconfig.json
```

## Features

### Time controls

Pause/resume, reverse/forward time, adjustable warp speed, and jump to present date.

### Display options

- Orbit lines and labels
- Solar magnetic-field visualization
- Visual versus realistic body scale
- Camera focus, orbit, zoom and reset controls

### Explorer

Search and focus the major bodies rendered by the page. A catalog entry or retained manifest does not by itself make an object rendered or navigable.

### Planet visuals

- **Earth and Mars**: procedural quadtree surfaces with distance-based detail
- **Moon assets (dormant)**: albedo + relief maps and LOD code are present, but the shipped entry does not load or render them
- **Other planets and Pluto**: colored sphere materials
- Axial tilt and spin use the rendered bodies' orientation metadata

Retained day maps and cloud/satellite modules are not assembled by this entry. The page also has no Saturn-ring or oblate-body assembly. Repository assets and alternative renderers are not a claim that the page displays them.

### Solar model

The Sun combines procedural rendering and synthetic solar-state models inspired by published solar literature. Supported layers include limb darkening, blackbody color, granulation, chromosphere, corona, prominences, flares/CMEs, magnetic-field geometry and a Parker-spiral visualization, subject to their runtime admission gates. These descriptions do not certify calibrated physical accuracy for every layer.

Solar forcing is currently synthetic. `hybrid` falls back with `disabled_unvalidated`; `data_driven` is rejected with HTTP 503 (`solar_observed_input_unavailable`). Realtime feeds supply context/source metadata. The AIA proxy supplies raw viewport imagery that is not eligible for Sun-surface rendering. The channel selector does not bypass the validated surface/forcing contracts or enable observation-texture blending.

### SMBH shockwave modeling

Experimental visualization of supermassive black hole transient hypotheses, not a validated prediction of their effects:

- AGN warp-wave engine modeling Sgr A* and nearby AGN (Centaurus A, Maffei 1)
- SMBH propagation physics with compound transient fronts (EM, GW, UHECR)
- Metric frame-dragging slipstream visualization
- Physics constants sourced from published astrophysics literature

### Retained nearby-system modules (not integrated)

Nearby-system catalogs, JSON manifests, proper-motion utilities and renderer/navigation modules are retained for separate use. They are not connected to the default page, which displays procedural background stars. Names in these catalogs do not imply a complete or scientifically validated multi-star-system representation.

### Asteroid belt

- Target of 50,000 displayed asteroids; the Phase 1 loader reads at most 100,000 source rows
- Phase 1 data is accepted only through the existing integrity/admission gates; deterministic procedural generation remains the fallback
- Shared instanced irregular geometry and GPU elliptic orbit propagation
- No shipped adaptive close-up, asteroid-worker or Sun/Jupiter/Saturn detail-force path; those retained interfaces are not evidence of active perturbation physics

### Kuiper belt

- A 5,000-object field with named entries and a procedural remainder, using element-driven orbits
- Binary companions propagated with the field when the simulation date changes
- The separate backend Kuiper engine is not connected to this page

The generated population and binary assumptions are visualization models, not a complete measured catalog or a validation of every mutual orbit.

### Trajectory APIs and retained frontend library

The backend provides direct-transfer and multi-leg gravity-assist planning, including `POST /trajectory/lambert` and `POST /trajectory/porkchop`. Retained frontend planner and patched-conic fallback modules are not connected to the default page; no planner panels or transfer-arc display are enabled there.

### Mission planner API

- `POST /mission/plan` orchestrates TrajectoryAgent, MiningAgent, LogisticsAgent, and VerifierAgent
- Includes explainability logs, payload-return closure, and Monte Carlo risk envelopes

### Benchmark API

- `GET /benchmark/accuracy` runs reference scenarios
- `POST /benchmark/accuracy/report` writes a markdown report

### Solar physics API

- `GET /solar/physics` — synthetic solar state; `hybrid` reports `disabled_unvalidated`, and `data_driven` returns HTTP 503
- `GET /solar/realtime` — live ingested solar context and source health
- `GET /solar/realtime/aia-tile` — raw viewport AIA tile, not eligible for Sun-surface texture blending

## Data Model

- Browser planetary positions use JPL's fitted approximate-element model and
  secular rates. These are visualization-grade approximations, not osculating
  initial conditions for an interacting N-body integration.
- The REBOUND backend starts at JD 2451545.0 TDB from committed geometric JPL
  Horizons Cartesian vectors in the ecliptic J2000/ICRF orientation. It uses
  exact DE440 GM ratios: Earth (`399`) and a hidden Moon (`301`) are separate
  active particles; Mars through Pluto use planetary-system barycenters (`4`–`9`)
  because their moons are not integrated.
- REBOUND output is recentered to the integrated particle barycenter. The input
  JPL SSB frame, output frame, target IDs, fixture version, and approximate
  massless small-body coverage are disclosed in `force_models.initial_conditions`.
- REBOUND Julian dates are TDB, declared as `jd_time_scale: "TDB"`; WebSocket
  `set_julian_date` commands must include the matching scale instead of silently
  treating browser/Unix UTC dates as ephemeris time.
- The 424-moon inventory and approximate fallback elements come from the JPL SSD satellite
  mean-element tables. The repository retains native-frame fallback propagation and committed
  parent-relative JPL Horizons fits for Titan, Iapetus, Phoebe, and Cordelia as offline data and
  validation machinery. The shipped entry does not load those ephemerides or propagate/render
  moon states.
- Planet entries include axial-tilt, spin-period, and ecliptic pole-longitude metadata for visual spin/orientation.
- Star catalog derived from d3-celestial star catalog data, with optional Gaia DR3 enrichment.

Refresh moon data:

```bash
npm run update:moons
```

Regenerate or independently re-check the fitted moon ephemeris (uses the JPL Horizons API and an
external temporary response cache):

```bash
npm run generate:moon-ephemeris
npm run verify:moon-ephemeris
```

Ingest moon textures:

```bash
npm run ingest:moon-textures
```

Fetch enriched star catalog (Gaia DR3):

```bash
python scripts/fetch_gaia_catalog.py
```

Preview legacy JPL SBDB additions (may populate query caches, but does not write catalog sources):

```bash
python scripts/fetch_jpl_sbdb.py --dry-run
```

Append mode requires both `backend/data/bodies.py` and the removed `src/data/planets.js`, so it is unavailable in the current checkout and fails before cache setup or provider requests. It does not target `planets.ts`. Use the separate supported Phase 1 dataset workflow below for the rendered asteroid catalog.

Verify the committed REBOUND initial states and off-epoch accuracy fixtures
against live JPL Horizons and the pinned DE440 GM kernel:

```bash
python scripts/fetch_jpl_nbody_ephemeris.py --check
```

Use `--write` only when intentionally reviewing an upstream ephemeris update.

Build Phase 1 asteroid dataset:

```bash
npm run phase1:asteroid-dataset
```

## Physics Notes and Limitations

- Frontend orbital propagation uses Keplerian two-body elements (parent-body centered), not a full N-body integrator.
- Optional backend REBOUND/TudatPy modes provide higher-fidelity integrations for major bodies. REBOUND's `high` designation is scoped to the default, accuracy-gated IAS15 integrator; WHFast and Mercurius are reported as `normal`. REBOUND remains a reduced Newtonian model, not a replacement for DE441: relativity, most asteroids, outer-system satellites, and extended-body terms are outside its present force model.
- Retained satellite propagation uses TLE-derived Kepler elements and optional J2 terms; it is not activated by this entry.
- The retained NASA GIBS cloud pipeline is not connected to the page and is not numerical weather-prediction assimilation.
- Retained gravity-vector UI/update hooks do not imply a shipped gravity-vector display.
- The retained fitted moon ephemerides are validated only inside their declared 2000–2050 JDTDB
  coverage. They and the visualization-grade mean-element fallbacks are not activated by the
  current shipped entry because moon state propagation and rendering are disabled there.
- The shipped asteroid display uses elliptic element propagation, not close-up N-body perturbations.
- Backend gravity-assist planning uses Lambert legs with hard-constrained flyby turn feasibility; the retained frontend fallback is patched-conic and not integrated into this page.
- Retained transfer-arc rendering is not a finite-burn trajectory integrator or an active page feature.
- Retained Oort UI/update hooks are not connected to the page.
- Literature-inspired solar and AGN models are visualization/hypothesis tools. Separate radiation-pressure and galactic-tide modules are not evidence of those effects in the shipped local propagation.
- Solar state remains synthetic, and raw AIA viewport imagery is ineligible for surface blending. Upstream availability or a channel selection does not open the validated observed-input gates.
- The default browser display uses elliptic element propagation; it is not a general hyperbolic-comet propagator. Backend solvers and retained modules have separate contracts.

## Data Sources

Repository inputs/assets, not a promise that every asset is currently rendered.
Provenance does not itself establish redistribution permission; see `NOTICE.md`.

| Asset | Source |
|---|---|
| Moon orbital elements | NASA/JPL SSD satellite element table |
| Planet textures (2K) | Solar System Scope texture pack |
| Earth / Moon base textures | three.js planetary texture set |
| Mars relief | USGS / MOLA |
| Star catalog | d3-celestial star catalog (reduced), optional Gaia DR3 enrichment |
| Asteroid catalog (Phase 1) | JPL Small-Body Database (SBDB) |
| Survey Milky Way texture | NASA/JPL 2MASS all-sky (PIA04250), remapped to equirectangular |
| Earth clouds | NASA GIBS WMS |
| Satellite TLEs | CelesTrak |
| Solar observation textures | NASA SDO/AIA via Helioviewer |
| Solar activity data | NOAA SWPC, SILSO |

## Tech Stack

| Layer | Technology |
|---|---|
| 3D engine | [Three.js](https://threejs.org/) r182 |
| Build tool | [Vite](https://vite.dev/) 7 |
| Test runner | [Vitest](https://vitest.dev/) |
| Language | TypeScript |
| Backend | [FastAPI](https://fastapi.tiangolo.com/) + WebSocket |
| N-body integrator | [REBOUND](https://rebound.readthedocs.io/) (IAS15) |
| Optional integrator | [TudatPy](https://docs.tudat.space/) |

## Build

```bash
npm run build
npm run preview
```

## Type checking

```bash
npm run typecheck
```

## Backend Tests

The runtime requirements alone cannot collect the suite: Starlette's
`TestClient` needs `httpx`, which `backend/requirements.txt` deliberately does
not ship. Use the pinned test environment that CI uses (Python 3.12):

```bash
python -m pip install -r ci/backend-test-requirements.txt
python -m pytest -q backend/tests
```
