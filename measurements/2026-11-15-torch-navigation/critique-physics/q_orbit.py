import sys
sys.path.insert(0, "<session-dir>/nav-lab/critique-physics")
from plab import *
for b in ("mercury","venus","earth","mars","jupiter","ceres"):
    el = BY[b]["orbit"]
    print(b, {k: el[k] for k in el if k in ("a","a_au","semi_major_axis","e","eccentricity","semiMajorAxis","semi_major_axis_au")}, list(el.keys())[:14])
