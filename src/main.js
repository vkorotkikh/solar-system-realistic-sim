import './style.css';
import {
  AdditiveBlending,
  AmbientLight,
  ArrowHelper,
  BackSide,
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
  Matrix4,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  RepeatWrapping,
  RingGeometry,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TextureLoader,
  Vector3,
  WebGLRenderer
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  AU_KM,
  DEFAULT_TIME_SCALE_DAYS_PER_SEC,
  J2000_JD,
  MIN_TIME_SCALE_DAYS_PER_SEC,
  MAX_TIME_SCALE_DAYS_PER_SEC,
  MU_SUN_AU3_DAY2,
  currentJulianDate,
  formatJulianAsDate,
  parseDateInputToJulian
} from './constants.js';
import { buildTransferCurvePoints, describeRoute, planInterplanetaryRoute } from './planner/trajectoryPlanner.js';
import { createSolarSystemCatalog } from './sim/catalog.js';
import { propagateKeplerOrbit } from './sim/orbitMath.js';
import { SolarSystemModel } from './sim/solarSystemModel.js';
import { generatePlanetTexture } from './textures.js';
import earthDayTextureUrl from './assets/textures/earth_day_4096.jpg';
import earthNormalTextureUrl from './assets/textures/earth_normal_2048.jpg';
import moonDayTextureUrl from './assets/textures/moon_1024.jpg';
import mercuryDayTextureUrl from './assets/textures/mercury_day_2048.jpg';
import venusDayTextureUrl from './assets/textures/venus_day_2048.jpg';
import marsDayTextureUrl from './assets/textures/mars_day_2048.jpg';
import jupiterDayTextureUrl from './assets/textures/jupiter_day_2048.jpg';
import saturnDayTextureUrl from './assets/textures/saturn_day_2048.jpg';
import uranusDayTextureUrl from './assets/textures/uranus_day_2048.jpg';
import neptuneDayTextureUrl from './assets/textures/neptune_day_2048.jpg';
import earthCloudsTextureUrl from './assets/textures/earth_clouds_2048.jpg';
import venusAtmosphereTextureUrl from './assets/textures/venus_atmosphere_2048.jpg';
import milkyWaySurveyTextureUrl from './assets/textures/milky_way_2mass_equirect_4096.jpg';
import starsCatalog from './data/stars_catalog.json';

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
  toggleLocators: document.getElementById('toggle-locators'),
  toggleGravityVectors: document.getElementById('toggle-gravity-vectors'),
  toggleMoons: document.getElementById('toggle-moons'),
  toggleAsteroids: document.getElementById('toggle-asteroids'),
  toggleKuiper: document.getElementById('toggle-kuiper'),
  toggleOort: document.getElementById('toggle-oort'),
  toggleEnhancedMilky: document.getElementById('toggle-enhanced-milky'),
  toggleSurveyMilky: document.getElementById('toggle-survey-milky'),
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
  statusZoom: document.getElementById('status-zoom'),
  statusScale: document.getElementById('status-scale'),
  simBackend: document.getElementById('sim-backend'),
  simConnect: document.getElementById('sim-connect'),
  simStatus: document.getElementById('sim-status'),
  toggleRealisticScale: document.getElementById('toggle-realistic-scale'),
  zoomSensitivity: document.getElementById('zoom-sensitivity'),
  zoomSensitivityValue: document.getElementById('zoom-sensitivity-value'),
  zoomDistanceValue: document.getElementById('zoom-distance-value'),
  viewScaleValue: document.getElementById('view-scale-value')
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
  milkyWayMode: 'standard',
  zoomSensitivity: 1.0,
  serverConnected: false
};

const AU_PER_LIGHT_YEAR = 63_241.077;
const MSUN_KG = 1.98847e30;
const TWO_PI = Math.PI * 2;
const BODY_LOCAL_SPIN_AXIS = new Vector3(0, 1, 0);

function bodyMuAu3Day2(massKg) {
  if (!massKg || !Number.isFinite(massKg) || massKg <= 0) return 0;
  return MU_SUN_AU3_DAY2 * (massKg / MSUN_KG);
}

function normalizeRadians(angle) {
  const wrapped = angle % TWO_PI;
  return wrapped >= 0 ? wrapped : wrapped + TWO_PI;
}

function formatAu(au) {
  if (au >= 1_000) return `${au.toFixed(1)} AU`;
  if (au >= 10) return `${au.toFixed(2)} AU`;
  if (au >= 1) return `${au.toFixed(3)} AU`;
  if (au >= 0.01) return `${au.toFixed(4)} AU`;
  return `${au.toFixed(6)} AU`;
}

function formatDistanceScale(au, realisticMode) {
  const safeAu = Math.max(0, au);
  const ly = safeAu / AU_PER_LIGHT_YEAR;
  const km = safeAu * AU_KM;
  const auText = formatAu(safeAu);

  if (!realisticMode) {
    if (ly >= 0.02) {
      return `${ly.toFixed(3)} ly (${auText})`;
    }
    return auText;
  }

  if (ly >= 0.02) {
    return `${ly.toFixed(3)} ly (${auText})`;
  }
  if (km >= 1_000) {
    const kiloKm = km / 1_000;
    const decimals = kiloKm >= 10_000 ? 0 : kiloKm >= 1_000 ? 1 : 2;
    return `${kiloKm.toFixed(decimals)}k km (${auText})`;
  }
  return `${km.toFixed(0)} km (${auText})`;
}

function updateZoomMetricsUI() {
  const rangeAu = camera.position.distanceTo(controls.target);
  const halfFovRad = (camera.fov * Math.PI) / 360;
  const viewHeightAu = 2 * rangeAu * Math.tan(halfFovRad);
  const viewWidthAu = viewHeightAu * camera.aspect;

  const rangeText = formatDistanceScale(rangeAu, simState.useRealisticScale);
  const widthText = formatDistanceScale(viewWidthAu, simState.useRealisticScale);
  const heightText = formatDistanceScale(viewHeightAu, simState.useRealisticScale);
  const zoomText = `x${simState.zoomSensitivity.toFixed(2)}`;

  if (dom.zoomSensitivityValue) dom.zoomSensitivityValue.textContent = zoomText;
  if (dom.zoomDistanceValue) dom.zoomDistanceValue.textContent = `Range: ${rangeText}`;
  if (dom.viewScaleValue) dom.viewScaleValue.textContent = `View span: ${widthText} x ${heightText}`;
  if (dom.statusZoom) dom.statusZoom.textContent = `Zoom: ${zoomText}`;
  if (dom.statusScale) dom.statusScale.textContent = `Scale: ${widthText} x ${heightText}`;
}

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
controls.zoomSpeed = simState.zoomSensitivity;
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
const bodySpinGroups = new Map();
const orbitLines = [];
const labels = [];
const locatorHalos = [];
const gravityArrowByBodyId = new Map();
const routeGroup = new Group();
scene.add(routeGroup);
const gravityVectorGroup = new Group();
gravityVectorGroup.visible = false;
scene.add(gravityVectorGroup);

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
const textureLoader = new TextureLoader();
const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

function configureLoadedTexture(texture, { isColorMap = true } = {}) {
  texture.anisotropy = maxAnisotropy;
  texture.generateMipmaps = true;
  if (isColorMap) {
    texture.colorSpace = SRGBColorSpace;
  }
}

