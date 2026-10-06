# Codebase Evaluation — `vkorotkikh/solar-system-realistic-sim`

*Contents: 1 Header & scope · 2 Executive summary · 3 Scorecard · 4 Baseline measurements, CI analysis, runtime probe · 5 Key findings (KF-1…KF-11) · 6 Verification log · 7 Claims vs reality · 8 Prior issues · 9 Strengths · 10 Roadmap · 11 Branch recommendation · 12 Not inspected · Appendix A findings index (102) · Appendix B reviewer reports (separate file)*

## 1. Header and scope

| | |
|---|---|
| **Evaluated** | `origin/main` @ `17d1e63` (2026-09-27, "fix(ci): refresh PFSS verifier input hashes") — GitHub's default branch |
| **Your checkout** | `sun-focus` @ `13ca9ec` (2026-09-25) — a strict ancestor of `main`: it has **0 commits that `main` lacks and is 184 commits behind**. Every `file:line` in this report refers to `main`, **not** to the files in your checkout. |
| **Date** | 2026-10-06 |
| **Repository** | private · 604 commits · 0 pull requests · 0 issues · no branch protection · one workflow, one run ever, red |
| **Method** | Baseline measured by me on a clean install. Six parallel reviewers (backend API/security · backend science · trajectory/mission/benchmark · frontend core/orbital mechanics · solar visuals + SMBH · repo/docs/CI/tests) each read their area in full and *executed* code (≈1,300 tool calls, ≈4.3 M reviewer tokens). I then re-ran or re-derived every High finding that can be checked offline (§6). Prior audits in `agent-notes/` were treated as claims, not facts (§8). |
| **Environment** | Linux, 4 vCPU Xeon 2.8 GHz, 16 GB · Node 22.22.0 / npm 10.9.4 · Python 3.12.3 venv with the CI-pinned requirements (+ the exact CI interpreter 3.12.13 for the science lane) · Chromium + SwiftShader (no GPU) · outbound traffic limited to a proxy (JPL Horizons, NOAA, SIDC, GONG and Helioviewer were unreachable) |
| **Changes made** | None to your code. This report and `CODEBASE_EVALUATION_REPORT_2026-10-06_APPENDIX_B_REVIEWERS.md` were added under `agent-notes/` and committed to `sun-focus` as a single commit (at the request of a stop hook) — the only commit or push made. Also added: gitignored `node_modules/`, and remote-tracking refs for `main` and `fix/trajectory-amplification-defense-in-depth` fetched into `.git`. The temporary git worktree used for the evaluation has been removed. **Because that commit sits on `sun-focus`, the report exists only there; `main` does not have it.** |

**Scope decisions.** (1) `main` is evaluated because it contains everything on `sun-focus` plus 184 commits; the checkout's own numbers are shown alongside for comparison. (2) Live code (reachable from `index.html → src/main.ts`, including workers and dynamic imports) is judged on correctness; unreachable code is treated as inventory (severity capped at Medium). (3) The speculative astrophysics (SMBH/H29/superluminal) is *not* peer-reviewed — only its labelling, the numerics of its standard parts, and its side-effects on the rest of the sim. (4) Assets are judged on provenance, licence and whether live code loads them.

**Severity / evidence classes.** *Critical*: silently wrong results, data corruption, host exposure, or a clean clone that cannot build/test. *High*: wrong under common inputs, contract breaks between live components, materially false claims. *Medium*: degraded fidelity, maintainability traps, missing validation. *Low*: hygiene. **VERIFIED** = the reviewer read the whole path and/or ran something that demonstrates it; **SUSPECTED** = concrete reason, loop not closed (the finding says what would close it).

---

## 2. Executive summary

**Verdict.** A research-grade solo project with unusually strong numerical cores and test culture, whose delivery process and documentation have not kept pace with an agent-driven commit rate. What is checked against independent references is good; what surrounds it — CI, the README, the one backend feature the UI uses — cannot yet be trusted.

1. **Your checkout is stale:** `main` is 184 commits ahead; `sun-focus` has nothing unique.
2. **`main` has never been green.** The only CI run (one push carrying at least 127 commits) fails at four independent points: a stale test string, the TypeScript ratchet, a mutation patch that no longer applies (so the R3/R4 science gate cannot pass), and 7 backend tests. All are small fixes; the one-line test fix takes the frontend suite to 309/309.
3. **The Sun's backend feed cannot meet its own deadline.** The UI's default `/solar/physics` request costs 30–38 CPU-seconds against a hard 18 s limit, so on 4-vCPU hardware it never succeeds and retries forever. Root cause verified: one batched call is 7× faster with identical output.
4. **The README describes a different product:** 36 % of its product claims are true on HEAD (55 % overall). The page ships 10 bodies and calls two backend endpoint families; 37 % of the TypeScript and 45 % of the backend are unreachable from it.
5. **Where independently checked, it is right** (planets ≤ 14′ vs astropy, REBOUND vs Horizons, PFSS mathematics, Lambert, the fail-closed network profile). The weak spots surround it: an unprovenanced "strict" benchmark, an inverted mission planner, flares invisible at default scale, SMBH constants ×99 off.

**Totals:** 0 Critical · 15 High · 53 Medium · 34 Low (102 findings; many found independently by 2–4 reviewers).

**Trust today:** the orbital gates, REBOUND accuracy, PFSS/WSA mathematics, Lambert numerics, outbound-HTTP hardening and the network profile, the asteroid-catalogue integrity chain. **Not yet:** CI status, the README, the benchmark tier, mission-planner output, `/solar/physics` availability.

---

## 3. Scorecard

Scores use the anchors of your evaluation prompt (1 = broken / unverifiable, 3 = works with documented gaps, 5 = validated and enforced in CI). Each reviewer scored their own area; the score below is my consolidation, with the basis cited.

| # | Dimension | Score | Basis |
|---|---|:-:|---|
| 1 | Build & test health from a clean clone | **2** | `npm ci && npm run build` pass, 99.6 % of tests pass (2,442 of 2,451), but `npm test` is 308/309, typecheck fails (221) and its ratchet exits 1, backend 8/2,142 red (7 in CI), the README's own `cd backend && pytest` executes **zero** tests on a clean install, CI red ×4 (F-SOL-01, F-REPO-01/02/04, F-API-03) |
| 2 | Type safety (as practised) | **2** | strict fails on live code (221 errors, 151 in live files) — but 133 are benign implicit-`any` in two SMBH files, one is a latent `ReferenceError`, boundaries are typed and runtime-validated, errors fell 1,300 → 221 under a bucketed ratchet (F-FEC-20, F-SOL-16) |
| 3 | Architecture & modularity (live app) | **2** | `main.ts` 1,501 lines (+39 % since March), `server.py` 4,905 lines with 24 module-level stateful objects and 168 test monkeypatches, 36.8 % of TS unreachable; but `process_supervisor`, `http_ingress`, the solar clients and the worker contract are cleanly built (F-FEC-09, F-API-11) |
| 4 | Correctness of live code paths | **2** | planets right; default solar feed never delivered (F-SOL-02), flares invisible (F-SOL-03), pole conventions disagree (F-SOL-04), paused sim still animates (F-SOL-06), Earth/Mars not pickable (F-FEC-04), "realistic scale" wrong for Earth (F-FEC-05) |
| 5 | Physics / numerical fidelity **and honesty of labelling** | **3** | verified cores excellent (§9); stylised visuals over-claimed (F-SOL-05/14), SMBH constants ×99 (F-SOL-11), "strict" benchmark tier unprovenanced (F-TRJ-01), mission planner wrong (F-TRJ-02), `fidelity:"high"` on bodies that are up to 5.6° off (F-SCI-03) |
| 6 | Data integrity & provenance | **3** | Horizons fixtures with recorded provenance, SHA-256/FNV chain on the asteroid catalogue, pinned DE440 initial conditions; but synthetic taxonomy/albedo shown as "verified" (F-FEC-11), benchmark artifacts untraceable (F-TRJ-01), fixtures not regenerable (F-FEC-12), 38.7 MiB of unreferenced textures with no licence record (F-REPO-07/15) |
| 7 | Backend robustness & concurrency | **4** | bounded queues/pools/caches, killable worker processes, 0 leaked children (measured); minus K-25 session freeze, stalled-reader hold, supervisor discarding finished results (F-API-02/04/06/07) |
| 8 | Security & operational exposure | **4** | explicit CORS allow-list (verified by me), SSRF-free outbound code, fail-closed network profile; residuals: unauthenticated report writer in the local profile (F-API-05), `dev:full` network mode also exposes Vite (F-REPO-08), Actions pinned by tag (F-REPO-09) |
| 9 | Performance & resource use | **2** | solar compute 8–38 CPU-s vs an 18 s deadline (F-SOL-02); 1.3 s startup CPU (F-FEC-06); Kuiper belt 2.6 ms/frame even when paused (F-FEC-07); 77 % of the Sun's vertices are two disabled grids (F-SOL-10); polling already fixed (900 ms → 30 s) |
| 10 | Test strategy | **3** | independent oracles, a mutation lane, 0 skipped tests, 3.4 asserts/test; but no end-to-end test, **0 tests** for 4.5 k LOC of live visuals/SMBH physics, 29 tests on dead modules, 24 wall-clock tests = 85 % of runtime (F-REPO-10/11, F-SOL-12) |
| 11 | Documentation accuracy & single source of truth | **2** | README 55 % true overall / 36 % for the product description; GitHub description stale; dev logs stop at 2026-03-22; ADRs and `scripts/ci/README.md` are accurate (F-REPO-03/16, F-FEC-01, F-SOL-05) |
| 12 | Repo hygiene & process | **2** | ≥ 127 commits in one ungated push, no PRs/protection, 36 of 44 root files are not core, 9 byte-identical duplicate files, 71 % of tracked bytes unreferenced, no LICENSE (private repo) (F-REPO-02/07/12/15/17) |
| — | *CI / verification design (extra)* | *4 designed · 1 deployed* | the R3/R4 verifier is rigorous and well tested; as deployed it has never produced a green run (F-REPO-01/02/05, F-REPO-14) |

**Claims-accuracy ratio (README).** 109 atomic claims classified, 4 solar rows deferred to the solar reviewer: **58 TRUE of 105 = 55.2 %** (25 true only in dead code, 20 false, 2 unverifiable). For the product description (Highlights + Features, 42 rows): **15 true (36 %), 15 dead-code-only (36 %), 12 false (29 %)**. The sections agents edited recently (security, data model, `dev:full`) are 68 % true; the rest was never revisited after the 2026-02-23 "Sun Model Lab" rewrite. The solar/SMBH rows add: of 18 checked, 6 false, 1 dead, 2 partly true (F-SOL-05).

---

## 4. Baseline measurements and CI analysis

All numbers below were produced on 2026-10-06 in a clean environment (Linux, 4 vCPU Xeon 2.8 GHz, 16 GB; Node 22.22.0 / npm 10.9.4; Python 3.12.3 venv with the CI-pinned requirements, plus the exact CI interpreter 3.12.13 for the science lane). "Your checkout" is the `sun-focus` branch this session was started on; "main" is GitHub's default branch.

