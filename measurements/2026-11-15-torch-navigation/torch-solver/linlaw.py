"""Item 4: constant-direction two-burn vs linear steering u(t) = (p + (t/T) q)/|p + (t/T) q|, same end conditions.
Free-space (mu=0) the linear law is exactly the time-optimal control (primer vector is linear in t); with the Sun's
gravity it is the near-optimal reference the proposal asks for (the true primer obeys lam'' = -G(r) lam)."""
import json, sys, time
from multiprocessing import Pool
from scipy.integrate import solve_ivp
from scipy.optimize import least_squares
from lab import *


def dirvec(th, ph):
    return np.array([math.cos(ph) * math.cos(th), math.cos(ph) * math.sin(th), math.sin(ph)])


def lin_solve(A, B, jd, a_g, mu, e1, e2, T2b, qscale=1.0, rtol=1e-12):
    acc = g_to_aud2(a_g)
    rA, vA = A(jd)
    y0 = np.concatenate([rA, vA])
    T0 = T2b
    Lr = max(np.linalg.norm(B(jd + T0)[0] - rA), 1e-3)
    Lv = acc * T0
    scale = np.array([Lr] * 3 + [Lv] * 3)

    def traj(x):
        p = dirvec(x[0], x[1])
        q = x[2:5]
        T = x[5] * T0

        def f(tau, y):
            w = p + tau * q
            u = w / np.linalg.norm(w)
            r = y[:3]
            return T * np.concatenate([y[3:], -mu * r / (r @ r) ** 1.5 + acc * u])
        return solve_ivp(f, (0, 1), y0, method="DOP853", rtol=rtol, atol=1e-15), T

    def res(x):
        s, T = traj(x)
        rB, vB = B(jd + T)
        return (s.y[:, -1] - np.concatenate([rB, vB])) / scale
    q0 = qscale * (e2 - e1)
    x0 = np.array([math.atan2(e1[1], e1[0]), math.asin(np.clip(e1[2], -1, 1)), *q0, 1.0])
    try:
        s = least_squares(res, x0, method="lm", xtol=1e-13, ftol=1e-13, gtol=1e-13, diff_step=1e-7, max_nfev=200)
    except Exception as ex:
        return dict(ok=False, msg=str(ex))
    F = np.abs(res(s.x)).max()
    x = s.x
    p = dirvec(x[0], x[1])
    q = x[2:5]
    wmin = min(np.linalg.norm(p + t * q) for t in np.linspace(0, 1, 2001))
    return dict(ok=bool(F < 1e-8 and x[5] > 0), T=float(x[5] * T0), nF=float(F), nfev=int(s.nfev), wmin=float(wmin), qnorm=float(np.linalg.norm(q)))


def one(args):
    a, b, jd, g = args
    A, B = FN[a], FN[b]
    acc = g_to_aud2(g)
    rec = dict(pair=f"{a}-{b}", jd=jd, a_g=g)
    for mu, tag in ((MU, "grav"), (0.0, "free")):
        o = solve_trip(A, B, jd, g, mu=mu, want_path=False,
                       guess=(None if mu else None))
        if not o["ok"] and mu == 0.0:
            fs = free_space_T(A, B, jd, acc)
            o = solve_trip(A, B, jd, g, mu=0.0, want_path=False, guess=naive_guess(A, B, jd, acc))
        if not o["ok"]:
            rec[tag] = dict(ok=False)
            continue
        best = None
        tries = []
        for qs in (1.0, 2.0, 0.5):
            l = lin_solve(A, B, jd, g, mu, o["e1"], o["e2"], o["T"], qscale=qs)
            tries.append(l)
            if l["ok"] and (best is None or l["T"] < best["T"]):
                best = l
        rec[tag] = dict(ok=best is not None, T2=o["T"], Tlin=best["T"] if best else None, wmin=best["wmin"] if best else None,
                        n_ok=sum(t["ok"] for t in tries), Ts=[t.get("T") for t in tries], rmin=o.get("rmin_sun"))
    return rec


if __name__ == "__main__":
    D = json.load(open("grid_results.json"))["dates"]
    pairs = [("earth", "mars"), ("earth", "venus"), ("earth", "jupiter"), ("mars", "ceres"), ("earth", "neptune"), ("jupiter", "saturn"), ("earth", "mercury")]
    cases = []
    for a, b in pairs:
        ds = D[f"{a}-{b}"]
        for k in (1, 5, 9, 13):          # even dates only (no Sun-grazing)
            for g in ACCS:
                cases.append((a, b, ds[k][0], g))
    print(len(cases), flush=True)
    if len(sys.argv) > 2 and sys.argv[2] == "test":
        cases = cases[:14]
    t = time.perf_counter()
    with Pool(int(sys.argv[1]) if len(sys.argv) > 1 else 6) as p:
        res = p.map(one, cases, chunksize=1)
    print("done", time.perf_counter() - t, flush=True)
    json.dump(res, open("linlaw_results.json", "w"))
    for r in res[:14]:
        print(r["pair"], r["a_g"], {k: (round(v, 6) if isinstance(v, float) else v) for k, v in r["grav"].items() if k != "Ts"}, "| free", {k: (round(v, 6) if isinstance(v, float) else v) for k, v in r["free"].items() if k != "Ts"})
