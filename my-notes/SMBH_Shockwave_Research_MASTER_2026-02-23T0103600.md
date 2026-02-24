# SMBH Shockwave Research — Consolidated Master Document
## AGN Blast Waves, Exotic Transient Emissions, Multi-Messenger Propagation, and Galactic-Scale Effects on the Solar System
### Hypotheses H1–H16 with Full Mathematical Treatment, Observational Backing, and Simulation Modeling

**Author:** Nomad (Solar System Simulation Research)  
**Date:** 2026-02-23 (Consolidated 09:00 EST — German Beer Edition 🍺)  
**Consolidates:** `SMBH_Shockwave_Research`, `SMBH_Exotic_Hypotheses_Deep_Dive`, `SMBH_Research_Addendum`, `SMBH_Radical_Hypotheses_H7-H16`, `Physics_Reference_Catalog`  
**Total Hypotheses:** 16 (H1–H16)  
**Total Referenced Papers:** 55+  

---

## Table of Contents

1. [What We Know: Sgr A* and AGN Physics](#1-what-we-know)
2. [Emission Mechanisms & Wave/Particle Physics](#2-emission-mechanisms)
3. [The "Shockwave" Concept — What's Physically Real](#3-shockwave-concept)
4. [Hypotheses H1–H6: Conservative to Moderate Speculation](#4-hypotheses-h1-h6)
5. [Hypotheses H7–H16: Radical & Out-of-the-Box](#5-hypotheses-h7-h16)
6. [The Reference Frame Duality — Why It "Looks FTL"](#6-reference-frame-duality)
7. [Nearest External AGN: Centaurus A, Maffei 1, M87](#7-external-agn)
8. [JWST 2025 Breakthrough — Sgr A* Never Sleeps](#8-jwst-2025)
9. [Complete Bibliography (55+ Papers)](#9-bibliography)
10. [Simulation Architecture & Implementation](#10-simulation)
11. [Codebase Gap Analysis](#11-gap-analysis)
12. [Constants for Implementation](#12-constants)

---

## 1. What We Know: Sgr A* and AGN Physics

### 1.1 Sgr A* — Our Galactic Center SMBH

| Property | Value | Source |
|---|---|---|
| Mass | 4.154 ± 0.014 × 10⁶ M☉ | GRAVITY Collaboration (2022) |
| Distance | 8.178 ± 0.013 kpc (26,673 ly) | GRAVITY Collaboration (2019) |
| Schwarzschild radius | R_s = 2GM/c² = 1.24 × 10¹⁰ m (0.083 AU) | Derived |
| ISCO (Schwarzschild) | R_ISCO = 3R_s = 3.72 × 10¹⁰ m (0.249 AU) | Derived |
| Current luminosity | ~10³⁶ erg/s (10⁻⁹ L_Edd) | Baganoff et al. (2003) |
| Eddington luminosity | L_Edd = 4πGMm_p c/σ_T ≈ 5.2 × 10⁴⁴ erg/s | Derived |
| Current accretion rate | ~10⁻⁸ M☉/yr | Yuan & Narayan (2014) |
| Eddington accretion rate | Ṁ_Edd = L_Edd/(ηc²) ≈ 0.09 M☉/yr (η=0.1) | Derived |
| Current state | **Extremely quiescent** (10⁻⁹ of Eddington) | — |
| X-ray flares | ~1/day, ×10–160 increase, ~1 hour duration | Neilsen et al. (2013) |
| NIR flares | ~4/day, ×2–20 increase | Dodds-Eden et al. (2009) |
| JWST update (2025) | **5–6 major flares/day, NO quiescent state** | Chen et al. (2025) |
| Spin parameter | a* ≈ 0.1–0.9 (poorly constrained) | EHT (2022) |
| Magnetic field at horizon | B ~ 10–100 Gauss | EHT polarimetry (2024) |
| PeVatron confirmation | Protons accelerated to >10¹⁵ eV | HESS Collaboration (2016, 2024) |

**Critical insight:** Sgr A* is currently one of the least active SMBHs known — but JWST (2025) showed it is NEVER truly quiet. It flares continuously through magnetic reconnection, with no baseline "off" state. And 2.6–6 Myr ago, it was a Seyfert-level AGN producing the Fermi Bubbles.

### 1.2 Evidence of Past Sgr A* Activity

| Event | Evidence | Timescale | Energy | Key Paper |
|---|---|---|---|---|
| **Fermi Bubbles** | Two γ-ray lobes, 50° above/below galactic plane | ~2.6 Myr ago (Owen+ 2025) | 10⁵⁵–10⁵⁷ erg | Su+ (2010) |
| **eROSITA Bubbles** | X-ray counterpart, even larger extent | Same epoch | Same event | Predehl+ (2020) |
| **X-ray light echo** | Molecular cloud fluorescence (Sgr B2, Sgr C) | ~100–400 yr ago | L_X ~ 10³⁹ erg/s | Marin+ (2023, IXPE) |
| **Ionization cones** | Far-UV ionization of Magellanic Stream | ~3.5 Myr ago | ~10⁴¹ erg/s (Seyfert) | Bland-Hawthorn+ (2019) |
| **G2 cloud approach** | Tidal disruption near-miss (2014) | Ongoing | No major flare | Gillessen+ (2012) |
| **Double-episode jet** | Two separate jet events formed inner/outer bubbles | 2.6 Myr + 4.5 Myr | Distinct energies | Owen+ (2025) |

**Mathematical framework — Fermi Bubble energetics:**
```
Total energy:          E_bubble ≈ (4/3)π R³ × (3/2) n k_B T
                       R ≈ 10 kpc, n ≈ 10⁻³ cm⁻³, T ≈ 3×10⁷ K
                       E_bubble ≈ 10⁵⁶ erg

Jet power required:    P_jet = E_bubble / t_active
                       t_active ~ 10⁶ yr → P_jet ~ 3×10⁴² erg/s
                       This requires Ṁ ~ 10⁻³ M☉/yr (100,000× current)

Expansion velocity:    v_exp = R/t ≈ 10 kpc / 2.6 Myr ≈ 3,800 km/s ≈ 0.013c
                       Currently sub-relativistic (Sedov-Taylor phase)

Shock Mach number:     M = v_exp / c_s,   c_s ≈ 500 km/s (halo gas)
                       M ≈ 7.6 → strong shock
```

### 1.3 M87* — The Nearest Giant Elliptical Galaxy's SMBH

| Property | Value |
|---|---|
| Host galaxy | M87 (Virgo A), giant elliptical |
| Distance | 16.8 ± 0.8 Mpc (54.7 Mly) |
| Mass | 6.5 ± 0.7 × 10⁹ M☉ (**1,560× Sgr A***) |
| Schwarzschild radius | R_s = 1.9 × 10¹³ m (127 AU > Pluto's orbit) |
| Jet length | ~5,000 ly (1.5 kpc), extending to ~100 kpc |
| Jet velocity | 0.98c (apparent superluminal: up to 6.3c) |
| Current luminosity | ~10⁴² erg/s (actively accreting AGN) |
| Jet power | ~10⁴⁴ erg/s |

### 1.4 Centaurus A — The Nearest Active AGN (Critical for Shockwave Effects)

| Property | Value | Source |
|---|---|---|
| Host galaxy | NGC 5128, peculiar elliptical (merger remnant) |
| Distance | 3.8 Mpc (12.4 Mly) — **closest AGN** | Harris+ (2010) |
| SMBH mass | ~5.5 × 10⁷ M☉ | Cappellari+ (2009) |
| Jet velocity (actual) | β > 0.94 ± 0.02 (>94% of c) | Bogensberger+ (2024) |
| Jet velocity (apparent X-ray) | **2.7 ± 0.4 c (SUPERLUMINAL)** | Bogensberger+ (2024) |
| Jet velocity (apparent radio) | β ≈ 0.80 (sub-luminal) | Same paper |
| Radio lobe extent | ~500 kpc (1.6 Mly) — ENORMOUS | Feain+ (2011) |
| UHECR excess | Detected by Pierre Auger at >40 EeV | Auger Collab. (2018, 2024) |
| Jet opening angle | < 12° | Bogensberger+ (2024) |

**Why Centaurus A matters more than M87 or Maffei 1:**
- At 3.8 Mpc, it's well within the GZK horizon (~50 Mpc) for UHECRs
- Its UHECRs ARE currently hitting Earth (Pierre Auger detection)
- 2025 paper in *Phys. Rev. D* confirms Cen A as potential **main UHECR factory**
- Spine-sheath jet structure confirmed: fast X-ray core (β>0.94) + slower radio sheath (β≈0.80)

---

## 2. Emission Mechanisms & Wave/Particle Physics

### 2.1 What an AGN Actually Emits

When an SMBH enters an active state, it produces emissions across **every force carrier and energy scale**:

#### Electromagnetic Radiation

| Band | Mechanism | Where Produced | Luminosity Fraction |
|---|---|---|---|
| Radio (GHz) | Synchrotron radiation | Relativistic jet | ~10⁻³ L_bol |
| Infrared (μm) | Thermal dust emission | Dusty torus (1–100 pc) | ~0.3 L_bol |
| Optical/UV | Thermal accretion disk | Accretion disk (10–1000 R_s) | ~0.3 L_bol |
| X-ray (keV) | Inverse Compton, disk corona | Hot corona (T~10⁹ K) | ~0.1 L_bol |
| γ-ray (GeV) | Inverse Compton in jet | Relativistic jet (pc–kpc) | Variable |
| γ-ray (TeV) | Hadronic cascades, photomeson | Jet shocks | Variable |
| VHE γ-ray (>10 TeV) | π⁰ decay from p-p collisions | Accretion flow (PeVatron) | ~10⁻⁵ L_bol |

**Accretion disk spectrum (Shakura-Sunyaev thin disk):**
```
T(r) = T_max × (r/R_ISCO)^(-3/4) × [1 - (R_ISCO/r)^(1/2)]^(1/4)

T_max = [3 G M Ṁ / (8π σ_SB R_ISCO³)]^(1/4)

For Sgr A* at Ṁ = 10⁻⁸ M☉/yr:
  T_max ≈ 10⁷ K → peak emission in soft X-ray

For Sgr A* at Ṁ = 10⁻³ M☉/yr (Seyfert phase):
  T_max ≈ 10⁸ K → peak emission in hard X-ray / soft γ-ray
```

#### Ultra-High-Energy Cosmic Rays (UHECR)

- AGN jets are confirmed sources for UHECRs (E > 10¹⁸ eV, up to ~3 × 10²⁰ eV)
- Pierre Auger Observatory: correlation with nearby AGN (Abraham+ 2007, 2017, 2024)
- Particle energy: up to 3 × 10²⁰ eV = **48 joules** in a single proton
- Propagation: essentially c but deflected by galactic/intergalactic magnetic fields

**Hillas criterion for maximum particle energy:**
```
E_max = q × β_s × B × R

Where: q = particle charge
       β_s = shock velocity / c
       B = magnetic field strength
       R = size of acceleration region

For Sgr A* jet (B ~ 100 G, R ~ 10 R_s, β_s ~ 0.99):
  E_max ≈ e × 0.99 × 100 × (1.24×10¹¹) ≈ 2 × 10¹⁵ eV (PeV) ✓ matches HESS

For Cen A jet (B ~ 10⁻⁴ G, R ~ 1 kpc, β_s ~ 0.94):
  E_max ≈ e × 0.94 × 10⁻⁴ × (3×10²¹) ≈ 4.5 × 10¹⁹ eV (40 EeV) ✓ matches Auger
```

#### Neutrinos

- IceCube (2018): high-energy neutrinos from blazar TXS 0506+056 (E ~ TeV–PeV)
- Travel at ~c, undeflected by magnetic fields, nearly unabsorbed
- Production: pγ and pp interactions → π± → μ± + ν_μ → e± + ν_e + ν_μ

#### Gravitational Waves from SMBH Systems

| Source | Frequency | Strain at 8 kpc | Detector |
|---|---|---|---|
| SMBH binary inspiral | ~1–100 nHz | h ~ 10⁻¹⁵ | Pulsar Timing Arrays |
| EMRI (compact object spiral-in) | ~1–100 mHz | h ~ 10⁻²⁰ | LISA |
| TDE ringdown | ~0.1–10 mHz | h ~ 10⁻²¹ | LISA |
| SMBH merger (MW-M31 future) | ~1–10 mHz | h ~ 10⁻⁸ (!!) | Everything |

**GW strain formula:**
```
h = (4G/c⁴) × (1/d) × (d²I/dt²)

For quadrupole emission from a circular binary:
h = (4/d) × (G M_c/c²)^(5/3) × (π f_gw)^(2/3) / c²

Where M_c = (m₁m₂)^(3/5) / (m₁+m₂)^(1/5) is the chirp mass

NANOGrav stochastic GW background (2023):
  h_c ≈ 2.4 × 10⁻¹⁵ at f = 1 yr⁻¹
  This permeates ALL of space continuously
```

---

## 3. The "Shockwave" Concept — What's Physically Real

### 3A. Relativistic Blast Wave (Blandford-McKee 1976)

The foundational physics of AGN shockwaves. When a jet or flare ejects energy, the expanding shell sweeps up ISM/CGM material.

**Ultrarelativistic phase (Γ >> 1):**
```
Lorentz factor:    Γ(r) = Γ₀ × (r/r₀)^(-3/2)    [energy-conserving]
                   Γ(r) = Γ₀ × (r/r₀)^(-3)       [radiative]

Shock radius:      r_s(t) = [17 E t² / (8π ρ₀ c⁵)]^(1/8) × c

Density profile behind shock:
  ρ(r,t) = ρ₀ × 4Γ² × (1 + 2Γ²(1-r/r_s))
  → Factor of 4Γ² compression at the shock front

Pressure behind shock:
  p = (2/3) × ρ₀ × Γ² × c²
```

**Transition to Sedov-Taylor (Γ → 1):**
```
Transition radius:  r_ST = (E / (ρ₀ c²))^(1/3)
                    For E = 10⁵⁶ erg, ρ₀ = 10⁻²⁴ g/cm³:
                    r_ST ≈ 10²² cm ≈ 3 kpc

Sedov-Taylor phase: r_s(t) = (E t² / ρ₀)^(1/5)
                    v_s(t) = (2/5) × r_s / t

For the Fermi Bubbles:
  r ≈ 10 kpc, t ≈ 2.6 Myr
  v_s ≈ 3,800 km/s (confirmed sub-relativistic)
  Currently in Sedov-Taylor phase
```

**Arrival time at the Sun (26,673 ly = 8.2 kpc from Sgr A*):**

| Initial Γ | Phase at arrival | Velocity at Sun | Travel time |
|---|---|---|---|
| Γ₀ = 100 | Sedov-Taylor | ~0.01c | ~2.6 Myr |
| Γ₀ = 10 | Late deceleration | ~0.03c | ~0.9 Myr |
| Γ₀ = 2 | Mildly relativistic | ~0.1c | ~260,000 yr |
| Light front | Always c | c | 26,673 yr |

### 3B. Electromagnetic Pulse / Light Front

- EM radiation travels at exactly c → arrives 26,673 yr after emission
- The X-ray light echo tells us a significant flare passed Earth ~100–400 yr ago (Marin+ 2023, IXPE)
- Light echo sweeping speed across clouds: **apparent velocity >> c** (geometric effect)

### 3C. Cosmic Ray Tsunami

```
UHECR propagation in galactic magnetic field:

Gyroradius:  r_g = E / (q × B × c)
  At E = 10¹⁸ eV, B = 3 μG: r_g ≈ 300 pc
  At E = 10¹⁵ eV, B = 3 μG: r_g ≈ 0.3 pc

Diffusion coefficient (Bohm limit):
  D_Bohm = (1/3) × r_g × c ≈ (1/3) × (E/qBc) × c = E/(3qB)

Diffusion time from GC to Sun:
  t_diff = d² / (2D)
  At E = 10¹⁵ eV: D ~ 10²⁸ cm²/s → t_diff ~ 3 × 10⁶ yr (3 Myr)
  At E = 10¹² eV: D ~ 10²⁶ cm²/s → t_diff ~ 3 × 10⁸ yr (300 Myr)
  At E = 10¹⁸ eV: D ~ 10³⁰ cm²/s → t_diff ~ 3 × 10⁴ yr (30 kyr)
```

### 3D. Superluminal Apparent Motion (CONFIRMED)

```
Apparent transverse velocity:
  β_app = β × sin(θ) / (1 - β × cos(θ))

Maximum apparent speed at θ_max = arcsin(1/Γ):
  β_app,max = Γ × β ≈ Γ    (for β ≈ 1)

Doppler factor:
  δ = 1 / [Γ(1 - β cos θ)]

Flux boosting:
  S_obs = S_int × δ^(3+α)    (α = spectral index)
  For Γ=10 head-on: δ ≈ 20 → boost ≈ 20⁴ = 160,000×
```

| Source | Observed β_app | Actual β | Γ | θ | Reference |
|---|---|---|---|---|---|
| M87 (HST-1) | 6.3c | 0.98 | ~5 | ~19° | Biretta+ (1999) |
| Cen A (X-ray knot) | 2.7c | >0.94 | >3 | <20° | Bogensberger+ (2024) |
| 3C 279 | 25c | 0.9998 | ~15.5 | ~2° | MOJAVE |
| PKS 0805-07 | 46c | ~0.9998 | ~25 | ~1° | MOJAVE |

---
