"""Task 5 (if time allows): Earth (LEO 200 km) -> Mars (400 km orbit) at constant thrust a, planar.

Model: Sun at the origin, Earth and Mars on prescribed circular coplanar orbits (a = catalogue semi-major axes),
ship attracted by Sun, Earth and Mars. Integrated in the translating Earth-centred frame (so LEO motion keeps
full precision); Earth's own acceleration is the prescribed circle.
mode "full": start on circular LEO, end on circular 400 km Mars orbit (either direction).
mode "sun" : start AT Earth (position and velocity of Earth), end AT Mars with Mars's velocity, Sun gravity only
             -> the Sun-centred 'rest relative to A to rest relative to B' trip of the patching model.
Control as in t5_earth_moon.py (two segments, piecewise-linear inertial thrust angle, free flip fraction, free launch phase).
"""
import sys, math, json, time, warnings
sys.path.insert(0, "<session-dir>/nav-lab/torch-ends")
warnings.filterwarnings("ignore")
import numpy as np
from multiprocessing import Pool
from scipy.integrate import solve_ivp
from scipy.optimize import minimize, NonlinearConstraint, Bounds, BFGS
from ends_reference import escape_cost, G0_KM_S2

AU = 149_597_870.7
MU_S = 1.32712440018e11
MU_E, MU_MA = 5.97237e24 * 6.6743e-20, 6.4171e23 * 6.6743e-20
R0, RT = 6371.0 + 200.0, 3389.5 + 400.0
RE, RM = 1.00000261 * AU, 1.52371034 * AU
NE, NM = math.sqrt((MU_S + MU_E) / RE ** 3), math.sqrt((MU_S + MU_MA) / RM ** 3)
VCT = math.sqrt(MU_MA / RT)
ATOL = [1e-5, 1e-5, 1e-9, 1e-9]
PSI_S = 1e3     # z[2] holds Mars's launch phase in units of 1 mrad (variable scaling for the optimiser)


def Tn(a):
    return 2.0 * math.sqrt((RM - RE) / a)


def knots(T, p, K):
    u = np.arange(K + 1) / K
    return p * T * u ** 2, p * T + (1 - p) * T * (1 - (1 - u) ** 2)


def simulate(z, a, K, mode, rtol=1e-11, dense=False):
    T, phi0, psi, p = z[0] * Tn(a), z[1], z[2] / PSI_S, z[3]
    k1, k2 = knots(T, p, K)
    a1, a2 = np.asarray(z[4:5 + K]), np.asarray(z[5 + K:6 + 2 * K])
    full = mode == "full"
    if full:
        v0 = math.sqrt(MU_E / R0)
        y0 = [R0 * math.cos(phi0), R0 * math.sin(phi0), -v0 * math.sin(phi0), v0 * math.cos(phi0)]
    else:
        y0 = [0.0, 0.0, 0.0, 0.0]

    def make(kn, an):
        def rhs(t, y):
            x, yy, vx, vy = y
            te, tm = NE * t, psi + NM * t
            ex, ey = RE * math.cos(te), RE * math.sin(te)
            mx, my = RM * math.cos(tm), RM * math.sin(tm)
            X, Y = ex + x, ey + yy
            r3 = math.hypot(X, Y) ** 3
            re3 = RE ** 3
            al = np.interp(t, kn, an)
            ax = -MU_S * X / r3 + MU_S * ex / re3 + a * math.cos(al)
            ay = -MU_S * Y / r3 + MU_S * ey / re3 + a * math.sin(al)
            if full:
                s3 = math.hypot(x, yy) ** 3
                dx, dy = X - mx, Y - my
                q3 = math.hypot(dx, dy) ** 3
                ax += -MU_E * x / s3 - MU_MA * dx / q3
                ay += -MU_E * yy / s3 - MU_MA * dy / q3
            return [vx, vy, ax, ay]
        return rhs

    s1 = solve_ivp(make(k1, a1), (0, k1[-1]), y0, method="DOP853", rtol=rtol, atol=ATOL, dense_output=dense)
    s2 = solve_ivp(make(k2, a2), (k1[-1], T), s1.y[:, -1], method="DOP853", rtol=rtol, atol=ATOL, dense_output=dense)
    x, y, vx, vy = s2.y[:, -1]
    te, tm = NE * T, psi + NM * T
    rrel = np.array([RE * math.cos(te) + x - RM * math.cos(tm), RE * math.sin(te) + y - RM * math.sin(tm)])
    vrel = np.array([-RE * NE * math.sin(te) + vx + RM * NM * math.sin(tm), RE * NE * math.cos(te) + vy - RM * NM * math.cos(tm)])
    if dense:
        return rrel, vrel, (s1, s2, k1, k2)
    return rrel, vrel


def cons(z, a, K, mode):
    rrel, vrel = simulate(z, a, K, mode)
    if mode == "full":
        return np.array([(np.hypot(*rrel) - RT) / RT, (rrel @ vrel) / (RT * VCT), (vrel @ vrel - VCT ** 2) / VCT ** 2])
    return np.array([rrel[0] / 1e4, rrel[1] / 1e4, vrel[0] / 1e-2, vrel[1] / 1e-2])   # 10 000 km, 0.01 km/s


def _job(args):
    return cons(*args)


