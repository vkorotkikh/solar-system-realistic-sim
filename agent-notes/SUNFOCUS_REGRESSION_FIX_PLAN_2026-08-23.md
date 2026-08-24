# Fix Implementation Plan — the three `sun-focus` regressions

**Target branch:** `origin/sun-focus @ fd793f4` · **Baseline for comparison:** `main @ aa6e39a` · **Written:** 2026-08-23

> **Why this document exists.** [Report C](MAJOR_ISSUE_REPORT_C_SUNFOCUS_HUNT_2026-08-23.md) recommends adopting `sun-focus` as the canonical branch, because it genuinely fixes four things and cuts type errors 1,300 → 344. It also ships three regressions that are each *worse than what they replace*, and none of which its own new tests can detect. This plan closes those three, plus the test gap that let them land.
>
> Every file:line below was read on the `sun-focus` worktree at `fd793f4`, not inferred from the audit summary.

## Ordering and rationale

Fix in this order. It is not arbitrary — R1 and R2 are silent wrong-number defects that corrupt output a user would act on, and both are small and self-contained. R3 is a larger change with a design decision in it.

| # | Regression | Severity | Effort | Blocking? |
|---|---|---|---|---|
| **R1** | Kuiper perturbers in radial free-fall | High | **S** (≤ 1 h) | Blocks adoption |
| **R2** | Secular rates 4.8× worse than `main` | High | **S** (≤ 1 h) | Blocks adoption |
| **R3** | PFSS unauthenticated CPU DoS | Critical | **M–L** (1–3 d) | Blocks *exposure*, not local use |
| **R4** | Test gap that let R1/R2 land | — | **M** (1 d) | Blocks *re-landing* |

R1 and R2 are each a few lines and can ship the same day. R3 needs a decision about whether PFSS stays request-synchronous at all. **R4 is not optional**: without it the same class of regression returns on the next commit, and the branch's green suite will keep saying everything is fine.

---

## R1 — Kuiper perturbers destroyed by the velocity-unit change

### Root cause

`sun-focus` correctly changed the WebSocket state contract to emit **AU/day** and to declare it:

```python
# backend/sim/rebound_nbody.py:24
STATE_VELOCITY_UNITS = "AU/day"

# backend/sim/rebound_nbody.py:153-157   (get_state)
"vel": [
    round(p.vx / DAYS_PER_YEAR, 10),
    round(p.vy / DAYS_PER_YEAR, 10),
    round(p.vz / DAYS_PER_YEAR, 10),
],
```

The REBOUND sim itself is still year-based (`rebound_nbody.py:86`, `self.sim.units = ("yr", "AU", "Msun")`), so `p.vx` is AU/yr and the division is right.

But the one real consumer was never updated. `server.py` passes those velocities straight through:

```python
# backend/server.py:959-975   (activate_kuiper handler)
main_state = self.engine.get_state()
bodies = main_state.get("bodies", {})
sun = bodies.get("sun", {"pos": [0, 0, 0], "vel": [0, 0, 0]})
...
self.kuiper.activate(
    sun_pos=sun["pos"], sun_vel=sun["vel"],
    neptune_pos=neptune["pos"], neptune_vel=neptune["vel"],
    ...
)
```

and `kuiper.activate` injects them into a **year-based** simulation with no conversion:

```python
# backend/sim/kuiper.py:189
self.sim.units = ("yr", "AU", "Msun")
# backend/sim/kuiper.py:195-199
self.sim.add(
    m=1.0,
    x=sun_pos[0], y=sun_pos[1], z=sun_pos[2],
    vx=sun_vel[0], vy=sun_vel[1], vz=sun_vel[2],   # AU/day read as AU/yr
)
```

Injected speed is therefore **365.25× too small**, which is numerically indistinguishable from zero:

```
             Jupiter            Saturn             Neptune
main      a=5.2081 e=0.0493  a=9.5392 e=0.0540  a=30.0703 e=0.0086
sun-focus a=2.4837 e=1.0000  a=4.5862 e=1.0000  a=15.0587 e=1.0000
truth     a=5.20   e=0.048   a=9.58   e=0.056   a=30.07   e=0.009
```

`a = r/2` with `e = 1.0` is the exact signature of zero velocity — a radial plunge into the Sun. The entire perturber field, which is the stated reason Jupiter/Saturn/Neptune are in that sim at all, is destroyed. **No error is raised.**

### The fix

Two options. **Take Option A.** Option B is the one-line hotfix if you need it today.

**Option A (recommended) — make `activate` unit-aware, so the contract is explicit and cannot drift again.**

