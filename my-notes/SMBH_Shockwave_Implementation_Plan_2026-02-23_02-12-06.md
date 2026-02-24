# SMBH Compound Shockwave — Implementation Plan
## Physics-Based Multi-Messenger AGN Effects for Solar System Simulation

**Author:** Nomad  
**Date:** 2026-02-23 02:12:06 CST  
**Source Research:** `SMBH_Shockwave_Research_2026-02-23_EXPANDED_T1030.md` (2,614 lines)  
**Scope:** Transform the existing `agnShockwaveEngine.js` from a timeline-based trigger into a physics-based compound shockwave simulation

---

## Current State Assessment

### What Exists

| File | Lines | Function | Status |
|------|-------|----------|--------|
| `agnShockwaveEngine.js` | 349 | Multi-messenger timeline with 4 channels (GW, EM, UHECR, MHD), 3 sources, apparent superluminal formula, log-time compression, solar flare callbacks | **Working but non-physical** — uses arbitrary delay parameters, no actual propagation physics, no cross-force coupling |
| `gravitationalWaves.js` | 202 | Shader-based spacetime distortion grid (400×400 units, 64×64 segments), AGN shockwave front with compression + gamma-ray glow | **Working visual** — good foundation, needs physics-driven parameters |
| `sunController.js` | 423 | Integration point — creates GW displayer (size=400), AGN engine with flare callbacks, updates in animation loop | **Working integration** — clean architecture for extension |
| `main.js` (AGN section) | ~20 lines | UI event handlers: source selector, observer-frame toggle, trigger button | **Working UI** — needs expansion |
| `index.html` (AGN section) | ~12 lines | Dropdown (3 sources), checkbox (observer frame), trigger button | **Working** — needs significant expansion |
| `galactic_tide.py` | 166 | Galactic tidal field (Heisler-Tremaine 1986), Sgr A* mass constant (informational only) | **Working** — no AGN physics |

### Architecture Summary

```
index.html (UI controls)
    │
    ▼
main.js (event handlers)
    │
    ▼
sunController.js (integration layer)
    ├── Creates: createGWVisualization(400) → gwDisplayer
    ├── Creates: createAgnShockwaveEngine(gwDisplayer, solarResponder)
    ├── Animation loop: agnEngine.update(dtSec)
    └── Exposes: triggerAgnShockwave(), setAgnObserverFrameMode()
         │
         ├── agnShockwaveEngine.js
         │   ├── SOURCE_MODELS (3 sources with mass, distance, delays)
         │   ├── CHANNEL_CONFIG (4 channels with amplitude)
         │   ├── computeApparentSpeedFactor() — superluminal projection
         │   ├── yearsToDisplaySeconds() — log-time compression
         │   ├── buildTimeline() — arrival time computation
         │   └── triggerEvent() / update() — animation state machine
         │
         └── gravitationalWaves.js
             ├── GW_VERTEX_SHADER — spacetime distortion + shockwave front
             ├── GW_FRAGMENT_SHADER — grid lines + gamma-ray glow
             └── createGWVisualization() — mesh, update, toggle, setParams
```

### What's Missing (from Research Document)

1. **No physics-based propagation** — channels use arbitrary delay constants, not diffusion/blast equations
2. **No compound wave coupling** — channels are fully independent
3. **No cosmic ray diffusion model** — energy-dependent propagation not modeled
4. **No Blandford-McKee blast dynamics** — no deceleration, no Sedov-Taylor transition
5. **No heliosphere response** — no pressure-balance compression model
6. **No GW memory effect** — no permanent displacement tracking
7. **No Fermi Bubble visualization** — no historical blast wave rendering
8. **No continuous stochastic flaring** — only single discrete events
9. **No multi-source compound effects** — sources don't interact
10. **No event energy parameter** — user cannot select outburst energy scale
11. **No timeline/history UI** — no visual representation of multi-messenger arrival sequence
12. **No reference-frame visualization difference** — observer frame only changes propagation speed scalar

---

## Implementation Plan — 6 Phases

### Phase 1: Physical Constants & Propagation Physics Module
**Priority: CRITICAL | Estimated effort: Medium | Dependencies: None**

Create a new standalone physics module with real constants and propagation equations.

