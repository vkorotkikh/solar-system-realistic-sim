"""Mercury/Jupiter/Mars blocked days: detour with strict collocation settings (and variants) vs FAST."""
import sys
from multiprocessing import Pool
from det import *
JD_2026 = 2461041.5
CFG = {"FAST": dict(M=12, phi_max=1.0, ptol=1e-11),
       "M12/phi0.5": dict(M=12, phi_max=0.5, ptol=1e-11),
       "M16/phi1.0": dict(M=16, phi_max=1.0, ptol=1e-11),
       "strict": dict(M=16, phi_max=0.5, ptol=1e-13)}
def run(args):
    a, b, g, day = args
    A, B = FN[a], FN[b]; jd = JD_2026 + day
    base = solve_trip(A, B, jd, g, want_path=True, jacobian="fd", **FAST)
    out = dict(pair=a + "-" + b, g=g, day=day)
    ref = away_ref(base)
    for name, kw in CFG.items():
        t = time.perf_counter()
        o = solve_detour(A, B, jd, g, 0.1, base, ref, phi0=0.1, **kw)
        out[name] = dict(ok=bool(o["ok"]), it=o["iters"], ms=(time.perf_counter() - t) * 1e3, nF=o.get("nF"), T=o.get("T"), msg=o["msg"])
    return out
if __name__ == "__main__":
    ex = json.load(open("exp2b.json"))
    tasks = [(r["pair"].split("-")[0], r["pair"].split("-")[1], r["g"], r["day"]) for r in ex
             if r["pair"] == "earth-mercury" and r.get("blocked")]
    with Pool(8) as p: res = p.map(run, tasks, chunksize=4)
    json.dump(res, open("exp2c.json", "w"))
    for name in CFG:
        ok = sum(r[name]["ok"] for r in res); ms = np.array([r[name]["ms"] for r in res])
        its = np.array([r[name]["it"] for r in res if r[name]["ok"]])
        print(f"{name:12s} converged {ok}/{len(res)}  ms med/p90/max {np.median(ms):.1f}/{np.percentile(ms,90):.1f}/{ms.max():.0f}  it med/max {np.median(its):.0f}/{its.max()}")
    bad = [r for r in res if not r["FAST"]["ok"]]
    print("FAST failures:", [(r["g"], r["day"], {k: r[k]["ok"] for k in CFG}) for r in bad])
    # same root across settings?
    d = [abs(r["strict"]["T"] / r["FAST"]["T"] - 1) for r in res if r["strict"]["ok"] and r["FAST"]["ok"]]
    print("strict vs FAST T rel diff: median %.1e max %.1e" % (np.median(d), max(d)))
