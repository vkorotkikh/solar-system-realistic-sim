import sys,time; sys.path.insert(0,'.')
from belts_reference import *
cat=load_catalog(); T0=2461000.5
def best3(f,n=3):
    ts=[]
    for _ in range(n):
        t=time.perf_counter(); r=f(); ts.append(time.perf_counter()-t)
    return min(ts),r
ell=ellipse_course(T0,1.0,1.52,0.0)
cases={"radial 300d M=151":(radial_course(T0,300,1.0,5.2,0),300.0,151,0.1),
       "Hohmann 258.3d M=150":(ell,ell.tof_days,150,0.5),
       "torch 5d M=60":(radial_course(T0,5,2.5,5.5,0),5.0,60,0.1)}
for nm,(fn,days,M,keep) in cases.items():
    ts=np.linspace(T0,T0+days,M); cs=fn(ts)
    tf,full=best3(lambda: screen(cat,ts,cs))
    tq,fast=best3(lambda: screen_fast(cat,ts,cs,keep_au=keep))
    tp,pre=best3(lambda: screen(cat,ts,cs,radial_prefilter=True))
    ok=np.array_equal(np.nonzero(fast['dist_au']<keep)[0],np.nonzero(full['dist_au']<keep)[0]) and np.allclose(fast['dist_au'][full['dist_au']<keep],full['dist_au'][full['dist_au']<keep],atol=1e-12)
    okp=np.array_equal(np.nonzero(pre['dist_au']<0.5)[0],np.nonzero(full['dist_au']<0.5)[0])
    print(f"{nm}: full {tf*1e3:.0f} ms | screen_fast(keep {keep}) {tq*1e3:.0f} ms (stage2 rows {fast['n_stage2']}, pad {fast['pad_au']*AU_KM:,.0f} km, identical<keep: {ok}) | radial_prefilter {tp*1e3:.0f} ms (identical<0.5AU: {okp})")
