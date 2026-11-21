"""Where along the flight does a blocked course come closest to the Sun, and does the detour converge?
Pairs with one inner body (Mercury..Mars) and any other catalog body, both directions.
Run: python -B where_closest.py <backend dir>"""
import json, sys, time
import numpy as np
sys.path.insert(0, sys.argv[1])
from planner import torch
from planner.places import PLACES

JD0 = 2461041.5
ids = [p.id for p in PLACES if p.around == "sun" and p.body == ""]
inner = ["mercury", "venus", "earth", "mars"]
rows = []
started_all = time.perf_counter()
for g in (0.1, 0.3, 1.0):
    for k in range(6):
        jd = JD0 + 77.0 + 487.0 * k
        for a in inner:
            for b in ids:
                if a == b:
                    continue
                for origin, target in ((a, b), (b, a)):
                    if origin in inner and target in inner and origin > target:
                        continue
                    free = torch.solve(origin, target, jd, g, keep_out_au=0.0)
                    if free.closest_sun_au >= torch.KEEP_OUT_AU:
                        continue
                    started = time.perf_counter()
                    try:
                        trip = torch.solve(origin, target, jd, g)
                        ok, extra = True, trip.days / free.days - 1
                    except torch.NoTrip:
                        ok, extra = False, None
                    rows.append(dict(origin=origin, target=target, g=g, jd=jd, closest=free.closest_sun_au,
                                     fraction=(free.closest_sun_jd - jd) / free.days, ok=ok, extra=extra,
                                     ms=(time.perf_counter() - started) * 1e3))
print(f"blocked {len(rows)}  no trip {sum(not r['ok'] for r in rows)}  {time.perf_counter() - started_all:.0f} s")
edges = [0, 0.1, 0.2, 0.3, 0.7, 0.8, 0.9, 1.0001]
for lo, hi in zip(edges[:-1], edges[1:]):
    part = [r for r in rows if lo <= r["fraction"] < hi]
    if part:
        print(f"  closest approach at {lo:.1f}-{hi:.1f} of the flight: {len(part):3d} blocked, {sum(not r['ok'] for r in part):3d} no trip, "
              f"median {np.median([r['ms'] for r in part]):.0f} ms, max {max(r['ms'] for r in part):.0f} ms")
for r in rows:
    if not r["ok"]:
        print(f"  NO TRIP {r['origin']}->{r['target']} {r['g']} g jd {r['jd']} closest {r['closest']:.4f} at {r['fraction']:.3f} of the flight, {r['ms']:.0f} ms")
json.dump(rows, open(sys.argv[2], "w"))
