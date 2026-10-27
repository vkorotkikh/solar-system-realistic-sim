# B052 Trusted-Proxy Rate Identity Implementation Plan

**Goal:** Give trajectory, mission, and benchmark ingress independent rate-limit buckets for clients behind explicitly trusted proxies.

**Architecture:** Extract the solar routes' validated peer/X-Forwarded-For resolution into one scope-based helper. Keep each caller's existing authenticated-subject precedence and identity formatting, then use the shared peer resolver only as the fallback.

**Ruling:** Forwarding data may select a rate identity only when the immediate ASGI peer is trusted and the entire bounded chain validates; otherwise the socket peer remains authoritative. If wrong, legitimate proxy users share a quota or spoofed headers fragment the bounded store.

## Constraints

- Fix B052 only; do not change authentication, middleware order, quotas, route matching, LRU bounds, response schemas, or raw-key handling.
- Preserve trajectory's network-only authenticated-subject precedence and 255-byte bound; local profile must continue ignoring injected subject state.
- Preserve solar's primary then legacy subject precedence and its `peer:` prefix.
- Preserve untrusted-peer fallback, duplicate/non-ASCII/oversized/malformed/empty/over-hop rejection, canonical IP formatting, and right-to-left trusted-hop selection.
- Cover all six `TRAJECTORY_INGRESS_PATHS` and prove rejection still happens before request-body reads.
- Use strict TDD and produce one commit: `fix(server): honor trusted proxy rate identities (B052)`.

## Task 1

- [x] Add failing middleware regressions for two independent forwarded clients and 61 distinct clients behind one trusted proxy.
- [x] Extract `_peer_identity_from_scope(...)` from `_client_identity(...)` and reuse it in both identity wrappers.
- [x] Run focused solar-security, trajectory-budget, and benchmark-budget tests plus `git diff --check`.
- [x] Record RED/GREEN/review evidence and commit atomically.

## Evidence

- RED: all six ingress-path cases rejected the second distinct forwarded client, and the 61st distinct client received 429 from the proxy's shared bucket.
- GREEN: 119 focused tests passed across solar security, trajectory ingress, and benchmark ingress.
- Review: no Critical or Important findings; credential precedence, trust-chain validation, fallbacks, LRU bounds, and pre-body rejection remain intact.
