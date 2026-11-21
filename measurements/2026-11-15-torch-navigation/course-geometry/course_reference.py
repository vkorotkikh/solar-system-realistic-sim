"""Reference code for the torch-ship course geometry study (read-only use of the repo).

Units everywhere: AU, days, AU/day, AU/day^2, heliocentric ecliptic J2000.

    from course_reference import *
    sample_ballistic_leg("earth", "mars", 2461356.5, 2461356.5 + 210, 50)
    free_space_course("earth", "mars", jd0, a_g=1.0)
    solve_torch_trip("earth", "mars", jd0, a_g=1.0)                 # 6 unknowns, no freedom
    solve_torch_trip("earth", "mars", jd0, a_g=1.0, keepout_au=0.1)  # 7 unknowns, lateral bias

Run `python -B course_reference.py` for the self-check (about a minute).
"""
from __future__ import annotations

import math
import sys

import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import least_squares

WT = "<session-dir>/wt-c1"
sys.path.insert(0, WT + "/backend")

from data.bodies import ALL_BODIES  # noqa: E402
from mission.orbital import MU_SUN_AU3_DAY2, sample_body_state_from_elements  # noqa: E402

AU_KM = 149_597_870.7
AU_M = AU_KM * 1000.0
DAY_S = 86_400.0
G0 = 9.80665
MU = MU_SUN_AU3_DAY2  # AU^3/day^2, the value the planner's Lambert solver uses
MU_SUN_KM3_S2 = 1.32712440018e11
BY = {b["id"]: b for b in ALL_BODIES}
JD_2026_01_01 = 2461041.5  # 2461356.5 is 2026-11-12 (given); minus 315 days


def g_to_au_day2(g: float) -> float:
    """Thrust acceleration in g -> AU/day^2 (1 g = 0.48944 AU/day^2)."""
    return g * G0 * DAY_S ** 2 / AU_M


def body_state(body_id: str, jd: float):
    s = sample_body_state_from_elements(BY[body_id], jd)
    return np.array(s["position"]), np.array(s["velocity"])


def body_pos(body_id: str, jd: float):
    return np.array(sample_body_state_from_elements(BY[body_id], jd)["position"])


# --------------------------------------------------------------------------------------
# Task 4: sampling the planner's existing ballistic (Lambert) legs
# --------------------------------------------------------------------------------------
def _stumpff(z: float):
    if z > 1e-8:
        s = math.sqrt(z)
        return (1 - math.cos(s)) / z, (s - math.sin(s)) / (s ** 3)
    if z < -1e-8:
        s = math.sqrt(-z)
        return (math.cosh(s) - 1) / (-z), (math.sinh(s) - s) / (s ** 3)
    return 0.5 - z / 24.0, 1.0 / 6.0 - z / 120.0


def kepler_propagate(r0, v0, dt: float, mu: float = MU):
    """Two-body propagation by universal variables. Returns (r, v). Exact for any conic.
    The universal Kepler function is strictly increasing in chi (derivative = r > 0), so the root is
    bracketed and Newton steps that leave the bracket are replaced by bisection (plain Newton diverged
    on long, eccentric arcs: earth->mercury 1479 d)."""
    r0 = np.asarray(r0, float)
    v0 = np.asarray(v0, float)
    if dt == 0.0:
        return r0.copy(), v0.copy()
    sgn = 1.0 if dt > 0 else -1.0
    tau = abs(dt)
    rn = float(np.linalg.norm(r0))
    sq = math.sqrt(mu)
    vr = sgn * float(r0 @ v0) / sq  # time reversal: flip the radial velocity sign
    alpha = 2.0 / rn - float(v0 @ v0) / mu

    def kep(chi):
        z = alpha * chi * chi
        c2, c3 = _stumpff(z)
        return (vr * chi * chi * c2 + (1 - alpha * rn) * chi ** 3 * c3 + rn * chi - sq * tau,
                vr * chi * (1 - z * c3) + (1 - alpha * rn) * chi * chi * c2 + rn)

    lo, hi = 0.0, max(sq * tau / rn, 1e-12)
    while kep(hi)[0] < 0.0:
        lo, hi = hi, hi * 2.0
    chi = 0.5 * (lo + hi)
    for _ in range(200):
        f, fp = kep(chi)
        if f > 0.0:
            hi = chi
        else:
            lo = chi
        nxt = chi - f / fp
        if not (lo < nxt < hi):
            nxt = 0.5 * (lo + hi)
        if abs(nxt - chi) < 1e-15 * max(1.0, abs(chi)):
            chi = nxt
            break
        chi = nxt
    z = alpha * chi * chi
    c2, c3 = _stumpff(z)
    F = 1 - chi * chi / rn * c2
    G = (tau - chi ** 3 / sq * c3)
    r = F * r0 + sgn * G * v0
    rr = float(np.linalg.norm(r))
    Fd = sq / (rr * rn) * chi * (z * c3 - 1)
    Gd = 1 - chi * chi / rr * c2
    return r, sgn * Fd * r0 + Gd * v0


