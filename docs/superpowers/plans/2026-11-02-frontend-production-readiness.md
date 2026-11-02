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

| Original finding | Current source/test evidence | Disposition for this iteration |
|---|---|---|
| 1. Reflow | `src/style.css` removes the body minimum and supplies narrow/short flow; `reflow.spec.ts` and genuine `tab-zoom.spec.ts` exist | Preserve; add built-app narrow-content reachability; retain manual OS text-size check |
| 2. Camera keyboard/tap input | `viewportCameraController.ts`, production Z-up setup and ten native buttons; unit, scene-setup and browser tests exist | Preserve; prove built-app key/tap response without fixture state |
| 3. Live output | `timeController.ts` equality guards; `explorerController.ts` count deduplication; `explorer.spec.ts` mutation checks | Preserve; include built-app zero-result and same-count selection flow; speech still needs AT |
| 4. Modal drawer | `panelController.ts` owns focus, isolation, Tab and Escape; synchronous transition tests exist | Preserve; prove real composition after bundling; virtual navigation remains manual |
| 5. Breakpoint focus | Current controller uses `isMobileLayout`, resize/visualViewport signals and bounded settle recheck; native zoom coverage exists | Preserve newest race fixes; no replay of older extraction task |
| 6. Mobile detail | Native picker policy, measured row fallback, 24px normal-phone canvas strip and touch hint exist | Preserve; measure relevant built controls; physical picker/pinch remains manual |
| 7. Event messaging | `experimentController.ts` consumes `resolveAgnSelection`; direct engine tests pin preset ownership | Test real resolver wiring, not the old energy-only fixture contract |
| 8. Regression coverage | Vitest, strict type checks, axe and four blocking browser projects exist at `c842196` | Extend for compiled artifact; do not recreate infrastructure or remove blocking status |

Source receipts: historical review line 9 says “eight original issues remain actionable”; current `src/style.css:59` says `min-width: 0`; current experiment controller line 46 sets `Event preset`; engine lines 65 onward resolve the named preset. At `c842196`, `playwright.config.ts` still starts `node node_modules/vite/bin/vite.js`, while `.github/workflows/frontend-ui.yml` now has a blocking browser matrix. These are static receipts, not fresh browser results.

### Readiness levels and owners

| Gate | Accountable role | Required evidence | Can local coding continue if absent? |
|---|---|---|---|
| G0 reproducible baseline | Implementer | Exact source/lock/toolchain; clean-install unit/type/build results | No, resolve environment before interpreting failures |
| G1 code verified | Implementer + independent reviewer | Existing suites, new compiled gate, no new errors/skips; inspected diff | Fix confirmed failures first |
| G2 accessibility accepted | Accessibility reviewer + product owner | NVDA/Chrome, VoiceOver/Safari, physical touch/native picker, text resizing with versions and findings | Yes; no complete accessibility claim |
| G3 operational release | Release owner | Named host/environment, exact backend origin, rights/privacy review, deployed artifact identity, rollback drill | Yes; no production deployment or production-ready sign-off |

Roles are responsibilities, not invented assignees. Missing release owners and deployment details remain explicit pre-release decisions. Automated axe checks cannot replace G2. Linux WebKit is not VoiceOver/Safari validation.

## Engineering review and decision record

**Scope:** retain all eight outcomes. Eight repository paths are planned, zero new runtime services/classes. This is one reviewable branch/PR candidate with multiple commits; no stacked-PR dependency. The existing architecture is retained, so there is no smaller runtime arrangement to select.

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

- [ ] Write `scripts/frontendProductionGate.test.mjs` red tests pinning the new package command, config inclusion in UI tsconfig, explicit preview command/no auto-build, isolated outputs and production test directory. Include invalid-port rejection if an override is supplied; no silent fallback. Run `npx vitest run scripts/frontendProductionGate.test.mjs`; failure must identify the missing contract, not missing dependencies.
- [ ] Implement the config/script/typecheck inclusion without altering `playwright.config.ts` or existing suites. Keep config logic small; no custom server framework.
- [ ] Write `tests/production/frontend.spec.ts` boot acceptance. Use Playwright-managed preview over a previously built `dist`. Record requests/responses, page errors and browser/renderer identity. Require successful hashed JS and worker responses, `#space-canvas[data-orbital-worker="ready"]`, the existing verified 100,000-row catalog status, working range status and no graphics-failure surface; forbid requests for `/src/`, `/@vite/`, `/node_modules/` and fixture state. Assert copied `/legal/LICENSE.txt` is served as a nonempty notice, not the SPA fallback. Local assets must not be intercepted. Route backend paths `/solar/physics`, `/solar/realtime`, `/health`, `/trajectory/*` and `/mission/*`, plus external service/font requests, to deterministic 503 responses, recording that scope. Assert backend requests use the expected preview origin so a wrong-origin build cannot pass; a request alone does not establish asset success.
- [ ] Build with `VITE_BACKEND_ORIGIN=` and the existing prebuild; run `npm run test:production`, targeted contract tests and `npm run test:types:ui`. Test must reject an unavailable/missing `dist` rather than start source Vite. Exercise that negative case with a private temporary empty preview directory, never moving or deleting user assets.
- [ ] Run full units/types and inspect the diff. Commit `test(ui): verify compiled frontend artifact startup`.

