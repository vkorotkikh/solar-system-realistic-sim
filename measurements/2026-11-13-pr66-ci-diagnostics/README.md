# PR #66 CI diagnostics, 2026-11-13

**Question.** Why did PR #66 fail the native tab-zoom walk locally, and the Firefox browser
project on CI?

**Run.** Start a Vite dev server of the checkout under test (see the top-level README), then:

```bash
node taborder.mjs 4195                 # Tab presses absorbed by each panel control
node firefox-start.mjs 4195 branch     # does the app start in headless Firefox?
```

**Findings.**

- `taborder.mjs`: the panel has 49 tab stops, but a full walk takes 58 presses. The
  planner's two native date inputs take four presses each (month, day, year, picker), so
  a walk of one press per stop ends six controls short. Fixed in the spec by walking until
  focus wraps.
- `firefox-start.mjs`: headless Firefox cannot create a WebGL context ("Exhausted GL driver
  options"), on the branch and on clean `main` alike, so the app shows its "could not start"
  message. Real-app browser specs must skip non-Chromium engines.