**New file:** `src/frontend/features/solar/smblPhysicsConstants.js`

```
Contents:
  - All physical constants from research doc Section 15
  - Sgr A*, Cen A, Maffei 1, M87* source parameters
  - Functions:
    • blandfordMcKeeRadius(energy, rho, t) — ultrarelativistic blast
    • sedovTaylorRadius(energy, rho, t) — non-relativistic blast
    • blastTransitionRadius(energy, rho) — BM→ST transition
    • crDiffusionTime(distance, energy, bField) — energy-dependent CR diffusion
    • crDiffusionCoefficient(energy, bField, spectralIndex)
    • alfvenSpeed(bField, density)
    • apparentSuperluminalSpeed(beta, theta)
    • dopplerFactor(beta, theta, gamma)
    • fluxBoost(dopplerFactor, spectralIndex)
    • heliospherePressureBalance(solarWindPressure, ismPressure)
    • heliopauseRadius(externalPressureFactor)
    • gwMemoryStrain(hPeak, fraction)
    • hillasMaxEnergy(charge, beta, bField, radius)
    • gyroRadius(energy, charge, bField)
```

**New file:** `src/frontend/features/solar/smblSourceCatalog.js`

```
Contents:
  - Detailed source models (replaces SOURCE_MODELS in agnShockwaveEngine.js):
    • SgrA: mass, distance, spin, B-field, current luminosity, Eddington luminosity
    • CenA: mass, distance, jet parameters (spine-sheath), UHECR data
    • Maffei1: mass, distance, obscuration, estimated parameters
    • M87: mass, distance, jet parameters (educational)
  - Event presets:
    • 'SgrA_Seyfert': E=10⁴³ erg, Γ=2, 3.5 Myr ago
    • 'SgrA_FermiBubble': E=10⁵⁶ erg, Γ=10, 5 Myr ago
    • 'SgrA_CurrentFlare': E=10³⁹ erg, Γ=1, continuous
    • 'CenA_Jet': E=10⁵⁶ erg, Γ=5, 30 Myr ago
    • 'Maffei1_Hypothetical': E=10⁵⁵ erg, Γ=3, unknown
    • 'Custom': user-specified parameters
  - 7 channel definitions (expanded from 4):
    • gw: gravitational wave packet (v = c)
    • em: EM burst gamma→radio (v = c, ISM dispersion)
    • neutrino: neutrino burst (v ≈ c)
    • uhecr: UHECR front >10¹⁸ eV (near-ballistic, small deflection)
    • cr_tsunami: GeV-TeV cosmic ray diffusive front
    • alfven: Alfvén/MHD wave front
    • blast: Physical blast wave (Blandford-McKee → Sedov-Taylor)
```

### Phase 2: Compound Shockwave Engine Rewrite
**Priority: CRITICAL | Estimated effort: Large | Dependencies: Phase 1**

Rewrite `agnShockwaveEngine.js` to use physics-based propagation.

**Refactor:** `src/frontend/features/solar/agnShockwaveEngine.js`

```
Key changes:
  1. Import physics from Phase 1 modules
  2. Replace hardcoded delays with computed propagation times:
     - GW/EM/neutrino: d/c (exact light travel time)
     - UHECR: d/c × (1 + δθ²/2) where δθ = deflection angle
     - CR tsunami: √(2·D(E)·t) = d → t = d²/(2D(E))
     - Alfvén: d/v_A (medium-dependent)
     - Blast: sedovTaylorRadius⁻¹(d) — invert to get arrival time
  3. Add energy parameter to triggerEvent():
     triggerEvent(source, energy_erg, theta_obs, eventIntensity)
  4. Add 7-channel system (from 4)
  5. Add coupling matrix (CR↔MHD initially, others as coupling_strength param)
  6. Physics-driven shader parameters:
     - strain = f(source_energy, distance, channel)
     - frequency = f(channel_type, energy)
     - shockwaveDist = f(propagation_equation, elapsed_time)
  7. Compound wave state object:
     {
       channels: { gw: { position, velocity, amplitude, arrived }, ... },
       coupling: { cr_mhd: strength, gw_em: strength },
       heliosphereState: { heliopauseAU, compressionFactor },
       gwMemory: { accumulatedStrain, permanent: true/false }
     }
  8. Multi-event support: allow multiple active events simultaneously
     (e.g., continuous Sgr A* flaring + triggered catastrophic event)
```

