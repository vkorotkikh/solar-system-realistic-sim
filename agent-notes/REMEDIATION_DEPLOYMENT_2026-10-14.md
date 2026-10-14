# Local deployment and integration evidence, 2026-10-14

## SCN-047/048: real two-worker local network profile

`scripts/verify_deployment_contract.py` starts the actual Uvicorn application
with two workers, network authentication, an exact allowed CORS origin, and
trusted loopback proxy configuration. It also starts a real local HTTP reverse
proxy with an `/api` prefix, removes caller-supplied forwarded identities, and
forwards to the application. No ASGI TestClient or replacement service is used.
Credentials are generated for the run, passed only through the child environment
and request headers, and checked for absence from responses and process logs.

Actual result on the integration branch:

- Two worker processes started and both served the concurrent load, confirmed
  independently by PID-tagged Uvicorn access logs.
- 64/64 authenticated metadata requests passed with concurrency 16.
- Median request latency 0.01365 seconds; maximum 1.03557 seconds. Each request
  has a predeclared five-second timeout; these numbers are not a sustained
  throughput or scientific-compute performance claim.
- First liveness response arrived in 0.660 seconds within a 30-second startup
  budget. This measures first availability, not the second worker's readiness.
- Direct and proxied unauthenticated routes rejected with 401, without relying
  on claimed forwarding identity. Invalid credentials were rejected. Liveness
  remained public. Exact-origin preflight and private/no-store responses passed;
  disallowed origins received no CORS permission even with valid credentials.
- The owned worker process group terminated gracefully after the gate.

Reproduce with a new, nonexistent artifact directory:

```sh
uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt \
  python scripts/verify_deployment_contract.py \
  --artifacts /tmp/solar-deployment-gate-UNIQUE
```

The executed run's raw result, logging configuration and logs are at
`/tmp/solar-deployment-gate-20261014-a/`. The summary above is retained in Git;
machine-local raw logs are not automatically committed.

This is a **local deployment profile**, not the user's remote deployment.
No TLS terminator, actual production proxy configuration, deployed credentials,
live provider availability, AIA date denominator, five-minute solar delivery,
or WebSocket saturation is certified by this HTTP metadata gate. SCN-047 and
SCN-048 remain partial until their separate requirements have evidence. The
owner has been asked for the actual deployed URL/authentication method.

## Integrated backend run

The first complete integration sweep after mission, planetary and runtime fixes
ran 2,281 tests: **2,280 passed, one failed**, in 208.57 seconds. The sole failure
was a historical extreme-epoch assertion expecting HTTP 400 rather than the
new explicit SCN-072 HTTP 422 `trajectory_epoch_out_of_range` contract. The
assertion was aligned with that contract, retaining rejection and its exact
error code; production validation was not weakened.

The server-validation and planning-epoch suites then passed **36/36** in 0.53
seconds. A subsequent full sweep is required after the remaining agent batches
integrate; this focused pass does not retroactively turn the earlier run green.
