import sys
sys.path.insert(0, "<session-dir>/wt-c1/backend")
from planner import places
for p in places.PLACES:
    if p.id in ("earth","mars","moon-earth-moon","jupiter","ceres"):
        print(p.id, p.radius_km, p.mu_km3_s2, p.default_orbit, p.orbit_radius_km)
print(len(places.PLACES))
