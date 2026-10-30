# H-1 remediation plan: incremental and risk-first

**Baseline:** `main` = `bd48a7d`. Phase 0 is the branch `fix/solar-data-status-notice` (commits `d637501..728d21c`, which add the "Sun:" chip and the typed failure kinds). This plan assumes Phase 0 merges first.

**Status of claims.** Code references are `path:line` on `bd48a7d`. I re-read every one I cite today, unless a line says otherwise. Anything taken from the dead spike investigator is marked **(SPIKE, unverified)**. My own deductions are marked **(inference)**.

---

## Part A: For the product owner

### A.1 What is going on

- **The Sun you see today is drawn entirely by the browser.** The backend's Sun model never reaches the screen:
  - The browser gives up after 2.6 s.
  - Each backend answer takes 4 to 10 s.
  - The audit counted 0 successes out of 39 requests in dev and 0 out of 44 in preview.
- **Almost all of that time goes into one step.** Tracing magnetic field lines ("PFSS") and the solar-wind map built from them take 97–99.6% of each request. That step is also mathematically wrong today (audit finding H-2).
- **Everything else is fast.** Loops and eruptions, sunspot groups, coronal holes, the activity level and the solar-wind spiral together take about 0.02–0.05 s.
- **Letting the data through as-is would show several visible errors at once**, because the display code has never run with real data:
  - the solar-wind spiral drawn out to 242 AU, beyond Neptune;
  - loops reaching past Mars;
  - sunspots near the poles;
  - field lines from the wrong maths;
  - a close-up covering 3% of the Sun's disk, wrapped around the whole globe as if it were a full map.
- **The live observations are in poor shape:**
  - NOAA retired the solar-wind feed around 30 April 2026.
  - The magnetogram download has never worked.
  - The sunspot feed works, but its numbers sit on a scale about 3x lower than the model's own solar-cycle scale.
  - The SDO image is the wrong crop.
- **Today's fallback Sun has two bugs of its own:**
  - Its activity is stuck at 0 (a completely quiet Sun) instead of following the solar cycle.
  - Flares are deleted on their first frame at the default scale.

### A.2 The strategy in one paragraph

First fix the display, using recorded data, so nothing on the network changes. Then turn on only the fast, correct part of the backend model.

The field lines stay out until their maths is fixed and tested. After that they appear only while the simulation is paused, because they change every 14 simulated minutes and take seconds to compute.

The SDO image stays out until it is a full-disk image placed on the Earth-facing side of the Sun.

Every layer on screen is labelled with where it comes from.

### A.3 What you will see after each phase

| Phase | What you will see | Effort | Your decisions |
|---|---|---|---|
| **P0** (done, being verified) | The "Sun:" chip says the backend model is missing and why | 0.25 d to merge | — |
| **P1** Display correctness | Only the browser's own Sun, corrected: activity follows the solar cycle (today stuck at 0) and flares become visible. Backend data is not shown yet. | 2–2.5 d | D3, D4 |
| **P2** Backend model on screen | From the backend, refreshed every 2.5 s: about 140 coronal loops and eruption arcs, up to 8 sunspot groups, coronal holes, a 6-arm solar-wind spiral out to 3 AU, and flares/CMEs. The chip lists each layer's source. | 1.5–2 d | D5, D9 |
| **P3** Observations near "now" | Paused at "Jump to now": the sunspot number is shown. After the NOAA repair, the observed solar-wind speed shapes the spiral. Observations are blended into the model only if a calibration check passes. | 1.5–2.5 d | D2, D6, D10 |
| **P4** Field-line maths (H-2) | Nothing visible; the solver is fixed and tested against exact answers | 1–1.5 d | — |
| **P5** Field lines on screen | Paused with "Magnetic field" on: 120 backend field lines, labelled | 1–1.5 d | D1, D8 |
| **P6** SDO image | A real full-disk AIA image on the Earth-facing side, near "now" | 2–4 d | D4, D11 |
| **P7** Hardening | CI, contract tests, upstream canaries, docs | 2–3 d | D5, D7 |

**The first correct, backend-driven Sun is on screen at the end of P2, about 3.5–4.5 working days after Phase 0 merges.** Each phase is its own branch, with one small commit per step.

### A.4 Decisions I need from you

The decisions, with my recommended defaults, are listed in §5. Six of them change what you will see:

- **D2:** live data only near "now"
- **D3:** how tall solar structures are drawn on the enlarged Sun
- **D4:** the look of "Auto" in the channel menu
- **D8:** field lines consistent with the sunspots
- **D9:** refresh rate
- **D10:** calibrating observations against the model

---

## Part B: Engineering detail

### B.0 Evidence key

- `$SP` = `/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad`
- **DG/xx Fn** = `$SP/h1/digest.md`, area xx, fact n. Areas: BR (backend-route), UP (realtime-upstream), CD (config-deploy), FE (frontend-consumers), TC (tests-contracts), BP (backend-profile).
- **HP** = that area's hidden_problems section; **M** = its measurements section.
- **AUD** = `agent-notes/CODEBASE_AUDIT_2026-09-24.md`.
- **SPIKE** = `$SP/h1/spike/*` (unverified).

---

## 1. The system as interconnected parts

