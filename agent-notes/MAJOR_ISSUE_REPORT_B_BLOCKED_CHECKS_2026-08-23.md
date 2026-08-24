# Report B — Closing the Blocked Checks

**Part B of 4** · `main @ aa6e39a` · 2026-08-23 · read-only · **run 2 (independent re-execution)**

> Companion parts: **[Report 0 — Baseline](MAJOR_ISSUE_REPORT_0_BASELINE_2026-08-23.md)** · **[Report A — Adversarial Verification](MAJOR_ISSUE_REPORT_A_ADVERSARIAL_2026-08-23.md)** · **[Report C — sun-focus & New-Issue Hunt](MAJOR_ISSUE_REPORT_C_SUNFOCUS_HUNT_2026-08-23.md)**

## What this part is

The comprehensive evaluation listed seven checks it planned but could not run (its §13): MGA flyby invariants, `/mission/plan` fuzzing, asteroid failure-mode browser tests, an 8–20-connection WebSocket load test, engine-switch continuity, TudatPy force-model wiring, and real-GPU timings. Six of those were executable here. This part runs them.

**Method.** Six agents, each with its own `uvicorn` instance on a private port and its own browser context, each required to *execute* rather than code-read, and to report a blocker explicitly rather than reason its way to a verdict. Run twice; run-2 agents were told not to read run-1 artifacts. **Run 2: 6/6 agents, 0 errors, 306 tool calls, ~716 k tokens.**

Everything below is `[re-executed]` unless marked otherwise. All browser timings are **SwiftShader CPU lower bounds**, not GPU measurements.

## Headline

All six checks ran. They confirmed the register's expectations in most places, **refuted one security claim outright**, **materially revised the zombie-thread mechanism**, and found **eight new defects** — the most serious of which is that every gravity-assist route the trajectory API returns is physically impossible.

---

## 1. MGA flyby invariants — the worst finding in this part

### 1.1 The search evaluates 4 of 41 routes, and `max_assists` is a no-op

`backend/trajectory/mga.py:22` sets `MAX_COMPLETED = 48`, but the counter increments per *beam partial* (up to `PRUNE_PER_DEPTH = 18` per body route), not per route. Instrumented against the unmodified module:

```
generated routes = 41 ; body routes actually seeded = 4 ; venus_tried = False
order: earth->mars, earth->jupiter->mars, earth->mercury->mars, earth->saturn->mars   (venus is index 4)
completed_routes appended = 48 == MAX_COMPLETED
  earth->jupiter->mars: 18   earth->mars: 15   earth->saturn->mars: 15   earth->mercury->mars: 0
```

Three routes exhaust the budget; the direct `earth->mars` route alone burns 15 of 48 slots. Because ordering is `(len, lexicographic)` at `mga.py:48`, **Venus — the canonical inner-system gravity assist — is structurally unreachable.**

The consequence is worse than a truncated search. A sweep shows `max_assists = 1`, `2`, and `3` all evaluate exactly **4** routes and return an **identical best route**, confirmed live: `POST /trajectory/plan` with `max_assists=1` and `max_assists=3` returns **byte-identical** best-and-alternatives. The API parameter (`server.py:216`, `ge=0 le=3`) is inert above 1.

### 1.2 Every accepted assist route violates conservation of energy

An unpowered flyby can only *rotate* `v∞`; its magnitude is conserved in the body frame. `mga.py:108` averages the incoming and outgoing magnitudes and never charges the difference:

```
33 assist routes reaching completed_routes:
  totalDeltaVKmS(reported) == deltaVDeparture(leg0) + deltaVArrival(legN)  for 33/33
  interior dV never charged: 13.4 .. 26.6 km/s
  |v_inf,in| vs |v_inf,out| mismatch: min 0.051  median 3.559  max 15.881 km/s
584 _evaluate_flyby calls: median mismatch 25.50 km/s (p90 86.3, max 255.0)
  accepted-only (feasible=True, n=154): median 4.81, max 85.83 km/s
```

Live, the flagship `objective=max_assist` result:

```
best = earth->saturn->mars
  flyby@saturn |v_inf,in| = 6.5046   |v_inf,out| = 18.1234   MISMATCH = 11.6188 km/s (+178.6%)
  reason "ok", feasible true
  requiredTurn 104.827 deg vs maxTurn 108.267 deg  <- computed from the AVERAGED v_inf = 12.31 km/s
  with the TRUE outgoing v_inf, maxTurn is only 83.16 deg -> the average is what admits the route
  totalDeltaVKmS = 29.505071 == dep0 + arrN exactly; 24.628 km/s of interior dV uncharged
  turnDeficitPenalty = 0.0 (hardcoded, mga.py:271)
```

