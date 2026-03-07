import { MU_SUN_AU3_DAY2 } from '../../constants';

/**
 * Asteroid Taxonomies with their approximate albedos and colors.
 * C-Type: Carbonaceous (Very dark, outer belt)
 * S-Type: Silicaceous (Stony, brighter, inner belt)
 * M-Type: Metallic (Mid belt, reflective)
 */
export const TAXONOMIES = {
    C: { type: 'C', colorRange: ['#3b3b3b', '#4c4a48', '#5c5b55'], metalness: 0.1, roughness: 0.9 },
    S: { type: 'S', colorRange: ['#a69886', '#b5a996', '#8f8171'], metalness: 0.2, roughness: 0.8 },
    M: { type: 'M', colorRange: ['#8f8681', '#9e9690', '#7a726d'], metalness: 0.7, roughness: 0.5 },
    D: { type: 'D', colorRange: ['#4a3c31', '#594a3d', '#3b2f26'], metalness: 0.05, roughness: 0.95 } // Jupiter Trojans
};

/**
 * Determines taxonomic class based on semi-major axis (aAu).
 * Rough distribution:
 * Inner belt (<2.5 AU): predominantly S-type
 * Mid belt (2.5 - 2.82 AU): Mix of S, C, M
 * Outer belt (>2.82 AU): predominantly C-type
 * Trojans (~5.2 AU): D-type
 */
export function sampleTaxonomy(aAu) {
    const r = Math.random();
    if (aAu > 5.0) return TAXONOMIES.D;

    if (aAu < 2.5) {
        // Inner belt
        if (r < 0.75) return TAXONOMIES.S;
        if (r < 0.85) return TAXONOMIES.M;
        return TAXONOMIES.C;
    } else if (aAu >= 2.5 && aAu < 2.82) {
        // Mid belt
        if (r < 0.40) return TAXONOMIES.S;
        if (r < 0.50) return TAXONOMIES.M;
        return TAXONOMIES.C;
    } else {
        // Outer belt
        if (r < 0.85) return TAXONOMIES.C;
        if (r < 0.90) return TAXONOMIES.M;
        return TAXONOMIES.S;
    }
}

/**
 * Power-Law size distribution specifically tailored for asteroids.
 * Generates sizes biased heavily towards smaller objects.
 * Uses inverse transform sampling.
 */
export function samplePowerLawSize(minRadius, maxRadius, q = 2.5) {
    // P(r) = C * r^(-q)
    const u = Math.random();
    // Integral of r^-q is [r^(1-q)] / (1-q)
    const exponent = 1.0 - q;
    const minVal = Math.pow(minRadius, exponent);
    const maxVal = Math.pow(maxRadius, exponent);
    const sampledVal = minVal + u * (maxVal - minVal);
    return Math.pow(sampledVal, 1.0 / exponent);
}

// Box-Muller transform for normal distribution
function randomGaussian(mean = 0, stdDev = 1) {
    const u = 1 - Math.random();
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdDev + mean;
}

// Major Asteroid Families in Proper Elements (a, e, sin(i))
const FAMILIES = [
    { name: 'Flora', weight: 0.15, a: 2.20, aSigma: 0.05, e: 0.14, eSigma: 0.02, i: 5.0, iSigma: 1.0 },
    { name: 'Vesta', weight: 0.10, a: 2.36, aSigma: 0.04, e: 0.09, eSigma: 0.01, i: 6.0, iSigma: 0.5 },
    { name: 'Eunomia', weight: 0.15, a: 2.64, aSigma: 0.06, e: 0.15, eSigma: 0.03, i: 12.0, iSigma: 1.5 },
    { name: 'Koronis', weight: 0.10, a: 2.87, aSigma: 0.04, e: 0.05, eSigma: 0.01, i: 2.0, iSigma: 0.5 },
    { name: 'Eos', weight: 0.20, a: 3.01, aSigma: 0.05, e: 0.07, eSigma: 0.02, i: 10.0, iSigma: 0.8 },
    { name: 'Themis', weight: 0.15, a: 3.13, aSigma: 0.06, e: 0.15, eSigma: 0.03, i: 1.5, iSigma: 0.4 },
    { name: 'Background', weight: 0.15 } // Fallback for isotropic main belt
];

