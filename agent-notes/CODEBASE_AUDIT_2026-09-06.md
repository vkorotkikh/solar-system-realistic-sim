# Codebase audit — consistency, logic bombs, documentation, typestrings, mathematics, physics

> **Historical snapshot — not current branch status.** This report records the working tree examined on 2026-09-06. Re-run its checks before treating any verdict as current.

| Item | Value |
|---|---|
| Date | 2026-09-06 |
| Repo | `solar-system-realistic-sim` |
| Pass A | 30 Grok 4.6 xhigh-fast auditors, 6 squads of 5 (2026-09-04) |
| Pass B | 45 Grok 4.6 xhigh-fast auditors, 9 squads of 5 (2026-09-06), mathematics and physics weighted |
| Mode | Read-only. No code was changed by the auditors. |
| Relation to older notes | Independent re-read of current source. Pin-dated 2026-08-23/24 audits are **historical**; several of their “NOT FIXED” items are already closed (see §5). |

**Status terms**

- **LIVE** — reachable from `index.html` → `src/main.ts` or from a backend route the shipped UI or `dev:full` actually hits.
- **LATENT** — real defect in a complete module that `main.ts` does not import (Connect / planner / nearby / satellites).
- **DOCS** — operator-facing claim that is false or stale.
- **RESOLVED** — mechanism removed and a regression gate exists, or the old report is simply wrong at HEAD.

---

## 1. Verdict

The **shipped product** is a Sun-Focus Kepler UI. Most of the workbench the root README describes — N-body Connect, mission planner, 424 rendered moons, nearby-system navigation, 1.9M catalog particles, survey-grade stars — is **library code, not mounted**.

The live path still has real bombs:

1. H29 warp writes the same `SolarSystemModel` world positions the Kepler/ephemeris display uses.
2. Moon secular rates still double-count apsidal precession (the planet `Ldot` fix was never applied to moons). Hidden today because `showMoons = false`.
3. Backend solar physics is Z-up; the sun mesh/shader is Y-up. AIA tiles are fetched without the sim JD.
4. Earth/Mars quadtree shaders `normalize` a planar origin vertex (NaN) and split/merge can drop tiles forever.
5. Mission rocket-equation / risk / EPO and MGA |v∞| are physically invalid on the backend API.

Backend pytest and frontend Vitest can stay green through those. Strict TypeScript is **not** a release gate (~280–320 errors). Python has **no** mypy/pyright config.

---

## 2. Cross-cutting root causes

Fix once. Many squad IDs are aliases of these.

| ID | Root cause | Live? | Primary evidence |
|---|---|---|---|
| R-01 | README / feature docs describe a workbench `main.ts` does not ship | DOCS | `README.md` vs `src/main.ts` imports and `index.html` controls |
| R-02 | Frontend Julian date is Unix/UTC; REBOUND / WS clock is TDB (~69 s) | LIVE clock; WS LATENT | `julianDateFromUnixMs`; `STATE_JD_TIME_SCALE = "TDB"` |
| R-03 | Kepler heliocentric, Sun at origin vs N-body barycentric COM | LATENT until Connect | Worker `heliocentric_ecliptic_j2000` vs Rebound `barycentric` |
| R-04 | Same id `earth` is Standish EMB in Kepler and Horizons 399 in N-body | LIVE Kepler | `planets.ts` Standish Table 1 vs IC `399` |
| R-05 | Earth Moon is `moon-earth-moon` in the catalog and `moon` in N-body | LIVE / LATENT | `makeMoonId` vs `REQUIRED_DYNAMICAL_BODY_IDS` |
| R-06 | `SimulationClient`, `createAnimationLoop`, engine `kepler` are not in `main.ts` | LATENT | Zero importers; server engines are `rebound` \| `tudatpy` |
| R-07 | H29 `applyMetricKinematics` on the realistic Kepler/worker tick | **LIVE** | `main.ts` ~730–743; `modelWorker.ts`; `1e12` exaggeration |
| R-08 | Planet `Ldot − ϖdot` never applied to moons | Armed; moons off | `orbitMath.ts` + `resolveMoonSecularRates` |
| R-09 | AIA `image_id` ignored; tile URL omits `jd` | **LIVE** | `solarObservationTexture.ts` vs `GET /solar/realtime/aia-tile` |
| R-10 | Quadtree `normalize(0)` + split/merge drops parent mesh | **LIVE** Earth/Mars | `planetShaders.ts`, `quadtreeLOD.ts` |
| R-11 | Mission mass-flow ignores cargo; risk can stay 0.0 on unmet Δv | Backend API | `vehicle_service.py`, `mining_service.py`, `risk_service.py` |
| R-12 | MGA accepts powered flybys as free assists; 48-route cap skips Venus | Backend API | `mga.py` `_evaluate_flyby`, `MAX_COMPLETED=48` |
| R-13 | Backend solar Cartesian is Z-up; Three.js sun is Y-up | **LIVE** | `solar_physics.py` vs `sunVisuals.ts` |
| R-14 | PFSS cache keyed only by Carrington rotation; GONG sine-lat → uniform θ | **LIVE** if backend up | `pfss_magnetogram.py` |
| R-15 | Dual catalogs (`planets.ts` / `bodies.py` vs `NAMED_ASTEROIDS` / phase-1) | **LIVE** belt | Pallas ΔM ~180°; missing 100k `.bin` |
| R-16 | Fail-open validation (health always ok; `engine=kepler` → Rebound; live-data flag without fetch) | Backend | `server.py` |
| R-17 | Types and schemas do not match runtime (HTTP vs `parse_mission_request`; `any` / `Dict[str, Any]`) | LIVE + LATENT | `schemas.py`, `main.ts`, solar client |
| R-18 | Tests assert the wrong thing or mock the quantity they claim to prove | CI | Lambert accuracy mocks Lambert; moon pins 180° / 200% |

---

## 3. Priority ledger (Pass A, unique)

### 3.1 Critical

| # | Finding | Path | Why it matters |
|---|---|---|---|
| C1 | H29 warp mutates Kepler `worldPosition` (×10¹²), no realistic-mode gate | `src/main.ts`, `src/workers/modelWorker.ts`, `src/sim/solarSystemModel.ts` | One UI click displaces the ephemeris display. Pause still walks under metric shift (wall-clock `dt`). |
| C2 | Moon *M* advances as sidereal *n* **plus** ω̇/Ω̇ | `src/sim/orbitMath.ts`, `src/sim/catalog.ts` | ~40°/year along-track on Luna (~2.7×10⁵ km/y). Invisible at J2000; moon Horizons gate is J2000-only. |
| C3 | Mission rocket equation never carries mined cargo; return propellant subtracted from ore **and** score; failP = 0.0 at 6.3 km/s short | `backend/mission/vehicle_service.py`, `mining_service.py`, `risk_service.py`, `agents.py` | Infeasible heavy-return missions look closed. EPO `DemoVerifier` reads `result["verification"]` instead of `recommendation.verification` and rubber-stamps with no family policy. |
| C4 | MGA \|v∞_in\| ≠ \|v∞_out\| still `feasible`; cost omits the powered burn | `backend/trajectory/mga.py` | Earth→Jupiter→Mars: 2.30 km/s mismatch, 22.9 km/s fake “assist gain.” `max_assist` ranks it over a cheaper direct. |
| C5 | Quadtree vertex shader `normalize(position)` on `PlaneGeometry` including (0,0,0); `split()` then `merge()` never re-adds the mesh | `planetShaders.ts`, `quadtreeLOD.ts` | NaN vertices; Earth/Mars tiles vanish until reload; patches can sit ~0.5 AU off-node. |

### 3.2 High — live Sun-Focus path

| # | Finding | Path |
|---|---|---|
| H1 | Solar physics vectors Z-up (`x=cos λ cos φ`, `z=sin λ`); mesh Y-up (`asin(normal.y)`). Arcs copied as `(x,y,z)*R` with no remap | `solar_physics.py`, `sunVisuals.ts`, `solarMagnetics.ts` |
| H2 | AIA proxy URL sends `image_id` (ignored) and no `jd`; `latest_aia_tile(jd=None)` is wall-clock | `solarObservationTexture.ts`, `server.py` |
| H3 | Client poll 900 ms (~67/min) vs server 36/60 s → 429; client timeout 2.6 s vs server 12 s | `sunController.ts`, `solarPhysicsClient.ts` |
| H4 | Default-scale CME lifetime `(0.3 − R_display)/v` with `R_display ≈ 0.375 AU` → negative life → expire immediately | `solarFlares.ts` |
| H5 | Flare sprite `z = −r cos lat sin lon` vs surface `+sin lon` — opposite hemispheres | `solarFlares.ts`, `sunVisuals.ts` |
| H6 | PFSS cache key = Carrington rotation only; GONG sine-lat decomposed as uniform θ; substitute FITS labeled as requested CR | `pfss_magnetogram.py` |
| H7 | SWPC / SILSO always “now” for historical `jd`; AIA 0.6″/px 512² treated as a full disk (live 307–310″ vs \(R_\odot=951.7''\); `x=-1,y=-1` puts disk center at a corner) | `solar_realtime_data.py` |
| H8 | Worker freshness `\|scale\| × 0.05` days — at 120 d/s that is 6 sim days behind the HUD | `src/main.ts` |
| H9 | Uncapped rAF `dt` after hidden-tab hitch; solar physics not aborted/rekeyed on Now/seek | `timeController.ts`, `sunController.ts` |
| H10 | `NAMED_ASTEROIDS` anonymous / element-mashed (Pallas ΔM ~181°); phase-1 100k `.bin` absent; fail-open to mashed belt | `asteroidBelt.ts`, `public/data/asteroid-phase1/` |
| H11 | Pluto `mass_kg` 1.303e22 vs DE441 system GM 975.5 km³/s² (~10.85%) | `planets.ts`, Horizons JSON |
| H12 | Duplicate Puck (IAU 715) both ingested; Magaclite typo | `moons.json` |
| H13 | Nearby aliases cannot resolve `sirius` / `alpha-centauri` / `barnards-star` | `nearby_systems.py` |
| H14 | `/health` always `ok`; `engine=kepler` silently becomes Rebound; `live_data_enabled` set from the request flag, not a successful fetch | `server.py` |
| H15 | Accuracy benchmark can report `failedCount: 0`, `meanAbsErrorKmS: 0` with zero comparable rows | `backend/benchmark/accuracy.py` |
| H16 | Solar NaN `activity` / JD → `clampUnit` passes NaN into fragment color (black sun) | `sunController.ts`, `sunVisuals.ts` |

### 3.3 High — latent (unwired)

| # | Finding |
|---|---|
| L1 | WS apply of barycentric `pos` into a heliocentric sibling graph; Sun mesh at ~0.007 AU, planets around the origin |
| L2 | Kuiper output velocities AU/yr, no unit field; client types `number[][]` |
| L3 | Local Hohmann fallback on **any** backend failure including 422; `min_time` rescores as min-distance |
| L4 | Local flybys `{ feasible: true }` when mass/radius missing; turn-limit failures kept with a penalty |
| L5 | Route renderer rebuilds a cubic Bézier between **live** planet positions, not the Lambert arc |
| L6 | Camera transition: NaN `durationSec` / `deltaSeconds` → `controls.enabled` stays false forever |
| L7 | Interstellar warp flies to galactic/parsec coords; local system is built at the origin |
| L8 | Nearby renderers never imported; `LOCAL_SYSTEM_MANIFEST_BY_NEARBY_ID` undefined |
| L9 | H29 / observer-frame applies `β_app` and `frameSpeedOverC` (~2c) to **radial** channel delays, including `propagation: 'lightspeed'` |
| L10 | Schwarzschild radii in `smbhPhysicsConstants.ts` are ~100× small vs 2GM/c² |

### 3.4 Typestrings

| # | Finding |
|---|---|
| T1 | `tsc --strict` fails (~280–320). `main.ts` untyped `body` / `bodyId` / DOM bag |
| T2 | Two exported `CatalogBody` types (`solarSystemModel.ts` vs `catalog.ts`) |
| T3 | `KeplerOrbit` angles optional then force-unwrapped in belt/KBO paths |
| T4 | Four taxonomy encodings (string C/S/M/U, numeric 0/1/2, C/S/M/D, phase-1 C/S/M) |
| T5 | `updateSunFlaresUniforms(..., Vector4[])` consumes a flat `number[12]` |
| T6 | `SolarPhysicsStatePayload` omits `pfss_field_lines.lines`; three incompatible `*Like` bags |
| T7 | Satellite worker untyped; inbound and outbound both `type: 'snapshot'` |
| T8 | `SimulationClient` incoming union drops `error` / `orbital_elements`; `send(Record<string, unknown>)` |
| T9 | HTTP `MissionPlanRequest` bounds ≠ `parse_mission_request` clamps; `{}` → Earth→Psyche |
| T10 | No mypy/pyright; `StateUpdate` is `total=False` + `Dict[str, Any]` at engine boundaries |
| T11 | `radiusKm` vs `diameterKm` both typed `number` — assignable and 2× wrong |
| T12 | `moons.json` asserted `as RawMoonRecord[]`; `frame` is `string` not `ecliptic \| Laplace \| equatorial` |

### 3.5 Documentation

| # | Finding |
|---|---|
| D1 | README: Connect / REBOUND / TudatPy dropdown — controls do not exist |
| D2 | README: 424 moons, 1.9M catalog, survey stars, 4K maps, Oort, TLE, GIBS, planner UI — not on the live path |
| D3 | README: `asteroidWorker.ts`, `stars_catalog.json` as live, “14 pytest modules”, “strict on every file” |
| D4 | `src/sim/asteroids/README.md` claims `main.ts` consumes `AsteroidSimulationPipeline` — it does not |
| D5 | `MOON_FRAME_VERIFICATION_2026-08-24.md` still says NOT FIXED — converter + Horizons gate landed |
| D6 | `WORKER_BOUNDARY_AUDIT_2026-08-24.md` still describes Float32 / stride 7 / 434 bodies — now Float64 / 6 / 10 bodies / 480 B |
| D7 | Reconciliation ACTIVE leftover `m-13` (TLE stride), `m-16` (deleted temp renderer), `m-01` (unused `tickJd`) are stale |
| D8 | TudatPy module header: velocities AU/year — code emits AU/day |
| D9 | Cordelia 180° pin comment: “orbitMath never reads node precession” — false |
| D10 | `applyMetricKinematics` JSDoc: “visual only / does not alter Keplerian state” — mutates `worldPosition` |
| D11 | Missing READMEs: workers, solar API, nearby systems, mission/EPO, n-body fixtures |
| D12 | `fetch_jpl_sbdb.py` documents / writes `planets.js` — catalog is `planets.ts` |

### 3.6 Tests (false green)

| # | Finding |
|---|---|
| Q1 | `orbitMath.test.ts` asserts legacy “it moved,” not Standish `Ldot − ϖdot` |
| Q2 | No unit tests for `solveKepler` / `solveKeplerFast`, velocity, `timeController`, sun focus, catalog loaders |
| Q3 | Moon Horizons: Titan/Iapetus/Phoebe position tol 2.0 (200% of \|r\|); Cordelia plane 180° |
| Q4 | Planet Horizons: 8 bodies, no Pluto, velocities unused |
| Q5 | `test_benchmark_reports_pass_fail_metrics` **mocks** `solve_direct_lambert` |
| Q6 | Committed `reference_scenarios.json` rows are `comparable_to_solver: false` |
| Q7 | Zero pytest for EPO `DemoVerifier`, `VehicleService`, `MiningService`, `RiskService`, MGA `_evaluate_flyby` |
| Q8 | `test_parse_mission_request_defaults_and_bounds` encodes silent clamp as success |
| Q9 | No `vitest.config.ts`; no coverage floor; `npm test` undocumented in README |

### 3.7 Scripts / pipelines

