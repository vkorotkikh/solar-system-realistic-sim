import { J2000_JD, MU_SUN_AU3_DAY2 } from '../constants';
import { NAMED_ASTEROID_ORBITS } from '../data/namedAsteroidOrbits';
import { solveKeplerFast } from './orbitMath';
import type { KeplerOrbit } from './orbitMath';

// ── Taxonomy ─────────────────────────────────────────────────────────────────
// Tholen/SMASSII spectral classification mapped to visual properties.
// Fractions from DeMeo & Carry 2014 debiased main-belt survey.

export enum AsteroidTaxonomy {
  C = 0,  // Carbonaceous — 75 % of belt, dark, outer-belt dominated
  S = 1,  // Silicaceous  — 17 %, stony, inner-belt
  M = 2,  // Metallic     — 8 %, iron-nickel
  Unknown = 255, // Missing or not assignable to a coarse visual family.
}

export interface AsteroidDef {
  orbit: KeplerOrbit;
  taxonomy: AsteroidTaxonomy;
  diameterKm: number;
  albedo: number | null;
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
// Ten explicitly identified main-belt bodies, with source-backed elements shared
// by the alternate frontend body definitions. This selection replaces anonymous
// legacy rows that mixed incompatible elements; it does not infer their identities.
// Diameters use the canonical backend body radii. Taxonomy is a coarse visual
// family; albedo, color and irregularity remain approximate display metadata.

export const NAMED_ASTEROIDS: readonly AsteroidDef[] = [
  { sourceId: '1', sourceName: 'Ceres', orbit: NAMED_ASTEROID_ORBITS.ceres, taxonomy: AsteroidTaxonomy.C, diameterKm: 939.4, albedo: 0.09, color: 0x8a8a82, irregularity: 0.02 },
  { sourceId: '4', sourceName: 'Vesta', orbit: NAMED_ASTEROID_ORBITS.vesta, taxonomy: AsteroidTaxonomy.S, diameterKm: 525.4, albedo: 0.42, color: 0xa09980, irregularity: 0.04 },
  { sourceId: '2', sourceName: 'Pallas', orbit: NAMED_ASTEROID_ORBITS.pallas, taxonomy: AsteroidTaxonomy.C, diameterKm: 512.0, albedo: 0.10, color: 0x7a7a72, irregularity: 0.08 },
  { sourceId: '10', sourceName: 'Hygiea', orbit: NAMED_ASTEROID_ORBITS.hygiea, taxonomy: AsteroidTaxonomy.C, diameterKm: 434.0, albedo: 0.07, color: 0x6e6e66, irregularity: 0.03 },
  { sourceId: '511', sourceName: 'Davida (511)', orbit: NAMED_ASTEROID_ORBITS.davida511, taxonomy: AsteroidTaxonomy.C, diameterKm: 326.0, albedo: 0.07, color: 0xb09878, irregularity: 0.10 },
  { sourceId: '704', sourceName: 'Interamnia (704)', orbit: NAMED_ASTEROID_ORBITS.interamnia704, taxonomy: AsteroidTaxonomy.C, diameterKm: 332.0, albedo: 0.07, color: 0x666660, irregularity: 0.06 },
  { sourceId: '7', sourceName: 'Iris (7)', orbit: NAMED_ASTEROID_ORBITS.iris7, taxonomy: AsteroidTaxonomy.S, diameterKm: 214.0, albedo: 0.21, color: 0xb0a090, irregularity: 0.12 },
  { sourceId: '15', sourceName: 'Eunomia', orbit: NAMED_ASTEROID_ORBITS.eunomia, taxonomy: AsteroidTaxonomy.S, diameterKm: 254.0, albedo: 0.21, color: 0x5e5e58, irregularity: 0.07 },
  { sourceId: '52', sourceName: 'Europa (52)', orbit: NAMED_ASTEROID_ORBITS.europa52, taxonomy: AsteroidTaxonomy.C, diameterKm: 312.0, albedo: 0.06, color: 0x5c5c56, irregularity: 0.05 },
  { sourceId: '16', sourceName: 'Psyche', orbit: NAMED_ASTEROID_ORBITS.psyche, taxonomy: AsteroidTaxonomy.M, diameterKm: 222.0, albedo: 0.17, color: 0x9a9a9a, irregularity: 0.09 },
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

// Illustrative truncated diameter density p(D) ∝ D^-2.5 over 0.8–300 km; not a survey-calibrated population.
function sampleDiameterKm(rand: () => number): number {
  const u = rand();
  const dMin = 0.8;
  const dMax = 300;
  const alpha = 2.5;
  return dMin * Math.pow(1 - u * (1 - Math.pow(dMin / dMax, alpha - 1)), -1 / (alpha - 1));
}

function sampleSemiMajorAu(rand: () => number): number {
  for (let attempt = 0; attempt < 40; attempt++) {
    // Uniform trial across the belt; reject the fixed illustrative gap intervals.
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
    if (entry.sourceId) return `source:${entry.sourceId}`;
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

  // An explicitly supplied catalog is already a largest-first prefix. Keep
  // its order and measured population; never pad it with invented catalog rows.
  if (options.deterministicAsteroids !== undefined && !includeNamed) {
    return { count: asteroids.length, asteroids };
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
    const periodDays = 2 * Math.PI * Math.sqrt((aAu * aAu * aAu) / MU_SUN_AU3_DAY2);

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