In `backend/sim/kuiper.py`, extend the signature (`kuiper.py:165-177`) and normalize once at the top:

```python
DAYS_PER_YEAR = 365.25
_VELOCITY_SCALE_TO_AU_PER_YEAR = {
    "AU/yr": 1.0,
    "AU/day": DAYS_PER_YEAR,
}

def activate(
    self,
    sun_pos: List[float],
    sun_vel: List[float],
    ...
    velocity_units: str = "AU/day",     # matches the current WS contract
) -> None:
    try:
        vscale = _VELOCITY_SCALE_TO_AU_PER_YEAR[velocity_units]
    except KeyError:
        raise ValueError(
            f"kuiper.activate: unsupported velocity_units {velocity_units!r}; "
            f"expected one of {sorted(_VELOCITY_SCALE_TO_AU_PER_YEAR)}"
        )

    def _v(vec: Optional[List[float]]) -> Optional[List[float]]:
        return None if vec is None else [c * vscale for c in vec]

    sun_vel     = _v(sun_vel)
    neptune_vel = _v(neptune_vel)
    jupiter_vel = _v(jupiter_vel)
    saturn_vel  = _v(saturn_vel)
    # ... rest of the method unchanged; sim.units stays ("yr","AU","Msun")
```

Then in `backend/server.py:967-975`, pass the engine's own declared units through rather than assuming:

```python
self.kuiper.activate(
    sun_pos=sun["pos"], sun_vel=sun["vel"],
    neptune_pos=neptune["pos"], neptune_vel=neptune["vel"],
    center_au=center, spread_au=spread,
    jupiter_pos=jupiter["pos"] if jupiter else None,
    jupiter_vel=jupiter["vel"] if jupiter else None,
    saturn_pos=saturn["pos"] if saturn else None,
    saturn_vel=saturn["vel"] if saturn else None,
    velocity_units=main_state.get("velocity_units", "AU/day"),
)
```

This is the right shape because `sun-focus` *already added* `velocity_units` to the state payload (`rebound_nbody.py:67`). The regression happened precisely because the producer declared its units and the consumer ignored them. Honouring the field closes the class of bug, not just this instance.

**Option B (hotfix) — scale at the call site only.** Multiply each `vel` by `365.25` in `server.py:967-975`. One line per body. Correct today, but it re-hardcodes the assumption that broke, in a second place. Use only if you need to ship before Option A can be reviewed.

**Do not** "fix" this by switching `kuiper.py:189` to day-based units. That changes the meaning of `self.sim.dt = 0.0005` (`kuiper.py:191`), the integration timescale, and `get_state`'s output units (`kuiper.py:373-375`) all at once — a much wider blast radius for no benefit.

### Make the silence impossible

The reason this shipped is that a physically absurd simulation raised nothing. Add a cheap post-condition at the end of `activate`, after the massive bodies are added:

```python
# Sanity-check the perturber field: a bound planet must be elliptical.
for idx, name in self._massive_body_labels():        # e.g. [(1,'jupiter'), (2,'saturn'), (3,'neptune')]
    orb = self.sim.particles[idx].calculate_orbit(primary=self.sim.particles[0])
    if not (0.0 <= orb.e < 0.9):
        raise ValueError(
            f"kuiper.activate: {name} is unbound (e={orb.e:.4f}, a={orb.a:.4f} AU) — "
            "injected velocities are almost certainly in the wrong units"
        )
```

`e ≥ 0.9` for a major planet cannot happen with correct inputs, so this has no false-positive risk and would have caught the regression on the first `activate_kuiper` command.

### Acceptance

- `activate_kuiper` over a live WS, then read the perturber elements: **Jupiter `e < 0.10`, Saturn `e < 0.10`, Neptune `e < 0.05`**, and `a` within 2% of 5.20 / 9.58 / 30.07 AU.
- Passing `velocity_units="AU/yr"` yields the same result as `main` did (regression-proof in both directions).
- An unknown `velocity_units` raises `ValueError` rather than silently mis-scaling.

---

## R2 — Secular rates make planets 4.8× worse

### Root cause

`sun-focus` added JPL per-century rates to every planet (`src/data/planets.ts`; e.g. Saturn at `planets.ts:175-181`) and applies them in `resolveKeplerOrbitAtElapsedDays`. The **rate values are correct**. The propagator is wrong by one term.

Node and argument of periapsis are advanced (correct):

```ts
// src/sim/orbitMath.ts:91-96
const ascendingNodeRad = degToRad(
  (orbit.ascendingNodeDeg ?? 0) + (secularRates?.ascendingNodeDegPerCentury ?? 0) * centuriesSinceEpoch
);
const argPeriapsisRad = degToRad(
  (orbit.argPeriapsisDeg ?? 0) + (secularRates?.argPeriapsisDegPerCentury ?? 0) * centuriesSinceEpoch
);
```

