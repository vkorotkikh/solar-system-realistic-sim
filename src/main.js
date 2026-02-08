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
  PointLight,
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
import { generatePlanetTexture } from './textures.js';

// ── DOM References ───────────────────────────────────────────────────────────

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
  toggleAsteroids: document.getElementById('toggle-asteroids'),
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
  statusRoute: document.getElementById('status-route'),
  simBackend: document.getElementById('sim-backend'),
  simConnect: document.getElementById('sim-connect'),
  simStatus: document.getElementById('sim-status'),
  toggleRealisticScale: document.getElementById('toggle-realistic-scale')
};

// ── Data & State ─────────────────────────────────────────────────────────────

const catalog = createSolarSystemCatalog();
const model = new SolarSystemModel(catalog);
const bodyById = new Map(catalog.bodies.map((body) => [body.id, body]));

const simState = {
  julianDate: currentJulianDate(),
  timeScaleDaysPerSec: DEFAULT_TIME_SCALE_DAYS_PER_SEC,
  paused: false,
  followBodyId: null,
  focusedBodyId: 'sun',
  route: null,
  backend: 'local',
  useRealisticScale: false,
  serverConnected: false
};

// ── Renderer, Scene, Camera, Controls ────────────────────────────────────────

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

// ── Lighting ─────────────────────────────────────────────────────────────────

// Reduced ambient so directional sun light is visible
const ambientLight = new AmbientLight('#2a3a47', 0.3);
scene.add(ambientLight);

const hemisphereLight = new HemisphereLight('#5a8aab', '#1a0f08', 0.12);
scene.add(hemisphereLight);

// Point light at the Sun for realistic directional lighting
const sunLight = new PointLight('#fff5e0', 1.8, 0, 0);
sunLight.position.set(0, 0, 0);
scene.add(sunLight);

// ── Collections ──────────────────────────────────────────────────────────────

const bodyNodes = new Map();
const bodyMeshes = new Map();
const orbitLines = [];
const labels = [];
const routeGroup = new Group();
scene.add(routeGroup);

const majorNodeIds = new Set(
  catalog.bodies.filter((body) => body.isMajor || body.type === 'planet' || body.type === 'dwarf' || body.type === 'asteroid').map((body) => body.id)
);

// ── Geometry & Material Caches ───────────────────────────────────────────────

const geometryCache = {
  sun: new SphereGeometry(1, 48, 32),
  planet: new SphereGeometry(1, 32, 24),
  moon: new SphereGeometry(1, 12, 10)
};

const materialCache = new Map();

// Generate procedural textures for planets at startup
const planetTextures = new Map();
for (const bodyId of ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']) {
  const canvas = generatePlanetTexture(bodyId);
  if (canvas) {
    planetTextures.set(bodyId, new CanvasTexture(canvas));
  }
}

function getMaterial(body) {
  const cacheKey = body.id;

  if (materialCache.has(cacheKey)) {
    return materialCache.get(cacheKey);
  }

  const texture = planetTextures.get(body.id);
  let material;

  if (body.type === 'star') {
    material = new MeshBasicMaterial({
      map: texture ?? undefined,
      color: texture ? undefined : new Color(body.color)
    });
  } else if (texture) {
    material = new MeshStandardMaterial({
      map: texture,
      roughness: 0.85,
      metalness: 0.05
    });
  } else {
    material = new MeshStandardMaterial({
      color: new Color(body.color),
      roughness: 0.95,
      metalness: 0.03
    });
  }

  materialCache.set(cacheKey, material);
  return material;
}

// ── Label Sprites ────────────────────────────────────────────────────────────

function createLabelSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Transparent background - no fill, no border
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Subtle text shadow for readability against dark space
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  ctx.fillStyle = '#ffffff';
  ctx.font = '600 48px Rajdhani, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Draw text twice for stronger glow
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  ctx.shadowBlur = 4;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new CanvasTexture(canvas);
  const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new Sprite(material);
  sprite.scale.set(0.9, 0.23, 1);
  return sprite;
}

// ── Sun Glow ─────────────────────────────────────────────────────────────────

