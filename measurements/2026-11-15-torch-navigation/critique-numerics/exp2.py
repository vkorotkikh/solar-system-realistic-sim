"""Task 2: seven-unknown detour on every blocked day: earth-mars (course-geometry's list), earth-jupiter, earth-mercury."""
import sys
from multiprocessing import Pool
from det import *
JD_2026 = 2461041.5

def run(args):
    a, b, g, day, R = args
    jd = JD_2026 + day
    A, B = FN[a], FN[b]
    out = dict(pair=f"{a}-{b}", g=g, day=day)
    t = time.perf_counter()
    try:
        base = solve_trip(A, B, jd, g, want_path=True, jacobian="fd", **FAST)
    except Exception as ex:
        base = dict(ok=False, msg="exc " + type(ex).__name__)
    out["base_ms"] = (time.perf_counter() - t) * 1e3
    out["base_ok"] = bool(base["ok"]); out["base_msg"] = base["msg"]
    if not base["ok"]:
        return out
    out["base_T"] = base["T"]; out["base_rmin"] = base["rmin_sun"]
    if base["rmin_sun"] >= R:
        out["blocked"] = False
        return out
    out["blocked"] = True
    ref = away_ref(base)
    try:
        o = solve_detour(A, B, jd, g, R, base, ref, phi0=0.2)
    except Exception as ex:
        out.update(ok=False, msg="exc " + type(ex).__name__ + str(ex)[:60]); return out
    out.update(ok=bool(o["ok"]), msg=o["msg"], it=o["iters"], nfev=o["nfev"], ms=o.get("ms"))
    if o["ok"]:
        out.update(T=o["T"], dT_h=(o["T"] - base["T"]) * 24, phi_deg=math.degrees(o["phi"]), rmin=o["rmin"])
        try:
            out["dop"] = detour_dop(o, A, B, jd, g)
        except Exception as ex:
            out["dop"] = None
    else:
        out["nF"] = o.get("nF")
    return out

if __name__ == "__main__":
    rows = json.load(open(NAV + "/course-geometry/exp2_days.json"))
    tasks = []
    for r in rows:
        tasks.append(("earth", "mars", r["a_g"], r["day"], 0.1))     # all sampled days incl. margins
    with Pool(8) as p: res = p.map(run, tasks, chunksize=4)
    json.dump(res, open("exp2_em.json", "w"))
    print("earth-mars done", len(res))
