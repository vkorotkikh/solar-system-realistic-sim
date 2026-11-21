"""pytest plugin: run a real 100k-asteroid screen for every Sun leg a search builds (the cost the design adds), nothing else."""
import sys, time
sys.path.insert(0, "<session-dir>/nav-lab/belt-data")
sys.path.insert(0, "<session-dir>/nav-lab/critique-contract")
from common import *
import belts_reference as B
import planner.trips as T
cat = B.load_catalog()
_orig = T._leg
def _leg(from_id, to_id, depart_jd, arrive_jd, burns, vd, va, around="sun"):
    leg = _orig(from_id, to_id, depart_jd, arrive_jd, burns, vd, va, around)
    if around == "sun":
        t = np.linspace(depart_jd, arrive_jd, 181)
        p0, p1 = pos(from_id, depart_jd), pos(to_id, arrive_jd)
        s = ((t - depart_jd) / (arrive_jd - depart_jd))[:, None]
        B.screen_fast(cat, t, p0 + s * (p1 - p0))
    return leg
T._leg = _leg
