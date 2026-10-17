# SCN-049 Actual-Browser Acceptance

Date: 2026-10-17

Branch: `work/scn-049-browser-acceptance`

Base: `1c5d88b075cbccb6803540e53cf0229e20c97557`

Status: closed on this integration-ready branch. This note does not claim resolution on main.

## Decision

SCN-049 now has an actual-browser regression over the production `SimulationClient` and the retained native Tudat producer capture. It first proves `src/main.ts` advanced the live range beyond the static `Range · —` placeholder with no page error or unexpected network escape. The negotiated client then rejects all 36 stale Kuiper positions from subscription `1`, still applies that frame's valid Earth update, and accepts the exact 38-position replacement payload for subscription `2`.

No production source changed in this closure step. The protocol repair was already integrated in `a8187a7`; this branch adds the browser acceptance contract, SCN-049 evidence, and Playwright-only Firefox software-WebGL preferences needed to execute the same live-app contract on this host.

## Root cause and scope boundary

The production defect was an asynchronous subscription-ordering race. A Kuiper snapshot requested by an older activation could arrive after deactivation and replacement activation. Legacy clients accepted any Kuiper-bearing state frame, so that late payload could repopulate a belt the user had revoked or replaced. Negotiated subscription IDs repair that race by matching only the Kuiper portion of a frame while preserving its body state.

The remaining closure gap was evidence, not another production defect. Independent review found that the first browser test could pass against static HTML, allowed every localhost HTTP origin, and checked replacement Kuiper acceptance only as non-null. The strengthened test now proves live app startup, limits HTTP(S) continuation to the exact configured Vite origin, records page errors and escaped responses, and compares the complete accepted positions against the native replacement payload.

The active visualization in `src/main.ts` remains a local simulation loop and does not instantiate `SimulationClient`. The browser test therefore loads the real Vite application, verifies the real application shell is running, imports the production client into that page, and drives it through the browser's `WebSocket` API using Playwright's WebSocket route. This proves the browser client contract; it does not claim that the current local visualization loop is a live backend consumer.

## Browser data flow

The regression in [`tests/browser/scn049-kuiper-subscription.spec.ts`](../tests/browser/scn049-kuiper-subscription.spec.ts):

1. Loads `/`, verifies the production canvas, and waits until `#status-zoom` differs from the static `Range · —` HTML placeholder before creating the client.
2. Collects `pageerror` events and requires the final collection to remain empty.
3. Continues HTTP(S) only when `request.origin` exactly equals the configured Vite `baseURL` origin. Every other HTTP(S) request receives a deterministic `503` response carrying `x-scn049-network-block: 1`; any unmarked cross-origin response fails the test. The routed fake WebSocket remains separate.
4. Imports the production [`SimulationClient`](../src/frontend/app/simulationClient.ts) through Vite in the browser page.
5. Replays the exact handshake, commands, stale frame, and replacement frame from the retained [`kuiper-subscription-ordering.json`](../src/frontend/app/fixtures/kuiper-subscription-ordering.json) capture.
6. Verifies the browser-emitted activation, deactivation, and replacement activation commands exactly match the native wire capture, including negotiated subscription IDs.
7. Delivers the stale subscription-`1` frame after subscription `2` is active and verifies `latestState.bodies.earth.pos` equals the native frame while Kuiper count is `0` and positions remain `null`.
8. Delivers the matching subscription-`2` frame and verifies count `38` plus exact equality of every distinguishing literal position with `nativeCapture.replacement.kuiper`.

The test uses retained frames captured from the actual native backend producer. It does not synthesize a payload shape or launch a backend during Playwright execution. Producer authenticity and capture procedure remain documented in [`REMEDIATION_SCN049_KUIPER_REACTIVATION_2026-10-15.md`](REMEDIATION_SCN049_KUIPER_REACTIVATION_2026-10-15.md).

## Strict TDD evidence

The initial browser test exposed a missing harness synchronization contract: sending `connected` synchronously during WebSocket construction preceded installation of the client's message handler. The harness was corrected to send the handshake only after Playwright observed the browser socket. This was a harness defect and is not presented as a production fix.

