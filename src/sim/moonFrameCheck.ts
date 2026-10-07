/**
 * Shared logic for the moon frame + position accuracy gate.
 *
 * Three defect classes live under this file, and they need different instruments.
 *
 *  1. FRAME. Satellite mean-element rates are defined in a native Laplace or
 *     parent-equatorial frame. `sourceFrameOrbit.ts` must precess there and rotate
 *     the complete Cartesian state into ecliptic J2000 afterward. Converting once
 *     and adding the local node rate to an ecliptic node historically put Cordelia's
 *     plane 117.7 deg off. The phase-immune PLANE ANGLE pins this composition.
 *
 *  2. EPHEMERIS DATA. JPL explicitly says its descriptive satellite mean-element
 *     table is not intended for ephemeris computation. Titan, Iapetus and Phoebe
 *     were consequently 1.85-1.96 orbital radii out of phase at their own epoch;
 *     Cordelia's rounded short-period row lost phase within days. Those four now
 *     use a committed, 2000-2050 JDTDB Chebyshev fit to Horizons osculating states,
 *     validated on independent half-step samples. POSITION and VELOCITY pin it.
 *
 *  3. SECULAR RATES. `resolveMoonSecularRates` hands most fallback moons an
 *     argPeriapsis and ascendingNode rate, and `resolveKeplerOrbitAtElapsedDays`
 *     precesses both. The mean anomaly must then advance at (2*pi/P_sidereal minus
 *     varpidot), because the propagated mean longitude is L = M + varpi and
 *     periodDays is the SIDEREAL period, i.e. 2*pi/periodDays is already dL/dt.
 *
 *     THE INVARIANT, worth stating once and keeping: IF YOU PRECESS varpi, YOU MUST
 *     SUBTRACT varpidot FROM THE MEAN-ANOMALY ADVANCE, OR YOU DOUBLE-COUNT IT.
 *     (varpi = ascendingNode + argPeriapsis, so varpidot is the SUM of the two
 *     tabulated rates, not just the apsidal one -- verified by measurement: removing
 *     only the apsidal term leaves the Moon 5.5e5 km off at +5 yr instead of 4.5e3.)
 *
 *     This defect is EXACTLY ZERO at the epoch and grows linearly with time. The
 *     previous version of this gate had a J2000-ONLY fixture, where T = 0 and every
 *     secular term vanishes identically. It was green and structurally could not see
 *     a 66%-of-orbit-radius error one year later. That is the single-epoch-validation
 *     trap, inside the gate itself.
 *
 * So this gate now checks SEVEN epochs, and asserts four things:
 *   - a POSITION budget in km, per moon PER EPOCH;
 *   - a VELOCITY budget in km/s for every fitted ephemeris body;
 *   - a PLANE-ANGLE budget in degrees (phase-immune); and
 *   - a DRIFT budget in km: max over non-J2000 epochs of
 *     (err - err_J2000), which remains sensitive to fallback rate regressions.
 *
 * The truth values are a committed JPL Horizons snapshot, so nothing here needs
 * network access. Two consumers share this module:
 *   - src/sim/moonFrames.horizons.test.ts (the CI gate, one case per moon)
 *   - scripts/verify-moon-frames.mjs      (the moon x epoch diagnostic table)
 *
 * See src/sim/planetPositionCheck.ts for the same shape applied to the planets.
 */

import type { CatalogBody, SolarCatalog } from './catalog';
import type { KeplerOrbit } from './orbitMath';

export const AU_KM = 149597870.7;
export const DAY_SEC = 86400;
export const J2000_JD = 2451545.0;

/**
 * WHY THESE EPOCHS, AND WHY NOT ONE LONG ONE.
 *
 * Along-track error is 2*r*sin(delta/2): it FOLDS at delta = 180 deg and returns to
 * zero at 360 deg. Moons precess fast enough to wrap, so a single long baseline
 * aliases and a badly wrong model can score better than a correct one. Measured, on
 * this fixture: at +180 d the current tip puts Io 6.13e5 km from Horizons
 * (delta = 266 deg) while a CORRECT propagator on the same element set is 7.72e5 km
 * off (delta = 133 deg). Ranking those two by +180 d error alone gets the answer
 * backwards.
 *
 * Hence a ladder: 30 d and 180 d for the fast precessors (Io, Europa, Enceladus,
 * Miranda), 1 yr and 5 yr for the middle (Moon, Ariel, Titania), and two epochs near
 * 2025 for the slow ones (Titan, Iapetus) and for the bodies whose element records
 * are epoch-2025 rather than epoch-J2000.
 */