| # | Part | State at `bd48a7d` (evidence) | What breaks | Depends on | Constrains |
|---|---|---|---|---|---|
| 1 | **Client cadence and epoch** | Polls 900 ms after request *start*; sends `jd.toFixed(8)` of the sim clock; always `hybrid` + `live_data=true` (`sunController.ts:152-160,531`; `solarPhysicsClient.ts:119`). Sim runs at +4 d/s by default, with no 1× option (`constants.ts:12`; `index.html:84-93`) | Every poll is a new epoch 3.6 d away, so no server reuse. About 66 req/min once the server is fast (DG/TC M) | Compute cost (5); rate limit (4) | Caching (6), upstream fan-out (7), how stale the drawn state is |
| 2 | **Client patience** | 2.6 s timeout; clamps timeout ≤ 20 s and poll ≤ 30 s (`solarPhysicsClient.ts:58-59`); a second 6 s gate (`sunController.ts:531`); `inFlight` is checked before `force` (`:498-499`) | 0/39 dev successes (AUD H-1). A client abort frees nothing on the server (DG/BR F4) | Server p95 (5) | Orphaned work (4); raising the timeout means back-to-back requests and data that lags the sim clock |
| 3 | **Transport / CORS** | Allowlist is ports 3000 and 5173 only; the env var *replaces* it; `*` is silently ignored (`server.py:91-119`). Unhandled 500s carry no ACAO; Retry-After is not exposed (DG/CD F11). `:8042` is hard-coded in 4 places (DG/CD M) | Preview 0/44 (14 blocked by CORS). Rejected origins still cost full compute (DG/CD F8) | Deployment choice (13) | Phase 0 "blocked" classification; rate-limit identity if a proxy is added (DG/CD F16-17) |
| 4 | **Admission / guards** | Rate limit of 36 per 60 s runs *before* the guard, so 503s count against it (`server.py:168-177`). 2-slot semaphore, released only when the worker finishes (`:466-503`). Heavy executor (2 threads) is shared with porkchop and mission (`:277-302`) | Slots stay busy 22–29 s after aborts or timeouts (DG/BP F19-20); porkchop starves (DG/BR F5) | Compute duration (5) | Cache hits still go through the guard (DG/BR HP); other endpoints |
| 5 | **Compute** | Fast part ≈ 0.02 s plus 25–43 ms encoding (DG/FE F8, BR M). PFSS trace + WSA = 97–99.6% (4–10 s), pure-Python per point, GIL-bound: two jobs take 20.6–24 s each vs 6.97 s alone (DG/BP F21) | Latency is at least 2x the client timeout | Fidelity, H-2 (11) | Everything downstream |
| 6 | **Caching / reuse** | Snapshot cache keyed on exact jd (`solar_realtime_data.py:131`). PFSS keyed on exact jd *and* exact activity, which drifts with `datetime.now()`; max 3 entries; the gong timeout is part of the key (`pfss_magnetogram.py:1107,1117-1173`; `solar_physics.py:391-395`). Seed re-randomises every 0.01 d (`pfss_magnetogram.py:238`; `solar_physics.py:857`) | Hit rate ≈ 0; even identical live requests recompute (DG/BP F5) | Cadence (1), forcing (7) | Upstream fan-out (7), feasibility of PFSS (5) |
| 7 | **Upstream data** | SWPC 404 since about 2026-04-30 (DG/UP F4). GONG never succeeds (UP F7). SILSO 2.9 MB per miss, CC BY-NC, last row 25 days old (UP F24, BR F10). Helioviewer tile is a 3%-of-disk crop (UP F10). Tile route ignores `image_id` (UP F15). An all-failed snapshot is cached as a success (UP F16). Timeouts are per socket only (UP F19) | If unblocked, about 13 calls and 3.8 MB per poll (DG/BP F4); hangs push requests to 11–46 s (BP F11). "Now" data is blended into any epoch (FE F11) | Snapshot key (6) | Whether live forcing is correct (11); licence and attribution |
| 8 | **Response contract and provenance** | Untyped dict; 4 hand-written, conflicting TS interfaces (DG/TC F10-11). `gong_synoptic.ok` is always true (UP F9). `live_data_enabled` echoes the request (BR F7). No degraded flag. 640 KB uncompressed (BR M) | UI labels built on these fields would be wrong | Backend | Status (10), payload cost |
| 9 | **Frontend consumers / display** | Backend is z-up, the Sun's local frame is y-up (`solar_physics.py:69-75` vs `sunVisuals.ts:636`, `solarFlares.ts:41-47`). Loops in the spin group get rotated again (`main.ts:722-735`, `sunController.ts:353-355`). Display radius is 81x physical (spiral `sunVisuals.ts:1531-1533`; loops `:1419-1421`; PFSS `solarMagnetics.ts:249-251`). Flare lifetime is negative (`solarFlares.ts:226-228`). Fallback activity is 0 (`sunController.ts:406-410`). "Auto" switches to a 193 Å tint (FE F17). AIA image wrapped as a globe (UP F11). State is never cleared (FE F23). Field lines rebuilt nearly every success (`sunController.ts:194-206`) | Unblocking immediately shows several wrong things (DG/FE HP) | Contract frames and units (8) | What "correct on screen" can mean |
| 10 | **Status / honesty** | Phase 0 chip: connecting / backend / stale / error, with the failure reason, forcing mode and AIA state. No per-layer source. Static "Live simulation" badge (FE F19) | Owner cannot tell where each layer comes from | Provenance fields (8) | The owner's definition of done |
| 11 | **Correctness gates** | H-2: P₂(0.5) = −0.634 vs the exact −0.125 (AUD §7.12). **Three separate Legendre implementations** exist (`pfss_magnetogram.py:281,488,605`). Activity scales disagree: SILSO proxy 0.264 (`$SP/h1/backend/live_snapshot.json`) vs synthetic 0.757 (DG/BP F13) | PFSS/WSA and the hybrid blend cannot be shown as correct | — | When PFSS appears (P5) and when blending appears (P3) |
| 12 | **Tests / CI** | No CI (DG/TC F18). Backend tests use the synthetic path and reach gong.nso.edu (TC F17). Tests pin today's behaviour: `test_compute_budget.py:47-49`, `test_solar_realtime_data_cache.py:24`, and `test_pfss_cache.py:33-57` (gong_timeout case). 246 strict TS errors. `requirements.txt` lacks httpx (TC F19) | Regressions go unnoticed (the SWPC break went 5 months unseen) | — | How every phase is verified |
| 13 | **Ops / deploy** | No vite.config, no lifespan hook, `--reload`, single process, per-process caches, XFF trusted (DG/CD F3, F17, F20-21) | Refresher and proxy designs are constrained | — | CORS vs proxy (3), workers (6) |

### Couplings to keep in mind

