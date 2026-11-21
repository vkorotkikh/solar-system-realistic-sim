"""shared helpers for the physics critique (read-only against wt-nav)"""
import os, sys, math, signal, time
import numpy as np
WT = "<session-dir>/wt-nav/backend"
TS = "<session-dir>/nav-lab/torch-solver"
sys.path.insert(0, WT); sys.path.insert(0, TS)
from data.bodies import ALL_BODIES
from torch_reference import *   # noqa
BY = {b["id"]: b for b in ALL_BODIES}
FN = {k: body_fn(v) for k, v in BY.items()}
def jd_of(y, m, d):
    import datetime
    return datetime.date(y, m, d).toordinal() + 1721424.5
class TO(Exception): pass
def _h(s, f): raise TO()
signal.signal(signal.SIGALRM, _h)
def g_sun_g(r_au):
    """Sun's gravity in g at r AU"""
    return GM_SUN_KM3S2 / (r_au * AU_KM) ** 2 * 1e3 / G0
def tilt(e, toward, beta):
    p = toward - (toward @ e) * e
    n = np.linalg.norm(p)
    if n < 1e-12: return e
    p /= n
    return math.cos(beta) * e + math.sin(beta) * p
def all_starts(A, B, jd, acc):
    base = better_guess(A, B, jd, acc)
    rA = A(jd)[0]
    chord = B(jd + base["t1"] + base["t2"])[0] - rA
    chord /= np.linalg.norm(chord)
    zhat = np.array([0, 0, 1.0]); side = np.cross(zhat, chord); side /= np.linalg.norm(side)
    gs = []
    for axis in (zhat, side):
        for sgn in (1, -1):
            for beta in (0.25, 0.6):
                g = dict(base)
                g["e1"] = tilt(base["e1"], sgn * axis, beta)
                g["e2"] = tilt(base["e2"], -sgn * axis, beta)
                gs.append(g)
    return [("first", base), ("naive", naive_guess(A, B, jd, acc))] + [(f"d{i}", g) for i, g in enumerate(gs)]
