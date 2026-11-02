# H-1 plan: architecture and performance first. Make the backend Sun model reach the screen correctly, honestly and fast

*Designer angle: architecture and performance first. Baseline: `main` = `bd48a7d`, plus Phase 0 (`fix/solar-data-status-notice`, commits `d637501..728d21c`, not merged). This is a read-only analysis. No code was changed and no servers were started.*

**Evidence keys.**
- `[BR-n]`, `[UP-n]`, `[CD-n]`, `[FC-n]`, `[TC-n]`, `[BP-n]` mean fact *n* in these sections of `scratchpad/h1/digest.md`: backend-route, realtime-upstream, config-deploy, frontend-consumers, tests-contracts and backend-profile. A suffix `m` means that section's Measurements list.
- `[AUD §x]` is `agent-notes/CODEBASE_AUDIT_2026-09-24.md`.
- `[CODE]` means I read the file at `bd48a7d` today.
- `[SPIKE, unverified]` means raw captures in `scratchpad/h1/spike/` from the investigator who died before reporting.
- **(F)** means measured or read in code. **(I)** means my inference or estimate; the acceptance check named next to it confirms or refutes it.
- Line numbers refer to `bd48a7d` unless stated otherwise.

---

## 1. For the product owner (plain language)

### What is wrong
Every 0.9 s the page asks the server: "what does the Sun look like at this simulated moment?"
- The server needs 5–10 s to answer. The audit measured 4.6–9.4 s on an idle host [AUD §5.1] and 8.2–10.3 s on a loaded one [BP-18].
- The page gives up after 2.6 s.
- The abandoned work keeps running and blocks the next questions [BP-19, BP-20].

So nothing ever arrives: 0 of 39 requests succeed in dev and 0 of 44 in preview [AUD §5.1].

About 99% of the server's time goes to one step: redrawing about 120 magnetic field lines and a solar-wind map from scratch [BR-18]. The remaining seconds are spent waiting on outside data services. One of them (NOAA) has been retired and another (GONG) is never reached successfully [UP-4, UP-7].

### Why "just make it faster" fails
The pieces are chained together. Suppose the server became fast tomorrow and nothing else changed:
1. The page would ask about 66 times a minute. The server allows 36, so within about 30 s the page would fail again with "too many requests" [TC-m, BR hidden problems].
2. The Sun on screen would become visibly wrong:
   - the solar-wind spiral drawn out to 242 AU, past Neptune;
   - coronal loops reaching beyond Mars;
   - sunspots near the poles;
   - field lines computed with a known maths error (H-2) [FC-27, FC-28, BR-27].
3. Every open tab would make the server contact NOAA, SILSO and Helioviewer 8–13 times per update. That includes about 3 GB/h of repeated sunspot downloads per tab [UP-27 (I)].
4. Today's "live" observations would be blended into 1995 or 2040 [FC-11].

### The design in one picture
Split the Sun model by how often each part changes and how much it costs:
- **Observations** (solar wind, sunspot number, SDO images) change every minute at the fastest and monthly at the slowest. A background job on the server collects each one on its own schedule. User requests only read memory.
- **The magnetic field model** is the expensive 99%, and it changes slowly. A separate worker process computes it in the background and keeps the results. Requests never wait for it: they get the newest field that is ready, labelled with its age.
- **The fast state** (activity level, loops, flares, sunspots, coronal holes, spiral shape) costs about 20–50 ms. It is computed on every request.
- One same-origin connection removes CORS failures. One honest label per visible layer tells the user where it comes from.

### What you will see, milestone by milestone

| Milestone | Phases | What you will see | Cumulative effort (engineer-days) |
|---|---|---|---|
| M0 | P0 (done, being verified) | A "Sun:" chip that says why the Sun is procedural | 0 |
| M1 | P1, P2, P3 | Still procedural. Failures are readable in dev and preview, the field maths is fixed, and the renderer is proven correct on recorded data | 4–6 |
| M2 | + P4, P5, P7 | **First time:** the Sun on screen is driven by the backend (loops, sunspots, holes, activity, spiral, field lines), updates every ~2 s, and each layer is labelled | 9–13 |
| M3 | + P6, P8 | 5–8× less traffic, and field lines keep up with the sim clock | 13–18 |
| M4 | + P9, P10 | A real SDO image placed correctly on the Earth-facing side, live solar wind again, and CI guarding all of it | 17–24 |

For scale: the audit's 1–2 d estimate [AUD §5.1] covers only "requests return 200". Your definition of done (visibly driven, correct, attributed) is roughly a 3–4 week effort.

### Decisions I need from you
There are 12 decisions (§6). Four of them shape the architecture:
- **D1:** re-seed the synthetic magnetic field once per solar rotation instead of every 14.4 simulated minutes (recommended).
- **D2:** blend live observations only within 1 day of "now" (recommended).
- **D3:** draw interplanetary structures at true distances (recommended).
- **D5:** show the SDO image as a correctly projected hemisphere (recommended target). Keep it hidden until then.

---

## 2. The system as interconnected parts

### 2.1 The chain

```
sim clock (4 d/s default) → client cadence/epoch → client patience (2.6 s) → transport/CORS
  → admission (rate limit 36/min → 2-slot guard → shared 2-thread executor)
  → compute [upstream snapshot I/O 2.7–5.1 s] + [fast state ~20–50 ms] + [PFSS+WSA 3.7–7.2 s]
  → caches (exact-jd keys) → response (640 KB, untyped, partly false provenance)
  → frontend consumers (scale, frame, lifetime, fallback bugs) → status chip (Phase 0)
  ↳ side systems: upstream services, H-2 solver, tests/CI, ops/deploy
```

### 2.2 Parts, their state, and their coupling

