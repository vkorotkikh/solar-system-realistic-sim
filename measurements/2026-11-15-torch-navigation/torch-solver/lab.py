"""shared helpers for the torch-solver experiments"""
import os, sys, datetime, math
import numpy as np

BACKEND = "<session-dir>/wt-c1/backend"
sys.path.insert(0, BACKEND)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from data.bodies import ALL_BODIES
from torch_reference import *   # noqa

BY = {b["id"]: b for b in ALL_BODIES}
FN = {k: body_fn(v) for k, v in BY.items()}
PAIRS = [("earth", "mars"), ("earth", "venus"), ("earth", "mercury"), ("earth", "jupiter"), ("earth", "saturn"),
         ("earth", "neptune"), ("mars", "ceres"), ("earth", "eris"), ("jupiter", "saturn")]
ACCS = [0.01, 0.03, 0.1, 0.3, 1.0, 3.0, 10.0]


def jd_of(y, m, d):
    return datetime.date(y, m, d).toordinal() + 1721424.5


JD0, JD1 = jd_of(2026, 1, 1), jd_of(2036, 12, 31)


def conjunction_dates(a, b, n=6, sep_days=40):
    """departure dates where A and B are most nearly opposite as seen from the Sun (straight line passes the Sun)"""
    days = np.arange(JD0, JD1, 1.0)
    ang = []
    for jd in days:
        ra, rb = FN[a](jd)[0], FN[b](jd)[0]
        ang.append(math.degrees(math.acos(np.clip(ra @ rb / np.linalg.norm(ra) / np.linalg.norm(rb), -1, 1))))
    ang = np.array(ang)
    order = np.argsort(-ang)
    picked = []
    for i in order:
        if all(abs(days[i] - days[j]) > sep_days for j in picked):
            picked.append(i)
        if len(picked) == n:
            break
    return sorted((float(days[i]), float(ang[i])) for i in picked)


def date_set(a, b, n_even=18, n_conj=6):
    even = list(np.linspace(JD0, JD1, n_even))
    conj = conjunction_dates(a, b, n_conj)
    return [(float(j), None) for j in even] + conj


def reintegrate(out, A, B, jd, a_g, mu=MU, rtol=1e-12):
    """DOP853 rtol 1e-12 re-integration of a solved two-burn (+coast) trip -> (arrival pos err km, vel err m/s)"""
    from scipy.integrate import solve_ivp
    a = g_to_aud2(a_g)
    rA, vA = A(jd)

    def rhs(t, y, e, acc):
        r = y[:3]
        return np.concatenate([y[3:], -mu * r / np.linalg.norm(r) ** 3 + acc * e])
    y = np.concatenate([rA, vA])
    for (e, acc, dur) in ((out["e1"], a, out["t1"]), (np.zeros(3), 0.0, out.get("coast", 0.0)), (out["e2"], a, out["t2"])):
        if dur <= 0:
            continue
        s = solve_ivp(rhs, (0, dur), y, args=(e, acc), method="DOP853", rtol=rtol, atol=1e-15)
        y = s.y[:, -1]
    rB, vB = B(jd + out["T"])
    return float(np.linalg.norm(y[:3] - rB) * AU_KM), float(np.linalg.norm(y[3:] - vB) * AUD_MS)


def tilt(e, toward, beta):
    """rotate unit vector e toward unit vector `toward` by angle beta"""
    p = toward - (toward @ e) * e
    n = np.linalg.norm(p)
    if n < 1e-12:
        return e
    p /= n
    return math.cos(beta) * e + math.sin(beta) * p


def rescue_guesses(A, B, jd, acc):
    """deflected starting points used when the default guess fails: bend the path out of the ecliptic or sideways"""
    base = better_guess(A, B, jd, acc)
    rA = A(jd)[0]
    chord = B(jd + base["t1"] + base["t2"])[0] - rA
    chord /= np.linalg.norm(chord)
    zhat = np.array([0, 0, 1.0])
    side = np.cross(zhat, chord)
    side /= np.linalg.norm(side)
    gs = []
    for axis in (zhat, side):
        for sgn in (1, -1):
            for beta in (0.25, 0.6):
                g = dict(base)
                g["e1"] = tilt(base["e1"], sgn * axis, beta)
                g["e2"] = tilt(base["e2"], -sgn * axis, beta)
                gs.append(g)
    return gs
