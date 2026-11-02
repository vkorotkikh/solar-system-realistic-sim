# Comprehensive Read-Only Evaluation — `solar-system-realistic-sim`

| | |
|---|---|
| **Commit audited** | `941865211f20d9535f6ffeec3a0321395fbfb344` — "fix(a11y): fully disable reduced motion" |
| **Branch / state** | `main`, 10 commits ahead of `origin/main`, clean working tree |
| **Delta since last audit** | 27 commits after `ec7ad33` (audited 2026-09-07), incl. a full UI redesign and 8 targeted fixes |
| **Audit date** | 2026-09-24 (truth data retrieved from JPL Horizons at 2026-09-24T22:20:00Z) |
| **Method** | Read-only. Everything ran in a disposable detached `git worktree` under the session scratchpad. No tracked repository file was modified. |
| **Evidence** | Raw logs, JSON results and every harness script: [`CODEBASE_AUDIT_2026-09-24_EVIDENCE/`](CODEBASE_AUDIT_2026-09-24_EVIDENCE/) |

---

## 0. How to read this report

**Labels.** **OBSERVED** = I ran it and quote the output. **INFERRED** = reasoned from code or data, with the
confidence stated. **REFUTED** = a hypothesis the evidence does not support. **NOT RUN / BLOCKED** are listed
separately in §13 and never folded into a pass.

**Independent oracles used.** Live **JPL Horizons** vectors (geometric, TDB, ecliptic J2000/ICRF) for 9 planets ×
8 epochs, 11 SSB states × 7 epochs and 26 moons × 6 epochs; my own **independent Standish** and
**universal-variable Kepler** implementations; **lamberthub 1.0.0** (Izzo 2015 and Gooding 1990 Lambert solvers,
isolated venv); JPL's published satellite-element definitions; the analytic **PFSS dipole/quadrupole** solutions;
**pip-audit 2.10.1**, **pip-licenses**, **axe-core 4.10.2**; primary release registries (GitHub tudatpy tags,
Maven Central, SourceForge) for tool-version provenance.

**Real GPU this time.** Browser performance was measured on an **NVIDIA GeForce RTX 5090** through headed Chromium
(`ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 5090), OpenGL 4.6)`, Mesa d3d12 under WSLg). This is real
hardware reached through a GL→D3D12 translation layer, not a native driver. Every run was gated on the renderer
string: one earlier run silently fell back to Mesa **llvmpipe** and was discarded (§13).

**Relationship to prior reports.** This audit re-measures everything at HEAD rather than carrying numbers
forward. §1.3 lists what changed since 2026-09-07, and **§1.4 lists eight claims in my own 2026-09-07 report that
turned out to be wrong** and are corrected here.

---

## 1. Executive verdict

### 1.1 What the product actually is at HEAD

A single-page, Sun-focused Three.js application, redesigned as **"Sun Model Lab · Solar Observatory"**
(`index.html` → `src/main.ts`, 1,454 lines). It renders the Sun, 8 planets + Pluto, 50,000 JPL-catalogued
asteroids and 5,000 synthetic Kuiper-belt objects (55,010 bodies), all propagated **in the browser** with
two-body Kepler elements plus linear secular rates. The 424-moon catalog is built, but **moons are not rendered,
listed or propagated**: `const showMoons = false` (`main.ts:143`), and no UI control enables them. It adds an explicitly labelled speculative AGN/SMBH
"experiment zone".

The production bundle references **exactly two backend routes**, `/solar/physics` and `/solar/realtime/aia-tile`.
In practice **neither delivers anything to the UI**: in the documented dev configuration the browser received
**0 successful `/solar/physics` responses out of 39** (11× HTTP 503, 28× client-side aborts). Because AIA
textures are fetched only after a successful physics update, they are never requested at all. The Sun the user
sees is therefore **100% frontend-procedural**, and nothing on screen says so.

The FastAPI backend (1,889-line `server.py`) — REBOUND N-body, Lambert/MGA, mission planner, benchmark — is
well tested in isolation (176 tests) but **is not reachable from the shipped UI**. There is no WebSocket client
in the bundle.

### 1.2 Readiness by audience

| Use case | Verdict | Rationale |
|---|---|---|
| **Visual demonstration** | ✅ **Ready, with caveats** | **59.9 FPS, frame p99 16.8 ms** on real hardware, 0 page errors, no GPU-resource leak, axe-core **0 violations**, honest catalog-provenance label. Caveats: no LICENSE (§10); moons not shown although README advertises 424; backend solar data silently absent; asteroid belt steps in 0.25-day jumps under time warp. |
| **Education** | ⚠️ **Conditional — planets yes; no moons; not for asteroid statistics or solar history** | Planets are honest visualisation-grade (inside JPL's published envelope) and the README's *Physics Notes* are candid. But moons are not shown at all despite the README's "424 moons" highlight, and if re-enabled **18 of 26 validated moons would be more than half an orbit radius from truth** (Saturn's classical moons are wrong even at their own element epoch). "Earth" is actually the Earth–Moon barycentre, the rendered belt is the largest 50% of the catalog, and the hybrid solar model blends **today's** sunspot data into historical dates. |
| **Scientific analysis** | ❌ **Not ready** | Benchmark `validationCoverage = 0.0`; the backend PFSS solver computes **wrong Legendre functions**; the (dormant) moon model is invalid for 18/26 moons and validated only at J2000; 24% line coverage of shipped frontend code; data not reproducible against its mutable upstreams. |
| **Operational trajectory / mission design** | ❌ **Not ready** | The zero-rev Lambert solver is genuinely good (matches **Izzo 2015 and Gooding 1990 to < 10⁻⁶ m/s**, certified residual). But there is **no multi-revolution support** (a 900-day case costs **24×** more Δv than the 2-rev optimum), the MGA planner finds **0 assisted routes to any outer planet in 96 attempts** (and "Earth→Mars via Saturn" when it does find one), there is no finite-burn, launch or capture modelling, and a single plan request issues ~1,300 upstream calls with no timeout. |

### 1.3 What changed since 2026-09-07 (verified, not assumed)

| Prior finding | Status at HEAD | Evidence |
|---|---|---|
| F-04 catalog silently replaced on a 2 s latency budget | ✅ **FIXED** | Latency removed from the acceptance conjunction (`phase1AsteroidCatalog.ts:619`). New `#status-catalog` label verified in the browser for 6 failure modes (§7.9). An 11.5 s load is now **accepted**. |
| F-07 WebSocket accepts any Origin | ✅ **FIXED** (new residual issue M-5) | Forged and `null` Origins → **HTTP 403** (`server.py:443`). New connection cap = 4 — now exploitable as a lock-out (M-5). |
| Flyby v∞ not conserved / not checked | ✅ **FIXED** (new residual issue M-4) | v∞ continuity enforced (`mga.py:27`). Independently re-verified: **0.41 and 0.60 m/s** mismatch. But the planner is now nearly inert (M-4). |
| Lambert "converged or not" ambiguous | ✅ **FIXED** | Returns `None` unless `|ΔTOF| ≤ tol` (`lambert.py:165`). Validated against Izzo and Gooding. |
| Accessibility (0 `aria-*`) | ✅ **Much improved** | 68 `aria-*`, 7 roles, axe-core 0 violations, visible 3 px focus rings, mobile drawer. |
| Type errors 280 | ⚠️ Improved to **246** (165 shipped) | `main.ts` 52 → 18. No gate runs `tsc`. |
| REBOUND epoch guard | ✅ **New** | `set_julian_date` outside [1990-01-01, 2050-01-01] TDB → `epoch_out_of_range`. |
| Moon SF-1 double-count and moon gate (both **dormant** — moons disabled in the UI), UTC/TDB, Pluto rates, benchmark, README drift, licence, KBO uploads, warp contamination, fan-out | ❌ **Persist** | Propagation core (`orbitMath.ts`, `catalog.ts`, `planets.ts`, `solarSystemModel.ts`, `moons.json`, `constants.ts`) is **byte-unchanged** since 09-07. Re-measured anyway. |

### 1.4 Corrections to my own 2026-09-07 report

A professional audit has to correct its own record. These eight 09-07 claims were **wrong or incomplete**:

| # | 09-07 claim | What is actually true | How established |
|---|---|---|---|
| C-1 | "`tool_version 1.0` for Tudat does not correspond to any TudatPy release" | **TudatPy v1.0.0 exists** (tag commit 2025-10-01). Orekit **13.1** (Maven Central, 2025-08-01) and GMAT **R2025a** (SourceForge) also exist. | GitHub API, Maven metadata, SourceForge listing |
| C-2 | "PFSS magnetics is a dipole + octupole analytic field, not a magnetogram-driven PFSS solve" | That describes the **frontend** only. The **backend** has a genuine Altschuler–Newkirk PFSS (GONG FITS ingest, spherical harmonics, source surface, RK4 tracing) — which, however, computes **wrong Legendre functions** (H-2). | Code read + analytic tests |
| C-3 | "The ephemeris cache grows without bound across requests" | The cache is **per request** (`planner.py:75,145,183`); nothing grows across requests. The real problem is the opposite: **no shared cache**, so every plan re-issues ~1,300 upstream calls. | Code read |
| C-4 | "45 concurrent requests stayed fast because the cache was warm" | Wrong explanation. They were fast because a Lambert call makes only 2 upstream calls. Threadpool starvation is now **proven** with a simulated slow upstream (H-3). | Controlled experiment |
| C-5 | "R-12: textures partly refuted — `textures.ts` is reachable and the build emits assets" | **Wrong.** The build emits **0** image assets and the running app downloads **0** image files. `textures.ts` only generates procedural textures. The whole 39 MB `src/assets/textures` tree is **unused**. | CDP network capture + `dist/` listing |
| C-6 | "today" epoch = JD 2461025.5 | That JD is **2025-12-16**. This report uses JD 2461307.5 = 2026-09-24. | Date arithmetic |
| C-8 | Moons "visibly wrong"; the Moon "rendered on an essentially arbitrary side of the Earth" | Moons are **not rendered at all** in the shipped UI at `ec7ad33` or at `9418652` (`showMoons = false`). The moon-model defects are real but **dormant**. | `main.ts:114` (ec7ad33), `main.ts:143` (9418652), `Bodies · 55,010` |
| C-7 | Titan/Rhea "element-set **or frame-conversion** defect" | The conversion is **correct** (reproduces Horizons to ≤ 0.1° for Io, Europa, Ganymede, Callisto, Phobos, Deimos). JPL's published **SAT441 mean elements** do not reproduce JPL's own ephemeris, even in their own Laplace frame. | §7.4 |

### 1.5 The findings that matter most

1. **H-1 — The only backend feature the UI uses never works.** 0/39 solar-physics successes: the client
   times out at **2.6 s** but the default request costs **4.6–9.4 s**; orphaned server jobs then hold the 2-slot
   guard, so later requests get **503**. From the documented preview origin it is additionally **CORS-blocked**.
   Nothing in the UI reports it.
2. **H-2 — The backend PFSS "Altschuler–Newkirk" solver is numerically wrong.** Legendre P₂…P₄ are wrong and
   non-orthogonal (∫P₀P₂ = −0.945), so a pure dipole comes back with a spurious ℓ=3 term twice its own size.
   The module has **85% line coverage**.
3. **H-3 — Trajectory endpoints can starve the whole API.** Sync handlers, no timeout, ~1,300 upstream calls per
   plan, no shared cache: `/health` took **17 s** under a flood; offline, one plan holds a worker thread for
   **~3.6 h**.
4. **H-4 — The benchmark validates nothing** (`validationCoverage 0.0`, `meanAbsErrorKmS 0.0`, tier `strict`),
   and all 9 "tool artifacts" share one capture timestamp **to the second**.
5. **H-5 — No licence** while shipping a **GPL-3.0-only** dependency (REBOUND), an unmanifested — and unused —
   39 MB texture tree, and an unresolved-licence texture.
6. **H-6 — README describes a product that is not shipped**: engine dropdown, Connect button, satellites, nearby
   systems, trajectory UI, 4K/MOLA textures, 1.9M particles, an asteroid Web Worker, **and the "424 moons"** —
   **none exist in the bundle's UI**.

Also material, but **dormant in the shipped UI**: the moon model (M-22/M-23/M-24). The Moon reaches **745,623 km**
error, **18 of 26** validated moons are > 0.5 orbit radius off, Saturn's classical system is wrong **at J2000**
because of upstream SAT441 elements, and the single-epoch moon gate (tolerances up to 200% of orbit radius)
cannot detect any of it. A commit that landed mid-audit fixes part of this (§14).

**Weighted score: 49.0 / 100** (coverage/confidence: **high**; details §12). Previous: 46 (2026-09-07), 36 (2026-08-23).

---

## 2. Architecture and runtime data-flow map

Derived from the production build's **sourcemaps** (`vite build --sourcemap`), the built bundle's string table,
a CDP network capture of the running app, and live backend probes — not from file existence.

```
index.html  ("Sun Model Lab · Solar Observatory"; 68 aria-*, 7 role=, 14 <label>)
  │  style.css ──@import──► fonts.googleapis.com (Chakra Petch, Oxanium)          [3rd-party request, L-14]
  └─ <script type=module src=/src/main.ts>   (1,454 lines; 18 tsc errors; 0% test coverage)
       ├─ constants.ts ...... currentJulianDate() = Date.now()/86400000 + 2440587.5  ◄ UTC JD, never → TDB   [M-2]
       ├─ sim/catalog.ts .... 434 bodies = 10 major + 424 moons (moons.json); moons DISABLED: showMoons = false (main.ts:143)
       │     └─ resolveMoonSecularRates()  ω̇, Ω̇ only — no mean-longitude rate      [M-22]
       ├─ sim/orbitMath.ts .. Kepler solve + Standish secular propagation (float64)
       ├─ sim/solarSystemModel.ts  parent-relative → world;  "earth" = EM barycentre   [M-3]
       │     └─ applyMetricKinematics(…, 1e12)  ◄ speculative warp writes planet state [M-9]
       ├─ workers/modelWorker.ts ◄─ new Worker(main.ts:744)  float64 AU, AU/day; bit-identical to CPU path
       ├─ sim/phase1AsteroidCatalog.ts ──fetch──► /data/asteroid-phase1/*.bin (3.5 MB) + .meta.json
       │     └─ acceptance gates: metadata, version, rows, taxonomy, SHA-256 (latency = telemetry only) ✅
       ├─ sim/asteroidBelt.ts  first 50,000 of diameter-sorted 100,000                 [M-21]
       │     └─ propagateBeltPositions()  CPU path — no callers, not in bundle (dead)
       ├─ features/asteroids/beltRenderer.ts  GPU Kepler in GLSL, `uniform float uJulianDate` [M-1]
       ├─ sim/kuiperBelt.ts  5,000 KBOs, CPU-propagated + re-uploaded EVERY frame        [M-10]
       ├─ features/asteroids/catalogSourceStatus.ts → #status-catalog (verified / fallback / failed) ✅
       ├─ features/solar/* (7) + sunController.ts (600 lines, 0% coverage)
       │     └─ solarPhysicsClient ──fetch (timeout 2.6 s, poll 0.9 s)──► :8042/solar/physics   [H-1]
       │            └─ on success only ──► :8042/solar/realtime/aia-tile   (never reached in practice)
       └─ features/superluminal-modeling/* (4 modules, 133 of 165 shipped tsc errors), "speculative" labelled ✅

  NOT in the bundle: any WebSocket, /trajectory/*, /mission/*, /benchmark/*, /bodies, /nearby-systems
  Reachable: 34 of 74 .ts files.  Dormant: 31 production modules + 2 test-only helpers + 7 tests.

uvicorn server:app  (backend/server.py 1,889 lines; 13 of 18 routes are sync `def` → one 40-token anyio pool)
  ├─ CORS default: localhost/127.0.0.1 on :3000 and :5173 only (NOT :4173 preview), allow_credentials=True
  ├─ GET /health /info /bodies (sync) ..................... absolute filesystem paths in /health      [L-4]
  ├─ GET /solar/physics  (async; 2-slot guard; 12 s timeout) quasi_mhd_corona_v4 + PFSS ℓmax 9–15     [H-2]
  │     └─ hybrid forcing blends live SILSO/AIA/GONG (SWPC 404) into ANY epoch at ≥ 25% weight         [M-8]
  ├─ GET /solar/realtime[/aia-tile] ....................... rate limit keyed on spoofable X-Forwarded-For [M-6]
  ├─ POST /trajectory/lambert, /trajectory/plan (sync def, NO timeout, provider "auto")                [H-3]
  │     └─ EphemerisService (per request) → spice(absent) → horizons (HTTPS, 10 s each) → kepler
  ├─ POST /trajectory/porkchop (async, size guard, timeout) ✅   POST /mission/plan (async, timeout) ✅
  ├─ GET /benchmark/accuracy  validationCoverage 0.0                                                  [H-4]
  ├─ POST /benchmark/accuracy/report  path-contained ✅, overwrite-guarded ✅
  └─ WS /ws/sim  Origin allowlist ✅, global cap 4 (lock-out) [M-5]; REBOUND IAS15, 41 bodies, TDB, AU/day
        └─ tudatpy_hooks (not installed): point-mass + J2 wired; SRP reported but never applied        [L-13]
  dead: sim/radiation_pressure.py, sim/galactic_tide.py (import only each other, 0% coverage)

External sources: JPL Horizons (live, per request), JPL SBDB (build-time), JPL SSD sats table (build-time),
  NOAA SWPC (404), SILSO (ok), Helioviewer/SDO-AIA (ok), GONG (ok), USGS/Solarviews (textures, unused).
```