| # | Part | Current state (evidence) | What breaks | Depends on → constrains |
|---|---|---|---|---|
| 1 | Client cadence and epoch | Polls 900 ms after success and 6 s after error. Sends `jd.toFixed(8)` of a clock at 4 d/s, ±120 d/s on the slider. Always `hybrid` + `live_data=true` (`sunController.ts:152-160`, `solarPhysicsClient.ts:119`) [FC-5, FC-7, FC-10] | Every poll is a new epoch, so caches never hit. About 66 requests/min when the server is fast | Depends on the sim clock. Constrains caching (6), the rate limit (4) and the live-data policy (7) |
| 2 | Client patience | Aborts after 2.6 s. Phase 0 now classifies why [CODE, Phase 0 diff] | Aborts free nothing on the server [BR-4] | Depends on compute (5). Constrains orphan load (4) |
| 3 | Transport/CORS | `backendBaseUrl()` = page host + `:8042` hard-coded in 4 places (`main.ts:188-195`). Allowlist has only `:3000` and `:5173`. The env var replaces the list instead of extending it. A 500 carries no ACAO header; `Retry-After` is not exposed [CD-1, CD-4, CD-11] | Preview is always blocked. Real errors look like CORS errors | A same-origin proxy constrains identity: everyone looks like 127.0.0.1 [CD-17] |
| 4 | Admission/guards | Rate limit (counted before validation, and 503s count) → `BoundedSemaphore(2)` → `_heavy_compute_executor(2)`, shared with porkchop and mission (`server.py:277-302, 991-1066`). A slot is freed only when the worker finishes [BR-1…5] | Orphans hold the slots for 22–29 s [BP-19, BP-20], starving porkchop [BR-5] | Depends on compute time. Raising the limits makes things worse (GIL) [BP-21] |
| 5 | Compute | PFSS trace (scalar Python per point, `pfss_magnetogram.py:649-740`) plus the WSA map (`:840-1037`) are 97–99.6% of the work. Everything else is about 20–50 ms [BR-18, BP-2, BP-7] | Can never fit 2.6 s | Depends on H-2 (11) for correctness. Constrains everything above |
| 6 | Caching/reuse | `PFSSCache(max_entries=3)` keyed on exact jd, exact activity and `gong_timeout` (`:1107, :1165-1173`). Snapshot cache keyed on the exact jd (`solar_realtime_data.py:131`). No response cache [BR-23] | 0% hit rate while the sim runs. Activity drifts with the wall clock (`solar_physics.py:391-395`), so even identical requests miss [BR-14, BP-5] | Depends on 1, 7 and the seed policy (D1). The RNG seed changes every 0.01 d (`pfss_magnetogram.py:238`, `solar_physics.py:857`) |
| 7 | Upstream data | 13 serial calls per miss (3.8 MB). SWPC returns 404 since about 2026-04-30. GONG is never found. SILSO downloads 2.9 MB per miss. The AIA "tile" is a 3%-of-disk crop. All-failed snapshots are cached as success. No stale-on-error. Timeouts are per socket, so a slow drip takes 12 s [UP-4…19, BP-4] | Hangs take 21–46 s [BP-11]. Provenance lies (`gong ok:true`) [UP-9] | Depends on the live-window policy (D2). Constrains activity determinism (6) and licensing (D7) |
| 8 | Response contract and provenance | Plain dict, `schema v1` never read. Four drifting TypeScript copies. 636 KB raw with no gzip. JSON encoded on the event loop (25–43 ms) [TC-10, TC-11, BP-17, BP-23] | Wrong or missing labels; bandwidth; `/health` latency rises to 40–214 ms [BP-23] | Constrains the status chip (10). Phase 0 reads `data_assimilation.mode/applied/blend_weight` |
| 9 | Frontend consumers | The following code paths have never run with backend data [FC-2, FC-3, FC-17, FC-22, FC-23, FC-27, FC-28, FC-29]: z-up vs y-up mix-up; loops (spinning) and PFSS (non-spinning) in different frames; Parker spiral ×81 scale (242 AU); flares expire on their first frame; fallback activity is 0 (`Number(null)`); Auto channel switches to a 193 Å tint; AIA crop wrapped as a globe; field lines rebuilt on every poll; state never expires | The Sun looks wrong the moment data flows | Depends on the contract frame (8) and H-2 (11) |
| 10 | Status/honesty | Phase 0 chip (connecting / backend / stale / error with reason). The header badge "Live simulation" is static [FC-19] | Blind to per-layer provenance and field lag | Depends on the contract (8). Its `/health` probe depends on H-3 [AUD §5.1 H-3] |
| 11 | Correctness gates | H-2: three copies of a wrong Legendre recurrence (`:281-313`, `_legendre_at_point`, `_legendre_batch` ~`:605-640`) [CODE, AUD §7.12] | Unblocking H-1 renders wrong field lines and wrong wind winding [BR-26] | Blocks showing PFSS and the WSA spiral (5, 9) |
| 12 | Tests/CI | No CI. Backend tests use the cheap synthetic path. `test_compute_budget.py:20-50` and `test_snapshot_cache_isolated_by_requested_julian_date` pin today's behaviour. 246 strict TypeScript errors. `requirements.txt` lacks httpx [TC-3, TC-6, TC-11, TC-18, TC-19] | Regressions go unseen (SWPC was dead for 5 months [UP-26]) | Constrains every phase's acceptance |
| 13 | Ops/deploy | `--reload`, a single process, no lifespan hook, all state in process memory, no `vite.config`, XFF trusted [CD-3, CD-17, CD-20, CD-21] | A background refresher or worker is a new feature. `--workers N` multiplies upstream load [UP hidden] | Constrains the refresher (7) and the worker (5) design |

### 2.3 Couplings (if you change X, Y happens)

- **C1 Faster server → rate limit.** A fast server leads to ~66 requests/min against a 36/min limit, so 429s start within about 30 s [TC-m]. `[SPIKE, unverified]`: 72 cache hits then 3 × 429 (`capture_step4rate`). Two tabs share one identity.
- **C2 Unblocking → visible bugs.** Unblocking makes H-2 and every display bug in row 9 visible at once [FC hidden problems].
- **C3 Sim rate → caches.** At 4 d/s the clock crosses 400 PFSS seed buckets every wall-clock second. No bucket cache can keep up unless the seed policy changes (D1) or the field is served out of date with a label [BP-14, BP hidden problems].
- **C4 Activity drift → cache keys.** Quantising jd alone gives no PFSS hits under live data, because activity drifts with `datetime.now()` [BR-14, BP-5]. Fixing determinism means changing how the observation snapshot feeds `_freshness_weight`.
- **C5 Client/server budgets → orphans.** A client timeout shorter than the server budget creates orphans, which cause 503s for all users, including porkchop and mission [BR-5]. Raising the concurrency limit makes each job about 3× slower [BP-21].
- **C6 Same-origin proxy → identity.** With a same-origin proxy every user arrives as 127.0.0.1, sharing one rate-limit bucket, and client-supplied XFF can be spoofed [CD-16, CD-17]. Identity has to be fixed in the same phase.
- **C7 Lifespan hook → tests.** A lifespan-started refresher does not run under the module-level `TestClient` [CD-22]. Tests must inject snapshots explicitly.
- **C8 Live window × clock speed.** With a live-data window of about 1 d and a 4 d/s clock, live observations apply only when the sim is paused near "now". This is a product question (D2b).
- **C9 Spiral depends on the served field.** Splitting the field out means the Parker spiral (which uses WSA) must use the same field that is served. The dead fallback at `solar_physics.py:910` (`has_wsa` is always true) must work again for cold starts [BR-19].
- **C10 Per-rotation seeding → frame contract.** Per-rotation seeding (D1) needs a co-rotating (Carrington-style) frame contract. The same contract fixes the loops-vs-PFSS frame split and the likely double rotation [FC-29].
- **C11 GONG → H-2 first.** Fixing GONG gives observed input, which requires H-2 first, plus sine-latitude resampling [BR hidden, UP hidden].
- **C12 Full-disk AIA → three changes.** A full-disk AIA image needs a shader change, the metadata radius for the coronal-hole detector (`solar_realtime_data.py:526-529`), and a tile route that serves by `image_id` [UP-10…15].
- **C13 Pre-serialised bytes → no mutation.** Serving pre-serialised bytes removes the shared-mutable-dict hazard at `solar_physics.py:1124` [BR-21].
- **C14 More workers → more load.** `--workers N` means N× upstream fetches and N× field computes, unless there is a disk cache and a leader.
- **C15 Contract v2 → Phase 0 fields.** Contract v2 must keep `data_assimilation.{mode,applied,blend_weight,live_data_available}`, or update `solarDataStatus.ts` in the same commit.
- **C16 Duplicate backoff gate.** Phase 0 kept the 6 s backoff, and `sunController.ts:531` re-imposes its own gate. `Retry-After` and exponential backoff stay ineffective until that duplicate gate is removed [TC hidden].
- **C17 Proxy → Phase 0 classifier (I).** Behind a same-origin proxy, a dead backend shows up as an HTTP error status from the proxy, not a `TypeError`. Phase 0 would then say "http 50x" instead of "unreachable", so its classifier needs a proxy-aware rule.
- **C18 H-3 → reachability probe.** Phase 0's `/health` probe has a 2 s budget. H-3 load pushes `/health` to 17 s [AUD H-3], which gives false "unreachable" reports until `/health` is made async.

---

## 3. Target architecture

### 3.1 Principle: separate by rate of change and by cost