The planner manufactures **+178% of `v∞`** at Saturn for free, credits 19.5 km/s to `totalAssistGainKmS`, calls it feasible, and reports a headline Δv understated by roughly a factor of two. Because the turn limit is evaluated on the *averaged* magnitude, it is neither the in- nor the out-condition, and it flips the feasibility verdict in **48 of 584** evaluations.

**Severity: High.** Every assist route this API returns is physically impossible.

**Fix:** reject when `|v∞,out| ≠ |v∞,in|` beyond tolerance, or charge the difference as a powered-flyby Δv; compute `maxTurn` from the incoming `v∞` only; populate `turnDeficitPenalty`. Count distinct body routes rather than beam partials, and order candidates by score rather than alphabetically.

---

## 2. Unbounded compute on `/trajectory/porkchop`

The step sizes are floored (`lambert.py:274-275`), which bounds resolution but **not work**; only the *response* is truncated (`points[:500]`). Measured:

```
departure_step=1e-9, tof_step=1e-9  ->  floors applied: 0.5 d / 5.0 d  (HTTP 200, 0.011 s)
100 x 100     =  10,000 points  ->  HTTP 200 in  2.686 s, RSS 71.4 -> 77.8 MB
1001 x 389    = 389,389 points  ->  HTTP 200 in 104.74 s, RSS 77.8 -> 256.0 MB (+178 MB)
                                    ~4,900 points/s, ~555 B retained per point
Client abort (curl -m 4): server CPU kept climbing 156.4 -> 196.5 s over the next 40 s
                          with no client attached — no cancellation.
```

Extrapolated, a ~300-byte unauthenticated POST for a 10-year departure window × 2000-day TOF range is ≈2.84 M points ≈ 10 minutes of CPU and ~1.5 GB RSS in **one request**; a 100-year window is hours and tens of GB. Combined with wildcard CORS, any web page can issue it.

**New this run — negative TOF passes validation.** `tof_min_days` carries no `gt` constraint while the step fields do:

```
{"tof_min_days": -1000000.0, "tof_max_days": -1.0, "tof_step_days": 5.0}
  -> 11 x 200,000 = 2,200,000 points, success_points = 0
  -> wall 16.70 s, maxRSS 23 -> 1731 MiB (+1.7 GiB), 131,718 pt/s
```

Every cell fails, and each failure is appended to an unbounded in-memory `failures` list. **1.7 GiB of RSS from a request that computes nothing.**

---

## 3. WebSocket concurrency and lifecycle — mechanism revised

This is where the two runs disagreed, and run 2 is right.

**Run 1** reported that 12 abruptly-closed connections left 12 zombie threads alive for >40 s. **Run 2 could not reproduce that** and found the real mechanism:

```
A) 12 x /ws/sim?integrator=whfast, then transport.abort():
   before Threads=38 RSS=71,832 kB | during Threads=50 | t+0.5s Threads=38 | t+15s Threads=38
   -> exactly +1 OS thread per connection, ALL reclaimed in <0.5 s. NO zombie in the normal case.

B) 4 connections each send {"type":"set_julian_date","jd": J2000 + 3000*365.25}, then disconnect:
   -> the 3-second stop() join is defeated by an uninterruptible integrate()
   -> 4 disconnected clients burned 82.7 CPU-seconds after their sockets were gone
```

**Revised statement:** the leak is not "abrupt disconnect leaks a thread." It is "`stop()` joins with a 3 s timeout while `integrate()` is uninterruptible, so any long seek outlives its client." Same severity (**High**), different fix — the runner needs a cooperative interrupt inside the integration loop, not better socket handling.

**K-25 confirmed verbatim.** `get_orbital_elements` for `body_id: "sun"` permanently bricks the session:

```
BASELINE   jd 2451545.067 -> 2451553.000  delta +7.933 d  paused=False  runtime_error=None
send get_orbital_elements(sun) -> error "Particle and primary positions are the same."
AFTER-ERR  delta 0.000000000 d   paused=True   runtime_error=<set>
send resume -> paused reports False, runtime_error STILL SET, jd STILL FROZEN
```

