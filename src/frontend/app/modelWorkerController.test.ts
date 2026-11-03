import { afterEach, describe, expect, it, vi } from 'vitest';
import { createModelWorkerController, type OrbitalWorker } from './modelWorkerController';
import type { ModelWorkerInboundMessage, ModelWorkerOutboundMessage } from '../../workers/modelWorkerContract';

class WorkerDouble implements OrbitalWorker {
  onmessage: ((event: MessageEvent<ModelWorkerOutboundMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  messages: ModelWorkerInboundMessage[] = [];
  terminate = vi.fn();
  postMessage(message: ModelWorkerInboundMessage) { this.messages.push(message); }
  emit(data: ModelWorkerOutboundMessage) { this.onmessage?.({ data } as MessageEvent<ModelWorkerOutboundMessage>); }
  ready() { this.emit({ type: 'ready', bodyCount: 1, schemaVersion: 2 }); }
  state(sequence = this.messages.at(-1)!.sequence, tickJd = 2451545) {
    return { type: 'state' as const, schemaVersion: 2 as const, sequence, tickJd,
      bodies: new Float64Array([1, 2, 3, 4, 5, 6]), availability: new Uint8Array([1]) };
  }
}

function setup() {
  vi.useFakeTimers();
  const workers: WorkerDouble[] = [];
  let jd = 2451545;
  const controller = createModelWorkerController({
    catalog: { bodies: [{ id: 'sun', sourceIndex: 0, orbit: null }] },
    getJulianDate: () => jd,
    createWorker: () => { const worker = new WorkerDouble(); workers.push(worker); return worker; },
    readyTimeoutMs: 100, responseTimeoutMs: 50, retryDelayMs: 10, maxRestarts: 2,
  });
  controller.start();
  return { controller, workers, setJd: (next: number) => { jd = next; } };
}

afterEach(() => vi.useRealTimers());

describe('orbital worker ownership and silence recovery', () => {
  it('retires a worker that never becomes ready and bounds retries', () => {
    const { controller, workers } = setup();
    vi.advanceTimersByTime(100);
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(controller.status).toBe('fallback');
    expect(controller.ready).toBe(false);
    vi.runAllTimers();
    expect(workers).toHaveLength(3);
    expect(workers.every(worker => worker.terminate.mock.calls.length === 1)).toBe(true);
    expect(controller.status).toBe('fallback');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('recovers silent in-flight ticks at the current JD and fences retired replies', () => {
    const { controller, workers, setJd } = setup();
    workers[0].ready();
    controller.tick(0.016);
    const retiredHandler = workers[0].onmessage!;
    const old = workers[0].state();
    vi.advanceTimersByTime(50);
    expect(controller.latestState).toBe(null);
    expect(controller.status).toBe('fallback');
    setJd(2451546);
    vi.advanceTimersByTime(10);
    expect(workers[1].messages[0]).toMatchObject({ type: 'init', simStartJd: 2451546 });
    workers[1].ready();
    controller.tick(0.016);
    retiredHandler({ data: old } as MessageEvent<ModelWorkerOutboundMessage>);
    expect(controller.latestState).toBe(null);
    workers[1].emit(workers[1].state(undefined, 2451546));
    expect(controller.latestState?.tickJd).toBe(2451546);
    expect(controller.status).toBe('ready');
    controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not acknowledge mismatched sequence or JD and times out malformed replies', () => {
    const { controller, workers } = setup();
    const worker = workers[0]; worker.ready(); controller.tick(0.016);
    worker.emit(worker.state(worker.messages.at(-1)!.sequence + 1));
    worker.emit(worker.state(undefined, 2451546));
    worker.emit({ ...worker.state(), bodies: new Float64Array(2) });
    controller.tick(0.016);
    expect(worker.messages).toHaveLength(2);
    expect(controller.latestState).toBe(null);
    vi.advanceTimersByTime(50);
    expect(worker.terminate).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it('accepts unavailable bodies but quarantines nonfinite available vectors', () => {
    const { controller, workers } = setup(); const worker = workers[0];
    worker.ready(); controller.tick(0.016);
    worker.emit({ ...worker.state(), bodies: new Float64Array(6).fill(NaN), availability: new Uint8Array([0]) });
    expect(controller.latestState?.availability[0]).toBe(0);
    controller.tick(0.016);
    worker.emit({ ...worker.state(), bodies: new Float64Array(6).fill(NaN) });
    expect(controller.status).toBe('fallback');
    expect(controller.latestState).toBe(null);
    controller.dispose();
  });

  it.each([1, 2])('shares the restart bound after %i initialization timeouts and nonfinite replies', initializationTimeouts => {
    const { controller, workers } = setup();
    for (let index = 0; index < 3; index++) {
      const worker = workers[index];
      if (index < initializationTimeouts) {
        vi.advanceTimersByTime(100);
      } else {
        worker.ready();
        controller.tick(0.016);
        worker.emit({ ...worker.state(), bodies: new Float64Array(6).fill(NaN) });
      }
      expect(controller.status).toBe('fallback');
      expect(controller.latestState).toBe(null);
      if (index < 2) vi.advanceTimersByTime((index + 1) * 10);
    }
    vi.runAllTimers();
    expect(workers).toHaveLength(3);
    expect(workers.every(worker => worker.terminate.mock.calls.length === 1)).toBe(true);
    expect(workers.flatMap(worker => worker.messages).filter(message => message.type === 'tick')).toHaveLength(3 - initializationTimeouts);
    expect(controller.ready).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    controller.dispose();
  });

  it('handles constructor, post and message decoding errors without leaked timers', () => {
    vi.useFakeTimers();
    const controller = createModelWorkerController({ catalog: { bodies: [] }, getJulianDate: () => 2451545,
      createWorker: () => { throw new Error('unsupported'); }, maxRestarts: 0 });
    expect(() => controller.start()).not.toThrow();
    expect(controller.status).toBe('fallback'); controller.dispose();
    const next = setup(); next.workers[0].ready();
    next.workers[0].postMessage = () => { throw new Error('clone failed'); };
    expect(() => next.controller.tick(.016)).not.toThrow();
    expect(next.controller.status).toBe('fallback'); next.controller.dispose();
    const third = setup(); third.workers[0].onmessageerror?.({} as MessageEvent);
    expect(third.controller.status).toBe('fallback'); third.controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disposal cancels pending recovery and is idempotent', () => {
    const { controller, workers } = setup();
    vi.advanceTimersByTime(100); controller.dispose(); controller.dispose();
    vi.runAllTimers(); controller.start(); controller.tick(.016);
    expect(workers).toHaveLength(1);
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(controller.status).toBe('disposed');
  });
});

describe('restart budget over a long-lived page', () => {
  const MINUTE = 60_000;

  it('earns the budget back after a healthy hour, so isolated stalls never end in permanent fallback', () => {
    const { controller, workers } = setup();
    for (let stall = 0; stall < 3; stall++) {
      const worker = workers.at(-1)!;
      worker.ready();
      for (let minute = 0; minute < 60; minute++) {
        controller.tick(0.016); worker.emit(worker.state()); vi.advanceTimersByTime(MINUTE);
      }
      controller.tick(0.016); vi.advanceTimersByTime(50); // the worker goes silent
      expect(controller.status).toBe('fallback');
      vi.advanceTimersByTime(10); // retry delay
    }
    expect(workers).toHaveLength(4); // the initial worker plus one restart per stall
    workers.at(-1)!.ready();
    expect(controller.status).toBe('ready');
    controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { thirdStallAfterMinutes: 4, workerCount: 3, status: 'fallback' }, // 9 min after the first restart
    { thirdStallAfterMinutes: 6, workerCount: 4, status: 'starting' }, // 11 min: the first restart left the window
  ])('bounds restarts to two per rolling ten minutes (%o)', ({ thirdStallAfterMinutes, workerCount, status }) => {
    const { controller, workers } = setup();
    const stallAfter = (minutes: number) => {
      workers.at(-1)!.ready();
      vi.advanceTimersByTime(minutes * MINUTE);
      controller.tick(0.016); vi.advanceTimersByTime(50); // the worker goes silent
      vi.advanceTimersByTime(30); // longer than either retry delay
    };
    stallAfter(0);
    stallAfter(5);
    stallAfter(thirdStallAfterMinutes);
    expect(workers).toHaveLength(workerCount);
    expect(controller.status).toBe(status);
    controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
