# Benchmark report writer operational contract

`POST /benchmark/accuracy/report` writes operator-owned Markdown reports under
`my-notes`. Read-only benchmarking remains `GET /benchmark/accuracy`. This is
not a general file-upload service or an unauthenticated network write endpoint.

## Deployment trust

- Network profile requires a configured API key and authenticates before body
  buffering, model validation, admission or disk work. Loopback/forwarding/Host
  headers never substitute for authentication. A valid key has report-write
  authority; separate read-only versus writer roles are not implemented.
- Local profile requires a direct loopback socket peer and exactly one bounded
  ASCII Host naming `localhost` or a literal loopback IPv4/IPv6 address, with an
  optional valid port. Missing, duplicate, nonloopback or malformed Host fails
  with structured 403 `benchmark_writer_local_only` before request body parsing.
- Local requests carrying `Forwarded` or any `X-Forwarded-*` header are rejected.
  Proxies must use the authenticated network profile, even on loopback. Run
  Uvicorn with `--no-proxy-headers` to preserve the immediate peer identity.
- Local browser Origin, when present, must be a single exact configured
  `SOLAR_CORS_ALLOWED_ORIGINS` entry. Null, duplicate or untrusted Origin is
  rejected. CORS response filtering alone is not authorization or CSRF protection.
  Non-browser direct-loopback clients may omit Origin.
- An API key configured in local profile is also mandatory before parsing a
  report body. Local keys do not waive the direct-loopback/Host/Origin checks.

## Files and errors

- `output_path` is at most 4096 characters with no control characters. NUL and
  control-character paths fail with structured schema 422 before filesystem work.
- The resolved target must remain under the configured reports directory and
  have a `.md` suffix. Containment/resolution failures are structured 400
  `invalid_report_path`, without absolute filesystem details.
- Existing reports require explicit boolean `allow_overwrite: true`; otherwise
  structured 409 `benchmark_report_exists`. Exclusive creation retains the
  existing no-clobber guarantee. Do not grant untrusted OS users concurrent
  mutation of the reports directory or its ancestors; authenticated HTTP access
  is not a sandbox against adversarial filesystem owners or symlink swapping.
- Success `reportPath` is a logical `my-notes/...` name, not a server absolute
  path. Direct Python report-generation callers retain their supplied path.
- Unexpected benchmark worker failures return structured 500 `benchmark_failed`
  or `benchmark_report_failed`, with fixed safe messages and `retryable: false`.
  The existing typed deadline/budget/provider errors retain their own contracts.
- `solar.operational` warning records are JSON with fixed `event`, bounded
  `exception_type`, and worker `pid`. They intentionally omit raw exception
  strings, tracebacks, request URLs, credentials and local filesystem paths.

## Worker ownership and scope of evidence

Timeout/cancellation cancels queued executor work only if it has not started.
A live thread retains its admission permit until actual completion. Both the
concurrent future and its asyncio wrapper observe exceptions; detached failures
emit `detached_worker_failed` rather than unhandled-future warnings. This does
not make running native/Python compute forcibly terminable or eliminate bounded
head-of-line delays within the shared two-thread compute executor.

`scripts/verify_operational_contract.py` exercises two actual local Uvicorn
workers with authenticated native REBOUND WebSockets, graceful/abrupt disconnects,
HTTP traffic and real report writes. Its generated test-only ASGI wrapper checks
per-worker runner, lease, session, task and queue cleanup. No diagnostic route is
added to production. `scripts/verify_deployment_contract.py` separately exercises
an actual two-worker local HTTP reverse proxy. These gates do not establish a
distributed global admission limit, production TLS/proxy trust, remote provider
coverage or owner deployment acceptance. Those require the owner's URL and
credentials, not inferred local success.