### 2.1 Feature classification

| Feature | Class | Evidence |
|---|---|---|
| Sun visual stack (limb darkening, granulation, corona, flares, magnetics; prominence and solar-wind modules dormant) | **Active, user-accessible** | 7 solar modules in bundle; `#toggle-magnetic-field`, `#aia-channel` |
| Sun + 8 planets + Pluto, orbits, labels, realistic scale, explorer search (10 bodies) | **Active, user-accessible** | `Bodies · 55,010`; `#body-search`, `#toggle-realistic-scale` |
| 424-moon catalog and moon propagation | **Dormant** (built, never rendered/listed/propagated) | `showMoons = false`, `main.ts:143` |
| Time controls: pause, ±120 d/s, "Jump to now" | **Active, user-accessible** | measured §7.8 (reverse to 2024-09-07 confirmed) |
| AGN/SMBH/H29 experiment zone | **Active, user-accessible, labelled speculative** | `index.html` "Educational experiment zone … speculative … not a forecast"; `main.ts:1313` |
| JPL Phase-1 asteroid catalog + provenance label | **Active, background + visible status** | `#status-catalog` = "verified Phase-1 catalog (100,000 rows, SHA-256)" |
| Model worker | **Active, background** | `main.ts:744`; RTT p50 3.8 ms |
| Backend solar physics + AIA observation textures | **Active code path, fails 100% in practice** | H-1 |
| REBOUND N-body (`/ws/sim`) | **Backend-only, not connected to UI** | no `WebSocket` in bundle |
| Lambert / MGA / porkchop / mission planner / benchmark | **Backend-only, not connected to UI** | no route strings in bundle |
| TudatPy engine | **Backend-only, optional, not installed** | `/health` `tudatpy.available: false` |
| Nearby star systems | **Dormant prototype** (backend route live) | `nearbySystemsRenderer.ts` not in bundle |
| Earth satellites/TLE/J2, NASA GIBS clouds, Milky Way band, orbit renderer, LOD manager, camera transitions, label system, UI bindings, planner UI, moon-texture pipeline, terrain synthesis | **Dormant prototypes** | 31 modules absent from sourcemaps |
| Asteroid GPU pipeline (`sim/asteroids/*`), CPU `propagateBeltPositions` | **Dead/orphaned** | no importers / no callers |
| `radiation_pressure.py`, `galactic_tide.py` | **Dead/orphaned (backend)** | imported only by each other; 0% coverage |
| Engine dropdown + "Connect", Oort cloud, 1.9M-particle pipeline, `src/workers/asteroidWorker.ts`, 4K/MOLA/2K planet textures | **Documentation-only / absent** | §3 |

---

## 3. Implemented-versus-declared matrix (README.md at HEAD)

Verified against the built bundle, a CDP network capture and a live browser — not against file existence.

| # | README claim | Line | Status | Evidence |
|---|---|---|---|---|
| 1 | "real-time 3D solar system simulator **and mission-design workbench**" | 3 | ⚠️ Half true | simulator ✅; mission design backend-only |
| 2 | "optional Python backend for high-fidelity N-body physics, trajectory planning, and data-driven solar observation" | 3 | ❌ Not reachable | bundle calls only 2 solar routes; both deliver nothing (H-1) |
| 3 | Sun + 8 planets + Pluto, tilt, spin | 7 | ✅ | catalog |
| 4 | 424 moons from JPL SSD | 8 | ❌ **not in the UI** | catalog has 424, but moons are never rendered or listed (`showMoons = false`); the model is also inaccurate (M-23) |
| 5 | "Physics-grounded Sun … PFSS magnetics … SDO/AIA observation texture blending" | 9 | ⚠️ | frontend visuals ✅; AIA never loads (H-1); backend PFSS numerically wrong (H-2) |
| 6 | SMBH shockwave / exotic hypothesis modelling | 10 | ✅ active, now labelled speculative | displaces planet state ×10¹² (M-9) |
| 7 | pause, reverse, time-warp, **jump-to-date** | 11 | ⚠️ | no date input exists; only "Jump to now" |
| 8 | catalog stars + **synthetic Milky Way band** | 12 | ⚠️ stars ✅ / Milky Way ❌ | `milkyWay.ts` dormant |
| 9 | **Nearby star systems** with navigable manifests | 13, 249-251 | ❌ absent from UI | dormant |
| 10 | Asteroid belt … Phase 1 real-catalog pipeline **(1.9M particles)** | 14, 256 | ❌ | corpus 100,000; 50,000 rendered |
| 11 | Kuiper belt + approximate **Oort cloud** | 15, 204, 362 | ⚠️ KBO ✅ / Oort ❌ | no Oort code in bundle |
| 12 | **Earth satellite layer** (ISS + GEO, TLE, J2) | 16, 208, 355 | ❌ absent | dormant |
| 13 | **Real-time Earth clouds** (NASA GIBS) | 17, 216, 356 | ❌ absent | dormant; 0 image requests |
| 14 | **Interplanetary route planner** / multi-gravity-assist | 18, 270-273 | ⚠️ backend-only and practically inert | M-4 |
| 15 | **Multi-agent mission planner** | 19, 277-278 | ⚠️ backend-only | no route in bundle |
| 16 | "**Strict type checking is now active on every source file**" | 24 | ❌ misleading | `npm run typecheck` exits 2, 246 errors; no gate |
| 17 | "two workerized paths: satellite propagation and solar-system model" | 26 | ⚠️ half | model worker ✅; satellite worker dormant |
| 18 | "switch simulation engines **in the UI dropdown**" / "click **Connect**" | 53, 69 | ❌ | no such control |
| 19 | backend `--host 0.0.0.0 --port 8042 --reload` | 66 | ⚠️ works, unsafe default | S-12 |
| 20 | WebSocket query params `fps`, `stream_hz` | 73-75 | ✅ backend | no UI client |
| 21 | project tree lists `src/workers/asteroidWorker.ts` | 156 | ❌ file does not exist | `ls src/workers` |
| 22 | "`solar_physics.py` … (**v3**)" | 167 | ❌ stale | reports `quasi_mhd_corona_v4` |
| 23 | "`solar_realtime_data.py` SDO/AIA, **SWPC**, SILSO ingestion" | 168 | ⚠️ | SWPC 404 upstream (M-18) |
| 24 | `radiation_pressure.py` (SRP, P-R, Yarkovsky), `galactic_tide.py` (Heisler–Tremaine) | 170-171 | ❌ dead code | imported by nothing live |
| 25 | "**14 pytest modules**" | 176 | ❌ stale | 176 tests in 26+ modules |
| 26 | "Search all bodies by name" | 212 | ⚠️ | major bodies + moons searchable; asteroids/KBOs not |
| 27 | Earth **4K day map, 2K normal**, cloud mosaic, terrain LOD | 216 | ❌ | 0 image files downloaded; textures procedural |
| 28 | Moon albedo + relief; **Mars USGS albedo + MOLA relief**; planets **2K day textures** | 217-219 | ❌ | same — 39 MB tree unused |
| 29 | Observation textures SDO/AIA, backend proxy, confidence-weighted blending | 237 | ❌ in practice | never fetched (H-1) |
| 30 | Data assimilation using **NOAA SWPC**, SILSO, SDO/AIA | 238 | ⚠️ | SWPC dead; blends today's data into any epoch (M-8) |
| 31 | Asteroid "Off-thread processing via **Web Worker**" | 258 | ❌ | no asteroid worker; GPU shader |
| 32 | Asteroid "Sun/Jupiter/Saturn perturbation model" | 259 | ⚠️ cosmetically null | ~1 km displacement at default scale (L-16) |
| 33 | `GET /benchmark/accuracy` "runs reference scenarios" | 282 | ⚠️ literally true | validates nothing (H-4) |
| 34 | Data Model: REBOUND from DE441 Horizons vectors, TDB, barycentric, force models disclosed | 296-306 | ✅ **verified** | §7.5 + live `--check` |
| 35 | "visualization-grade approximations, not osculating initial conditions" | 293-295 | ✅ **accurate and candid** | §7.1 |
| 36 | "Moon frame normalization … is an approximation" | 308, 358 | ✅ true — the approximation is **not** the dominant error | §7.4 |
| 37 | "some modules (radiation pressure, galactic tides) require backend REBOUND integration" | 363 | ❌ | they are not integrated anywhere |
| 38 | "Kepler solver clamps eccentricity at 0.9999999" | 365 | ⚠️ | `solveKepler` yes; `solveKeplerFast` (belts) has no clamp (L-2) |
| 39 | Data-source table (Solar System Scope, three.js set, USGS/MOLA, 2MASS …) | 372-377 | ⚠️ | credited assets are not shipped/used; no licence manifest |
| 40 | `npm run build && npm run preview` | 398-399 | ⚠️ | works, but preview origin is CORS-blocked by the backend default |
| 41 | `npm run typecheck` | 404-405 | ❌ exits 2 | 246 errors |
| 42 | `cd backend && pytest` | 410-413 | ❌ on a fresh install | fails at collection: `starlette.testclient` needs `httpx2` (undeclared) |

**Tally (42 claims):** 6 verified true · 17 partly true / backend-only · 17 false or absent · 2 stale.
The *Data Model* and *Physics Notes* sections remain the most accurate part of the document.

---

## 4. Validation matrix — every command, environment and result

**Environment (OBSERVED).** Linux 6.18.33.2-microsoft-standard-WSL2, 32 vCPU, 93 GB RAM, 2× NVIDIA RTX 5090
(driver 596.36, exposed via `/dev/dxg`). Node **22.22.1** / npm **10.9.4** (official tarball — no Node on the
host PATH). Python **3.12.13** venv (host default 3.14.6; the repo declares no Python version). Chromium via
Playwright **1.63.0**. REBOUND **5.1.1**; TudatPy not installed.

| # | Command / probe | Result | Status |
|---|---|---|---|
| 1 | `git status --short --branch` / `git rev-parse HEAD` | `main…origin/main [ahead 10]`, clean / `9418652…` | ✅ |
| 2 | `npm ci` | exit 0 | ✅ PASSED |
| 3 | `npm ls --all` | exit 0; only cross-platform optional binaries unmet | ✅ PASSED |
| 4 | `npm run typecheck` | **exit 2, 246 errors** (165 shipped / 81 dormant) | ❌ FAILED |
| 5 | `vite build --outDir <tmp> --sourcemap` | exit 0; 40 modules; JS **896.57 kB** (gzip 225.08) + worker 19.51 kB + CSS 22.01 kB | ✅ PASSED |
| 6 | Sourcemap reachability | **34 / 74** `.ts` files | ✅ |
| 7 | `npm test` (×3) | **108 / 108** passed, identical all 3 runs | ✅ PASSED |
| 8 | `vitest --coverage` | all 15.0% · **shipped 24.4%** · dormant 0% | ⚠️ |
| 9 | `npm audit` | **9 vulns**: 1 critical, 5 high, 2 moderate, 1 low (dev-only) | ❌ FAILED |
| 10 | `pip install -r backend/requirements.txt` → `pytest` | **collection error**: `starlette.testclient requires httpx2` | ❌ FAILED |
| 11 | + `httpx` → `pytest -q` (×3) | **176 passed** (41–45 s), identical all 3 runs | ✅ PASSED |
| 12 | `pytest --cov` | TOTAL 75% (incl. tests); `server.py` 56% | ⚠️ |
| 13 | `py_compile` all backend + script `.py` | 70 files, 0 failures | ✅ PASSED |
| 14 | `pip freeze` (resolved) | 30 packages; `starlette` **1.7.0** (was 1.6.0 on 09-07) | ⚠️ drift |
| 15 | `pip-audit -r <resolved>` | **No known vulnerabilities** | ✅ PASSED |
| 16 | `pip-licenses` / npm licence walk | Python: 1 **GPL-3.0-only** (rebound), 1 MPL-2.0; npm: 61 permissive | ⚠️ |
| 17 | Secret regex scan (tracked files) | no credentials | ✅ PASSED (gitleaks unavailable) |
| 18 | Live Horizons fetch | 70 helio + 77 SSB + 8 EMB + 156 moon states | ✅ |
| 19 | Frontend CPU model vs worker (70 states) | **bit-identical** (0.000 km) | ✅ PASSED |
| 20 | Frontend planets vs Horizons, 8 epochs 1800–2199 | §7.1 | ✅ (in JPL envelope) |
| 21 | Earth vs EMB hypothesis | velocity error 12.3 m/s → 0.33–1.34 m/s vs EMB | ❌ M-3 |
| 22 | Moons (26) vs Horizons, 6 epochs (harness forces `includeMoons: true`; dormant in UI) | 18/26 > 0.5 orbit radius at 2026-09-24 | ❌ M-23 (dormant) |
| 23 | Elements in JPL's own Laplace frame | Jovian/Martian Δλ ≤ 0.10°; SAT441 up to −157° | ❌ M-23 |
| 24 | REBOUND vs Horizons, 1990–2050 | 51–1,584 km at 2026; 117–8,291 km at 2050 | ✅ PASSED |
| 25 | REBOUND epoch guard (1950, 2100) | `epoch_out_of_range` | ✅ PASSED |
| 26 | Kepler residual sweep (36,000 M × 11 e) | `solveKepler` 8.9e-16; `solveKeplerFast` diverges e ≥ 0.99 | ⚠️ latent |
| 27 | Lambert closure (independent propagator, 11 cases) | 0.000–217 km at default tol | ✅ PASSED |
| 28 | Lambert vs **Izzo 2015 & Gooding 1990** | Δv₁ < 10⁻⁶ m/s on 8 geometries | ✅ PASSED |
| 29 | Multi-rev / hyperbolic sweep | no multi-rev; no solution for TOF ≤ 10 d hyperbolic | ❌ M-19 / L-1 |
| 30 | MGA flyby v∞ recomputation | 0.41 / 0.60 m/s mismatch | ✅ PASSED |
| 31 | MGA route search, 144 plans | 4 assisted; 0 of 664 alternatives | ❌ M-4 |
| 32 | Benchmark endpoint + 9 checksums + CSV/JSON | coverage 0.0; 9/9 sha OK; 9/9 values agree | ❌ H-4 |
| 33 | Tool versions vs registries | TudatPy 1.0.0, Orekit 13.1, GMAT R2025a all real | ✅ (corrects C-1) |
| 34 | WebSocket: Origin / capacity / slot recovery | 403 forged; cap 4; lock-out 218 s; 4/4 slots recover | ⚠️ M-5 |
| 35 | Slow-upstream flood (instrumented instance) | `/health` **17.06 s** | ❌ H-3 |
| 36 | CORS default preflight | foreign Origin → 400, no ACAO | ✅ PASSED |
| 37 | Porkchop bounds | ε-step clamped; > 3650 d window → 413 | ✅ PASSED |
| 38 | 64 MB body | 422 reflects **64,000,110 bytes** | ❌ M-7 |
| 39 | XFF rotation vs rate limit | 40/40 bypass | ❌ M-6 |
| 40 | Report path traversal (4 payloads) | contained, 400 | ✅ PASSED |
| 41 | Browser, real GPU, dev origin | 59.9 FPS, p99 16.8 ms; JS 2.4 ms; 329,632 B/frame uploads | ✅ / ⚠️ M-10 |
| 42 | Browser, 3-min resource series | GPU objects flat; post-GC heap +0.10 MB retained (snapshot diff) | ✅ PASSED |
| 43 | Browser failure modes (6) | all correctly labelled | ✅ PASSED |
| 44 | Solar physics from dev / preview origins | 0 / 39 successes | ❌ H-1 |
| 45 | axe-core 4.10.2 (WCAG 2.0/2.1 A/AA + best practice) | **0 violations**, 40 passes, 2 incomplete | ✅ PASSED |
| 46 | Keyboard, reduced motion, WebGL off, determinism | canvas not keyboard-operable; reduced motion no effect on scene; no fallback text; non-deterministic | ❌ L-6/L-7/L-8 |
| 47 | GPU (float32) vs CPU (float64) asteroid replica | up to **283,689 km** | ❌ M-1 |
| 48 | ACBF `validatePackedCatalogRoundTrip100k()` | `ok:false`, **99,916** mismatches | ❌ M-14 |
| 49 | PFSS analytic tests | Legendre wrong ℓ ≥ 2; non-orthogonal | ❌ H-2 |
| 50 | Regenerate asteroid catalog (temp dir) | not byte-identical; 703 in/out; all re-epoched; script crashes at exit | ⚠️ M-13 |
| 51 | Regenerate moons (`update:moons`) | 460 vs 424 records | ⚠️ M-13 |
| 52 | `fetch_jpl_nbody_ephemeris.py --check` (live Horizons) | both files **verified** | ✅ PASSED |
| 53 | Moon textures: local sha + upstream URL + sha | 9/9 match | ✅ PASSED |
| 54 | Runtime asset capture | 10 responses / 4.38 MB; **0 images** | ✅ (corrects C-5) |
| 55 | Scripts `--help` | 4 broken, 1 writes on `--help` | ❌ M-17 |
| 56 | Relative Markdown links (tracked) | 88 of 109 broken | ❌ L-10 |

---

## 5. Severity-ranked findings

Every finding below has a reproduction in §A (appendix) or the evidence directory. Severity reflects the
**shipped** product. Dormant code is not inflated; its re-activation risk is stated instead. No finding is
rated *blocker*, because the visual product runs. H-5 would, however, block any **public redistribution**.

### 5.1 HIGH

