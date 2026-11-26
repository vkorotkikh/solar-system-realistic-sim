/**
 * Fetches the observed-PFSS sidecar from `GET /solar/observed/pfss` (ADR 0009) and keeps the
 * last accepted one. No DOM and no scene: the label and the layer read `state`.
 *
 * Retention: a 404, any other status that is not 200 or 429, an unreadable or invalid body, or a
 * failed frame check drops the accepted sidecar. A network failure, a timeout or a 429 keeps it.
 */
import { readErrorDetail, readSolarJson } from './solarPhysicsClient';

export const OBSERVED_PFSS_ROUTE = '/solar/observed/pfss';
export const OBSERVED_PFSS_POLL_MS = 30 * 60 * 1000;
export const OBSERVED_PFSS_TIMEOUT_MS = 10_000;

export interface ObservedPfssLine {
  id: string;
  state: string;
  polarity: number;
  arc: [number, number, number][];
  footpoint_lat_deg: number;
  footpoint_lon_deg: number;
}

/** The fields of the sidecar the client reads; the server has validated the whole file. */
export interface ObservedPfssSidecar {
  schema: { name: 'observed_pfss_sidecar'; version: 1 };
  map_reference_utc: string;
  map_reference_jd_tdb: number;
  valid_from_jd_tdb: number;
  valid_until_jd_tdb: number;
  degree: number;
  source_surface_radii: number;
  flux_correction: { q: number; residual_monopole_g: number };
  carrington_check: { delta_deg: number; tolerance_deg: number; pass: boolean };
  line_counts: { open: number; closed: number; unresolved: number };
  lines: ObservedPfssLine[];
}

export type ObservedPfssFailure =
  | { kind: 'not-found'; message: string | null }
  | { kind: 'http'; status: number | 'redirect'; message: string | null }
  | { kind: 'unreadable' }
  | { kind: 'invalid' }
  | { kind: 'frame-check'; deltaDeg: number }
  | { kind: 'transient'; atMs: number };

export interface ObservedPfssClientState {
  enabled: boolean;
  /** From switch-on until the first response has been handled. */
  awaitingFirst: boolean;
  accepted: ObservedPfssSidecar | null;
  failure: ObservedPfssFailure | null;
  nextTryMs: number | null;
}

const OFF: ObservedPfssClientState = Object.freeze({
  enabled: false, awaitingFirst: false, accepted: null, failure: null, nextTryMs: null,
});

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const point = (value: unknown) => Array.isArray(value) && value.length === 3 && value.every(finite);

/** The client's check: schema name and version, and every field it reads. Null when it fails. */
export function checkObservedSidecar(body: unknown): ObservedPfssSidecar | null {
  if (!record(body) || !record(body.schema)) return null;
  if (body.schema.name !== 'observed_pfss_sidecar' || body.schema.version !== 1) return null;
  const { flux_correction: flux, carrington_check: check, line_counts: counts, lines } = body;
  if (typeof body.map_reference_utc !== 'string' || !Number.isFinite(Date.parse(body.map_reference_utc))) return null;
  if (![body.map_reference_jd_tdb, body.valid_from_jd_tdb, body.valid_until_jd_tdb, body.degree, body.source_surface_radii].every(finite)) return null;
  if ((body.valid_from_jd_tdb as number) > (body.valid_until_jd_tdb as number)) return null;
  if (!record(flux) || !finite(flux.q) || !finite(flux.residual_monopole_g)) return null;
  if (!record(check) || typeof check.pass !== 'boolean' || !finite(check.delta_deg) || !finite(check.tolerance_deg)) return null;
  if (!record(counts) || ![counts.open, counts.closed, counts.unresolved].every(finite)) return null;
  if (!Array.isArray(lines) || lines.length === 0) return null;
  let drawable = 0;
  for (const line of lines) {
    if (!record(line) || typeof line.state !== 'string' || !Array.isArray(line.arc) || line.arc.length < 2) return null;
    if (!line.arc.every(point)) return null;
    if (line.state === 'open' || line.state === 'closed') drawable += 1;
  }
  return drawable > 0 ? body as unknown as ObservedPfssSidecar : null;
}

