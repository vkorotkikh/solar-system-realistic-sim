"""Item 1/5 baseline: the proposal as literally stated - scipy root/least_squares around numerical integration,
2 angles per direction + 2 durations, naive flip-and-burn start.  Two integrators: DOP853 (solve_ivp) and fixed-step
RK4 (N steps per arc).  Run on a subset of the grid and compare with torch_reference.solve_trip."""
import json, sys, time
from multiprocessing import Pool
import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import root, least_squares
from lab import *

ACC = None


def dirvec(th, ph):
    return np.array([math.cos(ph) * math.cos(th), math.cos(ph) * math.sin(th), math.sin(ph)])


def rk4_arc(y, e, acc, dur, n):
    h = dur / n
    for _ in range(n):
        def f(y):
            r = y[:3]
            return np.concatenate([y[3:], -MU * r / (r @ r) ** 1.5 + acc * e])
        k1 = f(y); k2 = f(y + 0.5 * h * k1); k3 = f(y + 0.5 * h * k2); k4 = f(y + h * k3)
        y = y + h / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
    return y


def dop_arc(y, e, acc, dur, rtol):
    def f(t, y):
        r = y[:3]
        return np.concatenate([y[3:], -MU * r / (r @ r) ** 1.5 + acc * e])
    return solve_ivp(f, (0, dur), y, method="DOP853", rtol=rtol, atol=1e-14).y[:, -1]


def make_res(A, B, jd, acc, integ, n, rtol, scale):
    rA, vA = A(jd)
    y0 = np.concatenate([rA, vA])

    def res(p):
        e1, e2 = dirvec(p[0], p[1]), dirvec(p[2], p[3])
        t1, t2 = p[4], p[5]
        if integ == "rk4":
            y = rk4_arc(rk4_arc(y0, e1, acc, t1, n), e2, acc, t2, n)
        else:
            y = dop_arc(dop_arc(y0, e1, acc, t1, rtol), e2, acc, t2, rtol)
        rB, vB = B(jd + t1 + t2)
        return (y - np.concatenate([rB, vB])) / scale
    return res


def solve_baseline(A, B, jd, a_g, method="hybr", integ="dop", n=40, rtol=1e-10):
    acc = g_to_aud2(a_g)
    g = naive_guess(A, B, jd, acc)
    th = [math.atan2(g["e1"][1], g["e1"][0]), math.asin(g["e1"][2]), math.atan2(g["e2"][1], g["e2"][0]), math.asin(g["e2"][2])]
    p0 = np.array(th + [g["t1"], g["t2"]])
    Tg = g["t1"] + g["t2"]
    d0 = np.linalg.norm(B(jd + Tg)[0] - A(jd)[0])
    scale = np.array([d0] * 3 + [acc * Tg] * 3)
    res = make_res(A, B, jd, acc, integ, n, rtol, scale)
    cnt = [0]

    def res_c(p):
        cnt[0] += 1
        return res(p)
    t = time.perf_counter()
    try:
        if method in ("hybr", "lm"):
            s = root(res_c, p0, method=method, tol=1e-12)
            p, ok = s.x, bool(s.success)
        else:
            s = least_squares(res_c, p0, method=method, xtol=1e-14, ftol=1e-14, gtol=1e-14, x_scale=np.array([1, 1, 1, 1, Tg, Tg]))
            p, ok = s.x, bool(s.success)
    except Exception as ex:
        return dict(ok=False, ms=(time.perf_counter() - t) * 1e3, nfev=cnt[0], T=None, msg=str(ex))
    ms = (time.perf_counter() - t) * 1e3
    F = np.abs(res(p)).max()
    good = ok and F < 1e-8 and p[4] > 0 and p[5] > 0
    return dict(ok=bool(good), ms=ms, nfev=cnt[0], T=float(p[4] + p[5]), nF=float(F), p=list(map(float, p)))


def one(args):
    a, b, jd, g, cfg = args
    A, B = FN[a], FN[b]
    o = solve_baseline(A, B, jd, g, **cfg)
    o.update(pair=f"{a}-{b}", jd=jd, a_g=g, cfg=cfg["method"] + "/" + cfg["integ"] + (f"/{cfg['n']}" if cfg["integ"] == "rk4" else ""))
    return o


if __name__ == "__main__":
    # subset: 9 pairs x 4 dates (2 even, 2 conjunction) x 7 accelerations
    D = json.load(open("grid_results.json"))["dates"]
    cases = []
    cfgs = [dict(method="hybr", integ="dop"), dict(method="lm", integ="dop"), dict(method="hybr", integ="rk4", n=40), dict(method="lm", integ="rk4", n=40)]
    for a, b in PAIRS:
        ds = D[f"{a}-{b}"]
        pick = [ds[2], ds[11], ds[-5], ds[-2]]
        for jd, _ in pick:
            for g in ACCS:
                for c in cfgs:
                    cases.append((a, b, jd, g, c))
    print(len(cases), flush=True)
    with Pool(int(sys.argv[1]) if len(sys.argv) > 1 else 6) as p:
        res = p.map(one, cases, chunksize=2)
    json.dump(res, open("baseline_results.json", "w"))
    import collections
    for cfg in sorted(set(r["cfg"] for r in res)):
        rr = [r for r in res if r["cfg"] == cfg]
        print(cfg, "ok", sum(r["ok"] for r in rr), "/", len(rr), "median ms", np.median([r["ms"] for r in rr]).round(1), "median nfev", np.median([r["nfev"] for r in rr]))
        for g in ACCS:
            x = [r for r in rr if r["a_g"] == g]
            print("   ", g, sum(r["ok"] for r in x), "/", len(x), "median ms", np.median([r["ms"] for r in x]).round(1))
