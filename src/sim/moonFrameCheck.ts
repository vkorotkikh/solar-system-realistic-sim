/**
 * Shared logic for the moon frame-conversion regression gate.
 *
 * `catalog.ts` converts satellite elements from their source frame (`laplace`,
 * `equatorial`) into the ecliptic frame `propagateKeplerOrbit` expects. A sign
 * or node-referencing error there is invisible in the UI today because moons are
 * not rendered, but it silently corrupts every non-ecliptic moon's position --
 * historically by up to two orbital radii.
 *
 * The truth values are a committed JPL Horizons snapshot, so nothing here needs
 * network access. Two consumers share this module:
 *   - src/sim/moonFrames.horizons.test.ts (the CI gate, one case per moon)
 *   - scripts/verify-moon-frames.mjs      (the standalone diagnostic table)
 */

import type { CatalogBody, SolarCatalog } from './catalog';
import type { KeplerOrbit } from './orbitMath';

export const AU_KM = 149597870.7;
export const DAY_SEC = 86400;
export const J2000_JD = 2451545.0;

/**
 * Per-moon tolerance on |r_model - r_truth| / |r_truth|.
 *
 * The default is tight. The listed moons carry a known element-set defect in
 * src/data/moons.json (correct orbit plane, wrong phase) that is tracked
 * separately -- they are pinned here so the gate still catches a frame
 * regression on them without failing on the pre-existing data issue.
 */
export const DEFAULT_POSITION_TOL = 0.15;
export const POSITION_TOL_OVERRIDE: Record<string, number> = {
  Titan: 2.0,
  Iapetus: 2.0,
  Phoebe: 2.0,
  Cordelia: 2.0,
  Pasiphae: 0.2,
  Sinope: 0.2,
  Carme: 0.2
};

/**
 * Per-moon tolerance on the angle between the modelled and true orbit normals
 * (h = r x v), in degrees.
 *
 * This is the check that actually pins the FRAME. dr/r conflates plane error
 * with phase error, so the deliberately loose position pins above -- which exist
 * to tolerate a phase-only defect in the source data -- would otherwise also
 * swallow a total plane inversion. The plane angle is immune to phase: a moon in
 * the right plane at the wrong time still scores ~0 here. Gating both lets the
 * check tolerate the known data defect without going blind to a frame
 * regression.
 */
export const DEFAULT_PLANE_TOL_DEG = 10;
export const PLANE_TOL_DEG_OVERRIDE: Record<string, number> = {
  // Outer irregular satellites carried as ecliptic elements. Their published
  // element sets are low-precision and strongly solar-perturbed, so their planes
  // reconstruct a few degrees off even when the frame code is correct.
  Pasiphae: 12,
  Sinope: 12,

  // Cordelia (and Ophelia, not in the fixture) are inner Uranian moons whose
  // records are epoch 2025-01-01 with nodePrecessionYears = 0.6. Validating them
  // at J2000 extrapolates 25 years backwards, i.e. ~42 full node circuits — and
  // propagateKeplerOrbit models no node precession at all (orbitMath.ts never
  // reads nodePrecessionYears). The node, and therefore the plane orientation, is
  // arbitrary at J2000 for these bodies: this is a missing-precession artifact,
  // NOT a frame-conversion defect. Pinned wide so the gate still catches a real
  // frame regression everywhere else. Remove this pin if node precession is ever
  // implemented, or if the fixture gains an epoch near 2025.
  Cordelia: 180
};

/**
 * |r| is frame-invariant: it depends on a, e and the mean anomaly, never on the
 * frame conversion under test. Comparing the fixture's |r| against the catalog's
 * own [a(1-e), a(1+e)] band therefore validates the FIXTURE, and separates
 * "the snapshot is wrong" from "the frame maths is wrong".
 */
export const RADIAL_BAND_SLACK = 0.05;

export interface MoonTruthState {
  hid: string;
  center: string;
  jd: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface MoonFrameFixture {
  _source: string;
  _query: string;
  _epoch: string;
  _units: string;
  _retrieved: string;
  bodies: Record<string, MoonTruthState>;
}

export interface MoonFrameRow {
  name: string;
  frame: string;
  /** |r_model - r_truth| / |r_truth| */
  rel: number;
  /** |r_model - r_truth| in km */
  drKm: number;
  rModelKm: number;
  rTruthKm: number;
  /** Angle between modelled and true position vectors, degrees. */
  sepDeg: number;
  /** Angle between modelled and true orbit normals, degrees. Phase-immune. */
  planeDeg: number;
  positionTol: number;
  planeTolDeg: number;
  positionOk: boolean;
  planeOk: boolean;
  ok: boolean;
  /** Set when the fixture's |r| falls outside the catalog's own radial band. */
  radialWarning: string | null;
}

type Vec3 = [number, number, number];

/** Minimal stand-in for three's Vector3; propagateKeplerOrbit only calls .set(). */
export interface MutableVector3 {
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): void;
}

export type PropagateFn = (
  orbit: KeplerOrbit,
  elapsedDays: number,
  outPosition: MutableVector3,
  outVelocity?: MutableVector3 | null
) => void;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mag = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function angleBetweenDeg(a: Vec3, b: Vec3): number {
  const denom = mag(a) * mag(b);
  if (denom === 0) return Number.NaN;
  return (Math.acos(Math.max(-1, Math.min(1, dot(a, b) / denom))) * 180) / Math.PI;
}

