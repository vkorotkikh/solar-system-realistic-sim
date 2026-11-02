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
The existing eight-second UI assertions and 90-second test limit are unchanged.
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
panel becoming hidden. Backend and unrelated browser suites were not rerun for
this test-helper-only repair. Remote CI must verify the published commit.
