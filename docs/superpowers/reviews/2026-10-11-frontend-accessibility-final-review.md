# Frontend accessibility: final inspection and decision record

Date: 2026-10-11. Initial review/planning baseline: `12dbfce43724798638a3c7c3d74af4606d91a747` (`fix/solar-data-status-notice`). Late delta review target: `8ca1116d6e3a0b504086f9aabbbf293453ba02ce`. Planning branch: `plan/frontend-accessibility-remediation-20261011`.

The original design is the Git blob `fc191df:docs/superpowers/specs/2026-10-07-frontend-accessibility-remediation-design.md`. The 2026-10-10 critique inspected `b291328`, a different branch. This review uses three independent specialist inspections plus primary-agent source verification. It refines the solution and plan; it does not claim that product fixes have shipped.

## Verdict

The eight original issues remain actionable. The previous design had two material weaknesses: tests could pass without proving rendered accessibility, and panel focus rules omitted entry into a remembered open mobile drawer. The revised solution also needs complete camera input behavior, a deliberate native-select policy, and copy that reflects actual experiment dispatch.

Branch divergence is a prerequisite to record, not a reason to stop planning. The new branch starts from the user's checkout at the beginning of review. That checkout advanced externally before handoff; the late delta has been inspected and the plan now requires exact-target integration and a fresh pinned-toolchain baseline before coding. Neither the original checkout nor its audit notes were changed by this planning pass.

## Findings and dispositions

| ID / priority | Verified evidence at the baseline | Decision |
|---|---|---|
| R1 / high | `src/style.css:48–60` hides root overflow and sets a 280px body minimum. Panel/header/viewport also clip or constrain content. | Remove the minimum; prove that individual controls and text remain reachable. A root `scrollWidth` check is insufficient. |
| R2 / high | `src/main.ts:1109–1192` remembers separate mobile/desktop open states but never isolates the viewport, and breakpoint changes do not repair focus. | One panel controller owns state, modal semantics, focus ordering, Escape, trapping, and teardown. Cover all remembered-state transitions. |
| R3 / high | `index.html:354–357` has an unfocusable canvas. `sceneSetup.ts:168–174` leaves OrbitControls pan enabled along with rotation/zoom. | Add focusable canvas, visible keyboard help, keyboard orbit/pan/zoom, and native tap buttons using one camera action API. |
| R4 / high | Proposed happy-dom/CSS-source tests cannot establish geometry, actual Tab order, native option sizes, or screen-reader speech. The focus trap relies on rendered visibility. | Use Vitest Node for logic and Playwright for actual DOM/layout/input. Do not add happy-dom as a third environment. Record manual AT checks separately. |
| R5 / medium | `timeController.ts:74–85` writes identical speed/date values per frame; `main.ts:698–703` writes count and card during filtering. Search describes itself using that same live count (`index.html:216,222`). | Guard displayed-value writes, use stable search instructions, and keep exactly one search announcer. Preserve independent solar/catalog announcements. |
| R6 / medium | `style.css:742–751` fixes list height at 158px and styles option rows; the mobile drawer becomes full width at 600px; the third hint is hidden below 700px. | Give ordinary-phone drawers a measurable canvas strip, prioritize usable controls under 320 CSS px, test native selection behavior, and retain body-selection instructions in each input mode. |
| R7 / medium | `main.ts:1365–1373` changes status without the button. `agnShockwaveEngine.ts:247–256` resolves hypothesis separately and reads only energy from the preset. | Synchronize exact copy and dispatch. Rename the preset field to Energy preset; explain independent source/model selection. Do not silently make presets change physics. |
| R8 / medium | No UI regression suite or test configuration exists at this baseline. Untracked audit tests can be discovered by plain `npm test`. | Narrowly exclude evidence/browser-test directories while retaining default product-test discovery. Introduce browser infrastructure with its first useful test. |

### Corrections to the previous critique

