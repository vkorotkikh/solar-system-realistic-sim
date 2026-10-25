import {
  BufferGeometry, Float32BufferAttribute, Group, Mesh, OrthographicCamera,
  PerspectiveCamera, Points, PointsMaterial, Quaternion, Scene, ShaderMaterial,
  Vector3, WebGLRenderer, WebGLRenderTarget,
} from 'three';
import fixtures from '../fixtures/agn-sky-j2000.json';
import { createGWVisualization } from '../../src/frontend/features/solar/gravitationalWaves';
import { createWarpSlipstreamVisualization } from '../../src/frontend/features/superluminal-modeling/warpSlipstreamVisuals';
import { SAGITTARIUS_A_DIR, CENTAURUS_A_DIR, MAFFEI_1_DIR, M87_DIR } from '../../src/frontend/features/superluminal-modeling/agnShockwaveEngine';
import type { SourceKey } from '../../src/frontend/features/superluminal-modeling/sourceCoordinates';

interface Check { name: string; pass: boolean; actual: unknown; requirement: string }
interface OracleResult { gpu: { renderer: string; vendor: string; version: string }; checks: Check[]; glError: number }
declare global { interface Window { runAgnFrameOracle: () => OracleResult } }
const size = 256;
const directions: Record<SourceKey, Vector3> = {
  SagittariusA: SAGITTARIUS_A_DIR, CentaurusA: CENTAURUS_A_DIR, Maffei1: MAFFEI_1_DIR, M87: M87_DIR,
};

function camera(kind: 'top' | 'oblique' | 'obliqueOrtho') {
  const result = kind === 'oblique' ? new PerspectiveCamera(60, 1, 0.1, 100)
    : new OrthographicCamera(-8, 8, 8, -8, 0.1, 100);
  if (kind === 'top') result.position.set(0, 0, 20);
  else { result.position.set(0, -12, 9); result.up.set(0, 0, 1); }
  result.lookAt(0, 0, 0);
  result.updateMatrixWorld(true);
  return result;
}

function footprint(pixels: Uint8Array, threshold = 2) {
  let count = 0, xSum = 0, ySum = 0, minX = size, maxX = -1, minY = size, maxY = -1;
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const i = (y * size + x) * 4;
    if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) <= threshold) continue;
    count += 1; xSum += x + 0.5; ySum += size - y - 0.5;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { count, x: count ? xSum / count : null, y: count ? ySum / count : null,
    width: count ? maxX - minX + 1 : 0, height: count ? maxY - minY + 1 : 0 };
}

function imageDifference(a: Uint8Array, b: Uint8Array) {
  let total = 0, large = 0;
  for (let i = 0; i < a.length; i += 4) {
    let largest = 0;
    for (let c = 0; c < 3; c += 1) { const delta = Math.abs(a[i + c] - b[i + c]); total += delta; largest = Math.max(largest, delta); }
    if (largest > 8) large += 1;
  }
  return { meanAbsoluteByteError: total / (size * size * 3), changedPixelFraction: large / (size * size) };
}

function captionedCapture(label: string, pixels: Uint8Array) {
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Missing capture canvas context');
  const data = context.createImageData(size, size);
  for (let y = 0; y < size; y += 1) data.data.set(pixels.subarray(y * size * 4, (y + 1) * size * 4), (size - 1 - y) * size * 4);
  context.putImageData(data, 0, 0);
  const figure = document.createElement('figure'); const caption = document.createElement('figcaption'); caption.textContent = label;
  figure.append(caption, canvas); document.querySelector('#captures')?.append(figure);
}