| Metric | Your checkout (`sun-focus` 13ca9ec, 2026-09-25) | `main` 17d1e63 (2026-09-27) |
|---|---|---|
| Relationship | strict ancestor: 0 commits that `main` lacks | **184 commits ahead** (177 files, +59,215 / −3,776) |
| Tracked files | 343 | 451 |
| TypeScript, non-test | 66 files, ≈24 k LOC | 70 files, 27,177 LOC (+ 3,918 LOC in 19 `.test.ts`) |
| Python, non-test / tests | — | 25,604 LOC (48 files) / 22,029 LOC (55 files) |
| `backend/server.py` | — | **4,905 lines** |
| Frontend tests (`npm test`) | 142 pass (7 files) | 309 tests, 21 files: **308 pass, 1 fails** |
| Backend tests (`pytest`) | 151 pass (156 s, unpinned deps) | 2,142 items = **747 test functions** (5 parametrized sweeps = 38.7 % of items): **8 fail**, 2,134 pass, 549 s. CI run: 7 fail, 2,135 pass, 492 s |
| `tsc --strict` errors | 280 (7 files) | **221** (6 files: smbhPropagation 81, agnShockwaveEngine 52, milkyWay 40, localPlanner 19, main 18, lodManager 11); `typecheck:ratchet` **exits 1** |
| Production build | — | passes in 3.5 s; main chunk 925.69 kB (233.58 kB gzip), worker 25.34 kB, CSS 22 kB; Vite chunk-size warning |
| Code unreachable from `index.html → src/main.ts` | 33 files, ≈9.8 k LOC (40.9 %) | 33 files, ≈10.0 k LOC (**36.8 %**) — same unwired stack; 29 tests now target some of it |
| CI | none | 1 workflow, 1 run ever, **red in both jobs** |
| `npm audit` | 11 (2 critical, 6 high) | same lockfile: 11, all in the dev toolchain; `npm audit --omit=dev` = 0; `npm audit fix` brings it to 3 |
| Secrets (pattern scan) | none found | none found |

Repository facts (GitHub): private; default branch `main`; no LICENSE detected; 604 commits (the local clone is shallow and shows only 291 — it also fabricates two "mass-import" commits at its shallow boundary); 0 pull requests, 0 issues; branches `main`, `sun-focus`, and `fix/trajectory-amplification-defense-in-depth` (fully merged, 166 behind); no branch protection.

### CI status on `main` (the only workflow run, 2026-09-27, run id 36307010887)

| Job | Result | Cause (each reproduced locally) |
|---|---|---|
| `r3-r4-science` (frontend + science lane) | **failed at step 1** | `npm test`: `solarRealtimeClient.test.ts` expects the text `sdo_aia status`; commit `09d87ac` reworded the validator message and left that row behind. One-line test fix (verified on an isolated copy: 21/21 files, 309/309 tests) |
| ↳ steps that never ran | build, TypeScript ratchet, runner-contract tests, **R3/R4 science manifest** | masked by the failure above. Behind it: the ratchet exits 1 (two new error buckets in `localPlanner.ts`), and the science lane itself fails at its 2nd mutant because `scripts/ci/mutations/uniform-theta-area-weights.patch` no longer applies after commit `2620db9` (`git apply --check` → "patch does not apply"; the other five patches apply; restoring the old hunk makes all 6 mutants die in 29.5 s) |
| `backend-tests` | **7 failed**, 2,135 passed | 5 × `503 solar_compute_timeout` (the UI's default `/solar/physics` request needs 30–38 s of CPU — `preview` fidelity 8.5 s; the endpoint's hard deadline is 18 s and cannot be configured above 19 s) and 2 × `wall_jd` test/implementation drift |

So `main` is red at **four independent points**, none of them hard to fix, and the science gate that the workflow is named for has never executed on this code. The workflow was first committed at 2026-09-26 18:22; at least 127 commits landed after it with no intermediate run because they reached GitHub in one push at 2026-09-27 08:41Z.

### 4b. Runtime probe — real browser against the real backend

