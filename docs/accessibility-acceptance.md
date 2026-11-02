# Manual accessibility protocol; all outcomes NOT_RUN

This is a future test protocol, not an execution report. No deployed URL, AT device inventory, speech recording or physical-touch result is known. Use [`manual evidence template`](../agent-notes/ACCESSIBILITY_MANUAL_EVIDENCE_TEMPLATE_2026-10-30.json) to record the actual revision, local or authorized deployed URL, environment, operator and per-case outcome. Keep an unavailable platform NOT_RUN with its reason.

## Environments and evidence

| Lane | Actual environment required | Starting status |
|---|---|---|
| NVDA / Chrome | A real Windows desktop running installed NVDA and Chrome; frontend may reach a Linux/WSL backend | NOT_RUN |
| VoiceOver / Safari | A real Mac with VoiceOver and Safari | NOT_RUN |
| Physical touch | A real phone/tablet and its browser; record whether AT is disabled or enabled | NOT_RUN |
| VoiceOver touch, if included | A real iOS/iPadOS device with VoiceOver and Safari | NOT_RUN |

For every executed lane record OS/build, hardware, browser and AT versions, AT settings/keyboard layout, zoom/text scaling, viewport/orientation, URL, application commit and timestamp. Record exact actions, actual spoken output, visible focus destination, and pass/fail/not-run per case. Store permitted recordings/screenshots/transcripts alongside that record; DOM snapshots do not substitute for observed speech.