export const EPOCH_KEYS = ['j2000', 'p30d', 'p180d', 'p1y', 'p5y', 'y2025', 'y2026'] as const;
export type EpochKey = (typeof EPOCH_KEYS)[number];

/** Lower bound on epochs. One epoch cannot distinguish a correct model from a drifting one. */
export const MIN_EPOCHS = 5;

/** Epochs at least this far from J2000 count as drift samples rather than the baseline. */
export const DRIFT_EPOCH_MIN_DAYS = 15;

type PerEpoch = Record<EpochKey, number>;

/**
 * Per-moon, per-epoch budget on |r_model - r_horizons|, in km.
 *
 * MEASURED, not guessed. Mean-element fallback rows are based on the corrected
 * propagator scored against this fixture. The four fitted rows use their independent
 * 2000-2050 half-step validation maxima with explicit headroom (not these seven
 * fixture dates, which would make the gate circular).
 *
 * Where a row is much wider than 0.5% of the orbit radius, the element DATA is the
 * limit, not the propagator; every such row is named in DATA_LIMITED below with the
 * measurement that says so and the tighter budget to install once the data is fixed.
 */
export const POSITION_BUDGET_KM: Record<string, PerEpoch> = {
  // -- clean rows: budget is 2x a correct propagator, and 0.02-0.10 of the orbit radius --
  Moon:      { j2000: 8.9e3, p30d: 6.3e3, p180d: 1.7e4, p1y: 1.4e4, p5y: 9.0e3, y2025: 3.9e4, y2026: 8.1e3 },
  Enceladus: { j2000: 4.6e4, p30d: 4.6e4, p180d: 5.1e4, p1y: 5.3e4, p5y: 4.6e4, y2025: 4.8e4, y2026: 4.4e4 },
  Ariel:     { j2000: 1.5e3, p30d: 1.3e3, p180d: 9.6e2, p1y: 9.6e2, p5y: 9.6e2, y2025: 9.6e2, y2026: 9.6e2 },
  Titania:   { j2000: 5.0e3, p30d: 5.0e3, p180d: 5.0e3, p1y: 5.0e3, p5y: 5.0e3, y2025: 5.0e3, y2026: 5.0e3 },
  Charon:    { j2000: 9.8e1, p30d: 9.8e1, p180d: 9.8e1, p1y: 9.8e1, p5y: 9.8e1, y2025: 9.8e1, y2026: 9.8e1 },
  Nereid:    { j2000: 6.3e4, p30d: 7.3e4, p180d: 2.3e5, p1y: 6.5e4, p5y: 7.2e4, y2025: 2.2e5, y2026: 2.4e5 },
  Miranda:   { j2000: 1.0e4, p30d: 1.0e4, p180d: 1.0e4, p1y: 1.0e4, p5y: 1.0e4, y2025: 1.0e4, y2026: 1.0e4 },
  Himalia:   { j2000: 6.9e5, p30d: 8.8e5, p180d: 1.9e6, p1y: 5.1e5, p5y: 2.1e6, y2025: 9.3e6, y2026: 2.2e7 },

  // -- re-measured 2026-10-07 after catalog.ts MEASURED_ORBITS (Io, Europa, Triton) and with
  //    JUP365 periods read as anomalistic (Ganymede, Callisto): 2x the worst fixture epoch.
  //    Worst over 61 independent Horizons epochs 2000-2030: Io 1.56e3, Europa 2.16e3,
  //    Ganymede 4.49e3, Callisto 4.91e3, Triton 2.53e4 km (was 8.47e5 / 1.35e6 / - / - / 1.47e5).
  Io:        { j2000: 2.7e3, p30d: 2.7e3, p180d: 2.7e3, p1y: 2.7e3, p5y: 2.7e3, y2025: 2.7e3, y2026: 2.7e3 },
  Europa:    { j2000: 2.7e3, p30d: 2.7e3, p180d: 2.7e3, p1y: 2.7e3, p5y: 2.7e3, y2025: 2.7e3, y2026: 2.7e3 },
  Ganymede:  { j2000: 3.2e3, p30d: 3.2e3, p180d: 3.2e3, p1y: 3.2e3, p5y: 3.2e3, y2025: 3.2e3, y2026: 3.2e3 },
  Callisto:  { j2000: 9.6e3, p30d: 9.6e3, p180d: 9.6e3, p1y: 9.6e3, p5y: 9.6e3, y2025: 9.6e3, y2026: 9.6e3 },
  Triton:    { j2000: 5.1e4, p30d: 5.1e4, p180d: 5.1e4, p1y: 5.1e4, p5y: 5.1e4, y2025: 5.1e4, y2026: 5.1e4 },
  // JPL-fitted ephemerides. These limits cover the independently measured
  // 2000-2050 held-out maxima with headroom; they replace the former 2-radii
  // phase exemptions and Cordelia's 180-degree plane exemption.
  Titan:     { j2000: 5.0e1, p30d: 5.0e1, p180d: 5.0e1, p1y: 5.0e1, p5y: 5.0e1, y2025: 5.0e1, y2026: 5.0e1 },
  Iapetus:   { j2000: 1.25e2, p30d: 1.25e2, p180d: 1.25e2, p1y: 1.25e2, p5y: 1.25e2, y2025: 1.25e2, y2026: 1.25e2 },
  Phoebe:    { j2000: 2.5e2, p30d: 2.5e2, p180d: 2.5e2, p1y: 2.5e2, p5y: 2.5e2, y2025: 2.5e2, y2026: 2.5e2 },
  Cordelia:  { j2000: 1.25e2, p30d: 1.25e2, p180d: 1.25e2, p1y: 1.25e2, p5y: 1.25e2, y2025: 1.25e2, y2026: 1.25e2 },
  Pasiphae:  { j2000: 6.3e6, p30d: 6.5e6, p180d: 5.5e6, p1y: 1.6e7, p5y: 5.3e7, y2025: 5.3e7, y2026: 7.3e7 },
  Sinope:    { j2000: 2.3e6, p30d: 1.1e6, p180d: 5.3e6, p1y: 5.1e6, p5y: 3.5e7, y2025: 8.3e7, y2026: 4.2e7 },
  Carme:     { j2000: 2.4e6, p30d: 2.2e6, p180d: 1.2e7, p1y: 1.7e7, p5y: 4.5e7, y2025: 3.4e7, y2026: 6.4e7 }
};

