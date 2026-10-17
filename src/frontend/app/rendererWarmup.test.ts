import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { warmupRenderer } from './rendererWarmup';
import { createFrameLifecycle } from './frameLifecycle';

function fixture(parallel = true) {
  const first = {} as WebGLProgram, second = {} as WebGLProgram;
  const complete = new Set<WebGLProgram>();
  const invalid = new Set<WebGLProgram>();
  const reads: Array<[WebGLProgram, number]> = [];
  let lost = false;
  let compileCount = 0;
  const renderer = {
    info: { programs: [] as Array<{ program: WebGLProgram }> },
    compile() { compileCount++; this.info.programs = [{ program: first }, { program: second }]; },
    getContext: () => ({
      LINK_STATUS: 35714,
      getExtension: () => parallel ? { COMPLETION_STATUS_KHR: 37297 } : null,
      isContextLost: () => lost,
      getProgramParameter: (program: WebGLProgram, parameter: number) => {
        reads.push([program, parameter]);
        return parameter === 37297 ? complete.has(program) : !invalid.has(program);
      },
      getProgramInfoLog: () => 'fixture shader link failure',
    }),
  };
  return {
    first, second, complete, invalid, reads, renderer,
    loseContext: () => { lost = true; }, get compileCount() { return compileCount; },
    start: (options: { signal?: AbortSignal; timeoutMs?: number } = {}) => warmupRenderer(
      renderer as unknown as WebGLRenderer, new Scene(), new PerspectiveCamera(), options,
    ),
  };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('owned renderer shader warmup', () => {
  it('waits for every program created by compilation before checking links', async () => {
    vi.useFakeTimers(); const f = fixture(); let ready = false;
    const pending = f.start().then(() => { ready = true; });
    f.complete.add(f.first); await vi.advanceTimersByTimeAsync(10);
    expect(ready).toBe(false);
    expect(f.reads.filter(([, kind]) => kind === 35714)).toEqual([]);
    f.complete.add(f.second); await vi.advanceTimersByTimeAsync(10); await pending;
    expect(ready).toBe(true); expect(f.compileCount).toBe(1);
    expect(f.reads.filter(([, kind]) => kind === 35714)).toEqual([[f.first, 35714], [f.second, 35714]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses native synchronous link checks when parallel completion is unavailable', async () => {
    vi.useFakeTimers(); const f = fixture(false);
    await f.start();
    expect(f.reads).toEqual([[f.first, 35714], [f.second, 35714]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a failed linked program and removes all owned polling', async () => {
    vi.useFakeTimers(); const f = fixture(); f.complete.add(f.first); f.complete.add(f.second); f.invalid.add(f.second);
    await expect(f.start()).rejects.toThrow('fixture shader link failure');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not compile an already cancelled startup', async () => {
    const f = fixture(); const controller = new AbortController(); controller.abort();
    await expect(f.start({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.compileCount).toBe(0); expect(f.reads).toEqual([]);
  });

  it('cancels pending polling before a caller can dispose its programs', async () => {
    vi.useFakeTimers(); const f = fixture(); const controller = new AbortController();
    const pending = f.start({ signal: controller.signal }).catch(error => error);
    controller.abort(); const readCount = f.reads.length;
    f.renderer.info.programs = []; await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toMatchObject({ name: 'AbortError' });
    expect(f.reads).toHaveLength(readCount); expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a driver that never reports completion', async () => {
    vi.useFakeTimers(); const f = fixture();
    const pending = f.start({ timeoutMs: 25 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(26);
    expect(await pending).toMatchObject({ message: expect.stringContaining('timed out') });
    const readCount = f.reads.length; await vi.advanceTimersByTimeAsync(100);
    expect(f.reads).toHaveLength(readCount); expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects context loss before the next program query', async () => {
    vi.useFakeTimers(); const f = fixture(); const pending = f.start().catch(error => error);
    f.loseContext(); const readCount = f.reads.length; await vi.advanceTimersByTimeAsync(10);
    expect(await pending).toMatchObject({ message: expect.stringContaining('context') });
    expect(f.reads).toHaveLength(readCount); expect(vi.getTimerCount()).toBe(0);
  });

  it.each([new Error('compiler failed'), undefined, null])('contains a synchronous compiler failure (%s)', async failure => {
    vi.useFakeTimers(); const f = fixture(); f.renderer.compile = () => { throw failure; };
    await expect(f.start()).rejects.toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cannot restart a disposed lifecycle through a late or duplicate ready continuation', async () => {
    vi.useFakeTimers(); const f = fixture();
    const visibility = Object.assign(new EventTarget(), { hidden: false });
    const queued = new Map<number, FrameRequestCallback>(); let id = 0;
    const loop = createFrameLifecycle({ visibility, stages: [],
      requestFrame: callback => { queued.set(++id, callback); return id; },
      cancelFrame: frame => { queued.delete(frame); },
    });
    const pending = f.start().then(() => { loop.start(); loop.start(); });
    loop.dispose(); f.complete.add(f.first); f.complete.add(f.second);
    await vi.advanceTimersByTimeAsync(10); await pending;
    expect(queued.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
});
