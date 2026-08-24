# Major-Issue Evaluation Prompt — solar-system-realistic-sim

> **How to use this file.** Everything below the horizontal rule is a self-contained prompt. Paste it into an AI coding agent (Claude Code, Codex CLI, Gemini CLI, Cursor agent, …) that has shell access to a checkout of this repository, or hand it to a human reviewer. The agent writes its report to `agent-notes/MAJOR_ISSUE_REPORT_<YYYY-MM-DD>.md`.
>
> **What this prompt is for.** This is the major-issue-focused variant of the full codebase-evaluation prompt. The objective is narrower and sharper: **find, prove, and rank every MAJOR issue in the repository** — the defects that silently produce wrong results, corrupt or mislabel data, break a contract between live components, break a clean-clone build/test/run, or make a materially false claim to the user.
>
> It keeps everything from the full evaluation that actually surfaces major issues: the measured Ground-Truth Packet (§2), the evidence standard (§4), the subsystem question banks (§6.1–6.10), the 53-item known-issue register (§8), and the reproduction appendices. Four things change:
>
> 1. **A failure-class sweep (§6.0) runs before the subsystem pass**, because the worst defects here cluster at boundaries and repeat across modules rather than sitting inside any one file.
> 2. **A layer × failure-class coverage matrix** turns "all major issues" into a checkable claim — every cell is a finding, a cleared probe, or an admitted blind spot.
> 3. **A triage rule (§4)** gives every Critical/High a full finding, compresses Mediums into one table and Lows into counts, so the majors are not buried.
> 4. **The deliverable (§9) leads with the ranked register**, and the weighted scorecard is demoted to a supporting lens.
>
> Scope note: this is an engineering-correctness review of a solar-system simulation, not a security engagement. Evaluate the deployed surface at the proportion the code warrants (FC-I in §6.0, §6.7 item 4) — name what can destroy data or pin the machine, and move on.
>
> **Provenance.** This prompt was produced on 2026-08-22 from a grounded scan of `main @ aa6e39a`: a clean-environment baseline (typecheck, build, pytest), an import-reachability analysis, git archaeology, ten subsystem deep-dives that read the code and executed extracted functions, and a direct re-check of the nineteen highest-impact claims. Every number and file:line in §2 and §8 was measured, not inferred. They will drift as the code moves — which is why the prompt makes the evaluator re-measure everything before relying on it.
>
> **Budget.** This is a multi-hour, multi-hundred-file task. Run it in a session that allows that, or run it phase by phase (§5) across sessions, carrying the report file forward. Do not ask for a "quick version" of this prompt; the value is in the evidence standard.

---

## 1. Role and mandate

You are a principal-level reviewer wearing three hats at once:

- **Software architect** who has shipped large TypeScript + Three.js front-ends and Python/FastAPI services, and knows what a maintainable module graph, a sound worker protocol, and a trustworthy build look like.
- **Astrodynamics- and solar-physics-literate engineer** who can check a Kepler solver, a universal-variable Lambert solver, a J2 secular rate, an orbital-frame rotation, a Julian-date conversion, a Hathaway cycle function, or a blast-wave scaling by hand — and who knows the difference between a visualization and a physical model.
- **Engineering lead** who cares whether this project can be built, tested, trusted, and extended by someone other than its author, and whether its documentation tells the truth.

**Primary objective — this is the point of the exercise.** Analyze and inspect the repository at the current checkout and produce a **ranked register of every MAJOR issue**, each proved to the standard in §4. A *major issue* is one a competent owner would want to know about before shipping, demoing, teaching from, or drawing a scientific conclusion from this code: a defect that silently produces wrong results, corrupts or mislabels data, crashes or hangs on realistic input, breaks a contract between two live components, leaks resources without bound, breaks a clean-clone build/test/run, or makes a materially false claim in the code, UI, or docs. You are asked to **cast a wide net** — hunt for major issues in every layer and boundary, not only the ones already catalogued in §8 — and to **prove each one**.

"**All** major issues" is a strong claim, and this prompt makes you earn it rather than assert it: you sweep by failure class across the whole codebase (§6.0) *before* going module by module, and you fill a layer × failure-class coverage matrix in which every cell is either a finding, a cleared probe, or an explicitly admitted blind spot. Completeness of the **major** set is the bar — a missed Critical is a failure of this evaluation; a missed Low is not.

**Secondary objective.** Record Medium and Low issues compactly (§4 triage) so the register is complete without burying the majors, and give a short maturity verdict and trust statement. The full weighted scorecard (§7) is retained as a supporting lens, not as the headline deliverable.

**Constructive, not soft.** Every problem you raise comes with the evidence that proves it, the consequence if ignored, and a concrete, scoped fix. Where code or documentation makes a claim that is not true, say so plainly and cite the proof.

Calibration: this is a solo-author, heavily AI-agent-assisted research and visualization project (the repo contains work logs from several coding agents), not a production service. Judge it against "can a competent second engineer pick this up and trust it," not against enterprise SLAs. But **do not lower the evidence bar or under-call severity** — the author wants to know what is actually true about this codebase, not what the README says.

## 2. Ground Truth Packet (measured 2026-08-22 on `main @ aa6e39a`)

These are starting facts, not conclusions. **Re-run every measurement in Phase 0** and report drift in a column next to each number. If the checkout is a different commit or branch, say so in the report header and re-measure before relying on anything below.

**Stack and size**
- Frontend: Vite 7 (`^7.2.4`), `three@^0.182.0`, TypeScript 5.9, ES2022/ESM. No `vite.config.*`, no linter, no formatter, no frontend test runner on `main`. One Web Worker (`src/workers/modelWorker.ts`), spawned unconditionally at `src/main.ts:1031`.
- Backend: FastAPI + uvicorn + WebSocket, REBOUND (`rebound>=4.0.0`, unpinned — a clean install resolves **5.1.1**), optional TudatPy (commented out). `backend/requirements.txt` **does not list `httpx`**, which `fastapi.testclient` requires, so from a clean install three test modules (21 tests) fail at collection.
- Source: 63 `.ts` files ≈ 19.6k LOC (plus a 9,330-line `moons.json`), 54 `.py` ≈ 11.5k LOC, 85 `.md`, 11 `.tex`, 1 `.bib`, 1 `.pdf`, 6 `.mjs`, 1 stray `.js`. Git pack 46.6 MiB; `src/assets/textures` ≈ 39 MB of JPG/PNG (25 files, up to 8192 px) that **no reachable code loads and `vite build` does not emit**; `public/data/asteroid-phase1/*.bin` (3.4 MB) has three historical blob versions (12.2 MB of pack).
- Single author, 294 commits on `main` (2026-02-08 → 2026-03-07, 28 days); 363 commits across refs.

**Build / type / test health**
- `npm run typecheck` (`tsc --noEmit`) **fails with 1,300 errors in 28 files**: TS7006 ×439, TS2339 ×438, TS7031 ×188, TS18047 ×90, TS7005 ×79, TS7034 ×30, other ×36. Worst files: `features/planetary/satelliteSystem.ts` 311, `sunController.ts` 109, `cloudDataPipeline.ts` 91, `smbhPropagation.ts` 81, `main.ts` 72, `labelSystem.ts` 70, `solarPhysicsClient.ts` 60, `agnShockwaveEngine.ts` 55, `sunVisuals.ts` 51. README claims "Strict type checking is now active on every source file"; the `// @ts-nocheck` directives were removed in fifteen commits on 2026-03-06 that added **zero** type annotations (each is `N files changed, N deletions`).
- **438 of the 1,300 errors are in the 30 files reachable from `main.ts`** (7 files: `sunController` 109, `smbhPropagation` 81, `main` 72, `solarPhysicsClient` 60, `agnShockwaveEngine` 55, `sunVisuals` 51, `solarObservationTexture` 10); 862 are in unreachable modules. `origin/sun-focus` still has **344** errors.
- `npm run build` **succeeds** (Vite does not type-check): `index-*.js` 848.57 kB (gzip 209.85 kB) + `modelWorker-*.js` 18.4 kB + CSS 6.5 kB. The main chunk **contains the worker's top-level `self.onmessage` handler** (1 hit) because `main.ts:42-50` value-imports `buildCatalogIndexContract` from the worker module.
- Backend: `pytest` → **48 passed in ~0.5 s** (12 modules, not the 13 README claims) once `httpx` is installed. **Zero tests open `/ws/sim` or instantiate a real `rebound.Simulation`**; `test_seek_optimizations.py` fakes `ri_ias15`, which masks the REBOUND 5 break (K-01). `GET /benchmark/accuracy` returns **0/3 scenarios passing** (errors 0.85 / 32.9 / 34.7 km/s against tolerances 0.45 / 0.40 / 0.70), and `python -m mission.epo.smoke_test --compact` reports **0/30 episodes passing**.
- Frontend tests on `main`: none runnable. `src/data/asteroidCatalogLoader.test.ts` is a 5-line re-export with no runner and no importer; when the function it wraps is actually executed, it **fails** (99,916 / 100,000 records mismatch; see K-16). Root-level `testWarp.js`, `testRealisticScale.mjs`, `get_errors.mjs` import `puppeteer`, which is not in `package.json`; they use three different ports (5173/5174/5175) and `testRealisticScale.mjs:11` hardcodes `/home/nomad/.gemini/antigravity/...` as its output dir.
- Two documented scripts are broken by the TS migration: `scripts/ingest-moon-textures.mjs:5` imports `moonTextureCatalog.js` (only `.ts` exists → `ERR_MODULE_NOT_FOUND`); `scripts/fetch_jpl_sbdb.py:36` targets `src/data/planets.js` (deleted) and crashes **after** mutating `backend/data/bodies.py`.

**What actually runs (reachability from `src/main.ts`)**
- **30 files / 11,329 LOC reachable**: `main.ts`, `sunController.ts`, `constants.ts`, `textures.ts`, `data/{planets,asteroidCatalogLoader}.ts`, `sim/{orbitMath,solarSystemModel,catalog,asteroidBelt,kuiperBelt,phase1AsteroidCatalog}.ts`, `workers/modelWorker.ts`, `frontend/app/{bodyManager,sceneSetup,stateStore,timeController,textureManager}.ts`, `frontend/features/asteroids/beltRenderer.ts`, `frontend/features/solar/{sunVisuals,solarFeatureBlending,solarFlares,solarMagnetics,solarObservationTexture,solarPhysicsClient,gravitationalWaves}.ts`, `frontend/features/superluminal-modeling/*` (4 files).
- **32 files / 8,275 LOC (42%) unreachable** — nothing imports them on `main` *or* on `sun-focus`: `frontend/app/{animationLoop,cameraController,inputHandler,labelSystem,localSystemRenderer,nearbySystemsRenderer,plannerController,routeRenderer,simulationClient,uiBindings,temp_nearbySystemsRenderer}.ts`, `frontend/camera/transitions.ts`, all of `frontend/features/planetary/*` (7 files incl. the 1,001-line `satelliteSystem.ts`), `frontend/features/trajectory/*`, `frontend/rendering/*`, `frontend/features/solar/{solarProminences,solarWind}.ts`, `sim/asteroids/*` (4 files), `data/asteroidTaxonomyResolver.ts`, `data/asteroidCatalogLoader.test.ts`. `temp_nearbySystemsRenderer.ts` (1,127 lines) is a 619-line block comment followed by a **byte-identical copy** of `nearbySystemsRenderer.ts`. Of the 50 `dom.*` handles the dead UI modules dereference, **36 have no element** in the current `index.html`; 15 module-level constants they destructure (e.g. `PC_TO_AU`, `LOCAL_SYSTEM_MANIFEST_BY_NEARBY_ID`) exist nowhere on `main` (last seen in the deleted `main.js`).
- `index.html` is titled **"Sun Model Lab" / "Sun-Focus Branch"** (commit `d1484e8`, 2026-02-23) with 31 ids: Time, Display (orbits / magnetic field / labels / realistic scale / AIA channel), Navigation, Explorer (`<select>`, no search), and "Cataclysmic Events" (SMBH/AGN: source, preset, propagation model incl. "H29", observer-frame checkbox **on by default**, stochastic flaring, trigger). The README's planner, engine selector + Connect, satellites, clouds, Milky Way modes, nearby-systems navigation, moon/asteroid/Kuiper/Oort toggles, gravity vectors, realism locators, and body search **do not exist in the shipped UI on either branch**. `src/main.js` went from 4,404 lines to 614 in commit `04e99a4` (2026-02-23, +400/−4190) — the prior "monolith" was replaced, not decomposed — and **no entry in either rolling log records this decision**.
- On `main` the live app renders **10 bodies** (`showMoons = false` at `main.ts:380`; the 424 moons are loaded, propagated in the worker every frame, and discarded), flat-colour `MeshStandardMaterial` planets (`main.ts:283-285`, no textures/rings/normal maps), **6,000 `Math.random()` white points** as "stars" (`main.ts:358-372`; `stars_catalog.json` is unreferenced), a 15,000-asteroid GPU belt, a 5,000-body CPU Kuiper belt, and the Sun stack. The only backend calls the live frontend makes are `GET /solar/physics` (polled every 900 ms, ~509 KB per response) and `GET /solar/realtime/aia-tile`; there is **no code path on either branch that connects to the backend WebSocket**.
- DOM wiring on the live path is clean: all 28 `getElementById` ids used by `main.ts` exist in `index.html`, every listener is null-guarded.

**Branches**
- `main @ aa6e39a` (2026-03-07). `origin/sun-focus @ fd793f4` (2026-07-25) is **69 commits ahead, 7 behind** (merge-base `c3b00e0`). `sun-focus` adds `vitest` + `npm test`, `src/sim/{catalog,orbitMath}.test.ts`, `src/frontend/app/stateStore.test.ts`, `backend/sim/pfss_magnetogram.py` (1,193 lines), three more backend test modules, `features/planetary/{planetShaders,quadtreeLOD,satellitePropagationCore}.ts`, +520 lines in `sunVisuals.ts`, secular rates in `orbitMath`/`planets.ts`, a Lambert TOF-residual guard, a `no-cache` fix for the asteroid meta fetch, velocity-unit/frame fields on the WS contract; deletes `temp_nearbySystemsRenderer.ts` and the fake test; still carries every root clutter file, the 39 MB textures, the `ri_ias15` break, the orbit-normal sign flip, the dead stack (re-typed at +1,824 lines but still unwired), 344 tsc errors. **The active line of development is `sun-focus`; `main` is ~5½ months stale and the README on `main` does not say so.**

