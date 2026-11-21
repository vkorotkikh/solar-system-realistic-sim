from common import *
import time, json
from datetime import date
from planner.plans import PlanRequest, solve_plan
today = date(2026, 11, 15)
for n in (4, 6):
    trips = [{"key": f"t{i}", "search": {"to": "mars"}} for i in range(n)]
    ts = []
    for rep in range(2):
        t0 = time.perf_counter()
        r = solve_plan(PlanRequest.model_validate({"trips": trips}), today=today)
        ts.append(time.perf_counter() - t0)
    legs = sum(len(e["chosen"]["legs"]) + sum(len(a["legs"]) for a in e["alternatives"]) for e in r["trips"].values() if e.get("status") == "ok")
    print(f"{n}-trip plan of untied Earth->Mars: wall {min(ts):.2f}-{max(ts):.2f}s status={r['status']} legs in response={legs} json={len(json.dumps(r))/1024:.1f} kB; "
          f"complete flags={[e['searched']['complete'] for e in r['trips'].values() if e.get('status')=='ok']}")
