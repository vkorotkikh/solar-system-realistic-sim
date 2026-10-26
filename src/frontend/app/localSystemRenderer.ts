import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  Object3D,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  RepeatWrapping,
  Sprite,
  Texture,
  Vector3
} from 'three';
import { PlanetQuadtree } from '../features/planetary/quadtreeLOD';
import { applyBodySpin } from '../features/planetary/bodySpin';
import type { SimulationStateStore } from './stateStore';

interface ToggleLike {
  checked?: boolean | null;
}

interface StatusElementLike {
  textContent: string | null;
}

interface LocalSystemDomBindings {
  toggleLabels?: ToggleLike | null;
  toggleOrbits?: ToggleLike | null;
  statusFocus: StatusElementLike;
}

interface LocalOrbitDefinition {
  aAu: number;
  e: number;
  iDeg: number;
  ascendingNodeDeg: number;
  argPeriapsisDeg: number;
  meanAnomalyDeg: number;
  periodDays: number;
  epochJd: number;
}

interface RawLocalOrbit {
  a_au?: unknown;
  e?: unknown;
  i_deg?: unknown;
  ascending_node_deg?: unknown;
  arg_periapsis_deg?: unknown;
  mean_anomaly_deg?: unknown;
  period_days?: unknown;
  epoch_jd?: unknown;
}

interface RawLocalSystemBody {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  mass_kg?: unknown;
  radius_km?: unknown;
  equatorial_radius_km?: unknown;
  polar_radius_km?: unknown;
  display_radius_au?: unknown;
  parent_id?: unknown;
  color?: unknown;
  texture_template?: unknown;
  moon_texture_seed?: unknown;
  observed_texture?: unknown;
  notes?: unknown;
  rotation_period_hours?: unknown;
  rotation_phase_deg?: unknown;
  orbit?: RawLocalOrbit | null;
}

interface LocalSystemBody {
  id: string;
  name: string;
  type: string;
  massKg: number | null;
  radiusKm: number;
  equatorialRadiusKm: number;
  polarRadiusKm: number;
  realRadiusAu: number;
  parentId: string | null;
  color: string;
  textureTemplate: string | null;
  moonTextureSeed: string | null;
  observedTexture: string | null;
  notes: string | null;
  rotationPeriodHours: number | null;
  rotationPhaseDeg: number;
  orbit: LocalOrbitDefinition | null;
  displayRadiusAu: number;
}

interface LocalSystemManifest {
  id?: unknown;
  name?: unknown;
  epoch_jd?: unknown;
  primary_star_id?: unknown;
  stars?: RawLocalSystemBody[] | null;
  planets?: RawLocalSystemBody[] | null;
}

interface LocalSystemConstants {
  AU_KM: number;
  J2000_JD: number;
}

interface LocalSystemControls {
  target: Vector3;
  minDistance: number;
}

interface GeometryCache {
  sun: BufferGeometry;
  planet: BufferGeometry;
}

interface LocalBodySceneEntry {
  body: LocalSystemBody;
  node: Group;
  mesh: Object3D;
  label: Sprite;
  glow: Object3D | null;
}

interface ActiveLocalSystemState {
  id: string;
  name: string;
  primaryBodyId: string;
  preferredDistanceAu: number;
  manifest: LocalSystemManifest;
}

interface LocalSystemRendererState {
  activeLocalSystem: ActiveLocalSystemState | null;
  localTextureCache: Map<string, Texture>;
  localOrbitLines: Line[];
  localBodyEntries: LocalBodySceneEntry[];
  localBodyById: Map<string, LocalSystemBody>;
  localBodyMeshById: Map<string, Object3D>;
  localBodyNodeById: Map<string, Group>;
  localSystemManifestCache: Map<string, LocalSystemManifest>;
}

interface TextureTools {
  loadHiResTexture: (path: string, options: { isColorMap: boolean }) => Texture;
  configureLoadedTexture: (texture: Texture, options?: { isColorMap?: boolean }) => void;
  generateMoonTexture: (
    seed: string,
    parentId: string,
    options: { width: number; height: number }
  ) => HTMLCanvasElement | OffscreenCanvas | null;
  generatePlanetTexture: (template: string) => HTMLCanvasElement | OffscreenCanvas | null;
}

