# Branch remediation and combined verification — 2026-10-17

The supplied attachment contains 40 unique findings, SCN-001–040. Independent
source/ancestry review against refreshed `origin/main@1e82830` finds **19 scoped
roots fixed on main, 18 additional scoped repairs on construction/review
branches, two partial acceptance rows (005/030), and one owner decision (035)**.
The [maintained tracker](CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-10.md) contains
the complete per-finding table; [structured evidence](SCN001_040_BRANCH_STATUS_2026-10-17.json)
preserves exact refs and ancestry. These counts do not claim all subsystem or
release acceptance gates are closed.

## Integrated work

Branch: `remediation/scn-followup-20261017`. Final tested source:
`66ef13c969f62f48ec7aafbd5d11afc1afccc5df`, based on review source `9e00947`.
Subsequent changes are documentation/evidence only. No push, merge into main or
deployment was performed. The primary repository's unrelated local state was
preserved; its requested tracker/report files were mirrored from this worktree.

| Commit | Result |
|---|---|
| `ec9d184` | Consolidates both full scans, the 83-row canonical ledger and 138 aliases; records the approved API/library-only SimulationClient boundary. |
| `0964ed9` | Preserves 164 original scan/merged evidence files, including ignored logs, with byte/hash verification. |
| `5ce071e` | Reconciles all 40 pasted findings against refreshed remote and review branches. |
| `6045dba` | Maps decoded asteroid catalog rows directly into rendering records, retaining validation and catalog contracts. |
| `8888563` | Namespaces asteroid shader constants to avoid the Three.js PI macro collision; tests actual assembled production shaders. |
| `b1f6bd9` | Matches diagnostic sampling to the independent pixel-centre oracle while preserving production antialiasing, tolerances and negative controls. |
| `66ef13c` | Awaits full catalog adoption, owns shader-warmup polling/cancellation, and exposes accessible recovery before starting the frame lifecycle. |

Startup and rendering agents worked independently, followed by a separate
read-only review of the integrated changes. No actionable blockers remained.
Root ran the combined-source checks below; author runs are retained separately
in the [startup](REMEDIATION_STARTUP_WARMUP_2026-10-17.md) and
[rendering](SCN042_RENDERING_REPAIR_2026-10-17.md) reports.

## Fresh combined-source validation

| Check at `66ef13c` | Result and boundary |
|---|---|
| Default Vitest | **759 passed, 413 skipped**, zero failures; 73 files passed, one skipped. Skips are 411 unpromoted moon cases and two opt-in GPU cases. |
| Strict source and browser-test TypeScript | Both exit 0; compiler settings unchanged. |
| Production build | Exit 0; 69 modules. Existing >500 kB chunk warning remains (main 971.33 kB / 250.08 kB gzip). |
| Rendering-verifier unit checks | **7 passed**, zero failures. |
| Complete configured Chromium suite, hardware WebGL | **43 passed, one skipped**, zero failures; 1.9 minutes. Native visibility requires its separately owned display session and remains skipped. |
| Actual-main hardware frame gate | **6/6 cases, 156/156 markers, 235/235 surface probes**; all three geometric negative controls fail as required with GL error 0. Startup shader compilation/linking and GL state pass separately. |
| Preservation and inventory | Backend and `simulationClient*` source/tests unchanged from `9e00947`; every recorded inventory ancestry rechecked; 164 archive hashes/byte counts verified; historical ledger count metadata retained. |

The Chromium suite covers actual app composition, active frame lifecycle,
no-WebGL recovery, context loss, assembled asteroid shader compilation, startup
link failure, cancellation on unload, no-KHR fallback, UI controls/reflow and
genuine native 200%/400% tab zoom. Firefox/WebKit were not rerun in this pass;
browser automation does not supply NVDA, VoiceOver or physical-touch acceptance.

The hardware gate uses RTX 5090 through D3D12 ANGLE, production antialiasing with
four samples, a separate zero-sample diagnostic target and unchanged one-pixel
budget. Its pinned browser is 153.0.8010.12. The native tab-zoom helper reports
156.0.8078.4; those are distinct browser runs, not one shared browser identity.
Other host browser sessions existed; no exclusive-host performance claim is made.

Raw logs, hardware JSON/PNGs and a SHA-256 manifest are preserved in
[the combined validation archive](SCN_FOLLOWUP_VALIDATION_2026-10-17/).

## Acceptance still open

SCN-005's author DEV measurements pass the unchanged catalog fetch-to-parse/hash
budget in 3/3 runs at **162–182 ms**, with the same 100,000 rows and checksum.
Observed full-scene GPU-fence readiness remains **6.5–6.9 seconds** and includes
scheduling delay. These measurements are not compositor presentation or usable
scene acceptance; final-source five-minute DEV/PREVIEW delivery remains open.
The 30-second warmup timeout bounds asynchronous polling, not synchronous driver
calls. SCN-005 therefore remains partial.

SCN-030 retains manual screen-reader/touch and other applicable final-browser
requirements. SCN-035 retains the unanswered owner code-license choice, SILSO
distribution disposition and Deimos permission/replacement decision. Broader
SCN-042 artistic/layer/camera/epoch acceptance and SCN-047 release requirements
remain separate. No evidence here promotes all moon records, calibrates observed
solar input, verifies deployment or reruns the complete backend suite.

SimulationClient, its four protocol suites and the verified backend repairs are
preserved as **API/library-only; not integrated into the default UI.** Retirement
or opt-in N-body UI integration requires a separate explicit decision recorded
in the maintained tracker.

## Reproduction

Use pinned Node 22.23.2 and the unchanged lockfile/dependencies:

```sh
export PATH=/home/nomad/.npm/_npx/f4985f1adc097c41/node_modules/node/bin:$PATH
node node_modules/vitest/vitest.mjs run
npm run typecheck
npm run test:types:ui
npm run build
uv run --offline --python 3.12 --with playwright==1.64.0 --with pillow \
  python -m unittest scripts/test_solar_main_frame_verifier.py
UI_TEST_PORT=5201 UI_HARDWARE_WEBGL=1 GALLIUM_DRIVER=d3d12 \
  MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA LD_LIBRARY_PATH=/usr/lib/wsl/lib \
  node node_modules/@playwright/test/cli.js test --project=chromium --reporter=line
```

For the frame gate, start this revision's Vite on an available port, then run:

```sh
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5202 --strictPort
# In a second terminal:
GALLIUM_DRIVER=d3d12 MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA \
  LD_LIBRARY_PATH=/usr/lib/wsl/lib \
  uv run --offline --python 3.12 --with playwright==1.64.0 --with pillow \
  python scripts/verify_solar_main_frame.py \
  --chromium /home/nomad/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome \
  --expect-gpu 'NVIDIA GeForce RTX 5090' \
  --origin http://127.0.0.1:5202 --out <fresh-output-directory>
```

Only this task's servers and browser processes were stopped after validation.
