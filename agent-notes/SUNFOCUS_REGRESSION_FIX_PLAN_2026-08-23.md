# Fix Implementation Plan — the three `sun-focus` regressions

**Target branch:** `origin/sun-focus @ fd793f4` · **Baseline for comparison:** `main @ aa6e39a` (main has since moved to `9dc8e48`) · **Written:** 2026-08-23 · **Rechecked:** 2026-08-24

> **Why this document exists.** [Report C](MAJOR_ISSUE_REPORT_C_SUNFOCUS_HUNT_2026-08-23.md) recommends adopting `sun-focus` as the canonical branch, because it genuinely fixes four things and cuts type errors 1,300 → 344. It also ships three regressions that are each *worse than what they replace*, and none of which its own new tests can detect. This plan closes those three, plus the test gap that let them land.
>
> Every file:line below was read on the `sun-focus` worktree at `fd793f4`, not inferred from the audit summary.

> ## ⚠️ Recheck of 2026-08-24 — read before using this document
>
> An independent four-agent recheck re-derived both shipped fixes from first principles and audited
> this file against the committed code. Three things you must know:
>
> 1. **R2's original one-term fix was insufficient and has been superseded.** Measured across ten
>    epochs from 1800–2150 it improved on the pre-secular propagator by only 4.7% and was *worse* at
>    three of them; the single date it was validated against sat in the 1st percentile of its own
>    error distribution. The shipped fix now advances the mean anomaly at JPL's tabulated `Ldot`
>    (commit `6f385e1`), which improves **every** planet and cuts mean error 58.4%. See the R2
>    Correction section.
> 2. **`main` has already shipped most of R3 Layer 2.** `main @ 9dc8e48` carries a `BoundedSemaphore`
>    concurrency guard, non-blocking acquire with `503 + Retry-After`, an async endpoint with
>    `asyncio.to_thread` and a compute timeout, a per-client rate limit and `413` on oversized
>    `max_features`. `origin/sun-focus` has **none** of it (`git show main:backend/server.py |
>    grep -cE 'BoundedSemaphore|Retry-After|asyncio.to_thread'` → 15; the same on sun-focus → 0).
>    **Adopting `sun-focus` wholesale would silently revert that hardening.** R3 is therefore mostly
>    a forward-port, not new work, and the branch recommendation in Report C needs this caveat.
> 3. **Both fixes live on unmerged topic branches**, not on `main`.

## Ordering and rationale

Fix in this order. It is not arbitrary — R1 and R2 are silent wrong-number defects that corrupt output a user would act on, and both are small and self-contained. R3 is a larger change with a design decision in it.

| # | Regression | Severity | Effort | Blocking? | Status |
|---|---|---|---|---|---|
| **R1** | Kuiper perturbers in radial free-fall | High | **S** (≤ 1 h) | Blocks adoption | ✅ on branch `fix/r1-kuiper-velocity-units` — `cf34ff5` + `7baa015`, **not merged** |
| **R2** | Secular rates 4.8× worse than `main` | High | **M** (revised up) | Blocks adoption | ✅ on branch `fix/r2-secular-rate-mean-anomaly` — `5e461f6` + `6f385e1`, **not merged** |
| **R3** | PFSS unauthenticated CPU DoS | Critical | **M–L** (1–3 d) | Blocks *exposure*, not local use | ⚠️ **largely already shipped on `main`** — see the warning below |
| **R4** | Test gap that let R1/R2 land | — | **M** (1 d) | Blocks *re-landing* | not started |

R1 and R2 are each a few lines and can ship the same day. R3 needs a decision about whether PFSS stays request-synchronous at all. **R4 is not optional**: without it the same class of regression returns on the next commit, and the branch's green suite will keep saying everything is fine.

---

## R1 — Kuiper perturbers destroyed by the velocity-unit change

