# SCN-049 runtime-client checkpoint - 2026-10-14

Branch: `remediation/20261014-runtime-client`.
Worktree: `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-runtime-client`.
Base: `67c48cf`, the merged catalog checkpoint on
`remediation/canonical-register-20261014`. This note records branch-local fixes,
not a merge into integration or main. SCN-049 remains an umbrella with open children.

## Ownership and exact write scope

- `src/frontend/app/simulationClient.ts`
- `src/frontend/app/simulationClient.test.ts` (new)
- `src/frontend/features/solar/solarRealtimeClient.ts` (transport/lifecycle only)
- `src/frontend/features/solar/solarRealtimeClient.lifecycle.test.ts` (new)
- `src/frontend/features/asteroids/beltRenderer.ts` (disposal only)
- `src/frontend/features/asteroids/beltRenderer.disposal.test.ts` (new)
- `agent-notes/REMEDIATION_RUNTIME_CLIENT_2026-10-14.md` (this note)

No edits to main, packages, server, backend runner/WS, Horizons, catalogs,
SCN-013 numerics, solar physics, or event controllers. Dependencies were installed
with the pinned Node/npm toolchain, without package changes. Ownership boundaries
and findings were reported to the coordinating user before implementation. There
was no direct inter-agent messaging facility; the handoffs below require relay to
Copernicus and the events/composition-root owner, not an assumed acknowledgment.

## Independently scoped results

### Client schema/reconnect boundary: fixed and unit-tested

The simulation client accepted arbitrary parsed state, refreshed liveness on
malformed traffic, ignored delivered server errors, and lost Kuiper subscription
intent across network reconnects. Supported `state_update`, `connected` v1, and
`error` message fixtures reproduce these paths; an error delivery now reaches the
existing warning callback instead of masquerading as healthy traffic.

State requires a finite numeric epoch, object body map, finite position triples,
and valid optional Kuiper triples. A supplied epoch scale must be TDB. Legacy
omission of optional protocol/time-scale fields remains supported; supplied
incompatible versions do not invoke readiness callbacks. Malformed input leaves
the last accepted state intact until the ordinary freshness bound expires.

Only validated state/handshake traffic resets freshness and reconnect backoff.
State becomes stale and is cleared after four seconds without valid traffic;
the socket is closed after ten seconds, followed by exponential reconnect delay
(600 ms initial, jitter, at most 15 seconds). A socket that never opens also has
a ten-second deadline. Timers depend on browser scheduling, not a hard realtime
guarantee while the browser suspends execution. Construction/send failures remain
explicit in `lastError` and the warning callback. Replaced-socket events cannot
mutate the new session. Manual disconnect cancels retries.

Desired Kuiper activation is queued while offline, replayed once on readiness,
and retained across automatic reconnects. Old Kuiper data is cleared on stale or
ended sessions. Deactivation/manual disconnect clears the queued intent.

Evidence: 14 new tests failed before repair and all 14 pass afterward. This is a
client-module contract result, not a live backend/browser handshake certification.
Backend runner/WS remains the runtime review agent's scope. Broader scientific
per-source solar schema consistency is not declared closed by these WS tests.

### Solar realtime HTTP asynchronous deadline: fixed and unit-tested

The previous deadline raced only the fetch/header promise. A body decoder that
never settled could hold `inFlight` forever even after abort. URL resolution also
occurred outside cleanup and could permanently latch an in-flight request.

The race now covers fetch, body decoding, and payload validation, with a separate
abort settlement path for disposal. Completion clears timer/listener resources;
late delivery cannot replace newer state. URL failures use normal error/backoff
cleanup. Nonfinite timing options fail explicitly rather than creating an
unbounded/zero-delay configuration. Existing scientific validators are unchanged.
Synchronous JavaScript decoding/validation cannot be preempted by a timer; this
is a bound on asynchronous waits, not CPU or response-size isolation.

Evidence: eight new tests pass, including seven baseline failures. They cover a
non-cooperative body, disposal settlement, URL failure cleanup, validation/retry,
and each nonfinite timing option. Existing solar realtime tests also pass in the
full suite. No provider-science schema closure is inferred from transport tests.

### Belt instance-buffer disposal: fixed and unit-tested

Both primary belt meshes and the Kuiper companion now receive `mesh.dispose()`
before geometry/material disposal. Handles are idempotent. In the installed
Three.js implementation, `WebGLObjects.onInstancedMeshDispose` removes
`instanceMatrix` and `instanceColor`; disposing geometry alone does not do this.

Evidence: three regressions cover asteroid, Kuiper-with-companion, and empty
Kuiper handles. Each mesh, geometry, and material receives exactly one disposal
event even if the handle is disposed twice. All three failed before repair and
pass afterward. These are real Three.js CPU lifecycle events, not measured GPU
memory telemetry. No shader/orbit/paused-upload behavior was changed. The existing
asteroid replacement call to the handle benefits directly; composition-root
teardown wiring remains outside this branch.

### Solar `_clamp(NaN)`: reproduced read-only, OPEN for Copernicus

The diagnostic used the repository's pinned backend test requirements:

