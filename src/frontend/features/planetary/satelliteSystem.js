import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3
} from 'three';
import { AU_KM, J2000_JD, julianDateFromUnixMs } from '../../../constants.js';

const TWO_PI = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;
const DAY_SECONDS = 86_400;

const EARTH_MU_KM3_S2 = 398_600.4418;
const EARTH_J2 = 1.08262668e-3;
const EARTH_EQUATORIAL_RADIUS_KM = 6_378.137;
const EARTH_OBLIQUITY_RAD = 23.439291111 * DEG_TO_RAD;
const COS_OBLIQUITY = Math.cos(EARTH_OBLIQUITY_RAD);
const SIN_OBLIQUITY = Math.sin(EARTH_OBLIQUITY_RAD);

const SAT_TLE_SOURCES = {
  stations: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
  geo: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=geo&FORMAT=tle'
};

function normalizeRadians(angle) {
  const wrapped = angle % TWO_PI;
  return wrapped >= 0 ? wrapped : wrapped + TWO_PI;
}

function solveKepler(meanAnomalyRad, eccentricity, tolerance = 1e-9, maxIterations = 24) {
  const e = Math.max(0, Math.min(0.999999, eccentricity));
  let eccentricAnomaly = e < 0.8 ? meanAnomalyRad : Math.PI;

  for (let i = 0; i < maxIterations; i += 1) {
    const f = eccentricAnomaly - e * Math.sin(eccentricAnomaly) - meanAnomalyRad;
    const fp = 1 - e * Math.cos(eccentricAnomaly);
    const delta = f / fp;
    eccentricAnomaly -= delta;
    if (Math.abs(delta) < tolerance) break;
  }

  return eccentricAnomaly;
}

function tleEpochToJulian(epochYearTwoDigits, dayOfYearFloat) {
  const twoDigitYear = Number(epochYearTwoDigits);
  const year = twoDigitYear >= 57 ? 1900 + twoDigitYear : 2000 + twoDigitYear;
  const dayWhole = Math.floor(dayOfYearFloat);
  const dayFraction = dayOfYearFloat - dayWhole;
  const startMs = Date.UTC(year, 0, 1, 0, 0, 0, 0);
  const unixMs = startMs + (dayWhole - 1 + dayFraction) * DAY_SECONDS * 1_000;
  return julianDateFromUnixMs(unixMs);
}

function sanitizeId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function parseTleElements(name, line1, line2, category) {
  const epochYear = Number(line1.slice(18, 20));
  const epochDay = Number(line1.slice(20, 32));
  const iDeg = Number(line2.slice(8, 16));
  const raanDeg = Number(line2.slice(17, 25));
  const e = Number(`0.${line2.slice(26, 33).trim()}`);
  const argPerigeeDeg = Number(line2.slice(34, 42));
  const meanAnomalyDeg = Number(line2.slice(43, 51));
  const meanMotionRevDay = Number(line2.slice(52, 63));

  if (
    !Number.isFinite(epochYear)
    || !Number.isFinite(epochDay)
    || !Number.isFinite(iDeg)
    || !Number.isFinite(raanDeg)
    || !Number.isFinite(e)
    || !Number.isFinite(argPerigeeDeg)
    || !Number.isFinite(meanAnomalyDeg)
    || !Number.isFinite(meanMotionRevDay)
    || meanMotionRevDay <= 0
  ) {
    return null;
  }

  const meanMotionRadSec = (meanMotionRevDay * TWO_PI) / DAY_SECONDS;
  const aKm = Math.cbrt(EARTH_MU_KM3_S2 / (meanMotionRadSec * meanMotionRadSec));

  return {
    id: `sat-${sanitizeId(name)}`,
    name,
    category,
    epochJd: tleEpochToJulian(epochYear, epochDay),
    aKm,
    e,
    iRad: iDeg * DEG_TO_RAD,
    raanRad: raanDeg * DEG_TO_RAD,
    argPeriapsisRad: argPerigeeDeg * DEG_TO_RAD,
    meanAnomalyRad: meanAnomalyDeg * DEG_TO_RAD,
    meanMotionRevDay,
    meanMotionRadSec
  };
}

function parseTleBlock(tleText, category) {
  const lines = tleText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const satellites = [];

  for (let i = 0; i < lines.length - 2; i += 1) {
    let name = lines[i];
    let line1 = lines[i + 1];
    let line2 = lines[i + 2];

    if (lines[i].startsWith('1 ') && lines[i + 1]?.startsWith('2 ')) {
      line1 = lines[i];
      line2 = lines[i + 1];
      name = `Satellite ${satellites.length + 1}`;
      i += 1;
    }

    if (!line1?.startsWith('1 ') || !line2?.startsWith('2 ')) {
      continue;
    }

    const parsed = parseTleElements(name, line1, line2, category);
    if (parsed) {
      satellites.push(parsed);
    }

    i += 2;
  }

  return satellites;
}