window.runAgnFrameOracle = () => {
  const renderer = new WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(size, size); renderer.setClearColor(0, 1);
  const target = new WebGLRenderTarget(size, size, { depthBuffer: true, stencilBuffer: false });
  const gl = renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = { renderer: String(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
    vendor: String(debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)), version: String(gl.getParameter(gl.VERSION)) };
  const checks: Check[] = [];
  const check = (name: string, pass: boolean, actual: unknown, requirement: string) => checks.push({ name, pass, actual, requirement });
  const render = (scene: Scene, view: OrthographicCamera | PerspectiveCamera, label?: string) => {
    renderer.setRenderTarget(target); renderer.render(scene, view);
    const pixels = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    if (label) captionedCapture(label, pixels);
    return pixels;
  };
  try {
    // Actual GPU projection of event-engine bearings, compared with offline
    // spherical-trigonometry/pinhole fixtures, not Vector3.project expectations.
    for (const fixture of fixtures.sources) for (const kind of ['top', 'oblique'] as const) {
      const scene = new Scene();
      const direction = directions[fixture.key as SourceKey];
      const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(direction.clone().multiplyScalar(4).toArray(), 3));
      const material = new PointsMaterial({ color: 0xffffff, size: 9, sizeAttenuation: false });
      scene.add(new Points(geometry, material));
      const actual = footprint(render(scene, camera(kind), `${fixture.key}: ${kind}`), 200);
      const expected = kind === 'top' ? fixture.topPixel : fixture.obliquePixel;
      const error = actual.x === null || actual.y === null ? Infinity : Math.hypot(actual.x - expected[0], actual.y - expected[1]);
      check(`sky-screen:${fixture.key}:${kind}`, actual.count >= 64 && error < 1, { ...actual, expected, error }, 'At least 64 marker pixels; centroid within 1 pixel of independent fixture');
      geometry.dispose(); material.dispose();
    }

    for (const [name, factory] of [['GW', createGWVisualization], ['H29', createWarpSlipstreamVisualization]] as const) {
      const visual = factory(12);
      const scene = new Scene(); const parent = new Group(); scene.add(parent); parent.add(visual.mesh);
      const material = visual.mesh.material;
      if (!(material instanceof ShaderMaterial)) throw new Error('Expected production event shader');
      const uniforms = material.uniforms;
      visual.toggle(true); uniforms.propagationDir.value.set(1, 0, 0); uniforms.shockwaveDist.value = 0;
      if (name === 'GW') { uniforms.strainAmplitude.value = 0; uniforms.isAgnEvent.value = 0; }
      else { uniforms.stretchAmplitude.value = 0; uniforms.bubbleThickness.value = 2; }
      const flat = footprint(render(scene, camera('top'), `${name}: ecliptic top view`));
      check(`grid-plane:${name}`, flat.count > 1000 && flat.width > 120 && flat.height > 160, flat, 'Visible XY surface, not an edge-on XZ line');

      if (name === 'GW') {
        uniforms.propagationDir.value.set(0, 0, 1); uniforms.frequency.value = 1;
        uniforms.time.value = 0.25; uniforms.strainAmplitude.value = 0.1;
        const stretched = footprint(render(scene, camera('top'), 'GW: XY plus-strain axes'));
        check('gw-strain-axes', stretched.width >= 208 && stretched.width <= 214 && stretched.height >= 170 && stretched.height <= 176,
          stretched, '192px reference extent -> approximately 211px X and 173px Y at hPlus=0.1');
        uniforms.strainAmplitude.value = 0; uniforms.time.value = 0;
        for (const fixture of fixtures.sources) {
          const bearing = directions[fixture.key as SourceKey];
          uniforms.propagationDir.value.copy(bearing); uniforms.isAgnEvent.value = 0;
          const quiet = render(scene, camera('top'));
          uniforms.isAgnEvent.value = 1;
          const active = render(scene, camera('top'), `GW incoming wake: ${fixture.key}`);
          let energy = 0, signedMoment = 0;
          for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
            const i = (y * size + x) * 4;
            const excess = Math.max(0, active[i] + active[i + 1] + active[i + 2] - quiet[i] - quiet[i + 1] - quiet[i + 2]);
            const axisPosition = ((x + 0.5 - 128) / 16) * fixture.direction[0] + ((y + 0.5 - 128) / 16) * fixture.direction[1];
            energy += excess; signedMoment += excess * axisPosition;
          }
          const centroid = energy ? signedMoment / energy : null;
          check(`incoming-front:${fixture.key}`, energy > 10000 && centroid !== null && centroid > 0.25,
            { excessEnergy: energy, bearingAxisCentroid: centroid }, 'Wake on source-facing side of an inward-moving front: dot(localPosition, sourceBearing) > frontDistance');
        }
        uniforms.propagationDir.value.set(0.6, 0.8, 0); uniforms.strainAmplitude.value = 0.15;
        uniforms.isAgnEvent.value = 1; uniforms.time.value = 0.137; uniforms.shockwaveDist.value = 1.25;
      } else {
        uniforms.propagationDir.value.set(0, 0, 1);
        const base = footprint(render(scene, camera('obliqueOrtho')));
        uniforms.stretchAmplitude.value = 5;
        const raised = footprint(render(scene, camera('obliqueOrtho'), 'H29: +Z grid-normal displacement'));
        const deltaY = base.y === null || raised.y === null ? null : raised.y - base.y;
        check('h29-normal-axis', deltaY !== null && Math.abs(deltaY + 12.8) < 1,
          { base, raised, deltaY }, 'At xi=0, +1 scene Z maps to -12.8 screen pixels in the independent oblique orthographic camera');
        uniforms.propagationDir.value.set(0.6, 0.8, 0); uniforms.stretchAmplitude.value = 1.5;
        uniforms.shockwaveDist.value = 1.25;
      }

      const view = camera('oblique');
      const reference = render(scene, view, `${name}: local-frame reference`);
      const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
      const translation = new Vector3(8, -4, 2);
      parent.quaternion.copy(rotation); parent.position.copy(translation);
      view.position.applyQuaternion(rotation).add(translation); view.quaternion.premultiply(rotation); view.updateMatrixWorld(true);
      const moved = render(scene, view, `${name}: rigidly moved grid + camera`);
      const difference = imageDifference(reference, moved);
      check(`local-world-invariance:${name}`, footprint(reference).count > 1000 && difference.meanAbsoluteByteError < 0.25 && difference.changedPixelFraction < 0.005,
        difference, 'Same local event after common rigid transform: RGB MAE <0.25/255; pixels changing >8/255 <0.5%');
      visual.reset();
      const hidden = render(scene, view);
      check(`reset-no-submission:${name}`, footprint(hidden).count === 0 && renderer.info.render.calls === 0,
        { footprint: footprint(hidden), drawCalls: renderer.info.render.calls }, 'Reset hides grid and submits no draw calls');
      visual.dispose();
    }
    return { gpu, checks, glError: gl.getError() };
  } finally { target.dispose(); renderer.dispose(); }
};