The required semantic RED then used the client's supported non-negotiated legacy mode by removing only `kuiper_subscription_version` from the captured handshake:

```text
npx --yes --package=node@22.23.2 --call \
  'node --version; UI_TEST_PORT=4275 SCN049_LEGACY_NEGOTIATION=1 \
   npm run test:browser -- tests/browser/scn049-kuiper-subscription.spec.ts \
   --project=chromium --reporter=line'
```

Result: `1 failed` at the intended stale-frame assertion after successful live-app startup. The stale frame's Earth position was applied as `[-0.184271557, 0.9644459632, 0.0002020515]`, while `hasKuiper` was `true`, count was `36`, and all stale literal positions were present instead of the required absent snapshot. This is the controlled legacy behavior, not a claim that legacy compatibility was removed. See [`legacy-red.txt`](artifacts/scn049-browser-acceptance/legacy-red.txt).

With the retained negotiated handshake unchanged, the same regression passed without a production edit.

## Verification

Runtime versions:

- Node: `v22.23.2`
- npm: `11.19.0`
- Playwright: `1.64.0`
- Vite: `7.3.7`

Commands and exact results:

- `npx --yes --package=node@22.23.2 --call 'node --version && UI_TEST_PORT=4275 npm run test:browser -- tests/browser/scn049-kuiper-subscription.spec.ts --project=chromium --project=firefox --reporter=line'`
  - PASS: `2 passed (26.2s)` with real app startup, exact-origin isolation, empty page errors, stale rejection, and exact replacement equality in both browsers.
  - Evidence: [`targeted-browser.txt`](artifacts/scn049-browser-acceptance/targeted-browser.txt).
- `npx --yes --package=node@22.23.2 --call 'node --version && UI_TEST_PORT=4275 npm run test:browser -- --project=chromium --project=firefox'`
  - PASS: `69 passed, 8 skipped (4.2m)`.
  - The SCN-049 case passed in Chromium in `13.7s` and Firefox in `1.7s`.
  - Evidence: [`full-browser-runnable.txt`](artifacts/scn049-browser-acceptance/full-browser-runnable.txt).
- `npm run test:browser -- tests/browser/scn049-kuiper-subscription.spec.ts --project=webkit --reporter=line`
  - HOST BLOCKED before test code: exit `1`; Playwright cannot launch WebKit because this host lacks `libgtk-4.so.1`, the GStreamer family, and other listed shared libraries.
  - The test remains enabled for WebKit-capable CI and is not skipped or classified as a product failure.
  - Evidence: [`webkit-host-block.txt`](artifacts/scn049-browser-acceptance/webkit-host-block.txt).
- `npx --yes --package=node@22.23.2 --call 'set -e; node --version; npm test; npm run typecheck'`
  - PASS: `72 passed, 1 skipped` test files; `743 passed, 413 skipped` tests.
  - PASS: strict production TypeScript check.
  - Evidence: [`frontend-unit.txt`](artifacts/scn049-browser-acceptance/frontend-unit.txt).
- `npx --yes --package=node@22.23.2 --call 'set -e; node --version; ./node_modules/.bin/tsc -p tsconfig.ui-tests.json --noEmit; npm run build'`
  - PASS: strict Playwright TypeScript check.
  - PASS: `68 modules transformed`; production bundle emitted with the existing chunk-size warning.
  - Evidence for all static/build gates: [`static-build.txt`](artifacts/scn049-browser-acceptance/static-build.txt).

## Remaining limitations

- WebKit execution is blocked only by this host's missing native browser libraries. Eligibility is preserved for CI.
- Default headless Firefox has no WebGL on this host. The committed Playwright Firefox project forces WebGL2 through `llvmpipe` using browser-only preferences so the live `src/main.ts` startup contract executes; production behavior is unchanged.
- Non-negotiated legacy peers intentionally retain legacy payload acceptance semantics. The stale-reactivation guarantee applies when subscription version `1` is negotiated, as required by the compatibility design.
- This closure validates retained actual-producer frames through the actual browser client, but it does not add live-backend wiring to the local `src/main.ts` visualization loop.
