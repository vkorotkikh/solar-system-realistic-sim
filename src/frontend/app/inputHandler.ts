import { setupUiBindings } from './uiBindings';

interface InputTimeController {
  bindUi: () => void;
}

interface PlannerController {
  bindPlannerUi: () => void;
}

type UiBindingArgs = Parameters<typeof setupUiBindings>[0];

type SetupInputHandlersArgs = UiBindingArgs & {
  timeController: InputTimeController;
  plannerController: PlannerController;
};

export function setupInputHandlers({
  timeController,
  plannerController,
  dom,
  simState,
  controls,
  quickViewPresets,
  handlers
}: SetupInputHandlersArgs) {
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
