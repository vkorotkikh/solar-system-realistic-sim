# Frontend Accessibility Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all eight reviewed UI findings and verify usable camera input, modal focus, reflow, announcements, and experiment messaging.

**Architecture:** Extract focused controllers from active `src/main.ts`; keep physics and rendering dependencies injected. Use existing native HTML controls, shared camera commands for keyboard/tap input, Vitest for logic, and real-browser fixtures that instantiate production controllers against production HTML/CSS. Keep a separate actual-app smoke to catch composition failures.

**Tech Stack:** TypeScript 5.9.3, Three 0.182.0, Vite 7.3.1, Vitest 3.2.4, development-only Playwright Test 1.64.0.

**Spec:** [2026-10-11-frontend-accessibility-remediation-design.md](../specs/2026-10-11-frontend-accessibility-remediation-design.md)

## Global Constraints

- Runtime stack remains TypeScript, Three 0.182.0, and Vite; no UI framework or production dependency is added.
- Tests use Vitest 3.2.4 in Node and `@playwright/test` 1.64.0 as an exact development dependency. No happy-dom dependency.
- Preserve the reviewed integration target's Node 22.23.2/npm 10.9.8 pins in local verification and frontend CI; retain locked dependency versions except explicit test additions.
- Mobile panel breakpoint remains `(max-width: 1100px)`; independent desktop-open/mobile-open memory remains.
- Product target for author-controlled interactive surfaces is at least 44 by 44 CSS px. Native picker option geometry is browser/OS-owned and is validated as such, not claimed to be author-sized.
- Normal-width mobile drawers retain at least 24 CSS px of dimmed canvas; below 320 CSS px a full-width drawer is allowed to keep controls usable.
- Browser Ctrl/Cmd keyboard zoom shortcuts remain unhandled by the new camera code. Existing canvas wheel/pinch behavior remains unchanged.
- Every implementation commit includes its relevant regression and passes its targeted gates. Preserve default Vitest discovery; never stage audit evidence or generated browser reports.
- No new TypeScript diagnostic identity or increased identity count is allowed relative to fresh diagnostics from the pinned integration target. Preserve its existing bucket ratchet without budget growth; add the stricter identity gate rather than copying an unrelated baseline.

## Review Focus

- Re-entering mobile layout with remembered open state and canvas focus must move focus inside the dialog before isolation; Task 2 tests the complete state matrix.
- Long solar errors and a short 195px-wide viewport must leave every control and the final action reachable; Task 4 measures content, not only page overflow.
- Search Escape, IME input, preferred selection and zero matches must not unexpectedly close the drawer or discard selection; Tasks 2 and 3 test the interaction sequence.
- Browser shortcuts, pending pointer damping and a moving Follow target must retain their existing semantics after new camera input; Task 5 exercises actual OrbitControls.
- The H29-named energy preset combined with compound propagation must keep compound dispatch and accurate wording; Task 6 tests real bound clicks and engine precedence.

---

## Branch and baseline

This plan and companion review/spec are committed on `plan/frontend-accessibility-remediation-20261011`, based on `12dbfce43724798638a3c7c3d74af4606d91a747`. Worktree: `/home/nomad/ai/projects/worktrees/solar-ui-accessibility-20261011`. Continue implementation on this new branch after the planning handoff; no product changes have been made by the planning pass.

The original checkout remains on the user's branch and advanced externally during review to `8ca1116d6e3a0b504086f9aabbbf293453ba02ce`. Do not switch, reset, merge into, or stage files from that original checkout. The delta has now been inspected: relevant HTML/CSS, camera and panel behavior are unchanged; the newer target adds solar delivery cleanup, corrected physics, a pinned toolchain, and science/backend CI with a bucket type ratchet. Do not transplant old engine or solar-controller code over those fixes.

Initial-base evidence: 13 Vitest files / 186 tests pass; strict tsc has 246 legacy errors. Reviewed integration-target evidence: 24 files / 368 tests pass with audit evidence excluded; existing `typecheck:ratchet` passes with 217/226 diagnostics; production build passes with its existing chunk-size warning. These checks used host Node 24.21.0/npm 11.19.0, not the new exact pins, so repeat them under the declared toolchain. Browser launch fails for missing OS libraries; rendered-browser/AT outcomes remain unverified. See the [review record](../reviews/2026-10-11-frontend-accessibility-final-review.md).

