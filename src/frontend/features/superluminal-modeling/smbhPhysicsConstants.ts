// @ts-nocheck
/**
 * SMBH Compound Shockwave Physics — Constants & Source Catalog
 *
 * Physical constants, SMBH source parameters, ISM/heliosphere parameters,
 * and event presets for multi-messenger compound shockwave simulation.
 *
 * Sources:
 *   GRAVITY Collaboration (2022) — Sgr A* mass
 *   EHT Collaboration (2019, 2022) — M87*, Sgr A* imaging
 *   Bogensberger+ (2024) — Cen A spine-sheath jet
 *   Pierre Auger (2025) — UHECR from Cen A
 *   NANOGrav (2023) — nanohertz GW background
 *   Chen+ (2025, JWST) — Sgr A* continuous flaring
 *   Owen+ (2025) — double-episode Fermi Bubble model
 */

// ═══════════════════════════════════════════════════════════════════════════
// FUNDAMENTAL CONSTANTS (CGS unless noted)
// ═══════════════════════════════════════════════════════════════════════════

export const C_CM_S = 2.998e10;
export const C_KM_S = 2.998e5;
export const C_AU_YR = 63241.1;

export const G_CGS = 6.674e-8;       // cm³/(g·s²)
export const M_SUN_G = 1.989e33;       // g
export const M_PROTON_G = 1.673e-24;      // g
export const K_B_CGS = 1.381e-16;      // erg/K
export const SIGMA_T = 6.652e-25;      // Thomson cross-section, cm²
export const E_CHARGE = 4.803e-10;      // elementary charge, esu
export const EV_ERG = 1.602e-12;      // erg per eV
export const HBAR_CGS = 1.055e-27;      // erg·s

// ═══════════════════════════════════════════════════════════════════════════
// UNIT CONVERSIONS
// ═══════════════════════════════════════════════════════════════════════════

export const PC_CM = 3.086e18;
export const KPC_CM = 3.086e21;
export const MPC_CM = 3.086e24;
export const LY_CM = 9.461e17;
export const AU_CM = 1.496e13;
export const YR_S = 3.15576e7;
export const MYR_S = 3.15576e13;

// ═══════════════════════════════════════════════════════════════════════════
// SMBH SOURCE CATALOG
// ═══════════════════════════════════════════════════════════════════════════

export const SGR_A = Object.freeze({
    key: 'SagittariusA',
    label: 'Sagittarius A*',
    galaxy: 'Milky Way',
    type: 'quiescent SMBH',

    massMsun: 4.154e6,
    massG: 4.154e6 * 1.989e33,
    distanceKpc: 8.178,
    distanceCm: 8.178 * 3.086e21,
    distanceLy: 26_673,

    rSchwarzschildCm: 1.24e10,          // 0.083 AU
    rIscoCm: 3.72e10,          // Schwarzschild ISCO = 3 R_s
    rPhotonCm: 1.86e10,          // 1.5 R_s
    angularSizeUas: 52,               // μas on sky (EHT)

    luminosityCurrent: 1e36,            // erg/s
    luminosityEddington: 5.2e44,        // erg/s
    accretionRateCurrent: 1e-8,         // M☉/yr
    lOverLedd: 1e-9,

    spinEstimate: 0.5,                  // a* (poorly constrained, 0.1-0.9)
    bFieldHorizonG: 50,                 // Gauss at event horizon (EHT polarimetry)

    flareRatePerDay: 5.5,               // JWST 2025 (Chen+ 2025)
    flarePowerLawIndex: 1.7,            // α in dN/dE ∝ E^(-α)

    pevatronConfirmed: true,            // HESS 2016, 2024
    pevatronMaxEnergyEV: 1e15,

    jetBeta: 0.90,                      // conservative for current state
    jetThetaDeg: 35,                    // observer angle estimate

    direction: [-0.05, -0.86, 0.5]      // approximate galactic coordinates
});

