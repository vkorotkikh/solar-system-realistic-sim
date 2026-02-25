// @ts-nocheck
/**
 * Solar Wind Physics Enhancement — Phase 11
 * 
 * Provides physically parameterized solar wind speed and density for the
 * existing Parker spiral visualization.
 * 
 * Bimodal structure:
 * - Slow wind: ~350-450 km/s, denser, from near streamer belt / equatorial
 * - Fast wind: ~650-800 km/s, from coronal holes (polar regions at solar min)
 * 
 * Parker spiral angle: ψ = atan(Ω × r × sinθ / v_sw)
 * At 1 AU with v_sw = 400 km/s: ψ ≈ 45° (garden hose angle)
 * At 1 AU with v_sw = 800 km/s: ψ ≈ 24°
 * 
 * IMF magnitude:
 * B_r = B₀ × (r₀/r)²
 * B_φ = -B_r × (Ω × r × sinθ) / v_sw
 * B₀ ≈ 5 nT at r₀ = 1 AU
 */

// Solar rotation rate (sidereal)
const OMEGA_SUN = 2.87e-6; // rad/s (25.38 day period)
const AU_M = 1.496e11;

/**
 * Compute the Parker spiral angle at a given distance and latitude.
 * 
 * @param {number} r_au - heliocentric distance in AU
 * @param {number} latRad - heliographic latitude in radians
 * @param {number} v_sw_kms - solar wind speed in km/s
 * @returns {number} spiral angle in radians (0 = radial, π/2 = azimuthal)
 */
export function parkerSpiralAngle(r_au, latRad, v_sw_kms) {
    const r_m = r_au * AU_M;
    const v_sw = v_sw_kms * 1000; // m/s
    const sinTheta = Math.cos(latRad); // colatitude = π/2 - lat
    return Math.atan(OMEGA_SUN * r_m * sinTheta / v_sw);
}

/**
 * Compute the solar wind speed at a given latitude and activity level.
 * 
 * At solar minimum: clear bimodal — fast wind at poles, slow at equator
 * At solar maximum: mixed speeds at all latitudes
 * 
 * Based on Ulysses mission observations (McComas et al. 2003)
 * 
 * @param {number} latRad - heliographic latitude in radians
 * @param {number} activity - solar activity level [0, 1]
 * @returns {number} wind speed in km/s
 */
export function solarWindSpeed(latRad, activity) {
    const absLat = Math.abs(latRad);

    // Slow wind baseline
    const vSlow = 350 + Math.random() * 100; // 350-450 km/s

    // Fast wind baseline
    const vFast = 650 + Math.random() * 150; // 650-800 km/s

    // At solar minimum: fast wind above ~30° latitude
    // At solar maximum: mixed everywhere
    const transitionLat = 0.35 + activity * 0.5; // 20° at min, 49° at max
    const latMix = Math.min(1, Math.max(0, (absLat - transitionLat + 0.1) / 0.2));

    // Activity mixing: at high activity, fast wind regions shrink
    const fastFraction = latMix * (1 - activity * 0.7);

    return vSlow * (1 - fastFraction) + vFast * fastFraction;
}

/**
 * Compute the interplanetary magnetic field (IMF) components.
 * 
 * Parker model:
 * B_r = B₀(r₀/r)²  (radial component, falls as 1/r²)
 * B_φ = -B_r × Ω × r × sinθ / v_sw  (azimuthal, Parker spiral)
 * 
 * @param {number} r_au - distance in AU
 * @param {number} latRad - latitude in radians
 * @param {number} v_sw_kms - wind speed in km/s
 * @returns {{ Br: number, Bphi: number, Bmag: number }} IMF in nT
 */
export function interplanetaryMagneticField(r_au, latRad, v_sw_kms) {
    const B0 = 5.0; // nT at 1 AU (typical)
    const Br = B0 / (r_au * r_au);

    const r_m = r_au * AU_M;
    const v_sw = v_sw_kms * 1000;
    const sinTheta = Math.cos(latRad); // colatitude

    const Bphi = -Br * OMEGA_SUN * r_m * sinTheta / v_sw;
    const Bmag = Math.sqrt(Br * Br + Bphi * Bphi);

    return { Br, Bphi, Bmag };
}

/**
 * Generate solar wind particle parameters for visualization.
 * Returns an array of particle configs keyed by latitude band.
 * 
 * @param {number} activity - solar activity [0, 1]
 * @param {number} numBands - number of latitude bands
 * @returns {Array} Array of { latRad, speed, density, spiralAngle }
 */
export function generateWindProfile(activity, numBands = 12) {
    const profile = [];

    for (let i = 0; i < numBands; i++) {
        const latRad = (i / (numBands - 1) - 0.5) * Math.PI; // -90° to +90°
        const speed = solarWindSpeed(latRad, activity);

        // Density inversely proportional to speed (mass flux conservation)
        // n ∝ 1/v at constant mass flux
        const density = 400 / speed; // normalized so slow wind ≈ 1.0

        const spiralAngle = parkerSpiralAngle(1.0, latRad, speed);

        profile.push({
            latRad,
            speed,           // km/s
            density,         // relative (1.0 = slow wind at 1 AU)
            spiralAngle      // radians
        });
    }

    return profile;
}

/**
 * Compute solar wind dynamic pressure (for magnetosphere interactions).
 * 
 * P_dyn = 0.5 × ρ × v²
 * At 1 AU: ~2 nPa (typical), ~50 nPa (CME impact)
 * 
 * @param {number} n_cm3 - proton density [cm⁻³] (typical: 5-10)
 * @param {number} v_kms - wind speed [km/s]
 * @returns {number} dynamic pressure in nPa
 */
export function windDynamicPressure(n_cm3, v_kms) {
    const m_proton = 1.672e-27; // kg
    const n_m3 = n_cm3 * 1e6;
    const v_ms = v_kms * 1000;
    return 0.5 * m_proton * n_m3 * v_ms * v_ms * 1e9; // Pa → nPa
}