function createSunGlow(sunDisplayRadius) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(255, 240, 150, 0.45)');
  gradient.addColorStop(0.12, 'rgba(255, 210, 90, 0.22)');
  gradient.addColorStop(0.35, 'rgba(255, 160, 50, 0.08)');
  gradient.addColorStop(0.65, 'rgba(255, 110, 30, 0.02)');
  gradient.addColorStop(1, 'rgba(255, 80, 20, 0.0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new CanvasTexture(canvas);
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: false
  });

  const glow = new Sprite(material);
  glow.scale.setScalar(sunDisplayRadius * 14);
  return glow;
}

// ── Body Nodes ───────────────────────────────────────────────────────────────

function createBodyNode(body) {
  const node = new Group();
  node.name = body.name;

  const geometry = body.type === 'star' ? geometryCache.sun : body.type === 'moon' ? geometryCache.moon : geometryCache.planet;
  const material = getMaterial(body);

  const mesh = new Mesh(geometry, material);
  mesh.scale.setScalar(body.displayRadiusAu);
  mesh.userData.bodyId = body.id;
  node.add(mesh);

  // Saturn ring system with multiple bands and Cassini Division gap
  if (body.id === 'saturn') {
    const ringBands = [
      { innerMul: 1.24, outerMul: 1.52, color: '#a09580', opacity: 0.12 },  // C ring (faint)
      { innerMul: 1.52, outerMul: 1.94, color: '#d4c8a4', opacity: 0.48 },  // B ring (brightest)
      { innerMul: 2.02, outerMul: 2.27, color: '#c8bb95', opacity: 0.36 },  // A ring
      { innerMul: 2.33, outerMul: 2.36, color: '#b5a880', opacity: 0.18 }   // F ring
    ];
    for (const band of ringBands) {
      const inner = body.displayRadiusAu * band.innerMul;
      const outer = body.displayRadiusAu * band.outerMul;
      const ring = new Mesh(
        new RingGeometry(inner, outer, 96),
        new MeshBasicMaterial({ color: new Color(band.color), transparent: true, opacity: band.opacity, side: 2 })
      );
      ring.rotation.x = Math.PI * 0.36;
      node.add(ring);
    }
  }

  // Uranus has faint rings too
  if (body.id === 'uranus') {
    const inner = body.displayRadiusAu * 1.65;
    const outer = body.displayRadiusAu * 1.95;
    const ring = new Mesh(
      new RingGeometry(inner, outer, 64),
      new MeshBasicMaterial({ color: new Color('#7a9aa8'), transparent: true, opacity: 0.08, side: 2 })
    );
    ring.rotation.x = Math.PI * 0.48;
    node.add(ring);
  }

  // Sun corona glow
  if (body.type === 'star') {
    const glow = createSunGlow(body.displayRadiusAu);
    node.add(glow);
  }

  // Labels for major bodies only
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

// ── Orbit Lines ──────────────────────────────────────────────────────────────

function createOrbitLine(body) {
  if (!body.orbit) {
    return null;
  }

  // More segments for very long-period orbits (KBOs) and eccentric orbits
  let segments;
  if (body.type === 'moon') {
    segments = 64;
  } else if (body.orbit.periodDays > 50_000) {
    segments = 400;
  } else {
    segments = 220;
  }

  const points = [];
  const point = new Vector3();

  for (let i = 0; i <= segments; i += 1) {
    const elapsedDays = (i / segments) * body.orbit.periodDays;
    propagateKeplerOrbit(body.orbit, elapsedDays, point);
    points.push(point.clone());
  }

  const geometry = new BufferGeometry().setFromPoints(points);
  const color = body.type === 'moon' ? '#5e7183' : body.type === 'dwarf' ? '#6e8a7c' : body.type === 'asteroid' ? '#8a7e6e' : '#7fa2bc';

  const material = new LineBasicMaterial({
    color: new Color(color),
    transparent: true,
    opacity: body.type === 'moon' ? 0.22 : body.type === 'dwarf' ? 0.28 : body.type === 'asteroid' ? 0.25 : 0.36
  });

  const line = new Line(geometry, material);
  line.userData.bodyType = body.type;

  orbitLines.push(line);
  return line;
}

// ── Scene Graph ──────────────────────────────────────────────────────────────

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

// ── Background Stars ─────────────────────────────────────────────────────────

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

// ── Asteroid Belt (2.1–3.3 AU with Kirkwood gaps) ────────────────────────────

function createAsteroidBelt(count = 12_000) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  // Kirkwood gaps — orbital resonances with Jupiter
  const gaps = [
    { center: 2.06, halfWidth: 0.02 },   // 4:1
    { center: 2.50, halfWidth: 0.035 },   // 3:1 (major gap)
    { center: 2.82, halfWidth: 0.025 },   // 5:2
    { center: 2.95, halfWidth: 0.02 },    // 7:3
    { center: 3.28, halfWidth: 0.025 }    // 2:1
  ];

  function inGap(r) {
    for (const g of gaps) {
      if (Math.abs(r - g.center) < g.halfWidth) return true;
    }
    return false;
  }

  let idx = 0;
  while (idx < count) {
    // Uniform in area ∝ r, so sample r with sqrt bias for uniform surface density
    const r = 2.1 + Math.random() * 1.2;

    // Reject particles inside Kirkwood gaps
    if (inGap(r)) continue;

    const theta = Math.random() * Math.PI * 2;
    // Inclination: Rayleigh-distributed, most < 15°
    const inc = (Math.random() - 0.5) * 0.26 * (1 + Math.random());
    // Small eccentricity scatter in position
    const eccScatter = 1 + (Math.random() - 0.5) * 0.15;
    const rScattered = r * eccScatter;

    positions[idx * 3] = rScattered * Math.cos(theta);
    positions[idx * 3 + 1] = rScattered * Math.sin(theta);
    positions[idx * 3 + 2] = r * Math.sin(inc);

    // Color: inner belt S-type (brighter, slight red-brown) vs outer belt C-type (darker, gray)
    const t = (r - 2.1) / 1.2;   // 0 = inner, 1 = outer
    const bBase = 0.45 + Math.random() * 0.15;
    if (t < 0.4) {
      // S-type: brighter, warm gray
      colors[idx * 3] = bBase * 1.1;
      colors[idx * 3 + 1] = bBase * 0.95;
      colors[idx * 3 + 2] = bBase * 0.8;
    } else if (t < 0.7) {
      // Mixed
      colors[idx * 3] = bBase * 0.95;
      colors[idx * 3 + 1] = bBase * 0.92;
      colors[idx * 3 + 2] = bBase * 0.88;
    } else {
      // C-type: darker, neutral gray
      const bDark = bBase * 0.8;
      colors[idx * 3] = bDark * 0.9;
      colors[idx * 3 + 1] = bDark * 0.9;
      colors[idx * 3 + 2] = bDark * 0.92;
    }

    idx++;
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));

  return new Points(
    geometry,
    new PointsMaterial({
      size: 0.006,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      sizeAttenuation: true,
      depthWrite: false
    })
  );
}

