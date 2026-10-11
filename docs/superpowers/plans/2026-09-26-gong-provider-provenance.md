# Bounded GONG Provider and Provenance Implementation Plan

> Execution branch: `fix/r3-r4-pfss-remediation`
>
> Scientific-core baseline: `0f42cc1`
>
> Governing specification:
> `agent-notes/R3R4_PFSS_IMPLEMENTATION_PROMPT_2026-09-25.md`, Phase 4.

## Objective

Replace the dormant hand-written GONG downloader/FITS reader with a bounded, testable provider that
can construct an immutable, fully identified zero-point-corrected GONG synoptic-map snapshot. Make
Carrington/time/unit/WCS semantics explicit, remove the false realtime `ready` signal, and give PFSS
an observed-snapshot seam without weakening the corrected harmonic/tracing/WSA core.

This tranche proves provider mechanics with synthetic GONG-shaped FITS fixtures. It does **not**
claim general GONG/PFSS scientific fidelity: redistribution approval, an immutable real-product
fixture, independent `sunkit-magex` comparison, and real-map tracer/convergence gates remain open.
Live acquisition is therefore not connected to a runtime PFSS path in this tranche: hybrid remains a
labelled synthetic fallback and data-driven mode fails closed. A bare feature flag cannot promote
observed input; promotion requires the real-product artifacts/gates and the supervised worker tranche.

## Verified starting defects

- Production PFSS never calls the legacy fetcher; it always reports a labelled synthetic fallback.
- The realtime provider imports the GONG fetcher but never calls it, then reports `status=ready` and
  `ok=true` without observing any product.
- The legacy archive code requests a monthly `bqs` directory even though the archive contains daily
  subdirectories, mistakes the filename's left-edge CR for the current/requested CR, and substitutes
  an arbitrary same-month file when its guessed CR is absent.
- Listing/file reads and gzip expansion are unbounded; redirects, total deadline, header size, image
  shape/pixel count, and expansion ratio are not governed.
- The parser loses `BLANK`, WCS, units, row order, longitude origin, observation time, content hash,
  zero-point/polar-fill/radial assumptions, and all source provenance.
- Carrington `27.2753 d` is mislabeled sidereal, the CR arithmetic uses truncation instead of floor,
  the TT epoch is not represented as scale-aware time, and the provider-facing conversion treats an
  unlabeled JD as UTC.
- Request timeout is currently part of PFSS scientific cache identity even though it is attempt
  metadata; a future observed result needs content-addressed identity instead.

## Frozen contract for this tranche

### Product and archive

- Product: NSO/GONG Zero Point Corrected QuickReduce synoptic map, token `zqs`, filename prefix
  `mrzqs`.
- Archive base: `https://gong.nso.edu/data/magmap/QR/zqs/`.
- Allowed hierarchy:
  `YYYYMM/mrzqsYYMMDD/mrzqsYYMMDDtHHMMcCCCC_LLL.fits.gz`.
- Selection: exact product and latest provider timestamp at or before requested UTC; no future
  selection; maximum age 36 hours; no arbitrary product/month substitution. Do **not** filter on a
  locally estimated current rotation: filename `cNNNN_LLL`, `CAR_ROT`, and `LONG0` identify the map
  left edge, while validated `CRNOW` identifies the provider's current fractional rotation.
- Filename timestamp and left-edge CR/longitude must agree with FITS metadata. `CRNOW`, `CREDGE`,
  `CAR_ROT`, `LONG0`, `MAPL0`, and `LONGADJ` must satisfy these frozen relations (longitude modulo
  360; tolerances `5e-4 deg` and `5e-7` rotation):
  - filename `cNNNN == CAR_ROT == CARROT`;
  - filename `_LLL == LONG0 == MAPEDGE` and `MAPNAME == "NNNN_LLL"`;
  - `CREDGE == CAR_ROT + ((360 - LONG0) mod 360) / 360`;
  - `MAPL0 == (LONG0 + 60) mod 360`;
  - `CR60 == CREDGE - 60/360`;
  - `CRNOW == CR60 - LONGADJ/360`;
  - `CRVAL1 == (LONG0 + 180) mod 360`;
  - `CRCENTER == CREDGE - 0.5`.
  Filename time must equal `DATE-OBS` + `TIME-OBS`, `MAPDATE` + `MAPTIME`, and `DATE` to the
  provider's declared minute precision.

### Time

- Simulation/provider request input is JD TDB and is named as such.
- Carrington rotation 1 epoch is `JD 2398167.4 TT`.
- Mean synodic period is `27.2753 d`; the distinct approximate sidereal period is `25.38 d`.
- Mean rotation-number arithmetic uses floor and scale conversion to TT and is explicitly labelled
  an estimate/search hint. It is not authoritative for apparent Carrington boundaries or provider
  identity; validated GONG `CRNOW` is authoritative for a selected snapshot.
