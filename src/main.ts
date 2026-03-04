// @ts-nocheck
import './style.css';
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
import { propagateKeplerOrbit } from './sim/orbitMath';
import { SolarSystemModel } from './sim/solarSystemModel';
import { metricFrameDragPeak, evaluateLocalMetricShift } from './frontend/features/superluminal-modeling/smbhPropagation';
import { generatePlanetTexture } from './textures';
import { createSimulationState } from './frontend/app/stateStore';
import {
  createRuntimeUiConfig,
  createSceneSetup,
  addDefaultLighting
} from './frontend/app/sceneSetup';
import { createTextureManager } from './frontend/app/textureManager';
import { createTimeController } from './frontend/app/timeController';
import { createSunController } from './sunController';
import { generateAsteroidBelt } from './sim/asteroidBelt';
import { generateKuiperBelt, propagateKBOPositions } from './sim/kuiperBelt';
import {
  loadPhase1AsteroidCatalog,
  PHASE1_CATALOG_URL,
  PHASE1_CATALOG_META_URL,
  PHASE1_LOAD_LATENCY_BUDGET_MS
} from './sim/phase1AsteroidCatalog';
import { createAsteroidBeltRenderer, createKuiperBeltRenderer } from './frontend/features/asteroids/beltRenderer';

// ── DOM ──────────────────────────────────────────────────────────────────────

const dom = {
  canvas: document.getElementById('space-canvas'),
  togglePlay: document.getElementById('toggle-play'),
  nowTime: document.getElementById('now-time'),
  timeScale: document.getElementById('time-scale'),
  timeScaleValue: document.getElementById('time-scale-value'),
  timeDate: document.getElementById('time-date'),
  toggleOrbits: document.getElementById('toggle-orbits'),
  toggleMagneticField: document.getElementById('toggle-magnetic-field'),
  toggleLabels: document.getElementById('toggle-labels'),
  toggleRealisticScale: document.getElementById('toggle-realistic-scale'),
  aiaChannel: document.getElementById('aia-channel'),
  bodyList: document.getElementById('body-list'),
  focusBody: document.getElementById('focus-body'),
  followBody: document.getElementById('follow-body'),
  clearFollow: document.getElementById('clear-follow'),
  bodyInfo: document.getElementById('body-info'),
  statusFocus: document.getElementById('status-focus'),
  statusBodies: document.getElementById('status-bodies'),
  statusZoom: document.getElementById('status-zoom'),
  zoomSensitivity: document.getElementById('zoom-sensitivity'),
  zoomSensitivityValue: document.getElementById('zoom-sensitivity-value'),
  viewportShell: document.getElementById('viewport-shell'),
  agnSource: document.getElementById('agn-source'),
  agnPreset: document.getElementById('agn-preset'),
  agnHypothesis: document.getElementById('agn-hypothesis'),
  agnObserverFrame: document.getElementById('agn-observer-frame'),
  agnStochastic: document.getElementById('agn-stochastic'),
  triggerAgnShockwave: document.getElementById('trigger-agn-shockwave')
};

// ── Data & State ─────────────────────────────────────────────────────────────

const catalog = createSolarSystemCatalog();
const model = new SolarSystemModel(catalog);
const bodyById = new Map(catalog.bodies.map((b) => [b.id, b]));
const simState = createSimulationState({
  currentJulianDate,
  defaultTimeScaleDaysPerSec: DEFAULT_TIME_SCALE_DAYS_PER_SEC
});
const ASTEROID_BELT_TARGET_COUNT = 15_000;
const ASTEROID_BELT_PHASE1_SOURCE_LIMIT = 100_000;

const TWO_PI = Math.PI * 2;
const BODY_LOCAL_SPIN_AXIS = new Vector3(0, 1, 0);
const DEFAULT_BACKEND_HOST = 'localhost';
const DEFAULT_BACKEND_PORT = 8042;

function backendBaseUrl() {
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  const host = window.location.hostname || DEFAULT_BACKEND_HOST;
  return `${protocol}://${host}:${DEFAULT_BACKEND_PORT}`;
}

function bodyBaseRadiusAu(body) {
  return simState.useRealisticScale ? body.realRadiusAu : body.displayRadiusAu;
}

function normalizeRadians(angle) {
  const wrapped = angle % TWO_PI;
  return wrapped >= 0 ? wrapped : wrapped + TWO_PI;
}

