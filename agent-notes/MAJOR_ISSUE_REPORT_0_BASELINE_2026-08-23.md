# Report 0 — Baseline & Environment

**Part 0 of 4** · `main @ aa6e39a03e7d95d6f7733e8a4710b990bada9859` · 2026-08-23 · read-only

> **The four-part set.** This evaluation is split by workstream so each part can be read, acted on, and re-run independently:
> - **Report 0 — Baseline & Environment** (this file): Phase-0 measurements with Ground-Truth-Packet drift, toolchain, scope decisions, and what was blocked.
> - **[Report A — Adversarial Verification](MAJOR_ISSUE_REPORT_A_ADVERSARIAL_2026-08-23.md)**: an independent refutation pass over the 20 prior findings (F-01..F-20).
> - **[Report B — Blocked-Check Closure](MAJOR_ISSUE_REPORT_B_BLOCKED_CHECKS_2026-08-23.md)**: the six dynamic checks the comprehensive audit could not run.
> - **[Report C — sun-focus & New-Issue Hunt](MAJOR_ISSUE_REPORT_C_SUNFOCUS_HUNT_2026-08-23.md)**: the never-audited branch plus discovery outside the known register.
>
> This is **run 2** — a deliberate second, independent execution of all three workstreams. Agents were instructed not to read run-1 artifacts and to reach their own verdicts, so that agreement between runs is evidence rather than an echo. Run-1 outputs are retained for cross-run comparison, reported per finding in Reports A/B/C.

---

## 1. Scope decisions (prompt §3)

1. **Commit under evaluation:** `main @ aa6e39a`. Working tree clean of tracked modifications; untracked files are confined to `agent-notes/` (this report set and the prompts). `origin/sun-focus @ fd793f4` — 69 ahead / 7 behind, merge-base `c3b00e0` — audited in a throwaway `git worktree` (removed after each run). Branch recommendation lives in Report C.
2. **Live vs. disconnected code:** 30 of 62 `.ts` files are reachable from `src/main.ts`; 32 files (8,275 LOC) are unreachable on both branches. Defects in unreachable code are reported one severity notch down as *reactivation traps*, never as product features.
3. **Speculative astrophysics:** evaluated on three axes only — label separation from standard physics, numerical correctness of the *standard* parts, and whether triggering corrupts baseline simulation state. Not peer-reviewed as science.
4. **Assets and data:** provenance, licensing, size, and load-reachability. Aesthetics out of scope.
5. **Out of scope:** visual-design opinion, rewriting code, the scientific merit of the research documents, the author's AI tooling. Git history is in scope as process evidence.

## 2. Toolchain

The host has no Node on `PATH` and no backend Python dependencies system-wide, so the audit runs from a self-contained scratchpad toolchain:

| Component | Version / source |
|---|---|
| Node / npm | 22.23.2 / 10.9.8 (tarball unpacked in scratchpad) |
| Python (venv) | 3.12.13 (built from a conda 3.12 interpreter; host Python is 3.14.6) |
| REBOUND | **5.1.1** — what an unpinned `rebound>=4.0.0` resolves to today |
| Test extras | `httpx2` (required by `starlette.testclient`; **absent from `backend/requirements.txt`**) |
| Oracles | JPL Horizons API; `pykep` 3.0.1 (Izzo Lambert) in a separate venv |
| Browser | Playwright Chromium (headless-shell), WebGL via **ANGLE/SwiftShader (CPU)** |
| Host | Ubuntu 24.04 (WSL2, kernel 6.18.33.2), 32 threads, 45 GiB RAM |

**All frame-time numbers in this report set are SwiftShader CPU lower bounds**, not GPU measurements, and are labelled as such wherever they appear.

## 3. Phase-0 baseline — run 2 (fresh re-execution)

Every measurement below was re-executed from the clean toolchain in run 2, independently of run 1. **Drift** compares against the 2026-08-22 Ground-Truth Packet; **R1→R2** compares run 1 against run 2 on the same day.

