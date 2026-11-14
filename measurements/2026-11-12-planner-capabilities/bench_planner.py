"""Evidence for the planner rework spec: solver throughput, scan output shape, default mission verdict."""
import json, sys, time
sys.path.insert(0, '.')
from data.bodies import ALL_BODIES
from trajectory import run_porkchop_scan, plan_interplanetary_route
from mission import MissionPlannerAgent

JD_2026_11_12 = 2461356.5

def timed(label, fn):
    t = time.perf_counter()
    try:
        out = fn()
        err = None
    except Exception as exc:  # report, never hide
        out, err = None, f"{type(exc).__name__}: {str(exc)[:200]}"
    dt = time.perf_counter() - t
    print(f"\n== {label}: {dt:.2f} s" + (f"  ERROR {err}" if err else ""))
    return out

for n_dep, n_tof, span_days in ((20, 20, 800), (40, 40, 800), (44, 45, 3650)):
    scan = timed(f"porkchop earth->mars {n_dep}x{n_tof} over {span_days} d", lambda: run_porkchop_scan(
        ALL_BODIES, from_id="earth", to_id="mars",
        departure_start_jd=JD_2026_11_12, departure_end_jd=JD_2026_11_12 + span_days,
        departure_step_days=span_days / n_dep, tof_min_days=120.0, tof_max_days=420.0,
        tof_step_days=300.0 / n_tof))
    if scan:
        print("   keys:", sorted(scan.keys()))
        best = scan.get("best") or {}
        print("   best:", json.dumps({k: best.get(k) for k in list(best)[:12]}, default=str)[:500])
        ctx = scan.get("planningContext") or {}
        print("   counters:", json.dumps(ctx.get("counters") or ctx, default=str)[:400])

route = timed("plan_interplanetary_route earth->mars, 0 assists", lambda: plan_interplanetary_route(
    ALL_BODIES, from_id="earth", to_id="mars", departure_jd=JD_2026_11_12, max_assists=0))
if route:
    b = route.get("best") or {}
    print("   keys:", sorted(route.keys()))
    print("   best:", json.dumps({k: b.get(k) for k in ("totalDeltaVKmS", "totalTimeDays", "sequence") if k in b}, default=str))
    print("   leg0:", json.dumps({k: v for k, v in (b.get("legs") or [{}])[0].items() if not isinstance(v, (list, dict))}, default=str)[:500])

mission = timed("MissionPlannerAgent default payload", lambda: MissionPlannerAgent(ALL_BODIES).plan({}))
if mission:
    print("   status:", mission.get("status"))
    for i, c in enumerate(mission.get("alternatives") or []):
        lg = c.get("logistics", {})
        print(f"   candidate {i}: reasons={c.get('verification', {}).get('reasons')} requestedDeltaV={lg.get('totalRequestedDeltaV_km_s')} feasible={lg.get('feasible')} returnedPayloadKg={c.get('payloadClosure', {}).get('returnedPayloadKg')}")
