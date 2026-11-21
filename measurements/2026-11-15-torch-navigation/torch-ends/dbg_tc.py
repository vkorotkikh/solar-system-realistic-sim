import sys; sys.path.insert(0, "<session-dir>/nav-lab/torch-ends")
from t5_earth_moon import *
from scipy.optimize import NonlinearConstraint, Bounds, BFGS
K=int(sys.argv[1]); g=float(sys.argv[2])
if __name__=="__main__":
    a=g*G0_KM_S2
    with Pool(12) as pool:
        prob=Problem(a,K,pool); z0=guess(g,K); n=len(z0)
        lo=np.array([0.2,-np.inf,0.15]+[-np.inf]*(n-3)); hi=np.array([3.0,np.inf,0.85]+[np.inf]*(n-3))
        nlc=NonlinearConstraint(prob.c,0,0,jac=prob.jac)
        t0=time.time()
        res=minimize(lambda z:z[0], z0, jac=lambda z:np.eye(n)[0], method="trust-constr", bounds=Bounds(lo,hi), constraints=[nlc], hess=BFGS(), options={"maxiter":400,"xtol":1e-12,"gtol":1e-9,"barrier_tol":1e-9,"verbose":0})
        print(res.message, res.nit, "T=%.2f"%(res.x[0]*Tn(a)), prob.c(res.x), "%.0fs"%(time.time()-t0))
