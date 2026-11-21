"""FAST bundle on the whole grid: convergence, then DOP853 (rtol 1e-12) re-integration error."""
import json, sys, time
from multiprocessing import Pool
from lab import *
from torch_reference import FAST

def one(r):
    a, b = r["pair"].split("-"); A, B = FN[a], FN[b]; jd, g = r["jd"], r["a_g"]; acc = g_to_aud2(g)
    out = {}
    for tag, gs in (("better", better_guess(A, B, jd, acc)), ("naive", naive_guess(A, B, jd, acc))):
        o = solve_trip(A, B, jd, g, guess=gs, want_path=False, **FAST)
        if o["ok"]: break
    used = tag
    if not o["ok"]:                               # retry with strict defaults, then deflected starts
        for i, gs in enumerate([better_guess(A, B, jd, acc), naive_guess(A, B, jd, acc)] + rescue_guesses(A, B, jd, acc)):
            o = solve_trip(A, B, jd, g, guess=gs, want_path=False)
            if o["ok"]: used = f"strict/{i}"; break
    if not o["ok"]: return dict(pair=r["pair"], a_g=g, ok=False)
    er, ev = reintegrate(o, A, B, jd, g)
    return dict(pair=r["pair"], a_g=g, ok=True, used=used, dT=o["T"] / r["T"] - 1, er=er, ev=ev, iters=o["iters"])

if __name__ == "__main__":
    R = [r for r in json.load(open("grid_results.json"))["results"] if r["ok"]]
    t = time.perf_counter()
    with Pool(4) as p: res = p.map(one, R, chunksize=8)
    print("done", round(time.perf_counter() - t, 1), "s")
    ok = [r for r in res if r["ok"]]
    print("solved", len(ok), "of", len(res), "| first-try FAST better:", sum(r["used"] == "better" for r in ok), " naive:", sum(r["used"] == "naive" for r in ok), " strict retry:", sum(r["used"].startswith("strict") for r in ok))
    er = np.array([r["er"] for r in ok]); ev = np.array([r["ev"] for r in ok])
    print("DOP853 re-integration error: position km median %.2e p99 %.2e max %.2e | velocity m/s median %.2e p99 %.2e max %.2e" % (np.median(er), np.percentile(er, 99), er.max(), np.median(ev), np.percentile(ev, 99), ev.max()))
    print("cases over 100 km:", int((er > 100).sum()), " over 1 m/s:", int((ev > 1).sum()))
    dT = np.array([abs(r["dT"]) for r in ok]); print("|T_fast / T_strict - 1| max", dT.max(), " (different roots show up here)", int((dT > 1e-6).sum()))
