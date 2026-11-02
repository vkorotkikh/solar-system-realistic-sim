import sys,math,os,json,inspect
sys.path.insert(0,os.environ["SP"]+"/wt/backend")
import numpy as np
from trajectory import lambert as L
MU=0.0002959122082855911; AU=149597870.7; DAY=86400.0
print("solve_lambert_universal signature:", inspect.signature(L.solve_lambert_universal))
def stumpff(z):
    if z>1e-8: s=math.sqrt(z); return (1-math.cos(s))/z,(s-math.sin(s))/s**3
    if z<-1e-8: s=math.sqrt(-z); return (math.cosh(s)-1)/(-z),(math.sinh(s)-s)/s**3
    return 0.5,1/6
def kprop(r0,v0,dt,mu=MU):   # independent universal-variable propagator (Vallado Alg. 8), Laguerre-free Newton
    r0=np.array(r0,float);v0=np.array(v0,float); r0m=np.linalg.norm(r0); vr=r0@v0/r0m; al=2/r0m-(v0@v0)/mu
    chi=math.sqrt(mu)*abs(al)*dt if al>1e-9 else math.sqrt(mu)*dt/r0m
    for _ in range(500):
        z=al*chi*chi; C,S=stumpff(z)
        r=chi*chi*C+r0m*vr/math.sqrt(mu)*chi*(1-z*S)+r0m*(1-z*C)
        F=r0m*vr/math.sqrt(mu)*chi*chi*C+(1-al*r0m)*chi**3*S+r0m*chi-math.sqrt(mu)*dt
        d=F/r; chi-=d
        if abs(d)<1e-14*max(1,abs(chi)): break
    z=al*chi*chi; C,S=stumpff(z); f=1-chi*chi/r0m*C; g=dt-chi**3/math.sqrt(mu)*S
    rv=f*r0+g*v0; return rv
cases=[]
def add(n,r1,r2,tof,pro=True): cases.append((n,r1,r2,tof,pro))
th=lambda d,rr:[rr*math.cos(math.radians(d)),rr*math.sin(math.radians(d)),0.0]
add("short-way 110deg",[1,0,0],th(110,1.524),200)
add("long-way 250deg (prograde)",[1,0,0],th(250,1.524),400)
add("same geometry, retrograde",[1,0,0],th(110,1.524),200,False)
add("near-collinear 0.5deg",[1,0,0],th(0.5,1.3),150)
add("near-collinear 179.5deg",[1,0,0],th(179.5,1.524),259)
add("exact 180deg",[1,0,0],th(180,1.524),259)
add("3-D, 60deg incl",[1,0,0],[0.5,0.6,0.9],180)
add("hyperbolic (fast, 20 d, 1->1.5AU)",[1,0,0],th(60,1.5),20)
add("very long 3000 d",[1,0,0],th(200,5.2),3000)
add("TOF too short 0.5 d",[1,0,0],th(90,1.524),0.5)
add("multi-rev candidate: TOF 900 d, 90deg",[1,0,0],th(90,1.1),900)
out=[]
print(f"\n{'case':38s}{'status':>8s}{'closure km':>13s}{'resid s':>11s}{'|v1| km/s':>11s}{'angle':>8s}")
for n,r1,r2,tof,pro in cases:
    try: s=L.solve_lambert_universal(r1,r2,tof,mu=MU,prograde=pro)
    except Exception as e: print(f"{n:38s}{'EXC':>8s}  {type(e).__name__}: {e}"); out.append(dict(case=n,status='exception',err=str(e))); continue
    if not s: print(f"{n:38s}{'none':>8s}"); out.append(dict(case=n,status='no_solution')); continue
    rf=kprop(r1,s['v1'],tof); clo=np.linalg.norm(rf-np.array(r2))*AU
    print(f"{n:38s}{'ok':>8s}{clo:13.3f}{s['rootResidualDays']*DAY:11.4f}{np.linalg.norm(s['v1'])*AU/DAY:11.4f}{s['transferAngleDeg']:8.1f}")
    out.append(dict(case=n,status='ok',closureKm=clo,residS=s['rootResidualDays']*DAY,revs=s['revolutions'],angle=s['transferAngleDeg'],bracketed=s['rootBracketed']))
json.dump(out,open(os.environ["SP"]+"/out/lambert_cases.json","w"),indent=1)
# tolerance sweep: what closure does the declared tol_days buy?
print("\nsolver tolerance tol_days -> max closure over the ok cases above")
for tol in (1e-4,1e-6,1e-8):
    w=0
    for n,r1,r2,tof,pro in cases:
        s=L.solve_lambert_universal(r1,r2,tof,mu=MU,prograde=pro,tol_days=tol)
        if s: w=max(w,np.linalg.norm(kprop(r1,s['v1'],tof)-np.array(r2))*AU)
    print(f"   tol_days={tol:g}  worst closure {w:.4f} km")
