import type { Camera, Scene, WebGLRenderer } from 'three';

interface RendererWarmupOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Compile the final scene with owned readiness polling, unlike Three's unabortable compileAsync timer. */
export function warmupRenderer(
  renderer: Pick<WebGLRenderer, 'compile' | 'info' | 'getContext'>,
  scene: Scene,
  camera: Camera,
  { signal, timeoutMs = 30_000 }: RendererWarmupOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(pollTimer);
      clearTimeout(deadline);
      signal?.removeEventListener('abort', cancel);
      complete();
    };
    const fail = (error: unknown) => finish(() => reject(error));
    const cancel = () => fail(signal?.reason ?? new DOMException('Shader warmup cancelled', 'AbortError'));
    if (signal?.aborted) { cancel(); return; }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      fail(new RangeError('Shader warmup timeout must be finite and positive.'));
      return;
    }
    signal?.addEventListener('abort', cancel, { once: true });

    try {
      const gl = renderer.getContext();
      if (gl.isContextLost()) throw new Error('The graphics context was lost during startup.');
      renderer.compile(scene, camera);
      if (settled) return;
      // Public renderer.info exposes the native program handles. Snapshot only
      // after compilation; never poll Three's material-properties cache, which
      // is replaced during restoration and cleared during disposal.
      const programs = (renderer.info.programs ?? []).map(program => program.program as WebGLProgram);
      const parallel = gl.getExtension('KHR_parallel_shader_compile');
      const check = () => {
        if (settled) return;
        try {
          if (gl.isContextLost()) throw new Error('The graphics context was lost during startup.');
          if (parallel && !programs.every(program => gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR))) {
            pollTimer = setTimeout(check, 10);
            return;
          }
          // Without KHR this is an honest synchronous fallback. Catalog work
          // has already completed, but no full-scene latency promise is made.
          for (const program of programs) {
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
              throw new Error(`A graphics shader failed to link: ${gl.getProgramInfoLog(program) ?? 'no driver diagnostic'}`);
            }
          }
          finish(resolve);
        } catch (error) { fail(error); }
      };
      deadline = setTimeout(() => fail(new Error('Graphics shader initialization timed out.')), timeoutMs);
      check();
    } catch (error) { fail(error); }
  });
}