const KIRKWOOD_GAPS = [
    { center: 2.06, halfWidth: 0.02 }, // 4:1
    { center: 2.50, halfWidth: 0.03 }, // 3:1
    { center: 2.82, halfWidth: 0.02 }, // 5:2
    { center: 2.95, halfWidth: 0.015 },// 7:3
    { center: 3.27, halfWidth: 0.03 }  // 2:1
];

function isInsideKirkwoodGap(a) {
    for (const gap of KIRKWOOD_GAPS) {
        if (Math.abs(a - gap.center) < gap.halfWidth) return true;
    }
    return false;
}

/**
 * Generates an asteroid Keplerian element set based on probabilistic models.
 * @param {string} population - 'main-belt', 'trojan-l4', 'trojan-l5', 'hilda', 'nea'
 */
export function generateAsteroidElement(population = 'main-belt') {
    let a, e, i, ascendingNodeDeg, argPeriapsisDeg, meanAnomalyDeg;

    ascendingNodeDeg = Math.random() * 360;
    argPeriapsisDeg = Math.random() * 360;

    if (population === 'main-belt') {
        // Try to sample a valid element that avoids Kirkwood gaps
        for (let attempts = 0; attempts < 50; attempts++) {
            let r = Math.random();
            let selectedFamily = FAMILIES[FAMILIES.length - 1]; // Background
            for (const fam of FAMILIES) {
                r -= fam.weight;
                if (r <= 0) {
                    selectedFamily = fam;
                    break;
                }
            }

            if (selectedFamily.name === 'Background') {
                a = 2.1 + Math.random() * 1.2;
                e = Math.abs(randomGaussian(0.12, 0.08));
                i = Math.abs(randomGaussian(8.0, 6.0));
            } else {
                a = randomGaussian(selectedFamily.a, selectedFamily.aSigma);
                e = Math.abs(randomGaussian(selectedFamily.e, selectedFamily.eSigma));
                i = Math.abs(randomGaussian(selectedFamily.i, selectedFamily.iSigma));
            }

            if (!isInsideKirkwoodGap(a) && a > 2.0 && a < 3.5 && e < 0.35) {
                break;
            }
        }
        meanAnomalyDeg = Math.random() * 360;
    }
    else if (population === 'hilda') {
        // 3:2 resonance with Jupiter (~3.96 AU)
        a = randomGaussian(3.96, 0.02);
        e = randomGaussian(0.15, 0.05); // Noticeable eccentricity
        i = Math.abs(randomGaussian(8.0, 4.0));
        // Hildas avoid Jupiter at perihelion through a specific resonance angle
        meanAnomalyDeg = Math.random() * 360;
    }
    else if (population.startsWith('trojan')) {
        // Jupiter Trojans (1:1 resonance, ~5.2 AU)
        a = randomGaussian(5.20, 0.08); // Spread around Jupiter's orbit
        e = Math.abs(randomGaussian(0.08, 0.04));
        i = Math.abs(randomGaussian(15.0, 8.0)); // Trojans can have quite high inclination

        // Jupiter's mean anomaly is approximately the anchor.
        // L4 leads by 60 deg, L5 trails by 60 deg. For a static generation, we just offset.
        const jupiterApproxM = 20.0; // Very rough snapshot approximation
        if (population === 'trojan-l4') {
            meanAnomalyDeg = jupiterApproxM + 60 + randomGaussian(0, 15);
        } else {
            meanAnomalyDeg = jupiterApproxM - 60 + randomGaussian(0, 15);
        }
        // Normalize
        meanAnomalyDeg = (meanAnomalyDeg + 360) % 360;
    }
    else if (population === 'nea') {
        // Near Earth Asteroids (Amor, Apollo, Aten, Atira)
        a = randomGaussian(1.5, 0.5); // Can be < 1.0 (Aten/Atira) or > 1.0 (Apollo/Amor)
        if (a < 0.6) a = 0.6; // Keep away from Sun surface
        e = Math.abs(randomGaussian(0.3, 0.2));
        if (e >= 1.0) e = 0.9;
        i = Math.abs(randomGaussian(10.0, 10.0));
        meanAnomalyDeg = Math.random() * 360;
    }

    const periodDays = 2 * Math.PI * Math.sqrt((a * a * a) / MU_SUN_AU3_DAY2);

    return {
        aAu: a,
        e,
        iDeg: i,
        ascendingNodeDeg,
        argPeriapsisDeg,
        meanAnomalyDeg,
        periodDays
    };
}
