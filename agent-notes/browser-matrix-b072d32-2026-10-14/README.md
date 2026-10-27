# Integrated browser acceptance: b072d32

## Revision, isolation, and result

- Tested commit: `b072d32191217492714ed869a04aa03500cd48f6`.
- Isolated export: `/tmp/solar-browser-b072d32-20261014`.
- Source: an unmodified `git archive` of that commit, including its full assets.
- No parent worktree edits, startup-policy changes, production edits, assertion
  changes, content reductions, timeout increases, or scientific budget changes.
- Volta profiling was explicitly paused/completed and the parent released the
  native browser window before this run. The window was released after completion.
- Started: `2026-10-14T23:35:59.862Z`.
- Playwright duration: `291850.719 ms` (4.9 minutes in the console summary).
- Process exit: `0`.
- **111 cases: 97 passed, 14 skipped, zero unexpected failures, zero flaky cases.**

| Project | Passed | Skipped |
| --- | ---: | ---: |
| Chromium | 39 | 0 |
| Firefox | 29 | 7 |
| WebKit | 29 | 7 |

The seven UI-shell spec files contributed **87 passes with zero skips**:
accessibility, camera, experiment, explorer, panel, reflow, and shell. The panel
spec itself contributed 27 passes, including the repaired WebKit breakpoint cases.

Chromium additionally passed three actual-app smoke/recovery cases, all four
actual-app frame lifecycle cases, and three native-tab-zoom/guard cases. Of the
three zoom cases, two exercise the actual application at genuine 200% and 400%
Chrome per-tab zoom; the third rejects non-native substitutes.

## Explicit skips and exclusions

Firefox and WebKit each retained four frame-lifecycle skips with reason
`Chromium frame/worker gate`, plus three tab-zoom skips with reason
`Chrome tabs API is Chromium-specific, not Safari/Firefox zoom evidence`.
These are the 14 skips, not passes.

The committed Playwright configuration also excludes `app-smoke.spec.ts` from
Firefox and WebKit. Its three cases per browser are not collected and are not
included in the 111-case denominator. No Firefox/WebKit full-scene smoke pass is
claimed. All exact case titles, statuses, annotations, durations, and attachments
are preserved in `cases.json` and the original `playwright-results.json`.

## Native and actual-app evidence

- Browser reported by native captures: Chromium `156.0.8078.4`.
- Actual-app WebGL and native zoom used SwiftShader, not the RTX hardware gate.
- Native visibility used an owned, headed Chromium process on display `:0` and
  the committed `connectOverCDP(..., { noDefaults: true })` harness.
- Trusted native hidden/visible events were recorded. After the injected
  60,000 ms RAF-clock gap at 120 days/second, the first resumed worker step was
  `0 ms`. This is not a claim of a 60-second wall-clock hidden dwell.
- Foreground timestamp bounding, quarantine of a corrupted real worker response,
  and persistent-stage failure isolation all passed on the actual app.
- Native 200%/400% zoom retained per-tab isolation, focus/modal behavior, and
  accessible keyboard stops. Four PNG screenshots are preserved inline as base64
  attachment `body` values in `cases.json` and `playwright-results.json`, not in
  `artifacts.tar.gz`.

This is functional acceptance evidence, not a new 2-second startup-performance
pass. The pending full-content-first versus early-procedural policy was untouched.

## Exact export and gate commands

Commands were issued from the assigned child worktree, not the parent worktree:

```sh
cd /home/nomad/ai/projects/worktrees/solar-remediation-20261014-frame-lifecycle
mkdir /tmp/solar-browser-b072d32-20261014
git archive b072d32191217492714ed869a04aa03500cd48f6 \
  | tar -x -C /tmp/solar-browser-b072d32-20261014
ln -s /home/nomad/ai/projects/worktrees/solar-remediation-20261014-frame-lifecycle/node_modules \
  /tmp/solar-browser-b072d32-20261014/node_modules
```