- **C1: a faster server trips the rate limit.** A fast server plus today's 900 ms poll produces about 66 req/min against a limit of 36, so the client flips into 429s within about 30 s (DG/TC HP; FE F9: 40.5/min even under SwiftShader). SPIKE step4rate (unverified) saw 429s after about 72 fast cache hits.
- **C2: unblocking exposes H-2 and every display bug at once.** This affects PFSS lines, WSA spiral winding, the 242 AU spiral, 72° sunspot latitudes and the Auto tint (DG/BR F26; FE F27-28, F17).
- **C3: raising the client timeout alone makes things worse.** Requests become back-to-back, abandoned jobs hold slots, and the data arrives 42 simulated days late. SPIKE step1 (unverified): with a 20 s effective timeout, 4 of 7 requests returned 200 at 11.6–13.1 s, with `simJd − epochJd` = 41.7 d on arrival.
- **C4: bucketing jd alone does not produce cache hits.** Activity drift defeats the PFSS key (DG/BR F14), and at 4 d/s every poll crosses buckets. SPIKE step3a (unverified): 1-day buckets at 4 d/s gave 6 misses out of 6; only a paused sim got hits (24–36 ms, step3b).
- **C5: turning on live data turns the app into a traffic generator** (13 upstream calls per poll) and mixes present-day data into other epochs (DG/UP F27; FE F11).
- **C6: allowing the origin reveals the latency failure behind it.** Rejected origins already cost full compute (DG/CD HP).
- **C7: a proxy changes identity and URLs.** Everyone shares one rate-limit bucket, X-Forwarded-For becomes spoofable, a `/solar` key captures `/solar-systems/`, and an empty base URL kills the AIA image (DG/CD F14-17).
- **C8: fixing GONG sends real magnetograms through the wrong solver** (H-2), and GONG's sine-latitude grid does not match the uniform-colatitude decomposition (DG/BR HP).
- **C9: showing the AIA image brings three problems:** the crop wrapped as a globe, the Auto tint, and a "latest" image for the wrong epoch (DG/UP F10-15).
- **C10: fixing the fallback changes the look for every user.** Activity goes from 0 to 0.754, so more sunspots appear and flares become possible (DG/FE F2).
- **C11: the frame fix must cover every surface layer.** A partial fix makes loops, spots, holes and flares disagree with each other (inference).
- **C12: more threads make it slower.** Raising thread or guard limits hits the GIL (DG/BP F21).

---

## 2. Phased implementation plan

The same rules apply to every phase:

- one branch per phase, one commit per step, each commit green;
- `npm test` and the backend offline pytest stay green;
- new files are strict-TypeScript clean;
- the repo-wide strict error count stays at or below the 246 baseline (`$SP/h1/tsc_baseline.txt`).

### P0: Status chip (done, merge after verification)

No new work. Two follow-ups are picked up later:

- The chip's "blocked" wording changes if a proxy is ever adopted (D5). Vite's proxy answers 500/502 instead of throwing a network error.
- The acceptance harness (`$SP/pw/h1-tests-acceptance.mjs`) expects `live`/`degraded`. It must accept Phase 0's `backend`/`stale` states.

### P1: Make the display correct before any data arrives

**Branch:** `fix/solar-display-correctness`. Frontend only, with no network change. Verified with recorded payloads (`$SP/h1/frontend/payload_high_180.json`, `$SP/h1/upstream/physics_payload.json`).

**P1.1 Fallback activity.**
- **Change:** `sunController.ts:406-410` computes `Number(solarBlendView?.activityIndex)`, and `Number(null)` is 0, which counts as finite. Replace the chain with a pure `resolveSunActivity(blend, backend, fallback)` that treats `null`/`undefined` as missing.
- **Why:** today's fallback Sun renders activity 0 instead of the intended 0.754 (DG/FE F2).
- **Test:** `sunActivity.test.ts`: `resolveSunActivity(null, undefined, 0.754) === 0.754`, and the backend value wins when present.
- **Accept:** `h1-frontend-inject.mjs` scenario `today` with the backend stopped shows a surface activity uniform of 0.754 ± 0.01 for 2026-09-24 (today 0.000).

**P1.2 Flare/CME lifetime at display scale.**
- **Change:** `solarFlares.ts:226-228`. The formula `(0.3 − sunRadiusAu)/v` is negative when the radius is 0.3755 AU. Make the travel distance relative to the surface: `cmeMaxDistanceAu = sunRadiusAu + Math.max(0.3, 2 * sunRadiusAu)`.
- **Test:** `solarFlares.test.ts`: at radius 0.3755 and at 0.00465, a spawned event is alive after 1 s and `maxLifeTimeSec > 0`.
- **Accept:** `$SP/h1/frontend/flare_probe.ts` at the default radius shows at least one live flare over 600 frames (today 0; DG/FE F3).

**P1.3 One frame contract for backend geometry.** This is the key correctness step.

New module `src/frontend/features/solar/solarFrame.ts` with:
- `bodySpinAngleRad(jd, rotationPeriodHours, offsetRad)`: the formula now inline at `main.ts:733-734`. Make `main.ts` call it so the two cannot drift apart.
- `backendDirToSunLocal(v, spinAtEpoch)`:
  - First apply `M: (x,y,z) → (x, z, −y)`. The backend is z-up (`solar_physics.py:69-75`); the spin group's local frame is y-up (`main.ts:308-316`). M is a proper rotation that maps "counter-clockwise about +z" to "counter-clockwise about +Y".
  - Then apply `R_y(−spinAtEpoch)`. Backend longitudes are inertial (`lon + ω(lat)(jd−J2000)`, `solar_physics.py:585`), and `main.ts:722-735` re-spins every spin-group child each frame. Subtracting the spin at the payload's epoch once lets the per-frame spin carry the features forward (inference: this removes the double rotation).
  - The residual drift is Snodgrass 14.713°/d (`solar_physics.py:89`) minus 14.18°/d (609.12 h, `src/data/planets.ts:11`), about 0.5°/d. That is about 1.3° per poll at 4 d/s, smooth under blending.
- `toSunLocalPayload(payload, spinAtEpoch)`: a copy with `corona.features[].arc/base_dir/paired_dir` converted. Coronal-hole centres are converted as vectors, then latitude and longitude are recomputed with the corona shader's own convention, `atan(z,x)` and `asin(y)` (`sunVisuals.ts:489-490`).
- `heliosphere` and `pfss_field_lines` are left untouched. Their groups hang on the non-spinning node (`sunController.ts:250, 359-360`), whose world frame is z-up (`main.ts:310-316`), so the backend's z-up already matches (inference: the 7.25° axis tilt is ignored, as it is today).

Apply the conversion **once at ingest** (`sunController.ts:507`), so loops, eruption points, sunspots (`sunVisuals.ts:636`), flare origins (`solarFlares.ts:41-47`) and holes all read the same frame. Pin all Sun data groups to the Sun mesh's rotation offset (`main.ts:356,365`; `sunController.ts:325`; all are 0 today).

- **Why:** frontend-derived sunspot latitudes have p95 72° vs 30.8° in the backend; 54% sit above 40° (DG/FE F28). Loops and PFSS lines are about 90° apart (FE F29).
- **Tests (`solarFrame.test.ts`):**
  - backend latitude 30° gives `asin(y_local)` = 30°;
  - the prograde sense is preserved;
  - at t = epoch, `R_y(spin(epoch))·toSunLocal(v) == M·v` to 1e-9;
  - on the fixture, p95 |lat| of converted features ≤ 35°;
  - hole conversion matches the shader formula;
  - `bodySpinAngleRad` equals the old inline expression at 5 epochs.