| Layer | Changes on | Cost | Computed | Cache identity |
|---|---|---|---|---|
| Observations | SWPC 1 min; AIA 11–16 min; GONG ~1 h; SILSO monthly [UP-22] | 0.1–1.4 s per fetch [BP-4] | Background refresher, per source | Wall clock, per source |
| Field (PFSS + WSA) | Seed bucket 0.01 d today; per Carrington rotation under D1 [BR-18] | 3.7–7.2 s today [BR-18, BP-2]; ≤0.5 s target after P8 (I) | Worker process, never on the request path | `FieldKey` (§3.2) |
| Fast state | Features: Jaccard 0.989 at +1 min, 0.765 at +1 h [BP-14] | ~20–30 ms compute + serialisation [BP-2] | Request path, own small thread pool | (jd snapped to 0.001 d, params, `obs_snapshot_id`, `field_id`) |
| Render | Every frame | 0.94 ms p50 per frame [FC-25] | Browser | — |

### 3.2 Field service (PFSS + WSA)
- **Key.** `FieldKey = (solver_version, magnetogram_id, seed_bucket, activity_q, n_lines, lmax)`.
  - `seed_bucket` comes from the same function the RNG uses (today `int(jd*100) % 99991`; the CR number under D1). This avoids the float-boundary trap [BP-15].
  - `activity_q = round(activity, 2)`. Activity comes from the deterministic, snapshot-frozen blend (§3.3).
  - `gong_timeout` is removed from the key. `max_features` is not in it [BR fix_implications].
- **Worker.** A `ProcessPoolExecutor(max_workers=1)` with the spawn context, started in a FastAPI lifespan hook. Its entry point `sim/field_worker.py` imports only `pfss_magnetogram`.
  - Why a process: the fast path and other endpoints then never share the GIL with the tracer. Two threads took 20.6–24.0 s each versus 6.97 s alone [BP-21]; `/health` rose to 40–214 ms during solar jobs [BP-23].
  - The mode is configurable (`process | thread | off`) for tests and fallback.
- **Queue.** Latest wins, depth 1 per fidelity. A pending key is replaced by a newer wanted key. Running work always finishes and its result is stored. With coarse keys, finished work is almost always reused, so a solar field job needs no cancellation.
- **Store.** A `FieldStore` LRU bounded by bytes (default 64 MB). Each entry holds pre-serialised public JSON (raw + gzip), the WSA arrays needed by the spiral, and metadata (source, CR, solver version, `validated`, `computed_at`, `compute_ms`, key epoch).
  - Size: about 1.23 MB of Python heap per entry today [BR-m], or about 0.2–0.3 MB as bytes plus arrays [BR fix_implications].
  - An optional disk mirror (`backend/.cache/solar_fields/<solver_version>/`, gitignored) keeps the cache warm across `--reload`. Synthetic entries are pure functions of their key, so they never go stale.
- **Serving.** `nearest(key)` returns the wanted key if it is ready. Otherwise it returns the stored entry with the same (source, lines, lmax) and the smallest |epoch difference|, with `lag_days`. If nothing is stored it returns `null` + `computing`, and the spiral falls back to the coronal-hole proxy.
- **Precompute.** At startup, enqueue the key for "now". While the sim runs, enqueue `key(jd + jd_rate × expected_compute_s)` when the client sends a `jd_rate` hint.
- **Duty cap.** `SOLAR_FIELD_WORKER_MAX_DUTY` (default 0.5) stops the worker from occupying a whole core while the sim fast-forwards under 0.01-d seeding.

### 3.3 Observation store (background refresher)
- One daemon thread started in the lifespan hook. It is off when `SOLAR_OBSERVATION_REFRESH=off`, which `conftest.py` sets.
- It reuses the existing fetchers in `SolarRealtimeDataProvider` (`solar_realtime_data.py:358-432, 697-717`). Each fetch runs under an **overall** deadline (`future.result(timeout)` on a 1–2-thread I/O pool), because the urllib timeout applies per socket [UP-19].
- **Per-source state:** `{value, observed_at_utc, fetched_at_utc, status: ok | stale | failed | disabled, error, consecutive_failures, next_due}`.
- **Schedules:**
  - SWPC: 60–300 s.
  - AIA: `getClosestImage` for each channel every 5 min; download only when the image id changes.
  - SILSO: every 24 h with `If-None-Match` (304 most days [UP-23]).
  - GONG: disabled until D9.
- **Backoff:** at least 60 s (NWS guidance [UP-24]), then exponential.
- **Maximum staleness:** SWPC 30 min, AIA 3 h, SILSO 45 d [UP fix_implications]. Past that, a source is `failed`. An all-failed refresh is never cached as a success.
- **Server-wide traffic:** about 110–200 calls/h regardless of user count [UP summary] (I).
- **Determinism:** each composed snapshot carries `snapshot_id` and `composed_at_utc`. `_freshness_weight` (`solar_physics.py:391-395`) takes `now_utc = composed_at_utc` instead of `datetime.now()`. Identical (jd, snapshot) then gives byte-identical state and a stable PFSS key (fixes [BR-14]).
- **Epoch gate:** live observations apply only when |jd − now| ≤ `SOLAR_LIVE_WINDOW_DAYS` (D2, default 1.0). Otherwise `effective_forcing = synthetic` with `gated_reason = "epoch_far_from_now"`.

### 3.4 Fast path and admission
Order of operations for `/solar/physics`:
1. API key.
2. Rate limit. Default raised to 120/min: at ~50 ms a request that is about 10% of one core (I).
3. Validation.
4. **Response-cache lookup in the event loop.** Hits and 304s never touch a guard.
5. Fast compute on a dedicated `_solar_fast_executor` (2 threads, own semaphore of 4, 2 s budget).

Solar work leaves `_heavy_compute_executor` entirely, which removes the porkchop and mission starvation [BR-5] as a side effect. `_run_owned_thread`'s "hold the permit until worker exit" rule stays as it is for the other endpoints. It is a correct safety property, and `test_compute_budget.py:20-50` pins it.

### 3.5 Response contract v2
- `schema: {name, version: 2}`.
- `coordinate_frame: {name: "model_carrington", rotation_period_days: 25.38, zero_at_jd: 2451545.0, up: "z", units: "solar_radii"}`.
- `provenance`:
  - `generated_at_utc`, `compute_ms`;
  - `cache: {hit, age_s}`;
  - `forcing: {requested, effective, gated_reason}`;
  - `observations: {snapshot_id, composed_at_utc, sources: {…: {status, observed_at_utc, age_s, error}}}`;
  - `field: {field_id, status: current | nearest | computing | unavailable, key_epoch_jd, lag_days, source, solver_version, validated}`;
  - `layers: {activity, features, sunspots, coronal_holes, parker_spiral, field_lines, aia_image}`, each with its source and inputs.
- The field is sent by reference: `field_ref: {id, url: "/solar/field/{id}"}`. That URL is immutable (`Cache-Control: immutable`, ETag = id). `include_field=inline` stays available for tests and old clients.
- Encoding: floats rounded to 4 dp, gzip, pre-serialised bytes and an ETag.
- Schema file: `backend/sim/schemas/solar_physics_state.v2.json`. It is mirrored by a single TypeScript module that replaces the four partial interfaces [TC-10].

### 3.6 Transport
- Same-origin is the default: a new `vite.config.ts` with `server.proxy`, which preview inherits in Vite 7 [CD-12, CD-13].
  - Keys must be anchored (`/solar/`, `/health`), never bare `/solar` [CD-15].
  - Target: `http://127.0.0.1:${BACKEND_PORT ?? 8042}`.
  - Strip client-supplied XFF on the way through.
