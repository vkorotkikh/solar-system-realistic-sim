# Horizons owned transport: SCN-063 definitive remediation

## Ownership and provenance

- Branch: `remediation/20261014-horizons-transport`.
- Worktree: `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-horizons-transport`.
- Created from integration HEAD `6b41f7ab9737ab6f8dc821fba2df295280be43bc`.
- Reuses the existing `DeadlineHttpResponse` implementation from solar transport commit `9a5499f4077e9b30732193d1314ac6f950003025`. The shared solar transport file is unchanged.
- Runtime review checkpoint/report was committed first as `06a25621a155a7719e29db21502fb95fca8ea56c`. Neither completed worktree was modified during this task.
- No scientific formulas, Kepler internals, mission/trajectory routes, master tracker, or runtime runner code changed. No subagents, push, or merge.

## Issue status

| Issue | Status and evidence |
| --- | --- |
| SCN-063 | FIXED / TESTED on the POSIX backend. Horizons DNS/header/body I/O now belongs to an isolated, deadline-owned child process. A stalled acquisition is killed and reaped before releasing the global remote permit. Repeated stall, cancellation, and subsequent successful-request tests prove capacity recovery. This is implemented remediation, not an inferred owner acceptance of starvation. |
| SCN-073 | PRESERVED / TESTED. Automatic redirects remain disabled in the shared worker. Every admitted URL and redirect target must use HTTPS, exact host `ssd.jpl.nasa.gov`, default port or 443, no credentials, and no fragment. Initial request plus at most three redirect hops; each hop consumes its external-request reservation and the remaining original deadline. Missing/duplicate Location is rejected. |

## Root cause and implementation

The previous Horizons supervisor stopped waiting on time, but its stdlib I/O
thread retained the sole remote permit until the network read ended. A
slow-dripping peer could prevent that indefinitely. This bounded abandoned
work but did not bound capacity loss.

`_horizons_urlopen` now returns the existing `DeadlineHttpResponse`. Its isolated
child owns DNS, connection/TLS, headers, and body; the parent enforces the
absolute acquisition deadline and closes, kills, and reaps the process. The
existing Horizons supervisor remains responsible for admission and releases
its permit only after owned-response cleanup. No permit is released merely
because a caller timed out or disconnected.

The Horizons child deadline is bounded by the request-owned planning deadline
as well as the provider timeout. Redirect hops do not reset that budget. A
cancelled planning waiter can return before cleanup completes, but any pending
child still expires at the original deadline, rather than holding capacity
permanently. Provider calls retain the existing maximum 2.5-second acquisition
timeout. Body-loop checkpoints can observe cancellation sooner.

The shared transport returns HTTP statuses rather than throwing `HTTPError`.
Horizons now handles redirect statuses explicitly and reconstructs other HTTP
failures for the existing 429/Retry-After, 5xx-unavailable, and query-rejection
classification. Shared transport deadline, IPC-limit, and upstream-I/O errors
map to stable ephemeris error types. Existing provider outage cooldown and
single-flight/cache policies are unchanged: recovery tests prove transport
capacity, not bypass of the intentional cooldown.

Reads loop in at most 64 KiB increments until actual EOF, checking the request
budget between chunks. A short read is not EOF. The loop reads at most the
2 MiB cap plus one detection byte, rejects oversized bodies, and closes the
owned response on every outcome. This avoids truncation at the shared
transport's 64 KiB per-read cap.

## Fixed files

- `backend/mission/ephemeris_service.py`: owned response, finite child deadline, explicit status/redirect handling, bounded complete body reads, typed transport errors.
- `backend/tests/test_horizons_owned_transport.py`: 37 new subprocess/wire and boundary cases.
- `backend/tests/test_ephemeris_service_safety.py`: response fixture now consumes bytes and exposes status/URL like the actual response; all existing safety tests retained, including the deliberately uncooperative injected-thread permit test.
- `backend/tests/test_horizons_redirect_contract.py`: existing urllib-boundary cases retained with a controlled response adapter that follows the shared transport's no-auto-redirect/status interface.
- This report only; no shared transport implementation or tracker edits.

## Evidence and exact commands

All commands ran in the Horizons transport worktree.

Baseline:

```bash
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 \
MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC \
uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt \
python -m pytest -q backend/tests/test_ephemeris_service_safety.py \
  backend/tests/test_horizons_redirect_contract.py \
  backend/tests/test_solar_http_deadline.py --tb=short
```

Result: **52 passed**, 8.82 seconds, exit 0.

After correcting an initial test-fixture import alias, the new probes against
unchanged production code produced **19 failed**, 4.07 seconds, exit 1, using
the same environment/runner and
`python -m pytest -q backend/tests/test_horizons_owned_transport.py --tb=line`.
Failures reproduced non-recovering capacity, absence of owned children, short
read truncation, and missing bounded-reader behavior. Existing status/redirect
behavior was additionally required to pass through real owned children.

Final focused gate:

```bash
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 \
MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC \
uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt \
python -m pytest -q \
  backend/tests/test_horizons_owned_transport.py \
  backend/tests/test_horizons_redirect_contract.py \
  backend/tests/test_ephemeris_service_safety.py \
  backend/tests/test_solar_http_deadline.py \
  backend/tests/test_lambert_state_contract.py \
  backend/tests/test_mga_bounded_search.py \
  -W error::pytest.PytestUnhandledThreadExceptionWarning \
  -W error::ResourceWarning --tb=short
```

Result: **169 passed**, 14.21 seconds, exit 0; no skips or warnings.

Repeated owned-transport gate:

```bash
for run in $(seq 1 3); do
  PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 \
  MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC \
  uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt \
  python -m pytest -q backend/tests/test_horizons_owned_transport.py \
    -W error::pytest.PytestUnhandledThreadExceptionWarning \
    -W error::ResourceWarning --tb=short || exit "$?"
done
```

Result: **37 passed** on each run (4.91, 4.92, 5.00 seconds), **111 passing
executions**, exit 0. `git diff --check`: exit 0.

## Why this is stronger than waiter-only evidence

- Real `Popen` children execute the shared transport, with their independent SIGALRM disabled in the fault-injection wrapper. DNS sleeps for 30 seconds; headers/body drip continuously. Tests require parent-enforced SIGKILL, not merely a returned timeout.
- Child return status is recorded, both IPC descriptors must be closed, and `os.waitpid` must report no remaining child to reap. Permit-release instrumentation verifies cleanup was complete at the actual release boundary.
- Each DNS/header/body stall is repeated and followed by a successful request using a new real child. Separate owner-cancellation cases cover all three phases.
- Exact-limit 2 MiB and 150,000-byte bodies are returned intact; cap-plus-one is rejected and capacity recovers. A three-byte short-read fixture detects premature EOF assumptions.
- All five supported redirect statuses, rejected host/scheme/port/credential/fragment targets, missing/duplicate Location, redirect loops, zero/exhausted budgets, one shared redirect deadline, HTTP error classification, and process-spawn failure are covered.

## Limits and controller next action

Tests route the HTTPS wire to a controlled loopback server inside the isolated
child while leaving the production Horizons allow-list intact. This proves
ownership, classification, and redirect policy, not live NASA availability,
TLS certificate validation, or new scientific-provider reference captures.
The transport is the existing POSIX implementation; no Windows execution or
optional scientific/GPU runtime pass is claimed.

No implementation blocker remains in this scope. Controller next action is
integration of this scoped commit followed by the integrated gates. The prior
SCN-063 "bounded tradeoff accepted" wording remains explicitly superseded:
there was no recorded owner acceptance, and this report instead supplies
implemented kill/reap/recovery evidence.
