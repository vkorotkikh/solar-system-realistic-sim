import json, collections, numpy as np
R = json.load(open("q_floor.json"))
by = collections.defaultdict(list)
for r in R: by[(tuple(r["pair"]), r["tag"])].append(r)
def distinct(ts, tol=1e-3):
    ts = sorted(ts); out = []
    for t in ts:
        if not out or t / out[-1] - 1 > tol: out.append(t)
    return out
print("pair | thrust tag | a g | n | no-root cases | first-start fail | best/E1-1 % (min/med/max) | first/E1-1 % med/max | >1 distinct root | first misses min root >0.1% (max miss %) | rmin_sun min AU")
for (pair, tag), rs in by.items():
    a_g = rs[0]["a_g"]
    nr = sum(1 for r in rs if not r["roots"])
    ff = sum(1 for r in rs if "first" not in r["roots"])
    be, fe, multi, miss = [], [], 0, []
    rmin = 9
    for r in rs:
        if not r["roots"]: continue
        ts = [v[0] for v in r["roots"].values()]
        tb = min(ts)
        be.append((tb / r["E1"] - 1) * 100)
        if "first" in r["roots"]: fe.append((r["roots"]["first"][0] / r["E1"] - 1) * 100)
        if len(distinct(ts)) > 1: multi += 1
        if "first" not in r["roots"] or r["roots"]["first"][0] / tb - 1 > 1e-3:
            miss.append(((r["roots"]["first"][0] / tb - 1) * 100) if "first" in r["roots"] else float("nan"))
        rmin = min(rmin, min(v[1] for v in r["roots"].values()))
    print(f"{pair} | {tag} | {a_g:.5f} | {len(rs)} | {nr} | {ff} | {min(be):+.1f}/{np.median(be):+.1f}/{max(be):+.1f} | {np.median(fe):+.1f}/{max(fe, key=abs):+.1f} | {multi} | {len(miss)} ({np.nanmax(miss) if miss else 0:.1f}) | {rmin:.3f}")
print()
# detail on mercury floor
for r in R:
    if r["pair"] == ["earth","mercury"] and r["tag"] in ("floor_a",):
        ts = {k: round(v[0],2) for k,v in r["roots"].items()}
        print("merc floor_a jd", r["jd"], "E1", round(r["E1"],2), ts)
