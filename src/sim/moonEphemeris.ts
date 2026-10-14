/**
 * Compact parent-relative moon ephemerides derived from JPL Horizons/SPK states.
 *
 * The generated model interpolates osculating geometry rather than Cartesian
 * coordinates.  That distinction matters for short-period moons: a daily Cartesian
 * table aliases several revolutions of Cordelia, while an unwrapped mean longitude
 * preserves the revolution count exactly.  The remaining eight quantities vary
 * slowly and are represented by piecewise Chebyshev polynomials.
 *
 * Coordinate contract:
 *   - time: JDTDB
 *   - position/velocity: geometric, parent-relative
 *   - orientation: ecliptic J2000 / ICRF
 *   - generated units: km, km/s, degrees, days
 *   - public propagator units: AU, AU/day
 */

const AU_KM = 149_597_870.7;
const DAY_SECONDS = 86_400;
const DEG_TO_RAD = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const VELOCITY_DIFFERENCE_STEP_DAYS = 1e-4;

export const MOON_EPHEMERIS_FEATURE_COUNT = 9;

export interface MoonEphemerisSegment {
  startJd: number;
  endJd: number;
  /**
   * Chebyshev coefficients, ordered by feature:
   *   aKm, hx, hy, hz, ex, ey, ez, meanLongitudeResidualDeg,
   *   osculatingMeanMotionDegPerDay.
   */
  coefficients: number[][];
}

export interface MoonEphemerisProvenance {
  source: string;
  sourceEphemeris: string;
  targetId: string;
  centerId: string;
  frame: 'ECLIPJ2000';
  timeScale: 'TDB';
  generatedAt: string;
  generator: string;
  query: string;
}

export interface MoonChebyshevEphemeris {
  kind: 'horizons-chebyshev-elements-v1' | 'horizons-chebyshev-cartesian-v1';
  coverageStartJd: number;
  coverageEndJd: number;
  meanLongitudeBaseDeg: number;
  meanLongitudeRateDegPerDay: number;
  /** Cartesian Fourier carrier: 0 is a direct XYZ polynomial; n adds n cos/sin pairs. */
  carrierHarmonics?: number;
  /** Spacing of the source-element grid; also the continuity blend width. */
  sourceStepDays: number;
  segments: MoonEphemerisSegment[];
  provenance: MoonEphemerisProvenance;
}

