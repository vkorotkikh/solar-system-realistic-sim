# H-1 plan: a Sun that the model drives, that sits in the right place, and that says where each layer comes from

**Angle:** product truth and scientific correctness first. I start from what the owner and a user must see on screen and be able to trust. For each visible layer I define an acceptance oracle, then list the engineering needed to pass it.

**Baseline:** `main@bd48a7d`. Phase 0 is branch `fix/solar-data-status-notice` (`d637501..728d21c`, 4 commits, not merged).

**Shorthand:**
- `$H1/` = `/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/`
- "digest" = `$H1/digest.md`, cited as area·fact number, e.g. *frontend F27*
- "audit" = `agent-notes/CODEBASE_AUDIT_2026-09-24.md`
- Line numbers are at `bd48a7d`. Phase 0 shifts `sunController.ts` by about 30 lines.

**Tags:**
- **(F)** fact, checked in code or an artifact
- **(I)** inference
- **(U)** taken from the spike investigator who died before reporting, so not verified
- **(N)** a new finding I made while writing this plan, from the code or a computation in Appendix A

---

## 0. For the product owner (plain language)

**Where we are.** Everything you see of the Sun today is drawn by the browser alone. None of the server's solar model reaches the screen: in the audit's tests 0 of 39 dev requests and 0 of 44 preview requests succeeded. Phase 0 adds a "Sun:" status chip that says so and gives the reason.

Even the browser's stand-in Sun is wrong. A one-line bug pins its activity at 0, which shows a completely quiet Sun. Its own solar-cycle model gives 0.754 for this month (*frontend F2*, `$H1/frontend/fallback_activity.log`).

**Why "make the requests succeed" is not enough.** We tested what the screen shows if data simply starts flowing, using an injected server reply. Several wrong things appear at once:

- **Field lines** come from a solver with a known maths error (audit H-2). They are also built from a different, randomly generated set of sunspots than the loops and spots on screen, so they do not connect to anything you see **(N1)**.
- **Solar-wind spiral** is drawn about 80 times too large, out to 242 AU, past Neptune (*frontend F27*).
- **Loops** reach 1.8 AU, beyond Mars' orbit. They sit in a frame turned about 90° from the Sun's axis, and they spin twice as fast as they should (*frontend F27–29*, **N2**).
- **Sunspots** land near the poles: 54% of them above 40° latitude (*frontend F28*).
- **The "SDO image"** is a close-up of about 3% of the disk, stretched around the whole globe (*upstream F10–11*).
- **Today's observations** get mixed into 1990 or 2040 (audit M-8).
- **The default colour** of the Sun changes to a 193 Å tint without anyone asking (*frontend F17*).

**The rule this plan follows.** No layer the server sends reaches the screen until a test proves that layer is correct. Each layer is switched on separately, in this order:

1. The browser's fallback is made correct.
2. The plumbing is fixed, so data arrives quickly and reliably.
3. The surface and corona layers are placed correctly, then switched on.
4. Field lines and solar wind are made physically correct, then switched on.
5. Real observations are placed correctly and credited, then switched on.
6. Tests keep all of this true.

At every step the status chip and a per-layer legend say where each visible layer comes from.

**What you will see after each phase:**

| After | What changes on screen |
|---|---|
| P1 | Correct solar-cycle brightness, flares that are actually visible, and an honest header. Nothing wrong can appear yet, even once data arrives. |
| P2 | The chip reads "Sun: backend solar model" within about a second, in both `npm run dev` and `npm run preview`. The server's activity level drives the Sun. |
| P3 | Model sunspots, loops, coronal holes and flares appear where they belong: correct latitudes, rotating once per 25.4 days, scaled sensibly. |
| P4 | Field lines that pass analytic physics tests and start at the drawn sunspots. A solar-wind spiral that crosses Earth's orbit at the right place. |
| P5 | Real SDO images on the Earth-facing side for the current date, with credits. Measured solar wind. History uses archived sunspot numbers. |
| P6 | Automated checks catch regressions, including a dead upstream feed. The NOAA feed has been dead for 5 months without anyone noticing. |

**What I need from you** (details in §4): how the magnetic map should change over time (D1), how close to "now" live data may be used (D2), how to show the corona at the enlarged default scale (D3), what "Auto" should look like (D4), what happens while time runs fast (D5), whether the app may ever be commercial (D6, because of the SILSO licence), and whether you want a real-time "Live" speed (D11).

**Effort:** about 19–27 developer-days over six phases. Each phase ships and is verified on its own branch, in small commits.

---

## 1. The system as interconnected parts

### 1.1 The chain, part by part

| # | Part | Current state (evidence) | What breaks | Depends on / constrains |
|---|---|---|---|---|
| 1 | **Client cadence & epoch** | Polls 900 ms after success and 6 s after error. Sends `jd.toFixed(8)` of a clock running 4 d/s. Always sends `hybrid` + `live_data=true` (F, `sunController.ts:152-160`, `solarPhysicsClient.ts:119`). About 66 requests/min when the server is fast (*tests M*). | A new epoch every poll defeats every cache. The rate exceeds the server limit. Today's data is requested for any date. | Constrains 4, 7 and 8. Depends on the cache bucket design (7) and the live window (D2). |
| 2 | **Client patience** | 2.6 s abort (F). Clamped to ≤ 20 s and poll ≤ 30 s (`solarPhysicsClient.ts:58-59`). The next request is scheduled from request start. A duplicate 6 s gate in `sunController.ts:531`. | Every abort orphans server work. Raising the timeout alone makes requests back-to-back (*frontend hidden*). | Must exceed the server budget (4/5), or the server must cancel work. |
| 3 | **Transport / CORS** | No `vite.config`. `backendBaseUrl()` hard-codes `:8042` in 4 places (*config F1–2, M*). The allowlist lacks `:4173`, and the env var replaces the list instead of extending it (`server.py:91-119`). 500s carry no ACAO header and `Retry-After` is not exposed (*config F11*). A same-origin proxy was shown to work (*config F13*). | Preview is always rejected. Rejected requests still cost full compute (*config F8*). Errors are unreadable. | A proxy puts every browser on one rate-limit identity and makes X-Forwarded-For spoofable (*config F16–17*), which constrains 4. |
| 4 | **Admission / guards** | Rate limit 36/60 s runs before validation, so 503s count against it. `BoundedSemaphore(2)`. The shared 2-thread heavy executor also serves porkchop and mission (`server.py:168-187, 277-302`). Slots are freed only when the worker finishes (*backend F3–5*). | Orphans hold both slots for 22–29 s (*profile F19–20*). Porkchop starves. Two concurrent jobs each run about 3× slower because of the GIL (*profile F21*). | Any speed-up of 5/6 collides with the 36/min limit (C1). |
| 5 | **Compute, fast part** | Activity, 540 flux-tube scores, feature arcs, holes and spiral geometry take about 20–50 ms in total (*backend F13–19*). | Nothing, except that it is always bundled with 6. | Scales with the feature count, not with PFSS. |
| 6 | **Compute, PFSS + WSA** | 97–99.6% of a 4–10 s request. Pure-Python per-point RK4 (*profile F3*). Seeded `int(jd*100) % 99991` (`pfss_magnetogram.py:238`). H-2 Legendre bug (`:281-313`). Magnetogram independent of the model's active regions **(N1)**. | Latency, flicker at 0.01 d bucket boundaries (*backend F18*), wrong physics. | Gates 10 (field lines, spiral winding via WSA). Depends on 12. |
| 7 | **Caching / reuse** | PFSS LRU with 3 entries, keyed on exact jd and exact activity (`pfss_magnetogram.py:1107, 1165-1173`). Snapshot keyed on exact jd (`solar_realtime_data.py:131`). Activity drifts with `datetime.now()` (`solar_physics.py:391-395`). | 0 hits while the sim runs, and 0 hits even when paused in live mode (*profile F5*). | Pinned by `test_snapshot_cache_isolated_by_requested_julian_date` and `test_pfss_cache_identity_includes_every_output_affecting_input`. |
| 8 | **Upstream data** | SWPC returns 404 since about 2026-04-30 (*upstream F4*). GONG discovery never succeeds (F7). SILSO fetches 2.9 MB per miss (CC BY-NC). AIA `getTile` returns a 3%-of-disk crop (F10). The all-failed snapshot is cached as a success for 120 s. No stale-on-error fallback. Timeouts are per socket only (F16–19). | Wrong or missing observations. A fast server becomes a traffic generator: about 13 upstream calls per new jd and about 3 GB/h of SILSO per tab (*upstream F27*). | Depends on D2 (which epochs use live data) and D6 (licence). |
| 9 | **Response contract & provenance** | Untyped dict, `schema v1`, about 640 KB raw. `gong_synoptic.ok` is always true (`solar_realtime_data.py:809-823`). `live_data_enabled` just echoes the request. There is no frame field and no per-layer source (*backend F12, F25*). | The UI cannot be honest about sources. The four frontend interfaces have already drifted (*tests F10–11*). | Feeds 11. The frame block is needed by 10. |
| 10 | **Frontend consumers & display correctness** | Scale is 81× inflated. z-up vs y-up mismatch. Loops spin while PFSS does not. Shaders use world Y as solar north **(N3)**. Flares expire on their first frame. `Number(null)` pins activity at 0. Auto switches to 193 Å (*frontend F2–3, F17, F27–29*). | Every layer that has never run switches on wrong at once (C4). | Depends on 9 (frame) and on decisions D3, D4, D5 and D8. |
| 11 | **Status / honesty** | Phase 0 chip (connecting / backend / stale / error plus reason). No per-layer provenance. "Live simulation" badge at `index.html:40`. No attribution in the UI (*upstream F25*). | "Backend" does not say which layers are backend-driven or correct. | Depends on 9 and on the gate table. |
| 12 | **Correctness gates** | H-2 wrong: P₂(0.5) = −0.634 instead of −0.125; a pure dipole returns a spurious g₃₀ = −2.17 (audit §7.12; `$H1/backend/h2_quickcheck.log`). No analytic test exists. No plausibility tests either: 72 concurrent CMEs at 844–2,492 km/s **(N6)**. | Unblocking ships wrong physics. | Blocks ungating in 10. |
| 13 | **Tests / CI** | No CI. No frontend solar tests (Phase 0 adds client and status tests). Backend tests use the cheap synthetic path and call gong.nso.edu for real. 246 strict TS errors (*tests F1–19*). | Regressions go unseen, as the SWPC outage did for 5 months. | Everything else. |
| 14 | **Ops / deploy** | uvicorn `--reload`, a single process, no lifespan hook, all caches in process memory (*config F20–22*). | A refresher needs a lifespan hook. `--workers N` multiplies upstream traffic and splits caches. | D10. |

