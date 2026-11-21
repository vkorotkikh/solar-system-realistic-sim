import sys,time,json; sys.path.insert(0,'.')
from belts_reference import *
cat=load_catalog()
T0=2461000.5
def best3(f,n=3):
    ts=[]
    for _ in range(n):
        t=time.perf_counter(); r=f(); ts.append(time.perf_counter()-t)
    return min(ts),r
rad=radial_course(T0,300.0,1.0,5.2,0.0)
ell=ellipse_course(T0,1.0,1.52,0.0); print("Hohmann tof days", ell.tof_days)
tor=radial_course(T0,5.0,2.5,5.5,0.0)
cases={"radial 1->5.2 AU, 300 d, M=151":(rad,300.0,151),
       "Hohmann 1->1.52 AU, %.1f d, M=150"%ell.tof_days:(ell,ell.tof_days,150),
       "torch-like radial 2.5->5.5 AU, 5 d, M=60":(tor,5.0,60)}
out={}
for name,(fn,days,M) in cases.items():
    ts=np.linspace(T0,T0+days,M); cs=fn(ts)
    t_full,res=best3(lambda: screen(cat,ts,cs))
    t_pre,res2=best3(lambda: screen(cat,ts,cs,radial_prefilter=True))
    d=res["dist_au"]
    same=np.allclose(np.sort(d)[:50],np.sort(res2["dist_au"])[:50])
    order=np.argsort(d)
    nn=order[:50]
    bf=brute_force_min(cat,nn,fn,T0,T0+days,n_fine=4000)
    err=np.abs(d[nn]-bf)*AU_KM
    nm=names(cat["id"][order[:5]])
    print(f"\n== {name}")
    print(f" screen all 100k: best3 {t_full*1e3:.0f} ms ; with radial prefilter: {t_pre*1e3:.0f} ms (top50 same: {same}); kept rows by prefilter n/a")
    print(f" 50 nearest vs brute force: max {err.max():,.0f} km median {np.median(err):,.0f} km; segment-wise {'>=' if (d[nn]-bf).mean()>0 else '<='} truth on average (mean signed {np.mean(d[nn]-bf)*AU_KM:,.0f} km)")
    for k in order[:5]:
        n=int(cat['id'][k])-SPK_ASTEROID_BASE
        print(f"  {d[k]*AU_KM:>14,.0f} km ({d[k]:.5f} AU) #{n} {nm[int(cat['id'][k])]} diam {cat['diam_km'][k]:.1f} km at t+{res['t_jd'][k]-T0:.1f} d")
    print(f" within 0.01 AU: {(d<0.01).sum()}  within 0.001 AU: {(d<0.001).sum()}  within 0.1 AU: {(d<0.1).sum()}")
    # sweep launch azimuth (every 10 deg) and 4 start epochs
    stats=[]
    for az in range(0,360,10):
        if name.startswith("radial"): f2=radial_course(T0,days,1.0,5.2,az)
        elif name.startswith("Hohmann"): f2=ellipse_course(T0,1.0,1.52,az)
        else: f2=radial_course(T0,days,2.5,5.5,az)
        r=screen(cat,ts,f2(ts),radial_prefilter=True)["dist_au"]
        stats.append((r.min(),(r<0.01).sum(),(r<0.001).sum()))
    s=np.array(stats)
    print(f" 36 azimuths: closest km min/median/max = {s[:,0].min()*AU_KM:,.0f} / {np.median(s[:,0])*AU_KM:,.0f} / {s[:,0].max()*AU_KM:,.0f}; n<0.01AU min/median/max = {int(s[:,1].min())}/{int(np.median(s[:,1]))}/{int(s[:,1].max())}; n<0.001AU = {int(s[:,2].min())}/{int(np.median(s[:,2]))}/{int(s[:,2].max())}")