- `backendBaseUrl()` becomes `window.location.origin`, never `''` [CD-14]. `?backend=` works only in dev builds. `VITE_BACKEND_URL` is the split-hosting escape hatch.
- The CORS allowlist becomes a safety net: add `:4173`, add an additive `SOLAR_CORS_EXTRA_ORIGINS`, expose `Retry-After`/`ETag`/`X-Solar-*`, and add route-level 500 handling so errors carry ACAO.

### 3.7 Client poller v2
All knobs live in one policy module:

| Setting | Value |
|---|---|
| Poll interval, sim running | 2 s |
| Poll interval, sim paused | 60 s, with `If-None-Match` |
| Hidden tab | no polling |
| Timeout | 8 s |
| Backoff | exponential with jitter, 2 s → 60 s, honouring `Retry-After` |
| Request rate | ≤30/min |
| jd snap | 0.001 d |
| Live window | 1 d |

Behaviour:
- Schedule the next request from completion, with one request in flight. A force request (Jump to now) pre-empts an in-flight one.
- Fetch the field only when `field_ref.id` changes. Rebuild field lines only then.
- Clear state on large jumps. Show state as "for <date>" when it lags.

### 3.8 Renderer
- **Frame adapter** (`solarFrames.ts`): convert backend z-up to scene y-up with `(x, y, z) → (x, z, −y)`. Every data layer is a child of the Sun's spinning frame.
- **Scale policy (D3):**
  - Coronal layers (≤2.5 R☉) scale with the displayed Sun, with the radius compressed at inflated scale.
  - Heliospheric layers (spiral, CME fronts beyond the source surface) use true AU and are clipped at the displayed surface.
- **Layer gates** (`solarLayerGates.ts`): each layer draws backend data only when its gate has passed. For example, field lines require `solver_version ≥ 2 && validated`; the AIA image requires disk projection.
- **Legend:** the Phase 0 chip expands into a per-layer legend built from `provenance.layers`.

### 3.9 Budgets (targets, verified per phase)
- `/solar/physics` on an idle host: p50 ≤100 ms, p95 ≤250 ms.
- Cache hit or 304: ≤10 ms.
- Fast payload: ≤120 KB gzip.
- `/health` p99 <50 ms under solar load.
- 0 outbound calls on the request path.
- Upstream calls independent of the number of tabs.
- Field compute (high fidelity): ≤0.5 s after P8.
- Browser per-frame solar JS: ≤2.5 ms p95. It is 2.39 ms today [FC-25].

---

## 4. Phased implementation plan

Every phase has its own branch cut from the current `main` (use a worktree, since `main` moves), makes small commits that each pair one change with its test, and can ship on its own.

### Expected numbers after each phase

| After | `/solar/physics` p50 | Success at default client | Outbound calls per request / server-wide | Response bytes |
|---|---|---|---|---|
| Baseline | 4.6–9.4 s idle [AUD], 8.2–10.3 s loaded [BP-18] | 0/39 dev, 0/44 preview [AUD] | 10–13 calls, 3.3–3.8 MB per request [BP-4, BP-6] | 636 KB raw, no gzip [BP-17] |
| P1 | Unchanged | ~0%, but failures become readable timeouts, not CORS errors | Unchanged | Unchanged |
| P4 | PFSS only: 3.7–7.2 s [BR-18, BP-2] | ~0% at 2.6 s | **0 per request**; ~110–200/h total (I) | Unchanged |
| P5 | **50–100 ms** (I: 20–30 ms compute + 25–43 ms encode [BP-2, BP-23]) | ≥95% once P7 ships | 0 | ~636 KB (field still inline) |
| P6 | 20–60 ms; hits ≤10 ms (I) | ≥99% | 0 | **≈80–100 KB gzip** fast state (I: 4-dp rounding measured 636→121 KB gzip [BP-17], minus the PFSS share of ~21% and unread fields at 11% [FC-26]); field 25–40 KB gzip once per id (I) |
| P7 | — | 0 × 429; ≤30 requests/min per tab running, ≈1/min paused, 0 hidden | — | ~2.5–3 MB/min per tab running, versus 43 MB/min if today's client worked [FC-26] (I) |
| P8 | — | — | — | Field compute 3.7–7.2 s → ≤0.5 s (I, gated) |

**Worker CPU while the sim runs at 4 d/s (I):**
- 0.01-d seeding: a wanted key always exists, so the worker is capped at the duty limit (50% of one core) and the field lags by about one compute time.
- Per-CR seeding (D1): one key per ~6.8 s of wall time. That is about 75% of a core at 5 s per compute (P5), falling to about 7% after P8.

---

**P0 (done): Sun status chip.** Branch `fix/solar-data-status-notice`. Merge after the current browser verification. Two follow-ups, both small:
- (a) C17: classify an HTTP 502/504 (or other 5xx) that has no JSON `detail` as `unreachable` when the base URL is same-origin.
- (b) C18: keep the no-cors `/health` probe, but put an 800 ms `/health` p99 check into P1's acceptance.

---

**P1: Same-origin transport and readable failures.** Branch `fix/solar-same-origin-transport` · 0.5–1 d · no dependencies.

Why: remove the CORS failure class and make every failure readable, before any latency work changes the failure mix.

Commits:
1. `vite.config.ts` (new): `server.proxy` with keys `'/solar/'` and `'/health'`, target `http://127.0.0.1:${process.env.BACKEND_PORT ?? 8042}`, and `configure` that removes the inbound `x-forwarded-for`. Pass `BACKEND_PORT` from `scripts/dev-full.mjs:52-56,128-144`.
2. `src/frontend/app/runtimeConfig.ts` (new): `backendBaseUrl()` = dev-only `?backend=`, else `VITE_BACKEND_URL`, else `window.location.origin`. Replace `main.ts:188-195`, `trajectory/index.ts:8-9,70-74` and `simulationClient.ts:113,129`.
3. `server.py:101-119`:
   - add `http://localhost:4173` and `http://127.0.0.1:4173`;
   - add `SOLAR_CORS_EXTRA_ORIGINS` (additive);
   - warn loudly on `'*'`;
   - `expose_headers=["Retry-After","ETag","X-Solar-AIA-Image-Id","X-Solar-AIA-Image-Date","X-Solar-AIA-Channel","X-Solar-Error-Code"]`;
   - `allow_credentials=False`, since the client never sends credentials [CD fix].
   - Decouple `WS_SIM_ALLOWED_ORIGINS` (`:151-153`) from the HTTP list.
4. `server.py:1062-1066`: the timeout 503 gets `Retry-After: 2` and `X-Solar-Error-Code: compute_timeout`. The saturated 503 gets `saturated` and the 429 gets `rate_limited`. Phase 0's `classifyHttpFailure` prefers the header over its `/timed out/` regex.
5. `server.py:1049-1066`: wrap the builder so that a non-timeout exception raises `HTTPException(500, …)`. It then goes through ExceptionMiddleware, which is inside CORS, so it carries ACAO [BR-6, CD-11].
6. `server.py:323-330` `_client_identity`: use `request.client.host`, which uvicorn already rewrites for trusted proxies. Document `--forwarded-allow-ips` [CD-17, AUD M-6].

Tests:
- Backend `tests/test_solar_transport_contract.py`:
  - `test_dev_and_preview_origins_get_acao[localhost|127.0.0.1 × 5173|4173]`
  - `test_foreign_origin_gets_no_acao`
  - `test_retry_after_and_error_code_exposed`
  - `test_builder_exception_is_json_500_with_acao`
  - `test_ws_origins_not_widened_by_http_extras`
  - `test_identity_ignores_client_supplied_xff`
- Frontend `runtimeConfig.test.ts`: `defaults to same origin`, `never returns empty base`, `override is dev-only`, `AIA proxy URL is non-null for same-origin base`.

