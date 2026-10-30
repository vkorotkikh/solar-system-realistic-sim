// Regression: FE-STARTUP-ESCAPE — retire partial startup without losing recovery.
// Found by /qa on 2026-10-24.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// Proposed FE-STARTUP-ESCAPE owner contract; absent module is additive API RED,
// not execution of these assertions and not another observed product incident.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeLifetime } from './runtimeLifetime';

afterEach(() => vi.restoreAllMocks());

describe('startup acquired-resource lifetime', () => {
  it('has one stable signal and closes an empty owner only once', () => {
    const owner = createRuntimeLifetime();
    const signal = owner.signal;
    const aborted = vi.fn(); signal.addEventListener('abort', aborted);
    expect(signal.aborted).toBe(false);
    owner.dispose(); owner.dispose();
    expect(owner.signal).toBe(signal);
    expect(signal.aborted).toBe(true);
    expect(aborted).toHaveBeenCalledTimes(1);
  });

  it('retires the acquired prefix when a later setup operation fails', () => {
    const owner = createRuntimeLifetime(); const calls: string[] = [];
    const original = new Error('owned setup failure'); let caught: unknown;
    try {
      owner.defer(() => calls.push('renderer'));
      owner.defer(() => calls.push('controls'));
      throw original;
    } catch (error) { caught = error; owner.dispose(); }
    expect(caught).toBe(original);
    expect(calls).toEqual(['controls', 'renderer']);
  });

  it('aborts before callbacks and retires them in reverse registration order', () => {
    const owner = createRuntimeLifetime(); const calls: string[] = [];
    const abortedAtCleanup: boolean[] = [];
    owner.signal.addEventListener('abort', () => calls.push('abort'));
    for (const name of ['renderer', 'controls', 'viewport']) {
      owner.defer(() => { abortedAtCleanup.push(owner.signal.aborted); calls.push(name); });
    }
    owner.dispose(); owner.dispose();
    expect(calls).toEqual(['abort', 'viewport', 'controls', 'renderer']);
    expect(abortedAtCleanup).toEqual([true, true, true]);
  });

  it('manually retires a replacement resource once without closing its owner', () => {
    const owner = createRuntimeLifetime(); const calls: string[] = [];
    const retireOld = owner.defer(() => calls.push('old belt'));
    retireOld(); retireOld();
    expect(owner.signal.aborted).toBe(false);
    const retireNew = owner.defer(() => calls.push('new belt'));
    owner.dispose(); retireOld(); retireNew(); owner.dispose();
    expect(calls).toEqual(['old belt', 'new belt']);
  });

  it('does not restart cleanup when a disposer calls dispose again', () => {
    const owner = createRuntimeLifetime(); const calls: string[] = [];
    owner.defer(() => calls.push('first'));
    owner.defer(() => { calls.push('second'); owner.dispose(); });
    owner.dispose();
    expect(calls).toEqual(['second', 'first']);
  });

  it('marks a manual retirement complete before its callback can retire itself', () => {
    const owner = createRuntimeLifetime(); const calls: string[] = [];
    let retire = () => {};
    retire = owner.defer(() => { calls.push('resource'); retire(); });
    retire(); owner.dispose();
    expect(calls).toEqual(['resource']);
  });

  it('does not replay a pending callback manually retired by another disposer', () => {
    const owner = createRuntimeLifetime(); const calls: string[] = [];
    const retireFirst = owner.defer(() => calls.push('first'));
    owner.defer(() => { calls.push('second'); retireFirst(); });
    owner.dispose();
    expect(calls).toEqual(['second', 'first']);
  });

  it('immediately retires registration after close and returns an inert handle', () => {
    const owner = createRuntimeLifetime(); owner.dispose();
    let abortedAtCleanup: boolean | undefined;
    const cleanup = vi.fn(() => { abortedAtCleanup = owner.signal.aborted; });
    const retire = owner.defer(cleanup);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(abortedAtCleanup).toBe(true);
    retire(); owner.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('immediately retires new registration inside a disposer without reopening', () => {
    const owner = createRuntimeLifetime(); const calls: string[] = [];
    let insideSnapshot: string[] = [];
    owner.defer(() => calls.push('first'));
    owner.defer(() => {
      calls.push('second');
      const retire = owner.defer(() => calls.push('late'));
      insideSnapshot = [...calls]; retire();
    });
    owner.dispose();
    expect(calls).toEqual(['second', 'late', 'first']);
    expect(insideSnapshot).toEqual(['second', 'late']);
  });

  it('is already closed when an abort observer registers another resource', () => {
    const owner = createRuntimeLifetime(); const calls: string[] = [];
    let abortedAtLateCleanup: boolean | undefined;
    owner.defer(() => calls.push('original'));
    owner.signal.addEventListener('abort', () => {
      calls.push('abort start');
      owner.defer(() => { abortedAtLateCleanup = owner.signal.aborted; calls.push('late'); });
      calls.push('abort end'); owner.dispose();
    });
    owner.dispose();
    expect(calls).toEqual(['abort start', 'late', 'abort end', 'original']);
    expect(abortedAtLateCleanup).toBe(true);
  });

  it('reports a throwing disposer and continues other cleanup once', () => {
    const error = new Error('owned cleanup failure');
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    const owner = createRuntimeLifetime(); const calls: string[] = [];
    owner.defer(() => calls.push('first'));
    owner.defer(() => { calls.push('second'); throw error; });
    owner.defer(() => calls.push('third'));
    expect(() => owner.dispose()).not.toThrow(); owner.dispose();
    expect(calls).toEqual(['third', 'second', 'first']);
    expect(report.mock.calls.filter(args => args.includes(error))).toHaveLength(1);
  });

  it('contains manual and late retirement errors without repeating either callback', () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = new Error('manual failure'), late = new Error('late failure');
    const owner = createRuntimeLifetime();
    const cleanup = vi.fn(() => { throw first; }); const retire = owner.defer(cleanup);
    expect(() => retire()).not.toThrow(); expect(owner.signal.aborted).toBe(false);
    owner.dispose(); retire();
    const lateCleanup = vi.fn(() => { throw late; });
    expect(() => owner.defer(lateCleanup)()).not.toThrow();
    expect(cleanup).toHaveBeenCalledTimes(1); expect(lateCleanup).toHaveBeenCalledTimes(1);
    expect(report.mock.calls.filter(args => args.includes(first))).toHaveLength(1);
    expect(report.mock.calls.filter(args => args.includes(late))).toHaveLength(1);
  });

  it('contains a throwing diagnostic reporter without suppressing cleanup or the original failure', () => {
    const reportError = new Error('owned diagnostic failure');
    const report = vi.spyOn(console, 'error').mockImplementation(() => { throw reportError; });
    const owner = createRuntimeLifetime(); const calls: string[] = [];
    const original = new Error('owned startup failure');
    const cleanupError = new Error('owned cleanup failure'); let caught: unknown;
    try {
      owner.defer(() => calls.push('remaining'));
      owner.defer(() => { calls.push('failing'); throw cleanupError; });
      throw original;
    } catch (error) { caught = error; expect(() => owner.dispose()).not.toThrow(); }
    owner.dispose();
    expect(caught).toBe(original);
    expect(calls).toEqual(['failing', 'remaining']);
    expect(report.mock.calls.filter(args => args.includes(cleanupError))).toHaveLength(1);
  });
});