function loadHiResTexture(url, options = {}) {
  const texture = textureLoader.load(
    url,
    (loaded) => configureLoadedTexture(loaded, options),
    undefined,
    () => {
      // Keep procedural fallback material behavior if a texture fails to load.
    }
  );
  configureLoadedTexture(texture, options);
  return texture;
}

const hiResTextures = {
  earthDay: loadHiResTexture(earthDayTextureUrl),
  earthNormal: loadHiResTexture(earthNormalTextureUrl, { isColorMap: false }),
  earthClouds: loadHiResTexture(earthCloudsTextureUrl),
  moonDay: loadHiResTexture(moonDayTextureUrl),
  mercuryDay: loadHiResTexture(mercuryDayTextureUrl),
  venusDay: loadHiResTexture(venusDayTextureUrl),
  venusAtmosphere: loadHiResTexture(venusAtmosphereTextureUrl),
  marsDay: loadHiResTexture(marsDayTextureUrl),
  jupiterDay: loadHiResTexture(jupiterDayTextureUrl),
  saturnDay: loadHiResTexture(saturnDayTextureUrl),
  uranusDay: loadHiResTexture(uranusDayTextureUrl),
  neptuneDay: loadHiResTexture(neptuneDayTextureUrl),
  milkyWaySurvey: loadHiResTexture(milkyWaySurveyTextureUrl)
};

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
  const isEarthMoon = body.type === 'moon' && body.parentId === 'earth' && body.name === 'Moon';
  const hiResDayMaps = {
    mercury: hiResTextures.mercuryDay,
    venus: hiResTextures.venusDay,
    mars: hiResTextures.marsDay,
    jupiter: hiResTextures.jupiterDay,
    saturn: hiResTextures.saturnDay,
    uranus: hiResTextures.uranusDay,
    neptune: hiResTextures.neptuneDay
  };
  const hiResDay = hiResDayMaps[body.id];
  let material;

  if (body.type === 'star') {
    material = new MeshBasicMaterial({
      map: texture ?? undefined,
      color: texture ? undefined : new Color(body.color)
    });
  } else if (body.id === 'earth') {
    material = new MeshStandardMaterial({
      color: new Color('#ffffff'),
      map: hiResTextures.earthDay,
      normalMap: hiResTextures.earthNormal,
      roughness: 0.84,
      metalness: 0.0
    });
  } else if (hiResDay) {
    material = new MeshStandardMaterial({
      color: new Color('#ffffff'),
      map: hiResDay,
      roughness: body.id === 'jupiter' || body.id === 'saturn' ? 0.78 : 0.88,
      metalness: 0.0
    });
  } else if (isEarthMoon) {
    material = new MeshStandardMaterial({
      color: new Color('#f2f2f2'),
      map: hiResTextures.moonDay,
      roughness: 0.95,
      metalness: 0.0
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
  canvas.width = 768;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Downward locator arrow.
  const cx = canvas.width * 0.5;
  const yBase = canvas.height * 0.78;
  ctx.strokeStyle = 'rgba(255, 188, 82, 0.95)';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, yBase - 38);
  ctx.lineTo(cx, yBase);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 170, 58, 0.95)';
  ctx.beginPath();
  ctx.moveTo(cx - 20, yBase - 4);
  ctx.lineTo(cx + 20, yBase - 4);
  ctx.lineTo(cx, yBase + 24);
  ctx.closePath();
  ctx.fill();

  ctx.shadowColor = 'rgba(0, 0, 0, 0.88)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#ffbe64';
  ctx.font = '700 62px Oxanium, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height * 0.34);
  ctx.shadowBlur = 5;
  ctx.fillStyle = '#ffd79f';
  ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height * 0.34);

  const texture = new CanvasTexture(canvas);
  const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new Sprite(material);
  sprite.scale.set(1.2, 0.32, 1);
  sprite.userData.aspect = canvas.width / canvas.height;
  sprite.renderOrder = 11;
  return sprite;
}

function createLocatorHaloSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');

  const c = canvas.width / 2;
  const outer = 62;
  const inner = 42;
  const gradient = ctx.createRadialGradient(c, c, inner - 16, c, c, outer + 8);
  gradient.addColorStop(0, 'rgba(255, 185, 66, 0.0)');
  gradient.addColorStop(0.55, 'rgba(255, 185, 66, 0.16)');
  gradient.addColorStop(1, 'rgba(255, 185, 66, 0.0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255, 185, 66, 0.92)';
  ctx.beginPath();
  ctx.arc(c, c, inner, 0, Math.PI * 2);
  ctx.stroke();

  const texture = new CanvasTexture(canvas);
  const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new Sprite(material);
  sprite.visible = false;
  sprite.renderOrder = 10;
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

  const spinGroup = new Group();
  const axialTiltDeg = Number.isFinite(body.axialTiltDeg) ? body.axialTiltDeg : 0;
  const axialTiltRad = (axialTiltDeg * Math.PI) / 180;
  // Orbit propagation uses x-y as the ecliptic plane and +z as the plane normal.
  // Build a spin axis that is tilted from +z by the body's obliquity.
  const spinAxisWorld = new Vector3(Math.sin(axialTiltRad), 0, Math.cos(axialTiltRad)).normalize();
  spinGroup.quaternion.setFromUnitVectors(BODY_LOCAL_SPIN_AXIS, spinAxisWorld);
  node.add(spinGroup);
  bodySpinGroups.set(body.id, spinGroup);

  const geometry = body.type === 'star' ? geometryCache.sun : body.type === 'moon' ? geometryCache.moon : geometryCache.planet;
  const material = getMaterial(body);

  const mesh = new Mesh(geometry, material);
  mesh.scale.setScalar(body.displayRadiusAu);
  mesh.userData.bodyId = body.id;
  mesh.userData.rotationPeriodHours = body.rotationPeriodHours ?? null;
  mesh.userData.rotationOffsetRad = ((body.rotationPhaseDeg ?? 0) * Math.PI) / 180;
  mesh.userData.axialTiltDeg = axialTiltDeg;
  spinGroup.add(mesh);

  // Earth cloud layer for depth cues.
  if (body.id === 'earth') {
    const cloudMaterial = new MeshStandardMaterial({
      map: hiResTextures.earthClouds,
      transparent: true,
      opacity: 0.34,
      roughness: 0.8,
      metalness: 0.0,
      depthWrite: false
    });
    const cloudMesh = new Mesh(geometryCache.planet, cloudMaterial);
    cloudMesh.scale.setScalar(body.displayRadiusAu * 1.01);
    cloudMesh.userData.bodyId = `${body.id}-clouds`;
    cloudMesh.userData.rotationPeriodHours = 22.4;
    cloudMesh.userData.rotationOffsetRad = mesh.userData.rotationOffsetRad;
    spinGroup.add(cloudMesh);
  }

  // Venus upper-atmosphere shell.
  if (body.id === 'venus') {
    const atmosphereMaterial = new MeshStandardMaterial({
      map: hiResTextures.venusAtmosphere,
      transparent: true,
      opacity: 0.2,
      roughness: 0.86,
      metalness: 0.0,
      depthWrite: false
    });
    const atmosphereMesh = new Mesh(geometryCache.planet, atmosphereMaterial);
    atmosphereMesh.scale.setScalar(body.displayRadiusAu * 1.012);
    atmosphereMesh.userData.bodyId = `${body.id}-atmosphere`;
    atmosphereMesh.userData.rotationPeriodHours = -90;
    spinGroup.add(atmosphereMesh);
  }

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
      ring.rotation.x = Math.PI * 0.5;
      spinGroup.add(ring);
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
    ring.rotation.x = Math.PI * 0.5;
    spinGroup.add(ring);
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
    labels.push({ bodyId: body.id, sprite: label });

    const halo = createLocatorHaloSprite();
    node.add(halo);
    locatorHalos.push({ bodyId: body.id, sprite: halo });
  }

  if (body.massKg && body.massKg > 0 && majorNodeIds.has(body.id)) {
    const arrow = new ArrowHelper(new Vector3(0, 1, 0), new Vector3(0, 0, 0), 0.15, new Color('#77d0ff'));
    arrow.visible = false;
    gravityVectorGroup.add(arrow);
    gravityArrowByBodyId.set(body.id, arrow);
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

function bvToRgbUnit(bvValue) {
  const bv = Math.min(2.2, Math.max(-0.4, Number.isFinite(bvValue) ? bvValue : 0.65));
  let t;
  if (bv < 0.0) t = (bv + 0.4) / 0.4;
  else if (bv < 0.4) t = bv / 0.4;
  else if (bv < 1.5) t = (bv - 0.4) / 1.1;
  else t = (bv - 1.5) / 0.7;

  if (bv < 0.0) return [0.62 + 0.1 * t, 0.74 + 0.1 * t, 1.0];
  if (bv < 0.4) return [0.72 + 0.23 * t, 0.84 + 0.14 * t, 1.0];
  if (bv < 1.5) return [1.0, 0.98 - 0.3 * t, 0.95 - 0.62 * t];
  return [1.0, 0.68 - 0.2 * t, 0.33 - 0.08 * t];
}

function equatorialDegToCartesian(raDeg, decDeg, radius) {
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  const cosDec = Math.cos(dec);
  return [
    radius * cosDec * Math.cos(ra),
    radius * cosDec * Math.sin(ra),
    radius * Math.sin(dec)
  ];
}

function galacticToCartesian(lRad, bRad, radius) {
  const cosB = Math.cos(bRad);
  const xg = cosB * Math.cos(lRad);
  const yg = cosB * Math.sin(lRad);
  const zg = Math.sin(bRad);

  // Galactic -> Equatorial (J2000) via transpose of standard IAU matrix.
  const x = -0.0548755604 * xg - 0.8734370902 * yg - 0.4838350155 * zg;
  const y = 0.4941094279 * xg - 0.44482963 * yg + 0.7469822445 * zg;
  const z = -0.867666149 * xg - 0.1980763734 * yg + 0.4559837762 * zg;
  return [x * radius, y * radius, z * radius];
}

function wrapRadians(angle) {
  const wrapped = angle % TWO_PI;
  return wrapped >= 0 ? wrapped : wrapped + TWO_PI;
}

function circularDistanceRadians(a, b) {
  const d = Math.abs(a - b) % TWO_PI;
  return Math.min(d, TWO_PI - d);
}

function gaussianByDistance(distance, sigma) {
  if (sigma <= 0) return 0;
  return Math.exp(-(distance * distance) / (2 * sigma * sigma));
}

function sampleGaussian(sigma = 1) {
  const u1 = Math.max(1e-8, Math.random());
  const u2 = Math.max(1e-8, Math.random());
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(TWO_PI * u2) * sigma;
}

function galacticLongitudeWeight(lRad) {
  const bulge = gaussianByDistance(circularDistanceRadians(lRad, 0), 0.33);
  const scutumCentaurus = gaussianByDistance(circularDistanceRadians(lRad, 0.42), 0.27);
  const cygnus = gaussianByDistance(circularDistanceRadians(lRad, 1.45), 0.31);
  const carina = gaussianByDistance(circularDistanceRadians(lRad, 5.05), 0.3);
  const anticenter = gaussianByDistance(circularDistanceRadians(lRad, Math.PI), 0.5);
  const density = 0.18 + bulge * 0.95 + scutumCentaurus * 0.48 + cygnus * 0.44 + carina * 0.4 + anticenter * 0.25;
  return Math.max(0.16, Math.min(1, density));
}

function createStandardMilkyWayLayer(radius) {
  const milkyCount = 34_000;
  const milkyPositions = new Float32Array(milkyCount * 3);
  const milkyColors = new Float32Array(milkyCount * 3);

  for (let i = 0; i < milkyCount; i++) {
    const l = Math.random() * TWO_PI;
    let b = sampleGaussian(0.095);
    b += 0.012 * Math.sin(2.1 * l + 0.4);
    b = Math.max(-0.52, Math.min(0.52, b));

    const r = radius * (0.9 + Math.random() * 0.1);
    const [x, y, z] = galacticToCartesian(l, b, r);
    milkyPositions[i * 3] = x;
    milkyPositions[i * 3 + 1] = y;
    milkyPositions[i * 3 + 2] = z;

    const laneDark = gaussianByDistance(Math.abs(b), 0.034);
    const latFalloff = Math.exp(-Math.abs(b) / 0.25);
    const intensity = (0.28 + 0.72 * Math.random()) * latFalloff * (1 - 0.35 * laneDark);
    milkyColors[i * 3] = intensity * 0.84;
    milkyColors[i * 3 + 1] = intensity * 0.89;
    milkyColors[i * 3 + 2] = intensity * 0.98;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(milkyPositions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(milkyColors, 3));

  const layerGroup = new Group();
  const points = new Points(
    geometry,
    new PointsMaterial({
      size: 0.55,
      vertexColors: true,
      transparent: true,
      opacity: 0.33,
      blending: AdditiveBlending,
      sizeAttenuation: true,
      depthTest: true,
      depthWrite: false
    })
  );
  const haze = new Points(
    geometry,
    new PointsMaterial({
      color: new Color('#cad5e2'),
      size: 1.5,
      transparent: true,
      opacity: 0.045,
      blending: AdditiveBlending,
      sizeAttenuation: true,
      depthTest: true,
      depthWrite: false
    })
  );

  layerGroup.add(points);
  layerGroup.add(haze);
  layerGroup.userData.mode = 'standard';
  return layerGroup;
}

function createEnhancedMilkyWayLayer(radius) {
  const layerGroup = new Group();
  // Enhanced mode: structured model with bulge/arm weighting and dust lanes.
  const milkyCount = 82_000;
  const milkyPositions = new Float32Array(milkyCount * 3);
  const milkyColors = new Float32Array(milkyCount * 3);
  const componentThresholdA = 0.57; // thin disk
  const componentThresholdB = 0.87; // thick disk; remainder is bulge

  for (let i = 0; i < milkyCount; i++) {
    const selector = Math.random();

    let l;
    let b;
    let bulgeMix = 0;

    if (selector > componentThresholdB) {
      // Central bulge concentration around galactic center (l ~= 0).
      l = wrapRadians(sampleGaussian(0.24));
      b = sampleGaussian(0.17);
      bulgeMix = 1;
    } else {
      const latSigma = selector < componentThresholdA ? 0.055 : 0.125;
      let accepted = false;
      l = Math.random() * TWO_PI;
      for (let attempts = 0; attempts < 8; attempts++) {
        l = Math.random() * TWO_PI;
        if (Math.random() <= galacticLongitudeWeight(l)) {
          accepted = true;
          break;
        }
      }
      if (!accepted) {
        l = Math.random() * TWO_PI;
      }

      b = sampleGaussian(latSigma);
    }

    // Galactic warp and flare approximation for a less perfectly flat band.
    b += 0.021 * Math.sin(2.0 * l + 0.45);
    b += 0.009 * Math.sin(5.0 * l - 1.05);
    b = Math.max(-0.62, Math.min(0.62, b));

    const lonWeight = galacticLongitudeWeight(l);
    const bulgeWeight = gaussianByDistance(circularDistanceRadians(l, 0), 0.36);

    // Dark dust lane: strongest close to the plane and near dense longitudes.
    const laneCenter = 0.012 * Math.sin(1.35 * l + 0.6);
    const laneWidth = 0.026 + 0.017 * bulgeWeight;
    const laneAbsorption = gaussianByDistance(Math.abs(b - laneCenter), laneWidth);
    const dustFactor = 1 - 0.62 * laneAbsorption * (0.32 + 0.68 * lonWeight);

    const r = radius * (0.88 + Math.random() * 0.12);
    const [x, y, z] = galacticToCartesian(l, b, r);
    milkyPositions[i * 3] = x;
    milkyPositions[i * 3 + 1] = y;
    milkyPositions[i * 3 + 2] = z;

    const latFalloff = Math.exp(-Math.abs(b) / 0.22);
    const intensity = (0.22 + 0.78 * Math.random()) * (0.35 + 0.65 * lonWeight) * latFalloff * dustFactor;

    // Bulge skews warmer/yellower; outer disk remains cooler.
    const warmMix = Math.min(1, 0.15 + 0.78 * bulgeWeight + 0.4 * bulgeMix);
    const coolMix = 1 - warmMix;
    const rCol = intensity * (0.86 + 0.3 * warmMix);
    const gCol = intensity * (0.88 + 0.16 * warmMix);
    const bCol = intensity * (0.95 - 0.28 * warmMix + 0.12 * coolMix);

    milkyColors[i * 3] = rCol;
    milkyColors[i * 3 + 1] = gCol;
    milkyColors[i * 3 + 2] = bCol;
  }
  const milkyGeometry = new BufferGeometry();
  milkyGeometry.setAttribute('position', new Float32BufferAttribute(milkyPositions, 3));
  milkyGeometry.setAttribute('color', new Float32BufferAttribute(milkyColors, 3));
  const milkyPoints = new Points(
    milkyGeometry,
    new PointsMaterial({
      size: 1.25,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: AdditiveBlending,
      sizeAttenuation: false,
      depthTest: true,
      depthWrite: false
    })
  );
  layerGroup.add(milkyPoints);

  // Soft haze layer to make the galactic band perceptible at a glance.
  const milkyHaze = new Points(
    milkyGeometry,
    new PointsMaterial({
      color: new Color('#cfd8e6'),
      size: 2.9,
      transparent: true,
      opacity: 0.1,
      blending: AdditiveBlending,
      sizeAttenuation: false,
      depthTest: true,
      depthWrite: false
    })
  );
  layerGroup.add(milkyHaze);

  layerGroup.userData.mode = 'enhanced';
  return layerGroup;
}

function createCatalogStarField(radius = 18_000) {
  const baseLayers = [
    { maxMag: 2.0, size: 2.2, opacity: 0.96 },
    { maxMag: 4.2, size: 1.45, opacity: 0.82 },
    { maxMag: Infinity, size: 0.95, opacity: 0.56 }
  ];

  const groupedPositions = baseLayers.map(() => []);
  const groupedColors = baseLayers.map(() => []);

  for (const entry of starsCatalog) {
    const [raDeg, decDeg, mag, bv] = entry;
    if (!Number.isFinite(raDeg) || !Number.isFinite(decDeg) || !Number.isFinite(mag)) continue;

    const layerIndex = baseLayers.findIndex((layer) => mag <= layer.maxMag);
    if (layerIndex < 0) continue;

    const r = radius * (0.92 + Math.random() * 0.08);
    const [x, y, z] = equatorialDegToCartesian(raDeg, decDeg, r);
    const [cr, cg, cb] = bvToRgbUnit(bv);
    groupedPositions[layerIndex].push(x, y, z);
    groupedColors[layerIndex].push(cr, cg, cb);
  }

  const group = new Group();
  const baseLayerPoints = [];
  for (let i = 0; i < baseLayers.length; i++) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(groupedPositions[i], 3));
    geometry.setAttribute('color', new Float32BufferAttribute(groupedColors[i], 3));
    const points = new Points(
      geometry,
      new PointsMaterial({
        size: baseLayers[i].size,
        vertexColors: true,
        transparent: true,
        opacity: baseLayers[i].opacity,
        blending: AdditiveBlending,
        sizeAttenuation: false,
        depthWrite: false
      })
    );
    baseLayerPoints.push(points);
    group.add(points);
  }

  const standardMilky = createStandardMilkyWayLayer(radius);
  const enhancedMilky = createEnhancedMilkyWayLayer(radius);
  enhancedMilky.visible = false;
  group.add(standardMilky);
  group.add(enhancedMilky);

  group.userData.starCount = starsCatalog.length;
  group.userData.baseLayers = baseLayerPoints;
  group.userData.standardMilky = standardMilky;
  group.userData.enhancedMilky = enhancedMilky;
  return group;
}

