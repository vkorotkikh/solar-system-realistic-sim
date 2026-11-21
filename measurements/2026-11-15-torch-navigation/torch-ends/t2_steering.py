"""Task 2: is thrust along the velocity the cheapest steering for escape from a circular orbit?
Cost at fixed thrust a is a*t, so the cheapest steering is the one that reaches E = 0 soonest."""
import sys, math, json
sys.path.insert(0, "<session-dir>/nav-lab/torch-ends")
import numpy as np
from multiprocessing import Pool
from scipy.optimize import minimize, minimize_scalar
from ends_reference import _escape_nd

def work(x):
    tv, _ = _escape_nd(x)
    tmax = 30 * tv
    out = {"x": x, "t_velocity": tv, "dv_velocity": x * tv}
    tt, _ = _escape_nd(x, steer="transverse", tmax=tmax)
    out["t_transverse"] = tt
    # fixed inertial direction: coarse scan over beta, then refine
    betas = np.radians(np.arange(-180, 180, 10.0))
    ts = []
    for b in betas:
        t, _ = _escape_nd(x, steer="inertial", beta=b, tmax=tmax)
        ts.append(np.inf if t is None else t)
    i = int(np.argmin(ts))
    out["t_inertial_beta0"] = ts[list(np.degrees(betas)).index(0.0)]
    if np.isfinite(ts[i]):
        def f(b):
            t, _ = _escape_nd(x, steer="inertial", beta=b, tmax=tmax)
            return tmax if t is None else t
        r = minimize_scalar(f, bounds=(betas[i] - math.radians(10), betas[i] + math.radians(10)),
                            method="bounded", options={"xatol": 1e-4})
        out["t_inertial_best"], out["beta_best_deg"] = float(r.fun), math.degrees(r.x)
        out["inertial_scan_escaped"] = int(np.isfinite(ts).sum())
    else:
        out["t_inertial_best"] = None
    # numerically optimised steering: offset delta from velocity, piecewise-linear in t / t_velocity
    nodes = np.linspace(0.0, 1.4, 8)
    def g(d):
        t, _ = _escape_nd(x, steer="table", table=(nodes, d), t_ref=tv, tmax=2 * tv)
        return 2 * tv if t is None else t
    best_d, best_t = np.zeros(8), g(np.zeros(8))
    rng = np.random.default_rng(1)
    for rep in range(4):
        start = best_d + (0.0 if rep == 0 else rng.normal(0, 0.05, 8))
        r = minimize(g, start, method="Nelder-Mead", options={"maxiter": 900, "xatol": 1e-6, "fatol": 1e-12,
                                                              "initial_simplex": None if rep == 0 else None})
        if r.fun < best_t:
            best_t, best_d = float(r.fun), r.x
    out["t_optimised"], out["delta_nodes_deg"] = best_t, [round(math.degrees(v), 3) for v in best_d]
    return out

if __name__ == "__main__":
    xs = [0.01, 0.03, 0.1, 0.3, 1.0, 3.0, 10.0, 100.0]
    with Pool(8) as p:
        res = p.map(work, xs, chunksize=1)
    json.dump(res, open(sys.path[0] + "/t2_steering.json", "w"), indent=1)
    print("steering comparison, circular orbit; time in sqrt(r^3/mu); differences are t_alt / t_velocity - 1")
    for r in res:
        tv = r["t_velocity"]
        f = lambda k: "none" if r.get(k) is None else "%+.3f%%" % (100 * (r[k] / tv - 1))
        print("a/g0=%-6g dv_vel/vc=%.5f  transverse %s  inertial(beta=0) %s  inertial(best, beta=%s) %s  optimised %s  (%s)" % (
            r["x"], r["dv_velocity"], f("t_transverse"), f("t_inertial_beta0"),
            "%.1f" % r["beta_best_deg"] if r.get("t_inertial_best") else "-", f("t_inertial_best"), f("t_optimised"),
            "escapes in scan: %s/36" % r.get("inertial_scan_escaped")))
        print("   optimised delta nodes (deg, +ve = velocity rotated ccw = inward):", r["delta_nodes_deg"])
