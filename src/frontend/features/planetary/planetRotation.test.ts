import { describe, expect, it } from 'vitest';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { createSolarSystemCatalog } from '../../../sim/catalog';
import fixture from '../../../../scripts/fixtures/planetary-poles-iau-j2000.json';

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

    // Actual transformed equatorial markers must sweep in the signed direction.
    const poleRotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), scenePole);
    const start = new Vector3(1, 0, 0).applyQuaternion(poleRotation);
    const dt = 1e-5;
    const angle = 2 * Math.PI * 24 / body.rotationPeriodHours! * dt;
    const end = new Vector3(Math.cos(angle), 0, -Math.sin(angle)).applyQuaternion(poleRotation);
    const measuredOmega = start.clone().cross(end).divideScalar(dt);
    expect(measuredOmega.distanceTo(expectedOmega)).toBeLessThan(2e-8);
  });
});
