"""L-1: hyperbolic Lambert coverage vs tolerance. Run from backend/."""
import sys, math; sys.path.insert(0, '.')
from trajectory.lambert import solve_lambert_universal as S
MU = 0.0002959122082855911; r2 = [1.5*math.cos(math.radians(60)), 1.5*math.sin(math.radians(60)), 0.0]
for tof in (60, 40, 30, 20, 10, 5):
    print(tof, ["none" if not (s := S([1, 0, 0], r2, tof, mu=MU, tol_days=t)) else f"{s['rootResidualDays']*86400:.1e}s" for t in (1e-4, 1e-6, 1e-8, 1e-10)])
