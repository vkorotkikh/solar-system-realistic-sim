# Major-Issues Audit Prompt — solar-system-realistic-sim

> **How to use this file.** Everything below the horizontal rule is a self-contained prompt. Paste it into an AI coding agent with shell access to a checkout of this repository, or hand it to a human reviewer. The agent writes its report to `agent-notes/MAJOR_ISSUES_REPORT_<YYYY-MM-DD>.md`.
>
> **Provenance.** Rewritten 2026-08-23 from `agent-notes/codebase_evaluation_prompt_2026-08-22.md` after the full comprehensive evaluation it specified was actually run the same day against `main @ aa6e39a` (report: `agent-notes/CODEBASE_EVALUATION_REPORT_2026-08-23.md`; browser rendering: `agent-notes/audit.html`; artifact: https://claude.ai/code/artifact/994b9e3d-8040-41a7-9b05-10f05e22350c). The objective has changed. The comprehensive prompt produced a scorecard, feature matrices, and readiness verdicts; those exist now and do not need to be rebuilt. **This prompt exists to identify, adversarially confirm, and rank the repository's major issues** — including the ones the prior passes could not reach: the planned independent adversarial-verification pass never ran (agent budget exhaustion), several dynamic checks were blocked (report §13), and `origin/sun-focus` — the actual line of development, 69 commits ahead — has never been audited at all.
>
> **Budget.** Multi-hour. Phase 1 is mostly re-execution of documented repro commands; Phases 2–3 are original work. Run phase by phase across sessions if needed, carrying the report file forward.

---

## 1. Objective and definition of "major issue"

Produce a single, severity-ranked register of every **major issue** in this repository, each independently confirmed, with reproduction evidence a second engineer can follow. Do not score, do not build feature matrices, do not write readiness verdicts — cite the 2026-08-23 report for those. Spend the reclaimed effort on depth of confirmation and breadth of discovery.

A **major issue** is any of:

1. **Silent wrong results** — code that produces incorrect numbers, positions, dates, or Δv and presents them as correct: no error, no fallback label, no uncertainty statement.
2. **False capability claims served at runtime** — endpoints or UI reporting engines/features as available or high-fidelity when the code path fails or does not exist (e.g. `/health` advertising an integrator that cannot initialize).
3. **Crash, hang, or denial of service** reachable by a user of the app or a peer on the network.
4. **Security exposure** — file writes/reads outside intent, request amplification or SSRF surface, origin-reflecting CORS with credentials, unauthenticated destructive endpoints, information leakage.
5. **Data-integrity and provenance failures** — committed reference data that cannot be reproduced from its stated source, artifacts that fail their own validation, benchmarks whose pass criteria are vacuous, tests that mock away the defect they exist to catch.
6. **Unbounded resource growth** — threads, memory, GPU resources, sockets, or caches that grow without limit under normal operation.
7. **Contract mismatch between two live components** — units, frames, time scales, schemas, or message ordering that disagree across a boundary that is actually exercised.
8. **Reactivation traps** — defects in dormant code that would silently produce any of the above on the day the module is rewired. Report these one severity notch lower than their live equivalent, but report them: the repo's own roadmap documents (`agent-notes/phase1_closure_and_hardening_todos.md`, the README) target exactly these modules.

**Not major** (exclude unless it compounds a major issue): naming, style, duplication without behavioral drift, stale comments, missing docstrings, dead files, general hygiene. The comprehensive report already inventories these.

## 2. Ground rules

- **Read-only.** Do not modify repository files. Builds, venvs, servers, corrupted-data copies, screenshots, and regenerated datasets go in temporary directories. The report and its companion files are the only writes, and they go to `agent-notes/`.
- **Trust current source and reproduced command output** over README claims, dist files, work logs, prior audits — and over the two register documents named in §3. A Vite build passing proves nothing about types; passing unit tests prove nothing about scientific validity; a source file existing proves nothing about a feature being active.
- **Adversarial confirmation is mandatory.** Every major issue you intend to report gets an explicit refutation attempt *after* it is drafted: re-check line numbers against the file, look for guards in callers, confirm the code is reachable, re-run the repro from a clean state, and ask whether the impact is overstated. Record the attempt and its outcome inside the finding. A finding without a recorded refutation attempt is a draft, not a finding.
- **Verification labels.** Mark every finding `[re-executed]` (you ran something that demonstrates it), `[source-verified]` (you read the full relevant code path), or `[artifact-only]` (you are relying on a prior run's captured output — say whose). Attach a confidence level consistent with the label.
- **Report "not run" and "blocked" separately from "failed" and "passed."** Do not penalize what you could not test; do not award confirmation to what you did not test.
- **Both branches are in scope**: `main @ aa6e39a` and `origin/sun-focus @ fd793f4` (69 ahead / 7 behind, merge-base `c3b00e0`). A fix on `sun-focus` does not close an issue on `main`; state where each issue stands on each branch. Audit `sun-focus` in a throwaway worktree (`git worktree add <tmp>/ssrs-sunfocus origin/sun-focus`), never by checkout in the working tree.

## 3. Inputs — hypotheses, not findings

Two prior registers exist. Treat every item as a hypothesis with evidence attached, not as a finding to copy:

- **F-register**: `agent-notes/CODEBASE_EVALUATION_REPORT_2026-08-23.md` §5, findings **F-01..F-20**, each with exact `path:line` citations and reproduction commands, plus §7 (numerical results), §9 (security), §13 (checks that did NOT run). All were re-derived or re-executed by a single reviewer; **none received an independent adversarial pass**.
- **K-register**: `agent-notes/codebase_evaluation_prompt_2026-08-22.md` §8, items **K-01..K-53**, from the 2026-08-22 grounded scan. Most are subsumed by F-items; some (especially the Medium band and the dormant-stack items K-18..K-23) are not.

Disposition rule: for every F-item and every K-item not subsumed by an F-item, classify as **CONFIRMED** (your own evidence, label per §2), **REVISED** (real, but the mechanism, severity, or blast radius differs from the register — say exactly what changed), **REFUTED** (with the proof), or **NOT RETESTED** (with the reason). Never copy register text into your findings; write your own from your own evidence.

Known citation erratum to carry forward: the report's shorthand `beltRenderer.ts` resolves to `src/frontend/features/asteroids/beltRenderer.ts` (the report's §2 map shows the `frontend/` segment; some finding bodies omit it).

## 4. Work plan

### Phase 0 — Baseline sanity (short)

`git rev-parse HEAD`, `git status --short --branch`, tool versions. If HEAD ≠ `aa6e39a`, diff against it and flag every changed file that carries a register item before relying on any cited line number. Build the environment per Appendix A. Do **not** re-run the full comprehensive baseline; re-run only what a specific finding needs.

### Phase 1 — Adversarial pass over the register

Work the F-register in impact order: **F-01** (belt rendered inside the Sun — shader applies `instanceMatrix` after the orbital offset), **F-02** (default ias15 path fails under REBOUND 5.1.1 while `/health` reports it available and `test_seek_optimizations.py:37` mocks the missing attribute), **F-03** (benchmark references unreproducible — see special handling below), **F-04** (N-body initialized from mean elements as osculating → 60 M km Saturn error), **F-05** (moon frame conversion drops ω/M re-referencing → Io ~2 orbital radii off at epoch), **F-06** (Lambert served without TOF-residual certificate), **F-11** (security posture), **F-19** (cross-engine units/frame contract), then the remainder, then unsubsumed K-items.

For each: run the report's repro command yourself from a clean state, then actively try to break the finding — wrong line, guard elsewhere, unreachable path, tolerable impact, environmental artifact of the prior run (SwiftShader, port rerouting, unpinned dependency drift since 2026-08-23).

**F-03 special handling — provenance, not just numerics.** The report found the committed "strict GMAT/Orekit/Tudat" references began life as round placeholders (8.6 / 7.2 / 17.0, tolerances 5–10 km/s, source "…-blend") and were replaced one day later by 5-decimal "tool captures" whose artifact rows share a single identical `captured_utc`, with no kernels, inputs, versions, or logs; meanwhile an independent Lambert on Horizons states matches the *model* to ≤15 m/s. Re-derive this from git history yourself (`git log --follow -p backend/benchmark/`), re-run the independent oracle, and state plainly which of these the evidence supports: genuine tool captures, transcription error, or fabricated reference data. This is a data-integrity finding either way — the benchmark gate currently fails the model against numbers nothing can reproduce.

### Phase 2 — Close the blocked checks

Each item below was planned in the comprehensive evaluation and did not run (report §13). Each is a place a major issue may be hiding. Execute what the environment allows; report the rest as blocked with the exact blocker.

1. **MGA flyby invariants** (`backend/trajectory/mga.py`): for every accepted route, recompute per-flyby |v∞,in| vs |v∞,out| (K-29 says the mismatch is averaged away, 3–6 km/s on "feasible" Venus flybys), turn angle vs the periapsis constraint for the body's radius + margin, and search completeness (K-28: `MAX_COMPLETED = 48` counts beam partials → alphabetical bias, Venus never tried, 2–3-assist routes never evaluated — instrument the enumeration order to confirm or refute).
2. **`/mission/plan` fuzzing**: invalid enums, negative/zero/NaN/Inf masses and dates, extreme grid sizes, concurrent requests. Assert bounded CPU/memory and structured 4xx responses — a 500, a hang, or an unbounded loop is a finding.
3. **Asteroid failure-mode browser tests** (on a *copy* of `public/data/asteroid-phase1/`): flip bytes in the `.bin` (checksum mismatch), truncate it, delete the meta file, throttle the network past the 2 s budget (`src/sim/phase1AsteroidCatalog.ts:538`), and exercise the stale `force-cache` meta path (K-47). The question in every case: does the user see a labeled fallback, or a silent procedural substitution presented as catalog data?
4. **WebSocket concurrency/load**: 8–20 simultaneous `/ws/sim` connections using `whfast` (ias15 is blocked by F-02). Measure thread count, RSS growth, zombie threads after abrupt disconnects (K-24: uninterruptible `integrate()` + 3 s join), checkpoint growth, and stream throughput when paused with Kuiper active (K-50: 93 KB re-sent per tick while paused).
5. **Engine-switch continuity**: whfast → mercurius seek idempotence and forward/backward closure, since the ias15 leg cannot run.
6. **TudatPy force-model wiring** (`backend/sim/tudatpy_hooks.py`): only if a conda environment is available; the pip path cannot install it. Otherwise record NOT RUN — do not code-read your way to a pass/fail.
7. **Real-GPU timings**: only on actual GPU hardware. SwiftShader numbers are CPU lower bounds; label them as such if that is all you have. Specifically measure whether the per-frame `resizeRenderer()` / `setPixelRatio` / `canvas.width` assignment (report F-12, `src/main.ts` render loop) reallocates the drawing buffer on real drivers.

### Phase 3 — New-issue hunt (the expanded focus)

At least one third of total effort goes here. Target the areas prior passes under-covered; the register is not a fence — anything matching §1 belongs in the report.

1. **`origin/sun-focus` — never audited.** 69 commits, including `backend/sim/pfss_magnetogram.py` (1,193 lines, never reviewed by anyone), vitest + real tests, secular rates in `orbitMath`/`planets.ts`, a Lambert TOF guard (`9ad876a`), a benchmark relabel (`8a3ba50`), +1,824 lines re-typing the dormant stack, +520 lines in `sunVisuals.ts`. Questions: which register items does it actually fix (verify the fix, don't trust the commit message)? Which does it inherit (K-01 ias15, K-05 orbit-normal sign, the security posture)? What *new* majors do the 69 commits introduce?
2. **Time machinery under abuse**: reverse time at maximum warp, jump-to-date extremes, pause semantics diverging between worker and CPU paths, fp32 Julian-date quantization interactions (K-15 GPU uniform, K-16/K-39 storage and transport) at dates far from J2000.
3. **Worker protocol under stress**: message flood beyond the one-in-flight tick, worker crash/restart mid-session, sequence handling across re-init, catalog re-initialization while ticks are pending.
4. **Backend numeric-loop termination**: porkchop grid bounds from client input, Lambert bisection non-convergence paths beyond the F-06 cases, Kuiper particle counts as a per-connection allocation lever.
5. **Cache and fetch abuse**: `solar_realtime_data.py` cache keyed without `jd`, `force_refresh` on public GETs as an upstream-amplification lever with no byte cap, the Helioviewer AIA tile proxy as an SSRF/oversized-response surface, the SILSO 2.9 MB CSV re-downloaded every 120 s