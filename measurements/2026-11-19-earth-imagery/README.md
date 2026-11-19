# 2026-11-19: NASA-imagery Earth, screenshots and startup cost

Branch measured: `feat/earth-nasa-imagery` (Earth from NASA Blue Marble colour, ETOPO 2022
relief shading, a Natural Earth water mask for sun glint, and NASA clouds on a shell).
Baseline: `dfecb4a`, the `main` commit that branch starts from.

## Questions

1. Does the real app, on the real GPU, show the maps placed and lit correctly: day side, sun
   glint, relief at low sun, clouds in both scale modes and at several distances?
2. Does the cloud shell flicker against the ground (its depth buffer is not logarithmic)?
3. What do the four new maps cost at startup (owner rule: preload everything, but measure
   and report the wait)?

## Run

Two Vite dev servers, one per checkout (`npx vite --host 127.0.0.1 --port 5191 --strictPort`
in the branch, port 5192 in the baseline), then from this branch's checkout:

```
node measurements/2026-11-19-earth-imagery/capture.mjs http://127.0.0.1:5191/ measurements/2026-11-19-earth-imagery/captures
node measurements/2026-11-14-preload-cost/startup.mjs before=http://127.0.0.1:5192/ after=http://127.0.0.1:5191/ 5
```

Both use `lib/headless-gpu.mjs`: headless Chromium on the RTX 5090 (ANGLE over Mesa D3D12),
renderer-gated. `capture.mjs` patches the served `main.ts` to expose the simulation state and
camera, pauses the clock at exact UTC times on 2026-03-20 (equinox) and frames body-fixed
latitudes and longitudes. `SHOTS=<regex>` limits a run to matching shots.

## Findings

Screenshots (`captures/`, raw console in `output-capture.txt`; no shader error or
`[surface-maps]` warning in any run):

- `01-day-side-africa`: Africa and Europe sit under the noon Sun at 15 E at 11:00 UTC, as the
  Greenwich fix requires; real continents, no procedural noise.
- `02-glint-pacific`: from the Sun's direction at 22:00 UTC the subsolar point is mid-Pacific
  and shows a soft glint patch; California is at the upper right. The first capture, with the
  glint exponent at 60, showed only a faint brightening, so the exponent went to 160 (a
  patch about 5 deg across, peak about 0.42).
- `03`/`03b` (00:40 UTC, Sun ~3 deg up) and `03c`/`03d` (02:30 UTC, Sun ~30 deg up) over the
  Himalaya, relief on and off (`uNormalReady` switched in the page): the relief map lights
  the sunward ridge faces; at 3 deg the scene is very dark overall, as it should be.
  `himalaya-pair.png` and `check-far-and-morning.png` stack the on/off pairs.
- `04-greenland-ice-low-sun` (09:00 UTC, Sun ~2 deg up): the east-facing half of the ice
  dome is brighter than the west and shows no contour bands, which is what the companded,
  dithered slope encoding is for.
- `05` realistic scale at 3, 1.5 and 1.12 radii; `06` enlarged scale at the same distances;
  `07` realistic at 20 and 60 radii: clouds follow both scale modes and show no flicker or
  holes at any of the eight distances, so the cloud shell needed no polygon offset. Up close
  the 2048 px cloud map (about 20 km per pixel) is soft, as expected.

Startup (`output-startup.txt`): medians of 5 cold-browser runs per arm on Vite dev servers,
real GPU, load average 0.8 at the start and 2.2 at the end (the machine had just rebooted).

| | before (`dfecb4a`) | after | change |
|---|---|---|---|
| First picture | 8,254 ms | 10,553 ms | +2.3 s |
| All surface maps ready | 8,254 ms | 11,661 ms | +3.4 s |
| 30 frames | 8,732 ms | 12,115 ms | +3.4 s |
| Worst frame in the next 8 s | 567 ms | 617 ms | +50 ms |

The four Earth files add 20,967,718 bytes (colour 4.8 MB, relief 14.9 MB, water mask 0.4 MB,
clouds 0.8 MB). Both arms are bimodal run to run (before: 8.0 to 11.3 s maps ready; after:
9.7 to 12.3 s), so treat the medians as a 2 to 3.5 s added wait on this machine, not a
precise figure. Stalls after startup did not grow beyond noise. The relief PNG is the
largest file; a smaller one (for example 4096 px) would cut the wait if it matters.
