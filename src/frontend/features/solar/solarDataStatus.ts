import type { SolarPhysicsFailure, SolarPhysicsStatePayload } from './solarPhysicsClient';

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

function formatSeconds(ms: number): string {
  return `${Number((ms / 1_000).toFixed(1))}`;
}

function failureReason(failure: SolarPhysicsFailure, input: SolarDataStatusInput): string {
  switch (failure.kind) {
    case 'timeout':
      return `solar server did not answer within ${formatSeconds(input.timeoutMs)} s`;
    case 'busy':
      return 'solar server busy, HTTP 503';
    case 'http':
      return `solar server error, HTTP ${failure.httpStatus ?? 'unknown'}`;
    case 'blocked':
      return `solar server refused origin ${input.pageOrigin || 'of this page'} (CORS)`;
    case 'unreachable':
      return `solar server not reachable at ${input.backendBaseUrl}`;
    case 'invalid-response':
      return 'solar server sent an invalid response';
    case 'network':
    default:
      return `network error: ${failure.message}`;
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
