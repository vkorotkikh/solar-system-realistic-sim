# Distribution rights decisions — 2026-11-02

The selected original-code license, noncommercial SILSO workflow and removal of
the unresolved Deimos map are implemented. Those three decisions are no longer
waiting for an owner choice. Third-party product review remains distinct.

The build now carries an exact file inventory and the product register. Use
`npm run verify:distribution:rights` to enumerate remaining product IDs. Do not
turn a provenance check into a claim that permission has been granted.

| Product family | Evidence and remaining decision |
| --- | --- |
| JPL SSD/SBDB/Horizons numerical products | The [SSD FAQ](https://ssd.jpl.nasa.gov/faq.html) asks republishers to obtain permission. Establish how those terms apply to the specific bundled numerical derivatives and retain any applicable permission/clarification. Preserve solution, query, frame, epoch and transformation provenance. No request has been sent on the owner's behalf. |
| Eight USGS-hosted moon products | The acquisition catalog retains product URLs, credits and public-domain labels. [USGS policy](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) distinguishes USGS-produced material from hosted third-party works. Direct product/API retrieval returned 403 during this review. Retain accessible product-specific terms or permission; the host name alone is insufficient. Phobos includes Phil Stooke's mosaic credit. |
| SILSO daily sunspot values | Noncommercial research/evaluation is selected. Keep WDC-SILSO / Royal Observatory of Belgium attribution, processing disclosure and [CC BY-NC 4.0 terms](https://www.sidc.be/SILSO/infosndtot). A commercial distribution requires a separate decision. |
| Nearby-system, stellar and other configured data products | Preserve each actual release/product, underlying catalog attribution and modification history. Optional/runtime availability does not establish rights. Review the exact source register entries; do not apply a software license to an unrelated dataset. |
| Fonts and live imagery/measurements | Runtime payloads are not pinned by the static inventory. Capture the actual delivered product/version and applicable notices before redistributing an export or archived response. |
| Original code and Three.js | Original code remains permission-required. Three.js MIT text is packaged. Neither licenses independent third-party material. |

For each unresolved product, record the exact product/version, intended use,
authoritative terms URL or retained permission, applicable attribution and
modification requirements, reviewer/date and decision scope. Update the source
register and package any required notices. A screenshot of a domain, a hash or
an unverified label is provenance evidence, not an independent rights grant.

The static gate intentionally does not claim a complete Python dependency SBOM,
audit every historical source/evidence artifact, or clear arbitrary future live
responses. A broader release must enumerate those included components too.
