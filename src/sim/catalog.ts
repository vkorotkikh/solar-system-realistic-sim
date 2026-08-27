import rawMoons from '../data/moons.json';
import { AU_KM, MAJOR_BODY_IDS, clamp, parseEpochDateToJulian, sanitizeIdPart } from '../constants';
import {
  MAJOR_MOON_RADII_KM,
  MOON_ROTATION_PERIOD_HOURS,
  MAJOR_MOON_SHAPE_KM,
  MAJOR_MOONS,
  PLANETS,
  SUN
} from '../data/planets';
import type { KeplerOrbit } from './orbitMath';

export interface RawMoonRecord {
  id: number;
  planet: string;
  name: string;
  iauCode: string;
  ephemeris: string;
  frame: string;
  epochTdb: string;
  aKm: number;
  e: number;
  argPeriapsisDeg: number;
  meanAnomalyDeg: number;
  inclinationDeg: number;
  ascendingNodeDeg: number;
  periodDays: number;
  apsisPrecessionYears: number | null;
  nodePrecessionYears: number | null;
  poleRaDeg: number | null;
  poleDecDeg: number | null;
  poleTiltDeg: number | null;
  reference: string;
}

const moons = rawMoons as readonly RawMoonRecord[];

export interface CatalogBody {
  id: string;
  name: string;
  type: string;
  massKg: number | null;
  radiusKm: number;
  color: string;
  equatorialRadiusKm: number;
  polarRadiusKm: number;
  displayRadiusAu: number;
  realRadiusAu: number;
  parentId: string | null;
  isMajor: boolean;
  rotationPeriodHours: number | null;
  reference?: string;
  orbitFrameSource?: string;
  axialTiltDeg?: number;
  spinAxisLongitudeDeg?: number;
  rotationPhaseDeg?: number;
  orbit: KeplerOrbit | null;
}

export interface SolarCatalog {
  bodies: CatalogBody[];
  jumpBodyIds: string[];
  plannerBodyIds: string[];
}

interface OrbitNormal {
  x: number;
  y: number;
  z: number;
}

interface FrameBasis {
  x: OrbitNormal;
  y: OrbitNormal;
  z: OrbitNormal;
}

const PARENT_TINTS: Record<string, string> = {
  Earth: '#d2d8e3',
  Mars: '#c9b8a7',
  Jupiter: '#cab8a0',
  Saturn: '#cdbf9f',
  Uranus: '#a7c5cb',
  Neptune: '#9eb3d5',
  Pluto: '#b8aca4'
};

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EARTH_OBLIQUITY_DEG = 23.439281;
const PARENT_AXIAL_TILT_DEG: Record<string, number> = Object.fromEntries(
  PLANETS.map((planet) => [planet.id, Math.abs(planet.axialTiltDeg ?? 0)])
);
// JPL publishes satellite elements referred to a body-fixed plane (parent equator or
// local Laplace plane) with the node measured from that plane's ascending node on the
// Earth mean equator of J2000 -- not on the ecliptic. The source frame's x-axis must
// therefore be built from the equatorial pole, expressed here in ecliptic coordinates.
const SOURCE_FRAME_REFERENCE_ECLIPTIC_AXIS: OrbitNormal = {
  x: 0,
  y: Math.sin(EARTH_OBLIQUITY_DEG * DEG_TO_RAD),
  z: Math.cos(EARTH_OBLIQUITY_DEG * DEG_TO_RAD)
};
// Authoritative parent poles for parent-equator moon records that carry no per-moon
// pole (moons.json leaves poleRaDeg/poleDecDeg null for the Uranian and Plutonian
// 'equatorial' entries). PARENT_AXIAL_TILT_DEG alone cannot express these: it drops the
// pole's ecliptic longitude entirely.
//
// The vector must be the parent's ROTATIONAL ANGULAR MOMENTUM, which is what the
// satellite elements are referenced to -- not necessarily the IAU north pole. The IAU
// fixes planetary north by the invariable-plane rule, so for a retrograde rotator like
// Uranus (obliquity 97.77 deg) the IAU pole is anti-parallel to the moons' orbital
// angular momentum and must be negated. Dwarf planets such as Pluto use the right-hand
// rule, so their IAU pole already is the angular momentum direction.
// Keys are catalog body ids (lower case), matching the parentId argument -- see
// planetNameToId in createSolarSystemCatalog.
const PARENT_EQUATOR_POLE_OVERRIDE_ECLIPTIC: Record<string, OrbitNormal> = {
  uranus: negateVector(normalizeVector(equatorialToEcliptic(raDecToEquatorialUnit(257.311, -15.175)))),
  pluto: normalizeVector(equatorialToEcliptic(raDecToEquatorialUnit(132.993, -6.163)))
};