| Measurement | Packet (2026-08-22) | Run 2 (re-measured) | Drift | R1→R2 |
|---|---|---|---|---|
| `git rev-parse HEAD` | `aa6e39a` | `aa6e39a` | = | same |
| working tree | clean | clean (untracked = `agent-notes/` only) | = | same |
| `tsc --noEmit` total | 1,300 in 28 files | **1,300** | = | same |
| tsc by code | TS7006 439 / TS2339 438 / TS7031 188 | **TS7006 439 / TS2339 438 / TS7031 188** | = | same |
| worst files | `satelliteSystem` 311, `sunController` 109, `cloudDataPipeline` 91 | **311 / 109 / 91** | = | same |
| tsc in reachable graph | 438 | **438** | = | same |
| `vite build` | succeeds | **succeeds** | = | same |
| main chunk | 848.57 kB (gzip 209.85) | **848.57 kB (gzip 209.85)** | = | same |
| worker chunk / CSS | 18.4 kB / 6.5 kB | **18.44 kB / 6.53 kB** | = | same |
| `self.onmessage` in main chunk | 1 | **1** | = | same |
| images emitted to `dist/` | 0 from `src/assets/textures` | **9 total, 0 from `src/assets/textures`** (all from `public/textures/moons/`) | = (nuance) | same |
| reachability | 30 reachable / 32 unreachable | **30 / 32** (11,329 / 8,275 LOC) | = | same |
| live DOM ids used-but-undefined | 0 | **0** of 28 used | = | same |
| `pip install -r backend/requirements.txt` | resolves REBOUND 5.1.1, no `httpx` | **REBOUND 5.1.1; `httpx` absent** | = | same |
| `pytest` (clean requirements) | 3 collection errors | **3 errors** — `starlette.testclient requires httpx2` | = | same |
| `pytest` (with httpx2) | 48 passed | **48 passed**, 1 warning, 0.53 s | = | same |
| `/ws/sim` default | fails | **1011 internal error** | = | same |
| `/ws/sim?integrator=ias15` | fails | **1011 internal error** | = | same |
| `/ws/sim?integrator=whfast` | streams | **`connected` + `state_update`** | = | same |
| `/health` engines | rebound available:true, fidelity:high | **available:true, fidelity:high** (while the default WS connection fails) | = | same |
| `GET /benchmark/accuracy` | 0/3 pass | **passCount 0, passRate 0.0, scenarioCount 3, meanAbsErr 22.824 km/s** | = | same |
| `mission.epo.smoke_test --compact` | 0/30 | **total 30, passed 0, failed 30, exceptions 0** | = | same |
| ahead/behind `origin/sun-focus` | 69 / 7 | **69 / 7** | = | same |
| `.git` / `src/assets` / `public` | 46.6 MiB pack / 39 MB / — | **56 MB `.git` (46.63 MiB pack) / 39 MB / 4.4 MB** | = | same |

**Zero drift on every Ground-Truth-Packet number, and zero divergence between run 1 and run 2.** The baseline is stable and reproducible.

Two observations worth stating precisely, because both are easy to misread:

- `vite build` **does** emit nine JPGs — but every one comes from `public/textures/moons/`, which Vite copies verbatim. The 39 MB `src/assets/textures/` tree contributes **zero bytes** to the build, exactly as the packet claims; it is tracked, unreferenced by any TypeScript file, and never shipped.
- `/health` reporting `rebound: available, fidelity: high` while the default WebSocket connection dies with 1011 is not a race or a startup artifact — it reproduced identically in both runs. The health probe tests whether the `rebound` module imports, not whether an engine can initialize. See Report A, finding on the `ias15` break.

## 4. Blocked and not-run (kept distinct from "failed")

| Item | Class | Blocker |
|---|---|---|
| TudatPy force-model wiring | **blocked** | Not installable via pip (`pip download tudatpy` → no matching distribution); conda-only. Configuration objects were read, never executed. Not scored. |
| Real-GPU frame timings & drawing-buffer reallocation | **blocked** | WSL2 without GPU passthrough; Chromium reaches only SwiftShader. All timings are CPU lower bounds. |
| GMAT / Orekit / Tudat native re-runs | **not-run** | No input decks, scripts, or kernels exist in the repo to re-run — which is itself evidence for the benchmark-provenance finding (Report A). |
| Force-cache regeneration skew across two real browser sessions | **blocked** | Playwright `page.route` fulfilment bypasses the HTTP disk cache, and each context launches with no persisted cache; needs two sequential real-server sessions. Determined by source reading only. |
| Horizons ephemeris before 1600 / 1750 / 1800 for outer bodies | **not-run** | Outside Horizons' coverage for those bodies; those comparison cells are `n/a`. |

Nothing in this table is counted as a passed or failed check anywhere in the report set.
