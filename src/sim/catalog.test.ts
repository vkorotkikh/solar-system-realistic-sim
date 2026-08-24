/**
 * NOTE (R4): several tests in this file re-implement the frame-conversion math
 * they check (raDecToEquatorialUnit, crossProduct, the plane->ecliptic rotation
 * are recomputed locally and asserted equal to the code's output). That is
 * tautological -- it agrees with the implementation by construction and passed
 * while converted moon positions were ~2 orbital radii wrong (SF-9). Treat these
 * as STRUCTURAL/consistency checks only. Accuracy is pinned by an external oracle
 * in catalog.accuracy.test.ts (JPL Horizons), never by recomputing the formula.
 */
import { describe, expect, it } from 'vitest';
import {
  convertMoonOrbitFrameToEcliptic,
  createSolarSystemCatalog,
  resolveMoonSecularRates,
  resolveMoonRotationPeriodHours
} from './catalog';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EARTH_OBLIQUITY_DEG = 23.439281;

function normalizeDegrees(value: number): number {
  const mod = value % 360;
  return mod < 0 ? mod + 360 : mod;
}

function vectorMagnitude(vector: { x: number; y: number; z: number }): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalizeVector(vector: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
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

function crossProduct(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function dotProduct(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function raDecToEquatorialUnit(raDeg: number, decDeg: number) {
  const ra = raDeg * DEG_TO_RAD;
  const dec = decDeg * DEG_TO_RAD;
  const cosDec = Math.cos(dec);
  return {
    x: cosDec * Math.cos(ra),
    y: cosDec * Math.sin(ra),
    z: Math.sin(dec)
  };
}

function equatorialToEcliptic(vectorEq: { x: number; y: number; z: number }) {
  const obliquity = EARTH_OBLIQUITY_DEG * DEG_TO_RAD;
  const cosOb = Math.cos(obliquity);
  const sinOb = Math.sin(obliquity);
  return {
    x: vectorEq.x,
    y: cosOb * vectorEq.y + sinOb * vectorEq.z,
    z: -sinOb * vectorEq.y + cosOb * vectorEq.z
  };
}

function sourcePoleInEcliptic({
  poleRaDeg,
  poleDecDeg,
  poleTiltDeg,
  planet,
  parentId
}: {
  poleRaDeg: number | null;
  poleDecDeg: number | null;
  poleTiltDeg: number | null;
  planet: string;
  parentId: string;
}, sourceFrame: string) {
  if (Number.isFinite(poleRaDeg) && Number.isFinite(poleDecDeg)) {
    return normalizeVector(equatorialToEcliptic(raDecToEquatorialUnit(poleRaDeg ?? 0, poleDecDeg ?? 0)));
  }

  const parentTilt = parentId === 'jupiter' ? 3.13 : 0;
  const laplaceTilt = Number.isFinite(poleTiltDeg) ? (poleTiltDeg ?? 0) : 0;
  const frameTiltDeg = sourceFrame === 'laplace'
    ? parentTilt + laplaceTilt
    : parentTilt;

  void planet;
  return normalizeVector({
    x: 0,
    y: -Math.sin(frameTiltDeg * DEG_TO_RAD),
    z: Math.cos(frameTiltDeg * DEG_TO_RAD)
  });
}

function orbitNormalFromElements(iDeg: number, ascendingNodeDeg: number) {
  const i = iDeg * DEG_TO_RAD;
  const omega = ascendingNodeDeg * DEG_TO_RAD;
  const sinI = Math.sin(i);
  return {
    x: -Math.sin(omega) * sinI,
    y: Math.cos(omega) * sinI,
    z: Math.cos(i)
  };
}

function elementsFromOrbitNormal(normal: { x: number; y: number; z: number }) {
  const z = Math.min(1, Math.max(-1, normal.z));
  const iRad = Math.acos(z);
  const ascendingNodeRad = Math.atan2(-normal.x, normal.y);
  return {
    iDeg: iRad * RAD_TO_DEG,
    ascendingNodeDeg: normalizeDegrees(ascendingNodeRad * RAD_TO_DEG)
  };
}

function transformSourceVectorToEcliptic(
  vector: { x: number; y: number; z: number },
  basis: { x: { x: number; y: number; z: number }; y: { x: number; y: number; z: number }; z: { x: number; y: number; z: number } }
) {
  return {
    x: basis.x.x * vector.x + basis.y.x * vector.y + basis.z.x * vector.z,
    y: basis.x.y * vector.x + basis.y.y * vector.y + basis.z.y * vector.z,
    z: basis.x.z * vector.x + basis.y.z * vector.y + basis.z.z * vector.z
  };
}

function basisFromSourcePole(sourcePole: { x: number; y: number; z: number }) {
  const eclipticNorth = { x: 0, y: 0, z: 1 };
  let planeXAxis = crossProduct(eclipticNorth, sourcePole);
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

function periapsisVectorFromElements(iDeg: number, ascendingNodeDeg: number, argPeriapsisDeg: number) {
  const i = iDeg * DEG_TO_RAD;
  const omega = ascendingNodeDeg * DEG_TO_RAD;
  const argPeriapsis = argPeriapsisDeg * DEG_TO_RAD;

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

function expectedConvertMoonOrbitFrameToEcliptic(
  moon: {
    frame: string;
    inclinationDeg: number;
    ascendingNodeDeg: number;
    argPeriapsisDeg: number;
    poleRaDeg: number | null;
    poleDecDeg: number | null;
    poleTiltDeg: number | null;
    planet: string;
  },
  parentId: string
) {
  const sourceFrame = moon.frame.trim().toLowerCase();
  const sourcePole = sourcePoleInEcliptic({ ...moon, parentId }, sourceFrame);
  const basis = basisFromSourcePole(sourcePole);
  const sourceNormal = orbitNormalFromElements(moon.inclinationDeg, moon.ascendingNodeDeg);
  const sourcePeriapsis = periapsisVectorFromElements(moon.inclinationDeg, moon.ascendingNodeDeg, moon.argPeriapsisDeg);
  const eclipticNormal = normalizeVector(transformSourceVectorToEcliptic(sourceNormal, basis));
  const eclipticPeriapsis = normalizeVector(transformSourceVectorToEcliptic(sourcePeriapsis, basis));
  const normalElements = elementsFromOrbitNormal(eclipticNormal);
  const nodeVector = crossProduct({ x: 0, y: 0, z: 1 }, eclipticNormal);
  const nodeMagnitude = vectorMagnitude(nodeVector);
  const periapsisProjectionScale = dotProduct(eclipticPeriapsis, eclipticNormal);
  const periapsisProjected = normalizeVector({
    x: eclipticPeriapsis.x - eclipticNormal.x * periapsisProjectionScale,
    y: eclipticPeriapsis.y - eclipticNormal.y * periapsisProjectionScale,
    z: eclipticPeriapsis.z - eclipticNormal.z * periapsisProjectionScale
  });

  let argPeriapsisDeg;
  if (nodeMagnitude < 1e-9) {
    argPeriapsisDeg = normalizeDegrees(Math.atan2(periapsisProjected.y, periapsisProjected.x) * RAD_TO_DEG);
  } else {
    const nodeUnit = normalizeVector(nodeVector);
    const transverseUnit = normalizeVector(crossProduct(eclipticNormal, nodeUnit));
    argPeriapsisDeg = normalizeDegrees(
      Math.atan2(
        dotProduct(periapsisProjected, transverseUnit),
        dotProduct(periapsisProjected, nodeUnit)
      ) * RAD_TO_DEG
    );
  }

  return {
    ...normalElements,
    argPeriapsisDeg,
    sourceFrame,
    parentId
  };
}

describe('moon catalog realism', () => {
  it('converts non-ecliptic moon periapsis directions instead of leaving omega untouched', () => {
    const moon = {
      planet: 'Jupiter',
      frame: 'Laplace',
      inclinationDeg: 0.5,
      ascendingNodeDeg: 184,
      argPeriapsisDeg: 45,
      poleRaDeg: 268.1,
      poleDecDeg: 64.5,
      poleTiltDeg: 0
    };

    const converted = convertMoonOrbitFrameToEcliptic(moon, 'jupiter');
    const expected = expectedConvertMoonOrbitFrameToEcliptic(moon, 'jupiter');

    expect(converted.sourceFrame).toBe('laplace');
    expect(converted.iDeg).toBeCloseTo(expected.iDeg, 9);
    expect(converted.ascendingNodeDeg).toBeCloseTo(expected.ascendingNodeDeg, 9);
    expect(converted.argPeriapsisDeg).toBeCloseTo(expected.argPeriapsisDeg, 9);
    expect(converted.argPeriapsisDeg).not.toBeCloseTo(moon.argPeriapsisDeg, 3);
  });

  it('applies synchronous rotation defaults to major moons', () => {
    expect(resolveMoonRotationPeriodHours({ name: 'Moon', periodDays: 27.322 })).toBeCloseTo(27.322 * 24, 8);
    expect(resolveMoonRotationPeriodHours({ name: 'Europa', periodDays: 3.525463 })).toBeCloseTo(3.525463 * 24, 8);
    expect(resolveMoonRotationPeriodHours({ name: 'Triton', periodDays: 5.876854 })).toBeCloseTo(-(5.876854 * 24), 8);
  });

  it('converts published moon precession periods into secular orbit rates', () => {
    const rates = resolveMoonSecularRates({
      apsisPrecessionYears: 4_000,
      nodePrecessionYears: 2_000
    });

    expect(rates?.argPeriapsisDegPerCentury).toBeCloseTo(9, 12);
    expect(rates?.ascendingNodeDegPerCentury).toBeCloseTo(-18, 12);
  });

  it('carries precession rates into the moon orbit catalog', () => {
    const catalog = createSolarSystemCatalog();
    const moon = catalog.bodies.find((body) => body.name === 'Moon');
    const phobos = catalog.bodies.find((body) => body.name === 'Phobos');

    expect(moon?.rotationPeriodHours).toBeCloseTo(27.322 * 24, 8);
    expect(moon?.orbit?.secularRates?.argPeriapsisDegPerCentury).toBeGreaterThan(0);
    expect(moon?.orbit?.secularRates?.ascendingNodeDegPerCentury).toBeLessThan(0);

    expect(phobos?.orbitFrameSource).toBe('laplace');
    expect(phobos?.orbit?.argPeriapsisDeg).not.toBeCloseTo(216.3, 6);
    expect(phobos?.orbit?.secularRates?.argPeriapsisDegPerCentury).toBeGreaterThan(0);
    expect(phobos?.orbit?.secularRates?.ascendingNodeDegPerCentury).toBeLessThan(0);
  });
});
