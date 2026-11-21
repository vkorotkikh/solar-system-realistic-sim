"""Task 1: dv/vc and t against a/g0 for thrust along velocity from a circular orbit to E = 0."""
import sys, math, json
sys.path.insert(0, "<session-dir>/nav-lab/torch-ends")
import numpy as np
from multiprocessing import Pool
from ends_reference import _escape_nd, SQRT2_M1

def one(x):
    t, y = _escape_nd(x)
    return x, x * t, t, math.hypot(y[0], y[1]), math.hypot(y[2], y[3])

if __name__ == "__main__":
    xs = [10 ** (k / 3) for k in range(-9, 10)]            # 1e-3 .. 1e3, 3 per decade
    tiny = [1e-4, 1e-5, 1e-6]
    big = [1e4, 1e5, 1e6]
    with Pool(6) as p:
        rows = p.map(one, tiny[::-1] + xs + big, chunksize=1)
    rows.sort()
    json.dump(rows, open(sys.path[0] + "/t1_circular_table.json", "w"))
    print("a/g0        dv/vc     t/sqrt(r^3/mu)  r_end/r0   v_end/vc   (dv/vc-(sqrt2-1))*a/g0")
    for x, dv, t, r, v in rows:
        print("%-10.4g  %.6f  %-14.6g  %-9.4g  %-9.4g  %s" % (x, dv, t, r, v, "%.4f" % ((dv - SQRT2_M1) * x) if x >= 10 else ""))
    # low-thrust extrapolation: dv = L - c x^(1/4) + d x^(1/2) using x = 1e-3 .. 1e-6
    sel = [(x, dv) for x, dv, *_ in rows if x in (1e-3, 1e-4, 1e-5, 1e-6)]
    A = np.array([[1.0, -x ** 0.25, x ** 0.5] for x, _ in sel]); b = np.array([dv for _, dv in sel])
    sol = np.linalg.lstsq(A, b, rcond=None)[0]
    print("fit on 1e-3..1e-6: L=%.5f c=%.5f d=%.5f ; residual max %.2e" % (*sol, np.abs(A @ sol - b).max()))
    # two-parameter fit c with L fixed to 1: from 1e-5, 1e-6
    for x, dv in sel:
        print("x=%.0e  (1-dv)/x^0.25 = %.5f" % (x, (1 - dv) / x ** 0.25))