- The initial `12dbfce` base has no `typecheck:ratchet`, `ci/` directory, `.github/` workflow, or package engine pins. The earlier two-bucket ratchet failure belongs to `b291328`; the late `8ca1116` target includes this infrastructure and its ratchet now passes. Do not mix these three baselines in an acceptance claim.
- A 195 CSS-pixel layout viewport is a strict project regression case. It is not equivalent to mobile pinch zoom. Test real browser zoom and text resize separately. W3C's reflow benchmark is 320 CSS pixels for vertically scrolling content. [W3C reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- Approximately 44px targets are a product ergonomics goal. WCAG 2.2 AA's target-size criterion uses 24px with exceptions; existing 28px rows are not automatically an AA violation. Current options are author-styled, so a blanket native-control exception is also unjustified. [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- A canvas strip preserves visual context but cannot remain interactive while its sibling drawer is modal. That distinction must be reflected in the design and tests.
- Panning in Follow currently recenters on the body on the next frame (`main.ts:633–644`). Promising a persistent panned follow offset would change behavior. The plan preserves recentering and explains using Free cam for persistent pan.
- `cameraController.ts`, `uiBindings.ts`, `animationLoop.ts`, and camera transitions are not the active composition path. Do not wire the new behavior into these unused modules.
- The earlier suggestion to merely fix H29 button copy missed an existing preset ambiguity. `SgrA_WarpWave_H29` supplies `5e54` erg; it does not switch the runtime hypothesis. Other presets likewise do not switch the separately selected source.

### Focus failure that must be reproduced

Open the mobile drawer, widen to desktop, focus the canvas, then narrow to mobile. The remembered mobile-open flag reactivates the drawer. The previous design would make the focused canvas inert without moving focus. The invariant must cover content becoming inert, not only visually hidden: expose the destination, move focus if necessary, then hide/isolate the old surface. Dialog semantics alone do not implement these interactions. [W3C modal pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

### Camera behavior and scope

Keyboard-only camera support leaves users who operate by taps with drag/pinch-dependent functions. Ordinary camera buttons are a justified extension of the requested accessibility remediation. They use the same actions as canvas keys and do not add a second camera state machine. Keyboard equivalence and single-pointer alternatives are distinct requirements. [W3C dragging guidance](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html), [W3C pointer-gesture guidance](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html).

Modifier combinations for browser zoom remain untouched. Camera math uses the current controls target and camera up axis; no copied target or private OrbitControls methods. Existing Follow recentering, damping, pointer input, source selection, energy values, and runtime hypothesis precedence remain regression constraints.

## Initial-base verification evidence

Read-only inspection and diagnostic execution occurred on the original checkout at the same `12dbfce` product baseline. Planning documents live in a separate worktree; dependency installation and product implementation have not occurred there.

| Check | Result and limit |
|---|---|
| Tracked Vitest baseline | 13 files, 186 tests passed with audit evidence excluded. Only `src/**/*.test.ts` matches are tracked at this baseline; future discovery must still retain script tests. |
| Strict TypeScript | 246 pre-existing diagnostics across seven files; not passing. |
| Production build | Passed using `npm run build -- --outDir /tmp/solar-ui-plan-build.fslZG2`; 913.89 kB main JS chunk with the existing size warning. |
| Browser execution | Cached Chromium exists, but launch fails because `libnspr4.so` is missing. No new rendered-layout or AT pass is claimed. |
| Toolchain | Current shell Node 24.21.0/npm 11.19.0. Package manifest has no engine pin. Registry inspection found `@playwright/test` 1.64.0 requiring Node >=20. |

TypeScript counts: `smbhPropagation.ts` 81; `agnShockwaveEngine.ts` 52; `milkyWay.ts` 40; `localPlanner.ts` 30; `src/main.ts` 18; `sunController.ts` 14; `lodManager.ts` 11. Compare normalized file/code/message diagnostics with the base; total count alone can hide a new error behind an unrelated reduction.

## Late checkout advancement and integration-target evidence

The original checkout advanced externally to `8ca1116` during final verification. This is a substantial merged delta, not a documentation-only change. Two specialists re-inspected its verification infrastructure and camera/experiment/solar changes; the primary review checked HTML/CSS, active main composition and the build. The isolated planning branch remains based on `12dbfce`; no merge or product edit was performed by this review.

| Check at `8ca1116` | Result and limit |
|---|---|
| Unit suite | `npm test -- --exclude 'agent-notes/**'`: 24 files / 368 tests pass, including the existing ratchet and supervisor-config tests. |
| Existing bucket ratchet | `npm run typecheck:ratchet` passes: 217 diagnostics within the inherited 226 budget. Strict tsc is still not clean. |
| Production build | Passed with `npm run build -- --outDir /tmp/solar-ui-delta-build.5gijvB`; 46 modules, 935.73 kB main JS, existing chunk warning. |
| Toolchain | Target pins Node 22.23.2/npm 10.9.8 in package/CI configuration. Review execution used host Node 24.21.0/npm 11.19.0; repeat under pins before implementation. |
| Browser/AT | No new execution evidence; missing browser OS libraries and manual AT checks remain prerequisites/gaps. |

Current strict counts: `agnShockwaveEngine.ts` 50; `smbhPropagation.ts` 81; `localPlanner.ts` 17; `lodManager.ts` 11; `milkyWay.ts` 40; `src/main.ts` 18. `sunController.ts` is now clean.

HTML/CSS and relevant panel/camera input/frame logic are unchanged, so the eight findings and their behavioral designs remain applicable. Preserve the added `sunCtrl.disposeSolarDelivery()` teardown and corrected physics. The observer-frame setter is now a compatibility no-op; forwarding/order remains the UI contract. Its still-visible checkbox is an additional existing UX limitation outside the original eight, not a reason to restore incorrect propagation behavior.

Keep the existing science/backend workflow and its bucket ratchet. A direct comparator probe confirmed that replacing a diagnostic message with another in the same file/code bucket passes that ratchet; the stricter identity gate therefore adds a real guarantee. Generate its baseline afresh after exact-target integration, without enlarging inherited budgets. The revised plan uses the target's exact Node/npm pins, adds only the missing browser workflow, and makes integration a separate checkpoint ahead of the seven implementation commits.

## Evidence limits and remaining human checks

Geometry findings beyond the known CSS mechanisms are source-derived. The plan requires a real browser after its OS dependencies are available. Automated attribute checks and accessibility snapshots do not establish spoken announcements or complete screen-reader operation. Record NVDA/Chrome and VoiceOver/Safari outcomes with versions and explicit pass/fail/not-run statuses; absent hardware or software remains an identified validation gap, not an automatic pass.

The resulting [revised design](../specs/2026-10-11-frontend-accessibility-remediation-design.md) and [implementation plan](../plans/2026-10-11-frontend-accessibility-remediation.md) are the execution handoff. The original eight findings map to concrete tasks and acceptance evidence there.

## Review of the resulting plan

The three specialists independently inspected the drafted specification and plan. Their actionable corrections have been incorporated: CSS-assisted synchronous focus handoff and guard deactivation; a shared empty-panel focus fallback; synchronous ordering instrumentation; a shell smoke that survives default desktop-open state; deferred native-option measurements for hidden/empty lists; same-count search results that still update; width-and-height checks for camera targets; pre-conversion camera bounds and fresh pan axes; deterministic single-frame Follow inspection; and a type gate that accepts a genuinely clean compiler exit.

The resulting artifacts are ready for implementation. This is a design/plan readiness conclusion, not a rendered-accessibility pass. The remaining execution prerequisites and manual evidence gaps are named in the plan, and all product implementation checkboxes remain unchecked.
