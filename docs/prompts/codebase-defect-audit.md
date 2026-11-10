---
title: Codebase defect audit prompt
updated: 2026-11-09
target: bbfbb27
status: final
---

# Codebase defect audit prompt for solar-system-realistic-sim

> **How to use this file.** Everything below the rule is a self-contained prompt for an AI coding agent with shell access to a checkout, or for a human reviewer. Send it with one line saying what you want (run it, or review it): an agent that receives it alone starts a multi-hour run. A run writes one record, `records/audits/<YYYY-MM-DD>-codebase-defects.md`, with its evidence folder beside it (§10), named per `records/README.md`. Nothing goes into `agent-notes/`. Budget: multi-hour and multi-hundred-file; §9 gives the cost of a fan-out.
>
> **Maintaining it.** Paths and commands were checked on `origin/main @ bbfbb27` plus the branch that adds `records/` and this file. A target without `records/` predates that convention, and §10 still applies. If any other cited path or a §4 command is missing on your target, this file has drifted: list each case under Limitations for the owner, and leave the file alone during a run. When you maintain it, edit lines, do not append: it holds only what every run needs, and measured numbers belong in records. It replaced `agent-notes/codebase_evaluation_prompt_2026-08-22.md` and `agent-notes/codebase_evaluation_prompt_major_issues.md`, which stay as references.

---

## 1. Mandate

Audit this repository for defects and prove each one. Four classes. Each comes with the repo's own precedent so you know what the class looks like here.

- **Bugs.** Code that does the wrong thing on realistic input. Precedent: an IAU pole table keyed `"Pluto"` but looked up as `'pluto'`, so a 161-line moon-frame rewrite was dead code and 0 of 67 moons passed the round-trip invariant.
- **Inconsistencies.** Code, tests, docs, data and CI telling different stories. Precedent: README claims that were false; a mutation patch that had never applied; test fakes demanding an argument production had deliberately stopped passing.
- **Logic bombs.** Behaviour that flips silently with the date, the epoch, the clock, the machine or the network, with no signal to the user. Precedent: a 2 s load-latency budget that swapped the real catalog for procedural asteroids with an identical body count; an 18 s compute deadline met on the owner's box and missed on 2-vCPU runners; a PFSS cache keyed on Carrington rotation that served one fidelity's result to another.
- **Mathematical and modelling errors.** Wrong units, time scales, frames, periods, rates, normalisations, tolerances. Precedent: UTC used as TDB; a period fix applied uniformly when 423 of 424 moon ephemerides publish anomalistic, not sidereal, periods; associated Legendre functions non-orthogonal for degree ≥ 2; a position gate whose tolerance was 2.0, meaning 200% of orbit radius.

Rank what you find, dedupe it against the known register (§5), and leave evidence another person can rerun. A missed Critical fails the audit; a missed Low does not.

Calibration: a solo-author research and visualisation project, heavily agent-assisted. Judge "can a second engineer trust and extend this", not enterprise SLAs. Never lower the evidence bar or under-call severity to be polite.

## 2. Pin the target and the state directory

- `git fetch origin`. The target is `origin/main` unless told otherwise. Record its SHA in the record header.
- Everything the run creates lives in one state directory until §10 publishes it. Put it outside the repository and outside `/tmp`: reboots and scratch wipes have destroyed three earlier runs.

```text
<state>/                     default ~/.local/state/solar-audit/<YYYY-MM-DD>-<sha>/
  env.sh                     the §3 exports; source it in every shell
  wt/                        the target, detached, tracked files never touched: git worktree add --detach <state>/wt <sha>
  wt-gates/                  a second detached worktree; only the §4 gates run in it
  wt-<name>/                 scratch worktrees for anything that writes: mutations, generators, builds, --help probes
  venv/  venv-r3r4/          §3
  scratch/                   downloads, bundles and bulky generated tables; never published
  record.md                  the draft record
  evidence/                  published unchanged by §10
    findings/  cleared/  verdicts/    one JSON-lines file per layer or lens (§7, §8)
    gates/                   one log per §4 gate, plus summary.tsv (gate, exit code, seconds)
    reachability/            the §6 map
    <finding-id>/            repro script, captured output, truth data
```

