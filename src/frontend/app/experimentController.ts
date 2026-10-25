export type Hypothesis = 'compound' | 'h29';
export function getExperimentPresentation(hypothesis: Hypothesis) {
  return hypothesis === 'h29' ? { action: 'Trigger H29 slipstream', status: 'H29 selected \u00b7 speculative metric-frame-dragging visualization with amplified display effects.', model: 'speculative' } : { action: 'Trigger compound shockwave', status: 'Standard compound transport model selected.', model: 'standard' };
}
export type AgnSelectionResolver = (source: string, options: { preset?: string; hypothesis?: string }) => {
  sourceKey: string; hypothesis: Hypothesis; source?: { jetModelNote?: string };
};
// The reviewed events integration exports this port; the original October 11
// baseline does not. Keep engine policy in the engine, never duplicate its table.
export function engineSelectionResolver(engine: Record<string, unknown>): AgnSelectionResolver | undefined {
  const resolve = engine.resolveAgnSelection;
  return typeof resolve === 'function' ? resolve as AgnSelectionResolver : undefined;
}
export interface ExperimentControllerArgs {
  dom: { agnSource: HTMLSelectElement; agnPreset: HTMLSelectElement; agnHypothesis: HTMLSelectElement;
    agnStochastic: HTMLInputElement; experimentStatus: HTMLElement; triggerAgnShockwave: HTMLButtonElement };
  resolveSelection?: AgnSelectionResolver;
  sun: { setAgnStochasticFlaring: (enabled: boolean) => void;
    triggerAgnShockwave: (source: string, time: number, intensity: number, options: { preset?: string; hypothesis?: 'h29' }) => void };
}
export function createExperimentController({ dom, sun, resolveSelection }: ExperimentControllerArgs) {
  function presentation() {
    const selection = resolveSelection?.(dom.agnSource.value, { preset: dom.agnPreset.value, hypothesis: dom.agnHypothesis.value });
    if (selection) { dom.agnSource.value = selection.sourceKey; dom.agnHypothesis.value = selection.hypothesis; }
    const copy = getExperimentPresentation(dom.agnHypothesis.value === 'h29' ? 'h29' : 'compound');
    if (selection) copy.status = (selection.hypothesis === 'h29'
      ? 'H29 selected: hypothetical metric display; canonical orbits unchanged.'
      : 'Standard compound transport selected: compressed educational timeline.') + (selection.source?.jetModelNote ? ' ' + selection.source.jetModelNote : '');
    const label = dom.triggerAgnShockwave.querySelector('span');
    if (label && label.textContent !== copy.action) label.textContent = copy.action;
    if (dom.experimentStatus.textContent !== copy.status) dom.experimentStatus.textContent = copy.status;
    dom.experimentStatus.dataset.model = copy.model;
  }
  const stochastic = () => sun.setAgnStochasticFlaring(dom.agnStochastic.checked);
  function trigger() {
    presentation();
    const source = dom.agnSource.value || 'SagittariusA';
    const values: Record<string, [number, number]> = { SagittariusA: [8, 1.4], CentaurusA: [9.5, 1.1], Maffei1: [10.5, .7], M87: [12, .5] };
    const [time, intensity] = values[source] || values.SagittariusA;
    const options: { preset?: string; hypothesis?: 'h29' } = {};
    if (dom.agnPreset.value) options.preset = dom.agnPreset.value;
    if (dom.agnHypothesis.value === 'h29') options.hypothesis = 'h29';
    sun.triggerAgnShockwave(source, time, intensity, options);
  }
  function explicitSelection() { if (resolveSelection) dom.agnPreset.value = ''; presentation(); }
  if (resolveSelection) {
    const document = dom.agnPreset.ownerDocument;
    const label = document.querySelector('label[for="agn-preset"]');
    if (label) label.textContent = 'Event preset';
    const help = document.getElementById('energy-preset-help');
    if (help) help.textContent = 'Event presets select the source, energy and propagation model. Changing source or propagation model clears the preset.';
    const h29 = dom.agnPreset.querySelector('option[value="SgrA_WarpWave_H29"]');
    if (h29) h29.textContent = 'Sgr A* H29 slipstream (5\u00d710\u2075\u2074 erg)';
  }
  presentation();
  dom.agnSource.addEventListener('change', explicitSelection);
  dom.agnPreset.addEventListener('change', presentation);
  dom.agnHypothesis.addEventListener('change', explicitSelection); dom.triggerAgnShockwave.addEventListener('click', trigger);
  dom.agnStochastic.addEventListener('change', stochastic);
  return { dispose() {
    dom.agnSource.removeEventListener('change', explicitSelection); dom.agnPreset.removeEventListener('change', presentation);
    dom.agnHypothesis.removeEventListener('change', explicitSelection); dom.triggerAgnShockwave.removeEventListener('click', trigger);
    dom.agnStochastic.removeEventListener('change', stochastic);
  } };
}
