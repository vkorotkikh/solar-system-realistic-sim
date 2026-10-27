import {
  AmbientLight,
  Color,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  PointLight,
  Scene,
  WebGLRenderer
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { renderPixelRatio, type RuntimeUiConfig } from './runtimeConfig';
export { createRuntimeUiConfig } from './runtimeConfig';

type OrbitControlsInstance = InstanceType<typeof OrbitControls>;

interface SceneSetupParams {
  canvas: HTMLCanvasElement;
  runtimeUiConfig: RuntimeUiConfig;
  initialZoomSensitivity: number;
  solarSystemMaxDistanceAu: number;
  minDistance?: number;
  backgroundColor?: string;
}

interface SceneSetup {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControlsInstance;
}

interface SceneGroups {
  solarSystemGroup: Group;
  routeGroup: Group;
  gravityVectorGroup: Group;
  nearbySystemsGroup: Group;
  localSystemGroup: Group;
}

interface SceneLighting {
  ambientLight: AmbientLight;
  hemisphereLight: HemisphereLight;
  sunLight: PointLight;
}

export function applyViewportSizeOverride({
  viewportShell,
  runtimeUiConfig
}: {
  viewportShell: HTMLElement | null;
  runtimeUiConfig: RuntimeUiConfig;
}): void {
  if (!viewportShell) return;
  if (runtimeUiConfig.uiWidth) viewportShell.style.width = `${runtimeUiConfig.uiWidth}px`;
  if (runtimeUiConfig.uiHeight) viewportShell.style.height = `${runtimeUiConfig.uiHeight}px`;
  viewportShell.style.maxWidth = '100%';
  viewportShell.style.maxHeight = '100vh';
  viewportShell.style.margin = '0 auto';
  viewportShell.style.alignSelf = 'center';
}

export function updateRenderResolutionStatus({
  statusElement,
  renderWidth,
  renderHeight,
  viewportWidth,
  viewportHeight,
  maxPixelRatio
}: {
  statusElement: HTMLElement | null;
  renderWidth: number;
  renderHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  maxPixelRatio: number | null;
}): void {
  if (!statusElement) return;
  const dpr = Math.min(window.devicePixelRatio || 1, maxPixelRatio ?? 2);
  statusElement.textContent =
    `Render: ${renderWidth}x${renderHeight} (view ${viewportWidth}x${viewportHeight}, DPR ${dpr.toFixed(2)} cap)`;
}

export function createSceneSetup({
  canvas,
  runtimeUiConfig,
  initialZoomSensitivity,
  solarSystemMaxDistanceAu,
  minDistance = 0.0002,
  backgroundColor = '#03070c'
}: SceneSetupParams): SceneSetup {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false
  });
  renderer.setPixelRatio(renderPixelRatio(runtimeUiConfig, window.devicePixelRatio));

  const scene = new Scene();
  scene.background = new Color(backgroundColor);

  const camera = new PerspectiveCamera(58, 1, 0.0001, 20_000);
  camera.up.set(0, 0, 1);
  camera.position.set(0, -10, 6);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxDistance = solarSystemMaxDistanceAu;
  controls.minDistance = minDistance;
  controls.zoomSpeed = initialZoomSensitivity;
  controls.target.set(0, 0, 0);

  return {
    renderer,
    scene,
    camera,
    controls
  };
}

export function addDefaultLighting(scene: Scene): SceneLighting {
  const ambientLight = new AmbientLight('#2a3a47', 0.3);
  scene.add(ambientLight);

  const hemisphereLight = new HemisphereLight('#5a8aab', '#1a0f08', 0.12);
  scene.add(hemisphereLight);

  const sunLight = new PointLight('#fff5e0', 1.8, 0, 0);
  sunLight.position.set(0, 0, 0);
  scene.add(sunLight);

  return {
    ambientLight,
    hemisphereLight,
    sunLight
  };
}

export function createSceneGroups(scene: Scene): SceneGroups {
  const solarSystemGroup = new Group();
  scene.add(solarSystemGroup);

  const routeGroup = new Group();
  solarSystemGroup.add(routeGroup);

  const gravityVectorGroup = new Group();
  gravityVectorGroup.visible = false;
  solarSystemGroup.add(gravityVectorGroup);

  const nearbySystemsGroup = new Group();
  nearbySystemsGroup.visible = false;
  scene.add(nearbySystemsGroup);

  const localSystemGroup = new Group();
  localSystemGroup.visible = false;
  scene.add(localSystemGroup);

  return {
    solarSystemGroup,
    routeGroup,
    gravityVectorGroup,
    nearbySystemsGroup,
    localSystemGroup
  };
}
