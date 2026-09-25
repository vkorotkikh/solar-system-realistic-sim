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

type AiaChannelKey = keyof typeof CHANNEL_VISUAL_WEIGHTS;

interface AiaChannelEntryLike {
  image_id?: unknown;
  image_date?: unknown;
  tile_url?: unknown;
}

interface AiaSourceLike {
  freshness_proxy?: unknown;
  activity_proxy?: unknown;
  channel_activity_proxy?: Record<string, unknown> | null;
  visualization?: {
    preferred_channel?: unknown;
  } | null;
  channels?: Record<string, AiaChannelEntryLike> | null;
}

export interface SolarObservationPhysicsStateLike {
  data_assimilation?: {
    mode?: unknown;
    applied?: unknown;
    blend_weight?: unknown;
    live_data_available?: unknown;
    observed_confidence?: unknown;
    sources?: {
      sdo_aia?: AiaSourceLike | null;
    } | null;
  } | null;
}

interface PickedAiaChannel {
  channel: string;
  imageId: string;
  imageDate: string | null;
  tileUrl: string;
}

function isKnownAiaChannel(value: string): value is AiaChannelKey {
  return Object.prototype.hasOwnProperty.call(CHANNEL_VISUAL_WEIGHTS, value);
}

function asFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function asFreshnessProxy(imageDate: unknown): number | null {
  if (typeof imageDate !== 'string' || !imageDate) return null;
  const parsedMs = Date.parse(imageDate);
  if (!Number.isFinite(parsedMs)) return null;
  const ageMs = Math.max(0, Date.now() - parsedMs);
  return clampUnit(1 - ageMs / (6 * 3_600_000));
}

export function pickAiaObservationChannel(
  physicsState: SolarObservationPhysicsStateLike | null | undefined,
  preferredOrder = DEFAULT_AIA_CHANNEL_PRIORITY,
  overrideChannel: string | null = null
): PickedAiaChannel | null {
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

export function buildAiaProxyTextureUrl(
  baseUrl: string | null | undefined,
  channel: string | null | undefined,
  imageId: string | null = null
): string | null {
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

export function deriveSunObservationControls(
  physicsState: SolarObservationPhysicsStateLike | null | undefined,
  fallbackActivity = 0.5,
  activeChannel = null as string | null,
  {
    hasObservationTexture = false,
    selectedChannel = undefined as string | null | undefined,
    selectedImageDate = undefined as string | null | undefined
  } = {}
) {
  const assimilation = physicsState?.data_assimilation;
  const sdoAia = assimilation?.sources?.sdo_aia;
  const selectedChannelKey = `${selectedChannel ?? activeChannel ?? ''}`.trim().toLowerCase() || null;
  const selectedEntry = selectedChannelKey ? sdoAia?.channels?.[selectedChannelKey] : null;

  const confidenceRaw = asFiniteNumber(assimilation?.observed_confidence);
  const confidence = confidenceRaw !== null ? clampUnit(confidenceRaw) : 0;

  const freshnessRaw = asFiniteNumber(sdoAia?.freshness_proxy);
  const selectedFreshness = asFreshnessProxy(selectedImageDate ?? selectedEntry?.image_date);
  const observedFreshness = clampUnit(
    Math.max(
      freshnessRaw !== null ? freshnessRaw : 0,
      selectedFreshness !== null ? selectedFreshness : 0
    )
  );

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
  const channelActivityRaw = selectedChannelKey && sdoAia?.channel_activity_proxy && typeof sdoAia.channel_activity_proxy === 'object'
    ? asFiniteNumber(sdoAia.channel_activity_proxy[selectedChannelKey])
    : null;
  const channelActivity = channelActivityRaw !== null ? clampUnit(channelActivityRaw) : sdoSignal;

  const assimilationApplied = assimilation?.applied === true;
  const imageryQuality = clampUnit(
    confidence * 0.52
    + observedFreshness * 0.28
    + channelActivity * 0.20
  );
  let observationBlend = clampUnit(
    (assimilationApplied ? 0.10 : 0.03)
    + confidence * (assimilationApplied ? 0.42 : 0.12)
    + observedFreshness * 0.18
    + sdoSignal * 0.10
  );
  let observationEmission = clampUnit(0.12 + sdoSignal * 0.60 + channelActivity * 0.18 + observedFreshness * 0.10);

  if (!hasObservationTexture) {
    observationBlend *= 0.42;
    observationEmission *= 0.78;
  }

  const channelKey = selectedChannelKey && selectedChannelKey !== 'auto' ? selectedChannelKey : null;
  const weights = channelKey && isKnownAiaChannel(channelKey)
    ? CHANNEL_VISUAL_WEIGHTS[channelKey]
    : null;

  let coronaHue = null;
  let activityBoost = 0;

  if (weights) {
    const channelInfluence = clampUnit(
      (hasObservationTexture ? 0.24 : 0.02)
      + imageryQuality * 0.76
    );
    observationBlend = clampUnit(observationBlend + weights.blendBoost * channelInfluence);
    observationEmission = clampUnit(observationEmission + weights.emissionBoost * channelInfluence);
    activityBoost = (weights.activityBoost ?? 0) * channelInfluence;
    coronaHue = channelInfluence > 0.08 ? (weights.coronaHue ?? null) : null;
  }

  return {
    observationBlend,
    observationEmission,
    observedSignal: sdoSignal,
    observedConfidence: confidence,
    observedFreshness,
    coronaHue,
    activityBoost
  };
}
