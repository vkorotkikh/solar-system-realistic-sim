# SCN-035 provenance review, 2026-10-14

Status: PARTIAL / OWNER DECISION REQUIRED. No code license was invented, no
third-party image was relicensed, and no existing asset was silently removed.
The requested owner decision is still pending.

## Evidence gathered

- Read the complete nine-entry moon texture catalog and checked its archived
  attribution manifest. The manifest has a hash, byte count and source URL for
  every bundled image, but hashes prove identity, not permission.
- Confirmed Solar System Scope's CC BY 4.0 terms and illustrative-map caveats.
- Confirmed SILSO's CC BY-NC 4.0 terms. Noncommercial restrictions must remain
  visible even if the owner selects a permissive software license.
- Read Solarviews' policy and Deimos page. They distinguish third-party and
  government images; the current downloaded map has no adequately established
  per-asset permission in the repository. The corresponding catalog warning is
  retained. A NASA-derived input does not settle rights in a processed map.
- Read JPL's image policy, which requires product-specific credits and makes
  exceptions for third-party images. No blanket public-domain inference made.
- Confirmed the upstream d3-celestial BSD-3-Clause software license. Underlying
  catalog rights require their own provenance, rather than automatic inheritance.
- The attempted ESA Gaia credits URL returned HTTP 451 through this research
  tool. This is recorded as unavailable evidence, not provider misconduct or
  proof that attribution is unnecessary.

Primary source links and user-visible limits are in `NOTICE.md`. This review
does not constitute a completed legal clearance of the distribution.

## Closure requirements

1. Owner selects the original-code license and confirms the intended commercial
   or noncommercial distribution model.
2. Resolve Deimos permission or approve a separately licensed replacement,
   preserving truthful cartographic attribution and functionality.
3. Inventory the exact remotely loaded texture/catalog products and carry each
   required notice into the release; distinguish fetched data from bundled data.
4. Add the owner-approved code license separately from third-party notices.

SCN-035 cannot be closed by passing tests. No tests were run for this prose-only
addition. This limitation is independent of the active code/test remediation.
