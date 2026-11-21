from clab import *
from exp1 import build
cases = build()[::3]
cfgs = {"complex/FAST": dict(jacobian="complex", **FAST), "fd1e-7/FAST": dict(jacobian="fd", fdh=1e-7, **FAST),
        "complex/strict": dict(jacobian="complex"), "fd1e-7/strict": dict(jacobian="fd", fdh=1e-7)}
T = {k: [] for k in cfgs}
for rep in range(2):
  for (a,b,jd,g,c) in cases:
    A,B=FN[a],FN[b]; gs=better_guess(A,B,jd,g_to_aud2(g))
    for k,kw in cfgs.items():
        best=1e9
        for _ in range(3):
            t=time.perf_counter()
            try: solve_trip(A,B,jd,g,guess=gs,want_path=False,**kw)
            except Exception: pass
            best=min(best,time.perf_counter()-t)
        if rep==0: T[k].append(best*1e3)
        else: T[k][len(T[k])-len(cases)+cases.index((a,b,jd,g,c))] = min(T[k][cases.index((a,b,jd,g,c))], best*1e3) if False else T[k][cases.index((a,b,jd,g,c))]
for k,v in T.items():
    v=np.array(v); print(f"{k:16s} n={len(v)} median {np.median(v):.2f} ms  p90 {np.percentile(v,90):.2f}  p99 {np.percentile(v,99):.2f}  max {v.max():.1f}")
