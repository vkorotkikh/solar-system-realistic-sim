import { propagateBinaryKBOPositions, propagateKBOPositions, type KuiperBeltPopulation } from '../../../sim/kuiperBelt';
import type { BeltRendererHandle } from './beltRenderer';

/** One propagation per changed JD; camera motion and pause do no orbital work. */
export function createKuiperBeltUpdater(population: KuiperBeltPopulation,
  renderer: Pick<BeltRendererHandle, 'updatePositions' | 'updateBinaryPositions'>) {
  const positions = new Float32Array(population.count * 3);
  const companions = new Float32Array(population.binaryCount * 3);
  const binaryIndices: number[] = new Array(population.binaryCount).fill(0);
  let lastJd: number | null = null;
  const work = { primaryPropagationPasses: 0, binaryPropagationPasses: 0, unchangedEpochs: 0 };
  return {
    update(julianDate: number): boolean {
      if (!Number.isFinite(julianDate)) return false;
      if (julianDate === lastJd) { work.unchangedEpochs++; return false; }
      propagateKBOPositions(population.kbos, julianDate, positions);
      work.primaryPropagationPasses++;
      renderer.updatePositions(positions);
      if (population.binaryCount > 0) {
        propagateBinaryKBOPositions(population.kbos, julianDate, positions, binaryIndices, companions);
        work.binaryPropagationPasses++;
        renderer.updateBinaryPositions?.(companions);
      }
      lastJd = julianDate;
      return true;
    },
    getWorkStats: () => ({ ...work })
  };
}
