import { describe, expect, it } from 'vitest';
import { generateKuiperBelt, propagateBinaryKBOPositions, propagateKBOPositions } from '../../../sim/kuiperBelt';
import { createKuiperBeltRenderer } from './beltRenderer';
import { createKuiperBeltUpdater } from './kuiperBeltUpdater';

describe('Kuiper buffer work (SCN-024)', () => {
  it('does zero propagation, matrix writes or upload requests for 600 paused frames, and responds to date changes', () => {
    const population = generateKuiperBelt(500);
    const renderer = createKuiperBeltRenderer(population.kbos);
    const updater = createKuiperBeltUpdater(population, renderer);
    try {
      expect(updater.update(2451545)).toBe(true);
      const initialMatrices = renderer.mesh.instanceMatrix.array.slice();
      const initialBinaryMatrices = renderer.companionMesh!.instanceMatrix.array.slice();
      const primaryWork = { ...renderer.mesh.userData.kuiperBufferWork };
      const companionWork = { ...renderer.companionMesh!.userData.kuiperBufferWork };
      for (let frame = 0; frame < 600; frame++) expect(updater.update(2451545)).toBe(false);
      expect(updater.getWorkStats()).toEqual({ primaryPropagationPasses: 1, binaryPropagationPasses: 1, unchangedEpochs: 600 });
      expect(renderer.mesh.userData.kuiperBufferWork).toEqual(primaryWork);
      expect(renderer.companionMesh!.userData.kuiperBufferWork).toEqual(companionWork);
      expect(updater.update(2451546)).toBe(true);
      expect(renderer.mesh.instanceMatrix.array).not.toEqual(initialMatrices);
      expect(updater.update(2451545)).toBe(true);
      expect(renderer.mesh.instanceMatrix.array).toEqual(initialMatrices);
      expect(renderer.companionMesh!.instanceMatrix.array).toEqual(initialBinaryMatrices);
      expect(updater.getWorkStats().primaryPropagationPasses).toBe(3);
      expect(updater.update(NaN)).toBe(false);
    } finally { renderer.dispose(); }
  });

  it('does not propagate or submit a nonexistent companion buffer', () => {
    const population = generateKuiperBelt(8);
    const renderer = createKuiperBeltRenderer(population.kbos);
    const updater = createKuiperBeltUpdater(population, renderer);
    try {
      updater.update(2451545);
      expect(updater.getWorkStats().binaryPropagationPasses).toBe(0);
      expect(renderer.companionMesh).toBeUndefined();
    } finally { renderer.dispose(); }
  });

  it('does not dirty either instance buffer for unchanged Float32 positions', () => {
    const population = generateKuiperBelt(500);
    const renderer = createKuiperBeltRenderer(population.kbos);
    const positions = new Float32Array(population.count * 3);
    const companions = new Float32Array(population.binaryCount * 3);
    try {
      expect(population.binaryCount).toBeGreaterThan(0);
      propagateKBOPositions(population.kbos, 2451545, positions);
      propagateBinaryKBOPositions(population.kbos, 2451545, positions, [], companions);
      renderer.updatePositions(positions);
      renderer.updateBinaryPositions!(companions);
      const primaryVersion = renderer.mesh.instanceMatrix.version;
      const binaryVersion = renderer.companionMesh!.instanceMatrix.version;
      for (let i = 0; i < 10; i++) {
        renderer.updatePositions(positions);
        renderer.updateBinaryPositions!(companions);
      }
      expect(renderer.mesh.instanceMatrix.version).toBe(primaryVersion);
      expect(renderer.companionMesh!.instanceMatrix.version).toBe(binaryVersion);
      positions[0] += 1;
      renderer.updatePositions(positions);
      renderer.updateBinaryPositions!(companions);
      expect(renderer.mesh.instanceMatrix.version).toBe(primaryVersion + 1);
      expect(renderer.companionMesh!.instanceMatrix.version).toBe(binaryVersion);
    } finally { renderer.dispose(); }
  });
});