function normalizeDegrees(value: number): number {
  const mod = value % 360;
  return mod < 0 ? mod + 360 : mod;
}

function orbitNormalFromElements(iDeg: number | undefined, ascendingNodeDeg: number | undefined): OrbitNormal {
  const i = (iDeg ?? 0) * DEG_TO_RAD;
  const omega = (ascendingNodeDeg ?? 0) * DEG_TO_RAD;
  const sinI = Math.sin(i);

  // Angular-momentum direction for the Rz(Omega) * Rx(i) * Rz(argPeriapsis) transform
  // that propagateKeplerOrbit actually applies:
  //   h = (sin i sin Omega, -sin i cos Omega, cos i).
  // The previous (-sin Omega sin i, cos Omega sin i, cos i) is Rz(180 deg) of that, so
  // the source plane was tilted the wrong way about the frame node line.
  return {
    x: Math.sin(omega) * sinI,
    y: -Math.cos(omega) * sinI,
    z: Math.cos(i)
  };
}

function vectorMagnitude(vector: OrbitNormal): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalizeVector(vector: OrbitNormal): OrbitNormal {
  const mag = vectorMagnitude(vector);
  if (mag < 1e-12) {
    return { x: 0, y: 0, z: 1 };
  }
  return {
    x: vector.x / mag,
    y: vector.y / mag,
    z: vector.z / mag
  };
}

function negateVector(vector: OrbitNormal): OrbitNormal {
  return { x: -vector.x, y: -vector.y, z: -vector.z };
}

