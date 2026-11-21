"""Items 1,2,3,7,9: the 9 pairs x 24 dates x 7 accelerations grid.  Writes grid_results.json"""
import json, sys, time
from multiprocessing import Pool
from lab import *

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "grid_results.json")


def one(args):
    a, b, jd, ang, a_g = args
    A, B = FN[a], FN[b]
    acc = g_to_aud2(a_g)
    rec = dict(pair=f"{a}-{b}", jd=jd, conj_ang=ang, a_g=a_g)
    # --- estimates (item 9)
    try:
        e0 = free_space_T(A, B, jd, acc)
        e2 = free_space_T(A, B, jd, acc, gravity="mid")
        rec.update(E0=e0["T0"], E1=e0["T"], E1ok=e0["ok"], E2=e2["T"], E2ok=e2["ok"])
    except Exception as ex:
        rec.update(E0=None, E1=None, E2=None, est_err=str(ex))
    # --- solves
    attempts = {}

    def run(name, guess):
        t = time.perf_counter()
        try:
            o = solve_trip(A, B, jd, a_g, guess=guess, want_path=True)
        except Exception as ex:
            o = dict(ok=False, msg=f"exception {type(ex).__name__}: {ex}", iters=0, nfev=0)
        o["wall_ms"] = (time.perf_counter() - t) * 1e3
        attempts[name] = o
        return o
    run("naive", naive_guess(A, B, jd, acc))
    try:
        bg = better_guess(A, B, jd, acc)
    except Exception:
        bg = naive_guess(A, B, jd, acc)
    run("better", bg)
    best = None
    for k in ("better", "naive"):
        if attempts[k]["ok"]:
            best = (k, attempts[k])
            break
    if best is None:
        for i, g in enumerate(rescue_guesses(A, B, jd, acc)):
            o = run(f"rescue{i}", g)
            if o["ok"]:
                best = (f"rescue{i}", o)
                break
    rec["naive_ok"] = attempts["naive"]["ok"]
    rec["naive_iters"] = attempts["naive"].get("iters")
    rec["naive_msg"] = attempts["naive"]["msg"]
    rec["better_ok"] = attempts["better"]["ok"]
    rec["better_iters"] = attempts["better"].get("iters")
    rec["better_nfev"] = attempts["better"].get("nfev")
    rec["better_msg"] = attempts["better"]["msg"]
    rec["rescued"] = best is not None and best[0].startswith("rescue")
    rec["n_rescue_tried"] = sum(1 for k in attempts if k.startswith("rescue"))
    if best is None:
        rec["ok"] = False
        # still log the best-effort closest approach of the 'better' attempt if it propagated
        rec["fail_nF"] = float(attempts["better"].get("nF", float("nan")))
        return rec
    name, o = best
    rec.update(ok=True, via=name, T=o["T"], t1=o["t1"], t2=o["t2"], dv=o["dv"], iters=o["iters"], nfev=o["nfev"],
               rmin_sun=o.get("rmin_sun"), t_rmin=o.get("t_rmin"), resid_r_km=o["resid_r"], resid_v_ms=o["resid_v"],
               wall_ms=o["wall_ms"], e1=list(map(float, o["e1"])), e2=list(map(float, o["e2"])))
    try:
        er, ev = reintegrate(o, A, B, jd, a_g)
        rec.update(dop_err_km=er, dop_err_ms=ev)
    except Exception as ex:
        rec.update(dop_err_km=None, dop_err_ms=None, dop_msg=str(ex))
    # --- gravity off, bodies moving (item 3)
    try:
        g0 = free_space_T(A, B, jd, acc)
        go = dict(e1=g0["g1"] / np.linalg.norm(g0["g1"]), e2=g0["g2"] / np.linalg.norm(g0["g2"]), t1=g0["t1"], t2=g0["t2"])
        oo = solve_trip(A, B, jd, a_g, mu=0.0, guess=go, want_path=False)
        if not oo["ok"]:
            oo = solve_trip(A, B, jd, a_g, mu=0.0, guess=naive_guess(A, B, jd, acc), want_path=False)
        rec.update(T_off=oo["T"] if oo["ok"] else None, dv_off=oo["dv"] if oo["ok"] else None)
    except Exception as ex:
        rec.update(T_off=None, dv_off=None)
    return rec


if __name__ == "__main__":
    nproc = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    cases = []
    dates = {}
    for a, b in PAIRS:
        dates[f"{a}-{b}"] = date_set(a, b)
        for jd, ang in dates[f"{a}-{b}"]:
            for g in ACCS:
                cases.append((a, b, jd, ang, g))
    print(len(cases), "cases", flush=True)
    t = time.perf_counter()
    with Pool(nproc) as p:
        res = p.map(one, cases, chunksize=4)
    print("done in", time.perf_counter() - t, "s", flush=True)
    json.dump(dict(dates=dates, results=res), open(OUT, "w"))
