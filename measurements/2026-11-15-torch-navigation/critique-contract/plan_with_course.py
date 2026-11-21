import sys, time, json
sys.path.insert(0, "../belt-data")
from common import *
import belts_reference as B
from datetime import date
import planner.trips as T
from planner.plans import PlanRequest, solve_plan
cat = B.load_catalog()
orig_leg = T._leg
calls = {"n": 0, "s": 0.0}
def leg_with_course(from_id, to_id, depart_jd, arrive_jd, burns, vd, va, around="sun"):
    leg = orig_leg(from_id, to_id, depart_jd, arrive_jd, burns, vd, va, around)
    if around == "sun":
        t0 = time.perf_counter()
        t = np.linspace(depart_jd, arrive_jd, 181)
        p0, p1 = pos(from_id, depart_jd), pos(to_id, arrive_jd)
        s = ((t - depart_jd) / (arrive_jd - depart_jd))[:, None]
        r = B.screen_fast(cat, t, p0 + s * (p1 - p0))
        k = int(np.argmin(r["dist_au"]))
        leg["course"] = {"nearest_asteroid": {"id": int(cat["id"][k]), "au": float(r["dist_au"][k])}}
        calls["n"] += 1; calls["s"] += time.perf_counter() - t0
    return leg
T._leg = leg_with_course
today = date(2026, 11, 15)
for n in (1, 4):
    calls.update(n=0, s=0.0)
    trips = [{"key": f"t{i}", "search": {"to": "mars"}} for i in range(n)]
    t0 = time.perf_counter()
    r = solve_plan(PlanRequest.model_validate({"trips": trips}), today=today)
    print(f"{n}-trip plan WITH a nearest-asteroid screen on every leg: wall {time.perf_counter()-t0:.2f}s; screens={calls['n']} ({calls['s']:.2f}s in screens); endpoint timeout is 11.5 s")
T._leg = orig_leg
