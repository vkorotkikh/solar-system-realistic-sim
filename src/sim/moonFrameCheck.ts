/**
 * Shared logic for the moon frame + position accuracy gate.
 *
 * TWO defect classes live under this file, and they need different instruments.
 *
 *  1. FRAME. `catalog.ts` converts satellite elements from their source frame
 *     (`laplace`, `equatorial`) into the ecliptic frame `propagateKeplerOrbit`
 *     expects. A sign or node-referencing error there is invisible in the UI today
 *     because moons are not rendered, but it silently corrupts every non-ecliptic
 *     moon's position -- historically by up to two orbital radii. The phase-immune
 *     PLANE ANGLE is what pins this.
 *
 *  2. SECULAR RATES. `resolveMoonSecularRates` hands 421 of the 424 moons an
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
 * So this gate now checks SEVEN epochs, and asserts three things per moon:
 *   - a POSITION budget in km, per moon PER EPOCH;
 *   - a PLANE-ANGLE budget in degrees, per moon per epoch (phase-immune, so it still
 *     bites on moons whose position budget must be loose for data reasons);
 *   - a DRIFT budget in km: max over the non-J2000 epochs of (err - err_J2000). This
 *     cancels the element set's own J2000 offset, which is what makes Titan, Iapetus
 *     and Phoebe -- whose shipped phase is wrong by 2-4 orbit radii AT the epoch --
 *     gateable at all. Their absolute budget has to be ~4 r; their drift budget is
 *     ~0.01 r, a 300x sharper instrument on the same rows.
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
 * MEASURED, not guessed. Reference = this propagator with the double-count removed
 * (mean anomaly advanced at 2*pi/periodDays - varpidot), scored against this same
 * fixture. Each cell is 2x that reference's error at that moon and epoch, floored at
 * 0.5% of the orbit radius so no cell is tighter than the element sets can support,
 * and rounded up to two significant figures.
 *
 * The reference is a scratch build, not shipped code -- it exists to answer "what
 * does a CORRECT propagator achieve on this data", which is the only defensible way
 * to size a budget. Sizing them against what the current code happens to produce
 * would bless whatever is wrong with it.
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
  Titania:   { j2000: 2.2e3, p30d: 2.2e3, p180d: 2.6e3, p1y: 6.3e3, p5y: 2.6e4, y2025: 1.1e5, y2026: 1.3e5 },
  Charon:    { j2000: 9.8e1, p30d: 9.8e1, p180d: 9.8e1, p1y: 9.8e1, p5y: 9.8e1, y2025: 9.8e1, y2026: 9.8e1 },
  Callisto:  { j2000: 9.6e3, p30d: 9.5e3, p180d: 2.6e4, p1y: 5.0e4, p5y: 2.3e5, y2025: 1.2e6, y2026: 1.2e6 },
  Nereid:    { j2000: 6.3e4, p30d: 7.3e4, p180d: 2.3e5, p1y: 6.5e4, p5y: 7.2e4, y2025: 2.2e5, y2026: 2.4e5 },
  Triton:    { j2000: 5.1e4, p30d: 5.2e4, p180d: 5.8e4, p1y: 6.5e4, p5y: 1.4e5, y2025: 5.0e5, y2026: 4.6e5 },
  Miranda:   { j2000: 5.0e3, p30d: 1.5e4, p180d: 5.5e4, p1y: 1.2e5, p5y: 4.7e5, y2025: 4.4e5, y2026: 3.0e5 },
  Himalia:   { j2000: 6.9e5, p30d: 8.8e5, p180d: 1.9e6, p1y: 5.1e5, p5y: 2.1e6, y2025: 9.3e6, y2026: 2.2e7 },

  // -- data-limited rows: see DATA_LIMITED --
  Io:        { j2000: 2.2e3, p30d: 3.3e5, p180d: 1.6e6, p1y: 1.2e6, p5y: 1.2e6, y2025: 1.2e6, y2026: 1.7e6 },
  Europa:    { j2000: 3.4e3, p30d: 5.3e5, p180d: 2.5e6, p1y: 2.0e6, p5y: 1.9e6, y2025: 1.9e6, y2026: 2.7e6 },
  Ganymede:  { j2000: 5.4e3, p30d: 6.7e3, p180d: 4.9e4, p1y: 1.1e5, p5y: 5.0e5, y2025: 2.4e6, y2026: 2.5e6 },
  Titan:     { j2000: 4.8e6, p30d: 4.8e6, p180d: 4.9e6, p1y: 4.8e6, p5y: 4.8e6, y2025: 4.8e6, y2026: 4.8e6 },
  Iapetus:   { j2000: 1.4e7, p30d: 1.4e7, p180d: 1.4e7, p1y: 1.4e7, p5y: 1.4e7, y2025: 1.4e7, y2026: 1.4e7 },
  Phoebe:    { j2000: 4.8e7, p30d: 4.9e7, p180d: 5.2e7, p1y: 5.3e7, p5y: 5.2e7, y2025: 4.7e7, y2026: 4.8e7 },
  Cordelia:  { j2000: 1.8e5, p30d: 1.3e5, p180d: 1.9e5, p1y: 1.5e5, p5y: 9.2e4, y2025: 1.9e4, y2026: 1.7e5 },
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
  Titan:     { j2000: 0.6, p30d: 0.6, p180d: 0.5, p1y: 0.5, p5y: 1.9, y2025: 11.5, y2026: 12.0 },
  Iapetus:   { j2000: 3.2, p30d: 3.2, p180d: 3.2, p1y: 3.2, p5y: 3.1, y2025: 2.9, y2026: 2.9 },
  Phoebe:    { j2000: 8.0, p30d: 8.0, p180d: 8.0, p1y: 8.1, p5y: 8.7, y2025: 12.0, y2026: 12.3 },
  Charon:    { j2000: 0.5, p30d: 0.5, p180d: 0.5, p1y: 0.5, p5y: 0.5, y2025: 0.5, y2026: 0.5 },
  Ariel:     { j2000: 0.5, p30d: 0.5, p180d: 0.5, p1y: 0.5, p5y: 0.5, y2025: 0.5, y2026: 0.5 },
  Nereid:    { j2000: 0.5, p30d: 0.5, p180d: 0.5, p1y: 0.5, p5y: 0.5, y2025: 0.5, y2026: 0.5 },
  Himalia:   { j2000: 3.7, p30d: 3.7, p180d: 4.2, p1y: 4.3, p5y: 2.8, y2025: 4.6, y2026: 3.6 },

  // Uranian and Neptunian moons: nodePrecessionYears is a rate about the PARENT's
  // pole, but resolveMoonSecularRates applies it to the ECLIPTIC node. Uranus is
  // tipped 98 deg, so for its moons the two are nearly orthogonal and the modelled
  // node precession rotates the orbit in the wrong plane entirely. Measured: Titania
  // drifts 5.6 deg by 2026 (its whole 21.9 deg/century node rate), Miranda 152 deg
  // (its whole 2024 deg/century rate), Triton 25.7 deg. Ariel scores 0.02 deg at
  // every epoch -- and Ariel is the one Uranian moon with nodePrecessionYears = 0.
  // That is the control: the error IS the misapplied node rate. Pinned per epoch so
  // the gate still holds the plane tight at the epochs where the rate has not yet
  // accumulated. Fix by precessing the node in the source frame, then tighten.
  Titania:   { j2000: 0.5, p30d: 0.5, p180d: 0.5, p1y: 0.5, p5y: 2.1, y2025: 10.8, y2026: 11.2 },
  Triton:    { j2000: 1.1, p30d: 0.9, p180d: 0.5, p1y: 1.0, p5y: 9.1, y2025: 49.5, y2026: 51.5 },
  Miranda:   { j2000: 0.5, p30d: 3.4, p180d: 20.0, p1y: 40.1, p5y: 180, y2025: 180, y2026: 180 },

  // Cordelia's record is epoch 2025-01-01 with nodePrecessionYears = 0.6, i.e. the
  // node completes a circuit every 7 months. At J2000 that is a 25-year backward
  // extrapolation, ~42 full circuits, and the plane orientation is arbitrary: 117.7
  // deg off at J2000, 161.0 at +30 d. Only the y2025 column evaluates it at its own
  // epoch, and there it scores 0.02 deg -- so that one column is gated tight and the
  // rest are pinned at 180. The y2026 column is deliberately NOT tightened: one year
  // on, the plane is 118 deg off, which says the tabulated 0.6-yr node period is
  // itself ~20% wrong. Pinning at 180 rather than at the measured 118 avoids
  // freezing a number that has no physical meaning.
  Cordelia:  { j2000: 180, p30d: 180, p180d: 180, p1y: 180, p5y: 180, y2025: 0.5, y2026: 180 },

  // Outer irregular satellites carried as ecliptic elements: low-precision published
  // element sets, strongly solar-perturbed, and not well described by a fixed Kepler
  // ellipse over decades. Their planes reconstruct several degrees off even with
  // correct frame code, and the error grows with baseline.
  Pasiphae:  { j2000: 16.5, p30d: 15.9, p180d: 17.3, p1y: 21.4, p5y: 39.0, y2025: 101.9, y2026: 98.8 },
  Sinope:    { j2000: 10.4, p30d: 10.8, p180d: 8.6, p1y: 10.5, p5y: 25.1, y2025: 84.0, y2026: 85.4 },
  Carme:     { j2000: 0.5, p30d: 1.3, p180d: 4.5, p1y: 7.0, p5y: 19.0, y2025: 60.4, y2026: 61.7 }
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
 * The absolute budget conflates two errors: the element set's own offset at the epoch
 * (Titan is already 2.39e6 km off at J2000 with perfectly correct propagation -- that
 * is the shipped elements, not the code) and the propagator's time-dependent error.
 * Subtracting the J2000 error cancels the first. What is left is ~0 for any propagator
 * that advances the elements at the right rates and grows without bound for one that
 * does not.
 *
 * It is what makes the phase-broken moons testable: Titan's absolute budget must be
 * 4.8e6 km (3.8 orbit radii, blind), but its drift budget is 8.8e4 km (0.07 radii).
 *
 * Note for the two moons whose records are not epoch-J2000 (Cordelia 2025-01-01,
 * Nereid 2020-01-01): "drift from J2000" still cancels a constant offset and is still
 * a valid rate check, but J2000 is a 25-year and 20-year backward extrapolation for
 * them rather than a zero-baseline anchor.
 */