### Integration checkpoint before Task 1

- [ ] **Integrate the reviewed target, without following subsequent checkout changes.** In this clean planning worktree only, inspect `git diff HEAD...8ca1116d6e3a0b504086f9aabbbf293453ba02ce`, confirm all planning documentation commits are preserved, then merge that exact SHA with a dedicated merge commit. Record its parents and tree SHA. Run the pinned-toolchain baseline commands in Task 1 before any product edit. Preserve both histories; do not reset/rebase the original checkout or push. If conflicts exist, resolve only understood documentation/integration overlap; do not silently overwrite product changes. Any later target revision requires another explicit delta review, not an automatic moving-branch merge.

## File ownership and task dependencies

| Task | Production/config files | Tests/evidence | Dependency |
|---|---|---|---|
| 1 | `package.json`, lockfile, `.gitignore`, `vitest.config.ts`, `playwright.config.ts`, `tsconfig.ui-tests.json`, `scripts/check-ui-types.mjs`, `tests/baselines/frontend-types.json` | `scripts/check-ui-types.test.mjs`, browser fixture + shell smoke | integration checkpoint |
| 2 | new `panelController.ts`, active `main.ts` panel section, minimal CSS focus-handoff hooks | `panelController.test.ts`, `panel.spec.ts` | 1 |
| 3 | new `explorerController.ts`, `bodyPickerPresentation.ts`, existing `timeController.ts`, `main.ts`, HTML | `timeController.test.ts`, `explorer.spec.ts`, `live-regions.spec.ts` | 1, 2 |
| 4 | CSS/HTML, `bodyPickerPresentation.ts` measured fallback, resize observation in `main.ts` | `reflow.spec.ts` | 2, 3 |
| 5 | new `viewportCameraController.ts`, HTML/CSS, `main.ts` frame/input wiring | `viewportCameraController.test.ts`, `camera.spec.ts` | 1, 2, 4 |
| 6 | new `experimentController.ts`, HTML, `main.ts` experiment bindings | `experimentController.test.ts`, `experiment.spec.ts` | 1 |
| 7 | new `.github/workflows/frontend-ui.yml`, verification record | `app-smoke.spec.ts`, expanded cross-browser suites | all |

New production module paths are under `src/frontend/app/`. Browser files are under `tests/browser/`; fixture entry is `tests/browser/fixtures/ui-shell.ts`. Each factory returns a `dispose(): void` member, and `main.ts` cleanup calls it. Export argument types from their owning module. Shared integration files (`main.ts`, HTML, CSS, fixture entry, lockfile) have one writer at a time.

Tasks 2/3 and 4/5 have behavioral dependencies. Task 6's pure copy/dispatch tests can be prepared independently, but serialize integration edits and commits. Prefer one implementer per task plus independent review of each passing diff; this plan does not call for concurrent edits to the same files.

## Task 1: Establish useful browser and type-regression gates

**Files:** create the Task 1 files above, `tests/browser/shell.spec.ts`, and `tests/browser/fixtures/ui-shell.ts`; edit only package/config files listed.

**Interfaces:**

- Scripts: `test:browser` = `playwright test`; `test:types:ui` = `tsc -p tsconfig.ui-tests.json --noEmit`; `typecheck:ui-delta` = `node scripts/check-ui-types.mjs`.
- Retain inherited `typecheck:ratchet`, its tests and `ci/typescript-error-baseline.json` unchanged. The additional identity gate detects replacement messages within the same file/code bucket; it does not replace scientific CI's contract. Every later reference to "type gates" includes this inherited gate as well as both new scripts.
- `parseDiagnostics(output: string): Map<string, number>` keys normalize repository-relative path + TS code + diagnostic message (including continuations), ignoring line/column positions.
- `compareDiagnostics(actual: Map<string, number>, baseline: Map<string, number>): string[]` rejects new identities or increased counts; disappearance is allowed. Compiler exit 0 with empty output means zero diagnostics. Launch failures, unparseable error output, or nonzero exit without parseable diagnostics fail closed.
- Playwright project names: `chromium`, `firefox`, `webkit`. Actual-app smoke is Chromium-only; renderer-free production-DOM tests run in all three.

Representative regression (Vitest):

