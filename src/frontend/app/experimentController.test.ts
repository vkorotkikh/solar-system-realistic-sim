// FE090 / N0662: unconditional preset contract; found by /qa on 2026-10-24.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
import { expect, it } from 'vitest';
import { getExperimentPresentation } from './experimentController';
import * as engineModule from '../features/superluminal-modeling/agnShockwaveEngine';
const { createAgnShockwaveEngine } = engineModule;
it('classifies and labels compound and speculative H29 accurately', () => {
  expect(getExperimentPresentation('compound')).toEqual({ action:'Trigger compound shockwave',status:'Standard compound transport model selected.',model:'standard' });
  expect(getExperimentPresentation('h29')).toEqual({ action:'Trigger H29 slipstream',status:'H29 selected \u00b7 speculative metric-frame-dragging visualization with amplified display effects.',model:'speculative' });
});
it('actual engine applies preset-owned energy, source and hypothesis', () => {
  const engine=createAgnShockwaveEngine(null,null);
  engine.triggerEvent('M87',12,.5,{preset:'SgrA_WarpWave_H29'});
  expect(engine.getTimeline()?.energyErg).toBe(5e54);
  expect(engine.getCurrentSource()).toBe('SagittariusA'); expect(engine.getWarpState()).not.toBeNull();
  engine.triggerEvent('SagittariusA',8,1.4,{preset:'M87_Monster',hypothesis:'h29'});
  expect(engine.getTimeline()?.energyErg).toBe(1e58);
  expect(engine.getCurrentSource()).toBe('M87'); expect(engine.getWarpState()).toBeNull();
});
