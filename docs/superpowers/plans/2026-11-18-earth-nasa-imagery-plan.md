# Earth from NASA imagery: build plan

Target (fixed): the approved design `docs/superpowers/specs/2026-11-18-earth-nasa-imagery-design.md`
at ba37959 on `feat/earth-nasa-imagery` (base `origin/main` 68edc88). Owner approved the design on
2026-11-18 ("I approve this") and asked for the build plan. Review: `/plan-eng-review`, 2026-11-18,
with owner answers D1-D3. Report file: this file (no path was given; the build plan is its own file).
An unchanged copy of the approved design is at the end.

## Build plan

### What ships

Four files in `public/textures/surfaces/`, all made by one committed generator from pinned inputs:

| File | Made from | Format | Size |
|---|---|---|---|
| `earth_albedo_bmng_200408_8192.jpg` | NASA Blue Marble: Next Generation, August 2004 base map, `world.200408.3x21600x10800.jpg` (21,206,743 B) | 8192 x 4096 JPEG, Lanczos, quality 92, no chroma subsampling | 8-14 MB [estimated] |
| `earth_normal_etopo2022_8192.png` | NOAA ETOPO 2022 v1 60" surface elevations, `ETOPO_2022_v1_60s_N90W180_surface.nc`, plus the water mask below | 8192 x 4096 RGB PNG, slopes square-root companded and dithered | 10-25 MB [estimated] |
| `earth_water_ne10m_8192.png` | Natural Earth 1:10m land, lakes and Antarctic ice shelves | 8192 x 4096 grayscale PNG, 255 = water, antialiased coast | under 1 MB [estimated] |
| `earth_clouds_bmng_2048.jpg` | NASA Blue Marble clouds, `cloud_combined_2048.jpg` (829,367 B), copied byte for byte | 2048 x 1024 JPEG | 829,367 B [measured] |

The 8192 cloud TIFF is not served at any NASA path tried (Scope C1), so 2048 ships, as the design allowed.

### Files touched (22)

`src/data/planets.ts` and `src/frontend/features/planetary/planetRotation.test.ts` (Greenwich, by
cherry-pick), `planetShaders.ts`, `planetSurfaceMaps.ts`, `planetSurfaceMaps.test.ts`, `quadtreeLOD.ts`,
new `cloudShell.ts` and `cloudShell.test.ts` (all in `src/frontend/features/planetary/`), `src/main.ts`,
`tests/browser/app-smoke.spec.ts`, new `scripts/build_earth_surface_maps.py` and
`scripts/test_earth_surface_maps.py`, `.github/workflows/r3-r4-science.yml`, the four image files,
`ci/public-asset-allowlist.json`, `docs/data/distribution-files.json`, `docs/data/distribution-sources.json`,
`NOTICE.md`, `docs/distribution-policy.md`. The Scope Challenge counted 20; Test review added the browser
test and the CI workflow line.

### Build specification

**Generator (`scripts/build_earth_surface_maps.py`, runs offline, once)**
- Runs in a throwaway venv with numpy, SciPy, Pillow and h5py; none becomes a project dependency. Each
  download goes into its own new empty directory outside the repo; Python runs with `-I`.
- Pins every input by SHA-256 and byte count, and stops without writing anything on a mismatch. The BMNG
  original was 926be7253be90a1fd57071a33afbfe7a712a2dfe0d5b5b4602bc5dfbcfdc2c89 when downloaded on
  2026-11-14 [re-measure on download]. Natural Earth comes from the official GeoJSON in
  `nvkelso/natural-earth-vector` at a pinned tag (no shapefile reader needed) or the naciscdn zips.
- Order: water mask first, then the normal map (it uses the mask), then colour, then the cloud copy.
- Water mask: rasterize at 16384 x 8192 on a water background: land 0, then lakes 255, then ice shelves 0,
  filling interior rings with the opposite value; box-downsample to 8192 x 4096 for a soft coast.
  x = (lon + 180) / 360 * W, y = (90 - lat) / 180 * H. Natural Earth already splits rings at 180 deg.
- Normal map: read ETOPO and check from its own coordinate arrays whether it is cell- or
  grid-registered, so it lines up with the colour map to the pixel. Area-average to 8192 x 4096 in
  float64. Slopes are g_e = dh / (R cos(lat) dlon) and g_n = dh / (R dlat) in metres per metre, with
  R = 6,371,008.8 m. Use central differences with longitude wrap-around. At the shore, use land and ice
  neighbours only, so the sea floor never leaks into the coast. Set slopes to exactly 0 on water pixels
  (mask above 127) and poleward of 89.5 deg.
- Encoding: R = east, G = north, B = 0. Byte = 128 + round(127 * s + d), where s = sign(g) * sqrt(min(|g|, 1))
  and d is a fixed-seed dither in [-0.5, 0.5), applied only where g is nonzero. The result is clamped to
  1..255, so 128 means exactly flat. Decode: s = (byte - 128) / 127, g = sign(s) * s^2.
- Write PNGs with no gAMA, sRGB or iCCP chunk, so the browser uploads the raw bytes (the loader sets
  `NoColorSpace`). Run the generator twice; the outputs must be byte-identical.

**Loader (`planetSurfaceMaps.ts`, D3)**
- Earth entry: `{ albedo, normal, water, clouds }` with the four file names above.
- The colour map is required: if it fails, the planet stays procedural, as today. Every other map is
  optional: if one fails, only that layer drops, with one `[surface-maps]` warning naming the file. The
  same rule makes the Moon's relief map optional.
- Normal, water and cloud maps keep mipmaps and the albedo's anisotropy. The Moon relief map keeps its
  current no-mipmap, `LinearFilter` setup.
- `main.ts:617` gains `['earth', 'earth']`.

**Earth shader (`planetShaders.ts`, `quadtreeLOD.ts`)**
- `hasMaps` includes Earth (`planetShaders.ts:409`). `setSurfaceMaps` accepts the optional `normal`,
  `water` and `clouds`, and sets a ready flag per optional map so a missing layer is skipped.
- One GLSL helper holds the antimeridian seam fix (`planetShaders.ts:253-256`). It sits next to
  `surfaceUvGLSL`, and all four maps use it.
- Normal: up = normalize(vSpherePosition), east = (z, 0, -x) / sqrt(x^2 + z^2), north = cross(up, east),
  n = normalize(up - g_e * east - g_n * north). Keep n = up when x^2 + z^2 < 1e-8. Lambert uses n; the rim
  glow keeps the sphere normal so relief does not speckle the rim.
- Glint on water only: Blinn-Phong in the body frame (`uLightDirection` and `uCameraPositionLocal`
  are already there) times a Schlick Fresnel term times the water mask, and only where the sun is up.
  Exponent and strength are tuned against the captures.
- Grit (`planetShaders.ts:346-347`, `:356-362`) is off for Earth once its colour map is ready. Moon and
  Mars keep theirs.

**Cloud shell (`cloudShell.ts`, D1 shape 2, D2)**
- `PlanetQuadtree` creates it when `setSurfaceMaps` receives a cloud map and adds it to `tree.group`, so
  it spins with the surface. The tree's `setRadius`, `setLightDirection` and `dispose` forward to it. No
  cloud code goes in `main.ts`. Picking is unaffected: `main.ts:1353` raycasts the groups non-recursively.
- Sphere at R * (1 + 10 / 6371), at least 128 segments around, so faceting (about 1.9 km sag) stays below
  the 10 km lift.
- Its own small ShaderMaterial (D2): alpha = cloud texel x about 0.9, colour white x (Lambert + 0.05
  ambient) from the same light direction as the ground, raw output, `transparent`, `depthWrite: false`,
  drawn after the Earth (`renderOrder`), front faces only. It gets a negative `polygonOffset` if a capture
  still flickers.
