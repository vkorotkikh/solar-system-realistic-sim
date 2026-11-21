import sys, math
sys.path.insert(0, "<session-dir>/wt-nav/backend")
import numpy as np
from data.bodies import ALL_BODIES
from mission.orbital import sample_body_state_from_elements
BY = {b["id"]: b for b in ALL_BODIES}
AU_M = 149_597_870.7e3
G0 = 9.80665
def pos(bid, jd):
    return np.array(sample_body_state_from_elements(BY[bid], jd)["position"])
def free_T(a_id, b_id, jd, g):
    """free-space, bodies treated as at rest at arrival position: T = 2 sqrt(d/a), d=|B(jd+T)-A(jd)|"""
    a = g * G0 * 86400.0**2 / AU_M  # AU/day^2
    p0 = pos(a_id, jd)
    T = 2 * math.sqrt(np.linalg.norm(pos(b_id, jd) - p0) / a)
    for _ in range(30):
        Tn = 2 * math.sqrt(np.linalg.norm(pos(b_id, jd + T) - p0) / a)
        if abs(Tn - T) < 1e-9:
            T = Tn; break
        T = Tn
    return T
