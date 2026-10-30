SCN-035 distribution inventory — 2026-10-30

The concrete inventory child is complete for the current local/static scope. SCN-035 remains open: the original code now has the owner-selected permission-required notice in LICENSE. SILSO distribution disposition, Deimos permission or replacement, and remaining per-product rights still require resolution. No third-party legal clearance is asserted.

The companion [JSON](DISTRIBUTION_INVENTORY_2026-10-30.json) contains every public file path, current byte size, SHA-256, source product/group, use classification and per-product notice status. Snapshot: `2026-10-30T05:20:36.433849+00:00` at HEAD `2527db6dd32b5339190ded6d980ef7005ac2592d` plus the then-current shared-worktree changes. The complete moon assets are committed in `2527db6`; startup/UI integration is committed in `409b8a9`. Counts describe this snapshot, not a deployment.

`package.json` runs `vite build`; no root Vite config overrides the default public directory. All **427 public files (64,766,380 bytes)** count as bundled candidates because Vite copies them, including unused/orphan assets. The application was not built or deployed for this inventory. No assets or NOTICE were edited or removed.

| Public group | Files | Bytes | Use / notice status |
|---|---:|---:|---|
| asteroid-phase1 | 3 | 3,610,234 | Binary + metadata requested by entry; sample is unused but copied. SBDB source query/provenance retained; specific credit review open. |
| curated-moon-texture | 9 | 880,188 | Eight USGS maps + Solarviews Deimos. Retained pipeline is outside entry; all nine still copied. Catalog credit/license metadata retained; Deimos unresolved. |
| lazy-moon-ephemeris | 410 | 59,955,387 | 410 content-addressed shards, serving 411 catalog records; Puck shares one model. Opt-in loader has no default entry fetch; all shards copied. |
| lazy-moon-manifest | 1 | 303,149 | 424 catalog records: 13 base models + 411 lazy records / 410 lazy models. References to src/data base artifacts are not extra public files. |
| moon-texture-notice | 1 | 7,321 | Individual nine-map attribution JSON is copied; Phobos author detail remains only in NOTICE. |
| nearby-system-manifest | 3 | 10,101 | Alpha Centauri, Barnard’s Star and Sirius. Sources/notes embedded; retained renderer outside entry, files still copied. |

Each shard entry in JSON records body key/catalog aliases, target/center, ephemeris solution, JD TDB coverage, normalized input path, exact encoded source-query URLs and capture-time qualification. The 410 shard sizes/hashes match their manifest and content-addressed names; five base artifacts and all 410 normalized lazy inputs match their recorded pins. No accuracy claim follows from these integrity checks.

The nine image files match their attribution manifest byte-for-byte. Each has its own source/download URL, provider, dataset, recorded credit and unreviewed catalog license label in JSON. The Phobos record retains the Phil Stooke citation request from NOTICE. Deimos remains permission-pending; NASA/Viking origin does not clear a processed map.

| Source / non-public material | Treatment |
|---|---|
| Catalog response pins | 17 gzip responses (40,159,083 stored bytes; 121,928,490 decoded bytes), plus manifest/README. One SBDB + 16 Horizons. Every stored file and decoded response checked; exact queries retained. Excluded from default Vite copy. |
| Moon generation inputs | 443 files across moon-lazy-inputs, moon-repair-inputs, moon-spk-inputs and moon-vector-inputs, including manifests/READMEs. Local size/SHA records separate from shipped shards. Excluded from default Vite copy. |
| Retained texture sources | All 25 src/assets files (40,557,506 bytes) inventoried separately; no entry syntax imports and outside public. Family attribution is incomplete per file; exact upstream downloads remain unknown. |
| Local catalog/model data | JSON lists source catalog, five base moon artifacts, stars, backend ephemerides and nearby CSV separately. moons.json and planet coefficients have static imports; moon fits have guarded dynamic imports with showMoons=false. No claim about emitted chunks without a build. |
| Tests / evidence / archives | tests, backend/tests, scripts/fixtures/oracles, agent-notes (including historical archive), artifacts, test-results and caches are outside public. Their source/evidence role does not make them release assets. No exhaustive evidence/archive inventory claimed. |

