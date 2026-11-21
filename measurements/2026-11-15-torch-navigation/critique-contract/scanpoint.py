from common import *
from trajectory import run_porkchop_scan, plan_interplanetary_route
s = run_porkchop_scan(ALL_BODIES, from_id="earth", to_id="mars", departure_start_jd=2461356.5, departure_end_jd=2461356.5, departure_step_days=1.0, tof_min_days=200.0, tof_max_days=200.0, tof_step_days=5.0)
print("scan keys:", sorted(s.keys()))
print("point keys:", sorted(s["points"][0].keys()))
r = plan_interplanetary_route(ALL_BODIES, from_id="earth", to_id="jupiter", departure_jd=2461356.5, max_assists=1)
print("route keys:", sorted(r.keys()))
b = r["best"]
print("best keys:", sorted(b.keys()) if b else None)
if b: print("leg keys:", sorted(b["legs"][0].keys()))