export const CEN_A = Object.freeze({
    key: 'CentaurusA',
    label: 'Centaurus A',
    galaxy: 'NGC 5128',
    type: 'active AGN (nearest)',

    massMsun: 5.5e7,
    massG: 5.5e7 * 1.989e33,
    distanceMpc: 3.8,
    distanceCm: 3.8 * 3.086e24,
    distanceLy: 12_400_000,

    jetBetaSpine: 0.94,                // X-ray fast core (Bogensberger+ 2024)
    jetBetaSheath: 0.80,                // radio slower envelope
    jetBetaAppXray: 2.7,                // apparent superluminal (confirmed)
    jetThetaDeg: 15,                  // estimated viewing angle
    jetPowerErgS: 1e43,
    jetOpeningDeg: 12,

    lobeSizeKpc: 500,                 // giant radio lobes (~600 kpc diameter)

    uhecrDominant: true,                // Pierre Auger 2025: main UHECR source
    uhecrExcessAboveEeV: 5,             // dominates above ~5 EeV
    uhecrMaxEeV: 100,
    uhecrComposition: 'CNO at tens EeV, Si/Fe above 50 EeV',
    egmfUpperLimitNG: 6.7,              // nG·Mpc^(1/2)
    activityTimescaleMyr: 30,           // active within past ~30 Myr

    direction: [-0.35, -0.45, 0.8]
});

export const MAFFEI_1 = Object.freeze({
    key: 'Maffei1',
    label: 'Maffei 1 (Hidden Giant)',
    galaxy: 'Maffei 1',
    type: 'giant elliptical (Zone of Avoidance)',

    massMsun: 3e8,                  // M-σ estimate — NO direct measurement
    massG: 3e8 * 1.989e33,
    distanceMpc: 2.85,
    distanceCm: 2.85 * 3.086e24,
    distanceLy: 9_300_000,

    extinctionAv: 4.7,                  // visual magnitudes of extinction
    agnStatus: 'unknown',               // cannot observe through MW disk
    sizelyApprox: 75_000,

    jetBeta: 0.92,                      // hypothetical
    jetThetaDeg: 20,                    // hypothetical

    direction: [0.23, 0.18, 0.96]
});

export const M87 = Object.freeze({
    key: 'M87',
    label: 'M87* (Virgo A)',
    galaxy: 'M87',
    type: 'giant cD elliptical (educational)',

    massMsun: 6.5e9,
    massG: 6.5e9 * 1.989e33,
    distanceMpc: 16.8,
    distanceCm: 16.8 * 3.086e24,
    distanceLy: 54_700_000,

    rSchwarzschildCm: 1.9e13,           // 127 AU — bigger than Pluto's orbit
    jetBeta: 0.98,
    jetBetaApp: 6.3,                   // Biretta+ 1999
    jetPowerErgS: 1e44,
    jetLengthLy: 5000,                  // visible optical
    jetLengthRadioKpc: 100,

    direction: [0.1, 0.9, 0.4]          // approximate
});

export const SOURCE_CATALOG = Object.freeze({
    SagittariusA: SGR_A,
    CentaurusA: CEN_A,
    Maffei1: MAFFEI_1,
    M87: M87
});

// ═══════════════════════════════════════════════════════════════════════════
// INTERSTELLAR MEDIUM PARAMETERS
// ═══════════════════════════════════════════════════════════════════════════

export const ISM = Object.freeze({
    diskDensityCgs: 1e-24,           // g/cm³ (warm ionized medium)
    haloDensityCgs: 1e-27,           // g/cm³ (hot halo)
    coldNeutralCgs: 5e-23,           // g/cm³ (cold neutral medium)
    hotIonizedCgs: 5e-27,           // g/cm³ (hot ionized medium)

    bFieldDiskG: 5e-6,            // 5 μG (disk average)
    bFieldHaloG: 1e-6,            // 1 μG (halo)
    bCoherencePc: 100,             // coherence length

    soundSpeedWarmKmS: 10,              // warm neutral
    soundSpeedHotKmS: 150,             // hot ionized (T ~ 10⁶ K)

    crDiffCoeffGeV: 2.8e28,          // cm²/s at 1 GeV
    crDiffCoeffTeV: 4.5e29,          // cm²/s at 1 TeV
    crDiffCoeffPeV: 7e30,            // cm²/s at 1 PeV
    crDiffIndex: 0.4,             // δ in D ∝ E^δ
    crDiffRefRigidityGV: 4.0            // reference rigidity
});

// ═══════════════════════════════════════════════════════════════════════════
// HELIOSPHERE PARAMETERS
// ═══════════════════════════════════════════════════════════════════════════

