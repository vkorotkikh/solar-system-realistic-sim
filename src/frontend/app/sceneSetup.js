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

function clampRuntimeNumber(value, min, max) {
  if (!Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

function readRuntimeNumber(searchParams, paramKey, envKey, fallback, min, max, envSource) {
  const fromQuery = searchParams.get(paramKey);
  if (fromQuery !== null && fromQuery.trim() !== '') {
    const parsed = Number(fromQuery);
    const clamped = clampRuntimeNumber(parsed, min, max);
    if (clamped !== null) return clamped;
  }

  const fromEnv = envSource?.[envKey];
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
    const parsed = Number(fromEnv);
    const clamped = clampRuntimeNumber(parsed, min, max);
    if (clamped !== null) return clamped;
  }

  return fallback;
}

export function createRuntimeUiConfig({
  search = window.location.search,
  env = import.meta.env
} = {}) {
  const params = new URLSearchParams(search);
  const uiWidth = readRuntimeNumber(params, 'uiWidth', 'VITE_UI_WIDTH', null, 640, 10_000, env);
  const uiHeight = readRuntimeNumber(params, 'uiHeight', 'VITE_UI_HEIGHT', null, 360, 10_000, env);
  const renderScale = readRuntimeNumber(params, 'renderScale', 'VITE_RENDER_SCALE', 1, 0.5, 3, env);
  const maxPixelRatio = readRuntimeNumber(params, 'maxPixelRatio', 'VITE_MAX_PIXEL_RATIO', 2, 1, 4, env);
  return {
    uiWidth,
    uiHeight,
    renderScale,
    maxPixelRatio
  };
}

export function applyViewportSizeOverride({
  viewportShell,
  runtimeUiConfig
}) {
  if (!viewportShell) return;
  if (!runtimeUiConfig.uiWidth || !runtimeUiConfig.uiHeight) return;
  viewportShell.style.width = `${runtimeUiConfig.uiWidth}px`;
  viewportShell.style.height = `${runtimeUiConfig.uiHeight}px`;
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
}) {
  if (!statusElement) return;
  const dpr = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
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
}) {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, runtimeUiConfig.maxPixelRatio));

  const scene = new Scene();
  scene.background = new Color(backgroundColor);

  const camera = new PerspectiveCamera(58, 1, 0.0001, 20_000);
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

export function addDefaultLighting(scene) {
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

export function createSceneGroups(scene) {
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