- The owner's checkout is the repository's main worktree, the first line of `git worktree list`. Never audit or run gates in it: other agents commit into it and move branches mid-run. Its untracked notes exist nowhere else, so read them there.
- `agent-notes/` and `my-notes/` are archives (rule 9 of `records/README.md`): read and link, never write. Many of their files are pinned by SHA-256 manifests.
- Every branch, PR and CI claim in an older note is a hypothesis. Main has merged most of the branches those notes audited.

## 3. Environment

Pins from `.nvmrc`, `package.json` `engines` and both workflows: Node 22.23.2, npm 10.9.8, Python 3.12.13.

```bash
python3.12 -m venv <state>/venv      && <state>/venv/bin/pip install -r ci/backend-test-requirements.txt
python3.12 -m venv <state>/venv-r3r4 && <state>/venv-r3r4/bin/pip install -r ci/r3-r4-requirements.txt
npm ci --ignore-scripts                                  # in wt/ and in wt-gates/
export PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC
export OPENBLAS_CORETYPE=Nehalem OPENBLAS_L2_SIZE=256    # backend-tests job only; unset both for the r3-r4-science gates
```

Check `node --version` and `npm --version` against the pins first. In §4, `python` is the interpreter of the venv each comment names.

On the owner's WSL box:

- Python 3.12.13 is `~/.local/share/uv/python/cpython-3.12.13-linux-x86_64-gnu/bin/python3.12`. The default `node` is v24; Node 22.23.2 with npm 10.9.8 is in `~/miniconda3/envs/icl-vram-py312-cu132/bin`.
- The CPU is a fast AVX-512 part: timings and float bits differ from GitHub's runners (§6, reproducibility).
- Browsers run headless, always. A headed browser opens on the owner's desktop and takes the keyboard. That rules out `--headed`, `headless: false`, and on this tree `UI_HARDWARE_WEBGL=1` and `UI_ZOOM_HEADFUL=1`.
- Headless Chromium renders with SwiftShader, and the §4 gates run that way, as in CI. For your own measurements the real GPU also works headless: launch with `--use-angle=gl-egl`, set `GALLIUM_DRIVER=d3d12` in the browser's environment, remove `DISPLAY` and `WAYLAND_DISPLAY` from it, and fail unless the WebGL renderer string contains `D3D12`. Record the renderer string with every browser measurement; performance numbers from a software renderer are not findings.
- WebKit cannot launch (no `libgtk-4`). Put a scratch config beside `playwright.config.ts` in `wt-gates/` that imports it and gives the `webkit` project the `launchOptions.executablePath` `~/.cache/solar-webkit-noble-20261101/browsers/webkit-2370/pw_run.sh` (as an absolute path), run `npx playwright test --config=<that file> --project=webkit`, then delete the file. If that cache is gone, record WebKit as not run.
- Other sessions hold ports, 5173 and 8042 among them. Give every server a port of its own, and pass `UI_TEST_PORT` and `UI_PRODUCTION_PORT` to the Playwright gates.

## 4. Baseline first

The workflows are the gate list. Run every check step of `.github/workflows/frontend-ui.yml` and `.github/workflows/r3-r4-science.yml` in `wt-gates/`, on a quiet machine, before any hunting: a loaded box turns timing gates red. Their setup steps are §3: skip `npm install --global` and `--with-deps`. The block is the snapshot for the target above, plus four checks CI does not run. Put each exit code, count and duration in the record's baseline (§10, item 1). A red gate is finding 1 and your comparison baseline.