function createSurveyMilkyWaySphere(radius = 19_000) {
  const texture = hiResTextures.milkyWaySurvey;
  texture.wrapS = RepeatWrapping;
  texture.repeat.x = -1;
  texture.offset.x = 1;
  texture.needsUpdate = true;

  const geometry = new SphereGeometry(radius, 96, 64);
  const material = new MeshBasicMaterial({
    map: texture,
    color: new Color('#ffffff'),
    side: BackSide,
    transparent: true,
    opacity: 0.82
  });

  const sphere = new Mesh(geometry, material);
  // Galactic -> Equatorial (J2000) matrix used by the procedural Milky Way model.
  const galacticToEquatorialMatrix = new Matrix4().set(
    -0.0548755604, -0.8734370902, -0.4838350155, 0,
    0.4941094279, -0.44482963, 0.7469822445, 0,
    -0.867666149, -0.1980763734, 0.4559837762, 0,
    0, 0, 0, 1
  );
  // Sphere UVs encode longitude in local X/Z and latitude in local Y.
  // Convert that texture-local basis into the galactic basis first, then to equatorial.
  const textureLocalToGalacticMatrix = new Matrix4().set(
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, 1, 0, 0,
    0, 0, 0, 1
  );
  const surveyToEquatorialMatrix = new Matrix4().multiplyMatrices(
    galacticToEquatorialMatrix,
    textureLocalToGalacticMatrix
  );
  sphere.setRotationFromMatrix(surveyToEquatorialMatrix);
  sphere.visible = false;
  sphere.renderOrder = -50;
  return sphere;
}

// ── Asteroid Belt (element-driven + adaptive LOD refinement) ──────────────────