```ts
it('rejects replacement errors even when the total is unchanged', () => {
  const baseline = new Map([['src/main.ts|TS7006|legacy', 1]]);
  const actual = new Map([['src/newUi.ts|TS2322|new failure', 1]]);
  expect(compareDiagnostics(actual, baseline)).not.toHaveLength(0);
});
```

- [ ] **Step 1: Record baseline and install only the test prerequisites.** Verify the completed integration checkpoint and select Node 22.23.2/npm 10.9.8; run `npm ci`, then `npm test -- --exclude 'agent-notes/**'`, `npm run typecheck:ratchet`, `npm run typecheck`, and `npm run build`. Strict tsc remains an expected failing debt report, not a claimed pass. Save freshly collected diagnostic identities to the new committed baseline JSON with exact integration/tree SHA and compiler version; do not copy the old 246-error evidence or expand the inherited 226 bucket budget. Install `npm install --save-dev --save-exact @playwright/test@1.64.0` and `npx playwright install --with-deps chromium firefox webkit`. A failed browser install/launch is a prerequisite failure; record the error and resolve available in-scope setup before continuing browser claims.
- [ ] **Step 2: Add diagnostic-comparison tests and run them red.** Cases: moving a legacy error's line passes; removing an error passes; adding a new error while removing another fails; increasing identical error count fails; multiline messages remain distinct; compiler exit 0 with empty output passes, while launch failure/nonzero empty output cannot pass. Run `npx vitest run scripts/check-ui-types.test.mjs`. Expect failure because the comparison functions do not exist.
- [ ] **Step 3: Implement the type gate.** Export the two functions, execute the locked local TypeScript binary, compare against the recorded JSON, and reject compiler-version mismatch. Never auto-update the baseline. Add `tsconfig.ui-tests.json` for test configuration/browser fixtures only; keep global strictness and explicitly include required Vite/Node/test types. Reuse already-resolved compatible types or add an exact dev type dependency if required; record it in the lockfile. Product source remains checked by the delta gate.
- [ ] **Step 4: Add the browser fixture and a meaningful passing baseline test.** Route only `/src/main.ts` to `import '/tests/browser/fixtures/ui-shell.ts'`; the fixture imports `/src/style.css`. Load the real `/index.html`. The initial shell test checks actual app heading, visible named panel-close button, labelled native search, and time slider at 1440×900. Do not require Controls to be visible when the desktop panel is open. Subsequent tasks import production factories into this fixture; do not duplicate HTML or feature handlers. Expose fixture-only state under `window.__uiFixture`; never add a production test-mode switch.
- [ ] **Step 5: Configure test discovery/server isolation.** Extend `configDefaults.exclude` with `agent-notes/**`, `tests/browser/**`, `test-results/**`, `playwright-report/**`; keep Node as Vitest default and default include patterns. Playwright uses `testDir: './tests/browser'`, a managed Vite server on `127.0.0.1:4175 --strictPort`, `reuseExistingServer: false`, traces/screenshots on failure, and a single worker initially. Ignore generated browser outputs in Git. Browser viewport configuration supplies width/height; do not use `dev:ui --width` (its parser rejects widths under 640).
- [ ] **Step 6: Verify and commit the foundation.** Run `npm test`, `npm run typecheck:ratchet`, `npm run typecheck:ui-delta`, `npm run test:types:ui`, `npm run test:browser -- shell.spec.ts`, `npm run build`, and `git diff --check`. Expect all configured gates green, with legacy tsc debt identified by the delta gate. Stage only Task 1 paths. Commit: `test(ui): add browser and type-regression foundations`.

## Task 2: Centralize panel modality and focus transitions

**Files:** create `src/frontend/app/panelController.ts`, its Node test, and `tests/browser/panel.spec.ts`; modify main's panel block, fixture setup, and minimal focus-handoff selectors in `src/style.css`.

**Interfaces:**

- `PanelState = { mobile: boolean; desktopOpen: boolean; mobileOpen: boolean }`.
- `derivePanelState(state: PanelState): { open: boolean; modal: boolean }` is pure.
- `createPanelController({ app, panel, viewport, toggle, close, backdrop, breakpoint, onLayoutChange }: PanelControllerArgs): { setOpen(open: boolean): void; dispose(): void }`. Element types are `HTMLElement`, with toggle/close `HTMLButtonElement`, breakpoint `MediaQueryList`, callback `() => void`.
- Defaults: desktop open, mobile closed. `onLayoutChange` calls existing synchronous resize plus queued resize; no renderer dependency in the controller.

