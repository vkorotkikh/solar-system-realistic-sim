import './style.css';
import { createPanelController } from './frontend/app/panelController';
import { createExplorerController } from './frontend/app/explorerController';
import { createBodyPickerPresentation } from './frontend/app/bodyPickerPresentation';
import { createViewportCameraController } from './frontend/app/viewportCameraController';
import * as agnEngine from './frontend/features/superluminal-modeling/agnShockwaveEngine';
import { createExperimentController, engineSelectionResolver } from './frontend/app/experimentController';
import { createRendererRecoverySurface } from './frontend/app/rendererRecovery';
import { createRuntimeLifetime } from './frontend/app/runtimeLifetime';
import { createModelWorkerController } from './frontend/app/modelWorkerController';
import {
  createBackgroundStars, declutterLabels, labelScreenRect, updateBodyLabel, type ProjectedLabel,
} from './frontend/app/sceneAnnotations';
import { createFrameLifecycle } from './frontend/app/frameLifecycle';
import { applyViewportSizeOverride } from './frontend/app/sceneSetup';
import { renderPixelRatio } from './frontend/app/runtimeConfig';
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineLoop,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Raycaster,
  RepeatWrapping,
  SphereGeometry,
  Quaternion,
  type ShaderMaterial,
  type Texture,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3
} from 'three';
import {
  AU_KM,
  AU_M,
  DEFAULT_TIME_SCALE_DAYS_PER_SEC,
  DAY_SECONDS,
  J2000_JD,
  MIN_TIME_SCALE_DAYS_PER_SEC,
  MAX_TIME_SCALE_DAYS_PER_SEC,
  G_SI,
  currentJulianDate,
  formatJulianAsDate
} from './constants';
import { createSolarSystemCatalog } from './sim/catalog';
import { sampleOrbitLoop } from './sim/orbitMath';
import { SolarSystemModel } from './sim/solarSystemModel';
import { applyMetricDisplayOffsets } from './frontend/features/superluminal-modeling/metricDisplay';
import { resolveAgnSelection, type AgnEventOptions } from './frontend/features/superluminal-modeling/agnShockwaveEngine';
import { generateMoonTexture, generatePlanetTexture } from './textures';
import { updateSceneBodiesFromModel } from './frontend/app/bodyManager';
import { createBodyIdResolver, createSimulationState } from './frontend/app/stateStore';
import { MoonTexturePipeline } from './frontend/features/planetary/moonTexturePipeline';
import { createPlanetSurfaceMaps } from './frontend/features/planetary/planetSurfaceMaps';
import { PlanetQuadtree } from './frontend/features/planetary/quadtreeLOD';
import { applyBodySpin } from './frontend/features/planetary/bodySpin';
import { planetViewDistances } from './frontend/features/planetary/planetView';
import {
  buildCatalogIndexContract,
  buildModelWorkerCatalog,
  type CatalogIndexContract,
  isValidModelWorkerAvailabilityArray,
  MODEL_WORKER_RECORD_SIZE,
  type ModelWorkerCatalog
} from './workers/modelWorkerContract';
import {
  createRuntimeUiConfig,
  createSceneSetup,
  addDefaultLighting
} from './frontend/app/sceneSetup';
import { createTextureManager } from './frontend/app/textureManager';
import { warmupRenderer } from './frontend/app/rendererWarmup';
import { createTimeController } from './frontend/app/timeController';
import { createSunController } from './sunController';
import { generateKuiperBelt } from './sim/kuiperBelt';
import { createKuiperBeltUpdater } from './frontend/features/asteroids/kuiperBeltUpdater';
import type { CatalogBody } from './sim/catalog';
import {
  loadPhase1AsteroidCatalog,
  PHASE1_CATALOG_URL,
  PHASE1_CATALOG_META_URL,
  PHASE1_LOAD_LATENCY_BUDGET_MS
} from './sim/phase1AsteroidCatalog';
import { createKuiperBeltRenderer } from './frontend/features/asteroids/beltRenderer';
import { beltSurfaceDensity, createBeltDensityBand } from './frontend/features/asteroids/beltDensityBand';
import { createStartupAsteroidBelt } from './frontend/features/asteroids/startupBelt';
import {
  failedAsteroidCatalogStatus,
  rejectedAsteroidCatalogStatus,
  renderAsteroidCatalogSourceStatus,
  verifiedAsteroidCatalogStatus,
} from './frontend/features/asteroids/catalogSourceStatus';
import { SolarDataAnnouncer, renderSolarDataStatus } from './frontend/features/solar/solarDataStatus';

// ── DOM ──────────────────────────────────────────────────────────────────────

function elementById<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required UI element: #${id}`);
  return element as T;
}

const dom = {
  app: elementById<HTMLElement>('app'),
  emptyState: elementById<HTMLElement>('body-empty-state'),
  cameraTools: elementById<HTMLDetailsElement>('camera-tools'),
  rendererUnavailable: elementById<HTMLElement>('renderer-unavailable'),
  rendererRetry: elementById<HTMLButtonElement>('renderer-retry'),
  controlPanel: elementById<HTMLElement>('control-panel'),
  panelToggle: elementById<HTMLButtonElement>('panel-toggle'),
  panelClose: elementById<HTMLButtonElement>('panel-close'),
  panelBackdrop: elementById<HTMLElement>('panel-backdrop'),
  canvas: elementById<HTMLCanvasElement>('space-canvas'),
  togglePlay: elementById<HTMLButtonElement>('toggle-play'),
  nowTime: elementById<HTMLButtonElement>('now-time'),
  timeScale: elementById<HTMLInputElement>('time-scale'),
  timeScaleValue: elementById<HTMLOutputElement>('time-scale-value'),
  timeDate: elementById<HTMLTimeElement>('time-date'),
  sessionLabel: elementById<HTMLElement>('session-label'),
  toggleOrbits: elementById<HTMLInputElement>('toggle-orbits'),
  toggleMagneticField: elementById<HTMLInputElement>('toggle-magnetic-field'),
  toggleLabels: elementById<HTMLInputElement>('toggle-labels'),
  toggleMoons: elementById<HTMLInputElement>('toggle-moons'),
  toggleAsteroids: elementById<HTMLInputElement>('toggle-asteroids'),
  toggleKuiper: elementById<HTMLInputElement>('toggle-kuiper'),
  toggleRealisticScale: elementById<HTMLInputElement>('toggle-realistic-scale'),
  aiaChannel: elementById<HTMLSelectElement>('aia-channel'),
  bodySearch: elementById<HTMLInputElement>('body-search'),
  bodyMatchCount: elementById<HTMLOutputElement>('body-match-count'),
  bodyList: elementById<HTMLSelectElement>('body-list'),
  focusBody: elementById<HTMLButtonElement>('focus-body'),
  followBody: elementById<HTMLButtonElement>('follow-body'),
  clearFollow: elementById<HTMLButtonElement>('clear-follow'),
  bodyInfo: elementById<HTMLElement>('body-info'),
  bodyInfoName: elementById<HTMLElement>('body-info-name'),
  bodyInfoType: elementById<HTMLElement>('body-info-type'),
  bodyInfoRadius: elementById<HTMLElement>('body-info-radius'),
  bodyInfoDistance: elementById<HTMLElement>('body-info-distance'),
  bodyInfoPeriod: elementById<HTMLElement>('body-info-period'),
  statusFocus: elementById<HTMLElement>('status-focus'),
  statusBodies: elementById<HTMLElement>('status-bodies'),
  statusZoom: elementById<HTMLElement>('status-zoom'),
  statusCatalog: elementById<HTMLElement>('status-catalog'),
  statusSolar: elementById<HTMLElement>('status-solar'),
  statusSolarAnnouncer: elementById<HTMLElement>('status-solar-announcer'),
  zoomSensitivity: elementById<HTMLInputElement>('zoom-sensitivity'),
  zoomSensitivityValue: elementById<HTMLOutputElement>('zoom-sensitivity-value'),
  viewportShell: elementById<HTMLElement>('viewport-shell'),
  agnSource: elementById<HTMLSelectElement>('agn-source'),
  agnPreset: elementById<HTMLSelectElement>('agn-preset'),
  agnHypothesis: elementById<HTMLSelectElement>('agn-hypothesis'),
  agnStochastic: elementById<HTMLInputElement>('agn-stochastic'),
  experimentStatus: elementById<HTMLElement>('experiment-status'),
  triggerAgnShockwave: elementById<HTMLButtonElement>('trigger-agn-shockwave')
};

