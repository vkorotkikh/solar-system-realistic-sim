# Audit & Issue Documentation Index — 2026-10-07

> Current status (2026-10-14): see [the master tracker](MASTER_ISSUE_TRACKER_2026-10-11.md) and [active remediation effort](REMEDIATION_EFFORT_2026-10-14.md). The dated findings below preserve their original snapshot; they are not current merge status.


Where this repository records codebase scans, known code defects, and errors in its physics and
mathematics. Built by triaging all 126 markdown files in the working tree; about 40 are relevant.
Everything else is research notes or ordinary documentation (listed at the end).

> **§3 and §5 were re-verified against `main` `17d1e63` on 2026-10-07** (code read, plus numerical checks
> where a status depends on numbers). The fixes in §5's last column are on the unmerged branch
> `fix/physics-math-findings` (14 commits on top of `17d1e63`).

---

## 1. Full codebase audits and scans (newest first)

| File | Audited | What's in it |
|---|---|---|
| [CODEBASE_AUDIT_2026-09-24.md](CODEBASE_AUDIT_2026-09-24.md) + [evidence](CODEBASE_AUDIT_2026-09-24_EVIDENCE/README.md) | `9418652` (+ `bd48a7d` addendum, §14) | Latest full audit: 6 High / 24 Medium / 17 Low, scored 49/100. **Not committed to git.** |
| [CODEBASE_AUDIT_2026-09-07.md](CODEBASE_AUDIT_2026-09-07.md) + [raw data](CODEBASE_AUDIT_2026-09-07_RAW_DATA.md) | `ec7ad33` | Full audit, 46/100, 8 Highs, plus a list of refuted claims |
| [CODEBASE_AUDIT_2026-09-06.md](CODEBASE_AUDIT_2026-09-06.md) | working tree, 2026-09-06 | 75 Grok agents in two passes. **The most mathematics/physics-focused document in the repo** — about 40 physics topics (§4, §8–9) |
| [MAJOR_ISSUE_REPORT_2026-08-24.md](MAJOR_ISSUE_REPORT_2026-08-24.md) | `44088f8` | Checks whether each claimed fix worked. Its 2026-08-27 reconciliation counts 56 root causes: 23 active, 12 partial, 16 resolved, 4 not-a-bug, 1 duplicate |
| MAJOR_ISSUE_REPORT [0](MAJOR_ISSUE_REPORT_0_BASELINE_2026-08-23.md) · [A](MAJOR_ISSUE_REPORT_A_ADVERSARIAL_2026-08-23.md) · [B](MAJOR_ISSUE_REPORT_B_BLOCKED_CHECKS_2026-08-23.md) · [C](MAJOR_ISSUE_REPORT_C_SUNFOCUS_HUNT_2026-08-23.md) | `aa6e39a` + sun-focus | Baseline, adversarial check, blocked checks, sun-focus audit. **Report C holds the canonical R01–R56 cross-report ledger** |
| [CODEBASE_EVALUATION_REPORT_2026-08-23.md](CODEBASE_EVALUATION_REPORT_2026-08-23.md) (+ `audit.html`) | `aa6e39a` | Comprehensive evaluation, 36/100 |
| [CODEBASE_EVALUATION_REPORT_2026-08-23_CODEX.md](CODEBASE_EVALUATION_REPORT_2026-08-23_CODEX.md) | `aa6e39a` | Codex's separate evaluation of the same commit |
| [solar_system_codebase_analysis_consolidated_2026-02-21_03-08-50.md](../solar_system_codebase_analysis_consolidated_2026-02-21_03-08-50.md) | February, before the rewrite | Merges three earlier analyses |
| [CODEX_XTRAHIGH_2026-02-15](../my-notes/codex-xhigh/CODEX_XTRAHIGH_2026-02-15_04-32-06.md) · [CODEX_XTRAHIGH_2026-02-18](../my-notes/codex-xhigh/CODEX_XTRAHIGH_2026-02-18_02-03-41.md) | February | Deep audit (findings by severity) and a re-audit three days later |
| [CLAUDE_OPUS_WORK_LOG_2026-02-15.md](../CLAUDE_OPUS_WORK_LOG_2026-02-15.md) | February | Audit plus the fix for a Julian-date double-count in `rebound_nbody.py` |
| `my-notes/IMPLEMENTATION_AUDIT_2026-02-1{5,6}_*.md` ×4 | February | Roadmap-completion checks, not bug hunts |

