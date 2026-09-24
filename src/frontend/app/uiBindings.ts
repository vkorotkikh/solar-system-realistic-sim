import type { SimulationStateStore } from './stateStore';

interface ControlsLike {
  zoomSpeed: number;
}

interface InteractiveElementLike {
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  textContent?: string | null;
}

interface ValueElementLike extends InteractiveElementLike {
  value: string;
}

interface ToggleElementLike extends ValueElementLike {
  checked: boolean;
}

interface UiDomBindings {
  togglePlay: InteractiveElementLike;
  zoomSensitivity?: ValueElementLike | null;
  toggleOrbits: ToggleElementLike;
  toggleLabels: ToggleElementLike;
  toggleLocators: ToggleElementLike;
  toggleGravityVectors: ToggleElementLike;
  toggleMoons: ToggleElementLike;
  toggleAsteroids: ToggleElementLike;
  toggleKuiper: ToggleElementLike;
  toggleOort: ToggleElementLike;
  toggleEnhancedMilky: ToggleElementLike;
  toggleSurveyMilky: ToggleElementLike;
  toggleNearbySystems: ToggleElementLike;
  toggleEarthSatellites: ToggleElementLike;
  toggleSatelliteJ2: ToggleElementLike;
  bodySearch: ValueElementLike;
  starSystemList?: ValueElementLike | null;
  canvas: InteractiveElementLike;
  bodyList: ValueElementLike;
  focusBody: InteractiveElementLike;
  followBody: InteractiveElementLike;
  clearFollow: InteractiveElementLike;
  statusFocus: { textContent: string | null };
  returnSolarSystem?: InteractiveElementLike | null;
  simConnect: InteractiveElementLike;
  simBackend: ValueElementLike;
  simStatus: { textContent: string | null };
  toggleRealisticScale?: ToggleElementLike | null;
}

interface QuickViewPreset {
  element?: InteractiveElementLike | null;
  bodyId: string;
  altitudeKm: number;
}

interface UiBindingHandlers {
  sendServerMessage: (message: Record<string, unknown>) => void;
  updateZoomMetricsUI: () => void;
  focusBodyAtAltitude: (bodyId: string, altitudeKm: number, options: { follow: boolean }) => void;
  applyRenderVisibility: () => void;
  refillBodyList: (query: string) => void;
  selectStarSystem: (systemId: string, options: { hardSnap: boolean }) => Promise<void> | void;
  systemViewModeLocal: string;
  setHoveredNearbySystem: (systemId: string | null) => void;
  updateNearbySystemHoverAtClientPosition: (clientX: number, clientY: number) => void;
  pickBodyAtClientPosition: (clientX: number, clientY: number) => string | null;
  selectBodyAndTrack: (bodyId: string, options: { hardSnap: boolean; follow: boolean }) => void;
  pickNearbySystemAtClientPosition: (clientX: number, clientY: number) => { id: string } | null;
  updateEarthOrbitGuidesVisibility: () => void;
  returnToSolarSystemView: (options: { hardSnap: boolean }) => void;
  disconnectSimulation: () => void;
  connectSimulation: (backend: string) => void;
  applyScaleMode: () => void;
  updateBodyInfoPanel: (bodyId: string) => void;
  bodyDisplayName: (bodyId: string) => string | null | undefined;
}

interface SetupUiBindingsArgs {
  dom: UiDomBindings;
  simState: SimulationStateStore;
  controls: ControlsLike;
  quickViewPresets: QuickViewPreset[];
  handlers: UiBindingHandlers;
}

export function setupUiBindings({
  dom,
  simState,
  controls,
  quickViewPresets,
  handlers
}: SetupUiBindingsArgs) {
  dom.togglePlay.addEventListener('click', () => {
    simState.paused = !simState.paused;
    dom.togglePlay.textContent = simState.paused ? 'Resume' : 'Pause';
    if (simState.serverConnected) {
      handlers.sendServerMessage({ type: simState.paused ? 'pause' : 'resume' });
    }
  });

  if (dom.zoomSensitivity) {
    const zoomSensitivity = dom.zoomSensitivity;
    zoomSensitivity.value = `${simState.zoomSensitivity}`;
    zoomSensitivity.addEventListener('input', () => {
      simState.zoomSensitivity = Number(zoomSensitivity.value);
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
    const systemId = dom.starSystemList?.value || 'solar-system';
    void handlers.selectStarSystem(systemId, { hardSnap: true });
  });

  let dragPickPointerId: number | null = null;
  let dragPickStartX = 0;
  let dragPickStartY = 0;
  let dragPickMoved = false;
  const dragPickThresholdPx = 7;

  dom.canvas.addEventListener('pointerdown', (event: Event) => {
    const pointerEvent = event as PointerEvent;
    if (pointerEvent.button !== 0) return;
    dragPickPointerId = pointerEvent.pointerId;
    dragPickStartX = pointerEvent.clientX;
    dragPickStartY = pointerEvent.clientY;
    dragPickMoved = false;
  });

  dom.canvas.addEventListener('pointermove', (event: Event) => {
    const pointerEvent = event as PointerEvent;
    if (dragPickPointerId === pointerEvent.pointerId) {
      const dx = pointerEvent.clientX - dragPickStartX;
      const dy = pointerEvent.clientY - dragPickStartY;
      if (dx * dx + dy * dy > dragPickThresholdPx * dragPickThresholdPx) {
        dragPickMoved = true;
      }
    }

    if (simState.systemViewMode === handlers.systemViewModeLocal) {
      handlers.setHoveredNearbySystem(null);
    } else {
      handlers.updateNearbySystemHoverAtClientPosition(pointerEvent.clientX, pointerEvent.clientY);
    }
  });

  dom.canvas.addEventListener('pointerup', (event: Event) => {
    const pointerEvent = event as PointerEvent;
    if (dragPickPointerId !== pointerEvent.pointerId) return;
    const shouldPick = !dragPickMoved && pointerEvent.button === 0;
    dragPickPointerId = null;
    dragPickMoved = false;
    if (!shouldPick) return;

    const pickedBodyId = handlers.pickBodyAtClientPosition(pointerEvent.clientX, pointerEvent.clientY);
    if (pickedBodyId) {
      handlers.selectBodyAndTrack(pickedBodyId, { hardSnap: true, follow: true });
      return;
    }

    if (simState.systemViewMode !== handlers.systemViewModeLocal) {
      const pickedNearbySystem = handlers.pickNearbySystemAtClientPosition(pointerEvent.clientX, pointerEvent.clientY);
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
    const toggleRealisticScale = dom.toggleRealisticScale;
    toggleRealisticScale.addEventListener('change', () => {
      simState.useRealisticScale = toggleRealisticScale.checked;
      handlers.applyScaleMode();
      if (simState.focusedBodyId) {
        handlers.updateBodyInfoPanel(simState.focusedBodyId);
      }
    });
  }
}
