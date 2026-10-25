# Independent runtime review: SCN-037 / SCN-070 / SCN-071

## Scope and baseline

- Reviewed controller commit `a33ad93600b4b18661084952572ff2235652c793`.
- Review branch: `remediation/20261014-runtime-review`.
- Isolated worktree: `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-runtime-review`.
- Based on integration HEAD `19d1b6f5988389f762077d3d3df4ad9fe13f46b3` at worktree creation.
- Changes are restricted to the runner/WS section of `backend/server.py`, the new dedicated `backend/tests/test_runtime_review_regressions.py`, and this report. No mission routes, mission worktree files, ephemeris internals, controller fixtures, or master tracker were changed. No agents, push, or merge.

## Findings and repairs

| Severity | Finding and independent evidence | Repair / status |
| --- | --- | --- |
| P1 | Repeated owner cancellation interrupted `to_thread(stop)` or the subsequent join and released the admission lease with a real worker thread still alive. Four tests reproduced this across disconnect/cancellation and stop/join phases. | Cleanup has its own shielded task; repeated cancellation is deferred until worker and transport tasks finish, then the original cancellation is re-raised. Tests prove no replacement admission while work survives, then exact lease reuse after exit. Fixed. |
| P1 | All command exceptions were recoverable, including epoch seeks that already mutated native state. A failing seek followed by `resume` performed another integration step. The fatal latch also allowed seek/activation/element commands to access a failed engine. | Validation/read-only failures remain recoverable; an exception after entering the seek mutator latches a fatal error. Commands that reuse a failed engine require reconnection. Actual REBOUND seek mutation and read-only recovery are tested through ASGI. Fixed. |
| P1 | Exceptions in epoch/energy telemetry or normalization escaped the thread, leaving `running=True` and the last healthy snapshot. A failed cancellation hook also bypassed the join. | An outer worker failure boundary latches failure, clears stale state, and marks the worker stopped. The sender emits queued error information and closes a stopped worker with 1011. Stop still joins after hook failure. Fixed. |
| P2 | Re-sending the same snapshot repeatedly refreshed inactivity, so a stalled worker could masquerade as healthy indefinitely. Conversely, fresh paused snapshots did not count as progress until sent. | Inactivity tracks newly published immutable snapshots, independently of unchanged epochs or retransmission. Stale output closes with 1013; genuine paused progress remains connected. Fixed. |
| P2 | A continuously refilled response queue prevented the sender from ever reaching state or liveness checks, despite bounded queue capacity. | Response draining now has both a per-cycle count limit and a scheduling-time budget. Saturation regression reproduces starvation before the repair. Fixed. |
| P2 | Handshake body/epoch reads occurred after starting the native engine worker. Initial snapshot failures were outside the structured initialization error path. | Capture handshake data before transferring ownership to the worker; exceptions from initial state, body IDs, or epoch become `engine_init_failed` and close 1011. Fixed. |
| P2 | A Kuiper snapshot failure latched fatal state after telemetry construction, publishing one frame with `paused=false` and no runtime error. | Build runtime telemetry after the Kuiper snapshot attempt so that same frame reports failure. Fixed. |

The cleanup regression expansion also caught and repaired a review-implementation
defect: creating a new `CancelledError` discarded AnyIO cancellation-scope
provenance. Cleanup now preserves the original exception. Both an AnyIO scope
test and a real REBOUND `TestClient` disconnect prove normal teardown.

## Canonical status

| Issue | Review result |
| --- | --- |
| SCN-037 | Fixed-step policy preserved and verified: slow steps do not trigger catch-up; connection/state telemetry declares the policy. No change to scientific integration increments. |
| SCN-070 | Reviewed command recovery and fatal-latch defects repaired. Recoverable read-only failures continue actual native propagation; partial mutating failures cannot resume or keep stepping. |
| SCN-071 | Reviewed acceptance/send/close deadlines, worker ownership, repeated cancellation, idle detection, response fairness, startup failure, and peer-task completion are regression-tested. Closure evidence is for cooperative ASGI/native-worker contracts, not forcible termination of arbitrary native hangs. |

## Reproduction and tests

All backend commands ran in the review worktree with this environment and runner:

```bash
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 \
MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC \
uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt \
python -m pytest -q <tests> <options>
```

