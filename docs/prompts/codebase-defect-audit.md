---
title: Codebase defect audit prompt
updated: 2026-11-09
target: 2940748
status: final
---

# Codebase defect audit prompt for solar-system-realistic-sim

> **How to use this file.** Everything below the rule is a self-contained prompt. Paste it into an AI coding agent with shell access to a checkout, or hand it to a reviewer. The agent writes `records/audits/<YYYY-MM-DD>-codebase-defects.md` and `records/audits/<YYYY-MM-DD>-codebase-defects-evidence/`, named and laid out per `records/README.md`. Budget: multi-hour, multi-hundred-file. Run it in one long session or phase by phase, carrying the report file forward.
>
> **What it replaces.** `agent-notes/codebase_evaluation_prompt_2026-08-22.md` and `agent-notes/codebase_evaluation_prompt_major_issues.md` embedded measured numbers and a 53-item register that drifted within weeks. This file keeps only what every run needs, points at the living trackers for the rest, and turns the lessons of five audits (August to November 2026) into rules. Grounded on `main @ 2940748` (origin/main `bbfbb27`); the paths and commands below were checked on that tree.

---

## 1. Mandate

Audit this repository for defects and prove each one. Four classes. Each comes with the repo's own precedent so you know what the class looks like here.

- **Bugs.** Code that does the wrong thing on realistic input. Precedent: an IAU pole table keyed `"Pluto"` but looked up as `'pluto'`, so a 161-line moon-frame rewrite was dead code and 0 of 67 moons passed the round-trip invariant.
- **Inconsistencies.** Code, tests, docs, data and CI telling different stories. Precedent: README claims that were false; a mutation patch that had never applied; test fakes demanding an argument production had deliberately stopped passing.
- **Logic bombs.** Behaviour that flips silently with the date, the epoch, the clock, the machine or the network, with no signal to the user. Precedent: a 2 s load-latency budget that swapped the real catalog for procedural asteroids with an identical body count; an 18 s compute deadline met on the owner's box and missed on 2-vCPU runners; a PFSS cache keyed on Carrington rotation that served one fidelity's result to another.
- **Mathematical and modelling errors.** Wrong units, time scales, frames, periods, rates, normalisations, tolerances. Precedent: UTC used as TDB; a period fix applied uniformly when 423 of 424 moon ephemerides publish anomalistic, not sidereal, periods; associated Legendre functions non-orthogonal for degree ≥ 2; a position gate whose tolerance was 2.0, meaning 200% of orbit radius.

Rank what you find, dedupe it against the known register (§5), and leave evidence another person can rerun. A missed Critical fails the audit; a missed Low does not.

Calibration: a solo-author research and visualisation project, heavily agent-assisted. Judge "can a second engineer trust and extend this", not enterprise SLAs. Never lower the evidence bar or under-call severity to be polite.

## 2. Pin the target

- `git fetch origin`. The target is `origin/main` unless told otherwise. Record its SHA in the report header.
- Work in a detached worktree: `git worktree add --detach <dir> <sha>`, with `<dir>` outside `/tmp` (reboots and scratch wipes have destroyed three prior runs). Never audit the owner's live checkout: other agents commit into it and move branches mid-run.
- Several evidence folders carry SHA-256 manifests and the notes they pin are frozen. Before touching any note, `git grep` a hash from its manifest; a hit means do not edit.
- `agent-notes/` and `my-notes/` are archives (rule 9 of `records/README.md`): read and link to them, never write into them. New output goes under `records/`.
- Every branch, PR and CI claim in an older note is a hypothesis. Main merged most audited branches between October and now.

## 3. Environment

Pins from `.nvmrc`, `package.json` `engines` and both workflows: Node 22.23.2, npm 10.9.8, Python 3.12.13.

```bash
python3.12 -m venv .venv       && .venv/bin/pip install -r ci/backend-test-requirements.txt
python3.12 -m venv .venv-r3r4  && .venv-r3r4/bin/pip install -r ci/r3-r4-requirements.txt
npm ci --ignore-scripts
export PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC
export OPENBLAS_CORETYPE=Nehalem OPENBLAS_L2_SIZE=256   # the catalog-profile and moon-rebuild gates require these
```

On the owner's WSL box, Python 3.12.13 is `~/.local/share/uv/python/cpython-3.12.13-linux-x86_64-gnu/bin/python3.12`. That box is a fast AVX-512 CPU: timings and float bits differ from GitHub's runners (§6, reproducibility).

