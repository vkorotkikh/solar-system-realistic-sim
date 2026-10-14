# Accessibility remediation handoff, 2026-10-14

Assigned worktree: `/home/nomad/ai/projects/worktrees/solar-remediation-20261014-accessibility`.
Branch: `remediation/20261014-accessibility`.
Implementation commits: `2e2b31d` (test foundations), `7fafd83` (composition, remediation, configuration and regression coverage). This report is committed separately after those changes. No push, merge, subagent, backend modification or master-tracker edit was performed.

## Canonical issue status

| Issue | Status | Delivered behavior and evidence |
| --- | --- | --- |
| SCN-030, P1 | IMPLEMENTED; Chromium/Firefox automated checks PASS; remaining release evidence below | R1-R8 implemented in active composition. Seven viewport sizes, modal focus transitions, keyboard/tap camera, native picker policy, deduplicated output and experiment behavior tested against production HTML/CSS/controllers. Manual AT/real zoom/pinch and WebKit execution are not claimed complete. |
| SCN-031, P2 | FIXED; actual-app Chromium checks PASS | Renderer construction is caught before simulation initialization continues. A named unavailable surface, alert and keyboard-accessible reload action remain usable, with the drawer operational and unavailable simulation inputs disabled. Actual `WEBGL_lose_context` stops animation/worker/solar delivery and exposes recovery. A restored-context event keeps restart explicit. |
| SCN-039, P2 | DECISION IMPLEMENTED; nondefault configuration tests PASS | One consumed runtime configuration contract. `VITE_BACKEND_ORIGIN`, otherwise same-origin deployment; strict HTTP(S) origin validation; no query-based backend redirection; dev launcher forwards nondefault backend ports. Viewport dimensions and render scale are actually consumed, with strict frontend ports. Nondefault origin, CSS size and drawing-buffer dimensions verified in the real app. |

The combined product commit keeps shared `main.ts`/HTML/controller wiring reviewable together. The October 11 plan's historical merge checkpoint and seven suggested implementation commits were not replayed onto this newer assigned baseline.

## R1-R8 traceability

| Requirement | Implementation and regression |
| --- | --- |
| R1: responsive reflow | Removed body minimum width and phone full-width override; normal mobile drawers leave at least 24 CSS px of context. Below 320px width or 480px height, toolbar/tools/canvas/hints/status use scrollable flow and canvas minimum height 160px. Short panels scroll their headers too. Browser geometry and control reachability cover 195x422, 320x568, 390x844, 844x390, 1100x800, 1101x800 and 1440x900, expanded disclosures/tools and long production solar-error text. |
| R2: keyboard/tap camera | Focusable named canvas, described instructions and inset focus ring. Arrow orbit, Shift+Arrow pan, +/- zoom and ten native buttons share an ordered queue. Actions flush after Follow and before OrbitControls/render. Public Three camera math respects live enable flags, speed/bounds/up axis/target identity; modifiers and composition are ignored. Real OrbitControls tests cover pointer drag/damping, wheel, tap parity, queued disable/disposal, Follow and Free cam. |
| R3: stable announcements | Time text and datetime setters compare rendered values independently; search count updates only when changed; the selected card is not live; description is stable. Setter and real MutationObserver tests verify unchanged values produce no extra mutations. Existing solar/catalog announcements stay independent. |
| R4: drawer modality | Mobile dialog is named by the visible title, owns focus and isolates the viewport with inert/aria-hidden. Rendered/enabled controls are trapped; closed disclosure descendants are excluded. Empty trap/guard use the panel fallback. Escape, close and backdrop restore Controls. Synchronous setter instrumentation checks focus ownership during hiding/isolation. |
| R5: breakpoint focus | All four remembered desktop/mobile combinations exercised in both directions across 1100/1101px. Valid panel/canvas focus is preserved and newly modal layout moves background focus inside. A reproduced resize/API race was fixed by reading current media-query state inside `setOpen`, rather than waiting for the change event. |
| R6: mobile target context | Persistent touch guidance, normal-phone canvas strip, no child-index hint hiding. Native picker for narrow/coarse input; fine-pointer list rows are measured, with a session-latched picker fallback for unavailable/undersized geometry. Selection/focus survive presentation changes. Native popup rows remain OS/browser-owned. |
| R7: accurate experiment copy | Initial/restored H29 and subsequent changes update only the action span and preserve SVG. Baseline energy-only precedence is tested against its actual engine. The subsequently reviewed events resolver is accepted as the authoritative source/preset/model port; resolved mode updates both selectors, source notes, preset/help wording and dispatch. Explicit source/model changes clear the preset in that mode. The no-op observer checkbox is removed, per the controller's newer instruction. |
| R8: executable coverage | Vitest additions, renderer-free production-DOM fixtures, real-app Chromium smoke, Chromium/Firefox matrix, exact Playwright dependency, strict browser-test types, diagnostic identity gate and frontend CI. Existing test discovery and science gates preserved. |

