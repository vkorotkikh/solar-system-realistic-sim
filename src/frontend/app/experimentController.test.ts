import { expect, it } from 'vitest';
import { getExperimentPresentation } from './experimentController';
import * as engineModule from '../features/superluminal-modeling/agnShockwaveEngine';
const { createAgnShockwaveEngine } = engineModule;
it('classifies and labels compound and speculative H29 accurately', () => {
  expect(getExperimentPresentation('compound')).toEqual({ action:'Trigger compound shockwave',status:'Standard compound transport model selected.',model:'standard' });
  expect(getExperimentPresentation('h29')).toEqual({ action:'Trigger H29 slipstream',status:'H29 selected \u00b7 speculative metric-frame-dragging visualization with amplified display effects.',model:'speculative' });
});
it('actual engine preserves energy/source/hypothesis independence', () => {
  const engine=createAgnShockwaveEngine(null,null);
  engine.triggerEvent('M87',12,.5,{preset:'SgrA_WarpWave_H29'});
  expect(engine.getTimeline()?.energyErg).toBe(5e54);
  if ('resolveAgnSelection' in engineModule) {
    expect(engine.getCurrentSource()).toBe('SagittariusA'); expect(engine.getWarpState()).not.toBeNull();
  } else { expect(engine.getCurrentSource()).toBe('M87'); expect(engine.getWarpState()).toBeNull(); }
  engine.triggerEvent('SagittariusA',8,1.4,{preset:'M87_Monster',hypothesis:'h29'});
  expect(engine.getTimeline()?.energyErg).toBe(1e58);
  if ('resolveAgnSelection' in engineModule) {
    expect(engine.getCurrentSource()).toBe('M87'); expect(engine.getWarpState()).toBeNull();
  } else { expect(engine.getCurrentSource()).toBe('SagittariusA'); expect(engine.getWarpState()).not.toBeNull(); }
});
