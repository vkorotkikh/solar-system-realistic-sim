// @ts-nocheck
/**
 * SMBH Compound Shockwave — Propagation Physics
 *
 * Physics-based functions for multi-messenger propagation through the
 * galactic medium: blast wave dynamics, cosmic ray diffusion,
 * Alfvén wave transport, apparent superluminal projection, and
 * heliosphere response.
 *
 * References:
 *   Blandford & McKee, Phys. Fluids 19, 1130 (1976)
 *   Sedov, Similarity & Dimensional Methods (1959)
 *   Biermann & Sigl, Lect. Notes Phys. 576, 1 (2001)
 *   Bogensberger+ (2024) — Cen A superluminal
 *   arXiv:2509.04387 (2025) — CR-MHD two-moment framework
 */

import {
    C_CM_S, G_CGS, YR_S, MYR_S, EV_ERG, E_CHARGE,
    ISM, HELIO, KPC_CM, AU_CM,
    CHANNEL_DEFS, SOURCE_CATALOG
} from './smbhPhysicsConstants';

const H29_ENERGY_LOG_MIN = 40;
const H29_ENERGY_LOG_MAX = 58;
const H29_DELAY_BY_PROPAGATION = {
    lightspeed: 0.12,
    near_ballistic: 0.35,
    diffusive: 1.0,
    alfven: 0.45,
    sedov_taylor: 0.6
};

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function safeLog10(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.log10(n);
}

function resolveScenarioOptions(input) {
    const key = `${input || ''}`.toLowerCase().trim();
    return {
        isH29: ['h29', 'metric-frame-dragging-slipstream', 'metric_drag', 'h29-metric-slipstream'].includes(key)
    };
}

function estimateH29ShiftStrength(energyErg, source, thetaObsRad) {
    const theta = Number(thetaObsRad);
    const spin = clamp01(
        Number(source?.spinEstimate ?? source?.jetBetaSpine ?? source?.jetBeta ?? 0.15)
    );
    const sourceMassLog = Math.max(1, safeLog10(source?.massMsun ?? source?.massG ?? 1));
    const massDamping = 1 / (1 + 0.22 * sourceMassLog);
    const energyLog = Math.max(0, safeLog10(energyErg) - H29_ENERGY_LOG_MIN);
    const energySpan = Math.max(1, H29_ENERGY_LOG_MAX - H29_ENERGY_LOG_MIN);
    const energyTerm = clamp01(energyLog / energySpan);
    const axisAlignment = clamp01(Math.cos(Number.isFinite(theta) ? theta : 0.5));
    const rawStrength = 0.05 + (1.05 * spin * energyTerm * (0.42 + 0.58 * axisAlignment) * massDamping);
    return clamp01(rawStrength);
}

function buildH29SlipstreamMeta(energyErg, source, thetaObsRad, lightTravelTimeSec) {
    const shiftStrength = estimateH29ShiftStrength(energyErg, source, thetaObsRad);
    const frameSpeedOverC = 1 + 12 * Math.pow(shiftStrength, 1.55);
    const delayCompression = Math.max(0.08, 1 - 0.93 * Math.pow(shiftStrength, 0.92));
    const frontArrivalSec = Math.max(1, lightTravelTimeSec / frameSpeedOverC);
    const frontArrivalYr = frontArrivalSec / YR_S;
    const wakeThickness = 0.6 + 2.2 * shiftStrength;

    return {
        enabled: true,
        mode: 'H29',
        shiftStrength,
        frameSpeedOverC,
        delayCompression,
        frontArrivalSec,
        frontArrivalYr,
        wakeThickness
    };
}

function applyH29SlipstreamCompression(arrivalTimeSec, propagation, h29, lightTravelTimeSec) {
    if (!h29?.enabled) return arrivalTimeSec;
    if (arrivalTimeSec <= 0 || h29.frontArrivalSec <= 0) return arrivalTimeSec;

    const persistence = H29_DELAY_BY_PROPAGATION[propagation] ?? 0.5;
    const baseDelaySec = Math.max(0, arrivalTimeSec - (Number.isFinite(lightTravelTimeSec) ? lightTravelTimeSec : 0));
    return h29.frontArrivalSec + baseDelaySec * h29.delayCompression * persistence;
}