- Native GONG `DATE-OBS` + `TIME-OBS`/`MAPDATE` + `MAPTIME` remains raw provider `UT` provenance.
  Because inspected files omit `TIMESYS`, normalization uses an explicit versioned `UT-as-UTC`
  provider assumption until NSO pins the scale; a derived TDB value is additional and never
  overwrites the raw fields.
- A snapshot is a longitudinally accumulated synoptic surface, not a whole-Sun instantaneous
  observation. Provenance carries last-contributor/reference time, an explicitly approximate mean-
  rotation coverage interval, and a warning that per-longitude observation/weight ages are not
  available from the selected product contract.

### FITS/WCS and physical quantity

- Runtime parser: `astropy==8.0.1`; SunPy and `sunkit-magex` remain oracle-only.
- Expected primary image: exactly one 2-D `180 x 360` image, at most 2,000,000 pixels generally.
- Expected axes: `CRLN-CEA`, `CRLT-CEA`; all `CRPIX`, `CRVAL`, `CDELT`, `PV2_1`, and `LONG0`
  semantics are validated at pixel centers and edges.
- Preserve the native header verbatim. For the exact zqs signature, validate raw
  `CDELT2 ~= 2/180`, omitted-or-degree `CUNIT1/2`, `PV2_1=1`, and omitted-or-zero `LONPOLE`. Build a
  separate normalized WCS header that explicitly sets degree units and `LONPOLE=0`, and converts the
  sine-latitude increment to CEA projection-plane degrees using `CDELT2 *= 180/pi`, matching the
  independently documented SunPy GONG synoptic-map convention. Conflicting explicit units/PV/pole
  metadata fail closed. Validate normalized WCS against hand-derived sentinels, then use exact
  equal-area cell centers; never rewrite native provenance.
- Native rows may be south-to-north; row order is derived from WCS and carried explicitly.
- `BUNIT` must be dimensionally magnetic flux density and is converted once to Gauss. Unknown or
  missing units fail closed.
- `BLANK`, NaN, and infinity are never silently converted to field values. This tranche rejects any
  missing/non-finite science pixel rather than inventing a fill policy.
- The selected `zqs` product is labelled zero-point corrected and provider polar-filled; the stored
  quantity is labelled photospheric magnetic flux density inferred under the provider's
  approximately-radial assumption. These are product-contract fields, not per-file measurements.
- No unbounded or silent monopole correction is introduced. The observed PFSS seam accepts only an
  already balanced map satisfying
  `abs(signed_flux) <= max(1e-12 * unsigned_flux, 1e-12 G * 4*pi)`; it rejects above that limit rather
  than silently dropping fitted `g00`. For an accepted map it records pre-removal signed/unsigned
  flux, removed mean/`g00` (numerical roundoff only), post-removal residual, and policy version. A
  later independent real-map corpus must establish any less restrictive physical correction policy.

### Resource limits

- directory listing: 1 MiB each;
- aggregate listing/download bytes: 16 MiB;
- compressed FITS: 8 MiB;
- expanded FITS: 32 MiB;
- FITS header: 256 KiB;
- pixels: 2,000,000;
- gzip expansion ratio: 100x;
- redirects: 3, HTTPS only, exact allowlisted host and path prefix;
- lookback: 36 hours, bounded day count;
- DNS/connect/read/socket budgets plus a cooperative monotonic deadline for discovery, download,
  expansion, FITS/WCS, and validation in the offline/scheduled-smoke tool.

Limit and `limit+1` tests use injected tiny budgets; they do not commit attack-sized fixtures or
sleep for wall-clock time. These in-process limits cannot kill a blocked DNS/socket/native parser;
therefore they are not runtime admission evidence. Live runtime use remains unreachable until the
supervised process design owns capacity through exit/reap and enforces RSS/FD/temp/output/deadline
limits with generation fencing.

## Commit sequence

### Task 1 — Product ADR, pinned dependency, and scale-aware Carrington semantics

Files:

- add `docs/adr/0005-gong-zero-point-provider.md`;
- modify `backend/requirements.txt`;
- add `backend/tests/test_carrington_semantics.py`;
- modify `backend/sim/pfss_magnetogram.py` only for compatibility delegates/constants;
- add `backend/sim/solar_time.py` if separation keeps Astropy/provider concerns out of the solver.

TDD gates:

