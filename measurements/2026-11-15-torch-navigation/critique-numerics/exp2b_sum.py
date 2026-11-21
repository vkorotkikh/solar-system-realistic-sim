import json, numpy as np, collections
res = json.load(open("exp2b.json"))
keys = sorted({(r["pair"], r["g"]) for r in res})
for k in keys:
    R = [r for r in res if (r["pair"], r["g"]) == k]
    bfail = [r for r in R if not r["base_ok"]]
    bl = [r for r in R if r.get("blocked")]
    ok = [r for r in bl if r["ok"]]
    s = f"{k[0]:14s} {k[1]:5} g: days {len(R):4d} base-failed {len(bfail):3d} blocked {len(bl):4d} ({100*len(bl)/len(R):.1f}%) detour ok {len(ok):4d}"
    if bl:
        s += f"  fails {dict(collections.Counter(r['msg'] for r in bl if not r['ok']))}"
    if ok:
        its = np.array([r["it"] for r in ok]); ms = np.array([r["ms"] for r in ok])
        pc = np.array([r["dT_h"]/24/r["base_T"]*100 for r in ok])
        er = np.array([r["dop"]["err_km"] for r in ok if r.get("dop")]); mn = np.array([r["dop"]["min_dense"] for r in ok if r.get("dop")])
        s += f"\n      it med/max {np.median(its):.0f}/{its.max()}  ms med/p90/max {np.median(ms):.1f}/{np.percentile(ms,90):.1f}/{ms.max():.1f}  dT% mean {pc.mean():.2f} max {pc.max():.2f}  dop err km max {er.max():.2e}  min|r|dense min {mn.min():.6f}  phi max {max(r['phi_deg'] for r in ok):.1f} deg"
    print(s)
    if bfail: print("      base failures:", [(r['day'], r['base_msg']) for r in bfail[:4]])
    fl = [r for r in bl if not r["ok"]]
    if fl: print("      detour failures (day, base_rmin, msg):", [(r['day'], round(r['base_rmin'],4), r['msg']) for r in fl[:8]])