Acceptance:
- `npm run dev` and `npm run build && npm run preview`, with the backend on 8042 (no `--reload`), run through `scripts/e2e/solar-acceptance.mjs --minutes 2` (evolved from `pw/h1-tests-acceptance.mjs`, run against real servers rather than interception [TC hidden]).
- Pass: **0 CORS console errors on both origins**, the chip shows `timeout` or `server-timeout` (not `blocked`), `curl -H 'Origin: http://localhost:4173' -i …/solar/physics?fidelity=preview` shows ACAO, and `/health` p99 <800 ms.

---

**P2: H-2 correctness gate.** Branch `fix/pfss-legendre-h2` · 0.5–1 d · no dependencies. Must land before P5 serves any field.

Commits:
1. `pfss_magnetogram.py`: one `schmidt_legendre(lmax, x) -> (P, dP)` array routine using the Schmidt semi-normalised recurrence. It replaces all three copies: `_associated_legendre` (`:281-313`), `PFSSField._legendre_at_point`, and `_legendre_batch` [CODE]. Check that the quadrature normalisation in `decompose_spherical_harmonics` matches.
2. Add `PFSS_SOLVER_VERSION = "pfss-2"`. Emit it in the field output and include it in the cache key.
3. Update `tests/test_solar_physics_model.py:186-271` expectations deliberately. Open/closed counts and WSA will change.

Tests (`tests/test_pfss_analytic.py`, adapted from `agent-notes/CODEBASE_AUDIT_2026-09-24_EVIDENCE/scripts/pfss_check.py`):
- `test_legendre_matches_closed_form_at_sample_points` (P₂(0.5) = −0.125, P₃ = −0.4375, P₄ = −0.2891)
- `test_legendre_orthogonality_diagonal_1e10`
- `test_pure_dipole_round_trip_has_no_l3` (g₃₀ within 1e-6)
- `test_quadrupole_round_trip`
- `test_source_surface_ratio` (0.09302 for ℓ = 1, 0.04238 for ℓ = 2)
- `test_scalar_batch_and_decomposition_legendre_agree`

Acceptance: `cd backend && python -m pytest tests/test_pfss_analytic.py -q` is green, and `pfss_check.py` prints the exact values from [AUD §7.12]. `trace_field_lines` wall time must stay within ±15% of baseline over a median of 3 (I).

---

**P3: Renderer correctness and frame contract (fixture-driven).** Branch `fix/solar-render-correctness` · 2–3 d · no dependencies.

Why: the renderer must be right before data flows (C2). Everything here is tested against recorded payloads (`scratchpad/h1/frontend/payload_high_180*.json`, to be copied into `src/frontend/features/solar/__fixtures__/`) and the injection harness (`pw/h1-frontend-inject.mjs`).

Commits:
1. **Backend frame (F: the frames are inconsistent today).**
   - Features use `lon = seed + Snodgrass(lat)·(jd − J2000)` (`solar_physics.py:585`).
   - The spiral uses a rigid `(jd − J2000)/25.38` phase (`:896`).
   - PFSS lives in its own static map frame.
   - Change: emit features in the co-rotating frame by subtracting `2π(jd − J2000)/25.38`, which leaves only the differential residual. Set the spiral's co-rotating phase to 0. Declare `coordinate_frame`. The frontend Sun spins at 609.12 h = 25.38 d (`data/planets.ts:11`) [CODE], so the frames match (I).
   - Also audit the synthetic hole longitudes (`:826-882`).
2. `solarFrames.ts` (new): the z-up → y-up adapter, applied at ingest in `solarFeatureBlending.ts` (normalize), `solarMagnetics.ts:296-384`, the Parker update in `sunVisuals.ts:1475-1561`, sunspot seeds (`sunVisuals.ts:630-640`) and flare origins (`solarFlares.ts:41-47`).
3. Parent the PFSS group (`sunController.ts:250` `sunVisualNode.add`) and the spiral group to the spinning child, with `userData.rotationPeriodHours`, like the loops (`:324, :330`).
4. **Scale policy (D3 default):**
   - Parker spiral at `sunVisuals.ts:1531-1533`: use physical `R☉ = 0.00465 AU` and clip points with r < 1.05 × display radius.
   - Loops at `:1419-1421` and PFSS at `solarMagnetics.ts:249-251`: radially compress at inflated scale so the 2.5 R☉ source surface maps to ≤1.6 display radii; identity at realistic scale.
5. `solarFlares.ts:225-228`: `cmeMaxDistanceAu = max(0.3, sunRadiusAu × 8)` so the lifetime is positive at every scale [FC-3].
6. `sunController.ts:404-410`: treat `activityIndex == null` as missing, so the fallback is the Hathaway model and not 0 [FC-2].
7. Auto channel (D4 default): keep the white-light corona (`channelMode 0`) unless the user picks a channel (`sunController.ts:411-437`, `solarObservationTexture.ts:207-224`).
8. `solarLayerGates.ts` (new):
   - field lines and WSA-derived spiral winding are gated on `solver_version ≥ pfss-2 && validated`;
   - the AIA globe texture is gated off (observation blend = 0) until P9;
   - `?solarLayers=` override for dev.
9. `buildMagneticFieldSignature` (`sunController.ts:194-206`): use `field_id` (or source:cr:count:solver) only, with no brightness [FC-22].
10. Legend: extend the Phase 0 chip with a `<details>` per-layer list driven by gates and payload provenance (v1 fields for now).

Tests:
- Vitest:
  - `solarFrames.test.ts`: `backend active-region latitudes survive ingest` (fixture p95 |lat| ≤35°; today it is 72° [FC-28]); `feature at fixed co-rotating longitude is stationary on the rendered surface over 10 sim-days`.
  - `solarScale.test.ts`: `parker max radius ≤ 3.1 AU at default scale` (242 AU today); `loops ≤ 2 display radii at inflated scale`.
  - `solarFlares.test.ts`: `CME lives > 0 frames at default and realistic scale`.
  - `sunController.test.ts`: `fallback activity equals Hathaway model when no backend state` (0.754 for 2026-09-24 [FC-m]); `field lines rebuild only on field id change`; `Auto keeps white-light corona`.
  - `solarLayerGates.test.ts`: `unvalidated PFSS is not drawn`.
- Backend: `test_features_emitted_in_corotating_frame`.

Acceptance: `npx vitest run src/frontend/features/solar` is green. `node pw/h1-frontend-inject.mjs` with the fixture shows parker `maxRadiusAU` ≤3.1, sunspot seed |lat| ≤0.62 rad, flares with live children, and a default-look screenshot diff against `today_t14_default.png` below the threshold outside the Sun disk.

---

**P4: Observation store.** Branch `feat/solar-observation-store` · 2–3 d · after P0.

Commits:
1. `sim/solar_observation_store.py` (new): `SourceState`, `ObservationStore.current()/refresh_due()/inject_for_tests()`, the schedule and staleness table, and an overall-deadline wrapper.
2. `solar_physics.py:391-395, 483-520`: pass `now_utc` into the freshness and forcing functions. `sample_state` accepts `observations_now_utc`.
3. `server.py:84`: `FastAPI(lifespan=…)` starts the refresher unless `SOLAR_OBSERVATION_REFRESH=off`. `conftest.py` sets it to off.
4. `server.py:389-418`: `_build_solar_physics_state` reads `SOLAR_OBSERVATIONS.current()` and applies the epoch gate (D2). It adds `effective_forcing` and `live_data_applied`, and stops echoing `live_data_enabled` as if data had been applied [BR-7].
5. `pfss_magnetogram.py:1251-1263`: the GONG fetch leaves the compute path. The magnetogram comes from the store as `None`, i.e. synthetic. The GONG source status becomes `disabled` instead of `ok: true` (`solar_realtime_data.py:809-823, 901-908`) [UP-9].
6. `server.py:925-932`: `/solar/realtime` returns the store state with a rate limit. `force_refresh` requires an API key [UP-28].
   `server.py:935-988`: the tile route serves bytes from the store by `(channel, image_id)`, returns 404 JSON when the id is unknown, and does no upstream I/O [UP-15].