Then mean anomaly is advanced at the **full** mean motion (the bug):

```ts
// src/sim/orbitMath.ts:101
const meanAnomalyRad = normalizeRadians(degToRad(orbit.meanAnomalyDeg ?? 0) + meanMotion * elapsedDays);
```

Mean longitude is `L = ϖ + M` where `ϖ = Ω + ω`. Because `Ω` and `ω` now drift, advancing `M` at the full `n` adds that same drift a second time — apsidal precession is **double-counted into along-track position**. JPL's own scheme avoids this by tabulating `L` and deriving `M = L − ϖ`.

Measured against JPL Horizons at JD 2461275.5:

```
planet      MAIN km    SUN-FOCUS km    SF + M-correction km
earth        10,487        182,215              40,984
mars         58,000        326,414             150,232
saturn    1,179,225      3,093,042             295,269
uranus    1,033,692      6,113,695           1,081,527
neptune     665,098      7,462,523             687,618
TOTAL     3,963,582     19,081,786           3,387,128
```

### The fix

Subtract the perihelion drift from the mean-anomaly advance. Replace `orbitMath.ts:101`:

```ts
// ϖ = Ω + ω drifts under the secular rates applied above, and mean longitude is
// L = ϖ + M. Advancing M at the full mean motion would therefore count that drift
// twice in along-track position, so remove it from the mean-anomaly advance.
// (JPL's approximate-positions scheme does the same thing by tabulating L and
// deriving M = L − ϖ.)
const perihelionDriftDegPerCentury =
  (secularRates?.argPeriapsisDegPerCentury ?? 0) +
  (secularRates?.ascendingNodeDegPerCentury ?? 0);
const perihelionDriftRad = degToRad(perihelionDriftDegPerCentury) * centuriesSinceEpoch;

const meanAnomalyRad = normalizeRadians(
  degToRad(orbit.meanAnomalyDeg ?? 0) + meanMotion * elapsedDays - perihelionDriftRad
);
```

Two properties worth noting, both of which make this safe:

1. **When `secularRates` is absent, `perihelionDriftRad` is exactly `0`**, so the function reduces bit-for-bit to `main`'s behaviour. Every body without rates — all 424 moons, all asteroids, all KBOs — is untouched.
2. It is a pure change to `resolveKeplerOrbitAtElapsedDays`, which `propagateKeplerOrbit` already funnels through (`orbitMath.ts:121`), so both the position and velocity paths pick it up with no other edit.

**Longer-term alternative** (better, more work): store JPL's `L` rate (`meanLongitudeDegPerCentury`) in `KeplerOrbitSecularRates` (`orbitMath.ts:19-25`) and compute `M = L − ϖ` directly. That matches the source tables exactly and removes the derived-quantity reasoning altogether. Do this only if you are also refreshing `planets.ts` from the JPL tables; otherwise the one-term correction above already beats `main`.

### Acceptance

- Total 8-planet position error vs a committed Horizons fixture at JD 2461275.5 is **< 3.6e6 km**, i.e. better than `main`'s 3,963,582 km. (The measured correction lands at 3,387,128 km.)
- No individual planet regresses against `main`.
- With `secularRates` stripped from a body, output is **identical** to the pre-change function.

---

## R3 — PFSS solver is an unauthenticated CPU DoS

### Root cause

Three independent problems compound. All are on `sun-focus` only; `main` has no `pfss` module at all.

**(a) The endpoint is synchronous and unbounded in `jd`.**

```python
# backend/server.py:456-458
@app.get("/solar/physics")
def solar_physics_state(          # sync def -> occupies an anyio threadpool token
    jd: float | None = None,      # only checked finite (server.py:472-473) — no range bound
```

anyio's default threadpool is **40 tokens**, and `server.py` never calls `set_default_thread_limiter`. Forty concurrent slow requests stall *every* route, including `/health`.

**(b) Client-chosen `fidelity` scales the work 4.5×, and `jd` chooses the cache bucket.**

```python
# backend/sim/solar_physics.py:1086-1099
pfss_lines, pfss_lmax = 40, 9      # low
                        80, 12     # ...
                       120, 15
                       180, 15     # highest
```

Each compute does a GONG network fetch (up to `gong_timeout_s = 6.0`), a spherical-harmonic decomposition, `pfss_solve`, `trace_field_lines` with `max_steps = 300` RK4 steps per line (`pfss_magnetogram.py:648-651`), and a 36×72 WSA velocity map at another 300 steps (`pfss_magnetogram.py:1166-1168`).