- period names are correct;
- CR epoch is explicitly TT;
- floor behavior immediately before/at/after positive and pre-epoch boundaries;
- one physical instant represented in UTC/TT/TDB produces the same CR;
- same numeric JD with different declared scales is not silently treated as the same instant;
- immutable independent ordinary-date and rotation/month/year-boundary sentinels gate UTC/TT/TDB to
  apparent CR/current-longitude behavior; the official CR2242 start and a GONG `CRNOW` boundary pair
  are included with source/tool/version provenance;
- current UTC-to-JD helper returns/labels TDB.

Commit: `fix(solar): make Carrington time semantics explicit`

### Task 2 — Immutable FITS/WCS snapshot parser

Files:

- add `backend/sim/gong_magnetogram.py`;
- add `backend/tests/test_gong_fits.py`;
- add `backend/tests/test_gong_wcs.py`;
- add a synthetic fixture manifest and independent coordinate sentinels under
  `backend/tests/fixtures/gong/synthetic-v1/`.

TDD gates:

- Astropy applies `BSCALE`/`BZERO` exactly once and respects `BLANK` before scaling;
- missing/unknown/wrong-dimension `BUNIT`, invalid HDU/shape/pixels/header, NaN, and infinity reject;
- WCS pixel centers, native south-first row order, left edge, `LONG0`, and seam match literal
  independent sentinels;
- conflicting filename/header time, CR, or longitude rejects;
- arrays and grid are immutable;
- normalized content hash covers canonical dtype/shape/grid/field/product/transform metadata;
- retrieval time, gzip container metadata, and timeout are excluded from scientific identity;
- public provenance includes request TDB, reference UTC/TDB, product/revision, URL/filename, units,
  WCS/transform version, hashes, radial/polar/zero-point semantics, flux metrics, `CRNOW`, current
  CR/central-meridian longitude, left-edge Carrington fields, longitudinal accumulation semantics,
  and the explicitly approximate coverage interval.
- immutable `SnapshotId` combines product/revision, normalized content hash, provider reference time,
  coverage interval/semantics, `CRNOW`/current longitude, `CREDGE`/`CAR_ROT`/`LONG0`, and grid/
  transform identity. Identical pixels with different provenance are distinct snapshots.

Commit: `feat(solar): validate GONG FITS and WCS provenance`

### Task 3 — Bounded archive discovery and acquisition

Files:

- extend `backend/sim/gong_magnetogram.py`;
- add `backend/tests/test_gong_archive.py`.

Use an injected transport and monotonic clock. Production transport streams bytes with an explicit
cap, validates every redirect and final URL, and never follows a listing-provided absolute/path-like
target.

TDD gates:

- exact product and latest-at-or-before selection across day/month/year/current-CR boundaries;
- a boundary pair where filename `cNNNN` stays constant while `floor(CRNOW)` changes proves that
  local mean-CR filtering is never used;
- future-only, too-old, ambiguous same-rank, wrong-product, malformed filename, and archive
  miss fail with stable typed reason codes;
- traversal, encoded traversal, query/fragment/userinfo, HTTP, cross-host, cross-prefix, redirect loop,
  and redirect overflow reject before unsafe fetch;
- all byte/header/pixel/ratio/cooperative-deadline bounds pass exactly at the limit and fail at
  `limit+1`;
- injected DNS, connect, read, and socket-stall expiry each produces its stable typed reason, redirect
  chains consume the same aggregate/deadline budget, total-deadline expiry takes precedence, and no
  failed attempt commits provider cache state;
- gzip CRC/truncation/concatenated-member attacks fail closed;
- invalid observations never enter provider cache.

This task produces an offline/scheduled-smoke acquisition tool, not an API-process live fetch path.
Hard timeout/kill/reap/restart evidence belongs to the supervised-worker tranche.

Commit: `feat(solar): bound GONG archive acquisition`

### Task 4 — PFSS observed-snapshot seam and scientific identity

Files:

- modify `backend/sim/pfss_magnetogram.py`;
- modify `backend/tests/test_pfss_cache.py`;
- modify `backend/tests/test_pfss_decomposition.py`.

The cache seam consumes either an immutable, test-injected observed snapshot or an explicitly
requested synthetic snapshot; this tranche does not let the API process acquire live observed data.
A provenance-bearing PFSS result key includes source kind, full `SnapshotId`, harmonic/PFSS/tracing/
WSA versions, numeric source-surface radius, seeding policy/version, effective WSA boundary-grid
`(n_lat,n_lon)`, flux-balance/preprocessing policy version, line count, and `lmax`; transport timeout/
retrieval timestamp are not scientific identity. A future field-only numerical subcache may reuse
identical content hashes, but must assemble per-snapshot provenance outside that subcache.

