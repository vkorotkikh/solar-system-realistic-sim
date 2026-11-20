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

One command rebuilds everything, the report page included. You need a checkout of the branch
to show and one of the commit to compare against, `npm ci` in both and in this lab checkout,
and Node 22 on PATH:

```
measurements/2026-11-19-earth-imagery/run.sh <branch checkout> <baseline checkout> [startup runs]
```

It starts both apps (`node_modules/.bin/vite` on ports 5191 and 5192; override with
`AFTER_PORT` and `BEFORE_PORT`), takes every shot into `captures/` and the two baseline shots
into `captures-before/`, times startup into `output-startup.txt`, writes `output-meta.txt`,
then runs `report.mjs`, which writes the self-contained `report/` folder: open
`report/index.html` in any browser, or copy the folder anywhere. The servers stop when it
exits. To rebuild only the page from existing outputs:
`node measurements/2026-11-19-earth-imagery/report.mjs <branch checkout>`.

The pieces also run alone, against dev servers you started yourself:

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
  `07` realistic at 20 and 60 radii: clouds follow both scale modes, and up close the 2048 px
  cloud map (about 20 km per pixel) is soft, as expected. **Corrected 2026-11-20:** these
  shots were read as "no flicker or holes, so no polygon offset needed", but Earth is only 80
  and 25 px wide in `07`, too small to show it. A magnified check
  ([2026-11-20-earth-cloud-depth](../2026-11-20-earth-cloud-depth/README.md)) found the
  shell losing 3% of its cloud pixels at 10 radii and up to 30% at 60, in triangular holes;
  the branch now offsets the shell's depth, and the same check finds none.

Startup: medians of 5 cold-browser runs per arm on Vite dev servers, real GPU. Two runs:

| | run 1 before | run 1 after | run 2 before | run 2 after |
|---|---|---|---|---|
| First picture | 8,254 ms | 10,553 ms (+2.3 s) | 6,093 ms | 6,807 ms (+0.7 s) |
| All surface maps ready | 8,254 ms | 11,661 ms (+3.4 s) | 6,094 ms | 6,808 ms (+0.7 s) |
| 30 frames | 8,732 ms | 12,115 ms (+3.4 s) | 6,574 ms | 7,281 ms (+0.7 s) |
| Worst frame in the next 8 s | 567 ms | 617 ms | 17 ms | 17 ms |

Run 1 (output in commit 85b46ec) ran minutes after a reboot, load 0.8 to 2.2, with cold file
caches; its runs were bimodal on both sides (before 8.0 to 11.3 s maps ready, after 9.7 to
12.3 s). Run 2 (`output-startup.txt` now, made by `run.sh` at branch commit ae40e1a) ran with
warm caches at load 1.7 to 1.9. Read the added wait as 0.7 s warm and up to 2 to 3.5 s cold,
not as one precise figure. Stalls after startup did not grow in either run. The four Earth
files add 20,967,718 bytes (colour 4.8 MB, relief 14.9 MB, water mask 0.4 MB, clouds 0.8 MB);
the relief PNG is the largest, and a 4096 px one would cut the cold wait if it matters.

The run 2 captures include the three review fixes: in `02-glint-pacific` the orbit line now
passes over the clouds instead of cutting a cloudless slit through them (compare with the
same file in commit 85b46ec).
