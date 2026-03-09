import { J2000_JD } from '../constants';
import { solveKeplerFast } from './orbitMath';
import type { KeplerOrbit } from './orbitMath';

// ── Taxonomy ─────────────────────────────────────────────────────────────────
// Kuiper-belt dynamical classes following Gladman+ 2008 classification.

export enum KBOClass {
  Classical = 0, // "Cubewanos" — low-e, 42–48 AU
  Resonant = 1, // Plutinos (3:2), twotinos (2:1), etc.
  Scattered = 2, // High-e, perihelia near Neptune
  Detached = 3, // High-a, perihelia beyond Neptune influence (Sedna-like)
}

// Surface color groups from Peixinho+ 2015 taxonomy.
export enum KBOColor {
  Neutral = 0, // Grey-blue, icy
  Red = 1, // Ultra-red matter (tholins, organics)
  Inter = 2, // Intermediate
}

export interface BinaryCompanionDef {
  /** Companion diameter [km] — typically 0.3–1.0× primary */
  diameterKm: number;
  /** Mutual orbit semi-major axis [km] — typically 1,000–200,000 km */
  separationKm: number;
  /** Mutual orbit period [days] — from Kepler's 3rd law */
  periodDays: number;
  /** Mean anomaly at epoch [deg] */
  meanAnomalyDeg: number;
  /** Mutual orbit eccentricity — typically ~0 to 0.1 for CKBOs */
  eccentricity: number;
  /** Mutual orbit inclination [deg] relative to heliocentric orbital plane */
  inclinationDeg: number;
  /** Packed sRGB 0xRRGGBB */
  color: number;
  /** Albedo */
  albedo: number;
  /** Irregularity for companion mesh */
  irregularity: number;
}

export interface KBODef {
  orbit: KeplerOrbit;
  dynClass: KBOClass;
  surfaceColor: KBOColor;
  diameterKm: number;
  albedo: number;
  /** packed sRGB 0xRRGGBB */
  color: number;
  irregularity: number;
  /** Binary companion — null/undefined = single object */
  binary?: BinaryCompanionDef | null;
}

// ── Named KBOs ───────────────────────────────────────────────────────────────
// Dwarf planets and notable trans-Neptunian objects.

export const NAMED_KBOS: readonly KBODef[] = [
  { orbit: { epochJd: J2000_JD, aAu: 67.864, e: 0.4366, iDeg: 44.04, ascendingNodeDeg: 35.951, argPeriapsisDeg: 151.639, meanAnomalyDeg: 205.989, periodDays: 203_830 }, dynClass: KBOClass.Scattered, surfaceColor: KBOColor.Neutral, diameterKm: 2326, albedo: 0.96, color: 0xc7c0b7, irregularity: 0.02 },
  { orbit: { epochJd: J2000_JD, aAu: 45.43, e: 0.1613, iDeg: 28.984, ascendingNodeDeg: 79.382, argPeriapsisDeg: 297.24, meanAnomalyDeg: 153.27, periodDays: 111_845 }, dynClass: KBOClass.Classical, surfaceColor: KBOColor.Red, diameterKm: 1430, albedo: 0.81, color: 0xc9b8a0, irregularity: 0.03 },
  { orbit: { epochJd: J2000_JD, aAu: 43.218, e: 0.1951, iDeg: 28.213, ascendingNodeDeg: 122.167, argPeriapsisDeg: 239.041, meanAnomalyDeg: 205.22, periodDays: 103_774 }, dynClass: KBOClass.Classical, surfaceColor: KBOColor.Neutral, diameterKm: 1632, albedo: 0.51, color: 0xd5cdc3, irregularity: 0.08 },
  { orbit: { epochJd: J2000_JD, aAu: 506.8, e: 0.8496, iDeg: 11.929, ascendingNodeDeg: 144.514, argPeriapsisDeg: 311.122, meanAnomalyDeg: 358.117, periodDays: 4_163_000 }, dynClass: KBOClass.Detached, surfaceColor: KBOColor.Red, diameterKm: 996, albedo: 0.32, color: 0xd4735e, irregularity: 0.05 },
  { orbit: { epochJd: J2000_JD, aAu: 43.694, e: 0.0389, iDeg: 7.985, ascendingNodeDeg: 188.927, argPeriapsisDeg: 147.48, meanAnomalyDeg: 282.48, periodDays: 105_480 }, dynClass: KBOClass.Classical, surfaceColor: KBOColor.Red, diameterKm: 1110, albedo: 0.11, color: 0xb8a090, irregularity: 0.04 },
  { orbit: { epochJd: J2000_JD, aAu: 39.419, e: 0.2271, iDeg: 20.573, ascendingNodeDeg: 268.799, argPeriapsisDeg: 73.1, meanAnomalyDeg: 181.735, periodDays: 90_470 }, dynClass: KBOClass.Resonant, surfaceColor: KBOColor.Neutral, diameterKm: 916, albedo: 0.23, color: 0xa0a0a0, irregularity: 0.04 },
  { orbit: { epochJd: J2000_JD, aAu: 67.485, e: 0.501, iDeg: 30.739, ascendingNodeDeg: 336.859, argPeriapsisDeg: 207.667, meanAnomalyDeg: 107.46, periodDays: 202_370 }, dynClass: KBOClass.Scattered, surfaceColor: KBOColor.Red, diameterKm: 1230, albedo: 0.14, color: 0xc47060, irregularity: 0.03 },
  { orbit: { epochJd: J2000_JD, aAu: 43.178, e: 0.0525, iDeg: 17.138, ascendingNodeDeg: 97.210, argPeriapsisDeg: 273.221, meanAnomalyDeg: 115.029, periodDays: 103_632 }, dynClass: KBOClass.Classical, surfaceColor: KBOColor.Red, diameterKm: 900, albedo: 0.09, color: 0xb9a7a0, irregularity: 0.06 },
];