def lambert_leg(from_id: str, to_id: str, depart_jd: float, arrive_jd: float, prograde: bool = True):
    """The planner's own Lambert leg dict (budget: 1 request, Kepler provider, no network)."""
    from trajectory.planner import solve_direct_lambert
    res = solve_direct_lambert(ALL_BODIES, from_id=from_id, to_id=to_id, departure_jd=depart_jd,
                               arrival_jd=arrive_jd, prograde=prograde)
    if res.get("solution") is None:
        raise ValueError(f"no Lambert solution {from_id}->{to_id} {depart_jd}..{arrive_jd}: {res.get('error')}")
    return res["solution"]


def sample_ballistic_leg(from_id, to_id, depart_jd, arrive_jd, n, prograde=True, leg=None, check_km=1000.0):
    """n >= 2 samples (jd, x, y, z in AU) along the planner's Lambert leg, jd spaced evenly from
    depart_jd to arrive_jd inclusive.

    Fields used (backend/trajectory/lambert.py:1065-1068): solution["startPosition"] (AU) and
    solution["departureVelocityApprox"] (AU/day, heliocentric ecliptic J2000, the transfer velocity
    BEFORE any burn). The arc is two-body around the Sun with MU_SUN_AU3_DAY2.
    Raises ValueError if the end point misses the arrival body by more than check_km (default 1,000 km;
    None disables). The planner's Lambert root tolerance is 1e-4 d = 8.64 s, so a fast arc (100 km/s near
    Mercury) can legitimately miss by up to ~860 km; see REPORT.md.
    """
    leg = leg or lambert_leg(from_id, to_id, depart_jd, arrive_jd, prograde)
    r0 = np.array(leg["startPosition"])
    v0 = np.array(leg["departureVelocityApprox"])
    T = arrive_jd - depart_jd
    out = []
    for k in range(n):
        dt = T * k / (n - 1)
        r, _ = kepler_propagate(r0, v0, dt)
        out.append((depart_jd + dt, float(r[0]), float(r[1]), float(r[2])))
    miss_km = float(np.linalg.norm(np.array(out[-1][1:]) - body_pos(to_id, arrive_jd))) * AU_KM
    if check_km is not None and miss_km > check_km:
        raise ValueError(f"end point misses {to_id} by {miss_km:.1f} km (> {check_km} km)")
    return out


# --------------------------------------------------------------------------------------
# Tasks 1 and 3: free-space straight-line course between moving bodies
# --------------------------------------------------------------------------------------
def free_space_course(a_id: str, b_id: str, jd0: float, a_g: float, tol_days: float = 1e-10):
    """T = 2 sqrt(d / a), d = |B(jd0 + T) - A(jd0)|, solved by fixed-point iteration.
    Returns (p0, p1, T_days, iterations)."""
    a = g_to_au_day2(a_g)
    p0 = body_pos(a_id, jd0)
    T = 2.0 * math.sqrt(np.linalg.norm(body_pos(b_id, jd0) - p0) / a)
    for it in range(1, 60):
        p1 = body_pos(b_id, jd0 + T)
        Tn = 2.0 * math.sqrt(np.linalg.norm(p1 - p0) / a)
        if abs(Tn - T) < tol_days:
            return p0, p1, Tn, it
        T = Tn
    return p0, p1, T, 60


