import os, sys, math, time, json, datetime
import numpy as np
NAV = "<session-dir>/nav-lab"
BACKEND = "<session-dir>/wt-nav/backend"
sys.path.insert(0, BACKEND)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from data.bodies import ALL_BODIES
import tr
from tr import *
BY = {b["id"]: b for b in ALL_BODIES}
FN = {k: body_fn(v) for k, v in BY.items()}
def jd_of(y, m, d): return datetime.date(y, m, d).toordinal() + 1721424.5
JD0 = jd_of(2026, 1, 1)
def reintegrate(out, A, B, jd, a_g, mu=MU, rtol=1e-12):
    from scipy.integrate import solve_ivp
    a = g_to_aud2(a_g); rA, vA = A(jd)
    def rhs(t, y, e, acc):
        r = y[:3]; return np.concatenate([y[3:], -mu * r / np.linalg.norm(r) ** 3 + acc * e])
    y = np.concatenate([rA, vA])
    for (e, acc, dur) in ((out["e1"], a, out["t1"]), (out["e2"], a, out["t2"])):
        s = solve_ivp(rhs, (0, dur), y, args=(e, acc), method="DOP853", rtol=rtol, atol=1e-15); y = s.y[:, -1]
    rB, vB = B(jd + out["T"])
    return float(np.linalg.norm(y[:3] - rB) * AU_KM), float(np.linalg.norm(y[3:] - vB) * AUD_MS)

def tilt(e, toward, beta):
    p = toward - (toward @ e) * e
    n = np.linalg.norm(p)
    if n < 1e-12: return e
    p /= n
    return math.cos(beta) * e + math.sin(beta) * p

def rescue_guesses(A, B, jd, acc):
    """verbatim from nav-lab/torch-solver/lab.py (NOT in torch_reference.py)"""
    base = better_guess(A, B, jd, acc)
    rA = A(jd)[0]
    chord = B(jd + base["t1"] + base["t2"])[0] - rA
    chord /= np.linalg.norm(chord)
    zhat = np.array([0, 0, 1.0]); side = np.cross(zhat, chord); side /= np.linalg.norm(side)
    gs = []
    for axis in (zhat, side):
        for sgn in (1, -1):
            for beta in (0.25, 0.6):
                g = dict(base); g["e1"] = tilt(base["e1"], sgn * axis, beta); g["e2"] = tilt(base["e2"], -sgn * axis, beta); gs.append(g)
    return gs
