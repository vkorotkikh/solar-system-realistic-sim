export interface RendererRecoverySurfaceArgs {
  canvas: HTMLCanvasElement; surface: HTMLElement; retry: HTMLButtonElement;
  onUnavailable: () => void; reload?: () => void;
}
export interface RendererRecoveryArgs<T> extends RendererRecoverySurfaceArgs {
  create: () => T;
}
export function createRendererRecoverySurface({ canvas, surface, retry, onUnavailable, reload = () => location.reload() }: RendererRecoverySurfaceArgs) {
  let available = true;
  const message = surface.querySelector<HTMLElement>('[role="alert"]');
  function fail(text: string) {
    available = false; onUnavailable(); surface.hidden = false;
    if (message && message.textContent !== text) message.textContent = text;
    // A mobile dialog may own focus. Its close action exposes recovery afterward.
    if (!surface.closest('[inert]')) retry.focus();
    canvas.inert = true; canvas.setAttribute('aria-hidden', 'true');
  }
  function lost(event: Event) { event.preventDefault(); fail('The graphics connection was lost. The simulation has stopped. Reload the visualization to try again.'); }
  function restored() { if (!available && message) message.textContent = 'The graphics connection is available again. Reload the visualization to restart the simulation.'; }
  canvas.addEventListener('webglcontextlost', lost); canvas.addEventListener('webglcontextrestored', restored);
  retry.addEventListener('click', reload);
  function initialize<T>(create: () => T): T | null {
    if (!available) return null;
    try { return create(); }
    catch (error) {
      console.error('[visualization] initialization failed:', error);
      fail('The visualization could not start. WebGL may be unavailable or the application configuration may be invalid. Enable graphics acceleration or try another supported browser, then reload.');
      return null;
    }
  }
  return { initialize, get available() { return available; }, reportFailure: fail, dispose() {
    canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored); retry.removeEventListener('click', reload);
  } };
}

export function createRendererRecovery<T>({ create, ...args }: RendererRecoveryArgs<T>) {
  const recovery = createRendererRecoverySurface(args);
  const value = recovery.initialize(create);
  return { value, get available() { return recovery.available; },
    reportFailure: recovery.reportFailure, dispose: recovery.dispose };
}