export interface MoonEphemerisErrorStats {
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface GeneratedMoonChebyshevEphemeris extends MoonChebyshevEphemeris {
  sourceRowsSha256: string;
  heldOutRowsSha256: string;
  validation: {
    sampleCount: number;
    heldOutSampleCount: number;
    coverageEndpointSampleCount: number;
    coverageEndpointErrors: Array<{
      jdTdb: number;
      positionErrorKm: number;
      velocityErrorMPerS: number;
    }>;
    accuracyLimits: {
      positionKm: number;
      velocityMPerS: number;
    };
    positionErrorKm: MoonEphemerisErrorStats;
    velocityErrorMPerS: MoonEphemerisErrorStats;
    boundaryContinuity: {
      runtimeStateContinuous: boolean;
    };
  };
}

export interface MoonEphemerisArtifact {
  schemaVersion: 1 | 2;
  kind: 'horizons-chebyshev-elements-v1' | 'horizons-chebyshev-mixed-v2';
  coverageTimeScale: 'TDB';
  referenceFrame: string;
  featureOrder: string[];
  bodies: Record<string, GeneratedMoonChebyshevEphemeris>;
}

export type MoonEphemerisCoverage = 'covered' | 'before-coverage' | 'after-coverage';

interface MutableVector3 {
  set(x: number, y: number, z: number): unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireFiniteNumber(
  record: Record<string, unknown>,
  field: string,
  context: string
): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${context}.${field} must be a finite number`);
  }
  return value;
}

/**
 * Validate the generated JSON at the code/data boundary.
 *
 * JSON imports are otherwise `any`-shaped at runtime. A truncated coefficient
 * table must fail explicitly instead of silently dropping to the approximate
 * mean-element path for just one date or body.
 */
export function parseMoonEphemerisArtifact(value: unknown): MoonEphemerisArtifact {
  if (!isRecord(value)) throw new Error('moon ephemeris artifact must be an object');
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) throw new Error('unsupported moon ephemeris schemaVersion');
  if (!((value.schemaVersion === 1 && value.kind === 'horizons-chebyshev-elements-v1') ||
        (value.schemaVersion === 2 && value.kind === 'horizons-chebyshev-mixed-v2'))) {
    throw new Error('unsupported moon ephemeris artifact kind');
  }
  if (value.coverageTimeScale !== 'TDB') {
    throw new Error('moon ephemeris coverageTimeScale must be TDB');
  }
  if (typeof value.referenceFrame !== 'string' || !value.referenceFrame.includes('J2000')) {
    throw new Error('moon ephemeris referenceFrame must identify J2000');
  }
  const expectedFeatures = [
    'aKm',
    'hx',
    'hy',
    'hz',
    'ex',
    'ey',
    'ez',
    'meanLongitudeResidualDeg',
    'meanMotionDegPerDay'
  ];
  if (
    !Array.isArray(value.featureOrder) ||
    value.featureOrder.length !== expectedFeatures.length ||
    value.featureOrder.some((feature, index) => feature !== expectedFeatures[index])
  ) {
    throw new Error('moon ephemeris featureOrder does not match the runtime schema');
  }
  if (!isRecord(value.bodies) || Object.keys(value.bodies).length === 0) {
    throw new Error('moon ephemeris artifact contains no bodies');
  }

  for (const [bodyId, untypedBody] of Object.entries(value.bodies)) {
    const context = `moon ephemeris body ${bodyId}`;
    if (bodyId !== bodyId.toLowerCase() || !isRecord(untypedBody)) {
      throw new Error(`${context} must be keyed by a lower-case id and contain an object`);
    }
    const cartesian = untypedBody.kind === 'horizons-chebyshev-cartesian-v1';
    if (untypedBody.kind !== 'horizons-chebyshev-elements-v1' && !(value.schemaVersion === 2 && cartesian)) {
      throw new Error(`${context}.kind is inconsistent`);
    }
    const harmonics = cartesian ? requireFiniteNumber(untypedBody, 'carrierHarmonics', context) : 0;
    if (!Number.isInteger(harmonics) || harmonics < 0 || harmonics > 4) {
      throw new Error(`${context}.carrierHarmonics is invalid`);
    }
    const featureCount = cartesian ? 3 * (1 + 2 * harmonics) : MOON_EPHEMERIS_FEATURE_COUNT;
    const coverageStartJd = requireFiniteNumber(untypedBody, 'coverageStartJd', context);
    const coverageEndJd = requireFiniteNumber(untypedBody, 'coverageEndJd', context);
    const sourceStepDays = requireFiniteNumber(untypedBody, 'sourceStepDays', context);
    requireFiniteNumber(untypedBody, 'meanLongitudeBaseDeg', context);
    requireFiniteNumber(untypedBody, 'meanLongitudeRateDegPerDay', context);
    if (!(coverageEndJd > coverageStartJd) || !(sourceStepDays > 0)) {
      throw new Error(`${context} has invalid coverage or source spacing`);
    }

    if (!isRecord(untypedBody.provenance)) throw new Error(`${context}.provenance is missing`);
    const provenance = untypedBody.provenance;
    for (const field of ['source', 'sourceEphemeris', 'targetId', 'centerId', 'generatedAt', 'generator', 'query']) {
      if (typeof provenance[field] !== 'string' || provenance[field].length === 0) {
        throw new Error(`${context}.provenance.${field} must be a non-empty string`);
      }
    }
    if (provenance.frame !== 'ECLIPJ2000' || provenance.timeScale !== 'TDB') {
      throw new Error(`${context} has an incompatible frame or time scale`);
    }

    for (const hashField of ['sourceRowsSha256', 'heldOutRowsSha256']) {
      if (typeof untypedBody[hashField] !== 'string' || !/^[0-9a-f]{64}$/.test(untypedBody[hashField])) {
        throw new Error(`${context}.${hashField} must be a SHA-256 digest`);
      }
    }
    if (!isRecord(untypedBody.validation)) throw new Error(`${context}.validation is missing`);
    const validation = untypedBody.validation;
    const sampleCount = requireFiniteNumber(validation, 'sampleCount', `${context}.validation`);
    const heldOutSampleCount = requireFiniteNumber(
      validation,
      'heldOutSampleCount',
      `${context}.validation`
    );
    const endpointSampleCount = requireFiniteNumber(
      validation,
      'coverageEndpointSampleCount',
      `${context}.validation`
    );
    if (
      !Number.isInteger(sampleCount) ||
      !Number.isInteger(heldOutSampleCount) ||
      endpointSampleCount !== 2 ||
      sampleCount !== heldOutSampleCount + endpointSampleCount
    ) {
      throw new Error(`${context}.validation sample counts are inconsistent`);
    }
    if (
      !Array.isArray(validation.coverageEndpointErrors) ||
      validation.coverageEndpointErrors.length !== endpointSampleCount
    ) {
      throw new Error(`${context}.validation must include both coverage endpoints`);
    }
    const endpointJds: number[] = [];
    for (const [endpointIndex, untypedEndpoint] of validation.coverageEndpointErrors.entries()) {
      const endpointContext = `${context}.validation.coverageEndpointErrors[${endpointIndex}]`;
      if (!isRecord(untypedEndpoint)) throw new Error(`${endpointContext} must be an object`);
      endpointJds.push(requireFiniteNumber(untypedEndpoint, 'jdTdb', endpointContext));
      requireFiniteNumber(untypedEndpoint, 'positionErrorKm', endpointContext);
      requireFiniteNumber(untypedEndpoint, 'velocityErrorMPerS', endpointContext);
    }
    endpointJds.sort((left, right) => left - right);
    if (
      Math.abs(endpointJds[0] - coverageStartJd) > 1e-9 ||
      Math.abs(endpointJds[1] - coverageEndJd) > 1e-9
    ) {
      throw new Error(`${context}.validation endpoints do not match declared coverage`);
    }
    if (!isRecord(validation.accuracyLimits)) {
      throw new Error(`${context}.validation.accuracyLimits is missing`);
    }
    const positionLimit = requireFiniteNumber(
      validation.accuracyLimits,
      'positionKm',
      `${context}.validation.accuracyLimits`
    );
    const velocityLimit = requireFiniteNumber(
      validation.accuracyLimits,
      'velocityMPerS',
      `${context}.validation.accuracyLimits`
    );
    const maximumByStatsField: Record<string, number> = {};
    for (const statsField of ['positionErrorKm', 'velocityErrorMPerS']) {
      const stats = validation[statsField];
      if (!isRecord(stats)) throw new Error(`${context}.validation.${statsField} is missing`);
      for (const percentile of ['p50', 'p95', 'p99', 'max']) {
        const statistic = requireFiniteNumber(
          stats,
          percentile,
          `${context}.validation.${statsField}`
        );
        if (percentile === 'max') maximumByStatsField[statsField] = statistic;
      }
    }
    if (
      maximumByStatsField.positionErrorKm > positionLimit ||
      maximumByStatsField.velocityErrorMPerS > velocityLimit
    ) {
      throw new Error(`${context}.validation exceeds its declared accuracy limit`);
    }
    if (
      !isRecord(validation.boundaryContinuity) ||
      validation.boundaryContinuity.runtimeStateContinuous !== true
    ) {
      throw new Error(`${context}.validation does not certify runtime state continuity`);
    }

    if (!Array.isArray(untypedBody.segments) || untypedBody.segments.length === 0) {
      throw new Error(`${context}.segments must be non-empty`);
    }
    let expectedStart = coverageStartJd;
    for (let segmentIndex = 0; segmentIndex < untypedBody.segments.length; segmentIndex += 1) {
      const untypedSegment = untypedBody.segments[segmentIndex];
      const segmentContext = `${context}.segments[${segmentIndex}]`;
      if (!isRecord(untypedSegment)) throw new Error(`${segmentContext} must be an object`);
      const startJd = requireFiniteNumber(untypedSegment, 'startJd', segmentContext);
      const endJd = requireFiniteNumber(untypedSegment, 'endJd', segmentContext);
      if (Math.abs(startJd - expectedStart) > 1e-9 || !(endJd > startJd)) {
        throw new Error(`${segmentContext} is non-contiguous or has a non-positive span`);
      }
      expectedStart = endJd;
      if (
        !Array.isArray(untypedSegment.coefficients) ||
        untypedSegment.coefficients.length !== featureCount
      ) {
        throw new Error(`${segmentContext} must contain ${featureCount} coefficient series`);
      }
      for (const [featureIndex, coefficients] of untypedSegment.coefficients.entries()) {
        if (
          !Array.isArray(coefficients) ||
          coefficients.length === 0 ||
          coefficients.some((coefficient) => typeof coefficient !== 'number' || !Number.isFinite(coefficient))
        ) {
          throw new Error(`${segmentContext}.coefficients[${featureIndex}] is invalid`);
        }
      }
    }
    if (Math.abs(expectedStart - coverageEndJd) > 1e-9) {
      throw new Error(`${context}.segments do not cover the declared end date`);
    }
  }

  return value as unknown as MoonEphemerisArtifact;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeRadians(value: number): number {
  const reduced = value % TWO_PI;
  return reduced < 0 ? reduced + TWO_PI : reduced;
}

/** Evaluate a Chebyshev series with the stable Clenshaw recurrence. */
export function evaluateChebyshev(coefficients: readonly number[], x: number): number {
  let bKPlusOne = 0;
  let bKPlusTwo = 0;
  for (let k = coefficients.length - 1; k >= 1; k -= 1) {
    const bK = 2 * x * bKPlusOne - bKPlusTwo + coefficients[k];
    bKPlusTwo = bKPlusOne;
    bKPlusOne = bK;
  }
  return (coefficients[0] ?? 0) + x * bKPlusOne - bKPlusTwo;
}

export function moonEphemerisCoverageAt(
  ephemeris: MoonChebyshevEphemeris,
  jd: number
): MoonEphemerisCoverage {
  if (jd < ephemeris.coverageStartJd) return 'before-coverage';
  if (jd > ephemeris.coverageEndJd) return 'after-coverage';
  return 'covered';
}

function segmentIndexAt(
  ephemeris: MoonChebyshevEphemeris,
  jd: number
): number {
  if (moonEphemerisCoverageAt(ephemeris, jd) !== 'covered') return -1;

  // Generated segments share their endpoint. Select the segment on the RIGHT
  // at an internal boundary (and the final segment at coverageEnd) so evaluation
  // agrees exactly with the generator's floor-based held-out validator.
  let low = 0;
  let high = ephemeris.segments.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (ephemeris.segments[middle].startJd <= jd) low = middle + 1;
    else high = middle;
  }
  const index = Math.min(Math.max(low - 1, 0), ephemeris.segments.length - 1);
  const segment = ephemeris.segments[index];
  return segment && jd >= segment.startJd && jd <= segment.endJd ? index : -1;
}

function evaluateSegmentFeatures(segment: MoonEphemerisSegment, jd: number): number[] | null {
  if (segment.coefficients.length !== MOON_EPHEMERIS_FEATURE_COUNT) return null;
  const halfSpan = (segment.endJd - segment.startJd) / 2;
  if (!(halfSpan > 0)) return null;
  const midpoint = (segment.startJd + segment.endJd) / 2;
  const x = (jd - midpoint) / halfSpan;
  const values = segment.coefficients.map((series) => evaluateChebyshev(series, x));
  return values.every(Number.isFinite) ? values : null;
}

function smoothStep(value: number): number {
  const unit = clamp(value, 0, 1);
  return unit * unit * (3 - 2 * unit);
}

/**
 * Evaluate fitted features with a narrow smooth cross-fade at every segment
 * boundary. Independent least-squares segments differ by a few kilometres at a
 * shared endpoint; blending over one source-grid interval makes both position and
 * velocity continuous without masking the measured approximation error.
 */
function featuresAt(ephemeris: MoonChebyshevEphemeris, jd: number): number[] | null {
  const index = segmentIndexAt(ephemeris, jd);
  if (index < 0) return null;
  const segment = ephemeris.segments[index];
  const base = evaluateSegmentFeatures(segment, jd);
  if (!base) return null;

  const halfBlend = Math.max(0, ephemeris.sourceStepDays / 2);
  let left: MoonEphemerisSegment | null = null;
  let right: MoonEphemerisSegment | null = null;
  let boundary = 0;
  if (halfBlend > 0 && index > 0 && jd < segment.startJd + halfBlend) {
    left = ephemeris.segments[index - 1];
    right = segment;
    boundary = segment.startJd;
  } else if (
    halfBlend > 0 &&
    index + 1 < ephemeris.segments.length &&
    jd > segment.endJd - halfBlend
  ) {
    left = segment;
    right = ephemeris.segments[index + 1];
    boundary = segment.endJd;
  }
  if (!left || !right) return base;

  const leftValues = evaluateSegmentFeatures(left, jd);
  const rightValues = evaluateSegmentFeatures(right, jd);
  if (!leftValues || !rightValues) return null;
  const weight = smoothStep((jd - (boundary - halfBlend)) / (2 * halfBlend));
  return leftValues.map((value, featureIndex) =>
    value + (rightValues[featureIndex] - value) * weight
  );
}

function solveKepler(meanAnomalyRad: number, eccentricity: number): number {
  let eccentricAnomaly = eccentricity < 0.8 ? meanAnomalyRad : Math.PI;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const sine = Math.sin(eccentricAnomaly);
    const cosine = Math.cos(eccentricAnomaly);
    const delta =
      (eccentricAnomaly - eccentricity * sine - meanAnomalyRad) /
      (1 - eccentricity * cosine);
    eccentricAnomaly -= delta;
    if (Math.abs(delta) < 1e-13) break;
  }
  return eccentricAnomaly;
}

/**
 * Evaluate an in-coverage ephemeris state.
 *
 * Returns false outside the declared coverage or for malformed generated data;
 * callers may then use their explicitly approximate mean-element fallback. It never
 * extrapolates the fitted coefficients silently.
 */
export function propagateMoonEphemeris(
  ephemeris: MoonChebyshevEphemeris,
  jd: number,
  outPosition: MutableVector3,
  outVelocity: MutableVector3 | null = null
): boolean {
  if (ephemeris.kind === 'horizons-chebyshev-cartesian-v1') {
    return propagateCartesianEphemeris(ephemeris, jd, outPosition, outVelocity);
  }
  const feature = featuresAt(ephemeris, jd);
  if (!feature) return false;

  const aKm = feature[0];
  let hx = feature[1];
  let hy = feature[2];
  let hz = feature[3];
  const hMagnitude = Math.hypot(hx, hy, hz);
  if (!(aKm > 0) || !(hMagnitude > 1e-12)) return false;
  hx /= hMagnitude;
  hy /= hMagnitude;
  hz /= hMagnitude;

  // Numerical fitting can leave a tiny component of e along h. Project it out so
  // periapsis is rigorously in the instantaneous osculating plane.
  let ex = feature[4];
  let ey = feature[5];
  let ez = feature[6];
  const parallelE = ex * hx + ey * hy + ez * hz;
  ex -= parallelE * hx;
  ey -= parallelE * hy;
  ez -= parallelE * hz;
  const eccentricity = Math.hypot(ex, ey, ez);
  if (!(eccentricity >= 0 && eccentricity < 1)) return false;

  // Recover the argument of periapsis from the fitted normal/eccentricity vectors.
  const sinInclination = Math.hypot(hx, hy);
  const ascendingNodeRad = sinInclination > 1e-12 ? Math.atan2(hx, -hy) : 0;
  const nodeX = Math.cos(ascendingNodeRad);
  const nodeY = Math.sin(ascendingNodeRad);
  const transverseX = -hz * nodeY;
  const transverseY = hz * nodeX;
  const transverseZ = hx * nodeY - hy * nodeX;
  // Circular osculating states have no physical periapsis. Use the ascending
  // node as the gauge direction; mean longitude retains the physical phase.
  const px = eccentricity > 1e-12 ? ex / eccentricity : nodeX;
  const py = eccentricity > 1e-12 ? ey / eccentricity : nodeY;
  const pz = eccentricity > 1e-12 ? ez / eccentricity : 0;
  const argPeriapsisRad = eccentricity > 1e-12
    ? Math.atan2(
        px * transverseX + py * transverseY + pz * transverseZ,
        px * nodeX + py * nodeY
      )
    : 0;
  // q = h x p completes the right-handed perifocal basis.
  const qx = hy * pz - hz * py;
  const qy = hz * px - hx * pz;
  const qz = hx * py - hy * px;

  const meanLongitudeDeg =
    ephemeris.meanLongitudeBaseDeg +
    ephemeris.meanLongitudeRateDegPerDay * (jd - ephemeris.coverageStartJd) +
    feature[7];
  const meanAnomalyRad = normalizeRadians(
    meanLongitudeDeg * DEG_TO_RAD - ascendingNodeRad - argPeriapsisRad
  );
  const eccentricAnomaly = solveKepler(meanAnomalyRad, eccentricity);
  const cosineE = Math.cos(eccentricAnomaly);
  const sineE = Math.sin(eccentricAnomaly);
  const sqrtOneMinusESquared = Math.sqrt(1 - eccentricity * eccentricity);

  const xPerifocalKm = aKm * (cosineE - eccentricity);
  const yPerifocalKm = aKm * sqrtOneMinusESquared * sineE;
  const positionAu = [
    (xPerifocalKm * px + yPerifocalKm * qx) / AU_KM,
    (xPerifocalKm * py + yPerifocalKm * qy) / AU_KM,
    (xPerifocalKm * pz + yPerifocalKm * qz) / AU_KM
  ] as const;
  let velocityAuPerDay: readonly [number, number, number] | null = null;
  if (outVelocity) {
    // Differentiate the fitted position trajectory itself. Reconstructing velocity
    // from the instantaneous osculating mean motion would approximate Horizons,
    // but it would not be d(position)/dt once the time-varying element features are
    // interpolated. This symmetric derivative keeps the public state kinematically
    // coherent; one-sided differences are used only at the two coverage endpoints.
    const beforeJd = Math.max(ephemeris.coverageStartJd, jd - VELOCITY_DIFFERENCE_STEP_DAYS);
    const afterJd = Math.min(ephemeris.coverageEndJd, jd + VELOCITY_DIFFERENCE_STEP_DAYS);
    const before = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) {
      this.x = x; this.y = y; this.z = z;
    } };
    const after = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) {
      this.x = x; this.y = y; this.z = z;
    } };
    if (
      afterJd <= beforeJd ||
      !propagateMoonEphemeris(ephemeris, beforeJd, before, null) ||
      !propagateMoonEphemeris(ephemeris, afterJd, after, null)
    ) {
      return false;
    }
    const inverseStep = 1 / (afterJd - beforeJd);
    velocityAuPerDay = [
      (after.x - before.x) * inverseStep,
      (after.y - before.y) * inverseStep,
      (after.z - before.z) * inverseStep
    ];
  }

  // Commit both outputs only after the complete requested state has succeeded.
  // Callers can therefore treat false as unavailable without accidentally
  // retaining a new position paired with an old velocity.
  outPosition.set(...positionAu);
  if (outVelocity && velocityAuPerDay) outVelocity.set(...velocityAuPerDay);
  return true;
}

/** True only when the fitted path can actually produce a finite state at jd. */
export function canPropagateMoonEphemeris(
  ephemeris: MoonChebyshevEphemeris,
  jd: number
): boolean {
  const positionSink: MutableVector3 = { set: () => undefined };
  const velocitySink: MutableVector3 = { set: () => undefined };
  return propagateMoonEphemeris(ephemeris, jd, positionSink, velocitySink);
}

/** Convert the public AU/day velocity contract to km/s in diagnostics. */
export function auPerDayToKmPerSecond(value: number): number {
  return (value * AU_KM) / DAY_SECONDS;
}

/** Cartesian fits avoid cancellation between rapidly varying osculating elements.
 * Coefficients are grouped XYZ for [1, cos(phi), sin(phi), cos(2phi), ...].
 * Both the polynomial amplitude and phase carrier are differentiated analytically.
 */
function cartesianSegmentState(
  ephemeris: MoonChebyshevEphemeris, segment: MoonEphemerisSegment, jd: number
): { p: number[]; v: number[] } | null {
  const harmonics = ephemeris.carrierHarmonics ?? 0;
  if (!Number.isInteger(harmonics) || harmonics < 0 || harmonics > 4 ||
      segment.coefficients.length !== 3 * (1 + 2 * harmonics)) return null;
  const span = segment.endJd - segment.startJd;
  if (!(span > 0)) return null;
  const x = 2 * (jd - segment.startJd) / span - 1;
  const omega = ephemeris.meanLongitudeRateDegPerDay * DEG_TO_RAD;
  const phase = normalizeRadians((ephemeris.meanLongitudeBaseDeg +
    ephemeris.meanLongitudeRateDegPerDay * (jd - ephemeris.coverageStartJd)) * DEG_TO_RAD);
  const carriers = [1];
  const carrierRates = [0];
  for (let k = 1; k <= harmonics; k++) {
    carriers.push(Math.cos(k * phase), Math.sin(k * phase));
    carrierRates.push(-k * omega * Math.sin(k * phase), k * omega * Math.cos(k * phase));
  }
  const p = [0, 0, 0];
  const v = [0, 0, 0];
  for (let feature = 0; feature < segment.coefficients.length; feature++) {
    const c = segment.coefficients[feature];
    if (!c.length) return null;
    // Simultaneous Chebyshev recurrence for T_n and dT_n/dx.
    let t0 = 1, t1 = x, d0 = 0, d1 = 1;
    let amplitude = c[0], derivative = 0;
    for (let k = 1; k < c.length; k++) {
      amplitude += c[k] * t1;
      derivative += c[k] * d1;
      const t2 = 2 * x * t1 - t0;
      const d2 = 2 * t1 + 2 * x * d1 - d0;
      t0 = t1; t1 = t2; d0 = d1; d1 = d2;
    }
    const axis = feature % 3;
    const carrier = Math.floor(feature / 3);
    p[axis] += amplitude * carriers[carrier];
    v[axis] += derivative * (2 / span) * carriers[carrier] + amplitude * carrierRates[carrier];
  }
  return [...p, ...v].every(Number.isFinite) ? { p, v } : null;
}

function propagateCartesianEphemeris(
  ephemeris: MoonChebyshevEphemeris, jd: number,
  outPosition: MutableVector3, outVelocity: MutableVector3 | null
): boolean {
  const index = segmentIndexAt(ephemeris, jd);
  if (index < 0) return false;
  const segment = ephemeris.segments[index];
  let state = cartesianSegmentState(ephemeris, segment, jd);
  if (!state) return false;
  const half = ephemeris.sourceStepDays / 2;
  let left = -1;
  if (half > 0 && index > 0 && jd < segment.startJd + half) left = index - 1;
  else if (half > 0 && index + 1 < ephemeris.segments.length && jd > segment.endJd - half) left = index;
  if (left >= 0) {
    const boundary = ephemeris.segments[left].endJd;
    const a = cartesianSegmentState(ephemeris, ephemeris.segments[left], jd);
    const b = cartesianSegmentState(ephemeris, ephemeris.segments[left + 1], jd);
    if (!a || !b) return false;
    const u = clamp((jd - boundary + half) / (2 * half), 0, 1);
    const w = u * u * (3 - 2 * u);
    const dw = 6 * u * (1 - u) / (2 * half);
    state = {
      p: a.p.map((value, axis) => value + w * (b.p[axis] - value)),
      v: a.v.map((value, axis) => value + w * (b.v[axis] - value) + dw * (b.p[axis] - a.p[axis]))
    };
  }
  if (![...state.p, ...state.v].every(Number.isFinite)) return false;
  outPosition.set(state.p[0] / AU_KM, state.p[1] / AU_KM, state.p[2] / AU_KM);
  outVelocity?.set(state.v[0] / AU_KM, state.v[1] / AU_KM, state.v[2] / AU_KM);
  return true;
}