/**
 * Per-moon, per-epoch budget on the angle between the modelled and true orbit
 * normals (h = r x v), in degrees.
 *
 * This is the check that pins the FRAME. Position error conflates plane error with
 * phase error, so the deliberately loose position rows above -- which exist to
 * tolerate defects in the source DATA -- would otherwise swallow a total plane
 * inversion. The plane angle is immune to phase: a moon in the right plane at the
 * wrong time still scores ~0 here.
 *
 * Also measured at 2x, floored at 0.5 deg. The plane is untouched by the mean-anomaly
 * defect: changing M slides the body ALONG its orbit, and h = r x v keeps pointing the
 * same way, so every number in this table is unchanged by that fix to within 2.5e-10
 * deg of float noise (measured). This table is therefore a pure non-regression guard on
 * catalog.ts and on the node rates, never a witness for the mean-anomaly defect.
 */
export const PLANE_BUDGET_DEG: Record<string, PerEpoch> = {
  Moon:      { j2000: 0.5, p30d: 0.5, p180d: 0.5, p1y: 0.5, p5y: 0.5, y2025: 0.5, y2026: 0.5 },
  Io:        { j2000: 0.5, p30d: 0.5, p180d: 0.5, p1y: 0.5, p5y: 0.5, y2025: 0.5, y2026: 0.5 },
  Europa:    { j2000: 0.5, p30d: 0.5, p180d: 0.6, p1y: 1.0, p5y: 4.5, y2025: 4.6, y2026: 3.8 },
  Ganymede:  { j2000: 0.5, p30d: 0.5, p180d: 0.5, p1y: 0.5, p5y: 1.0, y2025: 4.6, y2026: 4.8 },
  Callisto:  { j2000: 0.5, p30d: 0.5, p180d: 0.5, p1y: 0.5, p5y: 0.5, y2025: 1.1, y2026: 1.1 },
  Enceladus: { j2000: 0.5, p30d: 0.5, p180d: 0.5, p1y: 0.5, p5y: 0.5, y2025: 0.5, y2026: 0.5 },
  Titan:     { j2000: 0.05, p30d: 0.05, p180d: 0.05, p1y: 0.05, p5y: 0.05, y2025: 0.05, y2026: 0.05 },
  Iapetus:   { j2000: 0.05, p30d: 0.05, p180d: 0.05, p1y: 0.05, p5y: 0.05, y2025: 0.05, y2026: 0.05 },
  Phoebe:    { j2000: 0.05, p30d: 0.05, p180d: 0.05, p1y: 0.05, p5y: 0.05, y2025: 0.05, y2026: 0.05 },
  Charon:    { j2000: 0.5, p30d: 0.5, p180d: 0.5, p1y: 0.5, p5y: 0.5, y2025: 0.5, y2026: 0.5 },
  Ariel:     { j2000: 0.5, p30d: 0.5, p180d: 0.5, p1y: 0.5, p5y: 0.5, y2025: 0.5, y2026: 0.5 },
  Nereid:    { j2000: 0.5, p30d: 0.5, p180d: 0.5, p1y: 0.5, p5y: 0.5, y2025: 0.5, y2026: 0.5 },
  Himalia:   { j2000: 3.7, p30d: 3.7, p180d: 4.2, p1y: 4.3, p5y: 2.8, y2025: 4.6, y2026: 3.6 },

  // Source-frame regression rows. These were formerly allowed to drift as far as
  // 180 deg because local Laplace/equatorial node rates were incorrectly added to
  // an ecliptic node. The propagator now precesses in the native frame and rotates
  // the complete Cartesian state afterward, so the old exemptions are gone.
  Titania:   { j2000: 0.5, p30d: 0.5, p180d: 0.5, p1y: 0.5, p5y: 0.5, y2025: 0.5, y2026: 0.5 },
  Triton:    { j2000: 20, p30d: 20, p180d: 20, p1y: 20, p5y: 20, y2025: 20, y2026: 20 },
  Miranda:   { j2000: 0.5, p30d: 0.5, p180d: 0.5, p1y: 0.5, p5y: 0.5, y2025: 0.5, y2026: 0.5 },
  Cordelia:  { j2000: 0.05, p30d: 0.05, p180d: 0.05, p1y: 0.05, p5y: 0.05, y2025: 0.05, y2026: 0.05 },

  // Outer irregular satellites carried as ecliptic elements: low-precision published
  // element sets, strongly solar-perturbed, and not well described by a fixed Kepler
  // ellipse over decades. Their planes reconstruct several degrees off even with
  // correct frame code, and the error grows with baseline.
  Pasiphae:  { j2000: 16.5, p30d: 15.9, p180d: 17.3, p1y: 21.4, p5y: 39.0, y2025: 101.9, y2026: 98.8 },
  Sinope:    { j2000: 10.4, p30d: 10.8, p180d: 8.6, p1y: 10.5, p5y: 25.1, y2025: 84.0, y2026: 85.4 },
  Carme:     { j2000: 0.5, p30d: 1.3, p180d: 4.5, p1y: 7.0, p5y: 19.0, y2025: 60.4, y2026: 61.7 }
};

