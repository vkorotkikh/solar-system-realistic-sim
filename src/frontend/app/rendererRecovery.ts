export interface RendererRecoveryArgs<T> {
  canvas: HTMLCanvasElement; surface: HTMLElement; retry: HTMLButtonElement;
  create: () => T; onUnavailable: () => void; reload?: () => void;
}
export function createRendererRecovery<T>({ canvas, surface, retry, create, onUnavailable, reload = () => location.reload() }: RendererRecoveryArgs<T>) {
  let available = true;
  let value: T | null = null;
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
  try { value = create(); }
  catch (error) {
    console.error('[visualization] initialization failed:', error);
    fail('The visualization could not start. WebGL may be unavailable or the application configuration may be invalid. Enable graphics acceleration or try another supported browser, then reload.');
  }
  return { value, get available() { return available; }, dispose() {
    canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored); retry.removeEventListener('click', reload);
  } };
}