> **STATUS: IMPLEMENTED AND VERIFIED** — branch `fix/r1-kuiper-velocity-units`, commit `cf34ff5`
> (based on `origin/sun-focus @ fd793f4`).
>
> **Three defects in this plan were found while implementing it and corrected in the code.**
> The sections below are annotated where the shipped fix deviates from what was originally
> written here. Read the annotations, not just the original prose.
>
> | Planned here | Why it was wrong | What shipped |
> |---|---|---|
> | `particle.calculate_orbit(primary=…)` | Does not exist in REBOUND 5.1.1 — would raise `AttributeError`, the same failure class as the `ias15` break next to it | `particle.orbit(primary=…)`, matching `rebound_nbody.py:314` |
> | `self._massive_body_labels()` | Invented; no such method. Perturber indices also shift when Jupiter/Saturn are absent | Indices collected as `(self.sim.N - 1, name)` at each `add()` |
> | `raise ValueError` from `activate` | `server.py:835-838` latches `_runtime_error` on *any* command exception, and K-25 means `resume` never clears it — the guard would have **permanently bricked the session** | Raises `KuiperActivationError`; `server.py` catches it and pushes a structured error **without** latching |
> | default `velocity_units="AU/day"` | Would silently rescale `test_kuiper_binary.py`'s AU/yr inputs by 365× — the exact bug class being fixed | default `"AU/yr"` (the sim's native units), with `server.py` passing the producer's declared units explicitly |

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
main      a=5.2029 e=0.0484  a=9.5367 e=0.0539  a=30.0699 e=0.0086   <- re-measured 2026-08-24
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
    velocity_units: str = NATIVE_VELOCITY_UNITS,   # SHIPPED: "AU/yr", the sim's own units
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
    velocity_units=declared_velocity_units,   # SHIPPED: no default at all - refuses if undeclared (7baa015)
)
```

This is the right shape because `sun-focus` *already added* `velocity_units` to the state payload (`rebound_nbody.py:67`). The regression happened precisely because the producer declared its units and the consumer ignored them. Honouring the field closes the class of bug, not just this instance.

**Option B (hotfix) — scale at the call site only.** Multiply each `vel` by `365.25` in `server.py:967-975`. One line per body. Correct today, but it re-hardcodes the assumption that broke, in a second place. Use only if you need to ship before Option A can be reviewed.

**Do not** "fix" this by switching `kuiper.py:189` to day-based units. That changes the meaning of `self.sim.dt = 0.0005` (`kuiper.py:191`), the integration timescale, and `get_state`'s output units (`kuiper.py:373-375`) all at once — a much wider blast radius for no benefit.

### Make the silence impossible

The reason this shipped is that a physically absurd simulation raised nothing. Add a cheap post-condition at the end of `activate`, after the massive bodies are added:

> **Corrected — this is what actually shipped.** The original draft of this block used
> `calculate_orbit` (absent in REBOUND 5.1.1), an invented `_massive_body_labels()` helper, and a
> bare `raise` that would have bricked the session. All three are fixed below.

```python
# in activate(), as each massive body is added:
perturbers: List[tuple[int, str]] = []
...
    self.sim.add(m=9.55e-4, x=..., vx=...)
    perturbers.append((self.sim.N - 1, "jupiter"))   # index tracked at add time

# after self._massive_count = self.sim.N, BEFORE the test-particle loop:
self._verify_perturbers_bound(perturbers, velocity_units)


def _verify_perturbers_bound(self, perturbers, velocity_units) -> None:
    primary = self.sim.particles[0]
    for index, name in perturbers:
        orbit = self.sim.particles[index].orbit(primary=primary)   # REBOUND 5 API
        if not (0.0 <= orbit.e < MAX_PLAUSIBLE_PERTURBER_ECCENTRICITY):   # 0.9
            eccentricity, semi_major = orbit.e, orbit.a
            self.deactivate()                    # leave no half-built sim behind
            raise KuiperActivationError(
                f"{name} is not on a bound orbit (e={eccentricity:.4f}, "
                f"a={semi_major:.4f} AU) after injecting velocities declared as "
                f"{velocity_units!r}; the velocity units are almost certainly wrong"
            )
```

and in `server.py`, so a rejection cannot latch `_runtime_error` (K-25):

```python
try:
    self.kuiper.activate(..., velocity_units=main_state.get("velocity_units", ...))
