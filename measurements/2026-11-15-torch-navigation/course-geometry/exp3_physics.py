"""Task 3 evidence: physics of a default keep-out radius, dwell time inside it, and the cost of waiting."""
import json
import numpy as np
from course_reference import *

SIGMA = 5.670374419e-8
S1 = 1361.0  # W/m^2 total solar irradiance at 1 AU (assumed: standard value, not fetched, no network)
out = {"physics": [], "dwell": [], "wait": []}
for R in (0.046, 0.05, 0.1, 0.2, 0.3):
    flux = 1 / R**2
    gsun = MU_SUN_KM3_S2 / (R * AU_KM) ** 2 * 1000  # m/s^2
    out["physics"].append(dict(R=R, flux_ratio=flux, flux_kw_m2=S1 * flux / 1000,
        gravity_ms2=gsun, gravity_g=gsun / G0,
        t_sphere_K=278.6 / R**0.5 * (S1 / 1361) ** 0.25 * 1.0, t_plate_K=(S1 * flux / SIGMA) ** 0.25,
        v_circ_kms=np.sqrt(MU_SUN_KM3_S2 / (R * AU_KM)), v_esc_kms=np.sqrt(2 * MU_SUN_KM3_S2 / (R * AU_KM)),
        r_sun_radii=R * AU_KM / 695700.0))
# sphere T: T = (S (1-A) / (4 sigma))^(1/4) for A=0 -> 278.6 K at 1 AU; recompute exactly
for p in out["physics"]:
    p["t_sphere_K"] = (S1 * p["flux_ratio"] / (4 * SIGMA)) ** 0.25
daily = json.load(open("exp1_daily.json"))
PAIRS = [("earth","mars"),("earth","venus"),("earth","mercury"),("earth","jupiter"),("earth","saturn"),("mars","ceres")]
for a_id, b_id in PAIRS:
    for a_g in (1.0, 0.3):
        a = g_to_au_day2(a_g)
        hrs = {R: [] for R in (0.1, 0.2, 0.3)}
        dm = np.array(daily[f"{a_id}-{b_id}-{a_g}"]["dmin"])
        for k in np.nonzero(dm < 0.3)[0]:
            p0, p1, _, _ = free_space_course(a_id, b_id, JD_2026_01_01 + int(k), a_g)
            for R in hrs:
                if dm[k] < R:
                    hrs[R].append(hours_inside(p0, p1, a, R))
        for R, v in hrs.items():
            if v:
                out["dwell"].append(dict(pair=f"{a_id}-{b_id}", a_g=a_g, R=R, n=len(v), median_h=float(np.median(v)),
                                         p90_h=float(np.percentile(v, 90)), max_h=float(np.max(v)), mean_h=float(np.mean(v))))
    # waiting cost (1 g): days to the next clear departure from each blocked day
    dm = np.array(daily[f"{a_id}-{b_id}-1.0"]["dmin"])
    for R in (0.1, 0.2, 0.3):
        blocked = dm < R
        waits = []
        n = len(dm)
        for k in np.nonzero(blocked)[0]:
            j = k
            while j < n and blocked[j]:
                j += 1
            if j < n:
                waits.append(j - k)
        if waits:
            out["wait"].append(dict(pair=f"{a_id}-{b_id}", R=R, n=len(waits), mean_days=float(np.mean(waits)),
                                    median_days=float(np.median(waits)), max_days=int(max(waits))))
# a dead-centre pass: earth at 1 AU, mars on the far side at 1.52 AU, 1 g
a = g_to_au_day2(1.0)
p0, p1 = np.array([-1.0, 0, 0]), np.array([1.52, 0, 0])
out["dead_centre_earth_mars_1g"] = {str(R): hours_inside(p0, p1, a, R) for R in (0.05, 0.1, 0.2, 0.3)}
out["dead_centre_trip_days"] = 2 * np.sqrt(2.52 / a)
out["dead_centre_peak_speed_kms"] = float(np.sqrt(a * 2.52) * AU_KM / DAY_S)
json.dump(out, open("exp3_physics.json", "w"), indent=1)
for p in out["physics"]: print({k: round(v, 3) for k, v in p.items()})
for d in out["dwell"]: print(d)
for d in out["wait"]: print(d)
print(out["dead_centre_earth_mars_1g"], out["dead_centre_trip_days"], out["dead_centre_peak_speed_kms"])