const ASTEROID_EPOCH_JD = 2_451_545.0;
const ASTEROID_BASE_COUNT = 12_000;
const ASTEROID_DETAIL_MAX = 50_000;
const ASTEROID_DETAIL_MIN = 4_000;
const ASTEROID_DETAIL_TARGET_MAX = 45_000;
const ASTEROID_GAPS = [
  { center: 2.06, halfWidth: 0.02 },
  { center: 2.50, halfWidth: 0.035 },
  { center: 2.82, halfWidth: 0.025 },
  { center: 2.95, halfWidth: 0.02 },
  { center: 3.28, halfWidth: 0.025 }
];

function isInsideAsteroidGap(radiusAu) {
  for (const gap of ASTEROID_GAPS) {
    if (Math.abs(radiusAu - gap.center) < gap.halfWidth) {
      return true;
    }
  }
  return false;
}

function randomGaussian() {
  const u = Math.max(1e-8, Math.random());
  const v = Math.max(1e-8, Math.random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function createAsteroidOrbitElement({
  minA = 2.1,
  maxA = 3.3,
  centerA = null,
  sigmaA = 0.35,
  enforceGaps = true
} = {}) {
  let a = 0;
  for (let attempts = 0; attempts < 20; attempts++) {
    if (centerA === null) {
      const minSq = minA * minA;
      const maxSq = maxA * maxA;
      a = Math.sqrt(minSq + (maxSq - minSq) * Math.random());
    } else {
      a = Math.max(minA, Math.min(maxA, centerA + randomGaussian() * sigmaA));
    }
    if (!enforceGaps || !isInsideAsteroidGap(a)) {
      break;
    }
  }

  const e = Math.min(0.32, Math.abs(0.07 + randomGaussian() * 0.045));
  const iDeg = Math.min(24, Math.abs(randomGaussian() * 5.2));
  const ascendingNodeDeg = Math.random() * 360;
  const argPeriapsisDeg = Math.random() * 360;
  const meanAnomalyDeg = Math.random() * 360;
  return {
    aAu: a,
    e,
    iDeg,
    ascendingNodeDeg,
    argPeriapsisDeg,
    meanAnomalyDeg,
    periodDays: 2 * Math.PI * Math.sqrt((a * a * a) / MU_SUN_AU3_DAY2)
  };
}

function computeOrbitStateFromElement(element, jd, outPos, outVel = null) {
  const elapsedDays = jd - ASTEROID_EPOCH_JD;
  propagateKeplerOrbit(element, elapsedDays, outPos, outVel);
}

const asteroidBaseElements = new Array(ASTEROID_BASE_COUNT);
const asteroidBaseGeometry = new BufferGeometry();
const asteroidBasePositions = new Float32Array(ASTEROID_BASE_COUNT * 3);
const asteroidBaseColors = new Float32Array(ASTEROID_BASE_COUNT * 3);
const asteroidTmpPos = new Vector3();
const asteroidTmpVel = new Vector3();

for (let i = 0; i < ASTEROID_BASE_COUNT; i++) {
  const element = createAsteroidOrbitElement();
  asteroidBaseElements[i] = element;
  const t = (element.aAu - 2.1) / 1.2;
  const brightness = 0.44 + Math.random() * 0.16;
  if (t < 0.4) {
    asteroidBaseColors[i * 3] = brightness * 1.12;
    asteroidBaseColors[i * 3 + 1] = brightness * 0.98;
    asteroidBaseColors[i * 3 + 2] = brightness * 0.82;
  } else if (t < 0.7) {
    asteroidBaseColors[i * 3] = brightness * 0.98;
    asteroidBaseColors[i * 3 + 1] = brightness * 0.94;
    asteroidBaseColors[i * 3 + 2] = brightness * 0.89;
  } else {
    const darker = brightness * 0.8;
    asteroidBaseColors[i * 3] = darker * 0.9;
    asteroidBaseColors[i * 3 + 1] = darker * 0.9;
    asteroidBaseColors[i * 3 + 2] = darker * 0.94;
  }
}

asteroidBaseGeometry.setAttribute('position', new Float32BufferAttribute(asteroidBasePositions, 3));
asteroidBaseGeometry.setAttribute('color', new Float32BufferAttribute(asteroidBaseColors, 3));

const asteroidBelt = new Points(
  asteroidBaseGeometry,
  new PointsMaterial({
    size: 0.006,
    vertexColors: true,
    transparent: true,
    opacity: 0.68,
    sizeAttenuation: true,
    depthWrite: false
  })
);

const asteroidDetailGeometry = new BufferGeometry();
const asteroidDetailPositions = new Float32Array(ASTEROID_DETAIL_MAX * 3);
const asteroidDetailVelocities = new Float32Array(ASTEROID_DETAIL_MAX * 3);
const asteroidDetailElements = new Array(ASTEROID_DETAIL_MAX);
asteroidDetailGeometry.setAttribute('position', new Float32BufferAttribute(asteroidDetailPositions, 3));

const asteroidDetailPoints = new Points(
  asteroidDetailGeometry,
  new PointsMaterial({
    color: new Color('#d0c5af'),
    size: 0.0016,
    transparent: true,
    opacity: 0.62,
    sizeAttenuation: true,
    depthWrite: false
  })
);
asteroidDetailPoints.visible = false;
asteroidDetailPoints.frustumCulled = false;

let asteroidDetailCount = 0;
const lastAsteroidDetailCenter = new Vector3(Infinity, Infinity, Infinity);

function regenerateAsteroidDetail(target, cameraDist, jd, targetCount) {
  const distFromSun = Math.sqrt(target.x * target.x + target.y * target.y);
  const centerA = Math.max(2.15, Math.min(3.25, distFromSun));
  const sigmaA = Math.max(0.08, Math.min(0.42, cameraDist * 0.12));
  asteroidDetailCount = Math.max(ASTEROID_DETAIL_MIN, Math.min(ASTEROID_DETAIL_MAX, targetCount));

  for (let i = 0; i < asteroidDetailCount; i++) {
    const element = createAsteroidOrbitElement({
      minA: 2.02,
      maxA: 3.45,
      centerA,
      sigmaA,
      enforceGaps: true
    });
    asteroidDetailElements[i] = element;
    computeOrbitStateFromElement(element, jd, asteroidTmpPos, asteroidTmpVel);
    asteroidDetailPositions[i * 3] = asteroidTmpPos.x;
    asteroidDetailPositions[i * 3 + 1] = asteroidTmpPos.y;
    asteroidDetailPositions[i * 3 + 2] = asteroidTmpPos.z;
    asteroidDetailVelocities[i * 3] = asteroidTmpVel.x;
    asteroidDetailVelocities[i * 3 + 1] = asteroidTmpVel.y;
    asteroidDetailVelocities[i * 3 + 2] = asteroidTmpVel.z;
  }

  asteroidDetailGeometry.setDrawRange(0, asteroidDetailCount);
  asteroidDetailGeometry.attributes.position.needsUpdate = true;
  asteroidDetailGeometry.computeBoundingSphere();
  lastAsteroidDetailCenter.copy(target);
}

function updateAsteroidBelt(jd) {
  if (!dom.toggleAsteroids.checked) {
    return;
  }

  for (let i = 0; i < ASTEROID_BASE_COUNT; i++) {
    computeOrbitStateFromElement(asteroidBaseElements[i], jd, asteroidTmpPos);
    asteroidBasePositions[i * 3] = asteroidTmpPos.x;
    asteroidBasePositions[i * 3 + 1] = asteroidTmpPos.y;
    asteroidBasePositions[i * 3 + 2] = asteroidTmpPos.z;
  }

  asteroidBaseGeometry.attributes.position.needsUpdate = true;
  asteroidBaseGeometry.computeBoundingSphere();
}

function integrateAsteroidDetailPerturbations(dtDays) {
  if (!Number.isFinite(dtDays) || Math.abs(dtDays) < 1e-8 || asteroidDetailCount === 0) return;

  const sunPos = new Vector3();
  const jupiterPos = new Vector3();
  const saturnPos = new Vector3();
  bodyNodes.get('sun')?.getWorldPosition(sunPos);
  bodyNodes.get('jupiter')?.getWorldPosition(jupiterPos);
  bodyNodes.get('saturn')?.getWorldPosition(saturnPos);

  const muSun = bodyMuAu3Day2(bodyById.get('sun')?.massKg);
  const muJupiter = bodyMuAu3Day2(bodyById.get('jupiter')?.massKg);
  const muSaturn = bodyMuAu3Day2(bodyById.get('saturn')?.massKg);

  const subSteps = Math.max(1, Math.ceil(Math.abs(dtDays) / 0.4));
  const h = dtDays / subSteps;

  for (let step = 0; step < subSteps; step++) {
    for (let i = 0; i < asteroidDetailCount; i++) {
      const i3 = i * 3;
      let px = asteroidDetailPositions[i3];
      let py = asteroidDetailPositions[i3 + 1];
      let pz = asteroidDetailPositions[i3 + 2];
      let vx = asteroidDetailVelocities[i3];
      let vy = asteroidDetailVelocities[i3 + 1];
      let vz = asteroidDetailVelocities[i3 + 2];

      let ax = 0;
      let ay = 0;
      let az = 0;

      const sx = sunPos.x - px;
      const sy = sunPos.y - py;
      const sz = sunPos.z - pz;
      const sr2 = sx * sx + sy * sy + sz * sz + 1e-9;
      const sr = Math.sqrt(sr2);
      const sInvR3 = 1 / (sr2 * sr);
      ax += muSun * sx * sInvR3;
      ay += muSun * sy * sInvR3;
      az += muSun * sz * sInvR3;

      const jx = jupiterPos.x - px;
      const jy = jupiterPos.y - py;
      const jz = jupiterPos.z - pz;
      const jr2 = jx * jx + jy * jy + jz * jz + 1e-8;
      const jr = Math.sqrt(jr2);
      const jInvR3 = 1 / (jr2 * jr);
      ax += muJupiter * jx * jInvR3;
      ay += muJupiter * jy * jInvR3;
      az += muJupiter * jz * jInvR3;

      const tx = saturnPos.x - px;
      const ty = saturnPos.y - py;
      const tz = saturnPos.z - pz;
      const tr2 = tx * tx + ty * ty + tz * tz + 1e-8;
      const tr = Math.sqrt(tr2);
      const tInvR3 = 1 / (tr2 * tr);
      ax += muSaturn * tx * tInvR3;
      ay += muSaturn * ty * tInvR3;
      az += muSaturn * tz * tInvR3;

      vx += ax * h;
      vy += ay * h;
      vz += az * h;
      px += vx * h;
      py += vy * h;
      pz += vz * h;

      asteroidDetailPositions[i3] = px;
      asteroidDetailPositions[i3 + 1] = py;
      asteroidDetailPositions[i3 + 2] = pz;
      asteroidDetailVelocities[i3] = vx;
      asteroidDetailVelocities[i3 + 1] = vy;
      asteroidDetailVelocities[i3 + 2] = vz;
    }
  }
}

function updateAsteroidDetail(jd, deltaSimDays = 0) {
  if (!dom.toggleAsteroids.checked) {
    asteroidDetailPoints.visible = false;
    return;
  }

  const target = controls.target;
  const distFromSun = Math.sqrt(target.x * target.x + target.y * target.y);
  const height = Math.abs(target.z);
  const cameraDist = camera.position.distanceTo(target);
  const inBeltRegion = distFromSun >= 1.8 && distFromSun <= 3.6 && height < 2.2 && cameraDist < 4.2;
  if (!inBeltRegion) {
    asteroidDetailPoints.visible = false;
    return;
  }

  const zoomFactor = Math.max(0, Math.min(1, 1 - cameraDist / 3.8));
  const targetCount = Math.round(ASTEROID_DETAIL_MIN + zoomFactor * (ASTEROID_DETAIL_TARGET_MAX - ASTEROID_DETAIL_MIN));

  const centerMoved = target.distanceTo(lastAsteroidDetailCenter) > cameraDist * 0.1 + 0.08;
  const countDrift = Math.abs(targetCount - asteroidDetailCount) > Math.max(600, asteroidDetailCount * 0.12);
  if (centerMoved || countDrift || asteroidDetailCount === 0) {
    regenerateAsteroidDetail(target, cameraDist, jd, targetCount);
  }

  const refinementActive = cameraDist < 1.2;
  if (refinementActive) {
    integrateAsteroidDetailPerturbations(deltaSimDays);
  } else {
    for (let i = 0; i < asteroidDetailCount; i++) {
      computeOrbitStateFromElement(asteroidDetailElements[i], jd, asteroidTmpPos, asteroidTmpVel);
      asteroidDetailPositions[i * 3] = asteroidTmpPos.x;
      asteroidDetailPositions[i * 3 + 1] = asteroidTmpPos.y;
      asteroidDetailPositions[i * 3 + 2] = asteroidTmpPos.z;
      asteroidDetailVelocities[i * 3] = asteroidTmpVel.x;
      asteroidDetailVelocities[i * 3 + 1] = asteroidTmpVel.y;
      asteroidDetailVelocities[i * 3 + 2] = asteroidTmpVel.z;
    }
  }

  asteroidDetailGeometry.attributes.position.needsUpdate = true;
  asteroidDetailGeometry.computeBoundingSphere();
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

function createOortComponent(count, innerRadius, outerRadius, zScale = 1) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const radius = innerRadius + Math.random() * (outerRadius - innerRadius);
    const theta = Math.random() * Math.PI * 2;
    const u = Math.random() * 2 - 1;
    const phi = Math.acos(u);
    const sinPhi = Math.sin(phi);

    positions[i * 3 + 0] = radius * sinPhi * Math.cos(theta);
    positions[i * 3 + 1] = radius * sinPhi * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi) * zScale;
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geometry;
}

function createOortCloud() {
  const group = new Group();

  // A more realistic approximation: a denser inner Hills cloud + broader outer shell.
  const innerGeometry = createOortComponent(12_000, 2_000, 7_500, 0.7);
  const outerGeometry = createOortComponent(22_000, 7_500, 18_000, 1.0);

  const innerCloud = new Points(
    innerGeometry,
    new PointsMaterial({
      color: new Color('#9eb4c2'),
      size: 0.024,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    })
  );
  const outerCloud = new Points(
    outerGeometry,
    new PointsMaterial({
      color: new Color('#7f96a5'),
      size: 0.02,
      transparent: true,
      opacity: 0.18,
      depthWrite: false
    })
  );

  group.add(outerCloud);
  group.add(innerCloud);
  group.userData.particleCount = 34_000;
  return group;
}

// ── Scene Assembly ───────────────────────────────────────────────────────────

const backgroundStars = createCatalogStarField(18_000);
scene.add(backgroundStars);
const surveyMilkySphere = createSurveyMilkyWaySphere(19_000);
scene.add(surveyMilkySphere);

function applyMilkyWayAppearance() {
  const useSurvey = Boolean(dom.toggleSurveyMilky?.checked);
  const useEnhanced = !useSurvey && Boolean(dom.toggleEnhancedMilky?.checked);
  const mode = useSurvey ? 'survey' : useEnhanced ? 'enhanced' : 'standard';
  simState.milkyWayMode = mode;

  const baseLayers = backgroundStars.userData.baseLayers ?? [];
  const standardMilky = backgroundStars.userData.standardMilky;
  const enhancedMilky = backgroundStars.userData.enhancedMilky;
  for (const layer of baseLayers) {
    layer.visible = mode !== 'survey';
  }
  if (standardMilky) {
    standardMilky.visible = mode === 'standard';
  }
  if (enhancedMilky) {
    enhancedMilky.visible = mode === 'enhanced';
  }
  if (surveyMilkySphere) {
    surveyMilkySphere.visible = mode === 'survey';
  }
}

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
  controls.minDistance = realistic ? 0.000003 : 0.0002;

  for (const body of catalog.bodies) {
    const mesh = bodyMeshes.get(body.id);
    const spinGroup = bodySpinGroups.get(body.id);
    if (!mesh) continue;

    const targetRadius = realistic ? body.realRadiusAu : body.displayRadiusAu;
    mesh.scale.setScalar(targetRadius);

    if (spinGroup) {
      const ringFactor = realistic ? body.realRadiusAu / body.displayRadiusAu : 1.0;
      for (const child of spinGroup.children) {
        if (child === mesh) continue;
        if (child.geometry && child.geometry.type === 'RingGeometry') {
          child.scale.setScalar(ringFactor);
        } else if (child.userData.bodyId === `${body.id}-clouds`) {
          child.scale.setScalar(targetRadius * 1.01);
        } else if (child.userData.bodyId === `${body.id}-atmosphere`) {
          child.scale.setScalar(targetRadius * 1.012);
        }
      }
    }
  }

  if (simState.focusedBodyId) {
    focusBody(simState.focusedBodyId, true);
  }

  updateLocatorOverlays();
  updateZoomMetricsUI();
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
    updateZoomMetricsUI();
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

function worldUnitsPerPixelAt(distanceToCamera) {
  const canvasHeight = Math.max(1, renderer.domElement.clientHeight || window.innerHeight);
  return (2 * distanceToCamera * Math.tan((camera.fov * Math.PI) / 360)) / canvasHeight;
}

function updateLocatorOverlays() {
  const locatorMode = Boolean(dom.toggleLocators?.checked);
  const labelsEnabled = Boolean(dom.toggleLabels?.checked);

  for (const entry of labels) {
    const body = bodyById.get(entry.bodyId);
    const node = bodyNodes.get(entry.bodyId);
    if (!body || !node) continue;

    node.getWorldPosition(tempVecA);
    const distance = Math.max(1e-6, camera.position.distanceTo(tempVecA));
    const unitPerPixel = worldUnitsPerPixelAt(distance);
    const radius = simState.useRealisticScale ? body.realRadiusAu : body.displayRadiusAu;
    const pixelRadius = radius / Math.max(unitPerPixel, 1e-9);

    const forceLocatorInRealistic = locatorMode && simState.useRealisticScale;
    const shouldShowLabel = labelsEnabled || forceLocatorInRealistic;

    const labelHeightPx = shouldShowLabel
      ? (forceLocatorInRealistic ? 28 : 21)
      : 0;
    const labelHeightWorld = labelHeightPx * unitPerPixel;
    const minHeightWorld = radius * (forceLocatorInRealistic ? 1.45 : 1.1);
    const maxHeightWorld = simState.useRealisticScale ? 0.16 : 2.0;
    const clampedHeight = Math.max(minHeightWorld, Math.min(maxHeightWorld, labelHeightWorld));
    const aspect = entry.sprite.userData.aspect ?? 4.0;

    entry.sprite.visible = shouldShowLabel;
    entry.sprite.scale.set(clampedHeight * aspect, clampedHeight, 1);

    const clearancePx = shouldShowLabel ? 16 : 8;
    const yOffset = Math.max(radius * 2.25, unitPerPixel * (clearancePx + pixelRadius * 1.2));
    entry.sprite.position.set(0, yOffset, 0);
  }

  const halosByBodyId = new Map(locatorHalos.map((item) => [item.bodyId, item.sprite]));
  for (const [bodyId, haloSprite] of halosByBodyId.entries()) {
    const body = bodyById.get(bodyId);
    const node = bodyNodes.get(bodyId);
    if (!body || !node) continue;

    node.getWorldPosition(tempVecA);
    const distance = Math.max(1e-6, camera.position.distanceTo(tempVecA));
    const unitPerPixel = worldUnitsPerPixelAt(distance);
    const radius = simState.useRealisticScale ? body.realRadiusAu : body.displayRadiusAu;
    const pixelRadius = radius / Math.max(unitPerPixel, 1e-9);

    const haloVisible = Boolean(dom.toggleLocators?.checked) && pixelRadius < 1.35;
    haloSprite.visible = haloVisible;
    if (haloVisible) {
      const haloWorldSize = Math.max(unitPerPixel * 22, radius * 4.5);
      haloSprite.scale.set(haloWorldSize, haloWorldSize, 1);
      haloSprite.position.set(0, 0, 0);
    }
  }
}

function updateBodyRotations(julianDate) {
  const elapsedSeconds = (julianDate - J2000_JD) * 86_400;
  for (const body of catalog.bodies) {
    const spinGroup = bodySpinGroups.get(body.id);
    if (!spinGroup) continue;

    for (const child of spinGroup.children) {
      const rotationPeriodHours = child.userData.rotationPeriodHours ?? body.rotationPeriodHours;
      if (!Number.isFinite(rotationPeriodHours) || Math.abs(rotationPeriodHours) < 0.01) continue;
      const rotationOffset = Number.isFinite(child.userData.rotationOffsetRad)
        ? child.userData.rotationOffsetRad
        : (((body.rotationPhaseDeg ?? 0) * Math.PI) / 180);
      const angularSpeed = TWO_PI / (rotationPeriodHours * 3_600);
      child.rotation.y = normalizeRadians(rotationOffset + angularSpeed * elapsedSeconds);
    }
  }
}

function updateGravityVectors() {
  const enabled = Boolean(dom.toggleGravityVectors?.checked);
  gravityVectorGroup.visible = enabled;
  if (!enabled) return;

  const massiveBodies = [];
  for (const body of catalog.bodies) {
    if (!body.massKg || body.massKg <= 0 || !majorNodeIds.has(body.id)) continue;
    const node = bodyNodes.get(body.id);
    if (!node) continue;
    node.getWorldPosition(tempVecA);
    massiveBodies.push({
      id: body.id,
      mu: bodyMuAu3Day2(body.massKg),
      pos: tempVecA.clone()
    });
  }

  for (const target of massiveBodies) {
    const arrow = gravityArrowByBodyId.get(target.id);
    if (!arrow) continue;

    let ax = 0;
    let ay = 0;
    let az = 0;
    for (const source of massiveBodies) {
      if (source.id === target.id || source.mu <= 0) continue;
      const dx = source.pos.x - target.pos.x;
      const dy = source.pos.y - target.pos.y;
      const dz = source.pos.z - target.pos.z;
      const r2 = dx * dx + dy * dy + dz * dz + 1e-12;
      const r = Math.sqrt(r2);
      const invR3 = 1 / (r2 * r);
      ax += source.mu * dx * invR3;
      ay += source.mu * dy * invR3;
      az += source.mu * dz * invR3;
    }

    const magnitude = Math.sqrt(ax * ax + ay * ay + az * az);
    if (magnitude < 1e-12) {
      arrow.visible = false;
      continue;
    }

    const renderedRadius = simState.useRealisticScale
      ? (bodyById.get(target.id)?.realRadiusAu ?? 0.0002)
      : (bodyById.get(target.id)?.displayRadiusAu ?? 0.01);
    const baseLength = 0.04 + 0.018 * Math.log10(1 + magnitude * 1e8);
    const length = Math.max(renderedRadius * 1.4, Math.min(0.42, baseLength));
    arrow.position.copy(target.pos);
    arrow.setDirection(new Vector3(ax, ay, az).normalize());
    arrow.setLength(length, Math.max(0.01, length * 0.3), Math.max(0.008, length * 0.2));
    arrow.visible = true;
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

  const shouldShowLabels = Boolean(dom.toggleLabels?.checked) || (Boolean(dom.toggleLocators?.checked) && simState.useRealisticScale);
  for (const entry of labels) {
    entry.sprite.visible = shouldShowLabels;
  }
  for (const entry of locatorHalos) {
    entry.sprite.visible = false;
  }

  asteroidBelt.visible = dom.toggleAsteroids.checked;
  asteroidDetailPoints.visible = dom.toggleAsteroids.checked && asteroidDetailPoints.visible;
  kuiperBelt.visible = dom.toggleKuiper.checked;
  oortCloud.visible = dom.toggleOort.checked;
  gravityVectorGroup.visible = Boolean(dom.toggleGravityVectors?.checked);
  applyMilkyWayAppearance();

  updateLocatorOverlays();
}

// ── Focus & Follow ───────────────────────────────────────────────────────────

function focusBody(bodyId, hardSnap = false) {
  const body = bodyById.get(bodyId);
  const node = bodyNodes.get(bodyId);
  if (!body || !node) return;

  node.getWorldPosition(tempVecA);
  const offset = camera.position.clone().sub(controls.target);
  const renderedRadius = simState.useRealisticScale ? body.realRadiusAu : body.displayRadiusAu;
  const minDistance = simState.useRealisticScale
    ? (body.type === 'moon' ? 0.00001 : 0.00003)
    : (body.type === 'moon' ? 0.002 : 0.01);
  const preferredDistance = body.type === 'star'
    ? (simState.useRealisticScale ? 0.14 : 2.6)
    : Math.max(renderedRadius * (simState.useRealisticScale ? 26 : 18), minDistance);

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

  const body = bodyById.get(simState.followBodyId);
  const node = bodyNodes.get(simState.followBodyId);
  if (!body || !node) return;

  node.getWorldPosition(tempVecA);

  // Preserve the current camera-to-target offset (viewing angle + distance)
  const offset = tempVecB.copy(camera.position).sub(controls.target);

  // Move both target and camera in lockstep so the view stays constant
  controls.target.copy(tempVecA);
  camera.position.copy(tempVecA).add(offset);
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

  if (dom.zoomSensitivity) {
    dom.zoomSensitivity.value = `${simState.zoomSensitivity}`;
    dom.zoomSensitivity.addEventListener('input', () => {
      simState.zoomSensitivity = Number(dom.zoomSensitivity.value);
      if (!Number.isFinite(simState.zoomSensitivity)) {
        simState.zoomSensitivity = 1.0;
      }
      controls.zoomSpeed = simState.zoomSensitivity;
      updateZoomMetricsUI();
    });
  }

  for (const toggle of [
    dom.toggleOrbits,
    dom.toggleLabels,
    dom.toggleLocators,
    dom.toggleGravityVectors,
    dom.toggleMoons,
    dom.toggleAsteroids,
    dom.toggleKuiper,
    dom.toggleOort,
    dom.toggleEnhancedMilky,
    dom.toggleSurveyMilky
  ]) {
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
    updateBodyInfoPanel(id);
    const body = bodyById.get(id);
    if (body) dom.statusFocus.textContent = `Following: ${body.name}`;
  });

  dom.clearFollow.addEventListener('click', () => {
    simState.followBodyId = null;
    const body = bodyById.get(simState.focusedBodyId);
    dom.statusFocus.textContent = `Focus: ${body?.name ?? 'None'}`;
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
      if (simState.focusedBodyId) {
        updateBodyInfoPanel(simState.focusedBodyId);
      }
    });
  }
}