Author-controlled interactive targets are measured at 44x44px, allowing 0.001px floating-point geometry tolerance (Firefox reported values such as 43.99998474121094 for a 44px control). Horizontal overflow tolerance is 1px. The 195px viewport is a deterministic CSS reflow fixture, not a claim to have simulated mobile pinch zoom.

## Files changed

- Composition and presentation: `src/main.ts`, `index.html`, `src/style.css`.
- Controllers: `src/frontend/app/panelController.ts`, `explorerController.ts`, `bodyPickerPresentation.ts`, `viewportCameraController.ts`, `experimentController.ts`, `rendererRecovery.ts`, and existing `timeController.ts`.
- Configuration: `src/frontend/app/runtimeConfig.ts`, `sceneSetup.ts`, `scripts/dev-full-config.mjs`, `scripts/dev-full.mjs`, `scripts/run-ui-dev.mjs`, `docs/frontend-configuration.md`.
- Tests: controller/time/runtime unit files, `scripts/frontend-origin.test.mjs`, `tests/browser/{shell,accessibility,panel,explorer,reflow,camera,experiment,app-smoke}.spec.ts`, fixture and helpers.
- Gates: `scripts/check-ui-types.mjs`, its tests, `tests/baselines/frontend-types.json`, `tsconfig.ui-tests.json`, `playwright.config.ts`, `.github/workflows/frontend-ui.yml`, package files and browser-output ignores.

`main.ts` has zero remaining strict TypeScript diagnostics, using explicit parameter/material/texture/population types and narrow live-state/scene-identity adapters, without `any` annotations or ignores. The solar state adapter forwards live Julian date, pause, time scale and scale-mode getters so the events controller's motion policy is preserved during integration. No scientific engine file was edited.

## Exact final validation

The host initially reported Node 24.21.0/npm 11.19.0; dependency installation used those host tools. Final commands below used the isolated, verified Node 22.23.2/npm 10.9.8 toolchain. The controller separately provided an equivalent toolchain under `/tmp/solar-remediation-toolchain-20261014`.

Commands were run from the assigned worktree, with:

```sh
export PATH=/home/nomad/.npm/_npx/f4985f1adc097c41/node_modules/.bin:$PATH
export PLAYWRIGHT_BROWSERS_PATH=$PWD/artifacts/accessibility/browsers
node --version  # v22.23.2
npm --version   # 10.9.8
```

| Command | Result |
| --- | --- |
| `npm test` | PASS: 35 files, 426 tests; final duration 1.58s. |
| `npm run typecheck:ratchet` | PASS: 199/226 inherited diagnostic budget; no bucket growth. |
| `npm run typecheck:ui-delta` | PASS: 199 legacy diagnostics, no new/increased normalized identities relative to fresh 217-diagnostic assigned-baseline capture. |
| `npm run test:types:ui` | PASS, strict browser configuration/fixture/test types. |
| `npm run build` | PASS, 1.85s; existing >500kB chunk warning remains. |
| `npm run typecheck` | EXPECTED FAIL: 199 remaining legacy diagnostics outside `main.ts`; global strict typecheck is not reported as passing. |
| `UI_TEST_PORT=4177 npm run test:browser -- --project=chromium --grep-invert 'actual app\|no-WebGL\|actual WebGL'` | PASS: 27 production-DOM/controller tests, 26.9s. In the executed shell argument the regular expression uses ordinary `|` alternation, without backslashes. |
| `UI_TEST_PORT=4176 npm run test:browser -- --project=firefox` | PASS: 27 production-DOM/controller tests, 38.1s. |
| `UI_TEST_PORT=4178 npm run test:browser -- app-smoke.spec.ts --project=chromium` | PASS: 3 actual-app tests, 59.8s. |
| `npm run test:browser -- shell.spec.ts --project=firefox --project=webkit` | Initial Firefox shell PASS; WebKit BLOCKED at launch by missing OS libraries, not skipped or counted as passing. |
| `git diff --check` and staged equivalent | PASS after removing one configuration-line trailing space. |

