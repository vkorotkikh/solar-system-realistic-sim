# Solar System Mission Lab

A real-time 3D solar system simulator and mission-design workbench running entirely in the browser, with an optional Python backend for high-fidelity N-body physics and trajectory planning.

## Highlights

- **Sun + 8 planets + Pluto** with axial tilt, spin, and per-planet visual profiles
- **424 moons** sourced from the NASA/JPL satellite mean-elements table
- **Adjustable simulation clock** with pause, reverse, time-warp, and jump-to-date
- **Catalog-driven background stars** with proper-motion propagation and synthetic Milky Way band
- **Nearby star systems** (Alpha Centauri, Barnard's Star, Sirius, etc.) with navigable 3D manifests
- **Asteroid belt** with GPU-propagated Keplerian instance orbits, Jupiter/Saturn perturbation uniforms, and deterministic phase-1 catalog assets
- **Kuiper belt** procedural population with CPU orbit refresh; **Oort cloud** remains placeholder navigation context rather than a mission-grade subsystem
- **Earth satellite layer** (ISS + sampled GEO) with TLE propagation and optional J2 perturbations
- **Real-time Earth clouds** via NASA GIBS WMS tiled pipeline with cache
- **Interplanetary route planner** supporting direct transfers and multi-gravity-assist trajectories
- **Multi-agent mission planner** with trajectory, logistics, mining, and risk analysis

## Current TypeScript Status

- `src` is now fully TypeScript-native; legacy `.js` shim/re-export files have been removed from the frontend/runtime tree.
- The current browser runtime is still mostly driven from the main thread via [`src/main.ts`](/home/nomad/Documents/solar-system-realistic-sim/src/main.ts), with one existing workerized path for satellite propagation.
- Small-body data tooling now includes compact binary pack/read utilities in [`src/data/asteroidCatalogLoader.ts`](/home/nomad/Documents/solar-system-realistic-sim/src/data/asteroidCatalogLoader.ts), but the live runtime ingestion path is not yet unified on that contract.
- The next modernization phase is architectural rather than filename migration: stricter types, worker contracts, frame-budget instrumentation, and targeted offload for orbital model, solar feature logic, SMBH/AGN timelines, and heavy asteroid generation.

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
python -m uvicorn server:app --host 0.0.0.0 --port 8042 --reload
```

Then choose **REBOUND** or **TudatPy** in the frontend and click **Connect**.

### WebSocket tuning

The frontend WebSocket connection accepts query parameters:
- `fps` -- simulation thread target rate
- `stream_hz` -- outbound state update rate

### Health and diagnostic endpoints

```bash
curl http://127.0.0.1:8042/health
curl http://127.0.0.1:8042/info
curl http://127.0.0.1:8042/bodies
curl http://127.0.0.1:8042/trajectory/capabilities
curl http://127.0.0.1:8042/mission/capabilities
curl http://127.0.0.1:8042/benchmark/accuracy
```

## Project Structure

```
├── src/
│   ├── main.ts                         # Application entry point
│   ├── constants.ts                    # Shared constants (AU, scale factors)
│   ├── textures.ts                     # Texture path definitions
│   ├── style.css
│   ├── data/
│   │   ├── asteroidCatalogLoader.ts    # Compact asteroid binary pack/read utilities
│   │   ├── planets.ts                  # Planet orbital elements + metadata
│   │   ├── moons.json                  # 424-moon catalog (JPL SSD)
│   │   └── stars_catalog.json          # Background star catalog
│   ├── sim/
│   │   ├── orbitMath.ts                # Kepler solver, coordinate transforms
│   │   ├── solarSystemModel.ts         # Canonical solar system model
│   │   ├── catalog.ts                  # Body catalog utilities
│   │   ├── phase1AsteroidCatalog.ts    # Current runtime loader for phase-1 asteroid payloads
│   │   └── asteroids/                  # Asteroid belt pipeline + shaders
│   ├── frontend/
│   │   ├── app/
│   │   │   ├── sceneSetup.ts           # Three.js scene, renderer, lights
│   │   │   ├── bodyManager.ts          # Celestial body lifecycle
│   │   │   ├── animationLoop.ts        # Render + simulation tick loop
│   │   │   ├── cameraController.ts     # Focus, follow, clip-plane logic
│   │   │   ├── textureManager.ts       # Texture load, cache, fallback
│   │   │   ├── stateStore.ts           # Application state
│   │   │   ├── inputHandler.ts         # Keyboard / mouse / touch
│   │   │   ├── timeController.ts       # Simulation clock controls
│   │   │   ├── labelSystem.ts          # 3D label rendering
│   │   │   ├── simulationClient.ts     # Backend WebSocket client
│   │   │   ├── plannerController.ts    # Trajectory planner UI bridge
│   │   │   ├── routeRenderer.ts        # Transfer-arc visualization
│   │   │   ├── uiBindings.ts           # DOM ↔ state bindings
│   │   │   ├── localSystemRenderer.ts  # Local solar system renderer
│   │   │   └── nearbySystemsRenderer.ts# Nearby star systems renderer
│   │   ├── camera/
│   │   │   └── transitions.ts          # Smooth camera transitions
│   │   ├── features/
│   │   │   ├── planetary/              # Clouds, terrain, satellites, moon textures
│   │   │   ├── solar/                  # Sun visuals, flares, magnetics, corona
│   │   │   ├── superluminal-modeling/  # SMBH / AGN propagation and event timelines
│   │   │   └── trajectory/             # Local patched-conic planner
│   │   └── rendering/
│   │       ├── milkyWay.ts             # Milky Way background layer
│   │       ├── orbitRenderer.ts        # Orbit-line drawing
│   │       └── lodManager.ts           # Level-of-detail management
│   └── assets/textures/                # Planet day maps, normals, clouds, relief
├── backend/
│   ├── server.py                       # FastAPI entry point
│   ├── requirements.txt
│   ├── sim/                            # REBOUND, TudatPy, Kuiper, solar physics
│   ├── trajectory/                     # Lambert solver, MGA optimizer, planner
│   ├── mission/                        # Multi-agent mission planner + services
│   ├── benchmark/                      # Accuracy benchmarks + calibration protocol
│   ├── data/                           # Body definitions, nearby systems catalog
│   └── tests/                          # 13 pytest modules (contracts, regression, benchmarks)
├── public/
│   ├── data/asteroid-phase1/           # Deterministic phase-1 asteroid catalog artifacts
│   ├── textures/moons/                 # Moon texture assets
│   └── solar-systems/manifests/        # Nearby system JSON manifests
├── scripts/
│   ├── build_asteroid_phase1_dataset.py # JPL SBDB -> phase-1 asteroid artifact builder
│   ├── update-moons-data.mjs           # Refresh moon catalog from JPL
│   ├── ingest-moon-textures.mjs        # Download moon texture assets
│   ├── run-ui-dev.mjs                  # Dev server with CLI resolution args
│   ├── fetch_gaia_catalog.py           # GAIA star catalog fetcher
│   └── fetch_jpl_sbdb.py              # JPL Small-Body Database fetcher
├── index.html                          # Main HTML shell with UI controls
├── package.json                        # Vite + Three.js + TypeScript
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
- Axial tilt and spin rates applied to all rendered bodies
- Oblateness rendering with separate equatorial/polar radii

### Solar model

Custom GLSL shaders for the Sun covering granulation, limb darkening, sunspot fields, and off-limb coronal effects. Feature modules for solar flares, magnetic field visualization, and observation-texture blending with optional real-time data assimilation (SWPC/SILSO/SDO sources).

### Nearby star systems

Navigate to Alpha Centauri, Barnard's Star, Sirius, and other nearby systems rendered from JSON manifests with proper-motion-propagated positions.

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

## Data Model

- Planetary orbital elements use J2000 mean element values.
- Moon orbital elements sourced from JPL SSD (`https://ssd.jpl.nasa.gov/sats/elem/`).
- Non-ecliptic moon element frames normalized into an ecliptic approximation at catalog-build time.
- Planet entries include axial-tilt and spin-period metadata for visual spin/orientation.
- Star catalog derived from d3-celestial star catalog data.
- Deterministic asteroid phase-1 assets are built from JPL Small-Body Database queries and stored under `public/data/asteroid-phase1/`.
- Compact asteroid binary tooling now lives in [`src/data/asteroidCatalogLoader.ts`](/home/nomad/Documents/solar-system-realistic-sim/src/data/asteroidCatalogLoader.ts) with the `ACBF` v1 format documented in [`src/data/asteroidCatalogBinaryFormat.md`](/home/nomad/Documents/solar-system-realistic-sim/src/data/asteroidCatalogBinaryFormat.md).
- The current runtime still uses [`src/sim/phase1AsteroidCatalog.ts`](/home/nomad/Documents/solar-system-realistic-sim/src/sim/phase1AsteroidCatalog.ts) for live loading, so catalog format consolidation remains an active follow-up rather than completed ingestion work.

Refresh moon data:

```bash
npm run update:moons
```

Ingest moon textures:

```bash
npm run ingest:moon-textures
```

Rebuild deterministic asteroid phase-1 data:

```bash
npm run phase1:asteroid-dataset
```

## Physics Notes and Limitations

- Frontend orbital propagation uses Keplerian two-body elements (parent-body centered), not a full N-body integrator.
- Optional backend REBOUND/TudatPy modes provide higher-fidelity integrations for major bodies.
- Earth satellite layer uses TLE-derived Kepler propagation with optional J2 secular perturbations (RAAN, argument of periapsis, mean anomaly rates).
- Real-time Earth cloud mode uses daily products from NASA GIBS; this is near-real-time visualization, not NWP assimilation.
- Gravity vectors are computed from currently modeled massive bodies; objects without mass data are excluded.
- Moon frame normalization for equatorial/Laplace inputs is an approximation for a unified ecliptic frame.
- Main-belt asteroid rendering now has a GPU Kepler solve path with Jupiter/Saturn perturbation uniforms, but deterministic target promotion, family-level taxonomy coverage, and mission-selection infrastructure are still incomplete.
- Kuiper belt objects are still refreshed on the CPU rather than through the main-belt shader propagation path.
- Backend gravity-assist planning uses Lambert legs with hard-constrained flyby turn feasibility; frontend fallback remains patched-conic.
- Transfer arcs in the UI are drawn as smooth visual curves, not numerically integrated finite-burn trajectories.
- Oort cloud support is still placeholder navigation context and should not be treated as a mission-grade long-period small-body simulation.

## Data Sources

| Asset | Source |
|---|---|
| Moon orbital elements | NASA/JPL SSD satellite element table |
| Planet textures (2K) | Solar System Scope texture pack |
| Earth / Moon base textures | three.js planetary texture set |
| Mars relief | USGS / MOLA |
| Star catalog | d3-celestial star catalog (reduced) |
| Survey Milky Way texture | NASA/JPL 2MASS all-sky (PIA04250), remapped to equirectangular |
| Earth clouds | NASA GIBS WMS |
| Satellite TLEs | CelesTrak |
| Deterministic asteroid corpus | NASA/JPL Small-Body Database (phase-1 query/export pipeline) |

## Tech Stack

| Layer | Technology |
|---|---|
| 3D engine | [Three.js](https://threejs.org/) r182 |
| Build tool | [Vite](https://vite.dev/) 7 |
| Language | TypeScript-first frontend/runtime (`src` is TS-native) |
| Backend | [FastAPI](https://fastapi.tiangolo.com/) + WebSocket |
| N-body integrator | [REBOUND](https://rebound.readthedocs.io/) (IAS15) |
| Optional integrator | [TudatPy](https://docs.tudat.space/) |

## Build

```bash
npm run build
npm run preview
```

## Backend Tests

```bash
cd backend
pytest
```