Representative state assertion (Vitest):

```ts
it('reactivates remembered mobile modality', () => {
  expect(derivePanelState({ mobile: true, desktopOpen: false, mobileOpen: true }))
    .toEqual({ open: true, modal: true });
});
```

The browser counterpart must traverse mobile→desktop→mobile with canvas focus and assert `#panel-close` receives actual focus and `#viewport-shell` is inert. The pure state assertion alone cannot prove the focus contract.

- [ ] **Step 1: Write red behavior tests.** Unit-test the four derived states. Browser tests cover open/close/backdrop, Tab/Shift+Tab cycling, closed disclosure exclusion, desktop non-modality, and focus ownership across all four remembered flag combinations in both breakpoint directions. Pin `mobile open → desktop → canvas focus → mobile` and `desktop closed → mobile open → search focus → desktop closed`. With every panel control unavailable, entry/Tab/focusin recovery must use the focusable panel container without looping. The fixture may set `tabindex=0` on the canvas for these pre-camera tests only.
- [ ] **Step 2: Run the regression red.** Run `npx vitest run src/frontend/app/panelController.test.ts` and `npm run test:browser -- panel.spec.ts --project=chromium`. Failures must reflect absent modal/focus behavior, not server or browser launch errors.
- [ ] **Step 3: Implement the production controller.** Follow the spec's synchronous exposure/focus/isolation ordering. Add a controller-owned temporary `data-panel-focus-transition` flag on app and minimal CSS that keeps panel/Controls exposed during the synchronous handoff despite the open/closed selectors; remove the flag before returning. Deactivate modal focus guarding before closing transfers focus outward. Preserve valid focus on non-hiding resize. Name mobile dialog from existing app title, remove modal attributes on desktop, and use the shared enabled/visible-close-or-panel fallback for entry, empty Tab trap and focus escape. Ignore prevented/composing events. Search Escape precedence remains with the search handler in the next task/current main; do not capture Escape ahead of the input. Dispose removes events/isolation and does not leave focus in an inert surface.
- [ ] **Step 4: Wire the factory once per app/fixture and remove old listeners.** `main.ts` passes existing DOM elements and resize callbacks; retain disclosure aria-expanded synchronization. Fixture passes real matchMedia and production elements. Add teardown to beforeunload. No duplicated controller instances.
- [ ] **Step 5: Verify and commit.** Run panel and existing shell browser tests in all projects, panel units, full unit suite and type gates. Synchronously instrument controller-owned class/attribute/inert writes in the fixture and record activeElement plus focus events to prove ordering; a MutationObserver alone runs too late to detect transient hiding. Assert no focused hidden ancestor, actual keyboard traversal excludes hidden controls, and no transition flag remains after an action. Commit: `fix(a11y): make panel transitions modal and preserve focus`.

## Task 3: Make search, native body selection and HUD output predictable

**Files:** create `explorerController.ts`, `bodyPickerPresentation.ts`, `timeController.test.ts`, `tests/browser/explorer.spec.ts`, `tests/browser/live-regions.spec.ts`; modify time controller, main Explorer/time composition, HTML, and fixture.

**Interfaces:**

- `ExplorerBody = { id: string; name: string; type: string }`.
- `createExplorerController({ dom, bodies, onInspect, onFocus, onFollow, onFree }: ExplorerControllerArgs): { refresh(): void; setPreferredBody(bodyId: string): void; dispose(): void }`.
- `dom` contains `bodySearch: HTMLInputElement`, `bodyList: HTMLSelectElement`, `bodyMatchCount`, `bodyInfo`, `emptyState: HTMLElement`, and Focus/Follow/Free buttons. Body callbacks take one `bodyId: string`; Free takes no arguments. `onInspect` calls existing body-info rendering; camera callbacks preserve current main behavior.
- `createBodyPickerPresentation({ select, narrow, coarse }: { select: HTMLSelectElement; narrow: MediaQueryList; coarse: MediaQueryList }): { refresh(): void; dispose(): void }`. Narrow query is `(max-width: 600px)`; coarse is `(any-pointer: coarse)`. Either match uses size 1; otherwise six-row native mode.
- Existing `createTimeController` public interface is unchanged.