export const HELIO = Object.freeze({
    heliopauseAu: 120,           // upwind (Voyager)
    heliopauseDownwindAu: 300,          // estimated tail
    terminationShockAu: 90,            // average (Voyager 1: 94 AU)
    helioshealthWidthAu: 30,

    lismVelocityKmS: 26,            // local ISM velocity relative to Sun
    lismPressureCgs: 2e-12,         // dyn/cm² (total external pressure)

    alfvenSpeedHeliosheath: 40,         // km/s
    soundSpeedHeliosheath: 150,        // km/s (hot shocked solar wind)

    resonantPeriodYr: 2.3,           // fundamental cavity mode
    qualityFactor: 5              // estimated Q of heliosphere cavity
});

// ═══════════════════════════════════════════════════════════════════════════
// FERMI/eROSITA BUBBLE PARAMETERS
// ═══════════════════════════════════════════════════════════════════════════

export const FERMI_BUBBLES = Object.freeze({
    innerHeightKpc: 10,               // Fermi Bubble height (Su+ 2010)
    outerHeightKpc: 15,               // eROSITA Bubble (Predehl+ 2020)
    innerAgeMyr: 5,                // Owen+ 2025 (double-episode)
    outerAgeMyr: 15,               // Owen+ 2025
    energyErg: 1e56,             // total energy
    temperatureK: 3e7,              // 3-4 × 10⁶ K (eROSITA)
    expansionKmS: 2000,             // current velocity (inner)
    expansionOuterKmS: 1000,            // current velocity (outer)
    gammaRayFlux: 5e-7              // E² dN/dE (GeV/cm²/s/sr)
});

// ═══════════════════════════════════════════════════════════════════════════
// EVENT PRESETS
// ═══════════════════════════════════════════════════════════════════════════

export const WARP_BUBBLE_THICKNESS_RATIO = 0.05; // σ/r₀
export const WARP_AMPLITUDE_SCALE = 1e-6; // Base shift-vector amplitude scaling
export const WARP_DISSIPATION_POWER = 1.0; // scales as 1/r

