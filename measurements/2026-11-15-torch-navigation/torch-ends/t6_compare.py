"""Earth-Mars (planar circular-orbit model): continuous optimum vs Sun-only and the patched sum; verification of each full solution."""
import sys, json, math, os
sys.path.insert(0, "<session-dir>/nav-lab/torch-ends")
from t6_earth_mars import *
D_ = sys.path[0]
sun = {}
for f in ("t6_earth_mars_sun_1g.json", "t6_earth_mars_sun_lad.json"):
    for r in json.load(open(D_ + "/" + f)): sun[r["a_g"]] = r
full = {}
for f in ("t6_earth_mars_full_1g_b.json", "t6_full_0p3_unscaled_try.json", "t6_earth_mars_full_0p3.json", "t6_earth_mars_full_0p1.json"):
    if os.path.exists(D_ + "/" + f):
        for r in json.load(open(D_ + "/" + f)): full[r["a_g"]] = r
vE, vM = math.sqrt(MU_E / R0), math.sqrt(MU_MA / RT)
print("a[g] | truth dv, T | sun-only dv, T | patched dv (sun+esc+cap) | truth-vs: sun-only, patched (%) | verify: max|c| @rtol1e-12, min Earth km, min Mars km, sense")
out = []
for g in sorted(full, reverse=True):
    a = g * G0_KM_S2; f = full[g]; s = sun[g]
    e = escape_cost(MU_E, R0, R0, a); c_ = escape_cost(MU_MA, RT, RT, a)
    patched = s["dv"] + e[0] + c_[0]
    z = np.array(f["z"]); K = f["K"]
    if not f.get("scaled"): z[2] *= PSI_S      # older records stored the Mars phase unscaled
    rrel, vrel, (s1, s2, k1, k2) = simulate(z, a, K, "full", rtol=1e-12, dense=True)
    cc = cons(z, a, K, "full")
    T = f["T"]; mins = [1e99, 1e99]
    for t in np.concatenate([np.linspace(0, k1[-1], 6000), np.linspace(k1[-1], T, 6000)]):
        sol = s1 if t <= k1[-1] else s2
        x, y = sol.sol(t)[:2]
        ex, ey = RE * math.cos(NE * t), RE * math.sin(NE * t)
        mx, my = RM * math.cos(f["psi"] + NM * t), RM * math.sin(f["psi"] + NM * t)
        mins[0] = min(mins[0], math.hypot(x, y)); mins[1] = min(mins[1], math.hypot(ex + x - mx, ey + y - my))
    sense = "prograde" if rrel[0] * vrel[1] - rrel[1] * vrel[0] > 0 else "retrograde"
    print("%-5g | %.3f, %.0f s | %.3f, %.0f s | %.3f | %+.3f%%, %+.3f%% | %.1e, %.0f, %.0f, %s" % (
        g, f["dv"], T, s["dv"], s["T"], patched, 100 * (s["dv"] / f["dv"] - 1), 100 * (patched / f["dv"] - 1), np.abs(cc).max(), mins[0], mins[1], sense))
    out.append(dict(a_g=g, truth_dv=f["dv"], truth_T=T, sun_dv=s["dv"], sun_T=s["T"], esc=e, cap=c_, patched_dv=patched, maxc=float(np.abs(cc).max()),
                    min_earth=mins[0], min_mars=mins[1], sense=sense))
json.dump(out, open(D_ + "/t6_compare.json", "w"), indent=1)
