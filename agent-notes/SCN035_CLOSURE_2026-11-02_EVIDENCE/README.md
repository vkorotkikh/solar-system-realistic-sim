# SCN-035 implementation evidence — 2026-11-02

Base: `4f97dce442cffb46fa9add8fb3a674534dd2333e`; branch
`fix/scn-four-closure-20261102`. Runtime: Node 22.23.2, existing lock-matched
dependencies from `/tmp/solar-partials-clean-install-20261031/node_modules`.

## Reproduced and repaired

Before this change, an unreviewed JSON file placed directly in `public/` passed
`prepareDistribution`: the expected rejection failed in
[red-build-boundary.txt](red-build-boundary.txt). The old gate covered the eight
moon images only. Vite copied the remaining public assets without this check.

The new gate verifies all **426 public files** and **12 named local scientific
inputs** (438 inputs, 77,156,603 bytes), maps each to registered products, refuses
missing/changed/duplicate/unlisted inputs and symlinks, and restricts the generated
legal directory to six known outputs. Those outputs include the exact file
inventory and source/credit register. Scientific model validation remains separate.

[targeted-tests.txt](targeted-tests.txt): **12 tests passed**. Tests exercise the
original public-directory bypass, missing/changed data, unknown products, duplicate
rows, traversal, symlinks, the generated-notice escape hatch, invented rights
status and commercial reinterpretation of the noncommercial scope.

[inventory-verification.json](inventory-verification.json) records the complete
offline check. [prepare.json](prepare.json) records successful packaging.
[rights-check.json](rights-check.json) records the **expected exit 1** for the
unresolved rights review; this is not an unexpected test failure.

## Rights and current decisions

The current source register has **45 product records**. **43 require further
rights review** (including provider-declared public-domain map labels); this is a
product-record count, not 43 independent permission requests. SILSO's selected
noncommercial scope and the packaged Three.js MIT notice are recorded separately.
Original code is already permission-required, Deimos is already removed, and the
SILSO workflow already selects noncommercial research/evaluation. Their former
"owner choice pending" wording is superseded, not reintroduced.

On 2026-11-02 the [JPL SSD FAQ](https://ssd.jpl.nasa.gov/faq.html) requested
permission for republishing site information. Applicability to these specific
derived numerical products remains an explicit decision; no permission was
invented or requested externally. [USGS policy](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits)
distinguishes its own material from hosted third-party works. Direct requests to
all eight CKAN product APIs returned HTTP 403; the retained public-domain labels
therefore remain qualified. [SILSO terms](https://www.sidc.be/SILSO/infosndtot)
support the existing CC BY-NC 4.0 noncommercial policy and attribution requirement.

The [decision checklist](../../docs/distribution-rights-review.md) describes the
remaining concrete review records. No build, hash, institutional URL or automated
gate supplies legal clearance. Runtime response bytes, repository history and a
complete backend dependency SBOM remain outside the stated inventory scope.

Full integrated build and review results are recorded in the final four-issue
implementation report. SCN-035 remains partial for external rights/release review;
the missing full-public provenance gate and stale decision wording are repaired.
