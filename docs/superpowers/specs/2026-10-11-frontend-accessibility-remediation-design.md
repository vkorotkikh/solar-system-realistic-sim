# Frontend accessibility remediation: revised design

Date: 2026-10-11. Status: implementation-planning specification; product changes are not implemented.

Base: `12dbfce43724798638a3c7c3d74af4606d91a747`. Supersedes the design blob in `fc191df` for this work. See the [final review](../reviews/2026-10-11-frontend-accessibility-final-review.md) for evidence and corrections to the earlier critique.

## Outcome and scope

Resolve the original eight frontend findings with keyboard and tap camera operation, readable responsive controls, correct modal focus, concise announcements, accurate experiment copy, and behavioral regression coverage. Keep simulation physics, timing, rendering quality, telemetry payloads, and existing pointer behavior intact.

Two explicit refinements are included: native tap controls provide alternatives to drag/pinch, and energy-preset wording explains the engine's existing precedence. Neither changes simulation semantics. Do not reuse the inactive legacy UI/camera controllers or undertake a general `main.ts` rewrite.

## Project-wide constraints

- Runtime stack remains TypeScript, Three 0.182.0, and Vite; no UI framework or production dependency is added.
- Tests use Vitest 3.2.4 in Node and `@playwright/test` 1.64.0 as an exact development dependency. No happy-dom dependency.
- New browser tooling runs on Node >=22.12.0; use Node 24 in the new frontend workflow and retain the existing lockfile's dependency versions except the explicit test addition.
- Mobile panel breakpoint remains `(max-width: 1100px)`; independent desktop-open/mobile-open memory remains.
- Product target for author-controlled interactive surfaces is at least 44 by 44 CSS px. Native picker option geometry is browser/OS-owned and is validated as such, not claimed to be author-sized.
- Normal-width mobile drawers retain at least 24 CSS px of dimmed canvas; below 320 CSS px a full-width drawer is allowed to keep controls usable.
- Browser Ctrl/Cmd keyboard zoom shortcuts remain unhandled by the new camera code. Existing canvas wheel/pinch behavior remains unchanged.
- Every implementation commit includes its relevant regression and passes its targeted gates. Preserve default Vitest discovery; never stage audit evidence or generated browser reports.
- No new TypeScript diagnostic identity or increased identity count is allowed relative to the pinned implementation base. Do not suppress new errors or import another branch's baseline.

## Responsive behavior

At 320–1100 CSS px, panel width is `min(352px, calc(100vw - 24px))`. At less than 320 CSS px, panel width is 100%; canvas context yields to usable controls. At desktop widths the existing docked panel remains.

Remove the 280px body minimum. Below 320 CSS px, stack multi-column action groups and card label/value rows, allow heading/label wrapping, and simplify the decorative brand mark as needed while keeping the app name and close control visible. Do not solve overflow by shrinking text. At short heights, the entire panel can scroll, including its header; every control remains reachable and the close button can be brought into view.

For viewport widths below 320 CSS px or heights below 480 CSS px, use a vertically scrollable flow of toolbar, camera tools, canvas, hints, and status content. Give the canvas a minimum block size of 160 CSS px. This prevents absolute status overlays from obscuring controls when long solar errors wrap. At other sizes keep the current immersive overlay layout. Observe the canvas itself as well as the viewport so camera aspect/render size updates when flow content changes its dimensions.

The 195×422 CSS-pixel browser fixture is the deterministic regression corresponding to the previous 390/200%-effective-width report. It is not a mobile pinch-zoom simulation. Also verify 320×568, 390×844, 844×390, 1100×800, 1101×800, and 1440×900. Exercise panel open/closed, expanded disclosures, long status errors, and camera tools open/closed.

Measure document and panel horizontal overflow within 1 CSS px rounding tolerance, then separately check each relevant control's bounds, text wrapping, focus outline, and reachability. Root scroll width is not sufficient. Manual checks include real 200% browser zoom, a 1280px desktop window at 400% zoom, and 200% text resizing. [W3C reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).

## Panel state and focus

`panelController` is the sole owner of panel event listeners, remembered open flags, classes, attributes, focus transitions, and teardown. It receives a resize callback and never imports the renderer.

| Layout/state | Panel | Viewport | Focus requirement |
|---|---|---|---|
| Desktop open | Visible, non-modal aside | Available | Preserve valid focus; if Controls is becoming hidden, focus panel close |
| Desktop closed | Inert and hidden | Available | If focus was inside the panel, focus Controls |
| Mobile open | Visible named dialog, `aria-modal=true` | Inert and `aria-hidden=true` | Focus must be inside panel; preserve valid panel focus, otherwise focus close |
| Mobile closed | Inert and hidden | Available | Closing from panel restores Controls |

Use the existing visible app title as the dialog's accessible name. Remove dialog role and `aria-modal` in desktop mode. Closed panel is inert and `aria-hidden=true`; backdrop remains hidden from AT.