**Focused verification reports (2026-08-24):** [MOON_FRAME_VERIFICATION](MOON_FRAME_VERIFICATION_2026-08-24.md),
[IAS15_FIX_VERIFICATION](IAS15_FIX_VERIFICATION_2026-08-24.md), [WORKER_BOUNDARY_AUDIT](WORKER_BOUNDARY_AUDIT_2026-08-24.md),
[SERVER_HARDENING_AUDIT](SERVER_HARDENING_AUDIT_2026-08-24.md).
[Claude_opus_5_analysis_results_of_sunfocus_regression.md](Claude_opus_5_analysis_results_of_sunfocus_regression.md)
is a concatenated copy of three of those.

## 2. Plans and status ledgers that track known issues

- [SUNFOCUS_REGRESSION_STATUS_AND_FIX_PLAN_2026-09-25.md](SUNFOCUS_REGRESSION_STATUS_AND_FIX_PLAN_2026-09-25.md) —
  the current consolidated status. It supersedes three pruned files (§4).
- [TRAJECTORY_AMPLIFICATION_DEFENSE_IN_DEPTH_PLAN_2026-09-25.md](TRAJECTORY_AMPLIFICATION_DEFENSE_IN_DEPTH_PLAN_2026-09-25.md) —
  H-3, the request fan-out to Horizons.
- [R3R4_PFSS_IMPLEMENTATION_PROMPT_2026-09-25.md](R3R4_PFSS_IMPLEMENTATION_PROMPT_2026-09-25.md) — PFSS work order;
  states the basis functions and grid interpretation are wrong.
- [H1_SOLAR_DELIVERY_PLAN_2026-09-25.md](H1_SOLAR_DELIVERY_PLAN_2026-09-25.md) + [evidence](H1_SOLAR_DELIVERY_PLAN_2026-09-25_EVIDENCE/README.md)
  (**not committed**) — its `h1/digest.md` documents defects in the backend solar route.
- [phase1_closure_and_hardening_todos.md](phase1_closure_and_hardening_todos.md) — an older TODO list from March.

## 3. Physics-gap analyses (model shortcomings rather than code bugs)

- [Opus_4.6_Solar_Corona_Physics_Gaps_Plan_2026-02-17.md](../my-notes/Opus_4.6_Solar_Corona_Physics_Gaps_Plan_2026-02-17.md).
  `my-notes/Codex_GPT-5.4_Solar_Corona_Physics_Gaps_Plan_2026-03-09_00-06-41_CDT_25009.md` is a **byte-identical copy**.
- [sun_model_analysis.md](../sun_model_analysis.md) — gap analysis of the Sun model.

**Status at `17d1e63` (2026-10-07).** Most of both plans has been built; what remains is mostly fidelity.

| Gap (source) | Status | Evidence / what is missing |
|---|---|---|
| Asymmetric Hathaway cycle (Opus §2) | Built | `solar_physics.py` `_hathaway_normalized`; frontend fallback `sunController.ts:84-102`. Both normalised at the c = 0 peak (3.4% overshoot, clamped flat top): backend fixed on the branch (`0ea15f8`), **frontend fallback still has it** (H-1-owned file) |
| Bipolar active regions, Hale + Joy laws (Opus §3) | Built | `solar_physics.py:189-336, 500`: tilt 0.5·\|lat\| ± 15°, Cycle 25 leading polarity by hemisphere |
| CME speed distribution (Opus §4) | Partial | 20–3500 km/s envelope exists (`:628-636`) but speed is a deterministic linear function, not the log-normal (Yashiro 2004) the plan specified |
| Parker spiral (Opus §5) | Built | `_build_parker_spiral`, HCS tilt 7°→75° with activity, WSA wind speeds; rendered. Six lines by default; rigid 25.38 d (Carrington) rotation; WSA binarised at 550 km/s (09-06 audit) |
| Limb darkening, Voronoi granulation, umbra/penumbra, faculae (sun_model A1, A2, A4) | Built | `sunVisuals.ts:94-260` (Neckel–Labs per channel, Wilson depression, Evershed fibrils, Topka CLV) |
| Differential rotation in the shader (A3) | Partial | Present, but coefficients (14.44, −2.87, −0.36) are not Snodgrass's and latitude is world-frame; the pole fix is on `fix/solar-display-truth` (H2.5) |
| Supergranulation; active-region emergence | Partial | 4% network modulation (`sunVisuals.ts:259`); backend emergence factor only |
| Spicules, chromosphere / 304 Å layer (B1, B2) | Built | `sunVisuals.ts:714-774` |
| Flares, directed CME shell (C1, C2) | Built | `solarFlares.ts` (hemispherical shell geometry); visibility fixes on `fix/solar-display-truth` |
| PFSS field lines, magnetogram texture (D1, D2) | Built | `pfss_magnetogram.py` (Schmidt basis verified orthogonal to 1.2e-14), `solarMagnetics.ts:390` |
| Coronal holes, helmet streamers, K-corona falloff (E, §2.3) | Built | backend `coronal_holes`; `sunVisuals.ts:463-486` (Baumbach–van de Hulst) |
| Coronal temperatures | Partial | Per-tube temperature in the backend; AIA DEM channel response in the shader; no radial thermal gradient |
| Alfvén waves | Partial | Alfvén speed computed (`solar_physics.py:563`); no waves propagating along field lines |
| Heliospheric current sheet | Partial | Warped HCS in the Parker lines; no current-sheet surface |
| p-mode oscillations; termination shock | Open | No implementation in the Sun model |
| Plages | Not checked | — |

