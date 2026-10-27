import { MODEL_WORKER_RECORD_SIZE } from '../../workers/modelWorkerContract';

interface FrameContext {
  timestamp: number;
  deltaSeconds: number;
}

export interface FrameStage {
  name: string;
  run: (frame: FrameContext) => void;
}

interface FrameLifecycleOptions {
  stages: readonly FrameStage[];
  visibility?: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
  requestFrame?: typeof requestAnimationFrame;
  cancelFrame?: typeof cancelAnimationFrame;
  onError?: (stage: string, error: unknown) => void;
}

/** Bound local visual time only. Backend integration keeps its fixed steps. */
export function createFrameLifecycle({
  stages,
  visibility = document,
  requestFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame,
  onError = (stage, error) => console.warn(`[frame:${stage}] update failed:`, error)
}: FrameLifecycleOptions) {
  let running = false;
  let disposed = false;
  let frameId: number | null = null;
  let previousTimestamp: number | null = null;
  let generation = 0;
  const failingStages = new Set<FrameStage>();

  function schedule() {
    if (running && !visibility.hidden && frameId === null) {
      const owner = generation;
      frameId = requestFrame(timestamp => animate(timestamp, owner));
    }
  }

  function cancelPending() {
    generation++;
    if (frameId !== null) cancelFrame(frameId);
    frameId = null;
    previousTimestamp = null;
  }

  function animate(timestamp: number, owner: number) {
    if (owner !== generation || !running || visibility.hidden) return;
    frameId = null;
    schedule();
    if (!Number.isFinite(timestamp)) {
      previousTimestamp = null;
      return;
    }
    const deltaSeconds = previousTimestamp === null
      ? 0 : Math.min(0.1, Math.max(0, (timestamp - previousTimestamp) / 1000));
    previousTimestamp = timestamp;

    for (const stage of stages) {
      if (owner !== generation || !running || visibility.hidden) break;
      try {
        stage.run({ timestamp, deltaSeconds });
        failingStages.delete(stage);
      } catch (error) {
        // A persistent failure must neither starve later work nor flood logs.
        if (!failingStages.has(stage)) {
          failingStages.add(stage);
          try { onError(stage.name, error); } catch { /* Reporting cannot stop rendering. */ }
        }
      }
    }
  }

  function onVisibilityChange() {
    // Both boundaries reset the clock, even when no hidden RAF was delivered.
    cancelPending();
    schedule();
  }
  visibility.addEventListener('visibilitychange', onVisibilityChange);

  function stop() {
    running = false;
    cancelPending();
  }

  return {
    start() {
      if (disposed || running) return;
      running = true;
      previousTimestamp = null;
      schedule();
    },
    stop,
    dispose() {
      stop();
      disposed = true;
      visibility.removeEventListener('visibilitychange', onVisibilityChange);
      failingStages.clear();
    }
  };
}

/** Unavailable ephemerides may use NaN placeholders; available records may not. */
export function hasFiniteAvailableBodyState(bodies: Float64Array, availability: Uint8Array): boolean {
  if (bodies.length !== availability.length * MODEL_WORKER_RECORD_SIZE) return false;
  for (let index = 0; index < availability.length; index++) {
    if (availability[index] !== 1) continue;
    for (let offset = 0; offset < MODEL_WORKER_RECORD_SIZE; offset++) {
      if (!Number.isFinite(bodies[index * MODEL_WORKER_RECORD_SIZE + offset])) return false;
    }
  }
  return true;
}