The archived `playwright.config.ts` and `vite.config.mjs` were placed in the
export's `.acceptance/` directory. The Playwright adapter preserves all committed
projects, test eligibility, assertions, and timeouts. Its only overrides are
isolated paths/reporters/server setup and the WebKit dependency wrapper. The Vite
adapter loads any committed Vite configuration and redirects only its dependency
cache into the export, without prerequisite source overlays.

```sh
export PATH=/tmp/solar-frame-lifecycle-toolchain-20261014/node_modules/node-linux-x64/bin:$PATH
cd /tmp/solar-browser-b072d32-20261014
UI_TEST_PORT=4210 UI_HARDWARE_WEBGL=0 FRAME_NATIVE_VISIBILITY=1 \
  node node_modules/playwright/cli.js test \
  --config .acceptance/playwright.config.ts --workers=1 \
  > .acceptance/matrix.log 2>&1
result=$?
printf '%s\n' "$result" > .acceptance/exit-code.txt
```

The owned server command was:

```sh
node node_modules/vite/bin/vite.js \
  --config /tmp/solar-browser-b072d32-20261014/.acceptance/vite.config.mjs \
  --host 127.0.0.1 --port 4210 --strictPort
```

The inherited server environment retained
`VITE_BACKEND_ORIGIN=http://127.0.0.1:9142`. Existing test-side external-service
routes were unchanged; no backend process was launched for this matrix.

## Exact dependency paths

Node was `v22.23.2` from the isolated toolchain above. Browser executable paths:

```text
/home/nomad/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome
/home/nomad/.cache/ms-playwright/firefox-1555/firefox/firefox
/home/nomad/.cache/ms-playwright/webkit-2370/minibrowser-wpe/bin/MiniBrowser
```

WebKit launch wrapper:
`/tmp/solar-frame-lifecycle-webkit-20261014/webkit-wrapper.sh`, preserved verbatim
in this evidence directory. Its exact runtime setup is:

```sh
SOLAR_WEBKIT_DIR=/home/nomad/.cache/ms-playwright/webkit-2370/minibrowser-wpe
export WEBKIT_EXEC_PATH="$SOLAR_WEBKIT_DIR/bin"
export WEBKIT_INJECTED_BUNDLE_PATH="$SOLAR_WEBKIT_DIR/lib"
export WEBKIT_INSPECTOR_RESOURCES_PATH="$SOLAR_WEBKIT_DIR/share"
export WEBKIT_FORCE_COMPLEX_TEXT=1
export LD_LIBRARY_PATH="$SOLAR_WEBKIT_DIR/lib:$SOLAR_WEBKIT_DIR/sys/lib:/tmp/solar-frame-lifecycle-webkit-20261014/root/usr/lib/x86_64-linux-gnu:/tmp/solar-frame-lifecycle-webkit-20261014/root/usr/lib/x86_64-linux-gnu/blas:/tmp/solar-frame-lifecycle-webkit-20261014/root/usr/lib/x86_64-linux-gnu/lapack"
exec "$SOLAR_WEBKIT_DIR/bin/MiniBrowser" "$@"
```

Missing WebKit runtime libraries were already available in that isolated root;
this run installed nothing and modified no system dependencies. The display
environment was `DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`, and
`XDG_RUNTIME_DIR=/run/user/1000`.

## Evidence inventory

- `matrix-output.txt`: original complete console output.
- `playwright-results.json`: original structured Playwright report.
- `cases.json`: all 111 exact cases with results, skips, and attachments.
- `summary.json`: counts, scope, project exclusions, and exact skip reasons.
- `test-list.txt`: collected-case list before browser launch.
- `environment.json`: revision, Node, executable paths, and display environment.
- `exit-code.txt`: recorded process exit status.
- `playwright.config.ts`, `vite.config.mjs`, `webkit-wrapper.sh`: exact adapters.
- `artifacts.tar.gz`: 444-byte archive containing empty result directories and
  `.last-run.json` only; it contains no screenshots.
- `SHA256SUMS`: checksums for the archived evidence files.

The four PNGs are preserved inline in both JSON reports. Their base64 attachment
`body` lengths are 193164, 190968, 177300, and 292384 characters. Decode those
values to reconstruct the screenshots; the empty archived result directories are
not image captures. Earlier 87-pass evidence remains unchanged.