| # | Finding |
|---|---|
| P1 | `catalog_fetcher.ts`: SBDB `per` (days) treated as deg/day → `360/P` (~0.2 d periods) |
| P2 | Phase-1 builder: Harris/Bowell uses 664.5 (radius) stored as `diameter_km` |
| P3 | MPCORB ω/Ω slices off-by-one |
| P4 | Gaia `source_id` through `float64` (>2⁵³) |
| P5 | Default `fetch_jpl_sbdb.py` mutates `bodies.py` then crashes on missing `planets.js` |
| P6 | Default Gaia / phase-1 scripts overwrite tracked catalogs without `--write` |
| P7 | Cache keys ignore query params (limit/mag) |

---

## 4. Mathematics and physics (Pass A extract)

Pass B (below / appendix) re-examines these with dedicated math squads. Pass A already established:

| Topic | What the code does | What the physics requires | Error class |
|---|---|---|---|
| Standish planets | `M(T) = L(T) − ϖ(T)` when `meanLongitudeDegPerCentury` present | Mean anomaly from mean longitude minus longitude of perihelion | Correct on TS planets |
| Backend / moons / mission Kepler | `n = 2π / periodDays`, then also apply ω̇ | If `period` is sidereal, do not also add apsidal rate to *M* | Double-count (~40°/y Luna) |
| Earth + Moon composition | Standish Earth = EMB; Moon elements geocentric; `world = EMB + r_geo` | Moon = Earth + r_geo = EMB − δ + r_geo | ~4671 km systematic |
| Kepler solvers | Fast: 6 Newton from *E=M*, no *e* clamp; `sqrt(1−e²)` raw | High-*e* needs a better starter / Laguerre; reject *e*≥1 | NaN on Sedna-class / *e*→1 |
| MGA flyby | Average \|v∞\|, check turn vs *rp*, charge only launch + arrival | Elastic: \|v∞_in\| = \|v∞_out\|; Δv = unmatched; *rp* from incoming v∞ | Powered flyby sold as free |
| Assist gain | `2 v∞_avg sin(δ/2)` added as score credit | That is a heliocentric deflection scale, not propellant | Fake 20+ km/s “gain” |
| Giant *rp* | `R + 300 km` (Jupiter → 1.004 Rj) | Atmosphere + radiation floor ≫ 300 km | Overstated max turn |
| Lambert | 0-rev only; *A*≈0 (θ≈180°) → `None`; prograde = `h_z > 0` | Hohmann is 180°; multi-rev needed for outer planets | Misses cheapest windows |
| Rocket equation | Same wet mass for outbound and return | Return wet mass includes cargo | Optimistic return Δv |
| Risk MC | Fail iff `payload≤0` or `margin<0`; margin = `max(0, initial−used)` | Unmet Δv / `feasible=False` is failure; margin is onboard leftover | failP = 0 on 6 km/s short |
| PFSS | Uniform-θ weights on sine-lat GONG | Integrate in μ or regrid | Wrong SH / WSA |
| Parker vs surface | ω = 2π/25.38 d vs Snodgrass 24.47 d equator | One sidereal law + one frame | Inconsistent IMF vs spots |
| AIA CH | 0.6″/px tile mapped to ±90° | Full disk ~4″/px or use `rsun` | Fake coronal holes |
| Schwarzschild | Sgr A* `1.24e10` cm (comment 0.083 AU) | 2GM/c² ≈ 1.23e12 cm | ~100× |
| Apparent superluminality | `β_app` scales radial arrival | Projection only; radial *v* ≤ *c* | Causal violation in the engine |
| Tide tensor | `a = (−Ω²x, −Ω²y, −(4πGρ−Ω²)z)` in ecliptic | HT1986 galactic axes; radial stretch +Ω²x | Wrong if ever attached |
| Trojans / Hildas / plutinos | Random *M*; *a* near resonance | Fix λ (not *M*) to λ_J±60° / resonant argument | Labels only |
| Kepler III in manifests | Sirius B *a*=20.1 AU, *P*=18309 d | *P* from *a*,*M* ≈ 18822 d | −2.72% (test allows 5%) |

---

## 5. Do not reopen (closed vs 2026-08-24 notes)

| Old ID / claim | HEAD |
|---|---|
| M-01 belt inside the Sun | `instanceMatrix` then `vOrbitOffset` — closed |
| M-11 / M-12 Float32 Pluto 163 km / 97% payload discarded | Float64, stride 6, 10 bodies, 480 B/tick |
| M-09 unauthenticated report overwrite | `allow_overwrite` + exclusive create + 409 tests |
| M-16 solar snapshot cache ignores `jd` | Keyed `("snapshot", "jd", requested_jd)` |
| m-10 `tof_min_days` ≤ 0 | `Field(gt=0)` |
| m-01 `tickJd` unused | Compared in `main.ts` freshness |
| m-13 TLE 2-line stride | CelesTrak 2-line accepted |
| m-16 `temp_nearbySystemsRenderer.ts` | Deleted |
| Moon converter keyed `"Pluto"` / `"Uranus"` | Keys `pluto` / `uranus`; Horizons 20-moon gate |
| N-body seeded from Standish means | `2226277` Cartesian DE441 J2000 TDB fixture |
| `npm test` missing | `"test": "vitest run"` |

**Still open from those notes (confirmed again):** M-06 Schwarzschild 100×; M-07 no LICENSE; M-15 X-Forwarded-For limiter; M-17 unguarded `GET /solar/realtime?force_refresh`; m-09 zero-confidence hybrid blend; m-14 chord velocities in `localPlanner`; dead `ri_ias15` branch; Titan/Iapetus/Phoebe/Cordelia pins; ~280 TS errors as non-gate.

---

## 6. Pass A squad map (30 agents)

Six squads of five. Findings were collapsed into §§2–4; raw IDs remain in the conversation if a line-level citation is needed.

| Squad | Theme | Agents |
|---|---|---|
| S1 | Consistency | Units/IDs; API contracts; catalog data; dual-stack sim; worker/client messages |
| S2 | Backend logic bombs | N-body/solar/PFSS; Lambert/MGA; mission/EPO; data/IC/nearby; server/budget |
| S3 | Frontend logic bombs | Orbit/catalog/asteroids; worker/time; app/camera/UI; solar visuals; planetary/warp |
| S4 | Documentation | README vs reality; backend docstrings; frontend JSDoc; feature READMEs; stale notes |
| S5 | Typestrings | Core sim types; app layer; feature modules; worker unions; Python schemas |
| S6 | Tests / scripts / leftovers | Frontend test gaps; backend test gaps; fetch pipelines; rendering/LOD; superluminal/manifests |

---

## 7. Suggested order of work

1. **Isolate H29** from the Kepler/worker tick (C1). Highest blast radius, smallest patch.
2. **Solar live path:** Y-up remap (H1), AIA `jd`/`image_id` (H2), poll/timeout vs 429 (H3), CME lifetime in solar radii (H4).
3. **Quadtree/shader** origin + split/merge (C5). Earth/Mars are on screen.
4. **README feature matrix** — shipped vs library vs API-only (R-01 / D1–D3).
5. **Moon `Ldot` + multi-epoch moon gate** (C2) before `showMoons = true`.
6. **Mission/MGA fail-closed** (C3, C4): \|v∞\| match, cargo in the rocket equation, risk sees unmet Δv, EPO reads `recommendation.verification`.
7. **One JD / frame / id contract** (R-02–R-05) before wiring Connect.
8. **Unmock one Lambert accuracy row**; fail closed on missing Phase-1 checksum / `.bin`.

---

## 8. Pass B — mathematics and physics (40 agents)

Nine squads × 5 = **45** Grok 4.6 xhigh-fast auditors (M1–M8 plus residual squad C). Auditors were instructed to treat this file as prior art and **not** re-file R-01–R-18 unless they found a new mechanism or a wrong number.

**Squads**

| Squad | Focus |
|---|---|
| M1 | Kepler / Standish / secular rates / solvers |
| M2 | N-body / energy / GM / integrators / ICs |
| M3 | Solar MHD-lite / PFSS / Parker / AIA / Hale |
| M4 | Lambert / Stumpff / MGA / porkchop / Hohmann / capture |
| M5 | Rocket equation / ISRU / risk / ephemeris frames |
| M6 | Resonances / binaries / SFD / packed-orbit math |
| M7 | Relativity / SMBH / warp / GW / Schwarzschild |
| M8 | Frames / J2 / satellite *n* / nearby astrometry / Kepler III |
| C | Residual consistency / types / docs / tests / new bombs |

§9 is a staging ledger; B1 consolidation happens when the remaining squads finish.

---

## 9. Pass B findings (staging)

### M4 Capture / departure / SOI — in

Source: [M4 Capture orbits](2faf675f-b39f-4e41-8031-5ab47b103fcb)

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M4-CAP-1 | Trajectory and mission Δv is heliocentric \(v_\infty\) only: \(\Delta v_\mathrm{dep}=\|v_\mathrm{Lambert}-v_\mathrm{planet}\|\), \(\Delta v_\mathrm{arr}\) likewise. No \(r_\mathrm{SOI}=a(m/M)^{2/5}\), no LEO \(v_\mathrm{circ}/v_\mathrm{esc}\), no insertion \(v_p-v_\mathrm{circ}\), no Oberth periapsis burn. | `backend/trajectory/lambert.py:290-291`, `planner.py:106`, `mga.py:227-230`, `backend/mission/agents.py:328-346` | LIVE API | High (physics model gap) |
| B-M4-CAP-2 | Flyby periapsis is \(R+300\,\mathrm{km}\) at the barycenter (zero-radius SOI), not a patched-conic handoff. | `backend/trajectory/mga.py:23,104-122` | LIVE API | High (compose with C4 \|v∞\|) |
| B-M4-CAP-3 | `orbital.py` clamps \(e\le 0.9999999\) — planetocentric hyperbola cannot be propagated. | `backend/mission/orbital.py:35,54` | API-adjacent | Medium |
| B-M4-CAP-4 | Insertion is **not** double-counted today: it is never computed. Adding \(v_p-v_\mathrm{circ}\) on top of `totalDeltaVKmS` would double-count because arrival \(v_\infty\) is already the capture stand-in. | `agents.py` + Lambert totals | Note | — |
| B-M4-CAP-5 | `estimate_turn_angle_deg` exported and never called. | `lambert.py:445-446` | LATENT | Low |
| B-M4-CAP-6 | `backend/mission/ephemeris.py` does not exist; `ephemeris_service.py` only supplies heliocentric planet states as Lambert endpoints. | `backend/mission/ephemeris_service.py:108-137` | LIVE API | Info |

Earth-class departure/arrival using raw \(v_\infty\) as Δv overstates the burn versus Oberth-at-periapsis \(\sqrt{v_\infty^2+2\mu/r}-\sqrt{\mu/r}\); deep-well circularization (Jupiter) is wrong in the other direction if \(v_\infty\) is treated as the whole insertion.

### M5 Mining / ISRU — in

Source: [M5 Mining ISRU](b753a3a4-5e0f-4245-a1d7-1f0e0a004329)

Uncited constant-rate plant. Confirms Pass A cargo/rocket decoupling (C3) and adds the actual production/storage ODEs.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M5-MIN-1 | Power cap is \(P/\varepsilon\), not solar \(1/r^2\). `target_body_id` is echoed only; Psyche vs Pluto same `storablePayloadKg`. Defaults \(320\,\mathrm{kW}/0.24\) → \(1333\,\mathrm{kg/day}\) (requested \(1200\) does not bind). Implied \(5760\,\mathrm{kWh/t}\) is processing-scale, uncited. | `mining_service.py:34-45`; `bodies.py` `a_au` unused | LIVE API | High |
| B-M5-MIN-2 | Grade \(g\) scales **yield** after the fact, not excavation rate or power. | `mining_service.py:38` | LIVE API | Medium |
| B-M5-MIN-3 | \(\exp(-\lambda T)\) is **batch storage boil-off** of all refined mass as if created at \(t=0\), including outbound cruise (`transport_delay_days = t_out+t_ret`). Not asteroid remaining-mass \(M_0(1-e^{-kt})\). vs continuous \(\frac{R}{\lambda}(1-e^{-\lambda t_\mathrm{mine}})e^{-\lambda t_\mathrm{trans}}\) code/cont \(=0.871\) at defaults (\(\lambda=0.0015\,\mathrm{d}^{-1}\), half-life \(462\,\mathrm{d}\), \(42\%/\mathrm{yr}\) — cryogen-like). | `mining_service.py:40-42`; `agents.py:318` | LIVE API | High |
| B-M5-MIN-4 | Single \(g\eta\) stream. No water/metal/propellant chemistry. Closure subtracts return-propellant **kg from ore kg** (\(1:1\)). `outbound_propellant_kg` stored and unused. | `mining_service.py:72-87` | LIVE API | High (compose C3) |
| B-M5-MIN-5 | Handling default split: service \(h=0.03\) vs schema/API/planner \(h=0.04\). | `mining_service.py:69` vs `schemas.py:105` | LIVE API | Low |
| B-M5-MIN-6 | Planner wet mass uses request `payload_mass_kg` (6500), never `storablePayloadKg`. Live: cargo \(+13357\,\mathrm{kg}\) would raise propellant \(18699\to 24229\,\mathrm{kg}\). ISRU does not increase \(v_e\) budget. | `vehicle_service.py:64,88-96`; `agents.py:325-327` | LIVE API | Critical (C3) |
| B-M5-MIN-7 | \(\varepsilon=0\) clamped to \(10^{-9}\) (unlimited plant). No tonnes/years; units internally consistent (days, kW, kg). | `schemas.py:202-208` | LIVE API | Low |

### M3 CME / flare / activity — in

Source: [M3 CME flare math](f0488ad3-4ebe-4901-bb5b-7ab477cf204c)

Confirms H4 (immediate CME death) and H16 (NaN activity). New kinematics: \(v\) floor, wall-clock lifetime, linear-not-GOES intensity, no Earth-hit, no light time.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M3-CME-1 | Default-scale \(R_\mathrm{display}=\sqrt{696340}\times 0.00045=0.3755\,\mathrm{AU}>0.3\). \(t_\mathrm{life}=(0.3-R)/v<0\) → expire on first update. App default `useRealisticScale=false`. | `solarFlares.ts:226-267`; `catalog.ts:441-444` | LIVE | High (H4) |
| B-M3-CME-2 | Lifetime floors \(v\) at \(10^{-4}\,\mathrm{AU/s}=14960\,\mathrm{km/s}\). Realistic-scale \(t_\mathrm{life}\approx 49\,\mathrm{min}\) **independent of \(v\)**. At 489 km/s death radius \(\approx 2\,R_\odot\) vs 25 h true TOF to 0.3 AU. | `solarFlares.ts:226-228` | LIVE | High |
| B-M3-CME-3 | \(r(t)=r_0+vt\) constant \(v\), no drag. Backend \(v\) clamp 20–3500 km/s ignores computed Alfvén/\(c_s\). Time base is **wall clock** (\(\Delta t\le 0.1\,\mathrm{s}\)), not sim days. | `solarFlares.ts:60-62`; `solar_physics.py:717-725`; `sunController.ts:441` | LIVE | Medium |
| B-M3-CME-4 | Geometry is a 90° polar cap × \(\omega\) azimuth lune (10° quantize), not a cone \(\theta\le\omega/2\). No Earth-hit \(\Delta<\omega/2\). Feature \(\omega\) to 140° (README 20–120°). | `solarFlares.ts:101-106,398-426` | LIVE | Medium |
| B-M3-CME-5 | Physics-driven `base_dir` Z-up treated as Y-up; equator \(\lambda=90^\circ\) → mesh north pole. Flare sprite \(z\) sign still flipped (H5). | `solarFlares.ts:41-46,182`; `solar_physics.py:69-75` | LIVE | High (H1) |
| B-M3-CME-6 | No GOES class / peak flux. Intensity linear \(I=0.18+0.7B+0.32E+0.12A\); sprite \(s\propto 0.5+I\). Neupert **envelope only** (15–20\(I\) s). | `solarFlares.ts:197,225,251-260,390-393` | LIVE | Medium |
| B-M3-CME-7 | F10.7 unused. Blend: SWPC wind/IMF 0.45, SILSO \(R/220\) 0.35, AIA luma 0.20. `clampUnit` still forwards NaN; everyday `activityIndex:null` → 0 (quiet), not black. Black sun = NaN JD / non-finite backend. | `solarFeatureBlending.ts:61-63`; `sunController.ts:86-93,406-410`; `solar_realtime_data.py:852-917` | LIVE | Medium (H16 refine) |
| B-M3-CME-8 | Light time \(AU/c=499\,\mathrm{s}\) not applied to flares/CME/AIA/SWPC. Instantaneous at camera now. 489 km/s CME would take 3.54 d to 1 AU; mesh dies at 0.3 AU (or immediately). | `sunController.ts`; `smbhPropagation.ts` only | LIVE | Medium |
| B-M3-CME-9 | Sound speed \(152\sqrt{T_{MK}}\) vs adiabatic \(\sim 141\sqrt{T_{MK}}\) (\(+8\%\)). No CME KE/mass/fluence. Backend \(R_\odot=695700\) vs catalog 696340. | `solar_physics.py:10-11,651-655` | LIVE | Low |

