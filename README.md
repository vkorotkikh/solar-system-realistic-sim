# Solar System Mission Lab

A standalone 3D solar system simulator with:

- Sun + all major planets + Pluto
- All planetary satellites from NASA/JPL satellite mean-elements table (424 moons)
- Real-time orbital propagation with adjustable simulation clock
- Kuiper belt particle field and an approximate Oort cloud shell
- Exploration controls to search, focus, and follow bodies
- Interplanetary route planner for direct and gravity-assist trajectories

## Quick start

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal.

## Data model

- Planetary orbital elements use J2000 mean element values.
- Moon orbital elements are sourced from JPL SSD: `https://ssd.jpl.nasa.gov/sats/elem/`.
- Moons can be refreshed with:

```bash
npm run update:moons
```

## Features

- `Time` panel: pause/resume, reverse/forward time, jump to present date.
- `Display` panel: toggle orbit lines, labels, moons, Kuiper belt, Oort cloud.
- `Explorer` panel: search all bodies and focus/follow any selected object.
- `Trajectory Planner`:
  - `Direct` mode for a baseline transfer (no assists)
  - `Plan Route` for multi-leg trajectories with up to 2 assist flybys
  - Objective options:
    - minimize total travel path
    - maximize gravity-assist gain

## Physics notes and limitations

- Orbital propagation uses Keplerian two-body elements (parent-body centered), not a full N-body integrator.
- Gravity-assist planning uses patched-conic style approximations for route scoring and assist turn feasibility.
- Transfer arcs are visualized as smooth trajectory curves for exploration; they are not full Lambert-optimized trajectories.
- Oort cloud is an approximate synthetic shell population intended for navigation context.

## Build

```bash
npm run build
npm run preview
```