// ── Distribution parameters ──────────────────────────────────────────────────

const CLASSICAL_INNER_AU = 42.0;
const CLASSICAL_OUTER_AU = 48.0;
const PLUTINO_RESONANCE_AU = 39.4;
const TWOTINO_RESONANCE_AU = 47.8;

// ── Binary KBO parameters (Noll+ 2008, Fraser+ 2017, Parker+ 2011) ──────────
// Binary fraction by dynamical class:
//   Cold classical: ~30%, Hot classical: ~10%, Resonant/Scattered/Detached: ~5%

const BINARY_FRACTION: Record<KBOClass, number> = {
  [KBOClass.Classical]: 0.22, // weighted avg cold (30%) + hot (10%)
  [KBOClass.Resonant]: 0.05,
  [KBOClass.Scattered]: 0.05,
  [KBOClass.Detached]: 0.05,
};

// Gravitational constant × density for mutual Keplerian period estimation
// Assume ρ = 1000 kg/m³ (icy body), G = 6.674e-11 m³/(kg·s²)
const KBO_DENSITY_KG_M3 = 1000;
const G_CONST = 6.674e-11;

/**
 * Generate a binary companion for a KBO.
 *
 * Size ratio: log-normal centered near 0.8 (equal-mass pairs are common
 * among cold classicals; Noll+ 2008).
 * Separation: log-uniform 1,000–200,000 km (Parker+ 2011).
 * Mutual orbit period: Kepler's 3rd law from separation + combined mass.
 */
