import numpy as np
from course_reference import *
for dayoff in (818, 800, 835, 1611, 1600):
  jd0 = JD_2026_01_01 + dayoff
  for a_g in (1.0, 0.3):
    base = solve_torch_trip("earth","mars",jd0,a_g)
    out=[]
    for lat in ("z","away","away_dynamic"):
        r = solve_torch_trip("earth","mars",jd0,a_g,keepout_au=0.1, lateral=lat)
        out.append(f"{lat}: ok={r['converged']} it={r['iterations']} dT={(r['T_days']-base['T_days'])*24:.3f}h phi={np.degrees(r['x'][6]):.1f}deg")
    print(dayoff,a_g,f"base rmin={base['min_sun_au']:.4f}", " | ".join(out))
