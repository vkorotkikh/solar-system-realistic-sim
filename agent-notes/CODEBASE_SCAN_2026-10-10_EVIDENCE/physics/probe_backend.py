"""Offline physics invariant probes; argument is a selected source snapshot.
Exit 0 means observations captured, not that invariants pass. No product writes.
"""
import json, math, sys, urllib.request
from pathlib import Path
ROOT=Path(sys.argv[1]).resolve()
sys.path.insert(0,str(ROOT/'backend'))
def no_network(*a,**k): raise RuntimeError('network disabled by physics audit')
urllib.request.urlopen=no_network
import numpy as np
from mission.vehicle_service import VehicleService, VehicleDefinition, StageDefinition, default_vehicle
from mission.risk_service import RiskService
from data.bodies import ALL_BODIES
from benchmark.accuracy import benchmark_against_references
from sim.kuiper import KuiperBeltEngine
from sim.tudatpy_hooks import TudatPyEngine
from sim.rebound_nbody import REBOUNDEngine, SUPPORTED_JD_MAX_TDB
from mission.epo.config import EpisodeConfig, EpisodeFamily, EpisodeFamilyPolicy
from mission.epo.runners import EpisodeRunner
out={'snapshot':str(ROOT)}
v=VehicleService()
vehicle=VehicleDefinition('single',[StageDefinition('stage',100,1000,300)])
single=v.evaluate_burn_budget(vehicle,payload_mass_kg=100,burns_km_s=[4.8],reserve_fraction=.05)
split=v.evaluate_burn_budget(vehicle,payload_mass_kg=100,burns_km_s=[2.4,2.4],reserve_fraction=.05)
out['reserve_partition']={'input':{'dry':100,'propellant':1000,'payload':100,'isp_s':300,'reserve_fraction':.05},'single_4_8':single,'two_2_4':split,'required_reserved_kg':50}
infeasible=v.evaluate_burn_budget(default_vehicle(),payload_mass_kg=1000,burns_km_s=[100,100])
risk=RiskService().run_monte_carlo(base_total_delta_v_km_s=200,base_total_time_days=100,base_returned_payload_kg=1000,base_arrival_jd=2451645,base_propellant_margin_kg=infeasible['propellantMarginKg'],samples=30,ephemeris_sigma_fraction=0,thrust_sigma_fraction=0,extraction_sigma_fraction=0)
out['infeasible_risk']={'logistics':infeasible,'risk':risk,'remaining_onboard_propellant':sum(s['propellant_mass_kg']-s['propellant_used_kg'] for s in infeasible['stageTelemetry'] if not s['jettisoned'])}
r=benchmark_against_references(ALL_BODIES,ephemeris_provider='kepler')
out['benchmark']={k:r.get(k) for k in ['scenarioCount','comparableScenarioCount','validationCoverage','meanAbsErrorKmS','passRate']}
# Pure analytic binary initializer check, independent of subsequent integration.
a=1000/149597870.7
q=.35
pp,cp,pv,cv=KuiperBeltEngine._binary_relative_state((43,0,0),(0,1,0),a,0,0,0,q)
relv=np.array(cv)-pv
out['binary_initializer']={'separation_au':a,'mass_ratio_companion_to_primary':q,'relative_speed_au_year':float(np.linalg.norm(relv)),'expected_circular_speed_au_year':math.sqrt(4*math.pi**2*KuiperBeltEngine.NOMINAL_BINARY_TOTAL_MASS_MSUN/a),'center_of_mass_offset_au':((np.array(pp)+q*np.array(cp))/(1+q)).tolist(),'center_of_mass_velocity_au_year':((np.array(pv)+q*np.array(cv))/(1+q)).tolist(),'primary_offset':pp,'companion_offset':cp}
# Exact same physical relative two-body state under two coordinate translations.
t=TudatPyEngine();t._body_ids=['sun','earth'];t._spice_names=['Sun','Earth'];t._stored_bodies=[{'id':'sun','mass_kg':1.989e30},{'id':'earth','mass_kg':5.972e24}]
base=np.array([0,0,0,0,0,0,149597870700,0,0,0,29780,0],dtype=float)
t._current_state=base.copy(); e0=t.get_energy();t._current_state[:3]=[.01*149597870700,0,0];e1=t.get_energy()
out['tudat_energy_translation']={'no_sun_offset_energy_j':e0,'sun_offset_0_01_au_energy_j':e1,'relative_change':(e1-e0)/abs(e0),'expected_change':0,'note':'Injected documented Tudat mixed central-body state; no TudatPy runtime required.'}
# A supported start becomes unsupported after ordinary step, while seek rejects it.
e=REBOUNDEngine();e.initialize(ALL_BODIES[:10],start_jd=SUPPORTED_JD_MAX_TDB);e.step(1)
try:e.set_julian_date(SUPPORTED_JD_MAX_TDB+1);seek='accepted'
except ValueError as ex:seek=str(ex)
out['rebound_range_step']={'max_supported_jd':SUPPORTED_JD_MAX_TDB,'after_step_jd':e.get_julian_date(),'fidelity_after_step':e.get_state()['fidelity'],'same_epoch_seek':seek}
# Public run_family versus run_families must apply the same family policy.
result={'status':'ok','recommendation':{'missionScore':-100,'risk':{'failureProbability':.9}},'verification':{'valid':False}}
family=EpisodeFamily('strict','audit',EpisodeFamilyPolicy(min_mission_score=100,max_failure_probability=.01,require_verifier_valid=True),(EpisodeConfig('one','strict',{}),))
runner=EpisodeRunner();runner.planner=type('FakePlanner',(),{'plan':lambda self,p:result})()
out['epo_family_policy']={'direct_run_family':runner.run_family(family).as_dict(),'run_families':runner.run_families([family]).to_dict()}
print(json.dumps(out,indent=2))