renderAsteroidCatalogSourceStatus(dom.statusCatalog, {
  state: 'loading', text: 'Asteroids: catalog verification pending',
});

let refreshPanelLayout = () => {};
const panelController = createPanelController({
  app: dom.app, panel: dom.controlPanel, viewport: dom.viewportShell,
  toggle: dom.panelToggle, close: dom.panelClose, backdrop: dom.panelBackdrop,
  breakpoint: window.matchMedia('(max-width: 1100px)'), isMobileLayout: () => window.innerWidth <= 1100, onLayoutChange: () => refreshPanelLayout()
});
for (const disclosure of document.querySelectorAll<HTMLDetailsElement>('.panel-disclosure')) {
  const summary = disclosure.querySelector('summary');
  const sync = () => summary?.setAttribute('aria-expanded', String(disclosure.open));
  disclosure.addEventListener('toggle', sync); sync();
}

const startup = createRuntimeLifetime();
function stopVisualization() {
  refreshPanelLayout = () => {};
  startup.dispose();
}
const recovery = createRendererRecoverySurface({
  canvas: dom.canvas, surface: dom.rendererUnavailable, retry: dom.rendererRetry,
  onUnavailable: () => {
    stopVisualization();
    if (dom.controlPanel.contains(document.activeElement)) dom.panelClose.focus();
    for (const control of dom.controlPanel.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('.panel-scroll input, .panel-scroll button, .panel-scroll select')) control.disabled = true;
    dom.cameraTools.hidden = true;
    elementById<HTMLElement>('session-label').textContent = 'Visualization unavailable';
    dom.statusFocus.textContent = 'Simulation stopped';
    dom.statusSolar.textContent = 'Sun data unavailable while visualization is stopped';
  }
});
window.addEventListener('beforeunload', () => {
  stopVisualization();
  recovery.dispose();
  panelController.dispose();
});