function computePlanetMuAu3Day2(massKg: number | null | undefined): number {
  if (!Number.isFinite(massKg) || massKg <= 0) return 0;
  return (G_SI * massKg * DAY_SECONDS * DAY_SECONDS) / (AU_M * AU_M * AU_M);
}

// ── Renderer, Scene, Camera, Controls ────────────────────────────────────────

const runtimeUiConfig = createRuntimeUiConfig();
const { renderer, scene, camera, controls } = createSceneSetup({
  canvas: dom.canvas,
  runtimeUiConfig,
  initialZoomSensitivity: simState.zoomSensitivity,
  solarSystemMaxDistanceAu: 200
});
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

const PLANET_COLORS = {
  mercury: '#a0917c', venus: '#d4b980', earth: '#4a7abf',
  mars: '#b5653a', jupiter: '#c4a87c', saturn: '#d4c894',
  uranus: '#8cc8d4', neptune: '#4466b0', pluto: '#c8b89a'
};

const sunTextureCanvas = generatePlanetTexture('sun');
let sunTexture = null;
if (sunTextureCanvas) {
  sunTexture = new CanvasTexture(sunTextureCanvas);
  configureLoadedTexture(sunTexture);
  sunTexture.wrapS = RepeatWrapping;
  sunTexture.wrapT = RepeatWrapping;
  sunTexture.needsUpdate = true;
}

// ── Sun Controller ───────────────────────────────────────────────────────────

const sunBody = bodyById.get('sun');

const sunCtrl = createSunController({
  camera,
  simState,
  backendBaseUrl,
  configureLoadedTexture,
  observationTextureLoader: solarObservationTextureLoader,
  getSunRadiusAu: () => sunBody ? bodyBaseRadiusAu(sunBody) : 0.01,
  isMagneticFieldEnabled: () => Boolean(dom.toggleMagneticField?.checked)
});

// ── Body Nodes ───────────────────────────────────────────────────────────────

const bodyNodes = new Map();
const bodyMeshes = new Map();
const bodySpinGroups = new Map();
const orbitLines = [];
const labels = [];

function createLabelCanvas(text) {
  const canvas = document.createElement('canvas');
  const size = 256;
  canvas.width = size;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.85;
  ctx.fillText(text, size / 2, 32);
  return canvas;
}

function createLabelSprite(text) {
  const canvas = createLabelCanvas(text);
  const tex = new CanvasTexture(canvas);
  const mat = new SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new Sprite(mat);
  sprite.scale.set(0.12, 0.03, 1);
  return sprite;
}

