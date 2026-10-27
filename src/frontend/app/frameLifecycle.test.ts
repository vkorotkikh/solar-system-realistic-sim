import { describe, expect, it, vi } from 'vitest';
import { createFrameLifecycle, hasFiniteAvailableBodyState, type FrameStage } from './frameLifecycle';
import { createTimeController } from './timeController';

class Visibility extends EventTarget {
  hidden = false;
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

function harness(stages: FrameStage[], initiallyHidden = false) {
  const visibility = new Visibility();
  visibility.hidden = initiallyHidden;
  const pending = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  const report = vi.fn();
  const loop = createFrameLifecycle({
    stages, visibility, onError: report,
    requestFrame: callback => { pending.set(++sequence, callback); return sequence; },
    cancelFrame: id => { pending.delete(id); }
  });
  return {
    loop, pending, visibility, report,
    frame(timestamp: number) {
      const next = pending.entries().next().value;
      if (!next) throw new Error('No scheduled frame');
      pending.delete(next[0]);
      next[1](timestamp);
    }
  };
}

function clockStage() {
  const simState = { julianDate: 2451545, timeScaleDaysPerSec: 120, timeScaleDirty: false, paused: false };
  const time = createTimeController({
    dom: {}, simState, minTimeScale: -120, maxTimeScale: 120,
    currentJulianDate: () => 2451545, formatJulianAsDate: String
  });
  const deltas: number[] = [];
  const stage: FrameStage = {
    name: 'time', run: ({ deltaSeconds }) => {
      deltas.push(deltaSeconds);
      time.advanceLocalTime(deltaSeconds);
    }
  };
  return { stage, simState, deltas };
}

describe('active frame lifecycle', () => {
  it('bounds a 60-second foreground stall to 100 ms, without later catch-up', () => {
    const { stage, simState, deltas } = clockStage();
    const app = harness([stage]); app.loop.start();
    app.frame(1000); app.frame(61000); app.frame(61020);
    expect(deltas).toEqual([0, 0.1, 0.02]);
    expect(simState.julianDate).toBeCloseTo(2451559.4, 8);
    expect(app.pending.size).toBe(1);
    app.loop.dispose();
  });

  it('cancels hidden work and discards the full 60-second gap at 120 days/sec', () => {
    const { stage, simState, deltas } = clockStage();
    const app = harness([stage]); app.loop.start();
    app.frame(1000); app.frame(1020);
    const before = simState.julianDate;
    const lateCallback = [...app.pending.values()][0];
    app.visibility.setHidden(true);
    expect(app.pending.size).toBe(0);
    lateCallback(30000);
    expect(simState.julianDate).toBe(before);
    app.visibility.setHidden(false);
    app.visibility.setHidden(false);
    expect(app.pending.size).toBe(1);
    app.frame(61020);
    expect(simState.julianDate).toBe(before);
    app.frame(61040);
    expect(simState.julianDate - before).toBeCloseTo(2.4, 8);
    expect(deltas).toEqual([0, 0.02, 0, 0.02]);
    app.loop.dispose();
  });

  it('does not schedule while initially hidden and never restarts after disposal', () => {
    const app = harness([], true);
    app.loop.start(); app.loop.start();
    expect(app.pending.size).toBe(0);
    app.visibility.setHidden(false);
    expect(app.pending.size).toBe(1);
    app.loop.dispose(); app.loop.start();
    app.visibility.setHidden(true); app.visibility.setHidden(false);
    expect(app.pending.size).toBe(0);
  });

  it('continues every later stage on every frame through persistent failures and reports once', () => {
    const visited: string[] = [];
    let fail = true;
    const app = harness([
      { name: 'model', run: () => { visited.push('model'); } },
      { name: 'kuiper', run: () => { visited.push('kuiper'); if (fail) throw new Error('bad stage'); } },
      { name: 'camera', run: () => { visited.push('camera'); } },
      { name: 'render', run: () => { visited.push('render'); } },
      { name: 'hud', run: () => { visited.push('hud'); } }
    ]);
    app.loop.start(); app.frame(1000); app.frame(1020);
    expect(visited).toEqual(['model', 'kuiper', 'camera', 'render', 'hud', 'model', 'kuiper', 'camera', 'render', 'hud']);
    expect(app.report).toHaveBeenCalledExactlyOnceWith('kuiper', expect.any(Error));
    fail = false; app.frame(1040); fail = true; app.frame(1060);
    expect(app.report).toHaveBeenCalledTimes(2);
    app.loop.dispose();
  });

  it('contains a failing error reporter and still reaches the HUD', () => {
    let hud = 0;
    const app = harness([
      { name: 'broken', run: () => { throw new Error('stage'); } },
      { name: 'hud', run: () => { hud++; } }
    ]);
    app.report.mockImplementation(() => { throw new Error('reporter'); });
    app.loop.start(); app.frame(0); app.frame(20);
    expect(hud).toBe(2);
    app.loop.dispose();
  });

  it('stops the remaining frame stages when visualization is disposed mid-frame', () => {
    let rendered = false;
    const app = harness([
      { name: 'stop', run: () => { app.loop.dispose(); } },
      { name: 'render', run: () => { rendered = true; } }
    ]);
    app.loop.start(); app.frame(1000);
    expect(rendered).toBe(false);
    expect(app.pending.size).toBe(0);
  });

  it('resets on invalid timestamps and never integrates backward wall time', () => {
    const { stage, deltas } = clockStage();
    const app = harness([stage]); app.loop.start();
    app.frame(1000); app.frame(900); app.frame(NaN); app.frame(61000); app.frame(61020);
    expect(deltas).toEqual([0, 0, 0, 0.02]);
    app.loop.dispose();
  });

  it('preserves pause, reverse time, and explicit epoch changes through resume', () => {
    const { stage, simState } = clockStage();
    const app = harness([stage]); app.loop.start(); app.frame(1000);
    simState.paused = true; app.frame(1020);
    expect(simState.julianDate).toBe(2451545);
    app.visibility.setHidden(true); simState.julianDate = 2460000;
    simState.paused = false; simState.timeScaleDaysPerSec = -120;
    app.visibility.setHidden(false); app.frame(61020);
    expect(simState.julianDate).toBe(2460000);
    app.frame(61040);
    expect(simState.julianDate).toBeCloseTo(2459997.6, 8);
    app.loop.dispose();
  });
});

describe('worker snapshot quarantine', () => {
  it.each([0, 1, 2, 3, 4, 5])('rejects a nonfinite available coordinate at record offset %i', offset => {
    const bodies = new Float64Array([1, 2, 3, 4, 5, 6]);
    for (const value of [NaN, Infinity, -Infinity]) {
      bodies[offset] = value;
      expect(hasFiniteAvailableBodyState(bodies, new Uint8Array([1]))).toBe(false);
    }
  });

  it('allows unavailable placeholders while validating all available positions and velocities', () => {
    const bodies = new Float64Array([NaN, NaN, NaN, NaN, NaN, NaN, 1, 2, 3, 4, 5, 6]);
    expect(hasFiniteAvailableBodyState(bodies, new Uint8Array([0, 1]))).toBe(true);
    expect(hasFiniteAvailableBodyState(bodies, new Uint8Array([1, 1]))).toBe(false);
    expect(hasFiniteAvailableBodyState(bodies, new Uint8Array([1]))).toBe(false);
  });
});