```bash
# frontend-ui.yml: ui, production-artifact, browser (browsers: npx playwright install chromium firefox webkit)
npm test                                          # vitest
npm run typecheck:ratchet && npm run typecheck:ui-delta && npm run test:types:ui && npm run typecheck:scripts
npm run typecheck                                 # strict tsc, CI requires 0 errors
npm run build && npm run verify:asteroid-gpu
VITE_BACKEND_ORIGIN= npm run build && npm run test:production
for p in chromium chromium-tab-zoom firefox webkit; do npm run test:browser -- --project=$p; done
# r3-r4-science.yml, job r3-r4-science: r3r4 venv, Node 22 on PATH, clean tracked tree (the job also repeats test, build, ratchet and typecheck)
python -m pytest --noconftest -q scripts/ci/tests/test_verify_r3_r4_runner.py scripts/ci/tests/test_r3_r4_workflow.py
python scripts/ci/verify_r3_r4.py --repo . --manifest ci/r3-r4-science-verification.json --artifacts <dir> all
# r3-r4-science.yml, job backend-tests: backend venv, from the repo root (`cd backend && pytest` breaks collection)
python -m pytest --noconftest -q scripts/ci/tests/test_catalog_numerical_profile.py
python scripts/ci/catalog_numerical_profile.py --require-core Nehalem --require-l2-kib 256 --probe-output <dir>
python -m pytest -q scripts/test_moon_repairs.py::test_real_extension_rebuild_is_byte_identical_without_network
NPY_DISABLE_CPU_FEATURES=X86_V4,AVX512_ICL,AVX512_SPR python -m pytest -q scripts/test_moon_repairs.py::test_real_extension_rebuild_is_byte_identical_without_network
python -m pytest -q backend/tests
python -m pytest -v -o faulthandler_timeout=120 <the scripts/test_*.py files the workflow names>
python scripts/generate_moon_physical_radii.py --check && python scripts/build_asteroid_phase1_dataset.py --offline --check
# not in CI
npm run verify:planet-positions && npm run verify:moon-frames && npm run verify:moon-ephemeris && npm run verify:distribution
```

Count skipped tests and give each one's reason. Skipped surface is unaudited surface, not passing surface.

A gate that is red for a host reason (a port in use, a missing system library) is rerun in isolation, and both runs are recorded. `unshare -rn sh -c 'ip link set lo up; <gate>'` gives a gate a private loopback. The fragility can itself be a finding.

## 5. Known issues: dedupe before you write

- `records/INDEX.md` lists every record, newest first, and says where the living registers are. If it lists an audit record, read that record's register and refuted appendix first.
- Until the owner moves them, the registers are in the `agent-notes/` archive. `agent-notes/CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-10.md` holds SCN-001 to SCN-083, with dispositions in `agent-notes/REMEDIATION_STATUS_2026-10-30.md`. `agent-notes/MASTER_ISSUE_TRACKER_2026-10-11.md` is a second register, not reconciled with the first. Check both.
- `agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md` maps the older K-, F- and B-numbered findings onto SCN ids. `agent-notes/AUDIT_AND_ISSUE_INDEX_2026-10-07.md` is the document map.
- Untracked, in the owner's checkout only: `agent-notes/OPEN_FINDINGS_2026-11-02.md` lists what was still open on 2 November.
- Another session may be auditing the same commit. Read its findings as one more register; do not narrow your scope for it.

Rules:

- Before writing a finding, grep the registers for the file, the function and the symptom. A match becomes a status row (§7), not a new finding.
- "Fixed" and "on main" are decided by rerunning the reproduction on the target. Never infer them from a cited line being present or absent; that method called B011 wrong once.
- Refuted in earlier audits, do not re-report without new evidence: resizeRenderer running per frame (resize-event gated); Lambert lacking a certified residual (returns `rootResidualDays`, matches Hohmann to 0.1%); REBOUND AU/day units (verified against Horizons); engine fallback hidden (`engine_requested` is disclosed); report-path traversal; CORS wildcard (localhost allowlist); JS heap leak (flat over 2 min); benchmark checksum mismatch (9 of 9 match); TudatPy as fake (1.0.0 is real); ephemeris cache shared across requests (per request); the 39 MB textures as shipped weight (unused).
- Owner policy, not defects: SCN-015, 037, 038 and 039 were closed by policy (`docs/supported-product-policies.md`); branch protection stays out of trackers and recommendations; distribution rights (`verify:distribution:rights`, 43 records) need the owner, not code.

## 6. Hunt plan

Map reachability first. Then sweep the whole tree by failure class, then walk the layers. In the sweeps, each line is the rule you check and the parenthesis is why this repo earned it.

**Reachability map.** Bundle the two real browser entry points, `src/main.ts` and `src/workers/modelWorker.ts`; the union of the two metafiles' inputs is the shipped frontend:

