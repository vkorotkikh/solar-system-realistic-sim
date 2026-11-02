# cProfile of SolarCoronaPhysicsModel.sample_state (synthetic forcing, no network except one GONG listing)
import sys, time, cProfile, pstats, io
sys.path.insert(0, '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/wt-h1-spike/backend')
from sim.solar_physics import SolarCoronaPhysicsModel
m = SolarCoronaPhysicsModel(seed=17, base_tube_count=540)
jd = 2461308.6
m.sample_state(jd, fidelity='high', max_features=180, forcing='synthetic')  # warm PFSS cache
for fid, mf in [('high', 180), ('operational', 180), ('preview', 64), ('high', 32)]:
    t = time.perf_counter(); m.sample_state(jd, fidelity=fid, max_features=mf, forcing='synthetic'); print(fid, mf, 'pfss-hit sample_state s', round(time.perf_counter() - t, 2))
pr = cProfile.Profile(); pr.enable(); m.sample_state(jd, fidelity='high', max_features=180, forcing='synthetic'); pr.disable()
s = io.StringIO(); pstats.Stats(pr, stream=s).sort_stats('cumulative').print_stats(18); print(s.getvalue()[:5000])
