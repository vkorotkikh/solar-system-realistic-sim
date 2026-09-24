import { PerspectiveCamera, Vector3 } from 'three';

interface ControlsLike {
  enabled: boolean;
  target: Vector3;
}

interface CameraTransitionState {
  active: boolean;
  elapsedSec: number;
  durationSec: number;
  startTarget: Vector3;
  startCamera: Vector3;
  endTarget: Vector3;
  endCamera: Vector3;
  onComplete: (() => void) | null;
}

interface CreateCameraTransitionsArgs {
  camera: PerspectiveCamera;
  controls: ControlsLike;
}

export function createCameraTransitions({ camera, controls }: CreateCameraTransitionsArgs) {
  const state: CameraTransitionState = {
    active: false,
    elapsedSec: 0,
    durationSec: 1.0,
    startTarget: new Vector3(),
    startCamera: new Vector3(),
    endTarget: new Vector3(),
    endCamera: new Vector3(),
    onComplete: null
  };

  function startCameraTransition(
    endTarget: Vector3,
    endCamera: Vector3,
    durationSec = 1.2,
    onComplete: (() => void) | null = null
  ): void {
    state.active = true;
    state.elapsedSec = 0;
    state.durationSec = Math.max(0.05, durationSec);
    state.startTarget.copy(controls.target);
    state.startCamera.copy(camera.position);
    state.endTarget.copy(endTarget);
    state.endCamera.copy(endCamera);
    state.onComplete = typeof onComplete === 'function' ? onComplete : null;
    controls.enabled = false;
  }

  function updateCameraTransition(deltaSeconds: number): void {
    if (!state.active) return;
    state.elapsedSec += Math.max(0, deltaSeconds);
    const normalized = Math.min(1, state.elapsedSec / state.durationSec);
    const eased = 1 - Math.pow(1 - normalized, 3);

    controls.target.lerpVectors(state.startTarget, state.endTarget, eased);
    camera.position.lerpVectors(state.startCamera, state.endCamera, eased);

    if (normalized >= 1) {
      const onCompleteHandler = state.onComplete;
      state.active = false;
      state.onComplete = null;
      controls.enabled = true;
      if (typeof onCompleteHandler === 'function') {
        onCompleteHandler();
      }
    }
  }

  function cancelCameraTransition(): void {
    state.active = false;
    state.onComplete = null;
    controls.enabled = true;
  }

  function isCameraTransitionActive(): boolean {
    return state.active;
  }

  function flyToInterstellarTarget(targetPosition: Vector3, onComplete: (() => void) | null = null): void {
    // Calculate a safe standoff distance for the approach (e.g. 1000 AU)
    // The actual system switch handles the final precision approach.
    const approachDistance = 1000;
    const offset = camera.position.clone().sub(targetPosition);
    if (offset.length() < 0.1) {
      offset.set(0, 0, 1);
    }
    const endCamera = targetPosition.clone().add(offset.setLength(approachDistance));

    // We want a longer duration for the "warp" feel, maybe depending on distance?
    // For now, fixed duration for the "warp out" phase.
    startCameraTransition(targetPosition, endCamera, 3.5, onComplete);
  }

  return {
    state,
    startCameraTransition,
    updateCameraTransition,
    cancelCameraTransition,
    isCameraTransitionActive,
    flyToInterstellarTarget
  };
}
