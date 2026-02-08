import moons from '../data/moons.json';
import { AU_KM, MAJOR_BODY_IDS, parseEpochDateToJulian, sanitizeIdPart } from '../constants.js';
import { KUIPER_BELT_OBJECTS, MAJOR_MOON_RADII_KM, MAJOR_MOONS, PLANETS, SUN } from '../data/planets.js';

const PARENT_TINTS = {
  Earth: '#d2d8e3',
  Mars: '#c9b8a7',
  Jupiter: '#cab8a0',
  Saturn: '#cdbf9f',
  Uranus: '#a7c5cb',
  Neptune: '#9eb3d5',
  Pluto: '#b8aca4'
};

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

export function createSolarSystemCatalog() {
  const usedIds = new Set();
  const bodies = [];

  const sunBody = {
    ...SUN,
    parentId: null,
    isMajor: true,
    displayRadiusAu: displayRadiusAu(SUN.radiusKm, SUN.type),
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
      orbit: {
        ...planet.orbit,
        epochJd: planet.orbit.epochJd
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

    bodies.push({
      id,
      name: moon.name,
      type: 'moon',
      parentId,
      massKg: null,
      radiusKm,
      displayRadiusAu: displayRadiusAu(radiusKm, 'moon'),
      color: moonColor(moon.planet),
      isMajor: MAJOR_MOONS.has(moon.name),
      reference: moon.reference,
      orbit: {
        epochJd: parseEpochDateToJulian(moon.epochTdb),
        aAu: moon.aKm / AU_KM,
        e: moon.e,
        iDeg: moon.inclinationDeg,
        ascendingNodeDeg: moon.ascendingNodeDeg,
        argPeriapsisDeg: moon.argPeriapsisDeg,
        meanAnomalyDeg: moon.meanAnomalyDeg,
        periodDays: moon.periodDays
      }
    });
  }

  const kboIds = KUIPER_BELT_OBJECTS.map((k) => k.id);

  const jumpBodyIds = [
    ...MAJOR_BODY_IDS,
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