def segment_sun_distance(p0, p1):
    """Closest approach of the straight segment p0 -> p1 to the origin (the Sun).
    Returns (distance_au, s) with s in [0, 1] the fraction of the segment length."""
    d = p1 - p0
    s = min(1.0, max(0.0, -float(p0 @ d) / float(d @ d)))
    return float(np.linalg.norm(p0 + s * d)), s


def detour_length(p0, p1, R: float) -> float:
    """Shortest path p0 -> p1 that stays outside the sphere of radius R about the origin:
    tangent + arc + tangent; the chord when the segment already clears it."""
    chord = float(np.linalg.norm(p1 - p0))
    dmin, _ = segment_sun_distance(p0, p1)
    if dmin >= R:
        return chord
    d0, d1 = float(np.linalg.norm(p0)), float(np.linalg.norm(p1))
    if d0 <= R or d1 <= R:
        return float("nan")
    theta = math.acos(max(-1.0, min(1.0, float(p0 @ p1) / (d0 * d1))))
    ang = theta - math.acos(R / d0) - math.acos(R / d1)
    return math.sqrt(d0 * d0 - R * R) + math.sqrt(d1 * d1 - R * R) + R * max(ang, 0.0)


def brute_detour(p0, p1, R: float, n: int = 721) -> float:
    """Independent check of detour_length (planar): min over exit points on the circle of
    straight + arc + straight, straight legs only where they clear the circle."""
    th0, th1 = math.atan2(p0[1], p0[0]), math.atan2(p1[1], p1[0])
    ths = np.linspace(0, 2 * math.pi, n, endpoint=False)
    c = R * np.stack([np.cos(ths), np.sin(ths)], 1)
    def clear(p, q):
        d = q - p
        s = np.clip(-(p * d).sum(-1) / (d * d).sum(-1), 0, 1)
        return np.linalg.norm(p + s[..., None] * d, axis=-1) >= R - 1e-12
    a = np.linalg.norm(c - p0[:2], axis=1) + 1e9 * ~clear(p0[None, :2], c)
    b = np.linalg.norm(c - p1[:2], axis=1) + 1e9 * ~clear(p1[None, :2], c)
    dth = np.abs(ths[:, None] - ths[None, :])
    arc = R * np.minimum(dth, 2 * math.pi - dth)
    return float((a[:, None] + arc + b[None, :]).min())


def hours_inside(p0, p1, a_au_day2: float, R: float) -> float:
    """Hours a straight accelerate-flip-decelerate course (rest to rest, constant a) spends inside
    radius R of the Sun. Exact: the speed profile is analytic, the crossing is sampled finely."""
    d = float(np.linalg.norm(p1 - p0))
    T = 2.0 * math.sqrt(d / a_au_day2)
    t = np.linspace(0.0, T, 40001)
    s = np.where(t <= T / 2, 0.5 * a_au_day2 * t * t, d - 0.5 * a_au_day2 * (T - t) ** 2)
    pts = p0[None, :] + (s / d)[:, None] * (p1 - p0)[None, :]
    inside = np.linalg.norm(pts, axis=1) < R
    return float(inside.sum()) / (len(t) - 1) * T * 24.0


# --------------------------------------------------------------------------------------
# Task 2: constant-thrust trip under the Sun's gravity, piecewise-constant thrust direction
# --------------------------------------------------------------------------------------
def unit_from_angles(lon: float, lat: float):
    return np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])


def angles_from_unit(u):
    return math.atan2(u[1], u[0]), math.asin(max(-1.0, min(1.0, u[2])))