async function startSimulation() {
function ownDisposable<T extends { dispose(): void }>(value: T): T {
  startup.defer(() => value.dispose());
  return value;
}
// ── Data & State ─────────────────────────────────────────────────────────────

// Moons stay propagated while switched off, so the switch can reveal them at once.
let showMoons: boolean = true;
const { loadMoonEphemerides } = await import('./sim/loadMoonEphemerides');
if (startup.signal.aborted || !recovery.available) return;
const moonEphemerides = await loadMoonEphemerides().catch((error: unknown) => {
  console.warn('[moons] fitted ephemerides unavailable; using mean elements:', error);
  return undefined;
});
if (startup.signal.aborted || !recovery.available) return;
// Planets keep their enlarged sizes with moons on: moons move out to clear them instead.
const catalog = createSolarSystemCatalog({ moonEphemerides, moonsVisible: false });
const { isEarthMoonBody } = createBodyIdResolver(catalog);
const modelWorkerCatalog: ModelWorkerCatalog = buildModelWorkerCatalog(catalog.bodies, {
  includeMoons: true
});
const propagatedBodies = modelWorkerCatalog.bodies.map((body) => catalog.bodies[body.sourceIndex]);
const model = new SolarSystemModel({ bodies: propagatedBodies });
// The scene updater consumes identity and hierarchy, not orbital parameters.
const sceneCatalog = { bodies: catalog.bodies.map(({ id, parentId, type }) => ({ id, parentId, type })) };
const modelWorkerIndexContract: CatalogIndexContract = buildCatalogIndexContract(modelWorkerCatalog);
const modelWorkerParentIndexByIndex = modelWorkerIndexContract.parentIndexByIndex;
const modelWorkerSourceIndexByIndex = modelWorkerIndexContract.sourceIndexByIndex;
const modelWorkerBodyCount = modelWorkerIndexContract.idByIndex.length;
const bodyById = new Map(catalog.bodies.map((b) => [b.id, b]));
const simState = createSimulationState({
  currentJulianDate,
  defaultTimeScaleDaysPerSec: DEFAULT_TIME_SCALE_DAYS_PER_SEC
});
const modelWorkerWorldX = new Float64Array(modelWorkerBodyCount);
const modelWorkerWorldY = new Float64Array(modelWorkerBodyCount);
const modelWorkerWorldZ = new Float64Array(modelWorkerBodyCount);
const modelWorkerWorldVx = new Float64Array(modelWorkerBodyCount);
const modelWorkerWorldVy = new Float64Array(modelWorkerBodyCount);
const modelWorkerWorldVz = new Float64Array(modelWorkerBodyCount);
const modelWorkerPositionsDirty = new Uint8Array(modelWorkerBodyCount);
const modelWorkerController = ownDisposable(createModelWorkerController({
  catalog: modelWorkerCatalog,
  createWorker: () => new Worker(new URL('./workers/modelWorker.ts', import.meta.url), { type: 'module' }),
  getJulianDate: () => simState.julianDate,
  onStatus: (status, reason) => {
    dom.canvas.dataset.orbitalWorker = status;
    if (reason) console.warn('[modelWorker] local propagation active:', reason);
  },
}));
let lastModelWorkerAppliedSequence = -1;
const ASTEROID_BELT_TARGET_COUNT = 50_000;
const ASTEROID_BELT_PHASE1_SOURCE_LIMIT = 100_000;

const TWO_PI = Math.PI * 2;
const BODY_LOCAL_SPIN_AXIS = new Vector3(0, 1, 0);
function bodyBaseRadiusAu(body: CatalogBody) {
  // Unknown physical size retains an illustrative marker in either scale mode.
  return simState.useRealisticScale ? (body.realRadiusAu ?? body.displayRadiusAu) : body.displayRadiusAu;
}

function computePlanetMuAu3Day2(massKg: number | null | undefined): number {
  if (typeof massKg !== 'number' || !Number.isFinite(massKg) || massKg <= 0) return 0;
  return (G_SI * massKg * DAY_SECONDS * DAY_SECONDS) / (AU_M * AU_M * AU_M);
}

// ── Renderer, Scene, Camera, Controls ────────────────────────────────────────

const sceneSetup = recovery.initialize(() => {
  const runtimeUiConfig = createRuntimeUiConfig();
  applyViewportSizeOverride({ viewportShell: dom.viewportShell, runtimeUiConfig });
  return { runtimeUiConfig, ...createSceneSetup({
    canvas: dom.canvas, runtimeUiConfig, initialZoomSensitivity: simState.zoomSensitivity, solarSystemMaxDistanceAu: 200
  }) };
});
if (!sceneSetup) return;
const { renderer, scene, camera, controls, runtimeUiConfig } = sceneSetup;
ownDisposable(renderer);
startup.defer(() => { controls.enabled = false; controls.dispose(); });
if (startup.signal.aborted || !recovery.available) return;
const backendBaseUrl = () => runtimeUiConfig.backendOrigin;
const viewportCamera = ownDisposable(createViewportCameraController({ canvas: dom.canvas, actionRoot: dom.cameraTools, camera, controls, onActionApplied: updateZoomStatus }));
addDefaultLighting(scene);

// Dispatch transfer/integrity work before synchronous textures and scene assembly.
// The loader owns its shared bounded transport; startup owns only its adoption.
const asteroidCatalogPromise = loadPhase1AsteroidCatalog({
  maxRecords: ASTEROID_BELT_PHASE1_SOURCE_LIMIT,
  loadLatencyBudgetMs: PHASE1_LOAD_LATENCY_BUDGET_MS,
  metaUrl: PHASE1_CATALOG_META_URL,
});
// Setup may fail before reaching the await. Observe rejection immediately.
void asteroidCatalogPromise.catch(() => {});

const solarSystemGroup = new Group();
scene.add(solarSystemGroup);

// ── Textures & Materials ─────────────────────────────────────────────────────

const maxAnisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
const {
  textureLoader,
  solarObservationTextureLoader,
  configureLoadedTexture
} = createTextureManager({ maxAnisotropy });

const geometryCache = {
  sun: ownDisposable(new SphereGeometry(1, 128, 96)),
  planet: ownDisposable(new SphereGeometry(1, 16, 12)),
  moon: ownDisposable(new SphereGeometry(1, 8, 6)),
  majorMoon: ownDisposable(new SphereGeometry(1, 36, 28))
};

const PLANET_COLORS: Record<string, string> = {
  mercury: '#a0917c', venus: '#d4b980', earth: '#4a7abf',
  mars: '#b5653a', jupiter: '#c4a87c', saturn: '#d4c894',
  uranus: '#8cc8d4', neptune: '#4466b0', pluto: '#c8b89a'
};

const sunTextureCanvas = generatePlanetTexture('sun');
let sunTexture: CanvasTexture | null = null;
if (sunTextureCanvas) {
  sunTexture = ownDisposable(new CanvasTexture(sunTextureCanvas));
  configureLoadedTexture(sunTexture);
  sunTexture.wrapS = RepeatWrapping;
  sunTexture.wrapT = RepeatWrapping;
  sunTexture.needsUpdate = true;
}

// ── Sun Controller ───────────────────────────────────────────────────────────

const sunBody = bodyById.get('sun');

const solarDataAnnouncer = new SolarDataAnnouncer(dom.statusSolarAnnouncer);

const sunCtrl = createSunController({
  camera,
  simState: {
    get julianDate() { return simState.julianDate; },
    get paused() { return simState.paused; },
    get timeScaleDaysPerSec() { return simState.timeScaleDaysPerSec; },
    get useRealisticScale() { return simState.useRealisticScale; }
  },
  backendBaseUrl,
  configureLoadedTexture,
  observationTextureLoader: solarObservationTextureLoader,
  getSunRadiusAu: () => sunBody ? bodyBaseRadiusAu(sunBody) : 0.01,
  isMagneticFieldEnabled: () => Boolean(dom.toggleMagneticField?.checked),
  onSolarDataStatus: (status) => {
    renderSolarDataStatus(dom.statusSolar, status);
    if (solarDataAnnouncer.observe(status) && status.state !== 'backend') {
      console.warn(`[solar] ${status.text}${status.remedy ? `\n${status.remedy}` : ''}`);
    }
  }
});

startup.defer(() => sunCtrl.disposeSolarDelivery());

// ── Body Nodes ───────────────────────────────────────────────────────────────

const bodyNodes = new Map();
const bodyMeshes = new Map();
const bodySpinGroups = new Map();
const orbitLines: Line[] = [];
const orbitLineByBodyId = new Map<string, Line>();
const labels: { bodyId: string; sprite: Sprite }[] = [];

const LABEL_CANVAS_WIDTH = 256, LABEL_CANVAS_HEIGHT = 64, LABEL_FONT_PX = 28;

function createLabelCanvas(text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_CANVAS_WIDTH;
  canvas.height = LABEL_CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { canvas, inkFraction: undefined };
  ctx.font = `bold ${LABEL_FONT_PX}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.85;
  ctx.fillText(text, LABEL_CANVAS_WIDTH / 2, 32);
  // Text extent as fractions of the sprite, for the declutter box (labelScreenRect).
  return { canvas, inkFraction: [ctx.measureText(text).width / LABEL_CANVAS_WIDTH, LABEL_FONT_PX / LABEL_CANVAS_HEIGHT] };
}

function createLabelSprite(text: string) {
  const { canvas, inkFraction } = createLabelCanvas(text);
  const tex = ownDisposable(new CanvasTexture(canvas));
  const mat = ownDisposable(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const sprite = new Sprite(mat);
  if (inkFraction) sprite.userData.inkFraction = inkFraction;
  return sprite;
}

function createBodyNode(body: CatalogBody) {
  const node = new Group();
  node.name = body.name;

  const spinGroup = new Group();
  const axialTiltRad = ((body.axialTiltDeg ?? 0) * Math.PI) / 180;
  const spinAxisLongitudeRad = ((body.spinAxisLongitudeDeg ?? 0) * Math.PI) / 180;
  const spinAxisWorld = new Vector3(
    Math.sin(axialTiltRad) * Math.cos(spinAxisLongitudeRad),
    Math.sin(axialTiltRad) * Math.sin(spinAxisLongitudeRad),
    Math.cos(axialTiltRad)
  ).normalize();
  // SunController owns the Sun's complete NAIF/IAU orientation and prime meridian.
  if (body.id !== 'sun') {
    spinGroup.quaternion.setFromUnitVectors(BODY_LOCAL_SPIN_AXIS, spinAxisWorld);
  }
  node.add(spinGroup);
  bodySpinGroups.set(body.id, spinGroup);

  let material: MeshBasicMaterial | MeshStandardMaterial | ShaderMaterial;
  let geometry: SphereGeometry;
  let mesh;

  const visualId = isEarthMoonBody(body) ? 'moon' : body.id;
  if (['earth', 'moon', 'mars'].includes(visualId)) {
    const radius = bodyBaseRadiusAu(body);
    const quadtree = ownDisposable(new PlanetQuadtree(body.id, radius, camera, visualId));
    mesh = quadtree.group;
    mesh.userData.isQuadtree = true;
    mesh.userData.quadtree = quadtree;
  } else if (body.id === 'sun') {
    geometry = geometryCache.sun;
    material = ownDisposable(sunCtrl.createSunMaterial(sunTexture) ?? new MeshBasicMaterial({ color: new Color(body.color) }));
    mesh = new Mesh(geometry, material);
    mesh.scale.setScalar(bodyBaseRadiusAu(body));
  } else if (body.type === 'star') {
    geometry = geometryCache.planet;
    material = ownDisposable(new MeshBasicMaterial({ color: new Color(body.color) }));
    mesh = new Mesh(geometry, material);
    mesh.scale.setScalar(bodyBaseRadiusAu(body));
  } else if (body.type === 'moon') {
    geometry = geometryCache.moon;
    material = ownDisposable(new MeshStandardMaterial({ color: new Color(body.color ?? '#aaa'), roughness: 0.9 }));
    mesh = new Mesh(geometry, material);
    mesh.scale.setScalar(bodyBaseRadiusAu(body));
  } else {
    geometry = geometryCache.planet;
    const col = PLANET_COLORS[body.id] ?? body.color ?? '#888';
    material = ownDisposable(new MeshStandardMaterial({ color: new Color(col), roughness: 0.8 }));
    mesh = new Mesh(geometry, material);
    mesh.scale.setScalar(bodyBaseRadiusAu(body));
  }

  const radius = bodyBaseRadiusAu(body);
  mesh.userData.bodyId = body.id;
  mesh.userData.rotationPeriodHours = body.rotationPeriodHours ?? null;
  mesh.userData.rotationOffsetRad = ((body.rotationPhaseDeg ?? 0) * Math.PI) / 180;
  spinGroup.add(mesh);

  if (body.id === 'sun') {
    sunCtrl.initSunVisuals({
      spinGroup,
      node,
      sunBody: body,
      sunGeometry: geometryCache.sun,
      meshRotationOffsetRad: mesh.userData.rotationOffsetRad
    });
  }

  const isMajor = body.isMajor || body.type === 'planet' || body.type === 'dwarf' || body.type === 'star';
  if (isMajor) {
    const label = createLabelSprite(body.name);
    node.add(label);
    labels.push({ bodyId: body.id, sprite: label });
  }

  bodyNodes.set(body.id, node);
  bodyMeshes.set(body.id, mesh);
  return node;
}

// ── Orbit Lines ──────────────────────────────────────────────────────────────

function createOrbitLine(body: CatalogBody) {
  if (!body.orbit || body.type === 'star') return null;
  // 512 keeps the largest chord error of every planetary loop below 3e-3 AU.
  const segments = body.type === 'moon' ? 256 : 512;
  const positions = new Float32Array(segments * 3);
  if (!sampleOrbitLoop(body.orbit, segments, positions)) return null;

  const geo = ownDisposable(new BufferGeometry());
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const col = body.type === 'moon' ? '#556' : '#4477aa';
  const line = new LineLoop(geo, ownDisposable(new LineBasicMaterial({ color: new Color(col), transparent: true, opacity: 0.35 })));
  line.userData.bodyId = body.id;
  line.userData.bodyType = body.type;
  line.userData.stateAvailable = true;
  orbitLineByBodyId.set(body.id, line);

  if (body.parentId && body.parentId !== 'sun') {
    const parentNode = bodyNodes.get(body.parentId);
    if (parentNode) {
      parentNode.add(line);
      orbitLines.push(line);
      return line;
    }
  }

  solarSystemGroup.add(line);
  orbitLines.push(line);
  return line;
}

const labelWorldPosition = new Vector3();
function updateLabels() {
  camera.updateMatrixWorld();
  const viewportHeight = renderer.domElement.clientHeight;
  const placed: ProjectedLabel[] = [];
  for (const { bodyId, sprite } of labels) {
    const body = bodyById.get(bodyId);
    const node = bodyNodes.get(bodyId);
    if (!body || !node) continue;
    if (node.visible === false) { sprite.visible = false; continue; }
    node.getWorldPosition(labelWorldPosition);
    // Last frame's final visibility drives the declutter hysteresis.
    const wasShown = sprite.visible;
    sprite.visible = dom.toggleLabels.checked && updateBodyLabel(sprite, labelWorldPosition,
      bodyBaseRadiusAu(body), camera, viewportHeight);
    // Declutter ranks by physical size, so the order survives the scale toggle.
    if (sprite.visible) placed.push({ id: bodyId, rect: labelScreenRect(sprite, camera, viewportHeight),
      radiusAu: body.realRadiusAu ?? body.displayRadiusAu, wasShown });
  }
  const shown = declutterLabels(placed, simState.focusedBodyId);
  for (const { bodyId, sprite } of labels) if (sprite.visible && !shown.has(bodyId)) sprite.visible = false;
}

// ── Background Stars ─────────────────────────────────────────────────────────

const backgroundStars = createBackgroundStars();
ownDisposable(backgroundStars.geometry);
ownDisposable(backgroundStars.material);
scene.add(backgroundStars);
const surveyMilkySphere = { position: new Vector3() };

// ── Scene Assembly ───────────────────────────────────────────────────────────

for (const body of catalog.bodies) {
  if (body.type === 'moon' && !showMoons) continue;
  createBodyNode(body);
  solarSystemGroup.add(bodyNodes.get(body.id));
}

for (const body of catalog.bodies) {
  if (body.type === 'moon' && !showMoons) continue;
  if (body.type === 'moon' && body.parentId) {
    const node = bodyNodes.get(body.id);
    const parentNode = bodyNodes.get(body.parentId);
    if (node && parentNode) parentNode.add(node);
  }
  createOrbitLine(body);
}

const moonBodies = catalog.bodies.filter((b) => b.type === 'moon')
  .sort((a, b) => Number(Boolean(b.isMajor)) - Number(Boolean(a.isMajor)) || a.name.localeCompare(b.name));

// Named moons get a real map where one is bundled and a generated one otherwise.
const curatedMoonTextures = new MoonTexturePipeline({
  textureLoader,
  configureTexture: (texture) => {
    configureLoadedTexture(texture);
    texture.wrapS = RepeatWrapping;
    texture.needsUpdate = true;
  },
});
startup.defer(() => { for (const texture of curatedMoonTextures.cache.values()) texture.dispose(); });
for (const body of moonBodies) {
  const mesh = bodyMeshes.get(body.id);
  if (!body.isMajor || !(mesh?.material instanceof MeshStandardMaterial)) continue;
  mesh.geometry = geometryCache.majorMoon;
  const generated = ownDisposable(new CanvasTexture(generateMoonTexture(body.name, body.parentId ?? 'default')));
  configureLoadedTexture(generated);
  mesh.material.map = generated;
  mesh.material.color.set('#ffffff');
  const applyMap = (texture: typeof generated | Texture) => { mesh.material.map = texture; mesh.material.needsUpdate = true; };
  const cached = curatedMoonTextures.requestTexture({ ...body, parentId: body.parentId ?? '' }, applyMap, startup.signal);
  if (cached) applyMap(cached);
}

const surfaceMaps = ownDisposable(createPlanetSurfaceMaps({
  targets: ([['moon', catalog.bodies.find(isEarthMoonBody)?.id], ['mars', 'mars']] as const).flatMap(([visualId, id]) => {
    const tree: PlanetQuadtree | undefined = id ? bodyMeshes.get(id)?.userData.quadtree : undefined;
    return tree ? [{ visualId, tree, node: bodyNodes.get(id!) }] : [];
  }),
  textureLoader,
  maxAnisotropy,
}));

// ── Asteroid & Kuiper Belts ──────────────────────────────────────────────────

const asteroidStartup = await createStartupAsteroidBelt(asteroidCatalogPromise, {
  targetCount: ASTEROID_BELT_TARGET_COUNT, seed: 42,
  signal: startup.signal, getScaleMode: () => dom.toggleRealisticScale.checked,
});
const asteroidBeltRenderer = ownDisposable(asteroidStartup.renderer);
if (startup.signal.aborted || !recovery.available) return;
const asteroidPop = asteroidStartup.population;
simState.useRealisticScale = dom.toggleRealisticScale.checked;
const kuiperPop = generateKuiperBelt(5_000);

const jupiterPerturbationMu = computePlanetMuAu3Day2(bodyById.get('jupiter')?.massKg);
const saturnPerturbationMu = computePlanetMuAu3Day2(bodyById.get('saturn')?.massKg);
const asteroidJupiterPositionAu = new Vector3();
const asteroidSaturnPositionAu = new Vector3();

const kuiperBeltRenderer = ownDisposable(createKuiperBeltRenderer(kuiperPop.kbos));
const kuiperBeltUpdater = createKuiperBeltUpdater(kuiperPop, kuiperBeltRenderer);
asteroidBeltRenderer.setPerturberMasses(jupiterPerturbationMu, saturnPerturbationMu);

solarSystemGroup.add(asteroidBeltRenderer.mesh);
solarSystemGroup.add(kuiperBeltRenderer.mesh);
if (kuiperBeltRenderer.companionMesh) {
  solarSystemGroup.add(kuiperBeltRenderer.companionMesh);
}

function syncAsteroidBeltInputs() {
  const jupiterState = model.getState('jupiter');
  const saturnState = model.getState('saturn');

  if (jupiterState) {
    asteroidJupiterPositionAu.copy(jupiterState.worldPosition);
  } else {
    asteroidJupiterPositionAu.set(0, 0, 0);
  }

  if (saturnState) {
    asteroidSaturnPositionAu.copy(saturnState.worldPosition);
  } else {
    asteroidSaturnPositionAu.set(0, 0, 0);
  }

  asteroidBeltRenderer.setJulianDate(simState.julianDate);
  asteroidBeltRenderer.setPerturberPositions(asteroidJupiterPositionAu, asteroidSaturnPositionAu);
}

const phaseOneCatalog = asteroidStartup.catalog;
// Only the verified catalog may draw a band that claims to show measured density.
const asteroidDensityBand = asteroidStartup.source === 'catalog' && phaseOneCatalog
  ? ownDisposable(createBeltDensityBand(beltSurfaceDensity(phaseOneCatalog.asteroids.map(({ orbit }) => orbit))))
  : null;
if (asteroidDensityBand) solarSystemGroup.add(asteroidDensityBand.group);

function applyBeltVisibility() {
  asteroidBeltRenderer.setVisible(dom.toggleAsteroids.checked);
  if (asteroidDensityBand) asteroidDensityBand.group.visible = dom.toggleAsteroids.checked;
  kuiperBeltRenderer.setVisible(dom.toggleKuiper.checked);
}
applyBeltVisibility();
if (asteroidStartup.source === 'catalog' && phaseOneCatalog) {
  const gate = phaseOneCatalog.acceptance;
  if (!gate.latency.passed && gate.latency.reason) {
    console.warn('[phase-1] Catalog load exceeded its performance budget:', gate.latency.reason);
  }
  renderAsteroidCatalogSourceStatus(dom.statusCatalog, verifiedAsteroidCatalogStatus(phaseOneCatalog.sourceCount));
  console.info(
    `[phase-1] Loaded deterministic catalog from ${PHASE1_CATALOG_URL} (` +
    `${phaseOneCatalog.sourceCount.toLocaleString()} source rows, ` +
    `${phaseOneCatalog.asteroids.length.toLocaleString()} parsed records, ` +
    `version=${phaseOneCatalog.catalogVersion}, ` +
    `checksum=${phaseOneCatalog.checksumActual}, ` +
    `load=${phaseOneCatalog.loadMs.toFixed(1)}ms (budget ${phaseOneCatalog.loadLatencyBudgetMs}ms), ` +
    `taxonomyC=${phaseOneCatalog.taxonomyCheck.counts.C}, ` +
    `taxonomyS=${phaseOneCatalog.taxonomyCheck.counts.S}, ` +
    `taxonomyM=${phaseOneCatalog.taxonomyCheck.counts.M}, ` +
    `target=${ASTEROID_BELT_TARGET_COUNT.toLocaleString()}).`
  );
} else if (asteroidStartup.source === 'rejected' && phaseOneCatalog) {
  const rejections = phaseOneCatalog.acceptance.rejections;
  renderAsteroidCatalogSourceStatus(dom.statusCatalog, rejectedAsteroidCatalogStatus(rejections));
  console.warn('[phase-1] Acceptance gates failed; using procedural fallback:',
    rejections.map(({ code, message }) => `[${code}] ${message}`).join(' | '));
} else {
  renderAsteroidCatalogSourceStatus(dom.statusCatalog, failedAsteroidCatalogStatus());
  console.warn('[phase-1] Using procedural fallback for asteroid belt:',
    asteroidStartup.error ?? 'accepted catalog contained no usable asteroid records');
}

kuiperBeltUpdater.update(simState.julianDate);
syncAsteroidBeltInputs();

// ── Moons ────────────────────────────────────────────────────────────────────

/** Enlarged planets would swallow their moons, so a moon keeps its true altitude above the drawn surface. */
function moonDisplayOffsetAu(body: CatalogBody): number {
  const parent = body.parentId ? bodyById.get(body.parentId) : undefined;
  if (!parent) return 0;
  return Math.max(0, bodyBaseRadiusAu(parent) - (parent.realRadiusAu ?? bodyBaseRadiusAu(parent)));
}

/** Reads the true parent-relative position written earlier in the same frame stage. */
function applyMoonAltitudeDisplay() {
  if (simState.useRealisticScale) return;
  for (const body of moonBodies) {
    const node = bodyNodes.get(body.id);
    const distanceAu = node?.position.length();
    if (distanceAu) node.position.multiplyScalar(1 + moonDisplayOffsetAu(body) / distanceAu);
  }
}

function applyMoonOrbitLineDisplay() {
  for (const line of orbitLines) {
    const body = line.userData.bodyType === 'moon' ? bodyById.get(line.userData.bodyId) : undefined;
    if (!body) continue;
    const attribute = line.geometry.getAttribute('position');
    const trueLoop: Float32Array = line.userData.trueLoop ??= Float32Array.from(attribute.array);
    const offsetAu = moonDisplayOffsetAu(body);
    for (let i = 0; i < attribute.count; i++) {
      const x = trueLoop[i * 3], y = trueLoop[i * 3 + 1], z = trueLoop[i * 3 + 2];
      const scale = 1 + offsetAu / (Math.hypot(x, y, z) || 1);
      attribute.setXYZ(i, x * scale, y * scale, z * scale);
    }
    attribute.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  }
}
applyMoonOrbitLineDisplay();

const earthMoon = catalog.bodies.find(isEarthMoonBody);
const earthDirectionLocal = new Vector3();
const inverseSpin = new Quaternion();
/** The prime meridian is defined by the mean Earth direction; librations are not modelled. */
function faceMoonTowardEarth() {
  const state = earthMoon && model.getState(earthMoon.id);
  const spin = earthMoon && bodySpinGroups.get(earthMoon.id);
  const mesh = earthMoon && bodyMeshes.get(earthMoon.id);
  if (!state?.available || !spin || !mesh) return;
  earthDirectionLocal.copy(state.relativePosition).negate().applyQuaternion(inverseSpin.copy(spin.quaternion).invert());
  mesh.rotation.y = Math.atan2(earthDirectionLocal.x, earthDirectionLocal.z);
}

function applyMoonVisibility() {
  showMoons = dom.toggleMoons.checked;
  explorerBodies.length = 0;
  explorerBodies.push(...namedBodies, ...(showMoons ? moonBodies : []));
  refillBodyList();
  updateSceneBodies();
}

// ── Focus & Follow ───────────────────────────────────────────────────────────

const tempVec = new Vector3();

function focusBody(bodyId: string, hardSnap = false) {
  const body = bodyById.get(bodyId);
  const node = bodyNodes.get(bodyId);
  if (!body || !node || node.visible === false || model.getState(bodyId)?.available === false) return;

  node.getWorldPosition(tempVec);
  const offset = camera.position.clone().sub(controls.target);
  const radius = bodyBaseRadiusAu(body);
  const preferredDistance = body.type === 'star'
    ? (simState.useRealisticScale ? 0.14 : 2.6)
    : planetViewDistances(radius).focus;
  controls.minDistance = planetViewDistances(radius).minimum;

  if (offset.lengthSq() < 1e-9) offset.set(0, -preferredDistance, preferredDistance * 0.6);

  if (hardSnap) {
    controls.target.copy(tempVec);
    camera.position.copy(tempVec).add(offset.setLength(preferredDistance));
    controls.update();
  } else {
    controls.target.lerp(tempVec, 0.25);
    const desired = new Vector3().copy(tempVec).add(offset.setLength(preferredDistance));
    camera.position.lerp(desired, 0.18);
  }

  simState.focusedBodyId = bodyId;
}

function updateZoomStatus() {
  if (!dom.statusZoom) return;
  const dist = camera.position.distanceTo(controls.target);
  const text = `Range · ${dist < 1 ? (dist * AU_KM).toFixed(0) + ' km' : dist.toFixed(2) + ' AU'}`;
  if (dom.statusZoom.textContent !== text) dom.statusZoom.textContent = text;
}

type CameraMode = 'focus' | 'follow' | 'free';

function updateCameraMode(mode: CameraMode, bodyId = simState.focusedBodyId || 'sun') {
  const bodyName = bodyById.get(bodyId)?.name ?? 'Sun';
  const statusText = mode === 'follow'
    ? `Following · ${bodyName}`
    : mode === 'free'
      ? `Free camera · ${bodyName} reference`
      : `Focused · ${bodyName}`;

  dom.statusFocus.textContent = statusText;
  dom.statusFocus.dataset.cameraMode = mode;
  dom.focusBody.setAttribute('aria-pressed', String(mode === 'focus'));
  dom.followBody.setAttribute('aria-pressed', String(mode === 'follow'));
  dom.clearFollow.setAttribute('aria-pressed', String(mode === 'free'));
}

function updateFollowTarget() {
  if (!simState.followBodyId) return;
  const node = bodyNodes.get(simState.followBodyId);
  if (!node || node.visible === false || model.getState(simState.followBodyId)?.available === false) {
    simState.followBodyId = null;
    updateCameraMode('free');
    return;
  }
  node.getWorldPosition(tempVec);
  const offset = camera.position.clone().sub(controls.target);
  controls.target.copy(tempVec);
  camera.position.copy(tempVec).add(offset);
}

const BODY_INFO_DISTANCE_REFRESH_INTERVAL_MS = 250;
let lastBodyInfoDistanceRefreshTimestamp: number | null = null;

function updateBodyInfoDistance(bodyId = dom.bodyInfo.dataset.bodyId) {
  if (!bodyId) return;
  const state = model.getState(bodyId);
  const distanceText = !state || state.available === false
    ? 'State unavailable'
    : `${state.worldPosition.length().toFixed(4)} AU`;
  if (dom.bodyInfoDistance.textContent !== distanceText) {
    dom.bodyInfoDistance.textContent = distanceText;
  }
}

function refreshBodyInfoDistance(timestamp: number) {
  const bodyId = dom.bodyInfo.dataset.bodyId;
  if (dom.bodyInfo.hidden || !bodyId) return;
  if (lastBodyInfoDistanceRefreshTimestamp !== null
    && timestamp - lastBodyInfoDistanceRefreshTimestamp
      < BODY_INFO_DISTANCE_REFRESH_INTERVAL_MS) return;
  lastBodyInfoDistanceRefreshTimestamp = timestamp;
  updateBodyInfoDistance(bodyId);
}

function updateBodyInfoPanel(bodyId: string) {
  const body = bodyById.get(bodyId);
  if (!body) return;
  const typeLabel = body.type.charAt(0).toUpperCase() + body.type.slice(1);

  dom.bodyInfo.dataset.bodyId = body.id;
  dom.bodyInfoName.textContent = body.name;
  dom.bodyInfoType.textContent = typeLabel;
  dom.bodyInfoRadius.textContent = body.radiusKm === null ? 'Unknown' : `${body.radiusKm.toLocaleString(undefined, {
    minimumFractionDigits: body.radiusKm < 100 ? 1 : 0,
    maximumFractionDigits: 1
  })} km`;
  updateBodyInfoDistance(body.id);
  dom.bodyInfoPeriod.textContent = body.orbit
    ? `${body.orbit.periodDays.toLocaleString(undefined, { maximumFractionDigits: 1 })} days`
    : '—';
}

// ── Body List ────────────────────────────────────────────────────────────────

const namedBodies = catalog.bodies.filter((b) => b.type !== 'moon');
showMoons = dom.toggleMoons.checked; // Browsers may restore the switch on reload.
const explorerBodies = [...namedBodies, ...(showMoons ? moonBodies : [])];
const explorer = ownDisposable(createExplorerController({
  dom, bodies: explorerBodies, onInspect: updateBodyInfoPanel,
  onFocus: (bodyId) => { simState.followBodyId = null; focusBody(bodyId, true); updateCameraMode('focus', bodyId); },
  onFollow: (bodyId) => { simState.followBodyId = bodyId; focusBody(bodyId, true); updateCameraMode('follow', bodyId); },
  onFree: () => { simState.followBodyId = null; updateCameraMode('free'); }
}));
const bodyPicker = ownDisposable(createBodyPickerPresentation({ select: dom.bodyList, narrow: window.matchMedia('(max-width: 600px)'), coarse: window.matchMedia('(any-pointer: coarse)') }));
function refillBodyList() {
  explorer.refresh(); bodyPicker.refresh();
  const totalBodies = explorerBodies.length + (dom.toggleAsteroids.checked ? asteroidPop?.count ?? 0 : 0)
    + (dom.toggleKuiper.checked ? kuiperPop?.count ?? 0 : 0);
  dom.statusBodies.textContent = `Bodies · ${totalBodies.toLocaleString()}`;
}

// ── Scale Mode ───────────────────────────────────────────────────────────────

function applyScaleMode() {
  for (const body of catalog.bodies) {
    const mesh = bodyMeshes.get(body.id);
    if (!mesh) continue;
    if (mesh.userData.isQuadtree) {
      mesh.userData.quadtree.setRadius(bodyBaseRadiusAu(body));
    } else {
      mesh.scale.setScalar(bodyBaseRadiusAu(body));
    }
  }
  sunCtrl.onScaleChange();
  // Notify belt renderers so asteroids use physical sizes in realistic mode
  asteroidBeltRenderer.setScaleMode(simState.useRealisticScale);
  kuiperBeltRenderer.setScaleMode(simState.useRealisticScale);
  applyMoonOrbitLineDisplay();
  applyMoonAltitudeDisplay();
  if (simState.focusedBodyId) focusBody(simState.focusedBodyId, true);
}

// ── Body Rotations ───────────────────────────────────────────────────────────

function updateBodyRotations(julianDate: number) {
  const elapsedSeconds = (julianDate - J2000_JD) * 86_400;
  for (const body of catalog.bodies) {
    const spinGroup = bodySpinGroups.get(body.id);
    if (!spinGroup) continue;
    // Do not superimpose the catalog's scalar spin on already-oriented solar layers.
    if (body.id === 'sun') {
      sunCtrl.updateSurfaceFrame(julianDate);
      continue;
    }
    for (const child of spinGroup.children) {
      if (child.userData.lockBodySpin) continue;
      const rotH = child.userData.rotationPeriodHours ?? body.rotationPeriodHours;
      if (!Number.isFinite(rotH) || Math.abs(rotH) < 0.01) continue;
      const offset = Number.isFinite(child.userData.rotationOffsetRad)
        ? child.userData.rotationOffsetRad
        : ((body.rotationPhaseDeg ?? 0) * Math.PI) / 180;
      applyBodySpin(child, elapsedSeconds, rotH, offset);
    }
  }
}

// ── Scene Body Positions ─────────────────────────────────────────────────────

function updateModelLocally(deltaSeconds: number) {
  model.update(simState.julianDate);
}

function applyLatestWorkerSnapshot() {
  const message = modelWorkerController.latestState;
  if (!message || !modelWorkerController.ready) return false;
  if (message.sequence <= lastModelWorkerAppliedSequence) return false;

  // Never let a delayed worker response freeze or rewind the scene. At most
  // three animation frames of simulation-time skew are accepted; otherwise the
  // main-thread fallback computes the current state and the worker catches up.
  const maxSnapshotAgeDays = Math.max(1e-6, Math.abs(simState.timeScaleDaysPerSec) * 0.05);
  if (Math.abs(simState.julianDate - message.tickJd) > maxSnapshotAgeDays) {
    lastModelWorkerAppliedSequence = message.sequence;
    return false;
  }

  const bodies = message.bodies;
  const availability = message.availability;
  const expectedCount = modelWorkerBodyCount;
  if (bodies.length !== expectedCount * MODEL_WORKER_RECORD_SIZE) return false;
  if (!isValidModelWorkerAvailabilityArray(availability, expectedCount)) return false;

  modelWorkerPositionsDirty.fill(0);

  for (let i = 0; i < expectedCount; i += 1) {
    if (availability[i] !== 1) continue;
    const record = i * MODEL_WORKER_RECORD_SIZE;
    modelWorkerWorldX[i] = bodies[record];
    modelWorkerWorldY[i] = bodies[record + 1];
    modelWorkerWorldZ[i] = bodies[record + 2];
    modelWorkerWorldVx[i] = bodies[record + 3];
    modelWorkerWorldVy[i] = bodies[record + 4];
    modelWorkerWorldVz[i] = bodies[record + 5];
    modelWorkerPositionsDirty[i] = 1;
  }

  for (let workerIndex = 0; workerIndex < expectedCount; workerIndex += 1) {
    const sourceIndex = modelWorkerSourceIndexByIndex[workerIndex];
    const body = catalog.bodies[sourceIndex];
    if (!body) continue;

    const stateAvailable = modelWorkerPositionsDirty[workerIndex] === 1;
    const state = model.getState(body.id);
    if (state) state.available = stateAvailable;

    const node = bodyNodes.get(body.id);
    const orbitLine = orbitLineByBodyId.get(body.id);
    if (orbitLine) {
      orbitLine.userData.stateAvailable = stateAvailable;
      orbitLine.visible = stateAvailable && dom.toggleOrbits.checked && (showMoons || body.type !== 'moon');
    }
    if (!stateAvailable) {
      if (node) node.visible = false;
      continue;
    }

    const wx = modelWorkerWorldX[workerIndex];
    const wy = modelWorkerWorldY[workerIndex];
    const wz = modelWorkerWorldZ[workerIndex];
    const vx = modelWorkerWorldVx[workerIndex];
    const vy = modelWorkerWorldVy[workerIndex];
    const vz = modelWorkerWorldVz[workerIndex];

    // Update the model independently of rendering reachability. A missing
    // scene node must never turn a valid propagated state into a frozen one.
    if (state) {
      state.worldPosition.set(wx, wy, wz);
      state.worldVelocity.set(vx, vy, vz);

      const parentIndex = modelWorkerParentIndexByIndex[workerIndex];
      if (parentIndex >= 0 && modelWorkerPositionsDirty[parentIndex]) {
        state.relativePosition.set(
          wx - modelWorkerWorldX[parentIndex],
          wy - modelWorkerWorldY[parentIndex],
          wz - modelWorkerWorldZ[parentIndex]
        );
        state.relativeVelocity.set(
          vx - modelWorkerWorldVx[parentIndex],
          vy - modelWorkerWorldVy[parentIndex],
          vz - modelWorkerWorldVz[parentIndex]
        );
      } else {
        state.relativePosition.set(wx, wy, wz);
        state.relativeVelocity.set(vx, vy, vz);
      }
    }

    if (!node) continue;

    if (body.parentId) {
      if (body.parentId === 'sun') {
        node.position.set(wx, wy, wz);
      } else {
        const parentIndex = modelWorkerParentIndexByIndex[workerIndex];
        if (parentIndex >= 0 && modelWorkerPositionsDirty[parentIndex]) {
          node.position.set(
            wx - modelWorkerWorldX[parentIndex],
            wy - modelWorkerWorldY[parentIndex],
            wz - modelWorkerWorldZ[parentIndex]
          );
        } else {
          node.position.set(wx, wy, wz);
        }
      }
    } else {
      node.position.set(wx, wy, wz);
    }

    node.visible = body.type === 'moon' ? showMoons : true;

  }

  lastModelWorkerAppliedSequence = message.sequence;
  return true;
}

function updateModelState(deltaSeconds: number) {
  let snapshotApplied = false;

  if (modelWorkerController.ready) {
    try {
      modelWorkerController.tick(deltaSeconds);
      if (modelWorkerController.latestState) {
        snapshotApplied = applyLatestWorkerSnapshot();
      }
    } catch (error) {
      console.warn('[modelWorker] falling back after snapshot failure:', error);
      modelWorkerController.fail('snapshot application failed');
    }
  }

  if (snapshotApplied) {
    return true;
  }

  updateModelLocally(deltaSeconds);
  applyModelSceneAndStateFallback();
  return true;
}

function updateSceneBodiesFromWorkerSnapshot() {
  if (!modelWorkerController.ready || !modelWorkerController.latestState) return false;
  return applyLatestWorkerSnapshot();
}

function applyModelSceneAndStateFallback() {
  updateSceneBodiesFromModel({
    catalog: sceneCatalog,
    model,
    bodyNodes,
    showMoons
  });
  for (const body of catalog.bodies) {
    const orbitLine = orbitLineByBodyId.get(body.id);
    if (!orbitLine) continue;
    const stateAvailable = model.getState(body.id)?.available !== false;
    orbitLine.userData.stateAvailable = stateAvailable;
    orbitLine.visible = stateAvailable && dom.toggleOrbits.checked && (showMoons || body.type !== 'moon');
  }
}

function updateSceneBodies() {
  if (modelWorkerController.ready && modelWorkerController.latestState) {
    updateSceneBodiesFromWorkerSnapshot();
  } else {
    applyModelSceneAndStateFallback();
  }
}

// ── Resize & Clip Planes ─────────────────────────────────────────────────────

function updateCameraClipPlanes() {
  const rangeAu = Math.max(1e-9, camera.position.distanceTo(controls.target));
  let near = 0.0001;
  let far = 20_000;
  if (simState.useRealisticScale && rangeAu < 0.08) {
    near = Math.max(5e-9, Math.min(5e-5, rangeAu * 0.00035));
    far = Math.max(0.45, Math.min(120, rangeAu * 4_200));
  }
  if (camera.near !== near || camera.far !== far) {
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }
}

function resizeRenderer() {
  if (startup.signal.aborted || !recovery.available) return;
  const w = dom.canvas.clientWidth;
  const h = dom.canvas.clientHeight;
  if (w <= 0 || h <= 0) return;
  const pixelRatio = renderPixelRatio(runtimeUiConfig, window.devicePixelRatio);
  if (renderer.getPixelRatio() !== pixelRatio) renderer.setPixelRatio(pixelRatio);
  if (dom.canvas.width !== Math.floor(w * pixelRatio) || dom.canvas.height !== Math.floor(h * pixelRatio) || camera.aspect !== w / h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}
let rendererResizeFrame = 0;
window.addEventListener('resize', resizeRenderer);
startup.defer(() => window.removeEventListener('resize', resizeRenderer));
startup.defer(() => {
  if (rendererResizeFrame) window.cancelAnimationFrame(rendererResizeFrame);
  rendererResizeFrame = 0;
});
resizeRenderer();
function queueRendererResize() {
  if (startup.signal.aborted || !recovery.available || rendererResizeFrame) return;
  rendererResizeFrame = window.requestAnimationFrame(() => {
    rendererResizeFrame = 0;
    resizeRenderer();
  });
}

const viewportResizeObserver = typeof ResizeObserver === 'undefined'
  ? null
  : new ResizeObserver(queueRendererResize);
if (viewportResizeObserver) startup.defer(() => viewportResizeObserver.disconnect());
viewportResizeObserver?.observe(dom.viewportShell);
viewportResizeObserver?.observe(dom.canvas);

refreshPanelLayout = () => { resizeRenderer(); queueRendererResize(); bodyPicker.refresh(); };

// ── UI Events ────────────────────────────────────────────────────────────────

const timeController = createTimeController({
  dom,
  simState,
  minTimeScale: MIN_TIME_SCALE_DAYS_PER_SEC,
  maxTimeScale: MAX_TIME_SCALE_DAYS_PER_SEC,
  currentJulianDate,
  formatJulianAsDate,
  onTimeJump: () => sunCtrl.maybeRefreshPhysics(Date.now(), true),
  signal: startup.signal
});
timeController.bindUi();

function updatePlayButton() {
  const label = dom.togglePlay.querySelector('span');
  if (label) label.textContent = simState.paused ? 'Resume' : 'Pause';
  dom.togglePlay.dataset.paused = String(Boolean(simState.paused));
  dom.togglePlay.setAttribute('aria-pressed', String(Boolean(simState.paused)));
  dom.togglePlay.setAttribute(
    'aria-label',
    simState.paused ? 'Resume simulation' : 'Pause simulation'
  );
}

dom.togglePlay.addEventListener('click', () => {
  simState.paused = !simState.paused;
  updatePlayButton();
}, { signal: startup.signal });

dom.toggleOrbits.addEventListener('change', () => {
  const vis = dom.toggleOrbits.checked;
  for (const line of orbitLines) {
    line.visible = vis && line.userData.stateAvailable !== false;
  }
}, { signal: startup.signal });

dom.toggleLabels.addEventListener('change', () => {
  const vis = dom.toggleLabels.checked;
  for (const entry of labels) entry.sprite.visible = vis;
}, { signal: startup.signal });

dom.toggleMoons.addEventListener('change', applyMoonVisibility, { signal: startup.signal });
for (const toggle of [dom.toggleAsteroids, dom.toggleKuiper]) {
  toggle.addEventListener('change', () => { applyBeltVisibility(); refillBodyList(); }, { signal: startup.signal });
}

dom.toggleRealisticScale.addEventListener('change', () => {
  simState.useRealisticScale = dom.toggleRealisticScale.checked;
  applyScaleMode();
}, { signal: startup.signal });

dom.aiaChannel.addEventListener('change', () => {
  sunCtrl.setAiaChannelOverride(dom.aiaChannel.value);
}, { signal: startup.signal });

dom.zoomSensitivity.addEventListener('input', () => {
  const v = Number(dom.zoomSensitivity.value);
  if (Number.isFinite(v)) {
    controls.zoomSpeed = v;
    dom.zoomSensitivityValue.textContent = `${v.toFixed(2)}×`;
  }
}, { signal: startup.signal });

dom.canvas.addEventListener('dblclick', (e) => {
  const rect = dom.canvas.getBoundingClientRect();
  const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  const raycaster = new Raycaster();
  raycaster.setFromCamera(new Vector2(ndcX, ndcY), camera);
  const targets = [...bodyMeshes].filter(([id, m]) => m.visible && bodyNodes.get(id)?.visible !== false).map(([, m]) => m);
  // Quadtree groups supply mean-sphere pick proxies; their GPU-displaced plane
  // children are deliberately excluded from CPU triangle raycasting.
  const hits = raycaster.intersectObjects(targets, false);
  if (hits.length > 0) {
    const bodyId = hits[0].object?.userData?.bodyId;
    if (bodyId) {
      explorer.setPreferredBody(bodyId);
      simState.followBodyId = bodyId;
      focusBody(bodyId, true);
      updateBodyInfoPanel(bodyId);
      if ([...dom.bodyList.options].some((option) => option.value === bodyId)) {
        dom.bodyList.value = bodyId;
      }
      updateCameraMode('follow', bodyId);
    }
  }
}, { signal: startup.signal });

const experiment = ownDisposable(createExperimentController({ dom, sun: sunCtrl, resolveSelection: engineSelectionResolver(agnEngine) }));

// ── Initialize ───────────────────────────────────────────────────────────────

refillBodyList();
model.update(simState.julianDate);
if ('Worker' in window) modelWorkerController.start();
updateSceneBodies();
if (simState.useRealisticScale) applyScaleMode();
focusBody('sun', true);
updateCameraMode('focus', 'sun');
controls.update();
camera.lookAt(controls.target);
updateCameraClipPlanes();
updateBodyInfoPanel('sun');
updatePlayButton();

for (const line of orbitLines) {
  line.visible = Boolean((dom.toggleOrbits as HTMLInputElement | null)?.checked)
    && line.userData.stateAvailable !== false;
}
for (const entry of labels) entry.sprite.visible = Boolean((dom.toggleLabels as HTMLInputElement | null)?.checked);

sunCtrl.maybeRefreshPhysics(Date.now(), true);

resizeRenderer();

// ── Animation Loop ───────────────────────────────────────────────────────────

const frameLifecycle = createFrameLifecycle({
  stages: [
    { name: 'time', run: ({ deltaSeconds }) => timeController.advanceLocalTime(deltaSeconds) },
    { name: 'model', run: ({ deltaSeconds }) => updateModelState(deltaSeconds) },
    { name: 'rotations', run: () => { updateBodyRotations(simState.julianDate); faceMoonTowardEarth(); } },
    { name: 'asteroids', run: syncAsteroidBeltInputs },
    { name: 'kuiper', run: () => { kuiperBeltUpdater.update(simState.julianDate); } },
    // Controller gates decorative motion; scientific inputs remain simulation JD.
    { name: 'sun', run: ({ timestamp }) => sunCtrl.update(simState.julianDate, timestamp * 0.001) },
    // Together: the moon offset scales the positions this stage has just rewritten.
    { name: 'metric-display', run: () => { applyMetricDisplayOffsets(model, bodyNodes, sunCtrl.getWarpState()); applyMoonAltitudeDisplay(); } },
    { name: 'solar-refresh', run: () => sunCtrl.maybeRefreshPhysics() },
    { name: 'follow', run: updateFollowTarget },
    { name: 'camera-actions', run: () => viewportCamera.applyPendingActions() },
    ...[...bodyMeshes.entries()].filter(([, mesh]) => mesh.userData.isQuadtree).map(([bodyId, mesh]) => {
      const sunWorldPos = new Vector3(0, 0, 0);
      const planetWorldPos = new Vector3();
      const meshInverse = new Matrix4();
      return {
        name: `quadtree:${bodyId}`,
        run: () => {
          mesh.userData.quadtree.update();
          sunWorldPos.set(0, 0, 0);
          mesh.getWorldPosition(planetWorldPos);
          const sunDirWorld = sunWorldPos.sub(planetWorldPos).normalize();
          meshInverse.copy(mesh.matrixWorld).invert();
          const sunLocalDir = sunDirWorld.transformDirection(meshInverse).normalize();
          mesh.userData.quadtree.setLightDirection(sunLocalDir);
        }
      };
    }),
    { name: 'surface-maps', run: () => surfaceMaps.update() },
    { name: 'background', run: () => { backgroundStars.position.copy(camera.position); } },
    { name: 'controls', run: () => { controls.update(); } },
    { name: 'clip-planes', run: updateCameraClipPlanes },
    { name: 'labels', run: updateLabels },
    { name: 'render', run: () => renderer.render(scene, camera) },
    { name: 'hud', run: () => timeController.updateHud() },
    { name: 'body-info', run: ({ timestamp }) => refreshBodyInfoDistance(timestamp) },
    { name: 'zoom-status', run: updateZoomStatus }
  ]
});

startup.defer(() => frameLifecycle.dispose());

try {
  // The source-selected complete scene is final before shader compilation.
  if (startup.signal.aborted || !recovery.available) return;
  syncAsteroidBeltInputs();
  await warmupRenderer(renderer, scene, camera, { signal: startup.signal });
  if (startup.signal.aborted || !recovery.available) return;
  updateLabels();
  renderer.render(scene, camera);
  frameLifecycle.start();
} catch (error) {
  if (startup.signal.aborted || !recovery.available) return;
  console.error('[visualization] shader initialization failed:', error);
  recovery.reportFailure('The visualization could not finish preparing its graphics. Reload the visualization to try again.');
}

}

void startSimulation().catch((error) => {
  if (startup.signal.aborted || !recovery.available) return;
  console.error('[visualization] initialization failed:', error);
  recovery.reportFailure('The visualization could not start. WebGL may be unavailable or the application configuration may be invalid. Enable graphics acceleration or try another supported browser, then reload.');
});
