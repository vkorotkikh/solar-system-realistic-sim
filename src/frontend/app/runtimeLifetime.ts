export interface RuntimeLifetime {
  readonly signal: AbortSignal;
  defer(cleanup: () => void): () => void;
  dispose(): void;
}

export function createRuntimeLifetime(): RuntimeLifetime {
  const controller = new AbortController();
  const pending = new Set<() => void>();
  let closed = false;

  function defer(cleanup: () => void) {
    let retired = false;
    function retire() {
      if (retired) return;
      retired = true;
      pending.delete(retire);
      try {
        cleanup();
      } catch (error) {
        try { console.error('[visualization] resource cleanup failed:', error); }
        catch { /* Diagnostics must not interrupt the remaining cleanup. */ }
      }
    }
    if (closed) retire();
    else pending.add(retire);
    return retire;
  }

  return {
    signal: controller.signal,
    defer,
    dispose() {
      if (closed) return;
      closed = true;
      controller.abort();
      for (const retire of [...pending].reverse()) retire();
    }
  };
}
