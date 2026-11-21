"""low thrust (0.003..0.02 g) FD vs complex, and sequential timing"""
import sys
from clab import *
from exp1 import build, PAIRS, one, CFGS, conj_dates
import exp1
from multiprocessing import Pool
if __name__ == "__main__":
    # low-thrust
    exp1.ACCS = [0.003, 0.01, 0.02]
    cases = []
    base = build()
    seen = set()
    for (a,b,jd,g,c) in base:
        if (a,b,jd) in seen: continue
        seen.add((a,b,jd))
        for gg in exp1.ACCS: cases.append((a,b,jd,gg,c))
    exp1.CFGS = {k: CFGS[k] for k in ("complex/FAST","fd1e-6/FAST","fd1e-7/FAST","fd1e-8/FAST","complex/strict","fd1e-7/strict")}
    import exp1 as E
    with Pool(8) as p: res = p.map(E.one, cases, chunksize=4)
    json.dump(res, open("exp1b.json","w"))
    import collections
    for n in E.CFGS:
        rows=[r[n] for r in res]; ok=[x for x in rows if x["ok"]]
        its=np.array([x["it"] for x in ok])
        dT=np.array([abs(r[n]["T"]/r["complex/strict"]["T"]-1) for r in res if r[n]["ok"] and r["complex/strict"]["ok"]])
        print(f"{n:16s} ok {len(ok)}/{len(rows)} {dict(collections.Counter(x['msg'] for x in rows if not x['ok']))} it med/max {np.median(its):.0f}/{its.max():.0f}  dT vs complex/strict >1e-6: {(dT>1e-6).sum()}")
