function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class SolarPhysicsClient {
  constructor({
    baseUrl,
    pollIntervalMs = 1_800,
    timeoutMs = 2_400,
    maxFeatures = 220,
    fidelity = 'high'
  }) {
    this.baseUrl = baseUrl;
    this.pollIntervalMs = clamp(Number(pollIntervalMs), 300, 30_000);
    this.timeoutMs = clamp(Number(timeoutMs), 500, 20_000);
    this.maxFeatures = clamp(Number(maxFeatures), 8, 2_048);
    this.fidelity = `${fidelity ?? 'high'}`.trim().toLowerCase() || 'high';

    this.lastError = null;
    this.lastSuccessMs = 0;
    this.lastRefreshMs = 0;
    this.inFlight = false;
    this.nextRefreshMs = 0;
    this.latest = null;
  }

  latestState() {
    return this.latest;
  }

  status() {
    return {
      lastError: this.lastError,
      lastSuccessMs: this.lastSuccessMs,
      lastRefreshMs: this.lastRefreshMs,
      pollIntervalMs: this.pollIntervalMs,
      nextRefreshMs: this.nextRefreshMs
    };
  }

  async maybeRefresh(jd, force = false) {
    const nowMs = Date.now();
    if (this.inFlight) return false;
    if (!force && nowMs < this.nextRefreshMs) return false;

    this.inFlight = true;
    this.lastRefreshMs = nowMs;
    const query = new URLSearchParams({
      jd: Number(jd).toFixed(8),
      fidelity: this.fidelity,
      max_features: `${Math.round(this.maxFeatures)}`
    });
    const url = `${this.baseUrl()}/solar/physics?${query.toString()}`;

    let timeoutHandle = null;
    const controller = new AbortController();
    try {
      timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);
      const response = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`Solar physics request failed (${response.status})`);
      }
      const payload = await response.json();
      this.latest = payload;
      this.lastSuccessMs = Date.now();
      this.lastError = null;
      this.nextRefreshMs = nowMs + this.pollIntervalMs;
      return true;
    } catch (error) {
      this.lastError = error?.message ?? String(error);
      this.nextRefreshMs = nowMs + Math.max(6_000, this.pollIntervalMs);
      return false;
    } finally {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
      this.inFlight = false;
    }
  }
}

