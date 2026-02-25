// @ts-nocheck
function formatAu(au) {
  if (au >= 1_000) return `${au.toFixed(1)} AU`;
  if (au >= 10) return `${au.toFixed(2)} AU`;
  if (au >= 1) return `${au.toFixed(3)} AU`;
  if (au >= 0.01) return `${au.toFixed(4)} AU`;
  return `${au.toFixed(6)} AU`;
}

function formatDistanceScale(au, realisticMode, { AU_PER_LIGHT_YEAR, AU_KM }) {
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

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

export function createCameraController({
  camera,
  controls,
  dom,
  simState,
  resolveBodyId,
  bodyById,
  bodyNodes,
  adaptiveZoomProfiles,
  bodyDistanceAuAtAltitude,
  distanceConstants,
  systemViewMode,
  interstellarMarkerVisibilityMinRangeAu,
  interstellarMaxDistanceAu,
  getInterstellarState,
  isCameraTransitionActive,
  tempVector
}) {
  function updateZoomMetricsUI() {
    const rangeAu = camera.position.distanceTo(controls.target);
    const halfFovRad = (camera.fov * Math.PI) / 360;
    const viewHeightAu = 2 * rangeAu * Math.tan(halfFovRad);
    const viewWidthAu = viewHeightAu * camera.aspect;

    const rangeText = formatDistanceScale(rangeAu, simState.useRealisticScale, distanceConstants);
    const widthText = formatDistanceScale(viewWidthAu, simState.useRealisticScale, distanceConstants);
    const heightText = formatDistanceScale(viewHeightAu, simState.useRealisticScale, distanceConstants);
    const baseZoomText = `x${simState.zoomSensitivity.toFixed(2)}`;
    const effectiveZoom = Number.isFinite(controls.zoomSpeed) ? controls.zoomSpeed : simState.zoomSensitivity;
    const zoomText = `x${effectiveZoom.toFixed(2)}`;

    if (dom.zoomSensitivityValue) dom.zoomSensitivityValue.textContent = baseZoomText;
    if (dom.zoomDistanceValue) dom.zoomDistanceValue.textContent = `Range: ${rangeText}`;
    if (dom.viewScaleValue) dom.viewScaleValue.textContent = `View span: ${widthText} x ${heightText}`;
    if (dom.statusZoom) dom.statusZoom.textContent = `Zoom: ${zoomText}`;
    if (dom.statusScale) dom.statusScale.textContent = `Scale: ${widthText} x ${heightText}`;
  }

  function updateAdaptiveZoomBehavior() {
    const baseZoom = Math.max(0.01, simState.zoomSensitivity);
    controls.zoomSpeed = baseZoom;

    if (simState.systemViewMode === systemViewMode.SYSTEM_LOCAL) return;
    if (!simState.useRealisticScale) return;

    const activeBodyId = resolveBodyId(simState.followBodyId ?? simState.focusedBodyId);
    if (!activeBodyId) return;

    const body = bodyById.get(activeBodyId);
    const profile = adaptiveZoomProfiles[activeBodyId];
    if (!body || !profile) return;

    const node = bodyNodes.get(activeBodyId);
    if (!node) return;

    node.getWorldPosition(tempVector);
    const distanceToBodyAu = camera.position.distanceTo(tempVector);
    const minCenterDistanceAu = bodyDistanceAuAtAltitude(body, profile.minClearanceKm);
    const dampingBandAu = Math.max(1e-9, profile.dampingBandKm / distanceConstants.AU_KM);
    const normalized = clamp01((distanceToBodyAu - minCenterDistanceAu) / dampingBandAu);
    const eased = Math.pow(normalized, 0.72);
    const speedFactor = profile.minSpeedFactor + (1 - profile.minSpeedFactor) * eased;
    controls.zoomSpeed = baseZoom * speedFactor;

    if (controls.minDistance > minCenterDistanceAu) {
      controls.minDistance = minCenterDistanceAu;
    }
  }

  function updateCameraClipPlanes() {
    const rangeAu = Math.max(1e-9, camera.position.distanceTo(controls.target));
    let near = 0.0001;
    let far = 20_000;

    const interstellarState = getInterstellarState();
    const interstellarModeActive = simState.systemViewMode !== systemViewMode.SYSTEM_LOCAL
      && Boolean(dom.toggleNearbySystems?.checked)
      && interstellarState.nearbySystemsLoaded;

    if (simState.useRealisticScale && rangeAu < 0.08) {
      near = Math.max(5e-9, Math.min(5e-5, rangeAu * 0.00035));
      far = Math.max(0.45, Math.min(120, rangeAu * 4_200));
    }

    if (interstellarModeActive && rangeAu >= interstellarMarkerVisibilityMinRangeAu) {
      const farTarget = Math.max(80_000, Math.min(interstellarMaxDistanceAu, rangeAu * 6));
      const catalogFar = interstellarState.nearbySystemsMaxDistanceAu > 0
        ? interstellarState.nearbySystemsMaxDistanceAu * 1.15
        : farTarget;
      far = Math.max(
        far,
        farTarget,
        Math.min(interstellarMaxDistanceAu, catalogFar),
        rangeAu * 1.05
      );
      near = Math.max(0.0001, Math.min(1.0, rangeAu * 0.0000015));
    }

    if (simState.systemViewMode === systemViewMode.SYSTEM_LOCAL || isCameraTransitionActive()) {
      far = Math.max(far, Math.min(interstellarMaxDistanceAu, rangeAu * 1.6 + 400));
      near = Math.max(1e-5, Math.min(0.6, rangeAu * 0.000001));
    }

    const nearDelta = Math.abs(camera.near - near);
    const farDelta = Math.abs(camera.far - far);
    if (nearDelta > near * 0.02 || farDelta > far * 0.02) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }

  return {
    updateZoomMetricsUI,
    updateAdaptiveZoomBehavior,
    updateCameraClipPlanes
  };
}