7. Deliberate test changes:
   - `test_snapshot_cache_isolated_by_requested_julian_date` becomes `test_store_keyed_by_wall_clock_not_sim_epoch`.
   - `test_solar_physics_api.py:119-145` tile tests: the `jd is None` assertion at `:131` becomes an `image_id` assertion.

Tests (`tests/test_solar_observation_store.py` plus cases from the drafted `h1/tests/pytest/test_solar_physics_h1_contract.py`):
- `test_request_path_makes_no_upstream_calls` (socket fixture that fails closed)
- `test_failed_source_serves_last_good_until_max_staleness`
- `test_all_failed_refresh_not_cached_as_success` [UP-16]
- `test_backoff_at_least_60s_after_failure`
- `test_overall_deadline_bounds_slow_drip` (`slow_drip.py`: 12.01 s today [UP-19])
- `test_live_data_not_applied_far_from_now`
- `test_same_snapshot_same_jd_is_byte_identical` [BR-14]
- `test_gong_status_not_ok_without_parsed_map`
- `test_refused_upstreams_report_truthful_provenance` (draft)
- `test_black_holed_upstreams_do_not_delay_physics` (draft `test_black_holed…`, adapted)
- `test_aia_image_served_by_id`

Acceptance: run `pytest tests/test_solar_observation_store.py tests/test_solar_transport_contract.py -q` with the network blocked (`h1/tests/plugins/h1_offline.py`). Then, in process with the hang shim (`h1/tests/e2e/upstream_shim/sitecustomize.py H1_UPSTREAM=hang`), the default query must return in ≤ (PFSS time + 0.2 s). Today it takes 21–46 s [BP-11]. An instrumented `urlopen` counter must show 0 calls per `/solar/physics`.

---

**P5: Field service (take PFSS off the request path).** Branch `feat/solar-field-worker` · 2–3 d · after P2 and P4.

Commits:
1. `pfss_magnetogram.py:1107-1173`:
   - new `FieldKey` and `seed_bucket(jd, mode)`, a single function also used at `:238` and `solar_physics.py:857`;
   - `SOLAR_FIELD_SEED_MODE=bucket|cr` (default `bucket` until D1 is decided);
   - rewrite `tests/test_pfss_cache.py:33-57` deliberately (drop the `gong_timeout_s` case; one day later is a new key in `bucket` mode and the same key in `cr` mode).
2. `sim/solar_field_service.py` (`FieldStore`, `FieldWorker`, `request`, `nearest`, duty cap) and `sim/field_worker.py` (`compute_field(key) -> dict`).
3. `solar_physics.py:1015-1163`: split `sample_state` into a `sample_fast_state(…, field_entry)` path. The PFSS call (`:1086-1100`) moves out. `_build_parker_spiral` uses `field_entry.wsa`, or the coronal-hole proxy when there is none (make `has_wsa` at `:910` actually false for `None`) (C9).
4. `server.py:1049-1061`: submit to `_solar_fast_executor` (new) with its own guard. The lifespan hook starts the worker, enqueues `key(now)` and shuts the pool down with `cancel_futures` on exit.
5. v1-compatible response: `pfss_field_lines` holds the nearest field plus `status`, `key_epoch_jd`, `lag_days`, `solver_version` and `validated`. The stored entries are immutable bytes and dicts (C13).

Tests:
- `test_physics_request_never_waits_for_pfss`: the worker is blocked on an Event; the request returns in <200 ms with field status `computing`.
- `test_field_computed_once_per_key_across_requests`
- `test_seed_bucket_key_matches_rng_on_float_boundary` (jd 2461308.55 [BP-15])
- `test_nearest_field_reports_lag`
- `test_parker_uses_served_field_or_proxy`
- `test_porkchop_not_starved_by_solar_field_work` (`exp_slot_holding.py` scenario; today it returns 503 [BR-5])
- `test_worker_process_gone_after_lifespan_exit`
- `test_field_store_bounded_by_bytes`: `[SPIKE, unverified]` an unbounded response cache grew RSS from 70 to 112 MB in about 4 minutes (`rss_step3a.txt`).

Acceptance: real uvicorn without `--reload`. `scripts/perf/solar_latency.py` (from `h1/profile/p7_server.sh`) replays the frontend's real jd sequence at 4 d/s with a 2 s poll for 5 minutes.
- p50 ≤100 ms and p95 ≤250 ms.
- 0 × 5xx.
- `/health` p99 <50 ms.
- An instant porkchop job returns 200 during two cold field keys.
- `ps` shows exactly one worker child.

---

**P7: Client poller v2.** Branch `feat/solar-poller-v2` · 1–1.5 d. Build it in parallel with P5 and ship it with or before P5.

Commits:
1. `src/frontend/features/solar/solarPhysicsPolicy.ts` (new). Remove the hard-coded block at `sunController.ts:152-160` and widen the clamps at `solarPhysicsClient.ts:58-59`.
2. Schedule from completion. Exponential backoff with jitter plus `Retry-After`. Pause when `document.hidden`.
3. Reorder the guards at `sunController.ts:498-499` so force pre-empts. Remove the duplicate gate at `:531` (C16).
4. jd snap to 0.001 d. Skip a request when its key is unchanged, and send `If-None-Match`. Optional `jd_rate` hint.
5. Send hybrid/live parameters only inside the live window.
6. Field by reference once P6 lands. Until then, detect a field change from the inline `pfss_field_lines` id.
7. Clear state on jumps larger than 30 d, and after 5 minutes of failures. Chip states for `field computing` and `for <date>`.
8. Blend duration independent of the poll interval, and blend the first arrival as well [FC-20, FC-21].

Tests:
- The eight drafted cases in `h1/tests/vitest/solarPhysicsClient.h1.test.ts`, moved into the repo: `accepts…cold-miss latency`, `aborted, superseded request…`, `backoff honours Retry-After…`, `status() exposes…`, `quantises jd…`, `60 s frame loop stays under the rate limit`, `schedules the next poll from completion`, `timeout aborts a hung request`.
- New: `pauses when hidden`, `jump-to-now pre-empts in-flight`, `live params only inside window`, `unchanged key sends If-None-Match and no body applies`.

Acceptance: a 10-minute Playwright run with 3 tabs and a server limit of 120: ≤30 requests/min per tab while running, ≤2/min while paused, and **0 × 429**.

**Milestone M2 check:** run the end-to-end acceptance in §7.3 on the P1–P5 + P7 stack.

---

**P6: Contract v2, admission and payload.** Branch `feat/solar-contract-v2` · 1.5–2 d · after P5.

Commits:
1. The v2 schema file, a provenance builder and `schema.version = 2`. Keep the fields that Phase 0 reads (C15).
2. `GET /solar/field/{field_id}`, immutable. `include_field=ref` becomes the default once the P7 client is merged.
3. `GZipMiddleware(minimum_size=1024, compresslevel=1)`: 3.6 ms for the full payload [BP-17]. Round to 4 dp in `_build_feature_arc` and the spiral. Drop never-read fields (list in `payload_breakdown.log` [FC-26]).
4. Pre-serialise in the fast executor. Return `Response(bytes)` with an ETag. Bytes-bounded response LRU (32 MB) consulted before the guard, with a 304 path.
5. `SOLAR_PHYSICS_RATE_LIMIT_PER_WINDOW` default 36 → 120.
6. `src/frontend/features/solar/solarPhysicsContract.ts` replaces the four interfaces. `tsconfig.solar.json` gives a scoped strict typecheck [TC-11].
7. Legend driven by `provenance.layers`.

