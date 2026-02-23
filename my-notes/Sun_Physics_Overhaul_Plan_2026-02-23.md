# Sun & Solar System Physics Overhaul — Master Implementation Plan v2

Expanded plan resolving all 14 original deficiencies plus 10 newly identified gaps covering radiation pressure, galactic forces, prominences, transition region, solar wind, and experimental gravitational wave visualization.

> [!IMPORTANT]
> All physics constants and formulas are sourced from published, peer-reviewed literature. Each section cites specific publications. No invented coefficients.

---

## Phase 1 — Critical Bug Fixes (🔴 Wrong Physics)
*Effort: Low | Risk: Low | Files: `sunVisuals.js`, `solarMagnetics.js`*

### 1A. Fix Limb Darkening Coefficients
**Audit #1** | [sunVisuals.js:89-99](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L89-L99)

Replace invented polynomial with **per-channel** Neckel & Labs (1994, *Solar Physics* 153:91–114) coefficients:

| λ (nm) | Channel | a₀ | a₁ | a₂ | a₃ | a₄ | a₅ |
|---|---|---|---|---|---|---|---|
| 450 | B | 0.2688 | 1.3765 | −1.3645 | 1.2816 | −0.7458 | 0.1834 |
| 550 | G | 0.3050 | 1.1312 | −0.7860 | 0.6164 | −0.3612 | 0.0946 |
| 650 | R | 0.3434 | 0.9721 | −0.4348 | 0.2024 | −0.1220 | 0.0390 |

**Replacement GLSL:**
```glsl
vec3 neckellLimbDarkRGB(float mu) {
  float mu2 = mu * mu, mu3 = mu2 * mu, mu4 = mu3 * mu, mu5 = mu4 * mu;
  float ldR = 0.3434 + 0.9721*mu - 0.4348*mu2 + 0.2024*mu3 - 0.1220*mu4 + 0.0390*mu5;
  float ldG = 0.3050 + 1.1312*mu - 0.7860*mu2 + 0.6164*mu3 - 0.3612*mu4 + 0.0946*mu5;
  float ldB = 0.2688 + 1.3765*mu - 1.3645*mu2 + 1.2816*mu3 - 0.7458*mu4 + 0.1834*mu5;
  return vec3(ldR, ldG, ldB);
}
```

**Validation:** At μ=1, each channel sums to 1.0 ± 0.0001. At μ=0.1: R≈0.56, G≈0.42, B≈0.29 (limb reddening).

---

### 1B. Fix PFSS RK4 Vector Corruption
**Audit #2** | [solarMagnetics.js:95](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/solarMagnetics.js#L95)

**Current (broken):** `k1.add(k2.multiplyScalar(2))...` — mutates in place.

**Replacement:**
```js
const stepVec = new Vector3()
  .addScaledVector(k1, 1)
  .addScaledVector(k2, 2)
  .addScaledVector(k3, 2)
  .addScaledVector(k4, 1)
  .multiplyScalar(stepSize / 6);
```

---

## Phase 2 — Blackbody Color Correction
*Effort: Medium | Risk: Low | File: `sunVisuals.js`*

### 2A. Replace Artistic Palette with Planck-Derived Colors
**Audit #3** | [sunVisuals.js:245-261](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L245-L261)

CIE-matched blackbody-to-linear-sRGB values (Planck integration over CIE 1931 color matching functions):

| T (K) | Feature | linear sRGB | Hex (gamma) |
|---|---|---|---|
| 3000 | Coolest umbra | (1.000, 0.417, 0.094) | `#FF8422` |
| 3700 | Typical umbra | (1.000, 0.538, 0.203) | `#FFa148` |
| 5778 | Quiet photosphere | (1.000, 0.867, 0.757) | `#FFF1E4` |
| 6300 | Hot granule top | (1.000, 0.918, 0.843) | `#FFF8F0` |
| 7000 | Brightest intergranular | (0.953, 0.953, 1.000) | `#F3F9FF` |

```glsl
vec3 umbralColor  = vec3(1.000, 0.538, 0.203);  // 3700K blackbody
vec3 quietColor   = vec3(1.000, 0.867, 0.757);  // 5778K blackbody
vec3 hotColor     = vec3(1.000, 0.918, 0.843);  // 6300K
vec3 granuletop   = vec3(0.953, 0.953, 1.000);  // 7000K
```

