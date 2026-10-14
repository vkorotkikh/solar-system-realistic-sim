import { Group } from 'three';
import { applySolarGeometryFrame, solarSurfaceToEclipticMatrix } from './frontend/features/solar/solarFrame';
import {
  validatedSolarLayerFrames, solarFeaturesInSurfaceFrame, solarFlareParamsInSurfaceFrame,
  solarHolesInSurfaceFrame, type SolarLayerFrames, type SolarGeometryLayer
} from './frontend/features/solar/solarGeometryContract';
import type {
  BufferGeometry,
  Camera,
  Material,
  Mesh,
  Object3D,
  Points,
  ShaderMaterial,
  Sprite,
  Texture,
  TextureLoader
} from 'three';
import { J2000_JD } from './constants';
import {
  SOLAR_PHYSICS_POLL_INTERVAL_MS,
  SolarPhysicsClient,
  type SolarPhysicsStatePayload
} from './frontend/features/solar/solarPhysicsClient';
import {
  SolarRealtimeClient,
  observationStateFromSolarRealtime
} from './frontend/features/solar/solarRealtimeClient';
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
  updateSunMaterialUniforms,
  updateSunspotUniforms,
  updateSunFlaresUniforms,
  createChromosphereLayer,
  updateChromosphereLayer,
  createTransitionRegionShell,
  updateTransitionRegionShell
} from './frontend/features/solar/sunVisuals';
import { SolarFlareManager } from './frontend/features/solar/solarFlares';
import { createMagneticFieldLines, updateMagneticFieldLines } from './frontend/features/solar/solarMagnetics';
import {
  clampUnit,
  finiteOrNull,
  normalizeSolarFeatureSetFromState as normalizeSolarFeatureSetFromStateImpl,
  buildSolarFeatureBlendView as buildSolarFeatureBlendViewImpl,
  materializeSolarFeatureSetFromBlendView as materializeSolarFeatureSetFromBlendViewImpl,
  type SolarFeatureBlendView,
  type SolarFeatureSet
} from './frontend/features/solar/solarFeatureBlending';
import { createGWVisualization } from './frontend/features/solar/gravitationalWaves';
import { createWarpSlipstreamVisualization } from './frontend/features/superluminal-modeling/warpSlipstreamVisuals';
import { createAgnShockwaveEngine, type AgnEventOptions } from './frontend/features/superluminal-modeling/agnShockwaveEngine';
import {
  buildAiaProxyTextureUrl,
  deriveSunObservationControls,
  inspectAiaObservationChannel,
  pickAiaObservationChannel,
  type SolarObservationPhysicsStateLike
} from './frontend/features/solar/solarObservationTexture';
import {
  describeSolarDataStatus,
  type SolarDataSourceStatus
} from './frontend/features/solar/solarDataStatus';

type GwDisplayer = ReturnType<typeof createGWVisualization>;
type WarpDisplayer = ReturnType<typeof createWarpSlipstreamVisualization>;
type AgnEngine = ReturnType<typeof createAgnShockwaveEngine>;

export interface CreateSunControllerOptions {
  camera: Camera;
  simState: { julianDate: number; [key: string]: unknown };
  backendBaseUrl: () => string;
  configureLoadedTexture: (texture: Texture) => void;
  observationTextureLoader: TextureLoader;
  getSunRadiusAu: () => number;
  isMagneticFieldEnabled: () => boolean;
  onSolarDataStatus?: (status: SolarDataSourceStatus) => void;
}

const TWO_PI = Math.PI * 2;

/**
 * No global bypass: independently admitted synthetic layers use explicit frame contracts.
 * Untagged and observed-native geometry remains disabled, including legacy callers.
 */
export const BACKEND_GEOMETRY_VALIDATED = false;
const CYCLE_25_START_JD = 2_458_849.5;
const CYCLE_LENGTH_MONTHS = 132.0;
const MEAN_MONTH_DAYS = 30.44;
const HATHAWAY_B = 54.0;
const HATHAWAY_C = 0.71;

function hathawayRaw(tMonths: number, b = HATHAWAY_B, c = HATHAWAY_C): number {
  if (!Number.isFinite(tMonths) || tMonths <= 0) return 0;
  const ratio = tMonths / Math.max(1e-6, b);
  const ratio2 = ratio * ratio;
  const ratio3 = ratio2 * ratio;
  const denom = Math.exp(ratio2) - c;
  if (denom <= 1e-12) return 0;
  return ratio3 / denom;
}

function hathawayPeakMonths(b: number, c: number): number {
  // For s=(t/b)^2 the stationary point satisfies exp(s)*(3-2*s)=3*c.
  // The textbook b*sqrt(1.5) is valid only for c=0, not our c=0.71.
  let lo = 0.5;
  let hi = 1.5;
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const mid = (lo + hi) / 2;
    if (Math.exp(mid) * (3 - 2 * mid) > 3 * c) lo = mid;
    else hi = mid;
  }
  return b * Math.sqrt((lo + hi) / 2);
}

const HATHAWAY_PEAK_MONTHS = hathawayPeakMonths(HATHAWAY_B, HATHAWAY_C);

