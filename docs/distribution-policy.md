# Distribution and binary retention policy

The original code uses the owner's permission-required [LICENSE](../LICENSE).
Permission to distribute this code does not change the independent rights of
third-party data. Build output carries that notice, [NOTICE](../NOTICE.md), this
policy, the Three.js license, and the current source/file registers under `legal/`.

The current supported data-use scope is noncommercial research and evaluation.
SILSO data retain WDC-SILSO / Royal Observatory of Belgium attribution and
[CC BY-NC 4.0](https://www.sidc.be/SILSO/infosndtot). The backend parses daily
sunspot values and combines them with model output; this processing is a
modification, not endorsement. Commercial deployment requires replacing that
source or obtaining applicable permission. These terms apply to SILSO data,
not to otherwise independent original code or public-domain material.

The Solarviews Deimos map was removed from the current source and public
assets on 2026-10-31. Its rights were not established by Viking provenance.
The curated acquisition catalog cannot download it; the retained moon texture
consumer falls back to generated appearance. Eight USGS-hosted moon maps retain
their individual URL, product, credit and SHA-256 in the public attribution
manifest; Phobos also credits mosaic author Phil Stooke. Provider metadata is
preserved; it does not grant rights to unrelated material on those domains.

The 25 unused `src/assets/textures` files were removed after checking source,
script and entrypoint references. Their exact sizes and SHA-256 values remain
in [the retirement inventory](data/retired-texture-assets-2026-10-31.json).
Git history retains their bytes for provenance; this is not a history rewrite.
Restoring one requires a current consumer, exact source and reuse terms.
Three have been restored under `public/textures/surfaces` for the Moon and
Mars terrain shader; the Mars map's exact source remains to be confirmed.
The Earth map there is a new download (NASA Blue Marble: Next Generation,
August 2004), not a restored file: the retired Earth textures had no source.

## Build boundary

`npm run build` layers two independent checks. It first verifies curated moon
textures, lazy moon shards and the Phase 1 asteroid binary against their source
manifests, and all other public files against
[`ci/public-asset-allowlist.json`](../ci/public-asset-allowlist.json). It then
validates every file in the [current file register](data/distribution-files.json). It rejects changed or
missing bytes, unknown source products, symlinks and unlisted public files before
writing notices. The six generated files under `public/legal` are regenerated;
any other file in that directory is rejected. Vite copies the public directory,
including opt-in moon ephemerides;
being dormant at runtime does not exclude an asset from distribution.
The register currently covers 426 public files and 12 retained scientific data
inputs. The [source register](data/distribution-sources.json) records 45 products,
including configured remote/optional providers whose response bytes are outside
this static inventory. Both JSON registers accompany the build as
`legal/DISTRIBUTION-FILES.json` and `legal/DISTRIBUTION-SOURCES.json`.
The scientific catalog builders and tests retain their independent validation.
Build output certifies neither scientific accuracy nor redistribution rights.

Run `npm run verify:distribution` for the offline integrity check and unresolved
product list. `npm run verify:distribution:rights` additionally exits nonzero
while product rights reviews remain incomplete. This second check is deliberately
not a development-build prerequisite: local evaluation and clearance to publish
are distinct decisions. Its scope is the selected noncommercial workflow;
commercial use needs a fresh rights review even after current gaps are resolved.

To change data, regenerate it through its scientific builder, review its source
and applicable terms, then update only the corresponding file hashes, sizes and
product records. Adding a hash does not approve a license. Do not remove a product
from the register merely to make the rights check pass. The current register
retains unresolved JPL numerical-product, exact moon-map, nearby catalog and other
provider reviews; see the [decision checklist](distribution-rights-review.md).

Live provider responses are acquired separately. Their source identifiers,
retrieval times, transformation history and terms must accompany exports.
The historical [2026-10-30 inventory](../agent-notes/DISTRIBUTION_INVENTORY_2026-10-30.md)
is a historical baseline; the two machine-readable registers above supersede
its current-tree counts and stale owner-decision wording. No blanket license or
institutional endorsement is inferred from a NASA, JPL or USGS URL.

## Retention and contributions

Keep compact source catalogs, numerical fixtures, pinned provider inputs and
reproducible generated shards in ordinary Git while they remain necessary to
offline acceptance. Existing pin hashes and content-addressed names are part
of the scientific evidence. Do not silently replace them with Git LFS pointers,
which would break offline readers and current integrity checks. A future storage
migration needs a tested fetch/cache workflow and reviewed evidence continuity.
New binary files require a purpose, producer, exact source, license/credit,
size/hash, deterministic regeneration or capture instructions, and an explicit
decision about whether they belong in `public/`.

Research variants and audit artifacts are historical evidence. Do not rewrite
them as current test results. Use the canonical research index and current
closure ledger; archive rolling logs byte-for-byte before shortening their
navigation. A container image is optional; Linux/WSL2 and the pinned Node and
Python toolchains are the supported development contract.