- Below 10 km altitude the camera is inside the shell and the clouds disappear; accepted for this PR.

### Order, lanes and commits

```
T1 Greenwich cherry-pick ───────────────────────────────────────────┐
Lane A (scripts/, public/, ci/, docs/):  T2 generator ─▶ T3 map test ─▶ T4 registers ─┐
Lane B (src/frontend/features/planetary/): T5 loader ─▶ T6 shader ─▶ T7 cloud shell ──┤
                                                     T8 main.ts + browser test ◀─────┘
                                                     T9 measure + GPU captures ─▶ T10 PR
```

Lanes A and B share no files and can run in parallel. Lane B's unit tests mock the loader and use the
file names fixed above. T8 needs both lanes. One small commit per task. `/verify` runs before each code
commit (not for docs or tests), and the commit is made only when the test exit codes are 0. Nothing is
pushed until the owner says so.

Commit subjects (the owner asked for this wording to be plain):
1. `fix(earth): put Greenwich at the IAU prime meridian` (cherry-picked 21a92d3)
2. `feat(earth): generator for Earth's NASA, NOAA and Natural Earth surface maps`
3. `feat(earth): ship a proper, correct HD NASA Blue Marble surface image and its relief, water and cloud maps`.
   The body names the 21600 px NASA original, the 8192 px Lanczos resample, and the registers.
4. `feat(earth): load Earth's maps at startup; only the colour map is required`
5. `feat(earth): draw the proper, correct HD NASA surface with relief shading and ocean glint`
6. `feat(earth): NASA cloud layer on a shell lit like the ground`
7. `test(browser): fail on WebGL shader errors and missing Earth maps`

### Checks before the PR

Unit tests (`npm test`), `npm run typecheck`, `npm run build`, `npm run verify:distribution`,
`python -m pytest -q scripts/test_earth_surface_maps.py`, and the browser test from T8. Headless real-GPU
captures only, never a visible browser: the day side, ocean glint, the cloud layer in enlarged and
realistic scale at three distances, and Himalayan relief at low sun. Also record bytes and
time-to-`maps.ready`, before and after. Capture scripts and results go on `lab/measurements`, not this
branch, and the PR body links them.

## Implementation Tasks
Synthesized from this review's findings. Each task derives from a specific
finding above. Run with Claude Code or Codex; checkbox as you ship.

Effort ratios assumed: scaffolding ~100x, tests ~30x, features ~25x, data pipeline and research ~10x
(human ÷ CC time). Total about human ~6 days / CC ~5 h [estimated].

- [ ] **T1 (P1, human: ~15min / CC: ~3min)** — Earth rotation — Cherry-pick the Greenwich fix 21a92d3
  - Surfaced by: Scope Challenge, premises P3 and P4 (design Goals: "Includes the Greenwich fix")
  - Files: src/data/planets.ts, src/frontend/features/planetary/planetRotation.test.ts
  - Verify: `npx vitest run src/frontend/features/planetary/planetRotation.test.ts`
- [ ] **T2 (P1, human: ~2 days / CC: ~1.5h)** — Generator — Build the four maps from pinned inputs
  - Surfaced by: Scope Challenge C1 and C2; Code quality 3 (companded encoding), 4 (poles); Build specification
  - Files: scripts/build_earth_surface_maps.py, public/textures/surfaces/earth_* (4 new files)
  - Verify: two runs give byte-identical outputs; the script's input pins match the downloads
- [ ] **T3 (P1, human: ~4h / CC: ~15min)** — Generator test — Check the shipped maps' content and add it to CI
  - Surfaced by: Test review test 5
  - Files: scripts/test_earth_surface_maps.py, .github/workflows/r3-r4-science.yml
  - Verify: `python -m pytest -q scripts/test_earth_surface_maps.py`. It checks mask polarity at the
    Pacific, Lake Superior, the Caspian, the Sahara and the Ross Ice Shelf. It checks colour-to-mask
    alignment. It checks zero slope on open ocean and poleward of 89.5 deg. The Himalaya's south face
    must rise northward (g_n > 0, 26.8-27.8 N, 84-88 E) and the Andes' west flank must rise eastward
    (g_e > 0, 18-24 S, 69-70 W). A synthetic flat coast next to a 4,000 m sea floor must give zero shore
    slope. The encode/decode round trip must keep 0.001, 0.01 and 0.5 within 20%. The pins must match
    the registers.
- [ ] **T4 (P1, human: ~3h / CC: ~20min)** — Distribution — Register the four files and settle rights P9 and P10
  - Surfaced by: Scope Challenge premises P9 and P10; design Goals (registers)
  - Files: ci/public-asset-allowlist.json, docs/data/distribution-files.json, docs/data/distribution-sources.json, NOTICE.md, docs/distribution-policy.md
  - Verify: `npm run verify:distribution && npm run build`. Rights statuses: Blue Marble colour and
    clouds `review-required`; ETOPO and Natural Earth `provider-declared-public-domain` only if their
    pages say so, quoted with the retrieval date. The normal map lists both ETOPO and Natural Earth in
    `sourceProductIds`. NOTICE carries the NCEI DOI and NASA's credit lines exactly as published.
- [ ] **T5 (P1, human: ~3h / CC: ~10min)** — Loader — Earth entry, colour required, rest optional (D3)
  - Surfaced by: Code quality 1 → R2 (D3); Test review tests 1-3
  - Files: src/frontend/features/planetary/planetSurfaceMaps.ts, planetSurfaceMaps.test.ts
  - Verify: `npx vitest run src/frontend/features/planetary/planetSurfaceMaps.test.ts` (tests written first)
- [ ] **T6 (P1, human: ~1 day / CC: ~45min)** — Earth shader — Normal map, water glint, grit off, seam helper
  - Surfaced by: Code quality 2 (grit), 4 (pole guard), 5 (seam); Build specification
  - Files: src/frontend/features/planetary/planetShaders.ts, quadtreeLOD.ts
  - Verify: `npm run typecheck`; T8's browser test; T9's captures
- [ ] **T7 (P1, human: ~1 day / CC: ~40min)** — Cloud shell — Shell owned by the quadtree, lit like the ground (D1, D2)
  - Surfaced by: Architecture 1 → R1 (D2); design-twice shape 2; Code quality 6 (depth)
  - Files: src/frontend/features/planetary/cloudShell.ts, cloudShell.test.ts, quadtreeLOD.ts
  - Verify: `npx vitest run src/frontend/features/planetary/cloudShell.test.ts` (child of the group,
    transparent, no depth write, resized by `setRadius`, lit by `setLightDirection`, disposed with the tree)
- [ ] **T8 (P1, human: ~2h / CC: ~10min)** — Wiring — Add Earth to the preload targets; browser test for shader errors
  - Surfaced by: Test review test 6
  - Files: src/main.ts, tests/browser/app-smoke.spec.ts
  - Verify: `npx playwright test tests/browser/app-smoke.spec.ts --project chromium` fails on any
    `THREE.WebGLProgram` or `Shader Error` console error and on an Earth `[surface-maps]` warning