Representative browser sequence (after opening the mobile drawer through the production button):

```ts
await page.locator('#body-search').fill('not-a-body');
await expect(page.locator('#focus-body')).toBeDisabled();
await expect(page.locator('#body-info')).toBeHidden();
await page.locator('#body-search').press('Escape');
await expect(page.locator('#body-search')).toHaveValue('');
await expect(page.locator('#control-panel')).toHaveAttribute('aria-modal', 'true');
await page.locator('#body-search').press('Escape');
await expect(page.locator('#panel-toggle')).toBeFocused();
```

- [ ] **Step 1: Write red output tests.** Count speed/date/dateTime setter calls: repeated unchanged formatted values cause zero further writes; positive, zero, negative, pause, reverse-time and date-rollover cases still update correctly. Browser MutationObserver verifies the same on real `<output>`/`<time>` elements. Run the time test before implementing guards; expect identical-update assertions to fail.
- [ ] **Step 2: Write red Explorer interaction tests.** Filter Sun/Earth/type names with whitespace and case changes; preserve preferred selection when filtered out and back; zero results disables list/Focus/Follow and hides stale card; clearing restores it. First Escape clears nonempty search while keeping drawer open; second closes. Test IME-composing Escape is ignored. Assert one search status, stable input description, no live body card, and zero extra count mutations for Earth→Sun while options/card do change. Keep catalog/solar live regions intact.
- [ ] **Step 3: Extract and wire Explorer.** Move only filtering, selection memory and related button/input handlers. Keep simulation/body-card calculation in main callbacks. Route canvas selection and Focus/Follow preference updates through `setPreferredBody`; retain total-body HUD calculation separately. `refresh` must not focus a result or move the camera just because a query changes. Guard count writes. Add exact stable-help and zero-result copy from the spec; remove dynamic count description/body-card live attribute.
- [ ] **Step 4: Bind native presentation and time guards.** Switch the same select between picker/list modes without recreating it, changing its value, or stealing focus. Limit custom option styling to six-row mode. On fine-only platforms, browser tests measure actual visible option height in Task 4; if native rendering cannot satisfy 44px, use the same collapsed presentation via a measured capability fallback (no UA sniff). Preserve native popup geometry and keyboard selection. Implement independent text/dateTime equality guards in `updateHud`.
- [ ] **Step 5: Verify and commit.** Run time unit tests, explorer/live-regions/panel browser tests, all units and type gates. Include mode switches while select is focused and actual solar status renderer/announcer fixtures, using the existing production status module rather than a replacement. Commit: `fix(a11y): stabilize search selection and live output`.

## Task 4: Implement measurable mobile reflow and context

**Files:** modify `src/style.css`, `index.html`, `src/frontend/app/bodyPickerPresentation.ts`, renderer ResizeObserver targets in `main.ts`; add `tests/browser/reflow.spec.ts`.

**Interfaces:** no new public module. Tests use production panel/Explorer factories from earlier tasks. Both viewport and canvas resize observation call the existing queued resize function.

Representative rendered assertion (390px context, after opening the drawer):

```ts
const panel = await page.locator('#control-panel').boundingBox();
expect(panel).not.toBeNull();
expect(390 - (panel!.x + panel!.width)).toBeGreaterThanOrEqual(24);
await page.locator('#trigger-agn-shockwave').scrollIntoViewIfNeeded();
await expect(page.locator('#trigger-agn-shockwave')).toBeInViewport();
```

Also inspect horizontal bounds of individual labels/controls and scroll/clipping ancestors; the representative assertions do not replace the full content-availability matrix.

