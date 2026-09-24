# Major-Issue Report — `main @ 44088f8` (2026-08-24)

## 2026-09-24 current-branch reconciliation

> **Authoritative status update.** The original report below remains an evidence record for
> `main @ 44088f8`; its present-tense status and roadmap language is historical. This section
> supersedes it for the current branch. It does not rewrite old measurements as though they
> had been made on the new code.

### Current pin and verification

| Item | Reconciled value |
|---|---|
| Branch | `fix/nbody-osculating-initial-state` |
| Code audited through | `a864ea4` (`test: remove assertions superseded by Horizons gates`) |
| Scientific baseline fix | `2226277` (`fix: seed n-body model from validated JPL states`) |
| Backend verification | **176 passed**, 5 deprecation warnings |
| Frontend verification | **108 passed** in 7 Vitest files |
| Production bundle | **PASS**; Vite transformed 40 modules (approximately 892.90 kB main-chunk warning only) |
| Strict TypeScript | **FAIL**; **280 errors** remain, so this is still not a release gate |

Status terms used here are deliberately strict:

- **RESOLVED** means the reported failure mechanism is removed and a regression gate exercises
  the relevant behavior.
- **PARTIAL** means the dangerous symptom is contained or some affected cases pass, but the
  complete scientific, operational, or provenance claim is not yet established.
- **ACTIVE** means the reported root cause or a material part of it is still present.
- **NOT-A-BUG** and **DUPLICATE** do not count as unresolved defects.

### How many findings remain

The four reports repeat the same defects under different IDs. Adding their row counts would
therefore overstate the result. Report C's reconciled `R01`–`R56` inventory is the canonical
cross-report ledger: it groups overlapping sub-findings into **56 root-cause groups** (for example,
the several mission-economics symptoms form one mass-flow root cause, while the physically invalid
MGA flyby and its route-budget defect remain separate). Report B deliberately retains a more
granular symptom-level register, so its rows map many-to-one into this ledger.

| Current disposition through `a864ea4` | Root-cause groups |
|---|---:|
| **ACTIVE** | **18** |
| **PARTIAL** | **11** |
| **RESOLVED** | **22** |
| **NOT-A-BUG** | **4** |
| **DUPLICATE** | **1** |
| **Total** | **56** |

Accordingly, **29 distinct root-cause groups still require work**: 18 active and 11 partial.
Blocked or unreplayable checks—including real-GPU performance, TudatPy installation, and two
checks whose original fuzz/offline inputs were not preserved—are tracked in Report B but are not
counted as code defects. Report-local counts are also recorded in Reports A, B, and C so the
normalization can be audited rather than inferred:

| Register | ACTIVE | PARTIAL | RESOLVED | NOT-A-BUG | BLOCKED | DUPLICATE |
|---|---:|---:|---:|---:|---:|---:|
| Canonical cross-report / Report C (`R01`–`R56`) | 18 | 11 | 22 | 4 | 0 | 1 |
| Report A (30 primary findings) | 10 | 8 | 11 | 1 | 0 | 0 |
| Report B (50 canonical symptom-level rows) | 18 | 7 | 15 | 6 | 4 | 0 |

For this report's own explicit 18 major and 16 medium rows, the current split is:

| Report-local status | Count | IDs |
|---|---:|---|
| **ACTIVE** | **14** | `M-06`, `M-07`, `M-14`, `M-15`, `M-17`; `m-06`, `m-08`, `m-09`, `m-11`–`m-16` |
| **PARTIAL** | **6** | `M-02`, `M-03`, `M-04`, `M-13`, `M-18`; `m-01` |
| **RESOLVED** | **14** | `M-01`, `M-05`, `M-08`–`M-12`, `M-16`; `m-02`–`m-05`, `m-07`, `m-10` |
| **Total** | **34** | Low-severity prose-only observations are not promoted into this count. |

### The high-fidelity N-body defect is closed

Commit `2226277` replaces JPL approximate **mean elements** as instantaneous REBOUND inputs with a
fail-closed Cartesian fixture generated from JPL Horizons/DE441 at J2000 TDB. The fixture records
the query contract, source target, frame, epoch, units, and matching DE440/441 gravitational
parameters. Planet-system barycenters are used where their moons are not integrated separately;
Earth and Moon are initialized as separate bodies. REBOUND 5.1.1 is pinned, IAS15 configuration is
feature-detected, and readiness constructs a real probe simulation rather than reporting import
availability as fidelity.

Fresh offline comparison at 2026-08-23 now gives:

| Target comparison | Old reported error | Current error |
|---|---:|---:|
| Earth center (`399`) | 231,782 km | **1,550.30 km** |
| Saturn system barycenter (`6`) | 60,203,706 km | **69.85 km** |
| Saturn visible-center proxy (`699`) | — | **275.35 km** |

The remaining error is now a reduced-force-model limitation, not bad initialization. The gate
covers 1990–2050; it does not certify arbitrary epochs, relativistic/J2/minor-body fidelity, or an
exact Solar System Barycenter origin after `move_to_com()`. Serialized states should therefore be
described as **model-barycentric**, not as exact SSB ephemerides.

### Moon frame and phase follow-up (2026-09-24)

This follow-up closes the **frame-conversion mechanism** in `M-08`, and removes the four named
phase/plane exemptions in `M-18`, without claiming that every moon catalog row is now an
ephemeris-quality state:

- All non-ecliptic fallback records now retain their native Laplace/equatorial elements and basis.
  Inclination, node, and periapsis rates are applied in that native frame at the requested epoch;
  only the resulting Cartesian position and velocity are transformed to ecliptic J2000. This
  removes the invalid operation that converted once and then added a native node rate to an
  ecliptic node—the cause of Cordelia's old 117.7° plane error.
- Titan, Iapetus, Phoebe, and Cordelia use committed, provenance-bearing, parent-relative JPL
  Horizons fits over **JDTDB 2451545.0–2469807.5 (2000–2050)**. Titan/Iapetus/Phoebe record
  `SAT441L`; Cordelia records `URA184_MERGED`. The deterministic generator, source target/center,
  reference frame, time scale, units, source-row hashes, and held-out validation statistics ship
  with the artifact.
- The independent gate is now **20 moons × 7 epochs = 140 state comparisons**, with per-epoch
  position and orbit-plane limits, drift limits, and explicit velocity limits for all four fitted
  moons. The former approximately-two-orbit-radius position allowances and Cordelia's 180° plane
  allowance are gone.
