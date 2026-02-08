import './style.css';
import {
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  DEFAULT_TIME_SCALE_DAYS_PER_SEC,
  MIN_TIME_SCALE_DAYS_PER_SEC,
  MAX_TIME_SCALE_DAYS_PER_SEC,
  currentJulianDate,
  formatJulianAsDate,
  parseDateInputToJulian
} from './constants.js';
import { buildTransferCurvePoints, describeRoute, planInterplanetaryRoute } from './planner/trajectoryPlanner.js';
import { createSolarSystemCatalog } from './sim/catalog.js';
import { propagateKeplerOrbit } from './sim/orbitMath.js';
import { SolarSystemModel } from './sim/solarSystemModel.js';

const dom = {
  canvas: document.getElementById('space-canvas'),
  togglePlay: document.getElementById('toggle-play'),
  nowTime: document.getElementById('now-time'),
  timeScale: document.getElementById('time-scale'),
  timeScaleValue: document.getElementById('time-scale-value'),
  timeDate: document.getElementById('time-date'),
  toggleOrbits: document.getElementById('toggle-orbits'),
  toggleLabels: document.getElementById('toggle-labels'),
  toggleMoons: document.getElementById('toggle-moons'),
  toggleKuiper: document.getElementById('toggle-kuiper'),
  toggleOort: document.getElementById('toggle-oort'),
  bodySearch: document.getElementById('body-search'),
  bodyList: document.getElementById('body-list'),
  focusBody: document.getElementById('focus-body'),
  followBody: document.getElementById('follow-body'),
  clearFollow: document.getElementById('clear-follow'),
  bodyInfo: document.getElementById('body-info'),
  plannerFrom: document.getElementById('planner-from'),
  plannerTo: document.getElementById('planner-to'),
  plannerDate: document.getElementById('planner-date'),
  plannerObjective: document.getElementById('planner-objective'),
  plannerAssists: document.getElementById('planner-assists'),
  planDirect: document.getElementById('plan-direct'),
  planOptimal: document.getElementById('plan-optimal'),
  clearRoute: document.getElementById('clear-route'),
  plannerOutput: document.getElementById('planner-output'),
  statusFocus: document.getElementById('status-focus'),
  statusBodies: document.getElementById('status-bodies'),
  statusRoute: document.getElementById('status-route')
};

const catalog = createSolarSystemCatalog();
const model = new SolarSystemModel(catalog);
const bodyById = new Map(catalog.bodies.map((body) => [body.id, body]));

const simState = {
  julianDate: currentJulianDate(),
  timeScaleDaysPerSec: DEFAULT_TIME_SCALE_DAYS_PER_SEC,
  paused: false,
  followBodyId: null,
  focusedBodyId: 'sun',
  route: null
};

