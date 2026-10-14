import type { Object3D, Vector3 } from 'three';
import type { SolarSystemModel } from '../../../sim/solarSystemModel';
import { evaluateLocalMetricShift, metricFrameDragPeak } from './smbhPropagation';

interface WarpDisplayState {
  direction: Vector3;
  timeSec: number;
  energyErg: number;
  smbhMassG: number;
  sourceDistanceCm: number;
}

/** Rebuild node positions from canonical state, then add independent display offsets.
 * One display-second of shift is an illustrative exposure, not frame integration.
 * This makes a frozen event independent of frame rate and prevents accumulated drift.
 */
export function applyMetricDisplayOffsets(
  model: SolarSystemModel,
  bodyNodes: ReadonlyMap<string, Object3D>,
  warp: WarpDisplayState | null
): void {
  let offsets: Map<string, Vector3> | undefined;
  if (warp) {
    const peak = metricFrameDragPeak(warp.timeSec, warp.energyErg, warp.smbhMassG);
    offsets = model.applyMetricKinematics(warp.direction, 1,
      distance => evaluateLocalMetricShift(distance, peak), warp.sourceDistanceCm, 1e12);
  }
  for (const body of model.getBodies()) {
    const state = model.getState(body.id);
    const node = bodyNodes.get(body.id);
    if (!node || !state?.available) continue;
    node.position.copy(state.worldPosition);
    const offset = offsets?.get(body.id);
    if (offset) node.position.add(offset);
    // Planets are direct children of solarSystemGroup; moons inherit planet nodes.
    if (body.parentId && body.parentId !== 'sun') {
      const parent = model.getState(body.parentId);
      if (parent?.available) node.position.sub(parent.worldPosition);
      const parentOffset = offsets?.get(body.parentId);
      if (parentOffset) node.position.sub(parentOffset);
    }
  }
}