- [ ] **T9 (P1, human: ~4h / CC: ~40min)** — Evidence — Startup wait and headless real-GPU captures
  - Surfaced by: Performance 1 (owner's measure-and-report rule); Test review test 7; Code quality 6
  - Files: none on this branch (scripts and results on lab/measurements)
  - Verify: bytes and time-to-`maps.ready` before and after; captures of day side, glint, clouds in
    both scales at three distances, Himalayan relief at low sun; recompress the normal PNG losslessly
    if it is over 20 MB; act on upload stalls only if one is over 100 ms
- [ ] **T10 (P2, human: ~1h / CC: ~15min)** — PR — Verify, open the new PR after the owner's go-ahead
  - Surfaced by: design "Checks before the PR" and the commit-message goal
  - Files: none
  - Verify: all checks above green; commit messages use the wording in "Order, lanes and commits"

## Review record

### Scope record

feature answers: none proposed (the owner chose all four layers, design approach 1 and "Decided by the
owner"); structure: A, Original arrangement (D1, owner answer 2026-11-18: "Original arrangement");
accepted scope: the approved design unchanged, with clouds on a separate see-through shell just above the
surface that follows the scale switch: about 20 files and 1 new class plus its test; pending remedies:
none at the time of D1 (later remedies live in the Decision ledger).

Scope Challenge result: scope accepted as-is.

### Scope Challenge

**A. Assessment**

What already solves each sub-problem:
- Loading and GPU upload: `createPlanetSurfaceMaps` (`planetSurfaceMaps.ts:27-75`) preloads every map at
  startup and passes each texture to `renderer.initTexture` (`main.ts:615-623`). Earth needs a
  `PLANET_SURFACE_SOURCES` entry and one more target in `main.ts:617`.
- Map shading: the `PLANET_HAS_MAPS` path (`planetShaders.ts:131-136`, `:248-259`, `:331-334`), the smooth
  globe mode `uTerrainMode == 2` (`planetShaders.ts:141`) and the antimeridian seam fix
  (`planetShaders.ts:253-256`). Earth is left out only by `planetShaders.ts:409`
  (`const hasMaps = planetId === 'moon' || planetId === 'mars';`).
- Lighting: Lambert plus 0.05 ambient in the body frame (`planetShaders.ts:367-378`), the light direction
  set per frame in that frame (`main.ts:1452-1461`), the existing rim glow (`planetShaders.ts:380-387`).
- Registers and the build gate: `npm run verify:distribution` (`package.json:16`), the prebuild pin check
  (`scripts/prepare-distribution.mjs:33-36`, `:75-80`); the Moon's record `surface-map:moon:cgi-moon-kit`
  (`docs/data/distribution-sources.json`, near line 355) is the pattern to copy.
- Greenwich: 21a92d3 applies cleanly to HEAD [measured: `git apply --check`, 2026-11-18].
- Raster derivation: nothing in the repo derives surface maps. `scripts/ingest-moon-textures.mjs`
  downloads and hashes curated moon textures but resamples nothing, so the generator is new.

Minimum change: the design as written. Nothing can be deferred without dropping a layer the owner chose.

Complexity: 20 proposed files at the time of D1 (labelled estimate; 22 after Test review), one new class
(the cloud shell). The gate tripped; D1 settled the structure.

Search check: Aside is not installed (`NEEDS_ASIDE`). The plan adds no new architectural pattern beyond a
transparent sphere and a normal map, both standard three.js [Layer 1]. No web search was run.

TODOS: the repo has no `TODOS.md`.

Distribution: four new files under `public/textures/surfaces/`, pinned in the allowlist and the two
registers; the generator is committed with its input SHA-256s so the files can be rebuilt; no CI job
regenerates them.

**Premise table**

| Premise | Claim | Receipt | Verdict |
|---|---|---|---|
| P1 | Earth's main-scene surface is procedural noise | `planetShaders.ts:143-161` (fBm terrain), `:409` (Earth not in `hasMaps`) | TRUE |
| P2 | Three retired files are three.js example textures with no licence | `docs/data/retired-texture-assets-2026-10-31.json:11,16,31` SHA-256s equal three.js r182 `earth_day_4096.jpg`, `earth_normal_2048.jpg`, `earth_specular_2048.jpg` [measured 2026-11-18]; the three.js folder holds no licence or readme [measured, GitHub contents API] | TRUE |
| P3 | Earth's spin phase is about 100 deg off the IAU prime meridian | `src/data/planets.ts:84` (`rotationPhaseDeg: -90`); NAIF W0 190.147 deg from the node at RA 90 deg gives Greenwich at RA 280.147 deg; the scene frame needs 10.147 (21a92d3 test) | TRUE |
| P4 | 21a92d3 applies to the new base | `git apply --check` [measured] | TRUE |
| P5 | NASA's 21600 x 10800 August 2004 original is downloadable | HEAD 200, 21,206,743 B [measured]; earlier SHA-256 926be725... [re-measure on download] | TRUE |
| P6 | Clouds: the 2048 JPEG exists, the 8192 TIFF is unconfirmed | 2048: HEAD 200, 829,367 B at `.../content-feature/bluemarble/images/cloud_combined_2048.jpg` [measured]; 8192 TIFF: 404 on two `assets.science.nasa.gov` paths [measured] | TRUE (8192 not available) |
| P7 | ETOPO 2022 60" surface elevations are downloadable | netCDF HEAD 200 `application/x-netcdf` [measured]; the GeoTIFF path is 404 [measured] | TRUE (netCDF only) |
| P8 | Natural Earth 1:10m land, lakes and ice shelves are downloadable | naciscdn zips HEAD 200 (3,269,070 / 2,349,685 / 163,651 B); GitHub GeoJSON 200 [measured] | TRUE |
| P9 | ETOPO and Natural Earth are public domain | design says it is checked while building | unverified |
| P10 | NASA imagery is "generally not subject to copyright" | quoted in the earlier draft register (95b11d1), not re-fetched today | unverified |
| P11 | 8192 px is the largest texture already shipped | `public/textures/surfaces/moon_albedo_lroc_8192.jpg` | TRUE |
| P12 | The loader preloads and uploads on arrival | `planetSurfaceMaps.ts:22-43`, `main.ts:615-623` | TRUE |
| P13 | The build rejects unlisted public files | `scripts/prepare-distribution.mjs:25` (rule), `:33-36`, `:75-80` (pin and integrity throws) | TRUE |
| P14 | An 8-bit height map would band on the ice domes | ETOPO spans about 19.7 km; 19.7 km / 255 = 77 m steps over a 4.9 km pixel [estimated arithmetic] | TRUE; see Code quality 3 |
| P15 | The BMNG August base map shows no sea ice | 5400 px copy from 95b11d1: central Arctic, Beaufort, East Siberian, Weddell and Ross Sea pixels all equal open Pacific RGB (2, 5, 20); Greenland ice (252, 254, 253) [measured] | TRUE |

`unverified=2`

**Reality rows**

```
REALITY: premise-table pass 15 premises, unverified=2 (P9, P10 rights, checked while building) docs/superpowers/plans/2026-11-18-earth-nasa-imagery-plan.md:241-255
REALITY: already-done pass origin/main 7b94861 is 4 planner commits past 68edc88, none touch the named files src/frontend/features/planetary/planetSurfaceMaps.ts:1
REALITY: surface-check pass npm scripts test/typecheck/build/verify:distribution exist; every source URL probed (P5-P8) package.json:14-17
REALITY: binding-decisions pass no branch decisions logged; owner calls in the design and D1-D3 kept; preload-at-startup rule kept src/frontend/features/planetary/planetSurfaceMaps.ts:22-26
REALITY: numbers pass sizes tagged measured or estimated; startup wait and file sizes are [re-measure before gate] docs/superpowers/plans/2026-11-18-earth-nasa-imagery-plan.md:15-20
REALITY: deferred-asks pass no linked issue; the owner's 3D Earth asks are deferred to a separate branch by the owner docs/superpowers/specs/2026-11-18-earth-nasa-imagery-design.md:15-16
REALITY: pr-count pass one new PR (no ship-policy file; PR #66 merged 2026-11-15) docs/superpowers/specs/2026-11-18-earth-nasa-imagery-design.md:72-73
```

**C. Findings**

1. [INFORMATIONAL] (confidence: 9/10) design "My calls", clouds: "Use 8192 if found, otherwise 2048."
   The 8192 TIFF is 404 on both NASA asset paths (P6). Factual correction: the build ships the 2048 JPEG
   and spends no more time looking. This is the fallback the design already approved; no question.
2. [INFORMATIONAL] (confidence: 7/10) ETOPO input format. Only the netCDF file is served (P7). ETOPO 2022
   netCDF is netCDF-4 (HDF5); the project venv has numpy, SciPy and Pillow but not h5py [measured]. The
   generator runs in a throwaway venv with h5py, which is not a project dependency. If the file turns out
   to be netCDF-3, SciPy reads it and h5py is not needed. Mechanics; no question.

Dispositions: 1 recorded as a factual correction; 2 recorded as builder mechanics.

### 1. Architecture

**Data flow**

```
build time (offline, scripts/build_earth_surface_maps.py, pinned input SHA-256s)
  Natural Earth land/lakes/ice shelves ──rasterize──▶ earth_water_ne10m_8192.png
  NOAA ETOPO 2022 60" netCDF + water mask ──slopes in float64──▶ earth_normal_etopo2022_8192.png
  NASA BMNG 21600x10800 JPEG ──Lanczos──▶ earth_albedo_bmng_200408_8192.jpg
  NASA cloud_combined_2048.jpg ──copy──▶ earth_clouds_bmng_2048.jpg

run time (browser)
  main.ts startup ─▶ createPlanetSurfaceMaps(targets incl. earth)
     ├─ loadAsync x4 ─▶ renderer.initTexture (upload on arrival)
     └─ tree.setSurfaceMaps({ albedo, normal?, water?, clouds? })   (colour required, D3)
          ├─ Earth shader: uAlbedoReady=1, uTerrainMode=2 (smooth)
          │    fragment: colour ─▶ normal from map (east/north/up frame) ─▶ Lambert + 0.05
          │              ─▶ glint where water ─▶ rim glow
          └─ cloud shell (child of the Earth quadtree group): alpha = cloud map, lit like the ground (D2)
  per frame: quadtree:earth stage ─▶ setLightDirection (ground and shell)
  scale switch: applyScaleMode ─▶ tree.setRadius ─▶ shell radius follows
```

**Design-twice (one new module, the cloud shell)**
- Shape 1: a `CloudShell` class created by `main.ts`, parented to the Earth spin group, with its own
  `setRadius` called from `applyScaleMode` (`main.ts:1001-1009`) and its own light-direction update in the
  frame stage (`main.ts:1452-1461`).
- Shape 2 (picked): the same `CloudShell` class, created and owned by `PlanetQuadtree` when
  `setSurfaceMaps` receives a cloud map. The tree adds it to `tree.group`, and its existing `setRadius`,
  `setLightDirection` and `dispose` forward to it.
- Depth argument: shape 2 hides the shell behind the three calls `main.ts` already makes, so `main.ts`
  gains no cloud code and nothing has to remember to resize it. Shape 1 adds a second caller for every
  radius and light change. Both satisfy D1 (a separate sphere that follows the scale switch); this is the
  implementation of that approved arrangement, not a new choice.

**Red flags**
- Split ownership (flag 5): with shape 1, two places would own the Earth's radius and light direction.
  Shape 2 fixes it.
- Hand-synced list (flag 8), pre-existing: the bodies with maps are named in `planetSurfaceMaps.ts:11`,
  `main.ts:617` and `planetShaders.ts:409`. Adding Earth edits all three. The Earth loader test fails if
  the shader list misses Earth (`setSurfaceMaps` writes `uAlbedoMap`, which only exists with
  `PLANET_HAS_MAPS`), so disagreement already breaks the build. No change.
- No other flags. Picking checked: `main.ts:1353` raycasts the body groups with `recursive = false`, so
  the shell (a child) cannot steal clicks from Earth.

**One realistic failure per new path**
- A map download fails at startup: R2 below.
- A GPU whose largest texture is below 8192: three.js scales the image down on upload, as it already
  does for the Moon's 8192 map. No new handling.
- Upstream data changes under the generator: the generator pins each input SHA-256 and stops on a mismatch.

**Findings**

1. [INFORMATIONAL] (confidence: 7/10) `src/frontend/app/sceneSetup.ts:130-136` vs
   `planetShaders.ts:367-378`. The scene lights are a warm `PointLight('#fff5e0', 1.8)` and a bluish
   `AmbientLight('#2a3a47', 0.3)` with sRGB output. The Earth shader ignores them: it computes Lambert plus
   0.05 ambient from `uLightDirection` and writes raw values. A stock lit material on the cloud shell
   would follow the first model and the ground the second. Estimate from three.js r182's Lambert
   formula: white clouds reach about 0.78 red and 0.68 blue at full sun, against 1.0 for white ground
   [estimated, not rendered]. R1.

Dispositions: 1 → R1 (D2, approved A).

### 2. Code quality

1. [INFORMATIONAL] (confidence: 9/10) `planetSurfaceMaps.ts:47-62`:
   `const [albedo, reliefMap] = await Promise.all([...]); ... } catch (error) { console.warn(... keeping procedural surface ...) }`.
   All of a planet's maps share one `Promise.all` and one `catch`. With four Earth files, a failed cloud,
   water or relief file would discard a good colour map and bring the noise globe back. R2.
2. [INFORMATIONAL] (confidence: 8/10) `planetShaders.ts:346-347` (`grit = snoise(vSpherePosition * 800.0) * 0.03 + ...`)
   and `:356-362`: once maps load, Earth's colour is still multiplied by noise within 0.35 radii of the
   camera, which paints invented grain on oceans and ice. The design's anti-goal forbids "invented terrain
   on Earth once the maps load", so turning grit off for Earth when its maps are ready is required
   implementation of the approved design. Moon and Mars keep theirs. No question.
3. [INFORMATIONAL] (confidence: 8/10) design "My calls", normal map in floating point. Computing in float
   is right, but the PNG still stores 8 bits. Stored linearly, slopes step by 2/255 = 0.0078 (0.45 deg)
   [estimated arithmetic]. Ice-sheet margins slope about 0.004 to 0.02, so they would round to 0, 1 or 2
   steps and show as contour bands near the day/night line, which fails the design goal "mountains and
   ice domes show in light and shadow". Required implementation of that goal: store each slope component
   square-root companded (`s = sign(g) * sqrt(|g|)`, decoded as `g = sign(s) * s^2`), then dither before
   rounding to 8 bits. At g = 0.001 a step becomes about 0.0006 instead of 0.0078. Proof: a generator
   self-check that slopes of 0.001, 0.01 and 0.5 survive the round trip within 20%. Mip levels average the
   companded values and so slightly flatten slopes far away; accepted. No question.
4. [INFORMATIONAL] (confidence: 8/10) the poles. The map's east direction is `(z, 0, -x) / sqrt(x^2 + z^2)`,
   from `surfaceUv`'s `atan(p.x, p.z)` (`planetShaders.ts:7`), and it is undefined at the poles. The
   vertex shader dodges this for its own frame by switching axes at `|y| > 0.9` (`planetShaders.ts:202`),
   which would not match the map's frame. Required: the fragment shader builds east and north from the
   map convention and leaves the normal radial when `x^2 + z^2 < 1e-8`; the generator writes zero slope
   poleward of 89.5 deg, where the longitude step falls below about 43 m. The South Pole plateau and the
   Arctic Ocean are flat there anyway. Proof: generator self-check on the polar rows. No question.
5. [INFORMATIONAL] (confidence: 8/10) `planetShaders.ts:253-256` (antimeridian seam fix). The normal map,
   the water mask and the cloud shell sample the same equirectangular layout and need the same fix, or a
   one-pixel seam appears along 180 deg. Routine mechanics: move the three lines into one GLSL helper next
   to `surfaceUvGLSL` (`planetShaders.ts:5-9`) and use it for all four maps. No question.
6. [INFORMATIONAL] (confidence: 7/10) D1's stated risk: the shell and the ground sit close together in a
   depth buffer that is not logarithmic (`sceneSetup.ts:95-99`; `main.ts:1220-1232` keeps near at 1e-4 AU
   outside realistic close range). Required implementation of D1: the shell writes no depth, draws after
   the Earth (`renderOrder`), and uses a negative `polygonOffset` if a capture still shows flicker. Proof:
   headless captures in enlarged and realistic scale at three distances. No question.

Dispositions: 1 → R2 (D3, approved A); 2-6 accepted as required implementation of the approved design and D1.

### 3. Test review

Frameworks (detected): Vitest (`package.json` `"test": "vitest run"`), Playwright (`playwright.config.ts:14`,
`testDir: './tests/browser'`), pytest for generator scripts (CI runs an explicit list,
`.github/workflows/r3-r4-science.yml:131-140`; the Moon pattern is `scripts/test_moon_repairs.py`).

Existing coverage read: `planetSurfaceMaps.test.ts:17-70` (preload count, Moon km scaling, Mars smooth,
all-or-nothing failure, dispose); `planetRotation.test.ts` gains the Greenwich block from 21a92d3.
Browser tests collect `pageerror` only (`tests/browser/restored-layers.spec.ts:20`) and that file aborts
every `/textures/surfaces/` request (`:16`), so no browser test today would notice a GLSL compile error,
which three.js reports through `console.error`.

```
CODE PATHS                                                   USER FLOWS
[+] scripts/build_earth_surface_maps.py (new, offline)       [+] App start
  ├── inputs: download + SHA-256 pin                           ├── [GAP] [→E2E] Earth shows real continents,
  │   └── [GAP] mismatch → stop, write nothing                 │         no shader error — browser test
  ├── [GAP] colour: Lanczos 21600 → 8192, lines up with mask   └── [GAP] GPU capture of the day side (manual)
  ├── slopes: float64 from ETOPO, water → 0                  [+] Zoom in at low sun
  │   ├── [GAP] companded + dithered encode round trip         └── [GAP] Himalaya relief capture (manual)
  │   ├── [GAP] rows poleward of 89.5 deg → 0                [+] Ocean with the sun behind the camera
  │   └── [GAP] antimeridian wrap, shore one-sided             └── [GAP] glint capture (manual)
  └── water mask: land 0, ocean and lakes 1, ice shelves 0   [+] Clouds
      └── [GAP] polarity at known points                       ├── [GAP] shell follows the scale switch
[+] planetSurfaceMaps.ts                                       └── [GAP] no flicker, enlarged + realistic
  ├── [★★ TESTED] Moon and Mars wiring — test.ts:27-50                captures at 3 distances (manual)
  ├── [GAP] Earth entry: 4 files, smooth globe               [+] Error states
  ├── [GAP] colour fails → procedural (R2)                     ├── [GAP] cloud download fails → continents stay
  ├── [GAP] optional layer fails → only it drops (R2)          └── [GAP] colour fails → procedural, one warning
  ├── [★★ TESTED] dispose releases textures — :62-70
  └── [★★ TESTED] preload + upload count — :17-25 (count changes 3 → 7)
[+] quadtreeLOD.ts setSurfaceMaps / setRadius / setLightDirection / dispose
  └── [GAP] cloud shell created, resized, lit, disposed
[+] planetShaders.ts (Earth in hasMaps, normal, glint, grit off, seam helper)
  └── [GAP] [→E2E] compiles on a real WebGL context
[+] cloud shell shader (new)
  └── [GAP] [→E2E] compiles; depthWrite off, drawn after the ground
[+] src/data/planets.ts Greenwich phase
  └── [★★★ TESTED] NAIF W and GMST at three dates — 21a92d3

COVERAGE: 4/24 paths tested (17%)  |  Code paths: 4/16 (25%)  |  User flows: 0/8 (0%)
QUALITY: ★★★:1 ★★:3 ★:0  |  GAPS: 20 (3 E2E, 4 manual GPU captures)
```

Legend: ★★★ behavior + edge + error | ★★ happy path | ★ smoke check | [→E2E] needs a browser test

**Tests to add (required proof of approved behavior; no new policy, so no question)**

1. Extend `planetSurfaceMaps.test.ts` with an Earth case: four loads matching
   `earth_albedo_bmng_200408_8192.jpg`, `earth_normal_etopo2022_8192.png`, `earth_water_ne10m_8192.png`,
   `earth_clouds_bmng_2048.jpg`; `uAlbedoReady` 1, `uTerrainMode` 2; normal and water uniforms set.
   Unit. Value: protects=Earth gets all four maps on a smooth globe; fails_when=the Earth entry, the
   shader's map list or a file name drifts; why_new=the file covers Moon and Mars only (:27-50); seam=none;
   no_claim=GPU rendering (mocked loader; unit only)
2. Rewrite the failure test (`:52-60`) as two rows: colour fails → `uAlbedoReady` 0 and procedural;
   clouds (and separately water, normal, Moon relief) fail → colour applied, that layer absent, exactly
   one warning. Unit. Value: protects=R2, colour required and the rest optional; fails_when=the loader
   goes back to one shared catch; why_new=the current test asserts all-or-nothing; seam=none;
   no_claim=real network errors (mocked loader)
3. Extend the preload test (`:17-25`) to Moon + Mars + Earth: 7 loads and 7 uploads before any frame.
   Unit, extension.
4. Cloud shell through `PlanetQuadtree` (`cloudShell.test.ts` next to the module, matching the repo's
   colocated tests): after `setSurfaceMaps` with clouds, the shell is a child of `tree.group`,
   transparent, `depthWrite` false, drawn after the ground; `setRadius(2r)` doubles its radius;
   `setLightDirection` reaches its uniform; `dispose` disposes its geometry and material. Unit.
   Value: protects=the D1/D2 shell follows scale, light and lifecycle; fails_when=a resize or light
   hand-off is dropped; why_new=no shell exists; seam=none; no_claim=no flicker on a real GPU (manual capture)
5. New `scripts/test_earth_surface_maps.py` (pytest, Pillow), added to the CI list at
   `r3-r4-science.yml:133-140`. It runs these checks on the shipped files:
   - Water mask: water in the open Pacific (0 N, 160 W), Lake Superior (47.7 N, 87.5 W) and the Caspian
     (42 N, 50.5 E); land in the Sahara (23 N, 12 E) and on the Ross Ice Shelf (81.5 S, 175 W).
   - Colour map: bluer than red at the Pacific point and redder than blue at the Sahara point. This proves
     the colour and mask layers line up and neither is flipped.
   - Normal map: slope bytes exactly 128 on open ocean and poleward of 89.5 deg. The Himalaya's south
     face rises northward (mean g_n > 0, 26.8-27.8 N, 84-88 E). The Andes' west flank rises eastward
     (mean g_e > 0, 18-24 S, 69-70 W).
   - Generator functions: a synthetic flat coast next to a 4,000 m sea floor gives zero shore slope, and
     the encode/decode round trip keeps slopes of 0.001, 0.01 and 0.5 within 20%.
   - Every input SHA-256 pin in the generator matches its register entry.
   Unit (data). Value: protects=the shipped maps are placed, oriented and encoded correctly;
   fails_when=a map is mirrored, shifted, mask-inverted, sign-flipped or re-encoded linearly;
   why_new=nothing checks image content today; seam=none; no_claim=how it looks on screen (captures)
6. Extend `tests/browser/app-smoke.spec.ts` (the test at `:104`, which lets same-origin requests through)
   to fail on any `console.error` containing `THREE.WebGLProgram` or `Shader Error`, and on a
   `[surface-maps]` warning for Earth. [→E2E] Value: protects=the Earth and cloud shaders compile and the
   maps load in the real app; fails_when=a GLSL edit breaks compilation or a file is missing from the
   build; why_new=browser tests collect pageerror only and abort surface maps; seam=none; no_claim=visual
   correctness (software GL in CI)
7. Manual, recorded in the PR: headless real-GPU captures of the day side, ocean glint, the cloud layer
   in enlarged and realistic scale at three distances, and Himalayan relief at low sun (design "Checks
   before the PR").

**Regression contract (carried, no question):** Moon relief keeps true kilometres and Mars stays smooth
(existing `:27-50` stay green unchanged); the one intended change is R2's Moon relief failure. Greenwich
moves Earth's surface by 100.147 deg on purpose (21a92d3).

**Tests made obsolete:** none; `:52-60` is rewritten, not retired.

Test Plan artifact: `~/.gstack/projects/vkorotkikh-solar-system-realistic-sim/nomad-feat-earth-nasa-imagery-eng-review-test-plan-20261118-061949.md`.

Test review findings: 20 gaps, all covered by tests 1-7 above. Dispositions: accepted as required proof.

### 4. Performance review

1. [INFORMATIONAL] (confidence: 7/10) startup bytes and wait. New files: colour 8192 JPEG [estimated
   8-14 MB], normal PNG [estimated 10-25 MB; re-measure], water PNG [estimated under 1 MB], clouds
   829,367 B [measured]. The owner's preload rule also says to measure and report the startup wait.
   Required proof: measure bytes and the time from navigation to `maps.ready`, before and after, on the
   headless real-GPU run, and report both in the PR. If the normal PNG is over 20 MB, recompress it
   losslessly (for example with oxipng). JPEG is not an option for the normal map: block artefacts are
   magnified by the companded encoding. No question.
2. [INFORMATIONAL] (confidence: 6/10) GPU memory, medium confidence: each 8192 x 4096 map decodes to
   RGBA, about 179 MB with mipmaps, so roughly 550 MB extra for colour, normal and water [estimated]. The
   owner set VRAM cost aside (preload rule), so this is noted, not changed.
3. [INFORMATIONAL] (confidence: 6/10) first-frame stalls, medium confidence: `renderer.initTexture`
   (`main.ts:622`) uploads on the main thread as each file arrives, and the cloud shell's shader compiles
   on the first frame after the cloud map arrives; each may stall a frame for tens of milliseconds
   [estimated]. Covered by measurement 1; no change unless a measured stall exceeds 100 ms.
4. Fragment cost: the Earth gains two texture reads and a few lines of glint maths; the cloud shell adds
   one transparent pass with one read. No per-request or looped path changes. No issue.

Dispositions: 1 accepted as required proof; 2 and 3 noted; 4 no issue.

### Outside voice

Codex is not installed (`CODEX_MODE: not_installed`). The native Claude fallback (Plan subagent, one
five-minute timer) had not sent a complete report when the timer ended, so it was stopped and no late
result is used. Outside coverage: unavailable. Fix: install the Codex CLI and run `codex login`, or rerun
`/plan-eng-review` later.

### TODOS

No TODO proposals. Every deferral is already owned elsewhere: the design's non-goals, and the separate
3D Earth branch the owner planned. The repo keeps no `TODOS.md`.

## Decision ledger

### R1: How the cloud shell is lit
Finding: Architecture 1, INFORMATIONAL, confidence 7/10, `src/frontend/app/sceneSetup.ts:130-136` vs `src/frontend/features/planetary/planetShaders.ts:367-378`, reviewer: Claude (plan-eng-review)
Plan baseline: design "Clouds: ... lit by the sun"; D1 approved a separate shell; no lighting model chosen
Runtime evidence: no cloud shell exists; scene lights at `sceneSetup.ts:130-136`; Earth lighting at `planetShaders.ts:367-378`; brightness figures estimated, not rendered
Comparison grid:

| Choice | Current | A | B |
|---|---|---|---|
| R1 cloud shell lighting | none (no shell) | small shader of its own: the Earth shader's light direction and its Lambert + 0.05 ambient, raw output (~40 lines GLSL) | stock `MeshLambertMaterial`, cloud map as alpha map, lit by the scene's sun and ambient lights |
| D1 arrangement | approved: separate shell (D1) | unchanged | unchanged |
| Shell ownership | shape 2 (owned by `PlanetQuadtree`), implementation of D1 | unchanged | unchanged |
| R2 partial map failure | pending | pending | pending |

Question D2:
D2 — How should the cloud sphere be lit?
Project/branch/task: feat/earth-nasa-imagery, the separate cloud sphere chosen in D1.
ELI10: Clouds and ground need the same sunlight, or the clouds look pasted on. The Earth shader does its own simple lighting (planetShaders.ts:367-378) and ignores the scene's lamp. A ready-made three.js material on the cloud sphere would use the scene's lamp instead (sceneSetup.ts:130-136): a warm light at strength 1.8 plus a bluish fill, with a colour correction the ground does not get. Its white clouds come out about a fifth dimmer and slightly yellow next to white ice, and the night side gets a different fill.
Stakes if we pick wrong: with B, clouds and ice do not match in brightness, and the day/night edge on the clouds looks softer than the one on the ground.
Recommendation: A because the clouds use the ground's own light direction and formula, so the two cannot drift apart; it costs about 40 lines of shader.
Completeness: A=10/10, B=6/10
Pros / cons:
A) Shared shader lighting (recommended)
  ✅ Clouds and ground use one light direction and one formula, so their day/night edges line up exactly.
  ✅ The tree already gets the light direction every frame (main.ts:1452-1461); the shell reads it, no new main.ts code.
  ❌ About 40 lines of GLSL to own, kept in step by hand if the ground lighting ever changes.
B) Stock lit material
  ✅ No shader code: three.js MeshLambertMaterial with the cloud map as its alpha map.
  ✅ Lit by the same lamp as the other planets and moons, so it matches them instead of the ground.
  ❌ White clouds about 20% dimmer and warmer than the ground's white ice, plus a bluish night-side fill.
  ❌ Matching them later means writing the shader anyway, so this is likely to be redone.
Net: A spends about 40 lines of shader so clouds and ground are lit the same; B is free but visibly mismatched.
Header: Cloud light
Options:
A) Shared shader lighting (recommended)
Own small shader using the Earth shader's light direction and Lambert + 0.05 ambient, raw output, so clouds match the ground. Effort: human ~3 h / CC ~15 min. Risk: low. Upkeep: keep in step with the ground lighting.
B) Stock lit material
three.js MeshLambertMaterial with the cloud map as alpha, lit by the scene's sun and ambient lights. Effort: human ~1 h / CC ~5 min. Risk: clouds visibly dimmer and warmer than the ground. Upkeep: none until it is redone.

