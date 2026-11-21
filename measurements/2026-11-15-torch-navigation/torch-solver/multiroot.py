"""Are there faster two-burn roots than the one the default start finds?  13 extra starts per case:
naive, 4 time-scaled free-space starts, 8 deflected starts.  Writes multiroot_results.json"""
import json, sys, time
from multiprocessing import Pool
from lab import *


def one(args):
    a, b, jd, g, Tdef = args
    A, B = FN[a], FN[b]
    acc = g_to_aud2(g)
    base = better_guess(A, B, jd, acc)
    starts = [naive_guess(A, B, jd, acc)] + rescue_guesses(A, B, jd, acc)
    for s in (0.8, 0.9, 1.1, 1.25):
        gg = dict(base); gg["t1"] *= s; gg["t2"] *= s
        starts.append(gg)
    roots = [Tdef]
    for gs in starts:
        try:
            o = solve_trip(A, B, jd, g, guess=gs, want_path=False)
        except Exception:
            continue
        if o["ok"]:
            roots.append(o["T"])
    roots = sorted(set(round(float(r), 6) for r in roots))
    return dict(pair=f"{a}-{b}", jd=jd, a_g=g, Tdef=Tdef, roots=roots, Tmin=roots[0], nroots=len(roots))


if __name__ == "__main__":
    R = [r for r in json.load(open("grid_results.json"))["results"] if r["ok"]]
    cases = [(r["pair"].split("-")[0], r["pair"].split("-")[1], r["jd"], r["a_g"], r["T"]) for r in R]
    t = time.perf_counter()
    with Pool(int(sys.argv[1]) if len(sys.argv) > 1 else 4) as p:
        res = p.map(one, cases, chunksize=8)
    print("done", time.perf_counter() - t)
    json.dump(res, open("multiroot_results.json", "w"))
    import numpy as np
    print("a_g | cases with a distinct faster root (>0.01% faster) | cases with >1 root | max T improvement % | median improvement among those")
    for g in ACCS:
        rr = [r for r in res if r["a_g"] == g]
        imp = np.array([(r["Tdef"] / r["Tmin"] - 1) * 100 for r in rr])
        fast = imp > 0.01
        print(f"{g:5} | {fast.sum()}/{len(rr)} | {sum(r['nroots'] > 1 for r in rr)} | {imp.max():.3f} | {np.median(imp[fast]) if fast.any() else 0:.3f}")
