# Nearby Star Systems Research (2026-02-15)

## Scope
- Objective: identify nearest real star systems and assess how to integrate them into this simulator with dynamic loading and zoom-in system fidelity.
- Method: machine-query primary astronomy catalogues/APIs and map to implementation constraints in the current codebase.

## Current Architecture Constraints
- Sky layers are camera-centered backdrops, not physical 3D stars (`src/main.js`: `createCatalogStarField`, `createSurveyMilkyWaySphere`, and per-frame recentering).
- Relevant lines: `src/main.js:1419`, `src/main.js:1478`, `src/main.js:2086`, `src/main.js:2088`, `src/main.js:3305`-`src/main.js:3307`.
- Backend currently streams only body dynamics state (`backend/server.py`, `backend/sim/rebound_nbody.py`), with no star-catalog or Milky-Way service.

## Nearest Systems (Top 25)
- Source: Gaia EDR3 10 pc sample at VizieR catalog `J/A+A/650/A201`, table `tablea1` (Reyle et al., 2021).
- Distances computed from parallax using `distance_pc = 1000 / plx_mas` and converted to light-years (`ly = pc * 3.26156`).

| Rank | System | Catalog Identifier | Distance (ly) | RA (deg) | Dec (deg) | Exoplanet Archive match |
|---:|---|---|---:|---:|---:|---|
| 1 | Alpha Centauri system (incl. Proxima) | alf Cen C | 4.246 | 217.392321 | -62.676075 | Proxima Cen (2 planet entries in NASA Exoplanet Archive) |
| 2 | Barnard's Star | Barnard's Star | 5.963 | 269.448503 | 4.739420 | Barnard's star (4 planet entries in NASA Exoplanet Archive) |
| 3 | Luhman 16 AB | Luhman 16A | 6.503 | 162.308644 | -53.318045 |  |
| 4 | WISE 0855-0714 | WISEA J085510.74-071442.5 | 7.430 | 133.780984 | -7.243932 |  |
| 5 | Wolf 359 | Wolf 359 | 7.856 | 164.103190 | 7.002727 |  |
| 6 | Lalande 21185 (GJ 411) | HD 95735 | 8.304 | 165.830960 | 35.948653 |  |
| 7 | Sirius AB | alf CMa A | 8.601 | 101.287155 | -16.716116 |  |
| 8 | Luyten 726-8 / UV Ceti AB | G 272-61B | 8.724 | 24.771674 | -17.947683 |  |
| 9 | Ross 154 | Ross 154 | 9.706 | 282.458789 | -23.837097 |  |
| 10 | Ross 248 | Ross 248 | 10.306 | 355.480015 | 44.170376 |  |
| 11 | Epsilon Eridani | eps Eri | 10.502 | 53.228293 | -9.458168 | eps Eri (1 planet entries in NASA Exoplanet Archive) |
| 12 | Lacaille 9352 (GJ 887) | HD 217987 | 10.724 | 346.503917 | -35.847164 | GJ 887 (2 planet entries in NASA Exoplanet Archive) |
| 13 | Ross 128 | Ross 128 | 11.007 | 176.937688 | 0.799120 | Ross 128 (1 planet entries in NASA Exoplanet Archive) |
| 14 | EZ Aquarii (GJ 866) | GJ 866 A | 11.109 | 339.650694 | -15.289647 |  |
| 15 | 61 Cygni AB | 61 Cyg B | 11.404 | 316.753663 | 38.756073 |  |
| 16 | Procyon AB | alf CMi A | 11.462 | 114.825498 | 5.224988 |  |
| 17 | Struve 2398 (GJ 725 AB) | HD 173739 | 11.491 | 280.683071 | 59.638358 | Gl 725 A (1 planet entries in NASA Exoplanet Archive) |
| 18 | Groombridge 34 (GJ 15 AB) | GJ 15 A | 11.619 | 4.613226 | 44.024787 | GJ 15 A (2 planet entries in NASA Exoplanet Archive) |
| 19 | DX Cancri (GJ 1111) | G 51-15 | 11.680 | 127.450092 | 26.773286 |  |
| 20 | Epsilon Indi system | GJ 845 A | 11.867 | 330.872408 | -56.797255 | eps Ind A (1 planet entries in NASA Exoplanet Archive) |
| 21 | Tau Ceti | tau Cet | 11.912 | 26.009055 | -15.933680 | tau Cet (4 planet entries in NASA Exoplanet Archive) |
| 22 | GJ 1061 | L 372-58 | 11.984 | 54.003394 | -44.514362 | GJ 1061 (3 planet entries in NASA Exoplanet Archive) |
| 23 | YZ Ceti | YZ Cet | 12.122 | 18.133254 | -16.996155 | YZ Cet (3 planet entries in NASA Exoplanet Archive) |
| 24 | Luyten's Star (GJ 273) | BD+05 1668 | 12.348 | 111.854628 | 5.209383 |  |
| 25 | Teegarden's Star | Teegarden's Star | 12.497 | 43.269642 | 16.864374 | Teegarden's Star (3 planet entries in NASA Exoplanet Archive) |

