import { PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import type { SimulationStateStore } from './stateStore';
import type { SimulationClient, ServerStateUpdateMessage } from './simulationClient';
import type { SolarSystemModel } from '../../sim/solarSystemModel';

interface AnimationLoopControls {
  update: () => void;
}

interface SatelliteSystemLike {
  update: (julianDate: number, viewState: { camera: PerspectiveCamera; viewportHeight: number }) => void;
}

interface AnimationDomLike {
  statusFocus: { textContent: string | null };
}

interface PositionedObject {
  position: Vector3;
}

interface AnimationTimeController {
  advanceLocalTime: (deltaSeconds: number) => void;
  updateHud: () => void;
}

interface CreateAnimationLoopArgs {
  simState: SimulationStateStore;
  simClient: SimulationClient;
  systemViewModeLocal: string;
  applyServerState: (state: ServerStateUpdateMessage) => void;
  applyServerKuiper: (points: number[][]) => void;
  timeController: AnimationTimeController;
  model: SolarSystemModel;
  updateSceneBodies: () => void;
  updateLocalSystemScene: (julianDate: number) => void;
  updateBodyRotations: (julianDate: number) => void;
  updateSunDynamics: (julianDate: number, realtimeSeconds: number) => void;
  updateEarthWeather: (julianDate: number) => void;
  updateMarsWeather: (julianDate: number) => void;
  maybeRefreshSolarPhysics: (nowMs: number) => void;
  maybeRefreshEarthCloudCoverage: (nowMs: number) => void;
  maybeRefreshMarsCloudCoverage: (nowMs: number) => void;
  updateEarthSurfaceLod: () => void;
  updateMoonEarthshine: () => void;
  updateMarsSeasonalAppearance: (julianDate: number) => void;
  getSatelliteSystems: () => Array<SatelliteSystemLike | null | undefined>;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  updateAsteroidBelt: (julianDate: number) => void;
  updateRouteVisualization: () => void;
  updateAsteroidDetail: (julianDate: number, deltaSimDays: number) => void;
  updateKuiperDetail: () => void;
  updateOortVisibility: () => void;
  updateFollowTarget: () => void;
  bodyDisplayName: (bodyId: string) => string | null | undefined;
  dom: AnimationDomLike;
  backgroundStars: PositionedObject;
  surveyMilkySphere: PositionedObject;
  updateNearbySystemsPositions: (julianDate: number) => void;
  syncSystemViewModeWithCameraRange: () => void;
  applyNearbySystemsVisibility: () => void;
  updateCameraTransition: (deltaSeconds: number) => void;
  updateAdaptiveZoomBehavior: () => void;
  controls: AnimationLoopControls;
  resizeRenderer: () => void;
  updateCameraClipPlanes: () => void;
  updateLocatorOverlays: () => void;
  updateGravityVectors: () => void;
  updateZoomMetricsUI: () => void;
  scene: Scene;
  requestAnimationFrameImpl?: typeof requestAnimationFrame;
}

export function createAnimationLoop({
  simState,
  simClient,
  systemViewModeLocal,
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
  getSatelliteSystems,
  camera,
  renderer,
  updateAsteroidBelt,
  updateRouteVisualization,
  updateAsteroidDetail,
  updateKuiperDetail,
  updateOortVisibility,
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
  scene,
  requestAnimationFrameImpl = requestAnimationFrame
}: CreateAnimationLoopArgs) {
  let previousTimestamp = performance.now();

  function animate(timestamp: number): void {
    const deltaSeconds = Math.max(0, (timestamp - previousTimestamp) / 1_000);
    previousTimestamp = timestamp;
    const previousJd = simState.julianDate;

    if (simState.serverConnected && simState.timeScaleDirty) {
      simClient.send({ type: 'set_time_scale', days_per_sec: simState.timeScaleDaysPerSec });
      simState.timeScaleDirty = false;
    }

    if (simState.serverConnected && simClient.latestState) {
      applyServerState(simClient.latestState);

      if (simClient.latestKuiper) {
        applyServerKuiper(simClient.latestKuiper);
      }
    } else {
      timeController.advanceLocalTime(deltaSeconds);
      model.update(simState.julianDate);
      updateSceneBodies();
    }
    const deltaSimDays = simState.julianDate - previousJd;

    if (simState.systemViewMode === systemViewModeLocal) {
      updateLocalSystemScene(simState.julianDate);
    }

    updateBodyRotations(simState.julianDate);
    updateSunDynamics(simState.julianDate, timestamp * 0.001);
    updateEarthWeather(simState.julianDate);
    updateMarsWeather(simState.julianDate);

    const nowMs = Date.now();
    maybeRefreshSolarPhysics(nowMs);
    maybeRefreshEarthCloudCoverage(nowMs);
    maybeRefreshMarsCloudCoverage(nowMs);

    updateEarthSurfaceLod();
    updateMoonEarthshine();
    updateMarsSeasonalAppearance(simState.julianDate);

    const satelliteViewState = {
      camera,
      viewportHeight: Math.max(1, renderer.domElement.clientHeight || window.innerHeight || 1)
    };
    for (const system of getSatelliteSystems()) {
      if (!system) continue;
      system.update(simState.julianDate, satelliteViewState);
    }

    updateAsteroidBelt(simState.julianDate);
    updateRouteVisualization();
    updateAsteroidDetail(simState.julianDate, deltaSimDays);
    updateKuiperDetail();
    updateOortVisibility();

    updateFollowTarget();

    if (simState.followBodyId) {
      dom.statusFocus.textContent = `Following: ${bodyDisplayName(simState.followBodyId)}`;
    }

    backgroundStars.position.copy(camera.position);
    surveyMilkySphere.position.copy(camera.position);
    updateNearbySystemsPositions(simState.julianDate);
    syncSystemViewModeWithCameraRange();
    applyNearbySystemsVisibility();

    updateCameraTransition(deltaSeconds);
    updateAdaptiveZoomBehavior();
    controls.update();
    resizeRenderer();
    updateCameraClipPlanes();
    updateLocatorOverlays();
    updateGravityVectors();
    updateZoomMetricsUI();
    renderer.render(scene, camera);

    timeController.updateHud();

    requestAnimationFrameImpl(animate);
  }

  return {
    start() {
      previousTimestamp = performance.now();
      requestAnimationFrameImpl(animate);
    }
  };
}
