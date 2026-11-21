from common import *
import math
from dataclasses import dataclass
import planner.trips as T
from planner.trips import date_to_jd
from datetime import date
@dataclass(frozen=True)
class C:
    depart_jd: float; flight_days: float; total: float
    @property
    def arrive_jd(self): return self.depart_jd + self.flight_days
    @property
    def days(self): return self.flight_days
first = date_to_jd(date(2026, 11, 15))
g = 1.0
f_T, b_T = free_T("earth", "mars", first, g), free_T("earth", "mars", first + 3225, g)
mk = lambda jd, Tt: C(jd, Tt, round(g * G0 * Tt * 86.4, 3))
pool = [mk(first, f_T), mk(first + 3225, b_T)]
print("cost ratio first-day/best-day =", round(pool[0].total / pool[1].total, 3), "(cap is 1.25)")
for obj in ("min_delta_v", "earliest_arrival"):
    print(obj, "as written :", [(round(o.depart_jd - first), l) for o, l in T._labelled(pool, obj)])
T.MAX_EXTRA = math.inf
for obj in ("min_delta_v", "earliest_arrival"):
    print(obj, "cap removed:", [(round(o.depart_jd - first), l) for o, l in T._labelled(pool, obj)])
# round trips: _RoundTrip's total/days are sums over legs and the stay
