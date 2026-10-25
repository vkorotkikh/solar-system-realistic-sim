# Third-party data and assets

This notice is an attribution and provenance record, not a license grant for
the repository's original code. The owner has not yet selected that license.
Third-party material retains its own terms; a future code license must not be
assumed to relicense datasets, photographs, maps, or downloaded textures.

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
- The bundled Deimos map
  `public/textures/moons/moon_mars_deimos_solarviews_1440.jpg` has unresolved
  redistribution permission. The catalog already records this uncertainty.
  Solarviews hosts both government and privately copyrighted imagery; being
  Viking-derived is not sufficient evidence of a redistribution grant.
  [Provider policy](https://solarviews.com/eng/copyright.htm) and
  [image context](https://solarviews.com/eng/deimos.htm).
- NASA/JPL imagery must retain the product's specific credit and restrictions.
  NASA/JPL provenance alone is not a blanket license for third-party material
  hosted there. Do not imply institutional endorsement.
  [JPL image-use policy](https://www.jpl.nasa.gov/jpl-image-use-policy/).

## Bundled moon maps

The eight USGS-hosted moon maps and the Solarviews Deimos map have individual
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

SCN-035 remains open pending the original-code license decision, complete
per-product attribution review, and a permission or replacement decision for
the Deimos map. See
`agent-notes/REMEDIATION_PROVENANCE_2026-10-14.md` for the review record.