- The four fitted bodies fail closed outside the fitted interval: their state is marked unavailable
  and hidden instead of silently resurrecting the known-bad phase from the mean-element table.
  Moons without a fitted ephemeris retain the corrected native-frame mean-element model, explicitly
  labelled approximate. JPL's descriptive tables are not relabelled as osculating states.

Therefore `M-08` is **RESOLVED** as a frame/rate-composition defect. `M-18` remains **PARTIAL** at
catalog scope: its four reported bodies are resolved inside the stated coverage and unavailable
outside it, while other moons still use explicitly approximate mean elements and retain their own
data-limited accuracy budgets. The measurements in the original report below remain historical
evidence of the pre-fix implementation.

### Implemented remediation in this pass

The N-body correction above was the prerequisite requested first. Two implementation passes then
closed ten selected defects by live scientific impact and resource risk, with negative TOF
validation and stricter Lambert convergence certification landed as additional hardening. The
rows below record both passes; adjacent issues remain open where explicitly stated.

| Finding | Commit | Current disposition and acceptance evidence |
|---|---|---|
| Browser secular mean-anomaly regression (`SF-1` / `F-07`) | `68aff6b`, `f1c79b9` | **RESOLVED.** Propagation now follows JPL's `M = L - varpi` relation and advances `Mdot = Ldot - varpidot`, avoiding double-counted apsidal motion. A committed 48-row Horizons position fixture covers 8 planets at 6 epochs. |
| Compute permits released while timed-out work continued (`M-10` / `B-PORK-03`) | `3f5d097` | **RESOLVED for the reported worker-lifetime defect.** Heavy jobs use owned bounded executors; the permit remains held until the actual future exits. Porkchop scans receive cooperative cancellation, with timeout/disconnect tests. |
| Float32 worker transport overwrote the Float64 model (`M-11`) | `b6c4ce3` | **RESOLVED.** A shared schema enforces Float64, AU, AU/day, heliocentric-ecliptic-J2000, record stride 6, and runtime payload validation. The main-thread re-coercion trap is removed. |
| 424 hidden moons consumed 97.7% of each worker payload and then froze (`M-12` / `F-20`) | `b6c4ce3` | **RESOLVED for the shipped scene.** Only 10 active rendered bodies are propagated and serialized; the current state contract is **490 bytes/tick** (480-byte float64 state plus a 10-byte availability mask). One-in-flight, sequence, and freshness guards protect application. |
| Realtime solar TTL cache served one requested epoch for another (`M-16` / `F-10` / `B-SOL-02`) | `e740b21` | **RESOLVED.** Snapshot identity now includes exact finite JD versus `latest`; a bounded 16-entry TTL/LRU cache and matching single-flight key prevent cross-epoch poisoning and unbounded growth. Seven dedicated tests cover isolation, reuse, refresh, eviction, and non-finite input. |
| Zero/negative porkchop TOF admitted all-failure memory work (`m-10` / `N-04` / `B-PORK-02`) | `3f5d097` | **RESOLVED.** Both TOF bounds are schema-constrained with `gt=0`; endpoint regressions cover zero and negative values. |
| Unbounded, non-cancellable REBOUND seeks/checkpoints (`R23` / `B-WS-02/06`) | `90f4134` | **RESOLVED.** Seeks are restricted to the validated 1990–2050 JDTDB range, long forward integration is segmented for cooperative cancellation, checkpoints use an eight-entry LRU, and endpoint admission remains held until the worker exits. |
| Unlimited WebSocket engines/threads (`R25`) | `90f4134` | **RESOLVED.** Browser origin and four-session admission checks happen before engine construction; slots are released only after actual runner termination. Authentication and safe bind defaults remain R11/F-11. |
| Incomplete PFSS cache identity/stampede (`R15`) | `a40005a` | **RESOLVED.** The normalized key covers every result-affecting request input, the cache is bounded LRU, and identical concurrent misses share one success/error computation. |
| Asteroid catalog integrity/provenance fail-open (`R45` / `B-AST-01/02/04`) | `84ddcd1` | **RESOLVED.** Valid metadata plus matching SHA-256 are mandatory; FNV cannot substitute, latency is telemetry, and persistent accessible status identifies verified/fallback/failure state. Independent expected-row, source-precision, and taxonomy work remains open. |
| Unpowered MGA `|v∞|` discontinuity and averaged turn bound (`R47` / `B-MGA-03/04`) | `3f3b787` | **RESOLVED.** Mismatched asymptotic speeds are rejected beyond documented absolute/relative tolerances and maximum turn is derived from incoming `v∞`. Route enumeration/accounting remains R48/B-MGA-01/02/05. |
| Lambert bracket exit could return an uncertified best point | `ea54bea` | **RESOLVED.** Illinois-weighted refinement now returns only a root within the requested TOF tolerance; exhausted and strict-convergence cases have dedicated regressions. |

Other previously landed fixes that remain credited include the asteroid transform order (`M-01`),
Lambert time-of-flight certification, IAS15 compatibility, benchmark-report overwrite opt-in
(`M-09`), deterministic fixed-epoch solar payloads, the shipped resize-loop impact (`M-05`), and
the independent 140-state Horizons moon gate described above. The benchmark oracle and complete
moon catalog remain **PARTIAL**, not resolved: honesty/quarantine is not reproducible truth
coverage, and unfitted moon states remain approximate (the fitted four are unavailable outside
their certified interval).

### What remains and how to fix it

The next work should be accepted by executable physical or lifecycle invariants, not by a green
mock-only test:

1. **Finish server and WebSocket hardening.** Add authentication, safe loopback/reload defaults,
   write authorization, and path redaction; close the remaining Sun-elements, paused-Kuiper, and
   requested-versus-delivered time-scale protocol defects.
2. **Make MGA route search/accounting honest.** Honor `max_assists`, diversify and count distinct
   body routes, expose generated/evaluated/pruned counts, and populate or remove the hardcoded
   `turnDeficitPenalty` field.
3. **Replace the benchmark oracle.** Delete unsupported “strict tool capture” rows or commit the
   exact GMAT/Orekit/Tudat inputs, versions, frames, epochs, revolution/branch convention, and raw
   outputs. Keep incompatible rows non-scoring until they are reproducible.
4. **Regenerate honest asteroid science data.** Add an independent expected-row and real/procedural
   fraction contract, retain source precision, and label inferred taxonomy as `Unknown` with
   provenance rather than measured composition.
5. **Finish solar upstream safety.** Cap all upstream bytes, replace the dead SWPC products with
   documented current feeds and schema fixtures, publish coverage/confidence, and return typed
   upstream failures rather than 500.