const renderer = new WebGLRenderer({
  canvas: dom.canvas,
  antialias: true,
  alpha: false
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new Scene();
scene.background = new Color('#03070c');

const camera = new PerspectiveCamera(58, 1, 0.0001, 20_000);
camera.position.set(0, -10, 6);

const controls = new OrbitControls(camera, dom.canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxDistance = 8_000;
controls.minDistance = 0.0002;
controls.target.set(0, 0, 0);

const ambientLight = new AmbientLight('#3a4a57', 0.4);
scene.add(ambientLight);

const hemisphereLight = new HemisphereLight('#7eb5db', '#21190f', 0.17);
scene.add(hemisphereLight);

const bodyNodes = new Map();
const bodyMeshes = new Map();
const orbitLines = [];
const labels = [];
const routeGroup = new Group();
scene.add(routeGroup);

const majorNodeIds = new Set(
  catalog.bodies.filter((body) => body.isMajor || body.type === 'planet' || body.type === 'dwarf').map((body) => body.id)
);

const geometryCache = {
  sun: new SphereGeometry(1, 48, 32),
  planet: new SphereGeometry(1, 26, 20),
  moon: new SphereGeometry(1, 12, 10)
};

const materialCache = new Map();

function getMaterial(colorHex, isSun = false) {
  const key = `${colorHex}:${isSun ? 'sun' : 'body'}`;
  if (!materialCache.has(key)) {
    if (isSun) {
      materialCache.set(
        key,
        new MeshBasicMaterial({
          color: new Color(colorHex)
        })
      );
    } else {
      materialCache.set(
        key,
        new MeshStandardMaterial({
          color: new Color(colorHex),
          roughness: 0.95,
          metalness: 0.03
        })
      );
    }
  }

  return materialCache.get(key);
}

function createLabelSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(8, 20, 28, 0.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(225, 239, 245, 0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

  ctx.fillStyle = '#e8f6ff';
  ctx.font = '600 48px Rajdhani';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);

  const texture = new CanvasTexture(canvas);
  const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new Sprite(material);
  sprite.scale.set(0.9, 0.23, 1);
  return sprite;
}

function createBodyNode(body) {
  const node = new Group();
  node.name = body.name;

  const geometry = body.type === 'star' ? geometryCache.sun : body.type === 'moon' ? geometryCache.moon : geometryCache.planet;
  const material = getMaterial(body.color, body.type === 'star');

  const mesh = new Mesh(geometry, material);
  mesh.scale.setScalar(body.displayRadiusAu);
  mesh.userData.bodyId = body.id;
  node.add(mesh);

  if (body.id === 'saturn') {
    const inner = body.displayRadiusAu * 1.45;
    const outer = body.displayRadiusAu * 2.35;
    const ring = new Mesh(
      new RingGeometry(inner, outer, 84),
      new MeshBasicMaterial({ color: new Color('#bcab83'), transparent: true, opacity: 0.43, side: 2 })
    );
    ring.rotation.x = Math.PI * 0.36;
    node.add(ring);
  }

  if (majorNodeIds.has(body.id)) {
    const label = createLabelSprite(body.name);
    label.position.set(0, body.displayRadiusAu * 2.5 + 0.03, 0);
    node.add(label);
    labels.push(label);
  }

  bodyNodes.set(body.id, node);
  bodyMeshes.set(body.id, mesh);
  return node;
}

function createOrbitLine(body) {
  if (!body.orbit) {
    return null;
  }

  const segments = body.type === 'moon' ? 64 : 220;
  const points = [];
  const point = new Vector3();

  for (let i = 0; i <= segments; i += 1) {
    const elapsedDays = (i / segments) * body.orbit.periodDays;
    propagateKeplerOrbit(body.orbit, elapsedDays, point);
    points.push(point.clone());
  }

  const geometry = new BufferGeometry().setFromPoints(points);
  const color = body.type === 'moon' ? '#5e7183' : '#7fa2bc';

  const material = new LineBasicMaterial({
    color: new Color(color),
    transparent: true,
    opacity: body.type === 'moon' ? 0.22 : 0.36
  });

  const line = new Line(geometry, material);
  line.userData.bodyType = body.type;

  orbitLines.push(line);
  return line;
}

function mountSceneGraph() {
  for (const body of catalog.bodies) {
    createBodyNode(body);
  }

  for (const body of catalog.bodies) {
    const node = bodyNodes.get(body.id);
    if (!body.parentId) {
      scene.add(node);
    } else {
      const parentNode = bodyNodes.get(body.parentId);
      parentNode.add(node);
    }

    const orbitLine = createOrbitLine(body);
    if (orbitLine) {
      if (body.parentId) {
        bodyNodes.get(body.parentId).add(orbitLine);
      } else {
        scene.add(orbitLine);
      }
    }
  }
}

function createStars(count, radius, color, size) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const r = radius * (0.35 + Math.random() * 0.65);
    const theta = Math.random() * Math.PI * 2;
    const u = Math.random() * 2 - 1;
    const phi = Math.acos(u);

    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

  return new Points(
    geometry,
    new PointsMaterial({
      size,
      color: new Color(color),
      transparent: true,
      opacity: 0.7,
      blending: AdditiveBlending,
      depthWrite: false
    })
  );
}

function createKuiperBelt(count = 7_500) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const radius = 30 + Math.random() * 24;
    const theta = Math.random() * Math.PI * 2;
    const inclination = (Math.random() - 0.5) * 0.35;

    positions[i * 3 + 0] = radius * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.sin(inclination);
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

  return new Points(
    geometry,
    new PointsMaterial({
      color: new Color('#96a8b8'),
      size: 0.018,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    })
  );
}

function createOortCloud(count = 9_000) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const radius = 420 + Math.random() * 2_000;
    const theta = Math.random() * Math.PI * 2;
    const u = Math.random() * 2 - 1;
    const phi = Math.acos(u);

    positions[i * 3 + 0] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

  return new Points(
    geometry,
    new PointsMaterial({
      color: new Color('#7a8f9d'),
      size: 0.022,
      transparent: true,
      opacity: 0.24,
      depthWrite: false
    })
  );
}

