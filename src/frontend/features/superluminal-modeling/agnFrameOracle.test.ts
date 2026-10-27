import { describe, expect, it } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import fixtures from '../../../../scripts/fixtures/agn-sky-j2000.json';
import { sourceEclipticDirection, type SourceKey } from './sourceCoordinates';
import { SAGITTARIUS_A_DIR, CENTAURUS_A_DIR, MAFFEI_1_DIR, M87_DIR } from './agnShockwaveEngine';
import { createGWVisualization } from '../solar/gravitationalWaves';
import { createWarpSlipstreamVisualization } from './warpSlipstreamVisuals';

const eventDirections: Record<SourceKey, Vector3> = {
  SagittariusA: SAGITTARIUS_A_DIR, CentaurusA: CENTAURUS_A_DIR, Maffei1: MAFFEI_1_DIR, M87: M87_DIR,
};

describe('SCN-042 independent fixed-J2000 sky -> scene -> screen oracle', () => {
  for (const fixture of fixtures.sources) {
    it(`${fixture.key}: catches wrong obliquity, handedness, source bearing, or projection`, () => {
      expect(fixture.key in eventDirections).toBe(true);
      const key = fixture.key as SourceKey;
      const direction = new Vector3(...sourceEclipticDirection(key));
      fixture.direction.forEach((component, axis) => {
        expect(direction.getComponent(axis)).toBeCloseTo(component, 12);
        expect(eventDirections[key].getComponent(axis)).toBeCloseTo(component, 12);
      });
      const top = new OrthographicCamera(-8, 8, 8, -8, 0.1, 100);
      top.position.set(0, 0, 20);
      top.lookAt(0, 0, 0);
      const oblique = new PerspectiveCamera(60, 1, 0.1, 100);
      oblique.position.set(0, -12, 9);
      oblique.up.set(0, 0, 1);
      oblique.lookAt(0, 0, 0);
      for (const [camera, expected] of [[top, fixture.topPixel], [oblique, fixture.obliquePixel]] as const) {
        camera.updateMatrixWorld(true);
        const ndc = direction.clone().multiplyScalar(4).project(camera);
        expect((ndc.x + 1) * 128).toBeCloseTo(expected[0], 9);
        expect((1 - ndc.y) * 128).toBeCloseTo(expected[1], 9);
      }
    });
  }

  for (const [name, factory] of [['GW', createGWVisualization], ['H29', createWarpSlipstreamVisualization]] as const) {
    it(`${name}: unperturbed event grid lies in the canonical XY ecliptic with +Z normal`, () => {
      const visual = factory(12);
      try {
        const position = visual.mesh.geometry.getAttribute('position');
        const normal = visual.mesh.geometry.getAttribute('normal');
        let yExtent = 0;
        for (let vertex = 0; vertex < position.count; vertex += 1) {
          expect(position.getZ(vertex)).toBe(0);
          expect(normal.getZ(vertex)).toBe(1);
          yExtent = Math.max(yExtent, Math.abs(position.getY(vertex)));
        }
        expect(yExtent).toBe(6);
      } finally { visual.dispose(); }
    });
  }
});