```bash
npx esbuild <entry> --bundle --format=esm --platform=browser --external:'/fonts/*' \
  --metafile=<state>/evidence/reachability/<name>.json --outfile=<state>/scratch/<name>.js
```

List the backend routes those modules call, and the backend modules that `backend/server.py` never imports. Every finding then carries one reachability: `shipped` (reached from the entry points, or a route they call), `api-only` (a backend route with no shipped caller), `dormant` (unreachable, or behind a constant such as `showMoons` in `src/main.ts`), `gate` (CI, tests, verifiers) or `docs`. Unreachable is not dead: `docs/adr/0006-runtime-composition-and-retained-apis.md` retains the unwired planner, satellite and navigation modules on purpose, so rate their defects dormant and do not propose deleting them.

**Layers.** These twelve are the hunt scopes and the rows of the coverage matrix (§10). The last column is the layer's question bank in `agent-notes/codebase_evaluation_prompt_2026-08-22.md`; read it on entering the layer (its line numbers date from August). A layer owns the tests beside its code, and `tooling` owns whatever no other row names.

| Layer | Where | Bank |
|---|---|---|
| `fe-core` | `src/main.ts`, `src/frontend/app/`, `src/frontend/rendering/`, `src/frontend/camera/`, `src/workers/`, `src/constants.ts`, `src/textures.ts`, `src/style.css`, `index.html` | §6.1, §6.6 |
| `orbits` | orbit, catalog and moon modules in `src/sim/` and `src/data/`; `public/moon-ephemerides/`; `backend/data/` | §6.2 |
| `belts` | asteroid and Kuiper modules in `src/sim/` and `src/data/`; `src/frontend/features/asteroids/`; `backend/sim/kuiper.py`; `scripts/asteroid/`; the dataset in `public/data/` | §6.5 |
| `solar-physics` | PFSS, harmonics, GONG, frame and time modules in `backend/sim/`; the ADRs in `docs/adr/` | §6.3 |
| `solar-runtime` | the `/solar/*` and `/health` routes in `backend/server.py`; `backend/sim/solar_realtime_data.py`; `backend/sim/process_supervisor.py`; `backend/http_ingress.py`; `backend/solar_delivery.py` | §6.3, §6.7 |
| `solar-client` | `src/sunController.ts`; the client, status, frame and blending modules in `src/frontend/features/solar/` | §6.3 |
| `solar-visuals` | `src/frontend/features/solar/sunVisuals.ts` and the flare, field-line and wave modules beside it, with their GLSL | §6.3 |
| `trajectory` | `backend/trajectory/`; `backend/mission/ephemeris_service.py`; the `/trajectory/*` routes; `src/frontend/features/trajectory/` | §6.8 |
| `mission` | the rest of `backend/mission/`; `backend/benchmark/`; the `/mission/*` and `/benchmark/*` routes | §6.8 |
| `engines` | `backend/sim/rebound_nbody.py`, `backend/sim/tudatpy_hooks.py` and the force models; `/ws/sim` and every route not named above; app setup and CORS; `backend/server_launcher.py` | §6.7 |
| `exotic-planetary` | `src/frontend/features/superluminal-modeling/`; `src/frontend/features/planetary/` | §6.4 |
| `tooling` | `scripts/`, `ci/`, `.github/workflows/`, `tests/`, `public/`, `README.md`, `docs/`, the root configs; the §4 gates and the cross-cutting probes of §9 | §6.9, §6.10 |

Design intent for the Sun is in `docs/solar-*.md` and the ADRs; for moons in `docs/moon-catalog-integrity.md`; for the UI in `docs/accessibility-acceptance.md` and `docs/frontend-configuration.md`.