- [ ] **Step 1: Write failing rendered-layout tests.** Use the spec's seven viewport sizes and relevant open/closed states, plus all disclosures open. At 195×422 assert root/panel overflow tolerance <=1px, each visible control fits horizontally, and scrolling reaches/clicks the experiment action without clipping. At 390px assert viewport width minus panel width >=24px. Below 320 allow zero strip. Include long solar error text/URLs using the production status renderer, not merely default placeholder copy.
- [ ] **Step 2: Run the tests red.** Run `npm run test:browser -- reflow.spec.ts --project=chromium`. Confirm failure comes from minimum width, full-phone drawer, clipped content or missing touch guidance. Native option tests must read rendered boxes, not CSS declarations. Test a real option-selection action as well as geometry.
- [ ] **Step 3: Implement responsive CSS and native sizing.** Apply the exact widths/fallback thresholds in the spec. Reflow headers, heading/output pairs, button groups and definition rows; use at least 44px interactive heights. Six-row mode gets adequate height for 44px options and scroll access to all bodies; picker mode remains >=44px with >=16px text. The body-picker capability fallback checks actual displayed row boxes after layout; unavailable or undersized author-rendered rows latch picker mode for the session. Hidden selects or zero rows defer measurement until opening/clearing search. Preserve selection; test hidden-panel/disclosure cases, zero-results recovery, and repeated refreshes without mode oscillation.
- [ ] **Step 4: Make small/short viewport content reachable.** Below 320px width or 480px height use scrollable flow toolbar/canvas/hint/status; canvas minimum height is 160px. Ensure a scrolling panel header cannot permanently hide close. Observe canvas dimensions for renderer resize; guard against resize loops by retaining existing queued batching. Provide pointer/coarse-pointer hints and remove nth-child selection-hint hiding. Use wrapping text, not downscaled type.
- [ ] **Step 5: Verify and commit.** Run reflow and panel/Explorer browser suites on Chromium, Firefox and WebKit; record native picker differences explicitly. Inspect focus-ring clipping and expanded-control screenshots. Run units, types and build. Commit: `fix(ui): support narrow reflow and usable mobile controls`.

## Task 5: Add shared keyboard and tap camera actions

**Files:** create `viewportCameraController.ts`, its unit test and `tests/browser/camera.spec.ts`; modify HTML/CSS, main input/frame/cleanup, fixture.

Preserve the inherited `sunCtrl.disposeSolarDelivery()` call while adding controller teardown; it releases the newer solar delivery lifecycle.

**Interfaces:**

- `CameraAction` is the ten literal values `orbit-left/right/up/down`, `pan-left/right/up/down`, `zoom-in/out` (expand these groups to literal strings in the type).
- `cameraActionForKey(event: Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey' | 'isComposing' | 'defaultPrevented'>): CameraAction | null`.
- `applyCameraAction(camera: PerspectiveCamera, controls: CameraControlsLike, action: CameraAction): boolean` performs a single supported action and reports whether it was accepted. Adapter contains public target Vector3, enable flags, distance/polar/azimuth limits, rotate/pan/zoom speeds and screenSpacePanning.
- `createViewportCameraController({ canvas, actionRoot, camera, controls }): { applyPendingActions(): void; dispose(): void }`. `actionRoot` is the native camera-tools details element. Dispose removes listeners and pending actions.

Representative key assertions (Vitest, no DOM emulator):

```ts
const key = { key: '+', code: 'Equal', shiftKey: true, ctrlKey: false,
  metaKey: false, altKey: false, isComposing: false, defaultPrevented: false };
expect(cameraActionForKey(key)).toBe('zoom-in');
expect(cameraActionForKey({ ...key, ctrlKey: true })).toBeNull();
expect(cameraActionForKey({ ...key, metaKey: true })).toBeNull();
```

