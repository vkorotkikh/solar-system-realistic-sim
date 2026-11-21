import json, collections
from multiprocessing import Pool
from lab import *
M = json.load(open("multiroot_results.json"))
cases = [m for m in M if m["a_g"] <= 0.3 and m["Tdef"] / m["Tmin"] - 1 > 1e-4]
print("cases where default misses the min root (a<=0.3 g, >0.01%):", len(cases))
def one(m):
    a, b = m["pair"].split("-")
    A, B = FN[a], FN[b]; jd, g = m["jd"], m["a_g"]; acc = g_to_aud2(g)
    base = better_guess(A, B, jd, acc)
    starts = {"free-space(E1)": base, "naive": naive_guess(A, B, jd, acc)}
    for s in (0.8, 0.9, 1.1, 1.25):
        gg = dict(base); gg["t1"] *= s; gg["t2"] *= s; starts[f"E1 times x{s}"] = gg
    for i, x in enumerate(rescue_guesses(A, B, jd, acc)):
        starts[f"deflect{i}"] = x
    out = {}
    for k, gs in starts.items():
        try:
            o = solve_trip(A, B, jd, g, guess=gs, want_path=False)
            out[k] = o["T"] if o["ok"] else None
        except Exception:
            out[k] = None
    return m, out
with Pool(4) as p: res = p.map(one, cases, chunksize=4)
hit = collections.Counter(); tot = collections.Counter()
for m, out in res:
    for k, T in out.items():
        tot[k] += 1
        if T is not None and T / m["Tmin"] - 1 < 1e-4: hit[k] += 1
print("start | finds the min-T root (of %d cases where the default does not)" % len(cases))
for k in tot: print(f"  {k:16} {hit[k]}/{tot[k]}")
# greedy set cover
names = list(tot)
rem = set(range(len(res))); chosen = []
while rem:
    best = max(names, key=lambda k: sum(1 for i in rem if res[i][1][k] is not None and res[i][1][k] / res[i][0]["Tmin"] - 1 < 1e-4))
    got = {i for i in rem if res[i][1][best] is not None and res[i][1][best] / res[i][0]["Tmin"] - 1 < 1e-4}
    if not got: break
    chosen.append((best, len(got))); rem -= got
print("greedy cover:", chosen, "uncovered", len(rem))