// ── Asteroid Belt LOD Detail Layer ───────────────────────────────────────────

const ASTEROID_DETAIL_COUNT = 20_000;
const asteroidDetailGeometry = new BufferGeometry();
const asteroidDetailPositions = new Float32Array(ASTEROID_DETAIL_COUNT * 3);
asteroidDetailGeometry.setAttribute('position', new Float32BufferAttribute(asteroidDetailPositions, 3));

const asteroidDetailPoints = new Points(
  asteroidDetailGeometry,
  new PointsMaterial({
    color: new Color('#c0b8a8'),
    size: 0.0015,
    transparent: true,
    opacity: 0.55,
    sizeAttenuation: true,
    depthWrite: false
  })
);
asteroidDetailPoints.visible = false;
asteroidDetailPoints.frustumCulled = false;

const lastAsteroidDetailCenter = new Vector3(Infinity, Infinity, Infinity);

function updateAsteroidDetail() {
  if (!dom.toggleAsteroids.checked) {
    asteroidDetailPoints.visible = false;
    return;
  }

  const target = controls.target;
  const distFromSun = Math.sqrt(target.x * target.x + target.y * target.y);
  const height = Math.abs(target.z);
  const cameraDist = camera.position.distanceTo(target);

  // Only show detail when zoomed into the asteroid belt region
  const inBeltRegion = distFromSun >= 1.8 && distFromSun <= 3.6 && height < 2 && cameraDist < 3;

  if (!inBeltRegion) {
    asteroidDetailPoints.visible = false;
    return;
  }

  // Regenerate particles when view center moves significantly
  if (target.distanceTo(lastAsteroidDetailCenter) > cameraDist * 0.12 + 0.1) {
    const spread = Math.max(0.3, cameraDist * 0.5);

    for (let i = 0; i < ASTEROID_DETAIL_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const rnd = Math.max(1e-10, Math.random());
      const r = Math.sqrt(-2 * Math.log(rnd)) * spread * 0.25;

      asteroidDetailPositions[i * 3] = target.x + Math.cos(angle) * r;
      asteroidDetailPositions[i * 3 + 1] = target.y + Math.sin(angle) * r;
      asteroidDetailPositions[i * 3 + 2] = target.z + (Math.random() - 0.5) * spread * 0.08;
    }

    asteroidDetailGeometry.attributes.position.needsUpdate = true;
    asteroidDetailGeometry.computeBoundingSphere();
    lastAsteroidDetailCenter.copy(target);
  }

  // Slow orbital rotation (faster than Kuiper belt — inner solar system)
  asteroidDetailPoints.rotation.z += 0.00015;
  asteroidDetailPoints.visible = true;
}

