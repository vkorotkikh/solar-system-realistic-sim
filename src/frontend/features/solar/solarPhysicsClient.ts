import { clamp } from '../../../constants';
import type { SolarObservationPhysicsStateLike } from './solarObservationTexture';

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
  coronal_holes?: unknown;
  heliosphere?: unknown;
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
  lastSuccessMs: number;
  lastRefreshMs: number;
  lastLatencyMs: number;
  inFlight: boolean;
  nextRefreshMs: number;
  latest: SolarPhysicsStatePayload | null;
  abortController: AbortController | null;
  _reqId: number;

  constructor({
    baseUrl,
    pollIntervalMs = 1_800,
    timeoutMs = 2_400,
    maxFeatures = 220,
    fidelity = 'high',
    forcing = 'hybrid',
    liveData = true
  }: SolarPhysicsClientOptions) {
    this.baseUrl = baseUrl;
    this.pollIntervalMs = clamp(Number(pollIntervalMs), 300, 30_000);
    this.timeoutMs = clamp(Number(timeoutMs), 500, 20_000);
    this.maxFeatures = clamp(Number(maxFeatures), 8, 2_048);
    this.fidelity = `${fidelity ?? 'high'}`.trim().toLowerCase() || 'high';
    this.forcing = forcing ?? 'hybrid';
    this.liveData = Boolean(liveData);

    this.lastError = null;
    this.lastSuccessMs = 0;
    this.lastRefreshMs = 0;
    this.lastLatencyMs = 0;
    this.inFlight = false;
    this.nextRefreshMs = 0;
    this.latest = null;
    this.abortController = null;
    this._reqId = 0;
  }

  latestState(): SolarPhysicsStatePayload | null {
    return this.latest;
  }

  status(): Record<string, unknown> {
    return {
      lastError: this.lastError,
      lastSuccessMs: this.lastSuccessMs,
      lastRefreshMs: this.lastRefreshMs,
      lastLatencyMs: this.lastLatencyMs,
      pollIntervalMs: this.pollIntervalMs,
      nextRefreshMs: this.nextRefreshMs
    };
  }

  dispose(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.inFlight = false;
  }

  async maybeRefresh(jd: number, force = false): Promise<boolean> {
    const nowMs = Date.now();

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
    const controller = new AbortController();
    this.abortController = controller;
    const ownsRequest = (): boolean =>
      this._reqId === currentReqId && this.abortController === controller;
    
    try {
      timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);
      const startMs = Date.now();
      const response = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal
      });
      
      // If a new request started while we were awaiting, ignore this result
      if (!ownsRequest()) return false;

      if (!response.ok) {
        throw new Error(`Solar physics request failed (${response.status})`);
      }
      const rawPayload = await response.json();
      if (!ownsRequest()) return false;
      const payload = validateSolarPhysicsPayload(rawPayload, jd, this.forcing);
      this.latest = payload;
      this.lastLatencyMs = Date.now() - startMs;
      this.lastSuccessMs = Date.now();
      this.lastError = null;
      this.nextRefreshMs = nowMs + this.pollIntervalMs;
      return true;
    } catch (error: unknown) {
      if (!ownsRequest()) return false;
      this.lastError = error instanceof Error ? error.message : String(error);
      this.nextRefreshMs = nowMs + Math.max(6_000, this.pollIntervalMs);
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
}