export function hathawayNormalized(tMonths: number, b = HATHAWAY_B, c = HATHAWAY_C): number {
  const tPeak = b === HATHAWAY_B && c === HATHAWAY_C ? HATHAWAY_PEAK_MONTHS : hathawayPeakMonths(b, c);
  const peak = hathawayRaw(tPeak, b, c);
  if (peak <= 1e-12) return 0;
  return Math.max(0, Math.min(1, hathawayRaw(tMonths, b, c) / peak));
}

export function fallbackSolarActivityFromJulianDate(julianDate: number): number {
  const cycleDays = CYCLE_LENGTH_MONTHS * MEAN_MONTH_DAYS;
  const cycleOffsetDays = ((julianDate - CYCLE_25_START_JD) % cycleDays + cycleDays) % cycleDays;
  const tMonths = cycleOffsetDays / MEAN_MONTH_DAYS;
  const hathaway = hathawayNormalized(tMonths);
  const rotationMod = 0.5 + 0.5 * Math.sin(((julianDate - J2000_JD) / 27.2753) * TWO_PI + 0.17);
  const activity = 0.06 + hathaway * 0.82 + rotationMod * 0.1;
  return Math.max(0.02, Math.min(0.98, activity));
}

/**
 * Factory that encapsulates all sun-model state, rendering, and backend polling.
 *
 * Dependencies are injected so main.js stays lean:
 *   camera                     – THREE.Camera (Parker spiral fade)
 *   simState                   – { julianDate, useRealisticScale, … }
 *   backendBaseUrl             – () => string
 *   configureLoadedTexture     – (texture) => void
 *   observationTextureLoader   – THREE.TextureLoader instance
 *   getSunRadiusAu             – () => number (current sun render radius)
 *   isMagneticFieldEnabled     – () => boolean
 *   onSolarDataStatus          – (status) => void, called after every refresh attempt and image load
 */