### 1.2 Couplings (why nothing can be fixed alone)

- **C1 Faster server ⇒ 429 flapping.** At 66 requests/min against a limit of 36/min, the client gets 429s within about 30 s (*frontend F9*). The spike saw 429s in a real run (U, `$H1/spike/capture_step4rate.stdout`).
- **C2 Fixing CORS alone** swaps CORS errors for aborts and 12 s 503s (*config hidden*, R5/R6).
- **C3 Raising the timeout or concurrency alone** makes things worse: requests go back-to-back, orphans pile up, and the GIL makes each job about 3× slower (`$H1/profile/p8_threads.log`).
- **C4 Unblocking exposes every display bug at once,** plus the H-2 lines and the WSA-driven spiral winding (*backend F26*).
- **C5 Quantising jd alone does not produce cache hits.** Activity drift and the float seed-bucket boundary both defeat it (*profile F5, F15*). At 4 d/s even a 1-day bucket rolls 4 times per wall-second.
- **C6 Fixing GONG** runs observed maps through H-2 on the wrong grid: sine-latitude vs uniform colatitude, and the row order (*backend hidden*).
- **C7 Fast plus live** turns every tab into an upstream amplifier (*upstream F27–28*).
- **C8 A same-origin proxy** means one rate-limit identity and spoofable XFF (*config F16–17*).
- **C9 A full-disk AIA image with today's shader** wraps black sky around the globe (*upstream hidden*).
- **C10 The epoch-aware live window (D2)** makes almost all requests at 4 d/s synthetic. That is cheaper and quieter upstream, but live observations then show only while paused near "now". This couples to D11.
- **C11 Fixing the shader frame (N3)** also changes today's procedural look: polar features move to the true poles (D12).
- **C12 Carrington-frame output (§2 P3.1)** makes rotation exact at any display time. Stale payloads then only lag in slow evolution: at most 0.53°/day at active latitudes (Appendix A4). Inertial output would put a payload 3.6 d old 51° out of place. This is what makes sparse polling correct.
- **C13 Stale-while-revalidate PFSS** means field lines lag the sim epoch. The legend must state the lag, and D5 sets the rule.
- **C14 Pinned tests** encode today's behaviour and must be changed on purpose:
  - `test_snapshot_cache_isolated_by_requested_julian_date` (`test_solar_realtime_data_cache.py:24`)
  - `test_timeout_keeps_capacity_owned_until_worker_exit` (`test_compute_budget.py:20`, asserts at :47-49)
  - the jd-identity cases in `test_pfss_cache.py:44`
  - `test_cme_speed_distribution_covers_slow_and_fast_populations` (asserts max > 2,500 km/s)
  - the AIA route asserting `jd is None` (`test_solar_physics_api.py:131`)

### 1.3 Layer truth table (what the user sees, and what "correct" means)

| Layer | Today (no data) | If data were simply unblocked | "Correct" means (oracle) | Ungated in |
|---|---|---|---|---|
| Activity (brightness, spot count, flare rate) | **0.000** (bug); the model gives 0.754 (F) | 0.55–0.79, with today's SILSO blended into any date (F, M-8) | Front and back use the same model (parity test). Observations only inside the live window. Archived SSN for past dates (D2/D6). | P1 fallback, P2 backend |
| Sunspots | 1 synthetic spot | 8 groups, 54% above 40° (F) | Rendered \|lat\| p95 ≤ 35° (backend p95 30.8°). Groups fixed on the rotating surface. | P3 |
| Coronal loops / eruption arcs | 0 loops, 360 random plume points | 144 loops out to 1.8 AU, frame 90° off, rotating twice (F / N2) | Footpoints in the drawn spot groups. Heights follow the D3 policy. Inertial drift 14.2 ± 0.6 °/day. | P3 |
| Flares / CMEs | None: activity 0 means no spawns, and events expire on frame 1 (F) | Still none (lifetime bug) | Events outlive their flash at both scales. Origins at feature latitudes. Rates within the D8 band. | P1 lifetime, P3 source |
| Coronal holes | Generic pattern around the **wrong axis** (N3, I) | 5 synthetic holes, through the same frame bug | At solar minimum, a side view shows darker top and bottom limbs than equatorial limbs. | P3 |
| Field lines (toggle) | Analytic dipole built once at activity 0.5 | 120 H-2-wrong lines, unrelated to the spots (N1), not rotating | Analytic PFSS oracles pass. ≥ 70% of closed footpoints lie within 10° of a drawn spot group. | P4 |
| Solar-wind spiral | None | 6 arms out to 242 AU (F) | Winding at 1 AU = atan(Ωr/v) ± 1°. The arm crosses 1 AU at Earth's orbit radius ± 1%. | P4 |
| Observation image (AIA) | Never requested | 3%-of-disk crop wrapped as a globe; the "latest" image for any date (F) | Full disk on the Earth-facing hemisphere at image time: disk centre ± 2% R, pole ± 2°. Only near its own epoch. Credited. | P5 |
| Channel look | Auto = white light | Auto flips to a 193 Å tint (F) | The default chosen in D4. | P3 / P5 |
| Provenance | Phase 0 chip | The chip says "backend" for everything | Every visible layer is listed with its source and epoch. Attribution is shown whenever an observed layer is visible. | P3 legend, P5 credits |

---

## 2. Phased implementation plan