def _rhs(t, y, ux, uy, uz, a):
    x, yy, z, vx, vy, vz = y
    r2 = x * x + yy * yy + z * z
    k = -MU / (r2 * math.sqrt(r2))
    return (vx, vy, vz, k * x + a * ux, k * yy + a * uy, k * z + a * uz)


def _periapsis(t, y, ux, uy, uz, a):
    return y[0] * y[3] + y[1] * y[4] + y[2] * y[5]


_periapsis.direction = 1.0


def fly(y0, segments, a: float, rtol: float = 1e-12, atol: float = 1e-14):
    """Integrate thrust a (AU/day^2) with unit direction u over each (u, duration_days) segment.
    Returns (final state y[6], minimum distance to the Sun in AU, position vector at that minimum)."""
    y = np.asarray(y0, float)
    rmin = float(np.linalg.norm(y[:3]))
    rvec = y[:3].copy()
    for u, dur in segments:
        if dur <= 0.0:
            continue
        sol = solve_ivp(_rhs, (0.0, dur), y, method="DOP853", rtol=rtol, atol=atol,
                        args=(float(u[0]), float(u[1]), float(u[2]), a), events=_periapsis)
        y = sol.y[:, -1]
        cands = [y] + list(sol.y_events[0])
        for ye in cands:
            rn = float(np.linalg.norm(ye[:3]))
            if rn < rmin:
                rmin, rvec = rn, ye[:3].copy()
    return y, rmin, rvec


def _axial_and_lateral(lon, lat, lateral_ref):
    e = unit_from_angles(lon, lat)
    n = lateral_ref - float(lateral_ref @ e) * e
    return e, n / float(np.linalg.norm(n))


def bias_segments(x, a_g_unused, lateral_ref):
    """x = [lon1, lat1, lon2, lat2, f, T, phi]. Axial direction e1 until f*T, e2 after (the flip);
    the lateral push is +phi over the first quarter, -phi over the middle half, +phi over the last
    quarter of the trip. Thrust direction = cos(phi) e_axial + sign * sin(phi) n_lateral."""
    lon1, lat1, lon2, lat2, f, T, phi = x
    e1, n1 = _axial_and_lateral(lon1, lat1, lateral_ref)
    e2, n2 = _axial_and_lateral(lon2, lat2, lateral_ref)
    cuts = sorted({0.0, 0.25 * T, f * T, 0.75 * T, T})
    segs = []
    for lo, hi in zip(cuts[:-1], cuts[1:]):
        mid = 0.5 * (lo + hi)
        e, n = (e1, n1) if mid < f * T else (e2, n2)
        sgn = 1.0 if (mid < 0.25 * T or mid > 0.75 * T) else -1.0
        segs.append((math.cos(phi) * e + sgn * math.sin(phi) * n, hi - lo))
    return segs


Z_HAT = np.array([0.0, 0.0, 1.0])