TDD gates:

- the same full observed `SnapshotId` reuses across request JDs/timeouts;
- distinct provider times/coverage/CR/left-edge metadata with identical pixels do not collide;
- changed same-CR content, product, transform, solver, or grid identity recomputes;
- changing `r_ss`, seeding policy, either effective WSA grid dimension, or balance/preprocessing
  policy recomputes independently;
- observed and synthetic never collide;
- synthetic exact JD/activity remain distinct;
- invalid observations commit neither provider nor PFSS cache state;
- 32 identical solution misses still single-flight once a snapshot is resolved;
- all scientific-core suites remain unchanged and green.

Commit: `refactor(pfss): key solutions by magnetogram snapshot`

### Task 5 — Truthful runtime policy and realtime status

Files:

- modify `backend/sim/solar_realtime_data.py`;
- modify `backend/sim/solar_physics.py`;
- modify `backend/server.py`;
- modify `src/frontend/features/solar/solarPhysicsClient.ts` and its focused tests;
- add/modify focused realtime/model/API tests.

Behavior:

- `synthetic`: zero GONG network calls and no fallback claim;
- `hybrid`: remains a stable labelled synthetic fallback with reason `disabled_unvalidated`;
- `data_driven`: returns 503 because no promoted observed provider exists;
- no environment flag alone can make live GONG data eligible for PFSS; promotion requires a
  committed real-product manifest/fixture or immutable mirror, independent corpus/convergence gates,
  and the supervised worker/recovery contract;
- realtime status reports the same disabled/unvalidated promotion state rather than independently
  claiming/fetching `ready`;
- no raw exception text becomes a cache key or public fallback reason.
- migrate the public time contract to explicit `jd_tdb` input and `epoch_jd_tdb`/
  `wall_epoch_jd_tdb` output with `jd_time_scale="TDB"`. A temporary legacy `jd` alias, if retained,
  is documented as TDB, conflicts with `jd_tdb` are rejected, and canonical labelled fields are
  always returned. The first-party client sends `jd_tdb`. Tests cover supplied TDB, default-now TDB,
  TDB-to-provider-UTC selection, alias compatibility, and conflict rejection.

Commit: `fix(solar): fail closed on unvalidated GONG input`

### Task 6 — Evidence, review, and status

Run:

```text
PYTHONPATH=backend <python-with-astropy-8.0.1> -m pytest -q \
  backend/tests/test_carrington_semantics.py \
  backend/tests/test_gong_fits.py \
  backend/tests/test_gong_wcs.py \
  backend/tests/test_gong_archive.py \
  backend/tests/test_pfss_cache.py \
  backend/tests/test_pfss_decomposition.py

PYTHONPATH=backend <python-with-astropy-8.0.1> -m pytest -q \
  backend/tests/test_pfss_harmonics.py \
  backend/tests/test_pfss_decomposition.py \
  backend/tests/test_pfss_analytic_fields.py \
  backend/tests/test_pfss_tracing.py \
  backend/tests/test_wsa_semantics.py

PYTHONPATH=backend <python-with-astropy-8.0.1> -m pytest -q backend/tests
npm test
npm run build
npm run typecheck
git diff --check
```

Update the canonical prompt/status with exact commits, pass counts, dependency version, synthetic
fixture hashes, review findings, and remaining blockers. Strict TypeScript remains honestly red unless
this tranche changes it; no provider work may be used to declare R3/R4 closed.

Commit: `docs(solar): record bounded GONG provider evidence`

## Definition of done

- Legacy FITS/archive functions are removed from `pfss_magnetogram.py`.
- No route reports GONG ready without a validated snapshot/status from the provider.
- All network, redirect, read, expansion, header, shape/pixel, and deadline limits are behavioral
  gates, not comments.
- Exact product/time selection cannot substitute a future, other-product, or arbitrary monthly file,
  and a selected file is never relabelled with a locally estimated rotation.
- Astropy FITS/WCS parsing preserves physical scaling and proves coordinate orientation using
  independent sentinels.
- Carrington epoch/period/time-scale semantics are named and boundary-tested.
- Observed/synthetic provenance and full snapshot identity cannot collide; equal pixels with distinct
  provider time/coverage/Carrington provenance remain distinct; timeout is attempt metadata.
- Synthetic-only, hybrid-fallback, and strict data-driven behavior are explicit and tested.
- Existing scientific-core and full backend/frontend/build gates do not regress.
- Independent review has no unresolved Critical or Important finding.
- Real-product redistribution/oracle/convergence and killable-worker limitations remain explicit;
  observed network ingestion is unreachable from runtime until those promotion gates are satisfied.
