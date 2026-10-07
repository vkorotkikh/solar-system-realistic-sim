# Frontend Accessibility Remediation Design

**Date:** 2026-10-07  
**Status:** Approved for implementation planning

## Purpose

Resolve the eight verified frontend usability and accessibility gaps without changing the simulation model, physics calculations, visual identity, or existing pointer interactions. The finished interface must reflow at 200% zoom, expose equivalent camera controls to keyboard users, keep assistive-technology announcements concise, and make the mobile controls drawer behave as a true modal surface.

## Scope

This pass covers:

1. Horizontal overflow at a 390px viewport under 200% effective zoom.
2. Keyboard orbit and camera-distance controls for the visualization.
3. Duplicate or repeated screen-reader announcements from HUD and search updates.
4. Mobile drawer isolation from background virtual navigation.
5. Focus restoration when crossing the 1100px panel breakpoint.
6. Mobile target sizing, retained canvas context, and touch-specific interaction guidance.
7. Hypothesis-specific cataclysm action messaging.
8. Automated regression coverage for these behaviors.

The pass does not alter orbital calculations, telemetry payloads, Three.js rendering fidelity, catalog data, simulation timing semantics, or backend APIs.

## Design Decisions

### Responsive reflow and mobile controls

- Remove the document-level 280px minimum width so the page can shrink to its effective CSS viewport at 200% zoom.
- Ensure panel children can shrink without forcing document overflow; narrow multi-column control groups will collapse to one column when needed.
- Keep the mobile drawer as a left side sheet, capped at 352px and sized to leave at least a narrow visible strip of the canvas. This preserves spatial context without replacing the established drawer interaction with a new bottom-sheet pattern.
- Give body-list option rows an approximately 44px minimum block size.
- Render separate pointer and coarse-pointer hints. Pointer users retain drag, wheel, and double-click guidance; touch users see drag, pinch, and Explorer body-selection guidance.

### Keyboard visualization controls

- Make the canvas focusable with a visible focus indicator and connect it to concise hidden instructions through `aria-describedby`.
- While the canvas owns focus:
  - Left and Right Arrow rotate azimuth.
  - Up and Down Arrow rotate elevation, respecting the OrbitControls polar limits.
  - `+`/`=` and numpad add move the camera closer.
  - `-` and numpad subtract move the camera farther away.
- Prevent browser scrolling only for handled keys while the canvas is focused.
- Apply keyboard movement around the current OrbitControls target, so it works consistently in free, focused, and following camera modes.
- Preserve all existing mouse, wheel, touch, double-click, and Explorer selection behavior.

The keyboard math and event interpretation will live in a focused module rather than adding more camera logic directly to `main.ts`.

### Drawer modal semantics and focus

- At widths up to 1100px, an open drawer receives dialog semantics and `aria-modal="true"`.
- While that modal drawer is open, the visualization viewport becomes both `inert` and `aria-hidden="true"`, preventing pointer, keyboard, and screen-reader virtual-navigation access to the background.
- Closing the drawer removes those restrictions before focus returns to the visible Controls button.
- Desktop panel behavior remains non-modal.
- When a breakpoint transition hides the currently focused surface, focus moves to the corresponding visible control:
  - panel content to Controls when the panel closes;
  - Controls to the panel close control when the desktop panel opens.
- Existing Escape handling and focus trapping remain, with state transitions centralized so attributes and focus cannot diverge.

### Live-region discipline

- `timeController` will compare formatted values before assigning text or `dateTime`, eliminating identical per-frame DOM writes.
- Search retains one concise polite match-count announcement.
- The body information card will no longer be a second live region rewritten on every search keystroke.
- Match-count text will also be assigned only when its visible value changes.

### Hypothesis-specific experiment messaging

- Centralize hypothesis presentation in a small mapping function.
- The selected H29 hypothesis will present an H29-specific action label, such as “Trigger H29 slipstream,” while the Gertsenshtein scenario retains compound-shockwave terminology.
- The button label and experiment status will update together on initial load and every hypothesis change, while the runtime hypothesis value remains unchanged.

## Code Structure

The implementation will keep `main.ts` as composition code and extract behavior with independent contracts:

- `viewportKeyboardController.ts`: translates focused-canvas key input into bounded camera transformations.
- `panelController.ts`: computes and applies desktop/mobile panel semantics, isolation, and focus restoration.
- `experimentPresentation.ts`: returns consistent status and action copy for each hypothesis.
- Existing `timeController.ts`: gains render-on-change behavior.
- Existing Explorer code: gains single-region, render-on-change announcements; extraction will be limited to what is necessary for deterministic testing.
- `index.html` and `style.css`: receive semantic instructions, responsive layout, touch hints, focus styles, and sizing changes.

No general-purpose UI framework or state library will be introduced.

## Testing Strategy

Vitest remains the test runner. A lightweight DOM environment (`happy-dom`) will be added as a development-only dependency for interaction tests.

Automated coverage will verify:

- canvas focusability, accessible instructions, handled keyboard mappings, bounded elevation, zoom direction, and default prevention;
- mobile drawer dialog state, viewport isolation, Escape/focus behavior, and focus restoration at breakpoint changes;
- search filtering and a single concise live announcement;
- unchanged HUD values do not cause repeated DOM assignments;
- hypothesis selection keeps status and action text consistent;
- HTML/CSS reflow contracts: no minimum document width, retained drawer/canvas context, 44px option targets, narrow control stacking, and pointer-specific hints.

The repository-level Vitest configuration will exclude local audit evidence directories so `npm test` exercises tracked product tests rather than unrelated untracked artifacts.

Verification will include the full tracked Vitest suite and production build. The existing repository-wide strict type-check debt will be reported separately if it remains outside the files touched by this pass.

## Error Handling and Compatibility

- Keyboard handlers ignore unsupported keys and editable targets.
- Camera distance and polar angle remain inside the same limits used by OrbitControls.
- Modal isolation is applied only at the mobile breakpoint and removed synchronously before focus restoration.
- Optional DOM updates remain null-safe under the existing controller conventions.
- Reduced-motion behavior and pointer interaction settings remain intact.

## Commit Strategy

Each coherent, passing slice will be committed separately:

1. Responsive reflow, mobile context, target sizing, and interaction hints.
2. Keyboard visualization navigation and tests.
3. Drawer modal semantics, breakpoint focus restoration, and tests.
4. Live-region update discipline, search behavior, and tests.
5. Hypothesis-specific experiment messaging and tests.
6. Final regression configuration or documentation adjustments, if any.

Only files belonging to a slice will be staged. Existing untracked audit notes and evidence directories will not be included.

## Acceptance Criteria

- A 390px-wide viewport at 200% effective zoom has no horizontal document overflow.
- The canvas can be reached by keyboard and supports orbit and distance changes without pointer input.
- Opening the mobile drawer prevents assistive-technology navigation into the viewport; closing it restores access and focus correctly.
- Crossing the 1100px breakpoint never strands focus on the document body when a focused control becomes hidden.
- Time-scale output is not rewritten every frame when unchanged, and search exposes only one active live announcement.
- Body options provide approximately 44px targets; an open drawer leaves visible canvas context; touch instructions describe touch interactions and body selection.
- H29 selection presents H29-specific action wording while still dispatching `hypothesis: "h29"`.
- Automated tests cover drawer, focus restoration, breakpoints, search, keyboard operation, live regions, and the responsive contracts.
- The complete tracked test suite and production build pass.