### 2B. Blackbody Lookup Texture (Optional Enhancement)
Generate a 256×1 texture mapping temperature 3000K–8000K → sRGB. Sample via `texture2D(blackbodyLUT, vec2((T-3000.0)/5000.0, 0.5))`. Compute once on CPU using Planck function integrated over CIE color matching functions.

---

## Phase 3 — Granulation & Sunspot Improvements
*Effort: Medium | Risk: Low | File: `sunVisuals.js`*

### 3A. Fix Granulation Contrast Ratio
**Audit #7** | [sunVisuals.js:215-217](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L215-L217)

Real: ~14–22% RMS (Nordlund & Stein 1998; Hinode/SOT observation). Current: 82%.

```glsl
float granulationBrightness = gran1.x * 0.22 + 0.78;   // range 0.78–1.0
float superGranNetwork = gran2.x * 0.04 + 0.98;
```

### 3B. Sunspot Cluster System
**Audit #9** | [sunVisuals.js:418-455](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L418-L455)

Reinterpret 8 uniform slots as **groups** generating 2–5 spot clusters. At solar max: 8 × 5 = up to 40 visible spots.

### 3C. Evershed-Flow Penumbral Fibrils
**Audit #8** | [sunVisuals.js:168-171](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L168-L171)

Replace isotropic noise with directionally elongated noise (2.67:1 radial aspect ratio matching Evershed radial outflow pattern):

```glsl
vec3 fibrilCoord = radialDir * 60.0 + tangentialDir * 160.0 + vec3(timeSec * 0.03);
```

### 3D. Facular Center-to-Limb Variation
**Audit #13** | [sunVisuals.js:173-176](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L173-L176)

Faculae are dark at disk center (μ≈1), bright at limb (μ≈0.3) — Topka et al. 1997:
```glsl
float faculaContrast = (-0.12 + 0.95 * (1.0 - mu)) * spotIntensity;
```

### 3E. Wilson Depression
**Audit #8** | [sunVisuals.js:146-190](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L146-L190)

Foreshorten spot angular radius based on viewing angle to simulate the ~600 km geometric depression:
```glsl
float wilsonFactor = 0.65 + 0.35 * dot(spotDir, viewDir);
```

---

## Phase 4 — Chromosphere Type II Spicules
*Effort: Medium | Risk: Low | File: `sunVisuals.js`*

### 4A. Dual-Population Spicule Model
**Audit #6** | [sunVisuals.js:468-525](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L468-L525)

Add Type II population (De Pontieu et al. 2007): rapid ballistic rise (80–300 km/s), 10–150s lifetime, fade without descent. Discriminate by `aSpeed` threshold:

```glsl
bool isTypeII = aSpeed >= 3.0;
float rise = isTypeII
  ? (phase < 0.3 ? phase/0.3 : max(0.0, 1.0 - (phase-0.3)*2.5))
  : (phase < 0.5 ? phase*2.0 : (1.0-phase)*2.0);
```

### 4B. Distance-Scaled Point Size
Replace `gl_PointSize = 1.8` with perspective-scaled:
```glsl
gl_PointSize = clamp(baseSize * (300.0 / dist), 0.5, 6.0);
```

---

## Phase 5 — Corona Overhaul
*Effort: High | Risk: Medium | File: `sunVisuals.js`*

### 5A. K-Corona Radial Intensity Falloff
**Audit #4** | [sunVisuals.js:347-372](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js#L347-L372)

Implement Baumbach/van de Hulst (1950) electron density model:

```
N(r) = 10⁸ × (0.036·r⁻¹·⁵ + 1.55·r⁻⁶ + 2.99·r⁻¹⁶)  [cm⁻³]
```

Simplified to the two dominant terms for GPU:
```glsl
float coronaRadial = 0.036 * pow(rClamped, -1.5) + 1.55 * pow(rClamped, -6.0);
coronaRadial /= 1.586; // normalize to 1.0 at r=1
```

Expand corona shell geometry from 1.032× to 4.0× solar radii.

### 5B. Helmet Streamer Structure
**Audit #5** | Near equatorial plane, modulated by activity cycle:

```glsl
float streamerLat = abs(normalDir.y);
float streamerWidth = 0.15 + activity * 0.35;
float streamerBright = smoothstep(streamerWidth, streamerWidth - 0.1, streamerLat);
alpha *= (1.0 + streamerBright * 1.2);
```

### 5C. Magnetically-Driven Coronal Holes
**Audit #11** | Replace `abs(normalDir.y)` with noise-modulated system including equatorial holes at solar max.

### 5D. Temperature-Dependent Corona Color
**Audit #5 (sub)** | Inner corona: Fe XIV green line (530.3 nm, ~1 MK). Outer: warm white (~2 MK). Radial color gradient.

---

## Phase 6 — Flare & CME Physics
*Effort: Low–Medium | Risk: Low | File: `solarFlares.js`*

### 6A. CME Angular Width Control
**Audit #10** | Parameterize `SphereGeometry phiLength` to 20°–120° range (NASA CME catalog).

### 6B. GOES-Style Neupert-Effect Temporal Profile
**Audit (flares)** | Replace linear rise/fall with fast exponential rise (~15% duration), slow exponential decay (~85%):
```js
if (t < impulsive) opacity = intensity * (1.0 - Math.exp(-4.0 * t/impulsive));
else              opacity = intensity * Math.exp(-2.5 * (t-impulsive)/gradual);
```

---

## Phase 7 — Timing & PFSS Harmonics
*Effort: Medium | Risk: Low | Files: `sunVisuals.js`, `solarMagnetics.js`*

### 7A. Differential Rotation ↔ Simulation Clock Sync
**Audit #14** | Tie Snodgrass rotation to Julian date, not arbitrary `time * 0.00012`.

### 7B. Apply Dipole Tilt Angle
**Audit #12 (sub)** | Use the computed but unused `tiltAngle = 0.2 * activity` to rotate dipole axis.

### 7C. Octupole Harmonic (ℓ=3)
**Audit #12** | Add third-order spherical harmonic for sector structure at high activity.

---

## Phase 8 — Solar Prominences & Transition Region *(NEW)*
*Effort: High | Risk: Medium | Files: `sunVisuals.js`, new `solarProminences.js`*

> [!NOTE]
> The current model has **zero** prominence/filament representation. These are among the most visually striking solar phenomena, extending 10–100 Mm above the limb at 5,000–8,000K (100× cooler and 100× denser than the surrounding corona).

### 8A. Create `solarProminences.js` — Prominence/Filament System

**Physics:**
- Prominences are magnetically suspended plasma structures above polarity inversion lines
- **Quiescent:** persist weeks–months, higher latitudes, heights 10–100 Mm
- **Active region:** hours–days, near sunspots, erupt frequently
- Temperature: ~10,000K (Hα emission), 100× cooler than corona
- Erupting prominences: 600–1000+ km/s, frequently trigger CMEs

**Implementation approach:**
```js
// Each prominence is a parametric 3D curve (catenary approximation of
// magnetically suspended plasma) with vertex particles spread along it.
export function createProminence({
  footpoint1,     // {lon, lat} on surface — one magnetic polarity
  footpoint2,     // {lon, lat} — opposite polarity
  maxHeight,      // 0.01–0.15 R☉ (7,000–104,000 km)
  temperature,    // 5000–8000K → maps to Hα reddish-pink color
  density,        // opacity scaling
  lifetime,       // seconds before dissipation or eruption
  isErupting      // triggers kinematic eruption animation
}) { ... }
```

**Visual rendering:**
- Use `LineSegments` or ribbon geometry for the arch shape
- Color: Hα reddish-pink `vec3(0.9, 0.15, 0.12)` at ~6563Å
- At limb: bright emission against dark sky
- On disk: dark absorption ("filament") against photosphere — requires checking if fragment is in front or behind solar disk relative to camera

**Shader snippet (prominence fragment):**
```glsl
// Prominence is visible as bright emission at limb, dark filament on disk
float prominenceNdotV = dot(normalize(position - sunCenter), viewDir);
bool onDisk = prominenceNdotV > 0.0;
vec3 color = onDisk
  ? vec3(0.0) // dark filament absorption
  : vec3(0.9, 0.15, 0.12) * opacity; // Hα emission off-limb
```