#### H-1 — The UI's only backend integration (solar physics + AIA textures) never delivers data
| | |
|---|---|
| Severity / Confidence / Category | High · High · Functional correctness / integration |
| Status | **Active**, user-facing, silent |
| Evidence | `sunController.ts:152-155` `new SolarPhysicsClient({ pollIntervalMs: 900, timeoutMs: 2_600 })`; `solarPhysicsClient.ts:127-134` `AbortController` + `fetch`; `server.py:183` `SOLAR_PHYSICS_CONCURRENT_REQUEST_LIMIT` default **2**; `server.py:1045` 503 "temporarily saturated"; `server.py:101-111` CORS default omits `:4173` |
| Reproduce | Start backend on `:8042` (defaults) and `npm run dev`; open the page; count `/solar/physics` responses via CDP (`evidence/results/browser_dev-gpu-dpr1.json`). Single request cost: `curl ':8042/solar/physics?jd=2461448.9&fidelity=high&max_features=180&forcing=hybrid&live_data=true'` |
| Expected | The Sun's backend-driven state and AIA observation textures reach the renderer, or the UI reports that they did not |
| Actual | **Dev origin: 0 successes / 39 requests** (11 × 503, 28 × client abort). **Preview origin: 0 / 44** (14 × CORS-blocked, 30 × abort). The default request costs **4.6–9.4 s** (repeat of the same epoch 6.4 s; synthetic forcing 0.055 s) on an idle 32-core host, against a **2.6 s** client timeout. Aborting does not cancel server work, so orphaned jobs keep both guard slots busy. AIA tiles are requested only after a physics success, so **0 are ever requested**. No DOM element exposes `lastError`. |
| User impact | The README's "data-driven solar observation", AIA channel selector and assimilation modes silently do nothing. The `#aia-channel` control has no visible effect. |
| Scientific impact | Every solar state shown is frontend-procedural; any claim of observational grounding for the displayed Sun is false in the default setup. |
| Root cause | Client timeout and poll cadence were sized for the fast synthetic path, but the default request is the slow hybrid + PFSS path. There is no response cache per epoch bucket, server work is uncancellable, and CORS omits the documented preview origin. |
| Minimal remediation | (a) Quantise `jd` to a coarse bucket (e.g. 1 d) and cache responses server-side; (b) raise the client timeout above the server's p95 or make the call async (202 + poll); (c) cancel or ignore orphaned work; (d) add `:4173` to the default allowlist; (e) show a "Solar data: live / synthetic / unavailable" status. |
| Acceptance | In `npm run dev` + backend, ≥ 95% of `/solar/physics` requests over 5 min return 200, at least one AIA tile loads, and a UI status element reflects the source. Same from `npm run preview`. |
| Effort | 1–2 d. Depends on the solar caching design. |

#### H-2 — The backend PFSS solver computes wrong associated-Legendre functions
| | |
|---|---|
| Severity / Confidence / Category | High · High · Scientific correctness |
| Status | **Backend, active path** (every `/solar/physics` response includes `pfss_field_lines`, ℓ_max 9–15); not currently visible in the UI because of H-1 |
| Evidence | `pfss_magnetogram.py:281-313` `_associated_legendre`: fully-normalised horizontal-recurrence coefficients `a = √((2l−1)(2l+1)/((l−m)(l+m)))` applied to Schmidt-style seeds |
| Reproduce | `evidence/scripts/pfss_check.py` |
| Expected | P₂(0.5) = −0.125, P₃(0.5) = −0.4375; ∫PₗPₗ′ sinθ dθ = 0 for l ≠ l′; a pure dipole map returns g₁₀ only; Br(2.5 R☉)/Br(R☉) = 0.0930 for ℓ=1 |
| Actual | P₂(0.5) = **−0.634**, P₃(0.5) = **−1.134**, P₄(0.5) = −0.487. ∫P₀P₂ = **−0.945**, ∫P₁P₃ = −0.621, ∫P₂P₄ = −0.503. Dipole → g₁₀ = 1.0 **plus g₃₀ = −2.174**; reconstructed Br(R☉, θ=0.9) = 3.11 vs input 0.62; source-surface ratio varies 0.032–0.103 with θ. The quadrupole leaks the same way into ℓ=4. |
| User impact | None today (H-1); API consumers receive wrong field lines and open/closed topology. |
| Scientific impact | The only genuinely physics-based solar computation in the repo is numerically invalid for every realistic magnetogram. The module has **85% line coverage**, and no test compares it with an analytic solution. |
| Root cause | Mixed normalisation conventions in the recurrence; no orthogonality or analytic regression test. |
| Minimal remediation | Use one convention consistently (e.g. Schmidt semi-normalised, as in geomagnetism), or `scipy.special.lpmv` with explicit normalisation. |
| Acceptance | Tests: exact Pₗ at sample points; orthogonality matrix diagonal to 1e-10; dipole/quadrupole round-trip coefficients to 1e-6; source-surface ratios 0.09302 (ℓ=1) and 0.04238 (ℓ=2). |
| Effort | 0.5–1 d. |

#### H-3 — Trajectory endpoints can starve the whole API (sync, no timeout, ~1,300 upstream calls, no shared cache)
| | |
|---|---|
| Severity / Confidence / Category | High · High · Availability / security |
| Status | **Backend-only** |
| Evidence | `server.py:1136` `def trajectory_plan`, `server.py:1171` `def trajectory_lambert` — sync, no `timeout_seconds`, unlike porkchop/mission/solar/AIA. Default `ephemeris_provider = "auto"` (`server.py:715,806,847`) → spice (absent) → Horizons HTTPS, 10 s each (`ephemeris_service.py:79,221`). `EphemerisService` is created per request (`planner.py:75,145,183`). `/health`, `/info`, `/bodies` are also sync (`server.py:870…`); 13/18 routes share one 40-token anyio pool. |
| Reproduce | Fan-out: instrument `EphemerisService._sample_kepler` (§A). Starvation: `evidence/scripts/sitecustomize_slow_upstream.py` (simulated unreachable upstream) + 45 concurrent default Lambert requests, probing `/health`. |
| Expected | Bounded latency; health endpoints unaffected by compute load |
| Actual | Samples per plan: 16 / 380 / **1,312** / 1,341 for 0–3 assists; kepler-only compute ≈ 0.5 s. With the upstream unreachable, one Lambert takes **20.45 s**, one plan ≈ 1,312 × 10 s ≈ **3.6 h**, and under 45 concurrent Lambert requests `GET /health` took **17.06 s**. Every identical request repeats all upstream calls. |
| User impact | A handful of requests (or a JPL outage) makes the backend unresponsive, including health checks. |
| Scientific impact | None directly. The default is "network truth", which is good in principle but unbounded in cost. |
| Root cause | Sync handlers for network-bound work, no per-request budget, no shared cache, network provider as the default. |
| Minimal remediation | Make them `async` with the existing timeout helper; per-request outbound budget; a shared LRU+TTL cache keyed by (body, rounded JD); make `health`/`info`/`bodies` `async`. |
| Acceptance | With the simulated slow upstream, `/health` p99 < 50 ms under 100 concurrent plan requests; `/trajectory/plan` returns ≤ 30 s or 504; outbound calls per request ≤ an asserted budget. |
| Effort | 1–2 d. |

#### H-4 — The accuracy benchmark validates nothing, is labelled "strict", and its artifacts lack credible provenance
| | |
|---|---|
| Severity / Confidence / Category | High · High (facts) / Medium (provenance inference) · Scientific validity |
| Status | **Backend-only** |
| Evidence | `GET /benchmark/accuracy`: `comparableScenarioCount 0`, `validationCoverage 0.0`, `passRate 0.0`, **`meanAbsErrorKmS 0.0`** (`accuracy.py:305,327`); tier `"strict"`; `test_benchmark_accuracy.py:23` **asserts** coverage == 0.0; the pass/fail test monkey-patches the solver. All 9 CSVs: `captured_utc = 2026-02-15T10:27:25Z` (identical to the second); added together in commit `3062037` as nine 2-line files; no GMAT script, Orekit config, kernels, logs or regeneration code anywhere. |
| Reproduce | `curl :8042/benchmark/accuracy`; `cut -d, -f5 backend/benchmark/artifacts/*.csv \| sort \| uniq -c` |
| Expected | ≥ 1 comparable scenario, a nonzero-coverage gate, and re-runnable reference inputs |
| Actual | Zero coverage; a 0.0 error that reads as perfect; integrity is fine (9/9 sha256, 9/9 values agree) but provenance is unverifiable. Tool versions are real releases (corrects C-1), and all predate the capture date. |
| User impact | A consumer can misread 0.0 km/s as a perfect score. |
| Scientific impact | No trajectory result in the repo is externally validated by this harness. (The solver is validated independently here, §7.6.) |
| Root cause | Legacy window-level captures that are admittedly incomparable; the labels were never downgraded. |
| Minimal remediation | Return `null` for error metrics when nothing is comparable; drop "strict"; add fixed-state Lambert scenarios (e.g. generated with lamberthub/Izzo, which this audit shows agree to 1e-6 m/s) with endpoint states recorded. |
| Acceptance | `validationCoverage ≥ 0.8` with the real solver; the test asserts pass/fail on real references. |
| Effort | 1–3 d. |

#### H-5 — No repository licence, a GPL-3.0-only core dependency, and unmanifested or unresolved assets
| | |
|---|---|
| Severity / Confidence / Category | High (blocker for redistribution) · High · Legal / provenance |
| Status | **Active** |
| Evidence | No `LICENSE`/`COPYING`. `rebound 5.1.1` = **GPL-3.0-only**, imported by `sim/rebound_nbody.py:20` and `sim/kuiper.py:20`. `src/assets/textures/` 25 files, **39 MB**, no manifest — and **not used at runtime** (C-5). `moon_texture_attribution.json` `mars:deimos` → "Unspecified by provider; verify for redistribution". `stars_catalog.json`: bare list of 5,042 stars, no source, licence or attribution record. |
| Reproduce | `ls LICENSE*`; `pip-licenses --python venv/bin/python`; CDP capture (0 images) |
| Expected | A licence compatible with GPL-3.0 dependencies, and a manifest for every redistributed asset |
| Actual | None. |
| User impact | Nobody can legally reuse or redistribute the code; the backend would impose GPL-3.0 terms if distributed. |
| Scientific impact | Asset and catalog provenance cannot be cited. |
| Root cause | Licensing never addressed; assets accumulated without manifests. |
| Minimal remediation | Choose a licence (GPL-3.0-compatible if the backend is distributed); **delete** the unused 39 MB texture tree or manifest it; replace or remove the Deimos texture; add provenance metadata to the star catalog. |
| Acceptance | CI check: every file under `src/assets/**`, `public/**` and `src/data/*.json` has a manifest entry with licence; a LICENSE is present. |
| Effort | 0.5 d engineering + owner decision. |

#### H-6 — README advertises a product the bundle does not contain
| | |
|---|---|
| Severity / Confidence / Category | High · High · Documentation integrity |
| Status | **Active** |
| Evidence | §3: 17 of 42 claims false or absent, 2 stale (engine dropdown, Connect, satellites, nearby systems, clouds, Milky Way, Oort cloud, 1.9M particles, `asteroidWorker.ts`, 4K/MOLA/2K textures, asteroid Web Worker, "strict type checking active", fresh-install `pytest`). `index.html` itself is accurate ("Sun Model Lab"). |
| Reproduce | grep the built bundle for the claimed routes and controls; CDP capture |
| Expected | README describes the shipped product and separates backend-only capabilities |
| Actual | README line 3 still says "simulator and mission-design workbench". |
| User impact | Users and reviewers believe they are seeing REBOUND output and real textures. |
| Scientific impact | Readers attribute validated-backend accuracy to the browser model. |
| Root cause | Documentation not maintained through the sun-focus refocus. |
| Minimal remediation | Rewrite Highlights and Features for the shipped UI; move backend-only features under "Backend API (not wired to the UI)"; delete absent features. |
| Acceptance | A doc test asserting every README-named control ID exists in `index.html` and every README-named route appears in the bundle or in a "backend-only" list. |
| Effort | 0.5 d. |

### 5.2 MEDIUM

Each entry gives, in order: **Sev/Conf/Category · Status · Evidence · Reproduce · Expected → Actual · Impact
(user / scientific) · Root cause · Remediation · Acceptance · Effort.**

**M-1 — Asteroid GPU shader uses float32 absolute Julian dates: up to 283,689 km error, 0.25-day stepping**
- Medium · High · Numerical precision · **Active**
- `beltRenderer.ts:65` `uniform float uJulianDate`; `:62` epoch in a float attribute; `:127` `float deltaDays = uJulianDate - epochJd` in GLSL float32. The GPU is the **only** asteroid propagator (`propagateBeltPositions`, `asteroidBelt.ts:216`, has no callers).
- `evidence/scripts/gpu.js` (a faithful `Math.fround` port of the shader) on 5,000 committed records.
- Expected ≲ 1,000 km (the shader maths itself, when the JD is float32-exact: p50 77 km, max 415 km) → Actual at 03:00 UTC: **p50 183,898 km, max 283,689 km**. At the default 4 d/s and 60 fps the uniform changes on only **160/600 frames**, so the belt moves in 0.25-day jumps.
- User: visible stutter under warp. Scientific: no asteroid position is reliable to better than ~2.8×10⁵ km.
- Root cause: float32 ulp at JD 2.46×10⁶ is 0.25 d — the same defect that froze the Sun shader (fixed there by moving to the wall clock).
- Remediation: pass `uDeltaDays = JD − JD_ref` computed in float64 on the CPU (per frame), or hi/lo split uniforms.
- Acceptance: the replica error is < 1,000 km at arbitrary times, and the uniform changes every frame at 4 d/s.
- 2–4 h.

**M-2 — The frontend feeds a UTC-based JD into a model defined in TDB**
- Medium · High · Time scales · **Active**
- `constants.ts:39-41` `julianDateFromUnixMs(Date.now())`; no TT/TDB conversion anywhere in the frontend (disclosed only in a `modelWorkerContract.ts:34` comment). JPL: T_eph ≡ JD_TDB.
- `evidence/scripts/planets.js` (UTC section).
- Expected: model evaluated at TDB → Actual at 2026-09-24: Mercury **1,178 → 3,832 km (3.3× worse)**, Venus 995 → 3,340 km (3.4×), Earth +1,893 km, Mars +1,509 km (ΔT = 69.184 s).
- User: minor visually. Scientific: dominates the model error budget for the inner planets.
- Root cause: time-scale convention never implemented.
- Remediation: `jdTDB = jdUTC + (TAI−UTC + 32.184 s)/86400`, with a leap-second table or a dated constant.
- Acceptance: Mercury error < 1,500 km vs Horizons at the current epoch.
- 2 h.

**M-3 — "Earth" is the Earth–Moon barycentre (systematic 12.3 m/s, ~4,700 km)**
- Medium · High · Frames / origin · **Active**
- `planets.ts:85-` Earth uses the Standish "EM Bary" elements; the Moon is attached to it as parent (`catalog.ts` `parentId: 'earth'`).
- Compare the model against Horizons `399` and against `3` (`evidence/scripts/planets.js`, EMB section).
- Expected: Earth geocentre → Actual: |Δv| vs Earth **12.06–13.74 m/s at every epoch**; vs EMB **0.33–1.34 m/s**. The true Earth–EMB offset is 4,396–4,890 km.
- User: invisible at solar-system scale. Scientific: Earth's heliocentric state is biased by the EMB offset; the (dormant) Moon's heliocentric position would share it.
- Root cause: EMB elements used as the Earth body.
- Remediation: propagate EMB, then Earth = EMB − μ·r_moon and Moon = EMB + (1−μ)·r_moon, with μ = 0.01215.
- Acceptance: Earth velocity error < 2 m/s vs `399` at all 8 epochs.
- 2 h.

**M-4 — The MGA planner almost never returns a gravity assist, and optimises absurd ones**
- Medium · High · Algorithm / search · **Backend-only**
- Fixed 8-value TOF grid (`planner.py:95`) + strict v∞ continuity (`mga.py:27`, 1 m/s / 10⁻⁴).
- `evidence/scripts/mga_search.py`: 6 targets × 12 departure dates × {1, 2} assists.
- Expected: assisted routes where they exist (e.g. Jupiter/Saturn via Venus/Earth) → Actual: **4 of 144** best routes used an assist; **0 of 664** alternatives; **0 of 96** for Jupiter/Saturn/Uranus/Neptune. The 4 found were Earth→Mars via **Saturn** and Earth→Venus via **Jupiter** (`max_assist` objective).
- User: "multi-gravity-assist planning" silently degrades to direct transfers. Scientific: no MGA result is usable.
- Root cause: two independent Lambert legs on a coarse grid essentially never match v∞ to 1 m/s; there is no continuous optimisation (e.g. a TOF root-solve for v∞ match, or a DSM leg). The objective rewards assist gain without penalising time or detour.
- Remediation: solve for the flyby date and TOF that equalise |v∞| (1-D root find per candidate), allow a powered-flyby Δv term, and add time and path penalties.
- Acceptance: the classic E→V→E→J (Galileo-like) and E→J→S (Cassini-like) windows are found with v∞ mismatch < 1 m/s.
- 3–5 d.