export const DRIFT_BUDGET_KM: Record<string, number> = {
  Moon: 3.0e4,
  Io: 1.7e6,
  Europa: 2.7e6,
  Ganymede: 2.5e6,
  Callisto: 1.2e6,
  Enceladus: 7.1e3,
  Titan: 8.8e4,
  Iapetus: 1.3e5,
  Phoebe: 4.4e6,
  Triton: 4.5e5,
  Charon: 9.8e1,
  Cordelia: 1.1e4,
  Miranda: 4.6e5,
  Ariel: 9.6e2,
  Titania: 1.3e5,
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
  Io: {
    evidence:
      'periodDays = 1.762732 d is not Io\'s sidereal period. Measured from Horizons over ' +
      '2000-2026, Io\'s mean sidereal rate is 203.488959 deg/d (P = 1.769138 d); the shipped ' +
      'value implies 204.228436 deg/d, i.e. n_sidereal + varpidot to 4 significant figures. ' +
      'So 2*pi/periodDays is NEITHER dL/dt nor dM/dt, and Io drifts ~270 deg/yr even with the ' +
      'double-count removed. Io is therefore NOT a witness for the mean-anomaly defect: the ' +
      'current tip is 8.41e5 km off at +1 yr and a correct propagator on this data is 5.96e5 km ' +
      'off -- a 1.4x difference that no honest budget can separate.',
    tightenTo: { j2000: 2.2e3, p30d: 3.1e3, p180d: 7.8e3, p1y: 9.7e3, p5y: 8.3e3, y2025: 1.6e4, y2026: 2.6e3 }
  },
  Europa: {
    evidence:
      'Same defect as Io. periodDays = 3.525463 d implies 102.114247 deg/d against a measured ' +
      'sidereal 101.374726 deg/d (P = 3.551181 d) -- 0.72% fast.',
    tightenTo: { j2000: 3.4e3, p30d: 1.6e4, p180d: 2.6e4, p1y: 3.5e4, p5y: 5.7e4, y2025: 5.3e4, y2026: 3.7e4 }
  },
  Ganymede: {
    evidence:
      'periodDays = 7.155588 d is the ANOMALISTIC period, not the sidereal one: measured ' +
      'sidereal rate 50.317604 deg/d, and 360/(50.317604 - varpidot) = 7.1555886 d reproduces ' +
      'the shipped value to 7 digits. The legacy double-count is therefore accidentally CORRECT ' +
      'for Ganymede, and removing it makes Ganymede 32x WORSE (3.68e4 km -> 1.17e6 km at 2025). ' +
      'These budgets are wide enough to admit both. Fix periodDays to 7.154554 d and tighten.',
    tightenTo: { j2000: 5.4e3, p30d: 5.4e3, p180d: 5.4e3, p1y: 5.4e3, p5y: 1.8e4, y2025: 7.4e4, y2026: 7.0e4 }
  },
  Callisto: {
    evidence:
      'Same as Ganymede: periodDays = 16.690440 d equals 360/(21.571071 - varpidot) = 16.6904409 d, ' +
      'the anomalistic period. Removing the double-count makes Callisto 35x worse at 2025. Fix ' +
      'periodDays to 16.689019 d and tighten.',
    tightenTo: { j2000: 9.6e3, p30d: 9.5e3, p180d: 9.5e3, p1y: 9.5e3, p5y: 9.5e3, y2025: 3.2e4, y2026: 1.2e4 }
  },
  Titan: {
    evidence:
      'Known moons.json phase defect (correct orbit plane, wrong mean anomaly): 2.39e6 km, ' +
      '1.9 orbit radii, already AT J2000 where every secular term is zero. The absolute budget ' +
      'can only be loose; DRIFT_BUDGET_KM.Titan = 8.8e4 is the sharp instrument on these rows.'
  },
  Iapetus: {
    evidence: 'Known moons.json phase defect: 6.75e6 km (1.8 orbit radii) at J2000. Gated by drift.'
  },
  Phoebe: {
    evidence:
      'Known moons.json phase defect: 2.38e7 km (2.0 orbit radii) at J2000, plus a 550.30 d ' +
      'periodDays against a measured 548.93 d. Gated by drift.'
  },
  Cordelia: {
    evidence:
      'Epoch-2025 record evaluated mostly at J2000 (a 25-year backward extrapolation), and ' +
      'periodDays = 0.3347 d against a measured 0.335036 d -- 1.08 deg/d, so the phase wraps ' +
      'within days at any baseline. Only the y2025 column, at its own epoch, is meaningful; ' +
      'that column is gated at 1.9e4 km and 0.5 deg.'
  },
  Triton: {
    evidence:
      'Two independent data problems. (1) periodDays = 5.876994 d implies 61.255805 deg/d ' +
      'against a measured mean sidereal 61.258550 deg/d (P = 5.876731 d) -- the same ' +
      'n_sidereal + varpidot convention error as Io, though only 0.004% here. (2) Triton\'s ' +
      'ecliptic inclination is 130.2 deg and nodePrecessionYears = 340.379 is a rate about ' +
      "NEPTUNE's pole, which orbitMath.ts applies to the ECLIPTIC node; the plane is 25.7 deg " +
      'off by 2026 and the y2025/y2026 position budgets are 1.4 and 1.3 orbit radii.'
  },
  Miranda: {
    evidence:
      'Ecliptic-frame node precession (see PLANE_BUDGET_DEG): the plane is 134.7 deg off by ' +
      '2025, so position error saturates at 2 r and the p5y/y2025/y2026 budgets are 2.3-3.6 ' +
      'orbit radii, i.e. blind. The plane budget is the honest check for Miranda.'
  },
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
 * Measured: the correct-propagator reference totals 64.1 over the 140 rows; the
 * budget is 1.5x that; the current tip totals 790.5.
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
  positionBudgetKm: number;
  planeBudgetDeg: number;
  positionOk: boolean;
  planeOk: boolean;
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
  positionOk: boolean;
  planeOk: boolean;
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

  const positionBudgetKm = POSITION_BUDGET_KM[name]?.[epoch.key] ?? Number.POSITIVE_INFINITY;
  const planeBudgetDeg = PLANE_BUDGET_DEG[name]?.[epoch.key] ?? Number.POSITIVE_INFINITY;
  const sepDeg = angleBetweenDeg(state.r, rTruth);
  const planeDeg = angleBetweenDeg(cross(state.r, state.v), cross(rTruth, vTruth));
  const positionOk = errKm <= positionBudgetKm;
  const planeOk = planeDeg <= planeBudgetDeg;

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
    positionBudgetKm,
    planeBudgetDeg,
    positionOk,
    planeOk,
    ok: positionOk && planeOk,
    radialWarning
  };
}

/** Reduce one moon's per-epoch rows to the gated quantities. */
export function summarizeMoon(name: string, rows: MoonFrameRow[]): MoonSummary {
  const driftBudgetKm = DRIFT_BUDGET_KM[name] ?? Number.POSITIVE_INFINITY;
  let maxErrKm = -Infinity;
  let worstEpoch: EpochKey | null = null;
  let maxPlaneDeg = 0;
  let worstUtilisation = 0;
  for (const row of rows) {
    if (row.errKm > maxErrKm) {
      maxErrKm = row.errKm;
      worstEpoch = row.epochKey;
    }
    maxPlaneDeg = Math.max(maxPlaneDeg, row.planeDeg);
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
    positionOk,
    planeOk,
    driftOk,
    ok: positionOk && planeOk && driftOk,
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
