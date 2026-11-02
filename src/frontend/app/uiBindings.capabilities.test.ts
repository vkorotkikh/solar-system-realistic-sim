import { expect, it, vi } from 'vitest';
import { setupUiBindings } from './uiBindings';
import { setupInputHandlers } from './inputHandler';
import { createSimulationState } from './stateStore';

class Element extends EventTarget {
  value = '';
  checked = false;
  textContent: string | null = '';
  listeners = 0;
  override addEventListener(...args: Parameters<EventTarget['addEventListener']>) {
    this.listeners++;
    super.addEventListener(...args);
  }
}
function fixture() {
  const dom = Object.fromEntries(['togglePlay', 'bodySearch', 'canvas', 'bodyList', 'focusBody',
    'followBody', 'clearFollow', 'statusFocus'].map(name => [name, new Element()]));
  const simState = createSimulationState({ currentJulianDate: () => 2451545, defaultTimeScaleDaysPerSec: 1 });
  const handlers = { applyRenderVisibility: vi.fn(), sendServerMessage: vi.fn() };
  return { dom, simState, controls: { zoomSpeed: 1 }, quickViewPresets: [], handlers };
}
const bind = (value: ReturnType<typeof fixture>) => setupUiBindings(value as unknown as Parameters<typeof setupUiBindings>[0]);

it('supports core controls without optional legacy feature and backend controls', () => {
  const value = fixture();
  expect(() => bind(value)).not.toThrow();
  value.dom.togglePlay.dispatchEvent(new Event('click'));
  expect(value.simState.paused).toBe(true);
  expect(value.dom.togglePlay.textContent).toBe('Resume');
});

it('binds an explicitly supplied feature toggle', () => {
  const value = fixture();
  value.dom.toggleMoons = new Element();
  bind(value);
  value.dom.toggleMoons.dispatchEvent(new Event('change'));
  expect(value.handlers.applyRenderVisibility).toHaveBeenCalledOnce();
});

it.each(['required', 'partial-remote', 'bad-optional'])('validates %s before installing any listeners', invalid => {
  const value = fixture();
  if (invalid === 'required') delete value.dom.bodyList;
  if (invalid === 'partial-remote') value.dom.simConnect = new Element();
  if (invalid === 'bad-optional') value.dom.toggleMoons = {} as Element;
  expect(() => bind(value)).toThrow(/UI bindings/);
  expect(value.dom.togglePlay.listeners).toBe(0);
  expect(value.simState.paused).toBe(false);
});

it('validates the input composition before binding time or planner capabilities', () => {
  const value = fixture();
  delete value.dom.bodyList;
  const timeController = { bindUi: vi.fn() };
  const plannerController = { bindPlannerUi: vi.fn() };
  expect(() => setupInputHandlers({ ...value, timeController, plannerController } as unknown as
    Parameters<typeof setupInputHandlers>[0])).toThrow(/UI bindings/);
  expect(timeController.bindUi).not.toHaveBeenCalled();
  expect(plannerController.bindPlannerUi).not.toHaveBeenCalled();
});
