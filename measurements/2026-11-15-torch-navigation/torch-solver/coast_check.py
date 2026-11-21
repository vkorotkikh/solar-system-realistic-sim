"""Item 6 cross-check: impulsive Lambert dv(T) (repo's solve_lambert_universal) vs the torch coast curve."""
import json
from lab import *
from trajectory.lambert import solve_lambert_universal
jd=2461356.5
A,B=FN["earth"],FN["mars"]
rA,vA=A(jd)
def lam(T):
    best=None
    for pro in (True,False):
        s=solve_lambert_universal(rA,B(jd+T)[0],T,prograde=pro)
        if s is None: continue
        rB,vB=B(jd+T)
        dv=(np.linalg.norm(np.array(s["v1"])-vA)+np.linalg.norm(vB-np.array(s["v2"])))*AUD_MS/1e3
        if best is None or dv<best[0]: best=(dv,pro)
    return best
Ts=np.arange(60,620,20.0)
tab=[(T,)+lam(T) for T in Ts]
print("impulsive Lambert dv(T), earth->mars 2026-11-12 (km/s):")
for T,dv,pro in tab: print(f"  T={T:5.0f} d  dv={dv:7.3f}  {'pro' if pro else 'retro'}")
dvs=np.array([t[1] for t in tab]); i=int(np.argmin(dvs)); print("min impulsive dv %.3f km/s at T=%g d"%(dvs[i],Ts[i]))
C=json.load(open("coast_results.json"))
for g,rows in C.items():
    print("\n g=",g," torch coast curve vs impulsive Lambert at the same T:")
    for r in rows:
        if r["ok"] and r["dv_kms"]<400 and r["coast"]>0 and r["T"]<340:
            l=lam(r["T"])
            print(f"  T={r['T']:8.2f} d  torch dv={r['dv_kms']:8.3f}  lambert dv={l[0]:8.3f}  ratio {r['dv_kms']/l[0]:.4f}")
