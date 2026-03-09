# Solar Corona Model -- Physics Gaps: Engineering Plan

**Author:** Opus 4.6 (Claude)
**Date:** 2026-02-17
**Scope:** Four physics improvements to `SolarCoronaPhysicsModel` in `backend/sim/solar_physics.py` and associated frontend rendering
**Relates to:** Development_History_Context.md entry 2026-02-17 05:07:33 UTC; CODEX_XHIGH 2026-02-16 19:47:16

---

## Table of Contents

1. [Situation Assessment](#1-situation-assessment)
2. [Work Item 1: Asymmetric Activity Cycle (Hathaway Function)](#2-work-item-1-asymmetric-activity-cycle-hathaway-function)
3. [Work Item 2: Bipolar Active Region Topology](#3-work-item-2-bipolar-active-region-topology)
4. [Work Item 3: CME Speed Distribution Correction](#4-work-item-3-cme-speed-distribution-correction)
5. [Work Item 4: Parker Spiral Visualization](#5-work-item-4-parker-spiral-visualization)
6. [Execution Order and Dependencies](#6-execution-order-and-dependencies)
7. [File Impact Map](#7-file-impact-map)
8. [Validation Strategy](#8-validation-strategy)
9. [Risk Register](#9-risk-register)

---

## 1. Situation Assessment

### What exists today

The solar corona model (`backend/sim/solar_physics.py`, class `SolarCoronaPhysicsModel`) is a quasi-MHD deterministic synthesis engine producing 3D coronal structures. It generates 540 flux tube seeds across four families (`loop`, `loop`, `plume`, `cme`), applies Snodgrass differential rotation, and emits feature arcs in solar-radii coordinates via the `/solar/physics` API endpoint.

The frontend (`src/frontend/features/solar/sunVisuals.js`) renders these as Three.js `Line` objects with per-frame flow/wobble animation, blended smoothly between backend snapshots via `solarFeatureBlending.js`. A fallback sinusoidal activity calculation exists in `src/main.js:3586-3590` for when the backend is unavailable.

### What is wrong

| Gap | Current behavior | Physical reality | Severity |
|-----|-----------------|------------------|----------|
| Symmetric activity cycle | `sin(cycle_phase)` envelope with harmonic | Asymmetric: ~4 yr rise, ~7 yr fall (Hathaway 2015) | Moderate |
| No magnetic topology | Each flux tube is an independent seed with random polarity | Coronal loops connect bipolar footpoints within active regions following Hale's law and Joy's law | Moderate |
| CME speed range too narrow | 260--2060 km/s | 20--3500 km/s (Yashiro et al. 2004); log-normal distribution | Low-Moderate |
| No Parker spiral | Nothing beyond ~4.6 solar radii | Interplanetary magnetic field follows Archimedean spiral out to the heliopause | Low-Moderate |

### Guiding constraints

- The model must remain **deterministic** (seeded RNG, no stochastic sampling at query time).
- Backend response latency must stay under **50 ms** for `operational` fidelity.
- The arc output format (`[[x,y,z], ...]`) must remain unchanged so the frontend blending system works without modification (except for the new Parker spiral layer).
- The frontend fallback activity calculation in `main.js` should be updated to match the backend Hathaway shape.

---

## 2. Work Item 1: Asymmetric Activity Cycle (Hathaway Function)

### Physics background

The Hathaway (1994, 2015) sunspot-number model describes a single solar cycle as:

```
F(t) = a * (t / b)^3 / (exp((t / b)^2) - c)
```

Where:
- `t` = time in months since cycle start (t >= 0)
- `a` = amplitude scaling (proportional to cycle strength)
- `b` = rise-time parameter (controls how quickly the cycle peaks; typically ~50--60 months)
- `c` = asymmetry parameter (controls the slow-decay tail; typically 0.71)

Key properties:
- Peak occurs near `t_peak = b * sqrt(3/2)` months, which for b=54 gives ~66 months (~5.5 years from start, meaning ~4 years of steep rise portion)
- The decay tail is elongated: the function falls to half-peak around t ~ 2.2*b months
- For c=0.71, the rise occupies roughly 36% of the cycle and the fall occupies 64% -- matching the observed ~4yr / ~7yr asymmetry

Typical fitted parameters per cycle (Hathaway 2015, Table 1):

| Cycle | a (amplitude) | b (months) | c | Start year |
|-------|--------------|------------|------|------------|
| 21 | 193 | 54.0 | 0.71 | 1976.5 |
| 22 | 192 | 51.0 | 0.71 | 1986.8 |
| 23 | 150 | 56.4 | 0.71 | 1996.8 |
| 24 | 116 | 58.2 | 0.71 | 2008.9 |
| 25 | ~145 (est.) | ~52 (est.) | 0.71 | 2019.9 |

For our deterministic model we do not need to reproduce exact historical sunspot numbers. We need the **shape** -- the asymmetric rise/fall envelope -- normalized to [0, 1].

### Current code (to be replaced)

`backend/sim/solar_physics.py`, lines 154--161:

```python
@staticmethod
def _activity_index(jd: float) -> tuple[float, float]:
    cycle_phase = ((jd - J2000_JD) / SOLAR_CYCLE_DAYS) * 2.0 * math.pi
    long_wave = 0.5 + 0.5 * math.sin(cycle_phase - 0.4)
    harmonic = 0.5 + 0.5 * math.sin(cycle_phase * 2.0 + 1.1)
    rotation_mod = 0.5 + 0.5 * math.sin(((jd - J2000_JD) / 27.2753) * 2.0 * math.pi)
    activity = 0.15 + long_wave * 0.55 + harmonic * 0.18 + rotation_mod * 0.12
    return _clamp(activity, 0.02, 0.98), cycle_phase
```

Also the frontend fallback in `src/main.js`, lines 3586--3590:

```javascript
const solarCycleYears = (julianDate - J2000_JD) / 365.25;
const cyclePhase = (solarCycleYears / 11.0) * TWO_PI;
const cycleActivity = 0.5 + 0.5 * Math.sin(cyclePhase);
const shortPulse = 0.5 + 0.5 * Math.sin(timeSec * 0.37);
const fallbackActivity = Math.min(1, Math.max(0, 0.28 + cycleActivity * 0.47 + shortPulse * 0.25));
```

### Implementation plan

**Step 1: Add a module-level Hathaway helper function**

Add above the `SolarCoronaPhysicsModel` class:

```python
# Reference epoch for solar cycle chaining.
# Cycle 25 minimum: ~December 2019 (JD 2458849.5)
_CYCLE_25_START_JD = 2_458_849.5
_CYCLE_LENGTH_MONTHS = 132.0  # 11 years in months
_HATHAWAY_B = 54.0            # rise-time parameter (months)
_HATHAWAY_C = 0.71            # asymmetry parameter

def _hathaway_raw(t_months: float, b: float = _HATHAWAY_B, c: float = _HATHAWAY_C) -> float:
    """Unnormalized Hathaway function. t_months must be > 0."""
    if t_months <= 0:
        return 0.0
    ratio = t_months / b
    ratio2 = ratio * ratio
    ratio3 = ratio2 * ratio
    denom = math.exp(ratio2) - c
    if denom < 1e-12:
        return 0.0
    return ratio3 / denom

def _hathaway_normalized(t_months: float, b: float = _HATHAWAY_B, c: float = _HATHAWAY_C) -> float:
    """Hathaway function normalized so the peak is 1.0."""
    # Peak location: t_peak = b * sqrt(3/2)
    # Peak value computed analytically
    t_peak = b * math.sqrt(1.5)
    peak_val = _hathaway_raw(t_peak, b, c)
    if peak_val < 1e-12:
        return 0.0
    return min(1.0, _hathaway_raw(t_months, b, c) / peak_val)
```

**Step 2: Rewrite `_activity_index`**

```python
@staticmethod
def _activity_index(jd: float) -> tuple[float, float]:
    # Determine position within the current ~11-year cycle.
    days_since_c25 = jd - _CYCLE_25_START_JD
    cycle_length_days = _CYCLE_LENGTH_MONTHS * 30.44  # ~4018 days
    # Modular wrap to handle past/future cycles.
    cycle_offset_days = days_since_c25 % cycle_length_days
    if cycle_offset_days < 0:
        cycle_offset_days += cycle_length_days
    t_months = cycle_offset_days / 30.44

    # Core asymmetric envelope via Hathaway function.
    hathaway_envelope = _hathaway_normalized(t_months, _HATHAWAY_B, _HATHAWAY_C)

    # Retain solar-rotation modulation as a secondary oscillation.
    rotation_mod = 0.5 + 0.5 * math.sin(((jd - J2000_JD) / 27.2753) * 2.0 * math.pi)

    # Compose: Hathaway envelope dominates, rotation adds small fluctuation.
    activity = 0.06 + hathaway_envelope * 0.82 + rotation_mod * 0.10

    # Cycle phase in radians (0 = cycle start, 2*pi = cycle end) for compatibility.
    cycle_phase = (t_months / _CYCLE_LENGTH_MONTHS) * 2.0 * math.pi
    return _clamp(activity, 0.02, 0.98), cycle_phase
```

**Step 3: Update the frontend fallback**

In `src/main.js`, replace the sinusoidal fallback (lines 3586--3590) with a JavaScript port of the same Hathaway function. This ensures visual consistency even when the backend is unreachable:

```javascript
const CYCLE_25_START_JD = 2458849.5;
const CYCLE_LENGTH_MONTHS = 132.0;
const HATHAWAY_B = 54.0;
const HATHAWAY_C = 0.71;

function hathawayNormalized(tMonths) {
  if (tMonths <= 0) return 0;
  const ratio = tMonths / HATHAWAY_B;
  const ratio2 = ratio * ratio;
  const ratio3 = ratio2 * ratio;
  const denom = Math.exp(ratio2) - HATHAWAY_C;
  if (denom < 1e-12) return 0;
  const raw = ratio3 / denom;
  const tPeak = HATHAWAY_B * Math.sqrt(1.5);
  const rP = tPeak / HATHAWAY_B;
  const peakVal = (rP * rP * rP) / (Math.exp(rP * rP) - HATHAWAY_C);
  return Math.min(1, raw / peakVal);
}

// Inside updateSunDynamics:
const daysSinceC25 = julianDate - CYCLE_25_START_JD;
const cycleDays = CYCLE_LENGTH_MONTHS * 30.44;
const offsetDays = ((daysSinceC25 % cycleDays) + cycleDays) % cycleDays;
const tMonths = offsetDays / 30.44;
const cycleActivity = hathawayNormalized(tMonths);
```

**Step 4: Add `activity_cycle_model` metadata to the `capabilities()` response**

Add to the capabilities dict:
```python
"activity_cycle_model": "hathaway_2015_normalized",
"activity_cycle_params": {
    "b_months": _HATHAWAY_B,
    "c_asymmetry": _HATHAWAY_C,
    "reference_cycle_start_jd": _CYCLE_25_START_JD,
},
```

### Validation

- Plot `_activity_index(jd)` for JD spanning 2019.9 to 2030.9 (one full cycle). Confirm:
  - Peak activity occurs ~5.5 years after cycle start (~2025.4)
  - Rise from minimum to peak takes ~4 years
  - Fall from peak to next minimum takes ~7 years
  - The curve is visibly asymmetric (steep rise, gradual fall)
- Compare the normalized shape against Fig. 1 of Hathaway (2015) for qualitative match.
- Verify that the rotation modulation (27.27-day period) produces visible small oscillations on top of the envelope.
- Confirm `activity_index` range remains within [0.02, 0.98].
- Run existing test: `pytest -q backend/tests/test_solar_physics_api.py`.

---

## 3. Work Item 2: Bipolar Active Region Topology

### Physics background

Real active regions on the Sun are **bipolar magnetic regions** (BMRs) obeying two empirical laws:

1. **Hale's polarity law**: The leading polarity of active regions alternates between odd and even solar cycles. In odd-numbered cycles (e.g., Cycle 25), the leading polarity in the northern hemisphere is negative; in even cycles it flips.

2. **Joy's law**: The tilt angle of the bipolar axis with respect to the east-west direction increases with latitude. The empirical relation is approximately:
   ```
   tilt_deg ~ 0.5 * |latitude_deg|
   ```
   With scatter of ~15 degrees around this mean (Wang & Sheeley 1991).

A coronal loop physically connects the two footpoints (leading and trailing polarity) of a single BMR. The loop height scales roughly with the footpoint separation distance.

### Current code (problematic)

`_build_flux_tube_seeds()` (lines 103--132) creates each tube with a single random footpoint. There is no concept of paired footpoints, Joy's law tilt, or Hale's polarity law. The `chirality` field is assigned randomly rather than being derived from hemisphere + cycle parity.

### Implementation plan

**Step 1: Add an `ActiveRegion` dataclass**

```python
@dataclass(frozen=True)
class ActiveRegion:
    region_id: int
    center_lat_rad: float
    center_lon_rad: float
    tilt_rad: float          # Joy's law tilt
    separation_rad: float    # Angular distance between leading/trailing polarity
    leading_polarity: float  # +1.0 or -1.0 (Hale's law)
    strength: float          # Overall region magnetic flux strength
```

**Step 2: Extend `FluxTubeSeed` with bipolar pairing data**

Add new fields to `FluxTubeSeed`:

```python
@dataclass(frozen=True)
class FluxTubeSeed:
    idx: int
    base_lat_rad: float
    base_lon_rad: float
    strength: float
    twist: float
    chirality: float
    family: str
    # New bipolar fields:
    region_id: int = -1
    partner_lat_rad: float = 0.0   # Second footpoint latitude (for loops)
    partner_lon_rad: float = 0.0   # Second footpoint longitude (for loops)
    polarity: float = 1.0          # +1 leading, -1 trailing
```

**Step 3: Rewrite `_build_flux_tube_seeds`**

The new algorithm:

1. Generate `N_regions = base_tube_count // 4` active regions (since each region spawns ~4 tubes).
2. For each region:
   - Place center at butterfly-diagram latitudes (same latitude distribution as current code).
   - Compute Joy's law tilt: `tilt = 0.5 * |lat_deg|` degrees, with +-15 deg scatter.
   - Compute Hale's law polarity: determine which cycle number we're nominally in (odd/even from the reference epoch), then set leading polarity based on hemisphere and cycle parity.
   - Compute footpoint separation: `sep_rad = 0.04 + strength * 0.12` radians (~2--9 degrees), reflecting that stronger regions are larger.
   - Compute leading footpoint: offset from center by `+sep_rad/2` along the tilted axis.
   - Compute trailing footpoint: offset from center by `-sep_rad/2` along the tilted axis.
3. For each region, generate tubes:
   - 2 `loop` tubes: both have `base_lat/lon` at the leading footpoint and `partner_lat/lon` at the trailing footpoint. Different twist/strength variants.
   - 1 `plume` tube: rooted at the trailing footpoint (open field line).
   - 1 `cme` tube: rooted at the leading footpoint of high-strength regions.
4. Set `chirality` from Hale's polarity law (not random): chirality follows the hemisphere rule so that loops in the north twist opposite to those in the south.

**Step 4: Update `_build_feature_arc` for bipolar loops**

For `family == "loop"`, the arc must now span from footpoint A to footpoint B:

```python
if family == "loop" and tube.region_id >= 0:
    # Compute both footpoint unit vectors.
    rotation_A = _differential_rotation_rad_day(tube.base_lat_rad) * (jd - J2000_JD)
    lon_A = (tube.base_lon_rad + rotation_A) % (2.0 * math.pi)
    base_A = _normalize(_vector_from_lat_lon(tube.base_lat_rad, lon_A))

    rotation_B = _differential_rotation_rad_day(tube.partner_lat_rad) * (jd - J2000_JD)
    lon_B = (tube.partner_lon_rad + rotation_B) % (2.0 * math.pi)
    base_B = _normalize(_vector_from_lat_lon(tube.partner_lat_rad, lon_B))

    # Arc construction: interpolate footpoints and raise the midpoint.
    for i in range(points_count):
        s = i / max(1, points_count - 1)
        # Spherical interpolation between footpoints.
        foot_x = base_A[0] * (1 - s) + base_B[0] * s
        foot_y = base_A[1] * (1 - s) + base_B[1] * s
        foot_z = base_A[2] * (1 - s) + base_B[2] * s
        foot = _normalize((foot_x, foot_y, foot_z))

        # Raise above the surface with a sin(pi*s) profile.
        # Peak height scales with footpoint separation.
        sep = math.acos(max(-1, min(1,
            base_A[0]*base_B[0] + base_A[1]*base_B[1] + base_A[2]*base_B[2])))
        loop_height = 1.0 + (peak - 1.0) * (math.sin(math.pi * s) ** 1.3)
        # ... plus twist/swirl as before
```

This produces arcs that visually connect two surface points with a raised midpoint -- much more physically realistic than the current single-footpoint geometry.

**Step 5: Ensure backward-compatible output**

The arc format `[[x,y,z], ...]` is unchanged. Feature `id` format remains `tube-XXXX`. The `kind` field is still `loop`/`plume`/`cme`. No frontend changes needed for this item -- the rendering code already handles any shape of arc.

New metadata can be added to the feature dict for informational purposes:

```python
"region_id": tube.region_id,
"polarity": tube.polarity,
```

### Validation

- Visually inspect the generated loops: they should form arch-shaped structures connecting two nearby surface points, not single-footpoint loops that curve back to the same point.
- Confirm Joy's law tilt: plot leading-footpoint longitude vs. latitude; the tilt angle should increase with latitude.
- Confirm Hale's law: in a given cycle, all leading polarities in the northern hemisphere should have the same sign.
- Run existing tests to ensure response schema is unchanged.

---

## 4. Work Item 3: CME Speed Distribution Correction

### Physics background

Yashiro et al. (2004) catalogued 6,733 CMEs from SOHO/LASCO data (1996--2003) and found:
- Speed range: **20 to 3387 km/s**
- Mean: ~489 km/s
- Median: ~429 km/s
- The distribution is approximately **log-normal** with:
  - log-mean: ~5.9 (i.e., e^5.9 ~ 365 km/s geometric mean)
  - log-sigma: ~0.6

The current model has a floor of 260 km/s and ceiling of 2060 km/s. This misses:
- **Very slow CMEs** (20--250 km/s): These are failed/gradual eruptions common during solar minimum. They represent a significant fraction (~25%) of all observed CMEs.
- **Extremely fast CMEs** (2100--3500 km/s): Rare extreme events during solar maximum.

### Current code (to be modified)

`backend/sim/solar_physics.py`, line 228:

```python
speed_kms = 260.0 + 820.0 * (activity * 0.58 + tube.strength * 0.42) + eruption_gate * 980.0
```

### Implementation plan

**Step 1: Replace the linear speed formula with a log-normal-inspired deterministic mapping**

The idea: use the tube's deterministic properties (strength, idx) to sample from a distribution that approximates the observed log-normal, then modulate by activity and eruption_gate.

```python
if family == "cme":
    eruption_boost = eruption_gate * (1.1 + 1.6 * activity)
    peak = 1.35 + activity * (1.7 + tube.strength * 1.2) + eruption_boost
    width = 0.06 + tube.strength * 0.3 + eruption_gate * 0.14

    # Log-normal-inspired speed distribution.
    # Deterministic pseudo-normal variate from tube properties:
    # Use a simple hash to get a value in (0, 1), then apply inverse CDF.
    hash_val = ((tube.idx * 2654435761) & 0xFFFFFFFF) / 4294967296.0  # Knuth hash
    hash_val = max(0.001, min(0.999, hash_val))

    # Inverse CDF of log-normal: exp(mu + sigma * Phi_inv(p))
    # Using a rational approximation of the inverse normal CDF.
    log_mu = 5.9     # log-mean (~365 km/s geometric mean)
    log_sigma = 0.65  # log-std

    # Beasley-Springer-Moro approximation for Phi_inv
    p = hash_val
    # ... (standard approximation, ~6 lines)

    base_speed = math.exp(log_mu + log_sigma * z_score)

    # Activity modulation: low activity compresses toward slow CMEs;
    # high activity allows the full range and shifts the mean upward.
    activity_shift = activity * 180.0  # shifts geometric mean up during max
    eruption_shift = eruption_gate * 800.0 * tube.strength  # extreme events

    speed_kms = _clamp(base_speed + activity_shift + eruption_shift, 20.0, 3500.0)
```

**Step 2: Simpler alternative (recommended if deterministic hash complexity is undesirable)**

A piecewise approach that preserves the current formula's simplicity while covering the correct range:

```python
if family == "cme":
    # Base speed: 20 km/s (weakest, lowest activity) to ~500 km/s (strongest, zero activity)
    base_speed = 20.0 + 480.0 * tube.strength

    # Activity contribution: scales with both activity and strength.
    # At max activity + max strength: adds ~1800 km/s.
    activity_speed = activity * (600.0 + tube.strength * 1200.0)

    # Eruption gate: explosive events add up to ~1200 km/s for the strongest tubes.
    eruption_speed = eruption_gate * 1200.0 * tube.strength

    speed_kms = _clamp(base_speed + activity_speed + eruption_speed, 20.0, 3500.0)
```

This gives:
- Minimum: 20 km/s (weakest tube, zero activity, no eruption)
- Low activity typical: 20--500 km/s (matches the slow-CME population)
- High activity typical: 600--2300 km/s (matches the bulk fast-CME population)
- Maximum: ~3500 km/s (strongest tube, max activity, full eruption gate)
- The distribution naturally has more slow CMEs (since most tubes have strength < 0.5 due to the Beta(2.2, 3.0) distribution) and few extreme events.

**Recommendation: Use the simpler piecewise approach (Step 2).** It is transparent, deterministic, covers the full observational range, and the Beta-distributed tube strengths naturally produce a right-skewed speed distribution that approximates log-normal behavior without explicit statistical machinery.

**Step 3: Update the `speedFactor` normalization in the frontend**

In `solarFeatureBlending.js`, line 37:

```javascript
const speedFactor = Number.isFinite(speedKms) ? Math.max(0.06, Math.min(0.9, speedKms / 2_100)) : 0.2;
```

The divisor `2_100` was chosen for the old 260--2060 range. With the new 20--3500 range, update to:

```javascript
const speedFactor = Number.isFinite(speedKms) ? Math.max(0.02, Math.min(0.95, speedKms / 3_500)) : 0.15;
```

This ensures the full speed range maps to a useful [0.02, 0.95] visual speed factor.

### Validation

- Compute `speed_kms` for all CME-family tubes at activity levels 0.05, 0.3, 0.5, 0.8, 0.95.
- Confirm that at low activity, the majority of CME speeds are below 400 km/s (slow CME population present).
- Confirm that at high activity, the distribution shifts upward and extreme events reach ~3000+ km/s.
- Verify no NaN or unreasonable values at edge cases (strength=0.05, activity=0.02).
- Run existing backend tests.

---

## 5. Work Item 4: Parker Spiral Visualization

### Physics background

The interplanetary magnetic field (IMF) follows the **Parker spiral** (Parker 1958). In the Sun's equatorial plane, a magnetic field line rooted at solar longitude `phi_0` and radius `r_0` traces an Archimedean spiral:

```
r(phi) = r_0 - (v_sw / omega_sun) * (phi - phi_0)
```

Or equivalently in polar form:

```
phi(r) = phi_0 - (omega_sun / v_sw) * (r - r_0)
```

Where:
- `v_sw` = solar wind speed (~400 km/s for slow wind, ~750 km/s for fast wind)
- `omega_sun` = solar angular velocity = 2*pi / (25.38 days) = 2.87e-6 rad/s
- `r_0` = source surface radius (~2.5 solar radii)

The **garden-hose angle** at Earth's orbit (1 AU):
```
tan(psi) = omega_sun * r / v_sw
```
At 1 AU with v_sw = 400 km/s: psi ~ 45 degrees.

The **heliospheric current sheet** (HCS) separates the two magnetic polarities and is tilted relative to the solar equator, creating the famous "ballerina skirt" shape.

### Implementation plan

This is the only work item requiring both backend and frontend changes to introduce a new visual element.

#### 5a. Backend: Parker spiral geometry generator

**Add method `_build_parker_spiral` to `SolarCoronaPhysicsModel`:**

```python
def _build_parker_spiral(
    self,
    jd: float,
    activity: float,
    num_arms: int = 6,
    max_distance_au: float = 3.0,
    points_per_arm: int = 80,
) -> dict[str, Any]:
    omega_rad_per_day = 2.0 * math.pi / 25.38  # sidereal rotation
    rotation_offset = omega_rad_per_day * (jd - J2000_JD)

    arms = []
    for arm_idx in range(num_arms):
        phi_0 = (arm_idx / num_arms) * 2.0 * math.pi + rotation_offset
        # Alternate polarity: Hale's law for open field.
        polarity = 1.0 if arm_idx % 2 == 0 else -1.0

        # Solar wind speed: vary between arms (slow/fast wind sectors).
        v_sw_kms = 380.0 + 200.0 * math.sin(phi_0 * 2.1 + activity * 1.3)
        v_sw_au_per_day = v_sw_kms / (AU_KM / 86400.0)  # convert km/s to AU/day

        r_0_au = 2.5 * SOLAR_RADIUS_AU  # source surface

        points = []
        for i in range(points_per_arm):
            # Logarithmic radial spacing: dense near sun, sparse far out.
            frac = i / max(1, points_per_arm - 1)
            r_au = r_0_au + (max_distance_au - r_0_au) * (frac ** 1.5)

            # Parker spiral angle.
            delta_r = r_au - r_0_au
            phi = phi_0 - (omega_rad_per_day / v_sw_au_per_day) * delta_r

            # Slight out-of-ecliptic excursion (HCS tilt effect).
            hcs_tilt_rad = math.radians(7.25 + activity * 15.0)  # tilt increases with activity
            lat_offset = hcs_tilt_rad * math.sin(phi * 1.0 + arm_idx * 0.3) * 0.15

            # Convert to Cartesian (ecliptic coordinates, AU).
            x = r_au * math.cos(phi) * math.cos(lat_offset)
            y = r_au * math.sin(phi) * math.cos(lat_offset)
            z = r_au * math.sin(lat_offset)
            points.append([x, y, z])

        arms.append({
            "polarity": polarity,
            "solar_wind_speed_kms": round(v_sw_kms, 1),
            "points_au": points,
        })

    return {
        "arm_count": num_arms,
        "source_surface_radii": 2.5,
        "max_distance_au": max_distance_au,
        "arms": arms,
    }
```

**Add to `sample_state` response:**

```python
return {
    # ... existing fields ...
    "parker_spiral": self._build_parker_spiral(jd, activity),
}
```

**Performance note:** With 6 arms x 80 points = 480 points, this adds ~2 KB to the JSON response and negligible compute time. Well within the 50 ms budget.

#### 5b. Frontend: Parker spiral rendering

**Add to `sunVisuals.js`:**

Create a new export function and spiral group management:

```javascript
export function createParkerSpiralGroup() {
  // Returns a THREE.Group that will hold spiral arm Line objects.
  // Initialize empty; arms are populated on first data arrival.
}

export function updateParkerSpiralFromState(spiralGroup, parkerData, camera, timeSec) {
  // For each arm in parkerData.arms:
  //   - Create or update a Line with BufferGeometry from points_au
  //   - Color by polarity: toward-Sun (#6688bb) vs away (#bb8866)
  //   - Material: LineBasicMaterial, additive blending, opacity 0.06-0.12
  //   - Animate with slow rotation matching solar rotation
  //
  // Distance-based visibility:
  //   - Compute camera distance from Sun
  //   - Fade opacity: 0 when camera < 0.5 AU, full when camera > 2 AU
  //   - This prevents clutter when zoomed in on the Sun's corona
}
```

**Wire into `src/main.js`:**

1. Import `createParkerSpiralGroup` and `updateParkerSpiralFromState` from `sunVisuals.js`.
2. In the Sun initialization section, create the spiral group and add to scene.
3. In `updateSunDynamics`, call `updateParkerSpiralFromState` with the latest backend data.
4. Add a toggle in the UI (optional; can be deferred) to show/hide the spiral.

**Visual design decisions:**
- Lines should be thin and ghostly -- the spiral is an ambient structural guide, not a primary visual feature.
- Use different line opacity for slow-wind (denser, brighter) vs fast-wind (more tenuous) sectors.
- Consider a slight animated "shimmer" along the spiral to suggest solar wind flow.

### Validation

- Visually confirm spiral geometry: arms should wind tighter near the Sun and open up at larger distances.
- At 1 AU, the garden-hose angle should be approximately 45 degrees for 400 km/s wind.
- Spiral should rotate with the Sun (one full rotation per ~25.38 days of simulation time).
- Confirm the spiral is invisible when zoomed close to the Sun and fades in when zoomed out.
- Confirm alternating polarity coloring is visible.
- Check JSON response size increase is reasonable (< 5 KB additional).

---

## 6. Execution Order and Dependencies

```
Phase 1 (independent):
  [1] Hathaway activity cycle
  [4a] Parker spiral backend generator

Phase 2 (depends on Phase 1, item 1):
  [2] Bipolar active regions (uses activity for cycle-number determination in Hale's law)
  [3] CME speed range (uses activity index -- the shape change affects the speed distribution)

Phase 3 (depends on Phase 1, item 4a):
  [4b] Parker spiral frontend rendering

Phase 4 (all items complete):
  Integration testing + visual validation
```

Items 1 and 4a can be implemented in parallel. Items 2 and 3 can be implemented in parallel after item 1 is complete. Item 4b can proceed after 4a is done.

Estimated effort:
- Item 1 (Hathaway): ~1 hour (small, surgical change)
- Item 2 (Bipolar): ~2--3 hours (largest refactor, touches seed generation and arc construction)
- Item 3 (CME speeds): ~30 minutes (small formula change + frontend normalization)
- Item 4 (Parker spiral): ~2 hours (new backend method + new frontend visual layer)

---

## 7. File Impact Map

| File | Items | Nature of change |
|------|-------|-----------------|
| `backend/sim/solar_physics.py` | 1, 2, 3, 4a | Core physics changes: activity function, seed generation, arc construction, spiral generator |
| `src/main.js` | 1, 4b | Fallback activity calculation, Parker spiral wiring |
| `src/frontend/features/solar/sunVisuals.js` | 4b | New Parker spiral rendering functions |
| `src/frontend/features/solar/solarFeatureBlending.js` | 3 | speedFactor normalization divisor update |
| `backend/server.py` | (none expected) | The `sample_state()` return dict auto-propagates Parker spiral data |
| `backend/tests/test_solar_physics_api.py` | 1, 2, 3, 4a | Add/update tests for new activity curve, bipolar seeds, CME speed range, spiral data |

---

## 8. Validation Strategy

### Unit tests (backend)

1. **Hathaway shape test**: Assert that `_activity_index(jd)` at cycle start is near minimum (~0.06--0.10), at t_peak (~5.5 years) is near maximum (~0.85--0.92), and at cycle end returns to near minimum.
2. **Asymmetry test**: Assert that the time from minimum to peak is shorter than from peak to next minimum.
3. **Bipolar pairing test**: Assert that every `loop` family tube has a valid `partner_lat_rad`/`partner_lon_rad` and that paired tubes share a `region_id`.
4. **Joy's law test**: Assert that tilt angles increase with latitude (compute correlation).
5. **CME speed range test**: Iterate all CME tubes at various activity levels; assert min < 50 and max > 2500.
6. **Parker spiral test**: Assert response contains `parker_spiral` key with expected arm count and point arrays.

### Integration tests

1. **Backend API response schema**: Confirm `/solar/physics` response still validates against the existing schema (plus new optional fields).
2. **Frontend build**: `npm run build` must pass.
3. **Visual smoke test**: Run backend + frontend, screenshot the Sun at various zoom levels. Confirm:
   - Coronal loops appear as arch-shaped structures (not single-point loops).
   - Parker spiral is visible when zoomed out.
   - CME events show varied speeds (some slow, some fast).
   - Activity level varies asymmetrically over simulated time.

---

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Bipolar refactor breaks the feature scoring/sorting logic | Medium | High | Keep `_feature_score` and `_feature_temporal_state` unchanged; only modify seed generation and arc construction. Test with existing test suite before and after. |
| Hathaway function produces unexpected values at boundary conditions (t=0, t=cycle_length) | Low | Medium | Explicit `_clamp` on output; unit test at boundaries. The modular wrap ensures continuity. |
| Parker spiral JSON payload size impacts frontend performance | Low | Low | 480 points x 3 floats x 8 bytes = ~11 KB. Negligible compared to existing corona features (~50--200 KB). |
| Frontend fallback activity diverges from backend calculation | Medium | Low | Port the exact same Hathaway function to JavaScript. Add a comment linking the two implementations. |
| Bipolar footpoint differential rotation causes footpoints to shear apart over centuries of simulated time | Low | Low | This is physically correct (flux dispersal). For visual purposes, cap the maximum footpoint shear and dissolve the loop when separation exceeds a threshold. |

---

*End of plan.*
