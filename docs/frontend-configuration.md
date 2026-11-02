# Frontend deployment contract

The active entry point consumes one `createRuntimeUiConfig` contract. Backend routing is build-time configuration: set `VITE_BACKEND_ORIGIN` to an absolute HTTP(S) origin (for example, `https://solar.example:9443`). An empty/unset value uses the page origin, intended for a same-origin reverse proxy. Credentials, paths, query strings, fragments, non-HTTP protocols, and HTTPS-page/HTTP-backend mixed content are rejected with the accessible unavailable state. URL parameters cannot redirect backend requests. Endpoint paths remain owned by the existing clients.

`npm run dev:full -- --backend-port 9342 --frontend-port 5179` passes `http://127.0.0.1:9342` to Vite, unless an explicit `VITE_BACKEND_ORIGIN` is provided. Wildcard bind hosts require that explicit browser-reachable origin. Both frontend launchers use strict ports rather than silently advancing to another port. Nondefault frontend origins must also be configured in the backend's `SOLAR_CORS_ALLOWED_ORIGINS`; this frontend contract does not widen backend authorization/CORS policy. `dev` and `dev:ui` use the same-origin default unless the environment supplies the origin.

Viewport settings accept query parameters first, then their `VITE_*` environment counterpart, then the default:

| Query | Environment | Default | Accepted range |
| --- | --- | --- | --- |
| `uiWidth` | `VITE_UI_WIDTH` | available width | 160-10000 CSS px |
| `uiHeight` | `VITE_UI_HEIGHT` | available height | 160-10000 CSS px |
| `renderScale` | `VITE_RENDER_SCALE` | 1 | 0.5-3 |
| `maxPixelRatio` | `VITE_MAX_PIXEL_RATIO` | 2 | 1-4 |

Width and height apply independently to the viewport shell, constrained to available width/viewport height. They do not emulate a mobile device or change media-query viewport dimensions. Narrow/short page reflow remains based on the actual CSS viewport. Drawing-buffer pixel ratio is `min(devicePixelRatio, maxPixelRatio) * renderScale`; camera aspect uses the actual canvas CSS dimensions. Invalid supplied numbers fail explicitly rather than silently clamping to a different setting. Resize observation covers both shell and canvas.

`SimulationClient` status: **API/library-only; not integrated into the default UI.** The client and its protocol tests are retained alongside the backend repairs. The default entry point uses local Keplerian propagation; configuring a backend origin does not select a server-authoritative N-body mode. Active solar HTTP clients remain part of the shipped application.

The optional simulation client and inactive legacy trajectory controllers have independent connection APIs outside this consumed UI contract. Any opt-in N-body UI integration must explicitly adopt the active routing and frame-lifecycle contracts and pass browser/backend acceptance for time synchronization, coordinate origins, reconnects, and authentication. Retirement or integration requires a separate, explicit product decision; neither is authorized by retaining the library. See the [scope decision and verification boundaries](../agent-notes/CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-10.md#simulationclient-scope-decision--2026-10-17).

Browser regression tests use `UI_TEST_PORT` (default 4175), start their own strict-port Vite process, and inject the nondefault backend origin `http://127.0.0.1:9142`. They never reuse a developer server. Install the pinned browsers with `npx playwright install --with-deps chromium firefox webkit`. `PLAYWRIGHT_BROWSERS_PATH` can place binaries in an isolated local directory.

## Retained browser diagnostic commands

The maintained diagnostic CLI uses the repository's declared Playwright runner and Chromium configuration. It starts its own server:

| Command | Fixed diagnostic |
| --- | --- |
| `node scripts/run-browser-diagnostic.mjs warp` | Select the H29 warp-wave preset and hypothesis, trigger it, and watch for errors for 10 seconds. |
| `node scripts/run-browser-diagnostic.mjs scale` | Open Display, capture normal and realistic scale at 1280×800, and record raw 20×20 center-pixel diagnostics. |
| `node scripts/run-browser-diagnostic.mjs debug` | Capture the running application at 1920×1080 after a three-second observation window. |

The former root `testWarp.js` and `testRealisticScale.mjs` scratch entrypoints remain retired. `get_errors.mjs` is a compatibility wrapper for the maintained `debug` scenario.

Each scenario accepts only `--help` (or `-h`), `--list`, or an optional `--output EXISTING_PARENT` for a run. Help/list do not resolve browser tooling or start a server. Relative output parents are resolved from the caller's working directory. A run always creates and announces a fresh child directory, under the chosen existing parent or the system temporary directory; the parent is never given to Playwright as its disposable output directory. Artifacts are retained there for inspection. The launcher does not install packages or browsers and does not forward arbitrary Playwright arguments. Install the declared dependencies and Chromium beforehand using the browser setup above. `UI_TEST_PORT` and `PLAYWRIGHT_BROWSERS_PATH` are inherited unchanged; choose an unused strict port.

These scenarios load the actual application and local assets. Only the known external font stylesheet and solar endpoint responses use narrow synthetic fixtures; the fixtures explicitly deliver no observed solar data. Unexpected external requests, failed navigation, missing controls, `console.error`, and uncaught page errors fail the run. The H29 sequence, screenshots, and raw center statistics are diagnostics, not visual, GPU, physical-accuracy, or live-provider acceptance. The scale screenshots include the opened Display disclosure; there is no pixel baseline or accuracy threshold.

The CLI returns the runner's ordinary exit status and reports signal termination as failure. On interruption it forwards the signal to its owned runner (and its process group on POSIX), allowing up to five seconds before forced termination. Playwright owns normal browser/server cleanup; this is not a guarantee about adversarial descendants that detach from the owned process group. Existing browser regression suites remain separate and unchanged.