function crossProduct(a: OrbitNormal, b: OrbitNormal): OrbitNormal {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function dotProduct(a: OrbitNormal, b: OrbitNormal): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function rotateVectorAroundX(vector: OrbitNormal, angleDeg: number): OrbitNormal {
  const angle = angleDeg * DEG_TO_RAD;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  return {
    x: vector.x,
    y: vector.y * cosA - vector.z * sinA,
    z: vector.y * sinA + vector.z * cosA
  };
}

function elementsFromOrbitNormal(normal: OrbitNormal): { iDeg: number; ascendingNodeDeg: number } {
  const z = clamp(normal.z, -1, 1);
  const iRad = Math.acos(z);
  // Inverse of orbitNormalFromElements: h.x = sin i sin Omega, h.y = -sin i cos Omega.
  const ascendingNodeRad = Math.atan2(normal.x, -normal.y);
  return {
    iDeg: iRad * RAD_TO_DEG,
    ascendingNodeDeg: normalizeDegrees(ascendingNodeRad * RAD_TO_DEG)
  };
}

function transformSourceVectorToEcliptic(vector: OrbitNormal, basis: FrameBasis): OrbitNormal {
  return {
    x: basis.x.x * vector.x + basis.y.x * vector.y + basis.z.x * vector.z,
    y: basis.x.y * vector.x + basis.y.y * vector.y + basis.z.y * vector.z,
    z: basis.x.z * vector.x + basis.y.z * vector.y + basis.z.z * vector.z
  };
}

function periapsisVectorFromElements(
  inclinationDeg: number | undefined,
  ascendingNodeDeg: number | undefined,
  argPeriapsisDeg: number | undefined
): OrbitNormal {
  const i = (inclinationDeg ?? 0) * DEG_TO_RAD;
  const omega = (ascendingNodeDeg ?? 0) * DEG_TO_RAD;
  const argPeriapsis = (argPeriapsisDeg ?? 0) * DEG_TO_RAD;

  const cosNode = Math.cos(omega);
  const sinNode = Math.sin(omega);
  const cosArg = Math.cos(argPeriapsis);
  const sinArg = Math.sin(argPeriapsis);
  const cosI = Math.cos(i);
  const sinI = Math.sin(i);

  return {
    x: cosNode * cosArg - sinNode * sinArg * cosI,
    y: sinNode * cosArg + cosNode * sinArg * cosI,
    z: sinArg * sinI
  };
}

function basisFromSourcePole(sourcePole: OrbitNormal): FrameBasis {
  // Zero point of the source frame's longitudes: the ascending node of the source plane
  // on the Earth mean equator of J2000, which is where JPL measures the published node.
  let planeXAxis = crossProduct(SOURCE_FRAME_REFERENCE_ECLIPTIC_AXIS, sourcePole);
  if (vectorMagnitude(planeXAxis) < 1e-9) {
    planeXAxis = { x: 1, y: 0, z: 0 };
  } else {
    planeXAxis = normalizeVector(planeXAxis);
  }

  return {
    x: planeXAxis,
    y: normalizeVector(crossProduct(sourcePole, planeXAxis)),
    z: sourcePole
  };
}

function normalizeAngleWithinPlaneDegrees(normal: OrbitNormal, periapsisVector: OrbitNormal): number {
  const nodeVector = crossProduct({ x: 0, y: 0, z: 1 }, normal);
  const nodeMagnitude = vectorMagnitude(nodeVector);
  const projectionScale = dotProduct(periapsisVector, normal);
  const periapsisProjected = normalizeVector({
    x: periapsisVector.x - normal.x * projectionScale,
    y: periapsisVector.y - normal.y * projectionScale,
    z: periapsisVector.z - normal.z * projectionScale
  });

  if (nodeMagnitude < 1e-9) {
    return normalizeDegrees(Math.atan2(periapsisProjected.y, periapsisProjected.x) * RAD_TO_DEG);
  }

  const nodeUnit = normalizeVector(nodeVector);
  const transverseUnit = normalizeVector(crossProduct(normal, nodeUnit));
  return normalizeDegrees(
    Math.atan2(
      dotProduct(periapsisProjected, transverseUnit),
      dotProduct(periapsisProjected, nodeUnit)
    ) * RAD_TO_DEG
  );
}

function raDecToEquatorialUnit(raDeg: number | null | undefined, decDeg: number | null | undefined): OrbitNormal {
  const ra = (raDeg ?? 0) * DEG_TO_RAD;
  const dec = (decDeg ?? 0) * DEG_TO_RAD;
  const cosDec = Math.cos(dec);
  return {
    x: cosDec * Math.cos(ra),
    y: cosDec * Math.sin(ra),
    z: Math.sin(dec)
  };
}

function equatorialToEcliptic(vectorEq: OrbitNormal): OrbitNormal {
  const obliquity = EARTH_OBLIQUITY_DEG * DEG_TO_RAD;
  const cosOb = Math.cos(obliquity);
  const sinOb = Math.sin(obliquity);
  return {
    x: vectorEq.x,
    y: cosOb * vectorEq.y + sinOb * vectorEq.z,
    z: -sinOb * vectorEq.y + cosOb * vectorEq.z
  };
}

function sourcePoleInEcliptic(
  moon: Pick<RawMoonRecord, 'poleRaDeg' | 'poleDecDeg' | 'poleTiltDeg'>,
  parentId: string,
  sourceFrame: string
): OrbitNormal {
  if (Number.isFinite(moon.poleRaDeg) && Number.isFinite(moon.poleDecDeg)) {
    const poleEq = raDecToEquatorialUnit(moon.poleRaDeg, moon.poleDecDeg);
    return normalizeVector(equatorialToEcliptic(poleEq));
  }

  // No per-moon pole. Prefer an authoritative parent pole when we have one; the axial
  // tilt fallback below knows only the tilt magnitude, not the pole's longitude.
  // Every Laplace record in moons.json carries an explicit pole, so only parent-equator
  // records reach here today; the Laplace branch is left exactly as it was so that the
  // per-moon Laplace tilt is never silently dropped.
  const parentPoleOverride = PARENT_EQUATOR_POLE_OVERRIDE_ECLIPTIC[parentId];
  if (parentPoleOverride && sourceFrame !== 'laplace') {
    return parentPoleOverride;
  }

  const parentTilt = PARENT_AXIAL_TILT_DEG[parentId] ?? 0;
  const laplaceTilt = Number.isFinite(moon.poleTiltDeg) ? (moon.poleTiltDeg as number) : 0;
  const frameTiltDeg = sourceFrame === 'laplace'
    ? parentTilt + laplaceTilt
    : parentTilt;
  return normalizeVector(rotateVectorAroundX({ x: 0, y: 0, z: 1 }, frameTiltDeg));
}

export function convertMoonOrbitFrameToEcliptic(
  moon: Pick<
    RawMoonRecord,
    'planet' | 'frame' | 'inclinationDeg' | 'ascendingNodeDeg' | 'argPeriapsisDeg' | 'poleRaDeg' | 'poleDecDeg' | 'poleTiltDeg'
  >,
  parentId: string
): { iDeg: number; ascendingNodeDeg: number; argPeriapsisDeg: number; sourceFrame: string } {
  const sourceFrame = `${moon.frame ?? ''}`.trim().toLowerCase();
  if (sourceFrame === 'ecliptic' || sourceFrame.length === 0) {
    return {
      iDeg: moon.inclinationDeg,
      ascendingNodeDeg: normalizeDegrees(moon.ascendingNodeDeg ?? 0),
      argPeriapsisDeg: normalizeDegrees(moon.argPeriapsisDeg ?? 0),
      sourceFrame: sourceFrame || 'ecliptic'
    };
  }

  const sourcePole = sourcePoleInEcliptic(moon, parentId, sourceFrame);
  const basis = basisFromSourcePole(sourcePole);
  const sourceNormal = orbitNormalFromElements(moon.inclinationDeg, moon.ascendingNodeDeg);
  const sourcePeriapsis = periapsisVectorFromElements(moon.inclinationDeg, moon.ascendingNodeDeg, moon.argPeriapsisDeg);
  const eclipticNormal = normalizeVector(transformSourceVectorToEcliptic(sourceNormal, basis));
  const eclipticPeriapsis = normalizeVector(transformSourceVectorToEcliptic(sourcePeriapsis, basis));
  const resolvedElements = elementsFromOrbitNormal(eclipticNormal);

  return {
    iDeg: resolvedElements.iDeg,
    ascendingNodeDeg: resolvedElements.ascendingNodeDeg,
    argPeriapsisDeg: normalizeAngleWithinPlaneDegrees(eclipticNormal, eclipticPeriapsis),
    sourceFrame
  };
}

const JULIAN_CENTURY_DAYS = 36_525;

/**
 * Largest precession rate, as a fraction of the satellite's own mean motion, accepted from the
 * source table.
 *
 * The JPL satellite table describes "the elements of a precessing ellipse which has been fit in a
 * least squares sense to the numerically integrated orbit". That model means nothing unless the
 * ellipse precesses SLOWLY compared with the satellite's own orbital motion; a record claiming the
 * apsides turn once per orbit is not describing a precessing ellipse, it is corrupt. The precession
 * columns are published in years rounded to three decimals, so an entry of a few thousandths of a
 * year is quantisation noise, not a measurement.
 *
 * Four records in src/data/moons.json are corrupt in exactly that way: Tethys, Calypso and Telesto
 * carry apsisPrecessionYears = 0.005 (1.8 d, against a 1.888 d orbit) and Methone carries 0.003
 * (1.1 d, against a 1.010 d orbit). All four come from SAT441, whose periods are sidereal, so they
 * take the apsidal correction; left in place they would drive dM/dt = 2*pi/periodDays - varpidot
 * NEGATIVE, reversing those moons and inverting their velocity vectors. Horizons confirms the
 * records are wrong rather than merely extreme: over 60 revolutions the measured <dL/dt> for all
 * four matches 2*pi/periodDays to <= 1.1e-4 relative, so their true apsidal contribution to the
 * mean longitude is nothing like the tabulated one.
 *
 * The threshold sits in an empty band. Over all 806 precession entries the four corrupt ones score
 * 0.92-1.03 and the largest legitimate one (Setebos, both columns) scores 0.126, so 0.25 clears the
 * real data by 2.0x and the corrupt data by 3.7x. Rejecting a column leaves that element
 * unprecessed, which is what the propagator did for every moon before secular rates existed.
 */
const MAX_PRECESSION_RATE_FRACTION_OF_MEAN_MOTION = 0.25;

/**
 * Source ephemerides whose `periodDays` column is the SIDEREAL period, i.e. the period of the mean
 * LONGITUDE, so that 2*pi/periodDays is dL/dt and the apsidal invariant in orbitMath.ts applies.
 *
 * This has to be measured, not assumed. The table at ssd.jpl.nasa.gov/sats/elem/ documents the
 * column as "P  sidereal period", but it aggregates independent mean-element fits by different
 * authors and they do not all honour that: several groups tabulate the ANOMALISTIC period, the
 * period of the mean anomaly, for which 2*pi/periodDays is already dM/dt and subtracting varpidot
 * would inject the same double-count with the sign reversed.
 *
 * Each verdict below was measured against JPL Horizons: osculating elements parent-relative in the
 * ecliptic frame over 60-400 revolutions, least-squares slope of the unwrapped mean longitude
 * L = MA + W + OM, compared against 360/periodDays and against 360/periodDays + varpidot. Only
 * records whose two candidate residuals differ by more than 3x were counted. The split is clean:
 * 39 high-confidence verdicts, and not one ephemeris contains both answers.
 *
 *   ephemeris     verdict       high-confidence evidence (discrimination ratio)
 *   DE405/LE405   SIDEREAL      Moon 687x
 *   SAT441        SIDEREAL      Mimas 191x, Enceladus 406x, Tethys 1.6e5x, Dione 1867x,
 *                               Rhea 78x, Titan 1044x, Hyperion 37x, Iapetus 10x,
 *                               Calypso 1.8e4x, Telesto 9.2e4x, Methone 6951x
 *   URA182        SIDEREAL      Miranda 26x, Ariel 246x, Umbriel 364x, Titania 758x,
 *                               Oberon 154x, Puck 255x
 *   URA184        SIDEREAL      Ophelia 22x, Desdemona 10x, Juliet 94x, Portia 13x,
 *                               Rosalind 3.9x, Belinda 4.3x, Mab 6.7x
 *   PLU060        SIDEREAL      Kerberos 190x, Hydra 89x
 *   ---- excluded: measured ANOMALISTIC, 2*pi/periodDays is already dM/dt ----
 *   JUP365        ANOMALISTIC   Ganymede 1187x, Callisto 4253x, Amalthea 353x, Thebe (0.00)
 *   SAT415        ANOMALISTIC   Atlas, Prometheus, Pandora, Janus 47x, Epimetheus, Anthe, Pallene
 *   NEP097        ANOMALISTIC   Naiad, Thalassa, Larissa, Hippocamp
 *   JUP347        ANOMALISTIC   Kalyke, Erinome, Eukelade, +11 more, all leaning the same way
 *   SAT455/6/7    ANOMALISTIC   7 probes, all leaning the same way
 *   ---- excluded: undecidable, tabulated period too coarse or fit too noisy ----
 *   MAR099, URA117, NEP104, NEP105
 *
 * An unlisted ephemeris gets no correction, which is the previous behaviour exactly: a new or
 * renamed source degrades to the status quo instead of silently acquiring an unverified model.
 * Extending this set REQUIRES re-running that measurement for the new source.
 */
const SIDEREAL_PERIOD_EPHEMERIDES: ReadonlySet<string> = new Set([
  'DE405/LE405',
  'SAT441',
  'URA182',
  'URA184',
  'PLU060'
]);

function precessionRateDegreesPerCentury(
  periodYears: number | null,
  directionSign: number,
  orbitalPeriodDays: number | undefined
): number | undefined {
  if (!Number.isFinite(periodYears)) {
    return undefined;
  }

  const years = Number(periodYears);
  if (years === 0) {
    return 0;
  }

  const rateDegPerCentury = directionSign * (36_000 / years);

  // With no usable orbital period there is no way to judge plausibility; keep the published rate.
  if (Number.isFinite(orbitalPeriodDays) && (orbitalPeriodDays as number) > 0) {
    const meanMotionDegPerDay = 360 / (orbitalPeriodDays as number);
    const rateDegPerDay = Math.abs(rateDegPerCentury) / JULIAN_CENTURY_DAYS;
    if (rateDegPerDay > MAX_PRECESSION_RATE_FRACTION_OF_MEAN_MOTION * meanMotionDegPerDay) {
      return undefined;
    }
  }

  return rateDegPerCentury;
}

export function resolveMoonSecularRates(
  moon: Pick<RawMoonRecord, 'apsisPrecessionYears' | 'nodePrecessionYears'> &
    Partial<Pick<RawMoonRecord, 'periodDays' | 'ephemeris'>>
): KeplerOrbit['secularRates'] | undefined {
  const argRate = precessionRateDegreesPerCentury(moon.apsisPrecessionYears, 1, moon.periodDays);
  const nodeRate = precessionRateDegreesPerCentury(moon.nodePrecessionYears, -1, moon.periodDays);

  if (argRate === undefined && nodeRate === undefined) {
    return undefined;
  }

  const rates: NonNullable<KeplerOrbit['secularRates']> = {
    argPeriapsisDegPerCentury: argRate,
    ascendingNodeDegPerCentury: nodeRate
  };

  // Only opt in where the source table was MEASURED to publish a mean-longitude period. Everything
  // else keeps 2*pi/periodDays as dM/dt, unchanged.
  if (moon.ephemeris !== undefined && SIDEREAL_PERIOD_EPHEMERIDES.has(moon.ephemeris)) {
    rates.periodIsMeanLongitudePeriod = true;
  }

  return rates;
}

export function resolveMoonRotationPeriodHours(
  moon: Pick<RawMoonRecord, 'name' | 'periodDays'>
): number | null {
  const explicit = (MOON_ROTATION_PERIOD_HOURS as Record<string, number | undefined>)[moon.name];
  if (Number.isFinite(explicit)) {
    return explicit ?? null;
  }

  if (!MAJOR_MOONS.has(moon.name) || !Number.isFinite(moon.periodDays) || moon.periodDays <= 0) {
    return null;
  }

  const rotationHours = moon.periodDays * 24;
  return moon.name === 'Triton' ? -rotationHours : rotationHours;
}

function normalizeMoonOrbitFrame(
  moon: RawMoonRecord,
  parentId: string
): { iDeg: number; ascendingNodeDeg: number; argPeriapsisDeg: number; sourceFrame: string } {
  // JPL moon elements are not consistently published in one frame.
  // Convert equatorial/Laplace entries into ecliptic elements using source pole orientation.
  return convertMoonOrbitFrameToEcliptic(moon, parentId);
}

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function estimateMoonRadiusKm(moon: RawMoonRecord): number {
  const knownRadius = (MAJOR_MOON_RADII_KM as Record<string, number | undefined>)[moon.name];
  if (knownRadius) {
    return knownRadius;
  }

  const hash = stableHash(`${moon.planet}:${moon.name}`);
  const parentScale: Record<string, [number, number]> = {
    Earth: [5, 15],
    Mars: [3, 20],
    Jupiter: [2, 45],
    Saturn: [2, 35],
    Uranus: [2, 30],
    Neptune: [2, 28],
    Pluto: [2, 20]
  };

  const [min, max] = parentScale[moon.planet] ?? [2, 25];
  const normalized = (hash % 10_000) / 10_000;
  const base = min + (max - min) * normalized;

  // Distant irregular moons tend to be small; taper with semimajor axis.
  const distanceFactor = Math.max(0.25, 1 / Math.sqrt(Math.max(1, moon.aKm / 400_000)));
  return Math.max(1.5, base * distanceFactor);
}

function displayRadiusAu(radiusKm: number, type: string): number {
  if (type === 'star') {
    return Math.sqrt(radiusKm) * 0.00045;
  }

  if (type === 'planet' || type === 'dwarf') {
    return Math.max(0.008, Math.sqrt(radiusKm) * 0.00042);
  }

  if (type === 'asteroid') {
    return Math.max(0.005, Math.sqrt(radiusKm) * 0.00035);
  }

  return Math.max(0.00055, Math.sqrt(radiusKm) * 0.00018);
}

function moonColor(planet: string): string {
  return PARENT_TINTS[planet] ?? '#c5c5c5';
}

function makeMoonId(moon: RawMoonRecord, usedIds: Set<string>): string {
  const baseId = `moon-${sanitizeIdPart(moon.planet)}-${sanitizeIdPart(moon.name)}`;
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId);
    return baseId;
  }

  let suffix = 2;
  while (usedIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  const id = `${baseId}-${suffix}`;
  usedIds.add(id);
  return id;
}