**M-5 — WebSocket capacity (4, global, unauthenticated) enables indefinite lock-out**
- Medium · High · Availability · **Backend-only**
- `server.py:150` `WS_SIM_CONNECTION_LIMIT = 4`; `:443` Origin-less connections allowed by design; `:1787` `close(1013)` before `accept()` becomes **HTTP 403** (indistinguishable from an Origin rejection).
- `evidence/scripts/ws_lockout.py`.
- Expected: fair sharing or eviction → Actual: 4 Origin-less clients that drain frames held all capacity for **218 s** (still streaming, ~95 MB each); an allowlisted browser client was rejected at all 7 probes. Idle non-reading clients *are* dropped (~40 s, uvicorn ping). The preview origin `:4173` is rejected outright.
- User: the simulation stream can be denied to legitimate users by any local process or LAN peer (given the documented `0.0.0.0` bind).
- Root cause: global cap without authentication, per-client quota or session lifetime.
- Remediation: per-client (IP/token) cap, a maximum session lifetime, auth for non-browser clients, send 1013 after accept, add `:4173` to the allowlist.
- Acceptance: 4 hostile clients cannot block a fifth allowlisted client for more than 60 s.
- 0.5–1 d.

**M-6 — Solar rate limiting trusts a client-supplied `X-Forwarded-For`**
- Medium · High · Security · **Backend-only**
- `server.py:323-330` `_client_identity` uses `x-forwarded-for.split(",")[0]` unconditionally; `:354` `setdefault(identity, deque())` never evicts keys.
- `evidence/scripts/xff.py`.
- Expected: 36 req/60 s per client → Actual: same XFF → 36 × 200 then 4 × 429; **rotated XFF → 40/40 × 200**; 3,000 unique identities in 7.1 s.
- User: the rate limit provides no protection. Scientific: none.
- Root cause: no trusted-proxy configuration.
- Remediation: use `request.client.host` unless the connection comes from a configured trusted proxy; cap or evict the identity map.
- Acceptance: rotated XFF from a non-trusted peer yields 429 after 36.
- 2 h.

**M-7 — No request-body size limit, and validation errors reflect the entire payload**
- Medium · High · Security · **Backend-only**
- FastAPI default `RequestValidationError` handler echoes `"input"`; no body-size middleware.
- `curl -X POST :8042/trajectory/plan --data-binary @64MB.json`.
- Expected: 413 at a sane limit → Actual: 422 with a **64,000,110-byte** body in 0.37 s (RSS peak 287 MB).
- User: bandwidth and memory amplification from any unauthenticated client.
- Remediation: body-size limit (e.g. 64 kB for JSON APIs); a custom 422 handler that omits `input`.
- Acceptance: a 1 MB body → 413; 422 responses < 2 kB.
- 1 h.

**M-8 — Hybrid solar forcing blends *today's* observations into any epoch**
- Medium · High · Scientific validity · **Backend, default request mode**
- `solar_physics.py:509-512` `blend_weight = 0.25 + 0.35·observed_confidence` (hybrid), `0.78 + 0.18·conf` (data_driven), with observed data always taken from the current live snapshot.
- `curl ':8042/solar/physics?jd=2447892.5&forcing=hybrid&live_data=true'` (1990-01-01).
- Expected: historical epochs use no live data (or archived data for that date) → Actual: `applied: true`, `observed_activity_index 0.241` from SILSO "updated 2026-08-31", blended at 0.25 — while `observed_confidence: 0.0`.
- Scientific: a 1990 (Cycle 22 maximum) solar state is pulled toward 2026 activity.
- Remediation: apply live data only within a window of the wall-clock date; otherwise use the synthetic cycle, or an archived SILSO value for the epoch.
- Acceptance: for `|jd − now| > 30 d`, `data_assimilation.applied == false`, or the observed index matches the archival SILSO value for that date.
- 0.5 d.

**M-9 — The speculative warp writes planetary state (×10¹² exaggeration) on both threads**
- Medium · High · Scientific integrity · **Active, user-triggered**
- `main.ts:818-823` and `modelWorker.ts:17,128` call `model.applyMetricKinematics(…, 1e12)`, mutating `worldPosition` (`solarSystemModel.ts:161-194`). `syncAsteroidBeltInputs()` (`main.ts:477`) then feeds those positions to the asteroid perturbation uniforms.
- Code path; trigger via the experiment zone.
- Expected: the speculative effect is render-only → Actual: planet state, the body-info readout and perturbation inputs are displaced while a warp is active (transient; recomputed each frame). The UI now labels the zone speculative — an improvement — but not the displacement or exaggeration.
- Remediation: a render-only offset; perturbers read from pristine state; a banner while a warp is active.
- Acceptance: with a warp active, `model.getState('jupiter').worldPosition` equals the unwarped value.
- 0.5 d.

**M-10 — 5,000 KBO positions recomputed and ~322 KB re-uploaded every frame, including while paused**
- Medium · High · Performance · **Active**
- `main.ts:1359-1360` inside `animate()` (`:1349`), unconditional.
- Measured with WebGL instrumentation on the RTX 5090: **329,632 B/frame**, identical when paused (≈ **19.8 MB/s** at 60 fps); CPU cost of the propagation ≈ 1.06 ms/frame (09-07).
- Impact: wasted bus bandwidth and power; headroom on low-end GPUs.
- Remediation: skip when the JD is unchanged; move KBOs to the GPU path (after M-1).
- Acceptance: 0 bytes uploaded per paused frame.
- 2 h.

**M-11 — 246 TypeScript errors (165 in shipped code) and no gate of any kind**
- Medium · High · Engineering · **Active**
- `smbhPropagation.ts` 81, `agnShockwaveEngine.ts` 52, `main.ts` 18, `sunController.ts` 14 (shipped); `milkyWay.ts` 40, `localPlanner.ts` 30, `lodManager.ts` 11 (dormant). TS7006 ×163. No CI, linter, formatter or pre-commit hook; `npm test` does not run `tsc`; `tsconfig` excludes `.mjs`/`.js`.
- Remediation: CI running `typecheck && test && build`; fix the shipped errors first.
- Acceptance: `npm run typecheck` exits 0 in CI.
- 2–4 d.

**M-12 — Shipped frontend code is 24% covered; the orchestration and render layer is 0%**
- Medium · High · Testing · **Active**
- `vitest --coverage`: shipped 2,355/9,636 statements. 0%: `main.ts` (1,160), `sunVisuals.ts` (861), `sunController.ts` (462), `beltRenderer.ts` (414), `textures.ts` (383), `kuiperBelt.ts` (367), all solar and SMBH modules, `modelWorker.ts`. `@vitest/coverage-v8` is not a declared dependency.
- Impact: the modules hosting H-1, M-1, M-9 and M-10 have no tests. Coverage is also not validity: `catalog.ts` is 95% covered while M-23 stands.
- Remediation: unit-test the pure logic out of `main.ts`/`sunController`; add a Playwright smoke test (it runs fine here).
- Acceptance: shipped coverage ≥ 60%; one E2E test asserting 60 FPS and the catalog/solar status labels.
- 3–5 d.

**M-13 — Committed datasets cannot be reproduced against their mutable upstreams**
- Medium · High · Reproducibility · **Active data**
- Asteroid rebuild (`build_asteroid_phase1_dataset.py`) into a temp dir: not byte-identical, **703 objects out / 703 in**, **all 99,297 common records re-epoched** (54% changed `a`). The script **crashes after writing** when `--output-dir` is outside the repo (`relative_to` ValueError). `update:moons`: **460 vs 424** records. Raw upstream responses are not committed (`scripts/.cache/` is gitignored).
- Remediation: commit (or archive with a hash) the raw SBDB / SSD responses used; make the builders rebuild from the snapshot; fix the external-dir crash.
- Acceptance: rebuilding from the committed snapshot is byte-identical.
- 0.5–1 d.

