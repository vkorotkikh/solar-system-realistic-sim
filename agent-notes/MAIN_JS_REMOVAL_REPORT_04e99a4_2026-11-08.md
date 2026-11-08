# What the February `main.js` refactor removed

Commit under review: `04e99a4` (2026-02-23, "Refactor main.js to streamline imports").
Companion commit: `d1484e8` (nine seconds earlier, "Revise index.html for Sun Model Lab transition").
Checked against `origin/main` at `f539406` on 2026-11-08.

## Bottom line

The commit message says it removed unused imports. It did not. It cut `src/main.js` from 4,404 lines
to 614 (4,190 deleted, 400 added) and turned the Solar System Mission Lab into the Sun Model Lab.

Most of what it cut should **not** come back as written. The Sun visuals, scale handling and frame loop moved
elsewhere and still run, and the old belt code was weaker than what replaced it. The features people miss are
mainly wiring and UI around modules that still exist and have been maintained since.

## How the loss happened: three steps, not one

| Date | Commit | What happened |
|---|---|---|
| 2026-02-23 | `d1484e8`, `04e99a4` | UI controls and the code calling these features removed. Modules left in the tree, now called by nothing. |
| 2026-10-31 | `fd8d149` | 25 textures (40.6 MB) deleted as "orphan, unsupported provenance". They were orphans only because of February. |
| 2026-11-02 | `706664f` | `visualProfiles.ts` deleted as unused. It held the orbit-preset altitudes, the surface-map ids and the spacecraft lists. |

Everything deleted is still in git history.

## Section by section

"Now" means on `origin/main`. Line counts are from the pre-refactor file.

| Section | Lines | What it did | Now | Action |
|---|---:|---|---|---|
| DOM references, imports | 219 | Wiring for everything below | Replaced by a smaller list | Add back only what is restored |
| Data and state | 252 | Altitude presets, adaptive-zoom profiles, oblate-shape helpers, constants | Partly kept; presets gone | Moon presets: **this PR** |
| Collections | 219 | Scene state, including nearby and local systems | Partly kept | Nearby systems: **separate PR** |
| Geometry and materials | 715 | Procedural cloud and dust maps, 20 bundled textures, per-body materials, nearby-system entry and exit | Procedural shaders replaced the materials | Moon and Mars maps: **this PR**. Rest: your call |
| Sun surface and corona | 201 | Sun visuals | Moved to `sunController`, running | Nothing to do |
| Body nodes | 424 | Earth clouds, atmosphere, ocean; Moon exosphere and earthshine; Mars clouds, atmosphere, polar caps; Venus shell; **Saturn and Uranus rings**; orbit guides; locator halos; gravity arrows | All gone | Your call (see below) |
| Asteroid belt | 647 | Synthetic belt with hand-tuned gaps, a detail layer, a uniform ring band | Replaced by the 100k JPL catalog | **Do not restore** generators. Band rebuilt on real data |
| Kuiper belt and detail layer | 151 | Random points | Replaced by `kuiperBelt.ts` | **Do not restore**. Switch: **this PR** |
| Oort cloud | 71 | 34,000 random points | Gone | Your call |
| Scene assembly | 75 | Attached Earth, Moon and Mars spacecraft | Gone; `satelliteSystem.ts` maintained | Earth: **this PR** |
| WebSocket simulation client | 75 | Live REBOUND/TudatPy backend and server Kuiper particles | Client unused; `/ws/sim` still served | Your call |
| Scale mode, resize | 118 | Scale switch and viewport | Moved and simplified, running | Nothing to do |
| Scene updates | 482 | Spin, weather, earthshine, seasons, surface LOD, gravity vectors, visibility | Spin kept; others gone | Visibility: **this PR**. Rest: your call |
| Focus and follow | 107 | Includes `focusBodyAtAltitude` for orbit presets | Focus kept; altitude focus gone | **This PR** |
| Body list and search | 381 | All bodies including moons, star-system picker, data-source info | Now 10 major bodies | Moons: **this PR**. Star systems: **separate PR** |
| Planner and routes | 55 | Connected the planner to route drawing | Gone; `plannerController` maintained | **This PR** |
| Follow, UI events, startup, loop | 149 | Frame loop and handlers | Moved to `frameLifecycle`, running | Add new stages only |

### Removed HTML (`d1484e8`, 126 lines)

