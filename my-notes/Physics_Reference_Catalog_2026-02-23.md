# Physics & Astrophysics Reference Catalog
## Solar System Realistic Simulation — Subject Areas, Papers, and Sources

**Compiled:** 2026-02-23  
**Scope:** All physics domains implemented or referenced in the Sun model overhaul and related simulation modules.

---

## Part 1: Subject Area Taxonomy

### A. Solar Physics

| # | Subject | Topic | Section/Focus Area | Implemented In |
|---|---|---|---|---|
| 1 | **Stellar Atmospheres** | Limb Darkening | Wavelength-dependent center-to-limb variation, Neckel-Labs polynomial coefficients | `sunVisuals.js` |
| 2 | **Stellar Atmospheres** | Blackbody Radiation | Planck function, effective temperature, sRGB color rendering of thermal spectra | `sunVisuals.js` |
| 3 | **Convection** | Solar Granulation | Convective cell pattern, intensity contrast, RMS measurements, Bénard cells | `sunVisuals.js` |
| 4 | **Convection** | Supergranulation | Large-scale convective network, 30-hour lifetimes, magnetic field organization | `sunVisuals.js` |
| 5 | **Sunspot Physics** | Umbral Structure | Temperature depression (3700K vs 5778K), magnetic flux concentration | `sunVisuals.js` |
| 6 | **Sunspot Physics** | Penumbral Structure | Evershed flow, radially elongated fibrils, magneto-convective simulation | `sunVisuals.js` |
| 7 | **Sunspot Physics** | Sunspot Groups | Bipolar active regions, Joy's law tilt, leading/following polarity, cluster statistics | `sunVisuals.js` |
| 8 | **Sunspot Physics** | Wilson Depression | Geometric foreshortening of depressed umbra (~600 km), viewing-angle dependence | `sunVisuals.js` |
| 9 | **Sunspot Physics** | Faculae | Bright points in intergranular lanes, center-to-limb contrast variation, hot-wall model | `sunVisuals.js` |
| 10 | **Chromosphere** | Spicules (Type I) | Parabolic rise-and-fall, 10-40 km/s, 3-7 minute lifetime, ~10,000 km height | `sunVisuals.js` |
| 11 | **Chromosphere** | Spicules (Type II) | Rapid rise without descent, 80-300 km/s, 10-150s lifetime, fade-in-place | `sunVisuals.js` |
| 12 | **Corona** | K-Corona | Radial intensity falloff from electron scattering, Baumbach-van de Hulst profile | `sunVisuals.js` |
| 13 | **Corona** | Helmet Streamers | Equatorial closed-field structures, solar-cycle dependent latitude spread | `sunVisuals.js` |
| 14 | **Corona** | Coronal Holes | Open magnetic field regions, polar + equatorial, fast solar wind sources | `sunVisuals.js` |
| 15 | **Corona** | Coronal Temperature | Fe XIV green line (530.3 nm, ~1.8 MK), temperature stratification, DEM | `sunVisuals.js` |
| 16 | **Solar Activity** | Solar Flares | GOES X-ray temporal profile, Neupert effect, impulsive/gradual phases | `solarFlares.js` |
| 17 | **Solar Activity** | CMEs | Angular width distribution, expansion kinematics, CME-flare association | `solarFlares.js` |
| 18 | **Solar Activity** | Prominences | Catenary arch geometry, Hα emission, quiescent vs active-region, eruption | `solarProminences.js` |
| 19 | **Solar Activity** | Solar Cycle | Spörer's law (butterfly diagram), Hathaway profile, 11-year periodicity | `solar_physics.py` |

### B. Solar Magnetic Field

| # | Subject | Topic | Section/Focus Area | Implemented In |
|---|---|---|---|---|
| 20 | **Magnetohydrodynamics** | PFSS Model | Potential-Field Source-Surface, spherical harmonic decomposition | `solarMagnetics.js` |
| 21 | **Magnetohydrodynamics** | Dipole Field | Axial dipole, tilt angle (~7-15° at solar max), Hale's polarity law | `solarMagnetics.js` |
| 22 | **Magnetohydrodynamics** | Quadrupole | ℓ=2 harmonic, activity-dependent amplitude | `solarMagnetics.js` |
| 23 | **Magnetohydrodynamics** | Octupole | ℓ=3 harmonic, current-sheet complexity at solar max | `solarMagnetics.js` |
| 24 | **Magnetohydrodynamics** | Field Line Tracing | RK4 integration, polarity classification, open vs closed topology | `solarMagnetics.js` |
| 25 | **Solar Rotation** | Differential Rotation | Snodgrass & Ulrich (1990) latitudinal profile, equator faster than poles | `sunVisuals.js` |