export interface ObservedPfssClientOptions {
  baseUrl: () => string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  onChange?: (state: ObservedPfssClientState) => void;
  pollMs?: number;
  timeoutMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface ObservedPfssClient {
  readonly state: ObservedPfssClientState;
  setEnabled(enabled: boolean): void;
  /** Fetch again when the poll interval has passed; call once per frame. */
  tick(nowMs?: number): void;
  refresh(): void;
  dispose(): void;
}

type Outcome = { accepted: ObservedPfssSidecar | null; failure: ObservedPfssFailure | null; keep: boolean };

export function createObservedPfssClient({
  baseUrl,
  fetchImpl = (...args) => fetch(...args),
  now = Date.now,
  onChange,
  pollMs = OBSERVED_PFSS_POLL_MS,
  timeoutMs = OBSERVED_PFSS_TIMEOUT_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: ObservedPfssClientOptions): ObservedPfssClient {
  let state: ObservedPfssClientState = OFF;
  let current = 0;
  let controller: AbortController | null = null;

  function publish(next: ObservedPfssClientState) {
    state = next;
    onChange?.(state);
  }

  async function read(signal: AbortSignal): Promise<Outcome> {
    const response = await fetchImpl(`${baseUrl()}${OBSERVED_PFSS_ROUTE}`, { cache: 'no-store', redirect: 'manual', signal });
    if (response.type === 'opaqueredirect') {
      return { accepted: null, failure: { kind: 'http', status: 'redirect', message: null }, keep: false };
    }
    if (response.status === 200) {
      let body: unknown;
      try {
        body = await readSolarJson(response, signal);
      } catch (error) {
        if (signal.aborted) throw error;
        return { accepted: null, failure: { kind: 'unreadable' }, keep: false };
      }
      const sidecar = checkObservedSidecar(body);
      if (!sidecar) return { accepted: null, failure: { kind: 'invalid' }, keep: false };
      if (!sidecar.carrington_check.pass) {
        return { accepted: null, failure: { kind: 'frame-check', deltaDeg: sidecar.carrington_check.delta_deg }, keep: false };
      }
      return { accepted: sidecar, failure: null, keep: false };
    }
    if (response.status === 429) return { accepted: null, failure: { kind: 'transient', atMs: now() }, keep: true };
    const message = (await readErrorDetail(response)).message || null;
    if (response.status === 404) return { accepted: null, failure: { kind: 'not-found', message }, keep: false };
    return { accepted: null, failure: { kind: 'http', status: response.status, message }, keep: false };
  }

  async function run(id: number, own: AbortController) {
    const timer = setTimer(() => own.abort(), timeoutMs);
    let outcome: Outcome;
    try {
      outcome = await read(own.signal);
    } catch {
      outcome = { accepted: null, failure: { kind: 'transient', atMs: now() }, keep: true };
    } finally {
      clearTimer(timer);
    }
    // Checked after the body is parsed: a switch-off or a newer request wins.
    if (id !== current || !state.enabled) return;
    controller = null;
    publish({
      enabled: true,
      awaitingFirst: false,
      accepted: outcome.keep ? state.accepted : outcome.accepted,
      failure: outcome.failure,
      nextTryMs: now() + pollMs,
    });
  }

  function refresh() {
    if (!state.enabled) return;
    controller?.abort();
    const own = new AbortController();
    controller = own;
    current += 1;
    void run(current, own);
  }

  function setEnabled(enabled: boolean) {
    if (enabled === state.enabled) return;
    controller?.abort();
    controller = null;
    current += 1;
    if (!enabled) {
      publish(OFF);
      return;
    }
    publish({ enabled: true, awaitingFirst: true, accepted: null, failure: null, nextTryMs: null });
    refresh();
  }

  function tick(nowMs = now()) {
    if (state.enabled && !controller && state.nextTryMs !== null && nowMs >= state.nextTryMs) refresh();
  }

  return {
    get state() { return state; },
    setEnabled,
    tick,
    refresh,
    dispose: () => setEnabled(false),
  };
}
