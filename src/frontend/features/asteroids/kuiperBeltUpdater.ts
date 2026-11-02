import { propagateBinaryKBOPositions, propagateKBOPositions, type KuiperBeltPopulation } from '../../../sim/kuiperBelt';
import type { BeltRendererHandle } from './beltRenderer';
import type { Object3D } from 'three';

function visibleInScene(object: Object3D | undefined): boolean {
  if (!object) return false;
  for (let node: Object3D | null = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}

/** One propagation per changed JD; camera motion and pause do no orbital work. */
export function createKuiperBeltUpdater(population: KuiperBeltPopulation,
  renderer: Pick<BeltRendererHandle, 'mesh' | 'companionMesh' | 'updatePositions' | 'updateBinaryPositions'>) {
  const positions = new Float32Array(population.count * 3);
  const companions = new Float32Array(population.binaryCount * 3);
  const binaryIndices: number[] = new Array(population.binaryCount).fill(0);
  let lastJd: number | null = null;
  const work = { primaryPropagationPasses: 0, binaryPropagationPasses: 0, unchangedEpochs: 0 };
  return {
    update(julianDate: number): boolean {
      if (!Number.isFinite(julianDate)) return false;
      // Keep lastJd at the last published state; reveal computes the then-current
      // date directly, without replaying all of the hidden epochs.
      if (!visibleInScene(renderer.mesh) && !visibleInScene(renderer.companionMesh)) return false;
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
