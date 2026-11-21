import json, time
import numpy as np
from lab import *
from speed import SAMPLE, run_cfg, show, tight_err
cands = [dict(M=16, phi=0.5, ptol=1e-13, ntol=1e-11),               # reference (strict)
         dict(M=12, phi=1.0, ptol=1e-11, ntol=1e-9),                # candidate A
         dict(M=10, phi=1.0, ptol=1e-10, ntol=1e-9),
         dict(M=12, phi=1.5, ptol=1e-10, ntol=1e-9),
         dict(M=10, phi=1.5, ptol=1e-10, ntol=1e-9),
         dict(M=8, phi=1.0, ptol=1e-10, ntol=1e-9),
         dict(M=12, phi=1.0, ptol=1e-11, ntol=3e-9),
         dict(M=12, phi=1.0, ptol=1e-11, ntol=1e-9, jac="fd")]
rows = [run_cfg(c, SAMPLE, reps=5) for c in cands]
show(rows)
json.dump(rows, open("speed2_results.json", "w"))
# per-case timing for candidate A, path on and off, best of 5 per case
kw = dict(M=12, phi_max=1.0, ptol=1e-11, ntol=1e-9)
print("\nper-case wall time, candidate A (best of 5 each), ms: percentiles 50/90/99/max")
for path in (False, True):
    ts = []
    for r in SAMPLE:
        A, B = FN[r["pair"].split("-")[0]], FN[r["pair"].split("-")[1]]
        best = 1e9
        for _ in range(5):
            t = time.perf_counter(); solve_trip(A, B, r["jd"], r["a_g"], want_path=path, **kw); best = min(best, time.perf_counter() - t)
        ts.append(best * 1e3)
    ts = np.array(ts)
    print(f"path={'on ' if path else 'off'}: {np.percentile(ts,50):.2f} / {np.percentile(ts,90):.2f} / {np.percentile(ts,99):.2f} / {ts.max():.2f}")
    if not path:
        for g in ACCS:
            x = np.array([t for t, r in zip(ts, SAMPLE) if r["a_g"] == g]); print(f"    a={g:5}: median {np.median(x):.2f} ms  max {x.max():.2f}")
# breakdown for one typical solve
A, B = FN["earth"], FN["mars"]
import cProfile, pstats, io
pr = cProfile.Profile(); pr.enable()
for _ in range(50): solve_trip(A, B, 2461356.5, 1.0, want_path=False, **kw)
pr.disable(); s = io.StringIO(); pstats.Stats(pr, stream=s).sort_stats("tottime").print_stats(8); print(s.getvalue()[:1800])
