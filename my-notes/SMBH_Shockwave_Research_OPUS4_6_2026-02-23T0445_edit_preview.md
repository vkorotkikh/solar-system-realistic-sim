# SMBH Shockwave Research & Modeling Hypotheses
## AGN Blast Waves, Exotic Transient Emissions, and Galactic-Scale Effects on the Solar System

**Date:** 2026-02-23  
**Status:** Research & Hypothesis Generation  
**Scope:** Sgr A* (Milky Way SMBH), M87* (Virgo A), AGN blast physics, modeling approaches

---

## 1. What We Know: Sgr A* and AGN Physics

### 1.1 Sgr A* — Our Galactic Center SMBH

| Property | Value | Source |
|---|---|---|
| Mass | 4.154 ± 0.014 × 10⁶ M☉ | GRAVITY Collaboration (2022) |
| Distance | 8.178 ± 0.013 kpc (26,673 ly) | GRAVITY Collaboration (2019) |
| Schwarzschild radius | 1.24 × 10¹⁰ m (0.083 AU) | Derived |
| Current luminosity | ~10³⁶ erg/s (10⁻⁹ L_Edd) | Baganoff et al. (2003) |
| Eddington luminosity | ~5 × 10⁴⁴ erg/s | Derived |
| Current state | **Extremely quiescent** (0.000000001 of max) | — |
| X-ray flares | ~1/day, factor ×10-160 increase, ~1 hour | Neilsen et al. (2013) |
| NIR flares | ~4/day, factor ×2-20 increase | Dodds-Eden et al. (2009) |

**Critical point:** Sgr A* is currently one of the least active SMBHs known. It's accreting at ~10⁻⁸ M☉/yr — essentially starving. But this hasn't always been the case.

### 1.2 Evidence of Past Sgr A* Activity

| Event | Evidence | Timescale | Energy |
|---|---|---|---|
| **Fermi Bubbles** | Two γ-ray lobes extending 50° above/below galactic plane | ~6-9 Myr ago | ~10⁵⁵-10⁵⁷ erg |
| **eROSITA Bubbles** | X-ray counterparts of Fermi Bubbles, even larger | Same epoch | Same event |
| **X-ray light echo** | Molecular cloud fluorescence (Sgr B2 etc.) | ~100-400 yr ago | L_X ~ 10³⁹ erg/s (×1000 current) |
| **Ionization cones** | Far-UV ionization of Magellanic Stream | ~3.5 Myr ago (Bland-Hawthorn+ 2019) | ~10⁴¹ erg/s (Seyfert-level) |
| **G2 cloud approach** | Tidal disruption near-miss in 2014 | Ongoing | No major flare |

**Key insight for simulation:** Sgr A* has had at least one **Seyfert-level outburst** in the last ~6 Myr, producing the Fermi Bubbles. This is the kind of event the user wants to model — a galactic-scale blast wave.

### 1.3 M87* — The Nearest Massive Elliptical Galaxy's SMBH