// ── Kuiper Belt (enhanced with realistic distribution) ───────────────────────

function createKuiperBelt(count = 15_000) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  let idx = 0;

  // Classical Kuiper Belt (42–47.5 AU, low inclination) — ~55%
  const classicalEnd = Math.floor(count * 0.55);
  for (; idx < classicalEnd; idx++) {
    const r = 42 + Math.random() * 5.5;
    const theta = Math.random() * Math.PI * 2;
    const inc = (Math.random() - 0.5) * 0.18;
    positions[idx * 3] = r * Math.cos(theta);
    positions[idx * 3 + 1] = r * Math.sin(theta);
    positions[idx * 3 + 2] = r * Math.sin(inc);
    const b = 0.55 + Math.random() * 0.2;
    colors[idx * 3] = b * 0.85;
    colors[idx * 3 + 1] = b * 0.9;
    colors[idx * 3 + 2] = b;
  }

  // Plutinos — 3:2 resonance with Neptune (~39.4 AU) — ~15%
  const plutinoEnd = Math.floor(count * 0.7);
  for (; idx < plutinoEnd; idx++) {
    const r = 39 + (Math.random() - 0.5) * 1.5;
    const theta = Math.random() * Math.PI * 2;
    const inc = (Math.random() - 0.5) * 0.35;
    positions[idx * 3] = r * Math.cos(theta);
    positions[idx * 3 + 1] = r * Math.sin(theta);
    positions[idx * 3 + 2] = r * Math.sin(inc);
    const b = 0.5 + Math.random() * 0.2;
    colors[idx * 3] = b * 0.9;
    colors[idx * 3 + 1] = b * 0.85;
    colors[idx * 3 + 2] = b * 0.8;
  }

  // 2:1 resonance (~47.7 AU) — ~10%
  const resonanceEnd = Math.floor(count * 0.8);
  for (; idx < resonanceEnd; idx++) {
    const r = 47 + Math.random() * 1.5;
    const theta = Math.random() * Math.PI * 2;
    const inc = (Math.random() - 0.5) * 0.22;
    positions[idx * 3] = r * Math.cos(theta);
    positions[idx * 3 + 1] = r * Math.sin(theta);
    positions[idx * 3 + 2] = r * Math.sin(inc);
    const b = 0.5 + Math.random() * 0.15;
    colors[idx * 3] = b * 0.8;
    colors[idx * 3 + 1] = b * 0.85;
    colors[idx * 3 + 2] = b;
  }

  // Scattered disk (30–100 AU, higher eccentricity / inclination) — remaining ~20%
  for (; idx < count; idx++) {
    const r = 30 + Math.pow(Math.random(), 1.5) * 70;
    const theta = Math.random() * Math.PI * 2;
    const inc = (Math.random() - 0.5) * 0.7;
    positions[idx * 3] = r * Math.cos(theta);
    positions[idx * 3 + 1] = r * Math.sin(theta);
    positions[idx * 3 + 2] = r * Math.sin(inc);
    const b = 0.4 + Math.random() * 0.2;
    colors[idx * 3] = b * 0.85;
    colors[idx * 3 + 1] = b * 0.88;
    colors[idx * 3 + 2] = b * 0.95;
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));

  return new Points(
    geometry,
    new PointsMaterial({
      size: 0.015,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
      depthWrite: false
    })
  );
}