### M3 Parker / Hale / Hathaway / WSA — in

Source: [M3 Parker Hale](bc377dd4-c1de-4a61-a41b-fd5a3a4cf100)

Confirms Parker \(\omega=2\pi/25.38\,\mathrm{d}\) vs Snodgrass equator \(24.47\,\mathrm{d}\), and SWPC/SILSO-always-now. Live path is `GET /solar/physics` (`sunController`, `forcing: hybrid`, `liveData: true`).

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M3-PAR-1 | Three rotation laws at once: Parker/catalog rigid \(25.38\,\mathrm{d}\) (\(14.18^\circ/\mathrm{d}\)); backend Snodgrass & Ulrich 1990 \((14.713,-2.396,-1.787)\) mislabeled `snodgrass_1983_like`; shader \((14.44,-2.87,-0.36)\) is not Snodgrass 1983. Shader \(\psi=\arcsin(n_y)\) is world, not heliographic \(B\) once the \(7.25^\circ\) tilt is on. | `solar_physics.py:89`; `sunVisuals.ts:38,114-119`; `planets.ts:11` | LIVE | High |
| B-M3-PAR-2 | Inertial Archimedean spiral + footpoints on \(R_\mathrm{ss}=2.5\,R_\odot\) is the right frame (not double-spun). **No live \(B_r,B_\varphi\).** Lines are HCS warp \(\lambda=i_\mathrm{HCS}\sin\varphi\), not constant-\(\theta\) Parker cones. Polarity `i%2`. Frontend \(\Omega\) \(0.16\%\) fast (\(25.34\,\mathrm{d}\)). | `solar_physics.py:895-988`; dead `solarWind.ts` | LIVE / dead IMF | High |
| B-M3-PAR-3 | Hale: role **tags** flip at cycle minima (correct timing); tube `polarity_sign` and PFSS dipole \(g_{10}=5(1-0.6A)\) G **never reverse**. Polar holes stay \(\pm 72^\circ\). Polar-field reversal near max is absent. Tests only check the tag. | `solar_physics.py:234-235,596-599,689,838-852`; `pfss_magnetogram.py:220` | LIVE | High |
| B-M3-PAR-4 | Hathaway shape is 1994 (\(b=54,c=0.71,t_0=0\)), not 2015 average (\(b=56,c=0.8,t_0=-4\,\mathrm{mo}\)). Max-normalized at \(t=b\sqrt{3/2}\) (the \(c=0\) peak); true max at \(c=0.71\) is \(58.39\) mo \(\to\) \(+3.4\%\) overshoot + clamp flat-top. No Waldmeier \(A\) or \(b(A)\). Cycle 25 start coded `2020-01-01` not SILSO Dec 2019. Tests assert the wrong peak. | `solar_physics.py:16-22,123-141`; `sunController.ts:63-84` | LIVE | Medium |
| B-M3-PAR-5 | WSA labeled `wsa_arge_2003` is AP2000 \(267.5+410/f_s^{0.4}\) times an un-cubed \(\theta_b\) gate (\(0.045\,\mathrm{rad}\)). Expansion uses \(\lvert B\rvert\) not \(B_r\). Live Parker then **binarizes** at \(550\,\mathrm{km/s}\) and hybrid-blends \(0.58 v_\mathrm{SWPC}+0.42 v_\mathrm{model}\) onto every arm. | `pfss_magnetogram.py:812-836,958`; `solar_physics.py:948-974` | LIVE | Medium |
| B-M3-PAR-6 | No \(1/r^2\) G\(\to\)nT on the `sunController` path. Loop \(B\) is \(12{-}650\,\mathrm{G}\) (coronal, not kG spots). SWPC nT used as activity, not Parker \(B\). Dead `solarWind.ts` has the correct \(B_0=5\,\mathrm{nT}\) IMF. | `solar_physics.py:624-632`; `solar_realtime_data.py:377-400` | LIVE | Medium |
| B-M3-PAR-7 | `pfss_magnetogram.py` calls \(27.2753\,\mathrm{d}\) “Sidereal”; that number is the **synodic** CR period. HCS “\(7.25^\circ\) at min” reuses the equator–ecliptic tilt as dipole tilt. | `pfss_magnetogram.py:30`; `solar_physics.py:928-930` | LIVE | Low |
| B-M3-PAR-8 | Snapshot cache keys include `jd` even though SWPC/SILSO fetches ignore epoch — historical corona mixed with today’s SSN/L1. | `solar_realtime_data.py:131,825` | LIVE | Medium (H7) |

### M3 Solar frames Z-up vs Y-up — in

Source: [M3 Solar frames YZ](d104e59a-3456-4534-b4cd-01bf6b3a3688)

**No API→mesh path remaps** physics `(x,y,z)_Z` → mesh `(x,z,y)`. Every triple is copied or run through an identity lat/lon round-trip. Scale changes \(R\) only.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M3-YZ-1 | `spinGroup` copies (loops, plumes, CME arcs, eruptions, flare sprites): physics \(+Z\) lands on mesh equator → **~90°**. Those groups also spin about local \(+Y\) (double lon drift). | `sunVisuals.ts:1390-1421`; `sunController.ts:323-355` | LIVE | High (H1) |
| B-M3-YZ-2 | `node` / world-shader copies (PFSS, Parker, sunspots, flare glow): two Z-up frames stacked → **looks almost right**, residual **7.25°** tilt + no Carrington/spin. Polar holes tested vs ecliptic \(Y\) land near the **solar equator**. | `solarMagnetics.ts:246-251`; `sunVisuals.ts:489-490,615-636` | LIVE | High |
| B-M3-YZ-3 | Flare sprite \(z=-r\cos\phi\sin\lambda\) is a **longitude mirror**, not a Y↔Z remap. Opposite hemisphere vs surface glow. | `solarFlares.ts:178-182`; `sunVisuals.ts:313-316` | LIVE | High (H5) |
| B-M3-YZ-4 | AIA holes are Stonyhurst-like plate-carrée mixed into the same `coronal_holes` array as synthetic heliographic holes. Helmet “equator” is world \(\lvert n_y\rvert\) (~solar meridian). | `solar_realtime_data.py:606-616`; `sunVisuals.ts:477` | LIVE | Medium |

Fixing only `spinGroup` without moving shaders to object-space Y-up will make the accidental `node` match worse.

### M2 Kuiper WHFast — in

Source: [M2 Kuiper WHFast](fb93d8a7-ae18-463b-b41d-b121fb41d611)

Confirms unlabeled AU/yr output on an AU/day `state_update` (L2). Tide/SRP correctly omitted at 30–100 AU. \(dt\) is fine vs 3:2/2:1 heliocentric periods.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M2-KUI-1 | `get_state()` emits raw REBOUND \(v\) in **AU/yr**, no unit field. Main engine divides by 365.25. Same WS message advertises `velocity_units: "AU/day"` → **365.25×** if inherited. Inbound AU/day→AU/yr reject is real. | `kuiper.py:447-470`; `rebound_nbody.py:369-386`; `server.py:1437-1462` | LIVE API | High (L2) |
| B-M2-KUI-2 | Binaries: correct \(\mu=G(m_1+m_2)\) ICs, then `sim.add(m=0)`. Mutual force gone after \(t=0\); pairs unbind in ~1–20 yr. Tests only check \(t=0\). | `kuiper.py:77-79,156,367-408` | LIVE API | High |
| B-M2-KUI-3 | Barycentric fractions **swapped**: `companion_fraction=1/(1+q)` applied to the primary. Frontend `kuiperBelt.ts:346-360` is correct. Equal-mass accidental OK; \(q=0.35\) → \(\Delta a/a\sim 1.7\times 10^{-3}\). | `kuiper.py:173-194` | LIVE API | Medium |
| B-M2-KUI-4 | No Hill cut. \(s_\max=200{,}000\,\mathrm{km}\) → \(s/r_H\) up to **0.81** at 30 AU (stable typically \(\lesssim 0.5\,r_H\)). Output `round(...,5)` = 1496 km vs min sep 1000 km. | `kuiper.py:456-459` | LIVE API | Medium |
| B-M2-KUI-5 | Uranus omitted (J/S/N only). “Plutinos” are \(a\sim\mathcal{N}(39.4,0.6)\) with random \(M\); \(\phi_{3:2}\) not locked. No 2:1 sampler (that region is “classical”). | `kuiper.py:288-376` | LIVE API | Medium |
| B-M2-KUI-6 | Hardcoded WHFast \(dt=5\times 10^{-4}\,\mathrm{yr}\). Docstring claims close-encounter dynamics; WHFast + \(m=0\) + `collision=none` cannot. \(G=4\pi^2\) vs DE440 38 ppm. | `kuiper.py:5-7,272-273` | LIVE API | Medium |

### M5 Rocket equation — in

Source: [M5 Rocket equation](5ef644fe-a9bc-4b59-9028-7ed5d088cb1a)

Tsiolkovsky \(\Delta v=v_e\ln(m_0/m_f)\) and \(g_0=9.80665\) are correct. C3 confirmed with a closed numeric budget.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M5-VEH-1 | Wet mass = bus \(6500+\sum(\mathrm{dry}+\mathrm{prop})\). Planner never adds mined cargo (`payload_mass_kg` only). Default Psyche: delivered **3.716 km/s** of **39.433** (unmet **35.716**). HTTP 422 `no_verified_candidate`. | `vehicle_service.py:64`; `agents.py:325-331` | LIVE API | Critical (C3) |
| B-M5-VEH-2 | Return prop subtracted from ore **and** from score. Closable stack: return prop **17,296 kg** zeros `returnedPayloadKg` then is subtracted again (`score = 0 − 92392 − …`). Cargo-on-return would add **+1606 kg** prop the live model never charges. | `mining_service.py:76-81`; `agents.py:372` | LIVE API | Critical (C3) |
| B-M5-VEH-3 | No \(\varepsilon\), tanks, or ISRU-into-tanks. Stage names are labels; both stages can empty on outbound. | `vehicle_service.py:87-116,154-161` | LIVE API | High |
| B-M5-VEH-4 | `m1_min<=0` clips to \(0.1 m_0\) (invents \(\ln 10\cdot v_e\)). Dead for consistent vehicles; optimistic if state corrupts. Soft-fail `feasible=False`, no exception. | `vehicle_service.py:91-93,128` | LIVE API | Medium |

### M5 Risk Monte Carlo — in

Source: [M5 Risk Monte Carlo](f898e243-24da-4823-82df-90d379dfad4e)

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M5-RSK-1 | Fail iff `payload<=0` or `margin<0`. Margin is `max(0, initial−used)` leftover **reserve** (1530 kg). 6.28 km/s short and live Psyche 35.7–46.3 km/s short → **failP = 0.0**. `margin==0` succeeds. | `risk_service.py:69-70`; `vehicle_service.py:148` | LIVE API | Critical (C3) |
| B-M5-RSK-2 | Sampled: independent clipped \(N(0,\sigma)\) factors on Δv / time / payload only. **Isp, JD, ore not drawn.** \(\sigma\) arithmetic-sum not RSS (`0.01+0.04=0.05`). | `risk_service.py:42-57` | LIVE API | High |
| B-M5-RSK-3 | Linear smear **120 kg/km/s** ≈ **1.03%** of \(m/v_e\) (11642 kg/km/s). No per-sample Tsiolkovsky re-close. Lower Δv can “rescue” a negative base margin. | `risk_service.py:64-67` | LIVE API | High |
| B-M5-RSK-4 | \(N=240\), resolution 0.42%. Envelopes p05/p50/p95 (no mean); failP is a mean. Failures left in the band. mining=0 → failP=1 via payload≡0 (inverted vs unmet Δv). | `risk_service.py:39,88-113`; `agents.py:351-372` | LIVE API | Medium |
| B-M5-RSK-5 | Threshold `>`; `failP==threshold` passes. Schema can clamp threshold to 1.0 so the gate cannot fire. NaN comparisons fail-open. No RiskService tests. | `agents.py:209`; `schemas.py:198-200` | LIVE API | Medium |

### M5 EPO verifier — in

Source: [M5 EPO verifier](381cfc8a-dbf8-4a03-a054-027a2ca69eb3)

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M5-EPO-1 | `DemoVerifier` reads `result.verification`; planner writes `recommendation.verification` → always `missing_embedded_verifier` when a family policy is registered. Bare `run_episode` has **no policy** → rubber-stamp. | `epo/verifier.py:31-53`; `agents.py:395-441` | LIVE API | High (C3) |
| B-M5-EPO-2 | Score \(=+1\,\mathrm{kg}\) payload \(-1\,\mathrm{kg}\) prop \(-9000 P_\mathrm{fail}\) \(-0.25/\mathrm{d}\). No science/taxonomy term. `ore_grade=0.18` for every body. Return prop in closure **and** score (double). | `agents.py:370-372` | LIVE API | High |
| B-M5-EPO-3 | `min_delta_v` (EPO `mining_core`) is not in `TRAJECTORY_OBJECTIVES` → remaps to `min_distance`. Return leg always `min_distance`. Multi-agent is one sequential pipeline (≤4 outbound × 1 return). | `planner.py:13,69`; `agents.py:240-314`; `sample_episodes.py:112` | LIVE API | Medium |
| B-M5-EPO-4 | Empty `{}` → Earth→Psyche (string default, not physics). HTTP bounds ≠ parser clamps (`reserve` 1.0 vs 0.4; `risk_samples` 1 vs [30,50000]). | `schemas.py:95-97,180-208`; `server.py:765-788,1242` | LIVE API | Medium |
| B-M5-EPO-5 | Δv fail-closed only via `logistics.feasible`. Risk, EPO, TOF, cargo-in-wet-mass stay fail-open. `require_recommendation` never read. | `agents.py:197-210`; `epo/config.py:30` | LIVE API | High |

### M7 Schwarzschild / SMBH constants — in

Source: [M7 Schwarzschild](1b8eeee8-dcb6-4a0d-947d-6bc246a82fbd)

Confirms M-06: SI metres stored as centimetres. Comments (0.083 AU, 127 AU) match correct \(2GM/c^2\).

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M7-RS-1 | Sgr A* `rSchwarzschildCm=1.24e10` is **metres**; correct \(1.227\times 10^{12}\,\mathrm{cm}\) (0.082 AU) → **99× small**. M87* `1.9e13` vs \(1.920\times 10^{15}\,\mathrm{cm}\) → **101×**. Masses/G/c OK. | `smbhPhysicsConstants.ts:62-64,152` | LIVE catalog | High (M-06) |
| B-M7-RS-2 | ISCO/photon **ratios** (3 Rs, 1.5 Rs) correct; stored cm inherit 100×. **Never read** elsewhere. Cen A / Maffei 1 have no Rs; fallback `1e10`. | `smbhPhysicsConstants.ts`; `smbhPropagation.ts:638-643` | LIVE / unused radii | Medium |
| B-M7-RS-3 | Only runtime consumer is Gertsenshtein path length `Rs*10`. \(P\propto L^2\) → Sgr/M87 near-source prob **~10⁴ too small**. | `smbhPropagation.ts:638-643` | LIVE if AGN on | Medium |
| B-M7-RS-4 | No gravitational redshift / lapse. `timeCompressionFactor` is SR beaming \(1-\beta\cos\theta\). Sun-Focus HUD shows masses, not Rs. `triggerWarpWaveImpact` always uses `SGR_A.massG`. | `smbhPropagation.ts:381`; `agnShockwaveEngine.ts:181` | LIVE UI | Low |

