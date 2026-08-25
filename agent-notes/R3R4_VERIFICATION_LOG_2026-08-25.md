# R3/R4 Verification — shared live log

**Run started:** 2026-08-25 · **Under test:** `fix/r3-r4-pfss-dos-and-test-gap` @ `a6f1dba` (6 commits on `origin/sun-focus` = `7baa015`)

This file is written **concurrently by multiple verification agents**. Each entry is appended
atomically (`flock`) and is prefixed with the agent that wrote it, so entries interleave by time,
not by author. Agents log as they go, so partial findings survive if a run is cut short.

**Entry format**

```
### `AGENT-x · area` — short title
_UTC timestamp_

body: numbers, commands, verdicts
```

**Verdict tags** used in titles: `CONFIRMED` (claim holds), `DEFECT` (found a problem),
`REFUTED` (claim is wrong), `BLOCKED` (could not run), `NOTE` (context).

**Agents in this run**

| ID | Area |
|---|---|
| `AGENT-A` | PFSS cache + single-flight (R3 Layer 1, `4cf940b`) |
| `AGENT-B` | Endpoint bounds, semaphore, over-admission fix (R3 Layer 2, `57ad971` + `5d0e4b7`) |
| `AGENT-C` | R4 tests — do they run, do they bite (`96d8fe1`, `9c3fdc5`) |
| `AGENT-D` | Integration claims, rate-limiter fix (`a6f1dba`), repo hygiene |

---

### `AGENT-SETUP` — NOTE — log initialised
_2026-08-25T20:24:20Z_

hello from setup


### `AGENT-D` — NOTE — AGENT-D starting
_2026-08-25T20:27:23Z_

Plan: (1) pytest counts at fd793f4 / 7baa015 / a6f1dba; (2) tsc --noEmit 7baa015 vs a6f1dba;
(3) rate-limiter fix adversarial test (cap, still-limits, evict-own-history bypass); (4) eviction lock hold time at cap;
(5) hygiene: $REPO working tree untouched by these commits, no stray worktrees; (6) branch topology + file-set disjointness.
Worktrees under /tmp/AGENT-D-*, port 8180-8189.


### `AGENT-C` — NOTE — AGENT-C starting: R4 test-suite verification
_2026-08-25T20:27:25Z_

Area: R4 commits 96d8fe1 (backend/tests/test_solar_physics_determinism.py) and 9c3fdc5
(src/sim/catalog.accuracy.test.ts, catalog.test.ts header, TESTING_NUMERICS.md).