State: approved
Actual answer: A) Shared shader lighting (recommended), owner answer to D2, 2026-11-18
Accepted scope: the cloud shell gets its own small ShaderMaterial (about 40 lines of GLSL) that uses the Earth quadtree's `uLightDirection` (forwarded by `PlanetQuadtree.setLightDirection`) and the ground's Lambert + 0.05 ambient with raw output; no scene-light material on the shell; shell ownership stays shape 2; R2 stays pending.
History: none

### R2: What happens when only some maps fail
Finding: Code quality 1, INFORMATIONAL, confidence 9/10, `src/frontend/features/planetary/planetSurfaceMaps.ts:47-62`, reviewer: Claude (plan-eng-review)
Plan baseline: design constraint "The procedural surface stays only as the fallback when a map fails to load"; it does not say which map
Runtime evidence: today any failed map of a planet keeps the procedural surface (`planetSurfaceMaps.ts:47-62`; test `planetSurfaceMaps.test.ts:52-60`); with the Moon this means a failed relief file also drops the LROC colour and leaves the plain grey ball (`planetShaders.ts:323-326`)
Comparison grid:

| Choice | Current | A | B |
|---|---|---|---|
| R2 partial map failure | any failed map of a planet → that planet stays procedural | colour is required; every other map (Earth normal, water, clouds; Moon relief) is optional and a failed one drops only its own layer, with a console warning | all-or-nothing as today: any of Earth's four maps failing → Earth stays the noise globe; Moon unchanged |
| Moon behavior | relief failure → grey ball | relief failure → LROC colour on a smooth Moon | unchanged |
| R1 cloud lighting | approved A (D2) | unchanged | unchanged |
| D1 arrangement | approved separate shell (D1) | unchanged | unchanged |