### M4 Local Hohmann — in

Source: [M4 Local Hohmann](15d62dd4-be11-4386-971d-b3e35e1797c2)

Module is `src/frontend/features/trajectory/localPlanner.ts`. Formula at SMA is textbook Hohmann (Earth–Mars **5.594 km/s**). Planner UI latent; any `/trajectory/plan` failure including 422 would invoke it if wired.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M4-HOH-1 | Circular-at-instantaneous-\(r\) (not SMA; planet \(\mathbf{v}\) unused). Earth–Mars reported **6.1–6.8 km/s** typical (**+9–22%**). Peri→aph +22%; aph→peri **−25%**. | `localPlanner.ts:22-43` | LATENT | Medium (L3) |
| B-M4-HOH-2 | Phase/synodic ignored. Earth–Mars synodic 780 d / lead 44° never enforced. Path is a cubic Bézier, not the transfer ellipse. | `localPlanner.ts:22-28,271-308` | LATENT | Medium |
| B-M4-HOH-3 | Chord \((\mathbf{r}_2-\mathbf{r}_1)/\mathrm{TOF}\) is the transfer \(\mathbf{v}\) for flybys (same vector both ends). Ideal 180°: chord \(\lvert v_\infty\rvert\) Mars **29.45 vs 2.65 km/s (~11×)**. Turn law then 77°→1.5°. | `localPlanner.ts:45-47,89-103` | LATENT | High (L4) |
| B-M4-HOH-4 | Missing mass/radius → `feasible: true`. `min_time` shares min-distance score. Intermediate arrivals omitted from `totalDeltaVKmS`. Server `/trajectory/plan` is **not** this collapse (B-M4-PCH-3). | `localPlanner.ts:76-82,116-133,239-245` | LATENT | High |

### M4 MGA \|v∞\| — in

Source: [M4 MGA vinf](b03c1e82-0a43-4d7e-af69-5775a83faec5)

C4 confirmed with a worked `max_assist` winner. Live mismatch on that realization is **11.29 km/s**, not the 2.30 km/s in the Pass A note (different epoch/route).

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M4-MGA-1 | Two Lambert legs spliced; \(v_{\infty,\mathrm{out}}\) is **not** a B-plane rotation of \(v_{\infty,\mathrm{in}}\). Feasible iff angle \(\le\delta_\max(v_\mathrm{avg},R+300)\). Magnitude jump ignored. | `mga.py:104-122,206-239` | LIVE API | Critical (C4) |
| B-M4-MGA-2 | Winner E–J–M (JD 2460500.5): \(\lvert v_{\infty,\mathrm{in}}\rvert=7.46\), \(\lvert v_{\infty,\mathrm{out}}\rvert=18.75\), mismatch **11.29 km/s**, gain **22.94 km/s**. \(\delta_\max(v_\mathrm{out})=113.6^\circ\) would reject; \(\delta_\max\) at Io torus **79°** would reject. Direct E–M **10.85 km/s** loses on `max_assist` score. | `mga.py:108,227-241` | LIVE API | Critical |
| B-M4-MGA-3 | Uniform 300 km: Saturn \(r_p\) is **1736 km inside** the 1-bar equator. Jupiter 1.004 \(R_J\) vs Io torus 5.9 \(R_\mathrm{eq}\) inflates \(\delta_\max\) **+45°** at 10 km/s. | `mga.py:23,112` | LIVE API | High |
| B-M4-MGA-4 | Powered \(\lvert\Delta v_\infty\rvert\) never charged. `turnDeficitPenalty=0`. `MAX_COMPLETED=48` TOF realizations; Venus last lexically — E–V–M exists (Δv 21.77) but is never evaluated. Earth cannot be an assist (VEEGA impossible). | `mga.py:21-22,47-48,271-280` | LIVE API | High |
| B-M4-MGA-5 | Planet \(\mu=G\times\mathrm{mass_{kg}}\) vs DE440 ~0.004% (Pluto **−10.8%**). Not the flyby bug. | `orbital.py:25-27`; `mga.py:111` | LIVE API | Low |

### M7 Alcubierre / H29 kinematics — in

Source: [M7 Alcubierre warp](71575b13-d58d-40fa-9bdc-1dc4813815cb)

C1 confirmed. Not Alcubierre (no \(\alpha\), \(v_s\), bubble \(R\)). Displacement **was** estimated: H29 peak ~4 m/frame at 60 fps.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M7-WRP-1 | \(\beta_\mathrm{peak}=G(E/Mc^2)^{1/3}/(c^3 r_0)\times 10^{45}\) then \(\Delta x=\beta\,c\,\Delta t_\mathrm{wall}\times 10^{12}\). \(G/(c^3 r)\) is not dimensionless without the fudge. \(r_0=ct\) always. | `smbhPropagation.ts:104-151`; `solarSystemModel.ts:185-192` | LIVE | Critical (C1) |
| B-M7-WRP-2 | Kepler elements reset every tick; only `worldPosition` is warped (non-integrating; 30 fps = 2× 60 fps offset). Worker then writes warped diffs into `relativePosition` while \(v\) stays Kepler. | `solarSystemModel.ts:106-192`; `main.ts:730-848` | LIVE | High |
| B-M7-WRP-3 | Pause freezes JD; wall-clock `dt` still walks `elapsedSec` / bubble phase. Peak ~16 s after trigger on frozen orbits. | `timeController.ts:68-71`; `main.ts:1124-1144` | LIVE | High |
| B-M7-WRP-4 | H29 \(E=5\times 10^{54}\,\mathrm{erg}\): \(\beta\sim 8.6\times 10^{-19}\), **~4 m/frame** / ~260 m/s at 60 fps when the bubble is at the Sun. Across 40 AU sech² differential \(\sim 10^{-13}\) (rigid translation). At advertised 8 s impact, \(\xi\approx 10\) → sech² \(\sim 10^{-8}\) (off-Sun). No \(T_{\mu\nu}\) / NEC integral. | `agnShockwaveEngine.ts`; `smbhPropagation.ts` | LIVE | Medium |

### M7 GW / Gertsenshtein — in

Source: [M7 GW strain](edaa29be-3a75-4d0d-becb-74c888b04c7f)

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M7-GW-1 | Strain is \(h=2GE_\mathrm{GW}/(c^4 d)\) with \(E_\mathrm{GW}=0.01 E\), not quadrupole \(\ddot I(M,f)\). Comment’s \((4G/c^4)E/(dc)\) has units of time. Masses/\(f\) unused. | `smbhPropagation.ts:447-453,590` | LIVE compute / LATENT HUD | Medium |
| B-M7-GW-2 | Gertsenshtein \(P=\pi^2 G(BL\sin\theta)^2/c^4\). Prefactor ~40× Dyson small-angle. ISM uses **full source distance** (8 kpc), ignoring 100 pc coherence → \(P\) **\(\sim 6700\times\)** high. Dropped from `getTimeline()`. | `smbhPropagation.ts:476-478,638-643` | LATENT | Medium |
| B-M7-GW-3 | Shader `strainAmplitude=0.025` (**\(\sim 10^{19}\times\)** LIGO \(10^{-21}\)). Physical \(h\) never uploaded. Header “\(\times 10^{18}\)” / “0.15 fm Earth–Sun” are wrong and `getInfoText` is dead. | `gravitationalWaves.ts:12,169,225`; `agnShockwaveEngine.ts:283` | LIVE mesh | Medium |

### M8 Manifest Kepler III — in

Source: [M8 Manifest Kepler III](9cc5700f-04e9-4680-9cbe-f72d7ba2528d)

All three JSON manifests pass the repo test. `main.ts` cannot open any of them.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M8-MAN-1 | Sirius B \(a=20.1\,\mathrm{AU}\), \(P=18309\,\mathrm{d}\) vs \(P_\mathrm{Kep}=18822\) (**−2.72%** / **−5.37%** on \(P^2/a^3\)). Inside 5% gate. Bond 2017 \(a\approx 19.78\,\mathrm{AU}\). | `sirius.json:36-45`; `test_local_system_manifests.py:81-112` | LATENT | Low |
| B-M8-MAN-2 | Proxima period is fit to \(M_A+M_P\), not AB barycenter. vs \(M_A+M_B+M_P\): **+32%** (file 734 kyr vs Kervella ~547 kyr). Node \(\Omega=204^\circ\) copied from AB (published 126° → \(i_\mathrm{mut}\sim 83^\circ\) vs file 28.4°). | `alpha-centauri.json:12,58-68` | LATENT | Medium |
| B-M8-MAN-3 | Barnard planets \(i=\Omega=0\) (face-on ⇒ **zero** RV). No HZ field; no mass-from-\(L\). | `barnards-star.json:38-109` | LATENT | Low |

### M8 Satellite J2 — in

Source: [M8 Satellite J2](fdaf2125-91e9-4ab9-9182-882f7466dcd8)

LATENT. Two-body + first-order J2, not SGP4. TLE \(n\) rev/day → rad/s is correct.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M8-SAT-1 | Catalog rows store inconsistent \(a\) and \(n\): CAPSTONE \(n\) **+20%**, MRO **−6.6%**, MAVEN **−16%**. J2/\(M(t)\) use \(n\); ellipse uses \(a\). | `satelliteSystem.ts:168-215`; `visualProfiles.ts:174-320` | LATENT | High |
| B-M8-SAT-2 | TLE \(n\) is already Kozai-mean; code adds \(\dot M_{J2}\) again → ISS **~74 km/day** along-track. Polylines propagate with `applyJ2=false`; markers with `useJ2`. | `satellitePropagationCore.ts:128-141`; `satelliteSystem.ts:234-251,850,1042` | LATENT | High |
| B-M8-SAT-3 | TEME-of-epoch treated as J2000 equatorial, then \(R_x(\varepsilon)\) to ecliptic. No TEME→GCRF, no GMST/ECEF. Mars “equatorial” uses \(R_x(\varepsilon_\mathrm{Mars})\) about Earth’s +X. CAPSTONE is an NRHO drawn as Kepler+J2. | `satellitePropagationCore.ts:88-108`; `visualProfiles.ts:186-196` | LATENT | Medium |

### M6 KBO resonances — in

Source: [M6 KBO resonances](84997a28-75e4-42e3-b2ab-85d08b9ab0cf)

Live 5k Kepler belt. \(\varphi\) never formed. Sedna-class \(e\approx 0.85\) is stable on `solveKeplerFast` (Pass A NaN claim holds only as \(e\to 0.99\)).

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M6-KBO-1 | 3:2 / 2:1 are \(a\) bins + random \(M\). Seed-137 plutino \(\varphi\) consistent with **uniform** (12.4% near 180° vs chance 11%). Frozen at a random angle, not libration. **5:2 absent.** | `kuiperBelt.ts:74-75,198-201,401-403` | LIVE | High |
| B-M6-KBO-2 | Detached 18% (Sednoids are rare). Cold/hot is uniform-\(i\) with a 5° wall, not Petit Rayleigh + 44–44.5 AU kernel. | `kuiperBelt.ts:177-195` | LIVE | Medium |
| B-M6-KBO-3 | Claimed binary 22%/5%; extra \(D>40\,\mathrm{km}\) gate → **~2%** on screen. Cold/hot 30/10 split is comment-only. | `kuiperBelt.ts:77-86,389-393` | LIVE | Medium |
| B-M6-KBO-4 | Backend: no 2:1; \(e\le 0.5\) so Sedna-class **impossible**; plutinos \(\mathcal{N}(39.4,0.6)\) too wide. | `kuiper.py:338-364` | LATENT | Medium |

### M6 Packed orbits / ACBF — in

Source: [M6 Packed orbits](5afb8c4c-51f2-47c4-9770-e0946926ed4f)

**Corrects Pass A H10 “100k `.bin` absent”:** `asteroid_phase1_main_100000.bin` is on disk (3,600,012 B), SHA-256/FNV match meta. `main.ts` boots 50k procedural, then may swap a **50k catalog prefix**.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M6-PAC-1 | ACBF v1: \(a\) f32; \(e,i,\Omega,\omega,M\) u16. Max in-range recon **7.63e-6** on \(e\), **0.00275°** on angles. Belt along-track from \(M\) ~15–25k km. | `build_asteroid_phase1_dataset.py:33-39,253`; `asteroidCatalogLoader.ts:90-93` | LIVE | Low |
| B-M6-PAC-2 | Dominant phase error is **epochJd f32** (ULP 0.25 d at JD \(2.46\times 10^6\)) → belt ~0.026° / **~2×10⁵ km**. \(n\) never stored; \(n=2\pi/P\). Live \(P\) vs Kepler-from-\(a\) up to **5.44 d** (Ceres-like 0.30° / 2.2e6 km in 25 yr). | `beltRenderer.ts:123-128`; packer `:151-154` | LIVE | Medium |
| B-M6-PAC-3 | Checksum undeclared → pass. Meta present → SHA enforced; mismatch refuses swap (fail-closed). 1.925M GPU prototype unused. Dead `asteroidShaders` epoch is J2000-only (**9455 d** off phase-1). | `phase1AsteroidCatalog.ts:459-472`; `main.ts:468-521` | LIVE / dead proto | Medium |
| B-M6-PAC-4 | Live Kepler 8 Newton, \(e\le 0.556\) OK. \(e=0.99\) 5- and 8-iter **diverge** (NEO/prototype only). | `beltRenderer.ts:79` | LIVE | Low |

### M6 Albedo / SFD — in

Source: [M6 Albedo SFD](b4209621-1b8c-491f-b868-cdad5c2be6ce)

Runtime treats `diameterKm` as diameter (`r=D/2`). Committed 100k does not hit the Harris-radius fallback.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M6-ALB-1 | Builder Harris **664.5** is a **radius** stored as `diameter_km` (2× small if H-fallback fires). Live file used measured D (\(D\in[2.80,939]\) km). | `build_asteroid_phase1_dataset.py:141-148` | Armed / not current | Medium (P2) |
| B-M6-ALB-2 | Comment \(N(>D)\propto D^{-2.5}\) but inverse-CDF is differential **q=2.5** ⇒ \(N(>D)\propto D^{-1.5}\) (too many large). Mash median ~1.3 km vs catalog 6.34 km. | `asteroidBelt.ts:113-119` | LIVE if gate fails | Medium |
| B-M6-ALB-3 | No HG phase. D-types folded into C. S midpoint 0.16 vs 0.20. M share 19.6% vs DeMeo ~8% (X-complex + 2.5–2.7 AU → M). | `asteroidBelt.ts:104-110`; builder `:54-82` | LIVE | Low |
| B-M6-ALB-4 | Fail-open (latency/checksum/missing bin) keeps mashed 0.8–300 km q=2.5 belt. Taxonomy-empty is not the current miss (C/S/M all present). | `main.ts:475-512` | LIVE fallback | Medium (H10 refine) |

### M1 Backend Kepler — in

Source: [M1 Backend Kepler](e774f562-b6af-4d75-8a1f-e2a2b7fb4975)

