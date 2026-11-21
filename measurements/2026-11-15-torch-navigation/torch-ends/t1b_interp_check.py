"""How well does a 3-points-per-decade table of dv/vc(a/g0) (PCHIP in log10 x) reproduce the integrator?"""
import sys, json, math
sys.path.insert(0, "<session-dir>/nav-lab/torch-ends")
import numpy as np
from scipy.interpolate import PchipInterpolator
from ends_reference import _escape_nd
rows = [r for r in json.load(open(sys.path[0] + "/t1_circular_table.json")) if 1e-3 <= r[0] <= 1e3]
f = PchipInterpolator(np.log10([r[0] for r in rows]), [r[1] for r in rows])
errs = []
for k in range(-21, 22):
    x = 10 ** (k / 7 + 0.03)
    if not 1e-3 <= x <= 1e3: continue
    t, _ = _escape_nd(x); errs.append((x, f(np.log10(x)) - x * t))
worst = max(errs, key=lambda e: abs(e[1]))
print("max |error| of dv/vc over %d test points: %.2e at a/g0=%.3g (dv/vc = %.4f)" % (len(errs), abs(worst[1]), worst[0], worst[0] * _escape_nd(worst[0])[0]))
print("relative worst: %.2e" % max(abs(e) / (x * _escape_nd(x)[0]) for x, e in errs))