## Task 3: Prove production interaction and recovery behavior

**Files:** extend `tests/production/frontend.spec.ts`; existing production code is unchanged unless a separately reproduced regression needs its own test-backed fix.

**Interfaces:** use only accessible DOM, network/console evidence and existing browser APIs. Reuse real-app teardown. No `window.__uiFixture`, engine globals or production exports solely for tests.

- [ ] Add a real-app journey: pause; focused-canvas `+` changes Range; native Zoom button changes it while retaining focus; fill nonexistent body and verify disabled Focus/Follow and hidden card; Escape restores list before closing; Earth→Sun changes body content without extra count mutation. Preserve ordinary Ctrl/Meta shortcuts.
- [ ] Extend the same journey for actual resolver wiring: select `M87`, then `SgrA_WarpWave_H29`; assert source `SagittariusA`, hypothesis `h29`, `Event preset`, `Trigger H29 slipstream` and speculative classification. Change source/model explicitly and assert preset clears, correct button/status and no runtime error on trigger. Direct engine tests remain the mathematical/payload proof; a DOM assertion does not establish all calculations.
- [ ] Assert mobile 390x844 drawer open/close, actual focus and inert background; remembered mobile-open → desktop → canvas focus → mobile returns focus inside. At 195x422, scroll to final action and camera tools; assert relevant 44x44 author-controlled targets and no clipped/reachable-control failure. Keep detailed native browser zoom and cross-engine matrices in their existing tests.
- [ ] Add compiled no-WebGL acceptance using context denial before page load: named recovery region, nonempty error, focusable reload, disabled unavailable simulation actions and operable drawer. Record intentional failure separately from ordinary app exceptions; do not globally swallow errors. Add full-document axe to the stable built-app modal/recovery states with existing pinned rules and no new violation exclusions.
- [ ] Run production tests, relevant existing camera/experiment/panel units and UI types. Commit `test(ui): cover compiled accessibility and recovery flows`.

## Task 4: Make compiled acceptance a release-blocking CI contract

**Files:** workflow and `scripts/ci/tests/test_r3_r4_workflow.py`. The existing scientific CI invokes that test module on every push/PR; reuse its pinned PyYAML parser instead of adding a JavaScript YAML dependency or a text-matching imitation.

**Interfaces:** new job `production-artifact`, separate from existing `ui` and browser matrix. Uses exact Node/npm, clean lock install, Chromium install, strict source check, `VITE_BACKEND_ORIGIN=` build and `npm run test:production` against that same output. Timeout 15 minutes is an execution budget, not a product performance promise. No environment secrets or publish permissions.

- [ ] Add red semantic assertions to the existing Python workflow test module: parse YAML, then check job exists, no `continue-on-error`, clean install before build, build before compiled test, strict type check present, no disabled existing browser projects. Both workflow triggers must include `tests/production/**`, `public/**`, `LICENSE`, `NOTICE.md` and `docs/distribution-policy.md` so test-only and packaging-only changes run acceptance. Assertions protect named release guarantees, not incidental whitespace. Use the existing YAML `on` handling and CI pins (Python 3.12.13, pytest 9.1.1, PyYAML 6.0.3); no new dependency or lock edit.
- [ ] Add the job with `permissions: contents: read`, strict toolchain and explicit build origin. Preserve science/backend workflow and the existing four-project browser matrix. Upload test report/trace/screenshots with `if: always()`, finite 14-day retention and missing-artifact warnings that cannot replace a failed test status.
- [ ] Retain the tested `dist` directory with source SHA, lockfile SHA-256 and built asset hashes alongside results using existing shell/Node tooling in the job. Do not archive credentials, environment dumps or raw interactive user input. Keep an immutable artifact identity; a deployment must use the tested artifact, not an unverified rebuild.
- [ ] Run `python -m pytest --noconftest -q scripts/ci/tests/test_r3_r4_workflow.py` in the pinned environment, full unit/types/build and the compiled suite locally. Parsed semantic validation is not remote execution. Commit `ci(ui): gate compiled frontend acceptance`.

