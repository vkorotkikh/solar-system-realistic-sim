# Task 6 historical implementation report

This readable archival copy preserves the implementation report's claims and
status at handoff. Full integration acceptance and independent review were then
pending. Later review and repair results belong to their own evidence records.

| Finding | Commit | Change |
|---|---|---|
| F-001 | `5a37287` | Strict maintained-script gate |
| F-021 | `a472f59` | Retire Puppeteer scratch entrypoints |
| F-031 | `fd8d149`, `ebc81a4` | Distribution checks and configured test runner |
| F-006 | `23fb74d` | Current scope and supported-command documentation |

F-001 used pinned Node 22.23.2 and npm 10.9.8 for a fresh `npm ci` in
`/tmp/solar-partials-clean-install-20261031`. It installed 51 packages, audited
52 and reported zero vulnerabilities; root used that result through a
`node_modules` symlink. The new strict script gate first reproduced two TS2322
errors in `catalog_fetcher`, then passed after catalog retirement. The existing
blocking browser matrix remained configured.

F-021 replaced Puppeteer scripts containing personal paths with actionable
retirement messages and migration to maintained Playwright commands.

F-031 removed 25 unreferenced source images totaling 40,557,506 bytes, retaining
SHA/size inventory and Git provenance. It removed the unlicensed public Deimos
map and curated ingestion entry, and retained eight USGS maps with the Phobos
author credit. The prebuild gate validates the exact source catalog, unique
manifest images and hashes; rejects unlisted or unreviewed maps; and copies
code, data and Three.js notices. Three distribution tests passed in Vitest.
An initial native Node test also passed, but the test framework was corrected
so the checks run under `npm test`.

The build passed with 76 modules and the existing 984 kB chunk warning. The full
prior `DevelopmentImprovements` archive remained byte-identical; its current
index was reduced to 82 lines and 4,762 bytes while retaining summaries of all
unresolved entries. Added documentation includes CONTRIBUTING, distribution and
binary-retention policy, canonical research navigation and editor
recommendations. The `.gitattributes` change preserves the exact archived
original's trailing whitespace.

F-006 aligns README with 423 moon identities, 46 sourced radii, 377 unknown
radii and 410 lazy models; mandatory SHA-256 verification; Float64 storage and
Float32 display; retired CLI migration; mission positive/negative contracts;
and artifact distribution. It makes no new physical-accuracy claim.

## Handoff qualifications

No history rewrite or change to the original owner's license was performed.
The SILSO noncommercial data workflow remains acknowledged, without asserting
unrestricted third-party redistribution. At handoff, copied Markdown notices
still contained repository-relative links and the implementer identified this
for review. Integrated follow-up `2b5ccaa` later addressed portable notice
links; its review is in `review-runtime-delivery.md`.

Full browser, backend and frontend integration results were still required at
handoff. See this directory's README for historical failed/interrupted logs,
later checks and the coordinator's final acceptance responsibilities.