## 4. Secondary sources

- **Evaluation prompts that embed known-issue lists (now stale):**
  [codebase_evaluation_prompt_2026-08-22.md](codebase_evaluation_prompt_2026-08-22.md) (K-01…K-53),
  [codebase_evaluation_prompt_major_issues.md](codebase_evaluation_prompt_major_issues.md),
  [major_issues_audit_prompt_2026-08-23.md](major_issues_audit_prompt_2026-08-23.md).
- **Rolling fix logs:** [Development_Improvements.md](../Development_Improvements.md),
  [Development_History_Context.md](../Development_History_Context.md), `my-notes/WORK_DONE_*`, `my-notes/codex-xhigh/CODEX_XHIGH_*`.
- **Generated benchmark output:** `my-notes/ACCURACY_REPORT_2026-02-15_*` ×4, best pass rate 33%. The benchmark's
  reference values were later shown to be unreproducible, so these numbers are **not evidence of accuracy**.
- **Pruned in `7cab690`:** `SUNFOCUS_REGRESSION_FIX_PLAN_2026-08-23.md`, `R3R4_VERIFICATION_REPORT_2026-08-25.md`,
  `R3R4_VERIFICATION_LOG_2026-08-25.md`. Recover any of them with `git show 7cab690^:agent-notes/<name>`.

## 5. Physics & mathematics errors, and where each is documented

