# Runtime remediation - SCN-037, SCN-070, SCN-071

The backend uses a fixed-step clock: each tick advances `time_scale / target_fps`
days. The requested days-per-second value is nominal at the target FPS. A slow
tick slows simulation progress relative to wall time; it never creates an
unbounded catch-up burst. The connection and state telemetry explicitly declare
`clock_policy: fixed_step`. This preserves existing deterministic semantics.

Recoverable command exceptions now produce `command_failed` without latching a
fatal engine error. A real stepping/state failure still pauses the engine, and
`resume` returns `engine_unavailable` until a new engine is initialized.

ASGI sends, closes, and handshake acceptance have bounded cancellation deadlines.
`WS_SIM_SEND_TIMEOUT_SECONDS` defaults to 5 seconds (allowed 0.1 to 30). Output
inactivity is bounded by `WS_SIM_IDLE_TIMEOUT_SECONDS`, default 30 seconds
(allowed 1 to 300). Normal passive viewing and paused-state heartbeats count as
output; a viewer does not have to send commands to retain a healthy session.

Runner startup and initial sends are inside the cleanup scope. Session exits
cancel/await both socket tasks and stop the worker outside the event loop. The
admission lease remains owned until the worker actually exits. Cancellation of
an ASGI transport is covered here; native simulation operations retain their
existing cooperative cancellation contract.

## Evidence

- Baseline: eight new regressions failed, reproducing command freeze, false
  resume, missing clock contract, startup leaks, and unbounded transport/idle.
- Dedicated tests exercise a live runner, slow stepping, failed startup,
  cancelled sends, no-output timeout, and real admission reuse after stalled
  handshake/initial delivery.
- Validation commands and final integrated counts are recorded in the effort
  ledger. These fixes are local to the remediation branch until merged.