## Feasibility: Can We Dynamically Load + Zoom In?
Yes, but with staged fidelity and a multi-scale architecture.

### What is feasible now
- Render nearby systems as physically placed markers using real RA/Dec/parallax and proper motion propagation.
- On selection, transition to a local-system scene anchored at that star (floating origin) and load system-specific bodies/orbits.
- Reuse existing solar-system rendering + backend integration patterns for the selected target system.

### What blocks “solar-system-equivalent fidelity” for every nearby system
- Many systems lack complete, stable, published orbital solutions for all components/planets (especially true masses and full 3D orbital elements).
- Exoplanet catalog entries can include debated/revised candidates; confidence filtering is required.
- Binary/multiple-star dynamics often require dedicated orbit catalogs (not just Gaia positions).

### Practical fidelity policy
- Tier A (high): systems with strong orbital solutions (e.g., Alpha Cen, Sirius, Procyon, 61 Cyg, eps Ind).
- Tier B (medium): systems with partial orbital constraints (Keplerian approximations + uncertainty bands).
- Tier C (low): marker-only systems (position, proper motion, spectral type/brightness).

## Proposed Integration Design
1. Add `nearby_systems` catalog service in backend:
   - endpoint with barycenter astrometry at epoch (RA, Dec, plx, pmRA, pmDE, RV, reference epoch) and aliases.
2. Add astrometric propagation utility (backend preferred):
   - use Astropy `SkyCoord.apply_space_motion` from source epoch to simulation JD.
3. Add front-end “Interstellar Mode” LODs:
   - LOD0: labels/billboards for nearby systems;
   - LOD1: resolved stellar components where known;
   - LOD2: full local-system simulation after selecting a target.
4. Add floating-origin / double-precision world transform layer:
   - keep absolute positions in float64; render camera-relative positions in float32.
5. Add per-system manifests:
   - stars, companions, planets, source provenance, fidelity tier, validity date.
6. Add confidence gating for exoplanets and binary solutions:
   - include only entries meeting selected quality criteria (publication status + parameter completeness).

## Recommended Next Implementation Step
- Implement Phase 1: ingest nearest-system catalog into backend + render interstellar markers in frontend.
- This de-risks coordinate/frame math before attempting per-system N-body zoom-in fidelity.

## Sources
- Reyle et al. (2021), Gaia EDR3 10 pc sample (catalog + table):
  - https://cdsarc.cds.unistra.fr/viz-bin/cat/J/A+A/650/A201
  - https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=J/A+A/650/A201/tablea1
- Reyle et al. (2023), first update of Gaia 10 pc sample:
  - https://arxiv.org/abs/2304.03544
- NASA Exoplanet Archive TAP/API docs:
  - https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html
  - https://exoplanetarchive.ipac.caltech.edu/docs/program_interfaces.html
- USNO Sixth Catalog of Orbits of Visual Binary Stars (ORB6):
  - https://crf.usno.navy.mil/wds/orb6
- Astropy coordinate propagation (`apply_space_motion`):
  - https://docs.astropy.org/en/stable/coordinates/apply_space_motion.html

_Generated on 2026-02-15 08:29:45 UTC._