`orbital.py` uses \(\mu=n^2 a^3\) from stored `period_days`, **never** the Gaussian `MU_SUN` that Lambert/MGA use.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M1-BKE-1 | Three solar \(\mu\): k², DE440 (−5e-12), IAU, and \(G\times M_\odot\) (**+30 ppm**). Propagate sets \(n=2\pi/P\). | `orbital.py:11-13,59-61` | LIVE API | Medium |
| B-M1-BKE-2 | Stored \(P\) ≠ Kepler III from \(a\): Eris **−0.18%**, Sedna −0.10% (\(\Delta a=+11.6\,\mathrm{AU}\) if inverted with k²), Ceres −0.09% (~**1e6 km** along-track / 2 y). SBDB-style rows match ~1e-12. | `bodies.py` vs \(2\pi\sqrt{a^3/k^2}\) | LIVE API | Medium |
| B-M1-BKE-3 | \(e\) clamped \(\le 0.9999999\) — no hyperbolic/parabolic. 24 Newton, no residual check. \(v_\infty=v_\mathrm{Lambert}(k^2)-v_\mathrm{planet}(n^2a^3)\): Earth ~0.19 m/s, Jupiter ~7 m/s, Ceres ~17 m/s. | `orbital.py:35-49`; `lambert.py:162` | LIVE API | Medium |
| B-M1-BKE-4 | Kepler Earth is Standish EMB; MGA flyby \(\mu\) is Earth-only (+0.003% vs 399, **−1.21%** vs E+M). Pluto `mass_kg` **−10.85%** vs DE440 system GM; no Charon. No Moon in `ALL_BODIES`. | `bodies.py:52-64,148-160`; `mga.py:111` | LIVE API | High (R-04, H11) |
| B-M1-BKE-5 | Zero tests for `solve_kepler` / `propagate_kepler_orbit`. Tudat inverse sets \(M=f\) when \(e\ge 1\) (not hyperbolic \(N\)). | `tudatpy_hooks.py:519-520` | LATENT / CI | Medium |

### M1 Kepler solvers — in

Source: [M1 Kepler solvers](8af6f5fb-68af-438e-b3a7-b6a2b52592af)

Live elliptic solvers are fine through Sedna \(e=0.85\). Pass A “Sedna NaN” is **false at HEAD**; the cliff is \(e\gtrsim 0.99\). Moon *Ldot* / Standish / EMB not re-filed.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M1-SOL-1 | `solveKeplerFast` (6 Newton, \(E=M\), no clamp) diverges at \(e\gtrsim 0.99\); \(e=1\) zero denominator. Live max detached \(e\le 0.919\) (residual \(2.6\times 10^{-10}\)). Accurate `solveKepler` still converges at \(e=0.99\). | `orbitMath.ts:71-77` | Armed / not current | Medium |
| B-M1-SOL-2 | KBO binary rebuilds perifocal axes from the **current radius vector** after Kepler \((x,y)\). Correct only at periapsis; circular \(E=\pi\) lands 180° off. Mutual \(a\) 10³–2×10⁵ km → companion **up to ~4×10⁵ km** on the wrong side. | `kuiperBelt.ts:267-344` | LIVE | High |
| B-M1-SOL-3 | Live \(v\) is Gauss \(n\cdot a\) in AU/day, consistent with implied \(\mu=n^2a^3\), not \(k^2\). vs \(\mu_\odot\) perihelion: Earth −0.11 m/s, Neptune **+11.6 m/s**. | `orbitMath.ts:201-225` | LIVE | Low |
| B-M1-SOL-4 | Orbit lines sample sidereal `periodDays` while Standish \(M\) advances at anomalistic \(n\). Neptune line ~0.28 AU off at 30 AU. | `main.ts:350-353` | LIVE | Low |
| B-M1-SOL-5 | `solveKepler` starter \(E=\pi\) when \(e\ge 0.8\) **without** wrapping \(M\) → diverges if a caller forgets. Live callers wrap. No hyperbolic branch. | `orbitMath.ts:85-96` | LATENT API | Medium |
| B-M1-SOL-6 | Backend `orbital.py` is frozen-apsides two-body (\(n=2\pi/P_\mathrm{sid}\), no \(\dot\omega\)). Prior “backend also applies \(\dot\omega\)” is **false**. Earth \(\dot\varpi=0.323^\circ/\mathrm{cy}\) → ~2.1×10⁵ km in 25 y. | `orbital.py:59-63` | LATENT API | Medium |

### M4 Lambert / Stumpff — in

Source: [M4 Lambert Stumpff](305a965d-df45-4213-af59-23d77bdc99e4)

0-rev Vallado universal-variable; \(C(z)/S(z)\) match Battin including \(z<0\) and \(z=0\). No frontend Stumpff duplicate.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M4-LAM-1 | Exact \(\theta=180^\circ\) (\(A=0\)) returns `None`. Earth–Mars Hohmann 5.59 km/s / 258.87 d **missed**. \(179.9^\circ\) solves (\(z\approx\pi^2\)). | `lambert.py:181-182` | LIVE API | High |
| B-M4-LAM-2 | Bracketed root always becomes \(\mathbf{v}\). Residual reported, **never used to reject**. Live: residuals of **8–28 d** still return velocities. Unbracketed path does reject. | `lambert.py:151-154,243-255` | LIVE API | High |
| B-M4-LAM-3 | No \(n\ge 1\). Search \(z\in[-40,40]\); \(C\le 0\) blocks \(4\pi^2\). First sign-change only; adjacent samples can straddle the 0-rev / 1-rev node. | `lambert.py:184-220,265` | LIVE API | Medium |
| B-M4-LAM-4 | Prograde = \(h_z>0\). Earth–Venus 120 d takes the long way **331.67°** / 40 km/s. Polar \(h_z\approx 0\) gets an arbitrary branch. | `lambert.py:71-79` | LIVE API | Medium |
| B-M4-LAM-5 | Accuracy tests mock Lambert (Q5). Reference file is self-hash, not Battin/GMAT. \(\mu=k^2\) consistent AU/day. | `test_benchmark_accuracy.py`; `test_lambert_solver_reference.py` | CI | Medium (Q5) |

### M7 Apparent \(\beta\) / causality — in

Source: [M7 Apparent beta](7c33ede3-9fe3-42eb-aab6-eb16edf8013c)

L9 confirmed. Default `#agn-observer-frame` is **checked**. H29 hypothesis is a separate control.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M7-BET-1 | Transverse \(\beta_\mathrm{app}=\beta\sin\theta/(1-\beta\cos\theta)\) multiplies **radial** front progress. Sgr A* defaults → **1.965c**. Unused \(dt_\mathrm{obs}/dt_\mathrm{em}=1-\beta\cos\theta\) sits next to it. Visual Sun-hit 4.07 s vs GW fire at 8 s. | `smbhPropagation.ts:340-347`; `agnShockwaveEngine.ts:339-350` | LIVE | High (L9) |
| B-M7-BET-2 | H29 divides \(t_\mathrm{light}\) by `frameSpeedOverC` (~**2.04c** at WarpWave) including `propagation:'lightspeed'`. GW/EM/ν arrive **13,591 yr** before \(\Delta r/c\) (26,675 yr). Tiny flare \(10^{39}\,\mathrm{erg}\) still **1.12c** / 2762 yr lead. | `smbhPropagation.ts:26-32,66-92,513-551` | LIVE if H29 | Critical |
| B-M7-BET-3 | `update()` then multiplies the already-compressed display front by \(\max(\beta_\mathrm{app},v_\mathrm{frame})\) again (stacked \(\sim 4.16c\) if both are physics). Aberration absent; Doppler computed and unused. M87 catalog \(\beta_\mathrm{app}=6.3\) unused (engine 35° → 2.85c). | `agnShockwaveEngine.ts:339-350`; `smbhPropagation.ts:584-612` | LIVE | High |

### M7 Relativity leftovers — in

Source: [M7 Relativity misc](d2a22110-d8ec-49ad-9b7f-2f9586904f0c)

No light-time, aberration, Shapiro, PPN, or grav-redshift on the solar-system path. UTC−TDB not re-filed. No TT−TDB 1.7 ms converter.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M7-REL-1 | Planets and sunlight are simultaneous-\(t\). Earth LT ~499 s ≈ 20″ of orbital motion; Mercury ~32″. SPICE/Horizons `NONE`. | `solarSystemModel.ts:106-119`; `main.ts:1153-1160`; `ephemeris_service.py:168-213` | LIVE | Medium |
| B-M7-REL-2 | PR Doppler sign flipped: code \((\dot r\,\hat r-v)\) vs Burns \(-(\dot r\,\hat r+v)\). Circular OK (only \(-v_\perp\)); receding grain should see less flux. Rebound callback is SRP-only. | `radiation_pressure.py:135-140,205-209` | LATENT (unwired) | Medium |
| B-M7-REL-3 | Synthetic belt/KBO \(P=365.25\,a^{3/2}\) vs Gaussian year 365.25690 (**−19 ppm**, ~10⁴ km/yr at 2.5 AU). `asteroidDistributions.ts` uses the correct \(2\pi\sqrt{a^3/\mu}\). | `asteroidBelt.ts:180`; `kuiperBelt.ts:381` | LIVE | Low |
| B-M7-REL-4 | Earth spin uses app JD as UT1 (no DUT1/ERA). Second clock beyond UTC−TDB. | `main.ts:623-635`; `planets.ts:94` | LIVE | Low |

### M8 Worker units — in

Source: [M8 Worker units](656ee33f-6232-42cb-83e3-604339bb83ec)

Closed packing items still hold. `1e12` is **not** double-applied.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M8-WRK-1 | Uncapped rAF `dt` still feeds JD **and** metric. Hidden-tab hitch of \(T\) s → \(\Delta\mathrm{JD}=T\times\mathrm{scale}\); H29 uses raw wall \(T\). Rewind still applies a **forward** wall-clock metric shift. | `main.ts:1124-1128` | LIVE | High (H9) |
| B-M8-WRK-2 | Accepted snapshots apply older `tickJd` while HUD/camera use current JD. Window \(\lvert\mathrm{scale}\rvert\times 0.05\) d = **6 sim days at 120 d/s**. Steady one-tick lag \(\approx\mathrm{scale}/\mathrm{fps}\) (0.067 d at 4 d/s @ 60 fps). Rewind hitch can replace current Kepler with a stale snapshot. | `main.ts:790-903` | LIVE | High (H8) |
| B-M8-WRK-3 | Source-distance sign inverted: `sourceDistanceCm + projectedDistCm` should be minus. Worker set is 10 bodies **including Pluto**; catalog 434 with moons off. | `solarSystemModel.ts:179`; `main.ts:114-123` | LIVE | Medium |

### M8 Moon frames — in

Source: [M8 Moon frames](cede6417-935d-4b2c-8f94-add2d36d467e)

Epoch DCM is correct (Galileans ≤0.08°, Charon 0.08°, Ariel 0.00°). Ω is not double-rotated. `showMoons=false`.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M8-MOO-1 | After conversion, `nodePrecessionYears` advances **ecliptic** Ω, not the source pole. Cordelia at J2000: **117.68°** plane (ΔΩ 15000° about ecliptic \(z\)); frozen converted plane 0.26°. Uranus pole is 7.72° from the ecliptic — worst case. Pin 180° hides it. Comment “orbitMath never reads node rates” is stale. | `catalog.ts:365-369,600`; `orbitMath.ts:115-117`; `moonFrameCheck.ts:62-71` | Armed | High (C2 compose) |
| B-M8-MOO-2 | Titan/Iapetus/Phoebe: plane OK (0.28° / 1.56° / 3.97°); `dr/r` 1.91 / phase-data defect. Pin 200% hides Saturn element errors, not the DCM. | `moonFrameCheck.ts:33`; `moons.json` | Armed | Medium (Q3) |
| B-M8-MOO-3 | Europa +10 y: plane walks 3.04° off the 0.50° Laplace cone (should stay on it). IAU \(T\)-terms over 25 y are ~0.001° (J/S) — not the issue. | same secular path | Armed | Medium |

### M6 Kirkwood / Trojans — in

Source: [M6 Kirkwood Trojans](21b683a6-7b04-451d-93cb-81490234fe23)

Live belt is MBA-only. Trojans/Hildas exist only in unused `asteroidDistributions.ts`.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M6-KIR-1 | Live Kirkwood **centers** <0.002 AU; boxes **2–6× wider** than empty cores (3:1 residual 10%, 7:3 **52%**). Missing 8:3 / 9:4. Procedural \(a\) is uniform [2.06, 3.28], not the commented bimodal. | `asteroidBelt.ts:52-58,122-128` | LIVE | Medium |
| B-M6-KIR-2 | Unused Trojans: \(M\) offset ±60° but \(\Omega,\omega\) uniform → \(\lambda\) uniform. \(\varphi=\lambda-\lambda_J\) RMS **104° ≈ 9.4 AU**; 50/50 L4 vs L5. Hildas: comment “resonance angle” then `M=random*360`; \(\varphi_{3:2}\) RMS **104° ≈ 7.2 AU**. | `asteroidDistributions.ts:153-177` | LATENT | High (labels only) |
| B-M6-KIR-3 | Catalog 100k: **0** objects in Hilda/Trojan \(a\) windows (filter MBA \(2.0\le a\le 3.5\)). Renderer has no tadpole/Hilda lock. | `build_asteroid_phase1_dataset.py:41-43`; `beltRenderer.ts:126-163` | LIVE | Info |

### C2 Residual types — in

Source: [C2 Residual types](945f6b82-c7f9-4c56-b17d-92ff24359003)

`tsc --strict`: **280 errors**. No mypy/pyright/Zod. T1–T12 not re-listed.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-C2-TYP-1 | Kuiper typed `number[][]`; wire payload is `{positions,velocities,binary_pairs}`. | `simulationClient.ts:17,75,153`; `kuiper.py:447-470` | LATENT | High (L2 shape) |
| B-C2-TYP-2 | WS `ServerBodyState` drops `vel` (Python always emits it). `IncomingMessage` now includes `error` but never handles it. | `simulationClient.ts:8-10,27-33,149-161` | LATENT | Medium |
| B-C2-TYP-3 | Extra clones: `SceneBodyLike`, `CatalogBodyLike`, `ModelWorkerCatalogBody`; fourth solar `*Like` with `pfss_field_lines?: any`. Two `AsteroidBucket` types. HTTP responses untyped `json()`. | `bodyManager.ts:3-8`; `solarMagnetics.ts:28-33`; `trajectory/index.ts:142` | LIVE + LATENT | Medium |
| B-C2-TYP-4 | `SimulationState.backend` includes `'tudat'`; server id is `tudatpy`. Engine ABC `get_orbital_elements` vs Rebound/Tudat `Dict`. | `stateStore.ts:25`; `base.py:128`; `rebound_nbody.py:538` | LATENT | Low |

### C4 Residual tests — in

Source: [C4 Residual tests](031659cc-1431-4c62-a719-bc9b9cff7dcf)

Q1–Q9 not re-listed. **No test** asserts energy, \(\lvert v_\infty\rvert\), vis-viva, or Tsiolkovsky.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-C4-TST-1 | `catalog.test.ts` clones the moon-frame SUT (`expectedConvertMoonOrbitFrameToEcliptic`); a shared sign error stays green. Secular rates gated only by sign. | `catalog.test.ts:170-268` | CI | High |
| B-C4-TST-2 | Porkchop “best ≤ last” is a sort tautology. Lambert existence only \(\Delta v\ge 0\). AIA proxy test **asserts `jd is None`**, locking H2. Mission happy path: Isp 1000 s / 2e6 kg / threshold 1.0 → `valid: True` only. | `test_trajectory_regression.py:40-43,117`; `test_solar_physics_api.py:131`; `test_mission_agents.py:30-47` | CI | High |
| B-C4-TST-3 | Kuiper binary pin is `max_sep*2` (400k km vs comment 200k). Planet Horizons budgets “~2× measured worst.” CH wind test never requires `len(in_hole)>0`. | `test_kuiper_binary.py:91-98`; `planetPositionCheck.ts:82-86` | CI | Medium |
| B-C4-TST-4 | N-body Horizons/seek/`energy()` mocks never call `get_energy_error`. Lambert reference never checks \(\varepsilon=v^2/2-\mu/r\) at both ends. | `test_nbody_horizons_accuracy.py:61-80`; `test_lambert_solver_reference.py:53-60` | CI | Medium |

### M6 Binary mutual orbits — in

Source: [M6 Binary mutual](0c753d0b-40cb-4965-8aa3-3dcb5b994f1b)