**M-14 — The ACBF format's own round-trip validator fails and is never run**
- Medium · High · Data integrity / testing · **Shipped loader**
- `asteroidCatalogLoader.ts:319-387`; epsilons `:57-60` (e.g. `ANGLE_EPSILON_DEG = 360/65535`). The format doc states no numeric tolerance.
- `validatePackedCatalogRoundTrip100k()` → `ok: false`, **99,916 / 100,000 mismatched**; max errors: epoch 0.125 d, angle 0.00275° (**≈ 19,400 km** at 2.7 AU), e 7.6×10⁻⁶ (≈ 3,100 km), a 1.2×10⁻⁷ AU (18 km).
- Impact: quantisation error is undeclared and untested (the committed file's 42 epochs happen to be float32-exact).
- Remediation: state per-field tolerances in the spec, fix the validator's comparisons (≤, float32 epoch), and run it in `npm test`.
- Acceptance: the validator passes and is part of CI.
- 2 h.

**M-15 — Pluto has no secular rates** · Medium · High · Numerical · Active · `planets.ts:261-278` (no `secularRates`).
Error vs Horizons is 1.13–1.90×10⁶ km over 1850–2100 (8.55×10⁶ km at 2199), 1.5–4.4× worse than the same table's rates allow (09-07 measurement; code unchanged). Remediation: add the six rates. Acceptance: within 2× of the tabulated-rate reference at all gate epochs. 1 h.

**M-16 — A fresh backend install cannot run the tests; dependencies drift** · Medium · High · Reproducibility · Active ·
`backend/requirements.txt` has no `httpx`/`httpx2`; `starlette.testclient` (1.7.0) raises at collection. Every dependency except rebound is a `>=` floor (starlette 1.6.0 → 1.7.0 in 17 days); no lockfile; no declared Python version.
Remediation: `requirements-dev.txt` with `httpx2`; a lockfile (`pip-compile --generate-hashes`); `python_requires`. Acceptance: clean venv → `pytest` passes with no manual step. 1 h.

**M-17 — Broken and unsafe scripts** · Medium · High · Maintainability · Active tooling ·
`scripts/ingest-moon-textures.mjs:5` imports **`moonTextureCatalog.js`**, deleted in the TS migration; `get_errors.mjs`, `testRealisticScale.mjs` and `testWarp.js` need undeclared **puppeteer** and hard-code inconsistent ports (5173 vs **5174**); `scripts/update-moons-data.mjs` ignores `--help` and overwrites `src/data/moons.json`.
Remediation: fix the import; delete or declare the harnesses; flag parsing plus `--dry-run` by default. Acceptance: every script runs with `--help` without side effects. 2–4 h.

**M-18 — NOAA SWPC source is dead (HTTP 404) but still advertised** · Medium · High · Data · Active ·
Both SWPC URLs 404 (re-confirmed 2026-09-24). The backend reports `swpc.ok: false` honestly; README:168, 238 and `/solar/capabilities` still advertise it. Remediation: update the endpoints or drop the claim. 1 h.

**M-19 — No multi-revolution Lambert (quantified cost 24×)** · Medium · High · Mission-design capability · Backend-only ·
`solve_lambert_universal` has no `revolutions` parameter. For a 900-day, 90° transfer (1.0 → 1.1 AU) the repo's only (0-rev) answer needs departure v∞ **33.20 km/s**; Izzo 2-rev low-path needs **1.373 km/s**. Remediation: adopt Izzo 2015 (multi-rev) or lamberthub. Acceptance: agreement with Izzo for M = 0…2. 1–2 d.

**M-20 — Dev-toolchain vulnerabilities (9, incl. 1 critical)** · Medium · High · Supply chain · Dev-only ·
`vitest <3.2.6` critical GHSA-5xrq-8626-4rwp; `vite` 7.0–7.3.3 high (dev-server arbitrary file read, several GHSAs); rollup, postcss, picomatch, nanoid high; fflate, esbuild. The production tree is only `three` (MIT). Matters for `npm run dev` on an untrusted network. Remediation: `npm audit fix` + regression run. 1 h.

**M-21 — The rendered asteroid belt is the largest 50% of the catalog** · Medium · High · Scientific representativeness · Active ·
`asteroidBelt.ts:155` takes the first 50,000 in file order; the corpus is `sort: "-diameter"`. Rendered: mean diameter 8.85 km (min 4.66) vs corpus 6.26 km (min 2.80); mean a +0.084 AU; mean i +0.55° (09-07 measurement; code unchanged). Remediation: uniform or stratified sampling, disclosed in the UI. 2 h.


**Moved from High on re-verification.** The three findings below were first rated High as active. The browser status bar (`Bodies · 55,010` = 50,000 + 5,000 + 10) and `main.ts:143` show that moons are disabled in the shipped UI (§13, self-correction 5). Per the audit rules they are rated as dormant code with a high re-activation risk.

##### M-22 — The Moon's mean anomaly double-counts apsidal precession (fixed for planets, not moons)
| | |
|---|---|
| Severity / Confidence / Category | **Medium** (was High) · High · Numerical correctness |
| Status | **Dormant in the shipped UI** — moons are never rendered, listed or propagated (`const showMoons = false`, `main.ts:143`; `includeMoons: showMoons`). The defect lives in the shared catalog/model used by tests, the worker contract and any re-enable; active development (§14) shows re-activation is intended. |
| Evidence | `catalog.ts:365-379` `resolveMoonSecularRates` returns only `argPeriapsisDegPerCentury` and `ascendingNodeDegPerCentury`, so `orbitMath.ts:132-136` takes the legacy branch (`M` advances at 2π/P_sidereal while ϖ = Ω+ω precesses at 4067.5 °/cy). 0 of 424 moons carry a mean-longitude rate. |
| Reproduce | `evidence/scripts/moons.js` against `evidence/horizons_2026-09-24.json` (Moon = `301` relative to `500@399`) |
| Expected | A mean-element lunar model holds ≲ 30,000 km over decades |
| Actual | Shipped: 4,432 / 18,240 / 266,688 / **745,623** / 32,615 / 716,164 km at J2000 / +30 d / +1 yr / +5 yr / 2026-09-24 / 2050. With the mean-longitude gate: 4,432 / 3,120 / 6,276 / 4,121 / 14,791 / 26,263 km — **worst case 28× better**. |
| User impact | **None in the shipped UI** (moons disabled). If re-enabled, the Moon would be drawn on an essentially arbitrary side of Earth for most dates. |
| Scientific impact | Lunar phase, eclipses and Earth–Moon geometry are unusable. |
| Root cause | Commit `68aff6b` (SF-1) introduced `meanLongitudeDegPerCentury` for planets only. |
| Minimal remediation | Emit `meanLongitudeDegPerCentury = 360/P·36525` **only for ephemerides validated to benefit** — today exactly `DE405/LE405`. Applied unconditionally it makes Ganymede 40× and Callisto 61× worse (09-20 measurement), and it also regresses the ecliptic-frame irregulars Sinope (1.3×) and Carme (1.5×). Fail closed for unknown ephemerides. |
| Acceptance | A multi-epoch Horizons test (≥ 6 epochs, ≥ 50 yr) asserting Moon < 30,000 km at every epoch and no regression > 10% for any other validated moon. |
| Effort | 0.5 d + the M-24 test. |

##### M-23 — 18 of 26 validated moons are more than half an orbit radius from truth; Saturn's system is wrong at its own epoch
| | |
|---|---|
| Severity / Confidence / Category | **Medium** (was High) · High · Scientific validity / data |
| Status | **Dormant in the shipped UI** — moons are never rendered, listed or propagated (`const showMoons = false`, `main.ts:143`; `includeMoons: showMoons`). The defect lives in the shared catalog/model used by tests, the worker contract and any re-enable; active development (§14) shows re-activation is intended. |
| Evidence | `src/data/moons.json` (SAT441 records for Mimas…Phoebe); conversion `catalog.ts` `normalizeMoonOrbitFrame` / `basisFromSourcePole` (implements JPL's documented node convention correctly) |
| Reproduce | `evidence/scripts/moons.js`; frame test `evidence/scripts/jpl_frame_lambda.py` |
| Expected | Mean elements reproduce the ephemeris at their own epoch to within a few degrees of mean longitude |
| Actual | Error / orbit radius at 2026-09-24: Io 0.64, **Europa 1.75**, Himalia 1.15, Pasiphae 0.68, Sinope 0.62, Carme 1.43, Mimas 1.09, Enceladus 0.92, **Tethys 1.83, Dione 1.61, Rhea 1.89, Titan 2.02, Iapetus 1.88, Phoebe 1.76**, Miranda 1.54, Cordelia 0.82, Phobos 0.88, Deimos 1.23. Already **at J2000** (their element epoch): Mimas 0.84, Tethys 1.02, Dione 1.94, **Rhea 1.96, Titan 1.96**, Iapetus 1.90, Phoebe 1.84. In JPL's own Laplace frame the published SAT441 mean longitudes differ from Horizons by +46°, +6°, −61°, **−151°, −157°, −157°**, +144°, −103° (Mimas…Phoebe), while Io/Europa/Ganymede/Callisto/Phobos/Deimos agree to **≤ 0.10°** and every inclination agrees. No single epoch offset reconciles the eight (best worst-case residual 44°). |
| User impact | **None in the shipped UI** (moons disabled). If re-enabled, Saturn's moons would be placed essentially at random and the Galilean moons would drift away from J2000. |
| Scientific impact | Any moon-position statement is unsupported except for the Moon (after M-22), Ganymede, Callisto, Charon and the near-epoch Uranian majors. |
| Root cause | (1) Upstream: JPL's SAT441 mean-element rows do not reproduce the SAT441 ephemeris at the stated epoch (INFERRED; I could not find a JPL erratum). (2) Model: a linear secular Kepler model cannot track resonant or strongly perturbed satellites (Io/Europa apsidal periods 1.3–1.4 yr; outer irregulars are Sun-perturbed). |
| Minimal remediation | For the ~20 moons that matter visually, seed from Horizons state vectors at a recent epoch (as the REBOUND backend already does for planets). Document the per-moon validated envelope and hide or label the others. |
| Acceptance | Per-moon multi-epoch budgets (M-24) pass for every rendered "major" moon. |
| Effort | 2–4 d. |

##### M-24 — The moon-frame gate is structurally blind (single epoch, tolerance up to 200% of orbit radius)
| | |
|---|---|
| Severity / Confidence / Category | **Medium** (was High) · High · Test validity |
| Status | Active as a test; what it guards is dormant in the UI |
| Evidence | `scripts/fixtures/moon-frames-j2000-horizons.json` (`_epoch` = J2000 only, 20 moons); `moonFrameCheck.ts:32-41` `POSITION_TOL_OVERRIDE = { Titan: 2.0, Iapetus: 2.0, Phoebe: 2.0, Cordelia: 2.0, … }`; Rhea, Dione, Tethys and Mimas are not in the fixture at all |
| Reproduce | `npm test` → 21/21 moon tests pass; compare with M-22/M-23 tables |
| Expected | A gate that fails on the defects above |
| Actual | Passes. A mean-element model is exact at its own epoch by construction, and a 2.0 position tolerance cannot fail except on gross radial error. The comment justifying Cordelia's pin ("orbitMath.ts never reads nodePrecessionYears") is false: `ascendingNodeDegPerCentury = −60000` is applied. |
| User impact | None directly; it lets M-22/M-23 ship. |
| Scientific impact | Creates false confidence: 21 "Horizons-backed" passing tests. |
| Root cause | The planet gate's design (6 epochs + drift budget, `planetPositionCheck.ts`) was never ported to moons. |
| Minimal remediation | Multi-epoch fixture (≥ 6 epochs over ≥ 50 yr), per-moon km budgets plus a drift budget, and an explicit known-defect registry instead of 2.0 pins. |
| Acceptance | The new gate **fails on today's code** and passes after M-22/M-23. |
| Effort | 1–2 d. |

### 5.3 LOW

| ID | Finding · status | Evidence (path:line) · reproduction | Expected → actual | Root cause → remediation · acceptance · effort |
|---|---|---|---|---|
| **L-1** | Hyperbolic Lambert search bounded to z ∈ [−40, 40] · backend | `lambert.py:195-196`; `evidence/scripts/lam_hyperbolic.py` | Solution exists (Izzo: TOF 10 d → 229 km/s, 5 d → 458 km/s) → repo returns **none at any tolerance**; TOF 20 d can't converge below ~1e-3 d | Fixed grid → adaptive lower bound. Acceptance: matches Izzo for TOF ≥ 1 d. 2 h. (Low: such departures are operationally irrelevant) |
| **L-2** | `solveKeplerFast` (6 iterations, no e clamp) diverges for e ≥ 0.99 · latent | `orbitMath.ts:71-77`; callers `asteroidBelt.ts:228`, `kuiperBelt.ts:267,439`; 36,000-sample sweep | Residual at e=0.916 (shipped max) = 7.2e-11 rad → at e=0.99: **2.3e8** | Add clamp + convergence test. Becomes active if NEOs/comets are added. 1 h |
| **L-3** | Solar visuals on the wall clock, decoupled from sim time · active | `main.ts:1366-1371` (self-documented; the rate-bounded visual clock from main `56930fb` was not ported) | Warp/reverse/jump do not change solar evolution rate | Port the rate-bounded visual clock. 0.5 d |
| **L-4** | Absolute filesystem paths disclosed · backend | `/health` `initial_conditions.path`; `/benchmark/accuracy` `referenceFile`; report 400 bodies | Repo-relative → absolute server paths | Strip to relative. 1 h |
| **L-5** | Unhandled `WebSocketDisconnect` task exceptions on abrupt drops · backend | `server.py:1711` `_ws_send_loop`; server log "Task exception was never retrieved" | Clean disconnect → traceback noise (slots do recover 4/4) | Catch in send loop. 30 min |
| **L-6** | No WebGL-unavailable fallback · active | `sceneSetup.ts:155` unguarded `new WebGLRenderer`; launched with WebGL disabled | Message to user → uncaught "Error creating WebGL context", panel renders, no explanation | try/catch + visible notice. 1 h |
| **L-7** | 3D view not keyboard-operable; reduced motion affects CSS only · active | canvas `tabIndex < 0`, arrow/± keys no effect; `style.css:1303` only; `prefers-reduced-motion: reduce` → sim still +4 d/s, canvas changes | Keyboard orbit/zoom; reduced motion pauses or slows the scene → neither | Key bindings; read `matchMedia('(prefers-reduced-motion)')` in JS. 0.5 d |
| **L-8** | Non-deterministic startup, no replay controls · active | 25 × `Math.random` in shipped solar/SMBH code; start JD from `Date.now()`; `?date=`/`?seed=` ignored; frozen-clock loads differed by 1 day | Reproducible screenshots → not possible | Seeded PRNG + URL date/seed/pause. 0.5 d |
| **L-9** | One forced layout + style recalc per frame · active | CDP `LayoutCount`/`RecalcStyleCount` = 1.000/frame, 0.62 ms | Layout only on change | Throttle HUD text writes / use `textContent` diffs. 1 h |
| **L-10** | Documentation hygiene · active | 113 tracked `.md` vs 75 `.ts`; 28 root research/work-log docs; **88/109 relative links broken** (README: `main.ts`, `modelWorker.ts`, `asteroidCatalogLoader.ts` lack `src/` prefixes); 19 files contain absolute local paths | — | Move research docs to `docs/`, fix links, link-check in CI. 0.5 d |
| **L-11** | WebSocket seek has no request id; intermediate frames interleave · backend | seek to 2026 returned `[2455197.5, 2461307.5]` frames | Ack/correlation id → clients must match on `jd` (my own first harness got this wrong) | Echo a `request_id`. 1 h |
| **L-12** | `energy_error` re-baselines on every seek · backend | `rebound_nbody.py:398`; value 7.8e-16 constant after long seeks | Cumulative drift metric → per-segment only | Keep an epoch-0 reference. 1 h |
| **L-13** | Tudat SRP reported but never applied; `radiation_pressure.py`/`galactic_tide.py` dead · dormant | `tudatpy_hooks.py:182,315` (`"srp": self._enable_srp`); acceleration dict `:255-285` has only gravity; no radiation-pressure construction anywhere | `srp: true` implies SRP → not applied | Wire or remove + test. Risk rises when TudatPy is installed. 0.5 d |
| **L-14** | Third-party font request on every load · active | `style.css:1` `@import fonts.googleapis.com` | Self-hosted fonts → visitor IP sent to Google; degrades offline (falls back) | Self-host the two families. 30 min |
| **L-15** | Hard-coded backend URL; request/response casing mismatch · active | `main.ts:178-184` `DEFAULT_BACKEND_PORT = 8042`, no `import.meta.env`; `/trajectory/*` snake_case requests vs camelCase responses; no REST schema version | Configurable, consistent → neither | `VITE_BACKEND_URL`; one convention. 1 h |
| **L-16** | Asteroid "perturbation model" is cosmetically null; dead CPU belt path · active/dead | `beltRenderer.ts:22-23` scale 1e-10, age ≤ 40,000 d → Jupiter displacement ≈ 1 km; `asteroidBelt.ts:216` `propagateBeltPositions` has no callers | Visible or disclosed perturbation → neither | Remove or document; delete dead path. 1 h |
| **L-17** | GONG fetch falls back to "any FITS in the month directory"; unbounded remote read · backend | `pfss_magnetogram.py:169-192` `resp.read()` without a size cap; `matches[-1]` fallback | CR-exact map, bounded read → possible date-mismatched map, unbounded body | Require a CR match; cap bytes. 1 h |

### 5.4 Verified strengths and refuted hypotheses (do not re-report)

| Item | Verdict | Evidence |
|---|---|---|
| Frontend planet model | ✅ Faithful Standish implementation, inside JPL's published envelope 1800–2050 | §7.1; independent reimplementation agrees to 4 s.f. (09-07) |
| CPU ⇄ worker boundary | ✅ **bit-identical** float64 (70 states, 0.000 km) | §7.2 |
| REBOUND engine | ✅ 51–1,584 km at 2026, ≤ 8,291 km at 2050 vs Horizons; units AU & AU/day correct; TDB declared; epoch guard [1990, 2050] | §7.5 |
| `fetch_jpl_nbody_ephemeris.py --check` | ✅ passes against **live** Horizons | §4 #52 |
| Lambert zero-rev solver | ✅ agrees with Izzo 2015 and Gooding 1990 to < 10⁻⁶ m/s; certified residual; returns `None` if unconverged | §7.6 |
| Flyby physics | ✅ v∞ conserved to 0.41/0.60 m/s; turn limit from the incoming hyperbola | §7.7 |
| "resizeRenderer resets the drawing buffer every frame" | ❌ **Refuted** (again, now on real GPU): 0 canvas-size writes during steady state at DPR 1/2/3 | §7.8 |
| "GPU/JS resource leak over an extended run" | ❌ **Refuted**: live buffers 57→57, programs 14→14 over 3 min; heap-snapshot diff +0.10 MB retained in 240 s (JIT code/native) | §7.8 |
| Porkchop grid / float-loop termination | ✅ bounded (step clamps, 413 on oversized windows, timeout) | §9 |
| CORS default | ✅ localhost allowlist, foreign preflight rejected | §9 |
| Report write containment + overwrite guard | ✅ | §9 |
| Python dependency CVEs | ✅ none (pip-audit 2.10.1) | §9 |
| Moon-texture provenance | ✅ 9/9 local and upstream SHA-256 match | §10 |
| Catalog provenance gating + UI label (F-04 fix) | ✅ all 6 failure modes labelled correctly | §7.9 |
| Accessibility | ✅ axe-core 0 violations; visible focus; responsive; mobile drawer | §7.10 |

---

## 6. Scientific claim/evidence and units/frame/time matrix

### 6.1 Claim/evidence matrix — part A (what each subsystem computes)

| Subsystem | Active? | Purpose | Method / equations | Units | Origin | Frame | Epoch / time scale | Precision |
|---|---|---|---|---|---|---|---|---|
| Planet propagation (frontend) | Active | display positions | Standish Table 1 elements + linear rates; `M = L − ϖ`; Newton Kepler (20 it, tol 1e-9); 3-1-3 rotation | AU, AU/day, deg | heliocentric | mean ecliptic & equinox J2000 | JD 2451545.0; **expects TDB, receives UTC** | float64 |
| "Earth" (frontend) | Active | Earth position | Standish **EM-barycentre** elements used as Earth | AU | heliocentric | ecl. J2000 | as above | float64 |
| Moon propagation (frontend) | **Dormant** (`showMoons = false`) | moon positions | JPL SSD mean elements; Laplace/equatorial → ecliptic conversion; ω̇, Ω̇ only; M at 2π/P_sidereal | AU (km source) | parent-relative → world | converted ecliptic | per-record epochs (392 @ J2000, 18 @ 2020, 14 @ 2025) | float64 |
| Model worker | Active | off-thread planets/moons | same `SolarSystemModel`; `Float64Array` packing | AU, AU/day | heliocentric | ecl. J2000 | app JD (UTC) | float64 (bit-identical) |
| Asteroid belt | Active | 50,000 catalog bodies | GLSL Kepler (8 it) per vertex + a·t²·1e-10 "perturbation" | AU | heliocentric | ecliptic | SBDB osculating epochs; **float32 JD** | **float32** |
| Kuiper belt | Active | 5,000 synthetic KBOs + binaries | CPU `solveKeplerFast` (6 it); per-frame instance upload | AU | heliocentric | ecliptic | app JD | float64 → float32 buffers |
| REBOUND engine | Backend-only | N-body truth | IAS15, 41 particles (Earth + hidden Moon + planet-system barycentres), DE440 GMs | AU, AU/day on wire (AU/yr internally) | recentred particle barycentre | ecl. J2000 / ICRF | **TDB**, declared | float64 |
| Kepler ephemeris provider | Backend-only | fast planner states | two-body elements | AU, AU/day | heliocentric | ecl. J2000 | JD | float64 |
| Horizons ephemeris provider | Backend-only (default!) | "truth" for planner | HTTPS query per (body, JD) | AU, AU/day | heliocentric | ecl. J2000 | JD | float64 |
| TudatPy engine | Not installed | optional high fidelity | point mass + optional J2 (Earth, Jupiter, Saturn); RK4 fixed step; SRP *reported only* | SI → AU | SSB | J2000 | TDB | float64 |
| Lambert | Backend-only | transfer arcs | universal variables, Stumpff C/S, bracketed Illinois root; z ∈ [−40, 40]; 0-rev only | AU, day, km/s out | Sun | ecl. J2000 | JD | float64 |
| MGA | Backend-only | assisted routes | enumerate assist permutations × 8 fixed TOFs; unpowered flyby: \|v∞\| continuity (1 m/s / 1e-4) + turn limit from incoming hyperbola, r_p = R + 300 km | km/s | per-body | ecl. J2000 | JD | float64 |
| Benchmark | Backend-only | accuracy gate | compare solver Δv with GMAT/Orekit/Tudat consensus if "comparable" | km/s | — | — | — | — |
| Solar visuals (frontend) | Active | Sun rendering | procedural shaders (limb darkening, granulation, K-corona, flares), dipole+octupole magnetics, Parker spiral | visual | Sun | — | **wall clock** | float32 GLSL |
| quasi-MHD corona (backend) | Backend (UI never receives it) | coronal feature synthesis | deterministic analytic envelopes (Hathaway cycle, RTV-like scaling, CME envelope); **no MHD PDE** (self-declared) | R☉, km/s | Sun | Carrington-ish | requested JD | float64 |
| PFSS (backend) | Backend, in every `/solar/physics` | coronal B field | Altschuler–Newkirk spherical harmonics (ℓ ≤ 9–15), R_ss = 2.5 R☉, RK4 tracing | G, R☉ | Sun | heliographic | CR from JD | float64, **wrong Pₗ** |
| Realtime ingest | Backend | observational forcing | SILSO daily SSN, Helioviewer AIA, GONG synoptic (SWPC 404) | SSN, images | — | — | **current snapshot for any epoch** | — |
| SMBH / H29 / warp | Active, user-triggered | speculative visualisation | compound-front & "metric frame-dragging" formulas; ×10¹² kinematic exaggeration into planet state | cgs | galactic source | — | wall/sim | float64 |

### 6.2 Claim/evidence matrix — part B (evidence and classification)

| Subsystem | Initial-condition source | Perturbations included / excluded | Error budget (measured here) | Validation oracle | Validated envelope | Classification |
|---|---|---|---|---|---|---|
| Planets (frontend) | JPL Standish Table 1 (1800–2050); Pluto from Table 2 **without its rates** | incl. linear secular drift / excl. all periodic terms, N-body, GR | inner 245–69,513 km; outer 1.45×10⁵–6.59×10⁶ km (§7.1); +1.5–2.7×10³ km from UTC | live Horizons, 8 epochs; repo gate 6 epochs + drift budget | **1800–2050 at JPL's nominal accuracy** (Uranus/Neptune slightly outside) | **Approximation — validated** |
| "Earth" | EMB elements | — | 4,396–4,890 km offset; 12.3 m/s | Horizons `399` vs `3` | — | Approximation with a **frame defect** |
| Moons (**dormant in UI**) | JPL SSD mean-element table (16 ephemerides) | incl. linear ω̇, Ω̇ / excl. mean-longitude rate, resonances, solar perturbation | 18/26 > 0.5 a today; Moon ≤ 745,623 km; Saturn majors ≈ 2 a at J2000 | live Horizons, 6 epochs; repo gate J2000 only | **None beyond J2000** (Ganymede, Callisto, Charon, Titania acceptable) | **Approximation — not validated; partly wrong** |
| Asteroids | JPL SBDB osculating (100k, `sort=-diameter`, 2026-03-04 snapshot) | incl. two-body / excl. real perturbations (the 1e-10 term ≈ 1 km) | shader ≤ 415 km on exact JDs; **≤ 283,689 km** at arbitrary times; ACBF quantisation ≈ 19,400 km | float32 replica vs float64 Kepler | none | **Catalog observation, visualised approximately** |
| KBOs | synthetic generator (seeded) | two-body | n/a | none | n/a | **Synthetic visualisation** |
| REBOUND | Horizons DE441 geometric states at J2000 TDB (`--check` passes) | incl. Newtonian N-body of 10 barycentres + Earth + Moon / excl. GR, asteroids, J2, SRP | 51–1,584 km at 2026; ≤ 8,291 km at 2050 (Mercury, GR-dominated) | live Horizons SSB, 6 epochs | **1990–2050 (enforced)** | **Validated computation** |
| Lambert | caller states | two-body | closure ≤ 217 km at default tol (8.64 s), ≤ 4 m at 1e-8 d | Izzo 2015, Gooding 1990, own propagator, textbook Hohmann | 0-rev, elliptic and moderately hyperbolic | **Validated computation (0-rev)** |
| MGA | Kepler/Horizons states | unpowered patched conics / excl. DSMs, powered flybys, launch/capture | flyby v∞ mismatch 0.41–0.60 m/s | own v∞ recomputation | flyby step only; search not validated | **Approximation — search inadequate** |
| Benchmark | CSV "captures" of unknown generation | — | coverage 0.0 | none usable | none | **Unsubstantiated** |
| Solar visuals | procedural | — | n/a | none | n/a | **Synthetic visualisation** |
| quasi-MHD corona | analytic + optional live forcing | — | 4.6–9.4 s per request | none | n/a | **Approximation / synthetic** ("quasi-MHD" = name only; notes admit no PDE) |
| PFSS | GONG FITS or synthetic magnetogram | potential field only (by definition) | **wrong for ℓ ≥ 2** | analytic dipole/quadrupole, orthogonality | none | **Claimed physics computation — incorrect implementation** |
| Realtime ingest | SILSO, AIA, GONG (SWPC dead) | — | applied to any epoch at ≥ 25% | source-status fields (honest) | current date only | **Catalog observation, misapplied historically** |
| SMBH / H29 | literature constants + speculative model | — | ×10¹² exaggeration | none possible | n/a | **Speculative hypothesis** (now UI-labelled) |

### 6.3 Engine-boundary contract (units / origin / frame / time / precision)

| Boundary | Position | Velocity | Origin | Frame | Time scale | Precision | Verdict |
|---|---|---|---|---|---|---|---|
| `main.ts` ⇄ `modelWorker` | AU | AU/day | heliocentric | ecl. J2000 | app JD (UTC), documented as unconverted | float64 | ✅ correct, self-documenting (bit-identical outputs) |
| `SolarSystemModel` internal | AU | AU/day | parent-relative → world | ecl. J2000 | as above | float64 | ⚠️ Earth = EMB (M-3) |
| ACBF file → loader | AU (`f32 a`) | — | heliocentric | ecliptic | `f32` epoch (0.25 d spacing; committed epochs exact) | f32 / u16 quantised | ⚠️ undeclared tolerances (M-14) |
| loader → GPU shader | AU | — | heliocentric | ecliptic | **float32 absolute JD** | float32 | ❌ M-1 |
| frontend → `GET /solar/physics` | — | — | — | — | `jd` = sim JD (UTC-derived) | 8-decimal string | ⚠️ UTC passed where the backend treats JD as epoch |
| `/ws/sim` → client | AU | **AU/day** | recentred barycentre | ecl. J2000 / ICRF | **TDB**, declared per frame | float64 JSON | ✅ verified vs Horizons (Earth 30.285 vs 30.292 km/s) |
| `rebound_nbody` internal | AU | AU/yr (`units=("yr","AU","Msun")`, `rebound_nbody.py:174`) | barycentre | ecl. J2000 | TDB | float64 | ✅ converted ×365.25 at the boundary |
| `EphemerisService` → Lambert/MGA | AU | AU/day | heliocentric | ecl. J2000 | JD | float64 | ✅ |
| `tudatpy_hooks` | SI internally | SI | SSB | J2000 | TDB | float64 | ⚠️ not executable here; SRP reported-not-wired |

---

## 7. Numerical benchmark and invariant results

Truth: JPL Horizons API, `EPHEM_TYPE=VECTORS, REF_PLANE=ECLIPTIC, REF_SYSTEM=ICRF, VEC_CORR=NONE, TIME_TYPE=TDB`,
retrieved 2026-09-24T22:20:00Z (`evidence/horizons_2026-09-24.json`). Planets use `CENTER=500@10`, REBOUND uses
`500@0`, moons use `500@<parent>`.

### 7.1 Planets (frontend) and 7.2 CPU ⇄ worker

**CPU model vs real worker module** (driven in Node exactly as `main.ts:801-857` drives it): max
|Δr| over all 70 planet states = **0.000 km** — bit-identical.

#### Position error |Δr| (km) vs Horizons — frontend CPU model ≡ worker
| Body | 1800 | 1850 | 1900 | J2000 | 2026-09-24 | 2050 | 2100 | 2199-12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Mercury | 1,241 | 245 | 1,393 | 1,030 | 1,178 | 2,475 | 2,251 | 1,294 |
| Venus | 8,165 | 9,691 | 6,907 | 8,112 | 995 | 2,051 | 11,347 | 4,818 |
| Earth | 4,196 | 3,772 | 4,490 | 6,792 | 12,298 | 1,715 | 3,501 | 7,205 |
| Mars | 32,262 | 21,176 | 23,208 | 8,193 | 33,202 | 69,513 | 39,288 | 25,505 |
| Jupiter | 8.94e5 | 5.35e5 | 3.35e5 | 1.15e6 | 4.54e5 | 1.13e6 | 5.42e5 | 8.25e5 |
| Saturn | 3.62e6 | 4.23e6 | 4.4e6 | 3.85e6 | 1.82e6 | 2.99e6 | 6.2e6 | 6.59e6 |
| Uranus | 1.49e6 | 4.89e5 | 1.22e6 | 1.08e6 | 8.22e5 | 1.05e6 | 1.93e6 | 4.25e6 |
| Neptune | — | 1.45e5 | 1.04e6 | 1.1e6 | 7.07e5 | 6.47e5 | 1.85e6 | 3.79e6 |
| Pluto | — | 1.55e6 | 1.27e6 | 1.36e6 | 1.34e6 | 1.13e6 | 1.9e6 | 8.55e6 |

*1800 is unavailable for Neptune/Pluto (Horizons body-centre ephemerides begin 1800-01-02/03). 2100 and 2199 lie outside the table's 1800–2050 fit window.*

#### Velocity error |Δv| (m/s)
| Body | 1800 | 1850 | 1900 | J2000 | 2026-09-24 | 2050 | 2100 | 2199-12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Mercury | 0.79 | 0.50 | 1.37 | 0.23 | 1.16 | 2.39 | 1.86 | 0.34 |
| Venus | 2.52 | 1.96 | 1.56 | 1.30 | 0.60 | 1.15 | 2.21 | 0.36 |
| Earth | 12.48 | 13.65 | 13.74 | 12.33 | 12.06 | 12.17 | 12.65 | 12.84 |
| Mars | 2.38 | 1.46 | 1.95 | 2.08 | 3.99 | 4.60 | 2.51 | 1.28 |
| Jupiter | 8.69 | 4.37 | 11.88 | 15.14 | 5.78 | 17.37 | 9.05 | 17.92 |
| Saturn | 11.90 | 21.51 | 33.40 | 16.94 | 2.20 | 25.55 | 25.05 | 11.14 |
| Uranus | 13.01 | 6.57 | 20.38 | 18.18 | 16.98 | 16.07 | 9.65 | 9.46 |
| Neptune | — | 16.53 | 21.48 | 18.70 | 16.35 | 8.10 | 7.09 | 15.26 |
| Pluto | — | 29.84 | 23.49 | 26.50 | 34.17 | 30.50 | 34.04 | 40.00 |

*Earth's constant ~12–14 m/s is the EM-barycentre defect (M-3).*

Against **JPL's published nominal errors** for 1800–2050 (`ssd.jpl.nasa.gov/planets/approx_pos.html`: λ/ρ =
Mercury 15″/1,000 km, Venus 20″/4,000 km, EM Bary 20″/6,000 km, Mars 40″/25,000 km, Jupiter 400″/600,000 km,
Saturn 600″/1.5×10⁶ km, Uranus 50″/10⁶ km, Neptune 10″/200,000 km), the model sits inside the envelope for the
inner planets, Jupiter and Saturn, and slightly outside it for Uranus and Neptune (09-07 decomposition; code
unchanged). An independent Standish implementation reproduced the model's errors to 4 significant figures (09-07),
so **the residual is the published model's own**, not an implementation bug.

### 7.3 Time-scale and origin defects

| Test | Result |
|---|---|
| UTC-derived JD vs TDB at 2026-09-24T00:00 TDB (ΔT = 69.184 s) | Mercury 1,178 → **3,832 km**; Venus 995 → 3,340; Earth 12,298 → 14,190; Mars 33,202 → 34,710; Jupiter −529; Saturn −673 |
| Model "earth" vs Horizons `399` (Earth) | |Δv| **12.06–13.74 m/s** at all 8 epochs |
| Model "earth" vs Horizons `3` (EM barycentre) | |Δv| **0.33–1.34 m/s** → the model's Earth is the EMB |
| True Earth–EMB separation | 4,396–4,890 km |

### 7.4 Moons (26 validated, 6 epochs)

#### Moons — position error (km) vs Horizons, parent-relative (M = millions of km)
| Moon | Ephemeris | Frame | a (km) | J2000 | +30d | +1yr | +5yr | 2026-09-24 | 2050 | err/a today |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Moon | DE405/LE405 | ecliptic | 384,400 | 4,432 | 18,240 | 0.27M | 0.75M | 32,615 | 0.72M | **0.08** |
| Io | JUP365 | Laplace | 421,800 | 831 | 0.32M | 0.84M | 0.84M | 0.27M | 60,100 | **0.64** |
| Europa | JUP365 | Laplace | 671,100 | 401 | 0.49M | 1.32M | 0.68M | 1.17M | 1.01M | **1.75** |
| Ganymede | JUP365 | Laplace | 1,070,400 | 1,602 | 1,383 | 816 | 7,929 | 10,684 | 63,460 | **0.01** |
| Callisto | JUP365 | Laplace | 1,882,700 | 4,790 | 2,659 | 3,573 | 4,365 | 2,939 | 29,948 | **0.00** |
| Himalia | JUP347 | ecliptic | 11,439,000 | 0.34M | 0.43M | 0.20M | 1.59M | 13.14M | 20.91M | **1.15** |
| Pasiphae | JUP347 | ecliptic | 23,463,200 | 3.10M | 3.19M | 8.44M | 28.65M | 15.87M | 55.26M | **0.68** |
| Sinope | JUP347 | ecliptic | 23,679,300 | 1.15M | 0.50M | 1.28M | 21.69M | 14.79M | 24.02M | **0.62** |
| Carme | JUP347 | ecliptic | 23,139,200 | 1.18M | 1.08M | 9.34M | 27.56M | 33.19M | 19.44M | **1.43** |
| Mimas | SAT441 | Laplace | 186,000 | 0.16M | 40,444 | 0.12M | 38,896 | 0.20M | 0.34M | **1.09** |
| Enceladus | SAT441 | Laplace | 238,400 | 22,703 | 19,765 | 0.41M | 0.39M | 0.22M | 0.19M | **0.92** |
| Tethys | SAT441 | Laplace | 295,000 | 0.30M | 0.57M | 0.26M | 52,796 | 0.54M | 0.25M | **1.83** |
| Dione | SAT441 | Laplace | 377,700 | 0.73M | 0.74M | 0.75M | 0.35M | 0.61M | 0.62M | **1.61** |
| Rhea | SAT441 | Laplace | 527,200 | 1.03M | 1.03M | 1.04M | 1.05M | 0.99M | 1.02M | **1.89** |
| Titan | SAT441 | Laplace | 1,221,900 | 2.39M | 2.36M | 2.37M | 2.40M | 2.47M | 2.47M | **2.02** |
| Iapetus | SAT441 | Laplace | 3,561,700 | 6.75M | 6.79M | 6.81M | 6.74M | 6.69M | 6.64M | **1.88** |
| Phoebe | SAT441 | Laplace | 12,929,400 | 23.81M | 24.02M | 25.99M | 25.43M | 22.81M | 19.91M | **1.76** |
| Miranda | URA182 | equatorial | 129,846 | 2,476 | 10,687 | 95,815 | 0.25M | 0.20M | 0.25M | **1.54** |
| Ariel | URA182 | equatorial | 190,929 | 726 | 2,785 | 41,074 | 0.20M | 89,190 | 0.29M | **0.47** |
| Titania | URA182 | equatorial | 436,298 | 436 | 201 | 6,280 | 26,870 | 0.13M | 0.26M | **0.30** |
| Cordelia | URA184 | Laplace | 49,755 | 53,050 | 81,871 | 71,003 | 20,796 | 40,624 | 44,895 | **0.82** |
| Triton | NEP097 | Laplace | 354,800 | 25,064 | 25,068 | 25,688 | 37,115 | 0.12M | 90,420 | **0.34** |
| Nereid | NEP105 | ecliptic | 5,513,900 | 35,272 | 37,200 | 35,746 | 38,951 | 43,911 | 34,294 | **0.01** |
| Charon | PLU060 | equatorial | 19,600 | 28 | 13 | 8 | 30 | 29 | 7 | **0.00** |
| Phobos | MAR099 | Laplace | 9,375 | 9 | 6,032 | 12,193 | 9,375 | 8,227 | 18,361 | **0.88** |
| Deimos | MAR099 | Laplace | 23,457 | 44 | 387 | 4,393 | 21,598 | 28,767 | 44,972 | **1.23** |


**Moon with the SF-1 mean-longitude gate** (M-22): 4,432 / 3,120 / 6,276 / 4,121 / 14,791 / 26,263 km at the same
epochs; worst case **745,623 → 26,263 km (28×)**.

**Mean longitude in each moon's own Laplace frame** (node measured from the reference plane's ascending node on the
ICRF equator, per JPL's documented definition), Horizons osculating vs JPL-published at J2000:

| Moon | i Horizons / JPL (°) | λ Horizons (°) | λ JPL = Ω+ω+M (°) | Δλ (°) |
|---|---:|---:|---:|---:|
| Io | 0.05 / 0.00 | 19.90 | 20.00 | −0.10 |
| Europa | 0.46 / 0.50 | 214.42 | 214.40 | +0.02 |
| Ganymede | 0.21 / 0.20 | 221.67 | 221.60 | +0.07 |
| Callisto | 0.23 / 0.30 | 80.38 | 80.30 | +0.08 |
| Phobos | 1.06 / 1.10 | 215.16 | 215.20 | −0.04 |
| Deimos | 1.79 / 1.80 | 259.39 | 259.30 | +0.09 |
| Triton | 157.17 / 157.30 | 234.51 | 241.10 | −6.59 |
| Mimas | 1.61 / 1.60 | 188.32 | 141.90 | **+46.42** |
| Enceladus | 0.03 / 0.00 | 182.37 | 176.50 | +5.87 |
| Tethys | 1.10 / 1.10 | 187.04 | 248.30 | **−61.26** |
| Dione | 0.04 / 0.00 | 176.90 | 328.00 | **−151.10** |
| Rhea | 0.28 / 0.30 | 52.16 | 209.50 | **−157.34** |
| Titan | 0.33 / 0.30 | 11.72 | 168.60 | **−156.88** |
| Iapetus | 7.52 / 7.60 | 200.24 | 55.80 | **+144.44** |
| Phoebe | 175.23 / 175.20 | 278.14 | 21.00 | **−102.86** |
| Cordelia | 0.14 / 0.20 | 182.50 | 288.50 | **−106.00** |

The inclinations agree everywhere and the Jovian/Martian longitudes agree to ≤ 0.10°, so the **conversion code is
correct**. The SAT441 (and URA184 Cordelia) mean longitudes are not; no common epoch offset reconciles them
(best worst-case residual 44°).

### 7.5 REBOUND (live WebSocket)

#### REBOUND (live `/ws/sim`, IAS15) — heliocentric position error (km) vs Horizons
| Body | J2000 | +1 yr | 2010 | 2026-09-24 | 2050 |
|---|---:|---:|---:|---:|---:|
| Mercury | 0.0 | 57.7 | 1,822.6 | 1,058.1 | 8,291.1 |
| Venus | 0.0 | 98.8 | 900.1 | 2,425.0 | 4,532.6 |
| Earth | 0.0 | 61.0 | 612.0 | 1,583.8 | 3,052.7 |
| Mars | 0.0 | 39.7 | 342.6 | 1,035.3 | 1,804.2 |
| Jupiter | 0.0 | 0.9 | 67.9 | 126.3 | 249.2 |
| Saturn | 0.0 | 0.4 | 19.1 | 70.0 | 117.4 |
| Uranus | 0.0 | 0.3 | 4.0 | 39.9 | 171.5 |
| Neptune | 0.0 | 0.3 | 5.5 | 52.0 | 234.9 |
| Pluto | 0.0 | 0.3 | 5.3 | 50.9 | 219.5 |

Velocity error (m/s): mercury 0.0002/0.0573/1.7277/1.2860/7.4818; earth 0.0001/0.0121/0.1280/0.3253/0.6170; jupiter 0.0001/0.0000/0.0010/0.0022/0.0042; neptune 0.0001/0.0002/0.0002/0.0003/0.0004.

Seeks to 1950 and 2100 → `epoch_out_of_range` ([2447892.5, 2469807.5] TDB). A seek emits intermediate frames
(e.g. `[2455197.5, 2461307.5]`) before the target, which clients must filter on `jd` (L-11).

### 7.6 Kepler solvers and Lambert

| e | `solveKepler` worst residual (rad) | `solveKeplerFast` worst residual (rad) |
|---:|---:|---:|
| 0 – 0.8 | ≤ 8.9e-16 | ≤ 8.9e-16 |
| 0.9 | 8.9e-16 | 2.3e-12 |
| **0.916 (max shipped KBO)** | 8.9e-16 | **7.2e-11** |
| 0.95 | 8.9e-16 | 8.7e-8 |
| 0.97 | 8.9e-16 | 4.9e-6 |
| 0.99 | 8.9e-16 | **2.3e+8 (diverged)** |

(36,000 mean anomalies per row.)

| Lambert case (Sun, AU/day) | Status | Closure vs independent propagator (km) | Residual (s) |
|---|---|---:|---:|
| short way 110° | ok | 16.311 | 0.81 |
| long way 250° (prograde) | ok | 190.221 | 8.59 |
| retrograde 110° | ok | 18.596 | 0.92 |
| near-collinear 0.5° | ok | 84.806 | 5.73 |
| near-collinear 179.5° | ok | 0.004 | 0.00 |
| exactly 180° | none (plane undefined — correct) | — | — |
| 3-D, 65° transfer angle | ok | 0.000 | 0.00 |
| hyperbolic, 20 d | ok | 217.035 | 1.92 |
| 3,000 d to 5.2 AU | ok | 0.021 | 0.002 |
| TOF 0.5 d | none | — | — |
| 900 d, 90° | ok (0-rev only) | 0.002 | 0.0001 |

Default tolerance 1e-4 d → worst closure 217 km; 1e-6 d → 0.142 km; 1e-8 d → 0.004 km. **Independent library
cross-check** (lamberthub 1.0.0): |Δv₁| vs Izzo 2015 and vs Gooding 1990 = **0.000000 m/s** on all 8 geometries
solved at 1e-10 d. Multi-rev (900 d, 90°, 1.0 → 1.1 AU): departure v∞ = 33.200 (Izzo M=0 = repo), 8.138 (M=1 low),
27.070 (M=1 high), **1.373 (M=2 low)**, 19.171 (M=2 high) km/s. Hyperbolic floor: TOF 10 d and 5 d → no solution
at any tolerance or with `max_iter` 400 (Izzo: 229.5 and 458.3 km/s).

### 7.7 MGA

| Metric | Value |
|---|---|
| Plans evaluated (6 targets × 12 departures × {1, 2} assists, `max_assist`) | 144 |
| Best routes containing ≥ 1 assist | **4** (E→Mars via Saturn ×2, E→Venus via Jupiter ×2) |
| Alternatives returned / containing an assist | 664 / **0** |
| Outer-planet targets with any assist | **0 / 96** |
| Flyby v∞ mismatch, independently recomputed | 0.4143 m/s (Saturn), 0.6018 m/s (Jupiter) — equals the reported values |
| Ephemeris samples per plan (0/1/2/3 assists) | 16 / 380 / 1,312 / 1,341 |

### 7.8 Browser — real GPU (RTX 5090 via D3D12), dev server, 1600×900

| Metric | Value |
|---|---|
| Renderer | `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 5090), OpenGL 4.6)` |
| First stable frame (10 consecutive < 25 ms) | 524 ms after `load` |
| Steady state (30 s) | **59.9 FPS**; frame p50/p95/p99/max = 16.7/16.8/16.8/16.8 ms |
| Main-thread JS per frame | p50 2.4 ms, p95 2.8 ms |
| GPU time (`EXT_disjoint_timer_query_webgl2`) | p50 0.53 ms in one session, 7.4–7.6 ms (p95 ≤ 11 ms) in another — **unstable through the translation layer; report as "well inside 16.7 ms"** |
| Draw calls / instances per frame | 44 / 55,083 |
| Buffer uploads per frame | **329,632 B**, identical when paused (M-10) |
| Canvas drawing-buffer writes | 14 at startup, **0** in steady state (DPR 1, 2, 3) |
| DPR 1 / 2 / 3 canvas | 1248×900 / 2496×1800 / **2496×1800 (capped at 2)**; 59.9 FPS in all |
| Reverse max (−120 d/s), forward max, realistic scale, "now" | 59.9 FPS each; reverse moved the date 2026-08-28 → 2024-09-07 |
| Worker round-trip | p50 3.8 ms, p95 4.4 ms |
| GPU objects over 3 min | buffers 57→57, programs 14→14, textures 14→15 |
| Heap | `performance.memory` 42.7 → 55.8 MB (GC lag); forced-GC samples 40.67 → 42.36 MB / 5 min; **snapshot diff +0.10 MB retained in 240 s** (V8 code + native) → no application leak |
| Layout / style recalc | 1.000 / 1.000 per frame, 0.62 ms |
| Cold load (preview) | 10 responses, **4.38 MB** (3.5 MB catalog, 876 KB JS), **0 image files** |

The same run under Mesa llvmpipe (software; discarded as a GPU measurement) gave 6.7 FPS and 111 ms "GPU" time.
That's recorded here only to show why the renderer gate matters.

### 7.9 Catalog failure modes (real browser)

| Injected condition | `#status-catalog` | Page errors |
|---|---|---|
| normal | "Asteroids: verified Phase-1 catalog (100,000 rows, SHA-256)" | 0 |
| truncated to 1 MB | "procedural fallback (catalog load failed)" | 0 |
| one byte flipped | "procedural fallback (catalog rejected: sha256-mismatch)" | 0 |
| metadata 404 | "procedural fallback (catalog rejected: metadata-missing)" | 0 |
| binary 404 | "procedural fallback (catalog load failed)" | 0 |
| 6 s delay (load 11.5 s) | **verified** (latency logged as a warning only) | 0 |
| backend offline | verified; app fully functional | 0 |

### 7.10 Accessibility and robustness

| Check | Result |
|---|---|
| axe-core 4.10.2, WCAG 2.0/2.1 A+AA + best practice | **0 violations**, 40 passes, 2 incomplete |
| Keyboard | 11 unique stops, all with 3 px solid focus ring; canvas not focusable; keys do not orbit or zoom |
| `prefers-reduced-motion: reduce` | date still advanced 14 days in 3 s; canvas content changed |
| Responsive 1920×1080 / 1280×720 / 390×844 | no horizontal overflow; mobile hides the panel behind a toggle; 0 targets < 24 px |
| WebGL disabled | uncaught "Error creating WebGL context"; no user-facing message |
| Determinism (clock frozen, two loads) | dates differ (2026-11-01 vs 2026-10-31); `?date=`/`?seed=` ignored |

### 7.11 Asteroid numerics

| Test | Result |
|---|---|
| float32 shader replica vs float64 Kepler, 5,000 committed records, JD exactly representable | p50 77 km, p99 297 km, max 415 km |
| same at 2026-09-24 03:00 (fround(JD) − JD = −3 h) | **p50 183,898 km, p99 245,003 km, max 283,689 km** |
| 2050 / 2100 on exact JDs | max 2,618 / 7,772 km |
| uniform changes at 4 d/s, 60 fps | 160 of 600 frames |
| `validatePackedCatalogRoundTrip100k()` | `ok:false`, 99,916 mismatched; max epoch 0.125 d, angle 0.00275°, e 7.63e-6, a 1.19e-7 AU |
| committed file integrity | fnv1a32 and SHA-256 match; size 3,600,012 = 12 + 36×100,000 (09-07; unchanged) |

### 7.12 PFSS analytic checks (backend)

| Quantity | Exact | Module |
|---|---:|---:|
| P₂(0.5) / P₃(0.5) / P₄(0.5) | −0.125 / −0.4375 / −0.2891 | **−0.634 / −1.134 / −0.487** |
| ∫P₀P₂ / ∫P₁P₃ / ∫P₂P₄ (sin θ dθ) | 0 / 0 / 0 | **−0.945 / −0.621 / −0.503** |
| pure dipole → g₁₀, g₃₀ | 1, 0 | 1.000, **−2.174** |
| dipole Br(R☉, θ=0.9) | 0.622 | **3.113** |
| dipole Br(2.5)/Br(1) | 0.09302 (θ-independent) | 0.032 – 0.103 |
| Bθ/Br and Bφ/Br at the source surface | 0 | 7.7e-17 / 1.2e-33 ✅ (the boundary condition is right) |

---

## 8. Testing and coverage-gap matrix

**Totals.** Frontend: 108 tests / 7 files (all pass, identical ×3). Backend: 176 tests (all pass, identical ×3,
41–45 s) once `httpx` is added by hand. Line coverage: frontend shipped **24.4%** (all files 15.0%, because the
denominator includes 31 dormant modules and 10 scripts at 0%); backend 75% including test files, `server.py` 56%.
There is **no** CI, E2E, lint, format, type or coverage gate. The only flake candidate touching the clock/network
is `test_solar_realtime_data_cache.py`.

| Subsystem | Unit | Integration | External oracle | Line coverage | Gap that matters |
|---|---|---|---|---|---|
| Planet elements & propagation | ✅ | ✅ | ✅ Horizons, 6 epochs + drift budget | `orbitMath` 91%, `planets.ts` 100% | UTC/TDB and EMB not tested |
| `SolarSystemModel` / worker | ⚠️ contract only | ❌ | ❌ | contract 96%; **`modelWorker.ts` 0%** | worker behaviour untested (verified here instead) |
| Moons (dormant in UI) | ⚠️ | ⚠️ | ⚠️ **J2000 only**, tolerance ≤ 2.0 a | `catalog.ts` 95% | **M-22/M-23 undetectable** |
| Asteroid catalog loader + gates | ✅ (10 new tests) | ⚠️ | — | 80% | ACBF validator never run (M-14) |
| Asteroid GPU shader | ❌ | ❌ | ❌ | **0%** (`beltRenderer.ts`) | M-1 |
| Kuiper belt | ❌ | ❌ | ❌ | **0%** | M-10 |
| `main.ts`, `sunController.ts`, solar visuals, SMBH | ❌ | ❌ | ❌ | **0%** | H-1, M-9, L-3 |
| REBOUND | ✅ | ✅ | ✅ multi-epoch Horizons + `--check` | 78% | long-run energy drift |
| Lambert | ✅ | ✅ | ⚠️ reference test; no library cross-check in repo | 86% | multi-rev, hyperbolic range |
| MGA | ✅ flyby physics | ✅ | ❌ | 93% | search effectiveness (M-4) |
| Benchmark | ✅ plumbing | ✅ | ❌ **asserts coverage 0.0** | 78% | H-4 |
| PFSS | ✅ caching | ✅ | ❌ **no analytic test** | **85%** | **H-2 undetected despite 85% coverage** |
| Solar physics / realtime | ✅ | ⚠️ | ❌ | 76% / 21% | M-8, SWPC 404 |
| WebSocket resources | ✅ (new, 192 lines) | ✅ | — | — | lock-out (M-5) |
| Server security | ⚠️ validation | — | — | `server.py` 56% | XFF, body size, reflection, starvation |
| Tudat hooks | ⚠️ | ❌ | ❌ | 31% | SRP not wired |
| `radiation_pressure`, `galactic_tide` | ❌ | ❌ | ❌ | **0%** | dead |
| Browser E2E | ❌ | ❌ | ❌ | — | none exists (Playwright works fine here) |

**Tautological or weakened tests.** `test_benchmark_accuracy.py:23` asserts the production zero-coverage state and
would fail if the benchmark were fixed. Commit `a864ea4` ("remove assertions superseded by Horizons gates")
deleted 235 lines from `catalog.test.ts`, including a moon frame-conversion test, and a secular-drift test from
`orbitMath.test.ts`. The Horizons gate that "supersedes" them is the single-epoch moon gate (M-24).

---

## 9. Security and deployment-readiness assessment

Rated for the **documented** posture: `uvicorn server:app --host 0.0.0.0 --port 8042 --reload` (README:66;
`server.py:1889` `uvicorn.run(... host="0.0.0.0", reload=True)`), i.e. a dev server exposed to the LAN.

| # | Area | Finding | Severity | Status vs 09-07 |
|---|---|---|---|---|
| S-1 | Authentication | none on any route or on `/ws/sim`; optional API key for solar routes only (`server.py:188,332`) | High if exposed | unchanged |
| S-2 | WebSocket Origin | ✅ forged/`null` → 403 (`server.py:443`); Origin-less allowed by design | — | **fixed** |
| S-3 | WebSocket capacity | global cap 4 → unauthenticated lock-out (M-5); 403 masks 1013 | Medium | **new** |
| S-4 | Upstream fan-out | 1,312–1,341 Horizons calls per plan; no shared cache (H-3) | High | unchanged (corrects C-3) |
| S-5 | Compute timeouts / pool | plan & lambert sync, no timeout; `/health` starved **17 s** (H-3) | High | now **proven** |
| S-6 | Rate limiting | bypassed via spoofed `X-Forwarded-For` (M-6) | Medium | **new** |
| S-7 | Request size / reflection | no body limit; 422 echoes 64 MB (M-7) | Medium | **new** |
| S-8 | CORS | ✅ localhost allowlist; `allow_credentials=True` would be dangerous only with `*` | Low | unchanged |
| S-9 | Path containment | ✅ report writes contained; overwrite guard incl. dangling symlinks | — | unchanged |
| S-10 | Path disclosure | absolute paths in `/health`, benchmark, 400 bodies (L-4) | Low | unchanged |
| S-11 | Input validation | ✅ strict Pydantic (`extra_forbidden`, `FiniteFloat`); no tracebacks returned | — | unchanged |
| S-12 | Porkchop | ✅ bounded, timed out, 413 on oversize | — | unchanged |
| S-13 | Remote reads | GONG FITS read unbounded + gzip (L-17); Horizons per request | Low | new detail |
| S-14 | Production config | `0.0.0.0` + `reload=True` documented; no TLS, proxy or deployment guidance | High if exposed | unchanged |
| S-15 | Supply chain (npm) | 9 dev-only vulns (1 critical) (M-20) | Medium | +1 moderate |
| S-16 | Supply chain (Python) | ✅ pip-audit clean; ⚠️ unpinned floors, no lockfile, drift observed (M-16) | Medium | now scanned |
| S-17 | Secrets | ✅ none in tracked files (regex scan; gitleaks unavailable) | — | unchanged |
| S-18 | Privacy | Google Fonts contacted on every load (L-14) | Low | new |

**Verdict: acceptable only as a `127.0.0.1`-bound single-user tool.** Before any network exposure: S-1, S-3, S-4,
S-5, S-6, S-7 and S-14 are prerequisites.

---

## 10. Data, asset, licence and reproducibility assessment

| Artifact | Size | Provenance recorded | Integrity | Regeneration (this audit) | Reproducible? | Licence |
|---|---:|---|---|---|---|---|
| `asteroid_phase1_main_100000.bin` + meta | 3.5 MB | ✅ exemplary (endpoint, fields, sort, limit, filters, `generated_utc`, counts, 2 checksums) | ✅ both checksums verified | rebuilt → **not byte-identical**; 703 in/out; all re-epoched; script crashes when output is outside the repo | ❌ mutable upstream, no raw snapshot | JPL SBDB (public domain, not stated) |
| `src/data/moons.json` | 221 kB | ⚠️ per-record ephemeris/epoch; no retrieval date; `reference: "n/a"` | ❌ no checksum | `update:moons` → **460 vs 424** | ❌ | JPL SSD (not stated) |
| `backend/data/ephemerides/*.json` + `tests/fixtures/nbody_horizons_validation.json` | small | ✅ exemplary (dataset id, DE441, provider, API version, retrieval UTC) | ✅ | `fetch_jpl_nbody_ephemeris.py --check` **passes live** | ✅ **verifiable** | NASA/JPL |
| `scripts/fixtures/planet-positions-horizons.json`, `moon-frames-j2000-horizons.json` | small | ✅ query + retrieval date | — | — | ✅ (query recorded) | NASA/JPL |
| `backend/benchmark/artifacts/*.csv` (9) | 2 kB | ❌ no inputs, kernels, solver settings, logs; one timestamp for all 9 | ✅ 9/9 sha256 | ❌ impossible | ❌ | unknown |
| `src/data/stars_catalog.json` | 172 kB | ❌ **no metadata at all** (bare list of 5,042) | ❌ | `fetch_gaia_catalog.py` exists (Gaia TAP) | ❓ | d3-celestial (BSD-3) and/or Gaia (attribution required) — **unverifiable** |
| `public/textures/moons/*` (9) + attribution JSON | 1.5 MB | ✅ exemplary per-file provider, dataset, URL, licence, sha256 | ✅ 9/9 local **and upstream** sha match | `ingest-moon-textures.mjs` **broken** (stale `.js` import) | ✅ via URLs | 8 × USGS public domain; **Deimos "Unspecified — verify"** |
| `src/assets/textures/*` (25) | **39 MB** | ❌ none | ❌ | ❌ | ❌ | ❌ unknown — and **unused at runtime** |
| `public/solar-systems/manifests/*.json` (3) | 12 kB | ⚠️ | — | — | ⚠️ | unknown |
| Root `debug_screenshot*.png` | 545 kB | — | — | — | — | hygiene |
| **Repository** | — | — | — | — | — | ❌ **no LICENSE**; depends on GPL-3.0-only REBOUND |

**Deterministic algorithm vs reproducible artifact.** The builders are deterministic given their inputs, but the
inputs (SBDB, the SSD satellite table) are mutable APIs and the raw responses are not committed. So none of the
catalog artifacts can be reproduced byte-for-byte. The ephemeris pipeline is the model to copy: it records the
exact query and offers a `--check` mode that passes against live Horizons.

---

## 11. Prioritised remediation roadmap

### P0 — correctness, safety and legal (before further feature work)

| ID | Action | Measurable acceptance criterion | Effort |
|---|---|---|---|
| P0-1 | **H-1** Quantise `jd` + server response cache; client timeout > server p95 (or async 202+poll); cancel orphaned work; add `:4173` to CORS; UI "solar data" status | ≥ 95% `/solar/physics` 200s over 5 min from both `npm run dev` and `npm run preview`; ≥ 1 AIA tile loaded; status element reflects source | 1–2 d |
| P0-2 | **H-2** Fix `_associated_legendre` normalisation; analytic PFSS tests | Exact Pₗ at sample points; orthogonality to 1e-10; dipole/quadrupole round-trip to 1e-6; Br(2.5)/Br(1) = 0.09302 / 0.04238 | 0.5–1 d |
| P0-3 | **H-5** LICENSE (GPL-3.0-compatible if backend is distributed); delete or manifest `src/assets/textures`; resolve Deimos; star-catalog provenance | CI asset-manifest check passes; LICENSE present | 0.5 d + owner decision |
| P0-4 | **H-3** Async trajectory handlers with timeout + outbound budget; shared LRU/TTL ephemeris cache; async `health/info/bodies` | Simulated slow upstream: `/health` p99 < 50 ms under 100 concurrent plans; plan ≤ 30 s or 504 | 1–2 d |
| P0-5 | **M-6, M-7** Trusted-proxy XFF handling; 64 kB body limit; 422 without `input` | Rotated XFF → 429 after limit; 1 MB body → 413; 422 bodies < 2 kB | 3 h |
| P0-6 | **H-6** README rewrite for the shipped product | Doc test: every README control ID exists in `index.html`; every route is in the bundle or listed as backend-only | 0.5 d |

### P1 — scientific credibility and engineering hygiene

| ID | Action | Acceptance | Effort |
|---|---|---|---|
| P1-0 | **M-22 + M-24** (dormant until moons are re-enabled; do this first) Per-ephemeris mean-longitude gate (DE405/LE405 only) + multi-epoch moon gate | Moon < 30,000 km at 6 epochs over 50 yr; new gate fails on today's code; no other validated moon regresses > 10% | 2–3 d |
| P1-1 | **M-23** Seed major moons from Horizons state vectors at a recent epoch; label the validated envelope | every rendered major moon inside its multi-epoch budget | 2–4 d |
| P1-2 | **H-4** `null` metrics when nothing is comparable; drop "strict"; fixed-state Lambert references (e.g. Izzo via lamberthub) | `validationCoverage ≥ 0.8` with the real solver | 1–3 d |
| P1-3 | **M-1** float64 CPU-computed `uDeltaDays` for the belt shader | replica error < 1,000 km at arbitrary times; uniform changes every frame | 2–4 h |
| P1-4 | **M-2, M-3, M-15** UTC→TDB; EMB → Earth/Moon split; Pluto rates | Mercury < 1,500 km today; Earth Δv < 2 m/s at 8 epochs; Pluto ≤ 2× tabulated reference | 0.5 d |
| P1-5 | **M-5** Per-client WS quota + session lifetime; 1013 after accept | 4 hostile clients cannot block an allowlisted client > 60 s | 0.5–1 d |
| P1-6 | **M-8** Apply live solar data only near the wall-clock date | `|jd − now| > 30 d` ⇒ `applied: false` or archival value | 0.5 d |
| P1-7 | **M-9** Render-only warp offset; banner while active | model state unchanged by warp | 0.5 d |
| P1-8 | **M-11, M-12** CI (`typecheck && test && build`), shipped coverage ≥ 60%, one Playwright E2E | CI blocks merge; E2E asserts FPS and status labels | 4–7 d |
| P1-9 | **M-13, M-14, M-16, M-17, M-18, M-20** Snapshot raw upstreams; fix the ACBF validator and run it; `requirements-dev` + lockfile; fix scripts; SWPC; `npm audit fix` | rebuild from snapshot byte-identical; validator green in CI; clean-venv `pytest` passes; 0 critical/high npm | 2 d |

### P2 — capability, performance, polish

| ID | Action | Acceptance | Effort |
|---|---|---|---|
| P2-1 | **M-4** Continuous flyby-date/TOF optimisation (v∞-matching root solve), optional powered flyby, time/path penalties | Galileo-like E→V→E→J and Cassini-like E→J→S windows found | 3–5 d |
| P2-2 | **M-19, L-1** Multi-rev Lambert (Izzo 2015); adaptive hyperbolic bound | agrees with Izzo for M = 0…2 and TOF ≥ 1 d | 1–2 d |
| P2-3 | **M-10, L-9, M-21** KBO dirty-check or GPU path; throttle HUD writes; uniform catalog sampling | 0 B/frame when paused; layout only on change; rendered diameter distribution within 10% of corpus | 1 d |
| P2-4 | **L-3, L-6, L-7, L-8** Visual clock; WebGL fallback; keyboard camera + JS reduced motion; seeded/URL-driven replay | reduced motion slows or pauses the scene; reproducible screenshots from `?date=&seed=` | 1–2 d |
| P2-5 | **L-2, L-4, L-5, L-10 – L-17** hygiene items | per item (§5.3) | 2 d |

---

## 12. Weighted scorecard

Scores credit only what was tested. Absent optional components (TudatPy) are excluded, not penalised.

| Dimension | Weight | Score | Coverage / confidence | Basis |
|---|---:|---:|---|---|
| Functional / runtime correctness | 15 | **9.0** | **High** — real GPU browser, 6 failure modes, live backends | Runs clean at 60 FPS with honest catalog provenance and graceful degradation (+). The **only** backend integration fails 100%; advertised moons absent; warp writes model state; UTC time source (−). |
| Scientific / numerical validity | 25 | **11.0** | **High** for planets, moons, REBOUND, Lambert, flyby, PFSS, GPU precision (all independently measured); Medium for solar synthesis | Validated: planets (JPL envelope), REBOUND 1990–2050, Lambert vs Izzo/Gooding, flyby v∞. Invalid or unvalidated: PFSS Legendre, the dormant moon model (18/26), benchmark 0.0, EMB, float32 belt, historical solar blending, inert MGA, no multi-rev. |
| Testing / reproducibility | 15 | **6.0** | **High** — coverage and ×3 determinism measured; datasets regenerated | 284 deterministic tests and exemplary planet/REBOUND gates (+). Shipped coverage 24%, blind moon gate, zero-asserting benchmark test, failing un-run ACBF validator, fresh-install `pytest` fails, non-reproducible datasets, no CI (−). |
| Architecture / maintainability | 10 | **4.5** | **High** — sourcemap reachability | Clean worker contract and module boundaries (+). 31 dormant production modules, 1,454-line entry point, backend disconnected from the UI, dead backend modules and CPU belt path (−). |
| Performance / scalability | 10 | **7.0** | **High** on real GPU (translation-layer caveat) | 59.9 FPS, p99 16.8 ms, JS 2.4 ms, no leak, DPR capped, no resize resets (+). 19.8 MB/s pointless uploads, 1 layout/frame, 5–9 s solar compute, ~1,300 upstream calls per plan (−). |
| Security / operations | 10 | **4.5** | **High** — live attacks on disposable instances | Origin fixed, CORS sound, bounded porkchop, path containment, strict validation, pip-audit clean (+). No auth, WS lock-out, XFF bypass, 64 MB reflection, proven pool starvation, `0.0.0.0 --reload` docs (−). |
| Data provenance / licensing | 10 | **4.5** | **High** — every checksum verified, regenerated, upstream URLs re-fetched | Exemplary asteroid meta, ephemeris `--check` and moon-texture manifest (+). No LICENSE + GPL dependency, 39 MB unmanifested unused textures, Deimos, no star provenance, implausible benchmark provenance, non-reproducible catalogs (−). |
| Documentation / accessibility | 5 | **2.5** | **High** | axe-core 0 violations, focus rings, responsive and mobile layout (+). README describes a different product (17/42 false, 2 stale), 88 broken links, keyboard-inaccessible canvas, reduced motion ineffective on the scene (−). |
| **Total** | **100** | **49.0** | **Overall coverage: High** (see §13 for gaps) | 2026-08-23: 36 · 2026-09-07: 46 · **2026-09-24: 49** |

The +3 over 09-07 nets real improvements (+ accessibility, + catalog honesty, + Origin fix, + flyby physics,
+ confidence from real-GPU measurement) against defects that the deeper checks surfaced this time (H-1, H-2,
Saturn's elements, EMB, the float32 belt, payload reflection, XFF bypass).

---

## 13. Audit limitations and blocked checks

### Blocked
| Check | Reason |
|---|---|
| TudatPy engine execution | not installed (conda-only). Force-model wiring verified by code read only (L-13). |
| GMAT / Orekit / Tudat reference re-runs | no inputs, scripts, kernels or settings exist in the repository (H-4). |
| Native-driver GPU timings | GPU reached only through Mesa d3d12 (GL→D3D12). Timer-query values varied between sessions (0.53 ms vs 7.5 ms p50), so GPU cost is reported as a range. |
| gitleaks / trufflehog / semgrep | not available; regex secret scan used instead. |
| Horizons 1800 epoch for Neptune/Pluto | body-centre ephemerides start 1800-01-02/03; the epoch was skipped for those two bodies. |

### Not run (deliberate or out of time)
- **Multi-hour soak** (heap plateau, REBOUND long-run energy drift — `energy_error` resets on seek anyway).
- **PFSS end-to-end with real GONG data** — responses reported a synthetic magnetogram; the Legendre defect is independent of the input.
- **Mission agents** (mining/logistics/risk), **backend Kuiper module** and **nearby-systems catalog values** were not re-validated numerically in this pass (coverage only: 88–100%, 94%, 84%).
- The two axe-core "incomplete" items were not reviewed manually.
- The `update:moons` by-name diff (167 added / 131 removed) was not checked per record; element values of common moons are identical.
- No real internet-exposed deployment, TLS or reverse-proxy configuration was tested.

### Method caveats and self-corrections
- **Single auditor.** This session is not permitted to use subagents, so there was no independent adversarial
  pass. To compensate, every material number was re-derived with a second method where possible (independent
  propagators, a second Lambert library, frame-independent checks), and these **five errors of my own were caught
  and discarded before reaching any finding**:
  1. REBOUND "10⁸–10⁹ km errors" — my harness read intermediate seek frames (now filtered on `jd`).
  2. `solveKeplerFast` "NaN/∞ residual at e=0" — my `Math.abs(r) || Infinity` bug.
  3. "111 ms GPU time on the RTX 5090" — that run had fallen back to llvmpipe (runs are now gated on the renderer string).
  4. "~20 MB/h JS heap leak" — refuted by a heap-snapshot diff (+0.10 MB retained).
  5. **Moon findings first rated High as active.** My harness itself set `includeMoons: true`; the shipped app sets
     `showMoons = false`. Caught while validating the mid-audit commit, and corrected by moving them to Medium/dormant (§5.2).
- Eight claims in my own 2026-09-07 report are corrected in §1.4.
- **Side effects outside the worktree:** headed Chromium windows opened briefly on the WSLg desktop; three
  disposable backend instances (:8055, :8042, :8061) and dev/preview servers ran during the audit and were
  stopped afterwards; ~1,400 Horizons requests, 1 SBDB query and 9 USGS/Solarviews downloads were made. The
  repository's tracked files were not modified; the worktree was removed.

---

## 14. Addendum — commit `bd48a7d` landed during the audit

`bd48a7def2d83bce886147d1de5f40a0b343cf74` ("fix: validate and correct major moon ephemerides", 2026-09-24 23:10 UTC,
31 files, +5,331/−256) was committed and pushed while this audit was running (the audit started 22:15 UTC on
`9418652`). **Everything above describes `9418652`.** I re-measured the affected areas at `bd48a7d` with the same
harness and the same Horizons truth; nothing else was re-audited.

| Check at `bd48a7d` | Result | Effect on findings |
|---|---|---|
| `npm test` / `npm run typecheck` / `vite build` | **136/136** pass (11 files) · 246 errors (unchanged) · 44 modules, JS 904.92 kB (+8.4 kB), worker 25.34 kB | M-11 unchanged |
| Moons still hidden? | yes — `const showMoons: boolean = false` (`main.ts:147`); the 4.1 MB Chebyshev JSON is behind a dynamic import that is tree-shaken out | M-22/M-23/M-24 stay **dormant** |
| **M-2 UTC→TDB** | **Fixed.** `currentJulianDate()` now returns `utcJulianDateToTdb(…)` (leap-second table 1972–2017 + Fairhead–Bretagnon TDB−TT). The app clock equals TDB at the instant to **0.000 s**; Mercury **3,832 → 1,178 km**, Venus 3,340 → 995 km | M-2 → **resolved** |
| M-3 Earth = EMB | **Not fixed** — |Δv| vs `399` 12.33 m/s, vs EMB 0.58 m/s at J2000 | M-3 unchanged |
| **Moon (SF-1)** | **Fixed** — 0.008–0.068 orbit radii over all 6 epochs (worst 26,263 km), identical to the gated values in M-22 | M-22 → resolved (in dormant code) |
| **Titan, Iapetus, Phoebe, Cordelia** | Chebyshev fits to Horizons osculating states, 0.5-day segments, JDTDB 2000–2050 → **0.000–0.002 a** (expected: the fit *is* derived from the oracle). Outside coverage the runtime **refuses** the known-bad fallback (`state-unavailable-required-ephemeris-missing`) — sound design | M-23 partly resolved |
| Other moons (native Laplace/equatorial-frame precession, `sourceFrameOrbit.ts`) | improved at 2026-09-24: Mimas 1.09→0.43 a, Enceladus 0.92→0.09, Tethys 1.83→0.97, Miranda 1.54→0.01, Deimos 1.23→0.97 | — |
| **Still > 0.5 orbit radius at 2026-09-24** | **11 of 26** (was 18): Io 0.65, Europa 1.75, Himalia 1.15, Pasiphae 0.68, Sinope 0.63, Carme 1.44, Tethys 0.97, **Dione 1.94, Rhea 1.96** (≈ 1.94–1.96 at *every* epoch, incl. J2000), Phobos 0.87, Deimos 0.97 | M-23 persists for these |
| New moon gate | `moon-positions-horizons.json`: **20 moons × 7 epochs** (J2000, +30 d, +180 d, +1 yr, +5 yr, 2025-01-01, 2026-01-01; corrected 2026-09-25 from “4 epochs”) plus a named blind-spot registry replacing the 2.0 pins | M-24 largely addressed — but the fixture still **omits Rhea, Dione, Tethys, Mimas, Phobos and Deimos**, i.e. the moons that remain wrong |
| README | now documents the fitted-ephemeris provenance, coverage and fallback semantics | H-6 improved; still advertises "424 moons" while the UI shows none |

**Indicative effect:** at `bd48a7d` the scientific and testing scores would each rise by roughly 0.5–1 point
(≈ 50–51/100). The score in §12 deliberately stays with the audited commit.

---

## Appendix A — Reproducing the headline results

```bash
# Toolchain (host has no node/npm on PATH)
curl -sSL -o node.tar.xz https://nodejs.org/dist/v22.22.1/node-v22.22.1-linux-x64.tar.xz && tar xf node.tar.xz
export PATH=$PWD/node-v22.22.1-linux-x64/bin:$PATH
python3.12 -m venv venv && venv/bin/pip install -r backend/requirements.txt   # then: pip install httpx (undeclared)
git worktree add --detach /tmp/wt 941865211f20d9535f6ffeec3a0321395fbfb344 && cd /tmp/wt && npm ci

# Baseline
npm run typecheck                       # exit 2, 246 errors
npx vite build --outDir /tmp/dist --sourcemap
npm test                                # 108 passed
(cd backend && ../venv/bin/python -m pytest -q)   # collection error until httpx is installed; then 176 passed

# H-1  solar physics never reaches the UI (backend on :8042 with defaults, then `npm run dev`)
curl -s -o /dev/null -w "%{time_total}s\n" \
  "http://127.0.0.1:8042/solar/physics?jd=2461448.9&fidelity=high&max_features=180&forcing=hybrid&live_data=true"   # 4.6–9.4 s vs 2.6 s client timeout
grep -n "timeoutMs: 2_600" src/sunController.ts

# M-22 / M-23 / M-2 / M-3  (Horizons truth in the evidence dir)
node evidence/scripts/planets.js ; node evidence/scripts/moons.js

# H-2  PFSS Legendre functions
cd backend && ../venv/bin/python -c "
import numpy as np; from sim import pfss_magnetogram as P
x=np.array([0.5]); L=P._associated_legendre(4,x); print({k:float(L[(k,0)][0]) for k in range(5)})"
# expect P2=-0.125, P3=-0.4375; module gives -0.634, -1.134

# H-3  fan-out per plan (kepler provider, instrumented)   -> 1312 samples at max_assists=2
# H-4  curl -s :8042/benchmark/accuracy | python -m json.tool | head -20
# M-1  node evidence/scripts/gpu.js
# M-6  for i in $(seq 40); do curl -s -o /dev/null -w "%{http_code} " -H "X-Forwarded-For: 198.51.100.$i" \
#        ":8042/solar/physics?jd=2461307.5&fidelity=preview&max_features=64"; done   # all 200
# M-7  64 MB JSON to /trajectory/plan -> 422 with a 64,000,110-byte body
```

## Appendix B — Evidence index (`CODEBASE_AUDIT_2026-09-24_EVIDENCE/`)

| Path | Content |
|---|---|
| `logs/00-versions.log` … `logs/16-update-moons.log` | exact outputs of every baseline command (npm ci/ls/typecheck/build/test/audit, pip freeze, pytest with and without httpx, compile, pip-audit, coverage, regenerations, ephemeris `--check`) |
| `horizons_2026-09-24.json` | all Horizons truth vectors used (planets, SSB, EMB, 26 moons) |
| `results/*.json` | planets, moons, REBOUND, Lambert, lamberthub cross-check, MGA, GPU replica, heap diff, browser runs (preview, dev, battery, a11y), benchmark output |
| `scripts/` | every harness: `instrument.js`, `core.mjs`, `battery.mjs`, `a11y.mjs`, `heapdiff.mjs`, `net.mjs`, `planets.js`, `moons.js`, `gpu.js`, `reb2.py`, `lam.py`, `fetch.py`, `sitecustomize.py` (simulated slow upstream), `pfss_check.py`, `jpl_frame_lambda.py`, `mga_search.py`, `ws_lockout.py`, `xff.py`, `lam_hyperbolic.py` |
| `screenshots/` | responsive layouts and the WebGL-disabled page |