Conventions:
- One branch per phase, cut from `main` after the previous phase merges. Phase 0 merges first.
- One commit per numbered step, or 2–3 if the step is large.
- Every pinned-test change gets its own commit, and the commit message says why the test changed.
- Harnesses:
  - `npm test -- <file>` (vitest)
  - `cd backend && python -m pytest <file> -q`
  - `node scripts/e2e/solar-acceptance.mjs …` (created in P1.6)
- Pushing is the owner's action. This environment cannot push to origin.

### Phase 0: status chip (done, on its branch)
- Typed failure kinds, and a `Sun:` chip with the states connecting / backend / stale / error (`solarDataStatus.ts`, `solarPhysicsClient.ts`).
- **Gaps that later phases close:**
  - The "backend" text does not say which layers are backend-driven (P3.8).
  - Its "observations blended N%" figure can include today's data blended into another epoch (fixed by P1.4 and P2.5).
  - "Procedural fallback" currently means a broken fallback (fixed by P1.1).
- **Exit:** the browser verification now in progress is green, then merge.

### Phase 1: a truthful Sun without the backend, and gates so nothing wrong can appear
**Branch:** `fix/solar-truthful-fallback` · **Effort:** 1.5–2 d · Frontend plus test infrastructure only.

**1.1 Correct fallback activity.**
- **Change:**
  - Move `hathawayRaw`, `hathawayNormalized` and `fallbackSolarActivityFromJulianDate` (`sunController.ts:63-94`) into a new `src/frontend/features/solar/solarActivity.ts`.
  - Add `resolveSolarActivity(blendActivity, payloadActivity, jd)`, which treats `null` and `undefined` as missing. `Number(null)` is 0, which is why the Number.isFinite chain at `sunController.ts:405-410` never falls back.
  - Use the resolved activity instead of the `|| 0.5` in `rebuildMagneticFieldLines` (`:233`).
- **Why:** `buildSolarFeatureBlendView` returns `activityIndex: null` (`solarFeatureBlending.ts:212-221`), which pins activity at 0 (*frontend F2*).
- **Tests:**
  - `solarActivity.test.ts`: `falls back to the cycle model when no backend state` (0.754 ± 0.001 at 2026-09-24; 0.067 at 2019-12; values from `fallback_activity.log`).
  - `matches the backend _activity_index at 25 epochs 1990–2040` against the fixture `src/frontend/features/solar/__fixtures__/activity_parity.json`.
  - Backend `test_activity_parity_fixture_is_current` regenerates that fixture from `solar_physics.py:522-528` and compares, so the two copies cannot drift apart.
- **Accept:** `npm test -- solarActivity`. Browser check with the backend stopped: `__solarDiagnostics().activity.uniform` = 0.754 ± 0.01 at 2026-09-24.

**1.2 Flares that live at the default scale.**
- **Change:** `solarFlares.ts:225-228`. Express the CME travel limit relative to the Sun, e.g. `sunRadiusAu × 4`, and enforce `maxLifeTimeSec ≥ flashDurationSec`.
- **Why:** today (0.3 AU − 0.3755 AU) / v is negative, so events expire on their first update (*frontend F3*, `flare_probe.log`).
- **Tests:** `solarFlares.test.ts`, with `event outlives its flash at display radius 0.3755 AU` and `…at realistic radius 0.00465 AU`.
- **Accept:** in a 60 s run at the fallback activity (0.754), diagnostics show `flares.maxLive ≥ 1` at the default scale.

**1.3 Layer gates and a diagnostics hook.**
- **Change:**
  - New `solarLayerGates.ts` with one table of `{layerId: 'on' | {gated: reason}}`: activity on; sunspots, loops, eruptions, flares-from-model and holes gated on "frame" (P3); field lines on "H-2" (P4); spiral on "scale+H-2" (P4); observation image on "projection" (P5); Auto tint on "D4".
  - In `sunController.update` (`:411-470`), each gated consumer gets `null` physics state, so it keeps its procedural path.
  - `maybeRefreshObservationTexture` (`:253-287`) is also gated.
  - New `solarDiagnostics.ts` exposes `window.__solarDiagnostics()` when `?diagnostics=solar` is set or in DEV. It returns per-layer `{id, visible, gatedReason, source, payloadEpochJd, count, maxRadiusAu, latitudesDeg}`, the activity uniform, the frame values used by P3 and the request counters. It is built from the uniforms and groups the code already holds.
- **Why:** this lets P2 deliver data without exposing wrong layers (trap T1).
- **Tests:** `solarLayerGates.test.ts`. Case one: `gated layers never receive backend state`, using a trimmed `payload_high_180.json` fixture and spies on the update functions. Case two: `every layer id has a legend entry`.
- **Accept:** e2e against a fixture backend. Every gated layer reports `source: 'procedural'`, and the Parker group has 0 children.

**1.4 Epoch-aware request mode (client-side M-8 mitigation).**
- **Change:** in `solarPhysicsClient.ts:118-124`, send `forcing=hybrid&live_data=true` only when |simJd(TDB→UTC) − now| ≤ the live window. The window defaults to 1 d (D2). Otherwise send `synthetic&live_data=false`. Make the client options configurable through `createSunController` (`sunController.ts:152-160`), following the existing `readRuntimeNumber` pattern.
- **Why:** SWPC and SILSO are always "now" data, and the AIA picker returns the latest image for future dates (*upstream hidden*). This also cuts upstream fan-out and saves 2.5 s per request (*profile F8*: 6.18 s vs 8.63 s).
- **Tests:** `solarPhysicsClient.epochMode.test.ts`:
  - `now → live`
  - `now+2 d → synthetic, no live`
  - `1990-01-01 → synthetic`
  - `uses UTC not TDB for the window` (69.184 s offset)
- **Accept:** after 1 s at 4 d/s, the e2e request log shows 100% `live_data=false`. The chip reads "synthetic forcing, no observations".

**1.5 An honest header.**
- **Change:** in `index.html:40`, replace "Live simulation" with a badge driven by the sim rate: "Simulation · +4 d/s", or "Paused". The chip carries the data truth.
- **Tests:** an e2e DOM assertion.

**1.6 Test infrastructure.**
- `.github/workflows/ci.yml` (none exists). It runs:
  - `npm ci && npm test`
  - `npx tsc -p tsconfig.solar.json`, a strict typecheck scoped to `src/frontend/features/solar/**` and `src/sunController.ts`, because 246 errors elsewhere would hide new ones
  - `pip install -r backend/requirements.txt -r backend/requirements-dev.txt`. The new dev file adds `httpx`; without it TestClient fails (*tests F19*).
  - pytest with an offline plugin ported from `$H1/tests/plugins/h1_offline.py`
- Add runtime params `?date=<ISO>&rate=<d/s>` in the time controller. The oracles need them to be reproducible.
- Port the Playwright harness `scratchpad/pw/h1-tests-acceptance.mjs` and its upstream shim (`$H1/tests/e2e/upstream_shim/sitecustomize.py`, modes `fixture|offline|hang`) to `scripts/e2e/`, and add `@playwright/test` as a devDependency.

**Phase 1 exit:**
- CI is green.
- With the backend stopped: activity = model, flares visible, chip "procedural fallback (…)".
- With a fixture backend: no gated layer draws backend geometry.
- Six commits.

### Phase 2: deliver the fast part of the model (plumbing, honesty, M-8)
**Branch:** `feat/solar-delivery` · **Effort:** 3–4 d · Can run in parallel with P4a.

**2.1 Same origin by default.**
- **Change:**
  - New `vite.config.ts` with `server.proxy` keyed by an anchored matcher `'^/(solar|health)(/|\\?|$)'` pointing at `http://127.0.0.1:${BACKEND_PORT ?? 8042}`, with `xfwd: false`. Preview inherits it (*config F12*).
  - Never use the bare key `/solar`: it swallows `/solar-systems/` (`proxy-key-collision.txt`).
  - New `src/frontend/app/runtimeConfig.ts` with `backendBaseUrl()` resolving in this order: `?backend` (DEV only), then `VITE_BACKEND_URL`, then `window.location.origin`. Never return `''`, which disables AIA (`aia_url_check.txt`).
  - Replace `main.ts:188-195`, `trajectory/index.ts:9` and `simulationClient.ts:113,129`. Forward `BACKEND_PORT` in `scripts/dev-full.mjs:128-144`.