/**
 * Parent-relative velocity budgets in km/s. Position-only checks can accept a
 * geometrically plausible curve with the wrong direction or time derivative;
 * the fitted ephemeris path is therefore certified against both halves of the
 * Horizons state vector. Moons without an entry retain the legacy position/plane
 * gate until their data source is migrated to an ephemeris model.
 */
export const VELOCITY_BUDGET_KM_S: Partial<Record<string, PerEpoch>> = {
  Titan:    { j2000: 0.002, p30d: 0.002, p180d: 0.002, p1y: 0.002, p5y: 0.002, y2025: 0.002, y2026: 0.002 },
  Iapetus:  { j2000: 0.005, p30d: 0.005, p180d: 0.005, p1y: 0.005, p5y: 0.005, y2025: 0.005, y2026: 0.005 },
  Phoebe:   { j2000: 0.010, p30d: 0.010, p180d: 0.010, p1y: 0.010, p5y: 0.010, y2025: 0.010, y2026: 0.010 },
  Cordelia: { j2000: 0.025, p30d: 0.025, p180d: 0.025, p1y: 0.025, p5y: 0.025, y2025: 0.025, y2026: 0.025 }
};

/**
 * Per-moon budget on SECULAR DRIFT, in km:
 *
 *   drift = max over epochs at least DRIFT_EPOCH_MIN_DAYS from J2000 of
 *           (err(epoch) - err(J2000))
 *
 * This is the quantity that actually pins the RATES, and it is why there are two
 * position numbers here rather than one.
 *
 * For approximate fallback rows, the absolute budget conflates the source table's
 * epoch offset with propagation error. Subtracting the J2000 error cancels that
 * constant component and exposes a rate regression. For fitted ephemerides the
 * absolute position/velocity limits are already sharp; drift remains a second guard.
 *
 * Note for the two moons whose records are not epoch-J2000 (Cordelia 2025-01-01,
 * Nereid 2020-01-01): "drift from J2000" still cancels a constant offset and is still
 * a valid rate check, but J2000 is a 25-year and 20-year backward extrapolation for
 * them rather than a zero-baseline anchor.
 *
 * Io, Europa, Ganymede, Callisto and Triton (re-measured 2026-10-07): 2x the measured drift,
 * floored at 10% of the position budget where the J2000 row is already the worst one and
 * drift is therefore <= 0. The pre-fix drifts were 8.4e5, 1.3e6 and 1.0e5 km for Io,
 * Europa and Triton, so every floor still fails that defect by >= 20x.
 */