Capture active focus before a transition. Opening: expose panel, establish its semantics, move focus from the viewport into the panel, then isolate the viewport. Closing: deactivate modal focus guarding, remove viewport isolation and expose Controls, move focus if needed, then hide/inert the panel. Existing open/closed classes hide one surface while exposing the other, so the panel controller also owns a minimal temporary presentation flag that exposes both during this synchronous focus handoff. Remove it before returning. Do not hide an active Controls button or an active panel descendant before moving focus. No timer or animation-end event may be required to restore focus.

Whenever mobile modal state becomes active, including desktop-to-mobile with remembered mobile-open state, enforce the invariant. When a resize leaves the active surface available, preserve focus. Initial desktop load must not steal focus. A `focusin` guard returns escaped/programmatic background focus only while modal state is active. Entry, guard and empty-trap recovery share a destination rule: use the rendered/enabled close button, otherwise the panel container with `tabindex=-1`.

Trap Tab/Shift+Tab among actually rendered, enabled controls. Exclude closed-details descendants, hidden controls, and negative tabindex. If none exist, focus the panel container with `tabindex=-1`. Search consumes the first Escape when nonempty; it clears the search and stops propagation. A later Escape closes the drawer. Escape does not override an already handled/composing event. Backdrop and close button restore Controls. Dispose removes all listeners and any controller-owned isolation.