- **Backend safety net:**
  - `server.py:101-119`: add `:4173` for both hostnames; add an additive `SOLAR_CORS_EXTRA_ORIGINS`; reject `*` loudly; set `expose_headers=['Retry-After']`; add a JSON 500 handler that carries CORS headers.
  - Rate-limit identity: `request.client.host` instead of the first XFF hop (`server.py:323-330`), plus a deliberate `--forwarded-allow-ips` (M-6).
- **Tests:**
  - `runtimeConfig.test.ts`: resolution order; `never empty`; `AIA proxy URL non-null for the chosen base`; `proxy matcher skips /solar-systems/manifests/sirius.json`.
  - Backend `test_cors_contract.py`:
    - {localhost, 127.0.0.1} × {5173, 4173}, as a preflight and a GET on `/solar/physics` and `/solar/realtime/aia-tile`, must carry ACAO
    - `attacker.invalid` must get none
    - a forced 500 must carry ACAO and a JSON body
    - `Retry-After` must be exposed
  - `test_rate_limit_identity_ignores_spoofed_xff`.
- **Accept:** in e2e from dev and from preview, 0 console CORS errors.

**2.2 A fast "core" lane that never runs PFSS on the request path.**
- **Change:** add a query param `pfss=off|cached|compute` to `server.py:991-1067` → `_build_solar_physics_state` (`:389-417`) → `sample_state` (`solar_physics.py:1015-1163`). The frontend sends `cached`.
  - On a PFSS cache miss, skip `get_or_compute`, and with it the GONG fetch. Emit `pfss_field_lines: {status: 'not_computed' | 'pending', reason}`.
  - The spiral takes the empirical path. That is dead code today, because `has_wsa` is always true at `:910`.
  - Run the core lane on its own small executor, not `_heavy_compute_executor`, and set its server budget to 5 s.
  - Client timeout 8 s. The rule: the client timeout must exceed the server budget plus the proxy hop, so no orphans form (*config fix-impl*).
- **Why:** the fast part costs 20–50 ms; PFSS is 97–99.6% of the cost (*backend F18*).
- **Tests:** `test_solar_physics_core_lane.py`:
  - `core request never calls PFSS or GONG` (recording stub)
  - `empirical spiral winding is used when no WSA` (asserts winding against `atan(Ωr/v)`)
  - `core request is admitted while two PFSS jobs hold the heavy slots` (the `slot_holding` scenario must return 200)
  - Perf-marked (`H1_PERF=1`): `core cold p95 < 300 ms over 20 fresh jds`
- **Accept:** `for j in $(seq 20); do curl -so /dev/null -w '%{time_total}\n' ":8042/solar/physics?jd=24613$((10+j)).3&fidelity=high&max_features=180&forcing=synthetic&live_data=false&pfss=off"; done`, with p95 < 0.3 s on an idle host.

**2.3 Keep upstream I/O off the request path (minimal version; P5.1 completes it).**
- **Change:**
  - Key the snapshot on wall-clock buckets for requests inside the live window: `('snapshot', 'wall', floor(now/300 s))`.
  - Refresh in a background thread with single-flight.
  - The request path waits at most 50 ms, then returns `observations: 'refreshing'`.
  - Stop caching an all-failed snapshot as a success (`solar_realtime_data.py:143-164`).
  - Change `test_snapshot_cache_isolated_by_requested_julian_date` in its own commit.
- **Tests:** `test_request_path_never_blocks_on_upstream` (urlopen sleeping 3.8 s must still give a 200 within 0.3 s) and `test_all_failed_snapshot_not_cached_as_success`.

**2.4 Honest response contract.**
- **Change:** in `solar_physics.py:1128-1163`, add:
  - `schema v2`
  - `generated_at_utc`, `compute_ms`, `jd_time_scale: 'TDB'`, `effective_forcing`, `observations_used`
  - `frame: {name, axes, units}` (P3.1 fills it in)
  - `provenance.layers[]`: `{id, source: model|observed|blended, inputs[], validated, solver_version, epoch_jd}`
- Also in the same step:
  - Make `gong_synoptic.ok` true only when a FITS map was parsed (`solar_realtime_data.py:809-823`).
  - Set `live_data_enabled` only when a fetch was actually used (`server.py:415-417`).
  - Carry `fetched_at_utc` through.
  - Export a pydantic model as `backend/schemas/solar_physics_state.v2.json`.
- **Tests:** `test_provenance_contract.py`:
  - `refused upstreams → every source ok:false including gong`
  - `synthetic forcing → live_data_enabled false`
  - `every layer carries provenance`
  - `response validates against schema v2`

**2.5 Epoch-aware and deterministic assimilation (audit M-8).**
- **Change:** `_apply_realtime_forcing` (`solar_physics.py:398-520`) takes `jd_utc` and applies observations only inside the window; otherwise `applied: false, reason: 'epoch_outside_live_window'`. Freshness weights use |observation time − requested epoch| instead of `datetime.now()` (`:391-395`).
- **Why:** this removes the wall-clock drift that defeats every cache (*profile F5*) and fixes M-8 in one change.
- **Tests:**
  - `test_historical_epoch_ignores_live_data` (1990 → applied false)
  - `test_live_blend_is_deterministic_for_fixed_inputs` (two calls 1.5 s apart must be identical; today they drift, `determinism.json`)
  - `test_tdb_to_utc_for_observation_lookup`

**2.6 Client cadence that respects the server.**
- **Change:** in `solarPhysicsClient.ts:99-163` and `sunController.ts:497-534`:
  - Request only when the quantised epoch key changes, or every 60 s.
  - Keep at least 2.5 s between requests, which stays within 0.8 × 36/min.
  - Honour `Retry-After` and 429 with exponential backoff plus jitter.
  - Pause while `document.hidden`.
  - Remove the duplicate 6 s gate at `:531`.
  - Put the force check before the in-flight check (`:498-499`), so "Jump to now" can pre-empt a request.
  - Drop payloads whose `epoch_jd` is more than max(2 d, 1.5 × rate × interval) away from the current sim epoch.
  - Clear the backend state after a jump of more than 30 d, or after 5 consecutive failures, so the chip and the drawing agree.
  - Raise the clamps (`:58-59`) to 120 s poll and 30 s timeout.
- **Tests:** ported from `$H1/tests/vitest/solarPhysicsClient.h1.test.ts`:
  - `≤ 24 requests per 60 s with a 16 ms frame loop and a 50 ms server`
  - `backs off ≥ Retry-After on 429/503`
  - `same bucket → one request`
  - `drops a payload far from the sim epoch`
  - `clears state after a 30-day jump`
  - `forced refresh pre-empts in-flight`
  - plus `test_rate_limit_admits_the_client_poll_rate` (backend)

**2.7 Smaller payloads.**
- **Change:** `GZipMiddleware(minimum_size=1024, compresslevel=1)`, and round arc coordinates to 4 dp in `_build_feature_arc` and in the spiral.
- **Why:** 636 KB raw becomes about 121 KB gzip (*profile F17*).
- **Tests:** `test_payload_budget`: the core-lane frontend query stays ≤ 150 KB gzip.

**Phase 2 acceptance:**
- **Command:** `node scripts/e2e/solar-acceptance.mjs --origin dev|preview --upstream fixture --rate 0|4 --minutes 5`
- **Pass criteria:**
  - ≥ 95% of settled `/solar/physics` requests return 200
  - 0 CORS errors, 0 429s, ≤ 1 abort
  - the chip shows `data-solar-state="backend"` within 3 s
  - `__solarDiagnostics().activity.uniform` = the payload's `activity_index` ± 0.005
  - every gated layer is still procedural
  - the shim counts ≤ 1 upstream snapshot refresh per 5 min wall time, whatever the number of tabs (test with 3 tabs)