export const DRIFT_BUDGET_KM: Record<string, number> = {
  Moon: 3.0e4,
  Io: 1.0e3,
  Europa: 1.9e3,
  Ganymede: 3.2e2,
  Callisto: 9.6e2,
  Enceladus: 7.1e3,
  Titan: 5.0e1,
  Iapetus: 1.25e2,
  Phoebe: 2.5e2,
  Triton: 5.1e3,
  Charon: 9.8e1,
  Cordelia: 1.25e2,
  Miranda: 5.0e3,
  Ariel: 9.6e2,
  Titania: 3.0e3,
  Himalia: 2.1e7,
  Pasiphae: 6.6e7,
  Nereid: 1.8e5,
  Sinope: 8.1e7,
  Carme: 6.2e7
};

/**
 * Rows whose POSITION budget is set by a defect in src/data/moons.json rather than by
 * the propagator, with the measurement that proves it and the budget to install once
 * the data is fixed. Nothing here is a guess: each `evidence` string is a number this
 * gate's own fixture produced.
 *
 * This list exists so that "the budget is loose" is never mistaken for "the model is
 * good enough". Every entry is a known blind spot with a named cause.
 */
export const DATA_LIMITED: Record<string, { evidence: string; tightenTo?: Partial<PerEpoch> }> = {
  Pasiphae: { evidence: 'Outer irregular: solar-perturbed, non-Keplerian over decades. Measured mean rate 0.509427 deg/d against a shipped 0.490182 -- 3.9% slow, so the phase is lost within a few years no matter what the propagator does.' },
  Sinope: { evidence: 'Outer irregular: measured mean rate 0.495559 deg/d against a shipped 0.483484 -- 2.4% slow.' },
  Carme: { evidence: 'Outer irregular: measured mean rate 0.512979 deg/d against a shipped 0.500500 -- 2.4% slow.' },
  Himalia: { evidence: 'Outer irregular: measured mean rate 1.436680 deg/d against a shipped 1.440524 -- 0.27% fast.' }
};

/**
 * A position budget wider than this fraction of the orbit radius cannot see a
 * whole-orbit error, so it must not exist without a named cause. Every row above that
 * crosses this line has an entry in DATA_LIMITED, and the gate asserts it -- otherwise
 * "the budget is loose" quietly becomes "the model is fine".
 */
export const BLIND_BUDGET_FRACTION = 0.5;

/**
 * Budget on total BUDGET UTILISATION: the sum over every moon x epoch row of
 * (errKm / budgetKm).
 *
 * The per-cell budgets are individual limits, so a model could sit just under every
 * one of them everywhere and still be far worse overall than anything correct. This
 * catches that. It is dimensionless on purpose -- summing kilometres across bodies
 * whose orbit radii span 2e4 to 3e7 km would just measure Phoebe.
 *
 * Measured after the fitted-ephemeris/native-frame fix: 50.0 over the 140 rows;
 * the limit of 100 leaves 2x aggregate headroom while still catching broad drift.
 */
export const UTILISATION_BUDGET = 100;

/**
 * |r| is frame- and phase-invariant given a and e, so a fixture row that falls
 * outside the catalog's own [a(1-e), a(1+e)] band indicts the SNAPSHOT -- wrong
 * centre, wrong target, wrong units -- not the propagator under test.
 */
export const RADIAL_BAND_SLACK = 0.05;

/**
 * Wider band for the outer irregular satellites. Their osculating a and e are moved
 * several percent by solar perturbation across the fixture's 26-year span, so the
 * shipped mean elements do not bound the true |r| to 5%. Measured excursion beyond
 * the catalog band over these seven epochs: Sinope 7.03%, Pasiphae 2.87%, Himalia
 * 0.79%, Carme / Phoebe / Nereid 0%. This widens the FIXTURE sanity check only -- it
 * has no effect on the position, plane or drift budgets.
 */
export const RADIAL_BAND_SLACK_OVERRIDE: Record<string, number> = {
  Himalia: 0.15,
  Pasiphae: 0.15,
  Sinope: 0.15,
  Carme: 0.15,
  Phoebe: 0.15,
  Nereid: 0.15
};

