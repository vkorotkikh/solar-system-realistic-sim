# Operational remediation checkpoint, 2026-10-14

## Scope and provenance

- Branch: `remediation/20261014-operational`.
- Worktree: `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-operational`.
- Base integration HEAD: `bc0e336e4da9b5835ae73b817c47d9fc4edc651e`.
- Assignment: SCN-047/048/049 operational children, plus the explicitly requested
  Horizons ownership documentation correction. No master tracker, frontend,
  mission planning algorithm, native Tudat or solar-provider production changes.
- No subagents, push or merge. Completed mission/runtime/Horizons worktrees were
  not changed. No remote owner URL or credential was supplied for deployment
  acceptance. Actual two-worker local evidence is not global coordination proof.

## Findings and implemented repairs

| Severity | Finding / reproduction | Repair and evidence |
| --- | --- | --- |
| P1 | Local-profile report requests from nonloopback peers, attacker Host names, forwarding headers, or configured-key failures entered the writer. Loopback Host alone also permitted cross-origin browser writes despite CORS response filtering. | Pre-body/pre-admission direct-loopback peer, unique bounded loopback Host, no forwarding headers, exact configured Origin when present, and optional-local-key authentication. Network authentication remains mandatory and does not trust forwarded identity as credentials. Dedicated deny/allow matrix and real network writer capture. |
| P2 | NUL paths produced a plain 500; traversal and overwrite errors disclosed server paths; unexpected benchmark exceptions had inconsistent/unstructured errors. | Control characters and oversized paths fail schema 422. Resolution/containment/extension errors are structured 400. Existing reports return safe 409. Unexpected worker errors return fixed structured 500 codes. Success `reportPath` is logical, not absolute. Existing no-clobber behavior retained. |
| P2 | A timed-out or cancelled worker's concurrent Future was observed, but its shielded asyncio wrapper later emitted `Future exception was never retrieved`. | Observe both Future layers, emit a bounded detached-failure event, and keep the real permit until the worker exits. Real executor/event/loop-exception-handler regressions cover timeout and cancellation. |
| P2 | An abandoned queued job retained its admission behind unrelated running work and could execute after its caller left. | Attempt `worker_future.cancel()` only on owner timeout/cancellation. Cancellation releases queued-job admission through the normal completion callback; running futures cannot be cancelled and retain their permits. Both queued and live-worker cases are gated. |
| P2 | Engine, command, telemetry and initialization exception strings could be emitted unbounded to WS clients; session errors used raw `print`. | Fixed safe public messages and JSON `solar.operational` events with `event`, bounded `exception_type`, and `pid`, without raw exception text, paths, URLs, credentials or traceback data. Fatal latches and read-only recovery semantics remain. |
| P2 | Unexpected WS startup/task exceptions cleaned up their runner but emitted neither a terminal error nor an explicit close. | After sender/runner cleanup, make separately bounded safe error and 1011 close attempts. Broken terminal transport cannot skip cleanup; cancellation provenance remains unchanged. Startup and receiver-task failure regressions verify cleanup and terminal delivery. |

## Canonical children: status and residual requirements

| Canonical parent / named child | Checkpoint status | Residual / next action |
| --- | --- | --- |
| SCN-048/049, F-API-05: benchmark writer local-profile/Host/NUL policy | Implemented and focused tests PASS; actual local network-profile report create/auth/conflict/NUL exercised. | Deploy with `--no-proxy-headers`; proxies use network profile. Existing API keys grant write authority, not separate read/write roles. Reports directory and ancestors remain trusted OS-owned storage, not an adversarial-filesystem sandbox. |
| SCN-047/049, F-API-10: structured operational logging | PASS for benchmark failures, detached workers and runner/WS failure boundaries. | Not a claim that every provider, dependency, access logger or route now uses one universal event schema. |
| SCN-047/049, F-API-11: server composition debt | No composition refactor performed. | Architectural extraction is not claimed closed by targeted runtime fixes; parent retains any maintenance/refactor decision. |
| SCN-048/049, F-API-14/15: error shape, path disclosure, deployment trust | Benchmark error family and report path fixed; local two-worker authenticated direct/proxy gate PASS. | Other route families retain their existing error contracts. Remote deployment, TLS, owner proxy configuration and owner acceptance remain OPEN until an owner URL/auth context is supplied. |
| SCN-047/049, F-API-16: WS/task lifecycle and soak | Focused recovery/cleanup and exception stress PASS; see real-process result below. | No claim about unbounded native hangs, all browser/device transports, arbitrary process counts or longer-duration load. A genuinely surviving worker must retain its permit. |
| SCN-047/049, F-API-17: shared-executor head-of-line debt | Abandoned queued-work execution/admission retention fixed; live ownership and recovery gates PASS. | Running compute still shares a bounded two-thread executor per process. This is not preemptive scheduling, forced thread termination or a cross-process/distributed admission limit. |
| SCN-063 documentation | Corrected `backend/mission/HORIZONS_TRANSPORT.md` to the already integrated `e6a02d9` implementation. | No owner acceptance of permanent lost capacity is asserted. Child acquisition has original maximum 2.5 s, potentially shorter planning deadline; cancellation may return earlier. Kill/reap and pipe cleanup precede permit release. No new Horizons/provider runtime claim is made here. |