| Property | Value |
|---|---|
| Host galaxy | M87 (Virgo A), giant elliptical |
| Distance | 16.8 ± 0.8 Mpc (54.7 Mly) |
| Mass | 6.5 ± 0.7 × 10⁹ M☉ |
| Schwarzschild radius | 1.9 × 10¹³ m (127 AU, larger than Pluto's orbit) |
| Jet length | ~5,000 ly (1.5 kpc), extending to ~100 kpc |
| Jet velocity | 0.98c (apparent superluminal: up to 6c) |
| Current luminosity | ~10⁴² erg/s (actively accreting AGN) |

M87* is **1,500× more massive** than Sgr A* and currently **10⁶× more luminous**. Its relativistic jet is one of the most studied in astrophysics.

---

## 2. Emission Mechanisms & Wave/Particle Physics

### 2.1 What an AGN Actually Emits

When an SMBH enters an active state (AGN phase), it produces emissions across **every force carrier and energy scale**:

#### Electromagnetic Radiation
| Band | Mechanism | Where Produced |
|---|---|---|
| Radio | Synchrotron radiation | Relativistic jet |
| Infrared | Thermal dust emission | Dusty torus |
| Optical/UV | Thermal accretion disk emission | Accretion disk |
| X-ray | Inverse Compton, disk corona | Hot corona above disk |
| γ-ray (GeV) | Inverse Compton in jet | Relativistic jet |
| γ-ray (TeV) | Hadronic cascades, photomeson production | Jet shocks |

#### Ultra-High-Energy Cosmic Rays (UHECR)
- AGN jets are candidate sources for UHECRs (E > 10¹⁸ eV, up to ~10²⁰ eV)
- The Pierre Auger Observatory has shown correlation between UHECR arrival directions and nearby AGN (Abraham et al. 2007, 2017)
- Particle energies: up to 3 × 10²⁰ eV = **48 joules** in a single proton (macroscopic energy in a subatomic particle)
- These propagate at essentially c but are deflected by intergalactic magnetic fields

#### Neutrinos
- IceCube Collaboration (2018) detected high-energy neutrinos from blazar TXS 0506+056
- AGN are confirmed sources of astrophysical neutrinos (E ~ TeV-PeV)
- Travel at ~c, undeflected by magnetic fields, nearly unabsorbed

#### Gravitational Waves
- **Continuous GW from SMBH binary inspiral:** If Sgr A* had a binary companion, GW from the inspiral would be in the nanohertz band (pulsar timing arrays)
- **Burst GW from SMBH accretion events:** Tidal disruption events produce GW bursts, but h ~ 10⁻²¹ at our distance from Sgr A*
- **GW from SMBH merger:** If the Milky Way collides with Andromeda (~4.5 Gyr), the SMBH merger would produce GW detectable by LISA

### 2.2 The "Shockwave" Concept — What's Physically Real

The user's intuition about a **shockwave** from an AGN event is grounded in real physics. There are several distinct propagation phenomena:

#### A. Relativistic Blast Wave (Blandford-McKee 1976)
- When a jet or flare ejects energy, the expanding shell sweeps up ISM/CGM material
- Creates a **forward shock** propagating through the medium at ~0.1-0.99c
- The Fermi Bubbles ARE this — a blast wave that has expanded ~25,000 ly from the galactic center
- **Arrival time at Sun:** If the blast travels at ~0.1c through the galactic disk, it reaches us (26,000 ly) in ~260,000 years
- At ~0.5c: ~52,000 years
- **This is a real physical process.** The blast wave compresses gas, heats it, accelerates cosmic rays, and modifies the local environment.

#### B. Electromagnetic Pulse / Light Front
- The EM radiation from an AGN outburst travels at exactly c
- Arrives at Earth 26,673 years after emission from Sgr A*
- The X-ray light echo from molecular clouds tells us this happened ~100-400 years ago (the EM front passed us ~300 years ago, and we see its echo off clouds)
- **No superluminal propagation in EM.**

#### C. Cosmic Ray Tsunami
- UHECRs from an AGN event travel at ~c but are **deflected by magnetic fields**
- Galactic magnetic field: ~3-6 μG, coherence length ~100 pc
- A 10¹⁸ eV proton has gyroradius ~300 pc in a 3 μG field — it doesn't travel straight
- Lower energy cosmic rays (GeV-TeV) are even more deflected, arriving **thousands to millions of years** after the event
- **This creates a "cosmic ray tsunami"** — a drawn-out, delayed wave of particle arrivals that can last Myr

#### D. The Superluminal Illusion (REAL OBSERVED PHENOMENON)

**This is the physics that matches the user's intuition.** Superluminal apparent motion is real and observed:

- M87's jet shows proper motion of **6c apparent** (Biretta et al. 1999)
- This is NOT actual FTL motion — it's a **geometric projection effect**
- When a jet moves at 0.98c toward the observer at angle θ, the apparent transverse velocity is:
  ```
  v_app = v × sin(θ) / (1 - (v/c) × cos(θ))
  ```
- For v = 0.98c, θ = 10°: v_app = 6.1c
- The photons from successive positions along the jet arrive at nearly the same time because the jet is almost catching its own light
- **Result:** From our reference frame, the jet APPEARS to sweep across the sky faster than light

#### E. The Exotic Wave Hypothesis (User's Concept)

The user's concept of a wave that travels at c in its own frame but appears FTL from our frame maps to several real/speculative physics:

1. **Phase velocities > c:** De Broglie matter waves, plasma wave phase fronts, and group velocities of photons in anomalous dispersion media can exceed c. No information transfer, but the *pattern* propagates superluminally. Relevant for modeling the *appearance* of an AGN shockwave front.

2. **Relativistic blast wave + light travel time:** A blast wave expanding at 0.99c from Sgr A* in our direction would arrive only ~267 years after we first see part of the event — making it look like the physical blast is "almost simultaneous" with the light. If a 3D blast wave erupts from the galactic center, parts of it aimed at us arrive *before* we see the transverse expansion, creating an apparent FTL sweep.

3. **Quantum entanglement / correlated transients:** Not applicable for energy transfer. No known mechanism for superluminal energy propagation.

4. **Plasma instabilities and magnetic reconnection cascades:** Large-scale magnetic reconnection events in the galactic magnetic field could cascade superluminally in *apparent* velocity (the trigger propagates at c, but the chain-reaction triggers distant events that appear simultaneous). Analogous to a row of dominoes that are already at threshold — the "wave" of falling dominoes can appear faster than the trigger signal.

---

## 3. Modeling Approaches — Five Hypotheses

### Hypothesis 1: Blandford-McKee Blast Wave (Most Physical)

**Model:** Relativistic hydrodynamic blast wave from an AGN outburst at the galactic center.

**Physics:**
- Blandford & McKee (1976) self-similar solution for ultrarelativistic blast waves
- Energy injection: 10⁵⁵-10⁵⁷ erg (Fermi Bubble energy)
- Lorentz factor at launch: Γ ≈ 10-100
- Deceleration as it sweeps up ISM (ρ ~ 10⁻²⁴ g/cm³)
- Sedov-Taylor phase when Γ → 1 (non-relativistic)

**Observable effects at the Sun:**
- Cosmic ray flux increase: ×10-100 for ~10⁵ years
- Magnetic field compression: local B increases by factor of ~4 at the shock front
- Hot plasma: shock-heated gas at T ~ 10⁷-10⁸ K (X-ray emitting)
- Earth's magnetosphere compressed

**Modeling approach:**
```
r_shock(t) = (17E t²/(8π ρ c⁵))^(1/8)  × c   [ultrarelativistic phase]
r_shock(t) = (E t²/(ρ))^(1/5)               [Sedov-Taylor phase]
```

**Implementation:** Expand a spherical/conical blast shell from galactic center, track its arrival at the solar system, show compression of the heliosphere.

**Paper:** Blandford & McKee, "Fluid dynamics of relativistic blast waves", *Physics of Fluids* **19**, 1130 (1976)

### Hypothesis 2: Relativistic Jet Precession Sweep

**Model:** Sgr A* jet precesses (like a lighthouse) and periodically sweeps across the solar system.

**Physics:**
- AGN jets precess due to Lense-Thirring frame-dragging of a tilted accretion disk
- Precession period: ~10⁵-10⁷ years
- When the jet beam points at us, we receive a focused relativistic blast
- Doppler boosted: emission boosted by δ⁴ where δ = 1/[Γ(1 - β cos θ)]
- For Γ = 10, head-on: δ ≈ 20, so luminosity boosted by 20⁴ = 160,000×

**Observable effects at the Sun:**
- Brief (10²-10⁴ year) intense CR and γ-ray exposure
- Potential ozone depletion if flux is high enough (Thomas et al. 2005)
- Solar energetic particle environment dramatically altered

**Modeling approach:** Rotating cone with Lorentz factor Γ, Doppler beaming formula, ISM interaction.

**Paper:** Caproni et al., "Jet precession in AGN", *MNRAS* **379**, 135 (2007)

### Hypothesis 3: Cosmic Ray Tsunami (Multi-Messenger)

**Model:** The "shockwave" isn't a single front but a **multi-messenger cascade** arriving over different timescales.

**Physics:**
- t = 0: AGN outburst at Sgr A*
- t + 26,673 yr: EM light front arrives (γ → radio, all at c)
- t + 26,673 yr + 0-100 yr: Neutrino front arrives (essentially c, ~slight mass delay)
- t + 27,000 yr: UHECR front (>10¹⁸ eV, nearly straight-line, minimal deflection)
- t + 30,000-50,000 yr: High-E cosmic ray front (TeV-PeV, moderate deflection)
- t + 50,000-500,000 yr: Low-E cosmic ray "tsunami" (GeV, heavily deflected, diffuse)
- t + 50,000-300,000 yr: Physical blast wave (sub-relativistic by now)

**The "shockwave" experience at the Sun:**
1. First: sky brightens in γ/X-ray from galactic center direction
2. Then: cosmic ray flux rises steadily over millennia
3. Then: hot blast wave compresses heliosphere
4. Finally: cosmic ray flux slowly declines over ~1 Myr

**Modeling approach:** Multiple expanding shells with different speeds and diffusion properties. The user's current shader with a compression front + trailing turbulence captures this multi-timescale arrival well.

**Paper:** Biermann & Sigl, "Introduction to Cosmic Rays", *Lecture Notes in Physics* **576**, 1 (2001)

### Hypothesis 4: Magnetic Reconnection Chain Reaction (Exotic)

**Model:** The AGN blast triggers cascading magnetic reconnection events across the galactic magnetic field, creating an apparently superluminal propagation front.

**Physics:**
- The galactic magnetic field is ~3-6 μG with coherence scales ~100 pc
- An energetic blast wave from the GC compresses the field, pushing regions past the reconnection threshold
- Reconnection propagates at ~0.1 v_A (Alfvén velocity), where v_A ~ 20-50 km/s in the ISM
- BUT: if the field is already near-threshold everywhere (magnetic energy stored over Myr), the blast is just the trigger — the domino cascade appears to propagate at the blast wave speed through pre-stressed regions
- This creates a **galaxy-wide magnetic storm** with energy release at scales disconnected from the propagation speed of the trigger

**Observable effects at the Sun:**
- Rapid (hours-days) change in the local interstellar magnetic field
- Heliosphere shape deformation
- Enhanced cosmic ray access to inner solar system (reduced magnetic shielding)

**Modeling approach:** Percolation model — cells at threshold that flip when neighbors flip. The cascade front propagates as a contact wave through a meta-stable medium.

**Papers:**
- Lazarian & Vishniac, "Reconnection in a Weakly Stochastic Field", *ApJ* **517**, 700 (1999)
- Uzdensky, "Magnetic Reconnection in Extreme Astrophysical Environments", *Space Sci. Rev.* **160**, 45 (2012)

### Hypothesis 5: M87* Intergalactic Blast Wave

**Model:** A major outburst from M87* (6.5 × 10⁹ M☉) sends an intergalactic blast wave that reaches the Local Group.

**Physics:**
- M87* is 54.7 Mly away but 1,500× more massive than Sgr A*
- Its jet already extends ~100 kpc (~326,000 ly) into the intracluster medium
- A sufficiently powerful outburst could drive a blast wave through the Virgo Cluster ICM
- The ICM has density ~10⁻²⁸ g/cm³, the blast decelerates slowly
- Arrival time: 54.7 Myr at c, ~500 Myr for a subrelativistic blast

**Observable effects at the Sun:**
- If a focused jet aims at the Local Group: enhanced extragalactic cosmic ray flux
- Intergalactic magnetic field perturbation
- Likely negligible directly, but contributes to the cosmic ray background

**Realistic assessment:** The M87* effect on the Sun is **extremely marginal** compared to Sgr A*. Even M87's enormous jet dissipates over ~100 kpc. The 54.7 Mly distance attenuates everything by ~(1/54.7)² ≈ 3×10⁻⁴ compared to a 26,000 ly source.

**However:** For visualization purposes, an intergalactic blast wave from M87 is spectacular and educational. The concept of a Mpc-scale shockwave sweeping through the cosmic web is physically real — clusters of galaxies DO produce merger shocks visible in radio (radio relics, radio halos).

**Paper:** EHT Collaboration, "First M87 EHT Results. I", *ApJ Lett.* **875**, L1 (2019)

---

## 4. Papers & Sources for Further Study

### Core References

| # | Citation | Topic |
|---|---|---|
| 1 | Blandford & McKee, *Phys. Fluids* **19**, 1130 (1976) | Relativistic blast wave self-similar solutions |
| 2 | GRAVITY Collaboration, Abuter+ *A&A* **657**, L12 (2022) | Sgr A* mass measurement |
| 3 | EHT Collaboration, *ApJ Lett.* **930**, L12-L17 (2022) | First image of Sgr A* |
| 4 | EHT Collaboration, *ApJ Lett.* **875**, L1-L6 (2019) | First image of M87* |
| 5 | Su, Slatyer & Finkbeiner, *ApJ* **724**, 1044 (2010) | Discovery of Fermi Bubbles |
| 6 | Predehl+ *Nature* **588**, 227 (2020) | eROSITA Bubbles (X-ray counterpart) |
| 7 | Bland-Hawthorn+ *ApJ* **886**, 45 (2019) | Sgr A* Seyfert flare 3.5 Myr ago |
| 8 | Abraham+ (Pierre Auger), *Science* **318**, 939 (2007) | UHECR-AGN correlation |
| 9 | IceCube Collaboration, *Science* **361**, eaat1378 (2018) | Neutrinos from blazar TXS 0506+056 |
| 10 | Biretta+ *ApJ* **520**, 621 (1999) | Superluminal motion in M87 jet |
| 11 | Thomas+ *ApJ* **622**, L153 (2005) | GRB/AGN γ-ray impact on Earth's ozone |
| 12 | Baganoff+ *ApJ* **591**, 891 (2003) | Sgr A* quiescent X-ray emission |
| 13 | Neilsen+ *ApJ* **774**, 42 (2013) | Sgr A* X-ray flare statistics |
| 14 | Sedov, *Similarity and Dimensional Methods in Mechanics* (1959) | Sedov-Taylor blast wave solution |
| 15 | Biermann & Sigl, *Lect. Notes Phys.* **576**, 1 (2001) | Cosmic ray propagation |

### Speculative / Forward-Looking

| # | Citation | Topic |
|---|---|---|
| 16 | Zubovas & Nayakshin, *MNRAS* **424**, 666 (2012) | Sgr A* feeding events and Fermi Bubble energetics |
| 17 | Mertsch & Sarkar, *JCAP* **2011**, 041 (2011) | Cosmic ray anisotropy from Fermi Bubble edges |
| 18 | Caproni+ *MNRAS* **379**, 135 (2007) | AGN jet precession |
| 19 | Lazarian & Vishniac, *ApJ* **517**, 700 (1999) | Fast magnetic reconnection in stochastic fields |
| 20 | Uzdensky, *Space Sci. Rev.* **160**, 45 (2012) | Reconnection in extreme astrophysical environments |

---

## 5. Implementation Recommendations for the Simulation

### What to Model (in order of scientific validity)

1. **Fermi Bubble analog** — a historical blast wave that has already passed the Sun
   - Visualize as two expanding γ-ray/X-ray lobes above and below the galactic plane
   - Show the blast front sweeping past the solar system
   - Duration: the front passes in ~10,000-100,000 simulation years

2. **Cosmic ray tsunami** — multi-timescale particle arrival
   - First: EM flash from galactic center (instantaneous visually)
   - Then: rising cosmic ray flux (particle count increases over millennia)
   - Then: physical blast front (compression of heliosphere)

3. **AGN jet sweep** — if Sgr A* reactivates and jet swings through
   - Focused beam with Doppler boosting
   - Appears nearly instantaneous (superluminal apparent motion)
   - The user's shader with compression front + trailing glow captures this well

4. **M87 intergalactic wash** — extremely weak but grand in scale
   - Subtle background cosmic ray enhancement from Virgo direction
   - More of an educational visualization than a physical effect

### Current Implementation Assessment

The user's modifications to `gravitationalWaves.js` are a solid foundation:
- **Compression front** (`exp(distBehind * 0.5)`) — physically maps to the Blandford-McKee self-similar blast wave density profile
- **Gamma-ray glow** at the wavefront — correct; the shock front is where particle acceleration and emission peak
- **Vertical turbulence** behind the front — physically maps to post-shock turbulence and magnetic field amplification
- **Superluminal sweep appearance** — can be achieved by advancing `shockwaveDist` faster than the light-travel scaling in the simulation

### What the Shockwave Would Actually Do to the Sun

If Sgr A* had a Fermi-Bubble-scale outburst (10⁵⁶ erg) and the blast wave reached the Sun:

| Effect | Magnitude | Duration |
|---|---|---|
| Cosmic ray flux increase | ×10-100 | 10⁴-10⁶ years |
| Heliosphere compression | Heliopause pushed from ~120 AU to ~30 AU | While blast passes |
| Increased C-14 production | ×5-20 in tree rings | 10³-10⁴ years |
| Ozone reduction (if jet-focused) | Up to 50% (Thomas+ 2005) | 10²-10³ years |
| GW strain from the event | h ~ 10⁻²¹ to 10⁻¹⁸ | Hours (during event) |
| Direct gravitational effect | Negligible | — |
| Magnetic field at solar location | Compressed by ×2-4 | 10⁴ years |

---

## 6. Constants for Implementation

```javascript
// Sgr A* parameters
const SGR_A_MASS_MSUN = 4.154e6;
const SGR_A_DISTANCE_LY = 26673;
const SGR_A_DISTANCE_KPC = 8.178;

// M87* parameters
const M87_MASS_MSUN = 6.5e9;
const M87_DISTANCE_MLY = 54.7;

// Fermi Bubble parameters
const FERMI_BUBBLE_ENERGY_ERG = 1e56;
const FERMI_BUBBLE_HEIGHT_KPC = 10;  // extends 10 kpc above/below disk
const FERMI_BUBBLE_AGE_MYR = 6;     // ~6 Myr since outburst

// Blast wave parameters
const BLAST_INITIAL_LORENTZ = 10;    // Γ₀ at launch
const ISM_DENSITY_CGS = 1e-24;      // g/cm³ in galactic disk
const ICM_DENSITY_CGS = 1e-28;      // g/cm³ in intracluster medium
```
