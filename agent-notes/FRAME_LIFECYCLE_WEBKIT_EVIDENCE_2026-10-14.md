# Frame lifecycle and WebKit panel evidence

Date: 2026-10-14

Assigned worktree: `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-frame-lifecycle`

Branch: `remediation/20261014-frame-lifecycle`

This is a scoped evidence handoff, not an update to the canonical master tracker.
No scientific thresholds, focus expectations, or modal contracts were weakened.
No production test-only exports were added.

## Ready source checkpoints

| Original child commit | Scope |
| --- | --- |
| `a0f9b2f883b2e37b20f605ee60314dacf41decae` | Actual backend Kuiper payload capture, client normalization, metadata retention, producer-consumer regression |
| `3087a12a334756e07e13226caf02977f8bbff104` | Active frame-stage isolation, hidden elapsed-time discard, invalid worker-state quarantine, lifecycle/browser regressions |
| `49166678a30fed48e78a670904c98dfc22bfeff1` | Exact solar orientation handoff in `src/main.ts` |
| `b5facf59617ad3e3b14e6fdbacdf421c2b272e7f` | Moon-enabled branch uses the unified lazy moon loader |

The parent reported all four integrated at `a51bebc`. The panel repair accompanying
this note does not modify `src/main.ts` or the other agents' production files.

## Lifecycle browser evidence from the completed earlier checkpoint

Committed harness: `tests/browser/frame-lifecycle.spec.ts`.

| Actual-app regression | Observed result |
| --- | --- |
| Foreground RAF timestamp stall of 60,000 ms | Passed; the worker receives bounded `stepMs <= 100`, not the entire wall-clock gap |
| Nonfinite available record in a real worker response | Passed; the worker is terminated/quarantined and scene/camera activity continues without an uncaught exception |
| Persistent throw in the real Kuiper update stage | Passed; later camera, render, HUD, and subsequent frame work continue; the persistent failure episode is reported once |
| Native hidden-tab resume | Passed; trusted native visibility transitions plus an injected 60,000 ms RAF-clock gap at 120 days/second produce a zero-duration first resumed step |

The native test used an independently launched Chromium process and its default
context via `connectOverCDP(..., { noDefaults: true })`, avoiding Playwright's
focus emulation. Visibility was not replaced with a synthetic getter/event.
The injected 60,000 ms gap is not a claim of a 60-second real-time hidden dwell.

Earlier Chromium totals were 33 existing browser tests plus three headless frame
tests plus one separately run native frame test: 37 distinct passes. The three
headless frame tests were also rerun against the exact solar prerequisite source
overlay and passed. Firefox had 27 passes and seven Chromium-only skips at that
checkpoint. Those skips are not passes.

Existing logs on this host:

- `/tmp/solar-frame-lifecycle-browser-suite-20261014.log`
- `/tmp/solar-frame-lifecycle-solar-browser-final-20261014.log`
- `/tmp/solar-frame-lifecycle-firefox-20261014.log`

Native/headful tests were not rerun during Beauvoir's reserved hardware window.
The lifecycle helper has 15 unit regressions covering bounded time, visibility
boundaries, pause/reverse/epoch changes, independent failures, and disposal.
Fixed-step server semantics, experiment offsets, planet poles, and solar JD
remain separate from decorative animation time.

## WebKit panel diagnosis and repair

The previous real WebKit run had 24 passes, seven Chromium-only skips, and three
panel failures: desktop/mobile remembered states `(false, true)`, `(true, false)`,
and `(true, true)`. The failures concerned restored `aria-expanded` or close-button
focus, not unavailable browser dependencies.

A targeted real-browser trace reproduced:

```text
query state { width: 1100, retained: false, fresh: true }
Expected desktop aria-expanded: false
Received: true
```

WebKit's retained `MediaQueryList.matches` could lag the current viewport. An
intervening `setOpen()` therefore wrote the wrong remembered state. A rapid
breakpoint round trip could also coalesce away the media-query change event.

The repair evaluates a fresh query before state writes, reconciles breakpoint
changes on resize as well as media-query events, ignores unchanged layout modes,
and removes the resize listener on disposal. Existing focus-transfer ordering,
inert surfaces, modal semantics, Escape precedence, and focus trapping are intact.

The original seven panel cases plus two new regressions passed in each browser:
**27 passed, zero failed, zero skipped across WebKit, Chromium, and Firefox**.
The new cases hold a retained query stale while real viewport changes occur, and
check that disposal prevents later resizes from restoring modality or moving focus.

Logs and configuration on this host:

- Red reproduction: `/tmp/solar-frame-lifecycle-panel-query-order-20261014.log`
- Red trace: `/tmp/solar-panel-query-order-results/panel-query-order-compare--69b50-ueries-before-queued-resize-webkit/trace.zip`
- Green panel matrix: `/tmp/solar-frame-lifecycle-panel-repair-20261014.log`
- Broader headless UI matrix: `/tmp/solar-frame-lifecycle-panel-ui-20261014.log`
- Browser configuration: `/tmp/solar-frame-lifecycle-webkit-20261014/panel-repair.config.ts`

The broader UI matrix selects accessibility, camera, experiment, explorer, panel,
reflow, and shell specs. It does not select actual-app GPU or native/headful specs.
The final handoff reports its completed result separately.

WebKit is Playwright's real `webkit-2370` MiniBrowser, launched with its normal
bundled libraries plus isolated missing runtime libraries under
`/tmp/solar-frame-lifecycle-webkit-20261014/root`. No system packages were modified.
These panel runs were headless; no browser dependency skip was substituted for a
pass.

## Type and unit checks

Strict TypeScript passed. The full frontend unit run passed 635 tests with two
existing opt-in GPU skips, using immutable solar `84ac256` and moon `c207531`
prerequisite sources through a temporary overlay. The prerequisites were not
copied into this branch or changed. This is not a claim that the child branch
contains the parent-owned loader or solar implementation.

An intermediate overlay run had six module-resolution failures for `/src/...`
URLs. Correcting the temporary overlay's URL resolver restored the complete green
run; no production source workaround or test exclusion was used.

Final unit log: `/tmp/solar-frame-lifecycle-panel-unit-final-20261014.log`.

Toolchain: Node 22.23.2 and npm 10.9.8 from the isolated
`/tmp/solar-frame-lifecycle-toolchain-20261014` installation. The originally
assigned toolchain directory was unavailable when this work resumed.

## Actual-scene probe integration cautions

The first `renderer.render(scene, camera)` in `startSimulation()` is a suitable
served-module hook for exposing the existing closure to a test. It precedes the
frame-loop setup, so expose the probe there but invoke it after normal startup.

Pausing is not a synchronization barrier for an already-posted worker response.
Use the existing worker-disable/termination path before establishing the oracle
state. Set the oracle JD, apply actual rotations, render, and read pixels in one
synchronous evaluation, or explicitly stop frame scheduling, so a later frame
cannot overwrite the capture state. Changing the JD alone does not establish a
matching model-position snapshot.

Keep actual scene parents, physical solar JD, and display-radius scaling intact.
A backend fixed-frame fixture is only comparable when its epoch, body identities,
units, and reference frame match the measured contract; do not reinterpret a
fixed-step backend payload as a different frontend epoch.
