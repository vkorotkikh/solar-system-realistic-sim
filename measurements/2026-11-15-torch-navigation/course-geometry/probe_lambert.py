import sys, json
sys.path.insert(0, "<session-dir>/wt-c1/backend")
from data.bodies import ALL_BODIES
from trajectory.planner import solve_direct_lambert
r = solve_direct_lambert(ALL_BODIES, from_id="earth", to_id="mars", departure_jd=2461356.5, arrival_jd=2461356.5+210)
print(json.dumps({k:v for k,v in r.items() if k!="solution"}, indent=1, default=str))
print(json.dumps(r["solution"], indent=1))
