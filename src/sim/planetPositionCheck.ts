/**
 * Shared logic for the planet-position accuracy gate.
 *
 * `orbitMath.ts` propagates the JPL Standish mean elements in `src/data/planets.ts`
 * forward and backward from J2000 using the per-century secular rates. That
 * propagation is easy to get subtly wrong in ways that are INVISIBLE at J2000 and
 * grow linearly with time -- advancing the mean anomaly at the mean-LONGITUDE rate
 * while separately precessing the periapsis double-counts apsidal precession, and
 * rescaling the period by (a/a0)^1.5 re-applies an a-drift the tabulated rate
 * already contains. Both defects are exactly zero at the epoch.
 *
 * That is why this gate exists and why it looks the way it does:
 *
 *   - it compares against COMMITTED JPL Horizons truth, not against the previous
 *     output of this same code. A test that asserts "the elements changed" cannot
 *     tell an improvement from a regression, and one that asserted exactly that is
 *     how the double-counting shipped;
 *   - it checks SIX epochs spanning 1900-2100, not one. A wrong model that is
 *     anchored at J2000 passes a single-epoch check by construction;
 *   - it asserts an ERROR BUDGET IN KILOMETRES per planet, plus an aggregate, so
 *     the pass/fail line is a physical accuracy claim that survives refactors.
 *
 * The truth values are a committed snapshot, so nothing here needs network access.
 * Two consumers share this module:
 *   - src/sim/planetPositions.horizons.test.ts (the CI gate, one case per planet)
 *   - scripts/verify-planet-positions.mjs      (the planet x epoch diagnostic table)
 *
 * The fixture targets planet BARYCENTRES (Horizons ids 1..9), because those are the
 * bodies the Standish element table describes -- except Earth. Standish "Earth" is the
 * Earth-Moon barycentre, and the catalog moves Earth to the geocentre (EMB minus the Moon's
 * mass fraction of r_moon), so Earth's truth is Horizons 399, Earth itself. The ~4,700 km
 * offset sits inside Standish's own position error, so the gate pins it with Earth's
 * VELOCITY (12 m/s off at the barycentre, < 1.5 m/s at the geocentre).
 */

import type { CatalogBody, SolarCatalog } from './catalog';
import type { KeplerOrbit } from './orbitMath';

export const AU_KM = 149597870.7;
export const DAY_SEC = 86400;
export const J2000_JD = 2451545.0;
export const JULIAN_CENTURY_DAYS = 36525;

/**
 * Per-planet budget on |r_model - r_horizons|, in km, applied AT EVERY EPOCH.
 *
 * These are MEASURED, not guessed. An independent implementation of JPL Standish
 * ("Approximate Positions of the Major Planets", 1800-2050 table) was written
 * outside src/ and scored against this same fixture; each budget is that
 * implementation's worst epoch for that planet, times ~1.5 headroom (~1.3 for
 * Saturn, where more headroom would stop the gate failing on the known defect).
 * Rounded to two significant figures.
 *
 *   planet    reference worst epoch    budget    current buggy tip worst epoch
 *   mercury            2.45e5 km      3.7e5 km            5.93e5 km
 *   venus              1.08e5 km      1.7e5 km            9.94e5 km
 *   earth              9.98e4 km      1.5e5 km            1.76e6 km
 *   mars               6.17e4 km      9.5e4 km            3.35e6 km
 *   jupiter            2.59e6 km      3.9e6 km            6.65e6 km
 *   saturn             1.54e7 km      2.0e7 km            2.85e7 km
 *   uranus             1.82e6 km      2.8e6 km            2.27e7 km
 *   neptune            1.94e6 km      3.0e6 km            2.46e7 km
 *   pluto              1.36e6 km      1.6e6 km            1.90e6 km  (no secular rates; added 2026-10-07)
 *
 * Pluto's headroom is ~1.2x, not 2x: its worst epoch is the Standish element set's own J2000
 * offset (1.36e6 km at every propagator), and 2x would admit the rate-less model (1.90e6 km).
 *
 * The budgets are dominated by two things that are NOT propagator defects, which
 * is why they are as large as they are:
 *
 *  1. The Standish element set itself. Its quoted 1800-2050 accuracy is tens of
 *     arcseconds of heliocentric longitude for the terrestrials and hundreds for
 *     the giants; at Saturn's distance ~1000 arcsec is ~7e6 km. No propagator can
 *     do better than the elements it is handed, so Saturn's budget cannot be tight.
 *  2. `periodDays` in src/data/planets.ts is rounded, and the mean-longitude rate
 *     dL/dt derived from it therefore differs from Standish's tabulated Ldot --
 *     for Saturn by 0.379 deg/century (10759.22 d implies 1222.115 deg/cy against
 *     the tabulated 1222.49362), which alone is ~9e6 km per century of along-track
 *     error. Mercury loses ~2.7e5 km/century the same way.
 *
 * Both are fixable in the DATA, not here: tabulating L0 and Ldot from the Standish
 * table drops the reference worst epoch to 3.1e3 km (mercury), 4.5e3 km (earth),
 * 6.2e6 km (saturn) -- a 30x-80x improvement for the terrestrials. If that ever
 * lands, tighten this table; the numbers above are the ceiling of what the shipped
 * `periodDays` can support, not the ceiling of the model.
 */
