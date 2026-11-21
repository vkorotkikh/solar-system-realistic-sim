"""Task 4: which Lambert-leg fields give the start state, and how well does two-body propagation of them
reproduce the planner's own leg? 400 random legs, Kepler provider, no network."""
import json, random, time
import numpy as np
from course_reference import *
from course_reference import _rhs

random.seed(42)
pairs = [("earth","mars"),("earth","venus"),("earth","mercury"),("earth","jupiter"),("mars","ceres"),
         ("earth","saturn"),("venus","mars"),("earth","ceres"),("mars","jupiter"),("earth","earth")]
pairs = pairs[:-1]
rows, fails = [], 0
t0 = time.time()
while len(rows) < 400:
    f, t = random.choice(pairs)
    d0 = random.uniform(JD_2026_01_01, JD_2026_01_01 + 3000)
    tof = random.uniform(60, 1500)
    try:
        leg = lambert_leg(f, t, d0, d0 + tof)
    except ValueError:
        fails += 1
        continue
    r0 = np.array(leg["startPosition"]); v0 = np.array(leg["departureVelocityApprox"])
    r1, v1 = kepler_propagate(r0, v0, tof)
    rb, vb = body_state(t, d0 + tof)
    # start position vs body
    rs, _ = body_state(f, d0)
    mid_r, _ = kepler_propagate(r0, v0, tof / 2)
    # numerical integration cross-check of the mid point
    sol = solve_ivp(_rhs, (0, tof / 2), np.concatenate([r0, v0]), method="DOP853", rtol=1e-12, atol=1e-14, args=(0, 0, 0, 0))
    rows.append(dict(f=f, t=t, tof=tof,
        start_miss_km=float(np.linalg.norm(r0 - rs) * AU_KM),
        end_miss_km=float(np.linalg.norm(r1 - rb) * AU_KM),
        arr_v_err_kms=float(np.linalg.norm(v1 - np.array(leg["arrivalVelocityApprox"])) * AU_KM / DAY_S),
        mid_vs_ode_km=float(np.linalg.norm(sol.y[:3, -1] - mid_r) * AU_KM),
        speed_kms=float(np.linalg.norm(v0) * AU_KM / DAY_S),
        chord_au=leg["pathLengthAu"], arc_au=None))
dt = time.time() - t0
q = lambda k, p: float(np.percentile([r[k] for r in rows], p))
out = {"legs": len(rows), "lambert_failures_skipped": fails, "seconds": dt}
for k in ("start_miss_km", "end_miss_km", "arr_v_err_kms", "mid_vs_ode_km", "speed_kms"):
    out[k] = {"median": q(k, 50), "p99": q(k, 99), "max": max(r[k] for r in rows)}
out["worst_end_miss"] = max(rows, key=lambda r: r["end_miss_km"])
out["over_1000km"] = sum(r["end_miss_km"] > 1000 for r in rows)
# chord vs arc: pathLengthAu is the chord
leg = lambert_leg("earth", "mars", 2461356.5, 2461566.5)
pts = sample_ballistic_leg("earth", "mars", 2461356.5, 2461566.5, 2001, leg=leg)
arr = np.array([p[1:] for p in pts]); arc = float(np.linalg.norm(np.diff(arr, axis=0), axis=1).sum())
out["earth_mars_210d"] = {"pathLengthAu_field": leg["pathLengthAu"], "chord_au": float(np.linalg.norm(arr[-1]-arr[0])), "sampled_arc_au": arc,
    "sun_min_au": float(np.linalg.norm(arr, axis=1).min())}
# timing, best of three
best = 1e9
for _ in range(3):
    t1 = time.perf_counter(); sample_ballistic_leg("earth","mars",2461356.5,2461566.5,200,leg=leg); best = min(best, time.perf_counter()-t1)
out["sample_200_points_ms_best_of_3_given_leg"] = best * 1e3
best = 1e9
for _ in range(3):
    t1 = time.perf_counter(); lambert_leg("earth","mars",2461356.5,2461566.5); best = min(best, time.perf_counter()-t1)
out["solve_direct_lambert_ms_best_of_3"] = best * 1e3
json.dump(out, open("exp4_leg.json", "w"), indent=1)
print(json.dumps(out, indent=1))