Reproduction before repair: unchanged HUD updates produced 2 setter writes instead of 1; original CSS overflowed a 195px viewport by 85px; mobile dialog semantics were absent; runtime config clamped 195px to 640px and did not consume the backend origin. Tests were written/run before those corresponding repairs. New controller imports initially failed because the modules did not exist. During expanded coverage, the panel media-query race was reproduced and repaired. Test harness corrections used actual keyboard navigation for focus-visible, numerical tolerance for Three vector math/Firefox geometry, label clicks for custom native checkboxes, and interception of cache-busted `/src/main.ts?...` as well as the plain entry URL. A run affected by live Vite entry changes was interrupted; only the stable final reruns above are completion evidence.

The real-app tests do not replace the entry point or local assets. Only external service requests receive deterministic unavailable responses. Successful smoke asserts no page errors, a real changing Range readout, 500x700 CSS canvas with 250x350 drawing buffer under renderScale=0.5, calls to port 9142 and none to 8042, working drawer/search/H29 action, constructor-failure recovery, and real context loss. Restored-context messaging is tested using an event; automatic real-driver restoration is not claimed.

Local raw logs are intentionally ignored under `artifacts/accessibility/`: `unit-final.txt`, `build-final.txt`, `types-final.txt`, `chromium-fixture-final.txt`, `firefox-final.txt`, `app-smoke-final.txt`, and `hardware-probe.json`. Failure traces are ignored under port-isolated `test-results/` directories. No generated browser report or dependency directory is committed.

## Browser and hardware availability

Playwright 1.64.0 downloaded Chromium build 1248 (Chrome 156.0.8078.4), Firefox and WebKit into this worktree's ignored browser directory. Existing shared Chromium builds 1243/1234 were discovered but not used for the final matrix. Chromium and Firefox launch; WebKit cannot launch because libraries including GTK4, Graphene, GStreamer components, libavif16 and others are absent. CI retains all three projects and installs dependencies with `playwright install --with-deps`; no local skip was added.

The initial Chromium app tests explicitly used headless ANGLE/SwiftShader. A separate bounded headful WSLg probe launched Chromium without software-rendering flags, created WebGL2, and queried `WEBGL_debug_renderer_info`. Its actual unmasked renderer was:

```text
ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)
```

That initial probe provides software-rendering evidence only. A subsequent explicit WSLg/D3D12 run verified actual NVIDIA hardware rendering, as recorded below. Shader precision, real-device touch/pinch and screen-reader speech are not claimed. Controller-reported asteroid GPU results are not reproduced or counted as this domain's evidence.

### Actual NVIDIA hardware follow-up

The production-app browser tests subsequently passed **3/3 in 19.7 seconds** on headful Chromium 156 with the pinned Node 22.23.2/npm 10.9.8 toolchain. The application canvas reported this unmasked renderer:

```text
ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 5090), OpenGL 4.6)
```

The tests exercised actual app composition with a nondefault backend origin and viewport, a forced no-WebGL constructor failure with accessible reload and usable drawer, and actual `WEBGL_lose_context` loss with keyboard-accessible recovery. This is hardware-backed UI/recovery evidence, not a scientific shader-accuracy gate or comprehensive GPU/platform certification. The no-WebGL case deliberately has no rendering context.

Exact command, from the assigned accessibility worktree:

```sh
GALLIUM_DRIVER=d3d12 MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA LD_LIBRARY_PATH=/usr/lib/wsl/lib UI_HARDWARE_WEBGL=1 PLAYWRIGHT_BROWSERS_PATH=$PWD/artifacts/accessibility/browsers UI_TEST_PORT=4178 PATH=/home/nomad/.npm/_npx/f4985f1adc097c41/node_modules/.bin:$PATH npm run test:browser -- app-smoke.spec.ts --project=chromium
```

