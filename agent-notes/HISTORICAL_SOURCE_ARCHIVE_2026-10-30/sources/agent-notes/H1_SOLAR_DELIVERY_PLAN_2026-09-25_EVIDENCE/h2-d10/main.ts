// Scratch render harness for D10 (not committed): the real Sun shaders, the real spin-axis transform
// from main.ts, a fixed state, and two cameras; reports limb-brightness metrics on window.__result.
import { DataTexture, FloatType, Group, NoBlending, PerspectiveCamera, RGBAFormat, Scene, SphereGeometry, Mesh, Vector3, WebGLRenderer, WebGLRenderTarget } from 'three';
import { createSunCoronaShell, createSunSurfaceMaterial, updateSunMaterialUniforms, updateSunspotUniforms } from '../src/frontend/features/solar/sunVisuals';

const SIZE = 512;
const ACTIVITY = 0.08; // solar-minimum level of the cycle model
const tilt = (7.25 * Math.PI) / 180;
const spinAxis = new Vector3(Math.sin(tilt), 0, Math.cos(tilt)).normalize(); // main.ts:319-327 with spinAxisLongitude 0

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, preserveDrawingBuffer: true, antialias: false });
renderer.setSize(SIZE, SIZE, false);
renderer.setClearColor(0x000000, 1);

const baseMap = new DataTexture(new Uint8Array([255, 170, 70, 255]), 1, 1, RGBAFormat);
baseMap.needsUpdate = true;
const surface = createSunSurfaceMaterial(baseMap)!;
const sunMesh = new Mesh(new SphereGeometry(1, 128, 96), surface);
const corona = createSunCoronaShell(new SphereGeometry(1, 128, 96));
corona.scale.setScalar(1.15);
const spinGroup = new Group();
spinGroup.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), spinAxis);
sunMesh.rotation.y = 0.7; // arbitrary spin phase, as main.ts sets child.rotation.y
corona.rotation.y = 0.7;
spinGroup.add(sunMesh, corona);
const coronaBlending = corona.material.blending;
const scene = new Scene();
scene.add(spinGroup);
updateSunMaterialUniforms({ sunSurfaceMaterial: surface, sunCoronaMaterial: corona.material, timeSec: 100, activity: ACTIVITY, sunDisplayRadius: 1 });
updateSunspotUniforms(surface, ACTIVITY, 100, undefined);

function render(eye: Vector3, up: Vector3) {
  const camera = new PerspectiveCamera(20, 1, 0.1, 100);
  camera.position.copy(eye);
  camera.up.copy(up);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  // Visible frame, as the app would draw it.
  sunMesh.visible = true;
  corona.material.blending = coronaBlending;
  corona.material.transparent = true;
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
  const frame = canvas.toDataURL('image/png');
  // Corona opacity alone, unblended, in float: the polar-hole and streamer terms act on it.
  sunMesh.visible = false;
  corona.material.blending = NoBlending;
  corona.material.transparent = false;
  const target = new WebGLRenderTarget(SIZE, SIZE, { type: FloatType });
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setClearColor(0x000000, 1);
  const px = new Float32Array(SIZE * SIZE * 4);
  renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, px);
  renderer.setRenderTarget(null);
  const centre = new Vector3(0, 0, 0).project(camera);
  const right = new Vector3().crossVectors(new Vector3().subVectors(new Vector3(0, 0, 0), eye).normalize(), up).normalize();
  const edge = right.clone().project(camera);
  const cx = (centre.x + 1) * SIZE / 2, cy = (centre.y + 1) * SIZE / 2;
  const rPx = Math.abs((edge.x - centre.x) * SIZE / 2);
  // Sector means of corona alpha in the visible off-limb ring 1.10-1.149 R (the shell is 1.15 R); angle 0 = screen up.
  const bins = new Array(36).fill(0), counts = new Array(36).fill(0);
  let maxAlpha = 0;
  for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy) / rPx;
    const a = px[(y * SIZE + x) * 4 + 3];
    if (r >= 1.0 && r < 1.15) maxAlpha = Math.max(maxAlpha, a);
    if (r < 1.10 || r > 1.149) continue;
    const angle = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    const b = Math.floor(angle / 10) % 36; bins[b] += a; counts[b] += 1;
  }
  // Contrast-stretched alpha map for the before/after record (row 0 of readPixels is the bottom).
  const view = document.createElement('canvas'); view.width = SIZE; view.height = SIZE;
  const ctx = view.getContext('2d')!; const img = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
    const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rPx;
    const v = r < 1 ? 40 : Math.round(255 * Math.min(1, px[(y * SIZE + x) * 4 + 3] / Math.max(1e-9, maxAlpha)));
    const o = ((SIZE - 1 - y) * SIZE + x) * 4; img.data[o] = v; img.data[o + 1] = v * 0.8; img.data[o + 2] = v * 0.5; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const mean = bins.map((v, i) => v / Math.max(1, counts[i]));
  const sector = (centres: number[]) => {
    const picks = mean.filter((_, i) => centres.some((c) => Math.abs((((i * 10 + 5) - c + 540) % 360) - 180) <= 25));
    return picks.reduce((a, b) => a + b, 0) / picks.length;
  };
  const avg = mean.reduce((a, b) => a + b, 0) / mean.length;
  const cv = Math.sqrt(mean.reduce((a, b) => a + (b - avg) ** 2, 0) / mean.length) / avg;
  return { polar: sector([0, 180]), equatorial: sector([90, 270]), cv, rPx, frame, image: view.toDataURL('image/png') };
}

const side = render(new Vector3(-12, 0, 0), new Vector3(0, 0, 1)); // ecliptic-plane view: true spin axis vertical
const pole = render(spinAxis.clone().multiplyScalar(12), new Vector3(1, 0, 0).sub(spinAxis.clone().multiplyScalar(spinAxis.x)).normalize());
(window as unknown as { __result: unknown }).__result = {
  activity: ACTIVITY,
  coronalHoleActivity: corona.material.uniforms.coronalHoleActivity.value,
  side: { polar: side.polar, equatorial: side.equatorial, polarToEquatorial: side.polar / side.equatorial, image: side.image, frame: side.frame },
  pole: { limbCv: pole.cv, image: pole.image, frame: pole.frame }
};
