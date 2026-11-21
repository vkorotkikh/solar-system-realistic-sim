"""pytest plugin: add the keys the design adds to rocket legs (drive, course) and see if any existing planner test notices."""
import sys
sys.path.insert(0, "<session-dir>/wt-nav/backend")
import planner.trips as T
_orig = T._leg
def _leg(*args, **kwargs):
    leg = _orig(*args, **kwargs)
    leg["drive"] = "impulsive"
    if leg["around"] == "sun":
        leg["course"] = {"closest_sun_approach": {"au": 1.0, "date": leg["depart"]["date"], "jd": leg["depart"]["jd"]}, "belts": []}
    return leg
T._leg = _leg