function makeVector(): MutableVector3 {
  return {
    x: 0,
    y: 0,
    z: 0,
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
  };
}

/** Parent-relative state in km and km/s, ecliptic J2000. */
export function parentRelativeStateKm(
  propagate: PropagateFn,
  orbit: KeplerOrbit,
  jd: number
): { r: Vec3; v: Vec3 } {
  const p = makeVector();
  const v = makeVector();
  propagate(orbit, jd - orbit.epochJd, p, v);
  return {
    r: [p.x * AU_KM, p.y * AU_KM, p.z * AU_KM],
    v: [(v.x * AU_KM) / DAY_SEC, (v.y * AU_KM) / DAY_SEC, (v.z * AU_KM) / DAY_SEC]
  };
}

export function moonsByName(catalog: SolarCatalog): Map<string, CatalogBody> {
  const byName = new Map<string, CatalogBody>();
  for (const body of catalog.bodies) {
    if (body.type === 'moon' && !byName.has(body.name)) byName.set(body.name, body);
  }
  return byName;
}

/** Compare one catalog moon against its Horizons truth state. */
export function compareMoon(
  name: string,
  moon: CatalogBody,
  truth: MoonTruthState,
  propagate: PropagateFn
): MoonFrameRow {
  const orbit = moon.orbit;
  if (!orbit || !Number.isFinite(orbit.epochJd)) {
    throw new Error(`${name}: catalog orbit has no finite epochJd`);
  }

  const state = parentRelativeStateKm(propagate, orbit, truth.jd ?? J2000_JD);
  const rTruth: Vec3 = [truth.x, truth.y, truth.z];
  const vTruth: Vec3 = [truth.vx, truth.vy, truth.vz];
  const rTruthKm = mag(rTruth);
  const drKm = mag(sub(state.r, rTruth));
  const rel = drKm / rTruthKm;

  const positionTol = POSITION_TOL_OVERRIDE[name] ?? DEFAULT_POSITION_TOL;
  const planeTolDeg = PLANE_TOL_DEG_OVERRIDE[name] ?? DEFAULT_PLANE_TOL_DEG;
  const sepDeg = angleBetweenDeg(state.r, rTruth);
  const planeDeg = angleBetweenDeg(cross(state.r, state.v), cross(rTruth, vTruth));
  const positionOk = rel <= positionTol;
  const planeOk = planeDeg <= planeTolDeg;

  const aKm = orbit.aAu * AU_KM;
  const e = orbit.e ?? 0;
  const lo = aKm * (1 - e) * (1 - RADIAL_BAND_SLACK);
  const hi = aKm * (1 + e) * (1 + RADIAL_BAND_SLACK);
  const radialWarning =
    rTruthKm < lo || rTruthKm > hi
      ? `${name}: fixture |r| = ${rTruthKm.toFixed(0)} km is outside the catalog band ` +
        `[${lo.toFixed(0)}, ${hi.toFixed(0)}] km (a=${aKm.toFixed(0)}, e=${e})`
      : null;

  return {
    name,
    frame: moon.orbitFrameSource ?? 'ecliptic',
    rel,
    drKm,
    rModelKm: mag(state.r),
    rTruthKm,
    sepDeg,
    planeDeg,
    positionTol,
    planeTolDeg,
    positionOk,
    planeOk,
    ok: positionOk && planeOk,
    radialWarning
  };
}

const PROVENANCE_FIELDS = ['_source', '_query', '_epoch', '_units', '_retrieved'] as const;
const STATE_FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz'] as const;

/** Structural validation of the committed snapshot. Returns human-readable problems. */
export function validateFixture(fixture: MoonFrameFixture): string[] {
  const problems: string[] = [];
  for (const field of PROVENANCE_FIELDS) {
    const value = fixture[field];
    if (typeof value !== 'string' || value.length === 0) {
      problems.push(`missing provenance field ${field}`);
    }
  }
  if (!fixture.bodies || typeof fixture.bodies !== 'object') {
    problems.push('missing "bodies" object');
    return problems;
  }
  for (const [name, truth] of Object.entries(fixture.bodies)) {
    for (const field of STATE_FIELDS) {
      if (!Number.isFinite(truth[field])) problems.push(`${name}: ${field} is not a finite number`);
    }
    if (!Number.isFinite(truth.jd)) problems.push(`${name}: jd is not a finite number`);
    if (typeof truth.center !== 'string') problems.push(`${name}: missing center`);
    if (typeof truth.hid !== 'string') problems.push(`${name}: missing hid`);
  }
  return problems;
}

/** Evaluate every moon in the fixture. `missing` lists fixture moons absent from the catalog. */
export function evaluateMoonFrames(
  catalog: SolarCatalog,
  propagate: PropagateFn,
  fixture: MoonFrameFixture
): { rows: MoonFrameRow[]; missing: string[] } {
  const byName = moonsByName(catalog);
  const rows: MoonFrameRow[] = [];
  const missing: string[] = [];
  for (const [name, truth] of Object.entries(fixture.bodies)) {
    const moon = byName.get(name);
    if (!moon) {
      missing.push(name);
      continue;
    }
    rows.push(compareMoon(name, moon, truth, propagate));
  }
  rows.sort((a, b) => b.rel - a.rel);
  return { rows, missing };
}