export interface MoonTruthState {
  jd: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface MoonTruthBody {
  hid: string;
  center: string;
  horizonsName: string;
  states: MoonTruthState[];
}

export interface MoonPositionEpoch {
  key: EpochKey;
  jd: number;
  label: string;
  why?: string;
}

export interface MoonPositionFixture {
  _source: string;
  _query: string;
  _center: string;
  _frame: string;
  _units: string;
  _targets: string;
  _ephemeris: string;
  _timescale: string;
  _retrieved: string;
  _epoch_rationale: string;
  _epochs: MoonPositionEpoch[];
  bodies: Record<string, MoonTruthBody>;
}

export interface MoonFrameRow {
  name: string;
  frame: string;
  epochKey: EpochKey;
  label: string;
  jd: number;
  /** Days from J2000; negative before. */
  days: number;
  /** |r_model - r_truth| in km. */
  errKm: number;
  /** errKm / |r_truth|; dimensionless, comparable across Charon and Phoebe. */
  rel: number;
  rModelKm: number;
  rTruthKm: number;
  /** Angle between modelled and true position vectors, degrees. */
  sepDeg: number;
  /** Angle between modelled and true orbit normals, degrees. Phase-immune. */
  planeDeg: number;
  /** |v_model - v_truth| in km/s. */
  velocityErrKmS: number;
  positionBudgetKm: number;
  planeBudgetDeg: number;
  velocityBudgetKmS: number;
  positionOk: boolean;
  planeOk: boolean;
  velocityOk: boolean;
  ok: boolean;
  /** Set when the fixture's |r| falls outside the catalog's own radial band. */
  radialWarning: string | null;
}

export interface MoonSummary {
  name: string;
  frame: string;
  /** Worst errKm over all epochs, and where. */
  maxErrKm: number;
  worstEpoch: EpochKey | null;
  /** Worst errKm/positionBudgetKm over all epochs; 1.0 means exactly at budget. */
  worstUtilisation: number;
  /** errKm at J2000, the drift baseline. */
  j2000ErrKm: number;
  /** max over the drift-sample epochs of (errKm - j2000ErrKm); never below 0. */
  driftKm: number;
  driftBudgetKm: number;
  maxPlaneDeg: number;
  maxVelocityErrKmS: number;
  positionOk: boolean;
  planeOk: boolean;
  velocityOk: boolean;
  driftOk: boolean;
  ok: boolean;
  /** Present when this moon's budgets are set by a data defect, not the propagator. */
  dataLimited: string | null;
}

export interface MoonPositionReport {
  rows: MoonFrameRow[];
  summaries: MoonSummary[];
  /** Sum over every row of errKm / positionBudgetKm. */
  utilisation: number;
  utilisationBudget: number;
  utilisationOk: boolean;
  /** Fixture moons absent from the catalog. */
  missing: string[];
  /** Fixture moons present but carrying no budget entry -- they would NOT be gated. */
  ungated: string[];
  radialWarnings: string[];
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
) => boolean;

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
  if (!propagate(orbit, jd - orbit.epochJd, p, v)) {
    throw new RangeError(`moon state is unavailable at JDTDB ${jd}`);
  }
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

/** Compare one catalog moon against its Horizons truth state at one epoch. */
export function compareMoonAtEpoch(
  name: string,
  moon: CatalogBody,
  truth: MoonTruthState,
  epoch: MoonPositionEpoch,
  propagate: PropagateFn
): MoonFrameRow {
  const orbit = moon.orbit;
  if (!orbit || !Number.isFinite(orbit.epochJd)) {
    throw new Error(`${name}: catalog orbit has no finite epochJd`);
  }

  const state = parentRelativeStateKm(propagate, orbit, truth.jd);
  const rTruth: Vec3 = [truth.x, truth.y, truth.z];
  const vTruth: Vec3 = [truth.vx, truth.vy, truth.vz];
  const rTruthKm = mag(rTruth);
  const errKm = mag(sub(state.r, rTruth));
  const velocityErrKmS = mag(sub(state.v, vTruth));

  const positionBudgetKm = POSITION_BUDGET_KM[name]?.[epoch.key] ?? Number.POSITIVE_INFINITY;
  const planeBudgetDeg = PLANE_BUDGET_DEG[name]?.[epoch.key] ?? Number.POSITIVE_INFINITY;
  const velocityBudgetKmS = VELOCITY_BUDGET_KM_S[name]?.[epoch.key] ?? Number.POSITIVE_INFINITY;
  const sepDeg = angleBetweenDeg(state.r, rTruth);
  const planeDeg = angleBetweenDeg(cross(state.r, state.v), cross(rTruth, vTruth));
  const positionOk = errKm <= positionBudgetKm;
  const planeOk = planeDeg <= planeBudgetDeg;
  const velocityOk = velocityErrKmS <= velocityBudgetKmS;

  const aKm = orbit.aAu * AU_KM;
  const e = orbit.e ?? 0;
  const slack = RADIAL_BAND_SLACK_OVERRIDE[name] ?? RADIAL_BAND_SLACK;
  const lo = aKm * (1 - e) * (1 - slack);
  const hi = aKm * (1 + e) * (1 + slack);
  const radialWarning =
    rTruthKm < lo || rTruthKm > hi
      ? `${name} @ ${epoch.key}: fixture |r| = ${rTruthKm.toFixed(0)} km is outside the catalog ` +
        `band [${lo.toFixed(0)}, ${hi.toFixed(0)}] km (a=${aKm.toFixed(0)}, e=${e})`
      : null;

  return {
    name,
    frame: moon.orbitFrameSource ?? 'ecliptic',
    epochKey: epoch.key,
    label: epoch.label,
    jd: truth.jd,
    days: truth.jd - J2000_JD,
    errKm,
    rel: errKm / rTruthKm,
    rModelKm: mag(state.r),
    rTruthKm,
    sepDeg,
    planeDeg,
    velocityErrKmS,
    positionBudgetKm,
    planeBudgetDeg,
    velocityBudgetKmS,
    positionOk,
    planeOk,
    velocityOk,
    ok: positionOk && planeOk && velocityOk,
    radialWarning
  };
}

/** Reduce one moon's per-epoch rows to the gated quantities. */
export function summarizeMoon(name: string, rows: MoonFrameRow[]): MoonSummary {
  const driftBudgetKm = DRIFT_BUDGET_KM[name] ?? Number.POSITIVE_INFINITY;
  let maxErrKm = -Infinity;
  let worstEpoch: EpochKey | null = null;
  let maxPlaneDeg = 0;
  let maxVelocityErrKmS = 0;
  let worstUtilisation = 0;
  for (const row of rows) {
    if (row.errKm > maxErrKm) {
      maxErrKm = row.errKm;
      worstEpoch = row.epochKey;
    }
    maxPlaneDeg = Math.max(maxPlaneDeg, row.planeDeg);
    maxVelocityErrKmS = Math.max(maxVelocityErrKmS, row.velocityErrKmS);
    worstUtilisation = Math.max(worstUtilisation, row.errKm / row.positionBudgetKm);
  }

  const baseline = rows.find((r) => Math.abs(r.days) < DRIFT_EPOCH_MIN_DAYS);
  const j2000ErrKm = baseline ? baseline.errKm : Number.NaN;
  const far = rows.filter((r) => Math.abs(r.days) >= DRIFT_EPOCH_MIN_DAYS);
  const driftKm = baseline
    ? Math.max(0, ...far.map((r) => r.errKm - j2000ErrKm))
    : Number.NaN;

  const positionOk = rows.every((r) => r.positionOk);
  const planeOk = rows.every((r) => r.planeOk);
  const velocityOk = rows.every((r) => r.velocityOk);
  // A fixture with no near-J2000 baseline cannot measure drift; do not fail on NaN.
  const driftOk = !Number.isFinite(driftKm) || driftKm <= driftBudgetKm;

  return {
    name,
    frame: rows[0]?.frame ?? 'ecliptic',
    maxErrKm,
    worstEpoch,
    worstUtilisation,
    j2000ErrKm,
    driftKm,
    driftBudgetKm,
    maxPlaneDeg,
    maxVelocityErrKmS,
    positionOk,
    planeOk,
    velocityOk,
    driftOk,
    ok: positionOk && planeOk && velocityOk && driftOk,
    dataLimited: DATA_LIMITED[name]?.evidence ?? null
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
  '_retrieved',
  '_epoch_rationale'
] as const;
const STATE_FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz'] as const;

/**
 * Structural validation of the committed snapshot. Returns human-readable problems.
 *
 * The single-epoch refusal below is the point of this function, not a detail: the
 * previous fixture was J2000-only, T was identically zero, and the gate could not see
 * a defect that reached 66% of the Moon's orbit radius a year later. Editing the data
 * back down to one epoch must not be a quiet way to reintroduce that.
 */
export function validateFixture(fixture: MoonPositionFixture): string[] {
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
        'distinguish a correct propagator from one that is anchored at the epoch and drifts. ' +
        'Every secular term is identically zero at T = 0.'
    );
    return problems;
  }

