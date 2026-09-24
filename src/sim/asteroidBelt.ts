import { J2000_JD } from '../constants';
import { solveKeplerFast } from './orbitMath';
import type { KeplerOrbit } from './orbitMath';

// ── Taxonomy ─────────────────────────────────────────────────────────────────
// Tholen/SMASSII spectral classification mapped to visual properties.
// Fractions from DeMeo & Carry 2014 debiased main-belt survey.

export enum AsteroidTaxonomy {
  C = 0,  // Carbonaceous — 75 % of belt, dark, outer-belt dominated
  S = 1,  // Silicaceous  — 17 %, stony, inner-belt
  M = 2,  // Metallic     — 8 %, iron-nickel
}

export interface AsteroidDef {
  orbit: KeplerOrbit;
  taxonomy: AsteroidTaxonomy;
  diameterKm: number;
  albedo: number;
  /** packed sRGB 0xRRGGBB */
  color: number;
  irregularity: number;
  sourceId?: string;
  sourceName?: string;
}

export interface AsteroidBeltOptions {
  deterministicAsteroids?: readonly AsteroidDef[];
  includeNamed?: boolean;
}

// ── Named bodies ─────────────────────────────────────────────────────────────
// The ~25 largest / most scientifically notable main-belt asteroids.
// Orbital elements: J2000 ecliptic heliocentric, JPL HORIZONS.

export const NAMED_ASTEROIDS: readonly AsteroidDef[] = [
  { orbit: { epochJd: J2000_JD, aAu: 2.7692, e: 0.0760, iDeg: 10.594, ascendingNodeDeg: 80.306, argPeriapsisDeg: 73.598, meanAnomalyDeg: 77.372, periodDays: 1681.6 }, taxonomy: AsteroidTaxonomy.C, diameterKm: 939.4, albedo: 0.09, color: 0x8a8a82, irregularity: 0.02 },
  { orbit: { epochJd: J2000_JD, aAu: 2.3615, e: 0.0887, iDeg: 7.142, ascendingNodeDeg: 103.851, argPeriapsisDeg: 149.858, meanAnomalyDeg: 212.822, periodDays: 1325.8 }, taxonomy: AsteroidTaxonomy.S, diameterKm: 525.4, albedo: 0.42, color: 0xa09980, irregularity: 0.04 },
  { orbit: { epochJd: J2000_JD, aAu: 2.7717, e: 0.2313, iDeg: 34.841, ascendingNodeDeg: 173.089, argPeriapsisDeg: 310.202, meanAnomalyDeg: 78.229, periodDays: 1686.0 }, taxonomy: AsteroidTaxonomy.C, diameterKm: 512.0, albedo: 0.10, color: 0x7a7a72, irregularity: 0.08 },
  { orbit: { epochJd: J2000_JD, aAu: 3.1396, e: 0.1170, iDeg: 3.832, ascendingNodeDeg: 283.414, argPeriapsisDeg: 312.219, meanAnomalyDeg: 29.500, periodDays: 2032.0 }, taxonomy: AsteroidTaxonomy.C, diameterKm: 431.0, albedo: 0.07, color: 0x6e6e66, irregularity: 0.03 },
  { orbit: { epochJd: J2000_JD, aAu: 2.9213, e: 0.1899, iDeg: 7.141, ascendingNodeDeg: 250.563, argPeriapsisDeg: 239.800, meanAnomalyDeg: 190.400, periodDays: 1823.7 }, taxonomy: AsteroidTaxonomy.S, diameterKm: 326.0, albedo: 0.28, color: 0xb09878, irregularity: 0.10 },
  { orbit: { epochJd: J2000_JD, aAu: 3.0614, e: 0.1433, iDeg: 14.739, ascendingNodeDeg: 170.119, argPeriapsisDeg: 248.656, meanAnomalyDeg: 53.000, periodDays: 1956.1 }, taxonomy: AsteroidTaxonomy.C, diameterKm: 302.0, albedo: 0.07, color: 0x666660, irregularity: 0.06 },
  { orbit: { epochJd: J2000_JD, aAu: 2.3867, e: 0.2294, iDeg: 12.978, ascendingNodeDeg: 169.854, argPeriapsisDeg: 157.424, meanAnomalyDeg: 269.700, periodDays: 1346.6 }, taxonomy: AsteroidTaxonomy.S, diameterKm: 268.0, albedo: 0.21, color: 0xb0a090, irregularity: 0.12 },
  { orbit: { epochJd: J2000_JD, aAu: 2.6440, e: 0.0799, iDeg: 3.486, ascendingNodeDeg: 21.058, argPeriapsisDeg: 129.363, meanAnomalyDeg: 152.800, periodDays: 1570.3 }, taxonomy: AsteroidTaxonomy.C, diameterKm: 254.0, albedo: 0.06, color: 0x5e5e58, irregularity: 0.07 },
  { orbit: { epochJd: J2000_JD, aAu: 3.1488, e: 0.1002, iDeg: 0.761, ascendingNodeDeg: 138.649, argPeriapsisDeg: 93.176, meanAnomalyDeg: 313.200, periodDays: 2040.0 }, taxonomy: AsteroidTaxonomy.C, diameterKm: 246.6, albedo: 0.06, color: 0x5c5c56, irregularity: 0.05 },
  { orbit: { epochJd: J2000_JD, aAu: 2.4445, e: 0.1588, iDeg: 5.488, ascendingNodeDeg: 293.031, argPeriapsisDeg: 324.503, meanAnomalyDeg: 134.000, periodDays: 1395.4 }, taxonomy: AsteroidTaxonomy.M, diameterKm: 232.0, albedo: 0.17, color: 0x9a9a9a, irregularity: 0.09 },
];