- 11 switches: locators, gravity vectors, moons, asteroids, Kuiper, Oort, enhanced Milky Way, survey Milky Way, nearby systems, satellites, J2.
- 10 quick views: Earth (atmosphere, LEO, GEO), Moon (exosphere, LLO, NRHO), Mars (atmosphere, skim, LMO, areostationary).
- Full trajectory planner form with 6 actions.
- Backend picker, star-system picker, return-to-solar-system button.
- Route, scale and render status chips.

## Restored in this PR

| Item | Basis | Differs from the old version |
|---|---|---|
| Asteroid and Kuiper switches | Existing `setVisible` | None |
| Asteroid ring band | New; real catalog | Density-shaded instead of uniform. See below |
| Moons switch and picker | Existing catalog and ephemerides | Planets stay enlarged and moons sit at true altitude (owner decision), replacing the old planet shrink. Costs 280 ms and 2.9 MB at startup; frame time unchanged |
| Moon quick views (Exosphere 15 km, LLO 100 km, NRHO 30,000 km) | Altitudes recovered from `visualProfiles.ts` | Guide rings not restored |
| Earth satellites switch | Existing `satelliteSystem.ts` | Earth only. Defaults off, because switching on downloads orbits from CelesTrak |
| Mission planner | Existing `plannerController`, `routeRenderer`, `createTrajectoryClient` | Route arcs stay at their computed departure and arrival positions |
| Moon and Mars maps | Git history | Fed into today's terrain shader, not the old materials. Moon rendering verified at 0.94-0.95 correlation with the source map, zero longitude offset |

## Do not restore

| Old code | Why not |
|---|---|
| Synthetic asteroid generator, about 500 lines | Random orbits with hand-tuned gaps. The 100k JPL catalog is real data. |
| Asteroid "detail" layer | Zooming in spawned *new random asteroids* around the camera. |
| Kuiper detail layer | A random cloud around the camera with a fake `rotation.z += 0.00004`. |
| Per-frame route re-anchoring | Dragged a planned transfer to wherever the planets are now, which is misleading. |
| Unconditional planet shrink when moons exist | Made Venus about 20x Earth's displayed size. |

Route arcs remain illustrative cubic curves between the correct endpoints, not propagated conics. That limitation predates this work.

## Your call: lost, not requested

| Feature | State of the code | Effort |
|---|---|---|
| **Saturn and Uranus rings** | Deleted; 30 lines to reinstate | Small |
| Named asteroids in the picker (Ceres, Vesta, Pallas, Hygiea) | Removed from the catalog 2026-03-01 (`d9a4b4e`); data still in `planets.ts` | Small |
| Mission plan with real vehicles | Button works, but the default vehicle cannot close a round trip and the form has no vehicle or mining inputs | Medium |
| Real Mars terrain | Needs the MOLA elevation product (the retained file is a picture) | Small |
| Earth clouds, atmosphere, ocean | `cloudDataPipeline.ts` remains; textures in history | Medium |
| Mars clouds, atmosphere, polar caps | Same | Medium |
| Earth and Mars quick views | Same mechanism as the Moon's; Mars altitudes recoverable | Small |
| Real planet textures for Earth, Mercury, Venus, gas giants | In history; **provenance unrecorded** | Medium, needs a rights decision |
| Moon and Mars spacecraft (LRO, CAPSTONE, Chandrayaan-2; MRO, MAVEN, Odyssey) | Lists in deleted `visualProfiles.ts` | Small |
| Satellite J2 switch | Supported by the module; defaults on | Trivial |
| Oort cloud | Decorative random points | Small |
| Gravity vectors, realism locators | Deleted; `labelSystem.ts` remains | Small |
| Milky Way survey | `milkyWay.ts` remains; 2MASS texture in history | Small, needs a rights decision |
| Adaptive near-surface zoom | `cameraController.ts` remains | Small |
| Live REBOUND/TudatPy backend picker | Client and `/ws/sim` both remain | Medium |

**Separate PR, as agreed:** nearby star systems (`nearbySystemsRenderer`, `localSystemRenderer`, `transitions`, star-system picker).

## Textures

Mars: **yes, the NASA maps survive**, in git history and now partly back in the app. Some files are not what their names say, so each was inspected before restoring.