// ── Kuiper Belt LOD Detail Layer ─────────────────────────────────────────────

const KUIPER_DETAIL_COUNT = 25_000;
const kuiperDetailGeometry = new BufferGeometry();
const kuiperDetailPositions = new Float32Array(KUIPER_DETAIL_COUNT * 3);
kuiperDetailGeometry.setAttribute('position', new Float32BufferAttribute(kuiperDetailPositions, 3));

const kuiperDetailPoints = new Points(
  kuiperDetailGeometry,
  new PointsMaterial({
    color: new Color('#b8c8d8'),
    size: 0.003,
    transparent: true,
    opacity: 0.55,
    sizeAttenuation: true,
    depthWrite: false
  })
);
kuiperDetailPoints.visible = false;
kuiperDetailPoints.frustumCulled = false;

const lastDetailCenter = new Vector3(Infinity, Infinity, Infinity);

function updateKuiperDetail() {
  if (!dom.toggleKuiper.checked) {
    kuiperDetailPoints.visible = false;
    return;
  }

  const target = controls.target;
  const distFromSun = Math.sqrt(target.x * target.x + target.y * target.y);
  const height = Math.abs(target.z);
  const cameraDist = camera.position.distanceTo(target);

  // Only show detail when zoomed into the Kuiper belt region
  const inKuiperRegion = distFromSun >= 28 && distFromSun <= 65 && height < 10 && cameraDist < 18;

  if (!inKuiperRegion) {
    kuiperDetailPoints.visible = false;
    return;
  }

  // Regenerate particles when view center moves significantly
  if (target.distanceTo(lastDetailCenter) > cameraDist * 0.15 + 0.3) {
    const spread = Math.max(0.8, cameraDist * 0.7);

    for (let i = 0; i < KUIPER_DETAIL_COUNT; i++) {
      // Gaussian-like distribution around camera target
      const angle = Math.random() * Math.PI * 2;
      const rnd = Math.max(1e-10, Math.random());
      const r = Math.sqrt(-2 * Math.log(rnd)) * spread * 0.35;

      kuiperDetailPositions[i * 3] = target.x + Math.cos(angle) * r;
      kuiperDetailPositions[i * 3 + 1] = target.y + Math.sin(angle) * r;
      kuiperDetailPositions[i * 3 + 2] = target.z + (Math.random() - 0.5) * spread * 0.06;
    }

    kuiperDetailGeometry.attributes.position.needsUpdate = true;
    kuiperDetailGeometry.computeBoundingSphere();
    lastDetailCenter.copy(target);
  }

  // Slow orbital rotation for visual realism
  kuiperDetailPoints.rotation.z += 0.00004;
  kuiperDetailPoints.visible = true;
}

// ── Oort Cloud ───────────────────────────────────────────────────────────────

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

// ── Scene Assembly ───────────────────────────────────────────────────────────

const backgroundStars = createStars(8_000, 5_000, '#d5f0ff', 0.95);
scene.add(backgroundStars);

const asteroidBelt = createAsteroidBelt();
scene.add(asteroidBelt);

scene.add(asteroidDetailPoints);

const kuiperBelt = createKuiperBelt();
scene.add(kuiperBelt);

scene.add(kuiperDetailPoints);

const oortCloud = createOortCloud();
scene.add(oortCloud);

mountSceneGraph();

// ── WebSocket Simulation Client ──────────────────────────────────────────

class SimulationClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.latestState = null;
    this.latestKuiper = null;
    this.kuiperActive = false;
    this.onConnected = null;
    this.onDisconnected = null;
  }

  connect(backend = 'rebound', port = 8042) {
    if (this.ws) this.disconnect();
    const integrator = backend === 'rebound' ? 'ias15' : 'whfast';
    this.ws = new WebSocket(`ws://localhost:${port}/ws/sim?engine=${backend}&integrator=${integrator}`);

    this.ws.onopen = () => {
      this.connected = true;
      if (this.onConnected) this.onConnected();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'state_update') {
          this.latestState = msg;
          if (msg.kuiper) {
            this.latestKuiper = msg.kuiper;
          }
        } else if (msg.type === 'connected') {
          this.send({ type: 'set_time_scale', days_per_sec: simState.timeScaleDaysPerSec });
          if (simState.paused) this.send({ type: 'pause' });
        }
      } catch { /* ignore parse errors */ }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.latestState = null;
      if (this.onDisconnected) this.onDisconnected();
    };

    this.ws.onerror = () => {
      this.connected = false;
      if (this.onDisconnected) this.onDisconnected();
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.latestState = null;
    this.latestKuiper = null;
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  activateKuiper(center, spread) {
    if (!this.kuiperActive) {
      this.send({ type: 'activate_kuiper', center: [center.x, center.y, center.z], spread });
      this.kuiperActive = true;
    }
  }

  deactivateKuiper() {
    if (this.kuiperActive) {
      this.send({ type: 'deactivate_kuiper' });
      this.kuiperActive = false;
      this.latestKuiper = null;
    }
  }
}

const simClient = new SimulationClient();

simClient.onConnected = () => {
  simState.serverConnected = true;
  dom.simStatus.textContent = 'Connected';
  dom.simConnect.textContent = 'Disconnect';
};

simClient.onDisconnected = () => {
  simState.serverConnected = false;
  dom.simStatus.textContent = 'Offline';
  dom.simConnect.textContent = 'Connect';
};

// Server Kuiper belt particles (separate from local detail layer)
const SERVER_KUIPER_MAX = 5_000;
const serverKuiperGeometry = new BufferGeometry();
const serverKuiperPositions = new Float32Array(SERVER_KUIPER_MAX * 3);
serverKuiperGeometry.setAttribute('position', new Float32BufferAttribute(serverKuiperPositions, 3));
const serverKuiperPoints = new Points(
  serverKuiperGeometry,
  new PointsMaterial({
    color: new Color('#e0d8c0'),
    size: 0.005,
    transparent: true,
    opacity: 0.65,
    sizeAttenuation: true,
    depthWrite: false
  })
);
serverKuiperPoints.visible = false;
serverKuiperPoints.frustumCulled = false;
scene.add(serverKuiperPoints);

function applyServerState(state) {
  if (!state || !state.bodies) return;

  simState.julianDate = state.jd;

  for (const body of catalog.bodies) {
    const serverBody = state.bodies[body.id];
    const node = bodyNodes.get(body.id);
    if (!node) continue;

    if (serverBody) {
      // Server provides world coordinates — convert to parent-relative for scene graph
      if (body.parentId) {
        const parentServer = state.bodies[body.parentId];
        if (parentServer) {
          node.position.set(
            serverBody.pos[0] - parentServer.pos[0],
            serverBody.pos[1] - parentServer.pos[1],
            serverBody.pos[2] - parentServer.pos[2]
          );
        }
      } else {
        node.position.set(serverBody.pos[0], serverBody.pos[1], serverBody.pos[2]);
      }
    } else if (body.parentId && body.orbit) {
      // Moons without server data: local Keplerian relative to parent
      const elapsedDays = state.jd - body.orbit.epochJd;
      propagateKeplerOrbit(body.orbit, elapsedDays, node.position);
    }

    if (body.type === 'moon') {
      node.visible = dom.toggleMoons.checked;
    }
  }
}