// ── Distribution parameters ──────────────────────────────────────────────────
// Kirkwood gap centers (Jupiter mean-motion resonances) and half-widths in AU.

const KIRKWOOD_GAPS: readonly [center: number, halfWidth: number][] = [
  [2.065, 0.02],  // 4:1
  [2.502, 0.03],  // 3:1
  [2.825, 0.02],  // 5:2
  [2.958, 0.015], // 7:3
  [3.279, 0.04],  // 2:1
];

const BELT_INNER_AU = 2.06;
const BELT_OUTER_AU = 3.28;

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

function isInKirkwoodGap(aAu: number): boolean {
  for (const [center, hw] of KIRKWOOD_GAPS) {
    if (Math.abs(aAu - center) < hw) return true;
  }
  return false;
}

function taxonomyFromSemiMajor(aAu: number, roll: number): AsteroidTaxonomy {
  // C-types dominate outer belt, S-types inner belt (Gradie & Tedesco 1982)
  const outerFrac = (aAu - BELT_INNER_AU) / (BELT_OUTER_AU - BELT_INNER_AU);
  const cProb = 0.40 + 0.45 * outerFrac;  // ~40 % at inner edge → ~85 % at outer
  const sProb = 0.50 - 0.40 * outerFrac;  // ~50 % at inner → ~10 % at outer
  if (roll < cProb) return AsteroidTaxonomy.C;
  if (roll < cProb + sProb) return AsteroidTaxonomy.S;
  return AsteroidTaxonomy.M;
}

export function colorForTaxonomy(tax: AsteroidTaxonomy, rand: () => number): number {
  const v = (lo: number, hi: number) => Math.floor(lo + (hi - lo) * rand());
  switch (tax) {
    case AsteroidTaxonomy.C: { const g = v(50, 90); return (g << 16) | ((g - 4) << 8) | (g - 8); }
    case AsteroidTaxonomy.S: { return (v(150, 190) << 16) | (v(120, 155) << 8) | v(90, 120); }
    case AsteroidTaxonomy.M: { const g = v(140, 195); return (g << 16) | (g << 8) | (g + 5); }
    default: return 0x7a7a72;
  }
}

export function albedoForTaxonomy(tax: AsteroidTaxonomy, rand: () => number): number {
  switch (tax) {
    case AsteroidTaxonomy.C: return 0.03 + rand() * 0.07;
    case AsteroidTaxonomy.S: return 0.10 + rand() * 0.15;
    case AsteroidTaxonomy.M: return 0.10 + rand() * 0.10;
    default: return 0.10 + rand() * 0.08;
  }
}