export const POSITION_BUDGET_KM: Record<string, number> = {
  // Set at ~2x the measured worst epoch of the shipped propagator (which uses
  // tabulated Ldot). Uniform headroom matters: sizing these against a weaker
  // reference left Mercury with 120x slack, so a 100x regression there would
  // still have gone green. Re-measure and re-tighten if the element data or the
  // mean-longitude rates change.
  mercury: 6e3,
  venus: 2.5e4,
  earth: 1e4,
  mars: 1.5e5,
  jupiter: 2.5e6,
  saturn: 1.3e7,
  uranus: 4e6,
  neptune: 4e6,
  pluto: 1.6e6
};

/**
 * Per-planet budget on SECULAR DRIFT, in km:
 *
 *   drift = max over epochs with |T| >= 0.25 centuries of (err(epoch) - err(J2000))
 *
 * This is the check that actually pins the SECULAR RATES, and it is the reason
 * there are two quantities here rather than one.
 *
 * The absolute budget above conflates two errors: the element set's own inherent
 * offset (Saturn is already 3.85e6 km off at J2000 with perfectly correct
 * propagation -- that is the elements, not the code) and the propagator's
 * time-dependent error. Subtracting the J2000 error cancels the first, leaving a
 * quantity that is ~0 for any propagator that advances the elements at the right
 * rates and grows without bound for one that does not. A model that is right at the
 * epoch and drifts -- precisely the defect this gate was built for -- scores near
 * zero on nothing and is caught here even where the absolute budget has to be loose.
 *
 *   planet    reference drift    budget     current buggy tip drift
 *   mercury         2.44e5 km   3.7e5 km              5.92e5 km
 *   venus           1.00e5 km   1.5e5 km              9.86e5 km
 *   earth           9.78e4 km   1.5e5 km              1.76e6 km
 *   mars            5.35e4 km   8.5e4 km              3.34e6 km
 *   jupiter         1.44e6 km   2.2e6 km              5.50e6 km
 *   saturn          1.15e7 km   1.75e7 km             2.47e7 km
 *   uranus          7.42e5 km   1.2e6 km              2.16e7 km
 *   neptune         8.42e5 km   1.3e6 km              2.35e7 km
 *   pluto          -1.72e5 km   2.5e5 km              5.43e5 km  (no secular rates)
 */
export const DRIFT_BUDGET_KM: Record<string, number> = {
  // Also ~2x measured worst drift. This is the quantity that actually pins the
  // secular rates, so it is the one to keep sharp.
  mercury: 5e3,
  venus: 8e3,
  earth: 6e3,
  mars: 1.3e5,
  jupiter: 5e5,
  saturn: 5e6,
  uranus: 1.8e6,
  neptune: 1.6e6,
  pluto: 2.5e5
};

