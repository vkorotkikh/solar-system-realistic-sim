# PR #22: native tab-zoom CI synchronization

## Failure and cause

The [failed frontend run](https://github.com/vkorotkikh/solar-system-realistic-sim/actions/runs/41365405917)
tested PR head `36fedadb2b7f457fcfa6b6229e412910a178b9a5`. Only the native
Chromium tab-zoom job failed: both 200% and 400% cases saw the desktop panel
still visible. The other browser jobs, frontend checks, and scientific workflow
passed. The `GitCommitInfo` timeout was an independent metadata warning.

The original helper returned when `chrome.tabs.setZoom` acknowledged the change.
Chromium can expose the new `innerWidth` and device pixel ratio before delivering
the corresponding resize events and animation frame. The trace showed those new
metrics while the panel still had its previous desktop state. Limiting the local
run to two CPU cores reproduced the same visibility assertion failure. A renderer
CPU profile recorded approximately 6.3 seconds in `WebGLRenderer.setSize`, called
through the panel's layout callback, during the delayed frame processing.

## Change and verification boundary

`tests/browser/tab-zoom.ts` now waits for an actual animation-frame callback at
the expected device pixel ratio before returning from the native zoom operation.
An early frame at the old density schedules another frame instead of completing
the operation. A controlled-frame regression covers this retry path separately
from the genuine native-zoom evidence.
The readiness check is bounded to 30 seconds and does not inspect panel state.
The existing eight-second UI assertions are unchanged. The two full-scene cases
have a 150-second total budget; the isolated helper checks use the project's
default 30-second budget. The CI evidence below explains the scenario allowance.
Production code, scene contents, render resolution, native zoom operations,
per-tab isolation checks, focus/modality checks, and rejection of CSS, viewport,
and pinch substitutes are unchanged.

This verifies accessibility after native browser zoom processing completes. It
does not certify an eight-second end-to-end zoom latency or rendering performance
on CPU-only machines. The observed software-renderer stall remains a performance
limitation, not a newly repaired production-rendering claim.

## Local evidence

Environment: Node 22.23.2, Playwright 1.64.0, Chromium 156.0.8078.4, SwiftShader.

| Check | Result |
| --- | --- |
| Original helper, two-core reproduction | 200% case fails with expected-hidden / received-visible |
| Final helper, `taskset -c 0,1`, complete native-zoom project | 4 passed: 200%, 400%, early-frame retry, and substitute rejection |
| Controlled early-frame retry | Fails before retry correction; passes with the final helper |
| Negative control: suppress automatic panel layout reconciliation | 200% case still fails at the original visibility assertion after the new readiness wait |
| Production controller after negative control | Restored byte-for-byte to PR head |
| Full `npm test` | 1,753 passed, 2 existing optional skips |
| `npm run test:types:ui` | Passed |
| Independent scoped review | No blocking findings after correcting the early-frame retry |

The negative control proves that browser readiness does not substitute for the
panel becoming hidden.

## Published-run follow-up

The [CI run on `88882f1`](https://github.com/vkorotkikh/solar-system-realistic-sim/actions/runs/41402618787)
passed the original panel assertions in both zoom cases, including the keyboard,
focus, modal reflow, and canvas navigation checks. Both cases instead exhausted
their original 90-second scenario budget during the final reset to 100% zoom.
Trace durations identify the cumulative cost: initial renderer inspection took
12–14 seconds, opening the sibling tab took about 5.5 seconds, the initial native
zoom frame took 16 seconds, and the two full-scene screenshots took 20 seconds and
25–26 seconds. Screenshot capture alone consumed 45–47 seconds.

The scenario budget is therefore now 150 seconds, limited to the two native zoom
cases. No screenshot, interaction, assertion, or reset check is removed; native
readiness remains capped at 30 seconds and UI assertions at eight seconds. This
is an accessibility correctness gate, not a software-rendering latency benchmark.
That CI run also passed backend, scientific, frontend unit/build/type, ordinary
Chromium, Firefox, and WebKit jobs. Independent review found no Critical or
Important findings in the scoped budget adjustment. The adjusted native-zoom
project passed all four tests on two local CPU cores in 2.9 minutes, including
both final resets. A new remote run must verify the adjusted scenario budget.

## Ordinary Chromium context-lifecycle follow-up

Both native-zoom jobs passed all four tests on `8ea4248`. The
[ordinary Chromium PR job](https://github.com/vkorotkikh/solar-system-realistic-sim/actions/runs/41404201190/job/125142904900)
then failed context-loss recovery, frame-lifecycle teardown, and subsequent
context setup (53 passed, three failed, one existing native-display skip). The
push run of the same commit passed, so the failure was timing-dependent.

The PR traces recorded 85 seconds inside real WebGL context-loss injection,
90 seconds in the cleanup helper after the frame assertions passed, and a later
60-second context-creation timeout. A local two-core run reproduced the teardown
failure. Instrumentation isolated the blocking call to `WEBGL_lose_context`'s
`loseContext()`; obtaining the existing context and extension returned immediately.

The ordinary Chromium project now selects `channel: 'chromium'`, using full
Chromium's headless mode as the native-zoom gate already does. CI's existing
browser installation includes this binary. WebGL2, SwiftShader, antialiasing,
actual context loss, full scene contents, cleanup, assertions, and individual
test deadlines remain intact. No production code or test fixture is changed.

With this configuration, the three original failing cases passed on two local
CPU cores in 1.5 minutes: context loss 23.5 seconds, frame lifecycle including
cleanup 1.1 minutes, and pending-catalog unload 3.1 seconds. Independent review
found no blocking issue with the mode change. Full-project and remote CI results
must also be checked before landing this repair.

The subsequent full two-core stress run completed with 54 passed, one existing
native-display skip, and two failures waiting for a third startup worker tick
within 30 seconds (both observed two ticks). The original context-loss,
cleanup, and context-creation failures did not recur. During that run the shared
32-CPU host's load average reached 109. No readiness condition or timeout was
relaxed in response. This stress result is not a clean-suite acceptance claim;
an unrestricted local rerun and the new GitHub run remain required evidence.