Browser: headless Chromium here renders with SwiftShader or llvmpipe. Record the renderer string with every browser measurement; performance numbers from a software renderer are not findings. Real GPU under WSLg: headed Chromium with `--use-gl=angle --use-angle=gl`, env `GALLIUM_DRIVER=d3d12 MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA`, `LD_LIBRARY_PATH` including `/usr/lib/wsl/lib`.

## 4. Baseline first

Run every CI gate on the pinned target and put each exit code and count in the report header. A red gate is finding 1 and your comparison baseline.

```bash
npm test                                   # vitest
npm run build
npm run typecheck                          # strict tsc, CI requires 0 errors
npm run typecheck:ratchet                  # against ci/typescript-error-baseline.json
npm run typecheck:ui-delta && npm run test:types:ui && npm run typecheck:scripts
npm run verify:planet-positions && npm run verify:moon-frames && npm run verify:moon-ephemeris && npm run verify:distribution
python -m pytest -q backend/tests          # from the repo root; `cd backend && pytest` breaks collection
python -m pytest --noconftest -q scripts/ci/tests/test_verify_r3_r4_runner.py scripts/ci/tests/test_r3_r4_workflow.py
python scripts/ci/verify_r3_r4.py --repo . --manifest ci/r3-r4-science-verification.json --artifacts <dir> all   # r3r4 venv; clean tracked tree
python -m pytest -q scripts/test_moon_repairs.py::test_real_extension_rebuild_is_byte_identical_without_network
python scripts/ci/catalog_numerical_profile.py --require-core Nehalem --require-l2-kib 256 --probe-output <dir>
python scripts/generate_moon_physical_radii.py --check
python scripts/build_asteroid_phase1_dataset.py --offline --check
npx playwright install --with-deps chromium && npm run test:browser -- --project=chromium   # CI also runs chromium-tab-zoom, firefox, webkit
```

Count skipped tests. Skipped surface is unaudited surface, not passing surface.

## 5. Known issues: dedupe before you write

- Canonical register: `agent-notes/CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-10.md` (SCN-001 to SCN-083), dispositions in `agent-notes/REMEDIATION_STATUS_2026-10-30.md`.
- `agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md` maps the older K-, F- and B-numbered findings onto SCN ids.
- `agent-notes/MASTER_ISSUE_TRACKER_2026-10-11.md` is a second living register, edited through 2026-11-06 and not reconciled with the 10-10 tracker. Check both; `records/INDEX.md` says whether the owner has declared one canonical.
- `agent-notes/AUDIT_AND_ISSUE_INDEX_2026-10-07.md` is the document map. If the checkout has `agent-notes/OPEN_FINDINGS_2026-11-02.md`, it lists what was still open on 2 November.

Rules:

- Before writing a finding, grep the register for the file, the function and the symptom. A match becomes a status re-verification row, not a new finding.
- "Fixed" and "on main" are decided by rerunning the reproduction on the target. Never infer them from a cited line being present or absent; that method called B011 wrong once.
- Refuted in earlier audits, do not re-report without new evidence: resizeRenderer running per frame (resize-event gated); Lambert lacking a certified residual (returns `rootResidualDays`, matches Hohmann to 0.1%); REBOUND AU/day units (verified against Horizons); engine fallback hidden (`engine_requested` is disclosed); report-path traversal; CORS wildcard (localhost allowlist); JS heap leak (flat over 2 min); benchmark checksum mismatch (9 of 9 match); TudatPy as fake (1.0.0 is real); ephemeris cache shared across requests (per request); the 39 MB textures as shipped weight (unused).
- Owner policy, not defects: SCN-015, 037, 038 and 039 were closed by policy; branch protection stays out of trackers and recommendations; distribution rights (`verify:distribution:rights`, 43 records) need the owner, not code.

## 6. Hunt plan

Two passes. Sweep the whole tree by failure class first, then walk the subsystems. Each line is the rule you check; the parenthesis is why this repo earned it.