Question D3:
D3 — If one of Earth's four map files fails to load, what should the Earth look like?
Project/branch/task: feat/earth-nasa-imagery, the surface-map loader (planetSurfaceMaps.ts:47-62).
ELI10: Earth will load four pictures at startup: colour, relief shading, the water mask for the ocean shine, and clouds. Today the loader treats a planet's pictures as all-or-nothing: if any one fails, it throws away the ones that worked and shows the fake noise globe. So a failed cloud picture would wipe out the real continents. The alternative is to treat the colour picture as the one that must arrive and let the other three drop out one by one.
Stakes if we pick wrong: with B, one flaky download (most likely the largest, the relief map) brings back the fake continents this whole change exists to remove.
Recommendation: A because real geography should survive a missing extra layer; only a missing colour map justifies the fallback.
Completeness: A=10/10, B=6/10
Pros / cons:
A) Colour required, rest optional (recommended)
  ✅ A failed cloud, water or relief file only drops that layer; real continents stay on screen.
  ✅ The Moon gains the same rule: a failed relief file leaves real LROC colour instead of a grey ball.
  ❌ Changes the Moon's current failure behavior, so the existing all-or-nothing test is rewritten.
B) All-or-nothing, as today
  ✅ No loader change; the existing failure test stays as it is and covers Earth too.
  ✅ Simplest rule to explain: either every real layer shows or none does.
  ❌ Any one of four downloads failing brings back the fake noise continents for the whole session.