No asteroid binary math. Charon tidal lock is correct (1.9 s); Nix/Hydra not force-locked.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M6-BIN-1 | Pluto particle **is** the barycenter (no \(a_1=2127\,\mathrm{km}\) wobble). Charon (if shown) is parented at full relative SMA 19600 km vs barycentric 17473. Pair COM **2127 km** off. Horizons 999 vs N-body 9: same 2127 km. | `jpl_horizons_de441_j2000_barycenters.json:134-141`; `moons.json:9221`; `ephemeris_service.py:43` | LIVE Pluto / LATENT Charon | High |
| B-M6-BIN-2 | Frontend KBO: \(a_1=a\,q/(1+q)\) is right, then companion is added to the **already-offset** primary → displayed sep \(=a/(1+q)\). Equal-mass 200k km → shown **100k km**. | `kuiperBelt.ts:346-360,465-512` | LIVE | High |
| B-M6-BIN-3 | Charon \((a,P)\) matches **system** \(\mu=975.5\) (+158 s / 3.75 km), not Pluto-only 869.66. Catalog mass 1.303e22 is 10.85% low for MGA/API; N-body GM is OK. | `moons.json`; `planets.ts:264`; `mga.py:111` | LIVE μ / LATENT Charon | High (H11) |
| B-M6-BIN-4 | No Hill clamp. 40 km class \(200{,}000/r_H=1.42\) (outside Hill). Backend \(m=0\) → tight pairs gone in **1.4–45 d**. `round(...,5)` AU = **1496 km** grid. | `kuiperBelt.ts:111-114`; `kuiper.py:367-458` | LIVE / activate | Medium |
| B-M6-BIN-5 | Frontend \(e>0\) rebuilds mutual \(\mathbf{r}\) from \(\hat r\) (compose B-M1-SOL-2): up to \(\sim O(a)\) (~3e5 km). Backend fractions inverted (B-M2-KUI-3). | `kuiperBelt.ts:271-344` | LIVE | High |

### M1 Moon composition — in

Source: [M1 Moon composition](32f97fe3-0b43-499d-8061-8b045d5d713a)

`world=\mathrm{parent}+r_\mathrm{sat}` is one BFS path. All moon world composition is **LATENT** (`showMoons=false`). Earth-as-EMB mesh is LIVE. Mutual-event/shadow math is absent.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M1-CMP-1 | EMB + geocentric Moon → **4668 km** along the line (both Earth mesh and Moon). Gate compares `@399` and cannot see it. J2000 Moon residual 4427 km is separate element quality. | `planets.ts:85-114`; `moons.json:11`; `solarSystemModel.ts:125` | Earth LIVE / Moon LATENT | High (R-04) |
| B-M1-CMP-2 | Scene graph **undoes** parent+\(r_\mathrm{sat}\): meshes are heliocentric siblings; `bodyManager` writes parent-relative coords. With moons on: Moon near the Sun (**1.50×10⁸ km**). Orbit lines *are* parented. | `main.ts:366-407,864-868`; `bodyManager.ts:53-98` | Armed | Critical if `showMoons` |
| B-M1-CMP-3 | Source-frame \(\dot\Omega/\dot\omega\) after ecliptic conversion: Cordelia plane **117.68°** = predicted 117.75° from \(\Delta\Omega=+240^\circ\). Same class: 14 URA184 moons, Phobos, Hydra. Luna is ecliptic so this axis error does not apply to C2. | `catalog.ts:365-600`; `orbitMath.ts:115-119` | Armed | High (B-M8-MOO-1) |
| B-M1-CMP-4 | Ldot double-count not just Luna: Io \(\dot\varpi=270^\circ/\mathrm{y}\) (~2×10⁶ km/y, saturates at 2a in a year); Phobos 171°/y; Enceladus 123°/y. | `catalog.ts:365-378`; `orbitMath.ts:132-136` | Armed | High (C2) |
| B-M1-CMP-5 | No reflex: Moon ~12 m/s, Charon ~23 m/s. Jupiter barycenter wander ~80–230 km; Saturn ~289 km (Titan); Pluto/Charon **2127 km**. Warp shifts each `worldPosition` independently (`world ≠ parent + r_sat`). | `solarSystemModel.ts:126,170-193` | Armed / H29 LIVE on planets | Medium |
| B-M1-CMP-6 | Gate never looks at Mars / Umbriel / Oberon / Nix / Hydra. Default tol 0.15 hides Enceladus 9.6% and Triton 7.1%. Duplicate Puck still ingested. | `moonFrameCheck.ts`; `moons.json:8321,8541` | CI | Medium (H12) |

### C1 Residual consistency — in

Source: [C1 Residual consistency](4f31302c-6b12-4134-ba01-2b364d534e89)

R-02–R-05 / H14 not re-filed. No `luna`, port 8000, or AU 149597870.691.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-C1-CON-1 | Client `backendBaseUrl()` hardcodes `:8042`; `dev-full.mjs` advertises `--backend-port` the live client never reads. CORS lists unused `:3000`, only `http://localhost:5173` (no https, no `:4173`, no LAN) while Vite binds `0.0.0.0`. | `main.ts:150-155`; `server.py:104-109`; `scripts/dev-full.mjs:42-55` | LIVE | Medium |
| B-C1-CON-2 | Engine aliases: store `'tudat'`, server `'tudatpy'`, `SimulationClient` types `'kepler'` and maps non-rebound → `whfast`. | `stateStore.ts:25`; `server.py:859`; `simulationClient.ts:42,113` | LATENT | Medium |
| B-C1-CON-3 | Live visuals key `body.id === 'moon'`; catalog id is `moon-earth-moon`. `createBodyIdResolver` exists and **`main.ts` never imports it**. | `main.ts:284`; `catalog.ts:461`; `stateStore.ts:53-78` | LIVE | High (R-05 visuals) |
| B-C1-CON-4 | Rounded AU `1.496e11` on H29 path vs IAU `1.495978707e13` on Kepler warp. \(M_\odot\) catalog 1.98847e30 vs H29 1.989e33 g. Obliquity 23.439281 vs 23.439291111. | `smbhPhysicsConstants.ts:23-42`; `solarSystemModel.ts:176` | LIVE | Low |
| B-C1-CON-5 | Solar query defaults disagree: client `high/hybrid/liveData:true` vs server `operational/synthetic/false`. Moon texture catalog claims 9 jpgs; on disk only the JSON. | `sunController.ts:157-159`; `server.py:963-966`; `moonTextureCatalog.ts:14-132` | LIVE / LATENT textures | Medium |

### C3 Residual docs — in

Source: [C3 Residual docs](951a94c9-c063-4bef-a57e-ab2ba9b68052)

D1–D12 / Connect / 424 moons / 1.9M not re-listed. `dev:full` matches `package.json`. `npm test` still undocumented (Q9).

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-C3-DOC-1 | MGA module + README “hard flyby constraints”: only turn vs periapsis from **averaged** \(\lvert v_\infty\rvert\). Magnitude jump still `feasible`. `README.md:360` (“turn feasibility”) is closer. | `mga.py:1`; `README.md:272` | DOCS | Medium (C4) |
| B-C3-DOC-2 | Tudat header “10-minute intervals”; RK4 step is **300 s** and there is no 600 s output cadence. D8 AU/year remains the only extra AU/year sentence. Deeper: 30-day SPICE-reset overlay (B-M2-TUD-1). | `tudatpy_hooks.py:19,28` | DOCS | Low |
| B-C3-DOC-3 | Rebound “IAS15 machine-precision”; `ri_ias15.epsilon=1e-9`. Class “Full N-body” overstates the reduced / massless-small-body model. | `rebound_nbody.py:3,62,253` | DOCS | Medium |
| B-C3-DOC-4 | Galactic-tide docstring cites HT1986 but writes the coded (wrong-axis) tensor. Callback exists; **nothing imports it**. README says tides/SRP “require REBOUND” — they are never attached. | `galactic_tide.py:40-45`; `README.md:363` | DOCS | Medium |
| B-C3-DOC-5 | `orbitMath` comment: `periodDays` used by “satellite code” — satellites use TLE / `meanMotionRevDay`. README “Kepler clamps \(e\) at 0.9999999” is only `solveKepler`; fast path does not. Corona tree “(v3)” vs runtime `quasi_mhd_corona_v4`. | `orbitMath.ts:123-124`; `README.md:167,365` | DOCS | Low |
| B-C3-DOC-6 | Asteroid README extras beyond D4: `update(jd)` claimed to write instance matrices (only `uTimeDays`); claims `beltRenderer` consumes the pipeline (it does not); claims `orbitMath` import (none). | `src/sim/asteroids/README.md:22,31,62-66` | DOCS | Medium |
| B-C3-DOC-7 | Extra H29 “pure spatial translation, no kinetic acceleration.” Extra README “moons” as a live display option (no toggle). Verify scripts `verify:moon-frames` / `verify:planet-positions` exist and are undocumented. | `smbhPhysicsConstants.ts:299`; `README.md:204` | DOCS | Low |

### C5 Residual logic bombs — in

Source: [C5 Residual bombs](429871fe-d638-4330-8302-f1c4306873f5)

Does not refile H29, quadtree origin, CME life, NaN activity, uncapped dt, camera NaN duration, AIA 429, or health-always-ok. Kepler/Lambert/PFSS loops are bounded; quadtree has `MAX_LOD_LEVEL=7`; no factorial/gamma overflow. C5’s “100k `.bin` absent” is the same workspace-index miss as Pass A H10 — M6 packed the file on disk.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-C5-BOM-1 | No `webglcontextlost` / `restored` handler. GPU reset → blank Sun-Focus until reload. Uncaught throw if a WebGL context cannot be created (`main.ts` does not wrap the constructor). | `sceneSetup.ts:155`; `main.ts:175,1167` | LIVE | High |
| B-C5-BOM-2 | Worker snapshot gate checks `Float64Array` + length only. NaN/Inf Kepler/H29 coords are accepted and painted as vanished bodies. | `modelWorkerContract.ts:143-148`; `main.ts:694,807-828` | LIVE | High |
| B-C5-BOM-3 | `sampleBodyStateAt` parent cycle → unbounded recursion (no visiting set). Shipped catalog is a tree. Hohmann from/to the Sun: `r=0` → Inf Δv; unknown id → null deref. | `solarSystemModel.ts:196-236`; `localPlanner.ts:16-40` | LATENT | Medium |
| B-C5-BOM-4 | Rebound seek `while True` until checkpoint ≥ target. Huge finite JD → many integrates; NaN target never satisfies `>=` → hang. WS rejects NaN JD but not huge finite. | `rebound_nbody.py:458-464`; `server.py:1503` | LATENT API | High |
| B-C5-BOM-5 | `generateStochasticFlares`: `rate≤0` walks \(t\) backward → main-thread hang. Live AGN hardcodes `rate=0.3`. PFSS `int((jd-epoch)/27.2753)` OverflowError at `jd≈1e308` **outside** the live-data try → `/solar/physics` 500. | `smbhPropagation.ts:677-680`; `pfss_magnetogram.py:46`; `server.py:392-399,979` | Armed / API | Medium |
| B-C5-BOM-6 | Unused GPU Kepler: unguarded Newton, `period=0` → Inf, `e>1` → NaN. Mission `orbital.py` `TWO_PI/period` with no floor (TS uses `max(1e-9)`). Satellite `a=0` / `e≥1` → Inf J2. Phase-1 clamp allows `e=1`. | `asteroidShaders.ts:32-82`; `orbital.py:59-61`; `satellitePropagationCore.ts:78,129` | LATENT | Medium |
| B-C5-BOM-7 | Horizons `json.loads` uncaught (HTML body → planner throw). Manifest `response.json()` uncaught. WS reconnect backoff forever (no attempt cap; not a storm). | `ephemeris_service.py:222`; `localSystemRenderer.ts:641`; `simulationClient.ts:215-232` | LATENT | Low |

### M8 Nearby astrometry — in

Source: [M8 Nearby astrometry](ee686f72-5249-474d-9e8e-4381e3db6210)

H13 confirmed. Parallax \(d=1000/\pi_\mathrm{mas}\) and \(\mu_{\alpha*}\) handling are correct. Renderers unwired. `julianDateToJulianYear` / `PC_TO_AU` / `LOCAL_SYSTEM_MANIFEST_BY_NEARBY_ID` have **no definitions** in the repo.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M8-NEAR-1 | Rank 1 is **Proxima** (`alf Cen C`), not AB. Aliases are only `sys_id` / `identifier` / `catalog_name` — `sirius`, `alpha-centauri`, `proxima`, `barnards-star` miss (`barnard's star` slug ≠ `barnards star`). | `nearby_systems.py:124-135`; CSV row 1 | LATENT API | High (H13) |
| B-M8-NEAR-2 | RV stored, **never applied**. Distance frozen. 16 yr J2016→J2000: Proxima **75 AU**, Barnard's **373 AU**. Full unused \(\lvert v\rvert\): 32.7 / 142.4 / 17.6 km/s. Frame is ecliptic position, not galactic UVW. | `nearbySystemsRenderer.ts:273,318-326` | LATENT | High |
| B-M8-NEAR-3 | PM on a fixed-radius sphere at J2016 vs J2000 scene: Proxima tangential **80 AU** (110 AU with RV). If epoch frozen: same class. | `nearbySystemsRenderer.ts:305-316` | LATENT | Medium |
| B-M8-NEAR-4 | Interstellar marker on C; local manifest is **A-centric**. C↔AB **0.062 pc / 12 839 AU**. Manifest Proxima \(a=8700\) vs ~12 950 around AB (**4250 AU**). Sirius A vs barycenter **6.6 AU**. | `alpha-centauri.json:13-68`; `sirius.json` | LATENT | High |
| B-M8-NEAR-5 | Gaia `source_id` via float64: Barnard's DR3 off by **−256**. Current CSV has no Gaia rows (VizieR ingest). | `fetch_gaia_catalog.py:66-76,304-305` | Pipeline | Medium (P4) |

### M2 REBOUND energy / integrator — in

Source: [M2 REBOUND energy](d7628239-f4a4-4cf1-b804-9f7b67ea3320)

ICs are DE441 Cartesian (do not reopen Standish-IC). G pin is correct and load-bearing. Default IAS15 path is the one Horizons gates run. UI is LATENT.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M2-REB-1 | \(G=GM_\odot(\mathrm{DE440})\times(365.25\cdot86400)^2/\mathrm{AU}^3=39.476926\) (not \(4\pi^2\) or G=1). Leaving G at \(4\pi^2\) → Earth **4.6×10⁵ km** / 26 y. Masses \(GM_i/GM_\odot\). | `rebound_nbody.py:240-244` | LIVE API | Info (correct) |
| B-M2-REB-2 | `ri_ias15` is **None** on Rebound 5.1.1 (API is `sim.integrator.*`). Default \(\varepsilon=10^{-9}\) already; dead set is a no-op. “Machine-precision” overstated (\(\varepsilon=0\) in 5.x = fixed dt). Tests plant a fake `ri_ias15`. | `rebound_nbody.py:248-255` | LIVE API | Low (B-C3-DOC-3) |
| B-M2-REB-3 | WHFast/Mercurius: Jacobi + **Moon appended last**. Earth–Moon interaction/Kepler \(\approx 0.42\). Est. Earth \(10^3\)–\(10^5\) km in weeks; \(\mathrm{d}E/E\sim O(1)\). Mercurius has no `dt` / `r_crit`. IAS15 unaffected. | `rebound_nbody.py:258-259,314-329`; `server.py:143` | LIVE API / LATENT UI | High |
| B-M2-REB-4 | Energy computed (M☉ AU² yr⁻²) for WS `energy_error` only. No Jacobi, COM watch, or conservation gate. \(E_0\) is post-`move_to_com` at J2000. Reduced COM ≠ DE441 SSB by **118 km**. | `rebound_nbody.py:333-334,516-525` | LIVE API / LATENT UI | Medium |
| B-M2-REB-5 | SRP/tide **not attached**. Seek re-integrates (good); `step()` never checkpoints; ≤2 y reverse untested. Particle 0 = Sun (\(\lvert r_\odot\rvert=0.00767\,\mathrm{AU}\)). Pluto IC GM **975.5** is correct (H11 is Kepler-only). | `rebound_nbody.py:229-230,363-367,494-498` | LIVE API | Medium |
| B-M2-REB-6 | Newtonian vs DE441: missing GR Mercury perihelion \(\sim 3140\,\mathrm{km}\) / 26 y. Inner Horizons envelope **10 000 km** cannot fail a missing-GR test. Test particles (Ceres…) \(m=0\); later belt/KBOs wind M from 2461000.5 holding other elements. | `test_nbody_horizons_accuracy.py:25`; `rebound_nbody.py:285-312` | LIVE API | Medium |

