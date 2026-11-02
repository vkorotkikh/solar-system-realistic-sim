# Browser worker ledger — remediation completion
Scope: assigned controller/test/config files only. No commits, note deletions, subagents, original-worktree writes.
Plan/evidence: completion plan and October29 browser rows read; prior Oct27 implementation inspected read-only.
Ruling: media-query events must reconcile from actual width too, because delayed stale event reopens desktop semantics transiently. Verified synchronous RED, fixed.
Ruling: use shell loader for captured-producer SimulationClient browser acceptance. This is API/library scope, no defaultUI N-body or live backend.
Ruling: default blocking replay requires negotiated subscription IDs. Legacy replay separately demonstrates existing stale acceptance ambiguity outside scope; handed to parent, not silently declared passing.
RED: camera no-frame unit expected9.025 received10; stale fresh queries lacked modality; delayed event removed modality/inert.
GREEN: direct controller/body-info 18 tests; scoped Chromium panel/camera/versioned-subscription 15 tests; UI test TypeScript passes.
WebKit: downloaded/extracted Ubuntu packages under /tmp; temp Playwright cache wrappers add dependency library path. Both GTK/WPE MiniBrowser ldd now resolve all libraries, launch opens browser but first newPage closes; diagnosing child processes.
Main wiring: startup owner applied layout-width callback, onActionApplied/updateZoomStatus callback and frame hook as of current read.
WebKit host preflight limitation: Playwright missingDLOPENLibraries uses /sbin/ldconfig -p and ignores LD_LIBRARY_PATH. Downloaded libgles2 and libx264-164 into /tmp, verified ctypes dlopen. Actual WebKit 27.2 page launch succeeded (webkit-launch-final.log). Temp runner uses PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 solely to bypass that system-only presence check; real engine tests unchanged. Production CI installs normal OS deps.
GREEN: startup-warmup 4/4 after main owner wiring, 35 seconds. Direct 18/18 repeated after wiring.
Full Chromium discovered before startup-owner added five tests and before legacy parameterization: 42 pass, 1 intentional native-visibility skip, no failures. All original discovered specs ran.
Parent implemented legacy fresh-socket fence. Ruling updated: both modes now automatic CI cases. Legacy browser proof asserts retired original route closes, replacement opens but waits for connected before replay, old attempted delivery cannot set body/Kuiper, current body-only then full replacement accepted. Modern same-socket ordinary body-update proof retained. Chromium 2/2 and pinned client unit59/59 pass; final matrix will include stricter closed-error/replacement body assertions.
UI strict browser typecheck passed after startup owner annotated this.
