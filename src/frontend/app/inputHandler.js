import { setupUiBindings } from './uiBindings.js';

export function setupInputHandlers({
  timeController,
  plannerController,
  dom,
  simState,
  controls,
  quickViewPresets,
  handlers
}) {
  timeController.bindUi();
  plannerController.bindPlannerUi();

  setupUiBindings({
    dom,
    simState,
    controls,
    quickViewPresets,
    handlers
  });
}