### Phase 3: put the surface and corona in the right place, then ungate them one by one
**Branch:** `fix/solar-frames-and-scale` · **Effort:** 4–5 d.

**3.1 One Sun frame, defined once.**
- **Backend:** emit every body-attached layer in Carrington heliographic (HGC) Cartesian coordinates: z = solar north, x = Carrington longitude 0, units R☉. Today region longitudes advance at the full Snodgrass rate from J2000 (`solar_physics.py:585`); instead advance them by (ω(lat) − 14.1844°/d) × (jd − J2000), so the regions only drift slowly relative to the Carrington frame. The spiral is corotating, so it can be emitted in HGC too, in AU. Fill in `frame` from P2.4.
- **Frontend:** new `solarFrame.ts`.
  - `hgcToSunLocal([x,y,z]) = [x, z, −y]`, a proper rotation with det +1, applied at ingest in `solarFeatureBlending.ts`, `sunVisuals.ts:1419-1421, 635-636`, `solarFlares.ts:41-47` and `solarMagnetics.ts:249-251`. **A plain y/z swap is a reflection and reverses the sense of rotation (trap T9, Appendix A5).**
  - `sunOrientation(jd)` from the IAU model: α₀ = 286.13°, δ₀ = 63.87°, W = 84.176° + 14.1844° × d. This replaces the tilt set by `setFromUnitVectors` (`main.ts:309-316`). The Sun's entry in `planets.ts:3-12` has no pole longitude, so its pole leans toward ecliptic longitude 0 instead of 345.77° **(N4)**.
- **Tests:**
  - `solarFrame.test.ts`:
    - `hgcToSunLocal is a proper rotation` (det +1)
    - `lat 20° lon 30° maps 70° from +Y`
    - `prograde: a lon-0 equator point advances 14.184°/day ± 0.01°`
    - `pole at ecliptic (345.77°, 82.75°) ± 0.05°`
    - `B0 ≈ +7.2° near 2026-09-08 and −7.2° near 2026-03-06 (± 0.2°)`, using Earth from the app's own planet model
    - `sub-Earth Carrington longitude ≈ 0° ± 1.5° at JD 2461309.66` (CR 2316 start, Meeus formula; Appendix A6)
  - Backend `test_features_are_emitted_in_hgc`: a region at constant latitude drifts ≤ 0.6°/day in HGC longitude between its 15° and 30° latitudes.

**3.2 Shaders use the Sun's own normal.**
- **Change:** in `sunVisuals.ts:27-41`, add an object-space `vSunNormal`. The Sun mesh and the corona shell are spinGroup children (`main.ts:357`, `sunController.ts:319`), so object space rotates with the body. Use it for latitude, longitude, sunspots and holes at `:38, :245, :270-277, :477, :489-510` instead of `vWorldNormal.y`.
  - Replace the wall-time drift terms (`:245` `time*0.00012`, `:683` `timeSec*0.000261`) with differential rotation in sim time relative to the Carrington rate, passed as a float64-safe delta uniform. The float32 lesson from audit M-1 applies.
- **Why (N3, I):** the shaders measure latitude about world Y, but the scene is ecliptic z-up (`sceneSetup.ts:166`, `main.ts:978-992`) and the spin axis is world ≈ +Z. The procedural poles, streamer belt and sunspot belt therefore sit about an axis in the ecliptic plane, and they do not turn with the mesh.
- **Tests:**
  - `sunShaderFrame.test.ts`, a source-contract test: no latitude computed from `vWorldNormal.y`.
  - Playwright `solar-frame.visual`: at `?date=2019-12-15&rate=0` with the camera in the ecliptic plane, the top and bottom limb sectors (± 20° around the projected spin axis) are ≥ 15% darker in corona brightness than the east and west sectors. Calibrate the threshold on the first green run on a real GPU, then pin it.