function applyServerKuiper(particles) {
  if (!particles || particles.length === 0) {
    serverKuiperPoints.visible = false;
    return;
  }

  const count = Math.min(particles.length, SERVER_KUIPER_MAX);
  for (let i = 0; i < count; i++) {
    serverKuiperPositions[i * 3] = particles[i][0];
    serverKuiperPositions[i * 3 + 1] = particles[i][1];
    serverKuiperPositions[i * 3 + 2] = particles[i][2];
  }
  // Zero out unused positions
  for (let i = count * 3; i < SERVER_KUIPER_MAX * 3; i++) {
    serverKuiperPositions[i] = 0;
  }

  serverKuiperGeometry.attributes.position.needsUpdate = true;
  serverKuiperGeometry.setDrawRange(0, count);
  serverKuiperGeometry.computeBoundingSphere();
  serverKuiperPoints.visible = dom.toggleKuiper.checked;
}

// ── Scale Mode ───────────────────────────────────────────────────────────

function applyScaleMode() {
  const realistic = simState.useRealisticScale;

  for (const body of catalog.bodies) {
    const mesh = bodyMeshes.get(body.id);
    if (!mesh) continue;

    const targetRadius = realistic ? body.realRadiusAu : body.displayRadiusAu;
    mesh.scale.setScalar(targetRadius);
  }

  // Rescale Saturn and Uranus ring children proportionally
  for (const bodyId of ['saturn', 'uranus']) {
    const body = bodyById.get(bodyId);
    const node = bodyNodes.get(bodyId);
    if (!body || !node) continue;

    const factor = realistic
      ? body.realRadiusAu / body.displayRadiusAu
      : 1.0;

    for (const child of node.children) {
      if (child.geometry && child.geometry.type === 'RingGeometry') {
        child.scale.setScalar(factor);
      }
    }
  }

  // Adjust labels
  for (const body of catalog.bodies) {
    if (!majorNodeIds.has(body.id)) continue;
    const node = bodyNodes.get(body.id);
    if (!node) continue;

    const radius = realistic ? body.realRadiusAu : body.displayRadiusAu;
    for (const child of node.children) {
      if (child.isSprite && child.material.map) {
        child.position.set(0, radius * 2.5 + (realistic ? 0.0001 : 0.03), 0);
        child.scale.set(
          realistic ? 0.015 : 0.9,
          realistic ? 0.004 : 0.23,
          1
        );
      }
    }
  }
}

// ── Resize ───────────────────────────────────────────────────────────────────

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

// ── Scene Updates ────────────────────────────────────────────────────────────

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

  asteroidBelt.visible = dom.toggleAsteroids.checked;
  kuiperBelt.visible = dom.toggleKuiper.checked;
  oortCloud.visible = dom.toggleOort.checked;
}

// ── Focus & Follow ───────────────────────────────────────────────────────────

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

// ── Body List & Search ───────────────────────────────────────────────────────

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

// ── Planner Selects ──────────────────────────────────────────────────────────

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

// ── Route Visualization (dynamic, updates each frame) ────────────────────────

const ROUTE_SEGMENTS = 90;

function clearRouteVisualization() {
  routeGroup.clear();
  simState.route = null;
  dom.statusRoute.textContent = 'Route: none';
}

function plotRoute(route) {
  routeGroup.clear();

  route.legs.forEach((leg, index) => {
    // Compute initial curve
    const points = buildTransferCurvePoints(leg, ROUTE_SEGMENTS);
    const positions = new Float32Array((ROUTE_SEGMENTS + 1) * 3);

    for (let i = 0; i < points.length; i++) {
      positions[i * 3] = points[i].x;
      positions[i * 3 + 1] = points[i].y;
      positions[i * 3 + 2] = points[i].z;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

    const material = new LineBasicMaterial({
      color: new Color(index % 2 === 0 ? '#ffcc85' : '#e98c5a'),
      linewidth: 1.5,
      transparent: true,
      opacity: 0.95
    });

    const line = new Line(geometry, material);
    line.frustumCulled = false;
    routeGroup.add(line);
  });

  simState.route = route;
  const routeNames = route.bodyRoute.map((bodyId) => bodyById.get(bodyId)?.name ?? bodyId).join(' -> ');
  dom.statusRoute.textContent = `Route: ${routeNames}`;
}

function updateRouteVisualization() {
  if (!simState.route) return;

  const route = simState.route;
  const legs = route.legs;

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const line = routeGroup.children[i];
    if (!line) continue;

    // Get current world positions of departure and arrival bodies
    const fromNode = bodyNodes.get(leg.fromId);
    const toNode = bodyNodes.get(leg.toId);
    if (!fromNode || !toNode) continue;

    fromNode.getWorldPosition(tempVecA);
    toNode.getWorldPosition(tempVecB);

    // Create updated leg data with current positions
    const updatedLeg = {
      startPosition: tempVecA.clone(),
      endPosition: tempVecB.clone()
    };

    // Recompute the Bézier curve with updated endpoints
    const points = buildTransferCurvePoints(updatedLeg, ROUTE_SEGMENTS);

    // Update vertex positions in the buffer
    const posAttr = line.geometry.attributes.position;
    for (let j = 0; j < points.length && j < posAttr.count; j++) {
      posAttr.setXYZ(j, points[j].x, points[j].y, points[j].z);
    }
    posAttr.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  }
}