**(c) The cache is 3 entries, keyed only by Carrington rotation, with no single-flight.**

```python
# backend/sim/pfss_magnetogram.py:1093-1126
class PFSSCache:
    def __init__(self, max_entries: int = 3):
    ...
        cr = carrington_rotation_number(jd)          # :1110  — client controls jd, so client controls cr
        with self._lock:
            if cr in self._cache:
                return self._cache[cr]               # :1113-1114
        # Compute outside the lock to avoid blocking
        result = self._compute(...)                  # :1116-1117  — N concurrent misses = N full computes
        with self._lock:
            while len(self._cache) >= self._max_entries:
                oldest = min(self._cache.keys())     # :1121-1123
                del self._cache[oldest]
            self._cache[cr] = result                 # :1124
```

Varying `jd` across more than three Carrington rotations makes **every request a miss**. There is no single-flight, so concurrency multiplies rather than coalesces.

**This is also SF-4, the same code.** The key ignores `activity`, `n_lines` and `lmax` — all of which change the result. So whichever fidelity arrives *first* for a given rotation is what every later caller receives, regardless of what they asked for. Identical requests return different payloads depending on call order, which contradicts the determinism claim the branch itself added.

### The fix — three layers

**Layer 1 — correct the cache key and add single-flight** (`pfss_magnetogram.py:1093-1126`). Fixes SF-4 and removes the stampede:

```python
CacheKey = tuple[int, int, int, int]   # (cr, n_lines, effective_lmax, activity_bucket)

def _key(self, jd, activity, n_lines, lmax) -> CacheKey:
    return (
        carrington_rotation_number(jd),
        int(n_lines),
        min(int(lmax), 15),
        round(_clamp(float(activity), 0.0, 1.0) * 20),   # 5% buckets — reuse without lying
    )

def get_or_compute(self, jd, activity, n_lines=120, lmax=15, gong_timeout_s=6.0):
    key = self._key(jd, activity, n_lines, lmax)
    with self._lock:
        hit = self._cache.get(key)
        if hit is not None:
            return hit
        inflight = self._inflight.get(key)          # dict[CacheKey, threading.Event]
        if inflight is None:
            inflight = self._inflight[key] = threading.Event()
            leader = True
        else:
            leader = False

    if not leader:                                   # follower: wait for the leader, do not recompute
        if not inflight.wait(timeout=self._wait_timeout_s):
            raise TimeoutError("PFSS computation timed out")
        with self._lock:
            return self._cache[key]

    try:
        result = self._compute(key[0], activity, jd, n_lines, min(lmax, 15), gong_timeout_s)
        with self._lock:
            while len(self._cache) >= self._max_entries:
                self._cache.pop(next(iter(self._cache)))   # insertion-ordered -> true LRU-ish
            self._cache[key] = result
        return result
    finally:
        with self._lock:
            self._inflight.pop(key, None)
        inflight.set()
```

Raise `max_entries` to something like 12 now that the key is finer-grained, otherwise legitimate multi-fidelity use thrashes.

**Layer 2 — bound the work a single request can buy** (`server.py:456-473`):

- Clamp `jd` to a sane range (the model is a Cycle-25 envelope; something like J2000 ± 200 years is generous). Reject outside it with 400, as `max_features` is already clamped at `server.py:489`.
- Add a **global PFSS concurrency semaphore** (e.g. 2–4 permits). On exhaustion return `503` with `Retry-After` rather than queueing into the threadpool. This is the single most important change: it decouples PFSS cost from total API availability.
- Drop `gong_timeout_s` from 6.0 s to ~2.0 s, and skip the GONG fetch entirely when a synthetic fallback is acceptable for the requested fidelity.

**Layer 3 — get PFSS off the request path** (the real fix, if you want `/solar/physics` to stay fast):

Precompute PFSS per Carrington rotation on a background task at startup and on rotation boundaries, and have the request path serve **only** from cache — returning the nearest available rotation with an explicit `pfss_source`/`pfss_stale` flag when a fresh one is not ready. PFSS genuinely is expensive; the defect is that an anonymous HTTP request can *trigger* it, not that it costs what it costs.

Do Layer 1 + Layer 2 to unblock adoption. Schedule Layer 3.

### Acceptance

- 40 concurrent `GET /solar/physics` with **distinct** `jd` values spanning many rotations at the highest fidelity: `/health` p95 stays **< 50 ms** throughout, and no request exceeds the semaphore-derived bound.
- Two identical requests return **byte-identical** payloads; two requests differing only in `fidelity` return **different** payloads (proves the key fix).
- `jd` outside the accepted range returns **400**, not a compute.
- Cache hit rate under a realistic multi-fidelity load is > 0 (i.e. the finer key did not destroy reuse).