**Mathematics and modelling**
- Units: every quantity crossing a module or wire boundary carries its unit in the name or the schema (AU/day vs AU/yr and km/s confusions have shipped).
- Time: UTC, TDB and JD are distinct; wall time is response metadata, never a physics input; check every `now()` and every epoch conversion (UTC was used as TDB).
- Frames: Z-up vs Y-up, heliocentric vs body frame, IAU pole tables; follow lookup keys end to end (a case mismatch made a correct pole table dead code).
- Periods and rates: sidereal vs anomalistic per ephemeris source; mean anomaly advances at the tabulated rate, not 2π/period; each secular term counted once (an apsidal double count; a uniform period fix that made Ganymede 40x worse).
- Orbital validation: at least six epochs across 1900–2100 against Horizons or an independent solver, with an explicit secular-drift budget. A single-epoch pass proves nothing and tolerances must be physical (`src/sim/planetPositionCheck.ts` is the pattern to copy; a 200%-of-radius tolerance let Titan pass 2.4 million km off).
- PFSS and WSA: check the code against ADRs 0001 to 0007 in `docs/adr/` (harmonic convention, grid and projection, source surface, WSA semantics, GONG zero point); test orthogonality numerically (Legendre was wrong for ℓ ≥ 2).
- Lambert, MGA, mission: residual certification, multi-revolution and hyperbolic coverage, flyby periapsis floors, cargo in the rocket equation; compare against an independent oracle such as `lamberthub` over a grid, not one case.
- Reproducibility: tests that pin float bytes pass on the owner's AVX-512 box and fail on runners. Reproduce with `OPENBLAS_CORETYPE=Haswell` (also Zen, Sandybridge). The fix is a measured tolerance with a probe for P(fail | regression), never re-pinned bytes.

**Logic bombs**
- Any threshold on latency, wall time or machine speed that changes which data is shown or accepted (a load budget swapped real data for procedural; a compute deadline passes locally and returns 503 on a 2-vCPU runner; at last check the process supervisor caps timeouts at 60 s and the env knob at 19 s).
- Date- or epoch-dependent branches, especially around J2000, the current year and solar-cycle maxima.
- Validity windows: every fitted model has an interval; check what the user sees when the clock leaves it (the planet elements are fitted for 1800 to 2050, and the function that grades propagation quality has no caller).
- Cache keys: exact inputs, or a declared equivalence relation with an error budget. Never coarser than the physics (Carrington-rotation keys aliased fidelities).
- Silent fallbacks: every fallback (procedural Sun, Kepler instead of ephemeris, catalog instead of live feed) must show in the UI or the response. Find each fallback path and prove the signal exists.
- Constants that hide a subsystem: a feature flag kept the moons unrendered for weeks while audits rated moon defects as user-visible. Rate defects behind such flags as dormant.
- Hard-coded ports and origins: 8042, 4173, the 5174/8043 stack, `SOLAR_CORS_ALLOWED_ORIGINS` (a CI gate asks Vite for port 0, gets 5173, and fails while a dev server holds it).

**Dead and aliased code**
- Rate reachability from the map above, never from grep presence (`src/frontend/app/animationLoop.ts` and `SimulationClient` were audited as live while unshipped).
- Lookup tables and registries: keys vs lookups, schema names vs validators, 503 `detail.code` values vs the client classifier.

**Tests that cannot fail**
- Assertions that pin the bug (a benchmark test asserted `validationCoverage == 0.0`), monkeypatched fake solvers inside accuracy tests, tolerances wider than the signal, single-epoch gates.
- Mutation: mutate production and run the full suite, never a subset. A surviving mutant is "untested" only after you prove the branch is reachable (B071 was withdrawn on exactly this).
- Tests that never run: beyond the skips counted in §4, the `NOT_IN_CI` list in `scripts/ci/tests/test_r3_r4_workflow.py` and test files that no workflow or npm script names. List each with its reason (the negative controls of the R3/R4 mutation gate are hash-pinned and run by no workflow).

