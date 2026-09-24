# Report B — Closing the Blocked Checks

**Part B of 4** · `main @ aa6e39a` · 2026-08-23 · read-only · **run 2 (independent re-execution)**

> Companion parts: **[Report 0 — Baseline](MAJOR_ISSUE_REPORT_0_BASELINE_2026-08-23.md)** · **[Report A — Adversarial Verification](MAJOR_ISSUE_REPORT_A_ADVERSARIAL_2026-08-23.md)** · **[Report C — sun-focus & New-Issue Hunt](MAJOR_ISSUE_REPORT_C_SUNFOCUS_HUNT_2026-08-23.md)**

## 2026-09-24 current-branch reconciliation

> **Authoritative current status for `fix/nbody-osculating-initial-state`; code audited through `a864ea4`.** The original `main @ aa6e39a` report is preserved verbatim below as historical evidence. This section supersedes only its present-tense status conclusions. It inventories **50 canonical findings/observations**; the eight bullets in original §9 are recap aliases and are deliberately excluded from the counts.

### Status accounting

| Status | Count | Meaning here |
|---|---:|---|
| **ACTIVE** | **18** | The reported defect remains at the audited code pin. |
| **PARTIAL** | **7** | Material mitigation landed, but the original contract is not completely closed or verified. |
| **RESOLVED** | **15** | Current code and a proportionate regression gate close the reported mechanism. |
| **BLOCKED** | **4** | The report did not preserve enough replay input, or this environment still lacks the required external runtime/hardware. |
| **NOT-A-BUG** | **6** | A clean/refuted result or an intentional behavior, retained so it is not re-filed as a defect. |
| **Canonical total** | **50** | Excludes the eight duplicate recap bullets in original §9. |

Report-local IDs are stable handles for this reconciliation. Original §9 maps to existing IDs as follows: negative TOF → `B-PORK-02`; cancellation → `B-PORK-03`; AnyIO exhaustion → `B-SOL-04`; byte cap → `B-SOL-05`; 200-row catalog → `B-AST-03`; non-finite mission input → `B-MIS-02`; H29 preset → `B-UI-03`; narrow layout → `B-UI-09`.

### Current branch changes and validation

- **N-body (`2226277`)** replaces approximate mean-element initialization with committed JPL Horizons Cartesian states and real REBOUND 5.1.1 multi-epoch accuracy gates. This removes the old IAS15 prerequisite blocker; cross-integrator live continuity remains a separate partial check (`B-BLK-03`).
- **SF-1 (`68aff6b`, gate `f1c79b9`)** stops double-counting apsidal precession and adds a committed multi-epoch Horizons planet-position gate. This is important current-branch scientific context, but it was not a distinct Report B finding and therefore adds no row to the count.
- **Worker boundary (`b6c4ce3`)** moves propagated state transport to a versioned `Float64Array` contract, rejects stale/malformed snapshots, and preserves source-index mapping. It likewise closes a later branch regression rather than a canonical Report B row.
- **Compute lifetime and TOF (`3f5d097`)** keeps endpoint permits attached to worker completion, adds cooperative porkchop cancellation, uses dedicated bounded executors, and rejects non-positive TOF. It resolves `B-PORK-02/03`; `B-PORK-01` remains partial because a successful accepted scan still accumulates all bounded points/failures before response slicing.
- **Solar epoch cache (`e740b21`)** replaces the single snapshot slot with a bounded epoch-keyed LRU and distinct `latest` identity, resolving `B-SOL-02` with isolation, refresh, eviction, and non-finite-JD tests.
- **WebSocket resources (`90f4134`)** enforce the validated 1990–2050 JDTDB seek interval, segment long integrations for cooperative cancellation, cap checkpoints at eight, and add pre-engine origin/four-session admission. This resolves `B-WS-02/06`; the cap also closes canonical R25 even though Report B has no separate row for it.
- **PFSS and MGA (`a40005a`, `3f3b787`)** complete PFSS cache identity/single-flight (canonical R15) and require ideal unpowered flybys to conserve `|v∞|` while deriving turn limits from the incoming hyperbola. The latter resolves `B-MGA-03/04`; route enumeration and the hardcoded route penalty remain open.
- **Asteroid provenance (`84ddcd1`)** requires valid metadata plus matching SHA-256, separates load latency from integrity, and presents persistent typed source/fallback state. This resolves `B-AST-01/02/04`; the independent expected-row and mixed-population fraction contracts remain partial.