export const EVENT_PRESETS = Object.freeze({
    SgrA_CurrentFlare: {
        label: 'Sgr A* Typical Flare (NOW)',
        sourceKey: 'SagittariusA',
        energyErg: 1e39,
        lorentzFactor: 1.01,
        description: 'Typical X-ray flare, happens ~5-6× per day (JWST 2025)'
    },
    SgrA_SuperFlare: {
        label: 'Sgr A* Super-Flare (~300 yr ago)',
        sourceKey: 'SagittariusA',
        energyErg: 1e43,
        lorentzFactor: 1.5,
        description: 'Seyfert-level flare evidenced by X-ray echoes (Marin+ 2023)'
    },
    SgrA_FermiBubble_Inner: {
        label: 'Sgr A* Fermi Bubble Event (~5 Myr ago)',
        sourceKey: 'SagittariusA',
        energyErg: 1e56,
        lorentzFactor: 10,
        description: 'Inner bubble formation, jet-driven (Owen+ 2025)'
    },
    SgrA_FermiBubble_Outer: {
        label: 'Sgr A* eROSITA Bubble Event (~15 Myr ago)',
        sourceKey: 'SagittariusA',
        energyErg: 1e57,
        lorentzFactor: 10,
        description: 'Outer bubble formation, first jet episode (Owen+ 2025)'
    },
    CenA_CurrentJet: {
        label: 'Centaurus A Active Jet (NOW)',
        sourceKey: 'CentaurusA',
        energyErg: 1e56,
        lorentzFactor: 5,
        description: 'Ongoing jet activity producing UHECRs hitting Earth (Pierre Auger)'
    },
    Maffei1_Hypothetical: {
        label: 'Maffei 1 Hidden Outburst (speculative)',
        sourceKey: 'Maffei1',
        energyErg: 1e55,
        lorentzFactor: 3,
        description: 'Hypothetical AGN outburst from nearest giant elliptical (obscured)'
    },
    M87_Monster: {
        label: 'M87* Full Power Jet (educational)',
        sourceKey: 'M87',
        energyErg: 1e58,
        lorentzFactor: 30,
        description: 'M87 at peak power — 1,560× Sgr A* mass. Educational visualization.'
    },
    MW_M31_Merger: {
        label: 'MW-M31 SMBH Merger (~4.5 Gyr future)',
        sourceKey: 'SagittariusA',
        energyErg: 1e62,
        lorentzFactor: 100,
        description: 'Future merger: h ~ 10⁻⁸, ΔL(1 AU) = 1,500 m per GW cycle'
    },
    SgrA_WarpWave_H29: {
        label: 'H29: The Metric-Frame-Dragging Slipstream',
        sourceKey: 'SagittariusA',
        energyErg: 5e54,
        lorentzFactor: 1.0,
        description: 'Solitary Alcubierre-like warp bubble. Pure spatial translation, no kinetic acceleration.'
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CHANNEL DEFINITIONS (8-channel system including H29)
// ═══════════════════════════════════════════════════════════════════════════

export const CHANNEL_DEFS = Object.freeze([
    {
        key: 'gw',
        label: 'Gravitational Wave Packet',
        baseAmplitude: 0.15,
        color: [0.3, 0.5, 1.0],        // blue
        propagation: 'lightspeed',       // v = c exactly
        energyFraction: 0.01,
        description: 'GW travels at c to 15 decimal places (GW170817 constraint)'
    },
    {
        key: 'em',
        label: 'EM Burst (γ → radio)',
        baseAmplitude: 0.4,
        color: [1.0, 1.0, 0.8],        // bright white-yellow
        propagation: 'lightspeed',       // c + ISM dispersion for radio
        energyFraction: 0.10,
        description: 'Gamma-ray to radio, subject to ISM absorption/scattering'
    },
    {
        key: 'neutrino',
        label: 'Neutrino Burst',
        baseAmplitude: 0.05,
        color: [0.5, 0.8, 0.5],        // pale green
        propagation: 'lightspeed',       // v ≈ c (mass delay < 10⁻¹⁵)
        energyFraction: 0.05,
        description: 'Nearly unimpeded, detectable only by km³ detectors'
    },
    {
        key: 'uhecr',
        label: 'UHECR Front (>10¹⁸ eV)',
        baseAmplitude: 0.6,
        color: [1.0, 0.6, 0.2],        // orange
        propagation: 'near_ballistic',   // slight magnetic deflection
        energyFraction: 0.20,
        referenceEnergyEV: 1e18,
        description: '48 J per proton at max energy. Near-ballistic, slight B-field deflection.'
    },
    {
        key: 'cr_tsunami',
        label: 'GeV-TeV Cosmic Ray Tsunami',
        baseAmplitude: 0.8,
        color: [1.0, 0.3, 0.1],        // deep orange-red
        propagation: 'diffusive',        // energy-dependent diffusion
        energyFraction: 0.15,
        referenceEnergyEV: 1e12,         // TeV reference
        description: 'Drawn-out wave lasting 10⁵-10⁶ years. This IS the "tsunami".'
    },
    {
        key: 'alfven',
        label: 'Alfvén/MHD Wave Front',
        baseAmplitude: 0.3,
        color: [0.6, 0.2, 0.8],        // purple
        propagation: 'alfven',           // v_A in ISM
        energyFraction: 0.05,
        description: 'Propagates at Alfvén speed (~30-60 km/s in warm ISM)'
    },
    {
        key: 'blast',
        label: 'Physical Blast Wave',
        baseAmplitude: 1.0,
        color: [1.0, 0.1, 0.1],        // red
        propagation: 'sedov_taylor',     // decelerating blast
        energyFraction: 0.44,
        description: 'BM ultrarelativistic → Sedov-Taylor. The Fermi Bubbles ARE this.'
    }
]);

// ═══════════════════════════════════════════════════════════════════════════
// NANOGRAV GW BACKGROUND
// ═══════════════════════════════════════════════════════════════════════════

export const NANOGRAV = Object.freeze({
    characteristicStrain: 2.4e-15,      // h_c at f_ref
    referenceFreqHz: 3.17e-8,           // 1/yr ≈ 31.7 nHz
    spectralIndex: -2 / 3,                // expected for SMBH binary population
    bayesFactor: 1e14,                  // over noise-only models
    gwSpeedConstraint: 5e-16            // |v_GW/c - 1| upper limit
});

// ═══════════════════════════════════════════════════════════════════════════
// SCHWINGER / QED CONSTANTS (H15: vacuum polarization)
// ═══════════════════════════════════════════════════════════════════════════

export const QED = Object.freeze({
    schwingerBCrit: 4.414e13,           // Gauss
    schwingerECrit: 1.32e18,            // V/m
    fineStructure: 1 / 137.036
});
