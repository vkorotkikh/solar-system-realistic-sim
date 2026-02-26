// @ts-nocheck
import { clampUnit } from './solarFeatureBlending';

const DEFAULT_AIA_CHANNEL_PRIORITY = ['aia_193', 'aia_211', 'aia_171', 'aia_094', 'aia_304'];

export const AIA_CHANNEL_OPTIONS = [
  { value: 'auto', label: 'Auto (best available)' },
  { value: 'aia_094', label: '94 \u00C5 \u2013 Flare plasma' },
  { value: 'aia_171', label: '171 \u00C5 \u2013 Quiet corona' },
  { value: 'aia_193', label: '193 \u00C5 \u2013 Active corona' },
  { value: 'aia_211', label: '211 \u00C5 \u2013 Active regions' },
  { value: 'aia_304', label: '304 \u00C5 \u2013 Chromosphere' },
];

export const CHANNEL_VISUAL_WEIGHTS = {
  aia_094: { blendBoost: 0.35, emissionBoost: 0.60, activityBoost: 0.40, coronaHue: [0.2, 1.0, 0.95] },
  aia_171: { blendBoost: 0.30, emissionBoost: 0.25, activityBoost: 0.10, coronaHue: [0.08, 0.85, 0.45] },
  aia_193: { blendBoost: 0.25, emissionBoost: 0.35, activityBoost: 0.20, coronaHue: [1.0, 0.72, 0.30] },
  aia_211: { blendBoost: 0.30, emissionBoost: 0.45, activityBoost: 0.30, coronaHue: [0.85, 0.50, 1.0] },
  aia_304: { blendBoost: 0.35, emissionBoost: 0.55, activityBoost: 0.35, coronaHue: [1.0, 0.18, 0.08] },
};

function asFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function pickAiaObservationChannel(physicsState, preferredOrder = DEFAULT_AIA_CHANNEL_PRIORITY, overrideChannel = null) {
  const sdoAia = physicsState?.data_assimilation?.sources?.sdo_aia;
  if (!sdoAia || typeof sdoAia !== 'object') return null;

  const channels = sdoAia?.channels;
  if (!channels || typeof channels !== 'object') return null;

  const visualizationPreferred = `${sdoAia?.visualization?.preferred_channel ?? ''}`.toLowerCase();
  const orderedChannels = [];
  if (overrideChannel && overrideChannel !== 'auto') {
    orderedChannels.push(overrideChannel.toLowerCase());
  }
  if (visualizationPreferred && !orderedChannels.includes(visualizationPreferred)) orderedChannels.push(visualizationPreferred);
  for (const channel of preferredOrder) {
    const normalized = `${channel ?? ''}`.toLowerCase();
    if (!normalized || orderedChannels.includes(normalized)) continue;
    orderedChannels.push(normalized);
  }
  for (const channel of Object.keys(channels)) {
    const normalized = `${channel ?? ''}`.toLowerCase();
    if (!normalized || orderedChannels.includes(normalized)) continue;
    orderedChannels.push(normalized);
  }

  for (const channel of orderedChannels) {
    const entry = channels[channel];
    if (!entry || typeof entry !== 'object') continue;
    const imageId = entry?.image_id;
    const tileUrl = entry?.tile_url;
    if (typeof imageId !== 'string' || !imageId) continue;
    if (typeof tileUrl !== 'string' || !tileUrl) continue;
    return {
      channel,
      imageId,
      imageDate: typeof entry?.image_date === 'string' ? entry.image_date : null,
      tileUrl
    };
  }

  return null;
}

export function buildAiaProxyTextureUrl(baseUrl, channel, imageId = null) {
  const base = `${baseUrl ?? ''}`.trim().replace(/\/+$/, '');
  const normalizedChannel = `${channel ?? ''}`.trim().toLowerCase();
  if (!base || !normalizedChannel) return null;

  const query = new URLSearchParams({ channel: normalizedChannel });
  if (imageId) {
    query.set('image_id', `${imageId}`);
    query.set('v', `${imageId}`);
  }
  return `${base}/solar/realtime/aia-tile?${query.toString()}`;
}

export function deriveSunObservationControls(physicsState, fallbackActivity = 0.5, activeChannel = null) {
  const assimilation = physicsState?.data_assimilation;
  const sdoAia = assimilation?.sources?.sdo_aia;

  const confidenceRaw = asFiniteNumber(assimilation?.observed_confidence);
  const confidence = confidenceRaw !== null ? clampUnit(confidenceRaw) : 0;

  let sdoSignal = asFiniteNumber(sdoAia?.activity_proxy);
  if (sdoSignal === null && sdoAia?.channel_activity_proxy && typeof sdoAia.channel_activity_proxy === 'object') {
    const values = Object.values(sdoAia.channel_activity_proxy)
      .map(asFiniteNumber)
      .filter((value) => value !== null);
    if (values.length > 0) {
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      sdoSignal = clampUnit(mean);
    }
  }
  if (sdoSignal === null) {
    const freshnessProxy = asFiniteNumber(sdoAia?.freshness_proxy);
    if (freshnessProxy !== null) {
      sdoSignal = clampUnit(freshnessProxy * 0.7);
    }
  }
  if (sdoSignal === null) {
    sdoSignal = clampUnit(asFiniteNumber(fallbackActivity) ?? 0.5);
  }

  const assimilationApplied = assimilation?.applied === true;
  let observationBlend = clampUnit(
    (assimilationApplied ? 0.12 : 0.04)
    + confidence * (assimilationApplied ? 0.52 : 0.14)
    + sdoSignal * 0.12
  );
  let observationEmission = clampUnit(0.16 + sdoSignal * 0.78);

  const channelKey = activeChannel && activeChannel !== 'auto' ? activeChannel : null;
  const weights = channelKey ? (CHANNEL_VISUAL_WEIGHTS[channelKey] ?? null) : null;

  let coronaHue = null;
  let activityBoost = 0;

  if (weights) {
    // When a specific channel is actively selected, force strong visual impact
    // even without backend data, so the user sees an immediate dramatic change
    observationBlend = clampUnit(observationBlend + weights.blendBoost);
    observationEmission = clampUnit(observationEmission + weights.emissionBoost);
    activityBoost = weights.activityBoost ?? 0;
    coronaHue = weights.coronaHue ?? null;
  }

  return {
    observationBlend,
    observationEmission,
    observedSignal: sdoSignal,
    observedConfidence: confidence,
    coronaHue,
    activityBoost
  };
}
