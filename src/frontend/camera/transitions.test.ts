import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { createCameraTransitions } from './transitions';

function setup() {
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0, 10);
  const controls = { enabled: true, target: new Vector3() };
  return { camera, controls, transitions: createCameraTransitions({ camera, controls }) };
}

describe('camera transition input boundaries (FE-083)', () => {
  it.each([NaN, Infinity, -Infinity])('rejects duration %s before locking the controls', duration => {
    const { camera, controls, transitions } = setup();
    expect(() => transitions.startCameraTransition(new Vector3(1, 2, 3), new Vector3(4, 5, 6), duration))
      .toThrow(RangeError);
    expect(transitions.isCameraTransitionActive()).toBe(false);
    expect(controls.enabled).toBe(true);
    expect(camera.position.toArray()).toEqual([0, 0, 10]);
    expect(controls.target.toArray()).toEqual([0, 0, 0]);
  });

  it.each([NaN, Infinity, -Infinity])('rejects timestep %s without poisoning an active transition', delta => {
    const { camera, controls, transitions } = setup();
    transitions.startCameraTransition(new Vector3(1, 2, 3), new Vector3(4, 5, 6), 1);
    expect(() => transitions.updateCameraTransition(delta)).toThrow(RangeError);
    expect(camera.position.toArray()).toEqual([0, 0, 10]);
    expect(controls.target.toArray()).toEqual([0, 0, 0]);
    transitions.updateCameraTransition(1);
    expect(camera.position.toArray()).toEqual([4, 5, 6]);
    expect(controls.target.toArray()).toEqual([1, 2, 3]);
    expect(transitions.isCameraTransitionActive()).toBe(false);
    expect(controls.enabled).toBe(true);
  });

  it('preserves finite negative-time clamping and fires completion once', () => {
    const { camera, controls, transitions } = setup();
    let completed = 0;
    transitions.startCameraTransition(new Vector3(1, 2, 3), new Vector3(4, 5, 6), -2, () => completed++);
    transitions.updateCameraTransition(-1);
    expect(camera.position.toArray()).toEqual([0, 0, 10]);
    expect(controls.enabled).toBe(false);
    transitions.updateCameraTransition(.05);
    transitions.updateCameraTransition(1);
    expect(completed).toBe(1);
    expect(controls.enabled).toBe(true);
    expect(camera.position.toArray()).toEqual([4, 5, 6]);
  });
});
