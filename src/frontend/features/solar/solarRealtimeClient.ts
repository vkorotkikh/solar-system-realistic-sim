import { clamp } from '../../../constants';
import {
  inspectAiaObservationChannel,
  type AiaSpatialUseStatus,
  type SolarObservationPhysicsStateLike
} from './solarObservationTexture';

// `/solar/realtime` is backed by a 120 s server cache. Polling faster only
// increases admission pressure without producing newer upstream observations.
// Keep the request deadline above the backend's 12 s heavy-work ceiling while
// bounding browser-side abandonment at 15 s.
export const SOLAR_REALTIME_POLL_INTERVAL_MS = 120_000;
export const SOLAR_REALTIME_REQUEST_TIMEOUT_MS = 15_000;
export const SOLAR_REALTIME_ERROR_BACKOFF_MS = 30_000;
export const SOLAR_AIA_MAX_RENDER_AGE_MS = 6 * 60 * 60 * 1_000;
const SOLAR_REALTIME_MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

export type SolarRealtimeSilsoCoverageStatus =
  | 'current_for_published_coverage'
  | 'lagging_within_age_bound'
  | 'outside_age_bound'
  | 'outside_published_coverage';

export interface SolarRealtimeSilsoCoverage {
  policy: 'through_last_elapsed_month';
  latest_expected_date: string;
  status: SolarRealtimeSilsoCoverageStatus;
}

export interface SolarRealtimeSourceStatus {
  ok: boolean;
  updated?: string | null;
  endpoint?: string;
  error?: string;
  reason?: string;
  source_age_days?: number;
  coverage?: SolarRealtimeSilsoCoverage;
  delivered_at_utc?: string;
  [key: string]: unknown;
}

export interface SolarRealtimeSilsoSnapshot {
  schema: {
    name: 'wdc_silso_daily_total_sunspot_number';
    version: 2;
  };
  date: string;
  source_age_days?: number;
  coverage?: SolarRealtimeSilsoCoverage;
  [key: string]: unknown;
}

export interface SolarRealtimeAiaChannel {
  source_id?: number;
  image_id: string | null;
  image_date: string | null;
  tile_url: string | null;
  artifact: Record<string, unknown>;
  spatial_use: {
    eligible: boolean;
    reason: string | null;
    contract: Record<string, unknown> | null;
  };
  [key: string]: unknown;
}

export interface SolarRealtimeAiaSnapshot {
  request_date_utc?: string;
  channels: Record<string, SolarRealtimeAiaChannel>;
  channel_activity_proxy?: Record<string, number> | null;
  latest_image_date_utc?: string | null;
  freshness_s?: number | null;
  freshness_proxy?: number | null;
  activity_proxy?: number | null;
  visualization?: {
    preferred_channel?: string | null;
    preferred_image_id?: string | null;
    preferred_tile_url?: string | null;
    preferred_proxy_path?: string | null;
  } | null;
  [key: string]: unknown;
}

export interface SolarRealtimeSnapshot {
  schema: {
    name: 'solar_realtime_context';
    version: 1;
  };
  fetched_at_utc: string;
  source_status: {
    swpc: SolarRealtimeSourceStatus;
    silso: SolarRealtimeSourceStatus;
    sdo_aia: SolarRealtimeSourceStatus;
    gong_synoptic: SolarRealtimeSourceStatus;
  };
  swpc: Record<string, unknown> | null;
  silso: SolarRealtimeSilsoSnapshot | null;
  sdo_aia: SolarRealtimeAiaSnapshot | null;
  gong_synoptic: Record<string, unknown> | null;
  combined_activity_proxy: number | null;
  [key: string]: unknown;
}

export interface SolarRealtimePayload {
  schema: {
    name: 'solar_realtime_endpoint';
    version: 1;
  };
  source: 'backend';
  snapshot: SolarRealtimeSnapshot;
}

