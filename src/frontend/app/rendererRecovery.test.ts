// Regression: FE-STARTUP-ESCAPE — retire partial startup without losing recovery.
// Found by /qa on 2026-10-24.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as recoveryModule from './rendererRecovery';

const constructorMessage = 'The visualization could not start. WebGL may be unavailable or the application configuration may be invalid. Enable graphics acceleration or try another supported browser, then reload.';

function fixture(inertAncestor = false) {
  const attributes = new Map<string, string>();
  const canvas = Object.assign(new EventTarget(), {
    inert: false, setAttribute: (name: string, value: string) => attributes.set(name, value)
  }) as unknown as HTMLCanvasElement;
  const alert = { textContent: 'initial' };
  const surface = {
    hidden: true, querySelector: () => alert, closest: () => inertAncestor ? {} : null
  } as unknown as HTMLElement;
  const focus = vi.fn();
  const retry = Object.assign(new EventTarget(), { focus }) as unknown as HTMLButtonElement;
  const reload = vi.fn();
  const onUnavailable = vi.fn();
  return { canvas, surface, retry, reload, onUnavailable, alert, focus, attributes };
}

interface Surface {
  readonly available: boolean;
  reportFailure(message: string): void;
  initialize<T>(factory: () => T): T | null;
  dispose(): void;
}

function makeSurface(args: ReturnType<typeof fixture>): Surface {
  const factory = (recoveryModule as unknown as Record<string, unknown>).createRendererRecoverySurface;
  // Missing new surface is an additive API contract, not another observed bug.
  expect(typeof factory).toBe('function');
  return (factory as (args: ReturnType<typeof fixture>) => Surface)(args);
}

afterEach(() => vi.restoreAllMocks());

describe('existing synchronous renderer recovery compatibility', () => {
  it('returns the exact healthy value and invokes the factory synchronously once', () => {
    const f = fixture(), value = {}, create = vi.fn(() => value);
    const recovery = recoveryModule.createRendererRecovery({ ...f, create });
    expect(create).toHaveBeenCalledTimes(1);
    expect(recovery.value).toBe(value);
    expect(recovery.available).toBe(true);
    expect(f.surface.hidden).toBe(true);
    expect(f.onUnavailable).not.toHaveBeenCalled();
    recovery.dispose();
  });

  it('retains the exact constructor message and original diagnostic object', () => {
    const f = fixture(), error = new Error('owned constructor failure');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recovery = recoveryModule.createRendererRecovery({ ...f, create: () => { throw error; } });
    expect(recovery.value).toBeNull();
    expect(recovery.available).toBe(false);
    expect(f.alert.textContent).toBe(constructorMessage);
    expect(f.onUnavailable).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.some(call => call.includes(error))).toBe(true);
    expect(f.surface.hidden).toBe(false);
    expect(f.focus).toHaveBeenCalledTimes(1);
    expect(f.canvas.inert).toBe(true);
    expect(f.attributes.get('aria-hidden')).toBe('true');
    recovery.dispose();
  });

  it('keeps a live availability getter and prevents the native context-loss default', () => {
    const f = fixture();
    const recovery = recoveryModule.createRendererRecovery({ ...f, create: () => 7 });
    const lost = new Event('webglcontextlost', { cancelable: true });
    f.canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(recovery.available).toBe(false);
    expect(recovery.value).toBe(7);
    expect(f.onUnavailable).toHaveBeenCalledTimes(1);
    expect(f.alert.textContent).toContain('graphics connection was lost');
    recovery.dispose();
  });

  it('preserves callback-before-recovery-presentation order', () => {
    const f = fixture(), observations: boolean[] = [];
    const recovery = recoveryModule.createRendererRecovery({ ...f, create: () => 1,
      onUnavailable: () => observations.push(f.surface.hidden) });
    recovery.reportFailure('owned setup failure');
    expect(observations).toEqual([true]);
    expect(f.surface.hidden).toBe(false);
    expect(f.alert.textContent).toBe('owned setup failure');
    recovery.dispose();
  });

  it('does not steal focus from an inert mobile surface', () => {
    const f = fixture(true);
    const recovery = recoveryModule.createRendererRecovery({ ...f, create: () => 1 });
    recovery.reportFailure('owned failure');
    expect(f.focus).not.toHaveBeenCalled();
    expect(f.surface.hidden).toBe(false);
    expect(f.canvas.inert).toBe(true);
    recovery.dispose();
  });

  it('retains retry and restoration explanation without recreating the renderer', () => {
    const f = fixture(), create = vi.fn(() => 1);
    const recovery = recoveryModule.createRendererRecovery({ ...f, create });
    recovery.reportFailure('owned failure');
    f.canvas.dispatchEvent(new Event('webglcontextrestored'));
    f.retry.dispatchEvent(new Event('click'));
    expect(f.alert.textContent).toContain('available again');
    expect(recovery.available).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
    expect(f.reload).toHaveBeenCalledTimes(1);
    recovery.dispose();
  });

  it('removes retry and both context listeners only on final disposal', () => {
    const f = fixture();
    const recovery = recoveryModule.createRendererRecovery({ ...f, create: () => 1 });
    recovery.dispose(); recovery.dispose();
    const lost = new Event('webglcontextlost', { cancelable: true });
    f.canvas.dispatchEvent(lost); f.canvas.dispatchEvent(new Event('webglcontextrestored'));
    f.retry.dispatchEvent(new Event('click'));
    expect(lost.defaultPrevented).toBe(false);
    expect(f.onUnavailable).not.toHaveBeenCalled();
    expect(f.reload).not.toHaveBeenCalled();
    expect(f.alert.textContent).toBe('initial');
  });
});

