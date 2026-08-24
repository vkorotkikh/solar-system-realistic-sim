# Report C — `origin/sun-focus` and the New-Issue Hunt

**Part C of 4** · `main @ aa6e39a` vs `origin/sun-focus @ fd793f4` · 2026-08-23 · read-only · **run 2 (independent re-execution)**

> Companion parts: **[Report 0 — Baseline](MAJOR_ISSUE_REPORT_0_BASELINE_2026-08-23.md)** · **[Report A — Adversarial Verification](MAJOR_ISSUE_REPORT_A_ADVERSARIAL_2026-08-23.md)** · **[Report B — Blocked-Check Closure](MAJOR_ISSUE_REPORT_B_BLOCKED_CHECKS_2026-08-23.md)**

## What this part is

Two jobs the prior evaluation never did. First, **audit `origin/sun-focus`** — 69 commits ahead, the actual line of development, never reviewed by anyone. Second, **hunt outside the known register** for majors that both prior passes missed.

**Method.** Six agents, each required to verify claimed fixes by *executing both branch versions*, never by reading commit messages. `sun-focus` was checked out in a throwaway worktree. Run twice; run-2 agents were told not to read run-1 artifacts. **Run 2: 6/6 agents, 0 errors, 402 tool calls, ~850 k tokens.**

## Headline

**`sun-focus` is a real improvement that ships two regressions worse than what they replace — and neither is caught by its own new tests.** It genuinely fixes four things. It inherits every Critical and High from `main` except the Lambert defect. And it introduces **ten new majors**, two of which silently produce wrong physics.

Separately, the hunt found **four new majors on `main`** that neither prior pass caught, including two unauthenticated denial-of-service paths.

---

## 1. `sun-focus` baseline

| Measure | `main` | `sun-focus` | Note |
|---|---|---|---|
| `tsc --noEmit` | 1,300 errors | **344** | `tsconfig.json` is byte-identical; only 44 of the 956-error reduction comes from the deleted `temp_` duplicate. The rest is **genuine typing work** — `satelliteSystem.ts` 311→0, `sunController.ts` 109→0, `cloudDataPipeline.ts` 91→0. |
| `npm test` | script absent | **8 tests / 3 files, all pass** | vitest wired up properly. |
| `pytest` | 48 passed | **80 passed, 1 FAILED** | The failure is `test_rebound_engine_exports_self_describing_barycentric_states` — **sun-focus's own new test catches the `ias15` break that neither branch fixes.** |
| Unreachable TS | 31 of 61 files | 31 of 63 files (8,446 LOC) | sun-focus added **+2,041 / −769 lines into files that are still not wired**. |

That last row is the shape of the branch in miniature: substantial, careful work, some of it invested in code nothing executes.

---

## 2. The five claimed fixes, verified by execution

### 2.1 Lambert TOF-residual guard — **genuine and complete** ✅

A 4,000-case seeded fuzz across both branches:

```
main:      accepts 4000/4000, of which 538 (13.4%) have TOF residual > 1e-4 d, worst 322.2 DAYS wrong
sun-focus: accepts 3462,      of which    0 are non-converged
live, POST /trajectory/lambert earth->mars with arrival = departure + 1 day:
  main      -> HTTP 200, deltaVDeparture 180.10 km/s, deltaVArrival 181.51 km/s, no residual field
  sun-focus -> HTTP 422 "No Lambert solution for requested geometry/time"
  sun-focus, tof = 210 d -> HTTP 200 with rootResidualDays = 1.44e-06, rootBracketed = true
```

Endpoint miss also improves from 37–155 km to 1.9–4.1 km. This is the model of what a fix should look like: it rejects the bad case, and it *surfaces the evidence* (`rootResidualDays`) so a client can tell.

### 2.2 Benchmark honesty relabel — **genuine** ✅

`main` reports `scenarioCount 3, solvedCount 3, passCount 0` as though a real comparison ran, over the fabricated references documented in Report A. `sun-focus` marks all three `incomparable_reference` with `validationCoverage 0.0` and emits the compatibility note. It correctly **stops a false comparison** — while leaving zero validated accuracy scenarios, now disclosed rather than hidden. That is the right trade.

### 2.3 Asteroid `no-cache` meta fetch — **genuine** ✅

One line, `force-cache` → `no-cache`, matching the binary's default-mode revalidation. Live-reachable and it closes the stale-checksum false-failure documented in Report B §6.

### 2.4 Secular rates — **an anti-fix: 4.8× worse** ❌

