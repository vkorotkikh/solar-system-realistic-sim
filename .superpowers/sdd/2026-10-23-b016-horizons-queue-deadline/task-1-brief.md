# Task 1 brief — B016 queue and upstream deadlines

BASE: `2a205cf`

Implement only the post-admission deadline boundary described by the plan. First demonstrate that a retained permit holder plus a distinct queued request causes a healthy queued transport to inherit an exhausted upstream allowance and opens the outage breaker. Then preserve context-only queue expiry/cancellation, genuine upstream-timeout breaker behavior, redirects, and provider-revision contracts.

Required verification: the four parent-requested Horizons/endpoint test modules under Python 3.12.13 with `PYTHONPATH=backend`.
