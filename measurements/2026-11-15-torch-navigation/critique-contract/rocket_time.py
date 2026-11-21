from common import *
import time, json
from datetime import date
from planner.trips import TripSearchRequest, search_trips
from planner.plans import PlanRequest, solve_plan
today = date(2026, 11, 15)
for to, trip, extra in (("mars", "one_way", {}), ("jupiter", "one_way", {}), ("neptune", "one_way", {}), ("ceres", "round_trip", {"stay_days": 30})):
    ts = []
    for rep in range(2):
        t0 = time.perf_counter()
        r = search_trips(TripSearchRequest.model_validate({"to": to, "trip": trip, **extra}), today=today)
        ts.append(time.perf_counter() - t0)
    body = json.dumps(r)
    legs = sum(len(t["legs"]) for t in r.get("trips", []))
    print(f"{to:8} {trip:10} status={r['status']} wall {min(ts):.2f}-{max(ts):.2f}s (searched.seconds={r['searched']['seconds']}, complete={r['searched']['complete']}) trips={len(r.get('trips',[]))} legs={legs} json={len(body)/1024:.1f} kB")