For NVDA, enable Speech Viewer from its Tools menu and capture the output without leaving focus in the viewer during the interaction. Use browse mode for document/heading/control traversal; use focus mode for inputs or canvas interactions when needed and record mode changes. NVDA+Space changes mode, and NVDA+F7 opens its elements list. These are proposed operations from the NVAccess guide, not operations performed here. [NVAccess user guide](https://download.nvaccess.org/documentation/userGuide.html#BrowseMode), [Speech Viewer](https://download.nvaccess.org/documentation/userGuide.html#SpeechViewer).

On VoiceOver use Safari's actual accessibility navigation and the tester's configured interaction keys/rotor. Record the settings that affect web interaction. A Linux Playwright WebKit run supplies no evidence for this lane.

## Cases

1. **Desktop discovery and operation.** Load the selected build at 1440x900 equivalent layout, 100% native zoom. Traverse headings, regions, disclosures and controls using AT navigation and Tab/Shift+Tab. Identify the app title, search label/help, major-body picker, simulation-speed value and camera instructions. Open each disclosure and operate a native button, checkbox, range and select. Expect names, roles, current values and expanded states to be understandable; no unnamed or unexpectedly unreachable author control. Check the visible focus ring throughout. Programmatic names and states are relevant, but actual AT operation must be observed. [W3C name/role/value](https://www.w3.org/WAI/WCAG21/Understanding/name-role-value.html).

2. **Mobile layout, drawer closed.** At 390x844 equivalent layout, discover Controls, the canvas description and Camera controls. Open Camera controls and operate Orbit, Pan and Zoom buttons without a drag or pinch. Confirm the closed drawer's controls are absent from AT navigation and keyboard focus. Observe the actual camera change and retained usable focus in the real app. Do not infer this result from the renderer-free audit fixture.

3. **Mobile layout, drawer open.** Activate Controls with AT/keyboard, then with touch in the physical lane. Record the announced dialog name and first focus position. Traverse the open drawer using Tab/Shift+Tab and AT virtual navigation; background content should be unavailable while modal. Expand and scroll disclosures to the final action. Try Shift+Tab from the first control and Tab from the last. Close with Escape where applicable and with the close action; verify Controls regains keyboard focus. Observe background navigation becoming usable again. [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

4. **Search speech and selection.** In Explorer enter Earth, change to Sun (the same result count), then enter a nonexistent body and clear it. Record whether result-count changes are announced, whether unchanged counts avoid redundant announcements, whether no-results guidance is discoverable and whether native selection/actions recover. Observe whether the selected-body card or stable date/rate causes distracting repeated speech while idle. Assess announcements by listening; mutation counts alone cannot establish delivery. [W3C status messages](https://www.w3.org/WAI/WCAG21/Understanding/status-messages.html).

5. **Recovery shell.** Use an owned local build or existing controlled fault mechanism to produce the real application's renderer-unavailable state; document the mechanism, not a guessed deployed fault. Confirm an understandable unavailable heading/message, stopped/disabled simulation controls and a reachable Reload visualization action. Test failure with the drawer closed and while it is open; while modal, close it before accessing the background recovery action. In a disposable local session activate Reload and record the real outcome, including a repeated unavailable state if graphics remain unavailable. A fixture-imported recovery case alone is insufficient for this real-application step.

6. **Native zoom, text and focus.** Use the actual browser's zoom controls at 200% and 400%; record the native zoom indicator, CSS viewport and screenshots. Traverse the drawer, native picker and final experiment action, scroll normally, and check focus is visible and content remains reachable. Record text-only scaling separately if tested. Report the native 400% CDP incident separately from these observations; its root cause has not been established. [W3C reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow.html).

7. **Physical touch.** On the named device, repeat closed/open drawer and camera-button operations in portrait and landscape. Open the actual native picker, select the first and last major body, scroll to the final action, close the drawer, and operate the reload action in the documented recovery case. Record failed activations, clipped targets and scroll conflicts. For a separately recorded VoiceOver touch lane, explore and activate using AT gestures and assess background isolation. Browser emulation and synthetic tap events cannot fill this row.

8. **Audit review items and visual context.** Review each axe incomplete item with its state, selector and screenshot. Inspect text on gradients/transparency and live imagery, disabled controls, focus outlines and native popups in the real application. Where contrast needs calculation, use the actual foreground/background conditions and record the method/result. Standard text requires at least 4.5:1, with the documented large-text 3:1 exception and other criterion-specific exceptions; do not introduce tolerance offsets. [W3C text contrast](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html).

## Recording decisions

PASS requires actual successful execution with traceable observations. FAIL requires the reproduction steps, observed/expected difference and evidence. NOT_RUN requires the unavailable environment or other reason. A not-applicable case may be described with its rationale but must not be silently converted into a pass.

Keep fixture evidence, actual-app behavior, native-browser zoom, manual speech and physical-device evidence distinct. A zero-violation axe attachment with unresolved incomplete results is only an automated result. W3C explains that evaluation tools require human assessment to cover the remaining barriers. [W3C evaluation tools](https://www.w3.org/WAI/test-evaluate/tools/).

No manual acceptance or deployed-site certification is asserted by this document.

## Operator handoff and record validation

Use the exact integrated revision that will be reviewed. Start the local UI using the repository's supported setup (`npm ci`, then `npm run dev -- --host 0.0.0.0`); record `git rev-parse HEAD` and the actual URL printed by Vite. A phone/tablet on the same network needs the host computer's reachable network address, not its own `localhost`. Keep this temporary test server on a trusted local network. Backend-unavailable fallback is a valid separately recorded state; running the backend is necessary to assess its live-data state.

Copy the JSON template to a new evidence directory. First fill each lane's `device_available` (true/false), `availability_notes`, `hardware`, `device_class` (desktop/laptop/phone/tablet), and OS/browser/AT versions. Availability alone does not change a test outcome. `environment_kind` is `physical` only for an actual device/AT session; a browser automation emulator is not a physical session. Leave unavailable lanes NOT_RUN with a reason.

For each available lane, this is the short execution checklist; the numbered cases above define the detailed expected results:

1. **Discover and operate:** at desktop layout, Tab and AT-navigation through title, Time, Display, Navigation, Explorer, and Cataclysmic Events. Open disclosures; operate Pause, a checkbox, speed slider and a select. Record names/roles/current values and visible focus.
2. **Drawer and camera:** use a narrow window or actual phone/tablet. With the drawer closed, reach Camera controls and operate Orbit, Pan and Zoom buttons. Open Controls, traverse forward/backward through the drawer, reach its final experiment action, then close. Record dialog announcement, background isolation and returned focus. On physical touch repeat portrait and landscape, including first/last native-picker entries and ordinary scrolling.
3. **Search:** enter Earth, then Sun, then a nonexistent name; clear with Escape. Record actual speech, count changes, no-results guidance, selection recovery and any repeated idle announcements.
4. **Recovery:** in a disposable local session, use browser developer tools (or the physical device's remote inspector) to run `document.querySelector('#space-canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`. Record if the extension is unavailable instead of reporting a pass. Repeat with the drawer closed/open; close the modal to reach Reload visualization. Activate Reload and record its actual result.
5. **Zoom and text:** use browser-native zoom at 100%, 200%, and 400%, then actual OS text-size/accessibility settings. Record values, browser zoom indicator, viewport, screenshots, reachable final controls, clipping and focus. CSS font changes and viewport emulation do not fill the OS-text row.
6. **Visual review:** inspect focus rings, disabled controls and native picker popup on the actual device. Link current automated contrast attachments plus screenshots and observations for any remaining audit incomplete items. Record all deviations as FAIL.

For an executed case set `outcome` to PASS or FAIL only after recording `actions`, `expected_observation`, `actual_observation`, `focus_destination`, and existing `evidence_paths` relative to the JSON file. AT lanes also require observed `spoken_output`; a DOM/accessibility-tree dump cannot replace speech. Use `record_type: "MANUAL_ACCESSIBILITY_EVIDENCE"`, fill commit, URL, timestamp and operator, and record native zoom values as `[100, 200, 400]` after testing them. `text_scaling` describes the actual OS setting and observation. Do not edit the blank template into a claimed completed result.

A lane stays NOT_RUN while required cases remain pending, becomes FAIL for an observed failure, and becomes PASS only when its applicable required cases pass. Desktop AT lanes require cases 1–6 and 8; the physical-touch lane requires closed/open drawer, recovery, and physical-touch cases. The optional iOS VoiceOver lane does not block the required three lanes unless it is explicitly included. A case outside a lane's applicability stays NOT_RUN with the rationale. The overall record follows the same pending/failure/pass rule.

Run the completeness validator against the recorded JSON:

```sh
node scripts/validate-accessibility-evidence.mjs /path/to/record.json
```

Exit 0 means the record contains all required observations and existing artifact references; it does **not** certify that the observations are true. Exit 1 means valid but NOT_RUN or FAIL; the JSON output lists pending/failed cases. Exit 2 means malformed, contradictory or insufficient evidence. This validator accepts honest partial records, rejects Linux WebKit as a macOS VoiceOver lane, and cannot convert missing devices into passes.
