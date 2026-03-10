import { clamp } from '../../../constants';

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
  lastSuccessMs: number;
  lastRefreshMs: number;
  lastLatencyMs: number;
  inFlight: boolean;
  nextRefreshMs: number;
  latest: unknown | null;
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
    this.lastSuccessMs = 0;
    this.lastRefreshMs = 0;
    this.lastLatencyMs = 0;
    this.inFlight = false;
    this.nextRefreshMs = 0;
    this.latest = null;
    this.abortController = null;
    this._reqId = 0;
  }

  latestState(): unknown | null {
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
      jd: Number(jd).toFixed(8),
      fidelity: this.fidelity,
      max_features: `${Math.round(this.maxFeatures)}`,
      forcing: this.forcing,
      live_data: this.liveData ? 'true' : 'false'
    });
    const url = `${this.baseUrl()}/solar/physics?${query.toString()}`;

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    this.abortController = controller;
    
    try {
      timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);
      const startMs = Date.now();
      const response = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal
      });
      
      // If a new request started while we were awaiting, ignore this result
      if (this._reqId !== currentReqId) return false;

      if (!response.ok) {
        throw new Error(`Solar physics request failed (${response.status})`);
      }
      const payload = await response.json();
      this.latest = payload;
      this.lastLatencyMs = Date.now() - startMs;
      this.lastSuccessMs = Date.now();
      this.lastError = null;
      this.nextRefreshMs = nowMs + this.pollIntervalMs;
      return true;
    } catch (error: unknown) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.nextRefreshMs = nowMs + Math.max(6_000, this.pollIntervalMs);
      return false;
    } finally {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
      this.abortController = null;
      this.inFlight = false;
    }
  }
}
