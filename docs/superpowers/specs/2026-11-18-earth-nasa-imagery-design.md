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
side, sun glint on the ocean, the cloud layer, and Himalayan relief shading at low sun.
