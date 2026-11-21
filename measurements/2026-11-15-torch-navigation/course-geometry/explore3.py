import time, numpy as np
from course_reference import *
for dayoff in (818, 800, 835):
  jd0 = JD_2026_01_01 + dayoff
  for a_g in (1.0, 0.3):
    base = solve_torch_trip("earth","mars",jd0,a_g)
    print(dayoff, a_g, "baseline T", base["T_days"], "rmin", base["min_sun_au"])
    for lat in ("z","away"):
        t=time.time()
        r = solve_torch_trip("earth","mars",jd0,a_g,keepout_au=0.1, lateral=lat)       # from the simple guess, phi0=0.2
        c = solve_torch_trip("earth","mars",jd0,a_g,keepout_au=0.1, lateral=lat, x0=np.concatenate([base["x"],[0.2]]))
        print("  ",lat,"scratch:",r["converged"],r["iterations"],"dT d",r["T_days"]-base["T_days"],"phi",r["x"][6],"| from baseline:",c["converged"],c["iterations"],"dT",c["T_days"]-base["T_days"], round(time.time()-t,2),"s")
    t=time.time(); o = optimal_detour("earth","mars",jd0,a_g,0.1,K=8, x_start=base["x"])
    print("   optimal K=8:", o["converged"], o["nit"], o["status"], "dT d", o["T_days"]-base["T_days"], "rmin",o["min_sun_au"], "res",o["residual"], round(time.time()-t,1),"s")
