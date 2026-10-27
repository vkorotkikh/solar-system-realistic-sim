# SCN-043 preserved evidence, 2026-10-15

Historical evidence only. **Two independent P2 review findings remain open, correction approval is pending, and bulk storage approval is pending. Source edits, promotion, and staging remain on hold.** The passing logs predate these findings and must not be used as broad closure or final integration acceptance.

Reviewer: Aristotle, agent `01a13e09-7a4f-7661-a281-5c9d8ab67f82`.

- `src/sim/lazyMoonEphemerides.ts:183`: missing/absurd vectorOracle evidence and individual endpoint errors beyond the fixed caps can pass with consistent content rehashing.
- `src/sim/lazyMoonEphemerides.ts:118`: HTTP-error and oversized-header rejection can release capacity without cancelling the response body. The reviewer observed three rejected probes and zero cancellations.

The earlier acceptance note is provisional in light of these findings. Carry this qualification with the parent reports. Bulk approval remains separate from repair approval; no raw inputs or coefficient shards are included here.

This directory preserves all 20 existing top-level log/JSON evidence files from `/tmp/scn043-lazy-20261015-R0ZX2q` and its `node22` directory, byte-for-byte (615979 bytes of copied evidence). No tests, builds, acquisitions, or version probes were rerun. No source code or existing report was changed. Build trees and temporary checkout snapshots were not copied. Earlier console-only output was not reconstructed or represented as an exact log.

Worktree: `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris`.
Worktree HEAD: `86ac5fe0bad35d5bed4a2a18df82cfc6d453d6f6`.
Parent review target: `4f2e2507797eb73d50443711df433e10032cc3fd`.

Pinned Node evidence is in `node22/vitest.log`, `node22/vitest-results.json`, and `node22/build.log`: Node 22.23.2, 517 passing scoped tests across 10 files, zero failures/skips, and a successful production build. The runtime path is recorded in the unchanged `node22/cold-load.json`. The version stamp in `RUNTIME_VERSIONS.json` distinguishes versions recorded in exact evidence from versions preserved from prior session output/acceptance documentation. npm remained 11.19.0; the package's npm 10.9.8 pin was not verified.

Earlier evidence includes `pytest.log` (7 passed, including the isolated network-blocked offline rebuild), `vitest.log` / `vitest-results.json` (884 passing tests across 36 files on Node 24.21.0), `generate.log`, `provenance.log`, and `build.log`. These results do not cover the subsequently reported open review cases.

The exact cold lazy asset measurement is preserved in `node22/cold-load.json`: 706733 decoded response-body bytes for Amalthea and 1927669 for the largest current one-body load, each including the index and one shard. These are local Fetch Response measurements, excluding HTTP headers and negotiated compression. The complete 60258536-byte published set is deployment storage, not a normal one-body download.

The initial `typecheck-head.log` and `typescript-head-diagnostics.log` came from an incomplete temporary HEAD snapshot missing four fixtures; retain them as superseded attempt logs only. The corrected `typescript-head-complete.log`, `typescript-diagnostics.log`, and `typecheck-comparison.json` show identical 223-diagnostic counts/buckets at the older worktree and its HEAD. Six existing diagnostics caused the ratchet failure. No old-worktree TypeScript fixes were attempted. The parent's strict pass is user-provided context and was not rerun here.

`FILE_HASH_INVENTORY.json` records SHA-256 and exact sizes for every copied evidence file, the generated README/version metadata, the seven authored code files and four related reports, the two data-manifest anchors, and all 820 bulk payload paths. Bulk payload digests are copied from the previously validated manifests: the raw source archives and generated shards were neither read for rehashing nor copied during persistence. Original 13-model artifact digests are retained from the earlier pinned build-integrity report, without a new artifact verification run. `SHA256SUMS` covers every file in this evidence directory except itself, including the inventory.

The three handoff files and separate independent-review note remain outside this directory and should accompany it in the parent copy:

- `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/agent-notes/SCN043_LAZY_PROMOTION_ACCEPTANCE_2026-10-15.md`
- `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/agent-notes/SCN043_LAZY_PROMOTION_AUTHORED_2026-10-15.patch`
- `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/agent-notes/SCN043_LAZY_PROMOTION_READY_FILES_2026-10-15.json`
- `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-ephemeris/agent-notes/SCN043_LAZY_INDEPENDENT_REVIEW_2026-10-15.md`

The durable evidence directory is an additional report artifact beyond the earlier ready-file allowlist; the existing allowlist was not edited. All original paths in copied logs remain verbatim. The corresponding log/JSON files now live under this directory at the same relative paths, so the evidence itself survives deletion of `/tmp`. Links to omitted temporary build trees or checkout snapshots remain historical references.
