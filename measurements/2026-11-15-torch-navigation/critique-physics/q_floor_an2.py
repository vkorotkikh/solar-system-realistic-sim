import json, numpy as np, collections
R = json.load(open("q_floor.json"))
rows = collections.defaultdict(list)
for r in R:
    if not r["roots"]: continue
    allt = [v[0] for v in r["roots"].values()]; tmin = min(allt)
    four = [r["roots"][k][0] for k in ("first","naive","d6","d7") if k in r["roots"]]
    t4 = min(four) if four else float("nan")
    rows[(tuple(r["pair"]), r["tag"])].append(((t4 / tmin - 1) * 100, (r["roots"]["first"][0] / tmin - 1) * 100 if "first" in r["roots"] else float("nan"), r["jd"], r["E1"], tmin))
print("pair/tag: 4-start miss vs 10-start min (count>0.1%, max %), first-only miss (max %)")
for k, v in rows.items():
    a = np.array([x[0] for x in v]); f = np.array([x[1] for x in v])
    print(k, int((a > 0.1).sum()), "of", len(v), f"max {np.nanmax(a):.2f}%", f"| first-only max {np.nanmax(f):.2f}%")
# Venus floor detail: all roots per date
for r in R:
    if r["pair"] == ["earth", "venus"] and r["tag"] == "floor_a":
        print(r["jd"], "E1", round(r["E1"], 2), {k: (round(v[0], 2), round(v[1], 3)) for k, v in r["roots"].items()})