// ═══════════════════════════════════════════════════════════════════════════
// BLAST WAVE DYNAMICS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sedov-Taylor blast wave radius at time t.
 *   r(t) = ξ₀ × (E t² / ρ)^(1/5)
 * ξ₀ ≈ 1.15 for γ = 5/3 (adiabatic index).
 */
export function sedovTaylorRadius(energyErg, densityCgs, timeSec) {
    if (timeSec <= 0 || energyErg <= 0) return 0;
    const xi0 = 1.15;
    return xi0 * Math.pow(energyErg * timeSec * timeSec / densityCgs, 0.2);
}

/**
 * Sedov-Taylor blast wave velocity at time t.
 *   v(t) = (2/5) × r(t) / t
 */
export function sedovTaylorVelocity(energyErg, densityCgs, timeSec) {
    if (timeSec <= 0) return 0;
    return 0.4 * sedovTaylorRadius(energyErg, densityCgs, timeSec) / timeSec;
}

/**
 * Invert Sedov-Taylor to find arrival time at distance d.
 *   r = ξ₀(Et²/ρ)^(1/5) → t = (ρ d⁵ / (ξ₀⁵ E))^(1/2)
 */
export function sedovTaylorArrivalTime(energyErg, densityCgs, distanceCm) {
    if (energyErg <= 0 || distanceCm <= 0) return Infinity;
    const xi0 = 1.15;
    const xi5 = Math.pow(xi0, 5);
    return Math.sqrt(densityCgs * Math.pow(distanceCm, 5) / (xi5 * energyErg));
}

/**
 * Blandford-McKee ultrarelativistic blast Lorentz factor at time t.
 *   Γ(t) = (17E / (1024π ρ c⁵ t³))^(1/8)
 */
export function blandfordMcKeeGamma(energyErg, densityCgs, timeSec) {
    if (timeSec <= 0 || energyErg <= 0) return 1;
    const num = 17 * energyErg;
    const den = 1024 * Math.PI * densityCgs * Math.pow(C_CM_S, 5) * Math.pow(timeSec, 3);
    if (den <= 0) return 1;
    const gamma = Math.pow(num / den, 0.125);
    return Math.max(1, gamma);
}

/**
 * Transition radius where Blandford-McKee (ultrarelativistic) gives way
 * to Sedov-Taylor (non-relativistic).
 *   r_trans ≈ (3E / (4π ρ c²))^(1/3)
 */
export function blastTransitionRadius(energyErg, densityCgs) {
    return Math.pow(3 * energyErg / (4 * Math.PI * densityCgs * C_CM_S * C_CM_S), 1 / 3);
}

/**
 * Shock compression ratio for a strong shock.
 *   ρ₂/ρ₁ = (γ+1)/(γ-1) for ideal gas
 * Returns 4 for γ=5/3, 7 for γ=4/3 (relativistic gas).
 */
