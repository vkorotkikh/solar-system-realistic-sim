# SDD ledger — B052 trusted-proxy rate identity

## Baseline

- HEAD: `b010658` (`fix(ephemeris): separate Horizons queue and upstream deadlines (B016)`).
- Reproduction: every trajectory-family limiter keys an unauthenticated trusted-proxy request by the immediate socket peer, while solar resolves the validated forwarding chain.

## Preflight

- Tests exercise the real middleware identity, quota store, body-read ordering, and all six ingress paths.
- The shared helper is limited to peer resolution; caller-specific credential precedence remains separate.

Ruling: forwarding data may select a rate identity only when the immediate ASGI peer is trusted and the entire bounded chain validates; otherwise the socket peer remains authoritative.

## Task 1

- Status: complete
- RED: six path cases grouped two distinct forwarded clients by the trusted proxy; a 61-client reproduction rejected client 61 at the 60-request proxy bucket.
- GREEN: 119 focused tests passed; each validated forwarded client owns its own bucket and ambiguous chains fall back to the immediate peer.
- Review: no Critical or Important findings. Authenticated-subject precedence, solar `peer:` formatting, bounded validation, LRU bounds, and pre-body rejection were preserved.