  const jds = fixture._epochs.map((e) => e.jd);
  const keys = fixture._epochs.map((e) => e.key);
  for (const epoch of fixture._epochs) {
    if (!Number.isFinite(epoch.jd)) problems.push(`epoch ${epoch.key}: jd is not a finite number`);
    if (typeof epoch.key !== 'string' || !epoch.key) problems.push(`epoch jd=${epoch.jd}: missing key`);
    if (typeof epoch.label !== 'string' || !epoch.label) problems.push(`epoch ${epoch.key}: missing label`);
  }
  if (new Set(jds).size !== jds.length) problems.push('_epochs contains duplicate jd values');
  if (new Set(keys).size !== keys.length) problems.push('_epochs contains duplicate keys');
  if (!jds.some((jd) => Math.abs(jd - J2000_JD) < DRIFT_EPOCH_MIN_DAYS)) {
    problems.push('_epochs has no epoch near J2000 to use as the drift baseline');
  }

  // A ladder of baselines, not a cluster. Both ends matter: without a SHORT baseline
  // the along-track error folds past 180 deg and aliases; without a LONG one the slow
  // precessors (Titan 0.5 deg/yr, Iapetus 0.1 deg/yr) never accumulate anything.
  const spans = jds.map((jd) => Math.abs(jd - J2000_JD)).filter((d) => d >= DRIFT_EPOCH_MIN_DAYS);
  if (!spans.some((d) => d <= 400)) {
    problems.push(
      '_epochs has no drift sample within 400 days of J2000; along-track error folds at ' +
        '180 deg, so a fast precessor can alias and score better when it is more wrong'
    );
  }
  if (!spans.some((d) => d >= 3650)) {
    problems.push('_epochs has no drift sample at least 10 years from J2000; slow precessors accumulate nothing');
  }

