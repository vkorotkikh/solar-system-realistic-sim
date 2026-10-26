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

`SimulationClient` status: **API/library-only; not integrated into the default UI.** The client and its protocol tests are retained alongside the backend repairs. The default entry point uses local Keplerian propagation; configuring a backend origin does not select a server-authoritative N-body mode. Active solar and trajectory HTTP clients remain part of the shipped application.

The optional simulation client and inactive legacy trajectory controllers have independent connection APIs outside this consumed UI contract. Any opt-in N-body UI integration must explicitly adopt the active routing and frame-lifecycle contracts and pass browser/backend acceptance for time synchronization, coordinate origins, reconnects, and authentication. Retirement or integration requires a separate, explicit product decision; neither is authorized by retaining the library. See the [scope decision and verification boundaries](../agent-notes/CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-10.md#simulationclient-scope-decision--2026-10-17).

Browser regression tests use `UI_TEST_PORT` (default 4175), start their own strict-port Vite process, and inject the nondefault backend origin `http://127.0.0.1:9142`. They never reuse a developer server. Install the pinned browsers with `npx playwright install --with-deps chromium firefox webkit`. `PLAYWRIGHT_BROWSERS_PATH` can place binaries in an isolated local directory.
