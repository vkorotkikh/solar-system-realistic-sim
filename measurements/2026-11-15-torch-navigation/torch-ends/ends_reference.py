"""Reference cost of leaving (or, time-reversed, entering) an orbit under constant-magnitude thrust.

escape_cost(mu, r_periapsis, r_apoapsis, a) -> (delta_v_km_s, seconds)

Model: planar two-body motion about a point mass, thrust acceleration of constant magnitude `a`
pointed along the velocity vector, starting at periapsis of the given orbit (circular when
r_periapsis == r_apoapsis), integrated until the two-body energy v^2/2 - mu/r reaches zero.
delta_v = a * t (the engine is on for the whole time). Capture is the time reverse of escape:
the same numbers apply to arriving from zero energy into the same orbit, braking against the velocity.

UNITS: mu in km^3/s^2, radii in km, a in km/s^2 (NOT m/s^2: 1 g = 9.80665e-3 km/s^2). Result in km/s and s.

The internal routine works in units mu = 1, r_periapsis = 1, so the only parameters are
a_nd = a * rp^2 / mu (thrust over local circular gravity, "a / g0") and ra / rp.
"""
from __future__ import annotations

import math

import numpy as np
from scipy.integrate import solve_ivp

G0_KM_S2 = 9.80665e-3
SQRT2_M1 = math.sqrt(2.0) - 1.0


def _escape_nd(a_nd: float, ratio: float = 1.0, steer: str = "velocity", beta: float = 0.0,
               table=None, t_ref: float = 1.0, tmax: float | None = None):
    """Non-dimensional escape. Returns (t_nd, y_end) or (None, y_end) if tmax is hit first.

    steer = "velocity"   thrust along the velocity
            "transverse" thrust perpendicular to the radius (prograde side)
            "inertial"   thrust along a fixed inertial direction, angle beta (rad, counter-clockwise)
                         from the initial velocity direction
            "table"      thrust at angle -delta from the velocity, delta(t) = interp(t / t_ref; table)
                         (table = (nodes_x, nodes_y); positive delta = velocity rotated counter-clockwise)
    Orbit is counter-clockwise, starts at (1, 0) with velocity (0, vp).
    """
    sma = 0.5 * (1.0 + ratio)
    vp = math.sqrt(max(2.0 - 1.0 / sma, 1e-300))
    if steer == "inertial":
        ux, uy = -math.sin(beta), math.cos(beta)  # beta = 0 -> initial velocity direction (+y)
    if table is not None:
        tx, ty = np.asarray(table[0], float), np.asarray(table[1], float)

    def rhs(t, y):
        x, yy, vx, vy = y
        r2 = x * x + yy * yy
        r3 = r2 * math.sqrt(r2)
        if steer == "velocity":
            v = math.hypot(vx, vy)
            ax, ay = a_nd * vx / v, a_nd * vy / v
        elif steer == "transverse":
            r = math.sqrt(r2)
            ax, ay = -a_nd * yy / r, a_nd * x / r
        elif steer == "inertial":
            ax, ay = a_nd * ux, a_nd * uy
        else:  # table
            d = float(np.interp(t / t_ref, tx, ty))
            v = math.hypot(vx, vy)
            c, s = math.cos(d), math.sin(d)
            ex, ey = vx / v, vy / v
            ax, ay = a_nd * (c * ex - s * ey), a_nd * (s * ex + c * ey)
        return [vx, vy, -x / r3 + ax, -yy / r3 + ay]

    def energy(t, y):
        return 0.5 * (y[2] ** 2 + y[3] ** 2) - 1.0 / math.hypot(y[0], y[1])

    energy.terminal, energy.direction = True, 1
    if tmax is None:
        tmax = 6.0 / a_nd + 50.0
    sol = solve_ivp(rhs, (0.0, tmax), [1.0, 0.0, 0.0, vp], method="DOP853", events=energy,
                    rtol=1e-12, atol=1e-14)
    if sol.t_events[0].size == 0:
        return None, sol.y[:, -1]
    return float(sol.t_events[0][0]), sol.y_events[0][0]


def escape_cost(mu: float, r_periapsis: float, r_apoapsis: float, a: float) -> tuple[float, float]:
    """(delta_v km/s, seconds) to go from periapsis of the orbit to zero energy, thrust a (km/s^2) along velocity."""
    if not (mu > 0 and 0 < r_periapsis <= r_apoapsis and a > 0):
        raise ValueError("need mu > 0, 0 < r_periapsis <= r_apoapsis, a > 0")
    a_nd = a * r_periapsis ** 2 / mu
    t_nd, _ = _escape_nd(a_nd, r_apoapsis / r_periapsis)
    if t_nd is None:
        raise RuntimeError("no escape within the time cap")
    t = t_nd * math.sqrt(r_periapsis ** 3 / mu)
    return a * t, t


capture_cost = escape_cost  # time reverse: same delta-v and time


if __name__ == "__main__":
    # 1. impulsive limit: delta-v / vc -> sqrt(2) - 1 for large a / g0
    for a_nd in (1e3, 1e4):
        t, _ = _escape_nd(a_nd)
        assert abs(a_nd * t - SQRT2_M1) < 1e-6, (a_nd, a_nd * t)   # measured excess is 1.6e-3 / a_nd^2
    # 2. low-thrust limit: delta-v / vc -> 1 from below, but only as 1 - 0.808 (a/g0)^(1/4)  (measured, REPORT.md)
    prev = 0.0
    for a_nd in (1e-1, 1e-2, 1e-3, 1e-4):
        t, _ = _escape_nd(a_nd)
        dv = a_nd * t
        assert prev < dv < 1.0, (a_nd, dv)
        if a_nd <= 1e-3:
            assert abs((1.0 - dv) / (0.808 * a_nd ** 0.25) - 1.0) < 0.005, (a_nd, dv)
        prev = dv
    # 3. work-energy identity: for thrust along the velocity, E_end - E_0 = integral of a|v| dt.
    #    Independent check of the integrator: re-integrate with W' = a|v| as a fifth state.
    for a_nd, ratio in ((0.3, 1.0), (1.0, 1.0), (0.05, 3.0), (0.5, 50.0)):
        t, y = _escape_nd(a_nd, ratio)
        sma = 0.5 * (1.0 + ratio)
        e0 = -0.5 / sma

        def rhs(_, s):
            x, yy, vx, vy, w = s
            r3 = math.hypot(x, yy) ** 3
            v = math.hypot(vx, vy)
            return [vx, vy, -x / r3 + a_nd * vx / v, -yy / r3 + a_nd * vy / v, a_nd * v]

        s = solve_ivp(rhs, (0, t), [1, 0, 0, math.sqrt(2 - 1 / sma), 0.0], method="DOP853",
                      rtol=1e-12, atol=1e-14)
        assert abs(s.y[4, -1] - (0.0 - e0)) < 1e-8, (a_nd, ratio, s.y[4, -1], -e0)
    # 4. Earth 200 km at 1 g: planner constants (mu = 398613.89 km^3/s^2, r = 6571 km)
    dv, t = escape_cost(398613.89091, 6571.0, 6571.0, G0_KM_S2)
    assert 3.0 < dv < 4.5 and 200 < t < 600, (dv, t)
    # 5. non-physical input is refused
    for bad in ((0, 1, 1, 1), (1, 2, 1, 1), (1, 1, 1, 0)):
        try:
            escape_cost(*bad)
        except ValueError:
            pass
        else:
            raise AssertionError(bad)
    print("ends_reference self-test OK; Earth 200 km, 1 g: dv = %.4f km/s, t = %.1f s" % (dv, t))
