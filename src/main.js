import './style.css';
import {
  AdditiveBlending,
  ArrowHelper,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Matrix4,
  Points,
  PointsMaterial,
  RepeatWrapping,
  Raycaster,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3
} from 'three';
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
import {
  buildTransferCurvePoints,
  describeRoute,
  planInterplanetaryRoute,
  planMissionProfile,
  scanPorkchopWindow,
  solveLambertTransfer
} from './frontend/features/trajectory/index.js';
import { createSolarSystemCatalog } from './sim/catalog.js';
import { propagateKeplerOrbit } from './sim/orbitMath';
import { SolarSystemModel } from './sim/solarSystemModel';
import { generateMoonTexture, generatePlanetTexture } from './textures.js';
import { PlanetCloudDataPipeline } from './frontend/features/planetary/cloudDataPipeline.js';
import { createPlanetHeightTexture } from './frontend/features/planetary/terrainSynthesis.js';
import { OrbitalSatelliteSystem } from './frontend/features/planetary/satelliteSystem.js';
import { MoonTexturePipeline } from './frontend/features/planetary/moonTexturePipeline.js';
import { planetVisualProfile } from './frontend/features/planetary/visualProfiles.js';
import { SolarPhysicsClient } from './frontend/features/solar/solarPhysicsClient.js';
import {
  createSunSurfaceMaterial,
  createSunGlow,
  createSunCoronaShell,
  createSunEruptionLayer,
  setSunGlowScale as setSunGlowScaleImpl,
  setSunEruptionBaseRadius as setSunEruptionBaseRadiusImpl,
  clearSunCoronalLoops as clearSunCoronalLoopsImpl,
  updateSunCoronalLoopsFromBlendView as updateSunCoronalLoopsFromBlendViewImpl,
  clearSunParkerSpiralLines as clearSunParkerSpiralLinesImpl,
  updateSunParkerSpiralFromPhysicsState as updateSunParkerSpiralFromPhysicsStateImpl,
  updateSunEruptionLayerFromBlendView,
  setSunObservationTexture,
  updateSunMaterialUniforms
} from './frontend/features/solar/sunVisuals.js';
import {
  clampUnit,
  normalizeSolarFeatureSetFromState as normalizeSolarFeatureSetFromStateImpl,
  buildSolarFeatureBlendView as buildSolarFeatureBlendViewImpl,
  materializeSolarFeatureSetFromBlendView as materializeSolarFeatureSetFromBlendViewImpl
} from './frontend/features/solar/solarFeatureBlending.js';
import {
  buildAiaProxyTextureUrl,
  deriveSunObservationControls,
  pickAiaObservationChannel
} from './frontend/features/solar/solarObservationTexture.js';
import { SimulationClient } from './frontend/app/simulationClient';
import { createTimeController } from './frontend/app/timeController.js';
import { createSimulationState, createBodyIdResolver, SYSTEM_VIEW_MODE } from './frontend/app/stateStore.js';
import {
  createRuntimeUiConfig,
  applyViewportSizeOverride,
  createSceneSetup,
  addDefaultLighting,
  createSceneGroups,
  updateRenderResolutionStatus
} from './frontend/app/sceneSetup.js';
import { createTextureManager } from './frontend/app/textureManager.js';
import { createCameraController } from './frontend/app/cameraController.js';
import {
  mountSceneGraph as mountSceneGraphImpl,
  updateSceneBodiesFromModel,
  applyServerStateToScene
} from './frontend/app/bodyManager.js';
import { setupInputHandlers } from './frontend/app/inputHandler.js';
import { createAnimationLoop } from './frontend/app/animationLoop.js';
import {
  clearRouteVisualization as clearRouteVisualizationImpl,
  plotRoute as plotRouteImpl,
  updateRouteVisualization as updateRouteVisualizationImpl
} from './frontend/app/routeRenderer.js';
import { createPlannerController } from './frontend/app/plannerController.js';
import { createLabelSystemOps } from './frontend/app/labelSystem.js';
import { createNearbySystemsRenderer } from './frontend/app/nearbySystemsRenderer.js';
import { createLocalSystemRenderer } from './frontend/app/localSystemRenderer.js';
import earthDayTextureUrl from './assets/textures/earth_day_4096.jpg';
import earthNormalTextureUrl from './assets/textures/earth_normal_2048.jpg';
import earthTopobathyTextureUrl from './assets/textures/earth_topobathy_8192.jpg';
import earthWaterMaskTextureUrl from './assets/textures/earth_watermask_2048.jpg';
import moonDayTextureUrl from './assets/textures/moon_1024.jpg';
import moonAlbedoLrocTextureUrl from './assets/textures/moon_albedo_lroc_8192.jpg';
import moonReliefLolaTextureUrl from './assets/textures/moon_relief_ldem16_5760.png';
import mercuryDayTextureUrl from './assets/textures/mercury_day_2048.jpg';
import venusDayTextureUrl from './assets/textures/venus_day_2048.jpg';
import marsDayTextureUrl from './assets/textures/mars_day_2048.jpg';
import marsAlbedoUsgsTextureUrl from './assets/textures/mars_albedo_usgs_4096.jpg';
import marsReliefMolaTextureUrl from './assets/textures/mars_relief_mola_4096.png';
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
  toggleNearbySystems: document.getElementById('toggle-nearby-systems'),
  toggleEarthSatellites: document.getElementById('toggle-earth-satellites'),
  toggleSatelliteJ2: document.getElementById('toggle-satellite-j2'),
  starSystemList: document.getElementById('star-system-list'),
  bodySearch: document.getElementById('body-search'),
  bodyList: document.getElementById('body-list'),
  focusBody: document.getElementById('focus-body'),
  followBody: document.getElementById('follow-body'),
  clearFollow: document.getElementById('clear-follow'),
  bodyInfo: document.getElementById('body-info'),
  plannerFrom: document.getElementById('planner-from'),
  plannerTo: document.getElementById('planner-to'),
  plannerDate: document.getElementById('planner-date'),
  plannerArrivalDate: document.getElementById('planner-arrival-date'),
  plannerObjective: document.getElementById('planner-objective'),
  plannerAssists: document.getElementById('planner-assists'),
  plannerEphemeris: document.getElementById('planner-ephemeris'),
  plannerPrograde: document.getElementById('planner-prograde'),
  plannerPayloadMass: document.getElementById('planner-payload-mass'),
  planDirect: document.getElementById('plan-direct'),
  planOptimal: document.getElementById('plan-optimal'),
  planLambert: document.getElementById('plan-lambert'),
  planPorkchop: document.getElementById('plan-porkchop'),
  planMission: document.getElementById('plan-mission'),
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
  viewScaleValue: document.getElementById('view-scale-value'),
  focusEarthAtmo: document.getElementById('focus-earth-atmo'),
  focusEarthLeo: document.getElementById('focus-earth-leo'),
  focusEarthGeo: document.getElementById('focus-earth-geo'),
  focusMoonSkim: document.getElementById('focus-moon-skim'),
  focusMoonLlo: document.getElementById('focus-moon-llo'),
  focusMoonNrho: document.getElementById('focus-moon-nrho'),
  focusMarsAtmo: document.getElementById('focus-mars-atmo'),
  focusMarsSkim: document.getElementById('focus-mars-skim'),
  focusMarsLmo: document.getElementById('focus-mars-lmo'),
  focusMarsAreo: document.getElementById('focus-mars-areostationary'),
  returnSolarSystem: document.getElementById('return-solar-system'),
  viewportShell: document.getElementById('viewport-shell'),
  statusRender: document.getElementById('status-render')
};

// ── Data & State ─────────────────────────────────────────────────────────────

const catalog = createSolarSystemCatalog();
const model = new SolarSystemModel(catalog);
const bodyById = new Map(catalog.bodies.map((body) => [body.id, body]));
const {
  CANONICAL_BODY_IDS,
  resolveBodyId,
  isEarthMoonBody
} = createBodyIdResolver(catalog);
const simState = createSimulationState({
  currentJulianDate,
  defaultTimeScaleDaysPerSec: DEFAULT_TIME_SCALE_DAYS_PER_SEC
});

const AU_PER_LIGHT_YEAR = 63_241.077;
const PC_TO_AU = 206_264.80624709636;
const MSUN_KG = 1.98847e30;
const TWO_PI = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;
const DEFAULT_BACKEND_HOST = 'localhost';
const DEFAULT_BACKEND_PORT = 8042;
const SOLAR_SYSTEM_MAX_DISTANCE_AU = 8_000;
const INTERSTELLAR_MAX_DISTANCE_AU = 2_500_000;
const INTERSTELLAR_MARKER_VISIBILITY_MIN_RANGE_AU = 320;
const INTERSTELLAR_LABEL_VISIBILITY_MIN_RANGE_AU = 620;
const INTERSTELLAR_MAX_DISTANCE_LY = 25;
const INTERSTELLAR_LABEL_LIMIT = 25;
const INTERSTELLAR_POSITION_UPDATE_MIN_JD_DELTA = 1 / 365.25;
const INTERSTELLAR_NEARBY_HALO_MAX_DISTANCE_LY = 10;
const INTERSTELLAR_PICK_RADIUS_PX_MIN = 18;
const INTERSTELLAR_PICK_RADIUS_PX_MAX = 66;
const LOCAL_SYSTEM_MAX_DISTANCE_AU = 3_600;
const NEARBY_SYSTEM_NAME_OVERRIDES_BY_SYS_ID = Object.freeze({
  1: 'Alpha Centauri',
  2: "Barnard's Star",
  7: 'Sirius'
});
const LOCAL_SYSTEM_MANIFEST_BY_NEARBY_ID = Object.freeze({
  'nearby-system-1': '/solar-systems/manifests/alpha-centauri.json',
  'nearby-system-2': '/solar-systems/manifests/barnards-star.json',
  'nearby-system-7': '/solar-systems/manifests/sirius.json'
});
const STAR_SYSTEM_STATIC_LABEL_BY_ID = Object.freeze({
  'solar-system': 'Solar System',
  'nearby-system-1': 'Alpha Centauri',
  'nearby-system-2': "Barnard's Star",
  'nearby-system-7': 'Sirius'
});
const STAR_SYSTEM_OPTION_ORDER = Object.freeze([
  'solar-system',
  'nearby-system-1',
  'nearby-system-2',
  'nearby-system-7'
]);
const EXPLORER_BODY_TYPE_ORDER = Object.freeze({
  star: 0,
  planet: 1,
  dwarf: 2,
  moon: 3,
  asteroid: 4
});
const J2000_ECLIPTIC_OBLIQUITY_RAD = 23.439291111 * DEG_TO_RAD;
const COS_J2000_ECLIPTIC_OBLIQUITY = Math.cos(J2000_ECLIPTIC_OBLIQUITY_RAD);
const SIN_J2000_ECLIPTIC_OBLIQUITY = Math.sin(J2000_ECLIPTIC_OBLIQUITY_RAD);
// IAU 1958 galactic frame in J2000/ICRS realization (Hipparcos/ERFA constants).
const GALACTIC_TO_EQUATORIAL_M11 = -0.0548755604;
const GALACTIC_TO_EQUATORIAL_M12 = 0.4941094279;
const GALACTIC_TO_EQUATORIAL_M13 = -0.867666149;
const GALACTIC_TO_EQUATORIAL_M21 = -0.8734370902;
const GALACTIC_TO_EQUATORIAL_M22 = -0.44482963;
const GALACTIC_TO_EQUATORIAL_M23 = -0.1980763734;
const GALACTIC_TO_EQUATORIAL_M31 = -0.4838350155;
const GALACTIC_TO_EQUATORIAL_M32 = 0.7469822445;
const GALACTIC_TO_EQUATORIAL_M33 = 0.4559837762;
const BODY_LOCAL_SPIN_AXIS = new Vector3(0, 1, 0);
const LABEL_POINTER_TIP_OFFSET_NORM = (192 * 0.78 + 24 - 192 * 0.5) / 192;
const nearbySystemConstants = Object.freeze({
  SYSTEM_VIEW_MODE,
  DEG_TO_RAD,
  PC_TO_AU,
  INTERSTELLAR_LABEL_LIMIT,
  INTERSTELLAR_NEARBY_HALO_MAX_DISTANCE_LY,
  INTERSTELLAR_PICK_RADIUS_PX_MIN,
  INTERSTELLAR_PICK_RADIUS_PX_MAX,
  INTERSTELLAR_POSITION_UPDATE_MIN_JD_DELTA,
  INTERSTELLAR_MARKER_VISIBILITY_MIN_RANGE_AU,
  INTERSTELLAR_LABEL_VISIBILITY_MIN_RANGE_AU,
  INTERSTELLAR_MAX_DISTANCE_AU,
  SOLAR_SYSTEM_MAX_DISTANCE_AU,
  INTERSTELLAR_MAX_DISTANCE_LY,
  NEARBY_SYSTEM_NAME_OVERRIDES_BY_SYS_ID,
  LOCAL_SYSTEM_MANIFEST_BY_NEARBY_ID
});
const {
  createLabelSprite,
  createLocatorHaloSprite,
  createInterstellarLabelSprite,
  updateLocatorOverlays: updateLocatorOverlaysImpl
} = createLabelSystemOps({
  pointerTipOffsetNorm: LABEL_POINTER_TIP_OFFSET_NORM
});
const EARTH_VISUAL_PROFILE = planetVisualProfile('earth') ?? {};
const MOON_VISUAL_PROFILE = planetVisualProfile('moon') ?? {};
const MARS_VISUAL_PROFILE = planetVisualProfile('mars') ?? {};
const EARTH_SATELLITE_PROFILE = EARTH_VISUAL_PROFILE.satelliteLayer ?? {};
const MOON_SATELLITE_PROFILE = MOON_VISUAL_PROFILE.satelliteLayer ?? {};
const MARS_SATELLITE_PROFILE = MARS_VISUAL_PROFILE.satelliteLayer ?? {};
const EARTH_ATMOSPHERE_ALTITUDE_KM = EARTH_VISUAL_PROFILE.orbitalPresetsKm?.atmosphere ?? 35;
const EARTH_LEO_ALTITUDE_KM = EARTH_VISUAL_PROFILE.orbitalPresetsKm?.leo ?? 408;
const EARTH_GEO_ALTITUDE_KM = EARTH_VISUAL_PROFILE.orbitalPresetsKm?.geo ?? 35_786;
const MOON_SKIM_ALTITUDE_KM = MOON_VISUAL_PROFILE.orbitalPresetsKm?.skim ?? 15;
const MOON_LLO_ALTITUDE_KM = MOON_VISUAL_PROFILE.orbitalPresetsKm?.llo ?? 100;
const MOON_NRHO_ALTITUDE_KM = MOON_VISUAL_PROFILE.orbitalPresetsKm?.nrho ?? 30_000;
const MARS_ATMOSPHERE_ALTITUDE_KM = MARS_VISUAL_PROFILE.orbitalPresetsKm?.atmosphere ?? 45;
const MARS_SKIM_ALTITUDE_KM = MARS_VISUAL_PROFILE.orbitalPresetsKm?.skim ?? 25;
const MARS_LMO_ALTITUDE_KM = MARS_VISUAL_PROFILE.orbitalPresetsKm?.lmo ?? 400;
const MARS_AREOSTATIONARY_ALTITUDE_KM = MARS_VISUAL_PROFILE.orbitalPresetsKm?.areostationary ?? 17_000;
const ADAPTIVE_ZOOM_PROFILES = Object.freeze({
  earth: {
    minClearanceKm: 0.12,
    dampingBandKm: 7_500,
    minSpeedFactor: 0.06
  },
  [CANONICAL_BODY_IDS.moon]: {
    minClearanceKm: 0.06,
    dampingBandKm: 2_100,
    minSpeedFactor: 0.05
  },
  mars: {
    minClearanceKm: 0.1,
    dampingBandKm: 4_800,
    minSpeedFactor: 0.06
  }
});

function bodyEquatorialRadiusKm(body) {
  if (!body) return 0;
  return Number.isFinite(body.equatorialRadiusKm) ? body.equatorialRadiusKm : body.radiusKm;
}

function bodyPolarRadiusKm(body) {
  if (!body) return 0;
  return Number.isFinite(body.polarRadiusKm) ? body.polarRadiusKm : body.radiusKm;
}

function bodyShapeScale(body) {
  const meanRadiusKm = Math.max(1e-9, body?.radiusKm ?? 1);
  return {
    equatorial: bodyEquatorialRadiusKm(body) / meanRadiusKm,
    polar: bodyPolarRadiusKm(body) / meanRadiusKm
  };
}

function bodyBaseRadiusAu(body, realisticMode = simState.useRealisticScale) {
  return realisticMode ? body.realRadiusAu : body.displayRadiusAu;
}

function bodyRenderScaleAu(body, realisticMode = simState.useRealisticScale, scaleMultiplier = 1) {
  const baseRadius = bodyBaseRadiusAu(body, realisticMode);
  const shape = bodyShapeScale(body);
  const equatorial = baseRadius * shape.equatorial * scaleMultiplier;
  const polar = baseRadius * shape.polar * scaleMultiplier;
  return {
    x: equatorial,
    y: polar,
    z: equatorial
  };
}

function setBodyMeshScale(mesh, body, realisticMode = simState.useRealisticScale, scaleMultiplier = 1) {
  const axisScale = bodyRenderScaleAu(body, realisticMode, scaleMultiplier);
  mesh.scale.set(axisScale.x, axisScale.y, axisScale.z);
}

function bodyRenderRadiusAu(body, realisticMode = simState.useRealisticScale) {
  const axisScale = bodyRenderScaleAu(body, realisticMode, 1);
  return Math.max(axisScale.x, axisScale.y, axisScale.z);
}

function bodyDistanceAuAtAltitude(body, altitudeKm) {
  const safeAltitudeKm = Math.max(0, altitudeKm);
  return (bodyEquatorialRadiusKm(body) + safeAltitudeKm) / AU_KM;
}