class TorchProblem:
    """Rendezvous of a constant-thrust ship with body B, leaving body A at jd0 with A's heliocentric
    velocity and arriving with B's (burns near each planet are not modelled: they are the planner's
    existing low-orbit pricing). Thrust is always on, so delta-v = a * T exactly."""

    def __init__(self, a_id, b_id, jd0, a_g, keepout_au=None, lateral_ref=Z_HAT):
        self.a_id, self.b_id, self.jd0, self.a_g = a_id, b_id, jd0, a_g
        self.a = g_to_au_day2(a_g)
        self.keepout = keepout_au
        self.lateral_ref = np.asarray(lateral_ref, float)
        self.r0, self.v0 = body_state(a_id, jd0)
        self.y0 = np.concatenate([self.r0, self.v0])
        self.nfev = 0

    def _end_residual(self, y, T):
        rb, vb = body_state(self.b_id, self.jd0 + T)
        return np.concatenate([y[:3] - rb, (y[3:] - vb) * T])  # velocity error scaled to AU

    def residual(self, x):
        self.nfev += 1
        if self.keepout is None:
            lon1, lat1, lon2, lat2, f, T = x
            e1, e2 = unit_from_angles(lon1, lat1), unit_from_angles(lon2, lat2)
            segs = [(e1, f * T), (e2, (1 - f) * T)]
            y, rmin, _ = fly(self.y0, segs, self.a)
            return self._end_residual(y, T)
        segs = bias_segments(x, None, self.lateral_ref)
        T = x[5]
        y, rmin, _ = fly(self.y0, segs, self.a)
        return np.concatenate([self._end_residual(y, T), [rmin - self.keepout]])

    def min_distance(self, x):
        if self.keepout is None:
            lon1, lat1, lon2, lat2, f, T = x
            segs = [(unit_from_angles(lon1, lat1), f * T), (unit_from_angles(lon2, lat2), (1 - f) * T)]
        else:
            segs = bias_segments(x, None, self.lateral_ref)
        return fly(self.y0, segs, self.a)[1]

    def closest_point(self, x):
        """(distance, position vector) of the closest approach to the Sun along the flown path."""
        if self.keepout is None:
            lon1, lat1, lon2, lat2, f, T = x
            segs = [(unit_from_angles(lon1, lat1), f * T), (unit_from_angles(lon2, lat2), (1 - f) * T)]
        else:
            segs = bias_segments(x, None, self.lateral_ref)
        _, rmin, rvec = fly(self.y0, segs, self.a)
        return rmin, rvec

    def simple_guess(self):
        """Free-space course direction, flip at the middle, T from the fixed-point iteration."""
        p0, p1, T, _ = free_space_course(self.a_id, self.b_id, self.jd0, self.a_g)
        e1 = (p1 - p0) / np.linalg.norm(p1 - p0)
        lon1, lat1 = angles_from_unit(e1)
        lon2, lat2 = angles_from_unit(-e1)
        return np.array([lon1, lat1, lon2, lat2, 0.5, T])


def newton(F, x0, tol=1e-9, maxit=40, h=1e-7, damped=True):
    """Newton with a forward-difference Jacobian and (optional) backtracking on |F|.
    Returns (x, converged, iterations, |F|_inf)."""
    x = np.array(x0, float)
    Fx = F(x)
    for it in range(1, maxit + 1):
        if np.max(np.abs(Fx)) < tol:
            return x, True, it - 1, float(np.max(np.abs(Fx)))
        J = np.empty((len(Fx), len(x)))
        for j in range(len(x)):
            xp = x.copy()
            step = h * max(1.0, abs(x[j]))
            xp[j] += step
            J[:, j] = (F(xp) - Fx) / step
        try:
            dx = np.linalg.solve(J, -Fx)
        except np.linalg.LinAlgError:
            return x, False, it, float(np.max(np.abs(Fx)))
        lam = 1.0
        while True:
            xn = x + lam * dx
            Fn = F(xn)
            if not damped or np.linalg.norm(Fn) < np.linalg.norm(Fx) or lam < 1e-3:
                break
            lam *= 0.5
        if not np.all(np.isfinite(Fn)):
            return x, False, it, float("inf")
        x, Fx = xn, Fn
    return x, bool(np.max(np.abs(Fx)) < tol), maxit, float(np.max(np.abs(Fx)))


def away_reference(p0, p1):
    """Lateral reference 'away from the Sun': the vector from the Sun to the closest point of the
    straight course; the ecliptic pole when the course goes within 1e-3 AU of the Sun's centre."""
    d = p1 - p0
    s = min(1.0, max(0.0, -float(p0 @ d) / float(d @ d)))
    c = p0 + s * d
    nc = float(np.linalg.norm(c))
    return c / nc if nc > 1e-3 else Z_HAT.copy()