Static import inspection starts at index.html → src/main.ts, follows TypeScript import/export/dynamic-import and worker URL syntax, and includes disabled branches. It found no src/assets references. The shipped entry uses procedural planet maps. Retained cloud, satellite, curated moon texture, nearby-system and local-system renderers/config are outside this graph; a retained product is not reported as an observed network request.

| Remote product / code path | Configured product and boundary | Known notice / open work |
|---|---|---|
| Google Fonts, active CSS | Chakra Petch 500/600; Oxanium 500/600/700; fonts.googleapis.com CSS import. Response-selected font URLs/bytes not captured. | Font-specific licenses/notices absent from reviewed repo; no OFL assumption. |
| Backend live solar context | NOAA SWPC RTSW wind + magnetic 1-minute JSON; SILSO daily total sunspot V2.0 CSV. | NOAA product credit review open. SILSO: WDC-SILSO, Royal Observatory of Belgium, Brussels; DOI and CC BY-NC 4.0 retained; owner commercial/noncommercial disposition pending. |
| SDO/AIA via Helioviewer | Channels 094/171/193/211/304, source IDs 8/10/11/12/13. Closest-image metadata + raw tile proxy; JP2 link metadata. Image ID/time/scale selected at runtime. Surface blending disabled. | Preserve SDO/AIA/Helioviewer product credit, image identity/date and processing; exact per-image restrictions unresolved. |
| JPL Horizons service | Backend mission ephemeris API queries. Browser Phase 1 asteroid loader requests local public binary/metadata, not SBDB directly. | Product, target/time/frame/units/retrieval and transformations retained; no blanket government clearance. |
| Retained Earth/cloud/satellite config | GIBS MODIS_Terra_Cloud_Fraction_Day WMS; CelesTrak stations + geo TLE groups. Outside shipped entry graph. | Provider/product notices and reuse terms not established per product. |
| Retained GONG acquisition | NSO/GONG zqs archive code; runtime status disabled_unvalidated and attempted=false. | Preserve exact FITS/header/product and normalization; provider acknowledgment/rights unknown. |
| Offline/source endpoints | Moon downloads, JPL satellite elements, SBDB Query, Horizons, NAIF kernels, Gaia DR3 ESA/VizieR TAP, optional MPCORB Phase 2. | Separated from runtime requests in JSON. Optional acquisition code does not prove current source enrichment or shipped Phase 2 bytes. |

All canonical source URLs are parsed locally, query parameters decoded and normalized for comparison, and screened for userinfo or credential-like query keys. Literal and canonical forms are retained in the JSON registry; no external URL requests were made. Selected source-reference URLs (for example LROC/LOLA product pages and kernels) are labeled provenance rather than image fetches. Scientific literature links are not treated as remotely loaded assets.

Solar System Scope / INOVE CC BY 4.0 attribution, modification labeling and illustrative-terrain caveats remain as recorded in NOTICE. README’s Earth/Moon three.js image family and PIA04250 2MASS remapping do not provide complete per-image rights/credits. d3-celestial software needs Olaf Frohn’s BSD-3-Clause notice where redistributed; underlying catalog rights and any Gaia release acknowledgments remain separate and unresolved.

The bounded npm runtime license inventory has **1 package: three 0.182.0, MIT**, copied only from the official `license` field in package-lock.json. Dev-only entries are excluded. This is not a complete SPDX document, emitted-bundle audit, or a grant for planetary images. Backend requirements do not supply a resolved lock with per-package license fields, so no backend SPDX licenses were invented.

NOTICE.md, the original provenance note and these notes are outside public; Vite does not automatically carry them into a release. The copied moon attribution JSON is useful but does not establish full notice completeness. Release preparation still needs the applicable complete notices, product-specific credits/acknowledgments and resolution of unknown rights. These remaining rights/notice questions are explicit inventory findings, not missing file enumeration.

Validation was bounded to JSON parsing, exact public path-set comparison, rehashing every listed local file, moon manifest/base/input consistency, decoded catalog response checks, asteroid binary/metadata checksum, URL parsing and the entry syntax graph. No broad tests, application build, deployment inspection, runtime byte capture, or new legal research was performed. Verification recipes are scratch `distribution-build.py`, `distribution-import-graph.json` and `distribution-validate.py` under the authorized /tmp directory.
