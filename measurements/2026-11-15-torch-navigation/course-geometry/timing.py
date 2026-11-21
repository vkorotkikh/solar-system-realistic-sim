import time, json
from course_reference import *
jd0 = JD_2026_01_01 + 818
def best(f, n=3):
    b = 1e9; r = None
    for _ in range(n):
        t = time.perf_counter(); r = f(); b = min(b, time.perf_counter() - t)
    return b * 1e3, r
out = {}
for g in (1.0, 0.3):
    out[f"free_space_course_ms_{g}"] = best(lambda: free_space_course("earth", "mars", jd0, g))[0]
    ms, b = best(lambda: solve_torch_trip("earth", "mars", jd0, g)); out[f"baseline_6x6_ms_{g}"] = ms; out[f"baseline_nfev_{g}"] = b["nfev"]
    for lat in ("z", "away", "away_dynamic"):
        ms, r = best(lambda: solve_torch_trip("earth", "mars", jd0, g, keepout_au=0.1, lateral=lat)); out[f"detour_{lat}_ms_{g}"] = ms; out[f"detour_{lat}_nfev_{g}"] = r["nfev"]
    ms, r = best(lambda: solve_torch_trip("earth", "mars", jd0, g, keepout_au=0.1, lateral="z", method="lm")); out[f"detour_z_lm_ms_{g}"] = ms; out[f"detour_z_lm_nfev_{g}"] = r["nfev"]
    ms, o = best(lambda: optimal_detour("earth", "mars", jd0, g, 0.1, K=8)); out[f"slsqp_K8_ms_{g}"] = ms
json.dump(out, open("timing.json", "w"), indent=1)
for k, v in out.items(): print(k, round(v, 1))