**New method: `createStochasticFlaringBackground()`**

```
Implements H6 (continuous stochastic flaring):
  - Power-law flare distribution: dN/dE ∝ E^(-1.7)
  - Random flare generation every few simulation-seconds
  - Occasional rare mega-flare from the distribution tail
  - Each flare launches a mini compound shockwave (low energy)
  - Accumulates as background CR flux enhancement
```

### Phase 3: Enhanced Visualization (Shaders + Rendering)
**Priority: HIGH | Estimated effort: Large | Dependencies: Phase 2**

Upgrade `gravitationalWaves.js` and add new visual layers.

**Refactor:** `src/frontend/features/solar/gravitationalWaves.js`

```
Key changes:
  1. Multi-channel rendering (not just single compression front):
     - GW: spacetime distortion grid (existing, improved)
     - EM: gamma-ray flash (bright white/blue pulse)
     - UHECR: faint particle streaks arriving from source direction
     - CR tsunami: gradual ambient glow increase (warm orange/red)
     - Blast wave: physical compression front (existing, improved with
       proper BM→ST density profile)
  2. Physics-driven shader uniforms:
     - shockwaveDist[] array (one per channel) instead of single value
     - channelAmplitude[] array
     - channelColor[] array
  3. GW memory visualization:
     - After GW passes, leave faint permanent grid distortion
     - Distortion magnitude = gwMemoryStrain × exaggeration
  4. Heliosphere shell visualization:
     - Semi-transparent sphere at heliopauseRadius
     - Compresses when blast arrives (radius shrinks)
     - Color shifts from blue (normal) to red (compressed/stressed)
  5. Reference frame toggle visual difference:
     - Observer frame: events appear compressed in time, faster
     - Comoving frame: events at physical speed, causally ordered
     - Clear visual indicator of which frame is active
```

**New file:** `src/frontend/features/solar/heliosphereVisual.js`

```
Contents:
  - Heliosphere boundary shell (semi-transparent mesh)
  - Heliopause at ~120 AU (scaled to scene units)
  - Termination shock at ~90 AU
  - Responds to external pressure: radius = f(P_external)
  - Color: blue(normal) → yellow(compressed) → red(critical)
  - Tail asymmetry (downwind extends further)
```

**New file:** `src/frontend/features/solar/fermiBubbleVisual.js`

```
Contents:
  - Two biconical lobes above/below galactic plane
  - Semi-transparent with gamma-ray coloring (purple/blue)
  - Inner (Fermi, 10 kpc) and outer (eROSITA, 15 kpc) structures
  - Expansion animation capability
  - Toggle: show historical blast wave evidence
```

### Phase 4: UI Expansion & Timeline Display
**Priority: HIGH | Estimated effort: Medium | Dependencies: Phase 2, 3**

Expand the HTML controls and add a multi-messenger arrival timeline.

**Modify:** `index.html`

```
New controls in "Cataclysmic Events" section:
  - Energy scale slider: 10³⁹ → 10⁵⁷ erg (logarithmic)
    Labels: "Current Flare" → "Seyfert" → "Fermi Bubble"
  - Event preset dropdown: predefined scenarios from source catalog
  - Observer angle slider: 0° → 90° (affects apparent speed)
  - Lorentz factor display: computed Γ shown as read-only
  - Apparent speed display: computed β_app shown as read-only
  - Reference frame toggle with visual indicator
  - "Show Fermi Bubbles" checkbox
  - "Show Heliosphere" checkbox
  - "Continuous Flaring" toggle (H6)
  - Hypothesis selector: which hypothesis visualization to activate

New panel: "Multi-Messenger Timeline"
  - Horizontal timeline bar showing channel arrivals
  - Each channel as a colored marker on the timeline
  - Labels with physical arrival times (years)
  - Current event progress indicator
  - Past events shown as faded markers
```

**Modify:** `src/main.js`

