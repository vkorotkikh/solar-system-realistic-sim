# Local WebKit environment restoration evidence

These text records preserve the isolated WebKit dependency restoration from
`/home/nomad/.cache/solar-webkit-noble-20261101`. They describe the local
qualification environment on Ubuntu Noble. The archived Playwright config,
launcher and smoke script are environment-local records, not product
configuration or portable repository entrypoints. Their absolute paths are
preserved for provenance.

See the [restoration report](../environment-restoration-nov01.md) for the cause,
dependency checks, successful runtime smoke and full-matrix recipe. The smoke
result establishes the recorded WebKit launch, interaction and Canvas2D checks.
The completed browser matrix has its own coordinator-owned result.

| Files | Purpose |
|---|---|
| `manifest.json`, `package-specs.txt` | Exact identities, versions, source/reuse locations and SHA-256 values for 31 Ubuntu packages. |
| `SHA256SUMS` | Original checksums of the package archives. The `.deb` files are intentionally absent from this documentation bundle; this is not a checksum list of these text records. |
| `all-package-uris.txt`, `apt-policy.txt` | Recorded official package URLs and configured APT metadata. |
| `ldd-gtk.json`, `ldd-wpe.json` | Recorded dependency inspection of GTK/WPE executables and bundled libraries. |
| `smoke.mjs`, `smoke.log` | Exact local smoke script and its recorded output. The generated screenshot is not included. |
| `playwright.config.ts`, `pw_run.sh` | Exact isolated config and launcher; the launcher was copied from cache path `browsers/webkit-2370/pw_run.sh`. |
| `discovery-comparison.json`, `discovered-cases.jsonl` | Compact comparison derived from the two existing discovery reports, with their original hashes and the shared normalized cases. |

The discovery comparison confirms the same **170 selected cases**: 57 Chromium,
3 Chromium tab-zoom, 55 Firefox and 55 WebKit. It compares case identities,
timeouts, expected statuses, annotations and tags. Discovery labels do not
represent executed test outcomes; no tests were run to assemble this archive.
The two large discovery reports remain in the cache instead of being duplicated
here.

The eleven copied environment files are byte-identical to their source records.
No package archives, extracted libraries, browser binaries or generated images
are included. The coordinator will add these records to the bundle-wide
provenance and checksum index after final gates; the earlier frozen records
were left unchanged during this archival step.
