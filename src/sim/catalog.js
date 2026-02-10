import moons from '../data/moons.json';
import { AU_KM, MAJOR_BODY_IDS, parseEpochDateToJulian, sanitizeIdPart } from '../constants.js';
import { ASTEROID_BELT_OBJECTS, KUIPER_BELT_OBJECTS, MAJOR_MOON_RADII_KM, MAJOR_MOONS, PLANETS, SUN } from '../data/planets.js';

const PARENT_TINTS = {
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
const PARENT_AXIAL_TILT_DEG = Object.fromEntries(
  PLANETS.map((planet) => [planet.id, Math.abs(planet.axialTiltDeg ?? 0)])
);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeDegrees(value) {
  const mod = value % 360;
  return mod < 0 ? mod + 360 : mod;
}

function orbitNormalFromElements(iDeg, ascendingNodeDeg) {
  const i = (iDeg ?? 0) * DEG_TO_RAD;
  const omega = (ascendingNodeDeg ?? 0) * DEG_TO_RAD;
  const sinI = Math.sin(i);

  // Angular-momentum direction for Rz(Omega) * Rx(i) perifocal transform.
  return {
    x: -Math.sin(omega) * sinI,
    y: Math.cos(omega) * sinI,
    z: Math.cos(i)
  };
}

function rotateVectorAroundX(vector, angleDeg) {
  const angle = angleDeg * DEG_TO_RAD;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  return {
    x: vector.x,
    y: vector.y * cosA - vector.z * sinA,
    z: vector.y * sinA + vector.z * cosA
  };
}

function elementsFromOrbitNormal(normal) {
  const z = clamp(normal.z, -1, 1);
  const iRad = Math.acos(z);
  const ascendingNodeRad = Math.atan2(-normal.x, normal.y);
  return {
    iDeg: iRad * RAD_TO_DEG,
    ascendingNodeDeg: normalizeDegrees(ascendingNodeRad * RAD_TO_DEG)
  };
}

function normalizeMoonOrbitFrame(moon, parentId) {
  const sourceFrame = `${moon.frame ?? ''}`.trim().toLowerCase();
  if (sourceFrame === 'ecliptic' || sourceFrame.length === 0) {
    return {
      iDeg: moon.inclinationDeg,
      ascendingNodeDeg: normalizeDegrees(moon.ascendingNodeDeg ?? 0),
      sourceFrame: sourceFrame || 'ecliptic'
    };
  }

  // JPL moon elements are not consistently published in one frame.
  // Convert equatorial/Laplace entries into a common ecliptic approximation.
  const parentTilt = PARENT_AXIAL_TILT_DEG[parentId] ?? 0;
  const laplaceTilt = Number.isFinite(moon.poleTiltDeg) ? Math.abs(moon.poleTiltDeg) : null;
  const frameTiltDeg = sourceFrame === 'laplace'
    ? (laplaceTilt ?? parentTilt)
    : parentTilt;

  const sourceNormal = orbitNormalFromElements(moon.inclinationDeg, moon.ascendingNodeDeg);
  const eclipticNormal = rotateVectorAroundX(sourceNormal, frameTiltDeg);
  const converted = elementsFromOrbitNormal(eclipticNormal);
  return {
    iDeg: converted.iDeg,
    ascendingNodeDeg: converted.ascendingNodeDeg,
    sourceFrame
  };
}

function stableHash(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function estimateMoonRadiusKm(moon) {
  if (MAJOR_MOON_RADII_KM[moon.name]) {
    return MAJOR_MOON_RADII_KM[moon.name];
  }

  const hash = stableHash(`${moon.planet}:${moon.name}`);
  const parentScale = {
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

function displayRadiusAu(radiusKm, type) {
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

function moonColor(planet) {
  return PARENT_TINTS[planet] ?? '#c5c5c5';
}

function makeMoonId(moon, usedIds) {
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

function applyDisplayScaleConstraints(bodies) {
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

export function createSolarSystemCatalog() {
  const usedIds = new Set();
  const bodies = [];

  const sunBody = {
    ...SUN,
    parentId: null,
    isMajor: true,
    displayRadiusAu: displayRadiusAu(SUN.radiusKm, SUN.type),
    realRadiusAu: SUN.radiusKm / AU_KM,
    orbit: null
  };

  usedIds.add(sunBody.id);
  bodies.push(sunBody);

  for (const planet of PLANETS) {
    usedIds.add(planet.id);
    bodies.push({
      ...planet,
      parentId: 'sun',
      isMajor: true,
      displayRadiusAu: displayRadiusAu(planet.radiusKm, planet.type),
      realRadiusAu: planet.radiusKm / AU_KM,
      orbit: {
        ...planet.orbit,
        epochJd: planet.orbit.epochJd
      }
    });
  }

  for (const ast of ASTEROID_BELT_OBJECTS) {
    usedIds.add(ast.id);
    bodies.push({
      ...ast,
      parentId: 'sun',
      isMajor: true,
      displayRadiusAu: displayRadiusAu(ast.radiusKm, ast.type === 'dwarf' ? 'dwarf' : 'planet'),
      realRadiusAu: ast.radiusKm / AU_KM,
      orbit: {
        ...ast.orbit,
        epochJd: ast.orbit.epochJd
      }
    });
  }

  for (const kbo of KUIPER_BELT_OBJECTS) {
    usedIds.add(kbo.id);
    bodies.push({
      ...kbo,
      parentId: 'sun',
      isMajor: true,
      displayRadiusAu: displayRadiusAu(kbo.radiusKm, kbo.type),
      realRadiusAu: kbo.radiusKm / AU_KM,
      orbit: {
        ...kbo.orbit,
        epochJd: kbo.orbit.epochJd
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
    const id = makeMoonId(moon, usedIds);
    const frameNormalized = normalizeMoonOrbitFrame(moon, parentId);

    bodies.push({
      id,
      name: moon.name,
      type: 'moon',
      parentId,
      massKg: null,
      radiusKm,
      displayRadiusAu: displayRadiusAu(radiusKm, 'moon'),
      realRadiusAu: radiusKm / AU_KM,
      color: moonColor(moon.planet),
      isMajor: MAJOR_MOONS.has(moon.name),
      reference: moon.reference,
      orbitFrameSource: frameNormalized.sourceFrame,
      orbit: {
        epochJd: parseEpochDateToJulian(moon.epochTdb),
        aAu: moon.aKm / AU_KM,
        e: moon.e,
        iDeg: frameNormalized.iDeg,
        ascendingNodeDeg: frameNormalized.ascendingNodeDeg,
        argPeriapsisDeg: moon.argPeriapsisDeg,
        meanAnomalyDeg: moon.meanAnomalyDeg,
        periodDays: moon.periodDays
      }
    });
  }

  applyDisplayScaleConstraints(bodies);

  const asteroidIds = ASTEROID_BELT_OBJECTS.map((a) => a.id);
  const kboIds = KUIPER_BELT_OBJECTS.map((k) => k.id);

  const jumpBodyIds = [
    ...MAJOR_BODY_IDS,
    ...asteroidIds,
    ...kboIds,
    ...bodies
      .filter((body) => body.type === 'moon' && body.isMajor)
      .map((body) => body.id)
      .sort((a, b) => a.localeCompare(b))
  ];

  const plannerBodyIds = [
    'mercury',
    'venus',
    'earth',
    'mars',
    'jupiter',
    'saturn',
    'uranus',
    'neptune',
    'pluto',
    ...kboIds
  ];

  return {
    bodies,
    jumpBodyIds,
    plannerBodyIds
  };
}
