export function setupUiBindings({
  dom,
  simState,
  controls,
  quickViewPresets,
  handlers
}) {
  dom.togglePlay.addEventListener('click', () => {
    simState.paused = !simState.paused;
    dom.togglePlay.textContent = simState.paused ? 'Resume' : 'Pause';
    if (simState.serverConnected) {
      handlers.sendServerMessage({ type: simState.paused ? 'pause' : 'resume' });
    }
  });

  if (dom.zoomSensitivity) {
    dom.zoomSensitivity.value = `${simState.zoomSensitivity}`;
    dom.zoomSensitivity.addEventListener('input', () => {
      simState.zoomSensitivity = Number(dom.zoomSensitivity.value);
      if (!Number.isFinite(simState.zoomSensitivity)) {
        simState.zoomSensitivity = 1.0;
      }
      controls.zoomSpeed = simState.zoomSensitivity;
      handlers.updateZoomMetricsUI();
    });
  }

  for (const preset of quickViewPresets) {
    preset.element?.addEventListener('click', () => {
      handlers.focusBodyAtAltitude(preset.bodyId, preset.altitudeKm, { follow: true });
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
    dom.toggleSurveyMilky,
    dom.toggleNearbySystems,
    dom.toggleEarthSatellites,
    dom.toggleSatelliteJ2
  ]) {
    toggle.addEventListener('change', handlers.applyRenderVisibility);
  }

  dom.bodySearch.addEventListener('input', () => {
    handlers.refillBodyList(dom.bodySearch.value);
  });

  dom.starSystemList?.addEventListener('change', () => {
    const systemId = dom.starSystemList.value || 'solar-system';
    void handlers.selectStarSystem(systemId, { hardSnap: true });
  });

  let dragPickPointerId = null;
  let dragPickStartX = 0;
  let dragPickStartY = 0;
  let dragPickMoved = false;
  const dragPickThresholdPx = 7;

  dom.canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragPickPointerId = event.pointerId;
    dragPickStartX = event.clientX;
    dragPickStartY = event.clientY;
    dragPickMoved = false;
  });

  dom.canvas.addEventListener('pointermove', (event) => {
    if (dragPickPointerId === event.pointerId) {
      const dx = event.clientX - dragPickStartX;
      const dy = event.clientY - dragPickStartY;
      if (dx * dx + dy * dy > dragPickThresholdPx * dragPickThresholdPx) {
        dragPickMoved = true;
      }
    }

    if (simState.systemViewMode === handlers.systemViewModeLocal) {
      handlers.setHoveredNearbySystem(null);
    } else {
      handlers.updateNearbySystemHoverAtClientPosition(event.clientX, event.clientY);
    }
  });

  dom.canvas.addEventListener('pointerup', (event) => {
    if (dragPickPointerId !== event.pointerId) return;
    const shouldPick = !dragPickMoved && event.button === 0;
    dragPickPointerId = null;
    dragPickMoved = false;
    if (!shouldPick) return;

    const pickedBodyId = handlers.pickBodyAtClientPosition(event.clientX, event.clientY);
    if (pickedBodyId) {
      handlers.selectBodyAndTrack(pickedBodyId, { hardSnap: true, follow: true });
      return;
    }

    if (simState.systemViewMode !== handlers.systemViewModeLocal) {
      const pickedNearbySystem = handlers.pickNearbySystemAtClientPosition(event.clientX, event.clientY);
      if (pickedNearbySystem) {
        void handlers.selectStarSystem(pickedNearbySystem.id, { hardSnap: true });
      }
    }
  });

  dom.canvas.addEventListener('pointercancel', () => {
    dragPickPointerId = null;
    dragPickMoved = false;
    handlers.setHoveredNearbySystem(null);
  });

  dom.canvas.addEventListener('pointerleave', () => {
    handlers.setHoveredNearbySystem(null);
  });

  dom.bodyList.addEventListener('change', () => {
    if (!dom.bodyList.value) return;
    handlers.selectBodyAndTrack(dom.bodyList.value, { hardSnap: true, follow: true });
  });

  dom.focusBody.addEventListener('click', () => {
    const id = dom.bodyList.value;
    if (!id) return;
    handlers.selectBodyAndTrack(id, { hardSnap: true, follow: true });
  });

  dom.followBody.addEventListener('click', () => {
    const id = dom.bodyList.value;
    if (!id) return;
    handlers.selectBodyAndTrack(id, { hardSnap: true, follow: true });
  });

  dom.clearFollow.addEventListener('click', () => {
    simState.followBodyId = null;
    dom.statusFocus.textContent = `Focus: ${handlers.bodyDisplayName(simState.focusedBodyId) ?? 'None'}`;
    handlers.updateEarthOrbitGuidesVisibility();
  });

  dom.returnSolarSystem?.addEventListener('click', () => {
    handlers.returnToSolarSystemView({ hardSnap: true });
  });

  dom.simConnect.addEventListener('click', () => {
    if (simState.serverConnected) {
      handlers.disconnectSimulation();
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
      handlers.connectSimulation(backend);
    }
  });

  dom.simBackend.addEventListener('change', () => {
    if (dom.simBackend.value === 'local' && simState.serverConnected) {
      handlers.disconnectSimulation();
      simState.backend = 'local';
      dom.simStatus.textContent = 'Local';
    }
  });

  if (dom.toggleRealisticScale) {
    dom.toggleRealisticScale.addEventListener('change', () => {
      simState.useRealisticScale = dom.toggleRealisticScale.checked;
      handlers.applyScaleMode();
      if (simState.focusedBodyId) {
        handlers.updateBodyInfoPanel(simState.focusedBodyId);
      }
    });
  }
}
