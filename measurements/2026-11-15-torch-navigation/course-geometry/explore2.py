import time, numpy as np
from course_reference import *
jd0 = JD_2026_01_01 + 818
for a_g in (1.0, 0.3):
    t=time.time()
    base = solve_torch_trip("earth","mars",jd0,a_g)
    print(a_g, "baseline", base["converged"], base["iterations"], base["nfev"], base["T_days"], "rmin", base["min_sun_au"], "res", base["residual"], "t",time.time()-t)
    p0,p1,T0,_ = free_space_course("earth","mars",jd0,a_g); print(" free-space T",T0, "dmin", segment_sun_distance(p0,p1))
    x6 = base["x"]
    for phi0 in (0.05,0.1,0.2,0.3,0.5):
        t=time.time()
        r = solve_torch_trip("earth","mars",jd0,a_g,keepout_au=0.1, x0=np.concatenate([x6,[phi0]]))
        print("  phi0",phi0,"newton",r["converged"],r["iterations"],"T",r["T_days"],"phi",r["x"][6],"rmin",r["min_sun_au"],"res",r["residual"],"t",round(time.time()-t,2))