// ── Initialize ───────────────────────────────────────────────────────────────

setupUiEvents();
fillPlannerSelects();
refillBodyList();
model.update(simState.julianDate);
updateSceneBodies();
updateAsteroidBelt(simState.julianDate);
applyRenderVisibility();
updateLocatorOverlays();
updateZoomMetricsUI();

dom.statusBodies.textContent = `Bodies: ${catalog.bodies.length}`;
dom.plannerOutput.textContent = 'No plotted route.';

// ── Animation Loop ───────────────────────────────────────────────────────────

let previousTimestamp = performance.now();

function animate(timestamp) {
  const deltaSeconds = Math.max(0, (timestamp - previousTimestamp) / 1_000);
  previousTimestamp = timestamp;
  const previousJd = simState.julianDate;

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
  const deltaSimDays = simState.julianDate - previousJd;

  updateBodyRotations(simState.julianDate);
  updateAsteroidBelt(simState.julianDate);

  // Dynamic route update — keeps trajectory curves attached to moving planets
  updateRouteVisualization();

  // Asteroid belt LOD with adaptive count and optional local perturbation refinement.
  updateAsteroidDetail(simState.julianDate, deltaSimDays);

  // Kuiper belt LOD — shows detail particles when zoomed into the belt region
  updateKuiperDetail();
  // Keep deep-space layer visibility synchronized with UI toggles.
  oortCloud.visible = Boolean(dom.toggleOort?.checked);

  updateFollowTarget();

  // Keep the selected follow body status synchronized
  if (simState.followBodyId) {
    const followBody = bodyById.get(simState.followBodyId);
    dom.statusFocus.textContent = `Following: ${followBody?.name ?? simState.followBodyId}`;
  }

  // Keep sky layers centered on camera to emulate an effectively infinite backdrop.
  backgroundStars.position.copy(camera.position);
  surveyMilkySphere.position.copy(camera.position);

  controls.update();
  resizeRenderer();
  updateLocatorOverlays();
  updateGravityVectors();
  updateZoomMetricsUI();
  renderer.render(scene, camera);

  dom.timeScaleValue.textContent = simState.timeScaleDaysPerSec.toFixed(1);
  dom.timeDate.textContent = formatJulianAsDate(simState.julianDate);

  requestAnimationFrame(animate);
}

focusBody('sun', true);
updateZoomMetricsUI();
requestAnimationFrame(animate);