Tests:
- `test_payload_matches_v2_schema`
- `test_fast_payload_gzip_under_120kb`
- `test_field_endpoint_immutable_etagged`
- `test_304_on_unchanged_state`
- `test_encoding_off_event_loop`
- `test_provenance_covers_every_rendered_layer`
- `solarPhysicsContract.test.ts` (parses the fixture)

Acceptance: `curl --compressed -s -o /dev/null -w '%{size_download}'` returns ≤120 KB. `/health` p99 <20 ms at 10 requests/s of solar load. `npx tsc -p tsconfig.solar.json` exits 0.

---

**P8: Fast tracer (performance).** Branch `perf/pfss-grid-tracer` · 2–3 d · after P2.

Commits:
1. `sim/pfss_grid.py` (new):
   - evaluate B on a tensor grid (log-spaced r, θ, φ) by separable harmonic sums, one matrix product per ℓ, using P2's `schmidt_legendre`;
   - trace all seeds in lockstep RK4 with vectorised periodic-φ trilinear interpolation;
   - compute WSA θ_b with the same tracer from the 36×72 grid;
   - vectorise the lookups at `pfss_magnetogram.py:997-1021, 1071-1087` and `solar_physics.py:939-949`.
2. The worker selects `tracer=grid`. `tracer=reference` stays for tests.

Why not simply batch the existing evaluator (I): `_evaluate_batch` costs about 1.9 ms per call, dominated by its Python loop over (ℓ, m) (714 calls took 1.36 s [BP-3]). Lockstep calls to it over 300 steps × 4 RK4 stages would cost about 2.3 s, which is barely a win. A grid plus interpolation removes that per-call cost.

Tests:
- `test_grid_tracer_matches_reference_topology` (≥97% open/closed agreement, median endpoint Δ ≤0.02 R☉, 5 keys)
- `test_grid_wsa_mean_within_2pct`
- `test_field_compute_high_under_budget` (`H1_PERF=1`, median of 5 ≤0.5 s, idle runner)

Acceptance: those three tests. If ≤0.5 s is missed, keep the reference tracer. P5 already keeps it off the request path, so P8 only affects how fresh the field is during fast-forward.

---

**P9: Upstream repairs and correct AIA placement.** Branch `fix/solar-upstream-sources` · 2–4 d (+1–2 d for GONG if D9 says so) · after P4 and P3.

Commits:
1. SWPC RTSW `rtsw_wind_1m`/`rtsw_mag_1m`: newest-first, `active == true`, field mapping, plasma and mag isolated, gzip [UP-6, UP-23].
2. AIA `downloadImage?id=…&scale=8` full disk (129 KB, 0.355 s [UP-10]). Store rsun, scale and centre. The coronal-hole detector uses metadata instead of `0.90` (`solar_realtime_data.py:526-529`). ISO-8601 `Z` dates. Fix the local-time `Date.parse` at `solarObservationTexture.ts:66-72` [UP-21].
3. Shader (`sunVisuals.ts:279-285`) (I): uniforms for the observer direction in the co-rotating frame at image time, `rsun_px`, centre and solar-north axis. Sample only where `dot(n, obsDir) > 0.05`, using orthographic disk coordinates. Fade by the limb and by |sim − obs| (0 beyond 1 d). Open the AIA layer gate.
4. SILSO daily with `If-None-Match`. UI attribution line: NASA/SDO, WDC-SILSO, NOAA SWPC, Helioviewer, NSO/GONG [UP-24, UP-25].
5. `scripts/canary/upstream_schema_canary.py` (run manually or on a schedule) fails on a 404 or schema drift.

Tests:
- `test_rtsw_parser_picks_newest_active_row` (fixtures `upstream_raw/swpc_rtsw_*`)
- `test_mag_failure_does_not_block_plasma`
- `test_hole_detector_uses_metadata_rsun`
- `test_image_dates_iso_utc`
- vitest `observation freshness is timezone independent` (run with `TZ=Asia/Tokyo`)
- Playwright screenshot: the AIA disk appears only on the observer-facing hemisphere.

---

**P10: CI and end-to-end acceptance.** Branch `ci/solar-e2e` · 1–2 d · each phase adds its own tests; this phase wires them into CI.

Contents:
- `.github/workflows/ci.yml` with these jobs:
  - `npm ci && npm test`;
  - scoped typecheck;
  - `pip install -r backend/requirements.txt -r backend/requirements-dev.txt` (adds httpx [TC-19]), then pytest with the network blocked;
  - Playwright e2e using the upstream shim;
  - an optional `H1_PERF` job.
- Move the harnesses into the repo: `scripts/e2e/solar-acceptance.mjs`, `backend/tests/e2e_shim/`, and `scripts/perf/solar_latency.py`.

---

## 5. Sequencing and traps

### 5.1 Dependency graph

```
P0 ─────────────────────────────┐
P1 (transport) ─────────────────┤
P2 (H-2) ────────┬──► P5 ──► P6 ├──► M2 needs P1+P2+P3+P4+P5+P7 ──► M3 (+P6, P8) ──► M4 (+P9, P10)
P3 (renderer) ───┼──────────────┤
P4 (obs store) ──┘   P7 (poller, built alongside P5, shipped with/before it)
P2 ──► P8 (tracer)        P3+P4 ──► P9 (AIA/SWPC)
```

P1, P2, P3 and P4 touch disjoint files and can run in parallel. **Nothing may make the default path fast (P5) until P2, P3 and P7 have merged.**

### 5.2 Traps (do NOT)

| # | Don't | Evidence |
|---|---|---|
| T1 | Raise the client timeout or the concurrency/thread limits as "the fix" | Two jobs take 20.6–24.0 s each versus 6.97 s alone [BP-21]. Slots are held 22–29 s [BP-19, BP-20] |
| T2 | Release the guard permit on timeout | Recreates unbounded orphans. Pinned by `test_compute_budget.py:20-50`; docstring at `server.py:473-481` |
| T3 | Quantise jd alone and expect PFSS hits | Activity drift (`determinism.json` `hybrid_same_inputs`); warm repeat still takes 7.2 s [BP-5] |
| T4 | Compute bucket keys with different arithmetic from the RNG | `int(2461308.55*100)` = …854 [BP-15] |
| T5 | Use a bare `'/solar'` proxy key, or return `''` as the base URL | Hijacks `/solar-systems` (`proxy-key-collision.txt`); AIA URL becomes null (`aia_url_check.txt`) |
| T6 | Make the server fast before the client respects the limit | 66/min vs 36 [TC-m]; `[SPIKE, unverified]` 3 × 429 in `capture_step4rate` |
| T7 | Let data flow before P2 and P3 | Parker 242 AU, latitude p95 72°, g₃₀ = −2.17 [FC-27, FC-28, BR-27] |
| T8 | Cache all-failed snapshots as success, or key "latest" sources on the sim jd | [UP-16], [UP-3] |
| T9 | Add an unbounded response cache | `[SPIKE, unverified]` RSS 70→112 MB in 4 min |
| T10 | Mutate cached PFSS dicts in place | Shallow copy at `solar_physics.py:1124` [BR-21] |
| T11 | Fix GONG before H-2 and sine-latitude resampling | [BR hidden], [UP-8] |
| T12 | Switch to a full-disk AIA image without the shader change | It would wrap black sky plus a disk around the globe [UP hidden] |
| T13 | Run `--workers N` with an in-process refresher and worker | N× upstream and compute [CD hidden] |
| T14 | Verify CORS through Playwright `route.fulfill` | It adds ACAO automatically [FC hidden] |
| T15 | Accept latency measured on repeated identical jds | Hits caches production never hits [BP fix_implications] |
| T16 | Let the tile route fetch upstream on request | A cold fetch of 3.6 s inside a 4 s budget gives 503 [BR hidden, CD-26] |
| T17 | "Fix" by dropping to `fidelity=preview` | Control run p95 was 2,581 ms against the 2.6 s limit [TC-m] |