function eciToEcliptic(xEq, yEq, zEq, out) {
  const y = COS_OBLIQUITY * yEq + SIN_OBLIQUITY * zEq;
  const z = -SIN_OBLIQUITY * yEq + COS_OBLIQUITY * zEq;
  out.set(xEq / AU_KM, y / AU_KM, z / AU_KM);
  return out;
}

function propagateEarthOrbit(satellite, jd, applyJ2, outPositionAu) {
  const dtSec = (jd - satellite.epochJd) * DAY_SECONDS;

  const e = satellite.e;
  const i = satellite.iRad;
  const a = satellite.aKm;
  const n = satellite.meanMotionRadSec;

  let raan = satellite.raanRad;
  let argPeriapsis = satellite.argPeriapsisRad;
  let meanAnomaly = satellite.meanAnomalyRad + n * dtSec;

  if (applyJ2) {
    const p = a * (1 - e * e);
    const pRatio2 = (EARTH_EQUATORIAL_RADIUS_KM * EARTH_EQUATORIAL_RADIUS_KM) / (p * p);
    const j2Factor = 1.5 * EARTH_J2 * pRatio2 * n;
    const cosI = Math.cos(i);
    const cosI2 = cosI * cosI;

    const raanDot = -j2Factor * cosI;
    const argDot = 0.5 * j2Factor * (5 * cosI2 - 1);
    const mDotJ2 = 0.5 * j2Factor * Math.sqrt(Math.max(1e-9, 1 - e * e)) * (3 * cosI2 - 1);

    raan += raanDot * dtSec;
    argPeriapsis += argDot * dtSec;
    meanAnomaly += mDotJ2 * dtSec;
  }

  const M = normalizeRadians(meanAnomaly);
  const E = solveKepler(M, e);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const sqrtOneMinusESquared = Math.sqrt(Math.max(1e-9, 1 - e * e));

  const xPerifocal = a * (cosE - e);
  const yPerifocal = a * (sqrtOneMinusESquared * sinE);

  const cosO = Math.cos(raan);
  const sinO = Math.sin(raan);
  const cosW = Math.cos(argPeriapsis);
  const sinW = Math.sin(argPeriapsis);
  const cosI = Math.cos(i);
  const sinI = Math.sin(i);

  const r11 = cosO * cosW - sinO * sinW * cosI;
  const r12 = -cosO * sinW - sinO * cosW * cosI;
  const r21 = sinO * cosW + cosO * sinW * cosI;
  const r22 = -sinO * sinW + cosO * cosW * cosI;
  const r31 = sinW * sinI;
  const r32 = cosW * sinI;

  const xEq = r11 * xPerifocal + r12 * yPerifocal;
  const yEq = r21 * xPerifocal + r22 * yPerifocal;
  const zEq = r31 * xPerifocal + r32 * yPerifocal;

  return eciToEcliptic(xEq, yEq, zEq, outPositionAu);
}

function buildFallbackSatellites() {
  const fallback = [
    {
      name: 'ISS (fallback)',
      category: 'leo',
      epochJd: J2000_JD,
      aKm: 6_788,
      e: 0.00057,
      iRad: 51.64 * DEG_TO_RAD,
      raanRad: 31.2 * DEG_TO_RAD,
      argPeriapsisRad: 145.3 * DEG_TO_RAD,
      meanAnomalyRad: 325.7 * DEG_TO_RAD,
      meanMotionRevDay: 15.49,
      meanMotionRadSec: (15.49 * TWO_PI) / DAY_SECONDS
    },
    {
      name: 'GOES-16 (fallback)',
      category: 'geo',
      epochJd: J2000_JD,
      aKm: 42_164,
      e: 0.0002,
      iRad: 0.02 * DEG_TO_RAD,
      raanRad: 75.3 * DEG_TO_RAD,
      argPeriapsisRad: 90.0 * DEG_TO_RAD,
      meanAnomalyRad: 10.0 * DEG_TO_RAD,
      meanMotionRevDay: 1.0027,
      meanMotionRadSec: (1.0027 * TWO_PI) / DAY_SECONDS
    },
    {
      name: 'GOES-18 (fallback)',
      category: 'geo',
      epochJd: J2000_JD,
      aKm: 42_164,
      e: 0.00025,
      iRad: 0.03 * DEG_TO_RAD,
      raanRad: 95.1 * DEG_TO_RAD,
      argPeriapsisRad: 85.0 * DEG_TO_RAD,
      meanAnomalyRad: 186.0 * DEG_TO_RAD,
      meanMotionRevDay: 1.0027,
      meanMotionRadSec: (1.0027 * TWO_PI) / DAY_SECONDS
    }
  ];

  return fallback.map((sat) => ({
    ...sat,
    id: `sat-${sanitizeId(sat.name)}`
  }));
}