## Task 5: Record release evidence, manual acceptance and rollback

**Files:** this plan's execution and readiness sections. No deploy configuration is fabricated for an unknown host.

**Interfaces:** evidence row = `{source SHA, tree SHA, lock SHA, command, tool/browser/platform version, environment, result, artifact location, limit}`. Status is PASS / FAIL / NOT RUN, never an inferred pass.

- [ ] Run the final existing unit/type/build gates, new compiled gate and applicable existing browser projects from this isolated revision. Record every excluded or skipped platform case. Reuse a same-revision result only with its exact command and artifact; old baseline counts are not current evidence.
- [ ] Request one independent whole-branch review of the authored delta, excluding imported upstream changes; reviewer checks all eight traceability rows, current event/camera semantics, real artifact boundary, type policy and CI failure propagation. Fix confirmed issues in separate commits and rerun affected gates.
- [ ] Fill the manual matrix below with actual outcomes or NOT RUN. Missing AT/device access does not block completion of local code, but blocks a complete accessibility acceptance claim.
- [ ] Record deployment prerequisites and rollback drill status below; no production-ready or commercial-distribution sign-off until the release owner resolves them. Do not push, publish or change repository settings in this task.
- [ ] Verify final tracked diff, no unexpected lock/runtime edits, clean branch and evidence paths. Commit `docs: record frontend production acceptance and release gates`.

## Manual and operational acceptance runbook

| Scenario | Required observation | Owner | Initial status |
|---|---|---|---|
| NVDA + Chrome on Windows | Drawer background absent from virtual navigation; focus restored; one spoken search count; canvas instructions and controls usable | Accessibility reviewer | NOT RUN |
| VoiceOver + Safari on macOS/iOS | Same interactions, native picker, modal isolation and recovery navigation | Accessibility reviewer | NOT RUN |
| Physical touch/hybrid input | Native picker selection, pinch, tap camera controls, body-selection guidance | Device QA | NOT RUN |
| OS text scaling + browser zoom | 200% text, real 200%/400% browser zoom, reachable final actions and visible focus | Device QA | NOT RUN |
| Deployment identity | Named hosting environment and immutable tested artifact SHA; correct HTTPS backend origin and exact backend origin allowlist | Release owner | NOT RUN |
| External data/privacy/rights | Review packaged notices, SILSO restrictions, permissions-required original code, request inventory and current Google Fonts contact; no invented blanket clearance | Product/release owner | NOT RUN |
| Rollback drill | Retain previous approved artifact/config; atomically restore it on the chosen host; check worker/assets, drawer, search, camera and recovery afterward | Release owner | NOT RUN |

Release sequence: G0/G1 evidence → G2 device/AT sign-off → staging with actual routing/authentication → owner-approved promotion of the same artifact → smoke verification. A new deployment exposing startup failure, broken input, wrong backend routing or missing assets is stopped and rolled back to the previous approved artifact. Exact host commands and observation duration must be supplied by its owner before G3; this plan does not invent infrastructure.

Preserve physics/backend commits on rollback: roll back the frontend artifact/config pair, not repository history. A code correction uses a normal revert or forward fix after review, never a hard reset/force push. Browser caches must receive the prior artifact's matching HTML and hashed assets, not a mixed release.

## Execution evidence

Planning evidence only: three read-only specialist inspections at `519c894`, followed by targeted primary-agent delta inspection of `c842196`. Shared-main test output was invalidated by checkout advancement and stale dependencies. No new passing runtime baseline is claimed here. Append exact Task 1 and final-run evidence during execution.

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
| Engineering | gstack plan engineering + Superpowers planning | Current-state reconciliation and executable release proof | 1 | ISSUES MAPPED | Artifact coverage, stale assumptions and release evidence |
| Specialist evidence | Three GPT-6.1 Sol xhigh read-only agents | Independent accessibility, camera/event and release inspection | 1 | SOURCE REVIEW | 519c894 evidence; primary-agent delta review at c842196 |
| Outside provider | Claude Code availability probe | Optional cross-provider challenge | 0 | UNAVAILABLE | No resolvable Claude CLI; no external review claimed |
| Design / AT | Existing design plus retained evidence | No visual redesign; manual acceptance still required | 0 | NOT RUN CURRENT | Historical automated tests do not prove current speech/device behavior |

**VERDICT:** Local implementation can proceed under the binding constraints. Production release remains held for G1–G3 evidence. This is not a WCAG certification, live-provider acceptance or production sign-off.

**UNRESOLVED DECISIONS:**
- Release owner must name the deployment environment, artifact promotion/rollback procedure and complete manual AT/device acceptance before production sign-off.