**K-50 confirmed and better characterized.** A paused connection with Kuiper active streams the full particle payload — but only in one of five pause parities:

```
4 of 20 trials:  36.3-42.3 frames/s, 98.6 KiB per frame, 3.67-4.27 MB/s, jd verified frozen
16 of 20 trials: 2.7 frames/s, ~13.9 kB/s, 0 kuiper frames
```

So the defect is real and severe (**4.27 MB/s to a paused client**) but intermittent, depending on where `_frame_counter` stops — which explains why it is easy to miss.

**Two further confirmations:** sim-time rate diverges **32×** from the advertised `time_scale` on frame overrun (365 d/s requested → **11.41 d/s** delivered with Kuiper, while telemetry still reports 365); and `_checkpoints` grow unpruned at 5,829 B per copy — **101 copies after a 1000-year seek, 501 after 5000 years**, with no prune path anywhere in the engine.

**Clean:** checkpoint-assisted seek is **bit-exact**. `whfast` and `mercurius` both close a +10/−10 yr round trip to `0.000e+00 AU` on all four probe bodies, with energy errors 3.1e-12 and 1.7e-10. The `ias15` leg is blocked by the engine defect, not by anything in this test.

---

## 4. `/mission/plan` fuzzing

41 cases: **37 structured 4xx, 1 unexpected 200, 3 HTTP 500s.** No hangs, no unbounded loops, worst latency 3.23 s.

The three 500s are all the same defect and it is an amusing one — the crash is inside **FastAPI's own validation-error handler**:

```
{"payload_mass_kg": NaN}   -> 500
{"departure_jd": Infinity} -> 500
{"reserve_fraction": -Infinity} -> 500
root cause: RequestValidationError{'type':'finite_number'} is raised correctly,
            then Starlette's json.dumps(allow_nan=False) fails serializing the offending
            value back into the 422 body -> unhandled -> 500 + traceback
```

Validation is *correct*; the error path is what breaks. **Medium** — trivially reachable, unauthenticated, leaks a traceback.

**Mission economics confirmed and sharpened.** The return propellant is charged twice, and run 2 shows the practical consequence:

```
mining_service.py:81  returned_payload_kg = max(0, delivered_before_propellant - return_propellant_kg)   # once
agents.py:372         score = returnedPayloadKg - totalPropellantUsedKg - ...                            # again
   (totalPropellantUsedKg already includes the return burn)
```

driving `returnedPayloadKg` to **exactly 0.0 for every realistic vehicle configuration**. Separately, the return-burn rocket equation never adds the mined cargo it is carrying home (`vehicle_service.py:64` sets mass once, before both burns).

`risk.failureProbability` is **0.000 over 240 samples for a mission 35.7 km/s short of feasibility** — `run_monte_carlo` has no feasibility or unmet-Δv parameter at all.

**EPO 0/30 root cause revised:** the register blames a verification-key path mismatch. That mismatch is real but currently **masked** — the operative failure is that the planner returns no recommendation at all (`missing_recommendation: 30`, `missing_mission_score: 30`, `missing_failure_probability: 30`; the key-path reason never appears).

---

## 5. Solar cache and fetch abuse

**Confirmed — no single-flight.** `latest()` releases its lock before `_fetch_snapshot`, so a cold cache stampedes linearly:

```
8 concurrent plain GETs (no force_refresh) to a cold backend:
  8x HTTP 200, t = 4.93..5.63 s, wall 6.02 s, network received = 31.06 MiB
```

**Confirmed — the cache is a single unkeyed slot,** so `latest(jd=X)` serves another epoch's data:

```
GET /solar/physics?jd=2458849.5 (2020-01-01), cold -> sdo_aia.request_date_utc = 2020-01-01  (correct)
GET /solar/physics?jd=2457188.5 (2015-06-15), 3 ms later, warm -> STILL 2020-01-01
```

This is cross-request data poisoning, not merely a stale cache: one client's epoch determines what every other client receives.

**Confirmed — `force_refresh` is an unauthenticated bandwidth amplifier at ~37,000×:**

```
 1 x force_refresh : t = 5.78 s, upstream received 4,487,907 B
 8 x concurrent    : upstream received 23.71 MiB in one 6.5-7.0 s window
44 x concurrent    : wall 10.37 s, upstream received 156.62 MiB (~15 MB/s sustained)
  -> ~4.4 KB of attacker request produced ~164 MB of third-party traffic
```

