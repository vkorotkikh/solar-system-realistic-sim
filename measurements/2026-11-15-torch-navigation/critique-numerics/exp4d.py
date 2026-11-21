from multiprocessing import Pool
from clab import *
from exp4 import KW
def floor_g(a, b):
    # 3x Sun gravity at the smaller of the two heliocentric distances (perihelion-free: use a)
    ra = min(np.linalg.norm(FN[a](JD0)[0]), np.linalg.norm(FN[b](JD0)[0]))
    return 3 * MU / ra ** 2 / g_to_aud2(1.0)
def one(r):
    a, b = r["pair"].split("-"); A, B = FN[a], FN[b]; jd, g = r["jd"], r["g"]; acc = g_to_aud2(g)
    t = time.perf_counter()
    base = better_guess(A, B, jd, acc); rs = rescue_guesses(A, B, jd, acc)
    ts = []
    for gs in (base, naive_guess(A, B, jd, acc), rs[6], rs[7]):
        t1 = time.perf_counter()
        try: solve_trip(A, B, jd, g, guess=gs, **KW)
        except Exception: pass
        ts.append((time.perf_counter() - t1) * 1e3)
    return dict(pair=r["pair"], g=g, jd=jd, ts=ts, floor=floor_g(a, b))
if __name__ == "__main__":
    res = json.load(open("exp4.json"))
    with Pool(8) as p: out = p.map(one, res, chunksize=2)
    out = [o for o in out if o["g"] >= o["floor"]]
    print("cases above the proposed thrust floor:", len(out), "of", len(res))
    for g in (0.01, 0.03, 0.1, 0.3):
        R = [o for o in out if o["g"] == g]
        if not R: continue
        four = np.array([sum(o["ts"]) for o in R]); one_ = np.array([o["ts"][0] for o in R])
        print(f"{g} g n={len(R)}: first-guess alone median {np.median(one_):.1f} p90 {np.percentile(one_,90):.1f} max {one_.max():.0f} ms | four starts median {np.median(four):.1f} p90 {np.percentile(four,90):.1f} p99 {np.percentile(four,99):.0f} max {four.max():.0f} ms")
    allfour = np.array([sum(o["ts"]) for o in out])
    print("all <=0.3 g valid: four-start total  median %.1f  p90 %.0f  p99 %.0f  max %.0f ms; cases > 200 ms: %d, > 1 s: %d" % (np.median(allfour), np.percentile(allfour, 90), np.percentile(allfour, 99), allfour.max(), (allfour > 200).sum(), (allfour > 1000).sum()))
    worst = sorted(out, key=lambda o: -sum(o["ts"]))[:4]
    for o in worst: print("  worst:", o["pair"], round(o["jd"]), o["g"], [round(x) for x in o["ts"]])