Planned checks:
1. Runnability of catalog.accuracy.test.ts (+ R2's orbitMath.accuracy.test.ts): typecheck, import
   resolution, vitest API usage, module-scope throw risk; then actually run via vitest stub.
2. Do the 8 python determinism tests bite? Run against 7baa015 worktree; classify each failure
   strong (behavioural) vs weak (Import/AttributeError).
3. SF-6 tripwire numbers re-derived from my own Horizons fetch (CENTER=500@<parent>, ECLIPTIC,
   KM-S, VEC_CORR=NONE, TLIST=2451545.0). Plus judgement on assert-the-bug-exists practice.
4. Cross-branch: moon errors with R2 orbitMath vs sun-focus orbitMath; simulated-merge run.
5. Re-check orbitMath.accuracy.test.ts per-planet budgets on R2 branch at its 4 epochs.
6. TESTING_NUMERICS.md rule vs what shipped tests actually do.


### `AGENT-B` — NOTE — start: R3 Layer 2 (57ad971) + over-admission fix (5d0e4b7) in backend/server.py
_2026-08-25T20:27:58Z_

Plan (6 checks):
1. over-admission: staggered waves > timeout, measure PEAK concurrent computes vs `SOLAR_PHYSICS_CONCURRENT_REQUEST_LIMIT` on 7baa015+57ad971 vs a6f1dba.
2. semaphore release-exactly-once on success / 4xx / timeout / exception; capacity after mixed storm.
3. jd bound boundaries (min/max, +/-eps, NaN, inf, non-numeric, missing) + rejection-before-work.
4. measure cold compute per fidelity; justify 30 s; worst-case wait at limit=2.
5. payload diff 7baa015 vs a6f1dba, identical params.
6. 40 concurrent distinct-jd ultra + /health p95; idle baseline; 1-ultra baseline; ProcessPool viability.

Worktrees: /tmp/agentb-*, ports 8180-8189.


### `AGENT-A` — NOTE — AGENT-A starting: R3 Layer 1 PFSS cache key + single-flight (4cf940b)
_2026-08-25T20:28:09Z_

Plan (6 checks): (1) symbol existence in module; (2) real concurrency w/ genuine _compute, count computes via subclass; (3) lock-held-across-compute / follower-timeout inflight leak; (4) leader exception -> follower re-raise, no poisoning; (5) follower FALLBACK recompute storm w/ small max_entries; (6) 5% activity bucket physical defensibility (payload delta within one bucket).
Early read observation to test: `_compute` calls `synthetic_magnetogram(activity, jd)` with the RAW jd, but the cache key contains only `carrington_rotation_number(jd)`. If synthetic_magnetogram is jd-sensitive within a rotation, the key is still under-specified.


### `AGENT-C` — CONFIRMED — catalog.accuracy.test.ts is runnable and green (6/6); but Titan is dead fixture data
_2026-08-25T20:30:16Z_

**Runnability (check 1, part a).**
- `tsc --noEmit -p tsconfig.json` in a worktree at `a6f1dba`: 361 errors repo-wide (all pre-existing,
  in `src/frontend/**`), **0 in `src/sim/`**. Same on `6f385e1` (361 / 0). So neither accuracy test
  introduces a type error.
- Caveat: `node_modules/vitest` is **not installed** in this repo checkout (devDependency declared,
  bin absent — `.bin` has only esbuild/nanoid/rollup/tsc/tsserver/vite). `npm run typecheck` as
  shipped would report `Cannot find module 'vitest'` for every `*.test.ts` until someone installs.
  I supplied a stub `vitest` with an `index.d.ts` for the typecheck above. Environment artifact, not
  a defect in the tests.
- Module-scope `createSolarSystemCatalog()` does **not** throw: catalog builds, 434 bodies.
- **RAN it** (esbuild bundle + vitest stub): `TOTAL 6  PASS 6  FAIL 0`.

**Measured err/r at JD 2451545.0, elapsedDays=0, against the file's own committed fixture:**

| moon | err_km | r_km | err/r |
|---|---|---|---|
| Moon | 4,432.4 | 402,448.6 | **0.0110** |
| Io | 827,728.6 | 420,232.1 | 1.9697 |
| Europa | 1,309,361.1 | 664,878.2 | 1.9693 |
| Ganymede | 2,106,658.0 | 1,070,308.3 | 1.9683 |
| Callisto | 3,723,334.8 | 1,881,684.7 | 1.9787 |
| **Titan** | 560,718.7 | 1,255,510.7 | **0.4466** |
| Triton | 629,967.0 | 354,716.4 | 1.7760 |

**DEFECT (medium): Titan is in `HORIZONS_MOONS` but is asserted by NOTHING.** The control block
tests only `Moon`; `SF6_BROKEN` is `{Io,Europa,Ganymede,Callisto,Triton}`. Titan is a
converter-path moon and its err/r is **0.4466 — below the tripwire's `> 0.5`**. Had Titan been
included, the tripwire would fail *today*. So the 0.5 threshold is fitted to the five moons that
happen to clear it, and the one counter-example is silently carried in the fixture as dead data.
Also `Triton = 1.776`, not the "~1.97" the header claims.

Commands:
`cd /tmp/agentc-a6f1dba && $ESBUILD probe_c2.ts --bundle --platform=node --format=cjs --outfile=$OUT/c2.cjs && $NODE $OUT/c2.cjs`


### `AGENT-C` — CONFIRMED — catalog.accuracy.test.ts fixtures are genuine JPL Horizons, reproduced to <1 mm
_2026-08-25T20:31:11Z_

Independent fetch (my own, not the implementer's): `ssd.jpl.nasa.gov/api/horizons.api`,
`EPHEM_TYPE=VECTORS, CENTER='500@<parent>', REF_PLANE=ECLIPTIC, OUT_UNITS=KM-S, VEC_CORR=NONE,
TLIST=2451545.0, VEC_TABLE=2, CSV_FORMAT=YES`. Script: `$SP2/fetch_moons.py`, output
`$OUT/horizons_moons.json`.

Delta between my fetch and the committed `HORIZONS_MOONS` fixture:

| moon | |Δ| km | rel |
|---|---|---|
| Moon | 0.0005 | 1.3e-9 |
| Io | 0.0003 | 8.1e-10 |
| Europa | 0.0006 | 8.8e-10 |
| Ganymede | 0.0005 | 4.7e-10 |
| Callisto | 0.0006 | 3.3e-10 |
| Titan | 0.0006 | 5.0e-10 |
| Triton | 0.0005 | 1.4e-9 |

All seven fixture rows are correct to sub-millimetre (rounding only). The provenance comment is
accurate and the fixture is regenerable exactly as documented. **The oracle itself is sound** —
so the SF-6 tripwire numbers (Moon 1.1%, Galileans ~1.97 r, Triton 1.78 r) are real, and Titan's
0.447 r is real too.

Confirmed via catalog: `orbitFrameSource` = `ecliptic` for Moon; `laplace` for Io/Europa/Ganymede/
Callisto/**Titan**/Triton. Titan takes the same broken converter path as the tripwire moons and
still lands under 0.5 r.


### `AGENT-A` — CONFIRMED — checks 1-4: symbols OK, single-flight OK, no lock-across-compute, no inflight leak, exceptions clean
_2026-08-25T20:34:09Z_

Worktree `/tmp/agentA-a6f1dba` @ a6f1dba. No network in sandbox -> `fetch_gong_synoptic_map(2267)` returns None in 0.29s, so `_compute` takes the synthetic path (still the GENUINE `_compute`).

**Check 1 — symbols.** AST-walked `PFSSCache`; every free name resolves in the module.
`_clamp` OK, `carrington_rotation_number` OK, `OrderedDict` OK, `threading` OK, `DEFAULT_INFLIGHT_WAIT_S` OK, `CacheKey` OK.
`PFSSCache()` -> max_entries=12, inflight_wait_s=30.0, `_cache` is OrderedDict, `_inflight` {}.
Bucket edges (`round(a*20)`, banker's rounding): 0.474->9, 0.475->10, 0.500->10, 0.524->10, 0.525->10, 0.549->11.
NOTE for the squad: the task premise "0.50 and 0.549 are the same bucket" is WRONG — 0.549 is bucket 11. The true worst-case same-bucket pair is **0.475 vs 0.525**.

**Check 2 — REAL concurrency, genuine `_compute`, 8 threads, same key** (n_lines=40, lmax=9 = the "preview" preset from solar_physics.py:1088):
```
A same-key x8: computes=1 peak_parallel=1 wall=10.81s errors=0
A all identical object: True ; line_counts={40} ; max _lock wait during compute: 0.0002s
A inflight after: {} cache_size=1
A 9th caller -> same object, computes still 1
A activity 0.52 (same bucket as 0.50) -> same object, computes still 1
```
=> single-flight works, and the lock is NOT held across the 10.8 s compute (max observed acquire wait 0.2 ms).

**Check 4 — leader EXCEPTION** (6 threads, leader raises):
```
C computes=1 results=0 errors=6 ; all six got the SAME RuntimeError('boom-1') instance
C inflight after={} cache=[]
C retry -> succeeds, computes=2  => key NOT poisoned
```
REFUTED as a defect. Correct.

**Check 3 — follower timeout / leak** (leader 3.0 s, inflight_wait_s=0.3):
```
D computes=1 results=1 errors=3 TimeoutError('PFSS computation timed out waiting for in-flight result')
D inflight immediately after followers gave up: []   (leader still running -> entry still owned by leader, correct)
D inflight after leader finished: []  cache=[(2267,40,9,10)]
D retry works, computes still 1 (served from cache)
```
No deadlock, no leak. REFUTED as a defect.

Commands: `$PY $SP2/out/R34B/p1_symbols.py`, `$PY -u $SP2/out/R34B/p3_conc.py`, `$PY -u $SP2/out/R34B/p4_coord.py`


### `AGENT-A` — DEFECT — check 5: the follower FALLBACK is a real single-flight bypass; it recomputes AND never caches the result
_2026-08-25T20:34:33Z_

`pfss_magnetogram.py` (a6f1dba) lines ~1164-1170:
```python
with self._lock:
    cached = self._cache.get(key)
if cached is not None:
    return cached
# Leader finished but its entry was already evicted under contention;
# fall through and compute our own rather than fail.
return self._compute(key[0], activity, jd, n_lines, min(int(lmax), 15), gong_timeout_s)
```
Two problems: (a) every follower that finds the entry gone runs a FULL compute — the fan-out single-flight exists to stop; (b) that fallback result is **never inserted into `_cache`**, so the storm does not even warm the cache and the next wave repeats it.

**E1 — forced eviction inside the real publish -> follower-recheck window** (I made `_inflight.pop`, which runs in the leader's `finally` under `_lock`, also drop the key from `_cache`; that is exactly the window another key's insert occupies):
```
E1 computes=9   (single-flight would be 1) results=9 errors=0
E1 distinct payload objects=9 ; seqs=[1..9]
E1 cache after=[]            <-- 9 computes, cache still empty
```

**E2 — NATURAL race, no instrumentation**, `PFSSCache(max_entries=1)`, 2 hot keys x 8 real threads, 8 rounds:
```
E2 total computes=38   ideal=16   amplification=2.38x
```
So the bypass fires without any forcing as soon as eviction pressure exists.

Reachability at the SHIPPED default `max_entries=12`: the key is (cr, n_lines, effective_lmax, activity_bucket) and `cr = carrington_rotation_number(jd)` — a caller that steps `jd` by 27.3 days mints an unlimited number of distinct keys, so >12 hot keys is trivially attacker-controlled. R3's stated threat model is exactly "a client that varies jd". Measuring at max_entries=12 next.

Repro: `$PY -u $SP2/out/R34B/p4_coord.py` (sections E1/E2).
Suggested fix: on the fallback path, re-enter `get_or_compute` (bounded retry) instead of calling `_compute` directly, or publish the fallback result into `_cache` under the lock.


### `AGENT-A` — DEFECT (low) — leader killed by BaseException leaves holder empty; every follower then recomputes
_2026-08-25T20:34:33Z_

`except Exception` does not catch BaseException (KeyboardInterrupt / SystemExit / GeneratorExit), so `holder` is never filled, but `finally` still pops `_inflight` and calls `event.set()`. Followers wake, `if holder and "error" in holder[0]` is False (holder is empty), cache lookup misses, and each drops into the fallback `_compute`.
```
D2 leader raises KeyboardInterrupt, 5 threads: computes=5 (1 leader + 4 follower fallbacks)
D2 distinct follower payloads: [2,3,4,5]   (4 independent computes)
D2 cache=[] inflight=[]  errors=1 (only the leader)
```
Not a leak or a deadlock, and unlikely under uvicorn's `run_in_executor` (cancellation does not inject into the worker thread), so severity low — but it is a second path into the same un-single-flighted fallback.
Repro: `$PY -u $SP2/out/R34B/p4_coord.py` section D2.


### `AGENT-A` — DEFECT — check 2b: with 3 concurrent DISTINCT keys, single-flight held (3 computes) but 6 of 9 callers got TimeoutError; PFSS compute is GIL-bound and does NOT parallelise
_2026-08-25T20:36:23Z_

Test B: 3 distinct keys (preview 40/9, operational 80/12, and activity bucket 18) x 3 threads each, GENUINE `_compute`, default `inflight_wait_s=30.0`:
```
B 3keys x3: computes=3 (expect 3)  peak_parallel=3  wall=111.70s  errors=6  max_lock_wait=0.0008s
   -> the 6 errors are all the FOLLOWERS: TimeoutError at inflight_wait_s=30 s
```
Single-flight itself is correct (3 keys -> 3 computes, no lock held across compute). The failure is the **tuning**: one compute alone is 10.81 s (measured, preview 40/9), but 3 running concurrently took 111.7 s wall -> ~37 s each, i.e. **~3.4x, essentially perfect GIL serialisation**. `trace_field_lines` / `compute_wsa_velocity_map` are Python-level loops, so extra threads buy nothing and multiply latency. Box has 32 cores, so this is not a starved machine.

Consequences (both defaults are 30 s):
* `DEFAULT_INFLIGHT_WAIT_S = 30.0` (pfss_magnetogram.py) and `SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS = 30.0` (server.py:153) are **equal**, so a follower that waits the full window is always beaten by the endpoint's own `wait_for` -> the client sees 503, and the follower's TimeoutError is dead code in the HTTP path.
* Worse, per 5d0e4b7 the semaphore permit is released only when the WORK finishes. A follower parked on `event.wait(30)` holds an executor thread AND a permit for the full 30 s. `SOLAR_PHYSICS_CONCURRENT_REQUEST_LIMIT = 2` and `ThreadPoolExecutor(max_workers=2)`, so **two parked followers shed every other solar request with 503 for 30 s** while only one CPU-bound compute is actually running.
* server.py:147-151 asserts "a cold ultra-fidelity compute legitimately takes ~5 s (measured)". My cold **preview** (the CHEAPEST preset, 40 lines / lmax 9) is 10.81 s. Timing all four presets now.

Repro: `$PY -u $SP2/out/R34B/p3_conc.py`, section B; per-fidelity cold timings in `$SP2/out/R34B/p5.log`.


### `AGENT-B` — DEFECT — cold compute is 4-14x slower than the comment claims; 30 s timeout fails LEGITIMATE default-fidelity requests
_2026-08-25T20:36:36Z_

Machine: 32 cores, 93 GB. Worktree `/tmp/agentb-a6f1dba` @ a6f1dba.

`backend/server.py` comment on `SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS` claims:
> "a cold ultra-fidelity compute legitimately takes ~5 s (measured) ... this timeout ... sits well above the worst legitimate compute."

Measured directly, **single-threaded, no server, no contention**
(`server._build_solar_physics_state(jd, fid, 220, "synthetic", False, False)`, distinct jd = cold cache):

| fidelity | cold #1 | warm (same jd) | cold #2 |
|---|---|---|---|
| preview | **7.325 s** | 0.071 s | 8.523 s |
| operational (ENDPOINT DEFAULT) | **22.243 s** | 0.142 s | 22.741 s |
| high | (running, >30 s) | | |
| ultra | (running) | | |

Repro:
```
$PY - <<'P'
import sys,os,time
sys.path.insert(0,'/tmp/agentb-a6f1dba/backend'); os.chdir('/tmp/agentb-a6f1dba/backend')
import server
t=time.perf_counter(); server._build_solar_physics_state(2461822.5,"operational",220,"synthetic",False,False)
print(time.perf_counter()-t)
P
```

Consequence, measured over HTTP on port 8180 (limit=2, timeout=30 s):
```
preview  cold#0 200  7.861s
preview  cold#1 200  8.472s
operational cold#0 503 30.041s   <-- TIMED OUT: default params, single legit caller
operational cold#1 503  0.053s   <-- and then everything cascades to "saturated"
high     cold#0 503  0.055s
ultra    cold#0 503  0.078s
```
The 30 s "backstop for a genuine hang" is *below* the normal cost of the endpoint's own default
fidelity as soon as two computes share the CPU (they are GIL-serialised in one process — see the
concurrency entry). Because the permit is now correctly held until the abandoned compute finishes,
one such timeout takes the whole endpoint offline (503 "saturated") for the remainder of that
compute. Net effect on a legitimate user: 30 s wait, then 503, then a further ~20 s of 503s.


### `AGENT-A` — DEFECT (high) — SF-4 is NOT fixed: the key omits jd, and the jd error is 4.5x LARGER than the activity error the fix bothered to bucket
_2026-08-25T20:38:45Z_

`_key` = `(carrington_rotation_number(jd), n_lines, min(lmax,15), round(clamp(activity)*20))` — no jd term. But `_compute` passes the **raw jd** to `synthetic_magnetogram(activity, jd)`, whose active regions are seeded by
```python
rng = np.random.RandomState(int(jd * 100) % 99991)   # pfss_magnetogram.py:238
```
so a **0.01-day (14.4 min)** jd change completely re-randomises the active-region field, while the cache key is unchanged.

**Magnitude (`$PY $SP2/out/R34B/p5_phys.py`), jd inside CR 2267, activity 0.5, preview 40/9:**
```
relRMS(Br)  JD0 vs JD0+13.0d  : 1.0200   maxdiff 65.41 G
relRMS(Br)  JD0 vs JD0+0.01d  : 1.0575   maxdiff 58.20 G   <- 14 minutes of jd
key(JD0) = key(JD0+0.01d) = key(JD0+13.0d) = (2267, 40, 9, 10)
```
relRMS > 1 means the two maps are as different as the signal itself. Compare the error the fix DID choose to tolerate — one 5% activity bucket, worst-case pair 0.475 vs 0.525 (`round()` is banker's, so bucket 10 = [0.475, 0.525]):
```
relRMS(Br)  a=0.475 vs 0.525  : 0.2299   maxdiff 23.20 G   relRMS(g_lm)=0.1695, g10 -1.3%
```
**The untracked jd error (1.02-1.06) is ~4.5x the deliberately-tolerated activity error (0.23).** Bucketing activity to 5% while leaving jd out of the key is not internally consistent.

**Full-payload effect (independent computes, preview 40/9):**
```
a=0.475 JD0      open=12 closed=28 wsa_mean=477.30
a=0.525 JD0      open=13 closed=27 wsa_mean=465.10   same-bucket delta: open +1, wsa -12.20 km/s (-2.56%)
a=0.500 JD0      open=12 closed=28 wsa_mean=470.00
a=0.500 JD0+13d  open=16 closed=24 wsa_mean=460.90   SAME-KEY delta:   open +4 (+33%), wsa -9.10 km/s (-1.94%)
```

**The commit's own headline claim is falsified** (`$PY $SP2/out/R34B/p6_sf4.py`):
```
order1: request(jd=JD0) alone                              -> open=12 wsa=470.00 cr=2267
order2: request(jd=JD0+13d) then IDENTICAL request(jd=JD0) -> open=16 wsa=460.90 cr=2267
        the second call is served the OTHER jd's object: True
both responses report carrington_rotation=2267, so a client cannot detect the substitution
```
That is exactly SF-4 ("identical requests could return different payloads depending on call order"), still present. The commit message's "an entry is reused only for a genuinely identical request" is **false**: 2727 distinct 0.01-d jd seeds share one key.

Second-order: `sample_state` computes the Parker spiral from the CACHED `_wsa_result` while every other field of the response is computed for the requested jd, so one response mixes PFSS/WSA for jd=Y with everything else for jd=X.

DoS side of R3 is only partly closed: the jd bound (+/-200 yr) still leaves `int(2*73050/27.2753) = 5356` distinct cache keys per (fidelity, bucket), x4 fidelities = ~21k full computes an unauthenticated client can steer, against `max_entries=12`.

Fix: put a quantised jd in the key (e.g. `int(jd*100)` to match the seed, or quantise the jd handed to `_compute` so key and payload agree), or make `synthetic_magnetogram` seed off `cr` instead of `jd`.


### `AGENT-C` — DEFECT (high) — the SF-4 determinism tests do NOT bite: 0 of 8 fail for a behavioural reason on pre-R3
_2026-08-25T20:38:50Z_

**Check 2. `backend/tests/test_solar_physics_determinism.py` run against a worktree at `7baa015`
(pre-R3).** File docstring: *"Each assertion below fails against that pre-R3 behaviour."* That is
**false**.

`cd /tmp/agentc-7baa015/backend && $PY -m pytest tests/test_solar_physics_determinism.py -v`
→ **6 failed, 2 passed in 14.42s** (on `a6f1dba`: **8 passed in 70.45s**).

| test | pre-R3 | why | strength |
|---|---|---|---|
| identical_requests_are_byte_identical | **PASS** | doesn't exercise SF-4 at all | **does not bite** |
| different_fidelity_yields_a_different_payload | **PASS** | non-PFSS payload differs regardless | **does not bite** |
| jd_outside_the_validity_window | FAIL | `AttributeError: server.SOLAR_PHYSICS_JD_MAX` | weak |
| jd_inside_the_window | FAIL | `AttributeError: server.J2000_JD` | weak |
| oversized_max_features_413 | FAIL | `AttributeError: server.SOLAR_PHYSICS_MAX_FEATURES` | weak |
| saturation_sheds_load_503 | FAIL | `AttributeError: server._solar_physics_concurrent_guard` | weak |
| concurrency_permit_held | FAIL | `assert "add_done_callback" in inspect.getsource(...)` — a **source-text grep**; its behavioural half builds its *own* `BoundedSemaphore`+`ThreadPoolExecutor` and never touches `server` | weak |
| rate_limiter_identity_map_bounded | FAIL | `AttributeError: server._solar_physics_rate_locks` | weak |

**0 of 8 fail for a genuine behavioural reason.** Six are name-existence probes (an
`AttributeError` fires before the assertion is even reached — the same red would appear from a
typo'd constant name), and the two that *do* run real behaviour are the two that PASS on the
unfixed code. The commit message's "four of the six fail against pre-R3 code, so they are
red-tested" is technically true and substantively empty.

**And SF-4 is genuinely reproducible pre-R3 — the test just doesn't look for it.**
`$SP2/sf4_order.py` (cross-process) and `$SP2/sf4_inproc.py` (in-process, clears
`server.SOLAR_PHYSICS_MODEL._pfss_cache`), sha256[:16] of the payload minus `wall_epoch_jd`,
jd=2461000.5, forcing=synthetic:

```
7baa015  order "high,operational" ->  high=3171417a  operational=83f7185a
7baa015  order "operational,high" ->  operational=808de19c  high=4d0864c6
7baa015  repeat of order B        ->  808de19c / 4d0864c6      (process itself IS deterministic)
a6f1dba  order "high,operational" ->  high=3171417a  operational=808de19c
a6f1dba  order "operational,high" ->  operational=808de19c  high=3171417a
```
Call order is the *only* variable. Pre-R3, `high` returns `3171417a` or `4d0864c6` depending on
what was asked first; post-R3 both orders agree. The R3 Layer-1 fix is real. The test is not.

One-line-different assertion that DOES catch it (`sf4_inproc.py`):
```
clear(); pay("operational"); h1 = pay("high")
clear();                     h2 = pay("high")
assert h1 == h2
```
```
7baa015 : SHIPPED-STYLE (identical repeats)  PASS      <-- misses the bug
7baa015 : ORDER-INDEPENDENT                  FAIL      <-- catches it
a6f1dba : both                               PASS
```

**Recommendation:** replace `test_identical_requests_are_byte_identical` with the
order-independence form above, and replace the four `server.<CONST>` AttributeError probes with
assertions that survive the constant being renamed (e.g. request-level: `jd=1e12 -> 400`,
`max_features=10**6 -> 413`) so a red is behavioural rather than a spelling check.


### `AGENT-D` — CONFIRMED — tsc 344 -> 345, the +1 is the new vitest test file
_2026-08-25T20:40:09Z_

`cd /tmp/AGENT-D-<rev> && $NODE $REPO/node_modules/typescript/lib/tsc.js --noEmit | grep -c 'error TS'`
(note: `node_modules/.bin/tsc` is unusable here — shebang `env node` and node is not on PATH; must invoke lib/tsc.js with $NODE)

| rev | errors |
|---|---|
| 7baa015 | 344 |
| a6f1dba | 345 |

Set-diff of the sorted error lines — exactly one net new error, and one line moved:
- NEW: `src/sim/catalog.accuracy.test.ts(30,38): error TS2307: Cannot find module 'vitest' or its corresponding type declarations.`
- moved: `src/sim/catalog.test.ts(1,38)` -> `(10,38)` (the added file header pushed the import down 9 lines; same error, same file)

No other error appears or disappears. Claim is exact. Caveat: `vitest` is not installed in this repo at all
(9 pre-existing TS2307 'vitest' errors already), so the new test file *cannot* be executed by the normal
toolchain — the +1 is not a type defect but it does mean R4's new tests are unrun in CI-as-configured.


### `AGENT-B` — CONFIRMED — over-admission fix (5d0e4b7) holds: peak 10-vs-2 before, 2-vs-2 after
_2026-08-25T20:40:36Z_

Method: staggered waves of 2 concurrent `/solar/physics?fidelity=preview` with **distinct jd** (cold PFSS,
~7-8 s each) against a server configured `SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS=2`,
`SOLAR_PHYSICS_CONCURRENT_REQUEST_LIMIT=2`, rate limit raised out of the way. New wave every 2.2 s, i.e.
every wave lands just after the previous one has timed out. Peak concurrency measured by wrapping
`server._build_solar_physics_state` with an enter/exit counter (`/dbg/stats`), NOT by inference.

**PRE-FIX — 57ad971** (`asyncio.to_thread` + `finally: release()`), port 8181:
```
after wave 0: cur=2  peak=2   sem=2
after wave 1: cur=4  peak=4   sem=2
after wave 2: cur=6  peak=6   sem=2
after wave 3: cur=8  peak=8   sem=2
after wave 4: cur=10 peak=10  sem=2      <-- 5x the limit, and still climbing
FINAL codes {503: 10}  starts=10 finishes=0 threads=12 executor_max=None
```
Over-admission is *worse* than the implementer's reported 6-vs-2: it is unbounded in the number of
waves (each timeout frees a permit while the thread keeps running on the shared anyio pool).

**POST-FIX — a6f1dba** (dedicated `ThreadPoolExecutor(max_workers=2)` + `shield` + release from
`add_done_callback`), port 8182, identical driver:
```
after wave 0..4: cur=2 peak=2 sem=0   (every wave)
FINAL codes {503: 10}  starts=2 finishes=0 threads=4 executor_max=2
```
Peak concurrent computes = 2 = limit. **The headline claim reproduces exactly.** Note the bound is
belt-and-braces: even if the permit leaked, `max_workers=2` on the dedicated executor would cap
running computes at 2 (extra submissions would queue).

Repro:
```
SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS=2 SOLAR_PHYSICS_CONCURRENT_REQUEST_LIMIT=2 \
SOLAR_PHYSICS_RATE_LIMIT_PER_WINDOW=100000 BACKEND_DIR=<wt>/backend PORT=818x $PY $OUT/launch.py
$PY $OUT/waves.py http://127.0.0.1:818x 5 2 2.2 preview
```


### `AGENT-B` — DEFECT — ultra fidelity can NEVER succeed: cold ultra = 49-55 s vs a 30 s timeout
_2026-08-25T20:40:36Z_

Single-threaded, in-process, no server, distinct jd (cold PFSS cache):

| fidelity | cold #1 | cold #2 | warm (same jd) |
|---|---|---|---|
| preview | 7.325 s | 8.523 s | 0.071 s |
| operational (endpoint default) | 22.243 s | 22.741 s | 0.142 s |
| high | 19.085 s | 22.990 s | 0.047 s |
| **ultra** | **54.714 s** | **48.822 s** | 0.126 s |

`SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS` default = 30 s. So:
- **ultra**: every cold request 503s at 30 s, 100% of the time, then holds its permit for a further
  ~20-25 s while the abandoned compute runs to completion. The endpoint advertises `ultra` in its
  `fidelity` enum and returns 400 listing it as valid, but it is unreachable.
- **operational** (the default when the caller passes nothing) and **high** are at 19-23 s cold, i.e.
  inside 30 s only while a single compute has the CPU to itself. With the limit at 2 the two computes
  are GIL-serialised (see the p95 entry), which pushes them past 30 s — reproduced over HTTP:
  `operational cold#0 -> 503 in 30.041 s` while one other preview compute was running.

The source comment justifying 30 s says "a cold ultra-fidelity compute legitimately takes ~5 s
(measured)" and "sits well above the worst legitimate compute". Measured here it is ~10x off, and the
timeout sits *below* the worst legitimate compute. Whatever was measured was a warm-cache run
(0.05-0.15 s) or a much cheaper machine profile.

Suggested: derive the default from the fidelity actually requested (e.g. preview 15 s / operational 45 s
/ high 45 s / ultra 120 s), or move PFSS off the request path entirely (see the p95 entry).


### `AGENT-D` — DEFECT — rate-limiter eviction IS a bypass, and it runs on the event loop (515x lock-hold amplification)
_2026-08-25T20:41:57Z_

Probe: `/tmp/.../out/R34B/AGENT-D/rl_probe.py` — imports `/tmp/AGENT-D-a6f1dba/backend/server.py` and calls
`_enforce_solar_request_rate_limit()` with a fake Request. Defaults: CAP=4096, 36 req / 60 s window.

**(a) bounded — CONFIRMED.** 12288 distinct spoofed `X-Forwarded-For` -> `len(map)=4096` (== cap), 4096 total
deque entries. No unbounded growth. Elapsed 18.5 s for 12288 calls = 1.5 ms/call.

**(b) still limits a genuine repeat caller — CONFIRMED.** 42 calls from one identity -> 36x200, 6x429, first 429
on call #37. Correct.

**(c) EVICTION IS A WORKING BYPASS — DEFECT.** Exhaust identity V (36 -> next call 429), then spoof distinct
XFFs until V is evicted: **exactly 4096 spoofed requests** evicts V (V is LRU). Next call as V -> **200**, and V
gets a **full fresh 36 admissions**. So the per-identity limit is defeated at a cost of 4096 requests per 36
extra admissions. Two things make that cost near-zero for a real attacker:
  - the rate check runs BEFORE the concurrency semaphore (server.py:656 vs :708), so the 4096 spoof requests
    are answered with a fast 503/200 and still get recorded -> they are cheap;
  - the same 4096 requests evict **every other identity too**, i.e. one attacker can flush the limiter for the
    whole server, not just for themselves.
  - and the attacker never needed the bypass anyway: spoofing a fresh XFF per request already gives unlimited
    admissions, since `_client_identity()` trusts `X-Forwarded-For` with no trusted-proxy allow-list.

**(extra) X-API-Key also mints identities.** With `SOLAR_PHYSICS_API_KEYS` unset (the default),
`_require_optional_solar_api_key` returns early but `identity = _extract_solar_api_key(...) or ...` still uses the
header verbatim: 50 requests from ONE source IP with junk `X-API-Key` -> `len(map)=50`, 50 separate quotas.

**(4) EVICTION LATENCY — DEFECT, and it is on the event loop.** At cap, every admitted new identity re-runs a
full-map stale scan + `sorted()` of 4096 items while holding the single global `threading.Lock`:
  mean **2.53 ms**, p50 1.49 ms, p95 4.68 ms, max **100.3 ms**  (n=300)
  below cap (64 entries): mean 0.0049 ms, max 0.27 ms  -> **~515x amplification**
Critically, 57ad971 changed the endpoint from `def solar_physics_state(...)` (7baa015:457, ran in the anyio
threadpool) to **`async def`** (a6f1dba:646) and calls `_enforce_solar_request_rate_limit(request)` inline at
:656. So this blocking lock + O(n log n) sort executes **on the asyncio event loop**, stalling every route in the
process (/health included) for 2.5 ms typical / 100 ms worst per attacker request, at ~zero attacker cost. That
is the exact failure mode R3 Layer 2 says it exists to prevent, reintroduced by the mitigation.


### `AGENT-B` — DEFECT — permanent permit LEAK when run_in_executor raises synchronously (no try around submit)
_2026-08-25T20:42:43Z_

`backend/server.py` @ a6f1dba, `solar_physics_state`:
```python
if not _acquire_nonblocking(_solar_physics_concurrent_guard):
    raise HTTPException(503, ...)
loop = asyncio.get_running_loop()
future = loop.run_in_executor(_solar_physics_executor, _build_solar_physics_state, ...)   # <-- unguarded
future.add_done_callback(lambda _: _solar_physics_concurrent_guard.release())
```
The permit is taken, then `run_in_executor` is called with **no try/except**. `run_in_executor` calls
`ThreadPoolExecutor.submit`, which raises `RuntimeError` on executor/interpreter shutdown and — via
`_adjust_thread_count` -> `threading.Thread.start()` — `RuntimeError: can't start new thread` under a
thread/pid/memory limit (cgroup `pids.max`, RLIMIT_NPROC, low memory). If it raises, `add_done_callback`
is never reached and **the permit is never released**.

Measured (one-shot `submit` fault injected via `/dbg/breaksubmit`):
```
-> 500  sem=1/2 cur=0        <-- BoundedSemaphore permanently down one permit
follow-up: 200               <-- still serving, but on 1 permit instead of 2
final: {'sem_value': 1, 'sem_initial': 2, 'cur': 0, 'starts': 5, 'finishes': 5}
```
`starts == finishes` proves no compute is holding it: the permit is lost, not held. After
`SOLAR_PHYSICS_CONCURRENT_REQUEST_LIMIT` such events (default 2) the endpoint returns 503
"temporarily saturated" **forever**, until the process restarts. This is a latching failure, which is
worse than the transient one the fix replaced.

Fix:
```python
try:
    future = loop.run_in_executor(...)
except BaseException:
    _solar_physics_concurrent_guard.release()
    raise
future.add_done_callback(...)
```
(or acquire inside a `contextlib.ExitStack` whose release is only dismissed once the callback is attached).


### `AGENT-B` — CONFIRMED — semaphore released exactly once on every NORMAL path; no double release
_2026-08-25T20:42:43Z_

Server: a6f1dba on 8182, `SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS=3`, limit=2. `sem_value` read from the
live `threading.BoundedSemaphore` via a debug route; `cur` = live count of computes inside
`_build_solar_physics_state`.

```
success(warm)          -> 200   sem=2/2 cur=0
400 jd-out-of-range    -> 400   sem=2/2 cur=0
400 jd-nan             -> 400   sem=2/2 cur=0
422 jd-nonnumeric      -> 422   sem=2/2 cur=0
413 max_features       -> 413   sem=2/2 cur=0
400 bad fidelity       -> 400   sem=2/2 cur=0
400 bad forcing        -> 400   sem=2/2 cur=0
500 compute-raises     -> 500   sem=2/2 cur=0     (RuntimeError injected inside the worker)
timeout   : 503 at 3 s, sem=1 cur=1 immediately after -> drained to sem=2 cur=0 after 5.3 s
disconnect: client abort at 1 s, sem=1 cur=1       -> drained to sem=2 cur=0 after 7.5 s
```
No `ValueError: Semaphore released too many times` anywhere in the server log across all runs
(incl. the 5-wave storms), so no double-release path exists. The two "sem=1 cur=1" rows are the fix
working as designed: the permit stays with the abandoned compute rather than being handed to the next
caller.

The one path that does NOT release is the synchronous `run_in_executor` failure — logged separately.


### `AGENT-D` — CONFIRMED — pytest 80 / 94 / 102, same single pre-existing unrelated failure
_2026-08-25T20:42:55Z_

`cd /tmp/AGENT-D-<rev> && $SP2/venv/bin/python -m pytest -q`

| rev | result | wall |
|---|---|---|
| fd793f4 | **1 failed, 80 passed**, 2 warnings | 175.4 s |
| 7baa015 | **1 failed, 94 passed**, 2 warnings | 185.8 s |
| a6f1dba | **1 failed, 102 passed**, 2 warnings | 245.5 s |

All three claimed numbers are exact. Deltas: +14 (R1 Kuiper), +8 (R4 item 6, test_solar_physics_determinism.py — 8 tests).

The single failure is identical at all three revs:
`backend/tests/test_sim_registry.py::test_rebound_engine_exports_self_describing_barycentric_states`
`backend/sim/rebound_nbody.py:91: AttributeError: 'Simulation' object has no attribute 'ri_ias15'`
i.e. an installed-REBOUND API-version mismatch. `git diff --name-only fd793f4 a6f1dba | grep rebound` -> **no
match**: `backend/sim/rebound_nbody.py` is untouched by any of the 6 commits. Unrelated — CONFIRMED.

Changed-file sets: 7baa015..a6f1dba touches server.py, sim/pfss_magnetogram.py, sim/solar_physics.py,
tests/test_solar_physics_determinism.py, src/sim/{TESTING_NUMERICS.md,catalog.accuracy.test.ts,catalog.test.ts}
(7 files, +649/-43).

Caveat worth flagging: the 8 new Python tests run, but the 2 new/edited **TypeScript** test files
(catalog.accuracy.test.ts, catalog.test.ts) cannot run — `vitest` is not installed in this repo and no
`test` script exists that would run them. "+8 tests" is Python only; R4 item 2's TS assertions are unexecuted.


### `AGENT-C` — DEFECT (medium) — orbitMath.accuracy.test.ts budgets are fitted to its 4 epochs, NOT '1.6x the worst over 1800-2150'
_2026-08-25T20:44:53Z_

**Check 5.** `orbitMath.accuracy.test.ts` on `6f385e1`: **RAN it — TOTAL 37 PASS 37 FAIL 0**
(`cd /tmp/agentc-6f385e1 && $ESBUILD probe_c4.ts --bundle ... && $NODE $OUT/c4.cjs`).
Fixtures verified against **my own** Horizons fetch (`CENTER='500@10'`, ECLIPTIC, AU-D, VEC_CORR=NONE,
`$SP2/fetch_planets.py`): max fixture-vs-my-fetch delta **0.115 km** across all 32 entries — i.e. pure
9-decimal-AU rounding. Oracle is genuine.

Measured error at the file's 4 epochs (km), and headroom to the per-planet budget:

| | 1900 | J2000 | 2026* | 2100 | worst/4 | budget | headroom |
|---|---|---|---|---|---|---|---|
| mercury | 1,393 | 1,030 | 2,352 | 2,251 | 2,352 | 10,000 | 4.25x |
| venus | 6,907 | 8,112 | 2,284 | 11,347 | 11,347 | 20,000 | 1.76x |
| earth | 4,490 | 6,792 | 12,218 | 3,501 | 12,218 | 20,000 | 1.64x |
| mars | 23,208 | 8,193 | 44,247 | 39,288 | 44,247 | 120,000 | 2.71x |
| jupiter | 335,134 | 1,149,805 | 443,308 | 541,725 | 1,149,805 | 1,840,000 | 1.60x |
| saturn | 4,395,661 | 3,848,012 | 1,823,074 | 6,202,260 | 6,202,260 | 9,930,000 | 1.60x |
| uranus | 1,221,130 | 1,077,458 | 845,165 | 1,934,721 | 1,934,721 | 13,080,000 | 6.76x |
| neptune | 1,042,409 | 1,099,284 | 721,260 | 1,852,973 | 1,852,973 | 4,670,000 | 2.52x |
| **total** | 7.03e6 | 7.20e6 | 3.89e6 | 10.59e6 | 10.59e6 | 16.0e6 | 1.51x |

**The file's stated basis is false.** It says the ceilings are *"~1.6x the worst error the corrected
propagator produces over 1800-2150"*. I fetched 15 epochs across that span (`$SP2/fetch_span.py`,
`$SP2/fetch_dense.py`) and ran the same `errorKm`:

```
1800  7.18e6 | 1850 5.44e6 | 1950 1.30e6 | 2000 7.20e6 | 2050 5.90e6 | 2075 7.47e6
2105  8.55e6 | 2110 9.80e6 | 2115 9.30e6 | 2120 15.33e6
2125 22.16e6  TOTAL-OVER  jupiter=2,061,526 (1.12x budget)  saturn=10,313,014 (1.04x)
2130 20.15e6  TOTAL-OVER  saturn=10,312,xxx (1.04x)
2135 19.33e6  TOTAL-OVER
2140 16.74e6  TOTAL-OVER
2150 14.44e6
```
Worst-over-1800-2150 vs budget: jupiter **0.89x**, saturn **0.96x**, total **0.72x**
(22.16e6 vs `MAX_TOTAL_ERROR_KM` 16e6). Only uranus (1.60) and neptune (1.60) actually match the
claimed 1.6x; mercury is 3.23x, venus 2.06x.

So the budgets were fitted to the **four epochs in the file**, all of which happen to sit below the
2120-2140 hump. The suite is green only because of epoch selection. That is a milder recurrence of
the very trap this file's header describes ("An earlier revision of this file checked a single date
and was later shown to have been calibrated to it"), and it falsifies `TESTING_NUMERICS.md`'s
"Multiple epochs ... Accuracy tests sweep several epochs" as a *sufficient* safeguard here — four
epochs across 200 y do not cover the error distribution.

Not a correctness bug in the propagator; a documentation/coverage defect: either widen the epoch
list (add ~2125) and raise the ceilings to honest values, or delete the "1800-2150" claim.


### `AGENT-A` — DEFECT (critical) — R3 does NOT close the DoS: 2 unauthenticated requests deny /solar/physics for 70.6 s, cached requests included
_2026-08-25T20:46:14Z_

End-to-end against a REAL uvicorn on 127.0.0.1:8177 from worktree `/tmp/agentA-a6f1dba/backend`, shipped defaults (limit=2, timeout=30 s, rate 36/60 s). No network here, so `_compute` takes the synthetic path — which is the shipped fallback whenever GONG is down.

**Measured cold latency per shipped preset** (`$PY $SP2/out/R34B/p5_phys.py`, then confirmed over HTTP):
```
preset       n_lines lmax   direct _compute    full GET /solar/physics
preview        40      9        5.67 s               8.21 s   200
operational    80     12       16.37 s              15.62 s   200
high          120     15       36.21 s              20.35 s   200
ultra         180     15       43.04 s              23.18 s   200
```
server.py:147-151 claims "a cold ultra-fidelity compute legitimately takes ~5 s (measured)". Measured **23.2 s over HTTP, 43.0 s direct** — 4.6x-8.6x the stated figure, on an idle 32-core box, and 77% of the 30 s timeout with no headroom.

**T1 — 2 concurrent cold `fidelity=ultra`, distinct jd** (`$PY $SP2/out/R34B/p7_http.py`):
```
('A', 503, 30.72, 'Solar physics generation timed out. Try again later.')
('B', 503, 30.71, 'Solar physics generation timed out. Try again later.')
```
Both exceed 30 s because the two computes GIL-serialise (pure-Python `trace_field_lines` / `compute_wsa_velocity_map`); the executor's 2 threads buy no parallelism, only 2x latency.

**T2 — the abandoned computes keep their permits** (5d0e4b7 releases on work completion, not on timeout), so everything else is shed instantly, *including a request whose key is already cached and costs nothing*:
```
('C-cachedkey', 503, 0.01, 'Solar physics requests are temporarily saturated. Retry shortly.')
('A2', 503, 0.02, ...saturated...)   ('B2', 503, 0.02, ...saturated...)
```
**T3 — same-key requests are shed too**, so single-flight never even gets a chance.

**Lockout duration** (`$PY $SP2/out/R34B/p8_lock.py`): baseline cached preview = 200; then
```
2 unauth `fidelity=ultra` requests -> CACHED preview request shed with 503 for 70.6 s (33 consecutive 503s)
attacker requests returned: [503, 503]   total 70.6 s
```
At `SOLAR_PHYSICS_RATE_LIMIT_PER_WINDOW=36` per 60 s, 2 requests/minute sustains this indefinitely from one IP. The R3 objective ("a client that varies jd is an unauthenticated compute amplifier") is therefore **not met**: the amplifier is now a 100%-availability-loss lever, and it is cheaper than before because a single request self-inflicts the timeout.

Root cause is a tuning contradiction, not the single-flight logic: `SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS=30` and `DEFAULT_INFLIGHT_WAIT_S=30` were both set from a "~5 s" figure that is wrong by ~5x, while `max_workers=2` on GIL-bound work makes the real worst case ~2x the single-request cost.
Minimum fixes: (a) re-measure and raise the timeout above 2x cold-ultra, or (b) serialise PFSS work (`max_workers=1`) so latency is not multiplied, or (c) cap `n_lines`/`lmax` so cold ultra fits the budget, and (d) release the permit on timeout only if the compute is also abandoned. `DEFAULT_INFLIGHT_WAIT_S` must be strictly less than the endpoint timeout, not equal to it.


### `AGENT-D` — NOTE — correction: eviction latency is real in-process but NOT visible end-to-end (my earlier DoS framing downgraded)
_2026-08-25T20:46:31Z_

Live check on a real uvicorn (my own, port 8181/8182, `/tmp/AGENT-D-a6f1dba/backend`). Saturate both permits with
two `fidelity=ultra` computes, then 300 sequential `/solar/physics?fidelity=preview` with distinct spoofed XFF and
time the (fast) 503 path — that path is essentially rate-limiter + validation + failed semaphore acquire.

| map state | 503-path latency ms (n=300) |
|---|---|
| primed to cap (~4096 ids) | p50 18.25, p95 26.54, max 32.21, **mean 17.73** |
| fresh server (<cap) | p50 18.85, p95 26.13, max 31.13, **mean 18.43** |

**No measurable end-to-end penalty** — the 2.5 ms in-process lock hold is buried under ~18 ms of loopback+ASGI
overhead on this box. So my earlier "event-loop DoS amplification" wording is too strong and I withdraw it as a
severity claim. What remains factual and worth fixing:
- the eviction is O(n log n) **per admitted request** while at cap (a full `sorted()` of 4096 items), not amortized;
- it runs under a process-global `threading.Lock` **on the asyncio event loop** (endpoint became `async def` in
  57ad971; at 7baa015 it was a plain `def` running in the anyio threadpool) — so its cost is serialised against
  every other route, and it scales with the cap, which is env-tunable up to any value.
Severity: low-to-medium (design smell / latent scaling hazard), not a demonstrated outage.
The **(c) bypass finding is unaffected and stands.**


### `AGENT-A` — NOTE — honest calibration of the fallback-storm defect at the SHIPPED default max_entries=12
_2026-08-25T20:47:12Z_

Refuting my own worst case. At `max_entries=12` the publish->recheck window is microseconds, and the natural race did not fire (`$PY $SP2/out/R34B/p9_def12.py`):
```
max_entries=12, 13 hot keys x 4 threads, 5 rounds: computes= 65 ideal= 65  amplification=1.00x
max_entries=12, 20 hot keys x 6 threads, 5 rounds: computes=100 ideal=100  amplification=1.00x
max_entries=12, 40 hot keys x 6 threads, 5 rounds: computes=200 ideal=200  amplification=1.00x
```
It fires only under real eviction pressure (`max_entries=1`: 2.38x) or when forced into the window (9 threads -> 9 computes). And `SOLAR_PHYSICS_CONCURRENT_REQUEST_LIMIT=2` means at most ONE follower can exist at a time over HTTP, so the practical blast radius is +1 compute.
=> The fallback bypass is a **latent correctness bug, not a live DoS vector at shipped defaults**. Still worth fixing (it also never caches its result), but I am not claiming exploitability. Same for the BaseException/empty-holder path.


### `AGENT-A` — SUMMARY — AGENT-A (R3 Layer 1, 4cf940b): single-flight mechanics are CORRECT; the cache KEY and the timeout budget are not
_2026-08-25T20:47:12Z_

| # | Check | Verdict |
|---|---|---|
| 1 | symbols (`_clamp`, `carrington_rotation_number`, `OrderedDict`) | **OK** — all resolve; AST walk of `PFSSCache` finds no undefined name |
| 2 | real concurrency, genuine `_compute` | **OK** — 8 threads/1 key -> **1** compute, all get the same object; 3 keys x3 -> **3** computes; `_lock` never held across the compute (max acquire wait 0.2 ms vs a 10.8 s compute) |
| 3 | deadlock / inflight leak on follower timeout | **OK** — no leak, `_inflight` empty after the leader finishes, retry served from cache |
| 4 | leader exception | **OK** — all 6 followers re-raise the SAME exception instance, `_inflight` cleaned, key not poisoned |
| 5 | follower FALLBACK compute storm | **DEFECT (latent)** — bypasses single-flight and never caches its result; 9/9 computes when forced, 2.38x at `max_entries=1`, but 1.00x at the shipped `max_entries=12` |
| 6 | 5% activity bucketing | **DEFENSIBLE, but inconsistent** — worst same-bucket pair 0.475/0.525 gives relRMS(Br)=0.23, open 12 vs 13, wsa -12.2 km/s (-2.56%). Acceptable on its own; indefensible next to the jd hole below |

**Two findings that matter:**

1. **(high) SF-4 is not actually fixed.** The key has no jd term, but `_compute` seeds the magnetogram from `int(jd*100)`. relRMS(Br) between two jd 14 minutes apart is **1.06** — 4.5x the 0.23 the fix deliberately tolerated for activity. Demonstrated call-order dependence for a byte-identical request: open=12 alone vs open=16 when another jd in the same rotation went first, both labelled `carrington_rotation=2267`. The commit's "reused only for a genuinely identical request" is false — 2727 jd seeds share one key.

2. **(critical) R3's DoS objective is not met.** Cold ultra measured 23.2 s over HTTP / 43.0 s direct, against a code comment claiming "~5 s (measured)" and a 30 s timeout. Two concurrent unauthenticated `fidelity=ultra` requests -> both 503 at 30.7 s, permits held by the abandoned computes, and **every** subsequent request is shed for **70.6 s** — including one whose key is already cached. Sustainable from one IP at 2 req/min under the 36/60 s rate limit.

Also: `DEFAULT_INFLIGHT_WAIT_S` (30 s) == `SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS` (30 s), so the follower TimeoutError is unreachable over HTTP and a parked follower holds a permit + executor thread for the full window.

Artifacts: `$SP2/out/R34B/{p1_symbols,p3_conc,p4_coord,p5_phys,p6_sf4,p7_http,p8_lock,p9_def12}.py` and `{p3,p5,p7,p8}.log`. Worktree `/tmp/agentA-a6f1dba` removed; uvicorn on 8177 stopped. `$REPO` working tree untouched.


### `AGENT-C` — DEFECT (high) — the immunity claim is TRUE, and that is the defect: catalog.accuracy.test.ts validates ONE point (elapsedDays=0)
_2026-08-25T20:47:13Z_

**Check 4 (cross-branch).** Simulated merge built at `/tmp/agentc-merge` = `a6f1dba` tree with
`6f385e1`'s `src/sim/orbitMath.ts`, `src/data/planets.ts`, `orbitMath.accuracy.test.ts` overlaid.
`a6f1dba` touches **neither** `orbitMath.ts` nor `planets.ts` nor `catalog.ts` relative to
`7baa015`, so this is the true merge content, not an approximation.

`catalog.accuracy.test.ts` on the merged tree: **TOTAL 6 PASS 6 FAIL 0**. The implementer's
immunity claim is **CONFIRMED and exact** — at `elapsedDays = 0`, `centuriesSinceEpoch = 0`, both
new terms vanish and the two propagators agree to **0.0 km on all 7 moons**.

**But that is precisely the defect.** Measured sun-focus `propagateKeplerOrbit` vs R2's, both against
my own Horizons parent-relative fetch (`$SP2/fetch_moons_epochs.py`, 4 epochs):

| elapsed | body | errSF/r | errR2/r | \|SF−R2\| km |
|---|---|---|---|---|
| 0 | all 7 | — | identical | **0.0** |
| 365.3 | Moon | **0.6670** | 0.0164 | 261,342 |
| 365.3 | Io | 0.3439 | 1.1537 | 596,150 |
| 365.3 | Europa | 0.7434 | 1.1344 | **1,122,515** |
| 3652.5 | Moon | 0.8630 | 0.0300 | 320,781 |
| 3652.5 | Io | 1.9738 | **0.3355** | 843,587 |
| 9730.5 | Ganymede | 1.9680 | 1.4055 | **1,239,913** |
| 9730.5 | Europa | 1.7453 | 1.9581 | 889,003 |

Two consequences:

1. **The suite cannot see R2 at all.** R2 moves moon positions by up to **1.24 million km**
   (1.66 orbital radii) and the only moon accuracy test in the repo reports a 0.0 km delta,
   because it evaluates one point where both formulas are identical by construction.
2. **Both assertions are epoch-fragile, not just insensitive.**
   - The **control** — "Earth's Moon within 5% of orbital radius" — holds only at elapsed 0
     (1.10%). On the *sun-focus* propagator it is **66.70% at +1 y** and **86.30% at +10 y**:
     the control the file calls "active" would fail at any other date on the very branch it
     ships on.
   - The **tripwire** — "err/r > 0.5" — also holds only at elapsed 0. On sun-focus at +1 y,
     Io = **0.3439** (< 0.5, tripwire would fail); on R2 at +10 y Io = **0.3355** and
     Europa = **0.3197**. The "~2 orbital radii" characterisation is a property of one date,
     not of the converter.

So `catalog.accuracy.test.ts` — the file written to embody the "external oracle" rule — is a
single-epoch test, the exact anti-pattern `TESTING_NUMERICS.md` bullet 3 ("Multiple epochs. A
propagator validated at one date can be tuned to it.") forbids. `orbitMath.accuracy.test.ts`
sweeps 4 epochs; `catalog.accuracy.test.ts` sweeps 1.

Fix: propagate the moons at ≥3 epochs (fixtures are cheap — one extra Horizons TLIST) and state
the budget per epoch. Command: `cd /tmp/agentc-merge && $ESBUILD probe_c8.ts --bundle
--platform=node --format=cjs --outfile=$OUT/c8.cjs && $NODE $OUT/c8.cjs`


### `AGENT-D` — CONFIRMED (1 caveat) — hygiene + branch topology
_2026-08-25T20:47:36Z_

**Topology — all claims exact.** `git rev-parse`:
`origin/sun-focus == sun-focus == fix/r1-kuiper-velocity-units == 7baa0156d64a73dee928c3c19239e75bba84f0bf`
-> R1 is already merged, `rev-list --left-right --count sun-focus...fix/r1` = `0  0`.
`fix/r2-secular-rate-mean-anomaly` = 6f385e1, `sun-focus...r2` = `2  2` (2 behind / 2 ahead) — confirmed.
`fix/r3-r4-pfss-dos-and-test-gap` = a6f1dba, `sun-focus...r3r4` = `0  6` (0 behind / 6 ahead) — confirmed.

**File-set disjointness — confirmed.**
- R2 files (3): `src/data/planets.ts`, `src/sim/orbitMath.ts`, `src/sim/orbitMath.accuracy.test.ts`.
- R3/R4 files (7): `backend/server.py`, `backend/sim/pfss_magnetogram.py`, `backend/sim/solar_physics.py`,
  `backend/tests/test_solar_physics_determinism.py`, `src/sim/TESTING_NUMERICS.md`,
  `src/sim/catalog.accuracy.test.ts`, `src/sim/catalog.test.ts`.
- R1 files (4): `backend/server.py`, `backend/sim/kuiper.py`, `backend/sim/tudatpy_hooks.py`,
  `backend/tests/test_kuiper_velocity_units.py`.
- `comm -12` R2 vs R3R4 = **empty**; R2 vs R1 = **empty**; R1 vs R3R4 = `backend/server.py` only — which is
  exactly the allowed exception (R1 is already in R3R4's base, so it is not a conflict).
- Live merge test: `git merge --no-commit --no-ff 6f385e1` onto a6f1dba in a throwaway worktree ->
  **"Automatic merge went well"**, exit 0. Landing order is genuinely free.

**Working tree — confirmed, with one caveat.** `git -C $REPO status --porcelain` still shows exactly the six
modified files listed in the task and nothing else modified. Worktrees: `git worktree list` shows only /tmp
worktrees (mine + agents A/B/C); none inside $REPO. No new untracked files inside $REPO from this work.

CAVEAT 1 (hazard, not a defect): the other tool's dirty set and this work's commit set **overlap on
`backend/server.py`**. The dirty diff is small (+4 lines, hunks at `@@ -726,0 +727 @@` and `@@ -1205,0 +1207 @@`,
both in the `AccuracyReportRequest` / `benchmark_accuracy_report` region) and far from the solar block this work
rewrites (lines ~136-740), so a textual conflict is unlikely — but committing/stashing that file is not free.

CAVEAT 2 (this run's own litter): `agent-notes/R3R4_VERIFICATION_LOG_2026-08-25.md.lock` is created by
`agentlog.sh` inside $REPO and is untracked. Someone should delete it before committing the log.


### `AGENT-C` — DEFECT (medium) — TESTING_NUMERICS.md: 3 of its 6 rules are broken by the tests shipped in the same commit series
_2026-08-25T20:48:17Z_

**Check 6.** `src/sim/TESTING_NUMERICS.md` (commit `9c3fdc5`) states 6 rules. Audited against what
actually shipped on `a6f1dba` + `6f385e1`:

| rule | holds? | evidence |
|---|---|---|
| "Oracle, not recomputation" | **YES** | both `*.accuracy.test.ts` fixtures reproduce from Horizons to <0.15 km / <1 mm (my own fetches). Genuine. |
| "Budgets, not deltas — assert 'error < N km', not 'output changed'" | **NO** | `test_different_fidelity_yields_a_different_payload` is literally `assert _payload(operational) != _payload(high)` — an "output changed" assertion, shipped in `96d8fe1`, three days before the rule. It is also one of the two tests that **passes on the unfixed code**. |
| "Multiple epochs" | **PARTIAL / NO** | `orbitMath.accuracy.test.ts` sweeps 4 epochs but its budgets are only valid at those 4 (Jupiter/Saturn/total all exceeded at 2125-2140, inside the claimed 1800-2150 span). `catalog.accuracy.test.ts` sweeps **one** point, `elapsedDays = 0`. |
| "Physical invariants for backend state" | **YES** | `backend/tests/test_kuiper_velocity_units.py` present on `a6f1dba`, `14 passed in 0.34s`. (Note it is *deleted* on the R2 branch `6f385e1`, which is 2 commits behind sun-focus — a merge must not lose it.) |
| "A new test must be seen red" | **NO, in substance** | 6 of 8 python tests go red on `7baa015` only via `AttributeError` on a `server.<CONST>` name (see my earlier entry); the two behavioural ones stay green. And the SF-6 tripwire has never been red and *cannot* be — it is green by construction and only turns red the day the bug is fixed. |
| "Controls" | **NO** | the Earth's-Moon control is only a control at `elapsedDays = 0` (1.10%). On sun-focus's own propagator it reads 66.70% at +1 y and 86.30% at +10 y. A "control" that is valid at exactly one date does not indict the harness at any other. |

Also: **`TESTING_NUMERICS.md` is referenced from nowhere.**
`grep -rn "TESTING_NUMERICS" /tmp/agentc-a6f1dba --include=*.ts --include=*.md --include=*.py
--include=*.json --include=*.mjs` → **no hits**. Not from `catalog.test.ts`'s new header, not from
README, not from any CI config. A convention that no file points at and no check enforces is
aspirational documentation.

Suite health on the simulated merge (all four TS test files): **TOTAL 49 PASS 49 FAIL 0**
(catalog.test 4, orbitMath.test 2, catalog.accuracy 6, orbitMath.accuracy 37).


### `AGENT-B` — CONFIRMED — /solar/physics response payload is byte-identical between 7baa015 and a6f1dba for identical params
_2026-08-25T20:49:25Z_

Deep recursive diff of the full JSON (all nested lists/dicts, exact float compare), params
`jd=2460321.5&fidelity=preview&max_features=220` (all other params default), base server 7baa015 on
8183 vs a6f1dba on 8180:
```
top-level keys A == top-level keys B  (19 keys, incl. pfss_field_lines, corona, heliosphere, ...)
diff count (excl. wall_epoch_jd): 0
```
No unintended response change. Note two *intentional* contract changes that are NOT shape changes but
ARE client-visible breaks:
- `max_features` > 256 now returns **413** where base returned 200 with the value clamped
  (base clamped to `[8, 2048]`). `src/frontend/features/solar/solarPhysicsClient.ts:60` still
  client-clamps to `[8, 2048]`, so any config raising `maxFeatures` above 256 becomes a hard 413.
  Ships fine only because `src/sunController.ts:156` happens to use `maxFeatures: 180`.
- `jd` outside J2000 +/- 200 Julian years now 400 where base computed.


### `AGENT-B` — DEFECT — the rate limit (36 / 60 s) is BELOW this app's own frontend poll rate (up to 66 / 60 s)
_2026-08-25T20:49:25Z_

`src/sunController.ts:152-159` constructs `SolarPhysicsClient` with `pollIntervalMs: 900`,
`timeoutMs: 2600`, `fidelity: 'high'`, `forcing: 'hybrid'`, `liveData: true`, `maxFeatures: 180`.
A steady 900 ms poll = **66.7 requests/min from one browser tab**, against
`SOLAR_PHYSICS_RATE_LIMIT_PER_WINDOW = 36` per 60 s per IP.

Replayed the client's exact loop (900 ms cadence, 2.6 s client abort, 6 s backoff on any error,
advancing jd) for 70 s from one IP:
```
a6f1dba (8180):  {200: 42, 429: 3, client_abort_ReadTimeout: 1}   -> 46 req / 70 s = 39.4/min
                 ok latency p50=0.297s max=0.447s
```
Three 429s, each costing the client a 6 s stall (`nextRefreshMs = now + max(6000, pollIntervalMs)`).
The endpoint rate-limits its own first-party UI. A second tab, or two users behind one NAT/proxy,
doubles that. Either raise the default to >= 80/60 s or raise `pollIntervalMs` to >= 1700 ms.

Positive control on the SAME loop against base 7baa015 (8183): `{client_abort_ReadTimeout: 9}, ok=0`
-- base never returns a usable payload in 70 s because it has no single-flight and re-computes a
~20 s cold `high` PFSS on every retry. So R3 is a large net win for the frontend; the 429 is the
one regression it introduces.


### `AGENT-C` — DEFECT (medium) + JUDGEMENT — the SF-6 tripwire is a trap: it goes red on PROGRESS with a message that reads as 'delete me'
_2026-08-25T20:49:28Z_

**Check 3, part 2 — judgement, with an experiment rather than an opinion.**

The numbers themselves are honest (verified against my own Horizons fetch, see earlier entry:
Moon 0.0110, Io 1.9697, Europa 1.9693, Ganymede 1.9683, Callisto 1.9787, Triton 1.7760, and the
unasserted Titan 0.4466). The *construction* is the problem. Three measured objections:

**(a) It is a "something is still very wrong" detector, not an SF-6 detector.** `err/r > 0.5`
is satisfied by any large error from any cause. Report C says SF-6 is two coupled parts (orbit-
normal sign + periapsis rotation). I applied **only** the orbit-normal sign half in a copy of the
merged tree (`/tmp/agentc-partial`, negating `eclipticNormal` in `convertMoonOrbitFrameToEcliptic`):

```
Io       1.9697 -> 1.8862   tripwire PASS
Europa   1.9693 -> 1.9923   tripwire PASS
Ganymede 1.9683 -> 1.8064   tripwire PASS
Callisto 1.9787 -> 0.2325   tripwire FAIL   "expected 0.23247124030128813 > 0.5"
Triton   1.7760 -> 1.0302   tripwire PASS
=> TOTAL 6  PASS 5  FAIL 1
```
So a half-fix that leaves the converter broken turns the suite red on exactly one moon, with four
still asserting "still broken". The signal is neither "fixed" nor "not fixed"; it is noise.

**(b) The failure message inverts the meaning of red.** The failing test is named
*"Callisto is still displaced ~2 orbital radii (remove when SF-6 is fixed)"* and the assertion
message is *"expected 0.232 > 0.5"* — i.e. **the suite fails because the code got better.** The
test's own name authorises the fix: "remove when SF-6 is fixed". The path of least resistance for
whoever hits this is to delete the block, and deleting it is *literally what the header instructs*
("DELETE this block and enable the budget above for these moons"). But the "budget above" does not
exist as code — `SF6_INTENDED_BUDGET = 0.10` is declared and then `void`-ed on the next line. So the
real assertion lives only in a comment, and the documented remediation is "delete the only
external-oracle moon accuracy coverage in the repo and hand-write a replacement." That is a trap.

**(c) It is epoch-fragile, so it is not even a stable statement about the converter.** Same branch,
`elapsedDays = 365.3`: Io = **0.3439** — the tripwire fails with nothing fixed at all. The
assertion encodes a property of one date, not of the code.

**Verdict: bad practice as written, and fixable without giving up the intent.** "Known broken, tell
me when it's fixed" is a legitimate need; the wrong encoding is inverting the assertion. The right
one keeps the *real* assertion in the source and marks it expected-to-fail, so the fix is deleting a
modifier rather than rewriting physics:

```ts
it.fails(`${fixture.name} is within ${SF6_INTENDED_BUDGET} of its orbital radius (SF-6)`, () => {
  const { errorKm, radiusKm } = parentRelativeErrorKm(fixture);
  expect(errorKm / radiusKm).toBeLessThan(SF6_INTENDED_BUDGET);
});
```
Then: red means "the intended budget is met — drop `.fails`", the intended budget is executable
rather than commentary, partial fixes do not produce a half-red suite, and nothing invites deletion.
(Vitest exposes `test.fails`/`it.fails`; verify against the pinned 3.2.4 before adopting.) Titan
should be added to the same block instead of being carried as unasserted fixture data.


### `AGENT-D` — DEFECT — R4 item 2: Titan is a fixture with NO assertion; it is a 45%-of-radius failure silently excluded from both groups
_2026-08-25T20:49:30Z_

Ran the two new TS test files for real (vitest is not installed, so I built a CommonJS `vitest` stub with
describe/it/it.each/expect in an isolated `node_modules` copy at /tmp/AGENT-D-a6f1dba, then
`esbuild agentd_probe.ts --bundle --platform=node --format=cjs` + node):
**`PASS=10 FAIL=0`** — `catalog.accuracy.test.ts` + `catalog.test.ts` both pass. So the claim "the new tests pass"
is true *as written*.

But the fixture table `HORIZONS_MOONS` has **7 moons and only 6 assertions**:
- 1 control assertion: Moon
- 5 tripwire assertions: `SF6_BROKEN = {Io, Europa, Ganymede, Callisto, Triton}`
- **Titan appears in the fixture table and in NO assertion at all.**

I measured all 7 through the same code path the test uses (`propagateKeplerOrbit(body.orbit, 0, pos)`):

| moon | err/r | err km | r km | passes tripwire `>0.5`? | passes intended budget `<0.10`? |
|---|---|---|---|---|---|
| Moon      | 0.011 | 4 432 | 402 449 | n/a (control) | yes |
| Io        | 1.970 | 827 729 | 420 232 | yes | no |
| Europa    | 1.969 | 1 309 361 | 664 878 | yes | no |
| Ganymede  | 1.968 | 2 106 658 | 1 070 308 | yes | no |
| Callisto  | 1.979 | 3 723 335 | 1 881 685 | yes | no |
| **Titan** | **0.447** | **560 719** | 1 255 511 | **NO** | **NO** |
| Triton    | 1.776 | 629 967 | 354 716 | yes | no |

`src/data/moons.json` (a6f1dba, line ~2312) gives Titan `"frame": "Laplace"` — the *same* converted path as the
Galileans and Triton. So Titan is not a different case; it is a Laplace-frame moon sitting 560 700 km (45 % of its
orbital radius) from Horizons, and it is the one fixture the file asserts nothing about. It fits neither bucket:
too broken for the 0.10 budget, not broken enough for the `>0.5` tripwire — and the tripwire threshold 0.5 sits
just above Titan's 0.447, so the effect (whether intended or not) is that the one inconvenient data point was
dropped from the group rather than reported.

Impact: R4 item 2's stated purpose is to stop tests that "agree with the implementation by construction". A
fixture with no assertion is the same failure in a new form — it will never fail, and it hides an SF-6 case whose
error magnitude (0.45 r, not ~2 r) contradicts the file's own docstring claim that the converted moons are "each
~2 orbital radii from truth". Any SF-6 fix validated only against the 5 tripwire moons repeats the
single-data-point trap: Titan behaves differently and is unmonitored.

Fix: assert Titan too — either add it to `SF6_BROKEN` with a threshold that covers 0.447, or give it its own
assertion pinning the current 0.447 +/- tolerance, and correct the "~2 orbital radii" docstring to a range.


### `AGENT-C` — NOTE — three smaller defects in catalog.accuracy.test.ts's harness
_2026-08-25T20:50:09Z_

1. **`fixture.parentId` is declared, populated for all 7 rows, and never read.**
   `grep -n parentId src/sim/catalog.accuracy.test.ts` → only the interface field and the 7
   literals. `parentRelativeErrorKm` looks the body up by **lowercase name only**
   (`BODIES.find(b => b.name.toLowerCase() === fixture.name.toLowerCase())`, first match wins).
   The catalog already contains a **duplicate lowercase name — `puck` appears twice** among its 434
   bodies, so name-only lookup is demonstrably not unique in this catalog. None of the 7 fixture
   moons collides *today* (all `matches=1`, all parents match), but the guard exists in the data
   and is not used. One line fixes it: also require `b.parentId === fixture.parentId`.

2. **`const BODIES: any[] = (CATALOG as any).bodies ?? (CATALOG as any);`** — three `any` casts in
   the harness of a file whose whole purpose is to be the trustworthy one. If `createSolarSystemCatalog`
   ever stops returning `{bodies}`, the fallback silently becomes the object itself and
   `.find` throws a `TypeError` instead of a clear failure. `tsc` cannot help here by construction.

3. **`createSolarSystemCatalog()` at module scope** does not throw (verified: 434 bodies) — the
   import-time risk flagged in my brief is not realised. It does mean the full catalog is built even
   when the file's tests are filtered out, but that is ~ms, not a defect.

Test-count inventory on the merged tree (my vitest stub, all four TS test files):
`catalog.test 4`, `orbitMath.test 2`, `catalog.accuracy.test 6`, `orbitMath.accuracy.test 37`
→ **TOTAL 49 PASS 49 FAIL 0**.


### `AGENT-D` — SUMMARY — AGENT-D done: 4 claims CONFIRMED exactly, 2 DEFECTS found
_2026-08-25T20:50:34Z_

**Every number the implementer claimed is correct.** pytest 80/94/102 with the identical, unrelated
`ri_ias15` REBOUND-version failure at all three revs; tsc 344 -> 345 with the +1 being exactly the new
`vitest` TS2307 in `catalog.accuracy.test.ts`; map bounded at exactly 4096 == cap; genuine repeat caller still
429s on request 37 of 36. Topology exact (r1 0/0, r2 2-behind/2-ahead, r3r4 0-behind/6-ahead), file sets
disjoint except R1's already-merged `backend/server.py`, and `git merge 6f385e1` onto a6f1dba is clean.
Working tree still shows exactly the other tool's six modified files; no worktrees or scratch files in $REPO.

**Two defects the implementer's own tests do not cover:**

1. **(HIGH) The eviction is a working rate-limit bypass.** `backend/server.py:245-257`. Exhaust an identity
   (36 -> 429), then spoof **exactly 4096** distinct `X-Forwarded-For` values; your own entry is the LRU and is
   evicted; the next request as your original identity returns **200** with a **full fresh 36-request quota**.
   The spoof requests are cheap because the rate check (`:656`) runs *before* the concurrency semaphore
   (`:708`), so they are answered with a fast 503 and still recorded. The same 4096 requests flush every other
   identity too, so one caller can reset the limiter for the whole server. `X-API-Key` mints identities the same
   way when `SOLAR_PHYSICS_API_KEYS` is unset (50 junk keys from one IP -> 50 quotas). The new test
   `test_rate_limiter_identity_map_is_bounded` asserts (a) boundedness and (b) repeat-caller limiting — it does
   **not** test the evict-your-own-history case, which is the whole point of a bounded map.
   Note: because `_client_identity()` trusts `X-Forwarded-For` with no trusted-proxy allow-list, the limiter was
   already bypassable by plain spoofing; the eviction adds a second route and a cross-tenant flush. The honest
   framing is that the *rate limit contributes ~nothing* to the DoS bound the R3 comment (`:149-152`) credits it
   with; the concurrency semaphore is doing all the work.

2. **(MEDIUM) R4 item 2 ships a fixture with no assertion, and it is the failing one.** `catalog.accuracy.test.ts`
   lists 7 Horizons moons but asserts 6. **Titan** (`moons.json`: `"frame": "Laplace"`, same converted path as
   the Galileans) is at **err/r = 0.447 (560 719 km)** — too broken for the intended 0.10 budget, not broken
   enough for the `>0.5` tripwire, so it is in neither group and can never fail. It also contradicts the file's
   own docstring ("each ~2 orbital radii from truth"; measured 1.78-1.98 r for the five, 0.45 r for Titan).

**Downgraded on measurement:** eviction latency. In-process the lock is held mean 2.53 ms / p95 4.68 ms /
max 100 ms per admitted request at cap vs 0.005 ms below cap (~515x), and it now runs on the asyncio event loop
(endpoint became `async def` in 57ad971; it was a plain `def` at 7baa015). But end-to-end I could not measure it:
503-path latency 17.73 ms mean at cap vs 18.43 ms mean on a fresh server (n=300 each). Real O(n log n)-per-request
scaling hazard, not a demonstrated outage.

Cleanup: my worktrees `/tmp/AGENT-D-*` removed, my uvicorns (8181/8182) killed, $REPO untouched.


### `AGENT-C` — DEFECT (high) — MUTATION TEST: the over-admission regression can be reintroduced and the R4 suite still reports 8 passed
_2026-08-25T20:53:35Z_

**Check 2, extension — mutation test of `test_concurrency_permit_is_held_until_the_work_actually_finishes`.**
This is the test guarding the defect the implementer self-found in `5d0e4b7`. Its guard on
`server.py` is three string checks on `inspect.getsource(server.solar_physics_state)`:
`"add_done_callback" in source`, `"asyncio.shield" in source`,
`"finally:" not in source.split("add_done_callback")[-1]`. Its behavioural half builds a **local**
`BoundedSemaphore` + `ThreadPoolExecutor` and exercises that, never `server.py`.

I reintroduced the exact regression in `/tmp/agentc-mutant` (a copy of `a6f1dba/backend`):

```python
    future.add_done_callback(lambda _: None)          # MUTANT: work completion no longer frees the permit
    try:
        _result = await asyncio.wait_for(asyncio.shield(future),
                                         timeout=SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS)
    except asyncio.TimeoutError as exc:
        _solar_physics_concurrent_guard.release()     # MUTANT: freed while the thread still runs
        raise HTTPException(status_code=503, ...) from exc
    _solar_physics_concurrent_guard.release()
    return _result
```
This is semantically `5d0e4b7`'s pre-fix behaviour (that version used
`try: ... finally: _solar_physics_concurrent_guard.release()`), rewritten without the literal token
`finally:`. All three string guards still hold:
```
add_done_callback in src: True
asyncio.shield in src   : True
'finally:' after cb     : False
```

Result:
```
cd /tmp/agentc-mutant && $PY -m pytest tests/test_solar_physics_determinism.py -q
........                                                       [100%]
8 passed in 71.79s
```

**The suite that exists to prevent this exact regression passes on a server that has it.** The test
is a lint rule on three substrings plus a self-test of a locally re-implemented correct pattern; it
has no coupling to the endpoint's actual concurrency behaviour. Renaming the guard variable, or
writing the same bug without the word `finally`, defeats it.

(Control: an earlier, sloppier mutant of mine that also *leaked* permits was caught — but by
`test_jd_inside_the_window_is_accepted` returning 503, i.e. incidentally, not by the permit test.)

Fix: drive the real endpoint. Monkeypatch `SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS` to ~0.1 s and
`_build_solar_physics_state` to a sleeper that records live concurrency, fire
`limit` requests per wave for 3 waves against `TestClient`/`httpx.ASGITransport`, and assert
observed peak <= `SOLAR_PHYSICS_CONCURRENT_REQUEST_LIMIT`. Delete the `inspect.getsource` assertions
outright — a source grep is not a test.


### `AGENT-C` — CONFIRMED — the rate-limiter test is the one that genuinely bites (mutation-verified)
_2026-08-25T20:54:24Z_

Fairness check on the other self-found defect. `/tmp/agentc-mutant2` = `a6f1dba/backend` with the
hard-evict block deleted from `_enforce_solar_request_rate_limit`, keeping only the stale-only sweep
— i.e. the implementer's **first, failed** fix reinstated:

```
cd /tmp/agentc-mutant2 && $PY -m pytest tests/test_solar_physics_determinism.py -q -k "rate_limiter or saturation or oversized"
FAILED test_rate_limiter_identity_map_is_bounded
  AssertionError: assert 8692 <= (4096 + 1)
1 failed, 2 passed, 5 deselected in 4.14s
```

`test_rate_limiter_identity_map_is_bounded` is a **real behavioural test** — it drives the actual
`server._enforce_solar_request_rate_limit` and catches the exact regression. It is the only test in
the file that does so. Its pre-R3 red is still an `AttributeError`, but its guard against future
regression is genuine.

Minor naming gap: `test_jd_outside_the_validity_window_is_rejected_without_computing` asserts only
`status_code == 400` and `"jd" in detail`. It never checks that **no compute happened**, despite the
name. A `monkeypatch` counter on `_build_solar_physics_state` would make the name true.


### `AGENT-C` — SUMMARY — AGENT-C (R4 / the new tests): central claim REFUTED
_2026-08-25T20:54:49Z_

**Central R4 claim — "these tests would catch the regressions" — is refuted for 3 of the 4 defects
they name.** Everything below was measured, not read.

| # | finding | sev |
|---|---|---|
| C1 | `test_concurrency_permit_is_held_until_the_work_actually_finishes` passes on a `server.py` with the over-admission regression reintroduced. Guard is 3 substring greps + a self-test of a locally re-implemented correct pattern. **8 passed** on the mutant. | **high** |
| C2 | 0 of 8 python tests fail on `7baa015` for a behavioural reason. 6 fail via `AttributeError` on a `server.<CONST>` name; the 2 that run real behaviour **pass on the unfixed code** — including the SF-4 determinism test the file was written for. SF-4 *is* reproducible (`high` = `3171417a` or `4d0864c6` by call order pre-R3; order-independent post-R3); a one-line-different assertion catches it. | **high** |
| C3 | `catalog.accuracy.test.ts` validates exactly one point, `elapsedDays = 0`. The R2 merge is genuinely invisible to it (0.0 km delta on all 7 moons) while R2 moves moons by up to **1,239,913 km**. Both its assertions are epoch-fragile: the Moon "control" reads **66.70%** at +1 y on its own branch (budget 5%), and the tripwire's Io reads **0.3439** at +1 y (threshold 0.5). | **high** |
| C4 | SF-6 tripwire is a trap. A half-fix (orbit-normal sign only) makes **1 of 5 go red** ("expected 0.232 > 0.5") while 4 stay green — red on *progress*, from a test whose name says "remove when SF-6 is fixed", whose header says delete the block, and whose intended budget exists only as a `void`-ed constant. | med |
| C5 | **Titan** is in `HORIZONS_MOONS`, takes the same broken `laplace` converter path, sits at **err/r = 0.4466 < 0.5**, and is asserted by nothing. The 0.5 threshold is fitted to the 5 moons that clear it. | med |
| C6 | `orbitMath.accuracy.test.ts` budgets are **not** "~1.6x the worst over 1800-2150". At 2125: jupiter 2,061,526 (1.12x budget), saturn 10,313,014 (1.04x), total 22.16e6 vs 16e6 cap. A whole 2120-2140 band busts the total. Budgets are fitted to the file's 4 epochs. | med |
| C7 | `TESTING_NUMERICS.md`: 3 of 6 rules are broken by tests shipped in the same series — "budgets not deltas" (`assert payload_a != payload_b`), "multiple epochs" (catalog test = 1), "seen red" (AttributeError reds). Doc is referenced from **nowhere** in the repo. | med |
| C8 | `fixture.parentId` declared, populated, never read; lookup is first-lowercase-name-match and the catalog already has a duplicate name (`puck` x2). | low |

**Genuine positives, verified:** every Horizons fixture in both accuracy files is real — moons
reproduce to **<1 mm**, planets to **<0.115 km**, against my own independent fetches. Both TS files
type-check clean (0 errors in `src/sim`, vs 361 pre-existing repo-wide) and run green (49/49 across
all four TS test files on the simulated merge). `test_rate_limiter_identity_map_is_bounded` is a
real behavioural guard — mutation-verified: reinstating the stale-only sweep gives
`assert 8692 <= 4097`. R3 Layer 1 itself works (order-dependence gone post-fix).

**Not blocked on anything.** All 6 assigned checks completed.
Artifacts: `$OUT/{horizons_moons,horizons_planets,horizons_span,horizons_dense,horizons_moons_epochs}.json`,
scripts `$SP2/{fetch_moons,fetch_planets,fetch_span,fetch_dense,fetch_moons_epochs,sf4_order,sf4_inproc}.py`.
Worktrees `/tmp/agentc-{a6f1dba,7baa015,6f385e1}`, trees `/tmp/agentc-{merge,partial,mutant,mutant2}`.


### `AGENT-B` — CONFIRMED — the R3 acceptance bar (40 concurrent ultra, /health p95 < 50 ms) is NOT met, and is unreachable in-process
_2026-08-25T20:58:48Z_

Server a6f1dba on 8180, **shipped defaults** (limit=2, timeout=30 s, rate limit 36/60 s), fresh process
(cold PFSS cache). 40 concurrent GET `/solar/physics?fidelity=ultra&max_features=220`, jd spaced 40 d
apart so each lands in a **different Carrington rotation** (i.e. genuinely distinct PFSS work — spacing
them < 27.27 d makes them share a cache key and the second request merely blocks in single-flight,
which flatters the numbers). `/health` sampled every 20 ms on a separate connection for 40 s.

| scenario | /health p50 | p90 | **p95** | p99 | max | bar 50 ms |
|---|---|---|---|---|---|---|
| idle | 10.5 ms | 12.4 ms | **13.0 ms** | 14.0 ms | 38.6 ms | pass |
| exactly ONE cold ultra compute | 20.4 ms | 53.8 ms | **61.3 ms** | 75.8 ms | 150.9 ms | **FAIL** |
| 40 concurrent (2 admitted, same CR) | 41.8 ms | 68.0 ms | **73.7 ms** | 94.2 ms | 366.6 ms | **FAIL** |
| **40 concurrent, distinct CR (the real test)** | 116.6 ms | 181.3 ms | **207.2 ms** | 250.5 ms | 386.3 ms | **FAIL (4.1x)** |

Response-code histogram for the 40 solar requests: **`{503: 40}`** — 100% 503. Two were admitted and
then hit the 30 s compute timeout (cold ultra is ~50 s, see the timeout entry); the other 38 were shed
immediately with "temporarily saturated". No 200s at all.

Isolation of the cause — a second probe route `GET /dbg/ping` declared `async def` (runs ON the event
loop, does no work) was sampled simultaneously:
```
idle                    /dbg/ping p95 = 10.6 ms   /health p95 = 13.0 ms
1 cold ultra            /dbg/ping p95 = 30.9 ms   /health p95 = 61.3 ms
40 concurrent distinct  /dbg/ping p95 = 84.5 ms   /health p95 = 207.2 ms
```
The event loop itself is never blocked (the endpoint is correctly `async` and the compute is off-loop),
yet an empty on-loop route still degrades 8x. The compute is **GIL-bound pure Python**, so it steals
bytecode slots from every other thread in the process, including the anyio worker threads that run the
`def`-declared `/health`. `/health` also has ~10-13 ms of its own cost (`REBOUNDEngine()` +
`TudatPyEngine()` construction on every call, `backend/server.py:505-515`), which eats a quarter of the
50 ms budget before any load at all.

**I agree with the implementer: the bar cannot be met while PFSS runs in the API process.** More
strongly than they claim — it is missed with *one* compute in flight (61 ms), so no value of
`SOLAR_PHYSICS_CONCURRENT_REQUEST_LIMIT >= 1` satisfies it. Two cheap independent wins are available
regardless: memoize `/health`'s engine-availability probe (worth ~10 ms of the 50 ms budget) and make
`/health` `async def` so it does not queue behind the anyio pool.

Repro: `$PY $OUT/p95.py http://127.0.0.1:8180 {idle|1|40}`.


### `AGENT-B` — DEFECT — single-flight follower TimeoutError escapes as a raw 500 (unmapped exception)
_2026-08-25T20:58:48Z_

Seen in the server log during the storm:
```
Future exception was never retrieved
future: <Future finished exception=TimeoutError('PFSS computation timed out waiting for in-flight result')>
```
`PFSSCache.get_or_compute` (backend/sim/pfss_magnetogram.py) raises a bare
`TimeoutError("PFSS computation timed out waiting for in-flight result")` when a follower's
`DEFAULT_INFLIGHT_WAIT_S = 30.0` expires. `solar_physics_state` only catches `asyncio.TimeoutError`
(which is `TimeoutError` in 3.11+ — but this one is raised *inside the worker thread*, so it arrives as
the future's exception on `await`, not as a `wait_for` timeout). Whether it maps to 503 or falls
through to a bare **500 Internal Server Error** depends purely on which of the two 30 s clocks
(`SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS` = 30.0 vs `DEFAULT_INFLIGHT_WAIT_S` = 30.0) fires first — they
are equal by coincidence, not by construction, and either is env-overridable independently.
Set `SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS=60` and the follower's 500 becomes the observed outcome.

Also note the endpoint has **no `except Exception` at all**: any failure inside
`_build_solar_physics_state` (upstream parse error, numpy error, MemoryError) is returned to the client
as an unhandled 500 with a stack trace in the log, where every other failure mode on this endpoint was
carefully given a typed 4xx/503. Suggest wrapping the `await` in
`except (TimeoutError, asyncio.TimeoutError) -> 503` and `except Exception -> 500 with a stable detail`.


### `AGENT-B` — CONFIRMED — a6f1dba's identity-map bound holds; REFUTED my own worry about its cost
_2026-08-25T21:04:45Z_

Server a6f1dba on 8184 with `SOLAR_PHYSICS_RATE_IDENTITY_SOFT_CAP=64` (so the eviction path is exercised
hard). Requests use an out-of-range `jd` so the rate limiter runs but no compute is bought.
```
60 reqs, ONE identity                       -> {400: 36, 429: 24}      # limit bites at exactly 36/60s
2000 reqs, DISTINCT spoofed X-Forwarded-For -> {400: 2000}  (1840 req/s)
rate identity map size after 2000 -> 64      (== SOFT_CAP, not 2000)
300 further spoofed reqs while over cap     -> 1871 req/s, map = 64
```
The map is genuinely bounded and the O(n log n) sort inside the lock costs nothing measurable at this
cap (throughput is flat: 1840 -> 1871 req/s). The second fix works.


### `AGENT-B` — DEFECT — the rate limit is 100% bypassable: X-Forwarded-For is trusted unconditionally, no trusted-proxy gate
_2026-08-25T21:04:45Z_

`backend/server.py` `_enforce_solar_request_rate_limit` -> `_client_identity`:
```python
forwarded_for = request.headers.get("x-forwarded-for", "")
if forwarded_for:
    return forwarded_for.split(",")[0].strip()
```
There is no allow-list of trusted proxies, no `TRUST_FORWARDED_FOR` env gate, and no fallback to
`request.client.host` when the header is present but the peer is not a known proxy. Any direct client
can mint a fresh rate-limit identity per request.

Measured against a6f1dba on 8184 (`SOLAR_PHYSICS_RATE_LIMIT_PER_WINDOW` at its default 36/60 s):
```
60 requests, one identity                -> 36x 400 then 24x 429   (limited)
2000 requests, distinct spoofed XFF      -> 2000x 400, ZERO 429    (unlimited, 1840 req/s)
```
Every load test in this run — including the 40-concurrent acceptance test — bypassed the rate limit
this way with a one-line header. So `SOLAR_PHYSICS_RATE_LIMIT_PER_WINDOW` is a courtesy limit for
well-behaved clients only; the **only** real bound on this endpoint is
`SOLAR_PHYSICS_CONCURRENT_REQUEST_LIMIT`. The R3 commit message presents the rate limit as part of the
DoS bound. The source comment shows the author knew the header is spoofable (they bounded the identity
map because of it) but stopped short of not trusting it.

Fix: only honour XFF when `request.client.host` is in a configured trusted-proxy set
(env `SOLAR_PHYSICS_TRUSTED_PROXIES`), else key on the peer address.

