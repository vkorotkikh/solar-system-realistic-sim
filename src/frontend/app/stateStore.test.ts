import { describe, expect, it, vi } from 'vitest';
import { createSimulationState } from './stateStore';

describe('stateStore', () => {
  it('emits patches for direct property writes and batched updates', () => {
    const store = createSimulationState({
      currentJulianDate: () => 2_460_000.5,
      defaultTimeScaleDaysPerSec: 10
    });
    const listener = vi.fn();

    const unsubscribe = store.subscribe(listener);

    store.paused = true;
    store.setState({
      serverConnected: true,
      backend: 'rebound'
    });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0][1]).toEqual({ paused: true });
    expect(listener.mock.calls[1][1]).toEqual({
      serverConnected: true,
      backend: 'rebound'
    });

    unsubscribe();
    store.timeScaleDirty = true;

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('returns immutable snapshots of the current scalar state', () => {
    const store = createSimulationState({
      currentJulianDate: () => 2_451_545.0,
      defaultTimeScaleDaysPerSec: 4
    });

    const before = store.snapshot();
    store.julianDate += 12;
    const after = store.snapshot();

    expect(before.julianDate).toBe(2_451_545.0);
    expect(after.julianDate).toBe(2_451_557.0);
  });
});
