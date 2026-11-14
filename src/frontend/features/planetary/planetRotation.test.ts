import { describe, expect, it } from 'vitest';
import { Group, Matrix4, Vector3 } from 'three';
import { createSolarSystemCatalog } from '../../../sim/catalog';
import fixture from '../../../../scripts/fixtures/planetary-poles-iau-j2000.json';
import { applyBodySpin } from './bodySpin';

// Independent IAU/NAIF fixtures: pck00011.tpc BODY*_POLE_RA/DEC and BODY*_PM.
// These four poles have no periodic terms. Rates are degrees / TDB day.
const FIXTURES = [
  ['earth', 0, 90, 360.9856235],
  ['venus', 272.76, 67.16, -1.4813688],
  ['uranus', 257.311, -15.175, -501.1600928],
  ['pluto', 132.993, -6.163, 56.3625225],
] as const;
const radians = Math.PI / 180;
const bodies = createSolarSystemCatalog().bodies;

describe('Earth surface map longitude', () => {
  // planetShaders surfaceUv: longitude = atan2(local x, local z), so the map's 0 deg E is local +Z, 90 deg E is +X.
  const earth = bodies.find((body) => body.id === 'earth')!;
  const tilt = earth.axialTiltDeg! * radians;
  const longitude = earth.spinAxisLongitudeDeg! * radians;
  const poleFrame = new Group();
  poleFrame.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(Math.sin(tilt) * Math.cos(longitude), Math.sin(tilt) * Math.sin(longitude), Math.cos(tilt)));
  const surface = new Group();
  poleFrame.add(surface);
  const eclipticToEquatorial = new Matrix4().makeRotationX(23.439291111 * radians);
  const rightAscensionDeg = (local: Vector3, jd: number) => {
    applyBodySpin(surface, (jd - 2451545) * 86_400, earth.rotationPeriodHours!, (earth.rotationPhaseDeg ?? 0) * radians);
    poleFrame.updateMatrixWorld(true);
    const v = local.clone().applyMatrix4(surface.matrixWorld).applyMatrix4(eclipticToEquatorial);
    return Math.atan2(v.y, v.x) / radians;
  };
  const wrapDeg = (angle: number) => ((angle % 360) + 540) % 360 - 180;

  // NAIF pck00011 BODY399_PM: W = 190.147 + 360.9856235 d, measured from the node at RA 90 deg.
  it.each([2451545.0, 2461988.5, 2462000.75])('puts Greenwich at the IAU prime meridian at JD %s', (jd) => {
    const greenwichRa = rightAscensionDeg(new Vector3(0, 0, 1), jd);
    expect(Math.abs(wrapDeg(greenwichRa - (90 + 190.147 + 360.9856235 * (jd - 2451545))))).toBeLessThan(0.01);
    // Independent cross-check: GMST (IAU 1982) differs only by UT1-TT, precession and rate rounding.
    expect(Math.abs(wrapDeg(greenwichRa - (280.46061837 + 360.98564736629 * (jd - 2451545))))).toBeLessThan(0.7);
    // East is east: 90 deg E lies 90 deg further along in right ascension.
    expect(wrapDeg(rightAscensionDeg(new Vector3(1, 0, 0), jd) - greenwichRa)).toBeCloseTo(90, 6);
  });
});

describe('IAU cartographic poles and signed rotation', () => {
  it.each(fixture.bodies)('$id matches an independent CSPICE J2000 pole and signed mean angular velocity', ({ id, poleEcliptic, rateDegPerDay }) => {
    const body = bodies.find((body) => body.id === id)!;
    const tilt = body.axialTiltDeg! * radians;
    const longitude = body.spinAxisLongitudeDeg! * radians;
    const pole = new Vector3(Math.sin(tilt) * Math.cos(longitude), Math.sin(tilt) * Math.sin(longitude), Math.cos(tilt));
    const expectedPole = new Vector3().fromArray(poleEcliptic);
    expect(pole.distanceTo(expectedPole)).toBeLessThan(1e-12);
    expect(pole.multiplyScalar(2 * Math.PI * 24 / body.rotationPeriodHours!)
      .distanceTo(expectedPole.multiplyScalar(rateDegPerDay * radians))).toBeLessThan(1e-11);
  });
  it.each(FIXTURES)('%s has the cited pole and a single encoded spin direction', (id, ra, dec, rate) => {
    const body = bodies.find((body) => body.id === id)!;
    // Exercise the legacy scene orientation fields consumed by createBodyNode.
    const tilt = body.axialTiltDeg! * radians;
    const longitude = (body.spinAxisLongitudeDeg ?? 0) * radians;
    const scenePole = new Vector3(Math.sin(tilt) * Math.cos(longitude), Math.sin(tilt) * Math.sin(longitude), Math.cos(tilt));
    // Inertial equator -> ecliptic is a proper rotation by -epsilon about X.
    const expectedPole = new Vector3(Math.cos(dec * radians) * Math.cos(ra * radians), Math.cos(dec * radians) * Math.sin(ra * radians), Math.sin(dec * radians))
      .applyMatrix4(new Matrix4().makeRotationX(-23.439291111 * radians));
    expect(scenePole.distanceTo(expectedPole)).toBeLessThan(1e-10);
    const angularVelocity = scenePole.clone().multiplyScalar(2 * Math.PI * 24 / body.rotationPeriodHours!);
    const expectedOmega = expectedPole.clone().multiplyScalar(rate * radians);
    expect(angularVelocity.distanceTo(expectedOmega)).toBeLessThan(1e-10);
    expect(Math.sign(angularVelocity.z)).toBe(id === 'earth' ? 1 : -1);

    // Exercise the production spin step on a real child beneath the cited pole frame.
    const poleFrame = new Group();
    poleFrame.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), scenePole);
    const surface = new Group();
    poleFrame.add(surface);
    const localMarker = new Vector3(1, 0, 0);
    const unspunWorldMarker = localMarker.clone().applyQuaternion(poleFrame.quaternion);
    const rotationOffsetRad = 0.37;

    applyBodySpin(surface, 0, body.rotationPeriodHours!, rotationOffsetRad);
    poleFrame.updateMatrixWorld(true);
    const atEpoch = localMarker.clone().applyMatrix4(surface.matrixWorld);
    const expectedAtEpoch = unspunWorldMarker.clone().applyAxisAngle(scenePole, rotationOffsetRad);
    expect(atEpoch.distanceTo(expectedAtEpoch)).toBeLessThan(1e-12);

    const elapsedDays = 0.125;
    applyBodySpin(surface, elapsedDays * 86_400, body.rotationPeriodHours!, rotationOffsetRad);
    poleFrame.updateMatrixWorld(true);
    const afterSpin = localMarker.clone().applyMatrix4(surface.matrixWorld);
    expect(surface.rotation.y).toBeGreaterThanOrEqual(0);
    expect(surface.rotation.y).toBeLessThan(2 * Math.PI);
    const expectedAfterSpin = unspunWorldMarker.clone().applyAxisAngle(
      scenePole,
      rotationOffsetRad + rate * radians * elapsedDays
    );
    expect(afterSpin.distanceTo(expectedAfterSpin)).toBeLessThan(1e-10);

    // Absolute time updates must not accumulate a second spin step.
    applyBodySpin(surface, 0, body.rotationPeriodHours!, rotationOffsetRad);
    poleFrame.updateMatrixWorld(true);
    expect(localMarker.clone().applyMatrix4(surface.matrixWorld).distanceTo(atEpoch)).toBeLessThan(1e-12);
  });
});