  if (!fixture.bodies || typeof fixture.bodies !== 'object') {
    problems.push('missing "bodies" object');
    return problems;
  }
  for (const [name, body] of Object.entries(fixture.bodies)) {
    if (typeof body.hid !== 'string') problems.push(`${name}: missing hid`);
    if (typeof body.center !== 'string') problems.push(`${name}: missing center`);
    if (typeof body.horizonsName !== 'string') problems.push(`${name}: missing horizonsName`);
    if (!Array.isArray(body.states) || body.states.length !== jds.length) {
      problems.push(`${name}: expected ${jds.length} states, got ${body.states?.length}`);
      continue;
    }
    body.states.forEach((state, k) => {
      if (state.jd !== jds[k]) {
        problems.push(`${name}: state ${k} jd ${state.jd} does not match _epochs[${k}].jd ${jds[k]}`);
      }
      for (const field of STATE_FIELDS) {
        if (!Number.isFinite(state[field])) problems.push(`${name}: state ${k} ${field} is not finite`);
      }
    });
  }
  return problems;
}

/** Evaluate every moon in the fixture at every epoch. */
export function evaluateMoonFrames(
  catalog: SolarCatalog,
  propagate: PropagateFn,
  fixture: MoonPositionFixture
): MoonPositionReport {
  const byName = moonsByName(catalog);
  const rows: MoonFrameRow[] = [];
  const summaries: MoonSummary[] = [];
  const missing: string[] = [];
  const ungated: string[] = [];
  let utilisation = 0;

  for (const [name, body] of Object.entries(fixture.bodies)) {
    const moon = byName.get(name);
    if (!moon) {
      missing.push(name);
      continue;
    }
    if (!(name in POSITION_BUDGET_KM) || !(name in PLANE_BUDGET_DEG) || !(name in DRIFT_BUDGET_KM)) {
      ungated.push(name);
    }

    const moonRows = body.states.map((state, k) =>
      compareMoonAtEpoch(name, moon, state, fixture._epochs[k], propagate)
    );
    for (const row of moonRows) utilisation += row.errKm / row.positionBudgetKm;
    rows.push(...moonRows);
    summaries.push(summarizeMoon(name, moonRows));
  }

  // Order by how close each moon is to failing, not by raw kilometres: raw km just
  // sorts by orbit radius and puts Phoebe on top for ever.
  summaries.sort(
    (a, b) =>
      Math.max(b.worstUtilisation, b.driftKm / b.driftBudgetKm) -
      Math.max(a.worstUtilisation, a.driftKm / a.driftBudgetKm)
  );
  return {
    rows,
    summaries,
    utilisation,
    utilisationBudget: UTILISATION_BUDGET,
    utilisationOk: utilisation <= UTILISATION_BUDGET,
    missing,
    ungated,
    radialWarnings: rows.map((r) => r.radialWarning).filter((w): w is string => w !== null)
  };
}