```
New event handlers:
  - Energy slider → recalculate propagation times
  - Preset selector → load predefined event parameters
  - Observer angle → update apparent speed display
  - Fermi Bubble toggle → show/hide fermiBubbleVisual
  - Heliosphere toggle → show/hide heliosphereVisual
  - Continuous flaring toggle → start/stop stochastic background
  - Hypothesis selector → configure visualization mode
```

### Phase 5: Backend Physics Module
**Priority: MEDIUM | Estimated effort: Medium | Dependencies: Phase 1**

Add Python backend module for heavy physics computations.

**New file:** `backend/sim/agn_physics.py`

```
Contents:
  Functions (callable via existing backend API):
    • compute_blast_wave_trajectory(energy, density_profile, max_time)
        → returns r(t), v(t), Γ(t) arrays for BM→ST evolution
    • compute_cr_diffusion_front(energy_spectrum, b_field_model, distance)
        → returns arrival_time(E), flux(E, t) arrays
    • compute_heliosphere_response(external_pressure_history)
        → returns heliopause_radius(t)
    • compute_fermi_bubble_evolution(energy, density_profile, age)
        → returns bubble radius, temperature, expansion velocity
    • compute_multi_messenger_timeline(source, event_params)
        → returns full 7-channel arrival timeline with physics
    • compute_coupling_matrix(channels, medium_params)
        → returns coupling coefficients for compound wave
    • compute_stochastic_flare_sequence(duration, alpha, E_min, E_max)
        → returns time series of flare events (power-law distributed)
```

**New file:** `backend/sim/cr_transport.py`

```
Contents:
  - Energy-dependent diffusion coefficient model
  - Bohm diffusion limit
  - Empirical fit to AMS-02/DAMPE data
  - Anisotropic diffusion (parallel vs perpendicular to B-field)
  - Spiral arm waveguide correction factor (H10)
  - CR streaming instability growth rate
  - Effective compound wave speed (CR + self-generated Alfvén waves)
```

### Phase 6: Advanced Hypothesis Visualizations
**Priority: LOW-MEDIUM | Estimated effort: Large | Dependencies: All above**

Implement visual modes for specific hypotheses from the research document.

**H7: Heliosphere Resonance Drum**
```
  - Animate heliopause "breathing" at resonant frequency (~2.3 yr period)
  - Show mode shapes (radial standing wave in heliosheath)
  - Collapse animation when shockwave CR component matches resonance
```

**H9: Oort Cloud Calorimeter**
```
  - Render Oort Cloud shell (existing galactic tide module connects)
  - Color-code comets by CR exposure (isotope enrichment proxy)
  - Show CR flux at Oort Cloud distance vs inner solar system
```

**H10: Spiral Arm Fiber Optic**
```
  - Render simplified Milky Way spiral arm structure (top-down view mode)
  - Highlight magnetic field lines along Sagittarius arm
  - Animate CR preferential propagation along arm toward Sun
```

**H11: Magnetar Relay Network**
```
  - Place magnetar markers between GC and Sun
  - Animate "Christmas lights" effect as GW front passes each one
  - Brief radio pulse emission at each magnetar position
```

**H14: Andromeda Premonition**
```
  - Show M31 direction and approach vector
  - Future merger timeline (extremely long timescale)
  - "What-if" mode: simulate MW-M31 SMBH merger effects
```

---

## Execution Order & Dependencies

```
Phase 1 ──────────────────────► Phase 2 ──────► Phase 3
(Constants & Physics)            (Engine)        (Visuals)
    │                               │               │
    │                               ▼               ▼
    └──────────────────────────► Phase 4 ◄──────────┘
                                  (UI)
    │
    ▼
Phase 5 ─────────────────────────────────────► Phase 6
(Backend)                                      (Advanced Viz)
```

**Recommended execution:** Phase 1 → Phase 2 → Phase 3 + Phase 4 (parallel) → Phase 5 → Phase 6

---

## Phase 1 Implementation Details

### File: `src/frontend/features/solar/smbhPhysicsConstants.js`

