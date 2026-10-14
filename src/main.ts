import './style.css';
import { createPanelController } from './frontend/app/panelController';
import { createExplorerController } from './frontend/app/explorerController';
import { createBodyPickerPresentation } from './frontend/app/bodyPickerPresentation';
import { createViewportCameraController } from './frontend/app/viewportCameraController';
import * as agnEngine from './frontend/features/superluminal-modeling/agnShockwaveEngine';
import { createExperimentController, engineSelectionResolver } from './frontend/app/experimentController';
import { createRendererRecovery } from './frontend/app/rendererRecovery';
import { createFrameLifecycle, hasFiniteAvailableBodyState } from './frontend/app/frameLifecycle';
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
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  Raycaster,
  RepeatWrapping,
  SphereGeometry,
  type ShaderMaterial,
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
import {
  createSolarSystemCatalog,
  type MoonEphemerisMap
} from './sim/catalog';
import { parseMoonEphemerisArtifact } from './sim/moonEphemeris';
import { propagateKeplerOrbit } from './sim/orbitMath';
import { SolarSystemModel } from './sim/solarSystemModel';
import { applyMetricDisplayOffsets } from './frontend/features/superluminal-modeling/metricDisplay';
import { resolveAgnSelection, type AgnEventOptions } from './frontend/features/superluminal-modeling/agnShockwaveEngine';
import { generatePlanetTexture } from './textures';
import { updateSceneBodiesFromModel } from './frontend/app/bodyManager';
import { createSimulationState } from './frontend/app/stateStore';
import { PlanetQuadtree } from './frontend/features/planetary/quadtreeLOD';
import { planetViewDistances } from './frontend/features/planetary/planetView';
import {
  buildCatalogIndexContract,
  buildModelWorkerCatalog,
  type CatalogIndexContract,
  isValidModelWorkerAvailabilityArray,
  isValidModelWorkerStateArray,
  MODEL_WORKER_RECORD_SIZE,
  MODEL_WORKER_STATE_SCHEMA_VERSION,
  type ModelWorkerCatalog,
  type ModelWorkerInitMessage,
  type ModelWorkerOutboundMessage,
  type ModelWorkerStateMessage,
  type ModelWorkerTickMessage
} from './workers/modelWorkerContract';
import {
  createRuntimeUiConfig,
  createSceneSetup,
  addDefaultLighting
} from './frontend/app/sceneSetup';
import { createTextureManager } from './frontend/app/textureManager';
import { createTimeController } from './frontend/app/timeController';
import { createSunController } from './sunController';
import { generateAsteroidBelt, type AsteroidBeltPopulation } from './sim/asteroidBelt';
import { generateKuiperBelt } from './sim/kuiperBelt';
import { createKuiperBeltUpdater } from './frontend/features/asteroids/kuiperBeltUpdater';
import type { CatalogBody } from './sim/catalog';
import {
  loadPhase1AsteroidCatalog,
  PHASE1_CATALOG_URL,
  PHASE1_CATALOG_META_URL,
  PHASE1_LOAD_LATENCY_BUDGET_MS
} from './sim/phase1AsteroidCatalog';
import { createAsteroidBeltRenderer, createKuiperBeltRenderer } from './frontend/features/asteroids/beltRenderer';
import {
  failedAsteroidCatalogStatus,
  loadingAsteroidCatalogStatus,
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
  toggleOrbits: elementById<HTMLInputElement>('toggle-orbits'),
  toggleMagneticField: elementById<HTMLInputElement>('toggle-magnetic-field'),
  toggleLabels: elementById<HTMLInputElement>('toggle-labels'),
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

renderAsteroidCatalogSourceStatus(dom.statusCatalog, loadingAsteroidCatalogStatus());

let refreshPanelLayout = () => {};
const panelController = createPanelController({
  app: dom.app, panel: dom.controlPanel, viewport: dom.viewportShell,
  toggle: dom.panelToggle, close: dom.panelClose, backdrop: dom.panelBackdrop,
  breakpoint: window.matchMedia('(max-width: 1100px)'), onLayoutChange: () => refreshPanelLayout()
});
window.addEventListener('beforeunload', () => panelController.dispose());
for (const disclosure of document.querySelectorAll<HTMLDetailsElement>('.panel-disclosure')) {
  const summary = disclosure.querySelector('summary');
  const sync = () => summary?.setAttribute('aria-expanded', String(disclosure.open));
  disclosure.addEventListener('toggle', sync); sync();
}

async function startSimulation() {
// ── Data & State ─────────────────────────────────────────────────────────────

// Moon rendering is not currently exposed by the shipped UI. Keep those 424
// catalog records available for provenance/search, but do not pretend to keep
// hidden dynamical states current or spend a worker tick propagating them.
const showMoons: boolean = false;
const moonEphemerides: MoonEphemerisMap | undefined = showMoons
  ? parseMoonEphemerisArtifact(
      (await import('./data/moonEphemerisChebyshev.json')).default
    ).bodies
  : undefined;
const catalog = createSolarSystemCatalog({ moonEphemerides });
const modelWorkerCatalog: ModelWorkerCatalog = buildModelWorkerCatalog(catalog.bodies, {
  includeMoons: showMoons
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
let modelWorker: Worker | null = null;
let modelWorkerEnabled = false;
let modelWorkerReady = false;
let modelWorkerTickInFlight = false;
let modelWorkerSequence = 0;
let lastModelWorkerAcceptedSequence = -1;
let lastModelWorkerAppliedSequence = -1;
let latestModelWorkerState: ModelWorkerStateMessage | null = null;
const ASTEROID_BELT_TARGET_COUNT = 50_000;
const ASTEROID_BELT_PHASE1_SOURCE_LIMIT = 100_000;

const TWO_PI = Math.PI * 2;
const BODY_LOCAL_SPIN_AXIS = new Vector3(0, 1, 0);
function bodyBaseRadiusAu(body: CatalogBody) {
  return simState.useRealisticScale ? body.realRadiusAu : body.displayRadiusAu;
}

function normalizeRadians(angle: number) {
  const wrapped = angle % TWO_PI;
  return wrapped >= 0 ? wrapped : wrapped + TWO_PI;
}

function computePlanetMuAu3Day2(massKg: number | null | undefined): number {
  if (typeof massKg !== 'number' || !Number.isFinite(massKg) || massKg <= 0) return 0;
  return (G_SI * massKg * DAY_SECONDS * DAY_SECONDS) / (AU_M * AU_M * AU_M);
}

// ── Renderer, Scene, Camera, Controls ────────────────────────────────────────

let stopVisualization = () => {};
const recovery = createRendererRecovery({
  canvas: dom.canvas, surface: dom.rendererUnavailable, retry: dom.rendererRetry,
  create: () => {
    const runtimeUiConfig = createRuntimeUiConfig();
    applyViewportSizeOverride({ viewportShell: dom.viewportShell, runtimeUiConfig });
    return { runtimeUiConfig, ...createSceneSetup({
      canvas: dom.canvas, runtimeUiConfig, initialZoomSensitivity: simState.zoomSensitivity, solarSystemMaxDistanceAu: 200
    }) };
  },
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
window.addEventListener('beforeunload', () => recovery.dispose());
if (!recovery.value) return;
const { renderer, scene, camera, controls, runtimeUiConfig } = recovery.value;
const backendBaseUrl = () => runtimeUiConfig.backendOrigin;
const viewportCamera = createViewportCameraController({ canvas: dom.canvas, actionRoot: dom.cameraTools, camera, controls });
addDefaultLighting(scene);

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
  sun: new SphereGeometry(1, 128, 96),
  planet: new SphereGeometry(1, 16, 12),
  moon: new SphereGeometry(1, 8, 6)
};

const PLANET_COLORS: Record<string, string> = {
  mercury: '#a0917c', venus: '#d4b980', earth: '#4a7abf',
  mars: '#b5653a', jupiter: '#c4a87c', saturn: '#d4c894',
  uranus: '#8cc8d4', neptune: '#4466b0', pluto: '#c8b89a'
};

const sunTextureCanvas = generatePlanetTexture('sun');
let sunTexture: CanvasTexture | null = null;
if (sunTextureCanvas) {
  sunTexture = new CanvasTexture(sunTextureCanvas);
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

// ── Body Nodes ───────────────────────────────────────────────────────────────

const bodyNodes = new Map();
const bodyMeshes = new Map();
const bodySpinGroups = new Map();
const orbitLines: Line[] = [];
const orbitLineByBodyId = new Map<string, Line>();
const labels: { bodyId: string; sprite: Sprite }[] = [];

function createLabelCanvas(text: string) {
  const canvas = document.createElement('canvas');
  const size = 256;
  canvas.width = size;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.85;
  ctx.fillText(text, size / 2, 32);
  return canvas;
}

function createLabelSprite(text: string) {
  const canvas = createLabelCanvas(text);
  const tex = new CanvasTexture(canvas);
  const mat = new SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new Sprite(mat);
  sprite.scale.set(0.12, 0.03, 1);
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

  if (['earth', 'moon', 'mars'].includes(body.id)) {
    const radius = bodyBaseRadiusAu(body);
    const quadtree = new PlanetQuadtree(body.id, radius, camera);
    mesh = quadtree.group;
    mesh.userData.isQuadtree = true;
    mesh.userData.quadtree = quadtree;
  } else if (body.id === 'sun') {
    geometry = geometryCache.sun;
    material = sunCtrl.createSunMaterial(sunTexture) ?? new MeshBasicMaterial({ color: new Color(body.color) });
    mesh = new Mesh(geometry, material);
    mesh.scale.setScalar(bodyBaseRadiusAu(body));
  } else if (body.type === 'star') {
    geometry = geometryCache.planet;
    material = new MeshBasicMaterial({ color: new Color(body.color) });
    mesh = new Mesh(geometry, material);
    mesh.scale.setScalar(bodyBaseRadiusAu(body));
  } else if (body.type === 'moon') {
    geometry = geometryCache.moon;
    material = new MeshStandardMaterial({ color: new Color(body.color ?? '#aaa'), roughness: 0.9 });
    mesh = new Mesh(geometry, material);
    mesh.scale.setScalar(bodyBaseRadiusAu(body));
  } else {
    geometry = geometryCache.planet;
    const col = PLANET_COLORS[body.id] ?? body.color ?? '#888';
    material = new MeshStandardMaterial({ color: new Color(col), roughness: 0.8 });
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
    label.position.set(0, radius * 2.5 + 0.03, 0);
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
  const segments = body.type === 'moon' ? 64 : 128;
  const positions = new Float32Array(segments * 3);
  const tmpVec = new Vector3();

  for (let i = 0; i < segments; i++) {
    const fraction = i / segments;
    const elapsed = fraction * body.orbit.periodDays;
    if (!propagateKeplerOrbit(body.orbit, elapsed, tmpVec)) return null;
    positions[i * 3] = tmpVec.x;
    positions[i * 3 + 1] = tmpVec.y;
    positions[i * 3 + 2] = tmpVec.z;
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const col = body.type === 'moon' ? '#556' : '#4477aa';
  const line = new Line(geo, new LineBasicMaterial({ color: new Color(col), transparent: true, opacity: 0.35 }));
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

// ── Background Stars ─────────────────────────────────────────────────────────

function createBackgroundStars(count = 6000, radius = 15000) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * TWO_PI;
    const u = Math.random() * 2 - 1;
    const phi = Math.acos(u);
    const r = radius;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return new Points(geo, new PointsMaterial({ color: '#ffffff', size: 1.2, sizeAttenuation: false }));
}

const backgroundStars = createBackgroundStars();
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
  createOrbitLine(body);
}

// ── Asteroid & Kuiper Belts ──────────────────────────────────────────────────

let asteroidPop = generateAsteroidBelt(ASTEROID_BELT_TARGET_COUNT, 42, { includeNamed: true });
const kuiperPop = generateKuiperBelt(5_000);

const jupiterPerturbationMu = computePlanetMuAu3Day2(bodyById.get('jupiter')?.massKg);
const saturnPerturbationMu = computePlanetMuAu3Day2(bodyById.get('saturn')?.massKg);
const asteroidJupiterPositionAu = new Vector3();
const asteroidSaturnPositionAu = new Vector3();

let asteroidBeltRenderer = createAsteroidBeltRenderer(asteroidPop.asteroids);
const kuiperBeltRenderer = createKuiperBeltRenderer(kuiperPop.kbos);
const kuiperBeltUpdater = createKuiperBeltUpdater(kuiperPop, kuiperBeltRenderer);
asteroidBeltRenderer.setPerturberMasses(jupiterPerturbationMu, saturnPerturbationMu);

solarSystemGroup.add(asteroidBeltRenderer.mesh);
solarSystemGroup.add(kuiperBeltRenderer.mesh);
if (kuiperBeltRenderer.companionMesh) {
  solarSystemGroup.add(kuiperBeltRenderer.companionMesh);
}

function refreshAsteroidBeltRenderer(population: AsteroidBeltPopulation) {
  solarSystemGroup.remove(asteroidBeltRenderer.mesh);
  asteroidBeltRenderer.dispose();
  asteroidPop = population;
  asteroidBeltRenderer = createAsteroidBeltRenderer(asteroidPop.asteroids);
  asteroidBeltRenderer.setPerturberMasses(jupiterPerturbationMu, saturnPerturbationMu);
  solarSystemGroup.add(asteroidBeltRenderer.mesh);
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

function initPhaseOneAsteroids() {
  loadPhase1AsteroidCatalog({
    maxRecords: ASTEROID_BELT_PHASE1_SOURCE_LIMIT,
    loadLatencyBudgetMs: PHASE1_LOAD_LATENCY_BUDGET_MS,
    metaUrl: PHASE1_CATALOG_META_URL
  }).then((catalog) => {
    const gate = catalog.acceptance;
    if (!catalog.accepted) {
      const reasons = gate.rejections.map(({ code, message }) => `[${code}] ${message}`);
      renderAsteroidCatalogSourceStatus(
        dom.statusCatalog,
        rejectedAsteroidCatalogStatus(gate.rejections)
      );
      console.warn('[phase-1] Acceptance gates failed:', reasons.join(' | '));
      return;
    }

    if (!gate.latency.passed && gate.latency.reason) {
      console.warn('[phase-1] Catalog load exceeded its performance budget:', gate.latency.reason);
    }

    if (!catalog.asteroids.length) return;
    const phaseOnePopulation = generateAsteroidBelt(
      ASTEROID_BELT_TARGET_COUNT,
      42,
      {
        deterministicAsteroids: catalog.asteroids,
        includeNamed: false
      }
    );
    if (phaseOnePopulation.count <= 0) return;
    refreshAsteroidBeltRenderer(phaseOnePopulation);
    renderAsteroidCatalogSourceStatus(
      dom.statusCatalog,
      verifiedAsteroidCatalogStatus(catalog.sourceCount)
    );
    refillBodyList();
    console.info(
      `[phase-1] Loaded deterministic catalog from ${PHASE1_CATALOG_URL} (` +
      `${catalog.sourceCount.toLocaleString()} source rows, ` +
      `${catalog.asteroids.length.toLocaleString()} parsed records, ` +
      `version=${catalog.catalogVersion}, ` +
      `checksum=${catalog.checksumActual}, ` +
      `load=${catalog.loadMs.toFixed(1)}ms (budget ${catalog.loadLatencyBudgetMs}ms), ` +
      `taxonomyC=${catalog.taxonomyCheck.counts.C}, ` +
      `taxonomyS=${catalog.taxonomyCheck.counts.S}, ` +
      `taxonomyM=${catalog.taxonomyCheck.counts.M}, ` +
      `target=${ASTEROID_BELT_TARGET_COUNT.toLocaleString()}).`
    );
  }).catch((error) => {
    renderAsteroidCatalogSourceStatus(dom.statusCatalog, failedAsteroidCatalogStatus());
    console.warn('[phase-1] Using procedural fallback for asteroid belt:', error);
  });
}

kuiperBeltUpdater.update(simState.julianDate);
initPhaseOneAsteroids();
syncAsteroidBeltInputs();

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
  controls.minDistance = body.type === 'star' ? 0.0002 : planetViewDistances(radius).minimum;

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

function updateBodyInfoPanel(bodyId: string) {
  const body = bodyById.get(bodyId);
  if (!body) return;
  const state = model.getState(bodyId);
  const dist = !state || state.available === false ? null : state.worldPosition.length();
  const typeLabel = body.type.charAt(0).toUpperCase() + body.type.slice(1);

  dom.bodyInfo.dataset.bodyId = body.id;
  dom.bodyInfoName.textContent = body.name;
  dom.bodyInfoType.textContent = typeLabel;
  dom.bodyInfoRadius.textContent = `${body.radiusKm.toLocaleString(undefined, {
    minimumFractionDigits: body.radiusKm < 100 ? 1 : 0,
    maximumFractionDigits: 1
  })} km`;
  dom.bodyInfoDistance.textContent = dist === null ? 'State unavailable' : `${dist.toFixed(4)} AU`;
  dom.bodyInfoPeriod.textContent = body.orbit
    ? `${body.orbit.periodDays.toLocaleString(undefined, { maximumFractionDigits: 1 })} days`
    : '—';
}

// ── Body List ────────────────────────────────────────────────────────────────

const majorBodies = catalog.bodies.filter((b) =>
  b.type === 'star' || b.type === 'planet' || b.type === 'dwarf'
);
const explorer = createExplorerController({
  dom, bodies: majorBodies, onInspect: updateBodyInfoPanel,
  onFocus: (bodyId) => { simState.followBodyId = null; focusBody(bodyId, true); updateCameraMode('focus', bodyId); },
  onFollow: (bodyId) => { simState.followBodyId = bodyId; focusBody(bodyId, true); updateCameraMode('follow', bodyId); },
  onFree: () => { simState.followBodyId = null; updateCameraMode('free'); }
});
const bodyPicker = createBodyPickerPresentation({ select: dom.bodyList, narrow: window.matchMedia('(max-width: 600px)'), coarse: window.matchMedia('(any-pointer: coarse)') });
function refillBodyList() {
  explorer.refresh(); bodyPicker.refresh();
  const totalBodies = majorBodies.length + (asteroidPop?.count ?? 0) + (kuiperPop?.count ?? 0);
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
      child.rotation.y = normalizeRadians(offset + (TWO_PI / (rotH * 3_600)) * elapsedSeconds);
    }
  }
}

// ── Scene Body Positions ─────────────────────────────────────────────────────

function disableModelWorkerIntegration() {
  if (modelWorker) {
    modelWorker.terminate();
  }
  modelWorker = null;
  modelWorkerEnabled = false;
  modelWorkerReady = false;
  modelWorkerTickInFlight = false;
  latestModelWorkerState = null;
}

function initializeModelWorker() {
  if (!('Worker' in window)) {
    return;
  }
  if (modelWorker) {
    return;
  }

  try {
    modelWorker = new Worker(new URL('./workers/modelWorker.ts', import.meta.url), { type: 'module' });
  } catch (error) {
    console.warn('[modelWorker] unavailable:', error);
    return;
  }

  modelWorker.onmessage = (event: MessageEvent<ModelWorkerOutboundMessage>) => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;

    if (message.type === 'ready') {
      if (
        message.schemaVersion !== MODEL_WORKER_STATE_SCHEMA_VERSION
        || message.bodyCount !== modelWorkerBodyCount
      ) {
        console.warn('[modelWorker] incompatible ready contract');
        disableModelWorkerIntegration();
        return;
      }
      modelWorkerReady = true;
      return;
    }

    if (message.type === 'state') {
      const stateMessage = message;
      const sequence = Number(stateMessage.sequence);
      modelWorkerTickInFlight = false;
      if (
        stateMessage.schemaVersion !== MODEL_WORKER_STATE_SCHEMA_VERSION
        || !Number.isInteger(sequence)
        || sequence <= lastModelWorkerAcceptedSequence
        || !Number.isFinite(stateMessage.tickJd)
        || !isValidModelWorkerStateArray(stateMessage.bodies, modelWorkerBodyCount)
        || !isValidModelWorkerAvailabilityArray(
          stateMessage.availability,
          modelWorkerBodyCount
        )
      ) {
        console.warn('[modelWorker] rejected malformed or stale state payload');
        return;
      }

      if (!hasFiniteAvailableBodyState(stateMessage.bodies, stateMessage.availability)) {
        console.warn('[modelWorker] quarantined nonfinite available state');
        disableModelWorkerIntegration();
        return;
      }

      lastModelWorkerAcceptedSequence = sequence;

      latestModelWorkerState = {
        type: 'state',
        schemaVersion: MODEL_WORKER_STATE_SCHEMA_VERSION,
        sequence,
        bodies: stateMessage.bodies,
        availability: stateMessage.availability,
        tickJd: Number(stateMessage.tickJd),
        profilerMs: Number.isFinite(stateMessage.profilerMs) ? stateMessage.profilerMs : undefined
      };
    }
  };

  modelWorker.onerror = (event) => {
    const errorMessage = event.message || 'unknown worker error';
    console.warn('[modelWorker] stopped:', errorMessage);
    disableModelWorkerIntegration();
  };

  const initMessage: ModelWorkerInitMessage = {
    type: 'init',
    catalog: modelWorkerCatalog,
    simStartJd: simState.julianDate,
    sequence: ++modelWorkerSequence
  };

  modelWorker.postMessage(initMessage);
  modelWorkerEnabled = true;
}

function updateModelLocally(deltaSeconds: number) {
  model.update(simState.julianDate);
}

function dispatchModelWorkerTick(deltaSeconds: number) {
  if (!modelWorker || !modelWorkerEnabled || !modelWorkerReady || modelWorkerTickInFlight) return;

  const tickMessage: ModelWorkerTickMessage = {
    type: 'tick',
    simState: {
      julianDate: simState.julianDate,
      stepMs: deltaSeconds * 1000
    },
    sequence: ++modelWorkerSequence
  };

  try {
    modelWorker.postMessage(tickMessage);
    modelWorkerTickInFlight = true;
  } catch (error) {
    modelWorkerTickInFlight = false;
    console.warn('[modelWorker] tick failed:', error);
    disableModelWorkerIntegration();
  }
}

function applyLatestWorkerSnapshot() {
  if (!latestModelWorkerState || !modelWorkerReady) return false;

  const message = latestModelWorkerState;
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
      orbitLine.visible = stateAvailable && dom.toggleOrbits.checked;
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

  if (modelWorkerEnabled && modelWorker && modelWorkerReady) {
    try {
      dispatchModelWorkerTick(deltaSeconds);
      if (latestModelWorkerState) {
        snapshotApplied = applyLatestWorkerSnapshot();
      }
    } catch (error) {
      console.warn('[modelWorker] falling back after snapshot failure:', error);
      disableModelWorkerIntegration();
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
  if (!modelWorkerEnabled || !latestModelWorkerState) return false;
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
    orbitLine.visible = stateAvailable && dom.toggleOrbits.checked;
  }
}

function updateSceneBodies() {
  if (modelWorkerEnabled && modelWorkerReady && latestModelWorkerState) {
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
  const w = dom.canvas.clientWidth;
  const h = dom.canvas.clientHeight;
  if (w <= 0 || h <= 0) return;
  const pixelRatio = renderPixelRatio(runtimeUiConfig, window.devicePixelRatio);
  renderer.setPixelRatio(pixelRatio);
  if (dom.canvas.width !== Math.floor(w * pixelRatio) || dom.canvas.height !== Math.floor(h * pixelRatio) || camera.aspect !== w / h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}
window.addEventListener('resize', resizeRenderer);
resizeRenderer();

let rendererResizeFrame = 0;
function queueRendererResize() {
  if (rendererResizeFrame) return;
  rendererResizeFrame = window.requestAnimationFrame(() => {
    rendererResizeFrame = 0;
    resizeRenderer();
  });
}

const viewportResizeObserver = typeof ResizeObserver === 'undefined'
  ? null
  : new ResizeObserver(queueRendererResize);
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
  formatJulianAsDate
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
});

dom.toggleOrbits.addEventListener('change', () => {
  const vis = dom.toggleOrbits.checked;
  for (const line of orbitLines) {
    line.visible = vis && line.userData.stateAvailable !== false;
  }
});

dom.toggleLabels.addEventListener('change', () => {
  const vis = dom.toggleLabels.checked;
  for (const entry of labels) entry.sprite.visible = vis;
});

dom.toggleRealisticScale.addEventListener('change', () => {
  simState.useRealisticScale = dom.toggleRealisticScale.checked;
  applyScaleMode();
});

dom.aiaChannel.addEventListener('change', () => {
  sunCtrl.setAiaChannelOverride(dom.aiaChannel.value);
});

dom.zoomSensitivity.addEventListener('input', () => {
  const v = Number(dom.zoomSensitivity.value);
  if (Number.isFinite(v)) {
    controls.zoomSpeed = v;
    dom.zoomSensitivityValue.textContent = `${v.toFixed(2)}×`;
  }
});

dom.canvas.addEventListener('dblclick', (e) => {
  const rect = dom.canvas.getBoundingClientRect();
  const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  const raycaster = new Raycaster();
  raycaster.setFromCamera(new Vector2(ndcX, ndcY), camera);
  const targets = [...bodyMeshes.values()].filter((m) => m.visible);
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
});

const experiment = createExperimentController({ dom, sun: sunCtrl, resolveSelection: engineSelectionResolver(agnEngine) });

// ── Initialize ───────────────────────────────────────────────────────────────

refillBodyList();
model.update(simState.julianDate);
initializeModelWorker();
updateSceneBodies();
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
renderer.render(scene, camera);

// ── Animation Loop ───────────────────────────────────────────────────────────

const frameLifecycle = createFrameLifecycle({
  stages: [
    { name: 'time', run: ({ deltaSeconds }) => timeController.advanceLocalTime(deltaSeconds) },
    { name: 'model', run: ({ deltaSeconds }) => updateModelState(deltaSeconds) },
    { name: 'rotations', run: () => updateBodyRotations(simState.julianDate) },
    { name: 'asteroids', run: syncAsteroidBeltInputs },
    { name: 'kuiper', run: () => { kuiperBeltUpdater.update(simState.julianDate); } },
    // Controller gates decorative motion; scientific inputs remain simulation JD.
    { name: 'sun', run: ({ timestamp }) => sunCtrl.update(simState.julianDate, timestamp * 0.001) },
    { name: 'metric-display', run: () => applyMetricDisplayOffsets(model, bodyNodes, sunCtrl.getWarpState()) },
    { name: 'solar-refresh', run: () => sunCtrl.maybeRefreshPhysics() },
    { name: 'follow', run: updateFollowTarget },
    { name: 'camera-actions', run: () => viewportCamera.applyPendingActions() },
    ...[...bodyMeshes.entries()].filter(([, mesh]) => mesh.userData.isQuadtree).map(([bodyId, mesh]) => ({
      name: `quadtree:${bodyId}`,
      run: () => {
        mesh.userData.quadtree.update();
        const sunWorldPos = new Vector3(0, 0, 0);
        const planetWorldPos = new Vector3();
        mesh.getWorldPosition(planetWorldPos);
        const sunDirWorld = sunWorldPos.sub(planetWorldPos).normalize();
        const meshInverse = mesh.matrixWorld.clone().invert();
        const sunLocalDir = sunDirWorld.transformDirection(meshInverse).normalize();
        mesh.userData.quadtree.setLightDirection(sunLocalDir);
      }
    })),
    { name: 'background', run: () => { backgroundStars.position.copy(camera.position); } },
    { name: 'controls', run: () => { controls.update(); } },
    { name: 'clip-planes', run: updateCameraClipPlanes },
    { name: 'render', run: () => renderer.render(scene, camera) },
    { name: 'hud', run: () => timeController.updateHud() },
    { name: 'zoom-status', run: () => {
      if (dom.statusZoom) {
        const dist = camera.position.distanceTo(controls.target);
        dom.statusZoom.textContent = `Range · ${dist < 1 ? (dist * AU_KM).toFixed(0) + ' km' : dist.toFixed(2) + ' AU'}`;
      }
    } }
  ]
});

stopVisualization = () => {
  frameLifecycle.dispose(); controls.enabled = false;
  viewportCamera.dispose(); disableModelWorkerIntegration(); sunCtrl.disposeSolarDelivery();
};
frameLifecycle.start();

// ── Resource Cleanup ──────────────────────────────────────────────────────────

window.addEventListener('beforeunload', () => {
  frameLifecycle.dispose();
  window.removeEventListener('resize', resizeRenderer);
  refreshPanelLayout = () => {};
  explorer.dispose(); bodyPicker.dispose(); viewportCamera.dispose(); experiment.dispose(); controls.dispose();
  sunCtrl.disposeSolarDelivery();
  viewportResizeObserver?.disconnect();
  if (rendererResizeFrame) window.cancelAnimationFrame(rendererResizeFrame);

  if (modelWorker) {
    modelWorker.terminate();
    modelWorker = null;
  }

  asteroidBeltRenderer.dispose();
  kuiperBeltRenderer.dispose();

  for (const mesh of bodyMeshes.values()) {
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m: { dispose: () => void }) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    }
  }

  for (const line of orbitLines) {
    line.geometry.dispose();
    if (Array.isArray(line.material)) {
      line.material.forEach((m: { dispose: () => void }) => m.dispose());
    } else {
      line.material.dispose();
    }
  }

  for (const entry of labels) {
    const sprite = entry.sprite;
    if (sprite.material.map) sprite.material.map.dispose();
    sprite.material.dispose();
  }

  backgroundStars.geometry.dispose();
  if (Array.isArray(backgroundStars.material)) {
    backgroundStars.material.forEach((m: { dispose: () => void }) => m.dispose());
  } else {
    backgroundStars.material.dispose();
  }

  if (sunTexture) sunTexture.dispose();
  renderer.dispose();
});

}

void startSimulation();