**New this run — threadpool exhaustion.** The four solar routes are `sync def`, so each blocking upstream fetch occupies one of anyio's **40 default threadpool tokens**, and no `set_default_thread_limiter` call exists anywhere:

```
baseline /health: 0.0017 / 0.0010 / 0.0008 s
during a 44-way force_refresh burst: /health degrades to multi-second responses
```

A single unauthenticated caller can stall the entire API, including `/health`.

**New — no byte cap on any upstream read**, executed against a local 300 MB body:

```
p._fetch_text("http://127.0.0.1:8079/huge.csv")
  -> returned 314,572,800 chars in 0.78 s
  -> peak RSS 42 MB -> 644 MB (delta 602 MB, ~2x from the utf-8 decode)
  -> no cap, no Content-Length check, no chunked guard
```

**Confirmed — SILSO waste:** 2,894,954 B re-downloaded every 120 s to retain **158 bytes** (0.0055%) of a value that changes once a day. **Confirmed — both NOAA SWPC URLs are permanently 404**, so the 45%-weighted solar-wind term is dead and silently renormalised away.

**REFUTED — the AIA tile SSRF.** The endpoint does not accept `image_id` at all:

```
?channel=aia_193                                  -> 200, 191,759 B, id 82703440
?channel=aia_193&image_id=999999999               -> 200, 191,759 B, id 82703440  (identical md5)
?channel=aia_193&image_id=http://127.0.0.1:8071/health -> 200, identical bytes
signature: solar_realtime_aia_tile(channel, jd, force_refresh)   <- no image_id parameter
```

`channel` is allowlisted and `image_id` never reaches the outbound URL. **No user-controlled component reaches Helioviewer.** Both runs independently reached this conclusion; the register's SSRF framing should be dropped. (A minor consequence survives: the frontend's cache-busting `image_id`/`v` params are silently ignored, so a stale tile is served from the backend's URL-keyed cache.)

---

## 6. Asteroid failure modes — every path fails silently

Six browser tests against fixtures served by request interception (the real `public/` tree was never touched). **In every failure mode the status readout is byte-identical to success:** `Bodies: 20,010`.

| Scenario | Result | User-visible signal |
|---|---|---|
| Valid catalog (baseline) | accepted, `checksum=a0b8328c…`, load 420 ms | `Bodies: 20,010` |
| **1-bit-flipped `.bin`** | rejected → silent procedural substitution | `Bodies: 20,010` — identical |
| **Truncated `.bin`** (1.0 of 3.6 MB) | parser throws → catch-all → procedural | `Bodies: 20,010` — identical |
| **`meta.json` 404** | **ACCEPTED UNVERIFIED**, hash silently downgraded SHA-256 → FNV-1a | `Bodies: 20,010` — identical |
| **Valid file, 3.5 s delay** | rejected purely for slowness | `Bodies: 20,010` — identical |
| **200-record `.bin` + `meta.json` 404** | **ACCEPTED** (0.2% of declared rows) | `Bodies: 20,010` — identical |

Two of these deserve to be called out.

**The checksum gate fails open.** With `meta.json` missing, `extractExpectedChecksum` returns `undefined`, the acceptance layer records "No checksum declared → pass", and the algorithm silently falls back from the declared SHA-256 to FNV-1a. Worse, the row cross-checks go with it: a **200-record file claiming 100,000 rows is accepted**, and 14,800 procedural asteroids are silently blended with 200 real ones.

**The 2-second latency budget is a data-validity veto.** A byte-identical, checksum-valid catalog delayed to 6.46 s is discarded with `loadMs exceeded budgetMs` as the *only* failing gate — no checksum, version, row, or taxonomy reason. A slow network is treated as corrupt data.

**K-47 confirmed by direct cache probe.** `cache: 'force-cache'` on `meta.json` pins the old checksum while the `.bin` revalidates normally, so after any dataset regeneration a returning user fetches new bytes and checks them against the old hash — a guaranteed false failure and silent downgrade.

**The substitution is not cosmetic.** The procedural belt is materially different physics:

```
metric        CATALOG (p50/p95/max)        PROCEDURAL (p50/p95/max)
e             0.1326 / 0.2572 / 0.4820     0.0524 / 0.1391 / 0.2313
i (deg)      10.500  / 24.110  / 52.040    4.9125 / 13.526  / 34.841
a (AU)        3.0950 / 3.2310 / 3.5000     2.6552 / 3.1878 / 3.2389
```