async function fetchTleText(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed TLE fetch (${response.status})`);
  }
  return response.text();
}

function pickEarthSatellites(stationSatellites, geoSatellites, maxGeoCount) {
  const iss = stationSatellites.find((sat) => sat.name.toLowerCase().includes('iss')) ?? stationSatellites[0] ?? null;

  const geo = geoSatellites
    .filter((sat) => sat.meanMotionRevDay > 0.95 && sat.meanMotionRevDay < 1.05)
    .sort((a, b) => {
      const ecc = a.e - b.e;
      if (Math.abs(ecc) > 1e-9) return ecc;
      return a.iRad - b.iRad;
    })
    .slice(0, maxGeoCount);

  return [
    ...(iss ? [{ ...iss, category: 'leo' }] : []),
    ...geo.map((sat) => ({ ...sat, category: 'geo' }))
  ];
}

function markerColor(category) {
  if (category === 'leo') return '#9ce7ff';
  if (category === 'geo') return '#ffc488';
  return '#d8dde6';
}

function markerScaleAu(realisticMode) {
  return realisticMode ? 3.2e-7 : 0.00062;
}

export class OrbitalSatelliteSystem {
  constructor({ maxGeoCount = 28, showOrbits = true, useJ2 = true } = {}) {
    this.maxGeoCount = maxGeoCount;
    this.showOrbits = showOrbits;
    this.useJ2 = useJ2;

    this.group = new Group();
    this.group.name = 'satellite-layer';

    this.markerGeometry = new SphereGeometry(1, 10, 8);
    this.satellites = [];
    this.meshById = new Map();
    this.orbitLineById = new Map();

    this.initialized = false;
    this.lastError = null;
  }

  attachTo(parentNode) {
    if (!parentNode) return;
    parentNode.add(this.group);
  }

  status() {
    return {
      initialized: this.initialized,
      satelliteCount: this.satellites.length,
      lastError: this.lastError,
      useJ2: this.useJ2,
      showOrbits: this.showOrbits
    };
  }

  async initialize() {
    if (this.initialized) return;

    try {
      const [stationsText, geoText] = await Promise.all([
        fetchTleText(SAT_TLE_SOURCES.stations),
        fetchTleText(SAT_TLE_SOURCES.geo)
      ]);

      const stations = parseTleBlock(stationsText, 'leo');
      const geo = parseTleBlock(geoText, 'geo');
      this.satellites = pickEarthSatellites(stations, geo, this.maxGeoCount);

      if (this.satellites.length === 0) {
        this.satellites = buildFallbackSatellites();
      }
    } catch (error) {
      this.lastError = error?.message ?? String(error);
      this.satellites = buildFallbackSatellites();
    }

    this.buildSceneObjects();
    this.initialized = true;
  }

  buildSceneObjects() {
    this.group.clear();
    this.meshById.clear();
    this.orbitLineById.clear();

    for (const sat of this.satellites) {
      const mesh = new Mesh(
        this.markerGeometry,
        new MeshBasicMaterial({ color: new Color(markerColor(sat.category)) })
      );
      mesh.userData.satelliteId = sat.id;
      this.group.add(mesh);
      this.meshById.set(sat.id, mesh);

      const orbitLine = this.createOrbitLine(sat);
      orbitLine.visible = this.showOrbits;
      this.group.add(orbitLine);
      this.orbitLineById.set(sat.id, orbitLine);
    }
  }

  createOrbitLine(satellite) {
    const segments = satellite.category === 'geo' ? 220 : 180;
    const positions = new Float32Array((segments + 1) * 3);
    const point = new Vector3();
    const periodDays = satellite.meanMotionRevDay > 0 ? 1 / satellite.meanMotionRevDay : 1;

    for (let i = 0; i <= segments; i += 1) {
      const tJd = satellite.epochJd + (periodDays * i) / segments;
      propagateEarthOrbit(satellite, tJd, false, point);
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

    return new Line(
      geometry,
      new LineBasicMaterial({
        color: new Color(satellite.category === 'geo' ? '#ffb56f' : '#7eceff'),
        transparent: true,
        opacity: satellite.category === 'geo' ? 0.34 : 0.42
      })
    );
  }

  setVisible(visible) {
    this.group.visible = Boolean(visible);
  }

  setOrbitVisibility(visible) {
    this.showOrbits = Boolean(visible);
    for (const orbitLine of this.orbitLineById.values()) {
      orbitLine.visible = this.showOrbits;
    }
  }

  setJ2Enabled(enabled) {
    this.useJ2 = Boolean(enabled);
  }

  applyScaleMode(realisticMode) {
    const scale = markerScaleAu(Boolean(realisticMode));
    for (const mesh of this.meshById.values()) {
      mesh.scale.setScalar(scale);
    }
  }

  update(jd) {
    if (!this.initialized) return;
    const position = new Vector3();

    for (const satellite of this.satellites) {
      const mesh = this.meshById.get(satellite.id);
      if (!mesh) continue;
      propagateEarthOrbit(satellite, jd, this.useJ2, position);
      mesh.position.copy(position);
    }
  }
}