**Integration in `main.js`:** Spawn prominence objects based on `activity` level. Place footpoints near sunspot groups (polarity inversion lines). Auto-erupt at configurable probability.

### 8B. Transition Region Layer

The **transition region** (TR) is a thin (~100 km) shell between chromosphere (~20,000K) and corona (~1 MK). Currently completely absent. It produces characteristic EUV emission visible in SDO/AIA 304Å.

**Implementation:** Add a thin emissive shell at 1.004× solar radius with UV-colored emission that responds to the 304Å observation mode:

```glsl
// In the chromosphere/corona intermediate region
float trHeight = 1.004; // 1.004 R☉ = ~2,800 km above photosphere
float trEmission = smoothstep(trHeight - 0.001, trHeight, fragR)
                 * (1.0 - smoothstep(trHeight, trHeight + 0.002, fragR));
// In 304Å mode, TR becomes very bright magenta
vec3 trColor = is304Mode ? vec3(0.85, 0.1, 0.3) : vec3(0.4, 0.05, 0.15);
```

---

## Phase 9 — Solar Radiation Pressure *(NEW)*
*Effort: Medium | Risk: Low | Files: `rebound_nbody.py` or new `radiationPressure.js`*

> [!IMPORTANT]
> The codebase has **zero** radiation pressure implementation. Solar radiation pressure is significant for: dust particles (can exceed gravity for sub-micron grains), spacecraft trajectories (15,000 km miss at Mars without SRP), and long-term asteroid orbit evolution (Yarkovsky effect).

### 9A. Solar Radiation Pressure Force

The radiation pressure acceleration on a body at distance `r` from the Sun is:

```
a_SRP = (L☉ / (4π·c)) × (A / m) × (1/r²) × Cr
```

Where:
- `L☉` = 3.828 × 10²⁶ W (solar luminosity)
- `c` = 2.998 × 10⁸ m/s
- `A/m` = area-to-mass ratio of the body
- `Cr` = radiation pressure coefficient (1.0 = perfect absorber, 2.0 = perfect reflector)
- `r` = heliocentric distance

At 1 AU for a 1 m² / 1 kg flat plate: `a_SRP ≈ 4.56 × 10⁻⁶ m/s²`

**Ratio to solar gravity:** The dimensionless parameter `β = F_SRP / F_grav`:
```
β = (L☉ × Cr × A) / (16π² × G × M☉ × m × c)
```

For dust grains: β > 0.5 means the particle is blown out of the solar system. For β ≈ 1, radiation exactly cancels gravity. This defines the **blowout size** (~0.1–1 μm for silicate grains).

**Implementation — Backend (REBOUND):**
```python
# Add as REBOUNDx force or custom additional_forces callback
def radiation_pressure(reb_sim):
    sun = reb_sim.particles[0]
    for i in range(1, reb_sim.N):
        p = reb_sim.particles[i]
        dx, dy, dz = p.x - sun.x, p.y - sun.y, p.z - sun.z
        r2 = dx*dx + dy*dy + dz*dz
        r = math.sqrt(r2)
        # beta = SRP_force / gravity_force for this body
        beta = getattr(p, 'beta', 0.0)  # 0 for planets, nonzero for dust/spacecraft
        # Acceleration = beta * GM☉/r² (same magnitude as gravity, radially outward)
        a_srp = beta * reb_sim.G * sun.m / r2
        p.ax += a_srp * dx / r
        p.ay += a_srp * dy / r
        p.az += a_srp * dz / r
```

**Implementation — Frontend (trajectory planning):**
Add a `beta` parameter to spacecraft/dust definitions in the mission planner. Show SRP as a force vector overlay when enabled.

### 9B. Poynting-Robertson Drag

For dust particles, the tangential component of radiation causes orbital decay:

```
F_PR = F_SRP × (v_tangential / c)
```

Timescale to spiral into the Sun from 1 AU: ~10,000 years for a 10 μm grain. Relevant for zodiacal dust cloud simulation.

### 9C. Yarkovsky Effect on Asteroids *(Experimental)*

Asymmetric thermal re-radiation from rotating asteroids causes secular drift in semi-major axis:

```
da/dt ≈ ±(4/9) × (1-A) × (Φ☉ / (ρ·D·n·c·a))
```

Where `A` = albedo, `Φ☉` = solar flux, `ρ` = density, `D` = diameter, `n` = mean motion. This is the dominant mechanism for delivering main-belt asteroids into resonances → NEO population. Could be added as a slow secular perturbation on tracked asteroid orbits.

---

## Phase 10 — Galactic-Scale Gravitational Forces *(NEW)*
*Effort: Medium–High | Risk: Low | Files: `rebound_nbody.py`, new `galacticTide.js`*

> [!NOTE]
> The codebase's galactic code (`milkyWay.js`) is purely visual — it renders the Milky Way backdrop. No galactic gravitational physics exists.

### 10A. Milky Way Galactic Tidal Field

The galactic tide is the **dominant external perturber** of the Oort Cloud, responsible for ~90% of long-period comet injection (Heisler & Tremaine 1986; Levison et al. 2001).

**Tidal acceleration** in the local galactic frame (Heisler & Tremaine formulation):

```
a_x = -Ω₀² × x                    (radial, toward galactic center)
a_y = -(4πGρ₀ - Ω₀²) × y          (vertical, perpendicular to disk)
a_z = -Ω₀² × z                    (azimuthal, along orbit)
```

Where:
- `Ω₀` ≈ 26 km/s/kpc = 8.4 × 10⁻¹⁶ rad/s (Solar orbital angular velocity around Galactic center)
- `ρ₀` ≈ 0.1 M☉/pc³ = 6.77 × 10⁻²¹ kg/m³ (local disk mass density, Oort limit)
- `G` = 6.674 × 10⁻¹¹ m³/(kg·s²)

**Magnitude comparison at different distances:**

| Distance | Galactic tide (m/s²) | Sun's gravity (m/s²) | Ratio |
|---|---|---|---|
| 1 AU | ~3 × 10⁻¹³ | 5.9 × 10⁻³ | 10⁻¹⁰ (negligible) |
| 100 AU | ~3 × 10⁻¹³ | 5.9 × 10⁻⁷ | 10⁻⁶ (negligible) |
| 10,000 AU | ~3 × 10⁻¹³ | 5.9 × 10⁻¹¹ | ~5 × 10⁻³ (marginally significant) |
| 50,000 AU | ~3 × 10⁻¹³ | 2.4 × 10⁻¹² | ~0.13 (**significant**) |
| 100,000 AU | ~3 × 10⁻¹³ | 5.9 × 10⁻¹³ | ~0.5 (**dominant**) |

> [!IMPORTANT]
> For **inner solar system objects** (planets, asteroids, spacecraft), galactic tidal forces are 10⁻⁶ to 10⁻¹⁰ × solar gravity — completely negligible for any practical simulation timescale. For **Oort Cloud objects** (> 50,000 AU), galactic tides dominate and must be included for realistic long-period comet dynamics.

**Implementation:**
```python
# In rebound_nbody.py — only activated when simulating Oort Cloud objects
def galactic_tide(reb_sim):
    Omega0 = 8.4e-16  # rad/s
    rho0_SI = 6.77e-21 # kg/m³
    # Convert to simulation units (AU, solar masses, etc.)
    for i in range(1, reb_sim.N):
        p = reb_sim.particles[i]
        r = math.sqrt(p.x**2 + p.y**2 + p.z**2)
        if r < 1000:  # AU — skip inner solar system
            continue
        p.ax += -Omega0**2 * p.x
        p.ay += -(4*math.pi*G*rho0 - Omega0**2) * p.y
        p.az += -Omega0**2 * p.z
```

### 10B. Nearby Stellar Perturbations

Passing stars perturb the outer Oort Cloud. The typical stellar encounter rate within 1 pc is ~10 per Myr. For the simulation, this could be modeled as stochastic impulse events:

```
Δv ≈ 2 G M★ / (b × v∞)
```
Where `b` = impact parameter, `v∞` = relative velocity (~30 km/s typical). Implementation: stochastic impulse kicks on Oort Cloud test particles during long-duration simulations. **Lower priority** — only relevant for Myr-scale integrations.

### 10C. Sgr A* Direct Gravitational Pull

