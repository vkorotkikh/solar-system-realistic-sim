import { Group } from 'three';
import { J2000_JD } from './constants.js';
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
  updateSunMaterialUniforms,
  updateSunspotUniforms,
  updateSunFlaresUniforms,
  createChromosphereLayer,
  updateChromosphereLayer
} from './frontend/features/solar/sunVisuals.js';
import { SolarFlareManager } from './frontend/features/solar/solarFlares.js';
import { createMagneticFieldLines, updateMagneticFieldLines } from './frontend/features/solar/solarMagnetics.js';
import {
  clampUnit,
  normalizeSolarFeatureSetFromState as normalizeSolarFeatureSetFromStateImpl,
  buildSolarFeatureBlendView as buildSolarFeatureBlendViewImpl,
  materializeSolarFeatureSetFromBlendView as materializeSolarFeatureSetFromBlendViewImpl
} from './frontend/features/solar/solarFeatureBlending.js';
import { createGWVisualization } from './frontend/features/solar/gravitationalWaves.js';
import { createAgnShockwaveEngine } from './frontend/features/solar/agnShockwaveEngine.js';
import {
  buildAiaProxyTextureUrl,
  deriveSunObservationControls,
  pickAiaObservationChannel
} from './frontend/features/solar/solarObservationTexture.js';

const TWO_PI = Math.PI * 2;
const CYCLE_25_START_JD = 2_458_849.5;
const CYCLE_LENGTH_MONTHS = 132.0;
const MEAN_MONTH_DAYS = 30.44;
const HATHAWAY_B = 54.0;
const HATHAWAY_C = 0.71;

function hathawayRaw(tMonths, b = HATHAWAY_B, c = HATHAWAY_C) {
  if (!Number.isFinite(tMonths) || tMonths <= 0) return 0;
  const ratio = tMonths / Math.max(1e-6, b);
  const ratio2 = ratio * ratio;
  const ratio3 = ratio2 * ratio;
  const denom = Math.exp(ratio2) - c;
  if (denom <= 1e-12) return 0;
  return ratio3 / denom;
}

function hathawayNormalized(tMonths) {
  const tPeak = HATHAWAY_B * Math.sqrt(1.5);
  const peak = hathawayRaw(tPeak);
  if (peak <= 1e-12) return 0;
  return Math.max(0, Math.min(1, hathawayRaw(tMonths) / peak));
}