function applyDisplayScaleConstraints(bodies: CatalogBody[]): void {
  const minMoonOrbitByParent = new Map();

  for (const body of bodies) {
    if (body.type !== 'moon' || !body.orbit || !Number.isFinite(body.orbit.aAu)) {
      continue;
    }

    // Keep moons smaller than their parent-relative orbit scale so they remain distinct objects.
    const moonMaxRadius = body.orbit.aAu * 0.18;
    const moonMinRadius = body.realRadiusAu * 2.5;
    body.displayRadiusAu = Math.max(moonMinRadius, Math.min(body.displayRadiusAu, moonMaxRadius));

    const parentId = body.parentId;
    const currentMin = minMoonOrbitByParent.get(parentId);
    if (currentMin === undefined || body.orbit.aAu < currentMin) {
      minMoonOrbitByParent.set(parentId, body.orbit.aAu);
    }
  }

  for (const body of bodies) {
    const closestMoonOrbit = minMoonOrbitByParent.get(body.id);
    if (closestMoonOrbit === undefined) {
      continue;
    }

    // Prevent inflated planet radii from swallowing inner moons in display mode.
    const parentMaxRadius = closestMoonOrbit * 0.65;
    const parentMinRadius = body.realRadiusAu * 1.1;
    body.displayRadiusAu = Math.max(parentMinRadius, Math.min(body.displayRadiusAu, parentMaxRadius));
  }
}