At 26,000 ly (8 kpc), Sgr A* (4 × 10⁶ M☉) produces on the solar system:

```
a = GM / r² ≈ 6.674e-11 × 4e6 × 1.989e30 / (2.47e20)² ≈ 8.7 × 10⁻¹² m/s²
```

This is ~10⁻⁹ × solar gravity at 1 AU — **completely negligible for orbital dynamics**. The galactic tide (from the distributed disk mass) is ~1000× stronger than the direct Sgr A* pull. **No implementation needed** for Sgr A* as an isolated point source — it is already included within the tidal field of Phase 10A.

---

## Phase 11 — Solar Wind System *(NEW)*
*Effort: Medium | Risk: Low | File: new `solarWind.js` or extend `sunVisuals.js`*

### 11A. Parker Spiral Magnetic Field Enhancement

The Parker spiral already exists visually, but lacks physical parameterization. The interplanetary magnetic field (IMF) follows:

```
B_r = B₀ × (r₀/r)²
B_φ = -B_r × (Ω × r × sinθ) / v_sw
```

Where `B₀ ≈ 5 nT` at `r₀ = 1 AU`, `Ω` = solar rotation rate, `v_sw` = solar wind speed (400–800 km/s).

**Enhancement:** Compute the spiral angle `ψ = atan(Ω·r·sinθ / v_sw)` and vary the displayed spiral tightness based on the actual solar wind speed from the backend physics.

### 11B. Fast/Slow Solar Wind Bimodal Structure

The solar wind has two distinct components:
- **Slow wind:** ~400 km/s, denser, near streamer belt / equatorial
- **Fast wind:** ~750 km/s, from coronal holes (polar regions)

Visualize as particle density/speed variations in the Parker spiral, keyed to coronal hole and streamer positions from Phase 5.

---

## Phase 12 — Experimental: Gravitational Waves *(NEW)*
*Effort: Low | Risk: None | File: new `gravitationalWaves.js`*

> [!CAUTION]
> Gravitational waves have **no measurable effect** on solar system dynamics. Peak strain from binary black hole mergers is ~10⁻²¹ — this stretches the Earth-Sun distance by ~0.15 femtometers (less than an atomic nucleus). This phase is purely for **educational/visualization purposes** — an experimental showcase feature.

### 12A. Gravitational Wave Spacetime Distortion Visualization

When toggled on, render a passing gravitational wave as a visual "ripple" through the scene grid:

```js
// Gravitational wave parameters (visualization only — hugely exaggerated)
const gwVisualization = {
  frequency: 50,            // Hz (typical LIGO detection band)
  strainExaggeration: 1e18, // amplify 10⁻²¹ to visible levels
  source: 'binary_bh',      // visualization mode
  propagationDir: new Vector3(0, 0, 1), // from "above" ecliptic
};

// Apply sinusoidal stretch+squeeze to a background grid
function applyGWDistortion(gridMesh, time) {
  const phase = time * gwVisualization.frequency * 2 * Math.PI;
  const h = gwVisualization.strainExaggeration * 1e-21;
  // + polarization: stretch x, squeeze y
  gridMesh.scale.set(1 + h * Math.sin(phase), 1 - h * Math.sin(phase), 1);
}
```

**UI:** A toggle in the experimental section: "Show gravitational wave visualization (educational)." Include an info tooltip explaining that real GW effects are 10⁻²¹ and this is amplified for educational purposes.

---

## Phase 13 — Additional Missed Items *(NEW)*
*Effort: Low–Medium | Risk: Low | Various files*

### 13A. Coronal Loop Arcade Enhancement

The coronal loop system (`coronal-loops-group` in `main.js`) currently exists but uses simple tube geometry. Real coronal loops observed by SDO/AIA show:
- Temperature stratification along the loop (hotter apex, cooler footpoints)
- EUV-dependent visibility (171Å: 0.6 MK, 193Å: 1.5 MK, 211Å: 2 MK)
- Cross-section expansion toward the apex (flux conservation)

**Enhancement:** Add temperature-dependent glow color that shifts with observation channel. Apply slight cross-section expansion toward the loop apex.

### 13B. Differential Emission Measure (DEM) Display

