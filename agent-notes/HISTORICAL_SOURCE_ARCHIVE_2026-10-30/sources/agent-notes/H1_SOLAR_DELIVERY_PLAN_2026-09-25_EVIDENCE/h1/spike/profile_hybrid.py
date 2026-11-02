# cProfile hybrid-forcing sample_state using one saved realtime snapshot (1 upstream snapshot fetch total)
import sys, time, cProfile, pstats, io, json, os
sys.path.insert(0, '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/wt-h1-spike/backend')
from sim.solar_realtime_data import SolarRealtimeDataProvider
from sim.solar_physics import SolarCoronaPhysicsModel
OUT = '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/spike/snapshot_now.json'
jd = 2461308.6
if os.path.exists(OUT): snap = json.load(open(OUT))
else:
    snap = SolarRealtimeDataProvider(timeout_s=3.8, cache_ttl_s=120.0).latest(jd=jd); json.dump(snap, open(OUT, 'w'))
m = SolarCoronaPhysicsModel(seed=17, base_tube_count=540)
for i in range(3):
    t = time.perf_counter(); st = m.sample_state(jd, fidelity='high', max_features=180, forcing='hybrid', realtime_data=snap); print('hybrid run', i, 's', round(time.perf_counter() - t, 2), 'activity', st['activity_index'], 'pfss', st['pfss_field_lines']['source'])
pr = cProfile.Profile(); pr.enable(); m.sample_state(jd, fidelity='high', max_features=180, forcing='hybrid', realtime_data=snap); pr.disable()
s = io.StringIO(); pstats.Stats(pr, stream=s).sort_stats('cumulative').print_stats(14); print(s.getvalue()[:4000])
