// Test-only composition, loaded AFTER the existing loadShell fixture.
// This uses the actual recovery controller; it does not construct WebGL.
import { createRendererRecoverySurface } from '../../../src/frontend/app/rendererRecovery';

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing production shell element: ${id}`);
  return node as T;
}

const panel = element('control-panel');
const recovery = createRendererRecoverySurface({
  canvas: element<HTMLCanvasElement>('space-canvas'),
  surface: element('renderer-unavailable'),
  retry: element<HTMLButtonElement>('renderer-retry'),
  onUnavailable: () => {
    // Match the presentation part of src/main.ts's onUnavailable callback.
    // Runtime disposal and renderer failures remain actual-app smoke coverage.
    window.__uiFixture.setAutoFrame(false);
    window.__uiFixture.disposeCamera();
    if (panel.contains(document.activeElement)) element('panel-close').focus();
    for (const control of panel.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>(
      '.panel-scroll input, .panel-scroll button, .panel-scroll select',
    )) control.disabled = true;
    element('camera-tools').hidden = true;
    element('session-label').textContent = 'Visualization unavailable';
    element('status-focus').textContent = 'Simulation stopped';
    element('status-solar').textContent = 'Sun data unavailable while visualization is stopped';
  },
});

// Exercise the controller's actual initialization-failure text/focus/isolation.
recovery.initialize(() => { throw new Error('Accessibility fixture: renderer unavailable'); });
window.addEventListener('beforeunload', () => recovery.dispose(), { once: true });