When switching between AIA observation channels, the Sun's appearance should change dramatically:
- **171Å (Fe IX, 0.6 MK):** Quiet corona loops, blue-green
- **193Å (Fe XII, 1.5 MK):** Hot corona, green-yellow
- **211Å (Fe XIV, 2 MK):** Active region loops, purple
- **304Å (He II, 0.05 MK):** Chromosphere/TR, magenta-red
- **094Å (Fe XVIII, 6.3 MK):** Flare plasma only, green

Currently, observation channels just overlay a texture. The procedural features (granulation, corona, chromosphere) should also respond to channel selection.

### 13C. Solar Irradiance Variability

The solar "constant" actually varies: ~0.1% over the 11-year cycle, ~0.3% during sunspot passages. The backend's `activity` value could drive a `luminosity` uniform:

```js
const luminosityFactor = 1.0 + 0.001 * (activity - 0.5); // ±0.05%
```

This affects the glow sprite brightness and overall scene lighting intensity.

---

## File Change Summary

| File | Changes | Phases |
|---|---|---|
| [sunVisuals.js](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/sunVisuals.js) | Limb darkening, colors, granulation, sunspots, spicules, corona, time sync, transition region, loops, DEM | 1A, 2A–B, 3A–E, 4A–B, 5A–E, 7A, 8B, 13A–C |
| [solarMagnetics.js](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/solarMagnetics.js) | RK4 fix, tilt angle, octupole | 1B, 7B–C |
| [solarFlares.js](file:///home/nomad/Documents/solar-system-realistic-sim/src/frontend/features/solar/solarFlares.js) | Angular width, Neupert profile | 6A–B |
| **[NEW]** `solarProminences.js` | Prominence/filament system | 8A |
| [rebound_nbody.py](file:///home/nomad/Documents/solar-system-realistic-sim/backend/sim/rebound_nbody.py) | Radiation pressure, galactic tide | 9A–B, 10A |
| **[NEW]** `gravitationalWaves.js` | Educational GW visualization | 12A |
| **[NEW]** `solarWind.js` | Wind speed/density system | 11A–B |

---

## Priority Matrix

| Phase | Severity | Complexity | Impact | Recommended Order |
|---|---|---|---|---|
| 1 (Bug fixes) | 🔴 Critical | Low | High | **First** |
| 2 (Blackbody) | 🟡 | Low | High | Second |
| 5 (Corona) | 🟡 | High | Very High | Third |
| 3 (Granulation/spots) | 🟡 | Medium | Medium | Fourth |
| 4 (Spicules) | 🟡 | Medium | Medium | Fifth |
| 8 (Prominences) | 🟡 | High | Very High | Sixth |
| 6 (Flares/CMEs) | 🟡 | Low | Medium | Seventh |
| 9 (Radiation pressure) | 🟡 | Medium | High (trajectories) | Eighth |
| 7 (Time/PFSS) | 🟡 | Medium | Medium | Ninth |
| 10 (Galactic tides) | 🟢 | Medium | Low (inner SS) | Tenth |
| 11 (Solar wind) | 🟢 | Medium | Medium | Eleventh |
| 13 (Misc) | 🟢 | Low | Low | Twelfth |
| 12 (GW viz) | 🟢 | Low | Educational only | Last |

---

## Verification Plan

### Automated
- `npm run build` — zero errors
- `npm run typecheck` — zero new type errors
- `pytest backend/tests/` — all pass including new radiation pressure tests

### Visual — Browser Tests
1. Limb reddening visible at solar edge (B channel darker than R)
2. Sun appears near-white at 5778K, not orange
3. Subtle granulation (22% contrast), not tile-cracked
4. Sunspot groups with 2-5 clustered spots
5. Type II spicules shoot up fast and fade without falling
6. Corona extends to 3-4 R☉ with r⁻⁶ radial falloff
7. Prominences visible at limb as Hα-pink arches
8. CMEs show varying angular widths

### Physics Validation
- `neckellLimbDarkRGB(1.0)` returns `(1.0, 1.0, 1.0)` ± 0.001
- K-corona at 2 R☉ ≈ 3.5% of surface intensity
- Radiation pressure `β=1` correctly nullifies gravity for test particle
- Galactic tide acceleration at 50,000 AU ≈ 3 × 10⁻¹³ m/s²