---

## R4 — Close the test gap that let R1 and R2 land

Both regressions passed a green suite. That is the more important finding, because it will keep happening.

**What is wrong with the current tests:**

- `catalog.test.ts` **re-implements the code under test**, so it agrees with the implementation by construction and passes while results are ~160° wrong. A test that cannot fail.
- The new `orbitMath` tests assert only that elements **changed** under secular rates — never that accuracy **improved**. R2 satisfies "changed" perfectly while being 4.8× worse.

**The rule to adopt:** a numerical test must compare against an **external oracle committed to the repo**, never against a recomputation of the same formula.

Concretely:

1. **Commit Horizons fixtures.** A small JSON of heliocentric ecliptic-J2000 state vectors for the 8 planets + Pluto at 3–4 epochs (J2000, 2015-06-15, 2026-08-23, 2050-01-01), with the query recorded in a sibling `.md` so it is regenerable. A few kB.
2. **Replace the tautological moon test** with the same treatment: parent-relative Horizons vectors for Io, Europa, Ganymede, Callisto, Titan, Enceladus, Triton, Charon, Miranda, plus **Earth's Moon as a control** (it bypasses the frame converter, so a failure there indicts the harness rather than the code).
3. **Assert error budgets, not deltas.** For R2: total 8-planet error `< 3.6e6 km` at the 2026 epoch. For the moons: each within a stated fraction of its orbital radius.
4. **Add a "no rates ⇒ no change" invariant test** so the R2 correction cannot silently alter bodies that have no `secularRates`.
5. **Add the R1 physical invariant** as a backend test: after `kuiper.activate`, every massive perturber has `e < 0.1`. Unit-agnostic, and it fails loudly on any future unit drift.
6. **Add a PFSS determinism test**: same request twice ⇒ identical payload; different `fidelity` ⇒ different payload.

Items 1, 3 and 5 are what would have caught R1 and R2 on the commit that introduced them.

---

## Landing sequence

1. **R1** — `kuiper.py` unit-aware `activate` + `server.py` passes `velocity_units` + the unbound-perturber post-condition. Verify the three planets' elements.
2. **R2** — the one-term `orbitMath.ts:101` correction. Verify against the Horizons fixture; confirm the no-rates invariant.
3. **R4 (items 1, 3, 4, 5)** — land the fixtures and the invariant tests *with* R1/R2 so both are locked in. Confirm the new tests **fail** against the unfixed code before merging (a test that has never been seen red is not evidence).
4. **R3 Layers 1–2** — cache key + single-flight + semaphore + `jd` bound. Run the concurrency acceptance check.
5. Re-run the full baseline: `tsc --noEmit` (expect 344, unchanged), `npm test`, `pytest`. **`pytest` should still show the one pre-existing failure** — `test_rebound_engine_exports_self_describing_barycentric_states`, which fails on the `ias15`/REBOUND 5 break that neither branch fixes. That is a separate item on the shared roadmap, not something this plan introduces or resolves.
6. Only then adopt `sun-focus` as canonical.
7. **R3 Layer 3** and the remaining SF-4..SF-10 items follow on the normal roadmap.

## Risk and rollback

- **R1 and R2 are both small, local, and independently revertable.** R2 in particular reduces exactly to current-`main` behaviour when rates are absent, so the blast radius is confined to the 8 planets that have `secularRates`.
- **R3 Layer 2's semaphore changes failure mode under load** from "everything gets slow" to "PFSS requests get 503". That is the intended trade, but it is user-visible — make sure the frontend's solar client treats 503 as "retry later", not as a hard error.
- **Do not land R3 Layer 1 without Layer 2.** Fixing the cache key alone *increases* miss rate (the key is finer), so without the semaphore it would make the DoS marginally easier, not harder.

## Out of scope here

The seven other `sun-focus` majors (SF-5 ephemeris chain reordering, SF-6 moon periapsis rotation, SF-7 binary KBOs, SF-8 Kuiper payload shape, SF-9 beyond the test-rule change above, SF-10) and everything inherited from `main` — including the `ias15` engine break, the belt transform order, and the security posture — are tracked in [Report C §6–§7](MAJOR_ISSUE_REPORT_C_SUNFOCUS_HUNT_2026-08-23.md). One note carried from Report C: **SF-6 must not be fixed in isolation** — the periapsis rotation is layered on the uncorrected orbit-normal sign convention (K-05), and fixing either one alone makes the moons worse. They are a single change.
