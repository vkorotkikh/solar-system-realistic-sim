import {
  MODEL_WORKER_STATE_SCHEMA_VERSION,
  isValidModelWorkerAvailabilityArray,
  isValidModelWorkerStateArray,
  type ModelWorkerCatalog,
  type ModelWorkerInboundMessage,
  type ModelWorkerOutboundMessage,
  type ModelWorkerStateMessage,
} from '../../workers/modelWorkerContract';
import { hasFiniteAvailableBodyState } from './frameLifecycle';

export interface OrbitalWorker {
  onmessage: ((event: MessageEvent<ModelWorkerOutboundMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: ModelWorkerInboundMessage): void;
  terminate(): void;
}

export type ModelWorkerStatus = 'idle' | 'starting' | 'ready' | 'fallback' | 'disposed';

/** Owns the transport, deadlines and recovery; main retains scene application.
 * Local propagation remains authoritative whenever no current snapshot exists.
 * Two lifetime restarts bound resource churn even for intermittently bad workers.
 */
export function createModelWorkerController(options: {
  catalog: ModelWorkerCatalog;
  createWorker: () => OrbitalWorker;
  getJulianDate: () => number;
  onStatus?: (status: ModelWorkerStatus, reason?: string) => void;
  readyTimeoutMs?: number;
  responseTimeoutMs?: number;
  retryDelayMs?: number;
  maxRestarts?: number;
}) {
  const readyTimeout = options.readyTimeoutMs ?? 5000;
  const responseTimeout = options.responseTimeoutMs ?? 2000;
  const retryDelay = options.retryDelayMs ?? 500;
  const maxRestarts = options.maxRestarts ?? 2;
  let worker: OrbitalWorker | null = null;
  let status: ModelWorkerStatus = 'idle';
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let restarts = 0;
  let sequence = 0;
  let pending: { sequence: number; jd: number } | null = null;
  let latestState: ModelWorkerStateMessage | null = null;

  function setStatus(next: ModelWorkerStatus, reason?: string) {
    status = next;
    options.onStatus?.(next, reason);
  }
  function clearDeadline() { clearTimeout(deadline); deadline = undefined; }
  function retire() {
    clearDeadline();
    const retired = worker;
    worker = null;
    pending = null;
    latestState = null;
    if (retired) {
      retired.onmessage = null;
      retired.onerror = null;
      retired.onmessageerror = null;
      retired.terminate();
    }
  }
  function fail(reason: string) {
    if (status === 'disposed') return;
    retire();
    clearTimeout(retry);
    setStatus('fallback', reason);
    if (restarts < maxRestarts) {
      restarts += 1;
      retry = setTimeout(() => { retry = undefined; boot(); }, retryDelay * restarts);
    }
  }
  function boot() {
    if (status === 'disposed' || worker) return;
    setStatus('starting');
    try {
      const current = options.createWorker();
      worker = current;
      current.onmessage = event => {
        if (worker !== current || status === 'disposed') return;
        const message = event.data;
        if (!message || typeof message !== 'object') return;
        if (message.type === 'ready' && status === 'starting') {
          if (message.schemaVersion !== MODEL_WORKER_STATE_SCHEMA_VERSION
            || message.bodyCount !== options.catalog.bodies.length) {
            fail('incompatible ready contract'); return;
          }
          clearDeadline();
          setStatus('ready');
        } else if (message.type === 'state' && status === 'ready' && pending) {
          // Only an answer to this exact request releases the in-flight permit.
          // Malformed/unsolicited traffic cannot keep a hung worker alive.
          if (message.schemaVersion !== MODEL_WORKER_STATE_SCHEMA_VERSION
            || message.sequence !== pending.sequence || message.tickJd !== pending.jd
            || !isValidModelWorkerStateArray(message.bodies, options.catalog.bodies.length)
            || !isValidModelWorkerAvailabilityArray(message.availability, options.catalog.bodies.length)) return;
          if (!hasFiniteAvailableBodyState(message.bodies, message.availability)) {
            fail('nonfinite available state'); return;
          }
          clearDeadline(); pending = null;
          latestState = message;
        }
      };
      current.onerror = event => { if (worker === current) fail(event.message || 'worker error'); };
      current.onmessageerror = () => { if (worker === current) fail('worker message decoding failed'); };
      deadline = setTimeout(() => fail('worker initialization timed out'), readyTimeout);
      current.postMessage({ type: 'init', catalog: options.catalog,
        simStartJd: options.getJulianDate(), sequence: ++sequence });
    } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
  }

  return {
    get status() { return status; },
    get ready() { return status === 'ready'; },
    get latestState() { return latestState; },
    start() { if (status === 'idle') boot(); },
    tick(deltaSeconds: number) {
      if (status !== 'ready' || !worker || pending) return;
      const jd = options.getJulianDate();
      if (!Number.isFinite(jd)) return;
      pending = { sequence: ++sequence, jd };
      deadline = setTimeout(() => fail('worker response timed out'), responseTimeout);
      try {
        worker.postMessage({ type: 'tick', sequence, simState: { julianDate: jd, stepMs: deltaSeconds * 1000 } });
      } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
    },
    fail,
    dispose() {
      if (status === 'disposed') return;
      clearTimeout(retry); retry = undefined;
      retire(); setStatus('disposed');
    },
  };
}