function createBodyNode(body) {
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
  spinGroup.quaternion.setFromUnitVectors(BODY_LOCAL_SPIN_AXIS, spinAxisWorld);
  node.add(spinGroup);
  bodySpinGroups.set(body.id, spinGroup);

  let material;
  let geometry;

  if (body.id === 'sun') {
    geometry = geometryCache.sun;
    material = sunCtrl.createSunMaterial(sunTexture) ?? new MeshBasicMaterial({ color: new Color(body.color) });
  } else if (body.type === 'star') {
    geometry = geometryCache.planet;
    material = new MeshBasicMaterial({ color: new Color(body.color) });
  } else if (body.type === 'moon') {
    geometry = geometryCache.moon;
    material = new MeshStandardMaterial({ color: new Color(body.color ?? '#aaa'), roughness: 0.9 });
  } else {
    geometry = geometryCache.planet;
    const col = PLANET_COLORS[body.id] ?? body.color ?? '#888';
    material = new MeshStandardMaterial({ color: new Color(col), roughness: 0.8 });
  }

  const mesh = new Mesh(geometry, material);
  const radius = bodyBaseRadiusAu(body);
  mesh.scale.setScalar(radius);
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

function createOrbitLine(body) {
  if (!body.orbit || body.type === 'star') return null;
  const segments = body.type === 'moon' ? 64 : 128;
  const positions = new Float32Array(segments * 3);
  const tmpVec = new Vector3();

  for (let i = 0; i < segments; i++) {
    const fraction = i / segments;
    const elapsed = fraction * body.orbit.periodDays;
    propagateKeplerOrbit(body.orbit, elapsed, tmpVec);
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

// ── Scene Assembly ───────────────────────────────────────────────────────────

const showMoons = false;
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

const kuiperPositions = new Float32Array(kuiperPop.count * 3);

const jupiterPerturbationMu = computePlanetMuAu3Day2(bodyById.get('jupiter')?.massKg);
const saturnPerturbationMu = computePlanetMuAu3Day2(bodyById.get('saturn')?.massKg);
const asteroidJupiterPositionAu = new Vector3();
const asteroidSaturnPositionAu = new Vector3();

let asteroidBeltRenderer = createAsteroidBeltRenderer(asteroidPop.asteroids);
const kuiperBeltRenderer = createKuiperBeltRenderer(kuiperPop.kbos);
asteroidBeltRenderer.setPerturberMasses(jupiterPerturbationMu, saturnPerturbationMu);

solarSystemGroup.add(asteroidBeltRenderer.mesh);
solarSystemGroup.add(kuiperBeltRenderer.mesh);

function refreshAsteroidBeltRenderer(population) {
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
      const reasons: string[] = [];
      if (!gate.version.passed && gate.version.reason) reasons.push(gate.version.reason);
      if (!gate.rows.passed && gate.rows.reason) reasons.push(gate.rows.reason);
      if (!gate.taxonomy.passed && gate.taxonomy.reason) reasons.push(gate.taxonomy.reason);
      if (!gate.checksum.passed && gate.checksum.reason) reasons.push(gate.checksum.reason);
      if (!gate.latency.passed && gate.latency.reason) reasons.push(gate.latency.reason);
      console.warn('[phase-1] Acceptance gates failed:', reasons.join(' | '));
      return;
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
    console.warn('[phase-1] Using procedural fallback for asteroid belt:', error);
  });
}

propagateKBOPositions(kuiperPop.kbos, simState.julianDate, kuiperPositions);
kuiperBeltRenderer.updatePositions(kuiperPositions);
initPhaseOneAsteroids();
syncAsteroidBeltInputs();

// ── Focus & Follow ───────────────────────────────────────────────────────────

const tempVec = new Vector3();

function focusBody(bodyId, hardSnap = false) {
  const body = bodyById.get(bodyId);
  const node = bodyNodes.get(bodyId);
  if (!body || !node) return;

  node.getWorldPosition(tempVec);
  const offset = camera.position.clone().sub(controls.target);
  const radius = bodyBaseRadiusAu(body);
  const preferredDistance = body.type === 'star'
    ? (simState.useRealisticScale ? 0.14 : 2.6)
    : Math.max(radius * 20, 0.01);

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
  if (dom.statusFocus) dom.statusFocus.textContent = `Focus: ${body.name}`;
}

function updateFollowTarget() {
  if (!simState.followBodyId) return;
  const node = bodyNodes.get(simState.followBodyId);
  if (!node) return;
  node.getWorldPosition(tempVec);
  const offset = camera.position.clone().sub(controls.target);
  controls.target.copy(tempVec);
  camera.position.copy(tempVec).add(offset);
}

function updateBodyInfoPanel(bodyId) {
  const body = bodyById.get(bodyId);
  if (!body || !dom.bodyInfo) return;
  const state = model.getState(bodyId);
  const dist = state?.worldPosition.length() ?? 0;
  dom.bodyInfo.textContent = [
    `Name: ${body.name}`,
    `Type: ${body.type}`,
    `Radius: ${body.radiusKm.toFixed(1)} km`,
    `Distance from Sun: ${dist.toFixed(4)} AU`,
    body.orbit ? `Orbital period: ${body.orbit.periodDays.toFixed(1)} days` : ''
  ].filter(Boolean).join('\n');
}

// ── Body List ────────────────────────────────────────────────────────────────

const majorBodies = catalog.bodies.filter((b) =>
  b.type === 'star' || b.type === 'planet' || b.type === 'dwarf'
);

function refillBodyList() {
  if (!dom.bodyList) return;
  dom.bodyList.innerHTML = '';
  for (const body of majorBodies) {
    const option = document.createElement('option');
    option.value = body.id;
    option.textContent = `${body.name} [${body.type}]`;
    dom.bodyList.appendChild(option);
  }
  const totalBodies = majorBodies.length + (asteroidPop?.count ?? 0) + (kuiperPop?.count ?? 0);
  if (dom.statusBodies) dom.statusBodies.textContent = `Bodies: ${totalBodies.toLocaleString()}`;
}

// ── Scale Mode ───────────────────────────────────────────────────────────────

function applyScaleMode() {
  for (const body of catalog.bodies) {
    const mesh = bodyMeshes.get(body.id);
    if (!mesh) continue;
    mesh.scale.setScalar(bodyBaseRadiusAu(body));
  }
  sunCtrl.onScaleChange();
  // Notify belt renderers so asteroids use physical sizes in realistic mode
  asteroidBeltRenderer.setScaleMode(simState.useRealisticScale);
  kuiperBeltRenderer.setScaleMode(simState.useRealisticScale);
  if (simState.focusedBodyId) focusBody(simState.focusedBodyId, true);
}

// ── Body Rotations ───────────────────────────────────────────────────────────

function updateBodyRotations(julianDate) {
  const elapsedSeconds = (julianDate - J2000_JD) * 86_400;
  for (const body of catalog.bodies) {
    const spinGroup = bodySpinGroups.get(body.id);
    if (!spinGroup) continue;
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

function updateSceneBodies() {
  for (const body of catalog.bodies) {
    const node = bodyNodes.get(body.id);
    if (!node) continue;
    const state = model.getState(body.id);
    if (!state) continue;
    if (body.parentId && body.parentId !== 'sun') {
      const parentState = model.getState(body.parentId);
      if (parentState) {
        node.position.set(
          state.worldPosition.x - parentState.worldPosition.x,
          state.worldPosition.y - parentState.worldPosition.y,
          state.worldPosition.z - parentState.worldPosition.z
        );
        continue;
      }
    }
    node.position.copy(state.worldPosition);
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, runtimeUiConfig.maxPixelRatio));
  if (dom.canvas.width !== w || dom.canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}
window.addEventListener('resize', resizeRenderer);
resizeRenderer();

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

dom.togglePlay?.addEventListener('click', () => {
  simState.paused = !simState.paused;
  dom.togglePlay.textContent = simState.paused ? 'Play' : 'Pause';
});

dom.toggleOrbits?.addEventListener('change', () => {
  const vis = dom.toggleOrbits.checked;
  for (const line of orbitLines) line.visible = vis;
});

dom.toggleLabels?.addEventListener('change', () => {
  const vis = dom.toggleLabels.checked;
  for (const entry of labels) entry.sprite.visible = vis;
});

dom.toggleRealisticScale?.addEventListener('change', () => {
  simState.useRealisticScale = dom.toggleRealisticScale.checked;
  applyScaleMode();
});

dom.aiaChannel?.addEventListener('change', () => {
  sunCtrl.setAiaChannelOverride(dom.aiaChannel.value);
});

dom.zoomSensitivity?.addEventListener('input', () => {
  const v = Number(dom.zoomSensitivity.value);
  if (Number.isFinite(v)) {
    controls.zoomSpeed = v;
    if (dom.zoomSensitivityValue) dom.zoomSensitivityValue.textContent = `x${v.toFixed(2)}`;
  }
});

dom.focusBody?.addEventListener('click', () => {
  const bodyId = dom.bodyList?.value;
  if (bodyId) {
    simState.followBodyId = null;
    focusBody(bodyId, true);
    updateBodyInfoPanel(bodyId);
  }
});

dom.followBody?.addEventListener('click', () => {
  const bodyId = dom.bodyList?.value;
  if (bodyId) {
    simState.followBodyId = bodyId;
    focusBody(bodyId, true);
    updateBodyInfoPanel(bodyId);
    const body = bodyById.get(bodyId);
    if (body && dom.statusFocus) dom.statusFocus.textContent = `Following: ${body.name}`;
  }
});

dom.clearFollow?.addEventListener('click', () => {
  simState.followBodyId = null;
  if (dom.statusFocus && simState.focusedBodyId) {
    const body = bodyById.get(simState.focusedBodyId);
    dom.statusFocus.textContent = `Focus: ${body?.name ?? 'Sun'}`;
  }
});

dom.bodyList?.addEventListener('change', () => {
  updateBodyInfoPanel(dom.bodyList.value);
});

dom.canvas?.addEventListener('dblclick', (e) => {
  const rect = dom.canvas.getBoundingClientRect();
  const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  const raycaster = new Raycaster();
  raycaster.setFromCamera(new Vector2(ndcX, ndcY), camera);
  const targets = [...bodyMeshes.values()].filter((m) => m.visible);
  const hits = raycaster.intersectObjects(targets, false);
  if (hits.length > 0) {
    const bodyId = hits[0].object?.userData?.bodyId;
    if (bodyId) {
      simState.followBodyId = bodyId;
      focusBody(bodyId, true);
      updateBodyInfoPanel(bodyId);
    }
  }
});

dom.triggerAgnShockwave?.addEventListener('click', () => {
  const source = dom.agnSource?.value || 'SagittariusA';
  const preset = dom.agnPreset?.value || '';
  const observerFrame = Boolean(dom.agnObserverFrame?.checked);
  const hypothesis = dom.agnHypothesis?.value || 'compound';
  sunCtrl.setAgnObserverFrameMode(observerFrame);

  let impactTimeSec = 8.0;
  let intensity = 1.4;
  if (source === 'CentaurusA') {
    impactTimeSec = 9.5;
    intensity = 1.1;
  } else if (source === 'Maffei1') {
    impactTimeSec = 10.5;
    intensity = 0.7;
  } else if (source === 'M87') {
    impactTimeSec = 12.0;
    intensity = 0.5;
  }

  const options = {};
  if (preset) options.preset = preset;
  if (hypothesis !== 'compound') options.hypothesis = hypothesis;

  sunCtrl.triggerAgnShockwave(source, impactTimeSec, intensity, options);
});

dom.agnObserverFrame?.addEventListener('change', () => {
  sunCtrl.setAgnObserverFrameMode(Boolean(dom.agnObserverFrame?.checked));
});

dom.agnStochastic?.addEventListener('change', () => {
  sunCtrl.setAgnStochasticFlaring(Boolean(dom.agnStochastic?.checked));
});

dom.agnHypothesis?.addEventListener('change', () => {
  const hypothesis = dom.agnHypothesis.value;
  if (hypothesis === 'h29' && dom.bodyInfo) {
    dom.bodyInfo.textContent = sunCtrl.getWarpInfoText?.() || 'H29 Warp Wave Selected';
  } else {
    updateBodyInfoPanel(simState.focusedBodyId || 'sun');
  }
});

// ── Initialize ───────────────────────────────────────────────────────────────

refillBodyList();
model.update(simState.julianDate);
updateSceneBodies();
focusBody('sun', true);
controls.update();
camera.lookAt(controls.target);
updateCameraClipPlanes();
updateBodyInfoPanel('sun');

for (const line of orbitLines) line.visible = Boolean(dom.toggleOrbits?.checked);
for (const entry of labels) entry.sprite.visible = Boolean(dom.toggleLabels?.checked);

sunCtrl.maybeRefreshPhysics(Date.now(), true);
sunCtrl.setAgnObserverFrameMode(Boolean(dom.agnObserverFrame?.checked));

resizeRenderer();
renderer.render(scene, camera);

// ── Animation Loop ───────────────────────────────────────────────────────────

let prevTimestamp = performance.now();

function animate(timestamp) {
  requestAnimationFrame(animate);
  const deltaSeconds = Math.max(0, (timestamp - prevTimestamp) / 1_000);
  prevTimestamp = timestamp;

  timeController.advanceLocalTime(deltaSeconds);
  model.update(simState.julianDate);

  // H29 Metric Kinematics (ADM Shift Vector)
  const warpState = sunCtrl.getWarpState();
  if (warpState && warpState.direction) {
    const peakData = metricFrameDragPeak(warpState.timeSec, warpState.energyErg, warpState.smbhMassG);
    model.applyMetricKinematics(
      warpState.direction,
      deltaSeconds,
      (distCm) => evaluateLocalMetricShift(distCm, peakData),
      warpState.sourceDistanceCm,
      1e12 // visual exaggeration factor so the shift is visible
    );
  }

  updateSceneBodies();
  updateBodyRotations(simState.julianDate);

  syncAsteroidBeltInputs();
  propagateKBOPositions(kuiperPop.kbos, simState.julianDate, kuiperPositions);
  kuiperBeltRenderer.updatePositions(kuiperPositions);

  sunCtrl.update(simState.julianDate, timestamp * 0.001);
  sunCtrl.maybeRefreshPhysics();

  updateFollowTarget();

  backgroundStars.position.copy(camera.position);
  controls.update();
  updateCameraClipPlanes();
  resizeRenderer();
  renderer.render(scene, camera);
  timeController.updateHud();

  if (dom.statusZoom) {
    const dist = camera.position.distanceTo(controls.target);
    dom.statusZoom.textContent = `Range: ${dist < 1 ? (dist * AU_KM).toFixed(0) + ' km' : dist.toFixed(2) + ' AU'}`;
  }
}

requestAnimationFrame(animate);