interface MathTools {
  stableHash: (value: string) => number;
}

interface OrbitTools {
  propagateKeplerOrbit: (
    orbit: LocalOrbitDefinition,
    elapsedDays: number,
    position: Vector3
  ) => boolean;
}

interface CreateLocalSystemRendererArgs {
  dom: LocalSystemDomBindings;
  simState: SimulationStateStore;
  camera: PerspectiveCamera;
  controls: LocalSystemControls;
  constants: LocalSystemConstants;
  state: LocalSystemRendererState;
  localSystemGroup: Group;
  geometryCache: GeometryCache;
  createLabelSprite: (text: string) => Sprite;
  createSunGlow: (radiusAu: number) => Object3D;
  textureTools: TextureTools;
  mathTools: MathTools;
  orbitTools: OrbitTools;
  disposeThreeMaterial: (material: Mesh['material'] | Line['material'] | null | undefined) => void;
}

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
}: CreateLocalSystemRendererArgs) {
  const {
    AU_KM,
    J2000_JD
  } = constants;

  const {
    loadHiResTexture,
    configureLoadedTexture,
    generateMoonTexture,
    generatePlanetTexture
  } = textureTools;

  const { stableHash } = mathTools;

  const {
    propagateKeplerOrbit
  } = orbitTools;

  const tempFocusA = new Vector3();
  const tempFocusB = new Vector3();

  function normalizeLocalSystemBody(
    rawBody: RawLocalSystemBody | null | undefined,
    fallbackType: string,
    epochJd: number
  ): LocalSystemBody | null {
    if (!rawBody || typeof rawBody.id !== 'string') return null;
    const id = rawBody.id.trim();
    if (!id) return null;

    const orbitRaw = rawBody.orbit;
    let orbit: LocalOrbitDefinition | null = null;
    const orbitSemiMajorAu = Number(orbitRaw?.a_au);
    const orbitPeriodDays = Number(orbitRaw?.period_days);
    if (orbitRaw && Number.isFinite(orbitSemiMajorAu) && Number.isFinite(orbitPeriodDays) && orbitPeriodDays > 0) {
      orbit = {
        aAu: orbitSemiMajorAu,
        e: Number.isFinite(orbitRaw.e) ? Number(orbitRaw.e) : 0,
        iDeg: Number.isFinite(orbitRaw.i_deg) ? Number(orbitRaw.i_deg) : 0,
        ascendingNodeDeg: Number.isFinite(orbitRaw.ascending_node_deg) ? Number(orbitRaw.ascending_node_deg) : 0,
        argPeriapsisDeg: Number.isFinite(orbitRaw.arg_periapsis_deg) ? Number(orbitRaw.arg_periapsis_deg) : 0,
        meanAnomalyDeg: Number.isFinite(orbitRaw.mean_anomaly_deg) ? Number(orbitRaw.mean_anomaly_deg) : 0,
        periodDays: orbitPeriodDays,
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

  function localBodyBaseRadiusAu(body: LocalSystemBody, realisticMode = simState.useRealisticScale): number {
    const realRadius = Number.isFinite(body?.realRadiusAu) ? body.realRadiusAu : ((body?.radiusKm ?? 1) / AU_KM);
    return realisticMode ? realRadius : (body?.displayRadiusAu ?? realRadius);
  }

  function localBodyRenderScaleAu(
    body: LocalSystemBody,
    realisticMode = simState.useRealisticScale,
    scaleMultiplier = 1
  ): { x: number; y: number; z: number } {
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

  function setLocalBodyMeshScale(
    mesh: Mesh,
    body: LocalSystemBody,
    realisticMode = simState.useRealisticScale,
    scaleMultiplier = 1
  ): void {
    const scale = localBodyRenderScaleAu(body, realisticMode, scaleMultiplier);
    mesh.scale.set(scale.x, scale.y, scale.z);
  }

  function localBodyRenderRadiusAu(body: LocalSystemBody, realisticMode = simState.useRealisticScale): number {
    const scale = localBodyRenderScaleAu(body, realisticMode, 1);
    return Math.max(scale.x, scale.y, scale.z);
  }

  function createLocalOrbitLine(body: LocalSystemBody): Line | null {
    if (!body.orbit) return null;
    const segments = body.orbit.periodDays > 1_000 ? 240 : 180;
    const points: Vector3[] = [];
    const point = new Vector3();

    for (let i = 0; i <= segments; i += 1) {
      const elapsedDays = (i / segments) * body.orbit.periodDays;
      if (!propagateKeplerOrbit(body.orbit, elapsedDays, point)) return null;
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

  function buildLocalBodySurfaceTexture(
    body: LocalSystemBody,
    localSystemId = state.activeLocalSystem?.id ?? 'local'
  ): Texture | null {
    const key = `${localSystemId}:${body.id}`;
    const cachedTexture = state.localTextureCache.get(key);
    if (cachedTexture) {
      return cachedTexture;
    }

    if (typeof body.observedTexture === 'string' && body.observedTexture.trim()) {
      const observedTexture = loadHiResTexture(body.observedTexture, { isColorMap: true });
      observedTexture.wrapS = RepeatWrapping;
      observedTexture.wrapT = RepeatWrapping;
      observedTexture.needsUpdate = true;
      state.localTextureCache.set(key, observedTexture);
      return observedTexture;
    }

    let canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
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

  function clearActiveLocalSystemScene(): void {
    const disposedMaterials = new Set<unknown>();
    const disposedTextures = new Set<Texture>();
    const disposeMaterial = (material: unknown, disposeMap: boolean): void => {
      if (Array.isArray(material)) {
        for (const entry of material) disposeMaterial(entry, disposeMap);
        return;
      }
      if (!material || disposedMaterials.has(material)) return;
      disposedMaterials.add(material);
      if (disposeMap) {
        const map = (material as { map?: unknown }).map;
        if (map instanceof Texture && !disposedTextures.has(map)) {
          disposedTextures.add(map);
          map.dispose();
        }
      }
      disposeThreeMaterial(material as Mesh['material'] | Line['material']);
    };
    const disposeTransientObject = (root: Object3D | null): void => {
      root?.traverse((node) => {
        disposeMaterial((node as Object3D & { material?: unknown }).material, true);
      });
    };

    for (const orbitLine of state.localOrbitLines) {
      if (orbitLine.geometry && typeof orbitLine.geometry.dispose === 'function') {
        orbitLine.geometry.dispose();
      }
      disposeMaterial(orbitLine.material, false);
    }
    for (const entry of state.localBodyEntries) {
      const quadtree = entry.mesh.userData.isQuadtree
        ? entry.mesh.userData.quadtree as { dispose?: () => void }
        : null;
      if (typeof quadtree?.dispose === 'function') {
        quadtree.dispose();
      } else {
        disposeMaterial((entry.mesh as Object3D & { material?: unknown }).material, false);
      }
      disposeTransientObject(entry.label);
      disposeTransientObject(entry.glow);
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

  function buildLocalSystemScene(manifest: LocalSystemManifest | null | undefined): boolean {
    clearActiveLocalSystemScene();
    const resolvedManifest: LocalSystemManifest = manifest ?? {};
    const localSystemId = typeof resolvedManifest.id === 'string' ? resolvedManifest.id : 'local-system';
    const epochJd = Number.isFinite(resolvedManifest.epoch_jd)
      ? Number(resolvedManifest.epoch_jd)
      : J2000_JD;

    const bodies: LocalSystemBody[] = [];
    for (const star of (Array.isArray(resolvedManifest.stars) ? resolvedManifest.stars : [])) {
      const normalized = normalizeLocalSystemBody(star, 'star', epochJd);
      if (normalized) bodies.push(normalized);
    }
    for (const planet of (Array.isArray(resolvedManifest.planets) ? resolvedManifest.planets : [])) {
      const normalized = normalizeLocalSystemBody(planet, 'planet', epochJd);
      if (normalized) bodies.push(normalized);
    }
    if (bodies.length === 0) return false;
    for (const body of bodies) {
      state.localBodyById.set(body.id, body);
    }

    const nodesById = new Map<string, LocalBodySceneEntry>();
    for (const body of bodies) {
      const node = new Group();

      let mesh: Object3D;
      let surfaceTexture: Texture | null = null;
      let internalMeshRef: Mesh | undefined = undefined; // Reference to extract geometry scale logic

      if (['earth', 'moon', 'mars'].includes(body.id)) {
        const baseRadiusAu = localBodyRenderRadiusAu(body, simState.useRealisticScale);
        const quadtree = new PlanetQuadtree(body.id, baseRadiusAu, camera);
        mesh = quadtree.group;
        mesh.userData.isQuadtree = true;
        mesh.userData.quadtree = quadtree;
      } else {
        surfaceTexture = body.type === 'star' ? null : buildLocalBodySurfaceTexture(body, localSystemId);
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
        internalMeshRef = new Mesh(geometry, material);
        setLocalBodyMeshScale(internalMeshRef, body, simState.useRealisticScale);
        mesh = internalMeshRef;
      }

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

      nodesById.set(body.id, { body, node, mesh, label, glow });
      state.localBodyEntries.push({ body, node, label, mesh, glow });
      state.localBodyMeshById.set(body.id, mesh);
      state.localBodyNodeById.set(body.id, node);
    }

    for (const entry of nodesById.values()) {
      const parentEntry = entry.body.parentId ? nodesById.get(entry.body.parentId) : null;
      if (parentEntry) {
        parentEntry.node.add(entry.node);
      } else {
        localSystemGroup.add(entry.node);
      }

      const orbitLine = createLocalOrbitLine(entry.body);
      if (orbitLine) {
        state.localOrbitLines.push(orbitLine);
        if (parentEntry) {
          parentEntry.node.add(orbitLine);
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
    const primaryId = typeof resolvedManifest.primary_star_id === 'string'
      ? resolvedManifest.primary_star_id
      : bodies[0].id;
    const manifestName = typeof resolvedManifest.name === 'string' ? resolvedManifest.name : 'Local System';

    state.activeLocalSystem = {
      id: localSystemId,
      name: manifestName,
      primaryBodyId: primaryId,
      preferredDistanceAu,
      manifest: resolvedManifest
    };
    return true;
  }

  function updateLocalSystemScene(julianDate: number): void {
    if (!state.activeLocalSystem) return;

    const elapsedSeconds = (julianDate - J2000_JD) * 86_400;
    for (const entry of state.localBodyEntries) {
      if (entry.body.orbit) {
        const elapsedDays = julianDate - entry.body.orbit.epochJd;
        entry.node.visible = propagateKeplerOrbit(
          entry.body.orbit,
          elapsedDays,
          entry.node.position
        );
      } else {
        entry.node.position.set(0, 0, 0);
        entry.node.visible = true;
      }

      const rotationPeriodHours = entry.mesh?.userData?.rotationPeriodHours;
      if (entry.mesh && Number.isFinite(rotationPeriodHours) && Math.abs(rotationPeriodHours) > 0.01) {
        const rotationOffset = Number.isFinite(entry.mesh.userData.rotationOffsetRad)
          ? entry.mesh.userData.rotationOffsetRad
          : 0;
        applyBodySpin(entry.mesh, elapsedSeconds, rotationPeriodHours, rotationOffset);
      }

      if (entry.mesh && entry.mesh.userData.isQuadtree) {
        entry.mesh.userData.quadtree.update();

        // Update sunlight direction locally
        const sunWorldPos = new Vector3(0, 0, 0);
        const planetWorldPos = new Vector3();
        entry.node.getWorldPosition(planetWorldPos);
        const sunDirWorld = sunWorldPos.sub(planetWorldPos).normalize();

        // Transform to local space of the mesh
        const meshInverse = entry.mesh.matrixWorld.clone().invert();
        const sunLocalDir = sunDirWorld.transformDirection(meshInverse).normalize();
        entry.mesh.userData.quadtree.setLightDirection(sunLocalDir);
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

  function focusLocalBody(bodyId: string, hardSnap = false): boolean {
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

  async function loadLocalSystemManifestForNearbySystem(
    system: { localManifestPath?: string | null } | null | undefined
  ): Promise<LocalSystemManifest | null> {
    const manifestPath = system?.localManifestPath;
    if (typeof manifestPath !== 'string' || manifestPath.length === 0) return null;
    if (state.localSystemManifestCache.has(manifestPath)) {
      return state.localSystemManifestCache.get(manifestPath) ?? null;
    }

    const response = await fetch(manifestPath, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Local system manifest unavailable (${response.status})`);
    }
    const manifest = await response.json() as LocalSystemManifest;
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
