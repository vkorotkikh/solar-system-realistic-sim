"""Existing scan on Mercury, Venus (5-day flight-time step) and Uranus, Neptune, Pluto (10-year flight cap)."""
import sys, time, math
sys.path.insert(0, '.')
from astropy.time import Time
from data.bodies import ALL_BODIES
from trajectory import run_porkchop_scan
from mission.propulsion import circular_parking_burn_km_s
G = 6.674e-20; BY = {b["id"]: b for b in ALL_BODIES}; START = 2461356.5
day = lambda jd: Time(jd, format="jd").iso[:10]
def search(to_id, tof_lo, tof_hi, tof_step, years=10, dep_step=10.0):
    n_tof = int((tof_hi - tof_lo) / tof_step) + 1
    chunk = max(dep_step, math.floor(1900 / n_tof) * dep_step)
    best, solves, errs, t0, s = None, 0, set(), time.perf_counter(), START
    while s < START + years * 365.25 - 1:
        e = min(s + chunk, START + years * 365.25)
        try:
            r = run_porkchop_scan(ALL_BODIES, from_id="earth", to_id=to_id, departure_start_jd=s, departure_end_jd=e, departure_step_days=dep_step, tof_min_days=tof_lo, tof_max_days=tof_hi, tof_step_days=tof_step)
            solves += int(r.get("evaluatedCount") or 0)
            if r.get("best") and (best is None or r["best"]["totalDeltaVKmS"] < best["totalDeltaVKmS"]): best = r["best"]
        except Exception as exc:
            errs.add(f"{type(exc).__name__}: {str(exc)[:90]}")
        s = e
    return best, solves, time.perf_counter() - t0, sorted(errs)
for to_id, lo, hi, step, alt in (("mercury", 60, 160, 5, 400), ("venus", 80, 220, 5, 400), ("uranus", 2000, 3650, 66, None), ("neptune", 2000, 3650, 66, None), ("pluto", 2000, 3650, 66, None)):
    b, solves, secs, errs = search(to_id, lo, hi, step)
    if b:
        extra = ""
        if alt:
            dep = circular_parking_burn_km_s(b["deltaVDepartureKmS"], G * BY["earth"]["mass_kg"], BY["earth"]["radius_km"] + 200)
            arr = circular_parking_burn_km_s(b["deltaVArrivalKmS"], G * BY[to_id]["mass_kg"], BY[to_id]["radius_km"] + alt)
            extra = f" | burns 200 km Earth orbit to {alt} km orbit {dep:.2f}+{arr:.2f}={dep + arr:.2f}"
        print(f"{to_id:8s} leave {day(b['departureJd'])} arrive {day(b['arrivalJd'])} {b['tofDays']:.0f} d v-inf {b['deltaVDepartureKmS']:.2f}+{b['deltaVArrivalKmS']:.2f}={b['totalDeltaVKmS']:.2f}{extra} ({solves} solves, {secs:.1f} s) {errs[:1]}")
    else:
        print(f"{to_id:8s} NO RESULT {errs[:2]}")