def solve_torch_trip(a_id, b_id, jd0, a_g, keepout_au=None, x0=None, method="newton", lateral="z"):
    """Solve the rendezvous. keepout_au=None -> 6 unknowns (two constant-direction burns, no freedom to
    bend); keepout_au=R -> 7 unknowns with the lateral bias phi chosen so the closest approach to the
    Sun equals R. lateral: 'z' (push out of the ecliptic, always defined), 'away' (push along the Sun ->
    closest-point vector of the straight free-space course) or 'away_dynamic' (same, but using the closest
    point of the solved 6-unknown trip under gravity; costs one extra solve, cheapest of the three).
    method: 'newton' or 'lm' (scipy least_squares). Returns a dict."""
    ref = Z_HAT
    base_x = None
    if lateral == "away":
        p0, p1, _, _ = free_space_course(a_id, b_id, jd0, a_g)
        ref = away_reference(p0, p1)
    elif lateral == "away_dynamic" and keepout_au is not None:
        base = solve_torch_trip(a_id, b_id, jd0, a_g)  # the 6-unknown trip under the Sun's gravity
        rmin, rvec = base["problem"].closest_point(base["x"])
        ref = rvec / rmin if rmin > 1e-3 else Z_HAT.copy()
        base_x = base["x"]
    prob = TorchProblem(a_id, b_id, jd0, a_g, keepout_au, ref)
    if x0 is None:
        x0 = prob.simple_guess() if base_x is None else base_x
        if keepout_au is not None:
            x0 = np.concatenate([x0, [0.2]])
    if method == "newton":
        x, ok, its, res = newton(prob.residual, x0)
    else:
        sol = least_squares(prob.residual, x0, method="lm", xtol=1e-14, ftol=1e-14, gtol=1e-14, max_nfev=400)
        x, res = sol.x, float(np.max(np.abs(sol.fun)))
        ok, its = res < 1e-9, sol.nfev
    T = float(x[5])
    return {"x": x, "converged": bool(ok and np.isfinite(res)), "iterations": its, "residual": res,
            "T_days": T, "dv_kms": prob.a * T * AU_KM / DAY_S, "min_sun_au": prob.min_distance(x),
            "nfev": prob.nfev, "problem": prob}


def optimal_detour(a_id, b_id, jd0, a_g, keepout_au, K=8, x_start=None, maxiter=200):
    """Benchmark: minimum-time rendezvous with min distance >= R, thrust direction piecewise constant over
    K equal-time segments (SLSQP, numeric gradients). Unknowns: 2K angles + T. Start: the keepout-free
    solution, or x_start = [lon1, lat1, lon2, lat2, f, T]. Returns dict(T_days, converged, min_sun_au)."""
    from scipy.optimize import minimize
    prob = TorchProblem(a_id, b_id, jd0, a_g)
    if x_start is None:
        x_start = solve_torch_trip(a_id, b_id, jd0, a_g)["x"]
    lon1, lat1, lon2, lat2, f, T0 = x_start
    e1, e2 = unit_from_angles(lon1, lat1), unit_from_angles(lon2, lat2)
    ang = []
    for k in range(K):
        mid = (k + 0.5) / K
        ang += list(angles_from_unit(e1 if mid < f else e2))
    z0 = np.array(ang + [T0])

    def segs(z):
        T = z[-1]
        return [(unit_from_angles(z[2 * k], z[2 * k + 1]), T / K) for k in range(K)]

    cache = {}

    def run(z):
        key = z.tobytes()
        if key not in cache:
            y, rmin, _ = fly(prob.y0, segs(z), prob.a)
            cache.clear()
            cache[key] = (prob._end_residual(y, z[-1]), rmin)
        return cache[key]

    cons = [{"type": "eq", "fun": lambda z: run(z)[0]},
            {"type": "ineq", "fun": lambda z: run(z)[1] - keepout_au}]
    res = minimize(lambda z: z[-1], z0, constraints=cons, method="SLSQP",
                   options={"maxiter": maxiter, "ftol": 1e-12})
    r, rmin = run(res.x)
    ok = bool(np.max(np.abs(r)) < 1e-8 and rmin > keepout_au - 1e-7)
    return {"T_days": float(res.x[-1]), "converged": ok, "min_sun_au": rmin,
            "residual": float(np.max(np.abs(r))), "nit": int(res.nit), "status": int(res.status), "x": res.x}