Net: A keeps real geography whenever the colour map arrives, at the cost of a small loader change and one rewritten test.
Header: Map failure
Options:
A) Colour required, rest optional (recommended)
The colour map is the only required file; a failed normal, water, cloud or Moon relief map drops just that layer with a console warning. Effort: human ~2 h / CC ~10 min. Risk: low. Upkeep: one rule for every planet.
B) All-or-nothing, as today
Any failed map of a planet keeps its procedural surface, as now. Effort: none. Risk: a single failed download shows the fake noise globe. Upkeep: none.

State: approved
Actual answer: A) Colour required, rest optional (recommended), owner answer to D3, 2026-11-18
Accepted scope: for every planet the colour map is the only required file; a failed colour map keeps the procedural surface as today; a failed Earth normal, water or cloud map, or a failed Moon relief map, drops only that layer and logs one `[surface-maps]` warning naming the file; the existing failure test (`planetSurfaceMaps.test.ts:52-60`) is rewritten to cover both rules; R1 and D1 unchanged.
History: none

Approval readiness: PASS. Checked: structure (D1, owner answer "Original arrangement"); R1 (D2, owner
answer A); R2 (D3, owner answer A). Accepted as required implementation of approved scope, citing the
design: Code quality 2 (design anti-goals), 3 (design goal "mountains and ice domes show"), 4 and 5
(correct map placement, design goal "Real geography"), 6 (D1), Test review tests 1-7 (approved behavior
and the design's "Checks before the PR"), Performance 1 (owner's preload rule). No accepted remedy lacks
an answer.