---

## 6. Owner decisions

| # | Decision | Options | Recommended default | What it changes |
|---|---|---|---|---|
| D1 | Synthetic field re-seeding (also equatorial holes) | Every 0.01 d (today) / per Carrington rotation | **Per rotation**, with differential drift | Today 20/120 lines flip every 14.4 sim-minutes [BR-18], which is unphysical flicker. Per-rotation seeding gives ~1 key per 27 d, so precompute keeps up and cache hits become real. P5 ships a flag; changes model output |
| D2 | Live-data window | 1 d / 30 d (audit P1-6) / always | **1 d** | "Hybrid" applies only near "now". At 4 d/s the sim leaves the window in 0.25 s. **D2b:** add a "Live (1×)" speed. The slider has no 1× today [FC-7] |
| D3 | Heliospheric structures at inflated scale | Hide / true AU / inflated | **True AU for spiral and CME fronts; compressed corona** | Removes 242 AU spirals and loops past Mars (P3) |
| D4 | Auto channel look | White light / 193 Å tint | **White light** unless the user picks a channel | Avoids the "regression" look when data arrives [FC-17] |
| D5 | SDO image presentation | Projected hemisphere / inset panel / off | **Projected hemisphere (P9); off until then** | Today's crop wrapped as a globe is wrong [UP-10, UP-11] |
| D6 | Transport and hosting | Same-origin proxy / CORS allowlist | **Same-origin** (Vite proxy in dev/preview, reverse proxy in production); allowlist as safety net | Removes the CORS class of failures; identity handled in P1 |
| D7 | SILSO CC BY-NC | Keep with attribution / replace | **Keep, non-commercial**, with attribution. Revisit if the product becomes commercial | Licence exposure [UP-24] |
| D8 | Process model | 1 process + 1 worker process / multiple workers | **Single process + worker process** | Multiple workers need a disk cache and a leader election (C14) |
| D9 | GONG | Honest "disabled" / real ingestion after H-2 | **Disabled now**; ingest later (1–2 d) | Field provenance says "synthetic" truthfully |
| D10 | Default fidelity and field toggle | high / operational; toggle off / on | **High; toggle off** | Cost is trivial after P8 |
| D11 | Field lag during fast-forward | Show nearest with a lag label / hide when older than 1 rotation | **Show with label; hide if older than 1 rotation** | Visual honesty during time-warp |
| D12 | Activity accuracy at past dates | Leave / calibrate / bundle a monthly sunspot table | **Investigate** | `scratchpad/plan/cycle_hindcast.txt` (author unknown, **unverified**) suggests the Hathaway model runs hot: r = 0.69, mean absolute difference 0.275, Aug 2026 model 0.785 vs observed ≈0.35. That bears on "what is shown is correct"; a bundled table falls under D7 |

---

## 7. Risks, effort, and the end-to-end acceptance test

### 7.1 Risks

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| Co-rotating frame phase mismatch (features drift visibly) | M / H | P3 stationarity test; screenshot over 1 rotation |
| Worker process leaks under `--reload` | M / M | Lifespan shutdown test; `ps` check in the acceptance run |
| Grid tracer diverges from the reference | M / M | Equivalence gate; reference tracer kept |
| H-2 fix changes topology and WSA, breaking model tests | H / L | Update `test_solar_physics_model.py:186-271` deliberately in P2 |
| Upstream terms and limits (Helioviewer unpublished) | L / M | Fixed schedule of ≤12 requests/h per channel; User-Agent with a contact; contact the Helioviewer team [UP open questions] |
| Field lag reads as a "frozen" Sun during time-warp | M / M | D11 label; D1 per-rotation seeding; P8 speed |
| 246 repo-wide TypeScript errors hide contract drift | H / L | Scoped `tsconfig.solar.json` |
| `main` moves under the branches; pushes need the owner | H / L | Branch per phase from a named base, rebase before merge, owner pushes |
| Model calibration (D12) undermines "correct" | M / M | Owner decision; out of H-1 scope, flagged |

### 7.2 Effort

| Phase | P1 | P2 | P3 | P4 | P5 | P7 | P6 | P8 | P9 | P10 | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Engineer-days | 0.5–1 | 0.5–1 | 2–3 | 2–3 | 2–3 | 1–1.5 | 1.5–2 | 2–3 | 2–4 | 1–2 | **15–23.5** (+1–2 for GONG) |

### 7.3 End-to-end acceptance: the owner's definition of done

**Setup.**
- Backend: `SOLAR_UPSTREAM_FIXTURES=backend/tests/fixtures/upstream uvicorn server:app --port 8042`. This is hermetic; a second run uses live upstreams.
- Frontend, first `npm run dev -- --port 5173 --strictPort`, then `npm run build && npm run preview -- --port 4173 --strictPort`.
- Command: `node scripts/e2e/solar-acceptance.mjs --origin <o> --scenarios default,paused-now,fast-forward,jump-to-now,upstream-offline,backend-killed --minutes 5 --tabs 1,3`.

**Pass criteria (all must hold on both origins).**

- **A1 Delivery:**
  - ≥99% of settled `/solar/physics` requests are 200 or 304;
  - 0 CORS errors, 0 aborts, 0 × 429;
  - p95 ≤250 ms;
  - ≥1 AIA image loaded with 200 (live run).
- **A2 Visibly backend-driven** (scene introspection against the concurrent payload):
  - loops visible count equals the payload's loop features (≥100);
  - sunspot seeds carry payload region ids;
  - coronal-hole count equals the payload's;
  - activity uniform equals `activity_index` ±0.01;
  - with the field toggle on, line count equals `field.line_count` and `field_id` matches the provenance.
- **A3 Correct:**
  - frontend-derived sunspot |lat| p95 ≤35°;
  - Parker lines ≤3.1 AU physical;
  - coronal layers ≤2 display radii at default scale;
  - ≥1 flare with live frames while a CME feature is emerging;
  - no field line drawn unless `solver_version = pfss-2 && validated`;
  - no live observation applied when |sim − now| > D2;
  - the AIA disk only on the observer-facing hemisphere (after P9);
  - the default white-light look is unchanged in Auto (D4).
- **A4 Attributable:**
  - `#status-solar[data-solar-state=backend]`;
  - the legend lists every drawn layer with its source (model / observation / blend), epoch, and age where relevant;
  - with `upstream-offline`, it says "model only, observations unavailable" within one poll;
  - with `backend-killed`, it shows `stale` then `error`, the fallback activity equals the Hathaway value (not 0), and the state clears after 5 minutes.
- **A5 Resource and isolation:**
  - outbound upstream calls over 10 minutes are ≤ the schedule (≈35) and differ by ≤2 between 1 and 3 tabs;
  - field computes ≤ distinct keys wanted;
  - `/health` p99 <50 ms;
  - an instant porkchop job returns 200 throughout;
  - exactly one worker process;
  - RSS growth ≤50 MB over the run.

The milestone M2 sign-off is this test minus the AIA criteria (those need P9). M4 is the full test running in CI.