function generateBinaryCompanion(
  primaryDiameterKm: number,
  primarySurfaceColor: KBOColor,
  rand: () => number
): BinaryCompanionDef {
  // Size ratio: log-normal centered at 0.8, σ≈0.3, clamped [0.3, 1.0]
  const rawRatio = 0.8 * Math.exp((rand() - 0.5) * 0.6);
  const sizeRatio = Math.max(0.3, Math.min(1.0, rawRatio));
  const companionDiameterKm = primaryDiameterKm * sizeRatio;

  // Separation: log-uniform 1,000–200,000 km
  const logSepMin = Math.log(1_000);
  const logSepMax = Math.log(200_000);
  const separationKm = Math.exp(logSepMin + rand() * (logSepMax - logSepMin));

  // Mutual orbit period via Kepler's 3rd law
  // mass = (4/3)π(r)³ρ for each body
  const rPrimaryM = (primaryDiameterKm * 1000) / 2;
  const rCompanionM = (companionDiameterKm * 1000) / 2;
  const massPrimary = (4 / 3) * Math.PI * rPrimaryM ** 3 * KBO_DENSITY_KG_M3;
  const massCompanion = (4 / 3) * Math.PI * rCompanionM ** 3 * KBO_DENSITY_KG_M3;
  const totalMass = massPrimary + massCompanion;
  const separationM = separationKm * 1000;
  const periodSec = 2 * Math.PI * Math.sqrt(separationM ** 3 / (G_CONST * totalMass));
  const periodDays = periodSec / 86400;

  // Eccentricity: tidally damped, low
  const eccentricity = rand() * 0.1;

  // Inclination: typically near-coplanar with heliocentric orbit, low scatter
  const inclinationDeg = rand() * 30;

  // Companion color: similar to primary but slightly varied
  const companionColor = packedColorForKBO(primarySurfaceColor, rand);

  // Albedo: close to primary
  const albedo = primarySurfaceColor === KBOColor.Red
    ? 0.04 + rand() * 0.08
    : primarySurfaceColor === KBOColor.Inter
      ? 0.06 + rand() * 0.10
      : 0.08 + rand() * 0.15;

  // Irregularity: smaller bodies are more irregular
  const irregularity = companionDiameterKm > 200
    ? 0.04 + rand() * 0.08
    : companionDiameterKm > 50
      ? 0.08 + rand() * 0.15
      : 0.12 + rand() * 0.25;

  return {
    diameterKm: companionDiameterKm,
    separationKm,
    periodDays,
    meanAnomalyDeg: rand() * 360,
    eccentricity,
    inclinationDeg,
    color: companionColor,
    albedo,
    irregularity,
  };
}

// ── Seeded PRNG (Mulberry32) ────────────────────────────────────────────────