export function shockCompressionRatio(adiabaticIndex = 5 / 3) {
    return (adiabaticIndex + 1) / (adiabaticIndex - 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// COSMIC RAY PROPAGATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CR diffusion coefficient (empirical, energy-dependent).
 *   D(E) = D₀ × (R / R₀)^δ
 *
 * R = rigidity ≈ E / (Ze c) for relativistic particles.
 * Fit to AMS-02 / DAMPE / CALET measurements.
 *
 * @param {number} energyEV  - particle energy in eV
 * @param {number} chargeZ   - atomic number (1 for proton, 6 for carbon)
 * @param {number} delta     - diffusion index (0.3–0.6; Kolmogorov: 1/3)
 * @returns {number} diffusion coefficient in cm²/s
 */
export function crDiffusionCoefficient(energyEV, chargeZ = 1, delta = ISM.crDiffIndex) {
    const D0 = 5e28;
    const R0_GV = ISM.crDiffRefRigidityGV;
    const rigidityGV = (energyEV * EV_ERG) / (chargeZ * E_CHARGE * C_CM_S * 1e9);
    const ratio = Math.max(rigidityGV / R0_GV, 1e-10);
    return D0 * Math.pow(ratio, delta);
}

/**
 * CR diffusion time from source to target (3D isotropic).
 *   t_diff = d² / (6D)
 */
export function crDiffusionTime(distanceCm, energyEV, chargeZ = 1) {
    const D = crDiffusionCoefficient(energyEV, chargeZ);
    if (D <= 0) return Infinity;
    return (distanceCm * distanceCm) / (6 * D);
}

/**
 * Spiral arm waveguide correction factor for CR diffusion (H10).
 * CRs propagate preferentially along ordered B-field lines in spiral arms.
 *   D_∥ / D_⊥ ~ 3–10 (energy-dependent)
 *   Effective t_diff(waveguide) ≈ t_diff(isotropic) × correction
 *
 * Correction accounts for longer path along arm vs. shorter diffusion time.
 */
export function spiralArmWaveguideCorrection(energyEV) {
    const pathLengthFactor = 1.2;
    const diffusionBoost = 3 + 7 * Math.min(1, energyEV / 1e15);
    return (pathLengthFactor * pathLengthFactor) / diffusionBoost;
}

/**
 * CR gyroradius in a magnetic field.
 *   r_g = E / (Z e B c)
 */
export function gyroRadius(energyEV, chargeZ, bFieldG) {
    return (energyEV * EV_ERG) / (chargeZ * E_CHARGE * bFieldG * C_CM_S);
}

/**
 * Hillas maximum particle energy from an astrophysical accelerator.
 *   E_max ≈ β_s × Z × (B / 1μG) × (R / 1kpc) × 10¹⁸ eV
 */
export function hillasMaxEnergy(betaShock, chargeZ, bFieldMicroG, radiusKpc) {
    return betaShock * chargeZ * bFieldMicroG * radiusKpc * 1e18;
}

/**
 * CR streaming instability growth rate.
 *   Γ_growth = (n_CR / n_i) × Ω_ci × (v_drift / v_A - 1)
 */
export function crStreamingGrowthRate(nCrOverNi, bFieldG, ionDensityCgs, vDriftCmS, vAlfvenCmS) {
    const omegaCi = E_CHARGE * bFieldG / (1.673e-24 * C_CM_S);
    return nCrOverNi * omegaCi * Math.max(0, vDriftCmS / vAlfvenCmS - 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// ALFVÉN / MHD WAVE PHYSICS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Alfvén speed in magnetized plasma.
 *   v_A = B / √(4π ρ)
 */
export function alfvenSpeed(bFieldG, densityCgs) {
    if (densityCgs <= 0) return 0;
    return bFieldG / Math.sqrt(4 * Math.PI * densityCgs);
}

/**
 * Fast magnetosonic speed (MHD precursor speed).
 *   v_fast = √(v_A² + c_s²)
 */
export function fastMagnetosonicSpeed(bFieldG, densityCgs, temperatureK) {
    const vA = alfvenSpeed(bFieldG, densityCgs);
    const mu = 0.6;
    const cs = Math.sqrt(5 / 3 * 1.381e-16 * temperatureK / (mu * 1.673e-24));
    return Math.sqrt(vA * vA + cs * cs);
}

/**
 * Compound CR-Alfvén wave front speed (H4 from research).
 * When CR pressure dominates magnetic pressure:
 *   v_compound ≈ v_A × √(1 + P_CR / P_B)
 *
 * @param {number} crPressureRatio - P_CR / P_B (normal ~ 1, shockwave ~ 100)
 */
export function compoundCrAlfvenSpeed(bFieldG, densityCgs, crPressureRatio = 1) {
    const vA = alfvenSpeed(bFieldG, densityCgs);
    return vA * Math.sqrt(1 + Math.max(0, crPressureRatio));
}

// ═══════════════════════════════════════════════════════════════════════════
// RELATIVISTIC PROJECTION — APPARENT SUPERLUMINAL MOTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apparent transverse velocity factor (units of c).
 *   β_app = β sin(θ) / (1 - β cos(θ))
 */
export function apparentBeta(beta, thetaRad) {
    const denom = 1 - beta * Math.cos(thetaRad);
    if (denom < 1e-12) return beta;
    return (beta * Math.sin(thetaRad)) / denom;
}

/**
 * Maximum possible apparent speed for a given Lorentz factor.
 *   β_app,max = Γ β ≈ Γ   (at θ_opt = arcsin(1/Γ))
 */
export function maxApparentBeta(lorentzGamma) {
    const beta = Math.sqrt(1 - 1 / (lorentzGamma * lorentzGamma));
    return lorentzGamma * beta;
}

/**
 * Doppler factor for relativistic source.
 *   δ = 1 / [Γ (1 - β cos(θ))]
 */
export function dopplerFactor(beta, thetaRad) {
    const gamma = 1 / Math.sqrt(Math.max(1e-30, 1 - beta * beta));
    return 1 / (gamma * (1 - beta * Math.cos(thetaRad)));
}

/**
 * Observed flux boost from relativistic beaming.
 *   S_obs / S_int = δ^(3+α)
 */
export function fluxBoost(beta, thetaRad, spectralIndex = 0.7) {
    const delta = dopplerFactor(beta, thetaRad);
    return Math.pow(Math.max(delta, 1e-10), 3 + spectralIndex);
}

/**
 * Time compression factor in observer frame.
 *   dt_obs / dt_emit = 1 - β cos(θ)
 */
export function timeCompressionFactor(beta, thetaRad) {
    return 1 - beta * Math.cos(thetaRad);
}

/**
 * Lorentz factor from velocity.
 */
export function lorentzGamma(beta) {
    return 1 / Math.sqrt(Math.max(1e-30, 1 - beta * beta));
}

// ═══════════════════════════════════════════════════════════════════════════
// HELIOSPHERE RESPONSE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Heliopause radius under external pressure multiplication.
 *   R_HP ∝ 1 / √P_ext  (ram pressure balance)
 *
 * @param {number} pressureFactor - P_new / P_nominal (1 = normal, 10 = compressed)
 * @returns {number} heliopause distance in AU
 */
export function heliopauseRadius(pressureFactor) {
    return HELIO.heliopauseAu / Math.sqrt(Math.max(1, pressureFactor));
}

/**
 * Pressure factor from blast wave passage.
 * Uses Rankine-Hugoniot jump conditions for a strong shock.
 *   P₂/P₁ = 2γM²/(γ+1) - (γ-1)/(γ+1)   for Mach number M
 *
 * @param {number} blastVelocityCmS - shock velocity at the heliosphere
 * @returns {number} pressure multiplication factor
 */
export function blastPressureFactor(blastVelocityCmS) {
    const cs = HELIO.soundSpeedHeliosheath * 1e5;
    const mach = blastVelocityCmS / cs;
    if (mach <= 1) return 1;
    const g = 5 / 3;
    return (2 * g * mach * mach / (g + 1)) - (g - 1) / (g + 1);
}

/**
 * Time for heliosphere to reach new equilibrium after pressure change.
 *   t_eq ≈ ΔR / v_inflow
 */
export function heliosphereEquilibriumTime(pressureFactor, inflowVelocityKmS = HELIO.lismVelocityKmS) {
    const deltaR_AU = HELIO.heliopauseAu - heliopauseRadius(pressureFactor);
    const deltaR_km = deltaR_AU * 1.496e8;
    return deltaR_km / inflowVelocityKmS;
}

// ═══════════════════════════════════════════════════════════════════════════
// GW MEMORY EFFECT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GW memory strain — permanent spacetime displacement after burst passage.
 *   Δh_memory ≈ fraction × h_peak
 * Christodoulou (1991), Favata (2010).
 */
export function gwMemoryStrain(hPeak, fraction = 0.1) {
    return fraction * hPeak;
}

/**
 * GW strain at observer distance from burst energy.
 *   h ≈ (4G / c⁴) × E_GW / (d × c)  (order-of-magnitude)
 *
 * More precisely for quadrupole: h ≈ (2G E_GW) / (c⁴ d)
 */
export function gwStrainFromEnergy(energyGW_erg, distanceCm) {
    return (2 * G_CGS * energyGW_erg) / (Math.pow(C_CM_S, 4) * distanceCm);
}

/**
 * Physical displacement at a given distance from GW strain.
 *   ΔL = h × L
 */
export function gwDisplacement(strain, baselineCm) {
    return strain * baselineCm;
}

// ═══════════════════════════════════════════════════════════════════════════
// GERTSENSHTEIN EFFECT (GW ↔ EM conversion)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Gertsenshtein conversion probability (weak-field limit).
 *   P ≈ (π² G / c⁴) × (B × L)² × sin²(θ_B)
 *
 * @param {number} bFieldG - transverse magnetic field (Gauss)
 * @param {number} pathLengthCm - coherent path length (cm)
 * @param {number} sinThetaB - sin of angle between B and propagation (default 1)
 */
export function gertsenshteinProbability(bFieldG, pathLengthCm, sinThetaB = 1) {
    const prefactor = (Math.PI * Math.PI * G_CGS) / Math.pow(C_CM_S, 4);
    return prefactor * Math.pow(bFieldG * pathLengthCm * sinThetaB, 2);
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-MESSENGER TIMELINE COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute physics-based arrival timeline for all channels.
 * Includes optional H29 mode:
 * - H29 compresses standard channel delays through a shared metric-slipstream front.
 * - Adds a synthetic "ADM metric slipstream" channel representing the shift-frame wave.
 *
 * @param {Object} source      - source from SOURCE_CATALOG
 * @param {number} energyErg   - total event energy (erg)
 * @param {number} thetaObsRad - observer angle (radians)
 * @param {Object} [options]   - scenario overrides
 * @returns {Object} timeline with channels, arrival times, and metadata
 */
export function computeMultiMessengerTimeline(source, energyErg, thetaObsRad = 0.5, options = {}) {
    const d = source.distanceCm;
    const tLight = d / C_CM_S;
    const scenario = resolveScenarioOptions(options.scenario || options.mode || options.hypothesis || options.model);
    const h29 = scenario.isH29 ? buildH29SlipstreamMeta(energyErg, source, thetaObsRad, tLight) : null;

    const rhoMedium = source.distanceLy > 100_000
        ? ISM.haloDensityCgs
        : ISM.diskDensityCgs;

    const vA = alfvenSpeed(ISM.bFieldDiskG, rhoMedium);

    const channels = CHANNEL_DEFS.map(def => {
        let arrivalTimeSec;

        switch (def.propagation) {
            case 'lightspeed':
                arrivalTimeSec = tLight;
                if (def.key === 'em') arrivalTimeSec += 100;
                if (def.key === 'neutrino') arrivalTimeSec += 1;
                break;

            case 'near_ballistic': {
                const rg = gyroRadius(def.referenceEnergyEV, 1, ISM.bFieldDiskG);
                const deflectionAngle = d / (rg * 10);
                const pathLengthening = 1 + 0.5 * deflectionAngle * deflectionAngle;
                arrivalTimeSec = tLight * Math.min(pathLengthening, 2);
                break;
            }

            case 'diffusive': {
                arrivalTimeSec = crDiffusionTime(d, def.referenceEnergyEV);
                const waveguide = spiralArmWaveguideCorrection(def.referenceEnergyEV);
                arrivalTimeSec *= waveguide;
                break;
            }

            case 'alfven':
                arrivalTimeSec = d / vA;
                break;

            case 'sedov_taylor':
                arrivalTimeSec = sedovTaylorArrivalTime(
                    energyErg * def.energyFraction,
                    rhoMedium,
                    d
                );
                break;

            default:
                arrivalTimeSec = tLight;
        }

        if (h29) {
            arrivalTimeSec = applyH29SlipstreamCompression(arrivalTimeSec, def.propagation, h29, tLight);
        }

        const arrivalTimeYr = arrivalTimeSec / YR_S;
        const delayAfterGW_yr = (arrivalTimeSec - tLight) / YR_S;

        return {
            ...def,
            arrivalTimeSec,
            arrivalTimeYr,
            delayAfterGW_yr,
            fired: false
        };
    });

    channels.sort((a, b) => a.arrivalTimeSec - b.arrivalTimeSec);

    if (h29) {
        channels.unshift({
            key: 'metric_slipstream',
            label: 'ADM Metric Slipstream Front',
            baseAmplitude: 1.2,
            color: [0.1, 1.0, 1.0],
            propagation: 'h29_metric',
            energyFraction: 0.001,
            description: 'Coordinated frame-dragging front generated by transient shift-vector collapse.',
            arrivalTimeSec: h29.frontArrivalSec,
            arrivalTimeYr: h29.frontArrivalYr,
            delayAfterGW_yr: (h29.frontArrivalSec - tLight) / YR_S,
            fired: false
        });
    }

    const jetBeta = source.jetBetaSpine || source.jetBeta || 0.9;
    const betaApp = apparentBeta(jetBeta, thetaObsRad);
    const doppler = dopplerFactor(jetBeta, thetaObsRad);
    const boost = fluxBoost(jetBeta, thetaObsRad);
    const tCompress = timeCompressionFactor(jetBeta, thetaObsRad);

    const gwEnergyFraction = 0.01;
    const hGW = gwStrainFromEnergy(energyErg * gwEnergyFraction, d);
    const hMemory = gwMemoryStrain(hGW);

    const blastArrivalSec = sedovTaylorArrivalTime(energyErg * 0.44, rhoMedium, d);
    const blastVelocity = sedovTaylorVelocity(energyErg * 0.44, rhoMedium, blastArrivalSec);
    const pFactor = blastPressureFactor(blastVelocity);

    return {
        source,
        energyErg,
        thetaObsRad,
        channels,
        lightTravelTimeSec: tLight,
        lightTravelTimeYr: tLight / YR_S,

        relativistic: {
            jetBeta,
            apparentBeta: betaApp,
            dopplerFactor: doppler,
            fluxBoost: boost,
            timeCompressionFactor: tCompress,
            lorentzGamma: lorentzGamma(jetBeta)
        },

        gwPhysics: {
            strainAtSun: hGW,
            memoryStrain: hMemory,
            displacementAtAU_cm: gwDisplacement(hGW, AU_CM),
            memoryDisplacementAtAU_cm: gwDisplacement(hMemory, AU_CM)
        },

        heliosphereResponse: {
            blastVelocityCmS: blastVelocity,
            pressureFactor: pFactor,
            compressedHeliopauseAU: heliopauseRadius(pFactor),
            equilibriumTimeSec: heliosphereEquilibriumTime(pFactor) * 1e5,
            compressionRatio: shockCompressionRatio()
        },

        blastWave: {
            transitionRadiusCm: blastTransitionRadius(energyErg * 0.44, rhoMedium),
            transitionRadiusKpc: blastTransitionRadius(energyErg * 0.44, rhoMedium) / KPC_CM,
            arrivalVelocityCmS: blastVelocity,
            arrivalVelocityKmS: blastVelocity / 1e5,
            arrivalMach: blastVelocity / (HELIO.soundSpeedHeliosheath * 1e5)
        },

        gertsenshtein: {
            ismConversionProb: gertsenshteinProbability(ISM.bFieldDiskG, d),
            nearSourceProb: gertsenshteinProbability(
                source.bFieldHorizonG || 50,
                (source.rSchwarzschildCm || 1e10) * 10
            )
        },

        h29: h29
    };
}

/**
 * Convert physical arrival time to display seconds using logarithmic compression.
 * Preserves ordering while making million-year offsets visible in seconds.
 *
 * @param {number} years - arrival time in years
 * @param {number} scaleSec - display seconds for reference (default 2.2)
 * @param {number} refYears - reference year value for log scale (default 1)
 */
export function yearsToDisplaySeconds(years, scaleSec = 2.2, refYears = 1.0) {
    const y = Math.max(0, years);
    return Math.max(0.2, scaleSec * Math.log10(1 + y / Math.max(1e-6, refYears)));
}

/**
 * Generate a stochastic flare sequence (H6: continuous flaring).
 * dN/dE ∝ E^(-α) with α ≈ 1.7
 *
 * @param {number} durationSec - simulation duration in real seconds
 * @param {number} ratePerSec  - average major flare rate in display seconds
 * @param {number} alpha       - power-law index (default 1.7)
 * @param {number} eMinErg     - minimum flare energy
 * @param {number} eMaxErg     - maximum flare energy
 * @returns {Array<{time: number, energy: number}>}
 */
export function generateStochasticFlares(durationSec, ratePerSec = 0.3, alpha = 1.7, eMinErg = 1e37, eMaxErg = 1e43) {
    const flares = [];
    let t = 0;
    while (t < durationSec) {
        const dt = -Math.log(Math.random()) / ratePerSec;
        t += dt;
        if (t >= durationSec) break;

        const u = Math.random();
        const oneMinusAlpha = 1 - alpha;
        const energy = Math.pow(
            Math.pow(eMinErg, oneMinusAlpha) +
            u * (Math.pow(eMaxErg, oneMinusAlpha) - Math.pow(eMinErg, oneMinusAlpha)),
            1 / oneMinusAlpha
        );

        flares.push({ time: t, energy });
    }
    return flares;
}
