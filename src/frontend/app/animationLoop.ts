// @ts-nocheck
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
}) {
  let previousTimestamp = performance.now();

  function animate(timestamp) {
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