### M1 Anomaly conventions — in

Source: [M1 Anomaly conventions](6b512384-a234-4a68-a42d-c8aac9ce32b6)

Canonical store is J2000 ecliptic **degrees**, tuple \((a,e,i,\Omega,\omega,M)\). ϖ/L are derived planet rates only. Live Phase-1 catalog is SBDB and did **not** inherit the MPCORB ω/Ω off-by-one.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M1-ANM-1 | Eight planets: UI \(M(T)=M_0+(L̇-ϖ̇)T\); backend `orbital.py` / `bodies.py` have **no** secular rates → \(n=2\pi/P\). Match at J2000, walk apart (the `planetPositionCheck` along-track class). Horizons/SPICE hide it when they succeed. 2026 km: B-M1-STA-3. | `orbitMath.ts:128-146`; `orbital.py:61-62`; `bodies.py` | LIVE API vs UI | High |
| B-M1-ANM-2 | SPICE `"J2000"` is **EME2000 equatorial**; Horizons `REF_PLANE: ECLIPTIC`; Kepler elements ecliptic. Tudat-present Lambert/MGA get equatorial states; “prograde” is \(h_z\) of that frame. Live km: B-M5-EPH-1. | `ephemeris_service.py:175,211` | LIVE if Tudat | High |
| B-M1-ANM-3 | MPCORB slices still off-by-one (`slice(38,47)` / `(49,58)`). \(\omega,\Omega\ge 100^\circ\) lose the hundreds digit. Latent until `catalog_fetcher` is run; named/SBDB bodies are JPL. Same script: SBDB `per` (days) as \(n\) → \(360/\mathrm{per}\) ~0.2 d. | `catalog_fetcher.ts:270-272,430-465,500-501` | LATENT pipeline | Medium (P1/P3) |
| B-M1-ANM-4 | Trojans set \(M_J\pm 60^\circ\) with random \(\Omega,\omega\) (should constrain \(L=M+\Omega+\omega\)). Live belt just randomizes \(M\). `catalog.ts` names the node `omega` while computing \(\Omega\) (math OK). | `asteroidDistributions.ts:167-176`; `catalog.ts:128-138` | LATENT / name | Low |
| B-M1-ANM-5 | TLE RAAN is equatorial; conversion is Earth-obliquity only (not TEME→J2000→ecliptic). Dead 1.9M shader `aOrbitParams2` is vec3 (no epoch) vs live belt vec4. | `satelliteSystem.ts:229-266`; `asteroidShaders.ts:25` vs `beltRenderer.ts:62` | LATENT | Medium |

### M2 Tide / SRP tensors — in

Source: [M2 Tide SRP tensors](cc8ca082-4ba7-4212-b631-453165c0808b)

Prior art holds. Nothing in the live integrators applies tide, SRP, PR, Yarkovsky, or 1PN. Sign bugs stay dormant until the callbacks are wired.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M2-TID-1 | Tide tensor is exactly \(a=(- \Omega^2 x,-\Omega^2 y,-(4\pi G\rho-\Omega^2)z)\). Literature (Levison/Brasser) is \((+\Omega^2 x,-\Omega^2 y,-4\pi G\rho z)\). \(x\) **compresses** instead of Hill stretch; \(z\) ~12% weak. No Coriolis. | `galactic_tide.py:40-61` | LATENT | High if wired |
| B-M2-TID-2 | Callback applies \((dx,dy,dz)\) in **ecliptic** REBOUND axes. No galactic rotation (pole ~60° off). Would drive Kozai about the ecliptic, not the galactic plane. Skips \(r<1000\) AU. Zero importers. | `galactic_tide.py:110-142`; `rebound_nbody.py:51-54` | LATENT | High if wired |
| B-M2-TID-3 | SRP cannonball \(\beta GM/r^2\) in integrator units is the right sign. No shadow. \(\beta\) from `getattr(p,'beta',0)` (docstring says `params['beta']`). Tudat `enable_srp` is a **dead flag** (never added to `accel_dict`; server never passes it). | `radiation_pressure.py:185-209`; `tudatpy_hooks.py:177,256-286,315` | LATENT | Medium |
| B-M2-TID-4 | PR Doppler \(\dot r\,\hat r\) is **opposite** Burns (should be \(-\dot r\,\hat r\)). \(-v\) drag is OK. No 1PN / EIH / REBOUNDx `gr`. Mercury 43″/cy GR perihelion is not in the force model. | `radiation_pressure.py:102-142`; `rebound_nbody.py:172-175` | LATENT / ABSENT | Medium |

### M2 IC / GM masses — in

Source: [M2 IC GM masses](01adcf6e-b909-4acd-a25d-423046a0429b)

N-body GMs match `gm_de440.tpc` exactly. Kepler/MGA use catalog \(G\times m\). Pluto H11 confirmed as planet-only vs system.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M2-GM-1 | Pluto catalog \(1.303\times 10^{22}\,\mathrm{kg}\) = DE440 **planet** (869.66). N-body BODY9 **975.5** (−10.85%). Same class, smaller: J/S/U/N planet-only **−0.01–0.02%** vs system. Earth catalog vs EMB **−1.21%**. | `planets.ts:264`; `bodies.py:151`; Horizons JSON `:139` | LIVE Kepler/MGA | High (H11) |
| B-M2-GM-2 | Flyby \(\mu=G_\mathrm{SI}\times\mathrm{mass_{kg}}\) (~+30 ppm even on Mercury). Rebound majors never use catalog kg. Moon has **no** catalog mass → lunar assist `missing_body_mass_or_radius`. | `mga.py:93-111`; `orbital.py:25-27`; `catalog.ts:580` | LIVE API | Medium |
| B-M2-GM-3 | Cross-model IDs: Kepler Earth = Horizons **3** EMB; N-body **399+301**; mission Horizons **399/999** vs N-body **9**. Pluto 999 vs 9 is the large position split (~2127 km). | `ephemeris_service.py:33-44`; `initial_conditions.py:73-85` | LIVE API | High (R-04) |
| B-M2-GM-4 | **Corrected (M5 live Horizons):** omitted `TIME_TYPE` defaults to **TDB**, not UT (0.000 km vs explicit TDB). Composition still stands: planner UTC midnight JD is sampled as TDB → **~2044 km** Earth / **~3151 km** Mercury on 2026-09-06. | `ephemeris_service.py:205-218`; `constants.ts:55-65` | LIVE API | High (R-02 compose) |
| B-M2-GM-5 | Planet-position fixture stores \(v_x,v_y,v_z\); accuracy never uses them (`velocity=null`). Pluto omitted from the 8-body gate. Mixed asteroid epochs 2461000.5 vs J2000. | `planetPositionCheck.ts:276,308-309`; `planet-positions-horizons.json` | CI / LIVE Kepler | Medium (Q4) |

### M3 PFSS harmonics — in

Source: [M3 PFSS harmonics](def8464a-4273-4a0e-ab41-b214ed60e3f6)