export function createSolarSystemCatalog(): SolarCatalog {
  const usedIds = new Set<string>();
  const bodies: CatalogBody[] = [];

  const sunBody = {
    ...SUN,
    parentId: null,
    isMajor: true,
    equatorialRadiusKm: SUN.radiusKm,
    polarRadiusKm: SUN.radiusKm,
    displayRadiusAu: displayRadiusAu(SUN.radiusKm, SUN.type),
    realRadiusAu: SUN.radiusKm / AU_KM,
    orbit: null
  };

  usedIds.add(sunBody.id);
  bodies.push(sunBody);

  for (const planet of PLANETS) {
    const equatorialRadiusKm = Number.isFinite((planet as Record<string, unknown>).equatorialRadiusKm)
      ? (planet as Record<string, unknown>).equatorialRadiusKm as number
      : planet.radiusKm;
    const polarRadiusKm = Number.isFinite((planet as Record<string, unknown>).polarRadiusKm)
      ? (planet as Record<string, unknown>).polarRadiusKm as number
      : planet.radiusKm;
    usedIds.add(planet.id);
    bodies.push({
      ...planet,
      parentId: 'sun',
      isMajor: true,
      equatorialRadiusKm,
      polarRadiusKm,
      displayRadiusAu: displayRadiusAu(planet.radiusKm, planet.type),
      realRadiusAu: planet.radiusKm / AU_KM,
      orbit: {
        ...planet.orbit,
        epochJd: planet.orbit.epochJd
      }
    });
  }

  const planetNameToId = new Map([
    ['Earth', 'earth'],
    ['Mars', 'mars'],
    ['Jupiter', 'jupiter'],
    ['Saturn', 'saturn'],
    ['Uranus', 'uranus'],
    ['Neptune', 'neptune'],
    ['Pluto', 'pluto']
  ]);

  for (const moon of moons) {
    const parentId = planetNameToId.get(moon.planet);
    if (!parentId) {
      continue;
    }

    const radiusKm = estimateMoonRadiusKm(moon);
    const moonShape = (MAJOR_MOON_SHAPE_KM as Record<string, { equatorialRadiusKm: number; polarRadiusKm: number } | undefined>)[moon.name];
    const equatorialRadiusKm = Number.isFinite(moonShape?.equatorialRadiusKm) ? moonShape!.equatorialRadiusKm : radiusKm;
    const polarRadiusKm = Number.isFinite(moonShape?.polarRadiusKm) ? moonShape!.polarRadiusKm : radiusKm;
    const id = makeMoonId(moon, usedIds);
    const frameNormalized = normalizeMoonOrbitFrame(moon, parentId);

    bodies.push({
      id,
      name: moon.name,
      type: 'moon',
      parentId,
      massKg: null,
      radiusKm,
      equatorialRadiusKm,
      polarRadiusKm,
      displayRadiusAu: displayRadiusAu(radiusKm, 'moon'),
      realRadiusAu: radiusKm / AU_KM,
      color: moonColor(moon.planet),
      isMajor: MAJOR_MOONS.has(moon.name),
      rotationPeriodHours: resolveMoonRotationPeriodHours(moon),
      reference: moon.reference,
      orbitFrameSource: frameNormalized.sourceFrame,
      orbit: {
        epochJd: parseEpochDateToJulian(moon.epochTdb),
        aAu: moon.aKm / AU_KM,
        e: moon.e,
        iDeg: frameNormalized.iDeg,
        ascendingNodeDeg: frameNormalized.ascendingNodeDeg,
        argPeriapsisDeg: frameNormalized.argPeriapsisDeg,
        meanAnomalyDeg: moon.meanAnomalyDeg,
        periodDays: moon.periodDays,
        secularRates: resolveMoonSecularRates(moon)
      }
    });
  }

  applyDisplayScaleConstraints(bodies);

  const jumpBodyIds = [
    ...MAJOR_BODY_IDS,
    ...bodies
      .filter((body) => body.type === 'moon' && body.isMajor)
      .map((body) => body.id)
      .sort((a, b) => a.localeCompare(b))
  ];

  const plannerBodyIds = bodies
    .filter((body) => body.parentId === 'sun' && body.id !== 'sun' && body.type !== 'star')
    .sort((a, b) => {
      const aOrbit = a.orbit?.aAu ?? Number.POSITIVE_INFINITY;
      const bOrbit = b.orbit?.aAu ?? Number.POSITIVE_INFINITY;
      return aOrbit - bOrbit;
    })
    .map((body) => body.id);

  return {
    bodies,
    jumpBodyIds,
    plannerBodyIds
  };
}