/** Epochs closer than this to J2000 are the drift baseline, not drift samples. */
export const DRIFT_EPOCH_MIN_CENTURIES = 0.25;

/**
 * Budget on the summed error over every planet x epoch row.
 *
 * The per-planet budgets are worst-epoch limits, so a model could sit just under
 * every one of them at every epoch and still be far worse overall than anything
 * correct. This catches that: the reference implementation totals 6.95e7 km over
 * the 48 rows, the budget is 1.5x that, and the current buggy tip totals 2.61e8 km.
 * Pluto's six rows (added 2026-10-07) contribute 5.2e6 km; the 54-row total is 4.2e7 km.
 */
export const TOTAL_BUDGET_KM = 7.5e7;

/**
 * |r| is a weak but genuinely independent check on the FIXTURE: it depends only on
 * a, e and the phase, so a Horizons row that falls outside the catalog's own
 * [a(1-e), a(1+e)] band indicts the snapshot -- wrong centre, wrong target, wrong
 * units -- rather than the propagator under test. Slack covers the secular drift in
 * a and e across 1900-2100.
 */
export const RADIAL_BAND_SLACK = 0.05;

export interface PlanetTruthState {
  jd: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface PlanetTruthBody {
  hid: string;
  horizonsName: string;
  states: PlanetTruthState[];
}

export interface PlanetPositionEpoch {
  jd: number;
  label: string;
}

export interface PlanetPositionFixture {
  _source: string;
  _query: string;
  _center: string;
  _frame: string;
  _units: string;
  _targets: string;
  _ephemeris: string;
  _timescale: string;
  _retrieved: string;
  _epochs: PlanetPositionEpoch[];
  bodies: Record<string, PlanetTruthBody>;
}

export interface PlanetPositionRow {
  id: string;
  jd: number;
  label: string;
  /** Centuries TDB from J2000; negative before. */
  centuries: number;
  /** |r_model - r_truth| in km. */
  errKm: number;
  /** errKm / |r_truth|; dimensionless, comparable across Mercury and Neptune. */
  rel: number;
  rModelKm: number;
  rTruthKm: number;
  /** Angle between modelled and true position vectors, degrees. */
  sepDeg: number;
  budgetKm: number;
  ok: boolean;
  /** Set when the fixture's |r| falls outside the catalog's own radial band. */
  radialWarning: string | null;
}

export interface PlanetPositionSummary {
  id: string;
  budgetKm: number;
  driftBudgetKm: number;
  /** Worst errKm over all epochs. */
  maxErrKm: number;
  /** errKm at the J2000 row, or NaN if the fixture has no J2000 epoch. */
  j2000ErrKm: number;
  /** max over |T| >= DRIFT_EPOCH_MIN_CENTURIES of (errKm - j2000ErrKm). */
  driftKm: number;
  positionOk: boolean;
  driftOk: boolean;
  ok: boolean;
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

/** Heliocentric position in km, ecliptic J2000, at the given Julian date (TDB). */
export function heliocentricPositionKm(
  propagate: PropagateFn,
  orbit: KeplerOrbit,
  jd: number
): Vec3 {
  const p = makeVector();
  propagate(orbit, jd - orbit.epochJd, p, null);
  return [p.x * AU_KM, p.y * AU_KM, p.z * AU_KM];
}

export function planetsById(catalog: SolarCatalog): Map<string, CatalogBody> {
  const byId = new Map<string, CatalogBody>();
  for (const body of catalog.bodies) {
    if ((body.type === 'planet' || body.type === 'dwarf') && !byId.has(body.id)) {
      byId.set(body.id, body);
    }
  }
  return byId;
}

/** Compare one catalog planet against its Horizons truth state at one epoch. */
export function comparePlanetAtEpoch(
  id: string,
  planet: CatalogBody,
  truth: PlanetTruthState,
  label: string,
  propagate: PropagateFn
): PlanetPositionRow {
  const orbit = planet.orbit;
  if (!orbit || !Number.isFinite(orbit.epochJd)) {
    throw new Error(`${id}: catalog orbit has no finite epochJd`);
  }
  if (planet.parentId !== null && planet.parentId !== 'sun') {
    throw new Error(
      `${id}: parentId is ${planet.parentId}, but the fixture is heliocentric (Horizons CENTER=500@10)`
    );
  }

  const rModel = heliocentricPositionKm(propagate, orbit, truth.jd);
  const rTruth: Vec3 = [truth.x, truth.y, truth.z];
  const rTruthKm = mag(rTruth);
  const errKm = mag(sub(rModel, rTruth));

  const budgetKm = POSITION_BUDGET_KM[id] ?? Number.POSITIVE_INFINITY;

  const aKm = orbit.aAu * AU_KM;
  const e = orbit.e ?? 0;
  const lo = aKm * (1 - e) * (1 - RADIAL_BAND_SLACK);
  const hi = aKm * (1 + e) * (1 + RADIAL_BAND_SLACK);
  const radialWarning =
    rTruthKm < lo || rTruthKm > hi
      ? `${id} @ ${label}: fixture |r| = ${rTruthKm.toExponential(4)} km is outside the catalog ` +
        `band [${lo.toExponential(4)}, ${hi.toExponential(4)}] km (a=${orbit.aAu} au, e=${e})`
      : null;

  return {
    id,
    jd: truth.jd,
    label,
    centuries: (truth.jd - J2000_JD) / JULIAN_CENTURY_DAYS,
    errKm,
    rel: errKm / rTruthKm,
    rModelKm: mag(rModel),
    rTruthKm,
    sepDeg: angleBetweenDeg(rModel, rTruth),
    budgetKm,
    ok: errKm <= budgetKm,
    radialWarning
  };
}

/** Reduce one planet's per-epoch rows to the two gated quantities. */
export function summarizePlanet(id: string, rows: PlanetPositionRow[]): PlanetPositionSummary {
  const budgetKm = POSITION_BUDGET_KM[id] ?? Number.POSITIVE_INFINITY;
  const driftBudgetKm = DRIFT_BUDGET_KM[id] ?? Number.POSITIVE_INFINITY;
  const maxErrKm = rows.reduce((m, r) => Math.max(m, r.errKm), 0);

  const baseline = rows.find((r) => Math.abs(r.centuries) < DRIFT_EPOCH_MIN_CENTURIES);
  const j2000ErrKm = baseline ? baseline.errKm : Number.NaN;
  const far = rows.filter((r) => Math.abs(r.centuries) >= DRIFT_EPOCH_MIN_CENTURIES);
  const driftKm = baseline
    ? far.reduce((m, r) => Math.max(m, r.errKm - j2000ErrKm), Number.NEGATIVE_INFINITY)
    : Number.NaN;

  const positionOk = maxErrKm <= budgetKm;
  // A fixture with no near-J2000 baseline cannot measure drift; do not fail on NaN.
  const driftOk = !Number.isFinite(driftKm) || driftKm <= driftBudgetKm;

  return {
    id,
    budgetKm,
    driftBudgetKm,
    maxErrKm,
    j2000ErrKm,
    driftKm,
    positionOk,
    driftOk,
    ok: positionOk && driftOk
  };
}

const PROVENANCE_FIELDS = [
  '_source',
  '_query',
  '_center',
  '_frame',
  '_units',
  '_targets',
  '_ephemeris',
  '_timescale',
  '_retrieved'
] as const;
const STATE_FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz'] as const;

/** Lower bound on epochs. One epoch cannot distinguish a correct model from a drifting one. */
export const MIN_EPOCHS = 6;

/** Structural validation of the committed snapshot. Returns human-readable problems. */
export function validateFixture(fixture: PlanetPositionFixture): string[] {
  const problems: string[] = [];
  for (const field of PROVENANCE_FIELDS) {
    const value = fixture[field];
    if (typeof value !== 'string' || value.length === 0) {
      problems.push(`missing provenance field ${field}`);
    }
  }
  if (!Array.isArray(fixture._epochs) || fixture._epochs.length < MIN_EPOCHS) {
    problems.push(
      `_epochs must list at least ${MIN_EPOCHS} epochs; a single-epoch fixture cannot ` +
        'distinguish a correct propagator from one that is anchored at J2000 and drifts'
    );
    return problems;
  }
  const jds = fixture._epochs.map((e) => e.jd);
  for (const epoch of fixture._epochs) {
    if (!Number.isFinite(epoch.jd)) problems.push(`epoch ${epoch.label}: jd is not a finite number`);
    if (typeof epoch.label !== 'string' || !epoch.label) problems.push(`epoch jd=${epoch.jd}: missing label`);
  }
  if (new Set(jds).size !== jds.length) problems.push('_epochs contains duplicate jd values');
  const spanCenturies = (Math.max(...jds) - Math.min(...jds)) / JULIAN_CENTURY_DAYS;
  if (spanCenturies < 1.5) {
    problems.push(`_epochs span only ${spanCenturies.toFixed(2)} centuries; need at least 1.5`);
  }
  if (!jds.some((jd) => Math.abs(jd - J2000_JD) / JULIAN_CENTURY_DAYS < DRIFT_EPOCH_MIN_CENTURIES)) {
    problems.push('_epochs has no epoch near J2000 to use as the drift baseline');
  }

  if (!fixture.bodies || typeof fixture.bodies !== 'object') {
    problems.push('missing "bodies" object');
    return problems;
  }
  for (const [id, body] of Object.entries(fixture.bodies)) {
    if (typeof body.hid !== 'string') problems.push(`${id}: missing hid`);
    if (typeof body.horizonsName !== 'string') problems.push(`${id}: missing horizonsName`);
    if (!Array.isArray(body.states) || body.states.length !== jds.length) {
      problems.push(`${id}: expected ${jds.length} states, got ${body.states?.length}`);
      continue;
    }
    body.states.forEach((state, k) => {
      if (state.jd !== jds[k]) {
        problems.push(`${id}: state ${k} jd ${state.jd} does not match _epochs[${k}].jd ${jds[k]}`);
      }
      for (const field of STATE_FIELDS) {
        if (!Number.isFinite(state[field])) problems.push(`${id}: state ${k} ${field} is not finite`);
      }
    });
  }
  return problems;
}

export interface PlanetPositionReport {
  rows: PlanetPositionRow[];
  summaries: PlanetPositionSummary[];
  /** Summed errKm over every planet x epoch row. */
  totalKm: number;
  totalBudgetKm: number;
  totalOk: boolean;
  /** Fixture planets absent from the catalog. */
  missing: string[];
  /** Fixture planets present but carrying no budget entry -- they are NOT gated. */
  ungated: string[];
}

/** Evaluate every planet in the fixture at every epoch. */
export function evaluatePlanetPositions(
  catalog: SolarCatalog,
  propagate: PropagateFn,
  fixture: PlanetPositionFixture
): PlanetPositionReport {
  const byId = planetsById(catalog);
  const rows: PlanetPositionRow[] = [];
  const summaries: PlanetPositionSummary[] = [];
  const missing: string[] = [];
  const ungated: string[] = [];
  let totalKm = 0;

  for (const [id, body] of Object.entries(fixture.bodies)) {
    const planet = byId.get(id);
    if (!planet) {
      missing.push(id);
      continue;
    }
    if (!(id in POSITION_BUDGET_KM)) ungated.push(id);

    const planetRows = body.states.map((state, k) =>
      comparePlanetAtEpoch(id, planet, state, fixture._epochs[k].label, propagate)
    );
    for (const row of planetRows) totalKm += row.errKm;
    rows.push(...planetRows);
    summaries.push(summarizePlanet(id, planetRows));
  }

  summaries.sort((a, b) => b.maxErrKm / b.budgetKm - a.maxErrKm / a.budgetKm);
  return {
    rows,
    summaries,
    totalKm,
    totalBudgetKm: TOTAL_BUDGET_KM,
    totalOk: totalKm <= TOTAL_BUDGET_KM,
    missing,
    ungated
  };
}
