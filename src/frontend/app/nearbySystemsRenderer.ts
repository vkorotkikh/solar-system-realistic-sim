// @ts-nocheck
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  Raycaster,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3
} from 'three';

export function createNearbySystemsRenderer({
  dom,
  camera,
  controls,
  simState,
  state,
  nearbySystemsGroup,
  constants,
  createInterstellarLabelSprite,
  julianDateToJulianYear,
  equatorialDegToCartesian,
  backendBaseUrl,
  setSystemViewMode,
  refreshStarSystemListOptions
}) {
  const {
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
  } = constants;

  const pickRaycaster = new Raycaster();
  const pickPointerNdc = new Vector2();
  const tempProjected = new Vector3();
  const tempDesiredCamera = new Vector3();

  function createNearbySystemHaloSprite({
    innerColor = 'rgba(103, 232, 255, 0.64)',
    midColor = 'rgba(66, 156, 255, 0.28)',
    ringColor = 'rgba(101, 223, 255, 0.84)'
  } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const center = canvas.width * 0.5;
    const radius = canvas.width * 0.46;

    const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
    gradient.addColorStop(0, innerColor);
    gradient.addColorStop(0.55, midColor);
    gradient.addColorStop(1, 'rgba(12, 42, 88, 0.0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 6;
    ctx.strokeStyle = ringColor;
    ctx.beginPath();
    ctx.arc(center, center, radius * 0.78, 0, Math.PI * 2);
    ctx.stroke();

    const texture = new CanvasTexture(canvas);
    const material = new SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending
    });
    const sprite = new Sprite(material);
    sprite.visible = false;
    sprite.renderOrder = 13;
    return sprite;
  }

  function normalizeNearbySystemEntry(entry, fallbackRank) {
    const sysId = Number(entry?.sys_id);
    const rank = Number(entry?.rank);
    const raDeg = Number(entry?.ra_deg);
    const decDeg = Number(entry?.dec_deg);
    const parallaxMas = Number(entry?.parallax_mas);
    if (!Number.isFinite(sysId) || !Number.isFinite(raDeg) || !Number.isFinite(decDeg) || !Number.isFinite(parallaxMas) || parallaxMas <= 0) {
      return null;
    }

    const distanceLyRaw = Number(entry?.distance_ly);
    const distancePcRaw = Number(entry?.distance_pc);
    const distancePc = Number.isFinite(distancePcRaw) && distancePcRaw > 0 ? distancePcRaw : 1000 / parallaxMas;
    const distanceLy = Number.isFinite(distanceLyRaw) && distanceLyRaw > 0 ? distanceLyRaw : distancePc * 3.26156;
    const distanceAu = distancePc * PC_TO_AU;
    if (!Number.isFinite(distanceAu) || distanceAu <= 0) {
      return null;
    }

    const pmRaMasYrRaw = Number(entry?.pm_ra_mas_per_yr);
    const pmDecMasYrRaw = Number(entry?.pm_dec_mas_per_yr);
    const epochYearRaw = Number(entry?.epoch_year);
    const gmagRaw = Number(entry?.gmag);
    const rvKmSRaw = Number(entry?.rv_km_s);
    const nameOverride = NEARBY_SYSTEM_NAME_OVERRIDES_BY_SYS_ID[sysId];
    const name = (nameOverride ?? entry?.catalog_name ?? entry?.identifier ?? `System ${sysId}`).toString().trim();
    const identifier = (entry?.identifier ?? name).toString().trim();
    const id = `nearby-system-${sysId}`;

    return {
      id,
      sysId,
      rank: Number.isFinite(rank) ? rank : fallbackRank,
      name: name || identifier || `System ${sysId}`,
      identifier: identifier || name || `System ${sysId}`,
      objType: (entry?.obj_type ?? '').toString().trim(),
      spectralType: (entry?.spectral_type ?? '').toString().trim(),
      distanceLy,
      distancePc,
      distanceAu,
      raDeg,
      decDeg,
      parallaxMas,
      epochYear: Number.isFinite(epochYearRaw) ? epochYearRaw : 2016.0,
      pmRaMasYr: Number.isFinite(pmRaMasYrRaw) ? pmRaMasYrRaw : 0,
      pmDecMasYr: Number.isFinite(pmDecMasYrRaw) ? pmDecMasYrRaw : 0,
      rvKmS: Number.isFinite(rvKmSRaw) ? rvKmSRaw : null,
      gmag: Number.isFinite(gmagRaw) ? gmagRaw : null,
      localManifestPath: LOCAL_SYSTEM_MANIFEST_BY_NEARBY_ID[id] ?? null,
      worldPosition: new Vector3()
    };
  }

  function setHoveredNearbySystem(system) {
    const hoveredId = system?.id ?? null;
    simState.hoveredNearbySystemId = hoveredId;
    if (dom.canvas) {
      dom.canvas.style.cursor = hoveredId ? 'pointer' : '';
    }
  }

  function clearNearbySystemsLayer() {
    nearbySystemsGroup.clear();
    state.nearbySystemsPoints = null;
    state.nearbySystemLabelEntries.length = 0;
    state.nearbySystemCloseHaloEntries.length = 0;
    state.nearbySystemHoverHalo = null;
    state.nearbySystemsById.clear();
    state.nearbySystemsCatalog = [];
    state.nearbySystemsMaxDistanceAu = 0;
    state.nearbySystemsLoaded = false;
    state.nearbySystemsLastUpdateJd = Number.NaN;
    simState.hoveredNearbySystemId = null;
    if (dom.canvas) {
      dom.canvas.style.cursor = '';
    }
  }

  function nearbySystemRaDecAtJulianDate(system, julianDate) {
    const dtYears = julianDateToJulianYear(julianDate) - system.epochYear;
    const cosDec = Math.max(1e-6, Math.abs(Math.cos(system.decDeg * DEG_TO_RAD)));
    const deltaRaDeg = (system.pmRaMasYr * dtYears) / (3_600_000 * cosDec);
    const deltaDecDeg = (system.pmDecMasYr * dtYears) / 3_600_000;
    const ra = ((system.raDeg + deltaRaDeg) % 360 + 360) % 360;
    const dec = Math.max(-89.999999, Math.min(89.999999, system.decDeg + deltaDecDeg));
    return [ra, dec];
  }

  function nearbySystemWorldPosition(system, julianDate, outVector) {
    const [raDeg, decDeg] = nearbySystemRaDecAtJulianDate(system, julianDate);
    const [x, y, z] = equatorialDegToCartesian(raDeg, decDeg, system.distanceAu);
    outVector.set(x, y, z);
    return outVector;
  }

  function nearbySystemPickRadiusPx(system) {
    const brightBoost = Number.isFinite(system?.gmag)
      ? Math.max(0, (7 - system.gmag) * 1.8)
      : 2.0;
    const distanceBoost = Number.isFinite(system?.distanceLy)
      ? Math.max(0, (12 - system.distanceLy) * 1.25)
      : 0;
    return Math.max(
      INTERSTELLAR_PICK_RADIUS_PX_MIN,
      Math.min(INTERSTELLAR_PICK_RADIUS_PX_MAX, 22 + brightBoost + distanceBoost)
    );
  }

  function projectNearbySystemToScreen(system, rect, outVector) {
    outVector.copy(system.worldPosition).project(camera);
    if (outVector.z < -1 || outVector.z > 1) return null;
    return {
      x: ((outVector.x + 1) * 0.5) * rect.width + rect.left,
      y: ((-outVector.y + 1) * 0.5) * rect.height + rect.top,
      ndcZ: outVector.z
    };
  }

  function buildNearbySystemsLayer(systems) {
    clearNearbySystemsLayer();
    state.nearbySystemsCatalog = systems;
    if (systems.length === 0) return;

    const positions = new Float32Array(systems.length * 3);
    const colors = new Float32Array(systems.length * 3);

    for (let i = 0; i < systems.length; i += 1) {
      const system = systems[i];
      state.nearbySystemsById.set(system.id, system);
      state.nearbySystemsMaxDistanceAu = Math.max(state.nearbySystemsMaxDistanceAu, system.distanceAu);

      const apparentMag = Number.isFinite(system.gmag) ? system.gmag : 10.5;
      const intensity = Math.max(0.18, Math.min(1.0, 1.08 - apparentMag * 0.055));
      colors[i * 3] = intensity * 0.72;
      colors[i * 3 + 1] = intensity * 0.84;
      colors[i * 3 + 2] = intensity;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));

    state.nearbySystemsPoints = new Points(
      geometry,
      new PointsMaterial({
        size: 3.1,
        vertexColors: true,
        transparent: true,
        opacity: 0.86,
        blending: AdditiveBlending,
        sizeAttenuation: false,
        depthWrite: false
      })
    );
    state.nearbySystemsPoints.frustumCulled = false;
    state.nearbySystemsPoints.renderOrder = -35;
    nearbySystemsGroup.add(state.nearbySystemsPoints);

    state.nearbySystemHoverHalo = createNearbySystemHaloSprite({
      innerColor: 'rgba(255, 188, 106, 0.82)',
      midColor: 'rgba(255, 124, 82, 0.42)',
      ringColor: 'rgba(255, 212, 116, 0.92)'
    });
    nearbySystemsGroup.add(state.nearbySystemHoverHalo);

    const forcedLabelIds = new Set(Object.keys(LOCAL_SYSTEM_MANIFEST_BY_NEARBY_ID));
    const labelIds = new Set();
    for (let i = 0; i < Math.min(INTERSTELLAR_LABEL_LIMIT, systems.length); i += 1) {
      labelIds.add(systems[i].id);
    }
    for (const systemId of forcedLabelIds) {
      labelIds.add(systemId);
    }

    for (const system of systems) {
      if (!labelIds.has(system.id)) continue;
      const label = createInterstellarLabelSprite(system.name);
      label.userData.nearbySystemId = system.id;
      label.visible = false;
      state.nearbySystemLabelEntries.push({ systemId: system.id, sprite: label });
      nearbySystemsGroup.add(label);
    }

    for (const system of systems) {
      if (!(Number.isFinite(system.distanceLy) && system.distanceLy <= INTERSTELLAR_NEARBY_HALO_MAX_DISTANCE_LY)) {
        continue;
      }
      const halo = createNearbySystemHaloSprite();
      halo.userData.nearbySystemId = system.id;
      state.nearbySystemCloseHaloEntries.push({ systemId: system.id, sprite: halo });
      nearbySystemsGroup.add(halo);
    }

    state.nearbySystemsLoaded = true;
  }

  function updateNearbySystemsPositions(julianDate, force = false) {
    if (!state.nearbySystemsLoaded || !state.nearbySystemsPoints) return;
    if (
      !force
      && Number.isFinite(state.nearbySystemsLastUpdateJd)
      && Math.abs(julianDate - state.nearbySystemsLastUpdateJd) < INTERSTELLAR_POSITION_UPDATE_MIN_JD_DELTA
    ) {
      return;
    }

    const positions = state.nearbySystemsPoints.geometry.attributes.position.array;
    for (let i = 0; i < state.nearbySystemsCatalog.length; i += 1) {
      const system = state.nearbySystemsCatalog[i];
      nearbySystemWorldPosition(system, julianDate, system.worldPosition);
      positions[i * 3] = system.worldPosition.x;
      positions[i * 3 + 1] = system.worldPosition.y;
      positions[i * 3 + 2] = system.worldPosition.z;
    }
    state.nearbySystemsPoints.geometry.attributes.position.needsUpdate = true;
    state.nearbySystemsPoints.geometry.computeBoundingSphere();

    for (const entry of state.nearbySystemLabelEntries) {
      const system = state.nearbySystemsById.get(entry.systemId);
      if (!system) continue;
      const labelScale = Math.max(700, system.distanceAu * 0.0038);
      entry.sprite.position.copy(system.worldPosition).multiplyScalar(1.00005);
      entry.sprite.scale.set(labelScale * 2.3, labelScale * 0.62, 1);
    }

    for (const entry of state.nearbySystemCloseHaloEntries) {
      const system = state.nearbySystemsById.get(entry.systemId);
      if (!system) continue;
      const haloScale = Math.max(980, system.distanceAu * 0.0046);
      entry.sprite.position.copy(system.worldPosition).multiplyScalar(1.00003);
      entry.sprite.scale.set(haloScale, haloScale, 1);
    }

    if (state.nearbySystemHoverHalo && simState.hoveredNearbySystemId) {
      const hovered = state.nearbySystemsById.get(simState.hoveredNearbySystemId);
      if (hovered) {
        const hoverScale = Math.max(1_200, hovered.distanceAu * 0.0058);
        state.nearbySystemHoverHalo.position.copy(hovered.worldPosition).multiplyScalar(1.00002);
        state.nearbySystemHoverHalo.scale.set(hoverScale, hoverScale, 1);
      }
    }

    state.nearbySystemsLastUpdateJd = julianDate;
  }

  function applyNearbySystemsVisibility() {
    if (simState.systemViewMode === SYSTEM_VIEW_MODE.SYSTEM_LOCAL) {
      nearbySystemsGroup.visible = false;
      return;
    }

    const enabledByToggle = Boolean(dom.toggleNearbySystems?.checked);
    controls.maxDistance = enabledByToggle ? INTERSTELLAR_MAX_DISTANCE_AU : SOLAR_SYSTEM_MAX_DISTANCE_AU;

    if (!enabledByToggle || !state.nearbySystemsLoaded) {
      nearbySystemsGroup.visible = false;
      setHoveredNearbySystem(null);
      return;
    }

    const rangeAu = camera.position.distanceTo(controls.target);
    const showMarkers = rangeAu >= INTERSTELLAR_MARKER_VISIBILITY_MIN_RANGE_AU;
    const showLabels = showMarkers && rangeAu >= INTERSTELLAR_LABEL_VISIBILITY_MIN_RANGE_AU;
    nearbySystemsGroup.visible = true;
    if (state.nearbySystemsPoints) {
      state.nearbySystemsPoints.visible = showMarkers;
    }
    for (const entry of state.nearbySystemLabelEntries) {
      entry.sprite.visible = showLabels;
    }
    for (const entry of state.nearbySystemCloseHaloEntries) {
      entry.sprite.visible = showMarkers;
    }

    if (state.nearbySystemHoverHalo) {
      state.nearbySystemHoverHalo.visible = showMarkers && Boolean(simState.hoveredNearbySystemId);
    }

    if (!showMarkers) {
      setHoveredNearbySystem(null);
    }
  }

  async function loadNearbySystemsCatalog() {
    const url = `${backendBaseUrl()}/nearby-systems?limit=500&max_distance_ly=${INTERSTELLAR_MAX_DISTANCE_LY}`;
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Nearby systems API unavailable (${response.status})`);
      }
      const payload = await response.json();
      const rows = Array.isArray(payload?.systems) ? payload.systems : [];
      const systems = rows
        .map((entry, index) => normalizeNearbySystemEntry(entry, index + 1))
        .filter(Boolean)
        .sort((a, b) => a.rank - b.rank);
      buildNearbySystemsLayer(systems);
      updateNearbySystemsPositions(simState.julianDate, true);
      applyNearbySystemsVisibility();
      refreshStarSystemListOptions();
    } catch {
      clearNearbySystemsLayer();
      refreshStarSystemListOptions();
    }
  }

  function pickNearbySystemAtClientPosition(clientX, clientY) {
    if (!state.nearbySystemsLoaded || simState.systemViewMode === SYSTEM_VIEW_MODE.SYSTEM_LOCAL) return null;
    const rect = dom.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;

    pickPointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pickPointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    pickRaycaster.setFromCamera(pickPointerNdc, camera);

    const pickTargets = [];
    for (const entry of state.nearbySystemLabelEntries) {
      if (entry.sprite.visible) {
        pickTargets.push(entry.sprite);
      }
    }
    if (pickTargets.length > 0) {
      const intersections = pickRaycaster.intersectObjects(pickTargets, false);
      for (const hit of intersections) {
        const systemId = hit.object?.userData?.nearbySystemId;
        if (typeof systemId === 'string' && state.nearbySystemsById.has(systemId)) {
          return state.nearbySystemsById.get(systemId);
        }
      }
    }

    if (!state.nearbySystemsPoints?.visible) return null;

    let bestSystem = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const system of state.nearbySystemsCatalog) {
      const screen = projectNearbySystemToScreen(system, rect, tempProjected);
      if (!screen) continue;

      const radiusPx = nearbySystemPickRadiusPx(system);
      const dx = clientX - screen.x;
      const dy = clientY - screen.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > radiusPx * radiusPx) continue;

      const score = (distSq / (radiusPx * radiusPx)) + ((screen.ndcZ + 1.0) * 0.02);
      if (score < bestScore) {
        bestScore = score;
        bestSystem = system;
      }
    }

    return bestSystem;
  }

  function updateNearbySystemHoverAtClientPosition(clientX, clientY) {
    const hovered = pickNearbySystemAtClientPosition(clientX, clientY);
    setHoveredNearbySystem(hovered);
  }

  function focusNearbySystem(systemId, hardSnap = false) {
    const system = state.nearbySystemsById.get(systemId);
    if (!system) return;

    if (simState.systemViewMode === SYSTEM_VIEW_MODE.SYSTEM_LOCAL) {
      return;
    }

    const target = system.worldPosition;
    const offset = camera.position.clone().sub(controls.target);
    const preferredDistance = Math.max(2_000, Math.min(120_000, system.distanceAu * 0.03));
    controls.minDistance = 120;

    if (offset.lengthSq() < 1e-9) {
      offset.set(0, -preferredDistance, preferredDistance * 0.52);
    }

    if (hardSnap) {
      controls.target.copy(target);
      camera.position.copy(target).add(offset.setLength(preferredDistance));
    } else {
      controls.target.lerp(target, 0.22);
      tempDesiredCamera.copy(target).add(offset.setLength(preferredDistance));
      camera.position.lerp(tempDesiredCamera, 0.2);
    }

    setSystemViewMode(SYSTEM_VIEW_MODE.INTERSTELLAR);
    simState.followBodyId = null;
    simState.focusedNearbySystemId = system.id;
    setHoveredNearbySystem(system);
    dom.statusFocus.textContent = `Focus: ${system.name}`;
    dom.bodyInfo.textContent =
      `${system.name}\nType: ${system.objType || 'star system'}\n` +
      `Distance: ${system.distanceLy.toFixed(3)} ly\n` +
      `RA/Dec: ${system.raDeg.toFixed(4)}°, ${system.decDeg.toFixed(4)}°\n` +
      `Identifier: ${system.identifier}`;
  }

  return {
    normalizeNearbySystemEntry,
    clearNearbySystemsLayer,
    nearbySystemRaDecAtJulianDate,
    nearbySystemWorldPosition,
    nearbySystemPickRadiusPx,
    projectNearbySystemToScreen,
    setHoveredNearbySystem,
    buildNearbySystemsLayer,
    updateNearbySystemsPositions,
    applyNearbySystemsVisibility,
    loadNearbySystemsCatalog,
    pickNearbySystemAtClientPosition,
    updateNearbySystemHoverAtClientPosition,
    focusNearbySystem
  };
}