Evidence: `artifacts/accessibility/app-smoke-hardware.txt` and the Playwright `webgl-renderer` attachment. `UI_HARDWARE_WEBGL=1` selects headful Chromium with `--no-sandbox --ignore-gpu-blocklist --use-gl=angle --use-angle=gl`; the application test asserts a D3D12/NVIDIA RTX renderer, so a silent SwiftShader fallback fails. Default browser CI remains explicitly headless SwiftShader. `npm run test:types:ui` and `git diff --check` also passed after this browser-config/test update. No dependency versions changed in this follow-up.

## Dependency handoff to supply-chain owner

Only added dev dependencies: exact `@playwright/test` 1.64.0 and exact `@types/node` 22.19.1, with committed lockfile changes. No happy-dom and no production dependency added. Existing resolved Three 0.182.0, TypeScript 5.9.3, Vite 7.3.1 and Vitest 3.2.4 were retained. Installation's audit reported 11 vulnerabilities (1 low, 2 moderate, 6 high, 2 critical); dependency remediation belongs to the concurrently assigned supply-chain owner and is not claimed fixed here.

## Controller integration notes and remaining actions

The controller is integrating events commit `32da51b` and planets commit `9221a61`; neither was merged/cherry-picked into this assigned branch. Preserve both owners' work when resolving shared-file conflicts:

1. Keep events' `applyMetricDisplayOffsets`, canonical-state isolation, removal of model/worker metric mutation, `createKuiperBeltUpdater`, decorative-motion policy and explanatory HTML. This accessibility patch does not intentionally revert those changes; its baseline still predates them.
2. Keep the extracted `createExperimentController` as the sole binding owner. It receives `engineSelectionResolver(agnEngine)`, which selects the events module's `resolveAgnSelection` when present. Do not retain the old inline `syncAgnSelection` listeners or call as a second binding. Resolver mode preserves named preset source/model precedence, clears presets on explicit selections and reports source notes. The observer checkbox/DOM requirement/calls stay removed. The unit test explicitly distinguishes the baseline and integrated engine contracts; the browser resolver-port test covers restored H29, named-preset synchronization and explicit-selection reset. Integrated real-engine app behavior still requires the controller's combined gates.
3. Keep solar-state live getters for `paused` and `timeScaleDaysPerSec` as well as Julian date; dropping them would break the integrated decorative-motion policy. Keep `sunCtrl.disposeSolarDelivery()` in cleanup and context-loss handling.
4. Preserve planet/trajectory owner fixes. This patch does not edit those engines. Re-run the combined unit/type/build/browser gates after conflict resolution; diagnostic counts above describe this assigned branch, not the controller's newer integrated tree.
5. Run WebKit on a host with its required OS libraries. Manual NVDA/Chrome and VoiceOver/Safari checks remain NOT RUN, including virtual-cursor isolation, actual spoken search output, canvas descriptions and native-picker behavior. Real browser 200%/400% zoom and OS text resizing remain NOT RUN; the automated CSS 200% text fixture is separate evidence. Physical touch pinch remains NOT RUN. Actual RTX 5090/D3D12 application rendering and context-loss recovery passed in the hardware follow-up above; other hardware/platform combinations remain unverified.

These gaps prevent a claim of complete AT/WCAG or cross-platform hardware validation; they do not represent unimplemented core UI/controller fixes. Hardware evidence is limited to the explicitly identified RTX 5090/D3D12 browser configuration above. No backend scientific tests were run because this patch changes no backend or scientific engine. The controller owns integrated full gates and final canonical-register updates.

## Precise provenance

Acceptance source: `docs/superpowers/specs/2026-10-11-frontend-accessibility-remediation-design.md`, sections Responsive behavior, Panel state and focus, Camera input and help, Explorer and announcement behavior, Experiment presentation and dispatch, and Verification architecture. Implementation source: `docs/superpowers/plans/2026-10-11-frontend-accessibility-remediation.md`, Tasks 1-7. Camera increments are the reviewed UI contract (5 degrees, 5% view-height pan, 0.95^zoomSpeed), not newly asserted scientific physics.

Newer authority: the controller's explicit instruction to preserve event preset synchronization/no observer toggle, verified against `git show 32da51b -- src/main.ts index.html` and `32da51b:src/frontend/features/superluminal-modeling/agnShockwaveEngine.ts` (`resolveAgnSelection`). Existing baseline precedence is exercised directly through `createAgnShockwaveEngine` in the unit regression. No scientific formula, source-coordinate dataset or physics engine was changed, and no new scientific evidence is asserted.
