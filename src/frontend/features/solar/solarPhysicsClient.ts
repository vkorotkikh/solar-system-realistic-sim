import { clamp } from '../../../constants';
import type { SolarObservationPhysicsStateLike } from './solarObservationTexture';

/** Subset of `GET /solar/physics` JSON used by the frontend sun stack. */
export interface SolarPhysicsStatePayload extends SolarObservationPhysicsStateLike {
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

/** Why the most recent `/solar/physics` request failed, as far as the browser can tell. */
export type SolarPhysicsFailureKind =
  | 'timeout'
  | 'busy'
  | 'http'
  | 'blocked'
  | 'unreachable'
  | 'network'
  | 'invalid-response';

export interface SolarPhysicsFailure {
  kind: SolarPhysicsFailureKind;
  message: string;
  httpStatus: number | null;
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
}

/** A no-cors probe of `/health` only has to tell "server answers" from "nothing listening". */
const REACHABILITY_PROBE_TIMEOUT_MS = 2_000;

class SolarPhysicsRequestError extends Error {
  kind: SolarPhysicsFailureKind;
  httpStatus: number | null;

  constructor(kind: SolarPhysicsFailureKind, message: string, httpStatus: number | null = null) {
    super(message);
    this.name = 'SolarPhysicsRequestError';
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
}

function formatSeconds(ms: number): string {
  return `${Number((ms / 1_000).toFixed(1))}`;
}

interface SolarPhysicsClientOptions {
  baseUrl: () => string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  maxFeatures?: number;
  fidelity?: string;
  forcing?: string;
  liveData?: boolean;
}

export class SolarPhysicsClient {
  baseUrl: () => string;
  pollIntervalMs: number;
  timeoutMs: number;
  maxFeatures: number;
  fidelity: string;
  forcing: string;
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
    this.forcing = `${forcing ?? 'hybrid'}`.trim().toLowerCase() || 'hybrid';
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
    this._reqId = 0;
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
      jd: Number(jd).toFixed(8),
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
        throw await this.classifyFetchError(error, timedOut);
      }
      
      // If a new request started while we were awaiting, ignore this result
      if (this._reqId !== currentReqId) return false;

      if (!response.ok) {
        throw new SolarPhysicsRequestError(
          response.status === 503 ? 'busy' : 'http',
          `Solar physics request failed (${response.status})`,
          response.status
        );
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error: unknown) {
        throw timedOut
          ? this.timeoutError()
          : new SolarPhysicsRequestError('invalid-response', `Solar physics response was not valid JSON (${String(error)})`);
      }
      if (!payload || typeof payload !== 'object') {
        throw new SolarPhysicsRequestError('invalid-response', 'Solar physics response was not a JSON object');
      }
      this.latest = payload as SolarPhysicsStatePayload;
      this.lastLatencyMs = Date.now() - startMs;
      this.lastSuccessMs = Date.now();
      this.lastError = null;
      this.lastFailure = null;
      this.consecutiveFailures = 0;
      this.nextRefreshMs = nowMs + this.pollIntervalMs;
      return true;
    } catch (error: unknown) {
      // A superseded or deliberately cancelled request says nothing about the server.
      if (this._reqId !== currentReqId) return false;
      if (!(error instanceof SolarPhysicsRequestError) && controller.signal.aborted && !timedOut) return false;
      const failure = error instanceof SolarPhysicsRequestError
        ? error
        : new SolarPhysicsRequestError('network', error instanceof Error ? error.message : String(error));
      this.lastError = failure.message;
      this.lastFailure = {
        kind: failure.kind,
        message: failure.message,
        httpStatus: failure.httpStatus,
        atMs: Date.now()
      };
      this.consecutiveFailures += 1;
      this.nextRefreshMs = nowMs + Math.max(6_000, this.pollIntervalMs);
      return false;
    } finally {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
      if (this._reqId === currentReqId) {
        this.abortController = null;
        this.inFlight = false;
      }
    }
  }

  timeoutError(): SolarPhysicsRequestError {
    return new SolarPhysicsRequestError('timeout', `No reply from the solar server within ${formatSeconds(this.timeoutMs)} s`);
  }

  /**
   * `fetch` rejects with the same opaque TypeError whether nothing is listening or the server
   * answered but CORS hid the response. A no-cors request is exempt from CORS, so if it
   * resolves the server is up and the page's origin is what was refused.
   */
  async classifyFetchError(error: unknown, timedOut: boolean): Promise<unknown> {
    if (timedOut) return this.timeoutError();
    if (!(error instanceof TypeError)) return error;
    const reachable = await this.probeServerReachable();
    return reachable
      ? new SolarPhysicsRequestError('blocked', `Solar server refused this page's origin (CORS): ${error.message}`)
      : new SolarPhysicsRequestError('unreachable', `Solar server not reachable: ${error.message}`);
  }

  async probeServerReachable(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), REACHABILITY_PROBE_TIMEOUT_MS);
    try {
      await fetch(`${this.baseUrl()}/health`, {
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal
      });
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
