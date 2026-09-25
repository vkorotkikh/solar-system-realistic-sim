import { formatSeconds, type SolarPhysicsFailure, type SolarPhysicsStatePayload } from './solarPhysicsClient';

/**
 * Where the Sun on screen currently gets its state from.
 * - connecting: no backend answer yet; the browser's procedural model is drawn.
 * - backend: the latest backend solar model state is drawn.
 * - stale: an earlier backend state is still drawn, but refreshing it is failing.
 * - error: the backend has never answered; only the procedural model is drawn.
 */
export type SolarDataSourceState = 'connecting' | 'backend' | 'stale' | 'error';

export type SolarObservationImageState = 'none' | 'loading' | 'loaded' | 'failed';

export interface SolarDataSourceStatus {
  state: SolarDataSourceState;
  text: string;
}

export interface SolarDataStatusInput {
  lastSuccessMs: number;
  lastFailure: SolarPhysicsFailure | null;
  timeoutMs: number;
  backendBaseUrl: string;
  pageOrigin: string;
  payload: SolarPhysicsStatePayload | null;
  observationImage: SolarObservationImageState;
  observationChannel: string | null;
}

interface SolarDataStatusElement {
  textContent: string | null;
  title: string;
  dataset: DOMStringMap;
}

function formatUtcMinute(ms: number): string {
  return `${new Date(ms).toISOString().slice(11, 16)} UTC`;
}

function failureReason(failure: SolarPhysicsFailure, input: SolarDataStatusInput): string {
  switch (failure.kind) {
    case 'timeout':
      return `solar server did not answer within ${formatSeconds(input.timeoutMs)} s`;
    case 'busy':
      return 'solar server busy, HTTP 503';
    case 'server-timeout':
      return 'solar server ran out of compute time, HTTP 503';
    case 'rate-limited':
      return 'solar server rate limit reached, HTTP 429';
    case 'http':
      return `solar server error, HTTP ${failure.httpStatus ?? 'unknown'}`;
    case 'server-error':
      return 'solar server failed without a readable reply, likely an internal error';
    case 'blocked':
      return input.pageOrigin
        ? `solar server does not allow this page's origin ${input.pageOrigin} (CORS)`
        : "solar server does not allow this page's origin (CORS)";
    case 'unreachable':
      return `solar server not reachable at ${input.backendBaseUrl}`;
    case 'invalid-response':
      return 'solar server sent an invalid response';
    case 'network':
    default:
      return `network error contacting ${input.backendBaseUrl}`;
  }
}

function describeForcing(payload: SolarPhysicsStatePayload | null): string {
  const assimilation = payload?.data_assimilation;
  const mode = typeof assimilation?.mode === 'string' ? assimilation.mode : null;
  if (!mode || mode === 'synthetic') return 'synthetic forcing, no observations';
  const forcing = `${mode.replace(/_/g, '-')} forcing`;
  const blendWeight = Number(assimilation?.blend_weight);
  if (assimilation?.applied === true && Number.isFinite(blendWeight)) {
    return `${forcing}, observations blended ${Math.round(blendWeight * 100)}%`;
  }
  return assimilation?.live_data_available === true
    ? `${forcing}, observations not applied`
    : `${forcing}, observations unavailable`;
}

function describeObservationImage(input: SolarDataStatusInput): string {
  const channel = `${input.observationChannel ?? ''}`.replace(/^aia_/i, '');
  const label = channel ? `AIA ${channel}` : 'AIA';
  if (input.observationImage === 'loaded') return `; ${label} image`;
  if (input.observationImage === 'failed') return `; ${label} image failed to load`;
  return '';
}

export function describeSolarDataStatus(input: SolarDataStatusInput): SolarDataSourceStatus {
  const hasBackendState = input.lastSuccessMs > 0 && input.payload !== null;
  if (input.lastFailure) {
    const reason = failureReason(input.lastFailure, input);
    if (hasBackendState) {
      return {
        state: 'stale',
        text: `Sun: backend state from ${formatUtcMinute(input.lastSuccessMs)} (refresh failing: ${reason})`,
      };
    }
    return {
      state: 'error',
      text: `Sun: procedural fallback (${reason})`,
    };
  }
  if (hasBackendState) {
    return {
      state: 'backend',
      text: `Sun: backend solar model (${describeForcing(input.payload)}${describeObservationImage(input)})`
        + ` · updated ${formatUtcMinute(input.lastSuccessMs)}`,
    };
  }
  return {
    state: 'connecting',
    text: 'Sun: procedural fallback (connecting to solar model server)',
  };
}

export function renderSolarDataStatus(
  element: SolarDataStatusElement | null | undefined,
  status: SolarDataSourceStatus
): void {
  if (!element) return;
  // The element is a polite live region: rewriting identical text would re-announce it.
  if (element.textContent === status.text && element.dataset.solarState === status.state) return;
  element.textContent = status.text;
  element.title = status.text;
  element.dataset.solarState = status.state;
}
