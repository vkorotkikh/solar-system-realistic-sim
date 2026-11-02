# Distribution and binary retention policy

The original code uses the owner's permission-required [LICENSE](../LICENSE).
Permission to distribute this code does not change the independent rights of
third-party data. Build output carries that notice, [NOTICE](../NOTICE.md), this
policy and the Three.js license under `legal/`.

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

## Build boundary

`npm run build` first validates the curated texture manifest and exact image
hashes, refuses unlisted or unresolved-license moon assets, and packages notices.
It must fail before publishing if an unreviewed map is placed in that public
directory. Vite copies the public directory, including opt-in moon ephemerides;
being dormant at runtime does not exclude an asset from distribution.
The scientific catalog builders and tests validate their own source/artifact
hashes. Build output is not a new certification of scientific accuracy.

Live provider responses are acquired separately. Their source identifiers,
retrieval times, transformation history and terms must accompany exports.
The historical [2026-10-30 inventory](../agent-notes/DISTRIBUTION_INVENTORY_2026-10-30.md)
is a baseline, not the current release manifest. No blanket license or
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
