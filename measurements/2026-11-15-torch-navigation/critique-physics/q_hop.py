"""Planar min-time transfer between two circular orbits about ONE planet at constant thrust magnitude a (phase free).
Direct shooting: K equal-duration segments with a constant thrust angle each; SLSQP.  Nondimensional: mu=1, r2=1."""
import sys, math, time, json
import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import minimize
from multiprocessing import Pool
G0 = 9.80665e-3  # km/s^2

def rhs(t, y, a, al):
    r = math.hypot(y[0], y[1]); r3 = r ** 3
    return [y[2], y[3], -y[0] / r3 + a * math.cos(al), -y[1] / r3 + a * math.sin(al)]

def shoot(x, r1, a, K):
    T = x[0]; al = x[1:]; y = np.array([r1, 0.0, 0.0, 1 / math.sqrt(r1)])
    h = T / K
    for k in range(K):
        s = solve_ivp(rhs, (0, h), y, args=(a, al[k]), method="DOP853", rtol=1e-10, atol=1e-12)
        y = s.y[:, -1]
    return y

def cons(x, r1, a, K):
    y = shoot(x, r1, a, K)
    r = math.hypot(y[0], y[1])
    return np.array([r - 1.0, (y[0] * y[2] + y[1] * y[3]) / r, (y[2] ** 2 + y[3] ** 2) - 1.0])

def guess(r1, a, K, Tg, f, retro_first=False):
    """prograde-tangential thrust for fraction f of Tg then retrograde; returns angles per segment"""
    y = np.array([r1, 0.0, 0.0, 1 / math.sqrt(r1)]); h = Tg / K; al = []
    for k in range(K):
        v = math.atan2(y[3], y[2]); ak = v if (k / K) < f else v + math.pi
        al.append(ak)
        s = solve_ivp(rhs, (0, h), y, args=(a, ak), method="DOP853", rtol=1e-9, atol=1e-11); y = s.y[:, -1]
        if math.hypot(y[0], y[1]) > 5: break
    while len(al) < K: al.append(al[-1])
    return np.array(al)

def solve_one(args):
    r1, a, K, Tg, f = args
    x0 = np.concatenate([[Tg], guess(r1, a, K, Tg, f)])
    try:
        res = minimize(lambda x: x[0], x0, jac=lambda x: np.eye(len(x))[0], method="SLSQP",
                       constraints=[{"type": "eq", "fun": cons, "args": (r1, a, K)}],
                       options=dict(maxiter=300, ftol=1e-10))
        c = cons(res.x, r1, a, K)
        return dict(T=float(res.x[0]), cons=float(np.abs(c).max()), ok=bool(res.success), Tg=Tg, f=f, al=res.x[1:].tolist())
    except Exception as ex:
        return dict(T=None, cons=None, ok=False, Tg=Tg, f=f, msg=str(ex)[:40])

def run(name, mu, R1, R2, a_g, K=14):
    unit_r = R2; unit_t = math.sqrt(R2 ** 3 / mu); unit_v = unit_r / unit_t
    a = a_g * G0 * unit_t ** 2 / unit_r
    r1 = R1 / R2
    d = R2 - R1; T_hand = 2 * math.sqrt(d / (a_g * G0)); dv_hand = 2 * math.sqrt(d * a_g * G0)
    v1 = math.sqrt(mu / R1); v2 = math.sqrt(mu / R2); bound = (v1 + v2) / dv_hand
    tasks = [(r1, a, K, T_hand * m / unit_t, f) for m in (1.0, 2.0, 4.0) for f in (0.35, 0.5, 0.65)]
    with Pool(9) as p: out = p.map(solve_one, tasks)
    good = [o for o in out if o["T"] and o["cons"] is not None and o["cons"] < 1e-5]
    if good:
        best = min(good, key=lambda o: o["T"]); Topt = best["T"] * unit_t
        print(f"{name} a={a_g} g (a/g_local(start)={a_g*G0/(mu/R1**2):.3f}): hop formula T={T_hand:,.0f} s dv={dv_hand:.1f} km/s bound={bound:.3f} | "
              f"direct-shooting best T={Topt:,.0f} s dv=aT={a_g*G0*Topt:.1f} km/s | formula/true T={T_hand/Topt:.3f}  ({len(good)}/{len(out)} feasible; Ts={sorted(round(o['T']*unit_t) for o in good)})", flush=True)
    else:
        print(name, a_g, "no feasible solution", [(o['T'], o['cons']) for o in out], flush=True)

if __name__ == "__main__":
    MU_J = 1.8982e27 * 6.6743e-11 / 1e9
    for g in (3.0, 1.0):
        run("Jupiter 1.1R -> Io", MU_J, 76902.1, 421800.0, g)
    MU_E = 398600.4418
    run("LEO6571 -> Moon distance (Earth-only gravity, sanity)", MU_E, 6571.0, 384400.0, 1.0)
