import { describe, expect, it, vi } from 'vitest';
import { createFrameLifecycle } from './frameLifecycle';

class Visibility extends EventTarget {
  hidden = false;
  setHidden(hidden: boolean) { this.hidden = hidden; this.dispatchEvent(new Event('visibilitychange')); }
}

describe('frame callback generation ownership', () => {
  it.each(['visibility', 'stop/start'] as const)('ignores an old callback delivered after %s resume', boundary => {
    const visibility = new Visibility();
    const pending = new Map<number, FrameRequestCallback>();
    const stage = vi.fn();
    let sequence = 0;
    const loop = createFrameLifecycle({ visibility, stages: [{ name: 'render', run: stage }],
      requestFrame: callback => { pending.set(++sequence, callback); return sequence; },
      cancelFrame: id => { pending.delete(id); } });
    try {
      loop.start();
      const oldCallback = [...pending.values()][0];
      if (boundary === 'visibility') { visibility.setHidden(true); visibility.setHidden(false); }
      else { loop.stop(); loop.start(); }
      expect(pending.size).toBe(1);
      oldCallback(60000);
      expect(stage).not.toHaveBeenCalled();
      expect(pending.size).toBe(1);
      const [id, resumed] = [...pending.entries()][0]; pending.delete(id); resumed(61000);
      expect(stage).toHaveBeenCalledExactlyOnceWith({ timestamp: 61000, deltaSeconds: 0 });
      expect(pending.size).toBe(1);
    } finally { loop.dispose(); }
    expect(pending.size).toBe(0);
  });

  it('abandons the old frame when an error recovery stops and restarts the lifecycle', () => {
    const visibility = new Visibility();
    const pending = new Map<number, FrameRequestCallback>();
    let sequence = 0, fail = true;
    const render = vi.fn();
    const loop = createFrameLifecycle({ visibility, stages: [
      { name: 'model', run: () => { if (fail) throw new Error('recover'); } },
      { name: 'render', run: render }
    ], requestFrame: callback => { pending.set(++sequence, callback); return sequence; },
    cancelFrame: id => { pending.delete(id); },
    onError: () => { fail = false; loop.stop(); loop.start(); } });
    try {
      loop.start();
      const [id, callback] = [...pending.entries()][0]; pending.delete(id); callback(1000);
      expect(render).not.toHaveBeenCalled();
      expect(pending.size).toBe(1);
      const [nextId, next] = [...pending.entries()][0]; pending.delete(nextId); next(2000);
      expect(render).toHaveBeenCalledExactlyOnceWith({ timestamp: 2000, deltaSeconds: 0 });
    } finally { loop.dispose(); }
  });
});