**Mathematics and modelling**
- Units: every quantity crossing a module or wire boundary carries its unit in the name or the schema (AU/day vs AU/yr and km/s confusions have shipped).
- Time: UTC, TDB and JD are distinct; wall time is response metadata, never a physics input; check every `now()` and every epoch conversion (UTC was used as TDB).
- Frames: Z-up vs Y-up, heliocentric vs body frame, IAU pole tables; follow lookup keys end to end (a case mismatch made a correct pole table dead code).
- Periods and rates: sidereal vs anomalistic per ephemeris source; mean anomaly advances at the tabulated rate, not 2π/period; each secular term counted once (an apsidal double count; a uniform period fix that made Ganymede 40x worse).
- Orbital validation: at least six epochs across 1900–2100 against Horizons or an independent solver, with an explicit secular-drift budget. A single-epoch pass proves nothing and tolerances must be physical (`src/sim/planetPositionCheck.ts` is the pattern to copy; a 200%-of-radius tolerance let Titan pass 2.4 million km off).
- PFSS and WSA: check the code against `docs/adr/0001` to `0007` (harmonic convention, grid and projection, source surface, WSA semantics, GONG zero point); test orthogonality numerically (Legendre was wrong for ℓ ≥ 2).
- Lambert, MGA, mission: residual certification, multi-revolution and hyperbolic coverage, flyby periapsis floors, cargo in the rocket equation; compare against an independent oracle such as `lamberthub` over a grid, not one case.
- Reproducibility: tests that pin float bytes pass on the owner's AVX-512 box and fail on runners. Reproduce with `OPENBLAS_CORETYPE=Haswell` (also Zen, Sandybridge). The fix is a measured tolerance with a probe for P(fail | regression), never re-pinned bytes.

**Logic bombs**
- Any threshold on latency, wall time or machine speed that changes which data is shown or accepted (a load budget swapped real data for procedural; a compute deadline passes locally and returns 503 on a 2-vCPU runner; at last check the process supervisor caps timeouts at 60 s and the env knob at 19 s).
- Date- or epoch-dependent branches, especially around J2000, the current year and solar-cycle maxima.
- Cache keys: exact inputs, or a declared equivalence relation with an error budget. Never coarser than the physics (Carrington-rotation keys aliased fidelities).
- Silent fallbacks: every fallback (procedural Sun, Kepler instead of ephemeris, catalog instead of live feed) must show in the UI or the response. Find each fallback path and prove the signal exists.
- Constants that hide a subsystem: a feature flag kept the moons unrendered for weeks while audits rated moon defects as user-visible. Rate defects behind such flags as dormant.
- Hard-coded ports and origins (8042, 4173, the 5174/8043 stack, `SOLAR_CORS_ALLOWED_ORIGINS`).

**Dead and aliased code**
- Reachability from the real entry points, `src/main.ts` and the routes in `backend/server.py`, computed from the import graph, not from grep presence (`src/frontend/app/animationLoop.ts` and `SimulationClient` were unshipped while audited as live).
- Lookup tables and registries: keys vs lookups, schema names vs validators, 503 `detail.code` values vs the client classifier.

**Tests that cannot fail**
- Assertions that pin the bug (a benchmark test asserted `validationCoverage == 0.0`), monkeypatched fake solvers inside accuracy tests, tolerances wider than the signal, single-epoch gates.
- Mutation: mutate production and run the full suite, never a subset. A surviving mutant is "untested" only after you prove the branch is reachable (B071 was withdrawn on exactly this).
- The skipped set: list what is skipped and why.

