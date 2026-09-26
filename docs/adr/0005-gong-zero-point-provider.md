# ADR 0005: Bounded GONG zero-point-corrected provider contract

Status: Accepted

## Context

The legacy magnetogram path hand-parses a subset of FITS, requests the wrong
archive shape, can substitute an arbitrary monthly file, and discards the time,
WCS, unit, product, and coverage metadata needed to identify an observation.
It is not used by the production PFSS cache, which currently emits a labelled
synthetic fallback, but retaining ambiguous contracts would make a future live
connection unsafe and scientifically misleading.

Carrington handling also mixed distinct concepts.  The value `27.2753 d` was
labelled sidereal even though it is the mean synodic period.  The rotation-one
epoch `JD 2398167.4` was stored without its TT scale, raw numeric JDs were used
without conversion, and truncation toward zero broke rotations before the
epoch.  A mean-period estimate is not an apparent-Sun ephemeris and is not
provider product identity.

## Product decision

The observed provider will accept only NSO/GONG Zero Point Corrected
QuickReduce synoptic maps:

- product token `zqs`, filename prefix `mrzqs`;
- archive root `https://gong.nso.edu/data/magmap/QR/zqs/`;
- hierarchy `YYYYMM/mrzqsYYMMDD/mrzqsYYMMDDtHHMMcCCCC_LLL.fits.gz`;
- exact product, latest provider timestamp no later than the requested UTC,
  maximum age 36 hours, with no future, other-product, or arbitrary-month
  substitution;
- validated `CRNOW` is authoritative for the product's current fractional
  rotation, while filename `cCCCC`, `CAR_ROT`, and `LONG0` describe the map's
  left edge and cannot be used as the current rotation.

Runtime FITS and WCS handling is pinned to `astropy==8.0.1`.  SunPy and
`sunkit-magex` remain oracle-only dependencies.  This ADR does not enable live
acquisition: the bounded archive transport, immutable snapshot parser, real-map
oracle corpus, and supervised worker gates are separate changes.  Until those
gates land, hybrid remains an explicit synthetic fallback and data-driven mode
must fail closed.

## Time and Carrington decision

All simulation/provider request JDs are JDTDB and names must carry that scale.
Conversions use Astropy `Time`; code must not perform arithmetic on numeric JDs
that merely happen to have different UTC, TT, or TDB labels.

- Carrington rotation 1 starts at `JD 2398167.4 TT`.
- The mean synodic period is `27.2753 d`.
- The defining approximate sidereal rate is `14.1844 deg/day`, giving
  `360 / 14.1844 = 25.379995... d` (approximately `25.38 d`).
- Mean rotation arithmetic converts the instant to TT and uses mathematical
  floor.  It is versioned and exposed only as
  `mean_synodic_search_hint_v1`.
- Mean rotation boundaries are constructed in TT and explicitly converted to
  JDTDB by compatibility adapters.
- GONG `CRNOW` produces the authoritative integer rotation with `floor(CRNOW)`
  and current longitude in `[0, 360)` as
  `(-360 * fractional_part(CRNOW)) mod 360`.
- Native GONG `DATE-OBS`/`TIME-OBS` and `MAPDATE`/`MAPTIME` remain raw provider
  `UT` provenance.  Because the inspected product omits `TIMESYS`, the provider
  parser will retain those fields and apply a versioned `UT-as-UTC` assumption
  when deriving UTC/TDB; it will never overwrite the raw values.

The server's current-time groundwork is `current_jd_tdb()` plus the explicit
label `CURRENT_JD_TIME_SCALE = "TDB"`.  Existing consumers are migrated only
when their response contract can carry the label; this change does not silently
relabel the old generic helper.

## Independent sentinels

Tests commit literal results rather than importing an oracle package:

- SunPy 7.1.2 documents `carrington_rotation_time(2242)` as
  `2021-03-17T22:31:37.030 UTC`.  Astropy 8.0.1 converts that instant to
  `JDTDB 2459291.4394237916`.  The linear mean model yields
  `2242.0033775530696`, deliberately proving that the search hint is not the
  apparent boundary.  Source:
  `https://docs.sunpy.org/en/stable/generated/api/sunpy.coordinates.sun.carrington_rotation_time.html`.
- Archived zqs header `mrzqs210317t2114c2242_301.fits.gz` reports
  `CRNOW=2241.9967070`, `CAR_ROT=2242`, `LONG0=301`; header
  `mrzqs210317t2214c2242_300.fits.gz` reports `CRNOW=2242.0012631`,
  `CAR_ROT=2242`, `LONG0=300`.  Thus the authoritative current rotation wraps
  while both filenames remain `c2242`.  The immutable source paths are under
  `https://gong.nso.edu/data/magmap/QR/zqs/202103/mrzqs210317/`; headers were
  inspected on 2026-09-26 with gzip 1.12.
- UTC/TT/TDB literals for `2024-01-01T00:00:00 UTC`, the 2024 leap-day case,
  and the CR2242 boundary are generated with Astropy 8.0.1 and checked without
  network access.  Their purpose is scale conversion and boundary behavior,
  not replacement of an apparent-Sun ephemeris.

## Consequences

PFSS compatibility functions retain their names but now state that numeric
inputs/outputs are JDTDB and delegate to the scale-aware module.  Code that
needs an authoritative observed rotation must use validated provider metadata,
not the mean helper.  The provider parser must preserve the raw header and add
derived time values as provenance.

This decision does not claim that a synoptic map is an instantaneous whole-Sun
observation.  Snapshot provenance will carry the last-contributor/reference
time, approximate mean-rotation coverage, and a warning that per-longitude
observation/weight ages are unavailable from this product contract.