| Error | Best sources | Status at `main` `17d1e63` (verified 2026-10-07) | On `fix/physics-math-findings` |
|---|---|---|---|
| Apsidal precession double-counted | Report C §2.4; 09-07 F-01; 09-24 M-22 | Fixed for planets and the Moon; per-ephemeris period gate in `catalog.ts` | Io/Europa follow below |
| Moon period conventions; Io/Europa wrong | 09-07 F-01; 09-24 M-23 | **Open**: Io 8.47e5 km, Europa 1.35e6 km off over 2000–2030, hidden by `DATA_LIMITED` budgets up to 2.7e6 km. Ganymede/Callisto were already right (4.5e3/4.9e3 km) | **Fixed `0caa1bd`.** Real cause: Io/Europa apsides *regress* (Laplace resonance) and Triton's node is *prograde* (retrograde orbit, measured 677.6 yr). Worst 2000–2030 now Io 1.56e3, Europa 2.16e3, Triton 2.53e4 km; budgets 2× measured |
| Moon frames; Dione/Rhea far off | MOON_FRAME_VERIFICATION; 09-24 M-23 | Conversion fixed; Chebyshev fits for Titan, Iapetus, Phoebe, Cordelia. Dione 7.3e5 km and Rhea 1.0e6 km off, **constant** in time (~180° phase: element data) | Not addressed |
| "Earth" is the Earth–Moon barycentre | 09-06 §4; 09-24 M-3 | **Open**: 11.05–13.74 m/s off Horizons 399 | **Fixed `fea6f9d`**: 0.52–1.48 m/s; the planet gate now pins Earth's velocity |
| UTC fed into a TDB model | 09-24 M-2 | Fixed (`bd48a7d`) | — |
| N-body seeded from mean elements | 08-23 F-04 | Fixed (`2226277`) | — |
| PFSS Legendre functions; sine-latitude weights | 09-06 §4/§9; 09-24 H-2 | **Fixed on main** by the R3/R4 remediation: Schmidt basis orthogonal to 1.2e-14, P̄₂⁰(0.5) = −0.125 exact; equal-area sine-latitude grid with area weights | — |
| SMBH constants and apparent β | K-14; 09-06 §4/§9 | **Open**: Schwarzschild radii 100× small (ISCO and photon sphere too); heliosphere time ×1e5 (19 yr → 1.9 Myr); front sped up by transverse β_app, hitting the Sun at 4.07 s while the GW fires at 8 s | **Fixed `eef8945`** (observer-frame switch kept wired but no longer alters timing) |
| float32 precision (asteroid shader JD) | 09-24 M-1 | Not re-checked | — |
| Velocity units AU/yr vs AU/day; JD double-count | Report C §2.5; Feb work log | Fixed (not re-checked) | — |
| Lambert | 08-23 F-06; 09-24 M-19/L-1 | Certification fixed. **Open**: no multi-rev; fast short-way roots missed (grid stepped over the y = 0 boundary); grid ran past 4π². θ ≈ 180° is **not a defect**: 179.999° matches Izzo to 1.2 mm/s, exactly 180° is undefined | **Fixed `62fd99a`**: multi-rev low/high, hyperbolic extension, 4π² cap, rejects arcs through the Sun. Matches lamberthub Izzo on 148 cases to ≤ 1.2e-7 m/s |
| MGA | 09-06 §4; K-28/29; 09-24 M-4 | v∞ continuity enforced (fixed). "Fake assist gain" is stale: it is the true flyby Δv, used only as a ranking term. **Open**: flat 300 km floor above the *mean* radius (Saturn inside its 1-bar level); planner rarely finds assists (M-4) | **Floor fixed `838e7bf`** (equatorial radii; Jupiter 671,492 km per GTOP). M-4 search quality not addressed |
| Fast Kepler solver, e ≥ 0.99 | 09-24 L-2 | **Open** (worst residual 1.1e8 rad) | **Fixed `7a21468`**. The GLSL belt solver is unchanged (main-belt data, e < 0.4) |
| Solar formulas | Report C §5; 09-06 §4/§9 | Hathaway normaliser **open** (backend and frontend fallback); rotation label wrong; Y-up/Z-up pole and AIA mapping in progress on `fix/solar-display-truth`; main marks the AIA tile `spatial_use.eligible = false` | **Backend fixed** `0ea15f8`, label `a91ce42`. Frontend fallback (`sunController.ts:97-102`) left for the H-1 branch |
| Mission economics | 09-06 §4; K-31/K-52 | **Open**: a plan 26.5 km/s short reported 9,021 kg returned at 0.0 failure probability | **Fixed `62a4f5d`**: cargo in the rocket equation, no double subtraction, per-sample re-closure → 0 kg, 1.0 |
| Benchmark references | 08-23 F-03; 09-24 H-4 | **Open**: 3/3 scenarios incomparable, mean error reported as 0.0 | **Fixed `dc1f0ab`**: null metrics, 2 published textbook fixed-state references (pass, ≤ 4e-5 km/s). Legacy rows unchanged |
| Pluto without secular rates | 09-24 M-15 | **Open**: 0.54–1.90e6 km off 1900–2100 | **Fixed `fc32483`**: matches an independent Standish evaluation exactly; Pluto added to the planet gate |
| Sirius B Kepler III | 09-06 §4 | **Open** (−2.72%; Sirius B had Sirius A's mass) | **Fixed `dcef69b`** from Bond et al. 2017: 0.0006% |
| Galactic tide axes | 09-06 §4 | **Open**, dead code | **Fixed `074759c`** (still not wired in) |
| Trojan phasing | 09-06 §4 | **Open**, dead code (mean longitude uniform) | **Fixed `607ba0d`** (pipeline still not imported) |

## 6. Caveats

- **§3 and §5 now carry statuses verified on 2026-10-07**; the source documents still show their own (older) ones.
- **Still open after the branch:** Dione/Rhea element data; 287 retrograde irregular moons still assume regressing
  nodes (unmeasurable under their 2–4% mean-motion errors, and moons are not rendered); the frontend Hathaway
  fallback; MGA search quality (M-4); CME speed distribution; the legacy benchmark rows.
- **The two most current documents aren't in git** (the 09-24 audit and the H-1 plan, each with an evidence
  folder). A `git clean` or a fresh clone would lose them. This index is not committed either.
- **The 2026-09-25 multi-agent scan produced nothing usable.** Only 4 of 9 areas returned anything, and those four
  reported zero findings — just status rows. Its working files are gone from `/tmp`.

## 7. Left out

About 50 SMBH, superluminal and cosmology research notes (speculative physics, not code defects; several are
duplicates); `quick_sun_notes.md`, which is pasted shader code rather than notes; the README; format and pipeline
docs (`src/data/asteroidCatalogBinaryFormat.md`, `src/sim/asteroids/README.md`, `scripts/asteroid/README.md`,
`backend/benchmark/CALIBRATION_PROTOCOL.md`); and pytest-cache files.