## NOT in scope

- Terrain displacement, Earth's flattened shape and the geoid: the 3D Earth branch the owner planned.
- Ocean water physics and waves: the 3D Earth branch.
- Sea ice: the BMNG base map has none (P15), so the Arctic Ocean shows open water in this PR. Seasonal
  sea ice comes with the 3D Earth branch.
- Live daily clouds from GIBS, cloud motion and cloud shadows: design non-goal (approach 3 deferred).
- City lights and a night-side map, month-by-month day maps, atmosphere work beyond the rim glow:
  design non-goals.
- The 8192 cloud map: NASA does not serve it at any path tried (Scope C1).
- Clouds seen from below 10 km altitude: the camera is inside the shell there; accepted for this PR.
- De-duplicating the three lists of bodies with maps (red flag 8): pre-existing and already guarded by the
  Earth loader test.
- Normal maps for the Moon or Mars: the Moon has real displacement already; Mars has no heights shipped.

## What already exists

- `createPlanetSurfaceMaps` (`planetSurfaceMaps.ts:27-75`): reused as is for preload and GPU upload; only
  the failure rule changes (D3).
- The `PLANET_HAS_MAPS` shader path and smooth-globe mode (`planetShaders.ts:131-141`, `:248-259`):
  reused; Earth joins it.
- The antimeridian seam fix (`planetShaders.ts:253-256`): moved into one helper and reused by all four
  maps (Code quality 5), not rewritten.
- Body-frame light direction per frame (`main.ts:1452-1461`): reused by the ground and the shell (D2).
- Scale switch (`main.ts:1001-1009` calls `tree.setRadius`): reused; the shell follows through the tree.
- Distribution registers and the build pin check: reused; the Moon's record is the template.
- `scripts/ingest-moon-textures.mjs`: not reused; it downloads curated files but derives nothing.
- Greenwich fix 21a92d3 from `fix/earth-measured-surface`: reused by cherry-pick. That branch's 5400 px
  map (95b11d1) is replaced by the 8192 px build.

## Failure modes

| Path | Realistic failure | Test or handling | What the user sees |
|---|---|---|---|
| Generator inputs | An upstream file changes | SHA-256 pin stops the run; test 5 checks pins against the registers | Build-time error, nothing written |
| Normal map at the coast | Sea-floor drop leaks into land pixels | One-sided shore differences; test 5 synthetic coast | Would be a bright or dark rim along coasts |
| Normal map at the poles | Divide by zero in east/north | Pole guard in shader; zero slope rows; test 5 | Would be a sparkle or black dot at a pole |
| Optional map download | 404 or network error | D3 rule; test 2 | That layer missing, one console warning |
| Colour map download | 404 or network error | Procedural fallback; test 2 | Noise globe, one console warning |
| Earth or cloud shader | GLSL compile error | Browser test 6 | Without the test: Earth missing or black, no CI signal |
| Cloud shell depth | Flicker against the ground | No depth write, draw order, polygonOffset; captures | Visible flicker; caught by the captures |
| Startup | Upload or compile stall | Measurement T9 | A brief hitch while maps arrive |

Critical gaps (no test, no handling, silent): 0.

## Worktree parallelization strategy