1. Baseline, before edits: `backend/tests/test_runtime_recovery_contract.py backend/tests/test_ws_resource_contract.py backend/tests/test_server_validation.py --tb=short`: **59 passed**, two dependency deprecation warnings, 0.73 seconds.
2. Initial added probes against the baseline: `backend/tests/test_runtime_review_regressions.py --tb=short`: **20 failed, 4 passed**, one unhandled-worker warning, 1.95 seconds. The read-only fixture was subsequently completed with a real element-returning method rather than allowing an absent-method exception.
3. Additional response-flood probe: **1 failed, 28 passed**, 1.18 seconds, before the drain repair.
4. Additional AnyIO/real-TestClient probes: **2 failed, 29 passed**, 1.31 seconds, before preserving cancellation provenance.
5. Final focused gate, command below: **165 passed**, two dependency deprecation warnings, 2.85 seconds, exit 0. No skipped tests, resource-warning failures, or unhandled-thread failures.

```bash
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 \
MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC \
uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt \
python -m pytest -q \
  backend/tests/test_runtime_review_regressions.py \
  backend/tests/test_runtime_recovery_contract.py \
  backend/tests/test_ws_resource_contract.py \
  backend/tests/test_server_validation.py::test_set_julian_date_requires_the_engine_time_scale \
  backend/tests/test_rebound_epoch_contract.py \
  backend/tests/test_sim_registry.py \
  backend/tests/test_sim_contracts.py \
  backend/tests/test_kuiper_binary.py \
  backend/tests/test_kuiper_velocity_units.py \
  backend/tests/test_solar_security.py \
  -W error::pytest.PytestUnhandledThreadExceptionWarning \
  -W error::ResourceWarning --tb=short
```

6. Lifecycle stress: the following focused selection ran ten consecutive times,
   each **9 passed**, for **90 passing executions**, exit 0:

```bash
for run in $(seq 1 10); do
  PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 \
  MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC \
  uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt \
  python -m pytest -q backend/tests/test_runtime_review_regressions.py \
    -k 'repeated or anyio or real_rebound' \
    -W error::pytest.PytestUnhandledThreadExceptionWarning \
    -W error::ResourceWarning --tb=short --disable-warnings || exit "$?"
done
```

7. `git diff --check`: exit 0. Runtime diff starts inside `SimulationRunner.stop`, below planning routes.

The 35 dedicated cases include real REBOUND threads and real Starlette ASGI /
TestClient boundaries, deterministic partial-mutation and telemetry faults,
delayed transport cancellation, admission reuse, accept/send/close timeouts
(including the preserved controller tests), and normal or disconnect completion
of either peer task. The whole backend suite remains controller-owned. The
controller-reported legacy Lambert 400-versus-422 fixture alignment was not
changed or treated as a production defect here.

## Remaining limits, references, and next actions

- Native simulation operations still use cooperative cancellation. A truly stuck native call retains its lease until it actually exits; this repair never releases that lease to disguise a live worker. There is no proof of forcible thread termination or guaranteed capacity recovery from arbitrary native hangs. A hard termination requirement needs process ownership and separate validation.
- Engine readiness/initialization remain synchronous, without a newly introduced hard initialization deadline. The transport deadlines do not establish a bound on arbitrary synchronous/native startup work. This review does not claim that broader property is closed.
- ASGI timeout tests use cancellable operations; an arbitrary transport that suppresses cancellation is not claimed terminable. Delayed cancellation cleanup remains owned and tested.
- No actual TudatPy execution gate or GPU numerical/rendering gate is claimed. Scientific formulas were not changed, so no new scientific reference was required. Primary implementation references are controller commit `a33ad93600b4b18661084952572ff2235652c793`, `backend/sim/base.py` cancellation interface, REBOUND checkpoint-seek mutator, and TudatPy's epoch-before-propagation mutator; their non-atomic behavior motivates fatal seek classification.
- GPU discovery only: `/usr/lib/wsl/lib/nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv` returned three RTX 5090 adapter rows (32607 MiB each) and one RTX 3090 Ti row (24564 MiB), driver 596.36. `/dev/dxg` exists; `DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`. This is availability evidence, not a GPU gate pass.
- **SCN-063 correction:** OPEN / PARTIAL, not "decision resolved" or "owner accepted." The earlier mission report's acceptance wording is superseded by the controller's explicit correction. Preserving the single live-worker permit is a safety property, not approval of capacity starvation. No Horizons code or completed mission worktree was changed during this review. Next action is bounded, terminable subprocess I/O with kill/join/admission tests, or an explicitly recorded owner decision; neither is claimed implemented here.
- Controller next action: integrate the scoped runtime review commit and run the integrated gates. No merge/push was performed by this reviewer.
