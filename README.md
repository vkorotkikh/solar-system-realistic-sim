# Solar System Mission Lab

A standalone 3D solar system simulator with:

- Sun + all major planets + Pluto
- All planetary satellites from NASA/JPL satellite mean-elements table (424 moons)
- Real-time orbital propagation with adjustable simulation clock
- Catalog-driven background stars + synthetic Milky Way band layer
- Element-driven asteroid belt with adaptive close-up detail refinement
- Kuiper belt particle field and an approximate Oort cloud shell
- Exploration controls to search, focus, and follow bodies
- Realism locator overlays and gravity-force vector arrows
- Interplanetary route planner for direct and gravity-assist trajectories

## Quick start

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal.

Optional UI/render resolution control via CLI args:

```bash
npm run dev:ui -- --width 2560 --height 1440 --render-scale 1.25 --max-pixel-ratio 2.5
```

## Backend variants

The UI supports three simulation modes in the `Simulation Engine` dropdown:

- `Local (Keplerian)`: no Python backend required.
- `REBOUND N-body (Python)`: high-fidelity N-body server via FastAPI/WebSocket.
- `TudatPy (Python, normal fidelity)`: optional conda-based engine; if unavailable, the server falls back to REBOUND.

Start backend server:

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn server:app --host 0.0.0.0 --port 8042 --reload
```

Optional backend stream tuning from frontend WebSocket query:
- `fps` (simulation thread target rate)
- `stream_hz` (outbound state update rate)

Optional health checks:

```bash
curl http://127.0.0.1:8042/health
curl http://127.0.0.1:8042/info
```

Then in the frontend, choose `REBOUND` or `TudatPy` and click `Connect`.

## Data model

- Planetary orbital elements use J2000 mean element values.
- Moon orbital elements are sourced from JPL SSD: `https://ssd.jpl.nasa.gov/sats/elem/`.
- Non-ecliptic moon element frames are normalized into an ecliptic approximation at catalog-build time.
- Planet entries include axial-tilt and spin-period metadata for visual spin/orientation.
- Moons can be refreshed with:

```bash
npm run update:moons
```

## Features

- `Time` panel: pause/resume, reverse/forward time, jump to present date.
- `Display` panel:
  - toggle orbit lines, labels, moons, asteroid belt, Kuiper belt, Oort cloud
  - switch Milky Way appearance between standard, enhanced, and survey-texture mode
  - toggle realism locators (gold/orange label + down-arrow + halo for tiny bodies)
  - toggle gravity vectors (combined gravitational acceleration direction per massive body)
- `Explorer` panel: search all bodies and focus/follow any selected object.
- Planet visuals:
  - Earth uses 4K day map + 2K normal map + cloud shell
  - Mercury/Venus/Mars/Jupiter/Saturn/Uranus/Neptune use 2K day textures
- Planet orientation:
  - axial tilt and spin rates are now applied to the rendered bodies
- `Trajectory Planner`:
  - `Direct` mode for a baseline transfer (no assists)
  - `Plan Route` for multi-leg trajectories with up to 2 assist flybys
  - Objective options:
    - minimize total travel path
    - maximize gravity-assist gain

## Physics notes and limitations

- Orbital propagation uses Keplerian two-body elements (parent-body centered), not a full N-body integrator.
- Optional backend REBOUND/TudatPy modes provide higher-fidelity integrations for major bodies.
- Gravity vectors are computed from currently modeled massive bodies (objects without mass data are excluded).
- Moon frame normalization for `equatorial`/`Laplace` inputs is an approximation for a unified ecliptic frame.
- Asteroid close-up refinement uses massless test-particle dynamics under Sun/Jupiter/Saturn perturbations.
- Gravity-assist planning uses patched-conic style approximations for route scoring and assist turn feasibility.
- Transfer arcs are visualized as smooth trajectory curves for exploration; they are not full Lambert-optimized trajectories.
- Oort cloud is an approximate synthetic shell population intended for navigation context.

## Data Sources

- Moon elements: NASA/JPL SSD satellite element table.
- Planet textures (2K set): Solar System Scope texture pack (used for local assets in `src/assets/textures`).
- Earth/Moon base textures: three.js planetary texture set.
- Star catalog (`src/data/stars_catalog.json`): reduced dataset derived from d3-celestial star catalog data.
- Survey Milky Way texture (`src/assets/textures/milky_way_2mass_equirect_4096.jpg`): derived from NASA/JPL 2MASS all-sky data (PIA04250), remapped from Mollweide to equirectangular for sky-sphere rendering.

## Build

```bash
npm run build
npm run preview
```
