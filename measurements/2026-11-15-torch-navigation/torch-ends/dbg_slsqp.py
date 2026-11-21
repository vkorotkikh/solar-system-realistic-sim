import sys; sys.path.insert(0, "<session-dir>/nav-lab/torch-ends")
from t5_earth_moon import *
K=int(sys.argv[1]); g=float(sys.argv[2])
if __name__=="__main__":
    a=g*G0_KM_S2
    with Pool(12) as pool:
        prob=Problem(a,K,pool); z0=guess(g,K); n=len(z0)
        bounds=[(0.2,3.0),(None,None),(0.15,0.85)]+[(None,None)]*(n-3)
        it=[0]
        def cb(z):
            it[0]+=1
            if it[0]%10==0: print(it[0], "T=%.1f"%(z[0]*Tn(a)), "c=", prob.c(z), flush=True)
        print("c0", prob.c(z0))
        res=minimize(lambda z:z[0], z0, jac=lambda z:np.eye(n)[0], method="SLSQP", bounds=bounds, constraints=[{"type":"eq","fun":prob.c,"jac":prob.jac}], callback=cb, options={"maxiter":120,"ftol":1e-10})
        print(res.message, res.nit, res.x[0]*Tn(a), prob.c(res.x))