SCN-047/048/049 remain umbrella PARTIAL: these child results must not be promoted
to complete delivery, universal error-schema conversion, distributed admission,
remote deployment acceptance, or independent AIA date-coverage validation.

## Exact focused tests and red/green evidence

All commands ran from the assigned worktree, using this exact environment and
interpreter/dependency entry point:

```bash
backend_py() {
  PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC \
    uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt python "$@"
}
backend_py -m pytest -q \
  backend/tests/test_operational_contract.py \
  backend/tests/test_benchmark_endpoint_budget.py \
  backend/tests/test_benchmark_report_overwrite.py \
  backend/tests/test_server_validation.py \
  backend/tests/test_solar_security.py \
  backend/tests/test_runtime_recovery_contract.py \
  backend/tests/test_runtime_review_regressions.py \
  backend/tests/test_compute_budget.py --tb=short
backend_py -m pytest -q backend/tests/test_solar_physics_api.py \
  -k 'aia or saturat or timeout' --tb=short
backend_py -m pytest -q backend/tests/test_solar_physics_determinism.py \
  -k holds_permit --tb=short
backend_py -m pytest -q backend/tests/test_ws_resource_contract.py --tb=short
for iteration in $(seq 1 20); do
  backend_py -m pytest -q backend/tests/test_operational_contract.py \
    -k 'worker_exception or queued_work or runner_exception or websocket_initialization' \
    --disable-warnings --tb=short || exit 1
done
for iteration in $(seq 1 10); do
  backend_py -m pytest -q backend/tests/test_operational_contract.py \
    backend/tests/test_runtime_review_regressions.py \
    -k 'unexpected_websocket_session or real_rebound_websocket_recovers' \
    --disable-warnings --tb=short || exit 1
done
```

- Final focused suite: **172 passed**, two upstream TestClient/AnyIO deprecation
  warnings, **8.35 s**, exit 0. Includes 46 dedicated operational cases.
- Shared I/O endpoint selection: **30 passed, 19 deselected**, **0.70 s**, exit 0.
  These are controlled endpoint tests, not an external AIA provider capture.
- Existing owned-thread permit gate: **1 passed, 6 deselected**, **1.47 s**, exit 0.
- Existing WS resource contracts: **35 passed**, **0.50 s**, exit 0.
- Exception stress: **12 cases x 20 successful repetitions = 240 passes**.
- Terminal/recovery stress: **4 cases x 10 successful repetitions = 40 passes**;
  each repetition includes two actual REBOUND failure/recovery episodes and two
  injected WS startup/task failures. These counts overlap the focused suite.
- Initial baseline: **32 failed, 5 passed** after correcting a test-fixture name.
  Further red checks: queued timeout/cancel plus invalid provider **3 failed**;
  Origin policy **3 failed, 12 passed**; missing terminal WS close **2 failed**.
  Test-fixture collection/IPv6 TestClient URL parser problems are not production
  bug evidence. Updated previous runtime expectations require safe messages,
  rather than leaking private injected exception text.
- Logs: `/tmp/solar-operational-red-20261014.txt`,
  `/tmp/solar-operational-origin-red-20261014.txt`,
  `/tmp/solar-operational-focused-final-20261014.txt`,
  `/tmp/solar-operational-shared-io-20261014.txt`,
  `/tmp/solar-operational-exception-stress-20261014.txt`,
  `/tmp/solar-operational-native-ws-stress-20261014.txt`.

## Real-process deployment and soak gates

```bash
backend_py scripts/verify_deployment_contract.py \
  --artifacts /tmp/solar-operational-deployment-20261014-a
backend_py scripts/verify_operational_contract.py \
  --artifacts /tmp/solar-operational-smoke-20261014-b --duration 3 --cycles 2
backend_py scripts/verify_operational_contract.py \
  --artifacts /tmp/solar-operational-soak-20261014-b --duration 300 --cycles 60
backend_py scripts/verify_operational_contract.py \
  --artifacts /tmp/solar-operational-final-smoke-20261014 --duration 1 --cycles 1
```

The existing deployment gate passed: **64/64 authenticated requests**, concurrency
**16**, actual serving workers **1353651 and 1353652**, first liveness **0.6193 s**,
median **0.01411 s**, maximum **1.04324 s**, each request bounded at five seconds.
Direct/proxy authentication and CORS checks passed. `remoteProductionVerified`
remains **false**. No token was retained in logs.

The new operational gate uses actual authenticated Uvicorn workers and actual
native REBOUND sessions. A generated, authenticated test-only ASGI wrapper
observes each worker's thread/runner, task, lease, subject, session, queue, FD and
event-loop error counters. No diagnostic endpoint is added to production.
Metadata probes retain worker-affined TCP connections because a shared listener
does not promise fair or round-robin request distribution. The harness uses a
600-second keepalive for those two observation connections.