**3.3 Sunspots from the model (ungate).**
- **Change:**
  - `sunVisuals.ts:606-650`: use `solarFrame`.
  - Synthetic fill (`:670-689`): latitude from the cycle phase (Spörer's law), not from activity. Today `maxLat = 0.05 + activity × 0.55` inverts the butterfly diagram **(N10)**.
- **Tests:** `sunspotSeeds.test.ts`, with `backend region at (lat, lon) → seed at the same HGC lat/lon ± 0.5°` and `mean |lat| early-cycle > late-cycle by ≥ 10°`.
- **Accept:** diagnostics give rendered sunspot \|lat\| p95 ≤ 35°.

**3.4 Loops and eruption layer (ungate), with the scale policy.**
- **Change:** in `sunVisuals.ts:1419-1421`, map the radius as follows:
  - realistic scale: r × R☉(AU)
  - inflated scale: R_disp × (1 + (r − 1) × k), with k from D3 (default 0.15)
  - The legend says "heights compressed".
- **Tests:**
  - `loopScale.test.ts`: `max radius ≤ (1+1.5k)·R_disp inflated; ≤ 2.5·R☉ realistic`.
  - A co-location oracle: `every drawn spot group has ≥ 1 loop footpoint within 5°` (the same region ids).
  - A rotation oracle through diagnostics: step the sim 1 day while paused; a footpoint's inertial azimuth advances 14.2 ± 0.6°, not about 28° (N2).

**3.5 Coronal holes (ungate).**
- **Change:** the corona shader (`sunVisuals.ts:486-510`) uses the Sun frame, and the holes are in HGC.
- **Tests:** covered by the 3.2 visual oracle, plus `holes.test.ts` (hole centre in HGC maps to the same shader lat/lon).

**3.6 Flares and CMEs from model events (ungate), with a time-lapse policy (D5, D8).**
- **Change:** in `solarFlares.ts`, take origins from HGC `base_dir`. Visual durations are wall-clock by design (`:225`: 15–35 s). Above 1 h/s of sim rate, cap spawns proportionally to the model rate and label the layer "time-lapse".
- **Tests:** `origin latitude = feature latitude ± 0.5°` and `spawns ≤ cap at 4 d/s`.

**3.7 Blending and churn.**
- **Change:**
  - Fixed 1.5 s blend (`sunController.ts:512-515`), including the first arrival.
  - Blend activity, observation blend, sunspots and holes too (`:411-441`).
  - Drop brightness from the magnetic signature (`:194-206`).
- **Tests:** `first arrival fades in` and `brightness-only change keeps the field signature`.

**3.8 Per-layer legend.**
- **Change:** a disclosure under `#status-solar`, built from a pure `describeSolarLayers(payload.provenance, gates, diagnostics)`. One row per layer, e.g. "Loops · 144 · backend model (synthetic) · epoch 2026-09-25 · heights ×0.15", and for gated layers "hidden: validation pending".
- **Tests:** `solarLayerLegend.test.ts`: every visible ungated layer has a row with a source and an epoch; gated layers show their reason.

**Phase 3 acceptance:**
- All layer oracles above pass in `scripts/e2e/solar-acceptance.mjs --oracles surface`.
- A/B difference in the Sun's bounding box, backend vs blocked, at the same `?date&rate=0`: ≥ 10% of pixels differ by > 24 levels. The spike saw about 20%, and a 1% noise floor between runs of the same mode (U, `$H1/spike/imgdiff_step1ab.out`). A difference proves influence, not correctness, so the oracles are the real gate.

### Phase 4: field lines and solar wind that are physically right
**Branches:** `fix/pfss-correctness` (P4a, backend only, can start alongside P2) and `feat/pfss-pipeline` (P4b) · **Effort:** 4–6 d.

**4.1 (P4a) Fix H-2.**
- **Change:** in `pfss_magnetogram.py:281-313`, apply the Schmidt semi-normalised recurrence consistently in numpy (scipy is not a dependency). Match the decomposition normalisation. Add `PFSS_SOLVER_VERSION = 'pfss-2'` to the cache key and the payload.
- **Tests:** `test_pfss_analytic.py`, with the audit's acceptance numbers:
  - `P_l(0.5) = −0.125 / −0.4375 / −0.2891 ± 1e-12`
  - `orthogonality off-diagonal ≤ 1e-10`
  - `pure dipole → g10 = 1, all others < 1e-6`
  - `quadrupole round-trip`
  - `Br(2.5)/Br(1) = 0.09302 (l=1), 0.04238 (l=2) ± 1e-4`
  - Two new oracles that do not share the code's Legendre functions: `dipole field line conserves the flux function Ψ ≤ 1e-3`, and `open-flux fraction of a dipole matches the analytic Ψ(r_ss, π/2) boundary`.
- **Accept:** `python -m pytest tests/test_pfss_analytic.py -q` green; the audit's `evidence/scripts/pfss_check.py` reports the exact values.

**4.2 (P4a) A magnetogram built from the model's own active regions (D1).**
- **Change:** a new `synthetic_magnetogram_from_regions(regions, jd, activity, cycle_phase)`, used by `PFSSCache._compute` (`:1238-1302`) instead of the independent RNG bipoles (`:201-272`).
  - Each `ActiveRegionSeed` (`solar_physics.py:216-249`) becomes a bipole at its HGC position at jd.
  - Polarity follows Hale's law per hemisphere and cycle, tilt follows Joy's law, and strength scales with emergence.
  - The polar field follows the cycle phase.
- **Why (N1):** the field lines should start at the drawn sunspots. Today's generator also gives the same leading polarity in both hemispheres (`:245-271`), which breaks Hale's law.
- **Cache key:** `(solver_version, 'model-regions-v1', day bucket, round(activity, 2), lines, lmax)`. Change `test_pfss_cache.py` in its own commit.
- **Tests:**
  - `test_magnetogram_coregistration`: for the 10 strongest regions, Br at both footpoints has the expected sign and ≥ 3× the quiet-Sun rms.
  - `test_hale_polarity_reverses_by_hemisphere_and_cycle`
  - `test_magnetogram_evolves_smoothly`: correlation ≥ 0.9 between maps 1 day apart (today the map re-randomises every 0.01 d).

**4.3 (P4b) Faster tracing.**
- **Change:** vectorise the RK4 across all lines using the existing batch evaluator (`:532-603` inside `:649-740`), and vectorise the WSA loops (`:997-1021, :1071-1087`).
- **Tests:** `test_vectorized_trace_matches_scalar` (endpoints ≤ 1e-6 R☉) and perf-marked `test_pfss_high_cold_under_1s`. The 1 s target is (I), from the cProfile share of per-call overhead (*profile F3*).

**4.4 (P4b) PFSS off the request path.**
- **Change:**
  - One dedicated worker (a process, or a thread if 4.3 is fast enough), separate from `_heavy_compute_executor` (`server.py:277-302`). Single-flight per key. A cooperative cancel event checked between RK4 batches.
  - `pfss=cached` returns the nearest computed bucket with `epoch_jd` and `lag_days`.
  - The worker precomputes the next bucket in the direction of sim time, using a `sim_rate` hint from the client.
- **Tests:**
  - `test_cached_mode_returns_nearest_bucket_with_lag`
  - `test_pfss_worker_does_not_starve_porkchop` (porkchop returns 200 while solar misses are queued)
  - `test_cancelled_job_frees_worker` (change `test_compute_budget.py:47-49` on purpose)

**4.5 (P4b) Parker spiral.**
- **Change:**
  - The WSA lookup takes the magnetogram-frame longitude, not the inertial `arm_phase` (`solar_physics.py:945`, **N8**).
  - The spiral is emitted in HGC, in AU.
  - The frontend draws it at physical scale at both display scales (`sunVisuals.ts:1531-1533` uses R☉(AU), not the display radius), hides the part with r < R_disp, and puts it in the rotating frame.
- **Tests:** `test_parker_winding_angle_at_1au` (ψ = atan(Ωr/v) ± 1° per arm) and `parkerScale.test.ts` (a point at 215 R☉ is 1.000 ± 0.005 AU from the Sun at both scales).

**4.6 Ungate field lines and spiral.**
- **Change:** the gates flip only when `solver_version === 'pfss-2' && validated === true`.
- **Tests:** `field lines stay hidden for pfss-1 payloads`.
- **Phase 4 acceptance:**
  - The analytic suite passes.
  - Co-registration in the browser: ≥ 70% of closed PFSS footpoints are within 10° of a drawn spot group at activity ≥ 0.5 (calibrate on the first run).
  - The spiral crosses Earth's orbit radius within 1%.
  - The legend shows the field-line epoch lag.

### Phase 5: real observations, placed correctly and credited
**Branch:** `feat/solar-observations` · **Effort:** 5–7 d · Depends on P2 and P3 (5.8 also on P4a).

**5.1 Background refresher.**
- **Change:** `FastAPI(lifespan=…)` at `server.py:84-88`, running one refresher per process.
  - Schedules: RTSW every 60–300 s (gzip); AIA closest image every 5 min for the needed channels, downloading only when the image id changes; SILSO daily with `If-None-Match`; GONG only if D7 allows.
  - Per-source last-good value, `fetched_at` and maximum staleness.
  - Backoff ≥ 60 s, following NWS guidance.
  - An overall wall-clock deadline per fetch: urllib's timeout is per socket, and a 1 B/s drip held a fetch for 12 s (`slow_drip.json`).
  - Remove or authenticate `force_refresh` on public routes (`server.py:925-941`).
  - Off in tests unless enabled, because TestClient is used without `with`.
- **Tests:**
  - `test_serves_stale_within_max_age`
  - `test_marks_unavailable_after_max_age`
  - `test_upstream_calls_per_hour_bounded` (≤ 200/h, independent of request count)
  - `test_force_refresh_not_public`

**5.2 SWPC RTSW.**
- **Change:** a new parser at `solar_realtime_data.py:330-403`: newest-first rows, `active == true` only, field mapping, and the spacecraft name and row age recorded. Plasma and mag feeds are isolated from each other.
- **Tests:** on recorded fixtures (`$H1/upstream/upstream_raw/swpc_rtsw_*`, trimmed): `picks newest active row` (SOLAR1 6.85/cc, not ACE 0.17) and `plasma failure does not skip mag`.

**5.3 SILSO, now and in history.**
- **Change:** daily fetch with ETag. For past epochs (D2/D6), a versioned `backend/data/silso_monthly_smoothed.csv` artifact with source, licence and retrieval date.
- **Tests:** `historical epoch uses the archival SSN` (1989-12 smoothed SSN 206.2, Appendix A1) and `attribution fields present`.

**5.4 Full-disk AIA by image id.**
- **Change:**
  - Replace `getTile` (`solar_realtime_data.py:443-455`) with `downloadImage?id=&scale=8&type=png` (512 px full disk, about 129 KB, rsun about 199 px) (*upstream F10*).
  - Store images by id with their metadata.
  - The tile route (`server.py:935-988`) serves the requested `image_id` or returns 404.
  - Emit ISO-8601 Z dates. Today `Date.parse` makes freshness depend on the time zone (`solarObservationTexture.ts:66-72`).
- **Tests:** `test_aia_route_serves_requested_image_id`, `test_aia_dates_iso_utc`, and a frontend freshness test run under `TZ=America/Los_Angeles` and `Asia/Tokyo`.

**5.5 Projection instead of wrapping.**
- **Change:** in `sunVisuals.ts:279-309`, drop the equirectangular sampling. For a fragment with Sun-local normal n and observer direction e (Earth at image time, via `sunOrientation`): if n·e > 0.1, sample the disk orthographically at uv = c + r_uv × (n·ê_west, n·ê_north), with a limb fade; otherwise keep the procedural surface.
- Per D4, the EUV image and tint appear only in a user-picked channel.
- **Tests:**
  - `aiaProjection.test.ts`, a pure function: disk centre, limb and north pole at a given B0.
  - Playwright: a synthetic test image with a centre marker and a north marker, viewed from Earth at the image epoch. The centre marker lands within 2% R of the disk centre, and north within 2° of the projected pole.

**5.6 Coronal holes from AIA.**
- **Change:** in `solar_realtime_data.py:500-662`, take rsun from the metadata instead of `0.90 × half-width` (`:529`). Use orthographic inversion (asin) instead of the linear mapping at `:615`. Today a hole at 0.7 R is placed at 63° instead of 44° **(N5)**. Convert Stonyhurst to HGC with L0 at image time.
- **Tests:** a synthetic dark patch at a known (lat, lon) is recovered within 3°.

**5.7 Credits.**
- **Change:** the legend and footer show "Courtesy of NASA/SDO and the AIA, EVE, and HMI science teams", Helioviewer, "Source: WDC-SILSO, Royal Observatory of Belgium, Brussels (CC BY-NC 4.0)", NOAA SWPC, and the NSO/GONG line if GONG is used (*upstream F24*).
- **Tests:** e2e: the attribution is visible whenever an observed layer is visible.

**5.8 (optional, D7) GONG.**
- **Change:** list the day directories, resample from sine-latitude, check the row order, resolve the CR naming (the code computes 2315 where files say c2316, *upstream F8*). Only after 4.1.
- **Tests:** on a recorded FITS fixture: `decomposes to the expected dipole sign`.

### Phase 6: keep it true
**Branch:** `ci/solar-acceptance` · **Effort:** 2–3 d.

- The e2e acceptance runs in CI with the upstream shim in fixture, hang and offline modes.
- A scheduled daily live canary fails on upstream 404s or schema drift. It would have caught the SWPC outage 5 months earlier.
- A perf job runs on a quiet runner.
- README ops recipe: single process, the `--reload` caveat, the proxy recipe, CORS variables.
- The JSON Schema generates the frontend payload types, replacing the four hand-written interfaces (*tests F10*).

---

## 3. Sequencing and traps

```
P0 chip ─► P1 truthful fallback · gates · diagnostics · CI
             ├─► P2 delivery (proxy, core lane, cadence, provenance, M-8) ─┬─► P3 frames/scale → ungate spots, loops, holes, flares
             │                                                             │        │
             └─► P4a H-2 fix + region-built magnetogram (backend, parallel)┴─► P4b PFSS pipeline + spiral → ungate field lines, spiral
                                                                                    │
                                                           P3 + P2 ─────────────────┴─► P5 observations → ungate image, observed holes, RTSW
                                                                                               (5.8 GONG needs P4a)
             P6 (CI e2e, canary, ops) starts from the P1.6 harness and finishes last
```

**What must not be done:**

| # | Trap | Evidence |
|---|---|---|
| T1 | Shipping the transport fix without the layer gates. It renders H-2 lines, a 242 AU spiral, loops beyond Mars and spots at the poles. | *frontend F27–29*; *backend F26–27* |
| T2 | Raising the client timeout, `SOLAR_PHYSICS_CONCURRENT_REQUEST_LIMIT` or `HEAVY_COMPUTE_THREAD_LIMIT`. | GIL: 20.6–24 s per job with two in parallel vs 7 s alone (`p8_threads.log`); slots stay held (`slot_holding.log`, `p7_server_run3.log`) |
| T3 | Quantising jd alone, or bucketing with arithmetic different from the seed's. | Activity drift (`determinism.json`); `int(2461308.55·100)` gives …854 (*profile F15*) |
| T4 | Proxy key `/solar` without the slash. | `$H1/config/proxy-key-collision.txt` |
| T5 | `backendBaseUrl()` returning `''`. | `$H1/config/aia_url_check.txt` |
| T6 | Swapping the SWPC URL without a new parser. | Newest row comes from an inactive spacecraft (`swpc_rtsw_analysis.txt`) |
| T7 | Fixing GONG before H-2 and the grid resampling. | *backend hidden*; `pfss_magnetogram.py:337` |
| T8 | A full-disk image with the current equirectangular shader. | `sunVisuals.ts:282-285` |
| T9 | Mapping z-up to y-up by swapping y and z. That is a reflection (det −1): longitudes run backwards and "prograde" becomes retrograde. | Appendix A5 **(N)** |
| T10 | Inertial-longitude geometry under the spinning group, which rotates it twice. | `solar_physics.py:585` + `main.ts:723-734` (every spinGroup child without `lockBodySpin`) **(N2)** |
| T11 | Using `CARRINGTON_PERIOD_DAYS = 27.2753` (commented "sidereal") as a rotation rate. It is the synodic period; the sidereal rate is 25.38 d, so rotation would be 7% too slow. | `pfss_magnetogram.py:31` **(N9)** |
| T12 | Building UI "live" claims on `gong_synoptic.ok` or `live_data_enabled`. | `solar_realtime_data.py:809-823`; `server.py:415-417` |
| T13 | `--workers N` with per-process caches and refresher. | *config F21*, *upstream hidden* |
| T14 | Quietly "fixing" the pinned tests listed in C14. | Each needs its own commit with the reason. |
| T15 | Accepting latency measured on repeated identical jds, or on a loaded host. | Load average was 17–53 during the investigation (*config M*, *profile M*) |
| T16 | Checking CORS through Playwright `route.fulfill`: it adds ACAO itself, and Local Network Access blocks loopback calls. | *frontend hidden*, *tests hidden* |
| T17 | Treating "looks different with data" as "correct". | The A/B diff proves influence only; each layer needs its oracle. |

---

## 4. Owner decisions

| ID | Decision | Recommended default | What it changes | Needed by |
|---|---|---|---|---|
| D1 | How the magnetic map evolves | Build it from the model's active regions, evolving smoothly, cached per 1 sim-day. Today it re-randomises every 0.01 d. Alternative: per Carrington rotation (27 d). | Field lines connect to the spots, caches hit, no flicker at bucket boundaries (3.4 R☉ jumps and 20 topology flips today, *backend F18*). Changes the pinned `test_pfss_cache` identity tests. | P4a |
| D2 | Live-data window | ±1 day of wall-clock now for SWPC and AIA. Past dates use archived SILSO activity; archival AIA images (from 2010-05) only while paused. Future dates use the model, labelled "model projection". | Fixes M-8. Reduces upstream load. At 4 d/s nearly every request becomes synthetic (C10). | P1.4 / P2.5 |
| D3 | Corona and heliosphere at the enlarged default scale | The displayed Sun (0.3755 AU) is already about the size of Mercury's orbit (0.387 AU), so anything drawn above it overlaps Mercury. Compress coronal heights ×0.15 above the enlarged surface; draw the spiral at true AU distances and hide it inside the disk; the legend says "not to scale". Alternatives: hide these layers when enlarged, or draw at true scale. | Removes the 1.8 AU loops and the 242 AU spiral. | P3.4 / P4.5 |
| D4 | What "Auto" looks like | Auto = white light: no EUV tint and no EUV image. EUV appears only when the user picks a channel. Optionally rename Auto to "White light". | Keeps the familiar look when data arrives (*frontend F17*). | P3 |
| D5 | Behaviour while time runs fast | Above 1 d/s, field lines and spiral come from the nearest computed bucket, with the lag shown in the legend. Flares and CMEs become a capped time-lapse. Alternative: hide the slow layers while running. | Honest display at 4 d/s. | P3.6 / P4.4 |
| D6 | SILSO licence (CC BY-NC 4.0) | Fine if the app stays non-commercial, with attribution. If commercial use is possible, switch to NOAA's observed indices. (I) I believe those are public domain; check before relying on it. | Legal exposure; which data source is used. | P5.3 |
| D7 | GONG magnetograms | Label PFSS as "model magnetogram" now and remove the GONG fetch from the request path. Revisit after P4. | Honest provenance; saves 0.15–3.5 s per PFSS miss. | P2.2 |
| D8 | Model realism | Move loop heights (median 2.06 R☉ today) and the CME population (72 at once, 844–2,492 km/s, **N6**) toward observed statistics. (I) Commonly cited LASCO figures: about 0.5–6 CMEs per day and a typical speed of about 400–500 km/s; to be confirmed. Offer an optional "exaggerated" visual mode. | Plausibility tests; changes `test_cme_speed_distribution…`. | P3.6 |
| D9 | Same-origin proxy vs CORS allowlist | Same-origin: the Vite proxy in dev and preview, a reverse proxy in production. The allowlist stays as an additive fallback. | Removes the whole CORS failure class. | P2.1 |
| D10 | Single process vs workers | One uvicorn process plus one dedicated PFSS worker. No `--workers` until caches are shared. | Keeps caches and refresher coherent. | P2 / P4 |
| D11 | A real-time "Live" speed | Yes: add a 1× option; "Jump to now" pauses at now. | Without it, live observations are visible only while paused. | P5 |
| D12 | Accept a visible change to today's procedural Sun | Yes, with before/after screenshots in the PR. Poles move to the true axis; the pole direction changes by about 14°. | Visual continuity. | P3.2 |

---

## 5. Risks, effort, and the end-to-end acceptance test

### 5.1 Risks

| Risk | Mitigation |
|---|---|
| Frame fixes change the familiar look (D12). | Before/after screenshots at fixed `?date`. Owner sign-off per layer. |
| IAU W vs Carrington conventions, and the CR file-naming mismatch. | Oracle constants recorded with their sources (Appendix A6). Cross-check once against sunpy offline. |
| Vectorised PFSS drifts numerically. | Equivalence test at 1e-6 R☉ plus the analytic suite. |
| Helioviewer has undocumented rate limits (*upstream open questions*). | Refresher caps (≤ 200/h), caching by image id, contacting the Helioviewer team. |
| Visual thresholds calibrated under software GL. | Calibrate on the real-GPU recipe; pin the thresholds after the first green run. |
| One shared rate-limit identity behind the proxy. | Core-lane requests are cheap; rescope the limit per route; production recipe. |
| `--reload` restarts empty the caches. | Warm-up on lifespan start; PFSS precompute. |
| Scope creep from D8. | Plausibility bands as separate, owner-approved commits. |
| Phase 0 is not merged yet. | Merge first; every branch starts from the merged Phase 0. |
| 246 strict TypeScript errors elsewhere in the repo would hide new ones. | The scoped `tsconfig.solar.json` gate. |

### 5.2 Effort per phase

| Phase | Days |
|---|---|
| P1 | 1.5–2 |
| P2 | 3–4 |
| P3 | 4–5 |
| P4 | 4–6 |
| P5 | 5–7 |
| P6 | 2–3 |
| **Total** | **19.5–27 developer-days** |

The audit estimated H-1 at 1–2 days. That covered only "requests return 200". The owner's definition (driven by the model, correct, attributed) is larger.

### 5.3 End-to-end acceptance: the owner's definition of done

**Command:** `node scripts/e2e/solar-acceptance.mjs --origin dev,preview --upstream fixture,live,hang --scenarios now-paused,now-1x,4dps,1990-paused,2040-paused --minutes 10 --gpu real`

Output goes to `test-results/solar-dod/` as JSON plus screenshots. **All of the following must pass:**

**A. Delivery.**
- ≥ 95% of settled `/solar/physics` requests return 200.
- 0 CORS errors, 0 429s, ≤ 1 abort per scenario.
- Core-lane p95 < 500 ms at the browser.
- ≥ 1 AIA image loaded with 200 in `now-paused`, both origins.

**B. Visibly driven by the model.**
- For each ungated layer, `__solarDiagnostics()` reports `source ∈ {backend-model, observed}`, with a payload epoch within the D5 tolerance of the sim epoch.
- The A/B difference against a backend-blocked run at the same `?date&rate=0` is ≥ 10% of pixels in the Sun's box.

**C. Correct.** Every per-layer oracle passes in the browser:
- activity parity and M-8
- sunspot \|lat\| p95 ≤ 35°
- loop footpoints within 5° of spot groups
- inertial rotation 14.2 ± 0.6 °/day, not about 28
- loop and PFSS extents within the D3 policy
- limb contrast at solar minimum
- spiral crossing at 1 AU ± 1% and winding ± 1°
- field lines only with `pfss-2` and `validated: true`, co-registration ≥ 70%
- AIA disk centre within 2% R and north within 2°
- B0 and sub-Earth Carrington longitude oracles

**D. Honest.**
- The chip and legend list every visible layer with its source and epoch.
- Credits are visible whenever an observed layer is.
- `1990-paused` reads "archival SILSO activity / model", never "live".
- `2040-paused` reads "model projection".
- The legend states lags and compressions.

**E. Resilient.**
- `--upstream hang`: a degraded 200 within the client budget; the chip shows "observations unavailable".
- Backend stopped: chip error, procedural fallback with activity equal to the cycle model for the sim date, and no gated layer drawing stale backend geometry after 5 failures or a jump of more than 30 days.

---

## Appendix A: new checks made while writing this plan

**A1. Fallback / model cycle vs observed SILSO (N7).** I recomputed from `$H1/upstream/upstream_raw/silso_daily`, using 13-month smoothed monthly means and the shared formula at `solar_physics.py:522-528` (identical to `sunController.ts:86-94`).
- Monthly 1996–2026: Pearson r = 0.688, mean absolute difference 0.276 in activity units (SSN/220).
- Cycle 23: modelled peak 2003-06 vs observed 2001-11.
- Cycle 24: modelled peak 0.98 vs observed smoothed 116.4 (≈ 0.53).
- 1990-01: model 0.671 vs smoothed SSN 206.2.
- The model repeats one fixed-amplitude 11-year cycle, so it is good for Cycle 25 and wrong for history. That is the basis for D2 and D6.
- It agrees with the unlabelled `scratchpad/plan/cycle_hindcast.txt` (r = 0.692 on semi-annual samples).

**A2. Pole orientation (N4).** Converting the IAU pole (α 286.13°, δ 63.87°, obliquity 23.4393°) gives ecliptic longitude 345.77°, latitude 82.75°. `planets.ts:3-12` has a tilt of 7.25° and no pole longitude, so the pole points toward longitude 0.

**A3. Payload statistics (N6),** from `$H1/frontend/payload_high_180.json`:
- 72 CME features, extent 2.5–4.74 R☉, speeds 844 / 1,186 / 2,492 km/s (min / median / max).
- 79 loops, median extent 2.06 R☉ (max 2.46).
- 29 plumes.
- Backend active-region \|lat\| p95 is 30.8°.

**A4. Carrington-relative drift.** Snodgrass rates from the code minus 14.1844°/day: +0.53°/day at the equator, +0.36 at 15°, −0.18 at 30°, −2.27 at 60°. A payload 8 days old is therefore at most about 5° off at active latitudes. That is why HGC output combined with sparse polling is visually correct (C12).

**A5. Handedness.** (x, y, z) → (x, z, y) has determinant −1: a reflection. (x, y, z) → (x, z, −y) has determinant +1: a proper rotation. Under the proper mapping, Carrington longitude 90° goes to local −Z. Three.js rotation about +Y carries +X toward −Z, so prograde rotation maps longitude 0 toward longitude 90°, as it should.

**A6. CR 2316 start (oracle constant).** By Meeus: JD = 2398140.2270 + 27.2752316 × 2316 = 2461309.66 (2026-09-26, about 04 UTC). The code's `carrington_rotation_jd_range(2316)` gives 2461309.72. Use a ±1.5° tolerance to absorb Meeus's periodic terms.

**A7. Frame findings from reading the code.**
- **N1:** `synthetic_magnetogram(activity, jd)` takes no regions (`pfss_magnetogram.py:201-272`).
- **N2:** region longitudes advance from J2000 (`solar_physics.py:585`) while the loop group spins (`sunController.ts:355`, `main.ts:723-734`).
- **N3:** the shaders' `vWorldNormal.y` "latitude" (`sunVisuals.ts:38, 477, 490, 505`) against a z-up scene. This is (I) until the P3.2 screenshot oracle runs.
- **N5:** linear disk-to-latitude/longitude mapping (`solar_realtime_data.py:615`).
- **N8:** the spiral's WSA lookup uses an inertial phase (`solar_physics.py:945`).
- **N10:** the synthetic sunspot latitude depends on activity (`sunVisuals.ts:683`) instead of cycle phase.