export interface SolarRealtimeClientStatus {
  source: 'backend' | null;
  freshness: 'unavailable' | 'fresh' | 'stale';
  snapshotFetchedAtUtc: string | null;
  snapshotAgeMs: number | null;
  aiaUpdatedAtUtc: string | null;
  aiaSpatialUse: AiaSpatialUseStatus | 'unavailable';
  aiaSpatialReason: string | null;
  aiaRenderEligible: boolean;
  aiaRenderReason: string | null;
  aiaRenderAgeMs: number | null;
  aiaMaxRenderAgeMs: number;
  sourceStatus: SolarRealtimeSnapshot['source_status'] | null;
  lastError: string | null;
  lastSuccessMs: number;
  lastAttemptMs: number;
  lastLatencyMs: number;
  nextRefreshMs: number;
  pollIntervalMs: number;
  timeoutMs: number;
  inFlight: boolean;
  disposed: boolean;
}

export interface SolarAiaRenderStatus {
  eligible: boolean;
  reason: string | null;
  ageMs: number | null;
  maxAgeMs: number;
}

interface SolarRealtimeClientOptions {
  baseUrl: () => string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  errorBackoffMs?: number;
  staleAfterMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function requireSchema(
  value: unknown,
  expectedName: string,
  expectedVersion: number,
  context: string
): void {
  if (
    !isRecord(value) ||
    value.name !== expectedName ||
    value.version !== expectedVersion
  ) {
    throw new Error(
      `${context} schema must be ${expectedName} version ${expectedVersion}`
    );
  }
}

function requireUtcTimestamp(value: unknown, context: string): string {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${context} must be a parseable UTC timestamp`);
  }
  return value;
}

function requireIsoUtcTimestamp(value: unknown, context: string): string {
  const match = typeof value === 'string'
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/.exec(value)
    : null;
  if (!match) {
    throw new Error(`${context} must be an ISO UTC timestamp`);
  }
  const timestamp = value as string;
  const parsed = new Date(timestamp);
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  if (
    !Number.isFinite(parsed.getTime())
    || parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() + 1 !== month
    || parsed.getUTCDate() !== day
    || parsed.getUTCHours() !== hour
    || parsed.getUTCMinutes() !== minute
    || parsed.getUTCSeconds() !== second
  ) {
    throw new Error(`${context} must be an ISO UTC timestamp`);
  }
  return timestamp;
}

function requireIsoDate(value: unknown, context: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${context} must be an ISO calendar date`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${context} must be an ISO calendar date`);
  }
  return value;
}

function requireNonnegativeInteger(value: unknown, context: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`${context} must be a finite nonnegative integer`);
  }
  return value;
}

const SILSO_COVERAGE_STATUSES = new Set<SolarRealtimeSilsoCoverageStatus>([
  'current_for_published_coverage',
  'lagging_within_age_bound',
  'outside_age_bound',
  'outside_published_coverage'
]);

function validateSilsoCoverage(value: unknown, context: string): SolarRealtimeSilsoCoverage {
  if (
    !isRecord(value)
    || value.policy !== 'through_last_elapsed_month'
    || typeof value.status !== 'string'
    || !SILSO_COVERAGE_STATUSES.has(value.status as SolarRealtimeSilsoCoverageStatus)
  ) {
    throw new Error(`${context} has an invalid SILSO coverage policy or status`);
  }
  requireIsoDate(value.latest_expected_date, `${context}.latest_expected_date`);
  return value as unknown as SolarRealtimeSilsoCoverage;
}

function validateSilsoDateDerivedState(rawStatus: Record<string, unknown>): void {
  if (typeof rawStatus.updated !== 'string' || !isRecord(rawStatus.coverage)) return;
  const coverage = rawStatus.coverage as unknown as SolarRealtimeSilsoCoverage;
  const updated = rawStatus.updated;
  if (
    (coverage.status === 'current_for_published_coverage'
      && updated !== coverage.latest_expected_date)
    || (coverage.status === 'lagging_within_age_bound'
      && updated >= coverage.latest_expected_date)
    || (coverage.status === 'outside_age_bound'
      && updated > coverage.latest_expected_date)
    || (coverage.status === 'outside_published_coverage'
      && updated <= coverage.latest_expected_date)
  ) {
    throw new Error('Solar realtime SILSO coverage status is inconsistent with its dates');
  }

  if (typeof rawStatus.delivered_at_utc !== 'string') return;
  const delivered = new Date(rawStatus.delivered_at_utc);
  const expectedCutoff = new Date(Date.UTC(
    delivered.getUTCFullYear(),
    delivered.getUTCMonth(),
    0
  )).toISOString().slice(0, 10);
  if (coverage.latest_expected_date !== expectedCutoff) {
    throw new Error('Solar realtime SILSO coverage cutoff is inconsistent with delivery UTC');
  }

  if (hasOwn(rawStatus, 'source_age_days')) {
    const deliveredDay = Date.UTC(
      delivered.getUTCFullYear(),
      delivered.getUTCMonth(),
      delivered.getUTCDate()
    );
    const observationDay = new Date(`${updated}T00:00:00Z`).getTime();
    const expectedAgeDays = (deliveredDay - observationDay) / 86_400_000;
    if (rawStatus.source_age_days !== expectedAgeDays) {
      throw new Error('Solar realtime SILSO source age is inconsistent with delivery UTC');
    }
  }
}

function validateSilsoDelivery(
  payload: unknown,
  rawStatus: unknown
): SolarRealtimeSilsoSnapshot | null {
  if (!isRecord(rawStatus)) {
    throw new Error('Solar realtime SILSO source status must be an object');
  }
  if (hasOwn(rawStatus, 'source_age_days')) {
    requireNonnegativeInteger(
      rawStatus.source_age_days,
      'Solar realtime SILSO source status source_age_days'
    );
  }
  if (hasOwn(rawStatus, 'coverage')) {
    validateSilsoCoverage(rawStatus.coverage, 'Solar realtime SILSO source status coverage');
  }
  if (hasOwn(rawStatus, 'delivered_at_utc')) {
    requireIsoUtcTimestamp(
      rawStatus.delivered_at_utc,
      'Solar realtime SILSO source status delivered_at_utc'
    );
  }
  if (hasOwn(rawStatus, 'reason')) {
    const reasons = new Set([
      'invalid_delivery_date',
      'outside_published_coverage',
      'outside_source_age_bound'
    ]);
    if (typeof rawStatus.reason !== 'string' || !reasons.has(rawStatus.reason)) {
      throw new Error('Solar realtime SILSO source status reason is invalid');
    }
  }

  if (hasOwn(rawStatus, 'updated') && rawStatus.updated !== null) {
    requireIsoDate(rawStatus.updated, 'Solar realtime SILSO source status updated');
  }
  validateSilsoDateDerivedState(rawStatus);
  if (rawStatus.ok === true && hasOwn(rawStatus, 'reason')) {
    throw new Error('Solar realtime SILSO successful status cannot carry a failure reason');
  }

  if (payload === null) {
    if (rawStatus.ok === true) {
      throw new Error('Solar realtime SILSO null payload cannot claim success');
    }
    if (rawStatus.reason === 'outside_source_age_bound') {
      if (
        typeof rawStatus.source_age_days !== 'number'
        || rawStatus.source_age_days <= 62
        || !isRecord(rawStatus.coverage)
        || rawStatus.coverage.status !== 'outside_age_bound'
      ) {
        throw new Error('Solar realtime SILSO outside-age diagnostic is inconsistent');
      }
    } else if (rawStatus.reason === 'outside_published_coverage') {
      if (
        !isRecord(rawStatus.coverage)
        || rawStatus.coverage.status !== 'outside_published_coverage'
      ) {
        throw new Error('Solar realtime SILSO published-coverage diagnostic is inconsistent');
      }
    } else if (rawStatus.reason === 'invalid_delivery_date') {
      if (
        rawStatus.updated !== null
        || hasOwn(rawStatus, 'source_age_days')
        || hasOwn(rawStatus, 'coverage')
      ) {
        throw new Error('Solar realtime SILSO invalid-date diagnostic is inconsistent');
      }
    }
    return null;
  }
  if (!isRecord(payload)) {
    throw new Error('Solar realtime SILSO payload must be an object or null');
  }
  requireSchema(
    payload.schema,
    'wdc_silso_daily_total_sunspot_number',
    2,
    'Solar realtime SILSO payload'
  );
  const observationDate = requireIsoDate(
    payload.date,
    'Solar realtime SILSO payload date'
  );
  if (rawStatus.ok !== true) {
    throw new Error('Solar realtime SILSO payload requires a successful source status');
  }
  const statusDate = requireIsoDate(
    rawStatus.updated,
    'Solar realtime SILSO source status updated'
  );
  if (statusDate !== observationDate) {
    throw new Error('Solar realtime SILSO payload and source status metadata must match');
  }

  const payloadHasAge = hasOwn(payload, 'source_age_days');
  const statusHasAge = hasOwn(rawStatus, 'source_age_days');
  if (payloadHasAge !== statusHasAge) {
    throw new Error('Solar realtime SILSO payload and source status metadata must match');
  }
  if (payloadHasAge) {
    const sourceAgeDays = requireNonnegativeInteger(
      payload.source_age_days,
      'Solar realtime SILSO payload source_age_days'
    );
    const statusAge = requireNonnegativeInteger(
      rawStatus.source_age_days,
      'Solar realtime SILSO source status source_age_days'
    );
    if (statusAge !== sourceAgeDays) {
      throw new Error('Solar realtime SILSO payload and source status metadata must match');
    }
    if (sourceAgeDays > 62) {
      throw new Error('Solar realtime SILSO delivered source_age_days exceeds 62');
    }
  }

  const payloadHasCoverage = hasOwn(payload, 'coverage');
  const statusHasCoverage = hasOwn(rawStatus, 'coverage');
  if (payloadHasCoverage !== statusHasCoverage) {
    throw new Error('Solar realtime SILSO payload and source status metadata must match');
  }
  if (payloadHasCoverage) {
    const coverage = validateSilsoCoverage(
      payload.coverage,
      'Solar realtime SILSO payload coverage'
    );
    const statusCoverage = validateSilsoCoverage(
      rawStatus.coverage,
      'Solar realtime SILSO source status coverage'
    );
    if (
      statusCoverage.policy !== coverage.policy
      || statusCoverage.latest_expected_date !== coverage.latest_expected_date
      || statusCoverage.status !== coverage.status
    ) {
      throw new Error('Solar realtime SILSO payload and source status metadata must match');
    }
    if (
      coverage.status === 'outside_age_bound'
      || coverage.status === 'outside_published_coverage'
    ) {
      throw new Error('Solar realtime SILSO delivered coverage is outside bounds');
    }
  }
  return payload as unknown as SolarRealtimeSilsoSnapshot;
}

function validateSourceStatus(value: unknown, name: string): SolarRealtimeSourceStatus {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    throw new Error(`Solar realtime source_status.${name} must include boolean ok`);
  }
  if (hasOwn(value, 'updated') && value.updated !== null && typeof value.updated !== 'string') {
    throw new Error(`Solar realtime source_status.${name}.updated must be a string or null`);
  }
  if (hasOwn(value, 'endpoint') && typeof value.endpoint !== 'string') {
    throw new Error(`Solar realtime source_status.${name}.endpoint must be a string`);
  }
  if (hasOwn(value, 'error') && typeof value.error !== 'string') {
    throw new Error(`Solar realtime source_status.${name}.error must be a string`);
  }
  return value as unknown as SolarRealtimeSourceStatus;
}

function validateOptionalFinite(value: unknown, context: string): void {
  if (value !== null && value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error(`${context} must be finite or null`);
  }
}

function validateNullableFinite(value: unknown, context: string): void {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error(`${context} must be finite or null`);
  }
}

function hasExactSurfaceProjectionContract(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.schema)) return false;
  return value.schema.name === 'solar_surface_texture_projection'
    && value.schema.version === 1
    && value.projection === 'equirectangular'
    && value.coordinate_frame === 'iau_sun_body_fixed'
    && value.coverage === 'full_surface'
    && value.uv_mapping === 'sun_surface_uv_v1';
}

function validateAiaSnapshot(value: unknown): SolarRealtimeAiaSnapshot {
  if (!isRecord(value) || !isRecord(value.channels)) {
    throw new Error('Solar realtime snapshot sdo_aia must include a channels object');
  }
  for (const [channel, rawEntry] of Object.entries(value.channels)) {
    if (!/^aia_\d{3}$/.test(channel) || !isRecord(rawEntry)) {
      throw new Error(`Solar realtime sdo_aia channel ${channel} is invalid`);
    }
    if (
      rawEntry.image_id !== null &&
      (typeof rawEntry.image_id !== 'string' || !rawEntry.image_id.trim())
    ) {
      throw new Error(`Solar realtime sdo_aia channel ${channel} image_id is invalid`);
    }
    if (rawEntry.image_date !== null && typeof rawEntry.image_date !== 'string') {
      throw new Error(`Solar realtime sdo_aia channel ${channel} image_date is invalid`);
    }
    if (
      rawEntry.tile_url !== null &&
      (typeof rawEntry.tile_url !== 'string' || !rawEntry.tile_url.trim())
    ) {
      throw new Error(`Solar realtime sdo_aia channel ${channel} tile_url is invalid`);
    }
    if (!isRecord(rawEntry.artifact)) {
      throw new Error(`Solar realtime sdo_aia channel ${channel} artifact is invalid`);
    }
    const artifactSchema = rawEntry.artifact.schema;
    const artifactName = isRecord(artifactSchema) ? artifactSchema.name : null;
    if (
      !isRecord(artifactSchema)
      || !['helioviewer_viewport_tile', 'solar_surface_texture'].includes(
        `${artifactName ?? ''}`
      )
      || artifactSchema.version !== 1
      || rawEntry.artifact.delivery !== 'raw_on_demand'
    ) {
      throw new Error(`Solar realtime sdo_aia channel ${channel} artifact contract is invalid`);
    }
    if (!isRecord(rawEntry.spatial_use) || typeof rawEntry.spatial_use.eligible !== 'boolean') {
      throw new Error(`Solar realtime sdo_aia channel ${channel} spatial_use is invalid`);
    }
    if (artifactName === 'helioviewer_viewport_tile') {
      if (
        rawEntry.spatial_use.eligible !== false
        || typeof rawEntry.spatial_use.reason !== 'string'
        || !rawEntry.spatial_use.reason.trim()
        || rawEntry.spatial_use.contract !== null
      ) {
        throw new Error(
          `Solar realtime sdo_aia channel ${channel} viewport artifact must disable spatial use`
        );
      }
    } else if (
      rawEntry.spatial_use.eligible !== true
      || rawEntry.spatial_use.reason !== null
      || !hasExactSurfaceProjectionContract(rawEntry.spatial_use.contract)
    ) {
      throw new Error(
        `Solar realtime sdo_aia channel ${channel} surface artifact projection contract is invalid`
      );
    }
  }
  validateOptionalFinite(value.freshness_s, 'Solar realtime sdo_aia freshness_s');
  validateOptionalFinite(value.freshness_proxy, 'Solar realtime sdo_aia freshness_proxy');
  validateOptionalFinite(value.activity_proxy, 'Solar realtime sdo_aia activity_proxy');
  if (value.channel_activity_proxy !== null && value.channel_activity_proxy !== undefined) {
    if (!isRecord(value.channel_activity_proxy)) {
      throw new Error('Solar realtime sdo_aia channel_activity_proxy must be an object');
    }
    for (const proxy of Object.values(value.channel_activity_proxy)) {
      validateOptionalFinite(proxy, 'Solar realtime sdo_aia channel activity proxy');
    }
  }
  return value as unknown as SolarRealtimeAiaSnapshot;
}

export function validateSolarRealtimePayload(rawPayload: unknown): SolarRealtimePayload {
  if (!isRecord(rawPayload)) {
    throw new Error('Solar realtime response must be an object');
  }
  requireSchema(
    rawPayload.schema,
    'solar_realtime_endpoint',
    1,
    'Solar realtime response'
  );
  if (rawPayload.source !== 'backend') {
    throw new Error('Solar realtime response source must be backend');
  }
  if (!isRecord(rawPayload.snapshot)) {
    throw new Error('Solar realtime response snapshot must be an object');
  }

  const snapshot = rawPayload.snapshot;
  requireSchema(
    snapshot.schema,
    'solar_realtime_context',
    1,
    'Solar realtime snapshot'
  );
  requireUtcTimestamp(snapshot.fetched_at_utc, 'Solar realtime snapshot fetched_at_utc');
  if (!isRecord(snapshot.source_status)) {
    throw new Error('Solar realtime snapshot source_status must be an object');
  }
  const requiredSources = ['swpc', 'silso', 'sdo_aia', 'gong_synoptic'] as const;
  for (const source of requiredSources) {
    if (!hasOwn(snapshot.source_status, source)) {
      throw new Error(`Solar realtime snapshot source_status must include ${source}`);
    }
    validateSourceStatus(snapshot.source_status[source], source);
  }

  const aiaStatus = snapshot.source_status.sdo_aia as Record<string, unknown>;
  if (aiaStatus.ok !== (snapshot.sdo_aia !== null)) {
    throw new Error(
      'Solar realtime source_status.sdo_aia.ok must match whether snapshot.sdo_aia is non-null'
    );
  }
  if (snapshot.sdo_aia !== null) {
    validateAiaSnapshot(snapshot.sdo_aia);
  }
  validateSilsoDelivery(snapshot.silso, snapshot.source_status.silso);
  for (const source of ['swpc', 'gong_synoptic'] as const) {
    const sourcePayload = snapshot[source];
    if (sourcePayload !== null && !isRecord(sourcePayload)) {
      throw new Error(`Solar realtime snapshot ${source} must be an object or null`);
    }
  }
  validateNullableFinite(
    snapshot.combined_activity_proxy,
    'Solar realtime snapshot combined_activity_proxy'
  );
  return rawPayload as unknown as SolarRealtimePayload;
}

/**
 * Adapt the independently delivered realtime snapshot to the narrow observation
 * shape consumed by the AIA selection/rendering helpers. `applied` remains
 * false: imagery availability is not evidence that observed data drove PFSS.
 */
export function observationStateFromSolarRealtime(
  payload: SolarRealtimePayload | null | undefined
): SolarObservationPhysicsStateLike | null {
  const sdoAia = payload?.snapshot.sdo_aia;
  if (!sdoAia) return null;
  return {
    data_assimilation: {
      applied: false,
      observed_confidence: 0,
      sources: { sdo_aia: sdoAia }
    }
  };
}

function evaluateAiaRenderGate({
  observation,
  snapshotFetchedAtUtc,
  snapshotAgeMs,
  staleAfterMs,
  lastError,
  disposed,
  nowMs
}: {
  observation: ReturnType<typeof inspectAiaObservationChannel>;
  snapshotFetchedAtUtc: string | null;
  snapshotAgeMs: number | null;
  staleAfterMs: number;
  lastError: string | null;
  disposed: boolean;
  nowMs: number;
}): {
  eligible: boolean;
  reason: string | null;
  ageMs: number | null;
} {
  if (!observation) {
    return { eligible: false, reason: 'no_aia_artifact_available', ageMs: null };
  }
  if (observation.spatialUse !== 'eligible') {
    return {
      eligible: false,
      reason: observation.reason ?? 'missing_validated_spatial_projection_contract',
      ageMs: null
    };
  }
  if (disposed) {
    return { eligible: false, reason: 'realtime_client_disposed', ageMs: null };
  }
  if (lastError !== null) {
    return { eligible: false, reason: 'realtime_refresh_failed', ageMs: null };
  }

  const fetchedAtMs = snapshotFetchedAtUtc === null
    ? Number.NaN
    : Date.parse(snapshotFetchedAtUtc);
  if (
    snapshotAgeMs === null
    || !Number.isFinite(fetchedAtMs)
    || fetchedAtMs - nowMs > SOLAR_REALTIME_MAX_FUTURE_SKEW_MS
  ) {
    return { eligible: false, reason: 'realtime_snapshot_timestamp_invalid', ageMs: null };
  }
  if (snapshotAgeMs > staleAfterMs) {
    return { eligible: false, reason: 'realtime_snapshot_stale', ageMs: null };
  }

  const imageDateMs = observation.imageDate === null
    ? Number.NaN
    : Date.parse(observation.imageDate);
  if (
    !Number.isFinite(imageDateMs)
    || imageDateMs - nowMs > SOLAR_REALTIME_MAX_FUTURE_SKEW_MS
  ) {
    return { eligible: false, reason: 'aia_observation_timestamp_invalid', ageMs: null };
  }
  const ageMs = Math.max(0, nowMs - imageDateMs);
  if (ageMs > SOLAR_AIA_MAX_RENDER_AGE_MS) {
    return { eligible: false, reason: 'aia_observation_too_old', ageMs };
  }
  return { eligible: true, reason: null, ageMs };
}

export class SolarRealtimeClient {
  readonly baseUrl: () => string;
  readonly pollIntervalMs: number;
  readonly timeoutMs: number;
  readonly errorBackoffMs: number;
  readonly staleAfterMs: number;

  private latest: SolarRealtimePayload | null = null;
  private abortController: AbortController | null = null;
  private requestGeneration = 0;
  private consecutiveFailures = 0;
  private isDisposed = false;

  lastError: string | null = null;
  lastSuccessMs = 0;
  lastAttemptMs = 0;
  lastLatencyMs = 0;
  nextRefreshMs = 0;
  inFlight = false;

  constructor({
    baseUrl,
    pollIntervalMs = SOLAR_REALTIME_POLL_INTERVAL_MS,
    timeoutMs = SOLAR_REALTIME_REQUEST_TIMEOUT_MS,
    errorBackoffMs = SOLAR_REALTIME_ERROR_BACKOFF_MS,
    staleAfterMs
  }: SolarRealtimeClientOptions) {
    for (const value of [pollIntervalMs, timeoutMs, errorBackoffMs, staleAfterMs]) {
      if (value !== undefined && !Number.isFinite(value)) {
        throw new RangeError('Solar realtime timing options must be finite');
      }
    }
    this.baseUrl = baseUrl;
    this.pollIntervalMs = clamp(Number(pollIntervalMs), 30_000, 600_000);
    this.timeoutMs = clamp(Number(timeoutMs), 500, 20_000);
    this.errorBackoffMs = clamp(Number(errorBackoffMs), 1_000, this.pollIntervalMs);
    this.staleAfterMs = clamp(
      Number(staleAfterMs ?? Math.max(300_000, this.pollIntervalMs * 2)),
      this.pollIntervalMs,
      3_600_000
    );
  }

  latestState(): SolarRealtimePayload | null {
    return this.latest;
  }

  renderableObservationState(
    nowMs = Date.now(),
    overrideChannel: string | null = null
  ): SolarObservationPhysicsStateLike | null {
    const state = observationStateFromSolarRealtime(this.latest);
    return this.observationRenderStatus(nowMs, overrideChannel).eligible ? state : null;
  }

  observationRenderStatus(
    nowMs = Date.now(),
    overrideChannel: string | null = null
  ): SolarAiaRenderStatus {
    const snapshot = this.latest?.snapshot ?? null;
    const fetchedAtMs = snapshot ? Date.parse(snapshot.fetched_at_utc) : Number.NaN;
    const snapshotAgeMs = Number.isFinite(fetchedAtMs)
      ? Math.max(0, nowMs - fetchedAtMs)
      : null;
    const observation = inspectAiaObservationChannel(
      observationStateFromSolarRealtime(this.latest),
      undefined,
      overrideChannel
    );
    const gate = evaluateAiaRenderGate({
      observation,
      snapshotFetchedAtUtc: snapshot?.fetched_at_utc ?? null,
      snapshotAgeMs,
      staleAfterMs: this.staleAfterMs,
      lastError: this.lastError,
      disposed: this.isDisposed,
      nowMs
    });
    return {
      eligible: gate.eligible,
      reason: gate.reason,
      ageMs: gate.ageMs,
      maxAgeMs: SOLAR_AIA_MAX_RENDER_AGE_MS
    };
  }

  status(nowMs = Date.now()): SolarRealtimeClientStatus {
    const snapshot = this.latest?.snapshot ?? null;
    const fetchedAtMs = snapshot ? Date.parse(snapshot.fetched_at_utc) : Number.NaN;
    const snapshotAgeMs = Number.isFinite(fetchedAtMs)
      ? Math.max(0, nowMs - fetchedAtMs)
      : null;
    const stale = snapshot !== null && (
      this.lastError !== null ||
      snapshotAgeMs === null ||
      snapshotAgeMs > this.staleAfterMs
    );
    const aiaStatus = snapshot?.source_status.sdo_aia;
    const aiaUpdatedAtUtc = typeof aiaStatus?.updated === 'string'
      ? aiaStatus.updated
      : snapshot?.sdo_aia?.latest_image_date_utc ?? null;
    const aiaObservation = inspectAiaObservationChannel(
      observationStateFromSolarRealtime(this.latest)
    );
    const renderGate = this.observationRenderStatus(nowMs);
    return {
      source: this.latest?.source ?? null,
      freshness: snapshot === null ? 'unavailable' : (stale ? 'stale' : 'fresh'),
      snapshotFetchedAtUtc: snapshot?.fetched_at_utc ?? null,
      snapshotAgeMs,
      aiaUpdatedAtUtc,
      aiaSpatialUse: aiaObservation?.spatialUse ?? 'unavailable',
      aiaSpatialReason: aiaObservation?.reason ?? 'no_aia_artifact_available',
      aiaRenderEligible: renderGate.eligible,
      aiaRenderReason: renderGate.reason,
      aiaRenderAgeMs: renderGate.ageMs,
      aiaMaxRenderAgeMs: renderGate.maxAgeMs,
      sourceStatus: snapshot?.source_status ?? null,
      lastError: this.lastError,
      lastSuccessMs: this.lastSuccessMs,
      lastAttemptMs: this.lastAttemptMs,
      lastLatencyMs: this.lastLatencyMs,
      nextRefreshMs: this.nextRefreshMs,
      pollIntervalMs: this.pollIntervalMs,
      timeoutMs: this.timeoutMs,
      inFlight: this.inFlight,
      disposed: this.isDisposed
    };
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.requestGeneration += 1;
    this.abortController?.abort();
    this.abortController = null;
    this.inFlight = false;
  }

  async maybeRefresh(force = false): Promise<boolean> {
    const attemptStartedMs = Date.now();
    if (this.isDisposed || this.inFlight) return false;
    if (!force && attemptStartedMs < this.nextRefreshMs) return false;

    this.inFlight = true;
    this.lastAttemptMs = attemptStartedMs;
    const generation = ++this.requestGeneration;
    const controller = new AbortController();
    this.abortController = controller;
    const ownsRequest = (): boolean =>
      !this.isDisposed &&
      this.requestGeneration === generation &&
      this.abortController === controller;

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let rejectOnAbort: (() => void) | null = null;

    try {
      const cancelled = new Promise<never>((_resolve, reject) => {
        rejectOnAbort = () => reject(new Error('Solar realtime request cancelled'));
        controller.signal.addEventListener('abort', rejectOnAbort, { once: true });
      });
      const timeout = new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Solar realtime request timed out after ${this.timeoutMs} ms`));
          controller.abort();
        }, this.timeoutMs);
      });
      // Bound the complete asynchronous delivery, including body decoding.
      // Abort alone cannot settle a non-cooperating fetch/body implementation.
      const delivery = (async () => {
        const base = `${this.baseUrl() ?? ''}`.trim().replace(/\/+$/, '');
        const response = await fetch(`${base}/solar/realtime`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`Solar realtime request failed (${response.status})`);
        const rawPayload = await response.json();
        return validateSolarRealtimePayload(rawPayload);
      })();
      const payload = await Promise.race([delivery, timeout, cancelled]);
      if (!ownsRequest()) return false;
      const completedMs = Date.now();
      this.latest = payload;
      this.lastLatencyMs = Math.max(0, completedMs - attemptStartedMs);
      this.lastSuccessMs = completedMs;
      this.lastError = null;
      this.consecutiveFailures = 0;
      this.nextRefreshMs = completedMs + this.pollIntervalMs;
      return true;
    } catch (error: unknown) {
      if (!ownsRequest()) return false;
      this.lastError = error instanceof Error ? error.message : String(error);
      this.consecutiveFailures += 1;
      const multiplier = 2 ** Math.min(3, this.consecutiveFailures - 1);
      this.nextRefreshMs = Date.now() + Math.min(
        this.pollIntervalMs,
        this.errorBackoffMs * multiplier
      );
      return false;
    } finally {
      if (timeoutHandle !== null) clearTimeout(timeoutHandle);
      if (rejectOnAbort !== null) controller.signal.removeEventListener('abort', rejectOnAbort);
      if (ownsRequest()) {
        this.abortController = null;
        this.inFlight = false;
      }
    }
  }
}