R-14 / H6 confirmed. The SH error is **larger** than sine-lat→θ: a GONG dipole projects to \(g_{10}/B_0=-3/4\), and a broken Legendre recurrence plus \(\varepsilon_{m>0}=2\) destroy photospheric \(B_r\) at production \(\ell_{\max}\). \(R_{\mathrm{ss}}=2.5\,R_\odot\) and \(B_{\tan}(R_{\mathrm{ss}})=0\) are correct; docstring \(B_r(R_{\mathrm{ss}})=0\) is wrong. Frontend does not re-solve the field.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M3-PFS-1 | Cache key = CR only. First `jd`/`activity`/`ℓ_{\max}`/`n_lines` wins for ~27.3 d. ~2700 synthetic maps can share one slot. | `pfss_magnetogram.py:1110-1124` | LIVE | High (H6) |
| B-M3-PFS-2 | GONG CEA is south-first \(\mu=\sin\lambda\). Code uses uniform \(\theta\) + north-first row 0. Physical dipole → \(g_{10}/B_0=\mathbf{-3/4}\) (measured −0.750). `LONG0=324` unread → tesseral modes rotated by \(-m\,\mathrm{LONG0}\). Substitute FITS still tagged `gong_cr{requested}`. | `pfss_magnetogram.py:133-176,335-348,1146` | LIVE | Critical |
| B-M3-PFS-3 | Associated Legendre: sectorals are Schmidt; interior \(\ell\ge 2,\,m\le\ell-2\) uses orthonormal-on-[-1,1] coeffs on Schmidt starters. \(\langle P_2^0,P_0^0\rangle=-0.945\). Pure 5 G dipole at \(\ell_{\max}=3\): pole \(B_r=\mathbf{-1.47}\) G, leaked \(g_{30}=-10.87\). Production \(\ell_{\max}=9/12/15`. | `pfss_magnetogram.py:280-312` | LIVE | Critical |
| B-M3-PFS-4 | Inverse uses \(\varepsilon_{m>0}=2\) on Schmidt \(P\) → all tesseral power **doubled** (\(g_{11}=2\) for a unit \(P_1^1\cos\phi\)). | `pfss_magnetogram.py:366-370` | LIVE | High |
| B-M3-PFS-5 | \(c_\ell(r)\) matches modern Hoeksema/WS. \(B_{\tan}(R_{\mathrm{ss}})=0\) measured. Photospheric \(B_r\) not recovered for \(\ell_{\max}\ge 3\). Docstring claims \(B_r(R_{\mathrm{ss}})=0\). | `pfss_magnetogram.py:387,435-441` | LIVE / comment LATENT | Medium |
| B-M3-PFS-6 | WSA labeled Arge 2003 is AP2000 \(267.5+410 f_s^{-2/5}\) times a dead \(\theta_b\) gate (grid min gap \(5^\circ>2.58^\circ\)). \(f_s\) uses \(\lvert B\rvert\) not \(\lvert B_r\rvert\). Timeout ⇒ closed. Tests use hand-picked \((f_s,\theta_b)\) that never occur on the map. | `pfss_magnetogram.py:714-834,956-1006` | LIVE | Medium (B-M3-PAR-5) |
| B-M3-PFS-7 | No \(L_0\)/Carrington→inertial map. PFSS arcs parented to un-tilted `node` (mesh Y-up, \(7.25^\circ\) unused). Frontend copies arcs or a vacuum dipole **without** source-surface BC. Tests never project a known \((\ell,m)\). | `sunController.ts:250`; `solarMagnetics.ts:110-168,246-251` | LIVE | High (H1) |

### M5 Ephemeris frames — in

Source: [M5 Ephemeris frames](72777b7f-3681-4bd4-860a-aa43a5350c40)

There is no `backend/mission/ephemeris.py`. The live sampler is `ephemeris_service.py`. `auto` prefers SPICE → Horizons → Kepler. Geometric `NONE` is correct for Lambert (no apparent-place claim). `REF_SYSTEM=J2000` vs `ICRF` on the same ecliptic plane: **0.000 km**. No Chebyshev interpolator lives in this module.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M5-EPH-1 | SPICE `"J2000"` is ICRF/EME2000 **equatorial** with **no** \(R_x(\varepsilon=23.439291^\circ)\). Horizons is already `REF_PLANE=ECLIPTIC`. Tudat engine rotates (`tudatpy_hooks.py:138-150`); this sampler does not. Live Sun-centered J2000 TDB `NONE`: Earth **5.878e7 km**, Jupiter **1.787e8 km**, Neptune **1.519e9 km** vs ecliptic. `auto` can mix frames **in one Lambert** (planets SPICE equatorial, asteroids Horizons/Kepler ecliptic). Overlay on the ecliptic scene is a 23.4° tilt. | `ephemeris_service.py:172-187` vs `:211-212`; `orbital.py:52-104` | LIVE if Tudat / mixed `auto` | Critical (B-M1-ANM-2 km) |
| B-M5-EPH-2 | Incoming `jd` is unlabeled. SPICE: `(jd-2451545)×86400` as Tudat ET (**TDB**). Horizons: `TLIST` only; live VECTORS header is TDB (corrects B-M2-GM-4 “default UT”). Planner date pickers are UTC midnight (`constants.ts:55-65` → `/trajectory/*`). Intended 2026-09-06 00:00 UTC is sampled as 00:00 TDB ≈ 23:58:51 UTC → **~2044 km** Earth, **~3151 km** Mercury. TDB vs TT: **0.043 km** Earth. | `ephemeris_service.py:168,217`; `server.py:699,715,770` | LIVE API | High (R-02 compose) |
| B-M5-EPH-3 | Catalog-name fallback `name.split("(")[0]` silently hits the **wrong solar-system object** and still returns `source="horizons"`. Live: Hebe → Thebe (514) **5.85e8 km**; Metis → Jovian Metis (516) **1.06e9 km**; `2002 MS4` token `2002` → 2002 Euler **7.10e9 km**. Ambiguous names (Psyche, Europa, Iris, Juno) fail closed → Kepler. | `ephemeris_service.py:242-247`; `bodies.py:344,378,666` | LIVE API (`horizons`/`auto`) | Critical |
| B-M5-EPH-4 | Mapped planets are internally consistent planet-centers (399/599, not 3/5). vs n-body IDs: 399 vs 3 EMB **4890 km**; 599 vs 5 **64 km**; 699 vs 6 **300 km**. Moon not in this service (399 vs 301 **4.02e5 km**). Origin `CENTER=500@10` (Sun) vs committed snapshot `500@0` SSB: Earth **1.147e6 km**. | `ephemeris_service.py:19-44,210`; `initial_conditions.py:77`; Horizons JSON `:11,34` | LIVE API | High (R-04 / B-M2-GM-3) |
| B-M5-EPH-5 | Geometric `NONE` is correct. If treated as apparent from the Sun: Earth LT **14861 km**, LT+S **14864 km**, stellar increment **3.4 km**. Earth–Mars apparent (not implemented) ~\(6\times 10^3\)–\(3\times 10^4\) km. | `ephemeris_service.py:176,185,213` | Note | — |
| B-M5-EPH-6 | This module does **not** interpolate. One evaluate per `(provider, body, round(jd, 9))` → Earth **~0.003 km**. Tudat wrapper interpolator is **linear** on 5 min RK4 nodes (`INTEGRATOR_STEP_S=300`, docstring still says 10 min): mid-interval Earth **~0.067 km**, Mercury **~0.4 km**. Held endpoint (failed refresh) ~**30 km**/s on Earth. Committed DE441 JSON is a single unused epoch. | `ephemeris_service.py:112,116`; `tudatpy_hooks.py:169,600-623` | LIVE API / LATENT Tudat | Low (docs: B-C3) |

API-LIVE contract: `horizons` / `auto` without Tudat = ecliptic heliocentric geometric TDB (UTC picker still ~2×10³ km). `spice` / `auto` with Tudat = **equatorial** (~5.9×10⁷ km vs ecliptic on Earth). `kepler` = ecliptic two-body, same unlabeled JD. Small-body `horizons` can return a different object at 10⁸–10⁹ km with no error.

### M1 Standish \(L̇\) — in

Source: [M1 Standish Ldot](b904f5ce-a69e-4a5c-969a-106b892a22e2)

Prior art holds: Mercury–Neptune use \(M=L(T)-\varpi(T)\) when `meanLongitudeDegPerCentury` is set. Moons still use \(n=2\pi/P\) plus \(\dot\omega/\dot\Omega\) (C2 / R-08 / B-M1-CMP-4). Table 1 epoch elements for all eight planets (and Pluto’s epoch \(\omega=\varpi-\Omega\), \(M=L-\varpi\)) match JPL to ~0 ULP. No \(\omega/\varpi\) swap on any live body. Planet \(\dot I,\dot\Omega\) are Table 1 only — IAU precession-in-longitude is not added.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M1-STA-1 | Pluto has Table 1 **epoch** \((a,e,I,\Omega,\omega,M)\) but **no** century rates (\(\dot a=-0.00031596\), \(\dot e=+5.17\times 10^{-5}\), \(\dot I=+4.818\times 10^{-5}\), \(L̇=145.20780515\), \(\dot\varpi=-0.04062942\), \(\dot\Omega=-0.01183482\)). Falls through `n=2\pi/P` with \(P=90560\,\mathrm{d}\) (\(360/L̇=90553\,\mathrm{d}\)). At \(T\approx 0.267\,\mathrm{cy}\) (2026): frozen perihelion \(\sim 2.8\times 10^5\,\mathrm{km}\), missing \(\dot a\sim 1.3\times 10^4\,\mathrm{km}\), \(P\) vs \(L̇\sim 3\times 10^4\,\mathrm{km}\). Current JPL page dropped Pluto from Table 1; comment at `orbitMath.ts:132-134` names this path. Planet Horizons gate is 8 bodies (Q4). | `planets.ts:269-278`; `orbitMath.ts:132-136` | LIVE | High |
| B-M1-STA-2 | Standish \(T=(T_\mathrm{eph}-2451545)/36525\) wants **TDB**. Code uses UTC Unix JD / 36525. TT−UTC \(\approx 69.2\,\mathrm{s}\) (2026) along-track \(L̇\Delta t\): Mercury \(3.3\times 10^3\), Venus \(2.4\times 10^3\), Earth \(2.1\times 10^3\), Mars \(1.7\times 10^3\), Jupiter \(9.0\times 10^2\) km. Same composition class as B-M5-EPH-2; Horizons planet gate uses TDB JDs so it cannot catch this. | `orbitMath.ts:4,109`; `constants.ts:10,31-32` | LIVE | High (R-02 compose) |
| B-M1-STA-3 | Backend Kepler never implements Standish time laws: `n=2\pi/P`, no \(a(T)\ldots L(T)\). `bodies.py` copies epoch elements (comment still `planets.js`) and omits all secular keys. Frontend Earth vs this fallback at 2026: frozen \(\varpi\sim 3.8\times 10^3\,\mathrm{km}\), \(\dot e\sim 1.8\times 10^3\,\mathrm{km}\). Jupiter/Saturn \(P\neq 360/L̇\) (\(4332.589\) vs \(4332.817\); \(10759.22\) vs \(10755.88\)) → extra \(\sim 6\times 10^5\) / \(2.5\times 10^5\,\mathrm{km}\) if that path is used. | `orbital.py:52-62,111-112`; `bodies.py:30-158` | LATENT (`kepler` fallback) | High (B-M1-ANM-1 km) |
| B-M1-STA-4 | Coded model is Table 1 **linear** rates only (no Table 2 \(b,c,s,f\)). Valid **1800–2050**. At \(120\,\mathrm{d/s}\), 2050 is ~70 s of wall clock from 2026. JPL Table 1 Jupiter longitude budget inside the window is \(400''\) (\(\sim 1.5\times 10^6\,\mathrm{km}\)). | `planets.ts`; `orbitMath.ts:109` | LIVE if warped out of fit | Medium |
| B-M1-STA-5 | `orbitMath.test.ts` drifts Mars **without** `meanLongitudeDegPerCentury`, so it asserts the legacy \(n+\dot\omega\) path. `catalog.test.ts` only checks \(36000/P\) signs. | `orbitMath.test.ts:46-54`; `catalog.test.ts:251-258` | CI | Medium (Q1) |

Moon double-count reconfirmed at current lines: Luna \(\dot\varpi=40.68^\circ/\mathrm{y}\) → \(2.73\times 10^5\,\mathrm{km/y}\) (\(7.3\times 10^6\,\mathrm{km}\) by 2026); Io \(270^\circ/\mathrm{y}\) → \(2.0\times 10^6\,\mathrm{km/y}\) if armed. Hidden: `showMoons=false`. Not a new ID.

Belt / KBO instancing uses frozen \(n=2\pi/P\) (visuals). `ASTEROID_BELT_OBJECTS` / `KUIPER_BELT_OBJECTS` in `planets.ts` are unused on the frontend.

### M4 Porkchop / TOF — in

Source: [M4 Porkchop TOF](58075c22-cd56-47b8-b836-ffa86a6e7883)

API exercised in-process. `tof_min_days=0` → 422 holds. **Not guilty:** linear interpolation of planet \(\mathbf{r}\) (each cell samples exact JD). **Not guilty:** server `min_time` ≡ min-distance (that is `localPlanner` only). No frontend heatmap exists.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M4-PCH-1 | Porkchop Δv is bare \(\lvert v_{\infty,\mathrm{dep}}\rvert+\lvert v_{\infty,\mathrm{arr}}\rvert\). No C3 field (`_stumpff_c3` is universal \(c_3(z)\)). Live Earth→Mars kepler window: min-Δv **5.855 km/s** @ 330 d / **209.84°** (Type II). Min-C3 is a **different cell** (C3 11.21 vs 11.71). Patched LEO 200 km + Mars 300 km capture from the same \(v_\infty\) is **5.736**. Totals look close because arrival overcount and departure undercount cancel. | `lambert.py:290-305,407-416` | LIVE API | High (B-M4-CAP-1 km) |
| B-M4-PCH-2 | Failed / high-Δv cells are **omitted**, not \(\infty\). `points[:500]` after Δv-sort: UI 966-cell scan returned count=966, points=500, failures=0. The 466 valid high-Δv cells vanish (true max 84 vs payload max 33.7 km/s). A heatmap over `grid`+`points` would show **white holes that are neither 180° nor infinite Δv**. Exact \(\theta=180^\circ\) is still `None` (B-M4-LAM-1). | `lambert.py:178-186,398-440` | LIVE API | High |
| B-M4-PCH-3 | Porkchop has **no** `objective` (extra → 422). `best` = min \(\lvert v_\infty\rvert+\lvert v_\infty\rvert\), then min TOF. Frontend then labels the reconstructed route `min_distance`. MGA-miss fallback **always** `score=-total_delta_v` regardless of objective; first successful TOF in \((80\ldots 980)\) wins. `/trajectory/plan` `min_time` is time-primary (live 70 d / 75.54 km/s vs `min_distance` 305 d / 10.85). | `lambert.py:422-440`; `planner.py:106-117`; `plannerController.ts:406` | LIVE API | Medium (L3 clarify) |
| B-M4-PCH-4 | `auto` walks spice→horizons→kepler **per body per JD**. Failed spice is not cached. One grid can mix equatorial SPICE with ecliptic Horizons/Kepler. Payload `ephemerisProvider` is overwritten to the **requested** name; points have no `stateSource`. `provider=spice` with Tudat absent raises uncaught `RuntimeError` → **HTTP 500**. | `ephemeris_service.py:115-147`; `planner.py:198-200`; `server.py:1201-1202` | LIVE API | High (B-M5-EPH-1) |
| B-M4-PCH-5 | `pathLengthAu` is the **chord** \(\lvert r_2-r_1\rvert\) (live best 2.509 AU), not the transfer arc. Scanner step floors (`max(0.5,…)` / `max(5.0,…)`) are hardcoded; API floors are env-driven — match at defaults, can desync. | `lambert.py:292,302,378-379`; `server.py:223-231,495-499` | LIVE API | Low |

### M3 AIA geometry — in

Source: [M3 AIA geometry](9f9f3d0e-b2ec-4e5f-b2f3-c9443cc3f771)

Prior-art numbers hold. Live AIA 193 (2026-09-06): `scaleCorrection=0.99176` → **CDELT1 = 0.60000″/px**, \(R_\odot=951.7''\) (959.6″ if `rsun×scale` ignores the correction). 512² @ 0.6″/px is **307–310″**. R-09 / H2 / H7 confirmed; 429 limiter not re-filed.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M3-AIA-1 | `getTile` `x=-1,y=-1` at **native** 0.6″/px (HV example used ~2.42″/px). Disk center sits at a **corner** of the PNG. Tile-center HPC ≈ (−155″, −155″) = **13.3°** from disk center, called (0,0). `detect_coronal_holes` then assumes 512² is the hemisphere: \(r_\odot=0.90\times 256\) → implied \(R_\odot=139.4''\) (stretch **6.83×**). Assigned “limb” is **~20.5°** true vs **90°** (**~70°**). Linear vs \(\mathrm{asin}(\rho/R)\) would add ~15° if FOV were correct. Stored `rsun` / CRPIX / CROTA2 unused. | `solar_realtime_data.py:443-455,526-618,677-688` | LIVE | High (H7 mechanism) |
| B-M3-AIA-2 | No HPC → Stonyhurst → Carrington. Live \(L_0\approx 263^\circ\) is never subtracted. CH lon = 0 is **tile center**. Shader tests world \(\mathrm{atan2}(n_z,n_x)/\mathrm{asin}(n_y)\) after 7.25° tilt + spin — holes stay near inertial lon=0 while the sun rotates (**~14.2°/day**). Fixed obliquity, never the date’s \(B_0\) (Sep ~+7.2°). | `solar_realtime_data.py:606-609`; `sunVisuals.ts:489-490`; `pfss_magnetogram.py:29-46` | LIVE | High (B-M3-YZ-4 / B-M3-PFS-7) |
| B-M3-AIA-3 | The 307″ crop is sampled as `texture2D(observationMap, fract(uvRotated + time·0.0022))` on a full sphere + `RepeatWrapping`. ~14° patch stretched over \(360^\circ\times 180^\circ\) (**~25×** lon). Extra wall-clock scroll: \(\Delta u=0.00088/\mathrm{s}\) → **0.32°/s**, full wrap in **~19 min**, independent of JD. Texture and CH **cannot coincide**. Far side / poles are the same patch. | `sunVisuals.ts:245-246,280-282`; `main.ts:212-213` | LIVE | High |
| B-M3-AIA-4 | Texture URL still omits `jd`; FastAPI drops `image_id`. Physics `latest(jd)` can be historical while the texture is “now” (**13.2°/day** synodic when sim ≠ now). Snapshot cache key is the **raw float jd** — a running TDB clock misses every `pollIntervalMs=1800` and re-hits all five AIA channels (not the 429 window itself). `freshness_s` is vs `datetime.now()`, so a correct historical frame looks years stale. TDB-as-UTC is **0.011°** / ~6 AIA frames. | `solarObservationTexture.ts:120-134`; `server.py:903-936`; `solar_realtime_data.py:40-42,131,173-205,727-736` | LIVE | High (R-09 / H2) |
| B-M3-AIA-5 | CH threshold is **0.25 × median** inside the fake disk, not a radial quiet-Sun profile (CATCHES/SPoCA cited). Polar holes **never appear** in this center-quadrant tile. `np.roll` erode/dilate wraps opposite HPC edges. Wind then **drops longitude** and matches latitude only. This tile is entirely on-disk (corner \(\rho\approx 438''<952''\)); a later full-disk 512 would label an off-limb ring as CH. | `solar_realtime_data.py:509-563`; `solar_physics.py:912-964` | LIVE | Medium |

### M2 TudatPy energy / integrator — in

Source: [M2 TudatPy energy](ff22fd7b-60ec-4f11-9849-f9a3bb233512)

D8 / B-C3-DOC-2 confirmed: header still says AU/year; adapter emits AU/day. `enable_srp` remains a dead flag (B-M2-TID-3). Engine is **LATENT** from the shipped UI (`?engine=tudatpy` only; missing install falls back to Rebound with a handshake warning). Variable-step RK exists in Tudat and is unused.

| ID | Finding | Path | Live? | Severity |
|---|---|---|---|---|
| B-M2-TUD-1 | Not a continuous N-body: fixed RK4 \(h=300\,\mathrm{s}\), then **re-seed from SPICE every 30 d**. Previous arc discarded. Long-term J2 cannot accumulate past \(\sim 31.5\,\mathrm{d}\). \(\Delta E/E\) jumps by construction. Mercury \(h/(q/v_p)\approx 0.38\). Linear Cartesian interp sagitta on Mercury \(\sim 0.5\,\mathrm{km}\) / 5 min. Moon is not in `_ID_TO_SPICE` (27 d timescale never seen). | `tudatpy_hooks.py:101-112,167-168,541-623` | LATENT WS | High |
| B-M2-TUD-2 | `get_energy` is a mixed Hamiltonian on **pre-barycenter** state: Sun SSB-relative, planets Sun-relative \(\Rightarrow\) \(\delta r/r\sim 10^{-3}\) on Sun–planet \(V\). \(T\) adds \(\lvert v_\odot/\mathrm{SSB}\rvert^2\) to heliocentric \(v^2\). Masses are catalog \(G\cdot m\) vs IAU \(\mu_\odot\) (\(\Delta\mu/\mu\approx 3.0\times 10^{-5}\)). \(V\) is point-mass while default force is SH; J2 \(U\) at 1 AU is \(\sim 2\times 10^{-12}\) of \(U_\mathrm{point}\) — frame mix swamps it. SI joules vs Rebound \((\mathrm{yr},\mathrm{AU},M_\odot)\): `energy_error` **not comparable**. | `tudatpy_hooks.py:243-246,338-340,405-441`; `server.py:1447` | LATENT WS | High |
| B-M2-TUD-3 | Default `enable_j2=True` requests `spherical_harmonic_gravity(4,4)` (tesseral, not header “J2/J4”) on Earth/Jupiter/Saturn. This file never sets \(J_2\)/\(R_e\). Saturn default field is **SPICE point mass** → latent `initialize` failure (`engine_init_failed`, no Rebound fallback after construct). Import `tudatpy.kernel.*` is pre-1.0. Earth \(J_2\) sign is correct **if** GOCO05c loads. | `tudatpy_hooks.py:14,79-85,115,174-176,263-276`; `server.py:1737-1744` | LATENT WS | High |
| B-M2-TUD-4 | Integrator is TDB; `get_state` / contract **omit** `jd_time_scale`. `set_julian_date` skips the check when the field is missing. Handshake sends `null`. Frontend UTC JD treated as TDB → \(\sim 2070\,\mathrm{km}\) Earth (same class as B-M5-EPH-2). | `tudatpy_hooks.py:118-135,311-388`; `server.py:1508-1515,1775` | LATENT WS | High (R-02 compose) |
| B-M2-TUD-5 | Internal frame is equatorial `"J2000"`; output applies \(R_x(\varepsilon)\) with IAU 1976 \(23.439291111^\circ\) (IAU 2006 \(\Delta\varepsilon\Rightarrow 26\,\mathrm{km}\) at 1 AU). `get_orbital_elements` uses **unrotated** Sun-relative equatorial SI → Earth \(i\sim 23.4^\circ\) instead of \(\sim 0^\circ\) ecliptic. Origins: Tudat SSB vs Rebound `move_to_com` (Moon in Rebound only). | `tudatpy_hooks.py:55,138-150,249-251,355-359,445-537` | LATENT WS | Medium |

No energy / J2 / \(R_e\) / TDB / Saturn SH tests. Constants-only pin in `test_kuiper_velocity_units.py`.

---

## 10. Residual risks (both passes)

- Auditors did not re-run `pytest` / `vitest` / `tsc` as a single measured gate in Pass A.
- TudatPy and live GONG/Helioviewer were read as source, not executed against production services.
- H29 displacement was estimated from constants (H29 peak ~4 m/frame at 60 fps), not measured in a browser.
- Phase-1 100k `.bin` **is present** and hashes match (Pass B M6); earlier “absent” note was a workspace-index miss. Swap still fail-opens to the mashed belt on latency/fetch errors.
- Historical `agent-notes/` present-tense registers will keep looking “live” until archived.

---

## 11. Document control

| Version | Date | What changed |
|---|---|---|
| A | 2026-09-04 | 30-agent pass; findings held in chat only |
| B0 | 2026-09-06 | This file: Pass A ledger written to disk; Pass B launched |
| B1 | *(pending)* | Pass B mathematics/physics appendix |