The branch adds JPL per-century rates to every planet. The rate *values* are correct. The propagator is not:

```
propagated to JD 2461275.5, compared to JPL Horizons (CENTER 500@10, ECLIPTIC/J2000):
planet      MAIN km    SUN-FOCUS km    SF + M-correction km
earth        10,487        182,215              40,984
mars         58,000        326,414             150,232
saturn    1,179,225      3,093,042             295,269
uranus    1,033,692      6,113,695           1,081,527
neptune     665,098      7,462,523             687,618
TOTAL     3,963,582     19,081,786           3,387,128
```

**Root cause, proven:** mean anomaly advances at `n` while `argPeriapsis` and `node` *also* advance, so mean longitude gains an extra `d(ϖ)/dt` — apsidal precession is double-counted into along-track position. Subtracting `d(ϖ)·T` from `M` recovers 3.39e6 km, which **beats `main`**. So the intended fix is achievable; the implementation is one term wrong.

**And its own tests do not catch it:** the new `orbitMath` tests assert only that elements *changed*, never that accuracy *improved*.

### 2.5 Velocity units and frame — **a partial fix that introduces a worse regression** ❌

The fix is real: `main` emitted REBOUND's AU/yr unlabelled while `tudatpy_hooks` emitted AU/day — a 365.25× inconsistency. `sun-focus` divides by `DAYS_PER_YEAR` and declares `position_frame` / `velocity_frame` / `position_units` / `velocity_units`, and the `barycentric` label is truthful.

But **no frontend consumer of `vel` exists at all**, while the one real consumer — `server.py → kuiper.activate`, whose REBOUND sim is still `("yr","AU","Msun")` with no conversion added — now receives AU/day:

```
                 Jupiter            Saturn             Neptune
MAIN        a=5.2081 e=0.0493   a=9.5392 e=0.0540   a=30.0703 e=0.0086
SUN-FOCUS   a=2.4837 e=1.0000   a=4.5862 e=1.0000   a=15.0587 e=1.0000
TRUTH       a=5.20   e=0.048    a=9.58   e=0.056    a=30.07   e=0.009
```

`a = r/2` with `e = 1.0` is the exact signature of **zero injected velocity** (365.25× too small). Every `activate_kuiper` command now builds a Kuiper simulation whose Sun, Jupiter, Saturn and Neptune **plunge radially into the Sun** — the entire perturber field, which is the stated reason those bodies are there, destroyed silently with no error raised. `main` was self-consistent and numerically correct here.

**Fix:** multiply by `DAYS_PER_YEAR` at the `kuiper.activate` boundary, or have `activate` honour the new `velocity_units` field it was just given.

---

## 3. What `sun-focus` inherits unfixed

Verified by reading the branch's own blobs and by live execution, never by commit message:

| Defect | Evidence that it is unfixed |
|---|---|
| **`ias15` engine break** | Identical failure on a sun-focus uvicorn; the 69 commits touch `rebound_nbody.py` (+32/−20) but never remove the `ri_ias15` block. Its *own new test* fails on it. |
| **Orbit-normal sign flip** (K-05) | `git show main:… vs origin/sun-focus:…` of `orbitNormalFromElements` — **identical**. Io error unchanged at 159.95° / 827,729 km. |
| **Security posture** | `git diff main origin/sun-focus -- backend/server.py` = 18 added lines, **all** `protocol_version`; CORS/auth/bind lines untouched. |
| **39 MB orphaned textures** | `git diff --stat main origin/sun-focus -- src/assets` is **empty**. |
| **Dead frontend stack** | 31 of 63 files unreachable; `simulationClient.ts` — the only WebSocket client — still has zero importers. |
| **Asteroid data defects** (K-17, K-46) | The `.bin` blob is byte-identical (same git object, same md5); the builder is unchanged. |
| **Solar/SMBH numerics** | `smbhPropagation.ts` and `smbhPhysicsConstants.ts` are byte-identical between branches (`git diff` reports no change). |
| **Report-write containment** | Correctly contained on both — the one piece of good news that survives on both branches. |

---

## 4. New majors that `sun-focus` introduces