export function createSunController({
  camera,
  simState,
  backendBaseUrl,
  configureLoadedTexture,
  observationTextureLoader,
  getSunRadiusAu,
  isMagneticFieldEnabled,
  onSolarDataStatus
}: CreateSunControllerOptions) {
  let sunSurfaceMaterial: ShaderMaterial | null = null;
  let sunCoronaMaterial: ShaderMaterial | null = null;
  let sunVisualNode: Object3D | null = null;
  let sunSpinGroup: Group | null = null;
  let solarLayerFrames: SolarLayerFrames = {};
  let sunGlowSprite: Sprite | null = null;
  let sunEruptionLayer: Points | null = null;
  let sunChromosphereLayer: Points | null = null;
  let sunCoronaMesh: Mesh<BufferGeometry, ShaderMaterial> | null = null;
  let sunFlareGroup: Group | null = null;
  let solarFlareManager: SolarFlareManager | null = null;
  let sunMagneticFieldGroup: Group | null = null;
  let sunMagneticFieldSignature: string | null = null;
  let sunCoronalLoopGroup: Group | null = null;
  let sunParkerSpiralGroup: Group | null = null;
  let sunTransitionRegionMesh: Mesh<BufferGeometry, ShaderMaterial> | null = null;

  let gwDisplayer: GwDisplayer | null = null;
  let warpDisplayer: WarpDisplayer | null = null;
  let agnEngine: AgnEngine | null = null;

  let solarPhysicsState: SolarPhysicsStatePayload | null = null;
  let solarPhysicsFeatureSetCurrent: SolarFeatureSet | null = null;
  let solarPhysicsFeatureSetTarget: SolarFeatureSet | null = null;
  let solarPhysicsBlendStartMs = 0;
  let solarPhysicsBlendDurationMs = 1_050;
  let solarPhysicsRefreshInFlight = false;
  let solarPhysicsNextRefreshMs = 0;
  let solarDeliveryDisposed = false;

  let solarObservationTexture: Texture | null = null;
  let solarObservationTextureImageId: string | null = null;
  let solarObservationTextureChannel: string | null = null;
  let solarObservationTextureLoadInFlight = false;
  let solarObservationTextureLastLoadMs = 0;
  let userAiaChannelOverride: string | null = null;
  let solarObservationFailedChannel: string | null = null;
  let lastTimeSec: number | null = null;
  let lastJulianDate: number | null = null;
  let decorativeTimeSec = 0;

  const solarPhysicsClient = new SolarPhysicsClient({
    baseUrl: backendBaseUrl,
    maxFeatures: 180,
    fidelity: 'high',
    forcing: 'hybrid',
    liveData: true
  });
  const solarRealtimeClient = new SolarRealtimeClient({
    baseUrl: backendBaseUrl
  });

  function publishSolarDataStatus() {
    const clientStatus = solarPhysicsClient.status();
    const status = describeSolarDataStatus({
      lastSuccessMs: clientStatus.lastSuccessMs,
      lastFailure: clientStatus.lastFailure,
      timeoutMs: clientStatus.timeoutMs,
      backendBaseUrl: backendBaseUrl(),
      pageOrigin: globalThis.location?.origin ?? '',
      payload: solarPhysicsState,
      geometryFromBackend: Object.keys(solarLayerFrames).length > 0,
      displayedImageChannel: solarObservationTexture ? solarObservationTextureChannel : null,
      failedImageChannel: solarObservationFailedChannel
    });
    onSolarDataStatus?.(status);
  }

  publishSolarDataStatus();

  // ── internal helpers ─────────────────────────────────────────────────────

  function geometryStateFor(layer: SolarGeometryLayer) {
    return solarLayerFrames[layer] ? solarPhysicsState : null;
  }

  function updateSurfaceFrame(jdTdb: number) {
    if (!sunSpinGroup) return;
    sunSpinGroup.quaternion.setFromRotationMatrix(solarSurfaceToEclipticMatrix(jdTdb));
    sunSpinGroup.userData.solarFrameOwner = 'sunController';
    for (const child of sunSpinGroup.children) {
      if (child.userData.lockBodySpin) continue;
      child.userData.lockBodySpin = true;
      child.quaternion.identity();
    }
  }

  function buildSolarFeatureBlendView(nowMs = Date.now(), featureLimit = 220) {
    const bv = buildSolarFeatureBlendViewImpl({
      currentFeatureSet: solarPhysicsFeatureSetCurrent,
      targetFeatureSet: solarPhysicsFeatureSetTarget,
      blendStartMs: solarPhysicsBlendStartMs,
      blendDurationMs: solarPhysicsBlendDurationMs,
      nowMs,
      featureLimit
    });
    solarPhysicsFeatureSetCurrent = bv.nextCurrentFeatureSet;
    solarPhysicsFeatureSetTarget = bv.nextTargetFeatureSet;
    solarPhysicsBlendStartMs = bv.nextBlendStartMs;
    return bv;
  }

  function normalizeSolarFeatureSetFromState(
    physicsState: SolarPhysicsStatePayload | null,
    featureLimit = 220
  ) {
    return normalizeSolarFeatureSetFromStateImpl(
      solarLayerFrames.loops || solarLayerFrames.cme ? physicsState : null,
      simState.julianDate, featureLimit
    );
  }

  function materializeSolarFeatureSetFromBlendView(blendView: SolarFeatureBlendView) {
    return materializeSolarFeatureSetFromBlendViewImpl(blendView, simState.julianDate);
  }

  function applySunObservationTextureToMaterials() {
    setSunObservationTexture({ sunSurfaceMaterial, observationTexture: solarObservationTexture });
  }

  function revokeSolarObservationTexture() {
    const revokedTexture = solarObservationTexture;
    const hadObservationBinding = revokedTexture !== null
      || solarObservationTextureImageId !== null
      || solarObservationTextureChannel !== null;
    solarObservationTexture = null;
    solarObservationTextureImageId = null;
    solarObservationTextureChannel = null;
    if (hadObservationBinding) applySunObservationTextureToMaterials();
    if (revokedTexture && typeof revokedTexture.dispose === 'function') {
      revokedTexture.dispose();
    }
    if (hadObservationBinding) publishSolarDataStatus();
  }

  function loadedObservationMatches(
    selection: ReturnType<typeof pickAiaObservationChannel>
  ): boolean {
    return !!selection
      && !!solarObservationTexture
      && selection.imageId === solarObservationTextureImageId
      && selection.channel === solarObservationTextureChannel;
  }

  function getObservationState(): SolarObservationPhysicsStateLike | null {
    return observationStateFromSolarRealtime(solarRealtimeClient.latestState())
      ?? solarPhysicsState;
  }

  function getRenderableObservationState(
    nowMs = Date.now()
  ): SolarObservationPhysicsStateLike | null {
    return solarRealtimeClient.renderableObservationState(
      nowMs,
      userAiaChannelOverride
    );
  }

  function buildMagneticFieldSignature(activity: number) {
    const quantizedActivity = Math.round(clampUnit(activity) * 12);
    const pfssSignature = solarPhysicsState?.pfss_field_lines
      ? `pfss:${solarPhysicsState.pfss_field_lines.source}:${solarPhysicsState.pfss_field_lines.carrington_rotation}`
      : 'analytical';
    const topFeatures = Array.isArray(solarPhysicsState?.corona?.features)
      ? solarPhysicsState.corona.features
        .slice(0, 12)
        .map((feature: Record<string, unknown>) => `${feature?.id ?? 'feature'}:${Number(feature?.brightness ?? 0).toFixed(2)}`)
        .join('|')
      : 'synthetic';
    return `${quantizedActivity}:${pfssSignature}:${topFeatures}:${solarPhysicsState?.epoch_jd_tdb}:${!!solarLayerFrames.pfss}`;
  }

  function disposeMagneticFieldGroup(group: Object3D | null) {
    if (!group) return;
    for (const obj of group.children) {
      const line = obj as Object3D & {
        geometry?: { dispose(): void };
        material?: Material | Material[] | null;
      };
      if (line.geometry && typeof line.geometry.dispose === 'function') {
        line.geometry.dispose();
      }
      if (line.material) {
        if (Array.isArray(line.material)) {
          for (const material of line.material) {
            if (material && typeof material.dispose === 'function') material.dispose();
          }
        } else if (typeof line.material.dispose === 'function') {
          line.material.dispose();
        }
      }
    }
  }

  function rebuildMagneticFieldLines(force = false, activityOverride: number | null | undefined = null) {
    if (!sunVisualNode) return;
    const activity = Number.isFinite(Number(activityOverride))
      ? clampUnit(Number(activityOverride))
      : clampUnit(Number(solarPhysicsState?.activity_index) || 0.5);
    const nextSignature = buildMagneticFieldSignature(activity);
    if (!force && sunMagneticFieldGroup && sunMagneticFieldSignature === nextSignature) return;

    const nextGroup = createMagneticFieldLines(getSunRadiusAu(), activity, {
      physicsState: geometryStateFor('pfss')
    });
    applySolarGeometryFrame(nextGroup, solarLayerFrames.pfss ?? {
      inputFrame: 'IAU_SUN', jdTdb: simState.julianDate
    });
    nextGroup.userData.solarLayer = 'pfss';
    nextGroup.userData.solarGeometrySource = solarLayerFrames.pfss ? 'backend_synthetic_uncalibrated' : 'procedural';
    nextGroup.visible = isMagneticFieldEnabled();
    nextGroup.userData.bodyId = 'sun-magnetic-field';

    if (sunMagneticFieldGroup?.parent) {
      sunMagneticFieldGroup.parent.remove(sunMagneticFieldGroup);
    }
    disposeMagneticFieldGroup(sunMagneticFieldGroup);
    sunMagneticFieldGroup = nextGroup;
    sunMagneticFieldSignature = nextSignature;
    sunVisualNode.add(nextGroup);
  }

  function maybeRefreshObservationTexture(nowMs = Date.now(), force = false) {
    if (solarDeliveryDisposed) return;

    const observationState = getRenderableObservationState(nowMs);
    const selection = pickAiaObservationChannel(
      observationState,
      undefined,
      userAiaChannelOverride
    );
    if (!selection) {
      revokeSolarObservationTexture();
      return;
    }

    const nextImageId = `${selection.imageId ?? ''}`;
    const nextChannel = `${selection.channel ?? ''}`.toLowerCase();
    if (!nextImageId || !nextChannel) return;
    if (
      solarObservationTexture
      && (
        nextImageId !== solarObservationTextureImageId
        || nextChannel !== solarObservationTextureChannel
      )
    ) {
      revokeSolarObservationTexture();
    }
    if (solarObservationTextureLoadInFlight) return;
    if (!force && nextImageId === solarObservationTextureImageId && nextChannel === solarObservationTextureChannel) return;
    if (!force && nowMs - solarObservationTextureLastLoadMs < 12_000) return;

    const proxyUrl = buildAiaProxyTextureUrl(backendBaseUrl(), nextChannel, nextImageId);
    if (!proxyUrl) return;

    solarObservationTextureLoadInFlight = true;
    solarObservationTextureLastLoadMs = nowMs;
    observationTextureLoader.load(
      proxyUrl,
      (loaded: Texture) => {
        const currentSelection = pickAiaObservationChannel(
          getRenderableObservationState(Date.now()),
          undefined,
          userAiaChannelOverride
        );
        if (
          solarDeliveryDisposed
          || currentSelection?.imageId !== nextImageId
          || currentSelection?.channel !== nextChannel
        ) {
          if (typeof loaded.dispose === 'function') loaded.dispose();
          solarObservationTextureLoadInFlight = false;
          if (!solarDeliveryDisposed) {
            maybeRefreshObservationTexture(Date.now(), true);
          }
          return;
        }
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
        solarObservationFailedChannel = null;
        publishSolarDataStatus();
      },
      undefined,
      () => {
        solarObservationTextureLoadInFlight = false;
        solarObservationFailedChannel = nextChannel;
        publishSolarDataStatus();
      }
    );
  }

  // ── public API ───────────────────────────────────────────────────────────

  function createSunMaterial(sunTexture: Texture | null) {
    if (!sunTexture) return null;
    sunSurfaceMaterial = createSunSurfaceMaterial(sunTexture);
    applySunObservationTextureToMaterials();
    return sunSurfaceMaterial;
  }

  function initSunVisuals({
    spinGroup,
    node,
    sunBody,
    sunGeometry,
    meshRotationOffsetRad = 0
  }: {
    spinGroup: Group;
    node: Object3D;
    sunBody: { rotationPeriodHours?: number | null };
    sunGeometry: BufferGeometry;
    meshRotationOffsetRad?: number;
  }) {
    sunVisualNode = node;
    sunSpinGroup = spinGroup;
    const sunRadiusAu = getSunRadiusAu();

    sunGlowSprite = createSunGlow(sunRadiusAu);
    node.add(sunGlowSprite);

    const coronaMesh = createSunCoronaShell(sunGeometry);
    coronaMesh.scale.setScalar(sunRadiusAu * (coronaMesh.userData.surfaceScale ?? 1.15));
    spinGroup.add(coronaMesh);
    sunCoronaMaterial = coronaMesh.material;
    sunCoronaMesh = coronaMesh;

    sunEruptionLayer = createSunEruptionLayer(sunRadiusAu);
    sunEruptionLayer.userData.rotationPeriodHours = sunBody.rotationPeriodHours ?? null;
    sunEruptionLayer.userData.rotationOffsetRad = meshRotationOffsetRad;
    node.add(sunEruptionLayer);
    applySolarGeometryFrame(sunEruptionLayer, { inputFrame: 'SOLAR_EQUATORIAL_J2000', jdTdb: simState.julianDate });
    setSunEruptionBaseRadiusImpl(sunEruptionLayer, sunRadiusAu);

    sunChromosphereLayer = createChromosphereLayer(sunRadiusAu, 8000);
    sunChromosphereLayer.userData.rotationPeriodHours = sunBody.rotationPeriodHours ?? null;
    spinGroup.add(sunChromosphereLayer);

    // Transition Region shell — thin emissive layer between chromosphere and corona
    sunTransitionRegionMesh = createTransitionRegionShell(sunGeometry, sunRadiusAu);
    spinGroup.add(sunTransitionRegionMesh);

    sunFlareGroup = new Group();
    sunFlareGroup.userData.bodyId = 'sun-flares';
    node.add(sunFlareGroup);
    sunFlareGroup.quaternion.setFromRotationMatrix(solarSurfaceToEclipticMatrix(J2000_JD));
    sunFlareGroup.userData.lockBodySpin = true;
    solarFlareManager = new SolarFlareManager(sunFlareGroup);

    rebuildMagneticFieldLines(true, 0.5);

    if (sunCoronalLoopGroup?.parent) {
      clearSunCoronalLoopsImpl(sunCoronalLoopGroup);
      sunCoronalLoopGroup.parent.remove(sunCoronalLoopGroup);
    }
    if (sunParkerSpiralGroup?.parent) {
      clearSunParkerSpiralLinesImpl(sunParkerSpiralGroup);
      sunParkerSpiralGroup.parent.remove(sunParkerSpiralGroup);
    }

    sunCoronalLoopGroup = new Group();
    sunCoronalLoopGroup.userData.bodyId = 'sun-coronal-loops';
    node.add(sunCoronalLoopGroup);
    applySolarGeometryFrame(sunCoronalLoopGroup, { inputFrame: 'SOLAR_EQUATORIAL_J2000', jdTdb: simState.julianDate });
    const initialBlend = buildSolarFeatureBlendView(Date.now(), 220);
    updateSunCoronalLoopsFromBlendViewImpl(sunCoronalLoopGroup, solarLayerFrames.loops ? initialBlend : null, sunRadiusAu, 144);

    sunParkerSpiralGroup = new Group();
    sunParkerSpiralGroup.userData.bodyId = 'sun-parker-spiral';
    node.add(sunParkerSpiralGroup);
    applySolarGeometryFrame(sunParkerSpiralGroup, { inputFrame: 'SOLAR_EQUATORIAL_J2000', jdTdb: simState.julianDate });
    updateSunParkerSpiralFromPhysicsStateImpl(
      sunParkerSpiralGroup, geometryStateFor('parker'), sunRadiusAu, 6, 120, 0, camera
    );
    updateSurfaceFrame(simState.julianDate);

    // Agn Shockwave Engine
    gwDisplayer = createGWVisualization(400); // Massive grid
    node.add(gwDisplayer.mesh);

    warpDisplayer = createWarpSlipstreamVisualization(400);
    node.add(warpDisplayer.mesh);

    // Inject flare callbacks used by the multi-messenger AGN engine.
    agnEngine = createAgnShockwaveEngine(gwDisplayer, {
      triggerFlareBurst: (intensity = 0.5, count = 1) => {
        if (!solarFlareManager) return;
        const flareCount = Math.max(1, Math.min(8, Math.round(Number(count) || 1)));
        const flareIntensity = Math.max(0.1, Math.min(2.5, Number(intensity) || 0.5));
        const currentSunRadiusAu = getSunRadiusAu();
        for (let i = 0; i < flareCount; i++) {
          solarFlareManager.spawnRandomFlare(flareIntensity, currentSunRadiusAu);
        }
      },
      triggerMassiveAgnFlare: (intensity: number) => {
        if (solarFlareManager) {
          const currentSunRadiusAu = getSunRadiusAu();
          // Spawn 3 massive CMEs wrapping the sun
          solarFlareManager.spawnRandomFlare(intensity * 1.5, currentSunRadiusAu);
          solarFlareManager.spawnRandomFlare(intensity * 1.5, currentSunRadiusAu);
          solarFlareManager.spawnRandomFlare(intensity * 2.0, currentSunRadiusAu);
        }
      }
    }, { onReset: () => warpDisplayer?.reset() });
  }

  function syncAgnVisuals() {
    const warp = agnEngine?.getWarpState() ?? null;
    if (warp) {
      warpDisplayer?.setWarpState(warp);
      warpDisplayer?.toggle(true);
    } else {
      warpDisplayer?.reset();
    }
  }

  function update(julianDate: number, realtimeSeconds: number) {
    if (solarDeliveryDisposed) return;
    updateSurfaceFrame(julianDate);
    const wallSec = Number.isFinite(realtimeSeconds) ? realtimeSeconds : performance.now() * 0.001;
    const rawDt = Math.max(0, wallSec - (lastTimeSec ?? wallSec));
    const forward = lastJulianDate !== null && julianDate > lastJulianDate;
    const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const motionEnabled = forward && simState.paused !== true
      && Number(simState.timeScaleDaysPerSec ?? 1) > 0 && !reducedMotion;
    // SCN-038: physical inputs use JD; these procedural visuals and compressed
    // AGN timelines are decorative. Freeze during pause/reverse/reduced motion,
    // discard wall-clock catch-up, and keep shader time near zero for precision.
    const dtSec = motionEnabled ? Math.min(0.1, rawDt) : 0;
    lastTimeSec = wallSec;
    lastJulianDate = julianDate;
    decorativeTimeSec += dtSec;
    const timeSec = decorativeTimeSec;
    const fallbackActivity = fallbackSolarActivityFromJulianDate(julianDate);
    const solarBlendView = buildSolarFeatureBlendView(Date.now(), 480);
    const activity = clampUnit(
      finiteOrNull(solarBlendView?.activityIndex)
        ?? finiteOrNull(solarPhysicsState?.activity_index)
        ?? fallbackActivity
    );
    const observationState = getRenderableObservationState(Date.now());
    const observationSelection = pickAiaObservationChannel(
      observationState,
      undefined,
      userAiaChannelOverride
    );
    if (!loadedObservationMatches(observationSelection)) {
      revokeSolarObservationTexture();
    }
    const observationTextureUsable = loadedObservationMatches(observationSelection);
    // Owner decision D4: in Auto the image still loads and is placed on the Sun, but the
    // false-colour EUV tint applies only once the user picks a wavelength.
    const activeObservationChannel = observationTextureUsable && userAiaChannelOverride
      ? observationSelection?.channel ?? null
      : null;
    const observationControls = deriveSunObservationControls(
      observationState,
      activity,
      activeObservationChannel,
      {
        selectedChannel: userAiaChannelOverride ? observationSelection?.channel ?? activeObservationChannel : null,
        selectedImageDate: observationSelection?.imageDate ?? null,
        hasObservationTexture: observationTextureUsable,
        spatialUseEligible: observationTextureUsable
      }
    );
    const effectiveActivity = clampUnit(activity);
    const sunRadiusAu = getSunRadiusAu();
    const geometryBlendView = solarLayerFrames.loops ? solarBlendView : null;
    const spotState = solarFeaturesInSurfaceFrame(geometryStateFor('spots'), solarLayerFrames.spots, julianDate);
    const cmeState = solarFeaturesInSurfaceFrame(geometryStateFor('cme'), solarLayerFrames.cme, J2000_JD);

    updateSunMaterialUniforms({
      sunSurfaceMaterial,
      sunCoronaMaterial,
      timeSec,
      activity: effectiveActivity,
      observationBlend: observationControls.observationBlend,
      observationEmission: observationControls.observationEmission,
      coronaHue: observationControls.coronaHue ?? undefined,
      sunDisplayRadius: sunRadiusAu,
      activeChannel: activeObservationChannel ?? undefined,
      coronalHoleData: solarHolesInSurfaceFrame(geometryStateFor('coronal_holes'), julianDate)
    });
    updateSunspotUniforms(sunSurfaceMaterial, effectiveActivity, timeSec, spotState ?? undefined);

    if (solarFlareManager) {
      solarFlareManager.update(Math.min(0.1, dtSec), effectiveActivity, sunRadiusAu, cmeState, timeSec);
      updateSunFlaresUniforms(sunSurfaceMaterial, solarFlareParamsInSurfaceFrame(solarFlareManager.getActiveFlaresParams(), julianDate));
    }

    if (sunMagneticFieldGroup) {
      if (!solarLayerFrames.pfss) applySolarGeometryFrame(sunMagneticFieldGroup, { inputFrame: 'IAU_SUN', jdTdb: julianDate });
      sunMagneticFieldGroup.visible = isMagneticFieldEnabled();
      if (sunMagneticFieldGroup.visible) {
        updateMagneticFieldLines(sunMagneticFieldGroup, timeSec, effectiveActivity);
      }
    }

    updateSunCoronalLoopsFromBlendViewImpl(sunCoronalLoopGroup, geometryBlendView, sunRadiusAu, 144, timeSec, activeObservationChannel);
    updateSunParkerSpiralFromPhysicsStateImpl(sunParkerSpiralGroup, geometryStateFor('parker'), sunRadiusAu, 6, 120, timeSec, camera);

    const glowPulse = 1 + Math.sin(timeSec * 1.7) * 0.035 + effectiveActivity * 0.045;
    setSunGlowScaleImpl(sunGlowSprite, sunRadiusAu, glowPulse);
    if (sunGlowSprite?.material) {
      const baseOpacity = sunGlowSprite.userData.baseOpacity ?? 0.42;
      sunGlowSprite.material.opacity = Math.max(0.18, Math.min(0.64, baseOpacity * (0.9 + effectiveActivity * 0.16)));
    }

    updateSunEruptionLayerFromBlendView({
      sunEruptionLayer,
      blendView: solarLayerFrames.cme ? solarBlendView : null,
      sunRadiusAu,
      timeSec,
      activity: effectiveActivity
    });

    updateChromosphereLayer(sunChromosphereLayer, timeSec, effectiveActivity, {
      activeChannel: activeObservationChannel ?? undefined,
      observationBlend: observationControls.observationBlend,
      observationEmission: observationControls.observationEmission,
      observedConfidence: observationControls.observedConfidence,
      observedFreshness: observationControls.observedFreshness
    });

    // Transition Region update — responds to AIA channel selection
    updateTransitionRegionShell(sunTransitionRegionMesh, timeSec, effectiveActivity, {
      activeChannel: activeObservationChannel ?? undefined
    });

    // The background schedule must advance even with no foreground event.
    agnEngine?.update(dtSec);
    syncAgnVisuals();
    if (gwDisplayer && gwDisplayer.mesh.visible) {
      gwDisplayer.update(dtSec);
    }
    if (warpDisplayer && warpDisplayer.mesh.visible) {
      warpDisplayer.update(dtSec);
    }
  }

  function maybeRefreshPhysics(nowMs = Date.now(), force = false) {
    if (solarDeliveryDisposed) return;
    // Realtime observation delivery has its own cadence, deadline, one-flight,
    // and LKG. Run it before the physics gates so imagery does not depend on a
    // successful or even idle `/solar/physics` request.
    maybeRefreshRealtime(nowMs, force);
    maybeRefreshObservationTexture(nowMs, force);

    if (!solarPhysicsClient || solarPhysicsRefreshInFlight) return;
    if (!force && nowMs < solarPhysicsNextRefreshMs) return;

    solarPhysicsRefreshInFlight = true;
    const requestJd = simState.julianDate;

    void solarPhysicsClient.maybeRefresh(requestJd, force)
      .then((updated) => {
        if (solarDeliveryDisposed) return;
        const status = solarPhysicsClient.status();
        if (updated) {
          solarPhysicsState = solarPhysicsClient.latestState();
          const previousCmeFrame = solarLayerFrames.cme;
          solarLayerFrames = validatedSolarLayerFrames(solarPhysicsState);
          if (previousCmeFrame && !solarLayerFrames.cme) solarFlareManager?.dispose();
          maybeRefreshObservationTexture(nowMs, force);
          const normalized = normalizeSolarFeatureSetFromState(solarPhysicsState, 480);
          if (!normalized) {
            solarPhysicsFeatureSetCurrent = null;
            solarPhysicsFeatureSetTarget = null;
          }
          if (normalized) {
            if (!solarPhysicsFeatureSetCurrent) {
              solarPhysicsFeatureSetCurrent = normalized;
              solarPhysicsFeatureSetTarget = null;
              solarPhysicsBlendStartMs = Date.now();
            } else {
              if (solarPhysicsFeatureSetTarget) {
                const inFlightBlend = buildSolarFeatureBlendView(Date.now(), 220);
                const blendedSnapshot = materializeSolarFeatureSetFromBlendView(inFlightBlend);
                solarPhysicsFeatureSetCurrent = blendedSnapshot ?? solarPhysicsFeatureSetTarget;
                solarPhysicsFeatureSetTarget = null;
              }
              solarPhysicsFeatureSetTarget = normalized;
              solarPhysicsBlendStartMs = Date.now();
              const pollMs = Number(status['pollIntervalMs']);
              solarPhysicsBlendDurationMs = Math.max(
                520,
                Math.min(
                  1_350,
                  (Number.isFinite(pollMs) ? pollMs : SOLAR_PHYSICS_POLL_INTERVAL_MS) * 0.9
                )
              );
            }
          }
          rebuildMagneticFieldLines(false, solarPhysicsState?.activity_index);
        }
        const clientNextRefreshMs = Number(status['nextRefreshMs']);
        solarPhysicsNextRefreshMs = Number.isFinite(clientNextRefreshMs)
          ? clientNextRefreshMs
          : Date.now() + SOLAR_PHYSICS_POLL_INTERVAL_MS;
      })
      .finally(() => {
        solarPhysicsRefreshInFlight = false;
        publishSolarDataStatus();
      });
  }

  function maybeRefreshRealtime(nowMs = Date.now(), force = false) {
    if (solarDeliveryDisposed) return;
    const status = solarRealtimeClient.status(nowMs);
    if (status.disposed || status.inFlight) return;
    if (!force && nowMs < status.nextRefreshMs) return;

    void solarRealtimeClient.maybeRefresh(force).then(() => {
      maybeRefreshObservationTexture(Date.now(), force);
    });
  }

  function onScaleChange() {
    const r = getSunRadiusAu();
    setSunGlowScaleImpl(sunGlowSprite, r);
    setSunEruptionBaseRadiusImpl(sunEruptionLayer, r);
    // Rescale the corona shell to match the new sun radius
    if (sunCoronaMesh) {
      sunCoronaMesh.scale.setScalar(r * (sunCoronaMesh.userData.surfaceScale ?? 1.15));
    }
    // Rescale the chromosphere layer
    if (sunChromosphereLayer) {
      const baseRadius = Number(sunChromosphereLayer.userData?.baseRadiusAu) || r;
      const radiusScale = baseRadius > 0 ? (r / baseRadius) : 1;
      const activityScale = Number(sunChromosphereLayer.userData?.activityScale) || 1;
      sunChromosphereLayer.userData.radiusScale = radiusScale;
      sunChromosphereLayer.scale.setScalar(radiusScale * activityScale);
    }
    // Rescale the transition region shell
    if (sunTransitionRegionMesh) {
      const trScale = sunTransitionRegionMesh.userData.surfaceScale ?? 1.006;
      sunTransitionRegionMesh.scale.setScalar(r * trScale);
    }
    rebuildMagneticFieldLines(true);
    const bv = buildSolarFeatureBlendView(Date.now(), 220);
    updateSunCoronalLoopsFromBlendViewImpl(sunCoronalLoopGroup, solarLayerFrames.loops ? bv : null, r, 144);
    updateSunParkerSpiralFromPhysicsStateImpl(
      sunParkerSpiralGroup, geometryStateFor('parker'), r, 6, 120, 0, camera
    );
  }

  function setAiaChannelOverride(channel: string) {
    userAiaChannelOverride = channel === 'auto' ? null : channel;
    maybeRefreshObservationTexture(Date.now(), true);
  }

  function getSolarDeliveryStatus() {
    const observationState = getObservationState();
    const nowMs = Date.now();
    const realtimeStatus = solarRealtimeClient.status(nowMs);
    const observationRenderStatus = solarRealtimeClient.observationRenderStatus(
      nowMs,
      userAiaChannelOverride
    );
    const renderableObservationState = getRenderableObservationState(nowMs);
    const selection = inspectAiaObservationChannel(
      observationState,
      undefined,
      userAiaChannelOverride
    );
    const eligibleSelection = pickAiaObservationChannel(
      renderableObservationState,
      undefined,
      userAiaChannelOverride
    );
    return {
      disposed: solarDeliveryDisposed,
      physics: solarPhysicsClient.status(),
      geometry: {
        layers: { ...solarLayerFrames },
        source: 'synthetic_visualization',
        calibrated: false,
        snapshotEpochJdTdb: solarPhysicsState?.epoch_jd_tdb ?? null
      },
      realtime: realtimeStatus,
      observation: {
        channel: selection?.channel ?? null,
        imageId: selection?.imageId ?? null,
        imageDate: selection?.imageDate ?? null,
        spatialUse: selection?.spatialUse ?? 'unavailable',
        reason: selection?.reason ?? 'no_aia_artifact_available',
        renderEligible: observationRenderStatus.eligible,
        renderReason: observationRenderStatus.reason,
        activeRenderChannel: loadedObservationMatches(eligibleSelection)
          ? eligibleSelection?.channel ?? null
          : null,
        textureLoaded: solarObservationTexture !== null,
        textureChannel: solarObservationTextureChannel,
        textureImageId: solarObservationTextureImageId,
        loadInFlight: solarObservationTextureLoadInFlight
      }
    };
  }

  function disposeSolarDelivery() {
    if (solarDeliveryDisposed) return;
    solarDeliveryDisposed = true;
    solarPhysicsClient.dispose();
    solarRealtimeClient.dispose();
    revokeSolarObservationTexture();
    solarObservationTextureLoadInFlight = false;
    agnEngine?.dispose();
    gwDisplayer?.dispose();
    warpDisplayer?.dispose();
  }

  return {
    createSunMaterial,
    initSunVisuals,
    update,
    updateSurfaceFrame,
    maybeRefreshPhysics,
    maybeRefreshRealtime,
    onScaleChange,
    setAiaChannelOverride,
    getSolarDeliveryStatus,
    disposeSolarDelivery,
    triggerAgnShockwave: (
      source: string,
      impactTimeSec: number,
      intensity: number,
      options: AgnEventOptions
    ) => {
      if (solarDeliveryDisposed) return;
      if (agnEngine) agnEngine.triggerEvent(source, impactTimeSec, intensity, options);
      syncAgnVisuals();
    },
    setAgnStochasticFlaring: (enabled: boolean) => {
      if (solarDeliveryDisposed) return;
      if (agnEngine?.setStochasticFlaring) agnEngine.setStochasticFlaring(enabled);
    },
    getAgnPhysics: () => agnEngine?.getPhysics?.() ?? null,
    getAgnTimeline: () => agnEngine?.getTimeline?.() ?? null,
    getAgnEventPresets: () => agnEngine?.getEventPresets?.() ?? {},
    getAgnSourceCatalog: () => agnEngine?.getSourceCatalog?.() ?? {},
    get magneticFieldGroup() { return sunMagneticFieldGroup; },
    get surfaceMaterial() { return sunSurfaceMaterial; },

    resetAgnEvent: () => { agnEngine?.reset(); syncAgnVisuals(); },
    // Expose display-only warp state; never an orbital perturbation.
    getWarpState: () => agnEngine?.getWarpState?.() ?? null,
    getWarpInfoText: () => warpDisplayer?.getInfoText?.() ?? null
  };
}