Fresh verification of code through `a864ea4`:

- Backend: `pytest -q backend/tests` → **176 passed, 5 warnings** with REBOUND **5.1.1**.
- Frontend: full Vitest → **108/108 tests passed across 7 files**, including asteroid integrity/source-state, worker-contract, and Horizons gates.
- Production build: Vite → **passed, 40 modules transformed**; only the existing approximately 892.90 kB main-chunk warning remains. Strict TypeScript remains a separate failing gate with **280 errors**.

### Canonical finding reconciliation

| ID | Status | Current-branch evidence and disposition |
|---|---|---|
| `B-MGA-01` | **ACTIVE** | `mga.py` still applies `MAX_COMPLETED=48` to completed beam partials globally, so early body routes exhaust later routes' budget. Allocate/count per body route and gate route coverage. |
| `B-MGA-02` | **ACTIVE** | Routes remain ordered by length then lexicographically; tests still do not prove that `max_assists=1/2/3` explore different route sets. Rank/diversify seeds and add that invariant. |
| `B-MGA-03` | **RESOLVED** | `3f3b787` rejects ideal unpowered encounters when incoming/outgoing `|v∞|` differ beyond `max(0.001 km/s, 1e-4 relative)`, rather than granting a free powered impulse. Diagnostics and focused mismatch/tolerance tests gate the rule. |
| `B-MGA-04` | **RESOLVED** | `3f3b787` computes maximum turn from incoming `v∞` and gates the distinction from the former averaged-speed calculation. |
| `B-MGA-05` | **ACTIVE** | `turnDeficitPenalty` remains hardcoded `0.0`. Populate it from required-minus-available turn or remove the field/score contract. |
| `B-PORK-01` | **PARTIAL** | Server-side windows, grid points, concurrency, timeout, and worker lifetime are bounded, but `scan_porkchop_window` still appends every accepted bounded point/failure and slices only the returned payload. Retain top-k/summary data during iteration. |
| `B-PORK-02` | **RESOLVED** | `3f5d097` makes both TOF bounds `Field(..., gt=0.0)` and adds API regressions for negative and zero TOF. |
| `B-PORK-03` | **RESOLVED** | `3f5d097` supplies a cancellation event checked inside the grid loop and releases the permit only when the worker future finishes; tests cover pre-cancellation and post-timeout permit ownership. |
| `B-WS-01` | **NOT-A-BUG** | The original rerun refuted normal abrupt-disconnect zombies; current code does not supply contrary evidence. Keep a multi-connection reclamation smoke gate. |
| `B-WS-02` | **RESOLVED** | `90f4134` integrates long forward seeks in at-most-ten-year segments with a runner cancellation event; stop/disconnect requests cancellation and endpoint ownership remains held until the real thread exits. Tests cover cancellation between segments and the stop/dequeue race. |
| `B-WS-03` | **ACTIVE** | Querying orbital elements for the Sun still asks REBOUND for the Sun about itself; the resulting command exception latches `_runtime_error`, and resume does not clear it. Return `not_available` without latching. |
| `B-WS-04` | **ACTIVE** | Kuiper `_frame_counter` still advances only in `step()`, so pausing on a multiple of five makes `should_send()` true every output frame. Gate sends on new Kuiper state/version. |
| `B-WS-05` | **ACTIVE** | Runner integration still advances fixed `time_scale / target_fps` rather than measured elapsed time while telemetry reports requested scale. Report delivered rate or integrate bounded elapsed time. |
| `B-WS-06` | **RESOLVED** | `90f4134` replaces the unbounded checkpoint dictionary with a deterministic eight-entry LRU and tests eviction at the declared limit. The supported seek interval is also bounded to 1990–2050 JDTDB. |
| `B-WS-07` | **NOT-A-BUG** | Checkpoint-assisted seek remains reproducible; current real-IAS15 tests compare a checkpoint seek with the direct 2026 solution. Preserve the gate. |
| `B-MIS-01` | **BLOCKED** | The reported single “unexpected 200” has no preserved request body, seed, or expected contract, so it cannot be replayed. Recover/persist the fuzz corpus before assigning a defect. |
| `B-MIS-02` | **ACTIVE** | Raw JSON `NaN`/`±Infinity` still reaches the framework validation-error serialization failure and returns 500. Add a sanitizing validation handler and assert structured 422s. |
| `B-MIS-03` | **ACTIVE** | Return propellant is still deducted from `returnedPayloadKg` and again from mission score. Replace this with one auditable mass/economic ledger. |
| `B-MIS-04` | **ACTIVE** | Return-burn rocket-equation mass is still based on the original payload and omits mined cargo. Pass separate outbound/return payload masses and gate mass closure. |
| `B-MIS-05` | **ACTIVE** | Monte Carlo risk still has no deterministic feasibility/unmet-Δv input. An infeasible logistics solution must imply failure before stochastic sampling. |
| `B-MIS-06` | **BLOCKED** | The literal current EPO `0/30` result is not a stable offline check because sample episodes use the live `auto` ephemeris chain, while no-recommendation can now correctly mean all candidates failed verification. Add fixed ephemerides and declared-feasible episodes. |
| `B-MIS-07` | **ACTIVE** | EPO still reads top-level `result.verification` while successful planner output nests verification under `recommendation`. Normalize and gate one schema end to end. |
| `B-SOL-01` | **RESOLVED** | Snapshot and binary reads now use same-key single-flight with completion-before-release and failure backoff; the original cold-cache linear stampede mechanism is closed. |
| `B-SOL-02` | **RESOLVED** | `e740b21` keys snapshots by exact finite JD versus `latest`, bounds them with LRU eviction, and tests epoch isolation, refresh, and eviction. |
| `B-SOL-03` | **PARTIAL** | Same-key force-refresh traffic is deduplicated and CORS/heavy endpoints are hardened, but `/solar/realtime?force_refresh=true` remains unauthenticated and lacks its own rate limit. Apply the protected solar policy there. |
| `B-SOL-04` | **PARTIAL** | `3f5d097` moves heavy scientific work to dedicated bounded executors, but synchronous `/solar/realtime` followers can still occupy AnyIO tokens while waiting on a threading event. Convert that route/single-flight wait to async or isolate it too. |
| `B-SOL-05` | **ACTIVE** | JSON, binary, and text upstream helpers still use unrestricted `response.read()`. Add `Content-Length` and streaming byte ceilings per source. |
| `B-SOL-06` | **ACTIVE** | SILSO still downloads the roughly 2.9 MB daily history on the 120-second snapshot TTL to retain one row. Use conditional/daily caching or a smaller authoritative product. |
| `B-SOL-07` | **ACTIVE** | Both configured one-day SWPC product URLs still return 404. Replace them with current documented products and gate their response schema. |
| `B-SOL-08` | **ACTIVE** | Missing provider weights are still silently renormalized into a full-scale activity proxy. Publish coverage/confidence and reject “high fidelity” below a documented threshold. |
| `B-SOL-09` | **NOT-A-BUG** | The AIA SSRF remains refuted: channel is allowlisted and no caller-controlled URL/image ID reaches the upstream URL. Preserve an unknown-parameter/allowlist test. |
| `B-SOL-10` | **PARTIAL** | Frontend `image_id`/`v` query terms still alter the browser cache key but are ignored by backend selection, so they do not certify an exact snapshot. Remove them in favor of ETags or validate an opaque snapshot ID. |
| `B-AST-01` | **RESOLVED** | `84ddcd1` renders persistent accessible loading, verified, typed fallback, and load-failure states while retaining the procedural belt on rejection. Ten focused tests cover the underlying state contracts. |
| `B-AST-02` | **RESOLVED** | `84ddcd1` fails closed when metadata is missing/invalid or lacks a valid matching 64-hex SHA-256; FNV is never accepted as an integrity substitute. |
| `B-AST-03` | **PARTIAL** | Missing metadata can no longer admit a tiny catalog, but row authority still comes from the same metadata: a self-consistent SHA-verified three-row fixture passes. Add an independent production expected-row contract. |
| `B-AST-04` | **RESOLVED** | `84ddcd1` removes latency from integrity acceptance. A slow catalog with valid metadata/SHA-256 remains accepted and produces separate performance telemetry. |
| `B-AST-05` | **RESOLVED** | Metadata now fetches with `cache:'no-cache'` (`6bf33cb`), closing the stale `force-cache` checksum mismatch mechanism. |
| `B-AST-06` | **PARTIAL** | Persistent UI now distinguishes verified catalog, typed procedural fallback, and load failure, but an accepted short catalog can still be procedurally padded without displaying the real-row/procedural fraction. |
| `B-UI-01` | **RESOLVED** | Orbit translation is now applied after instance rotation/scale in both asteroid vertex paths (`0c99424`, reinforced by `330fc3a`), so the belt no longer collapses into the Sun. |
| `B-UI-02` | **RESOLVED** | `metric_slipstream` now dispatches `triggerWarpWaveImpact`, whose controller callback enables the warp mesh (`63320e8`). |
| `B-UI-03` | **ACTIVE** | The H29-named preset still changes energy only; propagation scenario remains controlled by the separate hypothesis dropdown. Make the preset select H29 atomically or rename it. |
| `B-UI-04` | **NOT-A-BUG** | Solar procedural animation advancing on wall time while orbital mechanics is paused is now explicit (`4de82eb`). Offer a separate “freeze visuals” control if desired. |
| `B-UI-05` | **NOT-A-BUG** | Small Earth/Pluto screen sizes are the expected result of physical-radius rendering in realistic mode. Improve selection with screen-space markers rather than falsifying size. |
| `B-UI-06` | **ACTIVE** | The live `main.ts` label sprite remains fixed at `(0.12, 0.03)` and scale-mode changes do not adapt it. Integrate the adaptive label system or gate pixel size. |
| `B-UI-07` | **RESOLVED** | Scale changes now force magnetic geometry to rebuild from the current Sun radius. Add a solar-radii extent assertion to preserve this behavior. |
| `B-UI-08` | **NOT-A-BUG** | Focus and Follow are separate shipped controls; Focus intentionally clears follow, while Follow tracks each frame. Clarify labels if users confuse the modes. |
| `B-UI-09` | **ACTIVE** | At widths below 1150 px the layout still stacks an uncapped full control panel before the canvas. Use a capped drawer/overlay and mobile viewport tests. |
| `B-BLK-01` | **BLOCKED** | TudatPy force-model execution remains unavailable in this non-conda environment; interface-only tests do not verify real force wiring. Add a conda CI oracle lane. |
| `B-BLK-02` | **BLOCKED** | Real-GPU timings/drawing-buffer behavior remain unverified on this environment. Record renderer/driver/resolution and allocation/frame-time data on named physical GPUs. |
| `B-BLK-03` | **PARTIAL** | `2226277` removes the IAS15/REBOUND blocker and adds real multi-epoch accuracy/seek gates, but no live WebSocket or common-state IAS15↔WHFast/Mercurius switch-continuity test exists yet. Run and commit that contract. |

### Current priority after reconciliation

The fixes above close the reported MGA energy/turn mechanism, uninterruptible-seek/checkpoint defects, and asteroid integrity/provenance failure modes without overclaiming adjacent work. The highest-priority Report B work still present is route enumeration/accounting (`B-MGA-01/02/05`), remaining WebSocket protocol errors (`B-WS-03/04/05`), mission mass/risk inconsistency (`B-MIS-03/04/05`), independent asteroid row/fraction contracts (`B-AST-03/06`), and unbounded/dead solar upstreams (`B-SOL-05–08`).

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
