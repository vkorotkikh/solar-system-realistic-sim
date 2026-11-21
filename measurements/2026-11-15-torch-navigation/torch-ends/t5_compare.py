"""Compare the optimised Earth-Moon trajectories with the patched sum and the straight-line flip-and-burn; verify each."""
import sys, json, math
sys.path.insert(0, "<session-dir>/nav-lab/torch-ends")
import numpy as np
from t5_earth_moon import *
tag = sys.argv[1]
res = json.load(open(sys.path[0] + "/t5_earth_moon_%s.json" % tag))
print("%-6s %-9s %-9s | %-9s %-9s | %-9s %-9s %-9s | %-8s %-8s | verify: max|c| (rtol1e-12) minEarth minMoon dir" % (
    "a[g]", "T s", "dv km/s", "straight", "dv", "patched", "dv", "T s", "truth/patch", "truth/str"))
rows = []
for r in res:
    a = r["a_g"] * G0_KM_S2
    z = np.array(r["z"]); K = r["K"]
    Tl = 2 * math.sqrt(D / a); dvl = a * Tl
    dve, te = escape_cost(MU_E, R0, R0, a); dvc, tc = escape_cost(MU_M, RT, RT, a)
    dvp, Tp = dve + dvl + dvc, te + Tl + tc
    rrel, vrel, (s1, s2, k1, k2) = simulate(z, a, K, dense=True, rtol=1e-12)
    c = np.array([(np.hypot(*rrel) - RT) / RT, (rrel @ vrel) / (RT * VC_T), (vrel @ vrel - VC_T ** 2) / VC_T ** 2])
    T = r["T"]
    ts = np.concatenate([np.linspace(0, k1[-1], 4000), np.linspace(k1[-1], T, 4000)])
    mins = [1e99, 1e99]
    for t in ts:
        s = s1 if t <= k1[-1] else s2
        x, y = s.sol(t)[:2]
        th = N_MOON * t
        mins[0] = min(mins[0], math.hypot(x, y)); mins[1] = min(mins[1], math.hypot(x - D * math.cos(th), y - D * math.sin(th)))
    direction = "prograde" if rrel[0] * vrel[1] - rrel[1] * vrel[0] > 0 else "retrograde"
    print("%-6g %-9.1f %-9.3f | %-9.1f %-9.3f | %-9.3f %-9.3f %-9.1f | %-8.4f %-8.4f | %.1e  %.0f km  %.0f km  %s" % (
        r["a_g"], T, a * T, Tl, dvl, dvp, dvp, Tp, a * T / dvp, a * T / dvl, np.abs(c).max(), mins[0], mins[1], direction))
    rows.append(dict(a_g=r["a_g"], T=T, dv=a * T, T_line=Tl, dv_line=dvl, esc_E=(dve, te), cap_M=(dvc, tc), dv_patched=dvp, T_patched=Tp,
                     verify_maxc=float(np.abs(c).max()), min_earth_km=mins[0], min_moon_km=mins[1], direction=direction, p=r["p"], phi0=r["phi0"]))
json.dump(rows, open(sys.path[0] + "/t5_compare_%s.json" % tag, "w"), indent=1)