**Consistency**
- Code vs docs vs ADRs vs README claims; manifests and hashes (`ci/r3-r4-science-verification.json`, evidence `SHA256SUMS`) vs the files they pin; frontend and backend schema versions, field names, units and status codes.
- Generated data vs its generator (`scripts/update-moons-data.mjs` once regenerated 460 bodies against 424 committed, and some scripts write on `--help`). Run data scripts only in a scratch copy.
- CI semantics: push runs test the bare branch head, pull-request runs test the merge ref; a test plan recorded on an old base proves nothing after main moves; two PRs merged without textual conflict and turned main red together (#32 and #54).

**Robustness and security, in proportion**
- Unbounded growth (a rate-limiter identity map grew one entry per spoofed `X-Forwarded-For`); threads that outlive their timeout (`asyncio.to_thread` cannot be cancelled); permits released before the work stops (6 concurrent against a limit of 2); sync handlers fanning out to external services without a cap (one plan request made about 1,400 Horizons calls).
- Destructive endpoints, CORS, WebSocket origin, file writes under the repo. Name what can destroy data or pin the machine, then move on. This is not a security engagement.

**Subsystem pass**
Walk `src/main.ts`, `src/sunController.ts`, `src/frontend/features/*`, `backend/sim`, `backend/trajectory`, `backend/server.py`, `scripts/`, `tests/`, `docs/`. The question banks in `agent-notes/codebase_evaluation_prompt_2026-08-22.md` §6.1 to §6.10 still apply; read the bank for a subsystem when you enter it. Design intent for the Sun is in `docs/solar-*.md` and the ADRs; for moons in `docs/moon-catalog-integrity.md`; for the UI in `docs/accessibility-acceptance.md` and `docs/frontend-configuration.md`.

## 7. Evidence standard

Each finding carries: id; severity; class; `path:line` on the target SHA; the exact reproduction command and its captured output, saved in the record's `-evidence/` folder; expected vs actual with the source of truth named (Horizons query, textbook relation, ADR, schema); reachability (shipped path or dormant, with the proof); the rerun result on `origin/main` when the target differs; a scoped fix sketch; the refuter verdicts from §8.

Severity:
- **Critical.** Silently wrong results or data loss on a shipped path, or a destructive action reachable by default.
- **High.** Visibly wrong results; a false claim with no signal; a hang or resource exhaustion on realistic input; a gate that cannot catch what it claims to.
- **Medium.** Wrong but dormant or unshipped; flaky or misleading gates; docs that misdirect a maintainer.
- **Low.** Hygiene.

Triage: full write-up for Critical and High, one table row per Medium, counts plus a list for Low.

State the evidence kind every time: static read, unit test, fixture replay, live run, production. A mock is not a live check. "Ran X, found nothing" is a result. An unsupported positive is worse than silence.

## 8. Adversarial verification

Every Critical and High gets at least three independent refutation attempts, each told to refute and each with a different lens: correctness (is the maths or logic wrong), reproduction (does it reproduce from a clean environment), reachability (does a user or a gate ever hit it). A majority refute kills the finding; a split goes to a tiebreaker or ships marked contested. Keep every refuted claim in an appendix so the next run does not repeat it.

If main moves during the run, rerun the affected reproductions on the new tip before publishing.

Without subagents, refute each finding yourself by a second, different method (another solver, another epoch set, another environment) and say so in Limitations. Agreeing agents, or repeated reads of one source, count as one datum.

## 9. Running it

- Keep state outside `/tmp`: the worktree, both venvs, `out/` with one JSON line per finding written the moment it is proven, and `logs/`.
- Circuit breaker: three consecutive failed agent calls stop the fan-out; write the partial result and the skipped list.
- Kill processes by PID. A `pkill -f` pattern that matches your own command line kills your shell.
- Never run an interpreter from inside a downloaded or generated directory; pass paths as arguments.
- Do not edit the audited worktree beyond throwaway probes you revert. Write the record and its evidence folder as new files under `records/audits/` in the owner's checkout; leave committing, pushing and PRs to the owner.

## 10. Deliverable

`records/audits/<YYYY-MM-DD>-codebase-defects.md` plus `records/audits/<YYYY-MM-DD>-codebase-defects-evidence/` holding scripts, logs, truth data and a `SHA256SUMS`, plus one new line at the top of `records/INDEX.md`. Structure:

1. Header per `records/README.md` rule 7 (title, date, target SHA, status), then environment and pins, every §4 gate with exit code and counts, scope decisions.
2. Ranked register: Critical and High in full (§7), Medium table, Low counts.
3. Status re-verification: every known SCN or B id you touched, with its rerun result on the target.
4. Coverage matrix, layer × failure class: each cell is a finding id, "cleared" with the probe named, or "blind spot" with the reason.
5. Refuted appendix.
6. Limitations: what did not run and why, what used a software renderer, what stayed single-source.
7. Next actions: one proposed PR per defect in the owner's working style, small commits with a red test first.

Score as a secondary lens with §7 of `agent-notes/codebase_evaluation_prompt_2026-08-22.md`, so results stay comparable with 36 (2026-08-23), 46 (2026-09-07) and 49 (2026-09-24).

## 11. Done when

- Every §4 gate has a recorded exit code and counts, or a recorded reason it did not run.
- Every Critical and High has a reproduction, a reachability proof and at least three refuter verdicts.
- Every known id you touched has a rerun result, not a line-presence inference.
- The coverage matrix has no empty cell.
- The evidence folder's `SHA256SUMS` verifies; the record's name and header follow `records/README.md`; `git status` in the audit worktree shows no edits to tracked files.
- The report names what did not run.

## 12. Do not

Infer status from line presence. Validate an orbit at one epoch. Trust performance numbers from a software renderer. Re-report the refuted list. Edit frozen notes. Audit the owner's live checkout. Run mutations against a test subset. Claim "on main" without rerunning. Produce a quick version; the value is the evidence standard.