| ID | Sev | Finding |
|---|---|---|
| **SF-1** | High | **Secular-rate regression** — 4.8× worse than `main` (§2.4). |
| **SF-2** | High | **Kuiper perturbers destroyed** by the velocity-unit change (§2.5). |
| **SF-3** | Critical | **Unauthenticated CPU DoS via `GET /solar/physics`** — the new PFSS solver raises per-request cost ~100–360×, starving the whole threadpool. Absent on `main` (no `pfss` module exists there). |
| **SF-4** | High | **PFSS cache key ignores `fidelity`, `activity` and `jd`** → non-deterministic responses, contradicting the branch's own newly-added determinism claim. |
| **SF-5** | High | **Ephemeris `auto` chain reordered** to `spice → horizons → kepler`, making unauthenticated trajectory planning **network-bound on JPL**. `main`'s order is offline and deterministic (9-point porkchop grid: 0.01 s). |
| **SF-6** | High | **Moon periapsis rotation regresses Europa 4.8× and Ganymede 1.3×** — the new rotation is layered on the *uncorrected* K-05 sign convention, so all Galileans converge on the same ~159.8° error. |
| **SF-7** | Medium | **Binary-KBO companions are massless** and unbind immediately, while `binary_pairs` metadata claims they are bound. |
| **SF-8** | Medium | **Kuiper WS payload changed** `number[][]` → dict with no effective protocol gate (latent; both consumers are dead code). |
| **SF-9** | Medium | **`catalog.test.ts` is tautological** — it re-implements the code under test, so it passes while results are 160° wrong. A test that cannot fail. |
| **SF-10** | Low | CME minimum speed lowered to **20 km/s**, below the solar wind and below escape velocity; belt count raised 15k → 50k, so the fp32 defect now covers 3.3× the instances; `applyScaleMode` silently skips quadtree meshes (the code admits this in a comment). |

SF-9 deserves emphasis alongside §2.4: **both new test suites are written so they cannot detect the regressions the same commits introduced.** A green suite here is not evidence.

---

## 5. New majors found on `main`

Beyond the register and beyond Report B:

**N-1 (Critical) — `set_julian_date` drives an unbounded loop with never-evicted checkpoints.** Verified over a live WS session: `{"type":"set_julian_date","jd":3547295.0}` (+3000 yr) is accepted with no bound, entering a `while True` checkpoint loop while the checkpoint dict grows without eviction. Combined with the uninterruptible-integrate finding in Report B §3, one message permanently hangs a connection's worker thread.

**N-2 (Critical) — porkchop grid completely unbounded** (measured in Report B §2; the hunt independently confirmed 45 in-flight requests exhaust the default anyio threadpool).

**N-3 (High) — no WebSocket connection cap.** Each connection allocates a REBOUND engine, an OS thread, and a 3,000-particle Kuiper sim. *Explicit refutation of the tasked hypothesis:* the Kuiper particle count is **not** client-supplied on `main` — it is hard-coded at 3,000 — so that specific amplification lever does not exist.

**N-4 (High) — no worker watchdog and no snapshot-freshness check.** A silently stalled model worker freezes every planet and moon forever while the HUD clock keeps advancing; nothing notices. Related: the worker snapshot is *always* exactly one frame stale and nothing reconciles it, so planets render at a different date than the HUD displays.

