import { clamp } from '../../../constants';
import type { SolarPhysicsStateLike } from './solarFeatureBlending';
import type { SolarObservationPhysicsStateLike } from './solarObservationTexture';

// The backend admits at most 19 s for a solar-physics computation. Keep the
// browser deadline above that ceiling, while bounding it tightly enough that a
// disconnected backend cannot strand the delivery loop. Physics is expensive
// and evolves slowly relative to a frame, so polling twice a minute is ample.
export const SOLAR_PHYSICS_POLL_INTERVAL_MS = 30_000;
export const SOLAR_PHYSICS_REQUEST_TIMEOUT_MS = 20_000;
export const SOLAR_PHYSICS_ERROR_BACKOFF_MS = 30_000;
export const SOLAR_PHYSICS_MAX_FEATURES = 256;

export type SolarForcingMode = 'synthetic' | 'hybrid' | 'data_driven';

/** Subset of `GET /solar/physics` JSON used by the frontend sun stack. */
export interface SolarPhysicsStatePayload extends SolarObservationPhysicsStateLike {
  schema: {
    name: 'solar_physics_state';
    version: 2;
  };
  epoch_jd_tdb: number;
  wall_epoch_jd_tdb: number;
  jd_time_scale: 'TDB';
  /** @deprecated Unlabelled JDs are retained only for backend compatibility. */
  epoch_jd?: number;
  /** @deprecated Unlabelled JDs are retained only for backend compatibility. */
  wall_epoch_jd?: number;
  forcing: SolarForcingMode;
  effective_forcing: 'synthetic';
  live_data_requested: boolean;
  live_data_enabled: false;
  fallback_reason?: string;
  forcing_status: {
    requested: SolarForcingMode;
    effective: 'synthetic';
    observed_input_status: string;
    runtime_eligible: boolean;
    fallback_reason?: string;
  };
  activity_index?: number;
  synthetic_activity_index?: number;
  corona?: {
    features?: Array<Record<string, unknown>>;
  };
  pfss_field_lines?: {
    source?: string;
    carrington_rotation?: number;
  };
  coronal_holes?: {
    holes?: Array<{
      center_lon_rad?: unknown;
      center_lat_rad?: unknown;
      extent_lon_rad?: unknown;
      extent_lat_rad?: unknown;
    }> | null;
  } | null;
  heliosphere?: SolarPhysicsStateLike['heliosphere'];
  [key: string]: unknown;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isSolarForcingMode(value: unknown): value is SolarForcingMode {
  return value === 'synthetic' || value === 'hybrid' || value === 'data_driven';
}

function requireFiniteField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Solar physics response ${key} must be finite`);
  }
  return value;
}

function validateSolarPhysicsPayload(
  rawPayload: unknown,
  requestedJdTdb: number,
  requestedForcing: SolarForcingMode
): SolarPhysicsStatePayload {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    throw new Error('Solar physics response must be an object');
  }
  const payload = rawPayload as Record<string, unknown>;
  const schema = payload.schema;
  if (
    !schema ||
    typeof schema !== 'object' ||
    Array.isArray(schema) ||
    (schema as Record<string, unknown>).name !== 'solar_physics_state' ||
    (schema as Record<string, unknown>).version !== 2
  ) {
    throw new Error('Solar physics response schema must be solar_physics_state version 2');
  }
  const epochJdTdb = requireFiniteField(payload, 'epoch_jd_tdb');
  const wallEpochJdTdb = requireFiniteField(payload, 'wall_epoch_jd_tdb');
  if (payload.jd_time_scale !== 'TDB') {
    throw new Error('Solar physics response time scale must be TDB');
  }
  if (!isSolarForcingMode(payload.forcing) || payload.forcing !== requestedForcing) {
    throw new Error('Solar physics response requested forcing does not match the client request');
  }
  if (payload.effective_forcing !== 'synthetic') {
    throw new Error('Solar physics response effective_forcing must be synthetic');
  }
  if (typeof payload.live_data_requested !== 'boolean') {
    throw new Error('Solar physics response live_data_requested must be boolean');
  }
  if (payload.live_data_enabled !== false) {
    throw new Error('Solar physics response live_data_enabled must be false');
  }

  const encodedRequestJdTdb = Number(requestedJdTdb.toFixed(8));
  if (Math.abs(epochJdTdb - encodedRequestJdTdb) > 5e-9) {
    throw new Error('Solar physics response epoch_jd_tdb does not match the requested epoch');
  }

  if (hasOwn(payload, 'epoch_jd')) {
    const legacyEpoch = requireFiniteField(payload, 'epoch_jd');
    if (legacyEpoch !== epochJdTdb) {
      throw new Error('Solar physics response deprecated epoch_jd alias conflicts with epoch_jd_tdb');
    }
  }
  if (hasOwn(payload, 'wall_epoch_jd')) {
    const legacyWallEpoch = requireFiniteField(payload, 'wall_epoch_jd');
    if (legacyWallEpoch !== wallEpochJdTdb) {
      throw new Error(
        'Solar physics response deprecated wall_epoch_jd alias conflicts with wall_epoch_jd_tdb'
      );
    }
  }

  const status = payload.forcing_status;
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    throw new Error('Solar physics response forcing_status must be an object');
  }
  const fields = status as Record<string, unknown>;
  if (
    fields.requested !== requestedForcing ||
    fields.effective !== 'synthetic' ||
    typeof fields.observed_input_status !== 'string' ||
    fields.runtime_eligible !== false
  ) {
    throw new Error('Solar physics response forcing_status is inconsistent');
  }
  if (requestedForcing === 'synthetic') {
    if (
      fields.observed_input_status !== 'not_requested' ||
      hasOwn(payload, 'fallback_reason') ||
      hasOwn(fields, 'fallback_reason')
    ) {
      throw new Error('Solar physics response synthetic forcing must not claim fallback');
    }
  } else if (requestedForcing === 'hybrid') {
    if (
      fields.observed_input_status !== 'disabled_unvalidated' ||
      fields.fallback_reason !== 'disabled_unvalidated' ||
      payload.fallback_reason !== 'disabled_unvalidated'
    ) {
      throw new Error('Solar physics response hybrid fallback contract is invalid');
    }
  } else {
    throw new Error('Solar physics data_driven responses must fail closed');
  }

  return payload as unknown as SolarPhysicsStatePayload;
}

/** Why the most recent `/solar/physics` request failed, as far as the browser can tell. */
export type SolarPhysicsFailureKind =
  | 'timeout'
  | 'busy'
  | 'server-timeout'
  | 'rate-limited'
  | 'http'
  | 'server-error'
  | 'blocked'
  | 'unreachable'
  | 'network'
  | 'invalid-response';

export interface SolarPhysicsFailure {
  kind: SolarPhysicsFailureKind;
  message: string;
  httpStatus: number | null;
  /** The backend's machine-readable `detail.code`, when it sent one. */
  code: string | null;
  atMs: number;
}

export interface SolarPhysicsClientStatus {
  lastError: string | null;
  lastFailure: SolarPhysicsFailure | null;
  consecutiveFailures: number;
  lastSuccessMs: number;
  lastRefreshMs: number;
  lastLatencyMs: number;
  pollIntervalMs: number;
  timeoutMs: number;
  nextRefreshMs: number;
  inFlight: boolean;
  disposed: boolean;
}

/** Each `/health` probe only has to tell "answers" from "refused" from "nothing listening". */
const HEALTH_PROBE_TIMEOUT_MS = 2_000;
/** The origin allowlist and the server's reachability change rarely; don't re-probe every retry. */
const HEALTH_PROBE_REUSE_MS = 30_000;
/** Upper bound on how long a server's Retry-After can postpone the next attempt. */
const MAX_RETRY_AFTER_MS = 120_000;

type HealthProbeVerdict = 'origin-allowed' | 'origin-refused' | 'unreachable' | 'inconclusive';
type HealthProbeOutcome = 'ok' | 'failed' | 'timed-out';
/** What made us probe; a verdict is only reused for the same kind of failure. */
type HealthProbeTrigger = 'type-error' | 'timeout';

class SolarPhysicsRequestError extends Error {
  kind: SolarPhysicsFailureKind;
  httpStatus: number | null;
  code: string | null;
  retryAfterMs: number | null;

  constructor(
    kind: SolarPhysicsFailureKind,
    message: string,
    { httpStatus = null, code = null, retryAfterMs = null }: {
      httpStatus?: number | null;
      code?: string | null;
      retryAfterMs?: number | null;
    } = {}
  ) {
    super(message);
    this.name = 'SolarPhysicsRequestError';
    this.kind = kind;
    this.httpStatus = httpStatus;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export function formatSeconds(ms: number): string {
  return `${Number((ms / 1_000).toFixed(1))}`;
}

/** The backend reports overload and its own deadline as distinct 503 codes. */
function classifyHttpFailure(status: number, code: string | null): SolarPhysicsFailureKind {
  if (status === 429) return 'rate-limited';
  if (code === 'solar_compute_saturated') return 'busy';
  if (code === 'solar_compute_timeout') return 'server-timeout';
  return 'http';
}

/** `detail` is `{code, message, retryable}` on structured backend errors and a string on plain ones. */
async function readErrorDetail(response: Response): Promise<{ code: string | null; message: string }> {
  try {
    const body: unknown = await response.json();
    const detail = body && typeof body === 'object' ? (body as { detail?: unknown }).detail : undefined;
    if (typeof detail === 'string') return { code: null, message: detail };
    if (detail && typeof detail === 'object') {
      const { code, message } = detail as { code?: unknown; message?: unknown };
      return {
        code: typeof code === 'string' ? code : null,
        message: typeof message === 'string' ? message : ''
      };
    }
  } catch {
    // An unreadable error body still has a status to report.
  }
  return { code: null, message: '' };
}

function parseRetryAfterMs(value: string | null | undefined): number | null {
  const seconds = Number(value);
  return value != null && value.trim() !== '' && Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : null;
}

interface SolarPhysicsClientOptions {
  baseUrl: () => string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  maxFeatures?: number;
  fidelity?: string;
  forcing?: SolarForcingMode;
  liveData?: boolean;
}

export class SolarPhysicsClient {
  baseUrl: () => string;
  pollIntervalMs: number;
  timeoutMs: number;
  maxFeatures: number;
  fidelity: string;
  forcing: SolarForcingMode;
  liveData: boolean;
  lastError: string | null;
  lastFailure: SolarPhysicsFailure | null;
  consecutiveFailures: number;
  lastSuccessMs: number;
  lastRefreshMs: number;
  lastLatencyMs: number;
  inFlight: boolean;
  nextRefreshMs: number;
  latest: SolarPhysicsStatePayload | null;
  abortController: AbortController | null;
  lastProbe: { verdict: HealthProbeVerdict; trigger: HealthProbeTrigger; atMs: number } | null;
  _reqId: number;
  disposed: boolean;

  constructor({
    baseUrl,
    pollIntervalMs = SOLAR_PHYSICS_POLL_INTERVAL_MS,
    timeoutMs = SOLAR_PHYSICS_REQUEST_TIMEOUT_MS,
    maxFeatures = 220,
    fidelity = 'high',
    forcing = 'hybrid',
    liveData = true
  }: SolarPhysicsClientOptions) {
    this.baseUrl = baseUrl;
    this.pollIntervalMs = clamp(Number(pollIntervalMs), 5_000, 300_000);
    // A shorter browser deadline would detach from work the backend is still
    // entitled to run. Keep the public option for compatibility but enforce
    // the cross-runtime ownership contract.
    this.timeoutMs = clamp(
      Number(timeoutMs),
      SOLAR_PHYSICS_REQUEST_TIMEOUT_MS,
      SOLAR_PHYSICS_REQUEST_TIMEOUT_MS
    );
    this.maxFeatures = clamp(Number(maxFeatures), 8, SOLAR_PHYSICS_MAX_FEATURES);
    this.fidelity = `${fidelity ?? 'high'}`.trim().toLowerCase() || 'high';
    this.forcing = forcing ?? 'hybrid';
    this.liveData = Boolean(liveData);

    this.lastError = null;
    this.lastFailure = null;
    this.consecutiveFailures = 0;
    this.lastSuccessMs = 0;
    this.lastRefreshMs = 0;
    this.lastLatencyMs = 0;
    this.inFlight = false;
    this.nextRefreshMs = 0;
    this.latest = null;
    this.abortController = null;
    this.lastProbe = null;
    this._reqId = 0;
    this.disposed = false;
  }

  latestState(): SolarPhysicsStatePayload | null {
    return this.latest;
  }

  status(): SolarPhysicsClientStatus {
    return {
      lastError: this.lastError,
      lastFailure: this.lastFailure,
      consecutiveFailures: this.consecutiveFailures,
      lastSuccessMs: this.lastSuccessMs,
      lastRefreshMs: this.lastRefreshMs,
      lastLatencyMs: this.lastLatencyMs,
      pollIntervalMs: this.pollIntervalMs,
      timeoutMs: this.timeoutMs,
      nextRefreshMs: this.nextRefreshMs,
      inFlight: this.inFlight,
      disposed: this.disposed
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this._reqId += 1;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.inFlight = false;
  }

  async maybeRefresh(jd: number, force = false): Promise<boolean> {
    const nowMs = Date.now();

    if (this.disposed) return false;

    if (this.inFlight) {
      if (force) {
        // If forced, abort the current in-flight request and proceed
        this.abortController?.abort();
        this.inFlight = false;
      } else {
        return false;
      }
    }

    if (!force && nowMs < this.nextRefreshMs) return false;

    this.inFlight = true;
    this._reqId++;
    const currentReqId = this._reqId;
    this.lastRefreshMs = nowMs;
    const query = new URLSearchParams({
      jd_tdb: Number(jd).toFixed(8),
      fidelity: this.fidelity,
      max_features: `${Math.round(this.maxFeatures)}`,
      forcing: this.forcing,
      live_data: this.liveData ? 'true' : 'false'
    });
    const url = `${this.baseUrl()}/solar/physics?${query.toString()}`;

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;
    const controller = new AbortController();
    this.abortController = controller;
    const ownsRequest = (): boolean =>
      !this.disposed &&
      this._reqId === currentReqId &&
      this.abortController === controller;
    
    try {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, this.timeoutMs);
      const startMs = Date.now();
      let response: Response;
      try {
        response = await fetch(url, {
          cache: 'no-store',
          signal: controller.signal
        });
      } catch (error: unknown) {
        throw await this.classifyFetchError(error, timedOut, controller.signal);
      }
      
      // If a new request started while we were awaiting, ignore this result
      if (!ownsRequest()) return false;

      if (!response.ok) {
        // A readable error reply proves the server is up and allows this origin.
        this.lastProbe = null;
        const detail = await readErrorDetail(response);
        throw new SolarPhysicsRequestError(
          classifyHttpFailure(response.status, detail.code),
          `Solar physics request failed (${response.status})${detail.message ? `: ${detail.message}` : ''}`,
          {
            httpStatus: response.status,
            code: detail.code,
            // Test doubles and some engines omit headers on synthetic responses.
            retryAfterMs: parseRetryAfterMs(response.headers?.get?.('Retry-After'))
          }
        );
      }
      let payload: SolarPhysicsStatePayload;
      try {
        const rawPayload = await response.json();
        if (!ownsRequest()) return false;
        payload = validateSolarPhysicsPayload(rawPayload, jd, this.forcing);
      } catch (error: unknown) {
        if (timedOut) throw this.timeoutError();
        throw new SolarPhysicsRequestError('invalid-response', error instanceof Error ? error.message : String(error));
      }
      this.latest = payload;
      this.lastLatencyMs = Date.now() - startMs;
      this.lastSuccessMs = Date.now();
      this.lastError = null;
      this.lastFailure = null;
      this.consecutiveFailures = 0;
      this.lastProbe = null;
      this.nextRefreshMs = nowMs + this.pollIntervalMs;
      return true;
    } catch (error: unknown) {
      if (!ownsRequest()) return false;
      const failure = error instanceof SolarPhysicsRequestError
        ? error
        : new SolarPhysicsRequestError('network', error instanceof Error ? error.message : String(error));
      this.lastError = failure.message;
      this.lastFailure = {
        kind: failure.kind,
        message: failure.message,
        httpStatus: failure.httpStatus,
        code: failure.code,
        atMs: Date.now()
      };
      this.consecutiveFailures += 1;
      this.nextRefreshMs = Date.now() + Math.max(
        SOLAR_PHYSICS_ERROR_BACKOFF_MS,
        this.pollIntervalMs,
        Math.min(MAX_RETRY_AFTER_MS, failure.retryAfterMs ?? 0)
      );
      return false;
    } finally {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
      if (ownsRequest()) {
        this.abortController = null;
        this.inFlight = false;
      }
    }
  }

  timeoutError(): SolarPhysicsRequestError {
    return new SolarPhysicsRequestError('timeout', `No reply from the solar server within ${formatSeconds(this.timeoutMs)} s`);
  }

  /**
   * `fetch` rejects with the same opaque TypeError when nothing is listening, when CORS hides the
   * reply, and when the server fails with a response that carries no CORS headers. Probing
   * `/health` twice tells these apart: a CORS request succeeds only if this origin is allowed, and
   * a no-cors request is exempt from CORS, so it succeeds whenever the server is up. A disallowed
   * origin is also reported after a timeout, because the server still runs the whole computation
   * before the browser can refuse the reply.
   */
  async classifyFetchError(error: unknown, timedOut: boolean, signal: AbortSignal): Promise<unknown> {
    if (!timedOut && !(error instanceof TypeError)) return error;
    if (signal.aborted && !timedOut) return error;
    const verdict = await this.probeHealth(timedOut ? 'timeout' : 'type-error');
    if (timedOut) {
      return verdict === 'origin-refused' ? this.originRefusedError() : this.timeoutError();
    }
    const message = error instanceof Error ? error.message : String(error);
    switch (verdict) {
      case 'origin-refused':
        return this.originRefusedError();
      case 'origin-allowed':
        return new SolarPhysicsRequestError('server-error', `Solar server failed without a readable reply: ${message}`);
      case 'unreachable':
        return new SolarPhysicsRequestError('unreachable', `Solar server not reachable: ${message}`);
      default:
        return new SolarPhysicsRequestError('network', message);
    }
  }

  originRefusedError(): SolarPhysicsRequestError {
    return new SolarPhysicsRequestError('blocked', "Solar server does not allow this page's origin (CORS)");
  }

  /**
   * A verdict is reused only for the same kind of failure: a timeout means a connection was
   * accepted, which contradicts an "unreachable" verdict taken while nothing was listening.
   */
  async probeHealth(trigger: HealthProbeTrigger): Promise<HealthProbeVerdict> {
    const nowMs = Date.now();
    const reusable = this.lastProbe
      && this.lastProbe.trigger === trigger
      && nowMs - this.lastProbe.atMs < HEALTH_PROBE_REUSE_MS;
    if (reusable && this.lastProbe) return this.lastProbe.verdict;
    let verdict: HealthProbeVerdict;
    const cors = await this.fetchHealth('cors');
    if (cors === 'ok') {
      verdict = 'origin-allowed';
    } else if (cors === 'timed-out') {
      verdict = 'inconclusive';
    } else {
      const noCors = await this.fetchHealth('no-cors');
      verdict = noCors === 'ok' ? 'origin-refused' : noCors === 'failed' ? 'unreachable' : 'inconclusive';
    }
    this.lastProbe = { verdict, trigger, atMs: Date.now() };
    return verdict;
  }

  async fetchHealth(mode: RequestMode): Promise<HealthProbeOutcome> {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, HEALTH_PROBE_TIMEOUT_MS);
    try {
      await fetch(`${this.baseUrl()}/health`, { mode, cache: 'no-store', signal: controller.signal });
      return 'ok';
    } catch {
      return timedOut ? 'timed-out' : 'failed';
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