- **Accept:** in the inject run with the fixture, sunspot-seed latitude p95 ≤ 35°, plus a screenshot at the camera used for `shots/data_t18_magnetic_on.png`.

**P1.4 Display-scale mapping** (default per D3).
- **Parker spiral** (`sunVisuals.ts:1531-1533`): scale by the physical R☉ in AU (payload `solar_radius_au`, fallback 0.00465047) instead of the display radius. The spiral then reaches 3.0 AU at both scales (today 242 AU; DG/FE F27).
- **Loops, eruptions** (`sunVisuals.ts:1419-1421`) **and PFSS** (`solarMagnetics.ts:249-251`): add `coronalHeightToDisplay(rR☉, sunRadiusAu, physR)`.
  - At realistic scale it is the identity.
  - At the enlarged scale the height above the surface is compressed, `h' = h/(1 + h/0.6)`, so structures stay below 1.6× the display radius.
- **Test:** `solarDisplayScale.test.ts`: spiral maximum 3.0 AU ± 1% at both radii; loop maximum ≤ 1.6·R_disp at default scale and equal to physical at realistic scale; monotonic.
- **Accept:** inject run shows Parker `maxRadiusAU` ≈ 3.0 (today 242.2) and loops ≤ 0.61 AU (today 1.807).

**P1.5 Never show stale data as current.**
- **Change:** if |simJd − epoch_jd| > 30 d (for example after a big jump) or there has been no success for 5 min, clear `solarPhysicsState` and the feature sets, fading them out over the blend duration. Extend `solarDataStatus.ts` with the wording "procedural fallback (last backend state is for <date>)".
- **Why:** the last payload is otherwise shown forever (DG/FE F23).
- **Test:** `sunController.test.ts`, following `$SP/h1/tests/vitest/sunController.h1.test.ts` (node env, stub TextureLoader): after a success at J and failures at J+400, activity equals the fallback and the loop entries are empty.

**P1.6 Field-line rebuild signature.**
- **Change:** `sunController.ts:194-206` includes the brightness of the top 12 features, so the lines are rebuilt on nearly every success (FE F22). Use the PFSS source, rotation and line count instead, or quantised activity for the analytic fallback.
- **Test:** payloads that differ only in brightness produce the same signature.

**P1.7 Observation-texture gate.** This protects P3 until P6 exists.
- **Change:** add `SOLAR_OBSERVATION_TEXTURE_ENABLED = false` in `solarObservationTexture.ts`. While it is false:
  - `pickAiaObservationChannel` returns null unless the user chose a channel (colour only);
  - `maybeRefreshObservationTexture` (`sunController.ts:253-287`) never loads an image;
  - "Auto" keeps the white-light look (D4).
- **Test:** with the live fixture (which has `sdo_aia`), 0 image requests are made and corona `channelMode` stays 0 in Auto (today 3; FE F17).

**P1.8 Per-layer provenance.**
- **Change:** `describeSolarDataStatus` returns `layers[] = {layer, source}`, rendered in the chip's tooltip plus a short suffix. Possible sources: backend model / browser procedural / browser analytic dipole / disabled with a reason.
- **Test:** `solarDataStatus.test.ts`, pure.

**P1.9 Verification tooling (configuration only).**
- `backend/requirements-dev.txt` with pytest and httpx (TC F19).
- `npm run check:solar`: vitest plus strict tsc, failing if the error count exceeds the baseline.
- Optionally `.github/workflows/ci.yml` running the same checks. Pushing is the owner's step.

**P1 acceptance:**
- `npm test` green;
- `npm run check:solar` passes;
- inject run with the fixture: at least 100 loops, loops ≤ 0.61 AU, spiral at 3.0 AU, spot latitude p95 ≤ 35°, flares alive, 0 AIA requests;
- inject run with no backend: activity 0.754, chip shows "error" with the reason.

**P1 ships on its own:** it fixes today's fallback Sun and changes nothing on the network.

### P2: Put the fast backend model on screen

**Branch:** `fix/solar-fast-backend-path`. Hard dependency: P1 merged.

**P2.1 `include_pfss` option (backend).**
- **Change:** add `include_pfss: bool = True` to the route (`server.py:991-999`) and pass it through `_build_solar_physics_state` (`:389-418`) to `sample_state(..., include_pfss)` (`solar_physics.py:1015`). When false:
  - skip the PFSS block (`:1088-1108`);
  - pass `wsa_result=None`, so the spiral uses its existing, otherwise unused coronal-hole model and labels itself `wind_speed_model: "empirical_ch_bimodal"` (`:910, :1008`);
  - return `pfss_field_lines: None` plus `pfss: {status: "omitted", reason: "not_requested"}`.
- `None` rather than `{lines: []}` matters: `createMagneticFieldLines` treats an empty array as present (`solarMagnetics.ts:303`).
- The default stays `True` for existing API users, but gains `solver_validated: false`.
- **Why:** PFSS is 97–99.6% of the cost, and it and the WSA spiral winding are the H-2-affected fields (DG/BR F18, F26; BP F2).
- **Tests** (`test_solar_physics_api.py`):
  - `test_physics_without_pfss_skips_the_solver` (a recording `PFSSCache._compute` sees 0 calls);
  - `test_physics_without_pfss_labels_spiral_empirical`;
  - `test_physics_without_pfss_makes_no_outbound_calls` (offline plugin `$SP/h1/tests/plugins/h1_offline.py`; today every PFSS cache miss contacts GONG, TC F17);
  - `test_physics_default_includes_pfss_marked_unvalidated`.

**P2.2 Keep the fast path away from heavy work.**
- **Change:** add `_solar_light_executor = ThreadPoolExecutor(1)` and `_solar_light_guard = BoundedSemaphore(4)` next to `server.py:277-306`. Requests with `include_pfss=false` use them.
- **Why:** abandoned PFSS jobs hold both heavy slots for 22–29 s (DG/BP F19-20) and starve porkchop (BR F5). One thread is enough, because of the GIL (BP F21).
- **Test:** `test_fast_path_admitted_while_heavy_slots_are_orphaned` holds both heavy permits and expects a 200 from a fast request. `test_compute_budget.py:47-49` is left untouched (T9).

