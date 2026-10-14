import { PerspectiveCamera, Quaternion, Spherical, Vector3 } from 'three';
export type CameraAction = 'orbit-left' | 'orbit-right' | 'orbit-up' | 'orbit-down' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down' | 'zoom-in' | 'zoom-out';
export interface CameraControlsLike {
  target: Vector3; enabled: boolean; enableRotate: boolean; enablePan: boolean; enableZoom: boolean;
  rotateSpeed: number; panSpeed: number; zoomSpeed: number; screenSpacePanning: boolean;
  minDistance: number; maxDistance: number; minPolarAngle: number; maxPolarAngle: number;
  minAzimuthAngle: number; maxAzimuthAngle: number;
}
type KeyInput = Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey' | 'isComposing' | 'defaultPrevented'>;
const actions = new Set<CameraAction>(['orbit-left','orbit-right','orbit-up','orbit-down','pan-left','pan-right','pan-up','pan-down','zoom-in','zoom-out']);
export function cameraActionForKey(event: KeyInput): CameraAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.defaultPrevented) return null;
  const directions: Record<string, string> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  if (directions[event.key]) return `${event.shiftKey ? 'pan' : 'orbit'}-${directions[event.key]}` as CameraAction;
  if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') return 'zoom-in';
  if (event.key === '-' || event.code === 'NumpadSubtract') return 'zoom-out';
  return null;
}
function accepts(controls: CameraControlsLike, action: CameraAction) {
  return actions.has(action) && controls.enabled && (action.startsWith('orbit-') ? controls.enableRotate : action.startsWith('pan-') ? controls.enablePan && controls.screenSpacePanning : controls.enableZoom);
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function applyCameraAction(camera: PerspectiveCamera, controls: CameraControlsLike, action: CameraAction): boolean {
  if (!accepts(controls, action) || !camera.isPerspectiveCamera) return false;
  const offset = camera.position.clone().sub(controls.target);
  if (action.startsWith('pan-')) {
    // Derive axes from the updated pose, including earlier actions in this flush.
    camera.lookAt(controls.target);
    const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const step = .05 * 2 * offset.length() * Math.tan(camera.fov * Math.PI / 360) / camera.zoom * controls.panSpeed;
    const movement = action === 'pan-left' ? right.multiplyScalar(-step) : action === 'pan-right' ? right.multiplyScalar(step) : action === 'pan-up' ? up.multiplyScalar(step) : up.multiplyScalar(-step);
    controls.target.add(movement); camera.position.add(movement);
  } else {
    const frame = new Quaternion().setFromUnitVectors(camera.up.clone().normalize(), new Vector3(0, 1, 0));
    const spherical = new Spherical().setFromVector3(offset.applyQuaternion(frame));
    const step = Math.PI / 36 * controls.rotateSpeed;
    if (action === 'orbit-left') spherical.theta -= step;
    if (action === 'orbit-right') spherical.theta += step;
    if (action === 'orbit-up') spherical.phi -= step;
    if (action === 'orbit-down') spherical.phi += step;
    if (action === 'zoom-in') spherical.radius *= .95 ** controls.zoomSpeed;
    if (action === 'zoom-out') spherical.radius /= .95 ** controls.zoomSpeed;
    let min = controls.minAzimuthAngle; let max = controls.maxAzimuthAngle;
    if (Number.isFinite(min) && Number.isFinite(max)) {
      if (min < -Math.PI) min += Math.PI * 2; else if (min > Math.PI) min -= Math.PI * 2;
      if (max < -Math.PI) max += Math.PI * 2; else if (max > Math.PI) max -= Math.PI * 2;
      spherical.theta = min <= max ? clamp(spherical.theta, min, max) : spherical.theta > (min + max) / 2 ? Math.max(min, spherical.theta) : Math.min(max, spherical.theta);
    } else spherical.theta = clamp(spherical.theta, min, max);
    spherical.phi = clamp(spherical.phi, controls.minPolarAngle, controls.maxPolarAngle);
    spherical.makeSafe(); spherical.radius = clamp(spherical.radius, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(new Vector3().setFromSpherical(spherical).applyQuaternion(frame.invert()));
  }
  camera.lookAt(controls.target); camera.updateMatrixWorld(); return true;
}
export function createViewportCameraController({ canvas, actionRoot, camera, controls }: { canvas: HTMLCanvasElement; actionRoot: HTMLElement; camera: PerspectiveCamera; controls: CameraControlsLike }) {
  const pending: CameraAction[] = [];
  function onKey(event: KeyboardEvent) {
    if (canvas.ownerDocument.activeElement !== canvas || event.target !== canvas || canvas.isContentEditable || canvas.closest('[inert]')) return;
    const action = cameraActionForKey(event);
    if (action && accepts(controls, action)) { event.preventDefault(); pending.push(action); }
  }
  function onClick(event: MouseEvent) {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-camera-action]');
    if (!button || !actionRoot.contains(button) || button.disabled || button.closest('[inert]')) return;
    const action = button.dataset.cameraAction as CameraAction;
    if (accepts(controls, action)) pending.push(action);
  }
  canvas.addEventListener('keydown', onKey); actionRoot.addEventListener('click', onClick);
  return { applyPendingActions() { for (const action of pending.splice(0)) applyCameraAction(camera, controls, action); }, dispose() {
    pending.length = 0; canvas.removeEventListener('keydown', onKey); actionRoot.removeEventListener('click', onClick);
  } };
}