While modal isolation is active, background solar/catalog announcements may be suppressed by AT. Keep their state/data updates intact; do not replay every hidden update when closing. The current status is readable afterward. [W3C modal pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

## Camera input and help

The focusable canvas has concise name `Solar system visualization`, an inset 3px focus indicator, and `aria-describedby` pointing to stable instructions. Keyboard instructions also appear visibly on canvas keyboard focus. Do not add a global application role.

| Input on focused canvas | Action |
|---|---|
| Arrow keys | Orbit left/right/up/down |
| Shift + Arrow keys | Pan in screen directions |
| `+`, `=`, numpad add | Zoom in |
| `-`, numpad subtract | Zoom out |
| Ctrl/Meta/Alt combinations; composing or prevented events | Ignore |
| Tab, Escape, Space and unsupported keys | Leave to normal behavior |

Reject input without canvas focus and from editable targets. Respect live `enabled`, `enableRotate`, `enablePan`, and `enableZoom` both when queuing and applying actions. Accepted keys prevent default even at a movement bound. Browser key-repeat queues repeated actions; no custom hold timer is introduced.

Add a native `details#camera-tools` surface in the viewport with summary `Camera controls`. It contains three named groups: Orbit (four directional buttons), Pan (four), Zoom (in/out). Ten ordinary buttons have exact names matching their actions and at least 44×44 targets. They share the keyboard action queue, retain button focus on activation, and stay inside the inert viewport when the drawer is modal. The tools are collapsed by default, accessible to mouse, touch, keyboard and AT; their expanded content must be scrollable/reachable at short heights.

Use 5° (`Math.PI / 36`) orbit increments scaled by live `rotateSpeed`, a pan increment of 5% of camera view height at the target scaled by `panSpeed`, and zoom factor `0.95 ** zoomSpeed`. Pan translates camera and target together. Work in the camera's up-axis frame and clamp spherical distance/angular bounds before converting back to Cartesian coordinates; keep poles numerically safe. Process queued actions in order and derive pan axes from the updated camera-target pose, including an orbit earlier in the same flush. Current perspective-camera/screen-space-pan behavior is the contract; unsupported camera modes are not introduced.

Queue event actions and apply them after `updateFollowTarget()` and before the existing `controls.update()`/render in the active animation loop. Do not call private OrbitControls methods or enable its conflicting keyboard listener. Preserve damping state and target object identity. Orbit/zoom work around the current moving target. Following continues to recenter after pan, as existing pointer pan does. Exact help: `Following keeps the body centered. Choose Free cam to keep a pan offset.`

Pointer hint: `Drag to orbit · Scroll to zoom · Double-click to follow a body`. Coarse-pointer hint: `Drag to orbit · Pinch to zoom · Choose a body in Explorer`. Keyboard help: `Arrow keys orbit. Shift + Arrow keys pan. Plus and minus zoom. Tab leaves the visualization.` Camera controls remain discoverable regardless of pointer media queries, including hybrid devices. Do not hide the third hint by child index on small screens.

## Explorer and announcement behavior

Extract existing filter/selection binding into `explorerController` without changing camera-action semantics. Filter by trimmed, case-insensitive name/id/type. Preserve preferred selection through filtering, auto-select the first visible result only provisionally, and restore the preferred selection when it reappears. Actual list changes, Focus/Follow actions, and double-click selection update the preferred ID through the controller's API. A body selected on the canvas while filtered out retains its existing behavior; do not rewrite search automatically.

Keep `select#body-list` native. Fine-only inputs wider than 600px retain six-row mode, with rendered row-height goal >=44px and a corresponding list viewport that can scroll all ten bodies. With `(any-pointer: coarse)` or `(max-width: 600px)` use single-select native picker mode (size 1), min-height 44px and font size >=16px. Switching modes preserves selection and focus. Avoid custom ARIA listboxes. Native popup rows use platform geometry; do not claim they are 44px or rewrite native keyboard behavior. On fine-only layouts measure rendered option boxes after layout: unavailable native row geometry or any visible row below 44px selects the collapsed presentation for the session. Defer measurement while the select is hidden or has no options, and retry after opening/clearing search; never mistake zero results for unsupported geometry or alternate modes every frame. Inspect Chromium, Firefox, and WebKit rendering; no UA sniffing or CSS-only pass claim.

Move `body-search`'s description to stable help: `Filter major bodies by name or type. Escape clears the search.` The match count is the only search-result live region, polite and atomic. Guard count text by string equality; filtering and card selection still update when different queries have the same count. Remove the body card's live attribute. Zero matches disables list/Focus/Follow, hides the stale body card, and displays `No matching bodies. Clear the search to restore the list.` Clearing restores the preferred result/card. Free cam remains usable. Independent experiment/solar/catalog status regions remain.

`timeController.updateHud()` assigns speed, displayed date, and time `dateTime` only when each rendered value differs. Positive/zero/negative rates, pause, reverse time, Jump to now and date rollover retain their behavior. Tests use setters/MutationObserver, not assumptions about how often requestAnimationFrame runs.

## Experiment presentation and dispatch

Use keys `compound` and `h29`; the old spec's Gertsenshtein wording is not a selector value.

| Model | Button | Status | `data-model` |
|---|---|---|---|
| compound | Trigger compound shockwave | Standard compound transport model selected. | standard |
| h29 | Trigger H29 slipstream | H29 selected · speculative metric-frame-dragging visualization with amplified display effects. | speculative |

Synchronize on initialization and every hypothesis change, including a restored selection; update only the button label span. Rename the field `Energy preset`, default option `Default energy (10⁵⁶ erg)`, H29 energy option `H29 reference energy (5×10⁵⁴ erg)`, and add `Energy presets do not change the SMBH source or propagation model.` Keep option values unchanged.

The source selector controls source plus existing timing/intensity: SagittariusA (8,1.4), CentaurusA (9.5,1.1), Maffei1 (10.5,0.7), M87 (12,0.5). Preset changes energy only. Compound dispatch continues omitting `options.hypothesis`; H29 dispatch includes `hypothesis: 'h29'`. Preserve preset/source combinations, observer-frame setting before trigger, and stochastic-flaring binding. No source/hypothesis synchronization from preset names.

## Verification architecture and release evidence

Vitest covers pure camera math/key classification, panel transition decisions, exact copy/dispatch arguments, and time setter counts. Playwright loads production `index.html` and CSS; its fixture intercepts only `/src/main.ts` to instantiate the production controllers with deterministic dependencies and real Three camera/OrbitControls, without WebGLRenderer. The fixture must not implement its own panel/search/experiment event handlers. Tests exercise native inputs through browser actions. Each factory is wired in `main.ts` in the same commit as its feature.

Retain a separate un-intercepted app smoke. It checks actual initialization, camera keys via the visible range readout, drawer, search, and experiment behavior. Control external requests without modifying local application/assets. Fail on renderer initialization errors; do not silently skip. Browser installation uses `playwright install --with-deps`; CI runs Chromium and the supported Firefox/WebKit fixture matrix. Full WebGL app smoke runs Chromium with supported software rendering where necessary.

Use actual geometry, focus, accessible names, events, and mutations. Source-text CSS tests are not acceptance evidence. Capture traces/screenshots on failure. Manual NVDA/Chrome and VoiceOver/Safari records must include platform/version and pass/fail/not-run for virtual navigation, canvas instructions, native buttons/picker, spoken search output, and focus visibility. Missing AT platforms remain explicit release-validation gaps; automated code verification can finish without pretending those checks ran.

The current TypeScript baseline is 246 errors. Compare diagnostics by normalized path/code/message and count, ignoring line shifts. New modules must be clean; moves from main must not transfer existing debt into extracted code. CI adds a narrowly scoped frontend workflow, because this base has none. Do not broaden this work into repairing unrelated physics diagnostics.

## Acceptance and traceability

| Original finding | Required evidence | Plan task |
|---|---|---|
| 1. Reflow | Geometry/content reachability matrix; real zoom/text-resize record | 4, 7 |
| 2. Keyboard canvas | Real camera math, keyboard/tap parity, visible focus, pointer regression, AT record | 5, 7 |
| 3. Noisy live output | Unchanged-value mutation counts, one search announcer, preserved background status behavior | 3, 7 |
| 4. Drawer modal isolation | Attributes, Tab traversal, no background focus, virtual-navigation record | 2, 7 |
| 5. Breakpoint focus | Four-state transition matrix with panel/Controls/canvas focus | 2 |
| 6. Mobile details | 24px normal-phone canvas strip, native picker policy, persistent touch guidance | 3, 4, 5 |
| 7. H29 messaging | Exact copy and real bound-click argument matrix including crossed presets | 6 |
| 8. Regression coverage | Full Vitest, browser fixture projects, app smoke, diagnostic delta, build/CI | 1–7 |

All eight are implementation acceptance criteria. The source review and this specification alone do not satisfy them. Execute the [multi-commit plan](../plans/2026-10-11-frontend-accessibility-remediation.md) and record evidence at the delivered commit.