**Backend surface**
- HTTP (17 routes): `/health`, `/info`, `/bodies`, `/solar/{capabilities,realtime,realtime/aia-tile,physics}`, `/nearby-systems[/{ref}]`, `/trajectory/{capabilities,plan,lambert,porkchop}`, `/mission/{capabilities,plan}`, `/benchmark/accuracy` (GET) and `/benchmark/accuracy/report` (POST — **writes/overwrites any `.md` under `my-notes/`**). WebSocket `/ws/sim`.
- `CORSMiddleware(allow_origins=["*"], allow_credentials=True, …)` (origin is reflected with credentials), no authentication, no rate limiting, binds `0.0.0.0:8042`. Sim runner = one `threading.Thread` per connection + bounded `queue.Queue`s + `threading.Lock`, bridged to `asyncio` send/receive tasks; thread/async boundary is sound, but lifecycle is not (K-24, K-25, K-50). 35 `except Exception` / bare-except sites in `backend/` (13 in `server.py`).
- Measured: IAS15 init 41 bodies 1.0 ms; 0.51 ms/frame at 365 d/s; relative energy error 9.8e-16 after 1 yr; Kuiper sub-sim 3,000 particles costs 14.6 / 43.7 / 495 ms per frame at 4 / 30 / 365 d/s (frame budget 16.7 ms).

**Code-quality counters (`src`, `main`)**: explicit `any` 4; `@ts-ignore` 0; `@ts-nocheck` 0; `TODO/FIXME` 0; `console.*` 8; non-null assertions 3; `fetch(` 13; duplicate utility definitions: `solveKepler` ×3, `solveKeplerFast` ×2, `mulberry32` ×6, `clamp` ×5. External hosts: astrogeology.usgs.gov, celestrak.org, solarviews.com, gibs.earthdata.nasa.gov (frontend, mostly dead code); SWPC, SILSO (a 2.9 MB CSV re-downloaded every 120 s), Helioviewer (backend).

**The comprehensive evaluation has already been run — do not redo it; go where it could not.** On 2026-08-23 the full prompt this one derives from was executed end-to-end against `main @ aa6e39a` (`agent-notes/CODEBASE_EVALUATION_REPORT_2026-08-23.md`, plus `audit.html`). It produced the scorecard, the feature matrices, the readiness verdicts, and ~20 findings. Treat that report the same way you treat the README — **a set of claims to re-test, not evidence** — but use it to *allocate your effort*, because it names its own gaps. Spend your time preferentially on:
1. **The adversarial-verification pass that never ran** (its verifier agents died mid-run). Every major in that report is re-derived-by-one-reviewer and has never been independently refuted. Refuting or confirming them is the single highest-value thing this run can do.
2. **The checks it recorded as blocked or not-run** (its §13): MGA flyby invariants (v∞ conservation, turn-angle/periapsis, search-order bias), `/mission/plan` fuzzing, asteroid failure-mode browser tests (checksum mismatch, truncated `.bin`, missing meta, slow network, stale `force-cache`), the 8–20-connection WebSocket load test, tudatpy force-model wiring (conda-only), and real GPU timings (it measured SwiftShader only).
3. **`origin/sun-focus`, which has never been audited at all** — 69 commits ahead and the actual line of development. Its claimed fixes (Lambert TOF guard, secular rates, `no-cache` meta fetch, WS unit/frame fields, vitest suite) are unverified, and a fix that does not fix the underlying defect is itself a major issue (§10).

**Prior audits in-repo (claims to re-test, not findings)**: `solar_system_codebase_analysis_consolidated_2026-02-21_03-08-50.md` (pre-dates the 2026-02-23 rewrite; its A1 "monolith" item was resolved by deletion), `agent-notes/phase1_closure_and_hardening_todos.md` (TIER-1 items 1.1–1.3 and 5.4 are genuinely closed on `main`; the rest open), `CLAUDE_OPUS_WORK_LOG_2026-02-15.md` (Julian-date fix in `rebound_nbody.py` — still correct), `my-notes/IMPLEMENTATION_AUDIT_*.md`, `my-notes/CODEX_XHIGH_*.md`, `Development_Improvements.md` (its 2026-03-07 entry candidly lists ~1,254 tsc errors; the file violates its own 48 KB / 500-line hard cap at 48,551 B / 998 lines with no prune note).

## 3. Scope decisions — make them explicitly and record them in the report header

