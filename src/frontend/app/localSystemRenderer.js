import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  Vector3
} from 'three';

export function createLocalSystemRenderer({
  dom,
  simState,
  camera,
  controls,
  constants,
  state,
  localSystemGroup,
  geometryCache,
  createLabelSprite,
  createSunGlow,
  textureTools,
  mathTools,
  orbitTools,
  disposeThreeMaterial
}) {
  const {
    AU_KM,
    J2000_JD,
    TWO_PI
  } = constants;

  const {
    loadHiResTexture,
    configureLoadedTexture,
    generateMoonTexture,
    generatePlanetTexture
  } = textureTools;

  const {
    stableHash,
    normalizeRadians
  } = mathTools;

  const {
    propagateKeplerOrbit
  } = orbitTools;

  const tempFocusA = new Vector3();
  const tempFocusB = new Vector3();

  function normalizeLocalSystemBody(rawBody, fallbackType, epochJd) {
    if (!rawBody || typeof rawBody.id !== 'string') return null;
    const id = rawBody.id.trim();
    if (!id) return null;

    const orbitRaw = rawBody.orbit;
    let orbit = null;
    if (orbitRaw && Number.isFinite(orbitRaw.a_au) && Number.isFinite(orbitRaw.period_days) && orbitRaw.period_days > 0) {
      orbit = {
        aAu: Number(orbitRaw.a_au),
        e: Number.isFinite(orbitRaw.e) ? Number(orbitRaw.e) : 0,
        iDeg: Number.isFinite(orbitRaw.i_deg) ? Number(orbitRaw.i_deg) : 0,
        ascendingNodeDeg: Number.isFinite(orbitRaw.ascending_node_deg) ? Number(orbitRaw.ascending_node_deg) : 0,
        argPeriapsisDeg: Number.isFinite(orbitRaw.arg_periapsis_deg) ? Number(orbitRaw.arg_periapsis_deg) : 0,
        meanAnomalyDeg: Number.isFinite(orbitRaw.mean_anomaly_deg) ? Number(orbitRaw.mean_anomaly_deg) : 0,
        periodDays: Number(orbitRaw.period_days),
        epochJd: Number.isFinite(orbitRaw.epoch_jd) ? Number(orbitRaw.epoch_jd) : epochJd
      };
    }

    const type = (rawBody.type ?? fallbackType ?? 'planet').toString().trim().toLowerCase() || fallbackType;
    const radiusKm = Number.isFinite(rawBody.radius_km) ? Number(rawBody.radius_km) : null;
    const massKg = Number.isFinite(rawBody.mass_kg) ? Number(rawBody.mass_kg) : null;
    const explicitDisplayAu = Number(rawBody.display_radius_au);
    const displayRadiusAu = Number.isFinite(explicitDisplayAu) && explicitDisplayAu > 0
      ? explicitDisplayAu
      : (
        radiusKm
          ? (type === 'star'
              ? Math.max(0.006, Math.sqrt(radiusKm) * 0.00042)
              : Math.max(0.0016, Math.sqrt(radiusKm) * 0.00018))
          : (type === 'star' ? 0.012 : 0.003)
      );
    const resolvedRadiusKm = radiusKm ?? Math.max(40, displayRadiusAu * AU_KM);
    const resolvedEquatorialRadiusKm = Number.isFinite(rawBody.equatorial_radius_km)
      ? Number(rawBody.equatorial_radius_km)
      : resolvedRadiusKm;
    const resolvedPolarRadiusKm = Number.isFinite(rawBody.polar_radius_km)
      ? Number(rawBody.polar_radius_km)
      : resolvedRadiusKm;

    return {
      id,
      name: (rawBody.name ?? id).toString(),
      type,
      massKg,
      radiusKm: resolvedRadiusKm,
      equatorialRadiusKm: resolvedEquatorialRadiusKm,
      polarRadiusKm: resolvedPolarRadiusKm,
      realRadiusAu: resolvedRadiusKm / AU_KM,
      parentId: typeof rawBody.parent_id === 'string' ? rawBody.parent_id : null,
      color: (rawBody.color ?? (type === 'star' ? '#ffc988' : '#87a9dd')).toString(),
      textureTemplate: typeof rawBody.texture_template === 'string' ? rawBody.texture_template : null,
      moonTextureSeed: typeof rawBody.moon_texture_seed === 'string' ? rawBody.moon_texture_seed : null,
      observedTexture: typeof rawBody.observed_texture === 'string' ? rawBody.observed_texture : null,
      notes: typeof rawBody.notes === 'string' ? rawBody.notes : null,
      rotationPeriodHours: Number.isFinite(rawBody.rotation_period_hours) ? Number(rawBody.rotation_period_hours) : null,
      rotationPhaseDeg: Number.isFinite(rawBody.rotation_phase_deg) ? Number(rawBody.rotation_phase_deg) : 0,
      orbit,
      displayRadiusAu
    };
  }

  function localBodyBaseRadiusAu(body, realisticMode = simState.useRealisticScale) {
    const realRadius = Number.isFinite(body?.realRadiusAu) ? body.realRadiusAu : ((body?.radiusKm ?? 1) / AU_KM);
    return realisticMode ? realRadius : (body?.displayRadiusAu ?? realRadius);
  }

  function localBodyRenderScaleAu(body, realisticMode = simState.useRealisticScale, scaleMultiplier = 1) {
    const meanRadiusKm = Math.max(1e-9, body?.radiusKm ?? 1);
    const equatorialScale = (Number.isFinite(body?.equatorialRadiusKm) ? body.equatorialRadiusKm : meanRadiusKm) / meanRadiusKm;
    const polarScale = (Number.isFinite(body?.polarRadiusKm) ? body.polarRadiusKm : meanRadiusKm) / meanRadiusKm;
    const base = localBodyBaseRadiusAu(body, realisticMode) * scaleMultiplier;
    const equatorial = base * equatorialScale;
    const polar = base * polarScale;
    return {
      x: equatorial,
      y: polar,
      z: equatorial
    };
  }

  function setLocalBodyMeshScale(mesh, body, realisticMode = simState.useRealisticScale, scaleMultiplier = 1) {
    const scale = localBodyRenderScaleAu(body, realisticMode, scaleMultiplier);
    mesh.scale.set(scale.x, scale.y, scale.z);
  }

  function localBodyRenderRadiusAu(body, realisticMode = simState.useRealisticScale) {
    const scale = localBodyRenderScaleAu(body, realisticMode, 1);
    return Math.max(scale.x, scale.y, scale.z);
  }

  function createLocalOrbitLine(body) {
    if (!body.orbit) return null;
    const segments = body.orbit.periodDays > 1_000 ? 240 : 180;
    const points = [];
    const point = new Vector3();

    for (let i = 0; i <= segments; i += 1) {
      const elapsedDays = (i / segments) * body.orbit.periodDays;
      propagateKeplerOrbit(body.orbit, elapsedDays, point);
      points.push(point.clone());
    }

    return new Line(
      new BufferGeometry().setFromPoints(points),
      new LineBasicMaterial({
        color: new Color(body.type === 'star' ? '#95d8ff' : '#71a1da'),
        transparent: true,
        opacity: body.type === 'star' ? 0.16 : 0.3
      })
    );
  }

  function buildLocalBodySurfaceTexture(body, localSystemId = state.activeLocalSystem?.id ?? 'local') {
    const key = `${localSystemId}:${body.id}`;
    if (state.localTextureCache.has(key)) {
      return state.localTextureCache.get(key);
    }

    if (typeof body.observedTexture === 'string' && body.observedTexture.trim()) {
      const observedTexture = loadHiResTexture(body.observedTexture, { isColorMap: true });
      observedTexture.wrapS = RepeatWrapping;
      observedTexture.wrapT = RepeatWrapping;
      observedTexture.needsUpdate = true;
      state.localTextureCache.set(key, observedTexture);
      return observedTexture;
    }

    let canvas = null;
    if (body.type === 'moon') {
      const moonSeed = body.moonTextureSeed ?? body.id;
      const moonParent = body.parentId ?? 'default';
      canvas = generateMoonTexture(moonSeed, moonParent, { width: 512, height: 256 });
    } else if (typeof body.textureTemplate === 'string' && body.textureTemplate.length > 0) {
      canvas = generatePlanetTexture(body.textureTemplate);
    } else {
      const fallbackTemplates = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
      const index = stableHash(body.id) % fallbackTemplates.length;
      canvas = generatePlanetTexture(fallbackTemplates[index]);
    }

    if (!canvas) return null;
    const texture = new CanvasTexture(canvas);
    configureLoadedTexture(texture, { isColorMap: true });
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.needsUpdate = true;
    state.localTextureCache.set(key, texture);
    return texture;
  }

  function clearActiveLocalSystemScene() {
    for (const orbitLine of state.localOrbitLines) {
      if (orbitLine.geometry && typeof orbitLine.geometry.dispose === 'function') {
        orbitLine.geometry.dispose();
      }
      disposeThreeMaterial(orbitLine.material);
    }
    localSystemGroup.clear();
    state.localOrbitLines.length = 0;
    state.localBodyEntries.length = 0;
    state.localBodyById.clear();
    state.localBodyMeshById.clear();
    state.localBodyNodeById.clear();
    simState.followBodyId = null;
    state.activeLocalSystem = null;
  }

  function buildLocalSystemScene(manifest) {
    clearActiveLocalSystemScene();
    const localSystemId = typeof manifest?.id === 'string' ? manifest.id : 'local-system';
    const epochJd = Number.isFinite(manifest?.epoch_jd) ? Number(manifest.epoch_jd) : J2000_JD;

    const bodies = [];
    for (const star of (Array.isArray(manifest?.stars) ? manifest.stars : [])) {
      const normalized = normalizeLocalSystemBody(star, 'star', epochJd);
      if (normalized) bodies.push(normalized);
    }
    for (const planet of (Array.isArray(manifest?.planets) ? manifest.planets : [])) {
      const normalized = normalizeLocalSystemBody(planet, 'planet', epochJd);
      if (normalized) bodies.push(normalized);
    }
    if (bodies.length === 0) return false;
    for (const body of bodies) {
      state.localBodyById.set(body.id, body);
    }

    const nodesById = new Map();
    for (const body of bodies) {
      const node = new Group();
      const surfaceTexture = body.type === 'star' ? null : buildLocalBodySurfaceTexture(body, localSystemId);
      const material = body.type === 'star'
        ? new MeshBasicMaterial({
            color: new Color(body.color),
            map: surfaceTexture ?? undefined
          })
        : new MeshStandardMaterial({
            color: surfaceTexture ? new Color('#ffffff') : new Color(body.color),
            map: surfaceTexture ?? undefined,
            emissive: new Color('#000000'),
            emissiveIntensity: 0.0,
            roughness: body.type === 'moon' ? 0.88 : 0.8,
            metalness: 0.0
          });
      const geometry = body.type === 'star' ? geometryCache.sun : geometryCache.planet;
      const mesh = new Mesh(geometry, material);
      setLocalBodyMeshScale(mesh, body, simState.useRealisticScale);
      mesh.userData.localBodyId = body.id;
      mesh.userData.rotationPeriodHours = body.rotationPeriodHours;
      mesh.userData.rotationOffsetRad = ((body.rotationPhaseDeg ?? 0) * Math.PI) / 180;
      node.add(mesh);

      let glow = null;
      if (body.type === 'star') {
        glow = createSunGlow(localBodyRenderRadiusAu(body, simState.useRealisticScale));
        glow.userData.localStarGlow = true;
        glow.userData.localBodyId = body.id;
        node.add(glow);
      }

      const label = createLabelSprite(body.name);
      const labelRadius = localBodyRenderRadiusAu(body, simState.useRealisticScale);
      label.position.set(0, labelRadius * 2.4 + 0.015, 0);
      label.visible = Boolean(dom.toggleLabels?.checked);
      node.add(label);

      nodesById.set(body.id, { body, node, mesh, label });
      state.localBodyEntries.push({ body, node, label, mesh, glow });
      state.localBodyMeshById.set(body.id, mesh);
      state.localBodyNodeById.set(body.id, node);
    }

    for (const entry of nodesById.values()) {
      if (entry.body.parentId && nodesById.has(entry.body.parentId)) {
        nodesById.get(entry.body.parentId).node.add(entry.node);
      } else {
        localSystemGroup.add(entry.node);
      }

      const orbitLine = createLocalOrbitLine(entry.body);
      if (orbitLine) {
        state.localOrbitLines.push(orbitLine);
        if (entry.body.parentId && nodesById.has(entry.body.parentId)) {
          nodesById.get(entry.body.parentId).node.add(orbitLine);
        } else {
          localSystemGroup.add(orbitLine);
        }
      }
    }

    let maxOrbitAu = 0;
    for (const body of bodies) {
      if (body.orbit?.aAu) {
        maxOrbitAu = Math.max(maxOrbitAu, body.orbit.aAu);
      }
    }
    const preferredDistanceAu = Math.max(0.12, Math.min(2.6, maxOrbitAu * 2.8 + 0.12));
    const primaryId = typeof manifest?.primary_star_id === 'string' ? manifest.primary_star_id : bodies[0].id;

    state.activeLocalSystem = {
      id: localSystemId,
      name: manifest.name ?? 'Local System',
      primaryBodyId: primaryId,
      preferredDistanceAu,
      manifest
    };
    return true;
  }

  function updateLocalSystemScene(julianDate) {
    if (!state.activeLocalSystem) return;

    const elapsedSeconds = (julianDate - J2000_JD) * 86_400;
    for (const entry of state.localBodyEntries) {
      if (entry.body.orbit) {
        const elapsedDays = julianDate - entry.body.orbit.epochJd;
        propagateKeplerOrbit(entry.body.orbit, elapsedDays, entry.node.position);
      } else {
        entry.node.position.set(0, 0, 0);
      }

      const rotationPeriodHours = entry.mesh?.userData?.rotationPeriodHours;
      if (entry.mesh && Number.isFinite(rotationPeriodHours) && Math.abs(rotationPeriodHours) > 0.01) {
        const angularSpeed = TWO_PI / (rotationPeriodHours * 3_600);
        const rotationOffset = Number.isFinite(entry.mesh.userData.rotationOffsetRad)
          ? entry.mesh.userData.rotationOffsetRad
          : 0;
        entry.mesh.rotation.y = normalizeRadians(rotationOffset + angularSpeed * elapsedSeconds);
      }

      if (entry.label) {
        const labelRadius = localBodyRenderRadiusAu(entry.body, simState.useRealisticScale);
        entry.label.position.set(0, labelRadius * 2.4 + 0.015, 0);
      }
    }

    const showLocalLabels = Boolean(dom.toggleLabels?.checked);
    for (const entry of state.localBodyEntries) {
      if (!entry.label) continue;
      entry.label.visible = showLocalLabels;
    }
    for (const orbitLine of state.localOrbitLines) {
      orbitLine.visible = Boolean(dom.toggleOrbits?.checked);
    }
  }

  function focusLocalBody(bodyId, hardSnap = false) {
    const body = state.localBodyById.get(bodyId);
    const node = state.localBodyNodeById.get(bodyId);
    if (!body || !node) return false;

    node.getWorldPosition(tempFocusA);
    const offset = camera.position.clone().sub(controls.target);
    const renderedRadiusAu = localBodyRenderRadiusAu(body, simState.useRealisticScale);
    const minDistance = Math.max(0.00003, renderedRadiusAu * 2.8);
    controls.minDistance = minDistance;
    const preferredDistance = body.type === 'star'
      ? Math.max(0.15, renderedRadiusAu * 18)
      : Math.max(renderedRadiusAu * 28, minDistance * 1.3);

    if (offset.lengthSq() < 1e-12) {
      offset.set(0, -preferredDistance, preferredDistance * 0.6);
    }

    if (hardSnap) {
      controls.target.copy(tempFocusA);
      camera.position.copy(tempFocusA).add(offset.setLength(preferredDistance));
    } else {
      controls.target.lerp(tempFocusA, 0.25);
      const desiredCamera = tempFocusB.copy(tempFocusA).add(offset.setLength(preferredDistance));
      camera.position.lerp(desiredCamera, 0.2);
    }

    simState.focusedBodyId = bodyId;
    simState.followBodyId = null;
    dom.statusFocus.textContent = `Focus: ${body.name}`;
    return true;
  }

  async function loadLocalSystemManifestForNearbySystem(system) {
    const manifestPath = system?.localManifestPath;
    if (typeof manifestPath !== 'string' || manifestPath.length === 0) return null;
    if (state.localSystemManifestCache.has(manifestPath)) {
      return state.localSystemManifestCache.get(manifestPath);
    }

    const response = await fetch(manifestPath, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Local system manifest unavailable (${response.status})`);
    }
    const manifest = await response.json();
    state.localSystemManifestCache.set(manifestPath, manifest);
    return manifest;
  }

  return {
    normalizeLocalSystemBody,
    localBodyBaseRadiusAu,
    localBodyRenderScaleAu,
    setLocalBodyMeshScale,
    localBodyRenderRadiusAu,
    clearActiveLocalSystemScene,
    buildLocalSystemScene,
    updateLocalSystemScene,
    focusLocalBody,
    loadLocalSystemManifestForNearbySystem
  };
}
