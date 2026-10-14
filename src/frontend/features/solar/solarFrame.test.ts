import { describe, expect, it } from 'vitest';
import { Group, Matrix4, Vector3 } from 'three';
import reference from '../../../../backend/tests/fixtures/solar_frames/cspice_solar_frame.json';
import {
  applySolarGeometryFrame, solarFrameToEclipticMatrix, solarSurfaceToEclipticMatrix,
  solarVectorToSurfaceLocal, type SolarFrame
} from './solarFrame';
import { createMagneticFieldLinesFromPFSS } from './solarMagnetics';
import { SOLAR_RADIUS_AU } from './solarDisplayScale';

describe('SCN-042 independent CSPICE solar-frame reference', () => {
  for (const sample of reference.cases) {
    it(`${sample.input_frame} at JDTDB ${sample.jd_tdb} matches CSPICE`, () => {
      const frame = sample.input_frame as SolarFrame;
      const matrix = solarFrameToEclipticMatrix(frame, sample.jd_tdb);
      expect(matrix.determinant()).toBeCloseTo(1, 13);
      for (const anchor of sample.samples) {
        const actual = new Vector3(...anchor.input as [number, number, number]).applyMatrix4(matrix);
        expect(actual.distanceTo(new Vector3(...anchor.world as [number, number, number]))).toBeLessThan(2e-10);
        const local = solarVectorToSurfaceLocal(anchor.input, frame, sample.jd_tdb);
        const rendered = local.applyMatrix4(solarSurfaceToEclipticMatrix(sample.jd_tdb));
        expect(rendered.distanceTo(actual)).toBeLessThan(2e-10);
      }
    });
  }

  it('preserves the independently oriented pole, not only a 7.25-degree tilt', () => {
    const matrix = solarFrameToEclipticMatrix('IAU_SUN', 2451545);
    const correctPole = new Vector3(0, 0, 1).applyMatrix4(matrix);
    const oldPole = new Vector3(Math.sin(7.25*Math.PI/180), 0, Math.cos(7.25*Math.PI/180));
    expect(correctPole.angleTo(oldPole)*180/Math.PI).toBeGreaterThan(1);
  });

  it('does not apply rigid rotation a second time to already-inertial features', () => {
    const a = solarFrameToEclipticMatrix('SOLAR_EQUATORIAL_J2000', 2451545);
    const b = solarFrameToEclipticMatrix('SOLAR_EQUATORIAL_J2000', 2451552);
    expect(a.elements).toEqual(b.elements);
    expect(solarFrameToEclipticMatrix('IAU_SUN', 2451552).elements).not.toEqual(a.elements);
  });

  it('frames the actual PFSS geometry without altering physical heights', () => {
    const ref = reference.cases[2];
    const group = createMagneticFieldLinesFromPFSS({lines: [{state: 'open', polarity: 1,
      arc: [[0, 0, 1], [0, 0, 2.51]]}]}, SOLAR_RADIUS_AU, .5,
    {inputFrame: ref.input_frame as SolarFrame, jdTdb: ref.jd_tdb});
    group.updateMatrixWorld(true);
    const point = new Vector3(0, 0, 2.51*SOLAR_RADIUS_AU).applyMatrix4(group.matrixWorld);
    const expected = new Vector3(...ref.samples[24].world as [number, number, number])
      .multiplyScalar(2.51*SOLAR_RADIUS_AU/1.03);
    expect(point.distanceTo(expected)).toBeLessThan(2e-12);
    expect(group.userData.lockBodySpin).toBe(true);
  });

  it('rejects ambiguous or nonfinite frame inputs', () => {
    expect(() => solarFrameToEclipticMatrix('unknown' as SolarFrame, 2451545)).toThrow();
    expect(() => solarFrameToEclipticMatrix('IAU_SUN', NaN)).toThrow();
    expect(() => solarVectorToSurfaceLocal([NaN, 0, 1], 'IAU_SUN', 2451545)).toThrow();
    const group = new Group();
    group.position.set(3, 4, 5);
    group.scale.setScalar(2);
    applySolarGeometryFrame(group, {inputFrame: 'IAU_SUN', jdTdb: 2451545});
    expect(group.position.toArray()).toEqual([3, 4, 5]);
    expect(group.scale.toArray()).toEqual([2, 2, 2]);
    expect(new Matrix4().extractRotation(group.matrix)).toBeDefined();
  });
});
