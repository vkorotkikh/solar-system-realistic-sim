# Appendix B — Reviewer reports (unabridged)

*Companion to `CODEBASE_EVALUATION_REPORT_2026-10-06.md`. Target: `origin/main` @ `17d1e63`. All `file:line` references are to that commit, **not** to the `sun-focus` checkout.*

These are the six reviewers' own reports, verbatim, in the order SOL · API · SCI · TRJ · FEC · REPO. They were produced by AI agents that read their area in full and executed code; each finding carries a VERIFIED/SUSPECTED class, severity, fix, effort and an adversarial self-check. The main report (§6) lists which High findings I re-ran myself. Notes for reading:

- **Script and artefact names** (for example `trace_batch_vs_scalar.py`, `mission_default2.py`, `ws_k25.py`) refer to files in the session's scratch directory, which is discarded when the container is reclaimed; the commands and outputs quoted beside them are what survives.
- **Reviewer area ids:** SOL = frontend solar visuals + SMBH · API = backend HTTP/WebSocket/security · SCI = backend science · TRJ = trajectory/mission/benchmark · FEC = frontend core + orbital mechanics + data pipeline · REPO = README/repo hygiene/CI/tests. `K-nn` refers to the numbered items in `agent-notes/codebase_evaluation_prompt_2026-08-22.md` §8.
- **Known slips in reviewer chat summaries** (the files are authoritative): REPO's summary said "109 commits in one push" (the file, and I, say 127); TRJ's summary gave Medium/Low counts of 6/4 where its file header says 7/3.
- REPO's report includes eleven evidence tables (T1–T9), among them the 109-row README claims table.



---

<!-- ======================= REVIEWER SOL ======================= -->

# SOL — frontend solar visuals / solar data client / SMBH "Cataclysmic Events"

Target: `origin/main` 17d1e63 (read-only worktree `$S/main-wt`). `S` = `/tmp/claude-0/-home-user-solar-system-realistic-sim/03138f8e-d899-5252-b93f-37b1d0c17ea7/scratchpad`.
All repro material is in `$S/work/sol/` (index at the end of section 1). Nothing under `$S/main-wt` or `/home/user/solar-system-realistic-sim` was written (`git status` clean at the end; history was read with `git --no-optional-locks log/show` only).

## Scope & coverage

| File | LOC | Read |
|---|---:|---|
| src/frontend/features/solar/sunVisuals.ts | 1748 | fully |
| src/frontend/features/solar/solarRealtimeClient.ts | 894 | fully |
| src/frontend/features/solar/solarFeatureBlending.ts | 396 | fully |
| src/frontend/features/solar/solarFlares.ts | 472 | fully |
| src/frontend/features/solar/solarMagnetics.ts (+ .test.ts 20) | 506 | fully |
| src/frontend/features/solar/solarObservationTexture.ts | 339 | fully |
| src/frontend/features/solar/solarPhysicsClient.ts (+ .test.ts 287) | 343 | client fully; test: names/structure only |
| src/frontend/features/solar/gravitationalWaves.ts | 241 | fully |
| src/frontend/features/solar/solarProminences.ts, solarWind.ts (UNREACHABLE) | 372 / 193 | headers + export lists only |
| src/sunController.ts (+ .test.ts 426) | 786 | fully (both) |
| src/frontend/features/superluminal-modeling/agnShockwaveEngine.ts | 434 | fully |
| .../smbhPropagation.ts / smbhPhysicsConstants.ts / warpSlipstreamVisuals.ts | 693 / 395 / 182 | fully |
| src/frontend/features/solar/solarRealtimeClient.test.ts | 959 | fully |
| index.html (403) | | lines 75-360 (time/display/AIA/Cataclysm panels) |
| src/style.css (1311) | | `.experiment-*`, `.panel-disclosure--danger`, `.advanced-badge` only |
| ADVANCED_ASTROPHYSICS_INDEX.md (311) / h29-…implementation_plan.md (130) | | index: first 80 lines + all 63 referenced paths existence-checked; plan: first 60 lines |
| README.md "Highlights", "Solar model", "SMBH shockwave modeling" | | rows 9-10, 250-273 |
| Outside the list but needed: src/main.ts (sun wiring, AGN handler, rAF loop), src/textures.ts (sun texture), src/data/planets.ts, src/sim/catalog.ts:555-560, backend `solar_realtime_data.py`, `solar_process_worker.py`, `process_supervisor.py`, `solar_physics.py` (frame/rotation conventions only), `server.py:905-925,3276-3400` | | targeted |

What I ran (command → outcome):
- `vitest run …solarRealtimeClient.test.ts` on a throw-away copy (`$S/work/sol/repo-copy`, `src/` copied, `node_modules` symlinked) → `1 failed | 59 passed`; after the one-line fix `60 passed`; the four solar test files together `89 passed`.
- `uvicorn server:app --port 18143` (killed + verified gone) and `curl /solar/physics?jd_tdb=2461320.00000000&fidelity=high&max_features=180&forcing=hybrid&live_data=true` (the exact query the client builds) → HTTP 503 `solar_compute_timeout` after 18.0 s, twice; `fidelity=preview` → 200 in 10.6 s, 356,550 B, no `Content-Encoding`; `/solar/realtime` → 200, 897 B (all upstreams denied by the sandbox proxy).
- `execute_solar_physics_job` called directly (no server): `high/180` 34.4 s CPU (wall 36.7), `high/32` 38.4 s CPU, `operational/180` 18.5 s CPU, `preview/180` 8.5 s CPU; `high/180` JSON = 712,225 B compact, 281,372 B gzip.
- esbuild-bundled real modules run under Node 22 (three.js math real, WebGL absent): controller census/per-frame cost, AGN scenarios, flare manager, frame-convention numerics, backend-down cadence, SMBH numerics, validator probe, texture-generation timing. Python (numpy/astropy, `venv312`, `-I`): Planck colours, granulation RMS, field curl, source directions, feature drift.
- `node $S/scripts/reach.mjs $S/main-wt --json` → 33 unreachable files; in my area: `solarProminences.ts`, `solarWind.ts`.
- `git log -S` on `/home/user/solar-system-realistic-sim` for provenance of 09d87ac, 56930fb/53d0941, 63320e8, bb63988, 8236061, 5705c5e/6bab115/7c70f01.

Repro index (`$S/work/sol/`): `ctrl/harness_ctrl.ts` (census, per-frame cost), `ctrl/harness_agn.ts`+`harness_agn2.ts` (events), `ctrl/harness_frames.ts` (K-08/09/44), `ctrl/harness_down.ts` (backend down), `ctrl/harness_attr.ts` (negative result), `flares/harness_flares.ts`, `num/num.ts` (SMBH numerics), `num/engine.ts`, `num/stoch.ts`, `num/h29presets.ts`, `num/validate.ts`, `num/tex.ts`, `num/{color,gran,curl,dirs,sunpix}.py`, `time_physics*.py`, `feature_drift.py`, `supervisor_probe.py`, `physics_high180.json` (real payload), `uvicorn.log`.

## Findings

Severity counts: Critical 0 · High 5 · Medium 9 · Low 5.

### F-SOL-01 — CI is red because `solarRealtimeClient.test.ts:589` asserts prose that commit 09d87ac reworded
- Severity: High (the defect is one stale string; the consequence is a red `npm test` on a clean clone and every later CI step skipped)   - Class: VERIFIED   - Reach: CI   - Effort: S
- Where: src/frontend/features/solar/solarRealtimeClient.test.ts:584-590,605; src/frontend/features/solar/solarRealtimeClient.ts:587-592; backend/sim/solar_realtime_data.py:2612-2629
- Evidence:
  ```
  // test row (…test.ts:584-590): ok:true status (validPayload) + sdo_aia:null, expects the substring
  snapshot: { ...validPayload().snapshot, sdo_aia: null }   …   'sdo_aia status'
  // validator (solarRealtimeClient.ts:587-592)
  if (aiaStatus.ok !== (snapshot.sdo_aia !== null)) { throw new Error(
    'Solar realtime source_status.sdo_aia.ok must match whether snapshot.sdo_aia is non-null'); }
  ```
  `git log -S"must match whether snapshot.sdo_aia is non-null"` → only 09d87ac (2026-09-27 03:07:44). That commit changed the old check (`ok === true && !isRecord(sdo_aia)` → "…sdo_aia status claims success but snapshot data is unavailable") into the biconditional, and added two new `it.each` blocks (test.ts:180-210) with the new message, but left the older table row. Four more commits (477030a 03:11, 2620db9 03:13, 774cb89 03:29, 17d1e63 03:30) landed on a red suite.
  Which side is right: the validator. Backend contract: `_fetch_snapshot_with_deadline` writes `snapshot["sdo_aia"]=<dict>` and `source_status.sdo_aia.ok=True` together (2612-2618), or `ok:False,error` and leaves `sdo_aia=None` (2624-2629), so "ok ⇔ payload non-null" is the true invariant; the new check also rejects the opposite contradiction (ok:false + payload) that the old one allowed. The row's payload (ok:true, `sdo_aia:null`) is still rejected for the *same* semantic reason ("success claimed, no data"); only the wording changed. The earlier check order is irrelevant: schema/source/`source_status` per-source checks all pass first (I read the call order, lines 555-596), so the mismatch check is the first to fire (matches the CI message).
  Verified fix on the copy: `sed -i "589s/'sdo_aia status'/'source_status.sdo_aia.ok must match'/" …test.ts` → `Tests 60 passed (60)`; with `solarPhysicsClient`, `solarMagnetics`, `sunController` tests → 89/89.
- Impact: `npm test` fails 1/309 (CI step 1 of the only workflow), so the R3/R4 science manifest and typecheck ratchet steps never run; the suite was already red at each of the 4 later commits.
- Fix: one line, `solarRealtimeClient.test.ts:589` → `'source_status.sdo_aia.ok must match'`. Optional hardening: the row is now redundant with test.ts:196-211 (same payload class); delete it or assert a stable error code instead of prose.
- Prior: NEW (baseline CI fact; root cause here)
- Adversarial check: tried to find a different reason the payload should be rejected (e.g. an earlier validation step with a different message): none fires first. Tried changing the validator message instead: would break the dedicated test at :208 which expects the new text, so the test-side change is the minimal consistent one. 59/60 other rows pass, so no wider drift.

### F-SOL-02 — The Sun's default `/solar/physics` request (`high`, 180 features) needs ~34 s CPU against a hard 18 s backend deadline
- Severity: High   - Class: VERIFIED (measured on this 4-core 2.8 GHz Xeon VM; other hardware may differ, see adversarial check)   - Reach: LIVE + BACKEND   - Effort: S (frontend parameter) / M (adaptive client)
- Where: src/sunController.ts:171-177 (`fidelity: 'high'`, `maxFeatures: 180`); src/frontend/features/solar/solarPhysicsClient.ts:9-10,214-218,286,329 (30 s cadence, locked 20 s timeout, `jd_tdb` to 8 decimals, 30 s retry); backend/server.py:912-924 (18.0 s hard deadline); backend/sim/solar_process_worker.py `execute_solar_physics_job`
- Evidence:
  ```
  $ curl -m 60 'http://127.0.0.1:18143/solar/physics?jd_tdb=2461320.00000000&fidelity=high&max_features=180&forcing=hybrid&live_data=true'
  http=503 time_total=18.0156   {"detail":{"code":"solar_compute_timeout","message":"Solar physics generation exceeded its hard deadline.",…}}   (repeated: 18.0259 s)
  $ python time_physics2.py high 180      -> wall=36.74s cpu=34.42s      (process CPU time, so not a load artefact)
    …                       operational 180 -> cpu=18.54s ; preview 180 -> cpu=8.54s ; high 32 -> cpu=38.39s (cost is set by fidelity, not feature count)
  $ curl …fidelity=preview…  -> http=200 size_download=356550 time_total=10.63 (no Content-Encoding; no GZip middleware, server.py:1349-1380)
  ```
  The client sends `jd_tdb=Number(jd).toFixed(8)` of the live sim JD, so no two requests share an epoch and nothing can be cached. A failed attempt is retried 30 s after it fails (`solarPhysicsClient.ts:329` `max(30 s, pollInterval)`, constant, no exponential backoff); `ctrl/harness_down.ts` (instant 503s, 600 s of 60 fps frames) shows exactly that cadence (requests at 0, 30, 60 … s). With the real 18 s deadline that is one attempt per ≈48 s, i.e. ≈18 s of worker CPU per 48 s (≈37 % of a core per open tab; computed from the measured 18.0 s deadline and the 30 s retry, not measured end to end).
  One extra observation (cause not established): a `preview` request issued right after the two `high` timeouts also returned `solar_compute_timeout` after only 9.26 s; two later `preview` requests were 200. Candidate: the 0.25 s child-exit grace (`process_supervisor.py:36,459-466`) under load.
  When it does succeed the payload is 712,225 B compact (corona 65 %, pfss 30 %, heliosphere 4 %; every large section is consumed by the frontend), i.e. 23.7 KB/s per tab at the 30 s cadence.
- Impact: on hardware like this VM (and, per the baseline, the GitHub runner: five `503 solar_compute_timeout` backend test failures) the physics state is never delivered, so the Sun silently runs on its local synthetic fallback; the UI has no indicator of this (index.html has no backend/synthetic status text) and the tab keeps asking the server to start work that is killed at the deadline.
- Fix: (1) `sunController.ts:173-174` → `fidelity: 'preview'` (8.5 s CPU) or `'operational'` only where the backend is known to finish; (2) in `SolarPhysicsClient` map `solar_compute_timeout`/`solar_compute_saturated` to a step-down (`high→operational→preview`) plus exponential backoff (the realtime client already has one); (3) backend: quantise the epoch (e.g. 0.01 d) so identical requests hit a cache, and enable compression (≈60 % smaller); (4) show "Solar physics: synthetic fallback" in the status bar.
- Prior: K-11 (CHANGED: cadence fixed 900 ms → 30 s by 8236061; payload now larger; new deadline failure)
- Adversarial check: tried to blame CPU contention (load average ≈6 on 4 cores): the measurement is process CPU time (34.4 s) with `nice`, and `Thread(s) per core: 1`, so contention cannot double it; `SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS` cannot exceed 19 s (`server.py:912`), so no configuration makes `high` pass here. A machine ≥2× faster would pass `high`, which is why this is "environment-sensitive High" rather than Critical; the repo's own backend gate ("Real gates cover high/180", `process_supervisor.py:28-30`) fails in CI for the same reason.

### F-SOL-03 — Flares and CMEs are never visible at the default (display) scale, and at real scale only the first four ever show per ~49 minutes
- Severity: High   - Class: VERIFIED   - Reach: LIVE   - Effort: S
- Where: src/frontend/features/solar/solarFlares.ts:226-228,262-267,298; src/sunController.ts:545-546
- Evidence:
  ```
  const cmeMaxDistanceAu = 0.3;                                                       // :226
  const maxLifeTimeSec = (cmeMaxDistanceAu - sunRadiusAu) / Math.max(0.0001, velocityAuPerSec);   // :228
  if (elapsedSec > maxLifeTimeSec) { _expired = true; }                               // :265-267
  ```
  Default Sun radius = `sqrt(696340 km)·0.00045` = 0.3755 AU (`catalog.ts:557`, `useRealisticScale:false`, `stateStore.ts:121`), so `maxLifeTimeSec = -755 s` and every event expires on its first `update()`. Executing the real `SolarFlareManager` with the real backend payload (66 CME features) for 30 min at 60 fps, activity 0.78 (`flares/harness_flares.ts`):
  `display-scale Sun (default): frames with live event=0/108000, frames with surface glow>0=0, max live=0`
  `real-scale Sun:               frames with live event=108000/108000, frames with surface glow>0=2420 (2.2 %), max live=4, alive at end=4`
  At real scale the `Math.max(1e-4, v)` clamp makes every CME (20–3500 km/s) live (0.3−0.004655)/1e-4 = 2,953 s (49 min) while its visible flash lasts 15–35 s (`:225`, `:262`), so all four slots (`maxEvents = 4`, `:298`) sit occupied and `syncFromPhysicsState` returns 0 (`:341`) until they expire. The AGN "solar response" goes through the same manager: in the default-scale `harness_agn.ts` run a default Sgr A* trigger makes 13 `spawnRandomFlare` calls and `liveFlareObjects=0` at every sampled second.
- Impact: README's "Flares & CMEs" feature (and the visible solar response to every Cataclysmic Event) does not exist in the default view; it works only after ticking "Realistic scale", and then in 40-s bursts separated by ~49 min.
- Fix: make the lifetime independent of `sunRadiusAu` and of the (physical-speed) distance cap: replace `:228` by a fixed visual lifetime, e.g. `const maxLifeTimeSec = flashDurationSec + 60;`, and let the dome fade with the existing `uElapsedSec` decay so slots free up within about a minute; add a Node test "event is not expired after one update at radius 0.3755 and 0.004655" (≤10 lines; `flares/harness_flares.ts` is the template).
- Prior: K-44 (CHANGED: "glow never decays" is fixed (`mat.opacity = 0` after the flash, `:262`); lifetime clamp 25–61 h → 49 min and 3 → 4 slots; new failure at display scale; sprite/shader longitude sign mismatch still present — see F-SOL-04)
- Adversarial check: looked for a second render path at default scale (the 360-point eruption layer is separate and does render, but it is not the flare/CME feature the README claims); confirmed `getSunRadiusAu()` returns the display radius at default (`main.ts:198,266`); confirmed expiry happens before `getActiveFlaresParams()` is read (`sunController.ts:545-546`), and that the harness uses the same call order.

### F-SOL-04 — Three incompatible "pole" conventions in the Sun stack: shader pole ⟂ spin axis; backend pole = +Z; the same backend feature is drawn 26–89° apart by two code paths; backend longitudes are rotated twice
- Severity: High   - Class: VERIFIED   - Reach: LIVE   - Effort: M
- Where: src/frontend/features/solar/sunVisuals.ts:38,170,322,484,512,642-643,1546; src/main.ts:308-316,729-734; src/data/planets.ts:10; src/frontend/features/solar/solarFlares.ts:180-183; backend/sim/solar_physics.py:71-77,475
- Evidence:
  ```
  vLatitude = asin(clamp(vWorldNormal.y, -1.0, 1.0));                                   // sunVisuals.ts:38  (pole = world +Y)
  const lon = Math.atan2(centerDir[2], centerDir[0]); const lat = Math.asin(centerDir[1]);   // :642-643  (feature dir read as y-up)
  cos_lat*cos(lon), cos_lat*sin(lon), sin(lat)                                          // solar_physics.py:71-77 (backend pole = +Z)
  spinGroup.quaternion.setFromUnitVectors(BODY_LOCAL_SPIN_AXIS, spinAxisWorld)          // main.ts:316; axialTilt 7.25° => axis (0.126,0,0.992)
  ```
  Numbers from `ctrl/harness_frames.ts` with three.js math and the real payload:
  `mesh spin axis in world: 0.1262, 0.0000, 0.9920 | shader/streamer/polar-hole pole: 0,1,0 | angle between = 90.00 deg (7.25 deg from world +Z)`
  `sunspot (shader, fixed in world: vWorldNormal) vs coronal-loop footpoint (spinGroup child, rotates) for the 8 strongest backend features: body rotation 0° → median 71.8° (26.3–89.4); 90° → median 102.1° (36.8–119.8)`
  `K-44 sprite vs shader glow for one flare: 107.0°, 69.7°, 95.8° apart` (`solarFlares.ts:182` uses `z = -r·cos(lat)·sin(lon)`; shader `:322` uses `+sin(lon)`).
  Double rotation (K-45): backend features of the same id advance **14.67 °/day (|lat|<10°, n=25), 14.53 (10-20°, n=84), 14.24 (20-30°, n=35), 13.94 (30-50°, n=10)** between `jd` and `jd+1` (`feature_drift.py`, backend adds `_differential_rotation_rad_day(lat)·(jd−J2000)` at `solar_physics.py:475`), and the frontend then rotates the whole `sunCoronalLoopGroup` (a `spinGroup` child; nothing sets `lockBodySpin`) by another 14.18 °/day (`main.ts:734`, `planets.ts` 609.12 h): ≈28.9 °/day at the equator.
- Impact: the streamer belt, polar coronal holes, sunspot latitudes and the UV shear are laid out around world +Y while the sphere spins about ≈+Z; backend active regions (loops) and the sunspots/flare glows derived from the same features do not coincide; loops spin at twice the physical rate. README claims "correct ecliptic-longitude pole directions" for body spin.
- Fix: define the Sun frame once (IAU body-fixed, pole +Z) and map at the boundary: in `normalizeSolarFeatureSetFromState` and `collectPhysicsDrivenSunspotGroups` convert backend (x,y,z) → three local (x,z,−y); use an object-space varying (`vLocalNormal`) for `vLatitude`, sunspots, flares, streamers and holes (56930fb already did this part — see F-SOL-06 — and was lost in a merge; it did not remap the backend axes); subtract the rigid 14.18 °/day from the backend advance (or stop rotating the loop group). Fix the sprite sign (`solarFlares.ts:182`). Add a Node test: spot direction and loop footpoint agree to <1° at θ∈{0,90°}.
- Prior: K-08 (STILL-PRESENT), K-45 "double-rotated" (STILL-PRESENT), K-44 sign mismatch (STILL-PRESENT)
- Adversarial check: the camera is y-up (`sceneSetup.ts:165-168`, no `camera.up`), so on screen +Y looks like "up" and the shader's polar axis can look plausible; but the mesh rotates about the tilted +Z axis (`main.ts:316,734`), so rotation axis and procedural pole disagree regardless of camera convention (90.00° measured). Scope is visual orientation, not data corruption, hence High not Critical.

### F-SOL-05 — README "Solar model" / "SMBH shockwave modeling" / Highlights: of 18 checked claims, 6 are FALSE, 1 is dead code, 2 are only partly true (claims table)
- Severity: High (materially false README claims in the project's flagship section)   - Class: VERIFIED (per row; colour row SUSPECTED)   - Reach: DOC   - Effort: S
- Where: README.md:9-10,254-264,270-273
- Evidence — one row per claim (TRUE = true on HEAD, DEAD = true but dead code, FALSE, UNV = unverifiable):

| README line | Claim | Where / live? | Check | Verdict |
|---|---|---|---|---|
| 9 | "13-phase overhaul" | phase tags A1-A4, B, 7B/7C, 8A, 11, 12 in comments | cannot count | UNV |
| 254 | Limb darkening, N&L 1994 R/G/B independent | sunVisuals.ts:99-111, live | coefficient sums 1.0001/1.0000/1.0000; (1−I_B)/(1−I_R) = 1.02–1.075 for μ=0.9…0.1 though the comment says "blue darkens ~40% more" (line 97); paper coefficients UNV offline | TRUE (implemented), physics weak — F-SOL-14 |
| 255 | Planck-derived linear sRGB at 5778 K, "near-white, not artistic orange" | sunVisuals.ts:302-312,337 | Planck (CIE-1931 fit): 5778 K lin=(1.000,0.880,0.823) vs constant (1.000,0.867,0.757); 3700 K (1,0.611,0.307) vs (1,0.538,0.203); no `colorspace_fragment`; 38 % of the orange procedural texture mixed in; arithmetic gives disk-centre ≈(255,194,140) vs Planck sRGB (255,241,234) | FALSE for "near-white" (SUSPECTED: no screenshot) |
| 256 | Granulation "~22 % RMS" | sunVisuals.ts:255-259 | numpy port of the same GLSL: peak-to-peak 22.0 %, **RMS 4.9 %** | FALSE |
| 256 | sunspot groups up to 40, Evershed fibrils, Wilson depression, facular limb brightening | shader :161-230 | 8 slots × ≤5 clusters = 40; stylised noise, not physics | TRUE |
| 257 | Chromosphere Type I/II spicules | sunVisuals.ts:717-900 | heights 3.5–13.9 Mm consistent with comments | TRUE |
| 258 | K-corona Baumbach/van de Hulst to 4 R☉, streamers, holes, Fe XIV colour | corona shader :354-551 | 2 of 3 Baumbach density terms used as alpha; shell = 4×display radius = 1.50 AU at default (F-SOL-13); streamers/holes use world-Y pole (F-SOL-04) | TRUE (stylised) |
| 259 | Prominences, catenary + Hα + eruption | solarProminences.ts (372 LOC) | no importer anywhere (`reach.mjs`) | DEAD |
| 260 | Flares & CMEs "GOES Neupert-effect temporal profiles", 20°–120° width | solarFlares.ts | no GOES/Neupert in `src` (`grep -i`); two-phase envelope only; width 20–120° present; invisible at default scale (F-SOL-03) | FALSE (Neupert/GOES); width TRUE |
| 261 | PFSS magnetics: dipole tilt + octupole, corrected RK4 | solarMagnetics.ts:107-228 (fallback; comment at :107 calls it "potential") | RK4 present; field is not potential: median \|∇×B\|/(\|B\|/r) = 0.25 (activity 0.5), 0.47 (0.9); \|∇·B\|/(\|B\|/r) = 0.08–0.15 (`num/curl.py`); backend PFSS lines in the payload have `source:"synthetic"` | TRUE as code, FALSE as "PFSS" |
| 262 | Parker spiral: bimodal speed, polarity colours, camera fade | sunVisuals.ts:1490-1576 + backend `wind_speed_model: mixed_wsa_inspired_v1_empirical_ch_bimodal` | present; but extent at default scale 242 AU (F-SOL-13); frontend `solarWind.ts` bimodal model is dead | TRUE |
| 263 | Observation textures: SDO/AIA, 5 channels, user-selectable, backend proxy, confidence-weighted blending | solarObservationTexture.ts, sunController.ts:310-379 | backend never emits `eligible:true` (`solar_realtime_data.py:2458`), frontend admits only `eligible` surface textures; `observationBlend`=0 always (F-SOL-07) | FALSE (inert by design) |
| 264 | Data assimilation: synthetic/hybrid/data_driven "using NOAA SWPC, SILSO, SDO/AIA feeds" | solarPhysicsClient.ts:105-111,146-168; solar_process_worker.py `build_solar_physics_state` | payload: `effective_forcing:"synthetic"`, `live_data_enabled:false`, `data_assimilation.sources = {swpc:null,silso:null,sdo_aia:null}`, `applied:false`; `data_driven` → HTTP error; client rejects anything else | FALSE |
| 10 | "Fermi Bubble rendering" | `FERMI_BUBBLES` (constants:217) has no importer; no bubble geometry in `src` | | FALSE |
| 10 | "AGN warp-wave engine with Sgr A* transient timeline" | agnShockwaveEngine.ts, live | timeline computed but `getAgnTimeline/getAgnPhysics/getWarpInfoText` have no UI caller | TRUE (internal only) |
| 270-271 | Engine models Sgr A*, Cen A, Maffei 1; compound fronts (EM, GW, UHECR) | live (also M87) | 7 channels; D(E), gyroradius, β_app, Sedov-Taylor checked (section 3 of this file / F-SOL-11) | TRUE |
| 272 | Metric frame-dragging slipstream visualisation | warpSlipstreamVisuals.ts, live only under the "H29" propagation model | works since 63320e8; planets' displacement ≤7.8e-9 AU/frame even with ×1e12 exaggeration | TRUE (speculative; README does not say so) |
| 273 | Constants "sourced from published literature" | smbhPhysicsConstants.ts | sources cited, but r_s 100× wrong, directions 33–92° off (F-SOL-11) | PARTLY |

- Impact: a reader of the README would expect observed-data assimilation, flares/CMEs, prominences, Fermi-bubble rendering and a ~22 % granulation contrast that the HEAD build does not deliver.
- Fix: edit README.md:9-10,254-264,270-273 to the verdicts above (state "fail-closed, no live data", "prominences/solar-wind modules are not wired", "granulation ≈5 % RMS", "no Fermi-bubble geometry"); add one sentence in the SMBH section that H29/superluminal modes are speculative.
- Prior: K-02/K-35 style README drift, specific rows NEW
- Adversarial check: tried to read the README as a roadmap; it uses present tense and "Physics-grounded"; the code comments elsewhere (tests, validators) are explicit about fail-closed, so the gap is README-only, not an unstated design.

### F-SOL-06 — Procedural solar motion runs on the wall clock and keeps moving when the simulation is paused; the earlier fix (56930fb) was dropped by merge 53d0941
- Severity: Medium   - Class: VERIFIED   - Reach: LIVE   - Effort: M
- Where: src/frontend/features/solar/sunVisuals.ts:245,280,690,1673; src/main.ts:1412-1417,734; src/sunController.ts:491-498,542
- Evidence: `ctrl/harness_frames.ts` (JD fixed, wall time advances 0 → 60 → 3600 s):
  `surface uniform time = 0.0 → 24.0 → 1440.0; corona time 0 → 32.4 → 1944; synthetic spot#1 lon 276.49° → 277.39° → 330.33°`
  `synthetic sunspot drift = 53.8°/wall-hour; shader UV shear at equator 6.93e-4°/wall-s (6.0 wall-days/rev); base-texture scroll uv += time*0.003 → 0.432°/wall-s (13.9 wall-min/rev)` while the mesh rotation (`child.rotation.y`, JD-driven, `main.ts:734`) freezes. At the default +4 d/s (`index.html:82,91`) the surface turns 56.7°/s under spots that stay fixed in world space (physics-driven seeds) or drift at 0.015°/s (synthetic).
  Provenance: `git show 56930fb` ("Separate solar physical and visual timing", 2026-08-24) added `advanceSolarVisualClock`, `vLocalNormal` and a residual-rotation shear to `sunVisuals.ts`; `git show 53d0941^2:…sunVisuals.ts | grep -c advanceSolarVisualClock` = 6, the merge result `53d0941` = 0 ("Merge main into sun-focus", 2026-08-25). `main.ts:1412-1416` still carries the comment "main's 56930fb paired this with a rate-bounded visual clock … which this tree does not carry"; `agent-notes/CODEBASE_AUDIT_2026-09-07.md` F-13 recorded it as an unported regression (0.5 d).
- Impact: a paused simulation is not paused (granulation, texture scroll, spots, corona, chromosphere all animate); spots slide against the rotating surface; the visuals have no relation to the time-warp rate.
- Fix: port the three hunks of 56930fb (visual clock, `vLocalNormal` for `vLatitude`/sunspots/flares, residual differential rotation relative to the 14.18 °/day parent rotation) together with the frame mapping from F-SOL-04; update `main.ts:1412` comment.
- Prior: K-09 (STILL-PRESENT)

### F-SOL-07 — The realtime/AIA pipeline is live code that can never change a pixel, yet the UI offers a "Solar observation channel" selector with no disclosure
- Severity: Medium   - Class: VERIFIED   - Reach: LIVE + BACKEND   - Effort: S (UI) / M (decide the feature's future)
- Where: index.html:141-149; src/main.ts:1240-1242; src/sunController.ts:700-740 (`getSolarDeliveryStatus` never called by UI); src/frontend/features/solar/solarObservationTexture.ts:296-327; backend/sim/solar_realtime_data.py:294,2457-2461; src/frontend/features/solar/sunVisuals.ts:284-293
- Evidence: every channel the backend emits is `helioviewer_viewport_tile` with `spatial_use.eligible:false, reason:"viewport_tile_has_no_validated_solar_surface_projection"` (`:2458`), and `capabilities().sources.sdo_aia.artifacts.spatial_surface_texture` is `False` (`:294`). The frontend validator rejects a viewport artifact claiming eligibility (`solarRealtimeClient.ts:516-526`), `pickAiaObservationChannel` needs `eligible` + exact contract, and `deriveSunObservationControls` forces `observationBlend/Emission/activityBoost/coronaHue` to 0 without a usable texture (`solarObservationTexture.ts:296-327`). Hence `activeObservationChannel` is always `null`, the corona/TR/chromosphere `channelMode` stays 0, and the `aia-channel` `<select>` (which only sets `userAiaChannelOverride`) changes nothing visible. `swpc`, `silso`, `combined_activity_proxy`, `source_status` are read nowhere outside the client (`grep -rn` empty). Each 120 s refresh costs the backend 8 upstream requests (2 SWPC, 1 SILSO CSV, 5 Helioviewer `getClosestImage`) and the shader still performs two `texture2D(observationMap, …)` fetches per pixel multiplied by `observationBlend = 0` (`sunVisuals.ts:284-293,316`).
- Impact: a control that does nothing and an entire fetch/validate stack (894 + 339 + 959 LOC of tests) feeding no rendering; users selecting "304 Å · Chromosphere" are told nothing.
- Fix: until a spatial endpoint exists: hide or disable the select with a status line fed from `getSolarDeliveryStatus().observation.reason`; skip the observation samples when the uniform is 0 (`if (observationBlend > 0.0)`); consider not polling `/solar/realtime` at all.
- Prior: K-10 (FIXED-ON-HEAD as a fail-closed guard — 5705c5e, 6bab115, 7c70f01, 2026-09-26; the 512-px viewport tile can no longer be wrapped onto the sphere; the leftover is this inert UI)

### F-SOL-08 — "Continuous stochastic flaring" does nothing unless a Cataclysmic Event is already running
- Severity: Medium   - Class: VERIFIED   - Reach: LIVE   - Effort: S
- Where: src/sunController.ts:593-598; src/frontend/features/superluminal-modeling/agnShockwaveEngine.ts:301-333; index.html:334-338
- Evidence:
  ```
  if (agnEngine && agnEngine.isActive()) {            // sunController.ts:593
    agnEngine.update(dtSec);                          // the stochastic block lives inside update()
  ```
  `num/stoch.ts` (real engine, 120 s of 60 fps, checkbox ON, no event): `engine.update() every frame → 34, 51, 34, 37, 43 bursts (expected 0.3/s·120 = 36)`; `gated by isActive() as in sunController.ts:593 → 0, 0, 0, 0, 0`.
- Impact: the switch is inert in its only advertised use (background flaring). Even when it fires, F-SOL-03 hides the result at default scale.
- Fix: call `agnEngine.update(dtSec)` unconditionally (it already returns early for the non-stochastic, non-active case), keeping `setWarpState` inside the `isActive()` branch.
- Prior: NEW

### F-SOL-09 — Cataclysmic Events panel: default observer-frame projection desynchronises the visual front from the model, and the "H29" preset does not select the H29 model
- Severity: Medium   - Class: VERIFIED   - Reach: LIVE   - Effort: S
- Where: index.html:276-345 (esp. 308, 325, 330); src/main.ts:1319-1343,1354-1363; src/frontend/features/superluminal-modeling/agnShockwaveEngine.ts:111,339-350; smbhPhysicsConstants.ts:81
- Evidence:
  ```
  <input id="agn-observer-frame" type="checkbox" checked />   // index.html:330 (label "Observer-frame projection")
  const apparentFactor = observerFrameMode ? Math.max(1, apparentBeta(jetBeta, currentThetaRad)) : 1.0;   // engine :342
  if (preset) options.preset = preset;  if (hypothesis !== 'compound') options.hypothesis = hypothesis;   // main.ts:1340-1341
  ```
  `num/engine.ts` (real engine, stub GW/responder): Sgr A*: visual front reaches the Sun at **4.08 s** while the GW channel/first flare fire at 8.00/8.02 s; Cen A 3.60 s vs 9.50; M87 4.22 s vs 12.00; with the checkbox off 8.02 = 8.02. β_app = 1.965 comes from `jetBeta: 0.90` (`smbhPhysicsConstants.ts:81`, "conservative for current state") although Sgr A* has no detected relativistic jet. `ctrl/harness_agn.ts` scenario C (`preset: 'SgrA_WarpWave_H29'`, hypothesis left on "Standard"): `h29 meta: null`, `warpState=null`, status text unchanged ("Standard compound transport model selected.", `index.html:325`), i.e. the option labelled "H29 metric-frame-dragging slipstream" runs the standard model at 5e54 erg.
  Defaults on page load: panel collapsed with an "Advanced" badge and a red intro ("Educational experiment zone … speculative … not a forecast", `:290-292`); source Sgr A*; model "Standard compound shockwave"; observer-frame ON; stochastic OFF; custom energy 1e56 erg (engine default `:256`). The H29 *model* choice does flip the status line to `data-model="speculative"` (`main.ts:1354-1358`, CSS `style.css:915`), which is good; nothing flags observer-frame as speculative/apparent-superluminal, and the info texts that carry the disclaimers (`gw.getInfoText`, `warp.getInfoText`, `getWarpInfoText`) have no UI caller.
  Side effects of pressing "Trigger compound shockwave" (executed through the real controller, `ctrl/harness_agn.ts`, `harness_ctrl.ts`): simulation time — none (`sunController` only reads `simState.julianDate`); orbits/bodies — none in the compound model; in H29 the model gets `warpState` and applies `applyMetricKinematics` each tick, but the shift is ≤7.8e-11 AU per 60 fps frame at 1e56 erg (≤7.8e-9 AU for the largest preset, even with the hard-coded ×1e12 exaggeration, `main.ts:845`, `modelWorker.ts` `WORKER_WARP_EXAGGERATION`), i.e. invisible; camera — none; performance — update() +0.1–0.2 ms/frame, no new draw calls (both grids are already submitted, F-SOL-10), 13 flare spawns that are invisible at default scale (F-SOL-03), one 2.5 s `setTimeout` resetting the GW grid, one `console.log`.
- Impact: with defaults, the picture contradicts the timeline in the same event; the H29 preset is mislabelled.
- Fix: in the click handler map `preset === 'SgrA_WarpWave_H29'` → `hypothesis = 'h29'` and update the status line; default the checkbox to unchecked or relabel it "Apparent superluminal projection (jet blobs only)" and apply `apparentFactor` to a jet marker, not the radial front; surface the info texts as `title`/status text.
- Prior: K-41 (STILL-PRESENT: observer-frame default ON, preset decoupled, no speculative flag on the checkbox)

### F-SOL-10 — Two AGN grid meshes (148,225 + 16,641 vertices, `frustumCulled=false`) are drawn every frame from startup with their shader disabled; the grids lie in XZ while the ecliptic is XY
- Severity: Medium   - Class: VERIFIED (counts, flags); GPU cost SUSPECTED (no GPU here)   - Reach: LIVE   - Effort: S
- Where: src/sunController.ts:457-461,486; src/frontend/features/solar/gravitationalWaves.ts:117,160-161,184; src/frontend/features/superluminal-modeling/warpSlipstreamVisuals.ts:72,103-104,126; src/sim/orbitMath.ts:326-330
- Evidence: `ctrl/harness_ctrl.ts` after `initSunVisuals()` and before any event:
  `Mesh verts=148225 tris=294912 visible=true frustumCulled=false` (GW), `Mesh verts=16641 tris=32768 visible=true frustumCulled=false` (warp); total submitted vertices 212,769, of which 164,866 (77.5 %) are the two disabled grids; uniform `enabled=0`, fragment `if (enabled < 0.5) discard;`. `harness_agn2.ts`: after an H29 event the GW grid is hidden by the 2.5 s timer (`visible=false, enabled=0`) but the warp grid stays `visible=true, enabled=1` (the only call is `warpDisplayer.toggle(true)`, `sunController.ts:486`; `grep "\.toggle("` shows no `false` for it). Plane orientation: `geometry.rotateX(-Math.PI/2)` (comment "Lay flat on ecliptic plane") puts both in XZ, while the propagator gives `z = r·sin(u)·sin(i)` (ecliptic = XY).
- Impact: ~77 % of the Sun's vertex budget and two large transparent double-sided planes that rasterise and discard on every frame until an event ends (and the warp one forever after); the visual plane is perpendicular to the ecliptic.
- Fix: `gwDisplayer.toggle(false); warpDisplayer.toggle(false);` right after creation (sunController.ts:457-461) and in the engine's `resetVisuals`; build the grids in XY (or rotate the mesh group about X).
- Prior: K-42 (STILL-PRESENT)

### F-SOL-11 — SMBH source catalogue holds verified wrong or invented values (Schwarzschild radii 100× small, sky directions 33–92° off, M87 apparent speed unreachable for its β)
- Severity: Medium   - Class: VERIFIED   - Reach: LIVE (data) — no UI display of the affected outputs   - Effort: S
- Where: src/frontend/features/superluminal-modeling/smbhPhysicsConstants.ts:62-64,81,84,115,137,152,154,159; agnShockwaveEngine.ts:34-37; smbhPropagation.ts:640-643
- Evidence (`num/num.ts` bundles the real modules; independent values from CODATA/IAU constants, astropy for directions):
  `r_s(Sgr A*, 4.154e6 Msun) = 1.2268e12 cm (0.0820 AU)` vs `rSchwarzschildCm: 1.24e10` (comment "0.083 AU") → ×98.9; `rIsco/rPhoton` inherit it. M87: 1.9196e15 cm (128.3 AU) vs `1.9e13` (comment "127 AU") → ×101. Effect: `gertsenshtein.nearSourceProb` 3.13e-23 vs 3.07e-19 (×1e4).
  `astropy` ICRS→ecliptic J2000 unit vectors vs the engine's `SOURCE_DIRECTIONS`: Sgr A* (−0.055,−0.994,−0.098) vs (−0.050,−0.863,+0.502): **35.7°**; Cen A **86.8°**; Maffei 1 **32.9°**; M87 **91.7°**; the constants file calls them "approximate galactic coordinates" (`:84`) while the engine calls them "scene-space approximations" (`:31`).
  `jetBetaApp: 6.3` (M87) vs β=0.98 ⇒ Γβ_max = 4.92 < 6.3 (impossible); `jetBeta: 0.90` for Sgr A* is an invented placeholder (see F-SOL-09).
  Q3 numerics, code vs reference (`num/num.ts`, executed):

  | Quantity | Code | Reference | Verdict |
  |---|---|---|---|
  | D(1 GeV proton), table anchor `crDiffCoeffGeV` | 2.800e28 cm²/s | 2.8e28 | OK |
  | D(1 TeV) / D(1 PeV) | 4.438e29 / 7.033e30 | table 4.5e29 / 7e30 | OK (K-14 rigidity fixed, bb63988) |
  | Rigidity of a 1 GeV-kinetic-energy proton | code treats E=pc: 1.000 GV | exact 1.696 GV | −41 % at 1 GeV, negligible ≥TeV |
  | Gyroradius, 1 EeV proton, 5 µG | 6.671e20 cm = 216.19 pc | 216.0 pc (r_L ≈ 1.08 kpc·E₁₈/(Z·B_µG)) | OK (K-14 gyroradius fixed) |
  | r_s Sgr A* (4.154e6 M☉) | 1.24e10 cm | 1.2268e12 cm | ×98.9 too small |
  | Light-travel time to Sgr A* (8.178 kpc) | 26,675 yr | 26,673 ly | OK |
  | β_app(β=0.90, θ=35°) / Doppler δ / Γβ | 1.9646 / 1.6589 / 2.0647 | identical closed form | OK |
  | CR diffusion time to Sgr A*, 1 TeV (d²/6D) | 7.58 Myr isotropic; 3.63 Myr in the timeline after the waveguide factor | order-Myr galactic residence times | plausible (exact value UNV); K-14's 3.2e11 yr is gone |
  | GW strain at the Sun for 1 % of 1e56 erg | 6.5e-18 | the code's own order-of-magnitude form 2G·E/(c⁴d) | formula-consistent only (not a burst-waveform estimate) |
- Impact: the 100× constants feed only `getAgnPhysics()` (no UI consumer) so nothing visibly breaks today; the directions orient the visual wave and the H29 `direction` passed to the physics model, so "Sgr A* arrives from here" is wrong by 33°+ against the star field.
- Fix: `rSchwarzschildCm: 2·G·M/c²` computed from `massG` instead of a literal (and delete the `*1e10` fallback at smbhPropagation.ts:642); derive directions from RA/Dec via the repo's own star-catalogue frame; add a 6-line test per constant (see F-SOL-12).
- Prior: K-14 third claim (STILL-PRESENT); K-14 rigidity and gyroradius claims FIXED (bb63988, see section 3)

### F-SOL-12 — Test effort is inverted: 959 + 426 test lines guard the inert delivery stack, zero tests touch 4,561 lines of live visuals and SMBH physics
- Severity: Medium   - Class: VERIFIED   - Reach: CI   - Effort: M
- Where: no test imports `sunVisuals.ts` (1748), `solarFlares.ts` (472), `solarFeatureBlending.ts` (396), `gravitationalWaves.ts` (241), `smbhPropagation.ts` (693), `smbhPhysicsConstants.ts` (395), `agnShockwaveEngine.ts` (434), `warpSlipstreamVisuals.ts` (182) (`grep -rl <module> src --include=*.test.ts` → 0 each); `solarMagnetics.ts` has 2 parsing tests; `sunController.test.ts` never calls `initSunVisuals` (all 7 tests run with null materials), so `update()`'s visual path and the AGN wiring are untested.
- Evidence: F-SOL-03 (flare lifetime), F-SOL-11 (r_s, directions), and the latent `SGR_A` ReferenceError (F-SOL-16) are each caught by a ≤10-line test that does not need WebGL, e.g. `expect(createSolarFlareEvent({…sunRadiusAu:0.3755…}).isExpired()).toBe(false)` after one update; `expect(SGR_A.rSchwarzschildCm).toBeCloseTo(2*G*M/c², …)`; `expect(()=>metricFrameDragPeak(1,1e56)).not.toThrow()`. Weak assertions elsewhere: six `solarRealtimeClient.test.ts` blocks (≈25 table rows) assert only `/SILSO/i` (lines 276,348,406,452,492,502), so any SILSO error satisfies them.
- Impact: every defect in this file other than the validator drift was found by running code the suite never runs.
- Fix: add `solarFlares.test.ts` (lifetime at both radii, slot release), `smbhPhysicsConstants.test.ts` (r_s, gyroradius, D(1 TeV) ≈ 4.5e29, β_app/Doppler vs closed form — the values in section 3 are ready-made expectations), `agnShockwaveEngine.test.ts` (stochastic works with no event; preset→hypothesis; front vs channel timing); make `sunController.test.ts` call `initSunVisuals` with real `Group`s (the harnesses in `ctrl/` show it works under Node).
- Prior: K-38 style (frontend test gap), specifics NEW

### F-SOL-13 — At the default display scale the corona shell is 1.50 AU and the Parker spiral extends to 242 AU (beyond the 200 AU camera limit)
- Severity: Medium   - Class: VERIFIED   - Reach: LIVE   - Effort: S
- Where: src/frontend/features/solar/sunVisuals.ts:970,1546-1548; src/sunController.ts:410,454,557; src/sim/catalog.ts:557; src/main.ts:218
- Evidence: `corona shell = surfaceScale 4.0 × 0.3755 AU = 1.502 AU` (real scale 0.0186 AU) — it encloses Mercury, Venus, Earth and reaches Mars (1.52 AU). The real payload's Parker arcs reach 645.1 R☉ (`max_extent_au: 3.0` at true scale); `array[base] = arc[p][0] * sunRadiusAu` multiplies by the display radius ⇒ 645.1 × 0.3755 = **242.2 AU** (`solarSystemMaxDistanceAu: 200`, `main.ts:218`). `cameraFade` (`:1511-1512`) uses the camera's distance from the origin, so the six additive lines are at full strength (opacity ≤0.34) from 2 AU outward.
- Impact: physically meaningless scale for the two heliospheric layers in the default mode; the spiral crosses every planetary orbit.
- Fix: scale heliospheric layers by the real radius (AU) and only the near-Sun layers by the display radius, or clamp the display-scale spiral to a few display radii.
- Prior: K-45 (STILL-PRESENT: 1.5 AU / 242 AU confirmed with the real payload)

### F-SOL-14 — Shader fidelity claims differ from what the shader computes (limb darkening ≈ colour-neutral, granulation RMS 4.9 %, colour pipeline not managed)
- Severity: Medium   - Class: VERIFIED (numbers) / SUSPECTED (final on-screen colour, needs a screenshot)   - Reach: LIVE   - Effort: M
- Where: src/frontend/features/solar/sunVisuals.ts:94-111,255-259,296-312,337; src/textures.ts:131-139; src/frontend/app/textureManager.ts:50
- Evidence (`num/color.py`, `gran.py`, `sunpix.py`):
  `I_R/I_G/I_B at μ=0.3: 0.6005/0.5876/0.5880; (1−I_B)/(1−I_R) = 1.022 (μ=.9), 1.017 (.7), 1.017 (.5), 1.031 (.3), 1.049 (.2), 1.075 (.1)` while the comment at `:97` says "blue darkens ~40% more than red". Coefficient sums are 1.0001/1.0000/1.0000 (normalisation is right; the claimed colour dependence is ~5× weaker than commented; whether the numbers are the 1994 table values cannot be checked offline).
  Granulation: `gran1.x*0.22 + 0.78` is a 22 % range; the port of the GLSL gives RMS 4.92 % (README: "~22 % RMS"; observed solar contrast is of order 14 % per my recollection, unverified offline).
  Colour: `gl_FragColor = vec4(color, 1.0)` (`:337`) without `<colorspace_fragment>`, constants described as "linear sRGB" (`:296-305`), `baseMap` decoded to linear by `SRGBColorSpace` (`textureManager.ts:50`), 38 % of an orange procedural texture (`textures.ts:131-139`, ≈(245,176,51)) mixed in (`:312`): arithmetic disk centre ≈ (255,194,140) vs Planck 5778 K in sRGB (255,241,234).
  Also: the in-shader rotation comment is off 25× (`:244` "~8300 units"; 360/(14.44·0.00012) = 207,756) and the two differential-rotation profiles differ (shader 14.44−2.87 sin²−0.36 sin⁴ attributed to Snodgrass 1983 at `:114`; backend 14.713−2.396 sin²−1.787 sin⁴ = the coefficients I recall for the Snodgrass 1983 magnetic fit, unverifiable offline).
- Impact: README's "physics-grounded" photosphere is largely stylised; claims in comments and README overstate colour and contrast physics.
- Fix: either soften the README/comments or: use Neckel & Labs table values verified against the paper, compute RMS-calibrated granulation amplitude, add colour-space handling (`#include <colorspace_fragment>` and linear constants), drop the orange texture mix or fix its colour.
- Prior: K-45 (profiles: CHANGED — backend and shader now both labelled Snodgrass-like but still differ)

### F-SOL-15 — Realtime client validation is correct for what it checks but disproportionate and inconsistent
- Severity: Low   - Class: VERIFIED   - Reach: LIVE   - Effort: S
- Where: src/frontend/features/solar/solarRealtimeClient.ts:226-435 (SILSO, ~210 of 894 lines), 437-451, 575, 596
- Evidence (`num/validate.ts`): the real backend `/solar/realtime` payload (all upstreams failed) is ACCEPTED. Probes: `fetched_at_utc` "2026-10-06T07:34:21" and "…+05:00" ACCEPTED (`requireUtcTimestamp` only checks `Date.parse`, `:177-182`, whereas `delivered_at_utc` uses the strict `requireIsoUtcTimestamp`); SWPC `ok:true` with null payload ACCEPTED (AIA and SILSO get biconditional checks, SWPC/GONG none); an inconsistent SILSO diagnostic REJECTS the whole snapshot, including a valid AIA block. The data these checks protect (`silso`, `swpc`, `combined_activity_proxy`) is consumed nowhere (F-SOL-07).
- Impact: maintenance cost and an unrelated provider can disable the AIA path; duplicated month-boundary logic exists in Python and TS.
- Fix: validate only fields something consumes (or keep SILSO checks behind a flag), enforce `…Z` on `fetched_at_utc`, assert stable error codes in tests (F-SOL-12).
- Prior: NEW

### F-SOL-16 — `smbhPropagation.ts:120` default parameter references an unimported `SGR_A` (TS2304): a real, currently latent ReferenceError
- Severity: Low   - Class: VERIFIED   - Reach: LIVE (latent: all call sites pass the mass)   - Effort: S
- Where: src/frontend/features/superluminal-modeling/smbhPropagation.ts:17-21,117-121; ci/typescript-error-baseline.json:20
- Evidence:
  ```
  export function metricFrameDragPeak(timeSec: number, energyErg: number,
    smbhMassG: number = SGR_A.massG)          // SGR_A is not in the import list (lines 17-21)
  ```
  `num/num.ts`: `metricFrameDragPeak(1.0, 1e56)` → `ReferenceError: SGR_A is not defined`; the same with `undefined` as third argument. Live callers pass a number (`main.ts:839`, `modelWorker.ts:130` with `safeMassG`), so no runtime failure today. The ratchet baseline explicitly budgets `smbhPropagation.ts|TS2304: 1`.
  Triage of the 133 tsc errors in the two files (`$S/tsc_main.txt`): smbhPropagation 81 = 75 TS7006 + 4 TS2339 + 1 TS7053 + 1 TS2304; agnShockwaveEngine 52 = 19 TS7006 + 14 TS7005 + 4 TS7034 + 9 TS2339 + 6 TS7053. Implicit-any (TS7006/7005/7034) 112: benign. TS7053 (7): dynamic string indexing of literal maps, benign. TS2339 (13): 12 are the `options = {}` bag typed `{}` (lines 247-264, smbhPropagation:500) — benign; 1 (`jetBetaSpine` on the `SGR_A` literal type, engine:341) is a signal that catalogue entries have heterogeneous shapes (`jetBeta` vs `jetBetaSpine`). TS2304 (1): this one. No error corresponds to a currently reachable runtime defect.
- Impact: none today; a new caller that omits the third argument crashes the rAF loop frame.
- Fix: `import { SGR_A, … }` at line 17-21 (one token); drop the baseline entry.
- Prior: NEW (flagged in the briefing's TS2304 note)

### F-SOL-17 — UNREACHABLE `solarProminences.ts` (372 LOC) and `solarWind.ts` (193 LOC) are advertised in the README
- Severity: Low (capped: no wiring plan found)   - Class: VERIFIED   - Reach: UNREACHABLE   - Effort: S (delete/label) or M (wire)
- Where: src/frontend/features/solar/solarProminences.ts, solarWind.ts; README.md:259,262
- Evidence: `reach.mjs` lists both; `grep -rn "from.*solarProminences\|from.*solarWind" src` is empty (no importer of either module, test or runtime).
- Impact: dead weight and two README claims that are true only as code (F-SOL-05); a backend-side bimodal wind model is what the Parker spiral actually uses.
- Fix: delete, or move to `agent-notes/` / mark "not wired" in README.
- Prior: NEW

### F-SOL-18 — The procedural Sun texture is generated synchronously at startup (≈0.7–0.8 s) for a 38 % mix
- Severity: Low   - Class: VERIFIED (Node timing of the real generator; browser timing SUSPECTED similar)   - Reach: LIVE   - Effort: S
- Where: src/main.ts:246; src/textures.ts:131-139 (1024×512 px × 13 noise octaves)
- Evidence: `num/tex.ts`: `generatePlanetTexture('sun') run 0: 691 ms, run 1: 727 ms, run 2: 809 ms`.
- Impact: ~0.7 s of main-thread block before first paint on a 2.8 GHz core.
- Fix: bake once to a PNG asset or generate in a worker/OffscreenCanvas; or halve the resolution (only 38 % weight, F-SOL-14).
- Prior: NEW

### F-SOL-19 — Stale or wrong comments/docs in the solar/SMBH files
- Severity: Low   - Class: VERIFIED   - Reach: DOC   - Effort: S
- Where / Evidence (each executed or arithmetic-checked):
  - gravitationalWaves.ts:6,226 "Earth-Sun distance change ~0.15 femtometers (smaller than an atomic nucleus)": h = 1e-21 × 1.496e11 m = 1.5e-10 m = 0.15 **nanometres** (10⁵× larger, atom-sized); the text (and the warp/GW `getInfoText()` disclaimers) is never shown (no UI caller).
  - sunVisuals.ts:244 "~8300 units" (25× off, F-SOL-14); :662 "Called once per second" but `updateSunspotUniforms` runs every frame (`sunController.ts:542`).
  - sunController.ts:485 `console.log(\`… ${energyErg / 1e50}e50 erg\`)` prints `1000000e50 erg` for the 1e56 default (executed) — debug output left in the event path.
  - `disposeSolarDelivery()` (`sunController.ts:742-749`) disposes the two clients and the observation texture only; `gwDisplayer.dispose`, `warpDisplayer.dispose`, `SolarFlareManager.dispose` have no callers and there is no `import.meta.hot` handling (only matters for dev HMR; everything is released at page unload).
  - solarFeatureBlending.ts:124 still reads the deprecated `epoch_jd` alias while the client contract keys on `epoch_jd_tdb`.
  - h29-…implementation_plan.md: 15 `file:///home/nomad/…` links to `.js` paths that no longer exist (now `.ts` under `superluminal-modeling/`). ADVANCED_ASTROPHYSICS_INDEX.md is accurate: all 63 referenced paths exist.
- Impact: small trust erosion for a second engineer.
- Fix: correct the strings; add the `dispose()` calls to `disposeSolarDelivery`; replace the plan's absolute links.
- Prior: NEW

## Prior issues in my area

- K-08 — STILL-PRESENT: shader pole = world +Y vs spin axis (0.126,0,0.992), 90.00° apart (F-SOL-04).
- K-09 — STILL-PRESENT: wall-clock `time`, 53.8°/h synthetic spot drift, texture scroll 13.9 min/rev while paused; the fix existed in 56930fb and was dropped by merge 53d0941 (F-SOL-06).
- K-10 — FIXED-ON-HEAD as a fail-closed guard (5705c5e, 6bab115, 7c70f01): backend labels the 512-px tile `helioviewer_viewport_tile`, `eligible:false`; frontend validator/selection/controls refuse it; residual inert UI (F-SOL-07).
- K-11 — CHANGED: cadence 900 ms → 30 s (8236061) = 566 → 23.7 KB/s/tab; payload now 712,225 B (was ≈509 KB; includes 214 KB PFSS lines), no compression, all big sections consumed ("most keys unread" is false now); new failure: default request exceeds the 18 s backend deadline (F-SOL-02).
- K-13 — FIXED-ON-HEAD (63320e8 "Restore H29 metric channel dispatch"): `H29_CHANNELS` + `isMetricSlipstreamChannel` (engine:45,85); `harness_agn.ts` B: `triggerWarpWaveImpact` fires, warp `enabled=1`, `getWarpState()` non-null for the event.
- K-14 — PARTLY: rigidity (smbhPropagation.ts:240) and gyroradius (:278-281) FIXED-ON-HEAD (bb63988): D(1 GeV)=2.800e28, D(1 TeV)=4.438e29 (table 4.5e29), D(1 PeV)=7.033e30 (7e30), gyroradius(1 EeV, 5 µG) = 216.19 pc (textbook 216), Sgr A* CR-tsunami arrival 3.63e6 yr (was 3.2e11); `rSchwarzschildCm` STILL-PRESENT ×98.9 / ×101 (F-SOL-11).
- K-40 (trigger/parameter side) — STILL-PRESENT: the arbitrary `·1e45` at smbhPropagation.ts:136; H29 only via the hypothesis dropdown (F-SOL-09); with the default energy and every preset the planets' H29 displacement is ≤ 7.8e-9 AU per 60 fps frame even with the ×1e12 "visual exaggeration" (`num/h29presets.ts`: 7.8e-11 AU at 1e56 erg; 7.8e-9 AU for `MW_M31_Merger`), i.e. no visible orbit effect. The integration/reset semantics belong to FEC.
- K-41 — STILL-PRESENT: observer-frame default ON, β_app 1.965 applied to the radial front, front 3.9–5.9 s ahead of the channels, H29 preset decoupled, no speculative flag on the checkbox (F-SOL-09).
- K-42 — STILL-PRESENT: 148,225 + 16,641 vertices visible from startup, XZ vs XY (F-SOL-10).
- K-44 — CHANGED: glow decay FIXED; flare lifetime now 49 min (real scale) / instant expiry (display scale); 4 slots; sign mismatch still present (F-SOL-03, F-SOL-04).
- K-45 — STILL-PRESENT: corona 1.502 AU, Parker 242.2 AU at default; loops double-rotated (14.67 + 14.18 °/day); differential-rotation profiles differ (backend 14.713/−2.396/−1.787, shader 14.44/−2.87/−0.36) (F-SOL-13, F-SOL-04, F-SOL-14).

## Strengths

- **Request ownership in `solarRealtimeClient.ts`/`solarPhysicsClient.ts` is well engineered**: generation counter + `AbortController` + `Promise.race` timeout + terminal `dispose` (`solarRealtimeClient.ts:822-893`), tested with fake timers, late responses, disposal and forced-refresh races (60 + 20 tests). Backend-down behaviour executed (`ctrl/harness_down.ts`, 600 s of 60 fps): physics retried every 30 s (20 requests), realtime backs off 30 → 60 → 120 s (7 requests), no storm; idle gate `maybeRefreshPhysics()` costs 5.0 µs/call.
- **The AIA fail-closed design is defence in depth**: backend contract (`eligible:false`), frontend validator, selection rule, control zeroing (`solarObservationTexture.ts:296-327`) and tests (`solarRealtimeClient.test.ts:180-210,761-957`, `sunController.test.ts:87-370` revocation/late-texture cases). The real backend payload passes the TS validator (executed).
- **`SolarPhysicsClient` encodes the cross-runtime contract**: pins `epoch_jd_tdb`, TDB label, `effective_forcing:'synthetic'`, `live_data_enabled:false`, and locks the browser timeout (20 s) above the backend deadline (18 s) (`solarPhysicsClient.ts:105-168,214-218`).
- **Per-frame JS cost is small and flat**: whole `sunController.update()` with the real 180-feature payload: median 1.34 ms, p95 2.46 ms (p99 3.7 ms), 166 minor GCs in 20 s = 0.56 % of time, +0.1–0.2 ms during an AGN event (`ctrl/harness_ctrl.ts`).
- **Landed numeric fixes are correct** (bb63988): CR diffusion normalisation, gyroradius 216.19 pc, `apparentBeta`/`dopplerFactor`/`maxApparentBeta` match independent closed forms to 4 decimals, Sedov-Taylor inversion consistent; light-travel time to Sgr A* 26,675 yr vs 26,673 ly in the catalogue.
- **Speculative modelling is fenced in the UI**: panel collapsed, "Advanced" badge, red intro disclaimer, H29 selection flips an aria-live status to `data-model="speculative"`; the H29 channel dispatch fix (63320e8) works end to end.
- No DOM-injection sinks (`innerHTML`, `eval`) in any solar/SMBH file; request URLs are built with `URLSearchParams`.
- Checked and clean (negative result): the coronal-loop and Parker-spiral updaters replace a geometry's `position` attribute only when an arc's point count changes (the pattern that orphans GL buffers); every backend arc has a constant length (30 at `high`, 12 at `preview`), and `ctrl/harness_attr.ts` over three epochs shows 0 replacements after the first build, so no VRAM growth from that path. `sunController.update()` heap delta was 3-8 MB over 1,200 frames (GC-dominated, no monotonic growth seen).
- `ADVANCED_ASTROPHYSICS_INDEX.md` is link-clean (63/63 paths exist).

## Scores

| Dimension | Score | Basis |
|---|---:|---|
| Build/test health | 2 | 1 stale assertion keeps CI red (F-SOL-01); 89/89 in my four files after a 1-line fix |
| Type safety | 2 | 133 tsc errors in the two SMBH files, 112 implicit-any, 1 real TS2304 (F-SOL-16) tolerated by the ratchet baseline |
| Architecture/modularity | 3 | clean factory/controller split and injected deps; but three frames (F-SOL-04) and dead modules (F-SOL-17) |
| Correctness of live paths | 2 | flares invisible by default, inert controls, frame mismatch, paused-but-moving visuals (F-SOL-03/04/06/07/08) |
| Physics fidelity & honesty of labelling | 2 | numerics for CR/relativistic helpers right; stylised photosphere over-claimed, SMBH catalogue errors, README false rows (F-SOL-05/11/14) |
| Data integrity/provenance | 3 | contract validation is strict and provenance fields are explicit; fallback synthetic state not disclosed in UI |
| Backend robustness/concurrency (frontend contract side) | 2 | default request cannot meet the deadline on this hardware (F-SOL-02) |
| Security/operational exposure | 4 | no DOM sinks, URL building safe, fail-closed validation; unbounded retry of an impossible request is the only exposure |
| Performance | 3 | JS 1.3 ms/frame, but 77 % of vertices are disabled grids (F-SOL-10) and 0.7 s startup texture (F-SOL-18); GPU not measurable here |
| Test strategy | 2 | 1,385 test lines on the inert delivery stack, 0 on 4,561 lines of live visuals/physics (F-SOL-12) |
| Documentation accuracy | 2 | README rows false/dead (F-SOL-05), wrong comments (F-SOL-19); index/doc paths fine |
| Repo hygiene | 3 | stale H29 plan links, console.log, dead APIs; otherwise tidy |

## Not inspected

- Shader compilation and GPU cost: no WebGL in the sandbox; GLSL was read, ported (granulation, hash) and arithmetic-checked, never compiled; no screenshots, so on-screen colours and the visual impact of F-SOL-04/10 are computed, not seen.
- Paper-level provenance of the Neckel & Labs (1994) and Snodgrass (1983) coefficients, and the observed granulation contrast: no offline source (VizieR unreachable through the proxy); I flag only internal inconsistencies.
- `solarSystemModel.applyMetricKinematics` internals and the H29 physics model (FEC); backend PFSS/GONG/solar model (other reviewers) beyond the frame/rotation conventions and payload shape.
- `main.ts` outside the sun wiring, the rest of `index.html`/`style.css`, `agent-notes/` beyond the K list and the 56930fb/F-13 references, `my-notes/`, LaTeX documents.
- `solarProminences.ts` and `solarWind.ts` were only skimmed (UNREACHABLE); `solarPhysicsClient.test.ts` read at the level of test names.
- The unexplained 9.26 s `preview` 503 (F-SOL-02 note) was not root-caused; a probe through `SupervisedProcessRunner` at 0.25 s and 5 s exit grace both succeeded (10.7 s / 10.5 s), so the exit-grace hypothesis is unconfirmed.


---

<!-- ======================= REVIEWER API ======================= -->

# Reviewer API — backend HTTP / WebSocket surface (security, robustness, concurrency)

Target: `vkorotkikh/solar-system-realistic-sim` @ `main` 17d1e63 (`$S/main-wt`). Reviewer area id `API`. Machine: 4 vCPU Xeon 2.8 GHz VM
(calibration: `sum(i*i for i in range(10**7))` = 0.65–0.78 s), **shared with other reviewers, load average 1.4–7.0 during my runs**.
Wall times are therefore inflated; I quote CPU-seconds wherever the claim depends on cost.

## Scope & coverage

### 1a. Files read

| File | LOC | Coverage |
|---|---:|---|
| `backend/server.py` | 4,905 | read fully |
| `backend/http_ingress.py` | 581 | read fully |
| `backend/sim/base.py`, `contracts.py`, `__init__.py` | 149 / 97 / 84 | read fully |
| `backend/sim/process_supervisor.py` | 560 | read fully |
| `backend/sim/solar_process_worker.py` | 165 | read fully |
| `backend/sim/rebound_nbody.py` (engine behind `/ws/sim`) | 607 | read fully |
| `backend/sim/solar_realtime_data.py` | 2,638 | transport / cache / single-flight / AIA only (60-320, 320-700, 930-1560, 2270-2638). Payload parsing (700-930, 1560-2270) **not read** (other reviewer) |
| `backend/trajectory/budget.py` (request-owned deadline/limits for the thread-based endpoints) | 377 | read fully |
| `backend/mission/ephemeris_service.py` | 1,575 | Horizons transport only (1040-1330) |
| `backend/benchmark/accuracy.py` | 681 | report writer (621-681) |
| `backend/sim/pfss_magnetogram.py` | 1,929 | `PFSSCache` only (1225-1420) |
| `backend/sim/kuiper.py`, `solar_physics.py`, `gong_magnetogram.py`, `tudatpy_hooks.py`, `data/nearby_systems.py` | 470 / 1,096 / 1,602 / 623 / 184 | only the functions named in findings (Kuiper step/should_send; `sample_state` signature + PFSS cache ownership; GONG transport class + reachability grep; TudatPy `set_julian_date`; nearby catalog loader) |
| `scripts/dev-full-config.mjs`, `README.md:30-110`, `backend/requirements.txt`, `ci/backend-test-requirements.txt`, `.github/workflows/r3-r4-science.yml` | 116 / – / 10 / 20 / – | read |
| Tests read fully: `test_ws_resource_contract.py` (717), `test_solar_process_endpoint.py` (311), `test_benchmark_report_overwrite.py` (134), `test_solar_physics_determinism.py` (150), `test_solar_process_worker_contract.py` (50), `conftest.py` (55) | | |
| Tests read in part: `test_solar_physics_api.py` (1-420, 1015-1145 of 1,145), `test_solar_process_supervisor.py` (1-170 + names of 698) | | |
| Tests skimmed by test-name only: `test_solar_security.py` (934), `test_server_validation.py` (293), `test_network_request_shape.py` (592), `test_trajectory_endpoint_budget.py` (1,243) | | |

### 1b. What I ran (all against copies / ports 18042-18051; every server stopped, no listeners or children left)

| Command (abridged) | Outcome |
|---|---|
| `pytest -p no:cacheprovider <test>` in isolation, 8 tests | all 8 FAIL in isolation (table in F-API-03); full-run log `pytest_main.log`: **8 failed, 2134 passed, 549.56 s** |
| `time_job.py` — `sim.solar_process_worker.execute_solar_physics_job` in-process, no deadline | preview/64 7.8 s CPU; operational/64 17.1 s; high/64 30.2 s; high/180/hybrid 29.9 s (F-API-01) |
| `warm_model.py` — same model instance reused | 8.32 s → 0.01 s → 0.02 s (PFSS cache hit) |
| `uvicorn server:app --port 18042` (briefing command) + `websockets` client | WS lifecycle experiments (F-API-04/06/07, K-01/24/25/50) |
| copy of `backend/` + scratch `my-notes/` on 18044 (README flags) | report-writer experiments (F-API-05), rate-limit/XFF (F-API-15), disconnect-kills-child, flood |
| 18045 `SOLAR_SECURITY_PROFILE=network SOLAR_PHYSICS_API_KEYS=…` | 401 on every route except `/health/live` (incl. `/docs`, `/openapi.json`), WS 403 without key / evil origin / key in query, private+no-store headers, 431 on oversize header, 400 on GET body |
| 18049 local profile + `SOLAR_PHYSICS_API_KEYS` | only `/solar/physics`, `/solar/realtime*` return 401; everything else open (F-API-13) |
| `ws_*.py` (16 scripts) | first two WS messages, pause/resume/time-scale, 27 malformed/extreme frames, abrupt disconnects (160 early drops), 60 s stalled reader, 6,000-command flood, Kuiper, rate accuracy |
| `runner_direct.py`, `exit_delay.py`, `conc_solar.py`, `supervisor_soak.py` | supervisor behaviour under concurrency (F-API-02); 100-job soak with 25 deadline kills: no fd/thread/RSS growth, no orphan |
| `fuzz_http.py` (83 requests) + `thresh.py` | 5 unhandled HTTP 500 (F-API-09) |
| `upstream_amp.py`, `singleflight_probe.py` (stubbed `_open_response`) | single-flight collapse 20→3 upstream attempts; 41 attempts for 20 distinct `jd_tdb` (F-API-08) |
| `limiter_growth.py` | 200 k distinct identities → store size 1,024, 1.0 MB peak |
| `leak_probe.py` (fake WebSocket whose first send raises) | runner thread leaks (F-API-16) |
| SIGINT with a request in flight; client disconnect with 4 requests in flight | server exits when the in-flight job hits its deadline, no orphan children; disconnect kills children in <250 ms and frees capacity |

**Disclosure:** several of my scripts used `python -I` (isolated mode **ignores `PYTHONDONTWRITEBYTECODE`**) and imported from `$S/main-wt/backend`, so gitignored `__pycache__/*.pyc` files exist under `main-wt/backend/**`. `git status --porcelain` is empty; no tracked file changed. Every file-writing experiment (report endpoint, sentinel files) was run on the scratch copy `$S/work/api/copy`.

### 1c. Answers to the lead's questions 1-9 (compact; evidence in findings)

**Q1 — attack surface.** 22 HTTP routes + 1 WebSocket (`server.py` route table, verified by importing the app). Middleware order outermost→innermost: shape (network only) → CORS → auth (network only) → safe-method body (network only) → trajectory rate limit → streaming body limit (`server.py:1349-1379`, `test_trajectory_endpoint_budget.py:110`).

| Route | Auth (local / network) | Body / rate limit | Worst case |
|---|---|---|---|
| `GET /health/live` (HEAD too) `:2949` | none / **public** | – | O(1) |
| `GET /health` `:2956` | none / key | none | REBOUND probe + JSON load, 6 ms; leaks fs path (F-API-14) |
| `GET /info`, `/bodies` `:2969,2983` | none / key | none | static |
| `GET /nearby-systems[/{ref}]` `:3432,3458` | none / key | `limit` clamped 1..5000 | 135 KB / 16 ms max; leaks fs path |
| `GET /solar/capabilities` `:3004` | **none even when keys are set** / key | none | static |
| `GET /solar/realtime` `:3012` | optional key (`:3015`) / key | 36 req/60 s per identity, 2 concurrent, 12 s | ≤3.8 s outbound I/O, ≈7 upstream calls per miss |
| `GET /solar/realtime/aia-tile` `:3063` | optional key (`:3090`) / key | 60/60 s, 2 concurrent, 4 s | PNG ≤4 MiB, cache ≤16 MiB; **no `jd` range check** (F-API-08) |
| `GET /solar/physics` `:3276` | optional key (`:3312`) / key | 36/60 s, 2 workers + 2 queued, **18 s hard kill** | ≤18 CPU-s × 2 spawn processes, result ≤2 MiB (F-API-01) |
| `GET /trajectory/capabilities`, `/mission/capabilities` `:3480,4000` | none / key | none | static |
| `POST /trajectory/plan` `:3711` | none / key | ≤32 KiB streamed; 60/60 s per identity; 1 concurrent | ≤8 s thread (7 s cooperative deadline) |
| `POST /trajectory/lambert` `:3815` | none / key | same; 2 concurrent | ≤6 s; may call Horizons (1 global permit) |
| `POST /trajectory/porkchop` `:3914` | none / key | same; grid ≤2,000 pts; 2 concurrent | ≤8 s (1,683-pt grid measured 0.3–1.1 s) |
| `POST /mission/plan` `:4038` | none / key | same; 1 concurrent | ≤12 s |
| `GET /benchmark/accuracy` `:4113` | none / key | rate-limited via middleware; 1 concurrent | ≤9 s (measured 10 ms) |
| `POST /benchmark/accuracy/report` `:4167` | **none** / key | same; 1 concurrent | **writes a `.md` file** (F-API-05) |
| `/docs`, `/redoc`, `/openapi.json` | none / key | none | FastAPI defaults, enabled in both profiles |
| `WS /ws/sim` `:4860` | origin allow-list (both); key *header* (network only) | 4 connections (2 per subject), frame ≤16 KiB | 1 thread per connection, up to 1 core (F-API-06/07) |

WS protocol (`server.py:4558-4891`). Query: `engine` (rebound|tudatpy|other→fallback), `integrator` (ias15|whfast|mercurius), `protocol_version`, `fps` 10-240, `stream_hz` 5-240, `j2`; query ≤4 KiB / 32 fields; credential-looking keys rejected (1008). Server→client: `connected`, `state_update`, `orbital_elements`, `error{code}` with codes `bad_request, unsupported_command, invalid_json, invalid_command, queue_overflow, queue_backpressure, runtime_error, epoch_out_of_range, kuiper_activation_failed, not_available, engine_unavailable, engine_init_failed`. Client→server: 7 commands, field whitelist `_WS_SIM_COMMAND_FIELDS` (`:835-843`); text-only JSON ≤16 KiB (else close 1009), ≤8 object fields, depth ≤3; command queue 1,024, ≤128 commands per frame, response queue 1,024. Live: 27 hostile frames all answered with typed errors, none crashed the session; 6,000-command flood in 0.23 s → 5,392 `queue_overflow`, 208 dropped responses, session still answered `get_orbital_elements`.

**Q2 — CORS / auth / bind.** Default profile `local`: unauthenticated, CORS exact allow-list of 8 localhost origins (`:445-454`; `*` is refused at startup `:600`), `allow_credentials=True` with exact origins only. `python server.py` binds `127.0.0.1` (local) / `0.0.0.0` (network) (`:497, 4896-4905`). **The README no longer tells users `--host 0.0.0.0`** (`grep 0.0.0.0` outside `agent-notes`: only `server.py:497`); `README.md:70` is `--host 127.0.0.1 … --no-proxy-headers --ws-max-size 16384`, `npm run dev:full` refuses non-loopback unless `SOLAR_SECURITY_PROFILE=network` (`scripts/dev-full-config.mjs:80-88`). The briefing's premise is stale. Network profile is fail-closed and verified live (1b). Residual local-profile gaps: F-API-05, F-API-13, F-API-15.

**Q3 — filesystem writes.** The only write in backend non-test code is `benchmark/accuracy.py:654-662` (grep of `write_text|open(..'w'|mkdir|np.save|pickle|tempfile…`); all caches are in-memory. Containment, overwrite semantics and residual: F-API-05.

**Q4 — outbound requests.** No SSRF: every URL is a class constant (`solar_realtime_data.py:115-123`, `ephemeris_service.py:30`); user input reaches requests only as an allow-listed `channel` key → int source id, a date string derived from `jd_tdb` (urlencoded), digits-only `image_id` compared (never interpolated, `:716-726`), and Horizons body ids via a static map. Allow-list `UPSTREAM_REDIRECT_HOSTS` (`:168-173`), https-only/no port/no userinfo (`:968-1025`), manual redirects ≤3 with per-hop validation and loop detection (`:1189-1246`), `Content-Length` pre-check + chunked read with an absolute deadline using `read1` (`:1300-1348`), caps JSON 1 MiB / SWPC 4+3 MiB / text 8 MiB / binary 4 MiB (`:124-145`), TLS = urllib default context (no `verify=False`/`CERT_NONE` anywhere). Timeouts nest: provider 3.8 s < realtime route 12 s < browser 15 s (`server.py:984-1039`). Caches: snapshot LRU 16 keyed by exact `(kind, jd)` (`:611-615`), failure map 64 entries × 4.5 s, binary cache 48 entries/16 MiB keyed by canonical URL, SILSO single entry revalidated every 6 h with 48 h last-known-good (`:150-153`). Stale-while-error exists **only** for SILSO; snapshots/tiles are not served stale (503 `retryable`). Single-flight verified: 20 concurrent identical → 3 upstream attempts; 20 distinct `jd_tdb` → 41 (F-API-08). Horizons: fixed host, 2 MiB cap, 1 global permit, **default urllib redirect handling** (F-API-19). GONG archive: `GongArchiveProvider/StdlibGongTransport` are **never instantiated** outside tests (grep) and `forcing=data_driven`/hybrid are hard-gated `disabled_unvalidated` (`server.py:3328-3332`, `solar_process_worker.py:31-32,47-62`) → not reachable.

**Q5 — rate limits & deadlines.** Measured in F-API-01/02/15 and prior-issue notes. `_solar_physics_rate_locks` is a *store of timestamp deques* (misnamed; the lock is `_solar_physics_rate_lock`), `_record_solar_rate_request` (`server.py:1724-1765`): TTL prune from the cold end, LRU cap `SOLAR_RATE_LIMIT_MAX_IDENTITIES`=1,024 (≤4,096). Identity = authenticated subject, else `peer:{ip}`; `X-Forwarded-For` only if the peer ∈ `SOLAR_TRUSTED_PROXY_CIDRS`, right-to-left first-untrusted walk, ≤16 hops (`:1594-1657`). Deadline for solar = **process** (spawn child, SIGTERM→SIGKILL, `process_supervisor.py:437-446,539-560`); verified 0 children after a timeout and <250 ms after a client disconnect. Other endpoints = thread + cooperative `PlanningContext` (measured overshoot ≤20 ms: plan 0.119 s for a 0.1 s deadline, porkchop 0.100 s). Under N=6 concurrent `preview/8`: 2 shed in 0.19 s (`solar_compute_saturated`), 4 admitted, **0 succeeded** (F-API-01, F-API-02).

**Q6 — WS lifecycle.** K-01 fixed; K-24 fixed; K-25, K-50 residuals: F-API-04/06/07/16. First two messages (18042, README-less default flags): `connected` at +0.03 s `{protocol_version:1, engine:"rebound", integrator:"ias15", fidelity:"high", bodies:41, jd:2451545.0, jd_time_scale:"TDB", fps:60, stream_hz:60, warnings:[]}`, then `state_update` jd 2451545.133, 41 bodies, 7.9 KB. Extreme `jd` (1e9, −1e9, 1e300, bool) → `epoch_out_of_range`; NaN/Infinity/"abc" → `bad_request`; valid range is only 1990-01-01…2050-01-01 TDB (`rebound_nbody.py:52-53`); a 50-year seek blocks the runner ≈5 s. Disconnect in the middle of 8 queued seeks: runner thread gone 0.9 s later. Checkpoints capped at 8 (`:48`), measured 6 retained after 6 alternating seeks.

**Q7 — error handling.** F-API-09 (500s), F-API-14 (leaks, schema), F-API-10 (no logging), F-API-16 (`print` + swallowed task exceptions). 15 `except Exception`/`BaseException` sites in `server.py` (lines 168, 2024, 2053, 2689, 2707, 3046, 3157, 4334, 4358, 4366, 4404, 4783, 4798, 4802, 4850); most re-raise as typed HTTP errors, three silently degrade (168, 2707, 4798-4802).

**Q8 — structure.** F-API-11 (outline below). **Q9 — logging/config/docs/DoS.** F-API-10, F-API-13; DoS: `max_features` clamped 8..256 → 413 (`:3336-3348`), `jd` ±200 y on `/solar/physics` (`:3299`) but **unbounded on aia-tile and trajectory routes** (F-API-08, F-API-09), `limit` clamped, body ≤32 KiB, porkchop grid ≤2,000 points, no user-facing regexes (only `_normalize_lookup_token`, linear).

### 1d. `server.py` outline (line ranges per concern)

| Lines | Concern |
|---|---|
| 1-171 | docstring, 37 `from … import` statements, optional TudatPy import (swallows *any* error, `:168`) |
| 172-189 | lifespan + `app` |
| 192-442 | two ASGI middlewares (streaming body limit, trajectory rate limit) |
| 445-762 | security profile: CORS defaults, `SolarSecurityConfig`, env parsing, protected-header merge, network auth middleware |
| 765-1308 | env loaders + ≈60 tunables (WS, solar, realtime, AIA, trajectory, mission, benchmark) |
| 1309-1379 | ingress path set, validation-error handler, middleware wiring |
| 1381-1478 | **24 module-level stateful objects** (rate stores, locks, semaphores, 3 executors, runner, provider, model) + runner lifecycle |
| 1481-1826 | header parsing, API-key auth, client identity, rate limiter |
| 1829-2209 | jd parsing, dead `_build_solar_physics_state` seam (`:1895`), WS admission, owned-thread/process helpers |
| 2212-2945 | trajectory error mapping, limits, size validators, readiness helpers, 9 pydantic request classes, report-path resolver |
| 2949-3477 | health/info/bodies, solar routes, nearby-systems |
| 3480-4222 | trajectory / mission / benchmark routes |
| 4227-4553 | `SimulationRunner` |
| 4558-4891 | WS protocol helpers + session + endpoint |

## Findings

(Sorted High → Low. No Critical in this area: see the adversarial notes in F-API-05 for why the report writer is not rated Critical.)

### F-API-01 — `/solar/physics` cannot meet its own 18 s hard deadline at `operational`/`high`/`ultra`, and the live frontend asks for `high`
- Severity: High   - Class: VERIFIED   - Reach: LIVE (`src/sunController.ts` → `GET /solar/physics`) + CI   - Effort: M
- Where: `backend/server.py:912-924` (default 18.0 s, clamp 19.0 s), `:3350-3381` (deadline → 503 `solar_compute_timeout`); `backend/sim/solar_process_worker.py:94` (new model per job); `backend/sim/solar_physics.py:224-225` (cache owned by the model); `src/sunController.ts:171-176`. Introduced by `8eafc80` (2026-09-26 "isolate physics execution from API process").
- Evidence:
  ```
  # solar_process_worker.py:94 — executes in a fresh spawn child for EVERY request
  model = SolarCoronaPhysicsModel(seed=17, base_tube_count=540)
  # solar_physics.py:225 — the PFSS cache lives and dies with that model
  self._pfss_cache = PFSSCache()
  # src/sunController.ts:171-176
  new SolarPhysicsClient({ baseUrl: backendBaseUrl, maxFeatures: 180, fidelity: 'high', forcing: 'hybrid', liveData: true })
  ```
  Cost of one job, measured with `execute_solar_physics_job` in-process (no deadline), `nice`, load 5–7:
  ```
  preview     64  synthetic  wall  8.13 s  cpu  7.76 s  190 KB
  operational 64  synthetic  wall 17.50 s  cpu 17.09 s  300 KB
  high        64  synthetic  wall 31.66 s  cpu 30.15 s  412 KB
  high       180  hybrid     wall 33.86 s  cpu 29.93 s  729 KB   <- the frontend's request
  one SHARED model, preview/64, 3 calls:  8.32 s, 0.01 s, 0.02 s       (cProfile, preview/8: 10.4 of 10.9 s inside PFSSCache._compute_solution, almost all in trace_field_batch)
  ```
  The repo's own gate runs the same payloads with no deadline (`test_solar_process_worker_contract.py:13-48`); durations in the full run (`pytest_main.log:303-319`): `ultra/256` 41.5 s, `high/256` 34.6 s, `high/180` 31.2 s, `operational/256` 18.2 s, `preview/256` 8.6 s. Over HTTP: `GET /solar/physics` with **all defaults** → `503 solar_compute_timeout` after 18.02 s; one cold `preview/8` → 200 in 9.45 s; 6 concurrent `preview/8` → 2× `solar_compute_saturated` (0.19 s) and 4 admitted, **0 succeeded**. All five deadline CI failures reproduce in isolation (F-API-03). `/solar/capabilities` advertises `["preview","operational","high","ultra"]` with no latency information (`server.py:3004-3009`).
- Impact: with the backend running as the README says, the sun layer never receives a response at the frontend's default settings. Every 30 s (`solarPhysicsClient.ts:9-11`) the backend burns up to 18 CPU-s and then kills the child (≈60 % duty cycle of one core, indefinitely) for nothing. Two of the four admitted slots are queue slots whose clock starts at admission (`process_supervisor.py:253-289`, `test_solar_process_supervisor.py:97`), so a queued job gets only the remainder of 18 s and is killed mid-compute. There is no operator remedy: `SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS` is clamped to 19 s (`server.py:912,915-921`, asserted by `test_solar_process_endpoint.py:302-311`) and undocumented. Five CI tests fail for this reason.
- Fix: (1) stop paying the cold PFSS cost per request — keep one long-lived worker process per slot holding a warm `SolarCoronaPhysicsModel` (restart it on timeout/kill), or persist the PFSS solution content-addressed by the existing `solution_id` so a fresh child can load it (measured 8.3 s → 0.01 s); decide with the solar reviewer whether the synthetic solution identity really needs the exact epoch, because the frontend polls with a moving `jd_tdb` (`solarPhysicsClient.ts:286`) and an exact-epoch cache would still miss every poll; (2) add a parent-side response cache + single-flight keyed by `(epoch, fidelity, max_features, forcing, live_data)`; (3) make the contract honest until (1) lands — per-fidelity deadlines with the browser timeout raised to match (`solarPhysicsClient.ts:10`, `server.py:912`), or change `sunController.ts:171-176` to `operational`/`preview`; (4) for queued jobs, start the deadline at dequeue or reject with `solar_compute_saturated` when predicted wait + cost exceeds the budget; (5) add a gate that runs every advertised fidelity through the real runner with the production deadline (the existing wire-budget test would have been the place).
- Prior: NEW (K-11's 900 ms poll is fixed — poll is now 30 s — which makes the permanent failure quieter, not absent).
- Adversarial check: (a) "this box is just slow/loaded" — the claim rests on CPU-seconds (30 s user) not wall; the GitHub `ubuntu-24.04` runner fails the same five tests (run 36307010887); this VM runs the 1e7-iteration Python loop in 0.65–0.78 s, while a modern laptop core typically needs roughly 0.4–0.6 s (my estimate, not measured), i.e. ≈1.2–2× faster — so `high` would still need ≈15–25 CPU-s there against 18 s, with no headroom for two parallel workers or a browser rendering on the same machine. Even if shared-core (SMT) contention inflated my CPU-seconds by 1.5× — plausible on 4 shared vCPUs, not measured — `high/180` would still be ≈20 s. `operational` is the borderline case: the CI runner also failed the default-parameter test (`test_jd_inside_the_window_is_accepted`, operational/220), so it does not fit there either. (b) "the frontend degrades gracefully" — true (30 s back-off, no crash), which is why this is High not Critical; the feature simply never delivers while burning CPU. (c) "a mocked timeout" — no: the 503 comes from the real supervisor at 18.0 s with a real child. (d) "an env override exists" — clamped at 19 s. Outcome: stands.

### F-API-02 — Supervisor discards a finished, validated result when the child needs more than 0.25 s to exit
- Severity: Medium   - Class: VERIFIED   - Reach: LIVE (`/solar/physics`)   - Effort: S
- Where: `backend/sim/process_supervisor.py:36` (`_REAP_GRACE_SECONDS = 0.25`), `:460-469`.
- Evidence:
  ```
  encoded = receive_connection.recv_bytes(maxlength=self._max_result_bytes)       # full result in hand
  exit_remaining = max(0.0, absolute_deadline - time.monotonic())
  process.join(min(_REAP_GRACE_SECONDS, exit_remaining))                          # 0.25 s
  if process.is_alive():
      self._reap_or_quarantine(job_id, process)
      raise ProcessTimedOut("worker sent a result but did not exit before its deadline")   # -> HTTP 503 solar_compute_timeout
  ```
  Direct run (`runner_direct.py`, 2 concurrent `preview/8`, 18 s deadline): `job0: ProcessTimedOut(worker sent a result but did not exit before its deadline) at 10.01s` / `job1: OK at 10.01s`. HTTP run (6 concurrent `preview/8`): two admitted requests returned `503 solar_compute_timeout` at **9.3 s and 9.9 s** (their compute time) rather than at the 18 s deadline. Child exit delay after sending the result, 6 samples under load ≈3: 0.125–0.172 s against 0.25 s allowed (`exit_delay.py`). Incidence: 3 discarded results out of the 18 jobs that finished computing across three experiments (1 of 4 direct, 2 of 2 in the HTTP run, 0 of 12 in a calmer six-run series at load 3.2–3.8); the other two admitted HTTP jobs were legitimately killed by the 18 s clock.
- Impact: valid results are thrown away and reported as a deadline failure (`retryable:true`), wasting 8–30 CPU-s; probability rises with CPU contention — exactly when a user also runs the 3D renderer in a browser on the same machine. It also muddies diagnosis of F-API-01 because both surface as the same error code.
- Fix: decode and validate first (`self._decode_result(encoded, payload)`), return the result, and let the existing `finally` (`:477-491`, `_reap_or_quarantine`) terminate/join the child; never convert an already-validated result into an error. Add a test whose target sleeps 0.6 s after sending.
- Prior: NEW.
- Adversarial check: could the child have been genuinely over its deadline? No — the two HTTP failures occurred at ≈9.5 s of an 18 s budget and the direct run printed the discard message; the 1.5× margin measured in `exit_delay.py` is thin and varies with heap size (the child holds numpy/astropy structures).

### F-API-03 — CI is red for three different reasons; classification of the eight failing tests
- Severity: Medium   - Class: VERIFIED   - Reach: CI   - Effort: S–M
- Where: `backend/tests/test_solar_physics_api.py:70,166,282,380,1033`; `test_solar_physics_determinism.py:40,69`; `test_solar_process_supervisor.py:135-164`.
- Evidence: each test run alone with `nice -n 10 $S/venv312/bin/python -m pytest -p no:cacheprovider -q "<id>"`; load 2.7–4.3 (other reviewers active). Full run on this box: `8 failed, 2134 passed in 549.56 s` (7 CI failures + #8). The hard deadline the five 503s hit is **18.0 s** (`SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS` default, `server.py:915-924`; ceiling 19.0 s); the same jobs need 17–34 CPU-s in isolation (F-API-01).

  | # | Test | Isolated result | Verdict |
  |---|---|---|---|
  | 1 | `test_solar_physics_api.py::test_solar_physics_returns_3d_coronal_features` (high/64) | FAIL 503, 20.1 s | **implementation** — F-API-01 (30 CPU-s vs 18 s) |
  | 2 | `…::test_solar_physics_hybrid_mode_without_live_data_is_stable` (high/32) | FAIL 503, 19.4 s | same |
  | 3 | `…::test_solar_physics_enforces_rate_limit` (first request high/16) | FAIL 503, 19.3 s | same; the limiter itself works (36×413 then 24×429 live) but the test needs a 200 first |
  | 4 | `test_solar_physics_determinism.py::test_different_fidelity_yields_a_different_payload` | FAIL 503, 19.1 s | same (even the first, `operational/220`, exceeds 18 s) |
  | 5 | `…::test_jd_inside_the_window_is_accepted` (defaults = operational/220) | FAIL 503, 19.3 s | same |
  | 6 | `test_solar_physics_api.py::test_historical_response_uses_separate_current_wall_epoch` | FAIL `KeyError: 'wall_jd'`, 1.6 s | **deterministic test drift** |
  | 7 | `…::test_synthetic_and_hybrid_builders_never_request_realtime_data` | FAIL `TypeError … missing keyword-only 'wall_jd'`, 1.6 s | **deterministic test drift** |
  | 8 | `test_solar_process_supervisor.py::test_hard_timeout_kills_reaps_and_recovers_capacity` (not in CI's list) | FAIL 6/6 in isolation (3.3 s) and in the full run | **hardware-speed dependent** |

  Why 6/7: commit `6a22361` (2026-09-27 "bind fixed-epoch physics deterministically") moved wall-epoch stamping out of `sample_state` (`solar_process_worker.py:34-43`: "Wall time is response metadata only") while the tests still patch `server.SOLAR_PHYSICS_MODEL.sample_state` with a fake that *requires* `wall_jd` and call `server._build_solar_physics_state` (`server.py:1895-1914`), a seam production never calls. Why 8: the test gives the child 0.15 s from `submit()` to publish its PID (`:148`); measured spawn→PID-file latency here is 0.23–0.32 s (`spawn_latency/test_spawn_latency.py`, identical under `python -m pytest` and a plain script), so the supervisor correctly kills the child before it can publish; CI's faster interpreter start-up passes.
- Impact: the only CI workflow has never been green on `main` (also the TS failure, other reviewer), and three unrelated causes are interleaved, which hides real regressions.
- Fix: #6/#7 — re-point at `sim.solar_process_worker.build_solar_physics_state` (assert `wall_epoch_jd_tdb` is stamped after sampling) and delete `server._build_solar_physics_state` and its imports; #1-5 — fix F-API-01, and until then drive API-level tests through `_install_fast_solar_response` (`test_solar_physics_api.py:27-53`) and keep one marked-slow real-runner test at `preview`; #3 can use `max_features=4096` (413) to reach the limiter without compute; #8 — use `timeout_seconds ≥ 2.0` and wait for the PID before asserting `ProcessTimedOut`, or let the fixture signal readiness before the clock starts.
- Prior: NEW.
- Adversarial check: "load-dependent?" — #1-5 fail on CPU-seconds, not scheduling (F-API-01); #6/#7 fail in 1.6 s; #8 failed 6/6 at load 2.7–3.1 and passes in CI, so it is hardware-speed dependent rather than random.

### F-API-04 — K-25 still present: one 41-byte command freezes a WebSocket session while telemetry says `paused:false` (the only in-repo client is UNREACHABLE)
- Severity: Medium   - Class: VERIFIED   - Reach: BACKEND (`/ws/sim` is live; its only in-repo client `src/frontend/app/simulationClient.ts` is UNREACHABLE from `main.ts`, `reach.mjs`)   - Effort: S
- Where: `backend/server.py:4332-4339` (any command exception latches `_runtime_error`), `:4351` (stepping requires `_runtime_error is None`), `:4440-4441` (`resume` clears only `paused`), `:4529-4551`; `backend/sim/rebound_nbody.py:591-607`.
- Evidence (live, 18042):
  ```
  elements(earth) -> orbital_elements ...            jd=2451550.4  paused=False runtime_error=None
  elements(sun)   -> error code=runtime_error 'Command handling failed: Particle and primary positions are the same.'  paused=True
  resume          -> jd 2451550.4000 -> 2451550.4000 (advancing: 0.0)   paused=False runtime_error='Command handling failed: …'
  set_time_scale 50 + resume, 1 s -> jd span 0.0 ;  elements(earth) still answers
  ```
  The `sun` is `bodies[0]` of the `connected` message, so a UI "show elements for the selected body" hits it on the first click.
- Impact: permanent silent freeze until reconnect; the stream keeps reporting `paused:false`, `time_scale:50`. Any command-level exception (not only this one) has the same effect.
- Fix: validate in the handler — `get_orbital_elements` for `body_ids[0]` → `_push_error(..., code="not_available")` without latching; wrap per-command exceptions as command errors and keep `_runtime_error` only for step/state failures; make telemetry `paused = self.paused or self._runtime_error is not None`; let an explicit `resume` clear a latched non-fatal error. Add a live WS test that sends `get_orbital_elements sun` then checks `jd` advances (none of the six `websocket_connect` calls in the backend tests ever completes a session, F-API-12).
- Prior: K-25 (STILL-PRESENT).
- Adversarial check (Medium cap): endpoint is live but has no in-repo live client; impact is self-inflicted per-session.

### F-API-05 — K-26 residual: `POST /benchmark/accuracy/report` still lets an unauthenticated caller overwrite any `.md` under `my-notes/`; no Host/Origin validation; path disclosure; NUL byte → 500
- Severity: Medium   - Class: VERIFIED (server side); DNS-rebinding in a browser NOT run   - Reach: BACKEND (local profile)   - Effort: S–M
- Where: `backend/server.py:4167-4222`, `:2766-2789` (path resolver), `:2926-2944`, `:1349-1379` (no `TrustedHostMiddleware`); `backend/benchmark/accuracy.py:637-664`; `README.md:75-77`.
- Evidence (scratch copy, `my-notes/SENTINEL.md` md5 `33ccc1f2…`):
  ```
  POST {"output_path":"SENTINEL.md"}                          -> 409  "refusing to overwrite existing report `/…/my-notes/SENTINEL.md`; pass `allow_overwrite: true`"
  POST {"output_path":"SENTINEL.md","allow_overwrite":true}   -> 200, md5 -> 2d43b109… (overwritten); no key, no Origin needed
  ../escape.md, /etc/escape.md, a/../../escape.md, symlink my-notes/link.md -> outside   -> 400 (containment holds)
  POST … -H 'Host: evil.example:18044' -H 'Origin: http://evil.example:18044' allow_overwrite:true -> 200 (overwritten again)
  OPTIONS from https://evil.example -> 400;  text/plain simple POST -> 422;  output_path "ab\u0000cd.md" -> 500 "Internal Server Error"
  ```
  Responses carry absolute paths (`409`/`400` detail, `reportPath`, `referenceFile`).
- Impact: browser reachability from another origin is closed (CORS allow-list since `8f1f051`, strict body model) and overwrite is opt-in since `2b8a2c3`, but the primitive remains: any local process, any LAN host if the user binds `0.0.0.0` in local profile, and — because HTTP has no Host/Origin check — any page that achieves DNS rebinding to `127.0.0.1:8042` can overwrite the author's research notes (path names are public in the repo). Nested `output_path` also creates arbitrary directory trees.
- Fix: require the API key (or an explicit `SOLAR_ENABLE_REPORT_WRITE=1`) for this route in the local profile too; add `TrustedHostMiddleware(["localhost","127.0.0.1","[::1]", …configured])` in local profile and reject non-GET requests whose `Origin` is present and not allow-listed; catch `ValueError` from `Path.resolve()` → 400; return a repo-relative `reportPath`; write reports to an untracked `backend/reports/` rather than the hand-written `my-notes/`.
- Prior: K-26 / `SERVER_HARDENING_AUDIT` §2 (CHANGED: CORS fixed, overwrite opt-in, `O_EXCL` create, dangling-symlink guard; primitive intact) and N-4 (NUL → 500, STILL-PRESENT) / N-5 (paths, STILL-PRESENT).
- Adversarial check: why not Critical — loopback default, explicit `allow_overwrite:true`, `.md` only, content is a generated report not attacker-controlled, files are git-tracked (recoverable), Chrome ≥142 gates loopback access behind a permission prompt (not verified here; Firefox/Safari not checked).

### F-API-06 — WebSocket stalled reader: no send timeout or idle eviction; connection, thread and ~40 % of a core are held indefinitely
- Severity: Medium   - Class: VERIFIED   - Reach: BACKEND   - Effort: S
- Where: `backend/server.py:4679-4708` (`await websocket.send_text(...)` at `:4688,4702` with no timeout), `:4315-4416` (runner keeps building states at `target_fps`), `:4860-4891`.
- Evidence (`ws_slow_reader.py`: raw socket, `SO_RCVBUF=4096`, handshake, `?stream_hz=240&fps=240`, 365 d/s, then never `recv`):
  ```
  t+ 5s : threads 12, rss 103 MB, cpu 42 %, server Send-Q 2,805,760 B
  t+30s : threads 12, rss 103 MB, cpu 40 %, Send-Q 2,805,760 B
  t+60s : threads 12, rss 103 MB, cpu 39 %, Send-Q 2,805,760 B     (connection still ESTABLISHED; closed only when the client closed)
  ```
- Impact: memory is bounded (good) but four such connections (`WS_SIM_CONNECTION_LIMIT`=4) pin ≈1.6 cores and all admission slots until the peer closes, from any client that can reach the port (local profile: no key). The runner also renders every frame at `target_fps` regardless of `stream_hz` (`fps=240&stream_hz=5` is accepted).
- Fix: wrap each send in `asyncio.wait_for(..., 5.0)` and close 1013/1011 on timeout; track "last successful send" and stop the runner when it is stale; build `_latest_state` at `stream_hz`, not `target_fps`.
- Prior: NEW (related K-24 lifecycle theme).
- Adversarial check (Medium): bounded by 4 slots and by the local-trust model; refuted "unbounded memory" (RSS flat).

### F-API-07 — K-50 residual: with Kuiper active the sim runs at 3–27 % of the requested `time_scale` at 100 % CPU, and a paused session can resend 265 KB payloads at ~2.8 MB/s (the only in-repo client is UNREACHABLE)
- Severity: Medium   - Class: VERIFIED   - Reach: BACKEND (no live client; `simulationClient.ts:301` is UNREACHABLE)   - Effort: M
- Where: `backend/server.py:4354-4357` (Kuiper integrated in the same loop), `:4399-4407` (payload attached when `should_send()`), `:4694-4703` (`has_kuiper_payload` ⇒ always send); `backend/sim/kuiper.py:434-445` (`should_send` = `_frame_counter % 5 == 0`, counter advances only in `step()`).
- Evidence (`ws_rate_kuiper.py`, `ws_kuiper_paused.py`):
  ```
  requested   1 d/s -> delivered 0.25 d/s ( 25 %)   16.7 msgs/s  1343 KB/s  server cpu 109 %
  requested  10 d/s -> delivered 2.71 d/s ( 27 %)   18.1 msgs/s  1478 KB/s  server cpu 111 %
  requested 100 d/s -> delivered 3.04 d/s (  3 %)    7.7 msgs/s  1233 KB/s  server cpu 111 %      (no Kuiper: 98.4–98.8 % of requested at 1…365 d/s)
  pause with Kuiper active, 10 trials: 9× 2.8 msgs/s 21.6 KB/s ; 1× 10.8 msgs/s 2,844 KB/s (counter%5==0 at pause time ⇒ payload re-attached every frame)
  ```
- Impact: telemetry still reports the requested `time_scale` while the integrator delivers 3–27 %; the phase-dependent paused resend multiplies bandwidth ×130 for as long as the session stays paused.
- Fix: put a monotonically increasing `kuiper_seq` in the payload and send only when it changes; integrate Kuiper on its own thread/cadence or clamp per-frame `dt`; compute `dt_days` from the measured wall-clock delta; add `effective_days_per_sec` to telemetry.
- Prior: K-50 (STILL-PRESENT: paused resend and rate divergence; the 93 KB payload is now 265 KB).
- Adversarial check (Medium cap): no in-repo live consumer; 20 %-phase dependence means most pauses look fine, which is why it was not seen in casual use.

### F-API-08 — `GET /solar/realtime/aia-tile` has no `jd` range check and an exact-float cache key: every distinct `jd_tdb` is a cache miss that costs a full upstream snapshot; malformed `image_id` is reported as a retryable 503
- Severity: Medium   - Class: VERIFIED (miss-per-jd, status mapping); upstream call count per miss is from code (not executed against the network)   - Reach: BACKEND (local profile unauthenticated)   - Effort: S
- Where: `backend/server.py:3063-3092` (jd parsed, never range-checked — contrast `:3299`), `:3132-3165` (`SolarRealtimeFetchError`/`Exception` → 503); `backend/sim/solar_realtime_data.py:611-615` (key `("snapshot","jd_tdb",jd)`), `:2478-2480` (5 Helioviewer calls), `:2546-2638`, `:697-726`.
- Evidence (stubbed `_open_response`, counts of upstream attempts): 20 concurrent identical `latest()` → **3**; 20 concurrent distinct `jd_tdb` → **41**; `jd_tdb=1e300` still spends 2 upstream calls before failing in date conversion (`ErfaWarning` noise). Live: `image_id=abc`, `0`, 21 digits → `503 aia_tile_unavailable retryable:true` (should be 400/422).
- Impact: a client can force ≈7 upstream calls per request (2 SWPC + 5 Helioviewer; +1 tile) at the route's 60/min budget per identity — a modest but unnecessary outbound amplifier toward NOAA/Helioviewer from the user's IP; the 16-entry snapshot LRU is evicted by 16 distinct jds, discarding the useful "latest" entry. A malformed id costs a permit and a thread hop and invites client retry loops.
- Fix: apply the same ±200-year gate (better: AIA coverage 2010→now) and quantise `jd_tdb` to e.g. 10 min before keying; share one snapshot per quantised key; validate `image_id` with the digits-only rule at the route (`server.py:3067-3074`) and return 400.
- Prior: K-51 (cache-ignores-jd is FIXED; this is the residual keyspace amplification).
- Adversarial check: concurrent *identical* requests are well collapsed, `force_refresh` is bounded (36–60/min, GET refresh rejected in network profile, `server.py:1689-1701`), so impact is bounded by the rate limiter.

### F-API-09 — Schema-valid but absurd numeric inputs reach internal `TrajectoryInputError` and surface as plain-text HTTP 500; planners return a "best route" for JD up to 1e17
- Severity: Medium   - Class: VERIFIED   - Reach: BACKEND   - Effort: S
- Where: `backend/trajectory/lambert.py:168-175` (`arrival <= departure` ⇒ `TrajectoryInputError`), `backend/trajectory/mga.py:298`, `backend/trajectory/planner.py:174`; handlers `backend/server.py:3766-3783` (plan) and `:4075-4092` (mission) catch `TrajectoryRequestRejected`/`Planning*`/`EphemerisError` only; models `:2809-2823`, `:2877-2924` (`FiniteFloat` without bounds; `mining_days` has `ge=0` only).
- Evidence (`fuzz_http.py`, 83 requests, then `thresh.py`):
  ```
  POST /trajectory/plan  departure_jd=1e15 .. 1e17 -> 200 {"best":{"bodyRoute":["earth","mars"],…}}
  POST /trajectory/plan  departure_jd=1e20 / 1e100 / 1e300 -> 500 "Internal Server Error"      (log: TrajectoryInputError: `tof_days` must be positive and produce a finite arrival epoch)
  POST /mission/plan     mining_days=1e30 / 1e300, departure_jd=1e300 -> 500
  /trajectory/lambert and /porkchop with the same extremes -> 400/422 (pre-checks fire first)
  ```
  The rest of the 83-request fuzz (NaN/inf, 40 KB identifiers, 30,000-deep JSON, duplicate keys, 5 KB query strings, NUL/non-UTF-8 paths) returned a valid 200 or a 4xx/413/422, apart from two 503s (histogram: 200×25, 400×19, 404×4, 413×4, 422×24, 503×2, 500×5; one 503 is the 18 s `solar_compute_timeout` of the default `/solar/physics` request, I did not record which request produced the other).
- Impact: error-contract break (bare-text `Internal Server Error`, no JSON, no `code`), a server-side traceback per bad request, and silent garbage: Kepler transfers are "computed" for epochs billions of years out with no validity window (the WS engine allows 1990–2050, `/solar/physics` ±200 y).
- Fix: bound `departure_jd` (and `departure_start_jd`/`arrival_jd`, `mining_days`) with `Field(ge=…, le=…)` matching the catalog's validity window; catch `TrajectoryInputError` in plan/mission/porkchop/lambert and map to 400 `trajectory_invalid_time_range`; add a catch-all `@app.exception_handler(Exception)` returning the `{"detail":{"code","message","retryable"}}` shape; add the 5 fuzz inputs as regression tests.
- Prior: NEW (`SERVER_HARDENING_AUDIT` §6 "unhandled RuntimeError → 500" is fixed for `spice`; this is a sibling).
- Adversarial check: impact is limited to garbage input; no resource blow-up (0.01 s).

### F-API-10 — No server-side logging at all; 503/429/401/timeout/discard paths are invisible to an operator
- Severity: Medium   - Class: VERIFIED   - Reach: BACKEND   - Effort: S
- Where: `backend/server.py` (no `import logging`; single `print` at `:4851`); `backend/sim/process_supervisor.py` (no logging; kills, quarantines, discards are silent); only `sim/tudatpy_hooks.py` imports `logging`.
- Evidence: `grep -rn "^import logging" backend --include=*.py | grep -v tests` → `sim/tudatpy_hooks.py` only; `server.py` has 15 `except Exception/BaseException` sites. F-API-01's 18 s kill, F-API-02's discarded results and F-API-04's latched `_runtime_error` produce no log line (only the uvicorn access log, which shows a bare 503). 56 of the 61 backend env knobs are undocumented outside the code (AST scan; F-API-13).
- Impact: the failure modes in this report could only be found by experiment; an author running `npm run dev:full` sees nothing explaining why the sun layer is empty.
- Fix: `logger = logging.getLogger("solar.api")`; one INFO/WARNING line per 429/401/503/504 with code, route, identity, duration; in the supervisor log spawn/kill/discard/quarantine with job id and elapsed; replace the `print` and unretrieved task exceptions (F-API-16) with `logger.exception`; expose `runner.snapshot()` (already implemented, `process_supervisor.py:231-251`) on `/health`.
- Prior: NEW.

### F-API-11 — `server.py` is a 4,905-line composition root with 24 module-level stateful objects, a dead production seam, and 168 test monkeypatches of its globals
- Severity: Medium   - Class: VERIFIED   - Reach: BACKEND   - Effort: L
- Where: whole file (outline in 1d); dead seam `backend/server.py:1895-1914`.
- Evidence (AST scan): 135 assignments (117 UPPER_CASE constants, 63 env-loader calls), 80 sync + 21 async functions, 16 classes, 3 `global` statements, **24** module-level stateful objects (`:883,1040,1381-1438`: rate stores, locks, 8 semaphores, 3 executors, runner, provider, model). Eleven test files import `server`; eight of them call `monkeypatch.setattr(server…)` — **168 patches over 43 distinct `server.*` names** (module globals or methods of module-level objects: `SOLAR_SECURITY_CONFIG` 22×, `SOLAR_REALTIME_DATA` 21×, `_solar_aia_tile_rate_locks` 11×, `_solar_physics_runner` 8×). `_build_solar_physics_state` (`:1895`) is called by no production code (it ends in `del force_data_refresh`), yet tests 6/7 of F-API-03 assert on it. `_solar_physics_rate_locks` is a dict of deques, not locks. `sim/__init__.py:22-71` duplicates engine selection (`create_engine`, `engine_availability`) that `server.py:2686-2708,4741-4766` re-implements; nothing in `server.py` imports it.
- Impact: a second engineer cannot change one concern (rate limiting, WS, solar) without reading all of it; tests are coupled to module globals so refactors break unrelated tests; dead seams rot (F-API-03).
- Fix (module boundaries, no code): `config.py` (all env loaders + one frozen `Settings`; `create_app(settings)` replaces module-global monkeypatching) → `security/` (profile config, auth, client identity, `RateLimiter` class, move `http_ingress.py` here) → `runtime/owned_work.py` (`_run_owned_thread`, request-owned runners, semaphores/executors as one `ExecutionBudgets` object, solar runner lifecycle) → `schemas.py` (the 9 pydantic request classes + normalisers) → `routes/{health,solar,trajectory,mission,benchmark,nearby}.py` (APIRouters) → `ws/{protocol,runner,session}.py` (`SimulationRunner` + command normalisation, unit-testable with fake engines) → `server.py` shrinks to ≈100 lines (`create_app`, lifespan, `__main__`). Delete `_build_solar_physics_state`; route engine selection through `sim.create_engine`. Migrate in the order: config → security → runtime → ws → routes.
- Prior: NEW (K-37's "monolith" for the frontend is a different file).

### F-API-12 — Test strategy gaps in the backend API layer: tests that pass for the wrong reason, a source-text test, and no end-to-end WebSocket session
- Severity: Medium   - Class: VERIFIED   - Reach: CI / BACKEND   - Effort: M
- Where: `backend/tests/test_solar_physics_api.py:1059-1079`; `test_solar_physics_determinism.py:96-150`; `test_ws_resource_contract.py` (all six `websocket_connect` calls expect rejection before engine setup).
- Evidence: `test_solar_physics_times_out_with_short_budget` patches `server._build_solar_physics_state` with a 0.2 s sleeper and `SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS=0.05`; my copy of it with a call counter: `HTTP 503 in 0.06s … patched _build_solar_physics_state called 0 time(s)` — the 503 is the real spawn racing a 50 ms deadline. `test_run_owned_thread_holds_permit_until_the_work_actually_finishes` asserts the *text* of `inspect.getsource(server._run_owned_thread)` (`"add_done_callback" in source`, `"finally:" not in source.split(...)`) and then exercises a *local re-implementation* of the pattern (`:132-142`), not the function. No test connects, receives `connected`/`state_update`, sends a command and disconnects (grep `_runtime_error|websocket_connect`), which is how K-01 (engine init fails on REBOUND 5) and K-25 stayed invisible; the engine-contract tests use fake engines.
- Impact: green tests that do not test the behaviour they name; the two highest-risk WS regressions of the prior audit had no detector.
- Fix: delete/replace the short-budget test with one that patches the *runner* (`FakeRunner` that sleeps) and asserts 503 + elapsed; replace the source-text assertion by calling `_run_owned_thread` with a real executor and a slow function and asserting the permit is held until completion; add `test_ws_sim_end_to_end.py` using `TestClient.websocket_connect` with the real `REBOUNDEngine` (init is 2 ms): connected → first state → pause → `get_orbital_elements sun` → `resume` advances `jd`; abrupt-close → thread count returns.
- Prior: related to `SERVER_HARDENING_AUDIT` §5 (the old short-budget test also asserted only that the client was released).

### F-API-13 — Documentation and configuration drift around the security profile and tunables
- Severity: Low   - Class: VERIFIED   - Reach: DOC   - Effort: S
- Where: `README.md:90-91` ("does not add route-wide authentication") vs `server.py:708-762` + live 401 on `/info`, `/bodies`, `/docs`; `README.md:57-73` ("choose REBOUND or TudatPy in the frontend and click Connect") vs `index.html` (no engine control) and `src/main.ts` (no `simulationClient`); `server.py:3015,3090,3312` (only three call sites of the API-key check).
- Evidence: local profile with `SOLAR_PHYSICS_API_KEYS=localkey`, no key sent → `/solar/physics` 401, `/solar/realtime` 401, **`/solar/capabilities` 200, `/info` `/bodies` `/health` 200, `POST /trajectory/lambert` 200, `POST /benchmark/accuracy/report` reaches the writer (409)**. `grep -rn "x-api-key|authorization" src` → no hits: the shipped frontend cannot talk to a network-profile backend (every fetch 401), and browsers cannot set headers on `new WebSocket()` while query credentials are refused (`server.py:846-859`), so a browser can never authenticate to `/ws/sim`. 56 of the 61 backend env knobs (AST scan of the `_load_*`/`getenv` calls; two further string matches are FITS header keys and were excluded) are documented nowhere outside the code — including the one an operator would reach for first, `SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS` (F-API-01).
- Impact: a user who sets API keys in `local` profile believes the server is protected; one who follows the network-profile paragraph has no client that works; the README's backend step 73 cannot be performed.
- Fix: README: state that keys in `local` profile protect only the three solar routes, that `network` protects every route except `/health/live`, remove or reword `:73`, add an env-var table (generated from the loader calls); consider applying the key check to the report writer and WS in `local` when keys are configured; add an `X-API-Key` option to `solarPhysicsClient.ts`/`solarRealtimeClient.ts` or document that network profile is for non-browser clients only.
- Prior: NEW.

### F-API-14 — Absolute-path disclosure and four different error-body shapes
- Severity: Low   - Class: VERIFIED   - Reach: BACKEND   - Effort: S
- Where: `backend/sim/rebound_nbody.py:150-153,163-170` → `/health` (`initial_conditions.path`); `backend/server.py:3450-3453,3470-3473` (`catalog_path`), `:2783`, `:4204` (absolute paths in 400/409), `backend/benchmark/accuracy.py:666-669` (`reportPath`), `:2689-2695` (`error: str(exc)`), `:4783-4788` (WS `engine_init_failed` sends `str(exc)`), `:4337,4359` (WS `Command handling failed: {exc}`).
- Evidence: `/health` → `"path":"/tmp/claude-0/…/backend/data/ephemerides/jpl_horizons_de441_j2000_barycenters.json"`; `/nearby-systems` → `catalog_path` absolute. Error bodies: 13 `HTTPException` sites use a string `detail` (`server.py:1679,2783,2787,3097,3103,3318,3325,3344,3462,4118,4156,4204,4214`), 23 use an object (`:1696,1843,…,3421`), 65 more go through `_trajectory_http_exception` (`{code,message,retryable,context}`), FastAPI's default 422 is a third list shape, and unhandled errors are plain-text 500 (F-API-09). A client must parse all of them.
- Impact: username/home-dir disclosure to anyone who can reach the port (auth-gated in network profile); clients cannot rely on `detail.code`.
- Fix: return repo-relative or hashed identifiers; migrate the 13 string sites to `{code,message,retryable}` (the `/solar/physics` 400/413/429/401 first, since the frontend client reads them); register the catch-all handler from F-API-09.
- Prior: `SERVER_HARDENING_AUDIT` N-5 (STILL-PRESENT for health/nearby/report; the `aia-tile` exception leak is FIXED — messages are now fixed strings `:3132-3165`).

### F-API-15 — Two security controls depend on uvicorn CLI flags the app cannot enforce
- Severity: Low   - Class: VERIFIED   - Reach: BACKEND / DOC   - Effort: S
- Where: `backend/server.py:1594-1657` (identity from `scope["client"]`), `:4604-4640` (16 KiB cap enforced only after the frame is buffered); `README.md:70`, `scripts/dev-full-config.mjs:92-100`, `server.py:4896-4905` pass `--no-proxy-headers --ws-max-size 16384`.
- Evidence: 60 requests with rotating `X-Forwarded-For`: README flags → **60×429** (XFF ignored); plain `python -m uvicorn server:app --port N` (the command in the lead's briefing) → **60×413, 0×429** (uvicorn rewrites the client from XFF because 127.0.0.1 is trusted by default, so any local process picks its own identity). A 15 MB text frame: without `--ws-max-size` RSS 112 → 127 MB before the app-level 1009 close; with the flag RSS flat and closed at the protocol layer.
- Impact: a user who copies `uvicorn server:app` loses rate limiting against local callers and accepts 16 MiB WS frames; in `local` profile the exposure is local-only, hence Low.
- Fix: the app cannot see uvicorn's wrapper, but it can detect its effect: in `_client_identity` log a one-time warning when an `X-Forwarded-For` header is present, `SOLAR_TRUSTED_PROXY_CIDRS` is empty and `scope["client"][0]` equals the header's first hop (proof that the server rewrote the peer); lead README/docs with `python server.py` (already sets `proxy_headers=False, ws_max_size=…`) or `npm run dev:full` instead of a bare `python -m uvicorn`.
- Prior: `SERVER_HARDENING_AUDIT` N-2 (spoofing FIXED when run with the documented flags; unbounded store FIXED — 200 k distinct identities → 1,024 entries).

### F-API-16 — WebSocket handler lifecycle hygiene: unprotected runner start (latent leak), unretrieved task exceptions on every abrupt disconnect, unbounded epoch for the optional TudatPy engine
- Severity: Low   - Class: VERIFIED (structural leak with a fake socket; not reproducible over real uvicorn), SUSPECTED (TudatPy)   - Reach: BACKEND   - Effort: S
- Where: `backend/server.py:4805-4824` (runner started and `connected` sent *before* the `try:` at `:4826`), `:4839-4847` (`for task in done: … raise exc`), `:4850-4851`; `backend/sim/tudatpy_hooks.py:394-402`.
- Evidence: `leak_probe.py` — fake WebSocket whose first `send_text` raises: `handler exited via WebSocketDisconnect` → `runner threads 2 s after the handler returned: 1`, `running=[True]`, `frames stepped: 121` (≈60 fps forever). Over real transport 160 early-drop attempts (RST/FIN, with and without reading the 101) left 9 threads constant (presumably because nothing yields between `accept()` and the first send on this uvicorn 0.52.4 / websockets 17 stack — my inference, not instrumented). Abrupt disconnects also log `Task exception was never retrieved … _ws_send_loop … WebSocketDisconnect` (40 log entries over ≈170 abrupt drops) because the second finished task is never inspected. `TudatPyEngine` defines no `supported_jd_range`/`cancel_pending_operation`, so the runner's range check (`:4457-4467`) is skipped (not runnable here).
- Impact: any future `await` between accept and first send (e.g. moving init to a thread) turns this into a CPU-burning leak; log noise hides real errors.
- Fix: start the runner inside the `try`, or wrap the `connected` send in `try/finally: runner.stop()`; retrieve every done task's exception (`await asyncio.gather(*done, return_exceptions=True)`); give `TudatPyEngine` the same epoch bound.
- Prior: K-50 third clause (latent, NOT reproduced over the real transport) and K-24 (TudatPy remainder).

### F-API-17 — One two-thread pool shared by plan/lambert/porkchop/mission/benchmark gives cross-endpoint head-of-line blocking
- Severity: Low   - Class: VERIFIED   - Reach: BACKEND   - Effort: S
- Where: `backend/server.py:1276-1281,1413-1416` (`HEAVY_COMPUTE_THREAD_LIMIT` max 2), per-endpoint semaphores `:1391-1395`.
- Evidence (`traj_conc.py`): alone — lambert 0.05 s, porkchop (1,683 points) 1.1 s, plan(3 assists) 1.1 s. Concurrently (2 porkchops + plan, then a lambert 0.3 s later): **lambert 2.6 s (52×)**, plan 3.96 s. Each endpoint's semaphore admits its job, but only two threads exist, so admitted work queues invisibly inside the executor while its HTTP timeout is already running.
- Impact: a 50 ms request can time out behind two multi-second ones; no live client today (`src/frontend/features/trajectory` is UNREACHABLE).
- Fix: one admission semaphore of size 2 in front of the shared executor (or per-endpoint executors) so saturation is reported as `*_saturated` instead of queuing.
- Prior: NEW.

### F-API-18 — `backend/requirements.txt` still lacks `httpx` (needed by every `TestClient` test), keeps `pytest` as a runtime dependency and uses open-ended pins; the real lock lives elsewhere
- Severity: Low   - Class: VERIFIED   - Reach: CI / DOC   - Effort: S
- Where: `backend/requirements.txt:1-10`; `ci/backend-test-requirements.txt:1-20`.
- Evidence: `rebound==5.1.1`, `astropy==8.0.1` pinned; `fastapi>=0.100.0`, `uvicorn[standard]>=0.23.0`, `websockets>=11.0`, `numpy>=1.24.0`, `pillow>=10.0.0`, `pytest>=8.0.0`; no `httpx` and no explicit `pydantic`; 11 test files import `TestClient`, which requires `httpx`. The fully pinned `ci/backend-test-requirements.txt` (fastapi 0.141.1, starlette 1.6.0, httpx 0.28.1…) is what CI runs.
- Impact: `pip install -r backend/requirements.txt && pytest backend/tests` fails on a clean clone; two sources of truth drift.
- Fix: make `backend/requirements.txt` the runtime pins (add `pydantic`), move `pytest`/`httpx` to `backend/requirements-dev.txt` that `-r`s it, and have CI install from that (or generate `ci/backend-test-requirements.txt` from it).
- Prior: K-32 requirements portion (STILL-PRESENT, partially mitigated by the CI lock file).

### F-API-19 — Horizons transport follows redirects to any host (inconsistent with the solar provider's allow-list)
- Severity: Low   - Class: VERIFIED by code reading; no exploit exists (fixed host, TLS verified, 2 MiB cap)   - Reach: BACKEND   - Effort: S
- Where: `backend/mission/ephemeris_service.py:1078,1233` (`urllib.request.urlopen(request, …)` with the default opener) vs `backend/sim/solar_realtime_data.py:98-102,1189-1246` (`_NoRedirectHandler` + per-hop allow-list).
- Evidence: default `HTTPRedirectHandler` follows up to 10 redirects across hosts and to plain `http`. Reachable via `POST /trajectory/lambert {"ephemeris_provider":"horizons"}` (the only Horizons route, `server.py:1168`).
- Impact: only a compromised/misconfigured upstream could steer the server to an internal address; defence in depth.
- Fix: reuse the provider's `_NoRedirectHandler` + `UPSTREAM_REDIRECT_HOSTS` pattern for `ssd.jpl.nasa.gov`.
- Prior: NEW.

## Prior issues in my area

- **K-01** — FIXED-ON-HEAD. `rebound_nbody.py:289-296` guards `ri_ias15` with `getattr` (commit `2226277`, 2026-08-27); live `/ws/sim` on REBOUND 5.1.1 returns `connected` (engine `rebound`, fidelity `high`, 41 bodies, 0.03 s) and `/health` reports `available:true`. Caveat: on 5.x the guard is a silent no-op (`hasattr(Simulation(),"ri_ias15")` is `False`), so the intended `epsilon/min_dt` are never applied (IAS15 reviewer).
- **K-12** — FIXED-ON-HEAD. Aggregate acquisition deadline 3.8 s (`solar_realtime_data.py:226-246`, commit `af027c2`), single-flight with bounded failure map (`:1478-1555`; measured 20 concurrent → 3 upstream attempts), SILSO conditional revalidation every 6 h (`94e681d`), response caps (`:124-145`).
- **K-24** — FIXED-ON-HEAD for REBOUND (commit `90f4134`, 2026-09-24): epoch range 1990–2050 (`rebound_nbody.py:52-53,128-133`), seek cancellable per 10-year segment (`:493-518`), checkpoints capped at 8 (`:48`; 6 retained after 6 seeks), `stop()` signals cancel (`server.py:4249-4255`); measured: runner thread gone 0.9 s after an RST in the middle of 8 queued seeks. Residual for the optional TudatPy engine — SUSPECTED (F-API-16).
- **K-25** — STILL-PRESENT, re-verified live (F-API-04).
- **K-26** — CHANGED/PARTIAL (F-API-05): CORS allow-list (`8f1f051`/`0789e08`), opt-in overwrite (`2b8a2c3`), `O_EXCL` + dangling-symlink guard; unauthenticated overwrite with `allow_overwrite:true` remains.
- **K-32 (requirements portion)** — STILL-PRESENT (F-API-18).
- **K-50** — (a) paused Kuiper resend STILL-PRESENT, phase-dependent, 265 KB payloads (F-API-07); (b) rate divergence STILL-PRESENT only with Kuiper active, 98.4–98.8 % of requested otherwise (F-API-07); (c) runner leak before `connected` — latent, structurally still unprotected, not reproduced over uvicorn 0.52.4 (F-API-16).
- **K-51** — FIXED-ON-HEAD for "cache ignores `jd`" (`solar_realtime_data.py:611-615`, commit `9655458`) and for the unbounded failure map; `force_refresh` amplification CHANGED (rate-limited, 2 concurrent, byte-capped, SILSO cached, GET refresh refused in network profile `server.py:1689-1701`); residual jd-keyspace amplification on the AIA route (F-API-08).
- **K-52 (my parts)** — "POST /trajectory/porkchop CPU unbounded": FIXED (grid ≤2,000 points `:2586-2601`, 7 s cooperative deadline, measured 0.3–1.1 s for 1,683 points); "default `/mission/plan` returns 422": STILL-PRESENT (`POST /mission/plan {}` → 422 `mission_no_feasible_recommendation`).
- **K-11 (cross-check, other reviewer)** — poll interval FIXED (30 s, `solarPhysicsClient.ts:9`), but see F-API-01.
- **`SERVER_HARDENING_AUDIT_2026-08-24`** — §2 F-11: CHANGED (F-API-05). §3 CORS: FIXED (cosmetic: `access-control-allow-credentials: true` is still emitted on a rejected preflight, seen in the 400 response). §4 waiters→500: FIXED (waiters bounded by the remaining provider budget; route maps to 503 `solar_realtime_unavailable` `server.py:3046-3055`); jd-blind cache: FIXED; `force_refresh`: CHANGED; unbounded failure map: FIXED (`singleflight_failure_max_entries`=64, traceback-free descriptors); shared cache dict: FIXED (`copy.deepcopy`, `solar_realtime_data.py:417`). §5 tests: CHANGED (F-API-12). §6: `tof_min_days` has no `gt`: FIXED (`server.py:2835`); `spice` → 500: FIXED (structured 503); unknown query params ignored: STILL-PRESENT (`?julian_date=` silently ignored, Low); zero-confidence blending: not in my area. N-1 (timeout releases semaphore, orphan CPU): FIXED (owned threads + killable processes, verified). N-2: FIXED with caveat F-API-15. N-3 (`live_data` self-defeating budget): CHANGED — `live_data` is now ignored by the worker (`solar_process_worker.py:47-48`, `live_data_enabled:false`). N-4 (NUL → 500): STILL-PRESENT (F-API-05). N-5 (paths): STILL-PRESENT (F-API-14).

## Strengths

- **Outbound hardening is exemplary for a solo project** (`solar_realtime_data.py`): host allow-list + https-only/no-port/no-userinfo URL validation (`:968-1025`), manual redirect loop with per-hop validation (`:1189-1246`), `Content-Length` pre-check and a chunked read that recomputes an absolute deadline per `read1` to defeat byte-dripping (`:1315-1348`), per-source byte caps, bounded LRU caches with deep-copied delivery, single-flight with a bounded failure map. Verified: 20 concurrent callers → 3 upstream attempts; no `verify=False` anywhere.
- **The process supervisor does what it claims** (`process_supervisor.py`): spawn children, SIGTERM→SIGKILL reap, quarantine instead of silently releasing capacity when a child cannot be reaped (`:526-560`), bounded wire format with JSON-tree validation (`:137-167,493-524`), request-binding discriminator so a stale result cannot satisfy another request (`solar_process_worker.py:118-165`). Measured: 0 children after timeout and <250 ms after client disconnect, capacity immediately reusable, lifespan shutdown leaves no orphan; a 100-job soak (75 completed, 25 killed by a 0.8 s deadline, `supervisor_soak.py`) ended with fds 4→5, threads 1→3 (the two executor workers), RSS 38.7→39.1 MB, all internal maps empty, nothing quarantined, and only the `multiprocessing` resource tracker left as a child. Its tests use real child processes (`test_solar_process_supervisor.py`).
- **Network profile is fail-closed and coherent**: startup refuses missing keys / wildcard CORS / malformed CIDRs (`server.py:504-635`), constant-time digest comparison, auth runs before body buffering and rate admission, `private, no-store` + `Vary` on every authenticated response, `scope_route_path` mirrors Starlette's `root_path` handling (`http_ingress.py:23-45`). Live: 401 on every route except `/health/live` including `/docs`/`openapi.json`, WS 403 for missing key / evil origin / key-in-query, 431 on oversize header, 400 on GET bodies.
- **WebSocket protocol validation is tight and tested** (`server.py:4558-4707`): whitelist normalisation drops unknown fields, depth/field/size caps, typed error codes, lease-based admission with per-subject limits (`:1402-1409,1921-1969`). Live: 27 hostile frames, a 6,000-command flood and a 15 MB frame all handled without a crash.
- **Rate-limit store is genuinely bounded** (`:1724-1765`): 200 k distinct identities → 1,024 entries / 1.0 MB; XFF ignored unless the peer is an explicitly trusted proxy (`test_solar_security.py:182-269`).
- **K-24 was fixed properly**, not cosmetically: validated epoch window tied to the Horizons oracle, cancellation at segment boundaries, bounded checkpoints, and `stop()` that waits rather than abandons (`server.py:4852-4857`).
- **Report writer containment** is solid: resolved-path containment check, `.md` only, `O_EXCL` create, dangling-symlink refusal (`accuracy.py:637-664`); traversal/absolute/symlink probes all 400.
- **Cooperative deadlines on thread-based endpoints work**: one request-owned `PlanningContext` carries the deadline, cancel event and hard-capped counters, and every `reserve()` checkpoints (`trajectory/budget.py:136-347`); measured overshoot ≤20 ms; admission permits are released from the future's completion callback, not the timeout (`server.py:2032-2069`) — and the ASGI-level contract tests (`test_trajectory_endpoint_budget.py:464-654`: chunked bodies, empty-chunk floods, `root_path` bypass) go well beyond typical project tests.
- **Self-describing limits**: `/trajectory/capabilities` and `/mission/capabilities` publish every ceiling (`server.py:3519-3579`), and every env knob is clamped to a compile-time safety envelope.
- **`npm run dev:full`** (`scripts/dev-full-config.mjs:80-100`) refuses non-loopback hosts unless the network profile is selected and always passes `--no-proxy-headers --ws-max-size`.

## Scores

| Dimension | Score | Basis |
|---|:--:|---|
| Build/test health | 2 | 8 of 2,142 backend tests fail on a 4-core box (7 in CI); 5 are the endpoint missing its own deadline, 2 are drift on a dead seam, 1 depends on interpreter start-up speed (F-API-03) |
| Type safety | 3 | pervasive annotations and `FiniteFloat`/strict pydantic at the boundary; no mypy/pyright/ruff config anywhere in the repo, so none of it is enforced |
| Architecture / modularity | 2 | 4,905-line `server.py`, 24 module globals, 43 monkeypatched attributes (F-API-11); `sim/process_supervisor.py` and `http_ingress.py` are cleanly separated |
| Correctness of live paths | 2 | the shipped UI's default `/solar/physics` request never succeeds (F-API-01); trajectory/WS/health paths behave correctly under probing |
| Backend robustness / concurrency | 4 | bounded queues/pools/caches, killable workers, cooperative deadlines, 0 leaked children; minus F-API-02/04/06/07 |
| Security / operational exposure | 4 | fail-closed network profile, SSRF-free outbound, bounded limiter; local profile keeps an unauthenticated writer and no Host check (F-API-05, F-API-13) |
| Performance | 2 | cold PFSS per request: 8–41 CPU-s vs an 18 s deadline; 8.3 s → 0.01 s with a warm cache (F-API-01) |
| Test strategy | 3 | excellent ASGI/ingress contract tests; wrong-reason and source-text tests, no end-to-end WS session, CI red (F-API-03/12) |
| Documentation accuracy | 2 | README network paragraph contradicts the code, engine-dropdown step is impossible, 56 env knobs undocumented (F-API-13) |
| Repo hygiene (backend) | 3 | two requirement sources of truth (F-API-18); no logging (F-API-10) |
| Physics fidelity / data provenance | n/a | outside this reviewer's scope |

## Not inspected

- Numerical correctness of the solar model, PFSS/WSA maths, REBOUND/IAS15 accuracy, Kuiper dynamics, Lambert/MGA/mission physics (other reviewers); I only measured cost and transport.
- `solar_realtime_data.py` payload parsing (700-930, 1560-2270) and the SWPC/SILSO numeric validators; real upstream traffic — the sandbox only reaches the network through an agent proxy, so all upstream behaviour was measured with a stubbed `_open_response`, never against NOAA/SIDC/Helioviewer/JPL. Consequently "≈7 upstream calls per miss" is from code, not from a live capture.
- `gong_magnetogram.py` internals (only the transport class and reachability), `pfss_magnetogram.py` beyond the cache, `kuiper.py` beyond step/send.
- The optional TudatPy engine (conda-only, not installable here) — F-API-16's TudatPy clause is SUSPECTED.
- Browser-side behaviour: DNS rebinding against the report endpoint, Chrome Local Network Access, the frontend's fallback when `/solar/physics` fails.
- Tests read only by name: `test_solar_security.py`, `test_server_validation.py`, `test_network_request_shape.py`, `test_trajectory_endpoint_budget.py`, the AIA-tile tests in `test_solar_physics_api.py:420-1015`.
- HTTP/2 or reverse-proxy deployments, TLS termination, IPv6 peers, slowloris/connection-flood behaviour (explicitly delegated to the gateway by `http_ingress.py:1-7`), WS soak beyond 60 s, Windows/macOS `spawn` behaviour.
- Idle-machine timings: all wall-clock numbers were taken at load 1.4–7.0 on a shared 4-vCPU VM; conclusions rest on CPU-seconds, repeated runs and the repo's own CI/full-run results.


---

<!-- ======================= REVIEWER SCI ======================= -->

# SCI — backend scientific core (PFSS/WSA, GONG, solar physics, REBOUND, Kuiper, SRP/tide, Tudat) @ 17d1e63

Reviewer SCI. Everything below was re-derived from the code at `17d1e63` (target tree `$S/main-wt`, read-only) and by executing it. `S=/tmp/claude-0/-home-user-solar-system-realistic-sim/03138f8e-d899-5252-b93f-37b1d0c17ea7/scratchpad`.
All my scripts are in `$S/work/sci/` (named in the evidence lines) so every number can be re-run. Python 3.12.3 `$S/venv312` for my own probes (CI-pinned deps); the repo's R3/R4 verifier was run under the exact CI interpreter 3.12.13 + `ci/r3-r4-requirements.txt` in `$S/work/sci/venv31213`, against an isolated clone (`$S/work/sci/clone`, detached at 17d1e63) so `main-wt` stayed untouched.

## Scope & coverage

| File (scope) | LOC | Read |
|---|---:|---|
| backend/sim/pfss_magnetogram.py | 1,929 | fully |
| backend/sim/spherical_harmonics.py, magnetogram_grid.py, pfss_tracing.py (PFSS core, not in the list but the manifest's production files) | 93 / 93 / 254 | fully |
| backend/sim/solar_time.py, solar_process_worker.py | 145 / 165 | fully |
| backend/sim/gong_magnetogram.py | 1,602 | fully (transport/TLS only skimmed) |
| backend/sim/solar_physics.py | 1,096 | fully |
| backend/sim/solar_realtime_data.py | 2,638 | partially: 1-760 and 1621-2638 (science/parsing/time semantics); 760-1620 (HTTP transport, single-flight, response validators) not read — other reviewer |
| backend/sim/rebound_nbody.py, kuiper.py | 607 / 470 | fully |
| backend/sim/radiation_pressure.py, galactic_tide.py, tudatpy_hooks.py | 209 / 165 / 623 | fully |
| backend/data/initial_conditions.py, nearby_systems.py | 477 / 184 | fully |
| backend/data/bodies.py | 684 | partially (1-140, 560-684, plus executed catalogue statistics) |
| backend/data/ephemerides/jpl_horizons_de441_j2000_barycenters.json | 7.1 kB | structure, GM values and hash check executed; not re-fetched (Horizons blocked by proxy) |
| docs/adr/0001-0005 | 62/72/74/71/104 | fully |
| agent-notes/R3R4_PFSS_IMPLEMENTATION_PROMPT_2026-09-25.md | 1,267 | lines 1-260 + targeted greps |
| ci/r3-r4-science-verification.json, scripts/ci/mutations/*.patch (6), scripts/ci/verify_r3_r4.py, scripts/ci/README.md, .github/workflows/r3-r4-science.yml | 177 / 6 patches / 717 / 80 / 112 | fully |
| tests read: test_carrington_semantics (325), test_nbody_horizons_accuracy (171), test_solar_physics_determinism (150), parts of test_pfss_*, test_wsa_semantics, test_gong_wcs, test_seek_optimizations | | read; remaining PFSS/GONG/kuiper/nbody tests only executed |

**What I ran (all offline, `nice -n 10`, targeted files only):**

| Command / script | Outcome |
|---|---|
| `work/sci/pfss_a_legendre.py` | Schmidt basis vs `scipy.special.lpmv`: max rel. err 6.2e-13 (l≤15), 3.3e-12 (l≤64); surface norm 4π/(2l+1) to 2.7e-14; derivative vs FD 5e-10 |
| `pfss_b_weights_roundtrip.py` | Σ area weights·2π = 4π exactly (both geometries); random band-limited l≤15 round trip 1.7e-14; axial dipole on equal-area grid → g10 = 1.0000000000 |
| `pfss_c_dipole.py` | axial dipole vs closed form 3.3e-16; Bθ,Bφ at Rss = 0 (2e-17) for Rss 2–5; Br(1) reproduces input exactly; ∇·B 5e-8, ∇×B 7e-9 (FD noise floor) |
| `pfss_d_tracer.py`, `pfss_d2_tracer_general.py` | 87/87 dipole lines classified as the analytic flux-function predicts, incl. 0.003° from the separatrix; 60/60 lines in a realistic lmax-12 field match a DOP853 reference |
| `verify_r3_r4.py … all` in the 3.12.13 clone | **exit 2**: baseline 6/6 green, mutant 1 killed, mutant 2 `patch-not-applied` (F-SCI-02) |
| `mutdriver.sh` ×6 + fixed patch | 5/6 shipped patches applied and killed by the mapped node; the 6th (re-generated by me with 3 context lines) is also killed |
| `mutants.py` (43 own one-line mutants, each run against 997 PFSS/WSA/Carrington tests) | 34 killed, 9 survived (2 equivalent/irrelevant, 7 effective) — F-SCI-06 |
| `carrington_oracle.py` / `carrington_meeus.py` / `gong_crnow_check.py` (own venv, sunpy 7.1.2 + a from-scratch Meeus implementation) | repo literals = sunpy to 1e-11 rot / 3e-9°; Meeus L0 agrees with sunpy to ≤0.08°; mean model off by up to 0.007 rot (2.5°) |
| `nbody_acc.py`, `kuiper_cost.py`, `kuiper_rate.py`, `srp_tide_checks.py`, `solar_cost*.py`, `e2e_solar_http.py`, `trace_batch_vs_scalar.py`, `fix_proof_batch_lines.py` | numbers quoted in the findings |
| pytest: 997 PFSS/WSA/Carrington; 112 solar-model/nbody/kuiper/gong-fits/wcs/seek; 254 pfss_cache + gong_archive; 21 verifier meta-tests | all green. Separately, the two `wall_jd` tests in `test_solar_physics_api.py` reproduce their CI failures (F-SCI-14) |

## Findings

### F-SCI-01 — Root cause of the `/solar/physics` deadline overrun: the 80–180 display lines are traced one at a time through the pure-Python scalar field evaluator (28 s CPU for 120 lines; a single batched call gives identical results in 3.9 s)
- Severity: High   - Class: VERIFIED   - Reach: LIVE (shipped UI polls `fidelity:'high'`, `forcing:'hybrid'` every 30 s)   - Effort: S (batch the lines) + S/M (rest)
- Where: `backend/sim/pfss_magnetogram.py:417-470` (loop, scalar call at :446); `backend/sim/pfss_tracing.py:239-254` (`trace_field` = batch of one + `field.evaluate_cartesian` per point); `backend/sim/solar_process_worker.py:94` (new model + `PFSSCache` per job); `backend/server.py:912-924` (18 s default, 19 s hard max); `src/sunController.ts:171-177`
- Evidence:
  ```
  e2e_solar_http.py (TestClient, real spawn workers, loadavg 2.4)
  GET /solar/physics fidelity=preview      -> HTTP 200 in 10.0s
  GET /solar/physics fidelity=operational  -> HTTP 503 in 18.0s solar_compute_timeout   (server default)
  GET /solar/physics fidelity=high         -> HTTP 503 in 18.0s solar_compute_timeout   (what the UI sends)
  solar_cost2.py, lmax=15, 120 lines:  trace_field_lines 25.9 s CPU | compute_wsa_velocity_map(36x72) 10.7 s | decompose 0.01 s
  trace_batch_vs_scalar.py:  scalar-per-line 28.4 s CPU   vs   one trace_field_batch(120, record_arcs=True) 3.8 s
                             states agree 120/120, max endpoint diff 2.6e-15 R_sun, step counts equal 120/120
  fix_proof_batch_lines.py (monkeypatched trace_field_lines):  operational 18.1 -> 9.2 s,  high 32.0 -> 13.7 s CPU
  ```
- Impact: the same symptom is reported as F-SOL-02 (UI never gets the physics state) and as five CI failures (F-REPO-11); this finding is the cause and the cheap fix. The batch engine is already what the scalar path wraps (`trace_field` builds a one-lane `trace_field_batch`), but evaluating one lane at a time forfeits all vectorisation: 0.24 s/line vs 0.03 s/line. Secondary: every request runs in a fresh `spawn` child (`process_supervisor.py:1-8`) with a fresh model, and the synthetic cache key contains the exact `jd` and `activity` floats, so `PFSSCache` (LRU-3, single-flight, ≈1,200 lines of tests) can never hit in production. `SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS` is capped at 19 s, so no configuration fixes `high`.
- Fix: in `trace_field_lines` build all seed vectors, call `trace_field_batch(field, starts, max_steps=…, step_size=…, record_arcs=True)` once and assemble the line dicts from `BatchTraceResult` (states/reasons/steps/endpoints/endpoint_fields/residuals/polarities/arcs are all there; the arcs just need the `np.round(…,4)`). Then, if `high` is still >10 s on the CI runner, reduce the WSA grid for `high`/`ultra` (36×72 = 2,592 lanes = 10.7 s; 24×48 ≈ 4.5 s) and add a CPU-time budget test (`high` ≤ 12 s) next to `test_solar_physics_determinism.py`.
- Prior: NEW (symptom: baseline §2, F-SOL-02, F-REPO-11; K-11 related)
- Adversarial check: tried (a) "machine too slow": measured process CPU time under `nice`, at loadavg 2.4–4.3, and the CI runner shows the identical five 503s; (b) "front-end doesn't ask for high": `src/sunController.ts:174`; (c) "a cache absorbs it": no HTTP-level cache, worker is single-use (`process_supervisor.py:1-8`), epochs never repeat (F-SOL-02); (d) "raise the timeout": hard-capped at 19 s (`server.py:912`). Survives; severity kept High because the default UI path cannot be satisfied on CI-class hardware.

### F-SCI-02 — The R3/R4 mutation lane cannot go green: `uniform-theta-area-weights.patch` has no trailing context and does not apply (independent re-discovery of F-REPO-01, with root cause and a corrected patch)
- Severity: High   - Class: VERIFIED   - Reach: CI   - Effort: S
- Where: `scripts/ci/mutations/uniform-theta-area-weights.patch:4` (`@@ -64,4 +64,5 @@`); `ci/r3-r4-science-verification.json:116-127` (`patch_sha256 d50024f0…`); `scripts/ci/verify_r3_r4.py:565-567`
- Evidence:
  ```
  $ …/venv31213/bin/python scripts/ci/verify_r3_r4.py --repo . --manifest ci/r3-r4-science-verification.json --artifacts <new> all
  R3/R4 verification failed: mutation uniform-theta-area-weights patch-not-applied: error: patch failed: backend/sim/magnetogram_grid.py:64   (exit 2; artifacts: baseline.xml, mutant-old-legendre-recurrence.xml)
  $ git apply --check <each patch>  -> 5 apply; uniform-theta-area-weights: "patch does not apply"   (git 2.43.0)
  ```
  The hunk has three leading context lines and **zero** trailing context; `git apply` then anchors the hunk to end-of-file, but `area_weights` is followed by `validate_map`. A re-generated `git diff` hunk (3 leading + 3 trailing lines, `$S/work/sci/uniform-theta-area-weights.fixed.patch`, sha256 `a7e3fa913f4fc802c56254511903a7db6771a74bf4372e18981779e4f747f312`) applies and **is killed by the mapped node** with the `R4-THETA-AREA-WEIGHTS` tag. So the defect is purely the patch file; the lane's design is sound.
- Impact: the headline blocking science gate is red by construction on HEAD, independent of the vitest failure that currently stops CI first. The 21 runner meta-tests (green) use a toy fixture and never apply the real manifest's patches.
- Fix: replace the patch by the 3-context version and set `patch_sha256` accordingly; add a 1-s test in `scripts/ci/tests/` asserting `sha256(patch)==patch_sha256` and `git apply --check` for every manifest mutation (as F-REPO-01 proposes).
- Prior: NEW (same defect as F-REPO-01)
- Adversarial check: reproduced in a pristine clone with the exact CI interpreter and pins; patch hunk read byte-by-byte (`cat -A`); the corrected hunk applies, so it is not my environment or the verifier being too strict. Survives (High, not Critical: the product is unaffected and the verifier fails closed as designed).

### F-SCI-03 — 13 catalogue bodies are placed by a 26-year two-body back-propagation: at their own element epoch the engine is off by a median 1.2×10⁷ km and up to 4.8×10⁷ km (5.6°), while the payload says `fidelity: "high"`
- Severity: Medium   - Class: VERIFIED   - Reach: BACKEND (WS `/ws/sim`; its only client `simulationClient.ts` is unreachable from `main.ts`)   - Effort: S/M
- Where: `backend/sim/rebound_nbody.py:326-353` (mean-anomaly shift by `360·Δt/period_days`, then N-body from J2000); `:104-107` (`fidelity_level` is engine-wide)
- Evidence (`nbody_acc.py` + the inline probe): bodies with `orbit.epoch_jd = 2461000.5`: initialise the engine *at that epoch* and compare each body with the catalogue's own osculating Kepler state at that same epoch (same GM):
  ```
  camilla     r=3.29 AU  offset 48,290,620 km (20,234 arcsec)     euphrosyne 47,534,601 km (17,375″)
  sylvia      r=3.54 AU  offset 24,847,265 km ( 9,669″)          varuna 15,133,821 km (472″)   ms4 12,082,988 km   ixion 11,980,877 km
  median over the 13 bodies: 1.19e7 km ; the catalogue periods are Kepler-consistent with `a` (dP/P < 5e-16), so the error is not a bad period
  ```
  Cause: osculating elements are only valid near their epoch; the main-belt/Plutino bodies' `a` oscillates under Jupiter/Neptune, and the 2-body mean-motion back-propagation to J2000 followed by an N-body forward integration therefore accumulates a phase error (my attribution; the offsets scale with orbital phase drift, largest for the 6–7 yr outer-belt orbits). The planets, in contrast, are exact: see Strengths.
- Impact: `force_models.initial_conditions.approximate_element_body_ids` does list the 31 element-fallback bodies and says they are massless, but `fidelity: "high"` and the Horizons-gated accuracy claim sit on the whole payload; nothing says "up to 5.6° wrong". Only Horizons-validated bodies are tested (`test_nbody_horizons_accuracy.py`).
- Fix: in `initialize()` build the engine at the first element epoch instead of J2000: integrate the 10 Horizons bodies to `orbit.epoch_jd` (cheap, IAS15), add the massless element particles there with `primary=Sun`, then integrate to the requested start (or back to J2000 — IAS15 is time-reversible). Re-run the probe; offsets at the epoch should fall to ~1e-6 AU. Add the per-body "state quality" (`horizons_cartesian` | `osculating_epoch_only`) to `bodies[...]` or `force_models`.
- Prior: NEW
- Adversarial check: the comparison is like-for-like (same Sun GM, Sun-primary elements, heliocentric positions); initialising at the epoch removes any extrapolation; Kepler periods consistent. Class not raised to High because the engine has no live front-end consumer and the approximation is disclosed in `force_models` (just not in `fidelity`).

### F-SCI-04 — The synthetic magnetogram is white noise in time, ignores Hale's law, and is unrelated to the corona's active regions
- Severity: Medium   - Class: VERIFIED (numbers) / code-read (Hale)   - Reach: LIVE   - Effort: S/M
- Where: `backend/sim/pfss_magnetogram.py:123` (`rng = np.random.RandomState(int(jd * 100) % 99991)`), `:135-155` (bipole construction); `backend/sim/solar_physics.py:748` (`Random(int(jd * 100) % 99991)` for equatorial coronal holes) vs `:227-263` (the persistent `ActiveRegionSeed`s used for `corona.features`) and `:1027-1033` (only `jd` and `activity` are passed to the PFSS cache)
- Evidence:
  ```
  synthetic_magnetogram(0.6, jd0+dj): dJD=0.0099 d -> RMS(diff)/RMS(map)=0.000 (same seed)
                                      dJD=0.1 d    -> 1.289   dJD=1 d -> 1.308   dJD=27 d -> 1.216   (map max 56 G, max|diff| 62 G)
  ```
  The active regions (positions, polarity, strength) are re-drawn completely every 0.01 d (14.4 min); in each bipole the positive spot is always at `lon0` and the negative at `lon0+separation` in both hemispheres, so the leading polarity is the same north and south (Hale's law requires opposite), whereas `solar_physics.py:245-246` implements Hale for the coronal loops. The PFSS lines, open/closed topology and WSA speeds therefore bear no relation to the loops drawn for the same epoch.
- Impact: any animation of sim time shows PFSS topology and wind-speed arms teleporting between requests (30 s apart in the UI, so most polls land in a new 0.01-d bucket); "corona features" and "pfss_field_lines" in one payload describe two unrelated Suns. All of it is labelled `synthetic`, so this is fidelity/coherence, not mislabelling.
- Fix: drive `synthetic_magnetogram` from the persistent region list (same `ActiveRegionSeed`s, rotated by `_differential_rotation_rad_day`, with a lifetime envelope and Hale polarity from `hale_cycle25_leading_polarity`); keep the dipole/quadrupole terms. Add a test `RMS(diff)/RMS(map) < 0.2` for `dJD=0.5 d`. Same fix for `_synthetic_coronal_holes`.
- Prior: NEW
- Adversarial check: seeds checked by arithmetic (52199 vs 52209 for +0.1 d); the maps compared are the production function on the production grid.

### F-SCI-05 — Kuiper sub-simulation: 47 ms/frame at the default 4 d/s (budget 16.7 ms), 1.8 s/frame at 365 d/s; the main sim's clock silently slows (K-50 still present)
- Severity: Medium   - Class: VERIFIED   - Reach: BACKEND (no live UI consumer: `simulationClient.ts` is unreachable)   - Effort: S/M
- Where: `backend/sim/kuiper.py:434-445` (`step`, `should_send` keyed to `_frame_counter` which only moves in `step`), `:62-` (3,000 test particles + 20 % companions); `backend/server.py:4353-4357` (`dt_days = time_scale*frame_time`, then `engine.step` and `kuiper.step` serially in the same thread, no catch-up cap)
- Evidence (`kuiper_rate.py`, quiet machine, loadavg 1.0; N = 3,628 particles, WHFast dt = 0.0005 yr):
  ```
  time_scale   4 d/s @60 fps: Kuiper.step(0.067 d) =   47.0 ms/frame -> delivered 1.42 d/s of 4.0
  time_scale  30 d/s          Kuiper.step(0.500 d) =  154.0 ms/frame -> delivered 3.25 d/s of 30
  time_scale 365 d/s          Kuiper.step(6.088 d) = 1802.4 ms/frame -> delivered 3.38 d/s of 365.25
  get_state(): 33 ms, JSON 259.7 KiB (3,624 particles); activate(): 0.22 s
  ```
  The REBOUND main engine costs 0.27 ms/frame at 4 d/s, so activating Kuiper slows the *whole* runner by 2.8× at defaults. By code reading (not executed end to end): when paused with `_frame_counter % 5 == 0`, `should_send()` stays true and a 260 KiB payload is attached to every 60 Hz frame (≈15 MB/s per client).
- Impact: Kuiper mode makes the simulation clock disagree with the declared `time_scale` and burns a core. The companion "binary" particles are massless (`kuiper.py:77-80`), so the 102 pairs per 600 particles are not bound: `kuiper_binary_drift.py` shows median separation ×1.4 after 91 d, ×4.3 after 1 yr, ×12.6 after 3 yr (60 % of pairs >10× the initial separation) — acceptable for a visual, but the `binary_pairs` metadata describes pairs that dissolve.
- Fix: in `KuiperBeltEngine.step` integrate in multiples of the fixed `dt` with `sim.exact_finish_time = 0` and cap sub-steps per frame (e.g. ≤4 steps), run it on its own thread/rate, send only when `_frame_counter` advanced since the last send, and reduce N for default (1,000).
- Prior: K-50 (STILL-PRESENT)

### F-SCI-06 — The PFSS/WSA tests are blind to 7 of 41 non-equivalent single-line mutants (integrator order, weak-field floor, WSA exponent, upper clamp, batch monopole)
- Severity: Medium   - Class: VERIFIED   - Reach: CI   - Effort: S
- Where: `backend/tests/test_pfss_tracing.py`, `backend/tests/test_wsa_semantics.py:91-93`, `backend/tests/test_pfss_analytic_fields.py`; mutated sites `pfss_tracing.py:16,196,208,210`, `pfss_magnetogram.py:375,557-559`
- Evidence: `mutants.py` (each mutant × all 997 tests of the five PFSS/WSA/Carrington files; clean-clone copy, baseline 997/997):
  ```
  KILLED 34: Legendre ×4, decomposition ×5, PFSS field radial/tangential/Bphi/Cartesian ×9, tracer ×4 (polarity, inner radius, residual radius; Euler only incidentally), WSA ×9 (fs exponent/ratio, 0.4→0.5, 267.5→285, width, lookup, θb min/wrap/floor), Carrington ×3
  SURVIVED: T1 RK4 4th stage at h/2 | T5 RK4 weights (k1+k2+k3+k4)/4 | T7 stalled threshold 1e-14→1e-3 | T2 weak-field floor 1e-12→1e-3 G
            W6 WSA boundary exponent 3→2 | W8 upper clamp 850→750 | F7 monopole (l=0) included in the *batch* evaluator
            (equivalent/irrelevant: D5 redundant rank check, F6 origin cutoff outside the shell)
  T4 "Euler instead of RK4" is killed only incidentally (test_invalid_stage_positions…[1e+308-nonfinite_result])
  ```
  Effect size of the surviving integrator mutants (`tracer_order.py`, pure dipole, default step 0.02, endpoint colatitude error vs the analytic flux function sin²θ(r²+2Rss³/r)=const): pristine median 9.5e-6 rad; T1 6.8e-4 (70×); T5 1.6e-5; Euler 4.1e-3 (430×, max 1.6°). `test_versioned_formula_pairs` pins (fs,θb) = (1,0),(32,0),(1,0.045): at θb=0 or θb=0.045 the exponent is irrelevant (`(θ/0.045)^p = 0 or 1`), so `^3` is untested. `v ≤ 267.5+410 = 677.5` always, so the `850` clamp is never active and untested.
- Impact: a degraded tracer or a changed WSA relation would pass the headline R3/R4 gates; the six-patch lane (one mapped node each) detects only the historical defects. The R3R4 prompt lists the "tracer-convergence corpus" as open work, so this is a known gap, now quantified.
- Fix (all offline, <1 s each): (1) analytic-dipole line test: footpoints at 10° steps, assert endpoint colatitude within 2e-3 rad at `step_size=0.02` and an error ratio ≥ 5 when the step is halved (measured 47× for a 4× smaller step); (2) add `(1, 0.02)` and `(4, 0.09)` pairs to `test_versioned_formula_pairs` and `assert max(v) <= 677.5+1e-9`; (3) a `B=1e-6 G` radial field must trace to `open`, not `weak_field`; (4) evaluate a field with `g[0,0]≠0` through `evaluate_cartesian_batch` and compare to the l≥1 sum. Also tighten `verify_r3_r4.py:607` per F-REPO-14.
- Prior: NEW (the open "tracer convergence" item is in R3R4 prompt §1.1)
- Adversarial check: each mutant applied to a fresh copy of the clone; baseline re-run green first (an earlier run was contaminated by a killed harness — discarded). Equivalent mutants excluded.

### F-SCI-07 — GONG provider: everything "validated" is self-referential; no real pixel/header has ever been parsed, and two ADR-quoted headers disagree with an independent central-meridian by +0.48°/−0.62°
- Severity: Medium   - Class: SUSPECTED (needs one real `mrzqs*.fits.gz`; gong.nso.edu is 403 through the proxy)   - Reach: DATA/BACKEND (runtime-disabled)   - Effort: M
- Where: `backend/sim/gong_magnetogram.py:478-537` (header contract), `:688-711` (`_balance_flux`: `limit = max(1e-12·unsigned, 1e-12·4π)`), `:822-862` (constants stamped on every snapshot: `zero_point_status`, `polar_fill_status`, `radial_assumption`, `quality_flags`); `backend/sim/solar_realtime_data.py:309-318` and `solar_process_worker.py:49-56` (`runtime_eligible: False` hard-coded); `backend/tests/fixtures/gong/synthetic-v1/manifest.json` ("contains no GONG science pixels")
- Evidence: validated = key-to-key consistency of the header (CREDGE/CR60/CRNOW/MAPL0/LONG0), astropy CEA WCS vs hand formula, BSCALE/BZERO/BLANK applied once, Gauss conversion, resource bounds, immutability — all on a header the repo's own generator wrote. Merely asserted = outward-positive polarity (never checked, no real data), "zero-point corrected / polar filled / approximately radial" (product-name inference stamped as constants, not read from the file), column order (CDELT1 = +1 ⇒ longitude increases to the right), and that the filename minute is the instant `CRNOW` refers to. `gong_crnow_check.py` on the two headers quoted in ADR 0005:
  ```
  mrzqs210317t2114c2242_301: sunpy L0 at filename minute 0.7105 | L0 from header CRNOW 1.1855 | diff +0.475 deg (= +0.86 h of rotation)
  mrzqs210317t2214c2242_300: sunpy L0 at filename minute 0.1613 | L0 from header CRNOW 359.5453 | diff -0.616 deg (= -1.12 h)
  L0(hdr) change over the 1.000 h filename gap = -1.640 deg ; expected -0.550 deg
  ```
  Also `_balance_flux` rejects any map with |net flux| > 1e-12 of unsigned flux. Whether real zqs maps satisfy that is unknown (the plan says "a later independent real-map corpus must establish any less restrictive … policy"); if they carry a percent-level monopole every real map will be rejected `flux_unbalanced`.
- Impact: none today (observed forcing is fail-closed: `data_driven` → 503, `hybrid` → synthetic with `fallback_reason: disabled_unvalidated`), but the hard-coded `runtime_eligible: False` is a constant, not a computed promotion state, and the 1,602-line provider cannot be promoted without a real-data oracle. The `current_central_meridian_deg` metadata may describe a different instant than `reference_utc`.
- Fix: commit one real `mrzqs*.fits.gz` (or a header-only excerpt + hash if redistribution is the blocker), parse it in a test, compare Br/L0 with sunpy/`sunkit-magex` (oracle-only deps), then decide the monopole policy and the meaning of CRNOW; make the three `runtime_eligible` sites read one `GONG_RUNTIME_ELIGIBLE` constant.
- Prior: NEW (the plan `docs/superpowers/plans/2026-09-26-gong-provider-provenance.md` lists the real-corpus work as open)
- Adversarial check: the L0 differences are computed only from numbers printed in ADR 0005 and sunpy 7.1.2 (which reproduces the repo's other literals to 1e-11); they could be explained by file naming conventions I cannot see — hence SUSPECTED, not VERIFIED.

### F-SCI-08 — UNREACHABLE `radiation_pressure.py` and `galactic_tide.py` contain formula errors and docstring numbers that are wrong by up to 75×
- Severity: Medium (capped; UNREACHABLE: grep finds no importer anywhere except `galactic_tide`→`radiation_pressure`; 0 % coverage per CODEBASE_AUDIT_2026-09-07; `Development_History_Context.md:701` lists the wiring as OPEN)   - Class: VERIFIED   - Reach: UNREACHABLE   - Effort: S
- Where: `backend/sim/radiation_pressure.py:30-49` (docstring), `:102-142` (PR drag), `:145-175` (Yarkovsky); `backend/sim/galactic_tide.py:17-21` (docstring), `:36-63` (tensor), `:97-107`; `README.md:195-196,404`
- Evidence (`srp_tide_checks.py`):
  ```
  compute_beta(1 m2, 1000 kg) = 7.654e-7 (independent 7.656e-7); docstring/line 36 says "beta ≈ 5.7e-5" (75x too big); Development_History says 6.09e-8
  PR drag, Burns et al. 1979 eq.5 velocity part = -(beta GM/(r^2 c)) (rdot r_hat + v); code returns factor*(vr r_hat - v)  (radial term dropped)
    circular: identical;  radial outward: code [0,0,0] vs [-7.9e-9,0,0];  integrated, beta=0.01, a=1 AU, e=0.4 over 8 orbits:
    code da/dt -1.753e-5 AU/yr, de/dt -4.09e-6 /yr   |  Burns (numerical) -2.012e-5, -6.82e-6   |  Burns analytic eq.19-20 -2.011e-5, -6.81e-6  (-13 %, -40 %)
  galactic tide: code a_x = a_y = -Omega0^2 x = -7.06e-31 x ; Heisler & Tremaine (Hill) a_x = +4A(A-B) x = +1.75e-30 x, a_y(static)=0;
                 vertical nu^2: code 4.97e-30, H&T 4piGrho - 2(A^2-B^2) = 5.48e-30
                 docstring "tide ~3e-13 at 5e4 AU, dominant at 1e5 AU" ; actual 4.2e-14 (1.8 % of solar gravity) at 5e4 AU, 8.5e-14 (14 %) at 1e5 AU, crossover 1.9e5 AU
  Yarkovsky: scaling 1/(D rho sqrt(a)) matches Bottke 2006; amplitude 2.5e-4 AU/Myr (1 km) is ~4x below Bennu-scaled 9e-4 AU/Myr.
  ```
- Impact: nothing runs these today; README:404 ("some modules (radiation pressure, galactic tides) require backend REBOUND integration for simulation effects") suggests they are an optional part of the engine when they are never attached. If wired as written, PR decay of eccentric dust would be 13–40 % off and the planar tide would have the wrong sign.
- Fix: add `-2*vr` radial term (`factor * (-(vr*rx) - vx_ms)`), use `a_x = +4A(A−B)x, a_y = 0` or the inertial-frame tensor, correct the docstring numbers (β = 7.7e-7; tide crossover 1.9e5 AU), and add the three numeric checks above as unit tests; or delete the modules from the layout list in README until wired.
- Prior: NEW

### F-SCI-09 — TudatPy engine: J2/J4 flags cannot have any effect (each 30-day chunk is re-seeded from SPICE), the state omits `jd_time_scale`, and the module docstring contradicts the code's units
- Severity: Medium   - Class: VERIFIED by code reading (tudatpy is conda-only; not executable here)   - Reach: BACKEND (optional engine, 31 % coverage, never installed in CI)   - Effort: S
- Where: `backend/sim/tudatpy_hooks.py:541-557` (`_propagate_chunk` → `get_initial_state_of_bodies(..., initial_time=start_s)`), `:302-309` (`step` re-propagates when the epoch leaves the chunk), `:311-333,373-389` (state payload has no `jd_time_scale`), `:26-29` ("velocities in AU/year") vs `:52` (`AU/day`); `backend/server.py:4449-4454` (`if jd_time_scale and …` guard)
- Evidence: every chunk (30 days, RK4 5 min) starts from the SPICE ephemeris state of all bodies; the J2/J4 accelerations act only inside that 30-day arc, so over the 1990–2050 range they can never accumulate into the "inner-planet precession" the docstring cites (`:21-24`). `get_state()` returns neither `jd_time_scale` nor a TDB statement, so `server.py:4449` silently skips its TDB check and the `connected` frame reports `jd_time_scale: null` for this engine.
- Impact: `fidelity: "normal"` + `force_models.j2: true` overstate what the engine computes (it is effectively SPICE interpolation with a decorative perturbation set); the TDB contract guard does not apply to it. The fallback to REBOUND is honestly disclosed (`engine`, `engine_requested`, `warnings`).
- Fix: emit `jd_time_scale: "TDB"` in both `get_state` branches; either propagate continuously (re-seed only on `set_julian_date` jumps) or drop the J2 claim from `force_models`; fix the docstring.
- Prior: K-51 (CHANGED: units/frame now declared, time scale still missing for this engine)

### F-SCI-10 — API labels outrun the models: `quasi_mhd_corona_v4`, the solar `fidelity` ladder, an unqualified synthetic `carrington_rotation`, and `combined_activity_proxy`
- Severity: Low   - Class: VERIFIED   - Reach: LIVE   - Effort: S
- Where: `backend/sim/solar_physics.py:221` (`model_name`), `:208-213`, `:1012-1023`; `backend/sim/pfss_magnetogram.py:1401-1404` (`carrington_rotation`); `backend/sim/solar_realtime_data.py:2562-2636,1844-1849`
- Evidence: the class docstring itself says "not a full resistive-MHD solver" and `capabilities()['notes']` say "not a full MHD PDE solve", yet the model id is `quasi_mhd_corona_v4`; emergence/eruption are sums of three sinusoids with index-derived phases (`:433-441`), and the feature count is modulated by `sin(2π(jd−J2000)/0.18 d)` (`:974-976`). The `fidelity` names change only sampling (arc points 12/20/30/42, PFSS lines 40/80/120/180, lmax 9/12/15/15); `high` and `ultra` share lmax and the WSA grid. For synthetic maps `carrington_rotation` is the mean-synodic hint (error up to 0.007 rot = 2.5° over 2000–2048, `carrington_meeus.py`) with no model tag, while observed maps get the authoritative CRNOW value. `combined_activity_proxy` is now just `swpc.activity_proxy` (SILSO is `realtime_eligible:false`, AIA proxy `None`) = 0.45·clip((v−280)/620) + 0.2·clip(Bt/18) + 0.35·clip(−Bz/12), an uncited near-Earth coupling index, not a solar-activity index.
- Impact: low (disclaimers exist in `notes`), but a consumer reading `model`/`fidelity` is told more than the code does. Honest parts to keep: `pfss_field_lines.source = "synthetic"`, `wsa_inspired_v1` + `calibration_status: "unvalidated"`, `wind_speed_source` per arm, `force_models.model_scope` for REBOUND.
- Fix: rename to `parametric_corona_v4` (keep an alias for one release), add `carrington_rotation_model: "mean_synodic_search_hint_v1"` next to synthetic `carrington_rotation`, rename the proxy `swpc_coupling_proxy` and document its weights.
- Prior: NEW (CODEBASE_AUDIT_2026-09-07 §score table flags the same "MHD" label)

### F-SCI-11 — The WSA-inspired relation has no citation, deviates from the form its coefficients come from, can never exceed 677.5 km/s, and its boundary term is below the default grid resolution
- Severity: Low   - Class: VERIFIED (arithmetic) / from-memory (published form, not verifiable offline)   - Reach: LIVE   - Effort: S
- Where: `backend/sim/pfss_magnetogram.py:535-559`; `docs/adr/0004-wsa-inspired-semantics.md:26-34`; `PFSSSolutionConfig.wsa_n_lat/n_lon = 36/72`
- Evidence: `V = 267.5 + 410/max(1,fs)^0.4 · (1 − 0.8 exp(−(θb/0.045)^3))` ⇒ V ∈ (267.5, 677.5]; `_clamp(v, 265, 850)` can never act and the ADR's "bounded to [265, 850]" is vacuous. The coefficients 267.5/410/0.4/0.8 match the commonly quoted Arge et al. (2003) WSA speed law, whose boundary term (from memory, not checked offline) is `[1 − 0.8 exp(−(θb/w)^1.25)]^3` with w ≈ 2.8° — the repo has a different exponent, no outer cube and w = 2.58°; the ADR cites nothing. At 5° grid spacing the boundary term (scale 2.6°) is resolved by 1–2 cells; the empirical fallback in the Parker spiral uses 720±60 km/s, outside the WSA-inspired range, so mixed arms (`mixed_wsa_inspired_v1_empirical_ch_bimodal`) are inconsistent. fs is the standard `(R☉/Rss)² |Br(R☉)|/|Br(Rss)|` and the open fraction of a pure dipole at Rss=2.5 is analytically 35.3 %, matching the numeric WSA grid (valid_fraction 0.33–0.36).
- Impact: the labelling ("inspired", "unvalidated") is honest; the missing citation and vacuous bound are documentation gaps.
- Fix: add the reference and the deviation to ADR 0004; replace the `850` bound by the analytic `677.5`; pin one mid-θb point (see F-SCI-06).
- Prior: NEW

### F-SCI-12 — `solar_physics.py` numerics: the "analytic peak" of the normalised Hathaway cycle is wrong (flat top for 15 months), and `_clamp` swallows NaN (latent)
- Severity: Low   - Class: VERIFIED   - Reach: LIVE   - Effort: S
- Where: `backend/sim/solar_physics.py:137-143` (`t_peak = b·√1.5`, valid only for c = 0); `:36-37` (`_clamp`)
- Evidence: `f(x)=x³/(e^{x²}−c)`, c = 0.71: true maximum at 1.081·b = 58.4 months (value 0.5038), code normalises by the value at 1.225·b = 66.1 months (0.4871); `_clamp(…,0,1)` then saturates for t ∈ [51.0, 66.1] months (1.26 yr). The `differential_rotation_model` coefficients (14.713 − 2.396 sin² − 1.787 sin⁴ °/day sidereal, `:91`) equal Snodgrass & Ulrich (1990)/Snodgrass (1983) to the quoted digits (the front-end shader's 14.44/−2.87/−0.36 is tracked in F-SOL-14).
  NaN/inf hazards (model level, `probe`): `_clamp(nan,0,1)` returns 0.0 (`min(hi, max(lo, nan))` yields `lo`), so `_activity_index(nan) = (0.02, nan)`; `sample_state(nan)` then dies in `int(jd*100)` (ValueError) and `inf`/`1e300` raise ValueError/ErfaError. The HTTP layer rejects non-finite and out-of-range epochs first (`server.py:1838-1856` finite check, `:3299-3306` range check), so this is latent only.
- Impact: activity index has a plateau at its maximum instead of a peak (3.4 % clip); cosmetic. The `_clamp` behaviour would hide a NaN as a plausible bound value if a future caller skipped the server validation.
- Fix: normalise by `max` found numerically once (module constant) or solve `e^{x²}(3−2x²)=3c` for x; make `_clamp` return NaN for NaN (`if value != value: return value`).
- Prior: NEW

### F-SCI-13 — K-01's "IAS15 setup" block is a silent no-op under REBOUND 5.1.1 and a test still fakes `ri_ias15`
- Severity: Low   - Class: VERIFIED   - Reach: BACKEND   - Effort: S
- Where: `backend/sim/rebound_nbody.py:288-296`; `backend/tests/test_seek_optimizations.py:37,60-62`
- Evidence: `hasattr(rebound.Simulation(), 'ri_ias15')` is False in 5.1.1 (`rebound.Simulation().integrator` is an `IntegratorConfiguration` with `epsilon=1e-9, min_dt=0.0, adaptive_mode=PRS23`); `getattr(new_sim, "ri_ias15", None)` is `None`, the branch never runs, and the intended values equal the defaults (IAS15_FIX_VERIFICATION F-02 measured bit-identical results). A fake `ri_ias15` in `test_seek_optimizations.py` keeps a test passing that exercises a branch real REBOUND skips.
- Impact: none numerically; misleading code and a masking fake.
- Fix: `new_sim.integrator.epsilon = 1e-9` (REBOUND ≥5 API; fail loudly if absent) and delete the fake.
- Prior: K-01 / IAS15_FIX_VERIFICATION F-02 Finding 3 (STILL-PRESENT as dead code; crash FIXED)

### F-SCI-14 — Vestigial `wall_jd` parameter in four private model methods is the root of the two remaining `wall_jd` test failures
- Severity: Low   - Class: VERIFIED   - Reach: CI   - Effort: S
- Where: `backend/sim/solar_physics.py:416-424,448-456,547-558` (`del wall_jd`), `:951,963` (`sample_state(wall_jd=None)` → `wall_epoch = jd` if omitted); `backend/sim/solar_process_worker.py:34-43` (calls `model.sample_state(...)` without `wall_jd`, then overwrites `wall_epoch_jd_tdb`); `backend/tests/test_solar_physics_api.py:175,198,298`
- Evidence: `pytest …::test_historical_response_uses_separate_current_wall_epoch` → `KeyError: 'wall_jd'` (fake `sample_state` reads `kwargs["wall_jd"]`); `…::test_synthetic_and_hybrid_builders_never_request_realtime_data` → `TypeError: fake_sample_state() missing 1 required keyword-only argument: 'wall_jd'` — both reproduced locally (same two as in CI).
- Impact: two permanently red tests; the model's own default would report `wall_epoch_jd_tdb == epoch_jd_tdb` if called without the worker.
- Fix: change both fakes to the real seam (`build_solar_physics_state(..., wall_epoch_jd_tdb=…)` result keys) and drop the dead parameter from the private methods (or require it in `sample_state`).
- Prior: NEW (CI baseline lists the two failures without cause)

## Prior issues in my area

- **K-01** (`ri_ias15` crash): FIXED-ON-HEAD — guard `getattr(new_sim,"ri_ias15",None)` from `555cb56` (2026-08-24); 41-body IAS15 initialise/integrate runs on REBOUND 5.1.1 (`nbody_acc.py`: 1990/2026/2050 states, energy error 6e-16 over 10 yr). Residual: dead branch + masking fake → F-SCI-13.
- **K-10** (512-px AIA tile): FIXED-ON-HEAD at the data contract — `5705c5e` (2026-09-26, "label AIA viewport artifacts nonspatial"; F-SOL-07 lists the follow-ups): backend labels it `helioviewer_viewport_tile`, `spatial_use.eligible:false` + reason, `activity_proxy:null`, `scientific_inference.status:"disabled"` (`solar_realtime_data.py:2442-2461,2519-2533`); frontend validator refuses non-eligible tiles (`solarRealtimeClient.ts:505-530`). Leftover inert UI is F-SOL-07.
- **K-12** (science parts: fetch storms / 13 sequential calls / SILSO 2.9 MB every 120 s): FIXED-ON-HEAD — `8f1f051` + `94e681d`: single-flight per key, provider-wide acquisition deadline (3.8 s), ≤8 upstream calls (2 SWPC + 1 conditional SILSO revalidated every 6 h + 5 AIA), cache keyed by `jd_tdb`, byte caps, explicit staleness (`SWPC_MAX_SAMPLE_AGE_S=900`, SILSO coverage "through last elapsed month"). Parsing re-read: SWPC units km/s, cm⁻³, K, nT, `overall_quality==0`, UTC time tags; `P_dyn = 1.6726e-6·n·v²` nPa is correct; SILSO `0`=provisional/`1`=definitive and `-1`=missing handled. Not run against the live endpoints (403 via proxy).
- **K-24** (unbounded REBOUND seek): FIXED-ON-HEAD for the CPU pin — `_validate_supported_jd` restricts to [1990-01-01, 2050-01-01] TDB (`rebound_nbody.py:52-53,121-133`; `90f4134`); worst seek measured 5.2 s; checkpoints capped at 8.
- **K-45** (differential rotation): CHANGED — backend `solar_physics.py:91` = Snodgrass & Ulrich 1990 / Snodgrass 1983 coefficients (verified, equatorial 24.47 d, polar 34.19 d vs metadata 34.3); the shader still carries different coefficients (F-SOL-14); coronal-loop double rotation and 242 AU spiral are F-SOL-04/13.
- **K-50** (Kuiper cost, rate divergence): STILL-PRESENT — F-SCI-05 (payload now 260 KiB, 47 ms/frame).
- **K-51** (units/frame/time scale, jd-blind cache): FIXED-ON-HEAD for REBOUND (`555cb56`, `cf34ff5`, `7baa015`): AU, AU/day, barycentric ecliptic J2000, `jd_time_scale:"TDB"` in every `state_update`; Kuiper converts declared units and rejects unbound perturbers; realtime cache key includes `jd_tdb`; AIA `getClosestImage` uses `Time(tdb).utc`. Still open for TudatPy (no `jd_time_scale`) → F-SCI-09.
- **IAS15_FIX_VERIFICATION_2026-08-24**: crash FIXED; "silent downgrade" REFUTED (re-confirmed: `epsilon=1e-9`, `min_dt=0` are the 5.1.1 defaults); masking test STILL-PRESENT (F-SCI-13).
- **CODEBASE_AUDIT_2026-09-07**: R-3/R-4 refutations still hold (units; honest `engine`/`engine_requested`); F-28 (energy re-baselined on seek) FIXED-ON-HEAD (error 5.9e-16 after seeks); §"PFSS is a dipole+octupole analytic field" CHANGED — now a real potential-field solve on an explicitly synthetic magnetogram; the `quasi_mhd` label remains (F-SCI-10).
- **R3R4 implementation prompt, repairs (g)**: Legendre basis, grid/real-mode normalisation, source-surface BC, exact boundary crossing, radial-component WSA expansion, Carrington semantics all HOLD (numbers above and in Strengths). FITS/WCS acquisition: implemented but runtime-disabled and real-data-unvalidated (F-SCI-07). Cache/execution: process isolation exists but defeats the cache and misses the deadline (F-SCI-01). The mutation patches reproduce the stated bugs realistically (patch 1 is byte-for-byte the legacy `a`,`b` coefficients from `git show 1a6fcaa^`; patch 6 is the legacy vector-magnitude expansion) but patch 2 is dead (F-SCI-02) and the single mapped node per patch is narrow (F-SCI-06).

## Strengths

- **The PFSS maths is correct, and provably so**: Schmidt basis vs SciPy `lpmv` to 6e-13 (l≤15) / 3e-12 (l≤64); real-mode norm 4π/(2l+1) to 3e-14; decomposition round trip 1.7e-14 on both grid geometries; axial dipole with source surface reproduced to 3e-16 including radial factors, Bθ=Bφ=0 at Rss (2e-17) and exact Br(1); ∇·B and ∇×B at the FD noise floor; open fraction of a pure dipole 35.3 % matches both analytic theory and the production WSA grid (`pfss_b/c`).
- **Tracer**: classification agrees with the analytic flux function for 87/87 dipole lines (down to 0.003° from the separatrix) and with a DOP853 reference for 60/60 lines in a lmax-12 field (median endpoint error 1.3e-4 R☉); three-state termination with exact shell intersections, honest `indeterminate` instead of guessed topology (`pfss_tracing.py:79-139`).
- **Honest semantics by construction**: WSA output is nullable and never falls back to 380 km/s (ADR 0004), `source:"synthetic"` + `fallback_reason` on every response, Carrington mean model is named a search hint and its error is now quantified (≤0.007 rot / 2.5°); the repo's SunPy-derived literals reproduce to 1e-11 rotations / 3e-9° (`carrington_oracle.py`); TDB/UTC handled through Astropy everywhere I looked, with the scale carried in field names.
- **REBOUND engine is accurate, cheap and reproducible**: heliocentric errors vs the committed Horizons states at 1990/2026/2050: Mercury 1.8e3/4.3e3/8.3e3 km (7.9″/17.5″/34.4″), Venus 4.5e3 km (8.6″), Earth 3.1e3 km (4.3″), Mars 1.8e3 km (1.5″), outer planets ≤ 250 km (≤0.07″) — exactly the signature of the omitted GR/asteroids; barycentric Sun error 115 km; energy error 6e-16 over 10 yr; run-to-run bit-identical; 0.27 ms per 60 Hz frame. The tolerances (10,000 km inner / 1,500 km outer) were set at creation (`2226277`) and never loosened; Mercury at 2050 uses 83 % of its limit, so the inner gate is honest, the outer one is ~6× slack.
- **Provenance discipline**: `initial_conditions.py` pins dataset id, API version/query, DE440 GM file URL + SHA-256 and a canonical payload SHA-256 (verified on every load); the committed GM values agree with the DE440 set as I know it (Sun 1.32712440041279e11, Earth 398600.4355, Moon 4902.8001 km³/s²; I could not re-download `gm_de440.tpc` to check the hash myself); the J2000 states are evidently genuine Horizons data (outer planets reproduce to 10–250 km after 25–60 yr, barycentric Sun to 115 km).
- **R3/R4 lane design is fail-closed and mostly effective**: hash-pinned inputs, offline socket guard, exact node collection, skip/xfail forbidden, one-assertion-regex kills; 5 of 6 shipped patches apply and are killed by their mapped node with the right tag; the existing PFSS/WSA/Carrington tests killed 34 of my 43 independent mutants (83 % of the 41 non-equivalent ones), including every basis, normalisation, boundary-condition, topology and Carrington mutant.
- **GONG module engineering**: strict header contract, exact filename grammar, bounded listing/redirect/gzip-ratio/read budgets, immutable hashed snapshots, no future/other-product/arbitrary-month substitution; 254 provider/cache tests green.
- **Kuiper unit guard** (`_verify_perturbers_bound`) and the declared `velocity_units` handshake turned a silent e≈1 failure into a loud rejection; `nearby_systems` catalogue is internally exact (distance_pc = 1000/parallax to 0, ly conversion 1e-6; Proxima parallax 768.0665 mas).

## Scores

| Dimension | Score | Basis |
|---|---:|---|
| Build/test health | 2 | targeted suites green (997/112/254/21), but HEAD CI never green; mutation lane dead (F-SCI-02); 2 `wall_jd` tests red; 5 deadline tests red |
| Type safety (Python) | n/a | no type checker in CI for backend; dataclasses with validation in core modules |
| Architecture / modularity (my area) | 4 | PFSS split into basis/grid/tracing/solver with ADRs; cost: `trace_field_lines` bypasses the batch engine; five solar contract versions in one 1.9 kLOC file |
| Correctness of live paths | 2 | maths right, but default `/solar/physics` 503s on CI-class hardware (F-SCI-01); synthetic input is time-incoherent (F-SCI-04) |
| Physics/numerical fidelity AND honesty of labelling | 4 (PFSS/WSA core, REBOUND planets) / 3 (synthetic corona, catalogue small bodies) / 2 (Kuiper, TudatPy, SRP/tide) | analytic/oracle-validated cores; labels mostly honest (`synthetic`, `unvalidated`); F-SCI-03/09/10 overstate fidelity |
| Data integrity / provenance | 4 | pinned, hashed Horizons/GM inputs; GONG provenance rich but never validated on real files (F-SCI-07) |
| Backend robustness / concurrency | 3 | single-flight caches, supervised killable workers, bounded budgets; but cache defeated by per-request processes and Kuiper blocks the runner (F-SCI-01/05) |
| Security / operational exposure (my slice) | 4 | GONG/SWPC/Helioviewer fetches allow-listed, bounded, fail-closed; transport itself not reviewed by me |
| Performance | 2 | 28 s scalar tracing; 36 s CPU for `high`; Kuiper 47 ms/frame vs 16.7 ms budget; REBOUND 0.27 ms/frame is excellent |
| Test strategy | 4 | analytic/oracle/property tests with committed hashes; blind spots quantified in F-SCI-06; verifier never applies real patches in its meta-tests |
| Documentation accuracy | 4 | ADRs match behaviour where I checked it (0001 recurrence/norms, 0003 radial factors, 0004 formula/availability, 0005 Carrington sentinels); stale docstrings in SRP/tide/Tudat (F-SCI-08/09), README:404 |
| Repo hygiene (my area) | 3 | dead force-model modules with 0 % coverage, vestigial `wall_jd`, dead IAS15 branch |

## Not inspected

- Live upstreams (NSO/GONG, SWPC, SILSO, Helioviewer, Horizons): proxy returns 403 → no real GONG map, no live RTSW/AIA payload, JPL states not re-fetched (their plausibility was checked by integrating them against the three committed Horizons epochs).
- `tudatpy_hooks.py` was read, not executed (conda-only package; unavailable).
- `solar_realtime_data.py` 760-1620 (HTTP transport, redirect/response validators, single-flight bodies) and `gong_magnetogram.py` TLS/socket internals: belong to the networking/security reviewer.
- `backend/data/bodies.py` 140-560 (data rows), `scripts/fetch_jpl_nbody_ephemeris.py`, `scripts/generate_pfss_harmonic_fixture.py` (only exercised through the repo's own hash tests).
- R3R4 prompt lines 260-1267 (process/security/browser-delivery phases belong to other areas).
- Full backend pytest run (owned by the coordinator); I ran only the targeted files listed above.


---

<!-- ======================= REVIEWER TRJ ======================= -->

# TRJ — trajectory design, mission planning and benchmark honesty (target `main` @ 17d1e63)

Counts: Critical 0 · High 2 · Medium 6 · Low 4.
All numbers below were produced by scripts in `$S/work/trj/` (S = `/tmp/claude-0/-home-user-solar-system-realistic-sim/03138f8e-d899-5252-b93f-37b1d0c17ea7/scratchpad`), run with `PYTHONDONTWRITEBYTECODE=1 nice -n 10 $S/venv312/bin/python <script>`. The target tree was never written to (`git status` clean after every run).
Independent oracles I built: (1) `izzo.py` — Izzo (2015) Lambert solver, validated against DOP853 propagation (worst arrival error 0.037 km over 60 random cases); (2) `helio_ecl()` — astropy built-in (ERFA) heliocentric ecliptic-J2000 ephemeris, validated against the committed Horizons DE441 fixture (Earth 1.2 k km, Mars 10 k km, Jupiter 18–47 k km, Saturn 135–182 k km at 2025/2050); (3) scipy DOP853 and REBOUND-IAS15 two-body propagation.

## Scope & coverage

| File | LOC | Coverage |
|---|---:|---|
| backend/trajectory/lambert.py | 1,093 | read fully; executed against 3 independent oracles |
| backend/trajectory/mga.py | 1,203 | read fully; executed (incl. spy on `_SearchRuntime.leg`, exhaustive TOF oracle) |
| backend/trajectory/planner.py / budget.py / contracts.py | 364 / 377 / 348 | read fully |
| backend/trajectory/__init__.py | 17 | not read (re-exports) |
| backend/mission/ephemeris_service.py | 1,575 | read fully; Kepler path executed, Horizons/SPICE read-only (see F-TRJ-07) |
| backend/mission/agents.py | 683 | read fully; executed |
| backend/mission/risk_service.py / mining_service.py / vehicle_service.py | 118 / 93 / 170 | read fully; executed |
| backend/mission/schemas.py / explainability.py / orbital.py | 241 / 42 / 153 | read fully |
| backend/mission/epo/* (7 files) | 569 | read fully; smoke test executed |
| backend/mission/__init__.py | 47 | not read |
| backend/benchmark/accuracy.py | 681 | read fully; executed |
| backend/benchmark/reference_scenarios.json / CALIBRATION_PROTOCOL.md / artifacts (9 CSV) / __init__ | 167 / 76 / 18 / 19 | read fully (except `__init__`) |
| backend/server.py trajectory/mission/benchmark slice (190–480, 1020–1420, 2040–2830, 2877–2945, 3480–4225) | ≈1,900 of 4,905 | read; all 6 endpoints executed (TestClient + real uvicorn on :18742/:18743, both killed) |
| tests: test_lambert_solver_reference (213), test_mga_flyby_physics (126), test_mga_acceptance_quality (199), test_trajectory_regression (122) | 660 | read fully |
| tests: test_mga_bounded_search (1,316), test_ephemeris_service_safety (1,082), test_mission_agents (494), test_benchmark_accuracy (240) | 3,132 | partially read (oracle/real-ephemeris/auto/nesting tests) |
| tests: test_trajectory_endpoint_budget (1,243), test_trajectory_contracts (436), test_lambert_state_contract (328), test_trajectory_entry_validation (207), test_benchmark_endpoint_budget (211), test_porkchop_core_bounds (162), test_compute_budget (108), test_mission_schemas (139) | 2,834 | not read; executed only |
| tests: test_benchmark_report_overwrite (134) | 134 | not read, not run (writes files) |
| agent-notes/TRAJECTORY_AMPLIFICATION_DEFENSE_IN_DEPTH_PLAN_2026-09-25.md | 961 | partially read (1–140, 820–961) |
| src/frontend/features/trajectory/index.ts (UNREACHABLE) | 391 | read fully |
| src/frontend/features/trajectory/localPlanner.ts / app/plannerController.ts (UNREACHABLE) | 346 / 623 | partially read (contract-consumption parts only) |

What I ran (one-line outcome):
- `pytest -p no:cacheprovider -q` on the 12 fast in-scope files → **165 passed** (2.3 s); `test_mga_bounded_search` **65**, `test_ephemeris_service_safety` **35**, `test_trajectory_endpoint_budget` **47**, `test_benchmark_endpoint_budget` **6** → **318 passed** in ≈12 s total, 0 failed.
- `python -m mission.epo.smoke_test --compact` → `{"total":30,"passed":0,"failed":30,"exceptions":10}`, exit code 0, 13.4 s (F-TRJ-06).
- `lambert_check.py` (113 hand-built cases: random, near-180°, exact-180°, hyperbolic, tiny/huge TOF, retrograde, long-TOF/multi-rev territory, r from 0.01 to 300 AU) → 98 solved, 15 `None`, 0 raised; `mc_lambert.py` (5,999 random cases vs Izzo) → 5,998 solved, max |Δv| 1.4e-3 km/s; `fine_grid.py` (25,551 Earth→Mars cells) → max |Δ(total v∞)| 4.4e-5 km/s.
- `mars2026.py`, `jupiter_scan.py`, `jupiter_long.py`, `plan_http.py`, `k28.py`, `mga_oracle.py`, `mga_oracle2.py`, `oracle_route_check.py`, `tofcap.py`, `saturn_cap.py` (MGA/planner, numbers in F-TRJ-03/04).
- `contain1.py`, `contain2.py`, `bigdate.py`, `mining_big.py`, `disconnect_test.py`, `deadline_test.py`, `sat_rate.py`, `health_under_load.py` (+ `hang_probe*.py`, `repro_hang*.sh`) (containment, F-TRJ-05/11).
- `eph_accuracy.py`, `izzo_selftest.py`, `horizons_live.py` → Kepler vs Horizons DE441 table (F-TRJ-09); live Horizons **blocked by the egress proxy (CONNECT 403)**, not retried (F-TRJ-07).
- `bench_run.py`, `mission_default*.py`, `mission_closing*.py`, `vehicle_cap.py`, `epo_detail*.py`, `epo_nesting.py`, `determinism.py` (3 PYTHONHASHSEEDs → identical hashes), `providers.py`, `flyby_check.py`, `rebound_oracle.py`, `units_e2e.py`.

## Findings

### F-TRJ-01 — "Strict GMAT/Orekit/Tudat" reference data is unprovenanced, contradicted by an independent Lambert, and the benchmark can no longer fail
- Severity: High   - Class: VERIFIED (non-reproducible, contradictory metadata, vacuous scoring) / SUSPECTED (that the numbers were authored rather than produced by the named tools)   - Reach: DATA + BACKEND (`GET /benchmark/accuracy`)   - Effort: S to relabel; L to produce real references
- Where: `backend/benchmark/reference_scenarios.json:5,14-19,25,48` (and 60/69-74/80/103, 115/124-129/135/158); `backend/benchmark/artifacts/*.csv:2`; `backend/benchmark/accuracy.py:300-307,518-537`; `backend/benchmark/CALIBRATION_PROTOCOL.md:28-48,65`; `backend/tests/test_benchmark_accuracy.py:22-25`; `my-notes/codex-xhigh/CODEX_XHIGH_2026-02-15_05-28-41.md:5,44`; `my-notes/ACCURACY_REPORT_2026-02-15_04-51-05.md:17-19`
- Evidence:
  ```
  reference_scenarios.json:14-15   "comparable_to_solver": false,
                                   "compatibility_note": "Legacy window-level total delta-v capture. The artifacts do not record endpoint states, ..."
  reference_scenarios.json:48      "notes": "Cross-tool direct Lambert benchmark capture for fixed departure/arrival dates.",   <- same row, contradicts :15
  artifacts/earth_mars_2024_window__gmat.csv:2
      earth_mars_2024_window,gmat,R2025a,earth_mars_2024_window-gmat-run-01,2026-02-15T10:27:25Z,2460600.5,2460860.5,8.48213000
  ```
  Shipped result (`bench_run.py`): `{'scenarioCount': 3, 'comparableScenarioCount': 0, 'incomparableCount': 3, 'solvedCount': 0, 'passRate': 0.0, 'validationCoverage': 0.0, 'referenceIntegrityOk': True}` (`requiredTools: [gmat, orekit, tudat]` is also returned). `test_benchmark_accuracy.py:22-25` *asserts* this vacuous state (`comparableScenarioCount == 0`, `solvedCount == 0`); the other test (`:39-130`) replaces the solver with a stub that returns `consensus + {0, 0.5, 1.5}·tolerance` (pure bookkeeping, no physics).
  Flipping the flag in a scratch copy: model 7.637 / 39.983 / 51.620 km/s vs "reference" 8.490 / 7.108 / 16.873 → |err| 0.852 / 32.875 / 34.746 vs tolerance 0.45 / 0.40 / 0.70 → 0/3 pass (reproduces K-30). **Independent fixed-date Lambert (Izzo + ERFA ephemeris) for the same JD pairs: 7.628 / 39.993 / 51.630 km/s** — i.e. the repo solver is right and the "tool" numbers are not the fixed-date Lambert Δv under any definition I tried (heliocentric v∞ sum 7.63 / 39.99 / 51.63; LEO-departure + 300-km circular-capture 6.40 / 30.71 / 52.82; `ref_defs.py`) — the three geometries are 167° / 332° / 32° transfers. (So, unless they use a Δv definition I could not identify, the 9 CSV rows are not fixed-date captures, contradicting `provenance.notes`.)
  Provenance: all nine CSVs carry the identical `captured_utc` 2026-02-15T10:27:25Z; the committed agent log (`CODEX_XHIGH_2026-02-15_05-28-41.md:5` "Generated: Sun Feb 15 05:28:41 EST" = 10:28:41Z; `:44` "Created `backend/benchmark/artifacts/`…") shows an AI agent created these files in that session without any mention of installing or running GMAT/Orekit/Tudat; the accuracy report using them is stamped 10:28:12Z. The placeholder "blend" references one hour earlier were round numbers (`ACCURACY_REPORT_2026-02-15_04-51-05.md:17-19`: 8.600 / 7.200 / 17.000); the "strict" consensus values are 8.490 / 7.108 / 16.873 (−1.3 %, −1.3 %, −0.7 %). No GMAT script, Orekit/Tudat run file, kernel or state vector exists in the tree (`git ls-files | grep -i -E 'gmat|orekit'` returns only the 6 CSVs). `CALIBRATION_PROTOCOL.md:36-46` asks for `central_body/state_source/reference_frame/velocity_units/revolutions/delta_v_metric` — `accuracy.py` never parses any of them, so a scenario flipped to `comparable_to_solver: true` is judged on a bare ±tolerance; `CALIBRATION_PROTOCOL.md:65` says to "tune `delta_v_tolerance_km_s`" after seeing results (0.45–0.7 km/s ≈ 4–6 %, versus a measured solver-vs-independent Earth→Mars error of 0.006 km/s 1σ, see Strengths).
- Impact: The repo's only "external validation" artifact is mislabelled (tool name/version/run_id/captured_utc on data nobody can regenerate, and a provenance note that is false for these numbers). Because the rows are now `incomparable_reference`, nothing is scored, so the endpoint reports `referenceIntegrityOk: true` + `passRate: 0.0` — neither a pass nor a fail; `GET /benchmark/accuracy?ephemeris_provider=spice` even returns 200 with SPICE unavailable because no scenario ever touches the provider. Anyone citing "benchmarked against GMAT/Orekit/Tudat" would be citing nothing.
- Fix: (1) `reference_scenarios.json`: set `tier` to `"unverified_placeholder"`, `source` to `"placeholder-not-tool-output"`, delete the false `provenance.notes` lines, and drop the tool_version/run_id fields until real; (2) `accuracy.py:192-194`: refuse `tier == "strict"` unless each tool entry carries `artifact_kind: "state_vectors"` and the `CALIBRATION_PROTOCOL.md:36-46` fields; (3) replace the vacuous reference with an in-repo oracle that already exists: the committed Horizons DE441 fixtures + an independent Lambert (the 25-line Izzo in `$S/work/trj/izzo.py`) as a `fixed_state_lambert` scenario with tolerance derived from the catalog error (≈0.05 km/s), then add real GMAT/Orekit/Tudat captures (full state vectors + script) later; (4) make the endpoint summary include a top-level `"validated": false` when `comparableScenarioCount == 0`.
- Prior: K-30 (CHANGED — relabelled `comparable_to_solver=false` in 8a3ba50; artifacts still single-row/unprovenanced).
- Adversarial check: tried to refute "mislabelled". (a) The numbers may be genuine tool outputs for a different ("window-optimisation") problem, as `compatibility_note` says — I cannot disprove that, hence the fabrication half is only SUSPECTED. (b) But the same row's `provenance.notes` states they are *fixed-date direct Lambert* captures, which an independent solver falsifies by up to 35 km/s, so at least one of the two statements in the file is false; (c) no run inputs/outputs exist, so the "strict" tier/tool/version/run-id/timestamp claims are unverifiable and the timestamp/agent-log coincidence is strong circumstantial evidence of authorship by the agent. (d) Impact is bounded because nothing consumes the values for scoring any more — that is why this is High, not Critical.

### F-TRJ-02 — Mission planner: payload closure and risk model give inverted answers; the default request can never succeed and its 422 hides why
- Severity: High   - Class: VERIFIED   - Reach: BACKEND (`POST /mission/plan`, README:19,301-305; no shipped UI calls it)   - Effort: M
- Where: `backend/mission/mining_service.py:77-81`; `backend/mission/agents.py:480-486,495-501,531-533`; `backend/mission/risk_service.py:65-69,35-37`; `backend/mission/vehicle_service.py:154-162`; `backend/server.py:4104-4109`
- Evidence:
  ```
  mining_service.py:81   returned_payload_kg = max(0.0, delivered_before_propellant - return_propellant_kg)
  agents.py:533          score = float(closure["returnedPayloadKg"]) - float(logistics.get("totalPropellantUsedKg", 0.0)) - risk_penalty - time_penalty
  risk_service.py:65-66  margin_penalty = (dv - base_total_delta_v_km_s) * 120.0
                         margin_penalty += max(0.0, base_returned_payload_kg - payload) * 0.08
  ```
  `POST /mission/plan {}` → **HTTP 422** `{"code":"mission_no_feasible_recommendation","message":"no_verified_candidate","context":{}}` (the `alternatives` with their `verification.reasons` are computed and then discarded at `server.py:4104-4109`). Direct `MissionPlannerAgent.plan({})` (`mission_default2.py`): every candidate is `vehicle_budget_not_feasible` with **unmet Δv 46.26 km/s** (outbound 28.12 + return 21.85 km/s), propellant burns `[23970, 0]` kg, yet `returnedPayloadKg = 9,499` (= storable cargo − 0 kg return propellant), `failureProbability = 0.000`, `missionScore = −14,666`. Default vehicle total capability measured by bisection on `VehicleService`: **3.716 km/s** (initial mass 41,100 kg) versus ≥ 11.2 km/s for the cheapest Earth→Mars→Earth (5.6 + 5.6 v∞ sums) → no date makes the default request succeed.
  The opposite case (`mission_closing2.py`: extra-heavy vehicle that *does* close, Earth→Mars→Earth, dep JD 2461344.5, mining 250 d): burns 6.45 / 6.49 km/s using 967,389 / 153,370 kg, storable cargo 10,335 kg → `returnedPayloadKg = max(0, 9,922 − 153,370) = 0`, `failureProbability = 1.0`, verification `no_returned_payload`. So infeasible ⇒ full cargo + P(fail) 0; feasible ⇒ zero cargo + P(fail) 1. The only success the repo's tests exercise (`test_mission_agents.py:14-51`) uses two 100-kg-dry-mass stages carrying 2,000 t of propellant at Isp 1000 s, 5,000 mining days at 50,000 kg/day, 100 % yield and a failure threshold of 1.0.
  K-31 items re-verified: mined cargo is never added to the mass in the rocket equation (`agents.py:480-486` passes only `payload_mass_kg`; cargo enters only afterwards in `close_payload`), the return propellant is deducted from cargo (`mining_service.py:81`) and then total propellant (including that same return burn) is deducted again in the score (`agents.py:533`). Rocket-equation mechanics themselves are correct (`vehicle_service.py:87-104`: `ve = isp*G0`, `Δm = m0(1−e^{−Δv/ve})`, staging drops dry mass + reserve). Risk constants are invented: margin penalty 120 kg per km/s of Δv overrun versus the rocket-equation sensitivity of the default vehicle `m0/ve = 11,642 kg per km/s` (97× smaller), `risk_penalty = 9000·P(fail)` and `time_penalty = 0.25·days` (kg vs days) at `agents.py:531-532`, σ fractions 1 %/4 %/12 % at `risk_service.py:35-37` with no source. Monte-Carlo itself is deterministic (`random.Random(seed+idx)`; same seed ⇒ identical failureProbability and score; `determinism.py` identical across 3 hash seeds).
- Impact: The module's three advertised outputs (payload-return closure, risk envelopes, verified recommendation) are wrong for every realistic input and right only for contrived ones; the HTTP API gives a client no way to learn why. Any decision log or score from this endpoint is meaningless.
- Fix: (1) `agents.py:480-501`: give `VehicleService.evaluate_burn_budget` a per-burn `mass_added_before_burn_kg` list and pass `[0, storable_cargo × handling_survival]` for the return burn; (2) `mining_service.py:63-90`: stop subtracting vehicle propellant from cargo (returned = cargo × survival); (3) `agents.py:533`: score with returned payload minus *non-recoverable* cost only (or remove the propellant term entirely) and put each constant behind a named, documented parameter; (4) `risk_service.py:65-69`: make a candidate with `logistics.feasible == False` fail by construction and derive the margin sensitivity from the vehicle (`m/ve`) instead of 120; (5) `server.py:4104-4109`: put `alternatives[*].verification.reasons` into the 422 `context`; (6) change the defaults (`vehicle_service.py:154-162` and the default departure JD) to something that can close, with a test that `POST /mission/plan {}` returns 200.
- Prior: K-31 (STILL-PRESENT, lines moved), K-52 risk model + default 422 (STILL-PRESENT).
- Adversarial check: Could the "carved out of cargo" rule be an ISRU-propellant model? Then (i) the vehicle's own propellant would not also be charged in `agents.py:533` (double count), (ii) the infeasible case would not report full cargo with zero return propellant, and (iii) P(fail) would not ignore logistics feasibility — all three observed. Could the 422 be the correct "guard" outcome? The verifier does stop a wrong *recommendation* from being returned, but it is stopping everything realistic, and the discarded alternatives show P(fail)=0.000 for infeasible plans. Reachable? Yes — live endpoint, only the (unreachable) UI is missing. Survives as High.

### F-TRJ-03 — `totalDeltaVKmS` is a heliocentric v∞ sum (no parking/capture orbit) yet is called "propulsive burns" and fed to the rocket equation
- Severity: Medium   - Class: VERIFIED   - Reach: BACKEND   - Effort: M
- Where: `backend/trajectory/lambert.py:780-781`; `backend/trajectory/mga.py:943-949` ; `backend/mission/agents.py:480-486`; `backend/server.py:3659-3707` (knownLimitations)
- Evidence:
  ```
  lambert.py:780  delta_v_depart = au_per_day_to_km_per_sec(vector_length(vector_sub(v_depart, start_velocity)))   # |v_transfer − v_planet| = v∞
  mga.py:945-949  "totalDeltaVKmS": partial.departure_delta_v_kms + float(partial.legs[-1]["deltaVArrivalKmS"]),
                  "deltaVModel": "endpoint_propulsive_burns_only",
  ```
  Earth→Mars 2026 best cell: v∞dep 3.034 (C3 = 9.20 km²/s²) + v∞arr 2.575 = **5.608 km/s**. Patched-conic cost from a 300 km LEO: TMI = √(3.034²+2μ/r) − v_c = **3.61 km/s**; Mars orbit insertion at 2.575 km/s v∞ = **2.06 km/s** (300 km circular) or **1.04 km/s** (ellipse with 300-km-altitude periapsis and 20,000-km apoapsis radius). Earth→Jupiter best v∞dep 8.707 km/s needs only **6.24 km/s** from LEO (Oberth), while capture of the 5.68 km/s arrival v∞ into a 50 R_J-apoapsis ellipse costs **0.86 km/s** (1.24 / 0.57 for 30 / 100 R_J), not the 5.7 km/s the planner charges (inline calc: μ_J = 126,686,534.9 km³/s², rp = 71,492 + 300 = 71,792 km). `knownLimitations` lists chord-length and assist-gain caveats (`server.py:3693-3706`) but not this one. The mission layer then feeds these sums to a rocket equation as burn Δv (`agents.py:480-486`), so required propellant is mis-sized in both directions (≈ ±30 % of the round-trip total).
- Impact: Label says "propulsive burns" but the quantity is not what any spacecraft burns; the closeness of the Earth→Mars number (5.6) to the "≈ 5.5–6 km/s from LEO" rule of thumb is a coincidence of 3.6 + 2.1.
- Fix: add a documented `departure_orbit`/`arrival_orbit` (altitude, optional capture apoapsis) option in `planner.py` and report `departureBurnKmS = sqrt(v∞² + 2μ/r) − sqrt(μ/r)` alongside v∞; until then rename the field in `mga.py:945,949` to `totalVInfinityKmS` / `deltaVModel: "heliocentric_vinf_impulses"` and add a `knownLimitations` entry at `server.py:3693`.
- Prior: NEW.

### F-TRJ-04 — MGA search is a single-departure-date, 8-seed heuristic: it misses a feasible assisted route 21 km/s better, misses the direct optimum by 4 %, and cannot represent classic flyby sequences
- Severity: Medium   - Class: VERIFIED   - Reach: BACKEND (`/trajectory/plan`; UI UNREACHABLE)   - Effort: M (seed density) / L (DSM, revisits)
- Where: `backend/trajectory/mga.py:451-476` (TOF seeds), `:479-486` (8-seed thinning), `:988-1000,1068-1084` (single `departure_jd`), `:1102-1105` + `contracts.py:310-312` (no body reuse), `:489-557` (unpowered only), `:582-596` (beam key = chord sum), `backend/server.py:3649-3707` (capabilities text)
- Evidence (what is searched): one caller-supplied departure epoch; direct routes: ≤ 15 TOF seeds `hohmann×{0.55,0.75,1,1.25,1.6} ∪ {70,100,140,190,260,360,520,700,980,1280}` rounded to 5 d and clamped to [45, 2000] d; assisted: ≤ 8 first-leg seeds per assist body (e.g. Earth→Mars `[70,130,175,235,295,380,700,1280]`), outgoing TOF by 1-D root finding of |v∞out|−|v∞in| (≤ 2 roots/edge, ≤ 20 probes), unpowered flyby test with rp = R + 300 km, no body appears twice (`mga.py:1102-1105` skips bodies already on the route) and both endpoints are removed from the pool (`contracts.py:310-312`), beam 12 / ≤ 256 prefixes / ≤ 2,000 Lambert evaluations, partial ranking key `(total_path_length_au, departure_Δv, elapsed)` where path length is the chord sum (`mga.py:589`).
  - Direct optimum missed: Earth→Mars at JD 2461344.5 (2026-10-31): `/trajectory/plan` best **5.828 km/s (TOF 335 d)** vs porkchop/independent optimum **5.608 km/s (TOF 310 d)** (+0.22 km/s, +3.9 %).
  - Assisted recall (`mga_oracle.py`, exhaustive 10-d grid over both TOFs, *same* catalog, same Lambert, same `_evaluate_flyby`): Earth→{Venus,Mars}→Jupiter at 4 departure dates each — planner returned **0 assisted routes in 8/8**; the oracle found feasible unpowered routes in **6/8** (caveat: its best Mars-assist case, 14.4 km/s at dep JD 2461101.5, needs a 1,555-d first leg, beyond the planner's longest first-leg seed of 1,280 d and not a realistic mission; re-running 6 of the cases with first-leg TOF ≤ 1,400 d at 5-d resolution, `mga_oracle2.py`, leaves feasible Venus-assist routes in 2 (totals 25.7–27 km/s, 36 roots in all) and none for Mars). Concrete: dep JD 2461161.5 via Venus: planner best = direct **47.649 km/s**, `flybyRejectionsByReason = {}`, `terminationReason = configured_frontier_completed`, `truncated = false`; the oracle's Earth→Venus (660 d)→Jupiter (1764.03 d) is **26.569 km/s**, independently re-validated with Izzo + JPL GM (`oracle_route_check.py`: |v∞| in/out 14.2443/14.2443 km/s, mismatch 4e-12; turn 22.61° ≤ max 23.23°). Nearest planner seed to t1 = 660 d is 700 d.
  - K-28 recheck: `k28.py` (spy on `_SearchRuntime.leg`), Earth→Mars `max_assists=3`: 903 leg evaluations (stage split 47/476/329/51), first-leg bodies tried `[jupiter, mercury, saturn, venus]`, depth-2 and depth-3 explored; 5 assisted routes found but none ranked in the 6 returned. (Plan §3.6 baseline for the same class of request: 8,170 Lambert calls, JD 2460500.5.)
  - TOF cap: for Uranus the best v∞ sum over one synodic period is **27.3 km/s with TOF ≤ 2000 d vs 16.7 km/s unconstrained** (Saturn 17.2 vs 16.7) (`saturn_cap.py`); `/trajectory/plan` cannot return the Hohmann-class transfers (Earth→Saturn 2,208 d, Uranus 5,857 d).
  - Not representable: Earth-return flybys (VEGA/VEEGA/EVEEGA — Earth is the departure body so can never be an assist), powered flybys, deep-space maneuvers, > 0 revolutions.
  - Tests: `test_small_unpruned_search_matches_exhaustive_topology_oracle` (`test_mga_bounded_search.py:537-575`) monkeypatches both `compute_lambert_leg` and `_matched_outgoing_legs`, so it checks topology enumeration only; the plan's gate "if the oracle finds a route, the bounded search finds one" (plan §21) is not demonstrated with real physics.
- Impact: Honest on paper (`searchSpaceExhaustive:false`, `optimalityGuaranteed:false`, knownLimitations discloses seeds and the 45–2000 d domain) but the `configuredFrontierCompleted:true / truncated:false` outcome gives no hint that a 44 %-better assisted route existed inside the advertised domain, and "single departure date" and "no Earth re-encounter" are not disclosed anywhere.
- Fix: (1) `mga.py:451-476`: replace the fixed seed list by a TOF grid chosen from the phase-angle residual (e.g. 5-d spacing 45–1300 d for leg 1) and raise `ASSIST_TOF_SEEDS` from 8 to ≥ 24 behind the existing 2,000-evaluation cap (cost today: 0.2–0.9 s); (2) allow the departure body in the assist pool after ≥ 1 leg (`contracts.py:310-312`, `mga.py:1102-1105`); (3) add `departure_window_days` to `PlanRequest` so a plan scans dates the way `scan_porkchop_window` already does; (4) add the three missing disclosures to `server.py:3659`; (5) add a real-physics oracle test using `$S/work/trj/mga_oracle2.py` logic on one fixed date.
- Prior: K-28 (FIXED-ON-HEAD in 931faae; this is the successor limitation), K-29 (see Prior section).

### F-TRJ-05 — Extreme-but-finite epochs escape the typed-error contract: HTTP 500 on `/trajectory/plan` and `/mission/plan`; no epoch-range validation
- Severity: Medium   - Class: VERIFIED   - Reach: BACKEND   - Effort: S
- Where: `backend/trajectory/lambert.py:158-175`; `backend/trajectory/mga.py:35,1069,1084`; `backend/trajectory/planner.py:174-185` (no `except TrajectoryInputError`, unlike `:224`, `:304`, `:348`); `backend/server.py:3766-3783,4075-4092`; `backend/trajectory/contracts.py:184-194`; `backend/mission/agents.py:438`
- Evidence (`bigdate.py`, `mining_big.py`):
  ```
  departure_jd=1e17  plan(ma=1) 200 | lambert 200 with tofDays=192.0 (requested 200)
  departure_jd=1e18  plan(ma=1) 500 Internal Server Error | plan(ma=0) 200 | lambert tofDays=256.0 | mission 500
  departure_jd=1e300 plan 500 (any max_assists) | mission 500 | lambert 400 | porkchop 400
  POST /mission/plan {"mining_days": 1e300} -> 500          (1e18 -> 422)
  ```
  Root cause: `departure + tof == departure` in float64 → `TrajectoryInputError("`tof_days` must be positive and produce a finite arrival epoch")` raised inside `optimize_mga_route`; `plan_interplanetary_route` converts that class for Lambert/porkchop but not for MGA, and the endpoints' except-lists (`TrajectoryRequestRejected`, `Planning*`, `EphemerisError`) do not include it, so Starlette returns a plain-text 500. Separately, any finite JD is accepted: JD 1e15 returns a confident `kepler` plan (the catalog is a J2000 mean-element set; Standish validity 1800–2050), and at JD 1e17 the Lambert response silently solves a 192-day transfer for a requested 200 days.
- Impact: contradicts the "every failure is a typed, bounded outcome" design (and the frontend's `trajectoryApiError` would show a generic 500); extreme epochs yield authoritative-looking nonsense.
- Fix: `planner.py:174-185`: wrap `optimize_mga_route` in `except TrajectoryInputError as exc: raise _reject_invalid_entry(exc)`; `contracts.py:189-194`: reject `|departure_jd − 2451545| > 4·36525` days (and in `schemas`/`MissionPlanRequest` bound `mining_days` ≤ 3650); add the epoch range to `/trajectory/capabilities`; test: `POST /trajectory/plan` with `departure_jd=1e18` → 422.
- Prior: NEW.

### F-TRJ-06 — EPO smoke test passes 0/30 with exit code 0; the module has no tests and a verifier that rejects every correct result
- Severity: Medium   - Class: VERIFIED   - Reach: SCRIPT (documented as a validation command)   - Effort: S
- Where: `backend/mission/epo/verifier.py:31,53`; `backend/mission/epo/sample_episodes.py:112`; `backend/mission/epo/smoke_test.py:40-53`; `typescript_migration_plan.md:95`
- Evidence:
  ```
  verifier.py:31   verification = result.get("verification") if isinstance(result.get("verification"), dict) else None   # planner nests it in result["recommendation"]
  sample_episodes.py:112   objective="min_delta_v",     # allowed: min_distance | max_assist | min_time
  ```
  `smoke_test --compact` → `{"total":30,"passed":0,"failed":30,"exceptions":10, mining_core: exception 10, outer_reacher: missing_recommendation 10, return_pressure: missing_recommendation 10}`. Breakdown (`epo_detail*.py`): `mining_core` 10/10 raise "`objective` must be one of the supported trajectory objectives"; the other 20 return `no_verified_candidate` / `trajectory_search_inconclusive` (all candidates `vehicle_budget_not_feasible`, e.g. Jupiter 22.0 + 15.3 km/s, F-TRJ-02). Feeding the verifier a perfect result (`status:"ok"`, nested `verification.valid: true`, score 123, P_fail 0.01) → `(False, ['missing_embedded_verifier'], …)` (`epo_nesting.py`). `smoke_test.main()` never sets a non-zero exit code. `grep` finds no test or CI step referencing `mission.epo`.
- Impact: 569 LOC of scaffolding whose only entrypoint cannot report success, is recommended as a check in a planning doc, and cannot fail a build.
- Fix: `verifier.py:31` read `recommendation.get("verification")`; `sample_episodes.py:112` → `"min_distance"`; `smoke_test.py:40` `raise SystemExit(0 if totals["failed"] == 0 else 1)`; add `backend/tests/test_epo_smoke.py` with one episode on a vehicle that closes; or delete `mission/epo/`.
- Prior: K-52 (epo/verifier.py wrong nesting, 0/30: STILL-PRESENT).

### F-TRJ-07 — Horizons/SPICE provider code (≈ 60 % of the 1,575-line file) has only ever parsed hand-written payloads; real-API compatibility unverified
- Severity: Medium   - Class: SUSPECTED (loop not closed)   - Reach: BACKEND (opt-in `ephemeris_provider=horizons|spice`, direct Lambert only)   - Effort: S to close
- Where: `backend/mission/ephemeris_service.py:1047-1291,1449-1543`; `backend/tests/test_ephemeris_service_safety.py:59-92`; `scripts/fetch_jpl_nbody_ephemeris.py:160-205`
- Evidence: the test fixture `_horizons_payload()` is a hand-written f-string (`"Target body name: Earth ({target_id}) {{source: DE441}}"`, `Start time      : A.D. 2024-Mar-31 …`). `_parse_horizons_payload` additionally requires `Start time`, `Stop  time` (ending ` TDB`), `Output type     : GEOMETRIC cartesian states`, a `JDTDB,` header with `Calendar Date (TDB)`, and the sentence "Geometric state vectors have NO corrections or aberrations applied." The script parser that *did* hit the real API (fixture retrieved 2026-08-26, `nbody_horizons_validation.json` provenance) checks only target, center, frame and units. A live check was impossible here: `horizons_live.py` → `EphemerisProviderUnavailable`; `curl` → `CONNECT tunnel failed, response 403` (egress policy; not retried or worked around). Ephemeris-service design itself is strong (absolute deadlines, 1 global permit, 2 MB cap, single-flight, circuit breaker), but it is ~1,000 lines for a path that search endpoints reject (`TRAJECTORY_HORIZONS_SEARCH_ENABLED = False`, `server.py:1168`).
- Impact: If any of the extra header assertions differs in the real response, every Horizons request fails closed with `ephemeris_protocol_error` (safe but useless); and the maintenance cost of the untested majority of the file falls on a solo author.
- Fix: capture one real response per `_ID_TO_HORIZONS` target into `backend/tests/fixtures/horizons_vectors_<id>.json` (use `scripts/fetch_jpl_nbody_ephemeris.py`'s fetch helper) and parse it in `test_ephemeris_service_safety.py`; split `ephemeris_service.py` into `ephemeris_kepler.py` (≈ 150 lines, default) and `ephemeris_remote.py`.
- Prior: NEW.

### F-TRJ-08 — Lambert/MGA correctness rests on self-generated golden values and faked legs; there is no independent-oracle test (the repo's own rule in `src/sim/TESTING_NUMERICS.md`)
- Severity: Medium   - Class: VERIFIED   - Reach: CI/test   - Effort: S
- Where: `backend/tests/test_lambert_solver_reference.py:19-47`; `backend/tests/test_mga_bounded_search.py:537-575`; `backend/tests/test_benchmark_accuracy.py:22-25,39-130`; `backend/tests/test_mga_flyby_physics.py:49-54`
- Evidence: `REFERENCE_CASES[*].expected_total_dv_km_s` (7.6399 / 39.9889 / 51.6344) are outputs of the solver under test (sibling to the 7.637 / 39.983 / 51.620 in the 2026-02-15 accuracy report) asserted to 2e-6 km/s; `_expected_max_turn_deg` recomputes the turn limit with the same closed form as `_evaluate_flyby`; no test propagates `(r1, v1)` forward. My independent check shows the goldens happen to be right (Izzo + ERFA: 7.628 / 39.993 / 51.630; turn limit matches JPL-GM to 1e-3° for all 8 planets, `flyby_check.py`), so this is a gap in *protection*, not a bug. REBOUND (already pinned in `backend/requirements.txt`) reproduces the propagation oracle: IAS15 two-body arrival error 1.1e-4 km on the Earth→Mars golden case (`rebound_oracle.py`).
- Impact: a regression that shifts v1 by a few hundred m/s but keeps the TOF residual small, or that breaks only near-180° / hyperbolic geometry (F-TRJ-10), would not be caught.
- Fix: add `backend/tests/test_lambert_propagation_oracle.py`: for ≥ 25 seeded cases (planetary, hyperbolic 20–60 d, retrograde, long-TOF) propagate `(r1, v1)` with `rebound` IAS15 and assert `|r_end − r2| < max(1 km, 1.5·v·8.64 s)` and `|v_end − v2| < 1e-6 AU/day`; one fixed-date Earth→Mars Δv test against the ERFA-derived value (7.628 ± 0.02 km/s) as an external oracle.
- Prior: NEW.

### F-TRJ-09 — The `kepler`/`auto` provider has no secular rates: 35–260 k km inner-planet errors (up to 13.8 M km for Saturn in 2100); accuracy not quantified in the API
- Severity: Low   - Class: VERIFIED   - Reach: BACKEND / DATA   - Effort: M
- Where: `backend/data/bodies.py:10-163` (fixed J2000 elements + rounded `period_days`, no rates), `backend/mission/orbital.py:52-114`, `backend/server.py:3686-3692`
- Evidence (`eph_accuracy.py`: `sample_body_state_from_elements` vs committed Horizons DE441 `scripts/fixtures/planet-positions-horizons.json`, heliocentric ecliptic J2000, planet barycentres):
  ```
  position error km   Mercury   Venus    Earth(EMB)  Mars     Jupiter    Saturn      Uranus     Neptune
  1900-01-01          220,873   108,779  132,109     260,974  1,958,744  12,009,844  3,179,319  934,243
  2025-01-01          56,145    38,757   34,984      57,506   394,057    935,589     1,431,143  898,274
  2050-01-01          182,611   48,188   67,913      88,466   2,245,124  7,366,306   655,508    755,072
  2100-01-01          206,717   118,676  124,114     203,951  2,346,321  13,756,387  2,253,486  2,161,080
  velocity error 2025: Earth 6.95 m/s, Mars 3.27 m/s, Jupiter 8.9 m/s, Saturn 24 m/s
  ```
  The TypeScript propagator carries secular rates and asserts per-planet ceilings that hold at every epoch 1800–2150 (`src/sim/orbitMath.accuracy.test.ts:105-115`): Mercury 10 k, Venus 20 k, Earth 20 k, Mars 120 k km — so for the three innermost planets the backend is 1.7–22× above those ceilings (Mercury 56 k vs 10 k at 2025, 221 k at 1900; Earth 35 k vs 20 k), while for Mars and the giants it is within the TS ceilings near today. `knownLimitations` says only "catalog two-body orbital elements rather than a high-fidelity numerical ephemeris". The `earth` body is the Earth–Moon barycentre element set. Effect on planning is small in the cases I measured (Earth→Mars per-cell Δv difference vs the ERFA ephemeris over the best 500 cells: mean −0.001, σ 0.006, max 0.052 km/s; Earth→Jupiter min v∞dep 8.707 vs 8.705 km/s) — hence Low: the issue is that the error budget is unpublished and the two halves of the app use different ephemeris models.
- Impact: Positions the planner reports will not coincide with what the (live) 3D scene shows for the inner planets (frontend has rates); anyone using the API beyond illustrative Δv gets 10⁴–10⁷ km errors with no warning.
- Fix: add the Standish rates (`a_dot…L_dot`) that already exist in the frontend planet data (`src/data/planets`) to `bodies.py` (or generate both sides from one JSON) and use them in `orbital.py:106-114`; publish the 2025–2050 maxima above in `/trajectory/capabilities.knownLimitations`; add a pytest that bounds the error against the same fixture (the TS test is the template).
- Prior: NEW (K-52 `auto` provider part is FIXED — see Prior section).

### F-TRJ-10 — Lambert "certificate" checks only time of flight: acos-based transfer angle returns certified garbage near 180° and 0°; exit tolerance leaves up to ≈ 400 km
- Severity: Low   - Class: VERIFIED   - Reach: BACKEND   - Effort: S
- Where: `backend/trajectory/lambert.py:499-500` (angle), `:596,607` (exit at `|f| ≤ 1e-4 d`), `:34`
- Evidence:
  ```
  lambert.py:499  cos_theta = max(-1.0, min(1.0, sum(r1[idx] * r2[idx] ...) / (r1_mag * r2_mag)))
  lambert.py:500  theta = math.acos(cos_theta)
  ```
  `near180.py` (r1 = 1 AU, r2 = 1.52 AU, TOF = 1.25 × Hohmann, DOP853 propagation of the returned v1): θ−180° = 1°: 1.9e-4 km; 1e-2°: 5.9 km; 1e-3°: 139 km; 1e-4°: 1.56e5 km; 1e-5°: 2.3e6 km; 1e-6°: **2.0e8 km (1.3 AU)** with `rootResidualDays ≤ 3e-10` in every case; tightening `tol_days` to 1e-10 changes nothing. Same near 0°/360°: fine to 1e-5°, then 6.1e8 km at 1e-6° (`near0.py`). Replacing the two lines by `theta = math.atan2(vector_length(cross), dot)` (in-memory patch, `near180_fix.py`) gives ≤ 12 km for 1e-2…1e-5° and 51 km at 1e-6°. Elsewhere the solver is excellent: 65 non-degenerate cases median arrival error 0.004 km, p90 71 km, max 397 km — all ≤ 1.2 × (v × 8.64 s), i.e. limited only by the `1e-4`-day exit tolerance that callers cannot tighten (`LAMBERT_ROOT_TOLERANCE_DAYS` is an *upper* bound); 15 degenerate/extreme inputs return `None` (never garbage, never raised): θ = 180° exactly, θ within 1e-8°, TOF ≤ 5 d for Earth→Mars geometry, TOF 1e6 d.
- Impact: low in practice — on a 25,551-cell Earth→Mars grid the closest cell to 180° was > 0.1° (max |Δ total v∞| vs Izzo 4.4e-5 km/s) — but the response labels `rootBracketed: true, rootResidualDays: 1e-10` on a solution that misses r2 by 10⁵–10⁸ km, and the MGA root-refinement loop (`mga.py:663-721`) can land arbitrarily near 180°.
- Fix: `lambert.py:499-500` → `cross = vector_cross(r1, r2); theta = math.atan2(vector_length(cross), dot)` then apply the existing sign flip; add a final self-check in `compute_lambert_leg_from_state_vectors` that propagates the returned v1 with the already-available universal-variable f/g series and rejects if `|r_end − r2| > 1e-9 AU`; lower the default `tol_days` to 1e-8 (Illinois converges in ≤ 3 extra evaluations).
- Prior: NEW (K-27 itself is FIXED).

### F-TRJ-11 — Containment residuals: sustained duty cycle, biased truncation, advertised grid cap unreachable
- Severity: Low   - Class: VERIFIED   - Reach: BACKEND   - Effort: S
- Where: `backend/server.py:1050-1055` (60 req/min), `:2586-2623` (unique-state check), `:3543-3546` (capabilities); `backend/trajectory/lambert.py:989-1002` (row-major scan)
- Evidence: per-request limits genuinely hold (see Strengths), but (a) the rate limit is 60/min per peer while one worst-case porkchop costs 1.07 s CPU, so one peer can keep one core ≈ 100 % busy (`/health/live` median latency 2.1 ms idle → 41–75 ms median, p95 ≈ 150 ms under 3 hammering clients, `health_under_load.py`/`hang_probe2.py`); (b) when the deadline fires the scan stops row-major, so a truncated porkchop contains only the earliest departures (`deadline_test.py`: 265 of 1,881 cells, `best` = best of the first 265 only) and the response is HTTP 200 with `truncated:true` — correct flag, but `best` is not window-best; (c) `/trajectory/capabilities` advertises `maxPorkchopGridPoints: 2000` but `server.py:2608-2623` requires `D + D·T ≤ 2000`: a 100×20 grid is rejected with 413 "exceeds the unique-state computation budget", the largest near-square grid is 99×19 = 1,881. One unreproduced observation: in 2 of my first 6 sustained-load runs a client saw no response for ≥ 20 s on one request; 25 further runs (≈ 8,000 requests, with thread-dump instrumentation) showed none, so I treat it as harness/CPU-contention noise (the machine was at load ≈ 7 on 4 cores).
- Impact: none exploitable; documentation/limits drift only.
- Fix: scan departures in a strided order (or coarse-to-fine) in `scan_porkchop_window` so a truncated result samples the whole window; publish `maxPorkchopCells = floor(2000/(1+T))` in capabilities or relax the unique-state estimate; add a per-peer CPU-seconds budget to `_TrajectoryRateLimitMiddleware` if the server ever binds beyond loopback.
- Prior: K-52 ("porkchop CPU unbounded") FIXED-ON-HEAD.

### F-TRJ-12 — Labels and docs: `pathLengthAu` is a chord, "feasibilityCertified" is a numeric acceptance flag, README describes planner UI that is not shipped, flyby periapsis uses mean radii
- Severity: Low   - Class: VERIFIED   - Reach: DOC + BACKEND   - Effort: S
- Where: `backend/trajectory/lambert.py:782,792`; `backend/trajectory/mga.py:53,943`; `README.md:18,293-299`; `agent-notes/TRAJECTORY_AMPLIFICATION_DEFENSE_IN_DEPTH_PLAN_2026-09-25.md:7`
- Evidence: (a) `units_e2e.py`: Earth→Mars 210 d leg, `pathLengthAu = 2.4927` = chord; integrated arc length of the returned conic = 3.2224 AU (29 % low); disclosed in `knownLimitations` (`server.py:3693`) and `pathMetric` but the field name remains; it also drives the beam key (F-TRJ-04). (b) `mga.py:943` sets `"feasibilityCertified": True` on every direct Lambert route; it means "TOF residual ≤ 1e-4 d", not a proof. (c) `README.md:293-299` documents "Direct" mode and "Plan Route … up to 2 gravity-assist flybys" as app features; `index.html` contains no planner UI, and the API allows 3. (d) `MIN_FLYBY_ALTITUDE_KM = 300` is applied to catalog *mean* radii for every body: Jupiter 69,911 + 300 = 70,211 km < IAU equatorial 71,492 km, Saturn 58,532 < 60,268 km — periapsis can sit inside the 1-bar level (max turn 161.0° vs 158.4° at v∞ = 5 km/s, my calc). (e) the plan document still says "**Status:** implementation plan; no production behavior changed yet" (line 7) although phases 1–2 shipped. (f) Frontend TS interface `PlannerSearchStatus.topologySpaceExhaustive` (`plannerController.ts:56`) is never emitted by the backend.
- Impact: minor misreading risk; nothing numerical.
- Fix: rename to `endpointChordSumAu` (keep `pathLengthAu` as deprecated alias for one release); rename `feasibilityCertified` → `toleranceCertified`; correct README:293-299 (backend API only, up to 3 assists, 3 objectives); use equatorial radii (add `equatorial_radius_km` to `bodies.py`) for gas giants; update plan status line.
- Prior: NEW.


## Prior issues in my area

- **K-18** (backend contract side): FIXED-ON-HEAD. `src/frontend/features/trajectory/localPlanner.ts:6-60` now builds a coplanar Hohmann leg from circular/transfer speeds (no chord velocity) and evaluates only the direct topology (`:182-186`, comment "not physically valid endpoint velocity vectors"). Backend contract verified end-to-end: `units_e2e.py` recomputes `deltaVDepartureKmS/ArrivalKmS` from the returned AU/day velocity vectors to 1e-6 km/s (3.831068 / 4.894384) and matches Izzo; request JD in days (TDB), positions AU, velocities AU/day, Δv km/s; `stateContract` returned with every leg.
- **K-27**: FIXED-ON-HEAD (ea54bea 2026-09-24 "certify Lambert root convergence": `lambert.py:596` returns `None` unless `best_abs <= tol_days`; regression tests added in 931faae, `test_lambert_solver_reference.py:~190-213`). Re-run (`k27.py`, Earth→Mars JD 2460600.5): TOF 2/5/10/15 d → `None` (HTTP 422 `trajectory_no_lambert_solution`); ≥ 20 d → `computedTofDays` equals the request within 4e-5 d and independent DOP853 propagation reproduces arrival to 0.0004–96 km. No fall-through path remains; iteration is capped (321 samples, ≤ 512 root iterations).
- **K-28**: FIXED-ON-HEAD / CHANGED (931faae "contain planning amplification"): `MAX_COMPLETED = 48` is now a post-dedupe retention cap on *completed* routes sorted by score (`mga.py:975-985`), beam is global 12 / ≤ 2 per prefix with diversity-first selection (`mga.py:599-646`), depth quotas 128/768/1,408/2,000. Measured: Earth→Mars `max_assists=3` tries Venus, Mercury, Jupiter and Saturn and explores depths 2 and 3. Successor limitations in F-TRJ-04.
- **K-29**: FIXED-ON-HEAD (3f3b787 2026-09-24 "enforce unpowered flyby continuity"): `_evaluate_flyby` (`mga.py:489-557`) rejects |v∞out| ≠ |v∞in| beyond max(1e-3 km/s, 1e-4 rel.), uses the *incoming* v∞ for the turn limit, and a root-finder over the outgoing TOF finds continuity; every assisted route returned in my runs has mismatch ≤ 1e-3 km/s (e.g. `vInfMismatchKmS: 0.0`). Max-turn formula matches the closed form with JPL GM to 1e-3° for Mercury…Neptune (`flyby_check.py`). Powered flybys/DSMs are *rejected*, not charged (design choice, F-TRJ-04).
- **K-30**: CHANGED (8a3ba50 relabel): 3/3 scenarios `incomparable_reference`, 0 scored; artifacts still single-row, identical `captured_utc`, no state vectors, unprovenanced → F-TRJ-01.
- **K-31**: STILL-PRESENT → F-TRJ-02 (`mining_service.py:81`, `agents.py:480-486,533`).
- **K-52**: composite — (a) risk independent of feasibility: STILL-PRESENT (P_fail 0.000 with 46 km/s unmet Δv); (b) invented penalty constants: STILL-PRESENT (`risk_service.py:65-66`, `agents.py:531-532`); (c) `auto` chain never reaches Horizons / reports `'auto'`: FIXED — `auto` is a documented network-free alias for `kepler` (`ephemeris_service.py:1-7,460`), responses carry `ephemerisProvider:"kepler"`, `ephemerisProviderRequested:"auto"`, `ephemerisProviderChain:["kepler"]`, test `test_auto_is_network_free_and_pins_kepler`; (d) `epo/verifier.py` wrong nesting, 0/30: STILL-PRESENT (`verifier.py:31`) → F-TRJ-06; (e) `POST /trajectory/porkchop` CPU unbounded: FIXED-ON-HEAD (grid ≤ 2,000, 8 s hard / 7 s internal deadline, 2 concurrent, 60/min, measured 1.07 s CPU worst case); (f) default `/mission/plan` returns 422: STILL-PRESENT → F-TRJ-02.

## Strengths

- **Lambert solver accuracy is excellent in the operating domain.** 5,998 of 5,999 random cases (r 0.3–40 AU, θ 0.5–359.5°, TOF 0.15–4× Hohmann, ±20° inclination, both senses) agree with an independent Izzo solver to ≤ 1.4e-3 km/s (2 cases > 1e-3); 25,551 Earth→Mars cells agree to 4.4e-5 km/s; arrival error against DOP853 propagation has median 0.004 km; hyperbolic (z down to −8.7), retrograde, long-TOF (1e5 d) and 300-AU cases are correct; 15 degenerate inputs return `None` rather than garbage; median 0.37 ms/solve (`lambert_check.py`, `mc_lambert.py`, `fine_grid.py`). The Kepler-equation solver has residual ≤ 9e-16 for all e ≤ 0.999.
- **Planner physics matches independent truth.** Earth→Mars 2026 window: backend best v∞ 3.034 + 2.575 = 5.608 km/s (C3 9.20 km²/s², dep 2026-10-31, TOF 310 d) vs independent 3.036 + 2.572 = 5.608; min C3 9.15 (independent) — consistent with the literature minimum ≈ 9 km²/s² (the 10–15 band is a typical mission value). Earth→Jupiter 2022–2035 minimum v∞dep 8.707 km/s (C3 75.8) at JD 2462130.5 vs independent 8.705; Hohmann circular reference 8.79.
- **Honest, machine-readable limits.** `/trajectory/capabilities` publishes every ceiling plus `knownLimitations` (bounded approximate search, 0-rev only, chord path length, assist gain ≠ Δv, catalog Kepler); every plan carries `searchSpaceExhaustive:false`, `optimalityGuaranteed:false`, `terminationReason`, counters and per-stage budgets; results are byte-identical across processes and PYTHONHASHSEED values (`determinism.py`: 6 outputs × 3 seeds).
- **Containment is real and measured.** Worst accepted plan (Earth→Pluto, 3 assists, 1,257 leg evaluations) 0.92 s CPU, 4 KB; worst porkchop (99×19 = 1,881 cells) 1.07 s CPU, 164 KB; RSS 93–97 MB; a client disconnect at 150 ms stops server CPU at 0.19 s (vs 1.07 s) and the permit is free immediately (`disconnect_test.py`); 4 concurrent porkchops → 2×200 + 2×503 with `Retry-After: 2`; rate limiter returns 429 at the 51st request after 10 earlier ones; a 250 ms internal deadline yields HTTP 200 `truncated:true`, `terminationReason:"deadline_exceeded"` with best-so-far (plan 247 evaluations, 1 route; porkchop 265/1,881) (`deadline_test.py`). Ingress: 32 KB body cap with chunk accounting, strict Pydantic (`extra=forbid`), exact-type `PlanningContext`, request-owned semaphore tied to real worker exit.
- **Ephemeris contract discipline.** One provider pinned per request; frame/origin/orientation/time scale/units/corrections carried in every state and compared in `_validate_lambert_state_pair`; Horizons transport has absolute deadlines, a single global permit, a response-size cap, single-flight and a circuit breaker; `auto` never touches the network.
- **Benchmark loader integrity machinery** (SHA-256 per artifact, size caps, path containment, no-overwrite with `O_EXCL`, `incomparable_reference` instead of a fake failure) is careful and tested; the Horizons DE441 fixtures with recorded query/provenance (`scripts/fixtures/planet-positions-horizons.json`) are exactly the kind of oracle the repo's `TESTING_NUMERICS.md` demands, and I used them as such.
- **Plan-to-code traceability.** `TRAJECTORY_AMPLIFICATION_DEFENSE_IN_DEPTH_PLAN_2026-09-25.md` states invariants, baselines (8,170 Lambert calls for Earth→Mars at 3 assists) and gates; the shipped code implements them (903 evaluations for the same request class here) and its own tests (318 passing in ≈ 12 s) lock them in.
- **Frontend client contract (UNREACHABLE but correct):** `index.ts` maps `{code, retryable, Retry-After, context}`, client timeouts (10/8/10/14 s) exceed server timeouts (8/6/8/12 s), no silent fallback for explicit providers, and `plannerController.ts:253-266` renders `truncated`, `terminationReason`, `optimalityGuaranteed:false`.

## Scores

| Dimension | Score | Basis |
|---|:-:|---|
| Build/test health (my area) | 4 | 318 targeted tests pass in ≈ 12 s; CI as a whole is red for non-trajectory reasons (briefing §2); EPO module untested |
| Type safety | 3 | Python 3.12, `from __future__ import annotations`, exact-type guards throughout; no mypy/pyright step seen in the workflow |
| Architecture/modularity | 3 | Clean `contracts → budget → lambert → mga → planner` layering; but validation is duplicated three times (`server.py` Pydantic, `contracts.py`, `mission/schemas.py`) and `ephemeris_service.py` is 60 % opt-in remote machinery |
| Correctness of live paths | 3 | `/trajectory/lambert|porkchop|plan` correct (Lambert/Δv verified to 1e-3 km/s); `/mission/plan` and `/benchmark/accuracy` wrong/vacuous (F-TRJ-01/02); HTTP 500 on extreme epochs |
| Physics/numerical fidelity AND labelling honesty | 3 | Solver and flyby model 5/5; Δv semantic, `pathLengthAu`, "strict" benchmark and mission closure mislabelled or wrong (F-TRJ-01/02/03/12) |
| Data integrity/provenance | 2 | Benchmark artifacts unprovenanced (F-TRJ-01); Kepler catalog lacks rates (F-TRJ-09); Horizons fixtures elsewhere are well-provenanced |
| Backend robustness/concurrency | 4 | Bounded, cancellable, typed outcomes, measured; deductions for the 500 path and duty-cycle (F-TRJ-05/11) |
| Security/operational exposure (my slice) | 4 | Body caps, rate limit, concurrency guards, report path confined to `my-notes/*.md` with exclusive create; Horizons egress opt-in and direct-Lambert only; server-wide hardening not assessed here |
| Performance | 4 | 0.37 ms per Lambert, ≤ 1.1 s worst-case request, 95 MB RSS; health latency degrades ~25× under sustained load |
| Test strategy | 3 | Strong contract/budget/cancellation tests; no independent physics oracle, mocked MGA oracle, tests that lock in vacuous benchmark and contrived mission (F-TRJ-08) |
| Documentation accuracy | 3 | Capabilities endpoint and plan doc are candid; README planner UI claims, stale plan status, benchmark naming (F-TRJ-12, F-TRJ-01) |
| Repo hygiene | 3 | `mission/epo/` dead scaffolding that cannot pass; otherwise tidy |

## Not inspected

- SPICE/tudatpy provider path (`_sample_spice`, `_load_spice`): tudatpy is not installed; read only.
- Live JPL Horizons responses: egress proxy denied CONNECT (403); parser validated only against repo fixtures (F-TRJ-07).
- Remaining parts of `server.py` (WebSocket sim, solar endpoints, auth profile, network middleware) — other reviewers; only the trajectory/mission/benchmark slice and its ingress middleware were read.
- Tests I executed but did not read: `test_trajectory_endpoint_budget`, `test_trajectory_contracts`, `test_lambert_state_contract`, `test_trajectory_entry_validation`, `test_benchmark_endpoint_budget`, `test_porkchop_core_bounds`, `test_compute_budget`, `test_mission_schemas`; `test_benchmark_report_overwrite` neither read nor run (writes to disk).
- Frontend `localPlanner.ts` beyond the Hohmann leg / direct-only logic, `plannerController.ts` beyond error/search-status handling (UNREACHABLE code).
- Absolute mission realism (propellant, ISRU yields) — only internal consistency and rocket-equation mechanics were assessed.
- Two transient client-side "no response for ≥ 20 s" events under sustained 3-client porkchop load were observed in 2 of my first 6 runs and not reproduced in 25 later instrumented runs (≈ 8,000 requests; F-TRJ-11); cause unknown (likely CPU contention from the concurrent full pytest run).


---

<!-- ======================= REVIEWER FEC ======================= -->

# FEC — live frontend core, orbital mechanics, data pipeline (`index.html → src/main.ts`)

Target: `main` @ 17d1e63 (`$S/main-wt`, read-only). All numbers below were produced by code I ran; scratch artefacts are in `$S/work/fec/`
(`S` = `/tmp/claude-0/-home-user-solar-system-realistic-sim/03138f8e-d899-5252-b93f-37b1d0c17ea7/scratchpad`). Line numbers are checked against 17d1e63.

Headline: the **planet propagation is correct to its documented accuracy and is guarded by genuinely independent ground truth**; the earlier moon-frame defects
(K-05/06/07) are fixed. The problems are (a) the README describing a much larger product than `index.html` ships, (b) a hidden-by-flag moon subsystem that is
partly wrong (retrograde node sign) and mostly mean-element-grade, (c) a 1,500-line `main.ts` with a worker, belts and per-frame work that cost more than the physics they carry,
and (d) a few live UX/scale bugs (Earth/Mars not pickable, "realistic scale" leaves Earth at 39x).

## 1. Scope & coverage

| File / artefact | LOC / size | Read |
|---|---|---|
| `src/main.ts` | 1,501 | fully |
| `src/constants.ts` · `src/textures.ts` | 162 · 470 | fully · partially (exports, `sunTexture`, executed it) |
| `src/frontend/app/{sceneSetup,bodyManager,stateStore,timeController,textureManager}.ts` | 228·171·184·94·74 | fully |
| `src/workers/modelWorker.ts` · `modelWorkerContract.ts` (+test) | 160 · 158 (+83) | fully (test: titles) |
| `src/sim/{orbitMath,catalog,solarSystemModel,moonEphemeris,sourceFrameOrbit,asteroidBelt,phase1AsteroidCatalog}.ts` | 371·763·255·567·374·255·826 | fully |
| `src/sim/kuiperBelt.ts` | 516 | partially (1–300 + solver/propagation call sites) |
| `src/data/planets.ts` · `asteroidCatalogLoader.ts` | 938 · 391 | fully |
| `src/data/moons.json` (424 rec) · `moonEphemerisChebyshev.json` (4.11 MB) · `stars_catalog.json` (172 kB) | — | analysed programmatically · analysed programmatically · usage only |
| `src/frontend/features/asteroids/{beltRenderer,catalogSourceStatus}.ts` | 668 · 59 | fully |
| `src/frontend/features/planetary/{quadtreeLOD,planetShaders}.ts` (outside list; needed for K-43/picking) | 186 · 376 | quadtree fully, shaders partially |
| `index.html` · `src/style.css` | 403 · 1,311 | fully (DOM wiring) · skimmed |
| `public/data/asteroid-phase1/*` (3.6 MB bin, meta, sample) | — | bin parsed record-by-record; meta fully |
| Oracles `src/sim/{moonFrameCheck,planetPositionCheck}.ts` | 767 · 492 | fully |
| Tests `planetPositions/moonFrames.horizons`, `orbitMath.accuracy`, `moonEphemeris` (160–240), `catalog`, `solarSystemModel`, `sourceFrameOrbit`, `orbitMath`, `phase1AsteroidCatalog`, `modelWorkerContract`, `stateStore`, `constants` | 111·171·180·240·82·48·215·33·333·83·46·33 | first two + accuracy fully; others by test titles |
| Scripts `generate_moon_ephemeris.py` (872), `verify-{moon-frames,planet-positions}.mjs` (263/205), `update-moons-data.mjs`, `ingest-moon-textures.mjs`, `run-ui-dev.mjs`, `dev-full{,-config}.mjs`, `build_asteroid_phase1_dataset.py` (455), `fetch_jpl_sbdb.py` (500) | | generator: header+`main()`; verify scripts: ran; builder/fetcher: relevant functions + greps; others fully |

**What I ran** (all in scratch; the target tree was not modified except an empty `node_modules/.vite-temp/` dir that Vite created when my scratch-copy vitest runs loaded a config through a symlinked `node_modules`):

| Command (abridged) | Outcome |
|---|---|
| `PLANET_POSITIONS_CACHE_DIR=$S/work/fec/cache_pp node scripts/verify-planet-positions.mjs --verbose` | exit 0; 8 planets x 6 epochs, total 3.692e7 km (budget 7.5e7) |
| `MOON_FRAMES_CACHE_DIR=… node scripts/verify-moon-frames.mjs --verbose --epochs` | exit 0; 140 rows, utilisation 50.0/100 |
| esbuild bundle of `orbitMath/catalog/moonEphemeris/solarSystemModel/constants/planets`, asteroid loader, belts, `beltRenderer`, `textures` → Node scripts `$S/work/fec/*.mjs` | all numerics below |
| astropy 8.0.1 `builtin` ephemeris (`$S/venv312`) reference at 12 TDB dates (1800…2500), heliocentric, ecliptic J2000 (`ref_planets.py`) | independent reference for planets and the Moon |
| Mutation study: 18 mutants + 1 repair applied to a **scratch copy** of `src/`, run through the repo's own vitest gates (cacheDir redirected) | §F-FEC-12 table; baseline 168/168 sim tests pass in 6.4 s |
| `vite build` of a scratch copy with `showMoons = true` | builds (7.7 s); +4.20 MB chunk (1.71 MB gz) loaded via top-level await |
| `grep -o 'self.onmessage' dist/assets/index-*.js` | 0 (worker bundle: 1) |
| DOM-id cross-check of the 37 live TS files vs `index.html` | 42 ids referenced, 0 missing |
| curl to `ssd.jpl.nasa.gov/api/horizons.api` | proxy 403 — could **not** re-fetch Horizons; `generate_moon_ephemeris.py --check` not run |

## 2. Findings

Counts: Critical 0 · High 1 · Medium 12 · Low 8. (No silently-wrong result on a *default live* path was found at Critical level; the physics that is shown by default — Sun + 8 planets + Pluto — is right to its documented accuracy.)

### F-FEC-01 — README "Highlights/Features" describe ≥12 things the live page does not do
- Severity: **High**  - Class: VERIFIED  - Reach: DOC (claims about LIVE)  - Effort: S (edit) / M (CI link-check)
- Where: `README.md:8,11,12,14,15,42,57,230,238,242-248,282,400`; counter-evidence `src/main.ts:147,183,424-441,658-660`, `index.html` (42 live ids).
- Evidence (claim → what the code does):
  1. L8 "424 moons" → `main.ts:147 const showMoons: boolean = false;` and `majorBodies` (`main.ts:658-660`) is star/planet/dwarf only: no moon is drawn, listed, counted or searchable.
  2. L12 "Catalog-driven background stars with proper-motion propagation" → `main.ts:424-441` draws 6,000 `Math.random()` points; `src/data/stars_catalog.json` (5,042 stars) has no importer (`reach.mjs`: only `moons.json` + `moonEphemerisChebyshev.json` are runtime-reachable JSON).
  3. L14/L282 "1.9M particles" → shipped catalog has 100,000 rows (meta `source_rows: 100000`); `main.ts:183` renders 50,000.
  4. L11 "jump-to-date" → `index.html` has only `#now-time` ("Jump to now"); no date input.
  5. L238 "Search all bodies by name" → searches 10 bodies (UI itself says "10 bodies").
  6. L230 "Display options: moons, asteroid belt, Kuiper belt, Oort cloud" → index.html toggles: orbits, magnetic field, labels, realistic scale. Oort code exists only in unreachable `animationLoop.ts`.
  7. L242-246 Earth 4K map / Moon & Mars albedo+relief / Saturn rings → no planet texture is loaded by live code (the only live `.load(` calls are the Sun's backend observation texture and an unused `loadHiResTexture`; `src/assets/textures`, 39 MB, is unreferenced; the quadtree shader is procedural) and `RingGeometry` appears nowhere in `src`.
  8. L248 "oblateness rendering" → `equatorialRadiusKm/polarRadiusKm` are consumed only by unreachable renderers.
  9. L247 "correct ecliptic-longitude pole directions" → false for 6 of 9 planets (F-FEC-13).
  10. L400 "asteroid close-up refinement under Sun/Jupiter/Saturn perturbations" → shader term ≤ 2 km, no refinement path is live (F-FEC-14).
  11. L42 `dev:ui -- --width/--height/--render-scale` → silently ignored (F-FEC-16).
  12. L57 "switch simulation engines in the UI dropdown" → no engine control in `index.html`.
- Impact: a competent second engineer reading the README expects a product (moons, catalog stars, 1.9M asteroids, textured planets, engine switch) that the page does not contain; the accurate parts of the README (physics notes L318-341, limitations L395-403) make the contradictions harder to spot.
- Fix: one README pass moving unwired capabilities to a "Present in code, not wired" section, correcting counts (100k rows / 50k drawn), deleting the dead `dev:ui` flags or wiring them; add a 20-line vitest that fails when a README bullet names an element id/feature flag absent from `index.html`.
- Prior: K-35 / K-02 STILL-PRESENT (line numbers moved; "moon toggle" claim now phrased as "424 moons").
- Adversarial check: tried to refute by (a) looking for URL-parameter feature flags (only `uiWidth/uiHeight/renderScale/maxPixelRatio`, three of which are unused), (b) checking for a second entry point (single `index.html → main.ts`), (c) checking `showMoons` can be overridden at runtime (it is a `const`). README's *Physics Notes* are honest and I did not count them. Several other README bullets (Earth satellites, nearby systems, route planner) are unreachable code owned by other reviewers and are not in my 12. Severity kept High: the Highlights list is the first thing a reader sees.

### F-FEC-02 — Node precession has the wrong sign for retrograde moons (285 mean-element moons + Triton)
- Severity: **Medium**  - Class: VERIFIED  - Reach: LIVE-GATED (`showMoons=false`) / DATA  - Effort: S (code) + M (re-baseline gate)
- Where: `src/sim/catalog.ts:442-468,474-475`; budgets that hide it `src/sim/moonFrameCheck.ts:163,171-173,283-285`; data `src/data/moons.json`.
- Evidence:
  ```ts
  const argRate  = precessionRateDegreesPerCentury(moon.apsisPrecessionYears, 1,  moon.periodDays);
  const nodeRate = precessionRateDegreesPerCentury(moon.nodePrecessionYears, -1, moon.periodDays); // same sign for i=28° and i=157°
  ```
  287/424 records have i>90° and *all* carry a positive `nodePrecessionYears`, so all get Ω̇<0 (285 ecliptic irregulars + Triton + Phoebe; Phoebe uses the fit). Physics: for a retrograde orbit Ω̇ ∝ −cos i > 0 (e.g. solar quadrupole, Pasiphae: +3.3°/yr vs table magnitude 4.5°/yr). Against the repo's own Horizons fixture (plane-normal error, deg, at `j2000 p30d p180d p1y p5y 2025 2026`; `node retro_check.mjs`):
  ```
  Pasiphae  shipped 8.2 7.9 8.6 10.7 19.5 50.9 49.4 | node sign flipped 8.2 7.9 8.0 8.3 6.0 7.7 7.3
  Sinope    shipped 5.2 5.4 4.3  5.2 12.5 42.0 42.7 | node sign flipped 5.2 5.4 4.1 3.5 3.6 3.5 2.1
  Carme     shipped 0.1 0.6 2.2  3.5  9.5 30.2 30.8 | node sign flipped 0.1 0.5 1.2 1.4 1.3 1.6 3.2
  Himalia (prograde control) shipped 2.3° @2025 | flipped 26.3°   Triton shipped 14.6° | flipped 5.6° | +0.5x|table| 0.49°
  ```
  The gate budgets for these rows are 101.9°, 84.0°, 61.7° (Pasiphae/Sinope/Carme) and 20° (Triton), justified in prose as "solar-perturbed, non-Keplerian" — i.e. they are sized to the bug. Applying the one-line repair (sign = −sign(cos i)) in a scratch copy makes the repo's gate **fail** (`Carme @2025: 4.786e7 km > 3.4e7`, `Triton @2025: 2.140e5 > 2.0e5`) even though plane error improves 7-19x, because position budgets were calibrated to the buggy output and phase (mean-motion, F-FEC-03) dominates position error.
- Impact: if moons are ever switched on, 68% of the catalog's orbit planes precess the wrong way (planes 30-51° off by 2025 for the three fixture irregulars); the CI gate cannot see it and rejects the fix. Triton additionally needs |rate| ≈ 0.5x the table value (best fit +52.9°/cy vs table 105.8°/cy).
- Fix: `catalog.ts:475` use `(moon.inclinationDeg ?? 0) > 90 ? +1 : -1` for the node direction; re-baseline `POSITION_BUDGET_KM`/`PLANE_BUDGET_DEG` rows for Pasiphae/Sinope/Carme/Triton to measured-with-fix values (plane budgets ≤10°); for Triton prefer adding it to `generate_moon_ephemeris.py` `TARGETS` (Horizons fit) over rate-tweaking.
- Prior: NEW (K-49/K-05 family; the apsis sign was tested and should stay +1: flipping both made e-vector error worse at 5 yr, 69°/55°/83° vs 10°/8°/12°).
- Adversarial check: refute attempts — (1) sign handled elsewhere? `resolveKeplerOrbitAtElapsedDays`/`sourceFrameOrbit` apply the rate as given; (2) JPL table might already be signed? 0 of 424 negative; (3) maybe truth is non-Keplerian? Flipping lowers plane error 7-19x for all three independent retrograde irregulars while a prograde control (Himalia) gets worse — a sign effect, not noise. Positions do **not** improve (phase lost: documented 2.4-3.9% mean-rate errors), so I claim plane-normal only. Reach is gated off, hence Medium not High.

### F-FEC-03 — Only 4 of 424 moons are ephemeris-grade; Io/Europa/Moon/Triton lose phase within weeks (documented, hidden)
- Severity: **Medium**  - Class: VERIFIED  - Reach: LIVE-GATED / DATA  - Effort: L (more fits) / S (keep hidden)
- Where: `src/data/moonEphemerisChebyshev.json` (titan, iapetus, phoebe, cordelia; JD 2451545.0–2469807.5); `catalog.ts:38`; `moonFrameCheck.ts:241-287`.
- Evidence (repo's own gate, `verify-moon-frames.mjs --epochs`, km at `j2000 p30d p180d p1y p5y 2025 2026`):
  ```
  Io      8.3e2 3.2e5 6.1e5 8.4e5 8.4e5 8.4e5 3.2e4   (a = 4.2e5 km: error = 2.0 orbit radii)
  Europa  4.0e2 4.9e5 1.1e6 1.3e6 6.9e5 5.5e5 1.1e6   (a = 6.7e5 km)
  Moon    4.4e3 3.1e3 8.4e3 6.6e3 4.5e3 1.9e4 4.0e3   independent: vs astropy moon98 19,402 km (2.9°) at 2025-01-01, 26,264 km at 2050, 77,855 km (11°) at ~2190
  Triton  2.5e4 …  1.25e5 (plane error 15°, F-FEC-02)
  ```
  The shipped fit costs 4.11 MB compact JSON (1.74 MB gz) for 4 bodies: each SAT441-class moon is 571 segments x 9 features x 13 coeffs = 66,807 numbers ≈ 1.2 MB; `generate_moon_ephemeris.py` lists the SAT441 extension (11 more moons ≈ 13 MB) but not the cost.
- Impact: none by default (moons hidden); if enabled, the visible Galilean moons and the Moon would be wrong by up to 2 orbit radii / 3°, and enabling costs a 4.2 MB top-level-await chunk (measured with `showMoons=true`: +4,201 kB, 1,709 kB gz) before first render.
- Fix: add Io, Europa, Ganymede, Callisto, Moon, Triton to `TARGETS` (S per body) **and** change the artifact to float32/binary or longer segments before doing so (≈7 MB more JSON for those six otherwise); replace the top-level `await import` (L148-152) with a lazy `import()` on first moon enable.
- Prior: K-49/K-05 family, STILL-PRESENT but now honestly documented (`DATA_LIMITED`).
- Adversarial check: errors reproduced independently (astropy for the Moon; repo fixture for the rest); not a propagator bug — periodDays semantics measured by the authors (`catalog.ts:395-433`).

### F-FEC-04 — Double-click "follow" cannot select Earth or Mars
- Severity: **Medium**  - Class: VERIFIED  - Reach: LIVE  - Effort: S
- Where: `src/main.ts:324-329,1296-1317`; `src/frontend/features/planetary/quadtreeLOD.ts:94-111` (`createMesh`).
- Evidence: Earth and Mars are `mesh = quadtree.group` (a `Group` of chunk meshes, `bodyId` on the Group only); picking is non-recursive:
  ```ts
  const targets = [...bodyMeshes.values()].filter((m) => m.visible);
  const hits = raycaster.intersectObjects(targets, false);   // Group.raycast is a no-op
  ```
  `node raycast_group.mjs` (three r182): `Group, recursive=false → hits = 0`; plain Mesh planet → hits = 1. (`recursive=true` is not a fix: the chunk meshes are flat `PlaneGeometry(1,1)` faces of a **unit cube** in group space — the sphere and `uRadius` exist only in the vertex shader (`planetShaders.ts:173`) — so a CPU ray would test a 1-AU cube, and the chunks carry no `bodyId`.)
- Impact: the hint "Double-click follow body" (`index.html`) silently fails for the two bodies users click first; Sun and other planets work.
- Fix: add an invisible `SphereGeometry` pick proxy (radius = current body radius, `userData.bodyId` set, `visible=true` but `material.visible=false`) to each quadtree body — or do an analytic ray–sphere test against `bodyBaseRadiusAu(body)` for the two quadtree bodies — and keep `intersectObjects(targets, false)`.
- Prior: NEW.

### F-FEC-05 — "Realistic scale" leaves Earth at 39x and Mars at 2x; labels and focus floor are not rescaled (K-43)
- Severity: **Medium**  - Class: VERIFIED (code + arithmetic; not visually probed)  - Reach: LIVE  - Effort: M
- Where: `src/main.ts:324-329,371-373,586-588,700-718`; `quadtreeLOD.ts:138-150` (radius baked into `uRadius` at construction, `planetShaders.ts:368`).
- Evidence:
  ```ts
  if (mesh.userData.isQuadtree) { /* comments only: "we assume quadtree LODs aren't strictly changed scaling post-init" */ }
  else mesh.scale.setScalar(bodyBaseRadiusAu(body));
  ```
  `node scale_mode.mjs`: display/real radius — Sun 81x, Mercury 1272x, Venus 808x, Pluto 11x, **Earth 39x and Mars 2x stay at display size** (quadtree). Label offset `radius*2.5+0.03` is computed once at start (display radius): Earth label sits 0.0342 AU = 802 real radii above the planet in realistic mode. `focusBody` floors the camera at 0.01 AU, giving Earth an apparent diameter of **9.1 px** (1080 px, 58° fov). (Side effect worth knowing: because `applyDisplayScaleConstraints` shrinks a planet's display radius to 0.65x its innermost *hidden* moon's orbit, Jupiter/Saturn/Uranus/Neptune are already ≈1.0-1.2x real in default mode, so the toggle mainly changes Sun/Mercury/Venus/Pluto.)
- Impact: the "Realistic scale" checkbox is wrong for the one planet people care most about, and focus/label behaviour contradicts it.
- Fix: give `PlanetQuadtree` a `setRadius()` (update `uRadius`/`uDisplacementScale`, rebuild nodes), re-position labels in `applyScaleMode`, scale the focus floor by `useRealisticScale` (e.g. `max(radius*20, 1e-5)`).
- Prior: K-43 STILL-PRESENT (magnetic-field part is in sunController, not examined).

### F-FEC-06 — ≈1.3 s of synchronous startup JS before the first canvas frame, then 0.4-0.8 s of jank when the catalog arrives
- Severity: **Medium**  - Class: VERIFIED (Node/V8 CPU time; browser not measured)  - Reach: LIVE  - Effort: S-M
- Where: `src/main.ts:246-254` (`generatePlanetTexture('sun')` → `src/textures.ts:131-140`), `:459,471` (procedural belt), `:510-563` (catalog swap).
- Evidence (`tex_cpu.mjs`, `phase1_load.mjs`, `catalog_cost.mjs`; CPU ms ≈ wall):
  ```
  sun procedural texture (1024x512, 13-octave fbm/pixel): 1016 / 1207 / 948 ms
  createSolarSystemCatalog() first call 48 ms (424 hidden moons built)
  generateAsteroidBelt(50k procedural) 125 ms + createAsteroidBeltRenderer 66-111 ms   <- replaced ~1 s later
  on catalog arrival: load+parse+SHA-256 232-484 ms, select 50k 100-224 ms, new renderer 66-169 ms (single task)
  ```
  The procedural belt is built unconditionally and discarded when the verified catalog is accepted; 100,000 rows are parsed but only 50,000 are used (`main.ts:183-184`, diameters 939 km → 4.7 km kept, 4.7 → 2.8 km discarded).
- Impact: black canvas for ≥1.3 s of pure CPU on a desktop-class core (3-5x on phones) on top of the 925 kB (233 kB gz) bundle, plus a visible hitch when the catalog lands.
- Fix: replace the runtime fbm with a shipped 512x256 texture (or generate in a worker/`OffscreenCanvas`); create the procedural belt lazily only on rejection/failure; set `maxRecords` to 50,000 (or split the .bin) and build the 50k renderer in idle chunks.
- Prior: NEW.

### F-FEC-07 — 5,000 Kuiper objects re-propagated and re-uploaded every frame (also while paused); HUD rewrites 3 DOM nodes/frame
- Severity: **Medium**  - Class: VERIFIED  - Reach: LIVE  - Effort: S
- Where: `src/main.ts:1405-1410`, `beltRenderer.ts:603-624`, `timeController.ts:74-87`, `main.ts:1443-1446`.
- Evidence: `propagateKBOPositions(5000)` CPU 2.39 ms/frame + `updatePositions` matrix compose 0.20 ms + `instanceMatrix` upload 313 KiB/frame = ~15% of a 60 fps frame. A typical KBO (P≈90,000 d) moves 2.7e-4° per frame at 4 d/s (8e-3° at 120 d/s). The call is unconditional: not gated on `simState.paused` or on |ΔJD|. `updateHud()` assigns `textContent` ×2 + `dateTime` and re-runs `formatJulianAsDate` (leap-second table walk, `new Date`) every frame; `statusZoom` adds a fourth write.
- Impact: ~2.6 ms/frame CPU + GPU upload for imperceptible motion; battery/thermal cost on laptops.
- Fix: skip when `paused` or when `|JD − lastKboJd| < 0.5 d` (KBO motion is invisible below ~1 d at default zoom), or move KBOs into the same GPU Kepler shader as the main belt (K-15 note: use a relative-JD uniform); write HUD text only on change.
- Prior: NEW.

### F-FEC-08 — The model worker costs ≈640 LOC and a second code path to offload 8 µs of work
- Severity: **Medium**  - Class: VERIFIED  - Reach: LIVE  - Effort: M
- Where: `src/main.ts:168-182,741-1049`, `src/workers/modelWorker.ts`, `modelWorkerContract.ts`; fallback `bodyManager.ts:72-116`.
- Evidence (`catalog_cost.mjs`): `SolarSystemModel.update` for the 10 live bodies = **8.3 µs/frame**; for all 434 bodies including moons (mean elements) = 464 µs/frame; Chebyshev moon states 3-5 µs/call. Cost of the offload: 160 (worker) + 158 (contract) + 309 (`main.ts` bridge, snapshot-age heuristics, fallback) + 15 (module-level worker state) ≈ 640 LOC + 83 LOC contract test, one-frame-stale planet positions, and two state→scene mappings that already diverge: the worker path restores `node.visible = true` (`main.ts:995`) while the fallback `updateSceneBodiesFromModel` only ever hides non-moons (`bodyManager.ts:88-91`), so a required-ephemeris moon that leaves 2000-2050 coverage and re-enters stays hidden on the fallback path only.
  Robustness is good (see Strengths: one tick in flight, schema/length checks, stale snapshot → main-thread fallback, `onerror` terminates the worker) — but the worker never gets a "stopped replying" timeout: if a tick is dropped (e.g. `modelWorker.ts:94-102` early `return`s without a reply) `modelWorkerTickInFlight` stays true forever and the app silently runs on the fallback path with no log.
- Impact: maintenance and test surface far above the benefit; latent divergence between the two paths.
- Fix: delete the worker (keep the contract tests as unit tests of `SolarSystemModel`) or, if kept for the moon load, add a 250 ms in-flight timeout that terminates + logs, and unify the scene-update code so there is one visibility rule.
- Prior: K-04 FIXED, K-39 FIXED (kept as strengths); this finding is NEW.

### F-FEC-09 — `main.ts` has re-grown into a 1,501-line, export-less monolith while 1,006 LOC of extracted siblings sit dead beside it
- Severity: **Medium**  - Class: VERIFIED  - Reach: LIVE  - Effort: L
- Where: `src/main.ts` (whole file); dead siblings `src/frontend/app/{animationLoop,cameraController,labelSystem,uiBindings,inputHandler}.ts` (213+207+275+274+37 = 1,006 LOC, `reach.mjs`: UNREACHABLE).
- Evidence: 1,083 lines at 2026-03-07 (`ea3948b`) → 1,453 (`bbc274d`, 2026-09-24) → 1,501 now (+39%). Counts: 0 exports, 16 module-level `let`s (8 are worker state), 38 functions, 58 `const`s, 25 `addEventListener`s, 11 `sunCtrl.*` entry points, 9 `console.*`. Concerns owned: DOM binding, scene assembly, orbit lines, belts + catalog lifecycle, camera focus/follow/clip planes, body list/info panel, scale mode, worker protocol + model state, panel/a11y focus trap, AGN UI, rAF loop, teardown. `main.ts` re-implements what `animationLoop/cameraController/labelSystem` were extracted to do (own label sprites L279-302, focus/follow L574-634, `animate` L1395) while those files are never imported. Nothing in `main.ts` is unit-testable without a DOM + WebGL; `src/main.ts` has **0** tests.
- Impact: every change touches one file; the live extracted modules (`timeController`, `sceneSetup`, `bodyManager`, `stateStore`, `textureManager`, ≈750 LOC) show that the approach works, but the dead copies invite editing the wrong file.
- Fix (scoped, in order): (1) `modelBridge.ts` (L741-1049 → pure functions + a class; unit-test staleness logic), (2) `beltManager.ts` (L457-572; owns catalog load, swap and `setScaleMode` re-apply), (3) `panelController.ts` (L1096-1193), (4) delete the five dead `frontend/app` files or wire them; export `bootstrap()` so a jsdom/headless smoke test can import it.
- Prior: K-37 STILL-PRESENT (1,083 → 1,501 lines).

### F-FEC-10 — H29 "metric kinematics" live inside the standard orbital model: frame-rate dependent, non-integrating, runs while paused, no dt clamp
- Severity: **Medium**  - Class: VERIFIED  - Reach: LIVE (only while an H29 event is active)  - Effort: M
- Where: `src/sim/solarSystemModel.ts:169-202`; callers `src/main.ts:834-848`, `src/workers/modelWorker.ts:104-140`; loop `main.ts:1397-1401`.
- Evidence (`k40.mjs`, constant β=1e-6 to isolate the integrator): Earth displacement from its Kepler position after ONE frame — 120 fps 16.70 AU · 60 fps 33.40 AU · 30 fps 66.80 AU · 10 fps 200.4 AU; after 60 consecutive 60-fps frames at the same JD it is still 33.40 AU (positions are re-derived from Kepler every `update()`, the shift is applied once on top, so nothing accumulates); a 5-minute background-tab gap (`deltaSeconds` is not clamped, `main.ts:1397`) gives 6.0e5 AU. `deltaSeconds` is passed regardless of `simState.paused` (`advanceLocalTime` only skips the JD), and the AGN timeline/solar shaders use the wall clock (`sunCtrl.update(simState.julianDate, timestamp*0.001)`).
- Impact: while an H29 event is running, planet positions are a frame-rate-dependent strobe, not a displacement field; pause does not stop it. Gated: `getWarpState()` is null unless H29 is selected, which is labelled speculative in the UI.
- Fix: clamp `deltaSeconds` (≤0.1 s) in `animate`; integrate the displacement in `SolarSystemModel` state (or make it a pure function of event time, not of dt); move the warp transform out of `SolarSystemModel` into the AGN module (the standard model should not know the word "Alcubierre").
- Prior: K-40 (model side) STILL-PRESENT.

### F-FEC-11 — The "verified Phase-1 catalog" carries synthetic taxonomy/albedo and 3-significant-figure periods
- Severity: **Medium**  - Class: VERIFIED  - Reach: LIVE / DATA  - Effort: M
- Where: `scripts/build_asteroid_phase1_dataset.py:118-138,214`; `scripts/fetch_jpl_sbdb.py:148` (`"full-prec": "false"`); `src/sim/phase1AsteroidCatalog.ts:332-341`; UI text `catalogSourceStatus.ts:25-31`.
- Evidence (`ast_check.mjs` on the shipped `.bin`; SHA-256 and FNV-1a32 in the meta both match — integrity chain is intact):
  ```
  taxonomy counts C 66,362 / S 14,009 / M 19,629 (M = 19.6% vs the 8% the repo's own comment cites)
  records whose taxonomy equals the pure a-rule (S<2.5, M 2.5-2.7, C>2.7 AU): 99,066 / 100,000 (99.07%); M within 2.5-2.7 AU: 98.4%
  distinct albedo values: 3 (0.065, 0.16, 0.14 = the taxonomy midpoints)
  stored period vs Kepler-3rd-law(a): max 0.459%, mean 0.145%; 131 distinct period values over 100,000 rows (3 s.f.: Ceres 1680, Vesta 1330 vs 1325.75)
  mean-anomaly phase difference after 100 yr: median 10.3°, p95 26.6°, max 52.1°
  ```
  Colours shown on the belt are a function of the semi-major axis for 99% of rows but are presented under "Asteroids: verified Phase-1 catalog (100,000 rows, SHA-256)". The SHA-256 verifies that the .bin matches its same-origin sidecar (corruption check), not the science.
- Impact: belt colour banding reads as composition; positions away from epoch 2461000.5 (44 rows have epochs up to 15.8 yr earlier) drift visibly after decades. At today's date (0.87 yr after the epoch) the worst-case period error is ≈0.45°.
- Fix: re-fetch with `full-prec=true`; derive `periodDays` from `a` (`2π/k · a^1.5`) at load time as an immediate S fix; restrict colour mapping to rows with real `spec_B/spec_T` and render the rest neutral; reword the status line to "integrity-checked".
- Prior: K-17 and K-46 STILL-PRESENT (same numbers).

### F-FEC-12 — The ground-truth gates are real and effective, but five blind spots remain
- Severity: **Medium**  - Class: VERIFIED  - Reach: CI / TEST  - Effort: M
- Where: `src/sim/planetPositionCheck.ts:42-95`, `moonFrameCheck.ts:98-174,241-287`, `moonEphemeris.test.ts:163-193`, `planetPositions.horizons.test.ts`.
- Evidence — independence first: the two `*Check.ts` modules contain no orbital mechanics (only subtraction/angles/budgets; the propagator is injected as `PropagateFn`). Fixtures are real: `planet-positions-horizons.json` vs astropy plan94/epv00 (independent of Standish): ≤8.6″ Mercury–Mars, ≤71″ giants at all 48 rows (`fixture_vs_astropy.mjs`; a fixture derived from the shipped Standish code would sit at arcminutes); `moon-positions-horizons.json` Moon vs astropy moon98 ≤8.5 km (≤4.4″) at 7 epochs. Mutation study on a scratch copy (repo vitest, 168 sim tests, 6.4 s/run):

  | mutant | result |
  |---|---|
  | apsidal double-count, ecliptic branch / native-frame branch | killed (2 / 5 tests) |
  | planets without tabulated Ldot | killed (68) |
  | node-rate sign flipped for all moons / Uranus pole not negated / velocity node term dropped | killed (9 / 4 / 1) |
  | Chebyshev: ω dropped / rate x1.00001 / no cross-fade | killed (5 / 6 / 1) |
  | Mercury Ldot +0.01°/cy · +0.05 · Earth M0 +0.2° · drop 2017 leap second | killed (3 · 9 · 10 · 1) |
  | `orbitNormalFromElements` sign flip (K-05's original bug) | **survived** — dead code, see F-FEC-18 |
  | Chebyshev ascending↔descending node swap | survived — equivalent mutant (Ω+ω invariant) |
  | **Titan segment 100 `aKm` ×1.002 (+2,400 km = 48× the stated 50 km limit)** | **survived**; same edit in segment 285 (covered by the 2025 fixture epoch) is killed |
  | **Saturn Ldot +0.38°/cy (the "periodDays rounding" defect the file header motivates)** | **survived**: errors stay at 41% of budget (`saturn_margin.mjs`: passes up to ≈+0.38, fails at +1.0; Jupiter/Uranus/Neptune fail at +0.1) |
  | repair for F-FEC-02 | gate **fails** (Carme/Triton position rows) |

  Blind spots: (1) the Chebyshev artifact's accuracy block is self-reported (`moonEphemeris.test.ts:163-193` asserts numbers read from the JSON itself; `heldOutRowsSha256` hashes rows that are not shipped); independent fixtures sample 7 of 571 segments per body (1.2%); the byte-compare `generate_moon_ephemeris.py --check` needs the network and is not in CI. (2) Saturn tolerance (1.3e7 km ≈ 31′; measured worst 6.2e6 km ≈ 14-15′). (3) Ganymede/Callisto budgets are 380-3,600× the current error (2025: 2.4e6 vs measured 6.6e2 km; 1.2e6 vs 3.1e3 km) although their `tightenTo` values are already measured in `DATA_LIMITED`; plane budgets of 61.7-101.9° for irregulars (F-FEC-02). (4) Budgets are "2x the shipped propagator's error" (`POSITION_BUDGET_KM` comment), so the gate is a regression lock, not an accuracy claim; `UTILISATION_BUDGET` 100 vs measured 50. (5) The header comment of `planetPositionCheck.ts:42-80` documents budgets 60× looser than the real ones (Mercury 3.7e5 vs 6e3 km) and an old "buggy tip" — stale. Also: no fixture-regeneration script exists for the three `scripts/fixtures/*.json` (only a header string; `grep` finds no producer), contradicting `TESTING_NUMERICS.md` "regenerable"; Pluto has no fixture and is ungated; planet velocities are not gated (`planetPositionCheck.ts:277` passes `null`) although the fixture carries them — I measured 0.005-0.40% relative velocity error (Mercury 0.005%, Neptune 0.40%), fine but unguarded.
- Impact: the strongest part of the repo can still miss a localized data corruption of the shipped moon fit and a Saturn-only rate regression, and it blesses known-wrong moon planes.
- Fix: (a) ship a 300-row held-out CSV per fitted moon (≈15 kB) and test it, plus a SHA-256 of the canonical coefficient payload; (b) install the `tightenTo` budgets for Ganymede/Callisto/Io/Europa now; (c) tighten Saturn using a Table 2 (b,c,s,f) model or at least a Saturn-specific drift budget of 2e6 km; (d) add `scripts/fetch_horizons_fixtures.py` writing the three fixtures with a recorded SHA-256; (e) refresh the stale comment blocks.
- Prior: NEW (the original K-items about single-epoch tests are fixed — see Strengths).

### F-FEC-13 — Planet spin axes do not follow IAU poles; Venus, Uranus and Pluto rotate the wrong way
- Severity: **Medium**  - Class: VERIFIED (vector math + Three.js transform replicated; not visually probed)  - Reach: LIVE (visible on Earth/Mars/Sun surfaces)  - Effort: S-M
- Where: `src/main.ts:308-318,722-737`, `src/data/planets.ts` (`axialTiltDeg` / `spinAxisLongitudeDeg` / `rotationPeriodHours`).
- Evidence (`spin_vec.mjs`, `spin_sense.mjs`): angle between the scene's angular-velocity vector and IAU WGCCRE-2015 (pole RA/Dec, sign of dW/dt):
  ```
  sun 1.8°  mercury 7.0°  venus 176.2°  earth 32.7°  mars 2.2°  jupiter 4.5°  saturn 1.3°  uranus 15.5°  neptune 18.9°  pluto 111.3°
  ```
  `spinAxisLongitudeDeg` is set only for Saturn and Uranus; every other planet gets longitude 0 (Earth's true pole azimuth is +90°, so its tilt points at the vernal equinox instead of the solstice direction). Retrograde rotators encode the same fact twice (obliquity > 90° *and* a negative `rotationPeriodHours`), so Venus, Uranus and Pluto end up with angular velocity z>0 (prograde seen from ecliptic north: Venus `ω = (-0.046, 0, +0.999)`) whereas truth is retrograde.
- Impact: Earth's day/night terminator vs. seasons are three months out of phase and the Earth/Mars/Sun surface features rotate about the wrong axis; `README:247` claims "correct ecliptic-longitude pole directions".
- Fix: store IAU `poleRaDeg/poleDecDeg` per planet in `planets.ts` and derive the world pole with the existing `equatorialToEcliptic()` (as `PARENT_EQUATOR_POLE_OVERRIDE_ECLIPTIC` already does for Uranus/Pluto in `catalog.ts:130-133`); encode retrograde only through the sign of `rotationPeriodHours`; add a vitest comparing the ten axes to a 10-row IAU table (<0.1°).
- Prior: K-07 note "spinAxisLongitudeDeg never read" is out of date (now read at `main.ts:310`) but the data stays wrong.

### F-FEC-14 — Belt shader numerics: fp32 Julian-date uniform steps and a physically meaningless "perturbation" (K-15, K-48)
- Severity: Low  - Class: VERIFIED  - Reach: LIVE  - Effort: S
- Where: `src/frontend/features/asteroids/beltRenderer.ts:22,65,154-164,460-463`.
- Evidence: `uniform float uJulianDate` is set from the raw double JD (`uniforms.uJulianDate.value = safe`); fp32 ULP at JD 2.46e6 is 0.25 d: `node -e` → 17 distinct values per second at 4 d/s, 4.1 updates/s at 1 d/s, 1 value for 60 s at real time; one 0.125 d error = 0.0014 AU (2.0e5 km) for an asteroid at 2.5 AU, comparable to the 0.003 AU minimum display radius. Perturbation: `orbitPosition += perturb * age*age * uPerturbationScale` with `DEFAULT_PERTURBATION_SCALE_AU = 1e-10` → worst case μ_J/d²·age²·1e-10 = 2.825e-7·0.28·1.6e9·1e-10 ≈ 1.3e-8 AU (2 km), 0.05 ULP at 3 AU.
- Impact: belt appears to step at low speeds; "perturbations under Sun/Jupiter/Saturn" (README:400) are a numerical no-op.
- Fix: upload `jd − 2461000.5` (and `epochJd − 2461000.5` as the attribute) so both fit fp32 with 1e-5 d precision; delete the perturbation block and the Jupiter/Saturn uniforms or document it as decoration.
- Prior: K-15 STILL-PRESENT; K-48 STILL-PRESENT.

### F-FEC-15 — Phase-1 loader residuals: self-test fails by construction; binary fetched without cache validation; no timeout (K-16, K-47)
- Severity: Low  - Class: VERIFIED  - Reach: LIVE / TEST  - Effort: S
- Where: `src/data/asteroidCatalogLoader.ts:185,285,305,319-387`; `src/sim/phase1AsteroidCatalog.ts:644,770-773`.
- Evidence: `validatePackedCatalogRoundTrip100k()` → `{"mismatchedRecords":99916,"maxEpochErrorDays":0.12499989,"ok":false}` (no caller; nothing in CI). The shipped data is **unaffected**: all 42 distinct epochs are multiples of 0.5 d (exact in fp32); the validator's synthetic epochs (`2_451_000 + … + rng()*0.25`, L285) are not. K-47 is fixed (latency is telemetry: `acceptance.passed` excludes it, L619; meta uses `cache:'no-cache'`, L644; commit `84ddcd1`), but the `.bin` is fetched with default cache (L770) while the sidecar revalidates, so a regenerated catalog + stale-cached `.bin` yields `sha256-mismatch` → procedural fallback (safe, but confusing); neither fetch has an `AbortController`/timeout, so a stalled request leaves the status at "catalog verification pending" forever.
- Impact: a red self-test that nobody runs is noise; cache skew produces a fail-closed fallback after any regeneration.
- Fix: make the validator's epoch generator `Math.round(x*2)/2` (or assert fp32-exactness explicitly) and add it to vitest; fetch the .bin with `cache:'no-cache'` or a `?v=<sha256>` URL; 15 s timeout.
- Prior: K-16 STILL-PRESENT (reduced: self-test only); K-47 FIXED-ON-HEAD (residual above).

### F-FEC-16 — Dev tooling that does nothing or fails: `dev:ui` size flags, `dev:full --backend-port`, `ingest:moon-textures` (K-33)
- Severity: Low  - Class: VERIFIED  - Reach: SCRIPT  - Effort: S
- Where: `src/frontend/app/sceneSetup.ts:92-145` vs `src/main.ts:61-65,213`; `scripts/dev-full-config.mjs:104-113`, `main.ts:191-195`; `scripts/ingest-moon-textures.mjs:5`; `scripts/fetch_jpl_sbdb.py:36`; `scripts/verify-moon-frames.mjs:243-247`.
- Evidence: `createRuntimeUiConfig()` parses `uiWidth/uiHeight/renderScale`, but `applyViewportSizeOverride` and `updateRenderResolutionStatus` are never imported (`grep` over `src`) and `renderScale` is never read → README's `npm run dev:ui -- --width 2560 --height 1440 --render-scale 1.25` only honours `--max-pixel-ratio`. `dev-full --backend-port 9000` starts uvicorn on 9000 while `backendBaseUrl()` hard-codes `:8042` (no env override). `node -e "import('…/src/frontend/features/planetary/moonTextureCatalog.js')"` (the specifier at `ingest-moon-textures.mjs:5`) → `ERR_MODULE_NOT_FOUND` (only `.ts` exists; I did not run the script itself because it would write into `public/`). `fetch_jpl_sbdb.py:36` still targets the deleted `src/data/planets.js`. The `verify-moon-frames.mjs` failure hint blames "nodePrecessionYears applied to the ECLIPTIC node" and `convertMoonOrbitFrameToEcliptic`, both obsolete.
- Impact: documented commands mislead; a contributor chasing a PLANE failure is pointed at code whose results are discarded (F-FEC-18).
- Fix: wire or delete the three UI knobs; read `import.meta.env.VITE_BACKEND_URL ?? …` and pass it from `dev-full`; change the import to `.ts` run under `tsx`/`node --experimental-strip-types`; update the hints.
- Prior: K-33 STILL-PRESENT.

### F-FEC-17 — 39 MB of orphan textures, 0.9 MB of unreferenced `public/` assets, and a render-blocking third-party font import (K-34)
- Severity: Low  - Class: VERIFIED  - Reach: DATA / LIVE  - Effort: S
- Where: `src/assets/textures/` (25 files, 39 MB, tracked, no LFS; largest `moon_albedo_lroc_8192.jpg` 9.4 MB); `public/textures/moons/` (0.9 MB), `public/solar-systems/` (24 kB), `public/data/asteroid-phase1/sample_top_10.json`; `src/style.css:1`.
- Evidence: the only source mentions of these texture names are string keys in unreachable `visualProfiles.ts`; none is in `dist/` (5.4 MB: 0.96 MB JS/CSS, 3.5 MB bin, 0.9 MB moon textures, 24 kB manifests that nothing loads). `@import url('https://fonts.googleapis.com/…')` is the first line of the stylesheet.
- Impact: clone/CI weight and a stale-asset trap; third-party request on every load (offline/privacy).
- Fix: `git rm`/LFS the unreferenced textures (or move to a `docs/assets` release), stop copying unreferenced `public/` dirs, self-host or drop the fonts.
- Prior: K-34 STILL-PRESENT.

### F-FEC-18 — Vestigial and duplicated numerics: ≈120 lines of discarded frame conversion, 4+1 Kepler solvers, stale comments
- Severity: Low  - Class: VERIFIED  - Reach: LIVE (computed, results unused)  - Effort: S-M
- Where: `src/sim/catalog.ts:140-155,200-217,219-240,259-281,333-364,511-518,689,722-728`; `orbitMath.ts:168-196`, `sourceFrameOrbit.ts:131-141`, `moonEphemeris.ts:421-433`, `beltRenderer.ts:77-86`; `planetPositionCheck.ts:42-80`.
- Evidence: for every non-ecliptic moon `convertMoonOrbitFrameToEcliptic` runs (`orbitNormalFromElements`, `periapsisVectorFromElements`, `elementsFromOrbitNormal`, `normalizeAngleWithinPlaneDegrees`, …) but only `.sourceFrame` (a label) is consumed (`catalog.ts:713`; iDeg/Ω/ω use the native values for every non-ecliptic moon, L722-728); the mutant that reverts K-05's sign bug in `orbitNormalFromElements` survives all 168 tests. Kepler solvers: `solveKeplerFast` (6 Newton steps from E=M) diverges for e≥0.95 (worst residual 8.7e-8 rad at 0.95, **3.14 rad at e=0.99**); live KBOs reach e=0.916 (28 with e>0.9) so it works today by margin, undocumented. `solveKepler` (orbitMath) converges to 5.5e-11 up to the 0.9999999 clamp (hyperbolic input would silently clamp), the source-frame and Chebyshev copies throw/return false at e≥1, and the shader copy diverges at e≥0.99 (`node kepler_bounds.mjs`).
- Impact: a reader will believe those ~120 lines decide the plane (they did in K-05) and may "fix" them without effect; four TS solvers with different tolerances/iteration caps.
- Fix: delete the converter and its helpers (keep `sourcePoleInEcliptic`/`basisFromSourcePole`); one shared `solveKepler` with documented e-range exported from `orbitMath.ts`; `assert e ≤ 0.92` in `solveKeplerFast`'s callers; refresh the stale comment blocks.
- Prior: NEW.

### F-FEC-19 — Runtime hygiene: no frame-loop isolation, no dt clamp, belt swap leaks instance buffers and drops scale mode, hidden-tab time jump
- Severity: Low  - Class: VERIFIED (code reading + three r182 source)  - Reach: LIVE  - Effort: S
- Where: `src/main.ts:481-488,1395-1447,1397`, `beltRenderer.ts:478-481`.
- Evidence: (a) `animate` calls `requestAnimationFrame` first and has no `try/catch`; any exception (e.g. in solar visuals) skips `renderer.render` and repeats every frame — frozen scene + console spam. (b) `deltaSeconds` is unclamped: after a hidden tab the first frame advances sim time by `hiddenSeconds × d/s` (5 min at 4 d/s = 1,200 days). (c) `dispose()` calls `geometry.dispose(); material.dispose();` but not `InstancedMesh.dispose()`, which is the only path that frees `instanceMatrix`/`instanceColor` (`WebGLObjects.js:70-80`): ≈3.8 MB of GPU buffers for the swapped-out 50k procedural belt wait for GC. (d) `refreshAsteroidBeltRenderer` never re-applies `setScaleMode(simState.useRealisticScale)`. (e) by code reading, `resizeRenderer` (L1068-1078) compares the DPR-scaled `canvas.width` with CSS `clientWidth` and calls `setPixelRatio` each time, so on DPR>1 every resize/panel toggle should reallocate the drawing buffer twice (not measured). (f) QuadtreeNode.evaluate/`animate` clone several `Vector3`s per node per frame (GC churn; not measured). (g) No `new Worker` timeout, no WebGL-unavailable fallback (`new WebGLRenderer` throws → blank page; ids are validated fail-fast by `elementById`, which is good).
- Fix: wrap the frame body (`try { … } catch (e) { console.error(e) }` with an error counter), `Math.min(deltaSeconds, 0.1)`, call `mesh.dispose()` in both belt renderers' `dispose()`, call `setScaleMode` after a swap, compare against `clientWidth*pixelRatio`.
- Prior: NEW.

### F-FEC-20 — `main.ts` tsc: 18 errors, all benign; one real latent bug surfaced via the SMBH file
- Severity: Low  - Class: VERIFIED  - Reach: LIVE (type debt) / LATENT  - Effort: S
- Where: `$S/tsc_main.txt` `src/main.ts` rows; `src/frontend/features/superluminal-modeling/smbhPropagation.ts:120`.
- Evidence (triage): TS7006 ×8 (L197,201,384,481,722,834,850,1003) untyped params — benign; TS18049 ×2 (L207-208) guarded at runtime by `Number.isFinite(massKg)` (false for null/undefined) — benign; TS7034/7005 ×2 (L247, L332) `let sunTexture = null` — benign; TS2322 ×3 (L262 `SimulationStateStore` has no index signature; L332 `ShaderMaterial` not in the declared union; L1029 `KeplerOrbit` vs `SceneBodyLike`) — structural/typing, benign; TS7053 (L347) indexing `PLANET_COLORS` by string, falls back to `body.color` — benign; TS2339 ×2 (L1340-1341) `options.preset/hypothesis` on `{}` — plain object at runtime, benign. **None indicates a runtime bug in `main.ts`.** The single TS2304 in the whole project, `smbhPropagation.ts:120` (`smbhMassG: number = SGR_A.massG`, `SGR_A` not imported), throws `ReferenceError` only when `metricFrameDragPeak` is called without a mass; both live call sites pass one (`getWarpState().smbhMassG`; worker default `1`), so it is latent. Every file in my scope other than `main.ts` is tsc-strict clean.
- Fix: type `dom`-driven helpers (`body: CatalogBody`, `deltaSeconds: number`), add an index signature or a `SunControllerSimState` interface for `createSunController`, `import { SGR_A } from './smbhPhysicsConstants'` in `smbhPropagation.ts`.
- Prior: NEW.

### F-FEC-21 — The accuracy envelope of the planet model is not surfaced: Standish Table 1 is valid 1800–2050, Earth is the Earth–Moon barycentre, Pluto is unverified
- Severity: Low  - Class: VERIFIED  - Reach: LIVE / DOC  - Effort: S
- Where: `src/data/planets.ts:14-26`, `src/main.ts:1395-1401`, `index.html` (time controls); `MAX_TIME_SCALE_DAYS_PER_SEC = 120`.
- Evidence (`cmp_summary.mjs`, 12 TDB dates vs astropy builtin): worst heliocentric-direction error 1800-2100 — Mercury 0.27′, Venus 0.37′, EMB 0.15′, Mars 0.96′, Jupiter 5.57′, Saturn **13.79′**, Uranus 1.38′, Neptune 0.85′ (consistent with the repo's DE441 gate, Saturn 6.2e6 km). Beyond the table: Jupiter 63.6′, Saturn **164.9′ (2.7°)**, Uranus 31.4′, Neptune 12.3′ at JD 2634167 (~year 2500), reachable in 24 min at +120 d/s (year 2050 in 71 s). Standish's Earth is the Earth–Moon barycentre (4,670 km from Earth); no UI/data comment says so (only the test header does). Pluto has no rates (`planets.ts:261-278`) and no fixture, so it is ungated. Propagation is NaN-free for JD ∈ ±1e8 (180,000 samples over 9 bodies) and the secular drift stays sane for >3,800 centuries.
- Impact: none for a "visualization-grade" app, but nothing tells the user that positions after 2050 degrade, and "Earth" is a barycentre.
- Fix: one-line HUD hint when |JD − J2000| > 0.5 cy ("approximate elements, ±14′ near Saturn"); comment EMB in `planets.ts`; add Pluto to the Horizons fixture.
- Prior: NEW.

## 3. Prior issues in my area

| K-item | Status on HEAD | Proof |
|---|---|---|
| K-04 value-import bundles `self.onmessage` | **FIXED** | `main.ts` imports `modelWorkerContract.ts` only (L47-60) and spawns the worker via `new Worker(new URL(…))` (L761); `grep -o 'self.onmessage' dist/assets/index-D9fopfEU.js` = 0 (worker chunk = 1); worker body guarded by `isWorkerContext` (`modelWorker.ts:67-69`); commit `4ca5a67` |
| K-05 orbit-normal sign (Titan 55°, Charon 115°, Cordelia 165°) | **FIXED** | plane-normal error vs IAU pole, `plane_check.mjs`: Io 0.019–0.020°, Titan 0.36–0.49° (Titan's own 0.3° inclination), Charon 0.000°, Cordelia 0.149–0.155°; Moon vs astropy moon98 0.10–0.17° at 12 dates (1800–2500); all 67 non-ecliptic moons inside the geometric bound at J2000 and 2026 except Phobos 2026 (2.21° vs ≤1.6°) — `plane_all67.mjs`; commit `a862ad3` + `bd48a7d` |
| K-06 argPeriapsis unrotated (Io 178.5° off) | **FIXED** | native-frame propagation (`sourceFrameOrbit.ts`); Io J2000 position error 8.3e2 km (0.2% of orbit radius), Charon 28 km (`verify-moon-frames --epochs`) |
| K-07 fallback pole identical for all planets | **FIXED** | `PARENT_EQUATOR_POLE_OVERRIDE_ECLIPTIC` (`catalog.ts:130-133`); Charon plane 0.000°, Ariel/Titania/Miranda ≤0.07° vs fixture; removing the Uranus negation is caught (mutant M5 killed) |
| K-15 raw fp32 JD uniform | **STILL-PRESENT** | `beltRenderer.ts:65,460-463`; 17 updates/s at 4 d/s (F-FEC-14) |
| K-16 Float32 epoch / failing round-trip | **STILL-PRESENT (test-only)** | validator `ok:false`, 99,916/100,000 mismatches; shipped epochs are exact (F-FEC-15) |
| K-17 periods to 3 s.f. | **STILL-PRESENT** | `fetch_jpl_sbdb.py:148` `full-prec:false`; 131 distinct periods, max 0.459% (F-FEC-11) |
| K-33 ingest/fetch scripts | **STILL-PRESENT** | `ingest-moon-textures.mjs:5` → ERR_MODULE_NOT_FOUND (probed the same specifier); `fetch_jpl_sbdb.py:36` → `planets.js` (read, not run) |
| K-34 orphan textures | **STILL-PRESENT** | 25 files / 39 MB unreferenced, absent from `dist/` (F-FEC-17) |
| K-35 README vs live | **STILL-PRESENT** | F-FEC-01 |
| K-37 monolith | **STILL-PRESENT** | 1,083 → 1,501 lines (F-FEC-09) |
| K-39 Float32 across worker | **FIXED** | schema v2 `Float64Array` (`modelWorkerContract.ts:37-42`, `modelWorker.ts:45`), validated on receipt (`isValidModelWorkerStateArray`); test "accepts only the declared float64 record shape"; commit `b6c4ce3` |
| K-40 (model side) H29 displacement | **STILL-PRESENT** | `solarSystemModel.ts:169-202`; F-FEC-10 numbers |
| K-43 realistic-scale mode | **STILL-PRESENT** (focus floor + labels; Earth/Mars now shown to stay at display size) | F-FEC-05 |
| K-46 taxonomy by semi-major axis | **STILL-PRESENT** | 99.07% of rows equal the a-rule; 3 albedo values (F-FEC-11) |
| K-47 latency veto / force-cache | **FIXED** | `phase1AsteroidCatalog.ts:619` (latency not in `passed`), `:644` `no-cache`, test "treats a slow authenticated load as telemetry"; commit `84ddcd1`; residual F-FEC-15 |
| K-48 belt "perturbation" no-op | **STILL-PRESENT** | ≈2 km worst case (F-FEC-14) |
| K-49 secular precession / Moon plane | **FIXED** | secular rates + apsidal invariant implemented (`orbitMath.ts:202-266`); Moon plane error 0.10–0.17° (was 8.3°) |
| K-49 duplicate Puck | **STILL-PRESENT** | `moons.json` ids 378 (URA182, epoch 2000) and 388 (URA184, epoch 2025); catalog ids `moon-uranus-puck` / `-2` (`radius_prov.mjs`) — source-table artefact, gate uses the first |
| K-49 moon radii provenance | **STILL-PRESENT** | 377/424 radii from `stableHash` (`catalog.ts:520-553`); not displayed live because moons are hidden |

## 4. Strengths

- **Independent, real ground truth.** `planet-positions-horizons.json` agrees with astropy's ERFA plan94/epv00 to ≤8.6″ (Mercury–Mars) and ≤71″ (giants) at all 48 rows; the Moon rows of `moon-positions-horizons.json` agree with moon98 to ≤8.5 km. The oracle modules are pure comparison harnesses (propagator injected), run offline, and report in km, drift and aggregate; budgets are explained in prose with the measurement behind each. 14 of 18 mutants I injected are killed (table in F-FEC-12).
- **The apsidal invariant is documented where it bites** (`orbitMath.ts:44-102`, `catalog.ts:368-433`) with measured evidence per source ephemeris, and the Standish reduction (`ω=ϖ−Ω`, `M=L−ϖ`, `ω̇=ϖ̇−Ω̇`) is internally consistent for all 8 planets and Pluto (I re-derived it from the Table-1 constants as I know them — there is no network to re-fetch the table — e.g. Mercury 29.12703035° / 174.79252722° / 0.2858177°/cy) and is validated end-to-end by the astropy and DE441 comparisons (≤14′ in 1800-2100).
- **Moon frames genuinely fixed.** 133/134 plane checks for all 67 non-ecliptic moons are inside their geometric bounds; native-frame propagation with analytic velocity (`sourceFrameOrbit.ts`) has a derivative test.
- **Chebyshev ephemeris engineering.** Deterministic generator with held-out half-step validation (36,525 samples/body) and a byte-compare `--check`; fail-closed outside 2000-2050 (`beforeStart/afterEnd = false`, atomic outputs); sub-km continuity at every segment boundary (max 0.187 km position / 0.041 m/s over all boundaries); 3-5 µs per position+velocity call; vis-viva `a` from the shipped state matches the fitted `a` to 1e-5 (Titan); schema validation at the import boundary (`parseMoonEphemerisArtifact`).
- **Worker/contract hygiene.** float64, versioned schema, units/frame in code, one tick in flight (no unbounded queue), staleness gating (≤3 frames) with silent main-thread fallback, `onerror` terminates the worker; 512 bytes/tick.
- **Catalog integrity chain.** Shipped `.bin` SHA-256 and FNV-1a32 both match the meta (`ast_check.mjs`); typed rejection codes; fail-closed procedural fallback with a persistent, honest status line; 7 tests including "FNV is not an integrity substitute".
- **Time-scale handling** is explicit and tested: UTC→TDB with a leap-second table and periodic term, sim clock stays TDB through the worker boundary, `constants.test.ts` kills the "drop 2017 leap second" mutant.
- **Type discipline.** Every file in my scope except `main.ts` is `tsc --strict` clean; the 18 `main.ts` errors are benign (F-FEC-20). No DOM injection sinks (`innerHTML`/`eval`) in live code; `elementById` fails fast and all 42 referenced ids exist.
- **Codified lessons.** `src/sim/TESTING_NUMERICS.md` states the oracle/budget/multi-epoch rules that this review found enforced in the planet and moon gates.

## 5. Scores (1-5; 3 = works, known gaps documented; 5 = validated and enforced in CI)

| Dimension | Score | Basis |
|---|---|---|
| build/test health (my area) | 4 | 168/168 sim tests green in 6.4 s; both verify scripts exit 0; gates run inside `npm test`; CI overall red for an unrelated solar test |
| type safety | 4 | all my files strict-clean except 18 benign `main.ts` errors (F-FEC-20) |
| architecture/modularity | 2 | 1,501-line export-less `main.ts`, 16 module `let`s, worker + fallback duplication, 1,006 LOC dead siblings (F-FEC-08/09) |
| correctness of live paths | 3 | planets right to documented accuracy; Earth/Mars unpickable (F-FEC-04), realistic-scale wrong for Earth (F-FEC-05), spin axes (F-FEC-13) |
| physics/numerical fidelity AND honesty of labelling | 3 | planets ≤14′ and honestly called "visualization-grade"; moon work honest in code but README overstates (F-FEC-01); catalog colours labelled "verified" (F-FEC-11) |
| data integrity/provenance | 3 | SHA chain intact, Horizons fits reproducible by script; fixtures not regenerable, taxonomy/albedo synthetic, moons.json undated snapshot of an HTML scrape (`update-moons-data.mjs`: `cols.length !== 20` silently skips rows) |
| backend robustness/concurrency | n/a | not my area |
| security/operational exposure | 4 | same-origin fetches, no injection sinks, SHA-checked data; third-party Google Fonts `@import` (F-FEC-17) |
| performance | 3 | ≈1.3 s startup CPU, 2.6 ms/frame KBO waste (F-FEC-06/07); GPU belt path is good |
| test strategy | 4 | independent oracles + multi-epoch + mutation-resistant for the headline defects; blind spots F-FEC-12; no tests for `main.ts` |
| documentation accuracy | 2 | code comments excellent, README Highlights ≥12 false/overstated (F-FEC-01), stale hints/comment blocks |
| repo hygiene | 2 | 39 MB orphan textures, dead modules, broken script imports, dead flags (F-FEC-16/17/18) |

## 6. Not inspected

- **Runtime browser behaviour** (parent's probe): picking, realistic-scale visuals, first-paint timing in Chrome, GPU shader fp32 numerics (Kepler convergence was tested in fp64 emulation only), real DPR behaviour.
- **sunController / solar / SMBH modules** (another reviewer); only the call sites in `main.ts` and `getWarpState()` were read. `asteroidTaxonomyResolver.ts` (unreachable) not read.
- **Network-only checks**: Horizons re-fetch (proxy 403), `generate_moon_ephemeris.py --check`, `update-moons-data.mjs`, SBDB re-query — described, not executed. The full `npm test` was not re-run (parent baseline: 308/309); I ran the 10 sim/worker/constants test files in a scratch copy (168 pass).
- **Pluto** accuracy (no independent reference available offline); `kuiperBelt.ts` lines 300–516 (binary-companion details); `style.css` beyond a skim; `planetShaders.ts` beyond radius/uniform usage; `scripts/asteroid/catalog_fetcher.ts`; `moonTexture*`/`satellite*` (unreachable).
- Asteroid positions were not compared with an external ephemeris (no offline reference); only internal consistency (period vs `a`) was measured.


---

<!-- ======================= REVIEWER REPO ======================= -->

# Reviewer REPO — cross-cutting review of `vkorotkikh/solar-system-realistic-sim` @ `main` 17d1e63

Area id `REPO` (README truthfulness, repo hygiene, docs, dependencies/supply chain, tooling scripts, CI design + R3/R4 verifier, test-suite quality).
Severity counts: **Critical 0 · High 4 · Medium 8 · Low 5** (17 findings). All paths repo-relative; `S` = reviewer scratchpad.

## Scope & coverage

### Evaluation caveats that affect every reviewer (read first)

1. **The local clone is shallow; the baseline "291 commits" is wrong.** `/home/user/solar-system-realistic-sim/.git/shallow` lists two boundary commits (`2e7e748d`, `ea3948be`).
   `git log origin/main` therefore shows 291 commits, but the GitHub API (`list_commits sha=main`, 7 pages) returns **604 commits**, the first being `b3494af` "Initialize Solar System Mission Lab project" on **2026-02-08T07:02Z** (repo `created_at` 2026-02-10).
   The two "mass commits" in the local log (`ea3948be` 288 files/+70,225 lines; `2e7e748d` 295 files/+72,685 lines) are shallow-boundary artefacts (git shows a boundary commit as adding every file), not real imports. Anything derived from "history before 2026-03-07", "largest commits" or "first commit" in the local clone is unreliable; `git fetch --unshallow` in the user's checkout fixes it (I did not run it: it writes into the user's `.git`).
2. **The repository is private** (`"private": true`, 0 stars/forks/issues/PRs, `pushed_at` 2026-09-27T08:41:48Z). This lowers the weight of the missing LICENSE (F-REPO-15).
3. **Deviation from the briefing:** I ran the R3/R4 lane in a scratch clone (`git clone --no-hardlinks main-wt` + copy of `.git/shallow`, detached at 17d1e63, clean) instead of `main-wt`, because the verifier calls `git worktree add/remove` on the repo it is pointed at and would have written transient entries into the user's shared `.git/worktrees/`. Polling every 0.5 s showed exactly one temporary worktree registered at a time (`r3-r4-baseline-*`, then one per mutant); all were removed in the `finally` paths (`ci-clone/.git/worktrees` absent afterwards; `$S/work/repo/tmp` empty; the user's `.git/worktrees` still contains only `main-wt`; `main-wt` `git status` clean).

### Files in scope

| Area | Files (LOC) | Coverage |
|---|---|---|
| README | `README.md` (454) | read fully, every sentence classified (table T1) |
| Dev docs | `Development_History_Context.md` (1,073), `Development_Improvements.md` (1,354), `typescript_migration_plan.md` (95), `ADVANCED_ASTROPHYSICS_INDEX.md` (311), `src/sim/asteroids/README.md`, `scripts/ci/README.md` (80) | headers/rules/sampled entries read; whole-file path-reference scan; statuses in table T2 |
| Doc estate | 122 `.md` (40,420 lines), `agent-notes/` 24, `my-notes/` 74, `docs/adr` 5, `docs/superpowers` 2 | inventoried, sha256-deduped, line-Jaccard compared; titles/headers only |
| CI | `.github/workflows/r3-r4-science.yml` (112), `scripts/ci/verify_r3_r4.py` (717), `ci/r3-r4-science-verification.json` (177), `scripts/ci/mutations/*.patch` (6, 100), `scripts/ci/tests/*.py` (518), `scripts/ci/typescript-error-ratchet.mjs` (+test, 174), `ci/*.txt` (3), `ci/typescript-error-baseline.json` (40) | read fully; lane executed (see below); GitHub run 36307010887 jobs + logs read via API |
| Deps | `package.json`, `package-lock.json` (110 pkgs), `backend/requirements.txt` (11), `.nvmrc`, `.python-version`, `tsconfig.json`, `.gitignore`, `.vscode/` | read fully; audit + AST import scans |
| Scripts | `scripts/` 34 files (9,389 lines incl. 2,205 of JSON fixtures), 3 root helpers (231) | every file statically checked; `--help`/offline run where harmless (table T4) |
| Tests | `backend/tests` 52 modules/747 `def test_` (22,029 LOC), 21 vitest files (3,918 LOC), `conftest.py`, `pytest_main.log` | AST metrics over all 52; collect-only; ~20 tests read; import-graph for all TS tests |

### What I ran (all read-only on `main-wt`; scratch outputs under `$S/work/repo/`)

| Command (abridged) | Outcome |
|---|---|
| `python3.12.13 -m venv venv-ci && pip install -r ci/r3-r4-requirements.txt` | exact 12 pins installed (+pip) |
| `verify_r3_r4.py --repo . --manifest ci/r3-r4-science-verification.json --artifacts <new> all` (scratch clone, exact interpreter) | **exit 2 after 13.5 s**: baseline 6/6 pass, mutant 1 killed, mutant 2 `patch-not-applied` (F-REPO-01) |
| same, scratch clone + restored pre-2620db9 patch | exit 0 in **29.5 s**: baseline 6/6; 6/6 mutants killed (table T3) |
| `python -m pytest --noconftest -q scripts/ci/tests/test_verify_r3_r4_runner.py scripts/ci/tests/test_r3_r4_workflow.py` | 21 passed in 17.1 s |
| `generate_pfss_harmonic_fixture.py --check` (pinned env) | "Fixture matches locked oracle byte-for-byte" (0.4 s) |
| offline-guard probe (`_OFFLINE_GUARD` via sitecustomize) | blocks connect/connect_ex/sendto/create_connection/urlopen; **does not block `sendmsg` (UDP) or `getaddrinfo`** |
| toy-fixture runs of the verifier (regex-scope, `pytest.ini` addopts) | regex accepts an unrelated exception on the tagged statement (F-REPO-14); `addopts = -p no:guard` does NOT disable the guard |
| `uv venv` (3.12.13) + `uv pip install -r backend/requirements.txt` + `cd backend && pytest --collect-only -q` | `1903 tests collected, 11 errors` (httpx missing); after `uv pip install httpx`: `2142 tests collected` (F-REPO-04) |
| `import server` in that venv; app routes dump; README's uvicorn command on :18143 + 6 GET probes; stopped afterwards | OK in 3.3 s; 23 routes; all probes HTTP 200 (table T1 rows D04, D09) |
| `npm audit --json`; `npm audit fix --package-lock-only` (scratch copy of package files); `npm audit --omit=dev` | 11 advisories → 3 after fix (vitest major); `--omit=dev`: 0 |
| `node scripts/ingest-moon-textures.mjs`; scratch run of `fetch_jpl_sbdb.py` with mocked network | `ERR_MODULE_NOT_FOUND`; `bodies.py` +438 B then `FileNotFoundError` (F-REPO-06) |
| `node scripts/verify-planet-positions.mjs`, `verify-moon-frames.mjs` (TMPDIR in scratch) | both pass (0.32 s / 0.44 s) |
| `node scripts/dev-full.mjs --host 0.0.0.0`; `parseDevFullConfig(...network)` | guard message verified; network profile yields `vite --host 0.0.0.0 --port 5173` (F-REPO-08) |
| Vite dev server from a scratch clone on :18142 | ready in 366 ms; `/`, `/src/main.ts`, asteroid meta all HTTP 200; default bind localhost; killed |
| sha256/FNV-1a of `asteroid_phase1_main_100000.bin` vs `meta.json`; lockfile integrity scan; secret-pattern scan of tracked files | both checksums match; 110/110 integrity hashes; no secret-like literals |
| `pytest --collect-only` (venv312); AST scans; sha256 scans; reach.mjs; GitHub API (runs, jobs, logs, branches, 604-commit count, index.html history) | tables T5–T9 |

---

## Findings

### F-REPO-01 — The R3/R4 science lane cannot pass on HEAD: `uniform-theta-area-weights.patch` no longer applies (aborts at mutant 2)
- Severity: High   - Class: VERIFIED   - Reach: CI   - Effort: S
- Where: `scripts/ci/mutations/uniform-theta-area-weights.patch:4` (hunk header `@@ -64,4 +64,5 @@`), `scripts/ci/verify_r3_r4.py:565-567` (`git apply --check` → `patch-not-applied`), `ci/r3-r4-science-verification.json:117-119` (`patch_sha256` d50024f0…); introduced by commit `2620db9` (2026-09-27 03:13, "fix(pfss): finalize GONG snapshot integration").
- Evidence:
  ```
  $ python scripts/ci/verify_r3_r4.py --repo . --manifest ci/r3-r4-science-verification.json --artifacts <new> all   # scratch clone @17d1e63, exact 3.12.13 + pins
  R3/R4 verification failed: mutation uniform-theta-area-weights patch-not-applied: error: patch failed: backend/sim/magnetogram_grid.py:64
  error: backend/sim/magnetogram_grid.py: patch does not apply          # exit 2, 13.5 s; artifacts = baseline.xml + mutant #1 only
  $ git -C main-wt apply --check scripts/ci/mutations/uniform-theta-area-weights.patch      # read-only, same error
  ```
  `git show 2620db9` rewrote the hunk from `@@ -64,7 +64,8 @@` (three trailing context lines, manifest hash `5a27e5d4…`) to `@@ -64,4 +64,5 @@` (no trailing context). `git apply` anchors a hunk that has leading but no trailing context to end-of-file; `area_weights` is followed by `validate_map`, so it no longer matches. Toy reproduction (git 2.43.0): zero-trailing-context hunk → "patch does not apply"; same hunk with one trailing context line → applies; same zero-trailing hunk on a last statement → applies.
  Restoring the old hunk + its hash in a scratch clone (`git show 2620db9^:scripts/ci/mutations/uniform-theta-area-weights.patch`, `patch_sha256` → `5a27e5d4fb91b9a4954f42dea76c039ac5f8e37108bad5aed8e3ddd2630708ea`) makes the whole lane pass: **29.5 s, baseline 6/6, 6/6 mutants killed** (table T3). The other five patches apply today.
- Impact: The project's headline blocking scientific gate is red by construction on HEAD, independently of the other CI failures. It is the third failure hidden behind `npm test` and the TypeScript ratchet in job 1 (F-REPO-02). Nothing exercises the real manifest's patches before the last CI step: the 21 runner-contract tests (17 s, green) use a toy fixture, so a stale patch is invisible until the lane runs end-to-end — which has never happened on HEAD.
- Fix: (1) regenerate that patch with `git diff -U3` (or restore the pre-2620db9 hunk above) and set `patch_sha256` to the new file hash; (2) add `scripts/ci/tests/test_manifest_patches_apply.py` (runs in the existing "runner and workflow contracts" step, ~1 s): for every manifest mutation assert `sha256(patch)==patch_sha256` and `git apply --check <patch>` succeeds against a worktree of HEAD; (3) add `python scripts/generate_pfss_harmonic_fixture.py --check` (0.4 s, passes) to the lane so the oracle's reproducibility is also gated. 
- Prior: NEW
- Adversarial check: Tried to refute — (a) my environment? the pristine target worktree fails identically and restoring the old hunk makes it pass, so it is the patch; (b) verifier too strict? No: GNU `patch` 2.7.6 rejects it as well (`patch -p1 --dry-run` → "Hunk #1 FAILED at 64"), so the patch is not applicable by either tool; (c) git version? reproduced on git 2.43.0, CI used 2.55.0 (log) — not re-run on 2.55.0, but end-of-file anchoring of context-less hunks is long-standing `git apply` behaviour; (d) tolerated by the workflow? every step is non-`continue-on-error` (asserted by `test_r3_r4_workflow.py:61`). Survives.

### F-REPO-02 — HEAD has never been green on any lane, and the CI was never run against its own changes before landing
- Severity: High   - Class: VERIFIED   - Reach: CI   - Effort: M
- Where: `.github/workflows/r3-r4-science.yml:1-112`; GitHub run 36307010887 (run_number 1); branch settings.
- Evidence (GitHub API read-only + local reproduction):
  - Exactly **one workflow run exists**: run_number 1, event `push`, head `17d1e63`, created 2026-09-27T08:41:54Z (04:41 EDT), conclusion **failure** in both jobs. Workflow object `created_at` 2026-09-27T04:41:49-04:00; repo `pushed_at` 2026-09-27T08:41:48Z — i.e. 70 min after the tip commit's committer time (03:31:11).
  - The workflow file was first committed at `d6f19d1` (2026-09-26 18:22:17) and edited by 7 commits (`d6f19d1, dcab465, 2f99a28, e2ff786, 5e3bbd1, 477030a, 774cb89`); **109 commits** with a committer date at or after `d6f19d1` (`git log --since=2026-09-26T18:22:17-04:00`; 127 are reachable via `d6f19d1^..origin/main`, 18 of them older commits brought in by merges) landed with no intermediate run, i.e. in one push. Peak authoring rate that day: 37 commits in the 19:00 hour.
  - Job `r3-r4-science` (≈42 s): `npm test` failed (`solarRealtimeClient.test.ts:605`, 1 failed/308 passed) → steps *build, ratchet, runner/workflow contract tests, science manifest* all **skipped**; then `Retain JUnit…` (`if: always()`) failed: `##[error]No files were found with the provided path … No artifacts will be uploaded` (artifact list empty).
  - Behind it: `npm run typecheck:ratchet` exits 1 on HEAD (`new diagnostic bucket …localPlanner.ts|TS7034 (1)`, `…|TS7005 (1)`; total 221 ≤ budget 226 — `$S/ratchet_main.txt`) and then F-REPO-01. The job is three failures deep.
  - Job `backend-tests` (8m46s): `7 failed, 2135 passed in 492.10s` — 5× `503 solar_compute_timeout` (default 18.0 s deadline, `backend/server.py:917-924`), `KeyError: 'wall_jd'`, `TypeError … missing 1 required keyword-only argument: 'wall_jd'`. The local full run (`$S/pytest_main.log`) reproduces the same 7 plus one load-dependent flake: `8 failed, 2134 passed in 549.56s`.
  - `list_branches`: `"protected": false` for `main`, `sun-focus`, `fix/trajectory-amplification-defense-in-depth`; 0 PRs, 0 issues (repo rulesets cannot be queried with the available tools).
- Impact: CI conveys no usable signal; failures are masked in sequence; ≈109 commits (peak 37 per hour) were integrated on `main` with zero remote validation and nothing that could block them. `scripts/ci/README.md` says "The workflow is operational" — false at HEAD.
- Fix: (1) fix the four independent causes: the failing vitest assertion (`solarRealtimeClient.test.ts:605`/client message), re-baseline `ci/typescript-error-baseline.json` after the reductions (new buckets, lower total), F-REPO-01, and the backend `wall_jd` drift + deadline tests (F-REPO-11); (2) enable a ruleset/branch protection requiring both jobs on `main`; (3) land CI changes through a branch/PR so they run before merging; (4) split the job (F-REPO-05) so one red gate cannot hide the others.
- Prior: K-03 (CHANGED — CI, vitest, ratchet now exist; everything is still red)
- Adversarial check: one-off flake? No: each failure reproduces locally and deterministically except the supervisor flake (not counted). Is "pushed once" proven? Only for the 109 commits created since the first CI commit (a push after 18:22 would have created a run because the workflow file existed on `main`); earlier commits of the 184-commit delta may have been pushed earlier (not provable from the API). `protected:false` covers classic protection only. Survives with those qualifiers.

### F-REPO-03 — README materially misdescribes the shipped product: only 36% of its Highlights+Features claims are true on HEAD (K-02 STILL-PRESENT)
- Severity: High   - Class: VERIFIED   - Reach: DOC   - Effort: M
- Where: `README.md:1-19` (lead + Highlights), `:222-315` (Features), `:112-220` (tree), `:26-27` (links), `:201`; also the GitHub repo description.
- Evidence: 109 atomic claim rows classified in table T1 (4 SOL-owned summary rows excluded from ratios):
  - **Overall: 58 TRUE / 105 = 55.2 %** (25 DEAD, 20 FALSE, 2 UNVERIFIABLE). Bounds if the 4 SOL rows were all false/true: 53.2 % / 56.9 %.
  - **Highlights + Features (the product description), 42 rows: 15 TRUE (36 %), 15 DEAD (36 %), 12 FALSE (29 %)**; K-02's older estimate was "≈50 % DEAD/FALSE" — now 64 %.
  - Backend/security/Data-Model/commands/stack sections (63 rows): 43 TRUE (68 %): the README is accurate where agents recently edited it (security paragraphs, Data Model, `dev:full`) and stale where nobody did.
  - Worst offenders (each re-verified in code): engine dropdown + "click Connect" (README:57,73) — `index.html` has no such control and `main.ts` has no WebSocket; the only client `simulationClient.ts:128` is unreachable (the UI was cut down in `d1484e8` 2026-02-23 "Revise index.html for Sun Model Lab transition … removing several unused simulation engine settings and quick view buttons", per the GitHub history of `index.html`; `index.html` at the 2026-03-07 shallow boundary `ea3948be` and at HEAD both contain no engine/connect/planner control); "1.9M particles" (README:14,282) vs `main.ts:183-184` (`ASTEROID_BELT_TARGET_COUNT = 50_000`, source limit 100,000; shipped dataset 100,000 rows); "catalog-driven background stars with proper-motion" vs `main.ts:427-428` (`Math.random()`), catalog read only by dead `milkyWay.ts`; "424 moons" vs `main.ts:147` `const showMoons: boolean = false`; gravity vectors (`sceneSetup.ts:209-211`, an empty hidden Group); Oort cloud (no geometry anywhere); Saturn rings (none); planet textures (0 of 25 files loaded); `src/workers/asteroidWorker.ts` (does not exist); "14 pytest modules" (52); three relative links (`(main.ts)`, `(modelWorker.ts)`, `(asteroidCatalogLoader.ts)`) that 404; "FNV-1a fallback" (explicitly rejected at `phase1AsteroidCatalog.ts:427`).
  - Structure tree: 99 of 100 listed paths exist, but **21 of the 42 listed `.ts` files are UNREACHABLE** (reach.mjs), the only live worker (`modelWorker.ts`) is not listed, and the 8 backend modules under active development (`pfss_magnetogram.py`, `gong_magnetogram.py`, `pfss_tracing.py`, `magnetogram_grid.py`, `spherical_harmonics.py`, `process_supervisor.py`, `solar_process_worker.py`, `solar_time.py`) are absent while two untested, un-imported modules (`galactic_tide.py`, `radiation_pressure.py`) are described as features.
  - The GitHub repository description ("…gravity vector visualization, adaptive asteroid detail, and mission trajectory planning") repeats three claims that are FALSE/DEAD.
- Impact: A second engineer cannot learn from the README what the application does, which modules matter, or what the backend integrates with; reviewers/users are told about features that cannot be reached from the UI. Seven months after the cause (`d1484e8`) the README still describes the pre-"Sun Model Lab" product.
- Fix: rewrite README Highlights/Features/Structure from `index.html` + the reach list (the live app = Sun/planets/belts, time controls, explorer, solar observation, SMBH panel); mark unwired modules `(unwired)` in a "Status" table or move them under `src/_unwired/`; fix the three links and the "14" count; regenerate the tree with `git ls-files`; add a 30-line CI check that every path mentioned in README exists (my `work/repo/tree_check.py` does it in 0.1 s) and that numbers such as `424`, `1.9M` match data. Update the GitHub description.
- Prior: K-02 STILL-PRESENT (worse: 64 % vs ≈50 %); K-35 STILL-PRESENT (4 of 5 sub-claims; link sub-claim CHANGED — see §Prior).
- Adversarial check: "aspirational roadmap?" The text is present tense, the title says *Sun Model Lab*, and `main.ts:144-146` itself states "Moon rendering is not currently exposed by the shipped UI". Are the DEAD rows artefacts of `reach.mjs`? Cross-checked by `git grep` importers (`importedBy=[]`), by the 53 ids in `index.html` and the 42 ids `main.ts` binds (none is an engine/planner/satellite control). Is the ratio sensitive to row granularity? Duplicates were folded into the first occurrence; the Highlights+Features-only ratio (36 %) is the stable headline. Survives.

### F-REPO-04 — The README's backend install-and-test path executes zero tests on a clean machine; `backend/requirements.txt` is incomplete and open-ended (K-32 STILL-PRESENT)
- Severity: High   - Class: VERIFIED   - Reach: DOC/DEPS   - Effort: S
- Where: `backend/requirements.txt:1-11`; `README.md:67-71, 449-454`; `ci/backend-test-requirements.txt:1-21` (what CI actually installs).
- Evidence:
  ```
  $ uv venv --python <3.12.13> venv-readme && uv pip install -r backend/requirements.txt     # 31 pkgs: fastapi 0.142.2, starlette 1.7.0, numpy 2.5.3, uvicorn 0.54.0 …
  $ cd backend && python -m pytest --collect-only -q -p no:cacheprovider
  ERROR tests/test_benchmark_endpoint_budget.py - RuntimeError: The starlette.testclient module requires the httpx2 package …   (×11 modules)
  !!!!!!!!!!!!!!!!!!! Interrupted: 11 errors during collection !!!!!!!!!!!!!!!!!!!
  1903 tests collected, 11 errors in 5.47s
  $ uv pip install httpx && python -m pytest --collect-only -q   →  2142 tests collected
  ```
  `fastapi.testclient` needs `httpx`; 11 test modules import it. The same file lists `pytest>=8.0.0` among runtime deps, `pillow>=10.0.0` which **no Python file imports** (AST scan of all 115 `.py`), and open-ended `fastapi/uvicorn/websockets/numpy` ranges, so today's resolution (fastapi 0.142.2/starlette 1.7.0/uvicorn 0.54.0) differs from CI's pins (0.141.1/1.6.0/0.52.4). `import server` and the README's uvicorn command do work with `requirements.txt` alone (3.3 s, 23 routes). `scipy` is not needed by any test (only by `scripts/generate_pfss_harmonic_fixture.py`).
- Impact: The documented `cd backend && pytest` stops at collection (no test is executed); versions silently diverge from the CI-tested set (starlette 1.7.0 already changed its test-client dependency to `httpx2`). A contributor cannot reproduce CI without finding `ci/backend-test-requirements.txt`, which the README never mentions (nor Python 3.12.13 / Node 22.23.2 from `.python-version`/`.nvmrc`).
- Fix: add `backend/requirements-dev.txt` (`-r requirements.txt`, `httpx==0.28.1`, `pytest==9.1.1`) or make README use `pip install -r ci/backend-test-requirements.txt`; delete `pytest` and `pillow` from `backend/requirements.txt`; pin `fastapi`, `starlette`, `uvicorn[standard]`, `numpy` to the CI versions; state the interpreter pins in README Quick Start.
- Prior: K-32 STILL-PRESENT (partial progress: `rebound==5.1.1`, `astropy==8.0.1` now exact)
- Adversarial check: the failure message names the missing package and the fix is one line, so I capped at High (the rubric's Critical wording "prevents a clean-clone build/test" is met only for the README's own command, not for CI). With the dependency added, all 2,142 tests collect (verified).

### F-REPO-05 — CI job structure couples independent gates; the workflow test locks the coupling in; the evidence-upload step masks the real failure
- Severity: Medium   - Class: VERIFIED   - Reach: CI   - Effort: S
- Where: `.github/workflows/r3-r4-science.yml:47-81` (npm test :52, verifier :66-70, upload :73-80); `scripts/ci/tests/test_r3_r4_workflow.py:15, 55, 61`.
- Evidence: one job runs `npm ci → npm test → build → ratchet → runner/workflow contract tests → science manifest` sequentially; the science lane (Python only, 29.5 s) is **last**; `Retain JUnit…` uses `if: always()` with `if-no-files-found: error`. The workflow test hard-codes this shape:
  ```
  assert set(jobs) == {"r3-r4-science", "backend-tests"}
  assert commands.rstrip().endswith("all")
  assert all(not step.get("continue-on-error", False) for step in steps)
  ```
  Run 36307010887: `npm test` red → four later steps *skipped* (not run), then the upload step turned a skipped lane into a second red step ("No files were found…").
- Impact: a frontend assertion failure suppresses the independent scientific gate and the type ratchet; the failing-step list is misleading; fixing the order requires editing the workflow test too.
- Fix: three jobs — `frontend` (npm ci/test/build/ratchet), `science` (pip install, runner/workflow tests, verifier), `backend-tests`; upload with `if: always() && hashFiles('…')!=''` (or `if-no-files-found: ignore`); relax the workflow test to assert each job's own tail; add `concurrency:` to cancel superseded pushes.
- Prior: NEW

### F-REPO-06 — Documented maintenance commands are broken or unsafe, and several scripts depend on undeclared tools (K-33 STILL-PRESENT)
- Severity: Medium   - Class: VERIFIED   - Reach: SCRIPT   - Effort: S–M
- Where: `scripts/ingest-moon-textures.mjs:5`; `scripts/fetch_jpl_sbdb.py:36, 380, 414, 491-492`; `README.md:357-373`; `scripts/verify-moon-frames.mjs:49`, `verify-planet-positions.mjs:41`; `get_errors.mjs`, `testWarp.js`, `testRealisticScale.mjs:11`; `scripts/asteroid/catalog_fetcher.ts`.
- Evidence:
  ```
  $ node scripts/ingest-moon-textures.mjs
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/src/frontend/features/planetary/moonTextureCatalog.js'   # only the .ts exists
  $ (scratch copy, network mocked) python fetch_jpl_sbdb.py
    Updated backend/data/bodies.py: +1 entries
  FileNotFoundError: [Errno 2] … 'src/data/planets.js'          # bodies.py changed: eaff9a11… -> 828c63de… (+438 B)
  ```
  `fetch_jpl_sbdb.py` appends to tracked production data (`backend/data/bodies.py`) and *then* reads the long-deleted `src/data/planets.js` (`PLANETS_JS_PATH`, line 36) — the two edits are not atomic. Also: the `verify-*.mjs` scripts `import { build } from 'esbuild'` (not a declared dependency; works only via Vite's hoisted copy); the three root helpers import undeclared `puppeteer`, use ports 5173/5174/5175, and `testRealisticScale.mjs:11` hard-codes `/home/nomad/.gemini/antigravity/brain/…`; `scripts/asteroid/catalog_fetcher.ts` (1,058 LOC) is outside every tsconfig and needs undeclared `tsx` and `@types/node` (absent from `node_modules/@types`). `package.json` scripts all point at existing files (checked), and `build_asteroid_phase1_dataset.py`, `fetch_gaia_catalog.py`, `fetch_jpl_nbody_ephemeris.py`, `generate_moon_ephemeris.py`, `openai_codex_prompt.py` start (`--help` OK).
- Impact: running the README's `python scripts/fetch_jpl_sbdb.py` leaves the repo half-modified (up to 150 generated entries — defaults 100 asteroids + 30 NEOs + 20 Trojans, minus duplicates — appended to `backend/data/bodies.py`, JS side untouched) and crashes; the moon-texture provenance file claims `generatedBy: scripts/ingest-moon-textures.mjs`, which cannot be re-run.
- Fix: `ingest-moon-textures.mjs` → import the catalog through `tsx`/`vite-node` or move `CURATED_MOON_TEXTURE_CATALOG` into JSON; `fetch_jpl_sbdb.py` → drop the `planets.js` path (or target `planets.ts`), compute both edits in memory and write only if both succeed; declare `esbuild`, `tsx`, `puppeteer` (or delete the three root helpers and replace `testWarp.js` with a declared Playwright smoke test); add a CI step that runs every script with `--help`/imports (0.5 s).
- Prior: K-33 STILL-PRESENT (both halves, executed); K-38 root-puppeteer part STILL-PRESENT; K-53(f) STILL-PRESENT

### F-REPO-07 — 38.7 MiB (71 % of tracked bytes) of textures is referenced by no live code, absent from the build, with no LFS (K-34 STILL-PRESENT)
- Severity: Medium   - Class: VERIFIED   - Reach: DATA   - Effort: S
- Where: `src/assets/textures/*` (25 files); `public/textures/moons/*` (10); `public/solar-systems/manifests/*` (3).
- Evidence (script: basename/stem grep over all tracked code vs `dist/`):
  ```
  tracked 54.1 MiB (451 files); src/assets/textures 38.7 MiB = 71 %; dist/ 5.24 MiB, 0 bytes from src/assets/textures
  19 of 25 files referenced by nothing (13.7 MiB), 6 referenced only by unreachable visualProfiles.ts (earth_topobathy_8192, earth_watermask_2048, mars_albedo_usgs_4096, mars_relief_mola_4096, moon_albedo_lroc_8192, moon_relief_ldem16_5760)
  unreferenced: earth_clouds_2048, earth_day_4096, earth_normal_2048, earth_topobathy_4096, jupiter_day_2048, mars_albedo_usgs_2048, mars_day_2048, mars_relief_mola_2048, mercury_day_2048, milky_way_2mass_equirect_2048/4096, moon_1024, moon_albedo_lroc_1024, moon_relief_lola_1024, neptune_day_2048, saturn_day_2048, uranus_day_2048, venus_atmosphere_2048, venus_day_2048
  ```
  Binary inventory: 41 tracked binaries = 31 `.jpg` (27.8 MB), 5 `.png` (14.2 MB), 1 `.bin` (3.6 MB, the live asteroid catalog), 3 `.pdf` (0.27 MB), 1 `.gz` ≈ 43.7 MiB of the 54.1 MiB.
  `public/textures/moons/*` (1.0 MiB) and `public/solar-systems/manifests/*` are copied into `dist/` but fetched by no source file (the former only by dead `moonTextureCatalog.ts`; the latter only by a backend test). No `.gitattributes`/LFS (`git ls-files | grep gitattributes` → 0). GitHub reports the whole repo at 51,293 KB, so history bloat is modest; the weight is the working tree. Related dead data in the build: `src/data/moons.json` (221 KB, 424 moons) *is* bundled into `dist/assets/index-*.js` (923 kB; moon names found in the bundle) although `showMoons=false` renders none and the explorer lists only star/planet/dwarf; the 4.1 MB `moonEphemerisChebyshev.json` is correctly eliminated with the dead branch.
- Impact: clone/CI checkout cost; README documents these assets as features (F-REPO-03); every texture raises a licence question (F-REPO-15).
- Fix: `git rm` the 19 unreferenced files; move the 6 dead-referenced ones to a release asset/LFS (`.gitattributes: *.jpg *.png filter=lfs`) until a live loader exists; stop copying unused `public/` assets (move to `docs/` or delete).
- Prior: K-34 STILL-PRESENT (now 25 files/38.7 MiB; "three blob versions of the asteroid .bin" not checkable in the shallow history — only 1 version visible)

### F-REPO-08 — `dev:full` under the `network` profile also binds the Vite dev server to the non-loopback host while installed Vite 7.3.1 carries five advisories (two are Windows-only); `dev:ui` has no host guard
- Severity: Medium   - Class: VERIFIED (wiring); exploitation not attempted   - Reach: SCRIPT   - Effort: S
- Where: `scripts/dev-full-config.mjs:104-112` (`buildFrontendArgs`), `scripts/dev-full-config.test.mjs:42-48`, `scripts/run-ui-dev.mjs:85,97`; `package-lock.json` (vite 7.3.1).
- Evidence:
  ```
  > parseDevFullConfig(['--host','0.0.0.0'], {SOLAR_SECURITY_PROFILE:'network'})
  frontend args: vite --host 0.0.0.0 --port 5173
  backend args : -m uvicorn server:app --host 0.0.0.0 --port 8042 --ws-max-size 16384 --no-proxy-headers
  $ node scripts/dev-full.mjs --host 0.0.0.0        # without the profile
  Non-loopback --host requires SOLAR_SECURITY_PROFILE=network
  ```
  `npm audit` ranges for Vite: GHSA-p9ff-h696-f583 "Arbitrary File Read via Vite Dev Server WebSocket" (>=7.0.0 <=7.3.1), GHSA-v2wj-q39q-566r "`server.fs.deny` bypassed with queries" (>=7.1.0 <=7.3.1), GHSA-4w7w-66w2-5vf9, GHSA-v6wh-96g9-6wx3, GHSA-fx2h-pf6j-xcff. `run-ui-dev.mjs` accepts any `--host` unchecked. Plain `npm run dev`/`preview` bind localhost (verified: "Network: use --host to expose").
- Impact: README:51-53 documents `dev:full --host <non-loopback>` as permitted under the network profile ("the backend then also requires `SOLAR_PHYSICS_API_KEYS`") without saying that the Vite dev server is published too — an unauthenticated server whose file-serving advisories are exactly the exposed surface — next to the key-protected API.
- Fix: `npm audit fix` (→ vite 7.3.7, verified in scratch); in `dev-full-config.mjs` keep the frontend on loopback regardless of `--host` (or require an explicit `--frontend-network` flag); apply the same loopback check to `run-ui-dev.mjs`; note in README that exposing the stack means serving `vite build` output, not `vite`.
- Prior: NEW

### F-REPO-09 — Frontend/CI supply chain: 11 dev-toolchain advisories (8 fixable without a major bump), tag-pinned Actions on a deprecated runtime, no update automation, exact-patch `engines`
- Severity: Medium   - Class: VERIFIED   - Reach: DEPS/CI   - Effort: S
- Where: `package.json:6-9, 27-36`; `package-lock.json`; `.github/workflows/r3-r4-science.yml` (`uses:` lines); `.nvmrc`.
- Evidence: `npm audit` = 11 advisories (2 critical, 6 high, 2 moderate, 1 low) in vitest, tinypool, vite, rollup, postcss, nanoid, picomatch, source-map-js, fflate, esbuild, @vitest/mocker; `npm audit --omit=dev` = **0** (runtime dep `three` clean). In a scratch copy `npm audit fix --package-lock-only` moves 11 → **3** (vite 7.3.1→7.3.7, rollup 4.57.1→4.64.0, postcss 8.5.6→8.5.29, nanoid, picomatch, source-map-js, fflate, esbuild 0.27.3→0.28.2, vitest 3.2.4→3.2.7; `package.json` unchanged); the remaining 3 (`vitest`, `@vitest/mocker`, `tinypool`) need `vitest@5.0.3` (semver-major). CI's own install on 2026-09-27 printed "9 vulnerabilities"; today it is 11 with no repo change. The workflow pins by tag (`actions/checkout@v4`, `setup-python@v5`, `setup-node@v4`, `upload-artifact@v4`) and the run log warns: "Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@v4, actions/setup-node@v4, actions/setup-python@v5, actions/upload-artifact@v4". No `.github/dependabot.yml`. `engines` pins exact patch (`node 22.23.2`, `npm 10.9.8`): `npm ci` on 22.22.0/10.9.4 prints `EBADENGINE` and exits 0 (`$S/npm_ci_main.log`).
- Impact: the exposed surface is dev-only, but the count grows silently; every contributor outside the exact patch sees a permanent engine warning (which trains people to ignore it); tag pins can be repointed.
- Fix: `npm audit fix` + commit the lockfile; plan the vitest 5 bump; add Dependabot (npm, pip, github-actions); pin actions by SHA at the node24-capable majors; set `engines` to `>=22.23.0 <23` (or keep exact and add `.npmrc engine-strict=true` so it is enforced rather than nagged); add a non-blocking `npm audit` job.
- Prior: NEW

### F-REPO-10 — Test strategy: the headline "2,142 tests" is 747 functions; no integrated end-to-end test exists; 39 TS modules are never loaded by any test, including live `main.ts` and the SMBH engine
- Severity: Medium   - Class: VERIFIED   - Reach: TEST   - Effort: M
- Where: `backend/tests/` (52 modules); `src/**/*.test.ts` (19) + `scripts/*.test.mjs` (2); `backend/tests/test_ws_resource_contract.py`; `backend/tests/test_seek_optimizations.py`.
- Evidence (full tables T5–T7):
  - **Shape:** 2,142 collected items = 747 `def test_` functions in 52 files (2.9 items/def). Five parametrized sweeps = 828 items (**38.7 %**): `test_pfss_decomposition.py::test_every_isolated_real_mode` 512, three × 97 in `test_pfss_analytic_fields.py`, `test_pfss_cache.py::test_every_published_provider_field_is_validated_before_caching` 25. The two PFSS files alone are 839 items from 18 functions.
  - **Quality is high where it matters:** 2,568 `assert`s (3.4/test), **0** assertion-free tests (AST), **0** skip/xfail markers (4 `importorskip("rebound")` guards; the full run reports 0 skipped), 0 `unittest.mock`; independent oracles (Legendre-polynomial re-derivation, closed-form potential field, scipy fixture reproducible byte-for-byte, Horizons fixtures with recorded provenance). Weaker styles exist: 439 `monkeypatch` calls on module globals (concentrated in 8 API/cache files), structure-only assertions (`test_mission_agents.py::test_mission_planner_agent_emits_recommendation_and_logs` checks keys and `verification.valid`, which the planner computes itself), a loose physical bound (`test_sim_registry.py`: Earth speed `< 0.1` AU/day vs ≈0.0172 true), and a fully faked REBOUND module (`test_seek_optimizations.py:_FakeSimulation`).
  - **No true end-to-end test.** No test binds a live `/ws/sim` session (`websocket_connect` appears 6× — all in `test_ws_resource_contract.py`, all inside `pytest.raises(WebSocketDisconnect)` for pre-engine rejections; every other WS test drives `_ReceiveLoopWebSocket`/`_RecordingCommandRunner` fakes, `test_ws_resource_contract.py:555-600`); the real REBOUND engine is tested only through its Python API (`test_nbody_horizons_accuracy.py`, 5 tests). The live frontend has no WebSocket at all (F-REPO-03). No browser test is wired: the three Puppeteer scripts are manual (F-REPO-06).
  - **Frontend (309 tests, 21 files):** 29 tests (9.4 %) target UNREACHABLE modules (`plannerController` 7, `trajectory/index` 10, `trajectory/localPlanner` 12); import-graph analysis: **39 of 70 non-test TS files (11,865 LOC) are never loaded by any test** — 11 of them LIVE (4,455 LOC: `main.ts` 1,502, `beltRenderer` 669, `kuiperBelt` 517, `textures` 471, `planetShaders` 377, `sceneSetup` 229, `quadtreeLOD` 187, `bodyManager` 172, `modelWorker` 161, `timeController` 95, `textureManager` 75) and 28 unreachable (7,410 LOC); 9 more live files (4,825 LOC: `sunVisuals` 1,749, `smbhPropagation` 694, `solarFlares` 473, `agnShockwaveEngine` 435, `solarFeatureBlending` 397, `smbhPhysicsConstants` 396, `asteroidBelt` 256, `gravitationalWaves` 242, `warpSlipstreamVisuals` 183) are only loaded transitively (seven via `sunController.test.ts` (7 tests), `solarFeatureBlending` also via the solar-client tests, `asteroidBelt` via `phase1AsteroidCatalog.test.ts`) and have no direct assertions. The SMBH set alone is 1,708 LOC with 133 of the 221 tsc errors.
  - **Backend modules with no importer and no test:** `sim/galactic_tide.py` (166), `sim/radiation_pressure.py` (210, imported only by the former), `mission/epo/{runners,sample_episodes,smoke_test}.py` (313).
  - `test_lambert_solver_reference.py` expects 15-digit values (`expected_total_dv_km_s: 7.639904701677509`) with no recorded origin — SUSPECTED snapshot of the solver's own output (a `rootResidualDays` certificate test does provide an independent check).
- Impact: the suite is strong on algebraic/numerical cores and admission guards, but nothing proves that browser → WebSocket → engine → state frames works, and the most-edited, most speculative live code (SMBH, sun visuals, main loop) has no direct tests; part of the frontend test budget protects code that cannot run.
- Fix: (1) add one slow-marked integration test: `with client.websocket_connect('/ws/sim?engine=rebound&protocol_version=…') as ws:` receive `connected`, one state frame, send `set_julian_date` with `jd_time_scale:"TDB"`, assert the echoed epoch and Earth–Sun distance against the Horizons fixture; (2) Vitest tests for the public functions of `smbhPropagation.ts`/`agnShockwaveEngine.ts` with analytic oracles (units: rigidity/gyroradius/arrival time); (3) a Playwright smoke (page loads, no console errors, click `#trigger-agn-shockwave`) replacing `testWarp.js`; (4) move tests of unwired modules next to a `docs/unwired.md` list or mark them `describe.skip` until wired; (5) record the origin of the Lambert expectations (cite the independent solver) or regenerate them with an independent implementation.
- Prior: K-38 (CHANGED — a test runner now exists: 21 files/309 tests; the `asteroidCatalogLoader.test.ts` re-export is gone)

### F-REPO-11 — Wall-clock-dependent tests: 24 solar-generation tests consume 85 % of the 550 s suite, five assert a real 18 s product deadline and fail on the CI runner, one process test flakes under load
- Severity: Medium   - Class: VERIFIED   - Reach: TEST/CI   - Effort: M
- Where: `backend/server.py:917-924` (`SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS` default 18.0, hard max 19.0); `backend/tests/test_solar_physics_api.py`, `test_solar_physics_determinism.py`, `test_solar_process_worker_contract.py`, `test_solar_physics_model.py`, `test_solar_process_supervisor.py:36,150`.
- Evidence: `$S/pytest_main.log` `--durations`: the 40 slowest = 499 s (91 % of 549.6 s); 24 of them (solar generation) = **469.6 s (85 %)**, up to 41.5 s per test. Five tests fail with `503 solar_compute_timeout`: four end at 18.01–18.02 s (`test_solar_physics_api.py::test_solar_physics_returns_3d_coronal_features`, `…::test_solar_physics_hybrid_mode_without_live_data_is_stable`, `…::test_solar_physics_enforces_rate_limit`, `test_solar_physics_determinism.py::test_jd_inside_the_window_is_accepted`) and `…::test_different_fidelity_yields_a_different_payload` takes 35.05 s (second of two requests times out); **the same five failed on the GitHub runner** (`7 failed … in 492.10s`, identical test ids). `test_hard_timeout_kills_reaps_and_recovers_capacity` failed locally with `AssertionError: child process did not publish its PID` (3.0 s wait, `test_solar_process_supervisor.py:36`) and passed in CI. Aggregates: 22 `sleep`, 40 wall-clock reads, 123 thread/process/subprocess references in 12 files; no `pytest-timeout` (a hang costs the job's 30-minute limit).
- Impact: CI fails for a reason unrelated to correctness (hardware speed vs a product SLA), the suite cannot be run on a busy laptop without spurious reds, and a single 8-minute suite discourages local runs.
- Fix: in the five tests monkeypatch `server.SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS`/use `fidelity=preview` with small `max_features` so they test API behaviour, not generation speed; mark the 24 heavy tests `@pytest.mark.slow` and run them in a separate job; replace the fixed 3.0 s PID wait with an event/`Popen.poll` wait of ≥10 s; add `pytest-timeout==…` (120 s) to `ci/backend-test-requirements.txt`.
- Prior: NEW

### F-REPO-12 — Process: shallow local history, whole-day bulk pushes, no PR/review gate, mislabelled commit types, stale branches
- Severity: Medium   - Class: VERIFIED   - Reach: PROCESS   - Effort: S
- Where: repository history/settings (tables T9).
- Evidence: see caveat 1 (291 local vs **604** real commits). Visible 291 commits: 178 (61 %) follow Conventional Commits, 200 (69 %) have no body; `fix:` is used for 128 commits including `931faae2` "fix(trajectory): contain planning amplification" (+11,538/−681 lines) and `bd48a7de` "fix: validate and correct major moon ephemerides" (+5,331); 12 commits exceed 2,000 changed lines; the single change "docs: prune superseded sun-focus planning artifacts" exists three times (`7cab690f`, `d834dbe5`, `13ca9ec5`, same timestamp, different parents). Agent attribution: 35 commits carry a trailer (34 `Co-Authored-By: Claude Opus 5…`, 1 `Cursor`) while 138 commits were authored on 2026-09-26 alone and 37 in a single hour — attribution coverage cannot be established from trailers. 109 commits landed in one push (F-REPO-02). `main` unprotected, 0 PRs. Branches: `sun-focus` (the user's checked-out branch) is a strict ancestor 184 commits behind and README's title still says "Sun-Focus branch"; `fix/trajectory-amplification-defense-in-depth` is fully merged (166 behind).
- Impact: at this commit rate with no gate, defects of the F-REPO-01/02 kind (CI never run, stale patches, README drift) are the expected steady state; the shallow clone makes forensic questions ("when did X break?") unanswerable locally.
- Fix: `git fetch --unshallow`; require PRs + the CI jobs on `main`; delete the merged branch and fast-forward or retire `sun-focus`; use `feat:` for features (or drop conventional-commit claims); merge rather than replaying the same patch onto several lines (the triplicated commit).
- Prior: NEW (K-36 relates to the missing history entries, see §Prior)

### F-REPO-13 — The CI backend "exact lock" is not a lock: 14 of 34 installed packages float; no hashes; one pinned package is unused; scipy is installed but its only consumer never runs in CI
- Severity: Low   - Class: VERIFIED   - Reach: DEPS/CI   - Effort: S
- Where: `ci/backend-test-requirements.txt:1-21` (header "Exact interpreter packages for the full backend test lane"), `ci/r3-r4-requirements.txt`.
- Evidence: the file pins 20 distributions; a CI-equivalent environment contains 34 (+pip). Unpinned transitive packages: `annotated-doc, annotated-types, anyio, certifi, click, h11, httpcore, httptools, idna, pydantic-core, python-dotenv, typing-inspection, uvloop, watchfiles` (brought in by fastapi/starlette/httpx/pydantic/`uvicorn[standard]`). `Pillow==12.3.0` is imported by no file. `scipy==1.18.0` (35 MB) is installed in both lanes but only `scripts/generate_pfss_harmonic_fixture.py` imports it, and CI never runs that script (its `--check` passes in 0.4 s). Neither file uses `--require-hashes`. By contrast `ci/r3-r4-requirements.txt` **is** a complete closure (12 packages = the 12 the runner version-checks).
- Impact: backend CI is not reproducible bit-for-bit (the very property the R3/R4 lane enforces for its own six nodes); wheels are trusted by name+version only.
- Fix: generate the lock with `uv pip compile --generate-hashes`/`pip-compile --generate-hashes` and install with `--require-hashes`; drop `Pillow`; add the fixture `--check` step so scipy has a consumer.
- Prior: K-32 (related)

### F-REPO-14 — R3/R4 verifier soundness notes: kill-reason regex matches traceback source; pins are self-attesting; offline guard has two holes
- Severity: Low   - Class: VERIFIED (toy fixture; the six real mutants are unaffected)   - Reach: CI   - Effort: S
- Where: `scripts/ci/verify_r3_r4.py:607` (regex search over `stdout+stderr+junit`), `:313-345` (`_OFFLINE_GUARD`), manifest `inputs`.
- Evidence: (a) *Kill reason.* The runner accepts a mutant when exactly one test fails and `re.search(expected_assertion_regex, evidence + junit_text)` hits; pytest prints the failing statement's source, so an exception raised while evaluating the tagged statement also matches. Toy repro with the runner's own fixture: test `assert 1 / (science.VALUE - 3) == -1, 'SCIENCE-001 …'`, mutant `VALUE = 3` → JUnit `failure message="ZeroDivisionError: division by zero"`, tag occurs once (in the traceback source), verifier exit 0, status `killed`. For the six real mutants every failure is an `AssertionError` carrying the tag (`E AssertionError: R4-LEGENDRE-RECURRENCE mode=(2, 0)`, `err_msg="R4-…"`), so no false kill exists today. (b) *Pins are self-attesting.* Hashes of 13 inputs live in the same repo and are refreshed by the same commits that edit those files (`f579781, b465aaa, 3cb014b, 16c36e0, 2620db9, 17d1e63` all touch the manifest; `17d1e63` exists only to refresh hashes) — a tripwire against accidents, not against a changed test+hash; no CODEOWNERS/protection (F-REPO-02). (c) *Guard.* Blocks `connect/connect_ex/sendto/create_connection/urlopen`; **`socket.sendmsg` (UDP) and `getaddrinfo` pass** (probe output in Scope). README states it is "not container-level isolation" (honest). (d) A committed `pytest.ini` with `addopts = -p no:r3_r4_pytest_guard` does **not** disable the guard (verified), and exact collection catches `-k/--deselect` tampering.
- Impact: low today; the first two weaken the documented guarantee "a mutant that fails for anything other than its declared assertion regex fails the lane".
- Fix: match the regex only against `E   ` lines of the failure text (or the `<failure message>` first line) and require `type="AssertionError"`; add `--update-pins` to regenerate hashes in one reviewed diff; block `sendmsg`/`getaddrinfo` (or run the lane with `unshare -n` in CI).
- Prior: NEW

### F-REPO-15 — No LICENSE/NOTICE; third-party asset and data licences are unrecorded except for moons; one shipped texture is flagged "verify for redistribution"
- Severity: Low (private repo; becomes Medium on publication)   - Class: VERIFIED   - Reach: DOC/DATA   - Effort: S
- Where: repo root (no `LICENSE*`, `NOTICE*`, `CREDITS*`; `git ls-files | grep -i -E "attribution|credit|notice|licen[cs]e|copying|third.?party"` → only `moon_texture_attribution.json`); `README.md:410-422`; `public/textures/moons/moon_texture_attribution.json:37`; `backend/sim/solar_realtime_data.py:327-329`.
- Evidence: the README "Data Sources" table lists "Solar System Scope texture pack", "three.js planetary texture set", "USGS/MOLA", "2MASS PIA04250", "d3-celestial" with **no licence or attribution statement**; only `moon_texture_attribution.json` records per-asset `license` + sha256 + source, and it marks the Deimos texture "Unspecified by provider; verify for redistribution" although the file is copied into `dist/`. The backend declares SILSO data as **CC BY-NC 4.0** (`solar_realtime_data.py:327`). Solar System Scope textures are, to my knowledge, published under CC BY 4.0 (attribution required) — could not be re-verified here (egress to that site is blocked). `package.json` has no `license`/`repository` fields.
- Impact: with the repo private there is no third-party exposure now; on publishing or sharing the app/dist, attribution duties (CC BY) and the NC restriction on SILSO-derived data would be unmet, and no one else may legally reuse the code.
- Fix: add `LICENSE` (author's choice) + `THIRD_PARTY_NOTICES.md` (one row per asset/data feed: source URL, licence, required credit — extend the moon attribution schema to `src/assets/textures`); drop or replace the Deimos texture; add `"license"` to `package.json`; show the required credits in the UI footer.
- Prior: K-53(g) STILL-PRESENT (no LICENSE/CONTRIBUTING/pyproject; CI now exists)

### F-REPO-16 — The two rolling dev logs and several status docs are stale or violate their own rules (K-53, K-36 STILL-PRESENT)
- Severity: Low   - Class: VERIFIED   - Reach: DOC   - Effort: S
- Where: `Development_Improvements.md:17, 30-35, 50-291`; `Development_History_Context.md:139,148`; `typescript_migration_plan.md:9-12`; `src/sim/asteroids/README.md` (Integration).
- Evidence (table T2): `Development_Improvements.md` is 72,839 B/1,354 lines against its own *hard cap* "48 KB or 500 lines … prune … add one line noting prune date" (1.5×/2.7×; no prune note in the log), and its "newest first" rule is broken (lines 50-263 dated 2026-03-07, line 291 dated 2026-03-22). Both logs' newest entry is **2026-03-22** — six months and 251 commits (incl. the entire moon-ephemeris, PFSS/GONG, R3/R4 and CI work) are unrecorded; neither mentions "Sun Model Lab"/`sun-focus`. `Development_History_Context.md` has 49 of 130 referenced repo paths missing and an entry still `Status: IN-PROGRESS` from 2026-03-07; it states "the only existing frontend workerized compute path is satellite propagation" (line 139/148) while README says two paths and HEAD has one live (`modelWorker.ts`) — all three disagree. `typescript_migration_plan.md:9` "82 total (53 .ts, 0 .js)" is self-inconsistent, its LOC (15,715) predates the 27,247 LOC now, 18 of 53 path references are gone. `src/sim/asteroids/README.md` claims the pipeline "is consumed by … beltRenderer.ts and … main.ts" — `asteroidPipeline.ts` has no importer. Positives: `docs/adr/0001-0005` and `scripts/ci/README.md` are current and hedged.
- Impact: new contributors (and agents) read instructions to "check this file before and after significant implementation work" in logs that stopped six months ago.
- Fix: freeze both logs with a one-line "archived 2026-03-22" banner (or delete), keep ADRs + one `CHANGELOG.md` generated from conventional commits; fix or delete `typescript_migration_plan.md` and the asteroid-pipeline README.
- Prior: K-53 (a)(b)(c) STILL-PRESENT; K-36 STILL-PRESENT

### F-REPO-17 — Repository clutter, duplicated research notes, personal paths
- Severity: Low   - Class: VERIFIED   - Reach: DOC/HYGIENE   - Effort: S
- Where: repo root; `my-notes/`; `agent-notes/`; `.vscode/extensions.json`; `docs/adr/0001-pfss-harmonic-convention.md:53`.
- Evidence: 44 tracked root files, only 8 are config/entry (`README.md, package*.json, tsconfig.json, index.html, .gitignore, .nvmrc, .python-version`); 22 research/notes files (189 KB: 11 `superluminal_*` + `.tex/.bib`, `quick_sun_notes.md` 1,092 lines with no title, `sun_physics_sota_evaluation.md.resolved`), 7 dev logs (200 KB), 4 debug artifacts (`debug_screenshot*.png` 544 KB — a stale March UI, `recent_changes.diff` 13 KB, `sun_diff.diff` **0 bytes**), 3 ad-hoc scripts (F-REPO-06). 122 `.md` files = 40,420 lines vs 89,490 lines of code (`agent-notes/` 24 files/1.18 MiB; `my-notes/` 74 files/1.40 MiB). **4 byte-identical groups = 9 files (5 redundant copies, 115 KB)** in `my-notes/` (K-53 said 3), plus near-duplicates (`…MASTER_…T0900-104200.md` ≡ `…T0900.md` by line set; three `ACCURACY_REPORT_2026-02-15_*` at 0.89 Jaccard; two codebase-evaluation prompts at 0.79). `/home/nomad/miniconda3/envs/icl-vram-py312-cu132/bin/python` appears in ADR 0001 (the canonical reproduction command) and the PFSS plan; `h29-…implementation_plan.md` has `file:///home/nomad/Documents/…` links. `.vscode/extensions.json` recommends only `henrikdev.ag-quota`. One tracked CRLF file (`solar-systems/nearby_star_systems_ranked_full.csv`). `.gitignore` lacks `.env*`/`*.tsbuildinfo` (no secrets are tracked — pattern scan clean). Tracked caches: none.
- Impact: signal-to-noise for a reader and for agents indexing the repo; the ADR's command cannot be run by anyone else.
- Fix: move `my-notes/`, root research files and `agent-notes/` into `docs/archive/` (or a separate repo), delete duplicates, debug artifacts, `sun_diff.diff`; replace the conda path in ADR 0001 with `python scripts/generate_pfss_harmonic_fixture.py --check` under the pinned interpreter; add `.env*` to `.gitignore`.
- Prior: K-53(e) STILL-PRESENT (worse: 4 groups); K-38 partial

---

### Evidence tables

#### T1 — README claims table (109 rows; counting rule: atomic claims, repeated claims folded into the first row; status = true on HEAD as a reachable runtime/doc fact, numerical correctness not judged)

Granularity: README's 14 Solar-model bullets and 4 SMBH bullets are two SOL-owned summary rows (A07/A08, F14/F15); the 8 endpoint `curl` lines, the 7 tech-stack entries and the 11-row data-source table are one row each except where status differs; repeated statements (satellites, clouds, Oort, gravity vectors, asteroid refinement) are folded into their first row.

Legend: **TRUE** = true on HEAD; **DEAD** = TRUE-BUT-DEAD-CODE (exists only in unreachable modules or behind a hard-disabled constant); **FALSE**; **UNVERIF**; **SOL-owned** = summary row for reviewer SOL (excluded from ratios).

Totals: TRUE 58 · DEAD 25 · FALSE 20 · UNVERIF 2 · SOL-owned 4 → **58/105 = 55.2 %** (53.2–56.9 % if SOL rows are all false/true). Section ratios: Lead+Highlights 6/19 (32 %), TypeScript status 8/11 (73 %), Quick start 4/4, Backend 8/9 (89 %), Project structure 1/5 (20 %), Features 9/23 (39 %), Data model + commands 11/15 (73 %), Physics notes 4/7 (57 %), Data sources 4/8 (50 %), Stack/build/tests 3/4 (75 %).

| ID | README line | Claim | Status | Evidence |
|---|---|---|---|---|
| A01 | 3 | Real-time 3D solar-system simulator running entirely in the browser | TRUE | `npm run build` OK (3.5 s); entry index.html -> src/main.ts; Local mode needs no backend |
| A02 | 3 | ...and mission-design workbench | DEAD | index.html (53 ids) has no planner/mission control; plannerController.ts / routeRenderer.ts unreachable (reach.mjs) |
| A03 | 3 | Optional Python backend for N-body, trajectory planning, solar observation | TRUE | backend/server.py registers 23 routes incl. /ws/sim, /trajectory/*, /mission/*, /solar/*; but the live frontend calls only /solar/* (see D02) |
| A04 | 7 | Sun + 8 planets + Pluto with axial tilt and spin | TRUE | src/data/planets.ts ids sun..pluto; src/main.ts:309-316 applies tilt + spin axis |
| A05 | 7 | ...and per-planet visual profiles | DEAD | src/frontend/features/planetary/visualProfiles.ts (331 LOC) importedBy=[] |
| A06 | 8 | 424 moons from the NASA/JPL satellite-element table | DEAD | src/data/moons.json has 424 records, but src/main.ts:144-147 `const showMoons: boolean = false` (comment: 'Moon rendering is not currently exposed by the shipped UI'); no toggle in index.html |
| A07 | 9 | Physics-grounded Sun model, 13-phase overhaul (limb darkening ... SDO/AIA blending) | SOL-owned | summary for SOL: limb darkening/Planck/K-corona/spicules/flares/PFSS/AIA are in LIVE sunVisuals.ts, solarFlares.ts, solarMagnetics.ts; prominences (solarProminences.ts 373 LOC) and solarWind.ts (194) are UNREACHABLE; 'Neupert' appears in no code file |
| A08 | 10 | SMBH shockwave simulation (AGN warp-wave engine, Sgr A*, Fermi bubbles, exotic hypotheses) | SOL-owned | summary for SOL: LIVE (index.html:290-345; agnShockwaveEngine.ts/smbhPropagation.ts reachable; 133 of 221 tsc errors; no direct unit tests) |
| A09 | 11 | Adjustable clock: pause, reverse, time-warp, jump-to-date | TRUE | index.html:85-90 slider -120..+120 d/s; :71 'Jump to now' (no arbitrary-date jump) |
| A10 | 12 | Catalog-driven background stars with proper-motion propagation | FALSE | src/main.ts:427-428 `Math.random()` sphere (6,000 pts); stars_catalog.json (5,042 x [ra,dec,mag,bv], no proper motion) is read only by unreachable milkyWay.ts |
| A11 | 12 | ...and synthetic Milky Way band | DEAD | src/frontend/rendering/milkyWay.ts (464 LOC) importedBy=[] |
| A12 | 13 | Nearby star systems with navigable 3D manifests + seamless zoom transitions (also README:275-277) | DEAD | nearbySystemsRenderer.ts, localSystemRenderer.ts, camera/transitions.ts unreachable; no src file fetches public/solar-systems/manifests/* |
| A13 | 14 | Asteroid belt with element-driven orbits | TRUE | src/sim/asteroidBelt.ts + beltRenderer.ts (GPU Kepler) are live |
| A14 | 14 | ...adaptive close-up detail refinement (also README:280,400) | FALSE | no such logic in live code; 'adaptive' only in unreachable cameraController.ts |
| A15 | 14,282 | Phase-1 real-catalog pipeline, '1.9M particles' / 'up to 1.9M cataloged' | FALSE | main.ts:183-184 target 50,000 / source limit 100,000; shipped dataset has 100,000 rows (meta.json); '1.9M' appears only in design notes |
| A16 | 15 | Kuiper belt particle field with binary KBO support (also README:287-291) | TRUE | main.ts:460 generateKuiperBelt(5_000); beltRenderer.ts companionMesh; backend/sim/kuiper.py |
| A17 | 15 | ...and approximate Oort cloud shell (also README:230,404) | FALSE | no Oort geometry anywhere in src (only `updateOortVisibility`/`toggleOort` hooks in unreachable animationLoop.ts/uiBindings.ts) |
| A18 | 16 | Earth satellite layer (ISS + GEO) with TLE propagation + J2 (also README:234,394) | DEAD | satelliteSystem.ts (1,056 LOC) importedBy=[] |
| A19 | 17 | Real-time Earth clouds via NASA GIBS WMS (also README:395) | DEAD | cloudDataPipeline.ts (255 LOC) importedBy=[] |
| A20 | 18 | Interplanetary route planner (direct + multi-gravity-assist) | DEAD | frontend plannerController.ts / trajectory/localPlanner.ts / index.ts unreachable; backend POST /trajectory/plan exists (API only) |
| A21 | 19 | Multi-agent mission planner (trajectory, logistics, mining, risk) | DEAD | backend POST /mission/plan + 4 agents (mission/agents.py:47,99,152,223) exist; no UI |
| B01 | 23 | src is fully TypeScript-native; legacy .js shims removed | TRUE | `git ls-files src \| grep -E '\.(js\|mjs\|cjs)$'` -> empty |
| B02 | 24 | All // @ts-nocheck directives removed | TRUE | `git grep @ts-nocheck -- src` -> 0 hits |
| B03 | 24 | Strict type checking now active on every source file | TRUE | tsconfig.json strict:true, include src/**/*.ts. Caveat: `npm run typecheck` exits 2 with 221 errors in 6 files (151 in LIVE files); the CI ratchet is red |
| B04 | 25 | Annotations added; remaining files still need explicit types | TRUE | consistent with 221 remaining errors (mostly TS7006/TS7034/TS7005) |
| B05 | 26 | Browser runtime driven from src/main.ts | TRUE | index.html -> src/main.ts (1,501 lines) |
| B06 | 26 | ...with two workerized paths: satellite propagation and model propagation | DEAD | live worker = modelWorker.ts only (main.ts:761); the satellite worker is instantiated only in unreachable satelliteSystem.ts:691 |
| B07 | 26-27 | Three file links `(main.ts)`, `(modelWorker.ts)`, `(asteroidCatalogLoader.ts)` resolve | FALSE | hrefs are README-relative; none of those files exist at repo root |
| B08 | 27 | Binary pack/read utilities in asteroidCatalogLoader.ts | TRUE | src/data/asteroidCatalogLoader.ts:153 writeAsteroidCatalogBinary, :203 readAsteroidCatalogBinary |
| B09 | 27 | Loader supports SHA-256 via WebCrypto with FNV-1a fallback | FALSE | SHA-256 yes (phase1AsteroidCatalog.ts:355) but FNV is explicitly rejected (:427 'FNV and unspecified hashes are not integrity substitutes') |
| B10 | 27 | Parallelized binary + metadata fetching | TRUE | phase1AsteroidCatalog.ts:770 Promise.all([fetch(url), metadataLoad]) |
| B11 | 28 | Ongoing hardening: replace implicit any | TRUE | tsc output dominated by TS7006/TS7031/TS7034 implicit-any |
| C01 | 32-37 | `npm install` + `npm run dev` | TRUE | works; with Node 22.22.0/npm 10.9.4 prints EBADENGINE (required node 22.23.2, npm 10.9.8) and exits 0 (npm_ci_main.log) |
| C02 | 42 | `npm run dev:ui -- --width --height --render-scale --max-pixel-ratio` | TRUE | scripts/run-ui-dev.mjs:45-60; consumed at src/frontend/app/sceneSetup.ts:97-100 |
| C03 | 51 | dev:full binds both processes to 127.0.0.1 | TRUE | scripts/dev-full-config.mjs:2,20-37; scripts/dev-full-config.test.mjs (15 tests pass in CI) |
| C04 | 51-53 | Non-loopback --host rejected unless SOLAR_SECURITY_PROFILE=network; backend then requires SOLAR_PHYSICS_API_KEYS | TRUE | dev-full-config.mjs:84-92; backend/server.py:552-553 (caveat F-REPO-08: under `network` the Vite dev server is bound to that host too) |
| D01 | 57 | Frontend runs standalone in Local (Keplerian) mode | TRUE | main.ts propagates with src/sim/orbitMath.ts; no backend dependency for rendering |
| D02 | 57,73 | Switch engines in a UI dropdown; 'choose REBOUND or TudatPy in the frontend and click Connect' | FALSE | index.html has no engine select / Connect button; main.ts has no WebSocket; the only client (simulationClient.ts:128) is unreachable; stateStore.ts:25,34 keeps vestigial `backend: 'local'\|'rebound'\|'tudat'` and `serverConnected` fields |
| D03 | 59-63 | Engine table: Local / REBOUND IAS15 via FastAPI+WS / TudatPy falls back to REBOUND | TRUE | backend only: rebound_nbody.py; server.py:4750-4752 fallback warning 'Engine `tudatpy` unavailable; using `rebound`' |
| D04 | 67-71 | Backend start commands | TRUE | clean uv venv from backend/requirements.txt: README's exact uvicorn command (incl. `--reload --no-proxy-headers --ws-max-size 16384`, spare port) starts; `/health`, `/info`, `/bodies`, `/trajectory/capabilities`, `/mission/capabilities`, `/solar/capabilities` → HTTP 200, rebound 5.1.1 available; `import server` 3.3 s, 23 routes |
| D05 | 75-84 | Security profiles: local default; network fails closed without keys; CORS deny-all; trusted-proxy CIDRs; proxy headers off | TRUE | server.py:515-602; test_solar_security.py (50 items). BACKEND reviewer owns depth |
| D06 | 86-89 | Rate-limit identity stores: fixed ceilings, TTL, LRU eviction | TRUE | server.py:367-404 (OrderedDict popitem/move_to_end), :956 |
| D07 | 90-91 | Profile covers solar HTTP endpoints only; no route-wide auth | TRUE | accurate and appropriately hedged |
| D08 | 93-97 | WebSocket query parameters fps, stream_hz | TRUE | server.py:4794-4803 (server side; no live client sets them) |
| D09 | 99-110 | Eight diagnostic endpoints (/health ... /solar/realtime) | TRUE | all 8 present in app.routes (also undocumented: /nearby-systems, /solar/capabilities, /trajectory/plan, /health/live) |
| E01 | 114-219 | Tree of 100 paths | TRUE | 99 of 100 listed paths exist (script work/repo/tree_check.py) |
| E02 | 181 | src/workers/asteroidWorker.ts 'Off-thread asteroid processing' | FALSE | file does not exist; the only live worker (modelWorker.ts) is not listed |
| E03 | 116-219 | Listed modules are the application | DEAD | 21 of the 42 listed .ts files are UNREACHABLE (animationLoop, cameraController, inputHandler, labelSystem, simulationClient, plannerController, routeRenderer, uiBindings, localSystemRenderer, nearbySystemsRenderer, transitions, trajectory/*, milkyWay, orbitRenderer, lodManager, asteroids/*, asteroidTaxonomyResolver) |
| E04 | 201 | backend/tests = '14 pytest modules' | FALSE | 52 test_*.py modules, 2,142 collected items (`pytest --collect-only`) |
| E05 | 195-196 | backend/sim radiation_pressure.py (SRP/PR/Yarkovsky) and galactic_tide.py (Heisler-Tremaine) | DEAD | galactic_tide.py: 0 importers, 0 tests; radiation_pressure.py imported only by galactic_tide.py (also README:404) |
| F01 | 224-226 | Time controls (pause, reverse, warp, jump to present) | TRUE | index.html:59-98 |
| F02 | 230 | Display toggles: orbit lines, labels, moons, asteroid belt, Kuiper belt, Oort cloud | FALSE | Display section (index.html:113-152) has orbits, magnetic field, labels, realistic scale, AIA channel only |
| F03 | 231 | Milky Way appearance: standard / enhanced / 2MASS | DEAD | milkyWay.ts unreachable; no control in index.html |
| F04 | 232 | Realism locators (gold labels, arrow, halo) | DEAD | only in unreachable labelSystem.ts/localSystemRenderer.ts/visualProfiles.ts |
| F05 | 233,396 | Gravity vectors (combined acceleration per massive body) | FALSE | sceneSetup.ts:209-211 creates an empty hidden Group; nothing populates or toggles it |
| F06 | 238 | Explorer: search all bodies; smooth focus/follow | FALSE | main.ts:658-660 lists only star/planet/dwarf ('Find a major body', index.html:204); lerp smoothing exists (:597-599) |
| F07 | 242 | Earth: synthetic terrain displacement + distance-based surface LOD | TRUE | main.ts:326 PlanetQuadtree for earth/moon/mars; planetShaders.ts ridged-noise displacement |
| F08 | 242 | Earth: 4K day map, 2K normal, cloud shell, GIBS ingest, LEO/GEO rings | DEAD | earth_day_4096.jpg/earth_normal_2048.jpg referenced by no code; topobathy/watermask only by dead visualProfiles.ts; cloud/ring code in dead modules |
| F09 | 243-244 | Moon albedo+relief with LOD; Mars USGS albedo + MOLA relief | DEAD | referenced only by unreachable visualProfiles.ts; main.ts loads no texture files; moons hidden |
| F10 | 245 | Mercury..Neptune 2K day textures | FALSE | 6 *_day_2048.jpg files referenced by nothing; bodies use procedural canvases (textures.ts:450) |
| F11 | 246 | Saturn ring system | FALSE | no ring geometry in src (`git grep RingGeometry` empty) |
| F12 | 247 | Axial tilt + spin applied with ecliptic-longitude pole directions | TRUE | main.ts:309-316 |
| F13 | 248 | Oblateness rendering (equatorial/polar radii) | DEAD | only localSystemRenderer.ts:312-313 (unreachable); main.ts uses uniform setScalar |
| F14 | 250-264 | Solar model (14 bullets: limb darkening ... data assimilation) | SOL-owned | see A07; per-feature correctness is SOL's |
| F15 | 266-273 | SMBH shockwave modeling (4 bullets) | SOL-owned | see A08 |
| F16 | 282 | Seeded PRNG for deterministic belt generation | TRUE | asteroidBelt.ts:63-66 mulberry32, seed 42 (main.ts:459) |
| F17 | 283 | Asteroid processing off-thread via Web Worker | FALSE | no asteroid worker exists (E02) |
| F18 | 284 | Sun/Jupiter/Saturn perturbation model for the detail layer | FALSE | perturber uniforms exist (beltRenderer.ts:22,66) but there is no 'detail layer' |
| F19 | 289-291 | Kuiper: element-driven field, binary mutual orbits, backend module | TRUE | kuiperBelt.ts, beltRenderer.ts companionMesh, backend/sim/kuiper.py + test_kuiper_binary.py |
| F20 | 295-297 | Trajectory planner UI: Direct / Plan Route / objectives | DEAD | plannerController.ts etc. unreachable |
| F21 | 296 | 'up to 2 gravity-assist flybys' | FALSE | backend allows max_assists <= 3 (server.py:2812 `le=3`, capabilities :3504) |
| F22 | 298-299 | Backend Lambert + MGA with flyby feasibility; POST /trajectory/lambert, /porkchop | TRUE | routes at server.py:3815,3914; test_mga_flyby_physics.py, test_lambert_solver_reference.py. BACKEND owns depth |
| F23 | 301-304 | POST /mission/plan orchestrates Trajectory/Mining/Logistics/Verifier agents | TRUE | mission/agents.py:47-261; test_mission_agents.py |
| F24 | 306-309 | GET /benchmark/accuracy; POST /benchmark/accuracy/report writes markdown | TRUE | server.py:4113,4167; accuracy.py:656 write_text (BACKEND: K-26 write path) |
| F25 | 311-315 | GET /solar/physics, /solar/realtime, /solar/realtime/aia-tile | TRUE | server.py:3276,3012,3063 |
| G01 | 319-321 | Browser planets from JPL approximate elements + secular rates; visualization-grade | TRUE | planets.ts:46,74,106 secularRates; `node scripts/verify-planet-positions.mjs` -> passed (48 rows, 3.69e7 km total) |
| G02 | 322-329 | REBOUND start state: committed Horizons vectors, DE440 GM ratios, Earth+hidden Moon, barycenters 4-9 | TRUE | backend/data/ephemerides/*.json; data/initial_conditions.py:25; test_nbody_initial_conditions.py. BACKEND/SOL own depth |
| G03 | 330-332 | jd_time_scale 'TDB' required on set_julian_date | TRUE | test_server_validation.py::test_set_julian_date_requires_the_engine_time_scale |
| G04 | 333-334 | 424-moon inventory + approximate fallback elements, not osculating | TRUE | moons.json (424 records) |
| G05 | 335-336 | Non-ecliptic fallback moons precessed in native Laplace frame | DEAD | sourceFrameOrbit.ts is live + tested (4 tests) but moons are excluded from the model worker (main.ts:152-155) |
| G06 | 337-342 | Fitted Titan/Iapetus/Phoebe/Cordelia artifact with hashes + held-out validation, JD 2451545.0-2469807.5 | TRUE | moonEphemerisChebyshev.json keys (sourceRowsSha256, heldOutRowsSha256, validation); coverage verified; moonFrames.horizons.test.ts (27) pass. Not rendered (A06) |
| G07 | 340 | Planet entries carry axial-tilt, spin, pole-longitude metadata | TRUE | planets.ts (10 axialTilt fields); main.ts:309-311 |
| G08 | 341 | Star catalog derived from d3-celestial + optional Gaia | UNVERIF | 5,042-star file exists; its upstream is recorded nowhere in the repo; unused by live code (A10) |
| G09 | 343-347 | `npm run update:moons` | TRUE | scripts/update-moons-data.mjs (86 LOC); not run (network + writes src/data/moons.json) |
| G10 | 349-355 | `npm run generate:moon-ephemeris` / `verify:moon-ephemeris` | TRUE | scripts/generate_moon_ephemeris.py --help OK; needs Horizons network |
| G11 | 357-361 | `npm run ingest:moon-textures` | FALSE | `node scripts/ingest-moon-textures.mjs` -> ERR_MODULE_NOT_FOUND ...moonTextureCatalog.js (only .ts exists) [K-33] |
| G12 | 363-367 | `python scripts/fetch_gaia_catalog.py` | TRUE | --help OK; network; output file unused by live code |
| G13 | 369-373 | `python scripts/fetch_jpl_sbdb.py` | FALSE | mutates backend/data/bodies.py (+438 B in scratch run, mocked network) then FileNotFoundError on src/data/planets.js [K-33] |
| G14 | 375-382 | `python scripts/fetch_jpl_nbody_ephemeris.py --check` / `--write` | TRUE | flags exist (--help); needs network |
| G15 | 384-388 | `npm run phase1:asteroid-dataset` | TRUE | script exists; --dry-run still queries SBDB |
| H01 | 392 | Frontend propagation is Keplerian two-body, not N-body | TRUE | orbitMath.ts / solarSystemModel.ts |
| H02 | 393 | REBOUND 'high' = default accuracy-gated IAS15; WHFast/Mercurius 'normal' | TRUE | rebound_nbody.py:107 `return "high" if self._integrator == "ias15" else "normal"` |
| H03 | 397-399 | Fitted moon ephemerides authoritative only in 2000-2050; runtime refuses known-bad fallback outside | DEAD | moonEphemeris.ts is live and tested but is invoked only when showMoons (main.ts:148-151) |
| H04 | 402 | Transfer arcs drawn as smooth visual curves | DEAD | routeRenderer.ts unreachable |
| H05 | 404 | Radiation-pressure / galactic-tide modules need backend REBOUND integration | DEAD | neither module is imported by server.py, rebound_nbody.py or kuiper.py (E05) |
| H06 | 405 | Solar observation textures depend on upstream AIA; synthetic fallback always present | TRUE | index.html aia-channel 'auto'; sunController.test.ts (7) covers revocation paths |
| H07 | 406 | Kepler solver clamps e at 0.9999999 | TRUE | orbitMath.ts:182,199 |
| I01 | 412 | Moon elements: NASA/JPL SSD satellite table | TRUE | update-moons-data.mjs:5; catalog.ts |
| I02 | 413 | Planet textures (2K): Solar System Scope pack | DEAD | files present but referenced by nothing; no licence/attribution recorded (F-REPO-15) |
| I03 | 414 | Earth/Moon base textures: three.js planetary set | UNVERIF | provenance not recorded; moon_1024.jpg/earth_normal_2048.jpg unreferenced |
| I04 | 415 | Mars relief: USGS/MOLA | DEAD | mars_relief_mola_*.png referenced only by dead visualProfiles.ts |
| I05 | 417 | Asteroids (Phase 1): JPL SBDB | TRUE | asteroid_phase1_main_100000.meta.json query block + checksum_sha256 |
| I06 | 418 | Survey Milky Way: NASA/JPL 2MASS PIA04250 | DEAD | milky_way_2mass_equirect_*.jpg (5.0 MB) referenced by nothing |
| I07 | 421 | Solar observation textures: SDO/AIA via Helioviewer | TRUE | backend/sim/solar_realtime_data.py, server.py |
| I08 | 422 | Solar activity: NOAA SWPC, SILSO | TRUE | solar_realtime_data.py; backend declares SILSO licence CC BY-NC 4.0 (line 327-329) |
| J01 | 426-434 | Tech-stack table (Three r182, Vite 7, Vitest, TS, FastAPI, REBOUND IAS15, optional TudatPy) | TRUE | lock: three 0.182.0, vite 7.3.1, vitest 3.2.4, typescript 5.9.3; tudatpy lazy-imported (mission/ephemeris_service.py:1359) |
| J02 | 438-441 | `npm run build` / `npm run preview` | TRUE | build OK 3.5 s; chunk > 500 kB warning |
| J03 | 445-447 | `npm run typecheck` | TRUE | runs; exits 2 with 221 errors (README gives no hint) |
| J04 | 451-454 | `cd backend && pytest` | FALSE | fresh venv from backend/requirements.txt: 'Interrupted: 11 errors during collection' (httpx missing), zero tests run; with full deps 8 fail on HEAD |


#### T2 — Status claims sampled from the development docs

| Doc : claim | Verdict on HEAD | Evidence |
|---|---|---|
| `Development_Improvements.md:30-35` hard cap "48 KB or 500 lines → prune oldest, add a prune note" | **VIOLATED** | 72,839 B / 1,354 lines (1.5× / 2.7×); `grep -i prune` hits only the rule text (lines 32-35, none in the log) |
| `Development_Improvements.md:17` "reverse chronological order (newest first)" | **VIOLATED** | entries at lines 50-263 are 2026-03-07; line 291 is 2026-03-22 |
| `Development_Improvements.md` / `Development_History_Context.md` newest entry | **stale 6.5 months** | both end at 2026-03-22; 251 commits (moon ephemerides, PFSS/GONG, R3/R4, CI) unrecorded; neither mentions "Sun Model Lab" or `sun-focus` |
| `Development_History_Context.md:7-10` size budget ≤30k tokens (~120 KB) | TRUE | 76,433 B |
| `Development_History_Context.md:139,148` "the only existing frontend workerized path is satellite propagation" | **FALSE on HEAD** (and contradicts README:26) | live worker = `modelWorker.ts`; satellite worker is in unreachable `satelliteSystem.ts` |
| `Development_History_Context.md:58-75` entry "Status: IN-PROGRESS" (2026-03-07) incl. "Strict TS active on every file" | stale status; claim literally true | never closed; 221 tsc errors today |
| `Development_History_Context.md:309-335` "OPEN: add `npm run test` and wire into CI gate" | partly DONE | `npm test` exists (309 tests); CI exists but red (F-REPO-02) |
| `Development_History_Context.md`, `Development_Improvements.md`, `typescript_migration_plan.md` path references | rot | 49/130, 33/98, 18/53 referenced repo paths no longer exist (README 6/6, ADVANCED index 43/43 exist) |
| `typescript_migration_plan.md:9-12` "82 total (53 .ts, 0 .js)", LOC 15,715 | self-inconsistent; stale | HEAD: 70 non-test `.ts` (27,247 LOC) + 19 test `.ts` |
| `ADVANCED_ASTROPHYSICS_INDEX.md` (generated 2026-03-04) | index accurate, redundant | 43/43 paths exist; lists byte-identical files as separate "variants" (#1 `SMBH_Shockwave_Research_2026-02-23.md` = #7 `…OPUS4_6_2026-02-23T0415.md`) |
| `src/sim/asteroids/README.md` "consumed by beltRenderer.ts and main.ts" | **FALSE** | `asteroidPipeline.ts` importedBy=[] |
| `scripts/ci/README.md` fail-closed list, scope gaps, "branch protection is external state" | TRUE and candid | every bullet maps to a runner test (21 pass); "The workflow is operational" is not true at HEAD (F-REPO-01/02) |

#### T3 — R3/R4 lane results (exact interpreter 3.12.13 + the 12 pinned packages)

| Node / mutant | As-is HEAD 17d1e63 | With restored patch (scratch only) |
|---|---|---|
| baseline: 6 required nodes (`test_all_modes_against_immutable_oracle`, `…[equal_area_sine_latitude_grid]`, `…[cosine]`, `…[4-2-True]`, `test_open_endpoint_does_not_overshoot`, `test_expansion_uses_exact_radial_components…`) | **6/6 pass** (JUnit time 2.9 s; slowest node 0.54 s) | 6/6 pass |
| `old-legendre-recurrence` | killed — `AssertionError: R4-LEGENDRE-RECURRENCE mode=(2, 0)` (suite 1.4 s) | same (0.71 s) |
| `uniform-theta-area-weights` | **ABORT `patch-not-applied`** (F-REPO-01) | killed — `R4-THETA-AREA-WEIGHTS` (0.85 s) |
| `extra-m-normalization` | not run | killed — `R4-M-NORMALIZATION` (0.77 s) |
| `corrupt-source-surface-factor` | not run | killed — `R4-PFSS-SOURCE-SURFACE` (1.08 s) |
| `omit-exact-boundary-crossing` | not run | killed — `AssertionError: R4-TRACE-EXACT-CROSSING` (1.29 s) |
| `wsa-vector-magnitude-expansion` | not run | killed — `R4-WSA-RADIAL-COMPONENT` (0.74 s) |
| Whole lane | **exit 2, 13.5 s** | **exit 0, 29.5 s** |

Manifest sanity: every `fixed_commit` exists, is an ancestor of HEAD and touches both the mapped production file and the mapped test file (`1a6fcaaa, 70af7c81 (×2), 99b32316, 487a0efc, 8fd45d5f`); two defects share one fix commit (`70af7c81`). The lane is "bounded": it runs 6 of 2,142 backend items and no frontend code.

#### T4 — `scripts/` inventory (34 files) and root helpers

| File (LOC) | Referenced by | Check | Verdict |
|---|---|---|---|
| `build_asteroid_phase1_dataset.py` (455) | `npm run phase1:asteroid-dataset`, README | `--help` OK; imports `fetch_utils`, `fetch_jpl_sbdb` (import-safe) | OK (network; `--dry-run` still queries SBDB) |
| `dev-full.mjs` (133), `dev-full-config.mjs` (116), `.test.mjs` (85) | `dev:full`, README | `--help` OK; guard message verified; 15 tests pass in CI | OK; exposes Vite under `network` (F-REPO-08); hard-codes `python3` |
| `run-ui-dev.mjs` (108) | `dev:ui`, README | `--help` OK; env consumed at `sceneSetup.ts:97-100` | OK; no host guard |
| `update-moons-data.mjs` (86) | `update:moons` | static; not run (network, writes `src/data/moons.json`) | plausible |
| `ingest-moon-textures.mjs` (120) | `ingest:moon-textures`, README | `node …` → `ERR_MODULE_NOT_FOUND` | **BROKEN** (K-33a) |
| `verify-moon-frames.mjs` (263), `verify-planet-positions.mjs` (205) | `verify:*` | run: pass (0.44 s / 0.32 s) | OK; undeclared `esbuild` |
| `generate_moon_ephemeris.py` (872) | `generate/verify:moon-ephemeris` | `--help` OK; `--check` needs Horizons | OK; not in CI |
| `fetch_gaia_catalog.py` (421) | README | `--help` OK; network | OK; output unused by live code |
| `fetch_jpl_sbdb.py` (500) | README | scratch run, network mocked | **BROKEN/unsafe** (K-33b) |
| `fetch_jpl_nbody_ephemeris.py` (437) | README | `--help` OK; network | OK; not in CI |
| `fetch_utils.py` (104) | library | imported by 3 scripts | OK |
| `generate_pfss_harmonic_fixture.py` (64) | manifest input | `--check` passes byte-for-byte (0.4 s) | **good**; not in CI |
| `generate_synthetic_gong_fixture.py` (152) | manifest-adjacent | static; writes `backend/tests/fixtures/gong/synthetic-v1` | no `--check` mode |
| `openai_codex_prompt.py` (240) | nothing | `--help` OK | unrelated OpenAI-API helper; candidate for removal |
| `asteroid/catalog_fetcher.ts` (1,058) + README | nothing | outside tsconfig; needs undeclared `tsx`, `@types/node` | not runnable as shipped |
| `ci/verify_r3_r4.py` (717), `ci/tests/*` (518), `ci/mutations/*` (6), `ci/README.md` | workflow | lane run; 21 tests pass | see F-REPO-01/14 |
| `ci/typescript-error-ratchet.mjs` (108) + test | `typecheck:ratchet`, workflow | 3 tests pass; ratchet **exits 1** on HEAD | red (F-REPO-02) |
| `fixtures/*.json` (3) | tests, `verify-*.mjs` | Horizons provenance in `_source/_query/_retrieved` | good |
| root `get_errors.mjs`, `testWarp.js`, `testRealisticScale.mjs` | nothing | not run (undeclared puppeteer; ports 5175/5174/5173; `/home/nomad/.gemini/…`) | stale (K-38) |

#### T5 — Backend collected items vs `def test_` (top rows)

| test file | items | `def test_` | items/def |
|---|---|---|---|
| test_pfss_decomposition.py | 546 | 13 | 42.0 |
| test_pfss_analytic_fields.py | 293 | 5 | 58.6 |
| test_pfss_cache.py | 134 | 35 | 3.8 |
| test_gong_archive.py | 120 | 45 | 2.7 |
| test_solar_realtime_data_cache.py | 70 | 45 | 1.6 |
| test_mga_bounded_search.py | 65 | 45 | 1.4 |
| test_solar_realtime_data_transport.py | 58 | 19 | 3.1 |
| test_wsa_semantics.py | 51 | 18 | 2.8 |
| test_solar_security.py | 50 | 31 | 1.6 |
| test_solar_physics_api.py | 49 | 39 | 1.3 |
| test_pfss_tracing.py | 48 | 16 | 3.0 |
| test_trajectory_contracts.py | 48 | 27 | 1.8 |
| (40 other files) | 610 | 409 | 1.5 |
| **total (52 files)** | **2142** | **747** | 2.9 |

Largest sweeps: `test_every_isolated_real_mode` 512; `test_isolated_mode_matches_independent_potential_at_five_radii` 97; `test_source_surface_has_zero_tangential_field_and_nonzero_radial_flux` 97; `test_interior_divergence_and_curl_converge_under_step_halving` 97; `test_every_published_provider_field_is_validated_before_caching` 25 (top 5 = 828 = 38.7 %; top 10 = 899 = 42 %). 162 of 747 functions are parametrized.

#### T6 — Slowest backend tests (from `$S/pytest_main.log`, `--durations=40`; machine shared with other reviewers)

| s | test |
|---|---|
| 41.5 | `test_solar_process_worker_contract.py::test_real_supported_worker_result_fits_default_wire_budget[ultra-256-hybrid-True]` |
| 39.7 | `test_solar_physics_model.py::test_parker_spiral_extends_to_multi_au_domain` |
| 35.1 | `test_solar_physics_determinism.py::test_different_fidelity_yields_a_different_payload` (**FAILED 503**) |
| 34.6 | `test_solar_process_worker_contract.py::…[high-256-hybrid-True]` |
| 34.2 | `test_solar_physics_determinism.py::test_identical_requests_are_byte_identical` |
| 33.4 | `test_solar_physics_model.py::test_sample_state_is_deterministic_for_fixed_epoch` |
| 31.2 | `test_solar_process_worker_contract.py::…[high-180-synthetic-False]` |
| 24.7 / 23.9 | `test_solar_physics_model.py::test_synthetic_coronal_holes_present_at_solar_minimum` / `…parker_spiral_fast_wind_in_coronal_holes` |
| 18.0 ×4 | `test_solar_physics_api.py::{returns_3d_coronal_features, hybrid_mode_without_live_data_is_stable, enforces_rate_limit}` and `test_solar_physics_determinism.py::test_jd_inside_the_window_is_accepted` — all **FAILED 503 at the 18.0 s product deadline** (fifth failure = the 35.1 s row above). A passing `test_solar_physics_model.py::…coverage_decreases_at_solar_max` also takes 18.06 s |
| 7.3 | `test_nbody_horizons_accuracy.py::test_checkpoint_seek_reproduces_the_direct_2026_solution` (real REBOUND) |

#### T7 — Frontend tests ↔ modules (309 tests, 21 files; counts from the CI log)

| test file (tests) | module under test | status of module |
|---|---|---|
| `solarRealtimeClient.test.ts` (60; **1 failing**, line 605) | solarRealtimeClient, solarObservationTexture | live |
| `planetPositions.horizons.test.ts` (66), `orbitMath.accuracy.test.ts` (37), `moonFrames.horizons.test.ts` (27), `orbitMath.test.ts` (1) | orbitMath, catalog, planets, moonEphemeris vs Horizons fixtures | live (moons disabled at runtime) |
| `solarPhysicsClient.test.ts` (20), `sunController.test.ts` (7), `solarMagnetics.test.ts` (2) | solar clients/controller | live |
| `phase1AsteroidCatalog.test.ts` (10), `moonEphemeris.test.ts` (10), `catalog.test.ts` (5), `sourceFrameOrbit.test.ts` (4), `solarSystemModel.test.ts` (2), `modelWorkerContract.test.ts` (6), `stateStore.test.ts` (2), `constants.test.ts` (3) | sim/data/worker contract | live |
| `localPlanner.test.ts` (12), `trajectory/index.test.ts` (10), `plannerController.test.ts` (7) | trajectory + planner UI | **UNREACHABLE (29 tests = 9.4 %)** |
| `dev-full-config.test.mjs` (15), `typescript-error-ratchet.test.mjs` (3) | scripts | CI/tooling |

Never loaded by any test: 39 of 70 non-test TS files (11,865 LOC); of which live 11 (4,455 LOC) — `main.ts`, `beltRenderer`, `kuiperBelt`, `textures`, `planetShaders`, `sceneSetup`, `quadtreeLOD`, `bodyManager`, `modelWorker`, `timeController`, `textureManager`.

#### T8 — Documentation estate

| Group | files | lines | note |
|---|---|---|---|
| `agent-notes/` | 23 md + `audit.html` (1,988) | 12,908 | AI audits/prompts; largest `CODEBASE_AUDIT_2026-09-07.md` 1,566 |
| `my-notes/` | 64 md + 5 tex + 3 pdf + 2 json | 18,693 | research variants, accuracy reports; 4 byte-identical groups |
| root | 21 md + 1 `.resolved` + 7 tex | 6,913 (md) | README, 7 dev logs, 11 `superluminal_*` |
| `docs/` | 7 md | 988 | 5 ADRs (good), 2 agent plans |
| module/data docs | 7 md | 918 | `scripts/ci`, `scripts/asteroid`, `src/sim`, `src/data`, benchmark protocol, `solar-systems/` |
| **total** | **122 md** | **40,420** | vs 89,490 lines of code in 221 files |

#### T9 — History/process facts (local shallow view unless stated)

| Fact | Value |
|---|---|
| commits on `main` | **604** (GitHub API) / 291 (local shallow) |
| authors | one person, two emails (241 + 50 commits, local) |
| days with commits (local view) | 14; busiest 2026-09-26: 138 (25 @18h, 37 @19h, 21 @20h, 19 @21h EDT) |
| commits per active day (local view) | 03-07: 6 · 03-09: 15 · 03-20: 4 · 03-21: 15 · 03-31: 9 · 07-25: 1 · 08-23: 1 · 08-24: 28 · 08-25: 22 · 08-27: 9 · 09-24: 21 · 09-25: 9 · **09-26: 138** · 09-27: 13 |
| largest real commits (lines added/removed, files) | `931faae2` +11,538/−681 (26) "fix(trajectory): contain planning amplification"; `fc9fabfb` +5,719 (10) docs; `bd48a7de` +5,331/−256 (31) "fix: validate and correct major moon ephemerides"; `4f6fa39d` +4,681 (10) audits; `1a6fcaaa` +2,876/−114 (6) "fix(pfss): unify the normalized harmonic basis" (shallow-boundary artefacts `ea3948be`/`2e7e748d` excluded) |
| Conventional-Commit subjects | 178/291 (61 %): fix 128, test 16, docs 14, ci 12, feat 5 |
| median changed lines: `fix:` 124 (p90 657, max 12,219); `docs:` 672; `feat:` 1,221 | 12 commits > 2,000 lines |
| commits with a body | 91/291 |
| agent trailers | 34 × `Co-Authored-By: Claude Opus 5…`, 1 × `Cursor` |
| merges (visible) | 7 |
| duplicate commits | `docs: prune superseded sun-focus planning artifacts` ×3 |
| CI | 1 workflow, 1 run ever (red); `main` `protected:false`; 0 PRs/issues |
| branches | `main`; `sun-focus` 184 behind (0 ahead); `fix/trajectory-amplification-defense-in-depth` 166 behind (0 ahead) |
| weight | tracked 54.1 MiB (451 files); local pack 46.7 MiB (shallow); GitHub size 51,293 KB |

#### T10 — What the CI does and does not cover (workflow at 17d1e63)

| Gate | Present? | Note |
|---|---|---|
| Frontend unit tests (vitest, 309) | yes | step 1 of job 1; red (1 failure) |
| Production build | yes | skipped when tests fail |
| Strict type check | **ratchet only** | `typecheck:ratchet` (budget 226, per-file+code buckets); no zero-error gate; `npm run typecheck` itself is not run; red on HEAD |
| Backend tests (2,142) | yes | separate job, 30-min timeout, no per-test timeout; red |
| R3/R4 science lane (6 nodes + 6 mutants) | yes | **last** step of job 1; never reached; stale patch (F-REPO-01) |
| Fixture/oracle reproducibility (`generate_pfss_harmonic_fixture.py --check`, 0.4 s) | no | passes locally |
| Moon/N-body fixtures `--check` (Horizons) | no | need network by design |
| Lint (eslint/ruff/flake8) | **none** | no config exists for any language (`scripts/asteroid/catalog_fetcher.ts:2` carries an `eslint-disable` for a linter that is not installed) |
| Coverage | none | no `--cov`/vitest coverage config |
| Dependency audit / update automation | none | `npm audit` 11 advisories; no `pip-audit`; no Dependabot |
| Secret scanning / CodeQL | none in repo | repo-level settings not readable |
| Browser/E2E, WebSocket integration | none | F-REPO-10 |
| Other OS / Python / Node versions | none | single `ubuntu-24.04`, exact 3.12.13/22.23.2 |
| Required status check / branch protection | **none** (`protected:false`) | cannot be proven from inside the repo; the CI README says so |
| Schedule / nightly | none | only `push`, `pull_request`, `workflow_dispatch` |

#### T11 — Sample of 22 tests and assertion-strength judgement

| Test | Judgement | Why |
|---|---|---|
| `test_pfss_harmonics::test_all_modes_against_immutable_oracle` | STRONG | scipy-generated fixture, rel. 5e-13, tagged failure message |
| `test_pfss_decomposition::test_every_isolated_real_mode` (512) | STRONG | independent Legendre-derivative oracle, 1e-10 abs, round-trip reconstruction |
| `test_pfss_analytic_fields::test_isolated_mode_matches_independent_potential_at_five_radii` (97) | STRONG | closed-form potential, budgets 256·eps / 1e-11 |
| `test_pfss_analytic_fields::test_source_surface_documentation_does_not_claim_zero_radial_field` | odd | asserts a phrase is *absent* from `pfss_solve.__doc__` (documentation contract, not behaviour) |
| `test_nbody_horizons_accuracy::…multi_epoch_horizons_envelope` | STRONG | real REBOUND vs committed Horizons vectors; 10,000 km / 1,500 km envelopes |
| `test_lambert_solver_reference::…matches_fixed_endpoint_reference_cases` | MEDIUM | 15-digit expected Δv with unrecorded origin (SUSPECTED snapshot); a separate time-of-flight certificate test is independent |
| `test_mga_flyby_physics` (5 tests) | STRONG | closed-form hyperbolic turn limit re-derived in the test (`_expected_max_turn_deg`), v∞-mismatch tolerance semantics, fail-closed diagnostics |
| `test_sim_registry::test_engine_classes_expose_known_ids` | WEAK | key-presence only |
| `test_sim_registry::test_rebound_engine_exports_self_describing_barycentric_states` | MEDIUM | frame/unit strings; Earth speed bound `< 0.1` AU/day (true ≈ 0.0172) |
| `test_seek_optimizations` | MEDIUM | replaces the whole `rebound` module with `_FakeSimulation`; tests bookkeeping, not physics |
| `test_mission_agents::…emits_recommendation_and_logs` | WEAK | keys + `verification.valid`, computed by the same planner |
| `test_mission_agents::…passes_prograde_to_route_planner` | mock-call | asserts kwargs seen by a monkeypatched `plan_interplanetary_route` |
| `test_benchmark_accuracy::…strict_reference_integrity` | MEDIUM | asserts the honest state (0 comparable scenarios, coverage 0.0) |
| `test_ws_resource_contract::…rejects_hostile_origin_before_engine_setup` | MEDIUM | ordering guard: monkeypatched readiness must not run; close code 1008 |
| `test_ws_resource_contract::…oversize_text_closes_1009_before_json_parsing` | MEDIUM | fake socket + patched `json.loads`; no engine |
| `test_server_validation::…requires_the_engine_time_scale` | MEDIUM | fake engine; checks TDB-scale contract |
| `orbitMath.accuracy.test.ts` | STRONG | Horizons positions at several epochs, documented provenance and past calibration error |
| `planetPositions.horizons.test.ts` (66) | STRONG | fixture-driven rows with explicit km budget |
| `stateStore.test.ts` (2) | LOW-VALUE, correct | subscription patches and snapshot immutability |
| `sunController.test.ts` (7) | MEDIUM | fake loaders; texture-revocation state machine |
| `localPlanner.test.ts` (12) | structural, UNREACHABLE | stub bodies; moon endpoints rejected; no v∞ oracle |
| `solarRealtimeClient.test.ts` (60) | contract/validation | exact-message assertions; 1 failing at :605 (client message drifted) |

No sampled test uses a verbatim copy of the production function as its oracle; the nearest cases are the Lambert snapshot values and `verification.valid`.

---

## Prior issues in my area

- **K-02** — STILL-PRESENT (worse). README:1-19, 222-315 vs `index.html`: Highlights+Features 15/42 TRUE (36 %); 27/42 (64 %) DEAD or FALSE vs the earlier "≈50 %". UI cut-down point: `d1484e8` (2026-02-23) per the GitHub history of `index.html`. See F-REPO-03, table T1.
- **K-03** — CHANGED. `tsc --strict` errors 1,300 → **221** in 6 files; vitest (309 tests), a bucketed ratchet and a CI workflow now exist. But `npm run typecheck` still exits 2, `typecheck:ratchet` exits 1, CI run #1 is red, and README:24 still presents strict typing as achieved. See F-REPO-02.
- **K-32** — STILL-PRESENT (partly improved). `rebound==5.1.1`, `astropy==8.0.1` now exact; `httpx` still missing (11 modules fail collection — verified in a clean venv), `>=` ranges remain, `pytest` still in runtime deps, `pillow` unused, no `pyproject.toml`. See F-REPO-04, F-REPO-13.
- **K-33** — STILL-PRESENT (both halves executed). `ingest-moon-textures.mjs:5` → `ERR_MODULE_NOT_FOUND`; `fetch_jpl_sbdb.py:36,380,414` mutates `backend/data/bodies.py` (+438 B in a scratch run) then `FileNotFoundError` on `src/data/planets.js`. See F-REPO-06.
- **K-34** — STILL-PRESENT. `src/assets/textures`: 25 files / 38.7 MiB (71 % of tracked bytes); 19 referenced by nothing, 6 only by unreachable `visualProfiles.ts`; 0 bytes in `dist/`; no LFS/`.gitattributes`. ("Three blob versions of the asteroid `.bin`" is not checkable in the shallow history: one version visible.) See F-REPO-07.
- **K-35** — STILL-PRESENT for 4 of 5 sub-claims; link sub-claim CHANGED. Moons: `main.ts:147 showMoons=false`; stars: `main.ts:427-428 Math.random`; textures/rings/oblateness: rows F08-F11 and F13 of T1; engine dropdown/Connect: absent. README no longer links `/home/nomad/Documents/...` but has three broken relative links, and `/home/nomad/...` paths persist in ADR 0001:53, the PFSS plan, the H29 plan and `testRealisticScale.mjs:11`.
- **K-36** — STILL-PRESENT. Neither dev log mentions the "Sun Model Lab"/`sun-focus` transition; both end at 2026-03-22 (the 2026-02-23 13-phase overhaul *is* recorded). See F-REPO-16.
- **K-37** — STILL-PRESENT with partial progress. `main.ts` is 1,501 lines (1,083 at the time of K-37) and still owns the rAF loop (`main.ts:1085,1396,1449`) and belts/AGN/worker wiring; `animationLoop.ts` is its unreachable duplicate; 5 of 15 `frontend/app` modules are now live (`bodyManager`, `sceneSetup`, `stateStore`, `textureManager`, `timeController`), 10 are not.
- **K-38** — CHANGED/partly FIXED. A test runner exists (vitest, 21 files/309 tests) and `asteroidCatalogLoader.test.ts` (the 5-line re-export) is gone; STILL-PRESENT: three root Puppeteer scripts with undeclared dependency, three ports and a personal output path (`testRealisticScale.mjs:11`). See F-REPO-06, F-REPO-10.
- **K-53** — mixed: (a) `Development_Improvements.md` over its cap with no prune note — STILL-PRESENT (72.8 KB/1,354 lines); (b) `typescript_migration_plan.md:9` self-inconsistency — STILL-PRESENT; (c) README vs `Development_History_Context.md:139/148` on worker paths — STILL-PRESENT (both wrong on HEAD); (d) pytest-module count — STILL-PRESENT, worse (README "14" vs 52; was "13" vs 12); (e) byte-identical research duplicates — STILL-PRESENT, worse (4 groups/9 files vs 3); (f) `scripts/asteroid/catalog_fetcher.ts` outside tsconfig + undeclared `tsx`/`@types/node` — STILL-PRESENT; (g) no LICENSE/CONTRIBUTING/pyproject — STILL-PRESENT, but a CI workflow now exists (CHANGED; red). See F-REPO-15/16/17.

## Strengths

- **The R3/R4 verifier is genuinely fail-closed and well tested.** It rejects a dirty/untracked manifest or input, any hash drift, an environment that differs by one package version or the interpreter patch (`_verify_environment`), a `fixed_commit` that is not a full-length ancestor of HEAD, collection drift, skips/xfails/XPASS, nonempty artifact dirs and mutants that survive; it runs baseline and mutants in detached worktrees at the exact commit, removes them in `finally` (verified: none left), and 21 contract tests (poisoned conftest, replayed artifacts, abbreviated commit ids, XPASS, dirty manifest…) pass in 17 s. All six `fixed_commit`s really touch the mapped production and test files. With a consistent manifest the whole lane takes 29.5 s with 6/6 mutants dying on their tagged assertion.
- **Independent, reproducible scientific oracles.** `scripts/generate_pfss_harmonic_fixture.py --check` re-derives the 16×16 harmonic oracle from `scipy.special.lpmv` with no production import and matches `backend/tests/fixtures/pfss/harmonics_schmidt_v1.json` byte-for-byte (0.4 s); `test_every_isolated_real_mode` (512 items) re-derives Legendre derivatives with `numpy.polynomial` and recovers each unit coefficient to 1e-10; `test_pfss_analytic_fields.py` derives the closed-form potential solution from first principles. ADRs 0001-0005 are concise, status-tagged contracts tied to tests.
- **Golden data with recorded provenance and a documented lesson.** Horizons fixtures carry `_source/_query/_ephemeris(DE441)/_retrieved`; `orbitMath.accuracy.test.ts` explains why a single-epoch test had been "calibrated to its date"; `verify-planet-positions.mjs` and `verify-moon-frames.mjs` run offline in <0.5 s; `test_nbody_horizons_accuracy.py` runs the real REBOUND engine against committed vectors with explicit km/m·s⁻¹ envelopes.
- **No test is hidden:** 0 skipped/xfailed/`.only`/`.todo` anywhere (backend log 0 skipped; vitest none); 3.4 asserts/test; no assertion-free test (AST); the benchmark test honestly asserts `comparableScenarioCount == 0` rather than faking validation.
- **Operational-security defaults.** `dev:full` binds loopback, rejects non-loopback unless the network profile is set (verified message), always passes `--no-proxy-headers`, drops `--reload` under `network`; the workflow uses least privilege (`permissions: contents: read`, `persist-credentials: false`, no `pull_request_target`, no secrets), `npm ci --ignore-scripts`, exact interpreter pins (CI log shows 3.12.13/22.23.2/10.9.8 selected), and a v3 lockfile in which 110/110 packages carry `integrity` hashes and all resolve from registry.npmjs.org; `npm audit --omit=dev` is clean.
- **Debt is measured, not hidden.** The TypeScript ratchet buckets by file+code (insensitive to line movement) and fails closed on unparsable diagnostics; errors fell 1,300 → 221; `scripts/ci/README.md` lists its own scope gaps and says branch protection is external state; `main.ts:144-146` documents that moons are hidden; per-asset provenance (`sha256`, source, licence) exists for the moon textures; the live asteroid catalog verifies against its metadata (sha256 `a0b8328c…` and FNV-1a `0xf1f80244` of the 3,600,012-byte `.bin` both match `meta.json`; header + 100,000 × 36 B records).
- **Clean tracked tree:** no tracked caches/pyc, `git ls-files -ci --exclude-standard` empty, no secrets by pattern scan, `.gitignore` covers node/py/artifacts.

## Scores

| Dimension | Score | Basis |
|---|---|---|
| Build/test health | 2 | `npm run build` OK (3.5 s) and the dev server starts (Vite 7.3.1, `/` + `/src/main.ts` HTTP 200); but `npm test` 1/309 red, ratchet exit 1, backend 7-8/2,142 red, CI run #1 red on both jobs, README's `cd backend && pytest` collects 0 tests on a clean install (F-REPO-02/04) |
| Type safety | 2 | `strict:true`, 0 `@ts-nocheck`/`@ts-ignore`, 3 `as any`; but 221 errors (151 in live files: smbhPropagation 81, agnShockwaveEngine 52, main.ts 18) and a red ratchet |
| Data integrity / provenance | 3 | excellent for physics fixtures and catalogs (hashes, Horizons provenance, checksummed asteroid set); weak for textures/star catalog/licences; 38.7 MiB dead assets (F-REPO-07/15) |
| Security / operational exposure | 3 | fail-closed local-by-default launcher and least-privilege CI; but `dev:full` network mode exposes Vite with advisories, Actions pinned by tag on a deprecated runtime, `main` unprotected, no update automation (F-REPO-08/09) |
| Test strategy | 3 | strong independent oracles, no skips, offline pinned CI; but 39 % of items from five sweeps, no integrated WS/browser test, 29 tests on dead modules, SMBH/sun visuals/main loop untested, wall-clock-dependent tests (F-REPO-10/11) |
| Documentation accuracy | 2 | README 55 % true overall, 36 % for the product description; ADRs/`scripts/ci/README.md` accurate; dev logs stale 6 months (F-REPO-03/16) |
| Repo hygiene | 2 | 36/44 root files are non-core, 122 md files, 9 duplicate notes, 71 % of bytes dead, bulk push + no gate, no LICENSE (private); but clean tree, sane `.gitignore` (F-REPO-12/15/17) |
| CI/verification *design* (extra) | 4 (state: 1) | verifier design is rigorous and well tested; as deployed it is red at four independent points (F-REPO-01/02/05) |

Dimensions outside my area (architecture, live-path correctness, numerical fidelity, backend concurrency, performance): not scored here.

## Not inspected

- Line-by-line `src/` and `backend/` code (other reviewers); only import graphs, greps and AST metrics were used.
- GitHub repository settings beyond the API fields I could read: rulesets, Actions permissions, secret scanning, Dependabot alert settings (the available tools cannot read them; `protected:false` is classic branch protection only).
- Texture/data licences at the source (Solar System Scope, three.js examples, d3-celestial): egress to those sites is blocked; statements about them are marked as unverified.
- Contents of `my-notes/`, `agent-notes/`, `.tex/.pdf` beyond headers, hashes, sizes and similarity scores.
- Network-dependent scripts (`update-moons-data.mjs`, `fetch_*`, `generate_moon_ephemeris.py --check`, `fetch_jpl_nbody_ephemeris.py --check`) and the Puppeteer helpers: not run (network, writes into the tree, undeclared dependency); `fetch_jpl_sbdb.py` was executed only in a scratch copy with mocked network.
- Real browser rendering/WebGL (no GPU/browser here); the dev server was probed by HTTP only.
- Windows/macOS behaviour of scripts and CI; git versions other than 2.43.0 (CI used 2.55.0).
- History before 2026-03-07 beyond what the GitHub API returned (commit list, `index.html` history); a full-history analysis needs `git fetch --unshallow`.
- I did not start my own full backend run; I used `$S/pytest_main.log` (8 failed / 2,134 passed in 549.6 s).