### C. Solar Wind & Heliosphere

| # | Subject | Topic | Section/Focus Area | Implemented In |
|---|---|---|---|---|
| 26 | **Solar Wind** | Parker Spiral | Archimedes spiral geometry, garden-hose angle at 1 AU (~45°) | `solarWind.js` |
| 27 | **Solar Wind** | Bimodal Speed | Slow wind (350-450 km/s, equatorial), fast wind (650-800 km/s, coronal holes) | `solarWind.js` |
| 28 | **Solar Wind** | IMF (Parker Model) | B_r ∝ r⁻², B_φ from rotation, |B| ≈ 5 nT at 1 AU | `solarWind.js` |
| 29 | **Solar Wind** | Dynamic Pressure | P_dyn = ½ρv², magnetosphere standoff distance | `solarWind.js` |

### D. Radiation Forces

| # | Subject | Topic | Section/Focus Area | Implemented In |
|---|---|---|---|---|
| 30 | **Radiation Pressure** | SRP Acceleration | β ratio (F_rad/F_grav), anti-sunward force, spacecraft/dust dynamics | `radiation_pressure.py` |
| 31 | **Radiation Pressure** | Poynting-Robertson Drag | Tangential drag from radiation aberration, orbital decay timescale | `radiation_pressure.py` |
| 32 | **Radiation Pressure** | Dust Blowout | Critical grain size at β=0.5, zodiacal light maintenance | `radiation_pressure.py` |
| 33 | **Thermal Forces** | Yarkovsky Effect | Diurnal/seasonal thermal recoil, NEO delivery from main belt, da/dt drift | `radiation_pressure.py` |

### E. Galactic Dynamics

| # | Subject | Topic | Section/Focus Area | Implemented In |
|---|---|---|---|---|
| 34 | **Galactic Tides** | Heisler-Tremaine Model | Linearized tidal field, vertical vs radial components | `galactic_tide.py` |
| 35 | **Galactic Tides** | Oort Cloud Perturbation | Long-period comet injection, ~90% from tides, ~10% from stellar encounters | `galactic_tide.py` |
| 36 | **Galactic Structure** | Oort Limit | Local disk mass density ρ₀ ≈ 0.1 M☉/pc³ | `galactic_tide.py` |
| 37 | **Galactic Structure** | Sgr A* Mass | 4×10⁶ M☉ at 8 kpc, direct pull vs distributed tidal effect | `galactic_tide.py` |

### F. General Relativity (Educational)

| # | Subject | Topic | Section/Focus Area | Implemented In |
|---|---|---|---|---|
| 38 | **Gravitational Waves** | Spacetime Distortion | h+ polarization, LIGO band (10-1000 Hz), strain ~10⁻²¹ | `gravitationalWaves.js` |
| 39 | **Gravitational Waves** | Visualization | Exaggerated grid deformation for educational purposes | `gravitationalWaves.js` |

### G. Numerical Methods

| # | Subject | Topic | Section/Focus Area | Implemented In |
|---|---|---|---|---|
| 40 | **ODE Integration** | Runge-Kutta 4th Order | Vector-safe accumulation, field line tracing | `solarMagnetics.js` |
| 41 | **N-Body Simulation** | REBOUND Integration | Additional forces callbacks, operator splitting | `radiation_pressure.py`, `galactic_tide.py` |
| 42 | **Noise Functions** | Procedural Generation | Voronoi cells, fBm, Perlin-style 3D noise, hash functions | `sunVisuals.js` |

---

## Part 2: Papers & Research Sources Referenced

### Primary Sources (Directly Used in Code)