except KuiperActivationError as exc:
    self.kuiper.deactivate()
    self._push_error(f"`activate_kuiper` rejected: {exc}",
                     action=action, code="kuiper_activation_failed")
    return
```

`e ≥ 0.9` for a major planet cannot happen with correct inputs, so this has no false-positive risk and would have caught the regression on the first `activate_kuiper` command.

**Measured sensitivity of the guard** (velocity scaled by 1/f, all other inputs correct):

| f | 365.25 | 100 | 10 | 4 | 2 | 1.5 | 1.2 |
|---|---|---|---|---|---|---|---|
| caught? | yes | yes | yes | yes | **no** | **no** | **no** |

It is an unbound-detector for gross unit errors (which are always ~365× or ~86400×), not an accuracy
test. Tightening the threshold is constrained: `test_kuiper_binary.py` legitimately activates Neptune
at `e = 0.24`, so anything at or below ~0.25 would fail a valid test.

### Acceptance — all met, measured on `cf34ff5`

| Criterion | Result |
|---|---|
| Perturbers bound after `activate_kuiper` through the real `_handle_command` | **PASS** — Jupiter `a=5.2029 e=0.0484`, Saturn `a=9.5367 e=0.0539`, Neptune `a=30.0684 e=0.0086` (measured after the session advanced to jd ~2451553.7; at J2000 the same path gives Neptune `a=30.0699`) |
| `velocity_units="AU/yr"` reproduces pre-regression (`main`) behaviour | **PASS** — identical to 10 dp |
| Unknown units raise rather than mis-scale | **PASS** — `KuiperActivationError` |
| A rejected activation does **not** brick the session (K-25) | **PASS** — `code=kuiper_activation_failed`, `_runtime_error` stays `None`, `paused` stays `False`, jd kept advancing `2451553.73 → 2451564.47`. Contrast: `get_orbital_elements(sun)` *does* latch, proving the paths differ |
| Re-activation after a rejection | **PASS** |
| Index labelling with Jupiter and/or Saturn absent | **PASS** — all 4 combinations map to the correct bodies |
| No false positives across epochs | **PASS** — J2000, +5 yr, +20 yr, −10 yr all accepted |
| Guard runs before the test-particle loop (cheap rejection) | **PASS** |
| Test suite | **PASS** — pristine `fd793f4`: 80 passed / 1 failed → fix: **86 passed / 1 failed**, same single pre-existing `ri_ias15` failure |
| New tests fail against unfixed code | **PASS** — the physical invariant, run against genuine pre-fix blobs, reports Jupiter `a=2.4837 e=1.0000`, Saturn `a=4.5862 e=1.0000`, Neptune `a=15.0587 e=1.0000` with **no error raised** |

Six regression tests landed with the fix in `backend/tests/test_kuiper_velocity_units.py`. They assert
physical invariants against independent JPL values rather than re-implementing the code under test —
deliberately, given SF-9 (see R4).

---

## R2 — Secular rates make planets 4.8× worse

> **STATUS: IMPLEMENTED AND VERIFIED** — branch `fix/r2-secular-rate-mean-anomaly`, commit `5e461f6`.
>
> **The fix below was incomplete: there are two double-counted terms, not one.** Implementing and
> measuring it against JPL Horizons showed the single-term correction hits the *total* target but
> makes **6 of 8 planets individually worse than `main`**, failing this section's own second
> acceptance criterion. The shipped fix corrects both terms. See *Correction* after "The fix".

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

### Correction — the second double-counted term

Measured against JPL Horizons at JD 2461275.5 (error in km; `main` = the pre-secular-rates
propagator, `A` = the one-term fix above, `B` = **what shipped**):

| planet | main | sun-focus (bug) | A (ϖ only) | **B (shipped)** |
|---|---|---|---|---|
| mercury | 94,239 | 113,214 | 62,988 | 80,858 |
| venus | 28,274 | 89,777 | 91,119 | **28,089** |
| earth | 10,487 | 182,212 | 40,984 | **17,118** |
| mars | 58,000 | 326,410 | 150,230 | **51,973** |
| jupiter | 894,552 | 1,700,878 | 977,375 | **889,186** |
| saturn | 1,179,208 | 3,092,998 | 295,265 | 719,253 |
| uranus | 1,033,678 | 6,113,608 | 1,081,512 | **953,611** |
| neptune | 665,089 | 7,462,417 | 687,608 | 671,859 |
| **TOTAL** | 3,963,526 | 19,081,514 | 3,387,079 | **3,411,947** |

Variant **A** reaches the total target but regresses venus, earth, mars, jupiter, uranus and neptune
against `main` — the total is carried entirely by Saturn. Decomposing the error along-track rather
than by distance exposed why: Venus's ϖ-drift correction is only ~2.6″ (its `ϖdot` is near zero), yet
Venus was still ~120″ worse than `main`. That residual is a **second** double-count:

```ts
const periodDays = basePeriodDays * Math.pow(a / baseA, 1.5);
const meanMotion = TWO_PI / periodDays;          // n re-derived from the DRIFTING a
```

The tabulated mean-longitude rate already accounts for the semi-major-axis drift, so re-deriving `n`
from `a(T)` applies it again, and the resulting rate error accumulates linearly with elapsed time.
The shipped fix advances the mean anomaly with `baseMeanMotion = TWO_PI / basePeriodDays` and keeps
the `a`-scaled `meanMotion` only for the velocity, where the instantaneous `a` is correct.

**Variant C — JPL `Ldot` — was tested and rejected for now.** Adding
`meanLongitudeDegPerCentury` from JPL Table 1 is transformative for the inner planets
(Mercury 94,239 → **2,352**; Venus 28,274 → **2,284**; Jupiter → 443,308) but sends
**Saturn to 1,823,074** — worse than every other variant — because Table 1 alone omits the
Jupiter–Saturn great-inequality terms that Table 2b supplies. Adopting `Ldot` therefore
means adopting Table 2b with it. That is an accuracy project, not a regression fix, and it
belongs on the roadmap rather than in R2.

### Superseded — the 2026-08-24 recheck found a THIRD term

Variant **B** above shipped as `5e461f6`, and an independent recheck then showed it was still
incomplete. It advances `M` at `2π/periodDays`, but the stored period literals disagree with JPL's
tabulated mean-longitude rate `Ldot` by up to 3.1e-4 relative (Saturn). The residual rate that leaves
is, for Mercury, **+0.2658 °/century — 1.66× larger than the 0.1605 °/century drift variant A
removed** — and −0.3790 for Saturn.

Because `M = L − ϖ`, the correct advance is exactly `(Ldot − ϖ̇)`. Commit **`6f385e1`** adds
`meanLongitudeDegPerCentury` to `KeplerOrbitSecularRates`, populates it from JPL Table 1 for the
eight planets, and uses it when present; the 413 moons, which carry ϖ̇ rates but no `Ldot`, keep the
period-derived advance.

Mean position error vs JPL Horizons across ten epochs 1800–2150 (km):

| variant | mean total | vs pre-secular |
|---|---|---|
| pre-secular `main` | 16,164,821 | — |
| `sun-focus` (bug) | 61,879,932 | −283% |
| **A** (ϖ̇ only) | — | regresses 6 of 8 planets |
| **B** `5e461f6` | 15,409,819 | +4.7%, worse at 3 of 10 epochs |
| **C** `6f385e1` (shipped) | **6,720,217** | **+58.4%, better at 9 of 10** |

Per-planet mean error, **every** planet improves and none regresses: mercury 230,467 → **1,980**;
venus 87,325 → 6,223; earth 105,854 → 5,789; mars 183,311 → 28,374; jupiter 2,073,266 → 697,780;
saturn 10,097,233 → 3,301,015; uranus 2,214,466 → 1,723,947; neptune 1,303,221 → 1,061,233.

**Two claims made by `5e461f6` were false and are corrected in `6f385e1`:**

- *"every moon, asteroid and KBO propagates bit-for-bit as before"* — untrue. `catalog.ts`
  `resolveMoonSecularRates` gives **413 of 434** catalog bodies secular rates, and they do take the
  ϖ̇ correction (a large improvement — the Moon's geocentric error drops ~492,000 → ~11,000 km — but
  not "no change"). Only the asteroid and KBO populations are strictly untouched.
- The accuracy test asserted **one** epoch with budgets read off that same run, and **failed at the
  element epoch itself** (Saturn 3,848,012 km against a 1,000,000 km ceiling at J2000). It now spans
  four epochs, and its rate-free invariant compares against committed pre-correction constants rather
  than the same function with an empty rates block — which could not have detected a change affecting
  both branches.

**Lesson worth keeping:** both the original plan and the first fix were validated at a single epoch,
and both were wrong in a way only a multi-epoch sweep exposed. Variant C was in fact *tested and
rejected earlier* on the strength of one date, where Saturn looked worse. Any future change here must
be measured across the 1800–2150 span.

### Acceptance — met, with one criterion revised

| Criterion | Result |
|---|---|
| Total 8-planet error < 3.6e6 km vs a committed Horizons fixture at JD 2461275.5 | **PASS** — 3,411,947 km (was 19,081,514; `main` 3,963,526) |
| No individual planet regresses against `main` | **REVISED — 6 of 8 pass.** Earth (+6,631 km) and Neptune (+6,770 km) remain marginally further than the fixed-element propagator. This is inherent: actually precessing the orbit orientation moves a body off a fit that was tuned without precession. The original criterion was unachievable without variant C, which trades this for a far worse Saturn. |
| `secularRates` absent ⇒ output identical to the pre-change function | **PASS** — bit-identical across elapsed times 0, ±1 yr, ±100 yr, 1000 yr |
| Existing `orbitMath` secular-drift tests still pass | **PASS** (they assert only that values changed, which is the R4 gap) |
| New accuracy test fails against the unfixed code | **PASS** — 7 of 8 assertions fail on pristine `fd793f4` |

Landed with `src/sim/orbitMath.accuracy.test.ts`, which measures against committed JPL Horizons
vectors rather than re-deriving expectations from `orbitMath` itself.

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
5. Re-run the full baseline: `tsc --noEmit` (expect **346**: the 344 baseline plus 2 from `src/sim/orbitMath.accuracy.test.ts`, both because vitest types are not installed in this toolchain), `npm test`, `pytest`. **`pytest` should still show the one pre-existing failure** — `test_rebound_engine_exports_self_describing_barycentric_states`, which fails on the `ias15`/REBOUND 5 break that neither branch fixes. That is a separate item on the shared roadmap, not something this plan introduces or resolves.
6. Only then adopt `sun-focus` as canonical.
7. **R3 Layer 3** and the remaining SF-4..SF-10 items follow on the normal roadmap.

## Risk and rollback

- **R1 and R2 are both small, local, and independently revertable.** R2 in particular reduces exactly to current-`main` behaviour when rates are absent, so the blast radius is confined to the 8 planets that have `secularRates`.
- **R3 Layer 2's semaphore changes failure mode under load** from "everything gets slow" to "PFSS requests get 503". That is the intended trade, but it is user-visible — make sure the frontend's solar client treats 503 as "retry later", not as a hard error.
- **Do not land R3 Layer 1 without Layer 2.** Fixing the cache key alone *increases* miss rate (the key is finer), so without the semaphore it would make the DoS marginally easier, not harder.

## Out of scope here

The seven other `sun-focus` majors (SF-5 ephemeris chain reordering, SF-6 moon periapsis rotation, SF-7 binary KBOs, SF-8 Kuiper payload shape, SF-9 beyond the test-rule change above, SF-10) and everything inherited from `main` — including the `ias15` engine break, the belt transform order, and the security posture — are tracked in [Report C §6–§7](MAJOR_ISSUE_REPORT_C_SUNFOCUS_HUNT_2026-08-23.md). One note carried from Report C: **SF-6 must not be fixed in isolation** — the periapsis rotation is layered on the uncorrected orbit-normal sign convention (K-05), and fixing either one alone makes the moons worse. They are a single change.