**Confirmed with sharper numbers:** the solar-pole 90° mismatch; three divergent differential-rotation coefficient sets (the frontend's mis-attributed to Snodgrass 1983); the Hathaway normalizer using the `c=0` peak (66.14 mo) instead of the true `c=0.71` peak (58.39 mo), flat-topping solar maximum; the Helioviewer "real SDO observation" being a **512-px interior quadrant covering 3.33% of the solar disk**, wrapped equirectangularly over the whole sphere.

**SMBH constants, precisely diagnosed** (all inherited unchanged on `sun-focus`, verified by `git diff`):
- `crDiffusionCoefficient` rigidity conversion is wrong by **8.99e12** — statvolt→volt inverted (divides by `c` instead of multiplying).
- **New:** the `1e-10` rigidity floor **saturates for every energy below 3.6e12 eV**, so the advertised energy dependence is dead across the entire relevant range.
- `gyroRadius` has a spurious `/c`: 2.23e10 cm (0.0015 AU) for a 1 EeV proton in 5 µG, instead of 6.67e20 cm (216 pc).
- `rSchwarzschildCm` (and derived `rIscoCm`, `rPhotonCm`) for Sgr A* and M87* are **metres labelled cm** — 100× small.
- **New:** `heliosphereResponse.equilibriumTimeSec` multiplies an already-correct seconds value by an undocumented `1e5`.
- **Confirmed correct:** Sedov–Taylor with ξ₀ = 1.15 *and its exact inversion*, Sedov velocity, Rankine–Hugoniot compression, and the rest of the standard blast-wave set.

**Asteroid provenance, re-derived from the shipped bytes and live JPL:** all 100,000 periods quantized to 3 significant figures (`full-prec=false`); taxonomy for **99.07%** of the catalog fabricated from semi-major axis alone; the project's own coverage validator **fails against its own shipped data**; and the three taxonomy tables agree on the letter map but **disagree three ways on the null-`a` fallback** (Python → C, `catalog_fetcher` → M, resolver → Unknown).

**Clean:** time machinery under abuse — reverse at maximum warp and extreme dates are well-behaved, and no jump-to-date UI exists to abuse. The worker sequence protocol is sound.

---

## 6. Branch recommendation

**Adopt `sun-focus` as the canonical branch — but land three fixes on it first, and do not fast-forward `main` blind.**

*Why adopt it:* it is the active line (last commit 2026-07-25 vs `main`'s 2026-03-07), it cuts type errors 1,300 → 344 through genuine work, it adds a real test runner and three backend test modules, and it carries four verified fixes — the Lambert guard, the benchmark honesty relabel, the asteroid cache fix, and the velocity labelling. Nothing on `main` is absent from `sun-focus` except a stale README framing.

*Why not blind:* it ships **SF-1** (planets 4.8× worse), **SF-2** (Kuiper perturbers in radial free-fall), and **SF-3** (an unauthenticated CPU DoS that does not exist on `main`) — three regressions that are each worse than what they replace, and none of which its new tests can detect.

**Sequence:**
1. Fix **SF-1** — subtract `d(ϖ)·T` from `M` (the correction is proven to beat `main` at 3.39e6 km).
2. Fix **SF-2** — convert at the `kuiper.activate` boundary, or honour `velocity_units`.
3. Fence or bound **SF-3/SF-4** — cap PFSS work per request and key the cache on `fidelity`/`activity`/`jd`.
4. Then land the shared roadmap below.

---

## 7. Roadmap (both branches unless noted)

**Now — correctness and honesty (≤ 1 week)**
1. Fix the belt transform order — accept: an annulus is visible at 6 AU; a unit test asserts `|world − orbitPos| < radius` for one instance.
2. Pin or port REBOUND, and make `/health` initialize an engine rather than test an import — accept: default `/ws/sim` streams; an **unmocked** init test exists per advertised integrator.
3. Fail the asteroid load **closed** on missing `meta.json`; never downgrade SHA-256 → FNV-1a; separate "slow" from "invalid" — accept: each of the six failure modes in Report B §6 shows a labelled fallback.
4. Retract the benchmark references and regenerate with committed inputs and logs; gate CI on `passRate == 1` (`sun-focus` has already done the honest half).
5. Bound `/trajectory/porkchop` (total grid points, plus `gt=0` on `tof_min_days`) and make it async so client disconnect cancels — accept: a 300-byte POST cannot buy minutes of CPU.
6. Bound `set_julian_date` and prune `_checkpoints`; add a cooperative interrupt inside the integration loop so `stop()`'s 3 s join actually stops it.
7. Security baseline for any non-localhost use: explicit origin allowlist without credentials, WS origin check, `127.0.0.1` default, no absolute paths in responses.
8. Rewrite the README around what `index.html` ships; label the Cataclysmic Events panel speculative in a way that survives the next UI interaction.

**Next — scientific validity (≤ 1 month)**
9. Seed the N-body from osculating state vectors (proven: Saturn 60.2 → 0.124 Mkm).
10. Fix the moon frame conversion — the orbit-normal sign *and* the periapsis re-referencing together; fixing one without the other made `sun-focus` worse.
11. Enforce `|v∞|` continuity at flybys, or charge the mismatch; count distinct routes rather than beam partials.
12. Fix the ephemeris `auto` order so it matches its docstring, and report the provider actually used.
13. Key the solar cache on `jd`, add single-flight, cap upstream reads, fix or remove the dead SWPC feed.
14. Pass `JD − J2000` to the belt shader; fix the ACBF self-test tolerance.
15. Correct the SMBH constants (rigidity, gyroradius, Schwarzschild radii, the saturating floor).
16. Wire `typecheck` + vitest into `build`; add CI.

**Later** — planet secular rates (done correctly this time); real taxonomy and full-precision periods; mission economics (charge propellant once, couple risk to feasibility); delete or quarantine the dead stack; LICENSE and attribution manifest; resilience and accessibility (WebGL banner, offline indicator, labelled `<select>`, reduced-motion, the sub-1150px layout).