| # | Citation | Year | Topic | How Used |
|---|---|---|---|---|
| 1 | Neckel, H. & Labs, D., "Solar limb darkening 1986-1990", *Solar Physics* **153**, 91-114 | 1994 | Limb Darkening | 5th-order polynomial coefficients for R/G/B channels |
| 2 | Nordlund, Å. & Stein, R.F., "Convection Simulations", in *New Eyes to See Inside the Sun and Stars*, IAU Symp. 185 | 1998 | Granulation | ~22% RMS intensity contrast for solar granulation |
| 3 | De Pontieu, B. et al., "Chromospheric Alfvénic Waves Strong Enough to Power the Solar Wind", *Science* **318**, 1574 | 2007 | Type II Spicules | Dual-population spicule classification, velocity ranges |
| 4 | Beckers, J.M., "Solar Spicules", *Ann. Rev. Astron. Astrophys.* **10**, 73 | 1972 | Type I Spicules | Height, velocity, lifetime parameters |
| 5 | Topka, K.P. et al., "Properties of the smallest solar magnetic elements", *ApJ* **484**, 479 | 1997 | Faculae | Center-to-limb contrast variation |
| 6 | van de Hulst, H.C., "The Electron Density of the Solar Corona", *Bull. Astron. Inst. Netherlands* **11**, 135 | 1950 | K-Corona | Baumbach-van de Hulst radial intensity profile |
| 7 | Baumbach, S., "Strahlung, Ergiebigkeit und Elektronenzahl der Sonnenkorona", *Astron. Nachr.* **263**, 121 | 1937 | K-Corona | Original radial electron density model |
| 8 | Snodgrass, H.B. & Ulrich, R.K., "Rotation of Doppler features in the solar photosphere", *ApJ* **351**, 309 | 1990 | Differential Rotation | Latitudinal rotation rate profile Ω(θ) |
| 9 | Burns, J.A. et al., "Radiation forces on small particles in the solar system", *Icarus* **40**, 1 | 1979 | Radiation Pressure | SRP, Poynting-Robertson drag formulation |
| 10 | Bottke, W.F. et al., "The Yarkovsky and YORP Effects: Implications for Asteroid Dynamics", *Ann. Rev. Earth Planet. Sci.* **34**, 157 | 2006 | Yarkovsky Effect | Secular drift rate formula |
| 11 | Heisler, J. & Tremaine, S., "The Influence of the Galactic Tidal Field on the Oort Comet Cloud", *Icarus* **65**, 13 | 1986 | Galactic Tides | Linearized tidal tensor formulation |
| 12 | Levison, H.F. et al., "The mass disruption of Oort cloud comets", *AJ* **121**, 2253 | 2001 | Oort Cloud | Long-period comet injection rates |
| 13 | McComas, D.J. et al., "Solar wind observations over Ulysses' first full polar orbit", *J. Geophys. Res.* **108**, 1291 | 2003 | Solar Wind | Bimodal speed structure at solar min/max |
| 14 | Wilson, A., "Philosophical Transactions of the Royal Society", **64**, 1 | 1774 | Wilson Depression | Geometric foreshortening of sunspot umbra |
| 15 | Evershed, J., "Radial movement in sun-spots", *MNRAS* **69**, 454 | 1909 | Evershed Effect | Radially outward flow in penumbra |

### Standards & Constants

| # | Source | Used For |
|---|---|---|
| 16 | IAU 2015 Nominal Solar Luminosity | L☉ = 3.828 × 10²⁶ W |
| 17 | GOES X-Ray Classification System (NOAA/SWPC) | Flare temporal profile (Neupert effect) |
| 18 | NASA CDAW CME Catalog | CME angular width range (20°-120°) |
| 19 | CIE 1931 Color Matching Functions | Planck → sRGB color conversion |
| 20 | LIGO/Virgo Collaboration | Strain amplitude ~10⁻²¹, detection band |

### Background / Contextual References (Not Directly Coded)

| # | Citation | Relevance |
|---|---|---|
| 21 | Parker, E.N., "Dynamics of the Interplanetary Gas and Magnetic Fields", *ApJ* **128**, 664 (1958) | Parker spiral theory foundation |
| 22 | Hathaway, D.H., "The Solar Cycle", *Living Rev. Sol. Phys.* **7**, 1 (2010) | Solar cycle forcing model |
| 23 | Altschuler, M.D. & Newkirk, G., "Magnetic Fields and the Structure of the Solar Corona", *Sol. Phys.* **9**, 131 (1969) | PFSS method origin |
| 24 | Rosner, R., Tucker, W.H. & Vaiana, G.S., "Dynamics of the quiescent solar corona", *ApJ* **220**, 643 (1978) | RTV coronal loop scaling laws |

---

## Part 3: Improvement Assessment — Galactic Nucleus, Solar Pressure, Gravitational Waves

### 3A. Galactic Nucleus Mass & Distributed Milky Way Gravity

**The question:** How should the galactic center (Sgr A*) and the distributed mass of the Milky Way act upon the Sun in our simulation?

**Current state:** `galactic_tide.py` implements the Heisler-Tremaine linearized tidal model. It already subsumes the galactic center's effect. Here's why:

**The physics reality:**
- Sgr A* (4×10⁶ M☉) at 8 kpc produces a direct pull of ~8.7×10⁻¹² m/s²
- The **entire Milky Way's enclosed mass** at the Sun's orbit (~1×10¹¹ M☉ within 8 kpc) produces the Sun's orbital velocity of ~230 km/s
- But in our **heliocentric** simulation, the Sun IS the frame of reference. What matters isn't the absolute pull on the Sun — it's the **differential** pull (tidal force) across the solar system.
- The tidal tensor already captures this: it's derived from the gradient of the galactic gravitational potential, which includes Sgr A*, the stellar disk, the dark matter halo, and everything else.

**What we should actually add (and what matters):**

1. **Milky Way potential model (recommended):** Replace the Heisler-Tremaine approximation with a proper galactic potential. The standard approach is the **McMillan (2017) Milky Way potential** which has 6 components:
   - Thin disk (exponential, M ≈ 4.3×10¹⁰ M☉)
   - Thick disk (exponential, M ≈ 1.0×10¹⁰ M☉)
   - HI gas disk
   - Bulge (power-law cutoff, M ≈ 0.9×10¹⁰ M☉)
   - Dark matter halo (NFW profile, M_vir ≈ 1.3×10¹² M☉)
   - Sgr A* (~4×10⁶ M☉, negligible compared to bulge)

2. **Practical impact assessment:**
   - For inner solar system (Mercury → Neptune): galactic gravity is **completely irrelevant**. At 30 AU, galactic tides are ~10⁻¹⁸ of solar gravity. You'd never simulate this.
   - For Oort Cloud (10,000-100,000 AU): galactic tides are **the dominant external perturber**. This is where implementation matters.
   - For Sedna/extreme TNOs (~500-1000 AU): galactic tides are marginally detectable over Gyr timescales.

3. **Recommendation:** The current Heisler-Tremaine implementation is **already the correct approach** for a solar system simulation. The direct Sgr A* pull is subsumed in the tidal tensor and shouldn't be modeled separately. However, we could improve it by:
   - Adding the Oort A and B constants for a more refined rotation curve
   - Including a time-dependent galactic plane crossing term (the Sun bobs up and down through the disk with a ~70 Myr period)
   - Adding stochastic stellar encounter perturbations (which contribute ~10% of Oort Cloud comet injection)

### 3B. Solar Radiation Pressure

**Current state:** `radiation_pressure.py` already implements:
- SRP acceleration (β × GM☉/r²)
- Poynting-Robertson drag
- Dust blowout size
- Yarkovsky effect
- REBOUND callback

**What could be improved:**

1. **Wavelength-dependent cross-section (Mie scattering):** Our current model assumes geometric optics (Cr = 1 or 2). For dust grains near the blowout size (~0.1-1 μm), the radiation pressure efficiency Q_pr depends strongly on wavelength and grain size. Burns et al. (1979) use Q_pr; we should compute it from Mie theory for realistic dust dynamics.

2. **Solar wind drag:** For sub-micron particles, corpuscular (solar wind) drag can exceed Poynting-Robertson drag by a factor of ~0.3. Add a corpuscular drag term: `a_sw ≈ 0.35 × a_PR × (v_sw/c)`.

3. **YORP effect:** The Yarkovsky–O'Keefe–Radzievskii–Paddack effect changes asteroid **spin rates**. This determines whether asteroids spin up to disruption or slow down. Not currently modeled, but important for asteroid belt evolution.

4. **Variable luminosity:** Solar luminosity varies by ~0.1% over the solar cycle. Negligible for orbits, but could be coupled to the existing activity parameter.

### 3C. Gravitational Waves — Honest Assessment

**My no-BS opinion: The current GW visualization is educational entertainment, not physics. And that's fine — but we shouldn't pretend otherwise. Here's the deep breakdown:**

#### Why GW Visualization is Fundamentally Problematic for a Solar System Sim

1. **The numbers are devastating.** The strongest GW signal LIGO has ever detected (GW150914) had strain h ≈ 10⁻²¹. This stretches the Earth-Sun distance by:
   ```
   ΔL = h × L = 10⁻²¹ × 1.5×10¹¹ m = 1.5×10⁻¹⁰ m = 0.15 picometers
   ```
   That's **1/10th the radius of a hydrogen atom**. To make this visible on screen we amplify by 10¹⁸×. At that amplification, a grain of sand becomes the diameter of Earth. There's no physical meaning left.