```javascript
// SPEED OF LIGHT
export const C_CM_S = 2.998e10;          // cm/s
export const C_KM_S = 2.998e5;           // km/s
export const C_AU_YR = 63241.1;          // AU/yr

// DISTANCE CONVERSIONS
export const PC_CM = 3.086e18;
export const KPC_CM = 3.086e21;
export const MPC_CM = 3.086e24;
export const LY_CM = 9.461e17;
export const AU_CM = 1.496e13;

// TIME CONVERSIONS
export const YR_S = 3.156e7;
export const MYR_S = 3.156e13;

// PHYSICAL CONSTANTS
export const G_CGS = 6.674e-8;          // cm³/(g·s²)
export const M_SUN_G = 1.989e33;
export const M_PROTON_G = 1.673e-24;
export const K_B_CGS = 1.381e-16;       // erg/K
export const E_CHARGE_ESU = 4.803e-10;
export const EV_ERG = 1.602e-12;

// SGR A*
export const SGR_A = {
  massMsun: 4.154e6,
  massG: 4.154e6 * 1.989e33,
  distanceKpc: 8.178,
  distanceCm: 8.178 * 3.086e21,
  distanceLy: 26_673,
  rSchwarzCm: 1.24e10,
  luminosityErgS: 1e36,
  eddingtonErgS: 5.2e44,
  flareRatePerDay: 5.5,
  spinEstimate: 0.5,
  bFieldHorizonG: 50
};

// CENTAURUS A
export const CEN_A = {
  massMsun: 5.5e7,
  distanceMpc: 3.8,
  distanceCm: 3.8 * 3.086e24,
  distanceLy: 12_400_000,
  jetBetaSpine: 0.94,
  jetBetaSheath: 0.80,
  jetBetaAppXray: 2.7,
  jetPowerErgS: 1e43,
  lobeSizeKpc: 500,
  uhecrExcessEeV: 40
};

// MAFFEI 1
export const MAFFEI_1 = {
  massMsun: 3e8,
  distanceMpc: 2.85,
  distanceCm: 2.85 * 3.086e24,
  distanceLy: 9_300_000,
  extinctionAv: 4.7,
  agnStatus: 'unknown'
};

// M87*
export const M87 = {
  massMsun: 6.5e9,
  distanceMpc: 16.8,
  distanceCm: 16.8 * 3.086e24,
  distanceLy: 54_700_000,
  jetBeta: 0.98,
  jetBetaApp: 6.3,
  jetPowerErgS: 1e44,
  rSchwarzCm: 1.9e13
};

// ISM PARAMETERS
export const ISM = {
  diskDensityCgs: 1e-24,        // g/cm³
  haloDensityCgs: 1e-27,
  bFieldDiskG: 5e-6,            // 5 μG
  bFieldHaloG: 1e-6,
  bCoherencePc: 100,
  soundSpeedWarmKmS: 10,
  soundSpeedHotKmS: 150
};

// HELIOSPHERE
export const HELIO = {
  heliopauseAu: 120,
  terminationShockAu: 90,
  helioshealthWidthAu: 30,
  lismVelocityKmS: 26,
  lismPressureCgs: 2e-12
};

// GW CONSTRAINTS
export const GW = {
  speedConstraint: 5e-16,       // |v_GW/c - 1| upper limit
  nanoGravHc: 2.4e-15,
  nanoGravFRef: 3.17e-8         // 1/yr in Hz
};
```

### File: `src/frontend/features/solar/smbhPropagation.js`

