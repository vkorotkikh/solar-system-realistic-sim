# Sun Model Lab (Sun-Focus branch)

A real-time 3D solar system simulator and mission-design workbench running entirely in the browser, with an optional Python backend for high-fidelity N-body physics, trajectory planning, and data-driven solar observation.

## Highlights

- **Sun + 8 planets + Pluto** with axial tilt, spin, and per-planet visual profiles
- **424 moons** sourced from the NASA/JPL satellite mean-elements table
- **Physics-grounded Sun model** — 13-phase overhaul: Neckel & Labs limb darkening, Planck blackbody color, van de Hulst K-corona, prominences, flares, CMEs, PFSS magnetics, Parker spiral heliosphere, and SDO/AIA observation texture blending
- **SMBH shockwave simulation** — AGN warp-wave engine with Sgr A* transient timeline, Fermi Bubble rendering, and exotic hypothesis modeling
- **Adjustable simulation clock** with pause, reverse, time-warp, and jump-to-date
- **Catalog-driven background stars** with proper-motion propagation and synthetic Milky Way band
- **Nearby star systems** (Alpha Centauri, Barnard's Star, Sirius, etc.) with navigable 3D manifests and seamless zoom transitions
- **Asteroid belt** with element-driven orbits, adaptive close-up detail refinement, and Phase 1 real-catalog pipeline (1.9M particles)
- **Kuiper belt** particle field with binary KBO support and approximate **Oort cloud** shell
- **Earth satellite layer** (ISS + sampled GEO) with TLE propagation and optional J2 perturbations
- **Real-time Earth clouds** via NASA GIBS WMS tiled pipeline with cache
- **Interplanetary route planner** supporting direct transfers and multi-gravity-assist trajectories
- **Multi-agent mission planner** with trajectory, logistics, mining, and risk analysis

## Current TypeScript Status

- `src` is fully TypeScript-native; legacy `.js` shim/re-export files have been removed from the frontend/runtime tree.
- All `// @ts-nocheck` directives have been removed across the entire `src` tree. Strict type checking is now active on every source file.
- Type annotations have been added to simulation, rendering, solar-feature, planetary-feature, and asteroid-pipeline modules. Remaining files still require explicit type definitions for full compile-time safety.
- The browser runtime is driven from [`src/main.ts`](main.ts) with two workerized paths: satellite propagation and solar-system model propagation ([`src/workers/modelWorker.ts`](modelWorker.ts)).
- Small-body data tooling includes compact binary pack/read utilities in [`src/data/asteroidCatalogLoader.ts`](asteroidCatalogLoader.ts). The phase-1 runtime loader now supports algorithm-aware checksum verification (SHA-256 via WebCrypto, FNV-1a fallback) and parallelized binary+metadata fetching.
- Ongoing hardening: replacing implicit `any` types with concrete interfaces across app, rendering, and feature modules.

## Quick Start

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal.

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

## Backend (optional)

The frontend runs standalone in **Local (Keplerian)** mode. For higher-fidelity physics, start the Python backend and switch simulation engines in the UI dropdown.

| Engine | Description |
|---|---|
| Local (Keplerian) | No backend required; two-body element propagation in-browser |
| REBOUND N-body | IAS15 adaptive integrator via FastAPI/WebSocket |
| TudatPy | Conda-based engine; falls back to REBOUND if unavailable |

### Starting the backend

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn server:app --host 127.0.0.1 --port 8042 --reload --no-proxy-headers --ws-max-size 16384
```

Then choose **REBOUND** or **TudatPy** in the frontend and click **Connect**.

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

The frontend WebSocket connection accepts query parameters:
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
│   │   └── asteroidWorker.ts                  # Off-thread asteroid processing
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
│   │   ├── solar_physics.py                   # Solar corona physics model (v3)
│   │   ├── solar_realtime_data.py             # SDO/AIA, SWPC, SILSO ingestion
│   │   ├── kuiper.py                          # Kuiper belt physics + binary KBOs
│   │   ├── radiation_pressure.py              # SRP, Poynting-Robertson, Yarkovsky
│   │   └── galactic_tide.py                   # Heisler-Tremaine galactic tidal field
│   ├── trajectory/                            # Lambert solver, MGA optimizer, planner
│   ├── mission/                               # Multi-agent mission planner + services
│   ├── benchmark/                             # Accuracy benchmarks + calibration protocol
│   ├── data/                                  # Body definitions, nearby systems catalog
│   └── tests/                                 # 14 pytest modules (contracts, regression, benchmarks)
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

- Orbit lines, labels, moons, asteroid belt, Kuiper belt, Oort cloud
- Milky Way appearance: standard, enhanced, or 2MASS survey-texture mode
- Realism locators (gold/orange labels + down-arrow + halo for tiny bodies)
- Gravity vectors (combined gravitational acceleration per massive body)
- Earth satellite layer with optional J2 perturbation model

### Explorer

Search all bodies by name and focus or follow any selected object with smooth camera transitions.

### Planet visuals

- **Earth**: 4K day map, 2K normal map, cloud shell, near-real-time cloud mosaic ingest (NASA GIBS), synthetic terrain displacement, distance-based surface LOD, LEO/GEO guide rings
- **Moon**: albedo + relief maps with LOD
- **Mars**: USGS albedo + MOLA relief textures
- **Mercury, Venus, Jupiter, Saturn, Uranus, Neptune**: 2K day textures
- **Saturn**: ring system
- Axial tilt and spin rates applied to all rendered bodies with correct ecliptic-longitude pole directions
- Oblateness rendering with separate equatorial/polar radii

### Solar model

Physics-grounded G2V stellar model based on peer-reviewed solar literature:

- **Limb darkening** — wavelength-dependent Neckel & Labs 1994 coefficients (R/G/B independent)
- **Blackbody color** — Planck-derived linear sRGB at 5778 K (near-white, not artistic orange)
- **Granulation** — Nordlund-Stein contrast (~22% RMS) with clustered sunspot groups (up to 40 at solar max), penumbral Evershed fibrils, Wilson depression, and facular limb brightening
- **Chromosphere** — Type I + Type II spicule populations with distance-scaled point sizes
- **K-corona** — Baumbach/van de Hulst radial profile out to 4 R☉, helmet streamers, polar/equatorial coronal holes, Fe XIV temperature-gradient coloring
- **Prominences** — catenary arch geometry with Hα emission and eruption animation
- **Flares & CMEs** — GOES Neupert-effect temporal profiles, parameterized CME angular width (20°–120°)
- **PFSS magnetics** — dipole tilt + octupole harmonic, corrected RK4 integration
- **Parker spiral** — bimodal solar wind speed model with polarity-aware color encoding and camera-distance fading
- **Observation textures** — SDO/AIA pipeline with 5 channels (094/171/193/211/304 Å), user-selectable channel or auto mode, backend proxy, confidence-weighted blending
- **Data assimilation** — `synthetic`, `hybrid`, and `data_driven` forcing modes using NOAA SWPC, SILSO, and SDO/AIA feeds

### SMBH shockwave modeling

Simulation of supermassive black hole transient phenomena:

- AGN warp-wave engine modeling Sgr A* and nearby AGN (Centaurus A, Maffei 1)
- SMBH propagation physics with compound transient fronts (EM, GW, UHECR)
- Metric frame-dragging slipstream visualization
- Physics constants sourced from published astrophysics literature

### Nearby star systems

Navigate to Alpha Centauri, Barnard's Star, Sirius, and other nearby systems rendered from JSON manifests with proper-motion-propagated positions. Seamless zoom-in/zoom-out camera transitions between star systems.

### Asteroid belt

- Element-driven orbits with adaptive close-up detail refinement
- Phase 1 real-data pipeline with up to 1.9M cataloged particles
- Seeded PRNG for deterministic generation across sessions
- Off-thread processing via Web Worker to prevent main-thread blocking
- Sun/Jupiter/Saturn perturbation model for detail layer

### Kuiper belt

- Full KBO particle field with element-driven orbits
- Binary KBO support with mutual orbit rendering
- Backend physics module for Kuiper belt dynamics

### Trajectory planner

- **Direct** mode for baseline transfer orbits
- **Plan Route** for multi-leg trajectories with up to 2 gravity-assist flybys
- Objectives: minimize total path or maximize gravity-assist gain
- Solver path: backend Lambert + MGA with hard flyby feasibility constraints; frontend local patched-conic fallback
- Additional backend endpoints: `POST /trajectory/lambert`, `POST /trajectory/porkchop`

### Mission planner API

- `POST /mission/plan` orchestrates TrajectoryAgent, MiningAgent, LogisticsAgent, and VerifierAgent
- Includes explainability logs, payload-return closure, and Monte Carlo risk envelopes

### Benchmark API

- `GET /benchmark/accuracy` runs reference scenarios
- `POST /benchmark/accuracy/report` writes a markdown report

### Solar physics API

- `GET /solar/physics` — current solar state with configurable forcing (`synthetic|hybrid|data_driven`)
- `GET /solar/realtime` — live ingested solar context and source health
- `GET /solar/realtime/aia-tile` — proxied AIA channel tile for observation textures

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
  mean-element tables. Those descriptive elements are not treated as osculating ephemerides.
- Non-ecliptic fallback moons precess entirely in their native Laplace/parent-equatorial frame;
  the resulting parent-relative Cartesian state is then rotated to ecliptic J2000.
- Titan, Iapetus, Phoebe, and Cordelia use a committed parent-relative fit to JPL Horizons
  osculating states over JDTDB 2451545.0–2469807.5 (2000–2050). The artifact records target,
  center, frame, time scale, source hashes, held-out accuracy, and exact-endpoint validation.
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

Fetch expanded asteroid catalog (JPL SBDB):

```bash
python scripts/fetch_jpl_sbdb.py
```

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
- Earth satellite layer uses TLE-derived Kepler propagation with optional J2 secular perturbations (RAAN, argument of periapsis, mean anomaly rates).
- Real-time Earth cloud mode uses daily products from NASA GIBS; this is near-real-time visualization, not NWP assimilation.
- Gravity vectors are computed from currently modeled massive bodies; objects without mass data are excluded.
- Fitted moon ephemerides are authoritative only inside their declared 2000–2050 JDTDB coverage;
  the runtime refuses to replace those four states with known-bad mean-element positions outside
  that interval. Other moons retain a labelled, visualization-grade mean-element fallback.
- Asteroid close-up refinement uses massless test particles under Sun/Jupiter/Saturn perturbations.
- Backend gravity-assist planning uses Lambert legs with hard-constrained flyby turn feasibility; frontend fallback remains patched-conic.
- Transfer arcs in the UI are drawn as smooth visual curves, not numerically integrated finite-burn trajectories.
- Oort cloud is an approximate synthetic shell population for navigation context.
- Sun model physics are grounded in published research; some modules (radiation pressure, galactic tides) require backend REBOUND integration for simulation effects.
- Solar observation textures depend on upstream SDO/AIA data availability; synthetic fallback is always present.
- Kepler solver clamps eccentricity at 0.9999999, preventing near-parabolic and hyperbolic orbit propagation for comets.

## Data Sources

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

```bash
cd backend
pytest
```
