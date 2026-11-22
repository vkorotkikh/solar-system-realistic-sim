import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { AU_KM } from '../../../constants';
import { generateKuiperBelt } from '../../../sim/kuiperBelt';
import { createKuiperBeltRenderer } from './beltRenderer';

// Realistic scale draws every body at its physical size: the main belt already does,
// and the Kuiper belt used to keep its enlarged 1.2-million-km balls (audit belts-02, belts-03).
const population = generateKuiperBelt(800, 137);
const trueRadiusAu = (diameterKm: number) => diameterKm / 2 / AU_KM;

function instance(mesh: InstancedMesh, index: number) {
  const matrix = new Matrix4();
  mesh.getMatrixAt(index, matrix);
  const position = new Vector3(); const rotation = new Quaternion(); const scale = new Vector3();
  matrix.decompose(position, rotation, scale);
  return { position, scale };
}

describe('Kuiper belt follows the Realistic scale switch', () => {
  it('draws every object at its true radius in Realistic scale, and back to the enlarged size when it is off', () => {
    const renderer = createKuiperBeltRenderer(population.kbos);
    try {
      const enlarged = population.kbos.map((_, i) => instance(renderer.mesh, i).scale);
      renderer.setScaleMode(true);
      population.kbos.forEach((kbo, i) => {
        const { scale } = instance(renderer.mesh, i);
        expect(scale.y / trueRadiusAu(kbo.diameterKm)).toBeCloseTo(1, 5);
        // The irregular shape is kept: only the size changes.
        expect(scale.x / scale.y).toBeCloseTo(enlarged[i].x / enlarged[i].y, 5);
        expect(scale.z / scale.y).toBeCloseTo(enlarged[i].z / enlarged[i].y, 5);
      });
      renderer.setScaleMode(false);
      population.kbos.forEach((_, i) => {
        const { scale } = instance(renderer.mesh, i);
        expect(scale.y / enlarged[i].y).toBeCloseTo(1, 6);
        expect(scale.y).toBeGreaterThan(trueRadiusAu(population.kbos[i].diameterKm));
      });
    } finally { renderer.dispose(); }
  });

  it('keeps every object where it is when the scale changes while the clock is paused', () => {
    const renderer = createKuiperBeltRenderer(population.kbos);
    try {
      const positions = new Float32Array(population.kbos.length * 3).map((_, k) => 30 + (k % 7));
      renderer.updatePositions(positions);
      renderer.setScaleMode(true);
      population.kbos.forEach((_, i) => {
        const { position } = instance(renderer.mesh, i);
        expect([position.x, position.y, position.z]).toEqual([positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]);
      });
    } finally { renderer.dispose(); }
  });

  it('draws binary companions at their true size too, so every pair separates in Realistic scale', () => {
    const renderer = createKuiperBeltRenderer(population.kbos);
    const binaries = population.kbos.filter(kbo => kbo.binary);
    expect(binaries.length).toBeGreaterThan(10);
    try {
      renderer.setScaleMode(true);
      binaries.forEach((kbo, j) => {
        const primary = instance(renderer.mesh, population.kbos.indexOf(kbo)).scale.y;
        const companion = instance(renderer.companionMesh!, j).scale.y;
        expect(companion / trueRadiusAu(kbo.binary!.diameterKm)).toBeCloseTo(1, 5);
        expect(primary + companion).toBeLessThan(kbo.binary!.separationKm / AU_KM);
      });
    } finally { renderer.dispose(); }
  });
});