# --------------------------------------------------------------------------------------
# self-check
# --------------------------------------------------------------------------------------
def _selfcheck():
    # 1) ballistic leg: end point within 1,000 km of the arrival body, energy matches vis-viva
    for f, t, d0, tof in [("earth", "mars", 2461356.5, 210.0), ("earth", "venus", 2461100.5, 130.0),
                          ("earth", "jupiter", 2461300.5, 900.0), ("mars", "ceres", 2461500.5, 400.0)]:
        pts = sample_ballistic_leg(f, t, d0, d0 + tof, 25)
        miss = np.linalg.norm(np.array(pts[-1][1:]) - body_pos(t, d0 + tof)) * AU_KM
        print(f"leg {f}->{t}: {len(pts)} points, end miss {miss:.4f} km")
        assert miss < 1000.0
    # 2) universal propagation vs numerical integration (no thrust)
    r0, v0 = body_state("mars", 2461356.5)
    r1, v1 = kepler_propagate(r0, v0, 300.0)
    sol = solve_ivp(_rhs, (0, 300.0), np.concatenate([r0, v0]), method="DOP853", rtol=1e-13, atol=1e-15,
                    args=(0.0, 0.0, 0.0, 0.0))
    err = np.linalg.norm(sol.y[:3, -1] - r1) * AU_KM
    print(f"kepler_propagate vs DOP853 over 300 d: {err:.6f} km")
    assert err < 1.0
    # 3) free-space course: a straight 1 AU line at 1 g takes 2 sqrt(1/a) days
    a = g_to_au_day2(1.0)
    p0, p1, T, it = free_space_course("earth", "venus", 2461356.5, 1.0)
    assert abs(T - 2 * math.sqrt(np.linalg.norm(p1 - p0) / a)) < 1e-9
    # 4) detour length: through the centre of a sphere the detour is d - 2R + pi R
    p0, p1 = np.array([-1.0, 0, 0]), np.array([1.5, 0, 0])
    assert abs(detour_length(p0, p1, 0.1) - brute_detour(p0, p1, 0.1)) < 2e-4
    assert abs(detour_length(np.array([-1.0, 0, 0]), np.array([1.0, 0, 0]), 0.1)
               - (2 * math.sqrt(0.99) + 0.1 * (math.pi - 2 * math.acos(0.1)))) < 1e-12
    # 5) baseline torch trip converges and reproduces gravity-free limit within a percent
    r = solve_torch_trip("earth", "mars", 2461356.5, 1.0)
    p0, p1, T0, _ = free_space_course("earth", "mars", 2461356.5, 1.0)
    print(f"torch trip earth->mars 1 g: converged={r['converged']} T={r['T_days']:.5f} d (free space {T0:.5f} d)")
    assert r["converged"] and abs(r["T_days"] / T0 - 1) < 0.02
    # 6) detour: 7-unknown solve reaches the keep-out radius and is verified by dense sampling
    r6 = solve_torch_trip("earth", "mars", JD_2026_01_01 + 818, 1.0)           # 2028-03-29, Earth-Mars conjunction
    r7 = solve_torch_trip("earth", "mars", JD_2026_01_01 + 818, 1.0, keepout_au=0.1, lateral="away_dynamic")
    dT_h = (r7["T_days"] - r6["T_days"]) * 24
    print(f"conjunction 2028-03-29 1 g: no-bend closest approach {r6['min_sun_au']:.4f} AU; detour to 0.1 AU: "
          f"converged={r7['converged']} in {r7['iterations']} iterations, +{dT_h:.2f} h, +{g_to_au_day2(1.0) * (r7['T_days'] - r6['T_days']) * AU_KM / DAY_S:.1f} km/s")
    assert r6["converged"] and r6["min_sun_au"] < 0.1 and r7["converged"]
    assert abs(r7["min_sun_au"] - 0.1) < 1e-6 and 0.0 < dT_h < 1.5
    print("self-check passed")


if __name__ == "__main__":
    _selfcheck()
