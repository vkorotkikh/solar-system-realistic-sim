"""Trace the Newton iteration of the production solver on chosen cases (debug aid, not a measurement)."""
import inspect, sys, time
import numpy as np
sys.path.insert(0, sys.argv[1])
from planner import torch

src = inspect.getsource(torch._newton)
src = src.replace("        (e1, e2, t1, t2, tilt), (miss, jacobian, course) = trial, flown\n        size = np.abs(miss / scale).max()\n",
                  "        (e1, e2, t1, t2, tilt), (miss, jacobian, course) = trial, flown\n        size = np.abs(miss / scale).max()\n"
                  "        TRACE.append((float(size), float(damping), float(t1 + t2), float(tilt), [float(x) for x in miss / scale]))\n")
assert "TRACE.append" in src
TRACE = []
torch.TRACE = TRACE
exec(src, torch.__dict__)
calls = {"arc": 0}
arc = torch._arc
def counted(*a, **k):
    calls["arc"] += 1
    return arc(*a, **k)
torch._arc = counted

JD0 = 2461041.5
def run(origin, target, jd, g, **kw):
    TRACE.clear(); calls["arc"] = 0
    started = time.perf_counter()
    try:
        trip = torch.solve(origin, target, jd, g, **kw)
        result = f"ok days {trip.days:.4f} tilt {trip.tilt_rad:+.4f} closest {trip.closest_sun_au:.6f}"
    except torch.NoTrip as error:
        result = f"NO TRIP ({error})"
    ms = (time.perf_counter() - started) * 1e3
    print(f"{origin}->{target} jd {jd} g {g} {kw}: {result}  {ms:.0f} ms  arcs flown {calls['arc']}  newton steps {len(TRACE)}")
    for k, (size, damping, days, tilt, miss) in enumerate(TRACE):
        if k < 6 or k >= len(TRACE) - 6:
            print(f"   step {k + 1:2d} size {size:.3e} damping {damping:.4f} days {days:.5f} tilt {tilt:+.5f} miss/scale {np.array2string(np.array(miss), precision=1)}")

seg = {"n": 0, "picard": 0}
picard = torch._picard
def counted_picard(*a, **k):
    seg["picard"] += 1
    return picard(*a, **k)
torch._picard = counted_picard
for case in (("earth", "mercury", JD0 + 124, 0.1), ("pluto", "mercury", JD0 + 6, 0.1), ("earth", "mercury", JD0 + 123, 0.1)):
    seg["picard"] = 0
    run(*case, keep_out_au=0.0)
    print("   picard segments", seg["picard"]); seg["picard"] = 0
    run(*case)
    print("   picard segments", seg["picard"])
