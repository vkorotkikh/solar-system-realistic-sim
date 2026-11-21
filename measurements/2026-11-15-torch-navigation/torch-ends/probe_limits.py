import sys, time, math
sys.path.insert(0, "<session-dir>/nav-lab/torch-ends")
from ends_reference import _escape_nd
for a in (1e-1,1e-2,1e-3,1e-4,1e-5,1e-6,1e-7):
    t0=time.time(); t,y=_escape_nd(a); print(a, a*t, 1-a*t, "r_end=%.4g"%math.hypot(y[0],y[1]), "t=%.5g"%t, "%.2fs"%(time.time()-t0), flush=True)