**P2.3 Honest failures across origins.**
- **500s:** in the route (`server.py:1049-1066`), turn any other `Exception` into a logged `HTTPException(500, …)` so the reply passes through CORSMiddleware (today it has no ACAO; BR F6, CD F11).
- **CORS middleware** (`:113-119`):
  - add `allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$"`, which covers 5173, preview 4173 and Vite's port fallback;
  - add `expose_headers=["Retry-After"]`;
  - keep the list and the env semantics; the WebSocket allowlist (`:151-153`) is unaffected because it checks the list only.
- **Retry-After:** add `Retry-After: 5` to the compute-timeout 503.
- **Compression:** add `GZipMiddleware(minimum_size=2048)` (2.5x smaller responses; BR M).
- **Tests:**
  - `test_cors_allows_loopback_dev_and_preview_ports` (localhost and 127.0.0.1 on 5173, 5174 and 4173; preflight and GET);
  - `test_cors_rejects_foreign_origin`;
  - `test_ws_origin_allowlist_unchanged`;
  - `test_solar_physics_500_carries_cors_header`;
  - `test_compute_timeout_503_carries_retry_after` (TC draft);
  - `test_solar_physics_gzip_when_accepted`.

**P2.4 Request and cadence policy (frontend).**
- **Change:** new module `src/frontend/features/solar/solarPhysicsPolicy.ts`:
  `{query:{fidelity:'high', max_features:180, forcing:'synthetic', live_data:false, include_pfss:false}, minIntervalMs:2500, minJdDelta:1e-3, heartbeatMs:60000, timeoutMs:8000, backoff:{baseMs:6000, factor:2, maxMs:60000, jitter:0.2}, serverRateLimitPerMin:36}`.
- **Client (`SolarPhysicsClient`):**
  - schedule the next poll from *completion*, not from the start;
  - skip a request when |Δjd| < `minJdDelta` and no heartbeat is due, so a paused sim sends one request a minute;
  - back off exponentially and honour Retry-After;
  - pause while `document.hidden`.
- **Controller:**
  - build the client from the policy (`sunController.ts:152-160`);
  - delete the duplicate gate at `:531`;
  - check `force` before `inFlight` (`:498-499`, FE F6).