class Problem:
    def __init__(self, a, K, mode, pool):
        self.a, self.K, self.mode, self.pool, self.cache = a, K, mode, pool, (None, None)

    def c(self, z):
        if self.cache[0] is None or not np.array_equal(self.cache[0], z):
            self.cache = (z.copy(), cons(z, self.a, self.K, self.mode))
        return self.cache[1]

    def jac(self, z):
        h = 1e-6
        zs = [z + h * np.eye(len(z))[i] for i in range(len(z))]
        cs = self.pool.map(_job, [(zz, self.a, self.K, self.mode) for zz in zs])
        return ((np.array(cs) - self.c(z)) / h).T


def guess(a_g, K, mode, beta=0.1):
    a = a_g * G0_KM_S2
    T = Tn(a)
    z = np.zeros(6 + 2 * K)
    z[0] = 1.0
    # Mars at angle beta at arrival; ship leaves Earth (angle 0) toward that point
    tx, ty = RM * math.cos(beta) - RE, RM * math.sin(beta)
    al = math.atan2(ty, tx)
    z[1] = al - math.pi / 2          # LEO departure phase: tangent along the aim direction
    z[2] = (beta - NM * T) * PSI_S   # Mars phase at t = 0
    z[3] = 0.5
    z[4:5 + K] = al
    z[5 + K:] = al + math.pi
    return z


def solve(a_g, z0, K, mode, pool, maxiter=800):
    a = a_g * G0_KM_S2
    prob = Problem(a, K, mode, pool)
    n = len(z0)
    lo = np.array([0.2, -np.inf, -np.inf, 0.15] + [-np.inf] * (n - 4))
    hi = np.array([5.0, np.inf, np.inf, 0.85] + [np.inf] * (n - 4))
    t0 = time.time()
    best = (np.inf, None)
    for attempt in range(4):          # restart trust-constr (fresh trust radius and BFGS); keep the least-infeasible point
        res = minimize(lambda z: z[0], z0, jac=lambda z: np.eye(n)[0], method="trust-constr", bounds=Bounds(lo, hi),
                       constraints=[NonlinearConstraint(prob.c, 0, 0, jac=prob.jac)], hess=BFGS(),
                       options={"maxiter": maxiter, "xtol": 1e-12, "gtol": 1e-9, "barrier_tol": 1e-9})
        viol = np.abs(prob.c(res.x)).max()
        print("   attempt %d: max|c|=%.2e T=%.1f" % (attempt + 1, viol, res.x[0] * Tn(a)), flush=True)
        if viol < best[0]:
            best = (viol, res.x.copy())
        z0 = best[1]
        if viol < 2e-6:
            break
    res.x = best[1]
    z = res.x
    if np.abs(prob.c(z)).max() > 2e-6:     # polish with SLSQP from the near-feasible point
        r2 = minimize(lambda z: z[0], z, jac=lambda z: np.eye(n)[0], method="SLSQP",
                      bounds=list(zip(lo, hi)), constraints=[{"type": "eq", "fun": prob.c, "jac": prob.jac}],
                      options={"maxiter": 150, "ftol": 1e-12})
        if np.abs(prob.c(r2.x)).max() < np.abs(prob.c(z)).max():
            z = r2.x
    c = prob.c(z)
    T = z[0] * Tn(a)
    print("%s a=%g g K=%d: %s | T=%.2f s dv=%.4f km/s | max|c|=%.2e | %d it | %.0f s" % (
        mode, a_g, K, res.message, T, a * T, np.abs(c).max(), res.nit, time.time() - t0), flush=True)
    return z, dict(mode=mode, a_g=a_g, K=K, T=T, dv=a * T, maxc=float(np.abs(c).max()), nit=int(res.nit),
                   status=int(res.status), p=float(z[3]), phi0=float(z[1]), psi=float(z[2] / PSI_S), scaled=True, z=z.tolist())


if __name__ == "__main__":
    mode, K = sys.argv[1], int(sys.argv[2])
    ladder = [float(v) for v in sys.argv[3].split(",")]
    tag = sys.argv[4]
    results = []
    with Pool(int(sys.argv[5]) if len(sys.argv) > 5 else 12) as pool:
        if len(sys.argv) > 6:      # warm start from a previous run's last solution
            allprev = json.load(open(sys.argv[6]))
            prev = [r for r in allprev if r["a_g"] == float(sys.argv[7])][0] if len(sys.argv) > 7 else allprev[-1]
            z = np.array(prev["z"])
            if not prev.get("scaled"):
                z[2] *= PSI_S
            if prev["mode"] == "sun":
                z[1] = z[4] - math.pi / 2
        else:                      # pick the starting Mars phase by scanning beta with the straight-line guess
            best = None
            for beta in np.linspace(-0.3, 0.8, 23):
                c = cons(guess(ladder[0], K, mode, beta), ladder[0] * G0_KM_S2, K, mode)
                if best is None or np.abs(c).max() < best[0]:
                    best = (np.abs(c).max(), beta)
            print("start beta=%.3f, max|c|=%.3g" % (best[1], best[0]), flush=True)
            z = guess(ladder[0], K, mode, best[1])
        Tprev = prev["T"] if len(sys.argv) > 6 else None
        for g in ladder:
            if Tprev is not None:      # keep Mars's arrival angle: psi + NM*T
                z[2] += NM * (Tprev - z[0] * Tn(g * G0_KM_S2)) * PSI_S
            z, info = solve(g, z, K, mode, pool)
            results.append(info)
            Tprev = info["T"]
            json.dump(results, open(sys.path[0] + "/t6_earth_mars_%s.json" % tag, "w"))
