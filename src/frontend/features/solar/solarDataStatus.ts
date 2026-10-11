import {
  formatSeconds,
  type SolarPhysicsFailure,
  type SolarPhysicsFailureKind,
  type SolarPhysicsStatePayload
} from './solarPhysicsClient';

/**
 * Where the Sun on screen currently gets its state from.
 * - connecting: no backend answer yet; the browser's procedural model is drawn.
 * - backend: the latest backend solar model state is drawn.
 * - stale: an earlier backend state is still drawn, but refreshing it is failing.
 * - error: the backend has never answered; only the procedural model is drawn.
 */
export type SolarDataSourceState = 'connecting' | 'backend' | 'stale' | 'error';

export interface SolarDataSourceStatus {
  state: SolarDataSourceState;
  text: string;
  /** Changes only when the kind of situation changes; `text` also carries volatile detail. */
  announcementKey: string;
  /** Short sentence for screen readers, or null when nothing is worth announcing. */
  announcement: string | null;
  /** What to do about it, for the console; null when there is nothing to do. */
  remedy: string | null;
  /** When the refresh attempt this status reflects finished; tells repeated attempts from republishes. */
  observedAtMs: number;
}

export interface SolarDataStatusInput {
  lastSuccessMs: number;
  lastFailure: SolarPhysicsFailure | null;
  timeoutMs: number;
  backendBaseUrl: string;
  pageOrigin: string;
  payload: SolarPhysicsStatePayload | null;
  /** Channel of the AIA image currently drawn on the Sun, set only after it loaded. */
  displayedImageChannel: string | null;
  /** Channel of the most recent image load that failed, cleared by a successful load. */
  failedImageChannel: string | null;
}

interface SolarDataStatusElement {
  textContent: string | null;
  title: string;
  dataset: DOMStringMap;
  ownerDocument?: Pick<Document, 'createElement'> | null;
  replaceChildren?: (...nodes: Array<Node | string>) => void;
}

const URL_PATTERN = /https?:\/\/[^\s)]+/g;

function formatUtcMinute(ms: number): string {
  return `${new Date(ms).toISOString().slice(11, 16)} UTC`;
}

