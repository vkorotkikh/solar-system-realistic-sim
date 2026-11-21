"""Sweep of the production torch solver (backend/planner/torch.py), keep-out off.

Question: does the two-burn solve converge everywhere in the supported range, how often is the
fallback start needed, how fast is it, and how far is each arrival from an independent integrator?
Run: python -B sweep_two_burn.py <backend dir>
"""
import json, sys, time
import numpy as np
from scipy.integrate import solve_ivp
sys.path.insert(0, sys.argv[1])
from planner import torch

PAIRS = [("earth", "mars"), ("earth", "venus"), ("earth", "mercury"), ("earth", "jupiter"), ("mars", "ceres"),
         ("earth", "eris"), ("mars", "earth"), ("jupiter", "saturn"), ("venus", "pluto")]
GS = [0.1, 0.3, 1.0, 3.0, 10.0, 12.0]
JD0 = 2461041.5
DATES = [JD0 + 152.0 * k for k in range(24)]          # 24 dates over ten years
fallbacks = [0]
straight = torch._straight_at_target
def counted(*args):
    fallbacks[0] += 1
    return straight(*args)
torch._straight_at_target = counted

def reintegrate(trip, start):
    acc = trip.acceleration_g * torch.G_AU_DAY2
    y = np.concatenate(start(trip.depart_jd))
    for direction, days in zip(trip.directions, trip.burn_days):
        def rhs(_, y, direction=direction):
            return np.concatenate([y[3:], -torch.MU_SUN * y[:3] / np.linalg.norm(y[:3]) ** 3 + acc * direction])
        y = solve_ivp(rhs, (0.0, days), y, method="DOP853", rtol=1e-12, atol=1e-14).y[:, -1]
    return y

rows, failed = [], []
for origin, target in PAIRS:
    A, B = torch.body_state(origin), torch.body_state(target)
    for g in GS:
        for jd in DATES:
            started = time.perf_counter()
            try:
                trip = torch.solve(origin, target, jd, g, keep_out_au=0.0)
            except torch.NoTrip as error:
                failed.append((origin, target, g, jd, str(error)))
                continue
            ms = (time.perf_counter() - started) * 1e3
            y = reintegrate(trip, A)
            rB, vB = B(trip.arrive_jd)
            rows.append(dict(origin=origin, target=target, g=g, jd=jd, ms=ms, days=trip.days,
                             km=float(np.linalg.norm(y[:3] - rB) * torch.AU_KM), m_s=float(np.linalg.norm(y[3:] - vB) * torch.KM_S * 1e3),
                             closest=trip.closest_sun_au, peak=trip.peak_speed_km_s))
ms = np.array([row["ms"] for row in rows])
print(f"trips {len(rows) + len(failed)}  solved {len(rows)}  no trip {len(failed)}  fallback starts used {fallbacks[0]}")
print(f"ms per solve: median {np.median(ms):.2f}  p95 {np.percentile(ms, 95):.2f}  max {ms.max():.2f}")
print(f"arrival against DOP853 rtol 1e-12: worst {max(r['km'] for r in rows):.2f} km, {max(r['m_s'] for r in rows):.4f} m/s")
for g in GS:
    part = [r for r in rows if r["g"] == g]
    print(f"  {g:5.1f} g: n={len(part)}  worst {max(r['km'] for r in part):7.2f} km {max(r['m_s'] for r in part):.4f} m/s  "
          f"closest Sun approach min {min(r['closest'] for r in part):.4f} AU  peak speed max {max(r['peak'] for r in part):.0f} km/s")
for row in failed:
    print("NO TRIP", row)
json.dump(dict(rows=rows, failed=failed, fallbacks=fallbacks[0]), open(sys.argv[0].replace(".py", ".json"), "w"))
