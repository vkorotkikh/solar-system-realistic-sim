"""Representative torch paths (NOT solved trips: pursuit steering + flip when stopping distance reaches target).
Used only to size a sampled path: how many points keep a smooth line."""
import sys, json, math, time
import numpy as np
from scipy.integrate import solve_ivp
sys.path.insert(0,"<session-dir>/wt-c1/backend")
from data.bodies import ALL_BODIES
from mission.orbital import sample_body_state_from_elements
BY={b["id"]:b for b in ALL_BODIES}
AU=149597870.7; G0=9.80665
MU=1.32712440018e11*86400**2/AU**3        # AU^3/day^2
def st(i,jd):
    s=sample_body_state_from_elements(BY[i],jd); return np.array(s["position"]),np.array(s["velocity"])
def run(a_g,A,B,jd0=2461356.5):
    a=a_g*G0*86400**2/(AU*1000)            # AU/day^2
    pA,vA=st(A,jd0); pB,_=st(B,jd0)
    D=np.linalg.norm(pB-pA); T=2*math.sqrt(D/a)  # days, flat bang-bang estimate
    pT,_=st(B,jd0+T)
    flipped=[None]
    def f(t,y):
        p,v=y[:3],y[3:]; r=np.linalg.norm(p)
        pb,vb=st(B,jd0+t)
        if t<T/2: u=(pT-p); u/=np.linalg.norm(u)
        else:
            dv=v-vb; n=np.linalg.norm(dv); u=-dv/n if n>0 else np.zeros(3)
        return np.r_[v, -MU*p/r**3 + a*u]
    def ev(t,y):   # relative speed below 2e-3 AU/day (3.5 km/s) after the flip
        return (np.linalg.norm(y[3:]-st(B,jd0+t)[1])-2e-3) if t>T/2 else 1.0
    ev.terminal=True; ev.direction=-1
    sol=solve_ivp(f,[0,3*T],np.r_[pA,vA],method="DOP853",rtol=1e-9,atol=1e-12,dense_output=True,
                  events=ev, max_step=T/200)
    tend=sol.t[-1]
    return jd0,T,tend,sol
def err_polyline(P,Q):   # max distance of dense points Q to polyline P
    A=P[:-1][None]; Bv=P[1:][None]; q=Q[:,None]; ab=Bv-A
    t=np.clip(((q-A)*ab).sum(-1)/np.maximum((ab*ab).sum(-1),1e-30),0,1)
    d=np.linalg.norm(q-(A+t[...,None]*ab),axis=-1); return d.min(1).max()
def hermite(ts,P,V,Q_t):
    out=np.empty((len(Q_t),3))
    idx=np.clip(np.searchsorted(ts,Q_t)-1,0,len(ts)-2)
    for k,(i,t) in enumerate(zip(idx,Q_t)):
        h=ts[i+1]-ts[i]; s=(t-ts[i])/h
        h00=2*s**3-3*s**2+1;h10=s**3-2*s**2+s;h01=-2*s**3+3*s**2;h11=s**3-s**2
        out[k]=h00*P[i]+h10*h*V[i]+h01*P[i+1]+h11*h*V[i+1]
    return out
if __name__=="__main__":
    cases=[(0.01,"earth","mars"),(0.1,"earth","mars"),(1,"earth","mars"),(10,"earth","mars"),
           (0.01,"earth","jupiter"),(0.01,"earth","neptune"),(0.1,"mercury","neptune"),(1,"earth","venus"),(0.01,"mars","earth"),(0.01,"venus","mercury")]
    rows=[]
    for a_g,A,B in cases:
        jd0,T,tend,sol=run(a_g,A,B)
        tq=np.linspace(0,tend,20001); Y=sol.sol(tq); Q=Y[:3].T; V=Y[3:].T
        ext=np.linalg.norm(Q.max(0)-Q.min(0)); path=np.linalg.norm(np.diff(Q,axis=0),axis=1).sum()
        # turning angle (sum of heading change)
        d=np.diff(Q,axis=0); d/=np.linalg.norm(d,axis=1)[:,None]; turn=np.degrees(np.arccos(np.clip((d[1:]*d[:-1]).sum(1),-1,1)).sum())
        rmin=np.linalg.norm(Q,axis=1).min()
        res={"a_g":a_g,"A":A,"B":B,"days":round(tend,2),"extent_AU":round(ext,4),"pathlen_AU":round(path,4),"turn_deg":round(turn,1),"rmin_AU":round(rmin,3)}
        # polyline: uniform arc length (N points) and uniform time
        cum=np.r_[0,np.cumsum(np.linalg.norm(np.diff(Q,axis=0),axis=1))]
        for N in (31,91,181,361):
            ta=np.interp(np.linspace(0,cum[-1],N),cum,tq); Pa=sol.sol(ta)[:3].T
            Pt=sol.sol(np.linspace(0,tend,N))[:3].T
            tsH=ta; PH=sol.sol(tsH); 
            res[f"poly_arc_{N}_relerr"]=err_polyline(Pa,Q[::10])/ext
            res[f"poly_time_{N}_relerr"]=err_polyline(Pt,Q[::10])/ext
        for N in (11,21,31):
            ta=np.interp(np.linspace(0,cum[-1],N),cum,tq); PH=sol.sol(ta)
            H=hermite(ta,PH[:3].T,PH[3:].T,tq[::10]); res[f"hermite_arc_{N}_relerr"]=float(np.linalg.norm(H-Q[::10],axis=1).max()/ext)
        rows.append(res); print(json.dumps({k:(round(v,6) if isinstance(v,float) else v) for k,v in res.items()}),flush=True)
    json.dump(rows,open("torch_sampling.json","w"),indent=1)