const backgroundStars = createStars(8_000, 5_000, '#d5f0ff', 0.95);
scene.add(backgroundStars);

const kuiperBelt = createKuiperBelt();
scene.add(kuiperBelt);

const oortCloud = createOortCloud();
scene.add(oortCloud);

mountSceneGraph();

function resizeRenderer() {
  const width = dom.canvas.clientWidth;
  const height = dom.canvas.clientHeight;

  if (width <= 0 || height <= 0) {
    return;
  }

  if (dom.canvas.width !== width || dom.canvas.height !== height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

window.addEventListener('resize', resizeRenderer);
resizeRenderer();

const tempVecA = new Vector3();
const tempVecB = new Vector3();

function updateSceneBodies() {
  for (const body of catalog.bodies) {
    const state = model.getState(body.id);
    const node = bodyNodes.get(body.id);

    if (!state || !node) continue;

    if (body.parentId) {
      node.position.copy(state.relativePosition);
    } else {
      node.position.copy(state.worldPosition);
    }

    if (body.type === 'moon') {
      node.visible = dom.toggleMoons.checked;
    }
  }
}

function applyRenderVisibility() {
  for (const line of orbitLines) {
    if (!dom.toggleOrbits.checked) {
      line.visible = false;
      continue;
    }

    const isMoonOrbit = line.userData.bodyType === 'moon';
    line.visible = isMoonOrbit ? dom.toggleMoons.checked : true;
  }

  for (const label of labels) {
    label.visible = dom.toggleLabels.checked;
  }

  kuiperBelt.visible = dom.toggleKuiper.checked;
  oortCloud.visible = dom.toggleOort.checked;
}

function focusBody(bodyId, hardSnap = false) {
  const body = bodyById.get(bodyId);
  const node = bodyNodes.get(bodyId);
  if (!body || !node) return;

  node.getWorldPosition(tempVecA);
  const offset = camera.position.clone().sub(controls.target);
  const preferredDistance = Math.max(body.displayRadiusAu * 18, body.type === 'star' ? 2.6 : 0.08);

  if (offset.lengthSq() < 1e-9) {
    offset.set(0, -preferredDistance, preferredDistance * 0.6);
  }

  if (hardSnap) {
    controls.target.copy(tempVecA);
    camera.position.copy(tempVecA).add(offset.setLength(preferredDistance));
  } else {
    controls.target.lerp(tempVecA, 0.25);
    const desiredCamera = tempVecB.copy(tempVecA).add(offset.setLength(preferredDistance));
    camera.position.lerp(desiredCamera, 0.18);
  }

  simState.focusedBodyId = bodyId;
  dom.statusFocus.textContent = `Focus: ${body.name}`;
}

function updateBodyInfoPanel(bodyId) {
  const body = bodyById.get(bodyId);
  if (!body) {
    dom.bodyInfo.textContent = 'No body selected.';
    return;
  }

  const state = model.getState(bodyId);
  const parentName = body.parentId ? bodyById.get(body.parentId)?.name ?? body.parentId : 'None';
  const sunDistance = state?.worldPosition.length() ?? 0;

  dom.bodyInfo.textContent = [
    `Name: ${body.name}`,
    `Type: ${body.type}`,
    `Parent: ${parentName}`,
    `Radius: ${body.radiusKm.toFixed(2)} km`,
    `Distance from Sun: ${sunDistance.toFixed(4)} AU`,
    body.orbit ? `Orbital period: ${body.orbit.periodDays.toFixed(3)} days` : 'Orbital period: N/A'
  ].join('\n');
}

const allBodiesSorted = [...catalog.bodies].sort((a, b) => {
  if (a.type === b.type) return a.name.localeCompare(b.name);
  return a.type.localeCompare(b.type);
});

function labelForBody(body) {
  const tag = body.type === 'dwarf' ? 'dwarf planet' : body.type;
  return `${body.name} [${tag}]`;
}

function refillBodyList(searchValue = '') {
  const needle = searchValue.trim().toLowerCase();
  const filtered = allBodiesSorted.filter((body) => body.name.toLowerCase().includes(needle));

  dom.bodyList.innerHTML = '';
  for (const body of filtered) {
    const option = document.createElement('option');
    option.value = body.id;
    option.textContent = labelForBody(body);
    dom.bodyList.appendChild(option);
  }

  if (filtered.length > 0) {
    dom.bodyList.value = filtered[0].id;
    updateBodyInfoPanel(filtered[0].id);
  } else {
    dom.bodyInfo.textContent = 'No matching body.';
  }
}

function fillPlannerSelects() {
  dom.plannerFrom.innerHTML = '';
  dom.plannerTo.innerHTML = '';

  for (const bodyId of catalog.plannerBodyIds) {
    const body = bodyById.get(bodyId);
    const optionFrom = document.createElement('option');
    const optionTo = document.createElement('option');

    optionFrom.value = bodyId;
    optionTo.value = bodyId;
    optionFrom.textContent = body.name;
    optionTo.textContent = body.name;

    dom.plannerFrom.appendChild(optionFrom);
    dom.plannerTo.appendChild(optionTo);
  }

  dom.plannerFrom.value = 'earth';
  dom.plannerTo.value = 'mars';
  dom.plannerDate.value = formatJulianAsDate(simState.julianDate);
}

function clearRouteVisualization() {
  routeGroup.clear();
  simState.route = null;
  dom.statusRoute.textContent = 'Route: none';
}

function plotRoute(route) {
  routeGroup.clear();

  route.legs.forEach((leg, index) => {
    const points = buildTransferCurvePoints(leg, 90);
    const geometry = new BufferGeometry().setFromPoints(points);
    const material = new LineBasicMaterial({
      color: new Color(index % 2 === 0 ? '#ffcc85' : '#e98c5a'),
      linewidth: 1.5,
      transparent: true,
      opacity: 0.95
    });

    const line = new Line(geometry, material);
    routeGroup.add(line);
  });

  simState.route = route;
  const routeNames = route.bodyRoute.map((bodyId) => bodyById.get(bodyId)?.name ?? bodyId).join(' -> ');
  dom.statusRoute.textContent = `Route: ${routeNames}`;
}

function runPlanner({ directOnly }) {
  const fromId = dom.plannerFrom.value;
  const toId = dom.plannerTo.value;
  const departureJd = parseDateInputToJulian(dom.plannerDate.value) ?? simState.julianDate;

  if (fromId === toId) {
    dom.plannerOutput.textContent = 'Select different departure and destination bodies.';
    return;
  }

  const maxAssists = directOnly ? 0 : Number(dom.plannerAssists.value);
  const objective = directOnly ? 'min_distance' : dom.plannerObjective.value;

  const result = planInterplanetaryRoute(model, bodyById, {
    fromId,
    toId,
    departureJd,
    objective,
    maxAssists
  });

  if (!result.best) {
    dom.plannerOutput.textContent = 'Planner could not find a route with current settings.';
    clearRouteVisualization();
    return;
  }

  plotRoute(result.best);
  dom.plannerOutput.textContent = describeRoute(result.best, bodyById);
}

function updateFollowTarget() {
  if (!simState.followBodyId) {
    return;
  }

  const node = bodyNodes.get(simState.followBodyId);
  if (!node) return;

  node.getWorldPosition(tempVecA);
  controls.target.lerp(tempVecA, 0.25);
}

function setupUiEvents() {
  dom.togglePlay.addEventListener('click', () => {
    simState.paused = !simState.paused;
    dom.togglePlay.textContent = simState.paused ? 'Resume' : 'Pause';
  });

  dom.nowTime.addEventListener('click', () => {
    simState.julianDate = currentJulianDate();
    dom.plannerDate.value = formatJulianAsDate(simState.julianDate);
  });

  dom.timeScale.min = `${MIN_TIME_SCALE_DAYS_PER_SEC}`;
  dom.timeScale.max = `${MAX_TIME_SCALE_DAYS_PER_SEC}`;
  dom.timeScale.value = `${simState.timeScaleDaysPerSec}`;
  dom.timeScale.addEventListener('input', () => {
    simState.timeScaleDaysPerSec = Number(dom.timeScale.value);
  });

  for (const toggle of [dom.toggleOrbits, dom.toggleLabels, dom.toggleMoons, dom.toggleKuiper, dom.toggleOort]) {
    toggle.addEventListener('change', applyRenderVisibility);
  }

  dom.bodySearch.addEventListener('input', () => {
    refillBodyList(dom.bodySearch.value);
  });

  dom.bodyList.addEventListener('change', () => {
    if (!dom.bodyList.value) return;
    updateBodyInfoPanel(dom.bodyList.value);
  });

  dom.focusBody.addEventListener('click', () => {
    const id = dom.bodyList.value;
    if (!id) return;
    focusBody(id, true);
    updateBodyInfoPanel(id);
  });

  dom.followBody.addEventListener('click', () => {
    const id = dom.bodyList.value;
    if (!id) return;
    simState.followBodyId = id;
    focusBody(id, true);
  });

  dom.clearFollow.addEventListener('click', () => {
    simState.followBodyId = null;
  });

  dom.planDirect.addEventListener('click', () => runPlanner({ directOnly: true }));
  dom.planOptimal.addEventListener('click', () => runPlanner({ directOnly: false }));

  dom.clearRoute.addEventListener('click', () => {
    clearRouteVisualization();
    dom.plannerOutput.textContent = 'No plotted route.';
  });
}

setupUiEvents();
fillPlannerSelects();
refillBodyList();
applyRenderVisibility();

dom.statusBodies.textContent = `Bodies: ${catalog.bodies.length}`;
dom.plannerOutput.textContent = 'No plotted route.';

const tmpFollow = new Vector3();
let previousTimestamp = performance.now();

function animate(timestamp) {
  const deltaSeconds = Math.max(0, (timestamp - previousTimestamp) / 1_000);
  previousTimestamp = timestamp;

  if (!simState.paused) {
    simState.julianDate += deltaSeconds * simState.timeScaleDaysPerSec;
  }

  model.update(simState.julianDate);
  updateSceneBodies();

  updateFollowTarget();

  // Keep the selected focus body status synchronized even when not hard-snapping.
  if (simState.followBodyId) {
    const followNode = bodyNodes.get(simState.followBodyId);
    if (followNode) {
      followNode.getWorldPosition(tmpFollow);
      dom.statusFocus.textContent = `Focus: ${bodyById.get(simState.followBodyId)?.name ?? simState.followBodyId}`;
    }
  }

  controls.update();
  resizeRenderer();
  renderer.render(scene, camera);

  dom.timeScaleValue.textContent = simState.timeScaleDaysPerSec.toFixed(1);
  dom.timeDate.textContent = formatJulianAsDate(simState.julianDate);

  requestAnimationFrame(animate);
}

focusBody('sun', true);
requestAnimationFrame(animate);
