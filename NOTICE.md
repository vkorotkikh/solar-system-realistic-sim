# Third-party data and assets

This notice is an attribution and provenance record. The owner's
[permission-required notice](LICENSE) applies to the original code: copying
and redistribution require express permission. Third-party material retains
its own terms; permission for this code does not relicense datasets,
photographs, maps, fonts or downloaded textures.

## Important distribution limits

- Solar System Scope / INOVE textures are distributed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credit the provider
  and identify modifications. The provider describes enhanced colors and
  fictional terrain in unmapped areas: these are illustrative maps, not a
  blanket claim of measured surface fidelity.
  [Source and terms](https://ssi.solarsystemscope.com/textures/).
- SILSO sunspot data, World Data Center SILSO, Royal Observatory of Belgium,
  Brussels, use [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).
  Preserve attribution and identify processing. Commercial use requires a
  separate rights decision; the project's code license cannot remove this
  restriction. [Provider terms](https://www.sidc.be/SILSO/infosndtot).
- The Solarviews Deimos map was removed from the current tree and acquisition
  catalog on 2026-10-31 because redistribution permission was unresolved.
  The retained moon renderer uses generated appearance when no map is available.
  Solarviews hosts both government and privately copyrighted imagery; being
  Viking-derived is not sufficient evidence of a redistribution grant.
  [Provider policy](https://solarviews.com/eng/copyright.htm) and
  [image context](https://solarviews.com/eng/deimos.htm).
- NASA/JPL imagery must retain the product's specific credit and restrictions.
  NASA/JPL provenance alone is not a blanket license for third-party material
  hosted there. Do not imply institutional endorsement.
  [JPL image-use policy](https://www.jpl.nasa.gov/jpl-image-use-policy/).

## Bundled moon maps

The eight retained USGS-hosted moon maps have individual
URLs, credits, byte counts, and SHA-256 records in
`public/textures/moons/moon_texture_attribution.json`. Their source catalog is
`src/frontend/features/planetary/moonTextureCatalog.ts`. Preserve those records
with redistributed assets. The Phobos source additionally requests citation of
its author, Phil Stooke; see the
[USGS product record](https://astrogeology.usgs.gov/search/map/phobos_viking_global_mosaic_5m).
Existing "Public domain" catalog labels for other maps are source metadata,
not a newly completed legal review of every asset.

## Other scientific sources

The application uses or offers data from JPL SSD/SBDB/Horizons, NASA/ESA missions,
USGS, NOAA SWPC, Helioviewer, CelesTrak, Gaia, and the d3-celestial project.
Retain product identifiers, retrieval dates, transformations, and upstream
attribution when archiving or exporting their data. Runtime availability does
not establish redistribution rights.

The d3-celestial project's software carries Olaf Frohn's BSD-3-Clause notice;
that software license does not, by itself, settle every underlying astronomical
catalog's terms. [Upstream license](https://github.com/ofrohn/d3-celestial/blob/master/LICENSE).
Gaia acknowledgments depend on the particular release/product actually used.

The current local/static release inventory is recorded in
[`DISTRIBUTION_INVENTORY_2026-10-30.md`](agent-notes/DISTRIBUTION_INVENTORY_2026-10-30.md).
The current [distribution policy](docs/distribution-policy.md) restricts the
SILSO-enabled data workflow to noncommercial research/evaluation and removes
the unresolved Deimos map. The build validates curated image provenance and
packages notices. The historical inventory is not a legal clearance or a
current byte inventory; new products require their own source and rights review.