function bodyDefaultCameraClearanceKm(body) {
  if (!body) return 1;
  if (body.id === 'earth') return 0.12;
  if (body.id === 'mars') return 0.1;
  if (body.type === 'moon') return body.id === CANONICAL_BODY_IDS.moon ? 0.06 : 0.25;
  if (body.type === 'star') return 25;
  return Math.max(0.35, body.radiusKm * 0.0005);
}

function bodyMinimumCameraDistanceAu(body, clearanceKm = null) {
  const minClearanceKm = Number.isFinite(clearanceKm) ? clearanceKm : bodyDefaultCameraClearanceKm(body);
  return bodyDistanceAuAtAltitude(body, Math.max(0.01, minClearanceKm));
}

function wrapUnitInterval(value) {
  const wrapped = value % 1;
  return wrapped >= 0 ? wrapped : wrapped + 1;
}

const runtimeUiConfig = createRuntimeUiConfig();

function backendBaseUrl() {
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  const host = window.location.hostname || DEFAULT_BACKEND_HOST;
  return `${protocol}://${host}:${DEFAULT_BACKEND_PORT}`;
}

function backendWebSocketUrl({ port = DEFAULT_BACKEND_PORT, params = {} } = {}) {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.hostname || DEFAULT_BACKEND_HOST;
  const query = new URLSearchParams(params).toString();
  return `${protocol}://${host}:${port}/ws/sim${query ? `?${query}` : ''}`;
}

function julianDateToJulianYear(julianDate) {
  return 2000 + (julianDate - J2000_JD) / 365.25;
}

function bodyMuAu3Day2(massKg) {
  if (!massKg || !Number.isFinite(massKg) || massKg <= 0) return 0;
  return MU_SUN_AU3_DAY2 * (massKg / MSUN_KG);
}

function normalizeRadians(angle) {
  const wrapped = angle % TWO_PI;
  return wrapped >= 0 ? wrapped : wrapped + TWO_PI;
}

// ── Renderer, Scene, Camera, Controls ────────────────────────────────────────

const {
  renderer,
  scene,
  camera,
  controls
} = createSceneSetup({
  canvas: dom.canvas,
  runtimeUiConfig,
  initialZoomSensitivity: simState.zoomSensitivity,
  solarSystemMaxDistanceAu: SOLAR_SYSTEM_MAX_DISTANCE_AU
});
applyViewportSizeOverride({
  viewportShell: dom.viewportShell,
  runtimeUiConfig
});
addDefaultLighting(scene);

// ── Collections ──────────────────────────────────────────────────────────────

const bodyNodes = new Map();
const bodyMeshes = new Map();
const bodySpinGroups = new Map();
const orbitLines = [];
const labels = [];
const locatorHalos = [];
const gravityArrowByBodyId = new Map();
const {
  solarSystemGroup,
  routeGroup,
  gravityVectorGroup,
  nearbySystemsGroup,
  localSystemGroup
} = createSceneGroups(scene);

let nearbySystemsPoints = null;
const nearbySystemLabelEntries = [];
const nearbySystemCloseHaloEntries = [];
let nearbySystemHoverHalo = null;
const nearbySystemsById = new Map();
let nearbySystemsCatalog = [];
let nearbySystemsMaxDistanceAu = 0;
let nearbySystemsLoaded = false;
let nearbySystemsLastUpdateJd = Number.NaN;
const nearbySystemsState = {
  get nearbySystemsPoints() {
    return nearbySystemsPoints;
  },
  set nearbySystemsPoints(value) {
    nearbySystemsPoints = value;
  },
  nearbySystemLabelEntries,
  nearbySystemCloseHaloEntries,
  get nearbySystemHoverHalo() {
    return nearbySystemHoverHalo;
  },
  set nearbySystemHoverHalo(value) {
    nearbySystemHoverHalo = value;
  },
  nearbySystemsById,
  get nearbySystemsCatalog() {
    return nearbySystemsCatalog;
  },
  set nearbySystemsCatalog(value) {
    nearbySystemsCatalog = value;
  },
  get nearbySystemsMaxDistanceAu() {
    return nearbySystemsMaxDistanceAu;
  },
  set nearbySystemsMaxDistanceAu(value) {
    nearbySystemsMaxDistanceAu = value;
  },
  get nearbySystemsLoaded() {
    return nearbySystemsLoaded;
  },
  set nearbySystemsLoaded(value) {
    nearbySystemsLoaded = value;
  },
  get nearbySystemsLastUpdateJd() {
    return nearbySystemsLastUpdateJd;
  },
  set nearbySystemsLastUpdateJd(value) {
    nearbySystemsLastUpdateJd = value;
  }
};
const {
  loadNearbySystemsCatalog,
  updateNearbySystemsPositions,
  applyNearbySystemsVisibility,
  pickNearbySystemAtClientPosition,
  updateNearbySystemHoverAtClientPosition,
  setHoveredNearbySystem,
  focusNearbySystem
} = createNearbySystemsRenderer({
  dom,
  camera,
  controls,
  simState,
  state: nearbySystemsState,
  nearbySystemsGroup,
  constants: nearbySystemConstants,
  createInterstellarLabelSprite,
  julianDateToJulianYear,
  equatorialDegToCartesian,
  backendBaseUrl,
  setSystemViewMode,
  refreshStarSystemListOptions
});
const localSystemManifestCache = new Map();
let activeLocalSystem = null;
const localOrbitLines = [];
const localBodyEntries = [];
const localBodyById = new Map();
const localBodyMeshById = new Map();
const localBodyNodeById = new Map();
const localTextureCache = new Map();
let localSystemLoadInFlight = false;
const localSystemState = {
  localSystemManifestCache,
  localTextureCache,
  localOrbitLines,
  localBodyEntries,
  localBodyById,
  localBodyMeshById,
  localBodyNodeById,
  get activeLocalSystem() {
    return activeLocalSystem;
  },
  set activeLocalSystem(value) {
    activeLocalSystem = value;
  }
};
const cameraTransitionState = {
  active: false,
  elapsedSec: 0,
  durationSec: 1.0,
  startTarget: new Vector3(),
  startCamera: new Vector3(),
  endTarget: new Vector3(),
  endCamera: new Vector3(),
  onComplete: null
};
const {
  updateZoomMetricsUI,
  updateAdaptiveZoomBehavior,
  updateCameraClipPlanes
} = createCameraController({
  camera,
  controls,
  dom,
  simState,
  resolveBodyId,
  bodyById,
  bodyNodes,
  adaptiveZoomProfiles: ADAPTIVE_ZOOM_PROFILES,
  bodyDistanceAuAtAltitude,
  distanceConstants: {
    AU_PER_LIGHT_YEAR,
    AU_KM
  },
  systemViewMode: SYSTEM_VIEW_MODE,
  interstellarMarkerVisibilityMinRangeAu: INTERSTELLAR_MARKER_VISIBILITY_MIN_RANGE_AU,
  interstellarMaxDistanceAu: INTERSTELLAR_MAX_DISTANCE_AU,
  getInterstellarState: () => ({
    nearbySystemsLoaded,
    nearbySystemsMaxDistanceAu
  }),
  isCameraTransitionActive: () => cameraTransitionState.active,
  tempVector: new Vector3()
});
const earthOrbitGuides = [];
const moonOrbitGuides = [];
const marsOrbitGuides = [];
let earthSurfaceMesh = null;
let earthCloudMesh = null;
let earthAtmosphereMesh = null;
let earthOceanMesh = null;
let earthCloudDataPipeline = null;
let earthCloudRefreshInFlight = false;
let earthCloudNextRefreshMs = 0;
let earthTerrainDisplacementTexture = null;
let earthLodCurrentLevel = 'low';
let earthSatelliteSystem = null;
let earthCloudLayerMaterial = null;
let earthCloudDetailTexture = null;
let moonSurfaceMesh = null;
let moonExosphereMesh = null;
let moonTerrainDisplacementTexture = null;
let moonLodCurrentLevel = 'low';
let moonSatelliteSystem = null;
let moonSurfaceMaterial = null;
let moonTexturePipeline = null;
let sunSurfaceMaterial = null;
let sunCoronaMaterial = null;
let sunGlowSprite = null;
let sunEruptionLayer = null;
let sunCoronalLoopGroup = null;
let sunParkerSpiralGroup = null;
let solarPhysicsClient = null;
let solarPhysicsState = null;
let solarPhysicsFeatureSetCurrent = null;
let solarPhysicsFeatureSetTarget = null;
let solarPhysicsBlendStartMs = 0;
let solarPhysicsBlendDurationMs = 1_050;
let solarPhysicsRefreshInFlight = false;
let solarPhysicsNextRefreshMs = 0;
let solarObservationTexture = null;
let solarObservationTextureImageId = null;
let solarObservationTextureChannel = null;
let solarObservationTextureLoadInFlight = false;
let solarObservationTextureLastLoadMs = 0;
let marsSurfaceMesh = null;
let marsCloudMesh = null;
let marsAtmosphereMesh = null;
let marsCloudDataPipeline = null;
let marsCloudRefreshInFlight = false;
let marsCloudNextRefreshMs = 0;
let marsTerrainDisplacementTexture = null;
let marsLodCurrentLevel = 'low';
let marsSatelliteSystem = null;
let marsCloudLayerMaterial = null;
let marsCloudDetailTexture = null;
let marsCloudFallbackTexture = null;
let marsPolarNorthMesh = null;
let marsPolarSouthMesh = null;
let marsPolarNorthMaterial = null;
let marsPolarSouthMaterial = null;

const majorNodeIds = new Set(
  catalog.bodies.filter((body) => body.isMajor || body.type === 'planet' || body.type === 'dwarf' || body.type === 'asteroid').map((body) => body.id)
);

// ── Geometry & Material Caches ───────────────────────────────────────────────

const geometryCache = {
  sun: new SphereGeometry(1, 128, 96),
  planet: new SphereGeometry(1, 48, 36),
  moon: new SphereGeometry(1, 12, 10),
  majorMoon: new SphereGeometry(1, 36, 28),
  earthSurfaceLod: (() => {
    const low = EARTH_VISUAL_PROFILE.lod?.geometry?.low ?? [48, 36];
    const medium = EARTH_VISUAL_PROFILE.lod?.geometry?.medium ?? [96, 72];
    const high = EARTH_VISUAL_PROFILE.lod?.geometry?.high ?? [192, 144];
    return {
      low: new SphereGeometry(1, low[0], low[1]),
      medium: new SphereGeometry(1, medium[0], medium[1]),
      high: new SphereGeometry(1, high[0], high[1])
    };
  })(),
  moonSurfaceLod: (() => {
    const low = MOON_VISUAL_PROFILE.lod?.geometry?.low ?? [40, 30];
    const medium = MOON_VISUAL_PROFILE.lod?.geometry?.medium ?? [88, 66];
    const high = MOON_VISUAL_PROFILE.lod?.geometry?.high ?? [172, 132];
    return {
      low: new SphereGeometry(1, low[0], low[1]),
      medium: new SphereGeometry(1, medium[0], medium[1]),
      high: new SphereGeometry(1, high[0], high[1])
    };
  })(),
  marsSurfaceLod: (() => {
    const low = MARS_VISUAL_PROFILE.lod?.geometry?.low ?? [48, 36];
    const medium = MARS_VISUAL_PROFILE.lod?.geometry?.medium ?? [104, 76];
    const high = MARS_VISUAL_PROFILE.lod?.geometry?.high ?? [184, 136];
    return {
      low: new SphereGeometry(1, low[0], low[1]),
      medium: new SphereGeometry(1, medium[0], medium[1]),
      high: new SphereGeometry(1, high[0], high[1])
    };
  })()
};

const materialCache = new Map();
const maxAnisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
const {
  textureLoader,
  solarObservationTextureLoader,
  configureLoadedTexture,
  disposeThreeMaterial,
  loadHiResTexture
} = createTextureManager({
  maxAnisotropy
});

function fract(value) {
  return value - Math.floor(value);
}

function hashNoise2D(x, y) {
  const dot = x * 127.1 + y * 311.7;
  return fract(Math.sin(dot) * 43_758.5453123);
}

function smoothInterpolation(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const tx = smoothInterpolation(x - x0);
  const ty = smoothInterpolation(y - y0);

  const n00 = hashNoise2D(x0, y0);
  const n10 = hashNoise2D(x1, y0);
  const n01 = hashNoise2D(x0, y1);
  const n11 = hashNoise2D(x1, y1);

  const nx0 = n00 + (n10 - n00) * tx;
  const nx1 = n01 + (n11 - n01) * tx;
  return nx0 + (nx1 - nx0) * ty;
}

function fbmNoise2D(x, y, octaves = 5) {
  let frequency = 1;
  let amplitude = 0.5;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise2D(x * frequency, y * frequency) * amplitude;
    norm += amplitude;
    frequency *= 2;
    amplitude *= 0.5;
  }
  return norm > 0 ? sum / norm : 0;
}

function createEarthCloudDetailTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const data = image.data;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const lat = (v - 0.5) * Math.PI;
      const tropicalBoost = Math.max(0, Math.cos(lat * 1.6));
      const polarSuppression = 1 - Math.min(1, Math.abs(lat) / (Math.PI * 0.5));

      const base = fbmNoise2D(u * 7.0 + 11.1, v * 4.6 - 3.7);
      const detail = fbmNoise2D(u * 24.0 - 5.2, v * 18.0 + 2.9, 4);
      const stormBand = fbmNoise2D(u * 2.8 + 0.4, v * 1.3 + 7.2, 3);

      const coverage = Math.max(
        0,
        Math.min(
          1,
          base * 0.64 + detail * 0.36 + stormBand * 0.18 + tropicalBoost * 0.12 + polarSuppression * 0.04 - 0.52
        )
      );
      const alpha = Math.pow(coverage, 1.25);
      const value = Math.round(alpha * 255);
      const index = (y * size + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  configureLoadedTexture(texture);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createMarsDustDetailTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const data = image.data;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const lat = (v - 0.5) * Math.PI;
      const equatorialBoost = Math.pow(Math.max(0, Math.cos(lat)), 0.65);
      const synoptic = fbmNoise2D(u * 4.2 + 2.3, v * 2.2 - 1.1, 4);
      const streaks = fbmNoise2D(u * 28.0 - 1.9, v * 7.8 + 3.4, 3);
      const fronts = fbmNoise2D(u * 1.7 + 0.3, v * 0.9 - 0.2, 4);
      const dust = Math.max(
        0,
        Math.min(1, synoptic * 0.52 + streaks * 0.28 + fronts * 0.35 + equatorialBoost * 0.18 - 0.44)
      );
      const value = Math.round(Math.pow(dust, 1.15) * 255);
      const index = (y * size + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  configureLoadedTexture(texture);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createMarsCloudFallbackTexture(size = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const tint = new Color('#d9a98c');

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const lat = (v - 0.5) * Math.PI;
      const polarFade = 0.35 + 0.65 * Math.pow(Math.max(0.04, Math.cos(lat)), 0.8);
      const primary = fbmNoise2D(u * 3.7 + 4.1, v * 2.1 - 2.0, 5);
      const detail = fbmNoise2D(u * 26.0 - 5.4, v * 8.5 + 1.8, 4);
      const blend = Math.max(0, Math.min(1, primary * 0.74 + detail * 0.26 - 0.23));
      const brightness = Math.max(0.08, Math.min(1, blend * polarFade));
      const alpha = Math.round(brightness * 205);
      const i = (y * size + x) * 4;
      data[i] = Math.round(tint.r * 255 * brightness);
      data[i + 1] = Math.round(tint.g * 255 * brightness);
      data[i + 2] = Math.round(tint.b * 255 * brightness);
      data[i + 3] = alpha;
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  configureLoadedTexture(texture);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createPolarCapMaskTexture(size = 1024, hemisphere = 'north') {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const data = image.data;

  for (let y = 0; y < size; y += 1) {
    const v = y / Math.max(1, size - 1);
    const lat = 90 - v * 180;
    const signedLat = hemisphere === 'north' ? lat : -lat;
    const capStart = 62;
    const capEnd = 88;
    for (let x = 0; x < size; x += 1) {
      let alphaNorm = 0;
      if (signedLat > capStart) {
        const t = Math.min(1, (signedLat - capStart) / Math.max(1e-6, capEnd - capStart));
        const lon = x / Math.max(1, size - 1);
        const edgeNoise = fbmNoise2D(lon * 8.2 + v * 3.3 + 0.7, v * 5.0 - lon * 1.4 - 1.2, 3);
        alphaNorm = Math.max(0, Math.min(1, t * (0.8 + edgeNoise * 0.4)));
      }
      const alpha = Math.round(alphaNorm * 255);
      const idx = (y * size + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = alpha;
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  configureLoadedTexture(texture);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

const hiResTextures = {
  earthDay: loadHiResTexture(earthDayTextureUrl),
  earthNormal: loadHiResTexture(earthNormalTextureUrl, { isColorMap: false }),
  earthTopobathy: loadHiResTexture(earthTopobathyTextureUrl),
  earthWaterMask: loadHiResTexture(earthWaterMaskTextureUrl, { isColorMap: false }),
  earthClouds: loadHiResTexture(earthCloudsTextureUrl),
  moonDay: loadHiResTexture(moonDayTextureUrl),
  moonAlbedoLroc: loadHiResTexture(moonAlbedoLrocTextureUrl),
  moonReliefLola: loadHiResTexture(moonReliefLolaTextureUrl, { isColorMap: false }),
  mercuryDay: loadHiResTexture(mercuryDayTextureUrl),
  venusDay: loadHiResTexture(venusDayTextureUrl),
  venusAtmosphere: loadHiResTexture(venusAtmosphereTextureUrl),
  marsDay: loadHiResTexture(marsDayTextureUrl),
  marsAlbedoUsgs: loadHiResTexture(marsAlbedoUsgsTextureUrl),
  marsReliefMola: loadHiResTexture(marsReliefMolaTextureUrl, { isColorMap: false }),
  jupiterDay: loadHiResTexture(jupiterDayTextureUrl),
  saturnDay: loadHiResTexture(saturnDayTextureUrl),
  uranusDay: loadHiResTexture(uranusDayTextureUrl),
  neptuneDay: loadHiResTexture(neptuneDayTextureUrl),
  milkyWaySurvey: loadHiResTexture(milkyWaySurveyTextureUrl)
};

const SURFACE_TEXTURE_REGISTRY = new Map([
  ['earth_topobathy_8192', hiResTextures.earthTopobathy],
  ['earth_watermask_2048', hiResTextures.earthWaterMask],
  ['moon_albedo_lroc_8192', hiResTextures.moonAlbedoLroc],
  ['moon_relief_ldem16_5760', hiResTextures.moonReliefLola],
  ['mars_albedo_usgs_4096', hiResTextures.marsAlbedoUsgs],
  ['mars_relief_mola_4096', hiResTextures.marsReliefMola]
]);

function profileSurfaceTexture(profile, mapType) {
  const mapId = profile?.surfaceData?.maps?.[mapType];
  if (!mapId) return null;
  return SURFACE_TEXTURE_REGISTRY.get(mapId) ?? null;
}

moonTexturePipeline = new MoonTexturePipeline({
  textureLoader,
  configureTexture: (texture) => {
    configureLoadedTexture(texture);
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.needsUpdate = true;
  }
});
solarPhysicsClient = new SolarPhysicsClient({
  baseUrl: backendBaseUrl,
  pollIntervalMs: 900,
  timeoutMs: 2_600,
  maxFeatures: 180,
  fidelity: 'high',
  forcing: 'hybrid',
  liveData: true
});

hiResTextures.earthClouds.wrapS = RepeatWrapping;
hiResTextures.earthClouds.wrapT = RepeatWrapping;
hiResTextures.earthClouds.needsUpdate = true;
hiResTextures.earthTopobathy.wrapS = RepeatWrapping;
hiResTextures.earthTopobathy.wrapT = RepeatWrapping;
hiResTextures.marsReliefMola.wrapS = RepeatWrapping;
hiResTextures.marsReliefMola.wrapT = RepeatWrapping;
earthCloudDetailTexture = createEarthCloudDetailTexture(512);
earthTerrainDisplacementTexture = profileSurfaceTexture(EARTH_VISUAL_PROFILE, 'relief') ?? createPlanetHeightTexture({
  size: EARTH_VISUAL_PROFILE.terrain?.textureSize ?? 1024,
  seed: EARTH_VISUAL_PROFILE.terrain?.synthSeed ?? 17
});
earthCloudDataPipeline = new PlanetCloudDataPipeline({
  provider: {
    ...(EARTH_VISUAL_PROFILE.clouds?.provider ?? {}),
    refreshMinutes: EARTH_VISUAL_PROFILE.clouds?.refreshMinutes ?? 30
  },
  fallbackTexture: hiResTextures.earthClouds
});
moonTerrainDisplacementTexture = profileSurfaceTexture(MOON_VISUAL_PROFILE, 'relief') ?? createPlanetHeightTexture({
  size: MOON_VISUAL_PROFILE.terrain?.textureSize ?? 1024,
  seed: MOON_VISUAL_PROFILE.terrain?.synthSeed ?? 43,
  mode: MOON_VISUAL_PROFILE.terrain?.mode ?? 'cratered',
  craterDensity: MOON_VISUAL_PROFILE.terrain?.craterDensity ?? 0.92
});
marsTerrainDisplacementTexture = profileSurfaceTexture(MARS_VISUAL_PROFILE, 'relief') ?? createPlanetHeightTexture({
  size: MARS_VISUAL_PROFILE.terrain?.textureSize ?? 1024,
  seed: MARS_VISUAL_PROFILE.terrain?.synthSeed ?? 29,
  mode: MARS_VISUAL_PROFILE.terrain?.mode ?? 'eolian'
});
marsCloudDetailTexture = createMarsDustDetailTexture(512);
marsCloudFallbackTexture = createMarsCloudFallbackTexture(1024);

if (MARS_VISUAL_PROFILE.clouds?.enabled && MARS_VISUAL_PROFILE.clouds?.provider?.wmsEndpoint && MARS_VISUAL_PROFILE.clouds?.provider?.layer) {
  marsCloudDataPipeline = new PlanetCloudDataPipeline({
    provider: {
      ...(MARS_VISUAL_PROFILE.clouds?.provider ?? {}),
      refreshMinutes: MARS_VISUAL_PROFILE.clouds?.refreshMinutes ?? 90
    },
    fallbackTexture: marsCloudFallbackTexture
  });
}

const nonEarthMoonBodies = catalog.bodies.filter((body) => body.type === 'moon' && !isEarthMoonBody(body));
void moonTexturePipeline.preloadForBodies(nonEarthMoonBodies);

// Generate procedural textures for planets at startup
const planetTextures = new Map();
for (const bodyId of ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']) {
  const canvas = generatePlanetTexture(bodyId);
  if (canvas) {
    const texture = new CanvasTexture(canvas);
    configureLoadedTexture(texture);
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.needsUpdate = true;
    planetTextures.set(bodyId, texture);
  }
}
const proceduralMoonTextures = new Map();

function stableHash(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function proceduralMoonTextureVariant(body) {
  const bodyKey = `${body?.parentId ?? 'moon'}:${body?.name ?? body?.id ?? 'moon'}`;
  const bucket = stableHash(bodyKey) % 36;
  return `${body?.parentId ?? 'moon'}:${bucket}`;
}

function proceduralMoonTexture(body) {
  const variant = proceduralMoonTextureVariant(body);
  if (proceduralMoonTextures.has(variant)) {
    return proceduralMoonTextures.get(variant);
  }

  const canvas = generateMoonTexture(variant, body?.parentId ?? 'default', { width: 256, height: 128 });
  const texture = new CanvasTexture(canvas);
  configureLoadedTexture(texture);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  proceduralMoonTextures.set(variant, texture);
  return texture;
}

function getMaterial(body) {
  const cacheKey = body.id;

  if (materialCache.has(cacheKey)) {
    const cachedMaterial = materialCache.get(cacheKey);
    if (body.id === 'sun' && cachedMaterial?.isShaderMaterial) {
      sunSurfaceMaterial = cachedMaterial;
      applySunObservationTextureToMaterials();
    }
    return cachedMaterial;
  }

  const texture = planetTextures.get(body.id);
  const isEarthMoon = isEarthMoonBody(body);
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

  if (body.id === 'sun') {
    const sunMap = texture ?? planetTextures.get('sun');
    if (sunMap) {
      sunMap.wrapS = RepeatWrapping;
      sunMap.wrapT = RepeatWrapping;
      sunMap.needsUpdate = true;
      material = createSunSurfaceMaterial(sunMap);
      sunSurfaceMaterial = material;
      applySunObservationTextureToMaterials();
    } else {
      material = new MeshBasicMaterial({
        color: new Color(body.color)
      });
      sunSurfaceMaterial = null;
    }
  } else if (body.type === 'star') {
    material = new MeshBasicMaterial({
      map: texture ?? undefined,
      color: texture ? undefined : new Color(body.color)
    });
  } else if (body.id === 'earth') {
    const earthDisplacementScale = EARTH_VISUAL_PROFILE.terrain?.displacementScale ?? 0.00235;
    const earthSeaLevel = EARTH_VISUAL_PROFILE.terrain?.seaLevel;
    const earthDisplacementBias = Number.isFinite(earthSeaLevel)
      ? -earthDisplacementScale * earthSeaLevel
      : (EARTH_VISUAL_PROFILE.terrain?.displacementBias ?? -0.00115);
    material = new MeshStandardMaterial({
      color: new Color('#ffffff'),
      map: profileSurfaceTexture(EARTH_VISUAL_PROFILE, 'albedo') ?? hiResTextures.earthDay,
      normalMap: hiResTextures.earthNormal,
      normalScale: new Vector2(0.9, 0.9),
      displacementMap: earthTerrainDisplacementTexture ?? undefined,
      displacementScale: earthDisplacementScale,
      displacementBias: earthDisplacementBias,
      roughness: 0.72,
      metalness: 0.0
    });
  } else if (body.id === 'mars') {
    material = new MeshStandardMaterial({
      color: new Color('#ffffff'),
      map: profileSurfaceTexture(MARS_VISUAL_PROFILE, 'albedo') ?? hiResTextures.marsDay,
      displacementMap: marsTerrainDisplacementTexture ?? undefined,
      displacementScale: MARS_VISUAL_PROFILE.terrain?.displacementScale ?? 0.0031,
      displacementBias: MARS_VISUAL_PROFILE.terrain?.displacementBias ?? -0.0015,
      roughness: 0.86,
      metalness: 0.0
    });
  } else if (isEarthMoon) {
    material = new MeshStandardMaterial({
      color: new Color('#f2f2f2'),
      map: profileSurfaceTexture(MOON_VISUAL_PROFILE, 'albedo') ?? hiResTextures.moonDay,
      displacementMap: moonTerrainDisplacementTexture ?? undefined,
      displacementScale: MOON_VISUAL_PROFILE.terrain?.displacementScale ?? 0.0029,
      displacementBias: MOON_VISUAL_PROFILE.terrain?.displacementBias ?? -0.00145,
      roughness: 0.95,
      metalness: 0.0
    });
  } else if (body.type === 'moon') {
    material = new MeshStandardMaterial({
      color: new Color('#ffffff'),
      map: proceduralMoonTexture(body),
      roughness: 0.93,
      metalness: 0.0
    });
    const applyCuratedMoonTexture = (loadedTexture) => {
      if (!loadedTexture || material.map === loadedTexture) return;
      material.map = loadedTexture;
      material.needsUpdate = true;
    };
    const curatedMoonTexture = moonTexturePipeline?.requestTexture(body, applyCuratedMoonTexture);
    if (curatedMoonTexture) {
      applyCuratedMoonTexture(curatedMoonTexture);
    }
  } else if (hiResDay) {
    material = new MeshStandardMaterial({
      color: new Color('#ffffff'),
      map: hiResDay,
      roughness: body.id === 'jupiter' || body.id === 'saturn' ? 0.78 : 0.88,
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

function startCameraTransition(endTarget, endCamera, durationSec = 1.2, onComplete = null) {
  cameraTransitionState.active = true;
  cameraTransitionState.elapsedSec = 0;
  cameraTransitionState.durationSec = Math.max(0.05, durationSec);
  cameraTransitionState.startTarget.copy(controls.target);
  cameraTransitionState.startCamera.copy(camera.position);
  cameraTransitionState.endTarget.copy(endTarget);
  cameraTransitionState.endCamera.copy(endCamera);
  cameraTransitionState.onComplete = typeof onComplete === 'function' ? onComplete : null;
  controls.enabled = false;
}

function updateCameraTransition(deltaSeconds) {
  if (!cameraTransitionState.active) return;
  cameraTransitionState.elapsedSec += Math.max(0, deltaSeconds);
  const normalized = Math.min(1, cameraTransitionState.elapsedSec / cameraTransitionState.durationSec);
  const eased = 1 - Math.pow(1 - normalized, 3);

  controls.target.lerpVectors(cameraTransitionState.startTarget, cameraTransitionState.endTarget, eased);
  camera.position.lerpVectors(cameraTransitionState.startCamera, cameraTransitionState.endCamera, eased);

  if (normalized >= 1) {
    cameraTransitionState.active = false;
    controls.enabled = true;
    if (cameraTransitionState.onComplete) {
      const handler = cameraTransitionState.onComplete;
      cameraTransitionState.onComplete = null;
      handler();
    }
  }
}

const {
  setLocalBodyMeshScale,
  localBodyRenderRadiusAu,
  buildLocalSystemScene,
  updateLocalSystemScene,
  focusLocalBody,
  loadLocalSystemManifestForNearbySystem
} = createLocalSystemRenderer({
  dom,
  simState,
  camera,
  controls,
  constants: {
    AU_KM,
    J2000_JD,
    TWO_PI
  },
  state: localSystemState,
  localSystemGroup,
  geometryCache,
  createLabelSprite,
  createSunGlow,
  textureTools: {
    loadHiResTexture,
    configureLoadedTexture,
    generateMoonTexture,
    generatePlanetTexture
  },
  mathTools: {
    stableHash,
    normalizeRadians
  },
  orbitTools: {
    propagateKeplerOrbit
  },
  disposeThreeMaterial
});

function setSystemViewMode(mode) {
  if (!Object.values(SYSTEM_VIEW_MODE).includes(mode)) return;
  if (simState.systemViewMode === mode) return;
  simState.systemViewMode = mode;

  if (mode === SYSTEM_VIEW_MODE.SYSTEM_LOCAL) {
    solarSystemGroup.visible = false;
    nearbySystemsGroup.visible = false;
    localSystemGroup.visible = true;
    controls.maxDistance = LOCAL_SYSTEM_MAX_DISTANCE_AU;
    controls.minDistance = 0.00003;
    setHoveredNearbySystem(null);
    if (dom.returnSolarSystem) {
      dom.returnSolarSystem.disabled = false;
    }
    return;
  }

  solarSystemGroup.visible = true;
  localSystemGroup.visible = false;
  cameraTransitionState.active = false;
  controls.enabled = true;
  controls.minDistance = simState.useRealisticScale ? 0.000003 : 0.0002;
  if (dom.returnSolarSystem) {
    dom.returnSolarSystem.disabled = true;
  }
  applyNearbySystemsVisibility();
}

function syncSystemViewModeWithCameraRange() {
  if (simState.systemViewMode === SYSTEM_VIEW_MODE.SYSTEM_LOCAL) return;
  if (!(Boolean(dom.toggleNearbySystems?.checked) && nearbySystemsLoaded)) {
    setSystemViewMode(SYSTEM_VIEW_MODE.SOLAR);
    return;
  }

  const rangeAu = camera.position.distanceTo(controls.target);
  const mode = rangeAu >= INTERSTELLAR_MARKER_VISIBILITY_MIN_RANGE_AU
    ? SYSTEM_VIEW_MODE.INTERSTELLAR
    : SYSTEM_VIEW_MODE.SOLAR;
  setSystemViewMode(mode);
}

async function enterLocalSystemFromNearbySystem(systemId) {
  if (localSystemLoadInFlight) return false;
  const system = nearbySystemsById.get(systemId);
  if (!system) return false;

  localSystemLoadInFlight = true;
  try {
    simState.selectedStarSystemId = system.id;
    syncStarSystemSelection(system.id);
    focusNearbySystem(systemId, true);
    simState.lastSolarFocusedBodyId = simState.focusedBodyId ?? 'sun';
    dom.statusFocus.textContent = `Focus: ${system.name} (loading local system...)`;

    let manifest;
    try {
      manifest = await loadLocalSystemManifestForNearbySystem(system);
    } catch {
      dom.bodyInfo.textContent = `${system.name}\nNo local manifest could be loaded.`;
      refillBodyList(dom.bodySearch?.value ?? '');
      return false;
    }
    if (!manifest) {
      dom.bodyInfo.textContent = `${system.name}\nNo local manifest is mapped yet.`;
      refillBodyList(dom.bodySearch?.value ?? '');
      return false;
    }

    const built = buildLocalSystemScene(manifest);
    if (!built || !activeLocalSystem) {
      dom.bodyInfo.textContent = `${system.name}\nManifest is present but contained no renderable bodies.`;
      refillBodyList(dom.bodySearch?.value ?? '');
      return false;
    }

    simState.activeLocalSystemId = activeLocalSystem.id;
    simState.followBodyId = null;
    simState.focusedNearbySystemId = system.id;
    simState.focusedBodyId = activeLocalSystem.primaryBodyId;
    setSystemViewMode(SYSTEM_VIEW_MODE.SYSTEM_LOCAL);

    const target = new Vector3(0, 0, 0);
    const offset = camera.position.clone().sub(controls.target);
    const preferredDistance = activeLocalSystem.preferredDistanceAu;
    if (offset.lengthSq() < 1e-12) {
      offset.set(0, -preferredDistance, preferredDistance * 0.6);
    }
    const desiredCamera = target.clone().add(offset.setLength(preferredDistance));
    startCameraTransition(target, desiredCamera, 1.35);

    const starsCount = Array.isArray(manifest.stars) ? manifest.stars.length : 0;
    const planetsCount = Array.isArray(manifest.planets) ? manifest.planets.length : 0;
    dom.statusFocus.textContent = `Focus: ${activeLocalSystem.name}`;
    dom.bodyInfo.textContent =
      `${activeLocalSystem.name}\nMode: Local system\n` +
      `Stars: ${starsCount}\nPlanets: ${planetsCount}\n` +
      `Fidelity tier: ${manifest.fidelity_tier ?? 'B'}\n` +
      `Source: ${Array.isArray(manifest.sources) ? manifest.sources.join('; ') : 'manifest'}`;
    refillBodyList(dom.bodySearch?.value ?? '');
    syncBodyListSelection(activeLocalSystem.primaryBodyId);
    updateBodyInfoPanel(activeLocalSystem.primaryBodyId);
    return true;
  } finally {
    localSystemLoadInFlight = false;
  }
}

function returnToSolarSystemView({ hardSnap = true } = {}) {
  if (simState.systemViewMode !== SYSTEM_VIEW_MODE.SYSTEM_LOCAL) return;

  cameraTransitionState.active = false;
  controls.enabled = true;
  simState.activeLocalSystemId = null;
  simState.focusedNearbySystemId = null;
  setSystemViewMode(SYSTEM_VIEW_MODE.SOLAR);

  const fallbackFocusId = bodyById.has(simState.lastSolarFocusedBodyId)
    ? simState.lastSolarFocusedBodyId
    : 'sun';
  simState.followBodyId = null;
  simState.selectedStarSystemId = 'solar-system';
  syncStarSystemSelection('solar-system');
  focusBody(fallbackFocusId, hardSnap);
  syncBodyListSelection(fallbackFocusId);
  updateBodyInfoPanel(fallbackFocusId);
  refillBodyList(dom.bodySearch?.value ?? '');
  dom.statusFocus.textContent = `Focus: ${bodyById.get(fallbackFocusId)?.name ?? 'Sun'}`;
}

// ── Sun Surface + Corona Dynamics ────────────────────────────────────────────

function setSunGlowScale(baseRadiusAu, pulse = 1) {
  setSunGlowScaleImpl(sunGlowSprite, baseRadiusAu, pulse);
}

function setSunEruptionBaseRadius(baseRadiusAu) {
  setSunEruptionBaseRadiusImpl(sunEruptionLayer, baseRadiusAu);
}

function clearSunCoronalLoops() {
  clearSunCoronalLoopsImpl(sunCoronalLoopGroup);
}

function clearSunParkerSpiralLines() {
  clearSunParkerSpiralLinesImpl(sunParkerSpiralGroup);
}

function buildSolarFeatureBlendView(nowMs = Date.now(), featureLimit = 220) {
  const blendView = buildSolarFeatureBlendViewImpl({
    currentFeatureSet: solarPhysicsFeatureSetCurrent,
    targetFeatureSet: solarPhysicsFeatureSetTarget,
    blendStartMs: solarPhysicsBlendStartMs,
    blendDurationMs: solarPhysicsBlendDurationMs,
    nowMs,
    featureLimit
  });
  solarPhysicsFeatureSetCurrent = blendView.nextCurrentFeatureSet;
  solarPhysicsFeatureSetTarget = blendView.nextTargetFeatureSet;
  solarPhysicsBlendStartMs = blendView.nextBlendStartMs;
  return blendView;
}

function normalizeSolarFeatureSetFromState(physicsState, featureLimit = 220) {
  return normalizeSolarFeatureSetFromStateImpl(physicsState, simState.julianDate, featureLimit);
}

function materializeSolarFeatureSetFromBlendView(blendView) {
  return materializeSolarFeatureSetFromBlendViewImpl(blendView, simState.julianDate);
}

function updateSunCoronalLoopsFromBlendView(blendView, sunRadiusAu, timeSec = 0) {
  updateSunCoronalLoopsFromBlendViewImpl(sunCoronalLoopGroup, blendView, sunRadiusAu, 144, timeSec);
}

function updateSunParkerSpiralFromPhysicsState(physicsState, sunRadiusAu, timeSec = 0) {
  updateSunParkerSpiralFromPhysicsStateImpl(
    sunParkerSpiralGroup,
    physicsState,
    sunRadiusAu,
    6,
    120,
    timeSec
  );
}

function applySunObservationTextureToMaterials() {
  setSunObservationTexture({
    sunSurfaceMaterial,
    observationTexture: solarObservationTexture
  });
}

function maybeRefreshSunObservationTexture(nowMs = Date.now(), force = false) {
  if (solarObservationTextureLoadInFlight) return;
  if (!solarPhysicsState) return;

  const selection = pickAiaObservationChannel(solarPhysicsState);
  if (!selection) return;

  const nextImageId = `${selection.imageId ?? ''}`;
  const nextChannel = `${selection.channel ?? ''}`.toLowerCase();
  if (!nextImageId || !nextChannel) return;

  if (!force && nextImageId === solarObservationTextureImageId && nextChannel === solarObservationTextureChannel) {
    return;
  }
  if (!force && nowMs - solarObservationTextureLastLoadMs < 12_000) {
    return;
  }

  const proxyUrl = buildAiaProxyTextureUrl(
    backendBaseUrl(),
    nextChannel,
    nextImageId
  );
  if (!proxyUrl) return;

  solarObservationTextureLoadInFlight = true;
  solarObservationTextureLastLoadMs = nowMs;
  solarObservationTextureLoader.load(
    proxyUrl,
    (loaded) => {
      configureLoadedTexture(loaded);
      loaded.needsUpdate = true;
      if (solarObservationTexture && solarObservationTexture !== loaded && typeof solarObservationTexture.dispose === 'function') {
        solarObservationTexture.dispose();
      }
      solarObservationTexture = loaded;
      solarObservationTextureImageId = nextImageId;
      solarObservationTextureChannel = nextChannel;
      applySunObservationTextureToMaterials();
      solarObservationTextureLoadInFlight = false;
    },
    undefined,
    () => {
      solarObservationTextureLoadInFlight = false;
    }
  );
}

const EARTH_ATMOSPHERE_VERTEX_SHADER = `
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const EARTH_ATMOSPHERE_FRAGMENT_SHADER = `
uniform vec3 atmosphereColor;
uniform vec3 sunsetColor;
uniform vec3 sunPosition;
uniform float intensity;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 normalDir = normalize(vWorldNormal);
  vec3 sunDir = normalize(sunPosition - vWorldPosition);

  float horizon = pow(max(0.0, 1.0 - max(dot(viewDir, normalDir), 0.0)), 2.9);
  float dayLit = max(dot(normalDir, sunDir), 0.0);
  float twilight = pow(1.0 - dayLit, 2.1);
  float rim = smoothstep(0.0, 1.0, horizon);

  vec3 scatterColor = mix(atmosphereColor, sunsetColor, twilight * 0.75);
  float alpha = rim * (0.1 + 0.9 * pow(dayLit + 0.08, 0.45));

  gl_FragColor = vec4(scatterColor * intensity, alpha);
}
`;

const ORBIT_GUIDE_STYLE_BY_PRESET = {
  atmosphere: { color: '#86c8ff', opacity: 0.36 },
  leo: { color: '#73d0ff', opacity: 0.45 },
  geo: { color: '#ffd28a', opacity: 0.38 },
  llo: { color: '#d6dce7', opacity: 0.46 },
  nrho: { color: '#9fa7ff', opacity: 0.4 },
  skim: { color: '#9ec7ff', opacity: 0.4 },
  lmo: { color: '#f9c08d', opacity: 0.42 },
  areostationary: { color: '#ffde95', opacity: 0.35 }
};

function setOrbitGuideScale(guideMesh, body, realisticMode = simState.useRealisticScale) {
  const altitudeKm = Number(guideMesh?.userData?.orbitAltitudeKm);
  if (!Number.isFinite(altitudeKm) || !body) return;
  const orbitRadiusAu = realisticMode
    ? bodyDistanceAuAtAltitude(body, altitudeKm)
    : bodyRenderRadiusAu(body, false) * (1 + altitudeKm / Math.max(1, bodyEquatorialRadiusKm(body)));
  guideMesh.scale.setScalar(orbitRadiusAu);
}

function addOrbitGuideRing({
  body,
  spinGroup,
  guideCollection,
  presetKey,
  altitudeKm,
  geometrySegments = 192
}) {
  if (!Number.isFinite(altitudeKm) || altitudeKm < 0) return;
  const style = ORBIT_GUIDE_STYLE_BY_PRESET[presetKey] ?? { color: '#b8d6ff', opacity: 0.35 };
  const ring = new Mesh(
    new RingGeometry(0.9982, 1.0018, geometrySegments),
    new MeshBasicMaterial({
      color: new Color(style.color),
      transparent: true,
      opacity: style.opacity,
      side: DoubleSide,
      depthWrite: false
    })
  );
  ring.rotation.x = Math.PI * 0.5;
  ring.userData.bodyId = `${body.id}-orbit-guide-${presetKey}-${altitudeKm}`;
  ring.userData.orbitAltitudeKm = altitudeKm;
  ring.userData.orbitPresetKey = presetKey;
  ring.userData.lockBodySpin = true;
  setOrbitGuideScale(ring, body, simState.useRealisticScale);
  ring.visible = false;
  spinGroup.add(ring);
  guideCollection.push(ring);
}

// ── Body Nodes ───────────────────────────────────────────────────────────────

function createBodyNode(body) {
  const node = new Group();
  node.name = body.name;

  const spinGroup = new Group();
  const axialTiltDeg = Number.isFinite(body.axialTiltDeg) ? body.axialTiltDeg : 0;
  const spinAxisLongitudeDeg = Number.isFinite(body.spinAxisLongitudeDeg) ? body.spinAxisLongitudeDeg : 0;
  const axialTiltRad = (axialTiltDeg * Math.PI) / 180;
  const spinAxisLongitudeRad = (spinAxisLongitudeDeg * Math.PI) / 180;
  // Orbit propagation uses x-y as the ecliptic plane and +z as the plane normal.
  // Build a spin axis tilted from +z by obliquity with an ecliptic-longitude azimuth.
  const spinAxisWorld = new Vector3(
    Math.sin(axialTiltRad) * Math.cos(spinAxisLongitudeRad),
    Math.sin(axialTiltRad) * Math.sin(spinAxisLongitudeRad),
    Math.cos(axialTiltRad)
  ).normalize();
  spinGroup.quaternion.setFromUnitVectors(BODY_LOCAL_SPIN_AXIS, spinAxisWorld);
  node.add(spinGroup);
  bodySpinGroups.set(body.id, spinGroup);

  const isEarthMoon = isEarthMoonBody(body);
  const geometry = body.type === 'star'
    ? geometryCache.sun
    : body.type === 'moon'
      ? (
          isEarthMoon
            ? geometryCache.moonSurfaceLod.low
            : (body.isMajor ? geometryCache.majorMoon : geometryCache.moon)
        )
      : (
          body.id === 'earth'
            ? geometryCache.earthSurfaceLod.low
            : body.id === 'mars'
              ? geometryCache.marsSurfaceLod.low
              : geometryCache.planet
        );
  const material = getMaterial(body);

  const mesh = new Mesh(geometry, material);
  setBodyMeshScale(mesh, body, simState.useRealisticScale);
  mesh.userData.bodyId = body.id;
  mesh.userData.rotationPeriodHours = body.rotationPeriodHours ?? null;
  mesh.userData.rotationOffsetRad = ((body.rotationPhaseDeg ?? 0) * Math.PI) / 180;
  mesh.userData.axialTiltDeg = axialTiltDeg;
  spinGroup.add(mesh);

  if (body.id === 'sun' && material?.isShaderMaterial) {
    sunSurfaceMaterial = material;
  }

  // Earth cloud layer with animated detail modulation for weather-like evolution.
  if (body.id === 'earth') {
    const cloudShellScale = EARTH_VISUAL_PROFILE.clouds?.shellScale ?? 1.011;
    const cloudBaseOpacity = EARTH_VISUAL_PROFILE.clouds?.baseOpacity ?? 0.42;
    const atmosphereShellScale = EARTH_VISUAL_PROFILE.atmosphere?.shellScale ?? 1.028;
    const atmosphereColor = EARTH_VISUAL_PROFILE.atmosphere?.color ?? '#68a9ff';
    const sunsetColor = EARTH_VISUAL_PROFILE.atmosphere?.sunsetColor ?? '#ff9f5e';

    const cloudMaterial = new MeshStandardMaterial({
      map: hiResTextures.earthClouds,
      alphaMap: earthCloudDetailTexture ?? undefined,
      color: new Color('#f4f7ff'),
      transparent: true,
      opacity: cloudBaseOpacity,
      alphaTest: 0.015,
      roughness: 0.78,
      metalness: 0.0,
      depthWrite: false
    });
    const cloudMesh = new Mesh(geometry, cloudMaterial);
    cloudMesh.userData.surfaceScale = cloudShellScale;
    setBodyMeshScale(cloudMesh, body, simState.useRealisticScale, cloudMesh.userData.surfaceScale);
    cloudMesh.userData.bodyId = `${body.id}-clouds`;
    cloudMesh.userData.rotationPeriodHours = 22.4;
    cloudMesh.userData.rotationOffsetRad = mesh.userData.rotationOffsetRad;
    spinGroup.add(cloudMesh);
    earthCloudMesh = cloudMesh;
    earthCloudLayerMaterial = cloudMaterial;

    const atmosphereMaterial = new ShaderMaterial({
      vertexShader: EARTH_ATMOSPHERE_VERTEX_SHADER,
      fragmentShader: EARTH_ATMOSPHERE_FRAGMENT_SHADER,
      uniforms: {
        atmosphereColor: { value: new Color(atmosphereColor) },
        sunsetColor: { value: new Color(sunsetColor) },
        sunPosition: { value: new Vector3(0, 0, 0) },
        intensity: { value: 1.0 }
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: BackSide
    });
    const atmosphereMesh = new Mesh(geometry, atmosphereMaterial);
    atmosphereMesh.userData.bodyId = `${body.id}-atmosphere`;
    atmosphereMesh.userData.surfaceScale = atmosphereShellScale;
    setBodyMeshScale(atmosphereMesh, body, simState.useRealisticScale, atmosphereMesh.userData.surfaceScale);
    spinGroup.add(atmosphereMesh);
    earthAtmosphereMesh = atmosphereMesh;

    if (EARTH_VISUAL_PROFILE.water?.enabled) {
      const oceanMaterial = new MeshStandardMaterial({
        color: new Color(EARTH_VISUAL_PROFILE.water?.color ?? '#3a6f9c'),
        alphaMap: profileSurfaceTexture(EARTH_VISUAL_PROFILE, 'waterMask') ?? undefined,
        transparent: true,
        opacity: EARTH_VISUAL_PROFILE.water?.opacity ?? 0.68,
        alphaTest: 0.08,
        roughness: EARTH_VISUAL_PROFILE.water?.roughness ?? 0.28,
        metalness: EARTH_VISUAL_PROFILE.water?.metalness ?? 0.08,
        depthWrite: false
      });
      const oceanMesh = new Mesh(geometry, oceanMaterial);
      oceanMesh.userData.bodyId = `${body.id}-ocean`;
      oceanMesh.userData.surfaceScale = EARTH_VISUAL_PROFILE.water?.shellScale ?? 1.00045;
      oceanMesh.userData.rotationPeriodHours = mesh.userData.rotationPeriodHours;
      oceanMesh.userData.rotationOffsetRad = mesh.userData.rotationOffsetRad;
      setBodyMeshScale(oceanMesh, body, simState.useRealisticScale, oceanMesh.userData.surfaceScale);
      spinGroup.add(oceanMesh);
      earthOceanMesh = oceanMesh;
    }

    const earthGuideKeys = Array.isArray(EARTH_VISUAL_PROFILE.orbitGuidePresets) && EARTH_VISUAL_PROFILE.orbitGuidePresets.length > 0
      ? EARTH_VISUAL_PROFILE.orbitGuidePresets
      : ['leo', 'geo'];
    for (const presetKey of earthGuideKeys) {
      const altitudeKm = Number(EARTH_VISUAL_PROFILE.orbitalPresetsKm?.[presetKey]);
      addOrbitGuideRing({
        body,
        spinGroup,
        guideCollection: earthOrbitGuides,
        presetKey,
        altitudeKm
      });
    }

    earthSurfaceMesh = mesh;
  }

  if (isEarthMoon) {
    moonSurfaceMesh = mesh;
    if (material?.isMeshStandardMaterial) {
      moonSurfaceMaterial = material;
      moonSurfaceMaterial.emissive = new Color(MOON_VISUAL_PROFILE.earthshine?.color ?? '#d9e3ff');
      moonSurfaceMaterial.emissiveIntensity = 0;
    }

    if (MOON_VISUAL_PROFILE.exosphere?.enabled) {
      const exosphereMaterial = new ShaderMaterial({
        vertexShader: EARTH_ATMOSPHERE_VERTEX_SHADER,
        fragmentShader: EARTH_ATMOSPHERE_FRAGMENT_SHADER,
        uniforms: {
          atmosphereColor: { value: new Color(MOON_VISUAL_PROFILE.exosphere?.color ?? '#acc0db') },
          sunsetColor: { value: new Color(MOON_VISUAL_PROFILE.exosphere?.sunsetColor ?? '#d7e3f4') },
          sunPosition: { value: new Vector3(0, 0, 0) },
          intensity: { value: MOON_VISUAL_PROFILE.exosphere?.intensity ?? 0.14 }
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: BackSide
      });
      moonExosphereMesh = new Mesh(geometry, exosphereMaterial);
      moonExosphereMesh.userData.bodyId = `${body.id}-exosphere`;
      moonExosphereMesh.userData.surfaceScale = MOON_VISUAL_PROFILE.exosphere?.shellScale ?? 1.006;
      setBodyMeshScale(moonExosphereMesh, body, simState.useRealisticScale, moonExosphereMesh.userData.surfaceScale);
      spinGroup.add(moonExosphereMesh);
    }

    const moonGuideKeys = Array.isArray(MOON_VISUAL_PROFILE.orbitGuidePresets) && MOON_VISUAL_PROFILE.orbitGuidePresets.length > 0
      ? MOON_VISUAL_PROFILE.orbitGuidePresets
      : ['llo', 'nrho'];
    for (const presetKey of moonGuideKeys) {
      const altitudeKm = Number(MOON_VISUAL_PROFILE.orbitalPresetsKm?.[presetKey]);
      addOrbitGuideRing({
        body,
        spinGroup,
        guideCollection: moonOrbitGuides,
        presetKey,
        altitudeKm,
        geometrySegments: presetKey === 'nrho' ? 256 : 192
      });
    }
  }

  if (body.id === 'mars') {
    marsSurfaceMesh = mesh;

    if (MARS_VISUAL_PROFILE.clouds?.enabled) {
      const cloudShellScale = MARS_VISUAL_PROFILE.clouds?.shellScale ?? 1.008;
      const cloudBaseOpacity = MARS_VISUAL_PROFILE.clouds?.baseOpacity ?? 0.24;
      const cloudMaterial = new MeshStandardMaterial({
        map: marsCloudDataPipeline?.texture ?? marsCloudFallbackTexture ?? undefined,
        alphaMap: marsCloudDetailTexture ?? undefined,
        color: new Color('#d9b59f'),
        transparent: true,
        opacity: cloudBaseOpacity,
        alphaTest: 0.02,
        roughness: 0.88,
        metalness: 0.0,
        depthWrite: false
      });
      const cloudMesh = new Mesh(geometry, cloudMaterial);
      cloudMesh.userData.surfaceScale = cloudShellScale;
      setBodyMeshScale(cloudMesh, body, simState.useRealisticScale, cloudMesh.userData.surfaceScale);
      cloudMesh.userData.bodyId = `${body.id}-clouds`;
      cloudMesh.userData.rotationPeriodHours = 24.9;
      cloudMesh.userData.rotationOffsetRad = mesh.userData.rotationOffsetRad;
      spinGroup.add(cloudMesh);
      marsCloudMesh = cloudMesh;
      marsCloudLayerMaterial = cloudMaterial;
    }

    if (MARS_VISUAL_PROFILE.atmosphere?.enabled) {
      const atmosphereShellScale = MARS_VISUAL_PROFILE.atmosphere?.shellScale ?? 1.018;
      const atmosphereColor = MARS_VISUAL_PROFILE.atmosphere?.color ?? '#d3916e';
      const sunsetColor = MARS_VISUAL_PROFILE.atmosphere?.sunsetColor ?? '#f0b58f';
      const intensity = MARS_VISUAL_PROFILE.atmosphere?.intensity ?? 0.72;
      const atmosphereMaterial = new ShaderMaterial({
        vertexShader: EARTH_ATMOSPHERE_VERTEX_SHADER,
        fragmentShader: EARTH_ATMOSPHERE_FRAGMENT_SHADER,
        uniforms: {
          atmosphereColor: { value: new Color(atmosphereColor) },
          sunsetColor: { value: new Color(sunsetColor) },
          sunPosition: { value: new Vector3(0, 0, 0) },
          intensity: { value: intensity }
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: BackSide
      });
      const atmosphereMesh = new Mesh(geometry, atmosphereMaterial);
      atmosphereMesh.userData.bodyId = `${body.id}-atmosphere`;
      atmosphereMesh.userData.surfaceScale = atmosphereShellScale;
      setBodyMeshScale(atmosphereMesh, body, simState.useRealisticScale, atmosphereMesh.userData.surfaceScale);
      spinGroup.add(atmosphereMesh);
      marsAtmosphereMesh = atmosphereMesh;
    }

    const marsGuideKeys = Array.isArray(MARS_VISUAL_PROFILE.orbitGuidePresets) && MARS_VISUAL_PROFILE.orbitGuidePresets.length > 0
      ? MARS_VISUAL_PROFILE.orbitGuidePresets
      : ['lmo', 'areostationary'];
    for (const presetKey of marsGuideKeys) {
      const altitudeKm = Number(MARS_VISUAL_PROFILE.orbitalPresetsKm?.[presetKey]);
      addOrbitGuideRing({
        body,
        spinGroup,
        guideCollection: marsOrbitGuides,
        presetKey,
        altitudeKm
      });
    }

    if (MARS_VISUAL_PROFILE.seasonal?.polarCaps?.enabled) {
      const northMask = createPolarCapMaskTexture(1024, 'north');
      const southMask = createPolarCapMaskTexture(1024, 'south');
      marsPolarNorthMaterial = new MeshStandardMaterial({
        color: new Color('#f2eee4'),
        transparent: true,
        opacity: 0.12,
        alphaMap: northMask,
        roughness: 0.96,
        metalness: 0.0,
        depthWrite: false
      });
      marsPolarSouthMaterial = new MeshStandardMaterial({
        color: new Color('#f2eee4'),
        transparent: true,
        opacity: 0.12,
        alphaMap: southMask,
        roughness: 0.96,
        metalness: 0.0,
        depthWrite: false
      });

      marsPolarNorthMesh = new Mesh(geometry, marsPolarNorthMaterial);
      marsPolarNorthMesh.userData.bodyId = `${body.id}-polar-north`;
      marsPolarNorthMesh.userData.surfaceScale = 1.0018;
      setBodyMeshScale(marsPolarNorthMesh, body, simState.useRealisticScale, marsPolarNorthMesh.userData.surfaceScale);
      spinGroup.add(marsPolarNorthMesh);

      marsPolarSouthMesh = new Mesh(geometry, marsPolarSouthMaterial);
      marsPolarSouthMesh.userData.bodyId = `${body.id}-polar-south`;
      marsPolarSouthMesh.userData.surfaceScale = 1.0018;
      setBodyMeshScale(marsPolarSouthMesh, body, simState.useRealisticScale, marsPolarSouthMesh.userData.surfaceScale);
      spinGroup.add(marsPolarSouthMesh);
    }
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
    atmosphereMesh.userData.surfaceScale = 1.012;
    setBodyMeshScale(atmosphereMesh, body, simState.useRealisticScale, atmosphereMesh.userData.surfaceScale);
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
      ring.userData.lockBodySpin = true;
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
    ring.userData.lockBodySpin = true;
    spinGroup.add(ring);
  }

  if (body.id === 'sun') {
    const sunRadiusAu = bodyRenderRadiusAu(body, simState.useRealisticScale);
    sunGlowSprite = createSunGlow(sunRadiusAu);
    node.add(sunGlowSprite);

    const coronaMesh = createSunCoronaShell(geometryCache.sun);
    setBodyMeshScale(coronaMesh, body, simState.useRealisticScale, coronaMesh.userData.surfaceScale);
    spinGroup.add(coronaMesh);
    sunCoronaMaterial = coronaMesh.material;

    sunEruptionLayer = createSunEruptionLayer(sunRadiusAu);
    sunEruptionLayer.userData.rotationPeriodHours = body.rotationPeriodHours ?? null;
    sunEruptionLayer.userData.rotationOffsetRad = mesh.userData.rotationOffsetRad;
    spinGroup.add(sunEruptionLayer);
    setSunEruptionBaseRadius(sunRadiusAu);

    if (sunCoronalLoopGroup) {
      clearSunCoronalLoops();
      if (sunCoronalLoopGroup.parent) {
        sunCoronalLoopGroup.parent.remove(sunCoronalLoopGroup);
      }
    }
    if (sunParkerSpiralGroup) {
      clearSunParkerSpiralLines();
      if (sunParkerSpiralGroup.parent) {
        sunParkerSpiralGroup.parent.remove(sunParkerSpiralGroup);
      }
    }
    sunCoronalLoopGroup = new Group();
    sunCoronalLoopGroup.userData.bodyId = 'sun-coronal-loops';
    spinGroup.add(sunCoronalLoopGroup);
    const initialSolarBlend = buildSolarFeatureBlendView(Date.now(), 220);
    updateSunCoronalLoopsFromBlendView(initialSolarBlend, sunRadiusAu);

    sunParkerSpiralGroup = new Group();
    sunParkerSpiralGroup.userData.bodyId = 'sun-parker-spiral';
    node.add(sunParkerSpiralGroup);
    updateSunParkerSpiralFromPhysicsState(solarPhysicsState, sunRadiusAu);
  } else if (body.type === 'star') {
    const glow = createSunGlow(bodyRenderRadiusAu(body, simState.useRealisticScale));
    node.add(glow);
  }

  // Labels for major bodies only
  if (majorNodeIds.has(body.id)) {
    const label = createLabelSprite(body.name);
    const pointerTipOffset = label.scale.y * (label.userData.pointerTipOffsetNorm ?? LABEL_POINTER_TIP_OFFSET_NORM);
    label.position.set(0, body.displayRadiusAu * 2.5 + 0.03 + pointerTipOffset, 0);
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

const mountSceneGraph = () => mountSceneGraphImpl({
  catalog,
  createBodyNode,
  bodyNodes,
  createOrbitLine,
  solarSystemGroup
});

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

function equatorialDegToUnit(raDeg, decDeg) {
  const ra = raDeg * DEG_TO_RAD;
  const dec = decDeg * DEG_TO_RAD;
  const cosDec = Math.cos(dec);
  return [
    cosDec * Math.cos(ra),
    cosDec * Math.sin(ra),
    Math.sin(dec)
  ];
}

function galacticUnitToEquatorial(xg, yg, zg) {
  return [
    GALACTIC_TO_EQUATORIAL_M11 * xg + GALACTIC_TO_EQUATORIAL_M12 * yg + GALACTIC_TO_EQUATORIAL_M13 * zg,
    GALACTIC_TO_EQUATORIAL_M21 * xg + GALACTIC_TO_EQUATORIAL_M22 * yg + GALACTIC_TO_EQUATORIAL_M23 * zg,
    GALACTIC_TO_EQUATORIAL_M31 * xg + GALACTIC_TO_EQUATORIAL_M32 * yg + GALACTIC_TO_EQUATORIAL_M33 * zg
  ];
}

function equatorialUnitToEcliptic(xEq, yEq, zEq) {
  return [
    xEq,
    COS_J2000_ECLIPTIC_OBLIQUITY * yEq + SIN_J2000_ECLIPTIC_OBLIQUITY * zEq,
    -SIN_J2000_ECLIPTIC_OBLIQUITY * yEq + COS_J2000_ECLIPTIC_OBLIQUITY * zEq
  ];
}

function eclipticUnitToEquatorial(xEcl, yEcl, zEcl) {
  return [
    xEcl,
    COS_J2000_ECLIPTIC_OBLIQUITY * yEcl - SIN_J2000_ECLIPTIC_OBLIQUITY * zEcl,
    SIN_J2000_ECLIPTIC_OBLIQUITY * yEcl + COS_J2000_ECLIPTIC_OBLIQUITY * zEcl
  ];
}

function equatorialDegToCartesian(raDeg, decDeg, radius) {
  const [xEq, yEq, zEq] = equatorialDegToUnit(raDeg, decDeg);
  const [x, y, z] = equatorialUnitToEcliptic(xEq, yEq, zEq);
  return [
    x * radius,
    y * radius,
    z * radius
  ];
}

function galacticToCartesian(lRad, bRad, radius) {
  const cosB = Math.cos(bRad);
  const xg = cosB * Math.cos(lRad);
  const yg = cosB * Math.sin(lRad);
  const zg = Math.sin(bRad);
  const [xEq, yEq, zEq] = galacticUnitToEquatorial(xg, yg, zg);
  const [x, y, z] = equatorialUnitToEcliptic(xEq, yEq, zEq);
  return [x * radius, y * radius, z * radius];
}

function angularSeparationDeg(ax, ay, az, bx, by, bz) {
  const dot = Math.min(1, Math.max(-1, ax * bx + ay * by + az * bz));
  return (Math.acos(dot) * 180) / Math.PI;
}

function validateGalacticFrame() {
  const [gcX, gcY, gcZ] = galacticToCartesian(0, 0, 1);
  const [gcEqX, gcEqY, gcEqZ] = eclipticUnitToEquatorial(gcX, gcY, gcZ);
  const [gcExpectedX, gcExpectedY, gcExpectedZ] = equatorialDegToUnit(266.4051, -28.936175);
  const gcErrorDeg = angularSeparationDeg(gcEqX, gcEqY, gcEqZ, gcExpectedX, gcExpectedY, gcExpectedZ);

  const [ngpX, ngpY, ngpZ] = galacticToCartesian(0, Math.PI * 0.5, 1);
  const [ngpEqX, ngpEqY, ngpEqZ] = eclipticUnitToEquatorial(ngpX, ngpY, ngpZ);
  const [ngpExpectedX, ngpExpectedY, ngpExpectedZ] = equatorialDegToUnit(192.85948, 27.12825);
  const ngpErrorDeg = angularSeparationDeg(ngpEqX, ngpEqY, ngpEqZ, ngpExpectedX, ngpExpectedY, ngpExpectedZ);

  if (gcErrorDeg > 1e-2 || ngpErrorDeg > 1e-2) {
    console.warn(
      `[Milky Way frame] Verification failed: GC error ${gcErrorDeg.toExponential(2)} deg, ` +
      `NGP error ${ngpErrorDeg.toExponential(2)} deg`
    );
  }
}

if (import.meta.env?.DEV) {
  validateGalacticFrame();
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
  const milkyCount = 76_000;
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
    const intensity = (0.14 + 0.52 * Math.random()) * (0.3 + 0.54 * lonWeight) * latFalloff * dustFactor;

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
      size: 1.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.48,
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
      size: 2.45,
      transparent: true,
      opacity: 0.045,
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
  // 2MASS all-sky maps are distributed in sky-view orientation where galactic longitude
  // increases to the left; mirror U so the map follows the right-handed galactic basis.
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
  // Sphere local basis mapping after horizontal texture mirror:
  // local +x -> l=0,b=0 ; local +y -> b=+90 ; local +z -> l=270,b=0.
  const localXAxisWorld = new Vector3(...galacticToCartesian(0, 0, 1));
  const localYAxisWorld = new Vector3(...galacticToCartesian(0, Math.PI * 0.5, 1));
  const localZAxisWorld = new Vector3(...galacticToCartesian(-Math.PI * 0.5, 0, 1));
  const surveyToWorldMatrix = new Matrix4().makeBasis(
    localXAxisWorld,
    localYAxisWorld,
    localZAxisWorld
  );
  sphere.setRotationFromMatrix(surveyToWorldMatrix);
  sphere.visible = false;
  sphere.renderOrder = -50;
  return sphere;
}

// ── Asteroid Belt (element-driven + adaptive LOD refinement) ──────────────────

const ASTEROID_EPOCH_JD = 2_451_545.0;
const ASTEROID_BASE_COUNT = 22_000;
const ASTEROID_DETAIL_MAX = 90_000;
const ASTEROID_DETAIL_MIN = 7_000;
const ASTEROID_DETAIL_TARGET_MAX = 78_000;
const ASTEROID_GAPS = [
  { center: 2.06, halfWidth: 0.02 },
  { center: 2.50, halfWidth: 0.035 },
  { center: 2.82, halfWidth: 0.025 },
  { center: 2.95, halfWidth: 0.02 },
  { center: 3.28, halfWidth: 0.025 }
];
const ASTEROID_FAMILY_COMPONENTS = [
  { centerA: 2.28, sigmaA: 0.09, weight: 0.2 },
  { centerA: 2.41, sigmaA: 0.08, weight: 0.24 },
  { centerA: 2.66, sigmaA: 0.1, weight: 0.2 },
  { centerA: 2.9, sigmaA: 0.1, weight: 0.2 },
  { centerA: 3.15, sigmaA: 0.09, weight: 0.16 }
];
const ASTEROID_FAMILY_TOTAL_WEIGHT = ASTEROID_FAMILY_COMPONENTS.reduce((sum, comp) => sum + comp.weight, 0);

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

function sampleAsteroidFamilySemimajorAxis(minA, maxA) {
  let selector = Math.random() * ASTEROID_FAMILY_TOTAL_WEIGHT;
  let picked = ASTEROID_FAMILY_COMPONENTS[ASTEROID_FAMILY_COMPONENTS.length - 1];
  for (const component of ASTEROID_FAMILY_COMPONENTS) {
    selector -= component.weight;
    if (selector <= 0) {
      picked = component;
      break;
    }
  }
  return Math.max(minA, Math.min(maxA, picked.centerA + randomGaussian() * picked.sigmaA));
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
      if (Math.random() < 0.68) {
        a = sampleAsteroidFamilySemimajorAxis(minA, maxA);
      } else {
        const minSq = minA * minA;
        const maxSq = maxA * maxA;
        a = Math.sqrt(minSq + (maxSq - minSq) * Math.random());
      }
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
    size: 0.0085,
    vertexColors: true,
    transparent: true,
    opacity: 0.74,
    sizeAttenuation: true,
    depthWrite: false
  })
);

function createAsteroidBeltWaypoint(innerRadiusAu = 2.02, outerRadiusAu = 3.36) {
  const ring = new Mesh(
    new RingGeometry(innerRadiusAu, outerRadiusAu, 192, 1),
    new MeshBasicMaterial({
      color: new Color('#7e745f'),
      transparent: true,
      opacity: 0.11,
      side: DoubleSide,
      depthWrite: false
    })
  );
  ring.renderOrder = -5;
  return ring;
}

const asteroidBeltWaypoint = createAsteroidBeltWaypoint();

const asteroidDetailGeometry = new BufferGeometry();
const asteroidDetailPositions = new Float32Array(ASTEROID_DETAIL_MAX * 3);
const asteroidDetailVelocities = new Float32Array(ASTEROID_DETAIL_MAX * 3);
const asteroidDetailElements = new Array(ASTEROID_DETAIL_MAX);
asteroidDetailGeometry.setAttribute('position', new Float32BufferAttribute(asteroidDetailPositions, 3));

const asteroidDetailPoints = new Points(
  asteroidDetailGeometry,
  new PointsMaterial({
    color: new Color('#d0c5af'),
    size: 0.0022,
    transparent: true,
    opacity: 0.68,
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
      size: 1.08,
      transparent: true,
      opacity: 0.15,
      sizeAttenuation: false,
      depthWrite: false
    })
  );
  const outerCloud = new Points(
    outerGeometry,
    new PointsMaterial({
      color: new Color('#7f96a5'),
      size: 0.92,
      transparent: true,
      opacity: 0.11,
      sizeAttenuation: false,
      depthWrite: false
    })
  );
  const waypointGeometry = createOortComponent(5_400, 7_300, 7_900, 1.0);
  const waypointShell = new Points(
    waypointGeometry,
    new PointsMaterial({
      color: new Color('#8fb1c7'),
      size: 1.35,
      transparent: true,
      opacity: 0.12,
      sizeAttenuation: false,
      depthWrite: false
    })
  );

  group.add(outerCloud);
  group.add(innerCloud);
  group.add(waypointShell);
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

solarSystemGroup.add(asteroidBelt);
solarSystemGroup.add(asteroidBeltWaypoint);

solarSystemGroup.add(asteroidDetailPoints);

const kuiperBelt = createKuiperBelt();
solarSystemGroup.add(kuiperBelt);

solarSystemGroup.add(kuiperDetailPoints);

const oortCloud = createOortCloud();
solarSystemGroup.add(oortCloud);

async function initializeEarthSatelliteLayer() {
  const entries = [
    { bodyId: 'earth', profile: EARTH_SATELLITE_PROFILE },
    { bodyId: CANONICAL_BODY_IDS.moon, profile: MOON_SATELLITE_PROFILE },
    { bodyId: 'mars', profile: MARS_SATELLITE_PROFILE }
  ];

  for (const entry of entries) {
    const profile = entry.profile ?? {};
    if (!profile.enabled) continue;

    const node = bodyNodes.get(entry.bodyId);
    if (!node) continue;

    const system = new OrbitalSatelliteSystem({
      primaryId: profile.primaryId ?? entry.bodyId,
      maxGeoCount: profile.maxGeoCount ?? 28,
      showOrbits: profile.defaultShowOrbits ?? true,
      useJ2: profile.defaultUseJ2 ?? true,
      tleSources: profile.tleSources ?? null,
      catalogSatellites: profile.catalog ?? [],
      useInstancing: profile.useInstancing ?? (entry.bodyId === 'earth'),
      useWorkerPropagation: profile.useWorkerPropagation ?? false,
      workerLeadSeconds: profile.workerLeadSeconds ?? 0.4,
      workerCadenceMs: profile.workerCadenceMs ?? 120,
      maxOrbitLines: profile.maxOrbitLines ?? 1_200,
      markerStyle: profile.markerStyle ?? 'sphere',
      markerPixelSize: profile.markerPixelSize ?? null,
      markerBaseScaleAu: profile.markerBaseScaleAu ?? null,
      markerColorOverrides: profile.markerColorOverrides ?? null
    });

    system.attachTo(node);
    system.applyScaleMode(simState.useRealisticScale);

    try {
      await system.initialize();
    } catch {
      // Fallback dataset is loaded inside the system on fetch failures.
    }
    system.applyScaleMode(simState.useRealisticScale);

    system.setVisible(Boolean(dom.toggleEarthSatellites?.checked));
    system.setOrbitVisibility(Boolean(dom.toggleOrbits?.checked));
    system.setJ2Enabled(Boolean(dom.toggleSatelliteJ2?.checked));

    if (entry.bodyId === 'earth') {
      earthSatelliteSystem = system;
    } else if (entry.bodyId === CANONICAL_BODY_IDS.moon) {
      moonSatelliteSystem = system;
    } else if (entry.bodyId === 'mars') {
      marsSatelliteSystem = system;
    }
  }
}

mountSceneGraph();
void initializeEarthSatelliteLayer();
void loadNearbySystemsCatalog();

// ── WebSocket Simulation Client ──────────────────────────────────────────

const simClient = new SimulationClient({ buildWebSocketUrl: backendWebSocketUrl });
simClient.onServerReady = () => {
  simClient.send({ type: 'set_time_scale', days_per_sec: simState.timeScaleDaysPerSec });
  simClient.send({ type: simState.paused ? 'pause' : 'resume' });
};

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
solarSystemGroup.add(serverKuiperPoints);

function applyServerState(state) {
  applyServerStateToScene({
    state,
    simState,
    catalog,
    bodyNodes,
    propagateKeplerOrbit,
    showMoons: dom.toggleMoons.checked
  });
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
  controls.minDistance = simState.systemViewMode === SYSTEM_VIEW_MODE.SYSTEM_LOCAL
    ? 0.00003
    : (realistic ? 0.000003 : 0.0002);

  for (const body of catalog.bodies) {
    const mesh = bodyMeshes.get(body.id);
    const spinGroup = bodySpinGroups.get(body.id);
    if (!mesh) continue;

    setBodyMeshScale(mesh, body, realistic);

    if (spinGroup) {
      const ringFactor = realistic ? body.realRadiusAu / Math.max(body.displayRadiusAu, 1e-12) : 1.0;
      for (const child of spinGroup.children) {
        if (child === mesh) continue;
        if (Number.isFinite(child.userData.orbitAltitudeKm)) {
          setOrbitGuideScale(child, body, realistic);
        } else if (Number.isFinite(child.userData.surfaceScale)) {
          setBodyMeshScale(child, body, realistic, child.userData.surfaceScale);
        } else if (child.geometry && child.geometry.type === 'RingGeometry') {
          child.scale.setScalar(ringFactor);
        }
      }
    }
  }

  for (const system of [earthSatelliteSystem, moonSatelliteSystem, marsSatelliteSystem]) {
    if (!system) continue;
    system.applyScaleMode(realistic);
  }

  const sunBody = bodyById.get('sun');
  if (sunBody) {
    const sunRadiusAu = bodyRenderRadiusAu(sunBody, realistic);
    setSunGlowScale(sunRadiusAu);
    setSunEruptionBaseRadius(sunRadiusAu);
    const solarBlendView = buildSolarFeatureBlendView(Date.now(), 220);
    updateSunCoronalLoopsFromBlendView(solarBlendView, sunRadiusAu);
    updateSunParkerSpiralFromPhysicsState(solarPhysicsState, sunRadiusAu);
  }

  if (simState.systemViewMode === SYSTEM_VIEW_MODE.SYSTEM_LOCAL) {
    for (const entry of localBodyEntries) {
      if (!entry?.mesh || !entry?.body) continue;
      setLocalBodyMeshScale(entry.mesh, entry.body, realistic);
      if (entry.glow) {
        const glowRadius = localBodyRenderRadiusAu(entry.body, realistic);
        entry.glow.scale.setScalar(glowRadius * 14);
      }
      if (entry.label) {
        const labelRadius = localBodyRenderRadiusAu(entry.body, realistic);
        entry.label.position.set(0, labelRadius * 2.4 + 0.015, 0);
      }
    }
    const localFocusBodyId = localBodyById.has(simState.focusedBodyId)
      ? simState.focusedBodyId
      : activeLocalSystem?.primaryBodyId;
    if (localFocusBodyId) {
      focusLocalBody(localFocusBodyId, true);
      updateBodyInfoPanel(localFocusBodyId);
      syncBodyListSelection(localFocusBodyId);
    }
  } else if (simState.focusedBodyId) {
    focusBody(simState.focusedBodyId, true);
  }

  updateEarthOrbitGuidesVisibility();
  updateLocatorOverlays();
  updateZoomMetricsUI();
}

// ── Resize ───────────────────────────────────────────────────────────────────

function resizeRenderer() {
  const viewportWidth = dom.canvas.clientWidth;
  const viewportHeight = dom.canvas.clientHeight;

  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return;
  }

  const renderWidth = Math.max(1, Math.round(viewportWidth * runtimeUiConfig.renderScale));
  const renderHeight = Math.max(1, Math.round(viewportHeight * runtimeUiConfig.renderScale));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, runtimeUiConfig.maxPixelRatio));

  if (dom.canvas.width !== renderWidth || dom.canvas.height !== renderHeight) {
    renderer.setSize(renderWidth, renderHeight, false);
    camera.aspect = viewportWidth / viewportHeight;
    camera.updateProjectionMatrix();
    updateZoomMetricsUI();
  }
  updateRenderResolutionStatus({
    statusElement: dom.statusRender,
    renderWidth,
    renderHeight,
    viewportWidth,
    viewportHeight,
    maxPixelRatio: runtimeUiConfig.maxPixelRatio
  });
}

window.addEventListener('resize', resizeRenderer);
resizeRenderer();

// ── Scene Updates ────────────────────────────────────────────────────────────

const tempVecA = new Vector3();
const tempVecB = new Vector3();
const pickRaycaster = new Raycaster();
const pickPointerNdc = new Vector2();

function updateSceneBodies() {
  updateSceneBodiesFromModel({
    catalog,
    model,
    bodyNodes,
    showMoons: dom.toggleMoons.checked
  });
}

function updateLocatorOverlays() {
  updateLocatorOverlaysImpl({
    dom,
    simState,
    labels,
    locatorHalos,
    bodyById,
    bodyNodes,
    camera,
    renderer,
    bodyRenderRadiusAu,
    localBodyEntries,
    localBodyRenderRadiusAu,
    labelPointerTipOffsetNorm: LABEL_POINTER_TIP_OFFSET_NORM
  });
}

function updateBodyRotations(julianDate) {
  const elapsedSeconds = (julianDate - J2000_JD) * 86_400;
  for (const body of catalog.bodies) {
    const spinGroup = bodySpinGroups.get(body.id);
    if (!spinGroup) continue;

    for (const child of spinGroup.children) {
      if (child.userData.lockBodySpin) continue;
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

function updateEarthWeather(julianDate) {
  if (!earthCloudLayerMaterial) return;

  const elapsedHours = (julianDate - J2000_JD) * 24;
  const cloudMap = earthCloudLayerMaterial.map;
  if (!cloudMap) return;

  cloudMap.offset.x = wrapUnitInterval(elapsedHours * 0.00052 + Math.sin(elapsedHours * 0.0017) * 0.03);
  cloudMap.offset.y = wrapUnitInterval(elapsedHours * -0.00008 + Math.cos(elapsedHours * 0.0013) * 0.018);

  if (earthCloudDetailTexture) {
    earthCloudDetailTexture.offset.x = wrapUnitInterval(elapsedHours * 0.00125 + Math.sin(elapsedHours * 0.006) * 0.07);
    earthCloudDetailTexture.offset.y = wrapUnitInterval(elapsedHours * -0.00061 + Math.cos(elapsedHours * 0.0042) * 0.05);
  }

  const longWave = Math.sin(elapsedHours * 0.022);
  const shortWave = Math.sin(elapsedHours * 0.11);
  const baseOpacity = EARTH_VISUAL_PROFILE.clouds?.baseOpacity ?? 0.42;
  earthCloudLayerMaterial.opacity = baseOpacity - 0.04 + longWave * 0.05 + shortWave * 0.02;
}

function updateMarsWeather(julianDate) {
  if (!marsCloudLayerMaterial) return;

  const elapsedHours = (julianDate - J2000_JD) * 24;
  const cloudMap = marsCloudLayerMaterial.map;
  if (cloudMap) {
    cloudMap.offset.x = wrapUnitInterval(elapsedHours * 0.00029 + Math.sin(elapsedHours * 0.0013) * 0.02);
    cloudMap.offset.y = wrapUnitInterval(elapsedHours * -0.00009 + Math.cos(elapsedHours * 0.0011) * 0.015);
  }

  if (marsCloudDetailTexture) {
    marsCloudDetailTexture.offset.x = wrapUnitInterval(elapsedHours * 0.00145 + Math.sin(elapsedHours * 0.0049) * 0.08);
    marsCloudDetailTexture.offset.y = wrapUnitInterval(elapsedHours * -0.00072 + Math.cos(elapsedHours * 0.0035) * 0.05);
  }

  const longWave = Math.sin(elapsedHours * 0.014);
  const shortWave = Math.sin(elapsedHours * 0.064);
  const baseOpacity = MARS_VISUAL_PROFILE.clouds?.baseOpacity ?? 0.24;
  marsCloudLayerMaterial.opacity = Math.max(0.08, baseOpacity - 0.03 + longWave * 0.06 + shortWave * 0.03);
}

function updateSunDynamics(julianDate, realtimeSeconds) {
  const timeSec = Number.isFinite(realtimeSeconds) ? realtimeSeconds : performance.now() * 0.001;
  const solarCycleYears = (julianDate - J2000_JD) / 365.25;
  const cyclePhase = (solarCycleYears / 11.0) * TWO_PI;
  const cycleActivity = 0.5 + 0.5 * Math.sin(cyclePhase);
  const shortPulse = 0.5 + 0.5 * Math.sin(timeSec * 0.37);
  const fallbackActivity = Math.min(1, Math.max(0, 0.28 + cycleActivity * 0.47 + shortPulse * 0.25));
  const solarBlendView = buildSolarFeatureBlendView(Date.now(), 480);
  const blendedActivityRaw = Number(solarBlendView?.activityIndex);
  const backendActivityRaw = Number(solarPhysicsState?.activity_index);
  const activity = Number.isFinite(blendedActivityRaw)
    ? clampUnit(blendedActivityRaw)
    : (Number.isFinite(backendActivityRaw) ? clampUnit(backendActivityRaw) : fallbackActivity);
  const observationControls = deriveSunObservationControls(solarPhysicsState, activity);

  updateSunMaterialUniforms({
    sunSurfaceMaterial,
    sunCoronaMaterial,
    timeSec,
    activity,
    observationBlend: observationControls.observationBlend,
    observationEmission: observationControls.observationEmission
  });

  const sunBody = bodyById.get('sun');
  const sunRadiusAu = sunBody ? bodyRenderRadiusAu(sunBody, simState.useRealisticScale) : 0.01;
  updateSunCoronalLoopsFromBlendView(solarBlendView, sunRadiusAu, timeSec);
  updateSunParkerSpiralFromPhysicsState(solarPhysicsState, sunRadiusAu, timeSec);

  const glowPulse = 1 + Math.sin(timeSec * 1.7) * 0.035 + activity * 0.045;
  setSunGlowScale(sunRadiusAu, glowPulse);
  if (sunGlowSprite?.material) {
    const baseOpacity = sunGlowSprite.userData.baseOpacity ?? 0.42;
    sunGlowSprite.material.opacity = Math.max(0.18, Math.min(0.64, baseOpacity * (0.9 + activity * 0.16)));
  }

  updateSunEruptionLayerFromBlendView({
    sunEruptionLayer,
    blendView: solarBlendView,
    sunRadiusAu,
    timeSec,
    activity
  });
}

function maybeRefreshSolarPhysics(nowMs = Date.now(), force = false) {
  if (!solarPhysicsClient || solarPhysicsRefreshInFlight) return;
  if (!force && nowMs < solarPhysicsNextRefreshMs) return;

  solarPhysicsRefreshInFlight = true;
  const requestJd = simState.julianDate;

  void solarPhysicsClient.maybeRefresh(requestJd, force)
    .then((updated) => {
      const status = solarPhysicsClient.status();
      if (updated) {
        solarPhysicsState = solarPhysicsClient.latestState();
        maybeRefreshSunObservationTexture(nowMs, force);
        const normalized = normalizeSolarFeatureSetFromState(
          solarPhysicsState,
          480
        );
        if (normalized) {
          if (!solarPhysicsFeatureSetCurrent) {
            solarPhysicsFeatureSetCurrent = normalized;
            solarPhysicsFeatureSetTarget = null;
            solarPhysicsBlendStartMs = Date.now();
          } else {
            if (solarPhysicsFeatureSetTarget) {
              const inFlightBlend = buildSolarFeatureBlendView(Date.now(), 220);
              const blendedSnapshot = materializeSolarFeatureSetFromBlendView(inFlightBlend);
              if (blendedSnapshot) {
                solarPhysicsFeatureSetCurrent = blendedSnapshot;
              } else {
                solarPhysicsFeatureSetCurrent = solarPhysicsFeatureSetTarget;
              }
              solarPhysicsFeatureSetTarget = null;
            }
            solarPhysicsFeatureSetTarget = normalized;
            solarPhysicsBlendStartMs = Date.now();
            const pollMs = Number(status.pollIntervalMs);
            solarPhysicsBlendDurationMs = Math.max(
              520,
              Math.min(1_350, (Number.isFinite(pollMs) ? pollMs : 900) * 0.9)
            );
          }
        }
      }
      solarPhysicsNextRefreshMs = nowMs + (status.lastError ? 6_000 : status.pollIntervalMs);
    })
    .finally(() => {
      solarPhysicsRefreshInFlight = false;
    });
}

function maybeRefreshEarthCloudCoverage(nowMs = Date.now(), force = false) {
  if (!earthCloudDataPipeline || earthCloudRefreshInFlight) return;
  if (!force && nowMs < earthCloudNextRefreshMs) return;

  earthCloudRefreshInFlight = true;
  const nowDate = new Date(nowMs);

  void earthCloudDataPipeline.maybeRefresh(nowDate, force)
    .then((updated) => {
      if (updated && earthCloudLayerMaterial) {
        earthCloudLayerMaterial.map = earthCloudDataPipeline.texture;
        earthCloudLayerMaterial.needsUpdate = true;
      }
      const status = earthCloudDataPipeline.status();
      const nextDelayMs = status.lastError ? 5 * 60_000 : (EARTH_VISUAL_PROFILE.clouds?.refreshMinutes ?? 30) * 60_000;
      earthCloudNextRefreshMs = nowMs + nextDelayMs;
    })
    .finally(() => {
      earthCloudRefreshInFlight = false;
    });
}

function maybeRefreshMarsCloudCoverage(nowMs = Date.now(), force = false) {
  if (!marsCloudDataPipeline || marsCloudRefreshInFlight) return;
  if (!force && nowMs < marsCloudNextRefreshMs) return;

  marsCloudRefreshInFlight = true;
  const nowDate = new Date(nowMs);

  void marsCloudDataPipeline.maybeRefresh(nowDate, force)
    .then((updated) => {
      if (updated && marsCloudLayerMaterial) {
        marsCloudLayerMaterial.map = marsCloudDataPipeline.texture;
        marsCloudLayerMaterial.needsUpdate = true;
      }
      const status = marsCloudDataPipeline.status();
      const nextDelayMs = status.lastError ? 7 * 60_000 : (MARS_VISUAL_PROFILE.clouds?.refreshMinutes ?? 90) * 60_000;
      marsCloudNextRefreshMs = nowMs + nextDelayMs;
    })
    .finally(() => {
      marsCloudRefreshInFlight = false;
    });
}

function updateMoonEarthshine() {
  if (!moonSurfaceMaterial || !MOON_VISUAL_PROFILE.earthshine?.enabled) return;

  const moonNode = bodyNodes.get(CANONICAL_BODY_IDS.moon);
  const earthNode = bodyNodes.get('earth');
  if (!moonNode || !earthNode) return;

  moonNode.getWorldPosition(tempVecA);
  earthNode.getWorldPosition(tempVecB);

  const moonToEarthX = tempVecB.x - tempVecA.x;
  const moonToEarthY = tempVecB.y - tempVecA.y;
  const moonToEarthZ = tempVecB.z - tempVecA.z;
  const moonToEarthLen = Math.hypot(moonToEarthX, moonToEarthY, moonToEarthZ);
  const moonToSunX = -tempVecA.x;
  const moonToSunY = -tempVecA.y;
  const moonToSunZ = -tempVecA.z;
  const moonToSunLen = Math.hypot(moonToSunX, moonToSunY, moonToSunZ);
  if (moonToEarthLen < 1e-12 || moonToSunLen < 1e-12) return;

  const dot = (
    (moonToEarthX / moonToEarthLen) * (moonToSunX / moonToSunLen)
    + (moonToEarthY / moonToEarthLen) * (moonToSunY / moonToSunLen)
    + (moonToEarthZ / moonToEarthLen) * (moonToSunZ / moonToSunLen)
  );
  const earthPhaseFromMoon = Math.max(0, Math.min(1, (1 - dot) * 0.5));
  const maxIntensity = MOON_VISUAL_PROFILE.earthshine?.maxIntensity ?? 0.22;
  moonSurfaceMaterial.emissiveIntensity = maxIntensity * earthPhaseFromMoon;
}

function updateMarsSeasonalAppearance(julianDate) {
  if (!MARS_VISUAL_PROFILE.seasonal?.polarCaps?.enabled) return;
  if (!marsPolarNorthMaterial || !marsPolarSouthMaterial) return;

  const maxOpacity = MARS_VISUAL_PROFILE.seasonal?.polarCaps?.maxOpacity ?? 0.46;
  const martianYearDays = 686.98;
  const phase = ((julianDate - J2000_JD) / martianYearDays) * TWO_PI;
  const northBlend = 0.2 + 0.8 * (0.5 + 0.5 * Math.cos(phase));
  const southBlend = 0.2 + 0.8 * (0.5 + 0.5 * Math.cos(phase + Math.PI));
  marsPolarNorthMaterial.opacity = maxOpacity * northBlend;
  marsPolarSouthMaterial.opacity = maxOpacity * southBlend;
}

function updateBodySurfaceLod({
  bodyId,
  profile,
  lodGeometries,
  currentLevel,
  surfaceMesh,
  cloudMesh = null,
  atmosphereMesh = null,
  extraMeshes = []
}) {
  if (!surfaceMesh || !lodGeometries) return currentLevel;

  const node = bodyNodes.get(bodyId);
  if (!node) return currentLevel;

  node.getWorldPosition(tempVecA);
  const distanceToBody = camera.position.distanceTo(tempVecA);
  const highThreshold = profile?.lod?.thresholdsAu?.high ?? 0.00025;
  const mediumThreshold = profile?.lod?.thresholdsAu?.medium ?? 0.0012;

  let targetLevel = 'low';
  if (distanceToBody < highThreshold) {
    targetLevel = 'high';
  } else if (distanceToBody < mediumThreshold) {
    targetLevel = 'medium';
  }

  if (targetLevel === currentLevel) return currentLevel;

  const targetGeometry = lodGeometries[targetLevel] ?? lodGeometries.low;
  surfaceMesh.geometry = targetGeometry;
  if (cloudMesh) cloudMesh.geometry = targetGeometry;
  if (atmosphereMesh) atmosphereMesh.geometry = targetGeometry;
  for (const mesh of extraMeshes) {
    if (mesh) {
      mesh.geometry = targetGeometry;
    }
  }

  return targetLevel;
}

function updateEarthSurfaceLod() {
  earthLodCurrentLevel = updateBodySurfaceLod({
    bodyId: 'earth',
    profile: EARTH_VISUAL_PROFILE,
    lodGeometries: geometryCache.earthSurfaceLod,
    currentLevel: earthLodCurrentLevel,
    surfaceMesh: earthSurfaceMesh,
    cloudMesh: earthCloudMesh,
    atmosphereMesh: earthAtmosphereMesh,
    extraMeshes: [earthOceanMesh]
  });
  moonLodCurrentLevel = updateBodySurfaceLod({
    bodyId: CANONICAL_BODY_IDS.moon,
    profile: MOON_VISUAL_PROFILE,
    lodGeometries: geometryCache.moonSurfaceLod,
    currentLevel: moonLodCurrentLevel,
    surfaceMesh: moonSurfaceMesh,
    atmosphereMesh: moonExosphereMesh
  });
  marsLodCurrentLevel = updateBodySurfaceLod({
    bodyId: 'mars',
    profile: MARS_VISUAL_PROFILE,
    lodGeometries: geometryCache.marsSurfaceLod,
    currentLevel: marsLodCurrentLevel,
    surfaceMesh: marsSurfaceMesh,
    cloudMesh: marsCloudMesh,
    atmosphereMesh: marsAtmosphereMesh,
    extraMeshes: [marsPolarNorthMesh, marsPolarSouthMesh]
  });
}

function updateGravityVectors() {
  if (simState.systemViewMode === SYSTEM_VIEW_MODE.SYSTEM_LOCAL) {
    gravityVectorGroup.visible = false;
    return;
  }

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

    const targetBody = bodyById.get(target.id);
    const renderedRadius = targetBody ? bodyRenderRadiusAu(targetBody, simState.useRealisticScale) : 0.0002;
    const baseLength = 0.04 + 0.018 * Math.log10(1 + magnitude * 1e8);
    const length = Math.max(renderedRadius * 1.4, Math.min(0.42, baseLength));
    arrow.position.copy(target.pos);
    arrow.setDirection(new Vector3(ax, ay, az).normalize());
    arrow.setLength(length, Math.max(0.01, length * 0.3), Math.max(0.008, length * 0.2));
    arrow.visible = true;
  }
}

function updateEarthOrbitGuidesVisibility() {
  const guideSets = [
    ['earth', earthOrbitGuides],
    [CANONICAL_BODY_IDS.moon, moonOrbitGuides],
    ['mars', marsOrbitGuides]
  ];
  for (const [bodyId, guides] of guideSets) {
    const shouldShow = simState.useRealisticScale
      && Boolean(dom.toggleOrbits?.checked)
      && (simState.focusedBodyId === bodyId || simState.followBodyId === bodyId);
    for (const guide of guides) {
      guide.visible = shouldShow;
    }
  }
}

function applyRenderVisibility() {
  const solarVisible = simState.systemViewMode !== SYSTEM_VIEW_MODE.SYSTEM_LOCAL;
  const localVisible = simState.systemViewMode === SYSTEM_VIEW_MODE.SYSTEM_LOCAL;

  for (const line of orbitLines) {
    if (!solarVisible || !dom.toggleOrbits.checked) {
      line.visible = false;
      continue;
    }

    const isMoonOrbit = line.userData.bodyType === 'moon';
    line.visible = isMoonOrbit ? dom.toggleMoons.checked : true;
  }

  const shouldShowLabels = Boolean(dom.toggleLabels?.checked) || (Boolean(dom.toggleLocators?.checked) && simState.useRealisticScale);
  for (const entry of labels) {
    entry.sprite.visible = solarVisible && shouldShowLabels;
  }
  for (const entry of locatorHalos) {
    entry.sprite.visible = false;
  }

  asteroidBelt.visible = solarVisible && dom.toggleAsteroids.checked;
  asteroidBeltWaypoint.visible = solarVisible && dom.toggleAsteroids.checked;
  asteroidDetailPoints.visible = solarVisible && dom.toggleAsteroids.checked && asteroidDetailPoints.visible;
  kuiperBelt.visible = solarVisible && dom.toggleKuiper.checked;
  oortCloud.visible = solarVisible && dom.toggleOort.checked;
  gravityVectorGroup.visible = solarVisible && Boolean(dom.toggleGravityVectors?.checked);
  for (const system of [earthSatelliteSystem, moonSatelliteSystem, marsSatelliteSystem]) {
    if (!system) continue;
    system.setVisible(solarVisible && Boolean(dom.toggleEarthSatellites?.checked));
    system.setOrbitVisibility(solarVisible && Boolean(dom.toggleOrbits?.checked));
    system.setJ2Enabled(Boolean(dom.toggleSatelliteJ2?.checked));
  }

  for (const orbitLine of localOrbitLines) {
    orbitLine.visible = localVisible && Boolean(dom.toggleOrbits?.checked);
  }
  for (const entry of localBodyEntries) {
    if (entry.label) {
      entry.label.visible = localVisible && Boolean(dom.toggleLabels?.checked);
    }
  }

  solarSystemGroup.visible = solarVisible;
  localSystemGroup.visible = localVisible;
  applyMilkyWayAppearance();
  applyNearbySystemsVisibility();
  updateEarthOrbitGuidesVisibility();

  updateLocatorOverlays();
}

// ── Focus & Follow ───────────────────────────────────────────────────────────

function focusBody(bodyId, hardSnap = false) {
  if (simState.systemViewMode === SYSTEM_VIEW_MODE.SYSTEM_LOCAL) {
    simState.activeLocalSystemId = null;
    setSystemViewMode(SYSTEM_VIEW_MODE.SOLAR);
  }

  const resolvedBodyId = resolveBodyId(bodyId);
  const body = bodyById.get(resolvedBodyId);
  const node = bodyNodes.get(resolvedBodyId);
  if (!body || !node) return;

  node.getWorldPosition(tempVecA);
  const offset = camera.position.clone().sub(controls.target);
  const renderedRadius = bodyRenderRadiusAu(body, simState.useRealisticScale);
  const minDistance = simState.useRealisticScale
    ? bodyMinimumCameraDistanceAu(body)
    : (body.type === 'moon' ? 0.002 : 0.01);
  controls.minDistance = minDistance;
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

  simState.focusedNearbySystemId = null;
  simState.selectedStarSystemId = 'solar-system';
  syncStarSystemSelection('solar-system');
  simState.focusedBodyId = resolvedBodyId;
  simState.lastSolarFocusedBodyId = resolvedBodyId;
  updateEarthOrbitGuidesVisibility();
  dom.statusFocus.textContent = `Focus: ${body.name}`;
}

function ensureRealisticScaleEnabled() {
  if (simState.useRealisticScale) return;
  simState.useRealisticScale = true;
  if (dom.toggleRealisticScale) {
    dom.toggleRealisticScale.checked = true;
  }
  applyScaleMode();
}

function focusBodyAtAltitude(bodyId, altitudeKm, { follow = true } = {}) {
  if (simState.systemViewMode === SYSTEM_VIEW_MODE.SYSTEM_LOCAL) {
    simState.activeLocalSystemId = null;
    setSystemViewMode(SYSTEM_VIEW_MODE.SOLAR);
  }

  const resolvedBodyId = resolveBodyId(bodyId);
  const body = bodyById.get(resolvedBodyId);
  const node = bodyNodes.get(resolvedBodyId);
  if (!body || !node || !Number.isFinite(altitudeKm)) return;

  ensureRealisticScaleEnabled();

  node.getWorldPosition(tempVecA);
  const offset = camera.position.clone().sub(controls.target);
  if (offset.lengthSq() < 1e-9) {
    offset.set(0, -1, 0.55);
  }

  const centerDistance = bodyDistanceAuAtAltitude(body, altitudeKm);
  controls.minDistance = bodyMinimumCameraDistanceAu(body);
  controls.target.copy(tempVecA);
  camera.position.copy(tempVecA).add(offset.setLength(Math.max(centerDistance, controls.minDistance)));

  simState.focusedNearbySystemId = null;
  simState.selectedStarSystemId = 'solar-system';
  syncStarSystemSelection('solar-system');
  simState.focusedBodyId = resolvedBodyId;
  simState.lastSolarFocusedBodyId = resolvedBodyId;
  if (follow) {
    simState.followBodyId = resolvedBodyId;
  }

  updateEarthOrbitGuidesVisibility();
  updateBodyInfoPanel(resolvedBodyId);
  syncBodyListSelection(resolvedBodyId);
  updateZoomMetricsUI();

  const altitudeText = `${altitudeKm.toLocaleString('en-US')} km`;
  dom.statusFocus.textContent = follow
    ? `Following: ${body.name} @ ${altitudeText}`
    : `Focus: ${body.name} @ ${altitudeText}`;
}

function updateBodyInfoPanel(bodyId) {
  if (localBodyById.has(bodyId)) {
    updateLocalBodyInfoPanel(bodyId);
    return;
  }
  updateSolarBodyInfoPanel(bodyId);
}

// ── Body List & Search ───────────────────────────────────────────────────────

const allBodiesSorted = [...catalog.bodies].sort((a, b) => {
  const aTypeOrder = EXPLORER_BODY_TYPE_ORDER[a.type] ?? 99;
  const bTypeOrder = EXPLORER_BODY_TYPE_ORDER[b.type] ?? 99;
  if (aTypeOrder === bTypeOrder) return a.name.localeCompare(b.name);
  return aTypeOrder - bTypeOrder;
});

function labelForBody(body) {
  const tag = body.type === 'dwarf' ? 'dwarf planet' : body.type;
  return `${body.name} [${tag}]`;
}

function localBodiesSorted() {
  return [...localBodyById.values()].sort((a, b) => {
    const aTypeOrder = EXPLORER_BODY_TYPE_ORDER[a.type] ?? 99;
    const bTypeOrder = EXPLORER_BODY_TYPE_ORDER[b.type] ?? 99;
    if (aTypeOrder === bTypeOrder) return a.name.localeCompare(b.name);
    return aTypeOrder - bTypeOrder;
  });
}

function bodyDisplayName(bodyId) {
  return bodyById.get(bodyId)?.name
    ?? localBodyById.get(bodyId)?.name
    ?? bodyId;
}

function starSystemOptionIds() {
  const ids = new Set(['solar-system', ...Object.keys(LOCAL_SYSTEM_MANIFEST_BY_NEARBY_ID)]);
  for (const knownId of STAR_SYSTEM_OPTION_ORDER) {
    ids.add(knownId);
  }
  if (simState.selectedStarSystemId) {
    ids.add(simState.selectedStarSystemId);
  }
  return [...ids].sort((a, b) => {
    const aStaticIndex = STAR_SYSTEM_OPTION_ORDER.indexOf(a);
    const bStaticIndex = STAR_SYSTEM_OPTION_ORDER.indexOf(b);
    if (aStaticIndex >= 0 || bStaticIndex >= 0) {
      if (aStaticIndex < 0) return 1;
      if (bStaticIndex < 0) return -1;
      if (aStaticIndex !== bStaticIndex) return aStaticIndex - bStaticIndex;
    }
    const aRank = nearbySystemsById.get(a)?.rank ?? Number.POSITIVE_INFINITY;
    const bRank = nearbySystemsById.get(b)?.rank ?? Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    const aLabel = starSystemLabelForId(a);
    const bLabel = starSystemLabelForId(b);
    return aLabel.localeCompare(bLabel);
  });
}

function starSystemLabelForId(systemId) {
  if (systemId === 'solar-system') {
    return STAR_SYSTEM_STATIC_LABEL_BY_ID['solar-system'];
  }
  const nearbyName = nearbySystemsById.get(systemId)?.name;
  if (typeof nearbyName === 'string' && nearbyName.trim()) {
    return nearbyName;
  }
  return STAR_SYSTEM_STATIC_LABEL_BY_ID[systemId] ?? systemId;
}

function refreshStarSystemListOptions() {
  if (!dom.starSystemList) return;
  const selected = simState.selectedStarSystemId || dom.starSystemList.value || 'solar-system';
  const optionIds = starSystemOptionIds();

  dom.starSystemList.innerHTML = '';
  for (const systemId of optionIds) {
    const option = document.createElement('option');
    option.value = systemId;
    option.textContent = starSystemLabelForId(systemId);
    dom.starSystemList.appendChild(option);
  }

  const hasSelected = optionIds.includes(selected);
  simState.selectedStarSystemId = hasSelected ? selected : 'solar-system';
  dom.starSystemList.value = simState.selectedStarSystemId;
}

function syncStarSystemSelection(systemId = simState.selectedStarSystemId) {
  if (!dom.starSystemList) return;
  simState.selectedStarSystemId = systemId || 'solar-system';
  refreshStarSystemListOptions();
  dom.starSystemList.value = simState.selectedStarSystemId;
}

function selectedSystemBodySource() {
  if (simState.selectedStarSystemId === 'solar-system') {
    return allBodiesSorted;
  }
  const localSystemActive = simState.systemViewMode === SYSTEM_VIEW_MODE.SYSTEM_LOCAL
    && simState.focusedNearbySystemId === simState.selectedStarSystemId
    && localBodyById.size > 0;
  if (!localSystemActive) {
    return [];
  }
  return localBodiesSorted();
}

function updateSolarBodyInfoPanel(bodyId) {
  const body = bodyById.get(bodyId);
  if (!body) {
    dom.bodyInfo.textContent = 'No body selected.';
    return;
  }

  const state = model.getState(bodyId);
  const parentName = body.parentId ? bodyById.get(body.parentId)?.name ?? body.parentId : 'None';
  const sunDistance = state?.worldPosition.length() ?? 0;
  const lines = [
    `Name: ${body.name}`,
    `Type: ${body.type}`,
    `Parent: ${parentName}`,
    `Radius: ${body.radiusKm.toFixed(2)} km`,
    `Shape: equatorial ${bodyEquatorialRadiusKm(body).toFixed(2)} km, polar ${bodyPolarRadiusKm(body).toFixed(2)} km`,
    `Distance from Sun: ${sunDistance.toFixed(4)} AU`,
    body.orbit ? `Orbital period: ${body.orbit.periodDays.toFixed(3)} days` : 'Orbital period: N/A'
  ];

  if (body.id === 'earth' && earthCloudDataPipeline) {
    const cloudStatus = earthCloudDataPipeline.status();
    const cloudMode = cloudStatus.hasLiveData ? 'live tile mosaic' : 'fallback texture';
    lines.push(`Cloud source: ${cloudMode}`);
    if (EARTH_VISUAL_PROFILE.surfaceData?.maps?.relief) {
      lines.push(`Surface relief: ${EARTH_VISUAL_PROFILE.surfaceData.maps.relief} (topobathy)`);
    }
  } else if (body.id === 'mars') {
    if (marsCloudDataPipeline) {
      const cloudStatus = marsCloudDataPipeline.status();
      const cloudMode = cloudStatus.hasLiveData ? 'live tile mosaic' : 'procedural dust fallback';
      lines.push(`Cloud source: ${cloudMode}`);
    } else if (MARS_VISUAL_PROFILE.clouds?.enabled) {
      lines.push('Cloud source: procedural dust fronts');
    }
    if (MARS_VISUAL_PROFILE.surfaceData?.maps?.relief) {
      lines.push(`Surface relief: ${MARS_VISUAL_PROFILE.surfaceData.maps.relief}`);
    }
  } else if (isEarthMoonBody(body) && MOON_VISUAL_PROFILE.dataProviders) {
    const elev = MOON_VISUAL_PROFILE.dataProviders.elevation?.source ?? 'USGS/LOLA';
    const albedo = MOON_VISUAL_PROFILE.dataProviders.albedo?.source ?? 'USGS/LROC';
    lines.push(`Surface data profile: elevation ${elev}, albedo ${albedo}`);
    if (MOON_VISUAL_PROFILE.surfaceData?.maps?.relief) {
      lines.push(`Relief map: ${MOON_VISUAL_PROFILE.surfaceData.maps.relief}`);
    }
  } else if (body.type === 'moon') {
    const attribution = moonTexturePipeline?.attributionForBody(body);
    if (attribution) {
      lines.push(`Surface map source: ${attribution.provider}`);
      lines.push(`Surface map dataset: ${attribution.dataset}`);
    } else {
      lines.push('Surface map source: procedural fallback');
    }
  }
  if (body.id === 'earth' && earthSatelliteSystem) {
    const satStatus = earthSatelliteSystem.status();
    lines.push(`Tracked satellites: ${satStatus.satelliteCount}`);
    lines.push(`Satellite perturbation: ${satStatus.useJ2 ? 'J2 on' : 'J2 off'}`);
    lines.push(`Satellite render: ${satStatus.useInstancing ? 'instanced' : 'mesh per object'}`);
    if (satStatus.useWorkerPropagation) {
      lines.push(`Satellite propagation: ${satStatus.workerReady ? 'worker + interpolation' : 'worker initializing'}`);
    }
  } else if (isEarthMoonBody(body) && moonSatelliteSystem) {
    const satStatus = moonSatelliteSystem.status();
    lines.push(`Tracked satellites: ${satStatus.satelliteCount}`);
    lines.push(`Satellite perturbation: ${satStatus.useJ2 ? 'J2 on' : 'J2 off'}`);
  } else if (body.id === 'mars' && marsSatelliteSystem) {
    const satStatus = marsSatelliteSystem.status();
    lines.push(`Tracked satellites: ${satStatus.satelliteCount}`);
    lines.push(`Satellite perturbation: ${satStatus.useJ2 ? 'J2 on' : 'J2 off'}`);
  }

  dom.bodyInfo.textContent = lines.join('\n');
}

function updateLocalBodyInfoPanel(bodyId) {
  const body = localBodyById.get(bodyId);
  if (!body) {
    dom.bodyInfo.textContent = 'No local body selected.';
    return;
  }

  const parentName = body.parentId ? (localBodyById.get(body.parentId)?.name ?? body.parentId) : 'None';
  const lines = [
    `Name: ${body.name}`,
    `System: ${activeLocalSystem?.name ?? starSystemLabelForId(simState.selectedStarSystemId)}`,
    `Type: ${body.type}`,
    `Parent: ${parentName}`,
    `Radius: ${Number(body.radiusKm).toFixed(1)} km`
  ];

  if (Number.isFinite(body.massKg) && body.massKg > 0) {
    lines.push(`Mass: ${body.massKg.toExponential(3)} kg`);
  }

  if (body.orbit) {
    lines.push(`Semi-major axis: ${body.orbit.aAu.toFixed(5)} AU`);
    lines.push(`Orbital period: ${body.orbit.periodDays.toFixed(3)} days`);
    lines.push(`Eccentricity: ${body.orbit.e.toFixed(3)}`);
  } else {
    lines.push('Orbital period: N/A');
  }

  const sourceText = body.observedTexture
    ? `Observed map (${body.observedTexture})`
    : (
      body.textureTemplate
        ? `Procedural template (${body.textureTemplate})`
        : (body.type === 'moon' ? 'Procedural moon map' : 'Procedural template')
    );
  lines.push(`Surface source: ${sourceText}`);
  if (body.notes) {
    lines.push(`Notes: ${body.notes}`);
  }

  dom.bodyInfo.textContent = lines.join('\n');
}

function refillBodyList(searchValue = '') {
  const needle = searchValue.trim().toLowerCase();
  const bodies = selectedSystemBodySource();
  const filtered = bodies.filter((body) => body.name.toLowerCase().includes(needle));

  dom.bodyList.innerHTML = '';
  for (const body of filtered) {
    const option = document.createElement('option');
    option.value = body.id;
    option.textContent = labelForBody(body);
    dom.bodyList.appendChild(option);
  }

  if (simState.selectedStarSystemId === 'solar-system') {
    dom.statusBodies.textContent = `Bodies: ${catalog.bodies.length}`;
  } else {
    dom.statusBodies.textContent = `Bodies: ${bodies.length} (${starSystemLabelForId(simState.selectedStarSystemId)})`;
  }

  if (filtered.length > 0) {
    const preferredId = (
      (simState.followBodyId && filtered.some((body) => body.id === simState.followBodyId) && simState.followBodyId)
      || (simState.focusedBodyId && filtered.some((body) => body.id === simState.focusedBodyId) && simState.focusedBodyId)
      || filtered[0].id
    );
    dom.bodyList.value = preferredId;
    updateBodyInfoPanel(preferredId);
  } else {
    dom.bodyInfo.textContent = (simState.selectedStarSystemId !== 'solar-system' && bodies.length === 0)
      ? 'Select a mapped star system to load local bodies.'
      : 'No matching body.';
  }
}

function bodyListContainsOption(bodyId) {
  if (!dom.bodyList) return false;
  for (const option of dom.bodyList.options) {
    if (option.value === bodyId) return true;
  }
  return false;
}

function syncBodyListSelection(bodyId) {
  if (!dom.bodyList) return;
  if (typeof bodyId !== 'string' || !bodyId) return;
  if (!bodyListContainsOption(bodyId)) {
    if (dom.bodySearch) {
      dom.bodySearch.value = '';
    }
    refillBodyList('');
  }
  if (bodyListContainsOption(bodyId)) {
    dom.bodyList.value = bodyId;
  }
}

function selectBodyAndTrack(bodyId, { hardSnap = true, follow = true } = {}) {
  if (localBodyById.has(bodyId) && simState.systemViewMode === SYSTEM_VIEW_MODE.SYSTEM_LOCAL) {
    const localBody = localBodyById.get(bodyId);
    if (!localBody) return;
    if (follow) {
      simState.followBodyId = bodyId;
    }
    focusLocalBody(bodyId, hardSnap);
    updateBodyInfoPanel(bodyId);
    syncBodyListSelection(bodyId);
    if (follow) {
      dom.statusFocus.textContent = `Following: ${localBody.name}`;
    }
    return;
  }

  const resolvedBodyId = resolveBodyId(bodyId);
  const body = bodyById.get(resolvedBodyId);
  if (!body) return;

  if (follow) {
    simState.followBodyId = resolvedBodyId;
  }
  focusBody(resolvedBodyId, hardSnap);
  updateBodyInfoPanel(resolvedBodyId);
  syncBodyListSelection(resolvedBodyId);
  if (follow) {
    dom.statusFocus.textContent = `Following: ${body.name}`;
  }
}

function pickBodyAtClientPosition(clientX, clientY) {
  const rect = dom.canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;

  pickPointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pickPointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  pickRaycaster.setFromCamera(pickPointerNdc, camera);

  const pickTargets = [];
  const sourceMeshes = simState.systemViewMode === SYSTEM_VIEW_MODE.SYSTEM_LOCAL
    ? localBodyMeshById.values()
    : bodyMeshes.values();
  for (const mesh of sourceMeshes) {
    if (!mesh.visible) continue;
    pickTargets.push(mesh);
  }
  if (pickTargets.length === 0) return null;

  const intersections = pickRaycaster.intersectObjects(pickTargets, false);
  for (const hit of intersections) {
    const localBodyId = hit.object?.userData?.localBodyId;
    if (typeof localBodyId === 'string' && localBodyById.has(localBodyId)) {
      return localBodyId;
    }
    const bodyId = hit.object?.userData?.bodyId;
    if (typeof bodyId === 'string' && bodyById.has(bodyId)) {
      return bodyId;
    }
  }
  return null;
}

async function selectStarSystem(systemId, { hardSnap = true } = {}) {
  const targetSystemId = typeof systemId === 'string' && systemId.trim()
    ? systemId.trim()
    : 'solar-system';
  simState.selectedStarSystemId = targetSystemId;
  syncStarSystemSelection(targetSystemId);

  if (targetSystemId === 'solar-system') {
    if (simState.systemViewMode === SYSTEM_VIEW_MODE.SYSTEM_LOCAL) {
      returnToSolarSystemView({ hardSnap });
    } else {
      const focusId = bodyById.has(simState.focusedBodyId) ? simState.focusedBodyId : 'sun';
      syncBodyListSelection(focusId);
      updateBodyInfoPanel(focusId);
    }
    refillBodyList(dom.bodySearch?.value ?? '');
    return true;
  }

  const localSystemAlreadyActive = simState.systemViewMode === SYSTEM_VIEW_MODE.SYSTEM_LOCAL
    && simState.focusedNearbySystemId === targetSystemId
    && localBodyById.size > 0;
  if (localSystemAlreadyActive) {
    refillBodyList(dom.bodySearch?.value ?? '');
    syncBodyListSelection(simState.focusedBodyId);
    updateBodyInfoPanel(simState.focusedBodyId);
    return true;
  }

  if (!nearbySystemsById.has(targetSystemId)) {
    dom.bodyInfo.textContent = `${starSystemLabelForId(targetSystemId)}\nNearby-system entry unavailable in current catalog.`;
    refillBodyList(dom.bodySearch?.value ?? '');
    return false;
  }

  const loaded = await enterLocalSystemFromNearbySystem(targetSystemId);
  refillBodyList(dom.bodySearch?.value ?? '');
  return loaded;
}

// ── Planner + Route Modules ─────────────────────────────────────────────────

function clearRouteVisualization() {
  clearRouteVisualizationImpl({
    routeGroup,
    simState,
    statusRouteElement: dom.statusRoute
  });
}

function plotRoute(route) {
  plotRouteImpl({
    routeGroup,
    route,
    bodyById,
    simState,
    statusRouteElement: dom.statusRoute,
    buildTransferCurvePoints
  });
}

function updateRouteVisualization() {
  updateRouteVisualizationImpl({
    routeGroup,
    route: simState.route,
    bodyNodes,
    buildTransferCurvePoints,
    tempStart: tempVecA,
    tempEnd: tempVecB
  });
}

const plannerController = createPlannerController({
  dom,
  simState,
  model,
  plannerBodyIds: catalog.plannerBodyIds,
  bodyById,
  planners: {
    describeRoute,
    planInterplanetaryRoute,
    planMissionProfile,
    scanPorkchopWindow,
    solveLambertTransfer
  },
  routeApi: {
    plotRoute,
    clearRouteVisualization
  },
  dateUtils: {
    formatJulianAsDate,
    parseDateInputToJulian
  }
});

// ── Follow Target ────────────────────────────────────────────────────────────

function updateFollowTarget() {
  if (!simState.followBodyId) {
    return;
  }

  const node = simState.systemViewMode === SYSTEM_VIEW_MODE.SYSTEM_LOCAL
    ? localBodyNodeById.get(simState.followBodyId)
    : bodyNodes.get(simState.followBodyId);
  if (!node) return;

  node.getWorldPosition(tempVecA);

  // Preserve the current camera-to-target offset (viewing angle + distance)
  const offset = tempVecB.copy(camera.position).sub(controls.target);

  // Move both target and camera in lockstep so the view stays constant
  controls.target.copy(tempVecA);
  camera.position.copy(tempVecA).add(offset);
}

// ── UI Event Setup ───────────────────────────────────────────────────────────

const timeController = createTimeController({
  dom,
  simState,
  minTimeScale: MIN_TIME_SCALE_DAYS_PER_SEC,
  maxTimeScale: MAX_TIME_SCALE_DAYS_PER_SEC,
  currentJulianDate,
  formatJulianAsDate
});

const quickViewPresets = [
  { element: dom.focusEarthAtmo, bodyId: 'earth', altitudeKm: EARTH_ATMOSPHERE_ALTITUDE_KM },
  { element: dom.focusEarthLeo, bodyId: 'earth', altitudeKm: EARTH_LEO_ALTITUDE_KM },
  { element: dom.focusEarthGeo, bodyId: 'earth', altitudeKm: EARTH_GEO_ALTITUDE_KM },
  { element: dom.focusMoonSkim, bodyId: CANONICAL_BODY_IDS.moon, altitudeKm: MOON_SKIM_ALTITUDE_KM },
  { element: dom.focusMoonLlo, bodyId: CANONICAL_BODY_IDS.moon, altitudeKm: MOON_LLO_ALTITUDE_KM },
  { element: dom.focusMoonNrho, bodyId: CANONICAL_BODY_IDS.moon, altitudeKm: MOON_NRHO_ALTITUDE_KM },
  { element: dom.focusMarsAtmo, bodyId: 'mars', altitudeKm: MARS_ATMOSPHERE_ALTITUDE_KM },
  { element: dom.focusMarsSkim, bodyId: 'mars', altitudeKm: MARS_SKIM_ALTITUDE_KM },
  { element: dom.focusMarsLmo, bodyId: 'mars', altitudeKm: MARS_LMO_ALTITUDE_KM },
  { element: dom.focusMarsAreo, bodyId: 'mars', altitudeKm: MARS_AREOSTATIONARY_ALTITUDE_KM }
];

setupInputHandlers({
  timeController,
  plannerController,
  dom,
  simState,
  controls,
  quickViewPresets,
  handlers: {
    systemViewModeLocal: SYSTEM_VIEW_MODE.SYSTEM_LOCAL,
    sendServerMessage: (msg) => simClient.send(msg),
    updateZoomMetricsUI,
    focusBodyAtAltitude,
    applyRenderVisibility,
    refillBodyList,
    selectStarSystem,
    setHoveredNearbySystem,
    updateNearbySystemHoverAtClientPosition,
    pickBodyAtClientPosition,
    selectBodyAndTrack,
    pickNearbySystemAtClientPosition,
    bodyDisplayName,
    updateEarthOrbitGuidesVisibility,
    returnToSolarSystemView,
    connectSimulation: (backend) => simClient.connect(backend),
    disconnectSimulation: () => simClient.disconnect(),
    applyScaleMode,
    updateBodyInfoPanel
  }
});

// ── Initialize ───────────────────────────────────────────────────────────────

plannerController.fillPlannerSelects();
refreshStarSystemListOptions();
syncStarSystemSelection('solar-system');
refillBodyList();
model.update(simState.julianDate);
updateSceneBodies();
updateAsteroidBelt(simState.julianDate);
applyRenderVisibility();
updateLocatorOverlays();
updateZoomMetricsUI();

dom.plannerOutput.textContent = 'No plotted route.';

// ── Animation Loop ───────────────────────────────────────────────────────────

const animationLoop = createAnimationLoop({
  simState,
  simClient,
  systemViewModeLocal: SYSTEM_VIEW_MODE.SYSTEM_LOCAL,
  applyServerState,
  applyServerKuiper,
  timeController,
  model,
  updateSceneBodies,
  updateLocalSystemScene,
  updateBodyRotations,
  updateSunDynamics,
  updateEarthWeather,
  updateMarsWeather,
  maybeRefreshSolarPhysics,
  maybeRefreshEarthCloudCoverage,
  maybeRefreshMarsCloudCoverage,
  updateEarthSurfaceLod,
  updateMoonEarthshine,
  updateMarsSeasonalAppearance,
  getSatelliteSystems: () => [earthSatelliteSystem, moonSatelliteSystem, marsSatelliteSystem],
  camera,
  renderer,
  updateAsteroidBelt,
  updateRouteVisualization,
  updateAsteroidDetail,
  updateKuiperDetail,
  updateOortVisibility: () => {
    oortCloud.visible = Boolean(dom.toggleOort?.checked);
  },
  updateFollowTarget,
  bodyDisplayName,
  dom,
  backgroundStars,
  surveyMilkySphere,
  updateNearbySystemsPositions,
  syncSystemViewModeWithCameraRange,
  applyNearbySystemsVisibility,
  updateCameraTransition,
  updateAdaptiveZoomBehavior,
  controls,
  resizeRenderer,
  updateCameraClipPlanes,
  updateLocatorOverlays,
  updateGravityVectors,
  updateZoomMetricsUI,
  scene
});

focusBody('sun', true);
updateCameraClipPlanes();
updateZoomMetricsUI();
maybeRefreshEarthCloudCoverage(Date.now(), true);
maybeRefreshMarsCloudCoverage(Date.now(), true);
maybeRefreshSolarPhysics(Date.now(), true);
animationLoop.start();