- [ ] **Step 1: Write and run red mapping/math tests.** Cover all keys including Shift+plus/numpad, modifiers/composition/prevented input, live enable flags, nonzero targets, rotated camera-up axis, min/max distance, safe polar bounds, zoom sensitivity and pan vector preservation. Pin orbit step `Math.PI/36`, pan view-height fraction `0.05`, zoom factor `0.95 ** controls.zoomSpeed`. Use real Three camera/vector math; no WebGL renderer or private-controls mock methods.
- [ ] **Step 2: Implement the action API.** Derive current offset from target; use camera-up quaternion/spherical coordinates for orbit and camera screen axes for pan. Clamp distance/angular bounds before Cartesian conversion, including safe poles; subsequent normal controls update reconciles pointer damping and its ordinary constraints. Process queued actions in order and derive pan axes from the updated pose, not a stale matrix after an earlier orbit. Test repeated actions at a pole and orbit→pan in one flush. Retain target identity/damping; invalid or disabled actions have no effect. Do not cache a second camera target or call underscored OrbitControls methods.
- [ ] **Step 3: Write browser input regressions and bind the queue.** Only canvas focus accepts camera keys; check enabled flags again during flush. Accepted keys prevent default even at limits, ignored keys do not. Native button clicks queue exactly the same actions and keep button focus. Test dispose with pending input. Wire flush immediately after `updateFollowTarget()` and before `controls.update()` in main and the equivalent fixture frame. Do not add `listenToKeyEvents`.
- [ ] **Step 4: Add native controls and visible keyboard instructions.** Use the exact spec's ten names, grouped under Orbit/Pan/Zoom in `details#camera-tools`, with summary `Camera controls`. Add tabindex, accessible name/description, inset focus ring, and focus-visible keyboard help. Keep tools content reachable and scrollable at short heights. Add the exact follow-recentering instruction.
- [ ] **Step 5: Verify real-controls integration.** Browser tests use actual OrbitControls: pointer-drag damping then keyboard, wheel zoom, keyboard/tap action parity, and follow target movement over multiple frames. For Follow, orbit/zoom offsets persist while pan is rendered once then recenters; no follow ID/mode mutation. Expose fixture-only frame stepping/snapshots through `window.__uiFixture`: with pointer damping settled, inspect follow-update→action-flush→controls-update, then the next frame; never poll hoping to catch one frame. Test Shift+Arrow pan persists in Free cam. Verify Ctrl/Cmd +/- remain unprevented and only canvas key ownership moves camera. Test single-pointer tap buttons and pointer-drag behavior; pinch remains a required manual/device check if synthetic multi-touch is unavailable.
- [ ] **Step 6: Verify and commit.** Run camera unit/browser tests, reflow with camera tools expanded, modal isolation of camera buttons, full units/types/build. At 195px assert both width and height >=44px for each new camera button and summary after scrolling it into view. Commit: `feat(a11y): add keyboard and tap camera navigation`.

## Task 6: Align experiment copy with real dispatch precedence

**Files:** create `experimentController.ts`, its unit test and `tests/browser/experiment.spec.ts`; modify HTML/main/fixture only for the experiment section.

**Interfaces:**

- `Hypothesis = 'compound' | 'h29'`.
- `getExperimentPresentation(hypothesis: Hypothesis): { action: string; status: string; model: 'standard' | 'speculative' }` returns exact spec strings.
- `createExperimentController({ dom, sun }: ExperimentControllerArgs): { dispose(): void }`. DOM contains source/preset/hypothesis selects, observer/stochastic checkboxes, status element and trigger button. `sun` port supplies existing `setAgnObserverFrameMode(boolean)`, `setAgnStochasticFlaring(boolean)`, and `triggerAgnShockwave(source: string, impactTimeSec: number, intensity: number, options: { preset?: string; hypothesis?: 'h29' }): void`.

Exact presentation assertion (Vitest):

```ts
expect(getExperimentPresentation('h29')).toEqual({
  action: 'Trigger H29 slipstream',
  status: 'H29 selected · speculative metric-frame-dragging visualization with amplified display effects.',
  model: 'speculative'
});
```

The browser callback spy must additionally record `['M87', 12, 0.5, { preset: 'SgrA_WarpWave_H29', hypothesis: 'h29' }]` for that crossed-source selection and record the same tuple without the hypothesis property after switching to compound.

At the integration target observer-frame mode is a deliberate compatibility no-op: test forwarding/order only, never restore the older front-speed multiplier. Preserve newer physics constants, equilibrium-time units, front/channel synchronization and `smbhPhysics.test.ts`; no numerical snapshots from the old planning base.

- [ ] **Step 1: Write and run red tests.** Assert initial compound and restored H29 presentation, H29→compound→H29, exact strings/classification and retained SVG. Browser clicks assert arguments for all four source timing/intensity pairs, preset/no preset, compound omission/H29 inclusion, and observer setting before trigger. Include H29 energy preset + compound, M87 energy preset + SagittariusA source, and H29 + default energy.
- [ ] **Step 2: Implement presentation/binding and explicit energy copy.** Initialize status/data-model/button together; update label span only. Preserve engine payloads and source/preset values. Rename field/default/H29 option and add the exact independent-selection explanation. Remove old inline listeners after wiring the controller once; preserve stochastic binding. No engine/source-catalog changes.
- [ ] **Step 3: Pin the actual precedence.** Instantiate the existing engine in a Node integration test with its supported null visualization callbacks and assert H29 energy preset gives `5e54` erg with compound unless the separate hypothesis is `h29`; crossed source presets keep the selected source. Dispose/stop any timers the engine starts. This supplements bound-click tests; it does not replace them with a pure-copy test.
- [ ] **Step 4: Verify and commit.** Run experiment unit/browser tests, full units/type gates and build. Commit: `fix(ui): align experiment labels with propagation and energy`.

