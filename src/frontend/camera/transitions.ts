// @ts-nocheck
import { Vector3 } from 'three';

export function createCameraTransitions({ camera, controls }) {
  const state = {
    active: false,
    elapsedSec: 0,
    durationSec: 1.0,
    startTarget: new Vector3(),
    startCamera: new Vector3(),
    endTarget: new Vector3(),
    endCamera: new Vector3(),
    onComplete: null
  };

  function startCameraTransition(endTarget, endCamera, durationSec = 1.2, onComplete = null) {
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

  function updateCameraTransition(deltaSeconds) {
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
      if (onCompleteHandler) {
        onCompleteHandler();
      }
    }
  }

  function cancelCameraTransition() {
    state.active = false;
    state.onComplete = null;
    controls.enabled = true;
  }

  function isCameraTransitionActive() {
    return state.active;
  }

  function flyToInterstellarTarget(targetPosition, onComplete) {
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