```javascript
// Physics-based propagation functions

import { C_CM_S, YR_S, G_CGS, ISM, AU_CM, E_CHARGE_ESU, M_PROTON_G } from './smbhPhysicsConstants.js';

/**
 * Sedov-Taylor blast wave radius.
 * r(t) = (E·t²/ρ)^(1/5)
 */
export function sedovTaylorRadius(energy_erg, density_cgs, time_s) {
  return Math.pow(energy_erg * time_s * time_s / density_cgs, 0.2);
}

/**
 * Sedov-Taylor blast arrival time at distance d.
 * Inverts r(t) = (E·t²/ρ)^(1/5) → t = (ρ·d⁵/E)^(1/2)
 */
export function sedovTaylorArrivalTime(energy_erg, density_cgs, distance_cm) {
  return Math.sqrt(density_cgs * Math.pow(distance_cm, 5) / energy_erg);
}

/**
 * Blandford-McKee ultrarelativistic shock Lorentz factor.
 * Γ(t) = (17E/(1024π·ρ·c⁵·t³))^(1/8)
 */
export function blandfordMcKeeGamma(energy_erg, density_cgs, time_s) {
  const num = 17 * energy_erg;
  const den = 1024 * Math.PI * density_cgs * Math.pow(C_CM_S, 5) * Math.pow(time_s, 3);
  return Math.pow(num / den, 0.125);
}

/**
 * Transition radius from BM (ultrarelativistic) to Sedov-Taylor.
 * r_trans ≈ (3E/(4π·ρ·c²))^(1/3)
 */
export function blastTransitionRadius(energy_erg, density_cgs) {
  return Math.pow(3 * energy_erg / (4 * Math.PI * density_cgs * C_CM_S * C_CM_S), 1/3);
}

/**
 * CR diffusion coefficient (empirical, energy-dependent).
 * D(E) = D₀ × (R/R₀)^δ
 * where R = rigidity ≈ E/(Ze·c) for relativistic particles
 */
export function crDiffusionCoefficient(energy_eV, bFieldG = ISM.bFieldDiskG, delta = 0.4) {
  const D0 = 5e28;        // cm²/s at R₀ = 4 GV
  const R0_GV = 4.0;
  const R_GV = energy_eV * 1.602e-12 / (E_CHARGE_ESU * C_CM_S * 1e9);
  return D0 * Math.pow(Math.max(R_GV / R0_GV, 1e-6), delta);
}

/**
 * CR diffusion time from source to Sun.
 * t_diff = d²/(6D)   [3D isotropic diffusion]
 */
export function crDiffusionTime(distance_cm, energy_eV, bFieldG) {
  const D = crDiffusionCoefficient(energy_eV, bFieldG);
  return distance_cm * distance_cm / (6 * D);
}

/**
 * Alfvén speed in magnetized plasma.
 * v_A = B / √(4πρ)
 */
export function alfvenSpeed(bFieldG, density_cgs) {
  return bFieldG / Math.sqrt(4 * Math.PI * density_cgs);
}

/**
 * Apparent superluminal velocity factor.
 * β_app = β·sin(θ) / (1 - β·cos(θ))
 */
export function apparentBeta(beta, theta_rad) {
  const denom = 1 - beta * Math.cos(theta_rad);
  if (denom < 1e-10) return beta;
  return beta * Math.sin(theta_rad) / denom;
}

/**
 * Doppler factor for relativistic source.
 * δ = 1 / [Γ(1 - β·cos(θ))]
 */
export function dopplerFactor(beta, theta_rad) {
  const gamma = 1 / Math.sqrt(1 - beta * beta);
  return 1 / (gamma * (1 - beta * Math.cos(theta_rad)));
}

/**
 * Observed flux boost from Doppler beaming.
 * S_obs/S_int = δ^(3+α) where α = spectral index
 */
export function fluxBoost(beta, theta_rad, spectralIndex = 0.7) {
  const delta = dopplerFactor(beta, theta_rad);
  return Math.pow(delta, 3 + spectralIndex);
}

/**
 * Heliopause radius given external pressure multiplication factor.
 * R_HP_new ≈ R_HP_old / √F
 */
export function heliopauseRadius(pressureFactor, nominalRadiusAU = 120) {
  return nominalRadiusAU / Math.sqrt(Math.max(1, pressureFactor));
}

/**
 * CR gyroradius in magnetic field.
 * r_g = E / (Z·e·B·c)
 */
export function gyroRadius(energy_eV, chargeZ, bFieldG) {
  return (energy_eV * 1.602e-12) / (chargeZ * E_CHARGE_ESU * bFieldG * C_CM_S);
}

/**
 * Hillas maximum energy from an astrophysical accelerator.
 * E_max ≈ β_s × Z × (B/1μG) × (R/1kpc) × 10¹⁸ eV
 */
export function hillasMaxEnergy(betaShock, chargeZ, bFieldMicroG, radiusKpc) {
  return betaShock * chargeZ * bFieldMicroG * radiusKpc * 1e18;  // eV
}

/**
 * GW memory strain (permanent displacement after GW passage).
 * Δh ≈ fraction × h_peak (typically fraction ≈ 0.05-0.15)
 */
export function gwMemoryStrain(hPeak, fraction = 0.1) {
  return fraction * hPeak;
}

/**
 * Build full 7-channel arrival timeline with physics.
 */
export function computeMultiMessengerTimeline(source, energy_erg, theta_obs_rad) {
  const d = source.distanceCm;

  const tLight = d / C_CM_S;   // light-travel time (seconds)

  const channels = [
    {
      key: 'gw',
      label: 'Gravitational Wave Packet',
      speed: C_CM_S,
      arrivalTimeS: tLight,
      amplitude: 0.15,
      color: [0.3, 0.5, 1.0]   // blue
    },
    {
      key: 'em',
      label: 'EM Burst (γ → radio)',
      speed: C_CM_S,
      arrivalTimeS: tLight + 100, // slight ISM dispersion delay for radio
      amplitude: 0.4,
      color: [1.0, 1.0, 0.8]   // bright white-yellow
    },
    {
      key: 'neutrino',
      label: 'Neutrino Burst',
      speed: C_CM_S * 0.999999999999999,
      arrivalTimeS: tLight + 1,
      amplitude: 0.05,           // nearly undetectable
      color: [0.5, 0.8, 0.5]   // green
    },
    {
      key: 'uhecr',
      label: 'UHECR Front (>10¹⁸ eV)',
      speed: C_CM_S * 0.9999,
      arrivalTimeS: crDiffusionTime(d, 1e18, ISM.bFieldDiskG),
      amplitude: 0.6,
      color: [1.0, 0.6, 0.2]   // orange
    },
    {
      key: 'cr_tsunami',
      label: 'GeV-TeV Cosmic Ray Tsunami',
      speed: null,               // diffusive, no single speed
      arrivalTimeS: crDiffusionTime(d, 1e12, ISM.bFieldDiskG),
      amplitude: 0.8,
      color: [1.0, 0.3, 0.1]   // deep orange-red
    },
    {
      key: 'alfven',
      label: 'Alfvén/MHD Wave Front',
      speed: alfvenSpeed(ISM.bFieldDiskG, ISM.diskDensityCgs),
      arrivalTimeS: d / alfvenSpeed(ISM.bFieldDiskG, ISM.diskDensityCgs),
      amplitude: 0.3,
      color: [0.6, 0.2, 0.8]   // purple
    },
    {
      key: 'blast',
      label: 'Physical Blast Wave',
      speed: null,               // decelerating
      arrivalTimeS: sedovTaylorArrivalTime(energy_erg, ISM.diskDensityCgs, d),
      amplitude: 1.0,
      color: [1.0, 0.1, 0.1]   // red
    }
  ];

  channels.sort((a, b) => a.arrivalTimeS - b.arrivalTimeS);

  return {
    source: source,
    energy: energy_erg,
    thetaObs: theta_obs_rad,
    channels,
    lightTravelTimeS: tLight,
    lightTravelTimeYr: tLight / YR_S,
    apparentSpeedFactor: apparentBeta(
      source.jetBetaSpine || source.jetBeta || 0.9,
      theta_obs_rad
    )
  };
}
```

---

## Immediate Next Steps (Starting Now)

1. **Create `smbhPhysicsConstants.js`** — all constants and source parameters
2. **Create `smbhPropagation.js`** — physics functions for propagation
3. **Refactor `agnShockwaveEngine.js`** — import new physics, replace hardcoded delays with computed values, add 7-channel system
4. **Update `gravitationalWaves.js`** — multi-channel shader uniforms
5. **Update `sunController.js`** — pass new parameters through
6. **Update `index.html` + `main.js`** — energy slider, preset selector

---

## Summary Priority Table

| Phase | Priority | Effort | Deliverable |
|-------|----------|--------|-------------|
| **1** | CRITICAL | Medium | Physics constants + propagation functions |
| **2** | CRITICAL | Large | Rewritten AGN engine with 7 channels + physics |
| **3** | HIGH | Large | Enhanced shaders + heliosphere + Fermi Bubbles |
| **4** | HIGH | Medium | Expanded UI + timeline display |
| **5** | MEDIUM | Medium | Python backend physics module |
| **6** | LOW-MED | Large | Advanced hypothesis visualizations (H7-H14) |