**Setup.** The production build served by `vite preview` on `127.0.0.1:4173` (one of the backend's allowed CORS origins) and `uvicorn server:app` on `127.0.0.1:8042` (local profile) — the same topology as `npm run dev:full`. Headless Chromium with software GL (SwiftShader), 640×360, `renderScale=0.35`; load-only for 75 s with every console/network event written to disk as it happened.
**Limit.** My scripted interaction sequence (pause, realistic scale, focus Earth/Pluto, AGN triggers) did not complete: with software rendering each frame takes seconds, so Playwright operations queue behind rendering. Interaction behaviour therefore rests on the code-level and Node-executed evidence in KF-4 and KF-10, not on browser observation.

**What the browser showed**

1. **It boots cleanly.** No uncaught page error in 75 s; the status bar reads "Bodies · 55,010" and "Asteroids: verified Phase-1 catalog (100,000 rows, SHA-256)"; the simulation clock advances; JS heap stays between 38 and 83 MB with no upward trend.
2. **It calls exactly two backend endpoint families**: `/solar/realtime` → 200 (884 B, CORS origin echoed) and `/solar/physics?jd_tdb=…&fidelity=high&max_features=180&forcing=hybrid&live_data=true` — the request KF-2 is about.
3. **`/solar/physics` returned 503 both times it was tried.** The second attempt took 18.0 s — the hard deadline — and used a different epoch (`jd_tdb` 2461530.04 vs 2461319.84 for the first): the epoch follows the sim clock, so no two requests can ever share a cache entry. The only console errors of the session are the two matching browser lines "Failed to load resource: … 503 (Service Unavailable)"; nothing in the UI reports that the Sun is running on its local fallback (`index.html` has no such status element — F-SOL-02). *(Software rendering shares the CPU with the backend here, which can only make the compute slower; the same 503 at 18.0 s was reproduced without a browser by two reviewers and by the CI runner.)*
4. **The asteroid catalogue loaded in 9.8 s** under software rendering against its own 2 s "performance budget": a console *warning* only, and the catalogue was still accepted and labelled "verified" — the latency-veto fix (K-47) works as designed.
5. **Every page load makes a third-party request** to `fonts.googleapis.com` (+ three `.woff2` files) from a render-blocking `@import` in the stylesheet; here the `load` event waited ≈ 11 s on it via the sandbox proxy (F-FEC-17).
6. **The Sun renders orange-yellow, not "near-white"** (README: "near-white, not artistic orange"; F-SOL-14 computes a disk centre of ≈ (255,194,140) vs Planck's (255,241,234)). At a 0.35 render scale under software GL this is indicative only.

Session totals: 13 network responses, 0 failed requests, 0 uncaught page errors, 1 console warning (catalogue budget), 2 console errors (both the 503). Event log and screenshots were kept in the scratch directory.

---

## 5. Key findings

Eleven themes carry almost all of the risk. For each: the reviewer findings behind it (full text and evidence in the appendix), what I verified myself, and the fix. Effort: **S** ≤ 1 h · **M** ≤ 1 day · **L** > 1 day. Several defects were found independently by two to four reviewers — that is noted, and it is the strongest corroboration this report has.

### KF-1 · High · `main` has never been green — four independent failures, each hiding the next
*Findings:* F-SOL-01, F-REPO-01, F-REPO-02, F-REPO-05, F-SCI-02, F-API-03, F-SCI-14, F-REPO-11

| # | Failure | Cause | Fix | Eff. |
|---|---|---|---|:-:|
| 1 | `npm test` 308/309 | `solarRealtimeClient.test.ts:589` expects `'sdo_aia status'`; commit `09d87ac` reworded the validator message (`solarRealtimeClient.ts:587-592`) and left that table row behind. The validator is right (the backend sets `ok` and the payload together). | change the string to `'source_status.sdo_aia.ok must match'` — **verified: 21/21 files, 309/309 tests** in an isolated copy | S |
| 2 | `typecheck:ratchet` exits **1** | two *new* error buckets in `localPlanner.ts` (`TS7034`, `TS7005`), although the total (221) is under the 226 budget | fix the two errors or re-baseline `ci/typescript-error-baseline.json` | S |
| 3 | R3/R4 science lane fails at its 2nd mutant | `scripts/ci/mutations/uniform-theta-area-weights.patch` (hunk `@@ -64,4 +64,5 @@`, no trailing context) stopped applying after `2620db9`. **I confirmed with `git apply --check`: 1 of the 6 patches fails.** Two reviewers independently showed that restoring the old hunk makes the lane pass in 29.5 s with 6/6 mutants killed. | regenerate with `git diff -U3`, update `patch_sha256` (`ci/r3-r4-science-verification.json:117-119`), and add a ≤ 1 s test that runs `git apply --check` on every manifest patch (the 21 existing runner tests use a toy fixture, so a stale real patch is invisible) | S |
| 4 | backend 7 failed in CI (8 here) | 5 × `503 solar_compute_timeout` (→ KF-2); 2 × `wall_jd` — tests fake a seam production no longer calls (`server._build_solar_physics_state`, orphaned by `6a22361`); 1 supervisor test gives a spawned child 0.15 s to publish its PID while spawn takes 0.23–0.32 s here (passes on the faster CI runner) | re-point the fakes at `build_solar_physics_state`; wait ≥ 2 s for the PID | S |

**Why nobody saw it.** The workflow was first committed 2026-09-26 18:22 (`d6f19d1`). at least 127 commits followed with no CI run because they reached GitHub in a single push at 2026-09-27 08:41 UTC (earlier commits of the 184 may have been pushed before the workflow existed); four of those commits landed while the suite was already red. `main` is unprotected and there are no pull requests. The job layout then hides the gates from each other: the science lane is the *last* step of a job whose first step fails, and the `if: always()` evidence upload fails too ("no files were found"), so the log reads as a packaging error rather than a skipped gate.
**Process fix:** three jobs (frontend · science · backend) so one red gate cannot mask the others; branch protection with required checks on `main`; land CI changes through a PR so they run before they merge.

### KF-2 · High · The Sun's default `/solar/physics` request cannot finish inside its own deadline
*Findings:* F-SOL-02, F-API-01, F-SCI-01 (three reviewers, independently), F-API-02, F-REPO-11

```
client   src/sunController.ts:171-177   GET /solar/physics  fidelity=high  max_features=180  forcing=hybrid   every 30 s, retry 30 s after a failure
server   server.py:912-924              hard deadline 18.0 s by default, clamped to ≤ 19.0 s (no setting can raise it)
cost of one job (process CPU time, 4 vCPU Xeon 2.8 GHz):  preview 8.5 s · operational 17–18.5 s · high 30–38 s      [SOL 34.4 · API 29.9 · me 37.6]
live over HTTP   fidelity=high → 503 solar_compute_timeout after 18.0 s (twice; SOL) · a request with all defaults → 503 at 18.02 s (API)
CI runner (ubuntu-24.04, 4 vCPU): the same five tests time out
```
**Cause chain (all verified):**
1. `trace_field_lines` traces its 80–180 display lines one at a time through the scalar evaluator (`pfss_magnetogram.py:417-470`). **I re-ran SCI's comparison: 120 lines take 28.2 s CPU one by one and 3.8 s in a single `trace_field_batch` call, with all 120 line states, step counts and endpoints identical (max difference 2.6e-15 R☉).**
2. Every request runs in a fresh spawned process with a fresh model, so the PFSS cache (8.3 s cold → 0.01 s warm) can never hit; the key also contains the exact epoch and the client sends a moving `jd_tdb`.
3. If the child finishes but needs more than 0.25 s to exit, the supervisor discards the already-validated result and reports a timeout (`process_supervisor.py:460-469`; 3 of 18 finished jobs in the reviewer's runs).

**Impact.** On hardware like this (and the GitHub runner) the Sun never receives backend state, and nothing in the UI says so; the backend burns up to 18 CPU-seconds roughly every 48 s per open tab for nothing; five CI tests fail. A machine ≥ 2× faster passes `high`, which is why this is an environment-sensitive High rather than Critical — and why it can go unnoticed on a fast workstation.
**Fix, in order:** (1) batch the lines (S; SCI measured `high` falling 32 → 13.7 s CPU with this change alone); (2) until a CPU-time test shows `high` ≤ 10 s on the CI runner, default the UI to `operational`/`preview`, and make the client step down fidelity and back off on `solar_compute_timeout`; (3) decode the result *before* reaping the child; (4) keep a warm model or persist the PFSS solution, and quantise the epoch so identical polls can hit a cache; (5) show "synthetic fallback" in the status bar; (6) make the five deadline tests exercise API behaviour (they already have `_install_fast_solar_response`), not generation speed.

### KF-3 · High · The README and the GitHub description describe a different product
*Findings:* F-REPO-03, F-FEC-01, F-SOL-05, F-API-13, F-TRJ-12

- Highlights + Features: **15 of 42 claims true (36 %)**, 15 true only in unreachable code, 12 false. Your August audit (K-02) put it at "≈ 50 % dead or false"; it is now 64 %. The README *title* was changed to "Sun Model Lab (Sun-Focus branch)", the body was not.
- Verified by me: `showMoons = false` (`main.ts:147`) — the code's own comment two lines above says "Moon rendering is not currently exposed by the shipped UI" while README line 8 advertises "424 moons"; background stars are `Math.random()` (`main.ts:424-441`) and `stars_catalog.json` has no importer; "1.9 M particles" vs 100,000 rows shipped and 50,000 drawn; the engine dropdown and "click Connect" (README:57,73) cannot exist — `index.html` has no such control and the only WebSocket client is unreachable; "14 pytest modules" (52); three README links 404. The GitHub description ("…gravity vector visualization, adaptive asteroid detail, and mission trajectory planning") repeats three false/dead claims.
- Solar section — of 18 checked claims, 6 are false: "data assimilation" from SWPC/SILSO/AIA (the payload says `effective_forcing:"synthetic"`, `applied:false`), AIA blending (inert by design), "GOES Neupert-effect" flares (no such code), "~22 % RMS" granulation (4.9 % in a port of the shader), "Fermi Bubble rendering" (no geometry), "near-white" colour (disk centre ≈ (255,194,140) vs Planck (255,241,234)).
- Fix: rewrite Highlights/Features/Structure from `index.html` plus the reachability list; label unwired modules; fix the broken links; update the GitHub description; add a 30-line CI check that every path, element id and number the README names exists (REPO wrote a 0.1 s prototype). **S–M.**

### KF-4 · High · The shipped Sun / SMBH visuals contradict their own claims
*Findings:* F-SOL-03, 04, 06, 07, 08, 09, 10, 11, 13, 14

- **Flares and CMEs never render at the default scale.** Lifetime = (0.3 AU − Sun radius) / speed; the default display radius is 0.3755 AU, so it is −755 s and every event expires on its first update. SOL ran the real manager for 30 min at 60 fps: 0 of 108,000 frames had a live event. I verified the arithmetic and the constants. At real scale only 4 slots exist, each held ~49 min.
- **Three pole conventions.** The shader takes latitude from world +Y (`sunVisuals.ts:38`); the mesh spins about the tilted +Z axis (`main.ts:308-316`) — **90.00° apart (verified)**; the backend pole is +Z; the same backend feature lands 26–89° apart in two render paths; backend longitudes are rotated twice (≈ 29 °/day vs the physical 14.2).
- **Paused is not paused.** Granulation, spots, corona and texture scroll run on the wall clock. The fix (`56930fb`, 2026-08-24) was lost in merge `53d0941`; `main.ts:1412-1417` still carries a comment saying the tree "does not carry" it.
- **Inert controls.** The "Solar observation channel" selector changes nothing (the backend never marks an AIA tile spatially eligible — fail-closed by design, but the control is still offered); "Continuous stochastic flaring" does nothing unless an event is already running (0 vs 34–51 bursts per 120 s); the "H29" preset runs the standard model; observer-frame projection defaults ON and makes the visual front arrive at 4.1 s while the timeline says 8.0 s.
- **Waste.** Two AGN grid meshes (148,225 + 16,641 vertices, `frustumCulled = false`) are drawn every frame from startup with their shader disabled — 77.5 % of the Sun's vertices — and lie in XZ while the ecliptic is XY.
- **Wrong constants.** `rSchwarzschildCm` for Sgr A* is `1.24e10`: in metres (true 1.227e12 cm; ×99 — verified; M87 ×101); source directions are 33–92° off astropy; at the default display scale the corona shell is 1.50 AU and the Parker spiral reaches 242 AU (beyond the 200 AU camera limit).
- *Mitigating:* the Cataclysmic Events panel is collapsed, badged "Advanced", says "Educational experiment zone… speculative… they do not represent a forecast", and choosing the H29 model flips an aria-live status to `data-model="speculative"`. The cosmic-ray diffusion, gyroradius (216.19 pc) and beaming helpers were fixed in `bb63988` and match textbook values.
- **Fix:** mostly S — flare lifetime independent of display radius; call `agnEngine.update` unconditionally; map the H29 preset to the H29 model; `toggle(false)` both grids at creation; `rSchwarzschildCm = 2GM/c²`. M — one Sun frame (IAU, pole +Z) and the visual clock ported from `56930fb`. Add the ≤ 10-line tests listed in F-SOL-12 (they need no WebGL).

### KF-5 · High · The "validation" artifacts outside the physics cores are not trustworthy: benchmark and mission planner
*Findings:* F-TRJ-01, F-TRJ-02, F-TRJ-03, F-TRJ-06, F-TRJ-09

- **Benchmark.** `backend/benchmark/reference_scenarios.json` marks its references `"tier": "strict"`, `source: "strict-gmat-orekit-tudat"`, with tool versions (GMAT R2025a, Orekit 13.1, Tudat 1.0), run ids and capture times. **Verified by me:** all nine "captures" (three tools × three scenarios) carry the identical timestamp `2026-02-15T10:27:25Z`; each CSV is one number with no state vectors; no GMAT/Orekit/Tudat script, kernel or log exists in the tree; and the same scenario record calls itself both a "fixed departure/arrival direct Lambert capture" and a "legacy window-level capture… not comparable". TRJ's independent Lambert (Izzo, validated against DOP853 propagation to 0.037 km) gives 7.63 / 39.99 / 51.63 km/s for the same date pairs; the repo solver gives 7.64 / 39.98 / 51.62; the "references" say 8.49 / 7.11 / 16.87. The loader correctly marks all three `incomparable_reference`, so the endpoint now scores nothing (`passRate 0.0`, `validationCoverage 0.0`) and a committed test asserts that vacuous state. TRJ also found strong circumstantial evidence that an AI agent wrote these CSVs in one session — I treat that as a suspicion, not a finding. What is established is that no one can reproduce or trace the numbers, so "benchmarked against GMAT/Orekit/Tudat" is not a claim the repo can support.
- **Mission planner.** `POST /mission/plan {}` returns **422** `mission_no_feasible_recommendation` with an empty `context` (verified; API saw it too): the default vehicle has 3.7 km/s of capability against ≥ 11.2 km/s needed. **I re-ran TRJ's script:** every candidate has `feasible=False` with 26–40 km/s of unmet Δv, yet reports 4.6–9.5 tonnes of returned payload and failure probability 0.000, because the return burn consumes 0 kg of propellant in the model (`mining_service.py:81`, `agents.py:480-486,533`); a vehicle that *does* close returns 0 kg and P(fail) = 1.0. The risk penalty uses an invented 120 kg per km/s where the vehicle's own sensitivity is 11,642 kg per km/s. (K-31 and K-52 from August are still present.)
- **Δv semantics.** `totalDeltaVKmS` is a heliocentric v∞ sum with no parking or capture orbit, yet is labelled "propulsive burns" and fed to the rocket equation (Earth→Mars 5.61 km/s as v∞ vs 3.61 + 1–2 km/s from LEO).
- `mission/epo/`: `smoke_test` reports **0/30 passed and exits 0**; its verifier reads the wrong nesting.
- **Fix:** relabel the benchmark `unverified_placeholder`; refuse `tier: "strict"` without state vectors; replace the vacuous reference with an in-repo oracle (the committed Horizons fixtures + an independent Lambert, ≈ 0.05 km/s tolerance); capture real tool runs later (L). Fix the mission accounting (add cargo mass to the return burn, stop charging return propellant twice, make infeasible plans fail by construction, surface `alternatives[*].verification.reasons` in the 422) (M). Rename the Δv field or add parking-orbit burns (M).
- *Credit:* the Lambert/porkchop/direct-route numerics, containment budgets and flyby-continuity checks are excellent (§9); this finding is about labelling and the mission layer, not the solver.

### KF-6 · Medium · Almost half of the backend has no client
Verified statically: the live frontend references exactly two backend path families — `/solar/physics` (`sunController.ts`) and `/solar/realtime` with its `aia-tile` sub-path (`solarRealtimeClient.ts`). The only `WebSocket` in `src` is in the unreachable `simulationClient.ts`, and the planner client/controller are unreachable too. I measured the non-test backend: **11,542 of 25,604 lines (45 %, 35 files) serve endpoints the page never calls** — the REBOUND/Kuiper/TudatPy WebSocket stack, `trajectory/`, `mission/`, `benchmark/` and their data — versus 8,575 lines (33 %, 10 files) for the solar stack the page does use; the rest is `server.py`/`http_ingress.py`. The dormant parts are well tested *as an API* (the trajectory suites are among the best in the repo), but the README Quick Start ("choose REBOUND or TudatPy in the frontend and click Connect") cannot be performed. This is a product decision more than a bug: either wire an engine selector/planner into the page (L), or declare the backend an API/library and say so in the README (S).

### KF-7 · Medium · Architecture hot-spots and dead weight
*Findings:* F-FEC-08, 09, 18; F-API-11; F-SOL-17

- 33 unreachable files (10.0 k LOC, **36.8 %** of non-test TS) — the same stack as in August; 29 frontend tests now target some of it. Five of the 15 `frontend/app` modules are live; the other ten, including `animationLoop`, `cameraController`, `labelSystem`, `uiBindings`, `inputHandler` (1,006 LOC), duplicate code that `main.ts` now owns.
- `main.ts`: 1,501 lines (+39 % since March), 0 exports, 16 module-level `let`s, 38 functions, 25 event listeners, untestable without DOM + WebGL; K-37 ("monolith") is not resolved, it moved.
- `server.py`: 4,905 lines, 24 module-level stateful objects, 43 module attributes monkeypatched 168 times across 11 test files, a dead production seam. F-API-11 proposes the split: config → security → runtime → ws → routes.
- The model worker (≈ 640 LOC with its contract) offloads 8.3 µs/frame of work (F-FEC-08).
- **Fix:** delete or move the dead files (and their tests) to `_unwired/`, or wire them; extract `modelBridge`, `beltManager`, `panelController` from `main.ts`; split `server.py` along the proposed seams. L.

### KF-8 · Medium · The test portfolio is strong in places and inverted in others
*Findings:* F-REPO-10, 11; F-SOL-12; F-API-12; F-FEC-12; F-SCI-06; F-TRJ-09

- The backend's 2,142 "tests" are **747 functions** — five parametrized sweeps account for 828 items (38.7 %). *(verified by me)*
- Where it counts the quality is high: 0 skipped/xfail tests, 3.4 asserts per test, independent oracles (scipy Legendre, closed-form dipole, Horizons fixtures with provenance), and mutation testing — FEC's 18 injected mutants: 14 killed; SCI's 43: 34 killed.
- Gaps: **no test file imports** `sunVisuals`, `solarFlares`, `solarFeatureBlending`, `gravitationalWaves`, `smbhPropagation`, `smbhPhysicsConstants`, `agnShockwaveEngine` or `warpSlipstreamVisuals` *(verified by me; 4.5 k LOC of live code)* while ~1,400 test lines guard the inert AIA delivery stack; `main.ts` has no tests; there is no end-to-end test (no real `/ws/sim` session, no browser) — which is why K-01 and K-25 stayed invisible; two API tests pass for the wrong reason; 24 solar-generation tests take 85 % of the 9-minute suite and assert a real 18 s deadline; 7 of 41 non-equivalent PFSS/WSA mutants survive (RK4 order, WSA exponent, the unreachable 850 clamp…); the Chebyshev moon fit's accuracy block is self-reported.
- **Fix:** the first tests to write are ≤ 10 lines each (listed in F-SOL-12): flare lifetime at both radii, `rSchwarzschildCm`, stochastic flaring with no event, preset → hypothesis, `metricFrameDragPeak` with its default argument. Then one real-REBOUND WebSocket session test, one Playwright smoke test, and mark the 24 heavy tests `slow`. S–M.

### KF-9 · Medium · Backend lifecycle and input-handling residuals
*Findings:* F-API-02, 04, 05, 06, 07, 08, 09, 10, 14, 16; F-TRJ-05; F-SCI-05

- **K-25 still present — I reproduced it live.** `get_orbital_elements` for body `sun` (the first body in the `connected` list) latches `_runtime_error`; `jd` then stays at 2451550.3333 after `resume` *and* after `set_time_scale 50`, while telemetry reports `paused:false`.
- `POST /benchmark/accuracy/report` can still overwrite any `.md` under `my-notes/` with `allow_overwrite:true` — no key, no Host/Origin check. (CORS is now an allow-list and overwrite is opt-in; containment against `..`, absolute paths and symlinks holds.) A NUL byte gives 500; absolute paths leak in error bodies and `/health`.
- A stalled WebSocket reader holds a connection slot and ~40 % of a core indefinitely; with Kuiper active the engine delivers 3–27 % of the requested time scale at 100 % CPU, and a paused session can resend 265 KB payloads at ~2.8 MB/s.
- Schema-valid absurd inputs produce plain-text HTTP 500 (`departure_jd` ≥ 1e18–1e20 depending on `max_assists`, `mining_days` ≥ 1e30), and planners return confident answers for epochs up to JD 1e17.
- `server.py` has **no logging** (one `print`); 56 of 61 environment knobs are undocumented — including the one that matters for KF-2.
- **Fix (all S):** validate `get_orbital_elements` and never latch on a command error; `asyncio.wait_for` around sends; bound epochs and catch `TrajectoryInputError`; add `logging`; require the key or a Host check on the writer; a `kuiper_seq` counter so payloads are sent once per change.

### KF-10 · Medium · Frontend correctness: small, visible defects
*Findings:* F-FEC-02, 04, 05, 07, 10, 13, 19

- Double-click "follow" cannot pick Earth or Mars: they are `Group`s of quadtree chunks and the raycast is non-recursive (`main.ts:1303`; code checked by me, three.js run by FEC). S.
- "Realistic scale" leaves Earth at 39× and Mars at 2× real size (the quadtree radius is baked into a uniform); labels and the focus floor are not rescaled, so Earth is ≈ 9 px at focus.
- Spin axes ignore IAU poles: Earth's pole is 32.7° off; Venus, Uranus and Pluto rotate the wrong way because retrograde is encoded twice (tilt > 90° *and* a negative period — visible in `planets.ts`).
- The H29 displacement is frame-rate dependent and runs while paused (at a test amplitude of β = 1e-6: 16.7 AU per frame at 120 fps vs 66.8 AU at 30 fps; at the amplitudes the shipped presets produce, ≤ 7.8e-9 AU per frame, it is invisible — a latent semantic bug rather than a visible one). Separately, `animate()` has no `try/catch` and no time-step clamp, so a hidden tab jumps 1,200 days at 4 d/s *(code checked by me)*.
- Retrograde moons (287 of 424) precess their node in the wrong direction (`catalog.ts:475` hard-codes `-1`; checked by me) — hidden behind `showMoons=false`, and the moon gate was calibrated to the bug and rejects the fix.
- 5,000 Kuiper objects re-propagated and re-uploaded every frame, also while paused (2.4 ms CPU + 313 KiB); ≈ 1.3 s of synchronous startup CPU for the Sun texture.

### KF-11 · Medium · Supply chain, scripts and repository hygiene
*Findings:* F-REPO-04, 06, 07, 08, 09, 13, 15, 16, 17; F-API-18

- **npm:** 11 advisories (2 critical, 6 high) — all in the dev toolchain (`npm audit --omit=dev` = 0; `three` is clean); `npm audit fix` brings it to 3 (the rest need vitest 5). `dev:full` under the *network* profile binds Vite to the non-loopback host while Vite 7.3.1 carries five advisories (file read / path traversal; two are Windows-only) — and the README documents that mode.
- **CI supply chain:** Actions pinned by tag on a deprecated Node-20 runtime; no Dependabot; the "exact" backend lock leaves 14 of 34 installed packages floating, has no hashes and pins an unused package (Pillow); `engines` pins the exact patch (22.23.2), so every other contributor sees `EBADENGINE`.
- **Clean install:** `pip install -r backend/requirements.txt && cd backend && pytest` → "Interrupted: 11 errors during collection", **zero tests run** *(verified by me)*; `httpx` is missing and `pytest` is listed as a runtime dependency.
- **Scripts:** `ingest-moon-textures.mjs` → `ERR_MODULE_NOT_FOUND`; `fetch_jpl_sbdb.py` appends to `backend/data/bodies.py` *and then* crashes on a deleted file, leaving production data half-modified; `testRealisticScale.mjs:11` hard-codes `/home/nomad/…`.
- **Assets and docs:** 25 textures / 38.7 MiB (71 % of tracked bytes) are loaded by no live code and have no licence record (one is flagged "verify for redistribution"); 122 markdown files (40 k lines) against 89 k lines of code; both rolling dev logs stopped on 2026-03-22 and violate their own size caps; 4 groups / 9 byte-identical duplicates in `my-notes/`; no LICENSE (the repo is private, so this is Low until it is shared).

---

## 6. Verification log — what I re-ran myself

The six reviewers are AI agents; their reports are evidence, not authority. Every High finding that can be checked offline was re-run or re-derived by me (the table below), plus a sample of Mediums. Everything else is reviewer-measured, with its script named in the finding.

| # | Claim | What I did | Result |
|---|---|---|---|
| 1 | CI failure #1 (frontend) reproduces | `npm test` on a clean `npm ci` of `main` | 21 files / 309 tests: **308 pass, 1 fail**, identical message to CI (deterministic) |
| 2 | …and is fixed by one line | changed `solarRealtimeClient.test.ts:589` in an isolated copy; ran the whole suite | **309/309 pass** |
| 3 | `typecheck` / ratchet | `npm run typecheck`; `npm run typecheck:ratchet` (real exit code) | 221 errors in 6 files; ratchet **exit 1** — two new buckets in `localPlanner.ts` (`TS7034`, `TS7005`) |
| 4 | CI failure #2 (backend) reproduces | full `pytest backend/tests` with `ci/backend-test-requirements.txt` | 8 failed / 2,134 passed / 549.6 s: CI's 7 + the supervisor-timing test |
| 5 | R3/R4 patch no longer applies | `git apply --check` on each of the 6 `scripts/ci/mutations/*.patch` at `17d1e63` | 5 apply; **`uniform-theta-area-weights.patch` fails** ("patch does not apply") |
| 6 | README test path runs nothing | fresh venv, `pip install -r backend/requirements.txt`, `cd backend && pytest --collect-only` | "1903 tests collected, **11 errors**", `Interrupted: 11 errors during collection` |
| 7 | "2,142 tests" | `pytest --collect-only -q` → count distinct functions | 2,142 items = **747 functions**; 5 parametrized functions = 828 items (38.7 %) |
| 8 | Solar request cost vs deadline | `execute_solar_physics_job` in-process, process CPU time; constants read in `server.py:912-924` | preview **8.5 s**, high **37.6 s** vs 18 s default / 19 s cap |
| 9 | Root cause is the per-line scalar loop | SCI's `trace_batch_vs_scalar.py` | scalar **28.2 s CPU** vs batched **3.8 s**; 120/120 states, 120/120 step counts equal, max endpoint diff 2.6e-15 R☉ |
| 10 | K-25 session freeze | live WebSocket client against a locally started backend | `get_orbital_elements sun` → `runtime_error`; after `resume` and `set_time_scale 50`, `jd` stays 2451550.3333, telemetry `paused:false` |
| 11 | Mission planner inverted outputs | `POST /mission/plan {}` via TestClient; TRJ's `mission_default2.py` | **422** `mission_no_feasible_recommendation`; every candidate `feasible=False`, unmet Δv 26–40 km/s, returned payload 4.6–9.5 t, P(fail) 0.000 |
| 12 | Benchmark provenance | read `reference_scenarios.json` + all 9 CSVs; searched the tree for tool material | identical `captured_utc` ×9; one number per CSV; no GMAT/Orekit/Tudat files; contradictory notes in one record |
| 13 | CORS is an allow-list | `curl -H Origin:` against the running backend | allowed origin echoed with credentials; foreign origin gets no `Access-Control-Allow-Origin` |
| 14 | Flare lifetime bug | read `solarFlares.ts:222-230,258-268`, `catalog.ts:555-560`; arithmetic | default Sun radius 0.3755 AU > 0.3 AU ⇒ `maxLifeTimeSec` = **−755 s** |
| 15 | SMBH Schwarzschild radius | recomputed 2GM/c² for Sgr A* and M87* | 1.227e12 / 1.920e15 cm vs shipped `1.24e10` / `1.9e13` (metres) — **×99 / ×101** |
| 16 | Pole mismatch | read `sunVisuals.ts:38`, `main.ts:306-318`, `planets.ts` | shader pole = world +Y; spin axis (0.126, 0, 0.992) — **90.00°** apart |
| 17 | Live-code facts | `main.ts:142-147,424-441,1303,1393-1427`; `planets.ts`; `moons.json`; `catalog.ts:475`; grep of tests | `showMoons=false`; stars `Math.random()`, `stars_catalog.json` has no importer; non-recursive `intersectObjects(targets,false)`; `animate()` has no try/catch / dt clamp / pause gate for Kuiper; Venus/Uranus/Pluto double-encode retrograde; 287/287 retrograde moons get node rate sign `-1`; 0 test files import 8 live visual/SMBH modules |
| 18 | Dead code | own reachability script (static imports, dynamic `import()`, `new Worker(new URL())`); cross-checked with Vite's module count | 33 of 70 non-test TS files / 10.0 k LOC (**36.8 %**) unreachable (checkout: 40.9 %) |
| 19 | Backend with no client | grep of live frontend for backend paths and `WebSocket`; LOC split | only `/solar/physics`, `/solar/realtime*`; **45 %** of non-test backend LOC serves endpoints with no client |
| 20 | Build / audit / secrets | `npm run build`; `npm audit`; pattern scan for keys/tokens/PEM; `.env`/key files | build OK 925.69 kB; 11 dev-only advisories; **no secrets** |
| 21 | GitHub-side facts | GitHub API: branches, PRs, issues, workflows, run + job logs, repo metadata | as in §4; CI log excerpts quoted in KF-1 |
| 22 | Browser probe | headless Chromium, production build, backend up, software GL, reduced render scale | see §4b |

**Reviewer-reported, not re-run by me** (scripts are named in each finding): the astropy/Horizons accuracy tables for planets and moons and the 18-mutant study (FEC); the PFSS/Legendre/dipole/tracer checks, REBOUND-vs-Horizons errors, 43-mutant study and Carrington cross-checks (SCI); the Izzo/Lambert Monte-Carlo, MGA oracle and containment measurements (TRJ); the WebSocket/limiter/fuzz/supervisor experiments other than #10 (API); the Node-executed solar/SMBH harnesses (SOL); the 109-row README table, supply-chain and test-shape analysis (REPO).

**Calibration notes.** (a) Two reviewer chat summaries misquoted their own files (REPO "109 commits" vs 127; TRJ Medium/Low counts) — I used the files, and checked the 127 myself. (b) The local clone is shallow, which makes "291 commits" and two "+70 k-line first commits" artefacts; GitHub's API shows 604 commits. (c) The briefing's premise that the README tells users to bind `--host 0.0.0.0` is stale — it no longer does.

---

## 7. Claims versus reality

*Full 109-row table with evidence: appendix, F-REPO-03 / table T1.* Summary:

| Source | Claims checked | True on HEAD | Notes |
|---|:-:|:-:|---|
| README, all sections | 105 | **58 (55.2 %)** | 25 true only in unreachable code, 20 false, 2 unverifiable |
| README Highlights + Features | 42 | **15 (36 %)** | 15 dead, 12 false — the part a newcomer reads |
| README backend / security / data model / commands / stack | 63 | 43 (68 %) | accurate where agents recently edited it |
| README solar + SMBH rows (SOL) | 18 | 9 | 6 false, 1 dead, 2 partly true |
| README "Project Structure" tree | 100 paths | 99 exist | but 21 of the 42 `.ts` files listed are unreachable, and the only live worker is not listed |
| GitHub repository description | 3 feature claims | 0 | gravity vectors, adaptive asteroid detail, mission trajectory planning |
| `Development_Improvements.md` rule "≤ 48 KB / 500 lines" | — | **no** | 72.8 KB / 1,354 lines; newest entry 2026-03-22; 251 commits unrecorded |
| `typescript_migration_plan.md` | — | **no** | self-inconsistent ("82 total (53 .ts, 0 .js)"), 18 of 53 paths gone |
| `docs/adr/0001–0005`, `scripts/ci/README.md` | — | **yes** | current, hedged, tied to tests — the documentation to imitate |

The most useful single observation: **the code is more honest than the README.** `main.ts:144-147` says moons are not exposed; the planner and backend capability endpoints publish `searchSpaceExhaustive:false`, `optimalityGuaranteed:false` and their own known limitations; the AIA path fails closed and says why; the CI README lists its own scope gaps. The drift is in the prose that was never revisited after the 2026-02-23 rewrite (`d1484e8`).

---

## 8. Prior issues (the 53 `K-` items from your August evaluation prompt) — status on `main`

Reviewers re-checked each item that falls in live or backend code; composite items are counted by their headline defect.

| Status | Count | Items |
|---|:-:|---|
| **Fixed** | 18 | K-01 (crash; a dead IAS15 branch and a masking test fake remain — F-SCI-13), K-04, K-05, K-06, K-07, K-10 (fail-closed), K-12, K-13, K-18, K-22 (file deleted), K-24, K-27, K-28, K-29, K-39, K-47, K-49 (secular rates, Moon plane 0.12°; duplicate Puck and hash-derived radii remain), K-51 (REBOUND/Kuiper; TudatPy still has no time scale) |
| **Partly fixed / changed** | 9 | K-03 (CI, vitest, ratchet now exist — all red), K-11 (poll 900 ms → 30 s; payload 712 KB; new deadline failure), K-14 (rigidity and gyroradius fixed; Schwarzschild radius still ×99), K-26 (CORS allow-list, opt-in overwrite; primitive remains), K-30 (relabelled `comparable_to_solver=false`; still unprovenanced), K-38 (test runner exists; undeclared-puppeteer scripts remain), K-44 (glow decay fixed; lifetime now worse at default scale), K-45 (backend profile correct; shader differs; 1.5 AU/242 AU shells), K-52 (porkchop bound and `auto` provider fixed; risk model, EPO verifier, default 422 remain) |
| **Still present** | 22 | K-02, K-08, K-09, K-15, K-16 (self-test only), K-17, K-25, K-31, K-32, K-33, K-34, K-35, K-36, K-37, K-40, K-41, K-42, K-43, K-46, K-48, K-50, K-53 |
| Not re-verified (unreachable satellite/UI stack) | 4 | K-19, K-20, K-21, K-23 |

Since August the project has fixed most of what was *Critical* then (REBOUND 5 crash, moon frames, wildcard CORS, Lambert fall-through, MGA flyby continuity, float32 worker transport, the SMBH unit errors in rigidity/gyroradius). What remains is mostly process, documentation and product-shape debt.

---

## 9. Strengths — preserve these through any refactor

- **Independent, real ground truth for the orbital core.** The planet fixture agrees with astropy's ERFA ephemeris to ≤ 8.6″ (Mercury–Mars) and ≤ 71″ (giants) at all 48 rows, so it cannot have been derived from the code under test; the oracle modules (`planetPositionCheck.ts`, `moonFrameCheck.ts`) contain no orbital mechanics. Positions stay within 14′ (Saturn) from 1800 to 2100; moon-plane normals are within 0.02° (Io), 0.4° (Titan), 0.00° (Charon), 0.15° (Cordelia), 0.12° (Moon); 14 of 18 deliberately injected defects are caught by the repo's own gates (F-FEC-12, F-FEC-21).
- **The REBOUND engine is accurate, cheap and honest.** vs committed Horizons states: outer planets ≤ 250 km, Mercury 8.3×10³ km at 2050 (83 % of its limit — the tolerances were set once and never loosened), energy error 6×10⁻¹⁶ over 10 years, bit-identical runs, 0.27 ms per frame; initial conditions pin the dataset id, query, DE440 GM source URL and a canonical SHA-256 (F-SCI strengths).
- **The PFSS/WSA mathematics is correct and provably so.** Schmidt basis vs SciPy 6×10⁻¹³; axial dipole with source surface to 3×10⁻¹⁶ (tangential field at the source surface 2×10⁻¹⁷); tracer agrees with a DOP853 reference on 60/60 lines and with analytic flux functions on 87/87; Carrington constants match sunpy to 10⁻¹¹; WSA output is nullable and never silently falls back to a default speed (ADR 0004).
- **Lambert/MGA numerics and containment.** 5,998 of 5,999 random Lambert cases agree with an independent Izzo solver to ≤ 1.4×10⁻³ km/s; degenerate inputs return `None`, never garbage; unpowered-flyby continuity is enforced; the worst accepted plan costs 0.92 s CPU, the worst porkchop 1.07 s and 95 MB; a client disconnect stops server CPU at 0.19 s; results are byte-identical across hash seeds (F-TRJ strengths).
- **Backend operations.** The process supervisor really kills and reaps (0 children after a timeout, < 250 ms after a disconnect, quarantine instead of silently releasing capacity); outbound HTTP has host allow-lists, https-only, per-hop redirect validation, byte caps and absolute deadlines (no SSRF found; 20 concurrent identical requests → 3 upstream attempts); the network security profile is fail-closed (401 everywhere but `/health/live`, WS 403 without key/origin, startup refuses wildcard CORS); the rate-limit store stays bounded under 200 k identities; K-24 was fixed properly (epoch window tied to the Horizons oracle, cancellable seeks, capped checkpoints).
- **Frontend boundaries.** The model-worker contract is a versioned float64 schema, validated on receipt, one tick in flight with a main-thread fallback; the solar clients use generation counters, `AbortController`, timeouts and terminal `dispose` and are tested with fake timers; the asteroid catalogue verifies SHA-256 *and* FNV, fails closed to a procedural belt and says so in the status line; time-scale handling (UTC → TDB with a leap-second table) is explicit and tested.
- **Fail-closed design for the speculative and the unvalidated.** The AIA texture path is defended in four layers (backend contract, validator, selection rule, control zeroing) and the GONG provider is hard-gated `disabled_unvalidated`; the SMBH panel is collapsed, badged and labelled speculative; `searchSpaceExhaustive:false` accompanies every plan.
- **Test culture.** 0 skipped/xfail tests anywhere, 3.4 asserts per backend test, no assertion-free tests, independent oracles (scipy Legendre, closed-form dipole, Horizons fixtures with `_source/_query/_retrieved`), a mutation lane with a rigorous fail-closed runner (hash-pinned inputs, exact interpreter and package match, ancestor check on fix commits, offline guard; 21 contract tests), a TypeScript ratchet bucketed by file+code, and a benchmark test that honestly asserts `comparableScenarioCount == 0` instead of faking a pass.
- **Candid engineering notes.** `docs/adr/0001–0005`, `src/sim/TESTING_NUMERICS.md`, the capabilities endpoints, `scripts/ci/README.md`'s own scope-gap list, and the plan-to-code traceability of the trajectory containment work (the plan's 8,170-Lambert-call baseline became 903 in the shipped code).
- **UI accessibility basics.** Labelled controls, `aria-pressed`/`aria-live`, visually-hidden legends, a focus-trapped panel, and `role="status"` on the catalogue state line.
- **Hygiene that is right:** no secrets or key files anywhere (pattern scan by two people), no tracked caches/bytecode, `.gitignore` sane, `npm ci --ignore-scripts`, least-privilege workflow permissions, `npm audit --omit=dev` clean.

---

## 10. Roadmap

Ordered by "what unblocks trust first". Each item names the findings it closes and an acceptance check a script can run. Nothing here needs a redesign; the *Now* list is a week of small, well-localised edits.

### Now (≤ 1 week) — make `main` green and honest

| # | Work | Closes | Acceptance (scriptable) |
|---|---|---|---|
| N1 | Fix the four reds in KF-1: the test string; the two ratchet buckets; regenerate `uniform-theta-area-weights.patch` (3 lines of trailing context) + `patch_sha256` + a `git apply --check`-every-patch test; re-point the two `wall_jd` fakes; wait ≥ 2 s for the supervisor PID | F-SOL-01, F-REPO-01, F-SCI-02, F-API-03, F-SCI-14 | `npm test` → 21 files / 309 passed · `npm run typecheck:ratchet` exit 0 · `python scripts/ci/verify_r3_r4.py --repo . --manifest ci/r3-r4-science-verification.json --artifacts <new> all` exit 0 in ≈ 30 s with 6/6 mutants killed · `pytest backend/tests` 0 failed |
| N2 | Make `/solar/physics` fit its deadline: batch `trace_field_lines`; default the UI to a fidelity that fits (and step down + back off on `solar_compute_timeout`); decode the result before reaping the child | F-SCI-01, F-SOL-02, F-API-01, F-API-02 | a test asserting `trace_field_lines` output equals the old per-line output; a CPU-time test: the UI's default request ≤ 10 s CPU on the CI runner; `GET /solar/physics` with the UI's parameters returns 200 inside 18 s; the five deadline tests pass without modification of the deadline |
| N3 | Split the CI job (frontend · science · backend); protect `main` with required checks; deliver CI changes through a PR | F-REPO-02, F-REPO-05, F-REPO-12 | GitHub shows 3 required checks; a direct push to `main` is rejected; a red frontend job no longer prevents the science job from running |
| N4 | Rewrite README Highlights/Features/Structure and the GitHub description from `index.html` + the reachability list; fix the backend install path (`backend/requirements-dev.txt` with `httpx`, `pytest`; drop `pillow`/`pytest` from runtime) | F-REPO-03, F-REPO-04, F-FEC-01, F-SOL-05, F-API-13/18 | `pip install -r backend/requirements-dev.txt && cd backend && pytest --collect-only -q` → 2,142 collected, 0 errors; a CI doc check that every path / element id / count the README names exists; re-run the claim classification: ≥ 90 % true-on-HEAD |
| N5 | Housekeeping: `npm audit fix`; delete the merged `fix/trajectory-…` branch; fast-forward or delete `sun-focus`; `git fetch --unshallow`; decide on a LICENSE | F-REPO-09/12/15 | `npm audit --omit=dev` = 0 and `npm audit` ≤ 3; `git branch -r` lists only live branches |

### Next (≤ 1 month) — make what ships correct

| # | Work | Closes | Acceptance |
|---|---|---|---|
| X1 | Sun/SMBH visuals, small items first: flare lifetime independent of display radius; stochastic flaring without an event; H29 preset ⇒ H29 model and observer-frame default OFF; hide both AGN grids at creation; `rSchwarzschildCm = 2GM/c²` and RA/Dec-derived directions; then one Sun frame (IAU, pole +Z) and the visual clock from `56930fb` | F-SOL-03/04/06/08/09/10/11/13 | new vitest files: flare lifetime ≥ 10 s at both radii; `SGR_A.rSchwarzschildCm` within 1 % of 2GM/c²; stochastic bursts with no event; preset `SgrA_WarpWave_H29` ⇒ `hypothesis:'h29'`; `metricFrameDragPeak(1,1e56)` does not throw (add the missing `SGR_A` import); in a browser, pausing leaves a Sun-surface pixel hash unchanged over 3 s |
| X2 | Frontend defects: pick Earth/Mars; realistic scale for quadtree bodies; IAU pole table; `Math.min(dt, 0.1)` and a frame `try/catch`; gate Kuiper updates on pause or on a small ΔJD; lazy Sun texture | F-FEC-04/05/07/13/19/06 | Playwright smoke: double-click Earth focuses Earth; at realistic scale Earth's apparent diameter at focus is within 2× of geometry; a 10-row IAU pole vitest < 0.1°; paused ⇒ no per-frame Kuiper upload |
| X3 | Backend residuals: don't latch `_runtime_error` on command errors; `wait_for` around WS sends; bound epochs and catch `TrajectoryInputError` → 422; add `logging`; key or Host check on the report writer; `kuiper_seq` | F-API-04/05/06/07/09/10, F-TRJ-05 | WS test: `get_orbital_elements sun` → typed error and `jd` still advances; `departure_jd=1e20` → 422; a log line per 429/401/503; foreign-Host POST to the writer → 4xx |
| X4 | Validation honesty: relabel the benchmark `unverified_placeholder` and add an in-repo oracle (Horizons fixtures + independent Lambert); fix mission accounting; rename or split the Δv field | F-TRJ-01/02/03/06/09 | `GET /benchmark/accuracy` reports `validated:false` or ≥ 1 comparable scenario with pass/fail; infeasible mission candidates have `failureProbability = 1` and `returnedPayloadKg = 0` (tests); `POST /mission/plan {}` is 200, or 422 with `alternatives[*].verification.reasons`; EPO smoke exits non-zero on failure |
| X5 | Close the test gaps: `solarFlares`, `smbhPhysicsConstants`, `agnShockwaveEngine` tests; one real-REBOUND `/ws/sim` session; one Playwright smoke; mark the 24 heavy solar tests `slow`; kill the surviving PFSS/WSA mutants; add a Lambert propagation oracle test | F-SOL-12, F-API-12, F-REPO-10/11, F-SCI-06, F-TRJ-09 | the listed tests exist; full CI ≤ 5 min on the fast lane; the 7 surviving mutants die |
| X6 | Repository hygiene: remove the 19 unreferenced textures and put the 6 dead-referenced ones behind LFS; move `my-notes/`, root research files and agent logs to `docs/archive/`; fix or delete the broken scripts (make `fetch_jpl_sbdb.py` atomic); pin Actions by SHA + Dependabot; `THIRD_PARTY_NOTICES.md` | F-REPO-06/07/09/13/15/17, F-FEC-16/17 | tracked size < 20 MiB; ≤ 12 files at the repo root; every `scripts/*` runs with `--help` in CI; no duplicate files by sha256 |

### Later — structure and product shape

| # | Work | Closes |
|---|---|---|
| L1 | Split `server.py` (config → security → runtime → ws → routes) and extract `modelBridge` / `beltManager` / `panelController` from `main.ts` — target `server.py` < 300 lines, `main.ts` < 600 lines with exports, ≤ 20 monkeypatched module attributes in tests | F-API-11, F-FEC-09, F-FEC-08 |
| L2 | **Decide the product shape (KF-6).** Either wire an engine selector / planner into the page, or declare the backend an API and move the dormant stack out of the shipped README; delete or wire the 33 unreachable files and their tests | F-REPO-03, KF-6/7 |
| L3 | Real-data validation: one real GONG map parsed in a test (then decide the monopole policy); a real Horizons capture per body for the ephemeris parser; real GMAT/Orekit/Tudat captures *if* a "strict" tier is to be claimed | F-SCI-07, F-TRJ-08, F-TRJ-01 |
| L4 | Fidelity items: secular rates in the backend ephemeris; initialise element-fallback bodies at their epoch (up to 5.6° today); a magnetogram coherent in time and with the corona's active regions; TudatPy time scale | F-TRJ-07, F-SCI-03/04/09 |

---

## 11. Branch recommendation

- **`main` is the canonical branch.** It contains every commit on `sun-focus` plus 184 more (CI, PFSS/GONG, trajectory containment, moon ephemeris, security profile, tests); `sun-focus` has nothing unique.
- **Retire or fast-forward `sun-focus`.** `git push origin origin/main:sun-focus` (fast-forward) if you want to keep the name, otherwise delete it. The README title still says "Sun-Focus branch".
- **Delete `fix/trajectory-amplification-defense-in-depth`** — fully merged, 166 behind.
- **Point your tooling at `main`.** This session (and any environment configured with `sun-focus`) starts 184 commits behind the real code; that is how an evaluation of the "checked-out" tree would have been of stale code.
- **Do the first protected-branch merge with the KF-1 fixes**, so the new CI is exercised before it is relied on.
- `git fetch --unshallow` in each local clone: the shallow boundary hides 313 commits and fabricates two "+70 k-line" mass-import commits that distort any history analysis.

---

## 12. Not inspected, and limits of this evaluation

- **GPU behaviour.** No WebGL hardware: shaders were read, ported (granulation, hashes) and arithmetic-checked, never compiled on a GPU; on-screen colours, frame times and the visual weight of F-SOL-04/10 are computed, not seen. My browser probe used software GL at a reduced render scale (§4b).
- **Live upstream services.** JPL Horizons/SSD, NOAA SWPC, SIDC/SILSO, GONG and Helioviewer were unreachable through the proxy. The Horizons parser has only been exercised on hand-written fixtures, and the GONG provider has never parsed a real file (F-TRJ-08, F-SCI-07); "≈ 7 upstream calls per cache miss" is from code, not a capture.
- **TudatPy** (conda-only) is not installed — read, not run. **Windows/macOS** behaviour and git versions other than 2.43.0 (CI used 2.55.0) were not tested.
- **GitHub settings** beyond what the API exposes (rulesets, secret scanning, Dependabot alerts) could not be read; `protected:false` refers to classic branch protection only.
- **Texture and data licences** at their sources could not be re-verified (egress blocked); statements about them are marked unverified. **Paper-level provenance** of the Neckel & Labs and Snodgrass coefficients was not checked.
- **Not read:** `my-notes/` content, the LaTeX/PDF research documents, most `agent-notes/` beyond the K-item index and the files cited, `style.css` beyond skims, and the unreachable satellite/UI stack (K-19, K-20, K-21, K-23).
- **Reviewer independence.** The six reviewers shared one VM (load 1.4–7 during their runs); wall-clock figures are therefore inflated and conclusions rest on CPU-seconds, repetitions and the CI runner's identical failures. All reviewers are AI agents: I re-verified every High finding that can be checked offline and a sample of Mediums (§6); the remaining Medium/Low findings are reviewer-measured, with their scripts named.
- **Evidence retention.** Reviewer scripts and outputs live in this session's scratch directory, which is discarded when the container is reclaimed. `CODEBASE_EVALUATION_REPORT_2026-10-06_APPENDIX_B_REVIEWERS.md` keeps the reviewers' full reports, including the commands and outputs they quote.

---

## Appendix A — Findings index (102 reviewer findings)

Sorted High → Low, then by reviewer area (SOL solar/SMBH visuals · API backend HTTP/WS · SCI backend science · TRJ trajectory/mission/benchmark · FEC frontend core · REPO repo/CI/tests). **V** = verified (read in full and/or executed), **S** = suspected (the finding says what would close it). Effort: S ≤ 1 h · M ≤ 1 day · L > 1 day. Findings that two or more reviewers made independently: F-SOL-02 = F-API-01 = F-SCI-01 (solar deadline); F-REPO-01 = F-SCI-02 (stale mutation patch); F-SOL-01 / F-REPO-02 / F-API-03 / F-SCI-14 (CI red); F-REPO-03 ≈ F-FEC-01 ≈ F-SOL-05 (README); F-REPO-04 ≈ F-API-18 (requirements); F-API-07 ≈ F-SCI-05 (Kuiper rate); F-REPO-11 ≈ F-API-03 (wall-clock tests); F-API-09 ≈ F-TRJ-05 (HTTP 500 on extreme epochs). Full text, evidence and fixes: `CODEBASE_EVALUATION_REPORT_2026-10-06_APPENDIX_B_REVIEWERS.md` (Appendix B).

| ID | Sev | | Reach | Eff | Title | Where |
|---|---|:-:|---|:-:|---|---|
| F-SOL-01 | High | V | CI | S | CI is red because solarRealtimeClient.test.ts:589 asserts prose that commit 09d87ac reworded | src/frontend/features/solar/solarRealtimeClient.test.ts:584-590,605 |
| F-SOL-02 | High | V | LIVE + BACKEND | S | The Sun's default /solar/physics request (high, 180 features) needs ~34 s CPU against a hard 18 s backend deadline | src/sunController.ts:171-177 |
| F-SOL-03 | High | V | LIVE | S | Flares and CMEs are never visible at the default (display) scale, and at real scale only the first four ever show p… | src/frontend/features/solar/solarFlares.ts:226-228,262-267,298 |
| F-SOL-04 | High | V | LIVE | M | Three incompatible "pole" conventions in the Sun stack: shader pole ⟂ spin axis; backend pole = +Z; the same backen… | src/frontend/features/solar/sunVisuals.ts:38 |
| F-SOL-05 | High | V | DOC | S | README "Solar model" / "SMBH shockwave modeling" / Highlights: of 18 checked claims, 6 are FALSE, 1 is dead code, 2… | README.md:9-10,254-264,270-273 |
| F-API-01 | High | V | — | M | /solar/physics cannot meet its own 18 s hard deadline at operational/high/ultra, and the live frontend asks for high | backend/server.py:912-924 |
| F-SCI-01 | High | V | — | S | Root cause of the /solar/physics deadline overrun: the 80–180 display lines are traced one at a time through the pu… | backend/sim/pfss_magnetogram.py:417-470 |
| F-SCI-02 | High | V | CI | S | The R3/R4 mutation lane cannot go green: uniform-theta-area-weights.patch has no trailing context and does not appl… | scripts/ci/mutations/uniform-theta-area-weights.patch:4 |
| F-TRJ-01 | High | V | — | S | "Strict GMAT/Orekit/Tudat" reference data is unprovenanced, contradicted by an independent Lambert, and the benchma… | backend/benchmark/reference_scenarios.json:5,14-19,25,48 |
| F-TRJ-02 | High | V | — | M | Mission planner: payload closure and risk model give inverted answers; the default request can never succeed and it… | backend/mission/mining_service.py:77-81 |
| F-FEC-01 | High | V | DOC (claims about LIVE) | S | README "Highlights/Features" describe ≥12 things the live page does not do | README.md:8,11,12,14,15,42,57,230,238,242-248,282,400 |
| F-REPO-01 | High | V | CI | S | The R3/R4 science lane cannot pass on HEAD: uniform-theta-area-weights.patch no longer applies (aborts at mutant 2) | scripts/ci/mutations/uniform-theta-area-weights.patch:4 |
| F-REPO-02 | High | V | CI | M | HEAD has never been green on any lane, and the CI was never run against its own changes before landing | .github/workflows/r3-r4-science.yml:1-112 |
| F-REPO-03 | High | V | DOC | M | README materially misdescribes the shipped product: only 36% of its Highlights+Features claims are true on HEAD (K-… | README.md:1-19 |
| F-REPO-04 | High | V | DOC/DEPS | S | The README's backend install-and-test path executes zero tests on a clean machine; backend/requirements.txt is inco… | backend/requirements.txt:1-11 |
| F-SOL-06 | Medium | V | LIVE | M | Procedural solar motion runs on the wall clock and keeps moving when the simulation is paused; the earlier fix (569… | src/frontend/features/solar/sunVisuals.ts:245,280,690,1673 |
| F-SOL-07 | Medium | V | LIVE + BACKEND | S | The realtime/AIA pipeline is live code that can never change a pixel, yet the UI offers a "Solar observation channe… | index.html:141-149 |
| F-SOL-08 | Medium | V | LIVE | S | "Continuous stochastic flaring" does nothing unless a Cataclysmic Event is already running | src/sunController.ts:593-598 |
| F-SOL-09 | Medium | V | LIVE | S | Cataclysmic Events panel: default observer-frame projection desynchronises the visual front from the model, and the… | index.html:276-345 |
| F-SOL-10 | Medium | V | LIVE | S | Two AGN grid meshes (148,225 + 16,641 vertices, frustumCulled=false) are drawn every frame from startup with their … | src/sunController.ts:457-461,486 |
| F-SOL-11 | Medium | V | — | S | SMBH source catalogue holds verified wrong or invented values (Schwarzschild radii 100× small, sky directions 33–92… | src/frontend/features/superluminal-modeling/smbhPhysicsConstants.ts:… |
| F-SOL-12 | Medium | V | CI | M | Test effort is inverted: 959 + 426 test lines guard the inert delivery stack, zero tests touch 4,561 lines of live … | no test imports sunVisuals.ts |
| F-SOL-13 | Medium | V | LIVE | S | At the default display scale the corona shell is 1.50 AU and the Parker spiral extends to 242 AU (beyond the 200 AU… | src/frontend/features/solar/sunVisuals.ts:970,1546-1548 |
| F-SOL-14 | Medium | V | LIVE | M | Shader fidelity claims differ from what the shader computes (limb darkening ≈ colour-neutral, granulation RMS 4.9 %… | src/frontend/features/solar/sunVisuals.ts:94-111,255-259,296-312,337 |
| F-API-02 | Medium | V | — | S | Supervisor discards a finished, validated result when the child needs more than 0.25 s to exit | backend/sim/process_supervisor.py:36 |
| F-API-03 | Medium | V | CI | S | CI is red for three different reasons; classification of the eight failing tests | backend/tests/test_solar_physics_api.py:70,166,282,380,1033 |
| F-API-04 | Medium | V | — | S | K-25 still present: one 41-byte command freezes a WebSocket session while telemetry says paused:false (the only in-… | backend/server.py:4332-4339 |
| F-API-05 | Medium | V | BACKEND (local profile) | S | K-26 residual: POST /benchmark/accuracy/report still lets an unauthenticated caller overwrite any .md under my-note… | backend/server.py:4167-4222, :2766-2789 |
| F-API-06 | Medium | V | BACKEND | S | WebSocket stalled reader: no send timeout or idle eviction; connection, thread and ~40 % of a core are held indefin… | backend/server.py:4679-4708 |
| F-API-07 | Medium | V | — | M | K-50 residual: with Kuiper active the sim runs at 3–27 % of the requested time_scale at 100 % CPU, and a paused ses… | backend/server.py:4354-4357 |
| F-API-08 | Medium | V | BACKEND (local profile una | S | GET /solar/realtime/aia-tile has no jd range check and an exact-float cache key: every distinct jd_tdb is a cache m… | backend/server.py:3063-3092 |
| F-API-09 | Medium | V | BACKEND | S | Schema-valid but absurd numeric inputs reach internal TrajectoryInputError and surface as plain-text HTTP 500; plan… | backend/trajectory/lambert.py:168-175 |
| F-API-10 | Medium | V | BACKEND | S | No server-side logging at all; 503/429/401/timeout/discard paths are invisible to an operator | backend/server.py |
| F-API-11 | Medium | V | BACKEND | L | server.py is a 4,905-line composition root with 24 module-level stateful objects, a dead production seam, and 168 t… | whole file |
| F-API-12 | Medium | V | CI / BACKEND | M | Test strategy gaps in the backend API layer: tests that pass for the wrong reason, a source-text test, and no end-t… | backend/tests/test_solar_physics_api.py:1059-1079 |
| F-SCI-03 | Medium | V | — | S/M | 13 catalogue bodies are placed by a 26-year two-body back-propagation: at their own element epoch the engine is off… | backend/sim/rebound_nbody.py:326-353 |
| F-SCI-04 | Medium | V | LIVE | S/M | The synthetic magnetogram is white noise in time, ignores Hale's law, and is unrelated to the corona's active regions | backend/sim/pfss_magnetogram.py:123 |
| F-SCI-05 | Medium | V | — | S/M | Kuiper sub-simulation: 47 ms/frame at the default 4 d/s (budget 16.7 ms), 1.8 s/frame at 365 d/s; the main sim's cl… | backend/sim/kuiper.py:434-445 |
| F-SCI-06 | Medium | V | CI | S | The PFSS/WSA tests are blind to 7 of 41 non-equivalent single-line mutants (integrator order, weak-field floor, WSA… | backend/tests/test_pfss_tracing.py |
| F-SCI-07 | Medium | S | DATA/BACKEND (runtime-disa | M | GONG provider: everything "validated" is self-referential; no real pixel/header has ever been parsed, and two ADR-q… | backend/sim/gong_magnetogram.py:478-537 |
| F-SCI-08 | Medium | V | UNREACHABLE | S | UNREACHABLE radiation_pressure.py and galactic_tide.py contain formula errors and docstring numbers that are wrong … | backend/sim/radiation_pressure.py:30-49 |
| F-SCI-09 | Medium | V | — | S | TudatPy engine: J2/J4 flags cannot have any effect (each 30-day chunk is re-seeded from SPICE), the state omits jd_… | backend/sim/tudatpy_hooks.py:541-557 |
| F-TRJ-03 | Medium | V | BACKEND | M | totalDeltaVKmS is a heliocentric v∞ sum (no parking/capture orbit) yet is called "propulsive burns" and fed to the … | backend/trajectory/lambert.py:780-781 |
| F-TRJ-04 | Medium | V | — | M | MGA search is a single-departure-date, 8-seed heuristic: it misses a feasible assisted route 21 km/s better, misses… | backend/trajectory/mga.py:451-476 |
| F-TRJ-05 | Medium | V | BACKEND | S | Extreme-but-finite epochs escape the typed-error contract: HTTP 500 on /trajectory/plan and /mission/plan; no epoch… | backend/trajectory/lambert.py:158-175 |
| F-TRJ-06 | Medium | V | SCRIPT (documented as a va | S | EPO smoke test passes 0/30 with exit code 0; the module has no tests and a verifier that rejects every correct result | backend/mission/epo/verifier.py:31,53 |
| F-TRJ-07 | Medium | S | — | S | Horizons/SPICE provider code (≈ 60 % of the 1,575-line file) has only ever parsed hand-written payloads; real-API c… | backend/mission/ephemeris_service.py:1047-1291,1449-1543 |
| F-TRJ-08 | Medium | V | CI/test | S | Lambert/MGA correctness rests on self-generated golden values and faked legs; there is no independent-oracle test (… | backend/tests/test_lambert_solver_reference.py:19-47 |
| F-FEC-02 | Medium | V | — | S | Node precession has the wrong sign for retrograde moons (285 mean-element moons + Triton) | src/sim/catalog.ts:442-468,474-475 |
| F-FEC-03 | Medium | V | LIVE-GATED / DATA | L | Only 4 of 424 moons are ephemeris-grade; Io/Europa/Moon/Triton lose phase within weeks (documented, hidden) | src/data/moonEphemerisChebyshev.json |
| F-FEC-04 | Medium | V | LIVE | S | Double-click "follow" cannot select Earth or Mars | src/main.ts:324-329,1296-1317 |
| F-FEC-05 | Medium | V | LIVE | M | "Realistic scale" leaves Earth at 39x and Mars at 2x; labels and focus floor are not rescaled (K-43) | src/main.ts:324-329,371-373,586-588,700-718 |
| F-FEC-06 | Medium | V | LIVE | S-M | ≈1.3 s of synchronous startup JS before the first canvas frame, then 0.4-0.8 s of jank when the catalog arrives | src/main.ts:246-254 |
| F-FEC-07 | Medium | V | LIVE | S | 5,000 Kuiper objects re-propagated and re-uploaded every frame (also while paused); HUD rewrites 3 DOM nodes/frame | src/main.ts:1405-1410 |
| F-FEC-08 | Medium | V | LIVE | M | The model worker costs ≈640 LOC and a second code path to offload 8 µs of work | src/main.ts:168-182 |
| F-FEC-09 | Medium | V | LIVE | L | main.ts has re-grown into a 1,501-line, export-less monolith while 1,006 LOC of extracted siblings sit dead beside it | src/main.ts |
| F-FEC-10 | Medium | V | — | M | H29 "metric kinematics" live inside the standard orbital model: frame-rate dependent, non-integrating, runs while p… | src/sim/solarSystemModel.ts:169-202 |
| F-FEC-11 | Medium | V | LIVE / DATA | M | The "verified Phase-1 catalog" carries synthetic taxonomy/albedo and 3-significant-figure periods | scripts/build_asteroid_phase1_dataset.py:118-138,214 |
| F-FEC-12 | Medium | V | CI / TEST | M | The ground-truth gates are real and effective, but five blind spots remain | src/sim/planetPositionCheck.ts:42-95 |
| F-FEC-13 | Medium | V | LIVE (visible on Earth/Mar | S-M | Planet spin axes do not follow IAU poles; Venus, Uranus and Pluto rotate the wrong way | src/main.ts:308-318,722-737, src/data/planets.ts |
| F-REPO-05 | Medium | V | CI | S | CI job structure couples independent gates; the workflow test locks the coupling in; the evidence-upload step masks… | .github/workflows/r3-r4-science.yml:47-81 |
| F-REPO-06 | Medium | V | SCRIPT | S | Documented maintenance commands are broken or unsafe, and several scripts depend on undeclared tools (K-33 STILL-PR… | scripts/ingest-moon-textures.mjs:5 |
| F-REPO-07 | Medium | V | DATA | S | 38.7 MiB (71 % of tracked bytes) of textures is referenced by no live code, absent from the build, with no LFS (K-3… | src/assets/textures/* |
| F-REPO-08 | Medium | V | SCRIPT | S | dev:full under the network profile also binds the Vite dev server to the non-loopback host while installed Vite 7.3… | scripts/dev-full-config.mjs:104-112 |
| F-REPO-09 | Medium | V | DEPS/CI | S | Frontend/CI supply chain: 11 dev-toolchain advisories (8 fixable without a major bump), tag-pinned Actions on a dep… | package.json:6-9, 27-36 |
| F-REPO-10 | Medium | V | TEST | M | Test strategy: the headline "2,142 tests" is 747 functions; no integrated end-to-end test exists; 39 TS modules are… | backend/tests/ |
| F-REPO-11 | Medium | V | TEST/CI | M | Wall-clock-dependent tests: 24 solar-generation tests consume 85 % of the 550 s suite, five assert a real 18 s prod… | backend/server.py:917-924 |
| F-REPO-12 | Medium | V | PROCESS | S | Process: shallow local history, whole-day bulk pushes, no PR/review gate, mislabelled commit types, stale branches | repository history/settings |
| F-SOL-15 | Low | V | LIVE | S | Realtime client validation is correct for what it checks but disproportionate and inconsistent | src/frontend/features/solar/solarRealtimeClient.ts:226-435 |
| F-SOL-16 | Low | V | — | S | smbhPropagation.ts:120 default parameter references an unimported SGR_A (TS2304): a real, currently latent Referenc… | src/frontend/features/superluminal-modeling/smbhPropagation.ts:17-21 |
| F-SOL-17 | Low | V | UNREACHABLE | S | UNREACHABLE solarProminences.ts (372 LOC) and solarWind.ts (193 LOC) are advertised in the README | src/frontend/features/solar/solarProminences.ts, solarWind.ts |
| F-SOL-18 | Low | V | LIVE | S | The procedural Sun texture is generated synchronously at startup (≈0.7–0.8 s) for a 38 % mix | src/main.ts:246 |
| F-SOL-19 | Low | V | DOC | S | Stale or wrong comments/docs in the solar/SMBH files |  |
| F-API-13 | Low | V | DOC | S | Documentation and configuration drift around the security profile and tunables | README.md:90-91 |
| F-API-14 | Low | V | BACKEND | S | Absolute-path disclosure and four different error-body shapes | backend/sim/rebound_nbody.py:150-153,163-170 → /health |
| F-API-15 | Low | V | BACKEND / DOC | S | Two security controls depend on uvicorn CLI flags the app cannot enforce | backend/server.py:1594-1657 |
| F-API-16 | Low | V | BACKEND | S | WebSocket handler lifecycle hygiene: unprotected runner start (latent leak), unretrieved task exceptions on every a… | backend/server.py:4805-4824 |
| F-API-17 | Low | V | BACKEND | S | One two-thread pool shared by plan/lambert/porkchop/mission/benchmark gives cross-endpoint head-of-line blocking | backend/server.py:1276-1281,1413-1416 |
| F-API-18 | Low | V | CI / DOC | S | backend/requirements.txt still lacks httpx (needed by every TestClient test), keeps pytest as a runtime dependency … | backend/requirements.txt:1-10 |
| F-API-19 | Low | V | BACKEND | S | Horizons transport follows redirects to any host (inconsistent with the solar provider's allow-list) | backend/mission/ephemeris_service.py:1078,1233 |
| F-SCI-10 | Low | V | LIVE | S | API labels outrun the models: quasi_mhd_corona_v4, the solar fidelity ladder, an unqualified synthetic carrington_r… | backend/sim/solar_physics.py:221 |
| F-SCI-11 | Low | V | LIVE | S | The WSA-inspired relation has no citation, deviates from the form its coefficients come from, can never exceed 677.… | backend/sim/pfss_magnetogram.py:535-559 |
| F-SCI-12 | Low | V | LIVE | S | solar_physics.py numerics: the "analytic peak" of the normalised Hathaway cycle is wrong (flat top for 15 months), … | backend/sim/solar_physics.py:137-143 |
| F-SCI-13 | Low | V | BACKEND | S | K-01's "IAS15 setup" block is a silent no-op under REBOUND 5.1.1 and a test still fakes ri_ias15 | backend/sim/rebound_nbody.py:288-296 |
| F-SCI-14 | Low | V | CI | S | Vestigial wall_jd parameter in four private model methods is the root of the two remaining wall_jd test failures | backend/sim/solar_physics.py:416-424,448-456,547-558 |
| F-TRJ-09 | Low | V | BACKEND / DATA | M | The kepler/auto provider has no secular rates: 35–260 k km inner-planet errors (up to 13.8 M km for Saturn in 2100)… | backend/data/bodies.py:10-163 |
| F-TRJ-10 | Low | V | BACKEND | S | Lambert "certificate" checks only time of flight: acos-based transfer angle returns certified garbage near 180° and… | backend/trajectory/lambert.py:499-500 |
| F-TRJ-11 | Low | V | BACKEND | S | Containment residuals: sustained duty cycle, biased truncation, advertised grid cap unreachable | backend/server.py:1050-1055 |
| F-TRJ-12 | Low | V | DOC + BACKEND | S | Labels and docs: pathLengthAu is a chord, "feasibilityCertified" is a numeric acceptance flag, README describes pla… | backend/trajectory/lambert.py:782,792 |
| F-FEC-14 | Low | V | LIVE | S | Belt shader numerics: fp32 Julian-date uniform steps and a physically meaningless "perturbation" (K-15, K-48) | src/frontend/features/asteroids/beltRenderer.ts:22,65,154-164,460-463. |
| F-FEC-15 | Low | V | LIVE / TEST | S | Phase-1 loader residuals: self-test fails by construction; binary fetched without cache validation; no timeout (K-1… | src/data/asteroidCatalogLoader.ts:185,285,305,319-387 |
| F-FEC-16 | Low | V | SCRIPT | S | Dev tooling that does nothing or fails: dev:ui size flags, dev:full --backend-port, ingest:moon-textures (K-33) | src/frontend/app/sceneSetup.ts:92-145 vs src/main.ts:61-65,213 |
| F-FEC-17 | Low | V | DATA / LIVE | S | 39 MB of orphan textures, 0.9 MB of unreferenced public/ assets, and a render-blocking third-party font import (K-34) | src/assets/textures/ |
| F-FEC-18 | Low | V | — | S-M | Vestigial and duplicated numerics: ≈120 lines of discarded frame conversion, 4+1 Kepler solvers, stale comments | src/sim/catalog.ts:140-155 |
| F-FEC-19 | Low | V | LIVE | S | Runtime hygiene: no frame-loop isolation, no dt clamp, belt swap leaks instance buffers and drops scale mode, hidde… | src/main.ts:481-488,1395-1447,1397, beltRenderer.ts:478-481. |
| F-FEC-20 | Low | V | LIVE (type debt) / LATENT | S | main.ts tsc: 18 errors, all benign; one real latent bug surfaced via the SMBH file | $S/tsc_main.txt src/main.ts rows |
| F-FEC-21 | Low | V | LIVE / DOC | S | The accuracy envelope of the planet model is not surfaced: Standish Table 1 is valid 1800–2050, Earth is the Earth–… | src/data/planets.ts:14-26, src/main.ts:1395-1401, index.html |
| F-REPO-13 | Low | V | DEPS/CI | S | The CI backend "exact lock" is not a lock: 14 of 34 installed packages float; no hashes; one pinned package is unus… | ci/backend-test-requirements.txt:1-21 |
| F-REPO-14 | Low | V | CI | S | R3/R4 verifier soundness notes: kill-reason regex matches traceback source; pins are self-attesting; offline guard … | scripts/ci/verify_r3_r4.py:607 |
| F-REPO-15 | Low | V | DOC/DATA | S | No LICENSE/NOTICE; third-party asset and data licences are unrecorded except for moons; one shipped texture is flag… | repo root |
| F-REPO-16 | Low | V | DOC | S | The two rolling dev logs and several status docs are stale or violate their own rules (K-53, K-36 STILL-PRESENT) | Development_Improvements.md:17, 30-35, 50-291 |
| F-REPO-17 | Low | V | DOC/HYGIENE | S | Repository clutter, duplicated research notes, personal paths | repo root |