function mulberry32(seed: number) {
  let s = seed | 0;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Procedural generation ────────────────────────────────────────────────────

function sampleDynClass(rand: () => number): KBOClass {
  const r = rand();
  if (r < 0.35) return KBOClass.Classical;
  if (r < 0.58) return KBOClass.Resonant;
  if (r < 0.82) return KBOClass.Scattered;
  return KBOClass.Detached;
}

function sampleOrbitForClass(
  dynClass: KBOClass,
  rand: () => number
): { aAu: number; e: number; iDeg: number } {
  switch (dynClass) {
    case KBOClass.Classical: {
      const cold = rand() < 0.6;
      const aAu = CLASSICAL_INNER_AU + rand() * (CLASSICAL_OUTER_AU - CLASSICAL_INNER_AU);
      const e = cold ? rand() * 0.08 : rand() * 0.15;
      const iDeg = cold ? rand() * 5 : 5 + rand() * 25;
      return { aAu, e, iDeg };
    }
    case KBOClass.Resonant: {
      const resonance = rand() < 0.7 ? PLUTINO_RESONANCE_AU : TWOTINO_RESONANCE_AU;
      const aAu = resonance + (rand() - 0.5) * 1.0;
      const e = 0.05 + rand() * 0.25;
      const iDeg = rand() * 30;
      return { aAu, e, iDeg };
    }
    case KBOClass.Scattered: {
      const aAu = 35 + rand() * 80;
      const e = 0.2 + rand() * 0.5;
      const iDeg = rand() * 40;
      return { aAu, e, iDeg };
    }
    case KBOClass.Detached: {
      const aAu = 50 + rand() * 400;
      const e = 0.3 + rand() * 0.55;
      const iDeg = 5 + rand() * 25;
      return { aAu, e, iDeg };
    }
  }
}

function surfaceColorFromClass(dynClass: KBOClass, rand: () => number): KBOColor {
  // Cold classicals are almost always ultra-red; others mixed
  if (dynClass === KBOClass.Classical && rand() < 0.75) return KBOColor.Red;
  const r = rand();
  if (r < 0.35) return KBOColor.Red;
  if (r < 0.65) return KBOColor.Inter;
  return KBOColor.Neutral;
}

function packedColorForKBO(sc: KBOColor, rand: () => number): number {
  const v = (lo: number, hi: number) => Math.floor(lo + (hi - lo) * rand());
  switch (sc) {
    case KBOColor.Red: return (v(170, 210) << 16) | (v(100, 140) << 8) | v(70, 110);
    case KBOColor.Inter: return (v(150, 190) << 16) | (v(140, 175) << 8) | v(130, 165);
    case KBOColor.Neutral: return (v(140, 180) << 16) | (v(145, 185) << 8) | v(150, 195);
  }
}

function sampleDiameterKm(rand: () => number): number {
  const u = rand();
  const dMin = 20;
  const dMax = 800;
  const alpha = 3.5; // steeper than main belt — Fuentes & Holman 2008
  return dMin * Math.pow(1 - u * (1 - Math.pow(dMin / dMax, alpha - 1)), -1 / (alpha - 1));
}

export interface KuiperBeltPopulation {
  count: number;
  binaryCount: number;
  kbos: KBODef[];
}

export function generateKuiperBelt(
  count = 5_000,
  seed = 137
): KuiperBeltPopulation {
  const rand = mulberry32(seed);
  const kbos: KBODef[] = [...NAMED_KBOS];

  const remaining = Math.max(0, count - kbos.length);
  for (let i = 0; i < remaining; i++) {
    const dynClass = sampleDynClass(rand);
    const { aAu, e, iDeg } = sampleOrbitForClass(dynClass, rand);
    const periodDays = 365.25 * Math.pow(aAu, 1.5);

    const sc = surfaceColorFromClass(dynClass, rand);
    const diameterKm = sampleDiameterKm(rand);
    const irregularity = diameterKm > 500 ? 0.02 + rand() * 0.06
      : diameterKm > 100 ? 0.06 + rand() * 0.15
        : 0.10 + rand() * 0.25;

    // Binary assignment based on dynamical class fraction (Noll+ 2008)
    const binaryFrac = BINARY_FRACTION[dynClass];
    const binary = (rand() < binaryFrac && diameterKm > 40)
      ? generateBinaryCompanion(diameterKm, sc, rand)
      : null;

    kbos.push({
      orbit: {
        epochJd: J2000_JD,
        aAu,
        e,
        iDeg,
        ascendingNodeDeg: rand() * 360,
        argPeriapsisDeg: rand() * 360,
        meanAnomalyDeg: rand() * 360,
        periodDays,
      },
      dynClass,
      surfaceColor: sc,
      diameterKm,
      albedo: sc === KBOColor.Red ? 0.04 + rand() * 0.08
        : sc === KBOColor.Inter ? 0.06 + rand() * 0.10
          : 0.08 + rand() * 0.15,
      color: packedColorForKBO(sc, rand),
      irregularity,
      binary,
    });
  }

  const binaryCount = kbos.filter(k => k.binary != null).length;
  return { count: kbos.length, binaryCount, kbos };
}

// ── Fast batch orbit propagation ─────────────────────────────────────────────

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

export function propagateKBOPositions(
  kbos: readonly KBODef[],
  julianDate: number,
  out: Float32Array
): void {
  const n = kbos.length;
  for (let i = 0; i < n; i++) {
    const orb = kbos[i].orbit;
    const dt = julianDate - orb.epochJd;
    const meanMotion = TWO_PI / orb.periodDays;
    const M = ((orb.meanAnomalyDeg! * DEG) + meanMotion * dt) % TWO_PI;
    const ecc = orb.e ?? 0;
    const E = solveKeplerFast(M < 0 ? M + TWO_PI : M, ecc);

    const cosE = Math.cos(E);
    const sinE = Math.sin(E);
    const sqrtE = Math.sqrt(1 - ecc * ecc);
    const trueX = orb.aAu * (cosE - ecc);
    const trueY = orb.aAu * sqrtE * sinE;

    const iRad = (orb.iDeg ?? 0) * DEG;
    const omegaRad = (orb.ascendingNodeDeg ?? 0) * DEG;
    const wRad = (orb.argPeriapsisDeg ?? 0) * DEG;
    const cosW = Math.cos(wRad);
    const sinW = Math.sin(wRad);
    const cosO = Math.cos(omegaRad);
    const sinO = Math.sin(omegaRad);
    const cosI = Math.cos(iRad);
    const sinI = Math.sin(iRad);

    const px = trueX * cosW - trueY * sinW;
    const py = trueX * sinW + trueY * cosW;

    const off = i * 3;
    out[off] = cosO * px - sinO * cosI * py;
    out[off + 1] = sinO * px + cosO * cosI * py;
    out[off + 2] = sinI * py;
  }
}

// ── Binary companion position propagation ────────────────────────────────────
// Conversion factor: 1 AU = 149,597,870.7 km
const KM_PER_AU = 149_597_870.7;

/**
 * Compute heliocentric positions of binary companions.
 *
 * For each KBO with a `binary` companion, computes the companion's
 * position offset from the primary using the mutual orbit elements,
 * then adds it to the primary's heliocentric position.
 *
 * @param kbos - KBO array (same order as propagateKBOPositions output)
 * @param julianDate - Current Julian date
 * @param primaryPositions - Heliocentric primary positions from propagateKBOPositions
 * @param binaryIndices - Output: array of primary KBO indices that have companions
 * @param companionOut - Output: companion heliocentric positions (binaryCount * 3)
 */
export function propagateBinaryKBOPositions(
  kbos: readonly KBODef[],
  julianDate: number,
  primaryPositions: Float32Array,
  binaryIndices: number[],
  companionOut: Float32Array
): void {
  let bIdx = 0;
  const n = kbos.length;
  for (let i = 0; i < n; i++) {
    const bin = kbos[i].binary;
    if (!bin) continue;

    binaryIndices[bIdx] = i;

    // Mutual orbit: simplified near-circular Keplerian
    const dt = julianDate - J2000_JD;
    const meanMotion = TWO_PI / bin.periodDays;
    let M = (bin.meanAnomalyDeg * DEG) + meanMotion * dt;
    M = M % TWO_PI;
    if (M < 0) M += TWO_PI;

    // Solve Kepler equation for mutual orbit
    const ecc = bin.eccentricity;
    const E = solveKeplerFast(M, ecc);

    // Position in mutual orbital plane (in km, then convert to AU)
    const cosE = Math.cos(E);
    const sinE = Math.sin(E);
    const sqrtE = Math.sqrt(1 - ecc * ecc);
    const sepAu = bin.separationKm / KM_PER_AU;
    const localX = sepAu * (cosE - ecc);
    const localY = sepAu * sqrtE * sinE;

    // Rotate by mutual orbit inclination (tilted relative to helio-orbital plane)
    const iMut = bin.inclinationDeg * DEG;
    const cosIMut = Math.cos(iMut);
    const sinIMut = Math.sin(iMut);

    // Use the primary's heliocentric orbital plane as reference:
    // apply a simplified rotation using the primary's orbital elements.
    // For visual fidelity, we rotate the companion offset using the
    // primary's ascending node and argument of periapsis.
    const orb = kbos[i].orbit;
    const omegaRad = (orb.ascendingNodeDeg ?? 0) * DEG;
    const wRad = (orb.argPeriapsisDeg ?? 0) * DEG;
    const iRad = (orb.iDeg ?? 0) * DEG;
    const cosW = Math.cos(wRad);
    const sinW = Math.sin(wRad);
    const cosO = Math.cos(omegaRad);
    const sinO = Math.sin(omegaRad);
    const cosI = Math.cos(iRad);
    const sinI = Math.sin(iRad);

    // Rotate mutual orbit offset into primary's orbital plane
    const ox = localX * cosW - localY * sinW;
    const oy = (localX * sinW + localY * cosW) * cosIMut;
    const oz = (localX * sinW + localY * cosW) * sinIMut;

    // Rotate into ecliptic frame
    const dx = cosO * ox - sinO * cosI * oy + sinO * sinI * oz;
    const dy = sinO * ox + cosO * cosI * oy - cosO * sinI * oz;
    const dz = sinI * oy + cosI * oz;

    // Companion heliocentric = primary heliocentric + offset
    const pOff = i * 3;
    const cOff = bIdx * 3;
    companionOut[cOff] = primaryPositions[pOff] + dx;
    companionOut[cOff + 1] = primaryPositions[pOff + 1] + dy;
    companionOut[cOff + 2] = primaryPositions[pOff + 2] + dz;

    bIdx++;
  }
}