describe('early recovery surface additive contract', () => {
  it('owns reporting and retry before any renderer factory is invoked', () => {
    const f = fixture(), surface = makeSurface(f);
    expect(surface.available).toBe(true);
    surface.reportFailure('early startup rejection');
    expect(surface.available).toBe(false);
    expect(f.alert.textContent).toBe('early startup rejection');
    expect(f.onUnavailable).toHaveBeenCalledTimes(1);
    expect(f.focus).toHaveBeenCalledTimes(1);
    f.retry.dispatchEvent(new Event('click'));
    expect(f.reload).toHaveBeenCalledTimes(1);
    surface.dispose();
  });

  it('initializes a healthy factory synchronously without duplicate recovery listeners', () => {
    const f = fixture(), surface = makeSurface(f), value = {}, create = vi.fn(() => value);
    expect(surface.initialize(create)).toBe(value);
    expect(create).toHaveBeenCalledTimes(1);
    expect(surface.available).toBe(true);
    f.canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    f.retry.dispatchEvent(new Event('click'));
    expect(f.onUnavailable).toHaveBeenCalledTimes(1);
    expect(f.reload).toHaveBeenCalledTimes(1);
    expect(surface.available).toBe(false);
    surface.dispose();
  });

  it('uses the unchanged constructor failure policy for a deferred factory', () => {
    const f = fixture(), surface = makeSurface(f), error = new Error('owned delayed constructor failure');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(surface.initialize(() => { throw error; })).toBeNull();
    expect(f.alert.textContent).toBe(constructorMessage);
    expect(surface.available).toBe(false);
    expect(log.mock.calls.some(call => call.includes(error))).toBe(true);
    expect(f.onUnavailable).toHaveBeenCalledTimes(1);
    surface.dispose();
  });

  it('does not initialize a factory after failure or restore availability in place', () => {
    const f = fixture(), surface = makeSurface(f), create = vi.fn(() => 1);
    surface.reportFailure('already stopped');
    expect(surface.initialize(create)).toBeNull();
    expect(create).not.toHaveBeenCalled();
    f.canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(surface.available).toBe(false);
    expect(f.alert.textContent).toContain('available again');
    surface.dispose();
  });

  it('retains its three recovery listeners until explicit surface disposal', () => {
    const f = fixture(), surface = makeSurface(f);
    surface.reportFailure('stopped');
    f.retry.dispatchEvent(new Event('click'));
    expect(f.reload).toHaveBeenCalledTimes(1);
    surface.dispose();
    const before = f.alert.textContent;
    const lost = new Event('webglcontextlost', { cancelable: true });
    f.canvas.dispatchEvent(lost); f.canvas.dispatchEvent(new Event('webglcontextrestored'));
    f.retry.dispatchEvent(new Event('click'));
    expect(lost.defaultPrevented).toBe(false);
    expect(f.alert.textContent).toBe(before);
    expect(f.onUnavailable).toHaveBeenCalledTimes(1);
    expect(f.reload).toHaveBeenCalledTimes(1);
  });
});