6. **Unify remaining scientific frames and dimensions.** Establish one explicit solar-axis frame,
   centralize differential-rotation laws, correct SMBH Schwarzschild radii and heliosphere-time
   units, and replace the single Helioviewer tile with a full-disk projection before calling it an
   observed solar surface.
7. **Establish a release gate.** Eliminate the remaining 280 TypeScript errors, chain typecheck,
   Vitest, pytest, scientific fixtures, and build in CI, then remove or quarantine the dead frontend
   architecture. A passing Vite transpile alone is not evidence of type correctness.

---

**Auditor:** Claude (Opus 5) · **Mode:** read-only · **Prompt:** `agent-notes/codebase_evaluation_prompt_major_issues.md`
**Method:** Phase 0 baseline run by me; four independent verification agents, each instructed to *refute* the fix it was assigned. Every number below was executed, not inferred, unless marked otherwise.

---

## 1. Scope, pin, and a material limitation

| Item | Value |
|---|---|
| **Pinned commit** | `44088f8447a454d343a08f2f69a824929e631afa` |
| **Pin taken** | 2026-08-24 **07:55:09Z** (tar snapshot of the working tree, dirty state included) |
| Branch | `main`, then 9 ahead of `origin/main`; **16 ahead / 69 behind** `origin/sun-focus` |
| Worktree at pin | DIRTY — `README.md`, `backend/sim/rebound_nbody.py` |
| Toolchain | Node v22.23.2, npm 10.9.8, Python 3.12.13, rebound 5.1.1, fastapi 0.141.1, starlette 1.6.0, httpx2 2.12.0 |
| Platform | WSL2 (Linux 6.18.33.2), no GPU passthrough |

### 1.1 ⚠️ The repository moved throughout this audit

- HEAD was `4ca5a67` at my first command, `44088f8` minutes later, and **`9dc8e48` (15 ahead) by the end** — six further commits landed while the agents ran.
- Uncommitted files also changed post-pin: `smbhPropagation.ts`, `agnShockwaveEngine.ts`, `rebound_nbody.py`, `solar_realtime_data.py`, `tudatpy_hooks.py`.
- **All findings are stated against the 07:55Z pin.** Where I detected drift I re-tested the live file and say so (§4.6).
- Six git worktrees registered under `/tmp/rechk-*` and `/tmp/rk-*` (pointing at `aa6e39a`, `cf34ff5`, `fd793f4`, `5e461f6`) are **not mine** — my agents were forbidden from creating worktrees. They appear to be from concurrent R1/R2 verification work. Flagging because a prior session left stray worktrees behind.

**For the next audit:** tag a commit and pause edits until it completes. A moving target makes any register partially stale on delivery.

### 1.2 What this run asked

The comprehensive evaluation (F-01..F-20) and the four-part major-issue set already exist and were **not** redone. Nine commits of remediation had landed since. So this run asked the question the prompt makes central: **does each claimed fix actually fix the defect, or suppress the symptom?** — plus a hunt for majors in the new code.

---

## 2. Executive verdict

**Six fixes are real and verified. Three "fixes" do not fix their defect. Two new High-severity defects were introduced. The one Critical from the prior register has not been touched across all 15 commits.**

The remediation effort is genuine and technically competent in places — the K-04 worker-import fix, the solar body-frame fix, the sim-time fix, and the CORS allowlist are all correct, and I verified each. But three of them are worth more attention than the count suggests:

1. **The moon-frame rewrite (3 commits, ~161 lines) did not fix the defect, and made Io and Callisto measurably worse** (dr/r 1.970→2.000, 1.864→1.999). Its most important component — a correct IAU pole table — is **dead code** because of a key-casing mismatch. `0 of 67` non-ecliptic moons pass a round-trip invariant that needs no external reference.
2. **The `ri_ias15` fix works, but only by coincidence.** The crash is genuinely gone and precision is *bit-identical* (I tried hard to prove a silent downgrade and failed — rebound 5.1.1's defaults happen to equal the intended values). But the guarded branch is permanently dead, so a future tolerance edit would silently do nothing, and the test that masked the original break is **100% intact** — proven by reverting the fix and observing an identical suite result.
3. **The server hardening protected the read-only endpoint and left the destructive one open.** `/solar/physics` gained auth hooks, a rate limit, a concurrency guard and a timeout. `POST /benchmark/accuracy/report` — which **overwrites the user's `my-notes/*.md`, where this audit's own reports live** — got none of them. A sentinel file was destroyed again in this run.

Two defects were newly introduced by the hardening: concurrent `/solar/realtime` callers now get **HTTP 500** where they previously succeeded (7 of 8 in a live test), and the timeout/semaphore design gives false assurance — `asyncio.wait_for` cannot cancel `asyncio.to_thread`, so **8 seconds of client time buys ~60 seconds of unkillable CPU**, and four rounds left the server unresponsive to `/health` for 45 s.

**Readiness**

| Use | Verdict | Driving issue |
|---|---|---|
| **Visual demonstration** | **Not ready** | M-01 — the advertised 15,000-asteroid belt renders inside the Sun; untouched in 15 commits |
| **Education** | **Not ready** | M-03 — README below "Highlights" still documents a product that does not ship |
| **Scientific analysis** | **Not ready** | M-08 (moon frames, 0/67 pass), M-02 (benchmark oracle fabricated, 0/3) |
| **Operational trajectory / mission design** | **Not ready** | M-02, plus Lambert still uncertified and `spice` provider → HTTP 500 |

---

## 3. Major-issue register

| ID | Sev | Status | Reach | File:line | Title |
|---|---|---|---|---|---|
| **M-01** | **Critical** | **UNFIXED** (never touched) | LIVE | `beltRenderer.ts:175-205` | 15,000 asteroids rendered inside the Sun |
| **M-08** | **Critical** | **NOT FIXED** by 3 commits | LIVE (latent) | `catalog.ts:116,249,102` | Moon frame conversion; 0/67 pass; Io/Callisto worse |
| **M-09** | High | **NOT FIXED** | BACKEND | `benchmark/accuracy.py:358-360` | Unauthenticated overwrite of `my-notes/**/*.md` |
| **M-10** | High | **NEW** | BACKEND | `server.py:947,1120,1172` | Uncancellable `to_thread`: 8 s client → 60 s CPU; server unresponsive |
| **M-02** | High | UNFIXED | BACKEND | `reference_scenarios.json` | Benchmark oracle unreproducible; 0/3, mean err 22.824 km/s |
| **M-11** | High | UNFIXED (K-39) | LIVE | `modelWorker.ts:44` | Float32 transport overwrites the float64 model; Pluto 163 km |
| **M-12** | High | CONFIRMED + worse | LIVE | `main.ts:752-759` | 97.7% of worker payload discarded; 424 moon states frozen all session |
| **M-13** | High | **NOT FIXED** | TEST | `test_seek_optimizations.py:37` | Mocking test still masks F-02; proven by revert experiment |
| **M-03** | High | PARTIAL | DOC | `README.md` | Highlights honest; remaining ~80% still false |
| **M-04** | High | UNFIXED | REPO | `package.json` | 1,300 tsc errors, no gate, no frontend tests, no CI |
| **M-14** | Med-High | **NEW regression** | BACKEND | `solar_realtime_data.py:124` | Concurrent `/solar/realtime` → HTTP 500 (7 of 8) |
| **M-15** | Medium | **NEW** | BACKEND | `server.py:296,326` | Rate limiter bypassable via `X-Forwarded-For`; unbounded memory |
| **M-16** | Medium | UNFIXED (K-51) | BACKEND | `solar_realtime_data.py:118` | Cache ignores `jd` → wrong-epoch physics served |
| **M-17** | Medium | UNFIXED (K-51) | BACKEND | `/solar/realtime` | `force_refresh` ~2700× amplification, 2.9 MB SILSO per call |
| **M-05** | Medium | UNFIXED | LIVE | `main.ts:876-886` | Per-frame resize: device-px vs CSS-px guard never true on DPR>1 |
| **M-06** | Medium | UNFIXED | LIVE | `smbhPhysicsConstants.ts:62,152` | Schwarzschild radii 100× too small |
| **M-07** | Medium | UNFIXED | DATA | (no `LICENSE`) | No repo license; 1 of 9 shipped textures unresolved |
| **M-18** | Medium | **NEW** | DATA | `moons.json` | Separate ω/M convention defect for Titan/Iapetus/Phoebe/Cordelia |

**Verified as genuinely FIXED:** K-04 (worker handler no longer in main chunk, 1→0), K-08 (solar features now in body frame), K-09 (solar visuals on sim time), K-13 (H29 warp channel dispatch), K-14a/b (rigidity + gyroradius units — verified numerically post-pin), CORS (localhost allowlist, credentialed wildcard gone), F-02 crash (WS connects and integrates correctly), K-12 for identical cache keys (20 concurrent → 1 shared object).

---

## 4. Detail

### M-01 (Critical) — the asteroid belt is still rendered inside the Sun

`beltRenderer.ts` was **not touched by any of the 15 commits** (`git log aa6e39a..HEAD -- <file>` is empty).

The shipped `projectVertex` chunk — which drives `gl_Position`, i.e. real on-screen geometry, not a lighting artifact:

```glsl
vec4 mvPositionWithOrbit = vec4( transformed, 1.0 );
mvPositionWithOrbit.xyz += vOrbitOffset;          // orbital position added FIRST
#ifdef USE_INSTANCING
  mvPositionWithOrbit = instanceMatrix * mvPositionWithOrbit;   // THEN scaled
#endif
gl_Position = projectionMatrix * modelViewMatrix * mvPositionWithOrbit;
```

`instanceMatrix` is built at `:410`, `:431`, `:508` as `compose(_pos, _quat, _scale)` with **`_pos.set(0,0,0)`** and `_scale = diameterRenderScale` (~1e-3 AU). A rotation preserves length, so rendered radius = `scale × orbital radius`:

```
orbit r=2.500 AU  x instScale=7.67e-3  ->  rendered r=0.019175 AU
orbit r=3.700 AU  x instScale=7.67e-3  ->  rendered r=0.028379 AU
Sun display radius = 0.3755 AU  =>  belt sits 13.2x inside the Sun's sphere
```

`mesh.frustumCulled = false` (`:368`, `:485`) hides the symptom — re-enabling culling would cull the entire belt.

**The contrast that proves the diagnosis:** the Kuiper path at `:532` uses `_pos.set(positions[off], ...)` — a real per-instance translation — and renders correctly. Only the GPU asteroid path routes position through the scaled offset.

- **Repro:** `node $SP/out/ME/belt_probe.mjs`
- **Fix:** apply `instanceMatrix` to `transformed` *before* adding `vOrbitOffset`, in both `worldPosition` and `projectVertex`.
- **Acceptance:** with culling re-enabled, bounding sphere ≥ 1.7 AU and ≥1 asteroid renders beyond 2 AU.
- **Refuted:** compensating translation elsewhere (none — `_pos` zero at all three sites); confined to the lighting chunk (no — `projectVertex` too); `uOrbitScaleAu` rescues it (no — applied before the instance matrix).

### M-08 (Critical) — the moon-frame rewrite did not fix the defect

Verified by executing pinned `catalog.ts`+`orbitMath.ts` against JPL Horizons (`CENTER=@<parent>`, `REF_PLANE=ECLIPTIC`, `TIME_TYPE=TDB`, 20/20 bodies HTTP 200). **Control:** Earth's Moon takes the `ecliptic` short-circuit and reproduces the prior audit to the digit (`4,432 km / 0.011 / 0.53° / 0.13°`), so the harness is sound.

| moon | prior dr/r | **now** | prior sep° | **now** |
|---|---|---|---|---|
| Io | 1.970 | **2.000** | 159.95 | **177.13** |
| Callisto | 1.864 | **1.999** | 137.40 | **176.42** |

`dr/r ≈ 2.0` means the moon is placed on the opposite side of its planet.

**K-05 not fixed.** Taking the propagator's angular momentum *empirically* as `r × v` over 48 (i, Ω) pairs: `max angle(Rz(180°)·propagator_h, catalog_normal) = 8.538e-7 deg`. The comment at `:121` asserts the opposite of what the code does.

**New compounding defect:** `sourcePeriapsisDirection` (`:249`) uses the *correct* convention while `orbitNormalFromElements` uses the flipped one, so the normal and periapsis fed to the same rotation **are not orthogonal** — `n·p == sin(2i)·sin(argp)` exactly (Iapetus: 104.6° apart). Together they describe no physical orbit.

**K-06 not fixed.** Plumbing changed (`:526` now passes `frameNormalized.argPeriapsisDeg`), value did not. Analytic `i_src=0` cases, where periapsis must land at `R·(cos ω, sin ω, 0)`: Io **175.878°** off, Charon **134.643°** off (expected 0.000).

**K-07 — the fix is correct and DEAD.** `:102-105` adds an IAU pole override accurate to 8.5e-7°, keyed `"Uranus"`/`"Pluto"` but looked up with `'uranus'`/`'pluto'`: `OVERRIDE['pluto'] → null`. Fingerprints confirm the fallback runs (Charon's converted `i = 122.530` = Pluto's `axialTiltDeg`; `Ω = 270.000` = longitude-0 fallback). The fallback `(90 − axialTiltDeg, spinAxisLongitudeDeg)` is not the IAU pole — Pluto off **111.29°**, Earth 32.67°, Uranus 15.49° with the **latitude sign inverted**. `spinAxisLongitudeDeg` exists for Saturn and Uranus only.

Ariel/Titania look almost right only because two bugs cancel: `angle(Rz(180)·parentPole, true pole)` = 0.048° for Uranus but **38.729°** for Pluto.

**Strongest evidence — a round-trip invariant needing no external reference.** Propagate source elements and rotate the state vector by the converter's own `R`, vs. propagating the converted elements; a correct converter gives 0:

```
all 67 non-ecliptic moons:
  position residual: {<1°: 0, 1-10°: 0, 10-90°: 10, >90°: 57}
  plane    residual: {<1°: 0, 1-10°: 9, 10-90°: 33, >90°: 25}
  moons passing (<1 deg): NONE
```

A reference converter on the same data/propagator/frame scores **0.1° instead of 177°** — the defect is the converter, not the data or harness.

- **Regression:** 357 ecliptic moons unaltered; 0 non-finite elements across 434 bodies.
- **Reachability:** `showMoons = false`, so not user-visible; flipping one boolean surfaces 67 wrong moons.
- **Eight refutation attempts documented, all failed** — including one the agent turned against its own sub-claim (the `poleTiltDeg` branch is unreachable but *correct*, so its deadness is not a defect).

### M-09 (High) — the destructive endpoint is still open

`benchmark/accuracy.py:358-360` is unchanged — no existence check — and `server.py:1193-1208` has no auth, no rate limit, no concurrency guard. The hardening commit **did not touch this file**.

```
md5 my-notes/SENTINEL.md  -> 6bfc89a0…  ("SENTINEL-DO-NOT-DESTROY-12345")
POST /benchmark/accuracy/report {"output_path":"SENTINEL.md"}  -> 200
md5 my-notes/SENTINEL.md  -> af1a67ee…  (file destroyed)
{"output_path":"a/b/c/d/e/f/g/pwn.md"} -> 200, 7 directories created
6 requests in a row -> 200 200 200 200 200 200   (no throttle)
```

**Containment holds and is real:** `../README.md`, `/etc/passwd`, `my-notes/../README.md`, and symlink escapes all → **400**. Browser CSRF is now genuinely blocked by the new CORS allowlist. But any local process or LAN host can still silently destroy `my-notes/*.md` — **where this repo's own audit reports live**.

> The asymmetry is the story: the read-only physics endpoint received auth hooks, a rate limit, a concurrency guard and a timeout; the endpoint that deletes the user's notes received nothing.

### M-10 (High, NEW) — timeouts and semaphores give false assurance

`asyncio.wait_for` cannot cancel `asyncio.to_thread`, and every guarded endpoint releases its semaphore in `finally` *at timeout* — so the guard counts **waiters, not workers**. Measured on `/trajectory/porkchop` at 19,900 grid points (just under the new cap):

```
2 requests -> both 503 "timed out" at t=8.16s
CPU ticks: 8323 -> 9160 (at response) -> 13834 (+45s) -> 13988 (+90s)
```

~60 s of unkillable CPU bought with 8 s of client time. Four rounds (~32 s of client effort) left the server unresponsive:

```
t+15s  /health http=000 t=20.0  (timeout)
t+30s  /health http=000 t=20.0  (timeout)
t+45s  /health http=200 t=0.006  <- orphans finished
```

Applies to `/trajectory/porkchop`, `/mission/plan`, `/solar/physics`, `/solar/realtime/aia-tile`. This is precisely what the 8 s budget was introduced to prevent.

### M-11 / M-12 (High) — the worker boundary

**M-11 (K-39 unfixed).** `modelWorker.ts:44` allocates `Float32Array`; `main.ts:794-795` writes those values **back over** the authoritative float64 state.

| body | r (AU) | transport err | 1 ULP |
|---|---|---|---|
| earth | 0.990 | 1.1 km | 16.1 km |
| **pluto** | **34.709** | **163.1 km** | **545.7 km** |

Over a full Pluto orbit the max coordinate reaches 45.3 AU → **1 ULP = 808.2 km** (float64: 1.3 mm). Second-order catastrophic cancellation when differencing two Float32 heliocentric positions for a parent-relative one: `moon-pluto-charon` separation 19,600 km carries **143.8 km = 0.734% error**. Fix costs 12,152 extra bytes/tick on an already zero-copy transferred buffer.

**Booby trap (W-6):** the obvious fix is silently defeated. `main.ts:643-647` coerces with `new Float32Array(...)`, which converts **element-wise, preserving length** — so switching the worker to `Float64Array` produces no error, no dropped frame, and re-quantizes anyway (34.70912345678901 → 34.70912170410156, **262 km**).

**M-12 (F-20 confirmed and worse).** `main.ts:752-759` drops any record whose body has no scene node; `showMoons = false` means 424 of 434 never get one.

```
records reaching write-back: 10 of 434
dropped: 424 = 97.70% of the 12,152-byte payload
propagation: 434 bodies 0.212 ms/tick vs 10 bodies 0.004 ms -> 98.0% wasted
```

**New sub-finding:** because moon records are dropped *before* write-back and `main.ts:828` early-returns on a successful snapshot (skipping `updateModelLocally()`), the **424 moon states in the main-thread model stay frozen at the single startup `model.update()` for the entire session.**

### M-13 (High) — the masking test is intact, proven by experiment

`_FakeIAS15` still lives at `test_seek_optimizations.py:37`. The fix was reverted to the original broken code in a scratch copy and the suite rerun:

```
suite on REVERTED (known-broken) backend: 6 failed, 47 passed
suite on pinned  (fixed)   backend:       6 failed, 47 passed   <- IDENTICAL
```

No test opens a real `/ws/sim`; none constructs a real `rebound.Simulation`. **The suite cannot detect a re-regression of this exact defect, and gave false green over it once already.** `test_server_validation.py:131-150` shows the same pattern — it monkeypatches away the file write, hiding the very `mkdir` behaviour M-09 exploits.

### M-14 (Medium-High, NEW regression) — concurrent realtime callers now get 500

`solar_realtime_data.py:124` sets `wait_timeout_s = timeout_s + 0.5` = **4.3 s**, but the leader performs **13 sequential** upstream fetches at 3.8 s each (~49 s worst case), so non-leaders can essentially never win. `server.py:802-809` has no exception handling. Live, 8 concurrent `GET /solar/realtime`:

```
req5 http=200 t=6.97
req1..4,6..8 http=500 t~4.40   body: "Internal Server Error"
```

**Before this commit all 8 would have succeeded.** The frontend polls this endpoint.

### M-02, M-03, M-04, M-05, M-06, M-07

- **M-02** — `GET /benchmark/accuracy`: `passCount 0/3`, `meanAbsErrorKmS 22.8244654884187`, `referenceIntegrityOk true`, all three "tool captures" still sharing `capturedUtc 2026-02-15T10:27:25Z`. Checksums pass while the science fails. The prior pass established with pykep that the **model** is right and the references are fabricated; `calibrationTier: "strict"` is unsupported (gmat/orekit/tudat are not installed, yet `requiredToolsPresent: true`).
- **M-03** — Highlights were rewritten honestly; everything below is unchanged. Verified against bundle + DOM: `Oort`=0, `2MASS`=0, `TLE`=0, `GIBS`=0, `Alpha Centauri`=0, `WebSocket`=0, `ws/sim`=0, `stars_catalog`=0, `plannerController`=0; no search box, no engine dropdown, no Connect button; 0 images emitted from `src/assets`; "13 pytest modules" vs 12 actual; 4 dead `/home/nomad/Documents/...` links; and **"Strict type checking is now active on every source file"** against 1,300 errors.
- **M-04** — `typecheck` exit 2 with **exactly 1,300** errors (unchanged); `build` exit 0 (Vite never type-checks); `npm test` → *Missing script*; no `.github`, no `pyproject.toml`, no `CONTRIBUTING.md`; backend suite passes only because `httpx2` is installed out-of-band — still absent from `requirements.txt`.
- **M-05** — `main.ts:876-886` compares `dom.canvas.width` (device px) to `clientWidth` (CSS px), so on DPR>1 the guard is never false → `setSize` + `updateProjectionMatrix` every frame forever; `setPixelRatio` runs unconditionally outside the guard.
- **M-06** — `rSchwarzschildCm: 1.24e10` vs true `1.2271e12` (**99.0×**), `1.9e13` vs `1.9202e15` (**101.1×**). Self-evidencing: the comments state the correct AU values (`0.083 AU`, `127 AU`) that the literals contradict — metres wearing a `Cm` suffix.
- **M-07** — no `LICENSE`, no `license` field. `moon_texture_attribution.json` is genuinely good work (per-asset provider, SHA-256, license, URL), but `moon_mars_deimos_solarviews_1440.jpg` carries `"license": "Unspecified by provider; verify for redistribution"` **and ships in `dist/`**. `src/assets/textures` (39 MB, ~84% of the pack) has no manifest and emits 0 files.

### 4.6 Drift: fixes that landed after the pin

`smbhPropagation.ts` changed post-pin. Re-tested the **live** file:

```
gyroRadius(1e18 eV, Z=1, 5 uG) = 216.19 pc     truth E/(ZeB) = 216.19 pc   ratio 1.000
```

K-14a (rigidity) and K-14b (gyroradius) are **correctly fixed** in the live tree. K-14c (Schwarzschild, M-06) is **not** — `smbhPhysicsConstants.ts` is clean at HEAD.

Six further commits landed during the run (`3a3f84a` realtime cache handoff, `56930fb` solar timing separation, `555cb56` **backend state-vector contract normalization** — the F-19/K-51 units work, `63320e8` H29 dispatch, `bb63988` superluminal scaling, `9dc8e48` docs). **None touched `beltRenderer.ts`.** M-14/M-16/M-17 target `solar_realtime_data.py`, which changed by 68 lines post-pin — those three should be re-verified at HEAD.

---

## 5. Medium and Low

| ID | File:line | Issue | Fix |
|---|---|---|---|
| m-01 | `main.ts:653-654` | `tickJd`/`profilerMs` transported for staleness checking, stored, never read; `latestModelWorkerState` never cleared → latent silent freeze (200 ms lag = 24 sim days at max warp; Mercury 63° of arc) | Compare `tickJd` to `simState.julianDate`; fall back past a threshold |
| m-02 | `main.ts:1053-1059` | **Refutes prior fact:** ticks dispatched once per rAF (~60 Hz), not "~5 Hz, one in flight". No in-flight counter, no throttle, unbounded FIFO inbox | Add an in-flight guard |
| m-03 | `main.ts:638-646` | **Refutes prior fact:** monotonic sequence guard is worker-side only; main checks finite/non-negative then overwrites | Track last applied sequence |
| m-04 | `modelWorkerContract.ts` | No `units`/`frame`/`schema_version`/epoch/origin (F-19); `RECORD_SIZE = 7` still duplicated in `main.ts:134` and `modelWorker.ts:18` | Move both constants into the contract |
| m-05 | `modelWorker.ts:64` | 2 **new** TS2304 errors — `tsconfig` `lib` omits `"WebWorker"` | Add the lib or a local declaration |
| m-06 | `server.py:296,326` | Rate limiter trusts `X-Forwarded-For` (45 rotating → 0×429) and never evicts (5000 identities → 4.1 MB retained) | Trusted-proxy config + TTL sweep |
| m-07 | `solar_realtime_data.py:118` | TTL cache ignores `jd` → distinct-jd requests stampede *and* later callers get the wrong epoch (`request_date_utc 2023-02-25` for a 1858 request) | Key the cache by `jd` |
| m-08 | `/solar/realtime` | `force_refresh` unguarded: 3.47–5.27 s vs 0.0013 s cached (~2700×), re-downloads 2.9 MB SILSO each time, no byte cap | Rate-limit + cap |
| m-09 | `solar_physics.py:510,515` | Zero-confidence observations still blended (`confidence 0.0`, `applied true`, weight 0.25) → `activity_index` moved −12% | Gate on confidence |
| m-10 | `server.py:633` | `tof_min_days` has no `gt`; `-500/-100` → 200 with an all-failure grid | Add constraint |
| m-11 | `ephemeris_service.py:133` | `ephemeris_provider:"spice"` — advertised by `/trajectory/capabilities` — → **500** on lambert, porkchop **and** `/mission/plan` | Handle/validate |
| m-12 | `/solar/physics` | Unknown query params silently ignored (`?julian_date=` → wall-clock epoch, 200, no warning) | Reject unknown params |
| m-13 | `satelliteSystem.ts:209-231` | **Dormant footgun:** TLE stride correct for 3-line blocks, but skips every 2nd satellite for 2-line CelesTrak format; returns 0 for a single set | Fix stride |
| m-14 | `localPlanner.ts:45-47` | **Dormant footgun:** straight-line chord velocity returned as both departure and arrival velocity | Use the transfer orbit |
| m-15 | `moons.json` | **New:** Titan/Iapetus/Phoebe/Cordelia have correct planes but wrong phase through a *correct* converter → separate ω/M convention defect in the data | Re-derive those rows |
| m-16 | `temp_nearbySystemsRenderer.ts` | Byte-identical duplicate confirmed (`md5(tail -n +620)` == `md5(nearbySystemsRenderer.ts)` == `cb571176…`) | Delete |

**Low (counts):** `beltRenderer` fp32 JD uniform → 0.25 d ULP = ~407,000 km along-track quantization; H29 `1e12` displacement writes into every body's `worldPosition` on both paths but is a numeric no-op (max 4.3 m) — a labelling issue, not corruption; `moons.json` contains **Puck twice**; 6 worker contract fields written-never-read or read-never-written; belt record index slot 100% redundant (1,736 B/tick); `except Exception: pass` in the ias15 guard (unreachable today); NUL byte in `output_path` → 500; absolute filesystem paths in `reportPath`, `catalog_path`, and AIA error strings; 5 duplicate Kepler solver copies.

---

## 6. Coverage matrix

Rows = layers, columns = failure classes (§6.0). `M-xx`/`m-xx` = finding; `✓` = probed and cleared; `–` = not applicable; `?` = **not inspected**.

| Layer | A wrong results | B contracts | C lifecycle | D input/failure | E gates | F claims | G data | H resources | I exposure | J dormant | K speculative |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Frontend runtime core | M-05 | m-04 | ? | ? (no browser) | M-04 | M-03 | – | M-05 | – | – | – |
| Orbital model & catalog | **M-08** | ✓ | – | ✓ | M-04 | – | m-15, Puck | M-12 | – | – | – |
| Solar subsystem | ✓ K-08/K-09 fixed | – | m-07 | m-12 | ✓ | M-03 | – | ✓ | m-08 | – | – |
| SMBH / superluminal | M-06 (K-14a/b ✓) | – | – | – | – | M-03 | – | ✓ | – | – | H29 no-op (Low) |
| Asteroid / Kuiper | **M-01**, fp32 JD | – | – | ? checksum/truncation | – | M-03 | ✓ attribution | ✓ | – | – | – |
| Worker boundary | M-11 | m-02, m-03, m-04 | m-01 | ✓ executed | m-05 | – | – | M-12 | – | – | – |
| Backend server & engines | ✓ F-02 bit-identical | ✓ (contract landed post-pin) | M-10, m-06 | M-14, m-11 | M-13 | ✓ /health now honest | – | M-10 | M-09, m-06 | – | – |
| Backend trajectory/mission/benchmark | **M-02** | – | M-10 | m-10, m-11 | M-13 | M-03 | M-02 | M-10 | M-09 | – | – |
| Build / test / tooling | – | – | – | – | **M-04** | M-03 | – | – | – | – | – |
| Docs & claims | – | – | – | – | – | **M-03** | M-07 | – | – | – | – |
| Dormant stack (32 files) | m-14 | – | ? `simulationClient` | – | – | – | – | – | – | m-13, m-14, m-16 | – |

**Where a major could still hide.** The three `?` cells I would look at first: (1) **frontend failure modes** — WebGL absent, backend offline, corrupted/truncated asteroid binaries, slow network, stale `force-cache` — all need a browser and were not run this session; (2) **asteroid data-integrity paths** (checksum mismatch, truncated `.bin`, missing meta), read but not executed; (3) **`simulationClient` lifecycle** on reconnect, which matters the moment the WebSocket is wired up — and M-01's neighbourhood suggests the belt/data pipeline deserves the same executed treatment the worker boundary just received.

---

## 7. Baseline

| # | Command | Result |
|---|---|---|
| V1 | `git rev-parse HEAD` | `44088f8` (pinned; moved to `9dc8e48` during the run) |
| V2 | `npm ci` | PASS |
| V3 | `npm run typecheck` | **FAIL exit 2 — 1,300 errors** (no drift) |
| V4 | `vite build` | PASS, 848.33 kB, 8.26 s, 0 images from `src/assets` |
| V5 | `npm test` | **absent** |
| V6 | `pytest -q` | **53 passed** (was 48) |
| V7 | `npm audit` | 6 vulns (1 low, 5 high), dev toolchain only |
| V8 | `GET /benchmark/accuracy` | **0/3**, mean abs err 22.824 km/s |
| V9 | rebound probe | 5.1.1, `hasattr(sim,'ri_ias15')` → **False**; defaults `epsilon=1e-9, min_dt=0` |
| V10 | reachability BFS | **33 / 63 reachable; 32 unreachable (51%)** |

Repo: `.git` 57 MB, `src/assets` 39 MB, `public/data` 3.5 MB.

*(My first reachability script under-counted at 31/63 because a >400-char multi-line import in `sunController.ts:22` truncated the regex lookahead; corrected to match on `from '...'` directly. Reported because the first number appeared in intermediate work.)*

---

## 8. Strengths (evidence-backed)

- **The remediation is real where it is real.** K-04 is fixed by *two* independent mechanisms (type-only import chain + a `WorkerGlobalScope` runtime guard), verified at the byte level. K-08 correctly moves solar features into the body frame. K-09 correctly switches solar visuals to simulation time. K-13's channel-key fix is right. K-14a/b are numerically exact (216.19 pc vs 216.19 pc).
- **`modelWorkerContract.ts` and `catalog.ts` are now fully type-clean** (0 errors each) — the only two such files among those touched.
- **CORS containment is properly done**: localhost allowlist, and `_load_env_csv` actively refuses `"*"` in the env override.
- **Path containment on the report endpoint is genuinely robust** — traversal, absolute paths, and symlink escapes all correctly rejected (the remaining issue is the missing existence check, not the path logic).
- **The moon-texture attribution file is exemplary provenance work** — per-asset provider, dataset, product page, credit, license, SHA-256, and download URL. It is the model the 39 MB `src/assets` tree should follow.
- **The IAU pole table added for K-07 is correct to 8.5e-7°** — it only needs its keys lowercased to become a real fix.
- **The N-body engine itself is exonerated**: IAS15 conserves energy to 3.7e-15 over 100 yr, and re-seeding from Horizons state vectors drops Saturn's error 60.2 → 0.124 Mkm. The integrator was never the problem.

---

## 9. Roadmap

**P0 — this week**

1. **M-01** fix the belt transform order; acceptance: culling re-enabled, bounding sphere ≥ 1.7 AU, ≥1 asteroid beyond 2 AU. *(One-line shader change; highest user-visible payoff in the repo.)*
2. **M-09** add an existence check + `--allow-overwrite` opt-in to the report writer; acceptance: a second POST to an existing path → 409, sentinel md5 unchanged.
3. **M-08** three edits: lowercase the override keys, align `orbitNormalFromElements` with the propagator convention, re-reference ω. Acceptance: the round-trip invariant passes <1° for ≥60 of 67 moons — **this test needs no network and should be the regression gate.**
4. **M-14** raise `wait_timeout_s` above the leader's worst case, or return the stale cache instead of raising; acceptance: 8 concurrent `/solar/realtime` → 8×200.
5. **M-13** delete `_FakeIAS15`; add one `websocket_connect` smoke test asserting the first frame is `connected`. Acceptance: reverting the `ri_ias15` fix turns the suite red.

**P1 — this month**

6. **M-10** move CPU work to a process pool with real cancellation, or bound the grid so worst-case work fits the budget; acceptance: `/health` stays <100 ms during four rounds of max-size porkchop.
7. **M-04** chain `typecheck` into `build`, add a frontend runner and CI. Acceptance: CI red on a new type error. Add `httpx` to `requirements.txt`.
8. **M-11** switch transport to Float64 **and** fix the `main.ts:643-647` coercion in the same commit (see the W-6 booby trap); acceptance: Pluto round-trip error <1 m.
9. **M-12** propagate and transport only bodies with scene nodes; acceptance: payload ≤ 400 B/tick.
10. **M-03** rewrite the README body to match the shipped product; **M-02** either regenerate the benchmark references with real tool runs or relabel the tier.

**P2 — later:** M-05, M-06 (one-line ×100), M-07 (add LICENSE; resolve or drop the Deimos texture), m-01..m-16, delete the dormant duplicate.

---

## 10. Branch recommendation

The divergence is now the biggest *process* risk:

- `main` is **16 ahead / 69 behind** `origin/sun-focus`; 116 files differ (+14,276 / −8,877).
- `fix/r1-kuiper-velocity-units` (`cf34ff5`) and `fix/r2-secular-rate-mean-anomaly` (`5e461f6`) are branched from **`sun-focus`**, are **70 commits ahead of main**, and **neither is merged**.
- The 15 new fixes (moon frame, SMBH units, server hardening, worker contract, state-vector contract) landed on **main only**.
- `main` has **zero** secular-rate code (`grep -c secular src/sim/orbitMath.ts` → 0), so F-07 is unfixed there; that work exists only on the sun-focus line.

**Both lines are receiving fixes that the other does not have, and the gap is widening daily.** Decide the canonical branch before continuing remediation — every further day of parallel work increases merge cost and the chance a verified fix is lost. Given that the new work is on `main` and `sun-focus` carries three known regressions (R1/R2/R3) plus 344 tsc errors, the cheaper direction is likely to port `sun-focus`'s genuinely valuable pieces (vitest suite, secular rates, PFSS) onto `main` rather than the reverse — but that is a judgement call that needs the R1/R2 fixes validated first.

---

## 11. Scorecard

Scored against evidence obtained; **coverage** states how much of the dimension was actually exercised this run.

| Dimension | Weight | Score | Coverage | Basis |
|---|---|---|---|---|
| Functional / runtime correctness | 15 | **4** | Medium | M-01 Critical unfixed; M-05; frontend runtime not browser-tested |
| Scientific / numerical validity | 25 | **5** | High | M-08 0/67 moons; M-02 0/3 benchmark; offset by verified-correct IAS15 and K-14a/b |
| Testing / reproducibility | 15 | **3** | High | M-04 no gate/CI/frontend tests; M-13 masking test proven intact; new tests narrow, dedupe untested |
| Architecture / maintainability | 10 | **4** | High | 51% dead code; K-04 fixed well; contract module type-clean but omits its own key constants |
| Performance / scalability | 10 | **3** | Medium | M-10 unkillable CPU; M-12 97.7% waste; M-05 per-frame resize; no GPU/browser numbers |
| Security / operations | 10 | **4** | High | CORS fixed; M-09 destructive endpoint open; M-10, m-06 |
| Data provenance / licensing | 10 | **5** | High | No LICENSE; unresolved Deimos texture; exemplary moon attribution; M-02 fabricated references |
| Documentation / accessibility | 5 | **2** | Medium | M-03; a11y not tested this run |

**Weighted total ≈ 40 / 100** (up from 36, reflecting real fixes) · **overall confidence: Medium-High** — backend, worker, moon-frame and build/test dimensions were exercised by execution; frontend runtime, accessibility and GPU performance were not.

---

## 12. Not inspected / blocked

- **Browser runtime probe — not run.** No headless browser this session: FPS percentiles, memory growth, WebGL-absent behaviour, a11y, mobile layout, and the asteroid failure-mode tests (checksum mismatch, truncated `.bin`, missing meta, slow network, stale `force-cache`) are **not run**. The prior audit's SwiftShader numbers remain the best available.
- **GPU timings — blocked** (WSL2, no passthrough).
- **TudatPy — not run** (conda-only, not installed). Its state-vector contract work landed post-pin and is unverified.
- **`origin/sun-focus` — not audited** on its own terms; only its relationship to `main` was measured.
- **Post-pin drift** — `solar_realtime_data.py` changed 68 lines after the pin; M-14/M-16/M-17 should be re-verified at HEAD.
- Six `/tmp/rechk-*` and `/tmp/rk-*` worktrees are registered against this repo and are not mine.

## 13. Appendices

- **A** — logs: `$SP/logs/{baseline_env,typecheck,build,uvicorn8054}.log`
- **B** — my probes: `$SP/out/ME/{reach.mjs,reach.txt,belt_probe.mjs,k14.cjs,bench.json}`
- **C** — agent artifacts: `$SP/out/F02/` (ws probes, `numeric.py`, revert experiment), `$SP/out/F05/` (Horizons raw ×20, `test_k05/k07/roundtrip/final/blast.cjs`), `$SP/out/SRV/` (`sf_test.py`, throwaway repo), `$SP/out/WORKER/` (`harness.mjs`, `fidelity*.mjs`, `mainside.mjs`)
- Pin manifest: `$SP/pinned/AUDIT_PIN.txt`

`$SP` = `/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/61f0923f-ccb6-49cc-ba58-5791c93163f9/scratchpad`
