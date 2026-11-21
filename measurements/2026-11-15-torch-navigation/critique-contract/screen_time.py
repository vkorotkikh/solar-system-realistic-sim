import sys, time
sys.path.insert(0, "../belt-data")
from common import *
import belts_reference as B
cat = B.load_catalog()
print("catalog rows", len(cat["id"]))
def course(a_id, b_id, jd0, days, n=181):
    t = np.linspace(jd0, jd0 + days, n)
    p0, p1 = pos(a_id, jd0), pos(b_id, jd0 + days)
    s = (t - jd0) / days
    return t, p0[None, :] + s[:, None] * (p1 - p0)[None, :]
cases = {"torch 1g Earth->Mars, 3.3 d": ("earth", "mars", 2461356.5, 3.3),
         "torch 0.3g Earth->Jupiter, 12 d": ("earth", "jupiter", 2461356.5, 12.0),
         "torch 1g Earth->Ceres, 6 d": ("earth", "ceres", 2461356.5, 6.0),
         "ballistic Earth->Mars, 300 d": ("earth", "mars", 2461356.5, 300.0),
         "ballistic Earth->Jupiter, 1000 d": ("earth", "jupiter", 2461356.5, 1000.0)}
for name, (a, b, jd0, d) in cases.items():
    t, c = course(a, b, jd0, d)
    out = []
    for mode in ("fast", "full-prefilter", "full"):
        ts = []
        for rep in range(3):
            t0 = time.perf_counter()
            if mode == "fast": r = B.screen_fast(cat, t, c)
            elif mode == "full-prefilter": r = B.screen(cat, t, c, radial_prefilter=True)
            else:
                if rep: continue
                r = B.screen(cat, t, c)
            ts.append(time.perf_counter() - t0)
        out.append(f"{mode}: {min(ts):.2f}-{max(ts):.2f}s")
    print(f"{name:<36}", " | ".join(out))