function failureReason(failure: SolarPhysicsFailure, input: SolarDataStatusInput): string {
  switch (failure.kind) {
    case 'timeout':
      return `solar server too slow, no reply within ${formatSeconds(input.timeoutMs)} s`;
    case 'busy':
      return 'solar server busy, HTTP 503';
    case 'server-timeout':
      return 'solar server ran out of compute time, HTTP 503';
    case 'rate-limited':
      return 'solar server rate limit reached, HTTP 429';
    case 'http':
      return `solar server error, HTTP ${failure.httpStatus ?? 'unknown'}`;
    case 'server-error':
      return 'solar server error, reply unreadable (likely HTTP 500)';
    case 'blocked':
      return input.pageOrigin
        ? `CORS: solar server does not allow origin ${input.pageOrigin}`
        : "CORS: solar server does not allow this page's origin";
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

function aiaLabel(channel: string): string {
  const wavelength = channel.replace(/^aia_0*/i, '');
  return wavelength ? `AIA ${wavelength}` : 'AIA';
}

function describeObservationImage(input: SolarDataStatusInput): string {
  const parts: string[] = [];
  if (input.displayedImageChannel) parts.push(`${aiaLabel(input.displayedImageChannel)} image`);
  if (input.failedImageChannel && input.failedImageChannel !== input.displayedImageChannel) {
    parts.push(`${aiaLabel(input.failedImageChannel)} image failed to load`);
  }
  return parts.map((part) => `; ${part}`).join('');
}

/** Failure kinds a listener would act on the same way are announced as one situation. */
function failureFamily(kind: SolarPhysicsFailureKind): 'slow' | 'blocked' | 'unreachable' | 'server-error' {
  switch (kind) {
    case 'timeout':
    case 'busy':
    case 'server-timeout':
    case 'rate-limited':
      return 'slow';
    case 'blocked':
      return 'blocked';
    case 'unreachable':
    case 'network':
      return 'unreachable';
    default:
      return 'server-error';
  }
}

const FAMILY_ANNOUNCEMENTS = {
  slow: 'solar server too slow or busy',
  blocked: "solar server does not allow this page's origin",
  unreachable: 'solar server not reachable',
  'server-error': 'solar server error',
} as const;

function failureRemedy(family: keyof typeof FAMILY_ANNOUNCEMENTS, input: SolarDataStatusInput): string {
  switch (family) {
    case 'blocked':
      return `Add ${input.pageOrigin || "this page's origin"} to SOLAR_CORS_ALLOWED_ORIGINS on the backend `
        + '(the variable replaces the default list, so keep the origins you still use), '
        + 'or open the page at http://localhost:5173.';
    case 'unreachable':
      return `Start the backend so that it answers at ${input.backendBaseUrl}: `
        + 'cd backend && python -m uvicorn server:app --port 8042';
    case 'slow':
      return 'A default /solar/physics request takes several seconds on the backend, '
        + 'longer than this page waits (audit finding H-1).';
    default:
      return 'Check the backend log for the failing /solar/physics request.';
  }
}

export function describeSolarDataStatus(input: SolarDataStatusInput): SolarDataSourceStatus {
  const hasBackendState = input.lastSuccessMs > 0 && input.payload !== null;
  if (input.lastFailure) {
    const reason = failureReason(input.lastFailure, input);
    const family = failureFamily(input.lastFailure.kind);
    const remedy = failureRemedy(family, input);
    const observedAtMs = input.lastFailure.atMs;
    if (hasBackendState) {
      return {
        state: 'stale',
        text: `Sun: backend state from ${formatUtcMinute(input.lastSuccessMs)} (refresh failing: ${reason})`,
        announcementKey: 'stale',
        announcement: 'Sun data: backend updates failing, showing the last backend state.',
        remedy,
        observedAtMs,
      };
    }
    return {
      state: 'error',
      text: `Sun: procedural fallback (${reason})`,
      announcementKey: `error:${family}`,
      announcement: `Sun data unavailable: ${FAMILY_ANNOUNCEMENTS[family]}. Showing the procedural Sun.`,
      remedy,
      observedAtMs,
    };
  }
  if (hasBackendState) {
    const imageUnavailable = input.failedImageChannel !== null && input.displayedImageChannel === null;
    return {
      state: 'backend',
      text: `Sun: backend solar model (${describeForcing(input.payload)}${describeObservationImage(input)})`
        + ` · updated ${formatUtcMinute(input.lastSuccessMs)}`,
      announcementKey: imageUnavailable ? 'backend:image-unavailable' : 'backend',
      announcement: imageUnavailable
        ? 'Sun data: backend solar model connected; AIA image unavailable.'
        : 'Sun data: backend solar model connected.',
      remedy: null,
      observedAtMs: input.lastSuccessMs,
    };
  }
  return {
    state: 'connecting',
    text: 'Sun: procedural fallback (connecting to solar model server)',
    announcementKey: 'connecting',
    announcement: null,
    remedy: null,
    observedAtMs: 0,
  };
}

export function renderSolarDataStatus(
  element: SolarDataStatusElement | null | undefined,
  status: SolarDataSourceStatus
): void {
  if (!element) return;
  if (element.textContent === status.text && element.dataset.solarState === status.state) return;
  element.title = status.text;
  element.dataset.solarState = status.state;
  const doc = element.ownerDocument;
  if (!doc || typeof element.replaceChildren !== 'function') {
    element.textContent = status.text;
    return;
  }
  // One inner wrapper: the chip is inline-flex, so loose text nodes would become separate flex items.
  const wrapper = doc.createElement('span');
  wrapper.className = 'status-text';
  let last = 0;
  for (const match of status.text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    wrapper.append(status.text.slice(last, start));
    const url = doc.createElement('span');
    url.className = 'status-url';
    url.textContent = match[0];
    wrapper.append(url);
    last = start + match[0].length;
  }
  wrapper.append(status.text.slice(last));
  element.replaceChildren(wrapper);
}

/**
 * Feeds a polite live region only when the kind of situation changes, because the visible chip
 * rewrites its text on every clock minute and failure detail. The first announcement and a
 * recovery to the backend are immediate; any other change must be seen on two separate refresh
 * attempts in a row, so alternating failures or a single dropped poll don't chatter.
 */
export class SolarDataAnnouncer {
  element: { textContent: string | null } | null | undefined;
  announcedKey: string | null;
  pendingKey: string | null;
  pendingObservedAtMs: number;

  constructor(element: { textContent: string | null } | null | undefined) {
    this.element = element;
    this.announcedKey = null;
    this.pendingKey = null;
    this.pendingObservedAtMs = 0;
  }

  /** Returns true when the status was announced. */
  observe(status: SolarDataSourceStatus): boolean {
    if (status.announcementKey === this.announcedKey) {
      this.pendingKey = null;
      return false;
    }
    if (status.announcement === null) return false;
    const recovering = status.announcementKey === 'backend'
      && this.announcedKey !== null
      && !this.announcedKey.startsWith('backend');
    if (this.announcedKey !== null && !recovering) {
      if (this.pendingKey !== status.announcementKey) {
        this.pendingKey = status.announcementKey;
        this.pendingObservedAtMs = status.observedAtMs;
        return false;
      }
      if (this.pendingObservedAtMs === status.observedAtMs) return false;
    }
    this.announcedKey = status.announcementKey;
    this.pendingKey = null;
    if (this.element) this.element.textContent = status.announcement;
    return true;
  }
}