// ── Planner Execution ────────────────────────────────────────────────────────

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

// ── Follow Target ────────────────────────────────────────────────────────────

function updateFollowTarget() {
  if (!simState.followBodyId) {
    return;
  }

  const node = bodyNodes.get(simState.followBodyId);
  if (!node) return;

  node.getWorldPosition(tempVecA);
  controls.target.lerp(tempVecA, 0.25);
}

// ── UI Event Setup ───────────────────────────────────────────────────────────

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

  for (const toggle of [dom.toggleOrbits, dom.toggleLabels, dom.toggleMoons, dom.toggleAsteroids, dom.toggleKuiper, dom.toggleOort]) {
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

  // ── Simulation backend controls ──────────────────────────────────
  dom.simConnect.addEventListener('click', () => {
    if (simState.serverConnected) {
      simClient.disconnect();
      simState.backend = 'local';
      dom.simStatus.textContent = 'Local';
    } else {
      const backend = dom.simBackend.value;
      if (backend === 'local') {
        dom.simStatus.textContent = 'Local';
        return;
      }
      simState.backend = backend;
      dom.simStatus.textContent = 'Connecting...';
      simClient.connect(backend);
    }
  });

  dom.simBackend.addEventListener('change', () => {
    if (dom.simBackend.value === 'local' && simState.serverConnected) {
      simClient.disconnect();
      simState.backend = 'local';
      dom.simStatus.textContent = 'Local';
    }
  });

  // ── Realistic scale toggle ───────────────────────────────────────
  if (dom.toggleRealisticScale) {
    dom.toggleRealisticScale.addEventListener('change', () => {
      simState.useRealisticScale = dom.toggleRealisticScale.checked;
      applyScaleMode();
    });
  }
}

// ── Initialize ───────────────────────────────────────────────────────────────

setupUiEvents();
fillPlannerSelects();
refillBodyList();
applyRenderVisibility();

dom.statusBodies.textContent = `Bodies: ${catalog.bodies.length}`;
dom.plannerOutput.textContent = 'No plotted route.';

// ── Animation Loop ───────────────────────────────────────────────────────────

const tmpFollow = new Vector3();
let previousTimestamp = performance.now();

function animate(timestamp) {
  const deltaSeconds = Math.max(0, (timestamp - previousTimestamp) / 1_000);
  previousTimestamp = timestamp;

  if (simState.serverConnected && simClient.latestState) {
    // ── Server-driven simulation ─────────────────────────────────
    applyServerState(simClient.latestState);

    // Apply server Kuiper particles if available
    if (simClient.latestKuiper) {
      applyServerKuiper(simClient.latestKuiper);
    }

    // Sync time controls to server
    simClient.send({ type: 'set_time_scale', days_per_sec: simState.timeScaleDaysPerSec });
  } else {
    // ── Local Keplerian simulation ───────────────────────────────
    if (!simState.paused) {
      simState.julianDate += deltaSeconds * simState.timeScaleDaysPerSec;
    }
    model.update(simState.julianDate);
    updateSceneBodies();
  }

  // Dynamic route update — keeps trajectory curves attached to moving planets
  updateRouteVisualization();

  // Asteroid belt LOD — shows detail when zoomed into the main belt
  updateAsteroidDetail();

  // Kuiper belt LOD — shows detail particles when zoomed into the belt region
  updateKuiperDetail();

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