// Cumulative size-frequency distribution N(>D) ∝ D^−2.5 (Bottke+ 2005)
function sampleDiameterKm(rand: () => number): number {
  const u = rand();
  const dMin = 0.8;
  const dMax = 300;
  const alpha = 2.5;
  return dMin * Math.pow(1 - u * (1 - Math.pow(dMin / dMax, alpha - 1)), -1 / (alpha - 1));
}

function sampleSemiMajorAu(rand: () => number): number {
  for (let attempt = 0; attempt < 40; attempt++) {
    // Bimodal peak near 2.35 AU and 2.85 AU with overall smooth distribution
    const t = rand();
    const aAu = BELT_INNER_AU + (BELT_OUTER_AU - BELT_INNER_AU) * t;
    if (!isInKirkwoodGap(aAu)) return aAu;
  }
  return 2.6 + (rand() - 0.5) * 0.2;
}

export interface AsteroidBeltPopulation {
  count: number;
  asteroids: AsteroidDef[];
}

export function generateAsteroidBelt(
  count = 15_000,
  seed = 42,
  options: AsteroidBeltOptions = {}
): AsteroidBeltPopulation {
  const rand = mulberry32(seed);
  const deterministicAsteroids = options.deterministicAsteroids ?? [];
  const includeNamed = options.includeNamed ?? true;

  const asteroids: AsteroidDef[] = [];
  const seen = new Set<string>();

  const identityKey = (entry: AsteroidDef): string => {
    const o = entry.orbit;
    return `${(o.aAu ?? 0).toFixed(7)}|${(o.e ?? 0).toFixed(7)}|${(o.iDeg ?? 0).toFixed(5)}|${(o.meanAnomalyDeg ?? 0).toFixed(4)}`;
  };

  for (const entry of deterministicAsteroids) {
    if (asteroids.length >= count) break;
    const key = identityKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    asteroids.push(entry);
  }

  if (includeNamed) {
    for (const named of NAMED_ASTEROIDS) {
      if (asteroids.length >= count) break;
      const key = identityKey(named);
      if (seen.has(key)) continue;
      seen.add(key);
      asteroids.push(named);
    }
  }

  const remaining = Math.max(0, count - asteroids.length);
  for (let i = 0; i < remaining; i++) {
    const aAu = sampleSemiMajorAu(rand);
    const e = Math.min(0.35, Math.abs(rand() + rand() - 1) * 0.18);
    const iDeg = Math.abs(rand() + rand() + rand() - 1.5) * 14;
    const ascendingNodeDeg = rand() * 360;
    const argPeriapsisDeg = rand() * 360;
    const meanAnomalyDeg = rand() * 360;
    const periodDays = 365.25 * Math.pow(aAu, 1.5);

    const taxonomy = taxonomyFromSemiMajor(aAu, rand());
    const diameterKm = sampleDiameterKm(rand);
    const irregularity = diameterKm > 200 ? 0.02 + rand() * 0.05
      : diameterKm > 50 ? 0.05 + rand() * 0.15
      : 0.10 + rand() * 0.30;

    asteroids.push({
      orbit: {
        epochJd: J2000_JD,
        aAu,
        e,
        iDeg,
        ascendingNodeDeg,
        argPeriapsisDeg,
        meanAnomalyDeg,
        periodDays,
      },
      taxonomy,
      diameterKm,
      albedo: albedoForTaxonomy(taxonomy, rand),
      color: colorForTaxonomy(taxonomy, rand),
      irregularity,
    });
  }

  return { count: asteroids.length, asteroids };
}

// ── Fast batch orbit propagation ─────────────────────────────────────────────
// Outputs flat Float32Array [x,y,z, x,y,z, …] for InstancedMesh matrix update.

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

export function propagateBeltPositions(
  asteroids: readonly AsteroidDef[],
  julianDate: number,
  out: Float32Array
): void {
  const n = asteroids.length;
  for (let i = 0; i < n; i++) {
    const orb = asteroids[i].orbit;
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

    // Rotate from perifocal to ecliptic
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
    out[off]     = cosO * px - sinO * cosI * py;
    out[off + 1] = sinO * px + cosO * cosI * py;
    out[off + 2] = sinI * py;
  }
}