function fallbackSolarActivityFromJulianDate(julianDate) {
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
 */
export function createSunController({
  camera,
  simState,
  backendBaseUrl,
  configureLoadedTexture,
  observationTextureLoader,
  getSunRadiusAu,
  isMagneticFieldEnabled
}) {
  let sunSurfaceMaterial = null;
  let sunCoronaMaterial = null;
  let sunGlowSprite = null;
  let sunEruptionLayer = null;
  let sunChromosphereLayer = null;
  let sunFlareGroup = null;
  let solarFlareManager = null;
  let sunMagneticFieldGroup = null;
  let sunCoronalLoopGroup = null;
  let sunParkerSpiralGroup = null;

  let gwDisplayer = null;
  let agnEngine = null;

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
  let userAiaChannelOverride = null;
  let lastTimeSec = null;

  const solarPhysicsClient = new SolarPhysicsClient({
    baseUrl: backendBaseUrl,
    pollIntervalMs: 900,
    timeoutMs: 2_600,
    maxFeatures: 180,
    fidelity: 'high',
    forcing: 'hybrid',
    liveData: true
  });

  // ── internal helpers ─────────────────────────────────────────────────────

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

  function normalizeSolarFeatureSetFromState(physicsState, featureLimit = 220) {
    return normalizeSolarFeatureSetFromStateImpl(physicsState, simState.julianDate, featureLimit);
  }

  function materializeSolarFeatureSetFromBlendView(blendView) {
    return materializeSolarFeatureSetFromBlendViewImpl(blendView, simState.julianDate);
  }

  function applySunObservationTextureToMaterials() {
    setSunObservationTexture({ sunSurfaceMaterial, observationTexture: solarObservationTexture });
  }

  function maybeRefreshObservationTexture(nowMs = Date.now(), force = false) {
    if (solarObservationTextureLoadInFlight || !solarPhysicsState) return;

    const selection = pickAiaObservationChannel(solarPhysicsState, undefined, userAiaChannelOverride);
    if (!selection) return;

    const nextImageId = `${selection.imageId ?? ''}`;
    const nextChannel = `${selection.channel ?? ''}`.toLowerCase();
    if (!nextImageId || !nextChannel) return;
    if (!force && nextImageId === solarObservationTextureImageId && nextChannel === solarObservationTextureChannel) return;
    if (!force && nowMs - solarObservationTextureLastLoadMs < 12_000) return;

    const proxyUrl = buildAiaProxyTextureUrl(backendBaseUrl(), nextChannel, nextImageId);
    if (!proxyUrl) return;

    solarObservationTextureLoadInFlight = true;
    solarObservationTextureLastLoadMs = nowMs;
    observationTextureLoader.load(
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
      () => { solarObservationTextureLoadInFlight = false; }
    );
  }

  // ── public API ───────────────────────────────────────────────────────────

  function createSunMaterial(sunTexture) {
    if (!sunTexture) return null;
    sunSurfaceMaterial = createSunSurfaceMaterial(sunTexture);
    applySunObservationTextureToMaterials();
    return sunSurfaceMaterial;
  }

  function initSunVisuals({ spinGroup, node, sunBody, sunGeometry, meshRotationOffsetRad = 0 }) {
    const sunRadiusAu = getSunRadiusAu();

    sunGlowSprite = createSunGlow(sunRadiusAu);
    node.add(sunGlowSprite);

    const coronaMesh = createSunCoronaShell(sunGeometry);
    coronaMesh.scale.setScalar(sunRadiusAu * (coronaMesh.userData.surfaceScale ?? 1.15));
    spinGroup.add(coronaMesh);
    sunCoronaMaterial = coronaMesh.material;

    sunEruptionLayer = createSunEruptionLayer(sunRadiusAu);
    sunEruptionLayer.userData.rotationPeriodHours = sunBody.rotationPeriodHours ?? null;
    sunEruptionLayer.userData.rotationOffsetRad = meshRotationOffsetRad;
    spinGroup.add(sunEruptionLayer);
    setSunEruptionBaseRadiusImpl(sunEruptionLayer, sunRadiusAu);

    sunChromosphereLayer = createChromosphereLayer(sunRadiusAu, 8000);
    sunChromosphereLayer.userData.rotationPeriodHours = sunBody.rotationPeriodHours ?? null;
    spinGroup.add(sunChromosphereLayer);

    sunFlareGroup = new Group();
    sunFlareGroup.userData.bodyId = 'sun-flares';
    spinGroup.add(sunFlareGroup);
    solarFlareManager = new SolarFlareManager(sunFlareGroup);

    sunMagneticFieldGroup = createMagneticFieldLines(sunRadiusAu, 0.5);
    sunMagneticFieldGroup.visible = isMagneticFieldEnabled();
    node.add(sunMagneticFieldGroup);

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
    spinGroup.add(sunCoronalLoopGroup);
    const initialBlend = buildSolarFeatureBlendView(Date.now(), 220);
    updateSunCoronalLoopsFromBlendViewImpl(sunCoronalLoopGroup, initialBlend, sunRadiusAu, 144);

    sunParkerSpiralGroup = new Group();
    sunParkerSpiralGroup.userData.bodyId = 'sun-parker-spiral';
    node.add(sunParkerSpiralGroup);
    updateSunParkerSpiralFromPhysicsStateImpl(sunParkerSpiralGroup, solarPhysicsState, sunRadiusAu, 6, 120, 0, camera);

    // Agn Shockwave Engine
    gwDisplayer = createGWVisualization(400); // Massive grid
    node.add(gwDisplayer.mesh);

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
      triggerMassiveAgnFlare: (intensity) => {
        if (solarFlareManager) {
          const currentSunRadiusAu = getSunRadiusAu();
          // Spawn 3 massive CMEs wrapping the sun
          solarFlareManager.spawnRandomFlare(intensity * 1.5, currentSunRadiusAu);
          solarFlareManager.spawnRandomFlare(intensity * 1.5, currentSunRadiusAu);
          solarFlareManager.spawnRandomFlare(intensity * 2.0, currentSunRadiusAu);
        }
      }
    });
  }

  function update(julianDate, realtimeSeconds) {
    const timeSec = Number.isFinite(realtimeSeconds) ? realtimeSeconds : performance.now() * 0.001;
    const rawDt = Math.max(0, timeSec - (lastTimeSec ?? timeSec));
    const dtSec = Math.min(0.25, rawDt);
    lastTimeSec = timeSec;
    const fallbackActivity = fallbackSolarActivityFromJulianDate(julianDate);
    const solarBlendView = buildSolarFeatureBlendView(Date.now(), 480);
    const blendedActivityRaw = Number(solarBlendView?.activityIndex);
    const backendActivityRaw = Number(solarPhysicsState?.activity_index);
    const activity = Number.isFinite(blendedActivityRaw)
      ? clampUnit(blendedActivityRaw)
      : (Number.isFinite(backendActivityRaw) ? clampUnit(backendActivityRaw) : fallbackActivity);
    const observationControls = deriveSunObservationControls(solarPhysicsState, activity, userAiaChannelOverride);
    const effectiveActivity = clampUnit(activity + (observationControls.activityBoost ?? 0));

    updateSunMaterialUniforms({
      sunSurfaceMaterial,
      sunCoronaMaterial,
      timeSec,
      activity: effectiveActivity,
      observationBlend: observationControls.observationBlend,
      observationEmission: observationControls.observationEmission,
      coronaHue: observationControls.coronaHue
    });
    updateSunspotUniforms(sunSurfaceMaterial, effectiveActivity, timeSec);

    const sunRadiusAu = getSunRadiusAu();

    if (solarFlareManager) {
      solarFlareManager.update(Math.min(0.1, dtSec), effectiveActivity, sunRadiusAu);
      updateSunFlaresUniforms(sunSurfaceMaterial, solarFlareManager.getActiveFlaresParams());
    }

    if (sunMagneticFieldGroup) {
      sunMagneticFieldGroup.visible = isMagneticFieldEnabled();
      if (sunMagneticFieldGroup.visible) {
        updateMagneticFieldLines(sunMagneticFieldGroup, timeSec);
      }
    }

    updateSunCoronalLoopsFromBlendViewImpl(sunCoronalLoopGroup, solarBlendView, sunRadiusAu, 144, timeSec);
    updateSunParkerSpiralFromPhysicsStateImpl(sunParkerSpiralGroup, solarPhysicsState, sunRadiusAu, 6, 120, timeSec, camera);

    const glowPulse = 1 + Math.sin(timeSec * 1.7) * 0.035 + effectiveActivity * 0.045;
    setSunGlowScaleImpl(sunGlowSprite, sunRadiusAu, glowPulse);
    if (sunGlowSprite?.material) {
      const baseOpacity = sunGlowSprite.userData.baseOpacity ?? 0.42;
      sunGlowSprite.material.opacity = Math.max(0.18, Math.min(0.64, baseOpacity * (0.9 + effectiveActivity * 0.16)));
    }

    updateSunEruptionLayerFromBlendView({
      sunEruptionLayer,
      blendView: solarBlendView,
      sunRadiusAu,
      timeSec,
      activity: effectiveActivity
    });

    const is304Mode = userAiaChannelOverride === 'aia_304';
    updateChromosphereLayer(sunChromosphereLayer, timeSec, effectiveActivity, is304Mode);

    if (gwDisplayer && gwDisplayer.mesh.visible) {
      gwDisplayer.update(dtSec);
    }
    if (agnEngine && agnEngine.isActive()) {
      agnEngine.update(dtSec);
    }
  }

  function maybeRefreshPhysics(nowMs = Date.now(), force = false) {
    if (!solarPhysicsClient || solarPhysicsRefreshInFlight) return;
    if (!force && nowMs < solarPhysicsNextRefreshMs) return;

    solarPhysicsRefreshInFlight = true;
    const requestJd = simState.julianDate;

    void solarPhysicsClient.maybeRefresh(requestJd, force)
      .then((updated) => {
        const status = solarPhysicsClient.status();
        if (updated) {
          solarPhysicsState = solarPhysicsClient.latestState();
          maybeRefreshObservationTexture(nowMs, force);
          const normalized = normalizeSolarFeatureSetFromState(solarPhysicsState, 480);
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
              const pollMs = Number(status.pollIntervalMs);
              solarPhysicsBlendDurationMs = Math.max(520, Math.min(1_350, (Number.isFinite(pollMs) ? pollMs : 900) * 0.9));
            }
          }
        }
        solarPhysicsNextRefreshMs = nowMs + (status.lastError ? 6_000 : status.pollIntervalMs);
      })
      .finally(() => { solarPhysicsRefreshInFlight = false; });
  }

  function onScaleChange() {
    const r = getSunRadiusAu();
    setSunGlowScaleImpl(sunGlowSprite, r);
    setSunEruptionBaseRadiusImpl(sunEruptionLayer, r);
    const bv = buildSolarFeatureBlendView(Date.now(), 220);
    updateSunCoronalLoopsFromBlendViewImpl(sunCoronalLoopGroup, bv, r, 144);
    updateSunParkerSpiralFromPhysicsStateImpl(sunParkerSpiralGroup, solarPhysicsState, r, 6, 120, 0, camera);
  }

  function setAiaChannelOverride(channel) {
    userAiaChannelOverride = channel === 'auto' ? null : channel;
    maybeRefreshObservationTexture(Date.now(), true);
  }

  return {
    createSunMaterial,
    initSunVisuals,
    update,
    maybeRefreshPhysics,
    onScaleChange,
    setAiaChannelOverride,
    setAgnObserverFrameMode: (enabled) => {
      if (agnEngine?.setObserverFrameMode) agnEngine.setObserverFrameMode(enabled);
    },
    triggerAgnShockwave: (source, impactTimeSec, intensity, options) => {
      if (agnEngine) agnEngine.triggerEvent(source, impactTimeSec, intensity, options);
    },
    setAgnStochasticFlaring: (enabled) => {
      if (agnEngine?.setStochasticFlaring) agnEngine.setStochasticFlaring(enabled);
    },
    getAgnPhysics: () => agnEngine?.getPhysics?.() ?? null,
    getAgnTimeline: () => agnEngine?.getTimeline?.() ?? null,
    getAgnEventPresets: () => agnEngine?.getEventPresets?.() ?? {},
    getAgnSourceCatalog: () => agnEngine?.getSourceCatalog?.() ?? {},
    get magneticFieldGroup() { return sunMagneticFieldGroup; },
    get surfaceMaterial() { return sunSurfaceMaterial; }
  };
}