```sh
PYTHONPATH=backend uv run --python 3.12 --with-requirements ci/backend-test-requirements.txt python - <<'PY'
import json
import numpy as np
from sim.pfss_magnetogram import synthetic_magnetogram, PFSSCache
from sim.solar_physics import _clamp, _hathaway_normalized
nan_map = synthetic_magnetogram(float('nan'), 2451545.0, n_lat=8, n_lon=16)
zero_map = synthetic_magnetogram(0.0, 2451545.0, n_lat=8, n_lon=16)
assert np.array_equal(nan_map, zero_map)
assert np.isfinite(nan_map).all()
assert _clamp(float('nan'), 0.0, 1.0) == 0.0
assert _hathaway_normalized(float('nan')) == 0.0
rejections = []
for jd, activity in [(float('nan'), 0.5), (2451545.0, float('nan'))]:
    try:
        PFSSCache().get_or_compute(jd, activity, n_lines=1, lmax=1)
    except ValueError as error:
        rejections.append(str(error))
    else:
        raise AssertionError('cache accepted nonfinite input')
print(json.dumps({'synthetic_nan_map_finite': True, 'synthetic_nan_equals_zero': True,
                  'solar_clamp_nan': 0.0, 'hathaway_nan': 0.0,
                  'cache_rejections': rejections}))
PY
```

Result: all assertions passed. Cache rejection messages are `jd must be finite`
and `activity must be finite`. The public `synthetic_magnetogram` numerical helper
silently turns NaN activity into the same finite map as zero activity. The private
solar clamp/Hathaway helpers also return zero. This demonstrates a lower-level
numerical API policy gap, not a bypass of the finite cache/HTTP epoch ingress.
The initial probe without `PYTHONPATH=backend` failed at import (`No module named
data`); the correctly configured run above succeeded without network acquisition.

Handoff: Copernicus should decide and test the public-helper nonfinite policy,
preferably explicit rejection consistent with the cache, while retaining finite
out-of-range saturation where scientifically intended. No solar numerical file
or owner test was edited. Do not mark this child resolved from this diagnostic.

### Frame loop and hidden-tab gap: OPEN, composition-root/events handoff

The active `main.ts` loop schedules its next RAF before work, computes
`max(0, (timestamp - prevTimestamp) / 1000)`, and passes the uncapped interval to
`timeController.advanceLocalTime`. There is no visibility reset in that path.
The clock directly multiplies the interval by days/second. Separately, the
`animationLoop.ts` helper schedules at the end of its callback and has no stop or
visibility lifecycle. Changing that helper alone would not repair the active
main loop; no helper-only fix or blanket frame-loop closure was made here.

Read-only clock-path reproduction, not a browser visibility experiment:

```sh
node --experimental-strip-types --input-type=module - <<'JS'
import assert from 'node:assert/strict';
import { createTimeController } from './src/frontend/app/timeController.ts';
const simState = {julianDate: 2451545, timeScaleDaysPerSec: 120, timeScaleDirty: false, paused: false};
const time = createTimeController({dom: {}, simState, minTimeScale: -120, maxTimeScale: 120,
  currentJulianDate: () => 2451545, formatJulianAsDate: String});
time.advanceLocalTime(60);
assert.equal(simState.julianDate - 2451545, 7200);
console.log({elapsedGapSeconds: 60, rateDaysPerSecond: 120, advancedDays: 7200});
JS
```

Result: a 60-second gap advances 7,200 simulation days. The active loop's
pre-scheduling means one thrown callback does not itself cancel future RAFs,
but it skips the remaining work for that frame; persistent failure can repeatedly
starve later stages. No injected browser-stage exception experiment was run.

Handoff: agree on an explicit hidden/local-clock policy with events, reset the
local timestamp on visibility/resume, and test that hidden wall time is not
accumulated unintentionally. Preserve server-authoritative epochs and existing
pause/reverse event semantics. Test frame-stage failure handling in the actual
composition root, distinguishing recoverable visual failures from invalid
scientific state. `main.ts` remains protected, so this branch does not close
either hidden-tab or frame-stage failure behavior.

## Exact frontend validation

All commands ran in this worktree with:

```sh
export PATH=/tmp/solar-remediation-toolchain-20261014/node_modules/node/bin:$PATH
node /tmp/solar-remediation-toolchain-20261014/node_modules/npm/bin/npm-cli.js ci --no-audit --no-fund
node node_modules/vitest/vitest.mjs run src/frontend/app/simulationClient.test.ts src/frontend/features/solar/solarRealtimeClient.lifecycle.test.ts src/frontend/features/asteroids/beltRenderer.disposal.test.ts
node node_modules/typescript/bin/tsc --project tsconfig.json --strict --noEmit
node node_modules/vitest/vitest.mjs run
node node_modules/vite/bin/vite.js build
```

- Baseline focused run: 24 failed, one passed, before production edits.
- Final focused run: 25 passed across three files.
- Strict TypeScript: zero diagnostics.
- Full frontend suite: 556 passed, two skipped; 53 files passed, one skipped.
- Production build: passed, retaining the greater-than-500-kB chunk warning.
- Backend: only the read-only numerical diagnostic above; no claim of a full
  backend rerun, live provider validation, browser memory measurement, or browser
  visibility/fault-injection gate.

The two intentionally open handoffs and scientific schema residual are not
hidden by the passing frontend suite. No push or merge is performed here.
