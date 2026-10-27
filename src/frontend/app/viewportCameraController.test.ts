import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { applyCameraAction, cameraActionForKey, type CameraControlsLike } from './viewportCameraController';
function rig() {
  const camera = new PerspectiveCamera(60, 1, .01, 1000); camera.position.set(2, 3, 14);
  const controls: CameraControlsLike = { target: new Vector3(2,3,4), enabled:true, enableRotate:true, enablePan:true, enableZoom:true, rotateSpeed:1, panSpeed:1, zoomSpeed:1, minDistance:1, maxDistance:20, minPolarAngle:0, maxPolarAngle:Math.PI, minAzimuthAngle:-Infinity, maxAzimuthAngle:Infinity, screenSpacePanning:true };
  return { camera, controls };
}
const key = { key:'+', code:'Equal', shiftKey:true, ctrlKey:false, metaKey:false, altKey:false, isComposing:false, defaultPrevented:false };
describe('camera action contract', () => {
  it.each([['ArrowLeft','orbit-left'],['ArrowRight','orbit-right'],['ArrowUp','orbit-up'],['ArrowDown','orbit-down'],['+','zoom-in'],['=','zoom-in'],['-','zoom-out']])('maps %s', (input, action) => expect(cameraActionForKey({...key,key:input,shiftKey:false})).toBe(action));
  it('respects browser shortcuts, IME, prevented events and unsupported keys', () => {
    for(const modifier of ['ctrlKey','metaKey','altKey','isComposing','defaultPrevented']) expect(cameraActionForKey({...key,[modifier]:true})).toBeNull();
    for(const input of ['Tab','Escape',' ','a']) expect(cameraActionForKey({...key,key:input})).toBeNull();
    expect(cameraActionForKey({...key,key:'ArrowLeft'})).toBe('pan-left');
    expect(cameraActionForKey({...key,key:'Add',code:'NumpadAdd'})).toBe('zoom-in');
    expect(cameraActionForKey({...key,key:'Subtract',code:'NumpadSubtract'})).toBe('zoom-out');
  });
  it('orbits five degrees around the current target and retains target identity', () => {
    const {camera, controls}=rig(); const target=controls.target;
    applyCameraAction(camera,controls,'orbit-left');
    expect(camera.position.x-2).toBeCloseTo(-10*Math.sin(Math.PI/36),10);
    expect(camera.position.distanceTo(target)).toBeCloseTo(10,10); expect(controls.target).toBe(target);
  });
  it('pans five percent of view height and derives axes after an orbit', () => {
    const {camera, controls}=rig(); applyCameraAction(camera,controls,'orbit-left');
    const offset=camera.position.clone().sub(controls.target); const before=controls.target.clone();
    applyCameraAction(camera,controls,'pan-right');
    const movement=controls.target.clone().sub(before);
    expect(movement.length()).toBeCloseTo(2*10*Math.tan(Math.PI/6)*.05,10);
    expect(movement.dot(offset)).toBeCloseTo(0,10);
    expect(camera.position.clone().sub(controls.target).distanceTo(offset)).toBeLessThan(1e-12);
  });
  it('honors live zoom speed, flags, distance/angular bounds and a rotated up axis', () => {
    const {camera,controls}=rig(); controls.zoomSpeed=2;
    applyCameraAction(camera,controls,'zoom-in'); expect(camera.position.distanceTo(controls.target)).toBeCloseTo(10*.95**2);
    controls.minDistance=9.5; applyCameraAction(camera,controls,'zoom-in'); expect(camera.position.distanceTo(controls.target)).toBeCloseTo(9.5);
    controls.enabled=false; const before=camera.position.clone(); expect(applyCameraAction(camera,controls,'orbit-up')).toBe(false); expect(camera.position.equals(before)).toBe(true);
    controls.enabled=true; controls.enablePan=false; expect(applyCameraAction(camera,controls,'pan-left')).toBe(false);
    camera.up.set(0,0,1); controls.maxPolarAngle=Math.PI/2;
    for(let i=0;i<100;i++) applyCameraAction(camera,controls,'orbit-up');
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
    expect(camera.position.clone().sub(controls.target).normalize().dot(camera.up)).toBeCloseTo(1,8);
    controls.minAzimuthAngle=-.1; controls.maxAzimuthAngle=.1;
    for(let i=0;i<100;i++) applyCameraAction(camera,controls,'orbit-right');
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
  });
});
