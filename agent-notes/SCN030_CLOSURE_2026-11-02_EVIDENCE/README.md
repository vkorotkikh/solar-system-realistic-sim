# SCN-030 automated contrast closure and manual handoff — 2026-11-02

This work closes demonstrated CSS text-contrast/overlap defects and makes the remaining manual gate executable. **SCN-030 remains partial until actual NVDA, VoiceOver, OS text resizing, and physical-device observations are supplied.** No AT speech, physical touch, deployed-site certification or manual acceptance is claimed here.

Work was isolated to branch `fix/scn030-closure-20261102`, based on `4f97dce442cffb46fa9add8fb3a674534dd2333e`. All product changes are HTML/CSS text-surface/layout changes. Solar surface, wind, corona/ejection rendering, camera implementation, shaders and scene parameters are untouched.

## Demonstrated defects and corrections

- The new real-renderer scene-contrast test failed before correction: the old frame indicator had a conservative contrast floor of **2.811527:1**, below 4.5:1. Its translucent background allowed bright imagery to reduce readability. Scene-facing text surfaces now have opaque dark backgrounds. The independently calculated floors are **9.165267:1** for frame text, **7.419254:1** for camera instructions, **15.340239:1** for status text, and **16.732328:1** for the Controls button. The calculation bounds the whole RGB scene cube, including partially transparent foreground text; no screenshot pixel selection or threshold tolerance is used.
- All five original shell audit states failed the new contrast-review gate before correction. Decorative text-bearing panel/date/experiment/selected-option gradients were replaced by dark/tinted solid colors close to the existing palette. Every original control and audit state remains exercised.
- On mobile, the recovery panel started at 80px while the two-line camera hint extended below it. Moving the recovery panel below that hint removes the actual overlap; tiny/short viewport flow retains its existing reflow behavior.
- After the real catalog/backend messages settle, fixed desktop hint placement overlapped wrapped status chips by **44.296875px at 1101px** and **7.296875px at 1440px**. Both new layout tests failed before correction. A desktop footer flow wrapper now places the hint above the status row at its actual height; mobile and tiny viewport placement retain their existing layout.

Axe 4.11.1 still emits one modal `.subtitle` `elmPartiallyObscuring` incomplete in some engines. Source-level diagnostic inspection showed different hidden pointer-hint descendant stacks underneath the fully opaque panel, not visible overlapping subtitle text. The raw incomplete is retained, never excluded or changed to an axe pass. `contrast-review.ts` accepts only this exact selector/reason while modal, then independently checks an opaque ancestor's bounds, transparent intermediate layers without images/blending/filtering, opaque text, every text-line corner/center hit-test, and the exact WCAG sRGB ratio >=4.5. Unexpected selectors/reasons, an actual obstruction, or insufficient contrast fail the test. Attachments contain the disposition calculations.

## Verification

- `a11y-reflow-final`: **51/51 passed** across Chromium, Firefox and Linux WebKit: five full-document axe states, drawer/reflow tests, the two settled-status overlap regressions, seven viewport sizes and emulated 200% text sizing. Linux WebKit is browser-engine evidence only.
- `scene-contrast-final`: final actual-app Chromium test, with real WebGL, settled catalog state, desktop/mobile contrast, raw axe results, modal focus restoration, camera Zoom operation, and accessible-tree attachment. **1/1 passed**.
- `actual-app-recovery-final-axe.json`: real `WEBGL_lose_context` extension injection, not a recovery-shell import: zero violations and zero incomplete items. Screenshots show actual desktop, mobile closed/open, and recovery states. These use local deterministic unavailable external services and fallback fonts, not deployed backend/remote-font certification.
- `manual-validator-green.log`: **19/19 passed**, including absent/duplicate cases, wrong platforms, emulated/desktop touch claims, missing speech/artifacts/revision, unresolved review, honest partial records, failed cases, overall/lane contradictions, unavailable devices and null cases.
- `ui-types.log`: strict browser test TypeScript check passed.
- `unit-suite.log`: the exploratory full suite under the shell's unsupported Node 24.21.0 had 3004 passes, 2 skips and 7 generator hash failures, all in `scripts/generated-solar-period.test.mjs`. `generator-pinned-node.log` supersedes those failures: **18/18 passed under the required Node 22.23.2**. No generator source or stored fixture was changed. Parent owns the final integrated full-suite run on the pinned runtime.

The first WebKit attempt failed to launch due to absent host shared libraries; retained in `contrast-other-engines-final`. The existing isolated launcher `/home/nomad/.cache/solar-webkit-noble-20261101/browsers/webkit-2370/pw_run.sh` supplied its already verified libraries. Subsequent WebKit runs and the final 51-case matrix passed without globally disabling host validation or changing browser assertions. `/tmp/scn030-webkit.config.ts` only points at that executable and this worktree; it does not exclude tests.

Large Playwright reports are stored losslessly as `.json.gz` with readable `.summary.json` companions. Summaries include the SHA-256 of the uncompressed original. Initial red/intermediate reports are historical steps, not final status. Example: `gzip -dc a11y-reflow-final.json.gz` reads the complete report.

## Manual work still required

The exact operator checklist and recording instructions are in `docs/accessibility-acceptance.md`. The updated original template adds device availability, actual device class, environment kind and availability notes, without changing any NOT_RUN result. `manual-readiness.json` is a valid NOT_RUN result with **18 required cases pending** across Windows/NVDA/Chrome, macOS/VoiceOver/Safari and real phone/tablet touch lanes. Optional iOS VoiceOver remains unexecuted. Native browser/OS text resizing, actual speech, native picker popups, physical gestures and device-specific focus/visual review require the user's real device sessions.

`node scripts/validate-accessibility-evidence.mjs <record.json>` checks completeness and consistency only: exit 0 for a complete recorded pass, 1 for honest pending/failure, 2 for invalid/contradictory evidence. It verifies file references but cannot independently verify human observations. An available device never becomes an acceptance pass automatically.
