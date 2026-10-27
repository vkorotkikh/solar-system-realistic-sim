import type { Object3D, Vector3 } from 'three';
import type { SolarSystemModel } from '../../../sim/solarSystemModel';
import { AU_CM } from './smbhPhysicsConstants';
import { warpBubbleProfile } from './smbhPropagation';
import { H29_DISPLAY_PEAK_AU, h29DisplayThicknessAu } from './h29DisplayScale';

interface WarpDisplayState {
  direction: Vector3;
  positionCm: number;
  amplitude: number;
  thickness: number;
}

function metricDisplayOffsets(
  model: SolarSystemModel,
  warp: WarpDisplayState
): Map<string, Vector3> | undefined {
  const direction = warp.direction.clone();
  const directionLengthSq = direction.lengthSq();
  if (![direction.x, direction.y, direction.z, warp.positionCm, warp.amplitude, warp.thickness].every(Number.isFinite)
      || !Number.isFinite(directionLengthSq) || directionLengthSq === 0) return undefined;

  direction.normalize();
  // Follow the compressed front shown by warpSlipstreamVisuals. The physical
  // beta profile is both sub-kilometre and effectively common-mode here, so it
  // cannot provide an observable Solar-System-scale illustration.
  const frontPositionAu = warp.positionCm / AU_CM;
  const thicknessAu = h29DisplayThicknessAu(warp.thickness);
  const amplitude = Math.min(1, Math.max(0, warp.amplitude));
  const offsets = new Map<string, Vector3>();

  for (const body of model.getBodies()) {
    const state = model.getState(body.id);
    if (!state?.available) continue;
    const xi = (state.worldPosition.dot(direction) - frontPositionAu) / thicknessAu;
    const displacementAu = H29_DISPLAY_PEAK_AU * amplitude * warpBubbleProfile(xi);
    if (displacementAu > 0) offsets.set(body.id, direction.clone().multiplyScalar(displacementAu));
  }
  return offsets;
}

/** Rebuild node positions from canonical state, then sample the illustrative front.
 * Offsets are absolute display values, not frame integration, so a frozen event is
 * frame-rate independent and repeated rendering cannot accumulate drift.
 */
export function applyMetricDisplayOffsets(
  model: SolarSystemModel,
  bodyNodes: ReadonlyMap<string, Object3D>,
  warp: WarpDisplayState | null
): void {
  const offsets = warp ? metricDisplayOffsets(model, warp) : undefined;
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
