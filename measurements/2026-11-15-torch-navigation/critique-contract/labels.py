from common import *
import time
from dataclasses import dataclass
from planner.trips import _labelled, MAX_EXTRA, date_to_jd
from datetime import date

@dataclass(frozen=True)
class TorchCand:
    depart_jd: float
    flight_days: float
    @property
    def arrive_jd(self): return self.depart_jd + self.flight_days
    @property
    def days(self): return self.flight_days
    @property
    def total(self): return round(self.flight_days * 86400 * G * 9.80665 / 1000, 3) if False else self._tot
    _tot: float = 0.0

def mk(jd, T, g):
    dv = round(g * G0 * T * 86400 / 1000, 3)   # km/s, thrust x burn time, both burns
    return TorchCand(jd, T, dv)

for g in (1.0, 0.3, 0.05, 0.01):
    first = date_to_jd(date(2026, 11, 15)); n = 3652
    t0 = time.perf_counter()
    days = [(first + i, free_T("earth", "mars", first + i, g)) for i in range(n + 1)]
    dt = time.perf_counter() - t0
    best = min(days, key=lambda x: x[1]); f = days[0]
    soon = min(days, key=lambda x: x[0] + x[1])
    print(f"g={g}: first day T={f[1]:.3f} d, best day {best[0]-first:.0f} d out (T={best[1]:.3f} d); T_first/T_best={f[1]/best[1]:.3f}; "
          f"earliest-arrival is day offset {soon[0]-first:.0f}; scan {dt:.1f}s for {n+1} days")
    pool = [mk(first, f[1], g), mk(best[0], best[1], g)]
    lab = _labelled(pool, "min_delta_v")
    print("   pool of two ->", [(round(o.depart_jd - first), l) for o, l in lab], "cap", MAX_EXTRA)
    lab = _labelled(pool[:1], "min_delta_v")
    print("   pool of one ->", [(round(o.depart_jd - first), l) for o, l in lab])