## Task 7: Verify actual-app integration and publish the evidence in Git

**Files:** create `tests/browser/app-smoke.spec.ts`, `.github/workflows/frontend-ui.yml`, and `docs/superpowers/reviews/2026-10-11-frontend-accessibility-verification.md`; update test config only as required for these gates.

**Interfaces:** actual-app test does not intercept `/src/main.ts` or install fixture state. CI uses the Task 1 scripts and committed diagnostic baseline.

- [ ] **Step 1: Add app-entry smoke.** Launch the real application in Chromium with WebGL/software rendering supported by the runner. Control only external service/catalog responses for predictable fallback; do not intercept local assets or swallow page errors. Assert initial app readiness, real drawer focus/isolation, filtering and zero results, hypothesis copy and action, and camera +/- changing the visible Range readout after pausing. Use state/readout conditions with bounded timeouts; no fixed sleeps. Initialization/WebGL failures fail the smoke.
- [ ] **Step 2: Run the complete automated release matrix.** Execute `npm test`, `npm run typecheck:ratchet`, `npm run typecheck:ui-delta`, `npm run test:types:ui`, `npm run build`, and `npm run test:browser`. Run `npm run typecheck` separately to report remaining global debt. Inspect failures before broadening retries; do not erase baseline or add skips to produce green output. Confirm product-only build contains no fixture entry or test globals.
- [ ] **Step 3: Add frontend CI.** On pull requests/pushes affecting frontend/config/test files, use Node 22.23.2, assert npm 10.9.8, run `npm ci` and `npx playwright install --with-deps chromium firefox webkit`, then the same unit/type/build/browser commands. Upload browser traces/screenshots on failure. The inherited `.github/workflows/r3-r4-science.yml` covers science/backend/unit/build/bucket-ratchet checks but has no browser matrix; leave it intact. If a subsequently reviewed target gains equivalent browser CI, integrate the new gates there instead of duplicating them. Do not introduce backend/science changes.
- [ ] **Step 4: Record manual evidence honestly.** For NVDA/Chrome and VoiceOver/Safari record versions, virtual-cursor isolation, focus return, keyboard/button/picker use, spoken search behavior and visible focus. Include real browser zoom/text resize, touch pinch and native picker behavior. Use explicit PASS/FAIL/NOT RUN; missing platforms remain pending release evidence. Do not equate a Playwright accessibility snapshot with spoken-screen-reader validation.
- [ ] **Step 5: Request an independent whole-branch review.** Give the reviewer the base SHA, diff, spec, plan and verification record. Review original-findings coverage, unintended physics/payload changes, focus ordering, test fixture duplication, and CI scope. Resolve confirmed issues in their own green commits and rerun only affected gates plus the final combined suite when changes justify it.
- [ ] **Step 6: Commit and hand off.** Run `git diff --check`, inspect staged paths, and commit `test(ui): gate accessibility regressions and record verification`. Record the final commit list, test counts, manual gaps and branch/worktree location. Leave the branch available for review; do not merge or push as an implied part of this local plan.

## Commit and completion policy

The seven task commits are implementation milestones, additional to this planning branch's documentation commits and the explicit integration merge checkpoint. Commit after each verified slice; do not consolidate them into one final change. Failing red tests are observed locally and paired with their fix before the task commit. Stage explicit paths, never `git add .` in the user's original checkout. If an independent correction is needed after review, give it its own test-backed commit.

The implementation is code-verified when the automated gates pass and all original findings have the specified evidence. Any NOT RUN manual accessibility item remains visible in the handoff and prevents a claim of complete AT/WCAG validation. Existing unrelated TypeScript errors do not authorize ignoring new diagnostics.

Recommended execution method is subagent-driven, with serialized production integration and independent task reviews. This is a plan handoff: checkboxes intentionally remain unchecked until the corresponding implementation and verification actually occur.