Half the eccentricity, half the inclination — presented to the user as JPL-seeded catalog data.

---

## 7. Runtime browser probe

Four passes in headless Chromium against the dev server, with the backend live.

**F-01 confirmed visually.** With every other scene object hidden and the camera top-down:

```
range 8 AU    -> 12 lit px,      rmax 2.2 px  = 0.0220 AU
range 0.5 AU  -> 2,194 px,       rmax 42 px   = 0.0259 AU
range 0.05 AU -> 240,165 px,     rmax 387 px  = 0.0239 AU
Expected annulus 2.06-3.30 AU; measured extent 0.022-0.026 AU  (~100x collapse)
```

**K-13 confirmed with a runtime uniform dump — and the diagnosis is subtler than the register's.** The H29 channel *does* fire; it is the mesh that can never switch on:

```
channel keys = ['metric_slipstream','gw','neutrino','em','uhecr','blast','alfven','cr_tsunami']
firedUnion   = ['metric_slipstream','gw','neutrino','em','uhecr']     <- H29 channel DOES fire
warp material.uniforms.enabled = [0] only; mesh.visible = true
3 triggers x 22 samples = 66/66 samples with enabled = 0
```

**New — the "H29" preset does not engage H29 physics.** Only the *Propagation model* dropdown does:

```
preset = SgrA_WarpWave_H29, model = compound:
  channels = ['gw','neutrino','em','uhecr','alfven','blast','cr_tsunami']   (no metric_slipstream)
  timeline.h29 = null ; getWarpState() = null throughout
model = h29 (preset blank):
  metric_slipstream present, h29 block present, getWarpState() non-null
```

A user selecting the preset named after the hypothesis gets the standard model.

**Pause semantics, measured precisely** over 29.6 s of wall-clock while paused:

```
FROZEN:    julianDate delta 0 | Earth worldPosition [0,0,0] | sun mesh rotation 0
           | magnetic-field vertices [0,0,0] | belt uJulianDate
ADVANCING: sunSurface uniforms.time +11.879 (= wall x 0.40)
           corona    uniforms.time +16.037 (= wall x 0.54)
```

Simulation time and all body kinematics correctly stop; every wall-clock-driven solar visual keeps running.

**Realistic-scale defects, measured:**

```
Earth, display scale, focused:   range 0.0334 AU, radius 0.00167 AU  -> 81.18 px diameter
Earth, realistic scale, focused: range 0.0100 AU, radius 4.26e-5 AU  ->  6.92 px diameter
Pluto, realistic scale, focused:                                     ->  1.29 px diameter
labels: scale (0.12, 0.03) in BOTH modes — never rescaled
magnetic field: magMaxAu = 0.953144 in BOTH modes
   = 2.54 solar radii at display scale (as designed), 204.8 solar radii at realistic scale
```

Focus also does not follow, so the target escapes the frame within about a second. And the layout breaks below a 1150 px viewport: the canvas is pushed entirely below the fold and camera input is unreachable.

---

## 8. Still blocked

| Check | Status | Blocker |
|---|---|---|
| TudatPy force-model wiring | **blocked** | Not on PyPI; conda-only. Not scored. |
| Real-GPU timings / drawing-buffer reallocation | **blocked** | WSL2 without passthrough; SwiftShader only. All timings here are CPU lower bounds. |
| Engine-switch continuity involving `ias15` | **blocked** | By the `ias15` defect itself. `whfast ↔ mercurius` was tested instead and is bit-exact. |

## 9. New defects found in this part

Carried forward to the roadmap in Report C:

1. **Negative `tof_min_days`** passes validation → 1.7 GiB RSS from a request computing nothing.
2. **No cancellation** on `/trajectory/porkchop` — CPU keeps burning after client abort.
3. **anyio threadpool exhaustion** via the `sync def` solar routes → whole-API stall including `/health`.
4. **No byte cap** on upstream reads → 602 MB RSS from one 300 MB response.
5. **`meta.json` 404 accepts a 200-record catalog** claiming 100,000 rows.
6. **NaN/Infinity → HTTP 500** inside FastAPI's own error handler.
7. **The H29 preset does not engage H29 physics** — only the propagation-model dropdown does.
8. **Layout unusable below 1150 px** — canvas below the fold, camera input unreachable.
