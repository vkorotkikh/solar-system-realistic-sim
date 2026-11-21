"""Detour on the deepest dives: earth-jupiter / saturn / venus / mercury at 3 and 10 g on their most-blocked days (base rmin < 0.03)."""
from multiprocessing import Pool
from det import *
from exp2 import run
if __name__ == "__main__":
    tasks = [(a, b, g, float(d), 0.1) for (a, b) in (("earth","jupiter"), ("earth","saturn"), ("earth","venus"), ("earth","mercury")) for g in (3.0, 10.0) for d in range(0, 3650)]
    with Pool(8) as p: res = p.map(run, tasks, chunksize=16)
    json.dump(res, open("exp2d.json", "w"))
    deep = [r for r in res if r.get("blocked") and r["base_rmin"] < 0.03]
    print("days:", len(res), "base failed:", sum(not r["base_ok"] for r in res), "blocked:", sum(bool(r.get("blocked")) for r in res), "deep (<0.03 AU):", len(deep))
    for g in (3.0, 10.0):
        for pr in sorted({r["pair"] for r in res}):
            R = [r for r in res if r["g"] == g and r["pair"] == pr]
            bl = [r for r in R if r.get("blocked")]; dp = [r for r in bl if r["base_rmin"] < 0.03]
            bf = [r["day"] for r in R if not r["base_ok"]]
            print(f"{pr:15s} {g:4} g: blocked {len(bl):4d} detour ok {sum(r['ok'] for r in bl):4d} | deep {len(dp):3d} ok {sum(r['ok'] for r in dp):3d} | base failed {len(bf)} {bf[:4]} | min base rmin {min([r['base_rmin'] for r in R if r['base_ok']]):.4f}")
    fl = [r for r in res if r.get("blocked") and not r["ok"]]
    print("failed detours:", len(fl), [(r["pair"], r["g"], r["day"], round(r["base_rmin"], 4), r["msg"]) for r in fl[:10]])
