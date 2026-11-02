"""H-2: analytic checks of backend/sim/pfss_magnetogram.py. Run from backend/:  python pfss_check.py"""
import math, sys, numpy as np
sys.path.insert(0, '.')
from sim import pfss_magnetogram as P
x = np.array([0.5])
L = P._associated_legendre(4, x)
exact = {0: 1.0, 1: 0.5, 2: (3*0.25-1)/2, 3: (5*0.125-3*0.5)/2, 4: (35*0.0625-30*0.25+3)/8}
for l in range(5):
    print(f"P{l}(0.5): module {float(L[(l,0)][0]):+.5f}  exact {exact[l]:+.5f}")
th = (np.arange(2000)+0.5)*np.pi/2000; Lg = P._associated_legendre(4, np.cos(th)); w = np.sin(th)*np.pi/2000
print("orthogonality matrix (off-diagonal must be 0):")
for l in range(5): print("  "+"  ".join(f"{float(np.sum(Lg[(l,0)]*Lg[(k,0)]*w)):+.4f}" for k in range(5)))
nlat, nlon = 180, 360
theta = (np.arange(nlat)+0.5)*np.pi/nlat          # uniform colatitude, as documented
for name, br in [("dipole", np.cos(theta)), ("quadrupole", (3*np.cos(theta)**2-1)/2)]:
    g, h = P.decompose_spherical_harmonics(br[:, None]*np.ones((1, nlon)), lmax=6)
    f = P.pfss_solve(g, h, 6, 2.5)
    print(name, "g_l0:", [round(float(g[l, 0]), 4) for l in range(5)])
    for t in (0.3, 0.9, 1.4):
        b1 = f.evaluate(1.0, t, 0.3)[0]; bs = f.evaluate(2.5, t, 0.3)[0]
        print(f"   theta={t}: Br(R)={b1:+.4f} (input {br[int(t/np.pi*nlat)]:+.4f})  Br(2.5)/Br(1)={bs/b1:.5f}")
print("analytic ratios: l=1 0.09302, l=2 0.04238")
