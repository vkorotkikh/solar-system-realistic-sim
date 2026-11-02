# Frontend Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining release-verification gaps for the eight original frontend accessibility findings without rebuilding completed work or changing simulation behavior.

**Architecture:** Retain the existing controllers, lifecycle, physics and browser suites. Add a separate Playwright acceptance gate against the compiled `dist` artifact, with no source-entry replacement. Preserve the current blocking development-server browser matrix; publish attributable evidence and an explicit operational handoff.

**Tech Stack:** Node 22.23.2, npm 10.9.8; locked TypeScript 5.9.3, Three 0.182.0, Vite 7.3.7, Vitest 5.0.4, Playwright 1.64.0, axe-core 4.11.1. No dependency upgrade is part of this plan.

**Spec:** [Binding design contract](#binding-design-contract) in this document. The [October design](../specs/2026-10-11-frontend-accessibility-remediation-design.md), [review](../reviews/2026-10-11-frontend-accessibility-final-review.md) and [implementation plan](2026-10-11-frontend-accessibility-remediation.md) remain historical records; this revision supersedes their unimplemented-state, toolchain, preset-precedence and camera-scheduling assumptions.

## Global Constraints

- Work only in `/home/nomad/ai/projects/worktrees/solar-ui-production-plan-20261102`, branch `plan/frontend-production-readiness-20261102`; never stage the original checkout's audit notes.
- Freeze integration at `c842196c17ddf491080b3b4fb1a97106f362cdda`; inspect any later change separately instead of following moving `main`.
- Preserve Node 22.23.2/npm 10.9.8 and the committed lockfile; install with `npm ci`. No framework, telemetry service, runtime dependency or dependency upgrade is added.
- Preserve existing physics, catalog contents, source provenance, worker recovery, graphics recovery, solar-delivery ownership and lifecycle cleanup.
- Preserve current engine-resolved event presets: a named preset owns source, energy and hypothesis; changing source or hypothesis clears it. Do not restore October's energy-only policy.
- Preserve current camera microtask scheduling and its action-applied callback, Z-up orientation, browser shortcut exclusions, control bounds, disposal and Free/Follow behavior. Do not restore the obsolete frame-only queue.
- Retain all existing blocking CI jobs and the four browser projects. No `continue-on-error`, blanket retries, exclusions or baseline increases to conceal a failure.
- New acceptance tests run the compiled application, never `/src/main.ts`, `window.__uiFixture`, a replacement controller or a new production test seam. Local assets stay real.
- Distinguish source inspection, fixture checks, compiled-app checks, hardware checks and human assistive-technology checks. NOT RUN is not PASS.
- Commits are small, explicit-path, verified slices. No push, remote merge, production deployment, branch-protection change or rights-policy change is authorized by this local build plan.

## Review Focus

- A successful Vite development-server test does not prove that bundled imports, workers, legal notices and build-time backend routing work in `dist`; Task 2 tests the compiled artifact.
- Old fixture defaults must not reintroduce energy-only presets or frame-only camera input; Task 3 checks resolved production controls and observable input response.
- Real resize/zoom must retain focus and modal isolation, including remembered mobile-open state; Task 3 supplements, rather than replaces, native-zoom and panel tests.
- A missing graphics context must expose an operable recovery surface in the built app without fabricating renderer success; Task 3 tests failure with explicit evidence boundaries.
- A green workflow or an old hardware run must not be mistaken for final-source release approval; Tasks 4 and 5 bind checks to artifacts and keep human/hosting gates visible.

---

## Binding design contract

### Intent, approach and limits

The user wants a production-ready build, not another implementation of already merged fixes. The selected approach is a thin compiled-artifact gate around the current application. Rebuilding controllers would duplicate established behavior; converting all renderer-free fixtures into expensive WebGL tests would remove their useful isolation and slow feedback. Both alternatives are rejected for this iteration. These are engineering choices made to satisfy the request, not claims of separate user approval of each detail.

The Global Constraints above are the project-wide design requirements. Existing functional acceptance remains: 195px stress reflow and standard 320px reflow; focusable canvas and ten native camera buttons; guarded HUD writes; one search-result announcer; modal background isolation and correct focus restoration; usable native body selection and touch guidance; accurate resolved experiment copy; regression coverage. A 44x44 CSS-pixel target is the product goal for author-controlled controls, not a claim about native popup geometry or a blanket WCAG conclusion.

Do not infer full scientific telemetry from console messages. Preserve existing frame-error deduplication, catalog load diagnostics, worker health diagnostics and solar status updates. Worker computation timing is not end-to-end latency. The active default app is locally propagated; the retained `SimulationClient` is not proof of a server-authoritative runtime or a central logging/export service.

### Snapshot and current-state reconciliation

The routing-only commit `fd14543` was created above product `519c894`. During discovery the shared checkout moved to `c842196` (PR #22). Tests run in that moving checkout with stale `node_modules` are environment diagnostics only and must not be reused as release evidence. Task 1 integrates the exact reviewed commit into this isolated branch before fresh verification. The old `8ca1116` integration instruction is retired.

| Original finding | Reconciled evidence after Tasks 1–4 | Current disposition / remaining acceptance |
|---|---|---|
| 1. Reflow | `490426b` fixes the real 195x422 scene inline-height conflict; four viewport unit regressions and `b810476` compiled reachability checks pass; existing 320px/cross-engine and genuine 200%/400% tab zoom pass | Local automated proof PASS; OS text scaling and physical-device acceptance NOT RUN |
| 2. Camera keyboard/tap input | Current microtask/action-applied callback, Z-up setup and ten native buttons retained; unit/dev-browser coverage plus compiled focused-canvas key and native Zoom response pass | Local automated proof PASS; physical touch/pinch and AT use NOT RUN |
| 3. Live output | Equality guards and one deduplicated search announcer retained; browser mutation tests and compiled zero-result/Earth→Sun same-count journey pass | Local DOM proof PASS; spoken output with AT NOT RUN |
| 4. Modal drawer | Current controller retains isolation, Tab/Escape and focus restoration; compiled mobile modal and recovery checks pass | Local automated proof PASS; virtual-navigation isolation with AT NOT RUN |
| 5. Breakpoint focus | Current width resolver, resize/visualViewport signals and settle recheck retained; compiled remembered-mobile-open round trip and genuine tab zoom pass | Local automated proof PASS; device/AT focus acceptance NOT RUN |
| 6. Mobile detail | Native picker policy, row fallback, canvas strip and touch hint retained; built controls and final action are reachable, including all ten camera controls at 195px | Local DOM/layout proof PASS; physical native popup geometry, picker and pinch NOT RUN |
| 7. Event messaging | Built UI uses the real resolver: named preset owns source/energy/hypothesis; explicit source/model clears preset; current copy and trigger behavior pass | Local composition proof PASS; engine units remain the mathematical/payload proof |
| 8. Regression coverage | Existing unit/type/four-project matrix retained; compiled five-case gate and parsed blocking CI contract added in `19d4621`, `b810476`, `079c2ed` | Local checks PASS with unchanged platform skips; independent whole-branch review approved; hosted CI/upload/branch protection NOT RUN |

Source receipts: historical review line 9 says “eight original issues remain actionable”; current `src/style.css:59` says `min-width: 0`; current experiment controller line 46 sets `Event preset`; engine lines 65 onward resolve the named preset. At `c842196`, `playwright.config.ts` still starts `node node_modules/vite/bin/vite.js`, while `.github/workflows/frontend-ui.yml` now has a blocking browser matrix. These are static receipts, not fresh browser results.

### Readiness levels and owners

| Gate | Accountable role | Required evidence | Current status / consequence |
|---|---|---|---|
| G0 reproducible baseline | Implementer | Exact source/lock/toolchain; clean-install unit/type/build results | PASS locally: Task 1 clean install plus final input-equivalent gates below; evidence approved in final review |
| G1 code verified | Implementer + independent reviewer | Existing suites, compiled gate, no new errors/skips; inspected authored diff | PASS locally: automated checks, Tasks 1–4 reviews and independent whole-branch/Task 5 review approved; no open code findings |
| G2 accessibility accepted | Accessibility reviewer + product owner | NVDA/Chrome, VoiceOver/Safari, physical touch/native picker, OS text scaling, manual contrast review | NOT RUN for human/device acceptance; genuine Chromium 200%/400% browser zoom PASS. No complete accessibility acceptance claim |
| G3 operational release | Release owner | Named host/config, rights/privacy review, hosted CI/upload/protection, artifact promotion, rollback drill | NOT RUN; no production-ready or commercial-distribution sign-off |

Roles are responsibilities, not invented assignees. Missing release owners and deployment details remain explicit pre-release decisions. Automated axe checks cannot replace G2. Linux WebKit is not VoiceOver/Safari validation.

## Engineering review and decision record

**Scope:** retain all eight outcomes. Ten repository paths are included after the Task 3 runtime discovery below, zero new runtime services/classes. This is one reviewable branch/PR candidate with multiple commits; no stacked-PR dependency. The existing architecture is retained, so there is no smaller runtime arrangement to select.

**Architecture:** [CRITICAL, confidence 10/10] compiled-artifact coverage is missing: the configured server runs Vite's source transform, not preview. Task 2 adds the missing boundary using existing Playwright/Vite [Layer 1]. No deployment server is introduced. Vite preview is only a local acceptance server, not the proposed production host.

**Code quality:** [INFORMATIONAL, confidence 10/10] October prescriptions are stale against current source. The current resolver, microtask input, layout-width resolver and ownership cleanup are binding. This document corrects the plan; no broad refactor or new shared abstraction is needed.

**Tests:** [CRITICAL, confidence 9/10] detailed fixture coverage and real-app smoke exist, but most assertions are not executed against build output. Tasks 2–3 add a small real-boundary suite. Existing unit/fixture tests stay; none are scheduled for retirement. Proposed tests assert user-visible results and artifact behavior, not private module structure.

**Performance:** [INFORMATIONAL, confidence 9/10] historical catalog load, GPU-fenced readiness and frame time measure different work. Record build bytes and test durations, but do not invent a universal FPS/startup SLO from SwiftShader. No performance refactor or rendering-quality reduction is included.

Dispositions: all four findings map to required proof or factual corrections for the user's requested production plan. No new runtime behavior is approved by reviewer agreement. Required local proof is in scope under “continue planning ... get to development asap”; external publication and unchosen operational policy remain outside local execution.

```text
Pinned source + lock + Node/npm
  -> clean install -> unit + strict/type gates -> build (with distribution prebuild)
                                               |
              +--------------------------------+---------------------+
              |                                                      |
       existing Vite dev matrix                             compiled dist preview
       fixture/controller + WebGL                           real HTML/JS/worker/assets
       Chromium / native zoom / Firefox / WebKit             no source interception
              |                                                      |
              +------------------- attributable results -------------+
                                            |
                              manual AT/device + deployment gates
                                            |
                                release owner decision (not automatic)
```

Coverage classes: existing behavior tests cover all eight original mechanisms; final-source passing execution is not assumed. New compiled tests protect packaging/routing, real controller composition and recovery. Backend services are deliberately unavailable in deterministic local acceptance; these tests do not establish live-provider accuracy, backend integration, speech, touch-device behavior or production performance.

**Task 3 runtime discovery:** The compiled 195x422 journey reproduced clipped camera controls despite the fixture reflow coverage: `sceneSetup.applyViewportSizeOverride()` unconditionally writes `max-height: 100vh`, even without a height override. That inline cap defeats the short/narrow CSS page flow and compresses the camera disclosure. Task 3 therefore includes a narrow sizing fix with a failing unit regression and the compiled reachability test; explicitly requested viewport dimensions retain their intended bounds. This is an execution finding, not a claim that source inspection alone established complete reflow.

### Failure modes and test value

| Case | Observable protection / credible regression | Why new / evidence limit |
|---|---|---|
| P1 artifact boot | Fails if built JS or worker fails, source module requests leak, legal notice is absent, or runtime throws | Existing dev server can mask packaging failures; no live service claim |
| P2 UI journey | Fails if built controls lose key response, zero-result state, resolved preset copy or modal focus after resize | Tests actual entry/resolver; does not inspect private engine state or prove speech |
| P3 recovery | Fails if WebGL absence leaves a blank page or unusable recovery/drawer | Compiled failure branch; deliberate context denial, not a physical GPU failure |
| P4 CI contract | Fails if compiled gate disappears, builds the wrong origin, skips strict checks or becomes non-blocking | Static configuration is a release contract; not proof a remote job ran |

Reuse `tests/browser/webgl-cleanup.ts` only for its existing real-app teardown. Other helper extraction needs a demonstrated second caller; no test-only production hook. Existing frame/lifecycle/worker/recovery tests remain the proof for those internal contracts.

## File ownership and dependency graph

| Path | Responsibility | Task writer |
|---|---|---|
| This plan | Current contract, tasks, release runbook and execution evidence | Coordinator, Tasks 1/5 |
| `package.json` | `test:production` command only | 2 |
| `playwright.production.config.ts` (new) | Isolated strict-port compiled preview and Chromium project | 2 |
| `tsconfig.ui-tests.json` | Include new config and production tests in strict checking | 2 |
| `tests/production/frontend.spec.ts` (new) | Real compiled-app acceptance, evidence attachments and cleanup | 2, then 3 |
| `src/frontend/app/sceneSetup.ts` | Remove the default inline height cap that defeats narrow page flow; retain explicit overrides | 3, reproduced regression |
| `src/frontend/app/sceneSetup.test.ts` | Default and explicit viewport-sizing regression | 3 |
| `scripts/frontendProductionGate.test.mjs` (new) | Execute production config and validate its boundaries | 2 |
| `scripts/ci/tests/test_r3_r4_workflow.py` | Parse frontend workflow and verify blocking artifact-gate semantics with already pinned PyYAML | 4 |
| `.github/workflows/frontend-ui.yml` | Separate blocking compiled-artifact job, retained artifacts | 4 |

Task order: `1 -> 2 -> 3 -> 4 -> 5`. Shared configuration and test files make sequential implementation appropriate; independent reviewers can work alongside the coordinator. No simultaneous writers. No new package or lockfile change is expected.

## Task 1: Integrate the frozen baseline and verify a clean environment

**Files:** this plan's execution evidence only. The integration merge imports already reviewed upstream work, not newly authored product changes.

**Interfaces:** exact target `c842196c17ddf491080b3b4fb1a97106f362cdda`; Node/npm pins above; retain `fd14543` and the planning commit.

- [x] Confirm clean worktree, record both parents, and merge the exact target locally with message `merge: reconcile frontend readiness baseline with c842196`. Never merge a moving branch name.
- [x] Select pinned Node/npm, run `node --version`, `npm --version`, `npm ci`; confirm locked installed package versions. Do not copy stale `node_modules` from another worktree.
- [x] Run separately: `npm test`, `npm run typecheck`, `npm run typecheck:ratchet`, `npm run typecheck:ui-delta`, `npm run test:types:ui`, `npm run typecheck:scripts`, `npm run build`. Capture exit status for each. Strict TypeScript must be clean; legacy ratchet budgets are not permission to reintroduce debt.
- [x] Record test totals including explicit skips, build bytes, known warnings, source/tree SHA and lock hash in Execution evidence below. A failing clean baseline is investigated before adding the gate; never reset a baseline JSON to hide it.
- [x] Verify `git diff --check` and explicit staged paths. Commit evidence: `docs: record pinned frontend readiness baseline`.

## Task 2: Establish compiled-artifact acceptance

**Files:** new production config, new production spec, new gate contract test; edit package script and UI test tsconfig only.

**Interfaces:** `test:production = playwright test --config=playwright.production.config.ts`; project `production-chromium`; fixed local host `127.0.0.1`, default port `4185`, optional validated integer `UI_PRODUCTION_PORT` in 1024–65535; output `test-results/production-<port>`. Config runs `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port <port> --strictPort`; `reuseExistingServer: false`. It never builds automatically or falls back to the source server. Test artifacts use line + HTML reporters, traces/screenshots retained on failure, one worker and zero retries. Use existing full Chromium channel/software-rendering flags and 90-second real-WebGL budget; expect assertions use bounded waits.

- [x] Write `scripts/frontendProductionGate.test.mjs` red tests pinning the new package command, config inclusion in UI tsconfig, explicit preview command/no auto-build, isolated outputs and production test directory. Include invalid-port rejection if an override is supplied; no silent fallback. Run `npx vitest run scripts/frontendProductionGate.test.mjs`; failure must identify the missing contract, not missing dependencies.
- [x] Implement the config/script/typecheck inclusion without altering `playwright.config.ts` or existing suites. Keep config logic small; no custom server framework.
- [x] Write `tests/production/frontend.spec.ts` boot acceptance. Use Playwright-managed preview over a previously built `dist`. Record requests/responses, page errors and browser/renderer identity. Require successful hashed JS and worker responses, `#space-canvas[data-orbital-worker="ready"]`, the existing verified 100,000-row catalog status, working range status and no graphics-failure surface; forbid requests for `/src/`, `/@vite/`, `/node_modules/` and fixture state. Assert copied `/legal/LICENSE.txt` is served as a nonempty notice, not the SPA fallback. Local assets must not be intercepted. Route backend paths `/solar/physics`, `/solar/realtime`, `/health`, `/trajectory/*` and `/mission/*`, plus external service/font requests, to deterministic 503 responses, recording that scope. Assert backend requests use the expected preview origin so a wrong-origin build cannot pass; a request alone does not establish asset success.
- [x] Build with `VITE_BACKEND_ORIGIN=` and the existing prebuild; run `npm run test:production`, targeted contract tests and `npm run test:types:ui`. Test must reject an unavailable/missing `dist` rather than start source Vite. Exercise that negative case with a private temporary empty preview directory, never moving or deleting user assets.
- [x] Run full units/types and inspect the diff. Commit `test(ui): verify compiled frontend artifact startup`.

## Task 3: Prove production interaction and recovery behavior

**Files:** extend `tests/production/frontend.spec.ts`; existing production code is unchanged unless a separately reproduced regression needs its own test-backed fix.

**Interfaces:** use only accessible DOM, network/console evidence and existing browser APIs. Reuse real-app teardown. No `window.__uiFixture`, engine globals or production exports solely for tests.

- [x] Add a real-app journey: pause; focused-canvas `+` changes Range; native Zoom button changes it while retaining focus; fill nonexistent body and verify disabled Focus/Follow and hidden card; Escape restores list before closing; Earth→Sun changes body content without extra count mutation. Preserve ordinary Ctrl/Meta shortcuts.
- [x] Extend the same journey for actual resolver wiring: select `M87`, then `SgrA_WarpWave_H29`; assert source `SagittariusA`, hypothesis `h29`, `Event preset`, `Trigger H29 slipstream` and speculative classification. Change source/model explicitly and assert preset clears, correct button/status and no runtime error on trigger. Direct engine tests remain the mathematical/payload proof; a DOM assertion does not establish all calculations.
- [x] Assert mobile 390x844 drawer open/close, actual focus and inert background; remembered mobile-open → desktop → canvas focus → mobile returns focus inside. At 195x422, scroll to final action and camera tools; assert relevant 44x44 author-controlled targets and no clipped/reachable-control failure. Keep detailed native browser zoom and cross-engine matrices in their existing tests.
- [x] Add compiled no-WebGL acceptance using context denial before page load: named recovery region, nonempty error, focusable reload, disabled unavailable simulation actions and operable drawer. Record intentional failure separately from ordinary app exceptions; do not globally swallow errors. Add full-document axe to the stable built-app modal/recovery states with existing pinned rules and no new violation exclusions.
- [x] Run production tests, relevant existing camera/experiment/panel units and UI types. Commit `test(ui): cover compiled accessibility and recovery flows`.

## Task 4: Make compiled acceptance a release-blocking CI contract

**Files:** workflow and `scripts/ci/tests/test_r3_r4_workflow.py`. The existing scientific CI invokes that test module on every push/PR; reuse its pinned PyYAML parser instead of adding a JavaScript YAML dependency or a text-matching imitation.

**Interfaces:** new job `production-artifact`, separate from existing `ui` and browser matrix. Uses exact Node/npm, clean lock install, Chromium install, strict source check, `VITE_BACKEND_ORIGIN=` build and `npm run test:production` against that same output. Timeout 15 minutes is an execution budget, not a product performance promise. No environment secrets or publish permissions.

- [x] Add red semantic assertions to the existing Python workflow test module: parse YAML, then check job exists, no `continue-on-error`, clean install before build, build before compiled test, strict type check present, no disabled existing browser projects. Both workflow triggers must include `tests/production/**`, `public/**`, `LICENSE`, `NOTICE.md` and `docs/distribution-policy.md` so test-only and packaging-only changes run acceptance. Assertions protect named release guarantees, not incidental whitespace. Use the existing YAML `on` handling and CI pins (Python 3.12.13, pytest 9.1.1, PyYAML 6.0.3); no new dependency or lock edit.
- [x] Add the job with `permissions: contents: read`, strict toolchain and explicit build origin. Preserve science/backend workflow and the existing four-project browser matrix. Upload test report/trace/screenshots with `if: always()`, finite 14-day retention and missing-artifact warnings that cannot replace a failed test status.
- [x] Retain the tested `dist` directory with source SHA, lockfile SHA-256 and built asset hashes alongside results using existing shell/Node tooling in the job. Do not archive credentials, environment dumps or raw interactive user input. Keep an immutable artifact identity; a deployment must use the tested artifact, not an unverified rebuild.
- [x] Run `python -m pytest --noconftest -q scripts/ci/tests/test_r3_r4_workflow.py` in the pinned environment, full unit/types/build and the compiled suite locally. Parsed semantic validation is not remote execution. Commit `ci(ui): gate compiled frontend acceptance`.

## Task 5: Record release evidence, manual acceptance and rollback

**Files:** this plan's execution and readiness sections. No deploy configuration is fabricated for an unknown host.

**Interfaces:** evidence row = `{source SHA, tree SHA, lock SHA, command, tool/browser/platform version, environment, result, artifact location, limit}`. Status is PASS / FAIL / NOT RUN, never an inferred pass.

- [x] Run the final existing unit/type/build gates, new compiled gate and applicable existing browser projects from this isolated revision. Record every excluded or skipped platform case. Reuse a result only with its exact tested commit, command and artifact. When unrelated CI/documentation commits follow, verify and record that every input to the reused command is unchanged; otherwise rerun the affected checks. Old baseline counts alone are not current evidence.
- [x] Request one independent whole-branch review of the authored delta, excluding imported upstream changes; reviewer checks all eight traceability rows, current event/camera semantics, real artifact boundary, type policy and CI failure propagation. Fix confirmed issues in separate commits and rerun affected gates.
- [x] Fill the manual matrix below with actual outcomes or NOT RUN. Missing AT/device access does not block completion of local code, but blocks a complete accessibility acceptance claim.
- [x] Record deployment prerequisites and rollback drill status below; no production-ready or commercial-distribution sign-off until the release owner resolves them. Do not push, publish or change repository settings in this task.
- [x] Verify final tracked diff, no unexpected lock/runtime edits, clean branch and evidence paths. Commit `docs: record frontend production acceptance and release gates`.

Final review: an independent GPT-6.1 Sol xhigh reviewer inspected the full 11-file authored delta `c842196..76a8b0f` and approved both the implementation and Task 5 evidence: **0 Critical, 0 Important, 0 Minor findings**. Read-only checks confirmed clean tracked status, whitespace, unchanged lock and input equivalence. No fix wave was required. This closure changes documentation only. The reviewer explicitly left manual accessibility, operational release, unchanged upstream physics and live-provider correctness to their documented acceptance boundaries; none is inferred from local automation.

## Manual and operational acceptance runbook

| Scenario | Required observation | Owner | Actual status / evidence |
|---|---|---|---|
| NVDA + Chrome on Windows | Drawer background absent from virtual navigation; focus restored; one spoken search count; canvas instructions and controls usable | Accessibility reviewer | NOT RUN; no Windows/NVDA session |
| VoiceOver + Safari on macOS/iOS | Same interactions, native picker, modal isolation and recovery navigation | Accessibility reviewer | NOT RUN; Linux WebKit is not Safari/VoiceOver |
| Physical touch/hybrid input | Native picker selection, pinch, tap camera controls, body-selection guidance | Device QA | NOT RUN; browser emulation does not establish physical-device acceptance |
| OS text scaling | 200% OS text and reachable final actions with visible focus | Device QA | NOT RUN; existing automated CSS text-resize checks do not establish OS settings |
| Genuine browser zoom | Real 200%/400% browser tab zoom, reachable final actions and focus through breakpoint transitions | Implementer | PASS in Chromium 156.0.8078.4; factors 2/4, effective widths 640/320, DPR 2/4, CSS zoom unchanged, sibling tab factor 1; `task-5-browsers.log` |
| Manual color contrast | Inspect incomplete targets on gradients/images/overlap in normal/modal/recovery states | Accessibility reviewer | NOT RUN; axe 4.11.1 found 0 violations but color-contrast incomplete at 29/21/21/8 nodes, retained below |
| Native visibility and hardware/EGL | Owned display hidden-tab resume; physical GPU behavior/performance; opt-in Earth/Mars EGL geometry cases | Device QA | NOT RUN; native visibility and two EGL cases are existing skips; SwiftShader transform feedback is separate software-GPU evidence |
| Deployment identity and routing | Named host, immutable tested artifact, HTTPS backend origin and exact allowlist; real staging routing/authentication | Release owner | NOT RUN; local empty-origin acceptance intentionally denies API/external services |
| Hosted CI, upload and protection | Run blocking jobs remotely, inspect retained tested artifact/report, verify required branch checks | Release owner | NOT RUN; local YAML validation is not hosted execution/upload or repository settings verification |
| External data/privacy/rights | Review packaged notices, SILSO restrictions, permissions-required original code, request inventory and current Google Fonts contact | Product/release owner | NOT RUN; notice packaging PASS is not blanket rights/privacy clearance |
| Rollback drill | Retain previous approved artifact/config; atomically restore it on chosen host; verify worker/assets, drawer, search, camera and recovery | Release owner | NOT RUN; host procedure and observation duration remain to be supplied |

Release sequence: G0/G1 evidence → G2 device/AT sign-off → staging with actual routing/authentication → owner-approved promotion of the same artifact → smoke verification. A new deployment exposing startup failure, broken input, wrong backend routing or missing assets is stopped and rolled back to the previous approved artifact. Exact host commands and observation duration must be supplied by its owner before G3; this plan does not invent infrastructure.

Preserve physics/backend commits on rollback: roll back the frontend artifact/config pair, not repository history. A code correction uses a normal revert or forward fix after review, never a hard reset/force push. Browser caches must receive the prior artifact's matching HTML and hashed assets, not a mixed release.

## Execution evidence

Planning provenance: three read-only specialist inspections at `519c894`, followed by targeted primary-agent delta inspection of `c842196`. Shared-main test output was invalidated by checkout advancement and stale dependencies. Only the isolated baseline and attributable execution evidence below count as local runtime evidence.

### Task 1 baseline — 2026-11-02

- Clean isolated worktree and absent `node_modules` confirmed before integration. Local merge `4c269322f767bd6b679ebca5010ad67bfb596db5` used the exact frozen target, with parents `6edd6edc9ffe88627378c98f9c4836c888228b1c` and `c842196c17ddf491080b3b4fb1a97106f362cdda`; routing `fd14543` and planning `6edd6ed` remain ancestors. Tested source/tree: `4c269322f767bd6b679ebca5010ad67bfb596db5` / `f966876107b3fa1daef7a931b62febaba2ec3e42`.
- Pinned cached tools selected through `/home/nomad/.npm/_npx/f4985f1adc097c41/node_modules/.bin`: `node --version` → `v22.23.2`; `npm --version` → `10.9.8`. `npm ci` exited 0, installed 51 packages and audited 52 with 0 vulnerabilities. `npm ls --depth=0` exited 0; all nine direct installed versions were also compared to the lockfile and matched: `@axe-core/playwright` 4.11.1, `@playwright/test` 1.64.0, `@types/node` 22.19.1, `@types/three` 0.182.0, `axe-core` 4.11.1, `three` 0.182.0, TypeScript 5.9.3, Vite 7.3.7, Vitest 5.0.4.
- Committed lock retained unchanged from frozen upstream: Git blob `f2790c6fc630f3424a04293986f25347c4cd2e23`; SHA-256 `6f54638d28e8ed20cb8e036a52ca75f1c0687594af7bd82f3f123edcd6182702`.

| Separate command | Exit | Observed result |
|---|---:|---|
| `npm test` | 0 | 115 files passed, 1 file skipped; 1,753 tests passed, 2 skipped, 0 failed (1,755 total) |
| `npm run typecheck` | 0 | Strict application TypeScript clean |
| `npm run typecheck:ratchet` | 0 | 0/226 legacy diagnostics; no bucket exceeded its baseline |
| `npm run typecheck:ui-delta` | 0 | 0 legacy diagnostics; no new or increased identities |
| `npm run test:types:ui` | 0 | UI fixture/spec TypeScript clean |
| `npm run typecheck:scripts` | 0 | Scripts TypeScript clean |
| `npm run build` | 0 | Prebuild verified 8 curated maps and packaged 4 notices; Vite transformed 78 modules |

- Explicit skips: `scripts/planetShaderGeometry.test.mjs`, Earth and Mars cases in `planet vertex shader geometry on EGL`; the existing opt-in `PLANET_SHADER_GPU_TEST` was unset. Those EGL runtime cases are **NOT RUN**.
- Exact output bytes (gzip bytes): `dist/index.html` 21,172 (4,813); `dist/assets/modelWorker-BeAgDSIV.js` 28,361 (9,993); `dist/assets/index-Ba7vuM9D.css` 26,390 (5,959); `dist/assets/index-B_ZKDIdI.js` 991,894 (258,046). These four outputs total 1,067,817 bytes; all 434 distribution files, including local assets, total 70,994,139 bytes. Known build warning: a minified chunk exceeds 500 kB; no warning limit or baseline was changed.
- Gates ran at 08:52:37–08:53:58 UTC. Full command output, exact exit statuses, dependency comparisons, provenance and byte census are retained in ignored `.superpowers/sdd/2026-11-02-frontend-production-readiness/task-1-*.log`, `task-1-statuses.tsv` and `task-1-report.md`. `git diff --check` passed; only this plan's execution evidence is newly authored and staged. No browser, compiled-app interaction, hardware or human assistive-technology result is claimed by this baseline.

### Tasks 2–5 final local evidence — 2026-11-02

Tasks 2–4 are complete and independently reviewed clean. `19d4621` establishes compiled startup and its 14 contract checks (observed red/green and missing-dist rejection); `490426b` separately fixes the reproduced 195px clipping defect with four viewport unit regressions; `b810476` completes the five-case compiled startup/interaction/recovery suite; `079c2ed39f1c45a8a4f13e2c0c6acb8840a06f2c` adds blocking compiled-artifact CI and nine parsed workflow checks. Detailed evidence is retained in ignored `task-2-report.md`, `task-3-report.md` and `task-4-report.md` under `.superpowers/sdd/2026-11-02-frontend-production-readiness/` (the **evidence directory** below). Task 4 raw console output is in session tool results; no separate Task 4 raw-log files are claimed.

**Actual tested/build identity A:** source checkout `36b17b6a8743812b147c1d3ea04269b1c0b57e92`; committed tree `325d5f1c30975945b766ac72ea5d6575c928b056`; lock Git blob `f2790c6fc630f3424a04293986f25347c4cd2e23`, SHA-256 `6f54638d28e8ed20cb8e036a52ca75f1c0687594af7bd82f3f123edcd6182702`. Task 4 workflow/Python edits were present during its local commands and then committed as `079c2ed`; the provenance correctly identifies the actual pre-commit checkout rather than relabeling it. The semantic command tested those final CI/test bytes, not the older committed workflow at A.

**Input-equivalence proof:** Task 5 started at `6e53f1a2cd5d93dcf679b2a6af385c8f1b5231be`, tree `c51042291becde26b3cb2ad6dbb87a79514d0015`. `git diff --name-status 36b17b6 HEAD` listed only `.github/workflows/frontend-ui.yml`, `scripts/ci/tests/test_r3_r4_workflow.py` and this plan. `git diff --exit-code 36b17b6 HEAD -- . ':(exclude).github/workflows/frontend-ui.yml' ':(exclude)scripts/ci/tests/test_r3_r4_workflow.py' ':(exclude)docs/superpowers/plans/2026-11-02-frontend-production-readiness.md'` exited 0: all runtime, public assets, distribution policy, build/package/lock, unit/type/browser/compiled tests, configs and GPU-script inputs are unchanged. `git diff --exit-code 079c2ed HEAD -- .github/workflows/frontend-ui.yml scripts/ci/tests/test_r3_r4_workflow.py` and `git diff --exit-code c842196 HEAD -- package-lock.json` also exited 0. This commit edits only the plan. The reuse is input-equivalent evidence with A retained as the tested identity; it is not a claim that the tests ran at a later commit. Exact comparisons/file hashes are retained in `task-5-input-equivalence.log`.

**Common tool/platform/environment:** all npm commands used `PATH=/home/nomad/.npm/_npx/f4985f1adc097c41/node_modules/.bin:$PATH` (Node v22.23.2/npm 10.9.8) and locked dependencies from Task 1's clean `npm ci`, without dependency/lock changes. Host: Ubuntu 24.04.4 LTS x86_64 on WSL2, kernel `6.18.33.2-microsoft-standard-WSL2`. Playwright 1.64.0 installed browser manifest: Chromium 156.0.8078.4/revision 1248, Firefox 157.0/revision 1555, WebKit 27.2/revision 2370. Chromium's runtime/native-zoom evidence confirms 156.0.8078.4. WebGL used ANGLE Vulkan SwiftShader (Subzero), not a physical GPU. Python semantic checks used `evidence-directory/ci-venv/bin/python` (Python 3.12.13, pytest 9.1.1, PyYAML 6.0.3). No remote action was performed.

| Command at identity A / final CI bytes as qualified above | Actual result | Retained artifact / evidence | Limit |
|---|---|---|---|
| `npm test` | PASS, exit 0: 116 files passed, 1 skipped; 1,771 tests passed, 2 skipped | `task-4-report.md`; Task 3 corroborating final-source summary | Two existing Earth/Mars opt-in EGL cases NOT RUN; no new skips |
| `npm run typecheck`; `npm run typecheck:scripts`; `npm run test:types:ui`; `npm run typecheck:ui-delta`; `npm run typecheck:ratchet` (separate commands) | PASS, each exit 0; strict checks clean, UI delta 0, ratchet 0/226 diagnostics | `task-4-report.md` | Ratchet budget was not increased and does not replace strict checking |
| `VITE_BACKEND_ORIGIN= npm run build` | PASS, exit 0: 8 curated maps verified, 4 notices packaged, 78 modules transformed | Real `dist/` and `artifacts/production/provenance.json`; `task-4-report.md` | Existing >500 kB chunk advisory retained; no production host/live-provider proof |
| `.superpowers/sdd/2026-11-02-frontend-production-readiness/ci-venv/bin/python -m pytest --noconftest -q scripts/ci/tests/test_r3_r4_workflow.py` | PASS, 9 semantic tests; red phase 5 failed/4 passed; temporary strict→ratchet mutation correctly failed | `task-4-report.md`; final workflow/test committed `079c2ed` | Parsed local contract, not hosted Actions execution |
| Parsed workflow `production-provenance` run body via `bash -e -o pipefail -c`, plus independent Python rehash before/after compiled tests | PASS: 434 exact paths, byte lengths and SHA-256 hashes, 70,994,200 total bytes unchanged | `artifacts/production/provenance.json`; `task-4-report.md`; Task 5 repeated census in `task-5-artifact-recheck.log` | Manifest remains outside `dist`; hashes identify local bytes, not a deployed/uploaded artifact |
| `npm run test:production` | PASS, exit 0: 5/5 in 2.3m; no skips/retries | `playwright-report/production-4185/index.html`, `test-results/production-4185/.last-run.json` (`passed`, no failed tests), `task-4-report.md` | Compiled Chromium, one worker, software WebGL, deterministic API/external 503s; no local-asset interception |
| `npm run test:browser -- --reporter=line` | Initial FAIL, exit 1: 98 passed, 36 skipped, 39 WebKit host-dependency launch failures in 4.9m | `task-5-browsers.log`, original `test-results/4175/` failure traces/error contexts | Environment failure retained; not accepted as a product pass |
| `env -u PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS -u PLAYWRIGHT_BROWSERS_PATH -u LD_LIBRARY_PATH "PATH=/home/nomad/.npm/_npx/f4985f1adc097c41/node_modules/.bin:$PATH" UI_TEST_PORT=4187 npm run test:browser -- --config=.superpowers/sdd/2026-11-02-frontend-production-readiness/playwright.webkit-local.config.ts --project=webkit --reporter=line` | PASS, exit 0: WebKit 38 passed/18 existing skips in 1.3m | `task-5-webkit.log`, ignored adapter, `test-results/4187/.last-run.json` (`passed`) | Existing verified isolated Noble cache supplies missing libraries; current checked-in config/tests imported, only executable/resource environment and absolute paths adapted; no host package install or validation-bypass flag |
| `npm run verify:asteroid-gpu` | PASS, exit 0: 125 planar + 2 inclined actual WebGL2 transform-feedback cases; max errors 2.08094e-5 / 3.72417e-7 AU | `task-5-gpu.log` | SwiftShader; independent planar oracle plus production CPU inclined cross-check, not hardware/performance acceptance |

The browser/GPU commands used `set -o pipefail` and `2>&1 | tee` to their named logs, preserving actual exits. The WebKit adapter points to `/home/nomad/.cache/solar-webkit-noble-20261101/browsers/webkit-2370/pw_run.sh`; that existing wrapper supplies its own isolated library path and original revision-2370 browser resources. The ignored adapter SHA-256 is `0f829d810ae220b066bb151faf644c060d23db7e05c11cbbb82b1a397991d412`. No checked-in browser configuration, retries, exclusions, timeout or skip policy changed.

**Combined unique existing browser matrix:** 136 PASS / 37 existing SKIP / 173 selected after environment repair: Chromium 56/1; Chromium native zoom 4/0; Firefox 38/18; WebKit 38/18. The initial 39 WebKit launch failures include one normally skipped case whose `page` fixture could not launch; the repaired run establishes the final 18 WebKit skips. Per Firefox/WebKit project, skips are 1 assembled-material, 4 frame/lifecycle, 5 startup-ownership, 4 startup-warmup and 4 Chromium-specific zoom cases. Chromium's one skip is owned-display native hidden-tab visibility (`FRAME_NATIVE_VISIBILITY` unset). Existing project exclusions remain: `app-smoke.spec.ts`'s five actual-app cases are selected in Chromium and excluded in each Firefox/WebKit project; the four tab-zoom cases are excluded from standard Chromium and selected in its dedicated project. These limits are not cross-engine passes or a native-visibility pass.

**Artifact identity:** manifest SHA-256 `d6657af65c5bdd7d6e8216cc074c11d9475279bb2a68c5facc080dd5f56e07d1`. Selected actual output identities:

| Dist-relative file | Bytes | SHA-256 |
|---|---:|---|
| `index.html` | 21,172 | `c73467ddcfe4a71fb7088c7272db156e62ba5534c6f2ec374d151935fe6589fa` |
| `assets/index-C7UaG91N.js` | 991,955 | `d645ced93263fdf461ee4a7099f57e20e5299b745e8b61be5653c024e89f0af7` |
| `assets/index-Ba7vuM9D.css` | 26,390 | `144385b61810c2316483ee8e8d73b4db769c781331c09ad5f92be4fb4481cdd0` |
| `assets/modelWorker-BeAgDSIV.js` | 28,361 | `dcbce67ed43be274c67f3f7fa77f77de5d41acccf32f780f4425729e65d8bb93` |

**Accessibility evidence:** compiled desktop expanded, mobile modal, desktop recovery and mobile recovery each report 0 axe violations with no exclusions. `color-contrast` is incomplete for 29/21/21/8 nodes respectively; this is NOT RUN manual acceptance, not a contrast pass. Full targets/reasons remain in `axe-compiled-*.json` and `task-3-browser-summary.json` in the evidence directory. The real 195px before/after captures remain `tiny-camera-before.{json,png}` and `tiny-camera-after.{json,png}`. Original failure traces and ignored evidence are retained; no cleanup deletion is part of this task.

**CI handoff:** `production-artifact` is separate and blocking, uses exact Node/npm, `npm ci`, Chromium, strict `npm run typecheck`, one explicitly empty-origin build, provenance, and compiled tests against that same `dist`. Existing UI/science/four-project browser gates remain. The `always()` upload has 14-day retention, immutable name `frontend-production-${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}`, and retains `dist/`, `artifacts/production/`, `playwright-report/production-4185/`, `test-results/production-4185/`; warnings for missing files cannot turn failing checks green. A future deployment must promote this tested artifact/config pair rather than rebuild it. Hosted workflow execution/upload, required branch checks, staging routing/authentication, host selection, rights/privacy acceptance, promotion and rollback drill all remain NOT RUN release holds.

## NOT in scope

- Reimplementing the eight merged fixes, general UI redesign, controller rewrites, new telemetry exporters or server-authoritative simulation.
- Upgrading gstack, npm packages or changing the toolchain; the user chose to defer the tool update.
- Changing physics, event precedence, rendering fidelity, distribution rights or data-provider policies.
- Choosing a production vendor, publishing, changing branch protection, creating a PR or merging remotely. Those require operational context and authority.

## Review provenance and reality checks

Primary references: [Playwright managed servers](https://playwright.dev/docs/test-webserver), [Vite compiled preview versus production hosting](https://vite.dev/guide/static-deploy.html), [W3C modal interaction](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). The design uses existing, established tooling; no new architectural pattern or service is introduced.

REALITY: premise-table pass Current-state matrix separates historical facts from runtime acceptance; docs/superpowers/plans/2026-11-02-frontend-production-readiness.md:50
REALITY: already-done pass Controllers and blocking browser matrix are reused at c842196; .github/workflows/frontend-ui.yml:26
REALITY: surface-check pass Existing npm commands read from package.json; preview command checked against Vite documentation; package.json:10
REALITY: binding-decisions pass Preserve current runtime and scoped local development; docs/superpowers/plans/2026-11-02-frontend-production-readiness.md:15
REALITY: numbers pass Tool versions are lockfile facts; test budgets are explicit proposals, no performance claim; package-lock.json:1
REALITY: deferred-asks pass All eight original outcomes retained; manual and deployment evidence are visible gates; docs/superpowers/plans/2026-11-02-frontend-production-readiness.md:50
REALITY: pr-count pass One branch/PR candidate, serial commits, no external publication in scope; docs/superpowers/plans/2026-11-02-frontend-production-readiness.md:82

Unverified production premises: hosting, deployed configuration, AT/device acceptance and release ownership. These are release holds, not asserted facts. No estimates of engineering time or quantified performance gains are used.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---|---|---|
| CEO | Not invoked | No product-direction change | 0 | NOT RUN | Existing eight outcomes retained |
| Engineering | gstack plan engineering + Superpowers planning | Current-state reconciliation and executable release proof | 1 | LOCAL G0/G1 VERIFIED | Artifact gap and reproduced reflow bug closed; final independent review approved |
| Specialist evidence | Three GPT-6.1 Sol xhigh read-only agents | Independent accessibility, camera/event and release inspection | 1 | SOURCE REVIEW | 519c894 evidence; primary-agent delta review at c842196 |
| Outside provider | Claude Code availability probe | Optional cross-provider challenge | 0 | UNAVAILABLE | No resolvable Claude CLI; no external review claimed |
| Task reviews 1–4 | Independent task reviewers | Inspect authored task deltas and evidence | 4 | CLEAN | Coordinator ledger records each completed task review; no whole-branch result inferred |
| Whole-branch final review | Independent GPT-6.1 Sol xhigh reviewer after Task 5 commit | Eight findings, semantics, artifact/type/CI boundary and Task 5 evidence | 1 | CLEAN | Approved `c842196..76a8b0f`; 0 Critical, 0 Important, 0 Minor findings |
| Design / AT | Compiled axe plus retained device/AT runbook | Human acceptance still required | 0 human | NOT RUN | Automated 0 violations leaves 29/21/21/8 contrast nodes incomplete; G2 remains held |

**VERDICT:** Local implementation, automated G0/G1 evidence and independent whole-branch review are complete with exact identities and limits above. G2 human contrast/AT/device acceptance and G3 hosted release prerequisites remain NOT RUN release holds. No WCAG certification, live-provider acceptance, production-ready or commercial-distribution sign-off is claimed.

**UNRESOLVED DECISIONS:**
- Accessibility/product reviewers must resolve manual contrast, NVDA, VoiceOver, physical input and OS text-scaling acceptance; native visibility and hardware/EGL coverage remain explicitly unrun.
- Release owner must name the environment and backend routing, verify hosted blocking CI/upload/protection, review rights/privacy, and approve artifact promotion plus a completed rollback drill before production sign-off.
