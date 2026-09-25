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

/** Each `/health` probe only has to tell "answers" from "refused" from "nothing listening". */
const HEALTH_PROBE_TIMEOUT_MS = 2_000;
/** The origin allowlist and the server's reachability change rarely; don't re-probe every retry. */
const HEALTH_PROBE_REUSE_MS = 30_000;

type HealthProbeVerdict = 'origin-allowed' | 'origin-refused' | 'unreachable' | 'inconclusive';
type HealthProbeOutcome = 'ok' | 'failed' | 'timed-out';

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

export function formatSeconds(ms: number): string {
  return `${Number((ms / 1_000).toFixed(1))}`;
}

/** The backend answers 503 both when its two compute slots are taken and when its own compute budget ran out. */
function classifyHttpFailure(status: number, detail: string): SolarPhysicsFailureKind {
  if (status === 429) return 'rate-limited';
  if (status === 503) return /timed out/i.test(detail) ? 'server-timeout' : 'busy';
  return 'http';
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const detail = body && typeof body === 'object' ? (body as { detail?: unknown }).detail : undefined;
    return typeof detail === 'string' ? detail : '';
  } catch {
    return '';
  }
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
  lastProbe: { verdict: HealthProbeVerdict; atMs: number } | null;
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
    this.lastProbe = null;
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
        throw await this.classifyFetchError(error, timedOut, controller.signal);
      }
      
      // If a new request started while we were awaiting, ignore this result
      if (this._reqId !== currentReqId) return false;

      if (!response.ok) {
        const detail = await readErrorDetail(response);
        throw new SolarPhysicsRequestError(
          classifyHttpFailure(response.status, detail),
          `Solar physics request failed (${response.status})${detail ? `: ${detail}` : ''}`,
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
      if (this._reqId !== currentReqId) return false;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new SolarPhysicsRequestError('invalid-response', 'Solar physics response was not a JSON object');
      }
      this.latest = payload as SolarPhysicsStatePayload;
      this.lastLatencyMs = Date.now() - startMs;
      this.lastSuccessMs = Date.now();
      this.lastError = null;
      this.lastFailure = null;
      this.consecutiveFailures = 0;
      this.lastProbe = null;
      this.nextRefreshMs = nowMs + this.pollIntervalMs;
      return true;
    } catch (error: unknown) {
      // A superseded or deliberately cancelled request says nothing about the server.
      if (this._reqId !== currentReqId) return false;
      if (controller.signal.aborted && !timedOut) return false;
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
   * `fetch` rejects with the same opaque TypeError when nothing is listening, when CORS hides the
   * reply, and when the server fails with a response that carries no CORS headers (an unhandled
   * 500 does not). Probing `/health` twice tells these apart: a CORS request succeeds only if this
   * origin is allowed, and a no-cors request is exempt from CORS, so it succeeds whenever the
   * server is up. A disallowed origin is also reported after a timeout, because the server still
   * runs the whole computation before the browser can refuse the reply.
   */
  async classifyFetchError(error: unknown, timedOut: boolean, signal: AbortSignal): Promise<unknown> {
    if (!timedOut && !(error instanceof TypeError)) return error;
    if (signal.aborted && !timedOut) return error;
    const verdict = await this.probeHealth();
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

  async probeHealth(): Promise<HealthProbeVerdict> {
    const nowMs = Date.now();
    if (this.lastProbe && nowMs - this.lastProbe.atMs < HEALTH_PROBE_REUSE_MS) return this.lastProbe.verdict;
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
    this.lastProbe = { verdict, atMs: Date.now() };
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