| Step | Modules touched | Depends on |
|------|----------------|------------|
| T1 Greenwich | src/data/, src/frontend/features/planetary/ (test) | — |
| T2-T4 maps, map test, registers | scripts/, public/textures/surfaces/, ci/, docs/data/, .github/workflows/ | — |
| T5-T7 loader, shader, shell | src/frontend/features/planetary/ | T1 |
| T8 wiring + browser test | src/, tests/browser/ | T2-T4, T5-T7 |
| T9 measure + captures | lab/measurements (other branch) | T8 |

Parallel lanes: Lane A: T2 → T3 → T4 (scripts/, public/, ci/, docs/). Lane B: T1 → T5 → T6 → T7
(src/frontend/features/planetary/). Then T8, T9, T10 in sequence.
Execution order: launch A and B together; merge both; then T8, T9, T10.
Conflict flags: none between lanes. T1 and Lane B both touch `src/frontend/features/planetary/`, so T1 runs
first inside Lane B.

## Unresolved decisions

None. D1, D2 and D3 were all answered.

## Completion summary

- Step 0: Scope Challenge — scope accepted as-is
- Reality rows: 7/7 applicable rows emitted (`PLAN_REALITY` line), 2 unverified premises
- Architecture Review: 1 issue found
- Code Quality Review: 6 issues found
- Test Review: diagram produced, 20 gaps identified
- Performance Review: 3 issues found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 items proposed to user
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: codex, unavailable (not installed; native Claude fallback sent no complete report within five minutes)
- Parallelization: 2 lanes, 2 parallel / 3 sequential steps after them (T8, T9, T10)
- Lake Score: 2/2 (D2 and D3 picked the 10/10 option; D1 had no completeness score)

## Appendix: approved design (unchanged copy of ba37959)

```markdown
# Earth from NASA imagery: design (short)

Date: 2026-11-18. Status: awaiting owner approval. Branch: `feat/earth-nasa-imagery` (from `origin/main` 68edc88).

## Intent

The main-scene Earth is procedural noise: the shader in `src/frontend/features/planetary/planetShaders.ts`
(PLANET_TYPE 0) invents continents, mountains and latitude-band ice caps. Before the 2026-02-23 pivot the
app showed a realistic Earth: day colour, relief shading, ocean shine and clouds. Its files were removed on
2026-10-31 because their source was unknown. Three of them (`earth_day_4096`, `earth_normal_2048`,
`earth_watermask_2048`) are byte-identical copies of three.js example textures with no recorded licence,
so the old bytes cannot return. This change rebuilds the same look from NASA, NOAA and Natural Earth data
with the source of every file recorded.

This is the imagery step only. The true 3D Earth (flattened shape, real heights, ocean water physics,
ice sheets, seasonal sea ice) is a later, separate branch and PR.

## Goals

- Real geography, placed correctly under the sun. Includes the Greenwich fix (Earth's spin phase was
  about 100 deg off the IAU prime meridian), commit 21a92d3 on `fix/earth-measured-surface`.
- HD colour: NASA Blue Marble: Next Generation, August 2004 base map, Lanczos-resampled to 8192 x 4096
  from NASA's 21600 x 10800 (2 km/px) original.
- Relief shading: a normal map computed offline from NOAA ETOPO 2022 60-arc-second ice-surface
  elevations, so mountains and ice domes show in light and shadow. Land and ice only. The globe stays smooth.
- Ocean shine: sun glint on water only, from a mask rasterized from Natural Earth 1:10m vectors
  (oceans and lakes glint; land and Antarctic ice shelves do not).
- Clouds: NASA's Blue Marble cloud layer on a thin, semi-transparent shell just above the surface,
  lit by the sun.
- Every file preloaded at startup and uploaded to the GPU on arrival (owner rule), through the
  existing `createPlanetSurfaceMaps` loader.
- Every file registered in `ci/public-asset-allowlist.json`, `docs/data/distribution-files.json` and
  `docs/data/distribution-sources.json`, with source URL, credit, terms, derivation and SHA-256.
- Commit messages say plainly that Earth now uses a proper, correct HD NASA surface image.

## Non-goals

Terrain displacement, the flattened shape and the geoid; water physics; sea ice by date; live daily
clouds (the dormant GIBS code); city lights; month-by-month day maps; atmosphere work beyond the
existing rim glow.

## Anti-goals

- Shipping any file without a recorded source and terms.
- Restoring the old three.js bytes.
- Painting the sea floor into the oceans (the topo-bathy look).
- Exaggerated heights or invented terrain on Earth once the maps load.

## Constraints

- `docs/distribution-policy.md`: exact source, terms and hashes; `npm run build` rejects unlisted files.
- The quadtree terrain shader and the surface-map loader already used by the Moon and Mars.
- 8192 px is the texture size the Moon already ships; larger is unsafe on many GPUs.
- The procedural surface stays only as the fallback when a map fails to load.
- Visual checks run headless only.

## Approaches

1. **Rebuild the layers from NASA, NOAA and Natural Earth data. Chosen by the owner (2026-11-18).**
   Oceans look as they do from space and match the real-water work planned for the 3D upgrade.
2. One topo-bathy picture, as in February. Rejected: the sea floor shows through the ocean, which it
   never does from space, and it would clash with real water later.
3. Live daily clouds from NASA GIBS. Deferred: the browser would call NASA daily, the product's rights
   are unreviewed, and no data exists for future dates.

## Decided by the owner

Approach 1; imagery only in this PR; the 3D upgrade separately; HD colour; the commit-message wording.

## My calls (correct any of these)

- New branch and new PR from `main`: PR #66 merged on 2026-11-15, so the earlier plan to add these
  commits to it no longer applies. The Greenwich commit is cherry-picked.
- The normal map is computed offline in floating point rather than derived in the shader from an 8-bit
  height map, which would band on the gentle Antarctic and Greenland domes. The 3D upgrade brings its
  own 16-bit heights.
- Clouds: NASA serves a 2048 x 1024 JPEG (confirmed); NASA also lists an 8192 x 4096 TIFF, location
  not yet confirmed. Use 8192 if found, otherwise 2048. The layer is a composite of 2001 MODIS days,
  not matched to the simulation date.
- The cloud shell stays fixed to the surface. The old one spun faster than Earth, which real cloud
  cover does not do.
- Rights: Blue Marble and clouds `review-required`, as for the day map before (NASA: content
  "generally not subject to copyright", credit NASA Earth Observatory). ETOPO and Natural Earth
  recorded as public domain if their pages say so; checked while building.

## Left to the builder

Shader details (tangent frame for the normal map, glint exponent and strength), cloud altitude and
opacity, JPEG quality and file sizes, antimeridian handling when rasterizing, and the tests: map
wiring, mask polarity at known points (open ocean, Sahara, Lake Superior, Ross Ice Shelf), and
Greenwich placement.

## Checks before the PR

Unit tests, typecheck, build, `npm run verify:distribution`; headless real-GPU captures of the day
side, sun glint on the ocean, the cloud layer, and Himalayan relief at low sun.
```

## Suppressed findings

None (no finding scored 3-4).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | codex via `/plan-eng-review` (native fallback) | Independent 2nd opinion | 1 | unavailable | none (no complete report within five minutes) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN | 30 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex, plan-review phase, unavailable: Codex CLI not installed; the native Claude fallback was stopped at the five-minute timer without a complete report. No outside findings.
- **CROSS-MODEL:** none; no completed outside review to compare.
- **VERDICT:** no review CLEAR yet. Eng Review is ISSUES OPEN because its 30 findings are mapped to tasks T1-T10 with every decision answered; eng review required.

NO UNRESOLVED DECISIONS