**Consistency**
- Code vs docs vs ADRs vs README claims; manifests and hashes (`ci/r3-r4-science-verification.json`, evidence `SHA256SUMS`) vs the files they pin; frontend and backend schema versions, field names, units and status codes.
- Generated data vs its generator (`scripts/update-moons-data.mjs` once regenerated 460 bodies against 424 committed, and some scripts write on `--help`). Run data scripts only in a scratch worktree.
- CI semantics: push runs test the bare branch head, pull-request runs test the merge ref; a test plan recorded on an old base proves nothing after main moves; two PRs merged without textual conflict and turned main red together (#32 and #54).

**Robustness and security, in proportion**
- Unbounded growth (a rate-limiter identity map grew one entry per spoofed `X-Forwarded-For`); threads that outlive their timeout (`asyncio.to_thread` cannot be cancelled); permits released before the work stops (6 concurrent against a limit of 2); sync handlers fanning out to external services without a cap (one plan request made about 1,400 Horizons calls).
- Destructive endpoints, CORS, WebSocket origin, file writes under the repo. Name what can destroy data or pin the machine, then move on. This is not a security engagement.

## 7. Evidence standard

Each finding is one JSON line in `findings/<layer>.jsonl`, written the moment it is proven and built with a JSON library, never by hand. Fields: `id` (`<layer>-NN`); `layer`; `kind` (`finding` or `status`); `known_id`; `severity`; `class` (§1: `bug`, `inconsistency`, `logic-bomb`, `math`); `sweep` (§6: `math`, `logic-bomb`, `dead-code`, `tests`, `consistency`, `robustness`); `title`; `path_line` on the target SHA; `repro_cmd`, exact, with its captured output in `evidence/<finding-id>/`; `expected` and `actual`; `source_of_truth` (Horizons query, textbook relation, ADR, schema); `evidence_kind`; `reachability` and `reachability_proof` (§6); `fix_sketch`. A status row carries the same fields, with `known_id` required, and adds `status_result`: `still-open`, `fixed`, `partly-fixed` or `cannot-reproduce`. When the target is not `origin/main`, add the rerun result there.

Cleared probes and blind spots go to `cleared/<layer>.jsonl` (`layer`, `sweep`, `probe`, `result`: `cleared` or `blind-spot`, `detail`). Refuter verdicts go to `verdicts/<lens>.jsonl` (`finding_id`, `lens`, `verdict`: `refuted`, `upheld` or `partial`, `severity_if_upheld`, `reason`, `repro_cmd`). Save network truth data beside its query, so a rerun can check your arithmetic offline.

Severity:
- **Critical.** Silently wrong results or data loss on a shipped path, or a destructive action reachable by default.
- **High.** Visibly wrong results; a false claim with no signal; a hang or resource exhaustion on realistic input; a gate that cannot catch what it claims to.
- **Medium.** Wrong but dormant or unshipped; flaky or misleading gates; docs that misdirect a maintainer.
- **Low.** Hygiene.

Reachability caps a wrong-result finding: `dormant` at Medium, `api-only` at High.

Triage: full write-up for Critical and High, one table row per Medium, counts plus a list for Low.

State the evidence kind every time: static read, unit test, fixture replay, live run, production. A mock is not a live check. "Ran X, found nothing" is a result. An unsupported positive is worse than silence.

## 8. Adversarial verification

Every Critical and High gets at least three independent refutation attempts, each told to refute and each through a different lens: correctness (is the maths or logic wrong, re-derived from a source the finder did not use), reproduction (does it reproduce from a clean worktree, with the refuter's own script against the production path), reachability (does a user or a gate ever hit it). One refuter per lens can take a batch of findings. A majority refute kills the finding; a split goes to a tiebreaker or ships marked contested. Keep every refuted claim in an appendix so the next run does not repeat it. A status row needs refuters only when it says a known Critical or High is still open.

Independence comes from the source, not the head count: agreeing agents, or repeated reads of one source, count as one datum. Second sources that fit this repo: a JPL DE kernel read with `jplephem` beside Horizons, `lamberthub` beside the Lambert solver, `scipy.special` beside the harmonic basis.

If main moves during the run, rerun the affected reproductions on the new tip before publishing.

Without subagents, refute each finding yourself by a second, different method (another solver, another epoch set, another environment) and say so in Limitations.

## 9. Running it

- Solo is a valid way to run this. To fan out, give each hunter this file, one layer row from §6, its own port range and CPU set, and the rule that it writes only under `<state>`. Keep for yourself the baseline, the reachability map, the cross-cutting probes (timezones, dependency advisories, CI run history) and one independent truth source for the headline numbers.
- Launch hunters four at a time. A hunter costs 0.3 to 0.4 million tokens and 20 to 25 minutes; twelve at once, with three refuters, all stopped together when the account's five-hour usage window closed.
- When agents stop on a usage limit, their findings are already on disk. Resume the same agents after the reset if the harness can; otherwise start replacements that read those lines first. Three consecutive failed agent calls end the fan-out: write the partial result and the skipped list.
- After every wave and every failure, find what your agents left behind and remove it: servers with `ss -ltnp` and `kill <pid>` (a `pkill -f` pattern that matches your own command line kills your shell), scratch worktrees with `git worktree remove`.
- Never run an interpreter from inside a downloaded or generated directory; pass paths as arguments.
- Do not edit `wt/` or `wt-gates/`. Do not commit, push or open PRs from an audit: §10 writes new files and the owner commits them.

## 10. Deliverable

Publish once, on the day the audit is finished, into the owner's checkout (§2): two new paths and one new index line, all left uncommitted.

```text
records/
  INDEX.md                                       one new line (rule 10 of records/README.md)
  audits/
    <YYYY-MM-DD>-codebase-defects.md             the record: <state>/record.md
    <YYYY-MM-DD>-codebase-defects-evidence/      <state>/evidence/, copied unchanged
      SHA256SUMS                                 written last: every file in the folder, and the record as ../<name>.md
      findings/  cleared/  verdicts/  gates/  reachability/  <finding-id>/
```

- `<YYYY-MM-DD>` is the owner's local date, not the `TZ=UTC` of the test shell. A second record that day takes the suffix `-2`.
- The record opens with the front matter of rule 7 (`title`, `date`, `target`, `status`). Once `SHA256SUMS` exists the record is immutable (rule 6): a correction is a new record with `supersedes:`.
- The index line is `- <YYYY-MM-DD> · audits · [Codebase defects](audits/<YYYY-MM-DD>-codebase-defects.md) · target <sha>`. Make it the first entry of `records/INDEX.md`, in place of `(no records yet)` if that is still there, and set that file's `updated:`. If the checkout has no `records/INDEX.md` yet, create `records/audits/` anyway and give the line in your final message.
- The evidence folder holds what a rerun needs and nothing a script can regenerate: no bundles, build output, copies of repository files, worktrees or toolchains. Name a download by URL and SHA-256. Stay under 10 MB; the 2026-09-24 audit needed 2.

The record, in order:

1. Front matter, then the baseline: environment and pins, every §4 gate with exit code, counts and duration, scope decisions.
2. Ranked register: Critical and High in full (§7), Medium table, Low counts.
3. Status re-verification: every known SCN or B id you touched, with its rerun result on the target.
4. Coverage matrix, the twelve layers by the six sweeps of §6: each cell holds finding ids, "cleared" with the probe named, or "blind spot" with the reason.
5. Refuted appendix.
6. Limitations: what did not run and why, what used a software renderer, what stayed single-source.
7. Next actions: one proposed PR per defect in the owner's working style, small commits with a red test first.
8. Score, as a secondary lens: the eight weighted dimensions of `agent-notes/CODEBASE_AUDIT_2026-09-07.md` §14 (functional 15, scientific 25, testing 15, architecture 10, performance 10, security 10, provenance 10, documentation 5), so results stay comparable with 36 (2026-08-23), 46 (2026-09-07) and 49 (2026-09-24).

## 11. Done when

- Every §4 gate has a recorded exit code and counts, or a recorded reason it did not run.
- Every Critical and High has a reproduction, a reachability proof and at least three refuter verdicts.
- Every known id you touched has a rerun result, not a line-presence inference.
- The coverage matrix has no empty cell.
- The record's name and header follow `records/README.md`, its `SHA256SUMS` verifies, and `records/INDEX.md` has its line.
- `git status` in `wt/` and `wt-gates/` shows no edits to tracked files. After that, nothing of yours is left: no servers, and no worktree of this run in `git worktree list`.
- The record names what did not run, and your final message names `<state>`.

## 12. Do not

Infer status from line presence. Validate an orbit at one epoch. Trust performance numbers from a software renderer. Open a browser window. Re-report the refuted list. Write into `agent-notes/`. Audit the owner's live checkout. Run mutations against a test subset. Launch a whole fan-out at once. Claim "on main" without rerunning. Produce a quick version; the value is the evidence standard.