The five-minute gate **PASSED**, exit 0: **300.2410 s**, actual workers **1361563
and 1361564**, **60 churn cycles** (30 graceful closes, 30 transport aborts),
**1,759 + 2,874 = 4,633 native state frames**, **555 authenticated metadata
requests**, maximum metadata latency **0.01468 s**, and **555 paired ownership
samples**. Both final workers had **zero runners, leases, active connections,
subject counts, sessions, queued compute and unhandled loop exceptions**, with
one recovered benchmark permit each. Tasks returned to **3 per worker** and FDs
to **22 per worker**, matching baseline. Thread counts were **5 / 4**, versus
baseline **5 / 2**; two lazy pool threads are retained, not misreported as leaks
or as zero threads. Parent/process-group shutdown completed with return code 0;
no unhandled-task/future, pending-task-destruction or ASGI traceback marker was
found in the retained log.

Committed result summaries: `operational-reference-2026-10-14/two-worker-soak.json`
and `operational-reference-2026-10-14/deployment.json`. Full local artifacts are
under the exact `--artifacts` directories above. The successful long-run Kuiper
frame contains **3,589 positions / velocities and 589 binary pairs**, units
**AU / AU/yr**, SHA-256
`fbf4d67db397cff5aa4b482a6a976cc0d0ceb56a853006e7611db10f0912e92a`.
This is a measured local episode, not a global admission bound or remote SLA.

A final smoke after restricting harness cleanup to reports it successfully
created also **PASSED**, exit 0: **2.3432 s**, **63 native frames**, one churn
cycle, both worker ownership counts zero, task/FD baseline restored, clean
process shutdown and no log error markers. Pre-existing reports are never
unlinked by a failed harness create attempt.

The short smoke passed with two real worker PIDs, two native streams, actual
network report create 200 / unauthenticated 401 / conflict 409 / NUL 422, and zero
final runners, leases, active sessions or unhandled loop exceptions. Its actual
measured episode was **5.1517 s** for a requested three seconds; it is not a
long-duration gate. Initial probe-routing attempts, including the first long-run
attempt `/tmp/solar-operational-soak-20261014-a`, exited **nonzero** when they could
not observe both workers reliably. Those attempts are not counted as passes.

## Kuiper and AIA handoffs

Backend Kuiper wire was not changed. Actual captured `state_update.kuiper` is an
object containing `positions`, `velocities`, `binary_pairs`, `position_units`,
`velocity_units`, `binary_model`, not a bare matrix. The short smoke captured
**3,608 positions / 3,608 velocities / 608 binary pairs**, units **AU / AU/yr**.
Raw frame: `/tmp/solar-operational-smoke-20261014-b/kuiper-wire.json`, SHA-256
`436fa98ee1535f31515d30f541b776f4af83eff625c6d24f1f7ce2d0aabd8621`.
Hooke/controller own frontend compatibility; this is backend payload evidence,
not a browser-rendering pass or an independent binary-dynamics validation.

Controller owns independent AIA date-matrix capture. Handoff identified
`GET /solar/realtime/aia-tile`, canonical `jd_tdb` / legacy TDB `jd`, exact image
identity, `_fetch_helioviewer_closest` and `_build_aia_tile_url` in
`backend/sim/solar_realtime_data.py`, source IDs 8/10/11/12/13, and nearest-image
selection versus requested-date coverage. No external provider work duplicated.

## Fixed files and reference trail

- `backend/server.py`: narrowly scoped writer trust/model/path boundaries,
  benchmark errors, Future ownership, safe runner/WS errors and terminal close.
- `backend/benchmark/accuracy.py`: stale unauthenticated-writer comment corrected;
  generation/no-clobber algorithm unchanged.
- `backend/benchmark/REPORT_WRITER_POLICY.md`: deployment, error and ownership
  contract, including explicit residuals.
- `backend/mission/HORIZONS_TRANSPORT.md`: actual child deadline/kill/reap and
  retained-permit contract, referring to integrated `e6a02d9`.
- `backend/tests/test_operational_contract.py`: dedicated boundary/fault tests.
- Existing benchmark budget/overwrite and server-validation tests: legitimate
  loopback TestClient peer/Host rather than whitelisting `testserver` in production.
- `backend/tests/test_runtime_review_regressions.py`: safe-message assertions;
  fatal-latch, native recovery and cleanup assertions preserved.
- `scripts/verify_operational_contract.py`: reproducible real-process gate with
  retained raw artifacts and nonzero failure exit.
- This report and bounded gate-result artifacts. Earlier provenance remains in
  `REMEDIATION_RUNTIME_REVIEW_2026-10-14.md`,
  `REMEDIATION_HORIZONS_TRANSPORT_2026-10-14.md`, and
  `REMEDIATION_DEPLOYMENT_2026-10-14.md`.

No scientific formula changed; no fabricated scientific oracle, GPU, browser,
remote provider or owner-deployment passing claim is introduced. The controller
owns integrated full-suite gates and parent tracker updates.