| File | MB | What it actually is | Source | This PR |
|---|---:|---|---|---|
| `moon_albedo_lroc_8192.jpg` | 9.43 | Full-colour Moon | NASA SVS CGI Moon Kit, `lroc_color_poles_8k` | **Restored** |
| `moon_relief_ldem16_5760.png` | 3.61 | True elevation, 8-bit | Same kit, `ldem_16_uint` | **Restored** |
| `mars_albedo_usgs_4096.jpg` | 1.66 | Full-colour Mars | Appears to be USGS Viking colorized mosaic; **exact product unrecorded** | **Restored**, `review-required` |
| `mars_albedo_usgs_2048.jpg` | 0.44 | Smaller copy of the above | Same | Not needed |
| `mars_relief_mola_2048/4096.png` | 1.97, 8.11 | **Shaded-relief picture, not heights**. Olympus Mons reads the same as Hellas | Unrecorded | Left out; cannot drive terrain |
| `moon_albedo_lroc_1024.jpg` | 0.09 | **Grey elevation, not albedo** | Unrecorded | Left out |
| `moon_relief_lola_1024.jpg` | 0.15 | **Colour-ramped picture** | Unrecorded | Left out |
| `moon_1024.jpg`, `mars_day_2048.jpg` | 0.24, 0.75 | Unknown | None | Left out |
| Other 15 files | 14.1 | Earth, other planets, Milky Way | None or partial | Your call |

- The old app displaced Mars's surface from a colour channel of that shaded-relief picture, so its Mars terrain was never real.
- Mars is a smooth textured globe for now. Real heights need the actual MOLA elevation product, which is a small follow-up.
- **Moon elevation is calibrated.** NASA documents half-metres above 1727.4 km with a 10 km offset. Independently, the map's lowest and highest points fall on Antoniadi and the Selenean summit, and its mean gives the published 1737.15 km radius.
- **Rights.** NASA SVS states its content is public domain unless noted. The Mars product could not be confirmed (USGS page returned HTTP 403), so it needs your check against `docs/distribution-policy.md` before any release.

## Asteroid band: what was measured

From the 100,000-row catalog in the repo:

| Resonance | Count vs flanks in semi-major axis | Count vs flanks in position |
|---|---:|---:|
| 4:1, 2.065 AU | 0.000 | 0.983 |
| 3:1, 2.502 AU | 0.033 | 0.979 |
| 5:2, 2.825 AU | 0.178 | 1.021 |
| 7:3, 2.958 AU | 0.614 | 1.008 |
| 2:1, 3.279 AU | 0.017 | 1.001 |

- **Kirkwood gaps vanish in position.** They are gaps in orbit size, and eccentricity fills them. A density band must not draw them.
- **Extent.** Above 10% of peak from 1.80 to 3.75 AU, above 1% from 1.60 to 4.05 AU. The old band was 2.02 to 3.36 AU. Peak at 2.83 AU.
- **Real asymmetry.** About 6.8% more asteroids toward ecliptic longitude 180°. The inner edge moves 1.80 to 2.00 AU around the ring, and the densest radius 2.73 to 2.92 AU.
- **Why orbit-averaged, not today's positions.** A snapshot's asymmetry wanders from 2% to 28% in any direction within ±16 years, and only settles near 7% after 60 or more years. Catalogued asteroids are bunched in orbital phase (6-10% today, decaying to 0.5%), which is consistent with a detection-time selection effect.

**Limit:** this is the largest 100,000 of 133,963 diameter-bearing main-belt objects in SBDB, not the full belt. The band shows where those objects spend their time. The UI says so.

**Did this already exist?** No. `KIRKWOOD_GAPS` only generates the synthetic fallback belt, the old `ASTEROID_RESONANCES` did the same, and the catalog metadata holds three coarse bins for QA.

## Kuiper belt

No real population exists in the repo. Eight named objects have real JPL elements, and the other 4,992 are synthetic.
The backend's "real Kuiper producer" is a real N-body integration of the same kind of synthetic orbits, and it labels
itself `synthetic_orbit_candidates_not_resonance_verified`.

`scripts/fetch_jpl_sbdb.py` already queries by SBDB class, so a real trans-Neptunian catalog is a small extension.
Owner decision: follow-up PR, then the same measured band.

## Unrelated finding

`src/sunController.frameReview.test.ts` has two failing H2.7 tests on clean `origin/main`, independent of this work.