2. **GWs don't deform space the way the grid shows.** The visualization shows a plane deforming with + polarization. But GWs are **transverse-traceless** perturbations to the metric tensor. They have no Newtonian analogue. The grid is misleading — it suggests a physical displacement of space, which is not what happens. Space doesn't slosh back and forth like water. The metric relationship between events changes.

3. **No GW source in the solar system.** The Sun is a solitary star. To emit measurable GWs, you need compact binaries (neutron stars, black holes) or extreme events. The Sun's GW emission from quadrupole moment changes is:
   ```
   P_GW_sun ≈ 200 W  (yes, two hundred watts)
   ```
   Compare to its luminosity: 3.8×10²⁶ W. The Sun's GW output is about what your living room lights use.

4. **No GW interaction with the solar system.** Even background GWs from the stochastic background (pulsar timing array band, ~10⁻⁹ Hz) have strain h ≈ 10⁻¹⁵, which produces a displacement of ~0.15 μm across 1 AU. Undetectable by any orbital measurement.

#### Are There Better Approaches? Absolutely.

Instead of GWs, here are physics that actually matter and would be far more impactful to model:

| Effect | Magnitude at 1 AU | Priority |
|---|---|---|
| **General relativistic precession** | Mercury perihelion: 43"/century | **HIGH** — this is detectable, famous, and beautiful to visualize |
| **Shapiro time delay** | ~200 microseconds for Venus radar | Medium |
| **Gravitomagnetic frame-dragging** | ~10⁻¹² of solar gravity | Low (undetectable in our sim) |
| **Lense-Thirring precession** | ~0.04"/century for Mercury | Low |
| **Geodetic precession** | ~19.2"/century for Earth-Moon | Low-Medium |

**My strong recommendation:** Replace the GW grid with **GR precession visualization**. Here's why:
- Mercury's 43"/century perihelion advance is one of the most famous results in physics
- It's a **real, measurable effect** in the solar system
- It accumulates over time, so with time acceleration you can actually see the orbit rosette
- The implementation is straightforward: add a 1/r⁴ correction term to the gravitational acceleration
- The formula is exact: `a_GR = 3 GM v²/(r² c²) r̂` (Post-Newtonian 1PN correction)
- You could show the precessing orbit of Mercury as a beautiful rosette pattern as the simulation runs

This is **real physics happening in our solar system right now**, versus a cartoon of an effect that changes nothing by 10⁻²¹.

#### What I'd Actually Implement

If the user wants a GR module, here's the physics hierarchy in order of actual importance for a solar system simulation:

1. **1PN gravitational correction** (Mercury precession) — real, visible, famous
2. **Solar radiation pressure** (already done ✅)
3. **Galactic tides** (already done ✅, matters for Oort Cloud)
4. **Solar oblateness J₂** — causes ~0.03"/century precession of Mercury, detectable
5. **Asteroid Yarkovsky** (already done ✅)
6. **Relativistic time dilation** (informational display, not dynamical)
7. **GW visualization** (educational only — keep as optional toggle with clear disclaimers)

**Bottom line:** The GW module is fine as a clearly-labeled educational toy, but if the goal is physics fidelity, **1PN GR precession is 10²⁰ times more relevant** and would actually produce visible orbital effects in the simulation.

---

## Part 4: Recommended Next Improvements (Priority Ordered)

### Tier 1 — High Impact, Physically Correct

1. **Post-Newtonian 1PN GR correction** — Mercury perihelion precession (43"/century)
   - Add `a_GR = (GM/r²c²) × [4GM/r - v²] × r̂ + 4(v·r̂)v⃗` to N-body
   - Visible with time acceleration; educational gold

2. **Wire prominences into main.js** — 5-minute integration task, immediate visual payoff

3. **Wire solar wind into Parker spiral renderer** — parameterize existing particles with bimodal speed/density

4. **Milky Way plane-crossing oscillation** — Sun's 70 Myr galactic-plane crossing period, modulates Oort Cloud comet flux

### Tier 2 — Medium Impact

5. **Mie scattering radiation pressure** — wavelength-dependent Q_pr for dust dynamics
6. **Stochastic stellar encounters** — periodic close-approach perturbations for Oort Cloud
7. **Solar J₂ oblateness** — small but real precession contribution
8. **Coronal loop temperature stratification** — DEM-aware AIA channel rendering

### Tier 3 — Nice to Have

9. **YORP spin evolution** — asteroid rotational disruption
10. **Corpuscular drag enhancement** — solar wind drag on small dust grains
11. **Variable solar luminosity** — 0.1% cycle-coupled irradiance variation
