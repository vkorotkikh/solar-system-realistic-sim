"""(1) Do detours need 16 collocation nodes, or do 12 do?  (2) Which blocked days are slow, and why?
Ran against the solver as it stood before the separate DETOUR_NODES setting was removed (torch_quarters_snapshot.py plus
the centred bow); it no longer runs against the committed module, which has one NODES setting.
Run: python -B nodes_and_slow.py <backend dir>"""
import sys, time
import numpy as np
sys.path.insert(0, sys.argv[1])
from planner import torch

JD0 = 2461041.5
calls = {"arc": 0}
arc = torch._arc
def counted(*a, **k):
    calls["arc"] += 1
    return arc(*a, **k)
torch._arc = counted
for nodes in (12, 16):
    torch.DETOUR_NODES = nodes
    blocked = failed = 0
    slow, times, flown = [], [], []
    for origin, target, days in (("earth", "mars", 780), ("earth", "mercury", 730), ("earth", "venus", 584), ("earth", "jupiter", 399), ("pluto", "mercury", 180), ("neptune", "venus", 300)):
        for g in (0.1, 0.3, 1.0, 3.0, 12.0):
            for day in range(days):
                free = torch.solve(origin, target, JD0 + day, g, keep_out_au=0.0)
                if free.closest_sun_au >= torch.KEEP_OUT_AU:
                    continue
                blocked += 1
                calls["arc"] = 0
                started = time.perf_counter()
                try:
                    torch.solve(origin, target, JD0 + day, g)
                except torch.NoTrip:
                    failed += 1
                    slow.append((origin, target, g, day, "NO TRIP", calls["arc"]))
                    continue
                ms = (time.perf_counter() - started) * 1e3
                times.append(ms); flown.append(calls["arc"])
                if ms > 100:
                    slow.append((origin, target, g, day, round(ms), calls["arc"]))
    print(f"detour nodes {nodes}: blocked {blocked}  no trip {failed}  ms median {np.median(times):.1f} p95 {np.percentile(times, 95):.1f} max {max(times):.0f}  "
          f"arcs flown median {np.median(flown):.0f} max {max(flown)}")
    for row in slow[:25]:
        print("   ", row)
