"""Task 5: LEO (200 km) -> low lunar orbit (100 km) under continuous constant-magnitude thrust.

Earth-centred frame (Earth is the origin; the Moon's pull on Earth is included as the indirect term so a
Moon on a circular orbit of radius D with n^2 = (muE + muM) / D^3 is an exact solution), coplanar, Moon circular.
Control: thrust direction alpha(t), piecewise linear in t on two segments (burn, then flip, then brake),
K+1 nodes per segment, nodes packed toward the start of segment 1 and the end of segment 2.
Free: T, launch phase phi0 (angle of the ship on its circular LEO at t = 0, Moon at angle 0), flip fraction p, node angles.
Objective: minimise T (delta-v = a T because the engine is on the whole time).
Terminal: circular orbit about the Moon at r_t, either direction (|rrel| = r_t, rrel.vrel = 0, |vrel|^2 = muM / r_t).
Gradients: forward finite differences evaluated in parallel.
"""
import sys, math, json, time
sys.path.insert(0, "<session-dir>/nav-lab/torch-ends")
import numpy as np
from multiprocessing import Pool
from scipy.integrate import solve_ivp
from scipy.optimize import minimize, NonlinearConstraint, Bounds, BFGS
import warnings
warnings.filterwarnings('ignore')
from ends_reference import escape_cost, G0_KM_S2

MU_E, MU_M = 398613.89091, 4902.8
R_E, R_M = 6371.0, 1737.4
R0, RT = R_E + 200.0, R_M + 100.0
D = 384400.0
N_MOON = math.sqrt((MU_E + MU_M) / D ** 3)
VC_T = math.sqrt(MU_M / RT)
ATOL = [1e-6, 1e-6, 1e-9, 1e-9]


def knots(T, p, K):
    u = np.arange(K + 1) / K
    return p * T * u ** 2, p * T + (1 - p) * T * (1 - (1 - u) ** 2)


def simulate(z, a, K, dense=False, rtol=1e-10):
    """z = [T/Tn, phi0, p, alpha1(K+1), alpha2(K+1)]; a in km/s^2. Returns terminal rrel, vrel (and trajectory)."""
    T, phi0, p = z[0] * Tn(a), z[1], z[2]
    k1, k2 = knots(T, p, K)
    a1, a2 = np.asarray(z[3:4 + K]), np.asarray(z[4 + K:5 + 2 * K])
    v0 = math.sqrt(MU_E / R0)
    y0 = [R0 * math.cos(phi0), R0 * math.sin(phi0), -v0 * math.sin(phi0), v0 * math.cos(phi0)]

    def make(kn, an):
        def rhs(t, y):
            x, yy, vx, vy = y
            th = N_MOON * t
            mx, my = D * math.cos(th), D * math.sin(th)
            r3 = math.hypot(x, yy) ** 3
            dx, dy = x - mx, yy - my
            q3 = math.hypot(dx, dy) ** 3
            al = np.interp(t, kn, an)
            ca, sa = math.cos(al), math.sin(al)
            return [vx, vy,
                    -MU_E * x / r3 - MU_M * (dx / q3 + mx / D ** 3) + a * ca,
                    -MU_E * yy / r3 - MU_M * (dy / q3 + my / D ** 3) + a * sa]
        return rhs

    s1 = solve_ivp(make(k1, a1), (0, k1[-1]), y0, method="DOP853", rtol=rtol, atol=ATOL, dense_output=dense)
    s2 = solve_ivp(make(k2, a2), (k1[-1], T), s1.y[:, -1], method="DOP853", rtol=rtol, atol=ATOL, dense_output=dense)
    x, y, vx, vy = s2.y[:, -1]
    th = N_MOON * T
    rrel = np.array([x - D * math.cos(th), y - D * math.sin(th)])
    vrel = np.array([vx + D * N_MOON * math.sin(th), vy - D * N_MOON * math.cos(th)])
    if dense:
        return rrel, vrel, (s1, s2, k1, k2)
    return rrel, vrel


def Tn(a):
    return 2.0 * math.sqrt(D / a)       # straight-line time scale, s


def cons(z, a, K):
    rrel, vrel = simulate(z, a, K)
    return np.array([(np.hypot(*rrel) - RT) / RT, (rrel @ vrel) / (RT * VC_T), (vrel @ vrel - VC_T ** 2) / VC_T ** 2])


def _job(args):
    return cons(*args)


class Problem:
    def __init__(self, a, K, pool):
        self.a, self.K, self.pool, self.cache = a, K, pool, (None, None)

    def c(self, z):
        if self.cache[0] is None or not np.array_equal(self.cache[0], z):
            self.cache = (z.copy(), cons(z, self.a, self.K))
        return self.cache[1]

    def jac(self, z):
        h = 1e-6
        zs = [z + h * np.eye(len(z))[i] for i in range(len(z))]
        cs = self.pool.map(_job, [(zz, self.a, self.K) for zz in zs])
        return ((np.array(cs) - self.c(z)) / h).T


def solve(a_g, z0, K, pool, maxiter=700, verbose=True):
    a = a_g * G0_KM_S2
    prob = Problem(a, K, pool)
    n = len(z0)
    lo = np.array([0.2, -np.inf, 0.15] + [-np.inf] * (n - 3))
    hi = np.array([3.0, np.inf, 0.85] + [np.inf] * (n - 3))
    t0 = time.time()
    res = minimize(lambda z: z[0], z0, jac=lambda z: np.eye(n)[0], method="trust-constr", bounds=Bounds(lo, hi),
                   constraints=[NonlinearConstraint(prob.c, 0, 0, jac=prob.jac)], hess=BFGS(),
                   options={"maxiter": maxiter, "xtol": 1e-12, "gtol": 1e-9, "barrier_tol": 1e-9})
    z = res.x
    c = prob.c(z)
    T = z[0] * Tn(a)
    if verbose:
        print("a=%g g K=%d: %s | T=%.2f s dv=%.4f km/s | max|c|=%.2e | %d it | %.0f s" % (
            a_g, K, res.message, T, a * T, np.abs(c).max(), res.nit, time.time() - t0), flush=True)
    return z, dict(a_g=a_g, K=K, T=T, dv=a * T, maxc=float(np.abs(c).max()), nit=int(res.nit),
                   status=int(res.status), message=str(res.message), p=float(z[2]), phi0=float(z[1]))


def guess(a_g, K):
    a = a_g * G0_KM_S2
    T = Tn(a)
    th = N_MOON * T
    z = np.zeros(5 + 2 * K)
    z[0], z[1], z[2] = 1.0, th - math.pi / 2, 0.5
    z[3:4 + K] = th
    z[4 + K:] = th + math.pi
    return z


if __name__ == "__main__":
    K = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    ladder = [float(v) for v in (sys.argv[2].split(",") if len(sys.argv) > 2 else "10,5,3,2,1.4,1,0.7,0.5,0.3,0.2,0.14,0.1".split(","))]
    tag = sys.argv[3] if len(sys.argv) > 3 else "K%d" % K
    results = []
    with Pool(12) as pool:
        z = guess(ladder[0], K)
        for g in ladder:
            if results:   # rigidly rotate the geometry by the change in the Moon's arrival phase
                prev = results[-1]
                dth = N_MOON * (z[0] * Tn(g * G0_KM_S2) - prev["T"])
                z[1] += dth
                z[3:] += dth
            z, info = solve(g, z, K, pool)
            info["z"] = z.tolist()
            results.append(info)
            json.dump(results, open(sys.path[0] + "/t5_earth_moon_%s.json" % tag, "w"))
