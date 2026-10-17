# SCN-049 Actual-Browser Acceptance

Date: 2026-10-17

Branch: `work/scn-049-browser-acceptance`

Base: `1c5d88b075cbccb6803540e53cf0229e20c97557`

Status: closed on this integration-ready branch. This note does not claim resolution on main.

## Decision

SCN-049 now has an actual-browser regression over the production `SimulationClient` and the retained native Tudat producer capture. The negotiated client rejects a stale Kuiper payload from subscription `1`, still applies that frame's valid Earth update, and then accepts the replacement Kuiper payload for subscription `2`.

No production source changed in this closure step. The protocol repair was already integrated in `a8187a7`; this branch adds the missing browser acceptance contract and SCN-049 evidence only.

## Root cause and scope boundary

The production defect was an asynchronous subscription-ordering race. A Kuiper snapshot requested by an older activation could arrive after deactivation and replacement activation. Legacy clients accepted any Kuiper-bearing state frame, so that late payload could repopulate a belt the user had revoked or replaced. Negotiated subscription IDs repair that race by matching only the Kuiper portion of a frame while preserving its body state.

The remaining closure gap was evidence, not another production defect: prior coverage used unit-level WebSocket doubles and native producer capture tests, but no browser runtime had replayed those retained producer frames through the production client.

The active visualization in `src/main.ts` remains a local simulation loop and does not instantiate `SimulationClient`. The browser test therefore loads the real Vite application, verifies the real application shell is running, imports the production client into that page, and drives it through the browser's `WebSocket` API using Playwright's WebSocket route. This proves the browser client contract; it does not claim that the current local visualization loop is a live backend consumer.

## Browser data flow

The regression in [`tests/browser/scn049-kuiper-subscription.spec.ts`](../tests/browser/scn049-kuiper-subscription.spec.ts):

1. Loads `/` and waits for the production canvas and live range status.
2. Imports the production [`SimulationClient`](../src/frontend/app/simulationClient.ts) through Vite in the browser page.
3. Replays the exact handshake, commands, stale frame, and replacement frame from the retained [`kuiper-subscription-ordering.json`](../src/frontend/app/fixtures/kuiper-subscription-ordering.json) capture.
4. Verifies the browser-emitted activation, deactivation, and replacement activation commands exactly match the native wire capture, including negotiated subscription IDs.
5. Delivers the stale subscription-`1` frame after subscription `2` is active and verifies `latestState.bodies.earth.pos` equals the native frame while `latestKuiper` remains absent.
6. Delivers the matching subscription-`2` frame and verifies Kuiper becomes available, proving the guard does not suppress all Kuiper updates.

The test uses retained frames captured from the actual native backend producer. It does not synthesize a payload shape or launch a backend during Playwright execution. Producer authenticity and capture procedure remain documented in [`REMEDIATION_SCN049_KUIPER_REACTIVATION_2026-10-15.md`](REMEDIATION_SCN049_KUIPER_REACTIVATION_2026-10-15.md).

## Strict TDD evidence

The initial browser test exposed a missing harness synchronization contract: sending `connected` synchronously during WebSocket construction preceded installation of the client's message handler. The harness was corrected to send the handshake only after Playwright observed the browser socket. This was a harness defect and is not presented as a production fix.

The required semantic RED then used the client's supported non-negotiated legacy mode by removing only `kuiper_subscription_version` from the captured handshake:

```text
PATH=/home/nomad/.npm/_npx/f4985f1adc097c41/node_modules/node/bin:$PATH \
SCN049_LEGACY_NEGOTIATION=1 SCN049_PLAYWRIGHT_PORT=4275 \
npx playwright test tests/browser/scn049-kuiper-subscription.spec.ts \
  --config=/tmp/scn049-playwright.config.cjs --project=chromium --reporter=line
```

Result: `1 failed`. The stale frame's Earth position was applied as `[-0.184271557, 0.9644459632, 0.0002020515]`, while `hasKuiper` was `true` instead of the required `false`. This is the controlled legacy behavior, not a claim that legacy compatibility was removed. See [`legacy-red.txt`](artifacts/scn049-browser-acceptance/legacy-red.txt).

With the retained negotiated handshake unchanged, the same regression passed without a production edit.

## Verification

Runtime versions:

- Node: `v22.23.2`
- npm: `11.19.0`
- Playwright: `1.64.0`
- Vite: `7.3.7`

Commands and exact results:

- `npx tsc -p tsconfig.ui-tests.json --noEmit && npx playwright test tests/browser/scn049-kuiper-subscription.spec.ts --project=chromium --project=firefox --reporter=line`
  - PASS: strict browser-test types; `2 passed (27.0s)`.
  - Evidence: [`targeted-browser.txt`](artifacts/scn049-browser-acceptance/targeted-browser.txt).
- `npm run test:browser -- --project=chromium --project=firefox`
  - PASS: `69 passed, 8 skipped (4.3m)`.
  - The SCN-049 case passed in Chromium in `13.9s` and Firefox in `591ms`.
  - Evidence: [`full-browser-runnable.txt`](artifacts/scn049-browser-acceptance/full-browser-runnable.txt).
- `npm run test:browser -- tests/browser/scn049-kuiper-subscription.spec.ts --project=webkit --reporter=line`
  - HOST BLOCKED before test code: exit `1`; Playwright cannot launch WebKit because this host lacks `libgtk-4.so.1`, the GStreamer family, and other listed shared libraries.
  - The test remains enabled for WebKit-capable CI and is not skipped or classified as a product failure.
  - Evidence: [`webkit-host-block.txt`](artifacts/scn049-browser-acceptance/webkit-host-block.txt).
- `npm test`
  - PASS: `72 passed, 1 skipped` test files; `743 passed, 413 skipped` tests.
  - Evidence: [`frontend-unit.txt`](artifacts/scn049-browser-acceptance/frontend-unit.txt).
- `npm run typecheck`
  - PASS: strict production TypeScript check.
- `npx tsc -p tsconfig.ui-tests.json --noEmit`
  - PASS: strict Playwright TypeScript check.
- `npm run build`
  - PASS: `68 modules transformed`; production bundle emitted with the existing chunk-size warning.
  - Evidence for all static/build gates: [`static-build.txt`](artifacts/scn049-browser-acceptance/static-build.txt).

## Remaining limitations

- WebKit execution is blocked only by this host's missing native browser libraries. Eligibility is preserved for CI.
- Non-negotiated legacy peers intentionally retain legacy payload acceptance semantics. The stale-reactivation guarantee applies when subscription version `1` is negotiated, as required by the compatibility design.
- This closure validates retained actual-producer frames through the actual browser client, but it does not add live-backend wiring to the local `src/main.ts` visualization loop.