- **Tests** (extend Phase 0's `solarPhysicsClient.test.ts`, reusing `$SP/h1/tests/vitest/solarPhysicsClient.h1.test.ts`):
  - a 60 s frame loop at 4 d/s against a 50 ms server issues ≤ 24 requests (today 66);
  - a paused sim issues ≤ 2 requests per minute;
  - the next poll is measured from completion;
  - backoff honours Retry-After and resets on success;
  - a hidden tab issues nothing;
  - `policy.pollsPerMin ≤ 0.8 × serverRateLimitPerMin`.

**P2.5 Chip and harness.**
- The chip reads "Sun: backend solar model (synthetic forcing, no observations)". Its layer list:
  - loops, spots, holes, spiral (empirical wind) and flares: backend;
  - field lines: browser analytic (backend PFSS off until the solver is fixed);
  - surface image: procedural.
- Update the harness status contract to the Phase 0 states.

**P2 acceptance:**
- (a) `cd backend && PYTHONPATH=$SP/h1/tests/plugins python -m pytest -p h1_offline tests/test_solar_physics_api.py tests/test_compute_budget.py tests/test_pfss_cache.py -q` is green.
- (b) Performance, idle host, `H1_PERF=1`: median ≤ 150 ms and p95 ≤ 300 ms over 20 distinct-jd fast requests. These are targets inferred from 20 ms compute plus 25–43 ms encoding.
- (c) Real servers:
  - backend: `python -m uvicorn server:app --port 8042` without `--reload`;
  - frontend: `npm run dev`, and separately `npm run build && npm run preview`;
  - for each origin, run 5 min at +4 d/s then 2 min paused, using the harness (AIA criterion off) plus the scene metrics from `h1-frontend-inject.mjs`;
  - pass: ≥ 95% HTTP 200, 0 blocked by CORS, 0 aborted, 0 429; `data-solar-state=backend`; at least 100 loops; sunspot seeds taken from the payload; 6 spiral lines ≤ 3.0 AU; activity uniform equal to the payload's `activity_index`.
- (d) Kill the backend mid-run: the chip shows `stale`, then `error` with the fallback after the P1.5 expiry. Restart it: `backend` returns within 60 s.
- **Deviation from the audit:** its "≥ 1 AIA tile" criterion (AUD H-1) moves to P6, because the tile as delivered today would be drawn wrongly (DG/UP F10-11).

### P3: Observations near "now", with honest blending

**Branch:** `fix/solar-live-near-now`.

**P3.1 Live data only near now (the backend decides).**
- **Change:** in `server.py:397-406`, use live data only when |epoch_jd − now_jd| ≤ `SOLAR_LIVE_WINDOW_DAYS` (default 1.0). In that case call `SOLAR_REALTIME_DATA.latest(jd=None)`, which is the provider's existing "latest" key (`solar_realtime_data.py:122-123`). Otherwise skip, and record `data_assimilation.live_data_skipped_reason`. Set `live_data_enabled` to what was actually applied.
- **Why:**
  - SWPC and SILSO ignore jd, and Helioviewer returns the newest image for future dates (DG/UP HP). SPIKE step2 (unverified) shows a 2035 epoch blended with 2026-09-25 images.
  - Exact-jd keys make every poll a 13-call, 3.8 MB cache miss (BP F4).
- **Tests:** `test_live_data_uses_latest_snapshot_within_window` (10 requests → 1 fetch); `test_live_data_skipped_outside_window`. The provider test `test_snapshot_cache_isolated_by_requested_julian_date` stays unchanged, because only the route stops using jd keys.

**P3.2 Bound the wait on upstreams.**
- **Change:** fetch the snapshot through a 1-thread `_solar_realtime_executor` with a 2.0 s wait. On timeout, answer with synthetic forcing (`reason: "upstream_slow"`) while the provider's single-flight fetch finishes and fills the cache.
- **Why:** hangs turn a request into 11–46 s and a 503 at 12 s (DG/UP F18; BP F11; TC F16), and the urllib timeout is per socket (UP F19).
- **Test:** `test_black_holed_upstreams_still_yield_degraded_200_within_client_budget` (TC draft).

**P3.3 Provider hygiene.**
- Cache an all-failed snapshot for at most 15 s (`solar_realtime_data.py:143-157`; UP F16).
- Raise the TTL from 120 to 600 s (`server.py:163`; AIA updates every 11–16 min, SILSO monthly; UP F22).
- Ignore `force_refresh`/`force_data_refresh` unless an API key is set (UP F28).
- Make the GONG stub report `ok:false, "not_fetched"` (`:809-823, :901-908`).
- **Tests:** `test_all_failed_snapshot_expires_quickly`, `test_refused_upstreams_report_truthful_provenance` (TC draft), `test_force_refresh_ignored_without_api_key`.

**P3.4 Calibration gate before blending.**
- **The mismatch:**
  - observed activity is the daily SILSO sunspot number / 220 (`solar_realtime_data.py:429`) plus an AIA brightness proxy (weights 0.45/0.35/0.2 in the provider; 0.5/0.35/0.15 in `solar_physics.py:441-462`);
  - synthetic activity is `0.06 + 0.82·Hathaway + 0.10·rotation` (`solar_physics.py:522-528`);
  - on the same date: 0.264 vs 0.757 (facts). The scales were never calibrated against each other (inference).
- **Steps:**
  - set the AIA brightness proxy weight to 0 until P6; it is measured on a 3% crop of a colour-mapped PNG (UP HP);
  - add `backend/tests/test_activity_calibration.py` using a recorded SILSO monthly fixture: the 13-month-smoothed observed proxy, mapped to the model's scale, must agree with the synthetic index within ±0.15 over 2019–2026.
- **Until the gate passes,** the frontend does not default to hybrid. The chip shows "SILSO daily sunspot number 58 (2026-08-31), not blended: calibration pending" (D10).

**P3.5 SWPC to RTSW (optional, 0.5 d).**
- **Change:** replace the URLs and parser (`solar_realtime_data.py:55-60, 358-403`) with `json/rtsw/rtsw_wind_1m.json` and `rtsw_mag_1m.json`: newest-first rows, `active==true` only, field renames, plasma and magnetic feeds isolated from each other (UP F4-6).
- **Visible result:** the observed wind speed winds the spiral (`solar_physics.py:902-906, 968-975`).
- **Tests:** contract tests on `$SP/h1/upstream/upstream_raw/swpc_rtsw_*`; `test_rtsw_parser_skips_inactive_spacecraft`.

**P3.6 Frontend.**
- The policy sends `forcing=hybrid&live_data=true` only within the live window.
- The chip shows source dates and attribution ("Source: WDC-SILSO, Royal Observatory of Belgium", CC BY-NC; NOAA SWPC; UP F24-25).
- **Test:** `policy: live only within window`.

**P3 acceptance:**
- backend tests green;
- browser: "Jump to now" then pause shows the observation sources in the chip; unpausing at 4 d/s returns the chip to synthetic within one poll;
- counting calls with the urlopen wrapper (`$SP/h1/profile/h1prof.py`): ≤ 2 snapshot fetches in 10 min near now;
- with the upstream shim in `H1_UPSTREAM=hang` mode (`$SP/h1/tests/e2e/upstream_shim/`): HTTP 200 within 2.5 s and the chip says "observations unavailable (upstream slow)".

### P4: Fix the PFSS maths (H-2) and make PFSS cacheable

**Branch:** `fix/pfss-legendre-and-cache`. Backend only; nothing new is shown. It can start in parallel with P1/P2.

**P4.1 One normalisation convention in all three Legendre routines.**
- **Change:** use Schmidt semi-normalised functions in `_associated_legendre` (`pfss_magnetogram.py:281-313`, decomposition), `PFSSField._legendre_at_point` (`:488`, per-point evaluation) and `PFSSField._legendre_batch` (`:605`, WSA).
- **Why:** the audit proved the first one wrong. The other two were never tested, so fixing only `:281` can leave decomposition and evaluation inconsistent (inference).
- **Tests** (adapted from `agent-notes/CODEBASE_AUDIT_2026-09-24_EVIDENCE/scripts/pfss_check.py`):
  - `test_associated_legendre_matches_closed_form` (P₂/P₃/P₄ at 0.5 = −0.125 / −0.4375 / −0.2891);
  - `test_three_legendre_implementations_agree` (1e-12);
  - `test_legendre_orthogonality` (1e-10);
  - `test_pure_dipole_decomposes_without_l3` (today g₃₀ = −2.174);
  - `test_source_surface_ratio` (0.09302 for ℓ=1, 0.04238 for ℓ=2);
  - `test_reconstructed_br_matches_input` (0.622 at θ = 0.9; today 3.113).
- Add `solver_version: "pfss-schmidt-2"` and `solver_validated: true` to the output and to the cache key.

**P4.2 A cache key that can hit.**
- **Change** (`:1117-1173`): key = (solver_version, source_id, seed bucket `int(jd*100) % 99991` using exactly the expression at `:238`, rotation number, activity rounded to 0.01 *and used for the computation*, n_lines, lmax). Drop the gong timeout from the key. Raise max_entries from 3 to 32 (≈40 MB; BR M).
- **Why this is safe:** today `_compute` depends on jd only through the seed and the rotation number (`:201-272`, `:1238-1302`).
- **Tests:**
  - `test_same_seed_bucket_shares_compute` (jd + 1e-8 → 1 computation);
  - `test_activity_drift_within_quantum_shares_compute` (0.5467460 vs 0.5467628; BR F14);
  - `test_bucket_key_uses_seed_arithmetic` (boundary at 2461308.55; BP F15);
  - keep the existing "+1 day" and "0.25 vs 0.75" distinct-key cases;
  - remove the gong_timeout case deliberately, with a comment explaining why (T9).

**P4.3 Switch GONG off until it is fixed.**
- **Change:** `PFSS_GONG_ENABLED=False` around `:1252-1258`.
- **Why:** it has never found a file (UP F7); this saves 0.15–3.5 s per cache miss and removes the tests' only outbound call.

**P4.4 (optional, owner-gated)** Vectorise `trace_field_lines` using the batch evaluator (`:677, :697-706` vs `:532-603`), only if P5's cold latency is not acceptable.

**P4 acceptance:** pytest green; `pfss_check.py` prints the exact values; one cold PFSS run at high fidelity is timed and recorded (runtime after the fix has not been measured; BP open question).

### P5: Field lines on screen when they can be correct and current

**Branch:** `feat/solar-pfss-layer`. Depends on P4, P2.2, P1.3 and P1.4.

- **P5.1** A second, non-polling client requests `include_pfss=true` only when the "Magnetic field" toggle is on **and** the sim is paused: once per seed bucket per toggle-on, with a 20 s timeout. When the sim moves out of the bucket, fall back to the labelled analytic lines. **Why:** at 4 d/s the seed bucket changes about 400 times per wall-second (DG/BR HP).
- **P5.2** Move the field-line group from `sunVisualNode` (`sunController.ts:250`) to the spin group, with transform M and the P1.4 height compression.
- **P5.3** Cache hits are served on the light path. **Test:** `test_pfss_cache_hit_served_without_heavy_slot`.
- **P5.4** Chip text: "Field lines: backend PFSS (synthetic magnetogram, solver pfss-schmidt-2); independent of the drawn active regions". The magnetogram uses its own random bipoles (`pfss_magnetogram.py:238`), not the model's active regions (D8).
- **Accept:** paused with the toggle on gives exactly 1 PFSS request, cold ≤ 12 s on an idle host, 120 lines drawn, and fast-path p95 ≤ 300 ms *during* that computation. Unpaused: 0 PFSS requests over 5 min.

### P6: The SDO image, done right

**Branch:** `feat/solar-aia-disk`.

- Use the full-disk image `downloadImage?id=&scale=8` (512 px, 129 KB; UP M) instead of `getTile(x=-1, y=-1)` (`solar_realtime_data.py:443-455`).
- The tile route serves the image by `image_id` from memory, 404 if unknown (`server.py:935-941`). This deliberately changes the `jd is None` assertion at `test_solar_physics_api.py:131`.
- Coronal-hole detection uses rsun/scale metadata (`:526-529`).
- Dates become ISO-8601 with Z, and the frontend stops `Date.parse`-ing strings without a zone (`solarObservationTexture.ts:66-72`).
- The shader projects the disk onto the Earth-facing hemisphere instead of wrapping it as a globe (`sunVisuals.ts:282-285`).
- Turn on the P1.7 gate only near now; restore the AIA proxy weight only if calibrated; add "Courtesy of NASA/SDO and the AIA, EVE, and HMI science teams" and the Helioviewer credit.
- **Tests:** `test_aia_tile_honours_the_image_id…` (TC draft), `test_coronal_hole_detector_uses_rsun_metadata`, vitest `disk projection maps limb to limb`.
- **Accept:** near now, at least one tile loads with HTTP 200 (the audit's remaining H-1 criterion). Viewed from Earth's direction, the image's limb lies on the sphere's limb within 2% of the radius.

### P7: Hardening

**Branch:** `chore/solar-ci-contracts`.

- CI workflow: vitest, offline pytest, strict tsc with no new errors, build.
- Playwright end-to-end job with the upstream shim.
- Nightly live canary for SWPC, SILSO, Helioviewer and GONG schemas (UP F26).
- Payload budget test: ≤ 400 KB raw / 150 KB gzip after rounding arcs to 4 decimal places (BP F17).
- README: CORS, preview, and the solar status chip.
- Proxy or reverse proxy once a deployment exists (D5).
- GONG ingestion (day directories, sine-latitude resampling, row order, rotation naming; only after P4).
- A lifespan-hook background refresher, only if there are several users (D7).
- H-3 stays on its own track.

---

## 3. Sequencing and dependencies

```
P0 ─► P1 ─► P2 ─► P3 ─────────► P6
            │  └──(P2.2 light path)──┐
P4 (parallel with P1/P2) ────────────┴─► P5
P7: CI config lands in P1.9; the rest continuously
```

| Step | Hard prerequisite | Why |
|---|---|---|
| P2 | P1.3, P1.4, P1.5 | Otherwise data appears 90° off, at 242 AU, and stale (C2, C11) |
| P2.4 | P2.3 | Retry-After is unreadable across origins without `expose_headers` |
| P3 | P1.7 | Otherwise live payloads switch on the AIA globe wrap and the Auto tint (C9) |
| P3 blending | P3.4 green | 3x scale mismatch |
| P5 | P4.1, P4.2, P2.2 | Wrong maths; no cache hits; heavy work would block the fast path |
| P6 | P3.1, D4, D11 | The image must be for "now" and projected correctly |
| GONG (P7) | P4.1 | Real magnetograms through the wrong solver (C8) |

---

## 4. Traps: what must NOT be done

| # | Don't | Evidence |
|---|---|---|
| T1 | Raise the client timeout on its own | Abandoned jobs hold slots 22–29 s (DG/BP F19-20); SPIKE step1 (unverified): data arrived 41.7 sim-days late at 11.6–13.1 s |
| T2 | Raise `SOLAR_PHYSICS_CONCURRENT_REQUEST_LIMIT` or `HEAVY_COMPUTE_THREAD_LIMIT` | GIL: 6.97 s alone vs 20.6–24 s per job in pairs (BP F21) |
| T3 | Bucket only jd for PFSS | Activity drift gives 2 computations for 2 calls (BR F14) |
| T4 | Quantise the client jd to 1 day "for cache hits" | SPIKE step3a (unverified): 6/6 misses at 4 d/s; it also adds up to 1 d of snapping |
| T5 | Use a `/solar` proxy key, or return `''` from `backendBaseUrl` | `/solar-systems` then returns 404; the AIA URL becomes null (CD F14-15) |
| T6 | Unblock with PFSS or the WSA spiral before H-2 is fixed | BR F26; AUD §7.12 |
| T7 | Enable live data at any epoch | FE F11; SPIKE step2 (unverified) |
| T8 | Fix GONG before H-2 and before the grid fix | BR HP; UP HP |
| T9 | Edit pinned tests just to make them pass | `test_compute_budget.py:47-49` is correct: releasing the permit at timeout would let 3+ jobs contend for the GIL. Change `test_snapshot_cache…:24` and the `test_pfss_cache` gong case only deliberately |
| T10 | Treat SWPC RTSW as a URL swap | Newest row comes from an *inactive* spacecraft (0.17 vs 6.85 /cc; UP F6) |
| T11 | Add :4173 through `SOLAR_CORS_ALLOWED_ORIGINS` | It replaces the list, breaking :5173 (CD F4) |
| T12 | Show the tile as it is, or switch to full disk without the shader change | UP F10-11; UP HP |
| T13 | Judge success from backend logs | Aborted requests are not logged (CD F27) |
| T14 | Accept latency measured on repeated identical jds | Hits that production never gets (BP fix_implications) |
| T15 | Run `uvicorn --workers N` | Upstream traffic and caches multiply by N (CD HP) |
| T16 | Fix only some layers' frames | C11 |
| T17 | Compute the PFSS bucket with arithmetic that differs from the seed's | `int(2461308.55*100)` = 246130854 (BP F15) |
| T18 | Fix only `_associated_legendre` | Three separate implementations (`pfss_magnetogram.py:281,488,605`) |

---

## 5. Owner decisions (recommended default and what it changes)

- **D1: PFSS seeding per Carrington rotation vs every 0.01 d.**
  - **Default:** keep 0.01 d (no model change); field lines only while paused.
  - Per-rotation seeding would make PFSS cacheable for about 27 d and showable while the sim runs at ≤ 4 d/s, but it changes model output.
- **D2: Live data only near "now".**
  - **Default:** ±1 d; everywhere else synthetic, and the chip says so.
  - With the default 4 d/s speed, observations then apply only when paused at "Jump to now". Optionally add a "Now (1×)" control.
- **D3: Solar structures on the enlarged Sun.**
  - **Default:** spiral in true AU (3 AU); loops and field lines compressed to at most 0.6 display radii above the surface; everything physical at realistic scale.
  - The alternative is to hide them outside realistic scale.
- **D4: What "Auto" looks like.**
  - **Default:** white light; a channel tint only when a real AIA image is shown (P6).
- **D5: Same-origin proxy vs CORS allowlist.**
  - **Default:** loopback regex allowlist now; a proxy or reverse proxy once a deployment exists.
  - A proxy merges rate-limit identities and needs the XFF fix.
- **D6: SILSO licence (CC BY-NC).**
  - **Default:** non-commercial use with attribution.
  - For commercial use, replace SILSO with a public-domain NOAA product (inference: not probed by the investigators).
- **D7: Single process vs workers.**
  - **Default:** single process, no `--reload` for demos, in-process caches.
- **D8: Field lines consistent with the drawn sunspots.**
  - **Default:** build the synthetic magnetogram from the model's active regions before calling the lines "the Sun's field"; until then, label them.
- **D9: Refresh rate vs rate limit.**
  - **Default:** 2.5 s polls under the 36/min limit. The drawn state then lags the sim clock by at most 10 sim-days at 4 d/s; rotation is corrected every frame.
  - The alternative is a 120/min limit with 1 s polls (≤ 4 d lag).
- **D10: Calibrating observed vs model activity.**
  - **Default:** do not blend until the P3.4 gate passes.
- **D11: Scope of the AIA image.**
  - **Default:** full disk on the Earth-facing hemisphere; the alternatives are a flat overlay (billboard) or dropping it.

---

## 6. Risks and effort

| Risk | Mitigation |
|---|---|
| Frame sign or handedness mistakes (P1.3) | Numeric unit tests on composed rotations; latitude invariant; screenshot |
| Default look changes for everyone (C10) | Announce it; the P1 before/after screenshots show it |
| Regex CORS lets any local page read the API | Read-only public data; no cookies (the API key is a header) |
| Several visible tabs share 36/min | Hidden-tab pause, backoff, D9 |
| H-2 fix changes PFSS runtime (not measured) | Timed in P4; P4.4 as the fallback |
| Helioviewer limits unknown; NWS asks for ≥ 1 min between retries | 600 s TTL, one "now" snapshot, ≥ 1 min backoff |
| Host load made the investigators' timings noisy (load average 17–53) | Re-measure the P2/P5 latency targets on an idle host |
| Phase 0 verification finds problems | Fix before P1; later phases build on its chip |
| The backend model itself is procedural | "Correct" means rendered faithfully, plus validated wherever it claims physics (H-2, the calibration gate) |

**Effort:** P0 0.25 d · P1 2–2.5 d · P2 1.5–2 d · P3 1.5–2.5 d · P4 1–1.5 d · P5 1–1.5 d · P6 2–4 d · P7 2–3 d. **Total ≈ 11–17 d.** The first correct, backend-driven Sun is on screen after about 3.5–4.5 d.

---

## 7. End-to-end acceptance for the owner's definition of done

**Harness:** `$SP/pw/h1-tests-acceptance.mjs`, moved into the repo as `e2e/solar-acceptance.mjs` with the scene checks from `h1-frontend-inject.mjs`, run against real servers on :5173 and :4173.

1. **Data is delivered.**
   - 5 min at +4 d/s plus 2 min paused.
   - ≥ 95% HTTP 200; 0 blocked by CORS, aborted or rate-limited.
   - Fast-path p95 ≤ 300 ms.
2. **The Sun is visibly driven by the backend (A/B test with the backend on and off).**
   - Loops: 0 off vs ≥ 100 on.
   - Sunspot groups: their region ids match the payload's `active_region_id`s.
   - Coronal holes: the count equals the payload's.
   - Spiral: 6 lines present.
   - Surface activity uniform equals `activity_index` to within 1e-6.
   - Screenshot difference in the Sun box above a threshold. SPIKE imgdiff (unverified) measured a mean absolute difference of 18.7–19.2 and 20% of pixels changed by more than 24 levels.
3. **What is shown is correct.**
   - Sunspot-latitude p95 ≤ 35°.
   - Loop footpoints within 1% of the surface.
   - Loops ≤ 1.6 display radii at the default scale.
   - Spiral at 3.0 AU ± 1%.
   - At t = epoch, a feature's rendered direction matches the transformed payload direction within 0.5°.
   - Longitude drift in the Sun's own frame ≤ 1.5° per poll at 4 d/s.
   - No field lines unless `solver_validated`.
   - No AIA texture unless full-disk mode is on.
4. **The source of each layer is visible.**
   - The chip is `backend`, and its layer list matches the actual sources.
   - Killing the backend gives `stale`, then `error`, and the layers fall back.
   - Paused at "now", the chip shows observation sources with dates, or "not blended: calibration pending".
5. **Failures are reported honestly.** In hang mode the chip shows the reason within 2.5 s and the page keeps working.

---

## 8. Deferred on purpose

| Deferred item | Until | Why |
|---|---|---|
| PFSS lines and the WSA-driven spiral | After H-2 is validated (P4) | They are wrong today |
| Showing PFSS while the sim runs | D1 | The seed bucket changes about 400 times per wall-second at 4 d/s |
| Blending observations into activity | The P3.4 calibration gate passes | The two scales differ by 3x |
| The AIA image | P6 | The image is the wrong crop and the wrong projection |
| GONG ingestion | After H-2 and the grid fix | Real magnetograms would go through the wrong solver |
| Background refresher / lifespan hook | Several users (D7) | The bounded wait and "latest" key (P3.2) suffice for one |
| Process pool / vectorised tracer | Only if needed (P4.4) | Keeps P4 small |
| Typed shared contract, repo-wide tsc cleanup | P7 or later | Not needed to fix H-1 |
| Proxy / production deployment | D5 | No deployment target exists yet |