1. **Which commit is under evaluation.** Record `git rev-parse HEAD`, branch, date, and `git status --porcelain` (must be clean or you must list the dirt). If HEAD is on `main`, you must *additionally* run Phase 0 against `origin/sun-focus` in a throwaway worktree (`git worktree add ../ssrs-sunfocus origin/sun-focus`) and report the delta for every baseline number. End the report with a **branch recommendation**: which branch should be canonical, what in `main` (if anything) is not in `sun-focus`, and whether `main` should be fast-forwarded or replaced.
2. **Live code vs. disconnected code.** Code reachable from `src/main.ts` (and from `index.html`'s script tag and worker URLs) is evaluated for *correctness and quality as shipped*; a major issue here is a major issue, full stop. Unreachable code is evaluated as *inventory* with a per-module disposition — **keep-and-rewire / keep-as-library / archive / delete** — and its defects are reported with severity capped at Medium **for today's product**, because nothing executes them. The one exception, and it matters for this evaluation: a dormant defect that would be Critical/High **the moment the module is rewired** is a **reactivation footgun** — report it in the major register at the severity it would carry when live, with reachability set to its dormant class and the trigger stated as "on reactivation," so the future maintainer is warned *before* they flip the switch. Do not describe unreachable modules as features of the application. Keep live and dormant findings visually separable.
3. **Speculative astrophysics content.** The repo contains ~55 research documents and a runtime feature ("Cataclysmic Events": SMBH/AGN shockwaves, "H29 Metric-Frame-Dragging Slipstream", superluminal projection). You are **not** asked to peer-review the hypotheses. You **are** asked to evaluate (a) whether the UI, code comments, and docs clearly separate standard physics from speculative/educational modelling, (b) whether the *standard* parts that are implemented (light-travel time, energy/unit conversions, rigidity, gyroradius, Schwarzschild radii, blast-wave scalings, relativistic beaming) are numerically right, and (c) whether the feature perturbs or corrupts the rest of the simulation (time, orbital state, camera) when triggered.
4. **Assets and data.** Evaluate provenance, licensing/attribution, size, and whether each shipped asset is actually loaded by live code. Do not judge aesthetics.
5. **Out of scope.** Visual design opinions; rewriting code; evaluating the scientific merit of the research documents themselves; the author's choice of AI tooling. Git history is *in* scope as evidence of process.

## 4. Evidence standard (non-negotiable)

- **Every finding** has: a stable ID (`F-###`), `file:line` (repo-relative), ≤10 lines of quoted code, a classification **VERIFIED** (you read the full relevant code path or executed something that demonstrates it) or **SUSPECTED** (you have a concrete reason but did not close the loop — say what would close it), a severity per the rubric, the impact, a concrete fix (what changes in which file), an effort tag (S ≤ 1 h, M ≤ 1 day, L > 1 day), and a reachability flag (LIVE / UNREACHABLE / BACKEND / SCRIPT / DATA / DOC).
- **Every *major* finding additionally has**, because these are the ones someone will act on: the **failure class** (FC-A…FC-K, §6.0); a **reproduction** — the exact command, request body, or test input, runnable by someone who has only this repo; **expected vs. actual**, with numbers where the defect is numerical; the **root cause** in one sentence (the wrong line, not the symptom); the **user impact** and, where they differ, the **scientific impact** (what conclusion someone would draw that is wrong); an **acceptance test** — the specific check that must pass before the finding is closed, phrased so a script can run it; and the **refutation-pass outcome** (Phase 4).
- **Severity rubric.** *Critical*: produces wrong results silently, corrupts or mislabels data, exposes the host (SSRF, arbitrary file write, unauthenticated destructive endpoint), or prevents a clean-clone build/test. *High*: wrong under common inputs, crashes, protocol/contract mismatch between two live components, resource leak that grows unbounded, claim in README/UI that is materially false. *Medium*: degraded fidelity, maintainability trap (hidden coupling, duplicated logic with drift), measurable performance waste, missing validation at a boundary. *Low*: hygiene, naming, dead files, stale comments.
- **Major = Critical + High. Those are the target of this evaluation, and the triage rule keeps them from being buried.** Report **every** Critical and every High as a full individual finding (the format above), no matter how many there are; a dormant-code defect that would be Critical/High on reactivation is reported at full severity with the reachability flag set to its dormant class and the trigger noted as "on reactivation" (do not inflate live severity for it, but do not hide it by capping it either — §3.2). Report **Mediums** in a single compact table (ID, `file:line`, one-line description, one-line fix, effort); promote a Medium to a full finding only when it compounds into a major issue. Report **Lows** as category counts (e.g. "duplicate `mulberry32` ×6; 8 stray `console.*`; 3 stale absolute doc links"), not as individual findings, unless a Low masks a major issue. Completeness of the major set is demonstrated by the §6.0 coverage matrix and the file-coverage appendix, not by padding the count with minors.
- **One root cause, one finding.** Consolidate duplicates: if the same defect surfaces in five places, that is one finding listing five sites, not five findings. If two symptoms share a root cause, merge them and say so. Conversely, do not bundle two independent defects under one ID because they live in the same file — a reviewer must be able to fix, test, and close each finding separately.
- **Completeness is argued, not asserted.** "All major issues" is a claim you must support. Fill the §6.0 coverage matrix (layer × failure class) and mark every cell **found / cleared / not-inspected**, with the probe that cleared it. A cell marked *cleared* means you actively looked and can say what you looked at; *not-inspected* is an honest gap and belongs in the report's "Not inspected" section. An empty cell is not an option. A reader must be able to see exactly where you hunted and where you did not.
- **Numbers must be shown.** Any physics or numerical claim includes the arithmetic or the command and output that demonstrates it. Write a 10-line script and run it rather than reasoning about floating point in prose. Pure-TS numeric modules (`orbitMath`, `catalog`, `smbhPropagation`, `asteroidCatalogLoader`, `localPlanner`, the TLE parser) can be bundled with the repo's own esbuild (`node_modules/.bin/esbuild --bundle --platform=node`) and run under Node without a browser.
- **Documentation is input, not evidence.** Nothing in README, `Development_*.md`, work logs, or prior audits counts as verification. It counts as a claim to be tested (§7 dimension 11, §9 item 7).
- **Dead code is not a feature.** If a module is unreachable, say so in the first sentence of anything you write about it.
- **Record what you ran.** Every command whose output you rely on goes in Appendix A of your report with an output excerpt. Every file you opened goes in the coverage matrix (Appendix B). Every subsystem you did *not* inspect goes in "Not inspected" with the reason.
- **Adversarial self-check before publishing — mandatory for every major.** For each Critical/High finding, spend a dedicated pass trying to *refute* it (wrong line? guard elsewhere? actually unreachable? impact overstated? branch-specific? already fixed upstream?). Downgrade or delete what does not survive. State in each finding that this pass ran and what it found. **Do not publish a major finding that has not survived a refutation attempt** — a false major costs the owner more than a missed Medium, because it burns the credibility of the whole register. (Note: the 2026-08-23 run could not complete this pass — its verifier agents died mid-run — so the prior report's majors are re-derived-by-one-reviewer, not independently refuted. Closing that gap is part of this run's job.)

## 5. Method — five phases, in order. Do not skip Phase 0 because §2 already has numbers.

**Phase 0 — Clean baseline (reproducible).** Fresh `node_modules` and a fresh venv. Record tool versions. Run and capture (scripts in Appendix A): `npm ci`; `npm run typecheck` (save full output; histogram by file and by code; split by reachability); `npm run build` (chunk sizes; `grep -c self.onmessage dist/assets/index-*.js`); `pip install -r backend/requirements.txt` (note what is missing); `cd backend && pytest -q` (collection errors, timings, warnings); the reachability script; the DOM-id cross-check; `git log -20`, ahead/behind counts vs `origin/sun-focus`, `git diff --stat main origin/sun-focus | tail -1`; sizes of `.git`, `src/assets`, `public`; with the backend running: `GET /benchmark/accuracy` pass count, `python -m mission.epo.smoke_test --compact`, and a `/ws/sim` handshake with the default integrator (expect K-01). If any of these cannot run, record why — that is itself a finding.

**Phase 1 — Map.** Produce (in the report) a module-graph summary: entry points (`index.html` → `src/main.ts`; worker URLs), the runtime data flow (`planets.ts`/`moons.json` → `catalog.ts` → `SolarSystemModel` / `modelWorker` → `bodyManager`/`main.ts` → scene), the solar pipeline (`solarPhysicsClient` → backend `/solar/*` → `sunController` → `sunVisuals` shaders), the asteroid pipeline (`scripts/*.py` → `public/data/asteroid-phase1/*` → `phase1AsteroidCatalog.ts` → `beltRenderer.ts` GPU Kepler shader), the SMBH pipeline (`index.html #agn-*` → `main.ts` → `agnShockwaveEngine` → `sunController` callbacks, and `smbhPropagation.metricFrameDragPeak` → `SolarSystemModel.applyMetricKinematics` on both the local and worker paths), the backend request/WS flow, and the documentation inventory (canonical / log / research / duplicate). Identify every external network host contacted by live code and by the backend, and every wall-clock vs simulation-clock dependency (which visuals advance when the sim is paused).

**Phase 2 — The hunt. Two passes, in this order.**

*Pass A — failure-class sweep (§6.0).* Go class by class across the whole codebase: units/frames/time scales/precision, boundary contracts, lifecycle, input handling, gates, claims, data provenance, resources, exposure, reactivation footguns, speculative containment. This pass catches the mistakes that repeat across modules and cluster at boundaries — historically the most consequential majors here. Start the §6.0 coverage matrix now and fill it as you go.

*Pass B — subsystem deep-dive (§6.1–6.10).* Read full files for anything under ~700 lines, and every function that touches numerics, protocols, frames, units, time scales, or state for larger ones. Answer every question in the bank with `file:line` evidence or "not applicable — because …".

In both passes, **actively try to break the thing** rather than reading for comprehension: feed invalid, extreme, reversed-time, high-eccentricity, huge-jump, and concurrent inputs; propagate returned states and check closure; recompute independently and diff; compare engine outputs against each other and against an authoritative oracle (JPL Horizons/SPICE, REBOUND, pykep/Izzo). Use §8 as a **floor** — a checklist of known majors to re-confirm or refute — and keep hunting past it: the objective is the majors §8 missed, not a re-listing of §8.

**Phase 3 — Runtime probe.** Start the dev server (`npm run dev`) and, if a headless browser is available (`npx playwright` or puppeteer — neither is a declared dependency; installing one temporarily is acceptable, record it), load the page, capture console errors/warnings and failed network requests over 30 s, toggle each control in `index.html`, press Pause and observe which visuals still move, toggle Realistic scale and Focus on Earth and on Pluto, trigger an SMBH event under the H29 preset **and** the H29 propagation model and note whether the violet warp mesh ever appears, and capture screenshots. Start the backend (`uvicorn server:app --port 8042`) and `curl` every GET endpoint plus one valid and one invalid body for each POST; open `/ws/sim` with a 10-line client and record the first two messages and the effect of `pause` / `set_time_scale` / `set_julian_date` / `get_orbital_elements` for `body_id: "sun"`. If no browser is available, say so and do only the backend part — do not fabricate runtime observations.

**Phase 4 — Adversarial self-review (mandatory; the register's credibility rests on it).** Re-read every Critical/High finding with the stated intent to **refute** it. Check line numbers against the current file. Check callers for guards you missed. Check reachability. Check branch specificity. Check that the fix you propose does not break a caller you did not read. Downgrade or delete what does not survive, and record the outcome in each finding. No major is published unrefuted (§4).

**Phase 5 — Synthesize.** Rank the surviving majors, consolidate duplicates to one-root-cause-one-finding, complete the §6.0 coverage matrix (every cell found / cleared / not-inspected), build the claims-vs-reality table, write the disconnected-code inventory and the roadmap, score the rubric (§7) as a supporting lens, and write the executive summary *last*. Before you publish, re-read the matrix and ask the closing question: **given these cells, what class of major issue could still be hiding, and is that gap stated in "Not inspected"?**

## 6. Inspection guide — failure-class sweep (§6.0) then subsystem banks (§6.1–6.10)

This is the instrument for the major-issue hunt: each question below points at a place a major issue can hide (a silent wrong result, a contract mismatch, a resource leak, a false claim). For each subsystem: purpose, key modules with LOC, what is live vs unreachable, strengths with evidence, defects, domain-specific concerns, test coverage, and answers to the question bank. The banks are **minimums** — the objective is *all* major issues, so add every question the code raises and follow each lead until you can either raise a proved finding or clear it. Line numbers are as of `main @ aa6e39a`.

### 6.0 Cross-cutting failure-class sweep — run this **first**, and use it to prove coverage

Subsystem-by-subsystem reading finds the bugs that live inside a module. The majors in a codebase like this one cluster at **boundaries and in classes of mistake that repeat across modules** — which is why you sweep by failure class first, then go module by module. Each class below gives the probe and the bar for calling it major.

- **FC-A · Silent wrong results** — the highest-value class in a simulation, because nothing crashes and nobody notices. Probe: recompute independently (by hand, a 10-line Node/Python script, or an oracle — Horizons/SPICE, REBOUND, pykep) and diff. Hunt specifically for: unit mixups (AU/day vs AU/yr, m vs cm, deg vs rad, GeV vs GV), frame errors (ecliptic vs equatorial vs ICRF, heliocentric vs barycentric vs parent-relative, orbit-normal sign, node/periapsis re-referencing), time-scale errors (UTC vs TT vs TDB, JD vs days-since-J2000), precision loss (fp32 holding an absolute JD ≈ 2.46e6 → 0.25 d ULP; fp32 holding AU-scale positions), and mean-vs-osculating element misuse. **Major bar:** the displayed or returned quantity is wrong by more than its own stated tolerance, or by an amount a user would act on.
- **FC-B · Boundary contract mismatch** — two live components that disagree. Probe: for every boundary (worker↔main, frontend↔backend, engine↔engine, writer↔reader, producer↔consumer), write down units, origin, frame, epoch, time scale, dtype, and nullability **on both sides**, then diff the two columns. **Major bar:** the two sides disagree and the disagreement reaches a user-visible or downstream-consumed value.
- **FC-C · State and lifecycle** — Probe: disconnect mid-work, reconnect, double-connect, error-then-resume, pause-then-seek, run for an extended period while watching RSS/handles/GPU objects. Hunt for: latched error state nothing clears, threads that outlive their client, unbounded caches/checkpoints, listeners never detached, geometries/materials/textures never disposed. **Major bar:** unbounded growth, a zombie that consumes CPU after its owner is gone, or a state machine that can enter a stuck state a user cannot exit.
- **FC-D · Input handling and failure modes** — Probe: feed invalid, extreme, degenerate, and adversarial-but-plausible inputs (TOF that admits no solution, e ≥ 1, period 0, reversed time, 10-Myr jump, backend down, WebGL absent, worker blocked, truncated/checksum-failing data, slow network). **Major bar:** the system returns a confident wrong answer (HTTP 200 with garbage, a silent fallback presented as real data) rather than an error or a labelled degradation. *Silently substituting synthetic data for real data is always major.*
- **FC-E · Gates and reproducibility** — Probe: build and test from a genuinely clean clone in a fresh environment. Hunt for: undeclared dependencies, unpinned ranges that resolve to a breaking major version, a gate that never runs (`tsc` that nothing enforces), and **tests that mock away the very thing that is broken**. **Major bar:** a second engineer cannot reproduce the working state from the repo alone, or a green suite conceals a real break.
- **FC-F · False claims** — Probe: take each substantive README/UI/doc claim and verify it *in the built bundle and the running browser*, never by file existence. **Major bar:** the claim would cause a user to believe the software does something it does not, especially anything touching correctness, fidelity, validation, or data provenance. ("Strict typing everywhere" over 1,300 tsc errors; "validated"/"high-fidelity" over an unvalidated model.)
- **FC-G · Data and provenance integrity** — Probe: recompute checksums; regenerate the artifact into a temp dir and byte/semantically compare; trace every committed binary to a source, version, license, and regeneration command. Hunt for synthetic values presented as measured (invented albedos, hashed radii, taxonomy assigned by orbital position), selection bias in a rendered subset, and unreproducible "reference" data. **Major bar:** data is mislabeled as to origin or accuracy, cannot be regenerated, or is redistributed without a license.
- **FC-H · Resource and performance** — Probe: measure, do not eyeball — frame-time percentiles, per-frame allocations and uploads, payload sizes × poll rates, work that scales with a user-supplied parameter. **Major bar:** unbounded work reachable from a request, or a per-frame cost that makes the shipped product unusable on its target hardware.
- **FC-I · Exposure** — proportionate to what this is: a locally run simulation, not a production service. Probe the deployed surface only for defects that would bite the author or a LAN peer: an unauthenticated endpoint that **writes or overwrites files**, unbounded compute reachable by request, credentialed wildcard CORS, and any external-fetch amplifier. **Major bar:** a remote page or LAN host can destroy data or pin the machine. Do not extrapolate into a threat model this project does not have, and do not pad the register with hardening suggestions for a dev-only posture that the report has already characterized once.
- **FC-J · Reactivation footguns** — Probe: for each unreachable module, ask "if someone wired this tomorrow, what breaks?" — missing DOM handles, constants that no longer exist, wrong parsing, wrong physics, leaked sockets. **Major bar:** it would be Critical/High when live (§3.2); record the trigger, not a live severity.
- **FC-K · Speculative-content containment** — Probe: trigger the speculative feature and instrument baseline state (positions, time, camera, worker sync) before/during/after; check every place a user sees it for a fidelity label. **Major bar:** speculative state mutates baseline physics or results, or a hypothesis is presented to the user as peer of the standard model with no label.

**Coverage matrix (required in the report; this is how you substantiate "all major issues").** Build a table with the ten layers as rows — (1) frontend runtime core, (2) orbital model & catalog, (3) solar subsystem, (4) SMBH/superluminal, (5) asteroid/Kuiper pipeline, (6) backend server & engines, (7) backend trajectory/mission/benchmark, (8) build/test/tooling/scripts, (9) docs & claims, (10) dormant stack — and FC-A…FC-K as columns. Fill every cell with **finding IDs** (majors found), **`cleared: <probe>`** (you looked, with what), or **`not-inspected: <why>`**. Cells that are structurally inapplicable are `n/a` with a reason. The matrix, not the finding count, is your completeness argument — and the `not-inspected` cells are the honest statement of this evaluation's limits.

**Where the majors have historically been in this repo** (prior-round yield, use to prioritize, not to limit): FC-A and FC-B produced the most consequential findings (frames, units, precision, mean-vs-osculating), FC-E and FC-F the most *actionable* ones (broken gates, false claims), FC-D the most user-visible ones (confident garbage from infeasible inputs). Sweep all eleven anyway — the point of this run is the ones the last one missed.

### 6.1 Frontend runtime core — LIVE
**Scope:** `src/main.ts` (1,083), `src/sunController.ts` (460), `src/workers/modelWorker.ts` (229), `src/frontend/app/{sceneSetup,bodyManager,stateStore,timeController,textureManager}.ts`, `src/constants.ts`, `src/textures.ts`, `src/style.css`, `index.html`.
1. Why does `main.ts:42-50` value-import from the worker module, and what does `grep -c self.onmessage dist/assets/index-*.js` return after a build? What is `window.onmessage` on the live page, and what happens if an embedding frame posts `{type:'init'}`?
2. Is the model worker net-positive? Time `SolarSystemModel.update()` on the 434-body catalog (≈94 µs measured), compare with the per-frame 434-record unpack loop (`main.ts:733-812`), the 12 KB transfer, and the Float32 rounding at `modelWorker.ts:122` (ULP 571 km at Pluto's 35.6 AU — 48% of Pluto's radius — while realistic mode renders Pluto at its true radius). Why are 424 hidden moons simulated when `showMoons = false`?
3. In realistic-scale mode, compute Earth's on-screen diameter after Focus from `main.ts:504-506` (radius 4.26e-5 AU, floor 0.01 AU, FOV 58°). Does `applyScaleMode` (`main.ts:569-580`) touch label sprites (fixed 0.12×0.03 AU, `main.ts:249`) or `sunMagneticFieldGroup` (baked at display radius, `sunController.ts:238`)?
4. Pause semantics: list every visual that advances on wall-clock when `simState.paused` is true (`timeController.ts:68-72` only stops JD). Does the worker still get ticked with wall dt (`main.ts:821`)? Does H29 displacement still move bodies?
5. Is the GW grid (`PlaneGeometry(400,400,384,384)`, 148k vertices, `frustumCulled=false`) and the warp plane visible at startup? Only `toggle()` ever sets `mesh.visible`; `sunController.ts:358` assumes the opposite.
6. Why does `resizeRenderer` (`main.ts:875-885`) run every frame and call `setPixelRatio` each time; on a DPR-2 display does `dom.canvas.width !== w` ever evaluate false?
7. How does a 2e8 far/near ratio (`near 1e-4, far 2e4`, no `logarithmicDepthBuffer`) behave at Neptune, and what happens to the 15,000-radius star sphere when far is clamped ≤120 in realistic mode (`main.ts:866`)?
8. Which of `SimulationState`'s 17 fields are read anywhere on the live path (expected: 7)? Does the zoom slider update `simState.zoomSensitivity`? Are `?uiWidth=` query params inert?
9. If the worker stops replying without throwing, what notices (`main.ts:817-834`)? Is `tickJd` ever compared with `simState.julianDate`?
10. First-paint cost: `generatePlanetTexture('sun')` at module top level (≈229 ms measured), `generateAsteroidBelt(15000)`, `generateKuiperBelt(5000)` — measure on the target machine.
11. `sunController.ts` has 109 tsc errors and no typed parameters; the warp state passed to the worker at `main.ts:695-703` is itself a TS2322. What contract actually exists between `main.ts`, `sunController.ts`, and the worker?

### 6.2 Orbital mechanics and body catalog — LIVE (moons loaded, not rendered)
**Scope:** `src/sim/orbitMath.ts` (126), `src/sim/solarSystemModel.ts` (241), `src/sim/catalog.ts` (454), `src/data/planets.ts` (862), `src/data/moons.json` (424 records), `src/constants.ts`, `scripts/update-moons-data.mjs`. Compare with `origin/sun-focus` versions and its `catalog.test.ts` / `orbitMath.test.ts`.
1. Does the orbit-normal convention in `catalog.ts:104-108` (`-sinΩ·sinI, +cosΩ·sinI, cosI`) match the angular-momentum direction of the propagator's Rz(Ω)Rx(i) transform in `orbitMath.ts:83-85` (`+sinΩ·sinI, −cosΩ·sinI, cosI`)? Compute r×v for Io at epoch from the catalog and compare with Jupiter's pole (RA 268.1°, Dec 64.5°) in the ecliptic frame. Expected: every converted non-ecliptic moon's plane is off by 2i (Titan ≈55°, Charon ≈115°, Cordelia ≈165°).
2. Where is `argPeriapsisDeg` rotated when the node direction changes (`catalog.ts:423` passes it through)? Propagate Io at its JPL epoch both ways; why do they differ by ~178°?
3. From which axis does JPL measure Ω for Laplace/equatorial frames (the node on the **ICRF equator**, per the sat_elem legend) versus the code's `eclipticNorth × pole` at `catalog.ts:195`? How large is that in-plane rotation for Saturn and Mars (~40°)?
4. For the 11 moons with frame `equatorial` and no pole RA/Dec (Uranus's classical moons, the Pluto system), what pole does `sourcePoleInEcliptic` (`catalog.ts:184-189`) use? Why is `spinAxisLongitudeDeg` in `planets.ts` unused? Do Ariel and Cordelia revolve in the same sense?
5. Why does `moons.json` contain two Puck rows (ids 378 and 388, both IAU 715)? Does the scraper dedupe?
6. Is any secular precession applied on `main` (`orbitMath.ts:54-63` holds i/Ω/ω constant; `nodePrecessionYears`/`apsisPrecessionYears` in `moons.json` are unread)? Compare the sim's Moon ecliptic latitude today against a low-precision almanac series (expect ~8° error).
7. Does `sun-focus`'s `catalog.test.ts` use an independent oracle, or a copy of the implementation's own helpers (tautological)? Does it still reproduce the 178° Io error?
8. Are the `Radius: X km` values shown in the info panel sourced from JPL or from `stableHash` (`catalog.ts:247`; 377 of 424 moons)? Is provenance surfaced anywhere?
9. Confirm what is right: Kepler solver residual over e∈[0, 0.9999999] (expect ≤1e-10, no NaN), analytic velocity vs finite difference, Standish reduction in `planets.ts` (ω = ϖ−Ω, M = L−ϖ), planets vs Standish-with-rates on today's date (expect <0.12°), epoch/JD helpers.
10. Degenerate inputs: `periodDays = 0` → NaN positions; `e ≥ 1` silently clamped to an ellipse. Any current record triggers this? What would (asteroid/backend data)?

### 6.3 Solar subsystem — LIVE (frontend + backend)
**Scope:** `src/frontend/features/solar/{sunVisuals,solarFeatureBlending,solarFlares,solarMagnetics,solarObservationTexture,solarPhysicsClient,gravitationalWaves}.ts` (live), `{solarProminences,solarWind}.ts` (dead), `src/sunController.ts`, `backend/sim/solar_physics.py` (995), `backend/sim/solar_realtime_data.py` (600), `backend/server.py:400-510`, `backend/tests/test_solar_physics_*.py`. On `sun-focus`: `backend/sim/pfss_magnetogram.py`, +520 lines in `sunVisuals.ts`.
1. Which axis is the solar pole? `sunVisuals.ts:33/165/410` use world +Y; `main.ts:138, 260-265` spin every body about world Z; `solar_physics.py:69-75` puts the pole on its own z and the loop group is parented into a Y-pole `spinGroup` and rotated twice (`sunController.ts:253`, `main.ts:589-596`). Does `sun-focus`'s physics-driven sunspot placement inherit the mismatch?
2. Which Sun visuals advance with `simState.julianDate` versus `performance.now()`? Sunspots drift at one revolution per 6.7 wall-hours, granulation at 144 wall-hours, the mesh rotates on sim JD (609.12 h). What does the photosphere do at 120 d/s, and when paused?
3. Fetch the Helioviewer tile URL that `solar_realtime_data.py:330-342` builds for a current image id: how much of the solar disk is in the 512-px tile (expected ≈16% of the diameter, an interior crop), and what does `sunVisuals.ts:277` do with it (wraps it equirectangularly around the whole sphere)?
4. Measure the `/solar/physics` response at `fidelity=high&max_features=180` (≈509 KB) × the 900 ms poll in `sunController.ts:129` (≈566 KB/s per tab). Which of the ~21 per-feature keys does `solarFeatureBlending.ts` read?
5. Cold start with `live_data=true`: `latest()` releases its lock before `_fetch_snapshot` (`solar_realtime_data.py:107-122`); up to 13 sequential upstream calls at 3.8 s each vs a 2.6 s browser timeout and 6 s retry. How many duplicate fetch storms run? Is SILSO's 2.9 MB CSV really re-downloaded every 120 s? Is `jd` honoured by the cache?
6. `solarFlares.ts`: compute `maxLifeTimeSec` for 489 km/s (≈25 h) vs `maxEvents = 3` and the spawn guard at line 273. How long until a 4th flare can appear? Does the surface glow (`sunVisuals.ts:307-318`) ever decay, and is its longitude mirrored relative to the sprite (`sin` sign)?
7. Is `14.44 − 2.87 sin² − 0.36 sin⁴ °/day` actually Snodgrass (1983) as `sunVisuals.ts:109` claims (Snodgrass 1983 is 14.38, −1.95, −2.17)? Why does `solar_physics.py:89` use different coefficients? Is the Hathaway normalizer's assumed peak (66.1 months) the true maximum for c = 0.71 (58.4)?
8. With `useRealisticScale = false` (default), what are the corona shell radius (`sunVisuals.ts:763` × `catalog.ts:269` → ≈1.5 AU) and the Parker spiral extent (≈242 AU)?
9. Is the backend honest in metadata but oversold in naming (`quasi_mhd_corona_v4`; every temporal quantity is a sum of sinusoids; `field_strength_gauss`/`temperature_mk`/`alfven_speed_kms` never feed geometry)?
10. On `sun-focus`, is `pfss_magnetogram.py` wired into `/solar/physics` and consumed by `sunVisuals.ts`, and does the poll still run at 900 ms with the larger payload?

### 6.4 SMBH / superluminal "Cataclysmic Events" — LIVE
**Scope:** `src/frontend/features/superluminal-modeling/{smbhPropagation (684), agnShockwaveEngine (437), smbhPhysicsConstants (395), warpSlipstreamVisuals (182)}.ts`, wiring in `main.ts` / `sunController.ts` / `solarSystemModel.ts:170-193` / `modelWorker.ts:177-210`, `index.html:56-91`, `h29-*.md`, `superluminal_*.md`, `ADVANCED_ASTROPHYSICS_INDEX.md`.
1. Trigger H29 (both `#agn-preset=SgrA_WarpWave_H29` and `#agn-hypothesis=h29`): does the violet sech² warp mesh ever appear? Trace `agnShockwaveEngine.ts:183/191` (`channel.key === 'warpMetric'`) against the only key ever created, `'metric_slipstream'` (`smbhPropagation.ts:561`).
2. Call `computeMultiMessengerTimeline(SGR_A, 1e56, 0.61)`: what is `cr_tsunami.arrivalTimeYr`? `smbhPropagation.ts:237` divides rigidity by an extra `c·1e9` (1 GeV proton → 1.1e-13 GV); the module ignores its own `ISM.crDiffCoeffTeV`. Expected ≈3.2e11 yr vs the channel text's "10⁵–10⁶ years".
3. `gyroRadius` (`smbhPropagation.ts:271`) divides by an extra `c` (1 EeV at 5 µG → 1.5 AU instead of ~216 pc); what hides the 1e11-rad deflection angle at line 512?
4. Compute 2GM/c² for Sgr A* and M87 from the catalog masses; compare with `rSchwarzschildCm` at `smbhPhysicsConstants.ts:62/152` (values are in metres, labelled cm — 100× small). Which downstream functions consume them?
5. With `#agn-observer-frame` checked (shipped default), the GW-grid front reaches the Sun at β_app ≈ 1.97c for Sgr A* (`agnShockwaveEngine.ts:345`) while the `gw` channel text says "exactly c". Is a transverse apparent-motion factor a legitimate radial front speed?
6. Where is the user told that H29 is fictional? `index.html:82/93` list it as a "Propagation model" peer of the standard model; Maffei 1 and M87 presets carry "(speculative)"/"(educational)" tags, H29 does not; the project's own `superluminal_analysis.md` "Layer 1: strict causality" is violated when GW/EM/ν arrive at ~2c under H29.
7. Instrument `SolarSystemModel.applyMetricKinematics` during an H29 run: largest |shiftDispAu| for any body, and does it scale with frame dt (`v·dt` re-applied on a freshly reset position each tick — non-integrating)? Is the shift a differential stretch or a rigid translation (σ ≈ 409 pc for Sgr A*)? Is the sign at `solarSystemModel.ts:179` right?
8. Are the GW/warp grids coplanar with the orbits? `geometry.rotateX(−π/2)` puts them in XZ; `orbitMath` is z-up (orbits in XY).
9. What happens if `metricFrameDragPeak` is called without its third argument (`smbhPropagation.ts:119` references `SGR_A`, which is not imported — TS2304)? What does the worker default `smbhMassG = 1` mean physically?
10. Confirm the good parts: light-travel time, Sedov–Taylor with ξ₀ = 1.15 and its inversion, Rankine–Hugoniot, Alfvén speed, β_app/δ/Doppler boosting, Hillas limit, L_Edd, Blandford–McKee — and that nothing in the feature references `julianDate`/`simState` (no time corruption).

### 6.5 Asteroid / Kuiper data pipeline — LIVE runtime + offline scripts (+ dead prototype)
**Scope:** `scripts/fetch_jpl_sbdb.py`, `scripts/fetch_utils.py`, `scripts/build_asteroid_phase1_dataset.py`, `scripts/asteroid/catalog_fetcher.ts` (+README), `src/data/asteroidCatalogLoader.ts` (+`.test.ts`, `asteroidCatalogBinaryFormat.md`), `src/sim/phase1AsteroidCatalog.ts`, `src/sim/asteroidBelt.ts`, `src/sim/kuiperBelt.ts`, `src/frontend/features/asteroids/beltRenderer.ts`, `public/data/asteroid-phase1/*`, `backend/sim/kuiper.py`; dead: `src/data/asteroidTaxonomyResolver.ts`, `src/sim/asteroids/*`. Checklist: `agent-notes/phase1_closure_and_hardening_todos.md`.
1. Execute `validatePackedCatalogRoundTrip(100_000)` (esbuild + node): is `ok` true? Why is `maxEpochErrorDays` 0.125 when the epsilon is 1e-4 (`setFloat32` epoch at line 185 vs `PERIOD_EPSILON_DAYS` at 305)?
2. What is the float32 ULP at JD 2,461,000 (0.25 d), and given `uJulianDate − epochJd` in the shader (`beltRenderer.ts:127`, raw JD as a `float` uniform) at the default 4 d/s and 60 fps, how many frames pass between asteroid position updates? (The dead `asteroidShaders.ts` already passes days-since-J2000 in fp64.)
3. Maximum displacement the Jupiter/Saturn "perturbation" term (`beltRenderer.ts:163`, scale 1e-10) can produce: is it above one fp32 ULP at 2.5 AU? Is `acc·|Δt|²` toward the planet's *current* position a perturbation theory of anything? README advertises it.
4. Why are all stored `period_days` 3-significant-figure values (1330, 1680, …)? `fetch_jpl_sbdb.py:148` sends `full-prec: false`; builder prefers `per` over Kepler's law. Vesta stored 1330.0 vs 1325.75 d (+0.32%) → ~1° mean-anomaly drift per orbit.
5. In the shipped binary, what fraction of bodies with 2.5 ≤ a ≤ 2.7 AU carry `taxonomy_index 2` (M)? Is `meta.json`'s `M: 19,629` compositional or positional? Would the dead resolver's `validateSemiMajorAxisCoverage` pass on this data?
6. How many distinct albedo values are in the binary (expect 3: synthetic midpoints)? Is `albedo` in `SBDB_FIELDS`? Is `H` packed? What is the maximum `selectionPriority` a phase-1 record can reach?
7. For each TODO in `agent-notes/phase1_closure_and_hardening_todos.md`: closed on `main`, on `sun-focus`, or open? (Expected: 1.1/1.2/1.3/5.4 closed; 5.3 only on sun-focus; 2.x/3.x/4.x/6.x open.)
8. What happens in `main.ts:447-457` when the 3.6 MB fetch + SHA-256 exceeds `PHASE1_LOAD_LATENCY_BUDGET_MS` (2,000 ms) on a correct, checksum-matching file? After a dataset regeneration, does `cache: 'force-cache'` on the meta fetch (`phase1AsteroidCatalog.ts:547`) guarantee a checksum-gate failure for returning users?
9. Are the three taxonomy tables (Python builder, `catalog_fetcher.ts`, `asteroidTaxonomyResolver.ts`) identical, including `O` and the no-`a` fallback? Does anything import the resolver?
10. Is the per-frame Kuiper refresh (`main.ts:1062-1063`, ≈1 ms + 320 KB instance-matrix upload) skipped when paused or hidden? Is `backend/sim/kuiper.py` seeded, does it include Uranus, are its "Plutinos" resonant, and is it tested?
11. `catalog_fetcher.ts:310`: is `eccentricityPenalty` added or subtracted? Is the script wired to anything?
12. Confirm the good parts: FNV-1a/SHA-256 chain (recompute over the shipped `.bin`), ACBF layout agreement across Python/TS writer/TS reader/spec, real SPK-IDs, deterministic diameter-sorted prefix, 0 tsc errors in this subsystem.

### 6.6 Disconnected frontend stack — UNREACHABLE (24 files, 6,691 LOC, 851 tsc errors)
**Scope:** `src/frontend/app/{animationLoop,cameraController,inputHandler,labelSystem,localSystemRenderer,nearbySystemsRenderer,plannerController,routeRenderer,simulationClient,uiBindings,temp_nearbySystemsRenderer}.ts`, `src/frontend/camera/transitions.ts`, `src/frontend/features/planetary/*`, `src/frontend/features/trajectory/*`, `src/frontend/rendering/*`.
1. Does any file outside this stack import any of its exports on `main` or on `origin/sun-focus`? (Expected: none.) Why did `sun-focus` invest +1,824 lines typing these modules without wiring them?
2. Produce the per-module disposition table (§9 item 9): what it would need to run again (DOM elements, removed constants, wiring), whether `sun-focus` already wired it, and keep-and-rewire / keep-as-library / archive / delete.
3. Run the extracted `parseTleBlock` loop (`satelliteSystem.ts:201-233`) on a 2-line (no name) TLE set of four satellites: how many survive (expect 2 of 4; 0 of 1)?
4. With `visualProfiles.ts` defaults (`useWorkerPropagation: true`, `workerLeadSeconds: 0.45`) and 4 d/s, what is `jd1 − jd0` in `requestWorkerSnapshot` (1.8 sim-days ≈ 28 ISS revolutions) and what does the linear lerp in `applyWorkerSnapshot` then draw?
5. For an Earth→Mars Hohmann leg, what |v∞| does `localPlanner.ts:66-114` compute from the chord velocity at line 45-47 (≈29.5 km/s) versus the analytic 2.65 km/s, and what does that do to `assistGainKmS` and `feasible`?
6. How many of the 50 `dom.*` handles resolve against the current `index.html` (expect 14), and which accesses lack optional chaining (`uiBindings.ts:34-50, 52, 149, 166`; `plannerController.ts:22, 297-303`; `routeRenderer.ts:37, 78`)?
7. Is `temp_nearbySystemsRenderer.ts:620-1127` byte-identical to `nearbySystemsRenderer.ts`? Does `tsconfig` therefore double-count its 44 errors?
8. Does `simulationClient.disconnect()` detach `onclose`/`onerror` before closing? What happens on `connect()` twice in one tick? Which server message types (`connected`, `state_update`, `orbital_elements`, `error`) does `onmessage` handle?
9. Where are `PC_TO_AU`, `INTERSTELLAR_MAX_DISTANCE_AU`, `AU_PER_LIGHT_YEAR`, `LOCAL_SYSTEM_MANIFEST_BY_NEARBY_ID` defined on `main`? (Expected: nowhere; last at `src/main.js:235-263` in `04e99a4^`.)
10. Given `main.ts` already contains its own `createLabelSprite`, `createOrbitLine`, `updateCameraClipPlanes`, what is lost by deleting `labelSystem.ts`, `orbitRenderer.ts`, `cameraController.ts`, `lodManager.ts`?
11. Record what is good and worth keeping as a library: `trajectory/index.ts` is wire-compatible with the backend request/response models; `milkyWay.ts` galactic→equatorial matrix self-validates; `satelliteSystem.ts` J2 rates match Vallado and TLE column slices are correct; `cloudDataPipeline.ts` WMS 1.3.0 axis order and bitmap eviction are right; `transitions.ts` is clean.

### 6.7 Backend server and simulation engines — BACKEND
**Scope:** `backend/server.py` (1,195), `backend/sim/{base,contracts,rebound_nbody,tudatpy_hooks,kuiper,galactic_tide,radiation_pressure,__init__}.py`, `backend/data/{bodies,nearby_systems}.py`, `backend/requirements.txt`, `backend/tests/test_seek_optimizations.py`.
1. Does `REBOUNDEngine.initialize()` succeed under the REBOUND version `pip install -r backend/requirements.txt` resolves today? (`rebound_nbody.py:71-72` sets `sim.ri_ias15.*`, removed in REBOUND 5; `test_seek_optimizations.py:37` fakes the attribute.) Why does `/health` report the engine available?
2. What bounds a client-supplied `set_julian_date` (`server.py:938-944`, any finite float)? What stops the `_loop` thread once the WebSocket disconnects mid-integrate (`stop()` joins with a 3 s timeout; `integrate()` is uninterruptible)? Are `_checkpoints` (one full Simulation copy per 10 sim-years) ever pruned?
3. After any exception in `_handle_command` (`server.py:832-837` sets `_runtime_error` and `paused`), which command clears `_runtime_error` so stepping resumes? Try `{"type":"get_orbital_elements","body_id":"sun"}` (raises in `rebound_nbody.py:302`), then `resume`, and watch `paused:false` with a frozen `jd`.
4. Which origins can `POST /benchmark/accuracy/report` with credentials (`allow_origins=["*"], allow_credentials=True` — is the origin reflected?), and can `output_path` name an existing research note under `my-notes/` (`_resolve_benchmark_report_path` accepts any existing `.md`; `accuracy.py:359-360` overwrites)?
5. In what units is `state_update.bodies[*].vel` for each engine (`rebound_nbody.py:138` AU/yr; `tudatpy_hooks.py:287` AU/day), and what does `kuiper.activate` assume? Does the contract carry units or frame (barycentric after `move_to_com`)?
6. Does `SolarRealtimeDataProvider.latest(jd=X)` ever return data for epoch X when the cache is warm? Can `force_refresh=true` on a public GET be used as an upstream-fetch amplifier (no single-flight, no byte cap)?
7. With Kuiper active at 365 d/s, how many simulated days elapse per wall second given `dt_days = time_scale / target_fps` and a 495 ms frame? Why does a paused connection with Kuiper active re-send the 93 KB particle payload every stream tick when `_frame_counter % 5 == 0`?
8. Is the runner stopped if the client drops between `runner.start()` and the `connected` send (`server.py:1143-1147` vs the `try/finally` at 1161)?
9. Is there any test that opens `/ws/sim`, runs `SimulationRunner._handle_command`, or instantiates a real `rebound.Simulation`?
10. Are `rebound_galactic_tide_callback` / `rebound_radiation_pressure_callback` ever registered, and can `getattr(p, 'beta')` on a ctypes particle be non-zero?
11. Does the TudatPy chunk propagator carry its own state between 30-day chunks or re-seed from SPICE each time (`tudatpy_hooks.py:468-473`)? Is its `energy_error` a conserved quantity?
12. Confirm the good parts: the 2026-02-15 JD fix is still right (`sim.t·365.25 + J2000`; REBOUND's `yr` = 365.25 d exactly); bounded queues with `queue_overflow`/`queue_backpressure` codes; pydantic `StrictRequestModel` with `extra='forbid'`; report-path confinement rejects traversal; IAS15 energy error ~1e-16.

### 6.8 Backend trajectory, mission, benchmark — BACKEND
**Scope:** `backend/trajectory/{lambert,mga,planner}.py`, `backend/mission/{agents,orbital,schemas,vehicle_service,mining_service,risk_service,explainability,ephemeris_service}.py`, `backend/mission/epo/*`, `backend/benchmark/{accuracy.py,reference_scenarios.json,CALIBRATION_PROTOCOL.md,artifacts/*.csv}`, the five related test modules. Compare with `sun-focus` commits `9ad876a`, `8a3ba50`, `47137c2`, `d3a7b89`.
1. Run `compute_lambert_leg(ephemeris, 'earth', 'mars', 2460600.5, tof)` for tof = 2, 5, 10 days: does the returned leg's `tofDays` equal `solve_lambert_universal(...)['computedTofDays']`? (`lambert.py:142-146` falls through on an unbracketed root and returns velocities for a different TOF, labelled with the requested one.)
2. Instrument `optimize_mga_route` for earth→mars, `max_assists=3`, default pool: how many of the 41 generated body routes are evaluated before `MAX_COMPLETED = 48` breaks the loop (it counts beam partials, not routes; expect 4), and is Venus among them? Is the route order alphabetical?
3. For any assist route, compare |v∞,in| and |v∞,out| at the flyby: where is magnitude continuity enforced (`mga.py:108` averages them) and where is the mismatch charged to `totalDeltaVKmS` (it isn't)?
4. What does `GET /benchmark/accuracy` return for `passRate` on `main` (expect 0.0)? What in `artifacts/*.csv` (nine single-row files, identical `captured_utc`, no state vectors) demonstrates the rows came from GMAT/Orekit/Tudat? What does `sun-focus`'s `comparison_contract` say about them (`comparable_to_solver=false`)?
5. With `ephemeris_provider='auto'` and tudatpy absent, which provider produces every state (`ephemeris_service.py:142-154`; Horizons is unreachable because `_sample_kepler` never returns None), and what string does the API report?
6. In `agents.py:325-330`, what mass is used for the return burn, and how does it relate to `mining_result['refinedProductKg']` (31,882 kg at defaults)? Why does `mining_service.py:81` subtract propellant kg from cargo kg while `agents.py:372` subtracts propellant again?
7. POST `/mission/plan` with all defaults: what HTTP status results (expect 422, `no_verified_candidate`, unmet Δv 35.7 km/s against a 3.7 km/s vehicle), and what is `risk.failureProbability` (expect 0.000 from 240 samples, independent of logistics feasibility; margin penalty 120 kg per km/s, unsourced)?
8. Run `python -m mission.epo.smoke_test --compact`: how many of 30 pass? `epo/verifier.py:31` reads `result['verification']`; `agents.py:400` writes `candidate['verification']`. `typescript_migration_plan.md:27` marks EPO done.
9. What bounds the number of Lambert evaluations in `POST /trajectory/porkchop` for a 100-year window at minimum steps (≈19 min CPU, unauthenticated)?
10. Is there any unit test that calls `solve_lambert_universal` with a known analytic case? Is `sun-focus`'s `test_lambert_solver_reference.py` an independent reference or a snapshot of the solver's own output?
11. Domain: no multi-revolution branch (z capped at 40 ≈ 4π²); fixed-departure MGA (not a window search); hand-weighted objective constants; uniform 300 km flyby floor at Jupiter; `deltaV` fields are heliocentric v∞ magnitudes, not mission Δv; SPICE path requests `J2000` (equatorial) while Kepler/Horizons are ecliptic; mining/vehicle constants have no citation in any of the 85 docs; `exp(−0.0015·days)` storage loss discards ~85% of product.
12. Confirm the good parts: Kepler ephemeris longitudes on 2024-01-01 within ~1° of reality; Stumpff guards; f/g reconstruction; prograde/retrograde selection; flyby turn-angle relation; seeded Monte Carlo; benchmark tamper detection.

### 6.9 Tests, tooling, developer experience, repository hygiene
**Scope:** `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`, `.vscode/`, `scripts/*`, `backend/requirements.txt`, `backend/tests/conftest.py`, root-level files, `src/assets/`, `public/`, git history.
1. Run `npm run typecheck` on `main` and on `origin/sun-focus`: does either exit 0 (1,300 / 344)? Is there any test, lint, CI, or hook that would have caught the regression?
2. Is there any command on `main` that executes a frontend test? What does `asteroidCatalogLoader.test.ts` contain, and who imports it?
3. From a fresh venv, does `pip install -r backend/requirements.txt && cd backend && pytest` collect all 12 modules? Which upper bounds are pinned (none)? Is `pytest` mixed into runtime deps? Is there a `pyproject.toml` / `pytest.ini` (no; `conftest.py` does a `sys.path` hack)?
4. Do `npm run ingest:moon-textures` and `python scripts/fetch_jpl_sbdb.py` run? (No — `.js` paths left over from the migration; the latter half-applies.)
5. After `vite build`, which files from `src/assets/textures` appear in `dist/` (expect none)? Which module imports `visualProfiles.ts` (none)? How many blob versions of the 3.4 MB asteroid `.bin` does git hold (3)? Is there an LFS/`.gitattributes` policy?
6. Can `testWarp.js`, `testRealisticScale.mjs`, `get_errors.mjs` run from a clean clone? Where does `testRealisticScale.mjs:11` write?
7. Is `scripts/asteroid/catalog_fetcher.ts` (1,058 LOC) inside any tsconfig, and are `tsx` / `@types/node` available so the documented `npx tsx …` command works offline?
8. Which of the 62 files in `my-notes/` are byte-identical (expect three groups), and which of the three `SMBH_Shockwave_Research_MASTER_*` files is canonical? Does any code cite which research version it implements?
9. Governance: LICENSE (none — public repo is all-rights-reserved), CONTRIBUTING, CI, Dockerfile, `.editorconfig`, `.nvmrc`, `.python-version`? `.vscode/extensions.json` recommends only an agent-quota meter.
10. `scripts/dev-full.mjs:128` spawns bare `python3` (ignores venvs) and binds `0.0.0.0`; `scripts/openai_codex_prompt.py` accepts `--api-key` on the command line. Is an unrelated OpenAI CLI appropriate in this repo?
11. Commit history: average subject length 73.7 chars, 101/294 over 72, 15 consecutive "Remove TypeScript no-check directive … to enhance type safety" commits that added no types, duplicate subjects. Is the history bisect-friendly?
12. `tsconfig.json`: `allowJs` with no JS left, `include` excludes `scripts/`, no `noUnusedLocals`/`noUnusedParameters`. What would enabling them surface?

### 6.10 Documentation and claims — DOC
**Scope:** `README.md`, `Development_History_Context.md`, `Development_Improvements.md`, `typescript_migration_plan.md`, `solar_system_codebase_analysis_consolidated_2026-02-21_03-08-50.md`, `WORK_DONE_*.md`, `CLAUDE_OPUS_WORK_LOG_2026-02-15.md`, `agent-notes/*.md`, `my-notes/*`, `ADVANCED_ASTROPHYSICS_INDEX.md`, `src/data/asteroidCatalogBinaryFormat.md`, `backend/benchmark/CALIBRATION_PROTOCOL.md`, `src/sim/asteroids/README.md`, `scripts/asteroid/README.md`.
1. Diff README Highlights (lines 7-17) against `index.html` control ids **and** the reachability set: which bullets have both a UI affordance and a reachable module? (Expected: time controls, asteroid/Kuiper belts, solar model — and the SMBH panel, which the README never mentions.)
2. Why does `main.ts:380` hard-code `showMoons = false` while README headlines "424 moons"? Is there a commit or log entry explaining it?
3. Which file references `src/assets/textures/*` (39 MB) or `src/data/stars_catalog.json`? Why are they tracked?
4. Where is the 2026-02-23 `main.js` rewrite (`04e99a4`, −4,190 lines) recorded in either rolling log, given the instruction layer mandates logging architecture decisions? What did agents working from the logs after that date target (dead modules)?
5. How can README:60 ("choose REBOUND or TudatPy in the frontend and click Connect") be executed on either branch?
6. Of the 1,300 tsc errors, how many are in reachable files (438)? Does the hardening plan in `Development_Improvements.md:149-179` prioritize by reachability (it leads with 311 errors in a file that never executes)?
7. For each 2026-02-21 audit item A1–A9, B1–B10, C1–C3, D: closed with evidence, implicitly mooted by the rewrite, or untouched? Is A1 "resolved" or regressed (1,083-line `main.ts` owns the rAF loop, belts, AGN wiring, worker protocol)?
8. Same-day contradictions: README:24 says two worker paths; `Development_History_Context.md:146` (two hours earlier) says only satellite propagation; reality is one (model) live and one (satellite) dead. `typescript_migration_plan.md:8` says "82 total (53 .ts, 0 .js)".
9. Is `Development_Improvements.md`'s own instruction layer enforced (hard cap, timestamp format — five entries stamped "~08:00")? If a process contract is not followed, what is it worth?
10. Build the claims table (§9 item 7). Appendix B gives the 2026-08-22 version as a starting point; re-verify every row and add rows for `Development_History_Context.md`, `typescript_migration_plan.md`, and `ADVANCED_ASTROPHYSICS_INDEX.md` status claims.
11. Credit what is good: the rolling logs' instruction layer and the candid 2026-03-07 audit entry; README's honest "Physics Notes" language; colocated specs (`asteroidCatalogBinaryFormat.md`, `CALIBRATION_PROTOCOL.md`); `CLAUDE_OPUS_WORK_LOG` as a model bug write-up; the backend API section is accurate where checked.

## 7. Evaluation dimensions and scoring rubric (supporting lens — secondary to the major-issue register)

The primary deliverable is the ranked major-issue register (§9 items 4–5), not a score. Use this rubric two ways: (a) as a **coverage checklist** — if any dimension below has no major-issue finding *and* no evidence you looked, you have not finished hunting there; and (b) as a compact way to state overall maturity. Score each dimension 1–5 using the anchors. Scores without a cited basis are invalid. Do not average into a single number; instead give an overall **maturity verdict** in one sentence and a **trust statement** ("what a second engineer can rely on today without re-verifying").

| # | Dimension | 1 (anchor) | 3 (anchor) | 5 (anchor) |
|---|---|---|---|---|
| 1 | Build & test health from a clean clone | typecheck or tests fail; missing deps | builds; tests run with documented extra steps | `npm ci && npm run typecheck && npm test` and `pip install -r && pytest` all green, in CI |
| 2 | Type safety (as practiced, not as claimed) | hundreds of implicit-any errors; `any` at boundaries | strict passes on live code; boundaries typed | strict passes repo-wide; worker/WS/HTTP contracts are shared types validated at runtime |
| 3 | Architecture & modularity of the live app | monolith re-forming; module-level mutable globals | clear layers; some god-functions | small cohesive modules; explicit state; no cross-layer reach-through |
| 4 | Correctness of live code paths | known silent wrong-results | no known silent errors; edge cases unguarded | edge cases guarded and tested |
| 5 | Physics / numerical fidelity *and honesty of labelling* | formulas wrong or units mixed; speculation presented as physics | standard parts right; limitations listed; speculation labelled in docs but not UI | correct, unit-consistent, validated against references; UI labels fidelity tier per feature |
| 6 | Data integrity & provenance | checksums/format mismatched; mappings disagree; sources unknown | consistent formats; sources listed | reproducible pipeline, pinned sources, verified checksums, attribution complete |
| 7 | Backend robustness & concurrency | races/leaks/unbounded work; errors swallowed | bounded, mostly clean lifecycle; some swallowing | lifecycle verified under disconnect/reconnect; backpressure; structured errors |
| 8 | Security & operational exposure | file-write/unauth destructive or unbounded endpoints reachable cross-origin | local-dev-only posture, documented | safe defaults, auth/allow-lists, no unbounded proxying |
| 9 | Performance & resource use | per-frame allocations, invisible meshes drawn, multi-MB polling | acceptable on desktop; hot spots listed | budgeted frame time; LOD; lazy assets; measured |
| 10 | Test strategy | effectively none on the live frontend; backend fakes mask breaks | unit tests for numerics; backend contracts | numerics + contracts + one end-to-end smoke, all in CI |
| 11 | Documentation accuracy & single source of truth | README describes a different app; dozens of overlapping logs | README mostly true; logs separated | README = truth; docs indexed; research separated from engineering |
| 12 | Repo hygiene & process | scratch scripts, screenshots, diffs, personal paths committed; stale default branch | minor clutter; branch strategy stated | clean tree; LFS for binaries; main = releasable |

Additionally compute a **claims-accuracy ratio**: of the README's substantive claims, what fraction are TRUE-ON-HEAD (count DEAD-CODE-ONLY and FALSE against). Show the table (§9 item 7).

## 8. Previously identified issues — the known-major floor; confirm or refute on HEAD, then hunt past it

These 53 items (K-01…K-53) were surfaced by the 2026-08-22 scan and are the **floor**, not the ceiling: re-confirming them is necessary but not sufficient, because the objective is to find the major issues this list missed. **Do not copy them into your report.** Re-verify each on HEAD, then either list it under your own findings with your own ID and evidence, or under "Refuted / already fixed" with the proof. Verification status: **★** = directly re-confirmed in the source by the author of this prompt; **(E)** = confirmed by the explorer agent that found it, by reading the full code path and/or executing the extracted function; **(S)** = suspected only. No item received an independent adversarial pass — that is your job (Phase 4).

**Critical**
- K-01 ★ `backend/sim/rebound_nbody.py:71-72` sets `sim.ri_ias15.min_dt/epsilon`; REBOUND 5.x (what `rebound>=4.0.0` installs) has no `ri_ias15` → every default `/ws/sim` connection fails with `engine_init_failed` while `/health` says the engine is available; `test_seek_optimizations.py:37` fakes the attribute so 48/48 pass. Same on `sun-focus`.
- K-02 ★ `README.md:1-17, 121-143` describe an application (`Solar System Mission Lab`) that `index.html` does not ship; ≈50% of feature claims are DEAD-CODE-ONLY or FALSE (Appendix B).
- K-03 ★ `package.json:12` — the only quality gate (`tsc --noEmit`) fails with 1,300 errors; README:21 claims strict typing everywhere; nothing (no test script, lint, CI, hook) enforces anything.

**High — live frontend**
- K-04 ★ `src/main.ts:42-50` value-imports from `src/workers/modelWorker.ts`, whose top-level `self.onmessage =` (line 142) is therefore bundled and executed on the page, claiming `window.onmessage`.
- K-05 ★ `src/sim/catalog.ts:104-108` orbit-normal sign convention is Rz(180°) of the propagator's (`orbitMath.ts:83-85`); every non-ecliptic moon (67) orbits in a plane tilted 2i from intended (Titan 55°, Charon 115°, Cordelia 165°). Not fixed on `sun-focus`.
- K-06 ★ `src/sim/catalog.ts:423` passes `argPeriapsisDeg` through unrotated when the node frame changes → moon positions at epoch off by up to 179° (Io 178.5°). `sun-focus` adds a rotation but inherits K-05 so Io is still 178.5° off.
- K-07 ★ `src/sim/catalog.ts:184-189` fallback pole for `equatorial` moons without RA/Dec is a rotation of +Z about X by the tilt — the same sky direction for every planet; Uranus's classical moons counter-rotate against its inner moons (160°), Pluto–Charon plane 43° off the IAU pole. `planets.ts` `spinAxisLongitudeDeg` is never read.
- K-08 ★ `src/frontend/features/solar/sunVisuals.ts:33,165,410` take the solar pole as world +Y; `main.ts:138,260-265` spin every body about world Z → sunspot belts, streamer belt, polar holes and differential rotation are laid out 90° from the visible rotation axis.
- K-09 (E) `sunVisuals.ts:513,240,1246` + `main.ts:584-597`: sunspots, granulation and flare glow run on three unrelated wall-clock rates while the mesh rotates on sim JD; the texture visibly slides under stationary spots and keeps moving when paused.
- K-10 (E) `backend/sim/solar_realtime_data.py:337` requests a single 512-px Helioviewer tile (≈16% of the disk diameter, an interior crop) that `sunVisuals.ts:277` wraps equirectangularly around the whole sphere; the "activity proxy" is computed from that patch.
- K-11 (E) `src/sunController.ts:129` polls `/solar/physics` every 900 ms at `fidelity:'high', maxFeatures:180` → ≈509 KB/response, ≈566 KB/s per tab, most keys unread.
- K-12 (E) `backend/sim/solar_realtime_data.py:117` releases the lock before fetching; up to 13 sequential upstream calls (≈50 s worst case) vs a 2.6 s client timeout and 6 s retry → duplicate fetch storms on cold start; SILSO 2.9 MB CSV re-downloaded every 120 s.
- K-13 ★ `src/frontend/features/superluminal-modeling/agnShockwaveEngine.ts:183,191` gate the warp mesh on `channel.key === 'warpMetric'`; the only H29 channel ever created is `'metric_slipstream'` (`smbhPropagation.ts:561`) → the H29 warp visual can never appear.
- K-14 ★ `smbhPropagation.ts:237` rigidity has an extra `/(c·1e9)` (1 GeV proton → 1.1e-13 GV); CR-tsunami arrival for Sgr A* ≈ 3.2e11 yr vs the channel text's 10⁵–10⁶ yr. ★ `:271` `gyroRadius` has an extra `/c` (1 EeV @ 5 µG → 1.5 AU, should be ~216 pc). ★ `smbhPhysicsConstants.ts:62,152` `rSchwarzschildCm` values are metres (100× small).
- K-15 ★ `src/frontend/features/asteroids/beltRenderer.ts:65,127,447` upload the raw Julian Date as a `float` uniform; fp32 ULP at 2.46e6 is 0.25 d → belt positions advance in 6-hour steps (every ~4 frames at 4 d/s; frozen at real-time rates).
- K-16 ★ `src/data/asteroidCatalogLoader.ts:185` writes the epoch as Float32 (0.25-day resolution) while the documented round-trip self-test rejects epoch deltas > 1e-4 d (line 305) → `validatePackedCatalogRoundTrip(100000)` fails 99,916/100,000. The only shipped frontend "test" has never passed.
- K-17 (E) `scripts/fetch_jpl_sbdb.py:148` `full-prec: false` + `build_asteroid_phase1_dataset.py:214` preferring `per` → all 100k periods stored to 3 s.f. (up to 0.46% error; Vesta 1330.0 vs 1325.75 d → ~1°/orbit drift).

**High — disconnected stack (severity-capped by §3.2, listed for the inventory)**
- K-18 (E) `src/frontend/features/trajectory/localPlanner.ts:45-47` uses the straight-line chord velocity as the transfer velocity → flyby v∞ inflated ~11× (29.5 vs 2.65 km/s Earth→Mars).
- K-19 (E) `src/frontend/features/planetary/satelliteSystem.ts:209-230` `parseTleBlock` advances 4 lines per 2-line element set → drops every second satellite; 0 results for a single set. Same on `sun-focus`.
- K-20 (E) `satelliteSystem.ts:892,923` worker path linearly interpolates across 1.8 sim-days (≈28 ISS revolutions) at the default time scale.
- K-21 (E) `src/frontend/app/uiBindings.ts:34-50,52,149,166`, `plannerController.ts:22,297-303`, `routeRenderer.ts:37,78` dereference 36 DOM handles removed in `d1484e8` with no null guards → the UI half of the stack throws on first bind if rewired.
- K-22 (E) `src/frontend/app/temp_nearbySystemsRenderer.ts:620-1127` is a byte-identical live duplicate of `nearbySystemsRenderer.ts` after a 619-line comment; `nearbySystemsRenderer.ts:30-46` and `cameraController.ts:9` destructure 16 constants that exist nowhere on `main`.
- K-23 (E) `src/frontend/app/simulationClient.ts:63-115` never detaches `onclose`/`onerror` on reconnect; `error`/`orbital_elements` server frames are dropped; connect never seeks, so a rewired client would jump the scene to J2000.

**High — backend**
- K-24 ★ `backend/server.py:938-944` accepts any finite `jd` for `set_julian_date`; `stop()` joins for 3 s but `integrate()` is uninterruptible → a disconnect leaves a CPU-pinned zombie thread (reproduced: alive 4 s after disconnect; 10 Myr ≈ 18 h CPU). `_checkpoints` grow unpruned.
- K-25 ★ `backend/server.py:832-837` sets `_runtime_error` + `paused` on any command exception; `resume` (935-936) clears only `paused`; nothing clears `_runtime_error` → `get_orbital_elements` for `sun` (raises in `rebound_nbody.py:302`) bricks the session while telemetry reports `paused:false`.
- K-26 ★ `backend/server.py:85-91` `allow_origins=["*"], allow_credentials=True` (origin reflected) + `POST /benchmark/accuracy/report` (716-731) + `accuracy.py:359-360` `mkdir`/`write_text` → any web page or LAN host can overwrite any existing `.md` under `my-notes/` (e.g. the 47 KB research MASTER). No auth, no rate limit, binds `0.0.0.0`.
- K-27 ★ `backend/trajectory/lambert.py:142-146` falls through when no sign change is bracketed and returns velocities for a different TOF, labelled with the requested one (tof 2 d → 23.5 d; 5 → 7.3; 10 → 17.2). `sun-focus` `9ad876a` adds a residual guard.
- K-28 ★ `backend/trajectory/mga.py:258-280` `MAX_COMPLETED = 48` counts beam partials, not routes → for earth→mars, `max_assists=3`, only 4 of 41 routes are evaluated, in alphabetical order; Venus never tried; 2- and 3-assist routes never evaluated.
- K-29 ★ `backend/trajectory/mga.py:108` averages |v∞,in| and |v∞,out| and never charges the mismatch (3–6 km/s on "feasible" Venus flybys) → unpowered-flyby energy conservation is not enforced; README's "hard flyby feasibility constraints" is half true.
- K-30 (E) `backend/benchmark/reference_scenarios.json` + `artifacts/*.csv`: the "strict GMAT/Orekit/Tudat" benchmark passes 0/3 on `main` (errors 0.85/32.9/34.7 km/s); nine single-row artifacts share one `captured_utc` and carry no state vectors; `sun-focus` `8a3ba50` relabels them `comparable_to_solver=false` ("legacy window-level capture").
- K-31 (E) `backend/mission/agents.py:325-330` never adds mined cargo (31,882 kg at defaults) to the return-burn mass; `mining_service.py:81` subtracts propellant kg from cargo kg; `agents.py:372` subtracts propellant again.
- K-32 (E) `backend/requirements.txt` lacks `httpx` (TestClient), all pins open-ended, `pytest` mixed into runtime deps, no `pyproject`.

**High — tooling / docs**
- K-33 ★ `scripts/ingest-moon-textures.mjs:5` imports `moonTextureCatalog.js` (only `.ts` exists) → `ERR_MODULE_NOT_FOUND`. ★ `scripts/fetch_jpl_sbdb.py:36` targets deleted `src/data/planets.js` and crashes after writing `backend/data/bodies.py`.
- K-34 (E) `src/assets/textures` (39 MB, 25 files) referenced by no TypeScript file, absent from `dist/`; ≈84% of the 46.6 MiB pack; no LFS. The asteroid `.bin` has three blob versions (12.2 MB).
- K-35 ★ `README.md:8,121` "424 moons" / moon toggle vs `main.ts:380` `showMoons = false` and no toggle. ★ `README.md:10` catalog stars vs `main.ts:358-372` `Math.random()`. (E) `README.md:135-143` planet textures/rings/oblateness vs `main.ts:283-285` flat colours. (E) `README.md:44,60` engine dropdown + Connect exist on neither branch. `README.md:24-25,217-218` link to `/home/nomad/Documents/...`.
- K-36 (E) The 2026-02-23 rewrite (`04e99a4`, −4,190 lines) and the Sun-Model-Lab transition (`d1484e8`) are recorded in neither `Development_History_Context.md` nor `Development_Improvements.md`; entries dated that day describe fixes to code deleted the same day; every later plan (`agent-notes/*`, 2026-03-07 hardening) targets unreachable modules.
- K-37 (E) The 2026-02-21 audit's A1 (decompose the monolith) was closed by replacing the app; the extracted modules are now all unreachable while `main.ts` (1,083 lines) owns the rAF loop, belts, AGN wiring, worker protocol and scene assembly.
- K-38 (E) No frontend test runner on `main`; `asteroidCatalogLoader.test.ts` is a 5-line re-export with no importer; root puppeteer scripts need an undeclared dependency, use three ports, and write to a personal `~/.gemini/antigravity/...` path.

**Medium (high-signal subset — the full explorer output contains ~60 Medium items; rediscover the rest)**
- K-39 (E) `src/workers/modelWorker.ts:122` transports heliocentric positions as Float32 (Pluto ULP 571 km = 48% of its radius) and `main.ts:793` overwrites the float64 model state with the rounded values; the float64 `bodyManager` path is only used when `Worker` is unavailable.
- K-40 (E) `src/sim/solarSystemModel.ts:190` H29 displacement = `v·dt·1e12` re-applied on a freshly reset position each tick (non-integrating, frame-rate dependent, unclamped dt, runs while paused); sign at line 179 inverted; σ ≈ 409 pc → a rigid translation, not a stretch; `metricFrameDragPeak` (`smbhPropagation.ts:135`) carries an arbitrary `·1e45`.
- K-41 (E) `agnShockwaveEngine.ts:345` applies transverse β_app (≈1.97 for Sgr A*) to the radial front speed with `#agn-observer-frame` checked by default; `smbhPropagation.ts:85` H29 makes GW/EM/ν arrive at ~2c; neither is labelled speculative in `index.html`; `main.ts:1005` decouples the H29 preset from the H29 model.
- K-42 (E) `warpSlipstreamVisuals.ts:104` / `gravitationalWaves.ts:144` rotate the grids into XZ while orbits are in XY (z-up); both meshes (148k + 16k vertices, `frustumCulled=false`) are drawn every frame from startup with all fragments discarded.
- K-43 (E) `src/main.ts:504-506, 249, 569-580` and `sunController.ts:238, 410-426`: realistic-scale mode leaves focus distance floor (0.01 AU → Earth ≈ 9 px), label sprites (0.12 AU) and the magnetic-field group (80× the real Sun) at display-scale values.
- K-44 (E) `src/frontend/features/solar/solarFlares.ts:175,199-201,273,336`: CME lifetime 25–61 wall-hours with 3 slots → no new flares after the first three; surface glow never decays; sprite/shader longitude sign mismatch.
- K-45 (E) `sunVisuals.ts:109-114` vs `solar_physics.py:85-90`: two different differential-rotation profiles, neither matching the cited Snodgrass 1983; `catalog.ts:269` display-scale Sun (0.3755 AU) makes the corona 1.5 AU and the Parker spiral 242 AU by default; `sunController.ts:253` coronal loops double-rotated in the wrong frame.
- K-46 (E) `scripts/build_asteroid_phase1_dataset.py:126-132` assigns taxonomy by semi-major axis for ~98% of bodies (2.5–2.7 AU → 98.9% "M"; M share 19.6% vs ~8% observed); albedo is three synthetic midpoints; the dead resolver's coverage validator fails on the shipped data.
- K-47 (E) `src/sim/phase1AsteroidCatalog.ts:538` makes a 2 s latency budget a data-validity veto (slow network → silent procedural fallback); `:547` `cache:'force-cache'` on the meta fetch guarantees a checksum failure for returning users after any regeneration (fixed on `sun-focus`).
- K-48 (E) `beltRenderer.ts:163` Jupiter/Saturn "perturbation" contributes ≤1.4 km (< 1 fp32 ULP at 2.5 AU) — numerically a no-op, physically unfounded, advertised in README.
- K-49 (E) `src/sim/orbitMath.ts:54-63` no secular precession on `main`; Earth's Moon ≈ 8.3° out of plane today; `moons.json` has Puck twice (ids 378/388); 377/424 moon radii are a string hash displayed as "Radius: X km".
- K-50 (E) `backend/server.py:894` + `kuiper.py:178-180`: a paused connection with Kuiper active re-sends 93 KB every stream tick (2.66 MB per 0.5 s at 60 Hz); `server.py:818,848` sim-time rate silently diverges from `time_scale` on frame overrun (≈12 d/s delivered at 365 d/s with Kuiper); `:1143-1147` runner leaks if the client drops before the `connected` send.
- K-51 (E) `rebound_nbody.py:138` emits AU/yr velocities, `tudatpy_hooks.py:287` AU/day; the contract carries no units/frame; `kuiper.activate` assumes AU/yr. `solar_realtime_data.py:107-121` cache ignores `jd`; `force_refresh` on public GETs is an upstream-fetch amplifier with no byte cap.
- K-52 (E) `backend/mission/risk_service.py:65-69` failure probability is independent of logistics feasibility (0.000 for an infeasible mission) with an invented 120 kg/(km/s) penalty; `ephemeris_service.py:142-154` `auto` chain never reaches Horizons and reports `'auto'` as provider; `epo/verifier.py:31` reads the wrong nesting → 0/30 episodes; `POST /trajectory/porkchop` CPU unbounded; default `/mission/plan` returns 422.
- K-53 (E) `Development_Improvements.md` exceeds its own hard cap with no prune note; `typescript_migration_plan.md:8` is self-inconsistent ("82 total (53 .ts, 0 .js)"); README:24 vs `Development_History_Context.md:146` contradict each other on worker paths; README says 13 pytest modules (12); three byte-identical research duplicates in `my-notes/`; `scripts/asteroid/catalog_fetcher.ts` is outside every tsconfig and needs undeclared `tsx`/`@types/node`; no LICENSE/CI/CONTRIBUTING/pyproject.

## 9. Required report structure

Write to `agent-notes/MAJOR_ISSUE_REPORT_<YYYY-MM-DD>.md`. The major-issue register (items 3–4) is the centerpiece; everything else supports it. Use exactly these top-level sections, in this order:

1. **Header** — commit SHA, branch, date, tool versions, environment, time spent, scope decisions from §3, list of anything you could not do (blocked / not-run, kept separate from failed).
2. **Executive summary** — ≤ 300 words, written last. Lead with the **count and one-line titles of the Critical and High (major) issues**, then the maturity verdict and the trust statement. If it helps the reader, add a one-line readiness call for each intended use (visual demo / education / scientific analysis / mission design) naming the single major issue that drives it.
3. **Major-issue register** — the headline table. Every Critical and High: ID, severity, reachability (+ "on reactivation" trigger for dormant footguns), subsystem, `file:line`, title, VERIFIED/SUSPECTED, effort. Sorted severity then subsystem. Nothing below Medium appears here.
4. **Major-issue detail** — one full finding per §4 for every Critical and High, grouped by severity. For every §8 item, state your own finding ID or "refuted/fixed — evidence", including the outcome of the Phase 4 refutation pass.
5. **Medium & Low summary** — the Medium compact table (ID, `file:line`, description, one-line fix, effort) and the Low **category counts** only (per §4 triage).
6. **Coverage matrix** — the §6.0 layer × failure-class table, every cell filled with finding IDs / `cleared: <probe>` / `not-inspected: <why>` / `n/a: <reason>`. This is the report's completeness argument: it shows where you hunted, what you cleared and how, and where the blind spots are. Close it with one paragraph naming the class of major issue most likely still hiding, and where it would be.
7. **Baseline measurements** — Phase 0 outputs with a Ground-Truth-Packet drift column.
8. **Claims vs reality** — every substantive README claim (and the "Current TypeScript Status" paragraph sentence by sentence) → TRUE-ON-HEAD / TRUE-ONLY-ON-SUN-FOCUS / DEAD-CODE-ONLY / FALSE / UNVERIFIABLE, with evidence. Add rows for the status claims in `Development_History_Context.md`, `typescript_migration_plan.md`, `ADVANCED_ASTROPHYSICS_INDEX.md`, and the closure status of every 2026-02-21 audit item and every `agent-notes` TODO. Flag every FALSE headline claim as a major issue in item 3 if it misleads a user about correctness.
9. **Subsystem assessments** — one subsection per §6 subsystem, in §6 order, with the question-bank answers.
10. **Disconnected-code inventory** — table of every unreachable module: LOC, tsc errors, what it would need to be rewired (DOM, constants, callers), whether `sun-focus` wired it, the reactivation-footgun findings (cross-referenced to item 3), disposition (keep-and-rewire / keep-as-library / archive / delete), and what in it is worth keeping.
11. **Strengths** — specific, evidence-backed; what should be preserved through any refactor. Mandatory and must not be generic. The scan found real ones: a robust Kepler solver, a correct Standish reduction, a consistent ACBF/checksum chain, a sound thread/async boundary, strict pydantic validation, correct Lambert/Stumpff/flyby-angle formulas, many correct SMBH physics formulas, a well-typed worker message union, honest backend metadata, a candid 2026-03-07 audit entry, and a clear direction on `sun-focus`.
12. **Roadmap** — *Now* (≤ 1 week, unblocks trust: make clean-clone build/test green on the chosen branch, decide the branch, make README truthful, fix or fence the top major issues such as the REBOUND 5 break and the report-overwrite endpoint), *Next* (≤ 1 month), *Later*. Sequence by **severity × effort × dependency**, not by subsystem. Each item references major-issue IDs and gives an acceptance criterion a script can check.
13. **Branch recommendation** — per §3.1.
14. **Scorecard** (supporting) — the §7 table with scores and a one-line cited basis per row, plus the claims-accuracy ratio. Presented as a lens on the major-issue register, not as the verdict.
15. **Not inspected / blocked** — what, why, and what it would take. Keep *blocked* (could not run) and *not-run* (chose not to, or optional component unavailable) distinct from *failed*; never score an uninstallable optional component as if it had been tested and failed.
16. **Appendix A** — commands run with output excerpts. **Appendix B** — file coverage: every source file with "read fully / read partially / not read". **Appendix C** — scripts you wrote.

Length guidance: the major-issue detail and subsystem sections carry the weight; the executive summary is short. Do not pad. A report that proves 20 real major issues and tabulates the rest beats a 60-finding report where 40 are Low. Completeness of the **major** set is the bar — a missed Critical is a failure; a missed Low is not.

## 10. Anti-patterns — do not do these

- Do not trust the README, the work logs, or prior audits. They are claims; several are already known to be false on `main`.
- Do not count the removal of `// @ts-nocheck` as type safety. Count what `tsc` says, and split it by reachability.
- Do not describe unreachable modules as features, capabilities, or "the architecture". Describe them as inventory with a disposition.
- Do not conclude the moon-frame pipeline works by checking only Uranus's classical moons (two bugs partially cancel there); check Io, Titan, Charon, Cordelia.
- Do not give generic advice ("add tests", "improve documentation", "consider refactoring"). Name the file, the function, the test case, the sentence.
- Do not inflate severity to look thorough, and do not flood with Low findings to look complete. Completeness is demonstrated by the §6.0 coverage matrix, not by finding count.
- Do not let a long tail of Mediums and Lows bury the majors. The triage rule in §4 exists to be followed: full findings for Critical/High, one table for Medium, counts for Low.
- Do not publish a major you did not try to refute (§4, Phase 4). A confidently wrong Critical discredits the register more than a missed Medium does.
- Do not stop hunting when you have re-confirmed §8. That register is the floor; a report that returns exactly the known 53 items has not done this job.
- Do not report the same root cause as five findings because it appears in five files, and do not merge two independently fixable defects into one ID.
- Do not leave a coverage-matrix cell blank. "Not inspected — no time" is a legitimate entry; silence is not.
- Do not turn the proportionate exposure review (FC-I, §6.7 item 4) into a security engagement. This is a locally run simulation; characterize the dev-only posture once, name anything that can destroy data or pin the machine, and move on.
- Do not moralize about speculative physics. Evaluate labelling, numerical correctness of the standard parts, and side effects on the simulation.
- Do not invent line numbers, command outputs, or runtime observations. If you did not run it, say you did not run it.
- Do not summarize where you could measure. "The bundle is large" is not a finding; "848.57 kB, of which three r182 is ≈ X kB and the Sun GLSL strings ≈ Y kB, loaded eagerly before first paint" is.
- Do not evaluate `main` as if it were the active branch without checking `sun-focus` (§3.1), and do not credit `sun-focus` claims without checking them out (several of its "fixes" do not fix the underlying defect, e.g. K-05/K-06, K-19).
- Do not write the executive summary first.

## Appendix A — Reproduction scripts (copy into your run)

**A.1 Baseline (run from repo root; keep every output file)**

```bash
mkdir -p .eval && { node --version; npm --version; python3 --version; } | tee .eval/versions.txt
npm ci --no-audit --no-fund 2>&1 | tail -3
npx tsc --noEmit > .eval/tsc.log 2>&1; echo "tsc exit $?"; grep -c 'error TS' .eval/tsc.log
grep 'error TS' .eval/tsc.log | sed 's/(.*//' | sort | uniq -c | sort -rn > .eval/tsc_by_file.txt
grep -o 'error TS[0-9]*' .eval/tsc.log | sort | uniq -c | sort -rn > .eval/tsc_by_code.txt
npx vite build > .eval/build.log 2>&1; echo "build exit $?"; grep -E 'kB|warn|error' .eval/build.log
echo "worker handler in main chunk: $(grep -c self.onmessage dist/assets/index-*.js)"
python3 -m venv .eval/venv && .eval/venv/bin/pip install -q -r backend/requirements.txt; echo "pip exit $?"
.eval/venv/bin/python -c "import rebound; print('rebound', rebound.__version__); print('ri_ias15' in dir(rebound.Simulation()))"
(cd backend && ../.eval/venv/bin/python -m pytest -q -p no:cacheprovider > ../.eval/pytest.log 2>&1; echo "pytest exit $?"); tail -5 .eval/pytest.log
# If collection fails on httpx: `.eval/venv/bin/pip install httpx` and re-run — that is finding material; record it.
(cd backend && ../.eval/venv/bin/python -m mission.epo.smoke_test --compact) 2>&1 | tail -3
git rev-parse HEAD; git branch --show-current; git status --porcelain | wc -l
git fetch -q origin; echo "ahead/behind sun-focus: $(git rev-list --count main..origin/sun-focus) / $(git rev-list --count origin/sun-focus..main)"
git diff --stat main origin/sun-focus | tail -1
du -sh .git src/assets public; git count-objects -vH | grep size-pack
git ls-files | sed 's/.*\.//' | sort | uniq -c | sort -rn | head
ls dist/assets; find dist -name '*.jpg' -o -name '*.png' | wc -l   # expect 0 from src/assets
```

**A.2 Reachability from `src/main.ts`** (`python3 .eval/reach.py`; resolves `.ts`/`.js`→`.ts`/`index.ts`, static + dynamic imports, and `new Worker(new URL(...))`)

```python
import os, re
root = os.getcwd(); src = os.path.join(root, 'src'); files = []
for d, dirs, fs in os.walk(src):
    dirs[:] = [x for x in dirs if x != 'assets']
    files += [os.path.join(d, f) for f in fs if re.search(r'\.(ts|mjs|js)$', f)]
def resolve(frm, spec):
    if not spec.startswith('.'): return None
    base = os.path.normpath(os.path.join(os.path.dirname(frm), spec))
    for c in [base, base + '.ts', re.sub(r'\.js$', '.ts', base), base + '.mjs', os.path.join(base, 'index.ts')]:
        if os.path.isfile(c): return c
pat = re.compile(r'''(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|new\s+Worker\s*\(\s*new\s+URL\s*\(\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]''', re.S)
edges = {f: {r for m in pat.finditer(open(f, encoding='utf8').read()) for r in [resolve(f, next(g for g in m.groups() if g))] if r} for f in files}
seen, q = set(), [os.path.join(src, 'main.ts')]
while q:
    f = q.pop()
    if f not in seen: seen.add(f); q.extend(edges.get(f, ()))
loc = lambda f: sum(1 for _ in open(f, encoding='utf8')); rel = lambda p: os.path.relpath(p, root)
for label, group in (('REACHABLE', [f for f in files if f in seen]), ('UNREACHABLE', [f for f in files if f not in seen])):
    print(f'{label}: {len(group)} files, {sum(map(loc, group))} LOC')
    for f in sorted(group):
        imp = [rel(k) for k, v in edges.items() if f in v]
        print(f'  {loc(f):5d} {rel(f)}' + ('' if label == 'REACHABLE' else '  <= ' + (', '.join(imp) or '(no importers)')))
```

**A.3 tsc errors restricted to reachable files**

```bash
python3 .eval/reach.py | awk '/^REACHABLE/{r=1;next} /^UNREACHABLE/{r=0} r&&NF==2{print $2}' > .eval/reachable.txt
while read f; do n=$(grep -c "^$f(" .eval/tsc.log); [ "$n" -gt 0 ] && echo "$n $f"; done < .eval/reachable.txt | sort -rn
```

**A.4 DOM ids referenced by TS vs defined in index.html** (the dead UI modules take `dom.*` from an injected object, so also grep `dom\.[a-zA-Z]+` in `src/frontend/app/*.ts` and map the camelCase names to kebab ids)

```bash
grep -rhoE "getElementById\(['\"][^'\"]+['\"]\)" src | sed -E "s/.*\(['\"]([^'\"]+)['\"]\)/\1/" | sort -u > .eval/ids_used.txt
grep -oE 'id="[^"]+"' index.html | sed 's/id="//;s/"//' | sort -u > .eval/ids_defined.txt
echo "used but undefined:"; comm -23 .eval/ids_used.txt .eval/ids_defined.txt
echo "defined but unused:"; comm -13 .eval/ids_used.txt .eval/ids_defined.txt
grep -rhoE '\bdom\.[a-zA-Z]+' src/frontend/app/*.ts | sort -u | wc -l   # dead-stack handle count (expect ~50)
```

**A.5 Running pure-TS numeric modules under Node** (no browser needed)

```bash
cat > .eval/check.ts <<'EOF'
import { createSolarSystemCatalog } from '../src/sim/catalog';
import { propagateKeplerOrbit } from '../src/sim/orbitMath';
import { validatePackedCatalogRoundTrip } from '../src/data/asteroidCatalogLoader';
import { computeMultiMessengerTimeline, crDiffusionCoefficient, gyroRadius } from '../src/frontend/features/superluminal-modeling/smbhPropagation';
import { SOURCE_CATALOG } from '../src/frontend/features/superluminal-modeling/smbhPhysicsConstants';
const cat = createSolarSystemCatalog();
console.log('bodies', cat.bodies.length, 'pucks', cat.bodies.filter(b => /puck/i.test(b.id)).map(b => b.id));
console.log('roundtrip 1000', validatePackedCatalogRoundTrip(1000));
console.log('D(1 TeV)', crDiffusionCoefficient(1e12), 'rg(1 EeV,5uG) cm', gyroRadius(1e18, 1, 5e-6));
const t = computeMultiMessengerTimeline(SOURCE_CATALOG.SagittariusA, 1e56, 0.61);
console.log(t.channels.map((c: any) => [c.key, c.arrivalTimeYr]));
EOF
node_modules/.bin/esbuild .eval/check.ts --bundle --platform=node --format=cjs --outfile=.eval/check.cjs --log-level=warning && node .eval/check.cjs
```
(Adjust export names to what the files actually export — read them first. For `catalog.ts` frame checks, compute r×v from `propagateKeplerOrbit` output and compare with the parent pole rotated into the ecliptic.)

**A.6 Backend probe (backend running on :8042)**

```bash
for p in health info bodies solar/capabilities solar/physics nearby-systems trajectory/capabilities mission/capabilities benchmark/accuracy; do printf "%-28s " $p; curl -s -o /dev/null -w '%{http_code} %{size_download}B %{time_total}s\n' "http://127.0.0.1:8042/$p"; done
curl -s http://127.0.0.1:8042/benchmark/accuracy | python3 -c "import json,sys; d=json.load(sys.stdin); print({k:d.get(k) for k in ('passCount','passRate','scenarioCount')})"
curl -s -X POST http://127.0.0.1:8042/mission/plan -H 'content-type: application/json' -d '{}' -o /dev/null -w 'mission/plan defaults -> %{http_code}\n'
curl -s -i -X OPTIONS http://127.0.0.1:8042/benchmark/accuracy/report -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: POST' | grep -i 'access-control'
.eval/venv/bin/python - <<'EOF'
import asyncio, json, websockets
async def main():
    async with websockets.connect('ws://127.0.0.1:8042/ws/sim?fps=30&stream_hz=5') as ws:
        for _ in range(2): m = json.loads(await ws.recv()); print(m.get('type'), m.get('code'), m.get('message', '')[:80])
        await ws.send(json.dumps({'type': 'get_orbital_elements', 'body_id': 'sun'}))
        await ws.send(json.dumps({'type': 'resume'}))
        for _ in range(4): m = json.loads(await ws.recv()); print(m.get('type'), m.get('jd'), m.get('paused'), (m.get('backend') or {}).get('runtime_error'))
asyncio.run(main())
EOF
```

**A.7 Branch delta for any file** — `git diff main origin/sun-focus -- <path>`; a later fix on `sun-focus` is strong evidence of a defect on `main` but is not proof that the fix is correct: read both versions and test the `sun-focus` one too.

## Appendix B — README claims table as of 2026-08-22 (starting point; re-verify every row on HEAD)

| README ref | Claim | Verdict (main @ aa6e39a) |
|---|---|---|
| :3 | "Solar System Mission Lab" / mission-design workbench | FALSE — `index.html` ships "Sun Model Lab / Sun-Focus Branch" |
| :7 | Sun + 8 planets + Pluto with axial tilt and spin | TRUE-ON-MAIN (`main.ts:258-291`) |
| :7 | per-planet visual profiles | DEAD-CODE-ONLY (`visualProfiles.ts`; planets are flat colours) |
| :8 | 424 moons | DEAD-CODE-ONLY (loaded; `showMoons = false`; no toggle; one duplicate Puck) |
| :9 | pause / reverse / time-warp | TRUE-ON-MAIN |
| :9 | jump-to-date | FALSE (only a "Now" button) |
| :10 | catalog-driven stars with proper motion | FALSE (6,000 `Math.random()` points; `stars_catalog.json` unreferenced) |
| :10 | synthetic Milky Way band | DEAD-CODE-ONLY (`milkyWay.ts`; `main.ts:376` is a stub) |
| :11 | nearby star systems, navigable manifests | DEAD-CODE-ONLY (renderers unreachable; manifests + `/nearby-systems` API exist) |
| :12 | asteroid belt GPU Kepler + Jupiter/Saturn uniforms + phase-1 catalog | TRUE-ON-MAIN (uniforms numerically a no-op, K-48) |
| :13 | Kuiper belt CPU refresh | TRUE-ON-MAIN |
| :13 | Oort cloud placeholder | FALSE (no Oort object in reachable code) |
| :14 | Earth satellite layer, TLE + J2 | DEAD-CODE-ONLY |
| :15 | real-time Earth clouds (GIBS) | DEAD-CODE-ONLY |
| :16 | interplanetary route planner (frontend) | DEAD-CODE-ONLY; backend Lambert/MGA TRUE-ON-MAIN (with K-27/28/29) |
| :17 | multi-agent mission planner | TRUE-ON-MAIN (backend; sequential method, not orchestration) |
| :20-21 | src TS-native; all `@ts-nocheck` removed | TRUE-ON-MAIN |
| :21 | strict type checking active on every file | MISLEADING — 1,300 errors |
| :24 | two workerized paths | HALF — model worker live; satellite worker dead |
| :24-25, 217-218 | links | FALSE — absolute `/home/nomad/Documents/...` paths |
| :25 | ACBF loader, SHA-256/FNV-1a, parallel fetch | TRUE-ON-MAIN (round-trip self-test fails, K-16) |
| :44, :60 | engine dropdown + Connect button | FALSE on main AND sun-focus |
| :48-50 | REBOUND IAS15 / TudatPy fallback | backend code exists; unreachable from UI; IAS15 init broken under REBOUND 5 (K-01) |
| :64-66 | WebSocket `fps` / `stream_hz` | TRUE-ON-MAIN |
| :72-79 | endpoint list | TRUE but INCOMPLETE — omits `/solar/*`, `/nearby-systems`, `POST /trajectory/plan`; the two endpoints the UI uses are missing |
| :82-135 | project structure tree | PATHS-EXIST (57/57) but 16 listed modules unreachable; omits `sunController.ts`, `asteroidBelt.ts`, `kuiperBelt.ts`, `beltRenderer.ts` |
| :121 | display toggles moons / asteroids / Kuiper / Oort | FALSE (only orbits, magnetic field, labels, realistic scale) |
| :122 | Milky Way modes | DEAD-CODE-ONLY |
| :123-124 | realism locators; gravity vectors | FALSE |
| :131 | Explorer search by name | FALSE (a `<select>`; no search) |
| :131 | focus / follow | TRUE-ON-MAIN ("smooth transitions" UNVERIFIED — `transitions.ts` is dead) |
| :135-143 | planet textures / clouds / terrain / LOD / rings / oblateness | FALSE — flat `MeshStandardMaterial`; 39 MB of orphaned assets |
| :147 | solar model: GLSL, flares, magnetics, observation blending, SWPC/SILSO/SDO | TRUE-ON-MAIN (except `solarProminences.ts`, `solarWind.ts` dead) |
| :164-172 | mission planner API; benchmark API | TRUE-ON-MAIN (benchmark passes 0/3, K-30) |
| :175 | "13 pytest modules" | FALSE (12) |
| :210-214 | data model: J2000 elements, JPL moons, frame normalization, d3-celestial stars | data TRUE; normalization WRONG (K-05/06/07); stars file unused |
| :224 | frontend Keplerian two-body | TRUE-ON-MAIN |
| :226-228, :236 | satellite J2, GIBS clouds, gravity vectors, Oort | DEAD-CODE-ONLY / FALSE |
| :233-234 | backend flyby constraints; frontend patched-conic; transfer arcs | backend HALF (K-29); frontend DEAD-CODE-ONLY |
| :240-250 | data-sources table | textures orphaned; GIBS/CelesTrak dead; SBDB TRUE |
| :254-268 | tech stack; `npm run build` | TRUE-ON-MAIN |
| :283-288 | `cd backend; pytest` | FALSE from a clean install (`httpx`) |
| 2026-02-21 audit A1–A9 | closure | A1 NOT DONE (replaced, regressed); A2 PARTIAL; A3 NOT DONE; A4 only on sun-focus; A5/A7/A9 NOT DONE; A6 MOOT; A8 PARTIAL |

---
*End of prompt.*
