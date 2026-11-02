"""Probe: does a 1e-8-day jd change (one toFixed(8) step) defeat the backend PFSS cache? Offline (GONG fetch stubbed)."""
import sys, os, time, json
WT = sys.argv[1]
sys.path.insert(0, os.path.join(WT, "backend"))
import sim.pfss_magnetogram as pm
pm.fetch_gong_synoptic_map = lambda cr, timeout_s=6.0: None
from sim.solar_physics import SolarCoronaPhysicsModel
m = SolarCoronaPhysicsModel(seed=17, base_tube_count=540)
jd0 = 2461308.25
def run(jd):
    t = time.perf_counter(); m.sample_state(jd, fidelity="high", max_features=180, forcing="hybrid", realtime_data=None); return round(time.perf_counter() - t, 3)
rows = []
rows.append(("warm jd0", run(jd0)))
rows.append(("same jd0 (paused)", run(jd0)))
rows.append(("jd0 + 1e-8 d (one toFixed(8) step)", run(jd0 + 1e-8)))
rows.append(("jd0 + 0.0104 d (0.9 s wall at 1 d/s... = 15 min sim)", run(jd0 + 0.0104)))
rows.append(("jd0 + 3.6 d (0.9 s wall at default 4 d/s)", run(jd0 + 3.6)))
# isolate non-PFSS cost: patch cache to return a precomputed result
pre = m._pfss_cache.get_or_compute(jd=jd0, activity=0.5, n_lines=120, lmax=15, gong_timeout_s=3.5)
class Fake:
    def get_or_compute(self, **kw): return pre
m._pfss_cache = Fake()
rows.append(("jd0 + 7 d with PFSS forced cache-hit (features+parker only)", run(jd0 + 7)))
for r in rows: print(f"{r[1]:>7} s  {r[0]}")
